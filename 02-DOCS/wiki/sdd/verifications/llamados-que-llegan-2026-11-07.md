---
type: verification
title: Verificación — llamados que llegan — 2026-11-07
description: Veredicto con evidencia para la mejora 5 de D112 (D115): gate del repo, checklist del FTD y criterios observables.
tags: [sdd, verification]
timestamp: 2026-11-07T21:40:00Z
topic: sdd
slug: llamados-que-llegan
source_state: bf5df03 (dirty, 17 archivos sin commitear; el commit sigue a este registro)
---

# Verificación — llamados que llegan — 2026-11-07

Referencia: `02-DOCS/wiki/ftd/llamados-que-llegan.md` (carril FTD, sin spec SDD).
Toolchain: Node 22.22.0 por nvm, pnpm 11.15.0. Gate corrido sin carga concurrente.

## Gate del repo

- `pnpm verify` (lint && test && test.release) → PASS, salida 0. ESLint, Prettier,
  scan-secrets, check-keys, check-i18n (3747 mensajes), check-legal, contrato de
  base, `scripts/test-*`, Vitest y políticas D72/Cloudflare/D107.
- `pnpm build.types` → PASS, 0 errores (aparte: `verify` no incluye tsc).
- `pnpm test` → PASS: 186 archivos, 1347 pruebas. Contra 1332 antes: 5 del
  ayudante, 9 de la lógica de recuperación y 1 caso de visitante en
  `community-navigation-honesty`.
- `pnpm test.e2e e2e/publication-entry-recovery.spec.ts e2e/ui-ux-regressions.spec.ts`
  → PASS, 12 de 12, 1,3 min, build hecho por el runner con las variables
  `PUBLIC_*` incrustadas.

## Checklist del FTD

- [x] E2E en rojo que reproduce — evidencia: dos reproducciones con el build de
      `bf5df03` (diálogo "Publicar" de visitante en `/c/earth`; cuenta nueva con
      3G lento) y una determinista por SPA real (reapuntar un `Link`), narradas
      en el FTD.
- [x] `publicationEntryHref` con spec — evidencia: 5 de 5.
- [x] Llamados y diálogo usan el ayudante; `ui-ux-regressions` actualizado —
      evidencia: E2E 12 de 12 (incluye "Publicar ofrece los cuatro tipos").
- [x] Límite de errores que se recupera, spec puro y E2E — evidencia: 9 de 9;
      E2E test 2 con exactamente una carga de documento tras la navegación SPA.
- [x] lint, tipos, test, E2E — evidencia: arriba.
- [x] Revisiones D113 — evidencia: tres informes; aplicado y descartado con motivo
      en el FTD.
- [x] D115, nota en D75, estado en `docs/mejoras-priorizadas.md` — evidencia:
      Prettier y `check-i18n` en verde.

## Criterios observables (del alcance del FTD)

- [x] Una visitante que toca "Crear la primera encuesta" llega a ingresar sin
      pantalla rota — E2E 1: `href` a `/ingresar?next=…`, URL final, campo de
      correo visible, sin "Se rompió algo".
- [x] Una navegación interna a una ruta que redirige se recupera — E2E 2:
      termina en `/ingresar?next=…`, sin "Se rompió algo", sin "Cargando
      página…", sin "Un momento…", **una** carga de documento.
- [x] Cuenta nueva sin residencia llega a elegir residencia — E2E 3: URL
      `/onboarding?next=…`, encabezado visible, sin aviso roto ni velo.
- [x] El diálogo "Publicar" de la barra inferior orienta a ingresar a una
      visitante — `ui-ux-regressions`, 4 `href` a `/ingresar?next=…`.

## Capas no ejecutadas

- **SUSTITUIDA** — E2E 3 no afirma que la carrera ocurrió (no cuenta cargas de
  documento): pasa también si el beta no rompe en ese camino. El E2E 2 sí lo
  afirma, en el mismo mecanismo. No detecta que la recuperación falle sólo en
  el camino de `/onboarding`.
- **SUSTITUIDA** — el componente `RecoveringErrorBoundary` no tiene spec
  propio; lo cubren la lógica pura (9 pruebas) y el E2E 2. No detecta un error
  de cableado que el E2E no recorra (por ejemplo el oyente `qerror`, que se
  verificó por lectura contra el `ErrorBoundary` del router).
- **SUSTITUIDA** — cobertura: Vitest sin umbral; un informe, no una compuerta.
- **HERRAMIENTA-AUSENTE** — lector de pantalla real y navegadores distintos de
  Chromium: no se probaron. "Un momento…" es `role="status"` y aparece ya con
  texto; puede no anunciarse.
- **NO-APLICA** — migraciones y `supabase/tests`: el cambio no toca SQL.
- **NO-APLICA** — suite E2E completa: la corre el responsable antes de un
  release. No se corrió.

## Hallazgos descartados

- "Otros enlaces a formularios siguen redirigiendo para una visitante" —
  descartado como alcance: D115 lo anota; los cubre la capa B (E2E 2 prueba el
  mecanismo con un `Link` cualquiera).
- "Hace falta un endpoint de telemetría para no perder el error" — descartado
  como alcance: queda `console.warn` con el tipo del error; un endpoint propio
  es otra decisión (hosts, D76 no aplica por ser mismo origen, pero sí
  `/subencargados` si se persiste).
- "Tope duro con contador en `history.state`" — descartado: el único camino a
  un segundo intento en la misma entrada es una navegación con `replaceState`
  que vuelva a fallar sola; hoy no existe. Anotado en el FTD.
- "El cupo agotado sigue redirigiendo en el servidor" — aceptado: el cliente no
  lo conoce; lo cubre la capa B (mismo mecanismo que E2E 2).

## Veredicto: PASS — sin ítems abiertos. Listo para commit; las capas sustituidas quedan declaradas.
