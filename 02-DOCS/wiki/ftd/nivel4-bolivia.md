---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Bolivia · 339 municipios con coordenadas, uno pendiente
description: Borrador SQL que carga 339 municipios de Bolivia bajo sus 9 departamentos, desde el COD-AB de HDX. Las subnacionales de 2026 se hicieron en 340, así que falta identificar uno antes de promoverlo (D132).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T18:30:00-03:00
topic: ftd
---

# Nivel 4 de Bolivia: 339 municipios, uno pendiente

## Intent

Cuarto país fuera de Argentina, pedido por el responsable el 20-11-2026
("sigue con otro pais"). En Bolivia el gobierno local es el gobierno
autónomo municipal; la provincia no tiene gobierno propio. En Producción
sus 9 departamentos (nivel 3) no tenían hijos.

## Scope

Dentro:

- `scripts/bolivia-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/bolivia-level4.spec.ts`.
- `scripts/build-bolivia-level4-draft.mjs` (descarga y escritura).
- `supabase/sql-drafts/0080_bolivia_local_governments.sql`, generado.
  Número provisional.
- D132, la fila del README de borradores y la del índice.

En un commit previo y aparte: el lector de XLSX sale de la librería de
Paraguay a `scripts/xlsx-sheet.mjs`, con su spec, para no importar la
librería de un país desde otro. El borrador de Paraguay se regenera
idéntico.

Fuera: promover el borrador, y resolver el municipio que falta.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado desde el COD-AB. Prueba: 339 filas, los 9
      departamentos con municipios, todos con punto.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los otros
      tres. Prueba: transacción con `rollback`.
- [ ] Conteo contrastado con una lista oficial. **Abierto:** ver abajo.
- [x] D132 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** "Bolivia (Plurinational State of) - Subnational Administrative
  Boundaries" (COD-AB) en HDX, con datos del Ministerio de Desarrollo Rural y
  Tierras, licencia CC BY-IGO, versión v02 vigente desde el 16-09-2024: hoja
  `bol_admin3` (339 municipios con tildes) y `bol_adminpoints` (339 puntos).
- **Conteo por departamento:** La Paz 87, Santa Cruz 56, Cochabamba 47,
  Potosí 40, Oruro 35, Chuquisaca 29, Beni 19, Pando 15 y Tarija 11.
- **El que falta.** Las elecciones subnacionales del 22-03-2026 se hicieron en
  340 municipios, y la separata del Órgano Electoral (copia publicada por
  Unitel; `web.oep.org.bo` no respondía) informa 335 alcaldes electos. Una
  lista de 2021 da 41 municipios a Potosí y la capa trae 40; los otros ocho
  departamentos coinciden. No encontré una lista oficial que se pueda leer
  con un programa, así que el municipio faltante queda sin identificar.
- **Autonomías indígenas.** La capa usa nombres anteriores a algunas AIOC:
  "Charagua" (hoy Charagua Iyambae), "Gutiérrez" (Kereimba Iyaambae),
  "Chipaya" (Uru Chipaya). Se cargan como los trae la fuente.
- **Homónimos entre departamentos** (Totora, San Pedro, Santa Rosa, San
  Ramón y otros): el slug lleva el departamento.
- **Spec.** Bolivia 7 de 7; lector de XLSX 3 de 3; Paraguay 9 de 9 después de
  mover sus pruebas de XLSX.
- **Base local** (puerto 54822): con `rollback`, Uruguay 136, Chile 345,
  Paraguay 262 y Bolivia 339 (con punto), y todo vuelve a 0. Con un slug
  ocupado aborta con `AGORBIS_0080_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `bolivia-…` son los 9
  departamentos.

## Next

Antes de promover: identificar el municipio 340 (probablemente en Potosí) con
una fuente oficial del OEP o del Ministerio de Autonomías, y decidir si los
nombres de las AIOC se actualizan. Después, el mismo camino que los otros
países.
