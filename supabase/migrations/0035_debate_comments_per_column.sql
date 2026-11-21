-- =============================================================================
-- 0035 · Los comentarios de un debate se traen por columna (D66)
-- =============================================================================
-- La ruta traía `COMMENT_FETCH_LIMIT` (400) comentarios del debate entero,
-- ordenados por puntaje, y recién después los repartía entre las columnas con
-- un tope de 20 por cada una. Con pocas sub-comunidades alcanza; con muchas no.
--
-- Un país con 200 provincias necesitaría 4.000 comentarios para llenar todas
-- las columnas, así que las que no aportan comentarios muy votados se quedaban
-- sin ninguno aunque tuvieran actividad. Es exactamente lo contrario de lo que
-- la función promete —ver el mismo problema desde cada lugar— y golpeaba más
-- fuerte a las comunidades chicas, que son las que menos votos acumulan.
--
-- Un `LATERAL` por columna hace que el tope sea por columna y no global: cada
-- sub-comunidad trae sus mejores N, sin competir con las demás.
-- -----------------------------------------------------------------------------

create or replace function public.debate_column_comments(
  p_debate    uuid,
  p_per_column int default 20
)
returns table (
  column_community_id uuid,
  id                  uuid,
  user_id             uuid,
  body                text,
  score               integer,
  created_at          timestamptz
)
language sql
stable
as $$
  -- `security invoker` (el default): las policies de `debate_comments` deciden
  -- qué ve cada sesión, igual que cuando la consulta salía de la ruta. Esta
  -- función cambia cuántas filas se traen, no quién puede verlas.
  select cc.column_community_id, cc.id, cc.user_id, cc.body, cc.score,
         cc.created_at
  from public.debates d
  join public.communities child on child.parent_id = d.community_id
  cross join lateral (
    select c.id, c.user_id, c.body, c.score, c.created_at,
           c.column_community_id
    from public.debate_comments c
    where c.debate_id = d.id
      and c.column_community_id = child.id
      and c.status = 'visible'
    -- Mismo criterio que usaba la ruta: primero los mejor puntuados, y el
    -- `id` desempata para que dos comentarios del mismo instante no compitan
    -- por el mismo lugar de forma no determinista (D65).
    order by c.score desc, c.created_at desc, c.id desc
    limit least(greatest(p_per_column, 1), 100)
  ) cc
  where d.id = p_debate;
$$;

comment on function public.debate_column_comments(uuid, int) is
  'Comentarios visibles de un debate, con tope POR COLUMNA en vez de global (D66). Sin esto, las sub-comunidades con menos votos se quedaban sin ninguno.';

grant execute on function public.debate_column_comments(uuid, int)
  to anon, authenticated;
