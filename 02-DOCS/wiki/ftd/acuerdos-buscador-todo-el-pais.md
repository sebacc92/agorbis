---
author: Sebastián Cardoso Castillo
branch: acuerdos-buscador
status: done
type: fix
title: Acuerdos · el buscador de comunidades busca en todo el país
description: Al proponer un acuerdo, el buscador filtraba sólo las primeras 500 comunidades del país; con el nivel 4 de Argentina (0076) Tandil quedaba en el puesto 1.920 y el E2E de acuerdos fallaba en la CI. Ahora, desde dos letras, busca en el servidor.
tags: [ftd, acuerdos, busqueda, e2e]
timestamp: 2026-11-21T06:00:00-03:00
topic: ftd
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Acuerdos: el buscador de comunidades busca en todo el país

## Intent

La CI de `main` fallaba desde `c8bf224` en un solo E2E:
`e2e/agreements.spec.ts:185` ("una residente propone un acuerdo…") esperaba
la casilla de Tandil 120 s y no aparecía. El responsable pidió investigar y
arreglar (21-11-2026).

## Causa, probada

- El loader de `/c/<slug>/acuerdos/nuevo` trae como máximo 500 comunidades
  del país (niveles 3 a 5, ordenadas por nivel y nombre) y el buscador filtra
  sólo sobre esas.
- Con la 0076 (D127) Argentina pasó a 2.145 comunidades en esos niveles. En
  la base local, Tandil queda en el puesto 1.920: no llegaba al navegador.
- No era un test viejo sino un bug para la gente: cualquier comunidad después
  del puesto 500 no se podía sumar a un acuerdo.

## Scope

- `src/lib/agreements.ts`: `isCandidateFor` (la regla que usan el loader y la
  búsqueda) y `mergeCandidates`, con spec.
- `src/routes/c/[slug]/acuerdos/nuevo/index.tsx`: un `server$`
  (`searchAgreementCandidates`) que, desde dos letras, busca por nombre en
  todo el país con la sesión de la persona; el formulario suma lo que trae sin
  perder las elegidas, muestra "Buscando…" y avisa si la búsqueda falla.
- Textos con traducción: sale "hoy no se puede elegir desde acá" y entran
  "escribí al menos 2 letras para buscar entre todas" y el de falla.

Fuera: el manual no cambia. La base sigue decidiendo la elegibilidad al
enviar (`propose_agreement`).

## Checklist

- [x] Causa reproducida antes de tocar nada. Prueba: posición de Tandil en la
      base local y el E2E en rojo sobre `main`.
- [x] Reglas puras con spec, en rojo y después en verde. Prueba:
      `src/lib/agreements.spec.ts` 25 de 25.
- [x] El E2E pasa con el arreglo. Prueba: `e2e/agreements.spec.ts` 4 de 4.
- [x] Lint, tipos y la suite completa en verde (1.719 tests).

## Evidence

Todo del 21-11-2026, contra la Supabase local con 0076 aplicada.

- **Rojo sobre `main` sin el arreglo** (worktree aparte, build de producción):
  `locator.check: Test timeout … waiting for getByRole('checkbox', { name:
  /Tandil/ })`, igual que en la CI de `c621121`.
- **Verde con el arreglo:** los 4 E2E de `e2e/agreements.spec.ts` pasan.
- La búsqueda valida el término (2 a 100 caracteres) y el slug, escapa el
  `LIKE` y usa `createServerSupabase` con la sesión: no saltea RLS. Saca el
  país de la base, no del navegador.

## Next
Fusionado en main el 2026-11-20 (658dd37).
