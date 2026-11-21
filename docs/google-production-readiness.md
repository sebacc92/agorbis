# Google en producción: preparación y validación

Estado actualizado: el operador confirmó que Google ya está activo y autorizó
commit y despliegue al terminar las mejoras. El despliegue sigue sujeto a los
checks obligatorios; esa autorización no aporta las evidencias pendientes ni
autoriza crear recursos aislados o ejecutar la matriz OAuth con escrituras reales.
Facebook queda en pausa y no es un requisito para lanzar Google.

El 9 de septiembre de 2026 se [registró la aprobación del aviso ES/EN y su
casilla](google-notice-owner-approval-2026-09-09.md). La migración `0067` ya está
aplicada a Supabase local; no fue aplicada a producción. El gate específico de
cobertura Google no devuelve bloqueos. El check público conserva once pendientes
externos; la aprobación del aviso no acredita OAuth real ni un despliegue.

## Configuración declarada por el operador

El operador informa que creó el cliente OAuth web, publicó Google Auth Platform
para usuarios externos, configuró `openid`, correo y perfil, registró el callback
de Supabase y guardó Client ID/Client Secret en Supabase. También informa que
configuró Site URL y redirects de Agorbis. Corrigió después su declaración
inicial: Google está activo; Facebook sigue desactivado. Esta declaración no
se presenta como una prueba OAuth real realizada.

Una consulta posterior de sólo lectura a `/auth/v1/settings` devolvió
`google: true`, `facebook: false`, `email: true`, `disable_signup: false`.
No se modificaron proveedores durante esta revisión. La diferencia quedó
reconciliada con la confirmación expresa del operador. No ejecutar un OAuth
real para verificarla sin autorización del entorno y de las cuentas de prueba.

La lista exacta actual de redirects no se exportó del panel. El preflight exige
únicamente `https://agorbis.com/auth/callback` y
`https://agorbis.com/auth/confirm`; la recomendación anterior de agregar `?**`
en la guía social se corrigió, conservando el check estricto. Supabase permite
el retorno al mismo origen de Site URL con parámetros según su
[implementación pública](https://github.com/supabase/auth/blob/master/internal/utilities/request.go).
Verificar la lista efectiva y el retorno con `next`, `consent` e `intent` durante
la preparación y el ensayo autorizado, sin copiar códigos ni credenciales.

El objetivo del perfil abierto es:

```dotenv
PUBLIC_GOOGLE_AUTH_ENABLED="true"
PUBLIC_FACEBOOK_AUTH_ENABLED="false"
```

El inventario del build y las vars del Worker deben coincidir. Los perfiles de
cierre y recuperación mantienen ambos proveedores desactivados. No editar sólo
una variable del Worker: los flags del cliente se sustituyen al compilar.

La política de release pasa a `D72/2026-09-08/v5`: el gate obligatorio
`configuration.auth-providers-aligned` compara Supabase, cliente e inventario,
requiere correo disponible, Google activo y Facebook/otros proveedores apagados,
y verifica destinos y cobertura del consentimiento. Sustituye el requisito
anterior de Google siempre apagado sin permitir un waiver. Las actas y cápsulas
v4 no se reetiquetan ni se reutilizan como autorización v5; conservar sus
herramientas históricas para recuperar releases anteriores.

Los secretos OAuth se administran únicamente en Supabase. No solicitarlos por
chat ni incluirlos en `.env` de Agorbis, repositorio, frontend, Worker, capturas,
HAR, trazas o logs. Las pruebas locales automatizadas usan respuestas simuladas,
no credenciales OAuth reales.

## Evidencia de procesamiento de Google

La [Política de Privacidad de Google en español](https://policies.google.com/privacy?hl=es)
y su [versión en inglés](https://policies.google.com/privacy?hl=en)
explican, en la sección de transferencias de datos, que Google opera servidores
distribuidos internacionalmente y puede procesar información fuera del país de
residencia. Esto respalda una descripción de infraestructura global; no acredita
una región exclusiva para Agorbis ni una lista exhaustiva de destinos.

El 8 de septiembre de 2026 el operador confirmó **condiciones estándar, sin
acuerdo regional específico**. Con esa confirmación y la política oficial
vigente desde el 26 de mayo de 2026, se confirmaron
`PUBLIC_GOOGLE_PROCESSING_LOCATION` y
`PUBLIC_GOOGLE_PROCESSING_LOCATION_EN` en el inventario de producción y
recuperación. Los textos se centralizan en
`scripts/google-processing-disclosure.mjs`.

Texto confirmado ES:

> Infraestructura global de Google: según su Política de Privacidad, la
> información puede procesarse en servidores fuera del país de residencia de
> la persona usuaria.

Texto confirmado EN:

> Google's global infrastructure: according to its Privacy Policy, information
> may be processed on servers outside the user's country of residence.

Estos textos no afirman países concretos, un DPA contratado, un plazo de retención
ni un mecanismo argentino de transferencia. Confirmar ubicaciones no completa
`PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` ni las evidencias pendientes de otros proveedores.

## Decisión Google implementada y aprobada

El aviso general `internationalTransferNoticeContent`, versión `2026-08-29.1`,
sigue excluyendo Google. `0066_google_auth_consent.sql` implementó la separación
técnica sin insertar avisos. La migración posterior
`0067_activate_google_auth_notice.sql` incorpora el aviso `2026-09-09.1` aprobado
expresamente por el responsable; la casilla aprobada está integrada en la UI.
La migración conserva el contenido exacto
revisado y su hash `sha256-postgres-jsonb-v1`:
`b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3`.
La [constancia de aprobación](google-notice-owner-approval-2026-09-09.md)
registra alcance, fuente y fecha. No inserta consentimientos por las personas
usuarias ni altera el aviso general. Google ya está activo en Supabase y no se
modifica ese estado desde esta preparación.

El recorrido implementado requiere un snapshot aprobado, vigente y bilingüe
ES/EN, con versión y hash `sha256-postgres-jsonb-v1`. `/ingresar` y `/registro`
ofrecen una casilla Google separada, sin preseleccionar, y enlazan ese aviso en
`/acceso-google`. Sin un aviso válido, se muestra la indisponibilidad de Google
y sigue disponible el correo. La página no sustituye silenciosamente el aviso
cuando un enlace contiene una versión/hash diferente.

El POST consulta otra vez `current_google_auth_notice()` y compara la versión y
el hash con el formulario antes de salir al proveedor. La cookie de contexto
vincula nonce, proveedor, intención, hash del destino interno, idioma, versión/hash
y el instante emitido por la base. Dura diez minutos, es `HttpOnly`,
`SameSite=Lax`, `Secure` sobre HTTPS y está limitada a `/auth/callback`.
Complementa la marca de los acuerdos generales; ambas se consumen al regresar.

El callback clasifica el método `amr` del JWT recién recibido de Supabase. Un
retorno OAuth sin tokens del proveedor ni parámetros no pasa como correo; los
métodos desconocidos o ambiguos se rechazan. No se deduce el método a partir del
proveedor original de una cuenta que puede tener varias identidades vinculadas.

Después del canje PKCE y del saneamiento de tokens del proveedor, el callback
registra la decisión con `grant_google_auth_consent()` mediante la clave pública
y el JWT propio. No atribuye aceptaciones a un correo todavía no identificado ni
usa `service_role` para esa RPC. Si la decisión no puede registrarse, revoca y
limpia la sesión recién obtenida y devuelve un error seguro. Las aceptaciones
generales pendientes siguen resolviéndose en `/consentimiento`, antes de permitir
participación.

La consulta y el retiro se ofrecen en `/perfil/acceso-google`, sin depender del
gate de participación; la exportación propia incluye eventos y estado. Retirar
**no cierra la sesión actual, no borra la cuenta ni elimina o desvincula la
identidad Google**. Impide reutilizar esa decisión; una barrera SQL rechaza un
callback iniciado antes del retiro. Para volver a usar Google hace falta un
nuevo inicio y otra decisión expresa. No se modifica el acceso por correo ni se
deshacen tratamientos anteriores.

El ledger candidato es de **66** (`0001`–`0058` + `0060`–`0067`, sin `0059`).
`0067` se aplicó exitosamente sólo a Supabase local. La última observación
productiva documentada permanece en **60** hasta `0061`; no hubo migraciones ni
deploy productivos en esta etapa. La política Supabase read-only D72 usa `v4`
para este candidato. Backup agrega `post-0067` y conserva separados los estados
históricos post-0065 de 64 y post-0066 de 65; sus recibos no certifican el nuevo.

La revisión de `scripts/social-auth-consent-policy.mjs` reconoce la aprobación y
no devuelve bloqueos Google. La [propuesta y protocolo](google-consent-proposal.md)
detalla su integración. **La aprobación del texto y la casilla está completada**;
quedan las pruebas del candidato y el ensayo OAuth real, además de los once
pendientes externos del check público. Facebook no interviene en estos pasos.

## Alternativa mínima aislada propuesta

La [guía social](social-auth-setup.md#recorrido-y-validación) pide comprobar el
proveedor en staging. La alternativa propuesta conserva aislamiento de datos:

1. Un proyecto temporal de Supabase separado, creado sólo con autorización. Aplicar
   las migraciones y configuración pertinentes, con datos sintéticos y cuentas de
   prueba. No copiar usuarios, sesiones ni almacenamiento de producción.
2. Un cliente OAuth web de prueba con el callback de ese Supabase. El operador
   guarda el secreto únicamente en el panel de ese proyecto. No cambiar el
   callback ni las credenciales del cliente productivo.
3. Ejecutar Agorbis localmente contra ese Supabase, con flags Google activo y
   Facebook inactivo. Autorizar únicamente el callback local concreto necesario.
   Los redirects de producción permanecen separados.
4. Ejecutar la matriz de abajo con cuentas de prueba, incluida una cuenta de
   correo confirmado existente en ese entorno. Conservar sólo resultados
   saneados, commit, versiones legales y fecha; no grabar el recorrido OAuth.
5. Retirar el cliente y proyecto temporales después de aprobar resultados y
   limpieza. Esa eliminación requiere confirmar que no se necesita conservarlos.

No hace falta crear un frontend público permanente para esta primera validación.
La diferencia frente a un staging completo es que el frontend corre localmente:
no certifica por sí solo dominios, cookies HTTPS, bindings ni CSP del Worker real.
Esas propiedades se verifican en el paquete local y en un smoke final autorizado.
La [documentación de Supabase](https://supabase.com/docs/guides/deployment/managing-environments)
describe la separación de entornos; una rama aislada también es posible si el
operador ya dispone de esa capacidad, sin mezclarla automáticamente a producción.

## Si se elige una prueba controlada en producción

No está autorizada en esta revisión. Sería una desviación explícita de la
exigencia de staging: se usarían la base, las cuotas, las sesiones y las
identidades reales, aunque el frontend de prueba estuviera en localhost.

### Propuesta concreta del 9 de septiembre

El responsable eligió continuar por el camino simplificado. Se prepara esta
opción para revisión; no se toma esa elección como permiso para ejecutarla.
No se crean recursos de staging. La alternativa aislada anterior permanece
disponible y no fue ejecutada.

- **Cuenta A:** Google propia cuyo correo nunca haya usado Agorbis.
- **Cuenta B:** Google propia cuyo mismo correo ya esté confirmado en una cuenta
  de Agorbis creada por correo. El alcance a aprobar incluye que Supabase pueda
  enlazar esa identidad Google a la cuenta existente.
- **Ventana propuesta:** preparar dependencias y pruebas locales antes de abrir
  la ventana. La capability de ensayo dura como máximo 20 minutos y nunca supera
  el baseline/certificación vigentes; no extenderla para acomodar demoras. Si se
  vence, detener el ensayo, efectuar cleanup y preparar una nueva ventana con
  evidencia fresca. Reservar aparte los 30 minutos de observación posteriores a
  la publicación. El responsable introduce credenciales sólo en Google/Agorbis
  o en su correo; no las comparte con el agente.
- **Escrituras incluidas:** identidades y posible enlace de B, sesiones y fechas
  de acceso, decisiones y retiros de consentimiento, onboarding imprescindible,
  correos propios de recuperación y registros operativos asociados. La limpieza
  propuesta retira el consentimiento Google de prueba y cierra las sesiones de
  Agorbis de A/B, incluidas sus otras sesiones activas. Se conservan ambas cuentas
  y el enlace de identidad de B; no se borran ni desvinculan.
- **Fuera de alcance:** publicaciones, votos, archivos públicos, purgas, borrado
  o desvinculación de cuentas, cambios globales para provocar errores, pruebas
  con cuentas ajenas y cualquier uso de una clave administrativa por la persona
  que prueba. Las decisiones se registran con el JWT propio.

El responsable confirmó el 9 de septiembre que dispone de ambas cuentas.
No se recopilaron direcciones ni credenciales. La disponibilidad confirmada no
es autorización de las escrituras, del enlace de identidad ni de la ventana.

Orden del ensayo: correo de B; cancelación de Google; decisiones omitidas;
registro de A; reingreso de A con destino interno; ingreso y enlace de B;
retorno de B vencido después de diez minutos; retiro con retorno pendiente;
nueva aceptación; consulta y exportación propias; comprobación de sesión y
tokens; cierre de sesión y correo/recuperación de A y B. Los resultados exigidos
son los de la matriz siguiente, sin convertir un resultado simulado en real.

Con dos cuentas, A sólo puede ser nueva una vez. Probarla desde `/registro`
deja la rama de cuenta nueva desde `/ingresar` cubierta localmente, sin
acreditarla como ensayo real. Probar ambas ramas reales requiere una tercera
cuenta Google propia nueva; no borrar A para reutilizarla. Los cambios de
versión/hash, manipulación o repetición de contexto, correo no confirmado y
fallos deliberados de saneamiento o registro permanecen como pruebas locales.

La evidencia registra sólo caso, resultado, fecha, commit y versión/hash del
aviso. Para comprobar ausencia de tokens del proveedor se inspecciona en memoria
la sesión final decodificada, incluidas cookies fragmentadas; se guarda sólo el
resultado booleano. No se guardan grabaciones, HAR, cookies ni tokens. Google
activo es acceso público del proveedor, no una lista restringida a A y B.

Ante un fallo de consentimiento, sesión o correo: detener el ensayo y aplicar
la reversión incluida en la aprobación de la ventana. Preparar una variante
con Google y Facebook apagados en cliente y Worker, correo disponible y los
recorridos nuevos de consulta/retiro/exportación conservados. Desactivar Google
en Supabase detiene nuevos inicios del proveedor, pero no revoca sesiones ya
emitidas ni deshace enlaces, decisiones o migraciones. No realizar esos borrados
o reparaciones adicionales por inferencia. Para un fallo general del despliegue,
la versión OPEN anterior requiere compatibilidad comprobada con las migraciones;
volver a ella no sustituye la reversión específica de Google ni su verificación
de derechos de cuenta.

Activar Google en Supabase habilita también su endpoint OAuth público. Ocultar
el botón de Agorbis no limita el proveedor a las cuentas de prueba y no permite
prometer un canary exclusivo. El callback, RLS y los consentimientos deben seguir
protegiendo las operaciones de Agorbis, pero el inicio externo puede crear una
identidad. Esta exposición y el estado persistente que deje la prueba forman
parte de la confirmación necesaria antes de realizarla.

La reversión detiene nuevos inicios; no deshace automáticamente identidades,
enlaces, aceptaciones ni registros ya escritos. Cualquier limpieza posterior debe
estar acotada a las cuentas autorizadas y revisarse por separado.

## Matriz para el ensayo real

| Caso                                | Acción                                                                                              | Resultado exigido                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nueva desde registro                | Completar las decisiones vigentes y continuar con Google                                            | Cuenta autenticada sin aceptación durable anticipada; consentimiento autenticado y onboarding; perfil público sin copiar automáticamente nombre/foto de Google.               |
| Nueva desde ingreso                 | Usar una dirección de prueba aún no registrada                                                      | Se informa que puede crear una cuenta y se exige el mismo límite de consentimiento; no hay participación prematura.                                                           |
| Existente Google                    | Ingresar de nuevo con `next` interno                                                                | Misma cuenta y perfil, destino seguro y sesión utilizable.                                                                                                                    |
| Existente por correo                | Correo confirmado coincidente con Google                                                            | Una sola cuenta/perfil; ambos métodos siguen funcionando. Verificar el enlace en memoria, sin registrar identificadores.                                                      |
| Correo no confirmado                | Repetir el enlace en el entorno aislado                                                             | No heredar aceptaciones plantadas ni duplicar perfiles; mantener las defensas del SDK/Supabase.                                                                               |
| Cancelación/rechazo                 | Cancelar en Google                                                                                  | Error comprensible, sin sesión nueva, tokens ni descripción cruda del proveedor en logs.                                                                                      |
| Consentimientos                     | Omitir la casilla Google o un acuerdo requerido; cambiar versión/hash o el aviso entre carga y POST | Sin aceptación expresa y snapshot vigente no sale al proveedor. POST vuelve a consultar; la aceptación Google se registra sólo después de identificar y sanear la sesión.     |
| Retorno vencido/manipulado/repetido | Superar diez minutos; alterar nonce, proveedor, intención o destino; repetir código                 | Rechazo seguro y revocación/limpieza de la sesión nueva si llegó a canjearse. No registra aceptación ni concede participación mediante el retorno inválido.                   |
| Sesión                              | Recargar, navegar a perfil, cerrar sesión y volver                                                  | Sesión estable, cierre efectivo y rutas privadas protegidas.                                                                                                                  |
| Tokens del proveedor                | Inspeccionar en memoria las cookies fragmentadas finales                                            | Ningún `provider_token` ni `provider_refresh_token`; cookies productivas `Secure`, `HttpOnly`, `SameSite=Lax`. No basta buscar cadenas en el texto codificado.                |
| Fallo de saneamiento o registro     | Simular localmente fallo al reescribir sesión o al registrar la decisión Google                     | Revoca y limpia la sesión nueva, devuelve error seguro. No provocar estos fallos deliberadamente en producción.                                                               |
| Retiro y retorno en curso           | Retirar desde `/perfil/acceso-google` y completar un acceso iniciado antes                          | La decisión queda retirada; el retorno previo no vuelve a consentir. La sesión desde la que se retiró y el correo siguen disponibles; no se borra ni desvincula la identidad. |
| Nueva decisión después del retiro   | Iniciar otro acceso y aceptar expresamente el aviso vigente                                         | Registra una nueva aceptación propia; no la reconstruye a partir del consentimiento general.                                                                                  |
| Consulta y exportación              | Revisar estado y descargar datos propios                                                            | Estado y eventos Google presentes, sin acceso a decisiones ajenas ni tokens del proveedor.                                                                                    |
| Correo y recuperación               | Contraseña, enlace de correo y recuperación                                                         | Los recorridos existentes siguen disponibles; una cuenta Google puede recuperar acceso por correo.                                                                            |
| Proveedor deshabilitado             | Intentar Google con el flag apagado; Facebook siempre apagado                                       | Rechazo seguro sin llamada OAuth desde Agorbis.                                                                                                                               |

La [documentación de enlace de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking)
explica el enlace por correo coincidente; las pruebas deben comprobar el resultado
real con la configuración elegida. La
[guía Google de Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)
documenta el callback PKCE y los tokens de proveedor que pueden llegar en el
intercambio. Agorbis conserva únicamente la sesión Supabase saneada.

## Momento exacto de activar Google en Supabase

Google **ya está activo y confirmado por el operador**: no hace falta volver a
activarlo. No se modificó su configuración. Mientras los bloqueos sigan abiertos,
el operador puede desactivarlo temporalmente para detener nuevos inicios OAuth
directos; el correo sigue disponible. Si lo desactiva, el punto exacto de
reactivación es el paso 2. Si lo mantiene activo, ese paso es una comprobación de
estado, no otra activación. El despliegue está autorizado, sujeto a los controles:

1. Incorporar el aviso ya aprobado, cerrar la evidencia o la excepción granular
   correspondiente y pasar los checks locales y el ensayo acordado,
   y revisar el diff final. Congelar commit, versión legal y configuración;
   construir y revisar tanto el candidato Google activo/Facebook inactivo como
   su reversión. Confirmar que el acceso por correo funciona y que la versión
   previa sigue activa.
2. **Google ya está activo en Supabase.** No volver a activarlo, cambiar sus
   credenciales ni desactivarlo para acomodar el ensayo. Releer la configuración
   efectiva en la ventana autorizada y confirmar correo activo/Facebook apagado.
   El endpoint de Supabase ya está expuesto aunque el Worker vigente oculte
   Google; registrar ese estado como origen, no como resultado del ensayo.
3. Ejecutar las verificaciones y el canary autorizados, conservando el Worker
   vigente como versión pública al 100 %. El candidato al 0 % recibe únicamente
   tráfico de ensayo autenticado por la herramienta. `OPEN_UPDATE` está integrado
   localmente y exige evidencia real; un diagnóstico o fixture no habilita la
   promoción. Un fallo detiene la publicación y ejecuta el cleanup/recuperación
   del alcance autorizado. No cambia proveedores ni cierra el sitio por defecto.
4. Tras aprobar los checks, activar la versión del Worker cuyo cliente y runtime
   tienen Google `true` y Facebook `false`, y ejecutar el smoke acotado aprobado.
   No prometer un ensayo OAuth previo sobre el formulario publicado con Google
   apagado: su acción rechaza ese inicio y los perfiles actuales tampoco ofrecen
   URLs de preview. Desde el paso 2 el endpoint Supabase ya está expuesto, y tras
   publicar la UI otras personas también pueden iniciar Google.
5. Verificar ingreso, registro, callback, consentimiento, sesión y correo; observar
   las métricas saneadas durante al menos los 30 minutos del runbook. Revertir
   inmediatamente ante un fallo de consentimiento, sesión o acceso por correo.

El smoke productivo no reemplaza la matriz completa del entorno aislado. Si se
elige omitir ese ensayo, se debe aprobar expresamente la desviación y la
exposición pública descritas arriba antes de este orden de activación. Ningún
ensayo real se ejecuta sin acordar las cuentas y el entorno. La autorización de
commit/despliegue posterior no omite los gates de evidencia ni consentimiento.

## Reversión

1. Detener las pruebas y restaurar el paquete de recuperación compatible según
   la cápsula del release. Google en Supabase conserva su estado previo. Si el
   incidente exige cerrar también el endpoint OAuth externo, el responsable debe
   desactivar Google allí; Facebook permanece apagado. Ocultar el botón no
   desactiva el proveedor ni revoca sesiones existentes.
2. Restaurar el artefacto conocido con ambos flags desactivados, manteniendo el
   sitio abierto y el acceso por correo. Prepararlo con las correcciones de
   cookies y CSS/UI, y con la misma versión legal compatible con las migraciones
   que se hayan aplicado. No revertir textos o hashes sin comprobar su
   compatibilidad con las aceptaciones durables. La versión actualmente publicada
   sólo puede usarse como emergencia si sigue siendo compatible; además
   reintroduce su fallo de CSS hasta desplegar una corrección verificada.
   El artefacto de reversión preparado debe conservar `/perfil/acceso-google`,
   la lectura del aviso aprobado y la exportación de decisiones aunque el inicio
   Google esté apagado. No retirar esos recorridos de derechos al ocultar el botón.
3. Conservar el esquema y los eventos/barreras de `0066`, además del snapshot
   aprobado de `0067`, que existan en el estado respaldado. Una reversión de
   Worker no elimina decisiones ni restaura
   aceptaciones retiradas; si hace falta reparar SQL, preparar una corrección
   hacia adelante. Comprobar registro/ingreso por correo, sesiones existentes y
   rutas públicas.
   No cerrar el sitio ni desactivar email para retirar Google.
4. Desactivar el proveedor no revoca sesiones Supabase ya emitidas. Ante una
   filtración, aplicar el procedimiento de incidente y revocar sólo el alcance
   autorizado; no rotar credenciales ni borrar cuentas como parte de un rollback
   ordinario. Los secretos OAuth se modifican únicamente en Google/Supabase.
5. Preservar resultados agregados y errores saneados. No guardar cookies, códigos,
   tokens, secretos o identificadores personales en las evidencias.

## Evidencia histórica: checks de la preparación inicial del 8 de septiembre de 2026

Estos resultados son anteriores a `0066` y no certifican el candidato actual
con `0067`. Las secciones finales separan el antecedente de 65 migraciones de
las verificaciones del candidato de 66; no se trasladan resultados entre ellos.

Se usó Node 22.22.0, pnpm 11.15.0 y una copia local aislada en
`/tmp/agorbis-google-review`, con dependencias congeladas y Supabase local ya
existente (`127.0.0.1:54821`). No se copiaron archivos `.env` productivos al
checkout de prueba. El último bundle de navegador usó Google `true` y Facebook
`false`; esto no activó ningún proveedor Supabase ni ejecutó OAuth externo.

| Comprobación                                                            | Resultado                                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build de cliente y preview SSR, tipos, lint y validaciones del proyecto | PASS. Los últimos ajustes de UI se recompilaron y pasaron tipos y ESLint.                                                                                                              |
| Vitest                                                                  | 253 tests PASS en 32 archivos. Incluye SDK Supabase real con transporte simulado, limpieza de cookies fragmentadas y fallos de saneamiento.                                            |
| `test.release-open`, política v5 final                                  | PASS, incluidos catálogo, colector, recuperación y rechazo de evidencia insuficiente.                                                                                                  |
| Navegador, bundle final                                                 | 41 casos verificados: 40 PASS en la suite completa y 1 PASS en la reejecución focalizada del test que aún asumía Google apagado. Facebook: 1 omitido por estar deshabilitado.          |
| Regresión CSS y búsqueda                                                | 8 PASS focalizados, incluido preconsentimiento de Google; Facebook omitido. Navegación SPA e historial, estilos y ancho a 320/1280 px, búsqueda ES/EN, foco y conservación de filtros. |
| Exploración sin subcomunidades                                          | Revisión manual ES/EN a 320 px: una acción para abrir, regreso al padre, buscador vacío oculto, sin desborde.                                                                          |
| Textos y secretos                                                       | Versiones/hashes legales consistentes; i18n: 2062 mensajes y 1329 usos estáticos; scanner de formatos de secretos: 545 archivos sin hallazgos.                                         |
| Build Cloudflare estricto                                               | **BLOQUEADO**, exit 1 antes de producir un release publicable: 3 bloqueos de Google y 11 evidencias generales previas. Ningún check omitido.                                           |
| Google real, cuentas/identidades productivas                            | **No ejecutado**. Requiere resolver los pendientes y autorizar el entorno/alcance.                                                                                                     |

La prueba de registro ahora contrasta los botones con los flags explícitos del
entorno, manteniendo apagado como valor por defecto y todas las comprobaciones de
contraseña y acuerdos. El log de la corrida completa conserva el fallo de su
expectativa anterior; no se presenta esa corrida aislada como íntegramente verde.
Los casos de correo, enlaces, recuperación, reautenticación, cambio de correo,
cookies HttpOnly y restricciones de sesión sí pasaron contra Supabase local.

Evidencias locales de ejecución:

- `/tmp/agorbis-google-review-targeted-build.log`: build, tipos, lint y 253 tests.
- `/tmp/agorbis-google-review-release-final.log`: suite completa de release v5.
- `/tmp/agorbis-google-review-targeted-e2e2.log`: regresiones focalizadas verdes.
- `/tmp/agorbis-google-review-final-e2e.log` y
  `/tmp/agorbis-google-review-final-flags-test.log`: suite completa y corrección
  focalizada de la expectativa del flag.
- `/tmp/agorbis-google-review-strict-build.log`: bloqueo estricto sin bypass.

Un test con transporte simulado no certifica el proveedor real. Estas evidencias
locales no son una aprobación de producción ni una autorización de release.

## Pendientes reales del candidato ampliado

1. Resolver los pendientes externos mediante evidencia o la excepción granular
   existente, sin marcar riesgos aceptados como conformidad legal. La
   [revisión de fuentes oficiales](provider-evidence-review-2026-09-08.md)
   distingue información pública de contratos, configuración y respuestas de la
   cuenta aún no acreditados. Supabase recibió la consulta y respondió en
   **SU-467483** sobre el DPA incorporado a los términos; las aclaraciones
   específicas y las [solicitudes de Resend/Cloudflare](TRANSFER_SAFEGUARDS_REQUESTS.md)
   siguen pendientes. Enviar un correo no es un control técnico del deploy ni
   la única vía para obtener evidencia. AAIP y conservación se detallan en
   [la siguiente etapa](privacy-reconciliation-next-stage.md). El check público
   conserva once entradas externas; el aviso Google aprobado ya no es una de ellas.
2. Las pruebas locales del candidato de 66 migraciones están completas:
   `0067` aplicada sólo localmente, build, tipos y lint PASS, 417 unitarias,
   14 suites SQL y 53 pruebas de navegador correctas; una omitida por Facebook.
   La cobertura Google ya está revisada y no devuelve bloqueos; no hace falta
   otra aprobación del texto ni rehacer Auth. Estos resultados preparan la
   certificación y no reemplazan las comprobaciones productivas.
3. Verificar los redirects efectivos y acordar el alcance y la ventana del
   ensayo real. El responsable ya dispone de las cuentas A y B. La disponibilidad
   de cuentas y la aprobación del aviso no autorizan las escrituras ni el enlace
   de identidad. La propuesta productiva conserva su desviación respecto del
   aislamiento y requiere esa aprobación específica antes de ejecutarse.
4. Completar la certificación real de la actualización OPEN→OPEN y su reversión.
   La integración local ya existe; sus fixtures no acreditan producción. El
   backup cifrado fue
   creado y verificado; restore y copia externa se postergaron por decisión del
   responsable y conservan sus pendientes, sujetos a la excepción concreta del
   release. No reutilizar recibos históricos de 60/64/65 para el candidato nuevo.
5. Fijar commit y artefactos, acreditar los controles no renunciables y concretar
   la ventana del despliegue autorizado. La excepción documental no sustituye
   pruebas reales, controles de seguridad ni verificación posterior.

Google activo, las condiciones estándar sin acuerdo regional y la aprobación
del aviso ES/EN con su casilla **ya están confirmados**; no se vuelven a solicitar.
Los destinos Google ES/EN del inventario siguen respaldados. Facebook y la
verificación de negocio en Meta quedan fuera del lanzamiento.

## Evidencia histórica de las cinco mejoras, anterior a 0066

La [entrega integrada](improvements-release-2026-09-08.md#resultados-finales-locales)
registró 304 pruebas unitarias, 470 aserciones SQL y 51 E2E PASS; Facebook omitido.
En ese corte, el build estricto seguía bloqueado por consentimiento Google y once
evidencias generales. Esos resultados conservan su alcance histórico: no acreditan
los cambios posteriores del protocolo separado ni su activación `0067`.

## Evidencia histórica del candidato con 0066: 65 migraciones

La ejecución de ese candidato en checkout y store nuevos conservó Node 22.22.0, instalación
congelada, `verifyDepsBeforeRun=error` e integridad Wrangler sin cambiar hashes.
El workspace declara explícitamente un único paquete para que `server/package.json`
generado no altere el inventario de proyectos entre comandos.

| Verificación                                | Resultado                                                  |
| ------------------------------------------- | ---------------------------------------------------------- |
| Cliente, preview SSR, tipos y lint completo | PASS, incluidos los controles de release y recuperación    |
| Worker y SSG de 404 con Supabase local      | PASS técnico; no constituye un artefacto publicable        |
| Unitarias                                   | 417 PASS en 41 archivos                                    |
| SQL local                                   | 548 aserciones PASS en 14 suites; 78 corresponden a Google |
| Concurrencia SQL real local                 | 11 comprobaciones PASS y fixtures eliminados               |
| Navegador local                             | 52 PASS; 1 omitido por Facebook desactivado                |
| Build público estricto                      | BLOCKED: doce entradas de evidencia pendientes, sin upload |

El navegador comprobó el estado entonces vigente sin aviso aprobado y el
retiro/exportación autenticados, además de las regresiones de cuenta y CSS.
Los casos OAuth positivos usaron transporte simulado en las pruebas de código.
Estos resultados no certifican la activación posterior del aviso ni OAuth real.
No se realizaron escrituras productivas ni se modificaron proveedores.

## Estado del candidato con 0067: 66 migraciones

| Verificación                       | Resultado al actualizar este registro                                      |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Aviso y casilla ES/EN              | Aprobación registrada el 9 de septiembre; versión `2026-09-09.1`.          |
| Migración `0067`                   | Aplicada exitosamente sólo a Supabase local.                               |
| Inventario candidato               | 66 migraciones exactas hasta `0067`, sin `0059`; históricos preservados.   |
| Cobertura Google                   | Sin bloqueos en la política específica revisada.                           |
| Check de apertura pública          | Once pendientes externos; no constituye build ni release aprobados.        |
| Build local, tipos y lint completo | PASS; preview compilado con Google activo y Facebook apagado.              |
| Pruebas unitarias                  | 417 PASS en 41 archivos.                                                   |
| SQL local                          | PASS en las 14 suites; 83 verificaciones Google, sin autoaceptación.       |
| Navegador local                    | 53 PASS; 1 omitido exclusivamente por Facebook desactivado.                |
| OAuth real                         | No ejecutado; alcance productivo y ventana aún pendientes de aprobación.   |
| Actualización OPEN→OPEN            | Baseline preparado; runner y recuperación del recorrido aún no integrados. |

La ejecución final usó Node 22.22.0, instalación congelada en un store limpio
con `umask 022`, el hash canónico de Wrangler sin modificaciones y Chromium
contra `http://127.0.0.1:4173`. Google estaba habilitado en el cliente local y
Facebook apagado. Las pruebas de navegador cubrieron el aviso, la casilla
separada sin marcar y el enlace de versión desactualizado, junto con las
regresiones de acceso por correo, retiro/exportación y estilos.

La aplicación local de `0067` y la aprobación del texto no registran decisiones
por las personas usuarias. La última observación productiva documentada permanece
en 60 migraciones hasta `0061`; no se aplicó `0067` ni se desplegó este candidato
en producción. Los ensayos locales no se presentan como accesos reales a Google.

Google ya está activo; no se necesita otra activación mientras el operador no lo
desactive. Esta preparación no ejecutó OAuth real, no activó proveedores ni
modificó producción.
