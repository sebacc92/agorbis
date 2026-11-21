#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  D72_AUTH_SETTINGS_EXTERNAL_KEYS,
  D72_AUTH_SETTINGS_TOP_LEVEL_KEYS,
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS,
  D72_COMPOSITE_PINNED_GIT_EXECUTABLE,
  D72_COMPOSITE_PINNED_PNPM_EXECUTABLE,
  D72_COMPOSITE_OBSERVATION_IDS,
  D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE,
  D72_NON_STATEFUL_COMPOSITE_COLLECTOR_SCHEMA_VERSION,
  D72_NON_STATEFUL_COMPOSITE_INTEGRATION_CONTRACT,
  assertD72NonStatefulCompositeCollectorReceipt,
  assertD72OpenSourceCompositeSnapshot,
  assertD72CompositeProductionRuntime,
  assertTestD72DnsAuditChildResult,
  collectD72NonStatefulCompositeReceipt,
  collectTestD72CompositePinnedFileEvidence,
  collectTestD72CompositePinnedToolEvidence,
  collectTestD72NonStatefulCompositeReceipt,
  createTestD72DnsAuditChildInvocation,
  deriveD72CompositeGateStatuses,
  deriveD72CompositeSourceStatuses,
  issueTestD72NonStatefulCompositeCollectorReceipt,
  readBoundedD72AuthSettings,
  socialProviderEvidenceBlockers,
  validateD72AuthProviderSettings,
  validateD72CandidateAuthConfiguration,
  validateD72CompositePinnedToolEvidence,
} from "./d72-non-stateful-composite-collector.mjs";
import { CLOUDFLARE_PUBLIC_BUILD_VARIABLES } from "./cloudflare-public-build-environment.mjs";
import { readWranglerConfiguration } from "./cloudflare-worker-policy.mjs";
import {
  EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256,
  EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION,
} from "./cloudflare-dns-audit.mjs";
import {
  EVIDENCE_STATUS,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

import {
  sourceSnapshot,
  baseline as openBaseline,
  expectedBaselineSha256 as openBaselineHash,
  NOW as openNow,
} from "./cloudflare-open-source-smoke-test-fixture.mjs";

const qwikPackageRoot = realpathSync(
  path.resolve("node_modules/@qwik.dev/core"),
);
const playwrightPackageRoot = realpathSync(
  path.resolve("node_modules/@playwright/test"),
);
const canonicalQwikNodePathParts = Object.freeze([
  path.join(qwikPackageRoot, "node_modules"),
  path.resolve(qwikPackageRoot, "..", ".."),
  path.resolve("node_modules/.pnpm/node_modules"),
]);
const canonicalCandidateNodePath = canonicalQwikNodePathParts.join(
  path.delimiter,
);
const canonicalE2eNodePath = [
  ...canonicalQwikNodePathParts,
  path.join(playwrightPackageRoot, "node_modules"),
  path.resolve(playwrightPackageRoot, "..", ".."),
  path.resolve("node_modules/.pnpm/node_modules"),
].join(path.delimiter);

function clearCanonicalQwikNodePathForLocalEvidenceTest(environment) {
  const hasNodePath = Object.hasOwn(environment, "NODE_PATH");
  const forceColor =
    environment.FORCE_COLOR === "true" &&
    environment.NO_COLOR === "1" &&
    environment.CI === "true" &&
    environment.DO_NOT_TRACK === "1" &&
    environment.LC_ALL === "C" &&
    environment.AGORBIS_D72_CANDIDATE_BUILD === "true" &&
    environment.AGORBIS_D72_DEPLOYMENT_AUTHORIZED === "false" &&
    environment.AGORBIS_D72_DEPLOYMENT_EXECUTED === "false" &&
    environment.AGORBIS_D72_RISK_ACCEPTANCE_RECORDED === "false" &&
    environment.AGORBIS_CLOUDFLARE_PUBLIC_BUILD_LOCKED === "1"
      ? "0"
      : (environment.FORCE_COLOR ?? "");
  if (!hasNodePath) {
    assert.ok(
      !["0", "1", "true"].includes(forceColor),
      "El perfil local canónico exige NODE_PATH presente.",
    );
    return false;
  }
  assert.equal(
    environment.npm_lifecycle_event,
    "test.release-open",
    "Sólo el test release-open puede consumir el NODE_PATH canónico de Qwik.",
  );
  const expectedNodePaths =
    forceColor === "0"
      ? [canonicalCandidateNodePath]
      : /^(?:1|true)$/.test(forceColor)
        ? [canonicalCandidateNodePath, canonicalE2eNodePath]
        : null;
  assert.notEqual(
    expectedNodePaths,
    null,
    "FORCE_COLOR no identifica un perfil local D72 canónico.",
  );
  assert.ok(
    expectedNodePaths.includes(environment.NODE_PATH),
    "El harness local rechaza cualquier NODE_PATH distinto del shim Qwik fijado.",
  );
  delete environment.NODE_PATH;
  return true;
}

for (const forceColor of ["1", "true"]) {
  for (const nodePath of [canonicalCandidateNodePath, canonicalE2eNodePath]) {
    const environment = {
      FORCE_COLOR: forceColor,
      NODE_PATH: nodePath,
      npm_lifecycle_event: "test.release-open",
    };
    assert.equal(
      clearCanonicalQwikNodePathForLocalEvidenceTest(environment),
      true,
    );
    assert.equal(Object.hasOwn(environment, "NODE_PATH"), false);
  }
}

const canonicalCandidateEnvironment = {
  FORCE_COLOR: "0",
  NODE_PATH: canonicalCandidateNodePath,
  npm_lifecycle_event: "test.release-open",
};
assert.equal(
  clearCanonicalQwikNodePathForLocalEvidenceTest(canonicalCandidateEnvironment),
  true,
);
assert.equal(Object.hasOwn(canonicalCandidateEnvironment, "NODE_PATH"), false);

const canonicalNestedCandidateEnvironment = {
  AGORBIS_CLOUDFLARE_PUBLIC_BUILD_LOCKED: "1",
  AGORBIS_D72_CANDIDATE_BUILD: "true",
  AGORBIS_D72_DEPLOYMENT_AUTHORIZED: "false",
  AGORBIS_D72_DEPLOYMENT_EXECUTED: "false",
  AGORBIS_D72_RISK_ACCEPTANCE_RECORDED: "false",
  CI: "true",
  DO_NOT_TRACK: "1",
  FORCE_COLOR: "true",
  LC_ALL: "C",
  NODE_PATH: canonicalCandidateNodePath,
  NO_COLOR: "1",
  npm_lifecycle_event: "test.release-open",
};
assert.equal(
  clearCanonicalQwikNodePathForLocalEvidenceTest(
    canonicalNestedCandidateEnvironment,
  ),
  true,
);
assert.equal(
  Object.hasOwn(canonicalNestedCandidateEnvironment, "NODE_PATH"),
  false,
);

for (const [forceColor, nodePath] of [
  ["0", canonicalE2eNodePath],
  ["0", `${canonicalCandidateNodePath}${path.delimiter}/tmp/extra`],
  ["true", `${canonicalCandidateNodePath}${path.delimiter}/tmp/extra`],
  [
    "0",
    canonicalCandidateNodePath.replace(
      qwikPackageRoot,
      `${qwikPackageRoot}-other-version`,
    ),
  ],
  ["0", canonicalQwikNodePathParts.slice(0, -1).join(path.delimiter)],
  ["0", [...canonicalQwikNodePathParts].reverse().join(path.delimiter)],
  ["0", ""],
]) {
  assert.throws(
    () =>
      clearCanonicalQwikNodePathForLocalEvidenceTest({
        FORCE_COLOR: forceColor,
        NODE_PATH: nodePath,
        npm_lifecycle_event: "test.release-open",
      }),
    /rechaza cualquier NODE_PATH/,
  );
}

assert.throws(
  () =>
    clearCanonicalQwikNodePathForLocalEvidenceTest({
      FORCE_COLOR: "2",
      NODE_PATH: canonicalCandidateNodePath,
      npm_lifecycle_event: "test.release-open",
    }),
  /FORCE_COLOR/,
);
assert.throws(
  () =>
    clearCanonicalQwikNodePathForLocalEvidenceTest({
      FORCE_COLOR: "0",
      npm_lifecycle_event: "test.release-open",
    }),
  /NODE_PATH presente/,
);
assert.throws(
  () =>
    clearCanonicalQwikNodePathForLocalEvidenceTest({
      FORCE_COLOR: "true",
      NODE_PATH: "/tmp/non-canonical-node-path",
      npm_lifecycle_event: "test.release-open",
    }),
  /rechaza cualquier NODE_PATH/,
);
clearCanonicalQwikNodePathForLocalEvidenceTest(process.env);

assert.equal(process.versions.node, "22.22.0");
assert.equal(
  new Set(D72_COMPOSITE_OBSERVATION_IDS).size,
  D72_COMPOSITE_OBSERVATION_IDS.length,
  "El inventario cerrado de observaciones no admite IDs duplicados.",
);
assert.deepEqual(D72_NON_STATEFUL_COMPOSITE_INTEGRATION_CONTRACT, {
  candidateIdentityTransport: "same-process-opaque-capability",
  collectorExport: "collectD72NonStatefulCompositeReceipt",
  deploymentAuthorized: false,
  deploymentExecuted: false,
  issuerId: "scripts/d72-non-stateful-composite-collector.mjs",
  standaloneCli: false,
});
assert.deepEqual(D72_AUTH_SETTINGS_TOP_LEVEL_KEYS, [
  "disable_signup",
  "external",
  "mailer_autoconfirm",
  "passkeys_enabled",
  "phone_autoconfirm",
  "saml_enabled",
  "saml_private_key_next_configured",
  "sms_provider",
]);
assert(D72_AUTH_SETTINGS_EXTERNAL_KEYS.includes("anonymous_users"));
assert.equal(D72_AUTH_SETTINGS_EXTERNAL_KEYS.includes("x"), false);

// El inventario real exige la toolchain auditada (pnpm standalone en la ruta
// canónica del HOME y /usr/bin/git con digest fijo). En una máquina que no la
// materializó, esos archivos no existen y el test no puede decir nada útil:
// se salta con un aviso explícito. El job release-gates de CI fija
// AGORBIS_REQUIRE_PINNED_TOOLCHAIN=1 y run-exceptional-release-local-gates lo
// inyecta como valor fijo en cada paso (PINNED_TOOLCHAIN_ENVIRONMENT), así que
// en esas corridas la ausencia es un fallo y nunca un PASS silencioso. Un archivo presente pero
// distinto (por ejemplo, un git actualizado por la distro) falla siempre.
const missingPinnedTools = [
  D72_COMPOSITE_PINNED_PNPM_EXECUTABLE,
  D72_COMPOSITE_PINNED_GIT_EXECUTABLE,
].filter((executable) => !existsSync(executable));
if (
  missingPinnedTools.length > 0 &&
  process.env.AGORBIS_REQUIRE_PINNED_TOOLCHAIN !== "1"
) {
  console.log(
    `SKIP inventario de la toolchain D72 fijada: no existe ${missingPinnedTools.join(", ")}. ` +
      "Materializala como en el job release-gates de CI o corré con AGORBIS_REQUIRE_PINNED_TOOLCHAIN=1 para exigirla.",
  );
} else {
  const pinnedToolEvidence = collectTestD72CompositePinnedToolEvidence();
  assert.deepEqual(
    validateD72CompositePinnedToolEvidence(pinnedToolEvidence),
    [],
  );
  for (const mutate of [
    (evidence) => {
      evidence.files.pnpm.digest = "0".repeat(64);
    },
    (evidence) => {
      evidence.packageManager = "pnpm@11.15.1";
    },
    (evidence) => {
      evidence.nodeDirectory.entries.push("instrumented-node");
    },
    (evidence) => {
      evidence.pnpmDirectory.entries = ["pnpm"];
    },
  ]) {
    const mutated = structuredClone(pinnedToolEvidence);
    mutate(mutated);
    assert.notDeepEqual(validateD72CompositePinnedToolEvidence(mutated), []);
  }
  assert.equal(assertD72CompositeProductionRuntime(), true);
}

// Ruta ficticia: el builder sólo valida que sea absoluta y canónica; nunca se
// lee. No depende del HOME de nadie.
const dnsTokenFile =
  "/home/agorbis-test/.config/agorbis/cloudflare-dns-read.token";
const dnsOutputRoot = "/tmp/agorbis-d72-dns-fixture";
const dnsInvocation = createTestD72DnsAuditChildInvocation({
  dnsTokenFile,
  outputRoot: dnsOutputRoot,
  testOnly: true,
});
assert.equal(dnsInvocation.command, path.resolve(process.execPath));
assert.deepEqual(dnsInvocation.arguments, [
  path.resolve("scripts/cloudflare-dns-audit.mjs"),
  "--token-file",
  dnsTokenFile,
  "--output-root",
  dnsOutputRoot,
]);
assert.equal(Object.isFrozen(dnsInvocation), true);
assert.equal(Object.isFrozen(dnsInvocation.arguments), true);

const dnsStdout = [
  `Auditoría DNS guardada fuera del repositorio: ${dnsOutputRoot}/20260831T155959Z`,
  `DNS snapshot SHA-256: ${"c".repeat(64)}`,
  "Registros: 14; web Custom Domains: 2.",
  `Auditoría DNS: PASS (cloudflare-custom-domains; ${EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION}; non-web SHA-256 ${EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256}).`,
  "",
].join("\n");
assert.deepEqual(
  assertTestD72DnsAuditChildResult({
    outputRoot: dnsOutputRoot,
    result: {
      signal: null,
      status: 0,
      stderr: "",
      stdout: dnsStdout,
    },
    testOnly: true,
  }),
  {
    recordCount: 14,
    snapshotSha256: "c".repeat(64),
    webRecordCount: 2,
  },
);
for (const result of [
  {
    signal: null,
    status: 0,
    stderr: "",
    stdout: dnsStdout.replace(
      "DNS snapshot SHA-256:",
      "Línea inesperada\nDNS snapshot SHA-256:",
    ),
  },
  { signal: null, status: 1, stderr: "", stdout: dnsStdout },
  { signal: null, status: 0, stderr: "unexpected", stdout: dnsStdout },
  { signal: null, status: 0, stderr: "", stdout: dnsStdout.slice(0, -1) },
]) {
  assert.throws(
    () =>
      assertTestD72DnsAuditChildResult({
        outputRoot: dnsOutputRoot,
        result,
        testOnly: true,
      }),
    /no terminó PASS|salida no canónica/,
  );
}

const compositeCollectorSource = readFileSync(
  new URL("./d72-non-stateful-composite-collector.mjs", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  compositeCollectorSource,
  /\b(?:readRestrictedToken|fetchAllDnsRecords)\b/,
  "El proceso padre nunca debe leer ni recibir el token DNS.",
);
assert.match(
  compositeCollectorSource,
  /"--token-file"[\s\S]*dnsTokenFile[\s\S]*"--output-root"/,
  "El child DNS debe recibir únicamente la ruta por --token-file.",
);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response("instrumented");
  assert.throws(
    () => assertD72CompositeProductionRuntime(),
    /instrumentado|fijado/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

const originalDate = globalThis.Date;
try {
  globalThis.Date = class InstrumentedDate extends originalDate {};
  assert.throws(
    () => assertD72CompositeProductionRuntime(),
    /instrumentado|fijado/,
  );
} finally {
  globalThis.Date = originalDate;
}

const hadNodeOptions = Object.hasOwn(process.env, "NODE_OPTIONS");
const originalNodeOptions = process.env.NODE_OPTIONS;
try {
  process.env.NODE_OPTIONS = "--trace-warnings";
  assert.throws(
    () => assertD72CompositeProductionRuntime(),
    /instrumentado|fijado/,
  );
} finally {
  if (hadNodeOptions) process.env.NODE_OPTIONS = originalNodeOptions;
  else delete process.env.NODE_OPTIONS;
}

const hadNodePath = Object.hasOwn(process.env, "NODE_PATH");
const originalNodePath = process.env.NODE_PATH;
try {
  process.env.NODE_PATH = "/tmp/agorbis-forbidden-node-path";
  assert.throws(
    () => assertD72CompositeProductionRuntime(),
    /instrumentado|fijado/,
  );
} finally {
  if (hadNodePath) process.env.NODE_PATH = originalNodePath;
  else delete process.env.NODE_PATH;
}

process.execArgv.push("--inspect=127.0.0.1:0");
try {
  assert.throws(
    () => assertD72CompositeProductionRuntime(),
    /instrumentado|fijado/,
  );
} finally {
  process.execArgv.pop();
}

const pinnedFileTestRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-d72-pinned-file-"),
);
try {
  const stablePath = path.join(pinnedFileTestRoot, "stable");
  const stableBytes = Buffer.from("fixed-test-elf");
  writeFileSync(stablePath, stableBytes, { mode: 0o755 });
  const stableEvidence = collectTestD72CompositePinnedFileEvidence({
    expectedSize: stableBytes.length,
    filePath: stablePath,
  });
  assert.equal(
    stableEvidence.digest,
    createHash("sha256").update(stableBytes).digest("hex"),
  );

  const oversizedPath = path.join(pinnedFileTestRoot, "oversized");
  writeFileSync(oversizedPath, Buffer.alloc(9), { mode: 0o755 });
  assert.throws(
    () =>
      collectTestD72CompositePinnedFileEvidence({
        expectedSize: 8,
        filePath: oversizedPath,
      }),
    /archivo regular exacto|tamaño/,
  );

  const symlinkPath = path.join(pinnedFileTestRoot, "symlink");
  symlinkSync(stablePath, symlinkPath);
  assert.throws(
    () =>
      collectTestD72CompositePinnedFileEvidence({
        expectedSize: stableBytes.length,
        filePath: symlinkPath,
      }),
    /archivo regular exacto|descriptor/,
  );

  const swappedPath = path.join(pinnedFileTestRoot, "swapped");
  const replacementPath = path.join(pinnedFileTestRoot, "replacement");
  const oldPath = path.join(pinnedFileTestRoot, "old");
  writeFileSync(swappedPath, Buffer.alloc(128 * 1024, 0x41), { mode: 0o755 });
  writeFileSync(replacementPath, Buffer.alloc(128 * 1024, 0x42), {
    mode: 0o755,
  });
  assert.throws(
    () =>
      collectTestD72CompositePinnedFileEvidence({
        afterHash() {
          renameSync(swappedPath, oldPath);
          renameSync(replacementPath, swappedPath);
        },
        expectedSize: 128 * 1024,
        filePath: swappedPath,
      }),
    /cambió durante su acreditación/,
  );
} finally {
  rmSync(pinnedFileTestRoot, { force: true, recursive: true });
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function contentHash(value) {
  const { contentSha256: _contentSha256, ...payload } = value;
  return createHash("sha256")
    .update(`${JSON.stringify(canonicalize(payload))}\n`)
    .digest("hex");
}

function candidate(overrides = {}) {
  const payload = {
    actIssued: false,
    artifactHash: "b".repeat(64),
    createdAtUtc: "2026-08-31T12:00:00.000Z",
    deploymentAuthorized: false,
    deploymentExecuted: false,
    diffCheckClean: true,
    expiresAtUtc: "2026-08-31T13:00:00.000Z",
    head: "4259ad5fce9d9d9342175366520cdc9189f0a3bc",
    leftCount: 0,
    originMain: "4259ad5fce9d9d9342175366520cdc9189f0a3bc",
    phase: "candidate_identity",
    policyHash: RELEASE_GATE_POLICY_SHA256,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    requestHash: "a".repeat(64),
    rightCount: 0,
    riskAcceptanceRecorded: false,
    schemaVersion: "agorbis-d72-candidate-identity/v1",
    worktreeClean: true,
    ...overrides,
  };
  return Object.freeze({ ...payload, contentSha256: contentHash(payload) });
}

const candidateIdentity = candidate();
const openIdentity = candidate({
  releaseMode: "OPEN_UPDATE",
  openSourceBaselineSha256: openBaselineHash,
});
const openManifest = {
  releaseMode: "OPEN_UPDATE",
  openSourceBaseline: openBaseline,
  openSourceBaselineSha256: openBaselineHash,
};
const openOptions = {
  candidateIdentity: openIdentity,
  artifactManifest: openManifest,
  nowUtc: openNow,
};
assert.doesNotThrow(() =>
  assertD72OpenSourceCompositeSnapshot(sourceSnapshot(), openOptions),
);
assert.throws(() =>
  assertD72OpenSourceCompositeSnapshot(sourceSnapshot(), {
    ...openOptions,
    candidateIdentity,
  }),
);
assert.throws(() =>
  assertD72OpenSourceCompositeSnapshot(sourceSnapshot(), {
    ...openOptions,
    artifactManifest: {
      ...openManifest,
      openSourceBaselineSha256: "f".repeat(64),
    },
  }),
);
const driftedOpenSource = sourceSnapshot();
driftedOpenSource.settings.result.bindings.find(
  ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
).text = "true";
assert.throws(() =>
  assertD72OpenSourceCompositeSnapshot(driftedOpenSource, openOptions),
);
const allPass = Object.fromEntries(
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS.map((gateId) => [
    gateId,
    EVIDENCE_STATUS.PASS,
  ]),
);
const allPassSources = Object.fromEntries(
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS.map((gateId) => [
    gateId,
    Object.fromEntries(
      Object.keys(D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE[gateId]).map(
        (sourceId) => [sourceId, EVIDENCE_STATUS.PASS],
      ),
    ),
  ]),
);
const passingObservations = Object.freeze(
  Object.fromEntries(
    D72_COMPOSITE_OBSERVATION_IDS.map((observationId) => [
      observationId,
      EVIDENCE_STATUS.PASS,
    ]),
  ),
);
assert.deepEqual(deriveD72CompositeGateStatuses(passingObservations), allPass);
assert.deepEqual(
  deriveD72CompositeSourceStatuses(passingObservations),
  allPassSources,
);
const remoteNotVerified = deriveD72CompositeGateStatuses({
  ...passingObservations,
  "remote.cloudflare.secrets": EVIDENCE_STATUS.NOT_VERIFIED,
});
assert.equal(
  remoteNotVerified["cloudflare.secret-inventory-exact"],
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  remoteNotVerified["network.production-dns-integrity"],
  EVIDENCE_STATUS.PASS,
);
const localFailure = deriveD72CompositeGateStatuses({
  ...passingObservations,
  "local.suite": EVIDENCE_STATUS.FAIL,
});
assert.equal(
  localFailure["quality.build-and-test-suite"],
  EVIDENCE_STATUS.FAIL,
);
assert.equal(
  localFailure["cloudflare.secret-inventory-exact"],
  EVIDENCE_STATUS.PASS,
);
assert.equal(localFailure["security.secret-scan"], EVIDENCE_STATUS.PASS);
assert.equal(
  localFailure["legal.pending-external-copy-honest"],
  EVIDENCE_STATUS.FAIL,
);
const secretScanNotVerifiedObservations = {
  ...passingObservations,
  "local.secret-scan": EVIDENCE_STATUS.NOT_VERIFIED,
};
const secretScanNotVerifiedSources = deriveD72CompositeSourceStatuses(
  secretScanNotVerifiedObservations,
);
assert.equal(
  secretScanNotVerifiedSources["quality.build-and-test-suite"][
    "local.secret-tests"
  ],
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  secretScanNotVerifiedSources["quality.build-and-test-suite"]["local.lint"],
  EVIDENCE_STATUS.PASS,
);
assert.equal(
  deriveD72CompositeGateStatuses(secretScanNotVerifiedObservations)[
    "quality.build-and-test-suite"
  ],
  EVIDENCE_STATUS.NOT_VERIFIED,
);
const redactionNotVerifiedSources = deriveD72CompositeSourceStatuses({
  ...passingObservations,
  "evidence.redaction": EVIDENCE_STATUS.NOT_VERIFIED,
});
assert.equal(
  redactionNotVerifiedSources["security.secret-scan"][
    "evidence.redaction-scan"
  ],
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  redactionNotVerifiedSources["security.worker-secrets-confidential"][
    "runner.output-redaction"
  ],
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  redactionNotVerifiedSources["cloudflare.secret-inventory-exact"][
    "cloudflare.worker-secret-metadata"
  ],
  EVIDENCE_STATUS.PASS,
);
const artifactSecretFailureObservations = {
  ...passingObservations,
  "artifact.secret-scan.after": EVIDENCE_STATUS.FAIL,
};
const artifactSecretFailureSources = deriveD72CompositeSourceStatuses(
  artifactSecretFailureObservations,
);
assert.equal(
  artifactSecretFailureSources["security.secret-scan"]["artifact.secret-scan"],
  EVIDENCE_STATUS.FAIL,
);
assert.equal(
  artifactSecretFailureSources["security.secret-scan"][
    "repository.secret-scan"
  ],
  EVIDENCE_STATUS.PASS,
);
assert.equal(
  deriveD72CompositeGateStatuses(artifactSecretFailureObservations)[
    "security.secret-scan"
  ],
  EVIDENCE_STATUS.FAIL,
);
const providerOnlyFailure = deriveD72CompositeGateStatuses({
  ...passingObservations,
  "remote.auth-providers": EVIDENCE_STATUS.FAIL,
});
assert.equal(
  providerOnlyFailure["configuration.auth-providers-aligned"],
  EVIDENCE_STATUS.FAIL,
);
assert.equal(
  Object.entries(providerOnlyFailure).filter(
    ([gateId, status]) =>
      gateId !== "configuration.auth-providers-aligned" &&
      status !== EVIDENCE_STATUS.PASS,
  ).length,
  0,
);
for (const phase of ["before", "after"]) {
  const policyFailure = deriveD72CompositeGateStatuses({
    ...passingObservations,
    [`candidate.auth-providers.${phase}`]: EVIDENCE_STATUS.FAIL,
  });
  assert.equal(
    policyFailure["configuration.auth-providers-aligned"],
    EVIDENCE_STATUS.FAIL,
  );
  const evidenceFailure = deriveD72CompositeSourceStatuses({
    ...passingObservations,
    [`candidate.auth-providers.${phase}`]: EVIDENCE_STATUS.FAIL,
  })["configuration.auth-providers-aligned"];
  assert.equal(
    evidenceFailure["repository.social-auth-consent-snapshot"],
    EVIDENCE_STATUS.FAIL,
  );
  assert.equal(
    evidenceFailure["repository.social-auth-processing-evidence"],
    EVIDENCE_STATUS.FAIL,
  );
}
for (const invalidObservations of [
  { ...passingObservations, unexpected: EVIDENCE_STATUS.PASS },
  {
    ...passingObservations,
    "remote.auth-providers": "RISK_ACCEPTED_BY_OWNER",
  },
  Object.fromEntries(Object.entries(passingObservations).slice(1)),
]) {
  assert.throws(
    () => deriveD72CompositeGateStatuses(invalidObservations),
    /fuentes granulares|estados factuales/,
  );
}
const receipt = issueTestD72NonStatefulCompositeCollectorReceipt({
  candidateIdentity,
  startedAtUtc: "2026-08-31T12:00:01.000Z",
  completedAtUtc: "2026-08-31T12:10:00.000Z",
  sourceStatusesByGate: allPassSources,
});

assert.equal(
  receipt.schemaVersion,
  D72_NON_STATEFUL_COMPOSITE_COLLECTOR_SCHEMA_VERSION,
);
assert.equal(receipt.deploymentAuthorized, false);
assert.equal(receipt.deploymentExecuted, false);
assert.equal(receipt.gates.length, 12);
assert.deepEqual(
  receipt.gates.map(({ gateId }) => gateId),
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS,
);
assert.equal(Object.isFrozen(receipt), true);
assert.equal(Object.isFrozen(receipt.gates), true);
assert.equal(Object.isFrozen(receipt.gates[0].sources), true);
assert.deepEqual(
  receipt.gates[0].sources.map(({ sourceId, status }) => ({
    sourceId,
    status,
  })),
  Object.entries(allPassSources[receipt.gates[0].gateId]).map(
    ([sourceId, status]) => ({ sourceId, status }),
  ),
);
const oneNotVerifiedSource = structuredClone(allPassSources);
oneNotVerifiedSource["security.secret-scan"]["evidence.redaction-scan"] =
  EVIDENCE_STATUS.NOT_VERIFIED;
const notVerifiedReceipt = issueTestD72NonStatefulCompositeCollectorReceipt({
  candidateIdentity,
  startedAtUtc: "2026-08-31T12:00:01.000Z",
  completedAtUtc: "2026-08-31T12:10:00.000Z",
  sourceStatusesByGate: oneNotVerifiedSource,
});
assert.equal(
  notVerifiedReceipt.gates.find(
    ({ gateId }) => gateId === "security.secret-scan",
  ).status,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  notVerifiedReceipt.gates
    .find(({ gateId }) => gateId === "security.secret-scan")
    .sources.find(({ sourceId }) => sourceId === "evidence.redaction-scan")
    .status,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  assertD72NonStatefulCompositeCollectorReceipt(receipt, {
    allowTestReceipt: true,
    candidateIdentity,
    now: new Date("2026-08-31T12:10:00.000Z"),
  }),
  receipt,
);
assert.throws(
  () =>
    assertD72NonStatefulCompositeCollectorReceipt(receipt, {
      candidateIdentity,
      now: new Date("2026-08-31T12:10:00.000Z"),
    }),
  /opaco|emitido/,
);
assert.throws(
  () =>
    assertD72NonStatefulCompositeCollectorReceipt(structuredClone(receipt), {
      allowTestReceipt: true,
      candidateIdentity,
      now: new Date("2026-08-31T12:10:00.000Z"),
    }),
  /opaco/,
);
assert.throws(
  () =>
    assertD72NonStatefulCompositeCollectorReceipt(receipt, {
      allowTestReceipt: true,
      candidateIdentity: candidate(),
      now: new Date("2026-08-31T12:10:00.000Z"),
    }),
  /misma candidate identity/,
);

const collectedCandidate = candidate({
  artifactHash: "e".repeat(64),
  requestHash: "d".repeat(64),
});
const providerFailedObservations = {
  ...passingObservations,
  "remote.auth-providers": EVIDENCE_STATUS.FAIL,
};
const failedReceipt = collectTestD72NonStatefulCompositeReceipt({
  candidateIdentity: collectedCandidate,
  startedAtUtc: "2026-08-31T12:00:01.000Z",
  completedAtUtc: "2026-08-31T12:10:00.000Z",
  observations: providerFailedObservations,
});
assert.equal(
  failedReceipt.gates.find(
    ({ gateId }) => gateId === "configuration.auth-providers-aligned",
  ).status,
  EVIDENCE_STATUS.FAIL,
);
assert.equal(
  failedReceipt.gates
    .filter(({ gateId }) => gateId !== "configuration.auth-providers-aligned")
    .every(({ status }) => status === EVIDENCE_STATUS.PASS),
  true,
);
assert.throws(
  () =>
    collectTestD72NonStatefulCompositeReceipt({
      candidateIdentity: collectedCandidate,
      startedAtUtc: "2026-08-31T12:11:00.000Z",
      completedAtUtc: "2026-08-31T12:12:00.000Z",
      observations: passingObservations,
    }),
  /única corrida|ya consumió/,
);

for (const invalidStatuses of [
  { ...allPassSources, unexpected: {} },
  Object.fromEntries(Object.entries(allPassSources).slice(1)),
  {
    ...allPassSources,
    "security.secret-scan": {
      ...allPassSources["security.secret-scan"],
      "evidence.redaction-scan": "BLOCKED_EXTERNAL",
    },
  },
]) {
  assert.throws(
    () =>
      issueTestD72NonStatefulCompositeCollectorReceipt({
        candidateIdentity,
        startedAtUtc: "2026-08-31T12:00:01.000Z",
        completedAtUtc: "2026-08-31T12:10:00.000Z",
        sourceStatusesByGate: invalidStatuses,
      }),
    /doce gates|sourceId|estados factuales/,
  );
}
assert.throws(
  () =>
    issueTestD72NonStatefulCompositeCollectorReceipt({
      candidateIdentity,
      startedAtUtc: "2026-08-31T11:59:59.999Z",
      completedAtUtc: "2026-08-31T12:10:00.000Z",
      sourceStatusesByGate: allPassSources,
    }),
  /después de candidate identity/,
);
await assert.rejects(
  async () =>
    collectD72NonStatefulCompositeReceipt({
      candidateIdentity,
      gateStatuses: allPass,
    }),
  /no acepta mapas|acepta sólo/,
);
await assert.rejects(
  () =>
    collectD72NonStatefulCompositeReceipt({
      artifactManifest: {},
      artifactRoot: "/tmp/fake-d72-artifact",
      candidateIdentity,
      dnsTokenFile: "/tmp/fake-d72-token",
      fetchImpl: originalFetch,
      repositoryRoot: process.cwd(),
      supabaseReceipt: {},
    }),
  /no acepta mapas|acepta sólo/,
);

assert.deepEqual(
  validateD72AuthProviderSettings(
    Object.fromEntries(
      D72_AUTH_SETTINGS_TOP_LEVEL_KEYS.map((key) => {
        if (key === "external") {
          return [
            key,
            Object.fromEntries(
              D72_AUTH_SETTINGS_EXTERNAL_KEYS.map((provider) => [
                provider,
                ["email", "google"].includes(provider),
              ]),
            ),
          ];
        }
        if (key === "sms_provider") return [key, null];
        return [key, false];
      }),
    ),
  ),
  [],
);
const validSettings = Object.fromEntries(
  D72_AUTH_SETTINGS_TOP_LEVEL_KEYS.map((key) => {
    if (key === "external") {
      return [
        key,
        Object.fromEntries(
          D72_AUTH_SETTINGS_EXTERNAL_KEYS.map((provider) => [
            provider,
            ["email", "google"].includes(provider),
          ]),
        ),
      ];
    }
    if (key === "sms_provider") return [key, "twilio"];
    return [key, false];
  }),
);
assert.deepEqual(
  await readBoundedD72AuthSettings(
    new Response(JSON.stringify(validSettings), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  ),
  validSettings,
);
await assert.rejects(
  () =>
    readBoundedD72AuthSettings(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(600 * 1024));
            controller.enqueue(new Uint8Array(600 * 1024));
            controller.close();
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    ),
  /excedió el límite/,
);
assert.match(
  validateD72AuthProviderSettings({
    ...validSettings,
    external: { ...validSettings.external, google: false },
  }).join("\n"),
  /external\.google=false/,
);
assert.deepEqual(validateD72AuthProviderSettings(validSettings), []);
for (const [provider, enabled] of [
  ["facebook", true],
  ["apple", true],
  ["email", false],
  ["phone", true],
  ["anonymous_users", true],
]) {
  assert.match(
    validateD72AuthProviderSettings({
      ...validSettings,
      external: { ...validSettings.external, [provider]: enabled },
    }).join("\n"),
    new RegExp(`external\\.${provider}=${enabled}`),
  );
}
for (const setting of [
  "passkeys_enabled",
  "saml_enabled",
  "saml_private_key_next_configured",
]) {
  assert.match(
    validateD72AuthProviderSettings({ ...validSettings, [setting]: true }).join(
      "\n",
    ),
    /fuera del objetivo aprobado/,
  );
}
const externalAccessor = { ...validSettings.external };
Object.defineProperty(externalAccessor, "google", {
  enumerable: true,
  get() {
    assert.fail("No debe ejecutar un getter de proveedor.");
  },
});
assert.notDeepEqual(
  validateD72AuthProviderSettings({
    ...validSettings,
    external: externalAccessor,
  }),
  [],
);
const topLevelAccessor = { ...validSettings };
Object.defineProperty(topLevelAccessor, "disable_signup", {
  enumerable: true,
  get() {
    assert.fail("No debe ejecutar un getter de settings.");
  },
});
assert.notDeepEqual(validateD72AuthProviderSettings(topLevelAccessor), []);

// Remote switches alone cannot certify the candidate: local processing evidence
// and the actual versioned consent snapshot remain mandatory and non-waivable.
const candidateConfiguration = readWranglerConfiguration(
  path.resolve("wrangler.jsonc"),
);
const pendingGoogleLocations = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    variable.name.startsWith("PUBLIC_GOOGLE_PROCESSING_LOCATION")
      ? { ...variable, status: "pending", value: "" }
      : variable,
);
const confirmedGoogleLocations = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    variable.name.startsWith("PUBLIC_GOOGLE_PROCESSING_LOCATION")
      ? {
          ...variable,
          status: "confirmed",
          value: variable.name.endsWith("_EN")
            ? "Processing locations described by the contractual scope."
            : "Lugares de tratamiento descritos por el alcance contractual.",
        }
      : variable,
);
// Perfil real (D122, Google encendido): sin evidencia confirmada de
// ubicaciones el candidato no se certifica; con la evidencia del inventario
// público, sí. El flag del candidato tiene que coincidir con el inventario.
assert.equal(candidateConfiguration.vars.PUBLIC_GOOGLE_AUTH_ENABLED, "true");
const pendingCandidate = validateD72CandidateAuthConfiguration(
  candidateConfiguration,
  { variables: pendingGoogleLocations },
).join("\n");
assert.match(
  pendingCandidate,
  /PUBLIC_GOOGLE_PROCESSING_LOCATION requiere evidencia confirmada/,
);
assert.match(
  pendingCandidate,
  /PUBLIC_GOOGLE_PROCESSING_LOCATION_EN requiere evidencia confirmada/,
);
assert.deepEqual(
  validateD72CandidateAuthConfiguration(candidateConfiguration, {
    variables: confirmedGoogleLocations,
  }),
  [],
);
const environmentOf = (variables) =>
  Object.fromEntries(variables.map(({ name, value }) => [name, value]));
// Google apagado a propósito (reversión D122): el candidato tiene que
// coincidir con el inventario; con las ubicaciones pendientes no bloquea
// porque el proveedor no está activo.
const googleOffConfiguration = structuredClone(candidateConfiguration);
googleOffConfiguration.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "false";
const googleOff = (variables) =>
  variables.map((variable) =>
    variable.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
      ? { ...variable, value: "false" }
      : variable,
  );
const pendingOff = googleOff(pendingGoogleLocations);
assert.deepEqual(
  socialProviderEvidenceBlockers(
    googleOffConfiguration,
    environmentOf(pendingOff),
    pendingOff,
  ),
  [],
);
assert.match(
  socialProviderEvidenceBlockers(
    googleOffConfiguration,
    environmentOf(confirmedGoogleLocations),
    confirmedGoogleLocations,
  ).join("\n"),
  /PUBLIC_GOOGLE_AUTH_ENABLED del candidato no coincide/,
);
const unknownCandidate = structuredClone(candidateConfiguration);
unknownCandidate.vars.PUBLIC_FACEBOOK_AUTH_ENABLED = "true";
assert.notDeepEqual(
  validateD72CandidateAuthConfiguration(unknownCandidate),
  [],
);

for (const invalid of [
  null,
  {},
  { external: null },
  { external: {} },
  { external: { google: "false" } },
  { ...validSettings, unexpected: false },
  {
    ...validSettings,
    external: { ...validSettings.external, unknown_provider: false },
  },
]) {
  assert.notDeepEqual(validateD72AuthProviderSettings(invalid), []);
}
const getterSettings = {};
Object.defineProperty(getterSettings, "external", {
  enumerable: true,
  get() {
    assert.fail("El validador no debe ejecutar accessors hostiles.");
  },
});
assert.notDeepEqual(validateD72AuthProviderSettings(getterSettings), []);

console.log("D72 non-stateful composite collector tests: PASS");
