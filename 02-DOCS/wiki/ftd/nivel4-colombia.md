---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Colombia · sus 1.102 municipios, sin coordenadas
description: Borrador SQL que carga los 1.102 municipios de Colombia bajo sus 32 departamentos; la lista sale de la DIVIPOLA del DANE (CC BY-SA 4.0) y los nombres del COD-AB de HDX (D135).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T21:30:00-03:00
topic: ftd
---

# Nivel 4 de Colombia: 1.102 municipios, sin coordenadas

## Intent

Séptimo país fuera de Argentina, pedido por el responsable el 20-11-2026
("sigue con colombia"). Cada municipio tiene su alcaldía. En Producción sus
32 departamentos y Bogotá (nivel 3) no tenían hijos.

Decisión del responsable (20-11-2026): **la DIVIPOLA define la lista y los
nombres salen del COD-AB por código**. Ver D135.

## Scope

Dentro:

- `scripts/colombia-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/colombia-level4.spec.ts`.
- `scripts/build-colombia-level4-draft.mjs` (descarga, controles y
  escritura).
- `supabase/sql-drafts/0083_colombia_local_governments.sql`, generado.
  Número provisional.
- D135, la fila del README de borradores y la del índice.

Fuera: promover el borrador, las 20 localidades de Bogotá y el nombre en
inglés de Bogotá en 0016 ("Bogota Capital District").

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 1.102 filas, todos los municipios de la
      DIVIPOLA menos Bogotá, y los 32 departamentos con municipios.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los otros
      seis. Prueba: transacción con `rollback`.
- [x] D135 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Lista.** "DIVIPOLA - Códigos municipios" del DANE en datos.gov.co
  (`gdxc-w37w`, actualizada el 24-09-2026, licencia CC BY-SA 4.0): 1.122
  unidades, que son 1.103 municipios (con Bogotá), la isla de San Andrés y 18
  áreas no municipalizadas en Amazonas, Guainía y Vaupés.
- **Nombres.** COD-AB de Colombia en HDX (DANE, CC BY-IGO, vigente desde el
  16-04-2020), con mayúsculas y tildes, por código. Está desactualizado:
  todavía trae Mapiripana, que la DIVIPOLA ya no lista, y le falta Nuevo
  Belén de Bajirá (Chocó), que toma su nombre de la DIVIPOLA. Usa la forma
  corriente en dos casos: "Cali" ("Santiago de Cali" en la DIVIPOLA) y
  "Mompós" ("Santa Cruz de Mompox").
- **Afuera:** Bogotá es un único distrito y ya es nivel 3, como Asunción
  (D131); la isla de San Andrés y las áreas no municipalizadas no tienen
  municipio y quedan en su departamento, como en Uruguay (D129).
- **Sin coordenadas.** El COD-AB no trae puntos; la DIVIPOLA sí, pero con
  licencia CC BY-SA, así que no se usan.
- **Homónimos entre departamentos** (Providencia, Albania y otros): el slug
  lleva el departamento.
- **Spec.** Colombia 8 de 8.
- **Base local** (puerto 54822): con `rollback`, los siete borradores juntos
  dan Uruguay 136, Chile 345, Paraguay 262, Bolivia 339, Ecuador 221, Perú
  244 y Colombia 1.102, y todo vuelve a 0. Con un slug ocupado
  (`colombia-antioquia-medellin`) aborta con `AGORBIS_0083_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `colombia-…` son los 33 de
  nivel 3.

## Next

El responsable revisa el borrador y la licencia CC BY-SA de la DIVIPOLA. Si
lo aprueba: promoverlo después de los anteriores.
