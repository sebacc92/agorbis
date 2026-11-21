# Acceso con Google y Facebook

El registro y el ingreso conservan el acceso por correo. La implementación
permite habilitar Google y Facebook por separado; que exista un proveedor en el
código no acredita que esté disponible públicamente. El objetivo preparado para producción es
Google activo y Facebook inactivo. El operador confirmó Google activo en Supabase
y autorizó el despliegue, sujeto a los checks y evidencias del plan de preparación.
Facebook está en pausa por decisión del operador y no bloquea Google. Este
cambio de código no configura ni publica aplicaciones en Google, Meta o Supabase.
Mantener también deshabilitados en Supabase los proveedores que todavía no se
ofrecen: los flags de Agorbis controlan el inicio desde la aplicación, mientras
que Supabase controla qué proveedores acepta su endpoint OAuth.

## Configurar proveedores en Supabase

Para Google, crear un cliente OAuth de tipo web en Google Auth Platform. Configurar
la audiencia y los permisos básicos `openid`, correo y perfil. Registrar como URI
autorizada la URL **que muestra Supabase en el proveedor Google**, normalmente
`https://<project-ref>.supabase.co/auth/v1/callback`. Guardar el Client ID y Client
Secret en Supabase → Authentication → Sign In / Providers → Google. No incorporar
el Client Secret al frontend ni a variables `PUBLIC_`.
[Referencia de Supabase para Google](https://supabase.com/docs/guides/auth/social-login/auth-google).

Para Facebook, configurar Facebook Login en una aplicación de Meta. Registrar esa
misma URL de Supabase como **Valid OAuth Redirect URI** y habilitar los permisos
`public_profile` y `email`. Guardar App ID y App Secret en el proveedor Facebook de
Supabase. Agorbis solicita `email`: probar con una cuenta de Facebook que tenga un
correo confirmado y conceda ese permiso. Las aplicaciones de Meta en desarrollo
sólo permiten personas con un rol habilitado; completar los requisitos de Meta
para acceso público antes de ofrecerlo a todas las personas.
[Referencia de Supabase para Facebook](https://supabase.com/docs/guides/auth/social-login/auth-facebook).

## Campo User data deletion de Meta

En la configuración básica de la aplicación, seleccionar **Data deletion
instructions URL** y completar:

```text
https://agorbis.com/eliminar-datos/
```

La página ofrece instrucciones para eliminar la cuenta desde el perfil y un
correo de contacto para solicitar el borrado sin iniciar sesión, incluido el
acceso con Facebook. Está disponible en español e inglés (`?lang=en`).

Antes de guardar la URL en Meta, desplegar la página y comprobar en una ventana
sin sesión que devuelve HTTP 200 y muestra las instrucciones y el contacto.
La existencia de la ruta en el repositorio no confirma su publicación.

## Configurar el regreso a Agorbis

En Supabase → Authentication → URL Configuration:

- **Site URL:** el origen de Agorbis, por ejemplo `https://agorbis.com`.
- **Redirect URLs de producción:** mantener exactamente
  `https://agorbis.com/auth/callback` y `https://agorbis.com/auth/confirm`, como
  exige el preflight. No añadir comodines ni orígenes locales o de preview al
  proyecto productivo para este lanzamiento.
- Los parámetros `next`, `consent` e `intent` los genera Agorbis en `redirectTo`.
  El código público de Supabase admite el regreso al mismo origen de Site URL
  conservando sus parámetros; comprobar el retorno completo en el ensayo real.
  No hace falta convertir el callback productivo en un patrón `?**`.
- Configurar los callbacks locales o de staging únicamente en el proyecto de
  prueba aislado autorizado.

El callback de Supabase registrado en Google/Meta y el callback de Agorbis tienen
funciones diferentes: el primero recibe la respuesta del proveedor; el segundo
canjea el código PKCE y establece la sesión de Agorbis.
[Referencia de Supabase para redirecciones](https://supabase.com/docs/guides/auth/redirect-urls).
[Validación del origen y conservación de redirectTo en Supabase Auth](https://github.com/supabase/auth/blob/master/internal/utilities/request.go).

## Configuración de Agorbis

En desarrollo, usar `.env.local` con el proyecto Supabase de prueba y mantener
cada flag en `false` hasta completar su configuración:

```dotenv
PUBLIC_GOOGLE_AUTH_ENABLED="false"
PUBLIC_FACEBOOK_AUTH_ENABLED="false"
PUBLIC_GOOGLE_PROCESSING_LOCATION=""
PUBLIC_GOOGLE_PROCESSING_LOCATION_EN=""
PUBLIC_FACEBOOK_PROCESSING_LOCATION=""
PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN=""
```

Los destinos ES/EN deben describir la configuración y los acuerdos reales de cada
proveedor habilitado. No usar destinos supuestos. `legal.ts` incorpora el proveedor
correspondiente en los avisos únicamente cuando su flag está activo.

El aviso general de transferencias, `2026-08-29.1`, conserva su exclusión de Google.
El protocolo separado está implementado mediante `0066`. El 9 de septiembre de
2026 el responsable [aprobó el aviso ES/EN y su casilla](google-notice-owner-approval-2026-09-09.md);
`0067_activate_google_auth_notice.sql` incorpora el snapshot `2026-09-09.1` y
ya fue aplicada únicamente a Supabase local. La cobertura revisada de Google
no devuelve bloqueos; el check público conserva once pendientes externos.
No hace falta volver a aprobar el texto. Google sólo puede
iniciarse desde Agorbis cuando existe un snapshot aprobado, vigente y bilingüe,
y la persona acepta expresamente esa versión/hash. Sin ese aviso, el recorrido
muestra que Google no está disponible y ofrece correo. La tabla dinámica no
sustituye esa decisión. Ver el [plan de preparación de Google](google-production-readiness.md).

Antes de habilitar Facebook, revisar y adaptar las menciones al proveedor en la
Política de privacidad, los Términos y el Aviso de transferencias: los documentos
versionados actuales todavía describen Google. La tabla dinámica de proveedores
no reemplaza esa revisión. Publicar los cambios que correspondan mediante el
versionado, los hashes y las migraciones de aceptación existentes; este cambio
mantiene esos documentos y sus aceptaciones vigentes.

Para Cloudflare, `scripts/cloudflare-public-build-environment.mjs` es la fuente del
build; `.env.local` no modifica ese inventario. Al preparar una habilitación,
actualizar el flag y confirmar ambos destinos en el inventario público, mantener
el mismo flag en las `vars` del perfil Wrangler correspondiente y actualizar los
inventarios de validación/recuperación que fijan los proveedores deshabilitados.
Los checks actuales rechazan diferencias entre cliente y Worker. Una publicación
requiere el procedimiento de release existente.

`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL` y
`SUPABASE_SECRET_KEY` siguen siendo la configuración utilizada por el servidor;
los secretos de Google y Facebook viven sólo en Supabase.

## Recorrido y validación

`useSocialSignIn()` recibe proveedor, intención de ingreso/registro y destino
interno. Antes de contactar a Supabase exige edad mínima, privacidad y
transferencias generales; el registro también exige términos y normas. Google
agrega una casilla opcional separada, el resumen del snapshot ES/EN aprobado y el
enlace `/acceso-google` con su versión/hash. El POST vuelve a leer
`current_google_auth_notice()` y rechaza una decisión omitida, un aviso ausente o
una versión/hash que haya cambiado.

La cookie `agorbis-oauth-context` vincula nonce, proveedor, intención, hash del
destino interno e inicio de la decisión; para Google conserva también idioma y
versión/hash. Tiene un plazo de diez minutos y complementa la marca de acuerdos
generales. Ambas se consumen en `/auth/callback`. El contexto usa `HttpOnly`,
`SameSite=Lax`, `Secure` con HTTPS y alcance limitado al callback.

Tras canjear el código y eliminar los tokens del proveedor, el callback registra
la decisión Google con `grant_google_auth_consent()` usando la clave pública y
el JWT de la propia persona. Si no puede confirmarla, revoca y limpia la sesión
recién obtenida. Los acuerdos generales pendientes se resuelven después en
`/consentimiento`; no se adelanta la participación. El destino interno seguro de
una cuenta existente se conserva.

`/perfil/acceso-google` permite consultar y retirar la decisión mediante RPC
propia; `/perfil/datos` exporta eventos y estado. Retirar no cierra la sesión ni
borra la cuenta o su identidad Google, y deja disponible el correo. Un callback
iniciado antes del retiro no puede volver a consentir: hace falta un nuevo
inicio con otra decisión expresa. El retiro sigue accesible sin un aviso vigente
y sin exigir una nueva aceptación de los documentos generales.

Antes de ofrecer Google, comprobar en staging la matriz del
[plan específico](google-production-readiness.md#matriz-para-el-ensayo-real): cuenta
nueva/existente, cancelación, decisiones omitidas o cambiadas, retorno vencido o
repetido, retiro concurrente con callback, sesión final sin tokens del proveedor,
consulta/exportación propia y continuidad del correo. Las pruebas automatizadas
usan datos locales y transportes simulados; no certifican OAuth con Google real.
Facebook permanece fuera de esta validación mientras siga en pausa.

Cuando sólo existe producción, proponer primero un Supabase temporal separado
con Agorbis local y un cliente OAuth de prueba. No crearlo sin autorización.
Una prueba conectada a Supabase productivo puede escribir identidades, sesiones
y aceptaciones aunque la UI corra localmente; requiere aprobación explícita de
su alcance y de la desviación respecto de staging. El
[plan de Google](google-production-readiness.md) detalla alternativas, casos,
reversión y el momento exacto de activar el proveedor.

El operador ya configuró cliente, audiencia, scopes, callbacks y credenciales de
Google en Supabase; ese informe no reemplaza el ensayo real. El candidato actual
tiene **66 migraciones**, `0001`–`0058` + `0060`–`0067`, sin `0059`, y `0067`
está aplicada localmente. La última observación productiva documentada sigue en
60 hasta `0061`; este trabajo no aplicó migraciones ni desplegó en producción.
Las pruebas históricas de 65/`0066` conservan ese alcance. Para `0067` pasaron
build, tipos y lint, 417 pruebas unitarias en 41 archivos, las 14 suites SQL
y 53 pruebas de navegador; Facebook fue la única prueba omitida. Estos checks
locales no certifican OAuth real.

El responsable confirmó que dispone de las cuentas propias A y B del plan; aún
falta aprobar el alcance concreto de las escrituras, el enlace de identidad y la
ventana productiva. También falta completar la actualización OPEN→OPEN y su
reversión: el componente de validación del origen preparado no constituye un
runner integrado. Los pendientes externos se gestionan con evidencia o mediante
la excepción granular existente, sin atribuirle conformidad legal. El aviso
aprobado no elimina los controles técnicos ni esos pendientes.

No hay que rehacer autenticación ni volver a activar Google. Facebook continúa
fuera del lanzamiento y el correo disponible. Ningún secreto OAuth se copia
fuera de Supabase para hacer esta revisión.
