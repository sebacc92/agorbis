---
type: verification
title: Verificación — inicio con publicaciones a la vista — 2026-11-08
description: Veredicto con evidencia para la mejora 7 de D112 (D117): gate del repo, checklist del FTD y criterios observables.
tags: [sdd, verification]
timestamp: 2026-11-08T22:30:00Z
topic: sdd
slug: inicio-con-publicaciones-a-la-vista
source_state: b515118 (dirty, 14 archivos sin commitear; el commit sigue a este registro)
---

# Verificación — inicio con publicaciones a la vista — 2026-11-08

Referencia: `02-DOCS/wiki/ftd/inicio-con-publicaciones-a-la-vista.md` (carril FTD,
sin spec SDD). Toolchain: Node 22.22.0 por nvm, pnpm 11.15.0. Gate corrido sin
carga concurrente; el E2E antes, nunca junto a tsc o Vitest.

## Gate del repo

- `pnpm verify` (lint && test && test.release) → PASS, salida 0. ESLint, Prettier,
  scan-secrets, check-keys, check-i18n (3746 mensajes), check-legal, contrato de
  base, `scripts/test-*`, Vitest y políticas D72/Cloudflare/D107.
- `pnpm build.types` → PASS, 0 errores (aparte: `verify` no incluye tsc).
- `pnpm exec vitest run` → PASS: 190 archivos, 1389 pruebas. Contra 1366 antes:
  10 del ayudante `feed-marks` y 13 del spec de componente del inicio; el
  trinquete de D96 pierde la línea de `inicio/index.tsx` porque llegó a cero.
- `pnpm test.e2e e2e/feed-first-screen.spec.ts e2e/personalized-feed.spec.ts e2e/ui-ux-regressions.spec.ts`
  → PASS, 11 de 11, 1,2 min, build del runner con Supabase local y seed.

## Checklist del FTD

- [x] Helper `feed-marks.ts` con spec — evidencia: 10 casos en verde; el primer
      `vitest run` falló con "Cannot find module ./feed-marks" (rojo observado).
- [x] Loader con recibos y apoyos propios degradando a `null` — evidencia: spec
      de componente con encuesta votada, sin votar, cerrada, lectura fallida y
      reclamo apoyado y ajeno (13 casos); spec de `ownIds` con error de
      PostgREST y con promesa rechazada, y contexto del log sin ids.
- [x] Cabecera compacta, primera tarjeta en la primera pantalla a 390×844 —
      evidencia: el E2E mide `boundingBox().y < 760` y `toBeInViewport()` sobre
      la primera tarjeta, sin desborde horizontal.
- [x] Línea de resultado al filtrar — evidencia: spec de componente (tres
      variantes del texto, enlace afuera de la región viva, vacía y oculta sin
      filtros) y E2E (vacía al entrar, "Argentina" al tocar el chip, en
      pantalla, vacía al quitar filtros).
- [x] Revisores D113 — evidencia: tres informes sin CRITICAL ni HIGH; hallazgos
      aplicados listados en D117 y abajo.
- [x] Gate — evidencia: la sección anterior.
- [x] Documentación — evidencia: D117 en `DECISIONS.md`, ítem 7 de la novena
      ronda en `docs/mejoras-priorizadas.md`, catálogo inglés, tarjeta "Inicio
      personalizado" del manual (ES y EN), este registro y el índice.

## Criterios observables (de la auditoría de D112)

- [x] La primera publicación entra en la primera pantalla del teléfono —
      E2E: `y < 760` a 390×844 (la auditoría midió y≈1151).
- [x] Un chip muestra su resultado — E2E: región viva con "Argentina" visible
      tras tocar el chip; spec: las tres frases.
- [x] Lo votado no dice "Participar del voto" — E2E: la encuesta de Argentina
      que Sofía votó en el seed dice "Ya votaste" y "Ver encuesta"; una encuesta
      sembrada sin recibo sigue diciendo "Participar del voto".
- [x] Nada afirma sin lectura (D74) — spec: con recibos y apoyos en `null`,
      todas las abiertas dicen "Ver encuesta" y no hay "Apoyaste".
- [x] D68 intacto — el E2E afirma que la tarjeta votada no muestra
      "N votantes"; el feed sigue entregando cero durante la ronda.

## Capas no ejecutadas

- **NO-APLICA** — migraciones, `db.test`, `db.types`: no cambió nada en la base.
- **SUSTITUIDA** — fallo real de la lectura de recibos o apoyos en navegador:
  sólo simulado en el spec de componente (`marks` en `null`) y en el spec de
  `ownIds`. No detecta un fallo de serialización entre loader y componente en
  ese camino.
- **SUSTITUIDA** — interferencia entre specs E2E: la primera corrida falló en
  los dos sentidos (la vecina tapó el reclamo del seed; mis reclamos
  desplazaron dos de los treinta de la vecina). Se resolvió sembrando los
  reclamos en la provincia. No detecta una tercera spec futura que siembre
  reclamos en `buenos-aires` con fecha 2092 o posterior.
- **HERRAMIENTA-AUSENTE** — lector de pantalla real y otros navegadores: la
  región viva persistente y los `aria-label` se verificaron en el DOM, no con
  un lector.

## Hallazgos descartados

- "`aria-current="page"` en los chips debería ser `"true"`" (code-reviewer) —
  descartado: cada chip es un enlace a una URL distinta (`feedHref`), así que
  "página actual" es literal; además `e2e/personalized-feed.spec.ts:78`
  afirma `"page"` y cambiarlo sería debilitar un assert por estilo.
- "Mostrar un aviso cuando las marcas no se pudieron leer" (silent-failure-
  hunter, opcional) — descartado por ahora: las tarjetas no afirman nada en
  ese estado (spec "sin lectura de recibos no afirma nada"), el apoyo doble lo
  rechaza la base por clave única, y un aviso permanente por una lectura
  accesoria agregaría ruido a la primera pantalla que esta mejora acaba de
  despejar. Si el log de `inicio/recibos` muestra fallos reales, se revisa.
- "`code` del error se redacta en `log.ts`" (typescript-reviewer) — fuera de
  alcance: afecta a todos los `logFailure` y es anterior; anotado para otra
  ronda.
- "`closes_at` activa pero vencida sin cierre por cron mostraría Participar"
  (silent-failure-hunter) — descartado: la RPC convierte `active` con
  `closes_at <= now()` en `closed` (`0070_personalized_feed_filters.sql`), así
  que `pollCall` recibe el estado correcto.

## Veredicto: PASS — sin ítems abiertos. Listo para commit en `main`.
