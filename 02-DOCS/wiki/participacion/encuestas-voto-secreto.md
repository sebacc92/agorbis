---
type: article
title: Encuestas y voto secreto
description: Constancia sin elección y tallies agregados (D68); resultados al cierre y con 5 participantes o más.
resource: supabase/migrations/0047_private_poll_ballots.sql
tags: [votacion, invariante, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: participacion
status: stable
sources: []
---

# Encuestas y voto secreto

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

Se vota con la RPC `cast_poll_ballot`. Desde `0047` no hay boletas por
persona: queda una constancia `(poll_id, user_id)` que registra que alguien
participó, sin su elección, y tallies privados por opción. Cada emisión
actualiza todas las filas de tally (+valor en la elegida, +0 en el resto) para
que `xmin` no delate la opción. Los resultados son siempre al cierre, toda
encuesta tiene fecha de cierre y los conteos exactos aparecen con 5
participantes o más. El presupuesto participativo usa el mismo modelo
(`cast_budget_ballot`).

## Dónde vive

- `src/routes/encuestas/[id]/` (incluye `resultados.csv/`),
  `src/routes/c/[slug]/encuestas/` y `nueva/`.
- `src/lib/poll-deadline.ts`.
- Migraciones `0047` (`public.poll_participation_receipts`,
  `private.poll_option_tallies` y sus equivalentes de presupuesto), `0010`,
  `0025`, `0030`.
- README: "Encuestas y cobertura geográfica".

## Decisiones

D68 (reemplaza para Producción lo que dependía de `poll_votes` en D3–D5, D42,
D47–D52 y D59–D61), D3, D35, D47, D61.

## Pruebas

`src/routes/encuestas/[id]/index.spec.tsx`, `src/lib/poll-deadline.spec.ts`,
`e2e/poll-close-followup.spec.ts`, `e2e/poll-options-timezone.spec.ts`,
`supabase/tests/rls_checks.sql`.

## Trampas

- Nada guarda qué votó alguien, nada muestra conteos durante la ronda y nada
  promete anonimato criptográfico frente a quien opera la base.
- Opciones, tipo y propuestas se congelan con la primera emisión.
- Una encuesta cerrada no se reabre: comparar dos agregados aislaría el voto
  nuevo.
- Los payloads de las RPC de emisión nunca van a los logs.

## Related

- [Debates, reclamos y proyectos](./debates-reclamos-proyectos.md) —
  presupuesto participativo.
- [Idiomas y manual](../i18n/idiomas-y-manual.md)
