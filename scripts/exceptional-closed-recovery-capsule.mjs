import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { canonicalJson } from "./exceptional-release-act.mjs";
import { validateExceptionalClosedRecoveryConfigurations } from "./exceptional-cutover-config-policy.mjs";
import { parseJsonc } from "./cloudflare-worker-policy.mjs";
import {
  EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
  EXCEPTIONAL_CUTOVER_WORKER_NAME,
} from "./exceptional-release-cutover-policy.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const EXCEPTIONAL_CLOSED_RECOVERY_CAPSULE_SCHEMA_VERSION =
  "agorbis-exceptional-closed-recovery-capsule/v1";
export const EXCEPTIONAL_CLOSED_RECOVERY_PUBLICATION_SCHEMA_VERSION =
  "agorbis-exceptional-closed-recovery-publication/v1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const MAX_FILE_BYTES = 1 * 1_024 * 1_024;
const MAX_MANIFEST_BYTES = 32 * 1_024;
const CAPSULE_MANIFEST_NAME = "capsule.json";
const CAPSULE_PUBLICATION_NAME = "publication.json";
const RECOVERY_FILES = Object.freeze([
  "exceptional-release-empty.env",
  "wrangler.crons-closed.jsonc",
  "wrangler.traffic.jsonc",
]);
const MANIFEST_KEYS = Object.freeze([
  "accountId",
  "actHash",
  "artifactHash",
  "closedDeploymentId",
  "closedVersionId",
  "contentSha256",
  "createdAtUtc",
  "files",
  "head",
  "issuanceHash",
  "policyHash",
  "policyVersion",
  "requestHash",
  "schemaVersion",
  "workerName",
]);
const FILE_KEYS = Object.freeze(["path", "sha256", "size"]);
const PUBLICATION_KEYS = Object.freeze([
  "capsuleHash",
  "contentSha256",
  "directoryName",
  "requestHash",
  "schemaVersion",
]);

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("La cápsula CLOSED exige O_NOFOLLOW.");
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

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected)
  );
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function currentUid() {
  if (typeof process.getuid !== "function") {
    throw new Error("No se puede verificar el usuario efectivo.");
  }
  return process.getuid();
}

function assertSafeDirectory(directoryPath, label) {
  const metadata = lstatSync(directoryPath);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o7777) !== 0o700 ||
    metadata.uid !== currentUid() ||
    realpathSync(directoryPath) !== path.resolve(directoryPath)
  ) {
    throw new Error(`${label} no es un directorio 0700 seguro.`);
  }
  return metadata;
}

function assertSafeFile(
  metadata,
  label,
  maxBytes = MAX_FILE_BYTES,
  expectedLinks = 1,
) {
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o7777) !== 0o600 ||
    metadata.uid !== currentUid() ||
    metadata.nlink !== expectedLinks ||
    metadata.size < 0 ||
    metadata.size > maxBytes
  ) {
    throw new Error(`${label} no es un archivo 0600 seguro.`);
  }
}

function sameFile(left, right) {
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

function readStableFile(filePath, { maxBytes = MAX_FILE_BYTES } = {}) {
  const initial = lstatSync(filePath);
  if (
    !initial.isFile() ||
    initial.isSymbolicLink() ||
    initial.size > maxBytes
  ) {
    throw new Error(`${filePath} no es un archivo fuente seguro.`);
  }
  let descriptor = null;
  let source;
  let final;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameFile(initial, opened)) {
      throw new Error(`${filePath} cambió antes de abrirse.`);
    }
    source = readFileSync(descriptor);
    final = fstatSync(descriptor);
    if (!sameFile(opened, final) || source.length !== final.size) {
      throw new Error(`${filePath} cambió durante la lectura.`);
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  if (!sameFile(final, lstatSync(filePath))) {
    throw new Error(`${filePath} fue sustituido durante la lectura.`);
  }
  return source;
}

function readCapsuleFile(
  filePath,
  maxBytes = MAX_FILE_BYTES,
  { expectedLinks = 1, includeMetadata = false } = {},
) {
  const initial = lstatSync(filePath);
  assertSafeFile(initial, filePath, maxBytes, expectedLinks);
  let descriptor = null;
  let source;
  let final;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    assertSafeFile(opened, filePath, maxBytes, expectedLinks);
    if (!sameFile(initial, opened)) {
      throw new Error(`${filePath} cambió antes de abrirse.`);
    }
    source = readFileSync(descriptor);
    final = fstatSync(descriptor);
    if (!sameFile(opened, final) || source.length !== final.size) {
      throw new Error(`${filePath} cambió durante la lectura.`);
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  if (!sameFile(final, lstatSync(filePath))) {
    throw new Error(`${filePath} fue sustituido.`);
  }
  return includeMetadata ? Object.freeze({ source, metadata: final }) : source;
}

function writeAll(descriptor, source) {
  let offset = 0;
  while (offset < source.length) {
    offset += writeSync(descriptor, source, offset, source.length - offset);
  }
}

function writeExclusive(filePath, source) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, WRITE_FLAGS, 0o600);
    fchmodSync(descriptor, 0o600);
    writeAll(descriptor, source);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  assertSafeFile(lstatSync(filePath), filePath);
}

function fsyncDirectory(directoryPath) {
  const descriptor = openSync(
    directoryPath,
    fsConstants.O_RDONLY |
      (fsConstants.O_DIRECTORY ?? 0) |
      (fsConstants.O_CLOEXEC ?? 0) |
      fsConstants.O_NOFOLLOW,
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function exceptionalClosedRecoveryCapsuleHash(manifestOrPayload) {
  if (!isPlainObject(manifestOrPayload)) {
    throw new Error("El manifest de cápsula debe ser un objeto.");
  }
  const { contentSha256: _contentSha256, ...payload } = manifestOrPayload;
  return sha256(canonicalJson(payload));
}

export function deriveExceptionalClosedRecoveryCapsulePath({
  stateRoot,
  requestHash,
  capsuleHash,
  nonce,
} = {}) {
  if (
    typeof stateRoot !== "string" ||
    !path.isAbsolute(stateRoot) ||
    CONTROL_OR_BIDI_PATTERN.test(stateRoot) ||
    !SHA256_PATTERN.test(requestHash ?? "") ||
    !SHA256_PATTERN.test(capsuleHash ?? "") ||
    !/^[0-9a-f]{32}$/.test(nonce ?? "")
  ) {
    throw new Error("La ruta de cápsula no es segura.");
  }
  return path.join(
    path.resolve(stateRoot),
    `${requestHash}.${capsuleHash}.${nonce}.closed-capsule`,
  );
}

export function deriveExceptionalClosedRecoveryPublicationPath({
  stateRoot,
  requestHash,
} = {}) {
  if (
    typeof stateRoot !== "string" ||
    !path.isAbsolute(stateRoot) ||
    CONTROL_OR_BIDI_PATTERN.test(stateRoot) ||
    !SHA256_PATTERN.test(requestHash ?? "")
  ) {
    throw new Error("La ruta de publicación CLOSED no es segura.");
  }
  return path.join(
    path.resolve(stateRoot),
    `${requestHash}.closed-capsule.pointer.json`,
  );
}

function publicationHash(publicationOrPayload) {
  if (!isPlainObject(publicationOrPayload)) {
    throw new Error("La publicación CLOSED debe ser un objeto.");
  }
  const { contentSha256: _contentSha256, ...payload } = publicationOrPayload;
  return sha256(canonicalJson(payload));
}

function validateBindings({
  requestHash,
  actHash,
  issuanceHash,
  artifactHash,
  closedDeploymentId,
  closedVersionId,
  head,
}) {
  if (
    ![requestHash, actHash, issuanceHash, artifactHash].every((value) =>
      SHA256_PATTERN.test(value ?? ""),
    ) ||
    !VERSION_ID_PATTERN.test(closedDeploymentId ?? "") ||
    !VERSION_ID_PATTERN.test(closedVersionId ?? "") ||
    !FULL_HEAD_PATTERN.test(head ?? "")
  ) {
    throw new Error("Los bindings de la cápsula CLOSED son inválidos.");
  }
}

function validateManifest(
  manifest,
  {
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
  },
) {
  const errors = [];
  if (!sameKeys(manifest, MANIFEST_KEYS)) {
    return ["El manifest de cápsula contiene claves inválidas."];
  }
  if (
    manifest.schemaVersion !==
    EXCEPTIONAL_CLOSED_RECOVERY_CAPSULE_SCHEMA_VERSION
  ) {
    errors.push("schemaVersion de cápsula desconocido.");
  }
  if (
    manifest.accountId !== EXCEPTIONAL_CUTOVER_ACCOUNT_ID ||
    manifest.workerName !== EXCEPTIONAL_CUTOVER_WORKER_NAME
  ) {
    errors.push("La cuenta o Worker de la cápsula no coinciden.");
  }
  if (
    manifest.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    manifest.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("La policy de la cápsula no coincide.");
  }
  for (const [name, expected] of Object.entries({
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
  })) {
    if (manifest[name] !== expected) {
      errors.push(`${name} de la cápsula no coincide.`);
    }
  }
  if (!isCanonicalTimestamp(manifest.createdAtUtc)) {
    errors.push("createdAtUtc de cápsula no es canónico.");
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== RECOVERY_FILES.length
  ) {
    errors.push("La cápsula no enumera exactamente tres archivos.");
  } else {
    const paths = [];
    for (const [index, file] of manifest.files.entries()) {
      if (
        !sameKeys(file, FILE_KEYS) ||
        !RECOVERY_FILES.includes(file.path) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        !SHA256_PATTERN.test(file.sha256 ?? "")
      ) {
        errors.push(`files[${index}] de cápsula es inválido.`);
      }
      paths.push(file?.path);
    }
    if (JSON.stringify(paths) !== JSON.stringify(RECOVERY_FILES)) {
      errors.push("Los archivos de cápsula no conservan el orden exacto.");
    }
  }
  if (
    !SHA256_PATTERN.test(manifest.contentSha256 ?? "") ||
    manifest.contentSha256 !== exceptionalClosedRecoveryCapsuleHash(manifest)
  ) {
    errors.push("contentSha256 de cápsula no coincide.");
  }
  return [...new Set(errors)];
}

function validateCapsuleTree(capsuleRoot, manifest, expectedBindings) {
  assertSafeDirectory(capsuleRoot, "La cápsula CLOSED");
  const entries = readdirSync(capsuleRoot).sort();
  const expectedEntries = [
    ...RECOVERY_FILES,
    CAPSULE_MANIFEST_NAME,
    CAPSULE_PUBLICATION_NAME,
  ].sort();
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    throw new Error("La cápsula contiene archivos faltantes o extra.");
  }
  const manifestErrors = validateManifest(manifest, expectedBindings);
  if (manifestErrors.length > 0) {
    throw new Error(
      `Manifest de cápsula inválido:\n${manifestErrors.join("\n")}`,
    );
  }
  const sources = new Map();
  for (const expected of manifest.files) {
    const source = readCapsuleFile(path.join(capsuleRoot, expected.path));
    if (source.length !== expected.size || sha256(source) !== expected.sha256) {
      throw new Error(`El archivo ${expected.path} de la cápsula cambió.`);
    }
    sources.set(expected.path, source);
  }
  if (sources.get("exceptional-release-empty.env").length !== 0) {
    throw new Error("El env de recovery no está vacío.");
  }
  const configurationErrors = validateExceptionalClosedRecoveryConfigurations({
    closed: parseJsonc(
      sources.get("wrangler.crons-closed.jsonc").toString("utf8"),
      "wrangler.crons-closed.jsonc",
    ),
    traffic: parseJsonc(
      sources.get("wrangler.traffic.jsonc").toString("utf8"),
      "wrangler.traffic.jsonc",
    ),
  });
  if (configurationErrors.length > 0) {
    throw new Error(configurationErrors.join("\n"));
  }
  return Object.freeze({ sources });
}

function readPublishedCapsule({
  stateRoot,
  requestHash,
  actHash,
  issuanceHash,
  artifactHash,
  closedDeploymentId,
  closedVersionId,
  head,
  expectedCapsuleHash,
}) {
  const publicationPath = deriveExceptionalClosedRecoveryPublicationPath({
    stateRoot,
    requestHash,
  });
  const published = readCapsuleFile(publicationPath, MAX_MANIFEST_BYTES, {
    expectedLinks: 2,
    includeMetadata: true,
  });
  const publicationSource = published.source.toString("utf8");
  let publication;
  try {
    publication = JSON.parse(publicationSource);
  } catch {
    throw new Error("La publicación CLOSED no es JSON válido.");
  }
  if (
    publicationSource !== canonicalJson(publication) ||
    !sameKeys(publication, PUBLICATION_KEYS) ||
    publication.schemaVersion !==
      EXCEPTIONAL_CLOSED_RECOVERY_PUBLICATION_SCHEMA_VERSION ||
    publication.requestHash !== requestHash ||
    !SHA256_PATTERN.test(publication.capsuleHash ?? "") ||
    (expectedCapsuleHash !== undefined &&
      publication.capsuleHash !== expectedCapsuleHash) ||
    publication.contentSha256 !== publicationHash(publication)
  ) {
    throw new Error("La publicación CLOSED no coincide con sus bindings.");
  }
  const directoryPattern = new RegExp(
    `^${requestHash}\\.${publication.capsuleHash}\\.([0-9a-f]{32})\\.closed-capsule$`,
    "u",
  );
  const match = directoryPattern.exec(publication.directoryName ?? "");
  if (!match) {
    throw new Error("La publicación CLOSED apunta a un directorio inválido.");
  }
  const capsuleRoot = deriveExceptionalClosedRecoveryCapsulePath({
    stateRoot,
    requestHash,
    capsuleHash: publication.capsuleHash,
    nonce: match[1],
  });
  if (path.basename(capsuleRoot) !== publication.directoryName) {
    throw new Error("La publicación CLOSED salió del namespace permitido.");
  }
  assertSafeDirectory(capsuleRoot, "La cápsula CLOSED publicada");
  const sourcePublicationPath = path.join(
    capsuleRoot,
    CAPSULE_PUBLICATION_NAME,
  );
  const sourcePublication = readCapsuleFile(
    sourcePublicationPath,
    MAX_MANIFEST_BYTES,
    { expectedLinks: 2, includeMetadata: true },
  );
  if (
    !sameFile(published.metadata, sourcePublication.metadata) ||
    !published.source.equals(sourcePublication.source)
  ) {
    throw new Error("El enlace atómico de publicación CLOSED no coincide.");
  }
  const manifestSource = readCapsuleFile(
    path.join(capsuleRoot, CAPSULE_MANIFEST_NAME),
    MAX_MANIFEST_BYTES,
  ).toString("utf8");
  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch {
    throw new Error("El manifest de cápsula no es JSON válido.");
  }
  if (manifestSource !== canonicalJson(manifest)) {
    throw new Error("El manifest de cápsula no es canónico.");
  }
  validateCapsuleTree(capsuleRoot, manifest, {
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
  });
  if (
    manifest.contentSha256 !== publication.capsuleHash ||
    !sameFile(published.metadata, lstatSync(publicationPath)) ||
    !sameFile(sourcePublication.metadata, lstatSync(sourcePublicationPath))
  ) {
    throw new Error("La publicación CLOSED cambió durante la lectura.");
  }
  return Object.freeze({
    capsuleRoot,
    publicationPath,
    manifest: Object.freeze(manifest),
    capsuleHash: manifest.contentSha256,
  });
}

function durablyReadPublishedCapsule(options) {
  const initial = readPublishedCapsule(options);
  fsyncDirectory(options.stateRoot);
  const durable = readPublishedCapsule(options);
  if (
    initial.capsuleRoot !== durable.capsuleRoot ||
    initial.publicationPath !== durable.publicationPath ||
    initial.capsuleHash !== durable.capsuleHash ||
    canonicalJson(initial.manifest) !== canonicalJson(durable.manifest)
  ) {
    throw new Error("La publicación CLOSED cambió al hacerla durable.");
  }
  return durable;
}

export function createExceptionalClosedRecoveryCapsule({
  stateRoot,
  artifactRoot,
  artifactManifest,
  requestHash,
  actHash,
  issuanceHash,
  artifactHash,
  closedDeploymentId,
  closedVersionId,
  head,
  now = new Date(),
  randomBytesImpl = randomBytes,
} = {}) {
  assertSafeDirectory(stateRoot, "El state root excepcional");
  validateBindings({
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
  });
  if (
    artifactManifest?.contentSha256 !== artifactHash ||
    !Array.isArray(artifactManifest?.files)
  ) {
    throw new Error("El artifact no coincide con la cápsula.");
  }
  const createdAt = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error("El timestamp de cápsula no es válido.");
  }
  const publicationPath = deriveExceptionalClosedRecoveryPublicationPath({
    stateRoot,
    requestHash,
  });
  try {
    lstatSync(publicationPath);
    return durablyReadPublishedCapsule({
      stateRoot,
      requestHash,
      actHash,
      issuanceHash,
      artifactHash,
      closedDeploymentId,
      closedVersionId,
      head,
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const sources = new Map();
  const files = [];
  for (const relativePath of RECOVERY_FILES) {
    const expected = artifactManifest.files.find(
      (entry) => entry.path === relativePath,
    );
    if (!expected) throw new Error(`El artifact no contiene ${relativePath}.`);
    const source = readStableFile(path.join(artifactRoot, relativePath));
    if (source.length !== expected.size || sha256(source) !== expected.sha256) {
      throw new Error(`${relativePath} no coincide con el artifact.`);
    }
    sources.set(relativePath, source);
    files.push({
      path: relativePath,
      size: source.length,
      sha256: sha256(source),
    });
  }
  const payload = {
    schemaVersion: EXCEPTIONAL_CLOSED_RECOVERY_CAPSULE_SCHEMA_VERSION,
    accountId: EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
    workerName: EXCEPTIONAL_CUTOVER_WORKER_NAME,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
    createdAtUtc: createdAt.toISOString(),
    files,
  };
  const manifest = {
    ...payload,
    contentSha256: exceptionalClosedRecoveryCapsuleHash(payload),
  };
  const random = randomBytesImpl(16);
  if (!Buffer.isBuffer(random) || random.length !== 16) {
    throw new Error("No se pudo crear el namespace único de la cápsula.");
  }
  const nonce = random.toString("hex");
  const capsuleRoot = deriveExceptionalClosedRecoveryCapsulePath({
    stateRoot,
    requestHash,
    capsuleHash: manifest.contentSha256,
    nonce,
  });
  mkdirSync(capsuleRoot, { mode: 0o700 });
  assertSafeDirectory(capsuleRoot, "La cápsula CLOSED");
  for (const relativePath of RECOVERY_FILES) {
    writeExclusive(
      path.join(capsuleRoot, relativePath),
      sources.get(relativePath),
    );
  }
  writeExclusive(
    path.join(capsuleRoot, CAPSULE_MANIFEST_NAME),
    Buffer.from(canonicalJson(manifest), "utf8"),
  );
  const publicationPayload = {
    schemaVersion: EXCEPTIONAL_CLOSED_RECOVERY_PUBLICATION_SCHEMA_VERSION,
    requestHash,
    capsuleHash: manifest.contentSha256,
    directoryName: path.basename(capsuleRoot),
  };
  const publication = {
    ...publicationPayload,
    contentSha256: publicationHash(publicationPayload),
  };
  const sourcePublicationPath = path.join(
    capsuleRoot,
    CAPSULE_PUBLICATION_NAME,
  );
  writeExclusive(
    sourcePublicationPath,
    Buffer.from(canonicalJson(publication), "utf8"),
  );
  fsyncDirectory(capsuleRoot);
  validateCapsuleTree(capsuleRoot, manifest, {
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
  });
  fsyncDirectory(stateRoot);
  try {
    linkSync(sourcePublicationPath, publicationPath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return durablyReadPublishedCapsule({
      stateRoot,
      requestHash,
      actHash,
      issuanceHash,
      artifactHash,
      closedDeploymentId,
      closedVersionId,
      head,
    });
  }
  const sourceMetadata = lstatSync(sourcePublicationPath);
  const publishedMetadata = lstatSync(publicationPath);
  assertSafeFile(sourceMetadata, sourcePublicationPath, MAX_MANIFEST_BYTES, 2);
  assertSafeFile(publishedMetadata, publicationPath, MAX_MANIFEST_BYTES, 2);
  if (!sameFile(sourceMetadata, publishedMetadata)) {
    throw new Error("La publicación atómica CLOSED no conserva su inode.");
  }
  fsyncDirectory(stateRoot);
  return readPublishedCapsule({
    stateRoot,
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
    expectedCapsuleHash: manifest.contentSha256,
  });
}

export function readExceptionalClosedRecoveryCapsule({
  stateRoot,
  requestHash,
  actHash,
  issuanceHash,
  artifactHash,
  closedDeploymentId,
  closedVersionId,
  head,
  expectedCapsuleHash,
} = {}) {
  assertSafeDirectory(stateRoot, "El state root excepcional");
  validateBindings({
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
  });
  if (!SHA256_PATTERN.test(expectedCapsuleHash ?? "")) {
    throw new Error("El capsuleHash externo no es válido.");
  }
  return readPublishedCapsule({
    stateRoot,
    requestHash,
    actHash,
    issuanceHash,
    artifactHash,
    closedDeploymentId,
    closedVersionId,
    head,
    expectedCapsuleHash,
  });
}
