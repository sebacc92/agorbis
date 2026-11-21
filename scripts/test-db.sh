#!/usr/bin/env bash
set -euo pipefail

task_db_container="${AGORBIS_DB_CONTAINER:-${GEOUNITY_DB_CONTAINER:-supabase_db_agorbis}}"
task_database_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54822/postgres}"

for test_file in supabase/tests/*_checks.sql; do
  if command -v psql >/dev/null 2>&1; then
    psql "$task_database_url" -v ON_ERROR_STOP=1 -f "$test_file"
  else
    docker exec -i "$task_db_container" psql -U postgres -d postgres \
      -v ON_ERROR_STOP=1 -f - < "$test_file"
  fi
done
