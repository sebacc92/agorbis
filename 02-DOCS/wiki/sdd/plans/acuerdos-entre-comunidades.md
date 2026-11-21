---
type: plan
title: Plan — Acuerdos entre comunidades
description: Plan de estructura para los acuerdos votados por una o varias comunidades — componentes, contratos, datos, pruebas, orden y riesgos.
tags: [sdd, plan, comunidades, voto]
timestamp: 2026-11-09T00:30:00Z
topic: sdd
slug: acuerdos-entre-comunidades
status: draft
---

# Plan — Acuerdos entre comunidades

> Spec: [../specs/acuerdos-entre-comunidades.md](../specs/acuerdos-entre-comunidades.md)
> (clarified, aprobada el 08-11-2026) · Constitución:
> [../constitution.md](../constitution.md) (borrador; rigen `CLAUDE.md` y
> `DECISIONS.md`) · Status: draft · Last updated: 2026-11-09

## 0. Global Constraints

- **La base decide los permisos.** Cada rechazo (elegibilidad, duración,
  doble adhesión, retiro tardío, voto sin membresía) lo hace PostgreSQL por
  RLS, `check` o función; la app sólo traduce con `src/lib/db-error.ts`.
  Prohibido `createAdminSupabase` en una acción de la persona.
- **Voto secreto (D68).** Ninguna tabla guarda qué votó alguien. Resultados
  sólo con la ronda cerrada y 5 participantes o más por comunidad. Nada de
  conteos durante la ronda ni totales combinados entre comunidades.
- **Gate legal (D70/D73).** Proponer, adherir y votar exigen los documentos
  vigentes aceptados; el mismo gate (`aa_participation_gate`) que ya protege
  las encuestas.
- **Nada ficticio (D74).** Los estados en pantalla son exactamente los que
  devuelve la base: `propuesto`, `en votación`, `aprobado`, `rechazado`,
  `sin quórum`, `sin adhesión`, `retirado`. Ningún botón dice "adherido" ni
  "votado" antes de la respuesta.
- **Elegibilidad.** Comunidades de nivel 3, 4 o 5; mismo país (mismo
  ancestro de nivel 2); ninguna participante contiene a otra; la comunidad de
  la proponente siempre participa; de 1 a 5 participantes.
- **Plazos.** Duración de votación entre 7 y 30 días, fijada al proponer.
  Fecha de cierre = apertura + duración, calculada al abrir. Ventana de
  adhesión: 30 días desde la propuesta.
- **Aprobación.** Por comunidad: participantes ≥ 5 y "sí" > "no". Acuerdo
  aprobado sólo si todas aprobaron; rechazado si alguna rechazó (incluye
  empate); sin quórum si ninguna rechazó y alguna no llegó a 5.
- **SQL.** Migración numerada `0074_agreements.sql` con `set search_path =
  ''`, nombres calificados, tests en `supabase/tests/`, tipos con `pnpm
  db.types`. Todo `supabase/` con SQL es del responsable (CODEOWNERS incluye
  `migrations/`, `migration-drafts/`, `sql-drafts/` y `tests/`; los dos
  directorios de borradores tienen además inventario fijado por el preflight
  de D72). El agente dejó el borrador y su test en `02-DOCS/wiki/sdd/drafts/`
  y los aplicó a su Supabase local; el responsable autorizó promoverlos el
  09-11-2026 y hoy viven en `supabase/migrations/0074_agreements.sql` y
  `supabase/tests/agreements_checks.sql`.
- **Autoría de las encuestas de un acuerdo.** `guard_core_content_insert`
  exige `author_id = auth.uid()`, así que las N encuestas se crean con autora
  = quien completó la última adhesión. No se muestran como encuestas comunes
  (`agreement_id`), y la página del acuerdo muestra a la proponente. Esas
  encuestas quedan exentas de `enforce_content_quota`; la cuota del acuerdo
  es propia: hasta 3 propuestas abiertas por persona.
- **i18n.** Español fuente; cada texto por `translate(locale, "…")` con su
  entrada en `src/i18n/en/agreements.ts`. El texto del acuerdo no se traduce
  (D56).
- **localStorage.** Sólo el borrador del formulario, clasificado en
  `src/lib/local-data.ts` como dato personal del dispositivo.
- **Sin hosts ni dependencias nuevas.** CSP intacta.
- **Commits.** `tipo(área): qué cambia`, cuerpo con "Ver D118.", una función
  por commit, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Toolchain.** Node 22.22.0, pnpm 11.15.0. Nunca tsc/vitest junto a
  Playwright.

## 1. Context & constraints

- Criterios que moldean el diseño: spec §Acceptance #2 y #8 (la votación se
  abre al adherir la última comunidad, con cierre calculado al abrir), #3
  (constancia sin elección, sin conteos), #4 a #6 (resultado por comunidad,
  sin total), #7 y #11 (ventana de adhesión y "sin adhesión"), #9 y #10
  (elegibilidad y duración rechazadas por la base), #12 (visitante lee y nada
  más).
- Reglas del proyecto en juego: invariantes 1, 2, 3, 6, 8 y 9 de
  `CLAUDE.md`; D68 (recibos sin elección, `private.poll_option_tallies`,
  `can_see_poll_results`); D74; D79 (pocas pestañas); D115 (entradas a
  publicar según la persona).
- Lo que ya existe y se reutiliza: `polls` binarias con `cast_poll_ballot`,
  `poll_participation_receipts`, `poll_results`, `poll_stats`,
  `can_see_poll_results`, el gate `aa_participation_gate`, el cierre por
  `closes_at` derivado en lectura (no hay cron de cierre), `content_relations`.
- No funcionales: una comunidad puede tener miles de encuestas; la sección
  "Acuerdos" lista pocos (límite 10 con "ver todos"). Ninguna consulta
  nueva sin índice.
- Fuera de alcance que el diseño no debe invadir: país, continentes y
  Tierra; firmas institucionales; roles; cumplimiento; enmiendas; mayorías
  calificadas; notificaciones nuevas.

## 2. Architecture

```text
[ /c/[slug]/acuerdos/nuevo ]  --routeAction--> [ RPC propose_agreement ] --> agreements, agreement_parties
[ /acuerdos/[id] ]            --loader------->  [ RPC agreement_state ]  <-- agreements ⋈ parties ⋈ polls ⋈ tallies (vía poll_results)
       |  adherir / retirar  --routeAction--> [ RPC adhere_agreement | withdraw_agreement ]
       |                                             | (última adhesión)
       |                                             v
       |                                    [ open_agreement_votes ] --> polls (una por comunidad, agreement_id) + poll_options Sí/No
       |  votar  ---------------------------> [ cast_poll_ballot ]  (existente, sin cambios)
[ /c/[slug]/encuestas ]  sección "Acuerdos"  --> [ RPC community_agreements ]
[ /inicio ]              kind "agreement"    --> [ RPC personalized_feed ] (unión nueva)
[ poll_feed ]                                 --> filtra agreement_id is null
```

- **agreements / agreement_parties** (interno, base) — el acuerdo y sus
  comunidades; una fila por comunidad con quién adhirió y la encuesta que
  le corresponde una vez abierta.
- **polls con `agreement_id`** (interno, base, columna nueva) — la ronda de
  cada comunidad. Es una encuesta binaria común para `cast_poll_ballot`,
  recibos y tallies; `poll_feed` y la pestaña Encuestas la esconden porque
  se muestra a través del acuerdo.
- **RPCs de escritura** (interno, base, `security definer`) —
  `propose_agreement`, `adhere_agreement`, `withdraw_agreement`. Validan
  todo del lado del servidor y abren las rondas en una sola transacción.
- **RPC de lectura `agreement_state`** (interno, base, `stable`) — devuelve
  el acuerdo, sus partes y el estado derivado; los resultados por comunidad
  salen de `poll_results`, que ya aplica D68.
- **Páginas Qwik** (interno, app) — página del acuerdo, formulario de
  propuesta, sección en Encuestas, tarjeta en el inicio. Sin lógica de
  permisos: muestran lo que la base dice y traducen rechazos.
- **Ayudantes puros** (interno, app, `src/lib/agreements.ts`) — etiquetas de
  estado, reglas de elegibilidad para avisar antes de enviar (la base las
  repite), construcción de la pregunta.

**Decisión de fondo:** cada ronda es una **encuesta binaria existente**
ligada al acuerdo, y el estado final se **deriva en lectura**, no se guarda.
Elegida porque hereda entero el voto secreto (D68), el gate legal, RLS de
membresía por comunidad y los recibos, sin un segundo sistema de voto que
mantener; y porque derivar el estado evita un cron de cierre que hoy no
existe (las encuestas ya cierran por `closes_at` en lectura). Alternativa:
tablas de voto propias para acuerdos. Más control del vocabulario, pero
duplica el sistema más delicado de la plataforma. Descartada.

Segunda decisión: `polls.agreement_id` como columna nueva, en vez de buscar
la encuesta sólo desde la parte. Permite que `poll_feed`, la pestaña y la
página `/encuestas/[id]` sepan que esa encuesta pertenece a un acuerdo y
redirijan o la oculten con un filtro barato e indexado.

## 3. Interfaces & contracts

```text
propose_agreement(p_title: text, p_body: text, p_communities: uuid[], p_duration_days: int) -> agreement_id | error
  - precondición: auth.uid() con gate legal; es miembro de su residencia;
    su residencia ∈ p_communities o se agrega; 1 ≤ |p_communities| ≤ 5;
    todas nivel 3–5, mismo ancestro de nivel 2, ninguna contiene a otra;
    7 ≤ p_duration_days ≤ 30; título 10–160, cuerpo 50–5000 caracteres.
  - postcondición: agreements(status='proposed') + una parte por comunidad
    sin adhesión. Ninguna encuesta creada.
  - errores: 42501 sin permiso; 23514 check (duración, nivel, cantidad);
    P0001 con mensaje estable: 'agreement_ineligible_community',
    'agreement_nested_communities', 'agreement_mixed_countries'.

adhere_agreement(p_agreement: uuid) -> agreement_id | error
  - precondición: auth.uid() con gate legal; miembro de una parte sin
    adherir; no es la proponente; status='proposed'; created_at + 30 días > now().
  - postcondición: la parte queda adherida (adhered_by, adhered_at). Si no
    queda ninguna sin adherir → open_agreement_votes en la misma transacción:
    status='voting', opened_at=now(), closes_at=now()+duración; por cada
    parte se crea una poll binaria (question = título, description = cuerpo,
    results_visibility='after_close', closes_at, author_id = quien adhirió
    esa parte o la proponente en la suya, agreement_id) con opciones
    'Sí' y 'No', y parte.poll_id = poll.id.
  - invariante: idempotente por (agreement, community): una segunda adhesión
    de la misma comunidad falla con 'agreement_already_adhered'.
  - errores: 'agreement_not_proposed', 'agreement_lapsed',
    'agreement_proposer_cannot_adhere', 'agreement_already_adhered', 42501.

withdraw_agreement(p_agreement: uuid) -> void | error
  - precondición: auth.uid() = proposer_id; status='proposed'.
  - postcondición: status='withdrawn', withdrawn_at=now().
  - errores: 'agreement_not_proposed' (ya en votación), 42501.

agreement_state(p_agreement: uuid) -> row | null
  - lectura pública (anon y authenticated).
  - devuelve: id, title, body, proposer (id público), status_derived,
    opened_at, closes_at, created_at, parties[] {community_id, slug, name,
    emoji, adhered_at, poll_id, outcome, participants}.
  - status_derived: 'withdrawn' | 'lapsed' (proposed y created_at+30d ≤ now)
    | 'proposed' | 'voting' (alguna poll con closes_at > now) | 'approved'
    | 'rejected' | 'no_quorum' según la regla de §0.
  - outcome por parte: 'pending' mientras closes_at > now; después
    'approved' | 'rejected' | 'no_quorum'; participants sólo si
    can_see_poll_results(poll_id), si no null. Nunca devuelve conteos de
    una ronda abierta.
  - para quien consulta: can_vote (miembro y sin recibo y abierta),
    has_receipt, can_adhere (comunidad propia sin adherir, no proponente),
    can_withdraw.

community_agreements(p_community: uuid, p_limit: int) -> rows
  - acuerdos donde la comunidad es parte, más recientes primero, con
    status_derived. Para la sección "Acuerdos" de Encuestas.

poll_feed / pestaña Encuestas
  - excluyen polls con agreement_id not null.
/encuestas/[id] con agreement_id
  - redirige 302 a /acuerdos/[agreement_id].

personalized_feed
  - unión nueva kind='agreement' para acuerdos con una parte en la cadena
    de la persona; title, summary (primeros 300), status_derived como
    status, engagement = cantidad de partes adheridas (no votos).

cast_poll_ballot (sin cambios)
  - vota en la poll de la parte; RLS exige membresía en esa comunidad.
```

Contratos de la app (puros, `src/lib/agreements.ts`):

```text
agreementStatusLabel(status_derived, locale, closes_at?) -> texto en palabras
eligibilityIssue(candidates: {level, path}[], own: {level, path}) -> null | 'nivel' | 'pais' | 'contenida' | 'cantidad'
  - misma regla que la base; sólo para avisar antes de enviar.
partyOutcomeLabel(outcome, participants) -> texto ("Aprobó · 12 participantes" | "Sin quórum")
```

## 4. Data model & flow

**Entidades**

- **Agreement** — id, title, body, proposer_id → profiles, proposer_community_id
  → communities, duration_days (7–30), status ∈ {proposed, voting, withdrawn},
  created_at, opened_at?, closes_at?, withdrawn_at?. Los estados finales
  (approved, rejected, no_quorum, lapsed) **no se guardan**: se derivan.
- **AgreementParty** — (agreement_id, community_id) PK, adhered_by? →
  profiles, adhered_at?, poll_id? → polls (único). Índice por community_id
  para la sección y el feed.
- **Poll** (existente) — columna nueva agreement_id? → agreements, índice
  parcial `where agreement_id is not null`. Trigger `guard_poll_privacy_
  transition` y `freeze_poll_type` siguen aplicando.
- Relaciones con reclamos o proyectos: fuera de este ciclo (spec, área no
  formulable); `content_relations` queda disponible para otra ronda.

**Flujo primario** (spec §Behaviour, varias comunidades)

1. Residente de A completa el formulario (título, texto, comunidades B y C,
   duración 14). El ayudante puro avisa si algo es inelegible; el envío va a
   `propose_agreement`.
2. La base valida todo y crea el acuerdo `proposed` con partes A (sin
   adherir), B y C. La proponente **no** adhiere su propia parte: hace falta
   otra residente de A.
3. La página `/acuerdos/[id]` muestra "Propuesto a A, B y C · esperando
   adhesión de A, B y C". Una residente de B toca "Adherir por B" →
   `adhere_agreement`. Igual en C y una segunda residente de A.
4. En la última adhesión la misma transacción abre las tres encuestas con
   cierre = ahora + 14 días y el acuerdo pasa a `voting`.
5. Las residentes votan con `cast_poll_ballot` sobre la encuesta de su
   comunidad; queda el recibo sin elección; la página dice "en votación hasta
   el …" y "Ya votaste" a quien tiene recibo.
6. Pasado el cierre, `agreement_state` deriva por parte el resultado desde
   `poll_results` (que ya exige cierre y 5 participantes) y compone el estado
   del acuerdo. Nada se escribe.

- Límite transaccional: propuesta con sus partes; adhesión con la apertura
  de todas las encuestas. Lo demás es lectura.
- Impacto de migración: dos tablas nuevas, una columna nullable en `polls`
  con índice parcial, cinco funciones nuevas, cambios en `poll_feed` y
  `personalized_feed`, RLS: select público en las dos tablas; insert/update
  sólo por RPC definer (sin policies de escritura directa); trigger de gate
  legal en agreements y agreement_parties. Sin backfill ni cambios
  destructivos. Regenerar `database.types.ts`.

## 5. Testing strategy

| Criterio (spec §Acceptance) | Nivel | Afirma | Fakes |
| --- | --- | --- | --- |
| #1 propuesta queda "propuesto" sin votación | SQL (`supabase/tests`) + E2E | `propose_agreement` crea acuerdo y partes y ninguna poll; la página dice "propuesto" | ninguno (Supabase local) |
| #2 adhesión abre votación con cierre = apertura + duración; doble adhesión y autoadhesión rechazadas por la base | SQL + spec de componente | errores `agreement_already_adhered` / `agreement_proposer_cannot_adhere`; `closes_at - opened_at = duración` | componente: loader simulado |
| #3 constancia sin elección, sin conteos | SQL existente de D68 + E2E | sin fila con la elección; `poll_results` vacío antes del cierre; la página no muestra "N votos" | ninguno |
| #4 aprobado con resultado y participación por comunidad, sin total | SQL (fixture con cierre pasado y 5+ votos) + spec de componente | `agreement_state` → approved; la página no suma | componente: estado simulado |
| #5 rechazado con la comunidad que rechazó | SQL + spec de componente | status_derived rejected, outcome por parte | ídem |
| #6 sin quórum sin conteos de esa comunidad | SQL + spec de componente | participants null para la parte sin quórum | ídem |
| #7 y #11 "sin adhesión" a los 30 días, sin votación | SQL (fixture con created_at antiguo) + spec puro de etiqueta | `adhere_agreement` → `agreement_lapsed`; status_derived lapsed | ninguno |
| #8 apertura simultánea con misma fecha | SQL | las N polls comparten `closes_at` y `opened_at` | ninguno |
| #9 elegibilidad rechazada por formulario y por base | spec puro (`eligibilityIssue`) + SQL | país distinto, contenida, nivel 2, 6 comunidades → error estable | ninguno |
| #10 duración fuera de 7–30 | SQL (`check`) + spec puro | 23514 | ninguno |
| #12 retiro sólo en "propuesto" | SQL | withdraw en voting → `agreement_not_proposed` | ninguno |
| #13 visitante lee y no actúa | E2E anónimo | sin botones, llamado "Crear cuenta" | ninguno |
| #14 rechazo traducido sin cambio de estado | spec de componente + spec de `db-error` | mensaje por código estable; estado igual | acción simulada |
| #15 inglés completo, texto sin traducir | `check-i18n` + spec | todas las claves en `agreements.ts` | ninguno |
| #16 institución ve lo mismo | E2E con cuenta institucional del seed | misma página, sin acción extra | ninguno |

- La línea E2E: un recorrido completo con el seed (Sofía en Mar del Plata +
  una residente de Necochea sembrada) hasta "en votación", y una fixture
  con cierre pasado para ver "aprobado". No se espera 7 días: el E2E
  siembra fechas.
- Debe ser real: Supabase local con la migración aplicada. Las pruebas SQL
  son las que prueban el invariante 1; los specs de componente sólo prueban
  que la pantalla no inventa.

## 6. Sequencing & dependencies

1. **Borrador de migración `0074_agreements`** en `supabase/migration-drafts/`
   con cabecera de estado: tablas, columna, índices, RLS, gate legal,
   cinco funciones, cambios de `poll_feed` y `personalized_feed`. Más el
   borrador de `supabase/tests/agreements.sql`. — depende de: nada — serial
   (agente).
2. **Promoción por el responsable**: mover a `supabase/migrations/`,
   `pnpm db.reset`, `pnpm db.test`, `pnpm db.types`, commit. — depende de:
   #1 — serial (responsable; puerta dura: sin esto no hay #4 a #9).
3. **Ayudantes puros e i18n**: `src/lib/agreements.ts` con spec,
   `src/i18n/en/agreements.ts`, códigos nuevos en `db-error.ts` con spec. —
   depende de: #1 (nombres de errores) — paralelizable con #2.
4. **Página `/acuerdos/[id]`**: loader sobre `agreement_state`, acciones
   adherir / retirar / votar, estados en palabras, visitante. Spec de
   componente. — depende de: #2, #3 — serial.
5. **Formulario `/c/[slug]/acuerdos/nuevo`**: `FormShell` como las
   encuestas, aviso previo de elegibilidad, borrador en el dispositivo,
   acción a `propose_agreement`, entrada por `publicationEntryHref`. —
   depende de: #2, #3 — paralelizable con #4.
6. **Sección "Acuerdos" en `/c/[slug]/encuestas`** y redirección de
   `/encuestas/[id]` con `agreement_id`. — depende de: #4 — paralelizable
   con #7.
7. **Inicio**: kind `agreement` en `ContentType`, `META` del inicio,
   `contentHref`. — depende de: #2 — paralelizable con #6.
8. **Manual, D118, `docs/mejoras-priorizadas.md`, `local-data.ts`**. —
   depende de: #4, #5 — serial.
9. **E2E `e2e/agreements.spec.ts`**, revisores D113, `pnpm verify`,
   registro de verificación. — depende de: todo — serial.

- Paralelizables: #3 con #2; #4 con #5; #6 con #7.
- Orden duro: nada de app con la base real antes de #2; el agente puede
  aplicar el borrador a su Supabase local con `psql` para desarrollar, pero
  el commit de tipos y migración es del responsable.

## 7. Risks & open decisions

| Riesgo | Disparador | Impacto | Mitigación |
| --- | --- | --- | --- |
| Casi todo acuerdo termina "sin quórum" | comunidades con menos de 5 residentes activas | la función enseña a no usarse | la página avisa antes de proponer cuántos residentes tiene cada comunidad y qué exige D68; el brief mide demanda hasta el 06-12 antes de construir |
| Una encuesta de acuerdo aparece como encuesta común | `poll_feed`, widget de voto rápido, búsqueda global, notificaciones de cierre | duplicación y confusión | filtro `agreement_id is null` en cada lector de polls; test SQL que lo afirme; auditoría con `grep` de `from("polls")` y `poll_feed` |
| Doble voto por jerarquía | una parte contiene a otra | una persona vota dos veces | regla de no contención en la base (test SQL) y en el aviso previo |
| Estado derivado caro | acuerdos con muchas partes en listados | lentitud en Encuestas e inicio | `community_agreements` y el feed devuelven el estado con una sola pasada por `poll_results`; límite 10 en la sección |
| Apertura en comunidades ajenas por una definer | bug en `open_agreement_votes` | encuestas creadas sin membresía | la función sólo corre dentro de `adhere_agreement` tras validar la última adhesión; test SQL negativo |
| Migración promovida tarde | el responsable no la aplica | la app no se puede probar | #3 avanza igual; #4 a #9 esperan; el borrador trae su propio test |
| Vocabulario que afirma de más | textos como "acordado" en propuestas | D74 | `fictional-content.spec` prohíbe "aprobado" fuera del estado derivado |

**Decisiones abiertas**

- Si el acuerdo interno de una sola comunidad exige dos personas (proponente
  más una que adhiera) o abre solo: la spec eligió dos; se revisa con uso
  real. Cierra cuando haya tres acuerdos internos reales.
- Si los acuerdos aprobados se enlazan con reclamos y proyectos vía
  `content_relations`: espera a que exista alguno aprobado.
- Número de decisión: D118, si ninguna otra se escribe antes.

## Tasks

<!-- generated by tasks on 2026-11-09; IDs are stable, do not renumber -->

| ID | [P] | Task | Done-check | Depends-on | Trace |
| --- | --- | --- | --- | --- | --- |
| T001 |  | Borrador `02-DOCS/wiki/sdd/drafts/0074_agreements.sql`: tablas, columna `polls.agreement_id`, índices, RLS, gate legal, cuota exenta, `propose/adhere/withdraw_agreement`, `agreement_state`, `community_agreements`, `poll_feed` y `personalized_feed` filtrados | `psql -f` sobre Supabase local aplica sin error; `\d public.agreements` y `\d public.agreement_parties` existen; `\df public.*agreement*` lista 5 funciones | — | plan §3, §4 |
| T002 |  | Borrador `02-DOCS/wiki/sdd/drafts/0074_agreements_checks.sql` con los casos de plan §5 (#1, #2, #5–#12 y D68) | `psql -v ON_ERROR_STOP=1 -f` termina en ROLLBACK con todos los `ok ·`; un caso negativo (quitar el filtro de `poll_feed`) hace fallar la prueba | T001 | spec §Acceptance #1–#12 |
| T003 |  | **Responsable:** mover a `supabase/migrations/0074_agreements.sql` y `supabase/tests/agreements_checks.sql`; `pnpm db.reset`, `pnpm db.test`, `pnpm db.types`; commit | `pnpm db.test` verde; `git diff --stat src/lib/database.types.ts` muestra `agreements`, `agreement_parties` y las RPC | T001, T002 | plan §6 #2 |
| T004 | [P] | `src/lib/agreements.ts` + spec: `agreementStatusLabel`, `eligibilityIssue`, `partyOutcomeLabel`, `AGREEMENT_STATUSES`; `src/i18n/en/agreements.ts` registrado en `en/index.ts`; `agreementRaiseMessage` en `db-error.ts` con spec | `pnpm exec vitest run src/lib/agreements.spec.ts src/lib/db-error.spec.ts` verde; `node scripts/check-i18n.mjs` verde | T001 (nombres de errores) | spec §Acceptance #9, #10, #14, #15 |
| T005 |  | Spec de componente en rojo para `/acuerdos/[id]`: estados en palabras, visitante sin acciones, votante con "Ya votaste", resultado por comunidad sin total | `pnpm exec vitest run src/routes/acuerdos/[id]/agreement-page.spec.tsx` falla por módulo ausente | T004 | spec §Acceptance #3–#6, #13 |
| T006 |  | Página `/acuerdos/[id]`: loader `agreement_state`, acciones adherir / retirar / votar (`cast_poll_ballot` sobre `poll_id` de la parte), rechazos por `writeFailure` + `agreementRaiseMessage` | T005 verde; `pnpm db.contract` verde | T003, T005 | spec §Behaviour |
| T007 | [P] | Formulario `/c/[slug]/acuerdos/nuevo` con `FormShell`, aviso previo por `eligibilityIssue`, duración 7–30, borrador en el dispositivo (clave en `local-data.ts`), acción a `propose_agreement`, entrada por `publicationEntryHref` tipo `agreement` | spec de componente verde; `check-i18n` verde | T003, T004 | spec §Acceptance #1, #9, #10 |
| T008 | [P] | Sección "Acuerdos" en `/c/[slug]/encuestas` con `community_agreements` (límite 10) y redirección 302 de `/encuestas/[id]` cuando `agreement_id` no es null | spec de la pestaña verde; E2E: abrir `/encuestas/<poll de acuerdo>` termina en `/acuerdos/<id>` | T006 | plan §3 |
| T009 | [P] | Inicio: `ContentType` + `"agreement"`, `META` con etiqueta "Acuerdo", `contentHref` → `/acuerdos/:id`, tarjeta con estado derivado y sin conteos | `inicio-first-screen.spec.tsx` extendido verde; `fictional-content.spec` sin "aprobado" fuera del estado | T003 | plan §3 personalized_feed |
| T010 |  | Manual (ES/EN), D118 en `DECISIONS.md`, `docs/mejoras-priorizadas.md`, README (tabla de migraciones la completa el responsable) | `check-i18n` y `check-legal` verdes; D118 cita spec y plan | T006, T007 | CLAUDE.md tabla de documentos |
| T011 |  | E2E `e2e/agreements.spec.ts`: proponer (Sofía), adherir (Flor desde Tandil), apertura simultánea, voto con "Ya votaste", visitante sin acciones; fixture con cierre pasado para "aprobado" | `pnpm test.e2e e2e/agreements.spec.ts` verde | T006–T009 | spec §Acceptance #1–#4, #8, #13 |
| T012 |  | Revisores D113 (`code-reviewer`, `typescript-reviewer`, `silent-failure-hunter`, más `database-reviewer` sobre el SQL), hallazgos aplicados; `pnpm verify`; registro de verificación | `pnpm verify` salida 0; registro con PASS en `sdd/verifications/` | todas | spec §Acceptance |

**T001 — Interfaces**

- Produce: las firmas de plan §3 tal cual; errores con mensaje estable
  `AGORBIS_AGREEMENT_*` (`PARTY_COUNT`, `INELIGIBLE_LEVEL`, `MIXED_COUNTRIES`,
  `NESTED_COMMUNITIES`, `NOT_FOUND`, `NOT_PROPOSED`, `LAPSED`,
  `PROPOSER_CANNOT_ADHERE`, `NOT_A_MEMBER`, `ALREADY_ADHERED`, `NOT_PROPOSER`,
  `TOO_MANY_PENDING`, `RESIDENCE_REQUIRED`); `agreement_state(uuid) -> jsonb`
  con `{id, title, body, status, status_derived, proposer_id,
  proposer_community: {id, slug, name, emoji}, duration_days, created_at,
  opened_at, closes_at, withdrawn_at, parties: [{community_id, slug, name,
  emoji, level, adhered_at, poll_id, outcome, participants}], viewer:
  {can_adhere, can_withdraw, can_vote, has_receipt, party_community_id}}`.

**T004 — Interfaces**

- Consume: los mensajes `AGORBIS_AGREEMENT_*` de T001.
- Produce: `eligibilityIssue(own: {level, path}, others: {level, path}[]) ->
  null | "cantidad" | "nivel" | "pais" | "contenida"`;
  `agreementStatusLabel(locale, status_derived, closes_at: string | null) ->
  string`; `partyOutcomeLabel(locale, outcome, participants: number | null)
  -> string`; `agreementRaiseMessage(error) -> string | null`.

### Review workload forecast

- SQL (T001–T002): un archivo de unas 600 líneas y un test de unas 300.
  Revisión del responsable con `database-reviewer` antes de promover.
- App (T004–T009): unos 10 archivos nuevos y 6 tocados; tres specs de
  componente y uno puro; un E2E. Entrega en tres commits: ayudantes, página
  y formulario, sección e inicio; más uno de documentación.
- Puerta dura en T003: hasta que el responsable promueva la migración, sólo
  T004 avanza.
