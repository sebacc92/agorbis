# 🌍 Agorbis

> **Estado al 24-10-2026.** Integración en `main`, sin desplegar. Corrige
> lo que dejaron los commits "Fase 1" y "batch N" del 18 y 19 de octubre; el
> detalle y el estado de cada punto están en
> [la revisión del 20-10-2026](docs/mejoras-priorizadas.md).
>
> - **Esquema.** El código de esta rama usa RPCs y tablas que crean
>   `0062`–`0066`, `0067` publica el aviso de Google y `0070` corrige los filtros
>   de Inicio. `0071` busca miembros públicos antes de paginar y `0072` permite
>   registrar el primer acuse institucional autorizado. Producción es desde el
>   24-10-2026 el proyecto nuevo `ibtvlvpxwourrxwcrfkf`, vacío: necesita las 69
>   migraciones (`0001`–`0072` sin `0059`, `0068` ni `0069`) **antes** de
>   desplegar (D92). El proyecto anterior y su ledger 60/60 ya no describen
>   Producción.
>   `pnpm db.contract.remote` (con `AGORBIS_SUPABASE_PROJECT_REF`) compara el
>   ledger real con lo que usa el código y falla si falta algo (ver [Migraciones y seed](#4-migraciones-y-seed)).
> - **Gate legal.** Se revirtió la parte legal de "Fase 1" (`d54c32b`): el alta
>   vuelve a pedir y registrar la aceptación versionada de los documentos y el
>   aviso de transferencias, y el borrador `0068` quedó rechazado (D73).
> - **Contenido ficticio.** Se retiraron de las rutas los componentes que
>   mostraban datos inventados o confirmaban cosas que sólo quedaban en el
>   navegador, y la ruta `/c/[slug]/actas` (D74).
> - **Terceros.** Los QR de los imprimibles se generan en el servidor y el mapa
>   ya no embebe OpenStreetMap: OpenStreetMap, WhatsApp y Telegram son enlaces
>   que abre la persona. La CSP no cambió (D76).
> - **CI.** `lint`, `test` y `test.release` están separados y `verify` corre los
>   tres (ver [Comandos](#comandos)). La CI todavía no corrió sobre esta rama.
> - **UI/UX.** La sexta ronda conserva ediciones durante envíos y recupera
>   formularios HTML de reportes, preferencias, solicitudes, retiro y relaciones.
>   Permite elegir el territorio sin JavaScript, distingue errores de presupuesto
>   y exportaciones, y muestra métricas, etapas y transiciones de estado precisas.
>   La selección y el recibo pertenecen a cada encuesta; la difusión muestra y
>   copia el mismo texto localizado. D90 está verificada localmente: tipos, lint,
>   1.142 pruebas unitarias/componentes, builds, 17 suites SQL y 36 casos E2E
>   seleccionados. La integración usa Supabase local en Docker. Ver D86–D90 y
>   [el detalle de la revisión](docs/mejoras-priorizadas.md).
>
> - **Plan de arranque (D91).** Supabase Free y Cloudflare Workers Paid. En
>   Free no existe la protección contra contraseñas filtradas: `SUPABASE_PLAN`
>   decide qué atestación acepta el preflight, que además avisa que no hay
>   backups administrados y que el proyecto se pausa tras una semana sin
>   actividad. Pasar a Pro vuelve a exigir la protección.
> - **Producción nueva (D92).** Proyecto Supabase `ibtvlvpxwourrxwcrfkf` en
>   `us-east-2`, Ohio, y cuenta Cloudflare SEBA. Al 30-10-2026 la zona
>   `agorbis.com` ya está en SEBA, apex y `www` están vinculados al Worker
>   `agorbis` inicial, que responde un 503 provisorio, y los widgets Turnstile
>   A y B existen. Faltan Workers Paid, secretos, Google o su baja, SMTP y el
>   push de migraciones; ver las notas del 24-10 y del 30-10 en el runbook.
> - **Google como opción de acceso (D122).** El perfil abierto del Worker lleva
>   Google encendido; el de respaldo y el cerrado siguen sólo con correo. La
>   identidad de la versión activa se verifica por id, etag, tag y mensaje
>   (D97). La activación pasa por el gate propio de Google del runbook.
>
> _Histórico, entrega del 08-09-2026:_ cinco mejoras funcionales, una mejora de
> errores de publicación y correcciones de cuenta/CSS. El candidato agregaba
> `0062`–`0065`, y esas migraciones sólo se aplicaron localmente. Google ya
> estaba activo en Supabase por el operador y Facebook seguía en pausa. El
> despliegue autorizado dependía de los checks documentados en
> [el plan de entrega](docs/improvements-release-2026-09-08.md).

**Unir a la humanidad, una comunidad a la vez.**

Agorbis organiza a las personas en comunidades geográficas jerárquicas —de la
Tierra a tu ciudad— para conocerse, decidir juntos, debatir, visibilizar
reclamos y proponer proyectos.

La guía pública de producto vive en `/manual`: su contenido está en
`src/lib/manual-content.ts` y sus preguntas, con ancla y tema, en
`src/lib/manual-faq.ts`. Para presentar la app en redes,
hay una serie de videos, guiones y criterios de medición en
[`docs/PROMOCION_VIDEO.md`](docs/PROMOCION_VIDEO.md).
El corte de Producción usa la clasificación estricta A/B/C y la secuencia de
[`docs/GO_LIVE_CHECKLIST.md`](docs/GO_LIVE_CHECKLIST.md).

La interfaz funciona en español e inglés, mientras que las publicaciones y
respuestas conservan el idioma en que cada persona las escribió. El contrato y
la guía para sumar nuevos idiomas están en
[`docs/INTERNACIONALIZACION.md`](docs/INTERNACIONALIZACION.md).

La idea central es una sola regla: **elegís dónde vivís y pasás a ser miembro de
toda tu cadena**. Si elegís Mar del Plata, sos miembro de Mar del Plata, General
Pueyrredón, Buenos Aires, Argentina, América del Sur y la Tierra. Podés votar y
comentar en las seis. Cualquier otra comunidad la podés seguir y leer, pero no
participar.

---

## Stack

| Capa           | Tecnología                                                     |
| -------------- | -------------------------------------------------------------- |
| Frontend / SSR | Qwik 2 + Qwik Router (`@qwik.dev/*`), TypeScript estricto      |
| Estilos        | Tailwind CSS v4 (config CSS-first con `@theme`)                |
| Backend        | Supabase: Auth, Postgres con RLS en todas las tablas y Storage |
| Validación     | Zod, vía `zod$` en cada action                                 |
| Deploy         | Cloudflare Workers + Static Assets                             |
| Gráficos       | SVG propio y mapamundi interactivo con `@svg-maps/world`       |

Qwik Router `2.0.0-beta.40` lleva un parche puntual de pnpm en
[`patches/@qwik.dev__router@2.0.0-beta.40.patch`](patches/@qwik.dev__router@2.0.0-beta.40.patch).
Corrige la clonación de un POST ya leído al renderizar los loaders de un
formulario HTML, conservando contexto HTTP, `strictLoaders` y validaciones.
Se aplica automáticamente con `pnpm install`; no cambia la versión del paquete.
Al actualizar el router hay que verificar el arreglo upstream y retirar el
parche sólo cuando pasen las pruebas nativas. El cierre de dependencias cambió;
un release necesita la validación de inventarios y hashes de D72, sin
rebaselinar sus valores dentro de esta mejora de producto.

---

## Puesta en marcha

### 1. Requisitos

- Node **22.22.0** exacto (`.nvmrc`). `engines` acepta `22.x`, pero la CI y los
  gates de release comparan la versión exacta.
- pnpm **11.15.0** (`packageManager`; con Corepack: `corepack enable`).
- [Supabase CLI](https://supabase.com/docs/guides/cli) y Docker (para el entorno local)

### 2. Instalar

```bash
pnpm install
```

### 3. Levantar Supabase local

```bash
pnpm exec supabase start
```

El comando imprime las URLs y las claves. Copialas al `.env`:

```bash
cp .env.example .env
```

```dotenv
PUBLIC_SUPABASE_URL="http://127.0.0.1:54821"
PUBLIC_SUPABASE_ANON_KEY="<PUBLISHABLE_KEY que imprimió supabase start>"
SUPABASE_SECRET_KEY="<SECRET_KEY que imprimió supabase start>"
OPENAI_API_KEY="<tu clave, sólo servidor>"
OPENAI_SUMMARY_MODEL="<modelo compatible con Structured Outputs>"
CRON_SECRET="<al menos 32 bytes aleatorios para las rutas internas>"
PUBLIC_SITE_URL="http://localhost:5173"
PUBLIC_GOOGLE_AUTH_ENABLED="false"
PUBLIC_FACEBOOK_AUTH_ENABLED="false"
PUBLIC_GOOGLE_PROCESSING_LOCATION="<destino real, español; obligatorio al habilitar Google>"
PUBLIC_GOOGLE_PROCESSING_LOCATION_EN="<actual destination, English; required when Google is enabled>"
PUBLIC_TURNSTILE_SITE_KEY="<site key del widget A>"
TURNSTILE_SECRET="<secret del widget A, sólo servidor>"
TURNSTILE_HOSTNAMES="localhost,127.0.0.1"
PUBLIC_LEGAL_CONTROLLER_NAME="<responsable legal>"
PUBLIC_LEGAL_CONTACT_EMAIL="<correo de privacidad>"
PUBLIC_AAIP_CONTROLLER_ID="<código público RL-... del responsable>"
PUBLIC_AAIP_DATABASE_REGISTRATION_ID="<número de la constancia aprobada del Paso 2>"
PUBLIC_SUPABASE_PROCESSING_LOCATION="<destino real, español>"
PUBLIC_SUPABASE_PROCESSING_LOCATION_EN="<actual destination, English>"
PUBLIC_RESEND_PROCESSING_LOCATION="<destino real, español>"
PUBLIC_RESEND_PROCESSING_LOCATION_EN="<actual destination, English>"
PUBLIC_CLOUDFLARE_PROCESSING_LOCATION="<destino real, español>"
PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN="<actual destination, English>"
CLOUDFLARE_WORKERS_PLAN="<paid para el corte de Producción>"
PUBLIC_TRANSFER_SAFEGUARDS="<mecanismo argentino previo real, español>"
PUBLIC_TRANSFER_SAFEGUARDS_EN="<actual prior Argentine mechanism, English>"
PUBLIC_PROVIDER_RETENTION_SUMMARY="<retención real, español>"
PUBLIC_PROVIDER_RETENTION_SUMMARY_EN="<actual retention, English>"
```

La configuración de Google y Facebook, callbacks y validación previa se describe en
[la guía de acceso social](docs/social-auth-setup.md). Los proveedores se habilitan por separado.

Las variables sin prefijo `PUBLIC_` nunca llegan al navegador.
`SUPABASE_SECRET_KEY` contiene una clave moderna `sb_secret_...`; aunque
Supabase la traduce internamente al rol PostgreSQL `service_role`, no se usa el
nombre legado para evitar confundir una secret key moderna con la JWT
`service_role`. Los resúmenes se generan bajo demanda; el modelo no tiene un
fallback oculto. Los textos legales de proveedores requieren pares ES/EN; el
preflight bloquea producción si falta una traducción o si las salvaguardas sólo
mencionan un DPA sin identificar el mecanismo argentino para destinos no
adecuados. `PUBLIC_TRANSFER_SAFEGUARDS` no describe el consentimiento que se
pide al crear una cuenta: debe cubrir el primer request y el tráfico HTTP
anónimo que recibe Cloudflare Workers antes de que sea posible obtener ese
consentimiento.
El preflight sólo acepta cláusulas
modelo AAIP efectivamente incorporadas, una aprobación documentada de AAIP o
una excepción concreta del artículo 12; el consentimiento del alta no tiene
efecto retroactivo.

D72 y la política AAIP versionada distinguen dos estados honestos de la
inscripción de la base: `AAIP_DATABASE_REGISTRATION_STATUS=pending`, sin ID y
sin afirmar que la base está inscripta, y `approved`, que exige el ID real de la
constancia aprobada del Paso 2. `RL`, `EX`, `RE`, `PV`, `IF`, estados pendientes
y placeholders no sustituyen ese ID. El release normal exige `approved`; el
dry-run excepcional puede conservar `pending` sólo como riesgo visible y
aceptado individualmente.

Las correcciones ES/EN para no afirmar destinos, DPAs, retención o salvaguardas
sin evidencia se materializan en el bundle como versiones `2026-08-29.1`. El
[draft legal de evidencia externa](docs/legal-drafts/README.md) permanece como
fuente histórica `draft_not_active`. La migración
`0060_activate_pending_external_evidence_legal_notices.sql` ya fue aplicada y
verificada en Producción para activar esas versiones honestas. Nada de ello
acredita evidencia externa ni constituye una conclusión de cumplimiento
jurídico.

El alta presenta además un Aviso de transferencias internacionales separado de
Privacidad, Términos y Normas. Su decisión afirmativa tiene versión y hash
propios, y sólo cubre las transferencias de cuenta posteriores a esa acción. Si
la persona no consiente puede seguir leyendo contenido público, pero la
infraestructura actual no permite crear o mantener su cuenta.

#### Turnstile: A en Agorbis y B sólo en Supabase

Agorbis renderiza únicamente el widget **A** en las superficies públicas de
Auth protegidas. El navegador envía su token al handler de Agorbis y ese handler
lo consume en Siteverify, donde exige `success`, la `action` esperada y un
`hostname` permitido. Recién después llama a Supabase Auth con la
`SUPABASE_SECRET_KEY` server-only. Esa llamada elevada **no envía
`captchaToken`**: el token A ya fue consumido y nunca se reutiliza.

La configuración **B** vive exclusivamente en Supabase Dashboard →
Authentication → Bot and Abuse Protection. Su secret y su site key no se
guardan en el repositorio ni en la app, y Agorbis nunca renderiza B ni
genera un token B. B hace fallar con `captcha_failed` las llamadas directas a
Auth que usen la publishable/anon key sin CAPTCHA.

El preflight de producción exige que el Dashboard y la rotación de claves hayan
quedado verificados mediante estas atestaciones; las variables no modifican
Supabase por sí solas:

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

Las atestaciones largas reflejan el estado revisado del Dashboard; no lo
configuran. La protección contra contraseñas filtradas requiere Supabase Pro o
superior; el arranque usa Free, así que `SUPABASE_PLAN="free"` exige atestarla
en `"false"` y el preflight lo avisa (D91). La política de contraseñas es de
12 caracteres con letras y números, `letters_digits` en el vocabulario del
CLI; mayúsculas y símbolos no son obligatorios (D101). Las Redirect URLs son
exactamente dos y no admiten comodines de preview en el proyecto de
producción.

No se agrega Turnstile al cambio de contraseña, enrollment TOTP ni baja de
cuenta: son operaciones autenticadas que no lo requieren técnicamente. Conservan
reauthenticación, límites antiabuso y auditoría sin sumar fricción innecesaria.
La base limita cada perfil a 10 generaciones reales cada 10 minutos. En
producción conviene sumar también un presupuesto duro en el proyecto del
proveedor para cubrir abuso mediante cuentas múltiples.

#### Avatares privados y acotados

El navegador re-encodea el avatar a un máximo de 512 px para corregir
orientación, quitar metadata y evitar descargar una foto de cámara completa en
cada página. El servidor vuelve a inspeccionar y reconstruir sus bytes, limita
dimensiones y tamaño, y recién entonces lo escribe con `service_role`.

El bucket `avatars` es privado. `/media/avatares/...` sólo entrega el objeto que
siga referenciado por el perfil; un upload abandonado o reemplazado nunca se
convierte en una URL pública y el cron lo retira después del margen operativo.

### 4. Migraciones y seed

```bash
pnpm db.reset      # supabase db reset: corre migraciones + seed
```

El ledger ejecutable del release es exactamente `0001`–`0058` + `0060` +
`0061`. La verificación remota del 06-09-2026, sobre el proyecto anterior (D92), confirmó ese mismo ledger 60/60:
`0061_reconcile_sequence_acl_drift.sql` ya estaba aplicada y el dry-run devolvió
`upToDate: true`. No se ejecutaron migraciones remotas durante esa verificación.
Los borradores versionados viven en
`supabase/migration-drafts/`, fuera del glob de Supabase, por lo que
`pnpm db.reset`, CI, `migration list` y `db push` no aplican ni proponen ninguno.
Es el único lugar para SQL que no es una migración: no hay borradores en
`docs/`.
El runner focal de `0059` requiere una confirmación literal y usa una copia
local efímera; no forma parte de la suite normal ni del ledger productivo.

`0059` permanece `draft_not_applied`, sólo en `supabase/migration-drafts/` y
ausente de Producción; no debe aplicarse para D72. El request excepcional puede
aceptar el gate individual
`legal.sensitive-consent-0059-omitted`, enumerando el riesgo de no contar con su
consentimiento específico y versionado en todas las superficies afectadas. Ese
riesgo no es un `PASS`, no demuestra conformidad jurídica ni autoriza una
apertura; tampoco habilita degradar RLS, Storage, antiabuso o privacidad de
boletas.

#### Migraciones posteriores a ese ledger

El código actual necesita las siguientes. Desplegarlo sobre un entorno que no las
tiene rompe en runtime con un 404 de PostgREST, que ni `tsc` ni los tests ven
porque los tipos se generan de la base local:

| Migración                                       | Qué agrega                                                                                                                                                                                                                                                                       | Dónde lo usa el código                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `0062_search_ordered_pagination.sql`            | Redefine la RPC `global_search` (orden por relevancia o fecha antes de paginar) sobre `private.global_search_ordered`                                                                                                                                                            | `/buscar`, buscador de comunidades, selector de contenido   |
| `0063_data_deletion_requests.sql`               | RPCs `create_`/`list_`/`update_data_deletion_request`, `reissue_`/`read_data_deletion_receipt`; tablas privadas `data_deletion_requests` y `data_deletion_lookup_windows`                                                                                                        | `/moderacion/eliminaciones`, `/eliminar-datos/seguimiento`  |
| `0064_notification_preferences.sql`             | Tabla `notification_preferences` con RLS propia, RPCs `notification_inbox`, `notification_communities` y `mark_notifications_read`, trigger que aplica las preferencias                                                                                                          | `/notificaciones`, exportación de `/perfil/datos`           |
| `0065_public_profile_handles.sql`               | RPC `public_profile_by_username` y reserva privada de nombres (`private.public_profile_handles`); redefine `handle_new_user`                                                                                                                                                     | `/u/<usuario>`                                              |
| `0066_google_auth_consent.sql`                  | Tablas `google_auth_notice_versions` y `user_google_auth_consent_events`; RPCs `current_google_auth_notice`, `my_`/`grant_`/`withdraw_google_auth_consent`                                                                                                                       | Acceso con Google, `/perfil/acceso-google`, `/perfil/datos` |
| `0067_activate_google_auth_notice.sql`          | Sólo publica el aviso de Google `2026-09-09.1`; no acepta por nadie ni enlaza cuentas                                                                                                                                                                                            | Lo leen las RPCs de `0066`                                  |
| `0070_personalized_feed_filters.sql`            | Agrega una sobrecarga de seis argumentos de `personalized_feed`: filtra comunidad y tipo antes de paginar; conserva la firma anterior y la privacidad de resultados                                                                                                              | `/inicio`                                                   |
| `0071_public_member_search.sql`                 | Agrega una sobrecarga de cinco argumentos de `community_public_members`: busca nombre y foto antes del cursor y del límite; mantiene el opt-in y la firma anterior                                                                                                               | `/c/[slug]/miembros`                                        |
| `0072_claim_institutional_response_clock.sql`   | Corrige la guarda del reclamo para admitir exclusivamente el timestamp automático de su primer evento institucional autorizado, sin ampliar ACL ni RLS                                                                                                                           | Seguimiento institucional de `/reclamos/[id]`               |
| `0073_turnstile_invisible_privacy_addendum.sql` | Publica Privacidad `2026-11-02.1`, que cita el Turnstile Privacy Addendum de Cloudflare para usar el widget A en modo invisible; retira `2026-08-29.1` sin crear aceptaciones (D109)                                                                                             | `/privacidad` y `/consentimiento`                           |
| `0074_agreements.sql`                           | Acuerdos entre comunidades: `agreements`, `agreement_parties` y `polls.agreement_id`; rondas como encuestas binarias ligadas, estado derivado en lectura, escrituras sólo por RPC definer; `poll_feed` y `personalized_feed` excluyen las rondas (D118)                          | `/acuerdos/[id]`, sección Acuerdos en Encuestas e inicio    |
| `0075_agreement_moderation.sql`                 | Moderación de acuerdos: estado `removed` con memoria del estado previo, RPC `moderate_agreement` (ocultar/restaurar, sólo moderación con MFA, también sobre las rondas), lectura oculta a quien no modera, `reports` acepta `agreement`, rastro en `moderation_audit_log` (D120) | Cola de moderación, botón Reportar en `/acuerdos/[id]`      |
| `0076_argentina_local_governments.sql`          | Sólo datos: 1.981 gobiernos locales de Argentina como nivel 4 (Georef) y cinco localidades bonaerenses a nivel 5 bajo su partido; falla cerrado si un slug ya existe y verifica los totales (D127)                                                                               | `/explorar`, alta y cambio de residencia, buscador          |

`0070` debe aplicarse **antes** de desplegar el Worker que usa los filtros de
Inicio. Sólo se verificó contra Supabase local; no se aplicó remotamente. Su
reversión consiste en restaurar el Worker anterior y borrar únicamente la
sobrecarga de seis argumentos, como indica la cabecera de la migración.

`0071` también debe aplicarse **antes** del Worker que busca miembros públicos.
Se verificó y aplicó sólo en Supabase local. Mantiene la firma previa y los
perfiles anónimos; la reversión restaura el Worker anterior y elimina sólo la
sobrecarga de cinco argumentos indicada en la migración.

`0072` corrige un conflicto entre triggers que revertía la primera respuesta de
un representante verificado. Sólo admite el primer timestamp automático, en una
escritura anidada sin otros campos modificados. Se aplicó y verificó sólo en
Supabase local; queda pendiente para el entorno destino. No modifica firmas,
ACL ni RLS. Para revertirla se restaura la definición de
`guard_claim_institutional_update` de `0018`, lo que también restaura ese fallo.

```bash
pnpm db.contract          # cada .rpc()/.from() de src/ existe en database.types.ts (corre en lint)
AGORBIS_SUPABASE_PROJECT_REF=ibtvlvpxwourrxwcrfkf pnpm db.contract.remote
                          # ledger de ese proyecto vs. lo que usa el código; falla si falta una
```

`db.contract.remote` sólo lee (`supabase migration list --project-ref
"$AGORBIS_SUPABASE_PROJECT_REF"`) y no aplica nada. Sin la variable falla
antes de hablar con Supabase: el destino se escribe siempre completo y nunca
con `--linked`, que depende del enlace local (`supabase/.temp`) y puede apuntar
a otro proyecto. Las migraciones se aplican con el procedimiento del
[runbook](docs/PRODUCTION_RUNBOOK.md).

#### Borradores (`supabase/migration-drafts/`)

| Archivo                                              | Estado                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `0059_versioned_sensitive_participation_consent.sql` | **Borrador local, no aplicar.** Sólo se prueba con `pnpm db.test.draft-0059:ephemeral` sobre una copia efímera |
| `google-auth-notice-2026-09-09.json`                 | Snapshot del aviso de Google ya fijado en `0067`; no es una migración                                          |

El preflight de Producción y la evidencia D72 fijan que ese directorio tenga
sólo `0059` como SQL. El SQL sin proponer (`0068`, rechazado por D73, y
`0069`, incompleto) vive en [`supabase/sql-drafts/`](supabase/sql-drafts/README.md).

Promover un borrador a `supabase/migrations/` exige revisión y autorización
separadas ([convención](supabase/migration-drafts/README.md)).

Al final de `pnpm db.reset` tenés que ver, en la salida:

```
NOTICE:  OK · is_member verificado para sofia_mdq (5 comunidades de su cadena, 0 fuera de ella)
NOTICE:  OK · 3901 comunidades · N miembros globales
```

La migración `0058` deja 3.901 comunidades: 1 de nivel 0, 6 de nivel 1, 195 de
nivel 2, 3.559 de nivel 3 y 140 de nivel 4. Las 236 comunidades
declaradas directamente en `seed.sql` forman el subconjunto base histórico. Las
migraciones `0014`–`0016` y las tres localidades de `0017` completan el total.

Ese bloque es una prueba real de la regla de pertenencia: si `is_member`
devolviera `true` para una comunidad fuera de la cadena de Sofía, el seed falla
y no termina. **Si ves esas dos líneas, el corazón del modelo funciona.**

> **¿Aplicaste las migraciones sueltas contra una base que ya tenía el seed
> corrido de antes** (el flujo típico contra Supabase cloud, pegando cada
> archivo en el SQL Editor)? Los cambios de **contenido demo** que se agregan a
> `seed.sql` en migraciones posteriores no llegan solos: `seed.sql` completo
> sólo corre en un `db reset`. Si `rls_checks.sql` falla en assertions sobre
> datos demo específicos (ver D53 en `DECISIONS.md`), buscá si hay un
> `supabase/seed_resync_*.sql` para esa migración y corrélo una vez.

### 5. Regenerar los tipos de la base

`src/lib/database.types.ts` se genera íntegramente contra el esquema local.
Los alias de dominio que PostgreSQL modela como `text` con restricciones
`CHECK` viven separados en `src/lib/database.types.helpers.ts`, por lo que una
regeneración no los borra. Con Supabase corriendo:

```bash
pnpm db.types
```

### 6. Desarrollo

```bash
pnpm dev           # http://localhost:5173
```

### Tareas automáticas

Un reclamo puede adjuntar hasta cuatro imágenes. El servidor valida el formato,
elimina metadatos y las guarda con nombres opacos en el bucket privado `claims`.
Antes de publicar, sólo su dueño puede ver la preview; después se sirven por una
ruta de Agorbis mientras el reclamo siga visible, sin exponer el path físico.
`/internal/cleanup-claim-uploads` elimina cada día los borradores que no se
vincularon a un reclamo en 24 horas. El bucket `avatars` también es privado y
el proxy sólo entrega la referencia vigente del perfil.

En Cloudflare, cargá `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET` y un
`CRON_SECRET` aleatorio como Worker Secrets. Los cinco Cron Triggers de
[`wrangler.jsonc`](wrangler.jsonc) invocan el handler `scheduled()`; éste
despacha internamente al mismo handler Qwik mediante una `Request` sintética
con `Authorization: Bearer <CRON_SECRET>`, sin salir por la red. No expongas ni
llames esas rutas desde el navegador.
`/internal/cleanup-claim-uploads` limpia imágenes provisionales,
`/internal/sync-notifications` cierra encuestas vencidas y
`/internal/escalate-claims` sube de nivel los reclamos que vencieron su ventana
de respuesta sin que ninguna institución acusara recibo (D58), y
`/internal/purge-retained-data` aplica los plazos de conservación operativa. El
cambio de estado dispara las notificaciones deduplicadas para autores y
participantes. El quinto cron, `/internal/process-account-deletions`, completa
la limpieza de Storage después de borrar Auth: espera al menos 15 minutos,
reintenta de forma idempotente, deriva a dead-letter tras 20 fallos y barre en
lotes los objetos huérfanos de más de 24 horas. Con su frecuencia horaria, la
limpieza normal de una baja puede tardar entre 15 y 75 minutos.

### Búsqueda y expansión geográfica

`/buscar` reúne comunidades, encuestas, debates, reclamos, proyectos e
instituciones. Admite filtros por tipo, estado y territorio; la normalización
permite encontrar `Córdoba` escribiendo `cordoba`.

Las solicitudes de comunidades se revisan en `/moderacion/solicitudes`. Al
aprobar una, PostgreSQL valida la relación padre/nivel, detecta duplicados,
genera un slug globalmente único, calcula el `path`, crea el nodo y notifica al
solicitante dentro de una sola transacción.

### Encuestas y cobertura geográfica

Las encuestas tienen diez categorías (comunidad, ambiente, salud, educación,
transporte, cultura, deportes, economía, tecnología y seguridad). Se pueden
filtrar dentro de cada comunidad, y el máximo de selecciones de una encuesta
múltiple se hace cumplir en PostgreSQL, no sólo en la interfaz.

La migración `0014_geography_south_america.sql` agrega 217 subdivisiones de
primer nivel de los otros once países de América del Sur —incluidos los 19
departamentos uruguayos— y los 127 partidos bonaerenses que no estaban ya en
la aplicación. Argentina ya tenía sus 23 provincias y CABA; las ocho
comunidades bonaerenses que coinciden con municipios se preservaron. Las
ciudades existentes de Mar del Plata y Miramar siguen disponibles y se suman
General Pueyrredón y General Alvarado como partidos. Desde `0076` (D127), Mar
del Plata y Miramar son nivel 5 dentro de su partido.

La migración `0016_world_subdivisions.sql` completa el primer nivel
administrativo mundial: 3.559 provincias, estados, departamentos, regiones,
gobernaciones o equivalentes en 194 de los 195 países. Ciudad del Vaticano no
tiene una división de ese nivel y queda correctamente sin hijos artificiales.
La importación preserva las 241 unidades sudamericanas anteriores y sus slugs,
para no romper enlaces ni contenido existente.

Los nombres y códigos actuales provienen del archivo
[admin1CodesASCII de GeoNames](https://download.geonames.org/export/dump/).
[geoBoundaries gbOpen](https://www.geoboundaries.org/globalDownloads.html)
aporta coordenadas aproximadas para 2.378 unidades cuyo nombre coincide. Los
135 municipios bonaerenses siguen viniendo de la
[API Georef de Argentina](https://datos.gob.ar/dataset/otros-georef-api-georef).
El generador reproducible y su auditoría quedan en
`scripts/gen-world-subdivisions.mjs` y junto a la migración, respectivamente.

La migración `0076_argentina_local_governments.sql` (D127) completa el nivel 4
de Argentina con 1.981 gobiernos locales de la misma API Georef: municipios en
20 provincias, las 15 comunas de CABA y departamentos en Santa Cruz y Santiago
del Estero, donde Georef no trae municipios. Baja a nivel 5 las cinco
localidades bonaerenses que convivían con su propio partido. La genera
`scripts/build-argentina-level4-migration.mjs`; no se edita a mano.

El mapamundi de `/explorar` usa las geometrías de
[`@svg-maps/world`](https://www.npmjs.com/package/@svg-maps/world), derivadas de
MapSVG y publicadas bajo licencia CC BY 4.0. La interfaz filtra el mapa contra
los 195 países existentes en la base de Agorbis. `pnpm map.generate`
regenera la versión optimizada que se entrega al navegador y los marcadores
que permiten seleccionar microestados.

### Usuarios demo

El seed crea ocho cuentas locales. Todas usan la contraseña
`AgorbisLocal-2026!`; nunca se cargan en Supabase Cloud ni en Producción:

| Mail                     | Rol       | Vive en       |
| ------------------------ | --------- | ------------- |
| `admin@agorbis.test`     | admin     | Mar del Plata |
| `moderador@agorbis.test` | moderador | Argentina     |
| `sofia@agorbis.test`     | usuario   | Mar del Plata |
| `bruno@agorbis.test`     | usuario   | La Plata      |
| `carla@agorbis.test`     | usuario   | Córdoba       |
| `diego@agorbis.test`     | usuario   | Mendoza       |
| `elena@agorbis.test`     | usuario   | CABA          |
| `flor@agorbis.test`      | usuario   | Tandil        |

Los mails salientes (confirmaciones, magic links y recuperación) quedan en el
SMTP local:
<http://127.0.0.1:54824>.

---

## Cuotas de publicación

Cualquier persona que **resida** en una comunidad puede crear encuestas,
debates, reclamos y proyectos ahí. Lo que regula el volumen es una cuota mensual
por nivel geográfico:

| Nivel          | Encuestas | Debates | Proyectos | Reclamos |
| -------------- | --------- | ------- | --------- | -------- |
| 0 · Global     | 1         | 1       | 1         | 1        |
| 1 · Continente | 2         | 2       | 2         | 3        |
| 2 · País       | 3         | 3       | 3         | 5        |
| 3 · Provincia  | 5         | 5       | 5         | 8        |
| 4 · Ciudad     | 8         | 8       | 8         | 10       |

El principio: **el costo de publicar escala con el alcance**. Una encuesta global
la ven millones; una municipal es hiperlocal. El cuello de botella está arriba.

- Se renueva el día 1 de cada mes (UTC) y **no se acumula**.
- Se consume al publicar, no al abrir el formulario.
- Si el autor da de baja su contenido **dentro de las 24 horas**, el cupo vuelve.
  Pasado ese plazo, no — así no se puede reciclar cupo publicando y borrando.
- Si lo baja moderación, el cupo también vuelve: que te oculten un post no
  debería costarte el mes.
- Moderación y administración no tienen tope.

Los valores están en la tabla `content_quotas` y se pueden ajustar sin desplegar.

---

## Rendición de cuentas y decisión colectiva

Tres funciones que se apoyan entre sí. El razonamiento completo está en
`DECISIONS.md`; acá va lo mínimo para ubicarlas.

**Escalamiento por silencio (D58).** Cada reclamo arranca con una ventana de
respuesta según su nivel (`claim_response_windows`). Si vence sin que ninguna
institución acuse recibo —basta un evento con `organization_id`, decir
"recibido" es barato— y el reclamo juntó apoyo proporcional a la población, el
cron `/internal/escalate-claims` lo muestra además en la comunidad padre. No
hay botón de "elevar": sería una superficie de brigading. El reclamo **no se
muda**, sigue perteneciendo a donde ocurre el problema.

**Presupuesto participativo (D59).** Una partida por comunidad y período que se
reparte votando: cada residente recibe fichas y las distribuye entre proyectos,
con tope por proyecto. Las cuatro fechas definen las fases, sin estado que mover
a mano. El reparto es codicioso por fichas y saltea lo que no entra por monto.
**La v1 no mueve dinero**: registra la decisión y la rendición, la transferencia
ocurre afuera. Para votar, la residencia tiene que estar declarada antes de que
abriera la votación. Cada persona emite una sola vez; los resultados aparecen
al cierre únicamente cuando participaron al menos cinco personas.

**Contraste entre hermanas (D60).** Compara el perfil de reclamos por cada mil
habitantes entre las sub-comunidades de un territorio. No hay ranking ni
puntaje agregado. El contraste de votos se eliminó porque exige conservar un
vínculo entre preferencia y territorio que el modelo privado ya no guarda.

---

## Cómo verificar que funciona

El criterio de aceptación, paso a paso. Entrá como `sofia@agorbis.test`:

1. **Cadena de residencia** → `/perfil` muestra las 5 comunidades de las que es
   miembro.
2. **Info de la comunidad** → `/c/mar-del-plata` muestra las 7 fichas de la wiki.
   Lo mismo en `/c/argentina`, `/c/south-america` y `/c/earth`.
3. **Votar una encuesta nacional** → `/c/argentina/encuestas`, entrá a una y
   votá. La cuenta conserva una constancia sin elección y la preferencia se suma
   a contadores agregados: no hay voto público ni boleta individual recuperable.
4. **Resultados protegidos** → mientras la encuesta está abierta no aparece
   ningún recuento, ni siquiera después de votar. Al cerrar, las barras y el CSV
   sólo se publican con cinco participantes o más; con menos tampoco se muestra
   el total exacto.
5. **Debatir sólo en tu columna** → en el debate de `/c/argentina/debates`, Sofía
   ve el composer únicamente en la columna **Buenos Aires**. Las otras 23 son de
   sólo lectura.
6. **Apoyar un reclamo local** → `/c/mar-del-plata/reclamos`, botón "Me afecta
   también".
7. **Comprometer un aporte** → `/c/mar-del-plata/proyectos`, panel de compromiso.
8. **Ver quién vive en tu comunidad** → `/c/mar-del-plata/miembros` muestra los
   avatares de quienes eligieron ser visibles. La membresía faltante es anónima:
   con una a cuatro personas se informa sólo que existen y, desde cinco, un
   mínimo redondeado hacia abajo en bloques de cinco. El permiso de aparecer es
   por comunidad y se puede revocar.

### Que la cuota no se puede evadir

La cuota la aplica un trigger de base de datos, no la aplicación. Con el token de
Sofía, salteando la interfaz por completo:

```bash
# 1. Token de Sofía
SOFIA_JWT=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"sofia@agorbis.test","password":"AgorbisLocal-2026!"}' | jq -r .access_token)

# 2. Resumen de sus propias cuotas (la RPC rechaza consultar otro usuario)
curl -s "$SUPABASE_URL/rest/v1/rpc/quota_summary" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SOFIA_JWT" \
  -H "Content-Type: application/json" \
  -d '{"p_user":"33333333-3333-4333-8333-333333333333"}'
# => resumen de cuotas del usuario autenticado; no acepta consultar a terceros

# 3. Repetir este POST hasta agotarlo; el que sobra devuelve 400:
curl -s "$SUPABASE_URL/rest/v1/claims" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SOFIA_JWT" \
  -H "Content-Type: application/json" \
  -d '{"community_id":"<id de mar-del-plata>",
       "author_id":"33333333-3333-4333-8333-333333333333",
       "title":"Uno de mas","description":"Deberia rechazarse","category":"otro"}'
# => {"code":"23514","message":"GEOUNITY_QUOTA_EXCEEDED: sin cupo de claim en el nivel 4"}
```

El prefijo `GEOUNITY_QUOTA_EXCEEDED` es lo que la aplicación traduce a
_"Agotaste tu cupo mensual de reclamos en Mar del Plata. Se renueva el 1 de
septiembre"_, junto con el nivel alternativo donde sí queda cupo.

La suite completa de estas verificaciones —incluidas las pruebas negativas de
cada policy de escritura— está en `supabase/tests/rls_checks.sql`:

```bash
pnpm db.test
```

Corre dentro de una transacción que termina en `ROLLBACK`, así que no deja
rastro y se puede repetir.

### Y que la barrera es real, no cosmética

Lo importante no es que la UI esconda el botón, sino que la base rechace la
operación. Con Supabase corriendo:

```sql
-- Sofía vive en Mar del Plata. ¿Es miembro de Córdoba?
select public.is_member(
  (select id from profiles where username = 'sofia_mdq'),
  (select id from communities where slug = 'cordoba')
);
-- => false
```

Y el intento de escritura, salteando la interfaz por completo:

```bash
# Token de Sofía (pedilo con signInWithPassword) contra PostgREST directo.
curl -X POST "http://127.0.0.1:54821/rest/v1/debate_comments" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $SOFIA_JWT" \
  -H "Content-Type: application/json" \
  -d '{"debate_id":"c0000000-0000-4000-8000-000000000001",
       "column_community_id":"<id de cordoba>",
       "user_id":"<id de sofia>","body":"no deberia poder"}'
# => 401/403: "new row violates row-level security policy"
```

---

## Arquitectura

```
src/
  routes/                    # ruteo por archivos
    index.tsx                # landing
    explorar/                # navegador de la jerarquía
    registro/ ingresar/ recuperar/ reenviar-confirmacion/
    transferencias-internacionales/ # aviso separado, versionado y bilingüe
    auth/callback/ auth/confirm/ # OAuth PKCE y confirmación explícita de correos
    consentimiento/          # aceptación de documentos vigentes (gate legal)
    onboarding/              # wizard: nombre → ubicación → confirmación
    inicio/ buscar/ notificaciones/
    c/[slug]/                # comunidad: layout con tabs + una ruta por tab
      encuestas/ debates/ reclamos/ proyectos/ presupuesto/ miembros/
      instituciones/ contraste/ sub/
      rendicion/ comparativa/ victorias/ # conteos exactos de reclamos (lib/claim-stats.ts)
      mapa/                  # esquema propio; OpenStreetMap sólo como enlace saliente
      afiche/                # afiche comunitario imprimible, con QR generado localmente
      datos.json/ feed.xml/  # GeoJSON y RSS públicos con extractos (ver /manual)
    encuestas/[id]/          # voto por RPC y resultados finales protegidos
    debates/[id]/            # la grilla
    reclamos/[id]/           # detalle + imprimibles: afiche, dossier, nota-formal, planilla
    proyectos/[id]/          # detalle + afiche
    u/[id]/                  # perfil público por nombre de usuario (0065)
    perfil/                  # datos, residencia, seguridad, acceso Google, baja
    instituciones/ comunidades/solicitar/
    apoyar/                  # donación voluntaria por enlace externo, apagada sin URL (D128)
    moderacion/              # reportes, apelaciones, cuentas, solicitudes, eliminaciones
    eliminar-datos/          # baja por correo y su recibo de seguimiento (0063)
    privacidad/ terminos/ normas-comunitarias/ subencargados/
    transferencias-internacionales/  # textos legales versionados (check-legal)
    internal/                # handlers de los Cron Triggers (con CRON_SECRET)
    media/                   # proxy de imágenes privadas de reclamos y avatares
    social/[type]/[id]/      # tarjetas para compartir, con cliente anónimo
    plugin@cabeceras.ts      # CSP con nonce, Permissions-Policy y demás cabeceras (D64)
    sitemap.xml/ robots.txt/ manifest.webmanifest/
  components/
    ui/                      # botones, cards, campos, Dialog, Toast, paleta de comandos
    auth/ legal/ layout/ forms/ content/ quota/ onboarding/ map/
    community/ polls/ debates/ claims/ projects/ budget/ profile/ moderation/
    fictional-content.spec.ts # falla si vuelve contenido ficticio a rutas de producción (D74)
  i18n/en/                   # catálogo inglés por dominio; el español es el texto fuente
  lib/
    supabase.ts              # clientes server, admin y anónimo
    session.ts               # Viewer (una vez por request), requireUser/requireResident/…
    legal.ts legal-content.ts # gate legal y textos versionados
    db-error.ts              # traduce errores de la base, incluido el gate de participación
    community.ts             # helpers de jerarquía
    claim-stats.ts           # conteos exactos con count: "exact"
    qr.ts                    # QR en SVG generado en el servidor (D76)
    share.ts                 # enlaces de WhatsApp y Telegram iniciados por la persona
    local-data.ts            # clasificación y limpieza del almacenamiento local
    i18n.ts i18n-core.ts     # translate(); el catálogo EN se carga aparte en el navegador
    database.types.ts        # tipos de la base (pnpm db.types)
    *-actions.ts             # globalAction$ / server$ compartidas
supabase/
  migrations/                # esquema, funciones, RLS, Storage y evoluciones
                             # 0047 recibos privados + tallies agregados
  migration-drafts/          # SQL versionado para revisión; nunca autoaplicado
  sql-drafts/                # SQL sin proponer (rechazado o incompleto); fuera de la evidencia de release
  tests/                     # suites SQL de RLS, Storage, privacidad y borrado (pnpm db.test)
  seed.sql                   # subconjunto geográfico histórico (236) + wiki + demo
e2e/                         # Playwright contra Supabase local (pnpm test.e2e)
scripts/check-*.mjs          # chequeos de lint: i18n, legal, claves, secretos, contrato de base
scripts/gen-geo.mjs          # genera la geografía del seed
scripts/gen-world-subdivisions.mjs # genera el ADM1 mundial y su auditoría
```

### Las tres piezas que conviene entender primero

**1. `is_member(user, community)`** — `supabase/migrations/0002_functions.sql`

Devuelve `true` si el `path` de la comunidad es prefijo del `path` de la
residencia del usuario. Es la función que usan _todas_ las policies de escritura.
Un usuario en `earth.south-america.argentina.buenos-aires.mar-del-plata` es
miembro de las cinco comunidades de ese camino y de ninguna otra.

**2. RLS, en `0004_rls.sql`** — todas las tablas la tienen activada. Lectura
pública del contenido cívico; escritura sólo autenticada y validada por
`is_member` más el estado del recurso. La aplicación nunca decide permisos: los
traduce a mensajes en el idioma seleccionado cuando la base dice que no.

**3. La elección no se vincula con la cuenta** — la emisión atómica crea un
`poll_participation_receipts` con encuesta y usuario, pero sin opción, e
incrementa todas las filas de `private.poll_option_tallies` —las elegidas con
`+1`, el resto con `+0`—. No existe una fila de boleta individual. Los
resultados sólo salen por funciones `security definer` después del cierre y
con al menos cinco participantes. Es secreto frente a otros usuarios, no un
protocolo de anonimato criptográfico frente al operador de PostgreSQL. Ver D68
en [`DECISIONS.md`](./DECISIONS.md).

---

## Comandos

| Comando                                                                                              | Qué hace                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                                                                                           | Servidor de desarrollo con SSR                        |
| `pnpm build.types`                                                                                   | Chequeo de tipos (`tsc --noEmit`)                     |
| `pnpm lint`                                                                                          | ESLint, Prettier y chequeos rápidos (`check-*`)       |
| `pnpm test`                                                                                          | Pruebas puras de `scripts/test-*` + Vitest            |
| `pnpm test.release`                                                                                  | Políticas D72, Cloudflare, preflight, backups y pins  |
| `pnpm verify`                                                                                        | `lint`, `test` y `test.release`, en ese orden         |
| `pnpm db.contract`                                                                                   | Cada `.rpc()`/`.from()` existe en los tipos           |
| `pnpm db.contract.remote`                                                                            | Ledger de `$AGORBIS_SUPABASE_PROJECT_REF` vs. código  |
| `pnpm build.client`                                                                                  | Bundle de cliente                                     |
| `pnpm build.server`                                                                                  | Bundle SSR para Cloudflare Workers                    |
| `pnpm build.cloudflare`                                                                              | Build + artefacto + preflight de Producción           |
| `pnpm preview`                                                                                       | Build de producción servido localmente                |
| `pnpm test.i18n`                                                                                     | Negociación, precedencia, variantes y URLs de idioma  |
| `pnpm test.ai-summary`                                                                               | Parser, contrato, privacidad y rutas de resúmenes IA  |
| `pnpm test.ugc-bidi`                                                                                 | Dirección automática de contenido ciudadano LTR/RTL   |
| `pnpm test.civic`                                                                                    | Reloj, fases, rendición y privacidad de encuestas     |
| `pnpm test.components`                                                                               | Sólo Vitest (`vitest run`)                            |
| `pnpm test.e2e`                                                                                      | Smoke real con Chromium y Supabase local              |
| `pnpm gen.images`                                                                                    | Regenera `og.png` e iconos PWA (necesita `sharp`)     |
| `pnpm db.reset`                                                                                      | Migraciones + seed                                    |
| `pnpm db.types`                                                                                      | Regenera `src/lib/database.types.ts`                  |
| `pnpm db.test`                                                                                       | Suites SQL de RLS, Storage, privacidad y borrado      |
| `pnpm preflight:production`                                                                          | Bloquea el corte si faltan variables o artefacto      |
| `pnpm run release:open:dry-run --execute-dry-run`                                                    | Build/preflight y Wrangler dry-run; nunca despliega   |
| `pnpm deploy:open`                                                                                   | Abre Producción (D107): riesgos, build, deploy, smoke |
| `pnpm deploy:open --dry-run`                                                                         | Igual que el anterior, sin subir ni correr el smoke   |
| `pnpm run release:open:exceptional:dry-run --request <ruta-absoluta.json>`                           | Evalúa excepciones, crea acta local y nunca despliega |
| `pnpm run release:open:exceptional:cutover --request <ruta-absoluta.json> --act-hash <actHash>`      | Ejecuta el cutover excepcional ligado al acta         |
| `pnpm run release:open:exceptional:recover-closed --request-hash <requestHash> --act-hash <actHash>` | Recupera el deployment CLOSED ligado                  |

La partición es de octubre de 2026. Antes, `pnpm lint` encadenaba también
todos los gates de release y una falla de política D72 aparecía como "lint".
Ahora:

- **`lint`** (menos de un minuto): `eslint`, `prettier --check`, `scan-secrets`,
  `check-keys`, `check-i18n`, `check-legal`,
  `check-pending-external-evidence-legal-draft`,
  `test-cloudflare-public-build-environment`, `check-audit-ignores` y
  `check-db-contract`.
- **`test`**: `test-i18n`, `test-ai-summary`, `test-ugc-bidi`, `test-civic`,
  `test-shared`, `test-check-audit-ignores`, `test-check-db-contract` y
  `vitest run`.
- **`test.release`**: `test.release-open` más los `test-cloudflare-*`,
  `test-preflight`, `test-production-smoke`, `test-git-recovery`, los de
  backup y los `test-supabase-*`. Necesita la toolchain fijada exacta; en CI
  corre en el job `release-gates`, que no bloquea una PR de producto.

`package.json` es la fuente de verdad: si esta lista y el archivo difieren,
vale el archivo. La lista completa de scripts tiene más entradas que esta
tabla (backups, smoke, canary D72); las que faltan son de operación de release
y se describen en el [runbook](docs/PRODUCTION_RUNBOOK.md).

---

## Preparación de producción

No hay ningún deploy automático desde este repositorio. La configuración de
Supabase Cloud, Google, Cloudflare, Resend, Turnstile, DNS, backups y monitoreo está en
[`docs/CLOUD_CONFIGURATION.md`](docs/CLOUD_CONFIGURATION.md). El procedimiento
de corte, rollback e incidentes está en
[`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md).
La copia externa del código y su restore verificable se documentan en
[`docs/GIT_RECOVERY.md`](docs/GIT_RECOVERY.md).

Coexisten dos políticas de release. La normal exige que todos los gates de A
terminen en `PASS`. La excepcional de D72 conserva cada `FAIL`,
`BLOCKED_EXTERNAL` o estado no verificado y permite atribuir sólo riesgos
elegibles, uno por uno, al responsable y a un HEAD exacto. No existe waiver
global. Auth/SMTP, Turnstile A/B, cookies/CSP, RLS, Storage privado, ausencia de
boletas individuales, residencia, antiabuso, migraciones exactas, integridad de
datos, secret scan, build/tests, Worker Secrets, DNS, bindings y crons son no
renunciables.

La política activa `D72/2026-11-01/v6` tiene SHA-256
`59f6283b36a2805ee73710d6f1223d3c98385cf732d72e3eba31dcab4053c03e` y fija
`authorizedRiskOwner=Sebastian Cardoso Castillo` exactamente. También es no
renunciable `legal.pending-external-copy-honest`: el contenido ES/EN
`2026-08-29.1` queda activo en el bundle y sólo puede promoverse a `PASS` cuando
la fase local y el build/preflight exactos acreditan sus hashes. La migración
`0060_activate_pending_external_evidence_legal_notices.sql` ya fue aplicada y
verificada en el proyecto anterior (D92). El ledger exacto verificado allí el
06-09-2026 es `0001`–`0058` + `0060` + `0061` (60/60): 0061 ya estaba aplicada y el
dry-run devolvió `upToDate: true`, sin ejecutar migraciones remotas. `0059`
sigue únicamente en `supabase/migration-drafts/` y ausente de Producción. La
coincidencia del ledger con las migraciones esperadas no acredita por sí sola los demás
gates del lanzamiento.

La revisión v4 registra la solicitud del responsable de priorizar la apertura
con AAIP pendiente y las ubicaciones, retención y salvaguardas externas aún
pendientes, tras explicarse sus consecuencias. La nueva revisión vence el
14-09-2026 UTC; los fallos y pendientes permanecen explícitos, los 27 controles
técnicos no renunciables se conservan y no se afirma conformidad jurídica.
Esta constancia no es una confirmación `/dev/tty` ni un acta D72 válida.
La revisión v6 (D106) mueve esa fecha, ya vencida, al 30-11-2026 UTC.

La revisión v5 reemplaza `configuration.google-auth-disabled` por
`configuration.auth-providers-aligned`, también no renunciable. Desde D122 el
perfil abierto lleva Google habilitado y Facebook deshabilitado, con
coincidencia entre el inventario, el artefacto, el Worker y Supabase; D97 lo
había dejado sólo con correo hasta que el responsable decidiera.
Google sigue bloqueado hasta acreditar sus ubicaciones ES/EN y un consentimiento
versionado que cubra el tratamiento opcional: el aviso `2026-08-29.1` lo excluye.
Facebook en pausa no agrega pendientes al lanzamiento de Google. Esta revisión
no acredita evidencia externa, un ensayo OAuth real ni autorización de release.

D72 está adoptada con un dry-run no mutante y un cutover/recovery versionado.
Su existencia no autoriza un deployment: el cutover exige el mismo HEAD,
request, policy, acta, artifact e issuance, además de la confirmación literal
final por `/dev/tty`. El estado de recovery que debe mostrarse sin embellecer es
`PRODUCTION_BACKUP_STATUS=not_verified`;
`RISK_ACCEPTED_BY_OWNER=true` sólo puede existir dentro de la fila
`recovery.production-backup-not-verified`, que conserva `RAW_RESULT=FAIL` y
`EVIDENCE_STATUS=NOT_VERIFIED`. Google Drive permanece como subestado
informativo `inactive`: no hay OAuth, sincronización, upload, descarga ni
restore acreditados, no es un octavo gate renunciable y no crea un backup.
Ver [D72](./DECISIONS.md) y el
[checklist de go-live](docs/GO_LIVE_CHECKLIST.md).

El runner excepcional devuelve `0` sólo con todos los gates en `PASS` y cero
excepciones; `20` para un dry-run completo con riesgos aceptados y el aviso
`ESTO NO ES PASS`; `1` ante gate/ejecución bloqueada; y `2` para request o uso
inválido. Sus actas `.act.json`/`.act.md` son locales, `0600`, no se
sobrescriben y declaran que ni deployment ni comandos de mutación productiva
fueron autorizados o ejecutados. La ruta del request debe ser absoluta y quedar
fuera del worktree; las actas se crean a su lado.
Cada `PASS` requiere evidencia específica de ese gate; una suite o fase agregada
exitosa no acredita controles que no midió. Por eso el dry-run real puede
enumerar bloqueos, terminar con exit `1` y no emitir acta mientras quede un
`NON_WAIVABLE_SECURITY_GATE` en `FAIL` o `NOT_VERIFIED`.

El runner excepcional valida, antes de iniciar subprocesos, el contrato
versionado de los scripts de Fase K y build: nombre de versión y SHA-256 viven
en `scripts/exceptional-release-script-contract.mjs` (al 02-11-2026,
`agorbis-exceptional-release-scripts/v12`, que suma el test de
`deploy:open` a `test.release`; D107).
`cloudflare-build` repite el control inmediatamente antes de `pnpm build`. Con
el contrato válido intenta las validaciones locales requeridas y acumula todos
sus fallos, sin detenerse en el primero.

El dry-run congela el artifact fuera del worktree y valida mediante Wrangler
únicamente el upload versionado y los cinco crons, ambos con `--dry-run` y un
env file congelado de cero bytes. Wrangler no carga automáticamente `.env`,
`.env.local` ni otro `.env*`; no se incorporan Worker Secrets a esos procesos.
Al emitir un acta válida también crea, fuera del request y del repositorio, un
issuance `0600` sin overwrite que liga los hashes del request, policy, acta
JSON/Markdown y artifact con el HEAD y la expiración. El cutover rechaza un
issuance ausente, modificado o que no coincida exactamente.

Antes de pedir la autorización final y de la primera mutación, el cutover
publica y relee de forma durable una cápsula `CLOSED` ligada al mismo
HEAD/request/policy/acta/artifact/issuance y al Deployment y Version cerrados
auditados. La cápsula contiene sólo la configuración congelada necesaria para
restaurar esa Version al 100 % y dejar los crons en cero; el recovery
independiente la vuelve a validar desde su
pointer atómico. Cutover y recovery comparten un lock operacional global para
la cuenta y el Worker de Producción en el host/operador/UID designados, de modo
que dos mutaciones locales no puedan ejecutarse en paralelo. Cloudflare
Versions no ofrece CAS entre hosts; la ventana prohíbe usar otro host.

No existe un waiver global, un bypass genérico ni una ruta de deployment
manual. La apertura se ejecuta exclusivamente con
`pnpm run release:open:exceptional:cutover --request <ruta-absoluta.json> --act-hash <actHash>`;
la recuperación CLOSED se ejecuta exclusivamente con
`pnpm run release:open:exceptional:recover-closed --request-hash <requestHash> --act-hash <actHash>`.
No se admite reemplazarlos por `wrangler deploy`, `pnpm deploy` ni comandos de
Wrangler ensamblados a mano.

El gate `quality.production-smoke` de esta fase sólo acredita mediante un smoke
remoto que el perfil productivo ya desplegado sigue cerrado (GET/HEAD/POST en
503 fail-closed, con headers/cookies esperados). No acredita el perfil
interactivo; una apertura exige autorización y smoke post-deploy separado. El
smoke envía comprobaciones GET/HEAD/POST al perfil 503 y observa la respuesta
HTTP fail-closed; el audit de configuración Cloudflare usa API GET-only. El
status HTTP no demuestra por sí solo la ausencia de escrituras. El harness HTTP
puede completar sus probes, pero `quality.production-smoke` permanece
`NOT_VERIFIED` hasta que evidencia DB/artefacto separada acredite que el POST no
escribió. Ante falta de esa evidencia o una respuesta distinta de 503, el gate
queda en `STOP`.
Dentro del smoke, `POST /registro/` sólo se intenta después de que GET y HEAD
acreditan el perfil cerrado; si esa auditoría previa falla, el POST se omite.

El seed es exclusivamente local: crea usuarios y contenido de prueba y nunca se
ejecuta en Supabase Cloud ni en Producción. En la política normal, antes de
cualquier corte deben pasar CI, una restauración ensayada y
`pnpm preflight:production` con variables reales. En la política excepcional,
la ausencia del primer backup puede conservarse como riesgo aceptado, pero los
gates técnicos no renunciables siguen exigiendo evidencia real.
Las Legacy API Keys están deshabilitadas, el JWT secret legado fue revocado y
Producción usa una `sb_secret_...` nueva únicamente como
`SUPABASE_SECRET_KEY` server-only.

El servidor Qwik se entrega como un Cloudflare Worker global con Static Assets,
custom domains exactos para `agorbis.com` y `www.agorbis.com`, y sin URLs
`workers.dev` ni preview. Cloudflare también presta DNS autoritativo y las dos
configuraciones Turnstile A/B. La configuración reproducible y sus cinco Cron
Triggers viven en [`wrangler.jsonc`](wrangler.jsonc). El primer corte y rollback
usan [`wrangler.closed.jsonc`](wrangler.closed.jsonc), validado como idéntico
salvo una respuesta 503 y cero crons.

También permanece bloqueado el corte mientras
`PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` sólo invoque el consentimiento del alta. Ese
consentimiento empieza después de la casilla separada y no puede legitimar la
solicitud que ya entregó la página ni el tráfico anónimo anterior a esa
decisión.

---

## Estado y límites

Las decisiones de producto y arquitectura están en
[`DECISIONS.md`](./DECISIONS.md). Las migraciones de endurecimiento 0039–0045
agregan el gate legal versionado, suspensiones y apelaciones, auditoría
inmutable, retención, límites antiabuso, evidencia privada, MFA privilegiado y
la outbox de borrado. Los permisos efectivos se prueban desde `anon`,
`authenticated` y `service_role`, no se infieren de la interfaz.

Agorbis no verifica domicilio real, no reemplaza canales oficiales y no procesa
dinero. Las rutas de producción no muestran datos de muestra ni confirman
acciones que no llegaron a la base (D74). Los barrios (nivel 5) todavía no forman parte de la cobertura inicial,
aunque el modelo geográfico puede incorporarlos más adelante.

## Cloudflare Workers

El adapter vive en `adapters/cloudflare-workers/vite.config.ts` y genera
`dist/_worker.js`. `pnpm build.cloudflare` ejecuta el build y, aun si alguna
validación falla, deja que el preflight informe todos los bloqueos locales. El
preflight inspecciona el Worker completo, su manifiesto Qwik, la exclusión de
rutas dinámicas de Static Assets, la configuración exacta de cuenta/dominios y
la ausencia de secretos embebidos.

El deployment cerrado de referencia, su Version ID y la configuración de
recovery se auditan y congelan antes de toda mutación. Una apertura D72 ya
autorizada se ejecuta únicamente mediante el cutover versionado:

```shell
pnpm run release:open:exceptional:cutover --request <ruta-absoluta.json> --act-hash <actHash>
```

Ante un fallo crítico, la vuelta al deployment CLOSED ligado se ejecuta
únicamente mediante el recovery versionado:

```shell
pnpm run release:open:exceptional:recover-closed --request-hash <requestHash> --act-hash <actHash>
```

Ambos mecanismos exigen bindings y confirmaciones literales, usan el mismo lock
operacional global y fallan cerrados ante evidencia o estado incierto. No hay
un bypass de emergencia genérico y no se permite un `wrangler deploy` ni un
`pnpm deploy` manual para abrir o recuperar D72.

Para validar el empaquetado sin publicar:

```shell
pnpm deploy:dry-run
```

Los pasos de secretos, comprobación de la cuenta, smoke tests y rollback están
en [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md).
