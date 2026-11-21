-- =============================================================================
-- Agorbis · 0011 · Identidad pública opcional: listado de miembros y voto público
-- -----------------------------------------------------------------------------
-- Dos features nuevas, con la misma forma:
--   1. Ver quiénes son miembros de una comunidad — por defecto visible, cada
--      quien puede pasar a anónimo en esa comunidad puntual.
--   2. Al votar una encuesta, elegir mostrar el nombre junto al voto — por
--      defecto secreto (mantiene D3), cada quien puede optar por revelarlo.
--
-- Los defaults son opuestos a propósito. Ser miembro de un lugar no es
-- sensible del mismo modo que una preferencia de voto: el producto existe para
-- que la gente se conozca ("conocerse" es el primer verbo de la visión), así
-- que la lista de miembros empieza visible. El voto, en cambio, ya es secreto
-- por diseño (D3): revelarlo tiene que ser un gesto explícito, nunca el default.
-- =============================================================================

-- =============================================================================
-- PARTE 1 · Miembros públicos por comunidad
-- =============================================================================

-- Sin fila = visible. La tabla sólo guarda las excepciones (quien pidió ser
-- anónimo en una comunidad puntual), no una fila por cada persona y comunidad.
create table if not exists public.community_visibility (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  is_anonymous boolean not null default false,
  updated_at   timestamptz not null default now(),

  primary key (user_id, community_id)
);

comment on table public.community_visibility is
  'Preferencia de visibilidad por (usuario, comunidad). Sin fila = visible. Es por comunidad y no global: alguien puede mostrarse en su ciudad y pedir anonimato a nivel país.';

create index if not exists community_visibility_community_idx
  on public.community_visibility (community_id) where is_anonymous;

create or replace function public.touch_updated_at_visibility()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_visibility_touch on public.community_visibility;
create trigger community_visibility_touch
  before update on public.community_visibility
  for each row execute function public.touch_updated_at_visibility();

alter table public.community_visibility enable row level security;

-- La tabla es privada: una fila con is_anonymous=true revela, por su sola
-- existencia, que ese usuario es miembro de esa comunidad — exactamente lo que
-- alguien que pidió anonimato no quiere exponer. Los listados públicos van por
-- las funciones de abajo, que sólo devuelven identidad para quienes NO son
-- anónimos y agregan al resto en un número.
drop policy if exists community_visibility_select_own on public.community_visibility;
create policy community_visibility_select_own on public.community_visibility
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists community_visibility_insert_own on public.community_visibility;
create policy community_visibility_insert_own on public.community_visibility
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(auth.uid(), community_id));

drop policy if exists community_visibility_update_own on public.community_visibility;
create policy community_visibility_update_own on public.community_visibility
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(auth.uid(), community_id));

-- -----------------------------------------------------------------------------
-- Listado de miembros públicos, paginado por cursor (username).
-- `security definer`: filtra a mano lo que la RLS de arriba no dejaría leer
-- directo (que es el punto — nadie más lee la tabla, ni siquiera esta función
-- por sus datos crudos, sólo el resultado ya filtrado).
-- -----------------------------------------------------------------------------
create or replace function public.community_public_members(
  p_community      uuid,
  p_after_username text default null,
  p_limit          int default 100
)
returns table (
  user_id      uuid,
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
  join public.communities home   on home.id = pr.home_community_id
  join public.communities target on target.id = p_community
  where (home.path = target.path or home.path like target.path || '.%')
    and coalesce(
      (select cv.is_anonymous from public.community_visibility cv
       where cv.user_id = pr.id and cv.community_id = p_community),
      false
    ) = false
    and (p_after_username is null or pr.username > p_after_username)
  order by pr.username asc
  limit least(greatest(p_limit, 1), 500);
$$;

grant execute on function public.community_public_members(uuid, text, int) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Conteo público / anónimo. `public_count + anonymous_count` puede ser menor a
-- `communities.member_count` en el instante entre que alguien cambia de
-- residencia y el trigger de conteo corre; son dos números con propósitos
-- distintos (uno cuenta gente, el otro cuenta filas de preferencia) y no hace
-- falta que cuadren al bit.
-- -----------------------------------------------------------------------------
create or replace function public.community_member_visibility_counts(p_community uuid)
returns table (public_count bigint, anonymous_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with members as (
    select pr.id,
           coalesce(
             (select cv.is_anonymous from public.community_visibility cv
              where cv.user_id = pr.id and cv.community_id = p_community),
             false
           ) as is_anonymous
    from public.profiles pr
    join public.communities home   on home.id = pr.home_community_id
    join public.communities target on target.id = p_community
    where home.path = target.path or home.path like target.path || '.%'
  )
  select
    count(*) filter (where not is_anonymous),
    count(*) filter (where is_anonymous)
  from members;
$$;

grant execute on function public.community_member_visibility_counts(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Preferencia propia de un usuario en una comunidad puntual (para pintar el
-- toggle ya en su estado real, sin adivinar por ausencia de fila).
-- -----------------------------------------------------------------------------
create or replace function public.my_community_visibility(p_user uuid, p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cv.is_anonymous from public.community_visibility cv
     where cv.user_id = p_user and cv.community_id = p_community),
    false
  );
$$;

grant execute on function public.my_community_visibility(uuid, uuid) to authenticated;

-- =============================================================================
-- PARTE 2 · Voto público opcional
-- =============================================================================

-- Default `true`: si por lo que sea una fila se inserta sin especificar nada,
-- que sea secreta. La action siempre manda el valor explícito según el
-- checkbox, así que este default es un cinturón de seguridad, no el camino
-- normal.
alter table public.poll_votes
  add column if not exists is_anonymous boolean not null default true;

comment on column public.poll_votes.is_anonymous is
  'Elegido al votar, inmutable como el voto mismo. false = el usuario aceptó mostrar su nombre junto a esta opción.';

-- No se toca la RLS de `poll_votes`: sigue siendo `select` sólo de la fila
-- propia (D3). Los votos públicos se leen exclusivamente a través de las
-- funciones de abajo, que son `security definer` y por lo tanto no dependen de
-- esa policy — el mismo patrón que ya usan `poll_results`/`poll_feed` (D9),
-- con la misma advertencia de D44: si el día de mañana cambia la regla de
-- `can_see_poll_results`, hay que revisar también estas dos funciones.

-- -----------------------------------------------------------------------------
-- Quiénes votaron cada opción, entre los que eligieron mostrarse.
-- -----------------------------------------------------------------------------
create or replace function public.poll_option_voters(p_poll uuid)
returns table (
  option_id    uuid,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.option_id, pr.id, pr.username, pr.display_name, pr.avatar_url
  from public.poll_votes v
  join public.profiles pr on pr.id = v.user_id
  where v.poll_id = p_poll
    and v.is_anonymous = false
    and public.can_see_poll_results(p_poll)
  order by pr.username asc;
$$;

grant execute on function public.poll_option_voters(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Cuántos votaron cada opción de forma anónima. Es un agregado puro — a
-- diferencia del desglose por sub-comunidad (D42), acá no hace falta un umbral
-- de k-anonimato: nadie queda identificado por accidente, porque el número no
-- cruza con ningún otro dato (ubicación, actividad); el usuario ya decidió
-- activamente no revelarse, y contarlo no lo revela.
-- -----------------------------------------------------------------------------
create or replace function public.poll_option_anonymous_counts(p_poll uuid)
returns table (option_id uuid, anonymous_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.option_id, count(*)::bigint
  from public.poll_votes v
  where v.poll_id = p_poll
    and v.is_anonymous = true
    and public.can_see_poll_results(p_poll)
  group by v.option_id;
$$;

grant execute on function public.poll_option_anonymous_counts(uuid) to authenticated, anon;
