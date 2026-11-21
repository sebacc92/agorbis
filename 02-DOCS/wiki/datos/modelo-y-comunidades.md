---
type: article
title: Modelo de datos y comunidades
description: Árbol de comunidades por materialized path, membresía por residencia con is_member, ledger de migraciones y tipos generados.
resource: supabase/migrations/
tags: [rls, postgres, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: datos
status: stable
sources: []
---

# Modelo de datos y comunidades

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

Las comunidades forman un árbol guardado como materialized path:
`communities.path` lleva los slugs separados por puntos
(`earth.south-america.argentina…`), un `CHECK` valida el formato y un índice
`text_pattern_ops` resuelve el `LIKE 'x.%'`. Cada persona tiene una residencia
(`profiles.home_community_id`), y `public.is_member(p_user, p_community)`
(`security definer`) es verdadero para esa comunidad y todos sus ancestros. Las
policies de RLS llaman a `is_member`; seguir (`follows`) es aparte y opcional.

## Dónde vive

- Esquema base: `supabase/migrations/0001_schema.sql` (comunidades, perfiles,
  encuestas, debates, reclamos, proyectos, reportes);
  `0002_functions.sql` (`is_member`); `0018` suma `organization_members`.
- Corrección de residencia en 24 h: `0022_residence_correction_window.sql`.
- App: `src/lib/community.ts`.
- Tipos: `src/lib/database.types.ts` (generado con `pnpm db.types`, nunca a
  mano) y `src/lib/database.types.helpers.ts` (alias de dominio).
- Contrato: `scripts/check-db-contract.mjs` (`pnpm db.contract`, corre en
  lint) y `pnpm db.contract.remote` contra el ledger real.

## Ledger de migraciones

69 migraciones `.sql`: `0001`–`0072` sin `0059`, `0068` ni `0069`. `0059` es
borrador en `supabase/migration-drafts/`; `0068` (rechazada, D73) y `0069`
están en `supabase/sql-drafts/`. El ledger está en el README, sección
"4. Migraciones y seed", con la tabla "Migraciones posteriores a ese ledger" y
la de "Borradores".

## Decisiones

D1 (materialized path), D2 (nivel 5 reservado), D7 (`member_count` por
trigger), D10 (`is_admin()`), D44 (tests de RLS), D48 y D49 (visibilidad de
miembros), D50 (preferencias nunca se leen directo), D53 y D63 (seed), D54 y
D55 (residencia), D62 (tipos generados), D92 (proyecto de Producción nuevo).

## Pruebas

`supabase/tests/*_checks.sql` (17 suites, `pnpm db.test` vía
`scripts/test-db.sh`), `scripts/test-check-db-contract.mjs`,
`src/lib/community-*.spec.ts`, `e2e/community-*.spec.ts`.

## Trampas

- Una RPC nueva sin migración y sin fila en el ledger da 404 de PostgREST en
  Producción; `tsc` no lo ve.
- Nada sale de `migration-drafts/` sin autorización aparte.
- Las migraciones llevan `set search_path = ''` y nombres calificados.

## Related

- [Cuentas y acceso](../cuentas/cuentas-y-acceso.md) — residencia y borrado de
  cuenta.
- [Gate legal](../legal/gate-y-textos-legales.md) — `can_participate()` vive en
  la base.
