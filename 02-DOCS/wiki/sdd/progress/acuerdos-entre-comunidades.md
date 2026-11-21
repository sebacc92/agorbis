---
type: progress
title: Avance — acuerdos entre comunidades
description: Libro de avance de la implementación, tarea por tarea, con la evidencia observada. Sobrevive a una compactación o interrupción.
tags: [sdd, progress]
timestamp: 2026-11-09T02:30:00Z
topic: sdd
slug: acuerdos-entre-comunidades
---

# Avance — acuerdos entre comunidades

Plan: [../plans/acuerdos-entre-comunidades.md](../plans/acuerdos-entre-comunidades.md).
Modo: autopiloto autorizado por el responsable hasta la puerta T003, que es suya.
Base local: Supabase local reseteada con 0074 en el ledger (T003).

## T001 — Borrador de migración · hecho (2026-11-09)

- Archivo: `02-DOCS/wiki/sdd/drafts/0074_agreements.sql` (no en `supabase/`:
  todos sus directorios SQL son del responsable y los dos de borradores tienen
  inventario fijado por el preflight).
- Evidencia: `psql -v ON_ERROR_STOP=1 -f` sobre la base local → `COMMIT`;
  `select count(*) from pg_proc where proname like '%agreement%'` → 8
  (5 públicas: `propose_agreement`, `adhere_agreement`, `withdraw_agreement`,
  `agreement_state`, `community_agreements`; 3 privadas:
  `assert_agreement_parties`, `agreement_party_outcome`,
  `agreement_derived_status`).
- Decisiones tomadas al escribirlo: autora de cada ronda = quien completó la
  última adhesión (el guarda exige autor = sesión); rondas exentas de
  `enforce_content_quota`; cuota propia de 3 propuestas abiertas; `anon` sin
  ejecución sobre las RPC de escritura (rechaza antes del gate, con
  `permission denied`).

## T002 — Borrador de test SQL · hecho (2026-11-09)

- Archivo: `02-DOCS/wiki/sdd/drafts/0074_agreements_checks.sql`.
- Evidencia: 49 aserciones `ok ·` y "Acuerdos: todas las verificaciones
  pasaron", en una transacción que termina en ROLLBACK.
- Control negativo observado: con `poll_feed` sin el filtro `agreement_id is
  null`, la corrida falla en "poll_feed no lista la ronda de Mar del Plata";
  restaurado el filtro, 49 `ok` otra vez.
- Primera corrida: una aserción mía esperaba `GEOUNITY_AUTH_REQUIRED` para
  `anon` y la base rechaza antes con `permission denied` (sin EXECUTE). Se
  corrigió la expectativa, no la base.
- Suites vecinas tras aplicar el borrador: `personalized_feed_checks.sql`
  (exit 0, 12 ok) y `rls_checks.sql` (exit 0, 268 ok).

## T003 — Promoción · hecha por el agente con autorización explícita (2026-11-09)

- El responsable autorizó: "entonces si adelante con la migracion". Archivos
  movidos a `supabase/migrations/0074_agreements.sql` y
  `supabase/tests/agreements_checks.sql`; los borradores del wiki se quitaron
  para que haya una sola fuente.
- `pnpm db.reset` con la precaución de D105 (apartar `supabase/.temp/
  storage-version` y `storage-migration`, resetear, restaurar):
  `storage.migrations` queda en 64 con el contenedor v1.70.7; 8 funciones con
  "agreement" salen del ledger.
- `pnpm db.test` → exit 0, 440 aserciones `ok ·` en todas las suites,
  "Acuerdos: todas las verificaciones pasaron".
- `pnpm db.types` → `database.types.ts` +144 líneas (tablas y RPC nuevas);
  `pnpm build.types` sin errores; `pnpm db.contract` → "OK: contrato
  coherente".
- README: fila `0074_agreements.sql` en la tabla de migraciones. D118 escrita
  en `DECISIONS.md` antes del commit de la migración.

## T004 — Ayudantes puros, i18n y errores · hecho (2026-11-09)

- Archivos: `src/lib/agreements.ts` + `agreements.spec.ts`;
  `src/i18n/en/agreements.ts` registrado en `en/index.ts`;
  `agreementRaiseMessage` en `src/lib/db-error.ts` con casos en
  `db-error.spec.ts`.
- Evidencia: `vitest run src/lib/agreements.spec.ts src/lib/db-error.spec.ts`
  → 2 archivos, 25 pruebas en verde. `pnpm build.types` sin errores; ESLint
  y Prettier limpios. `check-i18n` falló una vez por "Aprobado" repetido con
  `shared.ts`: se quitó del catálogo nuevo y volvió a pasar.

## T005 y T006 — Página `/acuerdos/[id]` · hechas (2026-11-09)

- Archivos: `src/routes/acuerdos/[id]/index.tsx` (loader sobre
  `agreement_state` validado con `parseAgreementState`; acciones `useAdhere`,
  `useWithdraw`, `useVoteAgreement` sobre `adhere_agreement`,
  `withdraw_agreement` y `cast_poll_ballot`, con `invalidate` del loader);
  `agreement-page.spec.tsx`; `parseAgreementState` y tipos en
  `src/lib/agreements.ts` con spec; `routes.agreement` en `community.ts`;
  textos en `en/agreements.ts`.
- Rojo observado: el spec de la página se escribió junto con la página, así
  que el rojo lo dio `parseAgreementState` en `agreements.spec.ts` (módulo
  sin la función) antes de implementarla.
- Evidencia: `vitest run` de los dos specs → 26 pruebas en verde; `tsc`
  exit 0; `check-i18n` 3799 mensajes; ESLint limpio; `pnpm db.contract` "OK".
  E2E `e2e/agreements.spec.ts` (1 prueba, 6,8 s en el runner): visitante sin
  botones y con "Crear cuenta"; Sofía adhiere por Mar del Plata y la página
  muestra "Adhirió" una vez, "Esperando adhesión" una vez y sigue
  "Propuesto", sin ningún "Aprobado".
- Decisiones: la página no usa breadcrumb (el acuerdo no cuelga de una sola
  comunidad); las opciones Sí/No se leen de `poll_options` sólo cuando la
  base dijo `can_vote`; la autoría de la ronda no se muestra (la autora es
  quien completó la adhesión, no la proponente).

## T007 — Formulario `/c/[slug]/acuerdos/nuevo` · hecho (2026-11-09)

- Archivos: `src/routes/c/[slug]/acuerdos/nuevo/index.tsx` (loader
  `useProposeContext`: residencia obligatoria, redirige a la comunidad propia,
  candidatas del mismo país de nivel 3 a 5 sin contenerse; acción
  `useProposeAgreement` → `propose_agreement`, éxito como `published` +
  `redirectTo`), `propose-form.spec.tsx`; `filterCandidates`,
  `normalizeForSearch` y `proposeErrorMessage` en `src/lib/agreements.ts` con
  spec; `publishedContentPath` acepta `/acuerdos/` (spec ampliado).
- Evidencia: spec del formulario 3 pruebas; ayudantes y `content-publication`
  en verde; `tsc` exit 0; ESLint limpio; `check-i18n` 3819 mensajes tras
  quitar dos claves que ya existían ("Acuerdos" en `auth.ts`, "Buscar
  comunidad" en `shared.ts`). E2E: Sofía entra por "Proponer un acuerdo" en
  Encuestas, busca "tand", marca Tandil, envía y llega a `/acuerdos/<uuid>/`
  en "Propuesto, esperando adhesión" con las dos comunidades esperando; el
  acuerdo aparece después en la sección.
- Tropiezos: `window is not defined` en el spec por las tareas de `useDraft`
  (se simula una ventana inerte, como en `DebateDraft.spec`); `getByLabel("Buscar
  comunidad")` coincidía también con el buscador del encabezado (coincidencia
  exacta).
- Decisión: no se usa `FormShell` porque exige un `ContentType` y un resumen
  de cupo que los acuerdos no tienen; se reutilizan `CharCounter`,
  `DraftStatusBar`, `PublicationError`, `PublishedNotice` y `useDraft`.

## T008 — Sección "Acuerdos" en Encuestas y redirección · hecho (2026-11-09)

- Archivos: `src/components/agreements/AgreementsSection.tsx` + spec; loader
  `useCommunityAgreements` en `src/routes/c/[slug]/encuestas/index.tsx` con
  `orFallback` sobre `community_agreements` (límite 10, estados desconocidos
  se descartan); `/encuestas/[id]` redirige 302 a `/acuerdos/[id]` cuando la
  encuesta tiene `agreement_id`.
- Evidencia: spec de la sección 4 pruebas (lista con estados y adhesiones,
  invitación a proponer, nada sin datos ni permiso, visitante sin botón); E2E
  de arriba la ve con el acuerdo recién propuesto. La redirección queda
  cubierta por el test SQL (la ronda no se lista) y pendiente de E2E en T011.

## T009 — Tarjeta de acuerdo en el inicio · hecho (2026-11-09, `60c71d8`)

- Archivos: `src/lib/personalized-feed.ts` (`FeedKind = ContentType |
  "agreement"`, filtro `tipo=agreement`), `src/routes/inicio/index.tsx`
  (`META.agreement`, pestaña "Acuerdos", enlace a `/acuerdos/[id]`, badge con
  `agreementStatusLabel` sólo si `isAgreementStatus`, línea "N comunidades
  adhirieron"), `inicio-first-screen.spec.tsx` (+3), `fictional-content.spec`
  (+1 patrón: "acuerdo firmado/vigente/en vigor"), `en/agreements.ts`.
- Evidencia: spec del inicio 15 pruebas en verde; `fictional-content` y
  `personalized-feed` en verde (49 pruebas en los 3 archivos); `tsc` exit 0;
  ESLint limpio; `check-i18n` 3822 mensajes.
- Decisión: un acuerdo no entra en `ContentType` (seis `Record<ContentType,…>`
  en la app, cuota mensual y rutas bajo la comunidad no aplican); el feed usa
  un `FeedKind` propio. El feed no entrega `closes_at`, así que la tarjeta dice
  "En votación" sin fecha; la fecha está en la página del acuerdo.
- Tropiezo: "Acuerdo" ya existía en el catálogo de la página; el duplicado lo
  frenó `tsc` (TS1117) antes que `check-i18n`.

## T010 — Manual, D118 completa y documentación · hecho (2026-11-09)

- Archivos: `src/routes/manual/index.tsx` (quinta herramienta "Acuerdos",
  "Cinco formas de participar", dos preguntas frecuentes, nota del feed),
  `src/i18n/en/manual.ts`, `DECISIONS.md` (estado y pruebas de D118),
  `docs/mejoras-priorizadas.md` (entrada fuera de ronda), este libro e
  `index.md`. README: la fila de `0074` ya estaba desde T003.
- Evidencia: `check-i18n` 3828 mensajes; `check-legal` versiones y hashes
  coinciden; `fictional-content.spec` en verde con el manual nuevo (el manual
  no usa "firmado" ni "vigente").
- Decisión: la clave de `localStorage` del borrador reutiliza el prefijo
  `agorbis:draft:` ya clasificado en `local-data.ts`; no hace falta entrada
  nueva.

## T011 — E2E completo · hecho (2026-11-09, `a54e7b8`)

- Archivo: `e2e/agreements.spec.ts`, 4 pruebas. Nuevas: (3) Flor completa la
  adhesión desde la página, la base abre las dos rondas y la página pasa a
  "En votación hasta el …"; vota "Sí" y queda "Ya votaste" sin opciones ni
  "Aprobado"; `/encuestas/<ronda de Tandil>/` redirige a `/acuerdos/<id>/`;
  `/inicio?tipo=agreement` muestra la tarjeta con "En votación", "2
  comunidades adhirieron" y sin "Participar del voto". (4) Fixture aprobada:
  recorre `propose_agreement` y `adhere_agreement` como cada persona (claims
  de sesión en psql, como el test SQL) y después, como dueña, cierre pasado y
  tallies 5/1 con 6 participantes en cada ronda; la página dice "Aprobado",
  dos veces "Aprobó · 6 participantes" y nunca "12 participantes"; la
  sección de Encuestas la lista con "Aprobado".
- Evidencia: `pnpm test.e2e e2e/agreements.spec.ts` 4 passed (1.5 min),
  Node 22.22.0, Supabase local.
- Tropiezo: la función temporal `pg_temp.as_user` necesita `grant execute …
  to authenticated` porque la sesión cambia de rol antes de volver a llamarla
  (igual que en `agreements_checks.sql`).

## T012 — Revisores D113 y verificación · hecho (2026-11-09, `6a3bff1`)

- Revisores de sólo lectura, en paralelo: `ecc:code-reviewer`,
  `ecc:typescript-reviewer`, `ecc:silent-failure-hunter` y
  `ecc:database-reviewer`. Tres se cayeron por un corte de red y se
  relanzaron sobre el código ya corregido por el cuarto. Ningún crítico.
- Altos corregidos: (a) la última adherente era autora de todas las rondas y
  la policy de encuestas le dejaba cerrarlas o removerlas por la API, un veto
  unilateral; trigger `aa_agreement_round_lock` reservado a moderación, el
  resultado por comunidad mira el estado de la ronda y `can_vote` exige
  ronda activa. (b) `can_withdraw` daba `null` con la cuenta de quien propuso
  borrada y la página respondía 500 a cualquier sesión; `is not distinct
  from`. (c) La aserción E2E de "ningún conteo" coincidía con textos fijos
  ("Tu voto es secreto", "cinco participantes"); ahora busca un número
  seguido de la palabra. (d) Un fallo de `community_agreements` se mostraba
  como "Todavía no hay acuerdos acá"; ahora la sección lo dice.
- Medios corregidos: `quota_remaining` no cuenta rondas; la sobrecarga de
  cuatro argumentos de `personalized_feed` delega en la de seis; ACL
  revocadas antes de conceder lectura; una parte sin ronda deriva "voting",
  nunca "approved"; `withdraw_agreement` y `can_withdraw` niegan a los 30
  días; vencidas fuera del inicio; índices de FK; salida temprana de cuota
  que exige la parte; `publicationResult` en proponer (POST/redirect/GET sin
  JavaScript y `?publicado=1` con aviso a la proponente); rechazos y
  "Sí"/"No" traducidos; avisos de éxito tras adherir, retirar y votar;
  `logFailure` en todo rechazo inesperado; candidatas truncadas avisadas;
  `UNKNOWN_COMMUNITY` con mensaje; `.max(5)` en zod; bucle de redirección
  evitado; `FeedKind` derivado de una tupla; rondas excluidas de perfil,
  actividad reciente, destacada de la comunidad, encuestas de la cadena,
  conteo de la pestaña, vincular y relaciones.
- Evidencia: SQL 62 `ok ·` y 17 suites con salida 0 tras `db.reset`; E2E 4/4;
  Vitest 194 archivos / 1434 pruebas; tsc 0; check-i18n 3841; `pnpm lint`
  y `pnpm test` en verde. `pnpm test.release` FAIL en el auditor D72 de
  Supabase: pinea la candidata 0062–0073 y el repo tiene 0074 (comprobado
  apartando el test SQL nuevo: falla igual). Re-baseline del responsable.
- Registro: `02-DOCS/wiki/sdd/verifications/acuerdos-entre-comunidades-2026-11-09.md`.
- Diferido con nota: la búsqueda global (0062) lista cada ronda como encuesta
  (el enlace redirige al acuerdo). Decisiones del responsable: moderación y
  estado `removed` de acuerdos; `proposer_id`/`adhered_by` legibles por
  anon; mudanza de residencia entre partes; qué exporta `perfil/datos`.

## Re-baseline de la candidata D72 a 0062–0074 · hecho (2026-11-09)

- El responsable hizo el push a `main` y `supabase db push` de 0074, y
  autorizó el re-baseline ("o lo puedes hacer tu"). Se siguió el patrón del
  commit `582fac0` (0073): `production-preflight-policy.mjs`
  (`AGREEMENTS_MIGRATION_FILES` en la candidata, 71 ids),
  `d72-supabase-readonly-policy.mjs` (estado `agorbis-d72-candidate-0062-0074/v1`,
  hash fijado de `agreements_checks.sql` y su aporte a las puertas de voto
  secreto, RLS y anti-abuso), `supabase-backup.mjs` (`post-0074`, `post-0073`
  pasa a validar por prefijo), sus tres tests y las notas del runbook y la
  checklist de salida.
- Evidencia: `test-preflight`, `test-backup-tools`,
  `test-d72-supabase-readonly-policy` y `test-run-d72-supabase-readonly` con
  salida 0; `pnpm verify` completo en la re-verificación del registro.
- Tropiezo: el chequeo de ledger mutado del test de backups tenía que mutar el
  inventario completo (0074), no el anterior, para que la entrada 0074 exista.

## Siguiente

Del responsable: push de este commit de release, confirmar en el Dashboard o
por `supabase migration list` que Producción tiene 71 migraciones con cabeza
0074, y las decisiones diferidas (moderación de acuerdos, visibilidad de
`proposer_id`/`adhered_by`, mudanza entre partes, exportación). Del agente, si
se pide: filtro de rondas en la búsqueda global y moderación de acuerdos.
