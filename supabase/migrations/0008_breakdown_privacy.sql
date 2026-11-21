-- =============================================================================
-- Agorbis · 0008 · Umbral de anonimato en el desglose por sub-comunidad
-- -----------------------------------------------------------------------------
-- El desglose "cómo votó cada provincia" es contenido genuinamente valioso,
-- pero con pocos votantes deja de ser una estadística y pasa a ser una lista.
-- Si en una sub-comunidad votaron dos personas y el desglose dice 1 y 1,
-- cualquiera que sepa quiénes viven ahí puede deducir el voto de cada una.
--
-- El umbral se aplica acá y no en la UI: es una promesa del producto (el voto
-- es secreto), y una promesa que sólo cumple la capa de presentación no es una
-- promesa. La función es la única vía de acceso a estos agregados.
-- =============================================================================

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
  with per_child_option as (
    select
      child.id    as child_id,
      child.name  as child_name,
      child.emoji as child_emoji,
      v.option_id as option_id,
      count(*)::bigint as votes
    from public.poll_votes v
    join public.polls p          on p.id = v.poll_id
    join public.communities pc   on pc.id = p.community_id
    join public.profiles pr      on pr.id = v.user_id
    join public.communities home on home.id = pr.home_community_id
    join public.communities child
      on child.parent_id = pc.id
     and (home.path = child.path or home.path like child.path || '.%')
    where v.poll_id = p_poll
      and public.can_see_poll_results(p_poll)
    group by child.id, child.name, child.emoji, v.option_id
  ),
  totals as (
    select child_id, sum(votes) as total
    from per_child_option
    group by child_id
  )
  select c.child_id, c.child_name, c.child_emoji, c.option_id, c.votes
  from per_child_option c
  join totals t on t.child_id = c.child_id
  -- Umbral de k-anonimato. Ver MIN_BREAKDOWN_VOTES en src/lib/constants.ts.
  where t.total >= 5
  order by c.child_name asc;
$$;

comment on function public.poll_results_by_child(uuid) is
  'Desglose por sub-comunidad hija directa. Omite las que tienen menos de 5 votos: con menos, el agregado permite deducir votos individuales.';

grant execute on function public.poll_results_by_child(uuid) to authenticated, anon;
