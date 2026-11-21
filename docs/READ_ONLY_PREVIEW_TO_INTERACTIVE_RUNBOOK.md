# Agorbis · runbook de preview read-only a producción interactiva

> **ESTADO: PREPARADO, NO EJECUTADO.** Este procedimiento no autoriza el cambio
> de modo, ninguna migración ni Cloudflare Cron Trigger. La preview pública debe
> permanecer read-only hasta una autorización posterior explícita.

D72 incorpora una política excepcional que coexiste con el camino normal. Su
runner de certificación es exclusivamente dry-run: valida una solicitud,
obtiene confirmaciones individuales y produce actas locales sin desplegar. Un
consumidor separado y de un solo uso puede ejecutar el cutover sólo después de
la autorización final literal.
No se debe simular una excepción cambiando variables, editando resultados o
saltando comandos del runner normal.

La política `D72/2026-11-01/v6` usa el hash
`59f6283b36a2805ee73710d6f1223d3c98385cf732d72e3eba31dcab4053c03e` y fija
`authorizedRiskOwner=Sebastian Cardoso Castillo` exactamente. Un request con
otro owner, versión o hash queda bloqueado.

La revisión v4 recoge la solicitud del responsable de priorizar la apertura
con AAIP pendiente y ubicaciones, retención y salvaguardas externas pendientes,
después de explicarse sus consecuencias. La próxima revisión es obligatoria
el 14-09-2026 UTC. Se conservan los resultados de los siete riesgos y los 27
controles no renunciables; esta constancia no afirma conformidad jurídica ni
sustituye confirmaciones `/dev/tty` o un acta D72 válida.

La revisión v6 (D106) sólo mueve esa fecha, ya vencida, al 30-11-2026 UTC.

La revisión v5 reemplaza el requisito de Google apagado por el gate no
renunciable `configuration.auth-providers-aligned`. El perfil abierto previsto
debe alinear Google habilitado, Facebook deshabilitado y correo disponible
entre inventario, artefacto, Worker y Supabase. Google sigue bloqueado hasta
acreditar sus ubicaciones ES/EN y consentimiento versionado; el aviso
`2026-08-29.1` lo excluye. Facebook en pausa no agrega requisitos para Google.
La revisión de la política no aprueba evidencia, pruebas reales ni un release.

Este runbook describe la transición desde preview a modo interactivo. Para
habilitar o retirar Google en un sitio que ya está abierto, seguir el
[plan específico](google-production-readiness.md), que conserva correo y modo
abierto durante la reversión del proveedor.

| Política    | Resultado exigido                                                         | Acta                                       | Efecto de este runbook                                     |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Normal      | Todos los gates de apertura en `PASS`                                     | Evidencia ordinaria del corte              | Requiere autorización posterior para migrar/desplegar      |
| Excepcional | No renunciables en `PASS`; riesgos elegibles conservan su fallo/pendiente | Una fila aceptada por riesgo, owner y HEAD | Acta dry-run; cutover separado, expirante y de un solo uso |

`RISK_ACCEPTED_BY_OWNER` nunca significa `PASS`. No existe una aceptación
global, y un acta de otro HEAD no es reutilizable.

## Perfiles y fuentes de verdad

| Perfil                    | Config esperada                   | Escrituras                                                             | Auth/cookies/emails                  | Crons |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ | ----- |
| Cerrado                   | `wrangler.closed.jsonc`           | Ninguna                                                                | Ninguno                              | 0     |
| Preview pública read-only | `wrangler.readonly-preview.jsonc` | Ninguna; gate Worker y barrera DB/Auth verificadas                     | No crea sesión/cookie ni envía email | 0     |
| Interactivo               | `wrangler.jsonc`                  | Sólo operaciones autorizadas por sesión, consentimiento, RLS y límites | Habilitados según flujo              | 5     |

Los comandos versionados son `build.cloudflare:readonly-preview`,
`deploy:readonly-preview`, `deploy:readonly-preview:dry-run`,
`preflight:readonly-preview` y `smoke:readonly-preview`. Antes de usar este
documento, verificarlos literalmente contra `package.json`; no sustituir un
comando faltante con un `wrangler deploy` improvisado.

El rollback de seguridad es el perfil cerrado 503, no “ocultar botones”. El
rollback read-only es el perfil preview. Ambos deben conservar `crons: []`.

## Evidencia que se congela durante la preview

Conservar fuera del repositorio, sin secretos:

- commit y SHA del artefacto read-only;
- deployment/version ID del Worker preview y del último Worker cerrado 503;
- export/config de `wrangler.readonly-preview.jsonc` y
  `wrangler.closed.jsonc`;
- resultado del build, preflight, secret scan y smoke;
- prueba de cero Cron Triggers;
- matriz de rutas públicas admitidas y rutas/métodos bloqueados;
- evidencia de que no aparece `Set-Cookie`, no se llama Auth/SMTP y no se
  procesa un body en rutas bloqueadas; y
- timestamps y resultados del período de observación.

Nunca archivar cookies, JWT, tokens Turnstile, valores de Worker Secrets,
bodies, correos ni identificadores personales.

## Checkpoint 1 — cambios de producto y base, todavía locales

1. Revisar el borrador `0059` de consentimiento específico y versionado para
   participación capaz de revelar datos sensibles. Permanece aislado en
   `supabase/migration-drafts`, fuera del baseline y del ledger. Sólo después de
   una aprobación y autorización separadas podrá moverse al directorio de
   migraciones ejecutables. La migración debe:
   - separar esa decisión de Términos, Privacidad, edad y transferencias;
   - almacenar usuario, versión, hash, idioma/origen y hora sin registrar el
     contenido sensible de la participación;
   - exigir la versión vigente en DB antes de votos, comentarios, debates,
     encuestas, reclamos, proyectos, compromisos, membresías, reportes y uploads
     definidos por el producto;
   - permitir negar/retirar y mantener lectura pública; y
   - fallar cerrado si no hay versión vigente o si cambia el texto/hash.

   En Fase A no aplicar `0059`. Si una autorización excepcional futura decide
   omitirla, conservar
   `SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS=draft_not_applied`, enumerar las
   superficies afectadas y registrar `RISK_ACCEPTED_BY_OWNER` para ese gate.
   No marcarlo `PASS` ni presentar la omisión como jurídicamente conforme.

2. Revisar una migración separada de retención basada en
   `RETENTION_ANONYMIZATION_ONE_YEAR_PROPOSAL.md`. No mezclar la interpretación
   del año dentro de `0059`.
3. Después de aprobarlas, aplicar ambas únicamente en Supabase local desde cero,
   regenerar tipos y ejecutar lint SQL, RLS, pruebas de participación,
   supresión, Storage y restore. Mientras `0059` siga como borrador, su runner
   efímero requiere autorización puntual y no altera el ledger
   `0001`–`0058` + `0060` + `0061`.
4. Preparar el dry-run cloud con destino explícito y sin seed, roles ni Vault:

   ```bash
   pnpm exec supabase migration list \
     --project-ref "ibtvlvpxwourrxwcrfkf"

   pnpm exec supabase db push \
     --project-ref "ibtvlvpxwourrxwcrfkf" \
     --dry-run \
     --skip-vault
   ```

5. Mostrar el resultado exacto y obtener autorización puntual. No usar
   `--linked`. Si aparecen migraciones distintas de las revisadas, detenerse.

## Checkpoint 2 — requisitos reales antes del modo interactivo

Confirmar sólo requisitos que previenen incumplimiento legal/contractual,
pérdida de datos, vulnerabilidad, exposición de secretos o fallo funcional
crítico:

- instrumento argentino válido para las transferencias reales a Cloudflare,
  Supabase y Resend; para el DPA alternativo de Cloudflare, conservar la
  presentación/aprobación o fundamento jurídico aplicable;
- estado AAIP y textos públicos que no llamen “registro” al expediente `EX-...`;
- interpretación de retención implementada y compatible con la declaración o
  su rectificación, incluidos proveedores;
- recuperación de Producción aceptada según la decisión de riesgo vigente;
- `0059` y la política de retención aprobadas/aplicadas exactamente una vez;
- secretos dedicados en Worker, Legacy Supabase inactiva, Turnstile A/B, SMTP y
  Auth efectivos; y
- responsable disponible para corte, rollback, incidentes y moderación.

No agregar como bloqueo herramientas, copias o hardening opcional que no eviten
uno de esos riesgos concretos.

En la política normal, todos los puntos anteriores son `GATE_REQUIRED`. La
política excepcional admite `WAIVER_POLICY=OWNER_EXPLICIT` sólo para siete IDs:
AAIP pendiente, retención no reconciliada, ubicaciones de proveedores no
verificadas, retención de proveedores no verificada, salvaguardas no
verificadas, backup productivo no verificado y omisión de `0059`. La lista
exacta está en el checklist; un wildcard o ID adicional bloquea.

Auth y SMTP; Turnstile A y B; RLS y Storage; privacidad de boletas, residencia y
antiabuso; CSP y cookies; migraciones e integridad; secret scan, build/tests e
inventario de secretos; DNS, dominios, bindings y crons; HEAD recuperable,
smoke cerrado y ausencia de configuración desconocida son gates
`NON_WAIVABLE_SECURITY_GATE` separados.

Estados especiales que el acta no puede embellecer:

- AAIP `pending`: sin registration ID y con la inscripción comunicada sólo
  como “en trámite”; `approved` exige el ID real y rechaza `RL`, `EX`, `RE`,
  `PV`, `IF`, placeholders o estados pendientes.
- Backup: `PRODUCTION_BACKUP_STATUS=not_verified`; no existe evidencia de un
  primer backup productivo por registrar.
- Google Drive: subestado informativo `inactive`; no hay OAuth, sincronización,
  upload, descarga ni restore acreditados. No es un gate aceptable separado;
  activarlo debe bloquear como configuración desconocida.
- `0059`: `draft_not_applied`, fuera del ledger ejecutable
  `0001`–`0058` + `0060` + `0061`.

## Checkpoint 3 — dry-run de Producción interactiva

1. Trabajar sobre un commit limpio, versionado y escaneado, materializado en el
   worktree y store nuevos del
   [runbook de producción](PRODUCTION_RUNBOOK.md#materialización-reproducible-del-release).
   Confirmar Node `22.22.0`, lockfile congelado y las versiones pinneadas; no
   reutilizar el `node_modules` ni el store pnpm del checkout habitual.
2. Verificar que `wrangler.jsonc` mantiene exactamente:
   - `agorbis.com` y `www.agorbis.com` como Custom Domains;
   - `workers_dev=false`, `preview_urls=false`;
   - `run_worker_first=true` y binding `ASSETS`;
   - `AGORBIS_LAUNCH_MODE="open"`;
   - los tres Worker Secrets sólo como bindings; y
   - los cinco schedules exactos:

     | UTC          | Handler interno                       |
     | ------------ | ------------------------------------- |
     | `10 * * * *` | `/internal/process-account-deletions` |
     | `5 0 * * *`  | `/internal/sync-notifications`        |
     | `25 0 * * *` | `/internal/escalate-claims`           |
     | `20 3 * * *` | `/internal/cleanup-claim-uploads`     |
     | `40 3 * * *` | `/internal/purge-retained-data`       |

3. Consultar el inventario remoto sólo por nombre/tipo y confirmar
   `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET` y `CRON_SECRET`; nunca leer o
   imprimir valores.
4. Ejecutar la suite local completa y el gate abierto:

   ```bash
   # `pnpm verify` = lint + test + test.release. Desde el contrato v11 `lint`
   # solo ya no corre vitest ni los gates de release (D77).
   pnpm verify
   pnpm build.types
   pnpm test.components
   pnpm run release:open:dry-run --execute-dry-run
   ```

   El último comando pide secretos por `/dev/tty`, arma el entorno público
   versionado, ejecuta build/preflight y termina en el dry-run de Wrangler. No
   copiar valores desde un shell history.

5. Inspeccionar el artefacto: no contener secretos, claves B, source maps con
   datos, rutas internas indexables ni valores legales pendientes. Confirmar
   que cookies Auth sólo pueden emitirse en el perfil abierto.
6. Capturar la salida del dry-run y el diff de configuración. No desplegar si
   cambia DNS/email, agrega bindings desconocidos o propone más/menos de cinco
   triggers.

Cloudflare documenta que los cambios de Cron Triggers pueden tardar algunos
minutos en propagarse; no asumir que el deploy equivale a la primera ejecución:
[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

### Checkpoint 3A — acta excepcional de Fase A

El runner normal sigue bloqueando los riesgos no resueltos. Para preparar el
acta excepcional, crear un request JSON con `schemaVersion`, `policyVersion`,
`policyHash`, `head`, `owner`, `timestampUtc`,
`deploymentAuthorized:false` y `risks`. Cada riesgo contiene `gateId`,
`evidenceStatus`, `rawResult`,
`requestedDisposition=RISK_ACCEPTED_BY_OWNER`, `acceptedConsequence` y
`reviewRequiredBy`. No incluir confirmaciones prefirmadas.

Ejecutar sólo:

```bash
pnpm run release:open:exceptional:dry-run --request <ruta>
```

`<ruta>` debe ser absoluta y estar fuera del worktree. Su directorio padre debe
pertenecer al usuario efectivo y tener modo exacto `0700`; actas, artifact y
manifest usan `0600` y no invalidan el HEAD limpio auditado.

Antes del primer subproceso, el runner valida el contrato versionado
`agorbis-exceptional-release-scripts/v12` de los scripts de `package.json` usados
por la Fase K y por el build. El SHA-256 exigido es
`6f221d2a7faf949b2eb456ba41a58c524c2531283b055873f227200024f93314` y
`cloudflare-build` lo vuelve a comprobar inmediatamente antes de `pnpm build`.
Una diferencia bloquea; no se acepta como waiver ni se ejecuta el subproceso
afectado.

Con ese contrato válido se intentan las trece validaciones locales de
`scripts/run-exceptional-release-local-gates.mjs`, acumulando fallos en vez de
hacer fail-fast: `pnpm lint`, `pnpm test`, `pnpm test.release`,
`pnpm build.types`, `pnpm audit --audit-level=low`, `pnpm db.test`,
`pnpm test.civic`, `pnpm test.components`, `pnpm test.e2e`,
`pnpm test.canary`, `pnpm test.release-open`, `pnpm test.preflight` y
`node scripts/test-cloudflare-public-build-environment.mjs`.

Los dos pasos finales de Wrangler quedan fijados a `versions upload --dry-run
--strict` y `triggers deploy --dry-run`, ambos sobre el artifact congelado y
con `--config`, `--cwd` y env vacío explícitos. No se permiten rutas o
argumentos alternativos, y el runner no solicita ni hereda Worker Secrets.

El runner solicita por `/dev/tty` una confirmación por riesgo, rechaza waivers
globales, wildcards, placeholders, IDs desconocidos y cualquier intento de
aceptar un `NON_WAIVABLE_SECURITY_GATE`. Enumera todos los gates, conserva
`RAW_RESULT` y `EVIDENCE_STATUS`, y crea junto al request, sin overwrite y con
modo `0600`, `<nombre-sin-.json>.act.json` y
`<nombre-sin-.json>.act.md`.

Entre los controles no renunciables está
`legal.pending-external-copy-honest`. El bundle usa las versiones ES/EN
`2026-08-29.1`; el draft histórico permanece inmutable. En el estado D72
vigente, 0060 fue autorizada, aplicada y verificada en Producción. La consulta
remota del 06-09-2026 confirmó el ledger exacto `0001`–`0058` + `0060` + `0061`
(60/60): 0061 ya estaba aplicada y el dry-run devolvió `upToDate: true`. No se
ejecutaron migraciones remotas durante esa verificación. 0059 permanece fuera
del ledger y sólo en `migration-drafts`. El gate sólo puede promoverse a
`PASS` cuando ledger, fase local y build/preflight acreditan versiones,
snapshots y hashes. Cualquier diferencia permanece `STOP` y no admite
aceptación de riesgo.

La frase exacta de cada fila es
`ACEPTO EL RIESGO <gate-id> PARA <full-head>`. Para
`legal.sensitive-consent-0059-omitted` se debe escribir además, por separado,
`ACEPTO ADEMÁS QUE AGORBIS NO DEBE DESCRIBIRSE COMO JURÍDICAMENTE CONFORME PARA <full-head>`.

El JSON del acta contiene `schemaVersion`, `policyVersion`, `policyHash`,
`head`, `owner`, `timestampUtc`, `expiresAtUtc`, `requestHash`,
`artifactHash`, `gates[]`, `commands[]`,
`deploymentAuthorized:false`, `deploymentExecuted:false`,
`productionMutationCommandsExecuted:false` y `contentSha256`. Cada gate
conserva `gateId`, `evidenceStatus`, `rawResult`, `gatePolicy`,
`releaseDisposition`, `severity`, `acceptedConsequence`, `confirmation`,
`reviewRequiredBy` y `facts`. `facts` es `null` salvo para los subestados
canónicos de AAIP pendiente, backup/Drive inactivos y `0059` omitida;
`commands[]` contiene sólo label y exit code, nunca
argumentos, entorno ni secretos.

Interpretar el exit literalmente:

| Exit | Significado                                                                  |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | Todos los gates en `PASS` y cero excepciones.                                |
| `20` | Dry-run completo con al menos un riesgo aceptado; imprime `ESTO NO ES PASS`. |
| `1`  | Gate o ejecución bloqueada.                                                  |
| `2`  | Request o uso inválido.                                                      |

`20` no equivale a `0` ni autoriza un deployment. El runner termina con
`NO_DEPLOY`, sin aplicar migraciones, habilitar altas o tocar Cloudflare,
Supabase Cloud, DNS o crons.
La tabla no promete que la corrida actual alcance `20`: cada gate exige su
evidencia individual y un paso agregado exitoso no fabrica `PASS`. Si cualquier
`NON_WAIVABLE_SECURITY_GATE` sigue `FAIL` o `NOT_VERIFIED`, el dry-run enumera la
matriz, termina con exit `1` y no crea acta.

El gate `quality.production-smoke` sólo puede usar evidencia del perfil
productivo actualmente cerrado: GET, HEAD y POST deben devolver 503 fail-closed
con headers/cookies esperados. Su `PASS` no acredita el perfil interactivo; un
deployment futuro exige otro smoke post-deploy. El smoke cerrado y el audit de
configuración Cloudflare son read-only respecto de la configuración remota: el
primero envía GET/HEAD/POST al perfil 503 y observa la respuesta HTTP
fail-closed; el segundo usa sólo API GET. El status HTTP no demuestra por sí
solo la ausencia de escrituras. Aunque los probes HTTP terminen correctamente,
`quality.production-smoke` permanece `NOT_VERIFIED` hasta que evidencia
DB/artefacto separada acredite que el POST no escribió. Si falta esa evidencia
o la respuesta no es 503 fail-closed, el gate termina en `STOP`.
La sonda `POST /registro/` sólo se envía si las comprobaciones GET y HEAD
anteriores acreditaron ese perfil cerrado; cuando esa auditoría previa falla,
el POST se omite.

Ningún HEAD histórico autoriza un corte futuro. Request, artifact, acta,
confirmación y claim deben referir el mismo HEAD actual completo.

## Checkpoint 4 — secuencia de corte autorizada

Esta sección exige una autorización explícita que nombre migraciones y
deployment abierto. **D72/Fase A no es esa autorización**: no ejecutar esta
sección durante el dry-run excepcional ni desde el runner de acta.

1. Anunciar ventana y mantener a mano el comando cerrado. Registrar IDs actuales
   de preview y 503.
2. Aplicar sólo las migraciones autorizadas usando
   `--project-ref "ibtvlvpxwourrxwcrfkf" --skip-vault`, nunca `--linked`, seed,
   roles o Vault.
3. Verificar ledger exacto, `db lint`, diff, RLS, funciones, consentimientos,
   retention jobs, Auth y Storage. Ante una diferencia, detenerse antes del
   Worker.
4. Si las altas de Supabase fueron deshabilitadas para la preview, mantenerlas
   deshabilitadas durante el deploy del Worker. El perfil abierto debe poder
   servir lectura y devolver un error controlado de mantenimiento, no saltarse
   el gate.
5. Desplegar desde el script versionado, no con parámetros ad hoc:

   ```bash
   pnpm run release:open:exceptional:cutover \
     --request <misma-ruta-absoluta.json> \
     --act-hash <actHash>
   ```

   El dry-run habrá emitido además el issuance externo `0600` en
   `~/.local/state/agorbis/exceptional-cutovers/issued/<requestHash>.issued.json`.
   Liga acta JSON, Markdown y artifact, y el `actHash` de CLI debe coincidir con
   él. El consumidor vuelve a verificar HEAD/origin, acta, artifact, issuance y
   perfil closed. Con GET paginados de Versions exige que HEAD/acta/artifact no
   tengan marker previo; bajo el lock publica y relee durablemente una cápsula
   CLOSED atómica. Sólo entonces pide por `/dev/tty` la frase exacta
   `AUTORIZO DEPLOY OPEN DE AGORBIS PARA <full-head> CON ACTA <act-hash>`, vuelve
   a comprobar el bundle, CLOSED, marker y cápsula, y crea un claim `0600` en el
   path canónico del usuario efectivo, sin aceptar un `XDG_STATE_HOME`
   alternativo. Sube sólo la versión congelada con tag HEAD y digest de
   cuenta/Worker/request/policy/acta/artifact. GET del UUID y otro inventario
   completo deben demostrar un único marker antes de crons y promoción. Luego
   valida el estado transitorio closed con cinco crons y mueve 100 % del tráfico
   a ese Version ID. Ante un fallo espera primero la muerte confirmada de
   cualquier hijo Wrangler, inspecciona el marker, restaura el Version ID closed
   auditado, reconcilia crons a cero y exige nuevamente el perfil cerrado.

   Un marker previo, duplicado o incierto bloquea y consume el acta; no se
   reanuda ese bundle: exige nuevo HEAD y recertificación completa con otro
   request/artifact/acta/issuance. OPEN y recovery comparten el lock global
   `agorbis.production-mutation.lock`, heredado por todos los hijos Wrangler
   mutantes. Claim más marker cierran replay secuencial, pero Versions no ofrece
   compare-and-swap remoto: ejecutar desde un único host, operador y UID
   designados y confiables.

   Si un crash dejó incierto el rollback posterior al claim, la recuperación
   independiente no usa el artifact ni la expiración del acta:

   ```bash
   pnpm run release:open:exceptional:recover-closed \
     --request-hash <requestHash> \
     --act-hash <actHash>
   ```

   Exige por `/dev/tty` `AUTORIZO RECOVERY CLOSED DE AGORBIS PARA <requestHash>
CON ACTA <actHash>` y restaura únicamente el Version ID closed ligado más
   cero crons. El pointer de cápsula es un hardlink: preservar hardlinks al
   copiar/restaurar el state root (`tar` o `rsync -H`).

6. Confirmar que el deployment activo corresponde al commit/artefacto probado,
   que hay exactamente cinco Cron Triggers y que los Custom Domains no
   cambiaron.
7. Habilitar altas sólo después de comprobar el gate abierto, si ésa fue la
   configuración acordada. Revalidar CAPTCHA B, límites, SMTP, confirmación y
   redirects antes de la primera cuenta real.
8. Ejecutar smoke controlado con cuentas desechables y sin registrar secretos:
   - lectura pública y `www` 308 preservando path/query;
   - registro legítimo mediante Turnstile A y handler server-only;
   - llamada directa publishable sin CAPTCHA rechazada por B;
   - confirmación, login, magic link y recuperación;
   - cookie Secure/HttpOnly/SameSite y callback PKCE sin provider tokens;
   - copy legal honesta activa y ausencia de `0059` conservada como riesgo
     aceptado, sin simular ese consentimiento;
   - voto, comentario, reclamo/upload y baja sólo en casos controlados;
   - RLS directo sin autorización rechazado;
   - endpoints cron 401 sin secreto; y
   - corrida manual autorizada de cada job o espera de su schedule con métricas
     agregadas, sin PII.
9. Observar errores, latencia, emails, Auth, Storage, backlog y crons durante la
   ventana definida. No usar logs con bodies, query secrets, cookies, emails o
   IDs.

## Rollback inmediato

### A 503 cerrado

Ante exposición, escritura indebida, secreto, corrupción, fallo Auth/RLS o
incumplimiento de consentimiento:

1. desplegar el script cerrado versionado:

   ```bash
   pnpm deploy:closed
   ```

2. confirmar 503 en apex, 308 en `www`, `crons: []` y ausencia de `Set-Cookie`;
3. deshabilitar nuevas altas en Supabase si estaban abiertas;
4. si el incidente implica escrituras directas con sesiones ya emitidas,
   revocar sesiones/credenciales mediante mecanismos soportados y activar el
   kill switch DB diseñado para el corte; el Worker 503 no bloquea por sí solo
   acceso directo a Supabase;
5. preservar logs mínimos, request IDs y tiempos sin PII; y
6. no reabrir hasta corregir, probar local y obtener nueva autorización.

### A preview read-only

Si el defecto sólo afecta funciones interactivas y no existe riesgo de sesión
directa, desplegar el script preview versionado:

```bash
pnpm deploy:readonly-preview
```

Confirmar nuevamente cero crons, bloqueo global de métodos/rutas mutantes, sin
Auth/cookies/email y smoke read-only completo. Un `wrangler rollback` de código
no sustituye la verificación de bindings y triggers actuales; el perfil debe
redeployarse con su configuración conocida.

## Criterio de cierre del cambio

El modo interactivo está completo sólo cuando:

- migraciones y configuración efectiva coinciden con lo autorizado;
- smoke legítimo y ataques directos pasan/fallan como corresponde;
- los cinco crons tienen ejecución y monitoreo verificables;
- no hay regresión de secretos, cookies, RLS, Storage, CSP o redirects;
- textos legales y registro de proveedores describen el tratamiento real; y
- el responsable acepta expresamente el resultado.

Una preparación excepcional termina antes: con el acta revisada, todos los
gates no renunciables en `PASS`, cada riesgo residual atribuido y `NO_DEPLOY`.
El cutover posterior exige el mismo bundle no modificado, un acta de menos de
60 minutos y la frase final por `/dev/tty`; crea un claim atómico antes de toda
mutación y no permite reutilizar el acta. Ninguna de estas etapas convierte los
riesgos aceptados en `PASS` ni demuestra cumplimiento jurídico.

Hasta entonces, conservar la preview pública read-only o el 503. Este runbook no
autoriza por sí mismo abrir las funciones interactivas.
