import { randomUUID } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import {
  assertPrivateControlledDirectory,
  encryptedTransferArtifactPaths,
  publishFileNoReplace,
  readAndValidateEncryptedTransfer,
} from "./encrypted-backup-package-lib.mjs";

process.umask(0o077);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--") continue;
    if (current === "--package") options.packagePath = argv[++index];
    else if (current === "--checksum") {
      options.checksumPath = argv[++index];
    } else if (current === "--destination-dir") {
      options.destinationDir = argv[++index];
    } else throw new Error(`Argumento desconocido: ${String(current)}.`);
  }
  for (const field of ["packagePath", "checksumPath", "destinationDir"]) {
    if (
      typeof options[field] !== "string" ||
      !path.isAbsolute(options[field]) ||
      /[\r\n\0]/.test(options[field])
    ) {
      throw new Error(`${field} debe ser una ruta absoluta segura.`);
    }
  }
  return options;
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error(`La copia exige Node 22.x; actual ${process.version}.`);
  }
  const options = parseArguments(process.argv.slice(2));
  const sourcePackage = path.resolve(options.packagePath);
  const sourceChecksum = path.resolve(options.checksumPath);
  const destinationRoot = path.resolve(options.destinationDir);
  const metadata = await readAndValidateEncryptedTransfer(
    sourcePackage,
    sourceChecksum,
  );
  if (!existsSync(destinationRoot)) {
    mkdirSync(destinationRoot, { recursive: true, mode: 0o700 });
  }
  assertPrivateControlledDirectory(
    destinationRoot,
    "El destino de segunda copia",
  );
  const destinationPackage = path.join(
    destinationRoot,
    path.basename(sourcePackage),
  );
  const { checksumPath: destinationChecksum } =
    encryptedTransferArtifactPaths(destinationPackage);
  const operationId = `${process.pid}-${randomUUID()}`;
  const destinationPartial = `${destinationPackage}.partial-${operationId}`;
  const destinationChecksumPartial = `${destinationChecksum}.partial-${operationId}`;
  if (existsSync(destinationPackage) || existsSync(destinationChecksum)) {
    throw new Error("La segunda copia ya existe y no se sobrescribe.");
  }
  const packagePublication = {};
  const checksumPublication = {};
  try {
    copyFileSync(sourcePackage, destinationPartial, constants.COPYFILE_EXCL);
    chmodSync(destinationPartial, 0o600);
    if (statSync(destinationPartial).size !== metadata.ciphertext.bytes) {
      throw new Error("La segunda copia no conserva bytes/SHA-256.");
    }
    publishFileNoReplace(
      destinationPartial,
      destinationPackage,
      packagePublication,
    );
    copyFileSync(
      sourceChecksum,
      destinationChecksumPartial,
      constants.COPYFILE_EXCL,
    );
    chmodSync(destinationChecksumPartial, 0o600);
    publishFileNoReplace(
      destinationChecksumPartial,
      destinationChecksum,
      checksumPublication,
    );
    const durableMetadata = await readAndValidateEncryptedTransfer(
      destinationPackage,
      destinationChecksum,
    );
    if (
      durableMetadata.ciphertext.sha256 !== metadata.ciphertext.sha256 ||
      durableMetadata.ciphertext.bytes !== metadata.ciphertext.bytes
    ) {
      throw new Error("La revalidación durable de la copia no coincide.");
    }
    console.log(
      JSON.stringify({
        ok: true,
        format: durableMetadata.format,
        packageFile: path.basename(destinationPackage),
        checksumFile: path.basename(destinationChecksum),
        bytes: metadata.ciphertext.bytes,
        sha256: metadata.ciphertext.sha256,
      }),
    );
  } catch (error) {
    for (const candidate of [destinationPartial, destinationChecksumPartial]) {
      if (existsSync(candidate)) rmSync(candidate, { force: false });
    }
    if (checksumPublication.published && existsSync(destinationChecksum)) {
      rmSync(destinationChecksum, { force: false });
    }
    if (packagePublication.published && existsSync(destinationPackage)) {
      rmSync(destinationPackage, { force: false });
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`Segunda copia cifrada: BLOQUEADA — ${error.message}`);
  process.exitCode = 1;
});
