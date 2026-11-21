---
type: verification
title: Verificación — acuerdos entre comunidades — 2026-11-09
description: Veredicto con evidencia para D118 — gate del repo, done-checks de las tareas T001–T012 y los trece criterios de aceptación de la spec.
tags: [sdd, verification]
timestamp: 2026-11-09T04:40:00Z
topic: sdd
slug: acuerdos-entre-comunidades
source_state: 6a3bff1 (dirty: sólo este registro y el libro de avance); re-verificación sobre el re-baseline D72, árbol con los ocho archivos de release sin commitear
---

# Verificación — acuerdos entre comunidades — 2026-11-09

Spec: `02-DOCS/wiki/sdd/specs/acuerdos-entre-comunidades.md`. Plan y tareas:
`sdd/plans/acuerdos-entre-comunidades.md`. Evidencia por tarea:
`sdd/progress/acuerdos-entre-comunidades.md`. Toolchain: Node 22.22.0 por nvm,
pnpm 11.15.0, Supabase CLI 2.115.0 local. Todos los números salen de corridas
posteriores a la última edición de código (commit `6a3bff1`), sin carga
concurrente: E2E y SQL antes, Vitest y tsc después.

## Gate del repo

- `pnpm lint` → PASS: ESLint, Prettier, scan-secrets, check-keys, check-i18n
  (3841 mensajes, 2417 usos), check-legal (versiones y hashes coinciden),
  contrato de base.
- `pnpm test` → PASS: `scripts/test-*` y Vitest, 194 archivos, 1434 pruebas.
- `pnpm build.types` → PASS, 0 errores (aparte, `verify` no incluye tsc).
- `pnpm db.test` → PASS, salida 0: 17 suites SQL, incluidas
  `agreements_checks.sql` (62 aserciones `ok ·`, con control negativo),
  `account_deletion_checks.sql`, `personalized_feed_checks.sql` y
  `rls_checks.sql`. Base recreada antes con `pnpm db.reset` sobre la 0074
  endurecida.
- `pnpm test.e2e e2e/agreements.spec.ts` → PASS, 4 de 4 en Chromium
  (adherir; proponer hasta `?publicado=1`; última adhesión abre, voto deja
  "Ya votaste", la ronda redirige, el inicio lista; fixture aprobada con
  "Aprobó · 6 participantes" dos veces y sin total combinado).
- `pnpm test.release` → **FAIL** en `scripts/test-run-d72-supabase-readonly.mjs`
  (`RECEIPT_REJECTED`). Causa comprobada: la política
  `scripts/d72-supabase-readonly-policy.mjs` pinea la candidata
  `agorbis-d72-candidate-0062-0073/v1` y el inventario del repo ya tiene
  `0074_agreements.sql`. Apartar `agreements_checks.sql` no cambia el
  resultado (salida 1 igual), así que no es el test SQL nuevo. Esos pins son
  del responsable (CODEOWNERS) y CLAUDE.md prohíbe re-baselinearlos en un
  commit de features: queda como ítem del responsable, junto al `db push`.

## Done-checks de las tareas

- [x] T001 ayudantes puros — `src/lib/agreements.spec.ts`, `db-error.spec.ts`
  en verde dentro de los 194 archivos.
- [x] T002 borrador de 0074 y test SQL — promovidos en T003.
- [x] T003 migración 0074 promovida con autorización del responsable —
  `db.reset` aplica, `db.types` regenerado sin diferencias tras el
  endurecimiento (las firmas públicas no cambiaron).
- [x] T004 página `/acuerdos/[id]` — `agreement-page.spec.tsx` en verde; E2E 1,
  3 y 4.
- [x] T005 acciones adherir, retirar, votar — E2E 1 y 3; rechazos cubiertos
  por SQL (`PROPOSER_CANNOT_ADHERE`, `NOT_A_MEMBER`, `ALREADY_ADHERED`,
  `NOT_PROPOSER`, `NOT_PROPOSED`, `LAPSED`).
- [x] T006 redirección de la ronda — E2E 3: `/encuestas/<ronda>/` termina en
  `/acuerdos/<id>/`.
- [x] T007 formulario de proponer — `propose-form.spec.tsx`; E2E 2.
- [x] T008 sección en Encuestas — `AgreementsSection.spec.tsx` (5, incluida la
  lectura fallida); E2E 2 y 4.
- [x] T009 inicio — `inicio-first-screen.spec.tsx` (15); E2E 3 con
  `?tipo=agreement`.
- [x] T010 manual y D118 — check-i18n y check-legal verdes; D118 cita spec,
  plan y avance.
- [x] T011 E2E completo — 4 de 4.
- [x] T012 revisores D113 — cuatro revisores de sólo lectura (código,
  TypeScript, fallos silenciosos, base de datos); 0 críticos; los altos
  (veto unilateral sobre las rondas, `can_withdraw` nulo, aserción E2E que
  fallaba siempre, lectura fallida mostrada como vacía) corregidos en
  `6a3bff1` con sus pruebas. `pnpm verify` → FAIL sólo por el pin D72 de
  arriba.

## Criterios de aceptación (spec)

- [x] #1 proponer sólo para la propia → SQL "queda propuesto y no hay ninguna
  votación abierta (#1)".
- [x] #2 adhesión abre votación con cierre = apertura + duración; ni dos
  veces ni la proponente → SQL (#2, `ALREADY_ADHERED`,
  `PROPOSER_CANNOT_ADHERE`); E2E 3 ve "En votación hasta el …".
- [x] #3 voto con constancia sin elección, sin repetir, sin conteos → SQL
  (#3, `poll_results` vacío durante la ronda); E2E 3: "Ya votaste", sin
  opciones y sin "N votos/votantes/participantes" en `main`.
- [x] #4 aprobado con resultado y participantes por comunidad, sin total →
  SQL (#4); E2E 4: "Aprobado", dos "Aprobó · 6 participantes", ningún "12
  participantes".
- [x] #5 rechazado y cuál → SQL (#5).
- [x] #6 sin quórum sin conteo de esa comunidad → SQL (#6, "Tandil quedó sin
  quórum y no muestra conteo").
- [x] #7 ventana vencida con una sola adhesión → SQL (#7).
- [x] #8 apertura simultánea con el mismo cierre → SQL (#8); E2E 3.
- [x] #9 elegibilidad avisada antes y rechazada por la base, traducida →
  `agreements.spec.ts` (`eligibilityIssue`, `eligibilityMessage`,
  `proposeErrorMessage`); SQL (`NESTED_COMMUNITIES`, `INELIGIBLE_LEVEL`,
  `MIXED_COUNTRIES`); catálogo inglés verificado por check-i18n.
- [x] #10 duración 7–30 → `propose-form.spec` (opciones 7/14/21/30), zod
  `min(7).max(30)`, SQL `DURATION` por ambos lados.
- [x] #11 30 días sin la última adhesión → SQL (#11, "ya no se adhiere";
  "sin adhesión y sin votación").
- [x] #12 retiro antes de abrir; rechazo después → SQL (#12 y
  `NOT_PROPOSED`); E2E 2 ve "Retirar la propuesta" sólo en estado propuesto.
- [x] #13 visitante lee, no actúa, "Crear cuenta" → E2E 1 (0 botones en
  `main`, enlace visible); SQL "sin sesión se lee todo y no se puede actuar".

## Capas no ejecutadas

- **SUSTITUIDA** — cobertura: Vitest corre sin umbral (`--coverage` no está
  en el gate del repo). Es un reporte, no una puerta; no detecta cobertura
  que baja. Las líneas nuevas tienen spec propio (lista de arriba), pero
  nadie midió el porcentaje.
- **NO-APLICA** — mutation testing: el repo no lo tiene configurado.
- **HERRAMIENTA-AUSENTE** — `supabase db lint` y `pnpm audit` corren en la CI
  (`integracion`, `verificar`), no localmente en este gate; nada corrió en
  su lugar.
- **SUSTITUIDA** — `pnpm test.release`: corrió y falló por el pin D72;
  las políticas anteriores al runner de Supabase (baseline, act, cutover,
  Cloudflare) pasaron, las posteriores no llegaron a correr.

## Hallazgos descartados o diferidos

- "El búsqueda global lista las rondas como encuestas" (revisor de base, M5)
  — diferido: la búsqueda es `private.global_search_ordered` en 0062 (~170
  líneas); una ronda encontrada lleva a `/encuestas/<id>` que redirige al
  acuerdo, así que no muestra nada falso, sólo repite el acuerdo por
  comunidad. Va como mejora en el libro de avance.
- "Acuerdos sin moderación ni estado removed" (M3), "`proposer_id` y
  `adhered_by` legibles por anon" (L2), "mudanza de residencia infla dos
  quórums" (L7), "exportación de datos" (L8) — decisiones de producto y
  privacidad para el responsable; anotadas en el libro de avance. L8
  verificado parcialmente: `account_deletion_checks.sql` pasa y las FK son
  `on delete set null`, así que la baja no falla; qué se exporta sigue
  abierto.
- "Alerta vieja de una acción queda en pantalla" (M5 del revisor TS, F10 del
  cazador) — descartado por ahora: el loader se revalida y las tarjetas son
  casi excluyentes; el fallo sin mensaje ya no deja un `Alert` vacío.
- "Deshabilitar enviar cuando hay problema de elegibilidad" — descartado:
  la base decide (invariante 1) y el envío sin JavaScript seguiría
  funcionando; el aviso previo ya está.

## Veredicto: FAIL — 1 ítem abierto, del responsable

Todos los criterios de la spec tienen prueba observable y todas las tareas
cumplen su done-check. El gate completo (`pnpm verify`) falla sólo porque la
política D72 del auditor de Supabase pinea la candidata de migraciones
0062–0073 y el repo ya tiene 0074. Lo destraba el responsable al preparar el
`db push`: re-baselinear la candidata a 0062–0074 en un commit de release,
nunca en uno de features. Hasta entonces la función no es "lista para
Producción"; sí está lista para revisión humana y para el push a `main`.

## Re-verificación · 2026-11-09, tras el re-baseline D72 a 0062–0074

El responsable hizo el push, aplicó 0074 en Producción y autorizó el
re-baseline. Con la candidata en `agorbis-d72-candidate-0062-0074/v1`, el hash
de `agreements_checks.sql` fijado y `post-0074` en el backup (patrón de
`582fac0`), corrió de nuevo el gate completo:

- `pnpm verify` (lint && test && test.release) → **PASS, salida 0**. Vitest 194
  archivos / 1434 pruebas; check-i18n 3841; check-legal intacto; todas las
  políticas de release, incluido `test-run-d72-supabase-readonly`.
- Los cuatro tests que el re-baseline toca, por separado: `test-preflight`,
  `test-backup-tools`, `test-d72-supabase-readonly-policy` y
  `test-run-d72-supabase-readonly`, salida 0.

## Veredicto final: PASS

El ítem abierto del veredicto anterior quedó cerrado por el responsable y el
re-baseline autorizado. Nada más queda sin evidencia. Lo que sigue son
decisiones de producto, no verificación: moderación de acuerdos, visibilidad
anónima de `proposer_id` y `adhered_by`, mudanza de residencia entre partes y
exportación de datos.

