---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Tercera ronda de diseño (noviembre 2026)
description: D125, diez mejoras tras ver por primera vez el diseño nuevo en local: portada, comunidad de cerca, categorías con íconos, tipografía fluida y barrido de glifos.
tags: [ftd, ui-ux, diseño]
timestamp: 2026-11-10T08:00:00Z
topic: ftd
---

# Tercera ronda de diseño

## Intent

El 10-11-2026 el responsable pidió diez mejoras más. Esta vez el diagnóstico
fue sobre el diseño nuevo corriendo en local (`pnpm dev` con Supabase local),
con capturas de Playwright a 1280 y 390 px, en claro y oscuro: portada de
visitantes, `/c/mar-del-plata/`, su listado de encuestas y el detalle de una
encuesta. El modo oscuro y la banda por nivel funcionan; lo que faltaba está
en D125.

## Scope

Dentro: los diez puntos de D125. Fuera: permisos, legales, CSP, lógica de
formularios y de voto; los emojis de comunidad, perfil y mensajes de
WhatsApp, que son identidad o contenido.

## Checklist

- [x] Tipografía fluida: `--text-display-xl|lg|md` con `clamp()`. Prueba:
      `tsc` 0 y specs de CSS en verde.
- [x] Íconos para categorías (`cone, wrench, shield, heart, leaf, bus, ball,
      tag, home-group` nuevos) y `icon` en `CLAIM_CATEGORIES`/`POLL_CATEGORIES`.
- [x] Portada de visitantes con tarjetas por tipo, diagrama con íconos y sin
      glifos. Prueba: captura local `r3-landing-desk`; `tsc`, i18n.
- [x] Portada de comunidad: voto rápido con filas numeradas y chevron, fila
      de acciones con scroll dentro de su tarjeta, fichas con alturas
      naturales y una sola fecha, filtros de tema con `Chip`, encuestas
      contenedoras como filas con reloj y chevron. "Más herramientas" sigue
      siendo `<details>` cerrado (cinco E2E lo abren por `summary`), ahora con
      aspecto de sección. Prueba: capturas `r3-comunidad-*`, specs 136/136.
- [x] Listados y formularios: categorías con `Chip` e íconos en filtros,
      formularios, `ClaimCard` y `PollCard`; el CTA de crear pasa a secundario
      sin sesión. Prueba: captura `r3-encuestas-phone`, specs 95/95.
- [x] Barrido de glifos: 24 archivos del agente más primitivos, paginaciones
      ("Siguiente"), perfil, proyectos, seguir y proyector; 13 claves
      traducidas pierden el glifo con su EN; 16 E2E ajustan el nombre
      accesible sin perder ninguna aserción.
- [x] Vitest completo 1477/1477, `pnpm lint` 0, `tsc` 0.
- [x] Playwright y build: CI de `main` en verde sobre `2d0c7af` (282 E2E, 2
      flaky que pasaron al reintentar) tras ajustar doce E2E y el Cancelar
      del cierre de encuesta.

## Evidence

- Ronda integrada (10-11-2026): `tsc` 0, `pnpm lint` 0 (i18n 3879
  mensajes), `vitest run` 203/1477 en verde. Capturas posteriores
  `r3-*.png` en el scratchpad de la sesión: fila de acciones con scroll,
  voto rápido numerado, fichas sin huérfana ni fechas repetidas, categorías
  con íconos, CTA secundario sin sesión.
- Incidente: el agente de glifos truncó once archivos con un helper de
  imports y los recuperó desde `HEAD`; el diff final se revisó por
  `git diff --numstat` (ningún archivo con más borrados que agregados en
  exceso) y la suite completa pasa.
- Capturas locales previas a la ronda (escritorio, teléfono, oscuro) en
  `/tmp/claude-1000/-home-seba-dev-agorbis/f1078d1b-5029-4c4d-a9c6-f1433553ecec/scratchpad/shots/`
  durante la sesión; hallazgos en D125.

## Next

Integrar lo de los cuatro agentes, suite completa, commits por zona. Después:
CI de `main` (la de D124 falló en `release-gates` por un `curl` vacío del
espejo de Ubuntu al instalar Git, no por código: rerun).
