# Contenido editorial inicial

La migración `0017_seba_editorial_content.sql` agrega una primera conversación
pública a Agorbis. No inventa testimonios personales ni presenta las propuestas
como políticas aprobadas: usa hechos y problemas documentados como punto de
partida para encuestas, debates, reclamos verificables y proyectos posibles.

## Inventario

- 28 encuestas con sus opciones.
- 20 debates.
- 14 reclamos formulados como pedidos públicos verificables.
- 20 proyectos con plan, recursos y plazo estimado.
- 60 hitos y 60 tareas ejecutables (tres por cada proyecto).
- 11 fuentes visibles y verificadas dentro de publicaciones.
- 5 relaciones entre encuestas, debates, reclamos y proyectos.
- 15 comunidades cubiertas en los niveles global, continental, nacional,
  provincial y local.
- 3 localidades nuevas: Mar del Sud, Comandante Nicanor Otamendi y Mechongué.

En una base donde existe `@seba`, todas las publicaciones quedan atribuidas a
ese perfil. En un `db reset` vacío las migraciones se ejecutan antes de crear los
usuarios demo; en ese caso el contenido se conserva con autor anónimo para que
el entorno local siga siendo reproducible.

La migración `0019_editorial_workflow_examples.sql` completa los nuevos flujos.
No inventa aportes de usuarios ni respuestas municipales: esos registros sólo
pueden aparecer cuando una persona o institución verificada los publica.

## Criterio de redacción

1. Una fecha, anuncio o cifra se menciona sólo cuando existe una fuente
   identificable.
2. Una encuesta abre alternativas; no afirma que una opción sea la correcta.
3. Un debate separa el hecho que lo motiva de las posiciones que todavía deben
   argumentarse.
4. Un reclamo pide información o una acción comprobable y evita acusaciones
   personales.
5. Un proyecto es una propuesta editorial: sus recursos y plazos son una base
   para discutir, no un presupuesto oficial.

## Fuentes consultadas

### Global y regional

- [Diálogo Mundial sobre la Gobernanza de la IA de Naciones Unidas](https://www.un.org/global-dialogue-ai-governance/en/): primera sesión, 6 y 7 de julio de 2026.
- [Mission 300 del Banco Mundial y el Banco Africano de Desarrollo](https://www.worldbank.org/en/news/press-release/2026/06/16/under-mission-300-a-new-way-of-doing-business-connects-over-50-million-people-to-electricity-across-africa): acceso a energía y desarrollo local en África.
- [Global Critical Minerals Outlook 2026 de la IEA](https://www.iea.org/reports/global-critical-minerals-outlook-2026/latin-america): extracción, procesamiento local, agua, infraestructura y capacidades en América Latina.
- [Plan europeo de vivienda asequible](https://commission.europa.eu/topics/employment-and-social-affairs/affordability/affordable-housing_en): oferta, vivienda social, edificios vacíos, alquiler temporario y permisos.

### Argentina y provincia de Buenos Aires

- [Mercado de trabajo de INDEC](https://www.indec.gob.ar/indec/web/Nivel4-Tema-4-31-58): indicadores del primer trimestre de 2026 y series de informalidad laboral.
- [Licitación oficial del Hospital Subzonal Miramar — Etapa 1](https://www.minfra.gba.gob.ar/licitacionesV2/bidding/show/1186/), Ministerio de Infraestructura bonaerense.
- [Anuncio municipal del Hospital Subzonal Miramar](https://mga.gov.ar/anuncio-del-futuro-hospital-subzonal-en-miramar/), Municipalidad de General Alvarado.

### Fuentes locales de seguimiento

- [Detalle del Master Plan y etapas del Hospital Subzonal](https://eldiariodemiramar.com.ar/2026/07/hospital-subzonal-quirofanos-e-internacion-iran-en-la-segunda-etapa-toman-recaudos-por-si-vuelve-el-tren-y-rigurosidad-en-eleccion-de-empresa-oferente/), El Diario de Miramar.
- [Comisión de Transporte del HCD de Necochea](https://hcdnecochea.gob.ar/2026/04/23/comision-de-transporte-12/): conflicto del servicio y nuevo pliego licitatorio.
- [Reclamos por unidades, demoras y frecuencias en Necochea y Quequén](https://elecos.com.ar/transporte-urbano-crecen-las-quejas-de-usuarios-por-roturas-de-unidades-y-demoras-en-el-servicio), Ecos Diarios.
- [Intimación por obras ambientales en industrias harineras del puerto de Mar del Plata](https://www.0223.com.ar/nota/2026-5-27-8-32-0-intiman-a-las-harineras-del-puerto-denuncian-que-prometieron-obras-para-reducir-contaminantes-y-nunca-las-hicieron), 0223.

Las fuentes respaldan el contexto que origina cada conversación. No respaldan
automáticamente las soluciones propuestas: esas quedan abiertas a evidencia,
discusión comunitaria y revisión editorial.
