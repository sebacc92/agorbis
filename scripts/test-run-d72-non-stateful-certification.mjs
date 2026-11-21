#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  D72_CANDIDATE_IDENTITY_DISPOSITION,
  assertD72CandidateAuthorityGitReceiptAtIssuance,
  createD72CandidateIdentity,
} from "./d72-non-waivable-evidence-policy.mjs";
import {
  assertIssuedD72GitCurrentStateReceipt,
  collectD72GitCurrentState,
} from "./d72-git-current-state.mjs";
import {
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS,
  D72_COMPOSITE_PINNED_PNPM_EXECUTABLE,
  collectTestD72CompositePinnedToolEvidence,
  validateD72CompositePinnedToolEvidence,
} from "./d72-non-stateful-composite-collector.mjs";
import { D72_SUPABASE_GATE_IDS } from "./d72-supabase-readonly-policy.mjs";
import { NON_STATEFUL_GATE_IDS } from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EVIDENCE_STATUS,
  RAW_RESULT,
  RELEASE_GATE_POLICY_SHA256,
} from "./release-gate-policy.mjs";
import {
  D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
  createD72CandidateBuildInvocationTestHarness,
  createD72ExceptionalRequestFileTestHarness,
  runD72NonStatefulCertificationTestHarness,
} from "./run-d72-non-stateful-certification.mjs";

assert.equal(process.versions.node, "22.22.0");

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const HEAD = "1234567890abcdef1234567890abcdef12345678";
const REQUEST_HASH = "a".repeat(64);
const ARTIFACT_HASH = "b".repeat(64);
const CLOSED_DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";
const CLOSED_VERSION_ID = "22222222-2222-4222-8222-222222222222";

const pinnedToolEvidence = collectTestD72CompositePinnedToolEvidence();
for (const mutate of [
  (evidence) => {
    delete evidence.files.pnpm;
  },
  (evidence) => {
    evidence.packageManager = "pnpm@11.15.1";
  },
  (evidence) => {
    evidence.files.pnpm.path = "/tmp/unexpected-pnpm";
    evidence.files.pnpm.realpath = "/tmp/unexpected-pnpm";
  },
]) {
  const mutated = structuredClone(pinnedToolEvidence);
  mutate(mutated);
  assert.notDeepEqual(validateD72CompositePinnedToolEvidence(mutated), []);
}

const originalPath = process.env.PATH;
try {
  process.env.PATH = "/tmp/agorbis-malicious-wrapper";
  // La aprobación del snapshot permite preparar la invocación candidata; este
  // harness sólo la inspecciona y no ejecuta un build ni autoriza un deploy.
  const invocation = createD72CandidateBuildInvocationTestHarness({
    testOnly: true,
    repositoryRoot: REPOSITORY_ROOT,
    requestPath: "/tmp/agorbis-d72-candidate-request.json",
  });
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.arguments, [
    path.join(REPOSITORY_ROOT, "scripts", "cloudflare-build.mjs"),
    "--d72-candidate-request",
    "/tmp/agorbis-d72-candidate-request.json",
  ]);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.env.PUBLIC_GOOGLE_AUTH_ENABLED, "true");
  assert.equal(invocation.options.env.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
  assert.equal(
    invocation.options.env.PATH,
    `${path.dirname(D72_COMPOSITE_PINNED_PNPM_EXECUTABLE)}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
  );
  assert.doesNotMatch(invocation.options.env.PATH, /malicious-wrapper/);
  const recovery = createD72CandidateBuildInvocationTestHarness({
    testOnly: true,
    repositoryRoot: REPOSITORY_ROOT,
    requestPath: "/tmp/agorbis-d72-candidate-request.json",
    artifactPurpose: "recovery",
  });
  assert.equal(recovery.arguments[1], "--open-recovery-request");
  assert.equal(recovery.options.env.PUBLIC_GOOGLE_AUTH_ENABLED, "false");
  assert.equal(recovery.options.env.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
} finally {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
}

function gateResults(blockQualitySmoke) {
  return NON_STATEFUL_GATE_IDS.map((gateId) => {
    const blocked = blockQualitySmoke && gateId === "quality.production-smoke";
    return {
      gateId,
      evidenceStatus: blocked
        ? EVIDENCE_STATUS.NOT_VERIFIED
        : EVIDENCE_STATUS.PASS,
      rawResult: blocked ? RAW_RESULT.FAIL : RAW_RESULT.PASS,
      sourceEvidence: [],
    };
  });
}

function fixtureDependencies({
  openUpdate = false,
  authorizationFailure = null,
  blockQualitySmoke = true,
  failBuild = false,
  failPreGit = false,
  failPreUploadGit = false,
  failSessionAssertion = false,
  failOpenConsentCleanup = false,
  compositeBlocked = false,
  preproofStatus = EVIDENCE_STATUS.PASS,
  staticAssetsReady = true,
  supabaseBlocked = false,
}) {
  const order = [];
  const emitted = [];
  let gitReads = 0;
  const artifact = {
    artifactHash: ARTIFACT_HASH,
    artifactRoot: "/test-only/candidate.artifact",
    manifest: {
      fixture: "artifact-manifest",
      ...(openUpdate ? { recoveryArtifactHash: "f".repeat(64) } : {}),
    },
  };
  const recoveryArtifact = {
    artifactHash: "f".repeat(64),
    artifactRoot: "/test-only/candidate.recovery.artifact",
    manifest: { fixture: "recovery-artifact-manifest" },
  };
  const closedNoWriteProofReceipt = {
    fixture: "closed-no-write-proof",
  };
  const closedNoWritePreproof = {
    status: preproofStatus,
    reasonCode:
      preproofStatus === EVIDENCE_STATUS.PASS
        ? "PASS"
        : "REMOTE_STATE_NOT_VERIFIED",
    activeDeploymentId: CLOSED_DEPLOYMENT_ID,
    activeVersionId: CLOSED_VERSION_ID,
  };
  const candidateIdentity = {
    ...(openUpdate
      ? { releaseMode: "OPEN_UPDATE", openSourceBaselineSha256: "e".repeat(64) }
      : {}),
    schemaVersion: "fixture-candidate",
    phase: "candidate_identity",
    head: HEAD,
    originMain: HEAD,
    leftCount: 0,
    rightCount: 0,
    worktreeClean: true,
    diffCheckClean: true,
    policyVersion: "fixture-policy",
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash: REQUEST_HASH,
    artifactHash: ARTIFACT_HASH,
    createdAtUtc: "2026-08-31T12:00:00.000Z",
    expiresAtUtc: "2026-08-31T13:00:00.000Z",
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
    contentSha256: "c".repeat(64),
  };
  const gates = gateResults(blockQualitySmoke);
  const certification = {
    ...(openUpdate
      ? { releaseMode: "OPEN_UPDATE", openSourceBaselineSha256: "e".repeat(64) }
      : {}),
    schemaVersion: "fixture-certification",
    phase: "evidence_certification",
    head: HEAD,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash: REQUEST_HASH,
    artifactHash: ARTIFACT_HASH,
    candidateIdentityDisposition: blockQualitySmoke
      ? D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED
      : D72_CANDIDATE_IDENTITY_DISPOSITION.CERTIFIED,
    canaryPreparationAllowed: !blockQualitySmoke,
    gates,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
    contentSha256: "d".repeat(64),
  };
  const versionCertification = {
    candidateVersionId: "33333333-3333-4333-8333-333333333333",
    fixture: "version-certification",
  };
  const canaryRunner = {
    readAuthorization({ kind }) {
      order.push(`read-authorization:${kind}`);
      if (authorizationFailure === kind) {
        throw new Error(`fixture invalid ${kind} authorization`);
      }
      return { fixture: `${kind}-authorization-token` };
    },
    async uploadVersion() {
      order.push("upload-version");
      return { fixture: "upload-receipt" };
    },
    async certifyVersion(options) {
      const recovery = options.uploadPlanOptions.artifactPurpose === "recovery";
      order.push(recovery ? "certify-recovery-version" : "certify-version");
      return recovery
        ? {
            ...versionCertification,
            artifactPurpose: "recovery",
            candidateVersionId: "44444444-4444-4444-8444-444444444444",
          }
        : versionCertification;
    },
    exportRecoveryUploadEvidence(certification) {
      order.push("export-recovery-upload-evidence");
      assert.equal(certification.artifactPurpose, "recovery");
      return { fixture: "opaque-recovery-upload" };
    },
    inspectCapabilityReadiness() {
      order.push("inspect-capability-readiness");
      return {
        ready: staticAssetsReady,
        blocker: staticAssetsReady
          ? null
          : "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE",
        remoteArtifactProofHash: "4".repeat(64),
      };
    },
    async issueCapability() {
      order.push("issue-capability");
      return { fixture: "capability-grant" };
    },
    async attachAtZero() {
      order.push("attach-at-zero");
      return {
        fixture: "canary-session",
        attachedDeploymentId: "55555555-5555-4555-8555-555555555555",
      };
    },
    async assertCanarySessionStillAttached() {
      order.push("assert-attached");
      if (failSessionAssertion) {
        throw new Error("fixture attached state changed");
      }
    },
    async cleanupCanarySession() {
      order.push("cleanup");
      return {
        cleanupVerified: true,
        closedDeploymentId: CLOSED_DEPLOYMENT_ID,
        closedVersionId: CLOSED_VERSION_ID,
        ...(openUpdate
          ? { cleanupDeploymentId: "66666666-6666-4666-8666-666666666666" }
          : {}),
      };
    },
    async recoverOpenCanarySession() {
      order.push("recover-open-emergency");
      return {
        recoveryVerified: true,
        recoveryVersionId: "44444444-4444-4444-8444-444444444444",
        recoveryDeploymentId: "77777777-7777-4777-8777-777777777777",
        canarySucceeded: false,
      };
    },
  };
  return {
    emitted,
    order,
    dependencies: {
      now() {
        return new Date("2026-08-31T12:05:00.000Z");
      },
      async collectGit() {
        const label =
          [
            "pre-git",
            "post-build-git",
            "post-identity-git",
            "pre-smoke-git",
            "pre-upload-git",
          ][gitReads++] ?? "unexpected-git";
        order.push(label);
        if (label === "pre-upload-git" && failPreUploadGit) {
          return { head: "f".repeat(40) };
        }
        if (failPreGit) throw new Error("fixture git mismatch");
        return { head: HEAD };
      },
      async createRequest() {
        order.push("create-request");
        return openUpdate
          ? {
              fixture: "request",
              releaseMode: "OPEN_UPDATE",
              openSourceBaselineSha256: "e".repeat(64),
              openSourceBaseline: {
                fixture: "baseline",
                expiresAtUtc: "2026-08-31T13:00:00.000Z",
              },
            }
          : { fixture: "request" };
      },
      async buildCandidate(options) {
        order.push(
          options.artifactPurpose === "recovery"
            ? "build-recovery"
            : "build-candidate",
        );
        if (failBuild) throw new Error("fixture build failed");
      },
      async freezeArtifact(options) {
        const recovery = options.artifactPurpose === "recovery";
        order.push(recovery ? "freeze-recovery" : "freeze-artifact");
        return recovery ? recoveryArtifact : artifact;
      },
      async createCandidateIdentity() {
        order.push("create-identity");
        return candidateIdentity;
      },
      async runSupabaseReadonly() {
        order.push("supabase");
        return { fixture: "supabase" };
      },
      inspectSupabaseCheckpoint() {
        order.push("inspect-supabase");
        const gates = D72_SUPABASE_GATE_IDS.map((gateId, index) => ({
          gateId,
          status:
            supabaseBlocked && index === 0
              ? EVIDENCE_STATUS.NOT_VERIFIED
              : EVIDENCE_STATUS.PASS,
        }));
        return {
          allowed: !supabaseBlocked,
          gates,
        };
      },
      async prepareClosedNoWriteProof(options) {
        order.push("closed-no-write-preproof");
        assert.equal(options.candidateIdentity, candidateIdentity);
        assert.equal(options.artifactManifest, artifact.manifest);
        assert.equal(options.artifactRoot, artifact.artifactRoot);
        assert.equal(options.worktreeRoot, "/test-only/repository");
        return closedNoWritePreproof;
      },
      async runClosedSmoke() {
        order.push("closed-smoke");
        return {
          activeDeploymentId: CLOSED_DEPLOYMENT_ID,
          activeVersionId: CLOSED_VERSION_ID,
        };
      },
      ...(openUpdate
        ? {
            async collectRecoveryCompatibility(options) {
              order.push("collect-recovery-compatibility");
              assert.equal(options.recoveryArtifact, recoveryArtifact);
              return { fixture: "opaque-compatibility" };
            },
            async createRecoveryCapsule(options) {
              order.push("create-recovery-capsule");
              assert.equal(
                options.compatibilityReceipt.fixture,
                "opaque-compatibility",
              );
              assert.equal(
                options.recoveryUploadEvidence.fixture,
                "opaque-recovery-upload",
              );
              return {
                recoveryRoot: "/test-only/recovery",
                recoveryCapsuleManifest: { fixture: "capsule" },
                recoveryExpectedBindings: { fixture: "capsule-bindings" },
              };
            },
            createStatefulManifest(options) {
              order.push("create-stateful-manifest");
              assert.ok(options.canaryCapabilityGrant);
              assert.ok(!Object.hasOwn(options, "existingSecret"));
              return {
                head: HEAD,
                canaryId: options.canaryId,
                canaryVersionId: options.canaryVersionId,
                contentSha256: "7".repeat(64),
                expiresAtUtc: "2026-08-31T12:25:00.000Z",
              };
            },
            async captureGoogle(options) {
              order.push("capture-google");
              assert.ok(options.statefulAuthorizationToken);
              assert.equal(
                options.bindings.canaryVersionId,
                versionCertification.candidateVersionId,
              );
              return { fixture: "opaque-google-capture" };
            },
            createConsentCleanupEvidence(capture, bindings) {
              order.push("verify-consent-cleanup");
              assert.equal(capture.fixture, "opaque-google-capture");
              assert.equal(
                bindings.attachedDeploymentId,
                "55555555-5555-4555-8555-555555555555",
              );
              if (failOpenConsentCleanup)
                throw new Error("fixture consent cleanup incomplete");
              return { fixture: "opaque-consent-cleanup" };
            },
            async createOpenCaptureDiagnostic(options) {
              order.push("create-open-capture-diagnostic");
              assert.equal(
                options.captureReceipt.fixture,
                "opaque-google-capture",
              );
              return {
                promotionAllowed: false,
                statefulReport: {
                  evidence: [
                    { checkId: "auth.google-oauth", status: "NOT_VERIFIED" },
                  ],
                },
              };
            },
            async runOpenSourceSmoke(options) {
              order.push("open-source-smoke");
              assert.equal(options.expectedBaselineSha256, "e".repeat(64));
              return {
                activeDeploymentId: CLOSED_DEPLOYMENT_ID,
                activeVersionId: CLOSED_VERSION_ID,
              };
            },
            async createOpenDiagnostic(options) {
              order.push("create-open-diagnostic");
              assert.equal(options.artifactManifest, artifact.manifest);
              assert.equal(options.nonStatefulCertification, certification);
              return {
                nonWaivableEvidenceReceipt: {
                  gates: [
                    ...gates,
                    {
                      gateId: "auth.google-fixture",
                      evidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
                    },
                  ],
                },
                promotionAllowed: false,
              };
            },
            async writeOpenDiagnostic(options) {
              order.push("write-open-diagnostic");
              assert.equal(options.certificate.promotionAllowed, false);
              return {
                path: "/test-only/open-request.open-update-diagnostic.json",
                contentSha256: "9".repeat(64),
              };
            },
          }
        : {}),
      async completeClosedNoWriteProof(options) {
        order.push("closed-no-write-proof");
        assert.equal(options.preproof, closedNoWritePreproof);
        assert.equal(options.candidateIdentity, candidateIdentity);
        assert.equal(options.artifactManifest, artifact.manifest);
        assert.equal(options.artifactRoot, artifact.artifactRoot);
        assert.equal(options.worktreeRoot, "/test-only/repository");
        assert.equal(
          options.closedProductionSmokeReceipt.activeVersionId,
          CLOSED_VERSION_ID,
        );
        return closedNoWriteProofReceipt;
      },
      async collectComposite() {
        order.push("composite");
        return { fixture: "composite" };
      },
      inspectPreSmokeEvidence() {
        order.push("inspect-pre-smoke");
        const blockedGateId = D72_COMPOSITE_NON_STATEFUL_GATE_IDS[0];
        const gates = NON_STATEFUL_GATE_IDS.filter(
          (gateId) => gateId !== "quality.production-smoke",
        ).map((gateId) => ({
          gateId,
          status:
            compositeBlocked && gateId === blockedGateId
              ? EVIDENCE_STATUS.NOT_VERIFIED
              : EVIDENCE_STATUS.PASS,
        }));
        return {
          allowed: !compositeBlocked,
          blockers: compositeBlocked ? [blockedGateId] : [],
          gates,
        };
      },
      async issueCollectorBundle(options) {
        order.push("bundle");
        if (openUpdate) {
          assert.ok(options.openSourceProductionSmokeReceipt);
          assert.ok(!Object.hasOwn(options, "closedProductionSmokeReceipt"));
          assert.ok(!Object.hasOwn(options, "closedNoWritePreproof"));
          return { fixture: "open-bundle" };
        }
        assert.equal(options.closedNoWritePreproof, closedNoWritePreproof);
        assert.equal(
          options.closedNoWriteProofReceipt,
          closedNoWriteProofReceipt,
        );
        return { fixture: "bundle" };
      },
      async createCertification() {
        order.push("certification");
        return certification;
      },
      async assertCanaryAllowed() {
        order.push("assert-allowed");
      },
      async createUploadPreview(options) {
        order.push(
          options.artifactPurpose === "recovery"
            ? "recovery-upload-preview"
            : "upload-preview",
        );
        return {
          authorizationPhrase: "fixture upload phrase",
          candidateTrafficPercentage: 0,
          closedTrafficPercentage: 100,
        };
      },
      createCanaryRunner() {
        order.push("create-canary-runner");
        return canaryRunner;
      },
      async createUploadPlan() {
        order.push("create-upload-plan");
        return { fixture: "upload-plan" };
      },
      async createZeroPercentPlan() {
        order.push("create-zero-percent-plan");
        return { fixture: "zero-percent-plan" };
      },
      emit(record) {
        order.push(`emit:${record.status}`);
        emitted.push(record);
      },
    },
  };
}

const requestDirectory = mkdtempSync(
  path.join(os.tmpdir(), "agorbis-d72-request-test-"),
);
chmodSync(requestDirectory, 0o700);
try {
  const requestPath = path.join(requestDirectory, "candidate.json");
  const request = createD72ExceptionalRequestFileTestHarness({
    testOnly: true,
    head: HEAD,
    now: new Date("2026-08-31T12:00:00.000Z"),
    requestPath,
    worktreeRoot: REPOSITORY_ROOT,
  });
  assert.equal(statSync(requestPath).mode & 0o7777, 0o600);
  assert.equal(request.head, HEAD);
  assert.equal(request.deploymentAuthorized, false);
  assert.equal(request.risks.length, 7);
  assert.throws(
    () =>
      createD72ExceptionalRequestFileTestHarness({
        testOnly: true,
        head: HEAD,
        now: new Date("2026-08-31T12:00:01.000Z"),
        requestPath,
        worktreeRoot: REPOSITORY_ROOT,
      }),
    /EEXIST|file already exists/i,
  );
  assert.throws(
    () =>
      createD72ExceptionalRequestFileTestHarness({
        testOnly: true,
        head: HEAD,
        now: new Date("2026-08-31T12:00:00.000Z"),
        requestPath: path.join(REPOSITORY_ROOT, "forbidden-request.json"),
        worktreeRoot: REPOSITORY_ROOT,
      }),
    /no está autorizada/,
  );
} finally {
  rmSync(requestDirectory, { recursive: true, force: true });
}

const gitReceipt = await collectD72GitCurrentState({
  testOnly: true,
  readGitStateImpl: async () => ({
    head: HEAD,
    originMain: HEAD,
    remoteHead: HEAD,
    divergence: "0/0",
    worktreeClean: true,
    diffCheckClean: true,
    remoteObjectReachable: true,
    recoveryAuditPassed: true,
  }),
  nowImpl: () => new Date("2026-08-31T12:00:00.000Z"),
});
const freshnessCandidate = createD72CandidateIdentity({
  testOnly: true,
  head: HEAD,
  originMain: HEAD,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: "e".repeat(64),
  artifactHash: "f".repeat(64),
  createdAtUtc: "2026-08-31T12:00:01.000Z",
  expiresAtUtc: "2026-08-31T13:00:01.000Z",
});
assert.throws(
  () =>
    assertIssuedD72GitCurrentStateReceipt(gitReceipt, {
      allowTestReceipt: true,
      expectedHead: HEAD,
      now: new Date("2026-08-31T12:10:00.000Z"),
    }),
  /evidencia Git D72 no es válida/,
);
assert.equal(
  assertD72CandidateAuthorityGitReceiptAtIssuance(
    gitReceipt,
    freshnessCandidate,
    { allowTestReceipt: true },
  ),
  gitReceipt,
);
assert.throws(
  () =>
    assertD72CandidateAuthorityGitReceiptAtIssuance(
      gitReceipt,
      freshnessCandidate,
    ),
  /capability emitida|evidencia Git D72 no es válida/,
);

const failFast = fixtureDependencies({ failPreGit: true });
await assert.rejects(
  () =>
    runD72NonStatefulCertificationTestHarness({
      testOnly: true,
      dependencies: failFast.dependencies,
      repositoryRoot: "/test-only/repository",
      requestPath: "/test-only/request.json",
      stopAt: "UPLOAD_AUTHORIZATION",
    }),
  /fixture git mismatch/,
);
assert.deepEqual(failFast.order, ["pre-git"]);

const failedBuild = fixtureDependencies({ failBuild: true });
await assert.rejects(
  () =>
    runD72NonStatefulCertificationTestHarness({
      testOnly: true,
      dependencies: failedBuild.dependencies,
      repositoryRoot: "/test-only/repository",
      requestPath: "/test-only/request.json",
      stopAt: "UPLOAD_AUTHORIZATION",
    }),
  /fixture build failed/,
);
assert.deepEqual(failedBuild.order, [
  "pre-git",
  "create-request",
  "build-candidate",
]);

const blockedSupabase = fixtureDependencies({
  blockQualitySmoke: false,
  supabaseBlocked: true,
});
const blockedSupabaseRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: blockedSupabase.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: "UPLOAD_AUTHORIZATION",
});
assert.deepEqual(blockedSupabase.order, [
  "pre-git",
  "create-request",
  "build-candidate",
  "post-build-git",
  "freeze-artifact",
  "create-identity",
  "post-identity-git",
  "supabase",
  "inspect-supabase",
]);
assert.equal(blockedSupabaseRun.exitCode, 1);
assert.equal(blockedSupabaseRun.summary.status, "BLOCKED_SUPABASE_CHECKPOINT");
assert.equal(blockedSupabaseRun.summary.preproofExecuted, false);
assert.equal(blockedSupabaseRun.summary.closedSmokeExecuted, false);
assert.equal(blockedSupabase.order.includes("composite"), false);
assert.equal(blockedSupabase.order.includes("closed-no-write-preproof"), false);
assert.equal(blockedSupabase.order.includes("closed-smoke"), false);

const blockedComposite = fixtureDependencies({
  blockQualitySmoke: false,
  compositeBlocked: true,
});
const blockedCompositeRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: blockedComposite.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: "UPLOAD_AUTHORIZATION",
});
assert.deepEqual(blockedComposite.order, [
  "pre-git",
  "create-request",
  "build-candidate",
  "post-build-git",
  "freeze-artifact",
  "create-identity",
  "post-identity-git",
  "supabase",
  "inspect-supabase",
  "composite",
  "pre-smoke-git",
  "inspect-pre-smoke",
]);
assert.equal(blockedCompositeRun.exitCode, 1);
assert.equal(blockedCompositeRun.summary.status, "BLOCKED_PRE_SMOKE_EVIDENCE");
assert.equal(blockedCompositeRun.summary.preproofExecuted, false);
assert.equal(blockedCompositeRun.summary.closedSmokeExecuted, false);
assert.equal(
  blockedComposite.order.includes("closed-no-write-preproof"),
  false,
);
assert.equal(blockedComposite.order.includes("closed-smoke"), false);

const blocked = fixtureDependencies({ blockQualitySmoke: true });
const blockedRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: blocked.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: "UPLOAD_AUTHORIZATION",
});
assert.deepEqual(blocked.order, [
  "pre-git",
  "create-request",
  "build-candidate",
  "post-build-git",
  "freeze-artifact",
  "create-identity",
  "post-identity-git",
  "supabase",
  "inspect-supabase",
  "composite",
  "pre-smoke-git",
  "inspect-pre-smoke",
  "closed-no-write-preproof",
  "closed-smoke",
  "closed-no-write-proof",
  "bundle",
  "certification",
]);
assert.equal(blockedRun.exitCode, 1);
assert.equal(
  blockedRun.summary.schemaVersion,
  D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
);
assert.equal(blockedRun.summary.status, "BLOCKED");
assert.equal(blockedRun.summary.canaryPreparationAllowed, false);
assert.equal(blockedRun.summary.deploymentAuthorized, false);
assert.equal(blockedRun.summary.deploymentExecuted, false);
assert.equal(blockedRun.summary.actIssued, false);
assert.equal(blockedRun.summary.riskAcceptanceRecorded, false);
assert.equal(blockedRun.summary.remoteMutationExecuted, false);
assert.deepEqual(blockedRun.summary.blockers, ["quality.production-smoke"]);
assert.equal(
  blockedRun.summary.gates.find(
    ({ gateId }) => gateId === "quality.production-smoke",
  ).evidenceStatus,
  EVIDENCE_STATUS.NOT_VERIFIED,
);

const passing = fixtureDependencies({ blockQualitySmoke: false });
const passingRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: passing.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: "UPLOAD_AUTHORIZATION",
});
assert.deepEqual(passing.order, [
  "pre-git",
  "create-request",
  "build-candidate",
  "post-build-git",
  "freeze-artifact",
  "create-identity",
  "post-identity-git",
  "supabase",
  "inspect-supabase",
  "composite",
  "pre-smoke-git",
  "inspect-pre-smoke",
  "closed-no-write-preproof",
  "closed-smoke",
  "closed-no-write-proof",
  "bundle",
  "certification",
  "assert-allowed",
  "upload-preview",
  "emit:WAITING_UPLOAD_AUTHORIZATION",
]);
assert.equal(passingRun.exitCode, 0);
assert.equal(passingRun.summary.status, "WAITING_UPLOAD_AUTHORIZATION");
assert.equal(passingRun.summary.certification.canaryPreparationAllowed, true);
assert.equal(passingRun.summary.certification.gates.length, 20);
assert.equal(
  passingRun.summary.certification.closedDeploymentId,
  CLOSED_DEPLOYMENT_ID,
);
assert.equal(
  passingRun.summary.certification.closedVersionId,
  CLOSED_VERSION_ID,
);
assert.equal(passingRun.summary.deploymentAuthorized, false);
assert.equal(passingRun.summary.deploymentExecuted, false);
assert.equal(passingRun.summary.remoteMutationExecuted, false);
assert.equal(passing.emitted.length, 1);

const blockedPreproof = fixtureDependencies({
  blockQualitySmoke: false,
  preproofStatus: EVIDENCE_STATUS.NOT_VERIFIED,
});
const blockedPreproofRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: blockedPreproof.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: "UPLOAD_AUTHORIZATION",
});
assert.deepEqual(blockedPreproof.order, [
  "pre-git",
  "create-request",
  "build-candidate",
  "post-build-git",
  "freeze-artifact",
  "create-identity",
  "post-identity-git",
  "supabase",
  "inspect-supabase",
  "composite",
  "pre-smoke-git",
  "inspect-pre-smoke",
  "closed-no-write-preproof",
]);
assert.equal(blockedPreproofRun.exitCode, 1);
assert.equal(
  blockedPreproofRun.summary.status,
  "BLOCKED_CLOSED_NO_WRITE_PREPROOF",
);
assert.equal(blockedPreproofRun.summary.gatesCollected, 19);
assert.equal(
  blockedPreproofRun.summary.closedNoWritePreproofStatus,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(blockedPreproof.order.includes("closed-smoke"), false);
assert.equal(blockedPreproof.order.includes("closed-no-write-proof"), false);

const invalidUploadAuthorization = fixtureDependencies({
  authorizationFailure: "version-upload",
  blockQualitySmoke: false,
});
await assert.rejects(
  () =>
    runD72NonStatefulCertificationTestHarness({
      testOnly: true,
      dependencies: invalidUploadAuthorization.dependencies,
      repositoryRoot: "/test-only/repository",
      requestPath: "/test-only/request.json",
      stopAt: null,
    }),
  /invalid version-upload authorization/,
);
assert.equal(
  invalidUploadAuthorization.order.includes("upload-version"),
  false,
);

const staleBeforeUpload = fixtureDependencies({
  blockQualitySmoke: false,
  failPreUploadGit: true,
});
await assert.rejects(
  () =>
    runD72NonStatefulCertificationTestHarness({
      testOnly: true,
      dependencies: staleBeforeUpload.dependencies,
      repositoryRoot: "/test-only/repository",
      requestPath: "/test-only/request.json",
      stopAt: null,
    }),
  /estado Git cambió antes del/,
);
assert.equal(staleBeforeUpload.order.includes("pre-upload-git"), true);
assert.equal(staleBeforeUpload.order.includes("create-upload-plan"), false);
assert.equal(staleBeforeUpload.order.includes("upload-version"), false);

const staticAssetsBlocked = fixtureDependencies({
  blockQualitySmoke: false,
  staticAssetsReady: false,
});
const staticAssetsBlockedRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: staticAssetsBlocked.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: null,
});
assert.equal(staticAssetsBlockedRun.exitCode, 1);
assert.equal(
  staticAssetsBlockedRun.summary.status,
  "BLOCKED_AFTER_VERSION_RECERTIFICATION",
);
assert.equal(staticAssetsBlocked.order.includes("issue-capability"), false);
assert.equal(staticAssetsBlocked.order.includes("attach-at-zero"), false);

const waitingZero = fixtureDependencies({ blockQualitySmoke: false });
const waitingZeroRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: waitingZero.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: "ZERO_PERCENT_AUTHORIZATION",
});
assert.equal(waitingZeroRun.exitCode, 0);
assert.equal(
  waitingZeroRun.summary.status,
  "WAITING_ZERO_PERCENT_AUTHORIZATION",
);
assert.equal(waitingZeroRun.summary.staticAssetsVerified, true);
assert.equal(waitingZero.order.includes("issue-capability"), true);
assert.equal(waitingZero.order.includes("attach-at-zero"), false);

const invalidZeroAuthorization = fixtureDependencies({
  authorizationFailure: "zero-percent-deployment",
  blockQualitySmoke: false,
});
await assert.rejects(
  () =>
    runD72NonStatefulCertificationTestHarness({
      testOnly: true,
      dependencies: invalidZeroAuthorization.dependencies,
      repositoryRoot: "/test-only/repository",
      requestPath: "/test-only/request.json",
      stopAt: null,
    }),
  /invalid zero-percent-deployment authorization/,
);
assert.equal(invalidZeroAuthorization.order.includes("attach-at-zero"), false);

const fullInteractive = fixtureDependencies({ blockQualitySmoke: false });
const fullInteractiveRun = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: fullInteractive.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/request.json",
  stopAt: null,
});
assert.equal(fullInteractiveRun.exitCode, 0);
assert.equal(
  fullInteractiveRun.summary.status,
  "ZERO_PERCENT_ATTACHED_AND_CLOSED_RESTORED",
);
assert.deepEqual(fullInteractive.order.slice(-5), [
  "read-authorization:zero-percent-deployment",
  "create-zero-percent-plan",
  "attach-at-zero",
  "assert-attached",
  "cleanup",
]);
assert.equal(fullInteractiveRun.summary.canaryAttached, false);
assert.equal(fullInteractiveRun.summary.cleanupVerified, true);

const cleanupOnFailedAssertion = fixtureDependencies({
  blockQualitySmoke: false,
  failSessionAssertion: true,
});
await assert.rejects(
  () =>
    runD72NonStatefulCertificationTestHarness({
      testOnly: true,
      dependencies: cleanupOnFailedAssertion.dependencies,
      repositoryRoot: "/test-only/repository",
      requestPath: "/test-only/request.json",
      stopAt: null,
    }),
  /attached state changed/,
);
assert.deepEqual(cleanupOnFailedAssertion.order.slice(-3), [
  "attach-at-zero",
  "assert-attached",
  "cleanup",
]);

await assert.rejects(
  () => runD72NonStatefulCertificationTestHarness({}),
  /testOnly=true|dependencias explícitas/,
);

const openUpdateFixture = fixtureDependencies({
  openUpdate: true,
  blockQualitySmoke: false,
});
const openUpdateResult = await runD72NonStatefulCertificationTestHarness({
  testOnly: true,
  dependencies: openUpdateFixture.dependencies,
  repositoryRoot: "/test-only/repository",
  requestPath: "/test-only/open-request.json",
  stopAt: "UPLOAD_AUTHORIZATION",
});
assert.equal(openUpdateResult.summary.status, "OPEN_CANDIDATES_PREPARED");
assert.equal(openUpdateResult.summary.releaseMode, "OPEN_UPDATE");
assert.equal(openUpdateResult.summary.openSourceReadsCertified, true);
assert.equal(openUpdateResult.summary.canaryPreparationAllowed, true);
assert.equal(openUpdateResult.summary.promotionAllowed, false);
assert.equal(openUpdateResult.summary.productionCanaryReady, false);
assert.equal(openUpdateResult.summary.recoveryArtifactHash, "f".repeat(64));
assert.equal(openUpdateResult.summary.diagnosticHash, "9".repeat(64));
assert.deepEqual(openUpdateFixture.order.slice(0, 8), [
  "pre-git",
  "create-request",
  "build-recovery",
  "freeze-recovery",
  "collect-recovery-compatibility",
  "build-candidate",
  "post-build-git",
  "freeze-artifact",
]);
assert.equal(openUpdateResult.summary.remoteMutationExecuted, false);
assert.equal(openUpdateResult.summary.sourceVersionId, CLOSED_VERSION_ID);
assert.ok(!Object.hasOwn(openUpdateResult.summary, "closedVersionId"));
assert.ok(openUpdateFixture.order.includes("open-source-smoke"));
for (const unexpected of [
  "closed-smoke",
  "closed-no-write-preproof",
  "closed-no-write-proof",
  "create-canary-runner",
  "upload-version",
  "attach-at-zero",
  "cleanup",
])
  assert.ok(!openUpdateFixture.order.includes(unexpected), unexpected);
for (const expected of [
  "create-open-diagnostic",
  "write-open-diagnostic",
  "recovery-upload-preview",
  "upload-preview",
])
  assert.ok(openUpdateFixture.order.includes(expected), expected);

for (const failOpenConsentCleanup of [false, true]) {
  const open = fixtureDependencies({
    openUpdate: true,
    blockQualitySmoke: false,
    failOpenConsentCleanup,
  });
  const result = await runD72NonStatefulCertificationTestHarness({
    testOnly: true,
    dependencies: open.dependencies,
    repositoryRoot: "/test-only/repository",
    requestPath: "/test-only/open-request.json",
    stopAt: null,
  });
  assert.equal(
    result.summary.status,
    failOpenConsentCleanup
      ? "OPEN_CANARY_EMERGENCY_RECOVERED"
      : "OPEN_GOOGLE_CANARY_DIAGNOSTIC",
  );
  assert.equal(result.summary.promotionAllowed, false);
  assert.equal(result.summary.canarySucceeded, false);
  assert.equal(result.summary.cleanupVerified, !failOpenConsentCleanup);
  assert.equal(result.summary.recoveryVerified, failOpenConsentCleanup);
  if (failOpenConsentCleanup)
    assert.equal(
      result.summary.recoveryDeploymentId,
      "77777777-7777-4777-8777-777777777777",
    );
  assert.equal(result.summary.statefulCanaryExecuted, true);
  assert.ok(
    open.order.indexOf("certify-recovery-version") <
      open.order.indexOf("certify-version"),
  );
  assert.ok(
    open.order.indexOf("create-recovery-capsule") <
      open.order.indexOf("attach-at-zero"),
  );
  assert.ok(
    open.order.indexOf("read-authorization:stateful") <
      open.order.indexOf("attach-at-zero"),
  );
  assert.ok(
    open.order.indexOf("capture-google") <
      open.order.indexOf("verify-consent-cleanup"),
  );
  assert.equal(
    open.order.includes("recover-open-emergency"),
    failOpenConsentCleanup,
  );
  assert.equal(open.order.includes("cleanup"), !failOpenConsentCleanup);
  assert.equal(
    open.order.filter((id) => id === "write-open-diagnostic").length,
    1,
  );
  assert.ok(!open.order.includes("closed-smoke"));
}

process.stdout.write(
  "D72 non-stateful same-process certification runner: PASS\n",
);
