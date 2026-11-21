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
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import {
  canonicalJson,
  exceptionalReleaseActContentHash,
  exceptionalReleaseRequestHash,
  renderExceptionalReleaseActMarkdown,
  validateExceptionalReleaseAct,
  validateExceptionalActSource,
  validateExceptionalReleaseRequest,
} from "./exceptional-release-act.mjs";
import { validateExceptionalReleaseArtifactManifest } from "./exceptional-release-artifact.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const EXCEPTIONAL_ACT_ISSUANCE_SCHEMA_VERSION =
  "agorbis-exceptional-act-issuance/v1";

const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const MAX_ISSUANCE_BYTES = 8 * 1_024;
const MAX_ACT_MARKDOWN_BYTES = 512 * 1_024;
const ISSUANCE_KEYS = Object.freeze([
  "actHash",
  "actMarkdownSha256",
  "artifactHash",
  "contentSha256",
  "expiresAtUtc",
  "head",
  "issuedAtUtc",
  "policyHash",
  "policyVersion",
  "requestHash",
  "schemaVersion",
]);

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("La emisión excepcional exige O_NOFOLLOW.");
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

function currentUid() {
  if (typeof process.getuid !== "function") {
    throw new Error("No se puede verificar el usuario efectivo.");
  }
  return process.getuid();
}

function assertSafeStateDirectory(directoryPath, label) {
  const metadata = lstatSync(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} debe ser un directorio regular.`);
  }
  if ((metadata.mode & 0o7777) !== 0o700) {
    throw new Error(`${label} debe tener modo 0700 exacto.`);
  }
  if (metadata.uid !== currentUid()) {
    throw new Error(`${label} debe pertenecer al usuario efectivo.`);
  }
  if (realpathSync(directoryPath) !== path.resolve(directoryPath)) {
    throw new Error(`${label} no puede atravesar symlinks.`);
  }
  return metadata;
}

function ensureDirectory(directoryPath, label) {
  mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  return assertSafeStateDirectory(directoryPath, label);
}

function assertSafeIssuanceFile(metadata, label) {
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} debe ser un archivo regular.`);
  }
  if ((metadata.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} debe tener modo 0600 exacto.`);
  }
  if (metadata.uid !== currentUid()) {
    throw new Error(`${label} debe pertenecer al usuario efectivo.`);
  }
  if (metadata.nlink !== 1) {
    throw new Error(`${label} no puede tener hard links.`);
  }
  if (metadata.size < 1 || metadata.size > MAX_ISSUANCE_BYTES) {
    throw new Error(`${label} está vacío o excede el límite.`);
  }
}

function assertSafeMarkdownFile(metadata, label) {
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} debe ser un archivo regular.`);
  }
  if ((metadata.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} debe tener modo 0600 exacto.`);
  }
  if (metadata.uid !== currentUid()) {
    throw new Error(`${label} debe pertenecer al usuario efectivo.`);
  }
  if (metadata.nlink !== 1) {
    throw new Error(`${label} no puede tener hard links.`);
  }
  if (metadata.size < 1 || metadata.size > MAX_ACT_MARKDOWN_BYTES) {
    throw new Error(`${label} está vacío o excede el límite.`);
  }
}

function sameFile(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
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

function writeAll(descriptor, source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(descriptor, buffer, offset, buffer.length - offset);
  }
}

function writeCanonicalExclusive(filePath, value) {
  const source = canonicalJson(value);
  if (
    Buffer.byteLength(source) < 1 ||
    Buffer.byteLength(source) > MAX_ISSUANCE_BYTES
  ) {
    throw new Error("El issuance está vacío o excede el límite.");
  }
  let descriptor = null;
  try {
    descriptor = openSync(filePath, WRITE_FLAGS, 0o600);
    fchmodSync(descriptor, 0o600);
    writeAll(descriptor, source);
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor);
    assertSafeIssuanceFile(opened, "El issuance abierto");
    closeSync(descriptor);
    descriptor = null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  const finalMetadata = lstatSync(filePath);
  assertSafeIssuanceFile(finalMetadata, "El issuance final");
  fsyncDirectory(path.dirname(filePath));
}

function readCanonicalSecure(filePath) {
  const initial = lstatSync(filePath);
  assertSafeIssuanceFile(initial, "El issuance");
  let descriptor = null;
  let source;
  let final;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    assertSafeIssuanceFile(opened, "El issuance abierto");
    if (!sameFile(initial, opened)) {
      throw new Error("El issuance cambió antes de abrirse.");
    }
    source = readFileSync(descriptor, "utf8");
    final = fstatSync(descriptor);
    if (!sameFile(opened, final) || Buffer.byteLength(source) !== final.size) {
      throw new Error("El issuance cambió durante la lectura.");
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  if (!sameFile(final, lstatSync(filePath))) {
    throw new Error("El issuance fue sustituido durante la lectura.");
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("El issuance no contiene JSON válido.");
  }
  if (source !== canonicalJson(value)) {
    throw new Error("El issuance no usa JSON canónico exacto.");
  }
  return value;
}

function readAndValidateActMarkdown({ requestPath, act }) {
  if (
    typeof requestPath !== "string" ||
    !path.isAbsolute(requestPath) ||
    !requestPath.endsWith(".json") ||
    CONTROL_OR_BIDI_PATTERN.test(requestPath)
  ) {
    throw new Error("requestPath del Markdown no es seguro.");
  }
  const markdownPath = `${requestPath.slice(0, -".json".length)}.act.md`;
  const initial = lstatSync(markdownPath);
  assertSafeMarkdownFile(initial, "El acta Markdown");
  let descriptor = null;
  let source;
  let final;
  try {
    descriptor = openSync(markdownPath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    assertSafeMarkdownFile(opened, "El acta Markdown abierta");
    if (!sameFile(initial, opened)) {
      throw new Error("El acta Markdown cambió antes de abrirse.");
    }
    source = readFileSync(descriptor, "utf8");
    final = fstatSync(descriptor);
    if (!sameFile(opened, final) || Buffer.byteLength(source) !== final.size) {
      throw new Error("El acta Markdown cambió durante la lectura.");
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  if (!sameFile(final, lstatSync(markdownPath))) {
    throw new Error("El acta Markdown fue sustituida durante la lectura.");
  }
  const expected = renderExceptionalReleaseActMarkdown(act);
  if (source !== expected) {
    throw new Error("El acta Markdown no coincide con el acta JSON.");
  }
  return Object.freeze({ markdownPath, sha256: sha256(source) });
}

export function exceptionalActIssuanceContentHash(recordOrPayload) {
  if (!isPlainObject(recordOrPayload)) {
    throw new Error("El issuance debe ser un objeto.");
  }
  const { contentSha256: _contentSha256, ...payload } = recordOrPayload;
  return sha256(canonicalJson(payload));
}

export function resolveExceptionalActIssuanceStateRoot({
  userInfoImpl = userInfo,
} = {}) {
  const currentUser = userInfoImpl();
  if (
    currentUser === null ||
    typeof currentUser !== "object" ||
    Array.isArray(currentUser) ||
    currentUser.uid !== currentUid() ||
    typeof currentUser.homedir !== "string" ||
    !path.isAbsolute(currentUser.homedir) ||
    CONTROL_OR_BIDI_PATTERN.test(currentUser.homedir)
  ) {
    throw new Error("No se pudo resolver el state root canónico.");
  }
  return path.join(
    path.resolve(currentUser.homedir),
    ".local",
    "state",
    "agorbis",
    "exceptional-cutovers",
  );
}

export function deriveExceptionalActIssuancePath({
  stateRoot,
  requestHash,
} = {}) {
  if (
    typeof stateRoot !== "string" ||
    !path.isAbsolute(stateRoot) ||
    CONTROL_OR_BIDI_PATTERN.test(stateRoot) ||
    !SHA256_PATTERN.test(requestHash ?? "")
  ) {
    throw new Error("Bindings de ruta de issuance inválidos.");
  }
  return path.join(
    path.resolve(stateRoot),
    "issued",
    `${requestHash}.issued.json`,
  );
}

export function createExceptionalActIssuance({
  request,
  act,
  artifactManifest,
} = {}) {
  const requestHash = exceptionalReleaseRequestHash(request);
  const actHash = exceptionalReleaseActContentHash(act);
  const requestErrors = validateExceptionalReleaseRequest(request, {
    currentHead: request?.head,
    now: act?.timestampUtc,
  });
  const actErrors = [
    ...validateExceptionalReleaseAct(act),
    ...validateExceptionalActSource({ request, act, artifactManifest }),
  ];
  const artifactErrors = validateExceptionalReleaseArtifactManifest(
    artifactManifest,
    {
      expectedHead: request?.head,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: requestHash,
      expectedArtifactHash: act?.artifactHash,
    },
  );
  if (
    requestErrors.length > 0 ||
    actErrors.length > 0 ||
    artifactErrors.length > 0 ||
    act?.contentSha256 !== actHash ||
    act?.requestHash !== requestHash ||
    artifactManifest?.contentSha256 !== act?.artifactHash
  ) {
    throw new Error("Request, acta y artifact no permiten emitir el issuance.");
  }
  const payload = {
    schemaVersion: EXCEPTIONAL_ACT_ISSUANCE_SCHEMA_VERSION,
    head: request.head,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash,
    artifactHash: act.artifactHash,
    actHash,
    actMarkdownSha256: sha256(renderExceptionalReleaseActMarkdown(act)),
    issuedAtUtc: act.timestampUtc,
    expiresAtUtc: act.expiresAtUtc,
  };
  return Object.freeze({
    ...payload,
    contentSha256: exceptionalActIssuanceContentHash(payload),
  });
}

export function validateExceptionalActIssuance(
  issuance,
  { request, act, artifactManifest, expectedActHash } = {},
) {
  const errors = [
    ...validateExceptionalActSource({ request, act, artifactManifest }),
  ];
  if (!sameKeys(issuance, ISSUANCE_KEYS)) {
    return ["El issuance contiene claves desconocidas o incompletas."];
  }
  let requestHash;
  let actualActHash;
  let actMarkdownHash;
  try {
    requestHash = exceptionalReleaseRequestHash(request);
    actualActHash = exceptionalReleaseActContentHash(act);
  } catch {
    errors.push("No se pudieron calcular los bindings del issuance.");
  }
  try {
    actMarkdownHash = sha256(renderExceptionalReleaseActMarkdown(act));
  } catch {
    errors.push("No se pudo validar el acta Markdown del issuance.");
  }
  if (issuance.schemaVersion !== EXCEPTIONAL_ACT_ISSUANCE_SCHEMA_VERSION) {
    errors.push("schemaVersion de issuance desconocido.");
  }
  if (
    issuance.head !== request?.head ||
    issuance.head !== act?.head ||
    !FULL_HEAD_PATTERN.test(issuance.head ?? "")
  ) {
    errors.push("El HEAD del issuance no coincide.");
  }
  if (
    issuance.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    issuance.policyHash !== RELEASE_GATE_POLICY_SHA256 ||
    issuance.policyVersion !== request?.policyVersion ||
    issuance.policyVersion !== act?.policyVersion ||
    issuance.policyHash !== request?.policyHash ||
    issuance.policyHash !== act?.policyHash
  ) {
    errors.push("La policy del issuance no coincide.");
  }
  if (
    issuance.requestHash !== requestHash ||
    issuance.requestHash !== act?.requestHash
  ) {
    errors.push("El requestHash del issuance no coincide.");
  }
  if (
    issuance.artifactHash !== artifactManifest?.contentSha256 ||
    issuance.artifactHash !== act?.artifactHash
  ) {
    errors.push("El artifactHash del issuance no coincide.");
  }
  if (
    !SHA256_PATTERN.test(expectedActHash ?? "") ||
    issuance.actHash !== expectedActHash ||
    issuance.actHash !== actualActHash ||
    issuance.actHash !== act?.contentSha256
  ) {
    errors.push("El actHash externo, emitido y actual no coinciden.");
  }
  if (
    !SHA256_PATTERN.test(issuance.actMarkdownSha256 ?? "") ||
    issuance.actMarkdownSha256 !== actMarkdownHash
  ) {
    errors.push("El hash del acta Markdown no coincide.");
  }
  if (
    !isCanonicalUtcTimestamp(issuance.issuedAtUtc) ||
    !isCanonicalUtcTimestamp(issuance.expiresAtUtc) ||
    issuance.issuedAtUtc !== act?.timestampUtc ||
    issuance.expiresAtUtc !== act?.expiresAtUtc
  ) {
    errors.push("Los timestamps del issuance no coinciden con el acta.");
  }
  if (
    !SHA256_PATTERN.test(issuance.contentSha256 ?? "") ||
    issuance.contentSha256 !== exceptionalActIssuanceContentHash(issuance)
  ) {
    errors.push("contentSha256 del issuance no coincide.");
  }
  return [...new Set(errors)];
}

export function prepareExceptionalActIssuance({
  requestPath,
  request,
  act,
  artifactManifest,
} = {}) {
  const issuance = createExceptionalActIssuance({
    request,
    act,
    artifactManifest,
  });
  const markdown = readAndValidateActMarkdown({ requestPath, act });
  if (markdown.sha256 !== issuance.actMarkdownSha256) {
    throw new Error("El acta Markdown no coincide con el issuance.");
  }
  return issuance;
}

function issueExceptionalActAtStateRoot({
  requestPath,
  request,
  act,
  artifactManifest,
  stateRoot,
} = {}) {
  const issuance = prepareExceptionalActIssuance({
    requestPath,
    request,
    act,
    artifactManifest,
  });
  ensureDirectory(stateRoot, "El state root excepcional");
  const issuedRoot = path.join(stateRoot, "issued");
  ensureDirectory(issuedRoot, "El directorio de issuance");
  fsyncDirectory(stateRoot);
  const issuancePath = deriveExceptionalActIssuancePath({
    stateRoot,
    requestHash: issuance.requestHash,
  });
  writeCanonicalExclusive(issuancePath, issuance);
  return Object.freeze({ issuance, issuancePath });
}

export function writeExceptionalActIssuanceTestFixture({
  requestPath,
  request,
  act,
  artifactManifest,
  stateRoot,
} = {}) {
  if (
    typeof stateRoot !== "string" ||
    !path.isAbsolute(stateRoot) ||
    CONTROL_OR_BIDI_PATTERN.test(stateRoot)
  ) {
    throw new Error(
      "El fixture de issuance exige un stateRoot absoluto no canónico explícito.",
    );
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  if (resolvedStateRoot === resolveExceptionalActIssuanceStateRoot()) {
    throw new Error(
      "El fixture de tests no puede escribir el state root canónico.",
    );
  }
  return issueExceptionalActAtStateRoot({
    requestPath,
    request,
    act,
    artifactManifest,
    stateRoot: resolvedStateRoot,
  });
}

export function readExceptionalActIssuance({
  requestPath,
  stateRoot = resolveExceptionalActIssuanceStateRoot(),
  request,
  act,
  artifactManifest,
  expectedActHash,
} = {}) {
  assertSafeStateDirectory(stateRoot, "El state root excepcional");
  const issuedRoot = path.join(stateRoot, "issued");
  assertSafeStateDirectory(issuedRoot, "El directorio de issuance");
  const requestHash = exceptionalReleaseRequestHash(request);
  const issuancePath = deriveExceptionalActIssuancePath({
    stateRoot,
    requestHash,
  });
  const issuance = readCanonicalSecure(issuancePath);
  const markdown = readAndValidateActMarkdown({ requestPath, act });
  const errors = validateExceptionalActIssuance(issuance, {
    request,
    act,
    artifactManifest,
    expectedActHash,
  });
  if (errors.length > 0) {
    throw new Error(`Issuance excepcional inválido:\n${errors.join("\n")}`);
  }
  if (markdown.sha256 !== issuance.actMarkdownSha256) {
    throw new Error("El acta Markdown fue modificada.");
  }
  return Object.freeze({ issuance: Object.freeze(issuance), issuancePath });
}
