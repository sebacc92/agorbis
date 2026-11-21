---
type: verification
title: Verificación — nivel 4 de Uruguay, Chile y Paraguay — 2026-11-20
description: Veredicto con evidencia de los tres borradores SQL de nivel 4 (D129–D131) antes de commitearlos.
tags: [sdd, verification, geografia]
timestamp: 2026-11-20T17:30:00-03:00
topic: sdd
slug: nivel4-uruguay-chile-paraguay
source_state: c8bf224 (dirty: los tres borradores sin commitear)
---

# Verificación — nivel 4 de Uruguay, Chile y Paraguay — 2026-11-20

Carril FTD: no hay spec SDD. Los criterios son las checklists de
`ftd/nivel4-uruguay.md`, `ftd/nivel4-chile.md` y `ftd/nivel4-paraguay.md`.

## Gate del stack

- `pnpm verify` con Node 22.22.0 → **PASS** (exit 0): lint (ESLint,
  Prettier, scan-secrets, check-keys, check-i18n, check-legal, contrato de
  base), `pnpm test` con 216 archivos y 1.636 tests en verde, y
  `test.release` completo en PASS.

## Checklist de los FTD

- [x] Specs en rojo y después en verde, en los seis módulos: evidencia en
      cada FTD (falló al importar sin el módulo) y en la corrida de arriba.
- [x] Borradores generados desde la fuente: Uruguay 136 de 7.196 circuitos;
      Chile 345 de la DPA 2023; Paraguay 262 del COD-AB, con los conteos por
      departamento iguales a las intendencias electas (el generador falla si
      no).
- [x] Ningún slug nuevo existe en Producción: consultas de sólo lectura por
      prefijo (`uruguay-`, `chile-`, `paraguay-`) que sólo devuelven el
      nivel 3.
- [x] Corren en la base local y se deshacen: los tres juntos en una
      transacción con `rollback` dan 136, 345 y 262 de nivel 4 y vuelven a 0.
- [x] D129, D130 y D131 escritas; Prettier pasa.

## Controles de las guardas propias

- **Slug ocupado (control negativo):** con un slug insertado antes, cada
  borrador aborta con `AGORBIS_0077/0078/0079_SLUG_TAKEN` y no deja nada.
  **Control positivo:** sin ese slug, los tres insertan y verifican su total.
  Lo que no prueba: un departamento o región faltante (`MISSING_*`) sólo se
  ejercita en el spec, no contra la base.
- **Contraste con la Justicia Electoral (Paraguay):** pasa con los datos
  reales; el caso con diferencias se prueba en el spec de
  `compareWithElection`, no corriendo el generador con datos alterados.

## Capas no ejecutadas

- **NO-APLICA** — `pnpm db.test` y `supabase/tests`: los borradores no son
  migraciones y no cambian ningún test SQL; se prueban a mano en local.
- **SUSTITUIDA** — cobertura: `vitest run` corre sin umbral. Es un reporte,
  no un gate; no detecta que la cobertura baje. Cada función exportada de
  los módulos nuevos tiene al menos un caso en su spec.
- **SUSTITUIDA** — E2E: no se corrió Playwright. Los borradores no cambian
  código de la app; el efecto en el onboarding (GPS sin coordenadas) se
  razonó leyendo `src/routes/onboarding/index.tsx`, no se observó.

## Hallazgos descartados

- "Dos borradores en la misma transacción chocan por la tabla temporal" —
  arreglado: `level4-draft-sql.mjs` la borra antes del `commit`; spec y
  corrida local de los tres juntos.

## Veredicto: PASS para commitear los borradores

Promoverlos a migraciones sigue siendo del responsable: test SQL propio,
`pnpm db.types`, candidata D72 y backup, en orden después de 0076.
