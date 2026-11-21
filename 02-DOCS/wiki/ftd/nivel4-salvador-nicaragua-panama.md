---
author: Sebastián Cardoso Castillo
branch: nivel4-salvador-nicaragua-panama
status: done
type: feature
title: Nivel 4 de El Salvador, Nicaragua y Panamá · listas con control oficial
description: Borradores SQL con los 44 municipios de El Salvador y los 153 de Nicaragua desde Wikidata, controlados contra la ley de cada país, y los 81 distritos de Panamá desde la capa oficial de la ANATI (D142–D144).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T04:00:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de El Salvador, Nicaragua y Panamá

## Intent

Los tres países que habían quedado afuera de D141 porque su COD-AB viene de
GADM. El responsable pidió seguir con ellos (20-11-2026) y eligió cargarlos
desde Wikidata con un control oficial cuando no hubiera otra fuente.

## Scope

Dentro:

- `scripts/list-level4-lib.mjs` (lógica común para listas con padre), su spec
  `src/lib/list-level4.spec.ts`, `scripts/list-level4-countries.mjs` y
  `scripts/build-list-level4-draft.mjs <país>`.
- `supabase/sql-drafts/0090_el_salvador_local_governments.sql`,
  `0091_nicaragua_local_governments.sql` y `0092_panama_local_governments.sql`,
  generados. Números provisionales.
- D142 a D144, las filas del README de borradores y la del índice.

## Checklist

- [x] Spec del módulo en rojo y después en verde. Prueba: `vitest run`.
- [x] Borradores generados con el conteo oficial. Prueba: 44, 153 y 81 filas,
      todos los padres con hijos.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] Corren en la base local y se deshacen. Prueba: transacción con
      `rollback`.
- [x] D142 a D144 escritas. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Sin lista oficial descargable.** El Salvador tiene el Decreto 762 (44
  municipios desde el 01-05-2024) y Nicaragua la Ley 59 (153 municipios), los
  dos sólo como texto legal.
- **El Salvador.** Wikidata (CC0, clase `Q3556889`) trae 45 unidades; sobra
  San Sebastián Analco (`Q94339265`), que no es uno de los 44 del decreto ni
  tiene coordenadas, y queda excluida por su identificador. Quedan 44, todos
  con punto.
- **Nicaragua.** Wikidata (clase `Q318727`) trae exactamente los 153
  municipios de la Ley 59, todos con punto, bajo los 15 departamentos y las 2
  regiones autónomas.
- **Panamá.** La capa de distritos del Instituto Geográfico Nacional Tommy
  Guardia (ANATI), con datos del INEC y de la Comisión Nacional de Límites,
  trae 83 distritos con la ley que creó cada uno. Naso Tjër Di y Guna Yala son
  comarcas con categoría de distrito que ya son nivel 3: quedan afuera, como
  Asunción. Quedan 81, sin coordenadas porque la capa no declara licencia.
  Wikidata difiere en varios nombres (Kusapín frente a "Saborikäte",
  Gorgona), así que para Panamá vale la ANATI.
- **Slugs.** Los padres en 0016 están casi todos en inglés; el slug de cada
  unidad usa el nombre correcto del padre, como en D137 y D139.
- **Spec.** Módulo 8 de 8; `tsc` sin errores.
- **Base local** (puerto 54822): con `rollback`, El Salvador 44, Nicaragua 153
  (con punto) y Panamá 81, y todo vuelve a 0. Con un slug ocupado abortan con
  `AGORBIS_0090_SLUG_TAKEN`, `AGORBIS_0091_SLUG_TAKEN` y
  `AGORBIS_0092_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs de estos países son sus 45 de
  nivel 3.

## Pendiente

Los borradores no están aplicados en ninguna base. El responsable los revisa
y, si los aprueba, los promueve después de los anteriores. El Salvador y
Nicaragua dependen de Wikidata, una fuente de terceros: conviene revisarlos
contra el texto de cada ley antes de promoverlos.

## Next
Fusionado en main el 2026-11-20 (b8ec28b).
