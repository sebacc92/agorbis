-- =============================================================================
-- 0029 · Contraste entre comunidades hermanas (D60)
--
-- Dos funciones de lectura sobre datos que ya existen: en qué coinciden y en
-- qué difieren las hijas directas de una comunidad. Sin tablas nuevas y sin
-- pedirle a nadie que cambie lo que hace.
--
-- Las dos heredan el umbral de k-anonimato de D42 y la regla de D60: nada de
-- rankings, todo normalizado por población.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 · Contraste en encuestas.
--
-- Para cada encuesta de la comunidad se toma la opción que ganó en el total y
-- se mide cuánto varía su apoyo entre las hijas. La métrica es deliberadamente
-- simple (D60): "el apoyo va de 18% a 74%" se verifica a ojo; una distancia
-- estadística, no.
-- -----------------------------------------------------------------------------
create or replace function public.sibling_poll_contrast(
  p_community uuid,
  p_limit integer default 6
)
returns table (
  poll_id           uuid,
  question          text,
  top_option_label  text,
  children_counted  integer,
  agreeing_children integer,
  min_share         numeric,
  max_share         numeric,
  spread            numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with
  -- Votos de cada hija directa, atribuidos por la residencia del votante.
  per_child_option as (
    select
      p.id            as poll_id,
      p.question      as question,
      child.id        as child_id,
      v.option_id     as option_id,
      count(*)::bigint as votes
    from public.polls p
    join public.poll_votes v     on v.poll_id = p.id
    join public.profiles pr      on pr.id = v.user_id
    join public.communities home on home.id = pr.home_community_id
    join public.communities child
      on child.parent_id = p_community
     and (home.path = child.path or home.path like child.path || '.%')
    where p.community_id = p_community
      and p.status <> 'removed'
      -- Misma puerta que el desglose individual: si no se pueden ver los
      -- resultados de esa encuesta, tampoco su contraste.
      and public.can_see_poll_results(p.id)
    group by p.id, p.question, child.id, v.option_id
  ),
  child_totals as (
    select poll_id, child_id, sum(votes) as total
    from per_child_option
    group by poll_id, child_id
    -- D42, heredado sin excepción: una hija con menos de 5 votos no entra
    -- ni siquiera dentro de un promedio.
    having sum(votes) >= 5
  ),
  -- Opción ganadora del total, por encuesta. Sólo con las hijas que pasaron
  -- el umbral, para que el "total" y el desglose cuenten lo mismo.
  poll_top as (
    select distinct on (o.poll_id)
      o.poll_id, o.option_id, po.label
    from (
      select pco.poll_id, pco.option_id, sum(pco.votes) as votes
      from per_child_option pco
      join child_totals ct
        on ct.poll_id = pco.poll_id and ct.child_id = pco.child_id
      group by pco.poll_id, pco.option_id
    ) o
    join public.poll_options po on po.id = o.option_id
    order by o.poll_id, o.votes desc, po.label
  ),
  -- Apoyo a esa opción dentro de cada hija.
  shares as (
    select
      ct.poll_id,
      ct.child_id,
      round(
        100.0 * coalesce(
          (select pco.votes from per_child_option pco
           where pco.poll_id = ct.poll_id
             and pco.child_id = ct.child_id
             and pco.option_id = pt.option_id), 0
        ) / ct.total, 1
      ) as share,
      -- ¿La ganadora global es también la ganadora de esta hija?
      (pt.option_id = (
        select pco2.option_id from public.poll_options po2
        join per_child_option pco2 on pco2.option_id = po2.id
        where pco2.poll_id = ct.poll_id and pco2.child_id = ct.child_id
        order by pco2.votes desc, po2.label
        limit 1
      )) as agrees
    from child_totals ct
    join poll_top pt on pt.poll_id = ct.poll_id
  )
  select
    s.poll_id,
    max(pt.question)                       as question,
    max(pt.label)                          as top_option_label,
    count(*)::int                          as children_counted,
    count(*) filter (where s.agrees)::int  as agreeing_children,
    min(s.share)                           as min_share,
    max(s.share)                           as max_share,
    (max(s.share) - min(s.share))          as spread
  from shares s
  join (
    select pt.poll_id, pt.label, pco.question
    from poll_top pt
    join (select distinct poll_id, question from per_child_option) pco
      on pco.poll_id = pt.poll_id
  ) pt on pt.poll_id = s.poll_id
  group by s.poll_id
  -- D60: con una sola hija no hay contraste posible.
  having count(*) >= 2
  order by (max(s.share) - min(s.share)) desc
  limit p_limit;
$$;

comment on function public.sibling_poll_contrast(uuid, integer) is
  'Encuestas de una comunidad ordenadas por cuánto difieren sus hijas directas. Hereda el umbral de 5 votos de D42.';

grant execute on function public.sibling_poll_contrast(uuid, integer) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2 · Perfil de reclamos por hija.
--
-- Qué le duele a cada territorio y quién le responde. Todo por cada mil
-- miembros (D60): el conteo crudo sólo mide tamaño.
-- -----------------------------------------------------------------------------
create or replace function public.sibling_claim_profile(p_community uuid)
returns table (
  child_id            uuid,
  child_slug          text,
  child_name          text,
  child_emoji         text,
  member_count        integer,
  claims_total        bigint,
  claims_per_1k       numeric,
  top_category        text,
  top_category_claims bigint,
  answered_total      bigint,
  answered_rate       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with child_claims as (
    select
      child.id    as child_id,
      child.slug  as child_slug,
      child.name  as child_name,
      child.emoji as child_emoji,
      child.member_count,
      c.category,
      c.first_response_at
    from public.communities child
    left join public.claims c
      on c.community_id = child.id
     and c.status <> 'removed'
    where child.parent_id = p_community
  ),
  totals as (
    select
      child_id, child_slug, child_name, child_emoji, member_count,
      count(category)::bigint as claims_total,
      count(first_response_at)::bigint as answered_total
    from child_claims
    group by child_id, child_slug, child_name, child_emoji, member_count
  ),
  top_cat as (
    select distinct on (child_id)
      child_id, category, count(*)::bigint as category_claims
    from child_claims
    where category is not null
    group by child_id, category
    order by child_id, count(*) desc, category
  )
  select
    t.child_id,
    t.child_slug,
    t.child_name,
    t.child_emoji,
    t.member_count,
    t.claims_total,
    -- Normalizado por población (D60). Sin miembros no se inventa una tasa.
    case
      when t.member_count > 0
        then round(1000.0 * t.claims_total / t.member_count, 2)
      else null
    end as claims_per_1k,
    tc.category,
    tc.category_claims,
    t.answered_total,
    case
      when t.claims_total > 0
        then round(100.0 * t.answered_total / t.claims_total, 1)
      else null
    end as answered_rate
  from totals t
  left join top_cat tc on tc.child_id = t.child_id
  -- Sólo territorios con actividad: una lista de ceros no contrasta nada.
  where t.claims_total > 0
  order by t.child_name;
$$;

comment on function public.sibling_claim_profile(uuid) is
  'Perfil de reclamos de las hijas directas: tasa por mil habitantes, categoría dominante y proporción con acuse institucional (D60).';

grant execute on function public.sibling_claim_profile(uuid) to anon, authenticated;

commit;
