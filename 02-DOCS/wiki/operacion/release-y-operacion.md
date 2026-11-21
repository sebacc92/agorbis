---
type: article
title: Release y operación
description: Worker agorbis con sus variantes de wrangler, las dos políticas de D72, preflight, backups, CI y grupos de scripts.
resource: docs/PRODUCTION_RUNBOOK.md
tags: [release, operacion, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: operacion
status: stable
sources: []
---

# Release y operación

> Página mapa: resume y apunta. El runbook y D72 mandan. Un agente nunca corre
> `wrangler deploy`, `pnpm deploy` ni `supabase db push` fuera del runbook, y
> no hace push ni pull de `main` (`CLAUDE.md`).

## Overview

Producción es un Worker `agorbis` con dominios `agorbis.com` y
`www.agorbis.com`, sin `workers.dev` y con cinco Cron Triggers
(`wrangler.jsonc`). Variantes: `wrangler.closed.jsonc` (503, sin crons),
`wrangler.readonly-preview.jsonc` (sólo lectura) y
`wrangler.open-recovery.jsonc`, `wrangler.traffic.jsonc`,
`wrangler.crons-open.jsonc` y `wrangler.crons-closed.jsonc` para el canario, el
corte y la recuperación de D72. Supabase de Producción es
`ibtvlvpxwourrxwcrfkf`, en plan Free (D91, D92).

D72 tiene dos políticas:

- Normal: `release:open:dry-run` (`scripts/run-open-release.mjs`), falla
  cerrada y no acepta excepciones.
- Excepcional: `release:open:exceptional:*` (dry-run → prepare-canary →
  cutover → recover-closed), con riesgos aceptados uno por uno y la frase
  final literal del responsable. Ningún paso autoriza un deploy por sí solo.

`preflight:production` (`scripts/production-preflight.mjs`) revisa Worker,
manifiesto, cuenta, dominios y atestaciones.

## CI (`.github/workflows/ci.yml`)

- `verificar`: lint, test, `build.types`, build, `pnpm audit --audit-level=high`.
- `integracion`: Supabase local, `supabase db lint`, `db.types`, `db.test`,
  e2e.
- `release-gates`: `pnpm test.release`; bloquea un release, no una PR.
- `auditoria-semanal`: programada, no bloquea.

## Scripts

`lint` (ESLint, Prettier, secretos, keys, i18n, legal, contrato de base),
`test` (scripts puros y Vitest), `test.release`, `verify` (los tres),
`db.*` (`reset`, `test`, `contract`, `contract.remote`, `types`), `backup:*`,
`deploy:closed`, `smoke:production:*`, `git:recovery:*`. `package.json` manda
sobre cualquier lista.

## Docs

`docs/PRODUCTION_RUNBOOK.md`, `docs/GO_LIVE_CHECKLIST.md`,
`docs/BACKUP_AND_RESTORE.md`, `docs/RECOVERY_INVENTORY.md`,
`docs/D72_ISOLATED_PRODUCTION_CANARY.md`, `docs/isolated-restore-environment.md`,
`docs/GIT_RECOVERY.md`, `docs/READ_ONLY_PREVIEW_TO_INTERACTIVE_RUNBOOK.md`.
README: "Comandos", "Preparación de producción" y "Cloudflare Workers".

## Decisiones

D71, D72, D77, D91, D92, D100.

## Trampas

- El contrato de scripts de release está atado por hash (D77): cambiar la
  composición de `lint`, `test` o `test.release` rompe el binding.
- Un `FAIL`, `BLOCKED_EXTERNAL` o `pending` nunca se reescribe como `PASS`.
- En Free no hay backup gestionado: el único es el export lógico cifrado del
  proyecto.
- `wrangler.closed.jsonc` debe ser idéntico a `wrangler.jsonc` salvo el 503 y
  los crons.
- No se re-baselinean hashes de release dentro de un commit de features.

## Related

- [Arquitectura](../arquitectura/app-y-clientes.md)
- [Fuentes y reglas](../gobierno/fuentes-y-reglas.md)
