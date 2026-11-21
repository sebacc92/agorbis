---
type: article
title: Seguridad, cabeceras y terceros
description: CSP con nonce por respuesta, regla D76 para hosts nuevos, clasificación de localStorage y logs sin datos personales.
resource: src/routes/plugin@cabeceras.ts
tags: [seguridad, privacidad, invariante, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: seguridad
status: stable
sources: []
---

# Seguridad, cabeceras y terceros

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

`src/routes/plugin@cabeceras.ts` genera un nonce por respuesta
(`sharedMap["@nonce"]`) y en producción envía `script-src 'self' 'nonce-…'
'strict-dynamic' https://challenges.cloudflare.com` y `script-src-attr
'none'`. `connect-src` admite sólo el propio origen, Turnstile y el origen de
Supabase configurado. El mismo archivo fija Permissions-Policy,
Referrer-Policy, `frame-ancestors` y `nosniff` (D64).

D76: un host que el navegador o el Worker contacten sin un clic de la persona
entra sólo con CSP, `/subencargados`, Privacidad (versión y hash) y una `Dn`,
en el mismo cambio. Un enlace saliente no necesita CSP, pero no lleva datos que
la persona no ve.

## Dónde vive

- `src/routes/plugin@cabeceras.ts`, `src/routes/subencargados/`.
- `src/lib/local-data.ts`: cada clave de almacenamiento es preferencia del
  dispositivo o dato personal; las personales se borran al salir o al borrar
  la cuenta (D67).
- `src/lib/log.ts` (`logEvent`, `logFailure`, `sanitizeLogValue`): redacta
  emails, JWT, claves `sb_*`, parámetros con códigos y UUID personales.
- `scripts/scan-secrets.mjs` y `scripts/secret-patterns.mjs` (en lint);
  `.env.example`.

## Decisiones y docs

D64, D67, D69, D70, D76. Docs: `docs/CLOUD_CONFIGURATION.md`,
`docs/TRANSFER_SAFEGUARDS_REQUESTS.md`, `docs/RETENTION_POLICY.md`.

## Pruebas

`scripts/test-shared.mjs` (orden de los plugins), `src/lib/local-data.spec.ts`
(recorre `src/` buscando claves sin clasificar),
`src/lib/browser-storage.spec.ts`, `src/lib/security.spec.ts`. `log.ts` no
tiene spec propia.

## Trampas

- El nombre `cabeceras` importa: Qwik Router corre los `plugin@*` en orden
  alfabético y tiene que ir antes de `plugin@i18n.ts`, que puede redirigir.
- `style-src` todavía admite `unsafe-inline` (pendiente de D64).
- No se relaja la CSP para que algo ande: se cambia el algo.
- Nada secreto lleva prefijo `PUBLIC_`.

## Related

- [Gate legal](../legal/gate-y-textos-legales.md) — Privacidad con versión y
  hash.
- [Arquitectura](../arquitectura/app-y-clientes.md) — cliente anónimo para lo
  cacheado.
