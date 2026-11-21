import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SUPABASE_VERSION_PIN_FILES,
  SUPABASE_VERSION_PINS,
  materializeSupabaseVersionPins,
  validateSupabaseVersionPins,
  verifyMaterializedSupabaseVersionPins,
} from "./supabase-version-pins-policy.mjs";

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "agorbis-ci-pins-"));
  mkdirSync(path.join(root, "supabase"), { mode: 0o700 });
  return root;
}

assert.deepEqual(validateSupabaseVersionPins(SUPABASE_VERSION_PINS), []);
for (const pins of [
  Object.fromEntries(
    Object.entries(SUPABASE_VERSION_PINS).filter(
      ([name]) => name !== "storage-version",
    ),
  ),
  { ...SUPABASE_VERSION_PINS, unexpected: "v1" },
  { ...SUPABASE_VERSION_PINS, "storage-version": "v1.69.11" },
  { ...SUPABASE_VERSION_PINS, "../project-ref": "forbidden" },
]) {
  assert.ok(validateSupabaseVersionPins(pins).length > 0);
}

const validRoot = fixtureRoot();
try {
  const inventory = materializeSupabaseVersionPins(validRoot);
  assert.deepEqual(
    readdirSync(path.join(validRoot, "supabase/.temp")).sort(),
    [...SUPABASE_VERSION_PIN_FILES].sort(),
  );
  assert.deepEqual(
    Object.keys(inventory).sort(),
    [...SUPABASE_VERSION_PIN_FILES].sort(),
  );
  assert.equal(
    lstatSync(path.join(validRoot, "supabase/.temp")).mode & 0o777,
    0o700,
  );
  for (const name of SUPABASE_VERSION_PIN_FILES) {
    const filePath = path.join(validRoot, "supabase/.temp", name);
    assert.equal(lstatSync(filePath).isSymbolicLink(), false);
    assert.equal(lstatSync(filePath).mode & 0o777, 0o600);
    assert.equal(readFileSync(filePath, "utf8"), SUPABASE_VERSION_PINS[name]);
    assert.match(inventory[name].sha256, /^[a-f0-9]{64}$/);
  }
  writeFileSync(path.join(validRoot, "supabase/.temp/provider-state"), "ok");
  assert.doesNotThrow(() =>
    verifyMaterializedSupabaseVersionPins(validRoot, {
      allowProviderState: true,
    }),
  );
  assert.throws(
    () => verifyMaterializedSupabaseVersionPins(validRoot),
    /únicamente los cinco pins/,
  );
} finally {
  rmSync(validRoot, { recursive: true });
}

const alteredPinRoot = fixtureRoot();
try {
  materializeSupabaseVersionPins(alteredPinRoot);
  chmodSync(path.join(alteredPinRoot, "supabase/.temp"), 0o755);
  writeFileSync(
    path.join(alteredPinRoot, "supabase/.temp/storage-version"),
    "v1.69.11",
  );
  chmodSync(path.join(alteredPinRoot, "supabase/.temp/storage-version"), 0o664);
  assert.throws(
    () =>
      verifyMaterializedSupabaseVersionPins(alteredPinRoot, {
        allowProviderState: true,
        requireRestrictiveModes: false,
      }),
    /no coincide byte a byte/,
  );
} finally {
  rmSync(alteredPinRoot, { recursive: true });
}

const permissionsRoot = fixtureRoot();
try {
  materializeSupabaseVersionPins(permissionsRoot);
  const pinPath = path.join(permissionsRoot, "supabase/.temp/storage-version");
  chmodSync(pinPath, 0o640);
  assert.throws(
    () => verifyMaterializedSupabaseVersionPins(permissionsRoot),
    /permisos 600/,
  );
  chmodSync(pinPath, 0o600);
  chmodSync(path.join(permissionsRoot, "supabase/.temp"), 0o750);
  assert.throws(
    () => verifyMaterializedSupabaseVersionPins(permissionsRoot),
    /permisos 700/,
  );
  chmodSync(path.join(permissionsRoot, "supabase/.temp"), 0o755);
  for (const name of SUPABASE_VERSION_PIN_FILES) {
    chmodSync(path.join(permissionsRoot, "supabase/.temp", name), 0o664);
  }
  assert.doesNotThrow(() =>
    verifyMaterializedSupabaseVersionPins(permissionsRoot, {
      allowProviderState: true,
      requireRestrictiveModes: false,
    }),
  );
  assert.throws(
    () =>
      verifyMaterializedSupabaseVersionPins(permissionsRoot, {
        allowProviderState: true,
      }),
    /permisos 700/,
  );
} finally {
  rmSync(permissionsRoot, { recursive: true });
}

const pinSymlinkRoot = fixtureRoot();
try {
  materializeSupabaseVersionPins(pinSymlinkRoot);
  const pinPath = path.join(pinSymlinkRoot, "supabase/.temp/storage-version");
  unlinkSync(pinPath);
  symlinkSync("postgres-version", pinPath);
  assert.throws(
    () =>
      verifyMaterializedSupabaseVersionPins(pinSymlinkRoot, {
        allowProviderState: true,
        requireRestrictiveModes: false,
      }),
    /no es un archivo regular/,
  );
} finally {
  rmSync(pinSymlinkRoot, { recursive: true });
}

const existingTempRoot = fixtureRoot();
try {
  mkdirSync(path.join(existingTempRoot, "supabase/.temp"));
  writeFileSync(path.join(existingTempRoot, "supabase/.temp/project-ref"), "x");
  assert.throws(
    () => materializeSupabaseVersionPins(existingTempRoot),
    /estado preexistente/,
  );
  assert.equal(
    readFileSync(
      path.join(existingTempRoot, "supabase/.temp/project-ref"),
      "utf8",
    ),
    "x",
  );
} finally {
  rmSync(existingTempRoot, { recursive: true });
}

const tempSymlinkRoot = fixtureRoot();
const tempSymlinkTarget = fixtureRoot();
try {
  symlinkSync(
    path.join(tempSymlinkTarget, "supabase"),
    path.join(tempSymlinkRoot, "supabase/.temp"),
  );
  assert.throws(
    () => materializeSupabaseVersionPins(tempSymlinkRoot),
    /existe como symlink/,
  );
} finally {
  rmSync(tempSymlinkRoot, { recursive: true });
  rmSync(tempSymlinkTarget, { recursive: true });
}

const symlinkRoot = fixtureRoot();
const realSupabase = fixtureRoot();
try {
  rmSync(path.join(symlinkRoot, "supabase"), { recursive: true });
  symlinkSync(
    path.join(realSupabase, "supabase"),
    path.join(symlinkRoot, "supabase"),
  );
  assert.throws(
    () => materializeSupabaseVersionPins(symlinkRoot),
    /no un symlink/,
  );
} finally {
  rmSync(symlinkRoot, { recursive: true });
  rmSync(realSupabase, { recursive: true });
}

assert.throws(
  () => materializeSupabaseVersionPins("relative/project"),
  /ruta absoluta/,
);

console.log("Supabase CI version pin tests: ok");
