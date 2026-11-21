---
type: article
title: Moderación, notificaciones y perfil
description: Cola de reportes por antigüedad, apelaciones con registro de auditoría, notificaciones, métricas de activación y perfil público.
resource: src/lib/moderation-queue.ts
tags: [moderacion, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: moderacion
status: stable
sources: []
---

# Moderación, notificaciones y perfil

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

Los reportes van a `reports` (`0001`). La cola de `/moderacion` los agrupa por
contenido y los ordena por antigüedad (D96). Las apelaciones viven en
`moderation_appeals` y las acciones en `moderation_audit_log` (`0039`): la
persona apela en `/perfil/apelacion` y moderación resuelve en
`/moderacion/apelaciones`. Las `notifications` (`0018`) las sincroniza
`/internal/sync-notifications`, con críticas en `0046` y preferencias en
`0064`. `/metricas` lee `activation_events` (alta → residencia → primera
participación → vuelta en la semana). `/social/[type]/[id]` arma imágenes para
compartir con el cliente anónimo. `/u/[id]` es el perfil público (handles en
`0065`).

## Dónde vive

- Rutas: `src/routes/moderacion/` (`apelaciones`, `cuentas`, `eliminaciones`,
  `solicitudes`), `moderacion-y-apelaciones/`, `normas-comunitarias/`,
  `notificaciones/`, `metricas/`, `social/`, `perfil/`, `u/[id]/`.
- Lógica: `src/lib/moderation-queue.ts`, `appeal-actions.ts`,
  `report-intent.ts`, `notifications.ts`, `public-profile.ts`,
  `profile-page.ts`.

## Decisiones

D32, D48, D67, D81, D96, D98. Moderación exige TOTP (`aal2`).

## Pruebas

`src/routes/moderacion/index.spec.tsx`, `src/routes/notificaciones/index.spec.tsx`,
`src/lib/{moderation-queue,appeal-actions,report-intent,notifications,public-profile}.spec.ts`;
`supabase/tests/notification_checks.sql`, `notification_preferences_checks.sql`,
`public_profile_handles_checks.sql`; `e2e/moderation-*`, `notification-*`,
`public-profile-handles`, `profile-editing`.

## Trampas

- D98: después de una acción se vuelve a leer lo que cambió; la UI no afirma
  lo que la base no hizo.
- `/metricas` lee en lotes de 1000 con tope de 30 y avisa en pantalla si lo
  alcanza.
- Las normas comunitarias son texto legal con versión y hash.

## Related

- [Debates, reclamos y proyectos](../participacion/debates-reclamos-proyectos.md)
- [Gate legal](../legal/gate-y-textos-legales.md)
