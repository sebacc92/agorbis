---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# El auditor D72 de Supabase corre desde una red sin IPv6 (D105)

## Intención

`pnpm audit:supabase:d72:readonly` termina en `MIGRATION_EVIDENCE_FAILED`
porque la CLI no tiene IPv6 para la conexión directa del plan Free y el enlace
local apunta al proyecto anterior. El dueño autorizó cambiar la precondición
para desplegar más fácil.

## Alcance

- Sí: la precondición del catálogo D72, D105 y la nota del runbook.
- No: las consultas del auditor, los validadores, los hashes ni el código del
  runner.

## Checklist

- [x] El catálogo declara `supabase.linked-project-absent-or-production`.
      Prueba: test del catálogo.
- [x] `pnpm lint`, `pnpm test` y `pnpm test.release` pasan. Prueba: salida.
- [x] El dueño enlaza Producción y el auditor pasa la etapa de migraciones.
      Prueba: salida del dueño.

## Evidencia

- 01-11-2026: con los mismos argumentos del runner, `supabase migration list`
  y `db push --dry-run` responden `LegacyDbConfigIpv6Error`. La máquina no
  tiene ninguna dirección IPv6 global, y `db.ibtvlvpxwourrxwcrfkf.supabase.co`
  sólo resuelve a IPv6. `supabase/.temp/project-ref` decía
  `efdttehnzuuuctnrgfmj`.

- 01-11-2026: `pnpm lint`, `pnpm test` (1.237) y `pnpm test.release` pasan
  con umask 0022. Incluye el test del catálogo NON_WAIVABLE 27/27.

- 01-11-2026, dueño: `supabase link --project-ref ibtvlvpxwourrxwcrfkf` sin
  errores; `supabase/.temp/project-ref` pasa a Producción y `pooler-url` queda
  escrito.
- 02-11-2026, dueño, contraseña DB recién reseteada: `node
  scripts/run-d72-supabase-readonly.mjs` termina en `COMPLETED`, exit 0, en
  unos 2 minutos, sobre `8a6894a`. Los 6 gates en PASS:
  `database.expected-migrations-only` (0072 local y remoto, ledger
  `3938acfb…` igual en los dos, 0 pendientes), `data.integrity-no-corruption`,
  `security.rls-enforced` (55 tablas), `authorization.residency-write-boundary`,
  `privacy.no-individual-ballots` y `security.anti-abuse-limits`. Arnés local
  17/17. Recibo `contentSha256` `71850f71…`.
- Sin explicar: dos corridas previas por `pnpm audit:supabase:d72:readonly`
  terminaron después de la contraseña sin JSON, sin `ELIFECYCLE` y sin
  ejecutar el `echo` siguiente, que es la firma de un SIGINT. La corrida que
  pasó fue con `node` directo bajo `strace` (sólo señales) y no registró
  ninguna señal fuera de `SIGCHLD`. Una prueba propia con contraseña vacía en
  una pseudo-TTY sí imprime el JSON, `ELIFECYCLE` y el exit. Si
  `prepare-canary` vuelve a cortarse así, se rastrea con el mismo `strace`.

## Siguiente

Nada. Tarea cerrada.
