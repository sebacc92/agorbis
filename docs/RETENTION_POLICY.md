# Agorbis · borrador de política integral de retención

> **ESTADO: NO VIGENTE.** Este documento es un inventario técnico y un diseño
> pendiente de decisión. No modifica la política de privacidad, la declaración
> presentada ante AAIP, la base de datos ni los plazos efectivos. No demuestra
> cumplimiento y no autoriza a afirmar que Agorbis cumple el valor
> `Determinable · 1 año` presentado en TAD.

## Límite de este borrador

La presentación del Paso 2 quedó bajo el expediente
`EX-2026-82087278- -APN-DNPDP#AAIP`, todavía sin constancia final ni número de
registro de la base. El texto `1 año` no permite determinar, por sí solo, desde
qué hecho empieza a correr el plazo ni si funciona como máximo general, plazo
posterior al cierre o regla para una categoría concreta.

Por eso este documento:

- no convierte `1 año` en `365 días`;
- no elige entre fecha de recolección, última actualización, retiro, cierre o
  fin de la cuenta;
- no sustituye una respuesta de AAIP ni validación jurídica;
- no cambia los plazos actuales de cinco o siete años;
- no inventa la retención de Cloudflare, Supabase o Resend; y
- no contiene SQL, una migración preparada para aplicar ni parámetros de
  Producción.

Los valores `PENDING_AAIP` y `PENDING_PROVIDER` son estados bloqueantes, no
duraciones válidas. Ninguno puede llegar a una configuración abierta.

## Regla de diseño pendiente de aprobación

Cada categoría personal deberá quedar asociada exactamente una vez a estos
elementos:

1. sistema y tablas u objetos alcanzados;
2. hecho objetivo que inicia el cómputo;
3. plazo aprobado o evento de finalización;
4. acción terminal verificable: borrar, anonimizar, redactar, rotar o reconstruir
   un agregado no personal;
5. responsable técnico de ejecutar y verificar la acción; y
6. evidencia de la última ejecución y de cualquier backlog vencido.

Desvincular un UUID no basta para anonimizar texto libre, imágenes, ubicación,
URLs o datos sobre terceros. Si un contenido llega al límite aplicable, sólo
podrá conservarse como contenido no personal después de una revisión
documentada. Si esa revisión no concluye antes del límite, el comportamiento
seguro por defecto deberá ser despublicar y eliminar o redactar los campos
identificables, preservando únicamente estructura y contadores realmente no
personales.

Una solicitud de derechos validada prevalece sobre el cron ordinario: el dato
deberá bloquearse o despublicarse cuando corresponda y la acción deberá
completarse dentro del plazo legal aplicable, sin esperar al vencimiento general
de la categoría.

## Parámetros deliberadamente no resueltos

| Parámetro de diseño                     | Pregunta que debe resolver                                                           | Estado             |
| --------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| `IDENTIFIABLE_DATA_MAX_AGE`             | ¿Existe un máximo general desde la recolección o última actualización?               | `PENDING_AAIP`     |
| `ACCOUNT_POST_TERMINATION`              | ¿Hay un plazo posterior a la baja o la cascada debe ser inmediata?                   | `PENDING_AAIP`     |
| `ACTIVE_RELATION_MAX_AGE`               | ¿Una relación vigente puede durar hasta revocación/baja o también tiene edad máxima? | `PENDING_AAIP`     |
| `PARTICIPATION_LINK_RETENTION`          | ¿Desde participación, cierre del proceso o baja de cuenta?                           | `PENDING_AAIP`     |
| `PUBLIC_IDENTIFIABLE_CONTENT_RETENTION` | ¿Desde publicación, última edición, cierre, retiro o fin de la cuenta?               | `PENDING_AAIP`     |
| `REMOVED_CONTENT_RETENTION`             | ¿Cuánto después de `removed_at` puede persistir físicamente?                         | `PENDING_AAIP`     |
| `REMOVED_COMMENT_RETENTION`             | ¿Cuánto después de un nuevo `removed_at` debe borrarse o redactarse?                 | `PENDING_AAIP`     |
| `PUBLISHED_EVIDENCE_RETENTION`          | ¿Desde publicación, resolución/rechazo/retiro del reclamo o ejercicio de derechos?   | `PENDING_AAIP`     |
| `NOTIFICATION_READ_RETENTION`           | ¿Cuánto después de `read_at`?                                                        | `PENDING_AAIP`     |
| `NOTIFICATION_UNREAD_RETENTION`         | ¿Qué techo corre desde `created_at` aunque no se lea?                                | `PENDING_AAIP`     |
| `TERMINAL_REQUEST_RETENTION`            | ¿Cuánto después de `reviewed_at` o `resolved_at`?                                    | `PENDING_AAIP`     |
| `MODERATION_CASE_RETENTION`             | ¿Se mantienen los siete años actuales o se rectifica ese plazo?                      | `PENDING_AAIP`     |
| `MODERATION_AUDIT_RETENTION`            | ¿Se mantienen los siete años actuales y con qué alcance de metadata?                 | `PENDING_AAIP`     |
| `SUPERSEDED_LEGAL_PROOF_RETENTION`      | ¿Se mantienen los cinco años actuales o se rectifica ese plazo?                      | `PENDING_AAIP`     |
| `LOCAL_DRAFT_RETENTION`                 | ¿Cuánto conserva el navegador un borrador no publicado?                              | `PENDING_AAIP`     |
| `AI_OPERATIONAL_RETENTION`              | Plazos de derivados, jobs y eventos antes de habilitar IA.                           | `PENDING_AAIP`     |
| `SUPABASE_MANAGED_RETENTION`            | Auth, logs, tokens, backups y metadata bajo mecanismos soportados.                   | `PENDING_PROVIDER` |
| `CLOUDFLARE_MANAGED_RETENTION`          | Workers, cache, logs, red global y Turnstile.                                        | `PENDING_PROVIDER` |
| `RESEND_MANAGED_RETENTION`              | Destinatarios, contenido de email, entrega y logs.                                   | `PENDING_PROVIDER` |
| `GOOGLE_DRIVE_BACKUP_RETENTION`         | Paquetes de backup cifrados, checksum, versionado, papelera y logs de acceso.        | `PENDING_PROVIDER` |

## Matriz integral

### Cuenta, autenticación y perfil

| Alcance                                                                                                                  | Estado actual y brecha                                                                                                                                                                                                                                             | Evento objetivo propuesto                                                          | Acción terminal propuesta                                                                                                                        | Estado                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.one_time_tokens`, factores y desafíos MFA | La baja usa `admin.deleteUser` y las relaciones administradas deberían seguir sus cascadas. Cuentas email no confirmadas y altas OAuth abandonadas tienen una ventana actual de 30 días. Los TTL internos de GoTrue y sus logs no están confirmados por proveedor. | Baja confirmada de cuenta; para altas abandonadas, creación o último uso admitido. | Borrar identidad, credenciales, sesiones, factores y perfil; verificar ausencia. Tratar logs administrados sólo mediante un mecanismo soportado. | Cuenta abandonada: confirmado en código. Cuenta activa: `PENDING_AAIP`. Managed Auth: `PENDING_PROVIDER`. |
| `public.profiles`                                                                                                        | Vive con la cuenta y se elimina por cascada. Sus datos también aparecen indirectamente en contenido y Storage.                                                                                                                                                     | Baja de cuenta o derecho aprobado; edad máxima sólo si AAIP la confirma.           | Borrar perfil y avatar; verificar que no sobrevivan UUID, nombre, bio, residencia ni metadata del objeto.                                        | `PENDING_AAIP`                                                                                            |
| `public.follows`, `public.community_visibility`, `public.organization_members`                                           | Se borran por revocación o cascada, pero no tienen edad máxima.                                                                                                                                                                                                    | Revocación, salida de organización o baja; máximo adicional sólo si corresponde.   | Borrar vínculo y reconciliar cualquier contador derivado.                                                                                        | `PENDING_AAIP`                                                                                            |

### Participación y agregados

| Alcance                                                                       | Estado actual y brecha                                                                                                                                                                        | Evento objetivo propuesto                                                               | Acción terminal propuesta                                                                                                                                                        | Estado                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `poll_participation_receipts`, `budget_participation_receipts`                | El catálogo usa `36500` días para representar “vida de la cuenta”. Es un sustituto numérico, no el evento real. No guardan la opción o asignación, pero sí vinculan persona, proceso y fecha. | El hecho que AAIP confirme: participación, cierre/eliminación del proceso o baja.       | Borrar el recibo personal; conservar sólo contadores agregados.                                                                                                                  | `PENDING_AAIP`                                       |
| `claim_supports`, `comment_votes`, `project_pledges`, `project_contributions` | Se vinculan a perfil y normalmente desaparecen con la cuenta. Algunas filas afectan puntajes, apoyos o totales de producto.                                                                   | Baja, revocación, cierre del contenido y/o máximo desde participación, según respuesta. | Materializar y reconciliar agregados antes de borrar o anonimizar el vínculo para no corromper resultados. El texto libre debe revisarse por separado.                           | `PENDING_AAIP`                                       |
| `private.poll_option_tallies`, `private.budget_proposal_tallies`              | El catálogo también usa `36500`, aunque estas tablas no contienen usuario ni boleta individual.                                                                                               | Eliminación del proceso padre.                                                          | Conservar el agregado mientras exista su padre; no presentarlo como dato personal sólo por el valor artificial actual. Mantener controles contra inferencia por grupos pequeños. | Ciclo del padre; no requiere un TTL personal propio. |

### Contenido cívico vigente y retirado

| Alcance                                                                                                                                                                        | Estado actual y brecha                                                                                                                                                                                              | Evento objetivo propuesto                                                             | Acción terminal propuesta                                                                                                                                                                                                         | Estado                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `polls`, `debates`, `claims`, `projects` y sus textos                                                                                                                          | Al borrar la cuenta, el `author_id` puede quedar `NULL` y la publicación sobrevivir. El cuerpo puede seguir identificando al autor o a terceros. No existe máximo general.                                          | Fecha que AAIP confirme, baja, retiro o derecho aprobado, lo que corresponda primero. | Desvincular UUID. Antes del límite, certificar que el contenido remanente no es personal o despublicar y borrar/redactar título, cuerpo, ubicación, URLs y otros campos libres; conservar sólo un stub no personal si hace falta. | `PENDING_AAIP`                                                  |
| Las cuatro publicaciones con `status = 'removed'`                                                                                                                              | Tienen `removed_at`, pero permanecen físicamente completas sin TTL.                                                                                                                                                 | `removed_at`.                                                                         | Borrar o redactar físicamente contenido, coordenadas, URLs, autores y moderadores; conservar sólo estructura no personal justificada.                                                                                             | `REMOVED_CONTENT_RETENTION = PENDING_AAIP`                      |
| `debate_comments`, `project_comments` retirados                                                                                                                                | Sólo registran `status = 'removed'`; carecen de `removed_at`, así que hoy no existe una base temporal fiable.                                                                                                       | Un nuevo `removed_at` sellado por trigger del servidor.                               | Borrar o redactar cuerpo, usuario y votos relacionados. Un cambio futuro debe detenerse si encuentra filas históricas retiradas sin una regla de transición aprobada; no debe inventar un backfill.                               | Timestamp faltante y `REMOVED_COMMENT_RETENTION = PENDING_AAIP` |
| `community_info`, `community_budgets`, `budget_proposals`, `budget_reports`, `claim_events`, `content_sources`, `content_relations`, `institutional_responses`, hitos y tareas | Contienen autores, actores, responsables, URLs y texto libre. Varias FK ponen el usuario en `NULL`; otras, como respuestas institucionales, pueden borrar la fila por cascada y provocar pérdida cívica accidental. | Ciclo del contenido padre, baja, fecha terminal o máximo confirmado.                  | Preservar información cívica no personal; anonimizar referencias y revisar texto/URLs. Corregir las cascadas que destruyan contenido público que deba sobrevivir.                                                                 | `PENDING_AAIP` y decisión de producto documentada.              |

### Reclamos, ubicación, archivos e imágenes

| Alcance                                              | Estado actual y brecha                                                                                                     | Evento objetivo propuesto                                                                   | Acción terminal propuesta                                                                                                                                                                                                                                             | Estado                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `claim_uploads` y objetos pendientes                 | Los borradores no publicados se limpian después de 24 horas. La limpieza usa un handshake y la API de Storage.             | `created_at` sin adjuntar; baja de cuenta para borradores propios.                          | Eliminar el objeto por API, verificar ausencia y luego borrar tracking.                                                                                                                                                                                               | Ventana actual confirmada.                                                            |
| Evidencia publicada de reclamos                      | La baja no borra evidencia ya publicada. Puede conservar imágenes, ubicación y datos de terceros sin fecha terminal.       | Hecho que AAIP confirme: publicación, resolución, rechazo, retiro, baja o derecho aprobado. | Eliminar por API oficial de Storage y verificar ausencia/hash antes de limpiar referencias en DB. Si una evidencia debiera sobrevivir a la baja, reubicarla mediante API oficial y verificar que `owner`, `owner_id` y `user_metadata` ya no identifiquen al usuario. | `PUBLISHED_EVIDENCE_RETENTION = PENDING_AAIP`                                         |
| `storage.objects.owner`, `owner_id`, `user_metadata` | Son campos administrados de Storage. Pueden sobrevivir vinculados a evidencia publicada aun cuando el perfil ya no exista. | Baja, expiración o reubicación del objeto.                                                  | Usar una outbox reintentable y APIs oficiales. Nunca actualizar manualmente el schema administrado ni declarar la limpieza completa hasta verificar bytes, path y metadata final.                                                                                     | Plazo: `PENDING_AAIP`. Mecanismo exacto: debe validarse contra soporte del proveedor. |
| Avatares y objetos huérfanos                         | El barrido actual elimina avatares no referenciados con margen de 24 horas y la baja inventaría avatares del usuario.      | Desreferencia, baja o antigüedad de 24 horas.                                               | Remover por API y borrar tracking sólo después de verificar ausencia.                                                                                                                                                                                                 | Confirmado en código; mantener pruebas de carrera.                                    |

### Notificaciones, solicitudes y moderación

| Alcance                                       | Estado actual y brecha                                                                                                                     | Evento objetivo propuesto                                                            | Acción terminal propuesta                                                                                                | Estado                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `notifications`                               | Pueden borrarse manualmente y tienen `created_at`/`read_at`, pero no TTL automático. Una notificación no leída puede permanecer sin techo. | `read_at` para leídas; `created_at` como techo para no leídas.                       | Borrado físico; conservar sólo métricas agregadas.                                                                       | Ambos plazos `PENDING_AAIP`.                                       |
| `reports`                                     | Casos terminales tienen `resolved_at`; no existe purge. Motivo, reportante, objetivo y resolución pueden ser sensibles.                    | `resolved_at`; casos abiertos se conservan hasta decisión, con alerta de antigüedad. | Borrar o anonimizar motivo y UUID; conservar únicamente un resultado agregado si está justificado.                       | `TERMINAL_REQUEST_RETENTION = PENDING_AAIP`                        |
| `community_requests`, `organization_requests` | Tienen `reviewed_at` cuando se resuelven; mantienen razón, mensaje, evidencia y UUID sin purge.                                            | `reviewed_at`; pendientes hasta resolución con alerta.                               | Borrar o redactar razón, mensaje, evidencia y vínculos personales.                                                       | `TERMINAL_REQUEST_RETENTION = PENDING_AAIP`                        |
| `moderation_appeals`, `user_suspensions`      | Los casos terminales se purgan actualmente a 2555 días.                                                                                    | Cierre, retiro, levantamiento o vencimiento.                                         | Borrar en orden compatible con FK: apelación antes de suspensión. No purgar un caso abierto; alertar si queda estancado. | Plazo actual confirmado técnicamente, conciliación `PENDING_AAIP`. |
| `moderation_audit_log`                        | Se purga a 2555 días. Al borrar un moderador, su UUID puede quedar `NULL`, pero `metadata` aún puede identificar personas o contenido.     | `created_at`.                                                                        | Borrar físicamente al plazo aprobado y minimizar/sanitizar metadata desde su creación.                                   | Plazo actual confirmado técnicamente, conciliación `PENDING_AAIP`. |

### Prueba legal, operación y funcionalidades deshabilitadas

| Alcance                                                                      | Estado actual y brecha                                                                                                                     | Evento objetivo propuesto                                      | Acción terminal propuesta                                                              | Estado                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `user_legal_acceptances`                                                     | Versiones sustituidas se conservan actualmente 1825 días; la vigente dura con la cuenta.                                                   | Sustitución efectiva y baja.                                   | Borrar la aceptación personal; conservar la versión no personal del documento.         | Plazo actual confirmado técnicamente, conciliación `PENDING_AAIP`.                   |
| `user_international_transfer_consents`                                       | Consentimientos de avisos sustituidos se conservan actualmente 1825 días; todos desaparecen con la cuenta.                                 | `superseded_at` del aviso y baja.                              | Borrar consentimiento; conservar snapshot/hash no personal del aviso.                  | Plazo actual confirmado técnicamente, conciliación `PENDING_AAIP`.                   |
| `activation_events`, `private.abuse_windows`, `private.write_cooldowns`      | Purge actual con literales de 90, 7 y 1 día.                                                                                               | Creación, inicio o vencimiento de la ventana.                  | Borrado físico.                                                                        | Confirmado en código; no nace del “1 año”.                                           |
| `private.mfa_enrollment_tickets`                                             | Vencen a los cinco minutos, pero una fila expirada sólo se limpia cuando otro enrollment ejecuta la función.                               | `expires_at`.                                                  | Sumar su borrado al purge operativo sin alterar factores vigentes.                     | Evento y vencimiento confirmados; ejecución periódica faltante.                      |
| `private.privileged_mfa_factors`                                             | Vive con el factor y la cuenta mediante cascadas.                                                                                          | Eliminación del factor o cuenta.                               | Cascada y verificación de ausencia.                                                    | Confirmado en código.                                                                |
| `private.account_deletion_jobs`                                              | Jobs completos se eliminan a los 30 días. Un job fallido debe persistir hasta reparar la limpieza; borrarlo ocultaría archivos pendientes. | `completed_at`; para fallos, hasta completar con escalamiento. | Alertar dead-letter/backlog, reparar y verificar; recién entonces iniciar los 30 días. | Retención de completados confirmada; SLA de escalamiento por definir operativamente. |
| `ai_summaries`, `ai_summary_generation_jobs`, `ai_summary_generation_events` | La funcionalidad está deshabilitada. Los derivados pueden repetir datos personales y jobs/eventos carecen de una política integral.        | Expiración o retiro de la fuente; finalización/fallo del job.  | Borrar derivado junto con su fuente y purgar jobs/eventos al plazo aprobado.           | `PENDING_AAIP`; no habilitar IA antes de resolverlo y documentar proveedor.          |

### Navegador, copias y caches

| Alcance                                         | Estado actual y brecha                                                                                                                                                | Evento objetivo propuesto                               | Acción terminal propuesta                                                                                                                        | Estado                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Borradores en `localStorage`                    | Se eliminan al publicar, descartar manualmente o limpiar el sitio. El payload no tiene timestamp y puede persistir sin límite. No se almacena en el servidor.         | Guardado, publicación o descarte.                       | Versionar un diseño futuro con `savedAt`; borrar al vencer o publicar. No copiarlo al servidor.                                                  | `LOCAL_DRAFT_RETENTION = PENDING_AAIP`                                                                                  |
| Cookies de idioma, zona horaria y última visita | Las preferencias/última visita usan actualmente hasta un año; el marcador OAuth dura diez minutos.                                                                    | Escritura o renovación de cookie.                       | Expiración del navegador y borrado al invalidar el flujo cuando corresponda.                                                                     | Confirmado en código; reconciliación de alcance `PENDING_AAIP`.                                                         |
| Backups propios                                 | Política operativa actual: 14 diarios, 8 semanales y 12 mensuales. Una restauración histórica puede reintroducir bajas posteriores al snapshot.                       | Fecha del paquete y baja ocurrida después del snapshot. | Eliminar paquetes al rotar; mantener clave separada. Antes de reabrir un restore, reconciliar y volver a ejecutar bajas posteriores al snapshot. | Rotación documentada; mecanismo de replay debe quedar incorporado al runbook antes de automatizar restores productivos. |
| Cache de media y vistas sociales                | Hay respuestas de media con cache de cinco minutos y vistas sociales con una ventana stale mayor. Un origen borrado puede seguir servido hasta expirar o invalidarse. | Supresión/redacción del origen.                         | Invalidar mediante mecanismo soportado o esperar y verificar el máximo efectivo antes de declarar eliminación completa.                          | Retención efectiva de Cloudflare: `PENDING_PROVIDER`.                                                                   |
| Export de datos descargado                      | Se genera para entrega y no se persiste como dataset del servidor. La copia descargada queda bajo control del titular.                                                | Respuesta completada.                                   | No almacenar una copia adicional en Agorbis; evitar logs con contenido.                                                                          | Confirmado en código.                                                                                                   |

### Tratamiento administrado por proveedores

| Proveedor    | Datos relevantes                                                                                                   | Brecha                                                                                                                                                                                | Estado                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Supabase     | Auth, IP/User-Agent y auditoría, sesiones/tokens/MFA, DB, Storage, backups y logs administrados.                   | Faltan plazos exactos y procedimientos soportados de eliminación para cada superficie. No se modifica manualmente `auth.schema_migrations`, `storage.migrations` ni schemas internos. | `SUPABASE_MANAGED_RETENTION = PENDING_PROVIDER`    |
| Cloudflare   | Requests/responses en Workers, IP, URL, headers/cookies, formularios/archivos, cache, logs y señales de Turnstile. | Faltan plazos efectivos, países/accesos y procedimientos de purge aplicables a la cuenta.                                                                                             | `CLOUDFLARE_MANAGED_RETENTION = PENDING_PROVIDER`  |
| Resend       | Destinatario, contenido y metadata de confirmaciones, recuperación y avisos; eventos/logs de entrega.              | Faltan plazos exactos y procedimientos de supresión aplicables.                                                                                                                       | `RESEND_MANAGED_RETENTION = PENDING_PROVIDER`      |
| Google Drive | Paquete de backup cifrado, checksum saneado y metadata operativa de cuenta/acceso.                                 | Destino seleccionado pero todavía sin carga: faltan producto y entidad aplicables, versionado, papelera, logs, retención, borrado y evidencia de eliminación de cuenta.               | `GOOGLE_DRIVE_BACKUP_RETENTION = PENDING_PROVIDER` |

Los valores de proveedor no se completan copiando un plazo genérico de una web,
un DPA o un plan distinto. Deben respaldarse con el contrato aplicable, la
configuración efectiva y, cuando corresponda, una respuesta del proveedor.

## Brechas técnicas transversales confirmadas

1. `public.data_retention_policies.retention_days` es obligatorio y sólo admite
   un número. Por eso actualmente se usan `36500` días para ciclos que en
   realidad terminan con la cuenta o el contenido.
2. El catálogo es descriptivo: `purge_expired_operational_data()` utiliza
   intervalos SQL literales. Cambiar una fila del catálogo no cambia el purge.
3. Varias categorías personales no están catalogadas y no tienen acción
   terminal automática.
4. Los comentarios retirados carecen de un timestamp de retiro.
5. Cerrar o cambiar ciertos estados no siempre deja un `terminal_at` inequívoco.
6. DB y Storage no comparten transacción; toda eliminación de objetos necesita
   outbox, reintentos, verificación y alerta de dead-letter.
7. Las metadata administradas de Auth/Storage no deben corregirse con `GRANT`,
   `ALTER OWNER`, `SET ROLE` ni cambios manuales de schema.
8. Un backup o cache puede conservar datos después de eliminarlos del origen;
   la evidencia de supresión debe incluir rotación, invalidación y
   reconciliación posterior a restore.

## Proceso exacto después de la respuesta de AAIP

No se salta ningún paso ni se reutiliza este borrador como autorización:

1. Guardar fuera de Git la respuesta, constancia y copia exacta de la
   declaración. Registrar en documentación sólo referencias públicas o
   redacted.
2. Determinar por escrito qué significa `1 año`: hecho inicial, categorías
   alcanzadas, máximo o plazo posterior y excepciones admitidas. Si la respuesta
   no es inequívoca, pedir aclaración antes de diseñar SQL.
3. Obtener validación jurídica sobre la correspondencia entre esa respuesta,
   la declaración presentada y cualquier actualización/rectificación necesaria
   en TAD. No tratar un correo como modificación automática de la declaración.
4. Resolver cada `PENDING_AAIP` con un valor y una fuente. Resolver cada
   `PENDING_PROVIDER` sólo con evidencia contractual/configuración efectiva.
5. Elegir y documentar una sola semántica por categoría. Como mínimo, evaluar:
   máximo desde recolección/última actualización, o plazo desde evento terminal
   o fin de relación. No combinar bases temporales para obtener el resultado
   menos restrictivo.
6. Presentar un diff separado de producto, privacidad y migración. Ese diff
   deberá reemplazar el uso artificial de `36500`, hacer ejecutable el catálogo,
   agregar timestamps faltantes y definir las acciones sobre contenido libre.
7. Implementar Storage únicamente mediante APIs oficiales y una outbox
   reintentable. El SQL no podrá editar historias ni schemas administrados.
8. Agregar pruebas de borde exacto, casos abiertos/terminales, idempotencia,
   lotes parciales, cascadas, backlog, dead-letter, bytes y metadata Storage,
   caches y restore de un snapshot anterior a una baja.
9. Ejecutar migración y cron contra Supabase local. Verificar que ninguna fila
   venza antes del límite, que toda fila vencida sea tratada y que el segundo
   pase sea idempotente.
10. Ejecutar backup y restore drill local con datos en cada categoría. Después
    del restore, reconciliar bajas y probar que no reaparecen datos que ya debían
    estar eliminados.
11. Actualizar privacidad ES/EN, inventario AAIP y preflight con los valores
    efectivos. Los textos deben describir el comportamiento observado, no el
    planeado.
12. Mostrar listado y dry-run con `--project-ref` explícito. Pedir autorización
    nueva antes de aplicar cualquier migración en Producción.
13. Después de una aplicación autorizada, comprobar migration list, lint, diff,
    RLS, funciones, Storage, backlog cero y métricas de la primera corrida. No
    abrir Agorbis mientras algún parámetro requerido siga pendiente o la
    implementación difiera del texto aprobado.

## Evidencia del estado actual

- `0039_production_hardening.sql` crea el catálogo numérico y codifica los
  purges actuales con intervalos literales.
- `0044_account_deletion_saga.sql` confirma que la baja limpia avatar y archivos
  provisionales, pero preserva evidencia publicada.
- `0047_private_poll_ballots.sql` usa `36500` para representar vida de cuenta o
  vida del proceso en recibos y tallies.
- `0056_versioned_international_transfer_consent.sql` conserva evidencia
  sustituida durante 1825 días.
- `src/components/forms/useDraft.ts` guarda borradores sin timestamp hasta
  publicar, descartar o limpiar el sitio.
- `src/lib/legal-content.ts` publica hoy ventanas de cinco y siete años y una
  revisión caso por caso para contenido/evidencia.

Esta evidencia explica la brecha; no constituye una política nueva ni una
declaración de cumplimiento.
