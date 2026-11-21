# Agorbis · revisión pública de evidencia de proveedores

Fecha de consulta: **8 de septiembre de 2026**. Alcance: documentación pública
oficial de Supabase, Resend y Cloudflare; preparación para la posterior etapa
del responsable. Se incorporaron después las capturas del panel de Supabase
aportadas por el responsable, el PDF TIA fechado 14-03-2025 y los correos del
caso **SU-467483**, copiados por él en la conversación. El agente no accedió al correo del responsable ni envió
consultas a terceros. Las lecturas técnicas posteriores de configuración
Supabase/Cloudflare se registran por separado en el
[avance del release](release-readiness-progress-2026-09-08.md). No se modificó
configuración productiva ni se aceptó contrato alguno en esta revisión.

Este documento separa `PUBLIC_DOCUMENTED` —lo que publica el proveedor— de
`ACCOUNT_NOT_VERIFIED` —su aplicación efectiva a Agorbis todavía no verificada—,
`USER_SCREENSHOT_CONFIRMED` —configuración visible en capturas del responsable— y
`PENDING_PROVIDER` —respuesta o instrumento particular todavía necesario—.
Ninguno equivale por sí solo a un `PASS` del inventario de release.

Agorbis ya es un sitio público según la evidencia de operación anterior. Los
pendientes se refieren a flujos existentes y a la entrega preparada, no a un
servicio que nunca recibió visitas. No se verificaron en esta revisión el
número de usuarios, el tráfico histórico ni el alcance de cada flujo desplegado.

## Supabase

### Fuentes y alcance comprobado

| Fuente oficial                                                                             | Versión o fecha publicada                                                                                       | Qué acredita públicamente                                                                                                                                                                                                                                      | Qué no acredita sobre Agorbis                                                                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)              | Versión 1, 01-08-2026                                                                                           | Supabase Pte. Ltd actúa como encargado. §6.1 distingue almacenamiento/procesamiento principal en región indicada de otros tratamientos; §11.2 prevé devolución y borrado al terminar; Schedule 2 §4.4 contempla suplemento para otro mecanismo del exportador. | Versión aceptada por la cuenta, suplemento argentino firmado, países de todos los accesos o plazos por categoría.                                         |
| [Regiones](https://supabase.com/docs/guides/platform/regions)                              | Sin fecha editorial explícita en la consulta                                                                    | Una región primaria por proyecto; `us-east-2` corresponde a Ohio, Estados Unidos. La región controla ubicación primaria, no demuestra cumplimiento.                                                                                                            | Que el proyecto actual siga en esa región; exclusividad territorial de soporte, logs, backups o subencargados.                                            |
| [Subencargados, PDF oficial](https://supabase.com/legal/subprocessor-list/June-1-2026.pdf) | 01-06-2026; enlazado desde el [índice vigente](https://supabase.com/legal/customer-resources/subprocessor-list) | Enumera entidades y funciones, incluidas infraestructura, soporte, observabilidad e IA.                                                                                                                                                                        | No contiene una columna de países ni determina qué entidad recibe cada categoría de Agorbis. Una entidad de IA listada no prueba que reciba nuestra base. |
| [Backups](https://supabase.com/docs/guides/platform/backups)                               | Sin fecha editorial explícita en la consulta                                                                    | Acceso a copias diarias según plan: Pro 7 días, Team 14 y Enterprise hasta 30. Los backups de base no incluyen los objetos Storage.                                                                                                                            | Plan/PITR contratado, existencia y restaurabilidad de una copia nuestra o eliminación selectiva dentro de una copia.                                      |
| [Logs](https://supabase.com/docs/guides/observability/logs)                                | Sin fecha editorial explícita en la consulta                                                                    | La retención depende del plan y hay distintas fuentes de logs, entre ellas Auth, Storage y PostgreSQL.                                                                                                                                                         | TTL efectivo de cada fuente, exportaciones o retención de soporte/auditoría del proveedor.                                                                |

El DPA incluye opiniones políticas y salud entre las categorías sensibles y
exige los avisos y consentimientos necesarios (§4 y Schedule 3). La restricción
de HIPAA exige un BAA previo para los datos alcanzados por esa ley; no convierte
cualquier mención de salud en un caso HIPAA. Estas cláusulas orientan la
consulta, sin resolver la admisibilidad concreta del contenido de Agorbis.
[Fuente: DPA](https://supabase.com/legal/customer-resources/data-processing-addendum).

### Respuesta particular que todavía hace falta

La región primaria, el plan, las copias listadas y PITR sin habilitar quedaron
confirmados mediante las capturas descritas abajo. Sigue pendiente la cobertura
de Auth, base, Storage, logs, réplicas y backups, con accesos de soporte y países
de tratamientos posteriores.

- Alcance de cualquier acuerdo particular de la cuenta y suplemento o
  respuesta expresa sobre el modelo argentino. El domicilio del importador no
  se debe usar como ubicación física de toda la base.
- Categorías sensibles realmente admitidas, controles exigidos y alcance de
  proveedores de IA sobre datos de proyecto, consola o soporte.
- Retención por categoría/evento: borrado de fila, objeto, usuario Auth,
  proyecto y terminación del contrato. Separar copias, WAL/PITR, registros de
  seguridad y cualquier excepción legal.

### Configuración aportada por el responsable

El 08-09-2026 el responsable compartió dos capturas como evidencia del proyecto
Agorbis y su organización (`USER_SCREENSHOT_CONFIRMED`):

- **Primary Database:** `East US (Ohio)`, código `us-east-2`, Estados Unidos.
- **Billing / Subscription Plan:** `Pro Plan`.
- **Billing / Cost Control:** `Spend cap is enabled`.

Se registra únicamente lo visible y su atribución por el responsable. Las
capturas no muestran el identificador del proyecto ni de la organización; no
se realizó una verificación independiente mediante API. No se copian métricas
transitorias, importes de facturación ni información de otros proyectos.

Dos capturas posteriores de **Database > Backups** amplían la evidencia visual:

- **Scheduled backups:** ocho entradas `PHYSICAL`, fechadas del 01 al
  08-09-2026, con acción `Restore`. La más reciente figura
  `08 Sep 2026 07:12:29 (+0000)` y la más antigua
  `01 Sep 2026 07:46:47 (+0000)`. La cabecera identifica Agorbis, `main`,
  `PRODUCTION` y organización Agorbis Pro. No se ejecutó ninguna restauración.
- **Point in time:** aviso `Point in Time Recovery is available as an add-on`
  y botón `Enable add-on`; PITR no está habilitado. No se activó ni contrató.
- El aviso de copias excluye expresamente los objetos de Storage.

El número de entradas observado no establece una retención contractual de ocho
días: la documentación pública de Pro indica acceso a siete días de copias
diarias. Tampoco certifica restaurabilidad, cobertura del ledger de migraciones
esperado, respaldo de objetos Storage ni cumplimiento continuo del RPO.
La ubicación primaria no acredita residencia exclusiva de todos los tratamientos.

El [runbook](PRODUCTION_RUNBOOK.md#backup-y-restauración) considera PITR opcional
para el lanzamiento inicial. Se creó y verificó el paquete cifrado de DB y
Storage `backup-20260908T232222Z`; siguen pendientes la copia externa y el
ensayo aislado de recuperación.

### Respuesta del caso SU-467483

El responsable aportó el acuse con número de ticket y la respuesta de Privacy
Team. Supabase informa que desde el 01-08-2026 el DPA se incorpora a sus términos
sin firma separada; los acuerdos negociados distintos conservan prevalencia.
También indica que TIA y documentación HIPAA están en Organization Settings →
Legal Documents. El responsable aportó después el TIA; no se accedió a su
sesión del panel ni se contrató un plan Enterprise. No hace falta volver a pedir una firma individual del DPA
estándar. Estado: **respuesta general recibida; aclaraciones específicas pendientes**.

Se contrastó el enlace: DPA versión 1 del 01-08-2026. §6.1 contempla región
principal y excepciones; §11.2 trata el fin del contrato, no el TTL de cada
servicio tras borrar un usuario. §12.1(b) y Schedule 2 §4 regulan otras
jurisdicciones bajo condiciones; no nombran ni acreditan por sí solos el
instrumento aplicable a Argentina.
[Fuente: DPA vigente](https://supabase.com/legal/customer-resources/data-processing-addendum).

Quedan sin respuesta específica las preguntas sobre tratamientos de Agorbis,
destinos actuales por servicio, retención y salvaguardas argentinas. Se preparó una
[respuesta breve para el mismo ticket](supabase-follow-up-SU-467483.md), sin enviarla.

El responsable confirmó posteriormente que respondió el seguimiento. Se
registra como envío declarado por él; sigue pendiente la respuesta de Supabase
a esas aclaraciones. El agente no accedió al correo ni envió el mensaje.

### TIA recibido y revisado

El [TIA aportado](supabase-tia-review-2026-09-08.md), de 17 páginas y fechado
14-03-2025, menciona expresamente EE. UU. y Singapur (p. 4) y declara medidas
de cifrado. Completa la recepción/revisión del documento. Su importador
identificado es Supabase Inc (p. 1), mientras que el DPA actual identifica
Pte. Ltd; falta confirmar vigencia y alcance. El TIA no contiene plazos de
borrado por servicio ni un instrumento argentino particular. La revisión
detallada y el mensaje actualizado conservan estos límites sin inferir países
adicionales de los domicilios ni convertir la lista histórica en cobertura
actual completa de Agorbis.

## Resend

### Fuentes y alcance comprobado

| Fuente oficial                                                       | Versión o fecha publicada                                            | Qué acredita públicamente                                                                                                                                                                                      | Qué no acredita sobre Agorbis                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [DPA](https://resend.com/legal/dpa)                                  | Actualizado 27-08-2026; reemplaza la fecha antigua de nuestro pedido | Plus Five Five, Inc.; §9 separa tratamiento propio de Account/Usage Data. Exhibit A declara datos sensibles no aplicables y borrado de datos restantes dentro de 90 días tras terminar la cuenta.              | Copia contractual de Agorbis, aceptación del tratamiento cívico o un acuerdo argentino ejecutado.                |
| [FAQ GDPR](https://resend.com/security/gdpr)                         | Sin fecha editorial explícita en la consulta                         | Datos de clientes almacenados en EE.UU.; DPA firmado descargable en Documents; email/logs 30 días en Free/Pro/Scale; Enterprise admite retención flexible y es requerido para solicitar cambios contractuales. | Plan y excepciones particulares, versión descargada y ajustes efectivamente contratados.                         |
| [Región de envío](https://resend.com/docs/dashboard/domains/regions) | Sin fecha editorial explícita en la consulta                         | Seleccionar región cambia el envío, no la residencia de datos de cuenta; una región de envío europea no los traslada a Europa.                                                                                 | Región elegida en el dominio productivo o países de todos los accesos.                                           |
| [Seguridad](https://resend.com/security)                             | Sin fecha editorial explícita en la consulta                         | Publica copias mantenidas durante 7 días.                                                                                                                                                                      | Prueba de borrado de un mensaje concreto o TTL de cada copia, excepción y log del servicio usado por Agorbis.    |
| [Subencargados](https://resend.com/legal/subprocessors)              | Actualizado 27-08-2026                                               | Lista entidades, funciones y ubicación indicada; incluye envío/hosting, seguridad, soporte e IA.                                                                                                               | Que todos reciban nuestros mensajes, qué campos reciben o que la ubicación listada sea una residencia exclusiva. |

El §6.6.4 del DPA está dentro de medidas para transferencias EEE/Reino Unido;
sirve como referencia para preguntar por un suplemento, **no como prueba de
que Resend esté obligado a firmar las cláusulas argentinas**.
[Fuente: DPA](https://resend.com/legal/dpa).

### Respuesta particular que todavía hace falta

- Plan, región de envío, tracking efectivo, funcionalidades habilitadas y copia
  firmada de Documents. El pedido puede citar la política pública estadounidense
  sin afirmar exclusividad de todos los tratamientos.
- Respuesta sobre correos de autenticación/seguridad de una plataforma cívica:
  no incluyen elecciones ni publicaciones, pero su contexto puede revelar
  afiliación o interés. No declarar que jamás contienen datos sensibles sin
  evaluar ese contexto y la restricción del anexo.
- TTL y mecanismo de supresión para cuerpo, destinatario, logs, eventos,
  rebotes, quejas, listas de supresión, soporte y copias. La baja de una cuenta
  Agorbis no equivale a la terminación de la cuenta contractual Resend.
- Instrumento argentino disponible, alcance Responsable–Responsable de datos
  propios y costo/plan si hace falta un suplemento. No contratarlo todavía.

## Cloudflare

### Fuentes y alcance comprobado

| Fuente oficial                                                                                       | Versión o fecha publicada                                          | Qué acredita públicamente                                                                                                                                    | Qué no acredita sobre Agorbis                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)                                           | 6.4, efectivo 03-04-2026                                           | Cloudflare, Inc. como encargado para el tratamiento cubierto; Annex 1 contempla categorías especiales y retención por necesidad/terminación.                 | Aceptación de la cuenta, equivalencia con cláusulas AAIP o un TTL único de todos los productos.                          |
| [Términos Developer Platform](https://www.cloudflare.com/service-specific-terms-developer-platform/) | Actualizados 02-06-2026                                            | Workers tiene condiciones propias; §8 contempla retirar contenido que divulga información sensible.                                                          | No resuelve por sí solo la compatibilidad entre el contenido cívico descrito y las condiciones del plan.                 |
| [Subencargados para servicios](https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/)   | Actualizado 01-10-2025, fecha que aún muestra la página consultada | Entidades, ubicaciones y servicios, además de afiliadas para soporte. Hay entradas específicas de Developer Platform y otras sólo de AI Gateway/Workers AI.  | No asigna cada flujo de Agorbis a un país/entidad; no deben agregarse proveedores de productos que no usamos.            |
| [Workers y regionalización](https://developers.cloudflare.com/data-localization/how-to/workers/)     | Actualizado 23-07-2026                                             | Regional Services puede limitar ejecución/TLS del dominio configurado. No cubre subrequests salientes ni cron; código y secretos se distribuyen globalmente. | Contratación/activación o confinamiento de todos los tratamientos de Agorbis a una región.                               |
| [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)           | Actualizado 11-08-2026                                             | Retención publicada: 3 días en Free y 7 en Paid. Logs incluye invocaciones, salidas personalizadas y errores.                                                | Plan/configuración remotos o TTL de DNS, Turnstile, seguridad, caché, exportaciones y soporte.                           |
| [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/)                   | Actualizado 18-06-2025                                             | Describe IP y señales técnicas. Cloudflare es encargado al proteger el sitio y responsable al mejorar la detección.                                          | Retención exacta por finalidad, todos los destinos o cobertura de ambos roles por un solo acuerdo Responsable–Encargado. |

La presencia de categorías especiales en el DPA y la restricción de divulgación
en los términos específicos deben reconciliarse para el caso concreto. No
equivalen ni a una prohibición absoluta de cualquier opinión política ni a una
autorización irrestricta de publicar información sensible.
[DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) y
[términos](https://www.cloudflare.com/service-specific-terms-developer-platform/).

### Respuesta particular que todavía hace falta

- Productos, plan, regionalización, caché, logs/exportaciones y servicios
  adicionales realmente activos; distinguir código preparado de Worker vigente.
- Países y accesos por Workers HTTP, cron, DNS y Turnstile, con tratamiento por
  encargo separado del propio. Un punto de presencia visto en una respuesta
  HTTP no acredita los destinos de todas las solicitudes.
- Retención y supresión por categoría, incluidos metadatos técnicos anteriores
  a cualquier consentimiento del visitante.
- Compatibilidad contractual del contenido cívico/sensible y mecanismos
  argentinos aplicables a ambos roles. Ninguna respuesta genérica sobre GDPR,
  DPF o certificaciones sustituye este punto.

## Qué queda preparado para la etapa humana

Para la etapa activa están listos los mensajes iniciales de
[Resend](resend-privacy-initial-request.md) y
[Cloudflare](cloudflare-privacy-initial-request.md), sin adjuntos. Sus contactos
se contrastaron de nuevo con fuentes oficiales. Falta recibir la copia del DPA
del equipo de Agorbis en Resend; la FAQ enlaza directamente
[Settings → Documents](https://resend.com/settings/documents).
Supabase SU-467483 y el pedido AAIP de ficha completa ya fueron enviados según
confirmación del responsable, y esperan respuesta; no repetirlos ahora.

Los [pedidos corregidos](TRANSFER_SAFEGUARDS_REQUESTS.md) quedan listos para
revisión final y envío autorizado. No dicen que el sitio jamás estuvo público,
no aseguran ausencia de usuarios y no esconden las fechas reales de aceptación.

La [guía AAIP de transferencias](https://www.argentina.gob.ar/transferencias-internacionales),
consultada en esta misma fecha, distingue adecuación, consentimiento/excepciones
aplicables y mecanismos contractuales. Para contratos que difieren de sus
modelos indica solicitar aprobación dentro de treinta días corridos de la
firma. No se presume aprobación por enviar una consulta ni se retrodata un DPA.
El consentimiento del alta no cubre retroactivamente el primer request.

| Paquete pendiente | Evidencia mínima a reunir después                                       | Criterio de cierre                                                                             |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Contrato          | Copia aceptada, versión/fecha, entidad y respuesta particular           | Instrumento realmente aplicable revisado; no sólo una página pública.                          |
| Destinos          | Configuración saneada y respuesta por servicio/categoría                | Textos ES/EN delimitados por lo acreditado, sin países inventados ni exclusividad inferida.    |
| Retención         | Tabla categoría → evento inicial → plazo → excepción → eliminación      | Correspondencia con servicio/plan real; no mezclar cierre de Agorbis con cierre del proveedor. |
| Datos sensibles   | Alcance permitido y controles, con tratamiento transitorio incluido     | Reconciliación de contrato, interfaz, SQL, logs y avisos; un borrador no la satisface.         |
| Transferencias    | Instrumento, anexos, roles y evidencia de aprobación cuando corresponda | Cobertura del flujo previo al consentimiento y del posterior según el mecanismo aplicable.     |

No se cambian en esta revisión `PUBLIC_*_PROCESSING_LOCATION`, las salvaguardas,
la retención pública ni el estado de los gates. Resend permite ahora describir
con precisión un hecho público antes no recogido; convertirlo en la declaración
integral de Agorbis exige terminar la delimitación del flujo. Facebook permanece
fuera de este alcance y no bloquea Google. Google OAuth y el posible backup en
Google Drive son tratamientos distintos de estos tres dossiers.
