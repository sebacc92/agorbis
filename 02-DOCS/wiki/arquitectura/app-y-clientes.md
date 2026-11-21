---
type: article
title: Arquitectura de la app
description: Qwik 2 beta como Cloudflare Worker, estructura de src y los tres clientes de Supabase.
resource: src/lib/supabase.ts
tags: [qwik, cloudflare, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: arquitectura
status: stable
sources: []
---

# Arquitectura de la app

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

Qwik 2 (`@qwik.dev/core` y `@qwik.dev/router` `2.0.0-beta.40`, versión exacta)
que corre como un Worker de Cloudflare; `adapters/cloudflare-workers/vite.config.ts`
genera `dist/_worker.js`. Rutas por archivo en `src/routes/` (nombres en
español; `internal/` son los crons; `plugin@*.ts` son middleware), componentes
por dominio en `src/components/` y lógica en `src/lib/` (`*-actions.ts` agrupa
`globalAction$` y `server$`).

## Los tres clientes de Supabase (`src/lib/supabase.ts`)

- `createServerSupabase`: con la sesión de la persona; RLS aplica. Es el de
  loaders y actions.
- `createAnonymousSupabase`: sin cookies, clave publicable. Es el único válido
  para respuestas `public` cacheadas (tarjetas sociales, `datos.json`,
  `feed.xml`).
- `createAdminSupabase`: `service_role`, saltea RLS. Sólo servidor, y nunca
  para una acción de la persona (invariante 1 de `CLAUDE.md`).

`src/lib/db-error.ts` traduce el rechazo de la base por SQLSTATE (`42501`,
`23505`, `23514`, `23503`, `54000`), no por el texto del mensaje.

## Dónde vive

`src/root.tsx`, `src/entry.cloudflare-workers.tsx`, `src/entry.ssr.tsx`,
`src/routes/layout.tsx`, `src/lib/session.ts`, `src/lib/supabase.ts`,
`src/lib/db-error.ts`. README: "Arquitectura" y "Las tres piezas que conviene
entender primero".

## Decisiones

D16 (Qwik 2), D24 (Supabase fuera del bundle inicial), D62 (tipos), D71
(Workers en vez de Vercel), D75 (política del beta y parches locales), D99
(loaders que se vuelven a pedir).

## Pruebas

`scripts/check-keys.mjs` (en lint: `key={…}` falsos duplican nodos),
`src/lib/db-error.spec.ts`, `src/lib/auth-architecture.spec.ts`,
`src/lib/qwik-cloudflare-worker-router.spec.ts`,
`src/components/fictional-content.spec.ts` (D74).

## Trampas

- D75: `src/lib/qwik-cloudflare-worker-router.ts` reemplaza el middleware de
  Qwik, que cacheaba respuestas `private, no-store`; no se vuelve al original.
- D99: los loaders se vuelven a pedir unos 300–600 ms después de cargar. Los
  controles editables guardan su propia señal, los diálogos deshacen efectos
  sólo al cerrarse de verdad y el foco se reintenta con
  `src/lib/focus-when-rendered.ts`.
- Una respuesta cacheada con el cliente de sesión filtra al caché compartido lo
  que ve quien modera.

## Related

- [Seguridad y terceros](../seguridad/cabeceras-y-terceros.md)
- [Release y operación](../operacion/release-y-operacion.md)
