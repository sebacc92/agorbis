---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Mejoras de UI/UX sobre el primer uso real: cuatro de diez (D112)

## Intención

El responsable pidió el 03-11-2026 implementar diez mejoras de UI/UX donde
hagan falta. Producción se abrió el 02-11 y está casi vacía: las primeras
personas llegan ahora, casi todas desde el teléfono. Una auditoría en navegador
real (seis lentes, 48 candidatos, lista corta de 16 verificada por reproducción,
alcance y valor) encontró fallas que `tsc`, ESLint, Vitest y los E2E no veían.

El 04-11 el responsable acotó el alcance: terminar la mejora en curso (la 4),
postergar las otras seis y cerrar sólo con los controles de cada mejora.

## Alcance

Sí, cerradas:

1. La "Zona del autor" deja de aparecerle a quien no ingresó.
2. Las opciones de una encuesta se leen aunque no se pueda votar.
3. El formulario de publicar empieza en el primer campo.
4. "Revisar" muestra la revisión y "Publicar".

Postergadas por el responsable, sin implementar:

5. Los llamados a publicar no terminan en "Se rompió algo".
6. La comunidad sin actividad muestra lo que ya se puede hacer.
7. Inicio muestra publicaciones en la primera pantalla y marca lo ya votado.
8. Encontrar la propia ciudad: sin tildes, homónimos y salida si no está.
9. "¿Dónde vivís?" ofrece opciones en lugar de afirmar un lugar.
10. Un envío nunca queda mudo y el doble toque no duplica.

No: archivos reservados de `.github/CODEOWNERS`, migraciones, dependencias,
hosts nuevos ni cambios en qué se registra. Tampoco lo que quedó para otra
ronda; la lista está en `docs/mejoras-priorizadas.md` (novena ronda).

## Checklist

Cada mejora se marca con su prueba observada, no con la intención.

- [x] 1. Zona del autor. Prueba: spec del helper y E2E anónimo sin autor.
- [x] 2. Encuestas legibles. Prueba: spec del detalle y E2E del widget a 320 y 390.
- [x] 3. Formulario en el primer campo. Prueba: E2E a 390 y 1366, un solo `h1`.
- [x] 4. Revisar. Prueba: E2E de foco y viewport en los cuatro formularios.
- [ ] 5 a 10. Postergadas por el responsable: sin implementar ni probar.
- [x] `pnpm lint`, `pnpm build.types` y `pnpm test` sobre el commit final. Prueba:
      salida.
- [ ] `pnpm test.release` sobre el commit final: no corrido. Sólo sobre `76c9ba0`.
- [ ] E2E completo en serie y revisión adversarial: no corridos, por decisión del
      responsable.

## Evidencia

- 03-11-2026: barrido de 156 vistas con `axe` y auditoría en navegador. Línea de
  base del E2E completo antes de tocar código: 242 pasan y 3 omitidas. La primera
  corrida dio 3 fallos de subidas de archivos, que eran del entorno (42P10 tras un
  `supabase db reset` con el enlace a Producción) y no del producto.
- Mejora 1, `7b231e2`: 7 casos en `src/lib/content-permissions.spec.ts` y 4 E2E
  anónimos en `e2e/detail-consistency.spec.ts`; los de encuesta, debate y proyecto
  fallaron antes del arreglo. Un proyecto pasó de 11 formularios a ninguno.
- Mejora 2, `d3f0f53`: 21 casos nuevos en `src/routes/encuestas/[id]/index.spec.tsx`
  y 10 E2E en `e2e/poll-reading.spec.ts`, 9 de ellos en rojo antes; 30 de 30 con
  `--repeat-each=3`. `axe` sobre la encuesta de una visitante a 390: 0 violaciones.
- Mejora 3, `76c9ba0`: 3 E2E en `e2e/community-directory-followups.spec.ts`. A
  390×844 el primer campo entra entero sobre la barra (antes, y=903).
  `pnpm test.release`, exit 0.
- Mejora 4, `a10ea1d` y `3928bde`: 7 E2E en `e2e/publication-review-focus.spec.ts`
  y 7 casos de `holdFocus`. Tras Revisar, `h1` en y=144 con el foco.
- `3928bde` corrige dos efectos de `a10ea1d`. Tras un filtro la región viva quedaba
  vacía: la prueba nueva falla sin el arreglo y pasa 6 de 6 con él. El aviso de
  rechazo perdía el foco: `publication-drafts.spec.ts:4` falló 1 de 6 sobre
  `7f4b0d7` y en esa línea 3 de 6 sin el arreglo; con `holdFocus` pasa 8 de 8.
- Sobre `3928bde`, con el árbol final: lint y tipos en exit 0, 1.311 pruebas en 183
  archivos y 53 E2E en serie.
- No verificado: Safari y Firefox, lector de pantalla real, teléfono real, Turnstile
  real y Producción.

## Siguiente

Nada de código. El dueño hace push, mira la CI y despliega con `pnpm deploy:open`.
