#!/usr/bin/env bash
set -euo pipefail

task_confirmation="--acknowledge-ephemeral-local-draft"
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

usage() {
  printf '%s\n' \
    "Uso: pnpm db.test.draft-0059:ephemeral -- ${task_confirmation}" \
    "" \
    "Clona el baseline local 0058 en una base efímera, aplica allí el borrador" \
    "0059 directamente (sin ledger), ejecuta su test focal y destruye la copia." \
    "Nunca modifica la base local principal ni Supabase Cloud."
}

# pnpm conserva el separador `--` al delegar ciertos scripts de shell.
if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$#" -ne 1 || "$1" != "$task_confirmation" ]]; then
  usage >&2
  exit 2
fi

task_container="${AGORBIS_DB_CONTAINER:-supabase_db_agorbis}"
if [[ ! "$task_container" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
  printf '%s\n' "Nombre de contenedor local inválido." >&2
  exit 1
fi

task_draft="${task_root}/supabase/migration-drafts/0059_versioned_sensitive_participation_consent.sql"
task_focal="${task_root}/supabase/tests/sensitive_participation_consent_review.sql"
task_executable_0059="${task_root}/supabase/migrations/0059_versioned_sensitive_participation_consent.sql"
if [[ ! -f "$task_draft" || ! -f "$task_focal" || -e "$task_executable_0059" ]]; then
  printf '%s\n' "El layout aislado del borrador 0059 no es válido." >&2
  exit 1
fi

task_log="$(mktemp)"
chmod 0600 "$task_log"
task_database="agorbis_0059_review_${PPID}_${RANDOM}"
if [[ ! "$task_database" =~ ^agorbis_0059_review_[0-9]+_[0-9]+$ ]]; then
  printf '%s\n' "Nombre de base efímera inválido." >&2
  exit 1
fi

cleanup() {
  docker exec "$task_container" dropdb -U postgres --if-exists --force \
    "$task_database" >"$task_log" 2>&1 || true
  rm -f -- "$task_log"
}
trap cleanup EXIT INT TERM

ledger_state() {
  local database="$1"
  docker exec "$task_container" psql -U postgres -d "$database" -Atqc \
    "select count(*) || '|' || count(distinct version) || '|' || min(version) || '|' || max(version) from supabase_migrations.schema_migrations"
}

draft_objects_absent() {
  local database="$1"
  docker exec "$task_container" psql -U postgres -d "$database" -Atqc \
    "select to_regclass('public.sensitive_participation_notice_versions') is null and to_regclass('public.user_sensitive_participation_consents') is null"
}

task_main_ledger_before="$(ledger_state postgres 2>"$task_log")"
task_main_objects_before="$(draft_objects_absent postgres 2>>"$task_log")"
if [[ "$task_main_ledger_before" != "58|58|0001|0058" || "$task_main_objects_before" != "t" ]]; then
  printf '%s\n' "La base local principal no es el baseline limpio 0058." >&2
  exit 1
fi

if ! docker exec "$task_container" createdb -U postgres "$task_database" \
  >"$task_log" 2>&1; then
  printf '%s\n' "No se pudo crear la base efímera para revisar 0059." >&2
  exit 1
fi

if ! {
  docker exec "$task_container" pg_dump -U postgres -d postgres \
    --format=custom --no-owner --no-privileges 2>>"$task_log" |
    docker exec -i "$task_container" pg_restore -U postgres \
      -d "$task_database" --no-owner --no-privileges >>"$task_log" 2>&1
}; then
  printf '%s\n' "No se pudo clonar el baseline en la base efímera." >&2
  exit 1
fi

if ! docker exec -i "$task_container" psql -U postgres -d "$task_database" \
  -v ON_ERROR_STOP=1 >"$task_log" 2>&1 <"$task_draft"; then
  printf '%s\n' "El borrador 0059 falló en la base efímera." >&2
  exit 1
fi

if [[ "$(ledger_state "$task_database" 2>"$task_log")" != "58|58|0001|0058" ]]; then
  printf '%s\n' "El borrador alteró inesperadamente el ledger efímero." >&2
  exit 1
fi

if ! docker exec -i "$task_container" psql -U postgres -d "$task_database" \
  -v ON_ERROR_STOP=1 >"$task_log" 2>&1 <"$task_focal"; then
  printf '%s\n' "El test focal de 0059 falló en la base efímera." >&2
  exit 1
fi

task_main_ledger_after="$(ledger_state postgres 2>"$task_log")"
task_main_objects_after="$(draft_objects_absent postgres 2>>"$task_log")"
if [[ "$task_main_ledger_after" != "$task_main_ledger_before" || "$task_main_objects_after" != "$task_main_objects_before" ]]; then
  printf '%s\n' "La base local principal cambió durante la revisión efímera." >&2
  exit 1
fi

printf '%s\n' \
  "Draft 0059: PASS en copia local efímera; baseline principal y ledger intactos."
