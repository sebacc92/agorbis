-- =============================================================================
-- 0037 · El feed de inicio pagina (ítem 4 de la lista de mejoras)
-- =============================================================================
-- `/inicio` traía 60 filas y ahí se terminaba: sin "ver más" y sin ningún
-- cartel que lo dijera. Quien participa en una cadena activa llegaba al fondo y
-- la app simplemente dejaba de tener contenido, sin explicación.
--
-- El `order by f.created_at desc, f.id desc` que ya tenía la función admite un
-- cursor por keyset tal cual, así que sólo faltaban los parámetros. Se compara
-- la tupla `(created_at, id)` y no `created_at` sola: dos publicaciones del
-- mismo instante harían desaparecer a la segunda al pasar de página, que es
-- exactamente el defecto que se corrigió en D65 para los otros listados.
--
-- Hay que borrar la versión de dos argumentos antes de crear la de cuatro: con
-- las dos presentes, una llamada de dos argumentos coincide con ambas y
-- Postgres la rechaza por ambigua.
-- -----------------------------------------------------------------------------

drop function if exists public.personalized_feed(uuid, integer);

create or replace function public.personalized_feed(
  p_user           uuid,
  p_limit          integer default 40,
  p_before_created timestamptz default null,
  p_before_id      uuid default null
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
set search_path = public
as $$
  with home as (
    select c.path from public.profiles p
    join public.communities c on c.id = p.home_community_id
    where p.id = p_user and p_user = auth.uid()
  ), chain as (
    select c.* from public.communities c, home h
    where h.path = c.path or h.path like c.path || '.%'
  ), feed as (
    select p.id, 'poll'::text kind, c.id community_id, c.slug, c.name, c.emoji,
      p.question title, p.description summary, p.status,
      (select count(distinct user_id) from public.poll_votes v where v.poll_id = p.id)::numeric engagement,
      p.created_at
    from public.polls p join chain c on c.id = p.community_id where p.status <> 'removed'
    union all
    select d.id, 'debate', c.id, c.slug, c.name, c.emoji, d.title, left(d.body, 300), d.status,
      (select count(*) from public.debate_comments dc where dc.debate_id = d.id and dc.status = 'visible')::numeric,
      d.created_at
    from public.debates d join chain c on c.id = d.community_id where d.status <> 'removed'
    union all
    select cl.id, 'claim', c.id, c.slug, c.name, c.emoji, cl.title, left(cl.description, 300), cl.status,
      cl.support_count::numeric, cl.created_at
    from public.claims cl join chain c on c.id = cl.community_id where cl.status <> 'removed'
    union all
    select pr.id, 'project', c.id, c.slug, c.name, c.emoji, pr.title, pr.summary, pr.status,
      ((select count(*) from public.project_contributions pc where pc.project_id = pr.id)
        + (select count(*) from public.project_pledges pp where pp.project_id = pr.id))::numeric,
      pr.created_at
    from public.projects pr join chain c on c.id = pr.community_id where pr.status <> 'removed'
  )
  select f.id, f.kind, f.community_id, f.slug, f.name, f.emoji, f.title, f.summary,
    f.status, f.engagement, f.created_at
  from feed f
  where p_before_created is null
     or (f.created_at, f.id) < (p_before_created,
                                coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by f.created_at desc, f.id desc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function
  public.personalized_feed(uuid, integer, timestamptz, uuid) to authenticated;
