# Borradores de migraciones

Los archivos SQL de este directorio están versionados para revisión, pero no
forman parte del baseline ejecutable de Supabase. `supabase db reset`, CI,
`migration list` y `db push` sólo descubren `supabase/migrations`.

`google-auth-notice-2026-09-09.json` conserva el snapshot bilingüe aprobado para
Google. La [vista legible](../../docs/google-access-notice-review.md) y el
[registro de aprobación](../../docs/google-notice-owner-approval-2026-09-09.md)
identifican el texto revisado. Este JSON no es una migración ni publica nada:
su copia exacta, versión `2026-09-09.1`, hash JSONB y aprobación están fijados en
`supabase/migrations/0067_activate_google_auth_notice.sql`. La activación se
aplicó sólo localmente. Su huella de archivo no sustituye el hash de PostgreSQL.

`0059_versioned_sensitive_participation_consent.sql` continúa en estado
**BORRADOR LOCAL. NO APLICAR**. Su test focal está excluido del glob normal
`*_checks.sql`. La única vía preparada para revisarlo es
`pnpm db.test.draft-0059:ephemeral -- --acknowledge-ephemeral-local-draft`, que
requiere confirmación explícita, clona el baseline 0058, aplica el SQL
directamente en esa copia sin registrarlo en el ledger y destruye la base
efímera al terminar.

Mover un borrador a `supabase/migrations` exige revisión y autorización
separadas. No se aprueba ni publica por el mero hecho de estar versionado aquí.

Este directorio contiene, como SQL, únicamente `0059`: el preflight de
Producción (`validateMigrationDraftFiles`), el preview de sólo lectura y la
evidencia D72 fijan su inventario exacto y D72 hashea los nombres de archivo.
Los SQL que nadie propuso todavía (por ejemplo `0068`, rechazado, y `0069`)
viven en [`supabase/sql-drafts/`](../sql-drafts/README.md), para que agregarlos
no cambie la evidencia de release ni haga fallar el preflight.
