---
author: Sebastián Cardoso Castillo
branch: nivel4-guatemala
status: done
type: feature
title: Nivel 4 de Guatemala · sus 340 municipios con coordenadas
description: Borrador SQL que carga los 340 municipios de Guatemala bajo sus 22 departamentos, desde el COD-AB de HDX (fuente CONRED), con un punto por municipio (D139).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T01:30:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de Guatemala: 340 municipios con coordenadas

## Intent

Primer país de Centroamérica, pedido por el responsable el 20-11-2026 ("si,
sigue con guatemala"). Cada municipio tiene su alcaldía. En Producción sus 22
departamentos (nivel 3) no tenían hijos. Se trabajó en el worktree
`.worktrees/nivel4-guatemala` por si la otra sesión seguía en `main`.

## Scope

Dentro:

- `scripts/guatemala-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/guatemala-level4.spec.ts`.
- `scripts/build-guatemala-level4-draft.mjs` (descarga, controles y
  escritura; exige 340 municipios).
- `supabase/sql-drafts/0087_guatemala_local_governments.sql`, generado.
  Número provisional.
- D139, la fila del README de borradores y la del índice.

Fuera: promover el borrador y los nombres mal cargados en 0016.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 340 filas, los 22 departamentos con
      municipios, todos con punto.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace. Prueba: transacción
      con `rollback`.
- [x] D139 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** "Guatemala - Subnational Administrative Boundaries" (COD-AB) en
  HDX, con datos de la CONRED, licencia CC BY-IGO, versión v01 vigente desde
  el 07-02-2019: hoja `gtm_admin2` (342 filas, con tildes) y
  `gtm_adminpoints` (un punto por unidad).
- **Afuera:** los lagos de Amatitlán y Atitlán (`GT0100`, `GT0700`), que la
  capa trae como unidades propias. Quedan los 340 municipios oficiales,
  incluido Petatán, el más nuevo.
- **Homónimos entre departamentos** (San Pedro Sacatepéquez y otros 5): el
  slug lleva el departamento.
- **Datos viejos de 0016:** "Izabal Department", "Santa Rosa Department" y
  "Suchitepeque". El padre se busca por ese slug, pero el slug de los
  municipios usa el nombre correcto (`guatemala-izabal-puerto-barrios`).
- **Spec.** Guatemala 7 de 7.
- **Base local** (puerto 54822): con `rollback`, Guatemala pasa de 0 a 340
  comunidades de nivel 4, todas con punto, y vuelve a 0. Con un slug ocupado
  (`guatemala-izabal-puerto-barrios`) aborta con `AGORBIS_0087_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `guatemala-…` son los 22
  departamentos.

## Pendiente

El borrador no está aplicado en ninguna base. El responsable lo revisa y, si
lo aprueba, lo promueve después de los anteriores.

## Next
Fusionado en main el 2026-11-20 (4e193bf).
