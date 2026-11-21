---
type: verification
title: Verificación — nivel4-argentina — 2026-11-20
description: Veredicto con evidencia del borrador de nivel 4 de Argentina (D127), contra el checklist FTD.
tags: [sdd, verification, ftd, geografia]
timestamp: 2026-11-20T05:40:00Z
topic: sdd
slug: nivel4-argentina
source_state: 0c550d1 (dirty, el commit de esta función todavía no existe)
---

# Verificación — nivel4-argentina — 2026-11-20

Va por FTD: no hay spec SDD. Los criterios son el checklist de
`02-DOCS/wiki/ftd/nivel4-argentina.md`.

## Gate del proyecto

- `pnpm verify` con Node 22.22.0 y pnpm 11.15.0 → exit 0: lint (ESLint,
  Prettier, scan-secrets, check-keys, i18n, legal, contrato de base), 209
  archivos y 1.562 tests de Vitest, y `test.release` completo.

## Checklist FTD

- [x] Spec en rojo y en verde: sin el módulo falló al importar; con él, 12 de 12.
- [x] 1.981 filas, igual al total por jurisdicción de la API Georef.
- [x] Ningún slug nuevo existe en Producción (consulta de sólo lectura por
      prefijo de provincia: 0 filas).
- [x] En la base local, dentro de una transacción con `rollback`: nivel 4 de
      Argentina 140 → 2.116, nivel 5 0 → 5. Después del `rollback`, 140.
- [x] Control negativo del SQL: con `caba-comuna-1` ocupado aborta con
      `AGORBIS_0076_SLUG_TAKEN` y no deja filas. Control positivo: la corrida
      sin choque pasa todas las guardas.
- [x] Rótulo del nivel 5 con traducción: `check-i18n` y `tsc` en verde.
- [x] D127 escrita, Prettier en verde.

## Capas no ejecutadas

- **NO-APLICA** — `pnpm db.test` y E2E: el SQL no está en `supabase/migrations`,
  así que ninguna suite lo carga. El test SQL se escribe al promoverlo.
- **SUSTITUIDA** — aplicación del SQL: se aplicó a mano con `psql` sobre la base
  local actual, no sobre un `db.reset` limpio. No detecta diferencias entre esa
  base y una recién reseteada.

## Hallazgos descartados

- ninguno

## Veredicto: PASS para el borrador. No habilita aplicarlo en Producción.
