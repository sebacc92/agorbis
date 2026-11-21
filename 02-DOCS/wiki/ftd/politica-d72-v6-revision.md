---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
---

# La política D72 pasa a v6 con revisión al 30-11-2026 (D106)

## Intención

Armar el request del dry-run excepcional con el backup como riesgo aceptado.
Los siete riesgos elegibles tenían `reviewRequiredBy` 2026-09-14, ya vencido,
y el validador rechaza todo request después de esa fecha. El dueño eligió
2026-11-30 como nueva fecha de revisión.

## Alcance

- Sí: `REVIEW_REQUIRED_BY`, versión y hash fijado de
  `scripts/release-gate-policy.mjs`, su test, D106 y las tres páginas que
  citan la política vigente (README, GO_LIVE_CHECKLIST,
  READ_ONLY_PREVIEW_TO_INTERACTIVE_RUNBOOK).
- No: gates, resultados, consecuencias, owner, waivers, controles no
  renunciables ni menciones históricas de v4/v5.

## Checklist

- [x] La política v6 calcula y fija su hash. Prueba: test de la política.
- [x] El test falla con v5 y pasa con v6. Prueba: control negativo.
- [x] Un request con los siete riesgos valida hoy y falla el 01-12-2026.
      Prueba: validador real.
- [x] `pnpm lint`, `pnpm test`, `pnpm test.release`, `test.release-open` y
      `test.canary` pasan. Prueba: salida.
- [ ] El dueño corre el dry-run con el request generado. Prueba: salida.

## Evidencia

- 01-11-2026: `node scripts/test-release-gate-policy.mjs` da PASS (34 gates;
  sha256 `59f6283b…`). Con la política de `c0cc877` el mismo test termina en
  exit 1.
- 01-11-2026: `validateExceptionalReleaseRequest` con los siete riesgos
  canónicos devuelve `[]` hoy. Con `now` 2026-12-01 devuelve siete errores de
  fecha de revisión vencida.

- 01-11-2026: la primera corrida falló sólo en
  `test-exceptional-release-cutover-policy.mjs`. Sus tres vectores dorados
  (`upload`, `open`, `closed`) derivan del hash de la política. Se
  recalcularon con el mismo acto sintético.
- 01-11-2026, después del último cambio y con umask 0022: `pnpm lint`,
  `pnpm test` (1.237), `pnpm test.release`, `pnpm test.release-open` y
  `pnpm test.canary` terminan en exit 0.

## Siguiente

El dueño corre el dry-run con el request generado sobre este commit.
