---
author: Sebastián Cardoso Castillo
branch: main
status: review
type: feature
title: Toolchain de noviembre · excepciones del audit y re-baseline de lockHash
description: Renovación de las excepciones de pnpm audit vencidas el 19-11-2026, ocho de ellas cerradas con parches, y re-baseline de lockHash de D72 con el protocolo cross-store. Sin decisión nueva (aplica D72, D75, D77 y D100).
tags: [ftd, toolchain, seguridad, d72]
timestamp: 2026-11-19T03:10:00-03:00
topic: ftd
---

# Toolchain de noviembre: excepciones del audit y re-baseline de lockHash

## Intent

El 19-11-2026 vencía la revisión de las 17 excepciones de `pnpm audit`. El
responsable pidió ver si rompían la CI, después renovarlas y, por último,
"preparar el commit de toolchain (parches del grupo B más re-baseline de D72)"
para revisarlo. No hay decisión nueva: aplica D72, D75, D77 y D100.

## Scope

Dentro: `pnpm-workspace.yaml` (overrides y excepciones), `pnpm-lock.yaml`, el
`lockHash` de `scripts/exceptional-wrangler-integrity.mjs`, los tres vectores
dorados de `scripts/test-exceptional-release-cutover-policy.mjs` y las notas
del runbook. Todos son archivos de CODEOWNERS: quedan en commits locales para
la revisión del responsable.

Fuera: Qwik, wrangler, `package.json`, vitest 4, la poda de
`typescript-plugin-css-modules` y las PRs de Dependabot.

## Checklist

- [x] Renovar al 2026-12-19 la fecha de las 17 excepciones (`145ac45`).
      Prueba: `check-audit-ignores --fail-on-expired` sale 0.
- [x] Reauditar sin excepciones. Prueba: `pnpm audit --json` sobre una copia
      del lockfile sin `audit.ignore`: 24 avisos, las 17 vigentes.
- [x] Parches de la misma versión mayor por override (`c9338a6`): svgo 4.1.0 y
      3.3.5, brace-expansion 1.1.21 y 5.0.12, shell-quote 1.11.0,
      source-map-js 1.2.2, postcss-selector-parser 7.1.6 y sharp 0.35.5 en el
      uso directo y en vite-imagetools. Prueba: `pnpm audit` baja a 11 avisos
      y `check-audit-ignores` cuenta 9 excepciones.
- [x] Gates locales sobre el árbol de `c9338a6` (Node 22.22.0): `pnpm lint` 0,
      `tsc` 0, Vitest 1550/1550, `pnpm build` 0.
- [x] Re-baseline de `lockHash` con el protocolo cross-store (`c76e5df`).
      Prueba: bloque 2 rechazado, bloque 3 calcula `14c2b110…` y closure
      `2005ed1c…` sin cambio.
- [x] Segunda corrida del protocolo sobre `c76e5df`. Prueba: el store hostil
      se rechaza por closure, el aislado pasa el gate y `pnpm test.release`
      sale 0 en ese worktree.
- [x] Revisión del responsable y push de la primera tanda (`e2f094e`,
      19-11-2026).
- [ ] CI de `e2f094e` (`verificar`, `integracion`, `release-gates`): en curso
      al escribir esto.

### Segunda tanda · poda y bumps de rutina

El responsable pidió "hace la 4, de paso actualiza los paquetes de modulos en
package.json".

- [x] Quitar `typescript-plugin-css-modules` y sus peers. Prueba: el lockfile
      no tiene `less@`, `sass@`, `stylus@`, `probe-image-size` ni
      `@parcel/watcher`; dos resoluciones seguidas dan el mismo hash.
- [x] Borrar la excepción de `probe-image-size`. Prueba:
      `check-audit-ignores` cuenta 8 y `pnpm audit` baja a 10 avisos.
- [x] Subir doce paquetes dentro de su versión mayor. Prueba: `pnpm lint` 0
      (Prettier 3.10.0 no reformatea nada), `tsc` 0, Vitest 1550/1550,
      `pnpm build` 0.
- [x] E2E local con Playwright 1.65.0. Prueba: en paralelo 302 pasan, 3
      omitidos y 5 fallan; esos 5 repetidos con `--workers=1` pasan 5/5. Son
      choques de la cuenta sembrada entre archivos, no las versiones nuevas
      (uno coincidió con un `GEOUNITY_RATE_LIMIT` en la base local).
- [x] Re-baseline de `lockHash` sobre `4f8438c` (`6e7fc70`). Prueba: el
      store aislado calcula `5b919707…` y closure `2005ed1c…` sin cambio; en
      la segunda corrida el store hostil se rechaza por closure, el aislado
      pasa el gate y `pnpm test.release` sale 0.
- [ ] Revisión del responsable, push y CI de la segunda tanda.

### Tercera tanda · Wrangler 4.160.1

El responsable pidió "arranca tu con lo que puedas y dime si necesitas algo
de mi", después de que se le propusiera empezar por wrangler.

- [x] Subir wrangler a 4.160.1 y `@cloudflare/workers-types` a 5.20261110.1,
      con la versión en los catorce archivos que la pinean (`3a5c630`).
      Prueba: `pnpm lint` 0, `tsc` 0, Vitest 1550/1550, `pnpm build` 0.
- [x] Re-pinear la identidad de Wrangler en la policy. Prueba: el store
      aislado pasa las comparaciones estructurales y los dos entrypoints
      coinciden con los pineados.
- [x] Adaptar el guard CLOSED a Miniflare beta. Prueba: con `type: "worker"`
      Miniflare responde `Unrecognized key`; sin él,
      `test-d72-closed-no-write-proof` vuelve a pasar.
- [x] Cerrar las dos excepciones de sharp y los overrides sin objeto. Prueba:
      `check-audit-ignores` cuenta 6 y `pnpm audit` baja a 8 avisos.
- [x] Re-baseline de `lockHash` y `closureHash` (`1842f5f`). Prueba: el store
      aislado calcula `4b92469b…` y closure `e44e24b5…`; en la segunda corrida
      el hostil se rechaza por closure, el aislado pasa el gate y
      `pnpm test.release` sale 0.
- [x] `pnpm deploy:open --dry-run` sobre `1842f5f`. Prueba: "Prueba completa:
      build, preflight y wrangler dry-run en PASS", con `wrangler 4.160.1`.
- [ ] Salida real de `wrangler versions upload/deploy` 4.160.1 contra los
      parsers del cutover excepcional y del canary: no ejercitada (exige
      credenciales y tocar Producción).
- [ ] Revisión del responsable, push, CI y primer `pnpm deploy:open` real con
      el Wrangler nuevo.

## Evidence

- Vencimiento: en lint un vencido es aviso; sólo `auditoria-semanal` usa
  `--fail-on-expired` (`scripts/check-audit-ignores.mjs:185`).
- `probe-image-size` 7.3.1 figura como arreglo en el advisory, pero
  `pnpm view probe-image-size time` no la lista: la excepción queda.
- Primer intento, `sharp@<0.35.5` → 0.35.5 (commit `08a88ae`, reemplazado):
  el protocolo falló con "El importer de Wrangler no coincide exactamente con
  la policy". Desde 0.35.3 sharp declara `@types/node` como peer opcional y la
  clave pasa a `wrangler@4.126.0(…)(@types/node@22.20.1)`. Se acotó el
  override para no tocar el 0.35.2 exacto de miniflare; `git diff` del
  lockfile no tiene líneas de wrangler ni de miniflare.
- Protocolo sobre `c9338a6`: `gate_hostil=1` y `gate_aislado=1` por "No
  coincide hash de pnpm-lock.yaml"; `lockHash`
  `14c2b110a1be71b1420dba51bf4ef61dc0d3e306ff411626cdbb31cdd22d2d1b`,
  `closureHash` `2005ed1c…`, `entrypointHash` `780661a5…`.
- Protocolo sobre `c76e5df`: `gate_hostil=1` por "No coincide closure runtime
  de Wrangler"; `gate_aislado=0`; `test_release=0`, última línea
  `Simple open release (D107): PASS`.
- Diferencia con la receta del runbook: los worktrees fueron
  `.worktrees/d72-protocolo-*` y no `mktemp`; los stores, nuevos y temporales.
  Los nueve worktrees se quitaron al terminar.

## Next

El responsable revisa los commits de la segunda y la tercera tanda, hace el
push, mira la CI y corre `pnpm deploy:open`: es el primer despliegue real con
Wrangler 4.160.1 y la vuelta atrás es revertir `3a5c630` y `1842f5f`. Quedan
para otra tanda: Qwik a `rc.5` (parche propio y excepción D100), vitest
(cierra cuatro excepciones) y TypeScript. Las PRs #19 y #14 de Dependabot
quedan cubiertas en lo que toca a npm; conviene cerrarlas y dejar que se
regeneren.
