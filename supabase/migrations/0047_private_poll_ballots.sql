-- =============================================================================
-- Agorbis · 0047 · Tallies de voto y pertenencia privada por defecto
-- -----------------------------------------------------------------------------
-- Una fila que contiene a la vez user_id y option_id no es un voto secreto.
-- Separar recibo y boleta tampoco alcanza: dos filas creadas en la misma
-- transacción comparten `xmin` y un operador podría volver a ligarlas. Esta
-- migración elimina por completo las boletas individuales y persiste sólo:
--
--   · recibo de participación: encuesta/partida + persona, nunca la opción;
--   · contadores acumulados por opción/propuesta, nunca una boleta individual.
--
-- Cada emisión actualiza TODAS las filas del tally, incluso con +0. Así el
-- `xmin` de la transacción tampoco señala qué opción cambió. El alta se hace en
-- una única RPC y los tallies viven en `private`, fuera de PostgREST. El mismo
-- modelo se aplica al presupuesto participativo, cuya asignación es una sola
-- emisión y no puede recuperarse ni modificarse después.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Modelo nuevo: recibos identificados sin preferencia y tallies agregados.
-- -----------------------------------------------------------------------------
create table public.poll_participation_receipts (
  poll_id       uuid not null references public.polls(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  participated_at timestamptz not null default statement_timestamp(),
  primary key (poll_id, user_id)
);

comment on table public.poll_participation_receipts is
  'Recibo privado de participación. Prueba que una persona votó, pero nunca conserva opción ni identificador de una boleta.';
comment on column public.poll_participation_receipts.participated_at is
  'Hora operativa del recibo; las preferencias sólo existen como tallies agregados.';

create index poll_participation_receipts_user_idx
  on public.poll_participation_receipts(user_id, participated_at desc);

create table private.poll_option_tallies (
  poll_id   uuid not null,
  option_id uuid not null,
  votes     bigint not null default 0 check (votes >= 0),
  participants bigint not null default 0 check (participants >= 0),
  primary key (poll_id, option_id),
  foreign key (poll_id, option_id)
    references public.poll_options(poll_id, id) on delete cascade
);

comment on table private.poll_option_tallies is
  'Contadores agregados por opción. No existe una fila por boleta, usuario o instante de voto.';

create table public.budget_participation_receipts (
  budget_id      uuid not null references public.community_budgets(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  participated_at timestamptz not null default statement_timestamp(),
  primary key (budget_id, user_id)
);

comment on table public.budget_participation_receipts is
  'Recibo privado de participación presupuestaria. No conserva proyecto, fichas ni identificador de reparto.';

create index budget_participation_receipts_user_idx
  on public.budget_participation_receipts(user_id, participated_at desc);

alter table public.budget_proposals
  add constraint budget_proposals_budget_id_key unique (budget_id, id);

create table private.budget_proposal_tallies (
  budget_id  uuid not null,
  proposal_id uuid not null,
  tokens      bigint not null default 0 check (tokens >= 0),
  voters      bigint not null default 0 check (voters >= 0),
  participants bigint not null default 0 check (participants >= 0),
  primary key (budget_id, proposal_id),
  foreign key (budget_id, proposal_id)
    references public.budget_proposals(budget_id, id) on delete cascade
);

comment on table private.budget_proposal_tallies is
  'Totales agregados de fichas y participantes por propuesta; no existe una fila por reparto.';

revoke all on private.poll_option_tallies,
  private.budget_proposal_tallies
from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2 · Agregación irreversible de los datos históricos.
-- -----------------------------------------------------------------------------
insert into public.poll_participation_receipts (
  poll_id, user_id, participated_at
)
select v.poll_id, v.user_id, min(v.created_at)
from public.poll_votes v
group by v.poll_id, v.user_id;

with participant_counts as (
  select v.poll_id, count(distinct v.user_id) as participants
  from public.poll_votes v
  group by v.poll_id
), vote_counts as (
  select v.poll_id, v.option_id, count(*) as votes
  from public.poll_votes v
  group by v.poll_id, v.option_id
)
insert into private.poll_option_tallies (
  poll_id, option_id, votes, participants
)
select o.poll_id, o.id, coalesce(vc.votes, 0), pc.participants
from public.poll_options o
join participant_counts pc on pc.poll_id = o.poll_id
left join vote_counts vc
  on vc.poll_id = o.poll_id and vc.option_id = o.id;

insert into public.budget_participation_receipts (
  budget_id, user_id, participated_at
)
select v.budget_id, v.user_id, min(v.created_at)
from public.budget_votes v
group by v.budget_id, v.user_id;

with participant_counts as (
  select v.budget_id, count(distinct v.user_id) as participants
  from public.budget_votes v
  group by v.budget_id
), allocation_counts as (
  select
    v.budget_id,
    v.proposal_id,
    sum(v.tokens) as tokens,
    count(distinct v.user_id) as voters
  from public.budget_votes v
  group by v.budget_id, v.proposal_id
)
insert into private.budget_proposal_tallies (
  budget_id, proposal_id, tokens, voters, participants
)
select
  p.budget_id,
  p.id,
  coalesce(ac.tokens, 0),
  coalesce(ac.voters, 0),
  pc.participants
from public.budget_proposals p
join participant_counts pc on pc.budget_id = p.budget_id
left join allocation_counts ac
  on ac.budget_id = p.budget_id and ac.proposal_id = p.id;

-- Los canales que publicaban identidad o cruces territoriales se eliminan, no
-- se reemplazan por stubs. Esos productos requieren atribuir opción a persona.
drop function if exists public.poll_option_voters(uuid);
drop function if exists public.poll_option_anonymous_counts(uuid);
drop function if exists public.poll_results_by_child(uuid);
drop function if exists public.sibling_poll_contrast(uuid, integer);

drop trigger if exists poll_votes_prepare on public.poll_votes;
drop trigger if exists budget_votes_guard on public.budget_votes;
drop function if exists public.prepare_poll_vote();
drop function if exists public.guard_budget_vote();
drop function if exists public.replace_budget_vote(uuid, jsonb);

drop table public.poll_votes;
drop table public.budget_votes;

-- -----------------------------------------------------------------------------
-- 3 · Los resultados nunca se publican mientras se vota y necesitan al menos
--     cinco participantes. El cierre con fecha es obligatorio.
-- -----------------------------------------------------------------------------
update public.polls
set closes_at = greatest(
      created_at + interval '30 days',
      statement_timestamp() + interval '7 days'
    )
where closes_at is null;

update public.polls set results_visibility = 'after_close';

alter table public.polls
  alter column results_visibility set default 'after_close';
alter table public.polls
  drop constraint if exists polls_results_visibility_chk;
alter table public.polls
  add constraint polls_results_visibility_chk
  check (results_visibility = 'after_close');

comment on constraint polls_results_visibility_chk on public.polls is
  'Los conteos sólo pueden publicarse al cierre; always/after_vote filtran preferencias por timing.';

create or replace function public.create_poll_with_options(
  p_community uuid,
  p_question text,
  p_description text,
  p_type text,
  p_category text,
  p_max_choices smallint,
  p_results_visibility text,
  p_closes_at text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_poll uuid;
  v_option_count integer := coalesce(cardinality(p_options), 0);
  v_max_choices smallint := nullif(p_max_choices, 0);
  v_closes_at timestamptz := nullif(p_closes_at, '')::timestamptz;
begin
  perform private.assert_can_participate(v_user);
  if not private.raw_is_member(v_user, p_community) then
    raise exception 'AGORBIS_COMMUNITY_MEMBERSHIP_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if v_option_count < 2 or v_option_count > 10 then
    raise exception 'Una encuesta necesita entre 2 y 10 opciones'
      using errcode = 'check_violation';
  end if;
  if p_type not in ('single', 'multiple', 'binary') then
    raise exception 'Tipo de encuesta inválido' using errcode = 'check_violation';
  end if;
  if p_type = 'binary' and v_option_count <> 2 then
    raise exception 'Una encuesta binaria necesita exactamente 2 opciones'
      using errcode = 'check_violation';
  end if;
  if p_type <> 'multiple' and v_max_choices is not null then
    raise exception 'Sólo una encuesta múltiple admite un máximo de opciones'
      using errcode = 'check_violation';
  end if;
  if v_max_choices is not null
     and (v_max_choices < 1 or v_max_choices > v_option_count) then
    raise exception 'El máximo de opciones no es válido'
      using errcode = 'check_violation';
  end if;
  if p_results_visibility is distinct from 'after_close' then
    raise exception 'AGORBIS_POLL_RESULTS_AFTER_CLOSE_ONLY'
      using errcode = 'check_violation';
  end if;
  if v_closes_at is null then
    raise exception 'Los resultados protegidos requieren fecha de cierre'
      using errcode = 'check_violation';
  end if;
  if v_closes_at <= statement_timestamp() then
    raise exception 'La fecha de cierre tiene que ser futura'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(p_options) option
    where nullif(btrim(option), '') is null or char_length(btrim(option)) > 120
  ) then
    raise exception 'Las opciones no son válidas' using errcode = 'check_violation';
  end if;
  if (select count(distinct lower(btrim(option))) from unnest(p_options) option)
       <> v_option_count then
    raise exception 'Las opciones no pueden repetirse'
      using errcode = 'check_violation';
  end if;

  insert into public.polls (
    community_id, author_id, question, description, type, category,
    max_choices, results_visibility, closes_at
  ) values (
    p_community, v_user, p_question, nullif(btrim(p_description), ''),
    p_type, p_category, v_max_choices, 'after_close', v_closes_at
  ) returning id into v_poll;

  insert into public.poll_options (poll_id, label, sort_order)
  select v_poll, btrim(option), (ordinality - 1)::smallint
  from unnest(p_options) with ordinality as options(option, ordinality);
  return v_poll;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4 · Membresía: ausencia de preferencia = anónimo. Mostrar identidad es un
--     opt-in explícito y revocable; volver a anónimo elimina la excepción.
-- -----------------------------------------------------------------------------
alter table public.community_visibility
  alter column is_anonymous set default true;

delete from public.community_visibility where is_anonymous;

comment on table public.community_visibility is
  'Opt-in privado de visibilidad por usuario y comunidad. Sin fila = anónimo; una fila con false permite mostrarse y puede revocarse.';

create or replace function public.community_public_members(
  p_community uuid,
  p_after_username text default null,
  p_limit integer default 100
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url
  from public.profiles pr
  join public.communities home on home.id = pr.home_community_id
  join public.communities target on target.id = p_community
  where (home.path = target.path or home.path like target.path || '.%')
    and coalesce((
      select cv.is_anonymous
      from public.community_visibility cv
      where cv.user_id = pr.id and cv.community_id = p_community
    ), true) = false
    and (p_after_username is null or pr.username > p_after_username)
  order by pr.username
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.community_member_visibility_counts(
  p_community uuid
)
returns table (public_count bigint, anonymous_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select coalesce((
      select cv.is_anonymous
      from public.community_visibility cv
      where cv.user_id = pr.id and cv.community_id = p_community
    ), true) as is_anonymous
    from public.profiles pr
    join public.communities home on home.id = pr.home_community_id
    join public.communities target on target.id = p_community
    where home.path = target.path or home.path like target.path || '.%'
  ), counts as (
    select
      count(*) filter (where not is_anonymous) as public_count,
      count(*) filter (where is_anonymous) as anonymous_count
    from members
  )
  select
    c.public_count,
    case
      when c.anonymous_count = 0 then 0
      when c.anonymous_count < 5 then -1
      else (c.anonymous_count / 5) * 5
    end
  from counts c;
$$;

comment on function public.community_member_visibility_counts(uuid) is
  'Conteo público exacto; anónimos: 0 si no hay, -1 para 1–4 y piso en bloques de 5 desde 5.';

create or replace function public.my_community_visibility(
  p_user uuid,
  p_community uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is distinct from auth.uid() then
    raise exception 'AGORBIS_SELF_ONLY'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select cv.is_anonymous
    from public.community_visibility cv
    where cv.user_id = p_user and cv.community_id = p_community
  ), true);
end;
$$;

create or replace function public.set_community_visibility(
  p_community uuid,
  p_is_anonymous boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para guardar esta preferencia'
      using errcode = 'invalid_authorization_specification';
  end if;
  perform private.assert_can_participate(v_actor);
  if p_is_anonymous is null then
    raise exception 'La preferencia de visibilidad no es válida'
      using errcode = 'check_violation';
  end if;
  if not private.raw_is_member(v_actor, p_community) then
    raise exception 'AGORBIS_COMMUNITY_MEMBERSHIP_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  if p_is_anonymous then
    delete from public.community_visibility cv
    where cv.user_id = v_actor and cv.community_id = p_community;
  else
    insert into public.community_visibility (
      user_id, community_id, is_anonymous
    ) values (
      v_actor, p_community, false
    )
    on conflict (user_id, community_id) do update
      set is_anonymous = false;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5 · Emisión atómica: recibo identificado + incremento agregado.
-- -----------------------------------------------------------------------------
create or replace function public.cast_poll_ballot(
  p_poll uuid,
  p_option_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_poll public.polls%rowtype;
  v_choice_count integer;
  v_option_count integer;
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para votar'
      using errcode = 'invalid_authorization_specification';
  end if;
  perform private.assert_can_participate(v_actor);
  perform pg_advisory_xact_lock(
    hashtextextended('poll-ballot:' || p_poll::text || ':' || v_actor::text, 0)
  );

  select p.* into v_poll
  from public.polls p
  where p.id = p_poll
  for update;
  if not found then
    raise exception 'La encuesta no existe'
      using errcode = 'foreign_key_violation';
  end if;

  -- Comparte lock con la guarda de opciones. Así no puede aparecer, cambiar ni
  -- desaparecer una opción entre la validación y el UPDATE de todos los tallies.
  perform pg_advisory_xact_lock(hashtext('poll-options:' || p_poll::text));
  if v_poll.status <> 'active' then
    raise exception 'Esta encuesta está cerrada'
      using errcode = 'check_violation';
  end if;
  if v_poll.closes_at is not null and v_poll.closes_at <= statement_timestamp() then
    raise exception 'El plazo para votar ya venció'
      using errcode = 'check_violation';
  end if;
  if not private.raw_is_member(v_actor, v_poll.community_id) then
    raise exception 'AGORBIS_COMMUNITY_MEMBERSHIP_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.poll_participation_receipts r
    where r.poll_id = p_poll and r.user_id = v_actor
  ) then
    raise exception 'AGORBIS_ALREADY_VOTED'
      using errcode = 'unique_violation';
  end if;

  v_choice_count := coalesce(cardinality(p_option_ids), 0);
  if v_choice_count = 0 or array_position(p_option_ids, null) is not null then
    raise exception 'Elegí al menos una opción'
      using errcode = 'check_violation';
  end if;
  if v_choice_count <> (
    select count(distinct option_id) from unnest(p_option_ids) option_id
  ) then
    raise exception 'Las opciones no pueden repetirse'
      using errcode = 'check_violation';
  end if;
  if v_poll.type in ('single', 'binary') and v_choice_count <> 1 then
    raise exception 'En esta encuesta se elige una sola opción'
      using errcode = 'check_violation';
  end if;
  if v_poll.type = 'multiple'
     and v_choice_count > coalesce(v_poll.max_choices, 10) then
    raise exception 'Esta encuesta permite elegir hasta % opciones',
      coalesce(v_poll.max_choices, 10)
      using errcode = 'check_violation';
  end if;

  select count(*) into v_option_count
  from public.poll_options o
  where o.poll_id = p_poll;
  if v_option_count < 2 or v_option_count > 10
     or (v_poll.type = 'binary' and v_option_count <> 2) then
    raise exception 'La encuesta está mal configurada'
      using errcode = 'check_violation';
  end if;
  if (
    select count(*)
    from public.poll_options o
    where o.poll_id = p_poll and o.id = any(p_option_ids)
  ) <> v_choice_count then
    raise exception 'Una opción no pertenece a esta encuesta'
      using errcode = 'foreign_key_violation';
  end if;

  insert into public.poll_participation_receipts (poll_id, user_id)
  values (p_poll, v_actor);

  insert into private.poll_option_tallies (
    poll_id, option_id, votes, participants
  )
  select
    o.poll_id,
    o.id,
    0,
    coalesce((
      select max(existing.participants)
      from private.poll_option_tallies existing
      where existing.poll_id = p_poll
    ), 0)
  from public.poll_options o
  where o.poll_id = p_poll
  on conflict (poll_id, option_id) do nothing;

  -- Se reescriben todas las opciones, incluidas las no elegidas (+0), para
  -- que `xmin` no convierta la transacción del recibo en un marcador de voto.
  update private.poll_option_tallies t
  set votes = t.votes + case when t.option_id = any(p_option_ids) then 1 else 0 end,
      participants = t.participants + 1
  where t.poll_id = p_poll;

  insert into public.activation_events (user_id, event, metadata)
  values (
    v_actor,
    'first_participation',
    jsonb_build_object('kind', 'poll_participation')
  )
  on conflict do nothing;
end;
$$;

-- Una vez que existe un recibo, cambiar tipo u opciones alteraría el sentido
-- de una participación ya agregada.
create or replace function public.freeze_poll_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('poll-options:' || old.id::text));
  if new.type is distinct from old.type
     and exists (
       select 1
       from public.poll_participation_receipts r
       where r.poll_id = old.id
     ) then
    raise exception 'No se puede cambiar el tipo de una encuesta que ya tiene votos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Publicar resultados es terminal: ni siquiera moderación puede reabrir una
-- encuesta cerrada para emitir un voto más y comparar dos agregados públicos.
create or replace function private.guard_poll_privacy_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed' and new.status = 'active' then
    raise exception 'AGORBIS_CLOSED_POLL_CANNOT_REOPEN'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

drop trigger if exists aa_poll_privacy_status_guard on public.polls;
create trigger aa_poll_privacy_status_guard
  before update of status on public.polls
  for each row execute function private.guard_poll_privacy_transition();

create or replace function private.guard_poll_option_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll uuid := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  v_count integer;
begin
  -- El borrado del recurso padre debe conservar su ON DELETE CASCADE. Un
  -- DELETE directo de una opción, en cambio, pasa por el congelamiento normal.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtext('poll-options:' || v_poll::text));
  if exists (
    select 1
    from public.poll_participation_receipts r
    where r.poll_id = v_poll
  ) then
    raise exception 'AGORBIS_POLL_OPTIONS_FROZEN'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if tg_op = 'UPDATE' and new.poll_id is distinct from old.poll_id then
    raise exception 'La opción no puede moverse de encuesta'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.poll_options o where o.poll_id = v_poll;
    if v_count >= 10 then
      raise exception 'Una encuesta admite hasta 10 opciones'
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.poll_options o
      where o.poll_id = v_poll
        and lower(btrim(o.label)) = lower(btrim(new.label))
    ) then
      raise exception 'Las opciones no pueden repetirse'
        using errcode = 'unique_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6 · Visibilidad y resultados desde tallies, nunca durante la votación.
-- -----------------------------------------------------------------------------
create or replace function public.can_see_poll_results(
  p_poll uuid,
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.polls p
    where p.id = p_poll
      and p.status <> 'removed'
      and (
        p.status = 'closed'
        or p.closes_at <= statement_timestamp()
      )
      and (
        select coalesce(max(t.participants), 0)
        from private.poll_option_tallies t
        where t.poll_id = p.id
      ) >= 5
  );
$$;

create or replace function public.can_see_poll_results(p_poll uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_see_poll_results(p_poll, auth.uid());
$$;

create or replace function public.poll_results(p_poll uuid)
returns table (
  option_id uuid,
  label text,
  sort_order smallint,
  votes bigint,
  percentage numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with counts as (
    select o.id, o.label, o.sort_order, coalesce(t.votes, 0) as votes
    from public.poll_options o
    left join private.poll_option_tallies t
      on t.poll_id = o.poll_id and t.option_id = o.id
    where o.poll_id = p_poll
  ), total as (
    select coalesce(sum(c.votes), 0) as votes from counts c
  )
  select
    c.id,
    c.label,
    c.sort_order,
    c.votes,
    case when t.votes = 0 then 0::numeric
      else round(c.votes * 100.0 / t.votes, 1)
    end
  from counts c
  cross join total t
  where public.can_see_poll_results(p_poll)
  order by c.sort_order, c.label;
$$;

create or replace function public.poll_stats(p_poll uuid)
returns table (
  total_votes bigint,
  total_voters bigint,
  has_voted boolean,
  can_see boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with visibility as (
    select public.can_see_poll_results(p_poll) as can_see
  ), totals as (
    select
      coalesce((
        select sum(t.votes)
        from private.poll_option_tallies t
        where t.poll_id = p_poll
      ), 0)::bigint as total_votes,
      coalesce((
        select max(t.participants)
        from private.poll_option_tallies t
        where t.poll_id = p_poll
      ), 0)::bigint as total_voters
  )
  select
    case when v.can_see then t.total_votes else 0 end,
    case when v.can_see then t.total_voters else 0 end,
    (
      auth.uid() is not null and exists (
        select 1 from public.poll_participation_receipts r
        where r.poll_id = p_poll and r.user_id = auth.uid()
      )
    ),
    v.can_see
  from visibility v
  cross join totals t;
$$;

drop function if exists public.poll_feed(uuid, integer, timestamptz, uuid, text);
create function public.poll_feed(
  p_community uuid,
  p_limit integer default 20,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_category text default null
)
returns table (
  id uuid,
  question text,
  description text,
  type text,
  category text,
  status text,
  closes_at timestamptz,
  created_at timestamptz,
  option_count bigint,
  total_votes bigint,
  has_voted boolean,
  can_see boolean
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
    where h.path = c.path or h.path like c.path || '.%'
  ), feed as (
    select
      p.id, 'poll'::text kind, c.id community_id, c.slug, c.name, c.emoji,
      p.question title, p.description summary, p.status,
      (case when public.can_see_poll_results(p.id) then
        (select coalesce(max(t.participants), 0)
         from private.poll_option_tallies t
         where t.poll_id = p.id)
       else 0 end)::numeric engagement,
      p.created_at
    from public.polls p
    join chain c on c.id = p.community_id
    where p.status <> 'removed'
    union all
    select
      d.id, 'debate', c.id, c.slug, c.name, c.emoji, d.title,
      left(d.body, 300), d.status,
      (select count(*) from public.debate_comments dc
       where dc.debate_id = d.id and dc.status = 'visible')::numeric,
      d.created_at
    from public.debates d
    join chain c on c.id = d.community_id
    where d.status <> 'removed'
    union all
    select
      cl.id, 'claim', c.id, c.slug, c.name, c.emoji, cl.title,
      left(cl.description, 300), cl.status, cl.support_count::numeric,
      cl.created_at
    from public.claims cl
    join chain c on c.id = cl.community_id
    where cl.status <> 'removed'
    union all
    select
      pr.id, 'project', c.id, c.slug, c.name, c.emoji, pr.title, pr.summary,
      pr.status,
      ((select count(*) from public.project_contributions pc where pc.project_id = pr.id)
       + (select count(*) from public.project_pledges pp where pp.project_id = pr.id))::numeric,
      pr.created_at
    from public.projects pr
    join chain c on c.id = pr.community_id
    where pr.status <> 'removed'
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

-- Cerrar una encuesta puede avisar que se participó, pero nunca qué se eligió.
create or replace function public.notify_content_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_user uuid;
  v_title text;
  v_type text;
  v_href text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_type := case tg_table_name
    when 'polls' then 'poll'
    when 'claims' then 'claim'
    when 'debates' then 'debate'
    else 'project'
  end;
  v_title := coalesce(to_jsonb(new) ->> 'question', to_jsonb(new) ->> 'title');
  v_href := case tg_table_name
    when 'polls' then '/encuestas/' || new.id
    when 'claims' then '/reclamos/' || new.id
    when 'debates' then '/debates/' || new.id
    else '/proyectos/' || new.id
  end;
  v_recipient := new.author_id;

  perform public.create_notification(
    v_recipient, auth.uid(), 'status_change',
    'Cambió el estado de tu publicación', v_title || ' · ' || new.status,
    v_href, v_type, new.id,
    'status:' || v_type || ':' || new.id || ':' || new.status || ':author'
  );

  if tg_table_name = 'polls' and new.status = 'closed' then
    for v_user in
      select r.user_id
      from public.poll_participation_receipts r
      where r.poll_id = new.id
    loop
      perform public.create_notification(
        v_user, auth.uid(), 'poll_closed',
        'Cerró una encuesta en la que participaste', v_title, v_href,
        v_type, new.id, 'poll-closed:' || new.id || ':' || v_user
      );
    end loop;
  elsif tg_table_name = 'claims' then
    for v_user in
      select s.user_id from public.claim_supports s where s.claim_id = new.id
    loop
      perform public.create_notification(
        v_user, auth.uid(), 'claim_update',
        'Hay novedades en un reclamo que apoyás',
        v_title || ' · ' || new.status, v_href, v_type, new.id,
        'claim-status:' || new.id || ':' || new.status || ':' || v_user
      );
    end loop;
  elsif tg_table_name = 'projects' then
    for v_user in
      select p.user_id from public.project_pledges p where p.project_id = new.id
      union
      select c.user_id from public.project_contributions c where c.project_id = new.id
    loop
      perform public.create_notification(
        v_user, auth.uid(), 'project_update',
        'Avanzó un proyecto al que te sumaste',
        v_title || ' · ' || new.status, v_href, v_type, new.id,
        'project-status:' || new.id || ':' || new.status || ':' || v_user
      );
    end loop;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6 · Presupuesto participativo: emisión agregada e irreversible.
-- -----------------------------------------------------------------------------
create or replace function private.guard_budget_proposal_tally_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget uuid := case when tg_op = 'INSERT' then new.budget_id else old.budget_id end;
begin
  -- Permite únicamente la cascada interna al borrar la partida completa.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtext('budget-proposals:' || v_budget::text));
  if exists (
    select 1
    from public.budget_participation_receipts r
    where r.budget_id = v_budget
  ) then
    raise exception 'AGORBIS_BUDGET_PROPOSALS_FROZEN'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists aa_budget_proposals_tally_shape
  on public.budget_proposals;
create trigger aa_budget_proposals_tally_shape
  before insert or update or delete on public.budget_proposals
  for each row execute function private.guard_budget_proposal_tally_shape();

create or replace function public.cast_budget_ballot(
  p_budget uuid,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_budget public.community_budgets%rowtype;
  v_key text;
  v_value jsonb;
  v_proposal uuid;
  v_tokens integer;
  v_total integer := 0;
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para votar'
      using errcode = 'invalid_authorization_specification';
  end if;
  perform private.assert_can_participate(v_actor);
  perform pg_advisory_xact_lock(
    hashtextextended('budget-ballot:' || p_budget::text || ':' || v_actor::text, 0)
  );

  select b.* into v_budget
  from public.community_budgets b
  where b.id = p_budget
  for update;
  if not found then
    raise exception 'La partida no existe'
      using errcode = 'foreign_key_violation';
  end if;

  -- Serializa la forma del tally con altas/revisiones de propuestas. Una
  -- emisión siempre actualiza exactamente el conjunto completo de la partida.
  perform pg_advisory_xact_lock(hashtext('budget-proposals:' || p_budget::text));
  if public.budget_phase(p_budget) <> 'voting' then
    raise exception 'La votación de esta partida no está abierta'
      using errcode = 'check_violation';
  end if;
  if not public.can_vote_budget(v_actor, p_budget) then
    raise exception 'No podés votar esta partida'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.budget_participation_receipts r
    where r.budget_id = p_budget and r.user_id = v_actor
  ) then
    raise exception 'AGORBIS_BUDGET_ALREADY_VOTED'
      using errcode = 'unique_violation';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'object' then
    raise exception 'El reparto de fichas no es válido'
      using errcode = 'check_violation';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_allocations)
  loop
    v_count := v_count + 1;
    if v_count > 100
       or v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(v_value) <> 'number'
       or (v_value #>> '{}') !~ '^[0-9]+$' then
      raise exception 'El reparto de fichas no es válido'
        using errcode = 'check_violation';
    end if;
    v_proposal := v_key::uuid;
    v_tokens := (v_value #>> '{}')::integer;
    if v_tokens <= 0 then
      raise exception 'El reparto no puede tener fichas negativas ni vacías'
        using errcode = 'check_violation';
    end if;
    if v_tokens > v_budget.max_tokens_per_proposal then
      raise exception 'Máximo % fichas por proyecto',
        v_budget.max_tokens_per_proposal
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.budget_proposals p
      where p.id = v_proposal
        and p.budget_id = p_budget
        and p.admitted_at is not null
    ) then
      raise exception 'Ese proyecto no fue admitido en esta partida'
        using errcode = 'check_violation';
    end if;
    v_total := v_total + v_tokens;
  end loop;

  if v_count = 0 then
    raise exception 'Repartí al menos una ficha'
      using errcode = 'check_violation';
  end if;
  if v_total > v_budget.tokens_per_voter then
    raise exception 'Te quedan % fichas', v_budget.tokens_per_voter
      using errcode = 'check_violation';
  end if;

  insert into public.budget_participation_receipts (budget_id, user_id)
  values (p_budget, v_actor);

  insert into private.budget_proposal_tallies (
    budget_id, proposal_id, tokens, voters, participants
  )
  select
    p.budget_id,
    p.id,
    0,
    0,
    coalesce((
      select max(existing.participants)
      from private.budget_proposal_tallies existing
      where existing.budget_id = p_budget
    ), 0)
  from public.budget_proposals p
  where p.budget_id = p_budget
  on conflict (budget_id, proposal_id) do nothing;

  -- Igual que en encuestas, se actualizan todas las propuestas (+0 para las
  -- no elegidas) para que el xmin del recibo no revele el reparto.
  update private.budget_proposal_tallies t
  set tokens = t.tokens + coalesce(
        (p_allocations ->> t.proposal_id::text)::integer,
        0
      ),
      voters = t.voters + case
        when p_allocations ? t.proposal_id::text then 1 else 0
      end,
      participants = t.participants + 1
  where t.budget_id = p_budget;

  insert into public.activation_events (user_id, event, metadata)
  values (
    v_actor,
    'first_participation',
    jsonb_build_object('kind', 'budget_participation')
  )
  on conflict do nothing;
end;
$$;

create or replace function public.budget_results(p_budget uuid)
returns table (
  proposal_id uuid,
  project_id uuid,
  project_title text,
  requested_amount numeric,
  tokens bigint,
  voters bigint,
  awarded boolean,
  awarded_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_remaining numeric;
  r record;
begin
  if public.budget_phase(p_budget) <> 'closed' then return; end if;
  if (
    select coalesce(max(t.participants), 0)
    from private.budget_proposal_tallies t
    where t.budget_id = p_budget
  ) < 5 then
    return;
  end if;
  select b.amount into v_remaining
  from public.community_budgets b where b.id = p_budget;
  if v_remaining is null then return; end if;

  for r in
    select
      p.id as proposal_id,
      p.project_id,
      pr.title as project_title,
      p.requested_amount,
      coalesce(t.tokens, 0)::bigint as tokens,
      coalesce(t.voters, 0)::bigint as voters
    from public.budget_proposals p
    join public.projects pr on pr.id = p.project_id
    left join private.budget_proposal_tallies t
      on t.budget_id = p.budget_id and t.proposal_id = p.id
    where p.budget_id = p_budget and p.admitted_at is not null
    group by p.id, p.project_id, pr.title, p.requested_amount,
      t.tokens, t.voters
    order by 5 desc, p.requested_amount, p.id
  loop
    proposal_id := r.proposal_id;
    project_id := r.project_id;
    project_title := r.project_title;
    requested_amount := r.requested_amount;
    tokens := r.tokens;
    voters := r.voters;
    if r.tokens > 0 and r.requested_amount <= v_remaining then
      awarded := true;
      awarded_amount := r.requested_amount;
      v_remaining := v_remaining - r.requested_amount;
    else
      awarded := false;
      awarded_amount := 0;
    end if;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7 · Actividad, corrección de residencia, cierre de cuenta y retención.
-- -----------------------------------------------------------------------------
create or replace function public.has_civic_activity_since(
  p_user uuid,
  p_since timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.poll_participation_receipts
      where user_id = p_user and participated_at >= p_since
    union all
    select 1 from public.budget_participation_receipts
      where user_id = p_user and participated_at >= p_since
    union all
    select 1 from public.debate_comments where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.comment_votes where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.claim_supports where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.project_pledges where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.project_comments where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.project_contributions where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.polls where author_id = p_user and created_at >= p_since
    union all
    select 1 from public.debates where author_id = p_user and created_at >= p_since
    union all
    select 1 from public.claims where author_id = p_user and created_at >= p_since
    union all
    select 1 from public.projects where author_id = p_user and created_at >= p_since
  );
$$;

create or replace function private.account_has_real_activity(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = p_user and (
        p.home_community_id is not null
        or p.residence_changed_at is not null
        or p.avatar_url is not null
        or p.bio is not null
        or p.verification_level <> 0
        or p.role <> 'user'
      )
    )
    or exists (select 1 from public.follows x where x.user_id = p_user)
    or exists (select 1 from public.community_visibility x where x.user_id = p_user)
    or exists (select 1 from public.poll_participation_receipts x where x.user_id = p_user)
    or exists (select 1 from public.budget_participation_receipts x where x.user_id = p_user)
    or exists (select 1 from public.comment_votes x where x.user_id = p_user)
    or exists (select 1 from public.claim_supports x where x.user_id = p_user)
    or exists (select 1 from public.project_pledges x where x.user_id = p_user)
    or exists (select 1 from public.claim_uploads x where x.owner_id = p_user)
    or exists (
      select 1 from storage.objects x
      where x.owner = p_user or x.owner_id = p_user::text
    )
    or exists (select 1 from public.debate_comments x where x.user_id = p_user)
    or exists (select 1 from public.project_comments x where x.user_id = p_user)
    or exists (select 1 from public.project_contributions x where x.user_id = p_user)
    or exists (select 1 from public.organization_members x where x.user_id = p_user)
    or exists (select 1 from public.community_requests x where x.user_id = p_user)
    or exists (select 1 from public.organization_requests x where x.user_id = p_user)
    or exists (select 1 from public.notifications x where x.recipient_id = p_user)
    or exists (select 1 from public.reports x where x.reporter_id = p_user)
    or exists (
      select 1 from public.activation_events x
      where x.user_id = p_user and x.event <> 'signup'
    )
    or exists (select 1 from public.ai_summary_generation_events x where x.requested_by = p_user)
    or exists (select 1 from public.ai_summary_generation_jobs x where x.requested_by = p_user)
    or exists (select 1 from public.polls x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.debates x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.claims x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.projects x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.community_info x where x.updated_by = p_user)
    or exists (select 1 from public.community_budgets x where x.created_by = p_user)
    or exists (select 1 from public.budget_proposals x where x.admitted_by = p_user)
    or exists (select 1 from public.budget_reports x where x.author_id = p_user)
    or exists (select 1 from public.claim_events x where x.actor_id = p_user)
    or exists (select 1 from public.content_sources x where x.added_by = p_user)
    or exists (select 1 from public.content_relations x where x.created_by = p_user)
    or exists (select 1 from public.institutional_responses x where x.author_id = p_user)
    or exists (select 1 from public.notifications x where x.actor_id = p_user)
    or exists (select 1 from public.organizations x where x.verified_by = p_user)
    or exists (select 1 from public.organization_members x where x.added_by = p_user)
    or exists (select 1 from public.community_requests x where x.reviewed_by = p_user)
    or exists (select 1 from public.organization_requests x where x.reviewed_by = p_user)
    or exists (select 1 from public.project_tasks x where x.assigned_user_id = p_user)
    or exists (select 1 from public.reports x where x.resolved_by = p_user)
    or exists (
      select 1 from public.user_suspensions x
      where x.user_id = p_user or x.created_by = p_user or x.lifted_by = p_user
    )
    or exists (
      select 1 from public.moderation_appeals x
      where x.appellant_id = p_user or x.reviewed_by = p_user
    )
    or exists (select 1 from public.moderation_audit_log x where x.moderator_id = p_user);
$$;

insert into public.data_retention_policies (
  dataset, retention_days, rationale, purge_on_account_deletion
) values
  (
    'poll_participation_receipts', 36500,
    'Recibo sin opción: se conserva durante la vida de la cuenta y se elimina con ella.',
    true
  ),
  (
    'private_poll_option_tallies', 36500,
    'Contadores sin boletas individuales: se conservan hasta eliminar la encuesta.',
    false
  ),
  (
    'budget_participation_receipts', 36500,
    'Recibo sin asignación: se conserva durante la vida de la cuenta y se elimina con ella.',
    true
  ),
  (
    'private_budget_proposal_tallies', 36500,
    'Contadores sin repartos individuales: se conservan hasta eliminar la partida.',
    false
  )
on conflict (dataset) do update set
  retention_days = excluded.retention_days,
  rationale = excluded.rationale,
  purge_on_account_deletion = excluded.purge_on_account_deletion,
  updated_at = statement_timestamp();

-- -----------------------------------------------------------------------------
-- 8 · RLS y matriz final de privilegios.
-- -----------------------------------------------------------------------------
alter table public.poll_participation_receipts enable row level security;
alter table public.budget_participation_receipts enable row level security;

create policy poll_participation_receipts_select_own
  on public.poll_participation_receipts
  for select to authenticated
  using (user_id = auth.uid());

create policy budget_participation_receipts_select_own
  on public.budget_participation_receipts
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.poll_participation_receipts,
  public.budget_participation_receipts
from public, anon, authenticated;
grant select on public.poll_participation_receipts,
  public.budget_participation_receipts
to authenticated;
grant all on public.poll_participation_receipts,
  public.budget_participation_receipts
to service_role;

-- Ya no se permite DML directo ni siquiera sobre la preferencia de membresía.
revoke insert, update, delete on public.community_visibility from authenticated;

revoke execute on function public.can_see_poll_results(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_see_poll_results(uuid, uuid) to service_role;

revoke execute on function public.cast_poll_ballot(uuid, uuid[]),
  public.cast_budget_ballot(uuid, jsonb),
  public.set_community_visibility(uuid, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.cast_poll_ballot(uuid, uuid[]),
  public.cast_budget_ballot(uuid, jsonb),
  public.set_community_visibility(uuid, boolean)
to authenticated;

revoke execute on function public.can_see_poll_results(uuid),
  public.poll_results(uuid),
  public.poll_stats(uuid),
  public.poll_feed(uuid, integer, timestamptz, uuid, text),
  public.budget_results(uuid),
  public.community_public_members(uuid, text, integer),
  public.community_member_visibility_counts(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_see_poll_results(uuid),
  public.poll_results(uuid),
  public.poll_stats(uuid),
  public.poll_feed(uuid, integer, timestamptz, uuid, text),
  public.budget_results(uuid),
  public.community_public_members(uuid, text, integer),
  public.community_member_visibility_counts(uuid)
to anon, authenticated;

revoke execute on function public.my_community_visibility(uuid, uuid),
  public.personalized_feed(uuid, integer, timestamptz, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.my_community_visibility(uuid, uuid),
  public.personalized_feed(uuid, integer, timestamptz, uuid)
to authenticated;

  -- Helpers y tablas privadas siguen fuera de todos los roles de API.
  revoke execute on function private.guard_poll_option_mutation(),
  private.guard_poll_privacy_transition(),
  private.guard_budget_proposal_tally_shape(),
  private.account_has_real_activity(uuid)
from public, anon, authenticated, service_role;
revoke all on private.poll_option_tallies,
  private.budget_proposal_tallies
from public, anon, authenticated, service_role;

commit;
