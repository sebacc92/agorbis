---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
---

# Salida simple a Producción con `pnpm deploy:open` (D107)

## Intención

El dueño pidió reescribir D72 para salir a Producción sin tantos bloqueos.
El flujo excepcional no podía terminar: el canary stateful es plan-only y
siete controles no renunciables nunca llegaban a PASS.

## Alcance

- Sí: `scripts/simple-open-release.mjs`, `scripts/run-simple-open-release.mjs`,
  su test, `deploy:open` en `package.json`, D107, el runbook, el README y la
  regla de CLAUDE.md.
- No: la política de gates, el preflight, el build, el código de D72 (queda
  como opcional) ni los invariantes de CLAUDE.md.

## Checklist

- [x] El test del módulo pasa y mata dos mutantes (sin `origin/main`, deploy
      real en `--dry-run`). Prueba: salida.
- [x] `pnpm lint`, `pnpm test` y `pnpm test.release` pasan. Prueba: salida.
- [x] `pnpm deploy:open --dry-run` pasa build, preflight y wrangler dry-run.
      Prueba: salida.
- [x] El test queda conectado a `test.release` con el contrato de scripts
      re-baselineado, en su propio commit. Prueba: test.release.
- [ ] El dueño corre `pnpm deploy:open`, el smoke pasa y la verificación
      manual también. Prueba: salida del dueño.

## Evidencia

- 02-11-2026: `node scripts/test-simple-open-release.mjs` da PASS. Con el
  chequeo de `origin/main` anulado, exit 1; con `--strict` en lugar de
  `--dry-run`, exit 1.
- 02-11-2026: `pnpm deploy:dry-run` (build abierto sin request) bloquea con
  11 valores legales pendientes; `cloudflare-build.mjs --exceptional-request`
  compila y su preflight bloquea sólo por las atestaciones que el runner
  inyecta desde `KNOWN_NON_SECRET_ENVIRONMENT_VALUES`.

- 02-11-2026, con umask 0022 y después del último cambio: `pnpm lint`,
  `pnpm test` (1.237) y `pnpm test.release` terminan en exit 0.

- 02-11-2026, sobre `376b429`: `pnpm deploy:open --dry-run` termina en exit 0.
  El preflight dice "controles técnicos válidos (69 migraciones); riesgos
  aceptados conservan FAIL/BLOCKED_EXTERNAL/NOT_VERIFIED", y `wrangler deploy
  --dry-run` lista `AGORBIS_LAUNCH_MODE ("open")` y 1.663 assets.
- 02-11-2026: contrato de scripts v12 (`6f221d2a…`), con el test sumado a
  `test.release` y declarado en `test-exceptional-open-release-runner-policy`.
  `pnpm lint`, `pnpm test` y `pnpm test.release` en exit 0; el test de D107
  corre dentro de `test.release`.

## Siguiente

El dueño hace push, mira la CI en verde y corre `pnpm deploy:open`.
