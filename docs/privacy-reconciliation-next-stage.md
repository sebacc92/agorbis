# Agorbis · siguiente etapa de conciliación de privacidad

Preparación del 8 de septiembre de 2026 sobre el candidato `93af13b`, con una
actualización posterior sobre el mecanismo Google local de la migración 0066.

**Estado: decisiones y trabajo técnico preparados para revisión.** Este
documento no aprueba una política, no interpreta por cuenta del responsable la
declaración TAD y no activa el borrador 0059. La preparación documental no cambió
plazos ni datos. La actualización técnica 0066 descrita más abajo prepara el
mecanismo de decisión Google, sin publicar un aviso aprobado ni elegir su
retención. La revisión comprende código y fuentes oficiales; no una inspección
de la base productiva o de la cuenta TAD.

El sitio ya estaba accesible según la última observación documentada. Este
trabajo prepara la conciliación y la próxima entrega; no presenta una apertura
inicial ficticia ni ordena cerrar el sitio. Google y participación sensible son
decisiones diferentes. Facebook sigue fuera del lanzamiento de Google.

## 1. Qué sabemos del expediente y qué debe revisar el responsable

La captura aportada el 08-09-2026 muestra **«Iniciación»** para el expediente
`EX-2026-82087278- -APN-DNPDP#AAIP`. El identificador `EX` y esa etiqueta no son
la constancia de inscripción de la base. En capturas posteriores, la bandeja
general de Tareas pendientes muestra «No tenés tareas vinculadas» y la lista de
Notificaciones muestra una notificación AAIP del 24-08-2026 correspondiente al
Paso 1. No aparece una notificación del Paso 2. Esta comprobación se limita a la
sesión y vistas mostradas; no comprende correo, Documentos Externos ni todo el
contenido del expediente. No acredita aprobación de la base.

En su cuenta TAD, el responsable debe:

1. Localizar el expediente en **Mis Trámites** y revisar su detalle. Descargar
   el acuse y la declaración efectivamente presentada; conservarlos fuera del
   repositorio, con fecha, sin compartir credenciales fiscales.
2. Las bandejas generales de **Tareas pendientes** y **Notificaciones** ya fueron
   mostradas, con el resultado anterior. Revisar el detalle del expediente y el
   correo declarado; si aparece un requerimiento, conservar su texto y responder
   por el canal indicado. No afirmar que se descargó o leyó un documento por ver
   únicamente su fila en la lista.
3. Copiar literalmente el campo de conservación y su contexto: selección,
   cantidad/unidad, evento de inicio o finalización y cualquier aclaración.
   Verificar también destino, proveedores y transferencias declaradas.
4. Si necesita aclarar o rectificar lo presentado, consultar el procedimiento
   aplicable a un expediente pendiente antes de crear un trámite duplicado.

El manual TAD describe **Presentación a Agregar** para ciertos trámites en
curso; no todos la admiten. Permite incorporar información al expediente, pero
su disponibilidad no demuestra que una declaración haya sido rectificada o
aceptada. La consulta del expediente también puede generar una constancia de
consulta; el responsable debe realizarla desde su sesión.
[Manual TAD, apartados 2.8.1, 2.8.2 y 2.9](https://www.argentina.gob.ar/sites/default/files/manual_de_usuarios_tad_12.3.21.pdf).

La guía AAIP indica que, después de aprobar el trámite, se envía la constancia
con el número asignado. Hasta recibirla y contrastarla, se mantiene la
distinción entre registro del responsable y registro de la base; no se
completa el ID pendiente con `EX`, `RL` ni un placeholder.
[Inscripción de bases privadas](https://www.argentina.gob.ar/registrar-bases-de-datos-personales-privadas).

## 2. Qué significa la brecha «Determinable · 1 año»

El operador informó ese valor. Todavía falta contrastar la declaración completa
antes de decidir si describe una categoría, un máximo general o un plazo ligado
a un hecho concreto. No se lo convierte automáticamente en 365 días, un año
calendario, tiempo desde la última visita o tiempo posterior a la baja.

El PDF aportado posteriormente, `RE-2026-82059727-APN-DNPDP#AAIP`, fue revisado:
sólo contiene la identificación del responsable por su código RL. Tiene una
página, sin adjuntos embebidos, y no incluye conservación ni otros datos de la
base. No verifica ni contradice el año informado. La recuperación de la ficha
completa sigue pendiente; el original no se incorpora al repositorio.

El instructivo AAIP pide una duración o un hecho que permita determinar su
finalización; además, distingue los campos modificables de nombre y finalidad,
que no admite modificar por ese recorrido. No explica por sí solo cómo corregir
este expediente pendiente. Esa gestión debe confirmarse con AAIP.
[Instructivo AAIP, páginas 11, 20 y 21](https://www.argentina.gob.ar/sites/default/files/instructivo_tad_inscripcionymodificacion_basesprivadas_2.pdf).

La obligación de eliminar datos cuando dejan de ser necesarios o pertinentes
no equivale a un plazo universal de un año. El texto de la declaración, las
finalidades, la normativa aplicable y el tratamiento real deben conciliarse;
una preferencia de producto o una fila del catálogo SQL no resuelve esa
interpretación. [Ley 25.326, artículo 4](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion).

## 3. Retención implementada que debe conciliarse

Esta tabla describe las condiciones que aparecen en SQL y rutas del candidato,
no prueba que cada cron se haya ejecutado en producción. El catálogo
`data_retention_policies` documenta plazos, pero las funciones de purga tienen
condiciones propias: cambiar sólo el catálogo no cambia todos los borrados.

| Categoría                                                   | Comportamiento implementado                                                                                                                                                | Brecha o límite relevante                                                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telemetría `activation_events`                              | Purga desde `created_at` anterior a 90 días.                                                                                                                               | No es un plazo de todas las tablas ni de logs administrados.                                                                                                                                                   |
| Ventanas antiabuso y cooldowns                              | Ventanas desde `window_started_at` anterior a 7 días; cooldowns desde `next_allowed_at` anterior a 1 día.                                                                  | Son dos eventos distintos, no edad desde creación para ambos.                                                                                                                                                  |
| Auditoría de moderación                                     | Purga desde `created_at` anterior a 2555 días.                                                                                                                             | Ese valor técnico se describe como siete años; no prueba que exista una obligación jurídica de conservarlo.                                                                                                    |
| Apelaciones y suspensiones                                  | Apelaciones terminales desde `updated_at` anterior a 2555 días. Suspensiones desde levantamiento o vencimiento anterior a 2555 días y sin apelaciones que las referencien. | No se purgan por esa regla los casos abiertos; las dependencias pueden prolongar la conservación.                                                                                                              |
| Aceptaciones legales generales                              | Se borran si `accepted_at` supera 1825 días, la versión ya no es vigente y hay una aceptación posterior del mismo documento y usuario.                                     | El reloj implementado es la fecha de aceptación, no automáticamente cinco años desde sustitución. La evidencia vigente no tiene ese vencimiento.                                                               |
| Consentimientos de transferencia                            | Se borran los del aviso sustituido cuando `superseded_at` supera 1825 días. Los vigentes permanecen y las filas personales se eliminan con la cuenta.                      | Aquí el reloj sí es sustitución del aviso; no confundirlo con aceptaciones generales.                                                                                                                          |
| Altas por correo no confirmadas                             | Ventana de 30 días, con condiciones que excluyen confirmación, ingresos, identidad externa y actividad real, entre otras.                                                  | No autoriza eliminar cuentas activas a los 30 días.                                                                                                                                                            |
| Altas OAuth abandonadas                                     | Creación e ingreso más reciente anteriores a 30 días, sin aceptación, identidad de correo, MFA ni actividad real, según la RPC.                                            | Una cuenta con correo enlazado no se trata como un OAuth abandonado.                                                                                                                                           |
| Recibos de encuesta/presupuesto                             | Vinculan cuenta y proceso sin elección. El catálogo usa `36500` días para expresar vida de la cuenta; se eliminan por cascada con ella.                                    | No hay un vencimiento anual; ese número no acredita un cron que borre recibos al cumplir 100 años.                                                                                                             |
| Tallies privados agregados                                  | Sin boleta individual, se conservan con el proceso padre. El catálogo también usa `36500`.                                                                                 | Conservar controles de inferencia y publicación; no asignarles un TTL personal sólo por ese número.                                                                                                            |
| Perfil, relaciones y preferencias                           | Perfil y varias relaciones desaparecen con la cuenta; `notification_preferences` del candidato tiene cascada al perfil.                                                    | Una cuenta activa y sus vínculos no tienen un vencimiento general anual.                                                                                                                                       |
| Publicaciones, comentarios, evidencias y relaciones cívicas | La baja desvincula ciertos autores y elimina otras relaciones; publicaciones pueden sobrevivir. Algunas retiradas sólo cambian estado.                                     | No hay eliminación física integral por antigüedad; texto, imágenes y URLs pueden seguir identificando a personas. Comentarios retirados carecen del reloj `removed_at` propuesto.                              |
| Uploads no publicados                                       | La ruta de limpieza selecciona reclamos provisionales con una ventana de 24 horas y verifica el borrado por API de Storage.                                                | No es el plazo de evidencia ya publicada. Avatares y objetos abandonados tienen recorridos propios de limpieza.                                                                                                |
| Outbox de baja                                              | Los jobs completados se purgan 30 días después de `completed_at`; los pendientes o fallidos no se descartan por esa regla.                                                 | Un backlog fallido exige reparación; no borrar el job para ocultar archivos pendientes.                                                                                                                        |
| Notificaciones, reportes y solicitudes                      | Varias categorías terminales no tienen purga física integral. Los filtros y preferencias nuevos no borran el historial existente.                                          | Hace falta definir evento, duración y acción por categoría.                                                                                                                                                    |
| Solicitudes manuales de borrado, nueva 0063                 | Al cerrar se retiran contacto, referencia de correo y nota de verificación. Se conserva registro mínimo con fechas, resultado y operadores. Código de consulta: 30 días.   | Vencer el código no borra el caso ni define su retención. La tabla mínima no tiene purga temporal propia.                                                                                                      |
| Reservas de alias, nueva 0065                               | Queda SHA-256 del alias; al borrar cuenta se elimina su vínculo al perfil.                                                                                                 | No tiene vencimiento. El hash puede contrastarse con nombres conocidos: se debe evaluar su conservación y no llamarlo anonimización irreversible. Liberarlo puede reasignar enlaces históricos a otra persona. |
| Borradores locales                                          | Se limpian tras publicación confirmada o descarte; están separados por cuenta.                                                                                             | No tienen timestamp de expiración. No copiar borradores al servidor para inventariarlos.                                                                                                                       |
| Backups, cachés y proveedores                               | Hay una rotación propuesta/operativa documentada y ventanas de caché; los proveedores conservan datos administrados bajo condiciones propias.                              | Un borrado de origen no acredita borrado de todas las copias. Se requiere evidencia y un restore que no reintroduzca bajas.                                                                                    |

Fuentes técnicas: `0039_production_hardening.sql`,
`0041_private_claim_evidence.sql`, `0044_account_deletion_saga.sql`,
`0045_final_security_closure.sql`, `0047_private_poll_ballots.sql`,
`0050_abandoned_oauth_retention.sql`,
`0056_versioned_international_transfer_consent.sql`,
`0063_data_deletion_requests.sql`, `0064_notification_preferences.sql` y
`0065_public_profile_handles.sql`, en `supabase/migrations/`; rutas
`src/routes/internal/purge-retained-data/`, `cleanup-claim-uploads/` y
`process-account-deletions/`; `src/components/forms/useDraft.ts`.

### Actualización: retención del mecanismo Google 0066

La preparación posterior `0066_google_auth_consent.sql` incorpora
`public.user_google_auth_consent_events` y
`private.google_auth_consent_barriers`. Ambas filas personales se eliminan por
cascada al borrar el perfil. **No tienen un TTL temporal elegido o implementado**
para una cuenta que continúa existiendo. No heredan automáticamente los 1825
días de los consentimientos generales de transferencia.

Los eventos registran la decisión propia con versión/hash cuando existe aviso,
idioma y fecha, sin tokens del proveedor. La barrera conserva
`last_withdrawn_at`: un retiro repetido puede actualizarla sin duplicar el evento.
Ese dato propio se incluye en el estado exportado, además del historial de
decisiones. Se debe decidir finalidad, evento de cómputo, duración y acción
terminal para ambas categorías antes de aprobar su política de conservación.

La ausencia de aviso aprobado mantiene cerrado el inicio Google en la app; la
consulta y el retiro desde una sesión autenticada permanecen disponibles. El
protocolo local y sus pruebas no resuelven la declaración AAIP, los plazos
pendientes, la retención de proveedores ni el consentimiento de participación
sensible. No prueban aplicación de 0066 en producción.

El detalle ampliado está en [RETENTION_POLICY.md](RETENTION_POLICY.md), que
sigue siendo borrador. La IA debe permanecer deshabilitada según el preflight;
su retención y la del proveedor se resuelven antes de ofrecerla. Google OAuth
es distinto y requiere evidencia propia, sin inventar plazos de Google a partir
de la descripción de su infraestructura global.

## 4. Dos alternativas concretas, ninguna seleccionada

| Alternativa                                                  | Qué requiere decidir                                                                                                                                                                 | Implementación que se puede preparar después                                                                                                                                                               | Impacto que debe aprobar el responsable                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Política acotada por el año declarado                     | Confirmar alcance del año, cómo se computa y evento inicial de cada categoría; resolver cualquier conservación mayor.                                                                | Política versionada por categoría; vencimiento y acción terminal; cola idempotente de borrado/redacción; Storage por API; invalidación de derivados/copias; tratamiento de históricos y pruebas de fechas. | Cuentas inactivas o contenido antiguo podrían dejar de estar disponibles. La actividad de cuenta no debe renovar todo su contenido por inferencia. No basta poner UUID en NULL. |
| B. Plazos y eventos diferenciados, con declaración coherente | Verificar que es procedente y gestionar la aclaración/rectificación por el canal que indique AAIP. Justificar cada duración; no adoptar automáticamente todos los valores heredados. | Tabla aprobada por categoría y evento; purgas para huecos actuales; minimización al cierre; evidencia de ejecución y recuperación; avisos públicos y declaración consistentes.                             | Puede conservar categorías necesarias más de un año si corresponde, pero requiere resolver expresamente su base y alcance; no se obtiene cambiando sólo el texto público.       |

La [propuesta de un año](RETENTION_ANONYMIZATION_ONE_YEAR_PROPOSAL.md) desarrolla
una posible variante estricta de A y sigue sin aprobarse. Sus ejemplos de
`interval '1 year'`, última actividad o plazos para notificaciones no son
parámetros activos ni elecciones realizadas por el operador.

Para cualquiera de las dos, la ficha de decisión preparada es:

- categoría, finalidad y campos identificables;
- evento verificable que inicia el plazo y duración/unidad aprobada;
- renovación permitida, si corresponde, sin extensión implícita de otros datos;
- acción terminal, dependencias y tratamiento de texto/imágenes de terceros;
- transición para filas antiguas que carecen del timestamp necesario;
- destino de copias, derivados, logs y metadata administrada;
- revisión/aprobación identificada, versión y fecha;
- criterio verificable de cumplimiento y tratamiento de fallos.

La preservación de resultados exige diseño: borrar un recibo de participación
mientras una encuesta aún admite votos puede permitir una segunda emisión.
Debe acordarse un cierre de proceso compatible o un mecanismo revisado que
mantenga la emisión única sin incumplir el plazo aprobado. Tampoco se cierran
apelaciones como resueltas ni se inventan timestamps históricos para satisfacer
un TTL. Esas decisiones deben formar parte de la transición antes de migrar.

## 5. Participación sensible: lo que 0059 permite preparar

`supabase/migration-drafts/0059_versioned_sensitive_participation_consent.sql`
es un **borrador histórico**, fuera del ledger. Crea snapshots y decisiones
autenticadas por usuario, versión, hash, ámbito y fecha, con retiro y sin
aceptaciones retroactivas. No publica el texto del aviso. Si se aplicara con
sus precondiciones satisfechas, cerraría la participación hasta incorporar una
versión vigente y sus aceptaciones.

Además, su guard espera avisos `2026-08-25.1`; el baseline actual activó
`2026-08-29.1` mediante 0060. No es compatible por simple copia al directorio
ejecutable. Su ensayo existente usa una base efímera del baseline 0058 y no
certifica la entrega actual. No se ejecutó ese ensayo en esta revisión.

La preparación técnica debe separar estas piezas:

1. **Inventario de acciones y datos.** Publicaciones/comentarios, apoyos y
   compromisos, evidencia de reclamos, emisión de encuestas/presupuesto,
   visibilidad de membresía, reportes y solicitudes. El borrador comparte un
   gate amplio: revisar cada acción antes de decidir qué debe bloquearse.
2. **Aviso comprensible y decisión acreditable.** Explicar qué se procesa,
   qué es público y qué se agrega; retiro y consecuencias. La evidencia no
   incluye la elección de voto ni acepta por correo no verificado.
3. **Recorridos que deben seguir utilizables.** Lectura, correo, recuperación,
   seguridad, exportación y baja. Revisar específicamente reportes de seguridad
   y ejercicio de derechos para no exigir participar cívicamente como condición
   para pedir protección.
4. **Adaptación futura al esquema real.** Snapshot aprobado, SQL aditivo,
   RPC/trigger/RLS, UI bilingüe, tipos e inventarios de release y recuperación.
   Mantener el histórico 0059 fuera de ejecución; no asignar ahora un número
   de migración final ni suponer que las cuatro 0062–0065 bastarán.
5. **Matriz local preparada.** Rechazo sin decisión, versión/hash manipulados,
   consentimiento ajeno, versión sustituida, retiro/reaceptación, concurrencia
   y acceso directo SQL/PostgREST; comprobar a la vez emisión única, voto
   privado y continuidad de los recorridos de derechos. Ensayarla sólo sobre
   una adaptación revisada y un entorno local acordado.

El consentimiento no resuelve automáticamente toda licitud de datos sensibles:
el artículo 7 tiene restricciones específicas. Debe validarse la aplicación al
tratamiento cívico de Agorbis, incluido procesamiento transitorio; conservar
tallies no permite afirmar que nunca se trataron datos sensibles. Esta etapa
prepara controles y preguntas, no declara que una casilla autorice cualquier
tratamiento. [Ley 25.326, artículos 2, 5 a 7](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion).

## 6. Consulta AAIP: pedido de ficha enviado, conciliación preparada

### Pedido previo de la ficha completa

Actualización del 08-09-2026: el responsable confirmó que envió este pedido y
está esperando respuesta. Se registra su confirmación, sin acceder al correo
ni verificar el cuerpo exacto o los adjuntos. El texto siguiente se conserva
como referencia; no reenviarlo ni abrir otro expediente ahora. La consulta de
conciliación más amplia continúa preparada, sin constancia de envío.

Tras revisar el PDF de identificación y las dos páginas del listado visible,
queda preparado este pedido breve para el responsable. No supone que la ficha
no se haya presentado ni inicia una rectificación:

Destinatario: `registrobasesdedatos@aaip.gob.ar`. Asunto: **Solicitud de copia de
la ficha de base privada · expediente EX-2026-82087278- -APN-DNPDP#AAIP**.

> Buenos días. En TAD mi expediente de inscripción de base privada
> EX-2026-82087278- -APN-DNPDP#AAIP figura en estado «Iniciación». En el listado
> visible encontré identificación del responsable, carátulas, pase y constancias
> de consulta. El PDF de identificación sólo contiene el código RL.
>
> ¿Podrían indicarme cómo obtener una copia de la ficha completa de la base que
> quedó presentada, incluyendo finalidades, conservación y transferencias?
> También agradecería que confirmen si debo completar alguna actuación para
> continuar la inscripción. Las bandejas mostradas de TAD no presentan tareas
> vinculadas ni una notificación del Paso 2.
>
> Muchas gracias.

El contacto se verifica en el
[instructivo oficial AAIP, página 21](https://www.argentina.gob.ar/sites/default/files/instructivo_tad_inscripcionymodificacion_basesprivadas_2.pdf#page=21).
La consulta más amplia que sigue se revisará con esa ficha; no se adjuntan por
defecto datos fiscales, credenciales ni documentación ajena al expediente.

### Consulta de conciliación de conservación

Destinatario: `registrobasesdedatos@aaip.gob.ar`, publicado en el instructivo
oficial. Asunto: **Agorbis · expediente EX-2026-82087278- -APN-DNPDP#AAIP ·
aclaración de conservación y procedimiento de actualización**.

El responsable debe verificar el adjunto y los datos del expediente antes de
enviar. La consulta no adjunta credenciales, dumps, usuarios, votos ni capturas
que contengan datos fiscales innecesarios. Se puede usar este texto:

> Buenos días:
>
> Soy Sebastian Cardoso Castillo, responsable de Agorbis. Consulto por el
> expediente EX-2026-82087278- -APN-DNPDP#AAIP de inscripción de base privada.
> La captura de mi cuenta TAD del 8 de septiembre de 2026 muestra el estado
> «Iniciación». No cuento con una constancia de aprobación de la base.
>
> Necesito conciliar el campo de conservación que informé como «Determinable ·
> 1 año» con la declaración presentada y las distintas categorías tratadas.
> El sistema implementa ventanas operativas breves, datos asociados a la vida
> de la cuenta, algunas publicaciones que pueden permanecer sin vínculo al
> perfil y conservación de evidencia legal/moderación con plazos mayores.
> No afirmo que la implementación actual aplique un máximo general de un año.
>
> ¿Qué canal corresponde para aclarar o rectificar conservación y otros campos
> modificables mientras este expediente sigue pendiente: presentación en el
> expediente, subsanación solicitada por el organismo u otro trámite?
>
> ¿Cómo debemos expresar en la ficha los distintos eventos de inicio y fin
> por categoría, y documentar qué alcance tiene el valor ya declarado? Antes
> de presentar una modificación, queremos evitar atribuirle un significado
> distinto del que surge del formulario original.
>
> También necesitamos actualizar la descripción del hosting y los
> destinatarios para reflejar Cloudflare Workers y revisar los datos sensibles
> que podrían aparecer en participación cívica. Las elecciones de encuesta y
> presupuesto se procesan transitoriamente y se incorporan a agregados; no se
> conserva una boleta individual. Textos y otros vínculos sí pueden revelar
> información personal. ¿Cuál es el área o canal indicado para consultar el
> encuadre de estos tratamientos, sin asumir que un consentimiento específico
> basta para resolverlo?
>
> La web ya es accesible al público. Estamos preparando una actualización y
> queremos que declaración, información a las personas e implementación sean
> coherentes. Agradezco que indiquen si existe algún requerimiento sobre este
> expediente que deba atender o documentación adicional que deba aportar por
> el canal correspondiente.
>
> Muchas gracias.
> Sebastian Cardoso Castillo

Antes de enviar, adjuntar únicamente el formulario y acuse pertinentes,
revisados por el responsable, si el canal permite esa documentación. El correo
consulta el procedimiento: no se marca la declaración como rectificada por
haberlo enviado. Las capturas permiten describir las bandejas generales revisadas,
pero no afirmar lectura de sus documentos descargables ni del correo declarado.

## 7. Entrega preparada y siguiente decisión

Quedaron preparados el inventario de retención implementada, las alternativas
con su impacto, la ficha de decisión por categoría, la adaptación necesaria de
0059 y el borrador de consulta. Los documentos de retención previos siguen no
vigentes. No se seleccionó una alternativa ni se cambiaron ventanas de borrado.

El responsable debe aportar la declaración real, cualquier comunicación que
reciba y el encuadre correspondiente para decidir el alcance. El resultado de
las dos bandejas generales de TAD ya quedó registrado arriba. Con esa información
se podrá materializar
una propuesta de SQL/UI y transición completa para revisión, con nuevos checks
locales y ledger exacto. Las duraciones y procedimientos de los proveedores se
cierran con sus evidencias aplicables, no con este inventario.

La validación del release distinguirá los checks que son política del proyecto
de las obligaciones legales y contractuales aplicables. Tener documentos o
tests preparados no convierte una evidencia externa pendiente en aprobada ni
autoriza un ensayo que escriba en producción.
