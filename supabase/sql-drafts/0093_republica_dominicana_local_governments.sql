-- =============================================================================
-- Agorbis · 0093 · Municipios de República Dominicana como nivel 4 (D145)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-cod-ab-level4-draft.mjs republica-dominicana; no se edita a mano.
--
-- Fuente: República Dominicana - Subnational Administrative Boundaries
-- (COD-AB) de HDX, con datos de la Oficina Nacional de Estadística, licencia
-- CC BY-IGO, vigente desde 2021. Falta La Victoria (Santo Domingo), creada
-- en 2026: queda pendiente antes de promover.
-- Descargado el 2026-11-21. 154 unidades, con un punto cada una.
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
  ('republica-dominicana-azua-azua', 'Azua', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.458832, -70.754153),
  ('republica-dominicana-azua-estebania', 'Estebanía', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.548982, -70.658469),
  ('republica-dominicana-azua-guayabal', 'Guayabal', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.721722, -70.767674),
  ('republica-dominicana-azua-las-charcas', 'Las Charcas', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.385138, -70.525992),
  ('republica-dominicana-azua-las-yayas-de-viajama', 'Las Yayas de Viajama', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.593841, -71.034285),
  ('republica-dominicana-azua-padre-las-casas', 'Padre Las Casas', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.832789, -70.89537),
  ('republica-dominicana-azua-peralta', 'Peralta', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.590973, -70.768742),
  ('republica-dominicana-azua-pueblo-viejo', 'Pueblo Viejo', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.401173, -70.768987),
  ('republica-dominicana-azua-sabana-yegua', 'Sabana Yegua', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.419427, -70.879854),
  ('republica-dominicana-azua-tabara-arriba', 'Tábara Arriba', 'republica-dominicana-azua-province', 'Municipio de la provincia de Azua', 18.483616, -70.90691),
  ('republica-dominicana-baoruco-galvan', 'Galván', 'republica-dominicana-baoruco-province', 'Municipio de la provincia de Baoruco', 18.490485, -71.289967),
  ('republica-dominicana-baoruco-los-rios', 'Los Ríos', 'republica-dominicana-baoruco-province', 'Municipio de la provincia de Baoruco', 18.564782, -71.58243),
  ('republica-dominicana-baoruco-neiba', 'Neiba', 'republica-dominicana-baoruco-province', 'Municipio de la provincia de Baoruco', 18.418759, -71.261903),
  ('republica-dominicana-baoruco-tamayo', 'Tamayo', 'republica-dominicana-baoruco-province', 'Municipio de la provincia de Baoruco', 18.477074, -71.160891),
  ('republica-dominicana-baoruco-villa-jaragua', 'Villa Jaragua', 'republica-dominicana-baoruco-province', 'Municipio de la provincia de Baoruco', 18.544485, -71.49251),
  ('republica-dominicana-barahona-barahona', 'Barahona', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.186911, -71.139118),
  ('republica-dominicana-barahona-cabral', 'Cabral', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.195308, -71.247625),
  ('republica-dominicana-barahona-el-penon', 'El Peñón', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.293529, -71.21403),
  ('republica-dominicana-barahona-enriquillo', 'Enriquillo', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 17.978529, -71.338763),
  ('republica-dominicana-barahona-fundacion', 'Fundación', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.261879, -71.163407),
  ('republica-dominicana-barahona-jaquimeyes', 'Jaquimeyes', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.304021, -71.123008),
  ('republica-dominicana-barahona-la-cienaga', 'La Ciénaga', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.095488, -71.141555),
  ('republica-dominicana-barahona-las-salinas', 'Las Salinas', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.236965, -71.336773),
  ('republica-dominicana-barahona-paraiso', 'Paraíso', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.035091, -71.210168),
  ('republica-dominicana-barahona-polo', 'Polo', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.120867, -71.322844),
  ('republica-dominicana-barahona-vicente-noble', 'Vicente Noble', 'republica-dominicana-barahona-province', 'Municipio de la provincia de Barahona', 18.410201, -71.087829),
  ('republica-dominicana-dajabon-dajabon', 'Dajabón', 'republica-dominicana-dajabon', 'Municipio de la provincia de Dajabón', 19.570911, -71.622316),
  ('republica-dominicana-dajabon-el-pino', 'El Pino', 'republica-dominicana-dajabon', 'Municipio de la provincia de Dajabón', 19.406005, -71.489132),
  ('republica-dominicana-dajabon-loma-de-cabrera', 'Loma de Cabrera', 'republica-dominicana-dajabon', 'Municipio de la provincia de Dajabón', 19.432533, -71.618047),
  ('republica-dominicana-dajabon-partido', 'Partido', 'republica-dominicana-dajabon', 'Municipio de la provincia de Dajabón', 19.505696, -71.513428),
  ('republica-dominicana-dajabon-restauracion', 'Restauración', 'republica-dominicana-dajabon', 'Municipio de la provincia de Dajabón', 19.304445, -71.633208),
  ('republica-dominicana-duarte-arenoso', 'Arenoso', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.18884, -69.769781),
  ('republica-dominicana-duarte-castillo', 'Castillo', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.240273, -70.028268),
  ('republica-dominicana-duarte-eugenio-maria-de-hostos', 'Eugenio María de Hostos', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.140648, -70.02127),
  ('republica-dominicana-duarte-las-guaranas', 'Las Guáranas', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.200433, -70.231766),
  ('republica-dominicana-duarte-pimentel', 'Pimentel', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.216137, -70.146583),
  ('republica-dominicana-duarte-san-francisco-de-macoris', 'San Francisco de Macorís', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.339026, -70.206434),
  ('republica-dominicana-duarte-villa-riva', 'Villa Riva', 'republica-dominicana-duarte-province', 'Municipio de la provincia de Duarte', 19.152185, -69.903414),
  ('republica-dominicana-el-seibo-el-seibo', 'El Seibo', 'republica-dominicana-el-seibo', 'Municipio de la provincia de El Seibo', 18.741363, -69.03107),
  ('republica-dominicana-el-seibo-miches', 'Miches', 'republica-dominicana-el-seibo', 'Municipio de la provincia de El Seibo', 18.962138, -68.981359),
  ('republica-dominicana-elias-pina-banica', 'Bánica', 'republica-dominicana-elias-pina', 'Municipio de la provincia de Elías Piña', 19.018176, -71.644811),
  ('republica-dominicana-elias-pina-comendador', 'Comendador', 'republica-dominicana-elias-pina', 'Municipio de la provincia de Elías Piña', 18.918529, -71.695867),
  ('republica-dominicana-elias-pina-el-llano', 'El Llano', 'republica-dominicana-elias-pina', 'Municipio de la provincia de Elías Piña', 18.816342, -71.672348),
  ('republica-dominicana-elias-pina-hondo-valle', 'Hondo Valle', 'republica-dominicana-elias-pina', 'Municipio de la provincia de Elías Piña', 18.711023, -71.697789),
  ('republica-dominicana-elias-pina-juan-santiago', 'Juan Santiago', 'republica-dominicana-elias-pina', 'Municipio de la provincia de Elías Piña', 18.728551, -71.602059),
  ('republica-dominicana-elias-pina-pedro-santana', 'Pedro Santana', 'republica-dominicana-elias-pina', 'Municipio de la provincia de Elías Piña', 19.173389, -71.478598),
  ('republica-dominicana-espaillat-cayetano-germosen', 'Cayetano Germosén', 'republica-dominicana-espaillat-province', 'Municipio de la provincia de Espaillat', 19.34424, -70.471745),
  ('republica-dominicana-espaillat-gaspar-hernandez', 'Gaspar Hernández', 'republica-dominicana-espaillat-province', 'Municipio de la provincia de Espaillat', 19.614313, -70.240823),
  ('republica-dominicana-espaillat-jamao-al-norte', 'Jamao al Norte', 'republica-dominicana-espaillat-province', 'Municipio de la provincia de Espaillat', 19.596863, -70.46687),
  ('republica-dominicana-espaillat-moca', 'Moca', 'republica-dominicana-espaillat-province', 'Municipio de la provincia de Espaillat', 19.477963, -70.505407),
  ('republica-dominicana-hato-mayor-el-valle', 'El Valle', 'republica-dominicana-hato-mayor-province', 'Municipio de la provincia de Hato Mayor', 18.944157, -69.385109),
  ('republica-dominicana-hato-mayor-hato-mayor', 'Hato Mayor', 'republica-dominicana-hato-mayor-province', 'Municipio de la provincia de Hato Mayor', 18.708952, -69.325652),
  ('republica-dominicana-hato-mayor-sabana-de-la-mar', 'Sabana de la Mar', 'republica-dominicana-hato-mayor-province', 'Municipio de la provincia de Hato Mayor', 19.007545, -69.412468),
  ('republica-dominicana-hermanas-mirabal-salcedo', 'Salcedo', 'republica-dominicana-hermanas-mirabal', 'Municipio de la provincia de Hermanas Mirabal', 19.446746, -70.389067),
  ('republica-dominicana-hermanas-mirabal-tenares', 'Tenares', 'republica-dominicana-hermanas-mirabal', 'Municipio de la provincia de Hermanas Mirabal', 19.448112, -70.3068),
  ('republica-dominicana-hermanas-mirabal-villa-tapia', 'Villa Tapia', 'republica-dominicana-hermanas-mirabal', 'Municipio de la provincia de Hermanas Mirabal', 19.291366, -70.389813),
  ('republica-dominicana-independencia-cristobal', 'Cristóbal', 'republica-dominicana-independencia', 'Municipio de la provincia de Independencia', 18.342179, -71.299168),
  ('republica-dominicana-independencia-duverge', 'Duvergé', 'republica-dominicana-independencia', 'Municipio de la provincia de Independencia', 18.319549, -71.620897),
  ('republica-dominicana-independencia-jimani', 'Jimaní', 'republica-dominicana-independencia', 'Municipio de la provincia de Independencia', 18.5012, -71.843814),
  ('republica-dominicana-independencia-la-descubierta', 'La Descubierta', 'republica-dominicana-independencia', 'Municipio de la provincia de Independencia', 18.598272, -71.755649),
  ('republica-dominicana-independencia-mella', 'Mella', 'republica-dominicana-independencia', 'Municipio de la provincia de Independencia', 18.298846, -71.444126),
  ('republica-dominicana-independencia-postrer-rio', 'Postrer Río', 'republica-dominicana-independencia', 'Municipio de la provincia de Independencia', 18.598803, -71.645319),
  ('republica-dominicana-la-altagracia-higuey', 'Higüey', 'republica-dominicana-la-altagracia-province', 'Municipio de la provincia de La Altagracia', 18.707688, -68.686579),
  ('republica-dominicana-la-altagracia-san-rafael-del-yuma', 'San Rafael del Yuma', 'republica-dominicana-la-altagracia-province', 'Municipio de la provincia de La Altagracia', 18.372987, -68.726799),
  ('republica-dominicana-la-romana-guaymate', 'Guaymate', 'republica-dominicana-la-romana', 'Municipio de la provincia de La Romana', 18.566849, -68.951152),
  ('republica-dominicana-la-romana-la-romana', 'La Romana', 'republica-dominicana-la-romana', 'Municipio de la provincia de La Romana', 18.154545, -68.67692),
  ('republica-dominicana-la-romana-villa-hermosa', 'Villa Hermosa', 'republica-dominicana-la-romana', 'Municipio de la provincia de La Romana', 18.451153, -69.050667),
  ('republica-dominicana-la-vega-constanza', 'Constanza', 'republica-dominicana-la-vega', 'Municipio de la provincia de La Vega', 18.865083, -70.691283),
  ('republica-dominicana-la-vega-jarabacoa', 'Jarabacoa', 'republica-dominicana-la-vega', 'Municipio de la provincia de La Vega', 19.105926, -70.702334),
  ('republica-dominicana-la-vega-jima-abajo', 'Jima Abajo', 'republica-dominicana-la-vega', 'Municipio de la provincia de La Vega', 19.118398, -70.373661),
  ('republica-dominicana-la-vega-la-vega', 'La Vega', 'republica-dominicana-la-vega', 'Municipio de la provincia de La Vega', 19.20834, -70.45845),
  ('republica-dominicana-maria-trinidad-sanchez-cabrera', 'Cabrera', 'republica-dominicana-maria-trinidad-sanchez', 'Municipio de la provincia de María Trinidad Sánchez', 19.580371, -69.980218),
  ('republica-dominicana-maria-trinidad-sanchez-el-factor', 'El Factor', 'republica-dominicana-maria-trinidad-sanchez', 'Municipio de la provincia de María Trinidad Sánchez', 19.294394, -69.930923),
  ('republica-dominicana-maria-trinidad-sanchez-nagua', 'Nagua', 'republica-dominicana-maria-trinidad-sanchez', 'Municipio de la provincia de María Trinidad Sánchez', 19.350179, -70.003435),
  ('republica-dominicana-maria-trinidad-sanchez-rio-san-juan', 'Río San Juan', 'republica-dominicana-maria-trinidad-sanchez', 'Municipio de la provincia de María Trinidad Sánchez', 19.566875, -70.088775),
  ('republica-dominicana-monsenor-nouel-bonao', 'Bonao', 'republica-dominicana-monsenor-nouel', 'Municipio de la provincia de Monseñor Nouel', 18.942645, -70.44142),
  ('republica-dominicana-monsenor-nouel-maimon', 'Maimón', 'republica-dominicana-monsenor-nouel', 'Municipio de la provincia de Monseñor Nouel', 18.888011, -70.269662),
  ('republica-dominicana-monsenor-nouel-piedra-blanca', 'Piedra Blanca', 'republica-dominicana-monsenor-nouel', 'Municipio de la provincia de Monseñor Nouel', 18.811959, -70.330885),
  ('republica-dominicana-monte-cristi-castanuelas', 'Castañuelas', 'republica-dominicana-monte-cristi-province', 'Municipio de la provincia de Monte Cristi', 19.737329, -71.508884),
  ('republica-dominicana-monte-cristi-guayubin', 'Guayubín', 'republica-dominicana-monte-cristi-province', 'Municipio de la provincia de Monte Cristi', 19.687705, -71.308925),
  ('republica-dominicana-monte-cristi-las-matas-de-santa-cruz', 'Las Matas de Santa Cruz', 'republica-dominicana-monte-cristi-province', 'Municipio de la provincia de Monte Cristi', 19.625897, -71.5011),
  ('republica-dominicana-monte-cristi-monte-cristi', 'Monte Cristi', 'republica-dominicana-monte-cristi-province', 'Municipio de la provincia de Monte Cristi', 19.759912, -71.651894),
  ('republica-dominicana-monte-cristi-pepillo-salcedo', 'Pepillo Salcedo', 'republica-dominicana-monte-cristi-province', 'Municipio de la provincia de Monte Cristi', 19.661291, -71.655041),
  ('republica-dominicana-monte-cristi-villa-vasquez', 'Villa Vásquez', 'republica-dominicana-monte-cristi-province', 'Municipio de la provincia de Monte Cristi', 19.808855, -71.442957),
  ('republica-dominicana-monte-plata-bayaguana', 'Bayaguana', 'republica-dominicana-monte-plata-province', 'Municipio de la provincia de Monte Plata', 18.814982, -69.591709),
  ('republica-dominicana-monte-plata-monte-plata', 'Monte Plata', 'republica-dominicana-monte-plata-province', 'Municipio de la provincia de Monte Plata', 18.759748, -69.838978),
  ('republica-dominicana-monte-plata-peralvillo', 'Peralvillo', 'republica-dominicana-monte-plata-province', 'Municipio de la provincia de Monte Plata', 18.85676, -70.066425),
  ('republica-dominicana-monte-plata-sabana-grande-de-boya', 'Sabana Grande de Boyá', 'republica-dominicana-monte-plata-province', 'Municipio de la provincia de Monte Plata', 18.975698, -69.774502),
  ('republica-dominicana-monte-plata-yamasa', 'Yamasá', 'republica-dominicana-monte-plata-province', 'Municipio de la provincia de Monte Plata', 18.767568, -70.085244),
  ('republica-dominicana-pedernales-oviedo', 'Oviedo', 'republica-dominicana-pedernales-province', 'Municipio de la provincia de Pedernales', 17.827129, -71.459912),
  ('republica-dominicana-pedernales-pedernales', 'Pedernales', 'republica-dominicana-pedernales-province', 'Municipio de la provincia de Pedernales', 18.064368, -71.566707),
  ('republica-dominicana-peravia-bani', 'Baní', 'republica-dominicana-peravia', 'Municipio de la provincia de Peravia', 18.351092, -70.369539),
  ('republica-dominicana-peravia-nizao', 'Nizao', 'republica-dominicana-peravia', 'Municipio de la provincia de Peravia', 18.269086, -70.210338),
  ('republica-dominicana-puerto-plata-altamira', 'Altamira', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.651034, -70.793037),
  ('republica-dominicana-puerto-plata-guananico', 'Guananico', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.697165, -70.922817),
  ('republica-dominicana-puerto-plata-imbert', 'Imbert', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.765455, -70.871738),
  ('republica-dominicana-puerto-plata-los-hidalgos', 'Los Hidalgos', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.746201, -71.014978),
  ('republica-dominicana-puerto-plata-luperon', 'Luperón', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.843106, -70.955254),
  ('republica-dominicana-puerto-plata-puerto-plata', 'Puerto Plata', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.71025, -70.691672),
  ('republica-dominicana-puerto-plata-sosua', 'Sosúa', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.666497, -70.491213),
  ('republica-dominicana-puerto-plata-villa-isabela', 'Villa Isabela', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.808753, -71.135595),
  ('republica-dominicana-puerto-plata-villa-montellano', 'Villa Montellano', 'republica-dominicana-puerto-plata', 'Municipio de la provincia de Puerto Plata', 19.705311, -70.576707),
  ('republica-dominicana-samana-las-terrenas', 'Las Terrenas', 'republica-dominicana-samana', 'Municipio de la provincia de Samaná', 19.283824, -69.566215),
  ('republica-dominicana-samana-samana', 'Samaná', 'republica-dominicana-samana', 'Municipio de la provincia de Samaná', 19.271809, -69.320302),
  ('republica-dominicana-samana-sanchez', 'Sánchez', 'republica-dominicana-samana', 'Municipio de la provincia de Samaná', 19.142564, -69.677689),
  ('republica-dominicana-san-cristobal-bajos-de-haina', 'Bajos de Haina', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.432173, -70.031006),
  ('republica-dominicana-san-cristobal-cambita-garabitos', 'Cambita Garabitos', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.470939, -70.223174),
  ('republica-dominicana-san-cristobal-los-cacaos', 'Los Cacaos', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.610054, -70.326363),
  ('republica-dominicana-san-cristobal-sabana-grande-de-palenque', 'Sabana Grande de Palenque', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.258232, -70.162298),
  ('republica-dominicana-san-cristobal-san-cristobal', 'San Cristóbal', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.414986, -70.109839),
  ('republica-dominicana-san-cristobal-san-gregorio-de-nigua', 'San Gregorio de Nigua', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.352551, -70.085733),
  ('republica-dominicana-san-cristobal-villa-altagracia', 'Villa Altagracia', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.656248, -70.225612),
  ('republica-dominicana-san-cristobal-yaguate', 'Yaguate', 'republica-dominicana-san-cristobal', 'Municipio de la provincia de San Cristóbal', 18.339987, -70.187587),
  ('republica-dominicana-san-jose-de-ocoa-rancho-arriba', 'Rancho Arriba', 'republica-dominicana-san-jose-de-ocoa', 'Municipio de la provincia de San José de Ocoa', 18.713847, -70.438487),
  ('republica-dominicana-san-jose-de-ocoa-sabana-larga', 'Sabana Larga', 'republica-dominicana-san-jose-de-ocoa', 'Municipio de la provincia de San José de Ocoa', 18.645384, -70.558634),
  ('republica-dominicana-san-jose-de-ocoa-san-jose-de-ocoa', 'San José de Ocoa', 'republica-dominicana-san-jose-de-ocoa', 'Municipio de la provincia de San José de Ocoa', 18.55734, -70.439445),
  ('republica-dominicana-san-juan-bohechio', 'Bohechío', 'republica-dominicana-san-juan-province', 'Municipio de la provincia de San Juan', 18.909273, -71.020838),
  ('republica-dominicana-san-juan-el-cercado', 'El Cercado', 'republica-dominicana-san-juan-province', 'Municipio de la provincia de San Juan', 18.709512, -71.512257),
  ('republica-dominicana-san-juan-juan-de-herrera', 'Juan de Herrera', 'republica-dominicana-san-juan-province', 'Municipio de la provincia de San Juan', 18.875516, -71.201481),
  ('republica-dominicana-san-juan-las-matas-de-farfan', 'Las Matas de Farfán', 'republica-dominicana-san-juan-province', 'Municipio de la provincia de San Juan', 18.954421, -71.493459),
  ('republica-dominicana-san-juan-san-juan', 'San Juan', 'republica-dominicana-san-juan-province', 'Municipio de la provincia de San Juan', 18.897241, -71.325847),
  ('republica-dominicana-san-juan-vallejuelo', 'Vallejuelo', 'republica-dominicana-san-juan-province', 'Municipio de la provincia de San Juan', 18.667181, -71.324498),
  ('republica-dominicana-san-pedro-de-macoris-consuelo', 'Consuelo', 'republica-dominicana-san-pedro-de-macoris', 'Municipio de la provincia de San Pedro de Macorís', 18.594251, -69.253228),
  ('republica-dominicana-san-pedro-de-macoris-guayacanes', 'Guayacanes', 'republica-dominicana-san-pedro-de-macoris', 'Municipio de la provincia de San Pedro de Macorís', 18.447237, -69.433058),
  ('republica-dominicana-san-pedro-de-macoris-los-llanos', 'Los Llanos', 'republica-dominicana-san-pedro-de-macoris', 'Municipio de la provincia de San Pedro de Macorís', 18.648333, -69.495682),
  ('republica-dominicana-san-pedro-de-macoris-quisqueya', 'Quisqueya', 'republica-dominicana-san-pedro-de-macoris', 'Municipio de la provincia de San Pedro de Macorís', 18.545857, -69.423428),
  ('republica-dominicana-san-pedro-de-macoris-ramon-santana', 'Ramón Santana', 'republica-dominicana-san-pedro-de-macoris', 'Municipio de la provincia de San Pedro de Macorís', 18.504361, -69.15639),
  ('republica-dominicana-san-pedro-de-macoris-san-pedro-de-macoris', 'San Pedro de Macorís', 'republica-dominicana-san-pedro-de-macoris', 'Municipio de la provincia de San Pedro de Macorís', 18.482306, -69.259647),
  ('republica-dominicana-sanchez-ramirez-cevicos', 'Cevicos', 'republica-dominicana-sanchez-ramirez', 'Municipio de la provincia de Sánchez Ramírez', 19.006991, -69.975515),
  ('republica-dominicana-sanchez-ramirez-cotui', 'Cotuí', 'republica-dominicana-sanchez-ramirez', 'Municipio de la provincia de Sánchez Ramírez', 18.997963, -70.130965),
  ('republica-dominicana-sanchez-ramirez-fantino', 'Fantino', 'republica-dominicana-sanchez-ramirez', 'Municipio de la provincia de Sánchez Ramírez', 19.102811, -70.303111),
  ('republica-dominicana-sanchez-ramirez-la-mata', 'La Mata', 'republica-dominicana-sanchez-ramirez', 'Municipio de la provincia de Sánchez Ramírez', 19.069211, -70.23356),
  ('republica-dominicana-santiago-bisono', 'Bisonó', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.582614, -70.85808),
  ('republica-dominicana-santiago-janico', 'Jánico', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.249017, -70.763904),
  ('republica-dominicana-santiago-licey-al-medio', 'Licey al Medio', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.428237, -70.618766),
  ('republica-dominicana-santiago-punal', 'Puñal', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.397757, -70.63718),
  ('republica-dominicana-santiago-sabana-iglesia', 'Sabana Iglesia', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.342333, -70.745181),
  ('republica-dominicana-santiago-san-jose-de-las-matas', 'San José de las Matas', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.246687, -71.050469),
  ('republica-dominicana-santiago-santiago', 'Santiago', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.516735, -70.69719),
  ('republica-dominicana-santiago-tamboril', 'Tamboril', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.488186, -70.608227),
  ('republica-dominicana-santiago-villa-gonzalez', 'Villa González', 'republica-dominicana-santiago-province', 'Municipio de la provincia de Santiago', 19.564441, -70.780089),
  ('republica-dominicana-santiago-rodriguez-moncion', 'Monción', 'republica-dominicana-santiago-rodriguez', 'Municipio de la provincia de Santiago Rodríguez', 19.39096, -71.185492),
  ('republica-dominicana-santiago-rodriguez-san-ignacio-de-sabaneta', 'San Ignacio de Sabaneta', 'republica-dominicana-santiago-rodriguez', 'Municipio de la provincia de Santiago Rodríguez', 19.369014, -71.326907),
  ('republica-dominicana-santiago-rodriguez-villa-los-almacigos', 'Villa Los Almácigos', 'republica-dominicana-santiago-rodriguez', 'Municipio de la provincia de Santiago Rodríguez', 19.335767, -71.439067),
  ('republica-dominicana-santo-domingo-boca-chica', 'Boca Chica', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.456596, -69.614846),
  ('republica-dominicana-santo-domingo-los-alcarrizos', 'Los Alcarrizos', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.53125, -70.039161),
  ('republica-dominicana-santo-domingo-pedro-brand', 'Pedro Brand', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.626723, -70.09186),
  ('republica-dominicana-santo-domingo-san-antonio-de-guerra', 'San Antonio de Guerra', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.580804, -69.654139),
  ('republica-dominicana-santo-domingo-santo-domingo-este', 'Santo Domingo Este', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.526382, -69.801529),
  ('republica-dominicana-santo-domingo-santo-domingo-norte', 'Santo Domingo Norte', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.612189, -69.91151),
  ('republica-dominicana-santo-domingo-santo-domingo-oeste', 'Santo Domingo Oeste', 'republica-dominicana-santo-domingo-province', 'Municipio de la provincia de Santo Domingo', 18.462815, -69.991941),
  ('republica-dominicana-valverde-esperanza', 'Esperanza', 'republica-dominicana-valverde-province', 'Municipio de la provincia de Valverde', 19.627814, -70.959625),
  ('republica-dominicana-valverde-laguna-salada', 'Laguna Salada', 'republica-dominicana-valverde-province', 'Municipio de la provincia de Valverde', 19.669333, -71.101198),
  ('republica-dominicana-valverde-mao', 'Mao', 'republica-dominicana-valverde-province', 'Municipio de la provincia de Valverde', 19.533653, -71.041648);

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
      and p.path = 'earth.north-america.republica-dominicana.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0093_MISSING_PROVINCE: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0093_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 154;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.north-america.republica-dominicana.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0093_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
