import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  canonicalJson,
  validateExceptionalReleaseRequestPath,
} from "./exceptional-release-act.mjs";
import { findKnownSecrets } from "./secret-patterns.mjs";
import {
  assertD72OpenUpdateEvidenceCertificate,
  assertD72OpenUpdateEvidenceCertificateIssued,
  d72OpenUpdateEvidenceCertificateHash,
} from "./d72-open-update-evidence-policy.mjs";

if (!Number.isInteger(constants.O_NOFOLLOW))
  throw new Error("El certificado exige O_NOFOLLOW.");
const MAX_BYTES = 1024 * 1024;
const READ =
  constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_CLOEXEC ?? 0);
const WRITE =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW |
  (constants.O_CLOEXEC ?? 0);

function invariant(value, message) {
  if (!value) throw new Error(message);
}
function sameFile(a, b) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    a.uid === b.uid &&
    a.nlink === b.nlink &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
function fileChecks(stat) {
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o7777) === 0o600 &&
      stat.uid === process.getuid(),
    "El certificado exige archivo regular privado 0600 sin enlaces.",
  );
  invariant(
    stat.size > 0 && stat.size <= MAX_BYTES,
    "Tamaño del certificado fuera de límites.",
  );
}

export function deriveOpenUpdateEvidencePath(requestPath) {
  invariant(
    typeof requestPath === "string" &&
      path.isAbsolute(requestPath) &&
      requestPath === path.resolve(requestPath) &&
      requestPath.endsWith(".json") &&
      !/[\x00-\x1f\x7f]/.test(requestPath),
    "Ruta de request inválida.",
  );
  return `${requestPath.slice(0, -5)}.open-update-evidence.json`;
}

function location(requestPath, worktreeRoot, diagnostic = false) {
  const errors = validateExceptionalReleaseRequestPath({
    requestPath,
    worktreeRoot,
  });
  invariant(
    errors.length === 0,
    "La ruta del request no cumple los controles de archivo y directorio privados.",
  );
  const file = diagnostic
    ? deriveOpenUpdateEvidencePath(requestPath).replace(
        /\.open-update-evidence\.json$/,
        ".open-update-diagnostic.json",
      )
    : deriveOpenUpdateEvidencePath(requestPath);
  const parent = path.dirname(file);
  const stat = lstatSync(parent);
  invariant(
    realpathSync(parent) === parent &&
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o7777) === 0o700 &&
      stat.uid === process.getuid(),
    "El certificado exige directorio privado 0700 sin aliases.",
  );
  return { file, parent, stat };
}

function unchangedParent(parent, before) {
  const after = lstatSync(parent);
  invariant(
    before.dev === after.dev &&
      before.ino === after.ino &&
      before.mode === after.mode &&
      before.uid === after.uid &&
      realpathSync(parent) === parent,
    "Cambió el directorio del certificado.",
  );
}

// Only the observing runtime may issue this document. A caller-provided map of
// passing booleans cannot acquire production authority through persistence.
export function writeOpenUpdateEvidenceFile({
  requestPath,
  worktreeRoot,
  certificate,
}) {
  assertD72OpenUpdateEvidenceCertificateIssued(certificate, {
    allowTestOnly: false,
  });
  const { file, parent, stat } = location(
    requestPath,
    worktreeRoot,
    certificate.promotionAllowed === false,
  );
  const source = canonicalJson(certificate);
  invariant(
    Buffer.byteLength(source) <= MAX_BYTES &&
      findKnownSecrets(source).length === 0,
    "El certificado contiene datos no permitidos.",
  );
  let fd;
  try {
    unchangedParent(parent, stat);
    fd = openSync(file, WRITE, 0o600);
    fchmodSync(fd, 0o600);
    writeFileSync(fd, source, "utf8");
    fsyncSync(fd);
    fileChecks(fstatSync(fd));
    invariant(
      sameFile(fstatSync(fd), lstatSync(file)),
      "Cambió el certificado durante su escritura.",
    );
    unchangedParent(parent, stat);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const directory = openSync(parent, READ | constants.O_DIRECTORY);
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  return Object.freeze({
    path: file,
    contentSha256: d72OpenUpdateEvidenceCertificateHash(certificate),
  });
}

export function readOpenUpdateEvidenceFile({
  requestPath,
  worktreeRoot,
  request,
  artifactManifest,
  expectedCertificateHash,
  now = new Date(),
  requirePromotionReady = false,
}) {
  const { file, parent, stat } = location(requestPath, worktreeRoot);
  let fd;
  let source;
  try {
    const before = lstatSync(file);
    fileChecks(before);
    fd = openSync(file, READ);
    invariant(
      sameFile(before, fstatSync(fd)),
      "Cambió el certificado antes de abrirlo.",
    );
    source = readFileSync(fd, "utf8");
    invariant(
      sameFile(before, fstatSync(fd)) && sameFile(before, lstatSync(file)),
      "Cambió el certificado durante su lectura.",
    );
    unchangedParent(parent, stat);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  invariant(
    findKnownSecrets(source).length === 0,
    "El certificado contiene datos no permitidos.",
  );
  const certificate = JSON.parse(source);
  invariant(
    canonicalJson(certificate) === source,
    "El certificado no usa el JSON canónico exacto.",
  );
  assertD72OpenUpdateEvidenceCertificate(certificate, {
    expectedCertificateHash:
      expectedCertificateHash ?? certificate.contentSha256,
    request,
    artifactManifest,
    now,
    requirePromotionReady,
  });
  return certificate;
}
