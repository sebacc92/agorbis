-- 0075 · Moderación de acuerdos (D120).
--
-- D118 dejó los acuerdos fuera del circuito de moderación: no se podían
-- reportar ni bajar. Acá entran en el mismo circuito que encuestas, debates,
-- reclamos y proyectos: `reports` acepta `agreement`, moderación con MFA
-- oculta y restaura por RPC (la tabla sigue sin escritura directa), lo
-- removido deja de verse para quien no modera y queda rastro en
-- `moderation_audit_log`. Las rondas ligadas se ocultan y reponen con el
-- acuerdo: nadie vota en algo dado de baja.

begin;

-- -----------------------------------------------------------------------------
-- Columnas y checks. El estado previo se guarda para restaurar exactamente lo
-- que había; los checks de fechas se relajan sólo para 'removed', porque un
-- acuerdo en votación conserva sus fechas mientras está oculto.
-- -----------------------------------------------------------------------------
alter table public.agreements
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles (id) on delete set null,
  add column status_before_removal text;

alter table public.agreements drop constraint agreements_status_chk;
alter table public.agreements add constraint agreements_status_chk
  check (status in ('proposed', 'voting', 'withdrawn', 'removed'));

alter table public.agreements drop constraint agreements_voting_dates_chk;
alter table public.agreements add constraint agreements_voting_dates_chk check (
  status = 'removed'
  or ((status = 'voting') = (opened_at is not null and closes_at is not null))
);

alter table public.agreements drop constraint agreements_withdrawn_chk;
alter table public.agreements add constraint agreements_withdrawn_chk check (
  status = 'removed'
  or ((status = 'withdrawn') = (withdrawn_at is not null))
);

alter table public.agreements add constraint agreements_removed_chk check (
  (status = 'removed') = (removed_at is not null and status_before_removal is not null)
);
alter table public.agreements add constraint agreements_removed_from_chk check (
  status_before_removal is null
  or status_before_removal in ('proposed', 'voting', 'withdrawn')
);

comment on column public.agreements.status_before_removal is
  'Estado que tenía el acuerdo cuando moderación lo ocultó; restaurar vuelve exactamente a él (D120).';

-- -----------------------------------------------------------------------------
-- Lectura: lo removido sólo lo ve moderación, como en polls (0004). Las
-- partes siguen la suerte del acuerdo.
-- -----------------------------------------------------------------------------
drop policy agreements_select_all on public.agreements;
create policy agreements_select_visible on public.agreements
  for select to anon, authenticated
  using (status <> 'removed' or public.is_moderator(auth.uid()));

drop policy agreement_parties_select_all on public.agreement_parties;
create policy agreement_parties_select_visible on public.agreement_parties
  for select to anon, authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id
      and (a.status <> 'removed' or public.is_moderator(auth.uid()))
  ));

-- -----------------------------------------------------------------------------
-- Reportar un acuerdo.
-- -----------------------------------------------------------------------------
alter table public.reports drop constraint reports_target_type_chk;
alter table public.reports add constraint reports_target_type_chk check (
  target_type in ('debate_comment', 'claim', 'project', 'poll', 'debate', 'agreement')
);

-- Un acuerdo existe para reportar mientras no esté removido (guard_report_insert),
-- y su autoría es quien lo propuso (can_manage_content).
create or replace function private.raw_content_exists(p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_type
    when 'poll' then exists (
      select 1 from public.polls p where p.id = p_id and p.status <> 'removed')
    when 'debate' then exists (
      select 1 from public.debates d where d.id = p_id and d.status <> 'removed')
    when 'claim' then exists (
      select 1 from public.claims c where c.id = p_id and c.status <> 'removed')
    when 'project' then exists (
      select 1 from public.projects p where p.id = p_id and p.status <> 'removed')
    when 'agreement' then exists (
      select 1 from public.agreements a where a.id = p_id and a.status <> 'removed')
    else false
  end;
end;
$$;

create or replace function private.raw_content_author(p_type text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  case p_type
    when 'poll' then
      select p.author_id into v_author from public.polls p where p.id = p_id;
    when 'debate' then
      select d.author_id into v_author from public.debates d where d.id = p_id;
    when 'claim' then
      select c.author_id into v_author from public.claims c where c.id = p_id;
    when 'project' then
      select p.author_id into v_author from public.projects p where p.id = p_id;
    when 'agreement' then
      select a.proposer_id into v_author from public.agreements a where a.id = p_id;
    else
      v_author := null;
  end case;
  return v_author;
end;
$$;

-- -----------------------------------------------------------------------------
-- Estado derivado, ficha, listados e inicio: lo removido pesa más que todo y
-- no aparece en ningún listado. Cuerpos iguales a 0074 salvo el filtro.
-- -----------------------------------------------------------------------------
create or replace function private.agreement_derived_status(p_agreement uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select * from public.agreements where id = p_agreement
  ), outcomes as (
    select private.agreement_party_outcome(ap.poll_id) as outcome
    from public.agreement_parties ap
    where ap.agreement_id = p_agreement and ap.poll_id is not null
  )
  select case
    -- Dado de baja por moderación: pesa más que cualquier otra lectura.
    when a.status = 'removed' then 'removed'
    when a.status = 'withdrawn' then 'withdrawn'
    when a.status = 'proposed' and a.created_at + interval '30 days' <= now() then 'lapsed'
    when a.status = 'proposed' then 'proposed'
    -- Una parte sin ronda (una encuesta borrada dejó poll_id en null) no
    -- permite derivar "aprobado": el acuerdo queda en votación, nunca
    -- aprueba solo.
    when exists (
      select 1 from public.agreement_parties ap
      where ap.agreement_id = p_agreement and ap.poll_id is null
    ) then 'voting'
    when not exists (select 1 from outcomes) then 'voting'
    when exists (select 1 from outcomes o where o.outcome = 'pending') then 'voting'
    when exists (select 1 from outcomes o where o.outcome = 'rejected') then 'rejected'
    when exists (select 1 from outcomes o where o.outcome = 'no_quorum') then 'no_quorum'
    else 'approved'
  end
  from a;
$$;

create or replace function public.agreement_state(p_agreement uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    -- Removido: sólo lo ve moderación (misma regla que la policy de lectura).
    select * from public.agreements
    where id = p_agreement
      and (status <> 'removed' or private.session_is_moderator(auth.uid()))
  ), viewer as (
    select
      auth.uid() as user_id,
      (select ap.community_id
       from public.agreement_parties ap
       where ap.agreement_id = p_agreement
         and auth.uid() is not null
         and private.raw_is_member(auth.uid(), ap.community_id)
       limit 1) as party_community_id
  ), parties as (
    select jsonb_agg(jsonb_build_object(
      'community_id', ap.community_id,
      'slug', c.slug,
      'name', c.name,
      'emoji', c.emoji,
      'level', c.level,
      'adhered_at', ap.adhered_at,
      'poll_id', ap.poll_id,
      'outcome', case when ap.poll_id is null then null
                      else private.agreement_party_outcome(ap.poll_id) end,
      -- Participantes sólo cuando la encuesta ya puede mostrar resultados
      -- (cerrada y con quórum): nunca un conteo durante la ronda (D68).
      'participants', case
        when ap.poll_id is not null and public.can_see_poll_results(ap.poll_id) then
          (select max(t.participants) from private.poll_option_tallies t where t.poll_id = ap.poll_id)
        else null end
    ) order by c.level, c.name) as parties
    from public.agreement_parties ap
    join public.communities c on c.id = ap.community_id
    where ap.agreement_id = p_agreement
  )
  select jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'body', a.body,
    'status', a.status,
    'status_derived', private.agreement_derived_status(a.id),
    'proposer_id', a.proposer_id,
    'proposer_community', (
      select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'emoji', c.emoji)
      from public.communities c where c.id = a.proposer_community_id
    ),
    'duration_days', a.duration_days,
    'created_at', a.created_at,
    'opened_at', a.opened_at,
    'closes_at', a.closes_at,
    'withdrawn_at', a.withdrawn_at,
    'parties', coalesce(parties.parties, '[]'::jsonb),
    'viewer', jsonb_build_object(
      'party_community_id', viewer.party_community_id,
      'can_adhere', viewer.user_id is not null
        and a.status = 'proposed'
        and a.created_at + interval '30 days' > now()
        and a.proposer_id is distinct from viewer.user_id
        and exists (
          select 1 from public.agreement_parties ap
          where ap.agreement_id = a.id
            and ap.community_id = viewer.party_community_id
            and ap.adhered_at is null
        ),
      -- `is not distinct from`: con la cuenta de quien propuso borrada
      -- (proposer_id null) la igualdad daría null y el jsonb traería
      -- `null` en lugar de un booleano. Y una propuesta vencida ya no se
      -- retira: está "sin adhesión", no hay nada que retirar.
      'can_withdraw', viewer.user_id is not null
        and a.status = 'proposed'
        and a.created_at + interval '30 days' > now()
        and a.proposer_id is not distinct from viewer.user_id,
      'has_receipt', exists (
        select 1
        from public.agreement_parties ap
        join public.poll_participation_receipts r on r.poll_id = ap.poll_id
        where ap.agreement_id = a.id and r.user_id = viewer.user_id
      ),
      'can_vote', viewer.user_id is not null
        and a.status = 'voting'
        and a.closes_at > now()
        and viewer.party_community_id is not null
        and exists (
          select 1 from public.agreement_parties ap
          join public.polls p on p.id = ap.poll_id
          where ap.agreement_id = a.id
            and ap.community_id = viewer.party_community_id
            and p.status = 'active'
        )
        and not exists (
          select 1
          from public.agreement_parties ap
          join public.poll_participation_receipts r on r.poll_id = ap.poll_id
          where ap.agreement_id = a.id and r.user_id = viewer.user_id
        )
    )
  )
  from a cross join viewer cross join parties;
$$;

create or replace function public.community_agreements(p_community uuid, p_limit integer default 10)
returns table (
  id uuid,
  title text,
  status_derived text,
  created_at timestamptz,
  closes_at timestamptz,
  party_count bigint,
  adhered_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id, a.title, private.agreement_derived_status(a.id), a.created_at, a.closes_at,
    (select count(*) from public.agreement_parties x where x.agreement_id = a.id),
    (select count(*) from public.agreement_parties x where x.agreement_id = a.id and x.adhered_at is not null)
  from public.agreements a
  join public.agreement_parties ap on ap.agreement_id = a.id
  where ap.community_id = p_community
    and a.status <> 'removed'
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

create or replace function public.personalized_feed(
  p_user uuid,
  p_limit integer,
  p_before_created timestamptz,
  p_before_id uuid,
  p_community_slug text,
  p_kind text
)
returns table (
  id uuid,
  kind text,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  title text,
  summary text,
  status text,
  engagement numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with home as (
    select c.path
    from public.profiles p
    join public.communities c on c.id = p.home_community_id
    where p.id = p_user and p_user = auth.uid()
  ), chain as (
    select c.*
    from public.communities c, home h
    where (h.path = c.path or h.path like c.path || '.%')
      and (p_community_slug is null or c.slug = p_community_slug)
  ), agreements_in_chain as (
    select distinct on (a.id)
      a.id, c.id as community_id, c.slug, c.name, c.emoji, a.title, a.body,
      a.created_at
    from public.agreements a
    join public.agreement_parties ap on ap.agreement_id = a.id
    join chain c on c.id = ap.community_id
    where a.status not in ('withdrawn', 'removed')
      -- Una propuesta vencida ("sin adhesión") no es novedad: sale del inicio.
      and not (a.status = 'proposed' and a.created_at + interval '30 days' <= now())
    order by a.id, c.level desc
  ), feed as (
    select
      p.id, 'poll'::text kind, c.id community_id, c.slug, c.name, c.emoji,
      p.question title, p.description summary,
      case when p.status = 'active' and p.closes_at <= statement_timestamp()
        then 'closed' else p.status end status,
      (case when public.can_see_poll_results(p.id) then
        (select coalesce(max(t.participants), 0)
         from private.poll_option_tallies t
         where t.poll_id = p.id)
       else 0 end)::numeric engagement,
      p.created_at
    from public.polls p
    join chain c on c.id = p.community_id
    where p.status <> 'removed' and p.agreement_id is null
      and (p_kind is null or p_kind = 'poll')
    union all
    select
      d.id, 'debate', c.id, c.slug, c.name, c.emoji, d.title,
      left(d.body, 300), d.status,
      (select count(*) from public.debate_comments dc
       where dc.debate_id = d.id and dc.status = 'visible')::numeric,
      d.created_at
    from public.debates d
    join chain c on c.id = d.community_id
    where d.status <> 'removed' and (p_kind is null or p_kind = 'debate')
    union all
    select
      cl.id, 'claim', c.id, c.slug, c.name, c.emoji, cl.title,
      left(cl.description, 300), cl.status, cl.support_count::numeric,
      cl.created_at
    from public.claims cl
    join chain c on c.id = cl.community_id
    where cl.status <> 'removed' and (p_kind is null or p_kind = 'claim')
    union all
    select
      pr.id, 'project', c.id, c.slug, c.name, c.emoji, pr.title, pr.summary,
      pr.status,
      ((select count(*) from public.project_contributions pc where pc.project_id = pr.id)
       + (select count(*) from public.project_pledges pp where pp.project_id = pr.id))::numeric,
      pr.created_at
    from public.projects pr
    join chain c on c.id = pr.community_id
    where pr.status <> 'removed' and (p_kind is null or p_kind = 'project')
    union all
    select
      g.id, 'agreement', g.community_id, g.slug, g.name, g.emoji, g.title,
      left(g.body, 300), private.agreement_derived_status(g.id),
      (select count(*) from public.agreement_parties x
       where x.agreement_id = g.id and x.adhered_at is not null)::numeric,
      g.created_at
    from agreements_in_chain g
    where (p_kind is null or p_kind = 'agreement')
  )
  select
    f.id, f.kind, f.community_id, f.slug, f.name, f.emoji, f.title,
    f.summary, f.status, f.engagement, f.created_at
  from feed f
  where p_before_created is null
    or (f.created_at, f.id) < (
      p_before_created,
      coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
  order by f.created_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

-- -----------------------------------------------------------------------------
-- moderate_agreement: ocultar o restaurar. Sólo moderación con MFA (la misma
-- regla que session_is_moderator aplica en el resto). Idempotente: ocultar lo
-- oculto o restaurar lo visible no hace nada. Las rondas se ocultan con el
-- acuerdo y vuelven con él; la fecha de cierre sigue mandando en la lectura.
-- -----------------------------------------------------------------------------
create or replace function public.moderate_agreement(p_agreement uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_agreement public.agreements%rowtype;
  v_restored text;
begin
  if v_user is null or not private.session_is_moderator(v_user) then
    raise exception 'AGORBIS_AGREEMENT_MODERATOR_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  perform private.assert_can_participate(v_user);
  if p_action not in ('hide', 'restore') then
    raise exception 'AGORBIS_AGREEMENT_UNKNOWN_ACTION' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_agreement from public.agreements a where a.id = p_agreement for update;
  if not found then
    raise exception 'AGORBIS_AGREEMENT_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if p_action = 'hide' then
    if v_agreement.status = 'removed' then
      return;
    end if;
    update public.agreements
    set status = 'removed',
        removed_at = now(),
        removed_by = v_user,
        status_before_removal = v_agreement.status
    where id = p_agreement;
    update public.polls
    set status = 'removed'
    where agreement_id = p_agreement and status <> 'removed';
    insert into public.moderation_audit_log (moderator_id, action, target_type, target_id, metadata)
    values (v_user, 'hide', 'agreements', p_agreement,
      jsonb_build_object('status_before', v_agreement.status, 'status_after', 'removed'));
    return;
  end if;

  if v_agreement.status <> 'removed' then
    return;
  end if;
  v_restored := v_agreement.status_before_removal;
  update public.agreements
  set status = v_restored,
      removed_at = null,
      removed_by = null,
      status_before_removal = null
  where id = p_agreement;
  -- Vuelven sólo las rondas que este ocultamiento removió (una ronda que
  -- moderación había removido antes sigue removida). Vuelven 'active': la
  -- lectura ya trata una ronda con fecha vencida como cerrada, y pasar a
  -- 'closed' dispararía avisos de cierre que nadie pidió.
  update public.polls
  set status = 'active'
  where agreement_id = p_agreement
    and status = 'removed'
    and removed_at >= v_agreement.removed_at;
  insert into public.moderation_audit_log (moderator_id, action, target_type, target_id, metadata)
  values (v_user, 'restore', 'agreements', p_agreement,
    jsonb_build_object('status_before', 'removed', 'status_after', v_restored));
end;
$$;

revoke all on function public.moderate_agreement(uuid, text) from public;
grant execute on function public.moderate_agreement(uuid, text) to authenticated;

commit;
