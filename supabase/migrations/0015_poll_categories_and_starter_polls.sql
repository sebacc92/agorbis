-- =============================================================================
-- Agorbis · 0015 · Categorías y encuestas iniciales
-- -----------------------------------------------------------------------------
-- Las categorías hacen descubrible el contenido sin mezclar una consulta de
-- fútbol con una decisión de transporte. `max_choices` pasa de ser texto
-- informativo a una regla que también se aplica en la base de datos.
-- =============================================================================

begin;

-- PRODUCTION_GEOGRAPHY_BEGIN
-- La geografía base vivía históricamente en seed.sql, que no se ejecuta en
-- producción porque también crea usuarios demo. Se replica acá antes de las
-- encuestas editoriales. Después se reintenta el backfill de 0014: en bases
-- donde 0014 corrió sin padres no insertó filas, y todos sus INSERT son
-- idempotentes gracias a ON CONFLICT DO NOTHING.

-- Nivel 0 · la Tierra
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji::text, i.description::text,
       i.lat::double precision, i.lng::double precision
from (values
  ('earth', 'Tierra', 0, NULL, 'earth', '🌍', 'La comunidad de toda la humanidad. Acá caben las conversaciones que nos incluyen a todos.', 0, 0)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
left join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;

-- Nivel 1 · 6 continentes
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji::text, i.description::text,
       i.lat::double precision, i.lng::double precision
from (values
  ('africa', 'África', 1, 'earth', 'earth.africa', '🌍', NULL, 1.65, 17.35),
  ('north-america', 'América del Norte', 1, 'earth', 'earth.north-america', '🌎', NULL, 46.07, -100.55),
  ('south-america', 'América del Sur', 1, 'earth', 'earth.south-america', '🌎', NULL, -14.6, -58.45),
  ('asia', 'Asia', 1, 'earth', 'earth.asia', '🌏', NULL, 34.05, 100.62),
  ('europe', 'Europa', 1, 'earth', 'earth.europe', '🌍', NULL, 54.53, 15.26),
  ('oceania', 'Oceanía', 1, 'earth', 'earth.oceania', '🌏', NULL, -22.73, 140.02)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
left join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;

-- Nivel 2 · 195 países
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji::text, i.description::text,
       i.lat::double precision, i.lng::double precision
from (values
  ('argelia', 'Argelia', 2, 'africa', 'earth.africa.argelia', '🇩🇿', NULL, 28.0339, 1.6596),
  ('angola', 'Angola', 2, 'africa', 'earth.africa.angola', '🇦🇴', NULL, -11.2027, 17.8739),
  ('benin', 'Benín', 2, 'africa', 'earth.africa.benin', '🇧🇯', NULL, 9.3077, 2.3158),
  ('botsuana', 'Botsuana', 2, 'africa', 'earth.africa.botsuana', '🇧🇼', NULL, -22.3285, 24.6849),
  ('burkina-faso', 'Burkina Faso', 2, 'africa', 'earth.africa.burkina-faso', '🇧🇫', NULL, 12.2383, -1.5616),
  ('burundi', 'Burundi', 2, 'africa', 'earth.africa.burundi', '🇧🇮', NULL, -3.3731, 29.9189),
  ('cabo-verde', 'Cabo Verde', 2, 'africa', 'earth.africa.cabo-verde', '🇨🇻', NULL, 16.0021, -24.0132),
  ('camerun', 'Camerún', 2, 'africa', 'earth.africa.camerun', '🇨🇲', NULL, 7.3697, 12.3547),
  ('chad', 'Chad', 2, 'africa', 'earth.africa.chad', '🇹🇩', NULL, 15.4542, 18.7322),
  ('comoras', 'Comoras', 2, 'africa', 'earth.africa.comoras', '🇰🇲', NULL, -11.875, 43.8722),
  ('congo', 'Congo', 2, 'africa', 'earth.africa.congo', '🇨🇬', NULL, -0.228, 15.8277),
  ('republica-democratica-del-congo', 'República Democrática del Congo', 2, 'africa', 'earth.africa.republica-democratica-del-congo', '🇨🇩', NULL, -4.0383, 21.7587),
  ('costa-de-marfil', 'Costa de Marfil', 2, 'africa', 'earth.africa.costa-de-marfil', '🇨🇮', NULL, 7.54, -5.5471),
  ('yibuti', 'Yibuti', 2, 'africa', 'earth.africa.yibuti', '🇩🇯', NULL, 11.8251, 42.5903),
  ('egipto', 'Egipto', 2, 'africa', 'earth.africa.egipto', '🇪🇬', NULL, 26.8206, 30.8025),
  ('guinea-ecuatorial', 'Guinea Ecuatorial', 2, 'africa', 'earth.africa.guinea-ecuatorial', '🇬🇶', NULL, 1.6508, 10.2679),
  ('eritrea', 'Eritrea', 2, 'africa', 'earth.africa.eritrea', '🇪🇷', NULL, 15.1794, 39.7823),
  ('esuatini', 'Esuatini', 2, 'africa', 'earth.africa.esuatini', '🇸🇿', NULL, -26.5225, 31.4659),
  ('etiopia', 'Etiopía', 2, 'africa', 'earth.africa.etiopia', '🇪🇹', NULL, 9.145, 40.4897),
  ('gabon', 'Gabón', 2, 'africa', 'earth.africa.gabon', '🇬🇦', NULL, -0.8037, 11.6094),
  ('gambia', 'Gambia', 2, 'africa', 'earth.africa.gambia', '🇬🇲', NULL, 13.4432, -15.3101),
  ('ghana', 'Ghana', 2, 'africa', 'earth.africa.ghana', '🇬🇭', NULL, 7.9465, -1.0232),
  ('guinea', 'Guinea', 2, 'africa', 'earth.africa.guinea', '🇬🇳', NULL, 9.9456, -9.6966),
  ('guinea-bisau', 'Guinea-Bisáu', 2, 'africa', 'earth.africa.guinea-bisau', '🇬🇼', NULL, 11.8037, -15.1804),
  ('kenia', 'Kenia', 2, 'africa', 'earth.africa.kenia', '🇰🇪', NULL, -0.0236, 37.9062),
  ('lesoto', 'Lesoto', 2, 'africa', 'earth.africa.lesoto', '🇱🇸', NULL, -29.61, 28.2336),
  ('liberia', 'Liberia', 2, 'africa', 'earth.africa.liberia', '🇱🇷', NULL, 6.4281, -9.4295),
  ('libia', 'Libia', 2, 'africa', 'earth.africa.libia', '🇱🇾', NULL, 26.3351, 17.2283),
  ('madagascar', 'Madagascar', 2, 'africa', 'earth.africa.madagascar', '🇲🇬', NULL, -18.7669, 46.8691),
  ('malaui', 'Malaui', 2, 'africa', 'earth.africa.malaui', '🇲🇼', NULL, -13.2543, 34.3015),
  ('mali', 'Malí', 2, 'africa', 'earth.africa.mali', '🇲🇱', NULL, 17.5707, -3.9962),
  ('marruecos', 'Marruecos', 2, 'africa', 'earth.africa.marruecos', '🇲🇦', NULL, 31.7917, -7.0926),
  ('mauritania', 'Mauritania', 2, 'africa', 'earth.africa.mauritania', '🇲🇷', NULL, 21.0079, -10.9408),
  ('mauricio', 'Mauricio', 2, 'africa', 'earth.africa.mauricio', '🇲🇺', NULL, -20.3484, 57.5522),
  ('mozambique', 'Mozambique', 2, 'africa', 'earth.africa.mozambique', '🇲🇿', NULL, -18.6657, 35.5296),
  ('namibia', 'Namibia', 2, 'africa', 'earth.africa.namibia', '🇳🇦', NULL, -22.9576, 18.4904),
  ('niger', 'Níger', 2, 'africa', 'earth.africa.niger', '🇳🇪', NULL, 17.6078, 8.0817),
  ('nigeria', 'Nigeria', 2, 'africa', 'earth.africa.nigeria', '🇳🇬', NULL, 9.082, 8.6753),
  ('republica-centroafricana', 'República Centroafricana', 2, 'africa', 'earth.africa.republica-centroafricana', '🇨🇫', NULL, 6.6111, 20.9394),
  ('ruanda', 'Ruanda', 2, 'africa', 'earth.africa.ruanda', '🇷🇼', NULL, -1.9403, 29.8739),
  ('santo-tome-y-principe', 'Santo Tomé y Príncipe', 2, 'africa', 'earth.africa.santo-tome-y-principe', '🇸🇹', NULL, 0.1864, 6.6131),
  ('senegal', 'Senegal', 2, 'africa', 'earth.africa.senegal', '🇸🇳', NULL, 14.4974, -14.4524),
  ('seychelles', 'Seychelles', 2, 'africa', 'earth.africa.seychelles', '🇸🇨', NULL, -4.6796, 55.492),
  ('sierra-leona', 'Sierra Leona', 2, 'africa', 'earth.africa.sierra-leona', '🇸🇱', NULL, 8.4606, -11.7799),
  ('somalia', 'Somalia', 2, 'africa', 'earth.africa.somalia', '🇸🇴', NULL, 5.1521, 46.1996),
  ('sudafrica', 'Sudáfrica', 2, 'africa', 'earth.africa.sudafrica', '🇿🇦', NULL, -30.5595, 22.9375),
  ('sudan', 'Sudán', 2, 'africa', 'earth.africa.sudan', '🇸🇩', NULL, 12.8628, 30.2176),
  ('sudan-del-sur', 'Sudán del Sur', 2, 'africa', 'earth.africa.sudan-del-sur', '🇸🇸', NULL, 7, 30),
  ('tanzania', 'Tanzania', 2, 'africa', 'earth.africa.tanzania', '🇹🇿', NULL, -6.369, 34.8888),
  ('togo', 'Togo', 2, 'africa', 'earth.africa.togo', '🇹🇬', NULL, 8.6195, 0.8248),
  ('tunez', 'Túnez', 2, 'africa', 'earth.africa.tunez', '🇹🇳', NULL, 33.8869, 9.5375),
  ('uganda', 'Uganda', 2, 'africa', 'earth.africa.uganda', '🇺🇬', NULL, 1.3733, 32.2903),
  ('zambia', 'Zambia', 2, 'africa', 'earth.africa.zambia', '🇿🇲', NULL, -13.1339, 27.8493),
  ('zimbabue', 'Zimbabue', 2, 'africa', 'earth.africa.zimbabue', '🇿🇼', NULL, -19.0154, 29.1549),
  ('antigua-y-barbuda', 'Antigua y Barbuda', 2, 'north-america', 'earth.north-america.antigua-y-barbuda', '🇦🇬', NULL, 17.0608, -61.7964),
  ('bahamas', 'Bahamas', 2, 'north-america', 'earth.north-america.bahamas', '🇧🇸', NULL, 25.0343, -77.3963),
  ('barbados', 'Barbados', 2, 'north-america', 'earth.north-america.barbados', '🇧🇧', NULL, 13.1939, -59.5432),
  ('belice', 'Belice', 2, 'north-america', 'earth.north-america.belice', '🇧🇿', NULL, 17.1899, -88.4976),
  ('canada', 'Canadá', 2, 'north-america', 'earth.north-america.canada', '🇨🇦', NULL, 56.1304, -106.3468),
  ('costa-rica', 'Costa Rica', 2, 'north-america', 'earth.north-america.costa-rica', '🇨🇷', NULL, 9.7489, -83.7534),
  ('cuba', 'Cuba', 2, 'north-america', 'earth.north-america.cuba', '🇨🇺', NULL, 21.5218, -77.7812),
  ('dominica', 'Dominica', 2, 'north-america', 'earth.north-america.dominica', '🇩🇲', NULL, 15.415, -61.371),
  ('republica-dominicana', 'República Dominicana', 2, 'north-america', 'earth.north-america.republica-dominicana', '🇩🇴', NULL, 18.7357, -70.1627),
  ('el-salvador', 'El Salvador', 2, 'north-america', 'earth.north-america.el-salvador', '🇸🇻', NULL, 13.7942, -88.8965),
  ('estados-unidos', 'Estados Unidos', 2, 'north-america', 'earth.north-america.estados-unidos', '🇺🇸', NULL, 37.0902, -95.7129),
  ('granada', 'Granada', 2, 'north-america', 'earth.north-america.granada', '🇬🇩', NULL, 12.2628, -61.6042),
  ('guatemala', 'Guatemala', 2, 'north-america', 'earth.north-america.guatemala', '🇬🇹', NULL, 15.7835, -90.2308),
  ('haiti', 'Haití', 2, 'north-america', 'earth.north-america.haiti', '🇭🇹', NULL, 18.9712, -72.2852),
  ('honduras', 'Honduras', 2, 'north-america', 'earth.north-america.honduras', '🇭🇳', NULL, 15.2, -86.2419),
  ('jamaica', 'Jamaica', 2, 'north-america', 'earth.north-america.jamaica', '🇯🇲', NULL, 18.1096, -77.2975),
  ('mexico', 'México', 2, 'north-america', 'earth.north-america.mexico', '🇲🇽', NULL, 23.6345, -102.5528),
  ('nicaragua', 'Nicaragua', 2, 'north-america', 'earth.north-america.nicaragua', '🇳🇮', NULL, 12.8654, -85.2072),
  ('panama', 'Panamá', 2, 'north-america', 'earth.north-america.panama', '🇵🇦', NULL, 8.538, -80.7821),
  ('san-cristobal-y-nieves', 'San Cristóbal y Nieves', 2, 'north-america', 'earth.north-america.san-cristobal-y-nieves', '🇰🇳', NULL, 17.3578, -62.783),
  ('san-vicente-y-las-granadinas', 'San Vicente y las Granadinas', 2, 'north-america', 'earth.north-america.san-vicente-y-las-granadinas', '🇻🇨', NULL, 12.9843, -61.2872),
  ('santa-lucia', 'Santa Lucía', 2, 'north-america', 'earth.north-america.santa-lucia', '🇱🇨', NULL, 13.9094, -60.9789),
  ('trinidad-y-tobago', 'Trinidad y Tobago', 2, 'north-america', 'earth.north-america.trinidad-y-tobago', '🇹🇹', NULL, 10.6918, -61.2225),
  ('argentina', 'Argentina', 2, 'south-america', 'earth.south-america.argentina', '🇦🇷', NULL, -38.4161, -63.6167),
  ('bolivia', 'Bolivia', 2, 'south-america', 'earth.south-america.bolivia', '🇧🇴', NULL, -16.2902, -63.5887),
  ('brasil', 'Brasil', 2, 'south-america', 'earth.south-america.brasil', '🇧🇷', NULL, -14.235, -51.9253),
  ('chile', 'Chile', 2, 'south-america', 'earth.south-america.chile', '🇨🇱', NULL, -35.6751, -71.543),
  ('colombia', 'Colombia', 2, 'south-america', 'earth.south-america.colombia', '🇨🇴', NULL, 4.5709, -74.2973),
  ('ecuador', 'Ecuador', 2, 'south-america', 'earth.south-america.ecuador', '🇪🇨', NULL, -1.8312, -78.1834),
  ('guyana', 'Guyana', 2, 'south-america', 'earth.south-america.guyana', '🇬🇾', NULL, 4.8604, -58.9302),
  ('paraguay', 'Paraguay', 2, 'south-america', 'earth.south-america.paraguay', '🇵🇾', NULL, -23.4425, -58.4438),
  ('peru', 'Perú', 2, 'south-america', 'earth.south-america.peru', '🇵🇪', NULL, -9.19, -75.0152),
  ('surinam', 'Surinam', 2, 'south-america', 'earth.south-america.surinam', '🇸🇷', NULL, 3.9193, -56.0278),
  ('uruguay', 'Uruguay', 2, 'south-america', 'earth.south-america.uruguay', '🇺🇾', NULL, -32.5228, -55.7658),
  ('venezuela', 'Venezuela', 2, 'south-america', 'earth.south-america.venezuela', '🇻🇪', NULL, 6.4238, -66.5897),
  ('afganistan', 'Afganistán', 2, 'asia', 'earth.asia.afganistan', '🇦🇫', NULL, 33.9391, 67.71),
  ('arabia-saudita', 'Arabia Saudita', 2, 'asia', 'earth.asia.arabia-saudita', '🇸🇦', NULL, 23.8859, 45.0792),
  ('armenia', 'Armenia', 2, 'asia', 'earth.asia.armenia', '🇦🇲', NULL, 40.0691, 45.0382),
  ('azerbaiyan', 'Azerbaiyán', 2, 'asia', 'earth.asia.azerbaiyan', '🇦🇿', NULL, 40.1431, 47.5769),
  ('banglades', 'Bangladés', 2, 'asia', 'earth.asia.banglades', '🇧🇩', NULL, 23.685, 90.3563),
  ('barein', 'Baréin', 2, 'asia', 'earth.asia.barein', '🇧🇭', NULL, 25.9304, 50.6378),
  ('birmania', 'Birmania', 2, 'asia', 'earth.asia.birmania', '🇲🇲', NULL, 21.914, 95.9562),
  ('brunei', 'Brunéi', 2, 'asia', 'earth.asia.brunei', '🇧🇳', NULL, 4.5353, 114.7277),
  ('butan', 'Bután', 2, 'asia', 'earth.asia.butan', '🇧🇹', NULL, 27.5142, 90.4336),
  ('camboya', 'Camboya', 2, 'asia', 'earth.asia.camboya', '🇰🇭', NULL, 12.5657, 104.991),
  ('catar', 'Catar', 2, 'asia', 'earth.asia.catar', '🇶🇦', NULL, 25.3548, 51.1839),
  ('china', 'China', 2, 'asia', 'earth.asia.china', '🇨🇳', NULL, 35.8617, 104.1954),
  ('chipre', 'Chipre', 2, 'asia', 'earth.asia.chipre', '🇨🇾', NULL, 35.1264, 33.4299),
  ('corea-del-norte', 'Corea del Norte', 2, 'asia', 'earth.asia.corea-del-norte', '🇰🇵', NULL, 40.3399, 127.5101),
  ('corea-del-sur', 'Corea del Sur', 2, 'asia', 'earth.asia.corea-del-sur', '🇰🇷', NULL, 35.9078, 127.7669),
  ('emiratos-arabes-unidos', 'Emiratos Árabes Unidos', 2, 'asia', 'earth.asia.emiratos-arabes-unidos', '🇦🇪', NULL, 23.4241, 53.8478),
  ('filipinas', 'Filipinas', 2, 'asia', 'earth.asia.filipinas', '🇵🇭', NULL, 12.8797, 121.774),
  ('georgia', 'Georgia', 2, 'asia', 'earth.asia.georgia', '🇬🇪', NULL, 42.3154, 43.3569),
  ('india', 'India', 2, 'asia', 'earth.asia.india', '🇮🇳', NULL, 20.5937, 78.9629),
  ('indonesia', 'Indonesia', 2, 'asia', 'earth.asia.indonesia', '🇮🇩', NULL, -0.7893, 113.9213),
  ('irak', 'Irak', 2, 'asia', 'earth.asia.irak', '🇮🇶', NULL, 33.2232, 43.6793),
  ('iran', 'Irán', 2, 'asia', 'earth.asia.iran', '🇮🇷', NULL, 32.4279, 53.688),
  ('israel', 'Israel', 2, 'asia', 'earth.asia.israel', '🇮🇱', NULL, 31.0461, 34.8516),
  ('japon', 'Japón', 2, 'asia', 'earth.asia.japon', '🇯🇵', NULL, 36.2048, 138.2529),
  ('jordania', 'Jordania', 2, 'asia', 'earth.asia.jordania', '🇯🇴', NULL, 30.5852, 36.2384),
  ('kazajistan', 'Kazajistán', 2, 'asia', 'earth.asia.kazajistan', '🇰🇿', NULL, 48.0196, 66.9237),
  ('kirguistan', 'Kirguistán', 2, 'asia', 'earth.asia.kirguistan', '🇰🇬', NULL, 41.2044, 74.7661),
  ('kuwait', 'Kuwait', 2, 'asia', 'earth.asia.kuwait', '🇰🇼', NULL, 29.3117, 47.4818),
  ('laos', 'Laos', 2, 'asia', 'earth.asia.laos', '🇱🇦', NULL, 19.8563, 102.4955),
  ('libano', 'Líbano', 2, 'asia', 'earth.asia.libano', '🇱🇧', NULL, 33.8547, 35.8623),
  ('malasia', 'Malasia', 2, 'asia', 'earth.asia.malasia', '🇲🇾', NULL, 4.2105, 101.9758),
  ('maldivas', 'Maldivas', 2, 'asia', 'earth.asia.maldivas', '🇲🇻', NULL, 3.2028, 73.2207),
  ('mongolia', 'Mongolia', 2, 'asia', 'earth.asia.mongolia', '🇲🇳', NULL, 46.8625, 103.8467),
  ('nepal', 'Nepal', 2, 'asia', 'earth.asia.nepal', '🇳🇵', NULL, 28.3949, 84.124),
  ('oman', 'Omán', 2, 'asia', 'earth.asia.oman', '🇴🇲', NULL, 21.5126, 55.9233),
  ('pakistan', 'Pakistán', 2, 'asia', 'earth.asia.pakistan', '🇵🇰', NULL, 30.3753, 69.3451),
  ('palestina', 'Palestina', 2, 'asia', 'earth.asia.palestina', '🇵🇸', NULL, 31.9522, 35.2332),
  ('singapur', 'Singapur', 2, 'asia', 'earth.asia.singapur', '🇸🇬', NULL, 1.3521, 103.8198),
  ('siria', 'Siria', 2, 'asia', 'earth.asia.siria', '🇸🇾', NULL, 34.8021, 38.9968),
  ('sri-lanka', 'Sri Lanka', 2, 'asia', 'earth.asia.sri-lanka', '🇱🇰', NULL, 7.8731, 80.7718),
  ('tailandia', 'Tailandia', 2, 'asia', 'earth.asia.tailandia', '🇹🇭', NULL, 15.87, 100.9925),
  ('tayikistan', 'Tayikistán', 2, 'asia', 'earth.asia.tayikistan', '🇹🇯', NULL, 38.861, 71.2761),
  ('timor-oriental', 'Timor Oriental', 2, 'asia', 'earth.asia.timor-oriental', '🇹🇱', NULL, -8.8742, 125.7275),
  ('turkmenistan', 'Turkmenistán', 2, 'asia', 'earth.asia.turkmenistan', '🇹🇲', NULL, 38.9697, 59.5563),
  ('turquia', 'Turquía', 2, 'asia', 'earth.asia.turquia', '🇹🇷', NULL, 38.9637, 35.2433),
  ('uzbekistan', 'Uzbekistán', 2, 'asia', 'earth.asia.uzbekistan', '🇺🇿', NULL, 41.3775, 64.5853),
  ('vietnam', 'Vietnam', 2, 'asia', 'earth.asia.vietnam', '🇻🇳', NULL, 14.0583, 108.2772),
  ('yemen', 'Yemen', 2, 'asia', 'earth.asia.yemen', '🇾🇪', NULL, 15.5527, 48.5164),
  ('albania', 'Albania', 2, 'europe', 'earth.europe.albania', '🇦🇱', NULL, 41.1533, 20.1683),
  ('alemania', 'Alemania', 2, 'europe', 'earth.europe.alemania', '🇩🇪', NULL, 51.1657, 10.4515),
  ('andorra', 'Andorra', 2, 'europe', 'earth.europe.andorra', '🇦🇩', NULL, 42.5462, 1.6016),
  ('austria', 'Austria', 2, 'europe', 'earth.europe.austria', '🇦🇹', NULL, 47.5162, 14.5501),
  ('belgica', 'Bélgica', 2, 'europe', 'earth.europe.belgica', '🇧🇪', NULL, 50.5039, 4.4699),
  ('bielorrusia', 'Bielorrusia', 2, 'europe', 'earth.europe.bielorrusia', '🇧🇾', NULL, 53.7098, 27.9534),
  ('bosnia-y-herzegovina', 'Bosnia y Herzegovina', 2, 'europe', 'earth.europe.bosnia-y-herzegovina', '🇧🇦', NULL, 43.9159, 17.6791),
  ('bulgaria', 'Bulgaria', 2, 'europe', 'earth.europe.bulgaria', '🇧🇬', NULL, 42.7339, 25.4858),
  ('ciudad-del-vaticano', 'Ciudad del Vaticano', 2, 'europe', 'earth.europe.ciudad-del-vaticano', '🇻🇦', NULL, 41.9029, 12.4534),
  ('croacia', 'Croacia', 2, 'europe', 'earth.europe.croacia', '🇭🇷', NULL, 45.1, 15.2),
  ('dinamarca', 'Dinamarca', 2, 'europe', 'earth.europe.dinamarca', '🇩🇰', NULL, 56.2639, 9.5018),
  ('eslovaquia', 'Eslovaquia', 2, 'europe', 'earth.europe.eslovaquia', '🇸🇰', NULL, 48.669, 19.699),
  ('eslovenia', 'Eslovenia', 2, 'europe', 'earth.europe.eslovenia', '🇸🇮', NULL, 46.1512, 14.9955),
  ('espana', 'España', 2, 'europe', 'earth.europe.espana', '🇪🇸', NULL, 40.4637, -3.7492),
  ('estonia', 'Estonia', 2, 'europe', 'earth.europe.estonia', '🇪🇪', NULL, 58.5953, 25.0136),
  ('finlandia', 'Finlandia', 2, 'europe', 'earth.europe.finlandia', '🇫🇮', NULL, 61.9241, 25.7482),
  ('francia', 'Francia', 2, 'europe', 'earth.europe.francia', '🇫🇷', NULL, 46.2276, 2.2137),
  ('grecia', 'Grecia', 2, 'europe', 'earth.europe.grecia', '🇬🇷', NULL, 39.0742, 21.8243),
  ('hungria', 'Hungría', 2, 'europe', 'earth.europe.hungria', '🇭🇺', NULL, 47.1625, 19.5033),
  ('irlanda', 'Irlanda', 2, 'europe', 'earth.europe.irlanda', '🇮🇪', NULL, 53.4129, -8.2439),
  ('islandia', 'Islandia', 2, 'europe', 'earth.europe.islandia', '🇮🇸', NULL, 64.9631, -19.0208),
  ('italia', 'Italia', 2, 'europe', 'earth.europe.italia', '🇮🇹', NULL, 41.8719, 12.5674),
  ('letonia', 'Letonia', 2, 'europe', 'earth.europe.letonia', '🇱🇻', NULL, 56.8796, 24.6032),
  ('liechtenstein', 'Liechtenstein', 2, 'europe', 'earth.europe.liechtenstein', '🇱🇮', NULL, 47.166, 9.5554),
  ('lituania', 'Lituania', 2, 'europe', 'earth.europe.lituania', '🇱🇹', NULL, 55.1694, 23.8813),
  ('luxemburgo', 'Luxemburgo', 2, 'europe', 'earth.europe.luxemburgo', '🇱🇺', NULL, 49.8153, 6.1296),
  ('macedonia-del-norte', 'Macedonia del Norte', 2, 'europe', 'earth.europe.macedonia-del-norte', '🇲🇰', NULL, 41.6086, 21.7453),
  ('malta', 'Malta', 2, 'europe', 'earth.europe.malta', '🇲🇹', NULL, 35.9375, 14.3754),
  ('moldavia', 'Moldavia', 2, 'europe', 'earth.europe.moldavia', '🇲🇩', NULL, 47.4116, 28.3699),
  ('monaco', 'Mónaco', 2, 'europe', 'earth.europe.monaco', '🇲🇨', NULL, 43.7503, 7.4128),
  ('montenegro', 'Montenegro', 2, 'europe', 'earth.europe.montenegro', '🇲🇪', NULL, 42.7087, 19.3744),
  ('noruega', 'Noruega', 2, 'europe', 'earth.europe.noruega', '🇳🇴', NULL, 60.472, 8.4689),
  ('paises-bajos', 'Países Bajos', 2, 'europe', 'earth.europe.paises-bajos', '🇳🇱', NULL, 52.1326, 5.2913),
  ('polonia', 'Polonia', 2, 'europe', 'earth.europe.polonia', '🇵🇱', NULL, 51.9194, 19.1451),
  ('portugal', 'Portugal', 2, 'europe', 'earth.europe.portugal', '🇵🇹', NULL, 39.3999, -8.2245),
  ('reino-unido', 'Reino Unido', 2, 'europe', 'earth.europe.reino-unido', '🇬🇧', NULL, 55.3781, -3.436),
  ('republica-checa', 'República Checa', 2, 'europe', 'earth.europe.republica-checa', '🇨🇿', NULL, 49.8175, 15.473),
  ('rumania', 'Rumania', 2, 'europe', 'earth.europe.rumania', '🇷🇴', NULL, 45.9432, 24.9668),
  ('rusia', 'Rusia', 2, 'europe', 'earth.europe.rusia', '🇷🇺', NULL, 61.524, 105.3188),
  ('san-marino', 'San Marino', 2, 'europe', 'earth.europe.san-marino', '🇸🇲', NULL, 43.9424, 12.4578),
  ('serbia', 'Serbia', 2, 'europe', 'earth.europe.serbia', '🇷🇸', NULL, 44.0165, 21.0059),
  ('suecia', 'Suecia', 2, 'europe', 'earth.europe.suecia', '🇸🇪', NULL, 60.1282, 18.6435),
  ('suiza', 'Suiza', 2, 'europe', 'earth.europe.suiza', '🇨🇭', NULL, 46.8182, 8.2275),
  ('ucrania', 'Ucrania', 2, 'europe', 'earth.europe.ucrania', '🇺🇦', NULL, 48.3794, 31.1656),
  ('australia', 'Australia', 2, 'oceania', 'earth.oceania.australia', '🇦🇺', NULL, -25.2744, 133.7751),
  ('fiyi', 'Fiyi', 2, 'oceania', 'earth.oceania.fiyi', '🇫🇯', NULL, -16.5782, 179.4144),
  ('islas-marshall', 'Islas Marshall', 2, 'oceania', 'earth.oceania.islas-marshall', '🇲🇭', NULL, 7.1315, 171.1845),
  ('islas-salomon', 'Islas Salomón', 2, 'oceania', 'earth.oceania.islas-salomon', '🇸🇧', NULL, -9.6457, 160.1562),
  ('kiribati', 'Kiribati', 2, 'oceania', 'earth.oceania.kiribati', '🇰🇮', NULL, -3.3704, -168.734),
  ('micronesia', 'Micronesia', 2, 'oceania', 'earth.oceania.micronesia', '🇫🇲', NULL, 7.4256, 150.5508),
  ('nauru', 'Nauru', 2, 'oceania', 'earth.oceania.nauru', '🇳🇷', NULL, -0.5228, 166.9315),
  ('nueva-zelanda', 'Nueva Zelanda', 2, 'oceania', 'earth.oceania.nueva-zelanda', '🇳🇿', NULL, -40.9006, 174.886),
  ('palaos', 'Palaos', 2, 'oceania', 'earth.oceania.palaos', '🇵🇼', NULL, 7.515, 134.5825),
  ('papua-nueva-guinea', 'Papúa Nueva Guinea', 2, 'oceania', 'earth.oceania.papua-nueva-guinea', '🇵🇬', NULL, -6.315, 143.9555),
  ('samoa', 'Samoa', 2, 'oceania', 'earth.oceania.samoa', '🇼🇸', NULL, -13.759, -172.1046),
  ('tonga', 'Tonga', 2, 'oceania', 'earth.oceania.tonga', '🇹🇴', NULL, -21.179, -175.1982),
  ('tuvalu', 'Tuvalu', 2, 'oceania', 'earth.oceania.tuvalu', '🇹🇻', NULL, -7.1095, 177.6493),
  ('vanuatu', 'Vanuatu', 2, 'oceania', 'earth.oceania.vanuatu', '🇻🇺', NULL, -15.3767, 166.9592)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
left join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;

-- Nivel 3 · subdivisiones de Argentina (23 provincias + CABA)
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji::text, i.description::text,
       i.lat::double precision, i.lng::double precision
from (values
  ('buenos-aires', 'Buenos Aires', 3, 'argentina', 'earth.south-america.argentina.buenos-aires', '🌾', NULL, -36.68, -60.56),
  ('caba', 'Ciudad Autónoma de Buenos Aires', 3, 'argentina', 'earth.south-america.argentina.caba', '🏙️', NULL, -34.61, -58.44),
  ('catamarca', 'Catamarca', 3, 'argentina', 'earth.south-america.argentina.catamarca', '⛰️', NULL, -27.32, -66.94),
  ('chaco', 'Chaco', 3, 'argentina', 'earth.south-america.argentina.chaco', '🌳', NULL, -26.35, -60.75),
  ('chubut', 'Chubut', 3, 'argentina', 'earth.south-america.argentina.chubut', '🐋', NULL, -43.79, -68.53),
  ('cordoba', 'Córdoba', 3, 'argentina', 'earth.south-america.argentina.cordoba', '🏔️', NULL, -32.14, -63.8),
  ('corrientes', 'Corrientes', 3, 'argentina', 'earth.south-america.argentina.corrientes', '🐊', NULL, -28.77, -57.79),
  ('entre-rios', 'Entre Ríos', 3, 'argentina', 'earth.south-america.argentina.entre-rios', '🏞️', NULL, -31.77, -59.22),
  ('formosa', 'Formosa', 3, 'argentina', 'earth.south-america.argentina.formosa', '🌿', NULL, -24.89, -59.97),
  ('jujuy', 'Jujuy', 3, 'argentina', 'earth.south-america.argentina.jujuy', '🏜️', NULL, -23.31, -65.76),
  ('la-pampa', 'La Pampa', 3, 'argentina', 'earth.south-america.argentina.la-pampa', '🐄', NULL, -37.13, -65.44),
  ('la-rioja', 'La Rioja', 3, 'argentina', 'earth.south-america.argentina.la-rioja', '🍇', NULL, -29.72, -67.15),
  ('mendoza', 'Mendoza', 3, 'argentina', 'earth.south-america.argentina.mendoza', '🍷', NULL, -34.63, -68.5),
  ('misiones', 'Misiones', 3, 'argentina', 'earth.south-america.argentina.misiones', '💦', NULL, -26.88, -54.51),
  ('neuquen', 'Neuquén', 3, 'argentina', 'earth.south-america.argentina.neuquen', '🦕', NULL, -38.63, -70.06),
  ('rio-negro', 'Río Negro', 3, 'argentina', 'earth.south-america.argentina.rio-negro', '🍎', NULL, -40.35, -67.28),
  ('salta', 'Salta', 3, 'argentina', 'earth.south-america.argentina.salta', '🌶️', NULL, -24.79, -65.41),
  ('san-juan', 'San Juan', 3, 'argentina', 'earth.south-america.argentina.san-juan', '☀️', NULL, -31, -68.9),
  ('san-luis', 'San Luis', 3, 'argentina', 'earth.south-america.argentina.san-luis', '🪨', NULL, -33.7, -66.03),
  ('santa-cruz', 'Santa Cruz', 3, 'argentina', 'earth.south-america.argentina.santa-cruz', '🧊', NULL, -49.31, -70),
  ('santa-fe', 'Santa Fe', 3, 'argentina', 'earth.south-america.argentina.santa-fe', '🌻', NULL, -31, -60.9),
  ('santiago-del-estero', 'Santiago del Estero', 3, 'argentina', 'earth.south-america.argentina.santiago-del-estero', '🪵', NULL, -27.78, -63.25),
  ('tierra-del-fuego', 'Tierra del Fuego', 3, 'argentina', 'earth.south-america.argentina.tierra-del-fuego', '🐧', NULL, -54.35, -67.5),
  ('tucuman', 'Tucumán', 3, 'argentina', 'earth.south-america.argentina.tucuman', '🍋', NULL, -26.85, -65.24)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
left join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;

-- Nivel 4 · municipios de la Provincia de Buenos Aires
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji::text, i.description::text,
       i.lat::double precision, i.lng::double precision
from (values
  ('mar-del-plata', 'Mar del Plata', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.mar-del-plata', '🌊', 'Partido de General Pueyrredón', -38.0055, -57.5426),
  ('la-plata', 'La Plata', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.la-plata', '🏛️', 'Capital de la Provincia de Buenos Aires', -34.9215, -57.9545),
  ('bahia-blanca', 'Bahía Blanca', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.bahia-blanca', '⚓', 'Puerto y nudo ferroviario del sur bonaerense', -38.7196, -62.2724),
  ('tandil', 'Tandil', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.tandil', '🪨', 'Sierras, quesos y salames en el centro de la provincia', -37.3217, -59.1332),
  ('mar-chiquita', 'Mar Chiquita', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.mar-chiquita', '🦩', 'Partido costero con la única albufera del país', -37.7442, -57.4256),
  ('balcarce', 'Balcarce', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.balcarce', '🏁', 'Tierra de Fangio y de la papa', -37.8462, -58.2556),
  ('necochea', 'Necochea', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.necochea', '🏖️', 'Playas anchas y el Parque Miguel Lillo', -38.5545, -58.7396),
  ('pinamar', 'Pinamar', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.pinamar', '🌲', 'Bosque y médanos sobre el Atlántico', -37.1069, -56.8592),
  ('villa-gesell', 'Villa Gesell', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.villa-gesell', '🎸', 'Balneario forestado, cuna de la peatonal veraniega', -37.2639, -56.973),
  ('miramar', 'Miramar', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.miramar', '🚲', 'La ciudad de los niños, en el partido de General Alvarado', -38.2703, -57.8397)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
left join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;

-- 217 subdivisiones de primer nivel de 11 países sudamericanos (incluye 19 departamentos uruguayos)
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji, i.description, i.lat, i.lng
from (values
  ('bolivia-beni', 'Beni', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-beni', '🗺️', 'División administrativa de primer nivel de Beni', -13.436435, -64.545052),
  ('bolivia-chuquisaca', 'Chuquisaca', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-chuquisaca', '🗺️', 'División administrativa de primer nivel de Chuquisaca', -19.932293, -63.937444),
  ('bolivia-cochabamba', 'Cochabamba', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-cochabamba', '🗺️', 'División administrativa de primer nivel de Cochabamba', -17.230862, -65.619924),
  ('bolivia-la-paz', 'La Paz', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-la-paz', '🗺️', 'División administrativa de primer nivel de La Paz', -14.948268, -68.18868),
  ('bolivia-oruro', 'Oruro', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-oruro', '🗺️', 'División administrativa de primer nivel de Oruro', -18.605372, -67.614223),
  ('bolivia-pando', 'Pando', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-pando', '🗺️', 'División administrativa de primer nivel de Pando', -11.084036, -67.430779),
  ('bolivia-potosi', 'Potosí', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-potosi', '🗺️', 'División administrativa de primer nivel de Potosí', -20.35684, -66.74413),
  ('bolivia-santa-cruz', 'Santa Cruz', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-santa-cruz', '🗺️', 'División administrativa de primer nivel de Santa Cruz', -16.974488, -61.148423),
  ('bolivia-tarija', 'Tarija', 3, 'bolivia', 'earth.south-america.bolivia.bolivia-tarija', '🗺️', 'División administrativa de primer nivel de Tarija', -21.884343, -63.840289),
  ('brasil-acre', 'Acre', 3, 'brasil', 'earth.south-america.brasil.brasil-acre', '🗺️', 'División administrativa de primer nivel de Acre', -9.126191, -70.322378),
  ('brasil-alagoas', 'Alagoas', 3, 'brasil', 'earth.south-america.brasil.brasil-alagoas', '🗺️', 'División administrativa de primer nivel de Alagoas', -9.627012, -36.593301),
  ('brasil-amapa', 'Amapa', 3, 'brasil', 'earth.south-america.brasil.brasil-amapa', '🗺️', 'División administrativa de primer nivel de Amapa', 1.500248, -52.416833),
  ('brasil-amazonas', 'Amazonas', 3, 'brasil', 'earth.south-america.brasil.brasil-amazonas', '🗺️', 'División administrativa de primer nivel de Amazonas', -3.753658, -64.988685),
  ('brasil-bahia', 'Bahia', 3, 'brasil', 'earth.south-america.brasil.brasil-bahia', '🗺️', 'División administrativa de primer nivel de Bahia', -13.442564, -41.97851),
  ('brasil-ceara', 'Ceara', 3, 'brasil', 'earth.south-america.brasil.brasil-ceara', '🗺️', 'División administrativa de primer nivel de Ceara', -5.378278, -39.334324),
  ('brasil-distrito-federal', 'Distrito Federal', 3, 'brasil', 'earth.south-america.brasil.brasil-distrito-federal', '🗺️', 'División administrativa de primer nivel de Distrito Federal', -15.78931, -47.802725),
  ('brasil-espirito-santo', 'Espirito Santo', 3, 'brasil', 'earth.south-america.brasil.brasil-espirito-santo', '🗺️', 'División administrativa de primer nivel de Espirito Santo', -19.602911, -40.77004),
  ('brasil-goias', 'Goias', 3, 'brasil', 'earth.south-america.brasil.brasil-goias', '🗺️', 'División administrativa de primer nivel de Goias', -15.987006, -49.572768),
  ('brasil-maranhao', 'Maranhao', 3, 'brasil', 'earth.south-america.brasil.brasil-maranhao', '🗺️', 'División administrativa de primer nivel de Maranhao', -5.704107, -45.173282),
  ('brasil-mato-grosso', 'Mato Grosso', 3, 'brasil', 'earth.south-america.brasil.brasil-mato-grosso', '🗺️', 'División administrativa de primer nivel de Mato Grosso', -12.692754, -55.917594),
  ('brasil-mato-grosso-do-sul', 'Mato Grosso do Sul', 3, 'brasil', 'earth.south-america.brasil.brasil-mato-grosso-do-sul', '🗺️', 'División administrativa de primer nivel de Mato Grosso do Sul', -20.632732, -54.535573),
  ('brasil-minas-gerais', 'Minas Gerais', 3, 'brasil', 'earth.south-america.brasil.brasil-minas-gerais', '🗺️', 'División administrativa de primer nivel de Minas Gerais', -18.614626, -45.444013),
  ('brasil-para', 'Para', 3, 'brasil', 'earth.south-america.brasil.brasil-para', '🗺️', 'División administrativa de primer nivel de Para', -3.657173, -52.461228),
  ('brasil-paraiba', 'Paraiba', 3, 'brasil', 'earth.south-america.brasil.brasil-paraiba', '🗺️', 'División administrativa de primer nivel de Paraiba', -7.196556, -36.702573),
  ('brasil-parana', 'Parana', 3, 'brasil', 'earth.south-america.brasil.brasil-parana', '🗺️', 'División administrativa de primer nivel de Parana', -24.642421, -51.375806),
  ('brasil-pernambuco', 'Pernambuco', 3, 'brasil', 'earth.south-america.brasil.brasil-pernambuco', '🗺️', 'División administrativa de primer nivel de Pernambuco', -8.402685, -37.994633),
  ('brasil-piaui', 'Piaui', 3, 'brasil', 'earth.south-america.brasil.brasil-piaui', '🗺️', 'División administrativa de primer nivel de Piaui', -6.893824, -43.198433),
  ('brasil-rio-de-jeneiro', 'Rio de Jeneiro', 3, 'brasil', 'earth.south-america.brasil.brasil-rio-de-jeneiro', '🗺️', 'División administrativa de primer nivel de Rio de Jeneiro', -22.139012, -42.944611),
  ('brasil-rio-granda-do-norte', 'Rio Granda do Norte', 3, 'brasil', 'earth.south-america.brasil.brasil-rio-granda-do-norte', '🗺️', 'División administrativa de primer nivel de Rio Granda do Norte', -5.936663, -36.698959),
  ('brasil-rio-grande-do-sul', 'Rio Grande do Sul', 3, 'brasil', 'earth.south-america.brasil.brasil-rio-grande-do-sul', '🗺️', 'División administrativa de primer nivel de Rio Grande do Sul', -30.422549, -53.627956),
  ('brasil-rondonia', 'Rondonia', 3, 'brasil', 'earth.south-america.brasil.brasil-rondonia', '🗺️', 'División administrativa de primer nivel de Rondonia', -10.791667, -63.27266),
  ('brasil-roraima', 'Roraima', 3, 'brasil', 'earth.south-america.brasil.brasil-roraima', '🗺️', 'División administrativa de primer nivel de Roraima', 1.875442, -61.844232),
  ('brasil-santa-catarina', 'Santa Catarina', 3, 'brasil', 'earth.south-america.brasil.brasil-santa-catarina', '🗺️', 'División administrativa de primer nivel de Santa Catarina', -27.710985, -51.110956),
  ('brasil-sao-paulo', 'Sao Paulo', 3, 'brasil', 'earth.south-america.brasil.brasil-sao-paulo', '🗺️', 'División administrativa de primer nivel de Sao Paulo', -22.574937, -48.68777),
  ('brasil-sergipe', 'Sergipe', 3, 'brasil', 'earth.south-america.brasil.brasil-sergipe', '🗺️', 'División administrativa de primer nivel de Sergipe', -10.557782, -37.240204),
  ('brasil-tocantins', 'Tocantins', 3, 'brasil', 'earth.south-america.brasil.brasil-tocantins', '🗺️', 'División administrativa de primer nivel de Tocantins', -9.314681, -48.207697),
  ('chile-region-de-antofagasta', 'Región de Antofagasta', 3, 'chile', 'earth.south-america.chile.chile-region-de-antofagasta', '🗺️', 'División administrativa de primer nivel de Región de Antofagasta', -23.498041, -68.864051),
  ('chile-region-de-arica-y-parinacota', 'Región de Arica y Parinacota', 3, 'chile', 'earth.south-america.chile.chile-region-de-arica-y-parinacota', '🗺️', 'División administrativa de primer nivel de Región de Arica y Parinacota', -18.363871, -69.64539),
  ('chile-region-de-atacama', 'Región de Atacama', 3, 'chile', 'earth.south-america.chile.chile-region-de-atacama', '🗺️', 'División administrativa de primer nivel de Región de Atacama', -27.410495, -69.894426),
  ('chile-region-de-aysen-del-gral-ibanez-del-campo', 'Región de Aysén del Gral.Ibañez del Campo', 3, 'chile', 'earth.south-america.chile.chile-region-de-aysen-del-gral-ibanez-del-campo', '🗺️', 'División administrativa de primer nivel de Región de Aysén del Gral.Ibañez del Campo', -46.424904, -73.373218),
  ('chile-region-de-coquimbo', 'Región de Coquimbo', 3, 'chile', 'earth.south-america.chile.chile-region-de-coquimbo', '🗺️', 'División administrativa de primer nivel de Región de Coquimbo', -30.660011, -70.763274),
  ('chile-region-de-la-araucania', 'Región de La Araucanía', 3, 'chile', 'earth.south-america.chile.chile-region-de-la-araucania', '🗺️', 'División administrativa de primer nivel de Región de La Araucanía', -38.609435, -72.173193),
  ('chile-region-de-los-lagos', 'Región de Los Lagos', 3, 'chile', 'earth.south-america.chile.chile-region-de-los-lagos', '🗺️', 'División administrativa de primer nivel de Región de Los Lagos', -42.15181, -73.213739),
  ('chile-region-de-los-rios', 'Región de Los Ríos', 3, 'chile', 'earth.south-america.chile.chile-region-de-los-rios', '🗺️', 'División administrativa de primer nivel de Región de Los Ríos', -39.984526, -72.658506),
  ('chile-region-de-magallanes-y-antartica-chilena', 'Región de Magallanes y Antártica Chilena', 3, 'chile', 'earth.south-america.chile.chile-region-de-magallanes-y-antartica-chilena', '🗺️', 'División administrativa de primer nivel de Región de Magallanes y Antártica Chilena', -52.287818, -71.06987),
  ('chile-region-de-nuble', 'Región de Ñuble', 3, 'chile', 'earth.south-america.chile.chile-region-de-nuble', '🗺️', 'División administrativa de primer nivel de Región de Ñuble', -36.601585, -71.9457),
  ('chile-region-de-tarapaca', 'Región de Tarapacá', 3, 'chile', 'earth.south-america.chile.chile-region-de-tarapaca', '🗺️', 'División administrativa de primer nivel de Región de Tarapacá', -20.283246, -69.345087),
  ('chile-region-de-valparaiso', 'Región de Valparaíso', 3, 'chile', 'earth.south-america.chile.chile-region-de-valparaiso', '🗺️', 'División administrativa de primer nivel de Región de Valparaíso', -30.12106, -89.722119),
  ('chile-region-del-bio-bio', 'Región del Bío-Bío', 3, 'chile', 'earth.south-america.chile.chile-region-del-bio-bio', '🗺️', 'División administrativa de primer nivel de Región del Bío-Bío', -37.467783, -72.472358),
  ('chile-region-del-libertador-bernardo-o-higgins', 'Región del Libertador Bernardo O''Higgins', 3, 'chile', 'earth.south-america.chile.chile-region-del-libertador-bernardo-o-higgins', '🗺️', 'División administrativa de primer nivel de Región del Libertador Bernardo O''Higgins', -34.427954, -71.032761),
  ('chile-region-del-maule', 'Región del Maule', 3, 'chile', 'earth.south-america.chile.chile-region-del-maule', '🗺️', 'División administrativa de primer nivel de Región del Maule', -35.613951, -71.548824),
  ('chile-region-metropolitana-de-santiago', 'Región Metropolitana de Santiago', 3, 'chile', 'earth.south-america.chile.chile-region-metropolitana-de-santiago', '🗺️', 'División administrativa de primer nivel de Región Metropolitana de Santiago', -33.606574, -70.742153),
  ('colombia-amazonas', 'Amazonas', 3, 'colombia', 'earth.south-america.colombia.colombia-amazonas', '🗺️', 'División administrativa de primer nivel de Amazonas', -2.059965, -71.892563),
  ('colombia-antioquia', 'Antioquia', 3, 'colombia', 'earth.south-america.colombia.colombia-antioquia', '🗺️', 'División administrativa de primer nivel de Antioquia', 7.154189, -75.503339),
  ('colombia-arauca', 'Arauca', 3, 'colombia', 'earth.south-america.colombia.colombia-arauca', '🗺️', 'División administrativa de primer nivel de Arauca', 6.571366, -70.899334),
  ('colombia-archipielago-de-san-andres-providencia-y-santa-catalina', 'Archipiélago de San Andrés, Providencia y Santa Catalina', 3, 'colombia', 'earth.south-america.colombia.colombia-archipielago-de-san-andres-providencia-y-santa-catalina', '🗺️', 'División administrativa de primer nivel de Archipiélago de San Andrés, Providencia y Santa Catalina', 12.937409, -81.542379),
  ('colombia-atlantico', 'Atlántico', 3, 'colombia', 'earth.south-america.colombia.colombia-atlantico', '🗺️', 'División administrativa de primer nivel de Atlántico', 10.679872, -74.990249),
  ('colombia-bogota-capital-district', 'Bogota Capital District', 3, 'colombia', 'earth.south-america.colombia.colombia-bogota-capital-district', '🗺️', 'División administrativa de primer nivel de Bogota Capital District', 4.282725, -74.224012),
  ('colombia-bolivar', 'Bolívar', 3, 'colombia', 'earth.south-america.colombia.colombia-bolivar', '🗺️', 'División administrativa de primer nivel de Bolívar', 8.900227, -74.969144),
  ('colombia-boyaca', 'Boyacá', 3, 'colombia', 'earth.south-america.colombia.colombia-boyaca', '🗺️', 'División administrativa de primer nivel de Boyacá', 5.855365, -73.302673),
  ('colombia-caldas', 'Caldas', 3, 'colombia', 'earth.south-america.colombia.colombia-caldas', '🗺️', 'División administrativa de primer nivel de Caldas', 5.290779, -75.272986),
  ('colombia-caqueta', 'Caquetá', 3, 'colombia', 'earth.south-america.colombia.colombia-caqueta', '🗺️', 'División administrativa de primer nivel de Caquetá', 1.113316, -73.813066),
  ('colombia-casanare', 'Casanare', 3, 'colombia', 'earth.south-america.colombia.colombia-casanare', '🗺️', 'División administrativa de primer nivel de Casanare', 5.296355, -71.450191),
  ('colombia-cauca', 'Cauca', 3, 'colombia', 'earth.south-america.colombia.colombia-cauca', '🗺️', 'División administrativa de primer nivel de Cauca', 2.143789, -76.837695),
  ('colombia-cesar', 'Cesar', 3, 'colombia', 'earth.south-america.colombia.colombia-cesar', '🗺️', 'División administrativa de primer nivel de Cesar', 9.271925, -73.512819),
  ('colombia-choco', 'Chocó', 3, 'colombia', 'earth.south-america.colombia.colombia-choco', '🗺️', 'División administrativa de primer nivel de Chocó', 6.320063, -76.948069),
  ('colombia-cordoba', 'Córdoba', 3, 'colombia', 'earth.south-america.colombia.colombia-cordoba', '🗺️', 'División administrativa de primer nivel de Córdoba', 8.402452, -75.647536),
  ('colombia-cundinamarca', 'Cundinamarca', 3, 'colombia', 'earth.south-america.colombia.colombia-cundinamarca', '🗺️', 'División administrativa de primer nivel de Cundinamarca', 4.780505, -73.97075),
  ('colombia-guainia', 'Guainía', 3, 'colombia', 'earth.south-america.colombia.colombia-guainia', '🗺️', 'División administrativa de primer nivel de Guainía', 2.607212, -68.896842),
  ('colombia-guaviare', 'Guaviare', 3, 'colombia', 'earth.south-america.colombia.colombia-guaviare', '🗺️', 'División administrativa de primer nivel de Guaviare', 1.789551, -71.827851),
  ('colombia-huila', 'Huila', 3, 'colombia', 'earth.south-america.colombia.colombia-huila', '🗺️', 'División administrativa de primer nivel de Huila', 2.70016, -75.518552),
  ('colombia-la-guajira', 'La Guajira', 3, 'colombia', 'earth.south-america.colombia.colombia-la-guajira', '🗺️', 'División administrativa de primer nivel de La Guajira', 11.427018, -72.388945),
  ('colombia-magdalena', 'Magdalena', 3, 'colombia', 'earth.south-america.colombia.colombia-magdalena', '🗺️', 'División administrativa de primer nivel de Magdalena', 10.133098, -74.243825),
  ('colombia-meta', 'Meta', 3, 'colombia', 'earth.south-america.colombia.colombia-meta', '🗺️', 'División administrativa de primer nivel de Meta', 3.26346, -73.005668),
  ('colombia-narino', 'Nariño', 3, 'colombia', 'earth.south-america.colombia.colombia-narino', '🗺️', 'División administrativa de primer nivel de Nariño', 1.522543, -77.921011),
  ('colombia-norte-de-santander', 'Norte de Santander', 3, 'colombia', 'earth.south-america.colombia.colombia-norte-de-santander', '🗺️', 'División administrativa de primer nivel de Norte de Santander', 8.082189, -72.842505),
  ('colombia-putumayo', 'Putumayo', 3, 'colombia', 'earth.south-america.colombia.colombia-putumayo', '🗺️', 'División administrativa de primer nivel de Putumayo', 0.453678, -75.514049),
  ('colombia-quindio', 'Quindío', 3, 'colombia', 'earth.south-america.colombia.colombia-quindio', '🗺️', 'División administrativa de primer nivel de Quindío', 4.397735, -75.640084),
  ('colombia-risaralda', 'Risaralda', 3, 'colombia', 'earth.south-america.colombia.colombia-risaralda', '🗺️', 'División administrativa de primer nivel de Risaralda', 5.116342, -75.793403),
  ('colombia-santander', 'Santander', 3, 'colombia', 'earth.south-america.colombia.colombia-santander', '🗺️', 'División administrativa de primer nivel de Santander', 6.925133, -73.501457),
  ('colombia-sucre', 'Sucre', 3, 'colombia', 'earth.south-america.colombia.colombia-sucre', '🗺️', 'División administrativa de primer nivel de Sucre', 9.212268, -75.122483),
  ('colombia-tolima', 'Tolima', 3, 'colombia', 'earth.south-america.colombia.colombia-tolima', '🗺️', 'División administrativa de primer nivel de Tolima', 4.094734, -75.292007),
  ('colombia-valle-del-cauca', 'Valle del Cauca', 3, 'colombia', 'earth.south-america.colombia.colombia-valle-del-cauca', '🗺️', 'División administrativa de primer nivel de Valle del Cauca', 4.06398, -76.624376),
  ('colombia-vaupes', 'Vaupés', 3, 'colombia', 'earth.south-america.colombia.colombia-vaupes', '🗺️', 'División administrativa de primer nivel de Vaupés', 0.426078, -70.574284),
  ('colombia-vichada', 'Vichada', 3, 'colombia', 'earth.south-america.colombia.colombia-vichada', '🗺️', 'División administrativa de primer nivel de Vichada', 4.530529, -69.243885),
  ('ecuador-azuay', 'Azuay', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-azuay', '🗺️', 'División administrativa de primer nivel de Azuay', -3.094009, -79.091939),
  ('ecuador-bolivar', 'Bolívar', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-bolivar', '🗺️', 'División administrativa de primer nivel de Bolívar', -1.672189, -79.119622),
  ('ecuador-canar', 'Cañar', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-canar', '🗺️', 'División administrativa de primer nivel de Cañar', -2.538692, -79.045581),
  ('ecuador-carchi', 'Carchi', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-carchi', '🗺️', 'División administrativa de primer nivel de Carchi', 0.782657, -78.051724),
  ('ecuador-chimborazo', 'Chimborazo', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-chimborazo', '🗺️', 'División administrativa de primer nivel de Chimborazo', -1.992295, -78.805269),
  ('ecuador-cotopaxi', 'Cotopaxi', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-cotopaxi', '🗺️', 'División administrativa de primer nivel de Cotopaxi', -0.775243, -78.863543),
  ('ecuador-el-oro', 'El Oro', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-el-oro', '🗺️', 'División administrativa de primer nivel de El Oro', -3.471523, -79.831751),
  ('ecuador-esmeraldas', 'Esmeraldas', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-esmeraldas', '🗺️', 'División administrativa de primer nivel de Esmeraldas', 0.767487, -79.267027),
  ('ecuador-galapagos', 'Galápagos', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-galapagos', '🗺️', 'División administrativa de primer nivel de Galápagos', 0.141931, -90.62675),
  ('ecuador-guayas', 'Guayas', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-guayas', '🗺️', 'División administrativa de primer nivel de Guayas', -2.014944, -79.839738),
  ('ecuador-imbabura', 'Imbabura', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-imbabura', '🗺️', 'División administrativa de primer nivel de Imbabura', 0.506932, -78.542577),
  ('ecuador-loja', 'Loja', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-loja', '🗺️', 'División administrativa de primer nivel de Loja', -4.039548, -79.786675),
  ('ecuador-los-rios', 'Los Ríos', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-los-rios', '🗺️', 'División administrativa de primer nivel de Los Ríos', -1.33577, -79.482703),
  ('ecuador-manabi', 'Manabi', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-manabi', '🗺️', 'División administrativa de primer nivel de Manabi', -0.774299, -80.24217),
  ('ecuador-morona-santiago', 'Morona Santiago', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-morona-santiago', '🗺️', 'División administrativa de primer nivel de Morona Santiago', -2.515981, -77.820773),
  ('ecuador-napo', 'Napo', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-napo', '🗺️', 'División administrativa de primer nivel de Napo', -0.601481, -77.730002),
  ('ecuador-orellana', 'Orellana', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-orellana', '🗺️', 'División administrativa de primer nivel de Orellana', -0.800753, -76.404356),
  ('ecuador-pastaza', 'Pastaza', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-pastaza', '🗺️', 'División administrativa de primer nivel de Pastaza', -1.803969, -76.877195),
  ('ecuador-pichincha', 'Pichincha', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-pichincha', '🗺️', 'División administrativa de primer nivel de Pichincha', -0.190992, -78.609158),
  ('ecuador-santa-elena', 'Santa Elena', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-santa-elena', '🗺️', 'División administrativa de primer nivel de Santa Elena', -2.086838, -80.617646),
  ('ecuador-santo-domingo-de-los-tsachilas', 'Santo Domingo de los Tsáchilas', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-santo-domingo-de-los-tsachilas', '🗺️', 'División administrativa de primer nivel de Santo Domingo de los Tsáchilas', -0.284383, -79.1857),
  ('ecuador-sucumbios', 'Sucumbios', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-sucumbios', '🗺️', 'División administrativa de primer nivel de Sucumbios', 0.008281, -76.593459),
  ('ecuador-tungurahua', 'Tungurahua', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-tungurahua', '🗺️', 'División administrativa de primer nivel de Tungurahua', -1.255919, -78.528293),
  ('ecuador-zamora-chinchipe', 'Zamora Chinchipe', 3, 'ecuador', 'earth.south-america.ecuador.ecuador-zamora-chinchipe', '🗺️', 'División administrativa de primer nivel de Zamora Chinchipe', -4.177512, -78.902719),
  ('guyana-barina-waini', 'Barina-Waini', 3, 'guyana', 'earth.south-america.guyana.guyana-barina-waini', '🗺️', 'División administrativa de primer nivel de Barina-Waini', 7.744959, -59.759851),
  ('guyana-cuyuni-mazaruni', 'Cuyuni-Mazaruni', 3, 'guyana', 'earth.south-america.guyana.guyana-cuyuni-mazaruni', '🗺️', 'División administrativa de primer nivel de Cuyuni-Mazaruni', 6.187575, -59.992561),
  ('guyana-demerara-mahaica', 'Demerara-Mahaica', 3, 'guyana', 'earth.south-america.guyana.guyana-demerara-mahaica', '🗺️', 'División administrativa de primer nivel de Demerara-Mahaica', 6.455735, -58.095821),
  ('guyana-east-berbice-corentyne', 'East Berbice-Corentyne', 3, 'guyana', 'earth.south-america.guyana.guyana-east-berbice-corentyne', '🗺️', 'División administrativa de primer nivel de East Berbice-Corentyne', 3.888119, -57.491462),
  ('guyana-essequibo-islands-west-demerara', 'Essequibo Islands-West Demerara', 3, 'guyana', 'earth.south-america.guyana.guyana-essequibo-islands-west-demerara', '🗺️', 'División administrativa de primer nivel de Essequibo Islands-West Demerara', 6.594822, -58.514351),
  ('guyana-mahaica-berbice', 'Mahaica-Berbice', 3, 'guyana', 'earth.south-america.guyana.guyana-mahaica-berbice', '🗺️', 'División administrativa de primer nivel de Mahaica-Berbice', 6.276153, -57.844651),
  ('guyana-pomeroon-supenaam', 'Pomeroon-Supenaam', 3, 'guyana', 'earth.south-america.guyana.guyana-pomeroon-supenaam', '🗺️', 'División administrativa de primer nivel de Pomeroon-Supenaam', 7.20493, -58.842018),
  ('guyana-potaro-siparuni', 'Potaro-Siparuni', 3, 'guyana', 'earth.south-america.guyana.guyana-potaro-siparuni', '🗺️', 'División administrativa de primer nivel de Potaro-Siparuni', 4.862375, -59.238675),
  ('guyana-upper-demerara-berbice', 'Upper Demerara-Berbice', 3, 'guyana', 'earth.south-america.guyana.guyana-upper-demerara-berbice', '🗺️', 'División administrativa de primer nivel de Upper Demerara-Berbice', 5.559167, -58.268798),
  ('guyana-upper-takutu-upper-essequibo', 'Upper Takutu-Upper Essequibo', 3, 'guyana', 'earth.south-america.guyana.guyana-upper-takutu-upper-essequibo', '🗺️', 'División administrativa de primer nivel de Upper Takutu-Upper Essequibo', 2.845574, -58.971327),
  ('paraguay-alto-paraguay', 'ALTO PARAGUAY', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-alto-paraguay', '🗺️', 'División administrativa de primer nivel de ALTO PARAGUAY', -20.844366, -59.869864),
  ('paraguay-alto-parana', 'ALTO PARANA', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-alto-parana', '🗺️', 'División administrativa de primer nivel de ALTO PARANA', -25.366578, -54.948223),
  ('paraguay-amambay', 'AMAMBAY', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-amambay', '🗺️', 'División administrativa de primer nivel de AMAMBAY', -22.952697, -56.165202),
  ('paraguay-asuncion', 'ASUNCION', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-asuncion', '🗺️', 'División administrativa de primer nivel de ASUNCION', -25.302162, -57.60082),
  ('paraguay-boqueron', 'BOQUERON', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-boqueron', '🗺️', 'División administrativa de primer nivel de BOQUERON', -21.987316, -60.990606),
  ('paraguay-caaguazu', 'CAAGUAZU', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-caaguazu', '🗺️', 'División administrativa de primer nivel de CAAGUAZU', -25.086877, -55.889845),
  ('paraguay-caazapa', 'CAAZAPA', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-caazapa', '🗺️', 'División administrativa de primer nivel de CAAZAPA', -26.159031, -56.048653),
  ('paraguay-canindeyu', 'CANINDEYU', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-canindeyu', '🗺️', 'División administrativa de primer nivel de CANINDEYU', -24.153631, -55.215724),
  ('paraguay-central', 'CENTRAL', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-central', '🗺️', 'División administrativa de primer nivel de CENTRAL', -25.560897, -57.50983),
  ('paraguay-concepcion', 'CONCEPCION', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-concepcion', '🗺️', 'División administrativa de primer nivel de CONCEPCION', -22.79429, -57.059577),
  ('paraguay-cordillera', 'CORDILLERA', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-cordillera', '🗺️', 'División administrativa de primer nivel de CORDILLERA', -25.256127, -57.019839),
  ('paraguay-guaira', 'GUAIRA', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-guaira', '🗺️', 'División administrativa de primer nivel de GUAIRA', -25.880934, -56.190636),
  ('paraguay-itapua', 'ITAPUA', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-itapua', '🗺️', 'División administrativa de primer nivel de ITAPUA', -26.841998, -55.766499),
  ('paraguay-misiones', 'MISIONES', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-misiones', '🗺️', 'División administrativa de primer nivel de MISIONES', -26.931148, -57.1845),
  ('paraguay-neembucu', 'ÑEEMBUCU', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-neembucu', '🗺️', 'División administrativa de primer nivel de ÑEEMBUCU', -26.605607, -57.923433),
  ('paraguay-paraguari', 'PARAGUARI', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-paraguari', '🗺️', 'División administrativa de primer nivel de PARAGUARI', -26.01069, -57.178467),
  ('paraguay-presidente-hayes', 'PRESIDENTE HAYES', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-presidente-hayes', '🗺️', 'División administrativa de primer nivel de PRESIDENTE HAYES', -23.715033, -58.967349),
  ('paraguay-san-pedro', 'SAN PEDRO', 3, 'paraguay', 'earth.south-america.paraguay.paraguay-san-pedro', '🗺️', 'División administrativa de primer nivel de SAN PEDRO', -24.159861, -56.587754),
  ('peru-amazonas', 'Amazonas', 3, 'peru', 'earth.south-america.peru.peru-amazonas', '🗺️', 'División administrativa de primer nivel de Amazonas', -4.977566, -77.92404),
  ('peru-ancash', 'Ancash', 3, 'peru', 'earth.south-america.peru.peru-ancash', '🗺️', 'División administrativa de primer nivel de Ancash', -9.41272, -77.697237),
  ('peru-apurimac', 'Apurímac', 3, 'peru', 'earth.south-america.peru.peru-apurimac', '🗺️', 'División administrativa de primer nivel de Apurímac', -14.018428, -72.944863),
  ('peru-arequipa', 'Arequipa', 3, 'peru', 'earth.south-america.peru.peru-arequipa', '🗺️', 'División administrativa de primer nivel de Arequipa', -15.976487, -72.948653),
  ('peru-ayacucho', 'Ayacucho', 3, 'peru', 'earth.south-america.peru.peru-ayacucho', '🗺️', 'División administrativa de primer nivel de Ayacucho', -13.909446, -73.97619),
  ('peru-cajamarca', 'Cajamarca', 3, 'peru', 'earth.south-america.peru.peru-cajamarca', '🗺️', 'División administrativa de primer nivel de Cajamarca', -6.171772, -78.610773),
  ('peru-cusco', 'Cusco', 3, 'peru', 'earth.south-america.peru.peru-cusco', '🗺️', 'División administrativa de primer nivel de Cusco', -13.355196, -72.165504),
  ('peru-el-callao', 'El Callao', 3, 'peru', 'earth.south-america.peru.peru-el-callao', '🗺️', 'División administrativa de primer nivel de El Callao', -11.981837, -77.17492),
  ('peru-huancavelica', 'Huancavelica', 3, 'peru', 'earth.south-america.peru.peru-huancavelica', '🗺️', 'División administrativa de primer nivel de Huancavelica', -13.050797, -75.035293),
  ('peru-huanuco', 'Huánuco', 3, 'peru', 'earth.south-america.peru.peru-huanuco', '🗺️', 'División administrativa de primer nivel de Huánuco', -9.398552, -75.911259),
  ('peru-ica', 'Ica', 3, 'peru', 'earth.south-america.peru.peru-ica', '🗺️', 'División administrativa de primer nivel de Ica', -14.219784, -75.566139),
  ('peru-junin', 'Junín', 3, 'peru', 'earth.south-america.peru.peru-junin', '🗺️', 'División administrativa de primer nivel de Junín', -11.667676, -74.940444),
  ('peru-la-libertad', 'La Libertad', 3, 'peru', 'earth.south-america.peru.peru-la-libertad', '🗺️', 'División administrativa de primer nivel de La Libertad', -7.945459, -78.304869),
  ('peru-lambayeque', 'Lambayeque', 3, 'peru', 'earth.south-america.peru.peru-lambayeque', '🗺️', 'División administrativa de primer nivel de Lambayeque', -6.30919, -79.887932),
  ('peru-lima', 'Lima', 3, 'peru', 'earth.south-america.peru.peru-lima', '🗺️', 'División administrativa de primer nivel de Lima', -11.809769, -76.71094),
  ('peru-loreto', 'Loreto', 3, 'peru', 'earth.south-america.peru.peru-loreto', '🗺️', 'División administrativa de primer nivel de Loreto', -4.357622, -73.888144),
  ('peru-madre-de-dios', 'Madre de Dios', 3, 'peru', 'earth.south-america.peru.peru-madre-de-dios', '🗺️', 'División administrativa de primer nivel de Madre de Dios', -11.661711, -70.521159),
  ('peru-moquegua', 'Moquegua', 3, 'peru', 'earth.south-america.peru.peru-moquegua', '🗺️', 'División administrativa de primer nivel de Moquegua', -16.91925, -70.733815),
  ('peru-municipalidad-metropolitana-de-lima', 'Municipalidad Metropolitana de Lima', 3, 'peru', 'earth.south-america.peru.peru-municipalidad-metropolitana-de-lima', '🗺️', 'División administrativa de primer nivel de Municipalidad Metropolitana de Lima', -12.001166, -76.919426),
  ('peru-pasco', 'Pasco', 3, 'peru', 'earth.south-america.peru.peru-pasco', '🗺️', 'División administrativa de primer nivel de Pasco', -10.292504, -75.431474),
  ('peru-piura', 'Piura', 3, 'peru', 'earth.south-america.peru.peru-piura', '🗺️', 'División administrativa de primer nivel de Piura', -5.214555, -80.27537),
  ('peru-puno', 'Puno', 3, 'peru', 'earth.south-america.peru.peru-puno', '🗺️', 'División administrativa de primer nivel de Puno', -15.160204, -69.959049),
  ('peru-san-martin', 'San Martín', 3, 'peru', 'earth.south-america.peru.peru-san-martin', '🗺️', 'División administrativa de primer nivel de San Martín', -7.081281, -76.643178),
  ('peru-tacna', 'Tacna', 3, 'peru', 'earth.south-america.peru.peru-tacna', '🗺️', 'División administrativa de primer nivel de Tacna', -17.574505, -70.304039),
  ('peru-tumbes', 'Tumbes', 3, 'peru', 'earth.south-america.peru.peru-tumbes', '🗺️', 'División administrativa de primer nivel de Tumbes', -3.798695, -80.607777),
  ('peru-ucayali', 'Ucayali', 3, 'peru', 'earth.south-america.peru.peru-ucayali', '🗺️', 'División administrativa de primer nivel de Ucayali', -9.357496, -73.221911),
  ('surinam-brokopondo', 'Brokopondo', 3, 'surinam', 'earth.south-america.surinam.surinam-brokopondo', '🗺️', 'División administrativa de primer nivel de Brokopondo', 4.680383, -55.104213),
  ('surinam-commewijne', 'Commewijne', 3, 'surinam', 'earth.south-america.surinam.surinam-commewijne', '🗺️', 'División administrativa de primer nivel de Commewijne', 5.766426, -54.886563),
  ('surinam-coronie', 'Coronie', 3, 'surinam', 'earth.south-america.surinam.surinam-coronie', '🗺️', 'División administrativa de primer nivel de Coronie', 5.637799, -56.246631),
  ('surinam-marowijne', 'Marowijne', 3, 'surinam', 'earth.south-america.surinam.surinam-marowijne', '🗺️', 'División administrativa de primer nivel de Marowijne', 5.606311, -54.352318),
  ('surinam-nickerie', 'Nickerie', 3, 'surinam', 'earth.south-america.surinam.surinam-nickerie', '🗺️', 'División administrativa de primer nivel de Nickerie', 5.616638, -56.896585),
  ('surinam-para', 'Para', 3, 'surinam', 'earth.south-america.surinam.surinam-para', '🗺️', 'División administrativa de primer nivel de Para', 5.345509, -55.297635),
  ('surinam-paramaribo', 'Paramaribo', 3, 'surinam', 'earth.south-america.surinam.surinam-paramaribo', '🗺️', 'División administrativa de primer nivel de Paramaribo', 5.838388, -55.167081),
  ('surinam-saramacca', 'Saramacca', 3, 'surinam', 'earth.south-america.surinam.surinam-saramacca', '🗺️', 'División administrativa de primer nivel de Saramacca', 5.696369, -55.608429),
  ('surinam-sipaliwini', 'Sipaliwini', 3, 'surinam', 'earth.south-america.surinam.surinam-sipaliwini', '🗺️', 'División administrativa de primer nivel de Sipaliwini', 3.687815, -56.0254),
  ('surinam-wanica', 'Wanica', 3, 'surinam', 'earth.south-america.surinam.surinam-wanica', '🗺️', 'División administrativa de primer nivel de Wanica', 5.787587, -55.213258),
  ('uruguay-artigas', 'Artigas', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-artigas', '🗺️', 'División administrativa de primer nivel de Uruguay', -30.584072, -56.941168),
  ('uruguay-canelones', 'Canelones', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-canelones', '🗺️', 'División administrativa de primer nivel de Uruguay', -34.543221, -55.943811),
  ('uruguay-cerro-largo', 'Cerro Largo', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-cerro-largo', '🗺️', 'División administrativa de primer nivel de Uruguay', -32.340329, -54.267887),
  ('uruguay-colonia', 'Colonia', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-colonia', '🗺️', 'División administrativa de primer nivel de Uruguay', -34.120434, -57.707162),
  ('uruguay-durazno', 'Durazno', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-durazno', '🗺️', 'División administrativa de primer nivel de Uruguay', -32.958129, -56.103081),
  ('uruguay-flores', 'Flores', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-flores', '🗺️', 'División administrativa de primer nivel de Uruguay', -33.551901, -56.878562),
  ('uruguay-florida', 'Florida', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-florida', '🗺️', 'División administrativa de primer nivel de Uruguay', -33.764146, -55.817283),
  ('uruguay-lavalleja', 'Lavalleja', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-lavalleja', '🗺️', 'División administrativa de primer nivel de Uruguay', -33.977468, -54.876622),
  ('uruguay-maldonado', 'Maldonado', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-maldonado', '🗺️', 'División administrativa de primer nivel de Uruguay', -34.451456, -54.974123),
  ('uruguay-montevideo', 'Montevideo', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-montevideo', '🗺️', 'División administrativa de primer nivel de Uruguay', -34.819986, -56.226836),
  ('uruguay-paysandu', 'Paysandú', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-paysandu', '🗺️', 'División administrativa de primer nivel de Uruguay', -32.024042, -57.222685),
  ('uruguay-rio-negro', 'Río Negro', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-rio-negro', '🗺️', 'División administrativa de primer nivel de Uruguay', -32.891984, -57.494568),
  ('uruguay-rivera', 'Rivera', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-rivera', '🗺️', 'División administrativa de primer nivel de Uruguay', -31.471731, -55.318299),
  ('uruguay-rocha', 'Rocha', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-rocha', '🗺️', 'División administrativa de primer nivel de Uruguay', -33.976315, -53.974269),
  ('uruguay-salto', 'Salto', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-salto', '🗺️', 'División administrativa de primer nivel de Uruguay', -31.306414, -57.046622),
  ('uruguay-san-jose', 'San José', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-san-jose', '🗺️', 'División administrativa de primer nivel de Uruguay', -34.308115, -56.74708),
  ('uruguay-soriano', 'Soriano', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-soriano', '🗺️', 'División administrativa de primer nivel de Uruguay', -33.47786, -57.792045),
  ('uruguay-tacuarembo', 'Tacuarembó', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-tacuarembo', '🗺️', 'División administrativa de primer nivel de Uruguay', -32.048593, -55.67532),
  ('uruguay-treinta-y-tres', 'Treinta y Tres', 3, 'uruguay', 'earth.south-america.uruguay.uruguay-treinta-y-tres', '🗺️', 'División administrativa de primer nivel de Uruguay', -33.079258, -54.225876),
  ('venezuela-amazonas', 'Amazonas', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-amazonas', '🗺️', 'División administrativa de primer nivel de Amazonas', 3.415984, -65.606785),
  ('venezuela-anzoategui', 'Anzoátegui', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-anzoategui', '🗺️', 'División administrativa de primer nivel de Anzoátegui', 8.985117, -64.201653),
  ('venezuela-apure', 'Apure', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-apure', '🗺️', 'División administrativa de primer nivel de Apure', 7.073971, -69.371102),
  ('venezuela-aragua', 'Aragua', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-aragua', '🗺️', 'División administrativa de primer nivel de Aragua', 9.894122, -67.213968),
  ('venezuela-barinas', 'Barinas', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-barinas', '🗺️', 'División administrativa de primer nivel de Barinas', 8.173966, -69.692214),
  ('venezuela-bolivar', 'Bolívar', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-bolivar', '🗺️', 'División administrativa de primer nivel de Bolívar', 5.996917, -63.856251),
  ('venezuela-carabobo', 'Carabobo', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-carabobo', '🗺️', 'División administrativa de primer nivel de Carabobo', 10.197399, -67.972551),
  ('venezuela-cojedes', 'Cojedes', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-cojedes', '🗺️', 'División administrativa de primer nivel de Cojedes', 9.309169, -68.370201),
  ('venezuela-delta-amacuro', 'Delta Amacuro', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-delta-amacuro', '🗺️', 'División administrativa de primer nivel de Delta Amacuro', 8.885721, -61.176356),
  ('venezuela-dependencias-federales', 'Dependencias Federales', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-dependencias-federales', '🗺️', 'División administrativa de primer nivel de Dependencias Federales', 11.56744, -66.390791),
  ('venezuela-distrito-capital', 'Distrito Capital', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-distrito-capital', '🗺️', 'División administrativa de primer nivel de Distrito Capital', 10.472864, -67.012395),
  ('venezuela-falcon', 'Falcón', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-falcon', '🗺️', 'División administrativa de primer nivel de Falcón', 11.248097, -69.76643),
  ('venezuela-guarico', 'Guárico', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-guarico', '🗺️', 'División administrativa de primer nivel de Guárico', 8.831903, -66.40229),
  ('venezuela-la-guaira', 'La Guaira', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-la-guaira', '🗺️', 'División administrativa de primer nivel de La Guaira', 10.509896, -66.861174),
  ('venezuela-lara', 'Lara', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-lara', '🗺️', 'División administrativa de primer nivel de Lara', 10.072262, -69.878729),
  ('venezuela-merida', 'Mérida', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-merida', '🗺️', 'División administrativa de primer nivel de Mérida', 8.430062, -71.229445),
  ('venezuela-miranda', 'Miranda', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-miranda', '🗺️', 'División administrativa de primer nivel de Miranda', 10.292485, -66.324365),
  ('venezuela-monagas', 'Monagas', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-monagas', '🗺️', 'División administrativa de primer nivel de Monagas', 9.351555, -63.029845),
  ('venezuela-nueva-esparta', 'Nueva Esparta', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-nueva-esparta', '🗺️', 'División administrativa de primer nivel de Nueva Esparta', 10.955104, -64.093026),
  ('venezuela-portuguesa', 'Portuguesa', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-portuguesa', '🗺️', 'División administrativa de primer nivel de Portuguesa', 8.968596, -69.356791),
  ('venezuela-sucre', 'Sucre', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-sucre', '🗺️', 'División administrativa de primer nivel de Sucre', 10.399223, -63.189265),
  ('venezuela-tachira', 'Táchira', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-tachira', '🗺️', 'División administrativa de primer nivel de Táchira', 8.004812, -71.903275),
  ('venezuela-trujillo', 'Trujillo', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-trujillo', '🗺️', 'División administrativa de primer nivel de Trujillo', 9.495631, -70.543941),
  ('venezuela-yaracuy', 'Yaracuy', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-yaracuy', '🗺️', 'División administrativa de primer nivel de Yaracuy', 10.304242, -68.728504),
  ('venezuela-zulia', 'Zulia', 3, 'venezuela', 'earth.south-america.venezuela.venezuela-zulia', '🗺️', 'División administrativa de primer nivel de Zulia', 10.103031, -72.018379)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;

-- 127 partidos/municipios bonaerenses que faltaban; 8 ya existían
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji, i.description, i.lat, i.lng
from (values
  ('ba-25-de-mayo', '25 de Mayo', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-25-de-mayo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.527209, -60.230284),
  ('ba-9-de-julio', '9 de Julio', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-9-de-julio', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.481227, -60.975425),
  ('ba-adolfo-alsina', 'Adolfo Alsina', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-adolfo-alsina', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.196762, -63.056055),
  ('ba-adolfo-gonzales-chaves', 'Adolfo Gonzales Chaves', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-adolfo-gonzales-chaves', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.964616, -60.248282),
  ('ba-alberti', 'Alberti', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-alberti', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.036969, -60.281977),
  ('ba-almirante-brown', 'Almirante Brown', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-almirante-brown', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.835619, -58.367373),
  ('ba-arrecifes', 'Arrecifes', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-arrecifes', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.011812, -60.062664),
  ('ba-avellaneda', 'Avellaneda', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-avellaneda', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.678165, -58.341167),
  ('ba-ayacucho', 'Ayacucho', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-ayacucho', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.035431, -58.442557),
  ('ba-azul', 'Azul', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-azul', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.785935, -59.696478),
  ('ba-baradero', 'Baradero', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-baradero', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.931962, -59.492792),
  ('ba-benito-juarez', 'Benito Juárez', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-benito-juarez', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.586111, -59.888398),
  ('ba-berazategui', 'Berazategui', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-berazategui', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.818245, -58.155462),
  ('ba-berisso', 'Berisso', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-berisso', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.909355, -57.82838),
  ('ba-bolivar', 'Bolívar', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-bolivar', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.298948, -61.14986),
  ('ba-bragado', 'Bragado', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-bragado', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.061412, -60.604047),
  ('ba-brandsen', 'Brandsen', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-brandsen', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.22252, -58.175234),
  ('ba-campana', 'Campana', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-campana', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.138389, -58.882957),
  ('ba-canuelas', 'Cañuelas', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-canuelas', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.144804, -58.691094),
  ('ba-capitan-sarmiento', 'Capitán Sarmiento', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-capitan-sarmiento', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.149845, -59.854015),
  ('ba-carlos-casares', 'Carlos Casares', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-carlos-casares', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.749922, -61.374378),
  ('ba-carlos-tejedor', 'Carlos Tejedor', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-carlos-tejedor', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.379745, -62.42979),
  ('ba-carmen-de-areco', 'Carmen de Areco', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-carmen-de-areco', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.406798, -59.884413),
  ('ba-castelli', 'Castelli', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-castelli', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.04149, -57.657425),
  ('ba-chacabuco', 'Chacabuco', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-chacabuco', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.6182, -60.354308),
  ('ba-chascomus', 'Chascomús', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-chascomus', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.618688, -57.903981),
  ('ba-chivilcoy', 'Chivilcoy', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-chivilcoy', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.915487, -59.958419),
  ('ba-colon', 'Colón', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-colon', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.885865, -61.062484),
  ('ba-coronel-de-marina-leonardo-rosales', 'Coronel de Marina Leonardo Rosales', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-coronel-de-marina-leonardo-rosales', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.849077, -61.835584),
  ('ba-coronel-dorrego', 'Coronel Dorrego', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-coronel-dorrego', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.670818, -61.095551),
  ('ba-coronel-pringles', 'Coronel Pringles', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-coronel-pringles', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.147917, -61.264417),
  ('ba-coronel-suarez', 'Coronel Suárez', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-coronel-suarez', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.534856, -61.889092),
  ('ba-daireaux', 'Daireaux', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-daireaux', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.640869, -61.89125),
  ('ba-dolores', 'Dolores', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-dolores', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.398938, -57.631926),
  ('ba-ensenada', 'Ensenada', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-ensenada', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.84215, -57.979109),
  ('ba-escobar', 'Escobar', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-escobar', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.328683, -58.771179),
  ('ba-esteban-echeverria', 'Esteban Echeverría', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-esteban-echeverria', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.831214, -58.476948),
  ('ba-exaltacion-de-la-cruz', 'Exaltación de la Cruz', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-exaltacion-de-la-cruz', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.295134, -59.155946),
  ('ba-ezeiza', 'Ezeiza', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-ezeiza', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.876097, -58.564701),
  ('ba-florencio-varela', 'Florencio Varela', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-florencio-varela', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.877745, -58.258555),
  ('ba-florentino-ameghino', 'Florentino Ameghino', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-florentino-ameghino', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.874106, -62.401716),
  ('ba-general-alvarado', 'General Alvarado', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-alvarado', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.202628, -58.071805),
  ('ba-general-alvear', 'General Alvear', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-alvear', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.034711, -60.133153),
  ('ba-general-arenales', 'General Arenales', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-arenales', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.237902, -61.283381),
  ('ba-general-belgrano', 'General Belgrano', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-belgrano', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.834662, -58.69808),
  ('ba-general-guido', 'General Guido', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-guido', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.666035, -57.995737),
  ('ba-general-juan-madariaga', 'General Juan Madariaga', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-juan-madariaga', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.153516, -57.230661),
  ('ba-general-la-madrid', 'General La Madrid', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-la-madrid', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.356128, -61.344131),
  ('ba-general-las-heras', 'General Las Heras', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-las-heras', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.909424, -58.995447),
  ('ba-general-lavalle', 'General Lavalle', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-lavalle', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.65075, -56.941003),
  ('ba-general-paz', 'General Paz', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-paz', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.466183, -58.389652),
  ('ba-general-pinto', 'General Pinto', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-pinto', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.669622, -62.039853),
  ('ba-general-pueyrredon', 'General Pueyrredón', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-pueyrredon', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.965683, -57.743028),
  ('ba-general-rodriguez', 'General Rodríguez', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-rodriguez', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.650616, -58.987847),
  ('ba-general-san-martin', 'General San Martín', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-san-martin', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.552754, -58.564304),
  ('ba-general-viamonte', 'General Viamonte', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-viamonte', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.997779, -61.049657),
  ('ba-general-villegas', 'General Villegas', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-general-villegas', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.770261, -62.954199),
  ('ba-guamini', 'Guaminí', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-guamini', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.890676, -62.418531),
  ('ba-hipolito-yrigoyen', 'Hipólito Yrigoyen', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-hipolito-yrigoyen', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.259189, -61.660188),
  ('ba-hurlingham', 'Hurlingham', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-hurlingham', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.599283, -58.649525),
  ('ba-ituzaingo', 'Ituzaingó', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-ituzaingo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.636072, -58.68876),
  ('ba-jose-c-paz', 'José C. Paz', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-jose-c-paz', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.511853, -58.777635),
  ('ba-junin', 'Junín', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-junin', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.546475, -61.00525),
  ('ba-la-costa', 'La Costa', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-la-costa', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.697168, -56.71594),
  ('ba-la-matanza', 'La Matanza', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-la-matanza', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.770298, -58.625378),
  ('ba-lanus', 'Lanús', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-lanus', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.705642, -58.394711),
  ('ba-laprida', 'Laprida', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-laprida', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.516506, -60.768148),
  ('ba-las-flores', 'Las Flores', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-las-flores', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.015827, -59.176461),
  ('ba-leandro-n-alem', 'Leandro N. Alem', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-leandro-n-alem', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.498565, -61.612587),
  ('ba-lezama', 'Lezama', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-lezama', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.849208, -57.894844),
  ('ba-lincoln', 'Lincoln', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-lincoln', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.070448, -61.682458),
  ('ba-loberia', 'Lobería', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-loberia', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.090053, -58.69355),
  ('ba-lobos', 'Lobos', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-lobos', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.219586, -59.145742),
  ('ba-lomas-de-zamora', 'Lomas de Zamora', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-lomas-de-zamora', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.754972, -58.424093),
  ('ba-lujan', 'Luján', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-lujan', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.567322, -59.158456),
  ('ba-magdalena', 'Magdalena', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-magdalena', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.185103, -57.686128),
  ('ba-maipu', 'Maipú', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-maipu', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.886933, -57.586119),
  ('ba-malvinas-argentinas', 'Malvinas Argentinas', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-malvinas-argentinas', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.487311, -58.712137),
  ('ba-marcos-paz', 'Marcos Paz', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-marcos-paz', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.814003, -58.847831),
  ('ba-mercedes', 'Mercedes', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-mercedes', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.697321, -59.420481),
  ('ba-merlo', 'Merlo', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-merlo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.711003, -58.741958),
  ('ba-monte', 'Monte', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-monte', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.509827, -58.767236),
  ('ba-monte-hermoso', 'Monte Hermoso', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-monte-hermoso', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.961624, -61.292147),
  ('ba-moreno', 'Moreno', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-moreno', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.610681, -58.810899),
  ('ba-moron', 'Morón', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-moron', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.649386, -58.619832),
  ('ba-navarro', 'Navarro', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-navarro', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.030484, -59.429359),
  ('ba-olavarria', 'Olavarría', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-olavarria', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.857634, -60.670205),
  ('ba-patagones', 'Patagones', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-patagones', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -40.196385, -62.850804),
  ('ba-pehuajo', 'Pehuajó', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-pehuajo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.883621, -61.928126),
  ('ba-pellegrini', 'Pellegrini', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-pellegrini', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.271192, -63.225752),
  ('ba-pergamino', 'Pergamino', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-pergamino', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.836067, -60.544783),
  ('ba-pila', 'Pila', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-pila', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.202984, -58.340443),
  ('ba-pilar', 'Pilar', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-pilar', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.448164, -58.903333),
  ('ba-presidente-peron', 'Presidente Perón', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-presidente-peron', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.929848, -58.398084),
  ('ba-puan', 'Puán', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-puan', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.076076, -63.057433),
  ('ba-punta-indio', 'Punta Indio', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-punta-indio', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.426056, -57.399234),
  ('ba-quilmes', 'Quilmes', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-quilmes', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.734971, -58.276858),
  ('ba-ramallo', 'Ramallo', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-ramallo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.587187, -60.057508),
  ('ba-rauch', 'Rauch', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-rauch', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.572194, -58.944141),
  ('ba-rivadavia', 'Rivadavia', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-rivadavia', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.581057, -63.094761),
  ('ba-rojas', 'Rojas', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-rojas', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.192817, -60.788023),
  ('ba-roque-perez', 'Roque Pérez', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-roque-perez', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.481636, -59.357512),
  ('ba-saavedra', 'Saavedra', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-saavedra', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -37.770638, -62.434383),
  ('ba-saladillo', 'Saladillo', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-saladillo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.676806, -59.702661),
  ('ba-salliquelo', 'Salliqueló', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-salliquelo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.671778, -63.047974),
  ('ba-salto', 'Salto', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-salto', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.271078, -60.305288),
  ('ba-san-andres-de-giles', 'San Andrés de Giles', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-andres-de-giles', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.437731, -59.473199),
  ('ba-san-antonio-de-areco', 'San Antonio de Areco', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-antonio-de-areco', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.220757, -59.519443),
  ('ba-san-cayetano', 'San Cayetano', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-cayetano', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.389073, -59.586326),
  ('ba-san-fernando', 'San Fernando', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-fernando', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.155836, -58.534582),
  ('ba-san-isidro', 'San Isidro', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-isidro', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.486893, -58.537209),
  ('ba-san-miguel', 'San Miguel', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-miguel', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.552134, -58.691784),
  ('ba-san-nicolas', 'San Nicolás', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-nicolas', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.482987, -60.293149),
  ('ba-san-pedro', 'San Pedro', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-pedro', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.780986, -59.782626),
  ('ba-san-vicente', 'San Vicente', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-san-vicente', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -35.071509, -58.431812),
  ('ba-suipacha', 'Suipacha', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-suipacha', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.748574, -59.703386),
  ('ba-tapalque', 'Tapalqué', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tapalque', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.347144, -60.131065),
  ('ba-tigre', 'Tigre', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tigre', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.38202, -58.588174),
  ('ba-tordillo', 'Tordillo', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tordillo', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.390515, -57.273812),
  ('ba-tornquist', 'Tornquist', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tornquist', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.257642, -62.290566),
  ('ba-trenque-lauquen', 'Trenque Lauquen', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-trenque-lauquen', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.056766, -62.63508),
  ('ba-tres-arroyos', 'Tres Arroyos', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tres-arroyos', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -38.511814, -60.237417),
  ('ba-tres-de-febrero', 'Tres de Febrero', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tres-de-febrero', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.596062, -58.579169),
  ('ba-tres-lomas', 'Tres Lomas', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-tres-lomas', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -36.4971, -62.863908),
  ('ba-vicente-lopez', 'Vicente López', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-vicente-lopez', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -34.526555, -58.50441),
  ('ba-villarino', 'Villarino', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-villarino', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -39.128565, -62.724599),
  ('ba-zarate', 'Zárate', 4, 'buenos-aires', 'earth.south-america.argentina.buenos-aires.ba-zarate', '🗺️', 'Partido o municipio de la Provincia de Buenos Aires', -33.997088, -59.128218)
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;
-- PRODUCTION_GEOGRAPHY_END


alter table public.polls
  add column if not exists category text not null default 'comunidad',
  add column if not exists max_choices smallint;

alter table public.polls drop constraint if exists polls_category_chk;
alter table public.polls add constraint polls_category_chk check (
  category in (
    'comunidad', 'ambiente', 'salud', 'educacion', 'transporte',
    'cultura', 'deportes', 'economia', 'tecnologia', 'seguridad'
  )
);

alter table public.polls drop constraint if exists polls_max_choices_chk;
alter table public.polls add constraint polls_max_choices_chk check (
  (type = 'multiple' and max_choices between 1 and 10)
  or (type <> 'multiple' and max_choices is null)
);

comment on column public.polls.category is
  'Tema principal de la encuesta, para descubrir y filtrar sin cambiar su alcance geográfico.';
comment on column public.polls.max_choices is
  'Tope de opciones seleccionables en encuestas multiple; NULL significa sin tope.';

-- El límite de opciones múltiples debe ser imposible de superar por una acción
-- manipulada desde el navegador. El lock sólo serializa votos del mismo usuario
-- en la misma encuesta, no a toda la encuesta.
create or replace function public.prepare_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls%rowtype;
  v_options int;
begin
  perform pg_advisory_xact_lock(hashtext(new.poll_id::text || ':' || new.user_id::text));

  select * into v_poll from public.polls where id = new.poll_id;
  if not found then
    raise exception 'La encuesta no existe' using errcode = 'foreign_key_violation';
  end if;

  if v_poll.status <> 'active' then
    raise exception 'Esta encuesta está cerrada' using errcode = 'check_violation';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'El plazo para votar ya venció' using errcode = 'check_violation';
  end if;

  if v_poll.type = 'binary' then
    select count(*) into v_options from public.poll_options where poll_id = v_poll.id;
    if v_options <> 2 then
      raise exception 'La encuesta binaria está mal configurada' using errcode = 'check_violation';
    end if;
  end if;

  if v_poll.type = 'multiple' and v_poll.max_choices is not null
     and (select count(*) from public.poll_votes where poll_id = new.poll_id and user_id = new.user_id)
         >= v_poll.max_choices then
    raise exception 'Esta encuesta permite elegir hasta % opciones', v_poll.max_choices
      using errcode = 'check_violation';
  end if;

  new.poll_type := v_poll.type;
  return new;
end;
$$;

-- `poll_feed` ahora devuelve y filtra la categoría. Se reemplaza la firma para
-- que una llamada con cuatro argumentos siga funcionando gracias al default.
drop function if exists public.poll_feed(uuid, int, timestamptz, uuid);
create function public.poll_feed(
  p_community      uuid,
  p_limit          int default 20,
  p_before_created timestamptz default null,
  p_before_id      uuid default null,
  p_category       text default null
)
returns table (
  id           uuid,
  question     text,
  description  text,
  type         text,
  category     text,
  status       text,
  closes_at    timestamptz,
  created_at   timestamptz,
  option_count bigint,
  total_votes  bigint,
  has_voted    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.question, p.description, p.type, p.category, p.status, p.closes_at, p.created_at,
    (select count(*) from public.poll_options o where o.poll_id = p.id),
    (select count(*) from public.poll_votes v where v.poll_id = p.id),
    (auth.uid() is not null and exists (
      select 1 from public.poll_votes v
      where v.poll_id = p.id and v.user_id = auth.uid()
    ))
  from public.polls p
  where p.community_id = p_community
    and (p.status <> 'removed' or public.is_moderator(auth.uid()))
    and (p_category is null or p.category = p_category)
    and (
      p_before_created is null
      or (p.created_at, p.id) < (p_before_created, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.poll_feed(uuid, int, timestamptz, uuid, text) to authenticated, anon;

-- Encuestas editoriales iniciales: neutrales, concretas y una por tema/nivel.
-- No tienen autor porque son propuestas de inicio de Agorbis, no atribuidas a
-- una persona. Son idempotentes para que la migración se pueda reintentar.
insert into public.polls (id, community_id, question, description, type, category, max_choices, closes_at, results_visibility)
select p.id::uuid, c.id, p.question, p.description, p.type, p.category, p.max_choices::smallint,
       now() + (p.closes_in_days || ' days')::interval, 'after_vote'
from (values
  ('a1000000-0000-4000-8000-000000000001', 'mar-del-plata',
   '¿Qué mejora debería priorizar Mar del Plata para moverse mejor durante todo el año?',
   'Elegí hasta dos opciones pensando en quienes viven y trabajan en la ciudad, no sólo en la temporada de verano.',
   'multiple', 'transporte', 2, 60),
  ('a1000000-0000-4000-8000-000000000002', 'mar-del-plata',
   '¿Qué acción debería ser prioritaria para cuidar las playas de Mar del Plata?',
   'Una prioridad concreta para orientar conversaciones y futuros proyectos comunitarios.',
   'single', 'ambiente', null, 60),
  ('a1000000-0000-4000-8000-000000000003', 'miramar',
   '¿Qué ayudaría más a que Miramar tenga actividad económica durante todo el año?',
   'Elegí una opción; la pregunta apunta a diversificar sin perder la identidad local.',
   'single', 'economia', null, 60),
  ('a1000000-0000-4000-8000-000000000004', 'buenos-aires',
   '¿Qué debería priorizar la Provincia de Buenos Aires para mejorar el acceso a la salud mental?',
   'La encuesta no reemplaza políticas públicas: permite conocer qué necesidad percibe primero la comunidad.',
   'single', 'salud', null, 75),
  ('a1000000-0000-4000-8000-000000000005', 'buenos-aires',
   '¿Qué mejora del transporte interurbano debería priorizar la Provincia de Buenos Aires?',
   'Elegí hasta dos opciones que tendrían mayor impacto para viajar entre ciudades y partidos.',
   'multiple', 'transporte', 2, 75),
  ('a1000000-0000-4000-8000-000000000006', 'argentina',
   '¿Te gustaría que Lionel Scaloni dirija a la selección argentina en el Mundial 2030?',
   'Es una consulta de opinión deportiva, no una afirmación sobre una decisión de la AFA.',
   'binary', 'deportes', null, 120),
  ('a1000000-0000-4000-8000-000000000007', 'argentina',
   '¿Qué medida debería ser la primera prioridad para mejorar la escuela secundaria?',
   'Elegí la opción que considerás más urgente a escala nacional.',
   'single', 'educacion', null, 90),
  ('a1000000-0000-4000-8000-000000000008', 'uruguay',
   '¿Qué debería priorizar Uruguay para que más jóvenes puedan estudiar y trabajar en su departamento?',
   'Una pregunta abierta a residentes de todos los departamentos; los resultados se podrán leer por comunidad.',
   'single', 'educacion', null, 90),
  ('a1000000-0000-4000-8000-000000000009', 'south-america',
   '¿Los países de América del Sur deberían coordinar metas comunes para proteger ríos y bosques compartidos?',
   'La consulta busca una postura sobre cooperación regional ambiental.',
   'binary', 'ambiente', null, 120),
  ('a1000000-0000-4000-8000-000000000010', 'south-america',
   '¿Qué área de cooperación tecnológica regional debería tener prioridad?',
   'Elegí una sola opción para comparar intereses entre los países de la región.',
   'single', 'tecnologia', null, 90),
  ('a1000000-0000-4000-8000-000000000011', 'earth',
   '¿La humanidad debería compartir alertas tempranas y datos abiertos ante desastres climáticos?',
   'La pregunta se refiere a cooperación internacional para anticipar inundaciones, incendios, olas de calor y otros eventos.',
   'binary', 'ambiente', null, 120),
  ('a1000000-0000-4000-8000-000000000012', 'earth',
   '¿Qué regla debería guiar primero el uso de inteligencia artificial en servicios públicos?',
   'Elegí la protección que te parece indispensable cuando una herramienta automatizada afecta a personas.',
   'single', 'tecnologia', null, 120)
) as p (id, community_slug, question, description, type, category, max_choices, closes_in_days)
join public.communities c on c.slug = p.community_slug
on conflict (id) do nothing;

insert into public.poll_options (id, poll_id, label, sort_order)
values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Más frecuencia y recorridos de colectivos', 0),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Conexiones seguras para caminar y usar bicicleta', 1),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'Mejor conexión con los barrios alejados', 2),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'Información y horarios confiables en tiempo real', 3),
  ('b1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 'Reducir residuos que llegan al mar', 0),
  ('b1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', 'Reforzar la prevención de la erosión costera', 1),
  ('b1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000002', 'Mejorar los accesos públicos y el cuidado de los balnearios', 2),
  ('b1000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000003', 'Impulsar turismo de naturaleza y cultura fuera del verano', 0),
  ('b1000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000003', 'Acompañar comercios y emprendimientos locales', 1),
  ('b1000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000003', 'Mejorar conectividad y espacios de trabajo/estudio', 2),
  ('b1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000004', 'Más equipos interdisciplinarios en centros de salud', 0),
  ('b1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000004', 'Atención temprana para adolescentes y jóvenes', 1),
  ('b1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000004', 'Líneas de atención y seguimiento accesibles', 2),
  ('b1000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000005', 'Frecuencias y horarios coordinados', 0),
  ('b1000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-000000000005', 'Tarifas integradas entre medios de transporte', 1),
  ('b1000000-0000-4000-8000-000000000016', 'a1000000-0000-4000-8000-000000000005', 'Mejor estado y accesibilidad de terminales y paradas', 2),
  ('b1000000-0000-4000-8000-000000000017', 'a1000000-0000-4000-8000-000000000006', 'Sí, me gustaría que continúe', 0),
  ('b1000000-0000-4000-8000-000000000018', 'a1000000-0000-4000-8000-000000000006', 'No, preferiría otro proyecto deportivo', 1),
  ('b1000000-0000-4000-8000-000000000019', 'a1000000-0000-4000-8000-000000000007', 'Fortalecer la formación y el acompañamiento docente', 0),
  ('b1000000-0000-4000-8000-000000000020', 'a1000000-0000-4000-8000-000000000007', 'Recuperar días y horas efectivas de clase', 1),
  ('b1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000007', 'Mejorar infraestructura, conectividad y materiales', 2),
  ('b1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000008', 'Más becas, transporte y apoyos para sostener la trayectoria', 0),
  ('b1000000-0000-4000-8000-000000000023', 'a1000000-0000-4000-8000-000000000008', 'Prácticas formativas y primer empleo local', 1),
  ('b1000000-0000-4000-8000-000000000024', 'a1000000-0000-4000-8000-000000000008', 'Más oferta educativa y conectividad fuera de Montevideo', 2),
  ('b1000000-0000-4000-8000-000000000025', 'a1000000-0000-4000-8000-000000000009', 'Sí, con metas y datos públicos compartidos', 0),
  ('b1000000-0000-4000-8000-000000000026', 'a1000000-0000-4000-8000-000000000009', 'No, cada país debería definirlo por separado', 1),
  ('b1000000-0000-4000-8000-000000000027', 'a1000000-0000-4000-8000-000000000010', 'Conectividad asequible en zonas rurales y periféricas', 0),
  ('b1000000-0000-4000-8000-000000000028', 'a1000000-0000-4000-8000-000000000010', 'Formación digital y científica para jóvenes', 1),
  ('b1000000-0000-4000-8000-000000000029', 'a1000000-0000-4000-8000-000000000010', 'Infraestructura y servicios digitales públicos interoperables', 2),
  ('b1000000-0000-4000-8000-000000000030', 'a1000000-0000-4000-8000-000000000011', 'Sí, debería ser una prioridad', 0),
  ('b1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000011', 'No, debería quedar principalmente en cada país', 1),
  ('b1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000012', 'Que las decisiones sean explicables y auditables', 0),
  ('b1000000-0000-4000-8000-000000000033', 'a1000000-0000-4000-8000-000000000012', 'Que se protejan los datos personales', 1),
  ('b1000000-0000-4000-8000-000000000034', 'a1000000-0000-4000-8000-000000000012', 'Que siempre exista revisión humana para decisiones relevantes', 2)
on conflict (id) do nothing;

commit;
