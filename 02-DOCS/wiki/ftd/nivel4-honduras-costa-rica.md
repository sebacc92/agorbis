---
author: Sebastián Cardoso Castillo
branch: nivel4-centroamerica
status: done
type: feature
title: Nivel 4 de Honduras y Costa Rica · molde común de COD-AB
description: Borradores SQL con los 298 municipios de Honduras y los 84 cantones de Costa Rica, armados con un módulo común para los COD-AB de HDX; El Salvador, Nicaragua y Panamá quedan afuera porque su COD-AB viene de GADM (D140, D141).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T02:30:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de Honduras y Costa Rica

## Intent

El responsable pidió seguir con Honduras, El Salvador, Nicaragua, Costa Rica
y Panamá (20-11-2026). En Producción ninguno tenía nivel 4. Se trabajó en el
worktree `.worktrees/nivel4-centroamerica`.

## Scope

Dentro:

- `scripts/cod-ab-level4-lib.mjs` (lógica común), su spec
  `src/lib/cod-ab-level4.spec.ts`, `scripts/cod-ab-level4-countries.mjs`
  (configuración por país) y `scripts/build-cod-ab-level4-draft.mjs <país>`.
  Venezuela y Guatemala ya repetían esta forma; quedan como estaban.
- `supabase/sql-drafts/0088_honduras_local_governments.sql` y
  `0089_costa_rica_local_governments.sql`, generados. Números provisionales.
- D140 y D141, las filas del README de borradores y la del índice.

Fuera, con la razón en D141: El Salvador, Nicaragua y Panamá.

## Checklist

- [x] Spec del módulo común en rojo y después en verde. Prueba: `vitest run`.
- [x] Borradores generados. Prueba: 298 y 84 filas, todos los padres con
      hijos, todas con punto.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] Corren en la base local y se deshacen. Prueba: transacción con
      `rollback`.
- [x] D140 y D141 escritas. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Honduras.** COD-AB de HDX con datos del SINIT/SEPLAN, CC BY-IGO: 298
  municipios con un punto cada uno. Casi todos los nombres vienen sin tildes
  ("Roatan", "Jose Santos Guardiola"): Wikidata (clase `Q2602693`, CC0) le
  dio tildes a 73, con la regla de Perú (D134): sólo cuando la única
  diferencia son tildes o mayúsculas. La regla no corrige "Cabana"
  (Cabañas), porque la ñ la vuelve otra palabra; queda como viene.
- **Costa Rica.** COD-AB de HDX con datos del INEC, CC BY-IGO, vigente desde
  el 03-12-2024: 84 cantones con tildes y un punto cada uno, incluidos Río
  Cuarto, Monteverde y Puerto Jiménez, los más nuevos.
- **Slugs.** En 0016 los padres están casi todos en inglés y con sufijo
  ("Atlántida Department", "Alajuela Province", "Bay Islands"). El padre se
  busca por ese slug, pero el de cada unidad usa el nombre correcto
  (`honduras-islas-de-la-bahia-roatan`, `costa-rica-alajuela-rio-cuarto`).
- **Afuera:** El Salvador, Nicaragua y Panamá. Su COD-AB viene de GADM (uso no
  comercial), el mismo motivo por el que el responsable salteó Surinam
  (D138). El de El Salvador, además, es anterior a la reforma de 2024 que
  bajó sus 262 municipios a 44.
- **Spec.** Módulo común 8 de 8; `tsc` sin errores.
- **Base local** (puerto 54822): con `rollback`, Honduras 298 y Costa Rica 84,
  todos con punto, y todo vuelve a 0. Con un slug ocupado abortan con
  `AGORBIS_0088_SLUG_TAKEN` y `AGORBIS_0089_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `honduras-…` y
  `costa-rica-…` son sus 25 de nivel 3.

## Pendiente

Los borradores no están aplicados en ninguna base. El responsable los revisa
y, si los aprueba, los promueve después de los anteriores. Para El Salvador,
Nicaragua y Panamá hace falta una fuente oficial que se pueda reutilizar.

## Next
Fusionado en main el 2026-11-20 (ce43b82).
