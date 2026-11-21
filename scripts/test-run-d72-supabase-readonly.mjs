import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  D72_SUPABASE_AGGREGATE_CHECK_IDS,
  D72_SUPABASE_CATALOG_SCHEMA_VERSION,
  D72_SUPABASE_CHECKS_SCHEMA_VERSION,
  D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS,
  D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
  D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
  D72_SUPABASE_DOCKER_HOST,
  D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS,
  D72_SUPABASE_LOCAL_DB_TEST_SHA256,
  D72_SUPABASE_MIGRATION_LIST_ARGS,
  D72_SUPABASE_PSQL_STDIN_ENTRYPOINT,
  D72_SUPABASE_PROJECT_REF,
  D72_SUPABASE_READONLY_POLICY_SHA256,
  D72_SUPABASE_READONLY_QUERY_IDS,
  buildD72ProductionReadonlyEnvironment,
  buildD72ProductionReadonlyInvocation,
  parseD72ProductionQueryOutput,
} from "./d72-supabase-readonly-policy.mjs";
import {
  EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR,
  PRODUCTION_QUERY_POOLER_HOST,
  loadProductionBackupAssets,
} from "./production-backup-query-policy.mjs";
import {
  D72_SUPABASE_READONLY_CLI_BINARY_PATH,
  D72_SUPABASE_READONLY_ERROR_CODES,
  D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
  D72_SUPABASE_READONLY_REMOTE_INPUT_SCHEMA_VERSION,
  D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION,
  D72_SUPABASE_READONLY_FRESHNESS_MS,
  D72SupabaseReadonlyRunnerError,
  assertD72SupabaseReadonlyReceipt,
  collectD72SupabaseCliBinaryEvidence,
  d72SupabaseReadonlyReceiptContentSha256,
  readD72SupabaseDatabasePasswordFromTty,
  readD72SupabaseReadonlyRemoteChildInput,
  runD72SupabaseReadonly,
  runD72SupabaseReadonlyMain,
  runD72SupabaseReadonlyRemoteChild,
  runD72SupabaseReadonlyRemoteChildMain,
  spawnD72SupabaseReadonlyRemoteChild,
  validateD72SupabaseCliBinaryEvidence,
  validateD72SupabaseReadonlyReceiptStructure,
} from "./run-d72-supabase-readonly.mjs";

assert.equal(
  process.versions.node,
  D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION,
);

const head = "a".repeat(40);
const secret = "fake-d72-database-password";
const rawSentinel = "RAW_CATALOG_SENTINEL_MUST_NOT_ESCAPE";
const harnessSentinel = "RAW_HARNESS_SENTINEL_MUST_NOT_ESCAPE";
const fixedNow = new Date("2026-08-31T20:00:00.000Z");
const canonicalAuthContext = Object.freeze({
  DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
  GNOME_KEYRING_CONTROL: "/run/user/1000/keyring",
  HOME: "/home/fake",
  XDG_RUNTIME_DIR: "/run/user/1000",
});
const migrationRows = D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.map(
  (version) => ({ local: version, remote: version, time: version }),
);
const migrationListStdout = `${JSON.stringify({
  migrations: migrationRows,
  message: "Migrations listed",
})}\n`;
const migrationListStderr = [
  "Initialising login role...",
  "Connecting to remote database...",
  'Skipping migration 0016_world_subdivisions.sql.audit.json... (file name must match pattern "<timestamp>_name.sql")',
  "",
].join("\n");
const dbPushDryRunStdout = `${JSON.stringify({
  dryRun: true,
  message: "Remote database is up to date.",
  migrations: [],
  roles: [],
  seeds: [],
  upToDate: true,
})}\n`;
const dbPushDryRunStderr = `${D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.join(
  "\n",
)}\n`;
const productionConnection = Object.freeze({
  database: "postgres",
  host: PRODUCTION_QUERY_POOLER_HOST,
  port: "5432",
  user: `postgres.${D72_SUPABASE_PROJECT_REF}`,
});

const catalogFixture = {
  columns: [],
  constraints: [],
  functions: [
    {
      arguments: "text, uuid, integer, interval",
      config: ['search_path=""'],
      definition: `CREATE FUNCTION private.consume_window_limit() RETURNS void LANGUAGE plpgsql AS $$ BEGIN /* ${rawSentinel} */ RETURN; END $$`,
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
  indexes: [],
  policies: [
    {
      check: null,
      command: "SELECT",
      name: "profiles_select_resident",
      permissive: "PERMISSIVE",
      roles: ["authenticated"],
      schema: "public",
      table: "profiles",
      using: "is_member(community_id, auth.uid())",
    },
  ],
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
  ],
  schemaVersion: D72_SUPABASE_CATALOG_SCHEMA_VERSION,
  schemas: ["private", "public", "storage"],
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
catalogFixture.relations.sort((left, right) => {
  const leftKey = `${left.schema}\0${left.name}\0${left.kind}`;
  const rightKey = `${right.schema}\0${right.name}\0${right.kind}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
});
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

const aggregateFixture = {
  checks: D72_SUPABASE_AGGREGATE_CHECK_IDS.map((id) => ({
    id,
    invalidRowCount: "0",
  })),
  schemaVersion: D72_SUPABASE_CHECKS_SCHEMA_VERSION,
};

function childResult(stdout = "", stderr = "", status = 0) {
  return {
    error: undefined,
    signal: null,
    status,
    stderr: Buffer.from(stderr),
    stdout: Buffer.from(stdout),
  };
}

function createScenario({
  canonicalAuthContextAvailable = true,
  dirty = false,
  finalHead = head,
  harnessExitCode = 0,
  localCatalog = catalogFixture,
  passwordReader = null,
  productionAggregate = aggregateFixture,
  productionCatalog = catalogFixture,
  productionQueryExitCode = 0,
  tamperInvocation = false,
} = {}) {
  const calls = [];
  const resultBuffers = [];
  const secretEnvironments = [];
  const passwordBuffer = Buffer.from(secret);
  const passwordInputs = [];
  let remoteQueryIndex = 0;
  let gitHeadReadCount = 0;

  const result = (stdout = "", stderr = "", status = 0) => {
    const value = childResult(stdout, stderr, status);
    resultBuffers.push(value.stdout, value.stderr);
    return value;
  };
  const runCommand = (command, args, options) => {
    const isLocalSqlInput = Buffer.isBuffer(options.input);
    assert.deepEqual(options.stdio, [
      isLocalSqlInput ? "pipe" : "ignore",
      "pipe",
      "pipe",
    ]);
    assert.equal(options.encoding, "buffer");
    assert(!args.includes("--linked"));
    assert(!args.includes("--password"));
    assert(!args.includes("--db-url"));
    assert(!args.some((argument) => argument.includes(secret)));
    assert.equal(options.env.PATH, "/usr/bin:/bin");
    assert.equal(options.env.DOCKER_HOST, undefined);
    assert.equal(options.env.DOCKER_CONTEXT, undefined);
    if (["/usr/bin/git", "/usr/bin/docker"].includes(command)) {
      assert.equal(options.env.SUPABASE_ACCESS_TOKEN, undefined);
    }
    if (command === D72_SUPABASE_READONLY_CLI_BINARY_PATH) {
      assert.equal(options.env.SUPABASE_ACCESS_TOKEN, undefined);
      assert.equal(options.env.DISPLAY, undefined);
      for (const [name, value] of Object.entries(canonicalAuthContext)) {
        assert.equal(
          options.env[name],
          name !== "HOME" && !canonicalAuthContextAvailable ? undefined : value,
        );
      }
    }
    if (command === "/usr/bin/git") {
      assert.equal(options.env.GIT_CONFIG_GLOBAL, "/dev/null");
      assert.equal(options.env.GIT_CONFIG_NOSYSTEM, "1");
      assert.equal(options.env.GIT_NO_LAZY_FETCH, "1");
      assert.equal(options.env.GIT_OPTIONAL_LOCKS, "0");
      assert.equal(options.env.GIT_TERMINAL_PROMPT, "0");
    }
    if (command === "/usr/bin/docker") {
      assert(
        Object.values(options.env).every(
          (value) => typeof value !== "string" || !value.includes(secret),
        ),
      );
      assert.deepEqual(args.slice(0, 4), [
        "--config",
        path.join(options.cwd, D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH),
        "--host",
        D72_SUPABASE_DOCKER_HOST,
      ]);
      assert.equal(
        options.env.DOCKER_CONFIG,
        path.join(options.cwd, D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH),
      );
    } else {
      assert.equal(options.env.DOCKER_CONFIG, undefined);
    }
    calls.push({ args: [...args], command });

    if (
      command === D72_SUPABASE_READONLY_CLI_BINARY_PATH &&
      args.length === 1 &&
      args[0] === "--version"
    ) {
      return result("2.115.0\n");
    }
    if (
      command === D72_SUPABASE_READONLY_CLI_BINARY_PATH &&
      JSON.stringify(args) === JSON.stringify(D72_SUPABASE_MIGRATION_LIST_ARGS)
    ) {
      assert.equal(options.env.SUPABASE_DB_PASSWORD, undefined);
      if (
        options.env.XDG_RUNTIME_DIR === undefined &&
        options.env.DBUS_SESSION_BUS_ADDRESS === undefined
      ) {
        return result("", "canonical auth context unavailable\n", 1);
      }
      return result(migrationListStdout, migrationListStderr);
    }
    if (
      command === D72_SUPABASE_READONLY_CLI_BINARY_PATH &&
      JSON.stringify(args) === JSON.stringify(D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS)
    ) {
      assert.equal(options.env.SUPABASE_DB_PASSWORD, undefined);
      return result(dbPushDryRunStdout, dbPushDryRunStderr);
    }
    if (command === "/usr/bin/git" && args[0] === "rev-parse") {
      gitHeadReadCount += 1;
      return result(`${gitHeadReadCount === 1 ? head : finalHead}\n`);
    }
    if (command === "/usr/bin/git" && args[0] === "status") {
      return result(dirty ? " M scripts/example.mjs\n" : "");
    }
    if (command === "/usr/bin/git" && args[0] === "diff") return result("");
    const dockerOperation = command === "/usr/bin/docker" ? args[4] : undefined;
    if (command === "/usr/bin/docker" && dockerOperation === "inspect") {
      return result(`agorbis|${options.cwd}\n`);
    }
    if (
      command === "/usr/bin/docker" &&
      dockerOperation === "exec" &&
      args.at(-1) === "-"
    ) {
      assert.equal(options.env.DATABASE_URL, undefined);
      assert.equal(options.env.SUPABASE_ACCESS_TOKEN, undefined);
      assert(Buffer.isBuffer(options.input));
      assert(
        Object.values(D72_SUPABASE_LOCAL_DB_TEST_SHA256).includes(
          createHash("sha256").update(options.input).digest("hex"),
        ),
      );
      return result(
        `${harnessSentinel}\n`,
        "local harness notices\n",
        harnessExitCode,
      );
    }
    if (command === "/usr/bin/docker" && dockerOperation === "exec") {
      assert.equal(
        args.filter((argument) => argument === "--command").length,
        1,
      );
      assert.match(args.at(-1), /^begin transaction read only; with\b/);
      assert.match(args.at(-1), /; rollback$/);
      return result(`${JSON.stringify(localCatalog)}\n`);
    }
    if (
      command === D72_SUPABASE_READONLY_CLI_BINARY_PATH &&
      args.includes("db")
    ) {
      assert.deepEqual(args.slice(-5), [
        "db",
        "dump",
        "--project-ref",
        D72_SUPABASE_PROJECT_REF,
        "--dry-run",
      ]);
      assert.equal(options.env.SUPABASE_DB_PASSWORD, secret);
      secretEnvironments.push(options.env);
      return result(
        `supported dry run containing ${secret}\n`,
        EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR,
      );
    }
    if (command === "/usr/bin/docker" && dockerOperation === "run") {
      assert.equal(options.env.PGPASSWORD, undefined);
      assert.equal(options.env.PGSSLMODE, "verify-full");
      assert(Buffer.isBuffer(options.input));
      assert.equal(options.input.toString("utf8"), `${secret}\n`);
      passwordInputs.push(options.input);
      assert(args.includes("--interactive"));
      assert(args.includes(D72_SUPABASE_PSQL_STDIN_ENTRYPOINT));
      assert(
        !args.some(
          (argument, index) =>
            argument === "-e" && args[index + 1] === "PGPASSWORD",
        ),
      );
      assert.equal(
        args.filter((argument) => argument === "--command").length,
        1,
      );
      assert.match(args.at(-1), /^begin transaction read only; with\b/);
      assert.match(args.at(-1), /; rollback$/);
      secretEnvironments.push(options.env);
      const payload =
        remoteQueryIndex === 0 ? productionAggregate : productionCatalog;
      remoteQueryIndex += 1;
      return result(
        `${JSON.stringify(payload)}\n`,
        productionQueryExitCode === 0 ? "" : `failure ${secret}\n`,
        productionQueryExitCode,
      );
    }
    assert.fail(`unexpected fake command: ${command} ${args.join(" ")}`);
  };

  const realBuildInvocation = buildD72ProductionReadonlyInvocation;
  const remoteDependencies = {
    buildEnvironment: buildD72ProductionReadonlyEnvironment,
    buildInvocation: tamperInvocation
      ? (input) => {
          const invocation = realBuildInvocation(input);
          return {
            args: [...invocation.args.slice(0, -1), "select 1"],
            command: invocation.command,
          };
        }
      : realBuildInvocation,
    loadAssets: loadProductionBackupAssets,
    parseConnection: (output, { expectedPassword, projectRef }) => {
      assert.equal(expectedPassword, secret);
      assert.equal(projectRef, D72_SUPABASE_PROJECT_REF);
      assert(output.includes(secret));
      return productionConnection;
    },
    parseQueryOutput: parseD72ProductionQueryOutput,
    runCommand,
  };
  const dependencies = {
    ...remoteDependencies,
    now: () => new Date(fixedNow),
    readPassword: passwordReader ?? (() => passwordBuffer),
    runCommand,
    runRemoteChild({
      context,
      environment: childEnvironment,
      passwordBuffer: childPasswordBuffer,
      repositoryRoot,
      supabaseCliPath,
    }) {
      assert(Buffer.isBuffer(childPasswordBuffer));
      assert(childPasswordBuffer.equals(Buffer.from(secret, "utf8")));
      assert(
        !JSON.stringify({
          context,
          repositoryRoot,
          supabaseCliPath,
        }).includes(secret),
      );
      return runD72SupabaseReadonlyRemoteChild({
        context,
        dependencies: remoteDependencies,
        environment: childEnvironment,
        nodeVersion: D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION,
        passwordBuffer: childPasswordBuffer,
        repositoryRoot,
        supabaseCliPath,
        testOnly: true,
      });
    },
  };
  return {
    calls,
    dependencies,
    passwordBuffer,
    passwordInputs,
    resultBuffers,
    secretEnvironments,
  };
}

const environment = {
  ...canonicalAuthContext,
  DATABASE_URL: "postgresql://attacker.invalid/production",
  DISPLAY: ":99",
  DOCKER_CONFIG: "/tmp/attacker-docker-config",
  DOCKER_CONTEXT: "attacker-context",
  DOCKER_HOST: "tcp://attacker.invalid:2375",
  HOME: "/home/fake",
  PATH: "/attacker/bin",
  SUPABASE_ACCESS_TOKEN: "fake-session-token-not-for-local-children",
};

function digestWithPinnedBinaryByteFlipped(filePath) {
  const digest = createHash("sha256");
  const chunk = Buffer.alloc(64 * 1024);
  const descriptor = openSync(filePath, "r");
  const mutationOffset = 4096;
  let fileOffset = 0;
  let mutationApplied = false;
  try {
    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      if (
        !mutationApplied &&
        mutationOffset >= fileOffset &&
        mutationOffset < fileOffset + bytesRead
      ) {
        chunk[mutationOffset - fileOffset] ^= 0xff;
        mutationApplied = true;
      }
      digest.update(chunk.subarray(0, bytesRead));
      chunk.fill(0, 0, bytesRead);
      fileOffset += bytesRead;
    }
    assert.equal(mutationApplied, true);
    return digest.digest("hex");
  } finally {
    chunk.fill(0);
    closeSync(descriptor);
  }
}

const cliBinaryEvidence = collectD72SupabaseCliBinaryEvidence();
assert.deepEqual(validateD72SupabaseCliBinaryEvidence(cliBinaryEvidence), []);
const mutatedCliDigest = digestWithPinnedBinaryByteFlipped(
  D72_SUPABASE_READONLY_CLI_BINARY_PATH,
);
assert.notEqual(mutatedCliDigest, cliBinaryEvidence.digest);
assert.match(
  validateD72SupabaseCliBinaryEvidence({
    ...cliBinaryEvidence,
    digest: mutatedCliDigest,
  }).join("\n"),
  /binario ELF fijado/,
);

function boundedInputReader(source, calls, scratchBuffers) {
  let offset = 0;
  return (_descriptor, target, targetOffset, length) => {
    calls.push(length);
    scratchBuffers.push(target);
    const bytesRead = Math.min(length, source.length - offset);
    if (bytesRead === 0) return 0;
    source.copy(target, targetOffset, offset, offset + bytesRead);
    offset += bytesRead;
    return bytesRead;
  };
}

const exactInputCalls = [];
const exactInputScratch = [];
const exactInput = readD72SupabaseReadonlyRemoteChildInput({
  maxBytes: 8,
  read: boundedInputReader(
    Buffer.from("12345678"),
    exactInputCalls,
    exactInputScratch,
  ),
});
assert.equal(exactInput.toString("utf8"), "12345678");
exactInput.fill(0);
assert.deepEqual(exactInputCalls, [9, 1]);
assert(exactInputScratch.every((buffer) => buffer.every((byte) => byte === 0)));

const overflowInputCalls = [];
const overflowInputScratch = [];
assert.throws(
  () =>
    readD72SupabaseReadonlyRemoteChildInput({
      maxBytes: 8,
      read: boundedInputReader(
        Buffer.from("123456789"),
        overflowInputCalls,
        overflowInputScratch,
      ),
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "QUERY_INVOCATION_REJECTED",
);
assert.deepEqual(overflowInputCalls, [9]);
assert(
  overflowInputScratch.every((buffer) => buffer.every((byte) => byte === 0)),
);

const spoofedChildPasswordInput = Buffer.from(
  `fake-spoofed-child-password\n{}`,
  "utf8",
);
const spoofedRemoteChildPath = fileURLToPath(
  new URL("./d72-supabase-readonly-remote-child.mjs", import.meta.url),
);
let spoofedChildPasswordTouched = false;
for (const method of ["fill", "indexOf", "toString"]) {
  Object.defineProperty(spoofedChildPasswordInput, method, {
    configurable: true,
    value() {
      spoofedChildPasswordTouched = true;
      assert.fail(`El entrypoint importado tocó input mediante ${method}.`);
    },
  });
}
const savedProcessArgv = [...process.argv];
let spoofedChildStdout = "";
let spoofedChildStderr = "";
try {
  process.argv.splice(
    0,
    process.argv.length,
    process.execPath,
    spoofedRemoteChildPath,
  );
  assert.equal(
    runD72SupabaseReadonlyRemoteChildMain({
      argv: [],
      input: spoofedChildPasswordInput,
      stderr: (value) => {
        spoofedChildStderr += value;
      },
      stdout: (value) => {
        spoofedChildStdout += value;
      },
    }),
    1,
  );
} finally {
  process.argv.splice(0, process.argv.length, ...savedProcessArgv);
}
assert.equal(spoofedChildPasswordTouched, false);
assert.equal(spoofedChildStdout, "");
assert.deepEqual(JSON.parse(spoofedChildStderr), {
  code: "REMOTE_CHILD_FAILED",
  schemaVersion: "agorbis-d72-supabase-readonly-remote-child/v1",
  stage: "UNEXPECTED_FAILURE",
  status: "BLOCKED",
});
assert(!spoofedChildStderr.includes("fake-spoofed-child-password"));
for (const method of ["fill", "indexOf", "toString"]) {
  delete spoofedChildPasswordInput[method];
}
spoofedChildPasswordInput.fill(0);

const importedProductionPassword = Buffer.from(
  "fake-imported-production-password",
  "utf8",
);
let importedProductionPasswordConverted = false;
Object.defineProperty(importedProductionPassword, "toString", {
  configurable: true,
  value() {
    importedProductionPasswordConverted = true;
    assert.fail("imported production runner converted password bytes");
  },
});
assert.throws(
  () =>
    runD72SupabaseReadonlyRemoteChild({
      context: {
        head,
        localCatalog: null,
        localContracts: null,
        observedAtUtc: fixedNow.toISOString(),
        schemaVersion: D72_SUPABASE_READONLY_REMOTE_INPUT_SCHEMA_VERSION,
      },
      passwordBuffer: importedProductionPassword,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "UNEXPECTED_FAILURE",
);
assert.equal(importedProductionPasswordConverted, false);

for (const productionSeam of [
  { environment: { ...process.env } },
  {
    repositoryRoot: "/tmp/agorbis-d72-alternate-root",
    supabaseCliPath:
      "/tmp/agorbis-d72-alternate-root/node_modules/.pnpm/@supabase+cli-linux-x64@2.115.0/node_modules/@supabase/cli-linux-x64/bin/supabase",
  },
  { supabaseCliPath: "/tmp/agorbis-d72-alternate-supabase" },
]) {
  assert.throws(
    () => runD72SupabaseReadonly(productionSeam),
    (error) =>
      error instanceof D72SupabaseReadonlyRunnerError &&
      error.code === "UNEXPECTED_FAILURE",
  );
}

const nodeVersionDescriptor = Object.getOwnPropertyDescriptor(
  process.versions,
  "node",
);
assert(nodeVersionDescriptor?.configurable);
try {
  Object.defineProperty(process.versions, "node", {
    ...nodeVersionDescriptor,
    value: "24.18.0",
  });
  assert.throws(
    () =>
      runD72SupabaseReadonly({
        nodeVersion: D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION,
      }),
    (error) =>
      error instanceof D72SupabaseReadonlyRunnerError &&
      error.code === "NODE_VERSION_MISMATCH",
  );
} finally {
  Object.defineProperty(process.versions, "node", nodeVersionDescriptor);
}

const unmarkedFixture = createScenario();
assert.throws(
  () =>
    runD72SupabaseReadonly({
      dependencies: unmarkedFixture.dependencies,
      environment,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "UNEXPECTED_FAILURE",
);
assert.equal(unmarkedFixture.calls.length, 0);

const success = createScenario();
const receipt = runD72SupabaseReadonly({
  dependencies: success.dependencies,
  environment,
  testOnly: true,
});
assert.equal(receipt.head, head);
assert.match(receipt.contentSha256, /^[0-9a-f]{64}$/);
assert.equal(
  receipt.contentSha256,
  d72SupabaseReadonlyReceiptContentSha256(receipt),
);
assert.equal(receipt.remoteQueryCount, 2);
assert.equal(receipt.localQueryCount, 1);
assert.equal(receipt.localEvidence.status, "VERIFIED");
assert.equal(receipt.localEvidence.harnessExitCode, 0);
assert.equal(
  receipt.localEvidence.executedTestCount,
  Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256).length,
);
assert.equal(receipt.localEvidence.failedTestCount, 0);
assert.equal(receipt.gates.length, 6);
assert(receipt.gates.every(({ status }) => status === "PASS"));
assert.deepEqual(
  receipt.gates.map(({ gateId }) => gateId),
  [
    "database.expected-migrations-only",
    "data.integrity-no-corruption",
    "security.rls-enforced",
    "authorization.residency-write-boundary",
    "privacy.no-individual-ballots",
    "security.anti-abuse-limits",
  ],
);
assert.equal(
  new Date(receipt.evidenceFreshUntilUtc).valueOf() -
    new Date(receipt.startedAtUtc).valueOf(),
  D72_SUPABASE_READONLY_FRESHNESS_MS,
);
const overlongReceipt = structuredClone(receipt);
overlongReceipt.startedAtUtc = new Date(
  fixedNow.valueOf() - D72_SUPABASE_READONLY_FRESHNESS_MS - 1,
).toISOString();
overlongReceipt.evidenceFreshUntilUtc = new Date(
  new Date(overlongReceipt.startedAtUtc).valueOf() +
    D72_SUPABASE_READONLY_FRESHNESS_MS,
).toISOString();
overlongReceipt.contentSha256 =
  d72SupabaseReadonlyReceiptContentSha256(overlongReceipt);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(overlongReceipt, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
assert.equal(
  assertD72SupabaseReadonlyReceipt(receipt, {
    allowTestReceipt: true,
    expectedHead: head,
    now: fixedNow,
  }),
  true,
);
assert.throws(
  () =>
    assertD72SupabaseReadonlyReceipt(receipt, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);

for (const historicalMaximumVersion of ["0061", "0065", "0066"]) {
  const staleLedgerReceipt = structuredClone(receipt);
  const staleLedgerEvidence = staleLedgerReceipt.gates.find(
    ({ gateId }) => gateId === "database.expected-migrations-only",
  ).evidence;
  staleLedgerEvidence.localMaximumVersion = historicalMaximumVersion;
  staleLedgerEvidence.remoteMaximumVersion = historicalMaximumVersion;
  staleLedgerReceipt.contentSha256 =
    d72SupabaseReadonlyReceiptContentSha256(staleLedgerReceipt);
  assert.throws(
    () =>
      validateD72SupabaseReadonlyReceiptStructure(staleLedgerReceipt, {
        expectedHead: head,
        now: fixedNow,
      }),
    /RECEIPT_REJECTED/,
    "a recomputed receipt hash cannot make a historical ledger pass as 0067",
  );
}
const historicalPolicyReceipt = structuredClone(receipt);
historicalPolicyReceipt.policyHash =
  "8172d533e8114ca61a896c41c031a98c771317a48d66eddae22d1f9db1ebcf65";
historicalPolicyReceipt.contentSha256 = d72SupabaseReadonlyReceiptContentSha256(
  historicalPolicyReceipt,
);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(historicalPolicyReceipt, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
// D103: un recibo emitido con la política anterior a la corrección de
// identidades conserva su hash original y no acredita la política vigente.
const preIdentityFixPolicyReceipt = structuredClone(receipt);
preIdentityFixPolicyReceipt.policyHash =
  "488fc2ade5c532207e4e9a8d406ace0f1ad932b3cc80bccce2ec6bf54370d6d5";
preIdentityFixPolicyReceipt.contentSha256 =
  d72SupabaseReadonlyReceiptContentSha256(preIdentityFixPolicyReceipt);
assert.notEqual(
  preIdentityFixPolicyReceipt.policyHash,
  D72_SUPABASE_READONLY_POLICY_SHA256,
);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(preIdentityFixPolicyReceipt, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
const structuralClone = structuredClone(receipt);
assert.equal(
  validateD72SupabaseReadonlyReceiptStructure(structuralClone, {
    expectedHead: head,
    now: fixedNow,
  }),
  true,
);
assert.throws(
  () =>
    assertD72SupabaseReadonlyReceipt(structuralClone, {
      allowTestReceipt: true,
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
const jsonReceipt = JSON.parse(JSON.stringify(receipt));
assert.equal(
  validateD72SupabaseReadonlyReceiptStructure(jsonReceipt, {
    expectedHead: head,
    now: fixedNow,
  }),
  true,
);
assert.throws(
  () =>
    assertD72SupabaseReadonlyReceipt(jsonReceipt, {
      allowTestReceipt: true,
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
const inconsistentStatus = structuredClone(receipt);
inconsistentStatus.gates[0].status = "FAIL";
inconsistentStatus.contentSha256 =
  d72SupabaseReadonlyReceiptContentSha256(inconsistentStatus);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(inconsistentStatus, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
const invalidGates = structuredClone(receipt);
invalidGates.gates = null;
invalidGates.contentSha256 =
  d72SupabaseReadonlyReceiptContentSha256(invalidGates);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(invalidGates, {
      expectedHead: head,
      now: fixedNow,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "RECEIPT_REJECTED",
);
const tamperedDomainDigest = structuredClone(receipt);
tamperedDomainDigest.queries[1].domainDigests["app-controlled-rls"] =
  "0".repeat(64);
tamperedDomainDigest.contentSha256 =
  d72SupabaseReadonlyReceiptContentSha256(tamperedDomainDigest);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(tamperedDomainDigest, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
const missingDomainDigest = structuredClone(receipt);
delete missingDomainDigest.queries[1].domainDigests["integrity-structures"];
missingDomainDigest.contentSha256 =
  d72SupabaseReadonlyReceiptContentSha256(missingDomainDigest);
assert.throws(
  () =>
    validateD72SupabaseReadonlyReceiptStructure(missingDomainDigest, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
assert.throws(
  () =>
    assertD72SupabaseReadonlyReceipt(receipt, {
      expectedHead: "b".repeat(40),
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
const tamperedCoverageReceipt = structuredClone(receipt);
tamperedCoverageReceipt.localEvidence.harnessSourceDigest = "f".repeat(64);
assert.throws(
  () =>
    assertD72SupabaseReadonlyReceipt(tamperedCoverageReceipt, {
      expectedHead: head,
      now: fixedNow,
    }),
  /RECEIPT_REJECTED/,
);
assert.throws(
  () =>
    assertD72SupabaseReadonlyReceipt(receipt, {
      expectedHead: head,
      now: new Date(
        fixedNow.valueOf() + D72_SUPABASE_READONLY_FRESHNESS_MS + 1,
      ),
    }),
  /RECEIPT_REJECTED/,
);
assert.deepEqual(
  receipt.queries.map(({ queryId }) => queryId),
  D72_SUPABASE_READONLY_QUERY_IDS,
);
const serializedReceipt = JSON.stringify(receipt);
for (const forbidden of [
  secret,
  environment.SUPABASE_ACCESS_TOKEN,
  D72_SUPABASE_PROJECT_REF,
  rawSentinel,
  harnessSentinel,
  "supported dry run",
  "local harness notices",
]) {
  assert(!serializedReceipt.includes(forbidden));
}
assert(success.passwordBuffer.every((byte) => byte === 0));
assert(
  success.resultBuffers.every((buffer) => buffer.every((byte) => byte === 0)),
);
assert(
  success.secretEnvironments.every(
    (childEnvironment) =>
      childEnvironment.PGPASSWORD === undefined &&
      childEnvironment.SUPABASE_DB_PASSWORD === undefined,
  ),
);
assert(
  success.passwordInputs.every((buffer) => buffer.every((byte) => byte === 0)),
);
const productionQueries = success.calls.filter(
  ({ args, command }) => command === "/usr/bin/docker" && args[4] === "run",
);
assert.equal(productionQueries.length, 2);
assert.equal(
  success.calls.filter(
    ({ args, command }) =>
      command === "/usr/bin/docker" &&
      args[4] === "exec" &&
      args.includes("--command"),
  ).length,
  1,
);
assert.equal(
  success.calls.filter(
    ({ args, command }) =>
      command === "/usr/bin/docker" &&
      args[4] === "exec" &&
      args.at(-1) === "-",
  ).length,
  Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256).length,
);
assert(
  success.calls.every(
    ({ args }) =>
      !args.includes("--linked") &&
      !args.includes("--password") &&
      !args.includes("--db-url"),
  ),
);

const environmentWithoutCanonicalAuthContext = { ...environment };
delete environmentWithoutCanonicalAuthContext.XDG_RUNTIME_DIR;
delete environmentWithoutCanonicalAuthContext.DBUS_SESSION_BUS_ADDRESS;
delete environmentWithoutCanonicalAuthContext.GNOME_KEYRING_CONTROL;
const missingCanonicalAuthContext = createScenario({
  canonicalAuthContextAvailable: false,
});
assert.throws(
  () =>
    runD72SupabaseReadonly({
      dependencies: missingCanonicalAuthContext.dependencies,
      environment: environmentWithoutCanonicalAuthContext,
      testOnly: true,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "MIGRATION_EVIDENCE_FAILED",
);
assert.equal(
  missingCanonicalAuthContext.calls.filter(
    ({ args, command }) =>
      command === D72_SUPABASE_READONLY_CLI_BINARY_PATH &&
      JSON.stringify(args) === JSON.stringify(D72_SUPABASE_MIGRATION_LIST_ARGS),
  ).length,
  1,
);
assert.equal(
  missingCanonicalAuthContext.calls.filter(
    ({ args, command }) =>
      command === D72_SUPABASE_READONLY_CLI_BINARY_PATH &&
      JSON.stringify(args) ===
        JSON.stringify(D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS),
  ).length,
  0,
);

for (const invalid of [
  { environment: { ...environment, SUPABASE_DB_PASSWORD: "" } },
  { nodeVersion: "22.21.1" },
  { argv: ["--linked"] },
]) {
  const scenario = createScenario();
  assert.throws(
    () =>
      runD72SupabaseReadonly({
        dependencies: scenario.dependencies,
        environment,
        testOnly: true,
        ...invalid,
      }),
    (error) =>
      error instanceof D72SupabaseReadonlyRunnerError &&
      [
        "ENV_PASSWORD_FORBIDDEN",
        "INVALID_ARGUMENTS",
        "NODE_VERSION_MISMATCH",
      ].includes(error.code),
  );
  assert.equal(scenario.calls.length, 0);
}

const dirtyScenario = createScenario({ dirty: true });
assert.throws(
  () =>
    runD72SupabaseReadonly({
      dependencies: dirtyScenario.dependencies,
      environment,
      testOnly: true,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "GIT_IDENTITY_FAILED",
);
assert(
  dirtyScenario.calls.every(
    ({ args, command }) => command !== "/usr/bin/docker" || args[4] !== "run",
  ),
);

const failedHarness = createScenario({ harnessExitCode: 1 });
const failedHarnessReceipt = runD72SupabaseReadonly({
  dependencies: failedHarness.dependencies,
  environment,
  testOnly: true,
});
assert.equal(failedHarnessReceipt.localEvidence.status, "VERIFIED");
assert.equal(
  failedHarnessReceipt.localEvidence.failedTestCount,
  Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256).length,
);
assert.equal(failedHarnessReceipt.gates[0].status, "PASS");
assert(
  failedHarnessReceipt.gates.slice(1).every(({ status }) => status === "FAIL"),
);

const invalidLocalCatalog = createScenario({
  localCatalog: { ...catalogFixture, unexpected: true },
});
const unavailableReceipt = runD72SupabaseReadonly({
  dependencies: invalidLocalCatalog.dependencies,
  environment,
  testOnly: true,
});
assert.equal(unavailableReceipt.localEvidence.status, "NOT_VERIFIED");
assert.equal(unavailableReceipt.localQueryCount, 1);
assert.equal(unavailableReceipt.gates[0].status, "PASS");
assert(
  unavailableReceipt.gates
    .slice(1)
    .every(({ status }) => status === "NOT_VERIFIED"),
);
assert(invalidLocalCatalog.passwordBuffer.every((byte) => byte === 0));

const changedHead = createScenario({ finalHead: "b".repeat(40) });
assert.throws(
  () =>
    runD72SupabaseReadonly({
      dependencies: changedHead.dependencies,
      environment,
      testOnly: true,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "GIT_IDENTITY_FAILED",
);
assert(changedHead.passwordBuffer.every((byte) => byte === 0));

const failedAggregate = structuredClone(aggregateFixture);
failedAggregate.checks.find(
  ({ id }) => id === "integrity.invalid-indexes",
).invalidRowCount = "1";
const factualFailure = createScenario({
  productionAggregate: failedAggregate,
});
const factualFailureReceipt = runD72SupabaseReadonly({
  dependencies: factualFailure.dependencies,
  environment,
  testOnly: true,
});
assert.equal(
  factualFailureReceipt.gates.find(
    ({ gateId }) => gateId === "data.integrity-no-corruption",
  ).status,
  "FAIL",
);

const tampered = createScenario({ tamperInvocation: true });
assert.throws(
  () =>
    runD72SupabaseReadonly({
      dependencies: tampered.dependencies,
      environment,
      testOnly: true,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "QUERY_INVOCATION_REJECTED",
);
assert(tampered.passwordBuffer.every((byte) => byte === 0));

const queryFailure = createScenario({ productionQueryExitCode: 1 });
assert.throws(
  () =>
    runD72SupabaseReadonly({
      dependencies: queryFailure.dependencies,
      environment,
      testOnly: true,
    }),
  (error) =>
    error instanceof D72SupabaseReadonlyRunnerError &&
    error.code === "QUERY_EXECUTION_FAILED",
);
assert(queryFailure.passwordBuffer.every((byte) => byte === 0));
assert(
  queryFailure.resultBuffers.every((buffer) =>
    buffer.every((byte) => byte === 0),
  ),
);
assert(
  queryFailure.passwordInputs.every((buffer) =>
    buffer.every((byte) => byte === 0),
  ),
);

function ttyIo(input, { failRead = false, failSetEchoOff = false } = {}) {
  const source = Buffer.from(input);
  const echo = [];
  const writes = [];
  let closed = false;
  let offset = 0;
  return {
    echo,
    get closed() {
      return closed;
    },
    io: {
      close: () => {
        closed = true;
      },
      open: () => 19,
      read: (_descriptor, byte) => {
        if (failRead) throw new Error(`read leaked ${secret}`);
        if (offset >= source.length) return 0;
        byte[0] = source[offset];
        offset += 1;
        return 1;
      },
      setEcho: (enabled) => {
        echo.push(enabled);
        if (!enabled && failSetEchoOff)
          throw new Error(`stty leaked ${secret}`);
      },
      write: (_descriptor, value) => writes.push(value),
    },
    writes,
  };
}

const validTty = ttyIo("1234567x\n");
const ttyPassword = readD72SupabaseDatabasePasswordFromTty({ io: validTty.io });
assert.equal(ttyPassword.toString("utf8"), "1234567x");
ttyPassword.fill(0);
assert.deepEqual(validTty.echo, [false, true]);
assert.equal(validTty.closed, true);
assert.equal(validTty.writes.length, 2);
assert(!validTty.writes.join("").includes(secret));

for (const invalidTty of [
  ttyIo("short\n"),
  ttyIo(`${"x".repeat(1025)}\n`),
  ttyIo("ignored", { failRead: true }),
  ttyIo("ignored", { failSetEchoOff: true }),
]) {
  assert.throws(
    () => readD72SupabaseDatabasePasswordFromTty({ io: invalidTty.io }),
    (error) =>
      error instanceof D72SupabaseReadonlyRunnerError &&
      error.code === "TTY_INPUT_FAILED" &&
      !error.message.includes(secret),
  );
  assert.equal(invalidTty.closed, true);
  assert.equal(invalidTty.echo.at(-1), true);
}

const mainFailure = createScenario({
  passwordReader: () => {
    throw new Error(`never print ${secret}`);
  },
});
let mainStdout = "";
let mainStderr = "";
assert.equal(
  runD72SupabaseReadonlyMain({
    dependencies: mainFailure.dependencies,
    environment,
    stderr: (value) => {
      mainStderr += value;
    },
    stdout: (value) => {
      mainStdout += value;
    },
    testOnly: true,
  }),
  1,
);
assert.equal(mainStdout, "");
assert.deepEqual(JSON.parse(mainStderr), {
  code: "TTY_INPUT_FAILED",
  schemaVersion: "agorbis-d72-supabase-readonly-run/v1",
  status: "BLOCKED",
});
assert(!mainStderr.includes(secret));

const mainSuccess = createScenario();
mainStdout = "";
mainStderr = "";
assert.equal(
  runD72SupabaseReadonlyMain({
    dependencies: mainSuccess.dependencies,
    environment,
    stderr: (value) => {
      mainStderr += value;
    },
    stdout: (value) => {
      mainStdout += value;
    },
    testOnly: true,
  }),
  0,
);
assert.equal(mainStderr, "");
assert.equal(JSON.parse(mainStdout).remoteQueryCount, 2);
assert(!mainStdout.includes(secret));
assert(!mainStdout.includes(rawSentinel));
assert(!mainStdout.includes(harnessSentinel));

// ---------------------------------------------------------------------------
// Diagnóstico seguro: el hijo declara su etapa con el enum cerrado y el padre
// la refleja como `remoteStage` sin cambiar el código ni la decisión.
const spawnRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const spawnRemoteChildPath = path.join(
  spawnRepositoryRoot,
  "scripts",
  "d72-supabase-readonly-remote-child.mjs",
);
const spawnContext = Object.freeze({
  head,
  localCatalog: null,
  localContracts: null,
  observedAtUtc: fixedNow.toISOString(),
  schemaVersion: D72_SUPABASE_READONLY_REMOTE_INPUT_SCHEMA_VERSION,
});
const childFailureLine = (object) => `${JSON.stringify(object)}\n`;
const childFailure = (stage, extra = {}) =>
  childFailureLine({
    code: "REMOTE_CHILD_FAILED",
    schemaVersion: D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
    stage,
    status: "BLOCKED",
    ...extra,
  });

function spawnWithChild(childOutcome) {
  const passwordBuffer = Buffer.from(secret, "utf8");
  const buffers = [];
  let calls = 0;
  const runCommand = (command, args, options) => {
    calls += 1;
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [spawnRemoteChildPath]);
    assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
    assert(Buffer.isBuffer(options.input));
    assert(
      options.input.subarray(0, passwordBuffer.length).equals(passwordBuffer),
    );
    assert.equal(options.env.DATABASE_URL, undefined);
    assert.equal(options.env.SUPABASE_DB_PASSWORD, undefined);
    if (childOutcome instanceof Error) throw childOutcome;
    const value = childOutcome();
    if (value && Buffer.isBuffer(value.stdout)) buffers.push(value.stdout);
    if (value && Buffer.isBuffer(value.stderr)) buffers.push(value.stderr);
    return value;
  };
  let thrown = null;
  try {
    spawnD72SupabaseReadonlyRemoteChild({
      context: spawnContext,
      environment: process.env,
      passwordBuffer,
      repositoryRoot: spawnRepositoryRoot,
      runCommand,
      supabaseCliPath: D72_SUPABASE_READONLY_CLI_BINARY_PATH,
    });
  } catch (error) {
    thrown = error;
  }
  assert.equal(calls, 1);
  assert(
    buffers.every((buffer) => buffer.every((byte) => byte === 0)),
    "los buffers del hijo no se limpiaron",
  );
  return thrown;
}

function assertGenericQueryFailure(thrown, label) {
  assert(thrown instanceof D72SupabaseReadonlyRunnerError, label);
  assert.equal(thrown.code, "QUERY_EXECUTION_FAILED", label);
  assert.equal(thrown.message, "QUERY_EXECUTION_FAILED", label);
  assert.equal(Object.hasOwn(thrown, "remoteStage"), false, label);
  assert(!JSON.stringify(thrown).includes(secret), label);
  assert(!String(thrown.stack).includes(secret), label);
}

// Cada etapa del enum cerrado llega como remoteStage; el código no cambia y
// la propiedad no se puede reescribir.
for (const stage of D72_SUPABASE_READONLY_ERROR_CODES) {
  const thrown = spawnWithChild(() => childResult("", childFailure(stage), 1));
  assert(thrown instanceof D72SupabaseReadonlyRunnerError, stage);
  assert.equal(thrown.code, "QUERY_EXECUTION_FAILED", stage);
  assert.equal(thrown.message, "QUERY_EXECUTION_FAILED", stage);
  assert.equal(thrown.remoteStage, stage);
  assert.throws(() => {
    thrown.remoteStage = "PASS";
  }, TypeError);
  assert(!JSON.stringify(thrown).includes(secret));
}

// Lo que escribe realmente el hijo al fallar (arriba, con el entrypoint
// suplantado) es exactamente lo que el padre acepta.
assert.equal(
  spawnWithChild(() => childResult("", spoofedChildStderr, 1)).remoteStage,
  "UNEXPECTED_FAILURE",
);

// Todo lo demás bloquea con el error genérico de siempre, sin remoteStage y
// sin filtrar nada de lo que el hijo haya escrito.
const longText = `${"x".repeat(600)}\n`;
for (const [label, outcome] of [
  [
    "etapa fuera del enum",
    () => childResult("", childFailure("REMOTE_CHILD_FAILED"), 1),
  ],
  [
    "etapa en minúsculas",
    () => childResult("", childFailure("query_execution_failed"), 1),
  ],
  ["etapa no textual", () => childResult("", childFailure(7), 1)],
  ["etapa nula", () => childResult("", childFailure(null), 1)],
  [
    "campo extra",
    () =>
      childResult(
        "",
        childFailure("CLI_VERSION_FAILED", { detail: `pista ${secret}` }),
        1,
      ),
  ],
  [
    "formato anterior sin etapa",
    () =>
      childResult(
        "",
        childFailureLine({
          code: "REMOTE_CHILD_FAILED",
          schemaVersion: D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
          status: "BLOCKED",
        }),
        1,
      ),
  ],
  [
    "orden de claves no canónico",
    () =>
      childResult(
        "",
        `{"status":"BLOCKED","stage":"CLI_VERSION_FAILED","schemaVersion":"${D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION}","code":"REMOTE_CHILD_FAILED"}\n`,
        1,
      ),
  ],
  [
    "sin salto de línea final",
    () => childResult("", childFailure("CLI_VERSION_FAILED").trimEnd(), 1),
  ],
  [
    "dos líneas",
    () => childResult("", `${childFailure("CLI_VERSION_FAILED")}\n`, 1),
  ],
  [
    "JSON con espacios",
    () =>
      childResult(
        "",
        `${JSON.stringify(JSON.parse(childFailure("CLI_VERSION_FAILED")), null, 2)}\n`,
        1,
      ),
  ],
  [
    "otra versión de esquema",
    () =>
      childResult(
        "",
        childFailureLine({
          code: "REMOTE_CHILD_FAILED",
          schemaVersion: "agorbis-d72-supabase-readonly-remote-child/v2",
          stage: "CLI_VERSION_FAILED",
          status: "BLOCKED",
        }),
        1,
      ),
  ],
  [
    "otro code",
    () =>
      childResult(
        "",
        childFailureLine({
          code: "QUERY_EXECUTION_FAILED",
          schemaVersion: D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
          stage: "CLI_VERSION_FAILED",
          status: "BLOCKED",
        }),
        1,
      ),
  ],
  [
    "status PASS",
    () =>
      childResult(
        "",
        childFailureLine({
          code: "REMOTE_CHILD_FAILED",
          schemaVersion: D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
          stage: "CLI_VERSION_FAILED",
          status: "PASS",
        }),
        1,
      ),
  ],
  [
    "salida 0 con stderr",
    () => childResult("", childFailure("CLI_VERSION_FAILED"), 0),
  ],
  ["salida 2", () => childResult("", childFailure("CLI_VERSION_FAILED"), 2)],
  [
    "stdout no vacío",
    () => childResult("{}\n", childFailure("CLI_VERSION_FAILED"), 1),
  ],
  [
    "stderr con la contraseña",
    () =>
      childResult("", `${childFailure("CLI_VERSION_FAILED")}${secret}\n`, 1),
  ],
  [
    "stderr con NUL",
    () => childResult("", `${childFailure("CLI_VERSION_FAILED")}\0`, 1),
  ],
  ["stderr demasiado largo", () => childResult("", longText, 1)],
  [
    "texto suelto",
    () => childResult("", `Error: pista sensible ${secret}\n`, 1),
  ],
  ["stderr vacío con salida 1", () => childResult("", "", 1)],
  [
    "señal",
    () => ({
      ...childResult("", childFailure("CLI_VERSION_FAILED"), null),
      signal: "SIGKILL",
    }),
  ],
  [
    "error de spawn",
    () => ({
      ...childResult("", childFailure("CLI_VERSION_FAILED"), 1),
      error: new Error("spawn"),
    }),
  ],
  ["runCommand lanza", new Error(`spawn failed ${secret}`)],
]) {
  assertGenericQueryFailure(spawnWithChild(outcome), label);
}

// Una etapa sólo acompaña a QUERY_EXECUTION_FAILED y sólo si es del enum.
for (const error of [
  new D72SupabaseReadonlyRunnerError("TTY_INPUT_FAILED", {
    remoteStage: "CLI_VERSION_FAILED",
  }),
  new D72SupabaseReadonlyRunnerError("QUERY_EXECUTION_FAILED", {
    remoteStage: "nope",
  }),
  new D72SupabaseReadonlyRunnerError("QUERY_EXECUTION_FAILED", {
    remoteStage: 7,
  }),
  new D72SupabaseReadonlyRunnerError("QUERY_EXECUTION_FAILED"),
]) {
  assert.equal(Object.hasOwn(error, "remoteStage"), false);
}

// El proceso principal: con etapa, la agrega en orden canónico; sin etapa, la
// salida es byte a byte la anterior. Un error ajeno con una etapa falsa no la
// propaga. En ningún caso cambia el código ni se emite un recibo.
for (const [thrower, expected] of [
  [
    () => {
      throw new D72SupabaseReadonlyRunnerError("QUERY_EXECUTION_FAILED", {
        remoteStage: "CONNECTION_DISCOVERY_FAILED",
      });
    },
    `{"code":"QUERY_EXECUTION_FAILED","remoteStage":"CONNECTION_DISCOVERY_FAILED","schemaVersion":"agorbis-d72-supabase-readonly-run/v1","status":"BLOCKED"}\n`,
  ],
  [
    () => {
      throw new D72SupabaseReadonlyRunnerError("QUERY_EXECUTION_FAILED");
    },
    `{"code":"QUERY_EXECUTION_FAILED","schemaVersion":"agorbis-d72-supabase-readonly-run/v1","status":"BLOCKED"}\n`,
  ],
  [
    () => {
      const error = new Error(`pista ${secret}`);
      error.remoteStage = "CLI_VERSION_FAILED";
      throw error;
    },
    `{"code":"QUERY_EXECUTION_FAILED","schemaVersion":"agorbis-d72-supabase-readonly-run/v1","status":"BLOCKED"}\n`,
  ],
]) {
  const staged = createScenario();
  let stagedStdout = "";
  let stagedStderr = "";
  assert.equal(
    runD72SupabaseReadonlyMain({
      dependencies: { ...staged.dependencies, runRemoteChild: thrower },
      environment,
      stderr: (value) => {
        stagedStderr += value;
      },
      stdout: (value) => {
        stagedStdout += value;
      },
      testOnly: true,
    }),
    1,
  );
  assert.equal(stagedStdout, "");
  assert.equal(stagedStderr, expected);
  assert(!stagedStderr.includes(secret));
  assert(staged.passwordBuffer.every((byte) => byte === 0));
}

console.log("d72 supabase readonly runner tests: ok");
