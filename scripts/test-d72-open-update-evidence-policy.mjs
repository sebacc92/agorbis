import assert from "node:assert/strict";
import { createD72OpenUpdateEvidenceTestFixture } from "./d72-open-update-evidence-test-fixture.mjs";
import {
  assertD72OpenUpdateEvidenceCertificate,
  assertD72OpenUpdateEvidenceCertificateIssued,
  d72OpenUpdateEvidenceCertificateHash,
  validateD72OpenUpdateEvidenceCertificate,
  createD72OpenUpdateEvidenceDiagnostic,
  assertD72OpenCanaryConsentCleanupEvidence,
  issueTestD72OpenCanaryConsentCleanupEvidence,
} from "./d72-open-update-evidence-policy.mjs";
assert.equal(process.versions.node, "22.22.0");
const f = createD72OpenUpdateEvidenceTestFixture();
const options = {
  request: f.request,
  artifactManifest: f.artifactManifest,
  expectedCertificateHash: f.expectedCertificateHash,
  now: f.now,
};
assert.deepEqual(
  validateD72OpenUpdateEvidenceCertificate(f.certificate, options),
  [],
);
assert.equal(f.certificate.promotionAllowed, false);
const emergencyDiagnostic = structuredClone(f.certificate);
emergencyDiagnostic.canaryExecution = {
  outcome: "EMERGENCY_RECOVERED",
  candidateVersionId: "11111111-1111-4111-8111-111111111111",
  cleanupVerified: false,
  cleanupDeploymentId: null,
  recoveryVerified: true,
  recoveryVersionId: "22222222-2222-4222-8222-222222222222",
  recoveryDeploymentId: "33333333-3333-4333-8333-333333333333",
  recoveryCapsuleHash: "c".repeat(64),
  newFixtureDeletionStatus: "NOT_VERIFIED",
};
emergencyDiagnostic.contentSha256 =
  d72OpenUpdateEvidenceCertificateHash(emergencyDiagnostic);
assert.deepEqual(
  validateD72OpenUpdateEvidenceCertificate(emergencyDiagnostic, {
    ...options,
    expectedCertificateHash: emergencyDiagnostic.contentSha256,
  }),
  [],
);
emergencyDiagnostic.canaryExecution.cleanupVerified = true;
emergencyDiagnostic.contentSha256 =
  d72OpenUpdateEvidenceCertificateHash(emergencyDiagnostic);
assert.notDeepEqual(
  validateD72OpenUpdateEvidenceCertificate(emergencyDiagnostic, {
    ...options,
    expectedCertificateHash: emergencyDiagnostic.contentSha256,
  }),
  [],
);
assert.equal(f.certificate.nonWaivableEvidenceReceipt.gates.length, 27);
assert.equal(
  f.certificate.nonWaivableEvidenceReceipt.gates.filter(
    (gate) => gate.evidenceStatus === "NOT_VERIFIED",
  ).length,
  7,
);
assert.throws(
  () =>
    assertD72OpenUpdateEvidenceCertificate(f.certificate, {
      ...options,
      requirePromotionReady: true,
    }),
  /pendientes/,
);
assert.throws(
  () => assertD72OpenUpdateEvidenceCertificateIssued(f.certificate),
  /observaciones/,
);
assert.equal(
  assertD72OpenUpdateEvidenceCertificateIssued(f.certificate, {
    allowTestOnly: true,
  }),
  f.certificate,
);
assert.throws(
  () =>
    assertD72OpenUpdateEvidenceCertificateIssued(
      structuredClone(f.certificate),
      { allowTestOnly: true },
    ),
  /observaciones/,
);
assert.throws(
  () =>
    createD72OpenUpdateEvidenceDiagnostic({
      candidateIdentity: structuredClone(f.candidateIdentity),
      nonStatefulCertification: f.nonStatefulCertification,
      request: f.request,
      artifactManifest: f.artifactManifest,
      testOnly: true,
      now: f.now,
    }),
  /opacas/,
);
for (const mutate of [
  (value) => (value.promotionAllowed = true),
  (value) => (value.deploymentAuthorized = true),
  (value) => (value.sourceVersionId = "99999999-9999-4999-8999-999999999999"),
  (value) => (value.openSourceBaselineSha256 = "f".repeat(64)),
  (value) => value.nonWaivableEvidenceReceipt.gates.pop(),
  (value) => (value.recoveryVersionId = "99999999-9999-4999-8999-999999999999"),
  (value) =>
    value.deploymentChain.push({
      phase: "cleanup",
      previousDeploymentId: value.sourceDeploymentId,
      deploymentId: "99999999-9999-4999-8999-999999999999",
    }),
  (value) => (value.createdAtUtc = value.expiresAtUtc),
  (value) => (value.extra = "untrusted"),
]) {
  const changed = structuredClone(f.certificate);
  mutate(changed);
  changed.contentSha256 = d72OpenUpdateEvidenceCertificateHash(changed);
  assert.notDeepEqual(
    validateD72OpenUpdateEvidenceCertificate(changed, {
      ...options,
      expectedCertificateHash: changed.contentSha256,
    }),
    [],
  );
}
assert.notDeepEqual(
  validateD72OpenUpdateEvidenceCertificate(f.certificate, {
    ...options,
    now: new Date(f.certificate.expiresAtUtc),
  }),
  [],
);
const getter = structuredClone(f.certificate);
Object.defineProperty(getter, "head", {
  get() {
    throw Error("must not execute");
  },
  enumerable: true,
});
assert.match(
  validateD72OpenUpdateEvidenceCertificate(getter, options).join(),
  /accessors/,
);
const bindings = {
  candidateIdentityHash: f.candidateIdentity.contentSha256,
  head: f.head,
  requestHash: f.requestHash,
  artifactHash: f.artifactHash,
  canaryVersionId: f.canaryVersionId,
  openSourceBaselineSha256: f.baselineSha256,
  attachedDeploymentId: "77777777-7777-4777-8777-777777777777",
};
const cleanup = issueTestD72OpenCanaryConsentCleanupEvidence({
  testOnly: true,
  bindings,
});
assert.throws(
  () => assertD72OpenCanaryConsentCleanupEvidence(cleanup, bindings),
  /opaca/,
);
assert.equal(
  assertD72OpenCanaryConsentCleanupEvidence(cleanup, bindings, {
    allowTestOnly: true,
  }),
  cleanup,
);
assert.throws(
  () =>
    assertD72OpenCanaryConsentCleanupEvidence(
      cleanup,
      {
        ...bindings,
        attachedDeploymentId: "88888888-8888-4888-8888-888888888888",
      },
      { allowTestOnly: true },
    ),
  /attachedDeploymentId/,
);
console.log(
  "OPEN evidence certificate: 27-gate diagnostics, opaque issuers, external hash and fail-closed promotion PASS with fixtures.",
);
