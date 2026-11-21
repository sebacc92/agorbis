#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createExceptionalReleaseAct,
  exceptionalReleaseActContentHash,
  exceptionalReleaseRequestHash,
  renderExceptionalReleaseActMarkdown,
} from "./exceptional-release-act.mjs";
import {
  EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION,
  exceptionalReleaseArtifactHash,
} from "./exceptional-release-artifact.mjs";
import {
  EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY,
} from "./exceptional-wrangler-integrity.mjs";
import {
  EXCEPTIONAL_OPEN_UPDATE_STEP_IDS,
  requiredRiskConfirmationPhrases,
} from "./exceptional-open-release-runner-policy.mjs";
import { createOpenReleaseBaselineCandidate } from "./open-release-baseline-policy.mjs";
import { sourceSnapshot } from "./cloudflare-open-source-smoke-test-fixture.mjs";
import {
  createExceptionalActIssuance,
  exceptionalActIssuanceContentHash,
} from "./exceptional-act-issuance.mjs";
import {
  readExceptionalCutoverConfigurations,
  validateExceptionalCutoverConfigurations,
} from "./exceptional-cutover-config-policy.mjs";
import {
  EXCEPTIONAL_CUTOVER_NODE_VERSION,
  EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
  assertExceptionalCutoverBundle,
  createExceptionalCutoverPlan,
  createExceptionalClosedRecoveryPlan,
  createExceptionalPromotionStep,
  createExceptionalRollbackPlan,
  exceptionalCutoverConfirmationPhrase,
  parseExceptionalCutoverArguments,
  validateExceptionalCutoverBundle,
  validateExceptionalCutoverStep,
} from "./exceptional-release-cutover-policy.mjs";
import {
  EVIDENCE_STATUS,
  GATE_POLICY,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";

const head = "0123456789abcdef0123456789abcdef01234567";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-08-30T12:00:00.000Z");
const requestPath = "/tmp/agorbis-d72.json";
const openVersionId = "11111111-1111-4111-8111-111111111111";
const closedVersionId = "22222222-2222-4222-8222-222222222222";
const fakeFileHash = "a".repeat(64);
const emptyHash = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
const wranglerCli = "/repo/node_modules/wrangler/wrangler-dist/cli.js";
const emptyEnv = "/evidence/artifact/exceptional-release-empty.env";
// Golden vector for this synthetic act bound to release policy v6 (D106) y a la
// policy de integridad de Wrangler re-baselineada el 2026-11-19 (lockHash
// 4b92469b…, closureHash e44e24b5…, Wrangler 4.160.1; ver el runbook). El digest
// incluye EXCEPTIONAL_CUTOVER_ACCOUNT_ID: al pasar a la cuenta SEBA (D92) los
// tres vectores se recalcularon con la misma política y el mismo acto sintético.
const uploadMessage =
  "agorbis-d72:upload:v1:fc761051b2d02a4d3707c366b6d3b84d98d47a1de82afb60d1349c7073d5a8d3";
const openMessage =
  "agorbis-d72:open:v1:33b8371ad146077af61c857efd4c8836727c71ffbb3be4172206866520dcc845";
const closedMessage =
  "agorbis-d72:closed:v1:c5fb4c13759c208165a85d1b6ed9ebff7d7cc5639c735ae1b51a9a9ee6e97e51";

function riskFor(gateId) {
  const definition = getReleaseGateDefinition(gateId);
  return {
    gateId,
    evidenceStatus: definition.evidenceStatus,
    rawResult: definition.rawResult,
    requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
    acceptedConsequence: definition.consequence,
    reviewRequiredBy: definition.reviewRequiredBy,
  };
}

const request = {
  schemaVersion: "agorbis-exceptional-release-request/v1",
  policyVersion: RELEASE_GATE_POLICY_VERSION,
  policyHash: RELEASE_GATE_POLICY_SHA256,
  head,
  owner: "Sebastian Cardoso Castillo",
  timestampUtc: "2026-08-30T11:30:00.000Z",
  deploymentAuthorized: false,
  risks: OWNER_WAIVER_CANDIDATE_GATE_IDS.map(riskFor),
};
const requestHash = exceptionalReleaseRequestHash(request);
const artifactPayload = {
  schemaVersion: EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  head,
  policyVersion: RELEASE_GATE_POLICY_VERSION,
  policyHash: RELEASE_GATE_POLICY_SHA256,
  requestHash,
  createdAtUtc: "2026-08-30T11:59:00.000Z",
  nodeVersion: EXCEPTIONAL_CUTOVER_NODE_VERSION,
  wranglerVersion: EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
  wranglerLockHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash,
  wranglerClosureHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
  wranglerEntrypointHash: EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  files: [
    { path: "dist/_worker.js", size: 1, sha256: fakeFileHash },
    {
      path: "exceptional-release-empty.env",
      size: 0,
      sha256: emptyHash,
    },
    { path: "server/entry.js", size: 1, sha256: fakeFileHash },
    { path: "wrangler.crons-closed.jsonc", size: 1, sha256: fakeFileHash },
    { path: "wrangler.crons-open.jsonc", size: 1, sha256: fakeFileHash },
    { path: "wrangler.jsonc", size: 1, sha256: fakeFileHash },
    { path: "wrangler.traffic.jsonc", size: 1, sha256: fakeFileHash },
  ],
};
const artifactManifest = {
  ...artifactPayload,
  contentSha256: exceptionalReleaseArtifactHash(artifactPayload),
};
const gateResults = RELEASE_GATE_POLICY.gates.map((definition) => ({
  gateId: definition.id,
  evidenceStatus:
    definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE
      ? EVIDENCE_STATUS.PASS
      : definition.evidenceStatus,
  rawResult:
    definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE
      ? RAW_RESULT.PASS
      : RAW_RESULT.FAIL,
}));
const confirmations = request.risks.map(({ gateId }) => ({
  gateId,
  source: "/dev/tty",
  statements: requiredRiskConfirmationPhrases(gateId, head),
}));
const commands = [
  "local-phase-k-gates",
  "cloudflare-closed-state-read",
  "production-closed-smoke-read",
  "exceptional-build-preflight",
  "wrangler-version-dry-run",
  "wrangler-crons-dry-run",
].map((label) => ({ label, exitCode: 0 }));
const act = createExceptionalReleaseAct({
  request,
  currentHead: head,
  artifactHash: artifactManifest.contentSha256,
  gateResults,
  confirmations,
  commands,
  now,
});
const issuance = createExceptionalActIssuance({
  request,
  act,
  artifactManifest,
});
const validBundle = {
  request,
  act,
  artifactManifest,
  issuance,
  expectedActHash: act.contentSha256,
  currentHead: head,
  now: new Date("2026-08-30T12:59:59.999Z"),
  nodeVersion: EXCEPTIONAL_CUTOVER_NODE_VERSION,
  wranglerVersion: EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
  claimExists: false,
};

const versionedConfigurations = readExceptionalCutoverConfigurations(root);
assert.deepEqual(
  validateExceptionalCutoverConfigurations(versionedConfigurations),
  [],
);
assert.match(
  validateExceptionalCutoverConfigurations({
    ...versionedConfigurations,
    open: { ...versionedConfigurations.open, workers_dev: true },
  }).join("\n"),
  /wrangler\.crons-open\.jsonc/,
);

assert.deepEqual(
  parseExceptionalCutoverArguments([
    "--request",
    requestPath,
    "--act-hash",
    act.contentSha256,
  ]),
  { requestPath, expectedActHash: act.contentSha256 },
);
for (const argv of [
  [],
  ["--request"],
  ["--act", requestPath],
  ["--request", "relative.json"],
  ["--request", requestPath],
  ["--request", requestPath, "--act-hash", "bad"],
  ["--request", requestPath, "--act-hash", act.contentSha256, "extra"],
]) {
  assert.throws(() => parseExceptionalCutoverArguments(argv), /--request/);
}
assert.equal(
  exceptionalCutoverConfirmationPhrase(head, act.contentSha256),
  `AUTORIZO DEPLOY OPEN DE AGORBIS PARA ${head} CON ACTA ${act.contentSha256}`,
);
assert.deepEqual(validateExceptionalCutoverBundle(validBundle), []);
assert.doesNotThrow(() => assertExceptionalCutoverBundle(validBundle));

for (const [overrides, pattern] of [
  [{ claimExists: true }, /consumida/],
  [{ currentHead: "f".repeat(40) }, /HEAD|request|acta/i],
  [{ now: new Date(act.expiresAtUtc) }, /vencida/],
  [{ nodeVersion: "24.0.0" }, /Node 22\.22\.0/],
  [{ wranglerVersion: "4.127.1" }, /Wrangler 4\.160\.1/],
]) {
  assert.match(
    validateExceptionalCutoverBundle({ ...validBundle, ...overrides }).join(
      "\n",
    ),
    pattern,
  );
}
const resealedArtifact = structuredClone(artifactManifest);
resealedArtifact.files[0].sha256 = "c".repeat(64);
resealedArtifact.contentSha256 =
  exceptionalReleaseArtifactHash(resealedArtifact);
assert.match(
  validateExceptionalCutoverBundle({
    ...validBundle,
    artifactManifest: resealedArtifact,
  }).join("\n"),
  /artifactHash externo|artifact hash/i,
);
const wrongActHash = structuredClone(act);
wrongActHash.contentSha256 = "d".repeat(64);
assert.notDeepEqual(
  validateExceptionalCutoverBundle({ ...validBundle, act: wrongActHash }),
  [],
);

function resealActAndIssuance(mutatedAct) {
  mutatedAct.contentSha256 = exceptionalReleaseActContentHash(mutatedAct);
  const mutatedIssuance = structuredClone(issuance);
  mutatedIssuance.actHash = mutatedAct.contentSha256;
  try {
    mutatedIssuance.actMarkdownSha256 = createHash("sha256")
      .update(renderExceptionalReleaseActMarkdown(mutatedAct))
      .digest("hex");
  } catch {
    mutatedIssuance.actMarkdownSha256 = "0".repeat(64);
  }
  mutatedIssuance.issuedAtUtc = mutatedAct.timestampUtc;
  mutatedIssuance.expiresAtUtc = mutatedAct.expiresAtUtc;
  mutatedIssuance.contentSha256 =
    exceptionalActIssuanceContentHash(mutatedIssuance);
  return { mutatedAct, mutatedIssuance };
}

const nonWaivableAct = structuredClone(act);
const nonWaivableGate = nonWaivableAct.gates.find(
  ({ gatePolicy }) => gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE,
);
nonWaivableGate.evidenceStatus = EVIDENCE_STATUS.NOT_VERIFIED;
nonWaivableGate.rawResult = RAW_RESULT.FAIL;
nonWaivableGate.releaseDisposition = RELEASE_DISPOSITION.STOP;
const resealedNonWaivable = resealActAndIssuance(nonWaivableAct);
assert.match(
  validateExceptionalCutoverBundle({
    ...validBundle,
    act: resealedNonWaivable.mutatedAct,
    issuance: resealedNonWaivable.mutatedIssuance,
    expectedActHash: resealedNonWaivable.mutatedAct.contentSha256,
  }).join("\n"),
  /non-waivable|NON_WAIVABLE|PASS técnico/u,
);

const changedRiskAct = structuredClone(act);
const changedRisk = changedRiskAct.gates.find(
  ({ gateId }) => gateId === request.risks[0].gateId,
);
changedRisk.evidenceStatus =
  request.risks[0].evidenceStatus === EVIDENCE_STATUS.NOT_VERIFIED
    ? EVIDENCE_STATUS.BLOCKED_EXTERNAL
    : EVIDENCE_STATUS.NOT_VERIFIED;
changedRisk.rawResult = RAW_RESULT.FAIL;
const resealedRisk = resealActAndIssuance(changedRiskAct);
assert.match(
  validateExceptionalCutoverBundle({
    ...validBundle,
    act: resealedRisk.mutatedAct,
    issuance: resealedRisk.mutatedIssuance,
    expectedActHash: resealedRisk.mutatedAct.contentSha256,
  }).join("\n"),
  new RegExp(request.risks[0].gateId.replaceAll(".", "\\.")),
);

const commonPlan = {
  repositoryRoot: "/repo",
  artifactRoot: "/evidence/artifact",
  stateRoot: "/state/cutover",
  nodeExecutable: "/opt/node/bin/node",
  head,
  act,
  artifactManifest,
};
const cutoverPlan = createExceptionalCutoverPlan(commonPlan);
// Synthetic OPEN_UPDATE authority tests the plan only. No certificate, command,
// upload or production observation is issued by this fixture.
const openBaseline = createOpenReleaseBaselineCandidate({
  snapshot: sourceSnapshot(),
  observedAtUtc: "2026-08-30T11:25:00.000Z",
  expiresAtUtc: "2026-08-30T12:25:00.000Z",
  nowUtc: now.toISOString(),
});
const openRequest = {
  ...request,
  schemaVersion: "agorbis-exceptional-release-request/v2",
  releaseMode: "OPEN_UPDATE",
  openSourceBaseline: openBaseline.baseline,
  openSourceBaselineSha256: openBaseline.baselineSha256,
};
const openArtifactPayload = {
  ...artifactPayload,
  schemaVersion: EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION,
  requestHash: exceptionalReleaseRequestHash(openRequest),
  releaseMode: "OPEN_UPDATE",
  artifactPurpose: "primary",
  recoveryArtifactHash: "b".repeat(64),
  openSourceBaseline: openBaseline.baseline,
  openSourceBaselineSha256: openBaseline.baselineSha256,
};
const openArtifactManifest = {
  ...openArtifactPayload,
  contentSha256: exceptionalReleaseArtifactHash(openArtifactPayload),
};
const openAct = createExceptionalReleaseAct({
  request: openRequest,
  currentHead: head,
  artifactHash: openArtifactManifest.contentSha256,
  openUpdateEvidenceHash: "c".repeat(64),
  gateResults,
  confirmations,
  commands: EXCEPTIONAL_OPEN_UPDATE_STEP_IDS.map((label) => ({
    label,
    exitCode: 0,
  })),
  now,
});
const openCutoverPlan = createExceptionalCutoverPlan({
  ...commonPlan,
  act: openAct,
  artifactManifest: openArtifactManifest,
});
assert.deepEqual(
  openCutoverPlan.map(({ id }) => id),
  ["upload-open-version"],
);
assert.equal(
  openCutoverPlan.some(({ arguments: argv }) => argv.includes("triggers")),
  false,
);
assert.ok(openCutoverPlan[0].arguments.includes("upload"));
assert.equal(openCutoverPlan[0].arguments.includes("deploy"), false);
assert.deepEqual(cutoverPlan, [
  {
    id: "upload-open-version",
    command: "/opt/node/bin/node",
    arguments: [
      wranglerCli,
      "versions",
      "upload",
      "--config",
      "/evidence/artifact/wrangler.jsonc",
      "--cwd",
      "/evidence/artifact",
      "--env-file",
      emptyEnv,
      "--name",
      "agorbis",
      "--strict",
      "--tag",
      head,
      "--message",
      uploadMessage,
    ],
    shell: false,
  },
  {
    id: "install-open-crons",
    command: "/opt/node/bin/node",
    arguments: [
      wranglerCli,
      "triggers",
      "deploy",
      "--config",
      "/evidence/artifact/wrangler.crons-open.jsonc",
      "--cwd",
      "/evidence/artifact",
      "--env-file",
      emptyEnv,
      "--name",
      "agorbis",
    ],
    shell: false,
  },
]);
for (const step of cutoverPlan) {
  assert.deepEqual(
    validateExceptionalCutoverStep(step, { expectedStep: step }),
    [],
  );
  assert.ok(Object.isFrozen(step));
  assert.ok(Object.isFrozen(step.arguments));
}
const promotion = createExceptionalPromotionStep({
  ...commonPlan,
  openVersionId,
});
assert.deepEqual(promotion, {
  id: "promote-open-version-100",
  command: "/opt/node/bin/node",
  arguments: [
    wranglerCli,
    "versions",
    "deploy",
    `${openVersionId}@100%`,
    "--config",
    "/evidence/artifact/wrangler.traffic.jsonc",
    "--cwd",
    "/evidence/artifact",
    "--env-file",
    emptyEnv,
    "--name",
    "agorbis",
    "--message",
    openMessage,
    "--yes",
  ],
  shell: false,
});
const rollback = createExceptionalRollbackPlan({
  ...commonPlan,
  closedVersionId,
});
assert.deepEqual(rollback, [
  {
    id: "restore-closed-version-100",
    command: "/opt/node/bin/node",
    arguments: [
      wranglerCli,
      "versions",
      "deploy",
      `${closedVersionId}@100%`,
      "--config",
      "/evidence/artifact/wrangler.traffic.jsonc",
      "--cwd",
      "/evidence/artifact",
      "--env-file",
      emptyEnv,
      "--name",
      "agorbis",
      "--message",
      closedMessage,
      "--yes",
    ],
    shell: false,
  },
  {
    id: "remove-open-crons",
    command: "/opt/node/bin/node",
    arguments: [
      wranglerCli,
      "triggers",
      "deploy",
      "--config",
      "/evidence/artifact/wrangler.crons-closed.jsonc",
      "--cwd",
      "/evidence/artifact",
      "--env-file",
      emptyEnv,
      "--name",
      "agorbis",
    ],
    shell: false,
  },
]);

const recoveryCapsuleRoot = "/state/cutover/closed-capsule";
const recoveryPlan = createExceptionalClosedRecoveryPlan({
  repositoryRoot: "/repo",
  capsuleRoot: recoveryCapsuleRoot,
  stateRoot: "/state/cutover",
  nodeExecutable: "/opt/node/bin/node",
  capsuleManifest: {
    accountId: "4d78fb10c1ae65281ec851479d5045dc",
    workerName: "agorbis",
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head,
    requestHash,
    actHash: act.contentSha256,
    artifactHash: artifactManifest.contentSha256,
    closedVersionId,
  },
});
const recoveryEmptyEnv = `${recoveryCapsuleRoot}/exceptional-release-empty.env`;
assert.deepEqual(recoveryPlan, [
  {
    id: "recover-closed-version-100",
    command: "/opt/node/bin/node",
    arguments: [
      wranglerCli,
      "versions",
      "deploy",
      `${closedVersionId}@100%`,
      "--config",
      `${recoveryCapsuleRoot}/wrangler.traffic.jsonc`,
      "--cwd",
      recoveryCapsuleRoot,
      "--env-file",
      recoveryEmptyEnv,
      "--name",
      "agorbis",
      "--message",
      closedMessage,
      "--yes",
    ],
    shell: false,
  },
  {
    id: "recover-zero-crons",
    command: "/opt/node/bin/node",
    arguments: [
      wranglerCli,
      "triggers",
      "deploy",
      "--config",
      `${recoveryCapsuleRoot}/wrangler.crons-closed.jsonc`,
      "--cwd",
      recoveryCapsuleRoot,
      "--env-file",
      recoveryEmptyEnv,
      "--name",
      "agorbis",
    ],
    shell: false,
  },
]);
for (const step of recoveryPlan) {
  assert.equal(step.arguments.includes("upload"), false);
  assert.equal(step.arguments.includes("open"), false);
  assert.equal(step.arguments.includes("delete"), false);
}

for (const mutation of [
  { ...promotion, arguments: [...promotion.arguments, "--routes", "evil"] },
  {
    ...promotion,
    arguments: [promotion.arguments[0], "delete", "--name", "agorbis"],
  },
  { ...promotion, id: "upload-open-version" },
]) {
  assert.notDeepEqual(
    validateExceptionalCutoverStep(mutation, { expectedStep: promotion }),
    [],
  );
}
assert.throws(
  () =>
    createExceptionalPromotionStep({
      ...commonPlan,
      openVersionId: "not-a-version",
    }),
  /Version ID/,
);
assert.throws(
  () =>
    createExceptionalCutoverPlan({
      ...commonPlan,
      act: { ...act, contentSha256: "e".repeat(64) },
    }),
  /contexto|act/i,
);

console.log("Exceptional release cutover policy tests: PASS");
