-- =============================================================================
-- Agorbis · seed
-- -----------------------------------------------------------------------------
-- Generado parcialmente por scripts/gen-geo.mjs (jerarquía geográfica) y
-- completado a mano (community_info y contenido demo).
--
-- ATENCIÓN: la sección de usuarios demo escribe en auth.users. Está pensada
-- SÓLO para desarrollo local (`supabase db reset`). No correr en producción.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Subconjunto geográfico base histórico: 1 global + 6 continentes + 195 países
-- + 24 subdivisiones argentinas + 10 municipios bonaerenses
-- = 236 comunidades. No es el total actual: las migraciones corren antes que
-- el seed y completan el baseline 0058 hasta 3.901 comunidades.
-- -----------------------------------------------------------------------------

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

-- =============================================================================
-- Usuarios demo
-- -----------------------------------------------------------------------------
-- Escribe directamente en auth.users: SÓLO para desarrollo local.
-- Contraseña de todos: AgorbisLocal-2026!
-- El trigger `handle_new_user` crea el profile; después le asignamos residencia
-- y rol. Los UUID son fijos para poder referenciarlos desde el contenido demo.
-- =============================================================================
-- Las columnas de token van en cadena vacía y NUNCA en NULL: GoTrue las lee
-- como `string` (no `sql.NullString`) y un NULL hace fallar el escaneo de la
-- fila entera. El síntoma es un HTTP 500 `unexpected_failure` / "Database error
-- querying schema" al iniciar sesión — no un error de credenciales, lo que
-- vuelve el diagnóstico muy confuso.
--
-- `extensions.crypt` / `extensions.gen_salt`: en Supabase cloud pgcrypto vive en
-- el esquema `extensions`, que no está en el search_path del SQL Editor.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, email_change_confirm_status,
  phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id::uuid,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt('AgorbisLocal-2026!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', u.username, 'display_name', u.display_name),
  now() - interval '60 days',
  now(),
  '', '', '', '',
  '', 0,
  '', '', '',
  false, false
from (values
  ('11111111-1111-4111-8111-111111111111', 'admin@agorbis.test',     'admin_geo',    'Equipo Agorbis'),
  ('22222222-2222-4222-8222-222222222222', 'moderador@agorbis.test', 'mod_nacional', 'Moderación Argentina'),
  ('33333333-3333-4333-8333-333333333333', 'sofia@agorbis.test',     'sofia_mdq',    'Sofía Rearte'),
  ('44444444-4444-4444-8444-444444444444', 'bruno@agorbis.test',     'bruno_lp',     'Bruno Achával'),
  ('55555555-5555-4555-8555-555555555555', 'carla@agorbis.test',     'carla_cba',    'Carla Ferreyra'),
  ('66666666-6666-4666-8666-666666666666', 'diego@agorbis.test',     'diego_mza',    'Diego Olguín'),
  ('77777777-7777-4777-8777-777777777777', 'elena@agorbis.test',     'elena_caba',   'Elena Bosch'),
  ('88888888-8888-4888-8888-888888888888', 'flor@agorbis.test',      'flor_tandil',  'Florencia Duarte')
) as u (id, email, username, display_name)
on conflict (id) do nothing;

-- Identidad de email: sin esto GoTrue no permite iniciar sesión con contraseña.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email like '%@agorbis.test'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- Factores TOTP locales de las dos cuentas privilegiadas. Los secretos son
-- deliberadamente públicos y exclusivos del seed de desarrollo; permiten
-- recorrer el challenge real sin debilitar el contrato de producción. La
-- migración 0042 exige además que el factor haya sido aprobado por el step-up
-- server-side antes de reconocer una sesión moderadora.
insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status,
  created_at, updated_at, secret
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'Agorbis · admin local', 'totp', 'verified', now(), now(),
    'JBSWY3DPEHPK3PXP'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '22222222-2222-4222-8222-222222222222',
    'Agorbis · moderación local', 'totp', 'verified', now(), now(),
    'KRUGS4ZANFZSAYJA'
  )
on conflict (id) do update
  set user_id = excluded.user_id,
      friendly_name = excluded.friendly_name,
      factor_type = excluded.factor_type,
      status = excluded.status,
      updated_at = excluded.updated_at,
      secret = excluded.secret;

insert into private.privileged_mfa_factors (factor_id, user_id)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '22222222-2222-4222-8222-222222222222'
  )
on conflict (factor_id) do update
  set user_id = excluded.user_id,
      approved_at = statement_timestamp();

-- Residencia y roles. Al pasar de NULL a una comunidad, el trigger de
-- `member_count` propaga el +1 por toda la cadena ancestral.
update public.profiles p
   set home_community_id = c.id,
       role              = d.role,
       bio               = d.bio
from (values
  ('admin_geo',    'mar-del-plata', 'admin',     'Cuidamos que esto sea un lugar habitable para todos.'),
  ('mod_nacional', 'argentina',     'moderator', 'Modero los espacios nacionales. Escribime si algo no cierra.'),
  ('sofia_mdq',    'mar-del-plata', 'user',      'Bioquímica, ciclista urbana y fanática del invierno en la costa.'),
  ('bruno_lp',     'la-plata',      'user',      'Arquitecto. Me obsesionan las veredas y el arbolado urbano.'),
  ('carla_cba',    'cordoba',       'user',      'Docente de secundaria. Vengo por la parte de educación.'),
  ('diego_mza',    'mendoza',       'user',      'Ingeniero en recursos hídricos. El agua es todo.'),
  ('elena_caba',   'caba',          'user',      'Trabajo en salud pública. Porteña de Villa Crespo.'),
  ('flor_tandil',  'tandil',        'user',      'Estudiante de veterinaria en Tandil.')
) as d (username, community_slug, role, bio)
join public.communities c on c.slug = d.community_slug
where p.username = d.username;

-- Las cuentas demo representan personas adultas que ya aceptaron las versiones
-- legales y el aviso de transferencias vigentes. Esto evita que los recorridos
-- locales/E2E empiecen en el gate; no se usa para altas reales ni producción.
insert into public.user_legal_acceptances (
  user_id, document_type, version, minimum_age_attested, accepted_at
)
select p.id, d.document_type, d.version, true, now()
from public.profiles p
cross join public.legal_document_versions d
where p.username in (
  'admin_geo', 'mod_nacional', 'sofia_mdq', 'bruno_lp',
  'carla_cba', 'diego_mza', 'elena_caba', 'flor_tandil'
)
  and d.is_current
  and d.effective_at <= now()
on conflict (user_id, document_type, version) do nothing;

insert into public.user_international_transfer_consents (
  user_id, notice_version, notice_hash, locale, source, accepted_at
)
select p.id, n.version, n.content_hash, 'es', 'account_gate', now()
from public.profiles p
cross join public.international_transfer_notice_versions n
where p.username in (
  'admin_geo', 'mod_nacional', 'sofia_mdq', 'bruno_lp',
  'carla_cba', 'diego_mza', 'elena_caba', 'flor_tandil'
)
  and n.is_current
  and n.effective_at <= now()
on conflict (user_id, notice_version) do nothing;

-- Algunas comunidades seguidas (leen, pero no votan ni comentan ahí).
insert into public.follows (user_id, community_id)
select p.id, c.id
from (values
  ('sofia_mdq',   'necochea'),
  ('sofia_mdq',   'caba'),
  ('bruno_lp',    'mar-del-plata'),
  ('carla_cba',   'argentina'),
  ('diego_mza',   'chile'),
  ('elena_caba',  'uruguay'),
  ('flor_tandil', 'balcarce')
) as f (username, community_slug)
join public.profiles p   on p.username = f.username
join public.communities c on c.slug = f.community_slug
on conflict do nothing;

-- Opt-in de visibilidad en el listado de "Miembros". Sin fila la membresía es
-- anónima; sólo persistimos las excepciones públicas y volver a anónimo elimina
-- la fila. La preferencia sigue siendo independiente por comunidad.
insert into public.community_visibility (user_id, community_id, is_anonymous)
select p.id, c.id, false
from (values
  ('diego_mza',   'mendoza'),
  ('elena_caba',  'caba'),
  ('flor_tandil', 'tandil')
) as f (username, community_slug)
join public.profiles p    on p.username = f.username
join public.communities c on c.slug = f.community_slug
on conflict (user_id, community_id) do nothing;

-- =============================================================================
-- community_info · "la wiki de lo esencial"
-- Las 7 categorías para Tierra, América del Sur, Argentina, Buenos Aires y
-- Mar del Plata. Una sola entrada por categoría: sólo lo más importante.
-- =============================================================================
insert into public.community_info (community_id, category, title, content, updated_by)
select c.id, i.category, i.title, i.content, a.id
from (values

-- ---------------------------------------------------------------- Tierra ----
('earth', 'historia', 'Doscientos mil años en una frase',
 'El Homo sapiens apareció en África hace unos 300.000 años y para el 10.000 a.C. ya había caminado hasta el extremo sur de América. Todo lo demás pasó muy rápido: la agricultura hace 12.000 años, la escritura hace 5.000, la imprenta hace 600, la electricidad hace 150, internet hace 40. Somos una especie jovencísima que en el último siglo aprendió a modificar el clima de su propio planeta y a salir de él. La historia de la humanidad es, sobre todo, la historia de grupos cada vez más grandes aprendiendo a cooperar entre desconocidos.'),
('earth', 'cultura', 'Siete mil idiomas, una sola conversación',
 'Se hablan cerca de 7.000 idiomas, pero casi la mitad de la humanidad usa alguna de las diez lenguas más habladas. Cada dos semanas muere un idioma y con él se pierde una manera entera de nombrar el mundo. Al mismo tiempo, nunca fuimos tan capaces de entendernos: la traducción automática, la música y las imágenes cruzan fronteras que los pasaportes todavía no cruzan. La cultura global no es un idioma único, es la costumbre nueva de escuchar a alguien que vive a doce husos horarios de distancia.'),
('earth', 'geografia', 'Un planeta de agua con manchas de tierra',
 'La superficie terrestre es 71% océano y 29% continentes. Cinco océanos, seis continentes habitados, unas 195 naciones reconocidas. El punto más alto es el Everest (8.849 m) y el más profundo el abismo Challenger (unos 10.900 m bajo el mar): entre ambos hay menos de 20 km, una capa finísima comparada con los 12.742 km de diámetro del planeta. Toda la vida que conocemos ocurre en esa película delgada. La atmósfera respirable no llega a los 10 km de altura.'),
('earth', 'economia', 'Cien billones de dólares al año',
 'El producto bruto mundial ronda los 105 billones de dólares anuales. Está repartido de manera muy desigual: el 10% más rico concentra alrededor del 52% del ingreso global, mientras cerca de 700 millones de personas viven bajo la línea de pobreza extrema. La buena noticia es la tendencia: esa cifra era de 1.900 millones en 1990. La economía mundial dejó de ser mayormente agrícola o industrial y hoy es principalmente de servicios, con el comercio internacional moviendo casi un cuarto de todo lo que se produce.'),
('earth', 'gastronomia', 'Todo el mundo come lo mismo, de maneras distintas',
 'Tres cultivos (arroz, trigo y maíz) aportan cerca del 40% de las calorías que consume la humanidad. A partir de esa base común, cada región construyó algo irrepetible: el pan fermentado del Creciente Fértil, la nixtamalización mesoamericana del maíz, el arroz al vapor del este asiático, la fermentación de la soja, el asado a las brasas. El intercambio colombino de 1492 rediseñó todas las cocinas del mundo: no hay cocina italiana sin tomate americano ni cocina peruana sin limón asiático.'),
('earth', 'simbolo', 'La canica azul',
 'En diciembre de 1972 la tripulación del Apolo 17 sacó la foto conocida como Blue Marble: la Tierra completa, iluminada de lleno, sin fronteras visibles. Es probablemente la imagen más reproducida de la historia y cambió algo en la manera en que nos pensamos. Cuatro años después, Carl Sagan pidió que la Voyager 1 girara la cámara desde 6.000 millones de kilómetros: en esa foto la Tierra ocupa 0,12 píxeles. La llamó el punto azul pálido. Sigue siendo el mejor argumento a favor de llevarnos bien.'),
('earth', 'dato_curioso', 'Somos el 0,01% de la vida, y pesamos como para notarlo',
 'Toda la humanidad representa apenas el 0,01% de la biomasa del planeta. Sin embargo, entre nosotros y nuestro ganado sumamos el 96% de la biomasa de todos los mamíferos: los mamíferos salvajes son el 4% restante. Otro dato para el mismo estante: el peso combinado de todo lo que la humanidad fabricó (edificios, rutas, plástico, máquinas) ya supera al de toda la biomasa viva del planeta. Ese cruce ocurrió alrededor de 2020.'),

-- -------------------------------------------------------- América del Sur ----
('south-america', 'historia', 'De Caral a las independencias',
 'La ciudad de Caral, en la costa peruana, es contemporánea de las pirámides de Egipto: tiene unos 5.000 años. Sobre esa base larguísima crecieron los moche, los tiahuanaco, los muiscas y finalmente el Tahuantinsuyo inca, el imperio más extenso de la América precolombina. La conquista ibérica del siglo XVI y los tres siglos coloniales terminaron entre 1810 y 1825, cuando San Martín y Bolívar cerraron la independencia continental. El siglo XX trajo migraciones masivas, dictaduras y, desde los años ochenta, el período democrático más largo de la historia de la región.'),
('south-america', 'cultura', 'Dos idiomas grandes y cientos de idiomas propios',
 'El portugués y el español dominan el mapa, pero el quechua lo hablan unos 8 millones de personas, el guaraní es cooficial en Paraguay y el aimara sigue vivo en el altiplano. La región exportó al mundo el tango, la samba, la cumbia, la bossa nova y el realismo mágico. También un modo de habitar el espacio público: la plaza, el carnaval, la sobremesa larga. Es una cultura profundamente mestiza, hecha de pueblos originarios, herencia africana e inmigración europea y asiática.'),
('south-america', 'geografia', 'La cordillera, la selva y el río',
 'Diecisiete millones de kilómetros cuadrados sostenidos por tres estructuras enormes: los Andes, que corren 7.000 km de norte a sur y son la cadena montañosa continental más larga del planeta; la Amazonía, la mayor selva tropical del mundo, que produce el río más caudaloso de la Tierra; y las llanuras del Plata y del Orinoco. En el medio caben el desierto más árido del mundo (Atacama), el salar más grande (Uyuni) y el salto de agua más alto (Salto Ángel, 979 m).'),
('south-america', 'economia', 'La despensa y la mina del mundo',
 'La región produce buena parte de la soja, la carne vacuna, el café, el cobre y el litio del planeta. Brasil concentra alrededor de la mitad del producto bruto sudamericano. El desafío histórico es el mismo desde hace un siglo: depender del precio de las materias primas expone a las economías a ciclos de auge y crisis muy violentos. El llamado triángulo del litio (Argentina, Bolivia, Chile) tiene más de la mitad de las reservas mundiales de un mineral clave para la transición energética.'),
('south-america', 'gastronomia', 'La papa, el maíz y el fuego',
 'Sudamérica le dio al mundo la papa (hay más de 4.000 variedades andinas), el tomate, el maíz, el cacao, el maní, la quinoa y el ají. La cocina peruana, cruzada con influencia japonesa y china, se convirtió en una de las más reconocidas del planeta. El asado rioplatense, la feijoada brasileña, el ceviche, las arepas y el mate son marcadores identitarios tan fuertes como cualquier bandera. El mate, además, es de las pocas bebidas del mundo que se toma obligatoriamente de a varios.'),
('south-america', 'simbolo', 'El cóndor',
 'El cóndor andino tiene más de tres metros de envergadura y puede planear cinco horas sin batir las alas, aprovechando las corrientes de la cordillera. Aparece en los escudos de Bolivia, Chile, Colombia y Ecuador. Para las culturas andinas representa el mundo de arriba, el hanan pacha. Es también una especie amenazada, lo que le agrega al símbolo una capa incómoda y actual: lo que nos representa es exactamente lo que estamos poniendo en riesgo.'),
('south-america', 'dato_curioso', 'El continente que se mueve más rápido de lo que se ve',
 'La placa sudamericana se desplaza hacia el oeste y choca contra la placa de Nazca a razón de unos 7 centímetros por año. Esa colisión es la que levanta los Andes y la que hace que Chile y Perú concentren varios de los terremotos más fuertes jamás registrados, incluido el de Valdivia de 1960, magnitud 9,5: el más potente medido en la historia. Los Andes siguen creciendo mientras leés esto.'),

-- ------------------------------------------------------------- Argentina ----
('argentina', 'historia', 'De la Revolución de Mayo a la democracia larga',
 'El 25 de mayo de 1810 el Cabildo de Buenos Aires desplazó al virrey; la independencia se declaró en Tucumán el 9 de julio de 1816. Siguieron cincuenta años de guerras entre unitarios y federales hasta la organización nacional de 1853-1880. Entre 1880 y 1930 llegaron más de seis millones de inmigrantes, sobre todo italianos y españoles, y el país se volvió uno de los más ricos del mundo. El siglo XX alternó gobiernos civiles y seis golpes militares; la última dictadura (1976-1983) dejó 30.000 desaparecidos. Desde el 10 de diciembre de 1983 rige el período democrático ininterrumpido más largo de la historia argentina.'),
('argentina', 'cultura', 'Tango, fútbol, mate y sobremesa',
 'El tango nació en los arrabales del Río de la Plata a fines del siglo XIX y es Patrimonio Inmaterial de la Humanidad. La literatura argentina le dio al mundo a Borges, Cortázar y Sarmiento; el cine ganó dos Oscar; el rock nacional es una tradición propia de más de cincuenta años. El fútbol funciona como lenguaje común y como religión civil. Y está el voseo: el uso del vos en lugar del tú, con su conjugación propia (vení, mirá, sos), que le da al habla argentina un sonido inconfundible.'),
('argentina', 'geografia', 'Del trópico al hielo continental',
 'Con 2,78 millones de km² es el octavo país más extenso del mundo y el segundo de Sudamérica. Mide unos 3.700 km de norte a sur, lo que le da desde selva subtropical en Misiones hasta glaciares en Santa Cruz. Tiene el punto más alto del hemisferio sur y occidental (Aconcagua, 6.961 m) y la depresión más profunda de América (Laguna del Carbón, 105 m bajo el nivel del mar), ambos en el mismo país y a menos de 1.400 km uno del otro. La Pampa húmeda, en el centro, es una de las llanuras más fértiles del planeta.'),
('argentina', 'economia', 'Campo, litio, energía y una inflación crónica',
 'Argentina es de los mayores exportadores mundiales de harina y aceite de soja, maíz, carne vacuna y limones. Vaca Muerta, en Neuquén, es la segunda reserva mundial de shale gas y la cuarta de shale oil. El noroeste concentra parte del triángulo del litio. Todo eso convive con un problema macroeconómico persistente: la Argentina tuvo inflación de tres dígitos en varios períodos y una historia de crisis recurrentes, de las cuales la de 2001 fue la más severa. Entender el país exige sostener las dos cosas a la vez.'),
('argentina', 'gastronomia', 'El asado no es una comida, es un formato',
 'El asado organiza el domingo, la amistad y la discusión: alguien enciende el fuego, el resto opina. Se come vacío, asado de tira, chorizo y morcilla, con chimichurri y ensalada. Alrededor giran las empanadas (cada provincia jura tener la versión correcta), el locro del 25 de mayo, la milanesa, el dulce de leche, el alfajor y la pizza de molde heredada de la inmigración italiana. El mate se toma en ronda y de la misma bombilla. Y el vino, sobre todo el malbec mendocino, dejó de ser local para volverse identidad exportable.'),
('argentina', 'simbolo', 'La escarapela y el sol de mayo',
 'La bandera celeste y blanca fue creada por Manuel Belgrano en 1812 a orillas del río Paraná, en Rosario. El sol de mayo del centro, con sus 32 rayos alternados rectos y flamígeros, se agregó en 1818 y remite tanto a Inti, el dios solar incaico, como al sol que según la tradición se abrió entre las nubes durante la Revolución de Mayo. La escarapela usa los mismos colores y se prende en el pecho cada mayo. Nadie termina de ponerse de acuerdo sobre el origen exacto del celeste, y eso también es muy argentino.'),
('argentina', 'dato_curioso', 'Un país con huso horario propio y sin horario de verano',
 'Argentina está en UTC-3 todo el año, aunque por su longitud geográfica le correspondería UTC-4. Es decir: el país vive oficialmente una hora adelantado respecto de su sol. Por eso en verano anochece tan tarde en la Patagonia, donde en diciembre hay luz hasta pasadas las 22. El horario de verano se aplicó y se derogó tantas veces desde 1930 que se volvió un tema de debate recurrente. La última vez que se usó fue en 2009.'),

-- --------------------------------------------------- Provincia de Buenos Aires ----
('buenos-aires', 'historia', 'La provincia que fue casi todo el país',
 'Después de 1810 la provincia de Buenos Aires concentró la aduana, el puerto y buena parte del poder, lo que la enfrentó durante décadas con el Interior. Recién en 1880, con la federalización de la ciudad de Buenos Aires, la provincia se quedó sin capital y fundó La Plata desde cero en 1882: una ciudad diseñada en un damero perfecto con diagonales, pensada como manifiesto del positivismo de la época. El siglo XX la convirtió en el corazón industrial del país y en destino de las grandes migraciones internas de los años cuarenta y cincuenta.'),
('buenos-aires', 'cultura', 'El conurbano, el interior y la costa',
 'No hay una sola cultura bonaerense: hay al menos tres. El conurbano, donde vive la mayoría, con su densidad, su música y su enorme capacidad de invención. El interior agrícola, de pueblos de estación de tren, club social y fiesta patronal. Y la costa atlántica, que se duplica en población cada enero. La provincia produjo buena parte del rock argentino, casi todos los grandes clubes de fútbol del país y una tradición literaria propia que va de Hernández a Fogwill.'),
('buenos-aires', 'geografia', 'Trescientos siete mil kilómetros de llanura',
 'Con 307.571 km² es la provincia más extensa después de las patagónicas y sería el país número 68 del mundo por superficie. Es casi toda llanura pampeana, con dos excepciones: los sistemas serranos de Tandilia (el más antiguo del país, más de 2.000 millones de años) y Ventania, cuyo cerro Tres Picos llega a 1.239 m. Tiene 1.200 km de costa atlántica y 135 municipios, llamados partidos. La Pampa húmeda que la cubre es el motor agrícola de la Argentina.'),
('buenos-aires', 'economia', 'El campo más productivo y la industria más grande',
 'La provincia aporta alrededor de un tercio del producto bruto argentino. Concentra el grueso de la industria automotriz, petroquímica y siderúrgica del país, con polos en Zárate-Campana, Ensenada y Bahía Blanca. Al mismo tiempo, sus partidos del norte y del oeste producen soja, trigo y maíz sobre algunos de los suelos más fértiles del mundo. Y tiene el mayor complejo pesquero nacional en el puerto de Mar del Plata. Esa convivencia de campo, fábrica y puerto es la clave para entenderla.'),
('buenos-aires', 'gastronomia', 'Salame de Tandil y facturas de todos lados',
 'Tandil tiene denominación de origen para su salame y una tradición quesera que viene de la inmigración danesa e italiana. Chascomús y la cuenca del Salado aportan el pejerrey. Mar del Plata pone el pescado y los alfajores. Y en toda la provincia rige el mismo ritual innegociable: las facturas de la panadería del barrio con el mate de la tarde, con nombres que ningún otro país entendería, como bolas de fraile, vigilantes o sacramentos.'),
('buenos-aires', 'simbolo', 'El ombú y la vaca',
 'El escudo provincial muestra un sol naciente sobre el Río de la Plata con dos manos entrelazadas sosteniendo una pica y un gorro frigio: la unión de los pueblos. Pero los símbolos que la gente reconoce en el campo son otros dos. El ombú, que técnicamente no es un árbol sino una hierba gigante, es la única sombra en kilómetros de llanura. Y la vaca, que desde el siglo XVIII define el paisaje, la economía y la mesa de la provincia.'),
('buenos-aires', 'dato_curioso', 'La provincia tiene más habitantes que dieciséis provincias juntas',
 'Viven alrededor de 17,5 millones de personas en la provincia: cerca del 38% de la población argentina. Si fuera un país independiente estaría entre los sesenta más poblados del mundo, por encima de Países Bajos o Chile. Diez de sus partidos tienen, cada uno, más habitantes que provincias enteras como Tierra del Fuego, La Rioja o Santa Cruz. La Matanza sola supera el millón y medio de personas.'),

-- --------------------------------------------------------- Mar del Plata ----
('mar-del-plata', 'historia', 'De saladero a balneario de todos',
 'La zona empezó como estancia y saladero en 1856, de la mano del portugués Coelho de Meirelles. Patricio Peralta Ramos compró las tierras y fundó el pueblo el 10 de febrero de 1874. Durante décadas fue el balneario exclusivo de la aristocracia porteña, que levantó chalets de estilo pintoresquista y la Rambla Bristol. Todo cambió a mediados del siglo XX: el turismo social, los hoteles sindicales y la ruta pavimentada la convirtieron en la ciudad de vacaciones de las mayorías. Ese pasaje de balneario de elite a ciudad popular es la clave de su identidad.'),
('mar-del-plata', 'cultura', 'Teatro, festival y una identidad de invierno',
 'En verano Mar del Plata tiene más salas de teatro en actividad que casi cualquier ciudad del país: la temporada teatral marplatense es una industria en sí misma. El Festival Internacional de Cine, creado en 1954, es el único de categoría A de América Latina reconocido por la FIAPF. Pero la ciudad tiene una identidad de invierno que los turistas no ven: 700.000 personas que viven todo el año, dos universidades, una escena musical propia y una relación con el mar que es de trabajo, no de postal.'),
('mar-del-plata', 'geografia', 'Donde la sierra se mete en el mar',
 'Está en el partido de General Pueyrredón, a 404 km de Buenos Aires, sobre el Atlántico. Su rasgo geográfico decisivo es que las últimas estribaciones del sistema de Tandilia llegan hasta la costa: por eso hay acantilados, puntas rocosas y playas separadas en bahías, en vez de la línea recta de arena del resto de la costa bonaerense. Tiene unos 47 km de litoral. El clima es templado oceánico, con veranos frescos para el estándar argentino y un viento que es parte del carácter local.'),
('mar-del-plata', 'economia', 'Pesca, turismo, textil y conocimiento',
 'El puerto de Mar del Plata es el principal puerto pesquero de la Argentina y explica buena parte del empleo local, junto con la industria naval y las plantas procesadoras. El turismo mueve la ciudad en verano y sostiene gastronomía, hotelería y construcción. Hay además una tradición textil y de tejido de punto que viene de los años cincuenta, y un polo de conocimiento creciente alrededor de la Universidad Nacional de Mar del Plata, el INIDEP y el INTA Balcarce. La estacionalidad extrema es su principal desafío económico.'),
('mar-del-plata', 'gastronomia', 'Rabas, alfajores y churros con la lluvia',
 'El pescado del puerto define la mesa: rabas, cornalitos, besugo y la clásica cazuela de mariscos en la banquina de los pescadores. El alfajor marplatense, de masa blanda y baño de chocolate, es un producto identitario con marcas centenarias. Los churros rellenos con submarino son el plan obligatorio de un día de lluvia. Y el helado artesanal marplatense, herencia italiana, compite de igual a igual con cualquiera del país.'),
('mar-del-plata', 'simbolo', 'Los lobos marinos de la rambla',
 'Los dos lobos marinos de piedra que custodian la escalinata de la Rambla Casino fueron esculpidos por José Fioravanti en 1940 y pesan alrededor de siete toneladas cada uno. Son el punto de encuentro y la foto obligada de la ciudad. Su modelo vivo está a pocos metros: la colonia de lobos marinos machos de la escollera sur del puerto, una de las pocas colonias urbanas del mundo, que se puede visitar caminando.'),
('mar-del-plata', 'dato_curioso', 'La ciudad que se triplica cada enero',
 'Mar del Plata tiene unos 700.000 habitantes estables, pero en temporada alta recibe cerca de 3 millones de visitantes a lo largo del verano, con picos de más de un millón de personas presentes en simultáneo en enero. La ciudad tiene que dimensionar el agua, los residuos y el transporte para un pico que dura ocho semanas y después desaparece. Es uno de los ejemplos más extremos de estacionalidad urbana del país.')

) as i (community_slug, category, title, content)
join public.communities c on c.slug = i.community_slug
cross join (select id from public.profiles where username = 'admin_geo') a
on conflict (community_id, category) do nothing;

-- =============================================================================
-- Encuestas demo · una de cada tipo, en tres niveles distintos
-- =============================================================================
insert into public.polls (id, community_id, author_id, question, description, type, closes_at, results_visibility, created_at)
select p.id::uuid, c.id, a.id, p.question, p.description, p.type,
       case when p.closes_in_days is null then null
            else now() + (p.closes_in_days || ' days')::interval end,
       p.results_visibility,
       now() - (p.age_days || ' days')::interval
from (values
  ('a0000000-0000-4000-8000-000000000001', 'earth',
   '¿La humanidad debería crear un fondo común para catástrofes climáticas?',
   'La idea: un fondo internacional financiado por todos los países, que se active automáticamente cuando una catástrofe climática supera la capacidad de respuesta de un país. Dos posturas, sin grises.',
   'binary', 45, 'after_close', 12),
  ('a0000000-0000-4000-8000-000000000002', 'argentina',
   '¿Cuál debería ser la prioridad número uno de la inversión pública en 2026?',
   'Elegí una sola. Los resultados se publican al cierre si participaron al menos cinco personas.',
   'single', 30, 'after_close', 8),
  ('a0000000-0000-4000-8000-000000000003', 'mar-del-plata',
   '¿Qué obras necesita Mar del Plata con más urgencia?',
   'Podés elegir hasta tres opciones. Pensá en los próximos cuatro años, no en el próximo verano.',
   'multiple', 20, 'after_close', 5)
) as p (id, community_slug, question, description, type, closes_in_days, results_visibility, age_days)
join public.communities c on c.slug = p.community_slug
cross join (select id from public.profiles where username = 'mod_nacional') a
on conflict (id) do nothing;

insert into public.poll_options (id, poll_id, label, sort_order)
select o.id::uuid, o.poll_id::uuid, o.label, o.sort_order::smallint
from (values
  -- Global (binary)
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Sí, es urgente y nos conviene a todos', 0),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'No, cada país debe resolverlo por su cuenta', 1),
  -- Argentina (single)
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000002', 'Educación', 0),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000002', 'Salud', 1),
  ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000002', 'Infraestructura y transporte', 2),
  ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000002', 'Ciencia y tecnología', 3),
  ('b0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000002', 'Vivienda', 4),
  -- Mar del Plata (multiple)
  ('b0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000003', 'Red cloacal en los barrios del oeste', 0),
  ('b0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000003', 'Ciclovías conectadas de verdad', 1),
  ('b0000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000003', 'Renovación del transporte público', 2),
  ('b0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000003', 'Defensa de la costa y las playas', 3),
  ('b0000000-0000-4000-8000-000000000025', 'a0000000-0000-4000-8000-000000000003', 'Planta de tratamiento de residuos', 4),
  ('b0000000-0000-4000-8000-000000000026', 'a0000000-0000-4000-8000-000000000003', 'Hospital municipal en la zona norte', 5)
) as o (id, poll_id, label, sort_order)
on conflict (id) do nothing;

-- Participación demo secreta. La identidad sólo existe durante este statement
-- para crear el recibo; las selecciones terminan únicamente en contadores por
-- opción. Todas las opciones se insertan/actualizan juntas, incluidas las que
-- suman cero. Al re-ejecutar el seed sólo se agregan participantes nuevos.
with vote_seed (poll_id, option_id, username) as (
  values
  -- Global: vota todo el mundo (todos son miembros de `earth`).
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'sofia_mdq'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'bruno_lp'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'carla_cba'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid, 'diego_mza'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'elena_caba'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000002'::uuid, 'flor_tandil'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'mod_nacional'),
  -- Argentina: todos residen en el país.
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000011'::uuid, 'carla_cba'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000011'::uuid, 'flor_tandil'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000012'::uuid, 'elena_caba'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000013'::uuid, 'bruno_lp'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000013'::uuid, 'diego_mza'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'b0000000-0000-4000-8000-000000000014'::uuid, 'sofia_mdq'),
  -- Mar del Plata: sólo residentes marplatenses (sofia y admin).
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'b0000000-0000-4000-8000-000000000021'::uuid, 'sofia_mdq'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'b0000000-0000-4000-8000-000000000022'::uuid, 'sofia_mdq'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'b0000000-0000-4000-8000-000000000024'::uuid, 'sofia_mdq'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'b0000000-0000-4000-8000-000000000021'::uuid, 'admin_geo'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'b0000000-0000-4000-8000-000000000025'::uuid, 'admin_geo')
), mapped as (
  select v.poll_id, v.option_id, p.id as user_id
  from vote_seed v
  join public.profiles p on p.username = v.username
), new_participants as (
  select m.poll_id, m.user_id
  from mapped m
  where not exists (
    select 1
    from public.poll_participation_receipts r
    where r.poll_id = m.poll_id and r.user_id = m.user_id
  )
  group by m.poll_id, m.user_id
), inserted_receipts as (
  insert into public.poll_participation_receipts (poll_id, user_id)
  select n.poll_id, n.user_id
  from new_participants n
  on conflict do nothing
  returning poll_id, user_id
), increments as (
  select m.poll_id, m.option_id, count(*)::bigint as votes
  from mapped m
  join inserted_receipts r using (poll_id, user_id)
  group by m.poll_id, m.option_id
), participant_increments as (
  select poll_id, count(*)::bigint as participants
  from inserted_receipts
  group by poll_id
), touched_polls as (
  select distinct poll_id from inserted_receipts
)
insert into private.poll_option_tallies (
  poll_id, option_id, votes, participants
)
select o.poll_id, o.id, coalesce(i.votes, 0), pi.participants
from public.poll_options o
join touched_polls p on p.poll_id = o.poll_id
join participant_increments pi on pi.poll_id = o.poll_id
left join increments i on i.poll_id = o.poll_id and i.option_id = o.id
on conflict (poll_id, option_id) do update
set votes = poll_option_tallies.votes + excluded.votes,
    participants = poll_option_tallies.participants + excluded.participants;

-- =============================================================================
-- Debate nacional argentino · las columnas son las 24 subdivisiones
-- =============================================================================
insert into public.debates (id, community_id, author_id, title, body, created_at)
select 'c0000000-0000-4000-8000-000000000001'::uuid, c.id, a.id,
  'Transporte interurbano: ¿cómo conectamos de verdad al país?',
  'Argentina desmanteló buena parte de su red ferroviaria de pasajeros entre los años sesenta y los noventa. Hoy moverse entre ciudades medianas suele implicar pasar por Buenos Aires, aunque sea un desvío absurdo. La pregunta no es sólo si hay que volver al tren: es qué necesita cada provincia para estar conectada con sus vecinas, y qué está dispuesta a resignar a cambio. Contá cómo se viaja desde donde vivís vos.',
  now() - interval '6 days'
from public.communities c
cross join (select id from public.profiles where username = 'mod_nacional') a
where c.slug = 'argentina'
on conflict (id) do nothing;

-- Comentarios en varias columnas. Cada usuario sólo puede escribir en la
-- columna de su cadena de residencia: sofía y bruno caen en Buenos Aires,
-- elena en CABA, carla en Córdoba, diego en Mendoza, flor en Buenos Aires.
-- Se backdatan los `created_at` para no chocar con el rate limit de 15 s.
insert into public.debate_comments (id, debate_id, column_community_id, user_id, body, created_at)
select d.id::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid, c.id, p.id, d.body,
       now() - (d.age_hours || ' hours')::interval
from (values
  ('d0000000-0000-4000-8000-000000000001', 'buenos-aires', 'sofia_mdq',
   'Desde Mar del Plata a Bahía Blanca, que están a 500 km sobre la misma provincia, no hay transporte directo razonable. Terminás pasando por Buenos Aires: 900 km para hacer 500. El tren a Buenos Aires anda, pero la conexión lateral entre ciudades bonaerenses no existe.', 120),
  ('d0000000-0000-4000-8000-000000000002', 'buenos-aires', 'bruno_lp',
   'Coincido, y agrego algo desde La Plata: el problema no es sólo la traza, es la frecuencia. Un servicio que sale dos veces por semana no es transporte, es una excursión. Antes de tender un metro de vía nueva habría que ver cuánta capacidad ociosa hay en lo que ya está.', 96),
  ('d0000000-0000-4000-8000-000000000003', 'buenos-aires', 'flor_tandil',
   'En Tandil somos 130.000 personas y una universidad grande, con estudiantes que viajan cada quince días. El micro es caro y tarda. Un servicio ferroviario decente Tandil-Mar del Plata-La Plata cambiaría la vida de mucha gente joven.', 70),
  ('d0000000-0000-4000-8000-000000000011', 'caba', 'elena_caba',
   'Desde acá se ve raro este debate, porque todo converge a la ciudad y parece que funciona. Pero esa centralidad es justamente el problema del resto: la red está pensada como rayos de una rueda, no como una malla. Si queremos federalizar, hay que aceptar que algunas inversiones no pasen por CABA.', 88),
  ('d0000000-0000-4000-8000-000000000021', 'cordoba', 'carla_cba',
   'Córdoba y Rosario son la segunda y tercera ciudad del país y no tienen un servicio ferroviario directo digno entre ellas, estando a 400 km. Ese corredor solo justificaría la inversión. Lo pido como docente que ve a sus alumnos perder días enteros de viaje.', 60),
  ('d0000000-0000-4000-8000-000000000022', 'cordoba', 'carla_cba',
   'Aclaro algo de mi comentario anterior: no estoy pidiendo alta velocidad ni nada exótico. Con un servicio diario, puntual y a precio de micro ya sería una transformación enorme.', 30),
  ('d0000000-0000-4000-8000-000000000031', 'mendoza', 'diego_mza',
   'Acá el tema es el Trasandino, cerrado desde 1984. Tenemos el paso a Chile más importante del Cono Sur moviéndose sólo por camión, y cada nevada fuerte deja mil camiones varados. Reactivar la conexión ferroviaria a Valparaíso es infraestructura logística, no nostalgia.', 45),
  ('d0000000-0000-4000-8000-000000000032', 'mendoza', 'diego_mza',
   'Sumo el dato de agua, que es mi tema: cualquier obra de esta escala en Cuyo tiene que evaluar el impacto sobre las cuencas antes de la primera topadora. No es un trámite, es lo que define si la obra sirve en treinta años.', 18)
) as d (id, column_slug, username, body, age_hours)
join public.communities c on c.slug = d.column_slug
join public.profiles p on p.username = d.username
on conflict (id) do nothing;

-- Votos a los comentarios. Sólo pueden votar residentes de Argentina.
insert into public.comment_votes (comment_id, user_id, value)
select v.comment_id::uuid, p.id, v.value::smallint
from (values
  ('d0000000-0000-4000-8000-000000000001', 'bruno_lp',    1),
  ('d0000000-0000-4000-8000-000000000001', 'carla_cba',   1),
  ('d0000000-0000-4000-8000-000000000001', 'flor_tandil', 1),
  ('d0000000-0000-4000-8000-000000000001', 'elena_caba',  1),
  ('d0000000-0000-4000-8000-000000000002', 'sofia_mdq',   1),
  ('d0000000-0000-4000-8000-000000000002', 'diego_mza',  -1),
  ('d0000000-0000-4000-8000-000000000003', 'sofia_mdq',   1),
  ('d0000000-0000-4000-8000-000000000003', 'bruno_lp',    1),
  ('d0000000-0000-4000-8000-000000000011', 'carla_cba',   1),
  ('d0000000-0000-4000-8000-000000000011', 'diego_mza',   1),
  ('d0000000-0000-4000-8000-000000000021', 'flor_tandil', 1),
  ('d0000000-0000-4000-8000-000000000021', 'elena_caba',  1),
  ('d0000000-0000-4000-8000-000000000021', 'sofia_mdq',   1),
  ('d0000000-0000-4000-8000-000000000031', 'carla_cba',   1),
  ('d0000000-0000-4000-8000-000000000031', 'bruno_lp',    1)
) as v (comment_id, username, value)
join public.profiles p on p.username = v.username
on conflict do nothing;

-- =============================================================================
-- Reclamos de Mar del Plata
-- =============================================================================
insert into public.claims (id, community_id, author_id, title, description, category, status, created_at)
select r.id::uuid, c.id, p.id, r.title, r.description, r.category, r.status,
       now() - (r.age_days || ' days')::interval
from (values
  ('e0000000-0000-4000-8000-000000000001', 'sofia_mdq', 'infraestructura', 'open',
   'La rambla de Playa Grande está sin luminaria hace tres semanas',
   'Desde el 12 del mes pasado no funciona ninguna de las luces del tramo entre el Torreón y Playa Grande. A partir de las siete de la tarde el paseo queda completamente a oscuras y se sigue usando igual, porque es el acceso natural a la playa. Ya hay vecinos que dejaron de caminar por ahí de noche. Reclamé por el 147 y me dieron un número de expediente, sin novedades desde entonces.', 14),
  ('e0000000-0000-4000-8000-000000000002', 'admin_geo', 'transporte', 'acknowledged',
   'La línea 511 no cumple la frecuencia en horario nocturno',
   'La frecuencia publicada para la 511 después de las 21 es de 30 minutos, pero en la práctica hay esperas de más de una hora. Afecta especialmente a quienes salen del turno tarde de las plantas del puerto. Hay registros de usuarios documentando las esperas durante las últimas dos semanas. Pedimos que se audite el cumplimiento del pliego y se publiquen los datos de GPS de la flota.', 9),
  ('e0000000-0000-4000-8000-000000000003', 'sofia_mdq', 'ambiente', 'open',
   'Microbasural crónico en el arroyo del Barco',
   'Hay un punto de descarga informal de escombros y restos de poda sobre la margen del arroyo, a la altura del acceso desde la ruta. Cada vez que llueve fuerte parte de eso termina en el cauce y baja hasta la costa. Ya se limpió dos veces en el año, pero sin una barrera física ni cartelería vuelve a formarse en menos de un mes. Hace falta una solución permanente, no otra limpieza.', 4)
) as r (id, username, category, status, title, description, age_days)
join public.profiles p on p.username = r.username
cross join (select id from public.communities where slug = 'mar-del-plata') c
on conflict (id) do nothing;

-- Apoyos: sólo residentes de Mar del Plata (o de su cadena descendente).
insert into public.claim_supports (claim_id, user_id)
select s.claim_id::uuid, p.id
from (values
  ('e0000000-0000-4000-8000-000000000001', 'admin_geo'),
  ('e0000000-0000-4000-8000-000000000002', 'sofia_mdq'),
  ('e0000000-0000-4000-8000-000000000003', 'admin_geo')
) as s (claim_id, username)
join public.profiles p on p.username = s.username
on conflict do nothing;

-- =============================================================================
-- Proyectos con compromisos de aporte
-- =============================================================================
insert into public.projects (id, community_id, author_id, title, summary, plan,
                             budget_amount, currency, resources_needed, time_estimate,
                             status, created_at)
select pr.id::uuid, c.id, p.id, pr.title, pr.summary, pr.plan,
       pr.budget::numeric, 'ARS', pr.resources, pr.time_estimate, pr.status,
       now() - (pr.age_days || ' days')::interval
from (values
  ('f0000000-0000-4000-8000-000000000001', 'mar-del-plata', 'sofia_mdq',
   'Red de bicicleteros techados en las escuelas del oeste',
   'Instalar bicicleteros seguros y techados en 12 escuelas secundarias, para que ir en bici deje de ser un problema de dónde dejarla.',
   'Etapa 1 (mes 1-2): relevamiento en las 12 escuelas junto a los centros de estudiantes, para medir cuántas bicis entran hoy y cuántas entrarían con lugar seguro. Etapa 2 (mes 3): diseño de un módulo estándar de 20 lugares, en caño estructural y chapa, pensado para que lo pueda fabricar cualquier herrería del barrio. Publicamos los planos con licencia abierta. Etapa 3 (mes 4-8): fabricación e instalación de dos módulos por mes, priorizando las escuelas con más demanda relevada. La instalación la hace la cooperativa junto con la escuela, en jornada de trabajo comunitario. Etapa 4 (mes 9): medición de uso y publicación de resultados abiertos, para que otras ciudades puedan copiar el modelo o descartarlo con datos.',
   9600000, 'Herrería con capacidad de producción seriada, permisos del Consejo Escolar, 12 jornadas de instalación con voluntarios.',
   '9 meses', 'funding', 20),
  ('f0000000-0000-4000-8000-000000000002', 'argentina', 'bruno_lp',
   'Mapa abierto del arbolado urbano argentino',
   'Un relevamiento colaborativo del arbolado de las ciudades argentinas, con datos abiertos por especie, estado y ubicación.',
   'Etapa 1 (mes 1-3): definir un estándar de datos mínimo junto con facultades de agronomía y las áreas de espacios verdes de tres municipios piloto (La Plata, Córdoba y Mendoza). Un árbol se releva con seis campos, no con sesenta: especie, altura estimada, estado sanitario, coordenadas, vereda y fecha. Etapa 2 (mes 4-6): desarrollo de una app de carga muy simple, que funcione sin conexión y sincronice después, porque el relevamiento se hace caminando. Etapa 3 (mes 7-12): campañas de relevamiento con estudiantes y vecinos, barrio por barrio, con validación cruzada de un porcentaje de los registros. Etapa 4 (mes 13): publicación del dataset completo con licencia abierta y de un tablero público por ciudad. El objetivo real no es el mapa: es que cada municipio pueda planificar podas y reposición con evidencia en vez de con intuición.',
   14500000, 'Dos desarrolladores part-time, un ingeniero agrónomo coordinador, convenios con tres municipios y dos universidades.',
   '13 meses', 'proposal', 11)
) as pr (id, community_slug, username, title, summary, plan, budget, resources, time_estimate, status, age_days)
join public.communities c on c.slug = pr.community_slug
join public.profiles p on p.username = pr.username
on conflict (id) do nothing;

insert into public.project_pledges (project_id, user_id, amount, message)
select pl.project_id::uuid, p.id, pl.amount::numeric, pl.message
from (values
  ('f0000000-0000-4000-8000-000000000001', 'admin_geo', 150000,
   'Va con todo. Si sirve, puedo conseguir contacto con dos herrerías del puerto.'),
  ('f0000000-0000-4000-8000-000000000002', 'carla_cba', 40000,
   'Desde la escuela podemos aportar el relevamiento de nuestro barrio con los chicos de quinto.'),
  ('f0000000-0000-4000-8000-000000000002', 'diego_mza', 75000,
   'Me sumo. En Mendoza el arbolado está atado al sistema de acequias, ojo con eso en el estándar de datos.'),
  ('f0000000-0000-4000-8000-000000000002', 'elena_caba', 30000, null)
) as pl (project_id, username, amount, message)
join public.profiles p on p.username = pl.username
on conflict (project_id, user_id) do nothing;

insert into public.project_comments (project_id, user_id, body, created_at)
select pc.project_id::uuid, p.id, pc.body, now() - (pc.age_hours || ' hours')::interval
from (values
  ('f0000000-0000-4000-8000-000000000001', 'admin_geo',
   '¿Los planos abiertos incluyen el cálculo estructural o sólo la geometría? Lo pregunto porque sin el cálculo firmado ningún Consejo Escolar lo va a aprobar.', 72),
  ('f0000000-0000-4000-8000-000000000001', 'sofia_mdq',
   'Buena pregunta. Incluye el cálculo, firmado por una ingeniera que ya se comprometió a hacerlo ad honorem. Sin eso el proyecto no arranca, tenés razón.', 68),
  ('f0000000-0000-4000-8000-000000000002', 'diego_mza',
   '¿Cómo evitan que el dataset se desactualice a los dos años y quede como tantos otros relevamientos?', 40),
  ('f0000000-0000-4000-8000-000000000002', 'bruno_lp',
   'Con dos cosas: la app queda publicada y cualquiera puede seguir cargando, y el convenio con los municipios los obliga a registrar ahí cada poda y cada plantación nueva. Si eso no se cumple, el mapa envejece igual. Es el riesgo principal del proyecto y prefiero decirlo de entrada.', 36)
) as pc (project_id, username, body, age_hours)
join public.profiles p on p.username = pc.username;

-- Un reporte pendiente para poder ver la cola de moderación con contenido.
insert into public.reports (reporter_id, target_type, target_id, reason)
select p.id, 'debate_comment', 'd0000000-0000-4000-8000-000000000032'::uuid,
       'Me parece que este comentario se va de tema respecto del debate de transporte.'
from public.profiles p where p.username = 'flor_tandil'
on conflict do nothing;

commit;

-- En un reset local, la migración editorial corre antes que este seed y todavía
-- no encuentra todas las comunidades demo. `supabase/config.toml` la declara
-- como segundo `db.seed.sql_paths`, después de este archivo. Sus INSERT son
-- idempotentes, por lo que también sigue siendo una migración válida para una
-- base ya poblada.

-- =============================================================================
-- Verificación de `is_member` (se ve en la salida de `supabase db reset`).
-- Sofía reside en Mar del Plata: debe ser miembro de toda su cadena y de nada más.
-- =============================================================================
do $$
declare
  v_user uuid;
  v_fail text := '';
begin
  select id into v_user from public.profiles where username = 'sofia_mdq';
  -- Desde 0039 el helper público queda ligado a auth.uid() para que una RPC no
  -- pueda consultar la residencia de otra persona. El smoke test reproduce una
  -- sesión de Sofía aunque el seed se ejecute como owner.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  if not (select public.is_member(v_user, id) from public.communities where slug = 'mar-del-plata')
    then v_fail := v_fail || ' mar-del-plata'; end if;
  if not (select public.is_member(v_user, id) from public.communities where slug = 'buenos-aires')
    then v_fail := v_fail || ' buenos-aires'; end if;
  if not (select public.is_member(v_user, id) from public.communities where slug = 'argentina')
    then v_fail := v_fail || ' argentina'; end if;
  if not (select public.is_member(v_user, id) from public.communities where slug = 'south-america')
    then v_fail := v_fail || ' south-america'; end if;
  if not (select public.is_member(v_user, id) from public.communities where slug = 'earth')
    then v_fail := v_fail || ' earth'; end if;

  -- Y NO debe ser miembro de comunidades fuera de su cadena.
  if (select public.is_member(v_user, id) from public.communities where slug = 'caba')
    then v_fail := v_fail || ' !caba'; end if;
  if (select public.is_member(v_user, id) from public.communities where slug = 'cordoba')
    then v_fail := v_fail || ' !cordoba'; end if;
  if (select public.is_member(v_user, id) from public.communities where slug = 'necochea')
    then v_fail := v_fail || ' !necochea'; end if;
  if (select public.is_member(v_user, id) from public.communities where slug = 'chile')
    then v_fail := v_fail || ' !chile'; end if;

  if v_fail <> '' then
    raise exception 'is_member falló en:%', v_fail;
  end if;

  perform set_config('request.jwt.claims', '', true);

  raise notice 'OK · is_member verificado para sofia_mdq (5 comunidades de su cadena, 0 fuera de ella)';
  raise notice 'OK · % comunidades · % miembros globales',
    (select count(*) from public.communities),
    (select member_count from public.communities where slug = 'earth');
end;
$$;

-- =============================================================================
-- Verificación de los usuarios demo.
-- -----------------------------------------------------------------------------
-- GoTrue mapea las columnas de token de `auth.users` a `string` de Go, no a
-- `sql.NullString`. Un NULL rompe el escaneo de la fila entera y el login
-- devuelve HTTP 500 `unexpected_failure` / "Database error querying schema" en
-- vez de un error de credenciales — es un síntoma que no apunta a su causa, así
-- que conviene detectarlo acá y no en producción.
--
-- Se recorren las columnas por introspección (y no con una lista fija) porque
-- el conjunto cambia entre versiones de GoTrue: lo que hoy no existe puede
-- aparecer mañana, y este bloque lo va a ver.
-- =============================================================================
do $$
declare
  -- Estas rompen el login si quedan en NULL: fallo duro.
  v_critical text[] := array[
    'confirmation_token', 'recovery_token', 'email_change',
    'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token',
    'is_sso_user', 'is_anonymous'
  ];
  v_col     text;
  v_nulls   int;
  v_fail    text := '';
  v_warn    text := '';
  v_total   int;
begin
  select count(*) into v_total from auth.users where email like '%@agorbis.test';

  if v_total = 0 then
    raise exception 'No se creó ningún usuario demo: revisá el bloque de auth.users.';
  end if;

  for v_col in
    select column_name
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and data_type in ('text', 'character varying', 'boolean')
    order by column_name
  loop
    execute format(
      'select count(*) from auth.users where email like %L and %I is null',
      '%@agorbis.test', v_col
    ) into v_nulls;

    if v_nulls > 0 then
      if v_col = any (v_critical) then
        v_fail := v_fail || ' ' || v_col;
      else
        v_warn := v_warn || ' ' || v_col;
      end if;
    end if;
  end loop;

  if v_fail <> '' then
    raise exception
      'Usuarios demo con columnas en NULL que rompen el login (GoTrue devuelve 500):%', v_fail;
  end if;

  -- Las demás columnas de texto en NULL no son fatales hoy, pero si una
  -- versión futura de GoTrue las lee como `string`, van a serlo.
  if v_warn <> '' then
    raise notice 'AVISO · columnas de texto/booleanas en NULL (no fatales hoy):%', v_warn;
  end if;

  -- Y que la identidad de email exista: sin ella no se puede entrar con contraseña.
  select count(*) into v_nulls
  from auth.users u
  where u.email like '%@agorbis.test'
    and not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );

  if v_nulls > 0 then
    raise exception '% usuarios demo sin identidad de email: no van a poder iniciar sesión.', v_nulls;
  end if;

  raise notice 'OK · % usuarios demo con todas sus columnas críticas completas e identidad de email', v_total;
  raise notice 'OK · contraseña de todos: AgorbisLocal-2026!';
end;
$$;
