# Cómo contribuir a Agorbis

Antes de tocar código, leé [CLAUDE.md](CLAUDE.md): son las reglas que no se
negocian (la base decide permisos, voto secreto, gate legal, nada ficticio,
terceros declarados). Vale igual para personas y para agentes.

## Puesta en marcha

Necesitás Docker, [nvm](https://github.com/nvm-sh/nvm) (o Node 22.22.0
instalado) y Corepack.

```bash
nvm use && corepack enable     # Node 22.22.0 (.nvmrc) y pnpm 11.15.0 (packageManager)
pnpm install
pnpm exec supabase start       # imprime la URL y las claves del stack local
cp .env.example .env           # pegá PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SECRET_KEY
pnpm db.reset && pnpm dev      # migraciones + seed; la app queda en http://localhost:5173
```

Las cuentas demo (contraseña `AgorbisLocal-2026!`) y los correos locales están
en el [README](README.md#usuarios-demo).

## Antes de cada commit

```bash
pnpm lint            # ESLint, Prettier y chequeos check-* (i18n, legal, claves, secretos, contrato de base)
pnpm test            # pruebas puras + Vitest
pnpm build.types     # tsc --noEmit
```

Según lo que tocaste, además:

- **SQL:** `pnpm db.reset && pnpm db.test`, y `pnpm db.types` si cambió el
  esquema.
- **Un flujo visible** (alta, ingreso, publicar, votar): `pnpm test.e2e`.
- **Scripts de release, D72, pins o `package.json`:** `pnpm test.release`.
- **Textos de UI:** su traducción en `src/i18n/en/`; `pnpm lint` falla si
  falta.

`pnpm fmt` formatea todo el repo con Prettier.

## Abrir una PR

1. Creá una rama desde `main` (`fix/…`, `feat/…`, `docs/…`). El responsable
   del repositorio puede subir cambios directo a `main` cuando lo decide; el
   push a GitHub lo hace siempre el responsable.
2. Una función por PR. El commit dice qué cambia en la primera línea
   (`feat(reclamos): …`) y por qué en el cuerpo, citando la decisión `Dn` si
   corresponde.
3. Completá la plantilla (`.github/PULL_REQUEST_TEMPLATE.md`): tests, i18n,
   migración, CSP y terceros, textos legales, honestidad del producto,
   DECISIONS y manual. Lo que no aplica se tacha con una línea de por qué.
4. Si tocás algo de `.github/CODEOWNERS` (legal, migraciones, cabeceras,
   release), la PR espera la revisión del responsable.

## Qué revisa la CI

`.github/workflows/ci.yml` corre en cada PR:

| Job                 | Qué hace                                                                                           | ¿Bloquea la PR?      |
| ------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| `verificar`         | `pnpm lint`, `pnpm test`, `pnpm build.types`, `pnpm build` y `pnpm audit --audit-level=high`       | Sí                   |
| `integracion`       | Supabase efímero, `supabase db lint`, `pnpm db.types`, `pnpm db.test` y `pnpm test.e2e` (Chromium) | Sí                   |
| `release-gates`     | `pnpm test.release` con la toolchain auditada exacta                                               | No: bloquea releases |
| `auditoria-semanal` | `pnpm audit --audit-level=low` y excepciones de audit vencidas (programado)                        | No                   |

Cuando una prueba E2E falla, aunque pase en el reintento, `integracion` sube
el artefacto `playwright-results-<intento>` con la captura, la traza, el video
y el `error-context.md` de cada intento fallido. Dura 7 días. Para abrir una
traza: `pnpm exec playwright show-trace <archivo>/trace.zip`.

`verificar` e `integracion` son los checks que la protección de rama de
`main` tiene que exigir; esa protección se configura en GitHub, no en este
repositorio.

Si la CI falla, se arregla la causa. No se borran asserts, no se agregan
excepciones de audit sin fecha ni motivo, y no se relaja la CSP para que algo
pase.
