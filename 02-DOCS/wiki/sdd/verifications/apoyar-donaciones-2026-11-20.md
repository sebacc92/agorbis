---
type: verification
title: Verificación — apoyar-donaciones — 2026-11-20
description: Veredicto con evidencia de la página /apoyar y la donación por enlace externo (D128), contra el checklist FTD.
tags: [sdd, verification, ftd, apoyo]
timestamp: 2026-11-20T07:30:00Z
topic: sdd
slug: apoyar-donaciones
source_state: 9c05f23 (clean; es el commit de la función, ya sobre cd91279)
---

# Verificación — apoyar-donaciones — 2026-11-20

Sin spec SDD: los criterios son el checklist de
`02-DOCS/wiki/ftd/apoyar-donaciones.md`. Todas las cifras salen de una corrida
hecha después del último cambio, sobre `9c05f23`.

## Puerta del proyecto

- `lint` → PASS (exit 0; incluye `check-i18n`, `check-legal`, `scan-secrets`
  y el contrato de base).
- `build.types` (`tsc --noEmit`) → PASS (exit 0).
- `test` → PASS (211 archivos, 1.589 tests).
- `test.release` → **FAIL**, por una causa ajena a esta función:
  `scripts/test-run-d72-supabase-readonly.mjs` termina en `RECEIPT_REJECTED`.
  `scripts/d72-supabase-readonly-policy.mjs` tiene fijados los hashes de
  `supabase/tests/rls_checks.sql` (`9dcd16a3…`) y
  `geography_baseline_checks.sql` (`2c0bfb39…`), que son los de `70582ba`. El
  commit `cd91279` cambió esos dos archivos (hoy `c6d3a3a9…` y `cbaeb86e…`) sin
  re-baselinear. `git diff --name-only cd91279..9c05f23 -- supabase scripts
package.json` no devuelve nada: esta función no tocó esos caminos.

## Checklist de la función

- [x] `donationLink` sólo acepta `https://cafecito.app/<usuario>` — evidencia:
      `support.spec.ts`, 23 tests (normalización, rechazos, parámetros y
      fragmento).
- [x] El botón aparece sólo con enlace válido y sale sin referrer — evidencia:
      `SupportContent.spec.tsx`, 4 tests.
- [x] El pie muestra "Apoyar" sólo con enlace válido — evidencia:
      `supportFooterLinks` en `support.spec.ts`; en la app local, `/manual/`
      no trae ningún `href="/apoyar"` con la URL vacía.
- [x] Textos traducidos — evidencia: `check-i18n` dentro de `lint`.
- [x] `/manual`, D128 y README — evidencia: `/manual/` local contiene "Cómo se
      sostiene Agorbis"; D128 está en `DECISIONS.md` después de D127.
- [x] `/apoyar` en un navegador — evidencia: `pnpm dev` en el puerto 5199
      contra Supabase local, respuesta 200 y captura con las tres tarjetas y
      "Todavía no recibimos aportes"; ningún `cafecito.app` en el HTML.

## Capas no ejecutadas

- **SUSTITUIDA** — el estado encendido en la app real: `DONATION_URL` sigue
  vacía, así que el botón "Donar en Cafecito" sólo se vio en el spec del
  componente. El spec no detecta un problema de estilos ni de la CSP al hacer
  clic. Hay que mirarlo el día que se cargue la URL.
- **NO-APLICA** — `db.test` y e2e: la función no toca la base ni un recorrido
  existente.
- **HERRAMIENTA-AUSENTE** — `test.release` en el worktree: `pnpm` rechaza el
  `node_modules` enlazado. Se corrió en la carpeta principal, ya con la
  función en `main`.

## Hallazgos descartados

- Revisión independiente (`ecc:code-reviewer`): ningún hallazgo HIGH ni
  CRITICAL. Los dos LOW pedían casos de normalización y rechazo; se agregaron
  (de 16 a 23 tests).

## Veredicto: PASS para la función. La puerta de release queda en rojo por `cd91279`

La función cumple su checklist con evidencia. `test.release` no bloquea un
cambio de producto pero sí un release: antes de `pnpm deploy:open` el
responsable tiene que re-baselinear los hashes de los dos tests SQL en la
política de D72 (archivo de CODEOWNERS, no lo toca un agente).
