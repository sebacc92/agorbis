import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  sha256File,
  sha256FileAsync,
  verifyBackupChecksumIndex,
  verifyBackupDirectory,
} from "./supabase-backup-lib.mjs";

export const ENCRYPTED_PACKAGE_FORMAT_V1 =
  "agorbis-encrypted-backup-package/v1";
export const ENCRYPTED_PACKAGE_FORMAT_V2 =
  "agorbis-encrypted-backup-package/v2";
export const ENCRYPTED_TRANSFER_FORMAT_V3 =
  "agorbis-encrypted-backup-transfer/v3";
export const ENCRYPTED_TRANSFER_CHECKSUM_SUFFIX = ".sha256";

const ENCRYPTED_PACKAGE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9_-]*\.tar\.gpg$/;

export function environmentWithoutTarOptions(environment = process.env) {
  const sanitized = { ...environment };
  delete sanitized.TAR_OPTIONS;
  return sanitized;
}

export function assertEncryptionGpgStatus(statusOutput, mode) {
  const lines = parseGpgStatus(statusOutput, "cifrado");
  const hasBegin = lines.some((line) => /^BEGIN_ENCRYPTION\b/.test(line));
  const hasEnd = lines.some((line) => line === "END_ENCRYPTION");
  const symmetricRequest = lines.find((line) =>
    line.startsWith("NEED_PASSPHRASE_SYM "),
  );
  const recipients = lines.filter((line) => line.startsWith("ENC_TO "));
  if (!hasBegin || !hasEnd) {
    throw new Error("GPG no acreditó inicio/fin del cifrado.");
  }
  if (mode === "symmetric") {
    if (
      symmetricRequest !== "NEED_PASSPHRASE_SYM 9 3 10" ||
      recipients.length
    ) {
      throw new Error("GPG no acreditó AES256/S2K3/SHA512 simétrico.");
    }
  } else if (!recipients.length || symmetricRequest) {
    throw new Error("GPG no acreditó cifrado al destinatario public-key.");
  }
}

export function assertDecryptionGpgStatus(statusOutput) {
  const lines = parseGpgStatus(statusOutput, "descifrado");
  if (!lines.includes("DECRYPTION_OKAY")) {
    throw new Error("GPG no acreditó DECRYPTION_OKAY.");
  }
}

function parseGpgStatus(statusOutput, label) {
  if (typeof statusOutput !== "string" || !statusOutput.trim()) {
    throw new Error(`GPG no emitió status de ${label}.`);
  }
  return statusOutput
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.match(/^\[GNUPG:\] ([A-Z_]+(?: .*)?)$/);
      if (!match) throw new Error(`Status GPG de ${label} inválido.`);
      return match[1];
    });
}

export function writeJsonTemporaryExclusive(filePath, value, state) {
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    state.created = true;
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function writeTextTemporaryExclusive(filePath, value, state) {
  if (typeof value !== "string" || !value) {
    throw new Error("El contenido temporal debe ser texto no vacío.");
  }
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    state.created = true;
    writeFileSync(descriptor, value);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directoryPath) {
  const descriptor = openSync(
    directoryPath,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function publishFileNoReplace(partialPath, finalPath, state) {
  const partialDirectory = path.dirname(path.resolve(partialPath));
  const finalDirectory = path.dirname(path.resolve(finalPath));
  if (partialDirectory !== finalDirectory) {
    throw new Error("La publicación atómica exige el mismo directorio.");
  }
  const descriptor = openSync(partialPath, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  linkSync(partialPath, finalPath);
  state.published = true;
  fsyncDirectory(finalDirectory);
  unlinkSync(partialPath);
  state.partialRemoved = true;
  fsyncDirectory(finalDirectory);
}

export function assertPrivateControlledDirectory(directoryPath, label) {
  const resolved = path.resolve(directoryPath);
  if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) {
    throw new Error(
      `${label} debe existir y ser un directorio, no un symlink.`,
    );
  }
  const metadata = statSync(resolved);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} debe ser privado (sin permisos group/other).`);
  }
  if (
    typeof process.getuid === "function" &&
    metadata.uid !== process.getuid()
  ) {
    throw new Error(`${label} debe pertenecer al usuario actual.`);
  }
  return resolved;
}

function assertPrivateControlledFile(filePath, label) {
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved) || !lstatSync(resolved).isFile()) {
    throw new Error(`${label} debe ser un archivo regular, no un symlink.`);
  }
  const metadata = statSync(resolved);
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} debe ser privado (sin permisos group/other).`);
  }
  if (
    typeof process.getuid === "function" &&
    metadata.uid !== process.getuid()
  ) {
    throw new Error(`${label} debe pertenecer al usuario actual.`);
  }
  return resolved;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} contiene campos inesperados o incompletos.`);
  }
}

function assertIsoTimestamp(value, label) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} no es un timestamp ISO canónico.`);
  }
}

function assertCommonManifestFields(manifest, packagePath) {
  if (
    typeof manifest.sourceBackupFormat !== "string" ||
    !/^agorbis-supabase-backup\/v[1-9][0-9]*$/.test(
      manifest.sourceBackupFormat,
    ) ||
    typeof manifest.sourceBackupId !== "string" ||
    !/^agorbis-[A-Za-z0-9._:-]+$/.test(manifest.sourceBackupId) ||
    !/^[a-f0-9]{64}$/.test(manifest.sourceManifestSha256 ?? "") ||
    !Number.isSafeInteger(manifest.sourceChecksumCount) ||
    manifest.sourceChecksumCount < 1
  ) {
    throw new Error("El manifiesto cifrado no identifica un backup válido.");
  }
  if (
    manifest.ciphertext.file !== path.basename(packagePath) ||
    !Number.isSafeInteger(manifest.ciphertext.bytes) ||
    manifest.ciphertext.bytes < 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.ciphertext.sha256 ?? "")
  ) {
    throw new Error("La declaración del ciphertext es inválida.");
  }
  assertIsoTimestamp(manifest.packagedAt, "packagedAt");
}

function validateV1Manifest(manifest, packagePath) {
  assertExactKeys(
    manifest,
    [
      "ciphertext",
      "format",
      "packagedAt",
      "sourceBackupFormat",
      "sourceBackupId",
      "sourceChecksumCount",
      "sourceManifestSha256",
    ],
    "manifiesto cifrado v1",
  );
  assertExactKeys(
    manifest.ciphertext,
    ["bytes", "encryption", "file", "recipientFingerprint", "sha256"],
    "ciphertext v1",
  );
  if (
    manifest.ciphertext.encryption !==
      "OpenPGP public-key encryption via GnuPG" ||
    !/^(?:[A-F0-9]{40}|[A-F0-9]{64})$/.test(
      manifest.ciphertext.recipientFingerprint ?? "",
    )
  ) {
    throw new Error("El cifrado v1 no coincide con el formato histórico.");
  }
  assertCommonManifestFields(manifest, packagePath);
}

function validateV2Manifest(manifest, packagePath) {
  assertExactKeys(
    manifest,
    [
      "archiveRoot",
      "ciphertext",
      "decryptionVerification",
      "format",
      "packagedAt",
      "sourceBackupFormat",
      "sourceBackupId",
      "sourceChecksumCount",
      "sourceManifestSha256",
    ],
    "manifiesto cifrado v2",
  );
  if (
    typeof manifest.archiveRoot !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(manifest.archiveRoot)
  ) {
    throw new Error("archiveRoot es inválido.");
  }
  assertExactKeys(
    manifest.ciphertext,
    ["bytes", "encryption", "file", "sha256"],
    "ciphertext v2",
  );
  const encryption = manifest.ciphertext.encryption;
  if (manifest.ciphertext.file !== `${manifest.archiveRoot}.tar.gpg`) {
    throw new Error("El filename v2 no coincide con archiveRoot.tar.gpg.");
  }
  if (encryption?.mode === "openpgp-public-key") {
    assertExactKeys(
      encryption,
      ["implementation", "mode", "recipientFingerprint"],
      "cifrado public-key",
    );
    if (
      encryption.implementation !== "GnuPG" ||
      !/^(?:[A-F0-9]{40}|[A-F0-9]{64})$/.test(
        encryption.recipientFingerprint ?? "",
      )
    ) {
      throw new Error("La identidad de cifrado public-key es inválida.");
    }
  } else if (encryption?.mode === "openpgp-symmetric-aes256") {
    assertExactKeys(
      encryption,
      ["cipher", "implementation", "keyDerivation", "mode", "passphraseInput"],
      "cifrado simétrico",
    );
    if (
      encryption.implementation !== "GnuPG" ||
      encryption.cipher !== "AES256" ||
      encryption.keyDerivation !== "iterated-and-salted-S2K-SHA512" ||
      encryption.passphraseInput !== "GnuPG-pinentry-only"
    ) {
      throw new Error("Los parámetros de cifrado simétrico son inválidos.");
    }
  } else {
    throw new Error("El modo de cifrado v2 no está permitido.");
  }
  assertExactKeys(
    manifest.decryptionVerification,
    [
      "method",
      "sourceBackupId",
      "sourceChecksumCount",
      "sourceManifestSha256",
      "verifiedAt",
    ],
    "verificación de descifrado",
  );
  if (
    manifest.decryptionVerification.method !==
      "decrypt-extract-verify-manifest-and-sha256-index" ||
    manifest.decryptionVerification.sourceBackupId !==
      manifest.sourceBackupId ||
    manifest.decryptionVerification.sourceChecksumCount !==
      manifest.sourceChecksumCount ||
    manifest.decryptionVerification.sourceManifestSha256 !==
      manifest.sourceManifestSha256
  ) {
    throw new Error(
      "La prueba de descifrado no coincide con el backup fuente.",
    );
  }
  assertIsoTimestamp(
    manifest.decryptionVerification.verifiedAt,
    "decryptionVerification.verifiedAt",
  );
  assertCommonManifestFields(manifest, packagePath);
}

export function encryptedTransferArtifactPaths(packagePath) {
  const resolvedPackage = path.resolve(packagePath);
  const basename = path.basename(resolvedPackage);
  if (!ENCRYPTED_PACKAGE_BASENAME.test(basename)) {
    throw new Error("El paquete cifrado no tiene un basename seguro.");
  }
  return {
    checksumPath: `${resolvedPackage}${ENCRYPTED_TRANSFER_CHECKSUM_SUFFIX}`,
  };
}

export function serializeEncryptedTransferChecksum(packagePath, sha256) {
  const basename = path.basename(path.resolve(packagePath));
  if (
    !ENCRYPTED_PACKAGE_BASENAME.test(basename) ||
    !/^[a-f0-9]{64}$/.test(sha256 ?? "")
  ) {
    throw new Error(
      "No se puede serializar un checksum de transferencia seguro.",
    );
  }
  return `${sha256}  ${basename}\n`;
}

export async function readAndValidateEncryptedTransfer(
  packagePath,
  checksumPath,
) {
  const resolvedPackage = path.resolve(packagePath);
  const expected = encryptedTransferArtifactPaths(resolvedPackage);
  if (path.resolve(checksumPath) !== expected.checksumPath) {
    throw new Error(
      "El checksum debe usar el nombre seguro junto al ciphertext.",
    );
  }
  assertPrivateControlledFile(resolvedPackage, "El paquete cifrado");
  assertPrivateControlledFile(
    expected.checksumPath,
    "El checksum de transferencia",
  );
  const checksumText = readFileSync(expected.checksumPath, "utf8");
  const match = checksumText.match(
    /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9_-]*\.tar\.gpg)\n$/,
  );
  if (!match || match[2] !== path.basename(resolvedPackage)) {
    throw new Error("El checksum de transferencia no coincide exactamente.");
  }
  const ciphertextBytes = statSync(resolvedPackage).size;
  if (
    ciphertextBytes < 1 ||
    (await sha256FileAsync(resolvedPackage)) !== match[1]
  ) {
    throw new Error(
      "El ciphertext no coincide con su checksum de transferencia.",
    );
  }
  return {
    format: ENCRYPTED_TRANSFER_FORMAT_V3,
    ciphertext: {
      bytes: ciphertextBytes,
      file: path.basename(resolvedPackage),
      sha256: match[1],
    },
  };
}

export async function readAndValidateEncryptedPackage(
  packagePath,
  manifestPath,
) {
  const resolvedPackage = path.resolve(packagePath);
  const resolvedManifest = path.resolve(manifestPath);
  for (const [candidate, label] of [
    [resolvedPackage, "paquete cifrado"],
    [resolvedManifest, "manifiesto cifrado"],
  ]) {
    if (!existsSync(candidate) || !lstatSync(candidate).isFile()) {
      throw new Error(`${label} debe ser un archivo regular existente.`);
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolvedManifest, "utf8"));
  } catch {
    throw new Error("El manifiesto cifrado no es JSON válido.");
  }
  if (manifest.format === ENCRYPTED_PACKAGE_FORMAT_V1) {
    validateV1Manifest(manifest, resolvedPackage);
  } else if (manifest.format === ENCRYPTED_PACKAGE_FORMAT_V2) {
    validateV2Manifest(manifest, resolvedPackage);
  } else {
    throw new Error("Formato de paquete cifrado no soportado.");
  }
  if (
    manifest.ciphertext.bytes !== statSync(resolvedPackage).size ||
    manifest.ciphertext.sha256 !== (await sha256FileAsync(resolvedPackage))
  ) {
    throw new Error(
      "El paquete no coincide en bytes/SHA-256 con su manifiesto.",
    );
  }
  return manifest;
}

function collectStderr(stream, label) {
  const chunks = [];
  let bytes = 0;
  stream.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) {
      stream.destroy(new Error(`${label} excedió el límite de stderr.`));
      return;
    }
    chunks.push(chunk);
  });
  return () => Buffer.concat(chunks).toString("utf8").trim();
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

function runTarInspection(args, label) {
  const result = spawnSync("tar", args, {
    encoding: "utf8",
    env: environmentWithoutTarOptions(),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(
      `${label} falló: ${result.error?.message ?? result.stderr?.trim() ?? String(result.signal ?? result.status)}.`,
    );
  }
  if (result.stderr.trim()) {
    throw new Error(
      `${label} produjo stderr inesperado: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function decodeSafeTarName(displayName) {
  if (/^[A-Za-z0-9._/-]+$/.test(displayName)) return displayName;
  if (/^"[A-Za-z0-9._/-]+"$/.test(displayName)) {
    return displayName.slice(1, -1);
  }
  throw new Error(`Miembro tar fuera de la raíz segura: ${displayName}.`);
}

function assertSafeTarArchive(tarPath, archiveRoot) {
  const namesOutput = runTarInspection(
    ["--list", "--quoting-style=c", "--file", tarPath],
    "Inventario tar",
  );
  const verboseOutput = runTarInspection(
    [
      "--list",
      "--verbose",
      "--numeric-owner",
      "--quoting-style=c",
      "--file",
      tarPath,
    ],
    "Inventario tipado tar",
  );
  if (
    namesOutput.includes("\0") ||
    namesOutput.includes("\r") ||
    verboseOutput.includes("\0") ||
    verboseOutput.includes("\r")
  ) {
    throw new Error("El tar contiene controles no permitidos.");
  }
  const displayedNames = namesOutput.split("\n").filter(Boolean);
  const verboseLines = verboseOutput.split("\n").filter(Boolean);
  if (
    displayedNames.length < 2 ||
    displayedNames.length !== verboseLines.length
  ) {
    throw new Error("El inventario tar está vacío o es inconsistente.");
  }
  const seen = new Set();
  for (const displayName of displayedNames) {
    const name = decodeSafeTarName(displayName);
    if (name !== `${archiveRoot}/` && !name.startsWith(`${archiveRoot}/`)) {
      throw new Error(`Miembro tar fuera de la raíz segura: ${name}.`);
    }
    const withoutTrailingSlash = name.replace(/\/$/, "");
    const segments = withoutTrailingSlash.split("/");
    if (
      segments.some(
        (segment) => !segment || segment === "." || segment === "..",
      ) ||
      path.posix.normalize(withoutTrailingSlash) !== withoutTrailingSlash ||
      seen.has(withoutTrailingSlash)
    ) {
      throw new Error(`Ruta tar ambigua o duplicada: ${name}.`);
    }
    seen.add(withoutTrailingSlash);
  }
  if (!seen.has(archiveRoot)) {
    throw new Error("El tar no declara su directorio raíz.");
  }
  for (const line of verboseLines) {
    if (!line.startsWith("-") && !line.startsWith("d")) {
      throw new Error(
        "El tar contiene symlinks, hardlinks, devices u otro tipo no permitido.",
      );
    }
  }
  return displayedNames.length;
}

export async function decryptAndVerifyEncryptedPackage({
  archiveRoot,
  expectedBackupId,
  expectedBackupFormat,
  expectedChecksumCount,
  expectedManifestSha256,
  packagePath,
  verificationWorkDir,
}) {
  const workParent = path.resolve(verificationWorkDir);
  assertPrivateControlledDirectory(workParent, "El directorio de verificación");
  const verificationRoot = mkdtempSync(
    path.join(workParent, ".agorbis-decryption-check-"),
  );
  try {
    const plaintextTar = path.join(verificationRoot, "payload.tar.partial");
    const extractionRoot = path.join(verificationRoot, "extracted");
    mkdirSync(extractionRoot, { mode: 0o700 });
    const gpgArgs = [
      "--no-options",
      "--status-fd",
      "3",
      "--no-symkey-cache",
      "--pinentry-mode",
      "ask",
      "--output",
      plaintextTar,
      "--decrypt",
      packagePath,
    ];
    const gpg = spawn("gpg", gpgArgs, {
      stdio: ["inherit", "ignore", "pipe", "pipe"],
    });
    const gpgStderr = collectStderr(gpg.stderr, "gpg");
    const gpgStatus = collectStderr(gpg.stdio[3], "gpg status");
    const gpgExit = await waitForExit(gpg);
    if (gpgExit.code !== 0) {
      throw new Error(
        `Falló la prueba de descifrado: gpg=${String(gpgExit.code ?? gpgExit.signal)}; ${gpgStderr()}`.trim(),
      );
    }
    assertDecryptionGpgStatus(gpgStatus());
    if (!existsSync(plaintextTar) || !lstatSync(plaintextTar).isFile()) {
      throw new Error("GPG no produjo un tar descifrado regular.");
    }
    chmodSync(plaintextTar, 0o600);
    assertSafeTarArchive(plaintextTar, archiveRoot);
    const extractResult = spawnSync(
      "tar",
      [
        "--extract",
        "--file",
        plaintextTar,
        "--directory",
        extractionRoot,
        "--no-same-owner",
        "--no-same-permissions",
        "--delay-directory-restore",
      ],
      {
        encoding: "utf8",
        env: environmentWithoutTarOptions(),
        maxBuffer: 1024 * 1024,
      },
    );
    if (
      extractResult.error ||
      extractResult.status !== 0 ||
      extractResult.signal ||
      extractResult.stdout.trim() ||
      extractResult.stderr.trim()
    ) {
      throw new Error(
        `Extracción tar bloqueada: ${extractResult.error?.message ?? extractResult.stderr?.trim() ?? extractResult.stdout?.trim() ?? String(extractResult.signal ?? extractResult.status)}.`,
      );
    }
    const extractedEntries = readdirSync(extractionRoot);
    if (extractedEntries.length !== 1 || extractedEntries[0] !== archiveRoot) {
      throw new Error(
        "El paquete descifrado no contiene exactamente el directorio esperado.",
      );
    }
    const extractedRoot = path.join(extractionRoot, archiveRoot);
    if (!lstatSync(extractedRoot).isDirectory()) {
      throw new Error("La raíz descifrada no es un directorio regular.");
    }
    const restoredManifest = verifyBackupDirectory(extractedRoot);
    const checksumIndex = verifyBackupChecksumIndex(
      extractedRoot,
      restoredManifest,
    );
    if (
      typeof restoredManifest.backupId !== "string" ||
      !/^agorbis-[A-Za-z0-9._:-]+$/.test(restoredManifest.backupId)
    ) {
      throw new Error("El backup interno no tiene un backupId seguro.");
    }
    const restoredManifestSha256 = sha256File(
      path.join(extractedRoot, "backup-manifest.json"),
    );
    if (
      (expectedBackupId !== undefined &&
        restoredManifest.backupId !== expectedBackupId) ||
      (expectedBackupFormat !== undefined &&
        restoredManifest.format !== expectedBackupFormat) ||
      (expectedManifestSha256 !== undefined &&
        restoredManifestSha256 !== expectedManifestSha256) ||
      (expectedChecksumCount !== undefined &&
        checksumIndex.checksums !== expectedChecksumCount)
    ) {
      throw new Error(
        "El contenido descifrado no coincide con identidad/manifiesto/checksums del backup.",
      );
    }
    return {
      sourceBackupId: restoredManifest.backupId,
      sourceChecksumCount: checksumIndex.checksums,
      sourceManifestSha256: restoredManifestSha256,
    };
  } finally {
    rmSync(verificationRoot, { recursive: true, force: false });
  }
}
