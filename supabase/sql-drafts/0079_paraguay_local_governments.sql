-- =============================================================================
-- Agorbis · 0079 · Distritos de Paraguay como nivel 4 (D131)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-paraguay-level4-draft.mjs; no se edita a mano.
--
-- Va después de 0076 y de los borradores de Uruguay y Chile.
--
-- Fuente: Paraguay - Subnational Administrative Boundaries (COD-AB) de HDX,
-- con datos del INE de Paraguay, licencia CC BY-IGO, hojas pry_admin2 y
-- pry_adminpoints, descargadas el 2026-11-20. 262 distritos bajo sus 17
-- departamentos; Asunción ya es su propio distrito y queda en nivel 3.
-- Contrastado por departamento con las intendencias electas en 2026 que
-- publica la Justicia Electoral (TSJE).
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
  ('paraguay-alto-paraguay-bahia-negra', 'Bahía Negra', 'paraguay-alto-paraguay', 'Distrito del departamento de Alto Paraguay', -19.893055, -59.964252),
  ('paraguay-alto-paraguay-carmelo-peralta', 'Carmelo Peralta', 'paraguay-alto-paraguay', 'Distrito del departamento de Alto Paraguay', -21.650506, -58.287785),
  ('paraguay-alto-paraguay-fuerte-olimpo', 'Fuerte Olimpo', 'paraguay-alto-paraguay', 'Distrito del departamento de Alto Paraguay', -20.801787, -58.908926),
  ('paraguay-alto-paraguay-puerto-casado', 'Puerto Casado', 'paraguay-alto-paraguay', 'Distrito del departamento de Alto Paraguay', -21.813334, -59.086692),
  ('paraguay-alto-parana-ciudad-del-este', 'Ciudad del Este', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.499413, -54.679991),
  ('paraguay-alto-parana-domingo-martinez-de-irala', 'Domingo Martínez de Irala', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.858221, -54.690235),
  ('paraguay-alto-parana-dr-juan-leon-mallorquin', 'Dr. Juan León Mallorquín', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.48375, -55.254533),
  ('paraguay-alto-parana-dr-raul-pena', 'Dr. Raúl Peña', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -26.134946, -55.224891),
  ('paraguay-alto-parana-hernandarias', 'Hernandarias', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.350761, -54.655643),
  ('paraguay-alto-parana-iruna', 'Iruña', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -26.132833, -55.033449),
  ('paraguay-alto-parana-itakyry', 'Itakyry', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -24.814186, -55.152668),
  ('paraguay-alto-parana-juan-e-o-leary', 'Juan E. O''Leary', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.480059, -55.365111),
  ('paraguay-alto-parana-los-cedrales', 'Los Cedrales', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.686016, -54.751324),
  ('paraguay-alto-parana-mbaracayu', 'Mbaracayú', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.015289, -54.689142),
  ('paraguay-alto-parana-minga-guazu', 'Minga Guazú', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.503329, -54.841898),
  ('paraguay-alto-parana-minga-pora', 'Minga Porá', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -24.762167, -54.86545),
  ('paraguay-alto-parana-nacunday', 'Ñacunday', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -26.069493, -54.781578),
  ('paraguay-alto-parana-naranjal', 'Naranjal', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.955033, -55.198984),
  ('paraguay-alto-parana-presidente-franco', 'Presidente Franco', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.598415, -54.640697),
  ('paraguay-alto-parana-san-alberto', 'San Alberto', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -24.79312, -54.526456),
  ('paraguay-alto-parana-san-cristobal', 'San Cristóbal', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.785735, -55.386061),
  ('paraguay-alto-parana-santa-fe-del-parana', 'Santa Fe del Paraná', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.189077, -54.628328),
  ('paraguay-alto-parana-santa-rita', 'Santa Rita', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.774212, -55.134678),
  ('paraguay-alto-parana-santa-rosa-del-monday', 'Santa Rosa del Monday', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.845616, -54.923178),
  ('paraguay-alto-parana-tavapy', 'Tavapy', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.624522, -55.07143),
  ('paraguay-alto-parana-yguazu', 'Yguazú', 'paraguay-alto-parana', 'Distrito del departamento de Alto Paraná', -25.417794, -55.100237),
  ('paraguay-amambay-bella-vista', 'Bella Vista', 'paraguay-amambay', 'Distrito del departamento de Amambay', -22.470828, -56.454791),
  ('paraguay-amambay-capitan-bado', 'Capitán Bado', 'paraguay-amambay', 'Distrito del departamento de Amambay', -23.411491, -55.7622),
  ('paraguay-amambay-cerro-cora', 'Cerro Corá', 'paraguay-amambay', 'Distrito del departamento de Amambay', -22.727867, -56.071019),
  ('paraguay-amambay-karapai', 'Karapaí', 'paraguay-amambay', 'Distrito del departamento de Amambay', -23.480891, -56.036042),
  ('paraguay-amambay-pedro-juan-caballero', 'Pedro Juan Caballero', 'paraguay-amambay', 'Distrito del departamento de Amambay', -23.051544, -55.985309),
  ('paraguay-amambay-zanja-pyta', 'Zanja Pyta', 'paraguay-amambay', 'Distrito del departamento de Amambay', -22.772145, -55.708652),
  ('paraguay-boqueron-boqueron', 'Boquerón', 'paraguay-boqueron', 'Distrito del departamento de Boquerón', -22.998268, -60.922402),
  ('paraguay-boqueron-filadelfia', 'Filadelfia', 'paraguay-boqueron', 'Distrito del departamento de Boquerón', -21.437402, -60.178666),
  ('paraguay-boqueron-loma-plata', 'Loma Plata', 'paraguay-boqueron', 'Distrito del departamento de Boquerón', -22.241834, -59.664035),
  ('paraguay-boqueron-mariscal-jose-felix-estigarribia', 'Mariscal José Félix Estigarribia', 'paraguay-boqueron', 'Distrito del departamento de Boquerón', -21.443544, -61.469955),
  ('paraguay-caaguazu-3-de-febrero', '3 de Febrero', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.212614, -55.808083),
  ('paraguay-caaguazu-caaguazu', 'Caaguazú', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.419216, -56.051728),
  ('paraguay-caaguazu-carayao', 'Carayaó', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.241602, -56.311342),
  ('paraguay-caaguazu-coronel-oviedo', 'Coronel Oviedo', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.486581, -56.421111),
  ('paraguay-caaguazu-dr-cecilio-baez', 'Dr. Cecilio Báez', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.089121, -56.230854),
  ('paraguay-caaguazu-dr-j-eulogio-estigarribia', 'Dr. J. Eulogio Estigarribia', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.402858, -55.594056),
  ('paraguay-caaguazu-dr-juan-manuel-frutos', 'Dr. Juan Manuel Frutos', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.362111, -55.821632),
  ('paraguay-caaguazu-jose-domingo-ocampos', 'José Domingo Ocampos', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.44037, -55.437636),
  ('paraguay-caaguazu-la-pastora', 'La Pastora', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.235912, -56.550969),
  ('paraguay-caaguazu-mariscal-francisco-solano-lopez', 'Mariscal Francisco Solano López', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.179476, -55.180127),
  ('paraguay-caaguazu-nueva-londres', 'Nueva Londres', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.419991, -56.566049),
  ('paraguay-caaguazu-nueva-toledo', 'Nueva Toledo', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -24.974211, -55.490369),
  ('paraguay-caaguazu-r-i-3-corrales', 'R.I. 3 Corrales', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.337817, -56.162069),
  ('paraguay-caaguazu-raul-arsenio-oviedo', 'Raúl Arsenio Oviedo', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.15375, -55.575474),
  ('paraguay-caaguazu-repatriacion', 'Repatriación', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.583951, -55.803085),
  ('paraguay-caaguazu-san-joaquin', 'San Joaquín', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.044908, -56.050253),
  ('paraguay-caaguazu-san-jose-de-los-arroyos', 'San José de los Arroyos', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.544144, -56.695912),
  ('paraguay-caaguazu-santa-rosa-del-mbutuy', 'Santa Rosa del Mbutuy', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -24.969675, -56.260375),
  ('paraguay-caaguazu-simon-bolivar', 'Simón Bolivar', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.05663, -56.353219),
  ('paraguay-caaguazu-tembiapora', 'Tembiaporá', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.258781, -55.390494),
  ('paraguay-caaguazu-vaqueria', 'Vaquería', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -24.867195, -55.507476),
  ('paraguay-caaguazu-yhu', 'Yhú', 'paraguay-caaguazu', 'Distrito del departamento de Caaguazú', -25.086013, -55.862001),
  ('paraguay-caazapa-3-de-mayo', '3 de Mayo', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.439947, -56.062802),
  ('paraguay-caazapa-abai', 'Abaí', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -25.882618, -55.708855),
  ('paraguay-caazapa-buena-vista', 'Buena Vista', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.220982, -56.082786),
  ('paraguay-caazapa-caazapa', 'Caazapá', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.178807, -56.288311),
  ('paraguay-caazapa-dr-moises-s-bertoni', 'Dr. Moisés S. Bertoni', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.381816, -56.594579),
  ('paraguay-caazapa-gral-higinio-morinigo', 'Gral. Higinio Morinigo', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.073706, -56.104628),
  ('paraguay-caazapa-maciel', 'Maciel', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.220557, -56.513323),
  ('paraguay-caazapa-san-juan-nepomuceno', 'San Juan Nepomuceno', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.231455, -55.900663),
  ('paraguay-caazapa-tavai', 'Tavaí', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.188236, -55.529953),
  ('paraguay-caazapa-yegros', 'Yegros', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.54205, -56.562006),
  ('paraguay-caazapa-yuty', 'Yuty', 'paraguay-caazapa', 'Distrito del departamento de Caazapá', -26.674044, -56.378486),
  ('paraguay-canindeyu-corpus-christi', 'Corpus Christi', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.103799, -54.986992),
  ('paraguay-canindeyu-francisco-caballero-alvarez', 'Francisco Caballero Alvarez', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.170891, -54.708149),
  ('paraguay-canindeyu-itanara', 'Itanará', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -23.761044, -55.662176),
  ('paraguay-canindeyu-katuete', 'Katueté', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.329576, -54.737537),
  ('paraguay-canindeyu-la-paloma-del-espiritu-santo', 'La Paloma del Espíritu Santo', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.194398, -54.565531),
  ('paraguay-canindeyu-laurel', 'Laurel', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.517457, -55.039779),
  ('paraguay-canindeyu-maracana', 'Maracaná', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.213069, -55.991159),
  ('paraguay-canindeyu-nueva-esperanza', 'Nueva Esperanza', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.606903, -54.607011),
  ('paraguay-canindeyu-puerto-adela', 'Puerto Adela', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.443837, -54.465068),
  ('paraguay-canindeyu-salto-del-guaira', 'Salto del Guairá', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.083097, -54.465185),
  ('paraguay-canindeyu-villa-curuguaty', 'Villa Curuguaty', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.41099, -55.667008),
  ('paraguay-canindeyu-villa-ygatimi', 'Villa Ygatimí', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.084501, -55.525812),
  ('paraguay-canindeyu-yasy-cany', 'Yasy Cañy', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.562547, -55.869795),
  ('paraguay-canindeyu-yby-pyta', 'Yby Pytá', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.286997, -55.351084),
  ('paraguay-canindeyu-ybyrarobana', 'Ybyrarobaná', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -24.33601, -55.119505),
  ('paraguay-canindeyu-ypejhu', 'Ypejhú', 'paraguay-canindeyu', 'Distrito del departamento de Canindeyú', -23.92808, -55.767766),
  ('paraguay-central-aregua', 'Areguá', 'paraguay-central', 'Distrito del departamento de Central', -25.293894, -57.38628),
  ('paraguay-central-capiata', 'Capiatá', 'paraguay-central', 'Distrito del departamento de Central', -25.369472, -57.457531),
  ('paraguay-central-fernando-de-la-mora', 'Fernando de la Mora', 'paraguay-central', 'Distrito del departamento de Central', -25.327819, -57.55073),
  ('paraguay-central-guarambare', 'Guarambaré', 'paraguay-central', 'Distrito del departamento de Central', -25.488678, -57.451855),
  ('paraguay-central-ita', 'Itá', 'paraguay-central', 'Distrito del departamento de Central', -25.529726, -57.374405),
  ('paraguay-central-itaugua', 'Itauguá', 'paraguay-central', 'Distrito del departamento de Central', -25.393576, -57.353239),
  ('paraguay-central-j-augusto-saldivar', 'J. Augusto Saldívar', 'paraguay-central', 'Distrito del departamento de Central', -25.432654, -57.433838),
  ('paraguay-central-lambare', 'Lambaré', 'paraguay-central', 'Distrito del departamento de Central', -25.353553, -57.615698),
  ('paraguay-central-limpio', 'Limpio', 'paraguay-central', 'Distrito del departamento de Central', -25.157456, -57.475059),
  ('paraguay-central-luque', 'Luque', 'paraguay-central', 'Distrito del departamento de Central', -25.250555, -57.457239),
  ('paraguay-central-mariano-roque-alonso', 'Mariano Roque Alonso', 'paraguay-central', 'Distrito del departamento de Central', -25.201105, -57.531358),
  ('paraguay-central-nemby', 'Ñemby', 'paraguay-central', 'Distrito del departamento de Central', -25.397043, -57.538093),
  ('paraguay-central-nueva-italia', 'Nueva Italia', 'paraguay-central', 'Distrito del departamento de Central', -25.859184, -57.464085),
  ('paraguay-central-san-antonio', 'San Antonio', 'paraguay-central', 'Distrito del departamento de Central', -25.418397, -57.56194),
  ('paraguay-central-san-lorenzo', 'San Lorenzo', 'paraguay-central', 'Distrito del departamento de Central', -25.351443, -57.511096),
  ('paraguay-central-villa-elisa', 'Villa Elisa', 'paraguay-central', 'Distrito del departamento de Central', -25.373768, -57.587459),
  ('paraguay-central-villeta', 'Villeta', 'paraguay-central', 'Distrito del departamento de Central', -25.711592, -57.607179),
  ('paraguay-central-ypacarai', 'Ypacaraí', 'paraguay-central', 'Distrito del departamento de Central', -25.399941, -57.262202),
  ('paraguay-central-ypane', 'Ypané', 'paraguay-central', 'Distrito del departamento de Central', -25.460461, -57.509328),
  ('paraguay-concepcion-arroyito', 'Arroyito', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.1727, -56.687287),
  ('paraguay-concepcion-azote-y', 'Azote''y', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.32344, -56.501137),
  ('paraguay-concepcion-belen', 'Belén', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.425599, -57.228574),
  ('paraguay-concepcion-concepcion', 'Concepción', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.382939, -57.370756),
  ('paraguay-concepcion-horqueta', 'Horqueta', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.307693, -56.947227),
  ('paraguay-concepcion-itacua', 'Itacuá', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.624651, -57.698738),
  ('paraguay-concepcion-loreto', 'Loreto', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.168476, -57.138358),
  ('paraguay-concepcion-paso-barreto', 'Paso Barreto', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.911619, -56.976435),
  ('paraguay-concepcion-paso-horqueta', 'Paso Horqueta', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -23.109217, -57.503402),
  ('paraguay-concepcion-san-alfredo', 'San Alfredo', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.778476, -57.439494),
  ('paraguay-concepcion-san-carlos-del-apa', 'San Carlos del Apa', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.373834, -57.272567),
  ('paraguay-concepcion-san-lazaro', 'San Lázaro', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.247185, -57.735041),
  ('paraguay-concepcion-sargento-jose-felix-lopez', 'Sargento José Félix López', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.532508, -56.941793),
  ('paraguay-concepcion-yby-yau', 'Yby Yaú', 'paraguay-concepcion', 'Distrito del departamento de Concepción', -22.996074, -56.381365),
  ('paraguay-cordillera-altos', 'Altos', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.245936, -57.221647),
  ('paraguay-cordillera-arroyos-y-esteros', 'Arroyos y Esteros', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.042776, -57.162466),
  ('paraguay-cordillera-atyra', 'Atyrá', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.25993, -57.154589),
  ('paraguay-cordillera-caacupe', 'Caacupé', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.38041, -57.12673),
  ('paraguay-cordillera-caraguatay', 'Caraguatay', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.301026, -56.763273),
  ('paraguay-cordillera-emboscada', 'Emboscada', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.128839, -57.36295),
  ('paraguay-cordillera-eusebio-ayala', 'Eusebio Ayala', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.361194, -56.971451),
  ('paraguay-cordillera-isla-pucu', 'Isla Pucú', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.300835, -56.896097),
  ('paraguay-cordillera-itacurubi-de-la-cordillera', 'Itacurubí de la Cordillera', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.458154, -56.860968),
  ('paraguay-cordillera-juan-de-mena', 'Juan de Mena', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -24.994955, -56.772914),
  ('paraguay-cordillera-loma-grande', 'Loma Grande', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.148498, -57.209207),
  ('paraguay-cordillera-mbocayaty-del-yhaguy', 'Mbocayaty del Yhaguy', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.319175, -56.692309),
  ('paraguay-cordillera-nueva-colombia', 'Nueva Colombia', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.168281, -57.273299),
  ('paraguay-cordillera-piribebuy', 'Piribebuy', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.496369, -57.042192),
  ('paraguay-cordillera-primero-de-marzo', 'Primero de Marzo', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.127132, -56.970936),
  ('paraguay-cordillera-san-bernardino', 'San Bernardino', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.293129, -57.293291),
  ('paraguay-cordillera-san-jose-obrero', 'San José Obrero', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.091074, -56.851615),
  ('paraguay-cordillera-santa-elena', 'Santa Elena', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.395513, -56.780626),
  ('paraguay-cordillera-tobati', 'Tobatí', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.21599, -57.046555),
  ('paraguay-cordillera-valenzuela', 'Valenzuela', 'paraguay-cordillera', 'Distrito del departamento de Cordillera', -25.581227, -56.879877),
  ('paraguay-guaira-borja', 'Borja', 'paraguay-guaira', 'Distrito del departamento de Guairá', -26.034331, -56.610271),
  ('paraguay-guaira-capitan-mauricio-jose-troche', 'Capitán Mauricio José Troche', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.621367, -56.1542),
  ('paraguay-guaira-coronel-martinez', 'Coronel Martínez', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.742151, -56.602031),
  ('paraguay-guaira-doctor-bottrell', 'Doctor Bottrell', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.600861, -56.363793),
  ('paraguay-guaira-felix-perez-cardozo', 'Félix Pérez Cardozo', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.712148, -56.53142),
  ('paraguay-guaira-gral-eugenio-a-garay', 'Gral. Eugenio A. Garay', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.941562, -56.197596),
  ('paraguay-guaira-independencia', 'Independencia', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.761951, -56.167381),
  ('paraguay-guaira-itape', 'Itapé', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.854507, -56.566783),
  ('paraguay-guaira-iturbe', 'Iturbe', 'paraguay-guaira', 'Distrito del departamento de Guairá', -26.072279, -56.471042),
  ('paraguay-guaira-jose-fassardi', 'José Fassardi', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.928498, -56.093846),
  ('paraguay-guaira-mbocayaty', 'Mbocayaty', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.707726, -56.365788),
  ('paraguay-guaira-natalicio-talavera', 'Natalicio Talavera', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.664402, -56.284443),
  ('paraguay-guaira-numi', 'Ñumí', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.916642, -56.314387),
  ('paraguay-guaira-paso-yobai', 'Paso Yobai', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.739173, -55.913258),
  ('paraguay-guaira-san-salvador', 'San Salvador', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.957653, -56.426838),
  ('paraguay-guaira-tebicuary', 'Tebicuary', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.798569, -56.654138),
  ('paraguay-guaira-villarrica', 'Villarrica', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.830981, -56.408368),
  ('paraguay-guaira-yataity', 'Yataity', 'paraguay-guaira', 'Distrito del departamento de Guairá', -25.666246, -56.475346),
  ('paraguay-itapua-alto-vera', 'Alto Verá', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.588336, -55.741981),
  ('paraguay-itapua-bella-vista', 'Bella Vista', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.99528, -55.545126),
  ('paraguay-itapua-cambyreta', 'Cambyretá', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.356429, -55.763503),
  ('paraguay-itapua-capitan-meza', 'Capitán Meza', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.828817, -55.290862),
  ('paraguay-itapua-capitan-miranda', 'Capitán Miranda', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.18966, -55.811689),
  ('paraguay-itapua-carlos-antonio-lopez', 'Carlos Antonio López', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.357384, -54.925698),
  ('paraguay-itapua-carmen-del-parana', 'Carmen del Paraná', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.208451, -56.09826),
  ('paraguay-itapua-coronel-bogado', 'Coronel Bogado', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.115359, -56.386395),
  ('paraguay-itapua-edelira', 'Edelira', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.505937, -55.452563),
  ('paraguay-itapua-encarnacion', 'Encarnación', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.262262, -55.895234),
  ('paraguay-itapua-fram', 'Fram', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.074132, -56.011828),
  ('paraguay-itapua-general-artigas', 'General Artigas', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.905159, -56.375929),
  ('paraguay-itapua-general-delgado', 'General Delgado', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.059518, -56.552196),
  ('paraguay-itapua-hohenau', 'Hohenau', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.088569, -55.643538),
  ('paraguay-itapua-itapua-poty', 'Itapúa Poty', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.561255, -55.545177),
  ('paraguay-itapua-jesus', 'Jesús', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.038336, -55.772449),
  ('paraguay-itapua-jose-leandro-oviedo', 'José Leandro Oviedo', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.743503, -56.236908),
  ('paraguay-itapua-la-paz', 'La Paz', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.977909, -55.89728),
  ('paraguay-itapua-mayor-julio-dionisio-otano', 'Mayor Julio Dionisio Otaño', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.313858, -54.716036),
  ('paraguay-itapua-natalio', 'Natalio', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.734358, -55.139258),
  ('paraguay-itapua-nueva-alborada', 'Nueva Alborada', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.263458, -55.653223),
  ('paraguay-itapua-obligado', 'Obligado', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.921833, -55.708387),
  ('paraguay-itapua-pirapo', 'Pirapó', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.833412, -55.51474),
  ('paraguay-itapua-san-cosme-y-damian', 'San Cosme y Damián', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.354951, -56.504183),
  ('paraguay-itapua-san-juan-del-parana', 'San Juan del Paraná', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.298343, -55.979983),
  ('paraguay-itapua-san-pedro-del-parana', 'San Pedro del Paraná', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.73063, -56.010849),
  ('paraguay-itapua-san-rafael-del-parana', 'San Rafael del Paraná', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.439678, -55.100627),
  ('paraguay-itapua-tomas-romero-pereira', 'Tomás Romero Pereira', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.473468, -55.282483),
  ('paraguay-itapua-trinidad', 'Trinidad', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -27.142362, -55.730741),
  ('paraguay-itapua-yatytay', 'Yatytay', 'paraguay-itapua', 'Distrito del departamento de Itapúa', -26.671862, -55.051767),
  ('paraguay-misiones-ayolas', 'Ayolas', 'paraguay-misiones', 'Distrito del departamento de Misiones', -27.370365, -57.003428),
  ('paraguay-misiones-san-ignacio', 'San Ignacio', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.9589, -57.145572),
  ('paraguay-misiones-san-juan-bautista-de-las-misiones', 'San Juan Bautista de las Misiones', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.712204, -57.405889),
  ('paraguay-misiones-san-miguel', 'San Miguel', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.580907, -56.967654),
  ('paraguay-misiones-san-patricio', 'San Patricio', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.995437, -56.829395),
  ('paraguay-misiones-santa-maria', 'Santa María', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.739268, -56.88897),
  ('paraguay-misiones-santa-rosa', 'Santa Rosa', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.871362, -56.794258),
  ('paraguay-misiones-santiago', 'Santiago', 'paraguay-misiones', 'Distrito del departamento de Misiones', -27.129825, -56.783756),
  ('paraguay-misiones-villa-florida', 'Villa Florida', 'paraguay-misiones', 'Distrito del departamento de Misiones', -26.466893, -57.122912),
  ('paraguay-misiones-yabebyry', 'Yabebyry', 'paraguay-misiones', 'Distrito del departamento de Misiones', -27.256282, -57.143038),
  ('paraguay-neembucu-alberdi', 'Alberdi', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.189921, -58.070904),
  ('paraguay-neembucu-cerrito', 'Cerrito', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.33906, -57.562479),
  ('paraguay-neembucu-desmochados', 'Desmochados', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.087964, -58.124058),
  ('paraguay-neembucu-gral-jose-eduvigis-diaz', 'Gral. José Eduvigis Díaz', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.167914, -58.344003),
  ('paraguay-neembucu-guazu-cua', 'Guazú-cuá', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.92643, -57.99032),
  ('paraguay-neembucu-humaita', 'Humaitá', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.109753, -58.505556),
  ('paraguay-neembucu-isla-umbu', 'Isla Umbú', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.978268, -58.317633),
  ('paraguay-neembucu-laureles', 'Laureles', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.180914, -57.618618),
  ('paraguay-neembucu-mayor-jose-dejesus-martinez', 'Mayor José Dejesús Martínez', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.213686, -58.140845),
  ('paraguay-neembucu-paso-de-patria', 'Paso de Patria', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.227337, -58.514548),
  ('paraguay-neembucu-pilar', 'Pilar', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.851148, -58.290803),
  ('paraguay-neembucu-san-juan-bautista-de-neembucu', 'San Juan Bautista de Ñeembucú', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.610163, -57.85772),
  ('paraguay-neembucu-tacuaras', 'Tacuaras', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.916797, -57.721588),
  ('paraguay-neembucu-villa-franca', 'Villa Franca', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.347354, -57.960241),
  ('paraguay-neembucu-villa-oliva', 'Villa Oliva', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -26.044147, -57.727556),
  ('paraguay-neembucu-villalbin', 'Villalbín', 'paraguay-neembucu', 'Distrito del departamento de Ñeembucú', -27.178591, -57.915109),
  ('paraguay-paraguari-acahay', 'Acahay', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.88932, -57.076595),
  ('paraguay-paraguari-caapucu', 'Caapucú', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -26.337452, -57.384496),
  ('paraguay-paraguari-caballero', 'Caballero', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.760048, -56.886128),
  ('paraguay-paraguari-carapegua', 'Carapeguá', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.744414, -57.302646),
  ('paraguay-paraguari-escobar', 'Escobar', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.720918, -57.008383),
  ('paraguay-paraguari-la-colmena', 'La Colmena', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.90225, -56.823127),
  ('paraguay-paraguari-maria-antonia', 'María Antonia', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -26.416336, -56.885041),
  ('paraguay-paraguari-mbuyapey', 'Mbuyapey', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -26.217505, -56.770402),
  ('paraguay-paraguari-paraguari', 'Paraguarí', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.679939, -57.1421),
  ('paraguay-paraguari-pirayu', 'Pirayú', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.477164, -57.214453),
  ('paraguay-paraguari-quiindy', 'Quiindy', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -26.001972, -57.302512),
  ('paraguay-paraguari-quyquyho', 'Quyquyhó', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -26.253387, -57.009874),
  ('paraguay-paraguari-roque-gonzalez-de-santa-cruz', 'Roque Gonzalez de Santa Cruz', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.865571, -57.305076),
  ('paraguay-paraguari-sapucai', 'Sapucái', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.701531, -56.937737),
  ('paraguay-paraguari-tebicuary-mi', 'Tebicuary-mí', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.918016, -56.674786),
  ('paraguay-paraguari-yaguaron', 'Yaguarón', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.598684, -57.274766),
  ('paraguay-paraguari-ybycui', 'Ybycuí', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -26.038392, -56.937655),
  ('paraguay-paraguari-ybytymi', 'Ybytymí', 'paraguay-paraguari', 'Distrito del departamento de Paraguarí', -25.780943, -56.767048),
  ('paraguay-presidente-hayes-benjamin-aceval', 'Benjamín Aceval', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -24.396161, -58.045256),
  ('paraguay-presidente-hayes-campo-aceval', 'Campo Aceval', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -23.462391, -59.822037),
  ('paraguay-presidente-hayes-general-jose-maria-bruguez', 'General José María Bruguez', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -24.31216, -58.875213),
  ('paraguay-presidente-hayes-jose-falcon', 'José Falcón', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -24.909689, -58.124103),
  ('paraguay-presidente-hayes-nanawa', 'Nanawa', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -25.305942, -57.686674),
  ('paraguay-presidente-hayes-nueva-asuncion', 'Nueva Asunción', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -25.227235, -57.626486),
  ('paraguay-presidente-hayes-puerto-pinasco', 'Puerto Pinasco', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -22.758808, -58.490172),
  ('paraguay-presidente-hayes-teniente-esteban-martinez', 'Teniente Esteban Martínez', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -24.012446, -59.504664),
  ('paraguay-presidente-hayes-tte-1-manuel-irala-fernandez', 'Tte. 1° Manuel Irala Fernández', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -22.664727, -59.436518),
  ('paraguay-presidente-hayes-villa-hayes', 'Villa Hayes', 'paraguay-presidente-hayes', 'Distrito del departamento de Presidente Hayes', -23.595017, -58.28326),
  ('paraguay-san-pedro-25-de-diciembre', '25 de Diciembre', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.772559, -56.801263),
  ('paraguay-san-pedro-antequera', 'Antequera', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.158067, -57.22901),
  ('paraguay-san-pedro-capiibary', 'Capiibary', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.745879, -55.991597),
  ('paraguay-san-pedro-chore', 'Choré', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.184314, -56.632885),
  ('paraguay-san-pedro-general-elizardo-aquino', 'General Elizardo Aquino', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.407699, -56.789117),
  ('paraguay-san-pedro-general-francisco-isidoro-resquin', 'General Francisco Isidoro Resquín', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.022443, -56.355019),
  ('paraguay-san-pedro-guajayvi', 'Guajayvi', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.407866, -56.34811),
  ('paraguay-san-pedro-itacurubi-del-rosario', 'Itacurubí del Rosario', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.582385, -56.819593),
  ('paraguay-san-pedro-liberacion', 'Liberación', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.196401, -56.378378),
  ('paraguay-san-pedro-lima', 'Lima', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -23.978333, -56.569352),
  ('paraguay-san-pedro-nueva-germania', 'Nueva Germania', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -23.583914, -56.269848),
  ('paraguay-san-pedro-san-estanislao', 'San Estanislao', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.645818, -56.392447),
  ('paraguay-san-pedro-san-jose-del-rosario', 'San José del Rosario', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.279456, -56.937389),
  ('paraguay-san-pedro-san-pablo', 'San Pablo', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.140153, -56.92435),
  ('paraguay-san-pedro-san-pedro-del-ycuamandyyu', 'San Pedro del Ycuamandyyú', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -23.894119, -56.89142),
  ('paraguay-san-pedro-san-vicente-pancholo', 'San Vicente Pancholo', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.024203, -56.117598),
  ('paraguay-san-pedro-santa-rosa-del-aguaray', 'Santa Rosa del Aguaray', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -23.759058, -56.271881),
  ('paraguay-san-pedro-tacuati', 'Tacuatí', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -23.579401, -56.771483),
  ('paraguay-san-pedro-union', 'Unión', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.869903, -56.530898),
  ('paraguay-san-pedro-villa-del-rosario', 'Villa del Rosario', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.664707, -57.110632),
  ('paraguay-san-pedro-yataity-del-norte', 'Yataity del Norte', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.83738, -56.329043),
  ('paraguay-san-pedro-yrybucua', 'Yrybucua', 'paraguay-san-pedro', 'Distrito del departamento de San Pedro', -24.504725, -56.137082);

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
      and p.path = 'earth.south-america.paraguay.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0079_MISSING_DEPARTMENT: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0079_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 262;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.south-america.paraguay.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0079_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
