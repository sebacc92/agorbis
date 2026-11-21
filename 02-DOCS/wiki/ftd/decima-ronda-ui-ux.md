---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Décima ronda de UI/UX (noviembre 2026)
description: Diez mejoras comprobadas en Producción el 09-11-2026 como visitante en teléfono y con sesión en escritorio, aplicadas una por commit.
tags: [ftd, ui-ux]
timestamp: 2026-11-09T06:00:00Z
topic: ftd
---

# Décima ronda de UI/UX

## Intent

El 09-11-2026 el responsable pidió recorrer todo el sitio y proponer diez
mejoras; aprobó las diez en el orden recomendado y sin preguntar. Producción
corría todavía la app anterior a D117, así que la auditoría distingue lo que
ya está arreglado en `main` de lo que sigue vivo. Vista de visitante a 390 px
(Playwright, anónima) y vista con sesión en escritorio (Chrome del
responsable). Comunidad de referencia: Miramar, con 2 residentes y 6
encuestas.

## Scope

Dentro: las diez mejoras de abajo, cada una con spec y, donde hay flujo, E2E.
Fuera: encontrar la propia ciudad y "¿Dónde vivís?" (pendientes 8 y 9 de
D112, bloqueados por la migración de localidades); compartir triplicado y el
nombre cortado del encabezado (anotados, sin tope).

## Checklist

Orden recomendado y seguido. Cada tarea se marca sólo con la prueba observada.

- [x] 9 · Ingresar espera al token de Turnstile: el botón queda deshabilitado
      mientras se verifica, y lo mismo en registro y enlace mágico. Prueba:
      spec de `TurnstileGate` por estado; E2E de acceso en verde.
- [x] 1 · Comunidad en el teléfono: un solo llamado para visitantes, "Invitar
      vecinos" sólo para miembros, balance debajo de la primera publicación.
      Prueba: spec de la página; captura a 390 px con la primera publicación
      en la primera pantalla y media.
- [x] 2 · "Balance Cívico" honesto: título sin folleto, ceros como "todavía
      ninguno", sección compacta. Prueba: spec con conteos en cero.
- [x] 3 · Quitar "Continuá explorando" duplicado de las pestañas y poner las
      encuestas de la cadena en su lugar. Prueba: spec.
- [x] 5 · Pestañas que no se parten y avisan el desborde. Prueba: spec de
      clases; captura a 390 px.
- [x] 6 · Una sola llamada por tarjeta de encuesta. Prueba: spec de `PollCard`.
- [x] 4 · Miga colapsada en teléfono con la comunidad cercana a la vista.
      Prueba: spec de `CommunityBreadcrumb`.
- [x] 7 · Guía de tres pasos sólo a residentes, debajo de la primera
      publicación. Prueba: spec de `CivicTour`.
- [x] 8 · Buscar con cabecera de una línea y resultados en la primera
      pantalla. Prueba: spec; captura.
- [x] 10 · Perfil que arranca con lo útil y pasaporte sin cinco pendientes.
      Prueba: spec de `CivicPassportCard` y de la página.

- [x] R · Restos de la revisión: "¿Ya tenés cuenta? Ingresá" en el recuadro de
      visitante y el nombre del encabezado sin cortar en escritorio ancho.
      Prueba: spec del recuadro con enlaces a `/registro` y `/ingresar`;
      tsc y check-i18n en verde. Lo de "compartir triplicado" queda anotado:
      la ficha de reclamo tiene un ShareButton de tres botones en "Difundir"
      y uno compacto en la barra, por diseño, y la nota original no se pudo
      reconstruir con precisión.
- [x] R2 · Avisos de Supabase sobre RPCs `security definer` ejecutables por
      `anon`: revisar si alguna sobra. Resultado: ninguna. `is_moderator` ya
      devuelve falso salvo para la propia sesión y las policies la necesitan;
      `community_member_visibility_counts` alimenta una página pública;
      `can_view_content` vive en las policies de lectura anónima. Sin migración.

## Evidence

- **9** (09-11-2026): `TurnstileGate` expone `state: { status }` (`ssr` →
  `waiting` → `ready` | `failed`, y `waiting` otra vez tras cada envío);
  `ingresar` (contraseña y enlace mágico) y `registro` deshabilitan el botón
  mientras vale `waiting` y una región viva dice "Verificando que sos una
  persona antes de enviar…". Sin JavaScript el botón queda habilitado y la
  base rechaza. Decisión: el estado viaja en un `useStore`, porque una señal
  pasada como prop llega desenvuelta. Spec nuevo `TurnstileGate.spec.tsx`
  (3): la tarea visible corre en Vitest y sin SDK pasa a `failed`; con un
  cargador que nunca resuelve queda en `waiting` y el botón deshabilitado.
  tsc 0, check-i18n 3842, ESLint limpio. E2E `account-access.spec.ts` 2 de 2 (1,6 min).
  Commit `a75db08`.
- **1** (`3230320`): `layout.tsx` muestra "Invitar vecinos" sólo a miembros y
  quita "Ingresá para seguir" sin sesión (el recuadro ya pide la cuenta);
  `index.tsx` dibuja la encuesta destacada antes del balance. Spec
  `community-navigation-honesty` +2 (visitante: un solo "Crear cuenta";
  residente: invitar). 12 archivos / 91 pruebas de la comunidad en verde.
- **2** (`ed16137`): título "Lo que pasa en {{name}}", `countOrNone` →
  "Todavía ninguno" para victorias y en curso, sin flecha, tiles compactas.
  Spec +1 con `withContent` (6 encuestas, 0 victorias). "Impacto Comunitario"
  se conserva en el catálogo porque lo usa `VictoriesHonorRoll`.
- **3** (`494270a`): `useChainPolls` carga siempre; `ChainPollsList`
  compartido; pie "Continuá explorando" eliminado con sus diez claves. Spec +2
  (con contenido y cadena; con contenido y sin cadena). Una aserción vieja que
  esperaba el enlace a Sub-comunidades del pie pasó a comprobar sólo que no hay
  "0 divisiones": esa entrada vive en "Más".
- **5** (`373a5b8`): carril `data-tabs-fade` con degradé `after:` y `pr-10`;
  enlaces `whitespace-nowrap`. Spec +1 de clases.
- **6** (`ece5d8c`): pastilla "Encuesta abierta · Ver encuesta →" eliminada
  de `PollCard`; spec cuenta una sola aparición.
- **4** (`3c9eedf`): `CommunityBreadcrumb` colapsa ancestros con `hidden
  sm:flex` y botón "…" `aria-expanded`; spec nuevo (3) con clic que despliega.
- **7** (`7cb9298`): `CivicTour` tras el primer reclamo y sólo `isMember`;
  spec nuevo de la página (3) con `scrollIntoView`, `document` y `window`
  simulados, porque la página los toca en tareas visibles.
- **8** (`1f06346`): cabecera de una línea, chips en fila deslizable con
  degradé (`data-chips-fade`), "Filtros activos" sólo con `hasFilters`, temas
  destacados debajo de los resultados con consulta (el E2E existente exige que
  sigan presentes). E2E nuevo `search-first-screen` (primer resultado con
  `y < 764` a 390×844; antes 780) y los cuatro E2E de búsqueda: 13 de 13.
- **10** (`f8a15c5`): Resumen arranca con la residencia; tarjeta "Insignias de
  Impacto Vecinal" eliminada; pasaporte con sellos obtenidos + `data-next-badge`.
  Spec nuevo (3). El perfil público usa el mismo componente.
- Cierre (09-11-2026): `pnpm verify` sobre `f8a15c5` → salida 0 (198
  archivos, 1452 pruebas). Revisores D113 de sólo lectura (código, TypeScript,
  fallos silenciosos): ningún crítico; un alto (un E2E que esperaba "Invitar
  vecinos" para una visitante) y medios, aplicados en un commit aparte:
  - Gate de Turnstile: la expiración del token vuelve a `waiting` (Turnstile
    renueva solo) en vez de habilitar el botón sin token; el re-render por
    cambio de ancho también espera; `cleanup` deja `ssr` al cambiar de modo;
    `reset` y `render` con `try/catch`; vigilante de 25 s que pasa a `failed`
    si el widget nunca responde; estrategia `document-ready` para armarse
    aunque el gate esté bajo el pliegue; el cargador no guarda un rechazo;
    región viva `empty:hidden`. Spec con SDK falso: token → listo, expiración
    → espera sin alerta, token nuevo → listo.
  - Miga: colapsa sólo con JavaScript cargado (`enhanced`), vuelve a
    colapsar al cambiar de comunidad y mueve el foco al primer ancestro al
    desplegar.
  - Pasaporte: la "victoria" (depende de que un reclamo se resuelva) nunca es
    el primer paso; en un perfil ajeno (`own={false}`) no habla en segunda
    persona; sin sellos definidos no afirma que están todos.
  - Reclamos: la guía en una celda propia a todo el ancho
    (`data-claims-tour-slot`), sin estirar la primera fila.
  - Pestañas: el degradé y el relleno sólo en teléfono.
  - Buscar: el chip de tipo activo se trae a la vista.
  - Encuestas de la cadena: el título ya no dice "que ya podés votar", porque
    la lista no cruza con los recibos.
  - Acuerdos: mientras un voto está en vuelo, las dos opciones quedan
    bloqueadas, no sólo la tocada.
  - E2E `community-directory-followups` pasa a exigir "Crear cuenta" sin
    sesión y ningún "Invitar vecinos".
  Pendientes anotados, sin aplicar: "¿Ya tenés cuenta? Ingresá" en el recuadro
  de visitante; spec del orden "encuesta destacada antes del balance"; E2E del
  carril de pestañas y de la miga a 390 px; `useChainPolls` suma una consulta
  por vista (acotada a tres filas).
  E2E tras los arreglos: `account-access`, `community-directory-followups`,
  `agreements` y `search-first-screen`: 17 de 17. `pnpm verify` de cierre: salida 0
  (198 archivos, 1455 pruebas).

- **R y R2** (09-11-2026): recuadro de visitante con "Crear cuenta" y debajo
  "¿Ya tenés cuenta? Ingresá" (`authEntryHref("/ingresar")`, vuelve a la
  comunidad); nombre del encabezado con `xl:max-w-48` y `title` con el nombre
  completo. Spec nuevo en `community-directory-followups.spec.tsx`: los dos
  enlaces apuntan a `/registro` y `/ingresar` y llevan `barrio` de vuelta;
  21 de 21. tsc 0, check-i18n 3839, ESLint limpio. Auditoría de RPCs anónimas
  sin cambios (detalle en la tarea). Commit en este mismo paso.

## Next

Push del responsable y `pnpm deploy:open` con Node 22 (`nvm use 22.22.0`; el
runner rechaza Node 24) para que las diez lleguen a Producción. Después, mirar
en el teléfono real la comunidad, la búsqueda y el perfil.
