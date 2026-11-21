-- =============================================================================
-- Agorbis · 0077 · Municipios de Uruguay como nivel 4 (D129)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-uruguay-level4-draft.mjs; no se edita a mano.
--
-- Va después de 0076.
--
-- Fuente: plan circuital de las Elecciones Departamentales y Municipales 2025,
-- Corte Electoral (catalogodatos.gub.uy, Licencia de Datos Abiertos de AGESIC),
-- descargado el 2026-11-20. 136 municipios bajo sus 19 departamentos.
-- El territorio sin municipio queda en el departamento, que es su gobierno
-- local (la Intendencia).
--
-- Sin coordenadas: la fuente no las trae y la detección por GPS del
-- onboarding ignora las comunidades sin lat/lng, así que sugiere el
-- departamento en vez de un municipio equivocado.
-- =============================================================================

begin;

set local search_path = '';

create temporary table level4_rows (
  slug text primary key,
  name text not null,
  parent_slug text not null,
  description text not null
) on commit drop;

insert into pg_temp.level4_rows (slug, name, parent_slug, description) values
  ('uruguay-artigas-baltasar-brum', 'Baltasar Brum', 'uruguay-artigas', 'Municipio del departamento de Artigas'),
  ('uruguay-artigas-bella-union', 'Bella Unión', 'uruguay-artigas', 'Municipio del departamento de Artigas'),
  ('uruguay-artigas-tomas-gomensoro', 'Tomás Gomensoro', 'uruguay-artigas', 'Municipio del departamento de Artigas'),
  ('uruguay-canelones-18-de-mayo', '18 de Mayo', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-aguas-corrientes', 'Aguas Corrientes', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-atlantida', 'Atlántida', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-barros-blancos', 'Barros Blancos', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-canelones', 'Canelones', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-ciudad-de-la-costa', 'Ciudad de la Costa', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-colonia-nicolich', 'Colonia Nicolich', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-del-andaluz', 'Del Andaluz', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-empalme-olmos', 'Empalme Olmos', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-juanico', 'Juanicó', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-la-floresta', 'La Floresta', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-la-paz', 'La Paz', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-las-piedras', 'Las Piedras', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-los-cerrillos', 'Los Cerrillos', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-migues', 'Migues', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-montes', 'Montes', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-pando', 'Pando', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-parque-del-plata', 'Parque del Plata', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-paso-carrasco', 'Paso Carrasco', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-progreso', 'Progreso', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-salinas', 'Salinas', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-san-antonio', 'San Antonio', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-san-bautista', 'San Bautista', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-san-jacinto', 'San Jacinto', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-san-ramon', 'San Ramón', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-santa-lucia', 'Santa Lucía', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-santa-rosa', 'Santa Rosa', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-sauce', 'Sauce', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-soca', 'Soca', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-suarez', 'Suárez', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-tala', 'Tala', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-canelones-toledo', 'Toledo', 'uruguay-canelones', 'Municipio del departamento de Canelones'),
  ('uruguay-cerro-largo-acegua', 'Aceguá', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-arbolito', 'Arbolito', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-arevalo', 'Arévalo', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-banado-de-medina', 'Bañado de Medina', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-centurion', 'Centurión', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-cerro-de-las-cuentas', 'Cerro de las Cuentas', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-fraile-muerto', 'Fraile Muerto', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-isidoro-noblia', 'Isidoro Noblía', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-laguna-merin', 'Laguna Merín', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-las-canas', 'Las Cañas', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-placido-rosas', 'Plácido Rosas', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-quebracho', 'Quebracho', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-ramon-trigo', 'Ramón Trigo', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-rio-branco', 'Río Branco', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-tres-islas', 'Tres Islas', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-cerro-largo-tupambae', 'Tupambaé', 'uruguay-cerro-largo', 'Municipio del departamento de Cerro Largo'),
  ('uruguay-colonia-carmelo', 'Carmelo', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-colonia-miguelete', 'Colonia Miguelete', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-colonia-valdense', 'Colonia Valdense', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-conchillas', 'Conchillas', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-cufre', 'Cufré', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-florencio-sanchez', 'Florencio Sánchez', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-juan-l-lacaze', 'Juan L. Lacaze', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-la-paz', 'La Paz', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-nueva-helvecia', 'Nueva Helvecia', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-nueva-palmira', 'Nueva Palmira', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-ombues-de-lavalle', 'Ombúes de Lavalle', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-rosario', 'Rosario', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-colonia-tarariras', 'Tarariras', 'uruguay-colonia', 'Municipio del departamento de Colonia'),
  ('uruguay-durazno-sarandi-del-yi', 'Sarandí del Yí', 'uruguay-durazno', 'Municipio del departamento de Durazno'),
  ('uruguay-durazno-villa-del-carmen', 'Villa del Carmen', 'uruguay-durazno', 'Municipio del departamento de Durazno'),
  ('uruguay-flores-ismael-cortinas', 'Ismael Cortinas', 'uruguay-flores', 'Municipio del departamento de Flores'),
  ('uruguay-florida-casupa', 'Casupá', 'uruguay-florida', 'Municipio del departamento de Florida'),
  ('uruguay-florida-fray-marcos', 'Fray Marcos', 'uruguay-florida', 'Municipio del departamento de Florida'),
  ('uruguay-florida-sarandi-grande', 'Sarandí Grande', 'uruguay-florida', 'Municipio del departamento de Florida'),
  ('uruguay-lavalleja-jose-batlle-y-ordonez', 'José Batlle y Ordóñez', 'uruguay-lavalleja', 'Municipio del departamento de Lavalleja'),
  ('uruguay-lavalleja-jose-pedro-varela', 'José Pedro Varela', 'uruguay-lavalleja', 'Municipio del departamento de Lavalleja'),
  ('uruguay-lavalleja-mariscala', 'Mariscala', 'uruguay-lavalleja', 'Municipio del departamento de Lavalleja'),
  ('uruguay-lavalleja-piraraja', 'Pirarajá', 'uruguay-lavalleja', 'Municipio del departamento de Lavalleja'),
  ('uruguay-lavalleja-solis-de-mataojo', 'Solís de Mataojo', 'uruguay-lavalleja', 'Municipio del departamento de Lavalleja'),
  ('uruguay-lavalleja-zapican', 'Zapicán', 'uruguay-lavalleja', 'Municipio del departamento de Lavalleja'),
  ('uruguay-maldonado-aigua', 'Aiguá', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-garzon', 'Garzón', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-maldonado', 'Maldonado', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-pan-de-azucar', 'Pan de Azúcar', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-piriapolis', 'Piriápolis', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-punta-del-este', 'Punta del Este', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-san-carlos', 'San Carlos', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-maldonado-solis-grande', 'Solís Grande', 'uruguay-maldonado', 'Municipio del departamento de Maldonado'),
  ('uruguay-montevideo-municipio-a', 'Municipio A', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-b', 'Municipio B', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-c', 'Municipio C', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-ch', 'Municipio CH', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-d', 'Municipio D', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-e', 'Municipio E', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-f', 'Municipio F', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-montevideo-municipio-g', 'Municipio G', 'uruguay-montevideo', 'Municipio del departamento de Montevideo'),
  ('uruguay-paysandu-cerro-chato', 'Cerro Chato', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-chapicuy', 'Chapicuy', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-el-eucalipto', 'El Eucalipto', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-guichon', 'Guichón', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-lorenzo-geyres', 'Lorenzo Geyres', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-piedras-coloradas', 'Piedras Coloradas', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-porvenir', 'Porvenir', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-quebracho', 'Quebracho', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-paysandu-tambores', 'Tambores', 'uruguay-paysandu', 'Municipio del departamento de Paysandú'),
  ('uruguay-rio-negro-nuevo-berlin', 'Nuevo Berlín', 'uruguay-rio-negro', 'Municipio del departamento de Río Negro'),
  ('uruguay-rio-negro-san-javier', 'San Javier', 'uruguay-rio-negro', 'Municipio del departamento de Río Negro'),
  ('uruguay-rio-negro-young', 'Young', 'uruguay-rio-negro', 'Municipio del departamento de Río Negro'),
  ('uruguay-rivera-minas-de-corrales', 'Minas de Corrales', 'uruguay-rivera', 'Municipio del departamento de Rivera'),
  ('uruguay-rivera-tranqueras', 'Tranqueras', 'uruguay-rivera', 'Municipio del departamento de Rivera'),
  ('uruguay-rivera-vichadero', 'Vichadero', 'uruguay-rivera', 'Municipio del departamento de Rivera'),
  ('uruguay-rocha-castillos', 'Castillos', 'uruguay-rocha', 'Municipio del departamento de Rocha'),
  ('uruguay-rocha-chuy', 'Chuy', 'uruguay-rocha', 'Municipio del departamento de Rocha'),
  ('uruguay-rocha-la-paloma', 'La Paloma', 'uruguay-rocha', 'Municipio del departamento de Rocha'),
  ('uruguay-rocha-lascano', 'Lascano', 'uruguay-rocha', 'Municipio del departamento de Rocha'),
  ('uruguay-salto-colonia-lavalleja', 'Colonia Lavalleja', 'uruguay-salto', 'Municipio del departamento de Salto'),
  ('uruguay-salto-mataojo', 'Mataojo', 'uruguay-salto', 'Municipio del departamento de Salto'),
  ('uruguay-salto-pueblo-belen', 'Pueblo Belén', 'uruguay-salto', 'Municipio del departamento de Salto'),
  ('uruguay-salto-pueblo-rincon-de-valentin', 'Pueblo Rincón de Valentín', 'uruguay-salto', 'Municipio del departamento de Salto'),
  ('uruguay-salto-pueblo-san-antonio', 'Pueblo San Antonio', 'uruguay-salto', 'Municipio del departamento de Salto'),
  ('uruguay-salto-villa-constitucion', 'Villa Constitución', 'uruguay-salto', 'Municipio del departamento de Salto'),
  ('uruguay-san-jose-ciudad-del-plata', 'Ciudad del Plata', 'uruguay-san-jose', 'Municipio del departamento de San José'),
  ('uruguay-san-jose-ecilda-paullier', 'Ecilda Paullier', 'uruguay-san-jose', 'Municipio del departamento de San José'),
  ('uruguay-san-jose-libertad', 'Libertad', 'uruguay-san-jose', 'Municipio del departamento de San José'),
  ('uruguay-san-jose-rodriguez', 'Rodríguez', 'uruguay-san-jose', 'Municipio del departamento de San José'),
  ('uruguay-soriano-cardona', 'Cardona', 'uruguay-soriano', 'Municipio del departamento de Soriano'),
  ('uruguay-soriano-dolores', 'Dolores', 'uruguay-soriano', 'Municipio del departamento de Soriano'),
  ('uruguay-soriano-jose-enrique-rodo', 'José Enrique Rodó', 'uruguay-soriano', 'Municipio del departamento de Soriano'),
  ('uruguay-soriano-palmitas', 'Palmitas', 'uruguay-soriano', 'Municipio del departamento de Soriano'),
  ('uruguay-soriano-villa-de-santo-domingo-de-soriano', 'Villa de Santo Domingo de Soriano', 'uruguay-soriano', 'Municipio del departamento de Soriano'),
  ('uruguay-tacuarembo-ansina', 'Ansina', 'uruguay-tacuarembo', 'Municipio del departamento de Tacuarembó'),
  ('uruguay-tacuarembo-paso-de-los-toros', 'Paso de los Toros', 'uruguay-tacuarembo', 'Municipio del departamento de Tacuarembó'),
  ('uruguay-tacuarembo-san-gregorio-de-polanco', 'San Gregorio de Polanco', 'uruguay-tacuarembo', 'Municipio del departamento de Tacuarembó'),
  ('uruguay-tacuarembo-villa-caraguata', 'Villa Caraguatá', 'uruguay-tacuarembo', 'Municipio del departamento de Tacuarembó'),
  ('uruguay-treinta-y-tres-cerro-chato', 'Cerro Chato', 'uruguay-treinta-y-tres', 'Municipio del departamento de Treinta y Tres'),
  ('uruguay-treinta-y-tres-general-enrique-martinez', 'General Enrique Martínez', 'uruguay-treinta-y-tres', 'Municipio del departamento de Treinta y Tres'),
  ('uruguay-treinta-y-tres-rincon', 'Rincón', 'uruguay-treinta-y-tres', 'Municipio del departamento de Treinta y Tres'),
  ('uruguay-treinta-y-tres-santa-clara-de-olimar', 'Santa Clara de Olimar', 'uruguay-treinta-y-tres', 'Municipio del departamento de Treinta y Tres'),
  ('uruguay-treinta-y-tres-vergara', 'Vergara', 'uruguay-treinta-y-tres', 'Municipio del departamento de Treinta y Tres'),
  ('uruguay-treinta-y-tres-villa-sara', 'Villa Sara', 'uruguay-treinta-y-tres', 'Municipio del departamento de Treinta y Tres');

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
      and p.path = 'earth.south-america.uruguay.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0077_MISSING_DEPARTMENT: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0077_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, null, null
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 136;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.south-america.uruguay.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0077_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
