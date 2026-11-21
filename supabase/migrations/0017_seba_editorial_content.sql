-- =============================================================================
-- Agorbis · 0017 · Contenido editorial inicial atribuido a Seba
-- -----------------------------------------------------------------------------
-- Investigación consultada en agosto de 2026:
-- · ONU: gobernanza de IA y seguridad alimentaria.
-- · Comisión Europea, BID, ADB y Unión Africana: vivienda, energía, empleo,
--   calidad del aire, integración y resiliencia climática.
-- · Provincia de Buenos Aires: prevención ante El Niño e infraestructura 2026.
-- · Mar del Plata: residuos, transporte, erosión y contaminación portuaria.
-- · General Alvarado: Hospital Subzonal Miramar, frente costero, hospital de
--   Otamendi y reparación del acceso a Mechongué.
-- · Necochea: transporte urbano, caminos rurales, tránsito portuario, erosión,
--   iluminación y Estación Transformadora Quequén.
--
-- Las publicaciones se fechan entre junio y julio de 2026 para que esta carga
-- editorial no consuma la cuota personal del autor en el mes de despliegue.
-- Todos los INSERT son idempotentes por comunidad + título/pregunta.
-- Fuentes y criterio editorial: docs/EDITORIAL_CONTENT.md.
-- =============================================================================

begin;

create temporary table geounity_editorial_author on commit drop as
select (
  select p.id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = 'seba'
     or lower(u.email) = 'sebastiancardoso92@gmail.com'
  order by case when lower(p.username) = 'seba' then 0 else 1 end
  limit 1
) as id;

do $$
begin
  if not exists (select 1 from geounity_editorial_author where id is not null) then
    -- En `supabase db reset` las migraciones corren antes que seed.sql, por lo
    -- que todavía no existe ningún perfil. El contenido se crea igualmente con
    -- autor anónimo. En producción, donde @seba ya existe, queda atribuido.
    raise notice 'No existe @seba todavía; el contenido editorial se crea sin autor';
  end if;
end;
$$;

-- Localidades solicitadas que todavía no estaban modeladas directamente.
insert into public.communities (
  slug, name, level, parent_id, path, emoji, description, lat, lng
)
select
  i.slug, i.name, 4, p.id, 'earth.south-america.argentina.buenos-aires.' || i.slug,
  i.emoji, i.description, i.lat, i.lng
from (values
  ('mar-del-sud', 'Mar del Sud', '🌊', 'Localidad costera del partido de General Alvarado', -38.3433, -57.9902),
  ('otamendi', 'Comandante Nicanor Otamendi', '🌾', 'Localidad productiva del partido de General Alvarado', -38.1110, -57.8390),
  ('mechongue', 'Mechongué', '🌻', 'Localidad rural del partido de General Alvarado', -38.1470, -58.2210)
) as i (slug, name, emoji, description, lat, lng)
join public.communities p on p.slug = 'buenos-aires' and p.level = 3
on conflict (slug) do nothing;

-- =============================================================================
-- Encuestas · Tierra, continentes, Argentina, Buenos Aires y seis localidades
-- =============================================================================
insert into public.polls (
  community_id, author_id, question, description, type, category, max_choices,
  closes_at, results_visibility, created_at
)
select
  c.id, a.id, p.question, p.description, p.type, p.category,
  p.max_choices::smallint, now() + interval '180 days', 'after_close',
  p.created_at::timestamptz
from (values
  ('earth',
   '¿Qué regla global sobre inteligencia artificial debería acordarse primero?',
   'La ONU abrió en 2026 su diálogo mundial sobre gobernanza de IA. Elegí la protección que considerás más urgente.',
   'single', 'tecnologia', null, '2026-07-30 12:00:00+00'),
  ('earth',
   '¿En qué debería concentrarse un fondo mundial contra el hambre?',
   'La seguridad alimentaria depende tanto de producir como de almacenar, distribuir y resistir sequías, inundaciones y conflictos.',
   'multiple', 'comunidad', 2, '2026-07-28 12:00:00+00'),

  ('africa',
   '¿Qué prioridad energética generaría más desarrollo local en África?',
   'El crecimiento solar abre una discusión sobre acceso eléctrico, fabricación local, empleo y dependencia tecnológica.',
   'single', 'economia', null, '2026-07-26 12:00:00+00'),
  ('north-america',
   '¿Qué medida ayudaría más a resolver la falta de vivienda asequible en América del Norte?',
   'El costo de vivienda, suelo y energía presiona a ciudades grandes y medianas de Canadá, Estados Unidos y México.',
   'single', 'comunidad', null, '2026-07-25 12:00:00+00'),
  ('south-america',
   '¿Cómo debería aprovechar Sudamérica sus minerales críticos?',
   'La transición energética aumenta la demanda de litio, cobre y otros minerales. La pregunta es cuánto valor debe quedar en la región.',
   'single', 'economia', null, '2026-07-24 12:00:00+00'),
  ('asia',
   '¿Qué política regional reduciría más rápido la contaminación del aire en las grandes ciudades asiáticas?',
   'La mala calidad del aire cruza fronteras y afecta salud, productividad y educación.',
   'single', 'ambiente', null, '2026-07-23 12:00:00+00'),
  ('europe',
   '¿Cuál debería ser la prioridad europea para abaratar la vivienda?',
   'La vivienda asequible aparece entre las prioridades comunes de la Unión Europea para 2026.',
   'single', 'comunidad', null, '2026-07-22 12:00:00+00'),
  ('oceania',
   '¿Debería Oceanía crear un acuerdo regional de movilidad por causas climáticas?',
   'Los pequeños Estados insulares necesitan opciones que protejan ciudadanía, cultura y soberanía cuando el territorio se vuelve inhabitable.',
   'binary', 'ambiente', null, '2026-07-21 12:00:00+00'),

  ('argentina',
   '¿Qué debería priorizar Argentina para que la mejora macroeconómica llegue a los hogares?',
   'El debate de 2026 combina menor inflación con diferencias entre sectores, empleo precario y pérdida de ingresos en parte de la población.',
   'single', 'economia', null, '2026-07-20 12:00:00+00'),
  ('argentina',
   '¿Qué medida reduciría mejor la informalidad laboral en Argentina?',
   'Buscamos propuestas que ayuden a formalizar sin expulsar del mercado a pequeños comercios, cooperativas y trabajadores independientes.',
   'single', 'economia', null, '2026-07-19 12:00:00+00'),
  ('argentina',
   '¿Cuál debería ser la primera inversión educativa nacional?',
   'Salarios, infraestructura, aprendizajes y conectividad compiten por recursos escasos, pero se necesitan mutuamente.',
   'single', 'educacion', null, '2026-07-18 12:00:00+00'),
  ('argentina',
   '¿Cómo debería distribuirse la renta adicional de las exportaciones energéticas?',
   'Vaca Muerta y la infraestructura exportadora pueden cambiar las cuentas externas. ¿Qué destino debería tener ese margen?',
   'single', 'economia', null, '2026-07-17 12:00:00+00'),
  ('argentina',
   '¿Qué corredor ferroviario de pasajeros debería recuperarse primero?',
   'Elegí por impacto federal, población beneficiada y posibilidad real de sostener frecuencias útiles.',
   'single', 'transporte', null, '2026-07-16 12:00:00+00'),

  ('buenos-aires',
   '¿Cuál es la obra más urgente para preparar a la provincia ante lluvias intensas?',
   'La Provincia anticipó mayor riesgo de precipitaciones por El Niño para primavera y verano.',
   'single', 'ambiente', null, '2026-07-15 12:00:00+00'),
  ('buenos-aires',
   '¿Qué integración de transporte necesita primero la provincia de Buenos Aires?',
   'Viajar entre ciudades bonaerenses suele exigir combinaciones largas o pasar por el área metropolitana.',
   'single', 'transporte', null, '2026-07-14 12:00:00+00'),
  ('buenos-aires',
   '¿Qué información provincial debería publicarse en un tablero único?',
   'Elegí el conjunto de datos que más ayudaría a controlar servicios y orientar decisiones vecinales.',
   'multiple', 'tecnologia', 2, '2026-07-13 12:00:00+00'),

  ('mar-del-plata',
   '¿Qué debería exigir el próximo contrato de higiene urbana de Mar del Plata?',
   'Los residuos y microbasurales siguen entre los reclamos más repetidos de 2026.',
   'multiple', 'ambiente', 2, '2026-07-12 12:00:00+00'),
  ('mar-del-plata',
   '¿Cuál debería ser la prioridad del nuevo sistema de transporte marplatense?',
   'Frecuencias, recorridos, estado de unidades y datos abiertos aparecen de forma recurrente en la conversación local.',
   'single', 'transporte', null, '2026-07-11 12:00:00+00'),

  ('miramar',
   '¿Qué servicio debería priorizar la segunda etapa del Hospital Subzonal Miramar?',
   'La primera etapa fue licitada en 2026; quirófanos e internación quedaron planteados para una etapa posterior.',
   'single', 'salud', null, '2026-07-10 12:00:00+00'),
  ('miramar',
   '¿Qué objetivo debería guiar el nuevo frente costero de Miramar?',
   'El Master Plan costero debe equilibrar defensa de la playa, acceso público, actividad económica y paisaje.',
   'single', 'ambiente', null, '2026-07-09 12:00:00+00'),

  ('mar-del-sud',
   '¿Qué servicio necesita con mayor urgencia Mar del Sud durante todo el año?',
   'La localidad cambia mucho entre invierno y verano. Elegí la mejora que más beneficiaría a residentes permanentes.',
   'single', 'comunidad', null, '2026-07-08 12:00:00+00'),
  ('mar-del-sud',
   '¿Cómo debería crecer Mar del Sud sin perder su identidad costera?',
   'La discusión busca compatibilizar vivienda, turismo, arroyos, dunas, patrimonio y acceso público al mar.',
   'single', 'ambiente', null, '2026-07-07 12:00:00+00'),

  ('otamendi',
   '¿Qué servicio debe incorporarse primero al futuro hospital de Otamendi?',
   'En 2026 se presentó formalmente la transformación del centro de salud local en hospital.',
   'single', 'salud', null, '2026-07-06 12:00:00+00'),
  ('otamendi',
   '¿Qué infraestructura productiva necesita más Comandante Nicanor Otamendi?',
   'La localidad conecta producción intensiva, trabajo rural y servicios urbanos.',
   'single', 'economia', null, '2026-07-05 12:00:00+00'),

  ('mechongue',
   '¿Qué control debería asegurar que el acceso reparado a Mechongué se mantenga?',
   'La reparación llegó después de décadas de reclamos. Ahora importa evitar que el camino vuelva a deteriorarse.',
   'single', 'transporte', null, '2026-07-04 12:00:00+00'),
  ('mechongue',
   '¿Qué ayudaría más a que jóvenes y familias permanezcan en Mechongué?',
   'Conectividad vial y digital, educación, vivienda y empleo se refuerzan entre sí.',
   'single', 'comunidad', null, '2026-07-03 12:00:00+00'),

  ('necochea',
   '¿Qué cambio necesita primero el transporte urbano de Necochea y Quequén?',
   'Durante 2026 hubo quejas por roturas, demoras, frecuencias reducidas y conflictos que dejaron a usuarios sin servicio.',
   'single', 'transporte', null, '2026-07-02 12:00:00+00'),
  ('necochea',
   '¿Cómo debería ordenarse el tránsito pesado hacia Puerto Quequén?',
   'El desafío es sostener la actividad portuaria y sacar camiones de zonas residenciales sin trasladar el problema a otros barrios.',
   'single', 'transporte', null, '2026-07-01 12:00:00+00')
) as p (community_slug, question, description, type, category, max_choices, created_at)
join public.communities c on c.slug = p.community_slug
cross join geounity_editorial_author a
where not exists (
  select 1 from public.polls existing
  where existing.community_id = c.id and existing.question = p.question
);

insert into public.poll_options (poll_id, label, sort_order)
select p.id, o.label, o.sort_order::smallint
from (values
  ('earth', '¿Qué regla global sobre inteligencia artificial debería acordarse primero?', 'Prohibir armas totalmente autónomas', 0),
  ('earth', '¿Qué regla global sobre inteligencia artificial debería acordarse primero?', 'Exigir auditorías para sistemas de alto riesgo', 1),
  ('earth', '¿Qué regla global sobre inteligencia artificial debería acordarse primero?', 'Proteger datos personales y culturales', 2),
  ('earth', '¿Qué regla global sobre inteligencia artificial debería acordarse primero?', 'Garantizar acceso equitativo a la tecnología', 3),
  ('earth', '¿En qué debería concentrarse un fondo mundial contra el hambre?', 'Agricultura resistente al clima', 0),
  ('earth', '¿En qué debería concentrarse un fondo mundial contra el hambre?', 'Almacenamiento y reducción de pérdidas', 1),
  ('earth', '¿En qué debería concentrarse un fondo mundial contra el hambre?', 'Nutrición infantil y comedores', 2),
  ('earth', '¿En qué debería concentrarse un fondo mundial contra el hambre?', 'Respuesta rápida ante conflictos y desastres', 3),

  ('africa', '¿Qué prioridad energética generaría más desarrollo local en África?', 'Mini redes solares para comunidades sin conexión', 0),
  ('africa', '¿Qué prioridad energética generaría más desarrollo local en África?', 'Fabricación africana de paneles y baterías', 1),
  ('africa', '¿Qué prioridad energética generaría más desarrollo local en África?', 'Grandes redes eléctricas regionales', 2),
  ('africa', '¿Qué prioridad energética generaría más desarrollo local en África?', 'Formación masiva de técnicos e instaladores', 3),
  ('north-america', '¿Qué medida ayudaría más a resolver la falta de vivienda asequible en América del Norte?', 'Construir vivienda pública y cooperativa', 0),
  ('north-america', '¿Qué medida ayudaría más a resolver la falta de vivienda asequible en América del Norte?', 'Permitir mayor densidad cerca del transporte', 1),
  ('north-america', '¿Qué medida ayudaría más a resolver la falta de vivienda asequible en América del Norte?', 'Regular alquileres temporarios', 2),
  ('north-america', '¿Qué medida ayudaría más a resolver la falta de vivienda asequible en América del Norte?', 'Ayudar a compradores e inquilinos con ingresos medios', 3),
  ('south-america', '¿Cómo debería aprovechar Sudamérica sus minerales críticos?', 'Exportar y cobrar regalías competitivas', 0),
  ('south-america', '¿Cómo debería aprovechar Sudamérica sus minerales críticos?', 'Fabricar baterías y componentes en la región', 1),
  ('south-america', '¿Cómo debería aprovechar Sudamérica sus minerales críticos?', 'Crear una empresa o alianza regional', 2),
  ('south-america', '¿Cómo debería aprovechar Sudamérica sus minerales críticos?', 'Limitar la extracción hasta mejorar controles ambientales', 3),
  ('asia', '¿Qué política regional reduciría más rápido la contaminación del aire en las grandes ciudades asiáticas?', 'Transporte público eléctrico', 0),
  ('asia', '¿Qué política regional reduciría más rápido la contaminación del aire en las grandes ciudades asiáticas?', 'Normas comunes para industrias y centrales', 1),
  ('asia', '¿Qué política regional reduciría más rápido la contaminación del aire en las grandes ciudades asiáticas?', 'Eliminar quemas agrícolas y de residuos', 2),
  ('asia', '¿Qué política regional reduciría más rápido la contaminación del aire en las grandes ciudades asiáticas?', 'Red pública regional de sensores y alertas', 3),
  ('europe', '¿Cuál debería ser la prioridad europea para abaratar la vivienda?', 'Construir vivienda social', 0),
  ('europe', '¿Cuál debería ser la prioridad europea para abaratar la vivienda?', 'Rehabilitar edificios vacíos', 1),
  ('europe', '¿Cuál debería ser la prioridad europea para abaratar la vivienda?', 'Limitar alquileres turísticos', 2),
  ('europe', '¿Cuál debería ser la prioridad europea para abaratar la vivienda?', 'Acelerar permisos y construcción privada', 3),
  ('oceania', '¿Debería Oceanía crear un acuerdo regional de movilidad por causas climáticas?', 'Sí', 0),
  ('oceania', '¿Debería Oceanía crear un acuerdo regional de movilidad por causas climáticas?', 'No', 1),

  ('argentina', '¿Qué debería priorizar Argentina para que la mejora macroeconómica llegue a los hogares?', 'Empleo formal y salarios', 0),
  ('argentina', '¿Qué debería priorizar Argentina para que la mejora macroeconómica llegue a los hogares?', 'Crédito para pymes y producción', 1),
  ('argentina', '¿Qué debería priorizar Argentina para que la mejora macroeconómica llegue a los hogares?', 'Jubilaciones y protección social', 2),
  ('argentina', '¿Qué debería priorizar Argentina para que la mejora macroeconómica llegue a los hogares?', 'Bajar impuestos al consumo', 3),
  ('argentina', '¿Qué medida reduciría mejor la informalidad laboral en Argentina?', 'Régimen simple y barato para pequeñas empresas', 0),
  ('argentina', '¿Qué medida reduciría mejor la informalidad laboral en Argentina?', 'Reducir cargas al primer empleo formal', 1),
  ('argentina', '¿Qué medida reduciría mejor la informalidad laboral en Argentina?', 'Fiscalización y sanciones más efectivas', 2),
  ('argentina', '¿Qué medida reduciría mejor la informalidad laboral en Argentina?', 'Derechos portables para independientes y plataformas', 3),
  ('argentina', '¿Cuál debería ser la primera inversión educativa nacional?', 'Salarios y formación docente', 0),
  ('argentina', '¿Cuál debería ser la primera inversión educativa nacional?', 'Edificios, calefacción y conectividad', 1),
  ('argentina', '¿Cuál debería ser la primera inversión educativa nacional?', 'Alfabetización y matemática', 2),
  ('argentina', '¿Cuál debería ser la primera inversión educativa nacional?', 'Becas y permanencia estudiantil', 3),
  ('argentina', '¿Cómo debería distribuirse la renta adicional de las exportaciones energéticas?', 'Infraestructura productiva', 0),
  ('argentina', '¿Cómo debería distribuirse la renta adicional de las exportaciones energéticas?', 'Fondo anticíclico para futuras crisis', 1),
  ('argentina', '¿Cómo debería distribuirse la renta adicional de las exportaciones energéticas?', 'Educación, ciencia y tecnología', 2),
  ('argentina', '¿Cómo debería distribuirse la renta adicional de las exportaciones energéticas?', 'Reducción de impuestos y deuda', 3),
  ('argentina', '¿Qué corredor ferroviario de pasajeros debería recuperarse primero?', 'Buenos Aires–Rosario–Córdoba', 0),
  ('argentina', '¿Qué corredor ferroviario de pasajeros debería recuperarse primero?', 'Costa Atlántica y ciudades bonaerenses', 1),
  ('argentina', '¿Qué corredor ferroviario de pasajeros debería recuperarse primero?', 'Cuyo y conexión con Chile', 2),
  ('argentina', '¿Qué corredor ferroviario de pasajeros debería recuperarse primero?', 'NOA: Tucumán–Salta–Jujuy', 3),
  ('argentina', '¿Qué corredor ferroviario de pasajeros debería recuperarse primero?', 'Patagonia norte', 4),

  ('buenos-aires', '¿Cuál es la obra más urgente para preparar a la provincia ante lluvias intensas?', 'Limpieza y ampliación de arroyos y canales', 0),
  ('buenos-aires', '¿Cuál es la obra más urgente para preparar a la provincia ante lluvias intensas?', 'Desagües pluviales urbanos', 1),
  ('buenos-aires', '¿Cuál es la obra más urgente para preparar a la provincia ante lluvias intensas?', 'Caminos y alcantarillas rurales', 2),
  ('buenos-aires', '¿Cuál es la obra más urgente para preparar a la provincia ante lluvias intensas?', 'Sistemas de alerta y evacuación', 3),
  ('buenos-aires', '¿Qué integración de transporte necesita primero la provincia de Buenos Aires?', 'Trenes regionales entre ciudades', 0),
  ('buenos-aires', '¿Qué integración de transporte necesita primero la provincia de Buenos Aires?', 'Boleto único provincial', 1),
  ('buenos-aires', '¿Qué integración de transporte necesita primero la provincia de Buenos Aires?', 'Más frecuencias de micros interurbanos', 2),
  ('buenos-aires', '¿Qué integración de transporte necesita primero la provincia de Buenos Aires?', 'Terminales de combinación y datos abiertos', 3),
  ('buenos-aires', '¿Qué información provincial debería publicarse en un tablero único?', 'Avance físico y financiero de obras', 0),
  ('buenos-aires', '¿Qué información provincial debería publicarse en un tablero único?', 'Frecuencias reales del transporte', 1),
  ('buenos-aires', '¿Qué información provincial debería publicarse en un tablero único?', 'Turnos y tiempos de espera en salud', 2),
  ('buenos-aires', '¿Qué información provincial debería publicarse en un tablero único?', 'Estado de rutas y caminos', 3),

  ('mar-del-plata', '¿Qué debería exigir el próximo contrato de higiene urbana de Mar del Plata?', 'GPS y recorridos abiertos de los camiones', 0),
  ('mar-del-plata', '¿Qué debería exigir el próximo contrato de higiene urbana de Mar del Plata?', 'Metas verificables de reciclado', 1),
  ('mar-del-plata', '¿Qué debería exigir el próximo contrato de higiene urbana de Mar del Plata?', 'Respuesta rápida a microbasurales', 2),
  ('mar-del-plata', '¿Qué debería exigir el próximo contrato de higiene urbana de Mar del Plata?', 'Sanciones automáticas por incumplimiento', 3),
  ('mar-del-plata', '¿Cuál debería ser la prioridad del nuevo sistema de transporte marplatense?', 'Más frecuencia nocturna', 0),
  ('mar-del-plata', '¿Cuál debería ser la prioridad del nuevo sistema de transporte marplatense?', 'Recorridos transversales entre barrios', 1),
  ('mar-del-plata', '¿Cuál debería ser la prioridad del nuevo sistema de transporte marplatense?', 'Unidades accesibles y en buen estado', 2),
  ('mar-del-plata', '¿Cuál debería ser la prioridad del nuevo sistema de transporte marplatense?', 'Información en tiempo real', 3),

  ('miramar', '¿Qué servicio debería priorizar la segunda etapa del Hospital Subzonal Miramar?', 'Quirófanos', 0),
  ('miramar', '¿Qué servicio debería priorizar la segunda etapa del Hospital Subzonal Miramar?', 'Internación general', 1),
  ('miramar', '¿Qué servicio debería priorizar la segunda etapa del Hospital Subzonal Miramar?', 'Diagnóstico por imágenes', 2),
  ('miramar', '¿Qué servicio debería priorizar la segunda etapa del Hospital Subzonal Miramar?', 'Guardia pediátrica permanente', 3),
  ('miramar', '¿Qué objetivo debería guiar el nuevo frente costero de Miramar?', 'Defensa contra la erosión', 0),
  ('miramar', '¿Qué objetivo debería guiar el nuevo frente costero de Miramar?', 'Más playa y accesos públicos', 1),
  ('miramar', '¿Qué objetivo debería guiar el nuevo frente costero de Miramar?', 'Paseo peatonal y ciclovías', 2),
  ('miramar', '¿Qué objetivo debería guiar el nuevo frente costero de Miramar?', 'Actividad comercial y turística', 3),

  ('mar-del-sud', '¿Qué servicio necesita con mayor urgencia Mar del Sud durante todo el año?', 'Agua y saneamiento', 0),
  ('mar-del-sud', '¿Qué servicio necesita con mayor urgencia Mar del Sud durante todo el año?', 'Calles y drenaje', 1),
  ('mar-del-sud', '¿Qué servicio necesita con mayor urgencia Mar del Sud durante todo el año?', 'Internet estable', 2),
  ('mar-del-sud', '¿Qué servicio necesita con mayor urgencia Mar del Sud durante todo el año?', 'Transporte hacia Miramar', 3),
  ('mar-del-sud', '¿Cómo debería crecer Mar del Sud sin perder su identidad costera?', 'Densidad baja y protección estricta', 0),
  ('mar-del-sud', '¿Cómo debería crecer Mar del Sud sin perder su identidad costera?', 'Nuevos servicios dentro del casco actual', 1),
  ('mar-del-sud', '¿Cómo debería crecer Mar del Sud sin perder su identidad costera?', 'Más alojamiento turístico regulado', 2),
  ('mar-del-sud', '¿Cómo debería crecer Mar del Sud sin perder su identidad costera?', 'Plan participativo antes de habilitar nuevos loteos', 3),

  ('otamendi', '¿Qué servicio debe incorporarse primero al futuro hospital de Otamendi?', 'Guardia las 24 horas', 0),
  ('otamendi', '¿Qué servicio debe incorporarse primero al futuro hospital de Otamendi?', 'Internación', 1),
  ('otamendi', '¿Qué servicio debe incorporarse primero al futuro hospital de Otamendi?', 'Laboratorio e imágenes', 2),
  ('otamendi', '¿Qué servicio debe incorporarse primero al futuro hospital de Otamendi?', 'Especialidades y rehabilitación', 3),
  ('otamendi', '¿Qué infraestructura productiva necesita más Comandante Nicanor Otamendi?', 'Mejores caminos rurales', 0),
  ('otamendi', '¿Qué infraestructura productiva necesita más Comandante Nicanor Otamendi?', 'Energía y conectividad para empresas', 1),
  ('otamendi', '¿Qué infraestructura productiva necesita más Comandante Nicanor Otamendi?', 'Transporte para trabajadores', 2),
  ('otamendi', '¿Qué infraestructura productiva necesita más Comandante Nicanor Otamendi?', 'Centro de capacitación técnica', 3),

  ('mechongue', '¿Qué control debería asegurar que el acceso reparado a Mechongué se mantenga?', 'Inspección técnica semestral pública', 0),
  ('mechongue', '¿Qué control debería asegurar que el acceso reparado a Mechongué se mantenga?', 'Fondo permanente de mantenimiento', 1),
  ('mechongue', '¿Qué control debería asegurar que el acceso reparado a Mechongué se mantenga?', 'Comisión vecinal de seguimiento', 2),
  ('mechongue', '¿Qué control debería asegurar que el acceso reparado a Mechongué se mantenga?', 'Contrato con garantía por varios años', 3),
  ('mechongue', '¿Qué ayudaría más a que jóvenes y familias permanezcan en Mechongué?', 'Internet y trabajo remoto', 0),
  ('mechongue', '¿Qué ayudaría más a que jóvenes y familias permanezcan en Mechongué?', 'Formación técnica vinculada al campo', 1),
  ('mechongue', '¿Qué ayudaría más a que jóvenes y familias permanezcan en Mechongué?', 'Transporte frecuente a ciudades cercanas', 2),
  ('mechongue', '¿Qué ayudaría más a que jóvenes y familias permanezcan en Mechongué?', 'Vivienda y lotes con servicios', 3),

  ('necochea', '¿Qué cambio necesita primero el transporte urbano de Necochea y Quequén?', 'Renovación y mantenimiento de unidades', 0),
  ('necochea', '¿Qué cambio necesita primero el transporte urbano de Necochea y Quequén?', 'Frecuencias mínimas garantizadas', 1),
  ('necochea', '¿Qué cambio necesita primero el transporte urbano de Necochea y Quequén?', 'Información GPS en tiempo real', 2),
  ('necochea', '¿Qué cambio necesita primero el transporte urbano de Necochea y Quequén?', 'Nuevo esquema de concesión', 3),
  ('necochea', '¿Cómo debería ordenarse el tránsito pesado hacia Puerto Quequén?', 'Nueva avenida o circunvalación portuaria', 0),
  ('necochea', '¿Cómo debería ordenarse el tránsito pesado hacia Puerto Quequén?', 'Horarios y corredores obligatorios', 1),
  ('necochea', '¿Cómo debería ordenarse el tránsito pesado hacia Puerto Quequén?', 'Playas de espera fuera del área urbana', 2),
  ('necochea', '¿Cómo debería ordenarse el tránsito pesado hacia Puerto Quequén?', 'Combinación de las tres medidas', 3)
) as o (community_slug, question, label, sort_order)
join public.communities c on c.slug = o.community_slug
join public.polls p on p.community_id = c.id and p.question = o.question
where not exists (
  select 1 from public.poll_options existing
  where existing.poll_id = p.id and existing.label = o.label
);

-- =============================================================================
-- Debates
-- =============================================================================
insert into public.debates (community_id, author_id, title, body, created_at)
select c.id, a.id, d.title, d.body, d.created_at::timestamptz
from (values
  ('earth', '¿Necesitamos límites globales obligatorios para la inteligencia artificial?',
   'En julio de 2026 la ONU reunió gobiernos, científicos, empresas y sociedad civil para discutir gobernanza de IA. Debatamos qué riesgos requieren reglas mundiales, cuáles deben resolver los países y cómo evitar que las reglas congelen la desigualdad tecnológica.', '2026-07-30 11:00:00+00'),
  ('earth', 'Plásticos: ¿reducir la producción o concentrarse en reciclar?',
   'Las negociaciones internacionales siguen divididas entre limitar la producción de plástico y mejorar la gestión de residuos. Cada continente enfrenta costos y capacidades distintas. Explicá qué combinación sería justa y verificable.', '2026-07-27 11:00:00+00'),
  ('africa', 'Energía solar africana: acceso rápido o industria propia primero',
   'Importar equipos permite electrificar antes; fabricar paneles, baterías y componentes localmente puede crear empleo y autonomía. ¿Cómo debería equilibrar cada país velocidad, costo y desarrollo industrial?', '2026-07-26 11:00:00+00'),
  ('north-america', 'Vivienda, densidad y calidad de vida en las ciudades norteamericanas',
   'Muchas ciudades necesitan más viviendas cerca del empleo y el transporte, mientras residentes temen desplazamiento, especulación y pérdida de identidad barrial. Compartí qué está funcionando o fallando en tu país.', '2026-07-25 11:00:00+00'),
  ('south-america', 'Minerales críticos: ¿otra exportación primaria o una industria regional?',
   'Litio y cobre colocan a Sudamérica ante una oportunidad y un riesgo ambiental. Debatamos qué deberían coordinar los países sobre regalías, agua, industrialización, tecnología y consulta a comunidades.', '2026-07-24 11:00:00+00'),
  ('asia', 'El aire no reconoce fronteras: responsabilidades compartidas en Asia',
   'Emisiones industriales, transporte, generación eléctrica y quemas pueden afectar ciudades de otros países. ¿Qué datos, límites y mecanismos de cumplimiento deberían ser regionales?', '2026-07-23 11:00:00+00'),
  ('europe', '¿Puede Europa resolver la vivienda sin perder diversidad urbana?',
   'Viviendas vacías, alquiler turístico, permisos lentos, costos de construcción y concentración del empleo empujan los precios. Cada país tiene una experiencia distinta: comparémoslas antes de elegir una receta común.', '2026-07-22 11:00:00+00'),
  ('oceania', 'Movilidad climática sin perder soberanía ni cultura',
   'Para algunas islas, adaptarse puede no alcanzar. ¿Cómo debería funcionar un acuerdo de movilidad que preserve ciudadanía, derechos marítimos, lengua y decisión política de las comunidades desplazadas?', '2026-07-21 11:00:00+00'),
  ('argentina', 'Trabajo formal en Argentina: cómo bajar el costo sin bajar derechos',
   'La informalidad no se explica por una sola causa. Comparemos experiencias provinciales y sectoriales: impuestos, inspección, productividad, formación, plataformas digitales y protección social.', '2026-07-20 11:00:00+00'),
  ('argentina', 'Educación: salarios, días de clase y calidad no deberían competir',
   'El conflicto docente volvió al centro de la agenda nacional. ¿Qué compromisos verificables deberían asumir Nación, provincias, sindicatos y comunidades educativas para sostener salarios, continuidad y aprendizaje?', '2026-07-18 11:00:00+00'),
  ('argentina', 'La nueva renta energética: federalismo, ahorro o gasto urgente',
   'Si las exportaciones energéticas generan un excedente sostenido, aparece una decisión intergeneracional. ¿Cuánto corresponde a provincias productoras, cuánto a infraestructura nacional y cuánto debería ahorrarse?', '2026-07-17 11:00:00+00'),
  ('argentina', 'Una red ferroviaria federal: qué conexiones cambiarían cada provincia',
   'No alcanza con discutir tren sí o no. Cada provincia puede explicar qué corredor necesita, qué demanda tendría, cómo se conectaría con micros y qué frecuencia mínima lo volvería útil.', '2026-07-16 11:00:00+00'),
  ('buenos-aires', 'Cómo priorizar obras entre 135 municipios bonaerenses',
   'Inundaciones, rutas, hospitales, escuelas, agua y transporte compiten por presupuesto. Propongamos criterios públicos para ordenar obras: riesgo, población, desigualdad, impacto productivo y grado de avance.', '2026-07-15 11:00:00+00'),
  ('buenos-aires', 'Conectar el interior bonaerense sin pasar siempre por Buenos Aires',
   'Las ciudades del interior necesitan redes transversales de trenes y micros. Contá desde tu municipio qué viaje hoy es innecesariamente largo y qué conexión directa tendría mayor impacto.', '2026-07-14 11:00:00+00'),
  ('mar-del-plata', 'Nuevo transporte público: recorridos para una ciudad que cambió',
   'Mar del Plata creció hacia el oeste y el sur, pero muchos recorridos conservan una lógica radial. Debatamos conexiones entre barrios, puerto, universidades, hospitales y zonas de trabajo, además de frecuencias nocturnas.', '2026-07-12 11:00:00+00'),
  ('miramar', 'Turismo todo el año sin perder la escala de Miramar',
   'La ciudad busca escapadas fuera del verano y un nuevo frente costero. ¿Qué actividades, infraestructura y límites permitirían más trabajo anual sin saturar servicios ni transformar su identidad?', '2026-07-10 11:00:00+00'),
  ('mar-del-sud', 'Qué crecimiento quiere Mar del Sud para los próximos diez años',
   'Antes de que loteos y obras definan el futuro por separado, discutamos densidad, servicios, protección de arroyos y dunas, patrimonio, movilidad y acceso público a la costa.', '2026-07-08 11:00:00+00'),
  ('otamendi', 'Del centro de salud al hospital: qué necesita realmente Otamendi',
   'La transformación fue planteada como proyecto estratégico en 2026. Debatamos cartera de servicios, personal, derivaciones, ambulancias y relación con Miramar para que el cambio sea operativo y no solo nominal.', '2026-07-06 11:00:00+00'),
  ('mechongue', 'Después del camino: cómo convertir conectividad en oportunidades',
   'La reparación del acceso esperada durante décadas puede mejorar seguridad y viajes. ¿Qué políticas de transporte, turismo rural, educación y producción deberían acompañarla?', '2026-07-04 11:00:00+00'),
  ('necochea', 'Puerto Quequén y ciudad: cómo repartir beneficios y costos',
   'El puerto genera actividad regional, pero el tránsito pesado, el ambiente y la infraestructura impactan en Necochea y Quequén. Debatamos inversiones, controles y mecanismos transparentes de compensación.', '2026-07-02 11:00:00+00')
) as d (community_slug, title, body, created_at)
join public.communities c on c.slug = d.community_slug
cross join geounity_editorial_author a
where not exists (
  select 1 from public.debates existing
  where existing.community_id = c.id and existing.title = d.title
);

-- =============================================================================
-- Reclamos · formulados como pedidos públicos verificables, no testimonios
-- personales ni denuncias no comprobadas.
-- =============================================================================
insert into public.claims (
  community_id, author_id, title, description, category, status, created_at
)
select c.id, a.id, r.title, r.description, r.category, 'open', r.created_at::timestamptz
from (values
  ('argentina', 'Publicar un tablero nacional del estado de las rutas',
   'Se solicita un tablero abierto con estado por tramo, obras activas, contratos, desvíos, siniestros y fecha de última inspección. La información existe en organismos distintos, pero no resulta fácil comparar prioridades ni controlar plazos.', 'transporte', '2026-06-30 12:00:00+00'),
  ('argentina', 'Transparentar entregas y faltantes de medicamentos de alto costo',
   'Se pide información agregada y actualizada por provincia sobre solicitudes, tiempos de autorización, entregas y faltantes, sin exponer datos de pacientes. El objetivo es detectar cuellos de botella y desigualdades territoriales.', 'salud', '2026-06-29 12:00:00+00'),
  ('argentina', 'Mapa público de infraestructura escolar crítica',
   'Se solicita un relevamiento nacional interoperable de escuelas con problemas de agua, electricidad, calefacción, conectividad, accesibilidad o riesgo edilicio, indicando responsable, obra prevista y avance.', 'educacion', '2026-06-28 12:00:00+00'),
  ('argentina', 'Datos comparables sobre empleo informal y plataformas',
   'Se pide publicar indicadores trimestrales por provincia y sector que incluyan trabajo de plataformas, economía popular e independientes, para diseñar formalización con evidencia y evaluar resultados.', 'servicios', '2026-06-27 12:00:00+00'),

  ('buenos-aires', 'Plan público de mantenimiento de caminos rurales bonaerenses',
   'Se solicita consolidar por municipio los kilómetros transitables, intervenciones programadas, maquinaria disponible y puntos críticos por lluvias. Los caminos afectan producción, escuelas rurales, ambulancias y conectividad cotidiana.', 'infraestructura', '2026-06-26 12:00:00+00'),
  ('buenos-aires', 'Frecuencias reales del transporte interurbano provincial',
   'Se pide una plataforma común con recorridos autorizados, horarios, cumplimiento real, accesibilidad y canales de reclamo de los servicios interurbanos, para identificar localidades que quedaron aisladas.', 'transporte', '2026-06-25 12:00:00+00'),
  ('buenos-aires', 'Publicar el avance mensual de las obras hidráulicas',
   'Ante el riesgo de lluvias intensas se solicita informar avance físico y financiero, cuenca beneficiada, contratista, inspecciones y fecha prevista de finalización de cada obra hidráulica provincial.', 'ambiente', '2026-06-24 12:00:00+00'),

  ('mar-del-plata', 'Monitoreo continuo de emisiones y efluentes en el puerto',
   'En mayo de 2026 se informó una intimación a industrias harineras por obras ambientales pendientes. Se solicita publicar mediciones de aire y agua, inspecciones, incumplimientos y planes de adecuación en un tablero accesible.', 'ambiente', '2026-06-23 12:00:00+00'),
  ('miramar', 'Publicar el Master Plan completo del Hospital Subzonal Miramar',
   'La primera etapa fue licitada en 2026, mientras el proyecto integral prevé futuras ampliaciones. Se solicita acceso al Master Plan, cronograma por etapas, servicios incluidos, responsables y actualización mensual del avance.', 'salud', '2026-06-22 12:00:00+00'),
  ('mar-del-sud', 'Monitorear y publicar la calidad del agua de los arroyos costeros',
   'Se solicita un calendario de muestreo para los arroyos La Tigra y La Carolina, con resultados abiertos durante todo el año, señalización ante valores de riesgo e identificación de fuentes de contaminación cuando corresponda.', 'ambiente', '2026-06-21 12:00:00+00'),
  ('otamendi', 'Cronograma público para convertir el centro de salud en hospital',
   'Tras el pedido formal presentado en mayo de 2026, se solicita publicar etapas, cartera de servicios, personal requerido, equipamiento, presupuesto y acuerdos con la Región Sanitaria VIII.', 'salud', '2026-06-20 12:00:00+00'),
  ('mechongue', 'Garantía y mantenimiento transparente del acceso a Mechongué',
   'La reparación iniciada después de décadas de espera necesita seguimiento. Se solicita publicar memoria técnica, empresa responsable, garantía, inspecciones y calendario de mantenimiento preventivo.', 'infraestructura', '2026-06-19 12:00:00+00'),
  ('necochea', 'Plan de contingencia para garantizar el transporte urbano',
   'Las roturas, demoras y medidas gremiales dejaron a vecinos sin un servicio confiable durante 2026. Se solicita un plan con flota mínima, frecuencias verificables, información en tiempo real y alternativas durante interrupciones.', 'transporte', '2026-06-18 12:00:00+00'),
  ('necochea', 'Intervenir los puntos de erosión de la ribera de Quequén',
   'El Concejo pidió informes y coordinación con Hidráulica provincial en julio de 2026. Se solicita relevamiento técnico público, señalización inmediata de sectores peligrosos y un plan de obras con prioridades y plazos.', 'infraestructura', '2026-06-17 12:00:00+00')
) as r (community_slug, title, description, category, created_at)
join public.communities c on c.slug = r.community_slug
cross join geounity_editorial_author a
where not exists (
  select 1 from public.claims existing
  where existing.community_id = c.id and existing.title = r.title
);

-- =============================================================================
-- Proyectos
-- =============================================================================
insert into public.projects (
  community_id, author_id, title, summary, plan, currency, resources_needed,
  time_estimate, status, created_at
)
select
  c.id, a.id, p.title, p.summary, p.plan, p.currency, p.resources,
  p.time_estimate, 'proposal', p.created_at::timestamptz
from (values
  ('earth', 'Mapa abierto de riesgos climáticos comunitarios',
   'Una plataforma mundial para que cada comunidad registre riesgos, infraestructura crítica y acciones de adaptación con un estándar común.',
   'Primero se define un estándar mínimo con organizaciones de las seis regiones: amenaza, población expuesta, infraestructura crítica, fuente y fecha. Después se construye una herramienta traducible que funcione con conectividad limitada y permita revisión local. Un piloto con 30 comunidades probará si los datos sirven para decidir y no solo para visualizar. Todo el código y los datos no sensibles se publicarán con licencias abiertas.',
   'USD', 'Especialistas en clima y datos, organizaciones territoriales, traducción, desarrollo web y revisión de privacidad.', '18 meses', '2026-07-29 10:00:00+00'),
  ('earth', 'Red mundial de verificación pública sobre IA',
   'Un repositorio multilingüe de incidentes, auditorías y evidencia para que gobiernos y ciudadanía comparen riesgos reales de sistemas de IA.',
   'Se acuerda una ficha común para documentar incidentes sin publicar datos personales ni secretos de seguridad. Universidades y organizaciones de cada continente validan casos y traducen hallazgos. La plataforma distingue evidencia confirmada, investigación abierta y afirmaciones no verificadas. Un consejo plural publica criterios, conflictos de interés y correcciones.',
   'USD', 'Universidades, organizaciones de derechos digitales, traductores, seguridad informática y mantenimiento de datos.', '15 meses', '2026-07-27 10:00:00+00'),
  ('africa', 'Academia panafricana de técnicos solares',
   'Formación abierta y certificable para instalar, mantener y reparar sistemas solares y baterías con empleo local.',
   'Equipos de cinco regiones adaptan módulos prácticos a distintos sistemas eléctricos y lenguas. Centros de formación existentes realizan pilotos con kits compartidos. La certificación exige una instalación segura y diagnóstico de fallas. Los materiales quedan abiertos para escuelas técnicas y cooperativas.',
   'USD', 'Institutos técnicos, empresas solares, instructores, kits de práctica, traducción y sistema de certificación.', '18 meses', '2026-07-26 10:00:00+00'),
  ('north-america', 'Observatorio norteamericano de vivienda asequible',
   'Datos comparables por ciudad sobre alquileres, viviendas vacías, permisos, tiempos de obra, ingresos y desplazamiento residencial.',
   'Se seleccionan 20 ciudades de Canadá, Estados Unidos y México y se armonizan indicadores sin ocultar diferencias legales. Un tablero muestra tendencias, políticas aplicadas y resultados. Organizaciones de inquilinos, vivienda social y construcción revisan la metodología cada seis meses.',
   'USD', 'Equipos urbanos de tres países, fuentes catastrales, analistas, traducción y alianzas con universidades.', '12 meses', '2026-07-25 10:00:00+00'),
  ('south-america', 'Red sudamericana de agua y minería transparente',
   'Monitoreo público y comparable del uso de agua, permisos y controles ambientales en zonas de minerales críticos.',
   'Comunidades, universidades y organismos construyen un protocolo de datos básico. Se comienza con cuencas piloto de litio y cobre, publicando fuente, frecuencia y límites de cada medición. La red no reemplaza controles estatales: permite compararlos, detectar vacíos y formular alertas documentadas.',
   'USD', 'Laboratorios, comunidades locales, hidrólogos, especialistas legales, sensores y plataforma de datos.', '20 meses', '2026-07-24 10:00:00+00'),
  ('asia', 'Sensores ciudadanos de calidad del aire para ciudades asiáticas',
   'Una red interoperable de sensores económicos, calibrados con estaciones oficiales y acompañados por educación pública.',
   'Se eligen ocho ciudades con problemas y capacidades diferentes. Universidades calibran equipos y publican incertidumbre para evitar falsas precisiones. Escuelas y centros de salud alojan sensores. Los datos se integran a alertas simples y evaluaciones de políticas de transporte, energía y quemas.',
   'USD', 'Universidades, sensores, estaciones de referencia, escuelas, traductores y especialistas en salud ambiental.', '14 meses', '2026-07-23 10:00:00+00'),
  ('europe', 'Registro europeo de edificios vacíos recuperables',
   'Herramienta abierta para identificar inmuebles sin uso que puedan transformarse en vivienda asequible sin expandir la mancha urbana.',
   'Cinco ciudades piloto acuerdan criterios de desocupación, estado edilicio, propiedad y protección patrimonial. El sistema usa datos públicos y verificación municipal, sin exponer información personal innecesaria. Cada inmueble incorpora alternativas, costo preliminar y resultado de la intervención.',
   'EUR', 'Municipios, catastros, cooperativas de vivienda, arquitectos, juristas y desarrollo de datos.', '16 meses', '2026-07-22 10:00:00+00'),
  ('oceania', 'Archivo vivo para comunidades del Pacífico en movilidad climática',
   'Infraestructura comunitaria para preservar lengua, memoria territorial, derechos y decisiones colectivas ante desplazamientos climáticos.',
   'Cada comunidad decide qué conocimientos son públicos, restringidos o no digitalizables. Se forman equipos locales para registrar mapas, historias, normas y vínculos marítimos. Copias cifradas quedan bajo control comunitario en más de un país. El proyecto acompaña, no reemplaza, las políticas de adaptación y permanencia.',
   'AUD', 'Consejos comunitarios, lingüistas, archivistas, infraestructura segura, formación y asesoría jurídica.', '24 meses', '2026-07-21 10:00:00+00'),

  ('argentina', 'Mapa federal de infraestructura escolar',
   'Relevamiento abierto y actualizado de agua, electricidad, calefacción, conectividad, accesibilidad y obras en escuelas argentinas.',
   'Se acuerda una ficha corta con provincias y comunidades educativas. Un piloto en 200 escuelas prueba carga, evidencia y protección de datos. Cada problema muestra organismo responsable, respuesta, obra y fecha de actualización. Los reportes agregados permiten priorizar sin exponer a estudiantes.',
   'ARS', 'Consejos escolares, provincias, cooperadoras, desarrolladores, auditoría de datos y soporte federal.', '12 meses', '2026-07-20 10:00:00+00'),
  ('argentina', 'Comparador nacional de precios de alimentos',
   'Canasta abierta por localidad basada en comprobantes y comercios adheridos, con metodología pública y sin rankings engañosos.',
   'Universidades y asociaciones de consumidores definen productos comparables y reglas contra datos falsos. La primera versión cubre 20 ciudades y muestra precio, fecha, presentación y distancia. Se publican promedios con suficiente muestra y se evita identificar hábitos de compra individuales.',
   'ARS', 'Universidades, consumidores, comercios, desarrollo móvil, validación estadística y protección de datos.', '10 meses', '2026-07-19 10:00:00+00'),
  ('argentina', 'Piloto de corredores ferroviarios regionales',
   'Estudios comparables de demanda y operación para tres conexiones transversales que no obliguen a pasar por Buenos Aires.',
   'Se seleccionan tres corredores con infraestructura existente y demanda potencial. Para cada uno se publica estado de vía, estaciones, material rodante, frecuencia mínima, integración con micros y costo total. Audiencias provinciales revisan supuestos antes de elegir un piloto operativo.',
   'ARS', 'Especialistas ferroviarios, provincias, universidades, operadores, datos de movilidad y participación ciudadana.', '14 meses', '2026-07-18 10:00:00+00'),
  ('argentina', 'Ventanilla simple para formalizar el primer empleo',
   'Piloto que reúne alta laboral, aportes, capacitación y beneficios disponibles para microempresas que contratan por primera vez.',
   'Se mapea el trámite actual y se eliminan pedidos duplicados sin reducir derechos. Cien pequeñas unidades productivas prueban acompañamiento y costos previsibles durante seis meses. El resultado se mide por empleos sostenidos, salarios, cumplimiento y empresas que abandonan el proceso.',
   'ARS', 'Organismos laborales y tributarios, cámaras pyme, sindicatos, cooperativas, diseño de servicios y evaluación independiente.', '12 meses', '2026-07-17 10:00:00+00'),

  ('buenos-aires', 'Mapa bonaerense de riesgo hídrico vecinal',
   'Información de cuencas, desagües y puntos de anegamiento combinada con reportes locales verificados y planes de obra.',
   'Hidráulica provincial y municipios publican capas compatibles. Vecinos reportan puntos con fecha y evidencia; equipos locales validan recurrencia. El tablero muestra responsables, acciones de mantenimiento, obras y alertas oficiales, sin prometer precisión parcela por parcela.',
   'ARS', 'Hidrólogos, municipios, universidades, defensa civil, desarrollo geográfico y moderación de reportes.', '12 meses', '2026-07-15 10:00:00+00'),
  ('buenos-aires', 'Tablero ciudadano de obras en los 135 municipios',
   'Seguimiento común de contratos, presupuesto, avance físico, fotos de inspección y fechas para obras provinciales y municipales.',
   'Se parte de datos oficiales y un identificador único de obra. Diez municipios prueban el modelo y publican actualizaciones mensuales. La ciudadanía puede señalar inconsistencias, pero solo documentos e inspecciones cambian el avance validado. El código permite replicarlo en toda la provincia.',
   'ARS', 'Provincia, municipios, especialistas en compras públicas, desarrolladores y organizaciones de transparencia.', '11 meses', '2026-07-14 10:00:00+00'),

  ('mar-del-plata', 'Observatorio comunitario de playas y residuos',
   'Muestreo abierto de residuos, colillas y plásticos en distintos sectores de playa durante todo el año.',
   'Se definen tramos fijos y un protocolo mensual con universidades y organizaciones ambientales. Voluntarios clasifican residuos y cargan fotos; una muestra se audita para estimar error. El tablero compara temporada, clima y acciones de limpieza, y publica recomendaciones concretas.',
   'ARS', 'Universidad, escuelas, organizaciones ambientales, kits de muestreo, coordinación y plataforma de datos.', '12 meses', '2026-07-12 10:00:00+00'),
  ('miramar', 'Tablero abierto del Hospital Subzonal Miramar',
   'Seguimiento ciudadano de etapas, contratos, avance, equipamiento y servicios previstos para el nuevo hospital.',
   'Primero se reúne la documentación pública y se solicita el Master Plan completo. Un equipo técnico traduce hitos de obra a lenguaje claro sin reemplazar la inspección oficial. Cada actualización conserva el documento fuente, fecha y responsable. La comunidad puede formular preguntas y registrar respuestas.',
   'ARS', 'Profesionales de salud y obra, acceso a documentación, desarrollo web, comunicación y seguimiento mensual.', '24 meses', '2026-07-10 10:00:00+00'),
  ('mar-del-sud', 'Guardianes de arroyos y dunas de Mar del Sud',
   'Monitoreo comunitario de agua, residuos, erosión y accesos para orientar el crecimiento sin degradar la costa.',
   'Escuelas, fomentistas y especialistas fijan puntos de observación en La Tigra, La Carolina, dunas y playa. Se realizan registros mensuales y después de temporales. Los resultados se publican con límites metodológicos y se presentan cada trimestre al municipio con pedidos priorizados.',
   'ARS', 'Kits de agua, asesoramiento ambiental, voluntarios, señalización, archivo fotográfico y coordinación.', '12 meses', '2026-07-08 10:00:00+00'),
  ('otamendi', 'Mesa comunitaria para el futuro hospital de Otamendi',
   'Proceso participativo y técnico para definir servicios, derivaciones, personal y etapas de la transformación hospitalaria.',
   'Se releva demanda sanitaria anonimizada, tiempos de traslado y derivaciones actuales. Profesionales y Región Sanitaria explican requisitos de cada servicio. La comunidad prioriza con información de personal, equipamiento y operación. Un documento final separa necesidades inmediatas de ampliaciones futuras.',
   'ARS', 'Centro de salud, Región Sanitaria VIII, profesionales, instituciones locales, facilitación y análisis de datos.', '8 meses', '2026-07-06 10:00:00+00'),
  ('mechongue', 'Movilidad rural compartida para Mechongué',
   'Piloto de viajes programados hacia Miramar, Otamendi y Balcarce para salud, estudio, trámites y trabajo.',
   'Durante dos meses se relevan destinos, días y horarios sin recopilar datos sensibles innecesarios. Se prueba un servicio dos veces por semana con reserva telefónica y digital. La evaluación mide ocupación, viajes resueltos, costo y accesibilidad antes de decidir continuidad o cambios.',
   'ARS', 'Vehículo habilitado, conductor, seguros, coordinación local, sistema de reservas y evaluación.', '6 meses', '2026-07-04 10:00:00+00'),
  ('necochea', 'Monitor abierto de caminos rurales de Necochea',
   'Mapa actualizado del estado, cortes, drenajes, mantenimiento y transitabilidad de la red usada por familias, escuelas y producción.',
   'Municipio, productores y escuelas acuerdan tramos e indicadores. Reportes georreferenciados se validan antes de publicarse como estado oficial. El tablero incluye maquinaria, última intervención, prioridad y próximos trabajos. Después de lluvias intensas se activa un relevamiento rápido.',
   'ARS', 'Municipio, entidades rurales, escuelas, GPS, desarrollo de mapas y protocolo de validación.', '10 meses', '2026-07-02 10:00:00+00')
) as p (community_slug, title, summary, plan, currency, resources, time_estimate, created_at)
join public.communities c on c.slug = p.community_slug
cross join geounity_editorial_author a
where not exists (
  select 1 from public.projects existing
  where existing.community_id = c.id and existing.title = p.title
);

commit;
