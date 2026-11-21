import assert from "node:assert/strict";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installedPnpmStoreEnvironment } from "./installed-pnpm-store.mjs";

const root = mkdtempSync(path.join(tmpdir(), "agorbis-store-test-"));
try {
  mkdirSync(path.join(root, "node_modules"));
  const storeDir = path.join(root, "store/v11");
  mkdirSync(storeDir, { recursive: true });
  const file = path.join(root, "node_modules/.modules.yaml");
  const metadata = {
    layoutVersion: 5,
    packageManager: "pnpm@11.15.0",
    storeDir,
  };
  const write = (value = metadata) => {
    writeFileSync(file, JSON.stringify(value));
    chmodSync(file, 0o644);
  };
  write();
  assert.deepEqual(installedPnpmStoreEnvironment(root), {
    pnpm_config_store_dir: path.dirname(storeDir),
  });
  const previous = process.env.pnpm_config_store_dir;
  try {
    process.env.pnpm_config_store_dir = "/tmp/untrusted-store";
    assert.deepEqual(installedPnpmStoreEnvironment(root), {
      pnpm_config_store_dir: path.dirname(storeDir),
    });
  } finally {
    if (previous === undefined) delete process.env.pnpm_config_store_dir;
    else process.env.pnpm_config_store_dir = previous;
  }
  for (const changed of [
    { ...metadata, layoutVersion: 4 },
    { ...metadata, packageManager: "pnpm@12.0.0" },
    { ...metadata, storeDir: "relative/v11" },
    { ...metadata, storeDir: root },
  ]) {
    write(changed);
    assert.throws(() => installedPnpmStoreEnvironment(root));
  }
  write();
  chmodSync(file, 0o664);
  assert.throws(() => installedPnpmStoreEnvironment(root), /inseguros/);
  write();
  const hardlink = path.join(root, "linked.json");
  linkSync(file, hardlink);
  assert.throws(() => installedPnpmStoreEnvironment(root), /inseguros/);
  rmSync(hardlink);
  rmSync(file);
  writeFileSync(hardlink, JSON.stringify(metadata));
  symlinkSync(hardlink, file);
  assert.throws(() => installedPnpmStoreEnvironment(root), /aliases/);
  rmSync(file);
  rmSync(hardlink);
  write();
  const alias = path.join(root, "alias");
  symlinkSync(path.dirname(storeDir), alias);
  write({ ...metadata, storeDir: path.join(alias, "v11") });
  assert.throws(() => installedPnpmStoreEnvironment(root), /store instalado/);
  console.log(
    "Installed pnpm store: PASS (no environment override, no reinstall)",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
