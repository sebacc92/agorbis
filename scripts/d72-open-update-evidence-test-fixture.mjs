// TEST ONLY: synthetic observations never authorize production writes.
import { createD72OpenCanaryTestFixture } from "./d72-canary-open-test-fixture.mjs";
import { exceptionalReleaseRequestHash } from "./exceptional-release-act.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  AUTHORIZED_RISK_OWNER,
} from "./release-gate-policy.mjs";
import { createD72OpenUpdateEvidenceDiagnostic } from "./d72-open-update-evidence-policy.mjs";
let sequence = 0;
export function createD72OpenUpdateEvidenceTestFixture() {
  const seed = createD72OpenCanaryTestFixture();
  const request = {
    schemaVersion: "agorbis-exceptional-release-request/v2",
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head: seed.head,
    owner: AUTHORIZED_RISK_OWNER,
    timestampUtc: new Date(
      Date.parse("2026-08-31T11:30:00.000Z") + ++sequence * 1000,
    ).toISOString(),
    deploymentAuthorized: false,
    risks: [],
    releaseMode: "OPEN_UPDATE",
    openSourceBaseline: seed.baseline,
    openSourceBaselineSha256: seed.baselineSha256,
  };
  const fixture = createD72OpenCanaryTestFixture({
    requestHashOverride: exceptionalReleaseRequestHash(request),
  });
  const now = new Date("2026-08-31T11:46:00.000Z");
  const certificate = createD72OpenUpdateEvidenceDiagnostic({
    candidateIdentity: fixture.candidateIdentity,
    nonStatefulCertification: fixture.nonStatefulCertification,
    request,
    artifactManifest: fixture.artifactManifest,
    testOnly: true,
    now,
  });
  return {
    ...fixture,
    request,
    certificate,
    now,
    expectedCertificateHash: certificate.contentSha256,
  };
}
