-- =============================================================================
-- Agorbis · 0006 · Feed de encuestas
-- -----------------------------------------------------------------------------
-- Las tarjetas del listado necesitan el total de votos de cada encuesta, pero
-- `poll_votes` está restringida por RLS a los votos propios (el voto es
-- secreto). Un `count` embebido de PostgREST devolvería 1 en vez del total.
--
-- Esta función `security definer` calcula los agregados en el motor y devuelve
-- sólo números, sin exponer quién votó qué. Incluye paginación por cursor
-- (created_at, id) para no depender de OFFSET.
-- =============================================================================

create or replace function public.poll_feed(
  p_community      uuid,
  p_limit          int default 20,
  p_before_created timestamptz default null,
  p_before_id      uuid default null
)
returns table (
  id           uuid,
  question     text,
  description  text,
  type         text,
  status       text,
  closes_at    timestamptz,
  created_at   timestamptz,
  option_count bigint,
  total_votes  bigint,
  has_voted    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.question, p.description, p.type, p.status, p.closes_at, p.created_at,
    (select count(*) from public.poll_options o where o.poll_id = p.id),
    (select count(*) from public.poll_votes v where v.poll_id = p.id),
    (auth.uid() is not null and exists (
      select 1 from public.poll_votes v
      where v.poll_id = p.id and v.user_id = auth.uid()
    ))
  from public.polls p
  where p.community_id = p_community
    -- Se replica la policy de lectura: `security definer` ignora RLS, así que
    -- la visibilidad hay que aplicarla acá a mano.
    and (p.status <> 'removed' or public.is_moderator(auth.uid()))
    and (
      p_before_created is null
      or (p.created_at, p.id) < (p_before_created, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.poll_feed(uuid, int, timestamptz, uuid) to authenticated, anon;

comment on function public.poll_feed(uuid, int, timestamptz, uuid) is
  'Encuestas de una comunidad con agregados, sin revelar votos individuales. Paginación por cursor.';
