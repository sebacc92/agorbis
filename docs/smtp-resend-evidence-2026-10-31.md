# Agorbis · evidencia de configuración de Resend y SMTP

Fecha de la evidencia: **31 de octubre de 2026**. Proyecto de Producción:
Supabase `ibtvlvpxwourrxwcrfkf` (D92). Alcance: configuración de Resend y del
SMTP propio de Supabase Auth, más una lectura del repositorio en `1ef2f95`.

Esta nota **no es un acta D72 ni un resultado de gate**. No promueve
`operations.smtp-functional` ni otro gate a `PASS`, no completa valores del
inventario público y no cambia D70, D72, D73 ni D76. Sirve para que el futuro
dry-run excepcional sepa qué se configuró y qué falta probar dentro de su
propia corrida.

Categorías, iguales a las de la
[revisión de proveedores](provider-evidence-review-2026-09-08.md):

- `USER_SCREENSHOT_CONFIRMED`: visible en capturas del responsable. El agente
  no accedió a los paneles de Resend ni de Supabase.
- `REPO_VERIFIED`: comprobado leyendo el código y la documentación del
  repositorio, sin ejecutar nada contra Producción.
- `PENDING`: todavía sin evidencia suficiente.

No se registran correos personales, API keys, contraseñas, tokens ni enlaces de
autenticación reales.

## Evidencia observada por el responsable (`USER_SCREENSHOT_CONFIRMED`)

| Elemento                  | Observado                                                                                                                                              | Contraste con el repositorio                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dominio en Resend         | `agorbis.com` verificado; Resend Forge habilitado                                                                                                      | Coincide con [CLOUD_CONFIGURATION.md, "Resend y DNS"](CLOUD_CONFIGURATION.md#resend-y-dns).                                                    |
| Región de envío en Resend | São Paulo (`sa-east-1`)                                                                                                                                | Ver "Ubicaciones" más abajo: no alcanza para completar la ubicación pública de Resend.                                                         |
| API keys                  | Queda una sola, `agorbis-supabase-auth-production`, con `Sending access`; las demás se revocaron antes de la prueba                                    | El repositorio no consume la key: `RESEND_API_KEY` no configura GoTrue y no va al Worker (CLOUD_CONFIGURATION.md).                             |
| SMTP de Supabase          | Habilitado: `smtp.resend.com`, puerto `465`, usuario `resend`, remitente `no-reply@agorbis.com`, nombre `Agorbis`                                      | Coincide con la configuración documentada: puerto 465 con TLS implícito y remitente `Agorbis <no-reply@agorbis.com>`.                          |
| Envío real                | Una invitación enviada desde Supabase llegó a una casilla de Gmail y Resend la registró como `Delivered`; la key restringida mostró actividad reciente | Prueba que el SMTP entrega. No usa ninguna plantilla de Agorbis ni recorre un flujo de la app (ver "Pendientes").                              |
| Site URL                  | `https://agorbis.com`                                                                                                                                  | Coincide con CLOUD_CONFIGURATION.md y con `PUBLIC_SITE_URL` en `wrangler.jsonc`.                                                               |
| Redirect URLs             | `https://agorbis.com/auth/confirm` y `https://agorbis.com/auth/callback`, sin comodines                                                                | Coincide con CLOUD_CONFIGURATION.md y `SUPABASE_AUTH_REDIRECT_URLS` del README.                                                                |
| Plantillas                | Confirmación y recuperación con HTML propio ES/EN, `.RedirectTo`, `.TokenHash` y tipos `signup` y `recovery`                                           | Coincide con `supabase/templates/confirmation.html` y `recovery.html`. No se comparó el HTML del Dashboard byte a byte con el del repositorio. |

## Evidencia verificada en el repositorio (`REPO_VERIFIED`)

Lectura de sólo lectura sobre `1ef2f95`; no se ejecutaron pruebas contra
Producción.

- `authEmailConfirmUrl` (`src/lib/http.ts`) arma
  `<PUBLIC_SITE_URL>/auth/confirm?next=<ruta codificada>` y **siempre** pone
  `next`, con `/` si falta. Por eso el `&token_hash=` de las plantillas produce
  una URL válida.
- Alta y reenvío (`src/lib/protected-auth.ts`, `signUpWithTurnstile` y
  `resendConfirmationWithTurnstile`) usan `next=/onboarding` por defecto.
  Recuperación (`requestPasswordResetWithTurnstile`) usa un `next` fijo:
  `/perfil/contrasena?recovery=1`.
- `/auth/confirm` (`src/routes/auth/confirm/index.tsx`) acepta `signup`,
  `recovery`, `magiclink` y `email_change`. El GET no consume el token; el POST
  llama a `verifyOtp`. `recovery` redirige a `/perfil/contrasena?recovery=1`,
  y `signup` pasa por el gate legal y el onboarding.
- La E2E `e2e/smoke.spec.ts` recorre la recuperación completa contra Supabase
  local, incluido el rechazo del enlace reusado.

## Pendientes (`PENDING`)

Ninguno de estos puntos se resuelve con capturas. Los que pertenecen al gate se
acreditan sólo dentro de la corrida D72 autorizada.

1. **`operations.smtp-functional`.** Según
   `scripts/non-waivable-gate-evidence-catalog.mjs` y
   [D72_ISOLATED_PRODUCTION_CANARY.md](D72_ISOLATED_PRODUCTION_CANARY.md), el
   `PASS` exige que en la corrida canaria actual la casilla canaria reciba la
   confirmación y la recuperación y que ambos enlaces completen sólo el flujo
   esperado. Fuentes: `canary.smtp-signup-confirmation`, `canary.smtp-recovery`
   y `canary.smtp-delivery-receipt`. Hasta esa corrida el gate queda
   `NOT_VERIFIED`. La entrega de la invitación no es una de esas fuentes.
2. **Alta y confirmación completas en Producción**, con las plantillas propias.
3. **Recuperación y cambio efectivo de contraseña en Producción.** Hay un
   riesgo específico: Producción tiene activado "Require current password when
   updating" (D101; atestación `SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED`).
   El formulario de recuperación llama a `updateUser` sin `current_password`, y
   un comentario de `src/routes/perfil/contrasena/index.tsx` dice que con esa
   opción GoTrue la exige incluso en una sesión reciente. No se verificó si
   GoTrue exime a una sesión de recuperación. La E2E local no lo cubre, porque
   `supabase/config.toml` no activa esa opción.
4. **Notificaciones de seguridad.** Falta la entrega de las seis plantillas
   (`password_changed`, `email_changed`, `identity_linked`,
   `identity_unlinked`, `mfa_factor_enrolled`, `mfa_factor_unenrolled`) y de
   las demás plantillas de acceso (`magic_link`, `email_change`,
   `reauthentication`) en Producción.
5. **Tracking.** Click y open tracking tienen que estar desactivados: el
   seguimiento de clics reescribe los `TokenHash` de un solo uso y agregaría un
   destino intermedio en enlaces de autenticación. Sin captura ni lectura que lo
   acredite.
6. **Política TLS final** de Resend hacia los servidores de destino: sin
   decisión ni evidencia.
7. **Bounces y complaints:** sin alertas configuradas ni acreditadas
   (runbook, paso 5 de la verificación).
8. **Usuario creado por la invitación.** Invitar desde el Dashboard crea un
   usuario en Auth de Producción por fuera de la app: sin Turnstile y sin
   aceptación legal (D73). Hay que comprobar si quedó y decidir su baja antes
   de la corrida canaria, sin registrar la dirección en el repositorio.
9. **DNS.** Resend Forge agregó registros (`send`, `rsend`) que no están en la
   topología no web fijada por `scripts/cloudflare-dns-audit.mjs`. Mientras no
   haya una re-baseline autorizada, con su `Dn`, `network.production-dns-integrity`
   sigue sin poder dar `PASS`. Esta nota no cambia esa auditoría.

## Ubicaciones y textos legales (D70, D76)

La región de envío `sa-east-1` es un dato del panel de Resend. No acredita
dónde se tratan ni desde dónde se acceden la cuenta, los eventos de entrega, las
listas de supresión, el soporte o los backups. Los textos legales vigentes
(`src/lib/legal-content.ts`) dicen que esas ubicaciones siguen pendientes de
evidencia externa, y eso sigue siendo cierto. Por lo tanto:

- `PUBLIC_RESEND_PROCESSING_LOCATION` y `PUBLIC_RESEND_PROCESSING_LOCATION_EN`
  no se completan con este dato. `scripts/cloudflare-public-build-environment.mjs`
  las ata a `privacy.provider-locations-unverified`, y sólo se llenan con
  evidencia del proveedor (ver
  [la consulta a Resend](resend-privacy-initial-request.md)).
- `privacy.provider-locations-unverified` y
  `privacy.provider-retention-unverified` no cambian de estado.
- Si más adelante se publica una ubicación, cambia el texto legal: versión
  nueva, migración con hash y revisión del responsable.

## Qué no cambió

No se modificaron D72, scripts de release, migraciones, textos legales, el
runbook ni archivos de `.github/CODEOWNERS`. No se ejecutaron comandos contra
Producción ni se hizo commit, push o deploy.
