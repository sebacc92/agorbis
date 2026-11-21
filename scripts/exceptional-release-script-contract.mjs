import { createHash } from "node:crypto";

// v11 (2026-10-20): `lint` dejó de ser el monolito que encadenaba 30 pasos y
// los 41 tests de `test.release-open`. Un fallo de política de release (pins,
// closure de Wrangler, digests de binarios) aparecía como "lint" y bloqueaba
// cualquier PR, también el `qwik build` del e2e. Los mismos comandos se
// reparten sin perder ninguno:
// - `lint`: eslint + prettier + scan-secrets + check-keys + check-i18n +
//   check-legal + check-pending-external-evidence-legal-draft + el test de la
//   fuente pública del build (determinístico, < 1 s; test-preflight exige que
//   todo `qwik build` lo corra a través de `lint`);
// - `test`: tests de lógica pura del producto + vitest;
// - `test.release`: test.release-open, cloudflare-*, preflight,
//   production-smoke, git-recovery, backups y supabase-*.
// Por eso `test` y `test.release` entran al contrato: omitir un comando de
// cualquiera de los dos rompe el hash igual que antes rompía el de `lint`.
// Únicos agregados respecto de v10: `check-audit-ignores` en `lint` y su test
// en `test` (cada GHSA ignorado necesita ruta, motivo y fecha de revisión), y
// `check-db-contract` en `lint` y su test en `test` (todo `.rpc()`/`.from()`
// del código tiene que existir en `database.types.ts`).
export const EXCEPTIONAL_RELEASE_SCRIPT_CONTRACT_VERSION =
  "agorbis-exceptional-release-scripts/v12";
export const EXCEPTIONAL_RELEASE_SCRIPT_CONTRACT_SHA256 =
  "6f221d2a7faf949b2eb456ba41a58c524c2531283b055873f227200024f93314";

const EXPECTED_SCRIPT_SHA256_BY_NAME = Object.freeze({
  build: "8d242f830de617005f5a12b514cc424c2d7924cd0b2b09512c08a83f52029b57",
  "build.client":
    "1c744850d821f3b09655b15a59f6ccfd1af0aa06b7441da9ca9029f536016e4e",
  "build.server":
    "4734720b82b0cd3d2a13236a552fe172c846fb7c262d0b88757b174b22f4e44f",
  "build.types":
    "93747514f8d33f460230ed888fd4cc755c853ed8bfedfe29aea3629da3ec0327",
  "db.test": "9c8ebdb27fc3414151671fe9131bfde7985df4b5fb417d5bd91cc052549a21aa",
  lint: "87bd4aa113527a35f20e5248051b9cd9c1f006839fd1d2a8aeb51c87c2f06dff",
  test: "abac17ea348585b038dfb3aedf4dc6f05f2d6bea4051557f559aa74b98e09964",
  "test.canary":
    "47d677632fd05246e143a779ede8f093069c233c967814d4f53352c7db749f3f",
  "test.civic":
    "4a1989acb103de98874e9f1b1341c5961e390be1ca68b3740b270768bbf05ff2",
  "test.components":
    "ad6cd6b8acf39571390d7bc1772410249266fa406be150a22f0065827e400496",
  "test.e2e":
    "0e33a90dca5f7a2df02d453a71d2110aee4ec54c91edf06e7150b200df85d8b8",
  "test.release":
    "fa20306034924207a35b1d63355aa425453c62a84c1c9f98b086d38e34aaa9f5",
  "test.preflight":
    "79f564b9bb4a57f369e4ea2a0cfc8b7f27d36a23cc6e517891d769c61843848c",
  "test.release-open":
    "88405bb807b27d32db68f3cc8dd00b7936627fc5b4971844a03c5811288a91ce",
});

export const EXCEPTIONAL_RELEASE_REQUIRED_SCRIPT_NAMES = Object.freeze([
  "build",
  "build.client",
  "build.server",
  "build.types",
  "db.test",
  "lint",
  "test",
  "test.canary",
  "test.civic",
  "test.components",
  "test.e2e",
  "test.release",
  "test.release-open",
  "test.preflight",
]);

function sha256(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function canonicalContractScripts(scripts) {
  return JSON.stringify(
    Object.fromEntries(
      EXCEPTIONAL_RELEASE_REQUIRED_SCRIPT_NAMES.map((name) => [
        name,
        scripts[name] ?? null,
      ]),
    ),
  );
}

export function validateExceptionalReleaseScriptContract(packageJsonText) {
  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonText);
  } catch {
    return [
      "package.json no contiene JSON válido para el contrato excepcional.",
    ];
  }
  const scripts = packageJson?.scripts;
  if (
    !scripts ||
    typeof scripts !== "object" ||
    Array.isArray(scripts) ||
    Object.getPrototypeOf(scripts) !== Object.prototype
  ) {
    return ["package.json no contiene un objeto scripts válido."];
  }

  const errors = [];
  for (const name of EXCEPTIONAL_RELEASE_REQUIRED_SCRIPT_NAMES) {
    const command = scripts[name];
    if (
      typeof command !== "string" ||
      sha256(command) !== EXPECTED_SCRIPT_SHA256_BY_NAME[name]
    ) {
      errors.push(
        `package.scripts[${JSON.stringify(name)}] no coincide con el contrato excepcional versionado.`,
      );
    }
  }
  if (
    sha256(canonicalContractScripts(scripts)) !==
    EXCEPTIONAL_RELEASE_SCRIPT_CONTRACT_SHA256
  ) {
    errors.push("El hash del contrato de scripts excepcional no coincide.");
  }
  return [...new Set(errors)];
}

export function assertExceptionalReleaseScriptContract(packageJsonText) {
  const errors = validateExceptionalReleaseScriptContract(packageJsonText);
  if (errors.length > 0) {
    throw new Error(
      `Contrato de scripts excepcional inválido:\n${errors.join("\n")}`,
    );
  }
}
