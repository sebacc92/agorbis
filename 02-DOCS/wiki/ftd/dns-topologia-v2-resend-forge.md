---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Topología DNS no web v2 por Resend Forge (D104)

## Intención

La auditoría DNS GET-only del 01-11-2026 bloqueó porque Resend, al pasar a
Forge, reemplazó el MX y el SPF de `send.agorbis.com` por los CNAME `send` y
`rsend` y un TXT de verificación. El dueño aprobó fijar la zona real como
línea de base v2.

## Alcance

- Sí: constantes de `scripts/cloudflare-dns-audit.mjs`, su test, D104, la nota
  del runbook y la sección "Resend y DNS" de `docs/CLOUD_CONFIGURATION.md`.
- No: la clasificación web, el gate, los waivers, la zona y los textos legales.

## Checklist

- [x] Las constantes v2 salen de la auditoría real. Prueba: el hash
      recalculado desde la instantánea coincide con el manifiesto.
- [x] La instantánea real se aprueba con v2, y con el MX de v1 agregado falla.
      Prueba: clasificación local.
- [x] El test fija v2 y las mutaciones Forge mueven el hash. Prueba: test, que
      además falla contra v1.
- [x] `pnpm lint`, `pnpm test` y `pnpm test.release` pasan. Prueba: salida.
- [x] El dueño corre la auditoría con un token nuevo y da PASS v2. Prueba:
      salida del dueño.

## Evidencia

- 01-11-2026: `classifyAgorbisDns` sobre `dns-before.json` (SHA `01333a58…`)
  da `e7f8e3d4…`, 12 registros, CNAME 5 · MX 2 · TXT 5, y dkim 4 · dmarc 1 ·
  mx 2 · spf 1. Coincide con `dns-audit-manifest.json`.
- 01-11-2026: con las constantes v2, la instantánea real da `approved: true`
  sin errores. Con un MX `send` de v1 agregado da 4 errores (control
  negativo).
- 01-11-2026: `scripts/test-cloudflare-dns-audit.mjs` pasa con v2 y falla
  contra las constantes v1. Cada mutación del bucle de topología tiene que
  mover el hash no web: antes sólo exigía "no aprobado", que el fixture
  ficticio cumple siempre.
- 01-11-2026: `test-d72-non-stateful-composite-collector.mjs` fija el literal
  de la salida canónica, que pasa de "Registros: 13" a "Registros: 14".
- 01-11-2026: `pnpm lint`, `pnpm test` (1.237) y `pnpm test.release` pasan
  con umask 0022, después del último cambio.

- 01-11-2026, dueño, token DNS:Read nuevo: `Auditoría DNS: PASS
  (cloudflare-custom-domains; agorbis-non-web-dns-topology/2026-11-01/v2;
  non-web SHA-256 e7f8e3d4…)`, 14 registros, instantánea `16efec65…`.

## Siguiente

Nada. Tarea cerrada.
