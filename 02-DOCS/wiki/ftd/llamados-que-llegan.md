---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Llamados a publicar que llegan (mejora 5 de D112)

## Intención

En una comunidad vacía, tocar "Crear la primera encuesta" podía terminar en
"Se rompió algo de esta página". Es la peor primera impresión posible: la
persona toca justo lo que la app le pide tocar. El responsable eligió esta
mejora el 07-11-2026 como segunda tarea bajo D113.

Causa, verificada en `@qwik.dev/router` 2.0.0-beta.40: en una navegación
interna, si el loader de la ruta destino redirige en el servidor (sin sesión
a `/ingresar`, sin residencia a `/onboarding`, sin cupo o fuera de la
comunidad a `/publicar`), el cliente devuelve el valor anterior del loader
(vacío), dispara otra navegación con `goto(r)` y la página destino se dibuja
sobre datos vacíos mientras cambia el árbol: `NotFoundError` en
`insertBefore`. El `ErrorBoundary` del router nunca borra `store.error`, así
que el aviso queda aunque la URL final ya cargó. Recargar siempre recupera.

## Alcance

Sí, dos capas:

1. **Enlaces que ya saben a dónde ir.** Un ayudante puro calcula el destino de
   un llamado a publicar según lo que la página ya sabe de la persona: sin
   sesión, a ingresar con `next`; con sesión y sin residencia, a elegir
   residencia con `next`; con residencia pero fuera de la comunidad, al
   selector `/publicar`; si vive ahí, al formulario. Lo usan los cuatro
   llamados de la comunidad vacía y el diálogo "Publicar" de la barra
   inferior. Así los casos más comunes no pasan por una redirección interna.
2. **Un límite de errores que se recupera.** Reemplaza al del router en el
   layout raíz. Si el error llega con una navegación interna en curso, recarga
   la página una sola vez por entrada del historial (marca en `history.state`):
   la URL ya es la final. Mientras tanto muestra un estado neutro, no "Se rompió
   algo". Si el error no vino de una navegación, o la entrada ya se recargó,
   muestra el aviso de siempre. (La primera versión intentaba recuperar en el
   lugar; la evidencia de abajo explica por qué no alcanza.)

No: tocar el router, migraciones, archivos de `CODEOWNERS`, ni cambiar las
reglas del servidor sobre quién puede publicar (la base y los loaders siguen
decidiendo; el enlace sólo acierta más seguido).

## Checklist

- [x] E2E en rojo que reproduce el error con una navegación interna a una
      ruta que redirige. Prueba: reproducciones del 07-11 (abajo).
- [x] Ayudante `publicationEntryHref` con spec puro. Prueba: 5 de 5.
- [x] Llamados de la comunidad vacía y diálogo "Publicar" usan el ayudante;
      `ui-ux-regressions` actualizado. Prueba: E2E 12 de 12.
- [x] Límite de errores que se recupera, con spec de la lógica pura (9 de 9) y
      E2E con exactamente una carga de documento. Prueba: E2E 12 de 12.
- [x] `pnpm verify` (lint, 1347 pruebas, release) y `pnpm build.types` en verde
      con Node 22.22.0. Prueba: registro de verificación.
- [x] Revisión D113 (`ecc:code-reviewer`, `ecc:typescript-reviewer`,
      `ecc:silent-failure-hunter`). Prueba: hallazgos abajo.
- [x] D115 en `DECISIONS.md`, nota en D75, estado en
      `docs/mejoras-priorizadas.md`. Manual: sin cambio, no hay función nueva
      visible.

## Evidencia

- 07-11-2026 16:40. Spec de `publication-entry` y `error-recovery` en rojo:
  "Failed to load url" para los dos módulos. Rojo observado.
- 16:45. E2E nuevo contra la vista previa de `bf5df03`: el test del `href` falla
  (recibe `/c/ba-25-de-mayo/encuestas/nueva`, espera `/ingresar?next=…`). El test
  de navegación inyectada como visitante **pasa**: ese camino no reproduce.
- 16:50 a 17:05. Sondeos con un spec descartable, borrado después: visitante con
  clic, con hover y con teclado; residente de otra comunidad (sofia) en los tres
  modos; visitante con 3G lento; cuenta nueva sin residencia: ninguno rompió.
  Reprodujeron dos: (1) visitante en `/c/earth`, diálogo "Publicar" de la barra
  inferior, "Encuesta": termina en `/ingresar?next=…` con "Se rompió algo"
  visible, sin `pageerror`; (2) cuenta nueva sin residencia con 3G lento,
  "Crear la primera encuesta": T+12 s en `/onboarding?next=…`, T+15 s "Se rompió
  algo" visible, "Cargando página…" clavado hasta T+24 s, `pageerror`
  "Failed to execute 'insertBefore' on 'Node'".
- 17:10. Implementación: 13 de 13 en los specs puros; `pnpm build.types` 0;
  `pnpm lint` en verde (i18n 3747 mensajes).

- 17:20. Primer E2E con el build nuevo: 12 de 12 (3 nuevos + 9 de
  `ui-ux-regressions`), pero el test de la reproducción fiel mostró
  `pageerrors=[]`: pasó sin que la carrera ocurriera. Un oyente de `qerror` en
  los sondeos desapareció tras la navegación y no hubo pedidos `q-loader`: el
  ancla inyectada navegaba de forma **nativa** (el router sólo intercepta
  anclas al mismo camino; la navegación SPA la hace el manejador de `Link`).
  Los tests 2 y 3 eran evidencia falsa y se reescribieron.
- 17:30. Reproducción determinista por SPA: reapuntar el `Link` "Explorar" de la
  barra inferior al formulario (el manejador lee `elm.href` al hacer clic) y
  despachar `click`. Con la primera versión de la capa B (borrar el error cuando
  la URL cambia): T+1,5 s "Un momento…", T+3 s "Se rompió algo", "Cargando
  página…" clavado hasta T+6 s, URL ya en `/ingresar?next=…` desde el primer
  instante. Conclusión: la URL ya era la final cuando llegó el error y el router
  quedó trabado (la segunda navegación nunca termina), así que no hay señal para
  borrar el error ni árbol sano que volver a dibujar. La capa B pasó a la recarga
  única por entrada del historial que D112 había pensado, con la marca en
  `history.state`.
- 17:45. Lógica nueva: 6 de 6; ayudante: 5 de 5; `tsc` 0.

- 17:55. Sondeo contra el build con recarga única (primera versión, que leía el
  error por `qerror`): no recargaba. Causa: el core pone el error de render
  directo en el store de `useErrorBoundary` sin despachar `qerror`. Segunda
  versión: la tarea reacciona al store; sondeo: T+1,5 s ya en "Ingresá a
  Agorbis", sin aviso, sin velo, documento nuevo (recarga confirmada).
- 18:05. E2E por el runner (build con las variables `PUBLIC_*` incrustadas): 12
  de 12. Un intento previo contra una vista previa construida a mano falló en
  dos tests por el token de Turnstile vacío: artefacto del build sin entorno,
  no del cambio.
- Revisiones D113 sobre esa versión. `ecc:code-reviewer`: aprobar con dos
  medios; `ecc:typescript-reviewer`: bloquear por el oyente `qerror` perdido;
  `ecc:silent-failure-hunter`: tres altos (el oyente `qerror`, "Un momento…"
  sin salida, error sin rastro). Aplicado: oyente `qerror` restaurado;
  `try/catch` y tope de 5 s para la recarga; `console.warn` con el tipo del
  error; la ventana mira sólo cambios de `pathname` (ni query ni acciones);
  `hasResidence` desde `profile.home_community_id`; `performance.now()`;
  `as const` redundantes fuera; bordes del spec; el E2E cuenta exactamente una
  carga de documento. Descartado con motivo: un endpoint de telemetría propio
  (alcance aparte); tope duro con contador en `history.state` (el único
  camino a un segundo intento es una navegación con `replaceState` que vuelva a
  fallar, no existe hoy); adelantar los otros enlaces a formularios (anotado
  en D115 como alcance de la capa A).
- La suite completa de Vitest falló en `community-navigation-honesty.spec.tsx`
  porque su fixture tenía `isMember: true` con `isAuthenticated: false`, un
  estado imposible; ahora es un miembro coherente y hay un caso de visitante
  que espera `/ingresar?next=…`. Specs afectados: 20 de 20; `tsc` 0; ESLint ok.

## Siguiente paso

Commit en `main` (el push lo hace el responsable). Registro:
`02-DOCS/wiki/sdd/verifications/llamados-que-llegan-2026-11-07.md`. Propuestas
fuera de alcance: adelantar los otros enlaces a formularios con el ayudante;
un endpoint propio de telemetría para las recargas; probar "Un momento…" con
lector de pantalla real.
