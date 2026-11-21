-- =============================================================================
-- Agorbis · 0009 · Backfill de coordenadas de países
-- -----------------------------------------------------------------------------
-- Las bases creadas antes de la iteración 2 tienen los 195 países con `lat` y
-- `lng` en NULL: el seed original no traía coordenadas. El seed nuevo sí, pero
-- sus INSERT usan `on conflict (slug) do nothing`, así que no tocan las filas
-- que ya existen. Esto las completa.
--
-- Fuentes (las mismas que el seed, ver scripts/gen-geo.mjs):
--   · Google DSPL — canonical countries (194 de 195)
--   · mledoze/countries (sólo Sudán del Sur)
--
-- Generado a partir de `supabase/seed.sql`, no a mano: las coordenadas del
-- UPDATE no pueden divergir de las del INSERT.
--
-- Es idempotente y acotado a `level = 2`: correrlo de nuevo no cambia nada, y
-- en una base recién creada actualiza 0 filas (las migraciones corren antes
-- que el seed) sin fallar.
-- =============================================================================

update public.communities c
   set lat = v.lat,
       lng = v.lng
from (values
  ('argelia', 28.0339, 1.6596),
  ('angola', -11.2027, 17.8739),
  ('benin', 9.3077, 2.3158),
  ('botsuana', -22.3285, 24.6849),
  ('burkina-faso', 12.2383, -1.5616),
  ('burundi', -3.3731, 29.9189),
  ('cabo-verde', 16.0021, -24.0132),
  ('camerun', 7.3697, 12.3547),
  ('chad', 15.4542, 18.7322),
  ('comoras', -11.875, 43.8722),
  ('congo', -0.228, 15.8277),
  ('republica-democratica-del-congo', -4.0383, 21.7587),
  ('costa-de-marfil', 7.54, -5.5471),
  ('yibuti', 11.8251, 42.5903),
  ('egipto', 26.8206, 30.8025),
  ('guinea-ecuatorial', 1.6508, 10.2679),
  ('eritrea', 15.1794, 39.7823),
  ('esuatini', -26.5225, 31.4659),
  ('etiopia', 9.145, 40.4897),
  ('gabon', -0.8037, 11.6094),
  ('gambia', 13.4432, -15.3101),
  ('ghana', 7.9465, -1.0232),
  ('guinea', 9.9456, -9.6966),
  ('guinea-bisau', 11.8037, -15.1804),
  ('kenia', -0.0236, 37.9062),
  ('lesoto', -29.61, 28.2336),
  ('liberia', 6.4281, -9.4295),
  ('libia', 26.3351, 17.2283),
  ('madagascar', -18.7669, 46.8691),
  ('malaui', -13.2543, 34.3015),
  ('mali', 17.5707, -3.9962),
  ('marruecos', 31.7917, -7.0926),
  ('mauritania', 21.0079, -10.9408),
  ('mauricio', -20.3484, 57.5522),
  ('mozambique', -18.6657, 35.5296),
  ('namibia', -22.9576, 18.4904),
  ('niger', 17.6078, 8.0817),
  ('nigeria', 9.082, 8.6753),
  ('republica-centroafricana', 6.6111, 20.9394),
  ('ruanda', -1.9403, 29.8739),
  ('santo-tome-y-principe', 0.1864, 6.6131),
  ('senegal', 14.4974, -14.4524),
  ('seychelles', -4.6796, 55.492),
  ('sierra-leona', 8.4606, -11.7799),
  ('somalia', 5.1521, 46.1996),
  ('sudafrica', -30.5595, 22.9375),
  ('sudan', 12.8628, 30.2176),
  ('sudan-del-sur', 7, 30),
  ('tanzania', -6.369, 34.8888),
  ('togo', 8.6195, 0.8248),
  ('tunez', 33.8869, 9.5375),
  ('uganda', 1.3733, 32.2903),
  ('zambia', -13.1339, 27.8493),
  ('zimbabue', -19.0154, 29.1549),
  ('antigua-y-barbuda', 17.0608, -61.7964),
  ('bahamas', 25.0343, -77.3963),
  ('barbados', 13.1939, -59.5432),
  ('belice', 17.1899, -88.4976),
  ('canada', 56.1304, -106.3468),
  ('costa-rica', 9.7489, -83.7534),
  ('cuba', 21.5218, -77.7812),
  ('dominica', 15.415, -61.371),
  ('republica-dominicana', 18.7357, -70.1627),
  ('el-salvador', 13.7942, -88.8965),
  ('estados-unidos', 37.0902, -95.7129),
  ('granada', 12.2628, -61.6042),
  ('guatemala', 15.7835, -90.2308),
  ('haiti', 18.9712, -72.2852),
  ('honduras', 15.2, -86.2419),
  ('jamaica', 18.1096, -77.2975),
  ('mexico', 23.6345, -102.5528),
  ('nicaragua', 12.8654, -85.2072),
  ('panama', 8.538, -80.7821),
  ('san-cristobal-y-nieves', 17.3578, -62.783),
  ('san-vicente-y-las-granadinas', 12.9843, -61.2872),
  ('santa-lucia', 13.9094, -60.9789),
  ('trinidad-y-tobago', 10.6918, -61.2225),
  ('argentina', -38.4161, -63.6167),
  ('bolivia', -16.2902, -63.5887),
  ('brasil', -14.235, -51.9253),
  ('chile', -35.6751, -71.543),
  ('colombia', 4.5709, -74.2973),
  ('ecuador', -1.8312, -78.1834),
  ('guyana', 4.8604, -58.9302),
  ('paraguay', -23.4425, -58.4438),
  ('peru', -9.19, -75.0152),
  ('surinam', 3.9193, -56.0278),
  ('uruguay', -32.5228, -55.7658),
  ('venezuela', 6.4238, -66.5897),
  ('afganistan', 33.9391, 67.71),
  ('arabia-saudita', 23.8859, 45.0792),
  ('armenia', 40.0691, 45.0382),
  ('azerbaiyan', 40.1431, 47.5769),
  ('banglades', 23.685, 90.3563),
  ('barein', 25.9304, 50.6378),
  ('birmania', 21.914, 95.9562),
  ('brunei', 4.5353, 114.7277),
  ('butan', 27.5142, 90.4336),
  ('camboya', 12.5657, 104.991),
  ('catar', 25.3548, 51.1839),
  ('china', 35.8617, 104.1954),
  ('chipre', 35.1264, 33.4299),
  ('corea-del-norte', 40.3399, 127.5101),
  ('corea-del-sur', 35.9078, 127.7669),
  ('emiratos-arabes-unidos', 23.4241, 53.8478),
  ('filipinas', 12.8797, 121.774),
  ('georgia', 42.3154, 43.3569),
  ('india', 20.5937, 78.9629),
  ('indonesia', -0.7893, 113.9213),
  ('irak', 33.2232, 43.6793),
  ('iran', 32.4279, 53.688),
  ('israel', 31.0461, 34.8516),
  ('japon', 36.2048, 138.2529),
  ('jordania', 30.5852, 36.2384),
  ('kazajistan', 48.0196, 66.9237),
  ('kirguistan', 41.2044, 74.7661),
  ('kuwait', 29.3117, 47.4818),
  ('laos', 19.8563, 102.4955),
  ('libano', 33.8547, 35.8623),
  ('malasia', 4.2105, 101.9758),
  ('maldivas', 3.2028, 73.2207),
  ('mongolia', 46.8625, 103.8467),
  ('nepal', 28.3949, 84.124),
  ('oman', 21.5126, 55.9233),
  ('pakistan', 30.3753, 69.3451),
  ('palestina', 31.9522, 35.2332),
  ('singapur', 1.3521, 103.8198),
  ('siria', 34.8021, 38.9968),
  ('sri-lanka', 7.8731, 80.7718),
  ('tailandia', 15.87, 100.9925),
  ('tayikistan', 38.861, 71.2761),
  ('timor-oriental', -8.8742, 125.7275),
  ('turkmenistan', 38.9697, 59.5563),
  ('turquia', 38.9637, 35.2433),
  ('uzbekistan', 41.3775, 64.5853),
  ('vietnam', 14.0583, 108.2772),
  ('yemen', 15.5527, 48.5164),
  ('albania', 41.1533, 20.1683),
  ('alemania', 51.1657, 10.4515),
  ('andorra', 42.5462, 1.6016),
  ('austria', 47.5162, 14.5501),
  ('belgica', 50.5039, 4.4699),
  ('bielorrusia', 53.7098, 27.9534),
  ('bosnia-y-herzegovina', 43.9159, 17.6791),
  ('bulgaria', 42.7339, 25.4858),
  ('ciudad-del-vaticano', 41.9029, 12.4534),
  ('croacia', 45.1, 15.2),
  ('dinamarca', 56.2639, 9.5018),
  ('eslovaquia', 48.669, 19.699),
  ('eslovenia', 46.1512, 14.9955),
  ('espana', 40.4637, -3.7492),
  ('estonia', 58.5953, 25.0136),
  ('finlandia', 61.9241, 25.7482),
  ('francia', 46.2276, 2.2137),
  ('grecia', 39.0742, 21.8243),
  ('hungria', 47.1625, 19.5033),
  ('irlanda', 53.4129, -8.2439),
  ('islandia', 64.9631, -19.0208),
  ('italia', 41.8719, 12.5674),
  ('letonia', 56.8796, 24.6032),
  ('liechtenstein', 47.166, 9.5554),
  ('lituania', 55.1694, 23.8813),
  ('luxemburgo', 49.8153, 6.1296),
  ('macedonia-del-norte', 41.6086, 21.7453),
  ('malta', 35.9375, 14.3754),
  ('moldavia', 47.4116, 28.3699),
  ('monaco', 43.7503, 7.4128),
  ('montenegro', 42.7087, 19.3744),
  ('noruega', 60.472, 8.4689),
  ('paises-bajos', 52.1326, 5.2913),
  ('polonia', 51.9194, 19.1451),
  ('portugal', 39.3999, -8.2245),
  ('reino-unido', 55.3781, -3.436),
  ('republica-checa', 49.8175, 15.473),
  ('rumania', 45.9432, 24.9668),
  ('rusia', 61.524, 105.3188),
  ('san-marino', 43.9424, 12.4578),
  ('serbia', 44.0165, 21.0059),
  ('suecia', 60.1282, 18.6435),
  ('suiza', 46.8182, 8.2275),
  ('ucrania', 48.3794, 31.1656),
  ('australia', -25.2744, 133.7751),
  ('fiyi', -16.5782, 179.4144),
  ('islas-marshall', 7.1315, 171.1845),
  ('islas-salomon', -9.6457, 160.1562),
  ('kiribati', -3.3704, -168.734),
  ('micronesia', 7.4256, 150.5508),
  ('nauru', -0.5228, 166.9315),
  ('nueva-zelanda', -40.9006, 174.886),
  ('palaos', 7.515, 134.5825),
  ('papua-nueva-guinea', -6.315, 143.9555),
  ('samoa', -13.759, -172.1046),
  ('tonga', -21.179, -175.1982),
  ('tuvalu', -7.1095, 177.6493),
  ('vanuatu', -15.3767, 166.9592)
) as v (slug, lat, lng)
where c.slug = v.slug
  and c.level = 2
  and (c.lat is distinct from v.lat or c.lng is distinct from v.lng);

-- -----------------------------------------------------------------------------
-- Verificación: ningún país puede quedar sin coordenada.
-- -----------------------------------------------------------------------------
do $$
declare
  v_sin_coord int;
  v_total     int;
begin
  select count(*) into v_total     from public.communities where level = 2;
  select count(*) into v_sin_coord from public.communities where level = 2 and (lat is null or lng is null);

  if v_total = 0 then
    raise notice 'OK · todavía no hay países cargados (base nueva): nada que completar';
    return;
  end if;

  if v_sin_coord > 0 then
    raise exception '% de % países siguen sin coordenada: ¿hay slugs que no coinciden?',
      v_sin_coord, v_total;
  end if;

  raise notice 'OK · % países con coordenadas', v_total;
end;
$$;
