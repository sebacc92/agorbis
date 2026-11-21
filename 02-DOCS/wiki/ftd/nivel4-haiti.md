---
author: Sebastián Cardoso Castillo
branch: nivel4-haiti
status: done
type: feature
title: Nivel 4 de Haití · 140 comunas
description: Borrador SQL con las 140 comunas de Haití del COD-AB del CNIGS (2018), con tildes francesas de Wikidata; las comunas posteriores quedan pendientes (D146).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T00:10:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de Haití

## Intent

Pedido por el responsable el 20-11-2026 ("sigue con haiti"). Cada comuna
tiene su consejo municipal. En Producción los 10 departamentos (nivel 3) no
tenían hijos.

## Scope

Dentro:

- La configuración de Haití en `scripts/cod-ab-level4-countries.mjs` y sus
  casos en `src/lib/cod-ab-level4.spec.ts`.
- `scripts/cod-ab-level4-lib.mjs` acepta alias del departamento y apagar la
  comprobación de tildes del padre; `scripts/build-cod-ab-level4-draft.mjs`
  pide las etiquetas de Wikidata en el idioma del país. Honduras, Costa Rica
  y República Dominicana se regeneran idénticos.
- `supabase/sql-drafts/0094_haiti_local_governments.sql`, generado. Número
  provisional.
- D146, la fila del README de borradores y la del índice.

## Checklist

- [x] Casos del spec en rojo y después en verde. Prueba: `vitest run`, 11 de 11.
- [x] Borrador generado. Prueba: 140 filas, los 10 departamentos con hijos,
      todas con punto.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] Corre en la base local y se deshace. Prueba: transacción con
      `rollback`.
- [x] D146 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20 y 21-11-2026.

- **Fuente.** COD-AB de Haití en HDX, con datos del CNIGS, CC BY-IGO,
  vigente desde 2018. adm1 son los departamentos, con nombres en inglés en
  algunas filas ("West", "North-East"), que se aceptan como alias de los de
  0016.
- **Tildes.** Las etiquetas en francés de Wikidata (CC0) corrigen
  "Petion-Ville", "Cap-Haitien", "Jeremie" y otras. "Gonaives" queda sin
  diéresis porque Wikidata la rotula "Les Gonaïves": el artículo hace que no
  difiera sólo en tildes y la regla no la toca.
- **Base local** (puerto 54822): con `rollback`, 140 comunidades de nivel 4,
  140 con punto, y vuelve a 0. Con `haiti-ouest-petion-ville` ocupado aborta
  con `AGORBIS_0094_SLUG_TAKEN`.
- **Producción, sólo lectura.** 10 departamentos, 0 comunidades de nivel 4
  bajo Haití y ningún slug `haiti-…-…` ocupado.

## Pendiente

El borrador no está aplicado en ninguna base. Antes de promoverlo: sumar las
6 comunas que Wikidata lista y la capa de 2018 no tiene, con una fuente
oficial.

## Next
Fusionado en main el 2026-11-20 (4be8632).
