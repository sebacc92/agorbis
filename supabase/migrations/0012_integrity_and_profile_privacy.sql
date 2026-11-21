-- =============================================================================
-- Agorbis · 0012 · Integridad de moderación, cuotas concurrentes y privacidad
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Restaurar contenido tiene que devolverlo al estado que tenía antes de que
-- moderación lo ocultara. "open" no es válido para encuestas ni proyectos.
-- -----------------------------------------------------------------------------
alter table public.polls
  add column if not exists status_before_removal text;
alter table public.debates
  add column if not exists status_before_removal text;
alter table public.claims
  add column if not exists status_before_removal text;
alter table public.projects
  add column if not exists status_before_removal text;

-- Las filas que ya estaban ocultas no guardaban su estado previo. Se les da un
-- fallback válido y conservador; desde esta migración el trigger preserva el
-- estado exacto en cada transición.
update public.polls
   set status_before_removal = case
     when closes_at is not null and closes_at <= now() then 'closed'
     else 'active'
   end
 where status = 'removed' and status_before_removal is null;

update public.debates
   set status_before_removal = 'open'
 where status = 'removed' and status_before_removal is null;

update public.claims
   set status_before_removal = 'open'
 where status = 'removed' and status_before_removal is null;

update public.projects
   set status_before_removal = 'proposal'
 where status = 'removed' and status_before_removal is null;

create or replace function public.stamp_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    new.status_before_removal := old.status;
    new.removed_by := auth.uid();
    new.removed_at := now();
  elsif old.status = 'removed' and new.status <> 'removed' then
    -- La action manda un fallback válido por tabla; si hay estado guardado,
    -- éste gana para restaurar exactamente la situación anterior.
    new.status := coalesce(old.status_before_removal, new.status);
    new.status_before_removal := null;
    new.removed_by := null;
    new.removed_at := null;
  elsif new.status <> 'removed' then
    new.status_before_removal := null;
    new.removed_by := null;
    new.removed_at := null;
  else
    -- Ya estaba oculto: no permitir alterar su historial.
    new.status_before_removal := old.status_before_removal;
    new.removed_by := old.removed_by;
    new.removed_at := old.removed_at;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- La cuota se decide contando publicaciones. Sin serialización, dos inserts
-- concurrentes podían observar el mismo cupo restante y ambos pasar. Un lock
-- transaccional por usuario/nivel/tipo/mes hace que el segundo recalcule después
-- del commit del primero.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_content_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type      text;
  v_level     smallint;
  v_remaining int;
begin
  if auth.uid() is null then
    return new;
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
-- `profiles` contiene la residencia, el rol y la verificación: no puede ser
-- legible entero si una persona eligió aparecer anónima en una comunidad.
-- Las pantallas públicas usan las funciones siguientes, que sólo revelan los
-- campos de identidad que el producto necesita mostrar.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_own_or_moderator on public.profiles;
create policy profiles_select_own_or_moderator on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_moderator(auth.uid()));

create or replace function public.public_profile(p_user uuid)
returns table (
  id           uuid,
  username     text,
  display_name text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url
  from public.profiles pr
  where pr.id = p_user;
$$;

create or replace function public.public_profiles(p_users uuid[])
returns table (
  id           uuid,
  username     text,
  display_name text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url
  from public.profiles pr
  where pr.id = any(coalesce(p_users, '{}'::uuid[]));
$$;

revoke all on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to authenticated, anon;
revoke all on function public.public_profiles(uuid[]) from public;
grant execute on function public.public_profiles(uuid[]) to authenticated, anon;
