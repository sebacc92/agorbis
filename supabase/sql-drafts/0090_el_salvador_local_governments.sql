-- =============================================================================
-- Agorbis · 0090 · Municipios de El Salvador como nivel 4 (D142)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-list-level4-draft.mjs el-salvador; no se edita a mano.
--
-- Fuente: Wikidata (CC0, de terceros), clase Q3556889, con nombres y puntos;
-- el generador exige los 44 municipios del Decreto 762, vigentes desde el
-- 01-05-2024.
-- Consultado el 2026-11-21. 44 unidades.
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
  ('el-salvador-ahuachapan-ahuachapan-centro', 'Ahuachapán Centro', 'el-salvador-ahuachapan', 'Municipio del departamento de Ahuachapán', 13.923389, -89.846294),
  ('el-salvador-ahuachapan-ahuachapan-norte', 'Ahuachapán Norte', 'el-salvador-ahuachapan', 'Municipio del departamento de Ahuachapán', 13.974239, -89.755025),
  ('el-salvador-ahuachapan-ahuachapan-sur', 'Ahuachapán Sur', 'el-salvador-ahuachapan', 'Municipio del departamento de Ahuachapán', 13.843389, -90.014608),
  ('el-salvador-cabanas-cabanas-este', 'Cabañas Este', 'el-salvador-cabanas', 'Municipio del departamento de Cabañas', 13.876153, -88.628494),
  ('el-salvador-cabanas-cabanas-oeste', 'Cabañas Oeste', 'el-salvador-cabanas', 'Municipio del departamento de Cabañas', 13.842981, -88.848919),
  ('el-salvador-chalatenango-chalatenango-centro', 'Chalatenango Centro', 'el-salvador-chalatenango-department', 'Municipio del departamento de Chalatenango', 14.128917, -89.290844),
  ('el-salvador-chalatenango-chalatenango-norte', 'Chalatenango Norte', 'el-salvador-chalatenango-department', 'Municipio del departamento de Chalatenango', 14.317292, -89.170481),
  ('el-salvador-chalatenango-chalatenango-sur', 'Chalatenango Sur', 'el-salvador-chalatenango-department', 'Municipio del departamento de Chalatenango', 14.041356, -88.939411),
  ('el-salvador-cuscatlan-cuscatlan-norte', 'Cuscatlán Norte', 'el-salvador-cuscatlan', 'Municipio del departamento de Cuscatlán', 13.936692, -89.025936),
  ('el-salvador-cuscatlan-cuscatlan-sur', 'Cuscatlán Sur', 'el-salvador-cuscatlan', 'Municipio del departamento de Cuscatlán', 13.721708, -88.934544),
  ('el-salvador-la-libertad-la-libertad-centro', 'La Libertad Centro', 'el-salvador-la-libertad-department', 'Municipio del departamento de La Libertad', 13.876372, -89.358458),
  ('el-salvador-la-libertad-la-libertad-costa', 'La Libertad Costa', 'el-salvador-la-libertad-department', 'Municipio del departamento de La Libertad', 13.488806, -89.319142),
  ('el-salvador-la-libertad-la-libertad-este', 'La Libertad Este', 'el-salvador-la-libertad-department', 'Municipio del departamento de La Libertad', 13.673297, -89.241611),
  ('el-salvador-la-libertad-la-libertad-norte', 'La Libertad Norte', 'el-salvador-la-libertad-department', 'Municipio del departamento de La Libertad', 13.833697, -89.270858),
  ('el-salvador-la-libertad-la-libertad-oeste', 'La Libertad Oeste', 'el-salvador-la-libertad-department', 'Municipio del departamento de La Libertad', 13.704736, -89.341306),
  ('el-salvador-la-libertad-la-libertad-sur', 'La Libertad Sur', 'el-salvador-la-libertad-department', 'Municipio del departamento de La Libertad', 13.673722, -89.288597),
  ('el-salvador-la-paz-la-paz-centro', 'La Paz Centro', 'el-salvador-la-paz-department', 'Municipio del departamento de La Paz', 13.350222, -88.951633),
  ('el-salvador-la-paz-la-paz-este', 'La Paz Este', 'el-salvador-la-paz-department', 'Municipio del departamento de La Paz', 13.507286, -88.870208),
  ('el-salvador-la-paz-la-paz-oeste', 'La Paz Oeste', 'el-salvador-la-paz-department', 'Municipio del departamento de La Paz', 13.473522, -89.088844),
  ('el-salvador-la-union-la-union-norte', 'La Unión Norte', 'el-salvador-la-union', 'Municipio del departamento de La Unión', 13.625886, -87.891133),
  ('el-salvador-la-union-la-union-sur', 'La Unión Sur', 'el-salvador-la-union', 'Municipio del departamento de La Unión', 13.337122, -87.843056),
  ('el-salvador-morazan-morazan-norte', 'Morazán Norte', 'el-salvador-morazan', 'Municipio del departamento de Morazán', 13.958489, -88.161375),
  ('el-salvador-morazan-morazan-sur', 'Morazán Sur', 'el-salvador-morazan', 'Municipio del departamento de Morazán', 13.695183, -88.106075),
  ('el-salvador-san-miguel-san-miguel-centro', 'San Miguel Centro', 'el-salvador-san-miguel-department', 'Municipio del departamento de San Miguel', 13.480358, -88.177222),
  ('el-salvador-san-miguel-san-miguel-norte', 'San Miguel Norte', 'el-salvador-san-miguel-department', 'Municipio del departamento de San Miguel', 13.765903, -88.271292),
  ('el-salvador-san-miguel-san-miguel-oeste', 'San Miguel Oeste', 'el-salvador-san-miguel-department', 'Municipio del departamento de San Miguel', 13.512211, -88.347969),
  ('el-salvador-san-salvador-san-salvador-centro', 'San Salvador Centro', 'el-salvador-san-salvador-department', 'Municipio del departamento de San Salvador', 13.697597, -89.191156),
  ('el-salvador-san-salvador-san-salvador-este', 'San Salvador Este', 'el-salvador-san-salvador-department', 'Municipio del departamento de San Salvador', 13.703628, -89.150161),
  ('el-salvador-san-salvador-san-salvador-norte', 'San Salvador Norte', 'el-salvador-san-salvador-department', 'Municipio del departamento de San Salvador', 13.958328, -89.187111),
  ('el-salvador-san-salvador-san-salvador-oeste', 'San Salvador Oeste', 'el-salvador-san-salvador-department', 'Municipio del departamento de San Salvador', 13.801272, -89.179081),
  ('el-salvador-san-salvador-san-salvador-sur', 'San Salvador Sur', 'el-salvador-san-salvador-department', 'Municipio del departamento de San Salvador', 13.657844, -89.183),
  ('el-salvador-san-vicente-san-vicente-norte', 'San Vicente Norte', 'el-salvador-san-vicente-department', 'Municipio del departamento de San Vicente', 13.667892, -88.779625),
  ('el-salvador-san-vicente-san-vicente-sur', 'San Vicente Sur', 'el-salvador-san-vicente-department', 'Municipio del departamento de San Vicente', 13.643286, -88.783642),
  ('el-salvador-santa-ana-santa-ana-centro', 'Santa Ana Centro', 'el-salvador-santa-ana-department', 'Municipio del departamento de Santa Ana', 13.994744, -89.556608),
  ('el-salvador-santa-ana-santa-ana-este', 'Santa Ana Este', 'el-salvador-santa-ana-department', 'Municipio del departamento de Santa Ana', 13.905308, -89.496392),
  ('el-salvador-santa-ana-santa-ana-norte', 'Santa Ana Norte', 'el-salvador-santa-ana-department', 'Municipio del departamento de Santa Ana', 14.332147, -89.448106),
  ('el-salvador-santa-ana-santa-ana-oeste', 'Santa Ana Oeste', 'el-salvador-santa-ana-department', 'Municipio del departamento de Santa Ana', 13.985292, -89.680244),
  ('el-salvador-sonsonate-sonsonate-centro', 'Sonsonate Centro', 'el-salvador-sonsonate-department', 'Municipio del departamento de Sonsonate', 13.720614, -89.727486),
  ('el-salvador-sonsonate-sonsonate-este', 'Sonsonate Este', 'el-salvador-sonsonate-department', 'Municipio del departamento de Sonsonate', 13.746183, -89.675633),
  ('el-salvador-sonsonate-sonsonate-norte', 'Sonsonate Norte', 'el-salvador-sonsonate-department', 'Municipio del departamento de Sonsonate', 13.779189, -89.737297),
  ('el-salvador-sonsonate-sonsonate-oeste', 'Sonsonate Oeste', 'el-salvador-sonsonate-department', 'Municipio del departamento de Sonsonate', 13.589767, -89.829764),
  ('el-salvador-usulutan-usulutan-este', 'Usulután Este', 'el-salvador-usulutan', 'Municipio del departamento de Usulután', 13.343789, -88.438231),
  ('el-salvador-usulutan-usulutan-norte', 'Usulután Norte', 'el-salvador-usulutan', 'Municipio del departamento de Usulután', 13.482194, -88.465267),
  ('el-salvador-usulutan-usulutan-oeste', 'Usulután Oeste', 'el-salvador-usulutan', 'Municipio del departamento de Usulután', 13.326633, -88.570211);

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
      and p.path = 'earth.north-america.el-salvador.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0090_MISSING_DEPARTMENT: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0090_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 44;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.north-america.el-salvador.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0090_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
