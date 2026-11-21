import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_MIGRATION_FILES,
  EXPECTED_D72_MIGRATION_FILE,
} from "./production-preflight-policy.mjs";
import {
  loadProductionBackupAssets,
  PRODUCTION_QUERY_POOLER_HOST,
  PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
} from "./production-backup-query-policy.mjs";
import {
  assertD72SupabaseCliArgs,
  assertD72SupabaseSanitizedGateResults,
  buildD72ProductionReadonlyEnvironment,
  buildD72ProductionReadonlyInvocation,
  buildD72RepositoryMigrationInventory,
  compareD72SupabaseCatalogDomains,
  compareD72SupabaseCatalogSnapshots,
  D72_SUPABASE_AGGREGATE_CHECK_IDS,
  D72_SUPABASE_CATALOG_SCHEMA_VERSION,
  D72_SUPABASE_CATALOG_DOMAIN_IDS,
  D72_SUPABASE_CHECKS_SCHEMA_VERSION,
  D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS,
  D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS,
  D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
  D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
  D72_SUPABASE_DB_PUSH_DRY_RUN_STATE,
  D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE,
  D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
  D72_SUPABASE_DOCKER_HOST,
  D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS,
  D72_SUPABASE_GATE_IDS,
  D72_SUPABASE_GATE_STATUS,
  D72_SUPABASE_MIGRATION_LIST_ARGS,
  D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX,
  D72_SUPABASE_PSQL_STDIN_ENTRYPOINT,
  D72_SUPABASE_PROJECT_REF,
  D72_SUPABASE_READONLY_POLICY_SHA256,
  D72_SUPABASE_READONLY_QUERY_IDS,
  D72_SUPABASE_READONLY_QUERY_SHA256,
  d72SupabaseCliArgs,
  d72SupabaseCatalogDomainDigests,
  d72SupabaseReadonlyQuery,
  d72SupabaseSanitizedEvidenceDigest,
  evaluateD72SupabaseReadonlyGates,
  parseD72DbPushDryRunResult,
  parseD72MigrationListResult,
  parseD72ProductionQueryOutput,
  validateD72SupabaseAggregateChecks,
  validateD72SupabaseCatalogSnapshot,
} from "./d72-supabase-readonly-policy.mjs";

assert.equal(process.versions.node, "22.22.0");
assert.equal(D72_SUPABASE_PROJECT_REF, "ibtvlvpxwourrxwcrfkf");
assert.match(D72_SUPABASE_READONLY_POLICY_SHA256, /^[0-9a-f]{64}$/);
assert.equal(D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.length, 73);
assert.equal(D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.at(-1), "0076");
assert.deepEqual(D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS, [
  "0062_search_ordered_pagination.sql",
  "0063_data_deletion_requests.sql",
  "0064_notification_preferences.sql",
  "0065_public_profile_handles.sql",
  "0066_google_auth_consent.sql",
  "0067_activate_google_auth_notice.sql",
  "0070_personalized_feed_filters.sql",
  "0071_public_member_search.sql",
  "0072_claim_institutional_response_clock.sql",
  "0073_turnstile_invisible_privacy_addendum.sql",
  "0074_agreements.sql",
  "0075_agreement_moderation.sql",
  "0076_argentina_local_governments.sql",
]);
assert.equal(
  D72_SUPABASE_DB_PUSH_DRY_RUN_STATE,
  "agorbis-d72-candidate-0062-0076/v1",
);
assert.deepEqual(D72_SUPABASE_READONLY_QUERY_IDS, [
  "aggregate-checks",
  "catalog",
]);

assert.deepEqual(D72_SUPABASE_MIGRATION_LIST_ARGS, [
  "migration",
  "list",
  "--project-ref",
  D72_SUPABASE_PROJECT_REF,
  "--output-format",
  "json",
  "--agent",
  "no",
]);
assert.deepEqual(D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS, [
  "db",
  "push",
  "--project-ref",
  D72_SUPABASE_PROJECT_REF,
  "--dry-run",
  "--skip-vault",
  "--output-format",
  "json",
  "--agent",
  "no",
]);
for (const [kind, expected] of [
  ["migration-list", D72_SUPABASE_MIGRATION_LIST_ARGS],
  ["db-push-dry-run", D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS],
]) {
  assert.equal(d72SupabaseCliArgs(kind), expected);
  assert.equal(assertD72SupabaseCliArgs(kind, [...expected]), true);
  assert(!expected.includes("--linked"));
  assert(!expected.includes("--include-all"));
  assert(!expected.includes("--include-roles"));
  assert(!expected.includes("--include-seed"));
  assert(!expected.includes("--password"));
  assert.throws(
    () => assertD72SupabaseCliArgs(kind, [...expected, "--linked"]),
    /no coincide exactamente/,
  );
}
assert.throws(() => d72SupabaseCliArgs("unknown"), /desconocido/);

for (const queryId of D72_SUPABASE_READONLY_QUERY_IDS) {
  const sql = d72SupabaseReadonlyQuery(queryId);
  assert.match(sql, /^with\b/);
  assert(!sql.includes("--"));
  assert(!sql.includes("/*"));
  assert(!sql.includes("\\"));
  assert.equal(D72_SUPABASE_READONLY_QUERY_SHA256[queryId].length, 64);
}
assert.match(
  d72SupabaseReadonlyQuery("catalog"),
  /'private'.*'public'.*'storage'/s,
);
assert.match(
  d72SupabaseReadonlyQuery("catalog"),
  /'relations'.*'columns'.*'constraints'.*'indexes'.*'policies'.*'grants'.*'functions'.*'triggers'.*'types'/s,
);
assert.match(
  d72SupabaseReadonlyQuery("aggregate-checks"),
  /d68\.individual-ballot-relations/,
);
assert.throws(() => d72SupabaseReadonlyQuery("other"), /desconocida/);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const assets = loadProductionBackupAssets(repositoryRoot);
const fakeProductionConnection = {
  database: "postgres",
  host: PRODUCTION_QUERY_POOLER_HOST,
  port: "5432",
  user: `postgres.${D72_SUPABASE_PROJECT_REF}`,
};
const invocation = buildD72ProductionReadonlyInvocation({
  assets,
  connection: fakeProductionConnection,
  imageId: PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
  queryId: "catalog",
});
assert.equal(invocation.command, "docker");
assert.deepEqual(invocation.args.slice(0, 4), [
  "--config",
  path.join(repositoryRoot, D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH),
  "--host",
  D72_SUPABASE_DOCKER_HOST,
]);
assert(invocation.args.includes("--read-only"));
assert(invocation.args.includes("--interactive"));
assert(invocation.args.includes("no-new-privileges"));
assert(invocation.args.includes(PRODUCTION_QUERY_POSTGRES_IMAGE_ID));
assert(
  !invocation.args.some(
    (entry, index) =>
      entry === "-e" && invocation.args[index + 1] === "PGPASSWORD",
  ),
);
assert(invocation.args.includes(D72_SUPABASE_PSQL_STDIN_ENTRYPOINT));
const commandSql = invocation.args.at(-1);
assert.match(commandSql, /^begin transaction read only; with\b/);
assert.match(commandSql, /; rollback$/);

const fakePassword = `fake-${"p".repeat(40)}`;
const environment = buildD72ProductionReadonlyEnvironment({
  assets,
  baseEnvironment: {
    DOCKER_CONFIG: "/tmp/attacker-config",
    DOCKER_CONTEXT: "attacker",
    DOCKER_HOST: "tcp://attacker.invalid:2375",
    PATH: "/usr/bin",
    UNAPPROVED: "must-not-pass",
  },
  connection: fakeProductionConnection,
  password: fakePassword,
});
assert.equal(environment.PGPASSWORD, undefined);
assert.equal(environment.PGSSLMODE, "verify-full");
assert.equal(environment.UNAPPROVED, undefined);
assert.equal(environment.DOCKER_HOST, undefined);
assert.equal(environment.DOCKER_CONTEXT, undefined);
assert.equal(
  environment.DOCKER_CONFIG,
  path.join(repositoryRoot, D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH),
);

const catalogFixture = {
  schemaVersion: D72_SUPABASE_CATALOG_SCHEMA_VERSION,
  schemas: ["private", "public", "storage"],
  relations: [
    {
      forceRls: true,
      kind: "r",
      name: "abuse_windows",
      owner: "postgres",
      persistence: "p",
      replicaIdentity: "d",
      rls: true,
      schema: "private",
      viewDefinition: null,
    },
    {
      forceRls: false,
      kind: "r",
      name: "profiles",
      owner: "postgres",
      persistence: "p",
      replicaIdentity: "d",
      rls: true,
      schema: "public",
      viewDefinition: null,
    },
    {
      forceRls: false,
      kind: "r",
      name: "objects",
      owner: "supabase_storage_admin",
      persistence: "p",
      replicaIdentity: "d",
      rls: true,
      schema: "storage",
      viewDefinition: null,
    },
  ],
  columns: [
    {
      collation: null,
      default: null,
      generated: "",
      identity: "",
      name: "scope",
      notNull: true,
      ordinal: 1,
      schema: "private",
      table: "abuse_windows",
      type: "text",
    },
    {
      collation: null,
      default: null,
      generated: "",
      identity: "",
      name: "id",
      notNull: true,
      ordinal: 1,
      schema: "public",
      table: "profiles",
      type: "uuid",
    },
    {
      collation: null,
      default: null,
      generated: "",
      identity: "",
      name: "name",
      notNull: true,
      ordinal: 1,
      schema: "storage",
      table: "objects",
      type: "text",
    },
  ],
  constraints: [],
  indexes: [],
  policies: [
    {
      check: null,
      command: "SELECT",
      name: "profiles_select_own",
      permissive: "PERMISSIVE",
      roles: ["authenticated"],
      schema: "public",
      table: "profiles",
      using: "is_member(community_id, auth.uid())",
    },
    {
      check: null,
      command: "SELECT",
      name: "objects_select_own",
      permissive: "PERMISSIVE",
      roles: ["authenticated"],
      schema: "storage",
      table: "objects",
      using: "(owner_id = auth.uid())",
    },
  ],
  grants: [
    {
      detail: "",
      grantable: false,
      grantee: "authenticated",
      grantor: "postgres",
      identity: "profiles",
      objectKind: "relation:r",
      privilege: "SELECT",
      schema: "public",
    },
  ],
  functions: [
    {
      arguments: "text, uuid, integer, interval",
      config: ['search_path=""'],
      definition:
        "CREATE FUNCTION private.consume_window_limit() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$",
      leakproof: false,
      name: "consume_window_limit",
      owner: "postgres",
      parallel: "u",
      result: "void",
      schema: "private",
      securityDefiner: true,
      volatility: "v",
    },
    {
      arguments: "uuid, uuid",
      config: ['search_path=""'],
      definition:
        "CREATE FUNCTION private.raw_is_member(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$",
      leakproof: false,
      name: "raw_is_member",
      owner: "postgres",
      parallel: "u",
      result: "boolean",
      schema: "private",
      securityDefiner: true,
      volatility: "s",
    },
  ],
  triggers: [
    {
      definition:
        "CREATE TRIGGER abuse_limit_guard BEFORE INSERT ON private.abuse_windows EXECUTE FUNCTION private.consume_window_limit()",
      enabled: "O",
      name: "abuse_limit_guard",
      schema: "private",
      table: "abuse_windows",
    },
  ],
  types: [],
};

// Candidate catalog surfaces are required in both local and remote snapshots.
for (const qualified of [
  "private.data_deletion_lookup_windows",
  "private.data_deletion_requests",
  "private.public_profile_handles",
  "private.google_auth_consent_barriers",
  "public.google_auth_notice_versions",
  "public.user_google_auth_consent_events",
  "public.notification_preferences",
  "public.notifications",
]) {
  const [schema, name] = qualified.split(".");
  catalogFixture.relations.push({
    forceRls: false,
    kind: "r",
    name,
    owner: "postgres",
    persistence: "p",
    replicaIdentity: "d",
    rls: true,
    schema,
    viewDefinition: null,
  });
}
for (const name of [
  "mark_notifications_read",
  "notification_communities",
  "notification_inbox",
]) {
  catalogFixture.functions.push({
    arguments: "",
    config: ['search_path=""'],
    definition: `CREATE FUNCTION public.${name}() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$`,
    leakproof: false,
    name,
    owner: "postgres",
    parallel: "u",
    result: "jsonb",
    schema: "public",
    securityDefiner: false,
    volatility: "s",
  });
}
for (const qualified of [
  "private.guard_google_auth_notice",
  "public.current_google_auth_notice",
  "public.my_google_auth_consent",
  "public.grant_google_auth_consent",
  "public.withdraw_google_auth_consent",
]) {
  const [schema, name] = qualified.split(".");
  catalogFixture.functions.push({
    arguments: "",
    config: ['search_path=""'],
    definition: `CREATE FUNCTION ${schema}.${name}() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$`,
    leakproof: false,
    name,
    owner: "postgres",
    parallel: "u",
    result: "jsonb",
    schema,
    securityDefiner: true,
    volatility: "v",
  });
}
for (const [table, name] of [
  ["google_auth_notice_versions", "google_auth_notice_guard"],
  ["notifications", "notifications_apply_preferences"],
  ["profiles", "profiles_reserve_public_handle"],
]) {
  catalogFixture.triggers.push({
    definition: `CREATE TRIGGER ${name} AFTER INSERT ON public.${table} EXECUTE FUNCTION private.${name}()`,
    enabled: "O",
    name,
    schema: "public",
    table,
  });
}
for (const [section, key] of [
  ["relations", (entry) => `${entry.schema}\0${entry.name}\0${entry.kind}`],
  [
    "functions",
    (entry) => `${entry.schema}\0${entry.name}\0${entry.arguments}`,
  ],
  ["triggers", (entry) => `${entry.schema}\0${entry.table}\0${entry.name}`],
])
  catalogFixture[section].sort((left, right) =>
    key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0,
  );

assert.equal(
  validateD72SupabaseCatalogSnapshot(catalogFixture),
  catalogFixture,
);
assert.equal(
  parseD72ProductionQueryOutput(
    "catalog",
    `${JSON.stringify(structuredClone(catalogFixture))}\n`,
  ).schemaVersion,
  D72_SUPABASE_CATALOG_SCHEMA_VERSION,
);
assert.throws(
  () =>
    validateD72SupabaseCatalogSnapshot({
      ...structuredClone(catalogFixture),
      unexpected: true,
    }),
  /campos faltantes o no aprobados/,
);
const unsortedCatalog = structuredClone(catalogFixture);
unsortedCatalog.relations.reverse();
assert.throws(
  () => validateD72SupabaseCatalogSnapshot(unsortedCatalog),
  /ordenado canónicamente/,
);

// D103: dos sobrecargas cuyas identidades comparten los primeros 63 bytes
// siguen siendo dos grants distintos; truncadas, el validador las rechaza.
const catalogSql = d72SupabaseReadonlyQuery("catalog");
assert.match(catalogSql, /n\.nspname::text as object_identity/);
assert(!/n\.nspname as object_identity/.test(catalogSql));

const grantKey = (entry) =>
  [
    entry.objectKind,
    entry.schema,
    entry.identity,
    entry.detail,
    entry.grantee,
    entry.privilege,
    entry.grantor,
    String(entry.grantable),
  ].join("\0");
const byGrantKey = (left, right) =>
  grantKey(left) < grantKey(right)
    ? -1
    : grantKey(left) > grantKey(right)
      ? 1
      : 0;
const longPrefix =
  "global_search(p_query text, p_kind text, p_community uuid, p_status text, p_limit integer, p_offset integer";
const overloadGrants = [`${longPrefix})`, `${longPrefix}, p_sort text)`].map(
  (identity) => ({
    detail: "",
    grantable: false,
    grantee: "anon",
    grantor: "postgres",
    identity,
    objectKind: "function",
    privilege: "EXECUTE",
    schema: "public",
  }),
);
assert(overloadGrants.every((grant) => Buffer.byteLength(grant.identity) > 63));
assert.equal(
  overloadGrants[0].identity.slice(0, 63),
  overloadGrants[1].identity.slice(0, 63),
);

const longIdentityCatalog = structuredClone(catalogFixture);
longIdentityCatalog.grants = [
  ...longIdentityCatalog.grants,
  ...overloadGrants,
].sort(byGrantKey);
validateD72SupabaseCatalogSnapshot(longIdentityCatalog);

const truncatedIdentityCatalog = structuredClone(longIdentityCatalog);
truncatedIdentityCatalog.grants = truncatedIdentityCatalog.grants
  .map((grant) => ({ ...grant, identity: grant.identity.slice(0, 63) }))
  .sort(byGrantKey);
assert.throws(
  () => validateD72SupabaseCatalogSnapshot(truncatedIdentityCatalog),
  /identidades duplicadas/,
);

const aggregateFixture = {
  checks: D72_SUPABASE_AGGREGATE_CHECK_IDS.map((id) => ({
    id,
    invalidRowCount: "0",
  })),
  schemaVersion: D72_SUPABASE_CHECKS_SCHEMA_VERSION,
};
assert.equal(
  validateD72SupabaseAggregateChecks(aggregateFixture),
  aggregateFixture,
);
assert.equal(
  parseD72ProductionQueryOutput(
    "aggregate-checks",
    `${JSON.stringify(structuredClone(aggregateFixture))}\n`,
  ).checks.length,
  D72_SUPABASE_AGGREGATE_CHECK_IDS.length,
);
const extraCheck = structuredClone(aggregateFixture);
extraCheck.checks[0].rawRows = [];
assert.throws(
  () => validateD72SupabaseAggregateChecks(extraCheck),
  /campos faltantes o no aprobados/,
);
const malformedCount = structuredClone(aggregateFixture);
malformedCount.checks[0].invalidRowCount = "01";
assert.throws(
  () => validateD72SupabaseAggregateChecks(malformedCount),
  /conteo decimal canónico/,
);

const migrationRows = D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.map(
  (version) => ({ local: version, remote: version, time: version }),
);
const migrationResult = parseD72MigrationListResult({
  error: null,
  signal: null,
  status: 0,
  stderr: `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n`,
  stdout: `${JSON.stringify({
    migrations: migrationRows,
    message: "Migrations listed",
  })}\n`,
});
assert.equal(migrationResult.state, "APPLIED_EXACT");
assert.equal(migrationResult.localMaximumVersion, "0076");
assert.equal(migrationResult.remoteMaximumVersion, "0076");
assert.equal(migrationResult.production0059Present, false);
assert.equal(migrationResult.production0060Present, true);
const preparedMigrationRows = migrationRows.map((row) =>
  row.local > "0061" ? { ...row, remote: "" } : row,
);
assert.equal(
  parseD72MigrationListResult({
    error: null,
    signal: null,
    status: 0,
    stderr: `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n`,
    stdout: `${JSON.stringify({
      migrations: preparedMigrationRows,
      message: "Migrations listed",
    })}\n`,
  }).state,
  "PREPARED_NOT_APPLIED",
);
assert.equal(
  parseD72MigrationListResult({
    error: null,
    signal: null,
    status: 0,
    stderr:
      `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n` +
      D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE,
    stdout: `${JSON.stringify({
      migrations: migrationRows,
      message: "Migrations listed",
    })}\n`,
  }).state,
  "APPLIED_EXACT",
);

for (const rows of [
  migrationRows.filter((row) => row.local <= "0061"),
  migrationRows.filter((row) => row.local <= "0065"),
  migrationRows.filter((row) => row.local <= "0066"),
  migrationRows.map((row) =>
    row.local === "0072" ? { ...row, remote: "" } : row,
  ),
  preparedMigrationRows.map((row) =>
    row.local === "0062" ? { ...row, remote: "0062" } : row,
  ),
]) {
  assert.equal(
    parseD72MigrationListResult({
      error: null,
      signal: null,
      status: 0,
      stderr: `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n`,
      stdout: `${JSON.stringify({ migrations: rows, message: "Migrations listed" })}\n`,
    }).state,
    "INVALID",
    "baseline61 and partial application cannot certify the candidate",
  );
}
for (const invalidPreamble of [
  D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.slice(1),
  D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.slice(0, -1),
  [
    D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX[1],
    D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX[0],
    D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX[2],
  ],
  [
    D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX[0],
    D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX[0],
    ...D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.slice(1),
  ],
  [...D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX, "unexpected"],
]) {
  assert.throws(
    () =>
      parseD72MigrationListResult({
        error: null,
        signal: null,
        status: 0,
        stderr: `${invalidPreamble.join("\n")}\n`,
        stdout: `${JSON.stringify({
          migrations: migrationRows,
          message: "Migrations listed",
        })}\n`,
      }),
    /preámbulo remoto exacto/,
  );
}
assert.throws(
  () =>
    parseD72MigrationListResult({
      error: null,
      signal: null,
      status: 0,
      stderr: `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n`,
      stdout: `${JSON.stringify(
        { message: "Migrations listed", migrations: migrationRows },
        null,
        2,
      )}\n`,
    }),
  /JSON canónico exacto/,
);
assert.throws(
  () =>
    parseD72MigrationListResult({
      error: null,
      signal: null,
      status: 0,
      stderr: `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n`,
      stdout: `${JSON.stringify({
        message: "Migrations listed",
        migrations: migrationRows,
      })}\n`,
    }),
  /JSON canónico exacto/,
);

const exactDryRunStderr = `${D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.join(
  "\n",
)}\n`;
const upToDateDryRunStdout = `${JSON.stringify({
  dryRun: true,
  message: "Remote database is up to date.",
  migrations: [],
  roles: [],
  seeds: [],
  upToDate: true,
})}\n`;
const parseUpToDateDryRun = (stderr) =>
  parseD72DbPushDryRunResult({
    error: null,
    signal: null,
    status: 0,
    stderr,
    stdout: upToDateDryRunStdout,
  });

const dryRunResult = parseUpToDateDryRun(exactDryRunStderr);
assert.equal(
  parseUpToDateDryRun(
    `${exactDryRunStderr}${D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE}`,
  ).upToDate,
  true,
);
assert.throws(
  () =>
    parseUpToDateDryRun(
      [
        D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[0],
        ...D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE.trimEnd().split("\n"),
        ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(1),
        "",
      ].join("\n"),
    ),
  /stderr inválido/,
);
assert.deepEqual(dryRunResult.changeCounts, {
  migrations: 0,
  roles: 0,
  seeds: 0,
  vault: 0,
});
assert.throws(
  () =>
    parseD72DbPushDryRunResult({
      error: null,
      signal: null,
      status: 0,
      stderr: exactDryRunStderr,
      stdout: `${JSON.stringify({
        dryRun: false,
        message: "Remote database is up to date.",
        migrations: [],
        roles: [],
        seeds: [],
        upToDate: true,
      })}\n`,
    }),
  /dryRun=true/,
);
assert.throws(
  () =>
    parseD72DbPushDryRunResult({
      error: null,
      signal: null,
      status: 0,
      stderr: "Finished supabase db push.\n",
      stdout: `${JSON.stringify({
        dryRun: false,
        message: "Finished supabase db push.",
        migrations: ["0061_unexpected.sql"],
        roles: [],
        seeds: [],
        upToDate: false,
      })}\n`,
    }),
  /dryRun=true/,
);
assert.throws(
  () =>
    parseD72DbPushDryRunResult({
      error: null,
      signal: null,
      status: 0,
      stderr: exactDryRunStderr,
      stdout: upToDateDryRunStdout.slice(0, -3),
    }),
  /único JSON válido/,
);

const malformedDryRunPreambles = [
  D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(1),
  D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(0, -1),
  [
    D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[0],
    D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[0],
    ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(1),
  ],
  [
    D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[1],
    D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[0],
    ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(2),
  ],
  [
    "Initializing login role...",
    ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(1),
  ],
  [
    ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.slice(0, -1),
    'Skipping migration 0016_other.sql.audit.json... (file name must match pattern "<timestamp>_name.sql")',
  ],
  [
    "DRY RUN: migrations will *not* be pushed to the database.",
    "Connecting to remote database...",
  ],
];
for (const preamble of malformedDryRunPreambles) {
  assert.throws(
    () => parseUpToDateDryRun(`${preamble.join("\n")}\n`),
    /preámbulo dry-run remoto exacto/,
  );
}
for (const extraLine of [
  "Unexpected preamble",
  "Initialising login role...",
  "Would push these migrations:",
]) {
  assert.throws(
    () => parseUpToDateDryRun(`${exactDryRunStderr}${extraLine}\n`),
    /stderr adicional no aprobado/,
  );
}
for (const stderr of [
  exactDryRunStderr.replace(
    `${D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[1]}\n`,
    `${D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX[1]}\n\n`,
  ),
  `${exactDryRunStderr}\n`,
]) {
  assert.throws(
    () => parseUpToDateDryRun(stderr),
    /líneas vacías no aprobadas|stderr inválido/,
  );
}
assert.throws(
  () =>
    parseD72DbPushDryRunResult({
      error: null,
      signal: null,
      status: 1,
      stderr: exactDryRunStderr,
      stdout: upToDateDryRunStdout,
    }),
  /no terminó exitosamente/,
);

const pendingChangeStdout = ({ migrations = [], roles = [], seeds = [] }) =>
  `${JSON.stringify({
    dryRun: true,
    message: "Finished supabase db push.",
    migrations,
    roles,
    seeds,
    upToDate: false,
  })}\n`;
for (const unsafeChange of [
  {
    stderr: `${exactDryRunStderr}Would seed these files:\n • supabase/seed.sql\n`,
    stdout: pendingChangeStdout({ seeds: ["supabase/seed.sql"] }),
  },
  {
    stderr: `${exactDryRunStderr}Would create custom roles supabase/roles.sql...\n`,
    stdout: pendingChangeStdout({ roles: ["supabase/roles.sql"] }),
  },
  {
    stderr: `${exactDryRunStderr}Would update Vault secrets:\n`,
    stdout: upToDateDryRunStdout,
  },
]) {
  assert.throws(
    () =>
      parseD72DbPushDryRunResult({
        error: null,
        signal: null,
        status: 0,
        ...unsafeChange,
      }),
    /único preámbulo pendiente aprobado|stderr adicional no aprobado/,
  );
}

const repositoryMigrationFiles = [
  ...D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.filter(
    (version) => version < "0061",
  ).map((version) => `${version}_fixture.sql`),
  EXPECTED_D72_MIGRATION_FILE,
  ...CANDIDATE_MIGRATION_FILES,
];
const repositoryMigrations = buildD72RepositoryMigrationInventory({
  draftFileNames: ["0059_sensitive_consent.sql"],
  executableFileNames: repositoryMigrationFiles,
});
assert.equal(repositoryMigrations.exactExecutableLedger, true);
assert.equal(repositoryMigrations.draft0059Present, true);
assert.equal(repositoryMigrations.executable0059Present, false);
assert.equal(repositoryMigrations.executable0060Present, true);
for (const renamed of [
  EXPECTED_D72_MIGRATION_FILE,
  ...CANDIDATE_MIGRATION_FILES,
]) {
  const renamedRepositoryMigrations = buildD72RepositoryMigrationInventory({
    draftFileNames: ["0059_sensitive_consent.sql"],
    executableFileNames: repositoryMigrationFiles.map((fileName) =>
      fileName === renamed
        ? `${fileName.slice(0, 4)}_unexpected.sql`
        : fileName,
    ),
  });
  assert.equal(renamedRepositoryMigrations.exactExecutableLedger, false);
}
const invalidRepositoryMigrations = buildD72RepositoryMigrationInventory({
  draftFileNames: ["0059_sensitive_consent.sql"],
  executableFileNames: ["0059_sensitive_consent.sql"],
});
assert.equal(invalidRepositoryMigrations.exactExecutableLedger, false);
assert.equal(invalidRepositoryMigrations.executable0059Present, true);

const comparison = compareD72SupabaseCatalogSnapshots(
  catalogFixture,
  structuredClone(catalogFixture),
);
assert.equal(comparison.matches, true);
assert.equal(comparison.localDigest, comparison.productionDigest);
assert.deepEqual(
  Object.keys(d72SupabaseCatalogDomainDigests(catalogFixture)),
  D72_SUPABASE_CATALOG_DOMAIN_IDS,
);
assert(
  Object.values(
    compareD72SupabaseCatalogDomains(
      catalogFixture,
      structuredClone(catalogFixture),
    ),
  ).every(({ matches }) => matches),
);

const head = "9".repeat(40);
const observedAt = "2026-08-31T18:00:00.000Z";
const localContracts = {
  antiAbusePassed: true,
  d68Passed: true,
  dataIntegrityPassed: true,
  head,
  residencyPassed: true,
  rlsPassed: true,
};
const gateCatalogFixture = structuredClone(catalogFixture);
for (const qualifiedName of [
  "private.budget_proposal_tallies",
  "private.poll_option_tallies",
  "public.budget_participation_receipts",
  "public.budget_proposals",
  "public.claim_supports",
  "public.claims",
  "public.comment_votes",
  "public.debate_comments",
  "public.poll_options",
  "public.poll_participation_receipts",
]) {
  const [schema, name] = qualifiedName.split(".");
  gateCatalogFixture.relations.push({
    forceRls: false,
    kind: "r",
    name,
    owner: "postgres",
    persistence: "p",
    replicaIdentity: "d",
    rls: true,
    schema,
    viewDefinition: null,
  });
}
gateCatalogFixture.relations.sort((left, right) => {
  const leftKey = `${left.schema}\0${left.name}\0${left.kind}`;
  const rightKey = `${right.schema}\0${right.name}\0${right.kind}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
});
validateD72SupabaseCatalogSnapshot(gateCatalogFixture);
const passInput = {
  aggregateChecks: aggregateFixture,
  dbPushDryRun: dryRunResult,
  head,
  localCatalog: gateCatalogFixture,
  localContracts,
  migrationList: migrationResult,
  observedAt,
  productionCatalog: structuredClone(gateCatalogFixture),
  repositoryMigrations,
};
const passing = evaluateD72SupabaseReadonlyGates(passInput);
assert.deepEqual(
  passing.map(({ gateId }) => gateId),
  D72_SUPABASE_GATE_IDS,
);
assert(passing.every(({ status }) => status === D72_SUPABASE_GATE_STATUS.PASS));
assert.equal(assertD72SupabaseSanitizedGateResults(passing), passing);
assert.match(d72SupabaseSanitizedEvidenceDigest(passing), /^[0-9a-f]{64}$/);
const serializedPassing = JSON.stringify(passing);
assert(!serializedPassing.includes(D72_SUPABASE_PROJECT_REF));
assert(!serializedPassing.includes("CREATE FUNCTION"));
assert(!serializedPassing.includes(fakePassword));
assert(!serializedPassing.includes("migrationRows"));

const emptyCatalog = {
  columns: [],
  constraints: [],
  functions: [],
  grants: [],
  indexes: [],
  policies: [],
  relations: [],
  schemaVersion: D72_SUPABASE_CATALOG_SCHEMA_VERSION,
  schemas: ["private", "public", "storage"],
  triggers: [],
  types: [],
};
const emptyCatalogResults = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  localCatalog: structuredClone(emptyCatalog),
  productionCatalog: structuredClone(emptyCatalog),
});
assert.equal(emptyCatalogResults[0].status, D72_SUPABASE_GATE_STATUS.PASS);
assert.equal(
  emptyCatalogResults.find(
    ({ gateId }) => gateId === "privacy.no-individual-ballots",
  ).status,
  D72_SUPABASE_GATE_STATUS.PASS,
);
assert(
  emptyCatalogResults
    .filter(
      ({ gateId }) =>
        ![
          "database.expected-migrations-only",
          "privacy.no-individual-ballots",
        ].includes(gateId),
    )
    .every(({ status }) => status === D72_SUPABASE_GATE_STATUS.FAIL),
);
assert(
  emptyCatalogResults
    .filter(({ evidence }) =>
      Object.hasOwn(evidence, "minimumCatalogContractPassed"),
    )
    .every(({ evidence }) => evidence.minimumCatalogContractPassed === false),
);

const noEvidence = evaluateD72SupabaseReadonlyGates({ head, observedAt });
assert(
  noEvidence.every(
    ({ status }) => status === D72_SUPABASE_GATE_STATUS.NOT_VERIFIED,
  ),
);

const failedIntegrityPayload = structuredClone(aggregateFixture);
failedIntegrityPayload.checks.find(
  ({ id }) => id === "integrity.claim-support-count-mismatch",
).invalidRowCount = "2";
const failedIntegrity = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  aggregateChecks: failedIntegrityPayload,
});
assert.equal(
  failedIntegrity.find(
    ({ gateId }) => gateId === "data.integrity-no-corruption",
  ).status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

const failedD68Payload = structuredClone(aggregateFixture);
failedD68Payload.checks.find(
  ({ id }) => id === "d68.individual-ballot-relations",
).invalidRowCount = "1";
const failedD68 = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  aggregateChecks: failedD68Payload,
});
assert.equal(
  failedD68.find(({ gateId }) => gateId === "privacy.no-individual-ballots")
    .status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

const providerManagedStorageDivergence = structuredClone(gateCatalogFixture);
providerManagedStorageDivergence.relations.find(
  ({ schema, name }) => schema === "storage" && name === "objects",
).name = "iceberg_namespaces";
const providerManagedColumn = providerManagedStorageDivergence.columns.find(
  ({ schema, table }) => schema === "storage" && table === "objects",
);
providerManagedColumn.table = "iceberg_namespaces";
providerManagedColumn.type = "varchar";
const providerDivergent = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  productionCatalog: providerManagedStorageDivergence,
});
assert.equal(
  compareD72SupabaseCatalogSnapshots(
    gateCatalogFixture,
    providerManagedStorageDivergence,
  ).matches,
  false,
);
for (const gateId of D72_SUPABASE_GATE_IDS.slice(1)) {
  assert.equal(
    providerDivergent.find((result) => result.gateId === gateId).status,
    D72_SUPABASE_GATE_STATUS.PASS,
  );
}

const appRlsDivergence = structuredClone(gateCatalogFixture);
appRlsDivergence.relations.find(
  ({ schema, name }) => schema === "public" && name === "profiles",
).rls = false;
const failedAppRls = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  productionCatalog: appRlsDivergence,
});
assert.equal(
  failedAppRls.find(({ gateId }) => gateId === "security.rls-enforced").status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

for (const mutate of [
  (catalog) => {
    catalog.functions.find(
      ({ name }) => name === "grant_google_auth_consent",
    ).definition += " altered";
  },
  (catalog) => {
    catalog.functions.find(
      ({ name }) => name === "my_google_auth_consent",
    ).securityDefiner = false;
  },
  (catalog) => {
    catalog.triggers.find(
      ({ name }) => name === "google_auth_notice_guard",
    ).enabled = "D";
  },
  (catalog) => {
    catalog.relations.find(
      ({ name }) => name === "google_auth_consent_barriers",
    ).rls = false;
  },
  (catalog) => {
    catalog.functions.find(
      ({ name }) => name === "notification_inbox",
    ).definition += " altered";
  },
  (catalog) => {
    catalog.triggers = catalog.triggers.filter(
      ({ name }) => name !== "notifications_apply_preferences",
    );
  },
  (catalog) => {
    catalog.triggers.find(
      ({ name }) => name === "profiles_reserve_public_handle",
    ).enabled = "D";
  },
  (catalog) => {
    catalog.relations.find(
      ({ name }) => name === "notification_preferences",
    ).rls = false;
  },
]) {
  const divergent = structuredClone(gateCatalogFixture);
  mutate(divergent);
  assert.equal(
    evaluateD72SupabaseReadonlyGates({
      ...passInput,
      productionCatalog: divergent,
    }).find(({ gateId }) => gateId === "security.rls-enforced").status,
    "FAIL",
  );
}
const missingInBoth = structuredClone(gateCatalogFixture);
missingInBoth.functions = missingInBoth.functions.filter(
  ({ name }) => name !== "notification_inbox",
);
assert.equal(
  evaluateD72SupabaseReadonlyGates({
    ...passInput,
    localCatalog: missingInBoth,
    productionCatalog: missingInBoth,
  }).find(({ gateId }) => gateId === "security.rls-enforced").status,
  "FAIL",
  "matching incomplete catalogs are not evidence",
);
for (const name of [
  "current_google_auth_notice",
  "grant_google_auth_consent",
  "withdraw_google_auth_consent",
  "guard_google_auth_notice",
]) {
  const matchingButIncomplete = structuredClone(gateCatalogFixture);
  matchingButIncomplete.functions = matchingButIncomplete.functions.filter(
    (entry) => entry.name !== name,
  );
  assert.equal(
    evaluateD72SupabaseReadonlyGates({
      ...passInput,
      localCatalog: matchingButIncomplete,
      productionCatalog: matchingButIncomplete,
    }).find(({ gateId }) => gateId === "security.rls-enforced").status,
    "FAIL",
    `matching catalogs missing ${name} cannot certify Google consent`,
  );
}
const sequenceGrantDivergence = structuredClone(gateCatalogFixture);
sequenceGrantDivergence.grants.unshift(
  {
    detail: "",
    grantable: false,
    grantee: "anon",
    grantor: "postgres",
    identity: "activation_events_id_seq",
    objectKind: "relation:S",
    privilege: "SELECT",
    schema: "public",
  },
  {
    detail: "",
    grantable: false,
    grantee: "anon",
    grantor: "postgres",
    identity: "activation_events_id_seq",
    objectKind: "relation:S",
    privilege: "USAGE",
    schema: "public",
  },
);
const failedSequenceGrant = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  productionCatalog: sequenceGrantDivergence,
});
assert.equal(
  failedSequenceGrant.find(({ gateId }) => gateId === "security.rls-enforced")
    .status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

const residencyDivergence = structuredClone(gateCatalogFixture);
residencyDivergence.functions.find(
  ({ name }) => name === "raw_is_member",
).definition += " ";
const failedResidency = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  productionCatalog: residencyDivergence,
});
assert.equal(
  failedResidency.find(
    ({ gateId }) => gateId === "authorization.residency-write-boundary",
  ).status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

const antiAbuseDivergence = structuredClone(gateCatalogFixture);
antiAbuseDivergence.triggers[0].enabled = "D";
const failedAntiAbuse = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  productionCatalog: antiAbuseDivergence,
});
assert.equal(
  failedAntiAbuse.find(({ gateId }) => gateId === "security.anti-abuse-limits")
    .status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

const localFailure = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  localContracts: { ...localContracts, antiAbusePassed: false },
});
assert.equal(
  localFailure.find(({ gateId }) => gateId === "security.anti-abuse-limits")
    .status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

for (const unexpectedMigration of [
  "0060_activate_pending_external_evidence_legal_notices.sql",
  "0062_unexpected.sql",
  D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS[0],
]) {
  assert.throws(
    () =>
      parseD72DbPushDryRunResult({
        error: null,
        signal: null,
        status: 0,
        stderr: [
          ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
          D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
          ` • ${unexpectedMigration}`,
          "",
        ].join("\n"),
        stdout: pendingChangeStdout({ migrations: [unexpectedMigration] }),
      }),
    /migración no aprobada por agorbis-d72-candidate-0062-0076\/v1/,
  );
}
const approvedPendingMigration = parseD72DbPushDryRunResult({
  error: null,
  signal: null,
  status: 0,
  stderr: [
    ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
    D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
    ...D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS.map(
      (file) => ` • ${file}`,
    ),
    "",
  ].join("\n"),
  stdout: pendingChangeStdout({
    migrations: [...D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS],
  }),
});
assert.equal(approvedPendingMigration.upToDate, false);
assert.deepEqual(approvedPendingMigration.migrations, [
  "0062_search_ordered_pagination.sql",
  "0063_data_deletion_requests.sql",
  "0064_notification_preferences.sql",
  "0065_public_profile_handles.sql",
  "0066_google_auth_consent.sql",
  "0067_activate_google_auth_notice.sql",
  "0070_personalized_feed_filters.sql",
  "0071_public_member_search.sql",
  "0072_claim_institutional_response_clock.sql",
  "0073_turnstile_invisible_privacy_addendum.sql",
  "0074_agreements.sql",
  "0075_agreement_moderation.sql",
  "0076_argentina_local_governments.sql",
]);
assert.throws(
  () =>
    parseD72DbPushDryRunResult({
      error: null,
      signal: null,
      status: 0,
      stderr: [
        ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
        D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
        " • 0061_unexpected.sql",
        " • 0061_unexpected.sql",
        "",
      ].join("\n"),
      stdout: pendingChangeStdout({
        migrations: ["0061_unexpected.sql", "0061_unexpected.sql"],
      }),
    }),
  /migrations contiene duplicados/,
);
for (const changedLines of [
  [" • 0061_unexpected.sql", D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER],
  [D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER],
  [
    D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
    " • 0061_unexpected.sql",
    " • 0061_unexpected.sql",
  ],
  [
    D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
    " • 0061_unexpected.sql (hash update)",
  ],
]) {
  assert.throws(
    () =>
      parseUpToDateDryRun(
        [
          ...D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
          ...changedLines,
          "",
        ].join("\n"),
      ),
    /stderr adicional no aprobado/,
  );
}
const databaseFailure = evaluateD72SupabaseReadonlyGates({
  ...passInput,
  dbPushDryRun: {
    ...dryRunResult,
    changeCounts: { ...dryRunResult.changeCounts, migrations: 1 },
    migrations: ["0061_unexpected.sql"],
    upToDate: false,
  },
});
assert.equal(
  databaseFailure.find(
    ({ gateId }) => gateId === "database.expected-migrations-only",
  ).status,
  D72_SUPABASE_GATE_STATUS.FAIL,
);

assert.throws(
  () =>
    evaluateD72SupabaseReadonlyGates({
      ...passInput,
      localContracts: { ...localContracts, head: "8".repeat(40) },
    }),
  /otro HEAD/,
);
assert.throws(
  () =>
    assertD72SupabaseSanitizedGateResults([
      ...passing.slice(0, -1),
      {
        ...passing.at(-1),
        evidence: { sql: "select secret from private.table" },
      },
    ]),
  /no es un campo de evidencia saneada/,
);

console.log("d72 supabase readonly policy tests: ok");
