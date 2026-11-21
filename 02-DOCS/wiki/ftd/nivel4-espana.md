---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de España · sus 8.130 municipios, sin coordenadas
description: Borrador SQL que carga los 8.130 municipios de España bajo sus 17 comunidades autónomas, desde la Relación de municipios del INE a 1 de enero de 2025 (D148).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T05:20:00-03:00
topic: ftd
---

# Nivel 4 de España

## Intent

Pedido por el responsable el 21-11-2026 ("España y Estados Unidos, esos dos en
una tanda"), que eligió los municipios y no las provincias. Cada municipio
tiene su ayuntamiento y entre todos cubren el territorio. En Producción las 17
comunidades autónomas, Ceuta y Melilla (nivel 3) no tenían hijos.

## Scope

Dentro:

- `scripts/espana-level4-lib.mjs`, `scripts/build-espana-level4-draft.mjs` y
  `src/lib/espana-level4.spec.ts`.
- `scripts/xlsx-sheet.mjs` acepta filas de título antes del encabezado; la
  planilla del INE trae una.
- `supabase/sql-drafts/0095_espana_local_governments.sql`, generado. Número
  provisional.
- D148, la fila del README de borradores y la del índice.

Fuera: promover el borrador, los nombres en inglés de las comunidades en 0016
("Andalusia", "Catalonia") y las provincias como nivel intermedio.

## Checklist

- [x] Casos del spec en rojo y después en verde. Prueba: `vitest run`, 14 de
      14 (y 4 de 4 en `xlsx-sheet.spec.ts`).
- [x] Borrador generado. Prueba: 8.130 filas, las 17 comunidades con hijos.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] Corre en la base local y se deshace. Prueba: transacción con `rollback`.
- [x] D148 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 21-11-2026.

- **Fuente.** `diccionario25.xlsx` del INE, Relación de municipios a 1 de
  enero de 2025: 8.132 filas con CODAUTO, CPRO, CMUN y NOMBRE, después de una
  fila de título. Castilla y León trae 2.248 y Cataluña 947, como el INE.
- **Nombres.** 611 partes con el artículo pospuesto pasan adelante
  ("El Bonillo", "L'Hospitalet de Llobregat", "La Vila Joiosa/Villajoyosa").
  "Castell d'Aro, Platja d'Aro i s'Agaró" y "Cruïlles, Monells i Sant
  Sadurní de l'Heura" quedan intactos porque la coma no precede a un artículo.
- **Base local** (puerto 54822), junto con el borrador de Estados Unidos y con
  `rollback`: 8.130 comunidades de nivel 4, las 17 comunidades con hijos, y
  vuelve a 0.
- **Producción, sólo lectura.** 0 comunidades de nivel 4 bajo España. Los
  únicos slugs con forma parecida son `espana-castille-la-mancha` y
  `espana-castille-and-leon`, de nivel 3, que no chocan.
- **Gates.** `pnpm lint`, `pnpm build.types`, `pnpm test` (1.775 tests) y
  `pnpm test.release` en verde con Node 22.22.0.

## Pendiente

El borrador no está aplicado en ninguna base.

## Next

Que el responsable revise el borrador y decida cuándo promoverlo.
