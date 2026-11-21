import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

// pnpm 11 otherwise tries to reinstall a project prepared with --store-dir when
// the next sanitized subprocess silently falls back to the default store.
// Select the already materialized store; never accept an environment override.
export function installedPnpmStoreEnvironment(repositoryRoot) {
  if (!Number.isInteger(constants.O_NOFOLLOW))
    throw new Error("pnpm exige O_NOFOLLOW.");
  const file = path.join(repositoryRoot, "node_modules/.modules.yaml");
  if (realpathSync(file) !== file)
    throw new Error("Los metadatos pnpm no admiten aliases.");
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let metadata;
  try {
    const before = fstatSync(fd);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      (before.mode & 0o022) !== 0 ||
      before.uid !== process.getuid() ||
      before.size > 1024 * 1024
    )
      throw new Error("Metadatos pnpm inseguros.");
    metadata = JSON.parse(readFileSync(fd, "utf8"));
    const after = lstatSync(file);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error("Cambiaron los metadatos pnpm.");
  } finally {
    closeSync(fd);
  }
  const store = metadata.storeDir;
  if (
    metadata.packageManager !== "pnpm@11.15.0" ||
    metadata.layoutVersion !== 5 ||
    typeof store !== "string" ||
    !path.isAbsolute(store) ||
    path.basename(store) !== "v11" ||
    /[\x00-\x1f\x7f]/.test(store) ||
    realpathSync(store) !== store ||
    !lstatSync(store).isDirectory()
  )
    throw new Error("El store instalado no corresponde a pnpm 11.15.0.");
  return Object.freeze({ pnpm_config_store_dir: path.dirname(store) });
}
