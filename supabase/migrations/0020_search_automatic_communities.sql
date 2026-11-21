-- =============================================================================
-- Agorbis · 0020 · Comunidades automáticas y búsqueda global
-- =============================================================================

begin;

create extension if not exists pg_trgm with schema extensions;

create or replace function public.search_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select translate(lower(coalesce(p_value, '')),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc');
$$;

create or replace function public.community_slugify(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(public.search_normalize(p_value), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$;

create index if not exists communities_global_search_idx on public.communities
  using gin ((public.search_normalize(name || ' ' || coalesce(description, ''))) extensions.gin_trgm_ops);
create index if not exists polls_global_search_idx on public.polls
  using gin ((public.search_normalize(question || ' ' || coalesce(description, ''))) extensions.gin_trgm_ops);
create index if not exists debates_global_search_idx on public.debates
  using gin ((public.search_normalize(title || ' ' || body)) extensions.gin_trgm_ops);
create index if not exists claims_global_search_idx on public.claims
  using gin ((public.search_normalize(title || ' ' || description)) extensions.gin_trgm_ops);
create index if not exists projects_global_search_idx on public.projects
  using gin ((public.search_normalize(title || ' ' || summary || ' ' || plan)) extensions.gin_trgm_ops);
create index if not exists organizations_global_search_idx on public.organizations
  using gin ((public.search_normalize(name || ' ' || coalesce(description, ''))) extensions.gin_trgm_ops);

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
set search_path = public
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
  order by f.rank desc, f.created_at desc, f.title
  limit greatest(1, least(p_limit, 50)) offset greatest(p_offset, 0);
$$;

grant execute on function public.global_search(text, text, uuid, text, integer, integer) to anon, authenticated;

create or replace function public.approve_community_request(
  p_request uuid,
  p_parent uuid default null,
  p_slug text default null,
  p_emoji text default null,
  p_description text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_resolution_note text default null
)
returns table (id uuid, slug text, name text, level smallint, path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.community_requests%rowtype;
  v_parent public.communities%rowtype;
  v_level smallint;
  v_base text;
  v_slug text;
  v_suffix integer := 2;
  v_created public.communities%rowtype;
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Sin permisos'; end if;

  select * into v_request from public.community_requests
  where community_requests.id = p_request and status in ('pending', 'reviewing')
  for update;
  if not found then raise exception 'Solicitud inexistente o ya resuelta'; end if;

  select * into v_parent from public.communities
  where communities.id = coalesce(p_parent, v_request.parent_community_id);
  if not found then raise exception 'Elegí una comunidad superior válida'; end if;

  v_level := case v_request.requested_level
    when 'province' then 3 when 'city' then 4 when 'neighborhood' then 5 end;
  if v_parent.level <> v_level - 1 then
    raise exception 'El nivel solicitado requiere una comunidad superior de nivel %', v_level - 1;
  end if;

  if exists (
    select 1 from public.communities c
    where c.parent_id = v_parent.id
      and public.search_normalize(c.name) = public.search_normalize(v_request.requested_name)
  ) then
    raise exception 'Ya existe una comunidad con ese nombre dentro de %', v_parent.name;
  end if;

  v_base := public.community_slugify(coalesce(nullif(trim(p_slug), ''), v_request.requested_name));
  if v_base = '' then raise exception 'No pudimos generar un slug válido'; end if;
  v_slug := v_base;
  if exists (select 1 from public.communities c where c.slug = v_slug) then
    v_slug := public.community_slugify(v_parent.slug || '-' || v_base);
  end if;
  while exists (select 1 from public.communities c where c.slug = v_slug) loop
    v_slug := public.community_slugify(v_parent.slug || '-' || v_base || '-' || v_suffix);
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.communities (
    slug, name, level, parent_id, path, emoji, description, lat, lng
  ) values (
    v_slug, v_request.requested_name, v_level, v_parent.id,
    v_parent.path || '.' || v_slug,
    coalesce(nullif(trim(p_emoji), ''), case v_level when 3 then '🗺️' when 4 then '🏙️' else '🏘️' end),
    coalesce(nullif(trim(p_description), ''), v_request.requested_name || ' · ' || v_parent.name),
    p_lat, p_lng
  ) returning * into v_created;

  update public.community_requests
  set status = 'approved', parent_community_id = v_parent.id,
    created_community_id = v_created.id, reviewed_by = auth.uid(), reviewed_at = now(),
    resolution_note = coalesce(nullif(trim(p_resolution_note), ''),
      'Comunidad creada: ' || v_created.name || ' (/' || v_created.slug || ')')
  where community_requests.id = p_request;

  return query select v_created.id, v_created.slug, v_created.name, v_created.level, v_created.path;
end;
$$;

grant execute on function public.approve_community_request(uuid, uuid, text, text, text, double precision, double precision, text) to authenticated;

commit;
