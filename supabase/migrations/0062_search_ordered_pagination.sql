-- Ordenar el conjunto completo antes de LIMIT/OFFSET. El motor anterior y la
-- firma pública de seis argumentos siguen disponibles durante el despliegue.
-- La identidad (kind, id) desempata incluso títulos, fechas y relevancia iguales.

create function private.global_search_ordered(
  p_query text,
  p_kind text,
  p_community uuid,
  p_status text,
  p_limit integer,
  p_offset integer,
  p_sort text
)
returns table (
  kind text,
  id uuid,
  title text,
  summary text,
  status text,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  href text,
  created_at timestamptz,
  rank integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with term as (
    select public.search_normalize(trim(p_query)) value
  ), scope as (
    select path from public.communities where id = p_community
  ), matches as (
    select 'community'::text kind, c.id, c.name title, c.description summary,
      'available'::text status, c.id community_id, c.slug community_slug,
      c.name community_name, c.emoji community_emoji, '/c/' || c.slug href,
      c.created_at,
      case when public.search_normalize(c.name) = t.value then 100
        when public.search_normalize(c.name) like t.value || '%' then 60
        when public.search_normalize(c.name) like '%' || t.value || '%' then 35 else 10 end rank
    from public.communities c cross join term t
    where (p_kind is null or p_kind = 'community')
      and length(t.value) >= 2
      and public.search_normalize(c.name || ' ' || coalesce(c.description, '')) like '%' || t.value || '%'
      and (p_community is null or exists (
        select 1 from scope s where c.path = s.path or c.path like s.path || '.%'
      ))

    union all
    select 'poll', p.id, p.question, p.description, p.status, c.id, c.slug, c.name, c.emoji,
      '/encuestas/' || p.id, p.created_at,
      case when public.search_normalize(p.question) = t.value then 100
        when public.search_normalize(p.question) like t.value || '%' then 60
        when public.search_normalize(p.question) like '%' || t.value || '%' then 35 else 10 end
    from public.polls p join public.communities c on c.id = p.community_id cross join term t
    where (p_kind is null or p_kind = 'poll') and p.status <> 'removed' and length(t.value) >= 2
      and public.search_normalize(p.question || ' ' || coalesce(p.description, '')) like '%' || t.value || '%'
      and (p_community is null or exists (select 1 from scope s where c.path = s.path or c.path like s.path || '.%'))

    union all
    select 'debate', d.id, d.title, left(d.body, 360), d.status, c.id, c.slug, c.name, c.emoji,
      '/debates/' || d.id, d.created_at,
      case when public.search_normalize(d.title) = t.value then 100
        when public.search_normalize(d.title) like t.value || '%' then 60
        when public.search_normalize(d.title) like '%' || t.value || '%' then 35 else 10 end
    from public.debates d join public.communities c on c.id = d.community_id cross join term t
    where (p_kind is null or p_kind = 'debate') and d.status <> 'removed' and length(t.value) >= 2
      and public.search_normalize(d.title || ' ' || d.body) like '%' || t.value || '%'
      and (p_community is null or exists (select 1 from scope s where c.path = s.path or c.path like s.path || '.%'))

    union all
    select 'claim', cl.id, cl.title, left(cl.description, 360), cl.status, c.id, c.slug, c.name, c.emoji,
      '/reclamos/' || cl.id, cl.created_at,
      case when public.search_normalize(cl.title) = t.value then 100
        when public.search_normalize(cl.title) like t.value || '%' then 60
        when public.search_normalize(cl.title) like '%' || t.value || '%' then 35 else 10 end
    from public.claims cl join public.communities c on c.id = cl.community_id cross join term t
    where (p_kind is null or p_kind = 'claim') and cl.status <> 'removed' and length(t.value) >= 2
      and public.search_normalize(cl.title || ' ' || cl.description) like '%' || t.value || '%'
      and (p_community is null or exists (select 1 from scope s where c.path = s.path or c.path like s.path || '.%'))

    union all
    select 'project', pr.id, pr.title, pr.summary, pr.status, c.id, c.slug, c.name, c.emoji,
      '/proyectos/' || pr.id, pr.created_at,
      case when public.search_normalize(pr.title) = t.value then 100
        when public.search_normalize(pr.title) like t.value || '%' then 60
        when public.search_normalize(pr.title) like '%' || t.value || '%' then 35 else 10 end
    from public.projects pr join public.communities c on c.id = pr.community_id cross join term t
    where (p_kind is null or p_kind = 'project') and pr.status <> 'removed' and length(t.value) >= 2
      and public.search_normalize(pr.title || ' ' || pr.summary || ' ' || pr.plan) like '%' || t.value || '%'
      and (p_community is null or exists (select 1 from scope s where c.path = s.path or c.path like s.path || '.%'))

    union all
    select 'institution', o.id, o.name, o.description, 'verified', c.id, c.slug, c.name, c.emoji,
      '/instituciones/' || o.slug, o.created_at,
      case when public.search_normalize(o.name) = t.value then 100
        when public.search_normalize(o.name) like t.value || '%' then 60
        when public.search_normalize(o.name) like '%' || t.value || '%' then 35 else 10 end
    from public.organizations o left join public.communities c on c.id = o.community_id cross join term t
    where (p_kind is null or p_kind = 'institution') and o.verified_at is not null and length(t.value) >= 2
      and public.search_normalize(o.name || ' ' || coalesce(o.description, '')) like '%' || t.value || '%'
      and (p_community is null or exists (select 1 from scope s where c.path = s.path or c.path like s.path || '.%'))
  ), filtered as (
    select * from matches where p_status is null or status = p_status
  )
  select f.kind, f.id, f.title, f.summary, f.status, f.community_id,
    f.community_slug, f.community_name, f.community_emoji, f.href, f.created_at,
    f.rank, count(*) over() total_count
  from filtered f
  order by
    case when p_sort = 'recientes' then f.created_at end desc nulls last,
    f.rank desc, f.created_at desc,
    f.title collate "C", f.kind collate "C", f.id
  limit greatest(1, least(p_limit, 50)) offset greatest(p_offset, 0);
$$;


create function public.global_search(
  p_query text,
  p_kind text,
  p_community uuid,
  p_status text,
  p_limit integer,
  p_offset integer,
  p_sort text
)
returns table (
  kind text,
  id uuid,
  title text,
  summary text,
  status text,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  href text,
  created_at timestamptz,
  rank integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_query text;
begin
  if p_query is null
     or char_length(btrim(p_query)) < 3
     or char_length(btrim(p_query)) > 100 then
    return;
  end if;
  if p_kind is not null
     and p_kind not in ('community', 'poll', 'debate', 'claim', 'project', 'institution') then
    return;
  end if;
  if p_sort is null or p_sort not in ('relevancia', 'recientes') then
    return;
  end if;
  v_query := replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select * from private.global_search_ordered(
    v_query, p_kind, p_community, nullif(p_status, ''),
    least(greatest(coalesce(p_limit, 24), 1), 50),
    least(greatest(coalesce(p_offset, 0), 0), 500),
    p_sort
  );
end;
$$;

-- Sin defaults en la sobrecarga nueva: PostgREST distingue las llamadas por
-- p_sort; una petición del cliente anterior no se vuelve ambigua.
create or replace function public.global_search(
  p_query text,
  p_kind text default null,
  p_community uuid default null,
  p_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  kind text,
  id uuid,
  title text,
  summary text,
  status text,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  href text,
  created_at timestamptz,
  rank integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.global_search(
    p_query, p_kind, p_community, p_status, p_limit,
    least(greatest(coalesce(p_offset, 0), 0), 500), 'relevancia'
  );
$$;

revoke all on function private.global_search_ordered(text, text, uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.global_search(text, text, uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.global_search(text, text, uuid, text, integer, integer, text)
  to anon, authenticated;
-- CREATE OR REPLACE conserva la ACL de la firma antigua; se declara también
-- para que ambas fachadas mantengan el contrato de lectura pública existente.
revoke all on function public.global_search(text, text, uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.global_search(text, text, uuid, text, integer, integer)
  to anon, authenticated;
