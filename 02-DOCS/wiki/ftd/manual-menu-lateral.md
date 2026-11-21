---
author: Sebastián Cardoso Castillo
branch: manual-sidebar
status: done
merged: 2026-11-21
merged_by: Sebastián Cardoso Castillo
---

# Manual con menú lateral y preguntas ordenadas

## Intent

`/manual` tenía 103 preguntas en una sola lista, sin orden, buscador ni
anclas, con las básicas al final. Se reorganiza para que una persona encuentre
su respuesta: menú lateral a la izquierda (pedido del responsable), preguntas
esenciales primero y el detalle agrupado por tema.

## Scope

Entra: las 20 mejoras propuestas el 21-11-2026 sobre `/manual`, su catálogo
inglés y sus tests. El contenido sale de la ruta a `src/lib/manual-content.ts`
y `src/lib/manual-faq.ts`.

No entra: cambiar el nombre "Cómo funciona" del menú global, tocar textos
legales, CSP o `CLAUDE.md`. Los recordatorios del mínimo de 5 participantes
dentro de cada respuesta se dejan: cada uno responde una pregunta distinta y
es redacción atada a D68.

## Checklist

- [x] Contenido en `src/lib/` con `id` y `category` por pregunta — spec de ids únicos, categorías válidas y traducción inglesa de cada texto.
- [x] Buscador (función pura + `?q=` sin JavaScript) — spec de la función y E2E.
- [x] Menú lateral en escritorio y franja fija en teléfono con la sección actual a la vista — E2E a 1366 y 390 px.
- [x] Esenciales primero, detalle por tema, una columna, ancla por pregunta, abrir todas — E2E.
- [x] Textos: paso 01 corto, niveles coherentes, sin jerga, preguntas nuevas (borrar cuenta, apelaciones, dos pasos), enlaces — `check-i18n` y spec.
- [x] Un solo nombre, metadatos y `FAQPage` — HTML servido en español e inglés.
- [ ] Botones según sesión — escrito, **sin observar con una sesión iniciada**.
- [x] `pnpm lint`, `pnpm test`, `build.types` en verde.

## Evidence

- `vitest run src/lib/manual-faq.spec.ts`: 12 tests en verde. El spec se
  escribió antes que los archivos de contenido, pero se corrió por primera vez
  con ellos ya generados: no hubo corrida en rojo.
- HTML de `http://localhost:5199/manual/` (servidor de desarrollo): 101
  preguntas, `?q=residencia` devuelve 6, `?q=zzzqqq` devuelve 0 con su aviso,
  `?abrir=todas` las entrega abiertas, la búsqueda sale escapada en el campo y
  en el aviso, `FAQPage` presente; con `agorbis-locale=en`, todo en inglés.
- Playwright contra ese servidor: `e2e/manual.spec.ts` (10), más los
  existentes que abren el manual (`smoke`, `design-round-five`): 13 en verde.
  No se corrió contra el build de preview ni la suite E2E completa.
- Revisión independiente (`code-reviewer`): sin hallazgos críticos ni altos.
  Corregidos: fragmento mal codificado, enlace a un tema oculto por la
  búsqueda, doble `aria-current` y la frase de suspensiones, que afirmaba más
  que el texto legal. Al cubrirlos con E2E aparecieron dos defectos más, ya
  corregidos: el campo no se vaciaba al borrar la búsqueda y los enlaces
  internos no abrían la respuesta, porque el router no dispara `hashchange`.
- Defecto encontrado al probar y corregido: tras una búsqueda, los temas se
  volvían a montar y el menú dejaba de marcar el actual. Ahora se ocultan sin
  desmontarse.
- Fusiones (un párrafo por pregunta absorbida): pasaporte, foto de perfil,
  compromiso con un proyecto, notificaciones leídas, idioma al compartir,
  copiar enlace. De 103 preguntas quedan 101 con 4 nuevas.

## Next
Fusionado en main el 2026-11-21 (667a396).
