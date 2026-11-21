# Canary aislado de Producción para D72

Estado: policy, parsers, capability y executor por etapas versionados con tests
locales. El CLI queda en `plan-only` por defecto y la ejecución remota **no está
autorizada ni fue ejecutada**.

Este procedimiento acredita evidencia actual para los gates D72 sin asignar
tráfico general al artefacto `open`. No reemplaza la autorización excepcional,
no acepta riesgos y nunca autoriza el cutover público.

## Invariantes

- El request, la policy, el HEAD completo, el artefacto congelado y la Worker
  Version quedan ligados por SHA-256/Version ID.
- El deployment temporal contiene la versión CLOSED al `100%` y la candidata
  OPEN al `0%`. El porcentaje de la candidata no puede ser mayor que cero.
- El acceso a la candidata requiere simultáneamente el Version Override exacto
  y una capability HMAC efímera. Conocer el Version ID no alcanza.
- La capability usa separación de dominio y el `CRON_SECRET` ya existente. No
  agrega bindings ni Worker Secrets. Vive sólo en memoria, dura como máximo 20
  minutos y nunca se imprime, serializa ni incorpora a actas. El Worker rechaza
  capabilities vencidas; no se afirma prevención de replay remoto dentro de la
  ventana porque no existe un nonce ledger remoto persistente.
- Los dos headers de control se eliminan antes de llegar al router, Supabase o
  logs de aplicación. Un navegador sólo puede agregarlos a requests HTTPS cuyo
  host exacto sea `agorbis.com` o `www.agorbis.com`; debe quitarlos para
  Supabase, Turnstile, la casilla de correo y todo tercero.
- Todas las respuestas canarias fuerzan `Cache-Control: no-store` y
  `X-Robots-Tag: noindex, nofollow, noarchive`.
- `workers.dev=false` y `preview_urls=false` permanecen sin cambios.
- No se crean rutas, Custom Domains, DNS, crons, secrets ni otro Worker.
- La creación de la Version, su asociación temporal al `0%` y la ejecución
  stateful requieren tres autorizaciones literales distintas desde `/dev/tty`.
  Ninguna de ellas es la autorización de deploy OPEN.
- Ante una inconsistencia o un check stateful no PASS, el resultado es
  `ROLLBACK_CLOSED`: se separa la candidata y se conserva CLOSED al `100%`.

La implementación fail-closed reside en:

- `src/lib/d72-canary-capability.js` y
  `src/lib/cloudflare-worker-runtime.ts`;
- `scripts/d72-canary-policy.mjs`;
- `scripts/d72-stateful-canary-policy.mjs`;
- `scripts/d72-non-waivable-evidence-policy.mjs`;
- `scripts/non-waivable-gate-evidence-catalog.mjs`.

## Alternativas evaluadas

| Alternativa                                                       | Cambios Cloudflare                                                                                                                                | Exposición y restricción                                                                                                             | Identidad/cleanup                                                                                                      | Binding y rollback                                                                                         | Desvío                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Misma Worker, deployment CLOSED 100% + OPEN 0% y Version Override | Sube una Version y crea temporalmente un deployment de dos versiones. No toca DNS, dominio, route, trigger, secret, `workers.dev` ni preview URL. | El tráfico ordinario sigue en CLOSED. La candidata sólo acepta Override exacto + capability HMAC efímera; devuelve no-store/noindex. | Una cuenta canaria y fixtures con `canaryId`; cleanup por IDs exactos y posterior detach.                              | Misma Version, HEAD y artifact hash. Rollback: deployment CLOSED 100%.                                     | Mínimo: usa dominio, bindings, secrets y configuración productivos reales.                                   |
| Hostname/endpoint temporal restringido, por ejemplo con Access    | Requiere hostname/ruta, certificado y normalmente DNS/policy Access; puede exigir adaptar redirects y allowlists.                                 | Access reduce exposición, pero el origen sigue siendo alcanzable según la topología y aparece una política nueva que auditar.        | Puede aislar una identidad, pero altera hostname de Auth, cookies y Turnstile. Cleanup elimina hostname, DNS y policy. | Puede apuntar al mismo artefacto; rollback tiene más objetos que revertir.                                 | Medio/alto: hostname, cookies, PKCE, SMTP y Turnstile dejan de representar apex real.                        |
| Segundo Worker canario                                            | Crea Worker y duplica bindings/secrets; necesita ruta, hostname o service binding.                                                                | Puede restringirse, pero agrega una superficie y una identidad operativa nuevas.                                                     | Cuenta dedicada; cleanup del Worker, secrets y route además de datos.                                                  | El bundle puede compartir hash, pero la configuración desplegada diverge. Rollback elimina varios objetos. | Alto: Worker, secretos, bindings y routing distintos de Producción.                                          |
| Preview URL o `workers.dev`                                       | Habilita una superficie actualmente desactivada y pública; una preview URL se publica al crear la Version si está habilitada.                     | La URL no es un secreto y no ofrece por sí sola autorización de cuenta. Requeriría otra barrera.                                     | Host distinto; cleanup/deshabilitación posterior.                                                                      | Puede apuntar a la Version, pero no reproduce zone settings/apex.                                          | Alto y contrario a la política: dominio, cookies, redirects, Turnstile y observabilidad no equivalen a apex. |

### Recomendación

Usar la primera alternativa. Cloudflare soporta dirigir un request a una Version
del deployment actual incluso cuando está en `0%`, mientras el tráfico sin
override continúa según los porcentajes. La barrera HMAC de Agorbis agrega
autorización de aplicación a esa selección de infraestructura.

El `0%` evita tráfico aleatorio, pero no es por sí solo control de acceso: el
Version ID puede observarse operativamente. Por eso la implementación exige la
segunda barrera HMAC y rechaza con 403 antes de ejecutar Qwik.

## Fases sin circularidad

### Fase 1: candidate identity local

1. Acreditar HEAD limpio, `HEAD=origin/main`, divergencia `0/0` y
   `git diff --check` limpio.
2. Generar un request D72 nuevo para ese HEAD.
3. Construir una vez y congelar el artefacto fuera del worktree. Registrar
   `requestHash`, `policyHash`, `head` y `artifactHash`.
4. Sellar una `candidate identity` con esos bindings y con
   `deploymentAuthorized=false`, `deploymentExecuted=false`, `actIssued=false`
   y `riskAcceptanceRecorded=false`.

Esta fase local precede a la evidencia; no es un acta D72 ni una aceptación de
riesgos.

### Fase 2: certificación de evidencia

Las fuentes actuales de los veinte gates no-stateful se sellan contra el hash
de la candidate identity y, por transitividad, contra HEAD, request, policy y
artefacto. Sólo `20/20 PASS` produce `CERTIFIED` y
`canaryPreparationAllowed=true`. Un `FAIL` o `NOT_VERIFIED` produce
`REQUEST_AND_ARTIFACT_INVALIDATED`; ese request/artefacto no puede continuar al
canary y debe generarse una identidad nueva después de corregir la causa.
La revocación opaca actual es fail-closed dentro del proceso executor. No se
presenta como persistente entre reinicios; una reanudación debe reconstruir una
identidad nueva y toda su evidencia, o incorporar antes un ledger persistente.

El runner versionado ejecuta ambas fases en un único proceso para conservar las
capabilities opacas y evitar receipts reinyectados desde JSON:

```text
pnpm run release:open:exceptional:prepare-canary --request /ruta/absoluta/nueva.json
```

La ruta debe estar fuera del worktree, dentro de un directorio propio `0700`; el
runner crea el request una sola vez como archivo `0600`, congela el artefacto y
recién entonces ejecuta los collectors read-only. El build OPEN se crea con el
Node fijado mediante `scripts/cloudflare-build.mjs --d72-candidate-request`
antes del freeze; no se reutiliza un `dist/` previo. Ese modo valida los siete
riesgos solicitados como hechos pendientes, pero no los acepta y conserva
autorización, ejecución y aceptación de riesgos en `false`. Antes del build se
acreditan por hash, metadata y versión el Node, el pnpm content-addressed y
`/usr/bin/git`; un `PATH` del operador no selecciona esos ejecutables. Hay
lecturas Git hardened antes del request, después del build y después de sellar
la identidad. El orden productivo continúa con Supabase read-only y su
checkpoint, el collector compuesto, otra lectura Git fresca y la exigencia de
que los diecinueve gates previos al smoke estén PASS. Recién entonces ejecuta
una preprueba CLOSED GET-only sobre el guard exacto, el smoke CLOSED sólo si
esa preprueba termina PASS y la completitud post-smoke de la prueba de ausencia
de escritura; al final emite bundle y certificación. Un error Git
inicial termina antes del request, del build, del artefacto y de cualquier
consulta remota; un build fallido termina antes del freeze y de los collectors.
Una preprueba `FAIL`/`NOT_VERIFIED` omite el POST del smoke y bloquea la corrida.

La salida es un resumen saneado con los veinte estados, hashes, Deployment y
Version CLOSED, y conserva siempre `deploymentAuthorized=false`,
`deploymentExecuted=false`, `actIssued=false`,
`riskAcceptanceRecorded=false` y `remoteMutationExecuted=false`. El HTTP 503 no
se interpreta por sí solo como ausencia de escritura: ese source exige su prueba
separada, ligada a la misma identity, artifact, Deployment, Version y smoke. Si
falta o no coincide, `quality.production-smoke` queda `NOT_VERIFIED` y bloquea el
resultado.

### Fase 3: Version upload sin deployment

1. La primera autorización remota habilita únicamente `versions upload`.
2. El plan de upload contiene `candidateVersionId=null`, no contiene capability
   y conserva la candidata fuera de todo deployment, con cero tráfico.
3. El registro machine-readable versionado de Wrangler devuelve el Version ID
   real. Un parser estricto exige exactamente los eventos `wrangler-session` y
   `version-upload`, en ese orden y con el argv exacto; emite un receipt opaco,
   process-local. No se admiten placeholders, un ID anticipado ni una copia JSON
   del receipt. El executor crea el archivo temporal `0600`, lo lee de forma
   hardened y lo elimina al finalizar.
4. Antes de consumir la autorización, el mismo Wrangler fijado ejecuta
   `versions upload --dry-run --outfile` sobre el árbol congelado. El executor
   parsea el multipart local con una gramática cerrada y sella
   `uploadPayloadHash`: módulos por bytes/tipo/nombre, metadata y el inventario
   de assets calculado con el algoritmo BLAKE3 usado por Wrangler. Ese hash no
   se confunde con `artifactHash` ni con el ETag remoto.
5. Inmediatamente después de consumir la autorización y antes del child
   mutante, el executor vuelve a consultar y exige la misma Version CLOSED al
   `100%` y el mismo Deployment CLOSED. Un cambio concurrente invalida el
   intento antes de `versions upload`.
6. El child mutante recibe como `CLOUDFLARE_API_BASE_URL` un proxy efímero
   in-process ligado sólo a `127.0.0.1` y a un path aleatorio. El proxy permite
   GET y únicamente los POST exactos de sesión/upload de Static Assets y de
   creación de Version con `bindings_inherit=strict`; bloquea antes de red todo
   PATCH/PUT/DELETE y cualquier POST desconocido. Un intento bloqueado invalida
   el resultado aunque Wrangler lo capture como warning. El proxy no retiene
   headers ni bodies (incluidos Authorization/JWT), limita tamaños, no sigue
   redirects y se elimina al terminar. En producción es inseparable del child
   Wrangler fijado y además debe observar exactamente un POST de Version.
7. Un parser GET-only consume ese receipt, el manifest congelado validado, el
   GET raw de la Version y el snapshot raw del auditor CLOSED. Verifica el ID,
   Worker/cuenta, tag/message, bindings, tres secrets por nombre, configuración
   OPEN, dominios, `workers.dev=false`, `preview_urls=false`, cero crons activos
   y CLOSED todavía al 100%; luego emite una attestation opaca process-local.
   El executor revalida el árbol congelado completo y su manifest inmediatamente
   antes y después de cada child. El `artifactHash` sella únicamente ese árbol
   local: tag, message y ETag remoto no se reinterpretan como prueba de ese hash.
8. Además consulta el endpoint beta exacto de esa Version con
   `?include=modules`. Compara byte a byte y canónicamente cada módulo, main,
   bindings y configuración con el multipart local; el GET estable conserva el
   `resources.script.etag` como hecho remoto separado. El JWT de assets sólo se
   valida en memoria y nunca se imprime, registra, copia ni incorpora a hashes.
9. Sólo la prueba GET válida y completa permite derivar la capability HMAC, que
   queda ligada además al Version ID real.

El mismo proceso imprime primero un resumen saneado
`WAITING_UPLOAD_AUTHORIZATION` y conserva en memoria identity, certificación y
capabilities. Después de leer la frase exacta vuelve a acreditar Git limpio,
igual a `origin/main` y ligado al mismo HEAD inmediatamente antes del upload.
Tras subir y recertificar la Version real, sólo una prueba remota completa
permite leer `CRON_SECRET`; entonces imprime
`WAITING_ZERO_PERCENT_AUTHORIZATION`. Reiniciar el proceso invalida esas
autoridades opacas y exige regenerar identity y evidencia.

### Límite actual: bytes de Static Assets

El GET beta oficial devuelve para assets `config` y un JWT, pero no el manifest
path/hash ni los bytes que permitieron emitir ese JWT. El tooling sí calcula y
sella el inventario local exacto, y acredita módulos/config remotos, pero no
afirma que el JWT demuestre por sí solo igualdad de bytes. Para este Worker, que
usa Static Assets, el upload de la Version puede quedar creado y no adjunto; la
emisión de capability y el attach se bloquean después del GET con
`BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE`. La candidata sigue con cero
tráfico y CLOSED permanece al `100%`.

Remover ese bloqueo exige una evidencia API documentada que exponga el manifest
remoto o sellar/subir un payload que incluya una referencia verificable a ese
inventario. No se registra ni decodifica el JWT como sustituto, no se inventa un
algoritmo para el ETag y no se autoasigna `artifactHash` a metadata remota.

### Fase 4: asociación 100/0 y cleanup

1. Una segunda autorización remota, posterior al GET, habilita únicamente el
   deployment temporal CLOSED `100%` + candidata `0%`.
2. Ejecutar probes ordinarios y autorizados; ejecutar el manifiesto stateful
   sólo tras su tercera autorización separada.
3. Separar siempre la candidata mediante un deployment CLOSED `100%`, incluso
   después de PASS.

Un upload verificado pero todavía no adjunto no recibe tráfico. Si falla la
asociación, el cleanup sigue siendo una operación separada y sólo puede dejar el
deployment en CLOSED `100%`; la existencia de la Version subida no habilita su
uso ni autoriza OPEN.

## Artefacto y ciclo de vida

1. No reconstruir el artefacto después de crear la candidate identity. El
   canary, la recertificación D72 y un eventual cutover usan el mismo árbol
   congelado y su manifest.
2. Si ya existe el par artefacto/manifest, sólo puede reutilizarse tras validar
   ambos, sus permisos, bindings, formato canónico, inventario y hash. Un estado
   parcial, symlink, archivo extra/faltante o hash externo distinto bloquea.
3. El hash del artefacto observado por el canary debe suministrarse luego como
   ancla esperada. Sin esa ancla, la validación local demuestra consistencia
   interna y bindings, pero no pretende resistir una sustitución coherente de
   árbol y manifest por el mismo usuario del sistema.
4. Subir la candidata con el config OPEN congelado produce una Version pero no
   cambia triggers. La Version debe recuperar exactamente los tres secrets ya
   existentes por nombre; no se envía ningún `--secrets-file`.
5. La candidata queda como Version no desplegada tras el cleanup hasta el
   cutover o su eliminación en una operación futura expresamente autorizada.
6. Verificar que apex ordinario vuelve 503, `www` conserva 308, la candidata no
   integra el deployment activo y crons/domains/DNS no cambiaron.

Los únicos comandos mutantes permitidos por el plan futuro son:

```text
wrangler versions upload
wrangler versions deploy <closed-version>@100% <candidate-version>@0% --yes
wrangler versions deploy <closed-version>@100% --yes
```

El argv exacto se construye sin shell desde el Wrangler versionado, con config y
`--env-file` congelados y con el aprovisionamiento/auto-creación experimentales
desactivados explícitamente. `wrangler deploy`, `triggers`, `routes`, `domains`,
`secrets`, preview aliases y todo porcentaje distinto de `100/0` se rechazan.
Estos comandos se documentan para una ejecución posterior: **no se ejecutaron al
implementar este mecanismo**.

## Autorizaciones separadas

La primera autorización permite exclusivamente crear la Version sin deployment
ni tráfico. Está ligada también a policy, Worker y Version CLOSED actual:

```text
AUTORIZO CREAR VERSION CANARIA CLOUDFLARE D72 SIN DEPLOYMENT NI TRAFICO PARA <full-head> CON REQUEST <request-hash> POLICY <policy-hash> ARTEFACTO <artifact-hash> WORKER agorbis CLOSED <closed-version-id> AL CIEN POR CIENTO Y CANDIDATE AL CERO POR CIENTO
```

Después del upload y de la recertificación GET del Version ID real, la segunda
permite exclusivamente asociar CLOSED `100%` + candidata `0%` y ejecutar su
cleanup de infraestructura:

```text
AUTORIZO CANARY CLOUDFLARE D72 AL CERO POR CIENTO PARA <full-head> CON REQUEST <request-hash> POLICY <policy-hash> Y ARTEFACTO <artifact-hash> EN CUENTA <account-id> WORKER agorbis CLOSED DEPLOYMENT <closed-deployment-id> VERSION <closed-version-id> AL CIEN POR CIENTO Y CANDIDATE <candidate-version-id> AL CERO POR CIENTO CON CERTIFICACION <version-certification-hash>
```

La tercera permite las escrituras stateful enumeradas y su cleanup:

```text
AUTORIZO EJECUTAR EL MANIFIESTO STATEFUL D72 <manifest-hash> EN PRODUCCIÓN PARA <full-head> CON CANARY <canary-id> Y SU LIMPIEZA CONTROLADA
```

Las tres deben leerse literalmente desde `/dev/tty` y el receipt conserva sólo
el hash de cada declaración y su timestamp. Los tokens de autorización son
opacos y de consumo único dentro del proceso executor; esa protección local no
se presenta como un ledger persistente ni como prevención de replay remoto. El
grant de capability tampoco expone el bearer ni acepta que el caller suministre
un token o `CRON_SECRET`: ambos quedan sólo en el `WeakMap` del proceso que hizo
la recertificación GET. El primer intento de attach consume ese grant antes de
la operación remota y un segundo intento local se rechaza antes de mutar. El
token HTTP sigue siendo una credencial de sesión vigente, no un nonce con
retirement global en el Worker stateless; deja de dirigir requests a la
candidata cuando el cleanup la retira del deployment. Un receipt canario siempre
contiene:

```text
deploymentAuthorized=false
deploymentExecuted=false
```

El deploy OPEN exige posteriormente su propia confirmación D72. Un canary PASS
no satisface ni implica esa confirmación.

Cloudflare no permite recuperar el valor de un Worker Secret. Para emitir la
capability, el executor lee el `CRON_SECRET` vigente exclusivamente desde
`/dev/tty` con echo deshabilitado, lo conserva como `Buffer` efímero y lo borra
en éxito o error. No puede obtenerlo del API, heredarlo del entorno general,
imprimirlo ni escribirlo. El lector inyectable existe sólo bajo `testOnly`; si
la custodia no está disponible, el canary queda bloqueado y no se rota ni agrega
un secret como atajo. La capability sólo se emite después de la certificación
GET opaca y de la prueba remota de bytes/config.

## Probes de infraestructura

Con el deployment 100/0 ya adjunto:

1. Request ordinario a apex sin headers: 503 CLOSED.
2. Override candidato sin capability: 403.
3. Override candidato con capability inválida: 403.
4. Override + capability válidos a `/`: 200, marcador canario, no-store/noindex.
5. Override + capability válidos a `/internal/health/`: 200.
6. Los cinco endpoints cron sin su bearer secret: 401 cada uno. No se ejecuta
   ningún job y no se activa ningún Cron Trigger.
7. `www` con path/query: 308 exacto a apex conservando ambos.
8. Tras detach, apex ordinario: 503. Un override a una Version ya fuera del
   deployment cae nuevamente en el reparto activo y debe observar CLOSED 503.

Cada status, Version ID observado y digest se guarda saneado. Nunca se guardan
headers operativos ni cuerpos de respuesta.

## Cuenta canaria y datos

Se usa una sola cuenta controlada por corrida, identificada en memoria mediante
un `canaryId` aleatorio y un tag no público. La dirección de la casilla, UUID de
Auth, session IDs, claves de Storage y URLs de confirmación/recuperación no se
persisten en el acta.

Preparación, aún no ejecutada:

1. Reservar una casilla controlada y vacía para la corrida. No usar alias ni
   cuentas de personas reales.
2. Mantener email/password/códigos/PKCE verifier/TOTP seed sólo en memoria.
3. Crear signup por el handler Agorbis con una respuesta Turnstile A fresca.
4. Recibir confirmación, validar redirect exacto, completar PKCE, onboarding y
   residencia; iniciar sesión y recuperación.
5. Verificar MFA/TOTP hasta AAL2 y eliminar el factor antes de borrar la cuenta.
6. Crear todo contenido cívico bajo un único fixture padre aislado. El voto D68
   es irreversible dentro de ese fixture; el cleanup elimina el padre completo
   mediante el procedimiento service-role exacto para que las relaciones
   canarias desaparezcan en cascada, sin tocar contenido real.
7. Para el rechazo Storage de otro usuario sólo puede usarse un sentinel
   controlado preexistente. Si no existe, esa comprobación queda
   `NOT_VERIFIED`; no se crea un segundo usuario sin otra autorización.
8. Cleanup por IDs exactos conservados sólo en memoria: objeto Storage, filas
   cívicas en orden inverso, factores/sesiones y, al final, identidad Auth.
9. Consultar por hashes/IDs saneados que no quede objeto, fila, sesión, factor ni
   identidad residual. Si algo queda, el check y el canary son FAIL y se vuelve
   a CLOSED; no se declara cleanup completo.

Las credenciales service-role/Admin sólo pueden vivir dentro del futuro executor
stateful autorizado. Nunca se entregan al navegador ni a un log.

## Turnstile A y B

Son escenarios independientes:

- **A** obtiene una respuesta nueva en el widget real, llama al handler Agorbis
  y exige `Siteverify success`, `action` exacta y hostname permitido. Una
  repetición de esa misma respuesta debe ser rechazada.
- **B** llama directamente a Supabase Auth con la publishable key, sin CAPTCHA.
  Debe resultar en `captcha_failed` o la clase canónica equivalente y no debe
  crear sesión. No recibe ni reutiliza la respuesta de A.

La evidencia guarda sólo clases de resultado y booleanos. Respuestas Turnstile,
publishable request bodies y respuestas crudas nunca se conservan.

## Auth, SMTP, PKCE, cookies y MFA

La corrida stateful exige, en ese orden, signup, entrega de confirmación,
confirmación, login, solicitud y entrega de recuperación, recuperación y callback
PKCE. Los redirect origins deben coincidir exactamente con los permitidos.

Se verifica que las cookies de sesión relevantes tengan `Secure`, `HttpOnly` y
`SameSite=Lax`, que un code/verifier ausente o repetido sea rechazado y que no se
persistan provider tokens. MFA/TOTP debe estar disponible y una sesión AAL2 debe
observarse. El seed TOTP no se incorpora a evidencia.

No basta comprobar que Supabase tiene SMTP configurado: los dos mensajes deben
llegar a la casilla canaria dentro de la corrida autorizada. Hasta entonces el
gate SMTP permanece `NOT_VERIFIED`.

## Storage privado

El fixture es un archivo pequeño, generado para la corrida y no sensible:

1. Upload autenticado a un path privado ligado a la cuenta canaria.
2. Lectura directa sin sesión rechazada.
3. Lectura autenticada mediante el proxy Agorbis exitosa.
4. Lectura por el sentinel ajeno rechazada; si no hay sentinel, `NOT_VERIFIED`.
5. Eliminación por clave exacta y comprobación de cero objetos residuales.

Nunca se guarda el archivo, su key, una signed URL ni un token en el receipt.

## Evidencia 27/27

`non-waivable-gate-evidence-catalog.mjs` es la matriz canónica. Cada entrada
define ID, fuentes, harness/comando, scope local/remoto, efecto read-only o
stateful, prerequisitos, PASS/FAIL/NOT_VERIFIED y campos saneados.

Los siete gates que requieren ejecución canaria para poder ser PASS son:

- `security.auth-functional`;
- `operations.smtp-functional`;
- `security.turnstile-a`;
- `security.turnstile-b`;
- `security.private-storage`;
- `security.csp`;
- `security.cookies`.

Los otros veinte se acreditan con evidencia local y/o lecturas remotas actuales:
Git/recovery, secret scan, ledger/dry-run, catálogos e integridad Supabase,
RLS/grants, residencia, D68, antiabuso, suite, inventario/configuración
Cloudflare, DNS GET-only, smoke CLOSED, Google Auth/IA deshabilitados y copy legal
activa. Una fuente faltante produce `NOT_VERIFIED`, no PASS.

El receipt 27/27 sólo deriva PASS cuando todas las fuentes exactas de un gate son
PASS en la misma ventana y con los mismos bindings. Para los siete anteriores,
además exige `canaryExecuted=true` y el hash del reporte stateful. No admite
`RISK_ACCEPTED_BY_OWNER`, `BLOCKED_EXTERNAL` ni ninguna waiver. Los siete riesgos
D72 se procesan fuera de este receipt y nunca pueden convertirse en PASS.

## Redacción y logging

Sólo se permiten IDs de escenario, clases de outcome, booleanos, contadores,
hashes no reversibles y timestamps UTC. Se prohíbe guardar o imprimir:

- email o UUID de usuario;
- password, cookie, session/authorization code o provider token;
- URL de confirmación/recuperación, OTP o TOTP seed;
- respuesta Turnstile o payload/respuesta crudos;
- key, objeto o signed URL de Storage;
- capability HMAC, `CRON_SECRET`, `SUPABASE_SECRET_KEY` o
  `TURNSTILE_SECRET`.

Un nombre de campo que sugiera cualquiera de esos datos invalida el reporte. El
receipt conserva hashes de manifest/autorización/evidencia, nunca sus secretos.

## Estado previo a una ejecución futura

Antes de pedir la primera autorización deben ser actuales y PASS: HEAD limpio y
recuperable, request/policy válidos, artefacto congelado, Worker/cuenta exactos,
tres Worker Secrets por nombre, bindings/domains/workers.dev/preview/DNS/crons
sin drift, ledger `0001–0058 + 0060 + 0061`, 0059 ausente, dry-run sin migraciones y
auditores read-only saneados.

Esta documentación no autoriza a consultar ni mutar Producción. La ejecución
remota sólo comienza después de las frases literales correspondientes.
