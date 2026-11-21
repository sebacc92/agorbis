---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Ronda de diseño (noviembre 2026)
description: D123, diez mejoras de diseño sobre Inicio, comunidad, Explorar, tarjetas y estados vacíos, con íconos propios, color por tipo, tipografía de títulos y un solo chip.
tags: [ftd, ui-ux, diseño]
timestamp: 2026-11-10T05:00:00Z
topic: ftd
---

# Ronda de diseño

## Intent

El 10-11-2026 el responsable pidió proponer diez mejoras de diseño y después
implementarlas todas en el orden recomendado, commiteando a `main` sin
correr tests ni desplegar. Diagnóstico sobre Producción (Inicio, Miramar,
Explorar, 404) y los tokens de `src/global.css`: base sana, pero sin
jerarquía ni identidad; emojis como íconos; todo violeta; tres píldoras
distintas. Decisión: D123.

## Scope

Dentro: los diez puntos de D123 sobre `src/global.css`, los primitivos de
`src/components/ui`, `src/lib/content-kinds.ts`, Inicio, el layout y la
portada de comunidad, Explorar, `CommunityCard`, `BottomNav`, las tarjetas y
cabeceras de encuestas, debates, reclamos, proyectos y acuerdos, el 404 y
`EmptyState`. Fuera: permisos, textos legales, CSP, lógica de votos y
moderación, el emoji como identidad de comunidad o perfil, el Manual.

## Checklist

- [x] Fuente de títulos propia (`public/fonts/manrope-latin.woff2`, OFL) con
      `@font-face`, `--font-display` y escala `text-display-*`. Prueba: el
      archivo existe (24 532 bytes), `tsc` pasa, la CSP ya permite `font-src 'self'`.
- [x] Tokens `--kind-*` por tipo en claro y oscuro, expuestos como utilidades.
- [x] `Icon` con 30 trazos propios; `Chip` con tres variantes; `Illustration`
      con ocho dibujos de línea; `Card` con `interactive` y `accent`;
      `EmptyState` con ilustración y mapa de compatibilidad para los emojis.
- [x] `content-kinds.ts`: una sola tabla de tipos con ícono, plural, color.
- [x] 404 con ilustración y escala nueva.
- [x] Inicio: chips, acciones compactas (ocultas en el teléfono porque la
      barra inferior ya publica), tarjeta sin redundancia, 72 rem, barra
      lateral pegajosa. Prueba: `tsc`, ESLint e i18n en verde; los asserts de
      `inicio-first-screen.spec.tsx` siguen apuntando a textos presentes.
- [x] Comunidad: banda por nivel, identidad grande, datos en una línea,
      pestañas con íconos y color por tipo, métricas con una anatomía,
      acción directa y herramientas con chips. Prueba: `tsc`, ESLint.
- [x] Explorar (`LocationPicker` en modo browse) y `CommunityCard`: tarjeta
      clicable entera, "Abrir comunidad" sólo para lectores de pantalla,
      bajar de nivel como enlace hermano; `BottomNav` con íconos por tipo;
      "⚡" del Header a ícono. Prueba: `tsc`, ESLint; sin E2E afectados por
      grep.
- [x] Tarjetas (`PollCard`, `ClaimCard`, `ProjectCard`, acuerdos) y cabeceras
      de detalle de los cinco tipos con acento y badge. Prueba: `tsc`,
      ESLint; los specs vecinos siguen encontrando sus textos.
- [x] Fichas de Descubrimiento con íconos (`INFO_CATEGORIES.icon`).
- [x] `pnpm lint` completo en verde (ESLint, Prettier, i18n, legal, contrato)
      y `tsc --noEmit` sin errores.
- [x] Vitest, Playwright y build: en verde en la CI de `main` sobre `2d0c7af`,
      después de los ajustes de specs de `f892fe1` y los E2E de `2d0c7af`.

## Evidence

- Cimientos: `pnpm exec tsc --noEmit` sin errores tras crear Icon, Chip,
  Illustration, content-kinds y los cambios de `Card`/`EmptyState`/404.
- Ronda integrada (10-11-2026): `pnpm lint` exit 0 (i18n: 3850 mensajes,
  2414 usos verificados; contrato de base coherente), `tsc --noEmit` exit 0.
- Cuatro agentes en paralelo sobre archivos disjuntos; ningún assert de spec
  se borró ni debilitó; ninguno reportó texto nuevo salvo "Participar del
  voto" (EN en `design-home.ts`).
- Sin evidencia observada en navegador: no hubo build ni E2E en local.

## Next

El responsable mira la CI de `main` (Vitest, Playwright, build) y, si está en
verde, recorre Inicio, Miramar y Explorar en Producción tras `deploy:open`.
Si la CI marca un spec, se ajusta el selector sin debilitar la aserción.
