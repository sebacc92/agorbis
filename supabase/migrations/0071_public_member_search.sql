-- Búsqueda de miembros públicos antes del cursor y LIMIT, sin ampliar su
-- visibilidad: sin opt-in explícito la identidad sigue siendo anónima.
-- La firma de tres argumentos queda intacta para el Worker anterior.
-- Reversión tras restaurar el Worker anterior:
-- drop function public.community_public_members(uuid, text, integer, text, boolean);
create function public.community_public_members(
  p_community uuid,
  p_after_username text,
  p_limit integer,
  p_query text,
  p_with_photo boolean
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
    and (coalesce(btrim(p_query), '') = ''
      or strpos(lower(pr.username), lower(left(btrim(p_query), 100))) > 0
      or strpos(lower(coalesce(pr.display_name, '')), lower(left(btrim(p_query), 100))) > 0)
    and (not coalesce(p_with_photo, false) or nullif(btrim(pr.avatar_url), '') is not null)
    and (p_after_username is null or pr.username > p_after_username)
  order by pr.username
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.community_public_members(uuid, text, integer, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.community_public_members(uuid, text, integer, text, boolean)
  to anon, authenticated;
