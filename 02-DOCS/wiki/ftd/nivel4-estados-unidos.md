---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Estados Unidos · sus condados con coordenadas
description: Borrador SQL que carga los condados y equivalentes de Estados Unidos bajo sus 50 estados, desde el Gazetteer 2024 del Census Bureau, con un punto por condado (D149).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T05:20:00-03:00
topic: ftd
---

# Nivel 4 de Estados Unidos

## Intent

Pedido por el responsable el 21-11-2026 ("España y Estados Unidos, esos dos en
una tanda"), que eligió los condados y no las ciudades: son la única unidad
local que cubre todo el territorio. En Producción los 50 estados y el Distrito
de Columbia (nivel 3) no tenían hijos.

## Scope

Dentro:

- `scripts/estados-unidos-level4-lib.mjs`,
  `scripts/build-estados-unidos-level4-draft.mjs` y
  `src/lib/estados-unidos-level4.spec.ts`.
- `supabase/sql-drafts/0096_estados_unidos_local_governments.sql`, generado.
  Número provisional.
- D149, la fila del README de borradores y la del índice.

Fuera: promover el borrador, las ciudades (un nivel 5 futuro), Puerto Rico y
los demás territorios, que no son nivel 3 en la base.

## Checklist

- [x] Casos del spec en rojo y después en verde. Prueba: `vitest run`, 9 de 9.
- [x] Borrador generado. Prueba: 3.142 filas, los 50 estados con hijos,
      todos con punto.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] Corre en la base local y se deshace. Prueba: transacción con `rollback`.
- [x] D149 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 21-11-2026.

- **Fuente.** `2024_Gaz_counties_national.zip` del Census Bureau: 3.222
  filas, 3.143 en los estados y DC más 78 de Puerto Rico. Sufijos: 2.999
  County, 64 Parish, 13 Borough, 4 City and Borough, 2 Municipality, 11
  Census Area, 9 Planning Region, 40 ciudades independientes y Carson City.
  Un sufijo nuevo hace fallar el generador.
- **Fuera.** DC (11001), Puerto Rico y Kalawao (15005): 3.142 filas.
- **Base local** (puerto 54822), junto con el borrador de España y con
  `rollback`: 3.142 comunidades de nivel 4, 3.142 con punto, los 50 estados
  con hijos, y vuelve a 0. Con `estados-unidos-ny-kings-county` ocupado aborta
  con `AGORBIS_0096_SLUG_TAKEN`.
- **Producción, sólo lectura.** 0 comunidades de nivel 4 bajo Estados Unidos
  y ningún slug `estados-unidos-xx-…` ocupado.
- **Gates.** `pnpm lint`, `pnpm build.types`, `pnpm test` (1.775 tests) y
  `pnpm test.release` en verde con Node 22.22.0.

## Pendiente

El borrador no está aplicado en ninguna base.

## Next

Que el responsable revise el borrador y decida cuándo promoverlo.
