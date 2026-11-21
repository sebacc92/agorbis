# Agorbis · pedidos de salvaguardas para transferencias internacionales

Este documento deja listos tres pedidos contractuales de debida diligencia y
registra un cuarto dossier pendiente para Google Drive. Prepararlos o enviarlos
no equivale a obtener una salvaguarda. **Actualización del 08-09-2026:** Agorbis
ya es público según la evidencia de operación anterior; se retira la premisa
histórica de que nunca se lanzó o recibió usuarios. No se auditó aquí la cantidad
de personas ni la fecha de inicio de cada flujo.

En la arquitectura actual, **Cloudflare Workers recibe el primer request y
ejecuta la aplicación como reverse proxy HTTP global**. La cobertura de ese
flujo debe reconciliarse con su fecha real de inicio: sucede antes de que el
visitante pueda adoptar una decisión afirmativa dentro de Agorbis y no queda
cubierto retroactivamente por el consentimiento del alta. Los pedidos abarcan
flujos existentes y cambios preparados; no habilitan un despliegue ni convierten
las respuestas de los proveedores en una aprobación jurídica automática.

La [revisión de fuentes públicas del 08-09-2026](provider-evidence-review-2026-09-08.md)
identifica qué ya está documentado y qué sigue requiriendo una respuesta de
cuenta. **Estado al 08-09-2026:** el responsable envió una consulta inicial a
Supabase mediante el formulario autenticado y compartió su confirmación y
respuesta general de Privacy Team, caso **SU-467483**. El DPA estándar está
incorporado a los términos sin firma separada; faltan las aclaraciones específicas.
Los pedidos ampliados siguientes permanecen preparados para seguimiento; no hay
constancia de envío de sus anexos. El responsable confirmó después el envío
del seguimiento SU-467483 tras revisar el TIA; faltan sus aclaraciones.
Resend y Cloudflare siguen sin constancia de envío.

No asumir que las SCC europeas, un DPA genérico, la pertenencia a un framework
extranjero o el consentimiento del alta equivalen automáticamente a las
cláusulas argentinas. La guía oficial de la AAIP enumera los mecanismos y el
procedimiento para contratos diferentes:
[Transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).

## Datos comunes

- Responsable: Sebastian Cardoso Castillo.
- Producto: Agorbis (`agorbis.com`).
- Domicilio: [domicilio reservado], Buenos Aires, Argentina.
- Contacto: `sebastiancardoso92@gmail.com`.
- Estado: sitio público; entrega de Google y mejoras preparada pero no
  desplegada. No se afirma ausencia de usuarios ni de transferencias anteriores.
- Titulares: visitantes, usuarios registrados mayores de 18 años, personas
  mencionadas en contenido y administradores/moderadores autorizados.
- Ley indicada en los pedidos: Ley 25.326, Decreto 1558/2001, Disposición
  60-E/2016 y Resolución AAIP 198/2023.
- Instrumento solicitado: cláusulas modelo AAIP/RIPD
  Responsable–Encargado y, cuando el proveedor trate una categoría como
  responsable independiente, análisis e instrumento Responsable–Responsable.

Modelos oficiales:

- [Responsable–Encargado](https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_responsable_y_encargado_ripd_0.pdf)
- [Responsable–Responsable](https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_personales_entre_responsable_y_responsable_ripd.pdf)

## Verificación antes de enviar

Las páginas contractuales cambian. El mismo día del envío se debe abrir,
guardar con fecha y volver a comparar:

| Proveedor    | Fuente oficial revisada al preparar este documento                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase     | [DPA, versión 1 del 1 de agosto de 2026](https://supabase.com/legal/customer-resources/data-processing-addendum) y [subencargados](https://supabase.com/legal/customer-resources/subprocessor-list)                                                                                                                                                           |
| Resend       | [DPA, actualizado el 27 de agosto de 2026](https://resend.com/legal/dpa), [FAQ GDPR](https://resend.com/security/gdpr) y [subencargados, actualizados el 27 de agosto de 2026](https://resend.com/legal/subprocessors)                                                                                                                                        |
| Cloudflare   | [DPA 6.4, efectivo el 3 de abril de 2026](https://www.cloudflare.com/cloudflare-customer-dpa/), [términos de Developer Platform](https://www.cloudflare.com/service-specific-terms-developer-platform/), [subencargados](https://www.cloudflare.com/gdpr/subprocessors/) y [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/) |
| Google Drive | `PENDING_PROVIDER`: producto personal o Workspace, entidad contractual, términos/DPA y lista de subencargados todavía no verificados. No cargar backups antes de fechar y revisar las fuentes oficiales aplicables.                                                                                                                                           |

Si una versión cambia, revisar el mensaje y el anexo antes de enviarlos. No
usar este documento como evidencia de la versión finalmente aceptada.

## Anexos comunes

Preparar un paquete por proveedor, fuera del repositorio público:

1. modelo oficial Responsable–Encargado; agregar Responsable–Responsable sólo
   cuando exista tratamiento propio del proveedor;
2. `Agorbis — Processing and Transfer Annex`, con responsable, titulares,
   finalidades, categorías, datos sensibles, frecuencia, retención, seguridad,
   países confirmados y subencargados aplicables;
3. diagrama mínimo del flujo anterior y posterior al consentimiento;
4. copia fechada del DPA y lista de subencargados vigentes;
5. evidencia no secreta del alcance técnico relevante: región Supabase,
   dominio Resend verificado o configuración de Cloudflare Workers, dominio
   personalizado, DNS autoritativo y Turnstile A/B; y
6. matriz contra el modelo AAIP sólo si el proveedor propone cambios.

El anexo debe explicar expresamente:

- correo, Auth, perfil, residencia declarada, contenido, actividad, archivos y
  metadatos técnicos;
- posts, comentarios, reclamos, apoyos y participación que pueden revelar
  opiniones políticas;
- contenido/reclamos de salud que el usuario puede aportar;
- selección de encuestas y presupuestos procesada transitoriamente y
  transformada en agregados, sin boleta individual persistida; y
- que el tratamiento transitorio no se presenta como anónimo frente al
  responsable o la infraestructura.

Nunca adjuntar API keys, secretos Turnstile, cookies, tokens, usuarios, dumps o
capturas que los expongan. El project ref sólo se incluye en un caso autenticado
si soporte lo necesita; no es necesario en el primer correo.

## Supabase

### Consulta inicial enviada por el responsable

- Fecha de la evidencia: 08-09-2026.
- Canal: formulario autenticado de Supabase Support, proyecto Agorbis.
- Asunto mostrado al completar el formulario:
  `Agorbis — DPA and Argentina international data transfers`.
- Confirmación aportada: `Support request sent`; Supabase indica que el caso
  quedó registrado para Agorbis y responderá al correo de la cuenta que muestra
  el acuse. No se incluye aquí el correo ni el identificador del proyecto.
- Actualización posterior: el responsable copió el acuse y la respuesta de
  Privacy Team del caso **SU-467483**. Estado: `GENERAL_REPLY_RECEIVED`;
  aclaraciones específicas pendientes. El plazo de respuesta indicado en el
  acuse es orientativo, con advertencia de demoras por volumen de consultas.

La respuesta confirma DPA incorporado a los términos desde el 01-08-2026,
sin firma individual, salvo acuerdos negociados diferentes que conservan
prevalencia. Indica TIA y recursos de HIPAA en Organization Settings → Legal
Documents. No responde individualmente los países, TTL ni el instrumento
argentino solicitado. No contratar soporte prioritario ni Enterprise para
reenviar esta consulta. Usar la [respuesta breve preparada](supabase-follow-up-SU-467483.md)
en el mismo hilo; no abrir un caso duplicado ni volver a pedir firma del DPA estándar.

Actualización posterior: el responsable aportó el TIA del 14-03-2025;
[recibido y revisado](supabase-tia-review-2026-09-08.md). La página 4 menciona
EE. UU./Singapur, pero falta confirmar vigencia y alcance actual. La diferencia
entre el importador de ese TIA y el del DPA actual se agregó al seguimiento.
El pedido de descargar el documento queda completado, sin sustituir las
aclaraciones por servicio ni la evaluación del instrumento argentino.

El responsable confirmó luego que respondió al hilo SU-467483. Estado del
seguimiento: **envío confirmado por el responsable; esperando respuesta**.
No se accedió a su correo ni se verificó el cuerpo exacto o los adjuntos
enviados. No hace falta reenviar el mensaje ahora.

El mensaje inicial propuesto en la conversación solicita derivación a
Privacy/Legal, DPA aplicable y evidencia de aceptación, mecanismo argentino,
admisibilidad del contenido cívico sensible, países/subencargados y retención.
La confirmación no reproduce el cuerpo enviado ni demuestra aceptación
contractual. No se da por enviado el pedido ampliado ni sus anexos de abajo.
El envío lo realizó el responsable; el agente no contactó a terceros.

### Pedido ampliado preparado para seguimiento

- Destinatario: `privacy@supabase.io`.
- Canal alternativo: [caso autenticado en Supabase Support](https://supabase.com/dashboard/support/new).
- Asunto: `Argentina AAIP model clauses / Supabase DPA Schedule 2 §4.4 — Agorbis`.

```text
Hello Supabase Privacy Team,

I am Sebastian Cardoso Castillo, the data controller for Agorbis
(agorbis.com), established in Argentina. Agorbis is already publicly
accessible. We are reviewing existing processing and a pending release; we
are not representing that no production users or prior transfers exist.

Our dashboard shows the primary database in East US (Ohio), us-east-2, and
the organization on the Pro Plan. These settings were checked in dashboard
screenshots on September 8, 2026. The dashboard also lists physical daily
backups, while PITR is not enabled. These observations do not establish the
location of all processing, the applicable retention periods, or recoverability.

Agorbis is a civic participation service. Covered Data may include public civic
content, claims and authenticated participation that may reveal political
opinions, as well as user-submitted content concerning health. Individual poll
and participatory-budget choices are processed transiently and immediately
incorporated into aggregate counters; no individual ballot is retained.

Argentina Law 25,326 and the AAIP international-transfer rules require an
appropriate transfer mechanism. Under Schedule 2, section 4.4 of the Supabase
DPA, version 1 dated August 1, 2026, the parties shall promptly enter a
supplementary agreement when another transfer mechanism is approved under the
exporter's law.

Would Supabase Pte. Ltd execute the attached official AAIP/RIPD
Controller-to-Processor model clauses with us?

Official model:
https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_responsable_y_encargado_ripd_0.pdf

Please also confirm:

1. the complete data-importer entity and address, and any Supabase affiliate
   that may receive or access our data;
2. that the described political-opinion and health-related content is
   permitted under our plan and DPA, and any required contractual or product
   controls;
3. the scope of processing covered by the primary region shown in our
   dashboard (us-east-2, Ohio, United States), and every other country from
   which applicable Supabase personnel or subprocessors may process or access
   Covered Data; please distinguish
   Auth, database, Storage, logs, replicas and backups;
4. each applicable subprocessor, its function, country, and data categories;
5. retention and deletion by data category and triggering event, including
   backups and WAL/PITR, after row, object, Auth user, project, or account
   deletion and contract termination; and
6. whether Supabase processes any account, usage, security, support, or
   service-generated data as an independent controller.

If Supabase cannot execute the unmodified model, please provide either a
proposed supplementary agreement/redline with a clause-by-clause comparison,
or a definitive written refusal, so that we can address existing processing,
seek AAIP guidance/approval where applicable, and assess architectural options
before expanding the service. Please distinguish generally listed AI
subprocessors from those that actually receive our project or support data.

Controller: Sebastian Cardoso Castillo
Address: [domicilio reservado], Buenos Aires, Argentina
Contact: sebastiancardoso92@gmail.com
```

### Adjuntos específicos

- modelo Responsable–Encargado;
- anexo y diagrama comunes;
- copia fechada del DPA, especialmente Schedule 2 §4.4 y Schedule 3;
- lista fechada de subencargados; y
- evidencia no secreta de la región vigente y el plan: capturas aportadas por
  el responsable el 08-09-2026, `us-east-2` (Ohio, Estados Unidos) y Pro. Recortar
  otros proyectos y facturación antes de adjuntar; no acredita residencia
  exclusiva ni restaurabilidad. Capturas posteriores muestran copias físicas
  diarias y PITR sin habilitar; tampoco acreditan cobertura de objetos Storage.
  No se adjuntó ni envió evidencia todavía.

### Respuesta necesaria

Un suplemento ejecutado por Supabase Pte. Ltd o un redline/rechazo definitivo;
confirmación vinculante de que el contenido sensible descripto está permitido;
entidades, roles, países, subencargados y retención. Una respuesta genérica que
sólo remita al DPA o a SCC europeas no cierra el requisito argentino.

El DPA vigente reconoce opiniones políticas como `Sensitive Data`, exige al
cliente avisos y consentimientos explícitos, y en Schedule 2 §4.4 contempla un
suplemento con el mecanismo del país exportador. Eso fundamenta el pedido, pero
no prueba que Supabase ya haya aceptado el modelo argentino.

## Resend

Para iniciar la consulta sin preparar adjuntos, usar el
[mensaje breve listo para enviar](resend-privacy-initial-request.md).
El pedido ampliado siguiente se conserva para el seguimiento; no enviar ambos
como casos separados.

- Destinatario: `privacy@resend.com`.
- Canales alternativos: `support@resend.com` y
  [formulario de contacto](https://resend.com/contact).
- Asunto: `Argentina transfer clauses and transactional-email scope — Agorbis`.

```text
Hello Resend Privacy Team,

I am Sebastian Cardoso Castillo, the data controller for Agorbis
(agorbis.com), established in Argentina. Agorbis is already publicly
accessible. We are reviewing existing processing and a pending release; this
is not a representation that there have been no users or prior transfers.

Our documented Resend integration is for authentication and security email.
We do not intend to include civic posts, poll choices or other political
content in email bodies. Recipient addresses, message content, delivery
events, bounces and complaints are nevertheless personal data transferred from
Argentina to the United States.

Would Plus Five Five, Inc. execute the attached official AAIP/RIPD
Controller-to-Processor model clauses for this transfer? We understand that
section 6.6.4 of the DPA sits within EEA/UK supplementary measures; we are
asking whether a separate Argentine instrument is available, not assuming that
section already incorporates the Argentine model.

Official model:
https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_responsable_y_encargado_ripd_0.pdf

Please confirm:

1. the complete importer entity and address;
2. all applicable processing/subprocessor countries and data categories;
3. how the published 30-day email/log, 7-day backup and 90-day post-termination
   periods apply to our actual plan and categories, including addresses,
   bodies, events, suppression lists, complaints, support and backups; please
   distinguish deletion of an Agorbis user from closure of our Resend account;
4. which Account or Usage Data Resend processes as an independent controller;
5. that the described transactional authentication/security use is permitted
   under Exhibit A's sensitive-data scope: although email bodies omit civic
   publications and choices, association with a civic platform can itself
   convey context; please identify any required restriction or amendment; and
6. whether this request requires an Enterprise plan and, if so, the exact
   commercial path or quote required.

If Resend cannot execute the unmodified model, please provide a proposed
redline and clause comparison, or a definitive written refusal, so we can
address existing processing and seek AAIP guidance/approval where applicable.

Controller: Sebastian Cardoso Castillo
Address: [domicilio reservado], Buenos Aires, Argentina
Contact: sebastiancardoso92@gmail.com
```

### Adjuntos específicos

- modelo Responsable–Encargado;
- anexo y diagrama comunes, limitado al correo transaccional;
- copia descargada del DPA desde Documents y su versión pública;
- lista de subencargados vigente; y
- evidencia de dominio verificado sin mostrar la API key.

### Respuesta necesaria

Suplemento ejecutado, redline o rechazo definitivo; países, subencargados,
retención, rol propio para Account/Usage Data y confirmación de plan/costo. La
[FAQ oficial de Resend](https://resend.com/security/gdpr) indica que los cambios
al DPA u otros documentos requieren Enterprise. El §6.6.4 justifica consultar
por cláusulas separadas, pero pertenece al apartado EEE/Reino Unido y no se
debe afirmar que ya obliga a Resend a firmar el modelo argentino. La versión
vigente del DPA declara datos sensibles no aplicables en Exhibit A: el pedido
requiere resolver el contexto cívico real sin afirmar que toda autenticación
revela una opinión política concreta.

## Cloudflare

Para iniciar la consulta sin preparar adjuntos, usar el
[mensaje breve listo para enviar](cloudflare-privacy-initial-request.md).
El pedido ampliado siguiente se conserva para el seguimiento; no enviar ambos
como casos separados.

- Destinatario principal: `legal@cloudflare.com`, contacto contractual del DPA.
- Copia por Turnstile: `dpo@cloudflare.com`.
- Canales alternativos: `privacyquestions@cloudflare.com` o caso autenticado
  desde Dashboard, si el plan permite crearlo. La guía de canales está en
  [Cloudflare Support](https://developers.cloudflare.com/support/contacting-cloudflare-support/).
- Asunto: `Argentina model clauses request — Workers Edge Compute, authoritative DNS and Turnstile — Agorbis`.

```text
Hello Cloudflare Legal and Privacy Teams,

I am Sebastian Cardoso Castillo, the data controller for Agorbis
(agorbis.com), established in Argentina. Agorbis is already publicly
accessible. We are reviewing existing processing and a pending release, not
representing that no users or transfers have existed.

Our documented Cloudflare architecture covers the following services; please
confirm their actual contractual/configuration scope for our account:

1. authoritative DNS for agorbis.com;
2. hosting and executing the Agorbis application with Cloudflare Workers Edge
   Compute as the global HTTP reverse proxy for agorbis.com. Workers receives
   requests and responses that may include IP addresses, URLs, headers, session
   cookies, form bodies, files, civic content and operational logs;
3. Turnstile widget A, shown on selected public authentication forms; and
4. Turnstile widget B, configured only as a guard for direct public Supabase
   Auth calls and not loaded or displayed by Agorbis during an ordinary visit.

User-submitted posts, comments, debates, claims, reports and supporting files
may reveal political opinions, health information or other sensitive/special-
category information. We do not intend this description to imply that every
request contains such data.

Would Cloudflare, Inc. execute the attached AAIP/RIPD
Controller-to-Processor model clauses for processing performed on our behalf?

Official model:
https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_responsable_y_encargado_ripd_0.pdf

Please confirm separately for Workers, authoritative DNS and Turnstile:

1. Cloudflare's processor/controller role for each data category and purpose;
2. every applicable processing/storage country and subprocessor country;
3. the exact retention and deletion periods for Workers requests, invocations,
   application or platform logs, cache data, uploaded/request content and
   backups, including after account termination;
4. how DPA Annex 1's special categories and Developer Platform section 8's
   restriction on disclosure of sensitive personal information apply to the
   described civic content, including political opinions and health-related
   material, under our actual plan, and any required controls or amendment;
5. which Workers, network, security, account or service-generated data
   Cloudflare processes for its own purposes;
6. DNS query, account and configuration data processed and its exact
   retention/deletion;
7. Turnstile Signals processed, including IP address, TLS fingerprint,
   User-Agent, sitekey and origin, and their exact retention/deletion;
8. that Turnstile does not access or transmit form fields, user communications
   or civic content;
9. whether any caching or additional security processing is enabled by default
   for the Workers custom-domain route, and what account settings alter it; and
10. whether Cloudflare will execute the attached Controller-to-Controller model
    for Signals, network, security, account or service-generated data processed
    for Cloudflare's own purposes, or provide another appropriate instrument.

Please distinguish Workers Logs retention from other network, security, DNS
and Turnstile records. If regionalization is proposed, specify its coverage and
exceptions for HTTP execution, outgoing subrequests, cron, code/secrets and
metadata, together with any plan change required; we are not requesting that
you activate or purchase a service through this inquiry.

If Cloudflare cannot execute either unmodified model, please provide the
proposed redline and clause comparison, or a definitive written refusal.

Controller: Sebastian Cardoso Castillo
Address: [domicilio reservado], Buenos Aires, Argentina
Contact: sebastiancardoso92@gmail.com
```

### Adjuntos específicos

- modelos Responsable–Encargado y Responsable–Responsable;
- anexo con tres flujos separados: Workers Edge Compute, DNS autoritativo y
  Turnstile A/B;
- copia fechada del DPA y del Turnstile Privacy Addendum;
- lista de subencargados; y
- evidencia no secreta de la configuración Workers/dominio personalizado, DNS
  autoritativo y los dos widgets, sin incluir secrets.

### Respuesta necesaria

Instrumentos o redlines para los roles de encargado y responsable; alcance
separado de Workers, DNS y Turnstile; países, subencargados y retenciones;
confirmación vinculante sobre contenido sensible bajo el plan aplicable y sobre
qué datos recibe Turnstile.

El [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/)
publica que Cloudflare procesa IP, TLS fingerprint, User-Agent, sitekey y origen;
actúa como encargado para proteger el sitio y como responsable al mejorar su
detección. Su [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
identifica a Cloudflare, Inc. en Estados Unidos como importador y contempla
contenido con categorías especiales, incluidas opiniones políticas. El DPA,
las SCC europeas o cualquier framework extranjero no son, por sí solos, un
mecanismo argentino. Las publicaciones sustentan las preguntas, pero no
confirman el instrumento argentino, todos los países/retenciones exactos de la
cuenta ni qué servicios y subencargados resultan aplicables a Agorbis.

## Google Drive — backup cifrado planificado

Estado: destino elegido y carpeta informada por el operador; no se instaló ni
configuró un cliente, no se inició OAuth, no se transfirió ningún archivo y no
existe una copia remota verificada. El dossier no debe marcarse enviado ni
aprobado hasta resolver:

1. producto aplicable —cuenta personal o Workspace—, entidad contractual y rol
   responsable/encargado;
2. términos o DPA, países de tratamiento y acceso, y subencargados aplicables;
3. metadata de cuenta, acceso y seguridad que el proveedor trata además del
   ciphertext;
4. retención, versionado, papelera, logs, borrado de archivos y eliminación de
   cuenta; y
5. mecanismo de transferencia internacional aplicable bajo el criterio de la
   AAIP.

La transferencia técnica futura se limita al paquete cifrado y su checksum
SHA-256 saneado. El manifiesto detallado queda dentro del ciphertext y la
credencial de descifrado permanece fuera de Google Drive. El cifrado reduce la
exposición del contenido, pero no reemplaza el análisis contractual ni el de la
metadata que el proveedor pueda tratar.

## Fallback si un proveedor modifica o rechaza los modelos

La [página vigente de la AAIP](https://www.argentina.gob.ar/transferencias-internacionales)
indica que, para un contrato que difiere de los modelos aprobados, se debe pedir
aprobación dentro de los treinta días corridos desde su firma, enviando el
contrato propuesto y el detalle de diferencias. No ocultar ni retrotraer la
fecha de un DPA clickwrap previo.

- Destinatario: `datospersonales@aaip.gob.ar`.
- Alternativo postal: Dirección Nacional de Protección de Datos Personales,
  Av. Julio A. Roca 710, 2.º piso, Ciudad Autónoma de Buenos Aires.
- Asunto: `Solicitud de aprobación/instrucciones sobre contrato de transferencia internacional — Agorbis / [PROVEEDOR]`.

```text
Hola:

Soy Sebastian Cardoso Castillo, responsable de Agorbis (agorbis.com), con
domicilio en [domicilio reservado], Buenos Aires.

Agorbis ya está disponible públicamente. Esta presentación abarca los flujos
existentes y una entrega pendiente; no afirmo ausencia de usuarios o
transferencias anteriores. El proveedor [PROVEEDOR], establecido en [PAÍS],
[ofreció el contrato adjunto con modificaciones / rechazó suscribir un
suplemento y sólo ofrece el DPA clickwrap adjunto].

Solicito instrucciones y, si corresponde, la aprobación prevista para
contratos de transferencia internacional que difieren de las Cláusulas
Contractuales Modelo aprobadas por la AAIP.

El contrato fue [firmado/aceptado] el [FECHA REAL]. No se oculta ni se
retrodata una aceptación previa. Si el plazo de treinta días ya hubiera
comenzado con esa aceptación clickwrap, solicito indicación expresa sobre el
procedimiento aplicable para la situación actual y las medidas que corresponda
adoptar respecto de los flujos ya iniciados. Adjuntaré la cronología real que
pueda acreditar, sin reemplazarla por una fecha estimada.

Adjunto:

1. contrato/DPA completo y evidencia de su versión y fecha de aceptación;
2. respuesta, redline o rechazo escrito del proveedor;
3. modelo AAIP/RIPD aplicable;
4. matriz cláusula por cláusula de todas las diferencias;
5. anexo de finalidades, titulares, categorías de datos —incluidas opiniones
   políticas cuando corresponda—, destinatarios, países, subencargados,
   transferencias ulteriores, seguridad, retención y eliminación;
6. diagrama del flujo técnico y explicación de los tratamientos que ocurren
   antes de cualquier consentimiento del usuario; y
7. cronología acreditable de aceptación contractual, publicación y flujos
   iniciados, con los puntos todavía no verificados identificados.

Solicito específicamente:

a. confirmar si el instrumento presentado puede ser aprobado;
b. indicar cualquier corrección o compromiso adicional exigible al importador;
c. informar el canal para obtener una decisión administrativa documentada y
   su número de expediente; y
d. indicar las medidas aplicables a los flujos ya iniciados y si debemos
   suspender alguno o abstenernos de ampliar el tratamiento hasta esa decisión.

No se adjuntan credenciales, secretos, datos de usuarios ni exportaciones.

Sebastian Cardoso Castillo
sebastiancardoso92@gmail.com
```

### Tratamiento de cada respuesta

1. **Modelo firmado sin cambios:** conservar instrumento y anexos; verificar
   que entidad, flujo, países y datos coincidan antes de habilitar el preflight.
2. **Redline o DPA alternativo firmado/propuesto:** presentar contrato y matriz
   con las fechas reales; pedir instrucciones sobre flujos existentes y obtener
   la aprobación documentada que corresponda antes de tratarlo como cobertura.
3. **Rechazo a cualquier suplemento:** preguntar expresamente si el DPA
   clickwrap puede someterse a aprobación. No presentarlo como equivalente al
   modelo mientras AAIP no lo confirme.
4. **AAIP no aprueba o exige obligaciones que el proveedor no acepta:** cambiar
   proveedor o arquitectura. No convertir el consentimiento en un permiso
   retroactivo para el primer request, DNS, Turnstile, recuperación o seguridad.

Una aprobación de transferencia no remedia una prohibición independiente del
contrato del proveedor. La revisión contractual de cada servicio y plan sigue
siendo necesaria cuando puede recibir datos sensibles.

## Evidencia que habilita el preflight

Para cada mecanismo que se invoque en el texto público, incluida la cobertura
del primer request que ya recibe Cloudflare, conservar fuera del repositorio
público:

1. instrumento y anexos ejecutados, o resolución/respuesta AAIP que permita el
   contrato alternativo;
2. identidad y domicilio de exportador e importador;
3. versión, fecha efectiva, fecha de firma/aceptación y alcance de la cuenta;
4. lista fechada de subencargados y países realmente aplicables;
5. finalidades, titulares, categorías —incluidas las sensibles—, retención y
   medidas de seguridad;
6. clasificación por categoría entre encargado y responsable independiente;
7. respuesta específica sobre cualquier restricción contractual;
8. persona que revisó la evidencia y fecha de revisión; y
9. texto público ES/EN coherente con la evidencia.

No alcanza una respuesta comercial no vinculante, una URL sin versión, un
“somos GDPR compliant”, SCC europeas solas o una lista mundial de ubicaciones
que no identifique cuáles se aplican a Agorbis.

Recién cuando exista evidencia del mecanismo realmente aplicable al primer
request y a los demás flujos sin una decisión previa vigente y acreditable,
completar `PUBLIC_TRANSFER_SAFEGUARDS` y
`PUBLIC_TRANSFER_SAFEGUARDS_EN`. No afirmar que los tres proveedores firmaron
cláusulas si no ocurrió: los textos pueden distinguir el instrumento previo del
consentimiento expreso que cubre transferencias posteriores. Si cambia un
proveedor, entidad, destino, subencargado, finalidad, dato sensible o
instrumento, volver a revisar el aviso versionado y el preflight.
