import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import {
  readWranglerConfiguration,
  validateOpenRecoveryConfiguration,
} from "./cloudflare-worker-policy.mjs";
import { assertOpenReleaseBaselineRecord } from "./open-release-baseline-policy.mjs";
import { assertExceptionalCutoverConfigurations } from "./exceptional-cutover-config-policy.mjs";
import {
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY,
  EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  verifyExceptionalWranglerIntegrity,
} from "./exceptional-wrangler-integrity.mjs";

export const EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION =
  "agorbis-exceptional-release-artifact/v1";
export const EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION =
  "agorbis-exceptional-release-artifact/v2";
export const EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION = "22.22.0";
export const EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION = "4.160.1";
export const EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH =
  "exceptional-release-empty.env";

const SOURCE_EMPTY_ENV_PATH = "scripts/exceptional-release-empty.env";
const WRANGLER_CONFIGURATION_PATHS = Object.freeze([
  "wrangler.jsonc",
  "wrangler.crons-closed.jsonc",
  "wrangler.crons-open.jsonc",
  "wrangler.traffic.jsonc",
]);
const MAX_REQUEST_BYTES = 256 * 1_024;
const MAX_MANIFEST_BYTES = 4 * 1_024 * 1_024;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const EMPTY_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
const MANIFEST_KEYS = Object.freeze([
  "contentSha256",
  "createdAtUtc",
  "files",
  "head",
  "nodeVersion",
  "policyHash",
  "policyVersion",
  "requestHash",
  "schemaVersion",
  "wranglerClosureHash",
  "wranglerEntrypointHash",
  "wranglerLockHash",
  "wranglerVersion",
]);
const OPEN_UPDATE_MANIFEST_KEYS = Object.freeze(
  [
    ...MANIFEST_KEYS,
    "releaseMode",
    "openSourceBaseline",
    "openSourceBaselineSha256",
    "artifactPurpose",
    "recoveryArtifactHash",
  ].sort(),
);
const FILE_KEYS = Object.freeze(["path", "sha256", "size"]);
if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error(
    "El filesystem no soporta O_NOFOLLOW; el artifact excepcional queda bloqueado.",
  );
}
const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
const WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  (fsConstants.O_CLOEXEC ?? 0) |
  fsConstants.O_NOFOLLOW;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected)
  );
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sha256Buffer(content) {
  return createHash("sha256").update(content).digest("hex");
}

function isCanonicalUtcTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
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

function currentUid() {
  return typeof process.getuid === "function" ? process.getuid() : null;
}

function stableFileIdentity(stats) {
  return Object.freeze({
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mode: stats.mode,
    uid: stats.uid,
    gid: stats.gid,
    nlink: stats.nlink,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  });
}

function sameStableFileIdentity(left, right) {
  const leftIdentity = stableFileIdentity(left);
  const rightIdentity = stableFileIdentity(right);
  return Object.keys(leftIdentity).every(
    (key) => leftIdentity[key] === rightIdentity[key],
  );
}

function assertSameStableFile(expected, actual, label) {
  if (!sameStableFileIdentity(expected, actual)) {
    throw new Error(`${label} cambió de inode, metadata o contenido.`);
  }
}

function assertSameStableDirectory(expected, actual, label) {
  if (
    !actual.isDirectory() ||
    actual.isSymbolicLink() ||
    expected.dev !== actual.dev ||
    expected.ino !== actual.ino ||
    expected.mode !== actual.mode ||
    expected.uid !== actual.uid ||
    expected.gid !== actual.gid
  ) {
    throw new Error(`${label} cambió de inode, owner o modo.`);
  }
}

function pathExists(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function closeQuietly(fileDescriptor) {
  if (fileDescriptor === null) return;
  try {
    closeSync(fileDescriptor);
  } catch {
    // El error original conserva prioridad.
  }
}

function readRegularFileNoFollow(
  filePath,
  { maxBytes = Infinity, expectedStats = null } = {},
) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const initialStats = fstatSync(descriptor);
    if (!initialStats.isFile()) {
      throw new Error(`${filePath} debe ser un archivo regular.`);
    }
    if (expectedStats) {
      assertSameStableFile(expectedStats, initialStats, filePath);
    }
    if (initialStats.size > maxBytes) {
      throw new Error(`${filePath} excede el límite de tamaño permitido.`);
    }
    const chunks = [];
    const buffer = Buffer.allocUnsafe(64 * 1_024);
    let total = 0;
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) {
        throw new Error(`${filePath} excede el límite de tamaño permitido.`);
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const finalStats = fstatSync(descriptor);
    if (
      !sameStableFileIdentity(initialStats, finalStats) ||
      total !== finalStats.size
    ) {
      throw new Error(`${filePath} cambió mientras se estaba leyendo.`);
    }
    closeSync(descriptor);
    descriptor = null;
    return Buffer.concat(chunks, total);
  } finally {
    closeQuietly(descriptor);
  }
}

function hashRegularFileNoFollow(filePath, { expectedStats = null } = {}) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const initialStats = fstatSync(descriptor);
    if (!initialStats.isFile()) {
      throw new Error(`${filePath} debe ser un archivo regular.`);
    }
    if (expectedStats) {
      assertSameStableFile(expectedStats, initialStats, filePath);
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1_024);
    let total = 0;
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      hash.update(buffer.subarray(0, bytesRead));
    }
    const finalStats = fstatSync(descriptor);
    if (
      !sameStableFileIdentity(initialStats, finalStats) ||
      total !== finalStats.size
    ) {
      throw new Error(`${filePath} cambió mientras se calculaba su hash.`);
    }
    closeSync(descriptor);
    descriptor = null;
    return Object.freeze({ size: total, sha256: hash.digest("hex") });
  } finally {
    closeQuietly(descriptor);
  }
}

function assertSafeRelativePath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    CONTROL_OR_BIDI_PATTERN.test(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Ruta relativa de artifact no permitida: ${relativePath}.`);
  }
}

function assertSafeEntryName(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    CONTROL_OR_BIDI_PATTERN.test(name)
  ) {
    throw new Error("El árbol fuente contiene un nombre no permitido.");
  }
}

function collectSourceDirectory(
  sourceDirectory,
  destinationPrefix,
  files,
  directories,
) {
  const directoryStats = lstatSync(sourceDirectory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(
      `${destinationPrefix}/ debe ser un directorio regular, no un symlink.`,
    );
  }
  directories.add(destinationPrefix);
  const entries = readdirSync(sourceDirectory, { withFileTypes: true }).sort(
    (left, right) => compareStrings(left.name, right.name),
  );
  if (entries.length === 0) {
    throw new Error(`${destinationPrefix}/ no puede estar vacío.`);
  }
  let descendants = 0;
  for (const entry of entries) {
    assertSafeEntryName(entry.name);
    const sourcePath = path.join(sourceDirectory, entry.name);
    const relativePath = `${destinationPrefix}/${entry.name}`;
    const stats = lstatSync(sourcePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`El árbol fuente contiene un symlink: ${relativePath}.`);
    }
    if (stats.isDirectory()) {
      const before = files.length;
      collectSourceDirectory(sourcePath, relativePath, files, directories);
      if (files.length === before) {
        throw new Error(`El directorio ${relativePath}/ está vacío.`);
      }
      descendants += files.length - before;
      continue;
    }
    if (!stats.isFile()) {
      throw new Error(
        `El árbol fuente contiene un tipo no permitido: ${relativePath}.`,
      );
    }
    const digest = hashRegularFileNoFollow(sourcePath, {
      expectedStats: stats,
    });
    files.push({
      sourcePath,
      manifestEntry: {
        path: relativePath,
        size: digest.size,
        sha256: digest.sha256,
      },
    });
    descendants += 1;
  }
  if (descendants === 0) {
    throw new Error(`${destinationPrefix}/ no contiene archivos regulares.`);
  }
}

function collectSourceInventory(repositoryRoot, artifactPurpose) {
  const files = [];
  const directories = new Set();
  collectSourceDirectory(
    path.join(repositoryRoot, "dist"),
    "dist",
    files,
    directories,
  );
  collectSourceDirectory(
    path.join(repositoryRoot, "server"),
    "server",
    files,
    directories,
  );
  for (const [sourceRelativePath, destinationPath] of [
    ...WRANGLER_CONFIGURATION_PATHS.map((configurationPath) => [
      artifactPurpose === "recovery" && configurationPath === "wrangler.jsonc"
        ? "wrangler.open-recovery.jsonc"
        : configurationPath,
      configurationPath,
    ]),
    [SOURCE_EMPTY_ENV_PATH, EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH],
  ]) {
    const sourcePath = path.join(repositoryRoot, sourceRelativePath);
    const stats = lstatSync(sourcePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`${sourceRelativePath} debe ser un archivo regular.`);
    }
    const digest = hashRegularFileNoFollow(sourcePath, {
      expectedStats: stats,
    });
    if (
      destinationPath === EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH &&
      digest.size !== 0
    ) {
      throw new Error(`${SOURCE_EMPTY_ENV_PATH} debe estar exactamente vacío.`);
    }
    files.push({
      sourcePath,
      manifestEntry: {
        path: destinationPath,
        size: digest.size,
        sha256: digest.sha256,
      },
    });
  }
  files.sort((left, right) =>
    compareStrings(left.manifestEntry.path, right.manifestEntry.path),
  );
  return Object.freeze({
    files,
    directories: [...directories].sort(compareStrings),
  });
}

function copyRegularFileExclusive(sourcePath, destinationPath, expected) {
  let sourceDescriptor = null;
  let destinationDescriptor = null;
  try {
    sourceDescriptor = openSync(sourcePath, READ_FLAGS);
    const initialStats = fstatSync(sourceDescriptor);
    if (!initialStats.isFile() || initialStats.size !== expected.size) {
      throw new Error(`${expected.path} cambió antes de congelarse.`);
    }
    destinationDescriptor = openSync(destinationPath, WRITE_FLAGS, 0o600);
    fchmodSync(destinationDescriptor, 0o600);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1_024);
    let total = 0;
    for (;;) {
      const bytesRead = readSync(
        sourceDescriptor,
        buffer,
        0,
        buffer.length,
        null,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      total += bytesRead;
      let offset = 0;
      while (offset < bytesRead) {
        offset += writeSync(
          destinationDescriptor,
          buffer,
          offset,
          bytesRead - offset,
        );
      }
    }
    const finalStats = fstatSync(sourceDescriptor);
    const actualSha256 = hash.digest("hex");
    if (
      !sameStableFileIdentity(initialStats, finalStats) ||
      total !== expected.size ||
      actualSha256 !== expected.sha256
    ) {
      throw new Error(`${expected.path} cambió mientras se congelaba.`);
    }
    fsyncSync(destinationDescriptor);
    closeSync(sourceDescriptor);
    sourceDescriptor = null;
    closeSync(destinationDescriptor);
    destinationDescriptor = null;
  } catch (error) {
    closeQuietly(sourceDescriptor);
    closeQuietly(destinationDescriptor);
    throw error;
  }
}

function writeExclusiveFile(filePath, content) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, WRITE_FLAGS, 0o600);
    fchmodSync(descriptor, 0o600);
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    let offset = 0;
    while (offset < buffer.length) {
      offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
  } catch (error) {
    closeQuietly(descriptor);
    throw error;
  }
}

function parseJsonFileFollowingPackageLink(filePath, label) {
  let realFilePath;
  try {
    realFilePath = realpathSync(filePath);
  } catch {
    throw new Error(`No se encontró ${label}.`);
  }
  let parsed;
  try {
    const stats = lstatSync(realFilePath);
    parsed = JSON.parse(
      readRegularFileNoFollow(realFilePath, {
        maxBytes: 1 * 1_024 * 1_024,
        expectedStats: stats,
      }),
    );
  } catch {
    throw new Error(`${label} no contiene JSON legible.`);
  }
  if (!isPlainObject(parsed))
    throw new Error(`${label} debe ser un objeto JSON.`);
  return parsed;
}

function assertPinnedRuntime(
  repositoryRoot,
  verifyWranglerIntegrityImpl = verifyExceptionalWranglerIntegrity,
) {
  if (process.versions.node !== EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION) {
    throw new Error(
      `El artifact excepcional exige Node ${EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION}.`,
    );
  }
  const packageConfiguration = parseJsonFileFollowingPackageLink(
    path.join(repositoryRoot, "package.json"),
    "package.json",
  );
  if (
    packageConfiguration.devDependencies?.wrangler !==
    EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION
  ) {
    throw new Error(
      `package.json debe fijar Wrangler ${EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION} sin rango.`,
    );
  }
  const installedWrangler = parseJsonFileFollowingPackageLink(
    path.join(repositoryRoot, "node_modules/wrangler/package.json"),
    "node_modules/wrangler/package.json",
  );
  if (
    installedWrangler.version !== EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION
  ) {
    throw new Error(
      `El Wrangler instalado debe ser ${EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION}.`,
    );
  }
  const integrity = verifyWranglerIntegrityImpl({ repositoryRoot });
  if (
    !isPlainObject(integrity) ||
    integrity.version !== EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION ||
    integrity.lockHash !== EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash ||
    integrity.closureHash !==
      EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash ||
    integrity.entrypointHash !==
      EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.entrypointHash ||
    integrity.executionEntrypointHash !==
      EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256
  ) {
    throw new Error("La integridad runtime de Wrangler no coincide.");
  }
  return integrity;
}

function validateExpectedBindings(
  options,
  { requireArtifactHash = false } = {},
) {
  const errors = [];
  if (!FULL_HEAD_PATTERN.test(options.expectedHead ?? "")) {
    errors.push("expectedHead debe contener 40 hexadecimales minúsculos.");
  }
  if (
    typeof options.expectedPolicyVersion !== "string" ||
    options.expectedPolicyVersion.length === 0 ||
    options.expectedPolicyVersion.length > 128 ||
    options.expectedPolicyVersion.trim() !== options.expectedPolicyVersion ||
    CONTROL_OR_BIDI_PATTERN.test(options.expectedPolicyVersion)
  ) {
    errors.push("expectedPolicyVersion es inválida.");
  }
  if (!SHA256_PATTERN.test(options.expectedPolicyHash ?? "")) {
    errors.push("expectedPolicyHash debe ser un SHA-256 minúsculo.");
  }
  if (!SHA256_PATTERN.test(options.expectedRequestHash ?? "")) {
    errors.push("expectedRequestHash debe ser un SHA-256 minúsculo.");
  }
  if (
    (requireArtifactHash || options.expectedArtifactHash !== undefined) &&
    !SHA256_PATTERN.test(options.expectedArtifactHash ?? "")
  ) {
    errors.push("expectedArtifactHash debe ser un SHA-256 minúsculo.");
  }
  return errors;
}

function validateManifestFilePath(relativePath) {
  try {
    assertSafeRelativePath(relativePath);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (
    !WRANGLER_CONFIGURATION_PATHS.includes(relativePath) &&
    relativePath !== EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH &&
    !relativePath.startsWith("dist/") &&
    !relativePath.startsWith("server/")
  ) {
    return `Ruta ajena al árbol excepcional: ${relativePath}.`;
  }
  return null;
}

export function canonicalExceptionalReleaseArtifactJson(value) {
  const serialized = JSON.stringify(canonicalize(value));
  if (typeof serialized !== "string") {
    throw new Error("El artifact no puede representarse como JSON canónico.");
  }
  return `${serialized}\n`;
}

export function exceptionalReleaseArtifactHash(manifestOrPayload) {
  if (!isPlainObject(manifestOrPayload)) {
    throw new Error("El manifest del artifact debe ser un objeto.");
  }
  const { contentSha256: _contentSha256, ...payload } = manifestOrPayload;
  return sha256Buffer(
    Buffer.from(canonicalExceptionalReleaseArtifactJson(payload), "utf8"),
  );
}

export function deriveExceptionalReleaseArtifactPaths(
  requestPath,
  { artifactPurpose = "primary" } = {},
) {
  if (!["primary", "recovery"].includes(artifactPurpose))
    throw new Error("Propósito de artifact desconocido.");
  if (
    typeof requestPath !== "string" ||
    !path.isAbsolute(requestPath) ||
    CONTROL_OR_BIDI_PATTERN.test(requestPath)
  ) {
    throw new Error("requestPath debe ser una ruta absoluta segura.");
  }
  const basename = path.basename(requestPath);
  if (
    !requestPath.endsWith(".json") ||
    basename.length <= ".json".length ||
    basename.endsWith(".act.json") ||
    basename.endsWith(".artifact.json")
  ) {
    throw new Error(
      "requestPath debe identificar un request JSON no reservado.",
    );
  }
  const stem =
    requestPath.slice(0, -".json".length) +
    (artifactPurpose === "recovery" ? ".recovery" : "");
  return Object.freeze({
    artifactRoot: `${stem}.artifact`,
    manifestPath: `${stem}.artifact.json`,
  });
}

export function validateExceptionalReleaseArtifactManifest(
  manifest,
  {
    expectedHead,
    expectedPolicyVersion,
    expectedPolicyHash,
    expectedRequestHash,
    expectedArtifactHash,
  } = {},
) {
  const errors = validateExpectedBindings(
    {
      expectedHead,
      expectedPolicyVersion,
      expectedPolicyHash,
      expectedRequestHash,
      expectedArtifactHash,
    },
    { requireArtifactHash: true },
  );
  if (!isPlainObject(manifest)) {
    return [...errors, "El manifest del artifact debe ser un objeto JSON."];
  }
  const openUpdate =
    manifest.schemaVersion === EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION;
  if (
    !sameKeys(manifest, openUpdate ? OPEN_UPDATE_MANIFEST_KEYS : MANIFEST_KEYS)
  ) {
    errors.push("El manifest contiene claves faltantes o desconocidas.");
  }
  if (
    !openUpdate &&
    manifest.schemaVersion !== EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION
  ) {
    errors.push("schemaVersion de artifact desconocido.");
  }
  if (manifest.head !== expectedHead)
    errors.push("El HEAD del artifact no coincide.");
  if (manifest.policyVersion !== expectedPolicyVersion) {
    errors.push("La policyVersion del artifact no coincide.");
  }
  if (manifest.policyHash !== expectedPolicyHash) {
    errors.push("El policyHash del artifact no coincide.");
  }
  if (manifest.requestHash !== expectedRequestHash) {
    errors.push("El requestHash del artifact no coincide.");
  }
  if (manifest.nodeVersion !== EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION) {
    errors.push(
      `El artifact debe fijar Node ${EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION}.`,
    );
  }
  if (
    manifest.wranglerVersion !== EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION
  ) {
    errors.push(
      `El artifact debe fijar Wrangler ${EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION}.`,
    );
  }
  for (const [name, expected] of Object.entries({
    wranglerLockHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash,
    wranglerClosureHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
    wranglerEntrypointHash: EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  })) {
    if (manifest[name] !== expected) {
      errors.push(`${name} del artifact no coincide con la policy versionada.`);
    }
  }
  if (!isCanonicalUtcTimestamp(manifest.createdAtUtc)) {
    errors.push("createdAtUtc no es un timestamp UTC canónico.");
  }
  if (openUpdate) {
    if (manifest.releaseMode !== "OPEN_UPDATE")
      errors.push("El artifact v2 requiere OPEN_UPDATE.");
    if (
      !["primary", "recovery"].includes(manifest.artifactPurpose) ||
      (manifest.artifactPurpose === "recovery"
        ? manifest.recoveryArtifactHash !== null
        : !SHA256_PATTERN.test(manifest.recoveryArtifactHash ?? ""))
    ) {
      errors.push(
        "El artifact OPEN debe distinguir principal y recuperación, y el principal fijar el hash de su fallback.",
      );
    }
    try {
      assertOpenReleaseBaselineRecord({
        baseline: manifest.openSourceBaseline,
        expectedBaselineSha256: manifest.openSourceBaselineSha256,
        nowUtc: manifest.createdAtUtc,
      });
    } catch (error) {
      errors.push(
        `Baseline del artifact inválido: ${error instanceof Error ? error.message : "no verificable"}`,
      );
    }
  }
  if (!Array.isArray(manifest.files)) {
    errors.push("files debe ser un array canónico.");
  } else {
    const paths = [];
    for (const [index, entry] of manifest.files.entries()) {
      if (!sameKeys(entry, FILE_KEYS)) {
        errors.push(
          `files[${index}] contiene claves faltantes o desconocidas.`,
        );
        continue;
      }
      const pathError = validateManifestFilePath(entry.path);
      if (pathError) errors.push(pathError);
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
        errors.push(`files[${index}].size es inválido.`);
      }
      if (!SHA256_PATTERN.test(entry.sha256 ?? "")) {
        errors.push(`files[${index}].sha256 es inválido.`);
      }
      paths.push(entry.path);
    }
    const sortedPaths = [...paths].sort(compareStrings);
    if (JSON.stringify(paths) !== JSON.stringify(sortedPaths)) {
      errors.push("files no conserva el orden canónico por path.");
    }
    if (paths.length !== new Set(paths).size) {
      errors.push("files contiene paths duplicados.");
    }
    for (const requiredPath of [
      ...WRANGLER_CONFIGURATION_PATHS,
      EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH,
    ]) {
      if (
        paths.filter((candidate) => candidate === requiredPath).length !== 1
      ) {
        errors.push(`Falta exactamente un ${requiredPath}.`);
      }
    }
    if (!paths.some((candidate) => candidate.startsWith("dist/"))) {
      errors.push("El manifest no contiene dist/.");
    }
    if (!paths.some((candidate) => candidate.startsWith("server/"))) {
      errors.push("El manifest no contiene server/.");
    }
    const emptyEnv = manifest.files.find(
      (entry) => entry?.path === EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH,
    );
    if (emptyEnv && (emptyEnv.size !== 0 || emptyEnv.sha256 !== EMPTY_SHA256)) {
      errors.push("El env excepcional del manifest no está exactamente vacío.");
    }
  }
  if (!SHA256_PATTERN.test(manifest.contentSha256 ?? "")) {
    errors.push("contentSha256 del artifact es inválido.");
  } else if (
    manifest.contentSha256 !== exceptionalReleaseArtifactHash(manifest)
  ) {
    errors.push("contentSha256 del artifact no coincide con el manifest.");
  }
  if (manifest.contentSha256 !== expectedArtifactHash) {
    errors.push("El artifactHash externo no coincide con el manifest.");
  }
  return [...new Set(errors)];
}

function expectedArtifactDirectories(files) {
  const directories = new Set(["dist", "server"]);
  for (const entry of files) {
    let directory = path.posix.dirname(entry.path);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return [...directories].sort(compareStrings);
}

function collectArtifactTree(artifactRoot, expectedRootStats) {
  const files = [];
  const directories = [];
  const uid = currentUid();

  function walk(directoryPath, prefix, expectedDirectoryStats = null) {
    const initialDirectoryStats = lstatSync(directoryPath);
    if (
      !initialDirectoryStats.isDirectory() ||
      initialDirectoryStats.isSymbolicLink()
    ) {
      throw new Error(`${prefix || "artifactRoot"} dejó de ser un directorio.`);
    }
    if (expectedDirectoryStats) {
      assertSameStableDirectory(
        expectedDirectoryStats,
        initialDirectoryStats,
        prefix || "artifactRoot",
      );
    }
    const entries = readdirSync(directoryPath, { withFileTypes: true }).sort(
      (left, right) => compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      assertSafeEntryName(entry.name);
      const absolutePath = path.join(directoryPath, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stats = lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new Error(`El artifact contiene un symlink: ${relativePath}.`);
      }
      if (uid !== null && stats.uid !== uid) {
        throw new Error(
          `El artifact no pertenece al usuario actual: ${relativePath}.`,
        );
      }
      if (stats.isDirectory()) {
        if ((stats.mode & 0o7777) !== 0o700) {
          throw new Error(`El directorio ${relativePath}/ no tiene modo 0700.`);
        }
        directories.push(relativePath);
        walk(absolutePath, relativePath, stats);
        continue;
      }
      if (!stats.isFile()) {
        throw new Error(`Tipo no permitido en el artifact: ${relativePath}.`);
      }
      if ((stats.mode & 0o7777) !== 0o600) {
        throw new Error(`El archivo ${relativePath} no tiene modo 0600.`);
      }
      if (stats.nlink !== 1) {
        throw new Error(
          `El archivo ${relativePath} no puede tener hard links.`,
        );
      }
      const digest = hashRegularFileNoFollow(absolutePath, {
        expectedStats: stats,
      });
      files.push({
        path: relativePath,
        size: digest.size,
        sha256: digest.sha256,
      });
    }
    assertSameStableDirectory(
      initialDirectoryStats,
      lstatSync(directoryPath),
      prefix || "artifactRoot",
    );
  }

  walk(artifactRoot, "", expectedRootStats);
  files.sort((left, right) => compareStrings(left.path, right.path));
  directories.sort(compareStrings);
  return Object.freeze({ files, directories });
}

export function validateExceptionalReleaseArtifact({
  artifactRoot,
  worktreeRoot,
  manifest,
  expectedHead,
  expectedPolicyVersion,
  expectedPolicyHash,
  expectedRequestHash,
  expectedArtifactHash,
} = {}) {
  const errors = validateExceptionalReleaseArtifactManifest(manifest, {
    expectedHead,
    expectedPolicyVersion,
    expectedPolicyHash,
    expectedRequestHash,
    expectedArtifactHash,
  });
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) {
    return [...errors, "artifactRoot debe ser una ruta absoluta."];
  }
  if (typeof worktreeRoot !== "string" || !path.isAbsolute(worktreeRoot)) {
    return [...errors, "worktreeRoot debe ser una ruta absoluta."];
  }
  try {
    const worktreeStats = lstatSync(worktreeRoot);
    if (!worktreeStats.isDirectory() || worktreeStats.isSymbolicLink()) {
      errors.push("worktreeRoot debe ser un directorio regular.");
      return [...new Set(errors)];
    }
    const rootStats = lstatSync(artifactRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      errors.push(
        "artifactRoot debe ser un directorio regular, no un symlink.",
      );
      return [...new Set(errors)];
    }
    if ((rootStats.mode & 0o7777) !== 0o700) {
      errors.push("artifactRoot no tiene modo 0700.");
    }
    const uid = currentUid();
    if (uid !== null && rootStats.uid !== uid) {
      errors.push("artifactRoot no pertenece al usuario actual.");
    }
    const realArtifactRoot = realpathSync(artifactRoot);
    const realWorktreeRoot = realpathSync(worktreeRoot);
    assertSameStableDirectory(
      rootStats,
      lstatSync(artifactRoot),
      "artifactRoot",
    );
    if (isPathInsideOrEqual(realArtifactRoot, realWorktreeRoot)) {
      errors.push("El artifact debe quedar fuera del worktree.");
    }
    const tree = collectArtifactTree(artifactRoot, rootStats);
    if (Array.isArray(manifest?.files)) {
      const expectedFiles = manifest.files.map(({ path, size, sha256 }) => ({
        path,
        size,
        sha256,
      }));
      if (JSON.stringify(tree.files) !== JSON.stringify(expectedFiles)) {
        const expectedPaths = new Set(expectedFiles.map((entry) => entry.path));
        const actualPaths = new Set(tree.files.map((entry) => entry.path));
        for (const expectedPath of expectedPaths) {
          if (!actualPaths.has(expectedPath)) {
            errors.push(`Falta el archivo congelado ${expectedPath}.`);
          }
        }
        for (const actualPath of actualPaths) {
          if (!expectedPaths.has(actualPath)) {
            errors.push(
              `El artifact contiene un archivo extra: ${actualPath}.`,
            );
          }
        }
        for (const expected of expectedFiles) {
          const actual = tree.files.find(
            (entry) => entry.path === expected.path,
          );
          if (
            actual &&
            (actual.size !== expected.size || actual.sha256 !== expected.sha256)
          ) {
            errors.push(
              `El archivo congelado ${expected.path} fue modificado.`,
            );
          }
        }
      }
      const expectedDirectories = expectedArtifactDirectories(manifest.files);
      if (
        JSON.stringify(tree.directories) !== JSON.stringify(expectedDirectories)
      ) {
        const expectedSet = new Set(expectedDirectories);
        const actualSet = new Set(tree.directories);
        for (const expectedDirectory of expectedSet) {
          if (!actualSet.has(expectedDirectory)) {
            errors.push(`Falta el directorio congelado ${expectedDirectory}/.`);
          }
        }
        for (const actualDirectory of actualSet) {
          if (!expectedSet.has(actualDirectory)) {
            errors.push(
              `El artifact contiene un directorio extra: ${actualDirectory}/.`,
            );
          }
        }
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return [...new Set(errors)];
}

function validateRequestAndDestinationPaths({
  requestPath,
  worktreeRoot,
  artifactPurpose = "primary",
}) {
  const { artifactRoot, manifestPath } = deriveExceptionalReleaseArtifactPaths(
    requestPath,
    { artifactPurpose },
  );
  if (typeof worktreeRoot !== "string" || !path.isAbsolute(worktreeRoot)) {
    throw new Error("worktreeRoot debe ser una ruta absoluta.");
  }
  if (requestPath !== path.resolve(requestPath)) {
    throw new Error(
      "requestPath debe estar normalizado y no contener aliases.",
    );
  }
  const worktreeStats = lstatSync(worktreeRoot);
  if (!worktreeStats.isDirectory() || worktreeStats.isSymbolicLink()) {
    throw new Error("worktreeRoot debe ser un directorio regular.");
  }
  const requestStats = lstatSync(requestPath);
  if (!requestStats.isFile() || requestStats.isSymbolicLink()) {
    throw new Error("requestPath debe ser un archivo regular, no un symlink.");
  }
  const uid = currentUid();
  if (uid !== null && requestStats.uid !== uid) {
    throw new Error("requestPath no pertenece al usuario actual.");
  }
  const requestParent = path.dirname(requestPath);
  const parentStats = lstatSync(requestParent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error("El padre de requestPath debe ser un directorio regular.");
  }
  if ((parentStats.mode & 0o7777) !== 0o700) {
    throw new Error("El padre de requestPath debe tener modo exacto 0700.");
  }
  if (uid !== null && parentStats.uid !== uid) {
    throw new Error("El padre de requestPath no pertenece al usuario actual.");
  }
  const realWorktreeRoot = realpathSync(worktreeRoot);
  const realRequestPath = realpathSync(requestPath);
  const realParent = realpathSync(requestParent);
  if (
    realRequestPath !== path.resolve(requestPath) ||
    realParent !== path.resolve(requestParent)
  ) {
    throw new Error(
      "requestPath no puede atravesar symlinks en sus ancestros.",
    );
  }
  if (
    isPathInsideOrEqual(realRequestPath, realWorktreeRoot) ||
    isPathInsideOrEqual(realParent, realWorktreeRoot) ||
    isPathInsideOrEqual(path.resolve(artifactRoot), realWorktreeRoot) ||
    isPathInsideOrEqual(path.resolve(manifestPath), realWorktreeRoot)
  ) {
    throw new Error(
      "El request y el artifact deben quedar fuera del worktree.",
    );
  }
  if (
    path.dirname(artifactRoot) !== requestParent ||
    path.dirname(manifestPath) !== requestParent
  ) {
    throw new Error("El artifact debe ser hermano del request.");
  }
  assertSameStableDirectory(
    parentStats,
    lstatSync(requestParent),
    requestParent,
  );
  return Object.freeze({
    artifactRoot,
    manifestPath,
    requestParent,
    parentStats,
  });
}

function assertRequestBindings({
  requestPath,
  head,
  policyVersion,
  policyHash,
  requestHash,
}) {
  const requestStats = lstatSync(requestPath);
  const requestSource = readRegularFileNoFollow(requestPath, {
    maxBytes: MAX_REQUEST_BYTES,
    expectedStats: requestStats,
  });
  if (sha256Buffer(requestSource) !== requestHash) {
    throw new Error("El requestHash no coincide con el request actual.");
  }
  let request;
  try {
    request = JSON.parse(requestSource);
  } catch {
    throw new Error("El request no contiene JSON válido.");
  }
  if (!isPlainObject(request)) {
    throw new Error("El request debe ser un objeto JSON.");
  }
  if (
    requestSource.toString("utf8") !==
    canonicalExceptionalReleaseArtifactJson(request)
  ) {
    throw new Error("El request no usa el formato JSON canónico exacto.");
  }
  if (request.head !== head) {
    throw new Error("El HEAD del request no coincide con el artifact.");
  }
  if (request.policyVersion !== policyVersion) {
    throw new Error(
      "La policyVersion del request no coincide con el artifact.",
    );
  }
  if (request.policyHash !== policyHash) {
    throw new Error("El policyHash del request no coincide con el artifact.");
  }
  return request;
}

export function assertExceptionalArtifactRequestSource(manifest, request) {
  const openUpdate =
    request.schemaVersion === "agorbis-exceptional-release-request/v2";
  if (openUpdate) {
    if (
      request.releaseMode !== "OPEN_UPDATE" ||
      manifest.schemaVersion !==
        EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION ||
      manifest.releaseMode !== request.releaseMode ||
      manifest.openSourceBaselineSha256 !== request.openSourceBaselineSha256 ||
      canonicalExceptionalReleaseArtifactJson(manifest.openSourceBaseline) !==
        canonicalExceptionalReleaseArtifactJson(request.openSourceBaseline)
    ) {
      throw new Error(
        "El origen OPEN del artifact no coincide con su request fijado.",
      );
    }
  } else if (
    (request.schemaVersion !== undefined &&
      request.schemaVersion !== "agorbis-exceptional-release-request/v1") ||
    Object.hasOwn(request, "releaseMode") ||
    Object.hasOwn(request, "openSourceBaseline") ||
    Object.hasOwn(request, "openSourceBaselineSha256") ||
    manifest.schemaVersion !== EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION
  ) {
    throw new Error(
      "El artifact y el request no comparten el perfil de release.",
    );
  }
  return true;
}

function assertBindings({
  head,
  policyVersion,
  policyHash,
  requestHash,
  expectedArtifactHash,
}) {
  const errors = validateExpectedBindings({
    expectedHead: head,
    expectedPolicyVersion: policyVersion,
    expectedPolicyHash: policyHash,
    expectedRequestHash: requestHash,
    expectedArtifactHash,
  });
  if (errors.length > 0) {
    throw new Error(`Bindings de artifact inválidos:\n${errors.join("\n")}`);
  }
}

export function freezeExceptionalReleaseArtifact({
  repositoryRoot,
  requestPath,
  artifactPurpose = "primary",
  head,
  policyVersion,
  policyHash,
  requestHash,
  now = new Date(),
  verifyWranglerIntegrityImpl = verifyExceptionalWranglerIntegrity,
} = {}) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) {
    throw new Error("repositoryRoot debe ser una ruta absoluta.");
  }
  const repositoryStats = lstatSync(repositoryRoot);
  if (!repositoryStats.isDirectory() || repositoryStats.isSymbolicLink()) {
    throw new Error("repositoryRoot debe ser un directorio regular.");
  }
  const realRepositoryRoot = realpathSync(repositoryRoot);
  if (realRepositoryRoot !== path.resolve(repositoryRoot)) {
    throw new Error("repositoryRoot no puede atravesar symlinks.");
  }
  assertBindings({ head, policyVersion, policyHash, requestHash });
  const timestamp =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("now debe representar un timestamp válido.");
  }
  const wranglerIntegrity = assertPinnedRuntime(
    repositoryRoot,
    verifyWranglerIntegrityImpl,
  );
  assertExceptionalCutoverConfigurations(repositoryRoot);
  const { artifactRoot, manifestPath, requestParent, parentStats } =
    validateRequestAndDestinationPaths({
      requestPath,
      worktreeRoot: repositoryRoot,
      artifactPurpose,
    });
  const sourceRequest = assertRequestBindings({
    requestPath,
    head,
    policyVersion,
    policyHash,
    requestHash,
  });
  if (pathExists(artifactRoot) || pathExists(manifestPath)) {
    throw new Error(
      "El artifact o su manifest ya existen; no se sobrescriben.",
    );
  }
  if (artifactPurpose === "recovery") {
    if (sourceRequest.releaseMode !== "OPEN_UPDATE")
      throw new Error("Un fallback requiere request OPEN_UPDATE.");
    const errors = validateOpenRecoveryConfiguration(
      readWranglerConfiguration(
        path.join(repositoryRoot, "wrangler.open-recovery.jsonc"),
      ),
      readWranglerConfiguration(path.join(repositoryRoot, "wrangler.jsonc")),
    );
    if (errors.length) throw new Error(errors.join("\n"));
  }
  const inventory = collectSourceInventory(repositoryRoot, artifactPurpose);
  const openUpdate =
    sourceRequest.schemaVersion === "agorbis-exceptional-release-request/v2";
  if (openUpdate)
    assertOpenReleaseBaselineRecord({
      baseline: sourceRequest.openSourceBaseline,
      expectedBaselineSha256: sourceRequest.openSourceBaselineSha256,
      nowUtc: timestamp.toISOString(),
    });
  const recoveryManifest =
    openUpdate && artifactPurpose === "primary"
      ? readExceptionalReleaseArtifactManifestFromDisk({
          requestPath,
          worktreeRoot: repositoryRoot,
          artifactPurpose: "recovery",
          expectedHead: head,
          expectedPolicyVersion: policyVersion,
          expectedPolicyHash: policyHash,
          expectedRequestHash: requestHash,
          verifyWranglerIntegrityImpl,
          requireExpectedArtifactHash: false,
        })
      : null;
  const payload = {
    schemaVersion: openUpdate
      ? EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION
      : EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
    ...(openUpdate
      ? {
          releaseMode: sourceRequest.releaseMode,
          artifactPurpose,
          recoveryArtifactHash: recoveryManifest?.contentSha256 ?? null,
          openSourceBaseline: sourceRequest.openSourceBaseline,
          openSourceBaselineSha256: sourceRequest.openSourceBaselineSha256,
        }
      : {}),
    head,
    policyVersion,
    policyHash,
    requestHash,
    createdAtUtc: timestamp.toISOString(),
    nodeVersion: EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
    wranglerVersion: EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
    wranglerLockHash: wranglerIntegrity.lockHash,
    wranglerClosureHash: wranglerIntegrity.closureHash,
    wranglerEntrypointHash: wranglerIntegrity.executionEntrypointHash,
    files: inventory.files.map(({ manifestEntry }) => ({ ...manifestEntry })),
  };
  const manifest = {
    ...payload,
    contentSha256: exceptionalReleaseArtifactHash(payload),
  };
  assertExceptionalArtifactRequestSource(manifest, sourceRequest);
  assertSameStableDirectory(
    parentStats,
    lstatSync(requestParent),
    requestParent,
  );
  mkdirSync(artifactRoot, { mode: 0o700 });
  const artifactRootStats = lstatSync(artifactRoot);
  if (
    !artifactRootStats.isDirectory() ||
    artifactRootStats.isSymbolicLink() ||
    (artifactRootStats.mode & 0o7777) !== 0o700
  ) {
    throw new Error("artifactRoot no quedó como directorio exacto 0700.");
  }
  for (const relativeDirectory of inventory.directories) {
    assertSameStableDirectory(
      artifactRootStats,
      lstatSync(artifactRoot),
      "artifactRoot",
    );
    const absoluteDirectory = path.join(
      artifactRoot,
      ...relativeDirectory.split("/"),
    );
    mkdirSync(absoluteDirectory, { mode: 0o700 });
    const directoryStats = lstatSync(absoluteDirectory);
    if (
      !directoryStats.isDirectory() ||
      directoryStats.isSymbolicLink() ||
      (directoryStats.mode & 0o7777) !== 0o700
    ) {
      throw new Error(`${relativeDirectory}/ no quedó con modo exacto 0700.`);
    }
  }
  for (const { sourcePath, manifestEntry } of inventory.files) {
    assertSameStableDirectory(
      artifactRootStats,
      lstatSync(artifactRoot),
      "artifactRoot",
    );
    const destinationPath = path.join(
      artifactRoot,
      ...manifestEntry.path.split("/"),
    );
    copyRegularFileExclusive(sourcePath, destinationPath, manifestEntry);
  }
  assertRequestBindings({
    requestPath,
    head,
    policyVersion,
    policyHash,
    requestHash,
  });
  assertSameStableDirectory(
    parentStats,
    lstatSync(requestParent),
    requestParent,
  );
  assertSameStableDirectory(
    artifactRootStats,
    lstatSync(artifactRoot),
    "artifactRoot",
  );
  writeExclusiveFile(
    manifestPath,
    canonicalExceptionalReleaseArtifactJson(manifest),
  );
  const validationErrors = validateExceptionalReleaseArtifact({
    artifactRoot,
    worktreeRoot: repositoryRoot,
    manifest,
    expectedHead: head,
    expectedPolicyVersion: policyVersion,
    expectedPolicyHash: policyHash,
    expectedRequestHash: requestHash,
    expectedArtifactHash: manifest.contentSha256,
  });
  if (validationErrors.length > 0) {
    throw new Error(
      `El artifact congelado no superó su autovalidación:\n${validationErrors.join("\n")}`,
    );
  }
  return deepFreeze({
    artifactRoot,
    manifestPath,
    artifactHash: manifest.contentSha256,
    artifactSha256: manifest.contentSha256,
    manifest,
  });
}

function readExceptionalReleaseArtifactManifestFromDisk({
  requestPath,
  artifactPurpose = "primary",
  worktreeRoot,
  expectedHead,
  expectedPolicyVersion,
  expectedPolicyHash,
  expectedRequestHash,
  expectedArtifactHash,
  verifyWranglerIntegrityImpl = verifyExceptionalWranglerIntegrity,
  requireExpectedArtifactHash = true,
} = {}) {
  const bindingErrors = validateExpectedBindings(
    {
      expectedHead,
      expectedPolicyVersion,
      expectedPolicyHash,
      expectedRequestHash,
      expectedArtifactHash,
    },
    { requireArtifactHash: requireExpectedArtifactHash },
  );
  if (bindingErrors.length > 0) {
    throw new Error(
      `Bindings de artifact inválidos:\n${bindingErrors.join("\n")}`,
    );
  }
  assertPinnedRuntime(worktreeRoot, verifyWranglerIntegrityImpl);
  const { artifactRoot, manifestPath, requestParent, parentStats } =
    validateRequestAndDestinationPaths({
      requestPath,
      worktreeRoot,
      artifactPurpose,
    });
  const sourceRequest = assertRequestBindings({
    requestPath,
    head: expectedHead,
    policyVersion: expectedPolicyVersion,
    policyHash: expectedPolicyHash,
    requestHash: expectedRequestHash,
  });
  assertSameStableDirectory(
    parentStats,
    lstatSync(requestParent),
    requestParent,
  );
  const manifestStats = lstatSync(manifestPath);
  if (!manifestStats.isFile() || manifestStats.isSymbolicLink()) {
    throw new Error("El manifest debe ser un archivo regular, no un symlink.");
  }
  if ((manifestStats.mode & 0o7777) !== 0o600) {
    throw new Error("El manifest no tiene modo 0600.");
  }
  const uid = currentUid();
  if (uid !== null && manifestStats.uid !== uid) {
    throw new Error("El manifest no pertenece al usuario actual.");
  }
  if (manifestStats.nlink !== 1) {
    throw new Error("El manifest no puede tener hard links.");
  }
  const source = readRegularFileNoFollow(manifestPath, {
    maxBytes: MAX_MANIFEST_BYTES,
    expectedStats: manifestStats,
  }).toString("utf8");
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    throw new Error("El manifest no contiene JSON válido.");
  }
  if (source !== canonicalExceptionalReleaseArtifactJson(manifest)) {
    throw new Error("El manifest no usa el formato JSON canónico exacto.");
  }
  assertExceptionalArtifactRequestSource(manifest, sourceRequest);
  if (sourceRequest.releaseMode === "OPEN_UPDATE") {
    if (manifest.artifactPurpose !== artifactPurpose)
      throw new Error("El propósito del artifact no corresponde a su ruta.");
    if (artifactPurpose === "primary")
      readExceptionalReleaseArtifactManifestFromDisk({
        requestPath,
        worktreeRoot,
        artifactPurpose: "recovery",
        expectedHead,
        expectedPolicyVersion,
        expectedPolicyHash,
        expectedRequestHash,
        expectedArtifactHash: manifest.recoveryArtifactHash,
        verifyWranglerIntegrityImpl,
      });
  } else if (artifactPurpose !== "primary")
    throw new Error("Un request legacy no admite fallback OPEN.");
  let internallyComputedArtifactHash;
  try {
    internallyComputedArtifactHash = exceptionalReleaseArtifactHash(manifest);
  } catch {
    internallyComputedArtifactHash = "0".repeat(64);
  }
  const validationErrors = validateExceptionalReleaseArtifact({
    artifactRoot,
    worktreeRoot,
    manifest,
    expectedHead,
    expectedPolicyVersion,
    expectedPolicyHash,
    expectedRequestHash,
    expectedArtifactHash:
      expectedArtifactHash ?? internallyComputedArtifactHash,
  });
  if (validationErrors.length > 0) {
    throw new Error(
      `Artifact excepcional inválido:\n${validationErrors.join("\n")}`,
    );
  }
  return deepFreeze(manifest);
}

export function readExceptionalReleaseArtifactManifest(options = {}) {
  return readExceptionalReleaseArtifactManifestFromDisk({
    ...options,
    requireExpectedArtifactHash: true,
  });
}

// Read-only review: unlike prepareOrReuse, this never builds or creates files.
// Publication still requires the external artifact hash fixed by the act.
export function readExceptionalReleaseArtifactForReview(options = {}) {
  return readExceptionalReleaseArtifactManifestFromDisk({
    ...options,
    requireExpectedArtifactHash: false,
  });
}

export function prepareOrReuseExceptionalReleaseArtifact({
  repositoryRoot,
  requestPath,
  artifactPurpose = "primary",
  head,
  policyVersion,
  policyHash,
  requestHash,
  expectedArtifactHash,
  now = new Date(),
  verifyWranglerIntegrityImpl = verifyExceptionalWranglerIntegrity,
} = {}) {
  assertBindings({
    head,
    policyVersion,
    policyHash,
    requestHash,
    expectedArtifactHash,
  });
  const { artifactRoot, manifestPath } = deriveExceptionalReleaseArtifactPaths(
    requestPath,
    { artifactPurpose },
  );
  const artifactExists = pathExists(artifactRoot);
  const manifestExists = pathExists(manifestPath);
  if (artifactExists !== manifestExists) {
    throw new Error(
      "El artifact y su manifest están en estado parcial; no se crea ni reutiliza ninguno.",
    );
  }
  if (!artifactExists) {
    if (expectedArtifactHash !== undefined) {
      throw new Error(
        "No existe el artifact anclado por expectedArtifactHash; no se recrea.",
      );
    }
    const frozen = freezeExceptionalReleaseArtifact({
      repositoryRoot,
      requestPath,
      artifactPurpose,
      head,
      policyVersion,
      policyHash,
      requestHash,
      now,
      verifyWranglerIntegrityImpl,
    });
    return frozen;
  }
  const manifest = readExceptionalReleaseArtifactManifestFromDisk({
    requestPath,
    artifactPurpose,
    worktreeRoot: repositoryRoot,
    expectedHead: head,
    expectedPolicyVersion: policyVersion,
    expectedPolicyHash: policyHash,
    expectedRequestHash: requestHash,
    expectedArtifactHash,
    verifyWranglerIntegrityImpl,
    requireExpectedArtifactHash: false,
  });
  return deepFreeze({
    artifactRoot,
    manifestPath,
    artifactHash: manifest.contentSha256,
    artifactSha256: manifest.contentSha256,
    manifest,
  });
}
