---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
type: feature
title: Cuarta ronda de diseño (noviembre 2026)
description: D126, diez mejoras sobre las pantallas que D123-D125 no alcanzaron (búsqueda, mapa, herramientas de comunidad, detalles de reclamo, proyecto y debate, perfil público) y HTML válido en los botones que tiraban el servidor de desarrollo.
tags: [ftd, ui-ux, diseño]
timestamp: 2026-11-12T22:20:00-03:00
topic: ftd
---

# Cuarta ronda de diseño

## Intent

El 12-11-2026 el responsable pidió "Implementa 10 mejoras de diseño y cuando
termines no corras test ni nada", y después "al final quiero un solo
commit". El diagnóstico se hizo sobre las pantallas que las tres rondas
anteriores no tocaron, con capturas locales (`pnpm dev` con el seed, sin
sesión, 1280 y 390 px) y nueve auditores de sólo lectura, uno por área.
Decisión: D126.

Hallazgo previo: el servidor de desarrollo se cae (Qwik `Q12 SsrError(tag)`)
al dibujar `/u/[id]`, `/debates/[id]` y la pestaña Resumen de `/perfil` con
sellos, porque hay bloques (`div`, `h*`, `p`) dentro de `<button>`. Un
escaneo estático encontró 29 casos en 7 archivos. El build de producción no
hace esa validación, por eso la CI nunca lo vio.

## Scope

Dentro: presentación de las pantallas elegidas en D126, con los primitivos
del sistema (`Icon`, `Chip`, `Card`, `Badge`, `Alert`, `EmptyState`,
`CONTENT_KIND_TONES`, categorías con `icon`) y HTML válido en botones y
etiquetas. Fuera: permisos, D68, D74, textos legales, CSP, `localStorage`,
la lógica de formularios, votos, filtros y loaders, y los archivos de
`.github/CODEOWNERS`.

Hasta el commit no se corrió nada, por pedido del responsable: la prueba de
cada mejora fue estática (revisión por lectura y chequeos con grep). Cuando
pidió "commitea y deploya", se corrieron en local los gates que exige el
deploy (ver la última casilla).

## Checklist

- [x] Cimientos: `Chip` suma `name`/`value` con `aria-pressed` para los
      filtros que envían un formulario GET y reenvía `onClick$` en el enlace
      (el router lo corre antes de navegar); `Icon` suma 18 trazos. Prueba:
      unión y `PATHS` con los mismos 75 nombres; ningún llamador previo pasa
      `name`; `Chip.spec.tsx` suma el caso del chip submit.
- [x] 1. Búsqueda: resultados con el color y el ícono de su tipo, estados
      traducidos ("Propuesta", no "proposal"), "1 apoyo", filtros con el
      chip único, temas e historial en un lugar fijo, marca que no parte
      palabras y extracto cerca de la coincidencia (`excerptAround`, con
      spec). Prueba: dos revisores por lectura (4 menores) y 4 arreglos.
- [x] 2. Mapa barrial: chip único y una sola fila de categorías, cabecera
      sin insignia ni emojis y alineada con las otras herramientas, leyenda
      que explica los colores, HTML válido en la lista. Prueba: 4 menores y
      5 arreglos; el spec del estado de error simula `getBoundingClientRect`
      porque `Alert` mide su posición al montarse.
- [x] 3. Herramientas de comunidad: rendición, victorias e instituciones con
      cabecera de listado, métricas de una sola anatomía (`MetricTile`, con
      spec), categorías con ícono y plurales correctos. Prueba: 3 menores y
      3 arreglos; `rendicion.spec.tsx` nuevo.
- [x] 4. Etapas de reclamos y proyectos con una sola anatomía
      (`StageStepper`), el color del tipo, íconos propios, sin huérfanas en
      el teléfono y con guion automático en columnas angostas. Prueba: 2
      menores y 4 arreglos; specs de las dos líneas actualizados.
- [x] 5. Detalle de reclamo sin emojis: seguimiento con ilustración y chip
      único, reloj y difusión con íconos, "Vence el…" mientras falta, barra
      fija coherente y favorito con etiqueta cuando va solo. Prueba: 5
      menores, 6 arreglos y 2 rechazos fundados.
- [x] 6. Detalle de proyecto: la aclaración del aporte como nota (mismo
      texto), aportes no monetarios con su vacío y estado en palabras,
      habilidades largas fuera de la píldora, impresión con ícono y enlace
      al afiche. Prueba: 3 menores y 5 arreglos.
- [x] 7. Detalle de debate: citas con HTML válido y chip único, cabecera
      con tres insignias y "Comentar desde…" como acción principal; el
      Manual lo dice así. Prueba: 1 mayor y 5 menores, 7 arreglos.
- [x] 8. Perfil público con banda de identidad y tipos de contenido;
      pasaporte con HTML válido y sellos con ícono. Prueba: sin hallazgos
      más que un detalle; las pestañas del perfil propio ganan su inglés.
- [x] 9. Controles globales: Accesibilidad con ícono propio, interruptores y
      HTML válido; paleta de comandos con íconos y tipo de resultado; la
      opción de encuesta y el asistente del presupuesto sin bloques dentro;
      la sección activa de "Más" como pestaña del carril. Prueba: 3 menores
      y 4 arreglos; el pie gana el inglés de tres enlaces.
- [x] 10. Bandeja de notificaciones con ícono y color por tipo, punto de no
      leída fuera del nombre accesible y el chip único en los filtros.
      Prueba: 1 mayor (el punto se desacomodaba) arreglado.
- [x] Integración: diez catálogos registrados en `src/i18n/en/index.ts`;
      47 claves viejas borradas tras comprobar que el literal no aparece en
      `src` ni en `e2e`; trinquete alineado (69 usos crudos menos);
      revisión de interacciones con tres lentes y 10 arreglos. Prueba:
      escaneo de anidamiento 0 de 29, trinquete 0 suben y 0 bajan, catálogo
      con 3902 claves y ninguna repetida.
- [x] Gates locales antes del deploy (13-11-2026, Node 22.22.0): `pnpm fmt`
      (reformateó 4 archivos), `tsc` 0, `pnpm lint` 0 (i18n 3902 mensajes,
      2416 usos), Vitest 206 archivos y 1544/1544, `pnpm test.release` PASS
      (incluido D107). Cinco aserciones nuevas pasaron de `toBeNull()` a
      `toBeFalsy()`: en el DOM de prueba `querySelector` devuelve
      `undefined` cuando no encuentra nada, y `toBeFalsy()` es la convención
      del repo (60 usos).
- [ ] Build y Playwright: el build lo hace `pnpm deploy:open` antes de subir
      (y frena si falla); los E2E, la CI de `main` después del push.

## Evidence

- Diagnóstico (12-11-2026): 9 auditores, 51 candidatas con evidencia por
  captura y archivo:línea. Capturas y reportes en el scratchpad de la
  sesión `a7183fd6` (se pierden al reiniciar).
- Implementación: 11 implementadores sobre archivos disjuntos, 22
  revisores por lectura y 9 arregladores. Ninguna aserción se borró ni se
  debilitó; los E2E que cambiaron lo hicieron sólo en la cadena buscada
  (por ejemplo, "Preferencias de accesibilidad" en minúscula).
- Integración (13-11-2026): un bloqueante encontrado y corregido antes del
  commit (el spec del mapa iba a fallar en la CI).
- D59 se respeta: una comunidad sin partida no muestra la pestaña de
  Presupuesto, ni siquiera mientras se está en `/presupuesto`. La mejora 9
  había propuesto marcarla ahí; se revirtió porque cambia una garantía
  escrita y eso lo decide el responsable con su `Dn`.
- Sin evidencia en navegador: después de los cambios no hubo capturas, dev
  ni E2E.
- Primer `pnpm deploy:open` (13-11-2026): frenó en el build, antes de subir
  nada. "useVote cuenta antes de validar" importa la ruta entera de la
  encuesta y en frío tarda unos 5,2 s, apenas más que el límite de 5 s de
  Vitest. Ese caso y su vecino tienen ahora 30 s; la aserción no cambia.

## Next

El responsable hace push y abre Producción con `pnpm deploy:open` (Node
22, `ACEPTO` por terminal, D107); después mira la CI de `main`. Si un E2E
falla, se ajusta el selector sin debilitar la aserción. Pendientes de decisión:
la pestaña de Presupuesto sin partida (D59). Para otra ronda: la lista de
D126 y `docs/mejoras-priorizadas.md`.
