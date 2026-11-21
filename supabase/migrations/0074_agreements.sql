-- =============================================================================
-- Agorbis · 0074 · Acuerdos entre comunidades (D118)
-- -----------------------------------------------------------------------------
-- Promovida desde 02-DOCS/wiki/sdd/drafts/ con autorización explícita del
-- responsable el 09-11-2026 ("adelante con la migración"), tras pasar su test
-- (supabase/tests/agreements_checks.sql, 62 aserciones y control negativo) en
-- la base local. Spec y plan: 02-DOCS/wiki/sdd/{specs,plans}/acuerdos-entre-comunidades.md.
--
-- Qué hace. Un acuerdo es un texto de compromiso que una o varias comunidades
-- votan por separado y que existe sólo si todas lo aprueban. Cada ronda es una
-- encuesta binaria común (D68 entero: recibo sin elección, tallies privados,
-- resultados al cierre con 5 participantes o más) ligada por polls.agreement_id
-- y escondida de los listados de encuestas. El estado final no se guarda: se
-- deriva en lectura desde los tallies, como ya cierran las encuestas.
--
-- Escrituras sólo por RPC `security definer`: la base decide (invariante 1).
-- Autoría de las encuestas: quien completó la última adhesión, porque
-- `guard_core_content_insert` exige author_id = auth.uid(). Esas encuestas no
-- consumen la cuota mensual de contenido; el acuerdo tiene cuota propia.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.agreements (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  body                  text not null,
  proposer_id           uuid references public.profiles (id) on delete set null,
  proposer_community_id uuid not null references public.communities (id) on delete restrict,
  duration_days         smallint not null,
  status                text not null default 'proposed',
  created_at            timestamptz not null default now(),
  opened_at             timestamptz,
  closes_at             timestamptz,
  withdrawn_at          timestamptz,
  constraint agreements_title_len_chk check (char_length(title) between 10 and 160),
  constraint agreements_body_len_chk check (char_length(body) between 50 and 5000),
  constraint agreements_duration_chk check (duration_days between 7 and 30),
  constraint agreements_status_chk check (status in ('proposed', 'voting', 'withdrawn')),
  -- Los estados finales (aprobado, rechazado, sin quórum, sin adhesión) no se
  -- guardan: se derivan en lectura. Lo guardado sólo dice si se abrió o se retiró.
  constraint agreements_voting_dates_chk check (
    (status = 'voting') = (opened_at is not null and closes_at is not null)
  ),
  constraint agreements_withdrawn_chk check ((status = 'withdrawn') = (withdrawn_at is not null))
);

comment on table public.agreements is
  'Compromiso que una o varias comunidades votan por separado (D118). El estado final se deriva de las encuestas ligadas.';

create index agreements_proposer_idx on public.agreements (proposer_id, status);

create table public.agreement_parties (
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete restrict,
  adhered_by   uuid references public.profiles (id) on delete set null,
  adhered_at   timestamptz,
  poll_id      uuid unique references public.polls (id) on delete set null,
  primary key (agreement_id, community_id),
  -- Una baja de cuenta deja adhered_by en null; la adhesión sigue valiendo.
  constraint agreement_parties_adhesion_chk check (adhered_by is null or adhered_at is not null)
);

comment on table public.agreement_parties is
  'Comunidades de un acuerdo: quién la adhirió y qué encuesta vota su ronda.';

create index agreement_parties_community_idx
  on public.agreement_parties (community_id, agreement_id);

alter table public.polls
  add column agreement_id uuid references public.agreements (id) on delete cascade;

comment on column public.polls.agreement_id is
  'Si no es null, la encuesta es la ronda de una comunidad en un acuerdo y no se lista como encuesta común.';

create index polls_agreement_idx on public.polls (agreement_id)
  where agreement_id is not null;

-- -----------------------------------------------------------------------------
-- RLS: lectura pública, ninguna escritura directa (todo pasa por las RPC).
-- -----------------------------------------------------------------------------
alter table public.agreements enable row level security;
alter table public.agreement_parties enable row level security;

create policy agreements_select_all on public.agreements
  for select to anon, authenticated using (true);
create policy agreement_parties_select_all on public.agreement_parties
  for select to anon, authenticated using (true);

-- En la nube una tabla nueva puede heredar DML por las ACL por defecto de
-- supabase_admin (0031): se revoca todo antes de conceder sólo lectura, para
-- que "nadie escribe directo" no dependa de la RLS sola.
revoke all on public.agreements, public.agreement_parties from public, anon, authenticated;
grant select on public.agreements, public.agreement_parties to anon, authenticated;
grant select, insert, update, delete on public.agreements, public.agreement_parties
  to service_role;

-- Gate legal (D70/D73): proponer y adherir exigen los documentos vigentes.
create trigger aa_participation_gate before insert or update on public.agreements
  for each row execute function private.guard_participation();
create trigger aa_participation_gate before insert or update on public.agreement_parties
  for each row execute function private.guard_participation();

-- -----------------------------------------------------------------------------
-- Cuota: las encuestas de un acuerdo no consumen la cuota mensual de encuestas.
-- La cuota del acuerdo es propia (3 propuestas abiertas por persona, abajo).
-- Cuerpo igual al vigente salvo la salida temprana y el search_path explícito.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_content_quota()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions', 'pg_temp'
as $$
declare
  v_type      text;
  v_level     smallint;
  v_remaining int;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Ronda de un acuerdo (D118): la abre adhere_agreement en nombre de quien
  -- adhirió último; su cuota es la del acuerdo, no la de encuestas.
  -- Sólo si existe la parte que la espera: una fila con agreement_id
  -- inventado no se salta la cuota.
  if tg_table_name = 'polls' and (to_jsonb(new) ->> 'agreement_id') is not null then
    if exists (
      select 1 from public.agreement_parties ap
      where ap.agreement_id = (to_jsonb(new) ->> 'agreement_id')::uuid
        and ap.community_id = (to_jsonb(new) ->> 'community_id')::uuid
        and ap.poll_id is null
    ) then
      return new;
    end if;
    raise exception 'AGORBIS_AGREEMENT_ROUND_WITHOUT_PARTY' using errcode = 'insufficient_privilege';
  end if;

  v_type := case tg_table_name
    when 'polls'    then 'poll'
    when 'debates'  then 'debate'
    when 'claims'   then 'claim'
    when 'projects' then 'project'
  end;

  if new.author_id is null then
    raise exception 'GEOUNITY_QUOTA: el contenido necesita un autor'
      using errcode = 'check_violation';
  end if;

  select level into v_level from public.communities where id = new.community_id;

  perform pg_advisory_xact_lock(hashtext(concat_ws(
    ':',
    new.author_id::text,
    v_level::text,
    v_type,
    to_char(now() at time zone 'UTC', 'YYYY-MM')
  )));

  v_remaining := public.quota_remaining(new.author_id, v_level, v_type);

  if v_remaining is not null and v_remaining <= 0 then
    raise exception 'GEOUNITY_QUOTA_EXCEEDED: sin cupo de % en el nivel %', v_type, v_level
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Elegibilidad: nivel 3 a 5, mismo país (tercer segmento del path), sin
-- contenerse. Se usa en propose_agreement; la app la repite sólo para avisar.
-- -----------------------------------------------------------------------------
create or replace function private.assert_agreement_parties(p_communities uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer := coalesce(cardinality(p_communities), 0);
  v_countries integer;
  v_found integer;
begin
  if v_count < 1 or v_count > 5 then
    raise exception 'AGORBIS_AGREEMENT_PARTY_COUNT' using errcode = 'check_violation';
  end if;
  select count(*) into v_found from public.communities c where c.id = any (p_communities);
  if v_found <> v_count then
    raise exception 'AGORBIS_AGREEMENT_UNKNOWN_COMMUNITY' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.communities c
    where c.id = any (p_communities) and c.level not between 3 and 5
  ) then
    raise exception 'AGORBIS_AGREEMENT_INELIGIBLE_LEVEL' using errcode = 'check_violation';
  end if;
  select count(distinct split_part(c.path, '.', 3)) into v_countries
  from public.communities c where c.id = any (p_communities);
  if v_countries <> 1 then
    raise exception 'AGORBIS_AGREEMENT_MIXED_COUNTRIES' using errcode = 'check_violation';
  end if;
  if exists (
    select 1
    from public.communities a
    join public.communities b on b.id <> a.id and b.path like a.path || '.%'
    where a.id = any (p_communities) and b.id = any (p_communities)
  ) then
    raise exception 'AGORBIS_AGREEMENT_NESTED_COMMUNITIES' using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function private.assert_agreement_parties(uuid[]) from public;

-- -----------------------------------------------------------------------------
-- propose_agreement
-- -----------------------------------------------------------------------------
create or replace function public.propose_agreement(
  p_title text,
  p_body text,
  p_communities uuid[],
  p_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_home uuid;
  v_set uuid[];
  v_agreement uuid;
  v_pending integer;
begin
  perform private.assert_can_participate(v_user);

  select p.home_community_id into v_home from public.profiles p where p.id = v_user;
  if v_home is null then
    raise exception 'AGORBIS_AGREEMENT_RESIDENCE_REQUIRED' using errcode = 'insufficient_privilege';
  end if;

  -- La comunidad de la proponente participa siempre; el resto sin repetidos.
  select array_agg(distinct c) into v_set
  from unnest(coalesce(p_communities, '{}'::uuid[]) || v_home) as c;

  perform private.assert_agreement_parties(v_set);

  if p_duration_days is null or p_duration_days < 7 or p_duration_days > 30 then
    raise exception 'AGORBIS_AGREEMENT_DURATION' using errcode = 'check_violation';
  end if;

  -- Cuota propia: 3 propuestas esperando adhesión por persona.
  perform pg_advisory_xact_lock(hashtext('agreements:' || v_user::text));
  select count(*) into v_pending
  from public.agreements a
  where a.proposer_id = v_user
    and a.status = 'proposed'
    and a.created_at + interval '30 days' > now();
  if v_pending >= 3 then
    raise exception 'AGORBIS_AGREEMENT_TOO_MANY_PENDING' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.agreements (title, body, proposer_id, proposer_community_id, duration_days)
  values (btrim(p_title), btrim(p_body), v_user, v_home, p_duration_days)
  returning id into v_agreement;

  insert into public.agreement_parties (agreement_id, community_id)
  select v_agreement, c from unnest(v_set) as c;

  return v_agreement;
end;
$$;

grant execute on function public.propose_agreement(text, text, uuid[], integer) to authenticated;

-- -----------------------------------------------------------------------------
-- adhere_agreement: adhiere la comunidad de quien llama; con la última
-- adhesión abre todas las rondas en la misma transacción.
-- -----------------------------------------------------------------------------
create or replace function public.adhere_agreement(p_agreement uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_agreement public.agreements%rowtype;
  v_party public.agreement_parties%rowtype;
  v_opened timestamptz;
  v_closes timestamptz;
  v_poll uuid;
  v_row record;
begin
  perform private.assert_can_participate(v_user);

  select * into v_agreement from public.agreements a where a.id = p_agreement for update;
  if not found then
    raise exception 'AGORBIS_AGREEMENT_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if v_agreement.status <> 'proposed' then
    raise exception 'AGORBIS_AGREEMENT_NOT_PROPOSED' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_agreement.created_at + interval '30 days' <= now() then
    raise exception 'AGORBIS_AGREEMENT_LAPSED' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_agreement.proposer_id = v_user then
    raise exception 'AGORBIS_AGREEMENT_PROPOSER_CANNOT_ADHERE' using errcode = 'insufficient_privilege';
  end if;

  -- Las partes no se contienen entre sí, así que una persona pertenece a lo
  -- sumo a una.
  select * into v_party
  from public.agreement_parties ap
  where ap.agreement_id = p_agreement
    and private.raw_is_member(v_user, ap.community_id)
  limit 1;
  if not found then
    raise exception 'AGORBIS_AGREEMENT_NOT_A_MEMBER' using errcode = 'insufficient_privilege';
  end if;
  if v_party.adhered_at is not null then
    raise exception 'AGORBIS_AGREEMENT_ALREADY_ADHERED' using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.agreement_parties
  set adhered_by = v_user, adhered_at = now()
  where agreement_id = p_agreement and community_id = v_party.community_id;

  if exists (
    select 1 from public.agreement_parties ap
    where ap.agreement_id = p_agreement and ap.adhered_at is null
  ) then
    return p_agreement;
  end if;

  -- Última adhesión: se abren todas las rondas a la vez, con el mismo cierre
  -- calculado ahora (spec #2 y #8). Autora: quien completó la adhesión.
  v_opened := now();
  v_closes := v_opened + make_interval(days => v_agreement.duration_days);

  for v_row in
    select ap.community_id from public.agreement_parties ap
    where ap.agreement_id = p_agreement
  loop
    insert into public.polls (
      community_id, author_id, question, description, type, category,
      max_choices, results_visibility, closes_at, agreement_id
    ) values (
      v_row.community_id, v_user, v_agreement.title, null, 'binary', 'comunidad',
      null, 'after_close', v_closes, p_agreement
    ) returning id into v_poll;

    insert into public.poll_options (poll_id, label, sort_order)
    values (v_poll, 'Sí', 0), (v_poll, 'No', 1);

    update public.agreement_parties
    set poll_id = v_poll
    where agreement_id = p_agreement and community_id = v_row.community_id;
  end loop;

  update public.agreements
  set status = 'voting', opened_at = v_opened, closes_at = v_closes
  where id = p_agreement;

  return p_agreement;
end;
$$;

grant execute on function public.adhere_agreement(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- withdraw_agreement: sólo la proponente, sólo mientras no se abrió.
-- -----------------------------------------------------------------------------
create or replace function public.withdraw_agreement(p_agreement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_agreement public.agreements%rowtype;
begin
  perform private.assert_can_participate(v_user);
  select * into v_agreement from public.agreements a where a.id = p_agreement for update;
  if not found then
    raise exception 'AGORBIS_AGREEMENT_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if v_agreement.proposer_id is distinct from v_user then
    raise exception 'AGORBIS_AGREEMENT_NOT_PROPOSER' using errcode = 'insufficient_privilege';
  end if;
  if v_agreement.status <> 'proposed' then
    raise exception 'AGORBIS_AGREEMENT_NOT_PROPOSED' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_agreement.created_at + interval '30 days' <= now() then
    raise exception 'AGORBIS_AGREEMENT_LAPSED' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.agreements
  set status = 'withdrawn', withdrawn_at = now()
  where id = p_agreement;
end;
$$;

grant execute on function public.withdraw_agreement(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Estado derivado. Por parte: 'pending' mientras la ronda está abierta;
-- después 'no_quorum' (< 5 participantes), 'approved' (sí > no) o 'rejected'.
-- Los tallies son privados y sólo se leen con la ronda cerrada (D68).
-- -----------------------------------------------------------------------------
create or replace function private.agreement_party_outcome(p_poll uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with poll as (
    select p.closes_at, p.status from public.polls p where p.id = p_poll
  ), tallies as (
    select
      coalesce(max(t.participants), 0) as participants,
      coalesce(sum(case when o.sort_order = 0 then t.votes end), 0) as yes_votes,
      coalesce(sum(case when o.sort_order = 1 then t.votes end), 0) as no_votes
    from private.poll_option_tallies t
    join public.poll_options o on o.id = t.option_id
    where t.poll_id = p_poll
  )
  -- Una ronda removida por moderación no aprueba nada; una cerrada por
  -- moderación antes de la fecha se evalúa como cerrada. Sin fila de
  -- encuesta (borrada) tampoco hay de dónde derivar: sin quórum.
  select coalesce((
    select case
      when poll.status = 'removed' then 'no_quorum'
      when poll.status = 'active' and (poll.closes_at is null or poll.closes_at > now()) then 'pending'
      when tallies.participants < 5 then 'no_quorum'
      when tallies.yes_votes > tallies.no_votes then 'approved'
      else 'rejected'
    end
    from poll cross join tallies
  ), 'no_quorum');
$$;

revoke all on function private.agreement_party_outcome(uuid) from public;

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

revoke all on function private.agreement_derived_status(uuid) from public;

-- -----------------------------------------------------------------------------
-- agreement_state: todo lo que la página necesita, en un solo objeto.
-- -----------------------------------------------------------------------------
create or replace function public.agreement_state(p_agreement uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select * from public.agreements where id = p_agreement
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

grant execute on function public.agreement_state(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- community_agreements: la sección "Acuerdos" de la pestaña Encuestas.
-- -----------------------------------------------------------------------------
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
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

grant execute on function public.community_agreements(uuid, integer) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Las rondas de un acuerdo no son encuestas comunes: poll_feed las excluye.
-- Cuerpo idéntico al vigente salvo el filtro.
-- -----------------------------------------------------------------------------
create or replace function public.poll_feed(
  p_community uuid,
  p_limit integer default 20,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_category text default null
)
returns table (
  id uuid, question text, description text, type text, category text, status text,
  closes_at timestamptz, created_at timestamptz, option_count bigint,
  total_votes bigint, has_voted boolean, can_see boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.question, p.description, p.type, p.category, p.status,
    p.closes_at, p.created_at,
    (select count(*) from public.poll_options o where o.poll_id = p.id),
    case when public.can_see_poll_results(p.id) then
      coalesce((
        select sum(t.votes)
        from private.poll_option_tallies t
        where t.poll_id = p.id
      ), 0)
    else 0 end,
    (
      auth.uid() is not null and exists (
        select 1 from public.poll_participation_receipts r
        where r.poll_id = p.id and r.user_id = auth.uid()
      )
    ),
    public.can_see_poll_results(p.id)
  from public.polls p
  where p.community_id = p_community
    and p.agreement_id is null
    and (p.status <> 'removed' or private.session_is_moderator(auth.uid()))
    and (p_category is null or p.category = p_category)
    and (
      p_before_created is null
      or (p.created_at, p.id) < (
        p_before_created,
        coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- -----------------------------------------------------------------------------
-- personalized_feed: las rondas salen de la unión de encuestas y entra el
-- acuerdo como kind 'agreement' (una vez, por la parte más cercana a la
-- persona). engagement = comunidades adheridas; nunca votos.
-- -----------------------------------------------------------------------------
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
    where a.status <> 'withdrawn'
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
-- Candado de las rondas. La autora técnica de cada ronda es quien completó la
-- última adhesión, y la policy de polls deja a la autora cerrar o remover sus
-- encuestas: sin esto una sola persona cerraba la votación de todas las
-- comunidades. Sólo moderación cambia el estado de una ronda.
-- -----------------------------------------------------------------------------
create or replace function private.guard_agreement_round_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.agreement_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  -- Sin sesión (jobs, seed, dueña) o dentro de otra función que ya decidió.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if private.session_is_moderator(auth.uid()) then
    return new;
  end if;
  raise exception 'AGORBIS_AGREEMENT_ROUND_LOCKED' using errcode = 'insufficient_privilege';
end;
$$;
revoke all on function private.guard_agreement_round_status() from public;

create trigger aa_agreement_round_lock before update of status on public.polls
  for each row execute function private.guard_agreement_round_status();

-- -----------------------------------------------------------------------------
-- Cuota mensual de encuestas: las rondas no la consumen tampoco al contarla.
-- Cuerpo igual al de 0039 salvo el filtro por agreement_id (null en las demás
-- tablas, porque to_jsonb no tiene esa clave).
-- -----------------------------------------------------------------------------
create or replace function public.quota_remaining(
  p_user uuid,
  p_level smallint,
  p_content_type text
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_table text; v_limit integer; v_used integer;
begin
  if p_user is null then return 0; end if;
  if private.session_is_moderator(p_user) then return null; end if;

  v_table := case p_content_type
    when 'poll' then 'polls'
    when 'debate' then 'debates'
    when 'claim' then 'claims'
    when 'project' then 'projects'
  end;
  if v_table is null then
    raise exception 'Tipo de contenido desconocido: %', p_content_type;
  end if;

  select q.monthly_limit into v_limit
  from public.content_quotas q
  where q.level = p_level and q.content_type = p_content_type;
  if v_limit is null then return null; end if;

  execute format($query$
    select count(*)
    from public.%I t
    join public.communities c on c.id = t.community_id
    where t.author_id = $1
      and c.level = $2
      and t.created_at >= date_trunc('month', now())
      and t.created_at < date_trunc('month', now()) + interval '1 month'
      and (to_jsonb(t) ->> 'agreement_id') is null
      and (
        t.status <> 'removed'
        or (t.removed_by = t.author_id
          and t.removed_at > t.created_at + interval '24 hours')
      )
  $query$, v_table)
  into v_used using p_user, p_level;
  return greatest(0, v_limit - v_used);
end;
$$;

-- -----------------------------------------------------------------------------
-- La sobrecarga de cuatro argumentos (0037/0047, conservada para el Worker
-- previo) pasa a delegar en la de seis: así tampoco lista las rondas como
-- encuestas. Misma firma y mismas ACL.
-- -----------------------------------------------------------------------------
create or replace function public.personalized_feed(
  p_user uuid,
  p_limit integer default 40,
  p_before_created timestamptz default null,
  p_before_id uuid default null
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
security invoker
set search_path = ''
as $$
  select * from public.personalized_feed(p_user, p_limit, p_before_created, p_before_id, null, null);
$$;

-- Índices de las claves foráneas que la baja de cuenta (set null) y el borrado
-- de una comunidad (restrict) recorren.
create index agreements_proposer_community_idx on public.agreements (proposer_community_id);
create index agreement_parties_adhered_by_idx on public.agreement_parties (adhered_by)
  where adhered_by is not null;

commit;
