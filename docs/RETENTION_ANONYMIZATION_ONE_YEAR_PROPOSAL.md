# Agorbis · propuesta técnica de retención y anonimización por un año

> **ESTADO: PROPUESTA NO VIGENTE, NO IMPLEMENTADA Y NO APTA PARA SER
> PUBLICADA COMO HECHO.** Este documento no cambia Producción, no reemplaza la
> declaración presentada ante AAIP y no autoriza una migración. Antes de abrir
> funciones interactivas hay que elegir y validar jurídicamente el criterio de
> cómputo, implementarlo, probarlo y actualizar los textos públicos.

## Objetivo y límite de la propuesta

El Paso 2 fue presentado bajo el expediente
`EX-2026-82087278- -APN-DNPDP#AAIP` con conservación **determinable** y plazo
**un año**. Ese expediente no es el número de registro de la base. El código de
responsable sigue siendo `RL-2026-81658385-APN-DNPDP#AAIP`.

El esquema actual no permite sostener todavía que todas las categorías
personales vencen dentro de ese plazo: existen políticas de cinco y siete años,
recibos de participación que usan `36500` días como sustituto de “vida de la
cuenta”, contenido identificable sin vencimiento, comentarios retirados sin
`removed_at` y metadata administrada de Storage que no está cubierta por el
purge operativo. Esta propuesta define el perfil técnico más estricto que sí
podría corresponder al texto presentado, sin destruir innecesariamente el valor
cívico no personal.

La expresión literal se modela como **un año calendario** (`interval '1 year'`),
no como una conversión silenciosa a 365 días. La decisión jurídica pendiente es
si el año corre desde recolección, última actualización, última actividad o un
hecho terminal. Hasta resolverla no debe aplicarse este diseño ni afirmarse
cumplimiento.

## Clasificación de afirmaciones

- **CONFIRMADO POR EL CÓDIGO:** tabla, dato o comportamiento que existe en las
  migraciones o rutas actuales.
- **PROPUESTO:** comportamiento nuevo de este documento; no existe todavía.
- **VALIDACIÓN JURÍDICA:** interpretación del “un año” o excepción que debe
  confirmar una persona profesional o AAIP.
- **RESPUESTA DE PROVEEDOR:** dato que Agorbis no puede borrar directamente y
  que requiere evidencia contractual u operativa del proveedor.

## Regla común propuesta

Cada categoría personal tendrá una política versionada con cinco valores
obligatorios:

1. un hecho de inicio verificable (`anchor_at`);
2. un vencimiento calculado como `anchor_at + interval '1 year'`, salvo que una
   ventana menor ya implementada sea aplicable;
3. una acción terminal entre borrar, anonimizar, redactar o reconstruir un
   agregado no personal;
4. un estado de verificación y un registro agregado de ejecución; y
5. un propietario técnico de la tarea.

En el perfil estricto de un año, la actividad de una cuenta puede renovar sólo
los datos que siguen siendo necesarios para operar esa cuenta. No renueva de
forma automática publicaciones, archivos, votos, reportes ni casos de
moderación antiguos. Una cuenta sin actividad verificable durante un año
calendario se desactiva y elimina en su fecha límite; la notificación preventiva
debe enviarse antes del vencimiento y no agregar una gracia posterior.

Desvincular un UUID no anonimiza por sí solo texto libre, imágenes,
coordenadas, URLs ni datos de terceros. Al vencer, una publicación puede seguir
visible sólo si un proceso verificable confirma que el remanente no permite
identificar o reidentificar razonablemente a una persona. Si esa revisión no
termina a tiempo, el comportamiento fail-closed es despublicar y borrar o
redactar los campos personales.

La supresión válida solicitada por el titular prevalece sobre el cron ordinario.
Las obligaciones legales de conservación que exijan más de un año requieren
documentación concreta y, antes de usarse, validar la rectificación de la
declaración: no se crean excepciones genéricas “por defensa legal”.

## Matriz de categorías reales y tratamiento propuesto

| Categoría real                                                                                                                             | Evidencia actual                                                                                                                      | Reloj estricto propuesto                                                                                                                    | Acción al vencimiento                                                                                                                               | Estado                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Cuenta, email, identidades, credenciales protegidas, sesiones, refresh/OTP y MFA (`auth.*`)                                                | Supabase Auth; baja mediante `admin.deleteUser`; altas no confirmadas y OAuth abandonadas ya vencen a 30 días                         | Última actividad de cuenta autenticada verificable; para alta abandonada, `created_at`/último uso con la ventana menor de 30 días           | Desactivar y borrar por API Admin soportada; revocar sesiones, tokens, identidades y factores; verificar cascadas                                   | Código parcial confirmado; reloj anual y verificación propuestos; TTL internos requieren respuesta de Supabase |
| Perfil, residencia declarada, avatar, bio y rol (`profiles`)                                                                               | `0001_schema.sql`, `0011_public_identity.sql`, `0044_account_deletion_saga.sql`, `0045_final_security_closure.sql`                    | Última actividad verificable de cuenta o baja, lo primero que venza                                                                         | Borrar perfil y avatar por API de Storage; revisar copias en contenido y metadata                                                                   | Propuesto                                                                                                      |
| Seguimientos, visibilidad y membresías (`follows`, `community_visibility`, `organization_members`)                                         | `0001_schema.sql`, `0011_public_identity.sql`, `0018_civic_workflows.sql`                                                             | Creación o reconfirmación explícita del vínculo                                                                                             | Borrar vínculo; reconciliar contadores no personales                                                                                                | Propuesto; hoy no hay reconfirmación ni TTL                                                                    |
| Recibos de participación (`poll_participation_receipts`, `budget_participation_receipts`)                                                  | `0047_private_poll_ballots.sql`; hoy usan `36500` días y se borran con la cuenta                                                      | Momento de participación                                                                                                                    | Borrar el vínculo persona-proceso; conservar sólo tallies agregados privados                                                                        | Propuesto; requiere reemplazar `36500`                                                                         |
| Apoyos, votos de comentarios, compromisos y contribuciones (`claim_supports`, `comment_votes`, `project_pledges`, `project_contributions`) | `0001_schema.sql`, `0018_civic_workflows.sql`, `0052_project_contribution_privacy.sql`, `0053_public_project_pledges.sql`             | Creación o última modificación permitida                                                                                                    | Borrar o anonimizar vínculo y recalcular agregados en una transacción                                                                               | Propuesto                                                                                                      |
| Encuestas, debates, reclamos y proyectos vigentes                                                                                          | `polls`, `debates`, `claims`, `projects` conservan texto libre y autor; la baja puede poner autor en `NULL`                           | Publicación o última edición sustantiva; no se renueva por una visita del autor                                                             | Desvincular autor y revisar texto, ubicación, URLs y media; conservar contenido sólo si queda no personal; si no, despublicar/redactar              | Propuesto; impacto público controlado                                                                          |
| Publicaciones retiradas                                                                                                                    | Las cuatro tablas anteriores tienen `removed_at`; hoy la fila completa puede persistir                                                | `removed_at`                                                                                                                                | Borrar/redactar físicamente autor, moderador, texto, coordenadas, URLs y archivos; opcional stub no personal                                        | Propuesto                                                                                                      |
| Comentarios de debate y proyecto vigentes/retirados                                                                                        | `debate_comments`, `project_comments`; retirados tienen estado pero no `removed_at`                                                   | Creación/última edición; para retiro, nuevo `removed_at` sellado por trigger                                                                | Borrar/redactar cuerpo y usuario; retirar votos relacionados                                                                                        | Propuesto; requiere timestamp y regla explícita para históricos                                                |
| Fuentes, relaciones, respuestas institucionales, eventos de reclamo, presupuestos, propuestas, informes, hitos y tareas                    | `0018_civic_workflows.sql`, `0028_participatory_budget.sql`; contienen actores, responsables, URLs y texto libre                      | Creación/última edición o cierre del padre, según el registro                                                                               | Anonimizar referencias y revisar texto/URLs; preservar el hecho cívico no personal                                                                  | Propuesto; revisar FKs que hoy borran contenido por cascada                                                    |
| Evidencia pendiente de reclamos                                                                                                            | `claim_uploads`; limpieza actual después de 24 horas cuando no se adjunta                                                             | `created_at` sin `attached_at`                                                                                                              | Eliminar objeto mediante API de Storage y luego tracking DB                                                                                         | Ventana menor confirmada; conservar                                                                            |
| Evidencia publicada de reclamos                                                                                                            | Objeto privado servido por `/media/reclamos/...`; puede contener personas, ubicación y metadata                                       | Carga/publicación, sin renovación automática; una resolución anterior también cierra el tratamiento                                         | Eliminar por API o crear una copia saneada no personal; verificar bytes/path y ausencia de owner/metadata identificable antes de borrar el original | Propuesto                                                                                                      |
| Avatares y borradores de avatar                                                                                                            | Bucket privado y `private.avatar_uploads`; sólo se sirve el objeto referenciado                                                       | Reserva/carga para borrador; última actividad de cuenta para avatar vigente                                                                 | Borrador/huerfano: ventana operativa corta; vigente: borrar por API con la cuenta o vencimiento anual                                               | Código parcial confirmado; TTL exacto de huérfanos debe quedar versionado                                      |
| Metadata de `storage.objects` (`owner`, `owner_id`, `user_metadata`)                                                                       | El account-deletion saga inspecciona esos campos, pero no existe una regla anual integral                                             | Mismo reloj del objeto representado                                                                                                         | Nunca hacer `UPDATE` directo al schema administrado: borrar o reconstruir por API oficial, verificar metadata y luego limpiar tracking              | Propuesto                                                                                                      |
| Notificaciones                                                                                                                             | `notifications` contiene destinatario, actor, tipo, payload y lectura; no tiene purge integral                                        | Leída: `read_at` con una ventana propuesta de 30 días; no leída: `created_at + 1 año` como máximo                                           | Borrar; no conservar payload personal en métricas                                                                                                   | Propuesto                                                                                                      |
| Reportes, solicitudes de comunidad/organización y apelaciones                                                                              | `reports`, `community_requests`, `organization_requests`, `moderation_appeals`; varios casos terminales no tienen TTL de un año       | `resolved_at`, `reviewed_at`, retiro o `updated_at` terminal; un caso abierto sin actualización debe escalar/cerrar antes de cumplir un año | Borrar o anonimizar solicitante/reportante, texto y evidencia; conservar sólo contadores no personales                                              | Propuesto                                                                                                      |
| Suspensiones y auditoría de moderación                                                                                                     | `user_suspensions`, `moderation_audit_log`; política actual de 2555 días (7 años)                                                     | Cierre/levantamiento/vencimiento y `created_at`, respectivamente                                                                            | Borrar o anonimizar dentro del año salvo obligación concreta validada y declaración rectificada                                                     | Conflicto confirmado con el año declarado; validación jurídica obligatoria                                     |
| Aceptaciones legales y consentimientos de transferencia                                                                                    | `user_legal_acceptances` y `user_international_transfer_consents`; políticas actuales de 1825 días (5 años) para versiones históricas | Sustitución/revocación/baja; en perfil estricto, renovar anualmente evidencia vigente que siga siendo necesaria                             | Borrar evidencia sustituida al año y todas las filas con la baja, salvo obligación concreta validada                                                | Conflicto confirmado; validación jurídica obligatoria                                                          |
| Telemetría y controles de abuso                                                                                                            | `activation_events` 90 días; `abuse_windows` 7; `write_cooldowns` 1                                                                   | Fechas actuales                                                                                                                             | Borrar con ventanas actuales, todas menores a un año                                                                                                | Confirmado por `purge_expired_operational_data()`                                                              |
| Tickets MFA y outbox de baja                                                                                                               | `private.mfa_enrollment_tickets` tiene `expires_at`; `account_deletion_jobs` usa 30 días después de completar                         | `expires_at`/`completed_at`                                                                                                                 | Borrar registro operativo                                                                                                                           | Código parcial confirmado; verificar cron y backlog                                                            |
| IA (`ai_summaries`, jobs y eventos)                                                                                                        | Tablas existen, pero el proveedor de IA y la función pública están deshabilitados para el lanzamiento                                 | No habilitar hasta definir reloj; si se habilita, creación/fin del job o fecha del contenido fuente                                         | Borrar jobs/eventos; invalidar derivados cuando se retire la fuente; anonimizar antes de conservar resumen                                          | Tratamiento deshabilitado; política futura                                                                     |
| Borradores del navegador                                                                                                                   | `useDraft.ts` guarda formularios en `localStorage` sin timestamp; se borra al publicar/descartar                                      | Última edición local                                                                                                                        | Expirar y borrar a los 30 días; borrar también al publicar, cerrar cuenta o elegir “descartar”                                                      | Propuesto; Agorbis no puede borrar remotamente un navegador que no vuelve                                      |
| Backups y copias restauradas                                                                                                               | El tooling crea paquetes cifrados y manifiestos; un backup conserva las edades del origen                                             | Creación del backup, siempre menor al máximo de los datos contenidos                                                                        | Expirar la copia en menos de un año; al restaurar, ejecutar purge antes de abrir el target y no revivir datos vencidos                              | Propuesto; requiere política operativa y evidencia de borrado                                                  |
| Emails, logs, backups y metadata administrados por Supabase, Resend y Cloudflare                                                           | No están bajo control SQL de Agorbis                                                                                                  | Criterio contractual verificable del proveedor                                                                                              | Solicitar borrado/retorno o elegir configuración que no exceda lo declarado; documentar excepciones/rectificación                                   | **RESPUESTA DE PROVEEDOR**; no puede prometerse desde código                                                   |

## Cambios técnicos mínimos antes de activar esta política

Esta propuesta requiere una migración separada de la migración `0059` de
consentimiento específico. No se le asigna número hasta integrar y aprobar
`0059`.

1. Reemplazar el catálogo sólo numérico por políticas versionadas con dataset,
   evento de inicio, intervalo, acción terminal, estado y fecha efectiva. El
   proceso debe abortar si una tabla personal conocida no tiene política o si
   aparece una nueva sin clasificar.
2. Agregar relojes faltantes, en particular `removed_at` a comentarios y fechas
   terminales inequívocas a reportes/solicitudes. Las filas históricas sin fecha
   deben ir a una cola de revisión; no se debe inventar un backfill con la fecha
   de la migración.
3. Mantener por separado el reloj de cuenta y los relojes de cada objeto. Una
   visita no debe prolongar evidencia, publicaciones o casos de moderación.
4. Incorporar un flujo de saneamiento de contenido con estados
   `pending_review`, `anonymized`, `redacted` y `purged`. Si llega la fecha límite
   en `pending_review`, despublicar automáticamente.
5. Implementar una outbox de Storage. El Worker borra/reconstruye mediante API,
   verifica ausencia o metadata saneada y sólo después confirma la fila DB. No
   escribir manualmente `storage.objects` ni su historial administrado.
6. Ampliar `/internal/purge-retained-data` para procesar lotes acotados, locks,
   retry idempotente, dead-letter, backlog, edad de la fila más antigua y
   métricas agregadas sin IDs. Mantener el trigger apagado durante la preview
   read-only.
7. Añadir timestamps a `localStorage` y limpiar borradores mayores a 30 días al
   cargar la app, sin enviarlos al servidor.
8. Hacer que una restauración falle cerrada hasta recalcular vencimientos y
   purgar datos que caducaron mientras estaban dentro del backup.
9. Generar pruebas por categoría: borde exacto de año calendario, zona horaria,
   bisiesto, retry de Storage, texto no certificado, cuenta activa/inactiva,
   cascadas, RLS, agregados y restauración.
10. Publicar una versión nueva de Privacidad/Retención y registrar su aceptación
    cuando corresponda. La política efectiva debe exponer el mismo evento y
    plazo que el código.

## Impacto esperado en contenido público

- Un contenido cívico puede sobrevivir más de un año **sólo como información no
  personal**. Se conservan estructura, estado, fechas, totales y hechos que no
  identifiquen; se eliminan autoría, media, ubicación precisa y texto que sí lo
  haga.
- Una publicación que todavía contenga opinión política atribuible, imagen de
  una persona, domicilio, contacto o relato identificable se despublica si no
  fue saneada antes del vencimiento.
- Los agregados de encuestas/presupuesto pueden continuar si no contienen una
  boleta individual ni permiten inferencia en grupos pequeños. Los recibos que
  vinculan persona y proceso vencen al año.
- No se promete “anonimización” sólo porque `author_id` quede `NULL`.

## Texto exacto utilizable después de implementar y validar el perfil estricto

> Los datos personales se conservan como máximo durante un año calendario
> contado desde su recolección o última actualización sustantiva verificable,
> según la categoría. Los datos necesarios para una cuenta activa renuevan su
> plazo únicamente mediante actividad verificable de esa cuenta; si no existe
> actividad durante un año calendario, la cuenta y sus datos se eliminan. Los
> registros asociados a un caso se eliminan o anonimizan dentro de un año desde
> su cierre, retiro o resolución. Las ventanas operativas de seguridad,
> borradores y archivos no publicados son menores. Al vencer, el contenido
> cívico sólo puede conservarse si fue anonimizado de forma que no permita
> identificar o reidentificar razonablemente a una persona; de lo contrario se
> despublica y elimina o redacta. Las copias de respaldo expiran dentro del mismo
> límite y una restauración vuelve a aplicar los vencimientos antes de abrirse.

No usar ese texto hasta que las pruebas demuestren la ejecución completa y se
resuelva el tratamiento administrado por proveedores. Si se decide conservar
datos de una cuenta mientras esté activa y contar un año sólo desde la baja, o
mantener evidencia legal/moderación por más tiempo, corresponde validar y
rectificar la declaración antes de publicar otro texto.

## Decisiones pendientes y fail-closed

1. **VALIDACIÓN JURÍDICA:** confirmar si “un año” es máximo desde
   recolección/actualización, plazo post-terminal o ambos.
2. **VALIDACIÓN JURÍDICA:** resolver si existe obligación concreta que justifique
   conservar aceptaciones o moderación más de un año y cómo rectificar TAD.
3. **RESPUESTA DE PROVEEDOR:** obtener plazos y mecanismos de borrado de Auth,
   SMTP, logs, backups, Turnstile y red Edge. La aplicación no los controla.
4. **DECISIÓN DE PRODUCTO:** elegir qué campos cívicos pueden convertirse de
   forma fiable en contenido no personal y cuáles siempre deben eliminarse.

Mientras cualquiera de estas decisiones siga abierta, el perfil interactivo no
debe afirmar que el sistema completo cumple el año. La preview read-only puede
mantener apagadas las escrituras y los crons sin aplicar esta propuesta.
