#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  baseline,
  expectedBaselineSha256,
  NOW,
} from "./cloudflare-open-source-smoke-test-fixture.mjs";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
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
import { fileURLToPath } from "node:url";
import {
  EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH,
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
  canonicalExceptionalReleaseArtifactJson,
  deriveExceptionalReleaseArtifactPaths,
  exceptionalReleaseArtifactHash,
  freezeExceptionalReleaseArtifact,
  prepareOrReuseExceptionalReleaseArtifact,
  readExceptionalReleaseArtifactManifest,
  validateExceptionalReleaseArtifact,
  validateExceptionalReleaseArtifactManifest,
} from "./exceptional-release-artifact.mjs";
import {
  EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY,
} from "./exceptional-wrangler-integrity.mjs";

assert.equal(
  process.versions.node,
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  `Este test debe ejecutarse con Node ${EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION}.`,
);

const actualRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
assert.equal(
  readFileSync(path.join(actualRepositoryRoot, ".nvmrc"), "utf8").trim(),
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  ".nvmrc debe fijar el mismo Node exacto que el artefacto excepcional.",
);
assert.equal(
  JSON.parse(
    readFileSync(path.join(actualRepositoryRoot, "package.json"), "utf8"),
  ).packageManager,
  "pnpm@11.15.0",
  "package.json debe fijar exactamente pnpm 11.15.0 para materializar el artefacto excepcional.",
);
const ciSource = readFileSync(
  path.join(actualRepositoryRoot, ".github/workflows/ci.yml"),
  "utf8",
);
const ciNodeVersions = [
  ...ciSource.matchAll(/^\s*node-version:\s*([^\s#]+)\s*$/gm),
].map((match) => match[1]);
// Desde 2026-10-20 la CI tiene cuatro jobs (verificar, integracion,
// release-gates y auditoria-semanal); todos fijan el mismo Node exacto.
assert.ok(ciNodeVersions.length >= 1, "CI debe fijar Node explícitamente.");
assert.deepEqual(
  ciNodeVersions,
  ciNodeVersions.map(() => EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION),
  "Todos los jobs de CI deben fijar el mismo Node exacto que el artefacto excepcional.",
);
const ciIsolatedPnpmRecipe = `        run: |
          set -euo pipefail
          umask 0022
          test "$(node --version)" = "v22.22.0"
          test "$(pnpm --version)" = "11.15.0"
          test "$(pnpm config get sideEffectsCache)" = "false"
          agorbis_pnpm_scratch="$(mktemp -d "\${RUNNER_TEMP:?}/agorbis-pnpm.XXXXXX")"
          agorbis_pnpm_store="\${agorbis_pnpm_scratch}/store"
          test ! -e node_modules
          test ! -L node_modules
          test ! -e "$agorbis_pnpm_store"
          test ! -L "$agorbis_pnpm_store"
          pnpm install --frozen-lockfile --store-dir "$agorbis_pnpm_store"
          agorbis_effective_store="$(realpath "$(pnpm store path --store-dir "$agorbis_pnpm_store")")"
          agorbis_pnpm_store="$(realpath "$agorbis_pnpm_store")"
          case "$agorbis_effective_store" in
            "$agorbis_pnpm_store"|"$agorbis_pnpm_store"/*) ;;
            *) echo "El store efectivo de pnpm escapó del scratch aislado." >&2; exit 1 ;;
          esac
`;
const ciPnpmInstalls = [...ciSource.matchAll(/^\s+pnpm install[^\n]*$/gm)].map(
  (match) => match[0].trim(),
);
assert.ok(ciPnpmInstalls.length >= 1, "CI debe instalar dependencias.");
assert.equal(
  ciSource.split(ciIsolatedPnpmRecipe).length - 1,
  ciPnpmInstalls.length,
  "Cada job de CI que instala debe hacerlo desde un store nuevo, aislado y con umask 0022.",
);
assert.deepEqual(
  ciPnpmInstalls,
  ciPnpmInstalls.map(
    () => 'pnpm install --frozen-lockfile --store-dir "$agorbis_pnpm_store"',
  ),
  "CI no puede materializar dependencias por una receta alternativa.",
);
// Los gates de release sí exigen la toolchain auditada completa: lock de
// util-linux, Git auditado, runtimes materializados, store aislado y el gate
// D72 del runtime, en ese orden y dentro del job `release-gates`.
const releaseGatesJobStart = ciSource.indexOf("\n  release-gates:\n");
assert.ok(releaseGatesJobStart >= 0, "CI debe tener el job release-gates.");
const releaseGatesJobEnd = ciSource
  .slice(releaseGatesJobStart + 1)
  .search(/\n  [a-z][a-z0-9-]*:\n/);
const releaseGatesJob =
  releaseGatesJobEnd === -1
    ? ciSource.slice(releaseGatesJobStart)
    : ciSource.slice(
        releaseGatesJobStart,
        releaseGatesJobStart + 1 + releaseGatesJobEnd,
      );
const releaseGatesOrder = [
  "name: Instalar el lock de sistema verificado",
  "name: Instalar Git auditado para los gates de release",
  "name: Materializar runtimes auditados con ownership del runner",
  ciIsolatedPnpmRecipe,
  "assertD72CompositeProductionRuntime();",
  "run: pnpm test.release",
].map((marker) => releaseGatesJob.indexOf(marker));
assert.ok(
  releaseGatesOrder.every(
    (position, index) =>
      position >= 0 && (index === 0 || position > releaseGatesOrder[index - 1]),
  ),
  "release-gates debe materializar la toolchain auditada antes de pnpm test.release.",
);
assert.match(
  releaseGatesJob,
  /AGORBIS_REQUIRE_PINNED_TOOLCHAIN: "1"/,
  "release-gates no puede saltar el inventario de la toolchain fijada.",
);
assert.doesNotMatch(
  ciSource,
  /^\s*cache:\s*pnpm\s*$|uses:\s*actions\/cache/imu,
  "CI no puede restaurar un store pnpm previo.",
);
assert.equal(
  [
    ...readFileSync(
      path.join(actualRepositoryRoot, "pnpm-workspace.yaml"),
      "utf8",
    ).matchAll(/^sideEffectsCache:\s*(\S+)\s*$/gm),
  ]
    .map((match) => match[1])
    .join(","),
  "false",
  "pnpm-workspace.yaml debe desactivar exactamente el cache no reproducible de side-effects.",
);
const productionRunbookSource = readFileSync(
  path.join(actualRepositoryRoot, "docs/PRODUCTION_RUNBOOK.md"),
  "utf8",
);
for (const requiredReleasePreparation of [
  'agorbis_release_store="${agorbis_release_root}/pnpm-store"',
  'test ! -e "$agorbis_release_store"',
  'test ! -L "$agorbis_release_store"',
  'test "$(node --version)" = "v22.22.0"',
  'test "$(pnpm --version)" = "11.15.0"',
  'test "$(pnpm config get sideEffectsCache)" = "false"',
  'pnpm install --frozen-lockfile --store-dir "$agorbis_release_store"',
  'pnpm store path --store-dir "$agorbis_release_store"',
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
]) {
  assert.ok(
    productionRunbookSource.includes(requiredReleasePreparation),
    `El runbook debe fijar la preparación aislada: ${requiredReleasePreparation}`,
  );
}
for (const requiredHostileStoreProtocol of [
  "### Protocolo cross-store hostil",
  "umask 0002",
  'pnpm install --frozen-lockfile --store-dir "$agorbis_isolated_store"',
  "if node scripts/test-exceptional-wrangler-integrity.mjs; then",
  "No convertir el hash del store hostil en una alternativa permitida.",
]) {
  assert.ok(
    productionRunbookSource.includes(requiredHostileStoreProtocol),
    `El runbook debe conservar el protocolo cross-store fail-closed: ${requiredHostileStoreProtocol}`,
  );
}
assert.equal(
  productionRunbookSource.split(
    'pnpm install --frozen-lockfile --store-dir "$agorbis_hostile_store"',
  ).length - 1,
  2,
  "El protocolo debe crear y reutilizar exactamente el mismo store hostil.",
);

const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-exceptional-artifact-test-"),
);
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const POLICY_VERSION = "D72/test/v1";
const POLICY_HASH = "a".repeat(64);
const CREATED_AT = new Date("2026-08-30T18:00:00.000Z");
let fixtureCounter = 0;
const fakeVerifiedWranglerIntegrity = Object.freeze({
  version: EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
  lockHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash,
  closureHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
  entrypointHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.entrypointHash,
  executionEntrypointHash: EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
});
const verifyWranglerIntegrityImpl = () => fakeVerifiedWranglerIntegrity;

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function writeFile(filePath, content, mode = 0o664) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { mode });
  chmodSync(filePath, mode);
}

function createFixture(label) {
  fixtureCounter += 1;
  const fixtureRoot = path.join(
    temporaryRoot,
    `${String(fixtureCounter).padStart(2, "0")}-${label}`,
  );
  const repositoryRoot = path.join(fixtureRoot, "repo");
  const evidenceRoot = path.join(fixtureRoot, "evidence");
  mkdirSync(repositoryRoot, { recursive: true, mode: 0o755 });
  mkdirSync(evidenceRoot, { mode: 0o700 });

  writeFile(
    path.join(repositoryRoot, "package.json"),
    `${JSON.stringify({
      type: "module",
      devDependencies: {
        wrangler: EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
      },
    })}\n`,
  );
  writeFile(
    path.join(repositoryRoot, "node_modules/wrangler/package.json"),
    `${JSON.stringify({
      name: "wrangler",
      version: EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
    })}\n`,
  );
  writeFile(
    path.join(repositoryRoot, "wrangler.jsonc"),
    '{"main":"dist/_worker.js","assets":{"directory":"./dist"}}\n',
  );
  writeFile(
    path.join(repositoryRoot, "wrangler.crons-open.jsonc"),
    '{"$schema":"node_modules/wrangler/config-schema.json","name":"agorbis","account_id":"4d78fb10c1ae65281ec851479d5045dc","workers_dev":false,"preview_urls":false,"triggers":{"crons":["10 * * * *","5 0 * * *","25 0 * * *","20 3 * * *","40 3 * * *"]}}\n',
  );
  writeFile(
    path.join(repositoryRoot, "wrangler.crons-closed.jsonc"),
    '{"$schema":"node_modules/wrangler/config-schema.json","name":"agorbis","account_id":"4d78fb10c1ae65281ec851479d5045dc","workers_dev":false,"preview_urls":false,"triggers":{"crons":[]}}\n',
  );
  writeFile(
    path.join(repositoryRoot, "wrangler.traffic.jsonc"),
    '{"$schema":"node_modules/wrangler/config-schema.json","name":"agorbis","account_id":"4d78fb10c1ae65281ec851479d5045dc"}\n',
  );
  writeFile(
    path.join(repositoryRoot, "scripts/exceptional-release-empty.env"),
    Buffer.alloc(0),
  );
  writeFile(
    path.join(repositoryRoot, "dist/_worker.js"),
    'export { default } from "../server/entry.cloudflare-workers.js";\n',
  );
  writeFile(
    path.join(repositoryRoot, "dist/assets/app.js"),
    'console.log("fixture");\n',
  );
  writeFile(
    path.join(repositoryRoot, "dist/assets/logo.bin"),
    Buffer.from([0, 1, 2, 255]),
  );
  writeFile(
    path.join(repositoryRoot, "server/entry.cloudflare-workers.js"),
    "export default { fetch() { return new Response('ok'); } };\n",
  );
  writeFile(
    path.join(repositoryRoot, "server/build/chunk.js"),
    "export const chunk = true;\n",
  );

  const requestPath = path.join(evidenceRoot, "d72-request.json");
  const requestSource = `${JSON.stringify({
    head: HEAD,
    policyHash: POLICY_HASH,
    policyVersion: POLICY_VERSION,
  })}\n`;
  writeFile(requestPath, requestSource, 0o600);
  const requestHash = sha256(requestSource);
  return {
    fixtureRoot,
    repositoryRoot,
    evidenceRoot,
    requestPath,
    requestHash,
  };
}

function freeze(fixture, overrides = {}) {
  const frozen = freezeExceptionalReleaseArtifact({
    repositoryRoot: fixture.repositoryRoot,
    requestPath: fixture.requestPath,
    head: HEAD,
    policyVersion: POLICY_VERSION,
    policyHash: POLICY_HASH,
    requestHash: fixture.requestHash,
    now: CREATED_AT,
    verifyWranglerIntegrityImpl,
    ...overrides,
  });
  fixture.artifactHash = frozen.artifactHash;
  return frozen;
}

function prepareOrReuse(fixture, overrides = {}) {
  const prepared = prepareOrReuseExceptionalReleaseArtifact({
    repositoryRoot: fixture.repositoryRoot,
    requestPath: fixture.requestPath,
    head: HEAD,
    policyVersion: POLICY_VERSION,
    policyHash: POLICY_HASH,
    requestHash: fixture.requestHash,
    now: CREATED_AT,
    verifyWranglerIntegrityImpl,
    ...overrides,
  });
  fixture.artifactHash = prepared.artifactHash;
  return prepared;
}

function readFrozen(fixture, overrides = {}) {
  return readExceptionalReleaseArtifactManifest({
    requestPath: fixture.requestPath,
    worktreeRoot: fixture.repositoryRoot,
    expectedHead: HEAD,
    expectedPolicyVersion: POLICY_VERSION,
    expectedPolicyHash: POLICY_HASH,
    expectedRequestHash: fixture.requestHash,
    expectedArtifactHash: fixture.artifactHash,
    verifyWranglerIntegrityImpl,
    ...overrides,
  });
}

function recursiveInventory(root) {
  const files = [];
  const directories = [];

  function walk(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stats = lstatSync(absolute);
      if (stats.isDirectory()) {
        directories.push(relative);
        walk(absolute, relative);
      } else {
        files.push(relative);
      }
    }
  }

  walk(root);
  return { files: files.sort(), directories: directories.sort() };
}

function assertArtifactAbsent(fixture) {
  const paths = deriveExceptionalReleaseArtifactPaths(fixture.requestPath);
  assert.throws(() => lstatSync(paths.artifactRoot), { code: "ENOENT" });
  assert.throws(() => lstatSync(paths.manifestPath), { code: "ENOENT" });
}

function expectFreezeFailure(fixture, expected) {
  assert.throws(() => freeze(fixture), expected);
  assertArtifactAbsent(fixture);
}

try {
  const fixture = createFixture("happy-path");
  const derived = deriveExceptionalReleaseArtifactPaths(fixture.requestPath);
  assert.equal(derived.artifactRoot.endsWith(".artifact"), true);
  assert.equal(derived.manifestPath.endsWith(".artifact.json"), true);
  assert.equal(
    path
      .relative(fixture.repositoryRoot, derived.artifactRoot)
      .startsWith(".."),
    true,
  );
  const frozen = freeze(fixture);
  assert.equal(frozen.artifactRoot, derived.artifactRoot);
  assert.equal(frozen.manifestPath, derived.manifestPath);
  assert.equal(
    frozen.manifest.schemaVersion,
    EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  );
  assert.equal(frozen.manifest.head, HEAD);
  assert.equal(frozen.manifest.policyVersion, POLICY_VERSION);
  assert.equal(frozen.manifest.policyHash, POLICY_HASH);
  assert.equal(frozen.manifest.requestHash, fixture.requestHash);
  assert.equal(
    frozen.manifest.nodeVersion,
    EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  );
  assert.equal(
    frozen.manifest.wranglerVersion,
    EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
  );
  assert.equal(frozen.manifest.createdAtUtc, CREATED_AT.toISOString());
  assert.equal(frozen.artifactSha256, frozen.manifest.contentSha256);
  assert.equal(frozen.artifactHash, frozen.manifest.contentSha256);
  assert.equal(
    frozen.manifest.contentSha256,
    exceptionalReleaseArtifactHash(frozen.manifest),
  );
  assert.match(frozen.artifactSha256, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.manifest));
  assert.ok(Object.isFrozen(frozen.manifest.files));

  const manifestSource = readFileSync(frozen.manifestPath, "utf8");
  assert.equal(
    manifestSource,
    canonicalExceptionalReleaseArtifactJson(frozen.manifest),
  );
  assert.equal(lstatSync(frozen.artifactRoot).mode & 0o777, 0o700);
  assert.equal(lstatSync(frozen.manifestPath).mode & 0o777, 0o600);
  const inventory = recursiveInventory(frozen.artifactRoot);
  assert.deepEqual(
    inventory.files,
    frozen.manifest.files.map((entry) => entry.path),
  );
  assert.deepEqual(inventory.directories, [
    "dist",
    "dist/assets",
    "server",
    "server/build",
  ]);
  for (const directory of inventory.directories) {
    assert.equal(
      lstatSync(path.join(frozen.artifactRoot, directory)).mode & 0o777,
      0o700,
    );
  }
  for (const file of inventory.files) {
    assert.equal(
      lstatSync(path.join(frozen.artifactRoot, file)).mode & 0o777,
      0o600,
    );
  }
  assert.equal(
    readFileSync(path.join(frozen.artifactRoot, "dist/_worker.js"), "utf8"),
    readFileSync(path.join(fixture.repositoryRoot, "dist/_worker.js"), "utf8"),
  );
  assert.equal(
    readFileSync(
      path.join(
        frozen.artifactRoot,
        EXCEPTIONAL_RELEASE_ARTIFACT_EMPTY_ENV_PATH,
      ),
    ).length,
    0,
  );
  assert.equal(
    frozen.manifest.files.some(
      (entry) => entry.path === "wrangler.crons-open.jsonc",
    ),
    true,
  );
  assert.equal(
    frozen.manifest.files.some(
      (entry) => entry.path === "wrangler.crons-closed.jsonc",
    ),
    true,
  );
  assert.equal(
    frozen.manifest.files.some(
      (entry) => entry.path === "wrangler.traffic.jsonc",
    ),
    true,
  );
  assert.deepEqual(
    validateExceptionalReleaseArtifact({
      artifactRoot: frozen.artifactRoot,
      worktreeRoot: fixture.repositoryRoot,
      manifest: frozen.manifest,
      expectedHead: HEAD,
      expectedPolicyVersion: POLICY_VERSION,
      expectedPolicyHash: POLICY_HASH,
      expectedRequestHash: fixture.requestHash,
      expectedArtifactHash: frozen.artifactHash,
    }),
    [],
  );
  assert.deepEqual(readFrozen(fixture), frozen.manifest);
  assert.ok(Object.isFrozen(readFrozen(fixture)));
  const frozenRootStats = lstatSync(frozen.artifactRoot);
  const frozenManifestStats = lstatSync(frozen.manifestPath);
  const frozenWorkerSource = readFileSync(
    path.join(frozen.artifactRoot, "dist/_worker.js"),
  );
  writeFileSync(
    path.join(fixture.repositoryRoot, "dist/_worker.js"),
    "source changed after canary\n",
  );
  const reused = prepareOrReuse(fixture, {
    now: new Date("2026-08-31T18:00:00.000Z"),
  });
  assert.deepEqual(reused, frozen);
  assert.equal(reused.manifest.createdAtUtc, CREATED_AT.toISOString());
  assert.equal(lstatSync(reused.artifactRoot).ino, frozenRootStats.ino);
  assert.equal(lstatSync(reused.manifestPath).ino, frozenManifestStats.ino);
  assert.deepEqual(
    readFileSync(path.join(reused.artifactRoot, "dist/_worker.js")),
    frozenWorkerSource,
  );
  assert.deepEqual(
    prepareOrReuse(fixture, { expectedArtifactHash: frozen.artifactHash }),
    frozen,
  );
  assert.throws(
    () =>
      prepareOrReuse(fixture, {
        expectedArtifactHash: "f".repeat(64),
      }),
    /artifactHash externo no coincide/,
  );
  assert.throws(() => freeze(fixture), /ya existen|no se sobrescriben/);
  assert.throws(
    () => readFrozen(fixture, { expectedHead: "f".repeat(40) }),
    /HEAD del request no coincide|HEAD del artifact no coincide/,
  );
  assert.throws(
    () => readFrozen(fixture, { expectedArtifactHash: "f".repeat(64) }),
    /artifactHash externo no coincide/,
  );

  const wrongRuntimeManifest = structuredClone(frozen.manifest);
  wrongRuntimeManifest.nodeVersion = "22.21.0";
  wrongRuntimeManifest.contentSha256 =
    exceptionalReleaseArtifactHash(wrongRuntimeManifest);
  assert.match(
    validateExceptionalReleaseArtifactManifest(wrongRuntimeManifest, {
      expectedHead: HEAD,
      expectedPolicyVersion: POLICY_VERSION,
      expectedPolicyHash: POLICY_HASH,
      expectedRequestHash: fixture.requestHash,
      expectedArtifactHash: wrongRuntimeManifest.contentSha256,
    }).join("\n"),
    /Node 22\.22\.0/,
  );
  wrongRuntimeManifest.nodeVersion = EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION;
  wrongRuntimeManifest.wranglerVersion = "4.125.0";
  wrongRuntimeManifest.contentSha256 =
    exceptionalReleaseArtifactHash(wrongRuntimeManifest);
  assert.match(
    validateExceptionalReleaseArtifactManifest(wrongRuntimeManifest, {
      expectedHead: HEAD,
      expectedPolicyVersion: POLICY_VERSION,
      expectedPolicyHash: POLICY_HASH,
      expectedRequestHash: fixture.requestHash,
      expectedArtifactHash: wrongRuntimeManifest.contentSha256,
    }).join("\n"),
    /Wrangler 4\.160\.1/,
  );

  const preparedNew = createFixture("prepare-new");
  const preparedNewArtifact = prepareOrReuse(preparedNew);
  assert.equal(
    readFileSync(preparedNewArtifact.manifestPath, "utf8"),
    canonicalExceptionalReleaseArtifactJson(preparedNewArtifact.manifest),
  );

  const missingAnchored = createFixture("missing-anchored");
  assert.throws(
    () =>
      prepareOrReuse(missingAnchored, {
        expectedArtifactHash: "f".repeat(64),
      }),
    /artifact anclado.*no se recrea/,
  );
  assertArtifactAbsent(missingAnchored);

  const artifactOnly = createFixture("partial-artifact-only");
  const artifactOnlyFrozen = freeze(artifactOnly);
  unlinkSync(artifactOnlyFrozen.manifestPath);
  assert.throws(() => prepareOrReuse(artifactOnly), /estado parcial/);

  const manifestOnly = createFixture("partial-manifest-only");
  const manifestOnlyFrozen = freeze(manifestOnly);
  rmSync(manifestOnlyFrozen.artifactRoot, { recursive: true });
  assert.throws(() => prepareOrReuse(manifestOnly), /estado parcial/);

  const modified = createFixture("modified-file");
  const modifiedFrozen = freeze(modified);
  writeFileSync(
    path.join(modifiedFrozen.artifactRoot, "dist/_worker.js"),
    "modified\n",
  );
  assert.throws(
    () =>
      prepareOrReuse(modified, {
        expectedArtifactHash: modifiedFrozen.artifactHash,
      }),
    /fue modificado/,
  );

  const forgedTreeAndManifest = createFixture("forged-tree-and-manifest");
  const forgedFrozen = freeze(forgedTreeAndManifest);
  const forgedWorkerPath = path.join(
    forgedFrozen.artifactRoot,
    "dist/_worker.js",
  );
  const forgedWorker = Buffer.from("jointly forged\n");
  writeFileSync(forgedWorkerPath, forgedWorker);
  const forgedManifest = structuredClone(forgedFrozen.manifest);
  const forgedEntry = forgedManifest.files.find(
    (entry) => entry.path === "dist/_worker.js",
  );
  forgedEntry.size = forgedWorker.length;
  forgedEntry.sha256 = sha256(forgedWorker);
  forgedManifest.contentSha256 = exceptionalReleaseArtifactHash(forgedManifest);
  writeFileSync(
    forgedFrozen.manifestPath,
    canonicalExceptionalReleaseArtifactJson(forgedManifest),
  );
  assert.throws(
    () => readFrozen(forgedTreeAndManifest),
    /artifactHash externo no coincide/,
  );

  const missing = createFixture("missing-file");
  const missingFrozen = freeze(missing);
  unlinkSync(path.join(missingFrozen.artifactRoot, "server/build/chunk.js"));
  assert.throws(() => readFrozen(missing), /Falta el archivo congelado/);

  const extra = createFixture("extra-file");
  const extraFrozen = freeze(extra);
  writeFile(
    path.join(extraFrozen.artifactRoot, "dist/extra.js"),
    "extra\n",
    0o600,
  );
  assert.throws(() => readFrozen(extra), /archivo extra/);

  const extraDirectory = createFixture("extra-directory");
  const extraDirectoryFrozen = freeze(extraDirectory);
  mkdirSync(path.join(extraDirectoryFrozen.artifactRoot, "dist/empty"), {
    mode: 0o700,
  });
  assert.throws(() => readFrozen(extraDirectory), /directorio extra/);

  const artifactSymlink = createFixture("artifact-symlink");
  const artifactSymlinkFrozen = freeze(artifactSymlink);
  symlinkSync(
    "_worker.js",
    path.join(artifactSymlinkFrozen.artifactRoot, "dist/link.js"),
  );
  assert.throws(() => prepareOrReuse(artifactSymlink), /contiene un symlink/);
  assert.throws(() => readFrozen(artifactSymlink), /contiene un symlink/);

  const artifactHardLink = createFixture("artifact-hard-link");
  const artifactHardLinkFrozen = freeze(artifactHardLink);
  linkSync(
    path.join(artifactHardLinkFrozen.artifactRoot, "dist/_worker.js"),
    path.join(artifactHardLink.evidenceRoot, "worker-hard-link.js"),
  );
  assert.throws(
    () =>
      prepareOrReuse(artifactHardLink, {
        expectedArtifactHash: artifactHardLinkFrozen.artifactHash,
      }),
    /no puede tener hard links/,
  );

  const wrongFileMode = createFixture("wrong-file-mode");
  const wrongFileModeFrozen = freeze(wrongFileMode);
  chmodSync(
    path.join(wrongFileModeFrozen.artifactRoot, "wrangler.jsonc"),
    0o644,
  );
  assert.throws(() => readFrozen(wrongFileMode), /no tiene modo 0600/);

  const wrongDirectoryMode = createFixture("wrong-directory-mode");
  const wrongDirectoryModeFrozen = freeze(wrongDirectoryMode);
  chmodSync(path.join(wrongDirectoryModeFrozen.artifactRoot, "server"), 0o755);
  assert.throws(() => readFrozen(wrongDirectoryMode), /no tiene modo 0700/);

  const wrongRootMode = createFixture("wrong-root-mode");
  const wrongRootModeFrozen = freeze(wrongRootMode);
  chmodSync(wrongRootModeFrozen.artifactRoot, 0o755);
  assert.throws(
    () => readFrozen(wrongRootMode),
    /artifactRoot no tiene modo 0700/,
  );

  const specialModeBits = createFixture("special-mode-bits");
  const specialModeFrozen = freeze(specialModeBits);
  chmodSync(
    path.join(specialModeFrozen.artifactRoot, "wrangler.jsonc"),
    0o4600,
  );
  assert.throws(() => readFrozen(specialModeBits), /no tiene modo 0600/);

  const wrongManifestMode = createFixture("wrong-manifest-mode");
  const wrongManifestModeFrozen = freeze(wrongManifestMode);
  chmodSync(wrongManifestModeFrozen.manifestPath, 0o644);
  assert.throws(
    () => readFrozen(wrongManifestMode),
    /manifest no tiene modo 0600/,
  );

  const tamperedManifest = createFixture("tampered-manifest");
  const tamperedManifestFrozen = freeze(tamperedManifest);
  const changedManifest = structuredClone(tamperedManifestFrozen.manifest);
  changedManifest.head = "f".repeat(40);
  writeFileSync(
    tamperedManifestFrozen.manifestPath,
    canonicalExceptionalReleaseArtifactJson(changedManifest),
  );
  assert.throws(
    () => readFrozen(tamperedManifest),
    /HEAD del artifact no coincide|contentSha256 del artifact no coincide/,
  );
  assert.throws(
    () => prepareOrReuse(tamperedManifest),
    /HEAD del artifact no coincide|contentSha256 del artifact no coincide/,
  );

  const nonCanonicalManifest = createFixture("noncanonical-manifest");
  const nonCanonicalFrozen = freeze(nonCanonicalManifest);
  writeFileSync(
    nonCanonicalFrozen.manifestPath,
    `${JSON.stringify(nonCanonicalFrozen.manifest, null, 2)}\n`,
  );
  assert.throws(() => readFrozen(nonCanonicalManifest), /JSON canónico exacto/);

  const changedRequest = createFixture("changed-request");
  freeze(changedRequest);
  writeFileSync(changedRequest.requestPath, "{}\n");
  assert.throws(() => readFrozen(changedRequest), /requestHash no coincide/);

  const semanticallyDifferentRequest = createFixture(
    "semantically-different-request",
  );
  const semanticallyDifferentSource = `${JSON.stringify({
    head: "f".repeat(40),
    policyHash: POLICY_HASH,
    policyVersion: POLICY_VERSION,
  })}\n`;
  writeFileSync(
    semanticallyDifferentRequest.requestPath,
    semanticallyDifferentSource,
  );
  semanticallyDifferentRequest.requestHash = sha256(
    semanticallyDifferentSource,
  );
  expectFreezeFailure(
    semanticallyDifferentRequest,
    /HEAD del request no coincide/,
  );

  const sourceSymlink = createFixture("source-symlink");
  symlinkSync(
    "_worker.js",
    path.join(sourceSymlink.repositoryRoot, "dist/worker-link.js"),
  );
  expectFreezeFailure(sourceSymlink, /árbol fuente contiene un symlink/);

  const missingSource = createFixture("missing-source");
  rmSync(path.join(missingSource.repositoryRoot, "server"), {
    recursive: true,
  });
  expectFreezeFailure(missingSource, /ENOENT/);

  const emptySourceDirectory = createFixture("empty-source-directory");
  mkdirSync(path.join(emptySourceDirectory.repositoryRoot, "dist/empty"));
  expectFreezeFailure(emptySourceDirectory, /no puede estar vacío/);

  const nonemptyEnv = createFixture("nonempty-env");
  writeFileSync(
    path.join(
      nonemptyEnv.repositoryRoot,
      "scripts/exceptional-release-empty.env",
    ),
    "SHOULD_NOT_EXIST=1\n",
  );
  expectFreezeFailure(nonemptyEnv, /debe estar exactamente vacío/);

  const wrongInstalledWrangler = createFixture("wrong-installed-wrangler");
  writeFileSync(
    path.join(
      wrongInstalledWrangler.repositoryRoot,
      "node_modules/wrangler/package.json",
    ),
    '{"name":"wrangler","version":"4.125.0"}\n',
  );
  expectFreezeFailure(wrongInstalledWrangler, /instalado debe ser 4\.160\.1/);

  const rangedWrangler = createFixture("ranged-wrangler");
  writeFileSync(
    path.join(rangedWrangler.repositoryRoot, "package.json"),
    '{"devDependencies":{"wrangler":"^4.160.1"}}\n',
  );
  expectFreezeFailure(rangedWrangler, /fijar Wrangler 4\.160\.1 sin rango/);

  const publicEvidenceParent = createFixture("public-evidence-parent");
  chmodSync(publicEvidenceParent.evidenceRoot, 0o755);
  expectFreezeFailure(publicEvidenceParent, /modo exacto 0700/);

  const wrongRequestHash = createFixture("wrong-request-hash");
  assert.throws(
    () => freeze(wrongRequestHash, { requestHash: "b".repeat(64) }),
    /requestHash no coincide/,
  );
  assertArtifactAbsent(wrongRequestHash);

  const requestInsideWorktree = createFixture("request-inside-worktree");
  chmodSync(requestInsideWorktree.repositoryRoot, 0o700);
  requestInsideWorktree.requestPath = path.join(
    requestInsideWorktree.repositoryRoot,
    "request.json",
  );
  writeFile(requestInsideWorktree.requestPath, '{"request":"inside"}\n', 0o600);
  requestInsideWorktree.requestHash = sha256('{"request":"inside"}\n');
  assert.throws(
    () => freeze(requestInsideWorktree),
    /deben quedar fuera del worktree/,
  );

  const requestSymlink = createFixture("request-symlink");
  const realRequest = `${requestSymlink.requestPath}.real`;
  writeFile(realRequest, readFileSync(requestSymlink.requestPath), 0o600);
  unlinkSync(requestSymlink.requestPath);
  symlinkSync(path.basename(realRequest), requestSymlink.requestPath);
  assert.throws(() => freeze(requestSymlink), /no un symlink/);

  const preexistingArtifactSymlink = createFixture("preexisting-artifact-link");
  const preexistingPaths = deriveExceptionalReleaseArtifactPaths(
    preexistingArtifactSymlink.requestPath,
  );
  const sentinelDirectory = path.join(
    preexistingArtifactSymlink.evidenceRoot,
    "sentinel",
  );
  mkdirSync(sentinelDirectory, { mode: 0o700 });
  symlinkSync(sentinelDirectory, preexistingPaths.artifactRoot);
  assert.throws(
    () => freeze(preexistingArtifactSymlink),
    /ya existen|no se sobrescriben/,
  );
  assert.throws(
    () => prepareOrReuse(preexistingArtifactSymlink),
    /estado parcial/,
  );
  assert.equal(lstatSync(preexistingPaths.artifactRoot).isSymbolicLink(), true);

  const preexistingManifestSymlink = createFixture("preexisting-manifest-link");
  const preexistingManifestPaths = deriveExceptionalReleaseArtifactPaths(
    preexistingManifestSymlink.requestPath,
  );
  const sentinelFile = path.join(
    preexistingManifestSymlink.evidenceRoot,
    "sentinel.json",
  );
  writeFile(sentinelFile, "sentinel\n", 0o600);
  symlinkSync(sentinelFile, preexistingManifestPaths.manifestPath);
  assert.throws(
    () => freeze(preexistingManifestSymlink),
    /ya existen|no se sobrescriben/,
  );
  assert.throws(
    () => prepareOrReuse(preexistingManifestSymlink),
    /estado parcial/,
  );
  assert.equal(readFileSync(sentinelFile, "utf8"), "sentinel\n");

  assert.throws(
    () => deriveExceptionalReleaseArtifactPaths("relative.json"),
    /ruta absoluta/,
  );
  assert.throws(
    () =>
      deriveExceptionalReleaseArtifactPaths(
        path.join(temporaryRoot, "reserved.act.json"),
      ),
    /no reservado/,
  );

  const open = createFixture("open-primary-recovery");
  const openRequest = {
    head: HEAD,
    policyHash: POLICY_HASH,
    policyVersion: POLICY_VERSION,
    schemaVersion: "agorbis-exceptional-release-request/v2",
    releaseMode: "OPEN_UPDATE",
    openSourceBaseline: baseline,
    openSourceBaselineSha256: expectedBaselineSha256,
  };
  const openRequestText = canonicalExceptionalReleaseArtifactJson(openRequest);
  writeFile(open.requestPath, openRequestText, 0o600);
  open.requestHash = sha256(openRequestText);
  for (const name of ["wrangler.jsonc", "wrangler.open-recovery.jsonc"]) {
    writeFile(
      path.join(open.repositoryRoot, name),
      readFileSync(path.join(actualRepositoryRoot, name)),
    );
  }
  assert.throws(
    () => freeze(open, { now: NOW }),
    /ENOENT/,
    "El principal no puede congelarse sin fallback.",
  );
  const recovery = freeze(open, { artifactPurpose: "recovery", now: NOW });
  assert.equal(recovery.manifest.artifactPurpose, "recovery");
  assert.equal(recovery.manifest.recoveryArtifactHash, null);
  assert.match(recovery.artifactRoot, /\.recovery\.artifact$/);
  assert.equal(
    readFileSync(path.join(recovery.artifactRoot, "wrangler.jsonc"), "utf8"),
    readFileSync(
      path.join(actualRepositoryRoot, "wrangler.open-recovery.jsonc"),
      "utf8",
    ),
  );
  const primary = freeze(open, { now: NOW });
  assert.equal(primary.manifest.recoveryArtifactHash, recovery.artifactHash);
  assert.notEqual(primary.artifactHash, recovery.artifactHash);
  assert.deepEqual(readFrozen(open), primary.manifest);
  assert.deepEqual(
    readFrozen(open, {
      artifactPurpose: "recovery",
      expectedArtifactHash: recovery.artifactHash,
    }),
    recovery.manifest,
  );
  assert.throws(
    () => readFrozen(open, { artifactPurpose: "recovery" }),
    /artifactHash|Artifact excepcional inválido/,
  );
  const recoveryWorker = path.join(recovery.artifactRoot, "dist/_worker.js");
  writeFile(recoveryWorker, "modified fallback", 0o600);
  assert.throws(
    () => readFrozen(open),
    /Artifact excepcional inválido/,
    "Modificar fallback invalida también el principal.",
  );
  const legacyRecovery = createFixture("legacy-cannot-freeze-open-recovery");
  assert.throws(
    () => freeze(legacyRecovery, { artifactPurpose: "recovery" }),
    /requiere request OPEN_UPDATE/,
  );
  assert.throws(
    () =>
      deriveExceptionalReleaseArtifactPaths(open.requestPath, {
        artifactPurpose: "other",
      }),
    /Propósito/,
  );

  console.log("Exceptional release artifact: PASS");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
