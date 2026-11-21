---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Nivel 4 de Uruguay · piloto fuera de Argentina con los 136 municipios
description: Borrador SQL que carga los 136 municipios de Uruguay bajo sus 19 departamentos, desde el plan circuital 2025 de la Corte Electoral. Es el país piloto antes de llevar el nivel 4 al resto del mundo (D129).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T15:10:00-03:00
topic: ftd
---

# Nivel 4 de Uruguay: piloto con los 136 municipios

## Intent

El 20-11-2026 el responsable pidió completar el nivel 4 fuera de Argentina,
empezando por un país piloto: Uruguay. En Producción, sus 19 departamentos
(nivel 3) no tenían hijos. El piloto prueba el molde de 0076 (D127) con
otra fuente y otro país antes de pensar en el resto del mundo.

Decisión del responsable (20-11-2026): **sólo los 136 municipios**. Quien
vive fuera de todo municipio elige su departamento, que en Uruguay es su
gobierno local directo (la Intendencia). Ver D129.

## Scope

Dentro:

- `scripts/uruguay-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/uruguay-level4.spec.ts`.
- `scripts/build-uruguay-level4-draft.mjs` (descarga y escritura).
- `supabase/sql-drafts/0077_uruguay_local_governments.sql`, generado. El
  número es provisional: se confirma al promoverlo.
- D129 en `DECISIONS.md` y la fila del borrador en `supabase/sql-drafts/README.md`.

Fuera, hasta que el responsable promueva el borrador: la migración numerada,
su test en `supabase/tests/` (`geography_baseline_checks.sql` fija la
distribución por nivel), la fila del README, `pnpm db.types`, la candidata
D72, el manual y cualquier otro país.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run` del spec.
- [x] Borrador generado desde la Corte Electoral. Prueba: 136 filas y los
      conteos por departamento iguales a los del CSV.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace. Prueba: aplicado dentro
      de una transacción con `rollback`.
- [x] D129 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** Plan circuital de las Elecciones Departamentales y Municipales
  2025, de la Corte Electoral, en el catálogo de datos abiertos
  (`catalogodatos.gub.uy`, dataset
  `corte-electoral-elecciones_departamentales_y_municipales_2025`), con la
  Licencia de Datos Abiertos de AGESIC. Cada circuito trae departamento y
  municipio; el valor `SIN MUNICIPIO` marca el territorio no municipalizado.
- **Conteo.** 136 municipios: Canelones 32, Cerro Largo 16, Colonia 13,
  Paysandú 9, Montevideo 8, Maldonado 8, Lavalleja 6, Salto 6, Treinta y Tres 6,
  Soriano 5, Rocha 4, San José 4, Tacuarembó 4, Artigas 3, Florida 3, Río
  Negro 3, Rivera 3, Durazno 2 y Flores 1.
- **Hueco.** Con los totales por comisión receptora: 752.159 de 2.724.184
  habilitados (27,6 %) votan fuera de todo municipio. Sólo Montevideo,
  Canelones y Maldonado están cubiertos enteros; en los otros 16 la capital
  departamental no tiene municipio.
- **Coordenadas.** La Corte Electoral no las publica. La capa
  `areas_urbanizadas_3` de la IDE ubicó 85 de 128 municipios del interior por
  nombre (faltan Las Piedras, Pando, Maldonado, Dolores). Se dejan vacías: la
  detección por GPS del onboarding ignora comunidades sin coordenadas y
  sugiere el departamento. Con coordenadas aproximadas podía mandar a alguien
  de la ciudad de Salto a un municipio rural, porque el punto del departamento
  cae unos 90 km al este de la ciudad.
- **Producción, sólo lectura.** Existen los 19 departamentos con
  `path = earth.south-america.uruguay.<slug>` y sin hijos; ningún otro slug
  empieza con `uruguay-`. `lat` y `lng` admiten nulos (1.152 comunidades ya
  los tienen).
- **Spec** `src/lib/uruguay-level4.spec.ts`: sin el módulo falló al importar;
  con el módulo, 15 de 15 (27 de 27 junto al de Argentina).
- **Generador:** 136 filas de 7.196 circuitos, con los mismos conteos por
  departamento que arriba.
- **Base local** (puerto 54822, con 0076): con `rollback`, Uruguay pasa de 0
  a 136 comunidades de nivel 4, sin `lat`/`lng`, y vuelve a 0. Con un slug ya
  ocupado aborta con `AGORBIS_0077_SLUG_TAKEN` y no deja nada.
- `pnpm lint` (incluye `check-i18n` y el contrato de base) y
  `pnpm build.types` en verde.

## Next

El responsable revisa el borrador. Si lo aprueba: aplicar antes la 0076,
promover este con el número libre, sumar su test, la fila del README,
`pnpm db.types`, la candidata D72 y el backup previo.
