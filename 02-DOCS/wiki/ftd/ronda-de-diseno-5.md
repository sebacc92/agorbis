---
author: Sebastián Cardoso Castillo
branch: main
status: review
type: feature
title: Quinta ronda de diseño (noviembre 2026)
description: Veinte mejoras propuestas en cuatro tandas sobre las pantallas que las rondas anteriores no tocaron; las cuatro están implementadas (defectos visibles, coherencia con el sistema visual, densidad en teléfono, formularios y cuenta). Aplica D123 y D126, sin decisión nueva.
tags: [ftd, ui-ux, diseño]
timestamp: 2026-11-15T18:50:00-03:00
topic: ftd
---

# Quinta ronda de diseño

## Intent

El 15-11-2026 el responsable pidió "propone 20 mejoras de diseño" y, con la
lista en camino, "empezá implementando una tanda, la que recomiendes". El
diagnóstico se hizo con 35 capturas del build local (390 px con y sin
sesión, modo oscuro y 1366 px) sobre las pantallas que D123-D126 no
tocaron. La tanda recomendada es la de defectos visibles: cada uno se midió
antes de tocarlo.

## Scope

Dentro: presentación. Fuera: permisos, D68, D74, textos legales, CSP,
`localStorage`, loaders, acciones y los archivos de `.github/CODEOWNERS`.
No hay decisión nueva: se aplican D123 (íconos propios, color por tipo) y
D126. No cambia ninguna función, así que el Manual no se toca.

## Checklist

### Tanda 1 · Defectos visibles (implementada)

- [x] 1. Directorio de sub-comunidades: la grilla no declaraba columnas en
      teléfono y cada ficha medía su contenido. Prueba: `scrollWidth` 397 →
      390 a 390 px (`e2e/design-round-five.spec.ts`).
- [x] 2. Carril de secciones: degradé a la izquierda cuando el carril se
      deslizó (`data-scrolled`). Antes la primera pestaña quedaba cortada
      contra el borde ("royectos"). Prueba: E2E, ausente en la primera
      sección y presente en Comparar.
- [x] 3. Puntos separadores colgando: `MetaLine` (`src/components/ui`) y
      `.meta-line` en `global.css` dibujan el punto delante de cada dato y
      recortan el que abre un renglón. Aplicado al detalle del debate y al
      perfil propio. Prueba: `MetaLine.spec.tsx` y E2E de geometría.
- [x] 4. Barra inferior: la sección activa se marca con color y una raya
      arriba, sin negrita. En negrita "Mi comunidad" medía 75 de 75 px y
      pasaba a dos líneas. Prueba: E2E (una línea, raya visible).
- [x] 5. `/publicar`: cada tipo con su ícono y su color, y el nombre de las
      pestañas ("Encuestas"), en lugar de emoji y minúscula. Prueba: E2E.
- [x] Gates locales (15-11-2026, Node 22.22.0): `tsc` 0, `pnpm lint` 0,
      Vitest 208 archivos y 1550/1550, `design-round-five.spec.ts` 5/5.
### Tanda 2 · Coherencia con el sistema visual (implementada)

- [x] 6. Tipo de encuesta: formas del sistema (`PollTypeMarks`) en lugar
      de `◉ ○ ○`, `☑ ☑ ☐` y 👍👎, en el selector y en la vista previa.
      Prueba: E2E, el grupo no contiene ninguno de esos caracteres.
- [x] 7. Comparativa: cabecera de listado como contraste y rendición (sin
      el segundo contenedor, el degradé, 📊 ni mayúsculas de título), cifras
      con la anatomía de `MetricTile`, "Todavía sin reclamos" en lugar de un
      "0%" verde, sin 🏆 y la flecha como ícono. Mismos datos y enlaces.
      Seis claves inglesas nuevas en `design-r5.ts` y seis viejas borradas
      tras comprobar que no se usan. Prueba: E2E y captura clara y oscura.
- [x] 8. Contraste: "Qué reclama cada territorio" con el megáfono en el
      color del reclamo. Prueba: E2E.
- [x] 9. Una sola página "no existe": la ruta comodín usa `HttpErrorPage`
      (que ahora admite contenido propio) y le suma la dirección pedida y
      el buscador. Queda una sola acción principal. Prueba: E2E (estado
      404, un `h1`, ilustración, código, buscador).
- [x] 10. `MetaLine` en la cabecera de comunidad y en las líneas de autor
      de proyecto y reclamo (9 separadores). Quedan 9 en filas de tarjeta
      que no envuelven (`ClaimCard`, `PollCard`, búsqueda, listados): ahí
      el punto no cuelga y `MetaLine` cambiaría el truncado. Prueba: E2E de
      la cabecera y captura del proyecto.
- [x] Gates locales (15-11-2026): `tsc` 0, `pnpm lint` 0 (i18n 3902
      mensajes), Vitest 208 archivos y 1550/1550,
      `design-round-five.spec.ts` 10/10 dos veces seguidas.
### Tanda 3 · Jerarquía y densidad en teléfono (implementada)

- [x] 11. Aviso a quien visita una comunidad: sus dos salidas ("Crear
      cuenta" e "Ingresá") van en un renglón en el teléfono. El texto del
      aviso (D116) no cambia. Plegarlo en las secciones internas ahorraría
      más, pero esconde un texto que D116 pide a la vista: queda como
      decisión del responsable. Prueba: E2E.
- [x] 12. Inicio: las dos filas de filtros en un renglón que se desliza
      (`CHIP_ROW`), con el chip aplicado centrado (`centerInRow`). Prueba:
      E2E (un renglón por fila; "Mar del Plata" entero a la vista).
- [x] 13. Mapa: las distancias en un renglón que se desliza, con su rótulo
      arriba y nombre de grupo. No se plegaron los filtros detrás de "Más
      filtros", como decía la propuesta: los tres grupos ya eran un renglón
      cada uno salvo este, y plegarlos escondía el estado del filtro.
      Prueba: E2E.
- [x] 14. Explorar: "Buscar" junto al campo también en el teléfono y los
      filtros rápidos en un renglón, con nombre de grupo. Prueba: E2E.
- [x] 15. Instituciones: con el directorio vacío queda un solo "Solicitar
      verificación" (eran tres); la grilla declara su columna. Prueba: E2E.
- [x] Gates locales (15-11-2026): `tsc` 0, `pnpm lint` 0, Vitest 208
      archivos y 1550/1550, `design-round-five.spec.ts` 15/15 (las cinco de
      esta tanda fallaron antes de implementar). Capturas en 390 y 1280 px:
      el escritorio no cambia.
### Tanda 4 · Formularios y cuenta (implementada)

- [x] 16. Categoría con el mismo control en reclamo y encuesta: las clases
      viven en `components/forms/category-choice.ts` y el marcado sigue en
      cada formulario (los radios no pasan a un componente hijo, D99). La
      fila mide 44 px; antes la de la encuesta no llegaba y la del reclamo
      eran baldosas altas. Prueba: E2E compara la anatomía de las dos.
- [x] 17. Notificaciones: "Marcar todas como leídas" y "Escuchar resumen"
      con la anatomía de botón del sistema y en ese orden; en el teléfono
      la hora va debajo del título, a la izquierda, y desde `sm` a su
      derecha. Un primer intento la puso junto al título también en el
      teléfono y lo apretaba en cuatro renglones: se vio en la captura y se
      corrigió. Prueba: E2E y capturas a 390 y 900 px.
- [x] 18. Seguridad: la insignia dice "Un paso" o "Dos pasos", sin la sigla
      AAL. Prueba: E2E.
- [x] 19. Pie de ingreso y registro: un solo aviso visible ("Se abren en
      una pestaña nueva.") en lugar de un ícono por enlace. Cada enlace
      conserva el texto para lectores de pantalla y `target="_blank"`
      (WCAG 3.2.5): la propuesta decía "sin el ícono", pero el aviso no es
      decoración. Prueba: E2E del nombre accesible de cada enlace.
- [x] 20. Manual en escritorio: la frase destacada de "Amor cívico" va al
      costado del texto desde `lg`; la tarjeta dejaba el 40 % derecho
      vacío. Prueba: E2E a 1366 px.
- [x] Gates locales (15-11-2026): `tsc` 0, `pnpm lint` 0 (tres claves
      inglesas nuevas en `design-r5.ts`, dos viejas borradas), Vitest 208
      archivos y 1550/1550, `design-round-five.spec.ts` 20/20 (las cinco de
      esta tanda fallaron antes de implementar).
- [ ] E2E completa y CI de `main` después del push.

## Evidence

- Capturas del 15-11-2026 (build local, cuenta de prueba) y medición con
  Playwright: directorio `scrollWidth=397`; carril `scrollLeft=618` con la
  primera pestaña en x=-602; etiqueta activa de la barra `alto=28`,
  `ancho=75/75`, `peso=600`.
- Descartado: el selector de fotos en inglés ("Choose Files") es el idioma
  del navegador de prueba, no un defecto.
- `src/global-css-classes.spec.ts` no admite `before:content-['']`; en
  Tailwind v4 `before:` ya define el `content`, así que la clase sobra.

## Next step

Push y CI. Decisión abierta: plegar el aviso de visitante en las secciones internas (D116).
