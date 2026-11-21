# Inventario recuperable de configuración

Este documento define qué hace falta conservar para reconstruir Agorbis sin
depender de la memoria de una persona ni de secretos dentro del repositorio.
Es una especificación de recuperación, no una exportación del estado cloud.

## Actualización del candidato, 9 de septiembre de 2026

El candidato incorpora `0062`–`0067`: 66 migraciones exactas
(`0001`–`0058` + `0060`–`0067`), sin `0059`. `0066` prepara avisos,
consentimientos y barreras de retiro de Google, inicialmente vacíos; no aprueba
un texto ni habilita el proveedor. Su esquema, funciones, trigger y permisos
deben incluirse en backup/restore. `0067` incorpora el aviso Google aprobado
`2026-09-09.1`, sin insertar aceptaciones de usuarios. El inventario candidato
requiere evidencia nueva bajo la política Supabase read-only D72 `v4`.

Los estados `post-0065` (64) y `post-0066` (65) conservan sus migraciones y
hashes; el nuevo es `post-0067`, con 66. Nunca sustituir uno por otro al recuperar. La última
observación productiva documentada corresponde a 60 migraciones hasta `0061`;
el candidato no fue aplicado por este trabajo. Los estados históricos de abajo
no describen automáticamente la producción actual: el sitio ya está público,
Google fue activado en Supabase por el operador y Facebook sigue en pausa.

Una reversión de Worker debe preservar los registros nuevos; no borrar
consentimientos ni reconstruirlos desde una casilla UI. Completar primero la
evidencia de release y un respaldo/ensayo del estado real. Este inventario no
autoriza cierres, activaciones, restauraciones ni despliegues.

## Antecedente del 31 de agosto de 2026

Estado de referencia al 31 de agosto de 2026:

- Supabase `ibtvlvpxwourrxwcrfkf` es exclusivamente Producción; el desarrollo y
  los ensayos se hacen con Supabase local. Su ledger remoto exacto es
  `0001`–`0058` + `0060`; `0059` está ausente de Producción y permanece sólo en
  `supabase/migration-drafts`.
- El runtime está desplegado en el Worker **Cloudflare Workers** cerrado con
  custom domains `agorbis.com` y `www.agorbis.com`: el apex responde 503 y
  `www` redirige 308 preservando path/query; existen cero Cron Triggers y
  `workers.dev`/preview URLs permanecen deshabilitados.
- Cloudflare presta DNS autoritativo, runtime HTTP, assets y Turnstile A/B. La
  topología histórica DNS-only deja de ser válida al desplegar este release.
- Google OAuth y los resúmenes de IA están deshabilitados.
- Google Drive fue elegido como destino manual para una futura copia cifrada
  off-host. La carpeta remota fue informada por el operador, pero no se inició
  OAuth, no se configuró un cliente, no se subió una copia y no existe todavía
  evidencia de descarga o restore; esta dependencia sigue pendiente de
  validación jurídica y documental.
- Las JWT `anon`/`service_role` legacy y el JWT secret legacy fueron revocados;
  Producción usa `sb_publishable_...` y una `sb_secret_...` dedicada.
- Las once plantillas de Auth del repositorio fueron copiadas al Dashboard.
- El deployment cerrado es la línea de rollback vigente; la apertura pública
  todavía no fue desplegada.

Adenda D72, 31 de agosto de 2026: la etapa excepcional de certificación es
dry-run-only. Congela el artifact y emite actas JSON/Markdown más un issuance
externo ligado al HEAD/request/policy/artifact, sin desplegar. El cutover es un
consumidor separado que exige el mismo request y act hash.

El contrato `agorbis-exceptional-release-scripts/v12` tiene SHA-256 exacto
`6f221d2a7faf949b2eb456ba41a58c524c2531283b055873f227200024f93314`; una
diferencia bloquea antes de cualquier mutación.

El único comando de apertura permitido es:

```bash
pnpm run release:open:exceptional:cutover \
  --request <misma-ruta-absoluta.json> \
  --act-hash <actHash>
```

No se admite un deploy abierto genérico ni `wrangler deploy` manual. Si un
crash deja incierta la restauración después del claim, recuperar únicamente con
la etapa CLOSED versionada:

```bash
pnpm run release:open:exceptional:recover-closed \
  --request-hash <requestHash> \
  --act-hash <actHash>
```

OPEN y recovery comparten el lock global por cuenta/Worker del mismo host,
operador y UID designados. Recovery usa la cápsula CLOSED publicada antes del
upload y no depende del artifact ni de la expiración del acta. Su pointer es un
hardlink: backup y restore del state root canónico deben preservar hardlinks con
`tar` o `rsync -H`; si se rompen, el procedimiento falla cerrado.

La vía excepcional permite documentar el gate
`recovery.production-backup-not-verified` con
`PRODUCTION_BACKUP_STATUS=not_verified` y
`RISK_ACCEPTED_BY_OWNER=true` atribuido individualmente a Sebastian Cardoso
Castillo para un HEAD exacto. La fila conserva `RAW_RESULT=FAIL`,
`EVIDENCE_STATUS=NOT_VERIFIED` y
`RELEASE_DISPOSITION=RISK_ACCEPTED_BY_OWNER`; nunca se presenta como `PASS`.

Google Drive permanece como subestado informativo `inactive`, sin OAuth,
sincronización, upload, descarga ni restore acreditados. No es un segundo gate
ni un octavo waiver. Activarlo exige revisión/versionado y hoy debe bloquear
por configuración desconocida. El JSON versionado incorpora únicamente estos
subestados explícitos; no completa evidencia humana, no vuelve recuperable el
sistema y no autoriza crear, transferir o borrar archivos.

## Reglas del paquete de recuperación

1. Guardar el paquete fuera del repositorio, cifrado en reposo y con acceso
   limitado al responsable. Mantener una segunda copia cifrada en otro dominio
   de fallo.
2. El manifiesto SHA-256 cubre cada exportación y cada objeto. El manifiesto
   confirma integridad, no confidencialidad ni autenticidad: conservarlo dentro
   del paquete cifrado y firmarlo si se adopta una clave operativa de firma.
3. No copiar valores de secretos a Markdown, tickets, chat, capturas, logs ni
   nombres de archivo. El inventario registra el nombre, custodio, consumidor,
   fecha de rotación y procedimiento para reemplazarlo.
4. Las capturas de pantalla sirven sólo como evidencia auxiliar. La fuente
   recuperable es un archivo de configuración legible o una transcripción
   revisada campo por campo, sin secretos.
5. Verificar el paquete después de cada cambio de Auth, DNS, SMTP, plantilla,
   dominio, widget, variable o secreto y durante cada simulacro trimestral.
6. Preservar como hardlinks el pointer y `publication.json` de cada cápsula
   CLOSED dentro de `~/.local/state/agorbis/exceptional-cutovers/`. Usar un
   formato/herramienta que conserve hardlinks, como `tar` o `rsync -H`, y
   revalidar el vínculo después del restore; una copia de archivos independiente
   no es una cápsula recuperable válida.

El backup genera y protege con el manifiesto este núcleo versionado:

```text
configuration/
  RECOVERY_INVENTORY.md
  configuration-inventory.v1.json
  supabase-local-config.toml
  wrangler.jsonc
  wrangler.closed.jsonc
  wrangler.traffic.jsonc
  wrangler.crons-open.jsonc
  wrangler.crons-closed.jsonc
  auth-email-templates/
```

El artefacto `configuration-inventory.v1.json` contiene los ajustes recuperables
no secretos, hashes de las once plantillas, configuración de Workers, la arquitectura
Turnstile A/B, el registro lógico de secretos y una lista explícita de evidencia
humana pendiente. No pretende ser un export del Dashboard.

Cuando se completen las capturas humanas, el paquete cifrado agrega —sin
versionarlos en Git—:

```text
configuration/
  supabase-auth.redacted.json
  supabase-smtp.redacted.json
  turnstile-widgets.redacted.json
  cloudflare-dns-records.redacted.json
  cloudflare-dns-zone.txt
  cloudflare-worker.redacted.json
  cloudflare-worker-binding-names.json
  secret-register.redacted.csv
```

`redacted` significa que el archivo conserva configuración, provenance y un
fingerprint cuando sea útil, pero nunca el valor recuperable de una clave. Los
valores que no pueden regenerarse inmediatamente se custodian en un gestor de
secretos cifrado separado. No crear un archivo vacío con esos nombres: mientras
falte el export real, el inventario v1 mantiene el estado
`human-export-required` y el paquete sigue incompleto.

## Artefacto determinista y gate fail-closed

La copia versionada está en
[`recovery/configuration-inventory.v1.json`](../recovery/configuration-inventory.v1.json)
y usa el formato `agorbis-recovery-configuration/v1`. Se genera únicamente a
partir de archivos locales; no lee variables de entorno ni consulta Supabase,
Cloudflare o Resend.

```bash
node scripts/recovery-inventory.mjs --check
node scripts/test-backup-tools.mjs
node scripts/recovery-inventory.mjs --check --require-ready
```

Los dos primeros comandos deben pasar. El último **debe fallar** mientras haya
capturas humanas pendientes, evitando que un inventario estructuralmente válido
se presente como recuperable. El gate compara de forma exacta:

- formato y serialización canónica, sin campos desconocidos;
- 53 nombres de variables/runtime y atestaciones, con estrategia de recuperación;
- once plantillas, Subject, variables, bytes y SHA-256;
- `wrangler.jsonc`, account id, custom domains, assets, cinco crons, observabilidad
  minimizada, secrets requeridos, vars públicas y Node 22.x;
- Auth, SMTP, Turnstile A/B, DNS y nueve secretos lógicos; y
- doce entradas obligatorias de evidencia humana.

También rechaza secretos con formatos conocidos, claves privadas, valores
nulos, marcadores ficticios, templates desconocidos, hashes cambiados y
cualquier alta/baja/reordenamiento no explicado. El backup valida el archivo
antes de copiarlo y declara su formato, ruta, SHA-256 y resumen dentro del
manifiesto; backups anteriores siguen siendo verificables sin fingir que ya
contenían este artefacto.

## Orden de recuperación

1. Recuperar las cuentas administrativas y MFA de GitHub, Supabase, Cloudflare
   y Resend desde los códigos de recuperación cifrados.
2. Crear o seleccionar el proyecto de recuperación de Supabase y restaurar
   primero base de datos y Storage según el runbook de backups.
3. Restaurar Auth, SMTP y las once plantillas; emitir credenciales nuevas para
   el nuevo proyecto. Nunca reutilizar una `sb_secret_...` del incidente.
4. Restaurar los widgets A/B de Turnstile y colocar cada secret únicamente en
   su consumidor correcto.
5. Restaurar el Worker, sus tres secrets, custom domains y Cron Triggers.
   Certificar con el dry-run excepcional y abrir únicamente mediante el cutover
   versionado con request/act hash, nunca mediante un deploy manual.
6. Restaurar el DNS al final del ensayo y sólo durante un corte aprobado. Usar
   TTL reducido previamente; nunca cambiar DNS como parte de un simulacro local.
7. Ejecutar las comprobaciones de cierre de este documento y registrar tiempos,
   pérdida de datos observada y toda excepción al RPO/RTO.

## Supabase Auth

Fuente de verdad operativa: Dashboard del proyecto → Authentication. Base local
versionada: [`supabase/config.toml`](../supabase/config.toml), que sólo sirve
para desarrollo y **no** debe enviarse a cloud con `config push`.

La exportación `supabase-auth.redacted.json` debe registrar, como mínimo:

| Ajuste                                 | Valor de Producción esperado                                              |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Site URL                               | `https://agorbis.com`                                                     |
| Redirect URLs                          | únicamente `/auth/callback` y `/auth/confirm` sobre `https://agorbis.com` |
| Signup por email / confirmación        | habilitados                                                               |
| Signup anónimo / Phone Auth            | deshabilitados                                                            |
| Secure email change                    | doble confirmación habilitada                                             |
| Contraseña                             | mínimo 12; letras y números (`letters_digits`, D101)                      |
| Leaked password protection             | deshabilitada mientras `SUPABASE_PLAN="free"` (D91); habilitada desde Pro |
| Require current password when updating | habilitado                                                                |
| TOTP                                   | enrollment y verification habilitados; máximo 2 factores                  |
| CAPTCHA de Auth                        | Turnstile con el **secret B**                                             |
| IP Address Forwarding                  | habilitado                                                                |
| Rate limit de email                    | 6 por hora                                                                |
| Security notifications                 | las seis enumeradas abajo, sin `phone_changed`                            |
| Legacy keys/JWT                        | deshabilitados/revocados                                                  |

Exportar sólo esos campos y los límites restantes que el equipo haya ajustado.
No exportar hashes de contraseña, refresh tokens, secretos TOTP, OTP, sesiones
ni el secret B a este archivo. Las identidades y factores pertenecen al respaldo
de base de datos; un CSV de usuarios no sustituye una restauración completa de
Auth.

Restauración y chequeo:

1. aplicar cada ajuste manualmente en el Dashboard del proyecto de recuperación;
2. emitir una nueva publishable key y una nueva secret key dedicada server-only;
3. comprobar alta con confirmación, ingreso, recuperación, cambio de correo con
   doble confirmación y reautenticación;
4. probar TOTP en `aal1` y `aal2`, incluidos los límites de dos factores;
5. probar la arquitectura Turnstile A/B indicada abajo y comprobar que la IP
   reenviada llega desde un handler confiable;
6. ejecutar `pnpm preflight:production` con un artefacto construido y valores
   del entorno de recuperación, sin imprimirlos.

Responsable de exportación, restauración y rotación: Sebastian, único operador
de Producción. Frecuencia: después de cualquier cambio y revisión trimestral.

## SMTP de Supabase y Resend

Fuente de verdad: Supabase → Authentication → Email → SMTP Settings y el dominio
verificado en Resend. `supabase-smtp.redacted.json` debe registrar:

| Campo               | Valor no secreto conocido                          |
| ------------------- | -------------------------------------------------- |
| Proveedor           | Resend                                             |
| Host                | `smtp.resend.com`                                  |
| Puerto              | `465`                                              |
| Usuario             | `resend`                                           |
| Sender email        | `no-reply@agorbis.com`                             |
| Sender name         | `Agorbis`                                          |
| Dominio             | `agorbis.com`, estado esperado `Verified`          |
| Open/Click Tracking | ambos deshabilitados                               |
| Contraseña SMTP     | referencia al registro del API key, nunca el valor |

Para recuperar, verificar primero SPF/DKIM/DMARC, crear una nueva API key de
Resend con el alcance mínimo disponible, cargarla como contraseña SMTP en
Supabase y revocar la anterior después de un envío exitoso. Probar entrega,
remitente, enlaces, versión texto/HTML y que Resend no reactivó tracking.

Responsable: Sebastian. Rotación: ante exposición, cambio de custodio o
simulacro; revisar vigencia trimestralmente.

## Plantillas de Supabase Auth

Los archivos versionados son la copia recuperable. En el paquete se incluyen
otra vez y se validan contra el manifiesto SHA-256. `db push` no los carga al
Dashboard.

| Archivo                      | Plantilla del Dashboard                          | Subject                                                            |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `confirmation.html`          | Confirm signup / Confirmación                    | `Agorbis · Confirmá tu correo / Confirm your email`                |
| `recovery.html`              | Reset password / Recuperación                    | `Agorbis · Recuperá tu acceso / Recover your account`              |
| `magic_link.html`            | Magic Link                                       | `Agorbis · Enlace de acceso / Sign-in link`                        |
| `email_change.html`          | Change Email Address / Cambio de correo          | `Agorbis · Confirmá tu nuevo correo / Confirm your new email`      |
| `reauthentication.html`      | Reauthentication / Reautenticación               | `Agorbis · Código de seguridad / Security code`                    |
| `password_changed.html`      | Password changed / Contraseña actualizada        | `Agorbis · Contraseña actualizada / Password changed`              |
| `email_changed.html`         | Email changed / Correo actualizado               | `Agorbis · Correo actualizado / Email changed`                     |
| `identity_linked.html`       | Identity linked / Método vinculado               | `Agorbis · Método de acceso vinculado / Sign-in method linked`     |
| `identity_unlinked.html`     | Identity unlinked / Método eliminado             | `Agorbis · Método de acceso eliminado / Sign-in method removed`    |
| `mfa_factor_enrolled.html`   | MFA factor enrolled / Segundo factor agregado    | `Agorbis · Segundo factor agregado / Verification method added`    |
| `mfa_factor_unenrolled.html` | MFA factor unenrolled / Segundo factor eliminado | `Agorbis · Segundo factor eliminado / Verification method removed` |

Las plantillas de confirmación, recuperación y magic link usan `TokenHash` y
`RedirectTo`; cambio de correo usa `TokenHash`, `NewEmail` y `SiteURL`;
reautenticación usa `Token`. Las notificaciones usan sólo las variables no
secretas que aparecen en cada archivo. No reemplazar esos enlaces por
`ConfirmationURL`: el paso intermedio de Agorbis evita que un scanner de correo
consuma la acción automáticamente.

Restaurar copiando exactamente Subject y HTML al Dashboard, guardar, volver a
abrir la plantilla y comparar el HTML descargado/copiado con el archivo
versionado. Enviar los once eventos de prueba en Supabase local y los eventos
críticos en el proyecto de recuperación antes de habilitar tráfico.

## Turnstile A y B

Fuente de verdad: dos widgets distintos en Cloudflare. La exportación
`turnstile-widgets.redacted.json` registra nombre, widget/site key pública,
modo, hostname permitido, fecha de creación y fingerprint del secret; nunca el
secret.

| Widget     | Función                                                          | Consumidor del secret          | Configuración recuperable                                                |
| ---------- | ---------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| A, visible | Agorbis lo renderiza y el handler valida el token con Siteverify | sólo Worker `TURNSTILE_SECRET` | site key en `PUBLIC_TURNSTILE_SITE_KEY`; hostname único `agorbis.com`    |
| B, guard   | hace fallar llamadas directas a Auth público sin `captchaToken`  | sólo Supabase Auth             | hostname único `agorbis.com`; site key/secret ausentes del repo y Worker |

Los handlers legítimos validan A y llaman Auth con `SUPABASE_SECRET_KEY`; no
generan ni transmiten un token B. Al recuperar, crear dos widgets separados,
emitir secrets nuevos y mantener la separación anterior.

Chequeo obligatorio:

1. A se renderiza sólo en los flujos públicos protegidos y Siteverify rechaza
   token ausente, inválido, expirado, repetido o de otro hostname;
2. una llamada directa a Auth con la publishable key y sin CAPTCHA devuelve
   `captcha_failed` por B;
3. el mismo flujo a través de Agorbis funciona después de validar A;
4. cambio de contraseña, enrolamiento TOTP y eliminación de cuenta no renderizan
   Turnstile;
5. la site key y el secret B no aparecen en DOM, bundle, logs ni Worker bindings.

Responsable: Sebastian. Rotar cada secret ante exposición o reconstrucción del
proyecto; actualizar y probar primero su único consumidor.

## Cloudflare DNS

Fuente de verdad: zona `agorbis.com` en Cloudflare. Conservar dos exportaciones:

- BIND desde DNS → Records → Advanced Actions → Export;
- JSON redacted con `type`, `name`, `content`, `TTL` y `proxied` para preservar
  metadatos que BIND puede omitir. No incluir tokens de API.

El inventario debe cubrir los custom domains apex/`www` de Workers y todos los
registros de Resend (MX, SPF, DKIM y DMARC). El JSON redacted debe registrar el
estado efectivo de proxy/routing sin copiar tokens. No atribuir WAF u otras
salvaguardas que no hayan sido configuradas y verificadas.

La línea de base vigente tiene apex y `www` conectados al Worker cerrado: apex
sirve 503, `www` redirige 308 preservando path/query y existen cero Cron
Triggers. Conservar ese export como rollback. El
snapshot Vercel del 25-08-2026 es sólo evidencia histórica y no debe restaurarse
como rollback operativo. Los MX/TXT/DKIM/DMARC de Migadu, Resend/SES permanecen
fuera del cambio web.

Restaurar primero en una zona sin delegación, verificar sintaxis, conflictos de
CNAME, TTL, DKIM y DMARC; delegar nameservers sólo en un cambio aprobado. Luego
confirmar resolución desde al menos dos resolvers y verificar que el tráfico
HTTP termina en el Worker `agorbis`.

Responsable: Sebastian. Exportar después de cada cambio DNS y revisar
trimestralmente. La recuperación de la cuenta y sus códigos MFA se custodian
cifrados fuera de este paquete.

## Cloudflare Workers

Fuentes de verdad: [`wrangler.jsonc`](../wrangler.jsonc) para runtime, account,
routes, assets, observabilidad, nombres de secrets, vars públicas y los cinco
crons open; [`wrangler.closed.jsonc`](../wrangler.closed.jsonc) para el
deployment/rollback 503 en Paid. Este último es una copia exacta del perfil
canónico salvo `AGORBIS_LAUNCH_MODE="closed"` y `triggers.crons=[]`: conserva
ambos custom domains, `workers_dev=false`, `preview_urls=false`,
`limits.cpu_ms=30000` y los tres secretos requeridos.

El mecanismo excepcional congela además
[`wrangler.traffic.jsonc`](../wrangler.traffic.jsonc), que sólo identifica
cuenta/Worker para promoción o rollback por Version ID;
[`wrangler.crons-open.jsonc`](../wrangler.crons-open.jsonc), con exactamente los
cinco schedules; y
[`wrangler.crons-closed.jsonc`](../wrangler.crons-closed.jsonc), con cero
schedules. Esos tres perfiles mínimos y el `wrangler.jsonc` congelado son la
configuración exacta del cutover y recovery; no se reconstruyen con argumentos
ad hoc ni se reemplazan por un deploy manual. Cada perfil debe pasar su
validador exacto. Dashboard/API sigue siendo la fuente del estado efectivo.
Conservar:

- cuenta exacta `4d78fb10c1ae65281ec851479d5045dc`, Worker `agorbis` y plan
  atestado `paid`;
- Node.js `22.x`, Wrangler `4.160.1` y build `pnpm build.cloudflare`;
- únicamente `agorbis.com` y `www.agorbis.com` como custom domains;
- `workers_dev=false`, `preview_urls=false`, binding `ASSETS` y
  `run_worker_first=true`;
- los cinco Cron Triggers exactos, logs custom al 100 %,
  `invocation_logs=false` y traces apagadas;
- nombres de los tres Worker Secrets, nunca sus valores;
- commit exacto, hash de `dist/_worker.js` y resultados de build/preflight.

El inventario contiene exactamente estas categorías:

- núcleo (10): `CLOUDFLARE_WORKERS_PLAN`, `SUPABASE_PLAN`,
  `CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED`, `PUBLIC_SITE_URL`,
  `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`,
  `CRON_SECRET`, `PUBLIC_GOOGLE_AUTH_ENABLED` y `PUBLIC_FACEBOOK_AUTH_ENABLED`;
  `AGORBIS_RUNTIME` y `AGORBIS_LAUNCH_MODE` quedan además versionados entre las
  vars exactas de Wrangler;
- atestaciones de Auth (20):
  `SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR`,
  `SUPABASE_AUTH_CAPTCHA_ENABLED`, `SUPABASE_AUTH_CAPTCHA_PROVIDER`,
  `SUPABASE_AUTH_IP_FORWARDING_ENABLED`,
  `SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED`,
  `SUPABASE_AUTH_SIGNUPS_ENABLED`,
  `SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED`,
  `SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED`,
  `SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED`,
  `SUPABASE_AUTH_PHONE_AUTH_ENABLED`, `SUPABASE_AUTH_MIN_PASSWORD_LENGTH`,
  `SUPABASE_AUTH_PASSWORD_REQUIREMENTS`,
  `SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED`,
  `SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED`,
  `SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED`,
  `SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS`, `SUPABASE_AUTH_SITE_URL`,
  `SUPABASE_AUTH_REDIRECT_URLS`,
  `SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED` y
  `SUPABASE_LEGACY_SERVICE_ROLE_DISABLED`;
- Turnstile (4): `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`,
  `TURNSTILE_HOSTNAMES` y `TURNSTILE_SUPABASE_GUARD_HOSTNAMES`;
- identidad, subencargados y transferencias (14):
  `PUBLIC_LEGAL_CONTROLLER_NAME`, `PUBLIC_LEGAL_CONTACT_EMAIL`,
  `PUBLIC_AAIP_CONTROLLER_ID`,
  `PUBLIC_AAIP_DATABASE_REGISTRATION_ID`, los pares
  ES/EN `PUBLIC_{SUPABASE,RESEND,CLOUDFLARE}_PROCESSING_LOCATION`,
  `PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` y
  `PUBLIC_PROVIDER_RETENTION_SUMMARY{,_EN}`.

El JSON versionado es una especificación local y no afirma que los bindings ya
existan en cloud. La captura `cloudflare-worker.redacted.json` debe enumerar el
estado efectivo después de cada cambio. Los textos de Cloudflare deben pasar el
gate Workers/DNS/Turnstile con valores reales; no se inventan para completar el
inventario.

Deben permanecer ausentes `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_TESTING`,
`OPENAI_API_KEY`, `OPENAI_SUMMARY_MODEL` y los destinos Google mientras OAuth
siga deshabilitado. `RESEND_API_KEY` y las credenciales del widget B tampoco
pertenecen al Worker.

Los secrets no son una copia recuperable: deben existir en custodia cifrada o
regenerarse. Al reconstruir, cargar primero los secrets en el orden
`SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET`, `CRON_SECRET` y validar los
inventarios remotos exactos 1/3, 2/3 y 3/3. Recién con 3/3 se permite certificar
el corte; el cutover versionado instala exactamente los cinco schedules y mueve
100 % del tráfico al Version ID ligado al artifact. Recovery restaura el
Version ID CLOSED de la cápsula y reconcilia los schedules a cero.
`workers.dev` y preview URLs permanecen apagados.
Para el primer corte, `SUPABASE_SECRET_KEY` debe ser una clave dedicada a
Cloudflare y `CRON_SECRET` debe ser nuevo. Turnstile A puede reutilizarse
temporalmente porque el hostname y la allowlist permanecen en `agorbis.com`;
rotarlo después del smoke es recomendable para separar su custodia de Vercel.
B permanece exclusivamente en Supabase. El cierre se considera completo después
de revocar las credenciales efectivamente reemplazadas y retirar variables,
proyecto y tokens OIDC de Vercel.

Responsable: Sebastian. Exportar metadatos después de cada cambio; validar
mensualmente que el registro coincide con Dashboard/API.

## Registro de secretos

`secret-register.redacted.csv` contiene columnas `name`, `consumer`, `issuer`,
`environment`, `last_rotated_at`, `fingerprint`, `escrow_location`,
`recovery_action` y `owner`. Debe incluir al menos:

| Nombre lógico                      | Único consumidor                          | Acción de recuperación                                                       |
| ---------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY`              | Worker server-only                        | emitir nueva `sb_secret_...`, cargarla y revocar la anterior tras smoke test |
| `CRON_SECRET`                      | Worker fetch/scheduled                    | generar 32+ bytes, cargarlo como secret y verificar 401/dispatch interno     |
| Turnstile secret A                 | Worker Siteverify                         | rotar en Cloudflare y actualizar sólo `TURNSTILE_SECRET`                     |
| Turnstile secret B                 | Supabase Auth                             | rotar en Cloudflare y actualizar sólo Bot and Abuse Protection               |
| Resend API key SMTP                | Supabase Auth                             | crear key nueva, actualizar SMTP, probar y revocar la anterior               |
| Supabase DB password               | conexión administrativa de recuperación   | resetear en Dashboard y actualizar sólo el almacén cifrado                   |
| Credencial de descifrado de backup | runner offline de cifrado/restore         | recuperar desde custodia independiente y probar descifrado                   |
| Credencial del gestor cifrado      | apertura del almacén elegido              | usar custodia separada; nunca guardarla junto al almacén                     |
| Google Client Secret               | Supabase Auth, sólo si Google se habilita | hoy no existe/permanece deshabilitado                                        |
| MFA/recovery codes de proveedores  | acceso de emergencia del responsable      | regenerar después de cada uso y reemplazar la custodia cifrada vigente       |

No registrar el valor de `PUBLIC_SUPABASE_ANON_KEY` como secreto; sí conservar
su nombre de proyecto y fingerprint para detectar una clave equivocada. Nunca
restaurar `SUPABASE_SERVICE_ROLE_KEY`, JWT legacy ni `TURNSTILE_TESTING`. El
JSON v1 distingue nueve entradas activas de cinco credenciales inactivas o
revocadas —Google, OpenAI y las tres credenciales legacy— para que una
recuperación no vuelva a habilitarlas por error.

## Comprobación de completitud

Antes de declarar recuperable un paquete:

```bash
node scripts/recovery-inventory.mjs --check
git ls-files 'supabase/templates/*.html'
sha256sum supabase/templates/*.html wrangler.jsonc supabase/config.toml
git check-ignore -v backups/prod.dump backups/storage.tar.zst
pnpm preflight:production
node scripts/recovery-inventory.mjs --check --require-ready
```

El primer comando debe listar exactamente once plantillas. Los hashes se copian
al manifiesto generado fuera del repositorio. `git check-ignore` debe encontrar
las dos muestras. El preflight necesita variables reales sólo en el proceso y
un artefacto `dist/_worker.js` recién construido; no pegarlas en la terminal si
el historial del shell no está protegido.

Cerrar el simulacro sólo cuando además se hayan probado Auth A/B, SMTP, lectura
de objetos restaurados, RLS, redirecciones canónicas y resolución DNS. Registrar
incidentes y decisiones sin adjuntar dumps, manifiestos reales ni secretos.

## Evidencia humana todavía pendiente

El JSON enumera doce bloques sin valores ficticios:

1. `aaip_registration_rl`: código público
   `RL-2026-81658385-APN-DNPDP#AAIP` ya identificado; falta conservar la
   constancia descargable real fuera del repositorio;
2. `account_mfa_recovery_custody`: custodia y prueba de códigos de recuperación
   de Supabase, Cloudflare, Resend, GitHub y Google;
3. `backup_key_and_media_custody`: paquete cifrado y checksum transferidos
   manualmente a Google Drive, credencial en custodia independiente y prueba
   posterior desde una descarga distinta mediante SHA-256, descifrado y
   restore;
4. `cloudflare_dns_exports`: BIND y JSON redacted con contenido, TTL y
   `proxied` de cada registro;
5. `provider_contractual_transfer_evidence`: instrumentos, países, retenciones
   y textos ES/EN finales de Supabase, Resend y Cloudflare; para Google Drive,
   además, producto y entidad aplicables, rol, DPA/términos, subencargados,
   versionado, papelera, logs y borrado;
6. `release_commit_and_artifact`: commit, hash del artefacto Worker y preflight
   del release definitivo;
7. `resend_domain_and_smtp_export`: transcripción/export del dominio, SMTP,
   remitente y tracking, sin API key;
8. `secret_custody_metadata`: fingerprints, rotación/verificación y ubicación
   cifrada de cada secreto activo;
9. `supabase_auth_dashboard_export`: export/transcripción redacted de Auth,
   CAPTCHA, MFA y límites;
10. `turnstile_widget_a_metadata`: nombre, modo, identificador/fingerprint y
    metadatos de rotación del widget A;
11. `turnstile_widget_b_metadata`: los mismos datos para B, sin copiar sus
    credenciales a la aplicación o al Worker; y
12. `cloudflare_worker_redacted_export`: bindings, custom domains, triggers,
    nombres de secrets y sólo fingerprints para secretos.

Las atestaciones ya conocidas permiten reconstruir una configuración candidata,
pero no sustituyen esos exports. Una nueva captura debe producir un formato
nuevo o una extensión explícitamente validada; no se elimina un bloqueo del v1
editando el status a mano.

## Custodia mínima para el lanzamiento normal

Antes del go-live debe existir un paquete productivo cifrado, descifrado y
verificado contra su manifiesto/checksums, con al menos una copia fuera de la
máquina que lo genera. La frase o clave se custodia de forma independiente del
paquete. El mecanismo concreto puede ser cifrado simétrico GnuPG con pinentry o
una clave OpenPGP ya controlada; el almacén puede ser cualquier gestor cifrado,
hardware seguro o custodia offline equivalente.

En D72/Fase A, continuar sin ese paquete se registra como riesgo de pérdida de
datos y recuperación no verificada, no como control equivalente. El gate
`recovery-inventory --require-ready` debe continuar fallando y la evidencia
humana pendiente permanece pendiente. El responsable, HEAD, fecha,
consecuencia y remediación se repiten en cada fila; no existe una aceptación
global de recovery.

Una segunda copia independiente es recomendable inmediatamente después del
lanzamiento. KeePassXC en particular, una clave OpenPGP dedicada y exactamente
dos SSD son hardening opcional, no condiciones de go-live por sí mismas. El
detalle de RPO/RTO, retención y comandos está en `BACKUP_AND_RESTORE.md`. Hasta
completar la custodia y la prueba, el inventario versionado permite reconstruir
nombres y configuración, pero no recuperar secretos perdidos sin rotarlos.
