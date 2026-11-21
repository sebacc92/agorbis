import { spawnSync } from "node:child_process";
import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  readSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  D72_SUPABASE_AGGREGATE_CHECK_IDS,
  D72_SUPABASE_CATALOG_DOMAIN_IDS,
  D72_SUPABASE_CATALOG_SECTIONS,
  D72_SUPABASE_CLI_VERSION,
  D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS,
  D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
  D72_SUPABASE_DOCKER_HOST,
  D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS,
  D72_SUPABASE_PROJECT_REF,
  D72_SUPABASE_GATE_IDS,
  D72_SUPABASE_LOCAL_DB_TEST_SHA256,
  D72_SUPABASE_LOCAL_GATE_TEST_FILES,
  D72_SUPABASE_MIGRATION_LIST_ARGS,
  D72_SUPABASE_PSQL_STDIN_ENTRYPOINT,
  D72_SUPABASE_READONLY_POLICY_SHA256,
  D72_SUPABASE_READONLY_QUERY_IDS,
  D72_SUPABASE_READONLY_QUERY_SHA256,
  assertD72SupabaseSanitizedGateResults,
  assertD72SupabaseCliArgs,
  buildD72RepositoryMigrationInventory,
  buildD72ProductionReadonlyEnvironment,
  buildD72ProductionReadonlyInvocation,
  d72SupabaseReadonlyQuery,
  d72SupabaseAppControlledRlsMetrics,
  d72SupabaseCatalogDomainDigests,
  evaluateD72SupabaseReadonlyGates,
  parseD72DbPushDryRunResult,
  parseD72MigrationListResult,
  parseD72ProductionQueryOutput,
} from "./d72-supabase-readonly-policy.mjs";
import { removeKnownSupabaseUpdateNotice } from "./cloudflare-readonly-preview-remote-policy.mjs";
import {
  EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR,
  PRODUCTION_QUERY_CA_CONTAINER_PATH,
  PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
  loadProductionBackupAssets,
  parseProductionDumpDryRun,
  productionDumpDryRunArgs,
} from "./production-backup-query-policy.mjs";

export const D72_SUPABASE_READONLY_RUN_SCHEMA_VERSION =
  "agorbis-d72-supabase-readonly-run/v1";
export const D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION =
  "agorbis-d72-supabase-readonly-remote-child/v1";
export const D72_SUPABASE_READONLY_REMOTE_INPUT_SCHEMA_VERSION =
  "agorbis-d72-supabase-readonly-remote-input/v1";
export const D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION = "22.22.0";
export const D72_SUPABASE_READONLY_FRESHNESS_MS = 60 * 60_000;
export const D72_SUPABASE_READONLY_ERROR_CODES = Object.freeze([
  "ASSET_VALIDATION_FAILED",
  "CLI_VERSION_FAILED",
  "CONNECTION_DISCOVERY_FAILED",
  "ENV_PASSWORD_FORBIDDEN",
  "GIT_IDENTITY_FAILED",
  "INVALID_ARGUMENTS",
  "MIGRATION_EVIDENCE_FAILED",
  "NODE_VERSION_MISMATCH",
  "QUERY_EXECUTION_FAILED",
  "QUERY_INVOCATION_REJECTED",
  "QUERY_OUTPUT_REJECTED",
  "RECEIPT_REJECTED",
  "TTY_INPUT_FAILED",
  "UNEXPECTED_FAILURE",
]);

const ERROR_CODE_SET = new Set(D72_SUPABASE_READONLY_ERROR_CODES);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_QUERY_ID_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;
const FORBIDDEN_GATE_EVIDENCE_KEY_PATTERN =
  /(?:sql|stdout|stderr|password|secret|token|e-?mail|connection|hostname|raw|snapshot|definition|rows|versions|fileNames)/i;
const MAX_PASSWORD_BYTES = 1024;
const MIN_PASSWORD_BYTES = 8;
const MAX_VERSION_OUTPUT_BYTES = 4096;
const MAX_DUMP_OUTPUT_BYTES = 256 * 1024;
const MAX_QUERY_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_REMOTE_CHILD_INPUT_BYTES = 96 * 1024 * 1024;
const MAX_REMOTE_CHILD_OUTPUT_BYTES = 16 * 1024 * 1024;
const SUPABASE_CHILD_TIMEOUT_MS = 60_000;
const QUERY_CHILD_TIMEOUT_MS = 120_000;
const LOCAL_HARNESS_TIMEOUT_MS = 15 * 60_000;
const LOCAL_CONTAINER_PROJECT_ID = "agorbis";
const LOCAL_DOCKER_CONFIG_SHA256 =
  "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356";
const SYSTEM_PATH = "/usr/bin:/bin";
const DOCKER_COMMAND = "/usr/bin/docker";
const GIT_COMMAND = "/usr/bin/git";
const STTY_COMMAND = "/usr/bin/stty";
const ISSUED_D72_SUPABASE_READONLY_RECEIPTS = new WeakMap();
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const D72_SUPABASE_READONLY_CLI_BINARY_PATH = path.join(
  REPOSITORY_ROOT,
  "node_modules",
  ".pnpm",
  "@supabase+cli-linux-x64@2.115.0",
  "node_modules",
  "@supabase",
  "cli-linux-x64",
  "bin",
  "supabase",
);
export const D72_SUPABASE_READONLY_CLI_BINARY_SHA256 =
  "5986d84e4c7e251126f7579c686b302b3527bc4b2ac1517963930eb0780d3867";
export const D72_SUPABASE_READONLY_CLI_BINARY_SIZE = 115_185_984;
const SUPABASE_CLI_PATH = D72_SUPABASE_READONLY_CLI_BINARY_PATH;
const REMOTE_CHILD_PATH = path.join(
  REPOSITORY_ROOT,
  "scripts",
  "d72-supabase-readonly-remote-child.mjs",
);
const PROC_SELF_CMDLINE_PATH = "/proc/self/cmdline";
const PROC_SELF_EXECUTABLE_PATH = "/proc/self/exe";
const REMOTE_CHILD_NODE_EXECUTABLE = process.execPath;
const REMOTE_CHILD_NODE_REALPATH = realpathSync(process.execPath);
const EXPECTED_REMOTE_CHILD_KERNEL_COMMAND_LINE = Buffer.from(
  `${REMOTE_CHILD_NODE_EXECUTABLE}\0${REMOTE_CHILD_PATH}\0`,
  "utf8",
);
const REMOTE_CHILD_MAIN_CAPABILITY = Symbol(
  "agorbis-d72-supabase-readonly-remote-child-main",
);
const BASE_ENVIRONMENT_NAMES = Object.freeze([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
  "GNOME_KEYRING_CONTROL",
  "SSH_AUTH_SOCK",
  "TMPDIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
]);

export class D72SupabaseReadonlyRunnerError extends Error {
  constructor(code, { remoteStage } = {}) {
    super(ERROR_CODE_SET.has(code) ? code : "UNEXPECTED_FAILURE");
    this.name = "D72SupabaseReadonlyRunnerError";
    this.code = this.message;
    // La etapa del hijo remoto viaja sólo con QUERY_EXECUTION_FAILED y sólo
    // como valor del enum cerrado: nunca texto que haya escrito el hijo. No
    // cambia el código ni la decisión; dice en qué paso se bloqueó.
    if (
      this.code === "QUERY_EXECUTION_FAILED" &&
      typeof remoteStage === "string" &&
      ERROR_CODE_SET.has(remoteStage)
    ) {
      Object.defineProperty(this, "remoteStage", {
        configurable: false,
        enumerable: true,
        value: remoteStage,
        writable: false,
      });
    }
  }
}

function fail(code) {
  throw new D72SupabaseReadonlyRunnerError(code);
}

function failRemoteStage(remoteStage) {
  throw new D72SupabaseReadonlyRunnerError("QUERY_EXECUTION_FAILED", {
    remoteStage,
  });
}

const MAX_REMOTE_CHILD_FAILURE_BYTES = 512;
const REMOTE_CHILD_FAILURE_KEYS = Object.freeze([
  "code",
  "schemaVersion",
  "stage",
  "status",
]);

/**
 * Etapa que declaró el hijo remoto al fallar, o `null`. Se acepta únicamente
 * la línea JSON canónica exacta que escribe
 * `runD72SupabaseReadonlyRemoteChildMain`: salida 1, stdout vacío, cuatro
 * claves, versión y estado fijos y una etapa del enum cerrado. Campos de más,
 * otro orden, texto suelto, un rastro de la contraseña o cualquier otra forma
 * devuelven `null` y dejan el error genérico de siempre. De acá sólo sale el
 * nombre de la etapa; el contenido de stderr no se conserva ni se reproduce.
 */
function remoteChildFailureStage(result, passwordBuffer) {
  if (
    !result ||
    typeof result !== "object" ||
    result.error ||
    result.signal !== null ||
    result.status !== 1 ||
    !Buffer.isBuffer(result.stdout) ||
    result.stdout.length !== 0 ||
    !Buffer.isBuffer(result.stderr) ||
    result.stderr.length === 0 ||
    result.stderr.length > MAX_REMOTE_CHILD_FAILURE_BYTES ||
    result.stderr.includes(0) ||
    !Buffer.isBuffer(passwordBuffer) ||
    result.stderr.includes(passwordBuffer) ||
    !isUtf8(result.stderr)
  ) {
    return null;
  }
  let source = "";
  try {
    source = result.stderr.toString("utf8");
    const parsed = JSON.parse(source);
    if (
      !exactKeys(parsed, REMOTE_CHILD_FAILURE_KEYS) ||
      `${JSON.stringify(canonicalize(parsed))}\n` !== source ||
      parsed.code !== "REMOTE_CHILD_FAILED" ||
      parsed.schemaVersion !==
        D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION ||
      parsed.status !== "BLOCKED" ||
      typeof parsed.stage !== "string" ||
      !ERROR_CODE_SET.has(parsed.stage)
    ) {
      return null;
    }
    return parsed.stage;
  } catch {
    return null;
  } finally {
    source = "";
  }
}

function fixedFailure(code, callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof D72SupabaseReadonlyRunnerError) throw error;
    fail(code);
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isEnvironmentObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function sha256Canonical(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expectedLocalHarnessSourceDigest() {
  return sha256Canonical({
    gateCoverage: D72_SUPABASE_LOCAL_GATE_TEST_FILES,
    sourceSha256: D72_SUPABASE_LOCAL_DB_TEST_SHA256,
  });
}

function exactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function validPasswordBuffer(value) {
  if (
    !Buffer.isBuffer(value) ||
    value.length < MIN_PASSWORD_BYTES ||
    value.length > MAX_PASSWORD_BYTES ||
    value.includes(0) ||
    value.includes(10) ||
    value.includes(13) ||
    !isUtf8(value)
  ) {
    return false;
  }
  return true;
}

function sha256FileDescriptor(descriptor, expectedBytes) {
  const digest = createHash("sha256");
  const chunk = Buffer.alloc(64 * 1024);
  let totalBytes = 0;
  try {
    while (true) {
      const bytesRead = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.length, expectedBytes + 1 - totalBytes),
        null,
      );
      if (!Number.isInteger(bytesRead) || bytesRead < 0) {
        fail("CLI_VERSION_FAILED");
      }
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > expectedBytes) fail("CLI_VERSION_FAILED");
      digest.update(chunk.subarray(0, bytesRead));
      chunk.fill(0, 0, bytesRead);
    }
    if (totalBytes !== expectedBytes) fail("CLI_VERSION_FAILED");
    return digest.digest("hex");
  } finally {
    chunk.fill(0);
  }
}

export function collectD72SupabaseCliBinaryEvidence() {
  let descriptor;
  try {
    if (process.platform !== "linux" || process.arch !== "x64") {
      fail("CLI_VERSION_FAILED");
    }
    const before = lstatSync(SUPABASE_CLI_PATH);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size !== D72_SUPABASE_READONLY_CLI_BINARY_SIZE ||
      (before.mode & 0o777) !== 0o755 ||
      realpathSync(SUPABASE_CLI_PATH) !== SUPABASE_CLI_PATH
    ) {
      fail("CLI_VERSION_FAILED");
    }
    descriptor = openSync(
      SUPABASE_CLI_PATH,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.isSymbolicLink() ||
      opened.size !== D72_SUPABASE_READONLY_CLI_BINARY_SIZE ||
      (opened.mode & 0o777) !== 0o755 ||
      realpathSync(`/proc/self/fd/${descriptor}`) !== SUPABASE_CLI_PATH
    ) {
      fail("CLI_VERSION_FAILED");
    }
    const digest = sha256FileDescriptor(
      descriptor,
      D72_SUPABASE_READONLY_CLI_BINARY_SIZE,
    );
    const after = lstatSync(SUPABASE_CLI_PATH);
    if (
      !opened.isFile() ||
      opened.isSymbolicLink() ||
      before.dev !== opened.dev ||
      before.ino !== opened.ino ||
      before.size !== opened.size ||
      before.mtimeMs !== opened.mtimeMs ||
      before.ctimeMs !== opened.ctimeMs ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    ) {
      fail("CLI_VERSION_FAILED");
    }
    return Object.freeze({
      digest,
      mode: opened.mode & 0o777,
      path: SUPABASE_CLI_PATH,
      realpath: realpathSync(SUPABASE_CLI_PATH),
      size: opened.size,
      type: "regular-file",
    });
  } catch (error) {
    if (error instanceof D72SupabaseReadonlyRunnerError) throw error;
    fail("CLI_VERSION_FAILED");
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        fail("CLI_VERSION_FAILED");
      }
    }
  }
}

export function validateD72SupabaseCliBinaryEvidence(evidence) {
  const expected = {
    digest: D72_SUPABASE_READONLY_CLI_BINARY_SHA256,
    mode: 0o755,
    path: SUPABASE_CLI_PATH,
    realpath: SUPABASE_CLI_PATH,
    size: D72_SUPABASE_READONLY_CLI_BINARY_SIZE,
    type: "regular-file",
  };
  return exactKeys(evidence, Object.keys(expected)) &&
    JSON.stringify(evidence) === JSON.stringify(expected)
    ? Object.freeze([])
    : Object.freeze([
        "El binario ELF fijado de Supabase CLI no coincide con la evidencia esperada.",
      ]);
}

function assertPinnedSupabaseCliBinary() {
  let evidence;
  try {
    evidence = collectD72SupabaseCliBinaryEvidence();
  } catch {
    fail("CLI_VERSION_FAILED");
  }
  if (validateD72SupabaseCliBinaryEvidence(evidence).length !== 0) {
    fail("CLI_VERSION_FAILED");
  }
}

function isExactRemoteChildEntrypoint() {
  let kernelCommandLine;
  try {
    if (
      process.platform !== "linux" ||
      realpathSync(PROC_SELF_EXECUTABLE_PATH) !== REMOTE_CHILD_NODE_REALPATH
    ) {
      return false;
    }
    kernelCommandLine = readFileSync(PROC_SELF_CMDLINE_PATH);
    return (
      Buffer.isBuffer(kernelCommandLine) &&
      kernelCommandLine.equals(EXPECTED_REMOTE_CHILD_KERNEL_COMMAND_LINE)
    );
  } catch {
    return false;
  } finally {
    if (Buffer.isBuffer(kernelCommandLine)) kernelCommandLine.fill(0);
  }
}

function assertRemoteChildExecutionBoundary({ capability, testOnly }) {
  if (testOnly === true) return;
  if (
    capability !== REMOTE_CHILD_MAIN_CAPABILITY ||
    !isExactRemoteChildEntrypoint()
  ) {
    fail("UNEXPECTED_FAILURE");
  }
}

function setTtyEcho(enabled) {
  const result = spawnSync(
    STTY_COMMAND,
    ["-F", "/dev/tty", enabled ? "echo" : "-echo"],
    { stdio: "ignore" },
  );
  if (result.error || result.signal !== null || result.status !== 0) {
    fail("TTY_INPUT_FAILED");
  }
}

const REAL_TTY_IO = Object.freeze({
  close: (descriptor) => closeSync(descriptor),
  open: () => openSync("/dev/tty", "r+"),
  read: (descriptor, byte) => readSync(descriptor, byte, 0, 1, null),
  setEcho: setTtyEcho,
  write: (descriptor, value) => writeSync(descriptor, value),
});

export function readD72SupabaseDatabasePasswordFromTty({
  io = REAL_TTY_IO,
} = {}) {
  let descriptor;
  let password;
  let failure = null;
  let echoWasTouched = false;
  const scratch = Buffer.alloc(MAX_PASSWORD_BYTES + 1);
  const byte = Buffer.alloc(1);
  let length = 0;

  try {
    descriptor = io.open();
    io.write(
      descriptor,
      "Contraseña DB de Supabase Producción (entrada oculta): ",
    );
    echoWasTouched = true;
    io.setEcho(false);
    while (length <= MAX_PASSWORD_BYTES) {
      if (io.read(descriptor, byte) !== 1) fail("TTY_INPUT_FAILED");
      if (byte[0] === 3) fail("TTY_INPUT_FAILED");
      if (byte[0] === 10 || byte[0] === 13) break;
      if (byte[0] === 8 || byte[0] === 127) {
        if (length > 0) {
          length -= 1;
          scratch[length] = 0;
        }
      } else {
        scratch[length] = byte[0];
        length += 1;
      }
    }
    if (length > MAX_PASSWORD_BYTES) fail("TTY_INPUT_FAILED");
    password = Buffer.from(scratch.subarray(0, length));
    if (!validPasswordBuffer(password)) fail("TTY_INPUT_FAILED");
  } catch {
    failure = new D72SupabaseReadonlyRunnerError("TTY_INPUT_FAILED");
  } finally {
    byte.fill(0);
    scratch.fill(0);
    if (descriptor !== undefined) {
      if (echoWasTouched) {
        try {
          io.setEcho(true);
          io.write(descriptor, "\n");
        } catch {
          failure ??= new D72SupabaseReadonlyRunnerError("TTY_INPUT_FAILED");
        }
      }
      try {
        io.close(descriptor);
      } catch {
        failure ??= new D72SupabaseReadonlyRunnerError("TTY_INPUT_FAILED");
      }
    }
  }
  if (failure) {
    if (Buffer.isBuffer(password)) password.fill(0);
    throw failure;
  }
  return password;
}

function copyApprovedEnvironment(sourceEnvironment, { password } = {}) {
  if (!isEnvironmentObject(sourceEnvironment)) fail("UNEXPECTED_FAILURE");
  const environment = {
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: SYSTEM_PATH,
  };
  for (const name of BASE_ENVIRONMENT_NAMES) {
    if (name === "PATH") continue;
    const value = sourceEnvironment[name];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      !value.includes("\0")
    ) {
      environment[name] = value;
    }
  }
  environment.SUPABASE_NO_UPDATE_NOTIFIER = "1";
  if (password !== undefined) {
    if (
      typeof password !== "string" ||
      password.length < MIN_PASSWORD_BYTES ||
      Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES ||
      /[\r\n\0]/.test(password)
    ) {
      fail("TTY_INPUT_FAILED");
    }
    environment.SUPABASE_DB_PASSWORD = password;
  }
  return environment;
}

function buildD72SupabaseReadonlyRemoteChildEnvironment(
  sourceEnvironment,
  password,
) {
  return copyApprovedEnvironment(sourceEnvironment, { password });
}

function clearSecretEnvironment(environment, name) {
  if (isPlainObject(environment) && Object.hasOwn(environment, name)) {
    environment[name] = "";
    delete environment[name];
  }
}

function passwordLineBuffer(password) {
  if (typeof password !== "string" || /[\r\n\0]/.test(password)) {
    fail("TTY_INPUT_FAILED");
  }
  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength < MIN_PASSWORD_BYTES || byteLength > MAX_PASSWORD_BYTES) {
    fail("TTY_INPUT_FAILED");
  }
  const line = Buffer.alloc(byteLength + 1);
  if (line.write(password, 0, byteLength, "utf8") !== byteLength) {
    line.fill(0);
    fail("TTY_INPUT_FAILED");
  }
  line[byteLength] = 10;
  return line;
}

function wipeResultBuffers(result) {
  if (!result || typeof result !== "object") return;
  if (Buffer.isBuffer(result.stdout)) result.stdout.fill(0);
  if (Buffer.isBuffer(result.stderr)) result.stderr.fill(0);
}

function decodeResult(result, { maxStdoutBytes, maxStderrBytes, code }) {
  if (
    !result ||
    typeof result !== "object" ||
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stdout.length > maxStdoutBytes ||
    result.stderr.length > maxStderrBytes ||
    result.stdout.includes(0) ||
    result.stderr.includes(0)
  ) {
    wipeResultBuffers(result);
    fail(code);
  }
  let stdout = "";
  let stderr = "";
  try {
    stdout = result.stdout.toString("utf8");
    stderr = result.stderr.toString("utf8");
    if (
      !Buffer.from(stdout, "utf8").equals(result.stdout) ||
      !Buffer.from(stderr, "utf8").equals(result.stderr)
    ) {
      fail(code);
    }
    return { stderr, stdout };
  } finally {
    wipeResultBuffers(result);
  }
}

function runCaptured(runCommand, command, args, options, code, limits) {
  let result;
  try {
    result = runCommand(command, args, {
      ...options,
      encoding: "buffer",
      stdio: [
        Buffer.isBuffer(options.input) ? "pipe" : "ignore",
        "pipe",
        "pipe",
      ],
    });
  } catch {
    fail(code);
  }
  return decodeResult(result, { ...limits, code });
}

function runCapturedAllowingNonzero(
  runCommand,
  command,
  args,
  options,
  limits,
) {
  let result;
  try {
    const inputIsBuffer = Buffer.isBuffer(options.input);
    result = runCommand(command, args, {
      ...options,
      encoding: "buffer",
      stdio: [inputIsBuffer ? "pipe" : "ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
  if (
    !result ||
    typeof result !== "object" ||
    result.error ||
    result.signal !== null ||
    !Number.isInteger(result.status) ||
    result.status < 0 ||
    result.status > 255 ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stdout.length > limits.maxStdoutBytes ||
    result.stderr.length > limits.maxStderrBytes ||
    result.stdout.includes(0) ||
    result.stderr.includes(0)
  ) {
    wipeResultBuffers(result);
    return null;
  }
  let stdout = "";
  let stderr = "";
  try {
    stdout = result.stdout.toString("utf8");
    stderr = result.stderr.toString("utf8");
    if (
      !Buffer.from(stdout, "utf8").equals(result.stdout) ||
      !Buffer.from(stderr, "utf8").equals(result.stderr)
    ) {
      return null;
    }
    return { status: result.status, stderr, stdout };
  } finally {
    wipeResultBuffers(result);
  }
}

function assertNoLinked(args, code) {
  if (
    !Array.isArray(args) ||
    args.some((argument) => typeof argument !== "string") ||
    args.includes("--linked") ||
    args.includes("--password") ||
    args.includes("--db-url")
  ) {
    fail(code);
  }
}

function expectedQueryTransaction(queryId) {
  return `begin transaction read only; ${d72SupabaseReadonlyQuery(queryId)
    .trim()
    .replace(/;$/, "")}; rollback`;
}

function expectedQueryArguments(queryId, assets) {
  return [
    "--config",
    path.join(assets.repositoryRoot, D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH),
    "--host",
    D72_SUPABASE_DOCKER_HOST,
    "run",
    "--interactive",
    "--rm",
    "--network",
    "host",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "postgres",
    "--mount",
    `type=bind,source=${assets.caHostPath},target=${PRODUCTION_QUERY_CA_CONTAINER_PATH},readonly`,
    "-e",
    "PGHOST",
    "-e",
    "PGPORT",
    "-e",
    "PGUSER",
    "-e",
    "PGDATABASE",
    "-e",
    "PGSSLMODE",
    "-e",
    "PGSSLROOTCERT",
    "--entrypoint",
    "/bin/sh",
    PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
    "-ceu",
    D72_SUPABASE_PSQL_STDIN_ENTRYPOINT,
    "agorbis-d72-psql",
    "--no-psqlrc",
    "--no-align",
    "--tuples-only",
    "--quiet",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    expectedQueryTransaction(queryId),
  ];
}

function dockerGlobalArguments(repositoryRoot) {
  return [
    "--config",
    path.join(repositoryRoot, D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH),
    "--host",
    D72_SUPABASE_DOCKER_HOST,
  ];
}

function assertPinnedLocalDockerBoundary(repositoryRoot) {
  const configDirectory = path.join(
    repositoryRoot,
    D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
  );
  const configPath = path.join(configDirectory, "config.json");
  const metadata = lstatSync(configPath);
  const directoryMetadata = lstatSync(configDirectory);
  const socketMetadata = lstatSync("/var/run/docker.sock");
  if (
    !directoryMetadata.isDirectory() ||
    directoryMetadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    realpathSync(configDirectory) !== configDirectory ||
    realpathSync(configPath) !== configPath ||
    sha256(readFileSync(configPath)) !== LOCAL_DOCKER_CONFIG_SHA256 ||
    !socketMetadata.isSocket()
  ) {
    fail("ASSET_VALIDATION_FAILED");
  }
  return configDirectory;
}

function localProjectId(repositoryRoot) {
  const config = readFileSync(
    path.join(repositoryRoot, "supabase", "config.toml"),
    "utf8",
  );
  const matches = [...config.matchAll(/^project_id\s*=\s*"([^"]+)"\s*$/gm)];
  if (matches.length !== 1 || matches[0][1] !== LOCAL_CONTAINER_PROJECT_ID) {
    throw new Error("local project id mismatch");
  }
  return matches[0][1];
}

function localContainerName(repositoryRoot) {
  return `supabase_db_${localProjectId(repositoryRoot)}`;
}

function buildLocalChildEnvironment(sourceEnvironment) {
  if (!isEnvironmentObject(sourceEnvironment)) fail("UNEXPECTED_FAILURE");
  const environment = {
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: SYSTEM_PATH,
  };
  for (const name of [
    "HOME",
    "USER",
    "LOGNAME",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "TMPDIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    const value = sourceEnvironment[name];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      !value.includes("\0")
    ) {
      environment[name] = value;
    }
  }
  environment.AGORBIS_DB_CONTAINER = `supabase_db_${LOCAL_CONTAINER_PROJECT_ID}`;
  environment.GEOUNITY_DB_CONTAINER = `supabase_db_${LOCAL_CONTAINER_PROJECT_ID}`;
  return environment;
}

function buildDockerChildEnvironment(sourceEnvironment, repositoryRoot) {
  const environment = buildLocalChildEnvironment(sourceEnvironment);
  environment.DOCKER_CONFIG = path.join(
    repositoryRoot,
    D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
  );
  delete environment.DOCKER_HOST;
  delete environment.DOCKER_CONTEXT;
  return environment;
}

function localContainerInspectArguments(container, repositoryRoot) {
  return [
    ...dockerGlobalArguments(repositoryRoot),
    "inspect",
    container,
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
  ];
}

function localCatalogArguments(container, repositoryRoot) {
  return [
    ...dockerGlobalArguments(repositoryRoot),
    "exec",
    "--user",
    "postgres",
    container,
    "psql",
    "--no-psqlrc",
    "--no-align",
    "--tuples-only",
    "--quiet",
    "--set",
    "ON_ERROR_STOP=1",
    "--dbname",
    "postgres",
    "--command",
    expectedQueryTransaction("catalog"),
  ];
}

function collectGitIdentity({ repositoryRoot, runCommand, environment }) {
  const gitEnvironment = {
    ...environment,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  let headOutput = "";
  let headStderr = "";
  let statusOutput = "";
  let statusStderr = "";
  let diffOutput = "";
  let diffStderr = "";
  try {
    ({ stdout: headOutput, stderr: headStderr } = runCaptured(
      runCommand,
      GIT_COMMAND,
      ["rev-parse", "HEAD"],
      {
        cwd: repositoryRoot,
        env: gitEnvironment,
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      },
      "GIT_IDENTITY_FAILED",
      { maxStderrBytes: 1024 * 1024, maxStdoutBytes: 1024 * 1024 },
    ));
    ({ stdout: statusOutput, stderr: statusStderr } = runCaptured(
      runCommand,
      GIT_COMMAND,
      ["status", "--porcelain=v1"],
      {
        cwd: repositoryRoot,
        env: gitEnvironment,
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      },
      "GIT_IDENTITY_FAILED",
      { maxStderrBytes: 1024 * 1024, maxStdoutBytes: 1024 * 1024 },
    ));
    ({ stdout: diffOutput, stderr: diffStderr } = runCaptured(
      runCommand,
      GIT_COMMAND,
      ["diff", "--check"],
      {
        cwd: repositoryRoot,
        env: gitEnvironment,
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      },
      "GIT_IDENTITY_FAILED",
      { maxStderrBytes: 1024 * 1024, maxStdoutBytes: 1024 * 1024 },
    ));
    if (
      !/^[0-9a-f]{40}\n$/.test(headOutput) ||
      headStderr !== "" ||
      statusStderr !== "" ||
      diffStderr !== "" ||
      diffOutput !== ""
    ) {
      fail("GIT_IDENTITY_FAILED");
    }
    return {
      clean: statusOutput === "",
      head: headOutput.slice(0, -1),
    };
  } finally {
    headOutput = "";
    headStderr = "";
    statusOutput = "";
    statusStderr = "";
    diffOutput = "";
    diffStderr = "";
  }
}

function localDatabaseTestArguments(container, repositoryRoot) {
  return [
    ...dockerGlobalArguments(repositoryRoot),
    "exec",
    "--interactive",
    "--user",
    "postgres",
    container,
    "psql",
    "--no-psqlrc",
    "--dbname",
    "postgres",
    "--set",
    "ON_ERROR_STOP=1",
    "--file",
    "-",
  ];
}

function loadPinnedLocalDatabaseTests(repositoryRoot) {
  const testsDirectory = path.join(repositoryRoot, "supabase", "tests");
  const expectedNames = Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256);
  const actualNames = readdirSync(testsDirectory)
    .filter((name) => name.endsWith("_checks.sql"))
    .sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail("ASSET_VALIDATION_FAILED");
  }
  return actualNames.map((name) => {
    const filePath = path.join(testsDirectory, name);
    const metadata = lstatSync(filePath);
    const bytes = readFileSync(filePath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      realpathSync(filePath) !== filePath ||
      sha256(bytes) !== D72_SUPABASE_LOCAL_DB_TEST_SHA256[name]
    ) {
      bytes.fill(0);
      fail("ASSET_VALIDATION_FAILED");
    }
    return { bytes, name };
  });
}

function localContractsFromTestStatuses(statusByName, head) {
  const passes = (gateId) =>
    D72_SUPABASE_LOCAL_GATE_TEST_FILES[gateId].every(
      (name) => statusByName.get(name) === 0,
    );
  return {
    antiAbusePassed: passes("security.anti-abuse-limits"),
    d68Passed: passes("privacy.no-individual-ballots"),
    dataIntegrityPassed: passes("data.integrity-no-corruption"),
    head,
    residencyPassed: passes("authorization.residency-write-boundary"),
    rlsPassed: passes("security.rls-enforced"),
  };
}

function sanitizedLocalGateContracts(contracts = null) {
  return {
    "authorization.residency-write-boundary":
      contracts?.residencyPassed ?? null,
    "data.integrity-no-corruption": contracts?.dataIntegrityPassed ?? null,
    "privacy.no-individual-ballots": contracts?.d68Passed ?? null,
    "security.anti-abuse-limits": contracts?.antiAbusePassed ?? null,
    "security.rls-enforced": contracts?.rlsPassed ?? null,
  };
}

function migrationSqlFileNames(directory) {
  return readdirSync(directory)
    .filter((name) => /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(name))
    .sort()
    .map((name) => {
      const filePath = path.join(directory, name);
      const metadata = lstatSync(filePath);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        realpathSync(filePath) !== filePath
      ) {
        fail("MIGRATION_EVIDENCE_FAILED");
      }
      return name;
    });
}

function collectRepositoryMigrationInventory(repositoryRoot) {
  return fixedFailure("MIGRATION_EVIDENCE_FAILED", () =>
    buildD72RepositoryMigrationInventory({
      draftFileNames: migrationSqlFileNames(
        path.join(repositoryRoot, "supabase", "migration-drafts"),
      ),
      executableFileNames: migrationSqlFileNames(
        path.join(repositoryRoot, "supabase", "migrations"),
      ),
    }),
  );
}

function runSupabaseMigrationEvidence({
  baseEnvironment,
  repositoryRoot,
  runCommand,
  supabaseCliPath,
}) {
  assertD72SupabaseCliArgs("migration-list", D72_SUPABASE_MIGRATION_LIST_ARGS);
  assertD72SupabaseCliArgs(
    "db-push-dry-run",
    D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS,
  );
  const execute = (args) => {
    const { stdout, stderr } = runCaptured(
      runCommand,
      supabaseCliPath,
      args,
      {
        cwd: repositoryRoot,
        env: baseEnvironment,
        maxBuffer: MAX_QUERY_OUTPUT_BYTES,
        timeout: QUERY_CHILD_TIMEOUT_MS,
      },
      "MIGRATION_EVIDENCE_FAILED",
      {
        maxStderrBytes: MAX_QUERY_OUTPUT_BYTES,
        maxStdoutBytes: MAX_QUERY_OUTPUT_BYTES,
      },
    );
    return { error: null, signal: null, status: 0, stderr, stdout };
  };
  const migrationList = fixedFailure("MIGRATION_EVIDENCE_FAILED", () =>
    parseD72MigrationListResult(execute(D72_SUPABASE_MIGRATION_LIST_ARGS)),
  );
  const dbPushDryRun = fixedFailure("MIGRATION_EVIDENCE_FAILED", () =>
    parseD72DbPushDryRunResult(execute(D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS)),
  );
  return { dbPushDryRun, migrationList };
}

function collectLocalEvidence({
  environment,
  gitIdentity,
  parseQueryOutput,
  repositoryRoot,
  runCommand,
}) {
  const unavailable = (overrides = {}) => ({
    catalog: null,
    contracts: null,
    receipt: {
      catalogDigest: null,
      catalogDomainDigests: null,
      catalogQueryExecuted: false,
      executedTestCount: 0,
      failedTestCount: null,
      gateContracts: sanitizedLocalGateContracts(),
      harnessExitCode: null,
      harnessOutputDigest: null,
      harnessSourceDigest: null,
      status: "NOT_VERIFIED",
      ...overrides,
    },
  });
  if (!gitIdentity.clean) return unavailable();

  let container;
  let harnessSourceDigest;
  let testAssets = [];
  try {
    container = localContainerName(repositoryRoot);
    harnessSourceDigest = expectedLocalHarnessSourceDigest();
  } catch {
    return unavailable();
  }
  const localEnvironment = buildDockerChildEnvironment(
    environment,
    repositoryRoot,
  );
  let inspectOutput = "";
  let inspectStderr = "";
  try {
    ({ stdout: inspectOutput, stderr: inspectStderr } = runCaptured(
      runCommand,
      DOCKER_COMMAND,
      localContainerInspectArguments(container, repositoryRoot),
      {
        cwd: repositoryRoot,
        env: localEnvironment,
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      },
      "QUERY_OUTPUT_REJECTED",
      { maxStderrBytes: 1024 * 1024, maxStdoutBytes: 1024 * 1024 },
    ));
  } catch {
    return unavailable({ harnessSourceDigest });
  }
  const expectedLabels = `${LOCAL_CONTAINER_PROJECT_ID}|${repositoryRoot}\n`;
  if (inspectStderr !== "" || inspectOutput !== expectedLabels) {
    return unavailable({ harnessSourceDigest });
  }
  inspectOutput = "";
  inspectStderr = "";

  try {
    testAssets = loadPinnedLocalDatabaseTests(repositoryRoot);
  } catch {
    return unavailable({ harnessSourceDigest });
  }

  const statusByName = new Map();
  const outputDigests = [];
  try {
    for (const testAsset of testAssets) {
      const testResult = runCapturedAllowingNonzero(
        runCommand,
        DOCKER_COMMAND,
        localDatabaseTestArguments(container, repositoryRoot),
        {
          cwd: repositoryRoot,
          env: localEnvironment,
          input: testAsset.bytes,
          maxBuffer: MAX_QUERY_OUTPUT_BYTES,
          timeout: LOCAL_HARNESS_TIMEOUT_MS,
        },
        {
          maxStderrBytes: MAX_QUERY_OUTPUT_BYTES,
          maxStdoutBytes: MAX_QUERY_OUTPUT_BYTES,
        },
      );
      if (!testResult) {
        return unavailable({
          executedTestCount: statusByName.size,
          harnessSourceDigest,
        });
      }
      statusByName.set(testAsset.name, testResult.status);
      outputDigests.push(
        sha256Canonical({
          name: testAsset.name,
          status: testResult.status,
          stderr: testResult.stderr,
          stdout: testResult.stdout,
        }),
      );
      testResult.stdout = "";
      testResult.stderr = "";
    }
  } finally {
    for (const testAsset of testAssets) testAsset.bytes.fill(0);
    testAssets = [];
  }
  const failedTestCount = [...statusByName.values()].filter(
    (status) => status !== 0,
  ).length;
  const harnessExitCode = failedTestCount === 0 ? 0 : 1;
  const harnessOutputDigest = sha256Canonical(outputDigests);

  let catalogOutput = "";
  let catalogStderr = "";
  try {
    ({ stdout: catalogOutput, stderr: catalogStderr } = runCaptured(
      runCommand,
      DOCKER_COMMAND,
      localCatalogArguments(container, repositoryRoot),
      {
        cwd: repositoryRoot,
        env: localEnvironment,
        maxBuffer: MAX_QUERY_OUTPUT_BYTES,
        timeout: QUERY_CHILD_TIMEOUT_MS,
      },
      "QUERY_OUTPUT_REJECTED",
      {
        maxStderrBytes: MAX_VERSION_OUTPUT_BYTES,
        maxStdoutBytes: MAX_QUERY_OUTPUT_BYTES,
      },
    ));
    if (catalogStderr !== "") {
      return unavailable({
        catalogQueryExecuted: true,
        executedTestCount: statusByName.size,
        failedTestCount,
        harnessExitCode,
        harnessOutputDigest,
        harnessSourceDigest,
      });
    }
    const catalog = parseQueryOutput("catalog", catalogOutput);
    const contracts = localContractsFromTestStatuses(
      statusByName,
      gitIdentity.head,
    );
    return {
      catalog,
      contracts,
      receipt: {
        catalogDigest: sha256Canonical(catalog),
        catalogDomainDigests: d72SupabaseCatalogDomainDigests(catalog),
        catalogQueryExecuted: true,
        executedTestCount: statusByName.size,
        failedTestCount,
        gateContracts: sanitizedLocalGateContracts(contracts),
        harnessExitCode,
        harnessOutputDigest,
        harnessSourceDigest,
        status: "VERIFIED",
      },
    };
  } catch {
    return unavailable({
      catalogQueryExecuted: true,
      executedTestCount: statusByName.size,
      failedTestCount,
      harnessExitCode,
      harnessOutputDigest,
      harnessSourceDigest,
    });
  } finally {
    catalogOutput = "";
    catalogStderr = "";
  }
}

export function assertD72SupabaseReadonlyInvocation(
  queryId,
  invocation,
  assets,
) {
  const expectedArgs = expectedQueryArguments(queryId, assets);
  if (
    !exactKeys(invocation, ["args", "command"]) ||
    invocation.command !== "docker" ||
    JSON.stringify(invocation.args) !== JSON.stringify(expectedArgs)
  ) {
    fail("QUERY_INVOCATION_REJECTED");
  }
  assertNoLinked(invocation.args, "QUERY_INVOCATION_REJECTED");
  return true;
}

function assertD72QueryEnvironment(environment, connection, assets) {
  const approvedKeys = new Set([
    ...BASE_ENVIRONMENT_NAMES.filter(
      (name) => name !== "SUPABASE_ACCESS_TOKEN",
    ),
    "LANG",
    "LC_ALL",
    "DOCKER_CONFIG",
    "PGHOST",
    "PGPORT",
    "PGUSER",
    "PGDATABASE",
    "PGSSLMODE",
    "PGSSLROOTCERT",
  ]);
  if (
    !isPlainObject(environment) ||
    Object.keys(environment).some((key) => !approvedKeys.has(key)) ||
    environment.PGHOST !== connection.host ||
    environment.PGPORT !== connection.port ||
    environment.PGUSER !== connection.user ||
    environment.PGDATABASE !== connection.database ||
    Object.hasOwn(environment, "PGPASSWORD") ||
    environment.PGSSLMODE !== "verify-full" ||
    environment.PGSSLROOTCERT !== PRODUCTION_QUERY_CA_CONTAINER_PATH ||
    environment.DOCKER_CONFIG !==
      path.join(
        assets.repositoryRoot,
        D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
      ) ||
    Object.hasOwn(environment, "DOCKER_HOST") ||
    Object.hasOwn(environment, "DOCKER_CONTEXT")
  ) {
    fail("QUERY_INVOCATION_REJECTED");
  }
}

function summarizeQueryResult(queryId, parsed) {
  const common = {
    queryId,
    querySha256: D72_SUPABASE_READONLY_QUERY_SHA256[queryId],
    resultDigest: sha256Canonical(parsed),
  };
  if (queryId === "aggregate-checks") {
    return {
      ...common,
      checkCount: parsed.checks.length,
      failedCheckIds: parsed.checks
        .filter((entry) => entry.invalidRowCount !== "0")
        .map((entry) => entry.id),
      invalidRowCounts: Object.fromEntries(
        parsed.checks.map((entry) => [entry.id, entry.invalidRowCount]),
      ),
    };
  }
  const sectionCounts = Object.fromEntries(
    D72_SUPABASE_CATALOG_SECTIONS.map((section) => [
      section,
      parsed[section].length,
    ]),
  );
  const appControlledRls = d72SupabaseAppControlledRlsMetrics(parsed);
  return {
    ...common,
    domainDigests: d72SupabaseCatalogDomainDigests(parsed),
    forcedRlsTableCount: appControlledRls.forcedRlsTableCount,
    functionCount: parsed.functions.length,
    grantCount: parsed.grants.length,
    policyCount: parsed.policies.length,
    rlsTableCount: appControlledRls.rlsTableCount,
    sectionCounts,
    triggerCount: parsed.triggers.length,
  };
}

const REMOTE_CHILD_CONTEXT_KEYS = Object.freeze([
  "head",
  "localCatalog",
  "localContracts",
  "observedAtUtc",
  "schemaVersion",
]);
const REMOTE_CHILD_RESULT_KEYS = Object.freeze([
  "contentSha256",
  "contextSha256",
  "databaseWriteExecuted",
  "gates",
  "head",
  "observedAtUtc",
  "queries",
  "schemaVersion",
  "sensitiveOutputStored",
  "transactionReadOnly",
]);

function canonicalUtcInstant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed
    : null;
}

function remoteChildContextSha256(context) {
  return sha256Canonical(context);
}

function assertRemoteChildContext(context) {
  if (
    !exactKeys(context, REMOTE_CHILD_CONTEXT_KEYS) ||
    context.schemaVersion !==
      D72_SUPABASE_READONLY_REMOTE_INPUT_SCHEMA_VERSION ||
    !/^[0-9a-f]{40}$/.test(context.head ?? "") ||
    !canonicalUtcInstant(context.observedAtUtc) ||
    !(
      (context.localCatalog === null && context.localContracts === null) ||
      (isPlainObject(context.localCatalog) &&
        isPlainObject(context.localContracts))
    )
  ) {
    fail("QUERY_INVOCATION_REJECTED");
  }
  return context;
}

function databasePlaceholderGate(context) {
  return evaluateD72SupabaseReadonlyGates({
    head: context.head,
    localCatalog: null,
    localContracts: null,
    observedAt: context.observedAtUtc,
  })[0];
}

function assertRemoteQuerySummaries(queries) {
  const aggregateKeys = [
    "checkCount",
    "failedCheckIds",
    "invalidRowCounts",
    "queryId",
    "querySha256",
    "resultDigest",
  ];
  const catalogKeys = [
    "domainDigests",
    "forcedRlsTableCount",
    "functionCount",
    "grantCount",
    "policyCount",
    "queryId",
    "querySha256",
    "resultDigest",
    "rlsTableCount",
    "sectionCounts",
    "triggerCount",
  ];
  if (
    !Array.isArray(queries) ||
    queries.length !== 2 ||
    !exactKeys(queries[0], aggregateKeys) ||
    !exactKeys(queries[1], catalogKeys) ||
    queries[0].queryId !== "aggregate-checks" ||
    queries[1].queryId !== "catalog" ||
    queries.some(
      (query) =>
        query.querySha256 !==
          D72_SUPABASE_READONLY_QUERY_SHA256[query.queryId] ||
        !SHA256_PATTERN.test(query.resultDigest ?? ""),
    ) ||
    !Number.isSafeInteger(queries[0].checkCount) ||
    queries[0].checkCount < 0 ||
    !Array.isArray(queries[0].failedCheckIds) ||
    !exactKeys(queries[0].invalidRowCounts, D72_SUPABASE_AGGREGATE_CHECK_IDS) ||
    Object.values(queries[0].invalidRowCounts).some(
      (value) => typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value),
    ) ||
    !exactKeys(queries[1].domainDigests, D72_SUPABASE_CATALOG_DOMAIN_IDS) ||
    Object.values(queries[1].domainDigests).some(
      (value) => !SHA256_PATTERN.test(value ?? ""),
    ) ||
    !exactKeys(queries[1].sectionCounts, D72_SUPABASE_CATALOG_SECTIONS) ||
    [
      queries[1].forcedRlsTableCount,
      queries[1].functionCount,
      queries[1].grantCount,
      queries[1].policyCount,
      queries[1].rlsTableCount,
      queries[1].triggerCount,
      ...D72_SUPABASE_CATALOG_SECTIONS.map(
        (section) => queries[1].sectionCounts[section],
      ),
    ].some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    fail("QUERY_OUTPUT_REJECTED");
  }
}

export function assertD72SupabaseReadonlyRemoteChildResult(result, context) {
  assertRemoteChildContext(context);
  if (
    !exactKeys(result, REMOTE_CHILD_RESULT_KEYS) ||
    result.schemaVersion !==
      D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION ||
    result.head !== context.head ||
    result.observedAtUtc !== context.observedAtUtc ||
    result.contextSha256 !== remoteChildContextSha256(context) ||
    result.contentSha256 !==
      sha256Canonical(
        Object.fromEntries(
          Object.entries(result).filter(([key]) => key !== "contentSha256"),
        ),
      ) ||
    result.transactionReadOnly !== true ||
    result.databaseWriteExecuted !== false ||
    result.sensitiveOutputStored !== false ||
    !Array.isArray(result.gates) ||
    result.gates.length !== D72_SUPABASE_GATE_IDS.length - 1 ||
    result.gates.some(
      (gate, index) => gate.gateId !== D72_SUPABASE_GATE_IDS[index + 1],
    )
  ) {
    fail("QUERY_OUTPUT_REJECTED");
  }
  assertRemoteQuerySummaries(result.queries);
  assertD72SupabaseSanitizedGateResults([
    databasePlaceholderGate(context),
    ...result.gates,
  ]);
  const serialized = JSON.stringify(result);
  if (
    serialized.includes(D72_SUPABASE_PROJECT_REF) ||
    serialized.includes("PGPASSWORD") ||
    serialized.includes("SUPABASE_DB_PASSWORD") ||
    serialized.includes("postgres.") ||
    serialized.includes("supabase.com")
  ) {
    fail("QUERY_OUTPUT_REJECTED");
  }
  return result;
}

const D72_GATE_EVIDENCE_KEYS = Object.freeze({
  "authorization.residency-write-boundary": Object.freeze([
    "boundaryContractDigest",
    "guardedFunctionCount",
    "guardedPolicyCount",
    "localContractPassed",
    "minimumCatalogContractPassed",
    "observedAt",
    "projectRefDigest",
  ]),
  "data.integrity-no-corruption": Object.freeze([
    "checkCount",
    "failedCheckIds",
    "integrityPolicyDigest",
    "invalidRowCounts",
    "localContractPassed",
    "minimumCatalogContractPassed",
    "observedAt",
    "projectRefDigest",
    "transactionReadOnly",
  ]),
  "database.expected-migrations-only": Object.freeze([
    "draft0059Present",
    "dryRunChangeCounts",
    "executable0059Present",
    "localLedgerDigest",
    "localMaximumVersion",
    "observedAt",
    "pendingMigrationCount",
    "production0059Present",
    "production0060Present",
    "projectRefDigest",
    "remoteLedgerDigest",
    "remoteMaximumVersion",
  ]),
  "privacy.no-individual-ballots": Object.freeze([
    "ballotContractDigest",
    "individualBallotSurfaceCount",
    "localD68ContractPassed",
    "observedAt",
    "projectRefDigest",
    "reidentifiableRowCount",
  ]),
  "security.anti-abuse-limits": Object.freeze([
    "antiAbuseContractDigest",
    "guardedSurfaceCount",
    "localContractPassed",
    "minimumCatalogContractPassed",
    "observedAt",
    "projectRefDigest",
    "unknownBypassCount",
  ]),
  "security.rls-enforced": Object.freeze([
    "catalogContractDigest",
    "forcedRlsTableCount",
    "grantInventoryDigest",
    "localContractPassed",
    "minimumCatalogContractPassed",
    "observedAt",
    "policyInventoryDigest",
    "projectRefDigest",
    "rlsTableCount",
  ]),
});

function safeReceiptCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeReceiptDecimal(value) {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,29})$/.test(value);
}

function validCatalogDomainDigests(value, { nullable = false } = {}) {
  if (nullable && value === null) return true;
  return (
    isPlainObject(value) &&
    exactKeys(value, D72_SUPABASE_CATALOG_DOMAIN_IDS) &&
    Object.values(value).every((digest) => SHA256_PATTERN.test(digest ?? ""))
  );
}

function expectedGateStatusFromReceipt(gate, receipt) {
  const evidence = gate.evidence;
  if (
    !isPlainObject(evidence) ||
    !exactKeys(evidence, D72_GATE_EVIDENCE_KEYS[gate.gateId]) ||
    evidence.observedAt !== receipt.completedAtUtc ||
    evidence.projectRefDigest !== sha256(D72_SUPABASE_PROJECT_REF)
  ) {
    fail("RECEIPT_REJECTED");
  }

  if (gate.gateId === "database.expected-migrations-only") {
    if (
      !exactKeys(evidence.dryRunChangeCounts, [
        "migrations",
        "roles",
        "seeds",
        "vault",
      ]) ||
      Object.values(evidence.dryRunChangeCounts).some(
        (count) => !safeReceiptCount(count),
      ) ||
      !safeReceiptCount(evidence.pendingMigrationCount) ||
      evidence.pendingMigrationCount !==
        Object.values(evidence.dryRunChangeCounts).reduce(
          (sum, count) => sum + count,
          0,
        ) ||
      ![
        evidence.draft0059Present,
        evidence.executable0059Present,
        evidence.production0059Present,
        evidence.production0060Present,
      ].every((value) => typeof value === "boolean") ||
      !SHA256_PATTERN.test(evidence.localLedgerDigest ?? "") ||
      !SHA256_PATTERN.test(evidence.remoteLedgerDigest ?? "") ||
      !/^\d{4}$/.test(evidence.localMaximumVersion ?? "") ||
      !/^\d{4}$/.test(evidence.remoteMaximumVersion ?? "")
    ) {
      fail("RECEIPT_REJECTED");
    }
    const expectedLedgerDigest = sha256Canonical(
      D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS,
    );
    return evidence.draft0059Present === true &&
      evidence.executable0059Present === false &&
      evidence.production0059Present === false &&
      evidence.production0060Present === true &&
      evidence.localMaximumVersion ===
        D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.at(-1) &&
      evidence.remoteMaximumVersion ===
        D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.at(-1) &&
      evidence.localLedgerDigest === expectedLedgerDigest &&
      evidence.remoteLedgerDigest === expectedLedgerDigest &&
      evidence.pendingMigrationCount === 0
      ? "PASS"
      : "FAIL";
  }

  const localEvidence = receipt.localEvidence;
  if (localEvidence.status !== "VERIFIED") return "NOT_VERIFIED";
  const aggregateQuery = receipt.queries[0];
  const catalogQuery = receipt.queries[1];
  const domainMatches = (domainId) =>
    localEvidence.catalogDomainDigests[domainId] ===
    catalogQuery.domainDigests[domainId];
  const localContract = localEvidence.gateContracts[gate.gateId];

  if (gate.gateId === "data.integrity-no-corruption") {
    const integrityIds = D72_SUPABASE_AGGREGATE_CHECK_IDS.filter((id) =>
      id.startsWith("integrity."),
    );
    const expectedCounts = Object.fromEntries(
      integrityIds.map((id) => [id, aggregateQuery.invalidRowCounts[id]]),
    );
    const expectedFailures = integrityIds.filter(
      (id) => aggregateQuery.invalidRowCounts[id] !== "0",
    );
    if (
      evidence.checkCount !== integrityIds.length ||
      JSON.stringify(evidence.failedCheckIds) !==
        JSON.stringify(expectedFailures) ||
      !exactKeys(evidence.invalidRowCounts, integrityIds) ||
      JSON.stringify(evidence.invalidRowCounts) !==
        JSON.stringify(expectedCounts) ||
      evidence.integrityPolicyDigest !== D72_SUPABASE_READONLY_POLICY_SHA256 ||
      evidence.localContractPassed !== localContract ||
      typeof evidence.minimumCatalogContractPassed !== "boolean" ||
      evidence.transactionReadOnly !== true
    ) {
      fail("RECEIPT_REJECTED");
    }
    return domainMatches("integrity-structures") &&
      localContract &&
      evidence.minimumCatalogContractPassed &&
      expectedFailures.length === 0
      ? "PASS"
      : "FAIL";
  }

  if (gate.gateId === "security.rls-enforced") {
    if (
      evidence.catalogContractDigest !==
        localEvidence.catalogDomainDigests["app-controlled-rls"] ||
      evidence.forcedRlsTableCount !== catalogQuery.forcedRlsTableCount ||
      evidence.rlsTableCount !== catalogQuery.rlsTableCount ||
      !SHA256_PATTERN.test(evidence.grantInventoryDigest ?? "") ||
      !SHA256_PATTERN.test(evidence.policyInventoryDigest ?? "") ||
      evidence.localContractPassed !== localContract ||
      typeof evidence.minimumCatalogContractPassed !== "boolean"
    ) {
      fail("RECEIPT_REJECTED");
    }
    return domainMatches("app-controlled-rls") &&
      localContract &&
      evidence.minimumCatalogContractPassed
      ? "PASS"
      : "FAIL";
  }

  if (gate.gateId === "authorization.residency-write-boundary") {
    if (
      evidence.boundaryContractDigest !==
        localEvidence.catalogDomainDigests["residency-write-boundary"] ||
      !safeReceiptCount(evidence.guardedFunctionCount) ||
      !safeReceiptCount(evidence.guardedPolicyCount) ||
      evidence.localContractPassed !== localContract ||
      typeof evidence.minimumCatalogContractPassed !== "boolean"
    ) {
      fail("RECEIPT_REJECTED");
    }
    return domainMatches("residency-write-boundary") &&
      localContract &&
      evidence.minimumCatalogContractPassed
      ? "PASS"
      : "FAIL";
  }

  if (gate.gateId === "privacy.no-individual-ballots") {
    const individualCount = [
      "d68.individual-ballot-columns",
      "d68.individual-ballot-relations",
      "d68.reidentifying-functions",
    ].reduce(
      (sum, id) => sum + BigInt(aggregateQuery.invalidRowCounts[id]),
      0n,
    );
    const reidentifiableCount = [
      "d68.poll-tally-transaction-divergence",
      "d68.budget-tally-transaction-divergence",
    ].reduce(
      (sum, id) => sum + BigInt(aggregateQuery.invalidRowCounts[id]),
      0n,
    );
    const d68Failure = D72_SUPABASE_AGGREGATE_CHECK_IDS.filter((id) =>
      id.startsWith("d68."),
    ).some((id) => aggregateQuery.invalidRowCounts[id] !== "0");
    if (
      !SHA256_PATTERN.test(evidence.ballotContractDigest ?? "") ||
      !safeReceiptDecimal(evidence.individualBallotSurfaceCount) ||
      !safeReceiptDecimal(evidence.reidentifiableRowCount) ||
      evidence.individualBallotSurfaceCount !== individualCount.toString() ||
      evidence.reidentifiableRowCount !== reidentifiableCount.toString() ||
      evidence.localD68ContractPassed !== localContract
    ) {
      fail("RECEIPT_REJECTED");
    }
    return localContract && !d68Failure ? "PASS" : "FAIL";
  }

  if (
    evidence.antiAbuseContractDigest !==
      localEvidence.catalogDomainDigests["anti-abuse-limits"] ||
    !safeReceiptCount(evidence.guardedSurfaceCount) ||
    evidence.localContractPassed !== localContract ||
    typeof evidence.minimumCatalogContractPassed !== "boolean" ||
    evidence.unknownBypassCount !== (domainMatches("anti-abuse-limits") ? 0 : 1)
  ) {
    fail("RECEIPT_REJECTED");
  }
  return domainMatches("anti-abuse-limits") &&
    localContract &&
    evidence.minimumCatalogContractPassed
    ? "PASS"
    : "FAIL";
}

export function d72SupabaseReadonlyReceiptContentSha256(receipt) {
  if (!isPlainObject(receipt)) fail("RECEIPT_REJECTED");
  const content = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "contentSha256"),
  );
  return sha256Canonical(content);
}

export function validateD72SupabaseReadonlyReceiptStructure(
  receipt,
  { expectedHead, now } = {},
) {
  const topKeys = [
    "completedAtUtc",
    "contentSha256",
    "databaseWriteExecuted",
    "evidenceFreshUntilUtc",
    "gates",
    "head",
    "linked",
    "localEvidence",
    "localQueryCount",
    "policyHash",
    "projectRefDigest",
    "queries",
    "remoteQueryCount",
    "schemaVersion",
    "sensitiveOutputStored",
    "startedAtUtc",
    "status",
    "supabaseCliVersion",
    "transactionReadOnly",
  ];
  const completedAt = new Date(receipt?.completedAtUtc);
  const startedAt = new Date(receipt?.startedAtUtc);
  const freshUntil = new Date(receipt?.evidenceFreshUntilUtc);
  const timestampsAreCanonical =
    !Number.isNaN(completedAt.valueOf()) &&
    !Number.isNaN(startedAt.valueOf()) &&
    !Number.isNaN(freshUntil.valueOf()) &&
    completedAt.toISOString() === receipt?.completedAtUtc &&
    startedAt.toISOString() === receipt?.startedAtUtc &&
    freshUntil.toISOString() === receipt?.evidenceFreshUntilUtc;
  if (
    !exactKeys(receipt, topKeys) ||
    receipt.schemaVersion !== D72_SUPABASE_READONLY_RUN_SCHEMA_VERSION ||
    receipt.status !== "COMPLETED" ||
    !SHA256_PATTERN.test(receipt.contentSha256 ?? "") ||
    receipt.contentSha256 !==
      d72SupabaseReadonlyReceiptContentSha256(receipt) ||
    !(now instanceof Date) ||
    Number.isNaN(now.valueOf()) ||
    typeof expectedHead !== "string" ||
    !/^[0-9a-f]{40}$/.test(expectedHead) ||
    !timestampsAreCanonical ||
    startedAt.valueOf() > completedAt.valueOf() ||
    completedAt.valueOf() - startedAt.valueOf() >
      D72_SUPABASE_READONLY_FRESHNESS_MS ||
    freshUntil.valueOf() !==
      startedAt.valueOf() + D72_SUPABASE_READONLY_FRESHNESS_MS ||
    now.valueOf() < completedAt.valueOf() ||
    now.valueOf() > freshUntil.valueOf() ||
    receipt.projectRefDigest !== sha256(D72_SUPABASE_PROJECT_REF) ||
    receipt.supabaseCliVersion !== D72_SUPABASE_CLI_VERSION ||
    receipt.policyHash !== D72_SUPABASE_READONLY_POLICY_SHA256 ||
    receipt.head !== expectedHead ||
    receipt.remoteQueryCount !== 2 ||
    ![0, 1].includes(receipt.localQueryCount) ||
    receipt.linked !== false ||
    receipt.transactionReadOnly !== true ||
    receipt.databaseWriteExecuted !== false ||
    receipt.sensitiveOutputStored !== false ||
    !Array.isArray(receipt.queries) ||
    receipt.queries.length !== D72_SUPABASE_READONLY_QUERY_IDS.length ||
    receipt.queries.some(
      (query, index) =>
        !isPlainObject(query) ||
        query.queryId !== D72_SUPABASE_READONLY_QUERY_IDS[index] ||
        !SAFE_QUERY_ID_PATTERN.test(query.queryId) ||
        query.querySha256 !==
          D72_SUPABASE_READONLY_QUERY_SHA256[query.queryId] ||
        !SHA256_PATTERN.test(query.resultDigest),
    )
  ) {
    fail("RECEIPT_REJECTED");
  }
  for (const query of receipt.queries) {
    if (query.queryId === "aggregate-checks") {
      const expectedFailedCheckIds = D72_SUPABASE_AGGREGATE_CHECK_IDS.filter(
        (checkId) => query.invalidRowCounts?.[checkId] !== "0",
      );
      if (
        !exactKeys(query, [
          "checkCount",
          "failedCheckIds",
          "invalidRowCounts",
          "queryId",
          "querySha256",
          "resultDigest",
        ]) ||
        query.checkCount !== D72_SUPABASE_AGGREGATE_CHECK_IDS.length ||
        !Array.isArray(query.failedCheckIds) ||
        JSON.stringify(query.failedCheckIds) !==
          JSON.stringify(expectedFailedCheckIds) ||
        !exactKeys(query.invalidRowCounts, D72_SUPABASE_AGGREGATE_CHECK_IDS) ||
        Object.values(query.invalidRowCounts).some(
          (count) =>
            typeof count !== "string" || !/^(?:0|[1-9]\d{0,29})$/.test(count),
        )
      ) {
        fail("RECEIPT_REJECTED");
      }
    } else if (
      !exactKeys(query, [
        "domainDigests",
        "forcedRlsTableCount",
        "functionCount",
        "grantCount",
        "policyCount",
        "queryId",
        "querySha256",
        "resultDigest",
        "rlsTableCount",
        "sectionCounts",
        "triggerCount",
      ]) ||
      !validCatalogDomainDigests(query.domainDigests) ||
      !exactKeys(query.sectionCounts, D72_SUPABASE_CATALOG_SECTIONS) ||
      [
        query.forcedRlsTableCount,
        query.functionCount,
        query.grantCount,
        query.policyCount,
        query.rlsTableCount,
        query.triggerCount,
        ...Object.values(query.sectionCounts),
      ].some((count) => !Number.isSafeInteger(count) || count < 0)
    ) {
      fail("RECEIPT_REJECTED");
    }
  }
  if (
    !exactKeys(receipt.localEvidence, [
      "catalogDigest",
      "catalogDomainDigests",
      "catalogQueryExecuted",
      "executedTestCount",
      "failedTestCount",
      "gateContracts",
      "harnessExitCode",
      "harnessOutputDigest",
      "harnessSourceDigest",
      "status",
    ]) ||
    !["NOT_VERIFIED", "VERIFIED"].includes(receipt.localEvidence.status) ||
    !exactKeys(
      receipt.localEvidence.gateContracts,
      D72_SUPABASE_GATE_IDS.slice(1),
    ) ||
    Object.values(receipt.localEvidence.gateContracts).some(
      (value) => value !== null && typeof value !== "boolean",
    ) ||
    typeof receipt.localEvidence.catalogQueryExecuted !== "boolean" ||
    !Number.isSafeInteger(receipt.localEvidence.executedTestCount) ||
    receipt.localEvidence.executedTestCount < 0 ||
    receipt.localEvidence.executedTestCount >
      Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256).length ||
    !(
      receipt.localEvidence.failedTestCount === null ||
      (Number.isSafeInteger(receipt.localEvidence.failedTestCount) &&
        receipt.localEvidence.failedTestCount >= 0 &&
        receipt.localEvidence.failedTestCount <=
          receipt.localEvidence.executedTestCount)
    ) ||
    !(
      receipt.localEvidence.catalogDigest === null ||
      SHA256_PATTERN.test(receipt.localEvidence.catalogDigest)
    ) ||
    !validCatalogDomainDigests(receipt.localEvidence.catalogDomainDigests, {
      nullable: true,
    }) ||
    !(
      receipt.localEvidence.harnessOutputDigest === null ||
      SHA256_PATTERN.test(receipt.localEvidence.harnessOutputDigest)
    ) ||
    !(
      receipt.localEvidence.harnessSourceDigest === null ||
      SHA256_PATTERN.test(receipt.localEvidence.harnessSourceDigest)
    ) ||
    !(
      receipt.localEvidence.harnessExitCode === null ||
      (Number.isInteger(receipt.localEvidence.harnessExitCode) &&
        receipt.localEvidence.harnessExitCode >= 0 &&
        receipt.localEvidence.harnessExitCode <= 255)
    ) ||
    receipt.localQueryCount !==
      (receipt.localEvidence.catalogQueryExecuted ? 1 : 0) ||
    (receipt.localEvidence.status === "VERIFIED" &&
      (receipt.localEvidence.catalogQueryExecuted !== true ||
        Object.values(receipt.localEvidence.gateContracts).some(
          (value) => typeof value !== "boolean",
        ) ||
        receipt.localEvidence.executedTestCount !==
          Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256).length ||
        receipt.localEvidence.failedTestCount === null ||
        receipt.localEvidence.harnessExitCode !==
          (receipt.localEvidence.failedTestCount === 0 ? 0 : 1) ||
        !SHA256_PATTERN.test(receipt.localEvidence.catalogDigest ?? "") ||
        !validCatalogDomainDigests(
          receipt.localEvidence.catalogDomainDigests,
        ) ||
        !SHA256_PATTERN.test(receipt.localEvidence.harnessOutputDigest ?? "") ||
        receipt.localEvidence.harnessSourceDigest !==
          expectedLocalHarnessSourceDigest())) ||
    (receipt.localEvidence.status === "NOT_VERIFIED" &&
      Object.values(receipt.localEvidence.gateContracts).some(
        (value) => value !== null,
      ))
  ) {
    fail("RECEIPT_REJECTED");
  }
  const expectedGateIds = D72_SUPABASE_GATE_IDS;
  if (
    !Array.isArray(receipt.gates) ||
    receipt.gates.length !== expectedGateIds.length ||
    receipt.gates.some(
      (gate, index) =>
        !exactKeys(gate, ["evidence", "gateId", "status"]) ||
        gate.gateId !== expectedGateIds[index] ||
        !["FAIL", "NOT_VERIFIED", "PASS"].includes(gate.status),
    )
  ) {
    fail("RECEIPT_REJECTED");
  }
  for (const gate of receipt.gates) {
    if (gate.status !== expectedGateStatusFromReceipt(gate, receipt)) {
      fail("RECEIPT_REJECTED");
    }
  }

  const visitGateEvidence = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visitGateEvidence);
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_GATE_EVIDENCE_KEY_PATTERN.test(key)) {
          fail("RECEIPT_REJECTED");
        }
        visitGateEvidence(child);
      }
      return;
    }
    if (
      typeof value === "string" &&
      (value.includes(D72_SUPABASE_PROJECT_REF) ||
        /\b(?:select|insert|update|delete|create|alter|drop)\b/i.test(value))
    ) {
      fail("RECEIPT_REJECTED");
    }
  };
  receipt.gates.forEach(({ evidence }) => visitGateEvidence(evidence));
  const serialized = JSON.stringify(receipt);
  if (
    serialized.includes(D72_SUPABASE_PROJECT_REF) ||
    serialized.includes("begin transaction") ||
    serialized.includes("PGPASSWORD") ||
    serialized.includes("SUPABASE_DB_PASSWORD") ||
    serialized.includes("postgres.") ||
    serialized.includes("supabase.com")
  ) {
    fail("RECEIPT_REJECTED");
  }
  return true;
}

export function assertD72SupabaseReadonlyReceipt(
  receipt,
  { allowTestReceipt = false, expectedHead, now } = {},
) {
  if (typeof allowTestReceipt !== "boolean") fail("RECEIPT_REJECTED");
  validateD72SupabaseReadonlyReceiptStructure(receipt, { expectedHead, now });
  const issuance = ISSUED_D72_SUPABASE_READONLY_RECEIPTS.get(receipt);
  if (!issuance || (issuance.testOnly && !allowTestReceipt)) {
    fail("RECEIPT_REJECTED");
  }
  return true;
}

const DEFAULT_REMOTE_CHILD_DEPENDENCIES = Object.freeze({
  buildEnvironment: buildD72ProductionReadonlyEnvironment,
  buildInvocation: buildD72ProductionReadonlyInvocation,
  loadAssets: loadProductionBackupAssets,
  parseConnection: parseProductionDumpDryRun,
  parseQueryOutput: parseD72ProductionQueryOutput,
  runCommand: spawnSync,
});

function assertRemoteChildDependencies(dependencies) {
  const expected = Object.keys(DEFAULT_REMOTE_CHILD_DEPENDENCIES).sort();
  if (
    !exactKeys(dependencies, expected) ||
    expected.some((name) => typeof dependencies[name] !== "function")
  ) {
    fail("UNEXPECTED_FAILURE");
  }
}

export function runD72SupabaseReadonlyRemoteChild({
  capability,
  context,
  dependencies = DEFAULT_REMOTE_CHILD_DEPENDENCIES,
  environment = process.env,
  nodeVersion = process.versions.node,
  passwordBuffer,
  repositoryRoot = REPOSITORY_ROOT,
  supabaseCliPath = SUPABASE_CLI_PATH,
  testOnly = false,
} = {}) {
  // This boundary deliberately precedes every password check/copy/conversion.
  // Production callers may reach this code only through the fixed, short-lived
  // helper entrypoint. Same-process execution exists solely as a test seam.
  assertRemoteChildExecutionBoundary({ capability, testOnly });
  assertRemoteChildContext(context);
  assertRemoteChildDependencies(dependencies);
  if (
    typeof testOnly !== "boolean" ||
    nodeVersion !== D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION ||
    !isEnvironmentObject(environment) ||
    Object.hasOwn(environment, "SUPABASE_DB_PASSWORD") ||
    typeof repositoryRoot !== "string" ||
    repositoryRoot !== REPOSITORY_ROOT ||
    supabaseCliPath !== SUPABASE_CLI_PATH ||
    (!testOnly &&
      (dependencies !== DEFAULT_REMOTE_CHILD_DEPENDENCIES ||
        environment !== process.env ||
        nodeVersion !== process.versions.node)) ||
    !validPasswordBuffer(passwordBuffer)
  ) {
    fail("UNEXPECTED_FAILURE");
  }
  if (!testOnly) assertPinnedSupabaseCliBinary();

  const workingPasswordBuffer = Buffer.from(passwordBuffer);
  const baseEnvironment = copyApprovedEnvironment(environment);
  let password = "";
  let discoveryEnvironment = null;
  let discoveryOutput = "";
  let discoveryStderr = "";
  let connection = null;
  let assets = null;
  let aggregateChecks = null;
  let productionCatalog = null;
  const queryReceipts = [];
  try {
    // Esta es la única conversión bytes -> string. Vive exclusivamente en el
    // proceso hijo dedicado, cuyo resultado no contiene la credencial ni la
    // URI descubierta. JavaScript no permite demostrar el wipe de este string;
    // por eso el proceso termina inmediatamente después de emitir agregados.
    password = workingPasswordBuffer.toString("utf8");
    discoveryEnvironment = buildD72SupabaseReadonlyRemoteChildEnvironment(
      environment,
      password,
    );
    const dumpArgs = productionDumpDryRunArgs(D72_SUPABASE_PROJECT_REF);
    assertNoLinked(dumpArgs, "CONNECTION_DISCOVERY_FAILED");
    ({ stdout: discoveryOutput, stderr: discoveryStderr } = runCaptured(
      dependencies.runCommand,
      supabaseCliPath,
      dumpArgs,
      {
        cwd: repositoryRoot,
        env: discoveryEnvironment,
        maxBuffer: MAX_DUMP_OUTPUT_BYTES,
        timeout: SUPABASE_CHILD_TIMEOUT_MS,
      },
      "CONNECTION_DISCOVERY_FAILED",
      {
        maxStderrBytes: MAX_VERSION_OUTPUT_BYTES,
        maxStdoutBytes: MAX_DUMP_OUTPUT_BYTES,
      },
    ));
    if (
      removeKnownSupabaseUpdateNotice(discoveryStderr) !==
      EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR
    ) {
      fail("CONNECTION_DISCOVERY_FAILED");
    }
    connection = fixedFailure("CONNECTION_DISCOVERY_FAILED", () =>
      dependencies.parseConnection(discoveryOutput, {
        expectedPassword: password,
        projectRef: D72_SUPABASE_PROJECT_REF,
      }),
    );
    discoveryOutput = "";
    discoveryStderr = "";
    clearSecretEnvironment(discoveryEnvironment, "SUPABASE_DB_PASSWORD");

    assets = fixedFailure("ASSET_VALIDATION_FAILED", () =>
      dependencies.loadAssets(repositoryRoot),
    );
    for (const queryId of D72_SUPABASE_READONLY_QUERY_IDS) {
      let queryEnvironment = null;
      let queryPasswordInput = null;
      let queryOutput = "";
      let queryStderr = "";
      try {
        const invocation = fixedFailure("QUERY_INVOCATION_REJECTED", () =>
          dependencies.buildInvocation({
            assets,
            connection,
            imageId: PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
            queryId,
          }),
        );
        assertD72SupabaseReadonlyInvocation(queryId, invocation, assets);
        queryEnvironment = fixedFailure("QUERY_INVOCATION_REJECTED", () =>
          dependencies.buildEnvironment({
            assets,
            baseEnvironment,
            connection,
            password,
          }),
        );
        assertD72QueryEnvironment(queryEnvironment, connection, assets);
        queryPasswordInput = passwordLineBuffer(password);
        ({ stdout: queryOutput, stderr: queryStderr } = runCaptured(
          dependencies.runCommand,
          DOCKER_COMMAND,
          invocation.args,
          {
            cwd: repositoryRoot,
            env: queryEnvironment,
            input: queryPasswordInput,
            maxBuffer: MAX_QUERY_OUTPUT_BYTES,
            timeout: QUERY_CHILD_TIMEOUT_MS,
          },
          "QUERY_EXECUTION_FAILED",
          {
            maxStderrBytes: MAX_VERSION_OUTPUT_BYTES,
            maxStdoutBytes: MAX_QUERY_OUTPUT_BYTES,
          },
        ));
        if (queryStderr !== "") fail("QUERY_EXECUTION_FAILED");
        const parsed = fixedFailure("QUERY_OUTPUT_REJECTED", () =>
          dependencies.parseQueryOutput(queryId, queryOutput),
        );
        if (queryId === "aggregate-checks") aggregateChecks = parsed;
        if (queryId === "catalog") productionCatalog = parsed;
        queryReceipts.push(summarizeQueryResult(queryId, parsed));
      } finally {
        queryOutput = "";
        queryStderr = "";
        if (Buffer.isBuffer(queryPasswordInput)) queryPasswordInput.fill(0);
        queryPasswordInput = null;
        clearSecretEnvironment(queryEnvironment, "PGPASSWORD");
        queryEnvironment = null;
      }
    }

    const allGateResults = fixedFailure("QUERY_OUTPUT_REJECTED", () =>
      evaluateD72SupabaseReadonlyGates({
        aggregateChecks,
        head: context.head,
        localCatalog: context.localCatalog,
        localContracts: context.localContracts,
        observedAt: context.observedAtUtc,
        productionCatalog,
      }),
    );
    const payload = {
      contextSha256: remoteChildContextSha256(context),
      databaseWriteExecuted: false,
      gates: allGateResults.slice(1),
      head: context.head,
      observedAtUtc: context.observedAtUtc,
      queries: queryReceipts,
      schemaVersion: D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
      sensitiveOutputStored: false,
      transactionReadOnly: true,
    };
    const result = deepFreeze({
      ...payload,
      contentSha256: sha256Canonical(payload),
    });
    assertD72SupabaseReadonlyRemoteChildResult(result, context);
    if (!testOnly) assertPinnedSupabaseCliBinary();
    if (JSON.stringify(result).includes(password)) {
      fail("QUERY_OUTPUT_REJECTED");
    }
    return result;
  } finally {
    discoveryOutput = "";
    discoveryStderr = "";
    clearSecretEnvironment(discoveryEnvironment, "SUPABASE_DB_PASSWORD");
    discoveryEnvironment = null;
    connection = null;
    assets = null;
    aggregateChecks = null;
    productionCatalog = null;
    password = "";
    workingPasswordBuffer.fill(0);
  }
}

function encodeRemoteChildInput(passwordBuffer, context) {
  if (!validPasswordBuffer(passwordBuffer)) fail("TTY_INPUT_FAILED");
  assertRemoteChildContext(context);
  const contextBuffer = Buffer.from(
    JSON.stringify(canonicalize(context)),
    "utf8",
  );
  const input = Buffer.alloc(passwordBuffer.length + 1 + contextBuffer.length);
  passwordBuffer.copy(input, 0);
  input[passwordBuffer.length] = 10;
  contextBuffer.copy(input, passwordBuffer.length + 1);
  contextBuffer.fill(0);
  if (input.length > MAX_REMOTE_CHILD_INPUT_BYTES) {
    input.fill(0);
    fail("QUERY_INVOCATION_REJECTED");
  }
  return input;
}

export function readD72SupabaseReadonlyRemoteChildInput({
  descriptor = 0,
  maxBytes = MAX_REMOTE_CHILD_INPUT_BYTES,
  read = readSync,
} = {}) {
  if (
    !Number.isInteger(descriptor) ||
    descriptor < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_REMOTE_CHILD_INPUT_BYTES ||
    typeof read !== "function"
  ) {
    fail("QUERY_INVOCATION_REJECTED");
  }
  const chunks = [];
  let scratch = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
  let scratchBytes = 0;
  let totalBytes = 0;
  try {
    while (true) {
      const remainingProbeBytes = maxBytes + 1 - totalBytes;
      const requestedBytes = Math.min(
        scratch.length - scratchBytes,
        remainingProbeBytes,
      );
      let bytesRead;
      try {
        bytesRead = read(
          descriptor,
          scratch,
          scratchBytes,
          requestedBytes,
          null,
        );
      } catch {
        fail("QUERY_INVOCATION_REJECTED");
      }
      if (
        !Number.isInteger(bytesRead) ||
        bytesRead < 0 ||
        bytesRead > requestedBytes
      ) {
        fail("QUERY_INVOCATION_REJECTED");
      }
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      scratchBytes += bytesRead;
      if (totalBytes > maxBytes) fail("QUERY_INVOCATION_REJECTED");
      if (scratchBytes === scratch.length) {
        chunks.push(scratch);
        scratch = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - totalBytes));
        scratchBytes = 0;
      }
    }
    if (scratchBytes > 0) chunks.push(scratch);
    return Buffer.concat(chunks, totalBytes);
  } finally {
    if (Buffer.isBuffer(scratch)) scratch.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function decodeRemoteChildInput(input) {
  if (!Buffer.isBuffer(input) || input.length > MAX_REMOTE_CHILD_INPUT_BYTES) {
    fail("QUERY_INVOCATION_REJECTED");
  }
  const separator = input.indexOf(10);
  if (separator < MIN_PASSWORD_BYTES || separator > MAX_PASSWORD_BYTES) {
    fail("QUERY_INVOCATION_REJECTED");
  }
  const passwordBuffer = Buffer.from(input.subarray(0, separator));
  const contextBuffer = Buffer.from(input.subarray(separator + 1));
  if (!validPasswordBuffer(passwordBuffer) || !isUtf8(contextBuffer)) {
    passwordBuffer.fill(0);
    contextBuffer.fill(0);
    fail("QUERY_INVOCATION_REJECTED");
  }
  let contextSource = "";
  try {
    contextSource = contextBuffer.toString("utf8");
    const context = JSON.parse(contextSource);
    if (contextSource !== JSON.stringify(canonicalize(context))) {
      fail("QUERY_INVOCATION_REJECTED");
    }
    assertRemoteChildContext(context);
    return { context, passwordBuffer };
  } catch (error) {
    passwordBuffer.fill(0);
    if (error instanceof D72SupabaseReadonlyRunnerError) throw error;
    fail("QUERY_INVOCATION_REJECTED");
  } finally {
    contextSource = "";
    contextBuffer.fill(0);
  }
}

export function spawnD72SupabaseReadonlyRemoteChild({
  context,
  environment,
  passwordBuffer,
  repositoryRoot,
  runCommand = spawnSync,
  supabaseCliPath,
} = {}) {
  if (
    environment !== process.env ||
    repositoryRoot !== REPOSITORY_ROOT ||
    supabaseCliPath !== SUPABASE_CLI_PATH ||
    typeof runCommand !== "function"
  ) {
    fail("UNEXPECTED_FAILURE");
  }
  const childInput = encodeRemoteChildInput(passwordBuffer, context);
  let result;
  try {
    result = runCommand(process.execPath, [REMOTE_CHILD_PATH], {
      cwd: repositoryRoot,
      encoding: "buffer",
      env: copyApprovedEnvironment(environment),
      input: childInput,
      maxBuffer: MAX_REMOTE_CHILD_OUTPUT_BYTES,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      timeout:
        SUPABASE_CHILD_TIMEOUT_MS +
        D72_SUPABASE_READONLY_QUERY_IDS.length * QUERY_CHILD_TIMEOUT_MS,
      windowsHide: true,
    });
    if (
      !result ||
      result.error ||
      result.signal !== null ||
      result.status !== 0 ||
      !Buffer.isBuffer(result.stdout) ||
      !Buffer.isBuffer(result.stderr) ||
      result.stderr.length !== 0 ||
      result.stdout.length === 0 ||
      result.stdout.length > MAX_REMOTE_CHILD_OUTPUT_BYTES ||
      result.stdout.includes(passwordBuffer) ||
      result.stdout.includes(0) ||
      !isUtf8(result.stdout)
    ) {
      // Mismo bloqueo de siempre; si el hijo declaró su etapa con el formato
      // exacto, el error la lleva para que el padre pueda nombrarla.
      const remoteStage = remoteChildFailureStage(result, passwordBuffer);
      if (remoteStage !== null) failRemoteStage(remoteStage);
      fail("QUERY_EXECUTION_FAILED");
    }
    const source = result.stdout.toString("utf8");
    const parsed = JSON.parse(source);
    if (`${JSON.stringify(canonicalize(parsed))}\n` !== source) {
      fail("QUERY_OUTPUT_REJECTED");
    }
    return assertD72SupabaseReadonlyRemoteChildResult(parsed, context);
  } catch (error) {
    if (error instanceof D72SupabaseReadonlyRunnerError) throw error;
    fail("QUERY_EXECUTION_FAILED");
  } finally {
    childInput.fill(0);
    wipeResultBuffers(result);
  }
}

export function runD72SupabaseReadonlyRemoteChildMain({
  argv = process.argv.slice(2),
  input,
  stderr = (value) => process.stderr.write(value),
  stdout = (value) => process.stdout.write(value),
} = {}) {
  let ownedInput = null;
  let decoded = null;
  try {
    // Check the real process entrypoint before reading stdin. In particular, an
    // imported invocation cannot even cause the credential payload to be read.
    if (!isExactRemoteChildEntrypoint()) fail("UNEXPECTED_FAILURE");
    ownedInput =
      input === undefined ? readD72SupabaseReadonlyRemoteChildInput() : input;
    if (
      !Array.isArray(argv) ||
      argv.length !== 0 ||
      !Buffer.isBuffer(ownedInput)
    ) {
      fail("INVALID_ARGUMENTS");
    }
    decoded = decodeRemoteChildInput(ownedInput);
    const result = runD72SupabaseReadonlyRemoteChild({
      capability: REMOTE_CHILD_MAIN_CAPABILITY,
      context: decoded.context,
      passwordBuffer: decoded.passwordBuffer,
    });
    stdout(`${JSON.stringify(canonicalize(result))}\n`);
    return 0;
  } catch (error) {
    // Al padre le llega sólo el nombre de la etapa, del enum cerrado: ningún
    // mensaje, payload ni rastro de la credencial. Las claves van en orden
    // canónico para que el padre pueda exigir la línea exacta.
    const stage =
      error instanceof D72SupabaseReadonlyRunnerError
        ? error.code
        : "UNEXPECTED_FAILURE";
    stderr(
      `${JSON.stringify({
        code: "REMOTE_CHILD_FAILED",
        schemaVersion: D72_SUPABASE_READONLY_REMOTE_CHILD_SCHEMA_VERSION,
        stage,
        status: "BLOCKED",
      })}\n`,
    );
    return 1;
  } finally {
    if (Buffer.isBuffer(decoded?.passwordBuffer)) {
      decoded.passwordBuffer.fill(0);
    }
    decoded = null;
    if (Buffer.isBuffer(ownedInput)) ownedInput.fill(0);
    ownedInput = null;
  }
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  buildEnvironment: buildD72ProductionReadonlyEnvironment,
  buildInvocation: buildD72ProductionReadonlyInvocation,
  loadAssets: loadProductionBackupAssets,
  now: () => new Date(),
  parseConnection: parseProductionDumpDryRun,
  parseQueryOutput: parseD72ProductionQueryOutput,
  readPassword: readD72SupabaseDatabasePasswordFromTty,
  runCommand: spawnSync,
  runRemoteChild: spawnD72SupabaseReadonlyRemoteChild,
});

function assertDependencies(dependencies) {
  const expected = Object.keys(DEFAULT_DEPENDENCIES).sort();
  if (
    !exactKeys(dependencies, expected) ||
    expected.some((name) => typeof dependencies[name] !== "function")
  ) {
    fail("UNEXPECTED_FAILURE");
  }
}

export function runD72SupabaseReadonly({
  argv = [],
  dependencies = DEFAULT_DEPENDENCIES,
  environment = process.env,
  nodeVersion = process.versions.node,
  repositoryRoot = REPOSITORY_ROOT,
  supabaseCliPath = SUPABASE_CLI_PATH,
  testOnly = false,
} = {}) {
  if (!Array.isArray(argv) || argv.length !== 0) fail("INVALID_ARGUMENTS");
  if (typeof testOnly !== "boolean") fail("UNEXPECTED_FAILURE");
  if (
    nodeVersion !== D72_SUPABASE_READONLY_REQUIRED_NODE_VERSION ||
    (!testOnly && nodeVersion !== process.versions.node)
  ) {
    fail("NODE_VERSION_MISMATCH");
  }
  if (
    !isEnvironmentObject(environment) ||
    Object.hasOwn(environment, "SUPABASE_DB_PASSWORD")
  ) {
    fail("ENV_PASSWORD_FORBIDDEN");
  }
  assertDependencies(dependencies);
  if (!testOnly && dependencies !== DEFAULT_DEPENDENCIES) {
    fail("UNEXPECTED_FAILURE");
  }
  if (
    !testOnly &&
    (environment !== process.env ||
      repositoryRoot !== REPOSITORY_ROOT ||
      supabaseCliPath !== SUPABASE_CLI_PATH)
  ) {
    fail("UNEXPECTED_FAILURE");
  }
  if (
    typeof repositoryRoot !== "string" ||
    !path.isAbsolute(repositoryRoot) ||
    path.resolve(repositoryRoot) !== repositoryRoot ||
    typeof supabaseCliPath !== "string" ||
    supabaseCliPath !==
      path.join(
        repositoryRoot,
        "node_modules",
        ".pnpm",
        "@supabase+cli-linux-x64@2.115.0",
        "node_modules",
        "@supabase",
        "cli-linux-x64",
        "bin",
        "supabase",
      )
  ) {
    fail("UNEXPECTED_FAILURE");
  }
  if (!testOnly) assertPinnedSupabaseCliBinary();

  const startedAt = fixedFailure("RECEIPT_REJECTED", () => dependencies.now());
  if (!(startedAt instanceof Date) || Number.isNaN(startedAt.valueOf())) {
    fail("RECEIPT_REJECTED");
  }
  const startedAtUtc = startedAt.toISOString();
  fixedFailure("ASSET_VALIDATION_FAILED", () =>
    assertPinnedLocalDockerBoundary(repositoryRoot),
  );

  const baseEnvironment = copyApprovedEnvironment(environment);
  let versionOutput = "";
  let versionStderr = "";
  ({ stdout: versionOutput, stderr: versionStderr } = runCaptured(
    dependencies.runCommand,
    supabaseCliPath,
    ["--version"],
    {
      cwd: repositoryRoot,
      env: baseEnvironment,
      maxBuffer: MAX_VERSION_OUTPUT_BYTES,
      timeout: 10_000,
    },
    "CLI_VERSION_FAILED",
    {
      maxStderrBytes: MAX_VERSION_OUTPUT_BYTES,
      maxStdoutBytes: MAX_VERSION_OUTPUT_BYTES,
    },
  ));
  const checkedVersionStderr = removeKnownSupabaseUpdateNotice(versionStderr);
  if (
    ![
      D72_SUPABASE_CLI_VERSION,
      `${D72_SUPABASE_CLI_VERSION}\n`,
      `${D72_SUPABASE_CLI_VERSION}\r\n`,
    ].includes(versionOutput) ||
    checkedVersionStderr !== ""
  ) {
    versionOutput = "";
    versionStderr = "";
    fail("CLI_VERSION_FAILED");
  }
  versionOutput = "";
  versionStderr = "";

  const gitIdentity = collectGitIdentity({
    environment: buildLocalChildEnvironment(environment),
    repositoryRoot,
    runCommand: dependencies.runCommand,
  });
  if (!gitIdentity.clean) fail("GIT_IDENTITY_FAILED");
  const repositoryMigrations =
    collectRepositoryMigrationInventory(repositoryRoot);
  const { dbPushDryRun, migrationList } = runSupabaseMigrationEvidence({
    baseEnvironment,
    repositoryRoot,
    runCommand: dependencies.runCommand,
    supabaseCliPath,
  });
  let localEvidence = collectLocalEvidence({
    environment,
    gitIdentity,
    parseQueryOutput: dependencies.parseQueryOutput,
    repositoryRoot,
    runCommand: dependencies.runCommand,
  });

  let passwordBuffer = null;
  let remoteResult = null;
  try {
    passwordBuffer = fixedFailure("TTY_INPUT_FAILED", () =>
      dependencies.readPassword(),
    );
    if (!validPasswordBuffer(passwordBuffer)) fail("TTY_INPUT_FAILED");
    const remoteContext = {
      head: gitIdentity.head,
      localCatalog: localEvidence.catalog,
      localContracts: localEvidence.contracts,
      observedAtUtc: startedAtUtc,
      schemaVersion: D72_SUPABASE_READONLY_REMOTE_INPUT_SCHEMA_VERSION,
    };
    remoteResult = fixedFailure("QUERY_EXECUTION_FAILED", () =>
      dependencies.runRemoteChild({
        context: remoteContext,
        environment,
        passwordBuffer,
        repositoryRoot,
        supabaseCliPath,
      }),
    );
    assertD72SupabaseReadonlyRemoteChildResult(remoteResult, remoteContext);

    const completedAt = fixedFailure("RECEIPT_REJECTED", () =>
      dependencies.now(),
    );
    if (!(completedAt instanceof Date) || Number.isNaN(completedAt.valueOf())) {
      fail("RECEIPT_REJECTED");
    }
    const completedAtUtc = completedAt.toISOString();
    const finalGitIdentity = collectGitIdentity({
      environment: buildLocalChildEnvironment(environment),
      repositoryRoot,
      runCommand: dependencies.runCommand,
    });
    if (
      !finalGitIdentity.clean ||
      !gitIdentity.clean ||
      finalGitIdentity.head !== gitIdentity.head
    ) {
      fail("GIT_IDENTITY_FAILED");
    }
    const databaseGate = fixedFailure(
      "RECEIPT_REJECTED",
      () =>
        evaluateD72SupabaseReadonlyGates({
          dbPushDryRun,
          head: gitIdentity.head,
          migrationList,
          observedAt: completedAtUtc,
          repositoryMigrations,
        })[0],
    );
    const gates = [
      databaseGate,
      ...remoteResult.gates.map((gate) => ({
        ...gate,
        evidence: { ...gate.evidence, observedAt: completedAtUtc },
      })),
    ];
    assertD72SupabaseSanitizedGateResults(gates);
    const evidenceFreshUntilUtc = new Date(
      startedAt.valueOf() + D72_SUPABASE_READONLY_FRESHNESS_MS,
    ).toISOString();
    const receiptContent = {
      completedAtUtc,
      databaseWriteExecuted: false,
      evidenceFreshUntilUtc,
      gates,
      head: gitIdentity.head,
      linked: false,
      localEvidence: localEvidence.receipt,
      localQueryCount: localEvidence.receipt.catalogQueryExecuted ? 1 : 0,
      policyHash: D72_SUPABASE_READONLY_POLICY_SHA256,
      projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
      queries: remoteResult.queries,
      remoteQueryCount: remoteResult.queries.length,
      schemaVersion: D72_SUPABASE_READONLY_RUN_SCHEMA_VERSION,
      sensitiveOutputStored: false,
      startedAtUtc,
      status: "COMPLETED",
      supabaseCliVersion: D72_SUPABASE_CLI_VERSION,
      transactionReadOnly: true,
    };
    const receipt = {
      ...receiptContent,
      contentSha256: sha256Canonical(receiptContent),
    };
    if (!testOnly) assertPinnedSupabaseCliBinary();
    validateD72SupabaseReadonlyReceiptStructure(receipt, {
      expectedHead: gitIdentity.head,
      now: completedAt,
    });
    ISSUED_D72_SUPABASE_READONLY_RECEIPTS.set(receipt, { testOnly });
    assertD72SupabaseReadonlyReceipt(receipt, {
      allowTestReceipt: testOnly,
      expectedHead: gitIdentity.head,
      now: completedAt,
    });
    const receiptBytes = Buffer.from(JSON.stringify(receipt), "utf8");
    try {
      if (receiptBytes.includes(passwordBuffer)) fail("RECEIPT_REJECTED");
    } finally {
      receiptBytes.fill(0);
    }
    return deepFreeze(receipt);
  } finally {
    remoteResult = null;
    localEvidence = null;
    if (Buffer.isBuffer(passwordBuffer)) passwordBuffer.fill(0);
    passwordBuffer = null;
  }
}

export function runD72SupabaseReadonlyMain({
  argv = process.argv.slice(2),
  dependencies = DEFAULT_DEPENDENCIES,
  environment = process.env,
  nodeVersion = process.versions.node,
  repositoryRoot = REPOSITORY_ROOT,
  stderr = (value) => process.stderr.write(value),
  stdout = (value) => process.stdout.write(value),
  supabaseCliPath = SUPABASE_CLI_PATH,
  testOnly = false,
} = {}) {
  try {
    const receipt = runD72SupabaseReadonly({
      argv,
      dependencies,
      environment,
      nodeVersion,
      repositoryRoot,
      supabaseCliPath,
      testOnly,
    });
    stdout(`${JSON.stringify(receipt)}\n`);
    return 0;
  } catch (error) {
    const code =
      error instanceof D72SupabaseReadonlyRunnerError
        ? error.code
        : "UNEXPECTED_FAILURE";
    // `remoteStage` existe sólo cuando el hijo remoto declaró su etapa con el
    // formato exacto; sin ella la salida es byte a byte la de siempre.
    const remoteStage =
      error instanceof D72SupabaseReadonlyRunnerError &&
      code === "QUERY_EXECUTION_FAILED" &&
      typeof error.remoteStage === "string" &&
      ERROR_CODE_SET.has(error.remoteStage)
        ? error.remoteStage
        : undefined;
    stderr(
      `${JSON.stringify({
        code,
        ...(remoteStage === undefined ? {} : { remoteStage }),
        schemaVersion: D72_SUPABASE_READONLY_RUN_SCHEMA_VERSION,
        status: "BLOCKED",
      })}\n`,
    );
    return 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.umask(0o077);
  process.exitCode = runD72SupabaseReadonlyMain();
}
