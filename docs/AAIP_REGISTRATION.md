# Agorbis · inscripción de bases ante AAIP/TAD

Este documento conserva la preparación y el estado del Paso 2 del Registro
Nacional de Bases de Datos Personales. No reemplaza asesoramiento jurídico ni
la declaración efectivamente enviada en TAD.

Fuentes oficiales consultadas:

- [trámite para registrar una base privada](https://www.argentina.gob.ar/registrar-bases-de-datos-personales-privadas);
- [instructivo vigente para bases privadas en TAD](https://www.argentina.gob.ar/sites/default/files/instructivo_tad_inscripcionymodificacion_basesprivadas_2.pdf);
- [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto);
- [Guía AAIP sobre datos personales con fines electorales, Resolución 86/2019](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-86-2019-323901/texto);
- [reglas e instrumentos para transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).

## Estado del trámite

El Paso 2 fue presentado en TAD bajo el expediente
`EX-2026-82087278- -APN-DNPDP#AAIP`. Ese `EX` acredita únicamente la
presentación: **no es la constancia de aprobación ni el número de registro de la
base**. Agorbis permanece a la espera de la aprobación y del número que AAIP
asigne a la base.

### Observación de la captura del 8 de septiembre de 2026

La captura de TAD aportada por el operador muestra el expediente en estado
**«Iniciación»**. Esta observación se limita a esa pantalla y fecha: no acredita
aprobación, asignación del número de base ni ausencia de requerimientos. No se
inspeccionaron desde esa captura el contenido de Notificaciones, Tareas
pendientes, la declaración presentada o todos los documentos del expediente.
Tampoco permite afirmar si un analista ya lo revisó o cuándo se resolverá.

En las capturas posteriores aportadas en la conversación, la bandeja general
**Tareas pendientes** muestra «No tenés tareas vinculadas». La lista visible de
**Notificaciones** contiene una notificación AAIP del 24-08-2026, identificada
como **Paso 1: Inscripción de Responsable de Bases de Datos**. No muestra una
notificación del Paso 2 ni su constancia de aprobación. No se abrió desde estas
capturas el documento descargable del Paso 1; no se infiere su contenido del
mensaje genérico «Notificación al ciudadano».

Quedan verificadas esas dos vistas para la sesión mostrada. Esto no acredita
ausencia de comunicaciones por correo, contenido de Documentos Externos o tareas
visibles con otro nivel de autenticación; TAD advierte que la visualización
depende del nivel utilizado al iniciar sesión. No se modifica el estado de
aprobación ni el número pendiente de la base.

El siguiente paso útil es abrir el expediente del Paso 2 desde **Iniciados** y
descargar la declaración presentada y su acuse; también falta revisar el correo
declarado. Conservar los documentos fuera del repositorio y extraer sólo los
campos necesarios para conciliar conservación, proveedores y transferencias.
La guía AAIP distingue la constancia
con número asignado, que se envía después de aprobar, de las observaciones que
puedan formularse durante el trámite. El manual TAD explica que las tareas y
notificaciones se consultan por separado del listado de expedientes.
[Guía de inscripción AAIP](https://www.argentina.gob.ar/registrar-bases-de-datos-personales-privadas),
[manual TAD, apartados 2.8 y 2.9](https://www.argentina.gob.ar/sites/default/files/manual_de_usuarios_tad_12.3.21.pdf).

La [preparación de la siguiente etapa](privacy-reconciliation-next-stage.md)
deja la revisión de retención, las decisiones pendientes y una consulta lista
para revisar y enviar por el responsable. No se envió ninguna consulta ni se
modificó TAD al preparar estos documentos. El sitio ya estaba accesible según
la última observación documentada; las referencias a «antes de abrir» que
siguen pertenecen a la preparación histórica y no afirman que esté cerrado.

Actualización posterior: el responsable confirmó el envío del pedido de la
ficha completa y está esperando respuesta. No se solicita repetir ese pedido;
la consulta de conciliación más amplia se revisará cuando llegue la ficha.

El código `RL-2026-81658385-APN-DNPDP#AAIP` continúa identificando al
responsable. No debe reemplazarse por el expediente y tampoco debe presentarse
como si fuera el número de la base. La declaración enviada y su acuse deben
conservarse fuera del repositorio; cuando llegue la constancia, se registrará
separadamente el número de la base sin sobrescribir el `RL`.

## Regla estricta para el código del responsable

El Paso 1 quedó aprobado el 24 de agosto de 2026. La notificación del registro
en los documentos del expediente TAD identifica al responsable con el código
público `RL-2026-81658385-APN-DNPDP#AAIP`. La constancia descargable debe
conservarse fuera del repositorio junto con el expediente legal.

Sólo ese código `RL`, efectivamente emitido por la AAIP para Sebastian Cardoso
Castillo, puede:

1. ingresarse como número de registro del responsable en el Paso 2; y
2. cargarse en `PUBLIC_AAIP_CONTROLLER_ID`.

`PUBLIC_AAIP_DATABASE_REGISTRATION_ID` es una variable distinta y debe quedar
vacía hasta que AAIP apruebe el Paso 2 y emita el número de registro de la base.
Ni el expediente `EX` ni el `RL` del responsable son valores válidos para ella.

Nunca usar para esos fines:

- un expediente `EX-...`;
- un documento `RE-...` o `PV-...`;
- CUIL/CUIT;
- número de transacción TAD;
- una constancia todavía no aprobada; ni
- un valor inventado para superar el preflight.

El CUIL/CUIT y las credenciales fiscales se ingresan exclusivamente en TAD. No
se guardan en el repositorio, la infraestructura de Agorbis ni mensajes de
soporte.

## Secuencia pendiente en TAD

1. Conservar fuera del repositorio el acuse y la copia exacta de la declaración
   presentada.
2. Atender cualquier observación de AAIP sin tratar el expediente como una
   aprobación.
3. Conservar la constancia y el número de registro que AAIP envíe al aprobar el
   trámite.
4. Reconciliar ese número y la ficha aprobada con la documentación de
   Producción antes de abrir Agorbis al público.

El trámite es gratuito y no vence, pero los cambios deben actualizarse. El
instructivo advierte que **nombre y finalidades no pueden modificarse** después
de confirmar; el resto de la ficha sí puede actualizarse.

## Reconciliación previa al go-live: conservación y Cloudflare

### Documento de identificación revisado

El operador aportó el PDF `RE-2026-82059727-APN-DNPDP#AAIP`, denominado
**Identificación del Responsable de Base de Datos**. Se revisó localmente:
contiene una página y no tiene archivos embebidos. El único campo de formulario
es el código del responsable. Su año y número corresponden al responsable ya
documentado; el texto lo presenta como `RL - 2026 - 81658385 - DNPDP#AAIP`.
Se conserva el código completo acreditado previamente en la configuración;
este formulario no sustituye la constancia emitida del Paso 1.

No contiene nombre de la base, finalidades, conservación, alojamiento ni
transferencias. Tampoco es la constancia de aprobación del Paso 2. El archivo
original permanece fuera del repositorio. En las dos páginas del listado de
documentos mostradas por el operador no se identificó una ficha completa de la
base; no se concluye por eso que nunca se haya presentado o que esté incompleta.

Para recuperar esa evidencia queda preparado un
[pedido específico a AAIP](privacy-reconciliation-next-stage.md#pedido-previo-de-la-ficha-completa),
que el responsable confirmó posteriormente haber enviado y cuya respuesta
espera. El agente no accedió al correo. Hasta obtenerla, el año informado sigue siendo una declaración del
operador pendiente de contraste documental, no un dato verificado en este PDF.

### Alcance todavía pendiente de contraste

El responsable informó que en la presentación del Paso 2 declaró conservación
`Determinable` y `1 año`. Ese dato debe verificarse palabra por palabra contra
la copia o PDF efectivamente presentado —incluidos el hecho que inicia el plazo
y cualquier texto adicional— antes de tratarlo como contenido de la declaración
jurada. El expediente `EX` por sí solo no permite reconstruir ese campo.

Si `1 año` fue declarado como plazo máximo general para toda categoría
identificable, el estado técnico y el aviso público actuales **todavía no son
coherentes** con esa declaración:

- `0039_production_hardening.sql` conserva trazabilidad de moderación durante
  2555 días y aceptaciones legales sustituidas durante 1825 días;
- `0056_versioned_international_transfer_consent.sql` conserva consentimientos
  de transferencia sustituidos durante 1825 días;
- `0047_private_poll_ballots.sql` representa varios ciclos vinculados a la vida
  de la cuenta con `36500` días; y
- contenido retirado, evidencia publicada, comentarios retirados,
  notificaciones, reportes/solicitudes terminales y metadata identificable de
  Storage no tienen todavía un TTL físico completo y uniforme.

No afirmar cumplimiento con un año hasta completar uno de estos caminos y dejar
evidencia: (a) implementar un máximo de un año para todas las categorías
alcanzadas por lo declarado; o (b), si la declaración utilizó `1 año` con otro
alcance, obtener validación jurídica y actualizar los campos modificables de la
ficha para reflejar los plazos y eventos reales. El instructivo oficial indica
que los campos distintos de nombre y finalidad pueden modificarse, pero no
resuelve cómo documentar un cambio mientras el expediente está pendiente. Ese
procedimiento debe consultarse en `registrobasesdedatos@aaip.gob.ar` sin asumir
que el correo modifica por sí mismo la declaración.

La [matriz integral de retención](./RETENTION_POLICY.md) inventaría las
categorías, eventos y acciones terminales que deberán resolverse después de la
respuesta. Es un borrador expresamente **no vigente**: sus valores
`PENDING_AAIP`/`PENDING_PROVIDER` no interpretan el año declarado ni demuestran
cumplimiento.

La migración de hosting también exige reconciliar estos campos modificables:

1. **destino/cesiones y transferencias:** retirar Vercel e incorporar Cloudflare
   como proveedor de DNS autoritativo, Turnstile y Workers Edge Compute/reverse
   proxy global;
2. **datos y finalidades:** declarar que Workers puede procesar IP, URL,
   headers/cookies de sesión, formularios, archivos, contenido cívico,
   respuestas y logs operativos;
3. **roles y acceso:** distinguir el tratamiento por encargo de cualquier dato
   de red, seguridad, cuenta o señales que Cloudflare trate como responsable;
4. **países:** Estados Unidos está confirmado como jurisdicción de Cloudflare,
   Inc., importador contractual; los demás países de procesamiento, acceso y
   subencargados aplicables a esta cuenta siguen pendientes de respuesta. Una
   red global no debe convertirse por inferencia en una lista de países; y
5. **conservación y seguridad:** incorporar únicamente retenciones, cachés,
   logs y controles de Workers/Turnstile realmente configurados o confirmados
   por Cloudflare.

El DPA Cloudflare v6.4 contempla expresamente categorías especiales, incluidas
opiniones políticas, pero debe conservarse evidencia de que quedó incorporado a
la cuenta. No equivale a permiso para divulgar datos sensibles de terceros: los
términos de Developer Platform permiten a Cloudflare retirar o suspender
contenido que considere ilegal o dañino, incluida divulgación de información
personal sensible. La moderación, redacción y supresión siguen siendo controles
necesarios.

También continúan pendientes de respuesta los países, accesos ulteriores y
retenciones exactos de Supabase y Resend. No inventar esos valores ni presentar
el DPA de Cloudflare, SCC europeas o un framework extranjero como salvaguarda
argentina. Hasta documentar el mecanismo aplicable al primer request,
`PUBLIC_TRANSFER_SAFEGUARDS` y `PUBLIC_TRANSFER_SAFEGUARDS_EN` deben permanecer
fail-closed.

## Borrador de unidad registral anterior a la presentación

La implementación actual es una única base relacional: Auth, perfiles,
participación, moderación, operación y Storage se relacionan por UUID y sirven
a la misma plataforma. El borrador de trabajo propuso una base integrada:

- nombre de fantasía: `AGORBIS`;
- nombre de la base: `AGORBIS USUARIOS Y PARTICIPACION CIVICA`.

Este borrador no sustituye el nombre ni las finalidades efectivamente enviados.
Esos valores deben transcribirse desde la copia de la declaración presentada,
sin reconstruirlos de memoria. El canal oficial para dudas del registro es
`registrobasesdedatos@aaip.gob.ar`.

Si AAIP exige separación, los conjuntos lógicos a evaluar —sin asumir todavía
que sean tres inscripciones— son:

1. cuentas, autenticación y seguridad;
2. perfiles, contenido y participación cívica; y
3. moderación, derechos y cumplimiento.

## Inventario de datasets y campos

### Cuenta, autenticación y seguridad

- email, UUID, proveedor de acceso y timestamps de alta/último acceso;
- contraseña cifrada, hashes de tokens y credenciales de recuperación, nunca
  contraseña en texto claro;
- identidades vinculadas y metadatos básicos del proveedor;
- sesiones, refresh tokens, IP, User-Agent y registros de auditoría;
- factores, desafíos y evidencias TOTP/MFA.

Tablas principales: `auth.users`, `auth.identities`, `auth.sessions`,
`auth.refresh_tokens`, `auth.one_time_tokens`, `auth.mfa_factors`,
`auth.mfa_challenges`, `auth.mfa_amr_claims` y `auth.audit_log_entries`.

### Perfil, territorio y relaciones

- username, nombre público, avatar y biografía;
- comunidad de residencia declarada, fecha de cambio y nivel de verificación;
- rol, follows, membresías de organizaciones y visibilidad comunitaria.

Tablas principales: `public.profiles`, `public.follows`,
`public.community_visibility` y `public.organization_members`.

### Contenido y participación cívica

- encuestas: pregunta, descripción, categoría, opciones y autor;
- la opción individual se procesa durante la emisión y no se persiste como
  boleta;
- recibo relacionado con usuario, consulta y hora, pero sin opción elegida;
- presupuestos participativos: partida, propuestas, importes, asignación
  transitoria, recibo sin reparto individual y contadores agregados;
- debates, comentarios, votos de comentario y fuentes;
- reclamos, apoyos, descripción, imágenes, ubicación aproximada y eventos;
- proyectos, compromisos monetarios, aportes no monetarios, tareas, hitos y
  comentarios;
- solicitudes de comunidades/organizaciones y respuestas institucionales.

Tablas principales: `public.polls`, `public.poll_options`,
`public.poll_participation_receipts`, `private.poll_option_tallies`,
`public.community_budgets`, `public.budget_proposals`,
`public.budget_participation_receipts`,
`private.budget_proposal_tallies`, `public.debates`,
`public.debate_comments`, `public.comment_votes`, `public.claims`,
`public.claim_supports`, `public.claim_events`, `public.projects`,
`public.project_pledges`, `public.project_contributions` y tablas relacionadas.

### Moderación, derechos y cumplimiento

- reportes, motivo, objetivo y estado;
- suspensiones, apelaciones, decisiones y auditoría de moderación;
- notificaciones;
- versiones/aceptaciones legales y consentimiento versionado de transferencias;
- solicitudes y trabajos de eliminación de cuenta.

Tablas principales: `public.reports`, `public.user_suspensions`,
`public.moderation_appeals`, `public.moderation_audit_log`,
`public.notifications`, `public.legal_document_versions`,
`public.user_legal_acceptances`,
`public.international_transfer_notice_versions`,
`public.user_international_transfer_consents` y
`private.account_deletion_jobs`.

### Operación y archivos

- eventos mínimos de activación y metadatos operativos;
- ventanas antiabuso y cooldowns;
- reservas de carga;
- bucket, path, ID, owner/owner_id, metadata y user_metadata de objetos;
- bytes de avatar y evidencia almacenados en Storage.

Tablas principales: `public.activation_events`, `private.abuse_windows`,
`private.write_cooldowns`, `private.avatar_uploads`, `public.claim_uploads`,
`storage.buckets` y `storage.objects`.

Las tablas de resúmenes de IA existen pero la función no está habilitada. No se
debe declarar un proveedor, destino o finalidad de IA como activo hasta que el
tratamiento se decida, documente y habilite expresamente.

## Borrador campo por campo

| Campo TAD                                | Borrador verificable                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CUIL/CUIT                                | Ingresarlo directamente en TAD; no copiarlo al repositorio ni al chat.                                                                                                                                                                                                                                                                               |
| Registro N.°                             | `RL-2026-81658385-APN-DNPDP#AAIP`, código aprobado del responsable.                                                                                                                                                                                                                                                                                  |
| Nombre de fantasía                       | `AGORBIS`.                                                                                                                                                                                                                                                                                                                                           |
| Nombre de la base                        | `AGORBIS USUARIOS Y PARTICIPACION CIVICA`, pendiente de confirmar la unidad registral. Debe ir en mayúsculas, sin abreviaciones, acentos ni puntos.                                                                                                                                                                                                  |
| Finalidad                                | Elegir las etiquetas exactas visibles en TAD. Si ninguna cubre el tratamiento, usar `Otros`: “Gestión de cuentas, autenticación y seguridad; prestación de una plataforma de participación cívica; publicación y moderación de contenido; atención de derechos y cumplimiento legal”. No inventar nombres de opciones que no estén en el formulario. |
| Datos sensibles                          | **Sí**. El producto trata o puede revelar opiniones políticas y admite contenido/reclamos de la categoría salud.                                                                                                                                                                                                                                     |
| Antecedentes penales o contravencionales | **No** según el diseño actual: reportes y alegaciones de usuarios no forman una base estructurada de antecedentes oficiales. Reevaluar si el producto comienza a recopilar certificados o antecedentes.                                                                                                                                              |
| Tipo de datos                            | `Datos identificatorios`; `Datos vinculados al estado civil y características personales`; `Datos de circunstancias sociales`; `Datos comerciales, económicos y financieros`; `Datos relativos a la salud`; `Otros`.                                                                                                                                 |
| Detalle de Otros                         | “Identificadores técnicos y de seguridad, ubicación aproximada, opiniones y participación cívica incluidas opiniones políticas, contenido, evidencia, consentimientos y registros de moderación”.                                                                                                                                                    |
| Forma de recolección                     | `Directamente del titular`; `Otros`: datos técnicos y derivados generados durante el uso. No marcar cesión privada por Google mientras Google siga deshabilitado. Si se habilita, actualizar la ficha.                                                                                                                                               |
| Destino de los datos                     | Público de Internet y buscadores para perfil/contenido que el usuario publique; responsable y moderadores autorizados; proveedores contractuales de infraestructura, Auth, Storage, correo y antiabuso. No afirmar entregas directas a instituciones que el flujo actual no realiza.                                                                 |
| Forma de actualización                   | `Manual`; `Desde una aplicación`; `Procesos de lotes`.                                                                                                                                                                                                                                                                                               |
| Periodicidad                             | `Diaria`; `Eventual`.                                                                                                                                                                                                                                                                                                                                |
| Conservación                             | Usar el texto determinable de la sección siguiente; nunca “por tiempo indeterminado”.                                                                                                                                                                                                                                                                |
| Seguridad/accesibilidad                  | TLS; contraseñas protegidas por Supabase Auth; MFA administrativo; RLS y mínimo privilegio; separación de schemas; secretos sólo servidor; CAPTCHA y límites antiabuso; cargas provisionales privadas; auditoría y procedimientos de borrado. Mencionar una copia independiente cifrada sólo después de que esté operativa.                          |
| Roles con acceso                         | Responsable/administrador; moderadores autorizados; personal autorizado de proveedores contractuales cuando sea necesario para prestar soporte.                                                                                                                                                                                                      |
| Transferencia internacional              | Estados Unidos es un destino cierto. Agregar sólo países confirmados por los proveedores; no convertir la sede contractual, una lista global genérica o una ubicación de subencargado no aplicable en un destino declarado.                                                                                                                          |
| Interrelación                            | `Código único`: UUID interno. Agorbis no usa CUIL ni DNI como clave de usuario.                                                                                                                                                                                                                                                                      |
| Forma de ejercer derechos                | `Correo electrónico` y `Sitio web`.                                                                                                                                                                                                                                                                                                                  |
| Domicilio/contacto                       | [domicilio reservado], Provincia de Buenos Aires, Argentina; `sebastiancardoso92@gmail.com`; `https://agorbis.com`.                                                                                                                                                                                                                                  |
| Requisitos y procedimiento               | Verificación proporcional mediante sesión autenticada o control del correo asociado. Responder acceso dentro de 10 días corridos y rectificación, actualización, supresión o confidencialidad dentro de 5 días hábiles. No exigir DNI por defecto si otro medio suficiente reduce exposición.                                                        |

## Borrador de conservación anterior a la presentación

Este texto fue material preparatorio. No acredita qué se declaró finalmente ni
que cada plazo esté implementado; debe reconciliarse con la copia exacta de TAD
y con el enforcement técnico antes del go-live:

> Cuenta y perfil: durante la vida de la cuenta. Altas de email no confirmadas y
> cuentas OAuth sin consentimiento/actividad: 30 días. Telemetría de activación:
> 90 días. Controles antiabuso vencidos: 1 a 7 días. Trabajos de baja
> completados: 30 días. Aceptaciones legales y de transferencias sustituidas: 5
> años, salvo baja anterior. Suspensiones, apelaciones terminales y auditoría de
> moderación: 7 años. Recibos de participación sin opción: durante la vida de la
> cuenta y se eliminan con ella. Contadores agregados: hasta eliminar la
> encuesta o partida. Contenido público y evidencia: hasta su eliminación,
> pérdida de necesidad o resolución de una solicitud de derechos. Backups:
> completar con la rotación de Producción efectivamente implementada.

No presentar este borrador como la declaración aprobada. Los plazos de
proveedores y backups sólo pueden documentarse con la configuración o respuesta
real correspondiente.

Google Drive fue seleccionado como futura dependencia off-host para almacenar
exclusivamente paquetes cifrados y checksums saneados. La carpeta informada por
el operador no acredita una transferencia: no hubo OAuth, configuración, carga,
descarga ni restore. Antes del primer upload se debe determinar el producto y
entidad aplicables, rol, términos o DPA, países, subencargados, metadata
operativa, retención/borrado y mecanismo de transferencia bajo el criterio de
la AAIP; recién entonces corresponde reconciliar o rectificar la ficha. La
credencial de descifrado no puede almacenarse en ese proveedor.

## Tratamiento sensible

La Ley 25.326 define como sensibles los datos que revelan, entre otros,
opiniones políticas e información de salud. La Resolución 86/2019 indica que
las opiniones políticas sólo pueden tratarse cuando exista consentimiento
respecto de la publicación, con finalidad estadística sin titulares
identificables o por un interés general autorizado legalmente. También aclara
que publicar en foros o plataformas no excluye la aplicación de la ley.

En Agorbis:

- posts, comentarios, apoyos y compromisos pueden revelar una opinión;
- la pertenencia o participación en una consulta puede permitir inferencias
  incluso si el recibo no conserva la opción;
- la elección de encuesta o presupuesto se recibe vinculada a una sesión,
  aunque sólo sea transitoria, y luego se transforma en un contador agregado;
- reclamos, encuestas e imágenes de la categoría `salud` pueden contener datos
  de salud propios o de terceros.

La ausencia de una fila de boleta reduce el riesgo, pero no convierte en
anónimo el tratamiento transitorio frente a Agorbis, Supabase o una persona con
acceso privilegiado.

## Cuestiones jurídicas y operativas que siguen abiertas

La presentación no resuelve por sí sola estas cuestiones ni las convierte en
afirmaciones válidas de la política:

1. ¿AAIP considera la implementación relacional una base integrada o exige
   separar cuentas/seguridad, participación y moderación/derechos?
2. ¿Qué finalidad exacta debe elegirse en el catálogo vivo de TAD?
3. ¿Cuál es la base jurídica suficiente para la opción política identificable
   que se procesa transitoriamente pero no se publica?
4. ¿La acción deliberada de publicar, acompañada por un aviso justo antes del
   envío, satisface el consentimiento respecto de la publicación de una opinión
   política, o se requiere una aceptación separada?
5. ¿Cómo debe tratarse el contenido sensible de terceros que un usuario suba a
   pesar de las reglas de comunidad?
6. ¿Qué países exactos deben informarse para Edge global, Turnstile y cada
   subencargado realmente aplicable?
7. ¿Debe declararse Singapur por la entidad importadora Supabase Pte. Ltd. aun
   cuando el proyecto primario se almacena en Estados Unidos?

Hasta resolver 3 y 4, no presentar como jurídicamente habilitadas las
votaciones sensibles. Si la respuesta a cualquiera de estas cuestiones cambia
un campo modificable de la ficha, deberá actualizarse; nombre y finalidades se
revisan contra lo efectivamente presentado.
