---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Perú · 194 provincias y los distritos de Lima y El Callao
description: Borrador SQL que carga las municipalidades provinciales de Perú como nivel 4 y, bajo Lima Metropolitana y El Callao, sus 50 distritos; nombres del IGN con tildes de Wikidata y coordenadas (D134).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T20:30:00-03:00
topic: ftd
---

# Nivel 4 de Perú: provincias, y distritos en Lima y El Callao

## Intent

Sexto país fuera de Argentina, pedido por el responsable el 20-11-2026
("sigue con peru"). Perú tiene dos capas de gobierno local: 196
municipalidades provinciales y unos 1.870 distritos con municipalidad
distrital. El responsable eligió las **provincias** como nivel 4; los
distritos del resto del país quedan para un nivel 5 futuro. Para los
nombres, me pidió la mejor opción.

## Scope

Dentro:

- `scripts/peru-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/peru-level4.spec.ts`.
- `scripts/build-peru-level4-draft.mjs` (descarga del COD-AB, consulta a
  Wikidata, controles y escritura).
- `supabase/sql-drafts/0082_peru_local_governments.sql`, generado. Número
  provisional.
- D134, la fila del README de borradores y la del índice.

Fuera: promover el borrador, los distritos fuera de Lima y El Callao, y los
nombres de 0016.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 244 filas, igual al total que da la capa
      (196 provincias, menos El Callao y Lima, más sus 50 distritos), y los 25
      departamentos con filas.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los otros
      cinco. Prueba: transacción con `rollback`.
- [x] D134 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** "Peru - Subnational Administrative Boundaries" (COD-AB) en HDX,
  con datos del IGN, licencia CC BY-IGO: hojas `per_admin2` (196
  provincias), `per_admin3` (1.873 distritos) y `per_adminpoints` (un punto
  por unidad).
- **Lima y El Callao.** En Producción ya son nivel 3 ("Municipalidad
  Metropolitana de Lima" y "El Callao") y son ellos mismos gobiernos
  provinciales, así que debajo van sus distritos: 43 y 7. La región Lima
  lleva sus otras 9 provincias.
- **Tildes.** El IGN publica casi todos los nombres sin tildes ("Huanuco",
  "Asuncion"). No encontré una fuente oficial con tildes que se pueda leer
  con un programa: el repositorio `jmcastagnetto/ubigeo-peru-aumentado` (MIT)
  también las trae en mayúsculas sin tildes. Se usan las etiquetas en español
  de Wikidata (CC0), emparejadas por nombre dentro de su departamento o
  provincia, **sólo cuando difieren del IGN únicamente en tildes o
  mayúsculas**. Resultado: el IGN ya traía 5 con tilde, Wikidata corrigió
  46, y el resto no lleva tilde ("Sandia", "La Victoria"). Queda sin
  corregir "Vilcas Huaman", porque Wikidata la escribe "Vilcashuamán" y la
  regla no deja cambiar espacios.
- **Spec.** Perú 8 de 8.
- **Base local** (puerto 54822): con `rollback`, los seis borradores juntos
  dan Uruguay 136, Chile 345, Paraguay 262, Bolivia 339, Ecuador 221 y Perú
  244 (con punto), y todo vuelve a 0. Con un slug ocupado
  (`peru-cusco-cusco`) aborta con `AGORBIS_0082_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `peru-…` son los 26 de
  nivel 3.
- **Desactualización.** La capa trae 1.873 distritos y hoy hay más; no afecta
  a las provincias ni a los distritos de Lima y El Callao, pero sí a un
  futuro nivel 5.

## Next

El responsable revisa el borrador. Si lo aprueba: promoverlo después de los
anteriores. Para el nivel 5 de distritos hará falta una fuente más reciente.
