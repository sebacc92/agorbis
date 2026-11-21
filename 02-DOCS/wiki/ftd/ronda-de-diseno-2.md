---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Segunda ronda de diseño (noviembre 2026)
description: D124, diez mejoras sobre el detalle de encuesta, header, perfil, formularios, miga, debate, movimiento y pie de página.
tags: [ftd, ui-ux, diseño]
timestamp: 2026-11-10T06:30:00Z
topic: ftd
---

# Segunda ronda de diseño

## Intent

El 10-11-2026, con D123 recién en `main`, el responsable pidió diez mejoras
más y aprobó implementarlas en el orden recomendado. Diagnóstico en
Producción sobre el detalle de encuesta, el de debate, el formulario de nueva
encuesta, el perfil y los listados de Miramar. Decisión: D124. Antes de
empezar, la CI de D123 marcó cinco specs (emojis esperados, Chip sin
proveedor de ruta, trinquete de colores, un comentario leído como clase):
se corrigieron en `f892fe1` con Vitest completo en verde.

## Scope

Dentro: los diez puntos de D124. Fuera: permisos, textos legales, CSP, la
lógica del voto, los formularios de cuenta, la portada para visitantes (no
vista con sesión abierta) y el modo oscuro, que queda como recorrido
pendiente.

## Checklist

- [x] Movimiento: tokens `--duration-*`/`--ease-*`, animaciones sobre ellos,
      View Transitions con fundido corto y apagado por `prefers-reduced-motion`,
      botones sin `hover:scale`. Prueba: `tsc`, specs de `ui` en verde.
- [x] Radios: `Button`, `Input`, `Alert` y cierre de modal a 12 px; tarjetas
      quedan en 16.
- [x] `ShareButton`: un solo "Compartir" con desplegable (WhatsApp, Telegram,
      copiar). Prueba: `ShareButton.spec` 12/12, con el assert de la variante
      compacta ajustado a la etiqueta sin flecha tipográfica.
- [x] Detalle de encuesta: "Votar" primario anclado, Guardar y Compartir
      secundarios, panel de autor único (`embedded` en los dos botones),
      opciones de voto de 56 px con el color del tipo, resultados reservados
      con candado y fecha. Prueba: specs de encuesta y polls 47/47.
- [x] Panel de extensiones en una tarjeta con contadores y vacíos en una
      línea; debate sin columnas como `EmptyState` con ancla a reportar;
      "Cómo participar" bajo el título. Prueba: specs de content y debates
      40/40.
- [x] Header con un solo buscador (atajo como botón adentro del campo),
      avatar y nombre corto, punto de no leídos; miga colapsada en todo ancho
      con 4+ niveles; pie compacto con los mismos enlaces e `id`. Prueba:
      specs de layout y miga 24/24.
- [x] Perfil con banda de identidad, pestañas con íconos, cupo como una fila
      por comunidad con barras y un solo "Publicar acá"; `FormShell` con
      `numbered` y resumen pegajoso; activado en "Nueva encuesta" con Pregunta
      y Contexto marcados como secciones. Prueba: specs de perfil, cupo y
      formularios 25/25.
- [x] Vitest completo 1477/1477, `pnpm lint` exit 0, `tsc` exit 0.
- [x] Playwright y build: CI de `main` en verde sobre `2d0c7af`, tras revertir
      las View Transitions entre documentos y ajustar los E2E.

## Evidence

- Ronda integrada (10-11-2026): `tsc` 0, `pnpm lint` 0, `vitest run` 203
  archivos / 1477 pruebas en verde. Los agentes ajustaron tres specs por DOM
  nuevo (miga colapsada en todo ancho, cupo con un solo enlace, cierre de
  encuesta sin sección propia) sin quitar aserciones.
- Cimientos: `tsc` 0, `vitest run src/components/content/ShareButton.spec.tsx
  src/components/ui` 41/41 tras ajustar el assert de la variante compacta.

## Next

Integrar lo de los cuatro agentes, correr la suite completa y commitear por
zona. Pendiente de otra ronda: recorrer el modo oscuro con los colores por
tipo y la portada para visitantes.
