---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Inicio con publicaciones a la vista (mejora 7 de D112)

## Intención

`/inicio` es la primera pantalla de quien ya eligió residencia. La auditoría
del 03-11-2026 a 390 px anotó tres fallas:

1. **La primera publicación quedaba en y≈1151.** Antes de la lista hay una
   cabecera con párrafo, los chips de la cadena, el bloque "Tu comunidad
   principal" con cuatro tarjetas y la invitación por WhatsApp, y los chips de
   tipo. Hacen falta casi dos pantallas de teléfono para ver lo publicado.
2. **Un chip no mostraba su resultado.** Al tocar un filtro de comunidad o de
   tipo, lo único que cambia en la primera pantalla es el color del chip; la
   lista filtrada está fuera de la vista y nada dice qué se está mostrando.
3. **Lo votado seguía diciendo "Participar del voto".** La tarjeta de una
   encuesta abierta siempre ofrece participar, aunque la persona ya haya
   votado. D112 definió cómo marcarlo: con los recibos de participación y los
   apoyos propios, que RLS ya deja leer a cada persona sobre sí misma, sin
   guardar ni revelar la elección (D68).

## Alcance

Sí:

- Cabecera compacta en el teléfono: el bloque de la comunidad principal pasa a
  una franja con el nombre, "Ver panel" y las cuatro acciones en una sola fila;
  la invitación por WhatsApp va a la columna lateral (desktop) o debajo de la
  lista (teléfono). El párrafo de la cabecera y la etiqueta "Filtrar:" se van.
- Una línea de resultado encima de la lista cuando hay filtros: qué comunidad
  y qué tipo se muestran, con "Quitar filtros". Con `role="status"`.
- El loader lee, para la página mostrada, los recibos propios de encuestas y
  los apoyos propios de reclamos. Una encuesta abierta con recibo dice "Ya
  votaste ✓" y "Ver encuesta"; un reclamo apoyado dice "Apoyaste ✓". Si la
  lectura falla, no se afirma nada: las encuestas abiertas dicen "Ver encuesta"
  y no hay marcas. Un helper puro en `src/lib/feed-marks.ts` decide.
- Catálogo inglés, manual si cambia algo visible, D117,
  `docs/mejoras-priorizadas.md`.

No: migraciones, cambios en la RPC `personalized_feed`, conteos durante la
ronda, hosts nuevos, archivos de `CODEOWNERS`.

## Checklist

- [x] Helper `feed-marks.ts` con spec: llamado de una encuesta según estado y
      recibo (cerrada, votada, abierta, desconocido), ids por tipo y `ownIds`
      que degrada a `null` con log. Prueba: `vitest run` del spec.
- [x] Loader con recibos y apoyos propios, degradando a "desconocido" con
      `ownIds` (no `orFallback`: su valor por defecto no admite `null`, y acá
      "no leído" tiene que distinguirse de "leído y vacío"). Prueba: spec de
      componente con una encuesta votada, una sin votar, lectura fallida y un
      reclamo apoyado.
- [x] Cabecera compacta: primera tarjeta dentro de la primera pantalla a
      390×844. Prueba: E2E con `boundingBox()` de la primera tarjeta
      (`y < 760`, en pantalla, sin desborde).
- [x] Línea de resultado al filtrar. Prueba: spec de componente y E2E al tocar
      el chip de Argentina (región viva siempre presente, vacía sin filtros).
- [x] Revisores D113 (`code-reviewer`, `typescript-reviewer`,
      `silent-failure-hunter`): aprobados sin CRITICAL ni HIGH; 2+1+2 medias
      y varias bajas, aplicadas (región viva persistente con el enlace afuera,
      `aria-label` de las acciones, "✓" oculto, log del 500 de la RPC,
      `requestId` en los logs, `try/catch` en `ownIds`, guardia de `kind`,
      traducción de "Todas las publicaciones", caso cerrado en el spec, fechas
      de la fixture). Descartadas con motivo: `aria-current="true"` y aviso
      visible de marcas no leídas.
- [x] `pnpm verify`, `pnpm build.types`, E2E de inicio y vecinos.
- [x] D117, `docs/mejoras-priorizadas.md`, catálogo inglés, manual (ES y EN),
      registro de verificación, índice.

## Evidencia

- `pnpm exec vitest run src/lib/feed-marks.spec.ts src/routes/inicio/inicio-first-screen.spec.tsx src/design-system-ratchet.spec.ts`
  → tras aplicar las revisiones, `Test Files 3 passed (3)`, `Tests 26 passed
  (26)` (antes de implementar, el spec del helper falló con "Cannot find module
  ./feed-marks": rojo observado).
- Primera corrida del E2E: falló en el reclamo apoyado del seed, tapado por los
  treinta reclamos que `personalized-feed.spec.ts` siembra en paralelo. La
  prueba pasó a sembrar sus propios reclamos con fecha posterior.
- `pnpm build.types` → sin errores. `node scripts/check-i18n.mjs` → 3746
  mensajes, 2368 usos verificados. `prettier --check .` limpio. ESLint sobre los archivos tocados → limpio.
- Trinquete de D96: `src/routes/inicio/index.tsx` sale de la lista de colores
  crudos (tenía 4, ahora 0) y el spec del trinquete pasa.
- Segunda corrida del E2E: la spec vecina falló porque mis reclamos (2092)
  desplazaron dos de sus treinta (2090) en Mar del Plata. Los reclamos de la
  prueba pasaron a la provincia (`buenos-aires`), también en la cadena.
- `pnpm test.e2e e2e/feed-first-screen.spec.ts e2e/personalized-feed.spec.ts e2e/ui-ux-regressions.spec.ts`
  → 11 de 11 en 1,2 min.
- `pnpm verify` → PASS, salida 0. `pnpm exec vitest run` → 190 archivos, 1389
  pruebas (1366 antes).
- Registro: `02-DOCS/wiki/sdd/verifications/inicio-con-publicaciones-a-la-vista-2026-11-08.md`
  (PASS).

## Next

Commit en `main` (D117). De D112 quedan la 8 y la 9, que esperan la migración de localidades del responsable.
