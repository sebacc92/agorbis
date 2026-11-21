---
author: Sebastián Cardoso Castillo
branch: nivel4-venezuela
status: done
type: feature
title: Nivel 4 de Venezuela · sus 335 municipios con coordenadas
description: Borrador SQL que carga los 335 municipios de Venezuela bajo sus 24 entidades, desde el COD-AB de HDX (fuente INE), con un punto por municipio (D136).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T22:30:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de Venezuela: 335 municipios con coordenadas

## Intent

Octavo país fuera de Argentina, pedido por el responsable el 20-11-2026
("sigue con venezuela"). Cada municipio tiene su alcaldía. En Producción sus
25 entidades de nivel 3 no tenían hijos.

Se trabajó en el worktree `.worktrees/nivel4-venezuela` (rama
`nivel4-venezuela`), porque otra sesión estaba activa en `main`. Colombia
(D135, 0083) estaba sin commitear en `main`: por eso esta rama usa D136 y
0084, y al unirlas hay un conflicto trivial en `DECISIONS.md`, el README de
borradores y el índice, que se resuelve dejando las dos entradas.

## Scope

Dentro:

- `scripts/venezuela-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/venezuela-level4.spec.ts`.
- `scripts/build-venezuela-level4-draft.mjs` (descarga, controles y
  escritura; exige 335 municipios).
- `supabase/sql-drafts/0084_venezuela_local_governments.sql`, generado.
  Número provisional.
- D136, la fila del README de borradores y la del índice.

Fuera: promover el borrador y las parroquias (nivel 5).

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 335 filas y las 24 entidades con municipios.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los otros
      siete. Prueba: transacción con `rollback`.
- [x] D136 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** "Venezuela (Bolivarian Republic of) - Subnational
  Administrative Boundaries" (COD-AB) en HDX, con datos del Instituto
  Nacional de Estadística, licencia CC BY-IGO, versión v01 vigente desde el
  23-02-2021: hoja `ven_admin2` (336 filas, con tildes) y `ven_adminpoints`
  (335 puntos de nivel 2).
- **Afuera:** las Dependencias Federales, que no tienen municipio. Quedan
  335, la cifra oficial.
- **Distrito Capital y La Guaira** tienen un solo municipio cada uno
  (Libertador y Vargas). A diferencia de Asunción o Bogotá, la alcaldía es un
  gobierno distinto del de nivel 3 (Jefatura de Gobierno, Gobernación), así
  que van como nivel 4.
- **Homónimos entre estados** (Libertador, Andrés Bello, Sucre): el slug
  lleva el estado.
- **Corrección**, con test: "Autónomo Rio Negro" → "Autónomo Río Negro". Los
  municipios de Amazonas conservan el "Autónomo" con que los publica el INE.
- **Spec.** Venezuela 8 de 8.
- **Base local** (puerto 54822): con `rollback`, los ocho borradores juntos
  (Colombia tomado de `main`) dan Uruguay 136, Chile 345, Paraguay 262,
  Bolivia 339, Ecuador 221, Perú 244, Colombia 1.102 y Venezuela 335, y todo
  vuelve a 0. Con un slug ocupado (`venezuela-zulia-maracaibo`) aborta con
  `AGORBIS_0084_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `venezuela-…` son los 25 de
  nivel 3.

## Next
Fusionado en main el 2026-11-20 (417051e).

Sigue pendiente lo mismo que en los otros países: el responsable revisa
el borrador y, si lo aprueba, lo promueve después de los anteriores. El
borrador no está aplicado en ninguna base.
