-- =============================================================================
-- Agorbis · 0002 · Funciones, triggers y agregados
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_member: el corazón de la regla de pertenencia.
-- Verdadero si la comunidad objetivo está en la cadena ancestral de la
-- residencia del usuario (o es exactamente su residencia).
--   home = earth.south-america.argentina.buenos-aires.mar-del-plata
--   → miembro de buenos-aires, argentina, south-america y earth.
-- `security definer` porque las policies de RLS la invocan sobre tablas que el
-- usuario no necesariamente puede leer entera.
-- -----------------------------------------------------------------------------
create or replace function public.is_member(p_user uuid, p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.communities home   on home.id = pr.home_community_id
    join public.communities target on target.id = p_community
    where pr.id = p_user
      and (home.path = target.path or home.path like target.path || '.%')
  );
$$;

revoke all on function public.is_member(uuid, uuid) from public;
grant execute on function public.is_member(uuid, uuid) to authenticated, anon, service_role;

comment on function public.is_member(uuid, uuid) is
  'True si p_community es la residencia de p_user o uno de sus ancestros.';

-- -----------------------------------------------------------------------------
-- is_moderator / current_role_is
-- -----------------------------------------------------------------------------
create or replace function public.is_moderator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and role in ('moderator', 'admin')
  );
$$;

revoke all on function public.is_moderator(uuid) from public;
grant execute on function public.is_moderator(uuid) to authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- Cadena de ancestros y descendientes (helpers de jerarquía)
-- -----------------------------------------------------------------------------
create or replace function public.community_ancestors(p_community uuid)
returns setof public.communities
language sql
stable
as $$
  select a.*
  from public.communities a
  join public.communities target on target.id = p_community
  where target.path = a.path or target.path like a.path || '.%'
  order by a.level asc;
$$;

comment on function public.community_ancestors(uuid) is
  'Cadena completa desde earth hasta la comunidad dada, inclusive, ordenada por nivel.';

create or replace function public.community_descendant_count(p_community uuid)
returns bigint
language sql
stable
as $$
  select count(*)
  from public.communities d
  join public.communities target on target.id = p_community
  where d.path like target.path || '.%';
$$;

-- -----------------------------------------------------------------------------
-- Alta de perfil al crear el usuario en auth.users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));

  -- Si el username propuesto no es válido o ya existe, se genera un placeholder
  -- que el usuario reemplaza durante el onboarding.
  if v_username !~ '^[a-z0-9_]{3,20}$'
     or exists (select 1 from public.profiles where username = v_username) then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    v_username,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- member_count: se propaga a toda la cadena ancestral de la residencia.
-- -----------------------------------------------------------------------------
create or replace function public.adjust_member_counts(p_community uuid, p_delta int)
returns void
language sql
as $$
  update public.communities c
     set member_count = greatest(0, c.member_count + p_delta)
  from public.communities target
  where target.id = p_community
    and (target.path = c.path or target.path like c.path || '.%');
$$;

create or replace function public.sync_member_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.home_community_id is not null then
      perform public.adjust_member_counts(new.home_community_id, 1);
    end if;

  elsif tg_op = 'UPDATE' then
    if old.home_community_id is distinct from new.home_community_id then
      if old.home_community_id is not null then
        perform public.adjust_member_counts(old.home_community_id, -1);
      end if;
      if new.home_community_id is not null then
        perform public.adjust_member_counts(new.home_community_id, 1);
      end if;
    end if;

  elsif tg_op = 'DELETE' then
    if old.home_community_id is not null then
      perform public.adjust_member_counts(old.home_community_id, -1);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists profiles_sync_member_counts on public.profiles;
create trigger profiles_sync_member_counts
  after insert or update of home_community_id or delete on public.profiles
  for each row execute function public.sync_member_counts();

-- -----------------------------------------------------------------------------
-- Regla de residencia: 1 cambio cada 30 días, verificado en el motor.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_residence_cooldown()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.home_community_id is distinct from old.home_community_id then
    -- La primera elección (onboarding) no cuenta como "cambio".
    if old.home_community_id is not null
       and old.residence_changed_at is not null
       and old.residence_changed_at > now() - interval '30 days' then
      raise exception 'Sólo podés cambiar tu residencia una vez cada 30 días. Vas a poder de nuevo el %',
        to_char(old.residence_changed_at + interval '30 days', 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    new.residence_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_residence_cooldown on public.profiles;
create trigger profiles_residence_cooldown
  before update of home_community_id on public.profiles
  for each row execute function public.enforce_residence_cooldown();

-- -----------------------------------------------------------------------------
-- Encuestas: opciones y agregados
-- -----------------------------------------------------------------------------

-- `binary` debe tener exactamente 2 opciones. Se verifica al votar (además de
-- validarse en la action), porque las opciones se insertan después del poll.
create or replace function public.enforce_binary_options()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.poll_options where poll_id = new.poll_id;
  if v_count > 2 and (select type from public.polls where id = new.poll_id) = 'binary' then
    raise exception 'Una encuesta binaria admite exactamente 2 opciones'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists poll_options_binary_guard on public.poll_options;
create trigger poll_options_binary_guard
  after insert on public.poll_options
  for each row execute function public.enforce_binary_options();

-- Completa `poll_type` desde la encuesta y valida que se pueda votar.
create or replace function public.prepare_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls%rowtype;
  v_options int;
begin
  select * into v_poll from public.polls where id = new.poll_id;
  if not found then
    raise exception 'La encuesta no existe' using errcode = 'foreign_key_violation';
  end if;

  if v_poll.status <> 'active' then
    raise exception 'Esta encuesta está cerrada' using errcode = 'check_violation';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'El plazo para votar ya venció' using errcode = 'check_violation';
  end if;

  if v_poll.type = 'binary' then
    select count(*) into v_options from public.poll_options where poll_id = v_poll.id;
    if v_options <> 2 then
      raise exception 'La encuesta binaria está mal configurada' using errcode = 'check_violation';
    end if;
  end if;

  new.poll_type := v_poll.type;
  return new;
end;
$$;

drop trigger if exists poll_votes_prepare on public.poll_votes;
create trigger poll_votes_prepare
  before insert on public.poll_votes
  for each row execute function public.prepare_poll_vote();

-- El tipo de encuesta no puede cambiar una vez que hay votos (el FK compuesto
-- haría cascade, pero el índice único parcial dejaría de tener sentido).
create or replace function public.freeze_poll_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type is distinct from old.type
     and exists (select 1 from public.poll_votes where poll_id = old.id) then
    raise exception 'No se puede cambiar el tipo de una encuesta que ya tiene votos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists polls_freeze_type on public.polls;
create trigger polls_freeze_type
  before update of type on public.polls
  for each row execute function public.freeze_poll_type();

-- ¿Puede este usuario ver los resultados agregados?
create or replace function public.can_see_poll_results(p_poll uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p.results_visibility
    when 'always' then true
    when 'after_close' then
      p.status = 'closed' or (p.closes_at is not null and p.closes_at <= now())
    when 'after_vote' then
      p.status = 'closed'
      or (p.closes_at is not null and p.closes_at <= now())
      or (p_user is not null and exists (
            select 1 from public.poll_votes v
            where v.poll_id = p.id and v.user_id = p_user
          ))
    else false
  end
  from public.polls p
  where p.id = p_poll;
$$;

grant execute on function public.can_see_poll_results(uuid, uuid) to authenticated, anon;

-- Resultados agregados. Devuelve 0 filas si el usuario todavía no puede verlos:
-- la confidencialidad se resuelve en el motor, no en la UI.
create or replace function public.poll_results(p_poll uuid)
returns table (
  option_id  uuid,
  label      text,
  sort_order smallint,
  votes      bigint,
  percentage numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select o.id, o.label, o.sort_order, count(v.id) as votes
    from public.poll_options o
    left join public.poll_votes v on v.option_id = o.id
    where o.poll_id = p_poll
    group by o.id, o.label, o.sort_order
  ),
  total as (select coalesce(sum(counts.votes), 0) as t from counts)
  select c.id, c.label, c.sort_order, c.votes,
         case when t.t = 0 then 0::numeric
              else round((c.votes * 100.0) / t.t, 1)
         end
  from counts c
  cross join total t
  where public.can_see_poll_results(p_poll)
  order by c.sort_order asc, c.label asc;
$$;

grant execute on function public.poll_results(uuid) to authenticated, anon;

-- Métricas de cabecera: siempre visibles (no revelan la distribución).
create or replace function public.poll_stats(p_poll uuid)
returns table (
  total_votes  bigint,
  total_voters bigint,
  has_voted    boolean,
  can_see      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.poll_votes where poll_id = p_poll),
    (select count(distinct user_id) from public.poll_votes where poll_id = p_poll),
    (auth.uid() is not null and exists (
      select 1 from public.poll_votes where poll_id = p_poll and user_id = auth.uid()
    )),
    public.can_see_poll_results(p_poll);
$$;

grant execute on function public.poll_stats(uuid) to authenticated, anon;

-- Desglose por sub-comunidad hija directa (base del futuro mapa de calor).
create or replace function public.poll_results_by_child(p_poll uuid)
returns table (
  child_id    uuid,
  child_name  text,
  child_emoji text,
  option_id   uuid,
  votes       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select child.id, child.name, child.emoji, v.option_id, count(*)::bigint
  from public.poll_votes v
  join public.polls p        on p.id = v.poll_id
  join public.communities pc on pc.id = p.community_id
  join public.profiles pr    on pr.id = v.user_id
  join public.communities home on home.id = pr.home_community_id
  join public.communities child
    on child.parent_id = pc.id
   and (home.path = child.path or home.path like child.path || '.%')
  where v.poll_id = p_poll
    and public.can_see_poll_results(p_poll)
  group by child.id, child.name, child.emoji, v.option_id
  order by child.name asc;
$$;

grant execute on function public.poll_results_by_child(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Debates: la columna debe ser hija directa de la comunidad del debate
-- -----------------------------------------------------------------------------
create or replace function public.enforce_debate_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debate public.debates%rowtype;
  v_last   timestamptz;
begin
  select * into v_debate from public.debates where id = new.debate_id;
  if not found then
    raise exception 'El debate no existe' using errcode = 'foreign_key_violation';
  end if;

  if v_debate.status <> 'open' then
    raise exception 'Este debate está cerrado' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.communities
    where id = new.column_community_id and parent_id = v_debate.community_id
  ) then
    raise exception 'La columna no es una sub-comunidad directa de este debate'
      using errcode = 'check_violation';
  end if;

  -- Rate limit autoritativo: 1 comentario cada 15 segundos por usuario.
  select max(created_at) into v_last
  from public.debate_comments
  where user_id = new.user_id;

  if v_last is not null and v_last > now() - interval '15 seconds' then
    raise exception 'Esperá unos segundos antes de comentar de nuevo'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists debate_comments_validate on public.debate_comments;
create trigger debate_comments_validate
  before insert on public.debate_comments
  for each row execute function public.enforce_debate_column();

-- score de comentarios
create or replace function public.sync_comment_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment uuid;
begin
  v_comment := coalesce(new.comment_id, old.comment_id);
  update public.debate_comments
     set score = coalesce((
       select sum(value) from public.comment_votes where comment_id = v_comment
     ), 0)
   where id = v_comment;
  return null;
end;
$$;

drop trigger if exists comment_votes_sync_score on public.comment_votes;
create trigger comment_votes_sync_score
  after insert or update or delete on public.comment_votes
  for each row execute function public.sync_comment_score();

-- Conteo de comentarios por columna, para los headers de la grilla.
create or replace function public.debate_column_counts(p_debate uuid)
returns table (column_community_id uuid, comment_count bigint)
language sql
stable
as $$
  select c.column_community_id, count(*)::bigint
  from public.debate_comments c
  where c.debate_id = p_debate and c.status = 'visible'
  group by c.column_community_id;
$$;

-- -----------------------------------------------------------------------------
-- Reclamos: support_count
-- -----------------------------------------------------------------------------
create or replace function public.sync_claim_support_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim uuid;
begin
  v_claim := coalesce(new.claim_id, old.claim_id);
  update public.claims
     set support_count = (select count(*) from public.claim_supports where claim_id = v_claim)
   where id = v_claim;
  return null;
end;
$$;

drop trigger if exists claim_supports_sync_count on public.claim_supports;
create trigger claim_supports_sync_count
  after insert or delete on public.claim_supports
  for each row execute function public.sync_claim_support_count();

-- -----------------------------------------------------------------------------
-- Proyectos: pledged_total
-- -----------------------------------------------------------------------------
create or replace function public.sync_pledged_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  v_project := coalesce(new.project_id, old.project_id);
  update public.projects
     set pledged_total = coalesce((
       select sum(amount) from public.project_pledges where project_id = v_project
     ), 0)
   where id = v_project;
  return null;
end;
$$;

drop trigger if exists project_pledges_sync_total on public.project_pledges;
create trigger project_pledges_sync_total
  after insert or update or delete on public.project_pledges
  for each row execute function public.sync_pledged_total();

-- -----------------------------------------------------------------------------
-- community_info.updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_info_touch on public.community_info;
create trigger community_info_touch
  before update on public.community_info
  for each row execute function public.touch_updated_at();
