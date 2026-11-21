-- =============================================================================
-- Agorbis · 0089 · Cantones de Costa Rica como nivel 4 (D141)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-cod-ab-level4-draft.mjs costa-rica; no se edita a mano.
--
-- Fuente: Costa Rica - Subnational Administrative Boundaries (COD-AB) de HDX,
-- con datos del INEC, licencia CC BY-IGO. Cada cantón tiene su municipalidad.
-- Descargado el 2026-11-21. 84 unidades, con un punto cada una.
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
  ('costa-rica-alajuela-alajuela', 'Alajuela', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.16396, -84.184077),
  ('costa-rica-alajuela-atenas', 'Atenas', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 9.979676, -84.399188),
  ('costa-rica-alajuela-grecia', 'Grecia', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.090809, -84.299349),
  ('costa-rica-alajuela-guatuso', 'Guatuso', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.704257, -84.84066),
  ('costa-rica-alajuela-los-chiles', 'Los Chiles', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.856856, -84.715379),
  ('costa-rica-alajuela-naranjo', 'Naranjo', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.105776, -84.399324),
  ('costa-rica-alajuela-orotina', 'Orotina', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 9.893224, -84.594685),
  ('costa-rica-alajuela-palmares', 'Palmares', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.046491, -84.43566),
  ('costa-rica-alajuela-poas', 'Poás', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.106245, -84.240693),
  ('costa-rica-alajuela-rio-cuarto', 'Río Cuarto', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.409611, -84.212154),
  ('costa-rica-alajuela-san-carlos', 'San Carlos', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.621027, -84.425759),
  ('costa-rica-alajuela-san-mateo', 'San Mateo', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 9.960484, -84.53187),
  ('costa-rica-alajuela-san-ramon', 'San Ramón', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.218185, -84.57153),
  ('costa-rica-alajuela-sarchi', 'Sarchí', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.16242, -84.315291),
  ('costa-rica-alajuela-upala', 'Upala', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.868091, -85.144354),
  ('costa-rica-alajuela-zarcero', 'Zarcero', 'costa-rica-alajuela-province', 'Cantón de la provincia de Alajuela', 10.218842, -84.407213),
  ('costa-rica-cartago-alvarado', 'Alvarado', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.943953, -83.800693),
  ('costa-rica-cartago-cartago', 'Cartago', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.787495, -83.904754),
  ('costa-rica-cartago-el-guarco', 'El Guarco', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.732381, -83.919892),
  ('costa-rica-cartago-jimenez', 'Jiménez', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.819205, -83.711559),
  ('costa-rica-cartago-la-union', 'La Unión', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.911437, -83.984384),
  ('costa-rica-cartago-oreamuno', 'Oreamuno', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.997643, -83.845816),
  ('costa-rica-cartago-paraiso', 'Paraíso', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.716002, -83.763083),
  ('costa-rica-cartago-turrialba', 'Turrialba', 'costa-rica-cartago-province', 'Cantón de la provincia de Cartago', 9.783988, -83.499425),
  ('costa-rica-guanacaste-abangares', 'Abangares', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.249803, -85.020918),
  ('costa-rica-guanacaste-bagaces', 'Bagaces', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.511633, -85.284548),
  ('costa-rica-guanacaste-canas', 'Cañas', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.450169, -85.094503),
  ('costa-rica-guanacaste-carrillo', 'Carrillo', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.481796, -85.649127),
  ('costa-rica-guanacaste-hojancha', 'Hojancha', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 9.975126, -85.411434),
  ('costa-rica-guanacaste-la-cruz', 'La Cruz', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 11.007416, -85.549342),
  ('costa-rica-guanacaste-liberia', 'Liberia', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.691801, -85.498629),
  ('costa-rica-guanacaste-nandayure', 'Nandayure', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 9.90203, -85.330129),
  ('costa-rica-guanacaste-nicoya', 'Nicoya', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.103526, -85.413523),
  ('costa-rica-guanacaste-santa-cruz', 'Santa Cruz', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.235705, -85.670314),
  ('costa-rica-guanacaste-tilaran', 'Tilarán', 'costa-rica-guanacaste-province', 'Cantón de la provincia de Guanacaste', 10.486735, -84.900749),
  ('costa-rica-heredia-barva', 'Barva', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.073392, -84.109174),
  ('costa-rica-heredia-belen', 'Belén', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 9.985623, -84.180177),
  ('costa-rica-heredia-flores', 'Flores', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.005863, -84.15877),
  ('costa-rica-heredia-heredia', 'Heredia', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.178059, -84.057843),
  ('costa-rica-heredia-san-isidro', 'San Isidro', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.029954, -84.032105),
  ('costa-rica-heredia-san-pablo', 'San Pablo', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 9.991815, -84.09944),
  ('costa-rica-heredia-san-rafael', 'San Rafael', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.059585, -84.071168),
  ('costa-rica-heredia-santa-barbara', 'Santa Bárbara', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.081988, -84.145959),
  ('costa-rica-heredia-santo-domingo', 'Santo Domingo', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 9.988035, -84.065148),
  ('costa-rica-heredia-sarapiqui', 'Sarapiquí', 'costa-rica-heredia-province', 'Cantón de la provincia de Heredia', 10.4871, -83.995659),
  ('costa-rica-limon-guacimo', 'Guácimo', 'costa-rica-limon-province', 'Cantón de la provincia de Limón', 10.221553, -83.643414),
  ('costa-rica-limon-limon', 'Limón', 'costa-rica-limon-province', 'Cantón de la provincia de Limón', 9.776119, -83.127501),
  ('costa-rica-limon-matina', 'Matina', 'costa-rica-limon-province', 'Cantón de la provincia de Limón', 10.009099, -83.340054),
  ('costa-rica-limon-pococi', 'Pococí', 'costa-rica-limon-province', 'Cantón de la provincia de Limón', 10.502939, -83.656536),
  ('costa-rica-limon-siquirres', 'Siquirres', 'costa-rica-limon-province', 'Cantón de la provincia de Limón', 10.148838, -83.483358),
  ('costa-rica-limon-talamanca', 'Talamanca', 'costa-rica-limon-province', 'Cantón de la provincia de Limón', 9.421263, -83.208174),
  ('costa-rica-puntarenas-buenos-aires', 'Buenos Aires', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 9.079612, -83.239715),
  ('costa-rica-puntarenas-corredores', 'Corredores', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 8.537772, -82.946966),
  ('costa-rica-puntarenas-coto-brus', 'Coto Brus', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 8.893433, -82.914023),
  ('costa-rica-puntarenas-esparza', 'Esparza', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 9.995761, -84.625514),
  ('costa-rica-puntarenas-garabito', 'Garabito', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 9.707669, -84.622006),
  ('costa-rica-puntarenas-golfito', 'Golfito', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 8.427499, -83.059011),
  ('costa-rica-puntarenas-montes-de-oro', 'Montes de Oro', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 10.146515, -84.726849),
  ('costa-rica-puntarenas-monteverde', 'Monteverde', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 10.290785, -84.813264),
  ('costa-rica-puntarenas-osa', 'Osa', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 8.892616, -83.414887),
  ('costa-rica-puntarenas-parrita', 'Parrita', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 9.548493, -84.358684),
  ('costa-rica-puntarenas-puerto-jimenez', 'Puerto Jiménez', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 8.533708, -83.4585),
  ('costa-rica-puntarenas-puntarenas', 'Puntarenas', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 9.786202, -85.053287),
  ('costa-rica-puntarenas-quepos', 'Quepos', 'costa-rica-puntarenas-province', 'Cantón de la provincia de Puntarenas', 9.413177, -84.064925),
  ('costa-rica-san-jose-acosta', 'Acosta', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.74218, -84.242865),
  ('costa-rica-san-jose-alajuelita', 'Alajuelita', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.889524, -84.105837),
  ('costa-rica-san-jose-aserri', 'Aserrí', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.746808, -84.12311),
  ('costa-rica-san-jose-curridabat', 'Curridabat', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.91631, -84.030869),
  ('costa-rica-san-jose-desamparados', 'Desamparados', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.811497, -84.069824),
  ('costa-rica-san-jose-dota', 'Dota', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.585, -83.890406),
  ('costa-rica-san-jose-escazu', 'Escazú', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.916047, -84.141019),
  ('costa-rica-san-jose-goicoechea', 'Goicoechea', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.95638, -83.966941),
  ('costa-rica-san-jose-leon-cortes-castro', 'León Cortés Castro', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.693908, -84.076052),
  ('costa-rica-san-jose-montes-de-oca', 'Montes de Oca', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.940031, -84.032645),
  ('costa-rica-san-jose-mora', 'Mora', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.87247, -84.238743),
  ('costa-rica-san-jose-moravia', 'Moravia', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 10.010484, -84.012723),
  ('costa-rica-san-jose-perez-zeledon', 'Pérez Zeledón', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.336784, -83.64832),
  ('costa-rica-san-jose-puriscal', 'Puriscal', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.733839, -84.409557),
  ('costa-rica-san-jose-san-jose', 'San José', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.9358, -84.092059),
  ('costa-rica-san-jose-santa-ana', 'Santa Ana', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.918036, -84.19173),
  ('costa-rica-san-jose-tarrazu', 'Tarrazú', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.582753, -84.065955),
  ('costa-rica-san-jose-tibas', 'Tibás', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.957166, -84.081775),
  ('costa-rica-san-jose-turrubares', 'Turrubares', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 9.747639, -84.528289),
  ('costa-rica-san-jose-vazquez-de-coronado', 'Vázquez de Coronado', 'costa-rica-san-jose', 'Cantón de la provincia de San José', 10.077481, -83.975509);

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
      and p.path = 'earth.north-america.costa-rica.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0089_MISSING_PROVINCE: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0089_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 84;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.north-america.costa-rica.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0089_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
