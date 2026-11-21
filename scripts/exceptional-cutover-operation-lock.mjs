import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { canonicalJson } from "./exceptional-release-act.mjs";

export const EXCEPTIONAL_CUTOVER_OPERATION_LOCK_SCHEMA_VERSION =
  "agorbis-exceptional-cutover-operation-lock/v1";
export const EXCEPTIONAL_CUTOVER_OPERATION_LOCK_FILENAME =
  "agorbis.production-mutation.lock";

const ACCOUNT_ID = "4d78fb10c1ae65281ec851479d5045dc";
const WORKER_NAME = "agorbis";
const FLOCK_BINARY = "/usr/bin/flock";
// Ubuntu noble amd64 util-linux 2.39.3-9ubuntu6.6 (USN-8702-1).
// El .deb oficial y su digest se verifican en PRODUCTION_RUNBOOK.md.
const FLOCK_BINARY_SHA256 =
  "e619344dc3eec4023498465679262f9ca27d1e8cef9cfc4c1ae72b428577b806";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const MAX_LOCK_BYTES = 16 * 1_024;

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("El lock operacional exige O_NOFOLLOW.");
}

const LOCK_OPEN_FLAGS =
  fsConstants.O_RDWR | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
const LOCK_CREATE_FLAGS =
  LOCK_OPEN_FLAGS | fsConstants.O_CREAT | fsConstants.O_EXCL;

export class ExceptionalCutoverOperationLockError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExceptionalCutoverOperationLockError";
    this.code = code;
  }
}

function lockError(code, message) {
  return new ExceptionalCutoverOperationLockError(code, message);
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function contentHash(value) {
  const { contentSha256: _contentSha256, ...payload } = value;
  return sha256(canonicalJson(payload));
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

function assertSafeLockFile(metadata, { allowEmpty = false } = {}) {
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o7777) !== 0o600 ||
    typeof process.getuid !== "function" ||
    metadata.uid !== process.getuid() ||
    metadata.nlink !== 1 ||
    metadata.size > MAX_LOCK_BYTES ||
    (!allowEmpty && metadata.size < 1)
  ) {
    throw lockError(
      "UNSAFE_OPERATION_LOCK",
      "El lock operacional no es un archivo seguro.",
    );
  }
}

function assertSafeStateRoot(stateRoot) {
  if (typeof stateRoot !== "string" || !path.isAbsolute(stateRoot)) {
    throw lockError(
      "INVALID_OPERATION_LOCK_INPUT",
      "El stateRoot del lock no es válido.",
    );
  }
  try {
    const metadata = lstatSync(stateRoot);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      (metadata.mode & 0o7777) !== 0o700 ||
      typeof process.getuid !== "function" ||
      metadata.uid !== process.getuid() ||
      realpathSync(stateRoot) !== stateRoot
    ) {
      throw new Error();
    }
  } catch {
    throw lockError(
      "INVALID_OPERATION_LOCK_INPUT",
      "El stateRoot del lock no es seguro.",
    );
  }
}

function assertPinnedFlock() {
  let digest;
  try {
    if (realpathSync(FLOCK_BINARY) !== FLOCK_BINARY) throw new Error();
    const metadata = lstatSync(FLOCK_BINARY);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error();
    digest = sha256(readFileSync(FLOCK_BINARY));
  } catch {
    throw lockError(
      "OPERATION_LOCK_FAILED",
      "No se pudo verificar el lock de sistema.",
    );
  }
  if (digest !== FLOCK_BINARY_SHA256) {
    throw lockError(
      "OPERATION_LOCK_FAILED",
      "El lock de sistema no coincide con el digest versionado.",
    );
  }
}

function processStartTicks(pid) {
  try {
    const source = readFileSync(`/proc/${pid}/stat`, "utf8");
    const closeParenthesis = source.lastIndexOf(")");
    if (closeParenthesis < 1) return null;
    const fields = source
      .slice(closeParenthesis + 2)
      .trim()
      .split(/\s+/u);
    const startTicks = fields[19];
    return /^\d+$/.test(startTicks ?? "") ? startTicks : null;
  } catch {
    return null;
  }
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

function writeCanonicalDescriptor(descriptor, value) {
  const source = Buffer.from(canonicalJson(value), "utf8");
  ftruncateSync(descriptor, 0);
  let offset = 0;
  while (offset < source.length) {
    offset += writeSync(
      descriptor,
      source,
      offset,
      source.length - offset,
      offset,
    );
  }
  fsyncSync(descriptor);
}

function readDescriptor(descriptor, size) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_LOCK_BYTES) {
    throw lockError(
      "OPERATION_LOCK_CHANGED",
      "El lock operacional tiene tamaño inválido.",
    );
  }
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < buffer.length) {
    const count = readSync(
      descriptor,
      buffer,
      offset,
      buffer.length - offset,
      offset,
    );
    if (count < 1) {
      throw lockError(
        "OPERATION_LOCK_CHANGED",
        "El lock operacional quedó truncado.",
      );
    }
    offset += count;
  }
  return buffer.toString("utf8");
}

function validateInputs({
  stateRoot,
  operation,
  requestHash,
  actHash,
  head,
  now,
}) {
  assertSafeStateRoot(stateRoot);
  if (
    !["open", "recovery"].includes(operation) ||
    !SHA256_PATTERN.test(requestHash ?? "") ||
    !SHA256_PATTERN.test(actHash ?? "") ||
    !FULL_HEAD_PATTERN.test(head ?? "") ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw lockError(
      "INVALID_OPERATION_LOCK_INPUT",
      "El contexto del lock operacional no es válido.",
    );
  }
}

export function acquireExceptionalCutoverOperationLock({
  stateRoot,
  operation,
  requestHash,
  actHash,
  head,
  now,
  spawnSyncImpl = spawnSync,
} = {}) {
  validateInputs({ stateRoot, operation, requestHash, actHash, head, now });
  const startTicks = processStartTicks(process.pid);
  if (startTicks === null) {
    throw lockError(
      "OPERATION_LOCK_FAILED",
      "No se pudo identificar el proceso del lock operacional.",
    );
  }
  assertPinnedFlock();
  const lockPath = path.join(
    stateRoot,
    EXCEPTIONAL_CUTOVER_OPERATION_LOCK_FILENAME,
  );
  let descriptor = null;
  try {
    let created = false;
    try {
      descriptor = openSync(lockPath, LOCK_CREATE_FLAGS, 0o600);
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      descriptor = openSync(lockPath, LOCK_OPEN_FLAGS);
    }
    if (created) fchmodSync(descriptor, 0o600);
    const opened = fstatSync(descriptor);
    assertSafeLockFile(opened, { allowEmpty: true });
    if (!sameFile(opened, lstatSync(lockPath))) throw new Error();
    const result = spawnSyncImpl(
      FLOCK_BINARY,
      ["--exclusive", "--nonblock", "3"],
      {
        env: Object.freeze({ LANG: "C", LC_ALL: "C" }),
        shell: false,
        stdio: ["ignore", "ignore", "ignore", descriptor],
        timeout: 5_000,
        windowsHide: true,
      },
    );
    if (result?.status === 1 && result?.signal === null) {
      throw lockError(
        "OPERATION_ALREADY_RUNNING",
        "Ya existe una mutación productiva activa para Agorbis.",
      );
    }
    if (result?.status !== 0 || result?.signal !== null || result?.error) {
      throw lockError(
        "OPERATION_LOCK_FAILED",
        "No se pudo adquirir el lock operacional.",
      );
    }
    if (!sameFile(fstatSync(descriptor), lstatSync(lockPath))) {
      throw lockError(
        "OPERATION_LOCK_FAILED",
        "El lock operacional fue sustituido.",
      );
    }
    const payload = {
      schemaVersion: EXCEPTIONAL_CUTOVER_OPERATION_LOCK_SCHEMA_VERSION,
      accountId: ACCOUNT_ID,
      workerName: WORKER_NAME,
      operation,
      requestHash,
      actHash,
      head,
      pid: process.pid,
      processStartTicks: startTicks,
      acquiredAtUtc: now.toISOString(),
    };
    const lock = Object.freeze({
      ...payload,
      contentSha256: contentHash(payload),
    });
    writeCanonicalDescriptor(descriptor, lock);
    const final = fstatSync(descriptor);
    assertSafeLockFile(final);
    if (!sameFile(final, lstatSync(lockPath))) {
      throw lockError(
        "OPERATION_LOCK_FAILED",
        "El lock operacional fue sustituido.",
      );
    }
    fsyncDirectory(stateRoot);
    return Object.freeze({ descriptor, lockPath, lock });
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    if (error instanceof ExceptionalCutoverOperationLockError) throw error;
    throw lockError(
      "OPERATION_LOCK_FAILED",
      "No se pudo adquirir el lock operacional.",
    );
  }
}

export function assertExceptionalCutoverOperationLock({
  descriptor,
  lockPath,
  lock,
} = {}) {
  try {
    const opened = fstatSync(descriptor);
    assertSafeLockFile(opened);
    if (!sameFile(opened, lstatSync(lockPath))) throw new Error();
    if (readDescriptor(descriptor, opened.size) !== canonicalJson(lock)) {
      throw new Error();
    }
  } catch (error) {
    if (
      error instanceof ExceptionalCutoverOperationLockError &&
      error.code === "OPERATION_LOCK_CHANGED"
    ) {
      throw error;
    }
    throw lockError("OPERATION_LOCK_CHANGED", "El lock operacional cambió.");
  }
}

export function releaseExceptionalCutoverOperationLock(acquired) {
  let failure = null;
  try {
    assertExceptionalCutoverOperationLock(acquired);
  } catch {
    failure = lockError(
      "OPERATION_LOCK_CHANGED",
      "El lock operacional cambió.",
    );
  } finally {
    try {
      closeSync(acquired?.descriptor);
    } catch {
      failure ??= lockError(
        "OPERATION_LOCK_CHANGED",
        "No se pudo liberar el lock operacional.",
      );
    }
  }
  if (failure) throw failure;
}
