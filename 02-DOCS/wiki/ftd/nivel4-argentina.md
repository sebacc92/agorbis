---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Argentina · gobiernos locales de las 24 jurisdicciones
description: Borrador SQL que carga los municipios de Georef en las 22 jurisdicciones sin nivel 4, departamentos en Santa Cruz y Santiago del Estero, y baja a nivel 5 las cinco localidades bonaerenses que convivían con su partido (D127).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T02:20:00-03:00
topic: ftd
---

# Nivel 4 de Argentina: gobiernos locales de las 24 jurisdicciones

## Intent

El 20-11-2026, Producción tenía nivel 4 sólo en Buenos Aires: 135 partidos y 5
localidades. Las otras 23 jurisdicciones tenían 0, así que fuera de Buenos Aires
nadie podía elegir su ciudad (D112, mejoras 8 y 9). El responsable eligió:
municipios de Georef como nivel 4, departamentos donde Georef no trae municipios,
y las 5 localidades movidas bajo su partido. La decisión es D127.

## Scope

Dentro:

- `scripts/argentina-level4-lib.mjs` (lógica pura), su spec y
  `scripts/build-argentina-level4-draft.mjs` (descarga y escritura).
- `supabase/sql-drafts/0076_argentina_local_governments.sql`, generado. Va en
  `sql-drafts/` y no en `migration-drafts/`, que tiene inventario fijo de D72.
- El rótulo del nivel 5: de "Barrio" a "Localidad o barrio", con su traducción.
- D127 en `DECISIONS.md`.

Fuera, hasta que el responsable promueva el borrador: la migración numerada, su
test en `supabase/tests/`, la fila del README, `pnpm db.types`, el manual (la
cadena de Mar del Plata pasa de 5 a 6 comunidades) y el guion de video.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run` del spec.
- [x] Borrador generado desde Georef. Prueba: cantidad de filas por provincia
      igual a la que informa la API.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace. Prueba: aplicado dentro
      de una transacción con `rollback`.
- [x] Rótulo del nivel 5 con traducción. Prueba: `check-i18n`, `tsc` y specs.
- [x] D127 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- Spec `src/lib/argentina-level4-draft.spec.ts`: sin el módulo falló al
  importar; con el módulo, 12 de 12.
- Generador: 1.981 filas, una por entidad de Georef en cada jurisdicción
  (Córdoba 427, Santa Fe 363, Entre Ríos 269, …, Tierra del Fuego 3; Santa
  Cruz 7 y Santiago del Estero 27 departamentos). Seis pares de homónimos
  resueltos con su departamento.
- Producción, sólo lectura: ningún slug existente empieza con un prefijo de
  provincia de las 23 jurisdicciones. Las 5 localidades no tienen hijos;
  Miramar tiene 2 residentes y las cinco tienen publicaciones (5 reclamos
  abiertos en total).
- Base local: con `rollback`, Argentina pasa a 2.116 comunidades de nivel 4 y
  5 de nivel 5 (`…ba-general-pueyrredon.mar-del-plata`). Con un slug ya
  ocupado aborta con `AGORBIS_0076_SLUG_TAKEN` y no deja nada.
- `check-i18n` (3.905 mensajes), `pnpm build.types` y 150 specs de
  comunidad en verde.

## Next

El responsable revisa el borrador. Si lo aprueba: promoverlo con número libre,
escribir `supabase/tests/argentina_level4_checks.sql`, sumar la fila del README,
correr `pnpm db.types` y actualizar el manual y el guion de video (Mar del
Plata pasa a 6 comunidades).

**Inventario de release (20-11-2026).** `cd91279` promovió 0076 y cambió
`geography_baseline_checks.sql` y `rls_checks.sql`. Sus hashes están al día
(`0f89cfa`) y la candidata D72 pasó a `0062-0076/v1`: política, preflight,
backup `post-0076` y sus tests, como `5084351` hizo con 0075. `pnpm
test.release` vuelve a pasar. El preflight exige ahora 0076 en Producción:
falta el backup previo y el `supabase db push` antes de `pnpm deploy:open`.
