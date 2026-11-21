-- =============================================================================
-- Agorbis · 0082 · Provincias de Perú como nivel 4 (D134)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-peru-level4-draft.mjs; no se edita a mano.
--
-- Va después de 0076 y de los borradores de Uruguay a Ecuador.
--
-- Fuente: Peru - Subnational Administrative Boundaries (COD-AB) de HDX, con
-- datos del IGN, licencia CC BY-IGO, hojas per_admin2, per_admin3 y
-- per_adminpoints, descargadas el 2026-11-20. Tildes de las etiquetas en
-- español de Wikidata (CC0), sólo cuando difieren del IGN únicamente en
-- tildes o mayúsculas.
--
-- 244 filas: las municipalidades provinciales bajo su departamento y,
-- bajo El Callao y Lima Metropolitana, que ya son nivel 3, sus distritos.
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
  ('peru-amazonas-bagua', 'Bagua', 'peru-amazonas', 'Provincia del departamento de Amazonas', -5.116615, -78.429162),
  ('peru-amazonas-bongara', 'Bongará', 'peru-amazonas', 'Provincia del departamento de Amazonas', -5.632026, -77.886078),
  ('peru-amazonas-chachapoyas', 'Chachapoyas', 'peru-amazonas', 'Provincia del departamento de Amazonas', -6.46466, -77.79922),
  ('peru-amazonas-condorcanqui', 'Condorcanqui', 'peru-amazonas', 'Provincia del departamento de Amazonas', -4.20002, -78.077615),
  ('peru-amazonas-luya', 'Luya', 'peru-amazonas', 'Provincia del departamento de Amazonas', -6.324031, -78.132868),
  ('peru-amazonas-rodriguez-de-mendoza', 'Rodríguez de Mendoza', 'peru-amazonas', 'Provincia del departamento de Amazonas', -6.363506, -77.499582),
  ('peru-amazonas-utcubamba', 'Utcubamba', 'peru-amazonas', 'Provincia del departamento de Amazonas', -5.75901, -78.392302),
  ('peru-ancash-aija', 'Aija', 'peru-ancash', 'Provincia del departamento de Áncash', -9.767516, -77.638064),
  ('peru-ancash-antonio-raymondi', 'Antonio Raymondi', 'peru-ancash', 'Provincia del departamento de Áncash', -9.136423, -77.053105),
  ('peru-ancash-asuncion', 'Asunción', 'peru-ancash', 'Provincia del departamento de Áncash', -9.190448, -77.39973),
  ('peru-ancash-bolognesi', 'Bolognesi', 'peru-ancash', 'Provincia del departamento de Áncash', -10.092889, -77.024326),
  ('peru-ancash-carhuaz', 'Carhuaz', 'peru-ancash', 'Provincia del departamento de Áncash', -9.267371, -77.601545),
  ('peru-ancash-carlos-fermin-fitzcarrald', 'Carlos Fermín Fitzcarrald', 'peru-ancash', 'Provincia del departamento de Áncash', -9.052012, -77.251495),
  ('peru-ancash-casma', 'Casma', 'peru-ancash', 'Provincia del departamento de Áncash', -9.497958, -78.156048),
  ('peru-ancash-corongo', 'Corongo', 'peru-ancash', 'Provincia del departamento de Áncash', -8.563273, -77.871797),
  ('peru-ancash-huaraz', 'Huaraz', 'peru-ancash', 'Provincia del departamento de Áncash', -9.573807, -77.640669),
  ('peru-ancash-huari', 'Huari', 'peru-ancash', 'Provincia del departamento de Áncash', -9.455731, -77.125697),
  ('peru-ancash-huarmey', 'Huarmey', 'peru-ancash', 'Provincia del departamento de Áncash', -10.15057, -77.906859),
  ('peru-ancash-huaylas', 'Huaylas', 'peru-ancash', 'Provincia del departamento de Áncash', -8.958089, -77.782537),
  ('peru-ancash-mariscal-luzuriaga', 'Mariscal Luzuriaga', 'peru-ancash', 'Provincia del departamento de Áncash', -8.855566, -77.29719),
  ('peru-ancash-ocros', 'Ocros', 'peru-ancash', 'Provincia del departamento de Áncash', -10.519663, -77.391567),
  ('peru-ancash-pallasca', 'Pallasca', 'peru-ancash', 'Provincia del departamento de Áncash', -8.372466, -77.957947),
  ('peru-ancash-pomabamba', 'Pomabamba', 'peru-ancash', 'Provincia del departamento de Áncash', -8.715263, -77.424126),
  ('peru-ancash-recuay', 'Recuay', 'peru-ancash', 'Provincia del departamento de Áncash', -9.949054, -77.414442),
  ('peru-ancash-santa', 'Santa', 'peru-ancash', 'Provincia del departamento de Áncash', -9.003817, -78.304753),
  ('peru-ancash-sihuas', 'Sihuas', 'peru-ancash', 'Provincia del departamento de Áncash', -8.497161, -77.546977),
  ('peru-ancash-yungay', 'Yungay', 'peru-ancash', 'Provincia del departamento de Áncash', -9.173994, -77.6854),
  ('peru-apurimac-abancay', 'Abancay', 'peru-apurimac', 'Provincia del departamento de Apurímac', -13.776624, -72.91948),
  ('peru-apurimac-andahuaylas', 'Andahuaylas', 'peru-apurimac', 'Provincia del departamento de Apurímac', -13.978108, -73.499721),
  ('peru-apurimac-antabamba', 'Antabamba', 'peru-apurimac', 'Provincia del departamento de Apurímac', -14.433513, -72.677931),
  ('peru-apurimac-aymaraes', 'Aymaraes', 'peru-apurimac', 'Provincia del departamento de Apurímac', -14.321395, -73.227636),
  ('peru-apurimac-chincheros', 'Chincheros', 'peru-apurimac', 'Provincia del departamento de Apurímac', -13.453736, -73.649104),
  ('peru-apurimac-cotabambas', 'Cotabambas', 'peru-apurimac', 'Provincia del departamento de Apurímac', -14.041315, -72.239857),
  ('peru-apurimac-grau', 'Grau', 'peru-apurimac', 'Provincia del departamento de Apurímac', -14.045881, -72.608911),
  ('peru-arequipa-arequipa', 'Arequipa', 'peru-arequipa', 'Provincia del departamento de Arequipa', -16.360912, -71.56465),
  ('peru-arequipa-camana', 'Camaná', 'peru-arequipa', 'Provincia del departamento de Arequipa', -16.40056, -72.945508),
  ('peru-arequipa-caraveli', 'Caravelí', 'peru-arequipa', 'Provincia del departamento de Arequipa', -15.751686, -73.858462),
  ('peru-arequipa-castilla', 'Castilla', 'peru-arequipa', 'Provincia del departamento de Arequipa', -15.633884, -72.420642),
  ('peru-arequipa-caylloma', 'Caylloma', 'peru-arequipa', 'Provincia del departamento de Arequipa', -15.70071, -71.567505),
  ('peru-arequipa-condesuyos', 'Condesuyos', 'peru-arequipa', 'Provincia del departamento de Arequipa', -15.547408, -72.866997),
  ('peru-arequipa-islay', 'Islay', 'peru-arequipa', 'Provincia del departamento de Arequipa', -16.980037, -71.755842),
  ('peru-arequipa-la-union', 'La Unión', 'peru-arequipa', 'Provincia del departamento de Arequipa', -15.107597, -72.753157),
  ('peru-ayacucho-cangallo', 'Cangallo', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -13.50491, -74.50019),
  ('peru-ayacucho-huamanga', 'Huamanga', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -13.261663, -74.289321),
  ('peru-ayacucho-huanca-sancos', 'Huanca Sancos', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -13.931195, -74.446132),
  ('peru-ayacucho-huanta', 'Huanta', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -12.60928, -74.087635),
  ('peru-ayacucho-la-mar', 'La Mar', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -13.003839, -73.794503),
  ('peru-ayacucho-lucanas', 'Lucanas', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -14.750278, -74.291636),
  ('peru-ayacucho-parinacochas', 'Parinacochas', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -15.068582, -73.669729),
  ('peru-ayacucho-paucar-del-sara-sara', 'Paucar del Sara Sara', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -15.11498, -73.285774),
  ('peru-ayacucho-sucre', 'Sucre', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -14.089893, -73.758867),
  ('peru-ayacucho-victor-fajardo', 'Víctor Fajardo', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -13.870875, -74.02915),
  ('peru-ayacucho-vilcas-huaman', 'Vilcas Huaman', 'peru-ayacucho', 'Provincia del departamento de Ayacucho', -13.673988, -73.889596),
  ('peru-cajamarca-cajabamba', 'Cajabamba', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -7.553713, -78.110722),
  ('peru-cajamarca-cajamarca', 'Cajamarca', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -7.177527, -78.462455),
  ('peru-cajamarca-celendin', 'Celendín', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -6.770901, -78.209196),
  ('peru-cajamarca-chota', 'Chota', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -6.382944, -79.180033),
  ('peru-cajamarca-contumaza', 'Contumazá', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -7.419824, -78.983022),
  ('peru-cajamarca-cutervo', 'Cutervo', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -6.165309, -78.899108),
  ('peru-cajamarca-hualgayoc', 'Hualgayoc', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -6.71417, -78.566037),
  ('peru-cajamarca-jaen', 'Jaén', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -5.729635, -79.026628),
  ('peru-cajamarca-san-ignacio', 'San Ignacio', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -5.074487, -78.977533),
  ('peru-cajamarca-san-marcos', 'San Marcos', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -7.272526, -78.040513),
  ('peru-cajamarca-san-miguel', 'San Miguel', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -6.972755, -79.020214),
  ('peru-cajamarca-san-pablo', 'San Pablo', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -7.040279, -78.747533),
  ('peru-cajamarca-santa-cruz', 'Santa Cruz', 'peru-cajamarca', 'Provincia del departamento de Cajamarca', -6.68927, -78.985042),
  ('peru-cusco-acomayo', 'Acomayo', 'peru-cusco', 'Provincia del departamento de Cusco', -13.925147, -71.673176),
  ('peru-cusco-anta', 'Anta', 'peru-cusco', 'Provincia del departamento de Cusco', -13.499442, -72.381035),
  ('peru-cusco-calca', 'Calca', 'peru-cusco', 'Provincia del departamento de Cusco', -13.041365, -72.037772),
  ('peru-cusco-canas', 'Canas', 'peru-cusco', 'Provincia del departamento de Cusco', -14.371361, -71.413081),
  ('peru-cusco-canchis', 'Canchis', 'peru-cusco', 'Provincia del departamento de Cusco', -14.099254, -71.123392),
  ('peru-cusco-chumbivilcas', 'Chumbivilcas', 'peru-cusco', 'Provincia del departamento de Cusco', -14.411529, -71.925693),
  ('peru-cusco-cusco', 'Cusco', 'peru-cusco', 'Provincia del departamento de Cusco', -13.539355, -71.954356),
  ('peru-cusco-espinar', 'Espinar', 'peru-cusco', 'Provincia del departamento de Cusco', -14.994011, -71.223718),
  ('peru-cusco-la-convencion', 'La Convención', 'peru-cusco', 'Provincia del departamento de Cusco', -12.335544, -72.769008),
  ('peru-cusco-paruro', 'Paruro', 'peru-cusco', 'Provincia del departamento de Cusco', -13.935934, -71.916608),
  ('peru-cusco-paucartambo', 'Paucartambo', 'peru-cusco', 'Provincia del departamento de Cusco', -13.170104, -71.507471),
  ('peru-cusco-quispicanchi', 'Quispicanchi', 'peru-cusco', 'Provincia del departamento de Cusco', -13.51712, -70.855542),
  ('peru-cusco-urubamba', 'Urubamba', 'peru-cusco', 'Provincia del departamento de Cusco', -13.268002, -72.29985),
  ('peru-el-callao-bellavista', 'Bellavista', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -12.060006, -77.111186),
  ('peru-el-callao-callao', 'Callao', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -12.003677, -77.118266),
  ('peru-el-callao-carmen-de-la-legua-reynoso', 'Carmen de la Legua Reynoso', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -12.042471, -77.090883),
  ('peru-el-callao-la-perla', 'La Perla', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -12.071343, -77.117564),
  ('peru-el-callao-la-punta', 'La Punta', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -12.070896, -77.162212),
  ('peru-el-callao-mi-peru', 'Mi Perú', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -11.853541, -77.120379),
  ('peru-el-callao-ventanilla', 'Ventanilla', 'peru-el-callao', 'Distrito de la Provincia Constitucional del Callao', -11.883898, -77.123224),
  ('peru-huancavelica-acobamba', 'Acobamba', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -12.778838, -74.643381),
  ('peru-huancavelica-angaraes', 'Angaraes', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -13.05757, -74.655878),
  ('peru-huancavelica-castrovirreyna', 'Castrovirreyna', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -13.150067, -75.351865),
  ('peru-huancavelica-churcampa', 'Churcampa', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -12.59856, -74.510118),
  ('peru-huancavelica-huancavelica', 'Huancavelica', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -12.77228, -75.151589),
  ('peru-huancavelica-huaytara', 'Huaytará', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -13.635874, -75.133696),
  ('peru-huancavelica-tayacaja', 'Tayacaja', 'peru-huancavelica', 'Provincia del departamento de Huancavelica', -12.260067, -74.747304),
  ('peru-huanuco-ambo', 'Ambo', 'peru-huanuco', 'Provincia del departamento de Huánuco', -10.223301, -76.242235),
  ('peru-huanuco-dos-de-mayo', 'Dos de Mayo', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.69984, -76.831841),
  ('peru-huanuco-huacaybamba', 'Huacaybamba', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.002911, -76.84186),
  ('peru-huanuco-huamalies', 'Huamalíes', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.406759, -76.625362),
  ('peru-huanuco-huanuco', 'Huánuco', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.85144, -76.28305),
  ('peru-huanuco-lauricocha', 'Lauricocha', 'peru-huanuco', 'Provincia del departamento de Huánuco', -10.173419, -76.721863),
  ('peru-huanuco-leoncio-prado', 'Leoncio Prado', 'peru-huanuco', 'Provincia del departamento de Huánuco', -8.961369, -76.061694),
  ('peru-huanuco-maranon', 'Marañón', 'peru-huanuco', 'Provincia del departamento de Huánuco', -8.732544, -76.740805),
  ('peru-huanuco-pachitea', 'Pachitea', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.939867, -75.894223),
  ('peru-huanuco-puerto-inca', 'Puerto Inca', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.269781, -74.931421),
  ('peru-huanuco-yarowilca', 'Yarowilca', 'peru-huanuco', 'Provincia del departamento de Huánuco', -9.812704, -76.607952),
  ('peru-ica-chincha', 'Chincha', 'peru-ica', 'Provincia del departamento de Ica', -13.298184, -75.959497),
  ('peru-ica-ica', 'Ica', 'peru-ica', 'Provincia del departamento de Ica', -14.33647, -75.61212),
  ('peru-ica-nasca', 'Nasca', 'peru-ica', 'Provincia del departamento de Ica', -14.994023, -75.05813),
  ('peru-ica-palpa', 'Palpa', 'peru-ica', 'Provincia del departamento de Ica', -14.356262, -75.162298),
  ('peru-ica-pisco', 'Pisco', 'peru-ica', 'Provincia del departamento de Ica', -13.888557, -76.221513),
  ('peru-junin-chanchamayo', 'Chanchamayo', 'peru-junin', 'Provincia del departamento de Junín', -11.001434, -75.049331),
  ('peru-junin-chupaca', 'Chupaca', 'peru-junin', 'Provincia del departamento de Junín', -12.210124, -75.455711),
  ('peru-junin-concepcion', 'Concepción', 'peru-junin', 'Provincia del departamento de Junín', -11.807163, -75.010585),
  ('peru-junin-huancayo', 'Huancayo', 'peru-junin', 'Provincia del departamento de Junín', -12.172211, -75.160832),
  ('peru-junin-jauja', 'Jauja', 'peru-junin', 'Provincia del departamento de Junín', -11.658865, -75.477236),
  ('peru-junin-junin', 'Junín', 'peru-junin', 'Provincia del departamento de Junín', -11.05753, -75.928456),
  ('peru-junin-satipo', 'Satipo', 'peru-junin', 'Provincia del departamento de Junín', -11.560499, -74.179188),
  ('peru-junin-tarma', 'Tarma', 'peru-junin', 'Provincia del departamento de Junín', -11.251808, -75.694702),
  ('peru-junin-yauli', 'Yauli', 'peru-junin', 'Provincia del departamento de Junín', -11.504766, -76.12181),
  ('peru-la-libertad-ascope', 'Ascope', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.693639, -79.173428),
  ('peru-la-libertad-bolivar', 'Bolívar', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.307802, -77.732869),
  ('peru-la-libertad-chepen', 'Chepén', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.135997, -79.477395),
  ('peru-la-libertad-gran-chimu', 'Gran Chimú', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.596069, -78.588031),
  ('peru-la-libertad-julcan', 'Julcán', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -8.188846, -78.461125),
  ('peru-la-libertad-otuzco', 'Otuzco', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.860712, -78.51623),
  ('peru-la-libertad-pacasmayo', 'Pacasmayo', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.428798, -79.405646),
  ('peru-la-libertad-pataz', 'Pataz', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -8.063209, -77.190811),
  ('peru-la-libertad-sanchez-carrion', 'Sánchez Carrión', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -7.74529, -77.940013),
  ('peru-la-libertad-santiago-de-chuco', 'Santiago de Chuco', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -8.267442, -78.19826),
  ('peru-la-libertad-trujillo', 'Trujillo', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -8.084255, -78.922859),
  ('peru-la-libertad-viru', 'Virú', 'peru-la-libertad', 'Provincia del departamento de La Libertad', -8.555284, -78.537612),
  ('peru-lambayeque-chiclayo', 'Chiclayo', 'peru-lambayeque', 'Provincia del departamento de Lambayeque', -6.829345, -79.575325),
  ('peru-lambayeque-ferrenafe', 'Ferreñafe', 'peru-lambayeque', 'Provincia del departamento de Lambayeque', -6.345701, -79.476456),
  ('peru-lambayeque-lambayeque', 'Lambayeque', 'peru-lambayeque', 'Provincia del departamento de Lambayeque', -6.150486, -79.949709),
  ('peru-lima-barranca', 'Barranca', 'peru-lima', 'Provincia del departamento de Lima', -10.626355, -77.729167),
  ('peru-lima-cajatambo', 'Cajatambo', 'peru-lima', 'Provincia del departamento de Lima', -10.486032, -77.01254),
  ('peru-lima-canete', 'Cañete', 'peru-lima', 'Provincia del departamento de Lima', -12.799681, -76.398449),
  ('peru-lima-canta', 'Canta', 'peru-lima', 'Provincia del departamento de Lima', -11.534452, -76.709238),
  ('peru-lima-huaral', 'Huaral', 'peru-lima', 'Provincia del departamento de Lima', -11.357748, -76.914513),
  ('peru-lima-huarochiri', 'Huarochirí', 'peru-lima', 'Provincia del departamento de Lima', -11.93386, -76.360375),
  ('peru-lima-huaura', 'Huaura', 'peru-lima', 'Provincia del departamento de Lima', -11.026695, -77.14026),
  ('peru-lima-oyon', 'Oyón', 'peru-lima', 'Provincia del departamento de Lima', -10.71782, -76.839904),
  ('peru-lima-yauyos', 'Yauyos', 'peru-lima', 'Provincia del departamento de Lima', -12.522011, -75.946186),
  ('peru-loreto-alto-amazonas', 'Alto Amazonas', 'peru-loreto', 'Provincia del departamento de Loreto', -4.913934, -75.801295),
  ('peru-loreto-datem-del-maranon', 'Datem del Marañón', 'peru-loreto', 'Provincia del departamento de Loreto', -4.129128, -76.930515),
  ('peru-loreto-loreto', 'Loreto', 'peru-loreto', 'Provincia del departamento de Loreto', -3.761118, -75.29765),
  ('peru-loreto-mariscal-ramon-castilla', 'Mariscal Ramón Castilla', 'peru-loreto', 'Provincia del departamento de Loreto', -3.972307, -71.22604),
  ('peru-loreto-maynas', 'Maynas', 'peru-loreto', 'Provincia del departamento de Loreto', -2.674674, -74.120671),
  ('peru-loreto-putumayo', 'Putumayo', 'peru-loreto', 'Provincia del departamento de Loreto', -1.731452, -73.657304),
  ('peru-loreto-requena', 'Requena', 'peru-loreto', 'Provincia del departamento de Loreto', -5.990344, -73.943125),
  ('peru-loreto-ucayali', 'Ucayali', 'peru-loreto', 'Provincia del departamento de Loreto', -7.290819, -75.514763),
  ('peru-madre-de-dios-manu', 'Manu', 'peru-madre-de-dios', 'Provincia del departamento de Madre de Dios', -12.293066, -71.156383),
  ('peru-madre-de-dios-tahuamanu', 'Tahuamanu', 'peru-madre-de-dios', 'Provincia del departamento de Madre de Dios', -10.902617, -70.964441),
  ('peru-madre-de-dios-tambopata', 'Tambopata', 'peru-madre-de-dios', 'Provincia del departamento de Madre de Dios', -12.187969, -69.597917),
  ('peru-moquegua-general-sanchez-cerro', 'General Sánchez Cerro', 'peru-moquegua', 'Provincia del departamento de Moquegua', -16.478414, -70.661774),
  ('peru-moquegua-ilo', 'Ilo', 'peru-moquegua', 'Provincia del departamento de Moquegua', -17.536727, -71.209393),
  ('peru-moquegua-mariscal-nieto', 'Mariscal Nieto', 'peru-moquegua', 'Provincia del departamento de Moquegua', -17.055242, -70.884203),
  ('peru-municipalidad-metropolitana-de-lima-ancon', 'Ancón', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.696872, -77.09128),
  ('peru-municipalidad-metropolitana-de-lima-ate', 'Ate', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.038728, -76.896873),
  ('peru-municipalidad-metropolitana-de-lima-barranco', 'Barranco', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.143959, -77.020268),
  ('peru-municipalidad-metropolitana-de-lima-brena', 'Breña', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.05933, -77.050047),
  ('peru-municipalidad-metropolitana-de-lima-carabayllo', 'Carabayllo', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.819267, -76.997823),
  ('peru-municipalidad-metropolitana-de-lima-chaclacayo', 'Chaclacayo', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.992479, -76.776199),
  ('peru-municipalidad-metropolitana-de-lima-chorrillos', 'Chorrillos', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.19227, -77.008969),
  ('peru-municipalidad-metropolitana-de-lima-cieneguilla', 'Cieneguilla', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.073167, -76.777071),
  ('peru-municipalidad-metropolitana-de-lima-comas', 'Comas', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.932861, -77.040674),
  ('peru-municipalidad-metropolitana-de-lima-el-agustino', 'El Agustino', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.042121, -76.995726),
  ('peru-municipalidad-metropolitana-de-lima-independencia', 'Independencia', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.989307, -77.047389),
  ('peru-municipalidad-metropolitana-de-lima-jesus-maria', 'Jesús María', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.078186, -77.046412),
  ('peru-municipalidad-metropolitana-de-lima-la-molina', 'La Molina', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.090177, -76.922338),
  ('peru-municipalidad-metropolitana-de-lima-la-victoria', 'La Victoria', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.074273, -77.018311),
  ('peru-municipalidad-metropolitana-de-lima-lima', 'Lima', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.055502, -77.026367),
  ('peru-municipalidad-metropolitana-de-lima-lince', 'Lince', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.086532, -77.036657),
  ('peru-municipalidad-metropolitana-de-lima-los-olivos', 'Los Olivos', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.965985, -77.073071),
  ('peru-municipalidad-metropolitana-de-lima-lurigancho', 'Lurigancho', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.948259, -76.762174),
  ('peru-municipalidad-metropolitana-de-lima-lurin', 'Lurín', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.23805, -76.783863),
  ('peru-municipalidad-metropolitana-de-lima-magdalena-del-mar', 'Magdalena del Mar', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.095672, -77.068055),
  ('peru-municipalidad-metropolitana-de-lima-miraflores', 'Miraflores', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.121498, -77.025906),
  ('peru-municipalidad-metropolitana-de-lima-pachacamac', 'Pachacámac', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.149535, -76.791283),
  ('peru-municipalidad-metropolitana-de-lima-pucusana', 'Pucusana', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.468469, -76.772497),
  ('peru-municipalidad-metropolitana-de-lima-pueblo-libre', 'Pueblo Libre', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.076639, -77.067858),
  ('peru-municipalidad-metropolitana-de-lima-puente-piedra', 'Puente Piedra', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.876448, -77.074722),
  ('peru-municipalidad-metropolitana-de-lima-punta-hermosa', 'Punta Hermosa', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.26176, -76.728918),
  ('peru-municipalidad-metropolitana-de-lima-punta-negra', 'Punta Negra', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.297717, -76.699016),
  ('peru-municipalidad-metropolitana-de-lima-rimac', 'Rímac', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.020301, -77.035444),
  ('peru-municipalidad-metropolitana-de-lima-san-bartolo', 'San Bartolo', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.367693, -76.718803),
  ('peru-municipalidad-metropolitana-de-lima-san-borja', 'San Borja', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.096452, -76.995676),
  ('peru-municipalidad-metropolitana-de-lima-san-isidro', 'San Isidro', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.097646, -77.035235),
  ('peru-municipalidad-metropolitana-de-lima-san-juan-de-lurigancho', 'San Juan de Lurigancho', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.948751, -76.977911),
  ('peru-municipalidad-metropolitana-de-lima-san-juan-de-miraflores', 'San Juan de Miraflores', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.155233, -76.972573),
  ('peru-municipalidad-metropolitana-de-lima-san-luis', 'San Luis', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.072355, -76.995891),
  ('peru-municipalidad-metropolitana-de-lima-san-martin-de-porres', 'San Martín de Porres', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.988038, -77.098245),
  ('peru-municipalidad-metropolitana-de-lima-san-miguel', 'San Miguel', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.077901, -77.095856),
  ('peru-municipalidad-metropolitana-de-lima-santa-anita', 'Santa Anita', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.043252, -76.961943),
  ('peru-municipalidad-metropolitana-de-lima-santa-maria-del-mar', 'Santa María del Mar', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.408123, -76.766319),
  ('peru-municipalidad-metropolitana-de-lima-santa-rosa', 'Santa Rosa', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -11.804952, -77.160004),
  ('peru-municipalidad-metropolitana-de-lima-santiago-de-surco', 'Santiago de Surco', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.124894, -76.981741),
  ('peru-municipalidad-metropolitana-de-lima-surquillo', 'Surquillo', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.114198, -77.010475),
  ('peru-municipalidad-metropolitana-de-lima-villa-el-salvador', 'Villa El Salvador', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.216894, -76.94915),
  ('peru-municipalidad-metropolitana-de-lima-villa-maria-del-triunfo', 'Villa María del Triunfo', 'peru-municipalidad-metropolitana-de-lima', 'Distrito de Lima Metropolitana', -12.176644, -76.918968),
  ('peru-pasco-daniel-alcides-carrion', 'Daniel Alcides Carrión', 'peru-pasco', 'Provincia del departamento de Pasco', -10.516615, -76.480355),
  ('peru-pasco-oxapampa', 'Oxapampa', 'peru-pasco', 'Provincia del departamento de Pasco', -10.180775, -74.970537),
  ('peru-pasco-pasco', 'Pasco', 'peru-pasco', 'Provincia del departamento de Pasco', -10.729363, -76.035613),
  ('peru-piura-ayabaca', 'Ayabaca', 'peru-piura', 'Provincia del departamento de Piura', -4.698037, -79.736604),
  ('peru-piura-huancabamba', 'Huancabamba', 'peru-piura', 'Provincia del departamento de Piura', -5.401391, -79.533363),
  ('peru-piura-morropon', 'Morropón', 'peru-piura', 'Provincia del departamento de Piura', -5.270794, -80.014441),
  ('peru-piura-paita', 'Paita', 'peru-piura', 'Provincia del departamento de Piura', -5.080145, -80.968047),
  ('peru-piura-piura', 'Piura', 'peru-piura', 'Provincia del departamento de Piura', -5.190208, -80.5718),
  ('peru-piura-sechura', 'Sechura', 'peru-piura', 'Provincia del departamento de Piura', -5.861092, -80.614518),
  ('peru-piura-sullana', 'Sullana', 'peru-piura', 'Provincia del departamento de Piura', -4.688268, -80.634585),
  ('peru-piura-talara', 'Talara', 'peru-piura', 'Provincia del departamento de Piura', -4.451916, -81.065988),
  ('peru-puno-azangaro', 'Azángaro', 'peru-puno', 'Provincia del departamento de Puno', -14.8357, -70.173569),
  ('peru-puno-carabaya', 'Carabaya', 'peru-puno', 'Provincia del departamento de Puno', -13.816154, -70.218295),
  ('peru-puno-chucuito', 'Chucuito', 'peru-puno', 'Provincia del departamento de Puno', -16.674873, -69.284244),
  ('peru-puno-el-collao', 'El Collao', 'peru-puno', 'Provincia del departamento de Puno', -16.625812, -69.75594),
  ('peru-puno-huancane', 'Huancané', 'peru-puno', 'Provincia del departamento de Puno', -15.150031, -69.550597),
  ('peru-puno-lampa', 'Lampa', 'peru-puno', 'Provincia del departamento de Puno', -15.38211, -70.648326),
  ('peru-puno-melgar', 'Melgar', 'peru-puno', 'Provincia del departamento de Puno', -14.635181, -70.749797),
  ('peru-puno-moho', 'Moho', 'peru-puno', 'Provincia del departamento de Puno', -15.350043, -69.401583),
  ('peru-puno-puno', 'Puno', 'peru-puno', 'Provincia del departamento de Puno', -16.06696, -70.046635),
  ('peru-puno-san-antonio-de-putina', 'San Antonio de Putina', 'peru-puno', 'Provincia del departamento de Puno', -14.708434, -69.549028),
  ('peru-puno-san-roman', 'San Román', 'peru-puno', 'Provincia del departamento de Puno', -15.673974, -70.329189),
  ('peru-puno-sandia', 'Sandia', 'peru-puno', 'Provincia del departamento de Puno', -13.832927, -69.334178),
  ('peru-puno-yunguyo', 'Yunguyo', 'peru-puno', 'Provincia del departamento de Puno', -16.304966, -69.117856),
  ('peru-san-martin-bellavista', 'Bellavista', 'peru-san-martin', 'Provincia del departamento de San Martín', -7.551553, -76.33901),
  ('peru-san-martin-el-dorado', 'El Dorado', 'peru-san-martin', 'Provincia del departamento de San Martín', -6.537568, -76.747785),
  ('peru-san-martin-huallaga', 'Huallaga', 'peru-san-martin', 'Provincia del departamento de San Martín', -6.750987, -76.902147),
  ('peru-san-martin-lamas', 'Lamas', 'peru-san-martin', 'Provincia del departamento de San Martín', -6.324337, -76.394921),
  ('peru-san-martin-mariscal-caceres', 'Mariscal Cáceres', 'peru-san-martin', 'Provincia del departamento de San Martín', -7.223549, -77.11758),
  ('peru-san-martin-moyobamba', 'Moyobamba', 'peru-san-martin', 'Provincia del departamento de San Martín', -5.909699, -76.994475),
  ('peru-san-martin-picota', 'Picota', 'peru-san-martin', 'Provincia del departamento de San Martín', -6.94059, -76.295361),
  ('peru-san-martin-rioja', 'Rioja', 'peru-san-martin', 'Provincia del departamento de San Martín', -5.820805, -77.507591),
  ('peru-san-martin-san-martin', 'San Martín', 'peru-san-martin', 'Provincia del departamento de San Martín', -6.43667, -75.721488),
  ('peru-san-martin-tocache', 'Tocache', 'peru-san-martin', 'Provincia del departamento de San Martín', -8.240943, -76.568433),
  ('peru-tacna-candarave', 'Candarave', 'peru-tacna', 'Provincia del departamento de Tacna', -17.115227, -70.294157),
  ('peru-tacna-jorge-basadre', 'Jorge Basadre', 'peru-tacna', 'Provincia del departamento de Tacna', -17.58495, -70.713635),
  ('peru-tacna-tacna', 'Tacna', 'peru-tacna', 'Provincia del departamento de Tacna', -17.871757, -70.29539),
  ('peru-tacna-tarata', 'Tarata', 'peru-tacna', 'Provincia del departamento de Tacna', -17.406485, -69.942214),
  ('peru-tumbes-contralmirante-villar', 'Contralmirante Villar', 'peru-tumbes', 'Provincia del departamento de Tumbes', -3.925809, -80.720673),
  ('peru-tumbes-tumbes', 'Tumbes', 'peru-tumbes', 'Provincia del departamento de Tumbes', -3.858869, -80.398289),
  ('peru-tumbes-zarumilla', 'Zarumilla', 'peru-tumbes', 'Provincia del departamento de Tumbes', -3.654115, -80.244687),
  ('peru-ucayali-atalaya', 'Atalaya', 'peru-ucayali', 'Provincia del departamento de Ucayali', -10.430261, -73.34119),
  ('peru-ucayali-coronel-portillo', 'Coronel Portillo', 'peru-ucayali', 'Provincia del departamento de Ucayali', -8.67789, -73.895933),
  ('peru-ucayali-padre-abad', 'Padre Abad', 'peru-ucayali', 'Provincia del departamento de Ucayali', -8.814359, -75.446748),
  ('peru-ucayali-purus', 'Purús', 'peru-ucayali', 'Provincia del departamento de Ucayali', -10.218184, -71.576847);

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
      and p.path = 'earth.south-america.peru.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0082_MISSING_REGION: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0082_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 244;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.south-america.peru.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0082_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
