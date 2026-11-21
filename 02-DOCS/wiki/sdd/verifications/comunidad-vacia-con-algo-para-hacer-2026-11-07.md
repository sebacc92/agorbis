---
type: verification
title: Verificación — comunidad vacía con algo para hacer — 2026-11-07
description: Veredicto con evidencia para la mejora 6 de D112 (D116): gate del repo, checklist del FTD y criterios observables.
tags: [sdd, verification]
timestamp: 2026-11-07T23:30:00Z
topic: sdd
slug: comunidad-vacia-con-algo-para-hacer
source_state: da37a5f (dirty, 22 archivos sin commitear; el commit sigue a este registro)
---

# Verificación — comunidad vacía con algo para hacer — 2026-11-07

Referencia: `02-DOCS/wiki/ftd/comunidad-vacia-con-algo-para-hacer.md` (carril FTD,
sin spec SDD). Toolchain: Node 22.22.0 por nvm, pnpm 11.15.0. Gate corrido sin
carga concurrente; el E2E después, nunca junto a tsc o Vitest.

## Gate del repo

- `pnpm verify` (lint && test && test.release) → PASS, salida 0. ESLint, Prettier,
  scan-secrets, check-keys, check-i18n (3747 mensajes), check-legal, contrato de
  base, `scripts/test-*`, Vitest y políticas D72/Cloudflare/D107.
- `pnpm build.types` → PASS, 0 errores (aparte: `verify` no incluye tsc).
- `pnpm exec vitest run` → PASS: 188 archivos, 1366 pruebas. Contra 1347 antes:
  7 del ayudante de encuestas de la cadena, 5 del ayudante de residencia, 7 casos
  nuevos en `community-navigation-honesty` y 1 menos en `browser-storage` (el
  guard muerto `isBooleanRecord` se quitó).
- `pnpm test.e2e e2e/empty-community.spec.ts e2e/publication-entry-recovery.spec.ts e2e/ui-ux-regressions.spec.ts`
  → PASS, 16 de 16, 1,3 min, build del runner con Supabase local y seed.

## Checklist del FTD

- [x] Ayudante `chain-polls.ts`: 7 de 7, rojo antes de existir el módulo.
- [x] Loader `useChainPolls` y bloque del estado vacío: spec con y sin encuestas,
      título neutro para visitante; E2E con la encuesta de Argentina enlazada.
- [x] Sin casillas ni felicitación: spec de herramientas y `fictional-content`
      con el texto prohibido; E2E abre "Más herramientas" y no hay "Marcar como".
- [x] Textos de residencia por `residenceHint`: spec sin residencia y con perfil
      ilegible; E2E cuenta nueva ("elegí tu residencia", destino exacto del
      onboarding) y Sofía ("residencia declarada", "Revisar mi residencia").
- [x] Revisiones D113: tres informes, hallazgos aplicados (ver D116).

## Criterios observables (D112, mejora 6)

- [x] Encuestas abiertas de la cadena en el estado vacío — E2E 1: enlace a
      `/encuestas/a0000000-…-0002` con "Argentina", sin `\d+ votos`.
- [x] Sin felicitar por casillas — E2E 2 y `fictional-content.spec`.
- [x] Sin afirmar "residencia declarada" a quien no la eligió — E2E 3 y 4, spec.

## Capas no ejecutadas

- **NO-APLICA** — migraciones y `db.test`: no hay SQL nuevo.
- **SUSTITUIDA** — el camino de error de `useChainPolls` (RLS rota, columna
  renombrada) se prueba sólo por lectura: `orFallback` ya tiene spec propio en
  `query.spec`, pero ningún test fuerza el fallo desde esta página. No detecta un
  cambio en cómo la página consume el fallback.
- **SUSTITUIDA** — el perfil ilegible se simula en el spec con `residenceUnknown`
  en el contexto; no se forzó el fallo real de `profiles` en E2E.
- **HERRAMIENTA-AUSENTE** — lector de pantalla real y navegadores que no sean
  Chromium.

## Hallazgos descartados

- "`labelChainPolls` descarta en silencio encuestas fuera de la cadena" — sólo
  ocurre si la consulta de la cadena del layout falló a medias; `ancestorIds`
  sale de la misma cadena, así que la consulta no puede devolverlas. Sin log
  deliberado: `src/lib/chain-polls.ts`.
- "El spec no cubre que una comunidad no vacía saltea la consulta" — la
  decisión es `isConfirmedEmpty`, con spec propio de tres casos; el loader sólo
  la llama.
- "`useActivePoll` y `useInfo` tragan errores igual" — anteriores a este cambio,
  fuera de alcance; anotado para otra ronda.

## Veredicto: PASS — sin ítems abiertos. Listo para commit.
