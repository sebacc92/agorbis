---
author: Sebastián Cardoso Castillo
branch: nivel4-caribe
status: done
type: feature
title: Nivel 4 de República Dominicana · 154 municipios, La Victoria pendiente
description: Borrador SQL con los 154 municipios de República Dominicana del COD-AB oficial de la ONE (2021), sin el Distrito Nacional; La Victoria, creada en 2026, queda pendiente (D145).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T05:00:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de República Dominicana

## Intent

Primer país del Caribe, pedido por el responsable el 20-11-2026 ("sigue con
el caribe"). Cada municipio tiene su ayuntamiento. En Producción las 31
provincias y el Distrito Nacional (nivel 3) no tenían hijos.

## Scope

Dentro:

- La configuración de República Dominicana en
  `scripts/cod-ab-level4-countries.mjs` y su caso en
  `src/lib/cod-ab-level4.spec.ts`.
- `scripts/build-cod-ab-level4-draft.mjs` acepta niveles distintos de
  adm1/adm2 y un prefijo a quitar; Honduras y Costa Rica se regeneran
  idénticos.
- `supabase/sql-drafts/0093_republica_dominicana_local_governments.sql`,
  generado. Número provisional.
- D145, la fila del README de borradores y la del índice.

Fuera: Cuba (ver Pendiente).

## Checklist

- [x] Caso del spec en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 154 filas, las 31 provincias con hijos,
      todas con punto.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] Corre en la base local y se deshace. Prueba: transacción con
      `rollback`.
- [x] D145 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** COD-AB de República Dominicana en HDX, con datos de la Oficina
  Nacional de Estadística, CC BY-IGO, vigente desde el 29-06-2021. En esta
  capa adm1 son las regiones de planificación, adm2 las provincias y adm3 los
  municipios, todos con prefijo ("Provincia Duarte", "Municipio Arenoso"),
  que se quita.
- **Afuera:** Santo Domingo de Guzmán, que es el Distrito Nacional y ya es
  nivel 3 ("Nacional" en 0016), como Asunción. Quedan 154.
- **Pendiente:** Wikidata lista 158 municipios contando el Distrito Nacional.
  Casi todas las diferencias con la capa son de nombre ("Santiago de los
  Caballeros", "La Mata (República Dominicana)"), pero La Victoria (Santo
  Domingo), creada en 2026, no está en la capa de 2021.
- **Spec.** 9 de 9; `tsc` sin errores.
- **Base local** (puerto 54822): con `rollback`, 154 comunidades de nivel 4
  con punto, y vuelve a 0. Con un slug ocupado aborta con
  `AGORBIS_0093_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `republica-dominicana-…` son
  los 32 de nivel 3.
- **Cuba,** sin cargar: su COD-AB viene de GADM y en Wikidata muchos
  municipios cuelgan a la vez de su provincia actual y de las que dejaron de
  existir (La Habana antes de 2011, Oriente). Separarlos pide reglas a mano
  sobre una fuente de terceros; queda para decidir con el responsable.

## Pendiente

El borrador no está aplicado en ninguna base. Antes de promoverlo: sumar La
Victoria con una fuente oficial. Cuba espera una decisión sobre la fuente.

## Next
Fusionado en main el 2026-11-20 (8d0a708).
