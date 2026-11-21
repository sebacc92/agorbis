-- =============================================================================
-- 0038 · Un reclamo puede decir dónde, y no sólo contarlo
-- =============================================================================
-- `claims` guardaba `location_text` y nada más: prosa libre. El propio
-- formulario pide "dónde exactamente", pero esa respuesta quedaba en un texto
-- que nadie puede agrupar, ordenar ni ubicar. Consecuencias concretas: no se
-- puede ver que tres vecinos reportaron la misma esquina, ni mostrar los
-- reclamos de un barrio en un mapa, ni saber si el bache que uno va a publicar
-- ya está publicado.
--
-- Las comunidades ya tienen `lat`/`lng` desde 0009; los reclamos no.
--
-- Sigue siendo opcional. Un reclamo sin coordenadas es válido y siempre lo va a
-- ser: se puede publicar desde una computadora de escritorio, o sobre algo que
-- no tiene un punto único —"no hay recolección en todo el barrio"—. Obligarlo
-- dejaría afuera reclamos legítimos.
-- -----------------------------------------------------------------------------

alter table public.claims
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Los dos o ninguno: media coordenada no ubica nada y sólo complica a cada
-- consulta que después tenga que preguntar por ambas.
alter table public.claims drop constraint if exists claims_coords_pair_chk;
alter table public.claims add constraint claims_coords_pair_chk check (
  (lat is null and lng is null) or (lat is not null and lng is not null)
);

-- Rango real del planeta. Sin esto, un `lat = 500` entra y después rompe
-- cualquier cálculo de distancia sin que se sepa de dónde salió.
alter table public.claims drop constraint if exists claims_coords_range_chk;
alter table public.claims add constraint claims_coords_range_chk check (
  lat is null
  or (lat between -90 and 90 and lng between -180 and 180)
);

comment on column public.claims.lat is
  'Latitud del problema, opcional. Va siempre junto con lng.';
comment on column public.claims.lng is
  'Longitud del problema, opcional. Va siempre junto con lat.';

-- Para "reclamos cerca de acá": el filtro natural es por comunidad y después
-- por caja de coordenadas. Parcial porque la mayoría de las filas no las tiene
-- y no hay razón para indexar nulos que ninguna consulta va a pedir.
create index if not exists claims_located_idx
  on public.claims (community_id, lat, lng)
  where lat is not null;
