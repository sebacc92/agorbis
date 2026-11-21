---
author: Sebastián Cardoso Castillo
branch: donaciones
status: done
merged: 2026-11-20
merged_by: Sebastián Cardoso Castillo
---

# Apoyar: donaciones por enlace externo (D128)

## Intención

El dueño quiere un primer ingreso para sostener Agorbis sin cobrarle a nadie
por participar. Se descartaron publicidad, venta de datos, topes pagos y
planes privados. Queda la donación voluntaria, por un enlace que sale de la
app.

## Alcance

- Sí: página `/apoyar`, enlace "Apoyar" en el pie, regla del enlace en
  `src/lib/support.ts`, pregunta en `/manual`, traducciones, D128, README.
- Sí: el enlace nace apagado (`DONATION_URL` vacía) hasta que el dueño cree
  la cuenta de Cafecito.
- No: cobro dentro de la app, registro de quién donó, insignias, metas,
  contadores, aportes recurrentes gestionados por Agorbis.
- No: CSP, `/subencargados`, Privacidad ni Términos. El navegador sólo
  contacta al proveedor con un clic de la persona (D76 no aplica).
- No: bloque de costos con números. Se suma cuando el dueño pase los reales
  (D74: nada de cifras inventadas).

## Checklist

- [x] `donationLink` sólo acepta `https://cafecito.app/<usuario>` sin
      parámetros. Prueba: `support.spec.ts`.
- [x] La página muestra el botón sólo con enlace válido, y sale sin referrer.
      Prueba: `SupportContent.spec.tsx`.
- [x] El pie muestra "Apoyar" sólo con enlace válido. Prueba:
      `supportFooterLinks` en `support.spec.ts`.
- [x] Textos traducidos. Prueba: `check-i18n` dentro de lint.
- [x] `/manual`, D128 y README. Prueba: lectura del diff.
- [x] Lint, tests y tipos. Prueba: salida.
- [ ] Ver `/apoyar` en un navegador. No se hizo: no se levantó la app.
- [ ] El dueño carga `DONATION_URL` cuando tenga la cuenta de Cafecito.

## Evidencia

- 20-11-2026: los dos specs fallaban antes de implementar (módulos
  inexistentes) y pasan después: `support.spec.ts` 16, `SupportContent.spec.tsx`
  4, `fictional-content.spec.ts` 32.
- 20-11-2026: lint en exit 0. La primera corrida falló por `"Apoyar"` repetida
  en el catálogo inglés (ya vivía en `civic-improvements.ts`); se quitó de
  `support.ts`.
- 20-11-2026: `tsc --noEmit` en exit 0 y la suite completa en exit 0 (211
  archivos, 1.582 tests).
- Los controles se corrieron con `npm run -s`, no con `pnpm`: `node_modules`
  es un enlace al de la carpeta principal y `pnpm exec` intenta reinstalar.

## Siguiente
Fusionado en main el 2026-11-20 (9c05f23).
