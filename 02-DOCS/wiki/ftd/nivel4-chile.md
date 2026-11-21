---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Chile · sus 345 comunas, sin coordenadas
description: Borrador SQL que carga las 345 comunas con municipalidad propia bajo sus 16 regiones, desde la DPA 2023 (SUBDERE, IGM, DIFROL, INE). Segundo país después del piloto de Uruguay (D130).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T16:10:00-03:00
topic: ftd
---

# Nivel 4 de Chile: 345 comunas, sin coordenadas

## Intent

Después del piloto de Uruguay (D129), el responsable pidió seguir con otro
país (20-11-2026). Chile: cada comuna tiene su municipalidad y cubren todo el
territorio, así que no queda población fuera del nivel 4. En Producción sus
16 regiones (nivel 3) no tenían hijos.

Decisión del responsable (20-11-2026): **nombres sin coordenadas**. La
documentación de la fuente pide que la DIFROL valide los productos derivados
de la cartografía; no se usa nada de los polígonos. Ver D130.

## Scope

Dentro:

- `scripts/chile-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/chile-level4.spec.ts`.
- `scripts/build-chile-level4-draft.mjs` (descarga y escritura; acepta un zip
  local para no bajar 310 MB en cada corrida).
- `scripts/level4-draft-sql.mjs` y su spec: el SQL común con Uruguay, que
  pasa a usarlo sin cambiar sus filas.
- `supabase/sql-drafts/0078_chile_local_governments.sql`, generado. Número
  provisional.
- D130, la fila del borrador en `supabase/sql-drafts/README.md` y la del índice.

Fuera: lo mismo que en Uruguay hasta que el responsable promueva el borrador
(migración, test, README, `pnpm db.types`, D72), y la corrección de los datos
viejos de 0016 que se ven abajo.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado desde la DPA 2023. Prueba: 345 filas, las 16 regiones
      con comunas.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, solo y junto al de
      Uruguay. Prueba: transacción con `rollback`.
- [x] D130 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** Capa COMUNAS de la DPA 2023 (publicada el 03-08-2023), en la
  categoría "Límites y fronteras" del geoportal de la IDE Chile. En
  `datos.gob.cl` la ficha de la SUBDERE figura con licencia Creative Commons
  No Comercial y la categoría del geoportal con CC BY; los enlaces de la ficha
  de la SUBDERE están caídos (404). La documentación dice que los productos
  derivados de la cartografía deben ser validados por la DIFROL.
- **Conteo.** 345 comunas, sin homónimos en todo el país: Metropolitana 52,
  Valparaíso 38, O'Higgins 33, Biobío 33, La Araucanía 32, Maule 30, Los Lagos
  30, Ñuble 21, Coquimbo 15, Los Ríos 12, Aysén 10, Magallanes 10, Antofagasta
  9, Atacama 9, Tarapacá 7 y Arica y Parinacota 4. La capa no incluye la
  comuna Antártica, que no tiene municipalidad propia (la administra la de
  Cabo de Hornos): queda fuera por el mismo criterio de D127.
- **Nombres.** Se usan como los escribe la fuente, que sigue la grafía de la
  SUBDERE: "Aisén" y "Coihaique", no "Aysén" ni "Coyhaique".
- **Spec.** Sin el módulo falló al importar; con el módulo, en verde. Los
  cuatro specs de nivel 4 suman 44 de 44.
- **Base local** (puerto 54822): con `rollback`, Chile pasa de 0 a 345
  comunas de nivel 4 sin coordenadas; junto al borrador de Uruguay, 345 y 136,
  y todo vuelve a 0. Con un slug ocupado aborta con `AGORBIS_0078_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `chile-…` son las 16
  regiones.
- **Datos viejos de 0016**, sin tocar: la región de Valparaíso tiene longitud
  −89,7 (la arrastra Isla de Pascua) y el nombre de Aysén está abreviado
  ("del Gral.Ibañez"). Con el GPS sugiriendo regiones, el punto de Valparaíso
  importa más que antes.

## Next

El responsable revisa el borrador. Si lo aprueba: promoverlo después de 0076 y
de Uruguay, con su test, README, `pnpm db.types`, D72 y backup. Aparte: decidir
si se corrige el punto y el nombre de las regiones de Valparaíso y Aysén.
