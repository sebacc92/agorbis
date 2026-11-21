import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  assertPrivateControlledDirectory,
  assertEncryptionGpgStatus,
  decryptAndVerifyEncryptedPackage,
  encryptedTransferArtifactPaths,
  environmentWithoutTarOptions,
  publishFileNoReplace,
  readAndValidateEncryptedTransfer,
  serializeEncryptedTransferChecksum,
  writeTextTemporaryExclusive,
} from "./encrypted-backup-package-lib.mjs";
import {
  BACKUP_FORMAT,
  sha256File,
  sha256FileAsync,
  verifyBackupChecksumIndex,
  verifyBackupDirectory,
} from "./supabase-backup-lib.mjs";

process.umask(0o077);

function parseArguments(argv) {
  const options = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--") continue;
    if (seen.has(current)) {
      throw new Error(`Argumento duplicado: ${String(current)}.`);
    }
    seen.add(current);
    if (current === "--backup-dir") options.backupDir = argv[++index];
    else if (current === "--destination-dir") {
      options.destinationDir = argv[++index];
    } else if (current === "--recipient-fingerprint") {
      options.recipientFingerprint = argv[++index];
    } else if (current === "--symmetric") {
      options.symmetric = true;
    } else if (current === "--verification-work-dir") {
      options.verificationWorkDir = argv[++index];
    } else throw new Error(`Argumento desconocido: ${String(current)}.`);
  }
  for (const field of [
    "backupDir",
    "destinationDir",
    ...(options.verificationWorkDir ? ["verificationWorkDir"] : []),
  ]) {
    if (
      typeof options[field] !== "string" ||
      !path.isAbsolute(options[field]) ||
      /[\r\n\0]/.test(options[field])
    ) {
      throw new Error(`${field} debe ser una ruta absoluta segura.`);
    }
  }
  options.recipientFingerprint = String(
    options.recipientFingerprint ?? "",
  ).toUpperCase();
  if (Boolean(options.symmetric) === Boolean(options.recipientFingerprint)) {
    throw new Error(
      "Elegí exactamente un modo: --symmetric o --recipient-fingerprint.",
    );
  }
  if (
    options.recipientFingerprint &&
    !/^(?:[A-F0-9]{40}|[A-F0-9]{64})$/.test(options.recipientFingerprint)
  ) {
    throw new Error("El fingerprint GPG del destinatario es inválido.");
  }
  return options;
}

function assertRecipient(fingerprint) {
  const result = spawnSync(
    "gpg",
    ["--no-options", "--batch", "--with-colons", "--list-keys", fingerprint],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error("La clave pública GPG de backup no está disponible.");
  }
  const fingerprints = result.stdout
    .split("\n")
    .filter((line) => line.startsWith("fpr:"))
    .map((line) => line.split(":")[9]?.toUpperCase());
  if (!fingerprints.includes(fingerprint)) {
    throw new Error("GPG no devolvió el fingerprint exacto solicitado.");
  }
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

function isSameOrInside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

async function encryptBackup(source, partial, options) {
  const parent = path.dirname(source);
  const base = path.basename(source);
  const tar = spawn(
    "tar",
    [
      "--create",
      "--format=pax",
      "--sort=name",
      "--numeric-owner",
      "--owner=0",
      "--group=0",
      "--mtime=@0",
      "--directory",
      parent,
      base,
    ],
    {
      env: environmentWithoutTarOptions(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const gpgArgs = options.symmetric
    ? [
        "--no-options",
        "--status-fd",
        "3",
        "--no-symkey-cache",
        "--pinentry-mode",
        "ask",
        "--cipher-algo",
        "AES256",
        "--s2k-cipher-algo",
        "AES256",
        "--s2k-digest-algo",
        "SHA512",
        "--s2k-mode",
        "3",
        "--output",
        partial,
        "--symmetric",
      ]
    : [
        "--no-options",
        "--status-fd",
        "3",
        "--batch",
        "--no-tty",
        "--trust-model",
        "always",
        "--recipient",
        options.recipientFingerprint,
        "--output",
        partial,
        "--encrypt",
      ];
  const gpg = spawn("gpg", gpgArgs, {
    stdio: ["pipe", "ignore", "pipe", "pipe"],
  });
  const tarStderr = collectStderr(tar.stderr, "tar");
  const gpgStderr = collectStderr(gpg.stderr, "gpg");
  const gpgStatus = collectStderr(gpg.stdio[3], "gpg status");
  tar.stdout.pipe(gpg.stdin);
  const [tarExit, gpgExit] = await Promise.all([
    waitForExit(tar),
    waitForExit(gpg),
  ]);
  if (tarExit.code !== 0 || gpgExit.code !== 0) {
    throw new Error(
      `Falló el paquete cifrado: tar=${String(tarExit.code ?? tarExit.signal)}, gpg=${String(gpgExit.code ?? gpgExit.signal)}; ${tarStderr()} ${gpgStderr()}`.trim(),
    );
  }
  assertEncryptionGpgStatus(
    gpgStatus(),
    options.symmetric ? "symmetric" : "public-key",
  );
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error(
      `El empaquetado exige Node 22.x; actual ${process.version}.`,
    );
  }
  const options = parseArguments(process.argv.slice(2));
  const backupRoot = path.resolve(options.backupDir);
  const destinationRoot = path.resolve(options.destinationDir);
  const archiveRoot = path.basename(backupRoot);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(archiveRoot)) {
    throw new Error("El basename del backup no es una raíz tar segura.");
  }
  if (!existsSync(backupRoot) || !lstatSync(backupRoot).isDirectory()) {
    throw new Error("El backup debe ser un directorio real, no un symlink.");
  }
  if (
    !existsSync(destinationRoot) ||
    !lstatSync(destinationRoot).isDirectory()
  ) {
    throw new Error(
      "El destino cifrado debe existir y ser un directorio, no un symlink.",
    );
  }
  assertPrivateControlledDirectory(destinationRoot, "El destino cifrado");
  const realBackupRoot = realpathSync(backupRoot);
  const realDestinationRoot = realpathSync(destinationRoot);
  if (
    isSameOrInside(realBackupRoot, realDestinationRoot) ||
    isSameOrInside(realDestinationRoot, realBackupRoot)
  ) {
    throw new Error(
      "Origen y destino cifrado deben estar realmente separados.",
    );
  }
  const manifest = verifyBackupDirectory(backupRoot);
  const checksumIndex = verifyBackupChecksumIndex(backupRoot, manifest);
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(
      `El empaquetado nuevo exige ${BACKUP_FORMAT}; recibido ${String(manifest.format)}.`,
    );
  }
  if (
    typeof manifest.backupId !== "string" ||
    !/^agorbis-[A-Za-z0-9._:-]+$/.test(manifest.backupId)
  ) {
    throw new Error("El backup no tiene un backupId seguro y verificable.");
  }
  if (!options.symmetric) assertRecipient(options.recipientFingerprint);
  const verificationWorkDir = path.resolve(
    options.verificationWorkDir ?? path.dirname(backupRoot),
  );
  if (
    !existsSync(verificationWorkDir) ||
    !lstatSync(verificationWorkDir).isDirectory()
  ) {
    throw new Error(
      "verificationWorkDir debe existir y no puede ser un symlink.",
    );
  }
  assertPrivateControlledDirectory(verificationWorkDir, "verificationWorkDir");
  const realVerificationWorkDir = realpathSync(verificationWorkDir);
  if (
    isSameOrInside(realBackupRoot, realVerificationWorkDir) ||
    isSameOrInside(realDestinationRoot, realVerificationWorkDir) ||
    isSameOrInside(realVerificationWorkDir, realDestinationRoot)
  ) {
    throw new Error(
      "El trabajo de verificación debe estar fuera del backup y del destino cifrado.",
    );
  }
  const outputName = `${path.basename(backupRoot)}.tar.gpg`;
  const outputPath = path.join(destinationRoot, outputName);
  const operationId = `${process.pid}-${randomUUID()}`;
  const partialPath = `${outputPath}.partial-${operationId}`;
  const { checksumPath } = encryptedTransferArtifactPaths(outputPath);
  const checksumPartialPath = `${checksumPath}.partial-${operationId}`;
  for (const candidate of [outputPath, checksumPath]) {
    if (existsSync(candidate)) {
      throw new Error(`El destino ya existe y no se sobrescribe: ${candidate}`);
    }
  }
  const ciphertextPublication = {};
  const checksumPartial = {};
  const checksumPublication = {};
  try {
    await encryptBackup(backupRoot, partialPath, options);
    chmodSync(partialPath, 0o600);
    const ciphertextBytes = statSync(partialPath).size;
    const ciphertextSha256 = await sha256FileAsync(partialPath);
    if (ciphertextBytes === 0) throw new Error("GPG produjo un archivo vacío.");
    const sourceManifestSha256 = sha256File(
      path.join(backupRoot, "backup-manifest.json"),
    );
    const verification = await decryptAndVerifyEncryptedPackage({
      archiveRoot,
      expectedBackupId: manifest.backupId,
      expectedBackupFormat: manifest.format,
      expectedChecksumCount: checksumIndex.checksums,
      expectedManifestSha256: sourceManifestSha256,
      packagePath: partialPath,
      verificationWorkDir,
    });
    publishFileNoReplace(partialPath, outputPath, ciphertextPublication);
    writeTextTemporaryExclusive(
      checksumPartialPath,
      serializeEncryptedTransferChecksum(outputPath, ciphertextSha256),
      checksumPartial,
    );
    publishFileNoReplace(
      checksumPartialPath,
      checksumPath,
      checksumPublication,
    );
    const durableMetadata = await readAndValidateEncryptedTransfer(
      outputPath,
      checksumPath,
    );
    if (
      durableMetadata.ciphertext.sha256 !== ciphertextSha256 ||
      durableMetadata.ciphertext.bytes !== ciphertextBytes ||
      verification.sourceBackupId !== manifest.backupId ||
      verification.sourceChecksumCount !== checksumIndex.checksums ||
      verification.sourceManifestSha256 !== sourceManifestSha256
    ) {
      throw new Error("La revalidación durable del paquete no coincide.");
    }
    console.log(
      JSON.stringify({
        ok: true,
        format: durableMetadata.format,
        packageFile: path.basename(outputPath),
        checksumFile: path.basename(checksumPath),
        ciphertextBytes,
        ciphertextSha256,
        verifiedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    for (const candidate of [partialPath, checksumPartialPath]) {
      if (existsSync(candidate)) rmSync(candidate, { force: false });
    }
    if (checksumPublication.published && existsSync(checksumPath)) {
      rmSync(checksumPath, { force: false });
    }
    if (ciphertextPublication.published && existsSync(outputPath)) {
      rmSync(outputPath, { force: false });
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`Paquete cifrado: BLOQUEADO — ${error.message}`);
  process.exitCode = 1;
});
