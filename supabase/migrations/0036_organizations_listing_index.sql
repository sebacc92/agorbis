-- =============================================================================
-- 0036 · Índice para el listado de instituciones verificadas
-- =============================================================================
-- `/instituciones` pide `where verified_at is not null order by name limit 500`,
-- y `organizations` sólo tenía índices por `id`, por `slug` y el GIN de
-- búsqueda por texto. Ninguno sirve para ese orden, así que la consulta
-- recorría la tabla entera y ordenaba después.
--
-- Medido en local con 50.000 instituciones (40.000 verificadas):
--
--   sin índice : Seq Scan sobre 40.000 filas + top-N heapsort → 23,4 ms
--   con índice : Index Scan, sin ordenamiento                 →  0,35 ms
--
-- Parcial y no completo: el listado nunca mira las no verificadas, así que
-- indexarlas sería pagar escritura y espacio por filas que la consulta
-- descarta. Con el `where` en el índice, Postgres además sabe que puede
-- saltearse el filtro.
--
-- El orden por `name` va en el índice para que el `limit` corte de una: sin
-- eso hay que traer las 40.000 y recién ahí quedarse con 500.
-- -----------------------------------------------------------------------------

create index if not exists organizations_verified_name_idx
  on public.organizations (name)
  where verified_at is not null;

comment on index public.organizations_verified_name_idx is
  'Listado de /instituciones: verificadas por nombre. Parcial porque el listado nunca mira las no verificadas.';

-- -----------------------------------------------------------------------------
-- Nota sobre `follows`, que se evaluó junto con esto y se descartó.
--
-- El perfil pide `where user_id = ? order by created_at desc limit 100`, y a
-- primera vista pedía un índice `(user_id, created_at desc)`. Medido con
-- 200.000 filas, el planificador **no lo usa**: `follows_pkey (user_id,
-- community_id)` ya resuelve el filtro, y como nadie puede seguir más
-- comunidades que las que existen, ordenar ese puñado sale gratis. Ejecución
-- 0,227 ms sin el índice contra 0,235 ms con él.
--
-- Queda anotado acá para que a nadie le parezca un olvido: se probó y no
-- aportaba, sólo costo de escritura.
-- -----------------------------------------------------------------------------
