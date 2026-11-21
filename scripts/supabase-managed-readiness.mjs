#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_AUTH_MIGRATION_COUNT,
  EXPECTED_MANAGED_READINESS_COLUMNS,
  EXPECTED_STORAGE_MIGRATION_COUNT,
  evaluateManagedSchemaReadiness,
} from "./supabase-managed-readiness-policy.mjs";
import { verifyMaterializedSupabaseVersionPins } from "./supabase-version-pins-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedCliVersion = "2.115.0";
const timeoutMilliseconds = 120_000;
const pollMilliseconds = 1_000;

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_NO_UPDATE_NOTIFIER: "1" },
    shell: false,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (
    result.error ||
    result.signal ||
    result.status !== 0 ||
    typeof result.stdout !== "string" ||
    typeof result.stderr !== "string" ||
    result.stderr.trim()
  ) {
    const reason = result.error
      ? result.error.message
      : result.signal
        ? `señal ${result.signal}`
        : `exit ${String(result.status)}`;
    throw new Error(`${command} falló (${reason}).`);
  }
  return result.stdout.trim();
}

function localProjectId() {
  const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  const matches = [...config.matchAll(/^project_id\s*=\s*"([^"]+)"\s*$/gm)];
  if (
    matches.length !== 1 ||
    !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(matches[0][1])
  ) {
    throw new Error(
      "supabase/config.toml no contiene un project_id único y seguro.",
    );
  }
  return matches[0][1];
}

const snapshotSql = `select jsonb_build_object(
  'storageMigrations', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'hash', hash
    ) order by id), '[]'::jsonb)
    from storage.migrations
  ),
  'authMigrations', (
    select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
    from auth.schema_migrations
  ),
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'qualified', table_schema || '.' || table_name || '.' || column_name,
      'ordinalPosition', ordinal_position,
      'dataType', data_type,
      'udtName', udt_name,
      'nullable', is_nullable = 'YES',
      'default', column_default
    ) order by table_schema, table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where (table_schema, table_name, column_name) in (
      ('auth', 'mfa_factors', 'id'),
      ('auth', 'mfa_factors', 'user_id'),
      ('auth', 'mfa_factors', 'factor_type'),
      ('auth', 'mfa_factors', 'status'),
      ('auth', 'sessions', 'id'),
      ('auth', 'sessions', 'user_id'),
      ('auth', 'users', 'id'),
      ('auth', 'users', 'email'),
      ('storage', 'buckets', 'versioning_status'),
      ('storage', 'objects', 'archived_at'),
      ('storage', 'objects', 'is_delete_marker'),
      ('storage', 'objects', 'is_versioned')
    )
  )
)::text`;

function querySnapshot(container) {
  const output = run("docker", [
    "exec",
    container,
    "psql",
    "-X",
    "-A",
    "-t",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    snapshotSql,
  ]);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("psql no devolvió un único snapshot JSON válido.");
  }
  return parsed;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 0) {
    throw new Error("Este gate local no admite argumentos.");
  }
  const packageConfiguration = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  if (packageConfiguration.devDependencies?.supabase !== expectedCliVersion) {
    throw new Error(
      `package.json debe fijar Supabase CLI exactamente en ${expectedCliVersion}.`,
    );
  }
  const cliVersion = run(path.join(root, "node_modules/.bin/supabase"), [
    "--version",
  ]);
  if (cliVersion !== expectedCliVersion) {
    throw new Error(
      `Supabase CLI efectiva ${cliVersion || "(vacía)"}; se esperaba ${expectedCliVersion}.`,
    );
  }

  const githubActions =
    process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true";
  verifyMaterializedSupabaseVersionPins(root, {
    allowProviderState: true,
    requireRestrictiveModes: githubActions,
  });

  const container = `supabase_db_${localProjectId()}`;
  const deadline = Date.now() + timeoutMilliseconds;
  let lastPending = [];
  let lastQueryError;
  while (Date.now() < deadline) {
    let snapshot;
    try {
      snapshot = querySnapshot(container);
    } catch (error) {
      lastQueryError = error instanceof Error ? error.message : String(error);
    }
    if (snapshot) {
      const result = evaluateManagedSchemaReadiness(snapshot);
      if (result.errors.length > 0) {
        throw new Error(result.errors.join(" "));
      }
      if (result.ready) {
        console.log(
          `Supabase managed-schema readiness: PASS (Storage ${EXPECTED_STORAGE_MIGRATION_COUNT}/${EXPECTED_STORAGE_MIGRATION_COUNT}, Auth ${EXPECTED_AUTH_MIGRATION_COUNT}/${EXPECTED_AUTH_MIGRATION_COUNT}, ${EXPECTED_MANAGED_READINESS_COLUMNS.length}/${EXPECTED_MANAGED_READINESS_COLUMNS.length} firmas).`,
        );
        return;
      }
      lastPending = result.pending;
      lastQueryError = undefined;
    }
    await sleep(pollMilliseconds);
  }
  const detail = lastQueryError || lastPending.join(" ") || "sin snapshot";
  throw new Error(
    `Supabase no completó el schema administrado en ${timeoutMilliseconds / 1000}s: ${detail}.`,
  );
}

main().catch((error) => {
  console.error(
    `Supabase managed-schema readiness: BLOQUEADO — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
