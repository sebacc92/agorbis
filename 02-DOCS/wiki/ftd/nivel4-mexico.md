---
author: Sebastián Cardoso Castillo
branch: nivel4-mexico
status: done
type: feature
title: Nivel 4 de México · 2.462 municipios y las 16 alcaldías, sin coordenadas
description: Borrador SQL que carga los municipios de México y las alcaldías de la Ciudad de México bajo sus 32 entidades, desde el catálogo geoestadístico del INEGI (D138).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-21T00:30:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de México: municipios y alcaldías

## Intent

Primer país fuera de Sudamérica, pedido por el responsable el 20-11-2026
("sigue con mas paises"), que eligió saltear Guyana y Surinam por falta de
una fuente oficial limpia. Cada municipio tiene su ayuntamiento y cada
alcaldía de la Ciudad de México se elige por voto. En Producción las 32
entidades (nivel 3) no tenían hijos. Se trabajó en el worktree
`.worktrees/nivel4-mexico` porque otra sesión seguía abierta en `main`.

## Scope

Dentro:

- `scripts/mexico-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/mexico-level4.spec.ts`.
- `scripts/build-mexico-level4-draft.mjs` (descarga por entidad, controles y
  escritura; exige 2.478 unidades).
- `supabase/sql-drafts/0086_mexico_local_governments.sql`, generado. Número
  provisional.
- D138, la fila del README de borradores y la del índice.

Fuera: promover el borrador y el nombre en inglés de la capital en 0016
("Mexico City").

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 2.478 filas, ninguna entidad vacía.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace. Prueba: transacción
      con `rollback`.
- [x] D138 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** Catálogo Único de Claves Geoestadísticas del INEGI
  (`gaia.inegi.org.mx/wscatgeo`, servicios `mgee` y `v2/mgem/<entidad>`),
  con los Términos de Libre Uso de la Información del INEGI: 2.478 unidades,
  que son 2.462 municipios y las 16 alcaldías de la Ciudad de México.
- **Alcaldías** de la Ciudad de México como nivel 4, porque se eligen por
  voto, como las comunas de CABA en D127.
- **Homónimos dentro de Oaxaca:** dos San Juan Mixtepec (claves 20208 y
  20209) y dos San Pedro Mixtepec (20318 y 20319). El catálogo no trae el
  distrito que los distingue, así que llevan su clave INEGI en el nombre y el
  slug. Mejora pendiente: reemplazar la clave por el distrito.
- **Homónimos entre entidades** (90 nombres): el slug lleva la entidad.
- **Sin coordenadas:** el servicio no las trae. El GPS sugiere la entidad.
- **Spec.** México 7 de 7.
- **Base local** (puerto 54822): con `rollback`, México pasa de 0 a 2.478
  comunidades de nivel 4 y vuelve a 0. Con un slug ocupado
  (`mexico-jalisco-guadalajara`) aborta con `AGORBIS_0086_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `mexico-…` son las 32
  entidades.

## Pendiente

El borrador no está aplicado en ninguna base. El responsable lo revisa y, si
lo aprueba, lo promueve después de los anteriores.

## Next
Fusionado en main el 2026-11-20 (93e6af5).
