-- =============================================================================
-- Agorbis · 0092 · Distritos de Panamá como nivel 4 (D144)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-list-level4-draft.mjs panama; no se edita a mano.
--
-- Fuente: capa de distritos del Instituto Geográfico Nacional Tommy Guardia
-- (ANATI), con datos del INEC y de la Comisión Nacional de Límites. Sólo
-- nombres y códigos; sin coordenadas, porque la capa no declara licencia.
-- Consultado el 2026-11-21. 81 unidades.
-- =============================================================================

begin;

set local search_path = '';

create temporary table level4_rows (
  slug text primary key,
  name text not null,
  parent_slug text not null,
  description text not null,
  lat double precision,
  lng double precision
) on commit drop;

insert into pg_temp.level4_rows (slug, name, parent_slug, description, lat, lng) values
  ('panama-bocas-del-toro-almirante', 'Almirante', 'panama-bocas-del-toro-province', 'Distrito de la provincia de Bocas del Toro', null, null),
  ('panama-bocas-del-toro-bocas-del-toro', 'Bocas del Toro', 'panama-bocas-del-toro-province', 'Distrito de la provincia de Bocas del Toro', null, null),
  ('panama-bocas-del-toro-changuinola', 'Changuinola', 'panama-bocas-del-toro-province', 'Distrito de la provincia de Bocas del Toro', null, null),
  ('panama-bocas-del-toro-chiriqui-grande', 'Chiriquí Grande', 'panama-bocas-del-toro-province', 'Distrito de la provincia de Bocas del Toro', null, null),
  ('panama-chiriqui-alanje', 'Alanje', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-baru', 'Barú', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-boqueron', 'Boquerón', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-boquete', 'Boquete', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-bugaba', 'Bugaba', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-david', 'David', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-dolega', 'Dolega', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-gualaca', 'Gualaca', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-remedios', 'Remedios', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-renacimiento', 'Renacimiento', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-san-felix', 'San Félix', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-san-lorenzo', 'San Lorenzo', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-tierras-altas', 'Tierras Altas', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-chiriqui-tole', 'Tolé', 'panama-chiriqui-province', 'Distrito de la provincia de Chiriquí', null, null),
  ('panama-cocle-aguadulce', 'Aguadulce', 'panama-cocle', 'Distrito de la provincia de Coclé', null, null),
  ('panama-cocle-anton', 'Antón', 'panama-cocle', 'Distrito de la provincia de Coclé', null, null),
  ('panama-cocle-la-pintada', 'La Pintada', 'panama-cocle', 'Distrito de la provincia de Coclé', null, null),
  ('panama-cocle-nata', 'Natá', 'panama-cocle', 'Distrito de la provincia de Coclé', null, null),
  ('panama-cocle-ola', 'Olá', 'panama-cocle', 'Distrito de la provincia de Coclé', null, null),
  ('panama-cocle-penonome', 'Penonomé', 'panama-cocle', 'Distrito de la provincia de Coclé', null, null),
  ('panama-colon-chagres', 'Chagres', 'panama-colon', 'Distrito de la provincia de Colón', null, null),
  ('panama-colon-colon', 'Colón', 'panama-colon', 'Distrito de la provincia de Colón', null, null),
  ('panama-colon-donoso', 'Donoso', 'panama-colon', 'Distrito de la provincia de Colón', null, null),
  ('panama-colon-omar-torrijos-herrera', 'Omar Torrijos Herrera', 'panama-colon', 'Distrito de la provincia de Colón', null, null),
  ('panama-colon-portobelo', 'Portobelo', 'panama-colon', 'Distrito de la provincia de Colón', null, null),
  ('panama-colon-santa-isabel', 'Santa Isabel', 'panama-colon', 'Distrito de la provincia de Colón', null, null),
  ('panama-darien-chepigana', 'Chepigana', 'panama-darien', 'Distrito de la provincia de Darién', null, null),
  ('panama-darien-pinogana', 'Pinogana', 'panama-darien', 'Distrito de la provincia de Darién', null, null),
  ('panama-darien-santa-fe', 'Santa Fe', 'panama-darien', 'Distrito de la provincia de Darién', null, null),
  ('panama-embera-wounaan-cemaco', 'Cémaco', 'panama-embera', 'Distrito de la comarca Emberá-Wounaan', null, null),
  ('panama-embera-wounaan-sambu', 'Sambú', 'panama-embera', 'Distrito de la comarca Emberá-Wounaan', null, null),
  ('panama-herrera-chitre', 'Chitré', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-herrera-las-minas', 'Las Minas', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-herrera-los-pozos', 'Los Pozos', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-herrera-ocu', 'Ocú', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-herrera-parita', 'Parita', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-herrera-pese', 'Pesé', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-herrera-santa-maria', 'Santa María', 'panama-herrera-province', 'Distrito de la provincia de Herrera', null, null),
  ('panama-los-santos-guarare', 'Guararé', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-los-santos-las-tablas', 'Las Tablas', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-los-santos-los-santos', 'Los Santos', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-los-santos-macaracas', 'Macaracas', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-los-santos-pedasi', 'Pedasí', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-los-santos-pocri', 'Pocrí', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-los-santos-tonosi', 'Tonosí', 'panama-los-santos-province', 'Distrito de la provincia de Los Santos', null, null),
  ('panama-ngabe-bugle-besiko', 'Besiko', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-jirondai', 'Jirondai', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-kankintu', 'Kankintú', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-kusapin', 'Kusapín', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-mirono', 'Mironó', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-muna', 'Müna', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-nole-duima', 'Nole Duima', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-nurum', 'Ñürüm', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-ngabe-bugle-santa-catalina-o-calovebora-bledeshia', 'Santa Catalina o Calovébora (Bledeshia)', 'panama-ngoebe-bugle-comarca', 'Distrito de la comarca Ngäbe-Buglé', null, null),
  ('panama-panama-oeste-arraijan', 'Arraiján', 'panama-panama-oeste-province', 'Distrito de la provincia de Panamá Oeste', null, null),
  ('panama-panama-oeste-capira', 'Capira', 'panama-panama-oeste-province', 'Distrito de la provincia de Panamá Oeste', null, null),
  ('panama-panama-oeste-chame', 'Chame', 'panama-panama-oeste-province', 'Distrito de la provincia de Panamá Oeste', null, null),
  ('panama-panama-oeste-la-chorrera', 'La Chorrera', 'panama-panama-oeste-province', 'Distrito de la provincia de Panamá Oeste', null, null),
  ('panama-panama-oeste-san-carlos', 'San Carlos', 'panama-panama-oeste-province', 'Distrito de la provincia de Panamá Oeste', null, null),
  ('panama-panama-balboa', 'Balboa', 'panama-panama', 'Distrito de la provincia de Panamá', null, null),
  ('panama-panama-chepo', 'Chepo', 'panama-panama', 'Distrito de la provincia de Panamá', null, null),
  ('panama-panama-chiman', 'Chimán', 'panama-panama', 'Distrito de la provincia de Panamá', null, null),
  ('panama-panama-panama', 'Panamá', 'panama-panama', 'Distrito de la provincia de Panamá', null, null),
  ('panama-panama-san-miguelito', 'San Miguelito', 'panama-panama', 'Distrito de la provincia de Panamá', null, null),
  ('panama-panama-taboga', 'Taboga', 'panama-panama', 'Distrito de la provincia de Panamá', null, null),
  ('panama-veraguas-atalaya', 'Atalaya', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-calobre', 'Calobre', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-canazas', 'Cañazas', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-la-mesa', 'La Mesa', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-las-palmas', 'Las Palmas', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-mariato', 'Mariato', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-montijo', 'Montijo', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-rio-de-jesus', 'Río de Jesús', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-san-francisco', 'San Francisco', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-santa-fe', 'Santa Fe', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-santiago', 'Santiago', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null),
  ('panama-veraguas-sona', 'Soná', 'panama-veraguas-province', 'Distrito de la provincia de Veraguas', null, null);

-- Falla cerrado: si el esquema o los datos no son los que se revisaron, no
-- inserta nada en vez de dejar una carga a medias.
do $guard$
declare
  v_missing text;
begin
  select string_agg(distinct i.parent_slug, ', ') into v_missing
  from pg_temp.level4_rows i
  where not exists (
    select 1 from public.communities p
    where p.slug = i.parent_slug and p.level = 3
      and p.path = 'earth.north-america.panama.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0092_MISSING_PROVINCE: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0092_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 81;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.north-america.panama.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0092_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
