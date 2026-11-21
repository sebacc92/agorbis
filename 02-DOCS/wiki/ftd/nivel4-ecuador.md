---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Ecuador · sus 221 cantones, sin coordenadas
description: Borrador SQL que carga los 221 cantones de Ecuador bajo sus 24 provincias, desde el COD-AB de HDX (fuente INEC). Quinto país fuera de Argentina (D133).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T19:30:00-03:00
topic: ftd
---

# Nivel 4 de Ecuador: 221 cantones, sin coordenadas

## Intent

Quinto país fuera de Argentina, pedido por el responsable el 20-11-2026
("continua con otro pais"). Cada cantón tiene su GAD municipal y cubren el
país. En Producción sus 24 provincias (nivel 3) no tenían hijos.

## Scope

Dentro:

- `scripts/ecuador-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/ecuador-level4.spec.ts`.
- `scripts/build-ecuador-level4-draft.mjs` (descarga y escritura; falla si
  no salen 221 cantones o una provincia queda vacía).
- `supabase/sql-drafts/0081_ecuador_local_governments.sql`, generado.
  Número provisional.
- D133, la fila del README de borradores y la del índice.

Fuera: promover el borrador, las parroquias (nivel 5) y los nombres de
provincia sin tilde de 0016 ("Manabi", "Sucumbios").

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado desde el COD-AB. Prueba: 221 filas, las 24
      provincias con cantones.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los otros
      cuatro. Prueba: transacción con `rollback`.
- [x] D133 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** "Ecuador - Subnational Administrative Boundaries" (COD-AB) en
  HDX, con datos del INEC, licencia CC BY-IGO, cobertura a 2024: hoja
  `ecu_admgz_adm2`, 223 filas. Dos son territorio sin cantón (`ECISLA`, una
  isla, y `ECNO APLICA`, la zona en estudio de Juval entre Cañar y
  Chimborazo) y quedan afuera. Quedan 221, la cifra del INEC.
- **Sin coordenadas.** Este COD-AB no trae hoja de puntos, sólo polígonos en
  el shapefile. Se dejan vacías, como en Uruguay y Chile: el GPS sugiere la
  provincia. Calcular centroides de los polígonos es posible (la licencia lo
  permite) y queda como mejora aparte.
- **Correcciones**, con test: espacios repetidos colapsados ("General Antonio
  Elizalde") y una mayúscula ("Camilo Ponce Enríquez"). Quito figura con su
  nombre oficial, "Distrito Metropolitano de Quito".
- **Homónimos entre provincias** (Bolívar y Olmedo, cada uno en dos provincias): el slug
  lleva la provincia.
- **Spec.** Ecuador 8 de 8.
- **Base local** (puerto 54822): con `rollback`, los cinco borradores juntos
  dan Uruguay 136, Chile 345, Paraguay 262, Bolivia 339 y Ecuador 221, y todo
  vuelve a 0. Con un slug ocupado (`ecuador-pichincha-cayambe`) aborta con
  `AGORBIS_0081_SLUG_TAKEN`; con un slug que no estaba en el borrador, falla
  igual por el total (`UNEXPECTED_TOTALS: nivel 4 222`).
- **Producción, sólo lectura.** Los únicos slugs `ecuador-…` son las 24
  provincias.

## Next

El responsable revisa el borrador. Si lo aprueba: promoverlo después de los
anteriores, con su test, README, `pnpm db.types`, D72 y backup.
