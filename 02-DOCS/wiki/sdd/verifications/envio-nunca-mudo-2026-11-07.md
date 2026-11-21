---
type: verification
title: Verificación — envío nunca mudo — 2026-11-07
description: Veredicto con evidencia para la mejora 10 de D112 (D114): gate del repo, checklist del FTD y criterios observables.
tags: [sdd, verification]
timestamp: 2026-11-07T19:40:00Z
topic: sdd
slug: envio-nunca-mudo
source_state: a7ccc29 (dirty, 19 archivos sin commitear; el commit sigue a este registro)
---

# Verificación — envío nunca mudo — 2026-11-07

Referencia: `02-DOCS/wiki/ftd/envio-nunca-mudo.md` (carril FTD, sin spec SDD).
Toolchain: Node 22.22.0 por nvm, pnpm 11.15.0. Sin carga concurrente.

## Gate del repo

- `pnpm verify` (lint && test && test.release) → PASS, salida 0. Incluye ESLint,
  Prettier, scan-secrets, check-keys, check-i18n (3746 mensajes), check-legal,
  contrato de base, scripts/test-\*, Vitest y las políticas D72/Cloudflare/D107.
- `pnpm build.types` → PASS, salida 0 (corrida aparte: `verify` no incluye tsc).
- `pnpm test` → PASS: 184 archivos, 1332 pruebas, 32,7 s. Contra 1321 antes del
  cambio: 21 pruebas nuevas en `src/lib/action-guard.spec.ts` menos las 10 de la
  primera versión que se reescribieron.
- `pnpm test.e2e e2e/publication-undelivered.spec.ts` → PASS, 2 de 2, 1,2 min,
  séptima corrida. Las seis anteriores están narradas en el FTD: tres fallos
  del test, uno del criterio del guardián, uno del lugar del aviso y uno por
  carga concurrente mía.

## Checklist del FTD

- [x] Spec en rojo antes de implementar — evidencia: "Failed to load url
      ./action-guard".
- [x] Formato sintético por `_deserialize` — evidencia: spec
      `undeliveredResultWire`.
- [x] Envoltorio de `fetch` — evidencia: 11 pruebas del bloque "fetch".
- [x] Bloqueo del doble envío y sus tres liberaciones — evidencia: 6 pruebas
      del bloque "submit".
- [x] Canario `data-action-guard` y texto sin `</script>` ni ES posterior a 5 —
      evidencia: 3 pruebas del bloque "instalación".
- [x] Título "No sabemos si se publicó" — evidencia: E2E, `alert` visible y con
      foco.
- [x] Botón bloqueado tras publicar, aviso con enlace, guardia propia del
      asistente de proyectos — evidencia: E2E (`status` visible, enlace visible,
      "Revisar antes de publicar" deshabilitado); el asistente sólo por lectura
      del diff (ver abajo).
- [x] E2E red cortada y triple toque — evidencia: 2 de 2.
- [x] lint, tipos, test — evidencia: arriba.
- [x] Revisiones D113 — evidencia: tres informes, hallazgos aplicados o
      descartados con motivo en el FTD.
- [x] D114, nota en D75, `docs/mejoras-priorizadas.md`, `/manual` con traducción
      — evidencia: `check-i18n` y `prettier --check` en verde sobre esos
      archivos.

## Criterios observables (del alcance del FTD)

- [x] Con la red cortada el aviso aparece, el botón vuelve y el velo se va —
      E2E 1: `alert` "No sabemos si se publicó" con foco; "Revisar antes de
      publicar" habilitado y sin `aria-busy`; "Cargando página…" ausente; título
      conservado; cero filas creadas.
- [x] Un doble toque manda un solo POST y crea un solo reclamo — E2E 2: tres
      toques, `posts.length === 1` antes y después de navegar; una fila con ese
      título.
- [x] Señal entre la confirmación y la ficha — E2E 2: `status` "Publicado.
      Abriendo la publicación…" con enlace "Abrir la publicación".
- [x] El guardián corrió en una página real — E2E: `html[data-action-guard="on"]`.
- [x] Ningún texto afirma que no se guardó — spec (regex sobre los dos mensajes)
      y E2E (`not.toContainText`).

## Capas no ejecutadas

- **SUSTITUIDA** — asistente de proyectos (`submitProject`): la guardia
  `isRunning` y la liberación de la marca en los retornos tempranos se
  verificaron por lectura del diff y por tipos, no con E2E. No detecta un error
  de comportamiento en ese flujo; `presupuesto/nueva` y proyectos no tienen E2E
  propio de envío (ya anotado en D112).
- **SUSTITUIDA** — cobertura: Vitest corre sin umbral (no hay `--coverage` en el
  gate); un informe, no una compuerta. No detecta cobertura en baja. Las líneas
  nuevas de `action-guard.ts` están cubiertas por su spec; `PublishedNotice` y
  `useDraft` sólo por E2E.
- **HERRAMIENTA-AUSENTE** — lector de pantalla real y navegadores distintos de
  Chromium: no se probaron. El aviso `role="status"` se dibuja vacío y se llena
  para que lo anuncien, pero eso no se escuchó.
- **NO-APLICA** — migraciones y `supabase/tests`: el cambio no toca SQL.
- **NO-APLICA** — suite E2E completa: el responsable la corre antes de un
  release; acá sólo el spec nuevo. La suite completa no se corrió.

## Hallazgos descartados

- "Un `fetch` que cuelga sin rechazar sigue mudo" — descartado como alcance:
  D114 excluye un tiempo límite a propósito; queda escrito en "Qué no cambia".
- "Una navegación completa durante el envío puede duplicar" — descartado como
  alcance: la solución es una clave de idempotencia en la RPC, migración del
  responsable, anotada en D114 como propuesta.
- "`/buscar` y el asistente quedarían trabados" (tres revisiones) — no ocurría
  con la primera versión porque el criterio no marcaba nada; con el criterio
  real (`method="post"` + `qaction=`) `/buscar` queda fuera por ser GET (spec
  "sólo toca formularios POST con una acción del router") y el asistente suelta
  la marca él mismo (diff `proyectos/nuevo/index.tsx`, `releasePending`).

## Veredicto: PASS — sin ítems abiertos. Listo para commit; las capas sustituidas quedan declaradas.
