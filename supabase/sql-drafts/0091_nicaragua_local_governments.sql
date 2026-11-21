-- =============================================================================
-- Agorbis · 0091 · Municipios de Nicaragua como nivel 4 (D143)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-list-level4-draft.mjs nicaragua; no se edita a mano.
--
-- Fuente: Wikidata (CC0, de terceros), clase Q318727, con nombres y puntos;
-- el generador exige los 153 municipios de la Ley 59 de División Política
-- Administrativa.
-- Consultado el 2026-11-21. 153 unidades.
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
  ('nicaragua-boaco-boaco', 'Boaco', 'nicaragua-boaco-department', 'Municipio del departamento de Boaco', 12.472617, -85.659953),
  ('nicaragua-boaco-camoapa', 'Camoapa', 'nicaragua-boaco-department', 'Municipio del departamento de Boaco', 12.384422, -85.512644),
  ('nicaragua-boaco-san-jose-de-los-remates', 'San José de los Remates', 'nicaragua-boaco-department', 'Municipio del departamento de Boaco', 12.6, -85.79),
  ('nicaragua-boaco-san-lorenzo', 'San Lorenzo', 'nicaragua-boaco-department', 'Municipio del departamento de Boaco', 12.377847, -85.667214),
  ('nicaragua-boaco-santa-lucia', 'Santa Lucía', 'nicaragua-boaco-department', 'Municipio del departamento de Boaco', 12.51, -85.71),
  ('nicaragua-boaco-teustepe', 'Teustepe', 'nicaragua-boaco-department', 'Municipio del departamento de Boaco', 12.420208, -85.799875),
  ('nicaragua-carazo-diriamba', 'Diriamba', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.856114, -86.240308),
  ('nicaragua-carazo-dolores', 'Dolores', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.856237, -86.215818),
  ('nicaragua-carazo-el-rosario', 'El Rosario', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.833003, -86.166344),
  ('nicaragua-carazo-jinotepe', 'Jinotepe', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.847817, -86.19925),
  ('nicaragua-carazo-la-conquista', 'La Conquista', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.7339, -86.192964),
  ('nicaragua-carazo-la-paz-de-carazo', 'La Paz de Carazo', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.822656, -86.127894),
  ('nicaragua-carazo-san-marcos', 'San Marcos', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.909158, -86.204717),
  ('nicaragua-carazo-santa-teresa', 'Santa Teresa', 'nicaragua-carazo-department', 'Municipio del departamento de Carazo', 11.8037, -86.163442),
  ('nicaragua-chinandega-chichigalpa', 'Chichigalpa', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.570364, -87.028025),
  ('nicaragua-chinandega-chinandega', 'Chinandega', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.631053, -87.134739),
  ('nicaragua-chinandega-cinco-pinos', 'Cinco Pinos', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 13.229586, -86.867694),
  ('nicaragua-chinandega-corinto', 'Corinto', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.46, -87.16),
  ('nicaragua-chinandega-el-realejo', 'El Realejo', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.542419, -87.164939),
  ('nicaragua-chinandega-el-viejo', 'El Viejo', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.661944, -87.167381),
  ('nicaragua-chinandega-posoltega', 'Posoltega', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.543333, -86.980875),
  ('nicaragua-chinandega-puerto-morazan', 'Puerto Morazán', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.766639, -87.132256),
  ('nicaragua-chinandega-san-francisco-del-norte', 'San Francisco del Norte', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 13.198886, -86.770683),
  ('nicaragua-chinandega-san-pedro-del-norte', 'San Pedro del Norte', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 13.2761, -86.877828),
  ('nicaragua-chinandega-santo-tomas-del-norte', 'Santo Tomás del Norte', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 13.1858, -86.922528),
  ('nicaragua-chinandega-somotillo', 'Somotillo', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 13.044564, -86.905056),
  ('nicaragua-chinandega-villanueva', 'Villanueva', 'nicaragua-chinandega-department', 'Municipio del departamento de Chinandega', 12.964706, -86.815614),
  ('nicaragua-chontales-acoyapa', 'Acoyapa', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 11.970389, -85.171906),
  ('nicaragua-chontales-comalapa', 'Comalapa', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.284233, -85.510889),
  ('nicaragua-chontales-el-coral', 'El Coral', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 11.920736, -84.649161),
  ('nicaragua-chontales-juigalpa', 'Juigalpa', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.106061, -85.365208),
  ('nicaragua-chontales-la-libertad', 'La Libertad', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.216194, -85.165831),
  ('nicaragua-chontales-san-francisco-de-cuapa', 'San Francisco de Cuapa', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.268775, -85.382486),
  ('nicaragua-chontales-san-pedro-de-lovago', 'San Pedro de Lóvago', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.129853, -85.114767),
  ('nicaragua-chontales-santo-domingo', 'Santo Domingo', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.263219, -85.082758),
  ('nicaragua-chontales-santo-tomas', 'Santo Tomás', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.069844, -85.090572),
  ('nicaragua-chontales-villa-sandino', 'Villa Sandino', 'nicaragua-chontales-department', 'Municipio del departamento de Chontales', 12.049997, -84.992942),
  ('nicaragua-esteli-condega', 'Condega', 'nicaragua-esteli-department', 'Municipio del departamento de Estelí', 13.361364, -86.397419),
  ('nicaragua-esteli-esteli', 'Estelí', 'nicaragua-esteli-department', 'Municipio del departamento de Estelí', 13.092931, -86.356158),
  ('nicaragua-esteli-la-trinidad', 'La Trinidad', 'nicaragua-esteli-department', 'Municipio del departamento de Estelí', 12.967928, -86.235283),
  ('nicaragua-esteli-pueblo-nuevo', 'Pueblo Nuevo', 'nicaragua-esteli-department', 'Municipio del departamento de Estelí', 13.380178, -86.481294),
  ('nicaragua-esteli-san-juan-de-limay', 'San Juan de Limay', 'nicaragua-esteli-department', 'Municipio del departamento de Estelí', 13.174411, -86.612067),
  ('nicaragua-esteli-san-nicolas', 'San Nicolás', 'nicaragua-esteli-department', 'Municipio del departamento de Estelí', 12.932717, -86.348392),
  ('nicaragua-granada-diria', 'Diriá', 'nicaragua-granada-department', 'Municipio del departamento de Granada', 11.886358, -86.055956),
  ('nicaragua-granada-diriomo', 'Diriomo', 'nicaragua-granada-department', 'Municipio del departamento de Granada', 11.874583, -86.051),
  ('nicaragua-granada-granada', 'Granada', 'nicaragua-granada-department', 'Municipio del departamento de Granada', 11.93035, -85.953592),
  ('nicaragua-granada-nandaime', 'Nandaime', 'nicaragua-granada-department', 'Municipio del departamento de Granada', 11.756203, -86.053444),
  ('nicaragua-jinotega-el-cua', 'El Cuá', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.368125, -85.672831),
  ('nicaragua-jinotega-jinotega', 'Jinotega', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.091983, -86.003181),
  ('nicaragua-jinotega-la-concordia', 'La Concordia', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.195811, -86.166764),
  ('nicaragua-jinotega-san-jose-de-bocay', 'San José de Bocay', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.542489, -85.540172),
  ('nicaragua-jinotega-san-rafael-del-norte', 'San Rafael del Norte', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.213619, -86.11055),
  ('nicaragua-jinotega-san-sebastian-de-yali', 'San Sebastián de Yalí', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.305711, -86.186706),
  ('nicaragua-jinotega-santa-maria-de-pantasma', 'Santa María de Pantasma', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.348553, -85.943156),
  ('nicaragua-jinotega-wiwili-de-jinotega', 'Wiwilí de Jinotega', 'nicaragua-jinotega-department', 'Municipio del departamento de Jinotega', 13.620006, -85.818183),
  ('nicaragua-leon-achuapa', 'Achuapa', 'nicaragua-leon-department', 'Municipio del departamento de León', 13.053811, -86.589928),
  ('nicaragua-leon-el-jicaral', 'El Jicaral', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.72845, -86.380786),
  ('nicaragua-leon-el-sauce', 'El Sauce', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.885944, -86.538972),
  ('nicaragua-leon-la-paz-centro', 'La Paz Centro', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.339389, -86.676283),
  ('nicaragua-leon-larreynaga', 'Larreynaga', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.593328, -86.678992),
  ('nicaragua-leon-leon', 'León', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.434825, -86.878833),
  ('nicaragua-leon-nagarote', 'Nagarote', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.264767, -86.563044),
  ('nicaragua-leon-quezalguaque', 'Quezalguaque', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.507742, -86.902994),
  ('nicaragua-leon-santa-rosa-del-penon', 'Santa Rosa del Peñón', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.800883, -86.369619),
  ('nicaragua-leon-telica', 'Telica', 'nicaragua-leon-department', 'Municipio del departamento de León', 12.521189, -86.860561),
  ('nicaragua-madriz-las-sabanas', 'Las Sabanas', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.342969, -86.621489),
  ('nicaragua-madriz-palacaguina', 'Palacagüina', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.456714, -86.406397),
  ('nicaragua-madriz-san-jose-de-cusmapa', 'San José de Cusmapa', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.287964, -86.654392),
  ('nicaragua-madriz-san-juan-del-rio-coco', 'San Juan del Río Coco', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.544556, -86.164825),
  ('nicaragua-madriz-san-lucas', 'San Lucas', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.414014, -86.611617),
  ('nicaragua-madriz-somoto', 'Somoto', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.48371, -86.582622),
  ('nicaragua-madriz-telpaneca', 'Telpaneca', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.531706, -86.286917),
  ('nicaragua-madriz-totogalpa', 'Totogalpa', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.562933, -86.492736),
  ('nicaragua-madriz-yalaguina', 'Yalagüina', 'nicaragua-madriz-department', 'Municipio del departamento de Madriz', 13.485356, -86.492367),
  ('nicaragua-managua-ciudad-sandino', 'Ciudad Sandino', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 12.165658, -86.348558),
  ('nicaragua-managua-el-crucero', 'El Crucero', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 11.988853, -86.310353),
  ('nicaragua-managua-managua', 'Managua', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 12.154681, -86.273725),
  ('nicaragua-managua-mateare', 'Mateare', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 12.236272, -86.430511),
  ('nicaragua-managua-san-francisco-libre', 'San Francisco Libre', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 12.505636, -86.300331),
  ('nicaragua-managua-san-rafael-del-sur', 'San Rafael del Sur', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 11.84645, -86.438867),
  ('nicaragua-managua-ticuantepe', 'Ticuantepe', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 12.021736, -86.205314),
  ('nicaragua-managua-tipitapa', 'Tipitapa', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 12.196211, -86.096375),
  ('nicaragua-managua-villa-el-carmen', 'Villa El Carmen', 'nicaragua-managua-department', 'Municipio del departamento de Managua', 11.979722, -86.507042),
  ('nicaragua-masaya-catarina', 'Catarina', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.912336, -86.074119),
  ('nicaragua-masaya-la-concepcion', 'La Concepción', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.9373, -86.190189),
  ('nicaragua-masaya-masatepe', 'Masatepe', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.915617, -86.143803),
  ('nicaragua-masaya-masaya', 'Masaya', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.973617, -86.096058),
  ('nicaragua-masaya-nandasmo', 'Nandasmo', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.924361, -86.119869),
  ('nicaragua-masaya-nindiri', 'Nindirí', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 12.002686, -86.119967),
  ('nicaragua-masaya-niquinohomo', 'Niquinohomo', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.904125, -86.094556),
  ('nicaragua-masaya-san-juan-de-oriente', 'San Juan de Oriente', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 11.904497, -86.073589),
  ('nicaragua-masaya-tisma', 'Tisma', 'nicaragua-masaya-department', 'Municipio del departamento de Masaya', 12.080286, -86.017389),
  ('nicaragua-matagalpa-ciudad-dario', 'Ciudad Darío', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.727719, -86.123369),
  ('nicaragua-matagalpa-el-tuma-la-dalia', 'El Tuma-La Dalia', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 13.136956, -85.734011),
  ('nicaragua-matagalpa-esquipulas', 'Esquipulas', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.663547, -85.788125),
  ('nicaragua-matagalpa-matagalpa', 'Matagalpa', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.928361, -85.918447),
  ('nicaragua-matagalpa-matiguas', 'Matiguás', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.836911, -85.461608),
  ('nicaragua-matagalpa-muy-muy', 'Muy Muy', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.763389, -85.629758),
  ('nicaragua-matagalpa-rancho-grande', 'Rancho Grande', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 13.237458, -85.559117),
  ('nicaragua-matagalpa-rio-blanco', 'Río Blanco', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.932522, -85.225919),
  ('nicaragua-matagalpa-san-dionisio', 'San Dionisio', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.762233, -85.851681),
  ('nicaragua-matagalpa-san-isidro', 'San Isidro', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.930544, -86.194394),
  ('nicaragua-matagalpa-san-ramon', 'San Ramón', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.923025, -85.837953),
  ('nicaragua-matagalpa-sebaco', 'Sébaco', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.854914, -86.098458),
  ('nicaragua-matagalpa-terrabona', 'Terrabona', 'nicaragua-matagalpa-department', 'Municipio del departamento de Matagalpa', 12.730958, -85.965003),
  ('nicaragua-costa-caribe-norte-bonanza', 'Bonanza', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 14.030692, -84.600081),
  ('nicaragua-costa-caribe-norte-mulukuku', 'Mulukukú', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 13.171981, -84.960344),
  ('nicaragua-costa-caribe-norte-prinzapolka', 'Prinzapolka', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 13.500111, -84.224442),
  ('nicaragua-costa-caribe-norte-puerto-cabezas', 'Puerto Cabezas', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 14.028369, -83.382258),
  ('nicaragua-costa-caribe-norte-rosita', 'Rosita', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 13.923636, -84.399619),
  ('nicaragua-costa-caribe-norte-siuna', 'Siuna', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 13.7341, -84.77895),
  ('nicaragua-costa-caribe-norte-waslala', 'Waslala', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 13.336306, -85.3713),
  ('nicaragua-costa-caribe-norte-waspan', 'Waspán', 'nicaragua-north-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Norte', 14.740692, -83.972622),
  ('nicaragua-nueva-segovia-ciudad-antigua', 'Ciudad Antigua', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.64065, -86.308144),
  ('nicaragua-nueva-segovia-dipilto', 'Dipilto', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.720353, -86.505983),
  ('nicaragua-nueva-segovia-el-jicaro', 'El Jícaro', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.722044, -86.136878),
  ('nicaragua-nueva-segovia-jalapa', 'Jalapa', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.921997, -86.125347),
  ('nicaragua-nueva-segovia-macuelizo', 'Macuelizo', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.652183, -86.612967),
  ('nicaragua-nueva-segovia-mozonte', 'Mozonte', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.660114, -86.438722),
  ('nicaragua-nueva-segovia-murra', 'Murra', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.758531, -86.018883),
  ('nicaragua-nueva-segovia-ocotal', 'Ocotal', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.631919, -86.474408),
  ('nicaragua-nueva-segovia-quilali', 'Quilalí', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.567567, -86.026675),
  ('nicaragua-nueva-segovia-san-fernando', 'San Fernando', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.675894, -86.313717),
  ('nicaragua-nueva-segovia-santa-maria', 'Santa María', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.746328, -86.708264),
  ('nicaragua-nueva-segovia-wiwili-de-nueva-segovia', 'Wiwilí de Nueva Segovia', 'nicaragua-nueva-segovia-department', 'Municipio del departamento de Nueva Segovia', 13.627122, -85.825847),
  ('nicaragua-rio-san-juan-el-almendro', 'El Almendro', 'nicaragua-rio-san-juan-department', 'Municipio del departamento de Río San Juan', 11.677647, -84.702439),
  ('nicaragua-rio-san-juan-el-castillo', 'El Castillo', 'nicaragua-rio-san-juan-department', 'Municipio del departamento de Río San Juan', 11.042603, -84.472283),
  ('nicaragua-rio-san-juan-morrito', 'Morrito', 'nicaragua-rio-san-juan-department', 'Municipio del departamento de Río San Juan', 11.621808, -85.080836),
  ('nicaragua-rio-san-juan-san-carlos', 'San Carlos', 'nicaragua-rio-san-juan-department', 'Municipio del departamento de Río San Juan', 11.123039, -84.778344),
  ('nicaragua-rio-san-juan-san-juan-de-nicaragua', 'San Juan de Nicaragua', 'nicaragua-rio-san-juan-department', 'Municipio del departamento de Río San Juan', 10.946536, -83.735672),
  ('nicaragua-rio-san-juan-san-miguelito', 'San Miguelito', 'nicaragua-rio-san-juan-department', 'Municipio del departamento de Río San Juan', 11.402772, -84.900403),
  ('nicaragua-rivas-altagracia', 'Altagracia', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.566933, -85.578689),
  ('nicaragua-rivas-belen', 'Belén', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.501594, -85.886786),
  ('nicaragua-rivas-buenos-aires', 'Buenos Aires', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.468281, -85.816297),
  ('nicaragua-rivas-cardenas', 'Cárdenas', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.197094, -85.509486),
  ('nicaragua-rivas-moyogalpa', 'Moyogalpa', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.54005, -85.697939),
  ('nicaragua-rivas-potosi', 'Potosí', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.494622, -85.856125),
  ('nicaragua-rivas-rivas', 'Rivas', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.438908, -85.828742),
  ('nicaragua-rivas-san-jorge', 'San Jorge', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.456025, -85.800725),
  ('nicaragua-rivas-san-juan-del-sur', 'San Juan del Sur', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.254197, -85.872281),
  ('nicaragua-rivas-tola', 'Tola', 'nicaragua-rivas-department', 'Municipio del departamento de Rivas', 11.439025, -85.938603),
  ('nicaragua-costa-caribe-sur-bluefields', 'Bluefields', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.013125, -83.764911),
  ('nicaragua-costa-caribe-sur-corn-island', 'Corn Island', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.17465, -83.060375),
  ('nicaragua-costa-caribe-sur-desembocadura-de-rio-grande', 'Desembocadura de Río Grande', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.931203, -83.576767),
  ('nicaragua-costa-caribe-sur-el-ayote', 'El Ayote', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.497142, -84.819006),
  ('nicaragua-costa-caribe-sur-el-rama', 'El Rama', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.158964, -84.219703),
  ('nicaragua-costa-caribe-sur-el-tortuguero', 'El Tortuguero', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.820067, -84.200025),
  ('nicaragua-costa-caribe-sur-kukra-hill', 'Kukra Hill', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.242489, -83.748381),
  ('nicaragua-costa-caribe-sur-la-cruz-de-rio-grande', 'La Cruz de Río Grande', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 13.111028, -84.187639),
  ('nicaragua-costa-caribe-sur-laguna-de-perlas', 'Laguna de Perlas', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.34189, -83.67162),
  ('nicaragua-costa-caribe-sur-muelle-de-los-bueyes', 'Muelle de los Bueyes', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.066231, -84.542831),
  ('nicaragua-costa-caribe-sur-nueva-guinea', 'Nueva Guinea', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 11.687117, -84.456361),
  ('nicaragua-costa-caribe-sur-paiwas', 'Paiwas', 'nicaragua-south-caribbean-coast', 'Municipio de la Región Autónoma de la Costa Caribe Sur', 12.787633, -85.123275);

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
      and p.path = 'earth.north-america.nicaragua.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0091_MISSING_DEPARTMENT: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0091_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 153;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.north-america.nicaragua.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0091_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
