---
type: article
title: Debates, reclamos y proyectos
description: Publicación con cuota por nivel, reclamos con ubicación aproximada y escalamiento por silencio, proyectos, presupuesto e instituciones.
resource: src/routes/publicar/index.tsx
tags: [participacion, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: participacion
status: stable
sources: []
---

# Debates, reclamos y proyectos

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

Se publica desde `/c/[slug]/<tipo>/nuevo` o desde `/publicar`, que toma el
contexto. Una cuota mensual por nivel geográfico la aplica un trigger (D30,
D31). Las coordenadas de un reclamo se redondean a 3 decimales, una cuadrícula
de unos 110 m (`0040`, `src/lib/geolocation-privacy.ts`). Las fotos de
reclamos van al bucket privado `claims` (`0041`); `avatars` es aparte.

Escalamiento por silencio: el cron `/internal/escalate-claims` revisa la
ventana de respuesta (`claim_response_windows`). Si vence sin evento
institucional y el apoyo supera un umbral según la población, el reclamo
también se muestra en la comunidad madre (`escalated_to_community_id`) sin
moverse (D58). Las instituciones son `organizations` (`0018`), y cualquier
`claim_events` con `organization_id` frena el reloj (`0072`).

## Dónde vive

- Rutas: `src/routes/debates/[id]/`, `src/routes/reclamos/[id]/` (con
  `afiche`, `nota-formal`, `planilla`, `dossier`), `src/routes/proyectos/[id]/`,
  `src/routes/c/[slug]/presupuesto/`, `src/routes/publicar/`,
  `src/routes/instituciones/`, `src/routes/internal/escalate-claims/`.
- Lógica: `src/lib/debate-actions.ts`, `debate-comments.ts`,
  `claim-actions.ts`, `claim-escalation.ts`, `claim-media.ts`, `uploads.ts`,
  `budget.ts`, `budget-actions.ts`, `project-actions.ts`,
  `publication-eligibility.ts`, `institutional-history.ts`.
- Migraciones: `0018`, `0026`, `0028`/`0032`, `0035`, `0038`/`0040`, `0041`,
  `0052`/`0053`, `0072`.
- README: "Cuotas de publicación" y "Rendición de cuentas y decisión
  colectiva"; `docs/EDITORIAL_CONTENT.md`.

## Decisiones

D11, D12, D13, D14, D25, D30, D31, D32, D58, D59, D66, D79, D86.

## Pruebas

`src/lib/geolocation-privacy.spec.ts`, `claim-media.spec.ts`,
`claim-clock-observer.spec.ts`, `debate-comments.spec.ts`,
`budget-page.spec.ts`, `publication-eligibility.spec.ts`;
`supabase/tests/claim_response_clock_checks.sql`, `claim_storage_checks.sql`,
`geolocation_privacy_checks.sql`, `project_privacy_checks.sql`; los
`e2e/` de debates, reclamos, proyectos, presupuesto, publicación e
instituciones. `claim-escalation.ts` no tiene spec propia.

## Trampas

- No hay botón de "elevar", a propósito: invitaría a brigadas.
- El reloj mide el acuse institucional, no la calidad de la respuesta.
- El redondeo en JS copia `round(numeric, 3)` de PostgreSQL, que desempata
  alejándose de cero; un enlace saliente no lleva más precisión.
- Cuando modera alguien se devuelve el cupo; cuando borra quien publicó, no
  (D32).

## Related

- [Encuestas y voto secreto](./encuestas-voto-secreto.md)
- [Moderación](../moderacion/moderacion-notificaciones-perfil.md)
- [Modelo de datos](../datos/modelo-y-comunidades.md)
