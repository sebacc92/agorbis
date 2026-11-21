#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  canonicalJson,
  deriveExceptionalReleaseActPaths,
  exceptionalReleaseActContentHash,
  exceptionalReleaseRequestHash,
  readExceptionalReleaseActFile,
  readExceptionalReleaseRequestFile,
} from "./exceptional-release-act.mjs";
import {
  deriveExceptionalReleaseArtifactPaths,
  readExceptionalReleaseArtifactManifest,
} from "./exceptional-release-artifact.mjs";
import { readExceptionalActIssuance } from "./exceptional-act-issuance.mjs";
import {
  createExceptionalClosedRecoveryCapsule,
  readExceptionalClosedRecoveryCapsule,
} from "./exceptional-closed-recovery-capsule.mjs";
import {
  rebindExceptionalOpenRecoveryCapsuleForFinalRelease,
  assertExceptionalOpenRecoveryCapsule,
  assertExceptionalOpenRecoveryFiles,
  assertExceptionalOpenRecoveredState,
} from "./exceptional-open-recovery-capsule.mjs";
import { assertOpenUpdateCertifiedSourceSnapshot } from "./open-update-source-policy.mjs";
import { readOpenUpdateEvidenceFile } from "./open-update-evidence-file.mjs";
import { assertD72OpenRecoveryVersionGet } from "./d72-canary-policy.mjs";
import { readD72BoundedCloudflareJsonResponse } from "./run-d72-canary.mjs";
import {
  EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
  EXCEPTIONAL_CUTOVER_NODE_VERSION,
  EXCEPTIONAL_CUTOVER_WORKER_NAME,
  EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
  assertExceptionalCutoverBundle,
  createExceptionalCutoverPlan,
  createExceptionalClosedRecoveryPlan,
  createExceptionalOpenRecoveryPlan,
  createExceptionalPromotionStep,
  exceptionalCutoverConfirmationPhrase,
  parseExceptionalCutoverArguments,
  validateExceptionalCutoverStep,
} from "./exceptional-release-cutover-policy.mjs";
import {
  loadWranglerOAuthToken,
  collectCloudflareState,
  validateCloudflareOpenState,
  validateCloudflareOpenSourceState,
  runCloudflareClosedStateCheck,
  runCloudflareClosedWithOpenCronsStateCheck,
  runCloudflareOpenStateCheck,
} from "./cloudflare-closed-state.mjs";
import {
  assertExceptionalCutoverRemoteUnused,
  findExceptionalCutoverRemoteBindings,
  verifyExceptionalCutoverRemoteUpload,
} from "./exceptional-cutover-version-binding.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";
import { verifyExceptionalWranglerIntegrity } from "./exceptional-wrangler-integrity.mjs";
import {
  ExceptionalCutoverOperationLockError,
  acquireExceptionalCutoverOperationLock,
  assertExceptionalCutoverOperationLock,
  releaseExceptionalCutoverOperationLock,
} from "./exceptional-cutover-operation-lock.mjs";
import {
  ExceptionalCutoverChildProcessError,
  runExceptionalCutoverChildProcess,
} from "./exceptional-cutover-child-process.mjs";
import {
  assertGitRecoveryAuditBundleReady,
  auditGitRepository,
} from "./git-recovery-lib.mjs";

export const EXCEPTIONAL_CUTOVER_CLAIM_SCHEMA_VERSION =
  "agorbis-exceptional-cutover-claim/v2";
export const EXCEPTIONAL_CUTOVER_RECEIPT_SCHEMA_VERSION =
  "agorbis-exceptional-cutover-receipt/v3";
export const EXCEPTIONAL_OPEN_UPDATE_CLAIM_SCHEMA_VERSION =
  "agorbis-exceptional-cutover-claim/v3";
export const EXCEPTIONAL_OPEN_UPDATE_RECEIPT_SCHEMA_VERSION =
  "agorbis-exceptional-cutover-receipt/v4";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const execFileAsync = promisify(execFile);
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const MAX_TTY_LINE_BYTES = 8 * 1_024;
const MAX_GIT_OUTPUT_BYTES = 128 * 1_024;
const MAX_CUTOVER_STATE_BYTES = 512 * 1_024;
const MAX_WRANGLER_OUTPUT_BYTES = 1 * 1_024 * 1_024;
const GIT_BINARY = "/usr/bin/git";
const GIT_BINARY_SHA256 =
  "eb54b535467e0975c1284d4c4d08eea779aeb248a5d34b02e2ee171382e22201";
const EXPECTED_ORIGIN_URL = "https://github.com/sebacc92/agorbis.git";
const GIT_CREDENTIAL_HELPER_SHA256 =
  "2fd925d68889746976958342fb749bf102bc7dc8bcba3abfa533a80ad7791673";
const GIT_REMOTE_TRANSPORT_SCHEMA_VERSION =
  "agorbis-recoverable-git-remote-transport/v1";
const MAX_GIT_CREDENTIAL_CONFIGURATION_BYTES = 1_024;
const MAX_GIT_CREDENTIAL_HELPER_BYTES = 256 * 1_024 * 1_024;
const GIT_PRIVATE_TEMPORARY_ROOT = "/tmp";
const GIT_HELPER_TEMPORARY_PREFIX = "agorbis-d72-git-helper-";
const GIT_OBJECT_STORE_TEMPORARY_PREFIX = "agorbis-d72-git-objects-";
const SAFE_PASSTHROUGH_ENV = Object.freeze([
  "DBUS_SESSION_BUS_ADDRESS",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "TMPDIR",
  "USER",
  "XDG_CONFIG_HOME",
  "XDG_RUNTIME_DIR",
]);
const GIT_PASSTHROUGH_ENV = Object.freeze(
  SAFE_PASSTHROUGH_ENV.filter((name) => name !== "PATH"),
);
const GIT_CHILD_PATH = "/usr/bin:/bin";
const WRANGLER_VERSION_UPLOAD_REQUIRED_KEYS = Object.freeze([
  "timestamp",
  "type",
  "version",
  "version_id",
  "worker_name",
  "worker_name_overridden",
  "worker_tag",
]);
const WRANGLER_VERSION_UPLOAD_ALLOWED_KEYS = new Set([
  ...WRANGLER_VERSION_UPLOAD_REQUIRED_KEYS,
  "preview_alias_url",
  "preview_url",
  "wrangler_environment",
]);
const WRANGLER_SESSION_REQUIRED_KEYS = Object.freeze([
  "command_line_args",
  "log_file_path",
  "timestamp",
  "type",
  "version",
  "wrangler_version",
]);
const PRODUCTION_CUTOVER_CAPABILITY = Symbol("production-cutover-capability");
const RECOVERABLE_GIT_REMOTE_TRANSPORTS = new WeakMap();

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("El cutover excepcional exige O_NOFOLLOW.");
}

const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
const WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  (fsConstants.O_CLOEXEC ?? 0) |
  fsConstants.O_NOFOLLOW;

export class ExceptionalCutoverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExceptionalCutoverError";
    this.code = code;
  }
}

function cutoverError(code, message) {
  return new ExceptionalCutoverError(code, message);
}

function acquireOpenOperationLock({
  stateRoot,
  requestHash,
  actHash,
  head,
  now,
}) {
  try {
    return acquireExceptionalCutoverOperationLock({
      stateRoot,
      operation: "open",
      requestHash,
      actHash,
      head,
      now,
    });
  } catch (error) {
    if (
      error instanceof ExceptionalCutoverOperationLockError &&
      error.code === "OPERATION_ALREADY_RUNNING"
    ) {
      throw cutoverError(
        "CUTOVER_ALREADY_RUNNING",
        "Ya existe una mutación productiva activa para Agorbis.",
      );
    }
    throw cutoverError(
      "OPERATION_LOCK_FAILED",
      "No se pudo adquirir el lock operacional del cutover.",
    );
  }
}

function assertOpenOperationLock(acquired) {
  try {
    assertExceptionalCutoverOperationLock(acquired);
  } catch {
    throw cutoverError(
      "OPERATION_LOCK_CHANGED",
      "El lock operacional del cutover cambió.",
    );
  }
}

function releaseOpenOperationLock(acquired) {
  try {
    releaseExceptionalCutoverOperationLock(acquired);
  } catch {
    throw cutoverError(
      "OPERATION_LOCK_CHANGED",
      "No se pudo liberar el lock operacional del cutover.",
    );
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

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function canonicalContentHash(payload) {
  return sha256(Buffer.from(canonicalJson(payload), "utf8"));
}

function nowFrom(nowImpl) {
  const value = nowImpl();
  const now =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(now.getTime())) {
    throw cutoverError("INVALID_TIME", "El reloj del cutover no es válido.");
  }
  return now;
}

function isPathInsideOrEqual(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function pathExists(filePath, lstatImpl = lstatSync) {
  try {
    lstatImpl(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function assertSafeHash(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw cutoverError("INVALID_HASH", `${label} no es un SHA-256 válido.`);
  }
  return value;
}

function assertSafeVersionId(value, label) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw cutoverError("INVALID_VERSION_ID", `${label} no es un UUID válido.`);
  }
  return value;
}

function assertSecureRegularFile(metadata, label, { allowEmpty = false } = {}) {
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw cutoverError("UNSAFE_FILE", `${label} no es un archivo regular.`);
  }
  if ((metadata.mode & 0o7777) !== 0o600) {
    throw cutoverError("UNSAFE_FILE_MODE", `${label} no tiene modo 0600.`);
  }
  if (
    typeof process.getuid !== "function" ||
    metadata.uid !== process.getuid()
  ) {
    throw cutoverError("UNSAFE_FILE_OWNER", `${label} tiene owner inválido.`);
  }
  if (metadata.nlink !== 1) {
    throw cutoverError("UNSAFE_FILE_LINKS", `${label} tiene hard links.`);
  }
  if (!allowEmpty && metadata.size < 1) {
    throw cutoverError("EMPTY_FILE", `${label} está vacío.`);
  }
}

function sameFileSnapshot(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.nlink === right.nlink &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function closeQuietly(descriptor) {
  if (descriptor === null) return;
  try {
    closeSync(descriptor);
  } catch {
    // El error original conserva prioridad.
  }
}

function writeAll(descriptor, source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
  }
}

function writeExclusiveFile(filePath, source) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, WRITE_FLAGS, 0o600);
    fchmodSync(descriptor, 0o600);
    writeAll(descriptor, source);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
  } finally {
    closeQuietly(descriptor);
  }
  const metadata = lstatSync(filePath);
  assertSecureRegularFile(metadata, filePath, {
    allowEmpty: Buffer.byteLength(source) === 0,
  });
  const parentDescriptor = openSync(
    path.dirname(filePath),
    fsConstants.O_RDONLY |
      (fsConstants.O_DIRECTORY ?? 0) |
      (fsConstants.O_CLOEXEC ?? 0) |
      fsConstants.O_NOFOLLOW,
  );
  try {
    fsyncSync(parentDescriptor);
  } finally {
    closeSync(parentDescriptor);
  }
}

function createExclusiveEmptyFile(filePath) {
  writeExclusiveFile(filePath, Buffer.alloc(0));
}

function readSecureFile(filePath, { maxBytes, allowEmpty = false } = {}) {
  const initial = lstatSync(filePath);
  assertSecureRegularFile(initial, filePath, { allowEmpty });
  if (initial.size > maxBytes) {
    throw cutoverError(
      "FILE_TOO_LARGE",
      "Un archivo de estado excede el límite.",
    );
  }
  let descriptor = null;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    assertSecureRegularFile(opened, filePath, { allowEmpty });
    if (!sameFileSnapshot(initial, opened)) {
      throw cutoverError(
        "FILE_CHANGED",
        "Un archivo de estado cambió antes de abrirse.",
      );
    }
    const source = readFileSync(descriptor);
    const final = fstatSync(descriptor);
    if (!sameFileSnapshot(opened, final) || source.length !== final.size) {
      throw cutoverError(
        "FILE_CHANGED",
        "Un archivo de estado cambió durante la lectura.",
      );
    }
    closeSync(descriptor);
    descriptor = null;
    const finalPath = lstatSync(filePath);
    if (!sameFileSnapshot(final, finalPath)) {
      throw cutoverError(
        "FILE_CHANGED",
        "Un archivo de estado fue sustituido.",
      );
    }
    return source;
  } finally {
    closeQuietly(descriptor);
  }
}

export function resolveExceptionalCutoverStateRoot({
  userInfoImpl = userInfo,
} = {}) {
  let currentUser;
  try {
    currentUser = userInfoImpl();
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw cutoverError(
      "INVALID_USER_STATE",
      "No se pudo resolver el usuario efectivo para el estado canónico.",
    );
  }
  if (
    !isPlainObject(currentUser) ||
    typeof process.getuid !== "function" ||
    currentUser.uid !== process.getuid() ||
    typeof currentUser.homedir !== "string" ||
    !path.isAbsolute(currentUser.homedir) ||
    CONTROL_OR_BIDI_PATTERN.test(currentUser.homedir)
  ) {
    throw cutoverError(
      "INVALID_USER_STATE",
      "El home del usuario efectivo no es seguro para el estado canónico.",
    );
  }
  return path.join(
    path.resolve(currentUser.homedir),
    ".local",
    "state",
    "agorbis",
    "exceptional-cutovers",
  );
}

export function deriveExceptionalCutoverStatePaths({
  stateRoot,
  requestHash,
} = {}) {
  if (
    typeof stateRoot !== "string" ||
    !path.isAbsolute(stateRoot) ||
    CONTROL_OR_BIDI_PATTERN.test(stateRoot)
  ) {
    throw cutoverError(
      "INVALID_STATE_ROOT",
      "stateRoot no es una ruta absoluta segura.",
    );
  }
  assertSafeHash(requestHash, "requestHash");
  return Object.freeze({
    claimPath: path.join(stateRoot, `${requestHash}.claim.json`),
    outputPath: path.join(stateRoot, `${requestHash}.wrangler.ndjson`),
    receiptPath: path.join(stateRoot, `${requestHash}.receipt.json`),
  });
}

export function ensureExceptionalCutoverStateRoot({
  stateRoot,
  worktreeRoot,
  mkdirImpl = mkdirSync,
  lstatImpl = lstatSync,
  realpathImpl = realpathSync,
} = {}) {
  if (
    typeof stateRoot !== "string" ||
    !path.isAbsolute(stateRoot) ||
    typeof worktreeRoot !== "string" ||
    !path.isAbsolute(worktreeRoot)
  ) {
    throw cutoverError(
      "INVALID_STATE_ROOT",
      "Las rutas de estado no son válidas.",
    );
  }
  mkdirImpl(stateRoot, { recursive: true, mode: 0o700 });
  const metadata = lstatImpl(stateRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw cutoverError(
      "UNSAFE_STATE_ROOT",
      "stateRoot no es un directorio regular.",
    );
  }
  if ((metadata.mode & 0o7777) !== 0o700) {
    throw cutoverError(
      "UNSAFE_STATE_MODE",
      "stateRoot no tiene modo exacto 0700.",
    );
  }
  if (
    typeof process.getuid !== "function" ||
    metadata.uid !== process.getuid()
  ) {
    throw cutoverError("UNSAFE_STATE_OWNER", "stateRoot tiene owner inválido.");
  }
  const realStateRoot = realpathImpl(stateRoot);
  const realWorktreeRoot = realpathImpl(worktreeRoot);
  if (isPathInsideOrEqual(realStateRoot, realWorktreeRoot)) {
    throw cutoverError(
      "STATE_IN_WORKTREE",
      "stateRoot debe quedar fuera del worktree.",
    );
  }
  return Object.freeze({ stateRoot: realStateRoot, metadata });
}

export function findWranglerDeployConfigsInAncestors({
  cwd,
  lstatImpl = lstatSync,
} = {}) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) {
    throw cutoverError("INVALID_CWD", "El cwd aislado debe ser absoluto.");
  }
  const found = [];
  let current = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(current, ".wrangler", "deploy", "config.json");
    if (pathExists(candidate, lstatImpl)) found.push(candidate);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return Object.freeze(found);
}

export function assertNoWranglerDeployConfigInAncestors(cwds) {
  for (const cwd of cwds) {
    if (findWranglerDeployConfigsInAncestors({ cwd }).length > 0) {
      throw cutoverError(
        "WRANGLER_DEPLOY_CONFIG_PRESENT",
        "Existe un .wrangler/deploy/config.json en los ancestros del cwd aislado.",
      );
    }
  }
}

function copyAllowedEnvironment(sourceEnv, names = SAFE_PASSTHROUGH_ENV) {
  const environment = {};
  for (const name of names) {
    const value = sourceEnv?.[name];
    if (typeof value === "string" && value.length > 0)
      environment[name] = value;
  }
  return environment;
}

export function exceptionalCutoverChildEnvironment(
  sourceEnv,
  { outputPath } = {},
) {
  const environment = {
    ...copyAllowedEnvironment(sourceEnv),
    CI: "true",
    CLOUDFLARE_ACCOUNT_ID: EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
    CLOUDFLARE_AUTH_USE_KEYRING: "true",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    DO_NOT_TRACK: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    WRANGLER_LOG: "none",
    WRANGLER_LOG_SANITIZE: "true",
    WRANGLER_NO_SKILLS_UPDATE_PROMPTS: "true",
    WRANGLER_SEND_ERROR_REPORTS: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };
  if (outputPath !== undefined) {
    if (typeof outputPath !== "string" || !path.isAbsolute(outputPath)) {
      throw cutoverError(
        "INVALID_OUTPUT_PATH",
        "WRANGLER_OUTPUT_FILE_PATH no es absoluto.",
      );
    }
    environment.WRANGLER_OUTPUT_FILE_PATH = outputPath;
  }
  return Object.freeze(environment);
}

export function selectRecoverableGitEnvironment(sourceEnvironment) {
  if (
    sourceEnvironment === null ||
    typeof sourceEnvironment !== "object" ||
    Array.isArray(sourceEnvironment)
  ) {
    throw cutoverError(
      "INVALID_GIT_ENVIRONMENT",
      "El entorno explícito de Git no es válido.",
    );
  }
  return Object.freeze(
    copyAllowedEnvironment(sourceEnvironment, GIT_PASSTHROUGH_ENV),
  );
}

function currentRecoverableGitEnvironment() {
  const selected = {};
  for (const name of GIT_PASSTHROUGH_ENV) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) selected[name] = value;
  }
  return Object.freeze(selected);
}

function gitDiscoveryEnvironment(sourceEnvironment) {
  return Object.freeze({
    ...selectRecoverableGitEnvironment(sourceEnvironment),
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    PATH: GIT_CHILD_PATH,
  });
}

function gitChildEnvironment(sourceEnvironment) {
  return Object.freeze({
    ...gitDiscoveryEnvironment(sourceEnvironment),
    GIT_CONFIG_GLOBAL: "/dev/null",
  });
}

function parseExpectedGitRemoteUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw cutoverError(
      "INVALID_GIT_REMOTE_TRANSPORT",
      "El transporte Git remoto no es válido.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname === "/" ||
    parsed.href !== value
  ) {
    throw cutoverError(
      "INVALID_GIT_REMOTE_TRANSPORT",
      "El transporte Git remoto no es válido.",
    );
  }
  return Object.freeze({ origin: parsed.origin, url: value });
}

function invalidGitRemoteTransport() {
  return cutoverError(
    "UNSAFE_GIT_REMOTE_TRANSPORT",
    "La configuración mínima del transporte Git remoto no es confiable.",
  );
}

function assertGitCredentialHelperMetadata(
  metadata,
  { expectedMode = 0o755, allowRootOwner = true } = {},
) {
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : null;
  if (
    currentUid === null ||
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o7777) !== expectedMode ||
    (metadata.uid !== currentUid && !(allowRootOwner && metadata.uid === 0)) ||
    metadata.size < 1 ||
    metadata.size > MAX_GIT_CREDENTIAL_HELPER_BYTES
  ) {
    throw invalidGitRemoteTransport();
  }
}

function validateGitCredentialHelper({
  helperPath,
  expectedSha256,
  realpathImpl,
  lstatImpl,
  openImpl,
  fstatImpl,
  readImpl,
  closeImpl,
  expectedMode = 0o755,
  allowRootOwner = true,
}) {
  let descriptor = null;
  try {
    const resolvedPath = realpathImpl(helperPath);
    const initial = lstatImpl(helperPath);
    if (resolvedPath !== helperPath) throw invalidGitRemoteTransport();
    // El límite se valida antes de reservar memoria o leer el ejecutable.
    assertGitCredentialHelperMetadata(initial, {
      allowRootOwner,
      expectedMode,
    });

    descriptor = openImpl(helperPath, READ_FLAGS);
    const opened = fstatImpl(descriptor);
    assertGitCredentialHelperMetadata(opened, {
      allowRootOwner,
      expectedMode,
    });
    if (!sameFileSnapshot(initial, opened)) throw invalidGitRemoteTransport();

    const contents = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < contents.length) {
      const count = readImpl(
        descriptor,
        contents,
        offset,
        contents.length - offset,
        null,
      );
      if (!Number.isInteger(count) || count <= 0) {
        throw invalidGitRemoteTransport();
      }
      offset += count;
    }
    const extra = Buffer.alloc(1);
    const trailingCount = readImpl(descriptor, extra, 0, 1, null);
    const final = fstatImpl(descriptor);
    closeImpl(descriptor);
    descriptor = null;

    assertGitCredentialHelperMetadata(final, {
      allowRootOwner,
      expectedMode,
    });
    const finalPath = lstatImpl(helperPath);
    if (
      trailingCount !== 0 ||
      !sameFileSnapshot(opened, final) ||
      !sameFileSnapshot(final, finalPath) ||
      realpathImpl(helperPath) !== helperPath ||
      sha256(contents) !== expectedSha256
    ) {
      throw invalidGitRemoteTransport();
    }
    return Object.freeze({ contents, metadata: final });
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw invalidGitRemoteTransport();
  } finally {
    if (descriptor !== null) {
      try {
        closeImpl(descriptor);
      } catch {
        // El error de validación saneado conserva prioridad.
      }
    }
  }
}

export async function prepareRecoverableGitRemoteTransport({
  repositoryRoot = REPOSITORY_ROOT,
  environment = currentRecoverableGitEnvironment(),
  expectedRemoteUrl = EXPECTED_ORIGIN_URL,
  expectedHelperSha256 = GIT_CREDENTIAL_HELPER_SHA256,
  execFileImpl = execFileAsync,
  realpathImpl = realpathSync,
  lstatImpl = lstatSync,
  openImpl = openSync,
  fstatImpl = fstatSync,
  readImpl = readSync,
  closeImpl = closeSync,
} = {}) {
  if (!SHA256_PATTERN.test(expectedHelperSha256 ?? "")) {
    throw cutoverError(
      "INVALID_GIT_REMOTE_TRANSPORT",
      "El transporte Git remoto no es válido.",
    );
  }
  const remote = parseExpectedGitRemoteUrl(expectedRemoteUrl);
  const selectedEnvironment = selectRecoverableGitEnvironment(environment);
  const credentialKey = `credential.${remote.origin}.helper`;
  const rawConfiguration = await runGit(
    execFileImpl,
    repositoryRoot,
    [
      "config",
      "--global",
      "--no-includes",
      "--null",
      "--get-all",
      credentialKey,
    ],
    gitDiscoveryEnvironment(selectedEnvironment),
  );
  if (
    Buffer.byteLength(rawConfiguration, "utf8") >
      MAX_GIT_CREDENTIAL_CONFIGURATION_BYTES ||
    !rawConfiguration.endsWith("\0")
  ) {
    throw invalidGitRemoteTransport();
  }
  const values = rawConfiguration.slice(0, -1).split("\0");
  if (values.length !== 2 || values[0] !== "") {
    throw invalidGitRemoteTransport();
  }
  const commandMatch = values[1].match(
    /^!((?:\/[A-Za-z0-9._+-]+)+) auth git-credential$/u,
  );
  if (!commandMatch || path.basename(commandMatch[1]) !== "gh") {
    throw invalidGitRemoteTransport();
  }
  const helperPath = commandMatch[1];
  const validatedHelper = validateGitCredentialHelper({
    helperPath,
    expectedSha256: expectedHelperSha256,
    realpathImpl,
    lstatImpl,
    openImpl,
    fstatImpl,
    readImpl,
    closeImpl,
  });
  const transport = Object.freeze({
    schemaVersion: GIT_REMOTE_TRANSPORT_SCHEMA_VERSION,
    mode: "validated-host-scope",
  });
  RECOVERABLE_GIT_REMOTE_TRANSPORTS.set(
    transport,
    Object.freeze({
      credentialKey,
      environment: selectedEnvironment,
      expectedHelperSha256,
      expectedRemoteUrl: remote.url,
      helperContents: Buffer.from(validatedHelper.contents),
    }),
  );
  return transport;
}

function assertPrivateGitTemporaryDirectory(directoryPath, expectedMode) {
  const currentUid =
    typeof process.getuid === "function" ? process.getuid() : null;
  let metadata;
  try {
    metadata = lstatSync(directoryPath);
  } catch {
    throw invalidGitRemoteTransport();
  }
  if (
    currentUid === null ||
    realpathSync(directoryPath) !== directoryPath ||
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== currentUid ||
    (expectedMode !== null && (metadata.mode & 0o7777) !== expectedMode)
  ) {
    throw invalidGitRemoteTransport();
  }
}

function removePrivateGitTemporaryDirectory(directoryPath, prefix) {
  const expectedParent = `${GIT_PRIVATE_TEMPORARY_ROOT}${path.sep}`;
  if (
    typeof directoryPath !== "string" ||
    !directoryPath.startsWith(`${expectedParent}${prefix}`) ||
    path.dirname(directoryPath) !== GIT_PRIVATE_TEMPORARY_ROOT
  ) {
    throw invalidGitRemoteTransport();
  }
  try {
    assertPrivateGitTemporaryDirectory(directoryPath, null);
    chmodSync(directoryPath, 0o700);
    assertPrivateGitTemporaryDirectory(directoryPath, 0o700);
    rmSync(directoryPath, { force: false, recursive: true });
    try {
      lstatSync(directoryPath);
      throw invalidGitRemoteTransport();
    } catch (error) {
      if (error instanceof ExceptionalCutoverError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw invalidGitRemoteTransport();
  }
}

function createImmutableGitCredentialHelperCopy(transportState) {
  let directoryPath = null;
  let descriptor = null;
  try {
    directoryPath = mkdtempSync(
      path.join(GIT_PRIVATE_TEMPORARY_ROOT, GIT_HELPER_TEMPORARY_PREFIX),
    );
    chmodSync(directoryPath, 0o700);
    assertPrivateGitTemporaryDirectory(directoryPath, 0o700);
    const helperPath = path.join(directoryPath, "gh");
    descriptor = openSync(helperPath, WRITE_FLAGS, 0o500);
    let offset = 0;
    while (offset < transportState.helperContents.length) {
      const written = writeSync(
        descriptor,
        transportState.helperContents,
        offset,
        transportState.helperContents.length - offset,
        null,
      );
      if (!Number.isInteger(written) || written <= 0) {
        throw invalidGitRemoteTransport();
      }
      offset += written;
    }
    fsyncSync(descriptor);
    fchmodSync(descriptor, 0o500);
    closeSync(descriptor);
    descriptor = null;

    const validated = validateGitCredentialHelper({
      helperPath,
      expectedSha256: transportState.expectedHelperSha256,
      realpathImpl: realpathSync,
      lstatImpl: lstatSync,
      openImpl: openSync,
      fstatImpl: fstatSync,
      readImpl: readSync,
      closeImpl: closeSync,
      expectedMode: 0o500,
      allowRootOwner: false,
    });
    if (!validated.contents.equals(transportState.helperContents)) {
      throw invalidGitRemoteTransport();
    }
    chmodSync(directoryPath, 0o500);
    assertPrivateGitTemporaryDirectory(directoryPath, 0o500);
    return Object.freeze({
      directoryPath,
      helperPath,
      metadata: validated.metadata,
    });
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // La falla saneada conserva prioridad.
      }
    }
    if (directoryPath !== null) {
      try {
        removePrivateGitTemporaryDirectory(
          directoryPath,
          GIT_HELPER_TEMPORARY_PREFIX,
        );
      } catch {
        // La falla saneada conserva prioridad.
      }
    }
    if (error instanceof ExceptionalCutoverError) throw error;
    throw invalidGitRemoteTransport();
  }
}

async function withImmutableGitCredentialHelper(transportState, operation) {
  const helperCopy = createImmutableGitCredentialHelperCopy(transportState);
  let operationError = null;
  let result;
  try {
    const helperCommand = `!${helperCopy.helperPath} auth git-credential`;
    const environment = Object.freeze({
      ...gitChildEnvironment(transportState.environment),
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: transportState.credentialKey,
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: transportState.credentialKey,
      GIT_CONFIG_VALUE_1: helperCommand,
    });
    result = await operation(environment);
    const finalHelper = validateGitCredentialHelper({
      helperPath: helperCopy.helperPath,
      expectedSha256: transportState.expectedHelperSha256,
      realpathImpl: realpathSync,
      lstatImpl: lstatSync,
      openImpl: openSync,
      fstatImpl: fstatSync,
      readImpl: readSync,
      closeImpl: closeSync,
      expectedMode: 0o500,
      allowRootOwner: false,
    });
    if (
      !sameFileSnapshot(finalHelper.metadata, helperCopy.metadata) ||
      !finalHelper.contents.equals(transportState.helperContents)
    ) {
      throw invalidGitRemoteTransport();
    }
  } catch (error) {
    operationError = error;
  }

  let cleanupError = null;
  try {
    removePrivateGitTemporaryDirectory(
      helperCopy.directoryPath,
      GIT_HELPER_TEMPORARY_PREFIX,
    );
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError !== null) throw invalidGitRemoteTransport();
  if (operationError !== null) throw operationError;
  return result;
}

function assertSafeLocalGitConfiguration(configuration, expectedRemoteUrl) {
  if (!configuration.endsWith("\0")) {
    throw cutoverError(
      "UNSAFE_GIT_CONFIG",
      "La configuración local de Git no tiene una estructura segura.",
    );
  }
  const expected = new Map([
    ["core.repositoryformatversion", "0"],
    ["core.filemode", "true"],
    ["core.bare", "false"],
    ["core.logallrefupdates", "true"],
    ["remote.origin.url", expectedRemoteUrl],
    ["remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
    ["branch.main.remote", "origin"],
    ["branch.main.merge", "refs/heads/main"],
  ]);
  const observed = new Map();
  for (const entry of configuration.slice(0, -1).split("\0")) {
    const separator = entry.indexOf("\n");
    if (separator < 1) {
      throw cutoverError(
        "UNSAFE_GIT_CONFIG",
        "La configuración local de Git no tiene una estructura segura.",
      );
    }
    const key = entry.slice(0, separator).toLowerCase();
    const value = entry.slice(separator + 1);
    if (!expected.has(key) || observed.has(key)) {
      throw cutoverError(
        "UNSAFE_GIT_CONFIG",
        "La configuración local de Git no coincide con la allowlist mínima.",
      );
    }
    observed.set(key, value);
  }
  if (
    observed.size !== expected.size ||
    [...expected].some(([key, value]) => observed.get(key) !== value)
  ) {
    throw cutoverError(
      "UNSAFE_GIT_CONFIG",
      "La configuración local de Git no coincide con la allowlist mínima.",
    );
  }
}

async function runGit(execFileImpl, repositoryRoot, args, env) {
  let result;
  try {
    result = await execFileImpl(GIT_BINARY, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      shell: false,
      timeout: 30_000,
      windowsHide: true,
    });
  } catch {
    throw cutoverError(
      "GIT_UNAVAILABLE",
      "No se pudo verificar Git de forma saneada.",
    );
  }
  if (!isPlainObject(result) || typeof result.stdout !== "string") {
    throw cutoverError(
      "GIT_INVALID_OUTPUT",
      "Git no devolvió una salida válida.",
    );
  }
  return result.stdout;
}

function createPrivateGitObjectStore() {
  let directoryPath = null;
  try {
    directoryPath = mkdtempSync(
      path.join(GIT_PRIVATE_TEMPORARY_ROOT, GIT_OBJECT_STORE_TEMPORARY_PREFIX),
    );
    chmodSync(directoryPath, 0o700);
    assertPrivateGitTemporaryDirectory(directoryPath, 0o700);
    return directoryPath;
  } catch (error) {
    if (directoryPath !== null) {
      try {
        removePrivateGitTemporaryDirectory(
          directoryPath,
          GIT_OBJECT_STORE_TEMPORARY_PREFIX,
        );
      } catch {
        // La falla saneada conserva prioridad.
      }
    }
    if (error instanceof ExceptionalCutoverError) throw error;
    throw invalidGitRemoteTransport();
  }
}

async function readVerifiedRemoteMain({ execFileImpl, transportState }) {
  const objectStore = createPrivateGitObjectStore();
  let operationError = null;
  let result;
  try {
    const localEnvironment = gitChildEnvironment(transportState.environment);
    await runGit(
      execFileImpl,
      objectStore,
      ["init", "--bare", "--quiet", "."],
      localEnvironment,
    );
    result = await withImmutableGitCredentialHelper(
      transportState,
      async (remoteEnvironment) => {
        const advertised = (
          await runGit(
            execFileImpl,
            objectStore,
            [
              "ls-remote",
              "--exit-code",
              transportState.expectedRemoteUrl,
              "refs/heads/main",
            ],
            remoteEnvironment,
          )
        ).trim();
        const advertisedMatch = advertised.match(
          /^([0-9a-f]{40})\s+refs\/heads\/main$/,
        );
        if (!advertisedMatch) {
          throw cutoverError(
            "GIT_REMOTE_OBJECT_UNAVAILABLE",
            "El remoto privado no anunció main de forma válida.",
          );
        }
        const advertisedHead = advertisedMatch[1];
        await runGit(
          execFileImpl,
          objectStore,
          [
            "fetch",
            "--quiet",
            "--no-tags",
            "--no-recurse-submodules",
            "--no-write-fetch-head",
            transportState.expectedRemoteUrl,
            "+refs/heads/main:refs/d72/remote-main",
          ],
          remoteEnvironment,
        );
        const fetchedHead = (
          await runGit(
            execFileImpl,
            objectStore,
            ["rev-parse", "--verify", "refs/d72/remote-main^{commit}"],
            localEnvironment,
          )
        ).trim();
        if (fetchedHead !== advertisedHead) {
          throw cutoverError(
            "GIT_REMOTE_CHANGED_DURING_FETCH",
            "main cambió durante la prueba de recuperabilidad remota.",
          );
        }
        await runGit(
          execFileImpl,
          objectStore,
          ["cat-file", "-e", `${advertisedHead}^{commit}`],
          localEnvironment,
        );
        await runGit(
          execFileImpl,
          objectStore,
          ["fsck", "--full", "--strict", "--no-dangling"],
          localEnvironment,
        );
        return Object.freeze({
          advertised: `${advertisedHead}\trefs/heads/main`,
          head: advertisedHead,
        });
      },
    );
  } catch (error) {
    operationError = error;
  }

  let cleanupError = null;
  try {
    removePrivateGitTemporaryDirectory(
      objectStore,
      GIT_OBJECT_STORE_TEMPORARY_PREFIX,
    );
  } catch (error) {
    cleanupError = error;
  }
  if (cleanupError !== null) throw invalidGitRemoteTransport();
  if (operationError !== null) throw operationError;
  return result;
}

function assertMatchingGitRecoveryAudit(audit, head) {
  try {
    assertGitRecoveryAuditBundleReady(audit);
  } catch {
    throw cutoverError(
      "GIT_RECOVERY_AUDIT_FAILED",
      "La auditoría de recuperación Git no quedó lista para bundle.",
    );
  }
  const mainRefs = Array.isArray(audit?.localRefs)
    ? audit.localRefs.filter((entry) => entry?.name === "refs/heads/main")
    : [];
  const remotes = Array.isArray(audit?.remotes) ? audit.remotes : [];
  if (
    audit?.headOid !== head ||
    audit?.headRef !== "refs/heads/main" ||
    audit?.upstream !== "origin/main" ||
    mainRefs.length !== 1 ||
    mainRefs[0]?.oid !== head ||
    remotes.length !== 1 ||
    remotes[0]?.name !== "origin" ||
    remotes[0]?.safe !== true ||
    JSON.stringify(remotes[0]?.kinds) !== JSON.stringify(["https"])
  ) {
    throw cutoverError(
      "GIT_RECOVERY_AUDIT_MISMATCH",
      "La auditoría de recuperación no corresponde al mismo HEAD/main/upstream.",
    );
  }
}

export async function readRecoverableGitState({
  repositoryRoot = REPOSITORY_ROOT,
  environment = currentRecoverableGitEnvironment(),
  remoteTransport,
  execFileImpl = execFileAsync,
  auditGitRepositoryImpl = auditGitRepository,
  allowOriginAdvanceFromHead = false,
} = {}) {
  if (typeof allowOriginAdvanceFromHead !== "boolean") {
    throw cutoverError(
      "INVALID_GIT_POLICY",
      "La política de recuperabilidad Git no es válida.",
    );
  }
  if (typeof auditGitRepositoryImpl !== "function") {
    throw cutoverError(
      "INVALID_GIT_POLICY",
      "La auditoría de recuperación Git no es válida.",
    );
  }
  const preparedTransport =
    remoteTransport ??
    (await prepareRecoverableGitRemoteTransport({
      repositoryRoot,
      environment,
      execFileImpl,
    }));
  const transportState =
    RECOVERABLE_GIT_REMOTE_TRANSPORTS.get(preparedTransport);
  if (!transportState) throw invalidGitRemoteTransport();
  const gitEnv = gitChildEnvironment(transportState.environment);
  const localConfiguration = await runGit(
    execFileImpl,
    repositoryRoot,
    ["config", "--local", "--null", "--list"],
    gitEnv,
  );
  assertSafeLocalGitConfiguration(
    localConfiguration,
    transportState.expectedRemoteUrl,
  );
  const originUrl = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["remote", "get-url", "origin"],
      gitEnv,
    )
  ).trim();
  const originPushUrl = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["remote", "get-url", "--push", "origin"],
      gitEnv,
    )
  ).trim();
  if (
    originUrl !== transportState.expectedRemoteUrl ||
    originPushUrl !== transportState.expectedRemoteUrl
  ) {
    throw cutoverError(
      "WRONG_GIT_ORIGIN",
      "origin no coincide con el repositorio canónico.",
    );
  }
  const status = await runGit(
    execFileImpl,
    repositoryRoot,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    gitEnv,
  );
  const head = (
    await runGit(execFileImpl, repositoryRoot, ["rev-parse", "HEAD"], gitEnv)
  ).trim();
  const originMain = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-parse", "origin/main"],
      gitEnv,
    )
  ).trim();
  const divergence = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-list", "--left-right", "--count", "origin/main...HEAD"],
      gitEnv,
    )
  ).trim();
  const diffCheck = await runGit(
    execFileImpl,
    repositoryRoot,
    ["diff", "--check"],
    gitEnv,
  );
  const divergenceMatch = divergence.match(/^(\d+)\t(\d+)$/);
  const localOriginIsAligned = allowOriginAdvanceFromHead
    ? divergenceMatch?.[2] === "0"
    : originMain === head && divergence === "0\t0";
  if (
    status !== "" ||
    diffCheck !== "" ||
    !FULL_HEAD_PATTERN.test(head) ||
    !FULL_HEAD_PATTERN.test(originMain) ||
    !localOriginIsAligned
  ) {
    throw cutoverError(
      "GIT_NOT_RECOVERABLE",
      "Git no está limpio, alineado 0/0 y recuperable desde origin/main.",
    );
  }
  const remoteState = await readVerifiedRemoteMain({
    execFileImpl,
    transportState,
  });
  if (
    (allowOriginAdvanceFromHead && remoteState.head !== originMain) ||
    (!allowOriginAdvanceFromHead && remoteState.head !== head)
  ) {
    throw cutoverError(
      "GIT_NOT_RECOVERABLE",
      "Git no está limpio, alineado 0/0 y recuperable desde origin/main.",
    );
  }
  let recoveryAudit;
  try {
    recoveryAudit = await auditGitRepositoryImpl(repositoryRoot);
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw cutoverError(
      "GIT_RECOVERY_AUDIT_FAILED",
      "La auditoría de recuperación Git no pudo completarse de forma saneada.",
    );
  }
  assertMatchingGitRecoveryAudit(recoveryAudit, head);

  const finalLocalConfiguration = await runGit(
    execFileImpl,
    repositoryRoot,
    ["config", "--local", "--null", "--list"],
    gitEnv,
  );
  assertSafeLocalGitConfiguration(
    finalLocalConfiguration,
    transportState.expectedRemoteUrl,
  );
  const finalOriginUrl = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["remote", "get-url", "origin"],
      gitEnv,
    )
  ).trim();
  const finalOriginPushUrl = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["remote", "get-url", "--push", "origin"],
      gitEnv,
    )
  ).trim();
  const finalStatus = await runGit(
    execFileImpl,
    repositoryRoot,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    gitEnv,
  );
  const finalHead = (
    await runGit(execFileImpl, repositoryRoot, ["rev-parse", "HEAD"], gitEnv)
  ).trim();
  const finalOriginMain = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-parse", "origin/main"],
      gitEnv,
    )
  ).trim();
  const finalDivergence = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-list", "--left-right", "--count", "origin/main...HEAD"],
      gitEnv,
    )
  ).trim();
  const finalDiffCheck = await runGit(
    execFileImpl,
    repositoryRoot,
    ["diff", "--check"],
    gitEnv,
  );
  let finalRecoveryAudit;
  try {
    finalRecoveryAudit = await auditGitRepositoryImpl(repositoryRoot);
  } catch {
    throw cutoverError(
      "GIT_RECOVERY_AUDIT_FAILED",
      "La auditoría final de recuperación Git no pudo completarse de forma saneada.",
    );
  }
  assertMatchingGitRecoveryAudit(finalRecoveryAudit, head);
  if (canonicalJson(finalRecoveryAudit) !== canonicalJson(recoveryAudit)) {
    throw cutoverError(
      "GIT_RECOVERY_AUDIT_CHANGED",
      "El estado cubierto por la auditoría de recuperación Git cambió durante la lectura.",
    );
  }
  const expectedPostAuditRefs = finalRecoveryAudit.localRefs
    .map(({ name, oid }) => `${name}\t${oid}`)
    .sort()
    .join("\n");
  const postAuditRefs = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      [
        "for-each-ref",
        "--format=%(refname)%09%(objectname)",
        "refs/heads/",
        "refs/tags/",
        "refs/stash",
      ],
      gitEnv,
    )
  ).trim();
  const postAuditShallow = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-parse", "--is-shallow-repository"],
      gitEnv,
    )
  ).trim();
  const postAuditStatus = await runGit(
    execFileImpl,
    repositoryRoot,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    gitEnv,
  );
  const postAuditHead = (
    await runGit(execFileImpl, repositoryRoot, ["rev-parse", "HEAD"], gitEnv)
  ).trim();
  const postAuditOriginMain = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-parse", "origin/main"],
      gitEnv,
    )
  ).trim();
  const postAuditDivergence = (
    await runGit(
      execFileImpl,
      repositoryRoot,
      ["rev-list", "--left-right", "--count", "origin/main...HEAD"],
      gitEnv,
    )
  ).trim();
  const postAuditDiffCheck = await runGit(
    execFileImpl,
    repositoryRoot,
    ["diff", "--check"],
    gitEnv,
  );
  const postAuditConfiguration = await runGit(
    execFileImpl,
    repositoryRoot,
    ["config", "--local", "--null", "--list"],
    gitEnv,
  );
  assertSafeLocalGitConfiguration(
    postAuditConfiguration,
    transportState.expectedRemoteUrl,
  );
  if (
    postAuditRefs !== expectedPostAuditRefs ||
    postAuditShallow !== "false" ||
    postAuditStatus !== "" ||
    postAuditHead !== head ||
    postAuditOriginMain !== originMain ||
    postAuditDivergence !== divergence ||
    postAuditDiffCheck !== "" ||
    postAuditConfiguration !== localConfiguration
  ) {
    throw cutoverError(
      "GIT_CHANGED_DURING_RECOVERY_AUDIT",
      "Git cambió durante la auditoría de recuperación.",
    );
  }
  const finalRemoteState = await readVerifiedRemoteMain({
    execFileImpl,
    transportState,
  });
  if (
    finalLocalConfiguration !== localConfiguration ||
    finalOriginUrl !== originUrl ||
    finalOriginPushUrl !== originPushUrl ||
    finalStatus !== status ||
    finalStatus !== "" ||
    finalHead !== head ||
    finalOriginMain !== originMain ||
    finalDivergence !== divergence ||
    finalDiffCheck !== diffCheck ||
    finalDiffCheck !== "" ||
    finalRemoteState.advertised !== remoteState.advertised ||
    finalRemoteState.head !== remoteState.head
  ) {
    throw cutoverError(
      "GIT_CHANGED_DURING_RECOVERY_AUDIT",
      "Git cambió durante la auditoría de recuperación.",
    );
  }
  return Object.freeze({
    head,
    originMain,
    divergence: `${divergenceMatch?.[1] ?? "?"}/${divergenceMatch?.[2] ?? "?"}`,
    diffCheckClean: true,
    recoveryAuditPassed: true,
    remoteObjectReachable: true,
    remoteHead: remoteState.head,
    worktreeClean: true,
  });
}

function readInstalledWranglerVersion(repositoryRoot) {
  let packagePath;
  try {
    packagePath = realpathSync(
      path.join(repositoryRoot, "node_modules", "wrangler", "package.json"),
    );
    const metadata = lstatSync(packagePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    return packageJson.version;
  } catch {
    throw cutoverError(
      "WRANGLER_NOT_PINNED",
      "No se pudo verificar Wrangler instalado.",
    );
  }
}

export function assertRecoverableGitReaderRuntime() {
  if (process.versions.node !== EXCEPTIONAL_CUTOVER_NODE_VERSION) {
    throw cutoverError("WRONG_NODE", "El lector Git exige Node 22.22.0.");
  }
  let gitDigest;
  try {
    if (realpathSync(GIT_BINARY) !== GIT_BINARY) throw new Error();
    const metadata = lstatSync(GIT_BINARY);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
    gitDigest = sha256(readFileSync(GIT_BINARY));
  } catch {
    throw cutoverError("GIT_NOT_PINNED", "No se pudo verificar Git.");
  }
  if (gitDigest !== GIT_BINARY_SHA256) {
    throw cutoverError(
      "GIT_NOT_PINNED",
      "El binario Git no coincide con el digest versionado.",
    );
  }
  if (
    process.execArgv.length !== 0 ||
    ["NODE_OPTIONS", "NODE_DEBUG", "NODE_V8_COVERAGE"].some(
      (name) => typeof process.env[name] === "string" && process.env[name],
    )
  ) {
    throw cutoverError(
      "UNSAFE_NODE_INSTRUMENTATION",
      "El lector Git no admite instrumentación del proceso Node.",
    );
  }
}

function assertExactRuntime(repositoryRoot) {
  assertRecoverableGitReaderRuntime();
  if (
    readInstalledWranglerVersion(repositoryRoot) !==
    EXCEPTIONAL_CUTOVER_WRANGLER_VERSION
  ) {
    throw cutoverError("WRONG_WRANGLER", "El cutover exige Wrangler 4.160.1.");
  }
  let wranglerIntegrity;
  try {
    wranglerIntegrity = verifyExceptionalWranglerIntegrity({ repositoryRoot });
  } catch {
    throw cutoverError(
      "WRANGLER_INTEGRITY_FAILED",
      "La integridad pinneada de Wrangler no coincide.",
    );
  }
  return wranglerIntegrity;
}

export function openExceptionalCutoverTty() {
  let descriptor;
  try {
    descriptor = openSync("/dev/tty", "r+");
  } catch {
    throw cutoverError(
      "TTY_REQUIRED",
      "El cutover exige una terminal /dev/tty.",
    );
  }
  let closed = false;
  return Object.freeze({
    readLine({ prompt } = {}) {
      if (closed || typeof prompt !== "string" || prompt.length === 0) {
        throw cutoverError(
          "TTY_INVALID",
          "No se pudo solicitar la confirmación final.",
        );
      }
      writeAll(descriptor, `Escribí exactamente:\n${prompt}\n> `);
      const bytes = [];
      const byte = Buffer.alloc(1);
      try {
        while (bytes.length <= MAX_TTY_LINE_BYTES) {
          const count = readSync(descriptor, byte, 0, 1, null);
          if (count !== 1 || byte[0] === 10 || byte[0] === 13) break;
          bytes.push(byte[0]);
        }
      } finally {
        byte.fill(0);
      }
      if (bytes.length > MAX_TTY_LINE_BYTES) {
        bytes.fill(0);
        throw cutoverError("TTY_TOO_LONG", "La confirmación excede el límite.");
      }
      const buffer = Buffer.from(bytes);
      bytes.fill(0);
      const value = buffer.toString("utf8");
      buffer.fill(0);
      return value;
    },
    close() {
      if (closed) return;
      closeSync(descriptor);
      closed = true;
    },
  });
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function parseWranglerVersionUploadNdjson(
  outputPath,
  { expectedArguments } = {},
) {
  if (
    !Array.isArray(expectedArguments) ||
    expectedArguments.length < 2 ||
    expectedArguments.some((argument) => typeof argument !== "string")
  ) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El argv esperado de Wrangler no es válido.",
    );
  }
  const source = readSecureFile(outputPath, {
    maxBytes: MAX_WRANGLER_OUTPUT_BYTES,
  }).toString("utf8");
  const rawLines = source.split("\n");
  if (rawLines.at(-1) === "") rawLines.pop();
  if (rawLines.length !== 2 || rawLines.some((line) => line.length === 0)) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "Wrangler no produjo exactamente los eventos session y version-upload.",
    );
  }
  let session;
  let event;
  try {
    session = JSON.parse(rawLines[0]);
    event = JSON.parse(rawLines[1]);
  } catch {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El NDJSON de Wrangler no es válido.",
    );
  }
  if (!isPlainObject(session) || !isPlainObject(event)) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El evento de Wrangler no es un objeto.",
    );
  }
  const sessionKeys = Object.keys(session);
  if (
    JSON.stringify(sessionKeys.sort()) !==
      JSON.stringify([...WRANGLER_SESSION_REQUIRED_KEYS].sort()) ||
    session.type !== "wrangler-session" ||
    session.version !== 1 ||
    session.wrangler_version !== EXCEPTIONAL_CUTOVER_WRANGLER_VERSION ||
    !Array.isArray(session.command_line_args) ||
    session.command_line_args.some(
      (argument) => typeof argument !== "string",
    ) ||
    JSON.stringify(session.command_line_args) !==
      JSON.stringify(expectedArguments) ||
    typeof session.log_file_path !== "string" ||
    !path.isAbsolute(session.log_file_path) ||
    CONTROL_OR_BIDI_PATTERN.test(session.log_file_path) ||
    !isCanonicalTimestamp(session.timestamp)
  ) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El evento wrangler-session no coincide con el proceso aprobado.",
    );
  }
  const keys = Object.keys(event);
  if (
    WRANGLER_VERSION_UPLOAD_REQUIRED_KEYS.some((key) => !keys.includes(key)) ||
    keys.some((key) => !WRANGLER_VERSION_UPLOAD_ALLOWED_KEYS.has(key))
  ) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El evento version-upload altera su schema.",
    );
  }
  if (
    event.type !== "version-upload" ||
    event.version !== 1 ||
    event.worker_name !== EXCEPTIONAL_CUTOVER_WORKER_NAME ||
    event.worker_name_overridden !== false ||
    typeof event.worker_tag !== "string" ||
    event.worker_tag.length === 0 ||
    CONTROL_OR_BIDI_PATTERN.test(event.worker_tag) ||
    !VERSION_ID_PATTERN.test(event.version_id ?? "") ||
    !isCanonicalTimestamp(event.timestamp)
  ) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El evento version-upload no es confiable.",
    );
  }
  for (const optionalUrl of [event.preview_url, event.preview_alias_url]) {
    if (
      optionalUrl !== undefined &&
      optionalUrl !== null &&
      typeof optionalUrl !== "string"
    ) {
      throw cutoverError(
        "WRANGLER_OUTPUT_INVALID",
        "El evento contiene URLs inválidas.",
      );
    }
  }
  if (
    event.wrangler_environment !== undefined &&
    event.wrangler_environment !== null &&
    typeof event.wrangler_environment !== "string"
  ) {
    throw cutoverError(
      "WRANGLER_OUTPUT_INVALID",
      "El evento contiene environment inválido.",
    );
  }
  return event.version_id;
}

function consumeWranglerVersionUploadNdjson(outputPath, options) {
  let versionId;
  let parseError = null;
  try {
    versionId = parseWranglerVersionUploadNdjson(outputPath, options);
  } catch (error) {
    parseError = error;
  }
  try {
    unlinkSync(outputPath);
  } catch {
    throw cutoverError(
      "WRANGLER_OUTPUT_CLEANUP_FAILED",
      "No se pudo eliminar el NDJSON efímero de Wrangler.",
    );
  }
  if (parseError !== null) throw parseError;
  return versionId;
}

function removeWranglerOutputIfPresent(outputPath) {
  try {
    unlinkSync(outputPath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw cutoverError(
      "WRANGLER_OUTPUT_CLEANUP_FAILED",
      "No se pudo eliminar el NDJSON efímero de Wrangler.",
    );
  }
}

async function executeExceptionalCutoverStep({
  step,
  expectedStep,
  env,
  cwd,
  abortSignal,
  inheritedLockDescriptor,
} = {}) {
  const errors = validateExceptionalCutoverStep(step, { expectedStep });
  if (errors.length > 0) {
    throw cutoverError(
      "UNSAFE_STEP",
      "El policy produjo un paso de cutover inválido.",
    );
  }
  try {
    await runExceptionalCutoverChildProcess({
      command: step.command,
      arguments: step.arguments,
      stepId: step.id,
      env,
      cwd,
      abortSignal,
      inheritedLockDescriptor,
    });
  } catch (error) {
    if (error instanceof ExceptionalCutoverChildProcessError) {
      throw cutoverError(error.code, error.message);
    }
    throw cutoverError("STEP_FAILED", `Falló ${step.id}.`);
  }
}

function validateAuditIdentity(result, label) {
  if (!isPlainObject(result)) {
    throw cutoverError(
      "AUDIT_INVALID",
      `${label} no devolvió un resultado válido.`,
    );
  }
  assertSafeVersionId(result.activeDeploymentId, `${label} deployment`);
  assertSafeVersionId(result.activeVersionId, `${label} version`);
  return Object.freeze({
    activeDeploymentId: result.activeDeploymentId,
    activeVersionId: result.activeVersionId,
  });
}

async function safeClosedAudit(auditImpl, oauthToken) {
  try {
    return validateAuditIdentity(
      await auditImpl({
        phase: "custom-domains",
        secretStage: "complete",
        oauthToken,
      }),
      "El audit closed",
    );
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw cutoverError(
      "CLOSED_AUDIT_FAILED",
      "El audit GET-only closed falló.",
    );
  }
}

async function safeOpenAudit(auditImpl, oauthToken) {
  try {
    return validateAuditIdentity(
      await auditImpl({ oauthToken }),
      "El audit open",
    );
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw cutoverError("OPEN_AUDIT_FAILED", "El audit GET-only open falló.");
  }
}

async function safeClosedWithOpenCronsAudit(auditImpl, oauthToken) {
  try {
    return validateAuditIdentity(
      await auditImpl({ oauthToken }),
      "El audit transitorio closed con crons open",
    );
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw cutoverError(
      "TRANSITIONAL_AUDIT_FAILED",
      "El audit GET-only transitorio closed con crons open falló.",
    );
  }
}

async function safeAssertRemoteUnused(checkImpl, oauthToken, bundle) {
  try {
    await checkImpl({
      oauthToken,
      head: bundle.request.head,
      requestHash: bundle.requestHash,
      policyVersion: bundle.act.policyVersion,
      policyHash: bundle.act.policyHash,
      actHash: bundle.actHash,
      artifactHash: bundle.artifactHash,
    });
  } catch {
    throw cutoverError(
      "REMOTE_BINDING_PRESENT_OR_UNVERIFIED",
      "El HEAD/acta/artifact ya tiene estado remoto o no pudo verificarse como inédito.",
    );
  }
}

async function safeVerifyRemoteUpload(
  verifyImpl,
  oauthToken,
  bundle,
  versionId,
) {
  try {
    const result = await verifyImpl({
      oauthToken,
      versionId,
      head: bundle.request.head,
      requestHash: bundle.requestHash,
      policyVersion: bundle.act.policyVersion,
      policyHash: bundle.act.policyHash,
      actHash: bundle.actHash,
      artifactHash: bundle.artifactHash,
    });
    if (!isPlainObject(result) || result.versionId !== versionId) {
      throw new Error();
    }
    return Object.freeze({ versionId });
  } catch {
    throw cutoverError(
      "REMOTE_UPLOAD_BINDING_UNVERIFIED",
      "La versión subida no quedó ligada de forma única a HEAD/acta/artifact.",
    );
  }
}

async function safeFindRemoteBindings(findImpl, oauthToken, bundle) {
  try {
    const result = await findImpl({
      oauthToken,
      head: bundle.request.head,
      requestHash: bundle.requestHash,
      policyVersion: bundle.act.policyVersion,
      policyHash: bundle.act.policyHash,
      actHash: bundle.actHash,
      artifactHash: bundle.artifactHash,
    });
    if (
      !isPlainObject(result) ||
      !Number.isInteger(result.checkedVersionCount) ||
      result.checkedVersionCount < 0 ||
      !Array.isArray(result.versionIds) ||
      result.versionIds.some(
        (versionId) => !VERSION_ID_PATTERN.test(versionId ?? ""),
      ) ||
      new Set(result.versionIds).size !== result.versionIds.length ||
      result.versionIds.length > result.checkedVersionCount
    ) {
      throw new Error();
    }
    return Object.freeze({
      checkedVersionCount: result.checkedVersionCount,
      versionIds: Object.freeze([...result.versionIds]),
    });
  } catch {
    throw cutoverError(
      "REMOTE_BINDING_SCAN_FAILED",
      "No se pudo clasificar el binding remoto del upload.",
    );
  }
}

async function readBundle({
  requestPath,
  repositoryRoot,
  currentHead,
  now,
  readRequestImpl,
  readActImpl,
  readArtifactImpl,
  readIssuanceImpl,
  stateRoot,
  expectedActHash,
}) {
  let request;
  let act;
  let artifactManifest;
  let issuance;
  try {
    request = await readRequestImpl({
      requestPath,
      worktreeRoot: repositoryRoot,
      currentHead,
      now,
    });
    const actPath = deriveExceptionalReleaseActPaths(requestPath).jsonPath;
    act = await readActImpl({
      actPath,
      worktreeRoot: repositoryRoot,
      currentHead,
      now,
    });
    if (
      act.contentSha256 !== exceptionalReleaseActContentHash(act) ||
      !SHA256_PATTERN.test(act.contentSha256)
    ) {
      throw new Error();
    }
    const requestHash = exceptionalReleaseRequestHash(request);
    artifactManifest = await readArtifactImpl({
      requestPath,
      worktreeRoot: repositoryRoot,
      expectedHead: currentHead,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: requestHash,
      expectedArtifactHash: act.artifactHash,
    });
    ({ issuance } = await readIssuanceImpl({
      requestPath,
      stateRoot,
      request,
      act,
      artifactManifest,
      expectedActHash,
    }));
    let openUpdate = {};
    if (request.releaseMode === "OPEN_UPDATE") {
      const recoveryArtifactManifest = await readArtifactImpl({
        requestPath,
        worktreeRoot: repositoryRoot,
        artifactPurpose: "recovery",
        expectedHead: currentHead,
        expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
        expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
        expectedRequestHash: requestHash,
        expectedArtifactHash: artifactManifest.recoveryArtifactHash,
      });
      const openUpdateEvidence = await readExceptionalOpenUpdateEvidence({
        requestPath,
        repositoryRoot,
        request,
        artifactManifest,
        expectedCertificateHash: act.openUpdateEvidenceHash,
        now,
      });
      openUpdate = {
        recoveryArtifactManifest,
        openUpdateEvidence,
        recoveryArtifactRoot: deriveExceptionalReleaseArtifactPaths(
          requestPath,
          { artifactPurpose: "recovery" },
        ).artifactRoot,
      };
    }
    return Object.freeze({
      request,
      act,
      artifactManifest,
      issuance,
      issuanceHash: issuance.contentSha256,
      requestHash,
      actHash: act.contentSha256,
      artifactHash: act.artifactHash,
      artifactRoot:
        deriveExceptionalReleaseArtifactPaths(requestPath).artifactRoot,
      ...openUpdate,
    });
  } catch {
    throw cutoverError(
      "BUNDLE_READ_FAILED",
      "Request, acta o artifact no superaron la lectura segura.",
    );
  }
}

function assertBundle({
  bundle,
  currentHead,
  now,
  claimExists,
  expectedActHash,
}) {
  try {
    assertExceptionalCutoverBundle({
      request: bundle.request,
      act: bundle.act,
      artifactManifest: bundle.artifactManifest,
      issuance: bundle.issuance,
      expectedActHash,
      currentHead,
      now,
      nodeVersion: process.versions.node,
      wranglerVersion: EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
      claimExists,
    });
  } catch {
    throw cutoverError(
      "BUNDLE_INVALID",
      "El bundle excepcional no autoriza el cutover.",
    );
  }
}

function assertSameBundle(initial, current) {
  if (
    initial.requestHash !== current.requestHash ||
    initial.actHash !== current.actHash ||
    initial.artifactHash !== current.artifactHash ||
    initial.issuanceHash !== current.issuanceHash ||
    initial.act.openUpdateEvidenceHash !== current.act.openUpdateEvidenceHash ||
    initial.recoveryArtifactManifest?.contentSha256 !==
      current.recoveryArtifactManifest?.contentSha256 ||
    initial.request.head !== current.request.head
  ) {
    throw cutoverError(
      "BUNDLE_CHANGED",
      "El bundle cambió antes de la mutación.",
    );
  }
}

function createClaimPayload({
  bundle,
  closedState,
  recoveryCapsule,
  confirmedPhrase,
  now,
}) {
  const payload = {
    schemaVersion: EXCEPTIONAL_CUTOVER_CLAIM_SCHEMA_VERSION,
    state: "claimed-before-deploy",
    head: bundle.request.head,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash: bundle.requestHash,
    actHash: bundle.actHash,
    artifactHash: bundle.artifactHash,
    issuanceHash: bundle.issuanceHash,
    recoveryCapsuleHash: recoveryCapsule.capsuleHash,
    closedDeploymentId: closedState.activeDeploymentId,
    closedVersionId: closedState.activeVersionId,
    confirmationSha256: sha256(Buffer.from(confirmedPhrase, "utf8")),
    claimedAtUtc: now.toISOString(),
  };
  if (bundle.request.releaseMode === "OPEN_UPDATE") {
    payload.schemaVersion = EXCEPTIONAL_OPEN_UPDATE_CLAIM_SCHEMA_VERSION;
    delete payload.closedDeploymentId;
    delete payload.closedVersionId;
    Object.assign(payload, {
      releaseMode: "OPEN_UPDATE",
      openSourceBaselineSha256: bundle.request.openSourceBaselineSha256,
      openUpdateEvidenceHash: bundle.act.openUpdateEvidenceHash,
      sourceDeploymentId: closedState.activeDeploymentId,
      sourceVersionId: closedState.activeVersionId,
      recoveryBindings: recoveryCapsule.expectedBindings,
    });
  }
  return Object.freeze({
    ...payload,
    contentSha256: canonicalContentHash(payload),
  });
}

function normalizedRemoteUploadBinding(value) {
  const statuses = ["AMBIGUOUS", "NONE", "NOT_VERIFIED", "UNIQUE"];
  if (
    !isPlainObject(value) ||
    !statuses.includes(value.status) ||
    !Array.isArray(value.versionIds) ||
    value.versionIds.some(
      (versionId) => !VERSION_ID_PATTERN.test(versionId ?? ""),
    ) ||
    new Set(value.versionIds).size !== value.versionIds.length ||
    (value.status === "NONE" && value.versionIds.length !== 0) ||
    (value.status === "UNIQUE" && value.versionIds.length !== 1) ||
    (value.status === "AMBIGUOUS" && value.versionIds.length < 2) ||
    (value.status === "NOT_VERIFIED" && value.versionIds.length !== 0)
  ) {
    throw cutoverError(
      "INVALID_REMOTE_BINDING_STATE",
      "El estado saneado del binding remoto no es válido.",
    );
  }
  return Object.freeze({
    status: value.status,
    versionIds: Object.freeze([...value.versionIds]),
  });
}

function createReceiptPayload({
  outcome,
  bundle,
  claim,
  baselineClosedState,
  finalClosedState,
  openState,
  openVersionId,
  remoteUploadBinding,
  steps,
  completedAt,
}) {
  const normalizedRemoteBinding =
    normalizedRemoteUploadBinding(remoteUploadBinding);
  const payload = {
    schemaVersion: EXCEPTIONAL_CUTOVER_RECEIPT_SCHEMA_VERSION,
    outcome,
    head: bundle.request.head,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash: bundle.requestHash,
    actHash: bundle.actHash,
    artifactHash: bundle.artifactHash,
    issuanceHash: bundle.issuanceHash,
    worker_name: EXCEPTIONAL_CUTOVER_WORKER_NAME,
    worker_name_overridden: false,
    claimHash: claim.contentSha256,
    baselineClosedDeploymentId: baselineClosedState.activeDeploymentId,
    baselineClosedVersionId: baselineClosedState.activeVersionId,
    closedDeploymentId:
      finalClosedState?.activeDeploymentId ??
      baselineClosedState.activeDeploymentId,
    closedVersionId:
      finalClosedState?.activeVersionId ?? baselineClosedState.activeVersionId,
    finalClosedDeploymentId: finalClosedState?.activeDeploymentId ?? null,
    finalClosedVersionId: finalClosedState?.activeVersionId ?? null,
    openDeploymentId: openState?.activeDeploymentId ?? null,
    openVersionId: openVersionId ?? null,
    remoteUploadBinding: {
      status: normalizedRemoteBinding.status,
      versionIds: [...normalizedRemoteBinding.versionIds],
    },
    steps: steps.map(({ id, status }) => ({ id, status })),
    completedAtUtc: completedAt.toISOString(),
  };
  if (bundle.request.releaseMode === "OPEN_UPDATE") {
    payload.schemaVersion = EXCEPTIONAL_OPEN_UPDATE_RECEIPT_SCHEMA_VERSION;
    for (const key of [
      "baselineClosedDeploymentId",
      "baselineClosedVersionId",
      "closedDeploymentId",
      "closedVersionId",
      "finalClosedDeploymentId",
      "finalClosedVersionId",
    ])
      delete payload[key];
    Object.assign(payload, {
      releaseMode: "OPEN_UPDATE",
      openUpdateEvidenceHash: bundle.act.openUpdateEvidenceHash,
      openSourceBaselineSha256: bundle.request.openSourceBaselineSha256,
      sourceDeploymentId: baselineClosedState.activeDeploymentId,
      sourceVersionId: baselineClosedState.activeVersionId,
      recoveredDeploymentId: finalClosedState?.activeDeploymentId ?? null,
      recoveredVersionId: finalClosedState?.activeVersionId ?? null,
      recoveryCapsuleHash: claim.recoveryCapsuleHash,
      recoveryArtifactHash: claim.recoveryBindings.recoveryArtifactHash,
      recoveryVersionId: claim.recoveryBindings.recoveryVersionId,
      cronsPreserved: true,
    });
  }
  return Object.freeze({
    ...payload,
    contentSha256: canonicalContentHash(payload),
  });
}

function writeCanonicalExclusive(filePath, value) {
  const source = canonicalJson(value);
  if (/"(?:stdout|stderr|token)"\s*:/i.test(source)) {
    throw cutoverError(
      "UNSAFE_RECEIPT",
      "El estado intentó registrar material prohibido.",
    );
  }
  writeExclusiveFile(filePath, source);
}

function assertCanonicalStateFile(filePath, expectedValue, label) {
  let source;
  try {
    source = readSecureFile(filePath, {
      maxBytes: MAX_CUTOVER_STATE_BYTES,
    }).toString("utf8");
  } catch {
    throw cutoverError(
      "STATE_CHANGED",
      `${label} no conserva su archivo seguro.`,
    );
  }
  if (source !== canonicalJson(expectedValue)) {
    throw cutoverError(
      "STATE_CHANGED",
      `${label} cambió antes de la mutación.`,
    );
  }
}

function assertOpenRecoveryDirectory(directoryPath) {
  const metadata = lstatSync(directoryPath);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o7777) !== 0o700 ||
    metadata.uid !== process.getuid() ||
    realpathSync(directoryPath) !== path.resolve(directoryPath)
  ) {
    throw cutoverError(
      "UNSAFE_OPEN_RECOVERY_DIRECTORY",
      "El directorio de recuperación OPEN no es seguro.",
    );
  }
  return metadata;
}

function readExceptionalOpenUpdateEvidence({
  requestPath,
  repositoryRoot,
  request,
  artifactManifest,
  expectedCertificateHash,
  now,
}) {
  assertSafeHash(expectedCertificateHash, "openUpdateEvidenceHash");
  return readOpenUpdateEvidenceFile({
    requestPath,
    worktreeRoot: repositoryRoot,
    request,
    artifactManifest,
    expectedCertificateHash,
    now,
    requirePromotionReady: true,
  });
}

function openRecoveryRoot(stateRoot, expectedBindings) {
  assertOpenRecoveryDirectory(stateRoot);
  assertSafeHash(expectedBindings.requestHash, "requestHash");
  assertSafeHash(expectedBindings.expectedCapsuleHash, "capsuleHash");
  return path.join(
    stateRoot,
    `${expectedBindings.requestHash}.${expectedBindings.expectedCapsuleHash}.open-capsule`,
  );
}

export function readPublishedExceptionalOpenRecoveryCapsule({
  stateRoot,
  expectedBindings,
}) {
  const capsuleRoot = openRecoveryRoot(stateRoot, expectedBindings);
  const before = assertOpenRecoveryDirectory(capsuleRoot);
  const expectedFiles = [
    "capsule.json",
    "exceptional-release-empty.env",
    "wrangler.traffic.jsonc",
  ];
  if (
    JSON.stringify(readdirSync(capsuleRoot).sort()) !==
    JSON.stringify(expectedFiles)
  ) {
    throw cutoverError(
      "OPEN_RECOVERY_TREE_CHANGED",
      "La cápsula OPEN contiene archivos faltantes o adicionales.",
    );
  }
  const raw = readSecureFile(path.join(capsuleRoot, "capsule.json"), {
    maxBytes: MAX_CUTOVER_STATE_BYTES,
  }).toString("utf8");
  const manifest = assertExceptionalOpenRecoveryCapsule(
    JSON.parse(raw),
    expectedBindings,
  );
  if (raw !== canonicalJson(manifest))
    throw cutoverError(
      "NONCANONICAL_OPEN_CAPSULE",
      "La cápsula OPEN no es canónica.",
    );
  const sources = Object.fromEntries(
    manifest.files.map(({ path: filePath }) => [
      filePath,
      readSecureFile(path.join(capsuleRoot, filePath), {
        maxBytes: 1024 * 1024,
        allowEmpty: filePath === "exceptional-release-empty.env",
      }).toString("utf8"),
    ]),
  );
  assertExceptionalOpenRecoveryFiles({
    capsuleManifest: manifest,
    expectedBindings,
    sources,
  });
  const after = assertOpenRecoveryDirectory(capsuleRoot);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs ||
    JSON.stringify(readdirSync(capsuleRoot).sort()) !==
      JSON.stringify(expectedFiles)
  )
    throw cutoverError(
      "OPEN_RECOVERY_TREE_CHANGED",
      "La cápsula OPEN fue sustituida.",
    );
  return Object.freeze({
    capsuleRoot,
    manifest,
    capsuleHash: manifest.contentSha256,
    expectedBindings: Object.freeze({ ...expectedBindings }),
    sources,
  });
}

export function publishExceptionalOpenRecoveryCapsule({
  stateRoot,
  capsuleManifest,
  expectedBindings,
  sources,
}) {
  const manifest = assertExceptionalOpenRecoveryFiles({
    capsuleManifest,
    expectedBindings,
    sources,
  });
  const capsuleRoot = openRecoveryRoot(stateRoot, expectedBindings);
  mkdirSync(capsuleRoot, { mode: 0o700 });
  assertOpenRecoveryDirectory(capsuleRoot);
  for (const file of manifest.files)
    writeExclusiveFile(path.join(capsuleRoot, file.path), sources[file.path]);
  writeCanonicalExclusive(path.join(capsuleRoot, "capsule.json"), manifest);
  const parentFd = openSync(
    stateRoot,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  try {
    fsyncSync(parentFd);
  } finally {
    closeSync(parentFd);
  }
  return readPublishedExceptionalOpenRecoveryCapsule({
    stateRoot,
    expectedBindings,
  });
}

async function auditOpenUpdateSource({
  bundle,
  oauthToken,
  now,
  collectImpl = collectCloudflareState,
}) {
  const snapshot = await collectImpl({
    fetchImpl: globalThis.fetch,
    oauthToken,
  });
  return assertOpenUpdateCertifiedSourceSnapshot({
    certificate: bundle.openUpdateEvidence,
    expectedCertificateHash: bundle.act.openUpdateEvidenceHash,
    request: bundle.request,
    artifactManifest: bundle.artifactManifest,
    snapshot,
    now,
  });
}

async function verifyOpenRecoveryVersion({
  recoveryCapsule,
  oauthToken,
  now,
  fetchImpl = globalThis.fetch,
}) {
  const manifest = recoveryCapsule.manifest;
  const evidence = manifest.recoveryUploadEvidence;
  const endpoint = `/accounts/${EXCEPTIONAL_CUTOVER_ACCOUNT_ID}/workers/scripts/${EXCEPTIONAL_CUTOVER_WORKER_NAME}/versions/${manifest.recoveryVersionId}`;
  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4${endpoint}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status !== 200) throw new Error();
    const body = await readD72BoundedCloudflareJsonResponse(
      response,
      2 * 1024 * 1024,
    );
    return assertD72OpenRecoveryVersionGet(
      {
        method: "GET",
        endpoint,
        status: 200,
        body,
        observedAtUtc: now.toISOString(),
      },
      {
        recoveryVersionId: manifest.recoveryVersionId,
        versionScriptEtag: evidence.versionScriptEtag,
        tag: evidence.tag,
        message: evidence.message,
        uploadedAtUtc: evidence.uploadedAtUtc,
        now,
      },
    );
  } catch {
    throw cutoverError(
      "OPEN_RECOVERY_VERSION_UNVERIFIED",
      "El GET del fallback no coincide con su versión, código y configuración certificados.",
    );
  }
}

function finalOpenRecoveryBindings(manifest) {
  return Object.fromEntries([
    ...[
      "recoveryScope",
      "head",
      "requestHash",
      "actHash",
      "issuanceHash",
      "artifactHash",
      "openSourceBaselineSha256",
      "sourceVersionId",
      "sourceDeploymentId",
      "recoveryVersionId",
      "recoveryArtifactHash",
      "compatibilitySha256",
      "recoveryUploadEvidenceSha256",
    ].map((key) => [key, manifest[key]]),
    ["expectedCapsuleHash", manifest.contentSha256],
  ]);
}

function prepareFinalOpenRecoveryCapsule({ bundle, stateRoot, now }) {
  const canary = assertExceptionalOpenRecoveryCapsule(
    bundle.openUpdateEvidence.recoveryCapsuleManifest,
    bundle.openUpdateEvidence.recoveryExpectedBindings,
  );
  if (
    canary.recoveryScope !== "CANARY_ONLY" ||
    canary.recoveryArtifactHash !==
      bundle.recoveryArtifactManifest.contentSha256
  ) {
    throw cutoverError(
      "OPEN_RECOVERY_EVIDENCE_MISMATCH",
      "El fallback del canary no pertenece al artefacto de recuperación final.",
    );
  }
  const sources = Object.fromEntries(
    canary.files.map(({ path: filePath }) => [
      filePath,
      readSecureFile(path.join(bundle.recoveryArtifactRoot, filePath), {
        maxBytes: 1024 * 1024,
        allowEmpty: filePath === "exceptional-release-empty.env",
      }).toString("utf8"),
    ]),
  );
  const manifest = rebindExceptionalOpenRecoveryCapsuleForFinalRelease({
    canaryCapsule: canary,
    canaryExpectedBindings: bundle.openUpdateEvidence.recoveryExpectedBindings,
    actHash: bundle.actHash,
    issuanceHash: bundle.issuanceHash,
    createdAtUtc: now.toISOString(),
  });
  return publishExceptionalOpenRecoveryCapsule({
    stateRoot,
    capsuleManifest: manifest,
    expectedBindings: finalOpenRecoveryBindings(manifest),
    sources,
  });
}

async function executeGeneratedStep({
  expectedStep,
  executeStepImpl,
  childEnv,
  stateRoot,
  artifactRoot,
  abortSignal,
  operationLock,
}) {
  assertOpenOperationLock(operationLock);
  let wranglerIntegrity;
  try {
    wranglerIntegrity = verifyExceptionalWranglerIntegrity({
      repositoryRoot: REPOSITORY_ROOT,
    });
    if (
      realpathSync(expectedStep?.arguments?.[0] ?? "") !==
      wranglerIntegrity.executionEntrypointRealpath
    ) {
      throw new Error();
    }
  } catch {
    throw cutoverError(
      "WRANGLER_INTEGRITY_FAILED",
      "Wrangler cambió antes del paso de cutover.",
    );
  }
  assertNoWranglerDeployConfigInAncestors([stateRoot, artifactRoot]);
  const step = Object.freeze({
    id: expectedStep?.id,
    command: expectedStep?.command,
    arguments: Object.freeze([...(expectedStep?.arguments ?? [])]),
    shell: expectedStep?.shell,
  });
  const errors = validateExceptionalCutoverStep(step, { expectedStep });
  if (errors.length > 0) {
    throw cutoverError(
      "UNSAFE_STEP",
      "El policy produjo un paso no permitido.",
    );
  }
  try {
    await executeStepImpl({
      step,
      expectedStep,
      env: childEnv,
      cwd: stateRoot,
      abortSignal,
      inheritedLockDescriptor: operationLock.descriptor,
    });
  } catch (error) {
    if (error instanceof ExceptionalCutoverError) throw error;
    throw cutoverError(
      "STEP_FAILED",
      `El paso ${step.id} falló o quedó incierto.`,
    );
  }
}

async function attemptRollback({
  bundle,
  stateRoot,
  closedState,
  repositoryRoot,
  executeStepImpl,
  baseChildEnv,
  auditClosedImpl,
  oauthToken,
  stepRecords,
  recoveryCapsule,
  readRecoveryCapsuleImpl,
  operationLock,
  collectRecoveryStateImpl = collectCloudflareState,
  verifyOpenRecoveryVersionImpl = verifyOpenRecoveryVersion,
  nowImpl = () => new Date(),
  knownOpenVersionId = null,
}) {
  if (bundle.request.releaseMode === "OPEN_UPDATE") {
    let auditedState = null;
    try {
      assertOpenOperationLock(operationLock);
      const durable = readPublishedExceptionalOpenRecoveryCapsule({
        stateRoot,
        expectedBindings: recoveryCapsule.expectedBindings,
      });
      const guard = () => ({
        claim: {
          sourceVersionId: closedState.activeVersionId,
          sourceDeploymentId: closedState.activeDeploymentId,
        },
        recoveryCapsule: durable,
        matchingVersionIds: knownOpenVersionId ? [knownOpenVersionId] : [],
        now: nowFrom(nowImpl),
      });
      const before = validateExceptionalOpenRecoveryActiveState({
        ...guard(),
        snapshot: await collectRecoveryStateImpl({
          fetchImpl: globalThis.fetch,
          oauthToken,
        }),
      });
      await verifyOpenRecoveryVersionImpl({
        recoveryCapsule: durable,
        oauthToken,
        now: nowFrom(nowImpl),
      });
      const [step] = createExceptionalOpenRecoveryPlan({
        repositoryRoot,
        capsuleRoot: durable.capsuleRoot,
        stateRoot,
        nodeExecutable: process.execPath,
        capsuleManifest: durable.manifest,
        expectedBindings: durable.expectedBindings,
      });
      readPublishedExceptionalOpenRecoveryCapsule({
        stateRoot,
        expectedBindings: durable.expectedBindings,
      });
      const latest = validateExceptionalOpenRecoveryActiveState({
        ...guard(),
        snapshot: await collectRecoveryStateImpl({
          fetchImpl: globalThis.fetch,
          oauthToken,
        }),
      });
      if (
        latest.activeVersionId !== before.activeVersionId ||
        latest.activeDeploymentId !== before.activeDeploymentId
      ) {
        throw cutoverError(
          "OPEN_RECOVERY_REMOTE_CHANGED",
          "El release activo cambió antes de la recuperación automática.",
        );
      }
      await executeGeneratedStep({
        expectedStep: step,
        executeStepImpl,
        childEnv: baseChildEnv,
        stateRoot,
        artifactRoot: durable.capsuleRoot,
        operationLock,
      });
      stepRecords.push({ id: step.id, status: "PASS" });
      assertOpenOperationLock(operationLock);
      const snapshot = await collectRecoveryStateImpl({
        fetchImpl: globalThis.fetch,
        oauthToken,
      });
      const verified = assertExceptionalOpenRecoveredState({
        capsuleManifest: durable.manifest,
        expectedBindings: durable.expectedBindings,
        snapshot,
        observedAtUtc: nowFrom(nowImpl).toISOString(),
      });
      auditedState = {
        activeDeploymentId: verified.deploymentId,
        activeVersionId: verified.recoveryVersionId,
      };
      return Object.freeze({ confirmed: true, auditedState });
    } catch {
      stepRecords.push({ id: "confirm-open-recovery", status: "FAIL" });
      return Object.freeze({ confirmed: false, auditedState });
    }
  }
  const rollbackPlan = createExceptionalClosedRecoveryPlan({
    repositoryRoot,
    capsuleRoot: recoveryCapsule.capsuleRoot,
    stateRoot,
    nodeExecutable: process.execPath,
    capsuleManifest: recoveryCapsule.manifest,
  });
  let stepsPassed = true;
  for (const step of rollbackPlan) {
    try {
      assertOpenOperationLock(operationLock);
      await readRecoveryCapsuleImpl({
        stateRoot,
        requestHash: bundle.requestHash,
        actHash: bundle.actHash,
        issuanceHash: bundle.issuanceHash,
        artifactHash: bundle.artifactHash,
        closedDeploymentId: closedState.activeDeploymentId,
        closedVersionId: closedState.activeVersionId,
        head: bundle.request.head,
        expectedCapsuleHash: recoveryCapsule.capsuleHash,
      });
      await executeGeneratedStep({
        expectedStep: step,
        executeStepImpl,
        childEnv: baseChildEnv,
        stateRoot,
        artifactRoot: recoveryCapsule.capsuleRoot,
        operationLock,
      });
      stepRecords.push({ id: step.id, status: "PASS" });
    } catch {
      stepsPassed = false;
      stepRecords.push({ id: step.id, status: "FAIL" });
    }
  }
  let auditedState = null;
  try {
    assertOpenOperationLock(operationLock);
    auditedState = await safeClosedAudit(auditClosedImpl, oauthToken);
  } catch {
    // La confirmación final queda en false.
  }
  const confirmed =
    stepsPassed &&
    auditedState?.activeVersionId === closedState.activeVersionId;
  return Object.freeze({ confirmed, auditedState });
}

async function runExceptionalOpenCutoverInternal(
  {
    argv = process.argv.slice(2),
    repositoryRoot = REPOSITORY_ROOT,
    stateRoot,
    env = process.env,
    nowImpl = () => new Date(),
    readGitStateImpl = readRecoverableGitState,
    readRequestImpl = readExceptionalReleaseRequestFile,
    readActImpl = readExceptionalReleaseActFile,
    readArtifactImpl = readExceptionalReleaseArtifactManifest,
    readIssuanceImpl = readExceptionalActIssuance,
    createRecoveryCapsuleImpl = createExceptionalClosedRecoveryCapsule,
    readRecoveryCapsuleImpl = readExceptionalClosedRecoveryCapsule,
    loadOAuthTokenImpl = loadWranglerOAuthToken,
    auditClosedImpl = runCloudflareClosedStateCheck,
    auditClosedWithOpenCronsImpl = runCloudflareClosedWithOpenCronsStateCheck,
    auditOpenImpl = runCloudflareOpenStateCheck,
    assertRemoteUnusedImpl = assertExceptionalCutoverRemoteUnused,
    findRemoteBindingsImpl = findExceptionalCutoverRemoteBindings,
    verifyRemoteUploadImpl = verifyExceptionalCutoverRemoteUpload,
    openTtyImpl = openExceptionalCutoverTty,
    executeStepImpl = executeExceptionalCutoverStep,
    auditOpenSourceImpl = auditOpenUpdateSource,
    collectRecoveryStateImpl = collectCloudflareState,
    verifyOpenRecoveryVersionImpl = verifyOpenRecoveryVersion,
  } = {},
  capability,
) {
  if (capability !== PRODUCTION_CUTOVER_CAPABILITY) {
    throw cutoverError(
      "SEALED_PRODUCTION_ENTRYPOINT",
      "La ruta productiva de cutover no admite invocación programática.",
    );
  }
  const { requestPath, expectedActHash } =
    parseExceptionalCutoverArguments(argv);
  assertExactRuntime(repositoryRoot);
  const resolvedStateRoot = stateRoot ?? resolveExceptionalCutoverStateRoot();
  const securedState = ensureExceptionalCutoverStateRoot({
    stateRoot: resolvedStateRoot,
    worktreeRoot: repositoryRoot,
  });
  const gitEnvironment = selectRecoverableGitEnvironment(env);
  const firstGit = await readGitStateImpl({
    repositoryRoot,
    environment: gitEnvironment,
  });
  const initialNow = nowFrom(nowImpl);
  const initialBundle = await readBundle({
    requestPath,
    repositoryRoot,
    currentHead: firstGit.head,
    now: initialNow,
    readRequestImpl,
    readActImpl,
    readArtifactImpl,
    readIssuanceImpl,
    stateRoot: securedState.stateRoot,
    expectedActHash,
  });
  if (initialBundle.actHash !== initialBundle.act.contentSha256) {
    throw cutoverError(
      "ACT_HASH_MISMATCH",
      "actHash no coincide con contentSha256.",
    );
  }
  const openUpdate = initialBundle.request.releaseMode === "OPEN_UPDATE";
  const auditSource = (bundle) =>
    openUpdate
      ? auditOpenSourceImpl({ bundle, oauthToken, now: nowFrom(nowImpl) })
      : safeClosedAudit(auditClosedImpl, oauthToken);
  const statePaths = deriveExceptionalCutoverStatePaths({
    stateRoot: securedState.stateRoot,
    requestHash: initialBundle.requestHash,
  });
  const claimExists = pathExists(statePaths.claimPath);
  if (claimExists) {
    throw cutoverError(
      "ACT_CONSUMED",
      "El acta ya tiene un claim y está consumida.",
    );
  }
  assertBundle({
    bundle: initialBundle,
    currentHead: firstGit.head,
    now: initialNow,
    claimExists,
    expectedActHash,
  });
  if (pathExists(statePaths.outputPath) || pathExists(statePaths.receiptPath)) {
    throw cutoverError(
      "STATE_COLLISION",
      "Existe estado previo incierto para esta acta.",
    );
  }
  assertNoWranglerDeployConfigInAncestors([
    repositoryRoot,
    securedState.stateRoot,
    initialBundle.artifactRoot,
  ]);

  const baseChildEnv = exceptionalCutoverChildEnvironment(env);
  let oauthToken;
  try {
    oauthToken = await loadOAuthTokenImpl({
      cwd: repositoryRoot,
      env: baseChildEnv,
      nodeExecutable: process.execPath,
      wranglerEntrypoint: path.join(
        repositoryRoot,
        "node_modules",
        "wrangler",
        "wrangler-dist",
        "cli.js",
      ),
    });
  } catch {
    throw cutoverError(
      "OAUTH_FAILED",
      "Wrangler no pudo resolver OAuth por keyring.",
    );
  }
  const initialClosed = await auditSource(initialBundle);
  await safeAssertRemoteUnused(
    assertRemoteUnusedImpl,
    oauthToken,
    initialBundle,
  );
  const confirmation = exceptionalCutoverConfirmationPhrase(
    initialBundle.request.head,
    initialBundle.actHash,
  );
  const finalGit = await readGitStateImpl({
    repositoryRoot,
    environment: gitEnvironment,
  });
  if (finalGit.head !== firstGit.head) {
    throw cutoverError("HEAD_CHANGED", "HEAD cambió antes del cutover.");
  }
  const finalNow = nowFrom(nowImpl);
  const finalBundle = await readBundle({
    requestPath,
    repositoryRoot,
    currentHead: finalGit.head,
    now: finalNow,
    readRequestImpl,
    readActImpl,
    readArtifactImpl,
    readIssuanceImpl,
    stateRoot: securedState.stateRoot,
    expectedActHash,
  });
  assertSameBundle(initialBundle, finalBundle);
  const finalClaimExists = pathExists(statePaths.claimPath);
  if (finalClaimExists) {
    throw cutoverError(
      "ACT_CONSUMED",
      "El acta fue consumida concurrentemente.",
    );
  }
  assertBundle({
    bundle: finalBundle,
    currentHead: finalGit.head,
    now: finalNow,
    claimExists: finalClaimExists,
    expectedActHash,
  });
  assertNoWranglerDeployConfigInAncestors([
    repositoryRoot,
    securedState.stateRoot,
    finalBundle.artifactRoot,
  ]);
  const finalClosed = await auditSource(finalBundle);
  if (
    finalClosed.activeDeploymentId !== initialClosed.activeDeploymentId ||
    finalClosed.activeVersionId !== initialClosed.activeVersionId
  ) {
    throw cutoverError(
      "CLOSED_STATE_CHANGED",
      "El estado closed cambió antes del cutover.",
    );
  }
  await safeAssertRemoteUnused(assertRemoteUnusedImpl, oauthToken, finalBundle);

  const operationLock = acquireOpenOperationLock({
    stateRoot: securedState.stateRoot,
    requestHash: finalBundle.requestHash,
    actHash: finalBundle.actHash,
    head: finalBundle.request.head,
    now: nowFrom(nowImpl),
  });
  let terminalReceiptWritten = false;
  try {
    assertOpenOperationLock(operationLock);
    const lockedGit = await readGitStateImpl({
      repositoryRoot,
      environment: gitEnvironment,
    });
    if (lockedGit.head !== finalGit.head || pathExists(statePaths.claimPath)) {
      throw cutoverError(
        "CUTOVER_STATE_CHANGED",
        "Git o el claim cambiaron antes de publicar el claim.",
      );
    }
    assertBundle({
      bundle: finalBundle,
      currentHead: lockedGit.head,
      now: nowFrom(nowImpl),
      claimExists: false,
      expectedActHash,
    });
    assertNoWranglerDeployConfigInAncestors([
      repositoryRoot,
      securedState.stateRoot,
      finalBundle.artifactRoot,
    ]);
    const lockedClosed = await auditSource(finalBundle);
    if (
      lockedClosed.activeDeploymentId !== finalClosed.activeDeploymentId ||
      lockedClosed.activeVersionId !== finalClosed.activeVersionId
    ) {
      throw cutoverError(
        "CLOSED_STATE_CHANGED",
        "El estado closed cambió antes de publicar el claim.",
      );
    }
    await safeAssertRemoteUnused(
      assertRemoteUnusedImpl,
      oauthToken,
      finalBundle,
    );

    const commonPlan = {
      repositoryRoot,
      artifactRoot: finalBundle.artifactRoot,
      stateRoot: securedState.stateRoot,
      nodeExecutable: process.execPath,
      head: finalBundle.request.head,
      act: finalBundle.act,
      artifactManifest: finalBundle.artifactManifest,
    };
    const [uploadStep, cronsStep] = createExceptionalCutoverPlan(commonPlan);

    let recoveryCapsule;
    try {
      assertOpenOperationLock(operationLock);
      await readArtifactImpl({
        requestPath,
        worktreeRoot: repositoryRoot,
        expectedHead: finalGit.head,
        expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
        expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
        expectedRequestHash: finalBundle.requestHash,
        expectedArtifactHash: finalBundle.artifactHash,
      });
      recoveryCapsule = openUpdate
        ? prepareFinalOpenRecoveryCapsule({
            bundle: finalBundle,
            stateRoot: securedState.stateRoot,
            now: nowFrom(nowImpl),
          })
        : await createRecoveryCapsuleImpl({
            stateRoot: securedState.stateRoot,
            artifactRoot: finalBundle.artifactRoot,
            artifactManifest: finalBundle.artifactManifest,
            requestHash: finalBundle.requestHash,
            actHash: finalBundle.actHash,
            issuanceHash: finalBundle.issuanceHash,
            artifactHash: finalBundle.artifactHash,
            closedDeploymentId: finalClosed.activeDeploymentId,
            closedVersionId: finalClosed.activeVersionId,
            head: finalBundle.request.head,
            now: finalNow,
          });
    } catch {
      throw cutoverError(
        "RECOVERY_CAPSULE_FAILED",
        openUpdate
          ? "No se pudo sellar el fallback OPEN antes del claim."
          : "No se pudo sellar la cápsula CLOSED antes del claim.",
      );
    }
    try {
      assertOpenOperationLock(operationLock);
      const durableRecoveryCapsule = openUpdate
        ? readPublishedExceptionalOpenRecoveryCapsule({
            stateRoot: securedState.stateRoot,
            expectedBindings: recoveryCapsule.expectedBindings,
          })
        : await readRecoveryCapsuleImpl({
            stateRoot: securedState.stateRoot,
            requestHash: finalBundle.requestHash,
            actHash: finalBundle.actHash,
            issuanceHash: finalBundle.issuanceHash,
            artifactHash: finalBundle.artifactHash,
            closedDeploymentId: lockedClosed.activeDeploymentId,
            closedVersionId: lockedClosed.activeVersionId,
            head: finalBundle.request.head,
            expectedCapsuleHash: recoveryCapsule.capsuleHash,
          });
      if (
        durableRecoveryCapsule.capsuleRoot !== recoveryCapsule.capsuleRoot ||
        durableRecoveryCapsule.publicationPath !==
          recoveryCapsule.publicationPath ||
        durableRecoveryCapsule.capsuleHash !== recoveryCapsule.capsuleHash ||
        canonicalJson(durableRecoveryCapsule.manifest) !==
          canonicalJson(recoveryCapsule.manifest)
      ) {
        throw new Error();
      }
    } catch {
      throw cutoverError(
        "RECOVERY_CAPSULE_FAILED",
        openUpdate
          ? "La cápsula OPEN no quedó durable antes de la confirmación."
          : "La cápsula CLOSED no quedó durable antes de la confirmación.",
      );
    }

    const tty = openTtyImpl();
    try {
      const entered = tty.readLine({ prompt: confirmation });
      if (entered !== confirmation) {
        throw cutoverError(
          "CONFIRMATION_REJECTED",
          "La confirmación final no coincide literalmente.",
        );
      }
    } finally {
      tty.close?.();
    }

    assertOpenOperationLock(operationLock);
    const confirmedGit = await readGitStateImpl({
      repositoryRoot,
      environment: gitEnvironment,
    });
    if (
      confirmedGit.head !== lockedGit.head ||
      pathExists(statePaths.claimPath) ||
      pathExists(statePaths.outputPath) ||
      pathExists(statePaths.receiptPath)
    ) {
      throw cutoverError(
        "CUTOVER_STATE_CHANGED",
        "Git o el estado local cambiaron después de la confirmación.",
      );
    }
    const confirmedNow = nowFrom(nowImpl);
    const confirmedBundle = await readBundle({
      requestPath,
      repositoryRoot,
      currentHead: confirmedGit.head,
      now: confirmedNow,
      readRequestImpl,
      readActImpl,
      readArtifactImpl,
      readIssuanceImpl,
      stateRoot: securedState.stateRoot,
      expectedActHash,
    });
    assertSameBundle(finalBundle, confirmedBundle);
    assertBundle({
      bundle: confirmedBundle,
      currentHead: confirmedGit.head,
      now: confirmedNow,
      claimExists: false,
      expectedActHash,
    });
    assertNoWranglerDeployConfigInAncestors([
      repositoryRoot,
      securedState.stateRoot,
      confirmedBundle.artifactRoot,
    ]);
    const confirmedClosed = await auditSource(confirmedBundle);
    if (
      confirmedClosed.activeDeploymentId !== lockedClosed.activeDeploymentId ||
      confirmedClosed.activeVersionId !== lockedClosed.activeVersionId
    ) {
      throw cutoverError(
        "CLOSED_STATE_CHANGED",
        "El estado closed cambió después de la confirmación.",
      );
    }
    await safeAssertRemoteUnused(
      assertRemoteUnusedImpl,
      oauthToken,
      confirmedBundle,
    );
    let confirmedRecoveryCapsule;
    try {
      assertOpenOperationLock(operationLock);
      confirmedRecoveryCapsule = openUpdate
        ? readPublishedExceptionalOpenRecoveryCapsule({
            stateRoot: securedState.stateRoot,
            expectedBindings: recoveryCapsule.expectedBindings,
          })
        : await readRecoveryCapsuleImpl({
            stateRoot: securedState.stateRoot,
            requestHash: confirmedBundle.requestHash,
            actHash: confirmedBundle.actHash,
            issuanceHash: confirmedBundle.issuanceHash,
            artifactHash: confirmedBundle.artifactHash,
            closedDeploymentId: confirmedClosed.activeDeploymentId,
            closedVersionId: confirmedClosed.activeVersionId,
            head: confirmedBundle.request.head,
            expectedCapsuleHash: recoveryCapsule.capsuleHash,
          });
    } catch {
      throw cutoverError(
        "RECOVERY_CAPSULE_CHANGED",
        "La cápsula CLOSED cambió después de la confirmación.",
      );
    }
    if (
      confirmedRecoveryCapsule.capsuleRoot !== recoveryCapsule.capsuleRoot ||
      confirmedRecoveryCapsule.publicationPath !==
        recoveryCapsule.publicationPath ||
      confirmedRecoveryCapsule.capsuleHash !== recoveryCapsule.capsuleHash ||
      canonicalJson(confirmedRecoveryCapsule.manifest) !==
        canonicalJson(recoveryCapsule.manifest)
    ) {
      throw cutoverError(
        "RECOVERY_CAPSULE_CHANGED",
        "La cápsula CLOSED cambió después de la confirmación.",
      );
    }
    assertOpenOperationLock(operationLock);

    const claim = createClaimPayload({
      bundle: confirmedBundle,
      closedState: confirmedClosed,
      recoveryCapsule,
      confirmedPhrase: confirmation,
      now: confirmedNow,
    });
    try {
      assertOpenOperationLock(operationLock);
      writeCanonicalExclusive(statePaths.claimPath, claim);
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw cutoverError(
          "ACT_CONSUMED",
          "El acta fue consumida concurrentemente.",
        );
      }
      if (error instanceof ExceptionalCutoverError) throw error;
      throw cutoverError("CLAIM_FAILED", "No se pudo crear el claim atómico.");
    }
    try {
      assertOpenOperationLock(operationLock);
      createExclusiveEmptyFile(statePaths.outputPath);
    } catch {
      throw cutoverError(
        "OUTPUT_STATE_FAILED",
        "No se pudo reservar el NDJSON de Wrangler.",
      );
    }

    const revalidateArtifact = async () => {
      try {
        return await readArtifactImpl({
          requestPath,
          worktreeRoot: repositoryRoot,
          expectedHead: finalGit.head,
          expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
          expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
          expectedRequestHash: finalBundle.requestHash,
          expectedArtifactHash: finalBundle.artifactHash,
        });
      } catch {
        throw cutoverError(
          "ARTIFACT_REVALIDATION_FAILED",
          "El artifact congelado no superó su revalidación segura.",
        );
      }
    };
    let openVersionId = null;
    const interruptionController = new AbortController();
    let interruptedBy = null;
    const signalHandlers = new Map(
      ["SIGINT", "SIGTERM", "SIGHUP"].map((signalName) => [
        signalName,
        () => {
          if (interruptedBy !== null) return;
          interruptedBy = signalName;
          interruptionController.abort();
        },
      ]),
    );
    for (const [signalName, handler] of signalHandlers) {
      process.on(signalName, handler);
    }
    const assertNotInterrupted = () => {
      if (interruptedBy !== null) {
        throw cutoverError(
          "CUTOVER_INTERRUPTED",
          "El cutover recibió una señal y detuvo el avance.",
        );
      }
    };
    const revalidateForwardState = async () => {
      assertOpenOperationLock(operationLock);
      assertNotInterrupted();
      let liveGit;
      try {
        liveGit = await readGitStateImpl({
          repositoryRoot,
          environment: gitEnvironment,
        });
      } catch {
        throw cutoverError(
          "GIT_REVALIDATION_FAILED",
          "Git no superó la revalidación previa a la mutación.",
        );
      }
      if (liveGit.head !== finalGit.head) {
        throw cutoverError("HEAD_CHANGED", "HEAD cambió antes de la mutación.");
      }
      await revalidateArtifact();
      if (openUpdate) {
        await readExceptionalOpenUpdateEvidence({
          requestPath,
          repositoryRoot,
          request: finalBundle.request,
          artifactManifest: finalBundle.artifactManifest,
          expectedCertificateHash: finalBundle.act.openUpdateEvidenceHash,
          now: nowFrom(nowImpl),
        });
        readPublishedExceptionalOpenRecoveryCapsule({
          stateRoot: securedState.stateRoot,
          expectedBindings: recoveryCapsule.expectedBindings,
        });
        await verifyOpenRecoveryVersionImpl({
          recoveryCapsule,
          oauthToken,
          now: nowFrom(nowImpl),
        });
      }
      assertNoWranglerDeployConfigInAncestors([
        repositoryRoot,
        securedState.stateRoot,
        finalBundle.artifactRoot,
      ]);
      assertBundle({
        bundle: finalBundle,
        currentHead: finalGit.head,
        now: nowFrom(nowImpl),
        claimExists: false,
        expectedActHash,
      });
      assertCanonicalStateFile(statePaths.claimPath, claim, "El claim");
      if (openVersionId === null) {
        await safeAssertRemoteUnused(
          assertRemoteUnusedImpl,
          oauthToken,
          finalBundle,
        );
      } else {
        await safeVerifyRemoteUpload(
          verifyRemoteUploadImpl,
          oauthToken,
          finalBundle,
          openVersionId,
        );
      }
    };
    const stepRecords = [];
    let mutationStarted = false;
    try {
      await revalidateForwardState();
      if (openUpdate) await auditSource(finalBundle);
      mutationStarted = true;
      try {
        await executeGeneratedStep({
          expectedStep: uploadStep,
          executeStepImpl,
          childEnv: exceptionalCutoverChildEnvironment(env, {
            outputPath: statePaths.outputPath,
          }),
          stateRoot: securedState.stateRoot,
          artifactRoot: finalBundle.artifactRoot,
          abortSignal: interruptionController.signal,
          operationLock,
        });
        stepRecords.push({ id: uploadStep.id, status: "PASS" });
      } catch (error) {
        stepRecords.push({ id: uploadStep.id, status: "FAIL" });
        throw error;
      }
      openVersionId = consumeWranglerVersionUploadNdjson(
        statePaths.outputPath,
        {
          expectedArguments: uploadStep.arguments.slice(1),
        },
      );

      await revalidateForwardState();
      if (!openUpdate)
        try {
          await executeGeneratedStep({
            expectedStep: cronsStep,
            executeStepImpl,
            childEnv: baseChildEnv,
            stateRoot: securedState.stateRoot,
            artifactRoot: finalBundle.artifactRoot,
            abortSignal: interruptionController.signal,
            operationLock,
          });
          stepRecords.push({ id: cronsStep.id, status: "PASS" });
        } catch (error) {
          stepRecords.push({ id: cronsStep.id, status: "FAIL" });
          throw error;
        }

      await revalidateForwardState();
      const transitionalState = openUpdate
        ? await auditSource(finalBundle)
        : await safeClosedWithOpenCronsAudit(
            auditClosedWithOpenCronsImpl,
            oauthToken,
          );
      if (
        transitionalState.activeDeploymentId !==
          finalClosed.activeDeploymentId ||
        transitionalState.activeVersionId !== finalClosed.activeVersionId
      ) {
        throw cutoverError(
          "TRANSITIONAL_STATE_CHANGED",
          openUpdate
            ? "El origen OPEN cambió después del canary y antes de promover."
            : "Los crons open alteraron el deployment o la versión closed antes de promover.",
        );
      }
      await revalidateForwardState();
      if (openUpdate) await auditSource(finalBundle);
      const promotionStep = createExceptionalPromotionStep({
        ...commonPlan,
        openVersionId,
      });
      try {
        await executeGeneratedStep({
          expectedStep: promotionStep,
          executeStepImpl,
          childEnv: baseChildEnv,
          stateRoot: securedState.stateRoot,
          artifactRoot: finalBundle.artifactRoot,
          abortSignal: interruptionController.signal,
          operationLock,
        });
        stepRecords.push({ id: promotionStep.id, status: "PASS" });
      } catch (error) {
        stepRecords.push({ id: promotionStep.id, status: "FAIL" });
        throw error;
      }
      await revalidateForwardState();
      const openState = await safeOpenAudit(auditOpenImpl, oauthToken);
      if (openState.activeVersionId !== openVersionId) {
        throw cutoverError(
          "OPEN_VERSION_MISMATCH",
          "El audit open no activó la versión subida.",
        );
      }
      const finalRemoteBindings = await safeFindRemoteBindings(
        findRemoteBindingsImpl,
        oauthToken,
        finalBundle,
      );
      if (
        finalRemoteBindings.versionIds.length !== 1 ||
        finalRemoteBindings.versionIds[0] !== openVersionId
      ) {
        throw cutoverError(
          "REMOTE_BINDING_NOT_UNIQUE",
          "El binding remoto final no es único para la versión promovida.",
        );
      }
      await revalidateForwardState();
      const receipt = createReceiptPayload({
        outcome: "open",
        bundle: finalBundle,
        claim,
        baselineClosedState: finalClosed,
        finalClosedState: null,
        openState,
        openVersionId,
        remoteUploadBinding: {
          status: "UNIQUE",
          versionIds: [...finalRemoteBindings.versionIds],
        },
        steps: stepRecords,
        completedAt: nowFrom(nowImpl),
      });
      assertOpenOperationLock(operationLock);
      writeCanonicalExclusive(statePaths.receiptPath, receipt);
      terminalReceiptWritten = true;
      return Object.freeze({
        actHash: finalBundle.actHash,
        artifactHash: finalBundle.artifactHash,
        claimPath: statePaths.claimPath,
        receiptPath: statePaths.receiptPath,
        ...(openUpdate
          ? {
              releaseMode: "OPEN_UPDATE",
              sourceDeploymentId: finalClosed.activeDeploymentId,
              sourceVersionId: finalClosed.activeVersionId,
              recoveryVersionId: recoveryCapsule.manifest.recoveryVersionId,
            }
          : {
              closedDeploymentId: finalClosed.activeDeploymentId,
              closedVersionId: finalClosed.activeVersionId,
            }),
        openDeploymentId: openState.activeDeploymentId,
        openVersionId,
        outcome: "open",
      });
    } catch (error) {
      let outputCleanupFailed = false;
      try {
        removeWranglerOutputIfPresent(statePaths.outputPath);
      } catch {
        outputCleanupFailed = true;
      }
      if (!mutationStarted || error?.code === "PROCESS_GROUP_UNCERTAIN") {
        throw error;
      }
      let remoteUploadBinding = Object.freeze({
        status: "NOT_VERIFIED",
        versionIds: Object.freeze([]),
      });
      try {
        const remoteBindings = await safeFindRemoteBindings(
          findRemoteBindingsImpl,
          oauthToken,
          finalBundle,
        );
        remoteUploadBinding = Object.freeze({
          status:
            remoteBindings.versionIds.length === 0
              ? "NONE"
              : remoteBindings.versionIds.length === 1
                ? "UNIQUE"
                : "AMBIGUOUS",
          versionIds: remoteBindings.versionIds,
        });
        if (openVersionId === null && remoteBindings.versionIds.length === 1) {
          [openVersionId] = remoteBindings.versionIds;
        }
        stepRecords.push({
          id: "inspect-remote-upload-binding",
          status: remoteBindings.versionIds.length <= 1 ? "PASS" : "FAIL",
        });
      } catch {
        stepRecords.push({
          id: "inspect-remote-upload-binding",
          status: "FAIL",
        });
      }
      const rollback = await attemptRollback({
        bundle: finalBundle,
        stateRoot: securedState.stateRoot,
        closedState: finalClosed,
        repositoryRoot,
        executeStepImpl,
        baseChildEnv,
        auditClosedImpl,
        oauthToken,
        stepRecords,
        recoveryCapsule,
        readRecoveryCapsuleImpl,
        operationLock,
        collectRecoveryStateImpl,
        verifyOpenRecoveryVersionImpl,
        nowImpl,
        knownOpenVersionId: openVersionId,
      });
      if (!rollback.confirmed) {
        throw cutoverError(
          "ROLLBACK_UNCONFIRMED",
          openUpdate
            ? "El cutover falló y la recuperación OPEN no quedó confirmada."
            : "El cutover falló y el rollback closed no quedó confirmado.",
        );
      }
      const receipt = createReceiptPayload({
        outcome: "rolled-back",
        bundle: finalBundle,
        claim,
        baselineClosedState: finalClosed,
        finalClosedState: rollback.auditedState,
        openState: null,
        openVersionId,
        remoteUploadBinding,
        steps: stepRecords,
        completedAt: nowFrom(nowImpl),
      });
      try {
        assertOpenOperationLock(operationLock);
        writeCanonicalExclusive(statePaths.receiptPath, receipt);
        terminalReceiptWritten = true;
      } catch {
        throw cutoverError(
          "ROLLBACK_RECEIPT_FAILED",
          "El cutover revirtió pero no pudo registrar el recibo saneado.",
        );
      }
      if (outputCleanupFailed) {
        throw cutoverError(
          "WRANGLER_OUTPUT_CLEANUP_FAILED",
          "El cutover revirtió, pero no pudo eliminar el NDJSON efímero de Wrangler.",
        );
      }
      throw cutoverError(
        "CUTOVER_ROLLED_BACK",
        openUpdate
          ? "El cutover falló; OPEN con Google deshabilitado quedó recuperado y el acta consumida."
          : "El cutover falló; rollback closed confirmado y el acta quedó consumida.",
      );
    } finally {
      for (const [signalName, handler] of signalHandlers) {
        process.off(signalName, handler);
      }
    }
  } finally {
    try {
      releaseOpenOperationLock(operationLock);
    } catch (error) {
      if (!terminalReceiptWritten) throw error;
      process.stderr.write(
        "Cutover excepcional: el resultado remoto y su receipt quedaron registrados, pero el lock local cambió al liberarse; no ejecutar un rollback por este aviso.\n",
      );
    }
  }
}

async function runExceptionalOpenCutover() {
  return runExceptionalOpenCutoverInternal(
    {
      argv: process.argv.slice(2),
      repositoryRoot: REPOSITORY_ROOT,
      env: process.env,
    },
    PRODUCTION_CUTOVER_CAPABILITY,
  );
}

export function parseExceptionalOpenRecoveryArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 7 ||
    argv[0] !== "--recover-open" ||
    argv[1] !== "--request-hash" ||
    argv[3] !== "--act-hash" ||
    argv[5] !== "--claim-hash"
  ) {
    throw cutoverError(
      "INVALID_OPEN_RECOVERY_ARGUMENTS",
      "Recovery OPEN requiere --recover-open --request-hash SHA --act-hash SHA --claim-hash SHA.",
    );
  }
  return Object.freeze({
    requestHash: assertSafeHash(argv[2], "requestHash"),
    actHash: assertSafeHash(argv[4], "actHash"),
    claimHash: assertSafeHash(argv[6], "claimHash"),
  });
}

export function readExceptionalOpenRecoveryClaim({
  stateRoot,
  requestHash,
  actHash,
  claimHash,
}) {
  for (const value of [requestHash, actHash, claimHash])
    assertSafeHash(value, "Recovery binding");
  assertOpenRecoveryDirectory(stateRoot);
  const claimPath = deriveExceptionalCutoverStatePaths({
    stateRoot,
    requestHash,
  }).claimPath;
  const source = readSecureFile(claimPath, {
    maxBytes: MAX_CUTOVER_STATE_BYTES,
  }).toString("utf8");
  const claim = JSON.parse(source);
  const expectedKeys = [
    "schemaVersion",
    "state",
    "head",
    "policyVersion",
    "policyHash",
    "requestHash",
    "actHash",
    "artifactHash",
    "issuanceHash",
    "recoveryCapsuleHash",
    "confirmationSha256",
    "claimedAtUtc",
    "releaseMode",
    "openSourceBaselineSha256",
    "openUpdateEvidenceHash",
    "sourceDeploymentId",
    "sourceVersionId",
    "recoveryBindings",
    "contentSha256",
  ];
  if (
    !isPlainObject(claim) ||
    JSON.stringify(Object.keys(claim).sort()) !==
      JSON.stringify(expectedKeys.sort()) ||
    source !== canonicalJson(claim) ||
    claim.schemaVersion !== EXCEPTIONAL_OPEN_UPDATE_CLAIM_SCHEMA_VERSION ||
    claim.releaseMode !== "OPEN_UPDATE" ||
    claim.state !== "claimed-before-deploy" ||
    claim.requestHash !== requestHash ||
    claim.actHash !== actHash ||
    claim.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    claim.policyHash !== RELEASE_GATE_POLICY_SHA256 ||
    !FULL_HEAD_PATTERN.test(claim.head ?? "") ||
    !isCanonicalTimestamp(claim.claimedAtUtc)
  ) {
    throw cutoverError(
      "INVALID_OPEN_RECOVERY_CLAIM",
      "El claim no corresponde al release OPEN solicitado.",
    );
  }
  const { contentSha256, ...payload } = claim;
  if (
    contentSha256 !== claimHash ||
    canonicalContentHash(payload) !== claimHash
  ) {
    throw cutoverError(
      "OPEN_RECOVERY_CLAIM_HASH_MISMATCH",
      "El claim no coincide con su hash externo.",
    );
  }
  for (const key of [
    "artifactHash",
    "issuanceHash",
    "recoveryCapsuleHash",
    "confirmationSha256",
    "openSourceBaselineSha256",
    "openUpdateEvidenceHash",
  ])
    assertSafeHash(claim[key], key);
  assertSafeVersionId(claim.sourceDeploymentId, "sourceDeploymentId");
  assertSafeVersionId(claim.sourceVersionId, "sourceVersionId");
  const bindings = claim.recoveryBindings;
  if (
    !isPlainObject(bindings) ||
    bindings.recoveryScope !== "FINAL_RELEASE" ||
    bindings.expectedCapsuleHash !== claim.recoveryCapsuleHash ||
    [
      "head",
      "requestHash",
      "actHash",
      "artifactHash",
      "issuanceHash",
      "openSourceBaselineSha256",
      "sourceVersionId",
    ].some((key) => bindings[key] !== claim[key])
  ) {
    throw cutoverError(
      "OPEN_RECOVERY_CLAIM_BINDING_MISMATCH",
      "El claim no conserva los vínculos de su cápsula FINAL_RELEASE.",
    );
  }
  readPublishedExceptionalOpenRecoveryCapsule({
    stateRoot,
    expectedBindings: bindings,
  });
  return Object.freeze({ claimPath, claim });
}

export function validateExceptionalOpenRecoveryActiveState({
  snapshot,
  claim,
  recoveryCapsule,
  matchingVersionIds,
  now,
}) {
  if (
    !Array.isArray(matchingVersionIds) ||
    matchingVersionIds.length > 1 ||
    matchingVersionIds.some((value) => !VERSION_ID_PATTERN.test(value))
  ) {
    throw cutoverError(
      "AMBIGUOUS_OPEN_RECOVERY_RELEASE",
      "El release no tiene una versión remota inequívoca.",
    );
  }
  const version =
    snapshot?.deployments?.result?.deployments?.[0]?.versions?.[0]?.version_id;
  if (version === recoveryCapsule.manifest.recoveryVersionId) {
    const state = assertExceptionalOpenRecoveredState({
      capsuleManifest: recoveryCapsule.manifest,
      expectedBindings: recoveryCapsule.expectedBindings,
      snapshot,
      observedAtUtc: now.toISOString(),
    });
    return Object.freeze({
      activeDeploymentId: state.deploymentId,
      activeVersionId: version,
      alreadyRecovered: true,
    });
  }
  const identity =
    version === claim.sourceVersionId
      ? validateCloudflareOpenSourceState(snapshot)
      : validateCloudflareOpenState(snapshot);
  if (
    (version === claim.sourceVersionId &&
      identity.activeDeploymentId !== claim.sourceDeploymentId) ||
    (version !== claim.sourceVersionId &&
      (matchingVersionIds.length !== 1 || matchingVersionIds[0] !== version))
  ) {
    throw cutoverError(
      "UNRELATED_OPEN_RECOVERY_VERSION",
      "La versión activa pertenece a otro deployment o release; recovery se detuvo.",
    );
  }
  return Object.freeze({ ...identity, alreadyRecovered: false });
}

// Same sealed executable and immutable capsule, without consulting mutable Git
// HEAD or requiring an unexpired act/baseline to repair an interrupted release.
async function runExceptionalOpenRecovery() {
  const bindings = parseExceptionalOpenRecoveryArguments(process.argv.slice(2));
  assertExactRuntime(REPOSITORY_ROOT);
  const { stateRoot } = ensureExceptionalCutoverStateRoot({
    stateRoot: resolveExceptionalCutoverStateRoot(),
    worktreeRoot: REPOSITORY_ROOT,
  });
  const { claim, claimPath } = readExceptionalOpenRecoveryClaim({
    stateRoot,
    ...bindings,
  });
  const recoveryCapsule = readPublishedExceptionalOpenRecoveryCapsule({
    stateRoot,
    expectedBindings: claim.recoveryBindings,
  });
  assertNoWranglerDeployConfigInAncestors([
    REPOSITORY_ROOT,
    stateRoot,
    recoveryCapsule.capsuleRoot,
  ]);
  const confirmation = `AUTORIZO RECUPERAR AGORBIS OPEN SIN GOOGLE PARA ${bindings.requestHash} CON ACTA ${bindings.actHash}`;
  const tty = openExceptionalCutoverTty();
  try {
    if (tty.readLine({ prompt: confirmation }) !== confirmation)
      throw cutoverError(
        "OPEN_RECOVERY_CONFIRMATION_REJECTED",
        "La confirmación de recuperación no coincide.",
      );
  } finally {
    tty.close?.();
  }
  const operationLock = acquireExceptionalCutoverOperationLock({
    stateRoot,
    operation: "recovery",
    requestHash: claim.requestHash,
    actHash: claim.actHash,
    head: claim.head,
    now: new Date(),
  });
  try {
    assertOpenOperationLock(operationLock);
    assertCanonicalStateFile(claimPath, claim, "El claim OPEN");
    const childEnv = exceptionalCutoverChildEnvironment(process.env);
    const oauthToken = await loadWranglerOAuthToken({
      cwd: REPOSITORY_ROOT,
      env: childEnv,
      nodeExecutable: process.execPath,
      wranglerEntrypoint: path.join(
        REPOSITORY_ROOT,
        "node_modules",
        "wrangler",
        "wrangler-dist",
        "cli.js",
      ),
    });
    const bundle = {
      request: { releaseMode: "OPEN_UPDATE", head: claim.head },
      requestHash: claim.requestHash,
      act: { policyVersion: claim.policyVersion, policyHash: claim.policyHash },
      actHash: claim.actHash,
      artifactHash: claim.artifactHash,
    };
    const remote = await safeFindRemoteBindings(
      findExceptionalCutoverRemoteBindings,
      oauthToken,
      bundle,
    );
    const snapshot = await collectCloudflareState({
      fetchImpl: globalThis.fetch,
      oauthToken,
    });
    const initial = validateExceptionalOpenRecoveryActiveState({
      snapshot,
      claim,
      recoveryCapsule,
      matchingVersionIds: remote.versionIds,
      now: new Date(),
    });
    await verifyOpenRecoveryVersion({
      recoveryCapsule,
      oauthToken,
      now: new Date(),
    });
    assertCanonicalStateFile(claimPath, claim, "El claim OPEN");
    const currentSnapshot = await collectCloudflareState({
      fetchImpl: globalThis.fetch,
      oauthToken,
    });
    const current = validateExceptionalOpenRecoveryActiveState({
      snapshot: currentSnapshot,
      claim,
      recoveryCapsule,
      matchingVersionIds: remote.versionIds,
      now: new Date(),
    });
    if (
      initial.activeDeploymentId !== current.activeDeploymentId ||
      initial.activeVersionId !== current.activeVersionId
    ) {
      throw cutoverError(
        "OPEN_RECOVERY_REMOTE_CHANGED",
        "El estado remoto cambió antes de recuperar.",
      );
    }
    const steps = [];
    const rollback = current.alreadyRecovered
      ? { confirmed: true, auditedState: current }
      : await attemptRollback({
          bundle,
          stateRoot,
          repositoryRoot: REPOSITORY_ROOT,
          executeStepImpl: executeExceptionalCutoverStep,
          baseChildEnv: childEnv,
          oauthToken,
          stepRecords: steps,
          recoveryCapsule,
          operationLock,
          closedState: {
            activeVersionId: claim.sourceVersionId,
            activeDeploymentId: claim.sourceDeploymentId,
          },
          knownOpenVersionId: remote.versionIds[0] ?? null,
        });
    if (!rollback.confirmed)
      throw cutoverError(
        "OPEN_RECOVERY_UNCONFIRMED",
        "No se pudo confirmar la recuperación OPEN.",
      );
    const payload = {
      schemaVersion: "agorbis-exceptional-open-recovery-receipt/v1",
      requestHash: claim.requestHash,
      actHash: claim.actHash,
      claimHash: claim.contentSha256,
      capsuleHash: recoveryCapsule.capsuleHash,
      recoveryArtifactHash: recoveryCapsule.manifest.recoveryArtifactHash,
      recoveryVersionId: rollback.auditedState.activeVersionId,
      recoveryDeploymentId: rollback.auditedState.activeDeploymentId,
      outcome: current.alreadyRecovered
        ? "already-recovered"
        : "recovered-open",
      cronsPreserved: true,
      steps,
      completedAtUtc: new Date().toISOString(),
    };
    const receiptPath = path.join(
      stateRoot,
      `${claim.requestHash}.${randomBytes(16).toString("hex")}.open-recovery.receipt.json`,
    );
    assertOpenOperationLock(operationLock);
    writeCanonicalExclusive(receiptPath, {
      ...payload,
      contentSha256: canonicalContentHash(payload),
    });
    return {
      receiptPath,
      recoveryVersionId: payload.recoveryVersionId,
      recoveryDeploymentId: payload.recoveryDeploymentId,
    };
  } finally {
    releaseOpenOperationLock(operationLock);
  }
}

async function main() {
  if (process.argv[2] === "--recover-open") {
    const result = await runExceptionalOpenRecovery();
    process.stdout.write(
      `Recovery OPEN verificado: version=${result.recoveryVersionId}, deployment=${result.recoveryDeploymentId}.\n`,
    );
    return;
  }
  const result = await runExceptionalOpenCutover();
  process.stdout.write(
    `Cutover excepcional OPEN verificado: act=${result.actHash}, version=${result.openVersionId}, deployment=${result.openDeploymentId}.\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const message =
      error instanceof ExceptionalCutoverError
        ? error.message
        : "Fallo interno saneado del cutover excepcional.";
    process.stderr.write(`Cutover excepcional: ${message}\n`);
    process.exitCode = 1;
  });
}
