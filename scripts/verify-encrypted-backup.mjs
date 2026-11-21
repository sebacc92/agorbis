import path from "node:path";
import {
  decryptAndVerifyEncryptedPackage,
  ENCRYPTED_PACKAGE_FORMAT_V1,
  readAndValidateEncryptedPackage,
  readAndValidateEncryptedTransfer,
} from "./encrypted-backup-package-lib.mjs";
import { BACKUP_FORMAT } from "./supabase-backup-lib.mjs";

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
    if (current === "--package") options.packagePath = argv[++index];
    else if (current === "--package-manifest") {
      options.manifestPath = argv[++index];
    } else if (current === "--checksum") {
      options.checksumPath = argv[++index];
    } else if (current === "--verification-work-dir") {
      options.verificationWorkDir = argv[++index];
    } else throw new Error(`Argumento desconocido: ${String(current)}.`);
  }
  for (const field of ["packagePath", "verificationWorkDir"]) {
    if (
      typeof options[field] !== "string" ||
      !path.isAbsolute(options[field]) ||
      /[\r\n\0]/.test(options[field])
    ) {
      throw new Error(`${field} debe ser una ruta absoluta segura.`);
    }
  }
  const legacy = typeof options.manifestPath === "string";
  const transfer = typeof options.checksumPath === "string";
  if (legacy === transfer) {
    throw new Error(
      "Usá --package-manifest para legado o --checksum para transferencia v3.",
    );
  }
  for (const field of legacy ? ["manifestPath"] : ["checksumPath"]) {
    if (!path.isAbsolute(options[field]) || /[\r\n\0]/.test(options[field])) {
      throw new Error(`${field} debe ser una ruta absoluta segura.`);
    }
  }
  return options;
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error(
      `La verificación exige Node 22.x; actual ${process.version}.`,
    );
  }
  const options = parseArguments(process.argv.slice(2));
  const packagePath = path.resolve(options.packagePath);
  const legacy = typeof options.manifestPath === "string";
  const manifest = legacy
    ? await readAndValidateEncryptedPackage(
        packagePath,
        path.resolve(options.manifestPath),
      )
    : await readAndValidateEncryptedTransfer(
        packagePath,
        path.resolve(options.checksumPath),
      );
  const archiveRoot = legacy
    ? manifest.format === ENCRYPTED_PACKAGE_FORMAT_V1
      ? path.basename(packagePath).replace(/\.tar\.gpg$/, "")
      : manifest.archiveRoot
    : path.basename(packagePath).replace(/\.tar\.gpg$/, "");
  if (
    !archiveRoot ||
    archiveRoot === path.basename(packagePath) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(archiveRoot)
  ) {
    throw new Error("No se pudo derivar la raíz del archivo cifrado.");
  }
  const verification = await decryptAndVerifyEncryptedPackage({
    archiveRoot,
    expectedBackupId: legacy ? manifest.sourceBackupId : undefined,
    expectedBackupFormat: legacy ? manifest.sourceBackupFormat : BACKUP_FORMAT,
    expectedChecksumCount: legacy ? manifest.sourceChecksumCount : undefined,
    expectedManifestSha256: legacy ? manifest.sourceManifestSha256 : undefined,
    packagePath,
    verificationWorkDir: path.resolve(options.verificationWorkDir),
  });
  console.log(
    JSON.stringify({
      ok: true,
      packageFile: path.basename(packagePath),
      packageSha256: manifest.ciphertext.sha256,
      internalBackupVerified: Boolean(verification.sourceBackupId),
      verifiedAt: new Date().toISOString(),
    }),
  );
}

main().catch((error) => {
  console.error(`Verificación cifrada: BLOQUEADA — ${error.message}`);
  process.exitCode = 1;
});
