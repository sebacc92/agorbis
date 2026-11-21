#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS,
  READ_ONLY_PREVIEW_MIGRATION_STATE,
  classifyReadOnlyMigrationState,
  countAuthUsers,
  isExpectedSupabaseCliVersionResult,
  parseMigrationListOutput,
  parseRevealedApiKeys,
  removeKnownSupabaseUpdateNotice,
  runReadOnlyPreviewRemoteGates,
  selectDedicatedCloudflareSecret,
  validateAuthSettings,
  validateReadOnlyMigrationState,
} from "./cloudflare-readonly-preview-remote-policy.mjs";
import { EXPECTED_D72_MIGRATION_FILE } from "./production-preflight-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const knownSupabaseUpdateNotice = [
  "A new version of Supabase CLI is available: v2.116.0 (currently installed v2.115.0)",
  "We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli",
  "",
].join("\n");
const secret = `sb_secret_${"s".repeat(32)}`;
const publishable = `sb_publishable_${"p".repeat(32)}`;
function legacyKey(role) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: "supabase",
    ref: "ibtvlvpxwourrxwcrfkf",
    role,
  })}.fixture-signature`;
}
const legacyAnon = legacyKey("anon");
const legacyServiceRole = legacyKey("service_role");
const baseMigrationRows = Array.from({ length: 58 }, (_, index) => {
  const id = String(index + 1).padStart(4, "0");
  return { local: id, remote: id, time: id };
});
const post0060MigrationRows = [
  ...baseMigrationRows,
  { local: "0060", remote: "0060", time: "0060" },
];
const preparedMigrationPayload = {
  migrations: [
    ...post0060MigrationRows,
    { local: "0061", remote: "", time: "0061" },
  ],
  message: "Migrations listed",
};
const migrationPayload = {
  migrations: [
    ...post0060MigrationRows,
    { local: "0061", remote: "0061", time: "0061" },
  ],
  message: "Migrations listed",
};
const migrationStdout = `${JSON.stringify(migrationPayload)}\n`;
const preparedMigrationStdout = `${JSON.stringify(preparedMigrationPayload)}\n`;
const migrationStderr = [
  "Initialising login role...",
  "Connecting to remote database...",
  'Skipping migration 0016_world_subdivisions.sql.audit.json... (file name must match pattern "<timestamp>_name.sql")',
  "",
].join("\n");
const expectedVersionResult = {
  status: 0,
  signal: null,
  stdout: "2.115.0\n",
  stderr: knownSupabaseUpdateNotice,
};

assert.equal(isExpectedSupabaseCliVersionResult(expectedVersionResult), true);
assert.equal(
  isExpectedSupabaseCliVersionResult({
    ...expectedVersionResult,
    stderr: "",
  }),
  true,
);
for (const invalid of [
  { ...expectedVersionResult, stdout: "" },
  { ...expectedVersionResult, stdout: "2.115.0\ntexto extra\n" },
  { ...expectedVersionResult, stdout: "2.116.0\n" },
  { ...expectedVersionResult, stderr: "stderr arbitrario\n" },
  {
    ...expectedVersionResult,
    stderr: `${knownSupabaseUpdateNotice}stderr arbitrario\n`,
  },
  {
    ...expectedVersionResult,
    stderr: knownSupabaseUpdateNotice.replace("v2.116.0", "v2.117.0"),
  },
  { ...expectedVersionResult, status: 1 },
  { ...expectedVersionResult, signal: "SIGTERM" },
  { ...expectedVersionResult, error: new Error("fallo real de fixture") },
  { ...expectedVersionResult, stdout: undefined },
  { ...expectedVersionResult, stderr: undefined },
]) {
  assert.equal(isExpectedSupabaseCliVersionResult(invalid), false);
}
assert.equal(removeKnownSupabaseUpdateNotice(knownSupabaseUpdateNotice), "");
assert.equal(
  removeKnownSupabaseUpdateNotice(
    `${knownSupabaseUpdateNotice}stderr arbitrario\n`,
  ),
  "stderr arbitrario\n",
);
const apiKeys = JSON.stringify([
  {
    api_key: legacyAnon,
    name: "anon",
    type: "legacy",
  },
  {
    api_key: publishable,
    name: "default",
    type: "publishable",
  },
  {
    api_key: secret,
    name: "agorbis_cloudflare_worker",
    secret_jwt_template: { role: "service_role" },
    type: "secret",
  },
  {
    api_key: legacyServiceRole,
    name: "service_role",
    type: "legacy",
  },
]);

assert.equal(EXPECTED_D72_MIGRATION_FILE.slice(0, 4), "0061");
assert.deepEqual(
  EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS,
  migrationPayload.migrations.map(({ local }) => local),
);
const rows = parseMigrationListOutput(migrationStdout, migrationStderr);
assert.equal(rows.length, 60);
assert.deepEqual(rows.at(-1), {
  local: "0061",
  remote: "0061",
  time: "0061",
});
assert.equal(
  classifyReadOnlyMigrationState(rows).state,
  READ_ONLY_PREVIEW_MIGRATION_STATE.APPLIED_EXACT,
);
assert.deepEqual(validateReadOnlyMigrationState(rows), []);
const preparedRows = parseMigrationListOutput(
  preparedMigrationStdout,
  migrationStderr,
);
assert.equal(preparedRows.length, 60);
assert.deepEqual(preparedRows.at(-1), {
  local: "0061",
  remote: null,
  time: "0061",
});
assert.equal(
  classifyReadOnlyMigrationState(preparedRows).state,
  READ_ONLY_PREVIEW_MIGRATION_STATE.PREPARED_NOT_APPLIED,
);
assert.match(
  validateReadOnlyMigrationState(preparedRows).join("\n"),
  /0061.*todavía no está aplicada.*STOP/,
);
assert.deepEqual(
  parseMigrationListOutput(
    migrationStdout,
    `${migrationStderr}${knownSupabaseUpdateNotice}`,
  ),
  rows,
);

assert.throws(
  () =>
    parseMigrationListOutput(
      migrationStdout,
      `${migrationStderr}texto arbitrario\n`,
    ),
  /Preambulo desconocido/,
);
assert.throws(
  () =>
    parseMigrationListOutput(
      migrationStdout,
      `${migrationStderr}${knownSupabaseUpdateNotice.replace(
        "v2.116.0",
        "v2.117.0",
      )}`,
    ),
  /Preambulo desconocido/,
);
assert.throws(
  () =>
    parseMigrationListOutput(
      `${migrationStdout}${migrationStdout}`,
      migrationStderr,
    ),
  /único JSON puro válido/,
);
assert.throws(
  () => parseMigrationListOutput("", migrationStderr),
  /único JSON puro válido/,
);
for (const invalid of [
  `texto previo\n${migrationStdout}`,
  `${migrationStdout}texto posterior`,
  "{json-invalido",
  JSON.stringify({ ...migrationPayload, extra: true }),
  JSON.stringify({ ...migrationPayload, message: "otro" }),
  JSON.stringify({ migrations: migrationPayload.migrations }),
  JSON.stringify({ message: "Migrations listed", migrations: {} }),
  JSON.stringify({
    ...migrationPayload,
    migrations: [
      ...migrationPayload.migrations,
      { local: "0059", remote: null, time: "0059" },
    ],
  }),
  JSON.stringify({
    ...migrationPayload,
    migrations: [
      ...migrationPayload.migrations,
      { local: "0059", remote: "", time: "0059", extra: true },
    ],
  }),
]) {
  assert.throws(() => parseMigrationListOutput(invalid, migrationStderr));
}
const baseOnlyRows = parseMigrationListOutput(
  JSON.stringify({
    message: "Migrations listed",
    migrations: baseMigrationRows,
  }),
  migrationStderr,
);
assert.equal(
  classifyReadOnlyMigrationState(baseOnlyRows).state,
  READ_ONLY_PREVIEW_MIGRATION_STATE.INVALID,
);
assert.match(validateReadOnlyMigrationState(baseOnlyRows).join("\n"), /0060/);

for (const migrationsWith0059 of [
  [
    ...preparedMigrationPayload.migrations,
    { local: "0059", remote: "", time: "0059" },
  ],
  [
    ...preparedMigrationPayload.migrations,
    { local: "", remote: "0059", time: "0059" },
  ],
  [
    ...migrationPayload.migrations,
    { local: "0059", remote: "0059", time: "0059" },
  ],
  migrationPayload.migrations.map((row) =>
    row.local === "0060" ? { ...row, time: "0059" } : row,
  ),
]) {
  const rowsWith0059 = parseMigrationListOutput(
    JSON.stringify({
      message: "Migrations listed",
      migrations: migrationsWith0059,
    }),
    migrationStderr,
  );
  assert.equal(
    classifyReadOnlyMigrationState(rowsWith0059).state,
    READ_ONLY_PREVIEW_MIGRATION_STATE.INVALID,
  );
  assert.match(validateReadOnlyMigrationState(rowsWith0059).join("\n"), /0059/);
}

const invalidLedgers = [
  migrationPayload.migrations.filter((row) => row.local !== "0031"),
  [
    ...migrationPayload.migrations,
    { local: "0061", remote: "0061", time: "0061" },
  ],
  [...migrationPayload.migrations, migrationPayload.migrations.at(-1)],
  [
    migrationPayload.migrations[1],
    migrationPayload.migrations[0],
    ...migrationPayload.migrations.slice(2),
  ],
  [
    ...baseMigrationRows,
    { local: "0060", remote: "", time: "0060" },
    { local: "", remote: "0060", time: "0060" },
  ],
];
for (const invalidLedger of invalidLedgers) {
  const invalidRows = parseMigrationListOutput(
    JSON.stringify({
      message: "Migrations listed",
      migrations: invalidLedger,
    }),
    migrationStderr,
  );
  assert.equal(
    classifyReadOnlyMigrationState(invalidRows).state,
    READ_ONLY_PREVIEW_MIGRATION_STATE.INVALID,
  );
  assert.notDeepEqual(validateReadOnlyMigrationState(invalidRows), []);
}

const parsedKeys = parseRevealedApiKeys(apiKeys);
assert.equal(selectDedicatedCloudflareSecret(parsedKeys), secret);
assert.deepEqual(
  parsedKeys.filter((entry) => entry.type === "legacy"),
  [
    { name: "anon", type: "legacy" },
    { name: "service_role", type: "legacy" },
  ],
);
assert.throws(
  () =>
    parseRevealedApiKeys(
      JSON.stringify([
        { name: "anon", type: "legacy", api_key: legacyAnon },
        { name: "anon", type: "legacy", api_key: legacyAnon },
      ]),
    ),
  /tipo\/nombre duplicado/,
);
assert.throws(
  () =>
    parseRevealedApiKeys(
      JSON.stringify([
        {
          name: "legacy_desconocida",
          type: "legacy",
          api_key: legacyAnon,
        },
      ]),
    ),
  /legacy desconocida/,
);
const sharedDefaultNames = parseRevealedApiKeys(
  JSON.stringify([
    { name: "default", type: "publishable", api_key: publishable },
    {
      name: "default",
      type: "secret",
      api_key: secret,
      secret_jwt_template: { role: "service_role" },
    },
  ]),
);
assert.equal(sharedDefaultNames.length, 2);
assert.equal(sharedDefaultNames[0].type, "publishable");
assert.equal(sharedDefaultNames[1].type, "secret");
for (const invalid of [
  "",
  "{}",
  "[]",
  JSON.stringify([{ name: "x", type: "secret", api_key: "incorrecta" }]),
  JSON.stringify([
    { name: "duplicada", type: "secret", api_key: secret },
    { name: "duplicada", type: "secret", api_key: secret },
  ]),
  JSON.stringify([
    { name: "service_role", type: "legacy", api_key: legacyAnon },
  ]),
]) {
  assert.throws(() => parseRevealedApiKeys(invalid));
}
assert.throws(
  () =>
    selectDedicatedCloudflareSecret([
      {
        api_key: secret,
        name: "servidor_generico",
        secret_jwt_template: { role: "service_role" },
        type: "secret",
      },
    ]),
  /exactamente una/,
);

assert.deepEqual(validateAuthSettings({ disable_signup: true }), []);
assert.match(
  validateAuthSettings({ disable_signup: false }).join("\n"),
  /disable_signup=true/,
);
assert.match(validateAuthSettings({}).join("\n"), /estructura inesperada/);
assert.equal(countAuthUsers({ users: [] }), 0);
assert.equal(countAuthUsers({ users: [{ id: "fixture" }] }), 1);
assert.throws(() => countAuthUsers({}), /estructura inesperada/);

function successfulCommand(_command, args) {
  if (args.at(-1) === "--version") {
    return expectedVersionResult;
  }
  if (args.includes("migration")) {
    assert.deepEqual(args.slice(1), [
      "migration",
      "list",
      "--project-ref",
      "ibtvlvpxwourrxwcrfkf",
      "--output-format",
      "json",
      "--agent",
      "no",
    ]);
    return {
      status: 0,
      signal: null,
      stdout: migrationStdout,
      stderr: `${migrationStderr}${knownSupabaseUpdateNotice}`,
    };
  }
  assert.deepEqual(args.slice(-7), [
    "projects",
    "api-keys",
    "--project-ref",
    "ibtvlvpxwourrxwcrfkf",
    "--reveal",
    "--output",
    "json",
  ]);
  return {
    status: 0,
    signal: null,
    stdout: apiKeys,
    stderr: knownSupabaseUpdateNotice,
  };
}

function fetchFixture(userCount = 0) {
  return async (url, init) => {
    if (String(url).endsWith("/auth/v1/settings")) {
      assert.match(init.headers.apikey, /^sb_publishable_/);
      assert.equal(init.redirect, "manual");
      return Response.json({ disable_signup: true });
    }
    assert.match(String(url), /\/auth\/v1\/admin\/users\?page=1&per_page=1$/);
    assert.equal(init.headers.apikey, secret);
    assert.equal(init.headers.Authorization, undefined);
    return Response.json({
      users: Array.from({ length: userCount }, (_, index) => ({ id: index })),
    });
  };
}

assert.deepEqual(
  await runReadOnlyPreviewRemoteGates({
    root,
    runCommand: successfulCommand,
    fetchImpl: fetchFixture(),
  }),
  [],
);

let preparedCommandCalls = 0;
const preparedGate = await runReadOnlyPreviewRemoteGates({
  root,
  runCommand(_command, args) {
    preparedCommandCalls += 1;
    if (args.at(-1) === "--version") return expectedVersionResult;
    if (args.includes("migration")) {
      return {
        status: 0,
        signal: null,
        stdout: preparedMigrationStdout,
        stderr: migrationStderr,
      };
    }
    assert.fail(
      "El ledger preparado debe detener el gate antes de revelar API keys.",
    );
  },
  fetchImpl() {
    assert.fail("El ledger preparado debe detener el gate antes de Auth.");
  },
});
assert.equal(preparedCommandCalls, 2);
assert.match(preparedGate.join("\n"), /0061.*todavía no está aplicada.*STOP/);

let failedVersionCalls = 0;
const failedVersionGate = await runReadOnlyPreviewRemoteGates({
  root,
  runCommand() {
    failedVersionCalls += 1;
    return {
      error: new Error("fallo real de fixture"),
      status: null,
      signal: null,
      stdout: "",
      stderr: "fallo real de fixture\n",
    };
  },
  fetchImpl() {
    assert.fail(
      "Un fallo real de versión debe detener el gate antes de fetch.",
    );
  },
});
assert.deepEqual(failedVersionGate, [
  "El gate remoto requiere Supabase CLI exactamente 2.115.0.",
]);
assert.equal(failedVersionCalls, 1);

const usersPresent = await runReadOnlyPreviewRemoteGates({
  root,
  runCommand: successfulCommand,
  fetchImpl: fetchFixture(1),
});
assert.match(usersPresent.join("\n"), /cero usuarios/);
assert.doesNotMatch(usersPresent.join("\n"), /sb_secret_/);

const failedSecretInventory = await runReadOnlyPreviewRemoteGates({
  root,
  runCommand(command, args, options) {
    const result = successfulCommand(command, args, options);
    if (args.includes("api-keys")) {
      return {
        status: 1,
        signal: null,
        stdout: secret,
        stderr: `falló ${secret}`,
      };
    }
    return result;
  },
  fetchImpl: fetchFixture(),
});
assert.match(failedSecretInventory.join("\n"), /inventario de API keys/);
assert.doesNotMatch(failedSecretInventory.join("\n"), /sb_secret_|s{20}/);

console.log("Cloudflare read-only preview remote gate tests: PASS");
