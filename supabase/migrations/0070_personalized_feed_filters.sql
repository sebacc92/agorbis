-- Inicio filtra el conjunto completo antes del límite, con una sola lectura.
-- La firma anterior se conserva para que el Worker previo siga funcionando.
-- Reversión: desplegar el Worker previo y borrar solamente esta sobrecarga con
-- drop function public.personalized_feed(uuid, integer, timestamptz, uuid, text, text);
create function public.personalized_feed(
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
    where p.status <> 'removed' and (p_kind is null or p_kind = 'poll')
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

revoke all on function public.personalized_feed(uuid, integer, timestamptz, uuid, text, text)
  from public, anon;
grant execute on function public.personalized_feed(uuid, integer, timestamptz, uuid, text, text)
  to authenticated;
