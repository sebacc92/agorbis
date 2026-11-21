---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Un envío nunca queda mudo (mejora 10 de D112)

## Intención

Hoy, si la red se corta mientras se publica o comenta, el botón queda apagado y
el velo tapando el formulario sin ningún mensaje; si el servidor devuelve algo
que no es JSON, igual. Y un segundo toque manda otro POST: puede duplicar un
reclamo, una encuesta o un comentario de una persona real. El responsable eligió
esta mejora el 07-11-2026 como primera tarea bajo el método de D113.

Causa, verificada en `@qwik.dev/router` 2.0.0-beta.40: `submitAction` hace el
`fetch` sin `try/catch` y, si la respuesta no trae `content-type` JSON, devuelve
`undefined`; en los dos casos la promesa de la acción no se resuelve y
`isRunning` e `isNavigating` quedan en `true`. Además `Form` no protege contra
el doble envío cuando recibe un solo `onSubmit$` (nuestros cuatro formularios).

## Alcance

Sí: un script con nonce en `root.tsx`, armado en `src/lib/action-guard.ts`, que
(a) bloquea un segundo `submit` de un formulario del router mientras el anterior
no terminó y (b) envuelve `window.fetch` sólo para los POST con `qaction=` para
convertir un rechazo de red o una respuesta sin JSON en un resultado de acción
con el formato que el router espera. `PublicationError` titula "No sabemos si se
publicó" cuando el resultado viene marcado como no entregado. Los cuatro
formularios de publicar mantienen el botón bloqueado y avisan "Publicado.
Abriendo la publicación…" entre la confirmación de la base y la navegación.

No: cambiar la API de las acciones, tocar el router, migraciones, archivos de
`CODEOWNERS`, ni prometer que algo "no se guardó" (D74: el POST pudo llegar).

## Checklist

- [x] Spec de `action-guard` en rojo antes de implementar. Prueba: Vitest,
      "Failed to load url ./action-guard".
- [x] El formato sintético pasa por `_deserialize` de Qwik. Prueba: spec, 21/21.
- [x] El envoltorio de `fetch` convierte rechazo, respuesta sin JSON, JSON
      cortado y 5xx sin `result`; deja pasar GET, POST sin `qaction`, JSON de
      acción (también 400) y redirecciones; conserva `this` y argumentos; los
      códigos sin cuerpo caen a 503. Prueba: spec.
- [x] El segundo `submit` se bloquea mientras hay uno pendiente; liberan
      `submitcompleted`, el `fetch` de esa acción al asentarse (también si
      rechaza) y `pageshow`; sólo formularios `method="post"` con `qaction=`.
      Prueba: spec.
- [x] El script deja `data-action-guard` en `on`, o `failed` si no pudo
      instalarse; no contiene `</script>` ni sintaxis posterior a ES5. Prueba: spec.
- [x] `PublicationError` titula "No sabemos si se publicó" con `undelivered`.
      Prueba: lectura del diff; el E2E lo busca por rol `alert`.
- [x] Los cuatro formularios bloquean el botón tras publicar y muestran el aviso
      con enlace a la ficha; el asistente de proyectos frena el doble toque y
      suelta la marca si su validación local no envía. Prueba: diff y E2E.
- [x] E2E: red cortada muestra el aviso con foco, el formulario vuelve a la
      edición con lo escrito y sin velo; triple toque manda un solo POST, avisa
      "Publicado" con enlace, el botón sigue bloqueado y se crea un solo reclamo;
      `data-action-guard="on"`. Prueba: Playwright, séptima corrida, 2 de 2.
- [x] `pnpm lint`, `pnpm build.types`, `pnpm test`. Prueba: salida, abajo.
- [x] Revisión con `ecc:code-reviewer`, `ecc:typescript-reviewer` y
      `ecc:silent-failure-hunter` (D113). Prueba: hallazgos abajo.
- [x] D114 en `DECISIONS.md`, nota en D75, estado en
      `docs/mejoras-priorizadas.md`, pregunta en `/manual` con traducción.

## Evidencia

- 07-11-2026 15:27. Spec nuevo contra módulo inexistente: Vitest falla con
  "Failed to load url ./action-guard". Rojo observado.
- 15:28. Primera implementación: 10/10 en el spec; `pnpm lint` en verde;
  `pnpm build.types` en verde; `pnpm test` 184 archivos, 1321 pruebas.
- 15:33. Primer E2E por `pnpm test.e2e` con Node 22.22.0: los dos tests fallan.
  El doble toque mandó 3 POST. Causa, vista en el HTML servido por
  `vite preview`: Qwik 2 no deja `preventdefault:submit` como atributo (el
  `<form>` del router sale como `action="?qaction=…" method="post"`), así que el
  criterio del bloqueo nunca marcaba nada. El test de red cortada esperaba el
  botón "Publicar reclamo", pero el resultado sintético reemplaza `preview` y
  el formulario vuelve a la edición.
- Revisiones D113 sobre la primera implementación. `ecc:code-reviewer` y
  `ecc:typescript-reviewer`: bloquear, por formularios con
  `preventdefault:submit` que nunca despachan `submitcompleted` (`/buscar`, el
  asistente de proyectos) y quedarían trabados; 204/205/304 hacían lanzar
  `new Response`; `PublishedNotice` montaba la región viva ya con texto; el
  spec de paso directo no probaba nada. `ecc:silent-failure-hunter`: además, un
  5xx JSON sin `result` (acción que lanzó) y un JSON cortado seguían mudos; el
  mensaje hablaba de "publicar" en acciones que no publican; sin salida si la
  navegación tras publicar falla; el `try/catch` exterior tragaba fallas de
  instalación. Se aplicó todo salvo un tiempo límite para un `fetch` que
  cuelga (D114 lo excluye a propósito) y la clave de idempotencia en la RPC
  (migración del responsable, anotada en D114 como propuesta).
- 15:43. Segunda implementación: 21/21 en el spec; `pnpm lint` en verde
  (i18n 3746 mensajes); `pnpm build.types` en verde; `pnpm test` 184 archivos,
  1332 pruebas.

- 15:52 y 16:00. Segunda y tercera corrida del E2E: red cortada en verde. Doble
  toque: con tres toques sale **un solo** POST de publicar (el conteo del test
  incluía Ingresar y Revisar, corregido), pero el aviso "Publicado" no se vio:
  primero por una carrera (la ficha abría antes de mirar; el test retiene ahora
  las cargas de datos de la navegación interna) y después porque el aviso vivía
  en la rama de revisión, que se desmonta al publicar porque `preview` deja de
  venir en el resultado. Se movió a la rama de edición, que es la que queda a la
  vista. Tipos, ESLint y Prettier sobre los cuatro formularios en verde.

- 16:10 a 16:25. Corridas quinta a séptima del E2E con Node 22.22.0. La quinta
  falló en el paso previo de "Revisar" por inestabilidad del botón mientras yo
  corría tipos y ESLint en paralelo (3,3 min contra 1,4): no se volvió a repetir
  sola. La sexta confirmó aviso y enlace visibles y falló por una aserción mía
  (el botón bloqueado tras publicar es "Revisar antes de publicar"). La séptima:
  **2 de 2 en verde, 1,2 min.**

## Siguiente paso

Commit en `main` (el push lo hace el responsable). Quedan como propuestas, fuera
de este alcance: clave de idempotencia en la RPC de publicación (migración del
responsable, D114) y probar con lector de pantalla real el aviso "Publicado".
