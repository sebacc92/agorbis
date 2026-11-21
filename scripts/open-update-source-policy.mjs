import { createHash } from "node:crypto";
import { canonicalJson } from "./exceptional-release-act.mjs";
import {
  assertOpenReleaseBaselineRecord,
  assertOpenReleaseBaselineMatches,
} from "./open-release-baseline-policy.mjs";
import { assertD72OpenUpdateEvidenceCertificate } from "./d72-open-update-evidence-policy.mjs";

/**
 * Compare the real source observation with the original baseline and the exact
 * completed canary chain. No observation is rewritten: the sole new expected
 * value is the cleanup deployment ID certified by the externally pinned hash.
 * This does not extend the baseline's promotion window or grant release authority.
 */
export function assertOpenUpdateCertifiedSourceSnapshot({
  certificate,
  expectedCertificateHash,
  request,
  artifactManifest,
  snapshot,
  now,
}) {
  assertD72OpenUpdateEvidenceCertificate(certificate, {
    expectedCertificateHash,
    request,
    artifactManifest,
    now,
    requirePromotionReady: true,
  });
  const nowUtc = new Date(now).toISOString();
  assertOpenReleaseBaselineRecord({
    baseline: request.openSourceBaseline,
    expectedBaselineSha256: request.openSourceBaselineSha256,
    nowUtc,
  });
  const latest = snapshot?.deployments?.result?.deployments?.[0];
  if (latest?.id !== certificate.cleanupDeploymentId) {
    throw new Error(
      "El deployment actual no es el cleanup autorizado del canary.",
    );
  }
  const expected = {
    ...request.openSourceBaseline,
    deploymentId: certificate.cleanupDeploymentId,
  };
  // The baseline module hashes canonical JSON without its trailing newline.
  const expectedHash = createHash("sha256")
    .update(canonicalJson(expected).trimEnd())
    .digest("hex");
  assertOpenReleaseBaselineMatches({
    baseline: expected,
    expectedBaselineSha256: expectedHash,
    snapshot,
    observedAtUtc: nowUtc,
    nowUtc,
  });
  return Object.freeze({
    status: "CERTIFIED_OPEN_SOURCE_MATCHED",
    executionAllowed: false,
    activeDeploymentId: latest.id,
    activeVersionId: request.openSourceBaseline.versionId,
    openSourceBaselineSha256: request.openSourceBaselineSha256,
    openUpdateEvidenceHash: expectedCertificateHash,
    observedAtUtc: nowUtc,
  });
}
