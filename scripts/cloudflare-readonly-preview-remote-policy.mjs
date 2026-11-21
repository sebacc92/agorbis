import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EXPECTED_D72_MIGRATION_FILE,
  EXPECTED_PRODUCTION_MIGRATION_IDS,
} from "./production-preflight-policy.mjs";

const PROJECT_REF = "ibtvlvpxwourrxwcrfkf";
const SUPABASE_ORIGIN = `https://${PROJECT_REF}.supabase.co`;
const EXPECTED_CLI_VERSION = "2.115.0";
const KNOWN_SUPABASE_UPDATE_NOTICE_LINES = Object.freeze([
  "A new version of Supabase CLI is available: v2.116.0 (currently installed v2.115.0)",
  "We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli",
]);
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 1024 * 1024;

export const READ_ONLY_PREVIEW_MIGRATION_STATE = Object.freeze({
  APPLIED_EXACT: "APPLIED_EXACT",
  INVALID: "INVALID",
  PREPARED_NOT_APPLIED: "PREPARED_NOT_APPLIED",
});

const EXPECTED_POST_0060_MIGRATION_IDS = Object.freeze([
  ...Array.from({ length: 58 }, (_, index) =>
    String(index + 1).padStart(4, "0"),
  ),
  "0060",
]);
const expectedD72MigrationFileMatch = /^(\d{4})_.+\.sql$/.exec(
  EXPECTED_D72_MIGRATION_FILE,
);
if (!expectedD72MigrationFileMatch) {
  throw new Error("La migración D72 canónica no tiene un nombre válido.");
}
const EXPECTED_D72_MIGRATION_ID = expectedD72MigrationFileMatch[1];
export const EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS = Object.freeze([
  ...EXPECTED_PRODUCTION_MIGRATION_IDS,
  EXPECTED_D72_MIGRATION_ID,
]);
const PREPARED_NOT_APPLIED_MESSAGE = `${EXPECTED_D72_MIGRATION_ID} está preparada localmente pero todavía no está aplicada en Supabase Producción; el preview permanece STOP.`;

if (
  !exactSequence(
    EXPECTED_PRODUCTION_MIGRATION_IDS,
    EXPECTED_POST_0060_MIGRATION_IDS,
  ) ||
  EXPECTED_PRODUCTION_MIGRATION_IDS.includes(EXPECTED_D72_MIGRATION_ID)
) {
  throw new Error(
    "La política local y la política remota de migraciones no coinciden.",
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactSequence(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index])
  );
}

export function removeKnownSupabaseUpdateNotice(stderr) {
  if (typeof stderr !== "string") return null;

  const lines = stderr.split(/\r?\n/);
  const matches = [];
  for (
    let index = 0;
    index <= lines.length - KNOWN_SUPABASE_UPDATE_NOTICE_LINES.length;
    index += 1
  ) {
    if (
      KNOWN_SUPABASE_UPDATE_NOTICE_LINES.every(
        (line, offset) => lines[index + offset] === line,
      )
    ) {
      matches.push(index);
    }
  }
  if (matches.length === 0) return stderr;
  if (matches.length !== 1) return stderr;

  lines.splice(matches[0], KNOWN_SUPABASE_UPDATE_NOTICE_LINES.length);
  return lines.join("\n");
}

export function isExpectedSupabaseCliVersionResult(result) {
  if (
    result === null ||
    typeof result !== "object" ||
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    typeof result.stdout !== "string"
  ) {
    return false;
  }
  const stdoutIsExact = [
    EXPECTED_CLI_VERSION,
    `${EXPECTED_CLI_VERSION}\n`,
    `${EXPECTED_CLI_VERSION}\r\n`,
  ].includes(result.stdout);
  return stdoutIsExact && removeKnownSupabaseUpdateNotice(result.stderr) === "";
}

export function parseMigrationListOutput(stdout, stderr) {
  if (typeof stdout !== "string" || typeof stderr !== "string") {
    throw new Error("Salida de migration list inválida.");
  }
  const checkedStderr = removeKnownSupabaseUpdateNotice(stderr);
  if (checkedStderr === null) {
    throw new Error("Salida de migration list inválida.");
  }
  const stderrLines = checkedStderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const allowedStderr = [
    "Initialising login role...",
    "Connecting to remote database...",
    'Skipping migration 0016_world_subdivisions.sql.audit.json... (file name must match pattern "<timestamp>_name.sql")',
  ];
  if (
    stderrLines.some((line) => !allowedStderr.includes(line)) ||
    !stderrLines.includes("Connecting to remote database...")
  ) {
    throw new Error("Preambulo desconocido de migration list.");
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("migration list no devolvió un único JSON puro válido.");
  }
  if (
    !isPlainObject(parsed) ||
    !exactSequence(Object.keys(parsed).sort(), ["message", "migrations"]) ||
    parsed.message !== "Migrations listed" ||
    !Array.isArray(parsed.migrations)
  ) {
    throw new Error("Estructura JSON inesperada de migration list.");
  }

  return parsed.migrations.map((entry) => {
    if (
      !isPlainObject(entry) ||
      !exactSequence(Object.keys(entry).sort(), ["local", "remote", "time"]) ||
      typeof entry.local !== "string" ||
      typeof entry.remote !== "string" ||
      typeof entry.time !== "string" ||
      !/^(?:\d{4})?$/.test(entry.local) ||
      !/^(?:\d{4})?$/.test(entry.remote) ||
      !/^\d{4}$/.test(entry.time) ||
      (!entry.local && !entry.remote)
    ) {
      throw new Error("Fila JSON inesperada de migration list.");
    }
    return {
      local: entry.local === "" ? null : entry.local,
      remote: entry.remote === "" ? null : entry.remote,
      time: entry.time,
    };
  });
}

export function validateReadOnlyMigrationState(rows) {
  const result = classifyReadOnlyMigrationState(rows);
  if (result.state === READ_ONLY_PREVIEW_MIGRATION_STATE.APPLIED_EXACT) {
    return [];
  }
  if (result.state === READ_ONLY_PREVIEW_MIGRATION_STATE.PREPARED_NOT_APPLIED) {
    return [PREPARED_NOT_APPLIED_MESSAGE];
  }
  return result.errors;
}

function expectedMigrationRows({ remoteIncludesD72Migration }) {
  return EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS.map((migrationId) => ({
    local: migrationId,
    remote:
      migrationId === EXPECTED_D72_MIGRATION_ID && !remoteIncludesD72Migration
        ? null
        : migrationId,
    time: migrationId,
  }));
}

function exactMigrationRows(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every(
      (row, index) =>
        row.local === expected[index].local &&
        row.remote === expected[index].remote &&
        row.time === expected[index].time,
    )
  );
}

function validParsedMigrationRow(row) {
  return (
    isPlainObject(row) &&
    exactSequence(Object.keys(row).sort(), ["local", "remote", "time"]) &&
    (row.local === null || /^\d{4}$/.test(row.local)) &&
    (row.remote === null || /^\d{4}$/.test(row.remote)) &&
    /^\d{4}$/.test(row.time) &&
    (row.local !== null || row.remote !== null)
  );
}

export function classifyReadOnlyMigrationState(rows) {
  const invalid = (errors) =>
    Object.freeze({
      state: READ_ONLY_PREVIEW_MIGRATION_STATE.INVALID,
      errors: Object.freeze([...new Set(errors)]),
    });
  if (!Array.isArray(rows)) {
    return invalid(["migration list no devolvió filas."]);
  }
  if (!rows.every(validParsedMigrationRow)) {
    return invalid(["migration list contiene filas no canónicas."]);
  }
  if (
    rows.some(
      (row) =>
        row.local === "0059" || row.remote === "0059" || row.time === "0059",
    )
  ) {
    return invalid([
      "0059 no puede aparecer en Local, Remote ni Time; debe permanecer únicamente en migration-drafts.",
    ]);
  }

  const prepared = expectedMigrationRows({
    remoteIncludesD72Migration: false,
  });
  if (exactMigrationRows(rows, prepared)) {
    return Object.freeze({
      state: READ_ONLY_PREVIEW_MIGRATION_STATE.PREPARED_NOT_APPLIED,
      errors: Object.freeze([]),
    });
  }
  const applied = expectedMigrationRows({ remoteIncludesD72Migration: true });
  if (exactMigrationRows(rows, applied)) {
    return Object.freeze({
      state: READ_ONLY_PREVIEW_MIGRATION_STATE.APPLIED_EXACT,
      errors: Object.freeze([]),
    });
  }

  const local = rows
    .filter((row) => row?.local !== null)
    .map((row) => row.local);
  const remote = rows
    .filter((row) => row?.remote !== null)
    .map((row) => row.remote);
  const errors = [];
  if (!exactSequence(local, EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS)) {
    errors.push(
      `Supabase local debe enumerar exactamente 0001–0058, 0060 y ${EXPECTED_D72_MIGRATION_ID} una vez, sin 0059, gaps ni otros IDs.`,
    );
  }
  if (
    !exactSequence(remote, EXPECTED_PRODUCTION_MIGRATION_IDS) &&
    !exactSequence(remote, EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS)
  ) {
    errors.push(
      `Supabase Producción debe enumerar exactamente 0001–0058 y 0060 antes de ${EXPECTED_D72_MIGRATION_ID}, o 0001–0058, 0060 y ${EXPECTED_D72_MIGRATION_ID} después de aplicarla, sin 0059, gaps ni otros IDs.`,
    );
  }
  if (rows.some((row) => (row?.local ?? row?.remote ?? null) !== row?.time)) {
    errors.push("La columna Time de migration list no coincide con Local.");
  }
  if (
    errors.length === 0 &&
    !exactMigrationRows(rows, prepared) &&
    !exactMigrationRows(rows, applied)
  ) {
    errors.push(
      "migration list no alinea exactamente Local, Remote y Time para el ledger aprobado.",
    );
  }
  return invalid(errors);
}

export function parseRevealedApiKeys(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("El inventario de API keys no contiene JSON válido.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 32) {
    throw new Error(
      "El inventario de API keys tiene una estructura inesperada.",
    );
  }
  const identities = new Set();
  const expectedLegacyRoles = new Set(["anon", "service_role"]);
  const sanitized = [];
  for (const entry of parsed) {
    if (
      !isPlainObject(entry) ||
      typeof entry.name !== "string" ||
      entry.name.length === 0 ||
      !["legacy", "publishable", "secret"].includes(entry.type) ||
      typeof entry.api_key !== "string"
    ) {
      throw new Error("El inventario de API keys tiene una entrada inválida.");
    }
    const identity = `${entry.type}\u0000${entry.name}`;
    if (identities.has(identity)) {
      throw new Error(
        "El inventario de API keys contiene un tipo/nombre duplicado.",
      );
    }
    identities.add(identity);
    if (entry.type === "legacy") {
      if (!expectedLegacyRoles.has(entry.name)) {
        throw new Error(
          "El inventario de API keys contiene una legacy desconocida.",
        );
      }
      let payload;
      try {
        const parts = entry.api_key.split(".");
        if (parts.length !== 3 || parts.some((part) => !part)) {
          throw new Error("JWT legacy inválido.");
        }
        payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        );
      } catch {
        throw new Error(
          "El inventario de API keys contiene una legacy inválida.",
        );
      }
      if (
        !isPlainObject(payload) ||
        payload.iss !== "supabase" ||
        payload.ref !== PROJECT_REF ||
        payload.role !== entry.name
      ) {
        throw new Error(
          "El inventario de API keys contiene una legacy inválida.",
        );
      }
      // Las legacy se validan pero se descartan: ningún consumidor puede
      // seleccionarlas accidentalmente ni obtener su valor revelado.
      sanitized.push({ name: entry.name, type: entry.type });
      continue;
    }
    const expectedPrefix =
      entry.type === "secret"
        ? /^sb_secret_[A-Za-z0-9_-]{20,}$/
        : /^sb_publishable_[A-Za-z0-9_-]{20,}$/;
    if (!expectedPrefix.test(entry.api_key)) {
      throw new Error(
        "El inventario de API keys contiene un formato inválido.",
      );
    }
    sanitized.push(entry);
  }
  return sanitized;
}

export function selectDedicatedCloudflareSecret(entries) {
  const matches = entries.filter(
    (entry) =>
      entry.type === "secret" &&
      /cloudflare|worker/i.test(entry.name) &&
      isPlainObject(entry.secret_jwt_template) &&
      entry.secret_jwt_template.role === "service_role",
  );
  if (matches.length !== 1) {
    throw new Error(
      "Debe existir exactamente una sb_secret_ service_role cuyo nombre identifique Cloudflare/Worker.",
    );
  }
  return matches[0].api_key;
}

export function validateAuthSettings(value) {
  if (!isPlainObject(value) || typeof value.disable_signup !== "boolean") {
    return ["GET /auth/v1/settings devolvió una estructura inesperada."];
  }
  return value.disable_signup === true
    ? []
    : ["Supabase Auth debe tener disable_signup=true durante el preview."];
}

export function countAuthUsers(value) {
  if (!isPlainObject(value) || !Array.isArray(value.users)) {
    throw new Error("Auth Admin devolvió una estructura inesperada.");
  }
  return value.users.length;
}

function defaultCommandRunner(command, args, options) {
  return spawnSync(command, args, options);
}

function runPinnedSupabase(root, args, runCommand) {
  const cli = path.join(
    root,
    "node_modules",
    "supabase",
    "dist",
    "supabase.js",
  );
  return runCommand(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30_000,
  });
}

async function boundedJson(response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Supabase no devolvió JSON.");
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES)
  ) {
    throw new Error("Respuesta JSON de Supabase demasiado grande.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_JSON_BYTES) {
    throw new Error("Respuesta JSON de Supabase demasiado grande.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Supabase devolvió JSON inválido.");
  }
}

export async function runReadOnlyPreviewRemoteGates({
  root,
  fetchImpl = fetch,
  runCommand = defaultCommandRunner,
} = {}) {
  const errors = [];
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    return ["El gate remoto requiere un root absoluto."];
  }

  const version = runPinnedSupabase(root, ["--version"], runCommand);
  if (!isExpectedSupabaseCliVersionResult(version)) {
    return ["El gate remoto requiere Supabase CLI exactamente 2.115.0."];
  }

  const migrations = runPinnedSupabase(
    root,
    [
      "migration",
      "list",
      "--project-ref",
      PROJECT_REF,
      "--output-format",
      "json",
      "--agent",
      "no",
    ],
    runCommand,
  );
  if (migrations.error || migrations.status !== 0 || migrations.signal) {
    return [
      "No se pudo comprobar migration list remoto con el project ref explícito.",
    ];
  }
  try {
    errors.push(
      ...validateReadOnlyMigrationState(
        parseMigrationListOutput(migrations.stdout, migrations.stderr),
      ),
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (errors.length > 0) return errors;

  let publicKey;
  try {
    const configuration = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    );
    if (configuration.devDependencies?.supabase !== EXPECTED_CLI_VERSION) {
      throw new Error("package.json no fija Supabase CLI 2.115.0.");
    }
    const wrangler = readFileSync(
      path.join(root, "wrangler.readonly-preview.jsonc"),
      "utf8",
    );
    const match =
      /"PUBLIC_SUPABASE_ANON_KEY"\s*:\s*"(sb_publishable_[A-Za-z0-9_-]+)"/.exec(
        wrangler,
      );
    if (!match) throw new Error("Falta la publishable key versionada.");
    publicKey = match[1];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  try {
    const settingsResponse = await fetchImpl(
      `${SUPABASE_ORIGIN}/auth/v1/settings`,
      {
        headers: { apikey: publicKey, Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (settingsResponse.status !== 200) {
      throw new Error("Auth settings no devolvió HTTP 200.");
    }
    errors.push(...validateAuthSettings(await boundedJson(settingsResponse)));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (errors.length > 0) return errors;

  // Este comando es el único punto que recibe la sb_secret_ revelada. Su
  // stdout nunca se imprime ni forma parte de un error, y el valor sólo vive
  // en memoria el tiempo necesario para consultar una página de Auth Admin.
  const apiKeys = runPinnedSupabase(
    root,
    [
      "projects",
      "api-keys",
      "--project-ref",
      PROJECT_REF,
      "--reveal",
      "--output",
      "json",
    ],
    runCommand,
  );
  const checkedApiKeysStderr = removeKnownSupabaseUpdateNotice(apiKeys.stderr);
  if (
    apiKeys.error ||
    apiKeys.status !== 0 ||
    apiKeys.signal ||
    checkedApiKeysStderr === null ||
    checkedApiKeysStderr !== ""
  ) {
    return ["No se pudo obtener de forma segura el inventario de API keys."];
  }

  let cloudflareSecret;
  try {
    cloudflareSecret = selectDedicatedCloudflareSecret(
      parseRevealedApiKeys(apiKeys.stdout),
    );
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  try {
    const usersResponse = await fetchImpl(
      `${SUPABASE_ORIGIN}/auth/v1/admin/users?page=1&per_page=1`,
      {
        headers: {
          apikey: cloudflareSecret,
          Accept: "application/json",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (usersResponse.status !== 200) {
      throw new Error("Auth Admin no devolvió HTTP 200.");
    }
    if (countAuthUsers(await boundedJson(usersResponse)) !== 0) {
      throw new Error(
        "Supabase Auth debe contener cero usuarios para abrir el preview.",
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    cloudflareSecret = undefined;
  }

  return errors;
}

export const READ_ONLY_PREVIEW_REMOTE_CONSTANTS = Object.freeze({
  cliVersion: EXPECTED_CLI_VERSION,
  projectRef: PROJECT_REF,
  supabaseOrigin: SUPABASE_ORIGIN,
});
