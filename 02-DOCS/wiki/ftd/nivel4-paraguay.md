---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Paraguay · sus 262 distritos con coordenadas
description: Borrador SQL que carga los 262 distritos de Paraguay bajo sus 17 departamentos, desde el COD-AB de HDX (fuente INE) y contrastado con las intendencias electas en 2026. Tercer país fuera de Argentina (D131).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T17:00:00-03:00
topic: ftd
---

# Nivel 4 de Paraguay: 262 distritos con coordenadas

## Intent

Después de Uruguay (D129) y Chile (D130), el responsable pidió otro país
(20-11-2026). Paraguay: cada distrito tiene su municipalidad e intendente, y
cubren todo el territorio. En Producción sus 17 departamentos y Asunción
(nivel 3) no tenían hijos.

## Scope

Dentro:

- `scripts/paraguay-level4-lib.mjs` (lógica pura, incluido un lector mínimo
  de XLSX) y su spec `src/lib/paraguay-level4.spec.ts`.
- `scripts/build-paraguay-level4-draft.mjs` (descarga, contraste y escritura).
- `scripts/zip-entry.mjs` y su spec: el lector de zip sale del generador de
  Chile para que lo usen los dos.
- `scripts/level4-draft-sql.mjs` acepta coordenadas opcionales por fila;
  Uruguay y Chile siguen sin ellas.
- `supabase/sql-drafts/0079_paraguay_local_governments.sql`, generado.
  Número provisional.
- D131, la fila del README de borradores y la del índice.

Fuera: lo mismo que en los otros países hasta que el responsable promueva el
borrador, y los nombres de los departamentos en 0016, que están en
mayúsculas y sin tildes.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado y contrastado con la Justicia Electoral. Prueba: los
      conteos por departamento coinciden; el generador falla si no.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los de Uruguay
      y Chile. Prueba: transacción con `rollback`.
- [x] D131 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente de nombres y puntos.** "Paraguay - Subnational Administrative
  Boundaries" (COD-AB) en HDX, con datos del INE de Paraguay, licencia CC
  BY-IGO, vigente al 29-07-2026: hoja `pry_admin2` (263 distritos, con
  tildes) y `pry_adminpoints` (un punto por distrito).
- **Contraste.** La Justicia Electoral publica los 263 intendentes electos
  en octubre de 2026 (`candidatos-electos-intendentes-2026.xlsx`). Por
  departamento, los conteos coinciden con la capa. Sus nombres vienen en
  mayúsculas, sin tildes y abreviados ("PEDRO J. CABALLERO"), así que no
  sirven como nombre visible. El archivo trae nombres y cédulas: el generador
  sólo lee los códigos y no guarda nada.
- **Asunción** es un solo distrito y su comunidad de nivel 3 ya es su
  gobierno local: no lleva nivel 4. Quedan 262.
- **Homónimo:** Bella Vista, en Amambay y en Itapúa. El slug lleva el
  departamento (`paraguay-amambay-bella-vista`).
- **Mayúsculas corregidas**, sólo dos y con test: "R.i. 3 Corrales" → "R.I. 3
  Corrales" y "Juan E. O'leary" → "Juan E. O'Leary". El resto, como lo publica
  el INE.
- **Diferencias de nombre con el TSJE** que no cambian el conteo: la capa
  dice "Villa Curuguaty" y el TSJE "San Isidro Curuguaty"; "Ybyrarobaná" y
  "Ybyrarovaná"; "Yabebyry" y "Yavevyry". Se usa la grafía del INE.
- **Spec.** Paraguay 11 de 11, zip 2 de 2; los seis specs de nivel 4 en
  verde.
- **Base local** (puerto 54822): con `rollback`, Uruguay 136, Chile 345 y
  Paraguay 262 (todos con punto), y todo vuelve a 0. Con un slug ocupado
  aborta con `AGORBIS_0079_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `paraguay-…` son los 18 de
  nivel 3.

## Next

El responsable revisa el borrador. Si lo aprueba: promoverlo después de 0076,
Uruguay y Chile. Aparte: decidir si se corrigen los nombres de los
departamentos en 0016 ("ALTO PARANA" → "Alto Paraná").
