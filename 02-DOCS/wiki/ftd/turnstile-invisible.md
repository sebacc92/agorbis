---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
---

# Turnstile A en modo invisible (D109)

## Intención

El dueño pidió que Turnstile no se vea en los formularios. Cloudflare exige
que la política de privacidad cite su Turnstile Privacy Addendum antes de
usar el modo invisible.

## Alcance

- Sí: Privacidad 2026-11-02.1, migración 0073, chequeos legales y de
  migraciones, `TurnstileGate`, tests, D109 y el modo del widget A.
- No: Términos, Normas, el Aviso de transferencias, el widget B ni el
  servidor de validación.

## Checklist

- [x] Privacidad cita el anexo en ES y EN, con versión y hash en 0073.
      Prueba: `check-legal` y `legal.spec.ts`.
- [x] El chequeo del acta del 29-08 acepta sólo esta versión posterior.
      Prueba: falla si 0073 no retira el hash o si se pierde un texto honesto.
- [x] El preflight y los tests de migraciones conocen 0073. Prueba: tests.
- [x] `db.reset` + `db.test` local, `lint`, `test`, `test.release` y e2e del
      registro. Prueba: salida.
- [ ] Producción: `db push` de 0073, `deploy:open` y widget A en invisible.
      Prueba: `migration list`, `/privacidad` y GET del widget.

## Evidencia

- 02-11-2026: URL del anexo confirmada en
  developers.cloudflare.com/turnstile/concepts/widget/ ("Invisible mode") y
  www.cloudflare.com/turnstile-privacy-policy/ (HTTP 200, "Turnstile Privacy
  Addendum").
- 02-11-2026: el widget A se puso en invisible y se volvió a managed a los
  pocos segundos, antes de este cambio, por la condición del anexo.

- 02-11-2026: `db.reset` aplica 0073 en local y `db.test` pasa (582 ok,
  incluida "documentos y aviso de transferencias tienen versiones y hashes
  canónicos" con la versión nueva vigente y 2026-08-29.1 retirada).
- 02-11-2026: el chequeo del acta falla si 0073 no retira el hash exacto o si
  la versión nueva pierde un texto honesto; restaurado, pasa.
- 02-11-2026, después del último cambio: `pnpm lint`, `pnpm test` (1.243),
  `pnpm test.release` y 7 e2e (registro y alta) en exit 0.
- Inventarios que dependen de 0073: preflight (70 migraciones), backup
  (`post-0073`, `post-0072` por prefijo), auditor D72 (`0062-0073`) y el hash
  fijado de `rls_checks.sql`.

## Siguiente

El dueño aplica 0073 en Producción (dry-run, push), corre `pnpm deploy:open`
y el agente pasa el widget A a invisible.
