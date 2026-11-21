# Agorbis · reglas para agentes y colaboradores

Plataforma cívica argentina: comunidades geográficas jerárquicas donde se
vota, debate, reclama y propone. Qwik 2 beta + Qwik Router, TypeScript
estricto, Tailwind v4, Supabase/Postgres con RLS y Cloudflare Workers. Antes de
cambiar algo, leé el [README](README.md) (estado actual y ledger de
migraciones) y la decisión `Dn` de [DECISIONS.md](DECISIONS.md) que lo cubre.

Pasar `tsc`, ESLint y Vitest no alcanza. En octubre de 2026, 30 commits en
verde rompieron el gate legal, mostraron datos inventados como reales y
sumaron terceros no declarados (D73–D76). Las reglas de abajo existen por eso.

## Invariantes no negociables

1. **La base decide los permisos.** RLS, `is_member` y los triggers de
   PostgreSQL deciden quién puede qué; la app sólo traduce el rechazo a un
   mensaje (`src/lib/db-error.ts`). No se esconde un botón en lugar de una
   policy, ni se usa `createAdminSupabase` (service role) para saltear RLS en
   una acción de la persona.
2. **Voto secreto (D68).** No hay boletas individuales: una constancia sin
   elección y tallies agregados. Los resultados salen al cierre y con 5
   participantes o más. Nada de guardar qué votó alguien, mostrar conteos
   durante la ronda ni prometer anonimato criptográfico.
3. **Gate legal versionado (D70, D73).** Participar exige haber aceptado los
   documentos vigentes y el aviso de transferencias, con versión y hash,
   registrados desde la sesión de la persona. El gate falla cerrado. Nunca se
   fabrica una aceptación, ni en SQL ni en código.
4. **Textos legales con versión y hash.** `src/lib/legal-content.ts` y las
   páginas `/privacidad`, `/terminos`, `/normas-comunitarias`,
   `/subencargados` y `/transferencias-internacionales` están atados a sus
   migraciones por `scripts/check-legal.mjs`. Cambiar una coma exige versión
   nueva, migración y revisión del responsable.
5. **CSP con nonce (D64) y terceros (D76).** Las cabeceras viven en
   `src/routes/plugin@cabeceras.ts`. Un host que el navegador o el Worker
   contacten sin un clic de la persona entra sólo con CSP + `/subencargados` +
   Privacidad + `Dn`, en la misma PR. No se relaja la CSP para que algo
   "ande": se cambia el algo.
6. **Nada ficticio (D74).** Ningún botón dice "confirmado", "publicado",
   "registrado", "enviado", "otorgado" o "verificado" sobre algo que no llegó a
   la base. Ningún dato de muestra se presenta como real; si hace falta un
   ejemplo, va detrás de un modo demo explícito (hoy no hay ninguno).
   `src/components/fictional-content.spec.ts` es la red mínima.
7. **`localStorage` sólo para conveniencias del dispositivo** (favoritos,
   borradores, preferencias). Cada clave nueva se clasifica en
   `src/lib/local-data.ts` como preferencia o dato personal; la limpieza al
   cerrar sesión o borrar la cuenta depende de eso (D67).
8. **i18n.** El español es el texto fuente: todo texto de UI pasa por
   `translate(locale, "…")` y tiene su traducción en `src/i18n/en/<dominio>.ts`.
   `check-i18n` falla si falta. El contenido ciudadano no se traduce (D56).
9. **SQL.** Las migraciones van numeradas en `supabase/migrations/`, con
   `set search_path = ''` y nombres calificados, tests en `supabase/tests/` y
   tipos regenerados con `pnpm db.types` (nunca editados a mano; los alias van
   en `database.types.helpers.ts`). Un borrador va **sólo** en
   `supabase/migration-drafts/`, con cabecera de estado. Nunca en `docs/`.
10. **Privacidad de ubicación y logs.** Las coordenadas públicas usan la
    cuadrícula de ~110 m (0040); un enlace saliente no lleva más precisión.
    Una respuesta `public` cacheada usa `createAnonymousSupabase`. Los logs no
    llevan payloads, URLs con códigos ni datos personales.
11. **Secretos.** Nada secreto lleva prefijo `PUBLIC_`. `scan-secrets` corre en
    lint.

## Comandos

```bash
pnpm dev               # SSR local en http://localhost:5173 (Supabase local corriendo)
pnpm lint              # ESLint, Prettier, scan-secrets, check-keys/i18n/legal, contrato de base
pnpm test              # pruebas puras de scripts/test-* + vitest run
pnpm test.release      # políticas D72, Cloudflare, preflight, backups, pins (toolchain exacta)
pnpm verify            # lint && test && test.release
pnpm build.types       # tsc --noEmit
pnpm exec vitest run <spec>          # un spec puntual
pnpm exec supabase start && pnpm db.reset   # base local: migraciones + seed
pnpm db.types          # regenera src/lib/database.types.ts
pnpm db.test           # suites SQL de RLS, Storage, privacidad y borrado
pnpm db.contract       # cada .rpc()/.from() existe en los tipos
pnpm test.e2e          # Playwright contra Supabase local
pnpm fmt               # prettier --write .
```

`package.json` manda: si esta lista y el archivo difieren, vale el archivo.

**Nunca:** `wrangler deploy` o `pnpm deploy` a mano (Producción se abre con
`pnpm deploy:open`, D107, y se cierra con `pnpm deploy:closed`),
`supabase db push` fuera del runbook, `--no-verify`, ni re-baselinear hashes
de release dentro de un commit de features.

## Qué documentos tocar con cada cambio

| Cambio                                          | Además del código                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Función visible nueva o cambiada                | `/manual` (+ `src/i18n/en/manual.ts`), README si cambia el alcance, test |
| Decisión de producto, privacidad o arquitectura | Entrada `Dn` nueva en `DECISIONS.md`; si reemplaza otra, lo dice arriba  |
| Migración                                       | Tabla de migraciones del README, `supabase/tests`, `pnpm db.types`       |
| Host externo, proveedor o dato nuevo a terceros | CSP, `/subencargados`, Privacidad (versión + hash) y `Dn` (D76)          |
| Script de `package.json`                        | Tabla de comandos del README; contrato de scripts si es de release       |
| Variable de entorno                             | `.env.example` con comentario del porqué; preflight si es de producción  |
| Clave de `localStorage`                         | Clasificación en `src/lib/local-data.ts`                                 |

## Archivos que no se tocan sin el responsable

`.github/CODEOWNERS` es la lista exacta. En resumen: `src/lib/legal*`, las
páginas legales y `/consentimiento`; `supabase/migrations/`,
`supabase/migration-drafts/` y `supabase/tests/`;
`src/routes/plugin@cabeceras.ts`; los scripts de release, D72, backups y pins;
`docs/PRODUCTION_RUNBOOK.md`; `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `wrangler*.jsonc` y `.github/`. Un agente no los cambia
por iniciativa propia: propone el cambio y espera.

## Commits, PRs y CI

- **Una función por PR.** Nada de "batch N" que mezcle diez cosas: no se
  pueden revisar ni revertir por partes.
- **Mensaje:** `tipo(área): qué cambia`, en una línea (`feat`, `fix`, `docs`,
  `refactor`, `test`, `chore`). El cuerpo explica **por qué** y cita la
  decisión (`Ver D74.`). Si cambia una garantía, primero va la `Dn`.
- **Flujo:** el responsable decide si un cambio va por PR con la plantilla
  (`.github/PULL_REQUEST_TEMPLATE.md`) y revisión de code owners, o directo a
  `main`. El push y el pull de `main` los hace siempre el responsable, nunca un
  agente. La CI corre en cada push a `main`; su resultado se mira antes de un
  release.
- **CI** (`.github/workflows/ci.yml`): `verificar` corre lint, test, tipos,
  build y `pnpm audit --audit-level=high`; `integracion` levanta Supabase,
  `supabase db lint`, `db.test` y e2e. Las dos son las requeridas.
  `release-gates` corre `test.release` con la toolchain exacta y bloquea un
  release, no una PR de producto. `auditoria-semanal` no bloquea.
- **Tests:** la lógica nueva trae spec. No se borran ni se debilitan asserts
  para que pase la suite; si el comportamiento cambió, la PR lo explica.

## Estilo

Comentarios en español rioplatense que explican el porqué, no el qué. Textos
de UI honestos y concretos. Node 22.22.0 y pnpm 11.15.0 exactos. Formateá con
Prettier antes de commitear.
