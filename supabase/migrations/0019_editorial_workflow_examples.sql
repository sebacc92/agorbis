-- =============================================================================
-- Agorbis · 0019 · Ejemplos editoriales para los nuevos flujos
-- -----------------------------------------------------------------------------
-- Adjunta fuentes verificables, conecta conversaciones relacionadas y convierte
-- los 20 proyectos editoriales de 0017 en planes navegables con hitos y tareas.
-- No crea respuestas institucionales ni aportes en nombre de terceros.
-- =============================================================================

begin;

create temporary table editorial_sources (
  content_type text,
  content_title text,
  source_title text,
  source_url text,
  publisher text,
  published_at date
) on commit drop;

insert into editorial_sources values
  ('poll', '¿Qué regla global sobre inteligencia artificial debería acordarse primero?', 'Diálogo Mundial sobre la Gobernanza de la IA', 'https://www.un.org/global-dialogue-ai-governance/en/', 'Naciones Unidas', '2026-07-06'),
  ('debate', '¿Necesitamos límites globales obligatorios para la inteligencia artificial?', 'Diálogo Mundial sobre la Gobernanza de la IA', 'https://www.un.org/global-dialogue-ai-governance/en/', 'Naciones Unidas', '2026-07-06'),
  ('poll', '¿Cómo debería aprovechar Sudamérica sus minerales críticos?', 'Global Critical Minerals Outlook 2026: Latin America', 'https://www.iea.org/reports/global-critical-minerals-outlook-2026/latin-america', 'Agencia Internacional de Energía', '2026-06-01'),
  ('debate', 'Minerales críticos: ¿otra exportación primaria o una industria regional?', 'Global Critical Minerals Outlook 2026: Latin America', 'https://www.iea.org/reports/global-critical-minerals-outlook-2026/latin-america', 'Agencia Internacional de Energía', '2026-06-01'),
  ('poll', '¿Cuál debería ser la prioridad europea para abaratar la vivienda?', 'European Affordable Housing Plan', 'https://commission.europa.eu/topics/employment-and-social-affairs/affordability/affordable-housing_en', 'Comisión Europea', '2026-01-01'),
  ('claim', 'Datos comparables sobre empleo informal y plataformas', 'Mercado de trabajo: tasas e indicadores socioeconómicos', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-4-31-58', 'INDEC', '2026-06-01'),
  ('claim', 'Publicar el Master Plan completo del Hospital Subzonal Miramar', 'Licitación Hospital Subzonal Miramar — Etapa 1', 'https://www.minfra.gba.gob.ar/licitacionesV2/bidding/show/1186/', 'Ministerio de Infraestructura de la Provincia de Buenos Aires', '2026-01-01'),
  ('project', 'Tablero abierto del Hospital Subzonal Miramar', 'Anuncio del futuro Hospital Subzonal en Miramar', 'https://mga.gov.ar/anuncio-del-futuro-hospital-subzonal-en-miramar/', 'Municipalidad de General Alvarado', '2026-01-01'),
  ('claim', 'Monitoreo continuo de emisiones y efluentes en el puerto', 'Intimación por obras ambientales pendientes en industrias harineras', 'https://www.0223.com.ar/nota/2026-5-27-8-32-0-intiman-a-las-harineras-del-puerto-denuncian-que-prometieron-obras-para-reducir-contaminantes-y-nunca-las-hicieron', '0223', '2026-05-27'),
  ('claim', 'Plan de contingencia para garantizar el transporte urbano', 'Comisión de Transporte del HCD de Necochea', 'https://hcdnecochea.gob.ar/2026/04/23/comision-de-transporte-12/', 'Honorable Concejo Deliberante de Necochea', '2026-04-23'),
  ('poll', '¿Qué cambio necesita primero el transporte urbano de Necochea y Quequén?', 'Quejas de usuarios por roturas, demoras y frecuencias', 'https://elecos.com.ar/transporte-urbano-crecen-las-quejas-de-usuarios-por-roturas-de-unidades-y-demoras-en-el-servicio', 'Ecos Diarios', '2026-01-01');

insert into public.content_sources (
  content_type, content_id, added_by, title, url, publisher, published_at, verified_at
)
select s.content_type, x.id, x.author_id, s.source_title, s.source_url,
  s.publisher, s.published_at, now()
from editorial_sources s
cross join lateral (
  select id, author_id from public.polls where s.content_type = 'poll' and question = s.content_title
  union all select id, author_id from public.debates where s.content_type = 'debate' and title = s.content_title
  union all select id, author_id from public.claims where s.content_type = 'claim' and title = s.content_title
  union all select id, author_id from public.projects where s.content_type = 'project' and title = s.content_title
) x
on conflict (content_type, content_id, url) do nothing;

create temporary table editorial_relations (
  source_type text,
  source_title text,
  target_type text,
  target_title text,
  relation_type text
) on commit drop;

insert into editorial_relations values
  ('poll', '¿Qué regla global sobre inteligencia artificial debería acordarse primero?', 'debate', '¿Necesitamos límites globales obligatorios para la inteligencia artificial?', 'follow_up'),
  ('poll', '¿Cómo debería aprovechar Sudamérica sus minerales críticos?', 'debate', 'Minerales críticos: ¿otra exportación primaria o una industria regional?', 'follow_up'),
  ('claim', 'Mapa público de infraestructura escolar crítica', 'project', 'Mapa federal de infraestructura escolar', 'proposal_for'),
  ('claim', 'Publicar el Master Plan completo del Hospital Subzonal Miramar', 'project', 'Tablero abierto del Hospital Subzonal Miramar', 'proposal_for'),
  ('claim', 'Datos comparables sobre empleo informal y plataformas', 'project', 'Ventanilla simple para formalizar el primer empleo', 'proposal_for');

with resolved as (
  select r.*,
    case r.source_type when 'poll' then (select id from public.polls where question = r.source_title limit 1)
      when 'claim' then (select id from public.claims where title = r.source_title limit 1)
      when 'debate' then (select id from public.debates where title = r.source_title limit 1)
      else (select id from public.projects where title = r.source_title limit 1) end source_id,
    case r.target_type when 'poll' then (select id from public.polls where question = r.target_title limit 1)
      when 'claim' then (select id from public.claims where title = r.target_title limit 1)
      when 'debate' then (select id from public.debates where title = r.target_title limit 1)
      else (select id from public.projects where title = r.target_title limit 1) end target_id
  from editorial_relations r
)
insert into public.content_relations (
  source_type, source_id, target_type, target_id, relation_type, created_by
)
select r.source_type, r.source_id, r.target_type, r.target_id, r.relation_type,
  public.content_author(r.source_type, r.source_id)
from resolved r where r.source_id is not null and r.target_id is not null
on conflict (source_type, source_id, target_type, target_id) do nothing;

with editorial_projects as (
  select id
  from public.projects
  where created_at >= '2026-07-01'::timestamptz
    and created_at < '2026-08-01'::timestamptz
), templates as (
  select * from (values
    (0::smallint, 'Alcance y responsables definidos', 'Acordar el problema, la comunidad destinataria, los responsables y el criterio público de éxito.', 30),
    (1::smallint, 'Piloto público en marcha', 'Ejecutar una primera versión acotada, documentar decisiones y publicar sus límites.', 120),
    (2::smallint, 'Resultados evaluados y próximos pasos', 'Comparar los resultados con los indicadores iniciales y decidir continuidad, correcciones o escala.', 240)
  ) t(sort_order, title, description, days_to_target)
)
insert into public.project_milestones (project_id, title, description, target_date, sort_order)
select p.id, t.title, t.description, (current_date + t.days_to_target), t.sort_order
from editorial_projects p cross join templates t
where not exists (
  select 1 from public.project_milestones m where m.project_id = p.id and m.sort_order = t.sort_order
);

with editorial_projects as (
  select id
  from public.projects
  where created_at >= '2026-07-01'::timestamptz
    and created_at < '2026-08-01'::timestamptz
)
insert into public.project_tasks (
  project_id, milestone_id, title, description, skills_needed, due_date
)
select m.project_id, m.id,
  case m.sort_order
    when 0 then 'Publicar alcance, responsables e indicadores'
    when 1 then 'Documentar el piloto con evidencia y fuentes'
    else 'Publicar evaluación y decisión de continuidad' end,
  case m.sort_order
    when 0 then 'Dejar explícito quién toma cada decisión y cómo se verificará el resultado.'
    when 1 then 'Registrar avances, obstáculos y cambios sin borrar el plan original.'
    else 'Comparar lo ejecutado con los objetivos y abrir los próximos pasos a revisión.' end,
  case m.sort_order when 0 then 'Coordinación, investigación y facilitación' when 1 then 'Ejecución, documentación y comunicación' else 'Evaluación y datos' end,
  m.target_date
from public.project_milestones m
join editorial_projects p on p.id = m.project_id
where not exists (
  select 1 from public.project_tasks t where t.milestone_id = m.id
);

commit;
