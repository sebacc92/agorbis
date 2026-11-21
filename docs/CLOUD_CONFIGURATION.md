# Agorbis · configuración externa antes del lanzamiento

El código puede validarse por completo contra Supabase local, pero estas tareas
dependen de cuentas, dominios y decisiones del responsable. Este documento es
una lista de corte; no autoriza un despliegue.

El gate normal del release abierto es `pnpm release:open:dry-run`. Para el corte
excepcional D72, la certificación y la mutación están separadas: sólo
`pnpm run release:open:exceptional:dry-run --request <ruta-absoluta.json>` crea
el artifact congelado, las actas JSON/Markdown y el issuance externo. Esa etapa
usa únicamente Wrangler con `--dry-run`, no carga `.env.local`, no persiste
secretos y no despliega. Valida el contrato
`agorbis-exceptional-release-scripts/v12`, cuyo SHA-256 exacto es
`6f221d2a7faf949b2eb456ba41a58c524c2531283b055873f227200024f93314`.
El issuance `0600` queda en
`~/.local/state/agorbis/exceptional-cutovers/issued/<requestHash>.issued.json`
y liga los hashes del acta JSON, su Markdown y el artifact.

Un exit `20` no autoriza por sí solo Producción. Después de validar el mismo
HEAD, request, policy, acta, issuance y artifact, y de recibir la frase TTY
final exacta, el único mecanismo de apertura permitido es:

```bash
pnpm run release:open:exceptional:cutover \
  --request <misma-ruta-absoluta.json> \
  --act-hash <actHash>
```

Si un crash deja incierta la restauración posterior al claim, el único mecanismo
operativo es la recuperación CLOSED versionada:

```bash
pnpm run release:open:exceptional:recover-closed \
  --request-hash <requestHash> \
  --act-hash <actHash>
```

OPEN y recovery comparten un lock global por cuenta/Worker en el mismo host,
operador y UID designados. Recovery consume la cápsula CLOSED publicada antes
del upload; su pointer es un hardlink, por lo que toda copia/restauración del
state root debe preservar hardlinks mediante `tar` o `rsync -H`. No usar un
`wrangler deploy` manual ni otro comando genérico para abrir Producción.

## Datos y decisiones de la cuenta

- Dominio canónico: `https://agorbis.com`.
- Responsable único inicial: Sebastian Cardoso Castillo
  (`sebastiancardoso92@gmail.com`), con domicilio público configurado como
  `[domicilio reservado], Provincia de Buenos Aires, Argentina`. Si se desea
  usar un domicilio profesional en vez del residencial, debe ser real y
  validarse antes de inscribirlo; nunca se publica uno ficticio.
- Proyecto Supabase de **producción**: `ibtvlvpxwourrxwcrfkf`, alojado en
  `us-east-2`. Es el único proyecto cloud de Agorbis: desarrollo, integración y
  restauraciones de prueba usan Supabase local. Al 31 de agosto de 2026,
  Producción contenía exactamente `0001`–`0058` + `0060`, aplicadas una vez cada
  una. La verificación del 06-09-2026, sobre el proyecto anterior (D92), confirmó 60/60: `0001`–`0058` + `0060` +
  `0061`, que ya estaba aplicada. El dry-run devolvió `upToDate: true` y no se
  ejecutaron migraciones remotas durante esa verificación.
  `0059` está ausente de Producción y permanece sólo en
  `supabase/migration-drafts`. No usar el enlace
  persistente de la CLI como selector de destino: todo comando cloud debe incluir
  el project ref explícito y nunca `--linked`.
- Región de datos de Supabase y contratos/DPA aplicables con Supabase, Resend,
  Cloudflare y el proveedor de IA si se habilitan resúmenes.
- Mecanismo argentino que cubra el primer request y todo flujo que llegue a
  Cloudflare Workers sin una decisión afirmativa previa y acreditable para ese
  tratamiento:
  incluye lectura pública y, cuando no pueda acreditarse una decisión anterior
  vigente, ingreso, recuperación, seguridad y ejercicio de derechos.
  Antes del lanzamiento se deben incorporar efectivamente cláusulas modelo
  AAIP, obtener una aprobación documentada de AAIP o identificar y documentar
  una excepción concreta del artículo 12 aplicable al tratamiento real. El
  consentimiento especial del alta sólo cubre transferencias posteriores y no
  resuelve este punto de forma retroactiva.
  La guía oficial de la AAIP y los instrumentos vigentes están en
  [Transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).
- El Paso 1 de AAIP/TAD ya emitió para Sebastian el código público de
  responsable `RL-2026-81658385-APN-DNPDP#AAIP`. Guardarlo en
  `PUBLIC_AAIP_CONTROLLER_ID` y conservar la constancia descargable fuera del
  repositorio. El Paso 2, **Inscripción de bases de datos privadas**, fue
  presentado bajo el expediente `EX-2026-82087278- -APN-DNPDP#AAIP`; siguen
  pendientes la aprobación y el número de registro de la base. El expediente
  `EX-...`, la transacción TAD, el CUIL/CUIT y las credenciales no son ese
  número ni sustituyen el `RL`; tampoco se guardan en el repositorio.
  `PUBLIC_AAIP_DATABASE_REGISTRATION_ID` debe permanecer vacío hasta recibir
  la constancia aprobada. Ver `AAIP_REGISTRATION.md`.
- Sebastian asume inicialmente corte, incidentes, privacidad y moderación. Es
  un riesgo explícito de persona única: MFA efectivo en las cuentas
  administrativas es obligatorio; una segunda custodia de recuperación de
  todos los proveedores se completa inmediatamente después del lanzamiento.
- Planes reales de RPO/RTO, retención de logs y presupuesto de infraestructura.

La primera versión está implementada para mayores de 18 años. Admitir menores
requiere otra decisión legal y de producto; no alcanza con cambiar el texto de
un checkbox.

Los resúmenes de IA quedan deshabilitados en el lanzamiento inicial. No cargar
`OPENAI_API_KEY` ni modelo hasta publicar a OpenAI como subencargado con destino,
DPA, uso de datos y retención reales, actualizar la versión de privacidad y
agregar el gate correspondiente al preflight.

## Supabase Cloud

1. Usar Supabase local para desarrollo, integración, pruebas destructivas y
   ensayos de restauración. El proyecto cloud `ibtvlvpxwourrxwcrfkf` es
   exclusivamente Producción. En cada operación remota escribir y verificar el
   ref de forma explícita; no ejecutar nunca un comando cloud con `--linked`.
2. Configurar la **Site URL** como `https://agorbis.com` y agregar exactamente
   `https://agorbis.com/auth/callback` y
   `https://agorbis.com/auth/confirm` a Redirect URLs. No autorizar comodines
   amplios ni previews con datos reales.
3. Las Legacy API Keys están deshabilitadas y el JWT secret legado fue revocado.
   Producción usa una `sb_secret_...` nueva y dedicada, guardada únicamente como
   `SUPABASE_SECRET_KEY` server-only; la atestación
   `SUPABASE_LEGACY_SERVICE_ROLE_DISABLED=true` debe permanecer en Production.
   La secret key sigue operando con el rol efectivo `service_role` dentro de
   Supabase, pero la variable no usa el nombre legado. Para
   `PUBLIC_SUPABASE_ANON_KEY` usar la clave `sb_publishable_...`; no volver a
   habilitar ni distribuir las claves JWT legadas.
4. En Auth:
   - mantener altas por email habilitadas, altas anónimas y Phone Auth
     deshabilitadas, confirmación de correo obligatoria y **Secure email
     change** con doble confirmación;
   - exigir reautenticación para cambiar contraseña;
   - fijar 12 caracteres como mínimo y **Letters and digits** (letras y
     números; mayúsculas y símbolos no son obligatorios, D101), que se atesta
     como `letters_digits`;
   - activar protección contra contraseñas filtradas cuando el plan sea Pro o
     superior; en Free no existe y `SUPABASE_PLAN="free"` exige atestarla en
     `"false"`, con aviso del preflight (D91);
   - habilitar **TOTP enrollment** y **TOTP verification**, con un máximo de
     2 factores por persona; las sesiones `moderator` y `admin` deben llegar
     a `aal2` antes de cualquier lectura o escritura privilegiada;
   - revisar los límites de login, alta y OTP; fijar **Rate limit for sending
     emails** en `6` por hora para el corte inicial y copiar ese mismo valor a
     `SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR` al ejecutar el preflight. Esta
     variable sólo verifica la decisión: el valor efectivo se cambia en el
     Dashboard;
   - en Bot and Abuse Protection, configurar Turnstile con el secret de la
     configuración **B**, separado del widget visible de Agorbis. B acepta sólo
     `agorbis.com`; su secret y su site key no se copian a la app, al repositorio
     ni al Worker;
   - habilitar IP address forwarding para que los handlers server-side puedan
     enviar a Auth la IP confiable mediante `Sb-Forwarded-For`.
5. Configurar SMTP propio con Resend; el SMTP compartido de prueba no sirve para
   producción. Verificar confirmación, magic link, recuperación y aviso de cambio
   de contraseña en local y repetir un smoke acotado en Producción antes de
   abrir el registro.
   Copiar también en Auth > Email Templates los archivos de
   `supabase/templates/`: `config.toml` y esos archivos configuran el entorno
   local, pero no se publican mediante `supabase db push`. Las tres plantillas
   de acceso deben conservar `TokenHash` y el destino `/auth/confirm`; volver
   a `ConfirmationURL` elimina la protección contra scanners de correo.
   Activar las seis notificaciones que usa Agorbis: `password_changed`,
   `email_changed`, `identity_linked`, `identity_unlinked`,
   `mfa_factor_enrolled` y `mfa_factor_unenrolled`; nunca deben incluir el
   secreto TOTP ni códigos temporales. `phone_changed` queda fuera mientras
   Phone Auth siga deshabilitado.
6. No ejecutar `supabase config push` con el `config.toml` local: contiene URLs
   localhost, Google deshabilitado y `email_sent = 100` exclusivamente para que
   una corrida E2E pueda inspeccionar todos los correos críticos. Cloud debe
   conservar `6` por hora. La configuración hosted se carga desde el Dashboard
   o desde un archivo cloud revisado expresamente.
7. Aplicar las migraciones desde cero en Supabase local, regenerar tipos y
   ejecutar `db lint`, la suite RLS y los E2E. El baseline remoto del proyecto anterior
   (D92) verificado el 06-09-2026 tenía exactamente `0001`–`0058` + `0060` +
   `0061` (60/60).
   `0061_reconcile_sequence_acl_drift.sql` ya estaba aplicada y el dry-run
   devolvió `upToDate: true`. `0059` continúa fuera del ledger remoto y sólo en
   `supabase/migration-drafts`. Los comandos contra ese destino escriben el ref
   completo, por ejemplo:

   ```bash
   pnpm exec supabase migration list --project-ref "ibtvlvpxwourrxwcrfkf"
   pnpm exec supabase db push --project-ref "ibtvlvpxwourrxwcrfkf" --dry-run --skip-vault
   ```

   El segundo comando sólo ensaya. No se ejecutaron migraciones remotas durante
   la verificación del 06-09-2026 y no queda ninguna por aplicar para este
   release. No ejecutar un push real ni aplicar `0059`. Una migración futura
   requiere un nuevo dry-run y una autorización explícita; nunca ejecutar
   `db reset`, roles, Vault ni seed en cloud.

8. Revisar Security Advisor y Performance Advisor. Confirmar que:
   - `claims` es **privado** y no responde mediante
     `/storage/v1/object/public/claims/...`;
   - los borradores de evidencia sólo se sirven a su dueño y la evidencia
     publicada sale por `/media/reclamos/...` mientras el reclamo siga visible;
   - `avatars` también es **privado**: ningún JWT escribe o borra objetos y sólo
     el avatar saneado que siga referenciado por `profiles.avatar_url` sale por
     `/media/avatares/...`; borradores, reemplazos y huérfanos no son públicos.
9. Mantener los backups de base de Supabase según el RPO y generar además un
   respaldo separado de los objetos de Storage. Cada conjunto debe tener un
   manifiesto de archivos, tamaños y SHA-256; verificar el manifiesto antes y
   después de restaurar. Ensayar la restauración únicamente en Supabase local o
   en otro destino aislado, nunca sobre Producción.
10. Probar MFA en local con los cuatro estados relevantes: sin factor, alta
    TOTP, cuenta con factor pero sesión `aal1`, y sesión `aal2`. Confirmar que
    `/moderacion`, `/moderacion/cuentas`, `/moderacion/apelaciones`,
    `/moderacion/solicitudes` y `/metricas` redirigen a
    `/perfil/seguridad` en `aal1`, conservan un `next` interno y funcionan
    después del challenge. Las policies/RPC de base también deben rechazar JWT
    de moderador con `aal1`; el guard SSR no reemplaza esa barrera ante acceso
    directo a PostgREST.
11. Crear la primera cuenta por el registro normal, confirmar su correo,
    completar onboarding y TOTP, y recién entonces promover su fila de
    `profiles` a `admin`. El seed nunca se carga en cloud. La migración editorial
    0017 quedará sin autor en una base nueva si `@seba` todavía no existe; hacer
    un backfill explícito después del alta si se quiere esa atribución.
12. No promover una cuenta a `moderator` o `admin` hasta que tenga contraseña
    propia y al menos un TOTP verificado. El primer enrollment exige comprobar
    esa contraseña contra Supabase dentro de la misma operación SSR; las cuentas
    que sólo usan OAuth o magic link deben definirla antes.

Referencias: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security)
y [MFA de Supabase](https://supabase.com/docs/guides/auth/auth-mfa),
[TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp) y
[checklist de producción](https://supabase.com/docs/guides/deployment/going-into-prod).

## Google OAuth

Google queda **deshabilitado** durante esta preparación. No se cambia
`PUBLIC_GOOGLE_AUTH_ENABLED="false"` ni se habilita el proveedor de producción.
Esto no bloquea desplegar Agorbis sin Google; sólo bloquea desplegar esa
funcionalidad hasta completar su E2E local y aprobar un smoke controlado en
Producción. Ningún botón es
“sólo login”: `signInWithOAuth` puede crear una cuenta cuando el correo de
Google todavía no existe. La interfaz lo informa tanto en `/ingresar` como en
`/registro`; operación y soporte no deben prometer lo contrario.

### Google Auth Platform

Crear clientes OAuth separados para local y producción, sin reutilizar secretos
entre ambientes. El proyecto `ibtvlvpxwourrxwcrfkf` está reservado formalmente
para Producción; el callback cloud siguiente pertenece exclusivamente a su
cliente de producción. Para ese cliente:

1. **Branding:** nombre `Agorbis`, correo de soporte
   `sebastiancardoso92@gmail.com`, página principal
   `https://agorbis.com`, política
   `https://agorbis.com/privacidad` y términos
   `https://agorbis.com/terminos`. Verificar `agorbis.com` en Search Console,
   agregarlo a **Authorized domains** y publicar/verificar la marca antes de
   ofrecer el botón al público.
2. **Audience:** `External`. Mantener la aplicación en modo de prueba y cargar
   sólo cuentas controladas durante la validación; pasarla a producción recién
   después de aprobar la marca, el E2E local, el smoke autorizado y el gate de
   este documento.
3. **Data Access:** únicamente `openid`,
   `https://www.googleapis.com/auth/userinfo.email` y
   `https://www.googleapis.com/auth/userinfo.profile`. No pedir contactos,
   calendario, scopes sensibles, acceso offline ni `prompt=consent`: Agorbis no
   llama APIs de Google con el token del proveedor.
4. **Client > Web application:** nombre `Agorbis · producción`, Authorized
   JavaScript origin exacto `https://agorbis.com` (sin ruta, comodín ni barra
   final) y Authorized redirect URI exacto
   `https://ibtvlvpxwourrxwcrfkf.supabase.co/auth/v1/callback`. El redirect de
   Google termina en Supabase; **no** agregar
   `https://agorbis.com/auth/callback` en este campo.
5. Guardar el Client ID en el proveedor Google de Supabase y cargar allí el
   Client Secret. El secreto no se pega en chat, tickets o documentación, no se
   versiona y no se carga en Cloudflare Workers ni en variables `PUBLIC_*`.

Si se contrata el dominio personalizado de Supabase, preparar primero
`auth.agorbis.com`: agregar en Google tanto el callback anterior como
`https://auth.agorbis.com/auth/v1/callback`, activar y verificar el dominio en
Supabase y recién después cambiar `PUBLIC_SUPABASE_URL`. No retirar el callback
anterior hasta terminar los smoke tests y el rollback. El dominio personalizado
reduce la confusión del consentimiento, pero es un add-on de Supabase y no se
debe simular con un proxy casero.

Para el cliente local, usar sólo los orígenes de desarrollo realmente usados
(`http://localhost:5173` y/o `http://127.0.0.1:5173`) y el callback exacto
`http://127.0.0.1:54821/auth/v1/callback`. La configuración local debe quedar:

```toml
[auth.external.google]
enabled = true
client_id = "<client-id-local>"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
```

`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` vive en el `.env` ignorado por
Git. El `config.toml` versionado continúa con Google apagado; cualquier cambio
temporal para E2E se revierte al terminar.

### Supabase Auth y aplicación

Con local como desarrollo/pruebas y `ibtvlvpxwourrxwcrfkf` exclusivamente como
Producción, configurar:

1. **URL Configuration de producción:** Site URL `https://agorbis.com`;
   Redirect URLs exactas `https://agorbis.com/auth/callback` y
   `https://agorbis.com/auth/confirm`, sin comodines. Los ensayos locales usan
   exclusivamente las URLs localhost de `supabase/config.toml`; no agregar
   previews ni localhost a la lista de Producción.
2. **Providers > Google:** Client ID/Secret del mismo ambiente, proveedor
   habilitado sólo durante el ensayo, nonce check conservado y enlace manual de
   identidades deshabilitado. Supabase sí realiza enlace automático cuando el
   correo verificado coincide; ese caso forma parte del E2E obligatorio.
3. Mantener `PUBLIC_GOOGLE_AUTH_ENABLED="false"` en Producción. El orden para
   una futura habilitación es: E2E local aprobado, proveedor cloud verificado,
   smoke de Producción autorizado y finalmente flag de interfaz. El smoke debe
   usar una cuenta controlada y no abre el registro al público.
4. Completar `PUBLIC_GOOGLE_PROCESSING_LOCATION{,_EN}` con los destinos y
   contratos reales antes de habilitar el flag; `/subencargados` debe mostrar
   Google y la Política de privacidad debe coincidir con lo configurado en
   Branding.

Antes de salir hacia Google, ambos botones exigen confirmar mayoría de edad,
lectura de privacidad y, mediante una casilla destacada e independiente,
consentimiento al Aviso de transferencias internacionales vigente;
`/registro` muestra además términos y normas. Esos controles previos y su
cookie nonce HttpOnly de diez minutos prueban el orden del flujo, pero la
aceptación durable se vincula a la cuenta recién desde una sesión verificada en
`/consentimiento`. Nunca se registra usando sólo un correo todavía no
confirmado. Una llamada directa al endpoint OAuth de Supabase no pasa por esas
casillas, por lo que sus requests previos necesitan el mecanismo argentino
separado y la cuenta resultante permanece sin participación hasta completar el
gate.

El callback PKCE puede recibir `provider_token` o `provider_refresh_token` de
Google. Agorbis reescribe inmediatamente la cookie usando únicamente los tokens
de sesión de Supabase y verifica que el resultado ya no contenga credenciales
del proveedor. Si no puede sanearla, cierra la sesión y falla de forma cerrada.
El E2E debe reconstruir en memoria las cookies `sb-*-auth-token*` emitidas por
`/auth/callback`, comprobar `Secure`, `HttpOnly` y `SameSite=Lax`, y afirmar que
la sesión persistida no contiene ninguno de esos campos. No se exportan HAR,
cookies ni tokens a logs o tickets y nunca se imprime su valor para “demostrar”
la prueba.

Turnstile protege la acción de Agorbis, pero el endpoint directo de Supabase
`/auth/v1/authorize?provider=google` no consume esa ceremonia ni está cubierto
por el CAPTCHA de alta por correo. Una llamada directa todavía puede crear una
identidad OAuth. La barrera de seguridad es que esa cuenta no puede participar
sin `/consentimiento`, el callback registra
`missing_or_expired_preflight` y el cron elimina, a los 30 días, sólo cuentas
sociales sin aceptación, actividad real, MFA ni ingreso reciente. La RPC
`purge_abandoned_oauth_accounts()` es exclusiva de `service_role`, procesa hasta
1.000 cuentas por corrida y se ejecuta desde
`/internal/purge-retained-data`; monitorear su ausencia, fallos y el agregado
`abandonedOAuth`, sin registrar correos ni identificadores.

Referencias:
[Google OAuth en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google),
[enlace de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking),
[dominios personalizados](https://supabase.com/docs/guides/platform/custom-domains)
y [verificación de marca de Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Cloudflare Workers

1. `wrangler.jsonc` es la única fuente versionada del runtime de Producción. Debe
   conservar `name = agorbis`, `main = dist/_worker.js`, Node compatibility,
   `workers_dev = false`, `preview_urls = false`, `run_worker_first = true`, el
   binding estático `ASSETS`, `account_id` exacto
   `4d78fb10c1ae65281ec851479d5045dc` y únicamente los custom domains `agorbis.com` y
   `www.agorbis.com`. Cloudflare termina ahora el tráfico HTTP; los registros web
   ya no son una topología DNS-only. No cambiar nameservers ni retirar los
   registros MX/SPF/DKIM/DMARC de Resend.
   Al 26-08-2026, apex y `www` están conectados como Custom Domains al Worker
   Cloudflare cerrado: el apex sirve el 503 esperado y `www` responde 308 hacia
   el mismo path/query del apex; existen cero Cron Triggers y Vercel ya no es el
   destino DNS web. Conservar el export de la zona y verificar que los registros
   de correo no cambiaron.
2. El build publicable es `pnpm build.cloudflare`: genera cliente y Worker,
   valida `dist/_worker.js` y ejecuta siempre el preflight. `package.json` fija
   Node 22.x y Wrangler 4.160.1. La atestación local
   `CLOUDFLARE_WORKERS_PLAN=paid` debe coincidir con el plan real: Free agotaría
   los 5/5 triggers y limita el CPU a 10 ms. Antes del corte, exportar e
   inspeccionar las **Cache Rules**, **Cache Response Rules** y las **Page
   Rules** legacy de la zona. Para el corte inicial, el responsable confirmó
   manualmente el 26-08-2026 que hay 0 Cache Rules activas, 0 Cache Response
   Rules activas y 0/3 Page Rules utilizadas, sin Cache Everything, Edge TTL
   forzado ni reglas sobre HTML/Auth; no se modificó la configuración. Para
   revisiones futuras queda disponible el auditor GET-only. El token se ingresa
   por prompt oculto o mediante
   `CLOUDFLARE_API_TOKEN` en el entorno; nunca por argv o archivo. La evidencia
   queda fuera del repositorio con permisos restrictivos y manifiesto SHA-256:

   ```bash
   pnpm cloudflare:cache-audit -- \
     --output-root "$HOME/.local/share/agorbis-cloudflare-cache-audits"
   ```

   El comando automatiza Cache Rules y Page Rules; mientras la API disponible no
   permita inventariar Cache Response Rules con el mismo gate, esa superficie se
   comprueba además en el Dashboard. Debe quedar demostrado que ninguna regla
   activa hace elegible o altera el cache de HTML dinámico, Auth, callbacks,
   cuenta o API; cualquier acción o estructura desconocida bloquea. Recién
   entonces
   cargar `CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED=true` en el entorno del
   preflight; es una atestación, no configura la zona. El runtime público final
   no usa `workers.dev`, preview URLs ni un segundo runtime.
   `wrangler.closed.jsonc` es el perfil del deployment cerrado en Paid: deriva
   exactamente de `wrangler.jsonc`, conserva `workers_dev=false`,
   `preview_urls=false`, los dos custom domains, `limits.cpu_ms=30000` y los tres
   `secrets.required`; cambia únicamente `AGORBIS_LAUNCH_MODE="closed"` y deja
   `triggers.crons=[]`. El endpoint cerrado responde 503 sin abrir Qwik, Assets
   ni housekeeping.

   El artifact excepcional congela además tres perfiles de mutación mínimos y
   exactos: `wrangler.traffic.jsonc` identifica sólo cuenta/Worker para mover
   tráfico entre Version IDs; `wrangler.crons-open.jsonc` contiene exactamente
   los cinco schedules aprobados; y `wrangler.crons-closed.jsonc` contiene cero
   schedules. El upload usa el `wrangler.jsonc` congelado, mientras promoción y
   rollback/recovery usan exclusivamente esos perfiles mínimos con argv
   versionado. Una propiedad, binding, dominio, schedule o configuración
   desconocida bloquea. El preflight exige estas derivaciones exactas, plan Paid
   e inventario remoto 3/3 antes de permitir el cutover.

3. Cargar `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET` —sólo el secret A— y
   `CRON_SECRET` como **Worker Secrets**, nunca como `vars` ni con prefijo
   `PUBLIC_`. `wrangler.jsonc` los declara en `secrets.required`, pero no contiene
   sus valores. El secret y la site key de B viven sólo en Supabase/Cloudflare y
   no se cargan en el Worker. SMTP/Resend y el secreto de Google se configuran en
   Supabase, no en Cloudflare Workers. Durante el onboarding, el inventario se
   valida después de cada `secret put` contra estados exactos y ordenados:
   `SUPABASE_SECRET_KEY` (1/3), luego más `TURNSTILE_SECRET` (2/3) y finalmente
   más `CRON_SECRET` (3/3). Una clave extra, faltante o fuera de etapa bloquea.
   Los estados 1/3 y 2/3 sólo permiten completar el onboarding; el preflight de
   cutover y la conexión de los custom domains exigen 3/3.
   El primer corte debe usar una `sb_secret_...` dedicada a Cloudflare y un
   `CRON_SECRET` nuevo. El secret A vigente puede cargarse temporalmente porque
   su hostname y allowlist continúan siendo `agorbis.com`; rotarlo después del
   smoke es recomendable para separar su custodia de Vercel, no un blocker del
   cutover. Después retirar variables, proyecto y tokens OIDC de Vercel y
   revocar únicamente las credenciales reemplazadas. No rotar B por esta
   migración.
4. Las siete vars públicas/runtime aprobadas sí quedan versionadas en
   `wrangler.jsonc`: `AGORBIS_LAUNCH_MODE="open"`, `AGORBIS_RUNTIME`, `PUBLIC_SITE_URL`,
   `PUBLIC_GOOGLE_AUTH_ENABLED`, `PUBLIC_SUPABASE_URL`,
   `PUBLIC_SUPABASE_ANON_KEY` y `TURNSTILE_HOSTNAMES`. Las 22 variables
   `PUBLIC_*` del bundle tienen una única fuente versionada en
   `scripts/cloudflare-public-build-environment.mjs`: el build cerrado recibe
   las confirmadas y deja vacías las pendientes/no aplicables; el build abierto
   ejecuta su `check-open` antes de compilar y bloquea mientras quede una
   requerida pendiente. El subprocess de Vite deshabilita `envDir`, por lo que
   no consulta `.env`, `.env.local` ni variantes de modo. El
   preflight exige que las cinco vars compartidas por build y runtime coincidan
   byte por byte con `wrangler.jsonc`; así el navegador y el Worker no pueden
   terminar apuntando a proyectos, hostnames o flags diferentes. Para el build
   también deben suministrarse `PUBLIC_TURNSTILE_SITE_KEY`, los datos públicos
   legales/AAIP y todos los pares de disclosures ES/EN enumerados en
   `.env.example`. No reutilizar `.env.local`, que pertenece exclusivamente al
   stack local. No
   usar `keep_vars=true`: el deploy debe retirar bindings plaintext desconocidos;
   esta opción no elimina Worker Secrets. Mantener `invocation_logs=false` para
   que Cloudflare no registre automáticamente URLs que puedan contener códigos;
   Agorbis conserva sólo logs custom saneados. Esto no elimina la metadata de
   request que Cloudflare muestra durante una sesión autenticada de Real-time
   Logs/`wrangler tail` (incluidos URL, IP y geolocalización de red): abrir tails
   sólo para diagnósticos acotados y filtrados, no pegar su salida cruda en
   tickets o chats y cerrarlos inmediatamente. `.assetsignore` excluye
   `sitemap.xml`, `404.html` y `q-manifest.json` para que no queden publicados
   como Static Assets.
5. Antes del corte, cargar además estas atestaciones exactas en el entorno donde
   se ejecuta el preflight. No configuran Supabase: hacen que el gate falle si el
   estado confirmado del Dashboard no coincide:

   ```dotenv
   SUPABASE_AUTH_CAPTCHA_ENABLED="true"
   SUPABASE_AUTH_CAPTCHA_PROVIDER="turnstile"
   SUPABASE_AUTH_IP_FORWARDING_ENABLED="true"
   SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED="true"
   SUPABASE_AUTH_SIGNUPS_ENABLED="true"
   SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED="true"
   SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED="true"
   SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED="false"
   SUPABASE_AUTH_PHONE_AUTH_ENABLED="false"
   SUPABASE_AUTH_MIN_PASSWORD_LENGTH="12"
   SUPABASE_AUTH_PASSWORD_REQUIREMENTS="letters_digits"
   SUPABASE_PLAN="free"
   SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED="false"
   SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED="true"
   SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED="true"
   SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS="2"
   SUPABASE_AUTH_SITE_URL="https://agorbis.com"
   SUPABASE_AUTH_REDIRECT_URLS="https://agorbis.com/auth/callback,https://agorbis.com/auth/confirm"
   SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED="password_changed,email_changed,identity_linked,identity_unlinked,mfa_factor_enrolled,mfa_factor_unenrolled"
   SUPABASE_LEGACY_SERVICE_ROLE_DISABLED="true"
   TURNSTILE_SUPABASE_GUARD_HOSTNAMES="agorbis.com"
   ```

   La protección contra contraseñas filtradas necesita un plan Supabase Pro o
   superior; con `SUPABASE_PLAN="free"` el preflight exige `"false"` y lo avisa
   (D91). El proyecto de producción sólo admite esas dos Redirect URLs. Las
   previews no reciben secretos ni conectan a este proyecto; los flujos
   protegidos se validan con Supabase local.

   Las variables públicas `PUBLIC_*_PROCESSING_LOCATION`,
   `PUBLIC_TRANSFER_SAFEGUARDS` y `PUBLIC_PROVIDER_RETENTION_SUMMARY`, junto con
   cada par `_EN`, alimentan `/subencargados`: deben describir el proyecto y los
   contratos reales, no una región supuesta. El texto de Cloudflare debe
   describir su red global, Workers como runtime HTTP, DNS autoritativo y las
   configuraciones Turnstile A/B, sin conservar la descripción DNS-only. En
   particular,
   `PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` documenta el mecanismo que ya cubre el
   primer request y cualquier otro flujo que llegue a Cloudflare Workers sin una
   decisión afirmativa previa y acreditable para ese tratamiento, incluida la lectura
   pública y, cuando corresponda, ingreso, recuperación, seguridad y ejercicio
   de derechos.
   Debe identificar cláusulas modelo AAIP efectivamente
   incorporadas, una aprobación documentada de AAIP o una excepción concreta
   del artículo 12. El consentimiento separado del alta sólo empieza después de
   la acción afirmativa y puede respaldar transferencias posteriores a destinos
   no adecuados; un DPA genérico tampoco alcanza para el primer request. El
   preflight exige además la inscripción AAIP y el domicilio completo.

6. El `CRON_SECRET` ya fue generado localmente con 32 bytes aleatorios. Cargarlo
   como Worker Secret sin pegarlo en chat ni versionarlo. El handler
   `scheduled()` convierte cada uno de los cinco schedules UTC en una `Request`
   interna autenticada hacia el mismo fetch handler Qwik: no realiza red, no
   expone el secret y falla ante un cron desconocido o respuesta no exitosa.
   Comprobar los cinco crons mediante Workers Logs y una alerta de ausencia:
   - `/internal/process-account-deletions`;
   - `/internal/cleanup-claim-uploads`;
   - `/internal/purge-retained-data`;
   - `/internal/sync-notifications`;
   - `/internal/escalate-claims`.
7. Conectar un monitor externo a `/internal/health`, que comprueba PostgREST,
   Auth y Storage, y alertar sobre 5xx, latencia y backlog de moderación.
   Ejecutar aparte un canario periódico real de correo hacia una casilla de
   prueba, con alerta de no recepción, bounces y complaints; no usar el health
   HTTP como disparador de correos.
8. Exigir MFA para Supabase, Resend, Cloudflare, Google Cloud y GitHub;
   revisar accesos al menos cada trimestre.

## Recuperación de MFA de moderación

Agorbis no ofrece un botón para retirar factores verificados. Supabase tampoco
genera recovery codes; se permiten dos factores TOTP para que el segundo pueda
servir de respaldo. Si una persona pierde ambos:

1. el responsable verifica la identidad mediante el procedimiento interno
   aprobado,
   fuera del correo o la sesión potencialmente comprometidos;
2. Sebastian autoriza y registra la recuperación. Mientras sea el único
   responsable no existe doble control: compensar con dos factores de respaldo,
   códigos de recuperación de las cuentas de infraestructura guardados cifrados
   fuera del dispositivo principal y alertas de inicio de sesión;
3. el administrador elimina el factor desde Supabase Auth, nunca desde el
   navegador ni exponiendo `SUPABASE_SECRET_KEY` a la aplicación cliente;
4. se revocan las sesiones de la cuenta y la persona vuelve a ingresar,
   registra TOTP otra vez y prueba una sesión `aal2`;
5. se conserva sólo el dato mínimo del incidente, sin copiar secretos TOTP ni
   códigos temporales a tickets, chats o logs.

Antes del lanzamiento hay que definir un canal de emergencia y probar que los
dos autenticadores de respaldo funcionan. Una copia sin probar no cuenta como
recuperación.

## Borrado de cuentas y objetos

La baja no depende de que Auth y Storage terminen en la misma transacción. La
aplicación prepara primero una outbox duradera y bloquea nuevas mutaciones de la
cuenta; después elimina el usuario de Auth. El cron
`/internal/process-account-deletions` retoma el trabajo de forma idempotente.

- La limpieza espera al menos 15 minutos desde la baja en Auth para absorber
  uploads que ya estaban en vuelo. Con el cron horario actual, una baja normal
  puede tardar entre 15 y 75 minutos en retirar avatar y borradores privados.
- Cada intento usa un lease. Los fallos se reintentan y, a los 20 intentos, el
  trabajo pasa a dead-letter para impedir un loop silencioso.
- La misma corrida barre, en lotes acotados, objetos huérfanos de `claims` y
  `avatars` con más de 24 horas. No elimina evidencia publicada que siga ligada
  a un reclamo visible. Quitar el vínculo del perfil no vuelve anónimos el texto
  ni la imagen; una solicitud de derechos dispara revisión, redacción o
  supresión caso por caso conforme a la política publicada.
- Alertar si el endpoint responde 5xx, si hay `dead-letter > 0`, si aumenta la
  edad del trabajo más antiguo o si el backlog no baja. Una alarma de ausencia
  de ejecución debe ser externa al propio cron.
- Para recuperar un dead-letter, corregir primero Auth/Storage o la causa de
  permisos, reactivar el trabajo mediante la RPC de reintento exclusiva de
  `service_role` y verificar que la siguiente corrida complete. No borrar la
  fila ni los objetos a mano sin inventariarlos.

Los registros ya completados de la outbox se conservan 30 días para diagnóstico
y luego se purgan. En local hay que ensayar como mínimo una baja sin archivos,
otra con avatar y borradores, un fallo transitorio de Storage y un dead-letter
reactivado.

## Resend y DNS

Verificar `agorbis.com` (o un subdominio transaccional) en Resend y copiar
exactamente los registros SPF/DKIM que entregue el panel. Empezar DMARC en modo
de observación y endurecerlo después de comprobar todos los remitentes.

`agorbis.com` está verificado en Resend con Forge (región `sa-east-1`). Los
registros de Resend son el TXT `resend._domainkey`, el CNAME `send` hacia
`send.forge.rmta.net`, el CNAME `rsend` hacia `rsend-sae1.forge.rmta.net` y el
TXT `resend-domain-verification` del apex, todos sin proxy. Junto con los de
Migadu forman la topología no web
`agorbis-non-web-dns-topology/2026-11-01/v2` (D104), que
`scripts/cloudflare-dns-audit.mjs` exige registro por registro.

En Supabase > Authentication > Email > SMTP Settings:

- sender: `Agorbis <no-reply@agorbis.com>` (o la identidad finalmente
  verificada);
- host: `smtp.resend.com`;
- port: `465` con TLS implícito;
- username: `resend`;
- password: la API key de Resend, cargada directamente en Supabase.

`RESEND_API_KEY` en `.env.local` no configura GoTrue y Agorbis no la consume.
No hace falta cargarla en el Worker mientras todos los correos sean de Supabase
Auth.
Mantener click/open tracking desactivado: el seguimiento de clicks reescribe los
TokenHash de un solo uso. Configurar alertas de bounces/complaints, probar en
local que abrir el enlace sólo muestra `/auth/confirm` y que el token se consume
recién al pulsar el botón, y repetir un smoke de entrega controlado en
Producción antes de abrir el registro.

## Turnstile

El dominio final es `agorbis.com` y la arquitectura usa dos configuraciones
Turnstile independientes, pero **sólo una se ejecuta en Agorbis**:

- **A, widget de la aplicación:** es el único que el navegador renderiza. Sus
  variables son `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` y
  `TURNSTILE_HOSTNAMES`. Cada formulario envía el token A a su handler de
  Agorbis. El handler llama a Siteverify con el secret A, envía la IP confiable
  como `remoteip` y exige `success`, la `action` exacta y un `hostname` de ese
  entorno. Siteverify aplica expiración y uso único; ante timeout, respuesta no
  JSON, error de red, action/hostname incorrectos o replay, el handler falla
  cerrado antes de tocar Auth.
- **B, guard de la API pública:** es una configuración separada cuyo secret se
  carga únicamente en Supabase Dashboard → Authentication → Bot and Abuse
  Protection. Su allowlist acepta sólo `agorbis.com`. B no se renderiza en
  Agorbis, su site key y su secret no viven en el repositorio, la app ni el Worker,
  y el flujo legítimo nunca genera ni transmite un token B.

Después de validar A, un adaptador Auth server-only estrecho usa la nueva
`sb_secret_...` de `SUPABASE_SECRET_KEY`, reenvía la IP confiable en
`Sb-Forwarded-For` y ejecuta la operación de Auth. **No envía `captchaToken`**:
el token A ya fue consumido por Siteverify y las credenciales secret de Supabase
no atraviesan el middleware CAPTCHA destinado a clientes públicos. El cliente
elevado se descarta al terminar y no se usa para tablas ni Storage; las lecturas
y escrituras posteriores vuelven al cliente de sesión pública y a RLS.

B conserva CAPTCHA global activo para que una llamada directa a Auth con la
`sb_publishable_...`/anon key y sin token falle con `captcha_failed`. No es una
segunda etapa del flujo de Agorbis: es una barrera contra el bypass del handler.
Por eso el token A tampoco se manda a B; además de estar consumido, fue emitido
para un secret diferente.

El widget A protege las entradas públicas de Auth de Agorbis: registro, ingreso
con contraseña, magic link, recuperación y reenvío de confirmación, cada una
con una `action` estable y distinta. En registro, A se carga recién después de
la casilla separada del Aviso de transferencias; las demás superficies pueden
necesitar ejecutarlo antes de que exista una aceptación comprobable y por eso
dependen del mecanismo previo documentado en `PUBLIC_TRANSFER_SAFEGUARDS`. No
se agrega CAPTCHA al cambio de contraseña, enrollment TOTP ni baja de cuenta:
esas operaciones autenticadas no lo requieren técnicamente. Conservan la
reautenticación, el límite autoritativo por cuenta y la auditoría
correspondientes.

Antes de retirar el bloqueo del preflight deben existir dos evidencias en el
mismo entorno: una llamada directa con publishable/anon key y sin CAPTCHA
devuelve `captcha_failed`, y un flujo legítimo con un token A fresco funciona
después de Siteverify sin enviar `captchaToken` a Supabase. También se prueba
que un token A repetido falla y que ni la site key ni el secret B aparecen en el
DOM o bundle. Esas pruebas tampoco reemplazan el estado ya verificado: las
Legacy API Keys están deshabilitadas, el JWT secret legado fue revocado y
Producción usa exclusivamente una nueva `SUPABASE_SECRET_KEY` server-only.

Referencias: [validación server-side de
Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
y [CAPTCHA en Supabase
Auth](https://supabase.com/docs/guides/auth/auth-captcha).

## Gate final

Con el artefacto ya construido y las variables reales cargadas:

```bash
pnpm preflight:production
```

El comando debe seguir fallando si `PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` sólo
describe consentimiento previo/expreso/informado. Para pasar, ambos textos
deben identificar el mecanismo argentino real ya aplicable a los requests
anteriores a esa decisión: cláusulas modelo AAIP incorporadas, aprobación
documentada de AAIP o una excepción concreta del artículo 12.

Mientras falte una condición clasificada como A en
[`GO_LIVE_CHECKLIST.md`](GO_LIVE_CHECKLIST.md), el **go-live** sigue bloqueado.
Las evidencias B/C no lo bloquean. El preflight comprueba claves, hostnames y
atestaciones, pero no puede sustituir la prueba real contra Siteverify y
Supabase Auth; esas pruebas críticas permanecen en el checklist humano del
corte y no se convierten en warnings.

Después se ejecuta el procedimiento y los smoke tests de
[`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md). Que el preflight pase no
reemplaza la revisión legal, el ensayo de restauración ni la observación humana
del corte.
