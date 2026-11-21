---
type: article
title: Cuentas y acceso
description: Supabase Auth con getUser en el servidor, contraseña de 12 con letras y números, Turnstile, TOTP y los dos flujos de borrado.
resource: src/lib/auth-actions.ts
tags: [auth, privacidad, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: cuentas
status: stable
sources: []
---

# Cuentas y acceso

> Página mapa: resume y apunta. Lo que manda es el código y `DECISIONS.md`.

## Overview

Supabase Auth, leído en el servidor con `getUser()` (D18). La contraseña pide
12 caracteres con letras y números (D101), igual en Zod y en
`supabase/config.toml` (`letters_digits`). Turnstile protege cinco acciones de
la app (`TURNSTILE_ACTIONS`: alta, ingreso con contraseña, enlace mágico,
recuperación y reenvío de confirmación) y un guard aparte de Supabase rechaza
pedidos de Auth sin token (D69). TOTP admite hasta dos factores; moderación y
administración exigen `aal2`. El ingreso con Google está apagado (D97).

Hay dos borrados distintos:

- `/perfil/eliminar`: la cuenta (saga de `0044`, procesada por
  `/internal/process-account-deletions`). Lo publicado se anonimiza y lo
  personal se borra (D67).
- `/eliminar-datos`: pedido público de borrado de datos, sin sesión, con
  constancia y seguimiento en `/eliminar-datos/seguimiento` (`0063`).

## Dónde vive

- `src/lib/auth-actions.ts`, `auth-security.ts`, `mfa.ts`, `pending-totp.ts`,
  `turnstile.ts`, `account-deletion.ts`, `local-data.ts`.
- Rutas: `src/routes/ingresar`, `registro`, `recuperar`, `auth/`, `perfil/`
  (`seguridad`, `contrasena`, `eliminar`, `residencia`, `datos`) y
  `eliminar-datos`.
- `src/components/auth/TurnstileGate.tsx`; `supabase/config.toml`.
- Limpieza local al salir: `src/lib/local-data.ts` (`clearPersonalLocalData`)
  montada en `src/components/layout/LocalDataCleanup.tsx`.

## Decisiones

D15, D17, D18, D67, D69, D87, D89, D91, D97, D101. Docs:
`docs/social-auth-setup.md`, `docs/google-production-readiness.md`.

## Pruebas

`src/lib/{auth-actions,auth-security,mfa,turnstile,account-deletion,local-data}*.spec.ts`;
`supabase/tests/account_deletion_checks.sql` y
`data_deletion_request_checks.sql`; `e2e/account-*.spec.ts` y
`e2e/data-deletion*.spec.ts`.

## Trampas

- Toda clave nueva de `localStorage` se clasifica en `local-data.ts`; su spec
  recorre el código fuente.
- La app nunca ofrece borrar un factor TOTP verificado: la recuperación pasa
  por una persona.
- El avatar se borra de Storage aparte; ninguna cascada llega ahí.

## Related

- [Gate legal](../legal/gate-y-textos-legales.md) — el alta registra la
  aceptación versionada.
- [Modelo de datos](../datos/modelo-y-comunidades.md) — residencia.
