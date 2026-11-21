---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# El contenido llega a 96rem en pantallas anchas (D111)

## Intención

El dueño, con un monitor de 1920 px, veía mucho espacio vacío a los costados.

## Checklist

- [x] `--width-content` 96rem; alta, encabezado y pie a 80rem. Prueba:
      capturas locales a 1920.
- [x] Prosa de encuestas y proyectos con `measure`; explorar en 4 columnas
      desde `2xl`. Prueba: captura y e2e.
- [x] `pnpm lint`, `pnpm test` y e2e de navegación y regresiones. Prueba:
      salida.

## Evidencia

- 02-11-2026: a 1920 px el contenido va de x=216 a x=1704 (1488 px útiles)
  en `/c/mar-del-plata` y `/explorar`.
- 02-11-2026: `pnpm lint`, `pnpm test` (1.245) y 15 e2e
  (`css-navigation`, `ui-ux-regressions`, `search-navigation`) en exit 0.

## Siguiente

Nada. El dueño despliega y revisa.
