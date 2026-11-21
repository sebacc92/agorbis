---
author: Sebastián Cardoso Castillo
branch: nivel4-brasil
status: done
type: feature
title: Nivel 4 de Brasil · sus 5.569 municipios, sin coordenadas
description: Borrador SQL que carga los 5.569 municipios de Brasil bajo sus 26 estados, desde la API de localidades del IBGE (D137).
tags: [ftd, geografia, comunidades, migracion]
timestamp: 2026-11-20T23:30:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Nivel 4 de Brasil: 5.569 municipios, sin coordenadas

## Intent

Noveno país fuera de Argentina, pedido por el responsable el 20-11-2026
("continua con otro"). Cada municipio tiene su prefeitura. En Producción sus
26 estados y el Distrito Federal (nivel 3) no tenían hijos. Se trabajó en el
worktree `.worktrees/nivel4-brasil` porque otra sesión seguía abierta en
`main`.

## Scope

Dentro:

- `scripts/brasil-level4-lib.mjs` (lógica pura) y su spec
  `src/lib/brasil-level4.spec.ts`.
- `scripts/build-brasil-level4-draft.mjs` (descarga, controles y escritura;
  exige 5.571 entradas en la API).
- `supabase/sql-drafts/0085_brasil_local_governments.sql`, generado. Número
  provisional.
- D137, la fila del README de borradores y la del índice.

Fuera: promover el borrador y corregir los slugs y nombres de los estados en
0016.

## Checklist

- [x] Spec de la lógica en rojo y después en verde. Prueba: `vitest run`.
- [x] Borrador generado. Prueba: 5.569 filas y los 26 estados con municipios.
- [x] Ningún slug nuevo existe en Producción. Prueba: consulta de sólo lectura.
- [x] El borrador corre en la base local y se deshace, junto a los otros
      ocho. Prueba: transacción con `rollback`.
- [x] D137 escrita. Prueba: Prettier pasa.

## Evidence

Todo del 20-11-2026.

- **Fuente.** API de localidades del IBGE
  (`servicodados.ibge.gov.br/api/v1/localidades/municipios`), datos públicos
  del Estado brasileño, con nombres oficiales en portugués: 5.571 entradas.
- **Afuera, dos entradas sin prefeitura:** Brasília, que es el Distrito
  Federal (ya nivel 3, como Bogotá en D135), y Fernando de Noronha, distrito
  estadual que gobierna un administrador de Pernambuco (como el territorio
  sin municipio de Uruguay, D129). Lo encontró el conteo: la primera corrida
  dio 5.570 en vez de 5.569. La API ya incluye Boa Esperança do Norte (Mato
  Grosso), el municipio más nuevo.
- **Slugs con la sigla del estado** (`brasil-rj-niteroi`), no con el slug del
  estado. En Producción dos estados tienen el slug mal escrito
  (`brasil-rio-de-jeneiro`, `brasil-rio-granda-do-norte`) y los nombres sin
  tildes ("Sao Paulo", "Ceara"); con el slug del padre, más de 250 URLs
  nuevas heredarían el error. El `path` sí lo hereda, porque sale del padre:
  sólo se arregla corrigiendo 0016.
- **Homónimos:** 232 nombres se repiten entre estados y ninguno dentro de
  uno; la sigla los distingue.
- **Sin coordenadas:** la API no las trae. El GPS sugiere el estado.
- **Spec.** Brasil 9 de 9.
- **Base local** (puerto 54822): con `rollback`, los nueve borradores juntos
  dan Uruguay 136, Chile 345, Paraguay 262, Bolivia 339, Ecuador 221, Perú
  244, Colombia 1.102, Venezuela 335 y Brasil 5.569, y todo vuelve a 0. Con un
  slug ocupado (`brasil-pe-recife`) aborta con `AGORBIS_0085_SLUG_TAKEN`.
- **Producción, sólo lectura.** Los únicos slugs `brasil-…` son los 27 de
  nivel 3.

## Pendiente

El borrador no está aplicado en ninguna base. El responsable lo revisa y, si
lo aprueba, lo promueve después de los anteriores. Antes conviene decidir si
se corrigen los slugs y nombres de los estados en 0016, porque el `path` de
estos 5.569 municipios los hereda.

## Next
Fusionado en main el 2026-11-20 (9c3508d).
