---
type: decision-log
title: Decisiones SDD
description: Registro append-only de decisiones de alcance de la cadena SDD (specify, clarify, plan). Las decisiones de producto viven en DECISIONS.md del repo.
tags: [sdd, decisions]
timestamp: 2026-11-08T23:40:00Z
topic: sdd
---

# Decisiones SDD

Registro append-only. Cada entrada: fecha, fase, qué se decidió y por qué.

- **2026-11-08 · specify · acuerdos-entre-comunidades.** Primera spec del
  proyecto. Entra por el brief `ideas/acuerdos-entre-comunidades.md`. El
  responsable definió que un acuerdo se aprueba por voto (una, dos o más
  comunidades) y delegó las otras tres preguntas; el agente las resolvió como
  suposiciones tomadas con base (adhesión por una residente de cada comunidad;
  mismo país y sin contenerse; "propuesto" visible que vence a los 30 días).
  Constitución en borrador y sin `config.yaml`: se hereda de `CLAUDE.md` y
  `DECISIONS.md`. La construcción espera la señal de demanda del brief
  (06-12-2026) y la aprobación de la spec.
- **2026-11-08 · clarify · acuerdos-entre-comunidades.** El responsable
  aprobó la spec ("lo apruebo") con las cinco decisiones delegadas. Las dos
  preguntas abiertas se resolvieron por la misma delegación: los acuerdos
  viven como sección dentro de la pestaña Encuestas con página propia, y una
  propuesta sin adhesión es visible para todo el mundo con su estado en
  palabras. Status de la spec: clarified. Sigue `plan`.
- **2026-11-09 · plan · acuerdos-entre-comunidades.** Decisión de fondo:
  cada ronda de un acuerdo es una encuesta binaria existente ligada por
  `polls.agreement_id`, y el estado final se deriva en lectura desde
  `poll_results` en vez de guardarse. Hereda D68, gate legal, RLS y recibos
  sin un segundo sistema de voto ni cron de cierre. Escrituras sólo por RPC
  definer (`propose_agreement`, `adhere_agreement`, `withdraw_agreement`).
  Orden: borrador de migración (agente) → promoción (responsable, puerta
  dura) → ayudantes puros → páginas → sección y feed → docs → E2E y verify.
- **2026-11-09 · tasks · acuerdos-entre-comunidades.** Doce tareas
  anexadas al plan. Cambios respecto del plan original: los borradores SQL
  van a `02-DOCS/wiki/sdd/drafts/` porque `supabase/sql-drafts/` y
  `supabase/migration-drafts/` también son del responsable y tienen
  inventario fijado por el preflight; la autora de cada encuesta de un
  acuerdo es quien completó la última adhesión (el guarda de inserción exige
  autor = sesión) y esas encuestas quedan exentas de la cuota mensual, con
  una cuota propia de 3 propuestas abiertas por persona. Autopiloto
  autorizado por el responsable ("sigue con lo que recomiendes") hasta la
  puerta T003, que es suya.
- **2026-11-15 · debug · `/buscar` caía con una búsqueda reciente.**
  Repro: `localStorage.agorbis_recent_searches = ["agua"]` y abrir
  `/buscar/?q=salud`; o `pnpm test.e2e e2e/search-usability.spec.ts
e2e/navigation-context-followups.spec.ts` (4 rojos desde `5879b1c`).
  Causa: el optimizador de Qwik beta.40 declara el QRL de un manejador en
  línea que captura la variable de un `.map` (`.w([...])`) justo antes del
  `return` del componente; `recentHistory` es JSX armado en una constante
  anterior, así que con el historial no vacío el redibujado en el navegador
  lanzaba `ReferenceError` (zona muerta temporal) y el límite de errores
  mostraba "Se rompió algo de esta página". En SSR el historial está vacío y
  el `.map` no corre, por eso Vitest no lo veía. Arreglo: el botón lleva
  `data-query` y recibe `removeRecentSearch` por referencia. Tapado por ese
  fallo había otro de la misma ronda: el `<li>` de cada resultado, ítem de
  grilla sin `min-w-0`, desbordaba a 320 px (387 px de ancho). Por qué se
  escapó: D126 salió con Vitest y `test.release` locales, sin E2E. Los otros
  172 manejadores de bucle de `src` se revisaron con el código generado por
  Vite y ninguno repite el patrón. Regla (D75): un manejador que capture la
  variable de un `.map` no va en JSX guardado en una constante previa al
  `return`.
- **2026-11-15 · debug · el formulario "no arrancaba arriba" en la CI.**
  Repro: `e2e/community-directory-followups.spec.ts` ("el layout sigue
  montado…") falló una vez en la corrida 43377448855 (`scrollY` 81, esperaba 0); en local, 0 de 10. Con `Emulation.setCPUThrottlingRate` en 8 se
  ve el mecanismo. Causa: al cargar un listado, la tarea que centra el chip
  del filtro llamaba a `scrollIntoView({ block: "nearest" })`; la fila es
  pegajosa y el `scroll-padding` de la comunidad la da por tapada, así que el
  navegador además bajaba la página entre 53 y 81 px. Al navegar al
  formulario, el router de Qwik beta vuelve arriba recién al terminar, y con
  la CPU lenta eso pasa más de 5 s después de que el título ya se ve.
  Arreglo: `src/lib/center-in-row.ts` mueve sólo la fila; lo usan reclamos,
  proyectos, encuestas y `/buscar`. Guardas: `center-in-row.spec.ts` y el E2E
  "un filtro aplicado centra su chip en la fila sin bajar la página". Queda
  aparte "Más agrupa las secciones secundarias…", que falla 2 de 6 en local
  con y sin este cambio: ver la entrada siguiente.
- **2026-11-15 · debug · cada navegación sacaba la página del documento.**
  Repro: "Más agrupa las secciones secundarias…" con
  `Emulation.setCPUThrottlingRate` en 8 fallaba 6 a 8 de cada 8 (la pestaña
  "Comparar" quedaba en x=742 de 390). Causa: el layout raíz se redibuja en
  cada navegación y le pasaba a `RecoveringErrorBoundary` un `fallback$` que
  era una QRL nueva cada vez; el límite se redibujaba y, como es quien
  proyecta la página en `<main>`, Qwik beta.40 quitaba del documento todo su
  contenido y lo volvía a poner. Un nodo que sale y entra pierde el scroll de
  sus filas (el carril recién centrado volvía a 0), el foco y las animaciones.
  Era la causa que `holdFocus` y `focusWhenRendered` rodeaban por síntoma.
  Arreglo: el aviso de error vive dentro del límite (`RouteErrorNotice`) y el
  límite no recibe props. Guarda: el E2E "navegar entre secciones no
  desengancha del documento el contenido de la página", que daba 2
  desenganches por navegación. Descartado midiendo, en este orden: la
  transición del peso de la fuente variable, el `scroll-snap`, el
  deslizamiento suave, y que el layout raíz leyera `isNavigating` (moverlo a
  un componente hijo no cambió nada y se revirtió). Regla (D75): a un
  componente que proyecta contenido con `<Slot />` no se le pasan funciones
  en línea ni objetos nuevos como props.
- **2026-11-16 · debug · barra inferior y pruebas inestables de la CI.**
  La CI de `66a8c31` falló en la prueba de la barra inferior: el cuerpo usa
  la fuente del sistema y el runner resuelve DejaVu Sans, más ancha que la
  Noto Sans local; "Mi comunidad" pasaba a dos renglones y "Notificaciones"
  se salía 3 px. Arreglo en `764ef4d` (Publicar con ancho fijo, menos margen
  lateral, `tracking-tight`); la prueba fuerza DejaVu Sans para fallar igual
  en cualquier máquina. De las tres inestables: "ejecución ofrece
  transiciones…" leía las opciones una vez entre la respuesta de la acción y
  la de los datos (reproducido con 250 ms de demora, arreglado en
  `50e4785`). El token de Turnstile que no llega en 20 s (5 de 7 corridas
  con log) y el cambio de correo no se pudieron diagnosticar: la CI no sube
  capturas ni trazas de Playwright. Siguiente paso: subir `test-results/`
  cuando falla `pnpm test.e2e` (cambio en `.github/`, del responsable).
