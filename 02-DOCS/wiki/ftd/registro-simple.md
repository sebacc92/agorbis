---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Registro más simple (D108)

## Intención

El dueño probó el alta en Producción el 02-11-2026 y pidió simplificar el
registro y mejorar su UI/UX. El camino tenía 7 pantallas, pedía los acuerdos
dos veces (2 casillas en `/registro` y 5 en `/consentimiento`) y repetía
textos.

## Alcance

- Sí: el formulario de `/registro` (pista de contraseña, error de Turnstile,
  subtítulo, peso visual del consentimiento, pantalla de espera), el
  onboarding (nombre de usuario sugerido desde el nombre para mostrar y el
  salto de paso por URL) y `/consentimiento` (2 casillas, mismo componente que
  el registro, subtítulo que anticipa el paso siguiente para cuentas nuevas).
- No: qué se registra en la base (cada documento con su versión, la edad y el
  aviso de transferencias), el botón de `/auth/confirm`, los textos legales
  versionados ni el modo del widget de Turnstile (es del panel de Cloudflare).

## Checklist

- [x] Registro: pista de contraseña sólo antes de escribir, aviso de Turnstile
      que pide reintentar cuando el widget se renueva, subtítulo sin "elegí cómo" cuando no
      hay proveedores, consentimiento con menos peso y título único en la
      espera. Prueba: specs y e2e.
- [x] Onboarding: el paso "lugar" o "confirmar" sin nombre elegido vuelve a
      "nombre", y el nombre de usuario se completa desde el nombre para
      mostrar mientras no se edite. Prueba: specs y e2e.
- [x] `/consentimiento` con las 2 casillas del registro, sin "Volver a mi
      perfil" ni otro marco para cuentas nuevas, y con D108. Prueba: specs,
      `db.test` y e2e.
- [x] `/manual` y traducciones al inglés al día. Prueba: `check-i18n`.
- [x] `pnpm lint`, `pnpm test`, `pnpm test.release` y los e2e de auth pasan.

## Evidencia

- 02-11-2026: `f4e1df0` (registro). `e2e/account-registration.spec.ts` 6/6
  en local.
- 02-11-2026: `9c9ceaa` (onboarding). Los dos e2e de onboarding pasan; con
  la redirección anulada (mutante que compila) el nuevo falla en la URL.
- 02-11-2026: `/consentimiento` con `LegalConsentFields`.
  `auth-navigation-flow.spec.ts` pasa con los campos nuevos y falla con
  `accept_transfers` (el aviso de transferencias quedaría en `false`).
- `check-i18n`: 3.729 mensajes.
- 02-11-2026, después del último cambio y con umask 0022: `pnpm lint`,
  `pnpm build.types`, `pnpm test` (1.242) y `pnpm test.release` en exit 0.
  e2e locales: registro 6/6, onboarding 2/2 y "el alta" de `smoke.spec.ts`
  3/3 (alta real con correo, dos casillas y onboarding).
- No se corrió `db.test`: no cambió SQL ni las RPC que se llaman.

## Siguiente

El dueño hace push y `pnpm deploy:open`, y prueba el alta completa en
Producción.
