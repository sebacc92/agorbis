#!/usr/bin/env node
// Synthetic transports only: this test does not contact Cloudflare or deploy.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createD72OpenCanaryTestFixture } from "./d72-canary-open-test-fixture.mjs";
import {
  createD72CanaryRunner,
  assertD72RecoveryUploadEvidence,
} from "./run-d72-canary.mjs";
import {
  createD72CanaryCapability,
  createD72CanaryVersionUploadAuthorizationPreview,
  createD72CanaryVersionUploadPlan,
  d72CanaryUploadArtifactBindings,
  validateD72CanaryVersionCertification,
} from "./d72-canary-policy.mjs";

function fixture({
  wrongGoogle = false,
  wrongArtifactProof = false,
  staticAssetsVerified = true,
} = {}) {
  const f = createD72OpenCanaryTestFixture();
  const r = f.createRecoveryUpload();
  const calls = [];
  let secretsRead = 0;
  const runner = createD72CanaryRunner({
    testOnly: true,
    nowImpl: () => new Date("2026-08-31T11:55:00.000Z"),
    ttyLineReaderImpl: () => "unused",
    validateArtifactImpl: ({ manifest, expectedArtifactHash }) =>
      manifest === r.artifactManifest &&
      expectedArtifactHash === r.artifactManifest.contentSha256
        ? []
        : ["Wrong recovery bytes"],
    verifyWranglerImpl: () => ({ version: "4.160.1" }),
    cronSecretReaderImpl: () => {
      secretsRead++;
      return Buffer.from(f.existingSecret);
    },
    prepareExpectedUploadManifestImpl: ({ uploadPlan }) => ({
      expectedArtifactHash: wrongArtifactProof
        ? uploadPlan.artifactHash
        : uploadPlan.uploadArtifactHash,
      uploadPayloadHash: f.uploadPayloadHash,
      modules: [{ name: "worker.js", sha256: "a".repeat(64), size: 1 }],
      metadata: { main_module: "worker.js" },
      assets: { manifestSha256: "b".repeat(64) },
    }),
    verifyRemoteArtifactImpl: () => ({
      proofHash: "4".repeat(64),
      remoteScriptEtag: "9".repeat(64),
      staticAssetsVerified,
      staticAssetsBlocker: staticAssetsVerified
        ? null
        : "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE",
      uploadPayloadHash: f.uploadPayloadHash,
    }),
    getClosedStateImpl: async () => structuredClone(f.snapshot),
    getVersionImpl: async (versionId) => {
      assert.equal(versionId, r.versionId);
      const body = r.candidateVersionResponse();
      if (wrongGoogle)
        body.result.resources.bindings.find(
          ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
        ).text = "true";
      return {
        stable: {
          body,
          endpoint: `/accounts/${f.baseline.accountId}/workers/scripts/agorbis/versions/${versionId}`,
          status: 200,
        },
        beta: {
          body: f.standardEnvelope({}),
          endpoint: `/accounts/${f.baseline.accountId}/workers/workers/agorbis/versions/${versionId}?include=modules`,
          method: "GET",
          status: 200,
        },
      };
    },
    createUploadApiGuardImpl: async () => ({
      apiBaseUrl: `http://127.0.0.1:49152/${"a".repeat(64)}`,
      close: async () => ({
        assetBulkPosts: 0,
        assetSessionPosts: 0,
        assetSinglePosts: 0,
        blockedMutationAttempts: 0,
        forwardedGets: 0,
        versionPosts: 0,
      }),
    }),
    execFileImpl: async (_command, args, options) => {
      calls.push([...args]);
      assert.equal(args[2], "upload");
      if (!args.includes("--dry-run"))
        writeFileSync(options.env.WRANGLER_OUTPUT_FILE_PATH, r.outputSource, {
          mode: 0o600,
        });
      return { stdout: "", stderr: "" };
    },
  });
  return { f, r, runner, calls, secretsRead: () => secretsRead };
}

const p = fixture();
assert.equal(p.r.uploadPlan.artifactHash, p.f.artifactHash);
assert.equal(
  p.r.uploadPlan.uploadArtifactHash,
  p.f.recoveryArtifactManifest.contentSha256,
);
assert.notEqual(p.r.uploadPlan.planSha256, p.f.uploadPlan.planSha256);
assert.notEqual(
  p.r.uploadPlan.upload.arguments.at(-1),
  p.f.uploadPlan.upload.arguments.at(-1),
);
assert.match(
  p.r.phrase,
  /ARTEFACTO PRIMARIO.*ARTEFACTO RECOVERY.*GOOGLE FALSE FACEBOOK FALSE/,
);
assert.equal(p.r.uploadPlan.sourceTrafficPercentage, 100);
const { versionUploadAuthorizationToken: _token, ...previewOptions } =
  p.r.uploadPlanOptions;
assert.equal(
  createD72CanaryVersionUploadAuthorizationPreview(previewOptions)
    .authorizationPhrase,
  p.r.phrase,
);
for (const badOptions of [
  { ...p.r.uploadPlanOptions, primaryArtifactManifest: undefined },
  { ...p.r.uploadPlanOptions, recoveryArtifactManifest: p.f.artifactManifest },
  { ...p.r.uploadPlanOptions, uploadArtifactHash: p.f.artifactHash },
  { ...p.r.uploadPlanOptions, artifactPurpose: "primary" },
  {
    ...p.r.uploadPlanOptions,
    versionUploadAuthorizationToken: p.f.uploadAuthorizationToken,
  },
])
  assert.throws(() => createD72CanaryVersionUploadPlan(badOptions));
assert.throws(() =>
  d72CanaryUploadArtifactBindings({
    artifactPurpose: "recovery",
    uploadArtifactHash: "a".repeat(64),
  }),
);

const uploadInput = ({ r }) => ({
  uploadPlan: r.uploadPlan,
  uploadPlanOptions: r.uploadPlanOptions,
  artifactManifest: r.artifactManifest,
  authorizationToken: r.authorizationToken,
});
const receipt = await p.runner.uploadVersion(uploadInput(p));
assert.equal(receipt.artifactHash, p.f.artifactHash);
assert.equal(
  receipt.uploadArtifactHash,
  p.f.recoveryArtifactManifest.contentSha256,
);
assert.equal(receipt.artifactPurpose, "recovery");
const certification = await p.runner.certifyVersion({
  uploadPlan: p.r.uploadPlan,
  uploadPlanOptions: p.r.uploadPlanOptions,
  artifactManifest: p.r.artifactManifest,
  uploadReceipt: receipt,
});
assert.equal(certification.artifactPurpose, "recovery");
assert.equal(certification.artifactHash, p.f.artifactHash);
assert.equal(
  certification.uploadArtifactHash,
  p.f.recoveryArtifactManifest.contentSha256,
);
const expected = {
  expectedHead: p.f.head,
  expectedRequestHash: p.f.requestHash,
  expectedPolicyHash: p.f.policyHash,
  expectedArtifactHash: p.f.artifactHash,
  expectedReleaseMode: "OPEN_UPDATE",
  expectedOpenSourceBaselineSha256: p.f.baselineSha256,
  expectedSourceDeploymentId: p.f.baseline.deploymentId,
  expectedSourceVersionId: p.f.baseline.versionId,
  expectedArtifactPurpose: "recovery",
  expectedUploadArtifactHash: p.f.recoveryArtifactManifest.contentSha256,
  now: new Date("2026-08-31T11:55:00.000Z"),
};
assert.deepEqual(
  validateD72CanaryVersionCertification(certification, expected),
  [],
);
assert.notEqual(
  validateD72CanaryVersionCertification(certification, {
    ...expected,
    expectedArtifactPurpose: undefined,
    expectedUploadArtifactHash: undefined,
  }).length,
  0,
);
await assert.rejects(
  p.runner.issueCapability({
    versionCertification: certification,
    expiresAtUtc: "2026-08-31T12:10:00.000Z",
    testOnlyNonce: "a".repeat(64),
  }),
  /recovery/,
);
assert.throws(
  () =>
    createD72CanaryCapability({
      versionCertification: certification,
      existingSecret: p.f.existingSecret,
    }),
  /recovery/,
);
assert.equal(p.secretsRead(), 0);
const evidence = p.runner.exportRecoveryUploadEvidence(certification);
assert.equal(
  evidence.recoveryArtifactHash,
  p.f.recoveryArtifactManifest.contentSha256,
);
assert.equal(evidence.recoveryVersionId, p.r.versionId);
assert.equal(evidence.versionScriptEtag, certification.versionScriptEtag);
assert.equal(evidence.message, p.r.uploadPlan.upload.arguments.at(-1));
const evidenceBindings = {
  candidateIdentityHash: certification.candidateIdentityHash,
  head: p.f.head,
  requestHash: p.f.requestHash,
  artifactHash: p.f.artifactHash,
  recoveryArtifactHash: evidence.recoveryArtifactHash,
  recoveryVersionId: evidence.recoveryVersionId,
  openSourceBaselineSha256: p.f.baselineSha256,
};
assert.equal(
  assertD72RecoveryUploadEvidence(evidence, evidenceBindings, {
    allowTestOnly: true,
  }),
  evidence,
);
assert.throws(
  () => assertD72RecoveryUploadEvidence(evidence, evidenceBindings),
  /opaca/,
);
assert.throws(
  () =>
    assertD72RecoveryUploadEvidence(
      structuredClone(evidence),
      evidenceBindings,
      { allowTestOnly: true },
    ),
  /opaca/,
);
assert.throws(
  () => p.runner.exportRecoveryUploadEvidence(structuredClone(certification)),
  /opaca/,
);
assert.equal(p.calls.length, 2);
assert.equal(
  p.calls.some((args) => args.includes("deploy")),
  false,
);

const wrongProof = fixture({ wrongArtifactProof: true });
await assert.rejects(
  wrongProof.runner.uploadVersion(uploadInput(wrongProof)),
  /expected upload manifest/,
);
assert.equal(wrongProof.calls.length, 1);
const wrongGoogle = fixture({ wrongGoogle: true });
const wrongReceipt = await wrongGoogle.runner.uploadVersion(
  uploadInput(wrongGoogle),
);
await assert.rejects(
  wrongGoogle.runner.certifyVersion({
    uploadPlan: wrongGoogle.r.uploadPlan,
    uploadPlanOptions: wrongGoogle.r.uploadPlanOptions,
    artifactManifest: wrongGoogle.r.artifactManifest,
    uploadReceipt: wrongReceipt,
  }),
  /PUBLIC_GOOGLE_AUTH_ENABLED/,
);
const unverified = fixture({ staticAssetsVerified: false });
const unverifiedReceipt = await unverified.runner.uploadVersion(
  uploadInput(unverified),
);
const unverifiedCertification = await unverified.runner.certifyVersion({
  uploadPlan: unverified.r.uploadPlan,
  uploadPlanOptions: unverified.r.uploadPlanOptions,
  artifactManifest: unverified.r.artifactManifest,
  uploadReceipt: unverifiedReceipt,
});
assert.throws(
  () => unverified.runner.exportRecoveryUploadEvidence(unverifiedCertification),
  /BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE/,
);
console.log(
  "Recovery upload runner: PASS, pinned fallback bytes and separate TTY authorization; recovery certification cannot issue capability or attach. Synthetic only.",
);
