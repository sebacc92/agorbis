// Synthetic test data only. Never import this module from a release runner.
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CANDIDATE_MIGRATION_IDS } from "../production-preflight-policy.mjs";
import {
  EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS,
  EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION,
  EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION,
  createExceptionalOpenRecoveryCapsule,
  exceptionalOpenRecoveryEvidenceHash,
} from "../exceptional-open-recovery-capsule.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fakeHash = (label) => sha256(`SYNTHETIC TEST EVIDENCE ONLY: ${label}`);

export function createSyntheticOpenRecoveryFixture({
  head,
  requestHash,
  artifactHash,
  recoveryArtifactHash,
  baseline,
  baselineSha256,
  sourceSnapshot,
  recoveryVersionId,
  candidateIdentityHash,
  infraAuthorizationHash,
  createdAtUtc,
  recoveryRoot,
  recoveryScope = "CANARY_ONLY",
  actHash,
  issuanceHash,
}) {
  const compatibilityEvidence = {
    schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION,
    head,
    recoveryArtifactHash,
    migrationIds: [...CANDIDATE_MIGRATION_IDS],
    checks: EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.map((id) => ({
      id,
      result: "PASS",
      evidenceSha256: fakeHash(id),
    })),
    verifiedAtUtc: createdAtUtc,
  };
  const recoveryUploadEvidence = {
    schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION,
    head,
    recoveryArtifactHash,
    recoveryVersionId,
    uploadPayloadHash: fakeHash("upload"),
    modulesProofSha256: fakeHash("modules"),
    staticAssetsProofSha256: fakeHash("assets"),
    configurationProofSha256: fakeHash("configuration"),
    versionScriptEtag: fakeHash("recovery-script"),
    tag: `d72-canary-${head}`,
    message: `agorbis-d72-canary:upload:v1:${fakeHash("recovery-message")}`,
    uploadedAtUtc: createdAtUtc,
    verifiedAtUtc: createdAtUtc,
  };
  const sources = {
    "exceptional-release-empty.env": "",
    "wrangler.traffic.jsonc": `${JSON.stringify({ $schema: "node_modules/wrangler/config-schema.json", name: baseline.workerName, account_id: baseline.accountId })}\n`,
  };
  const files = Object.entries(sources).map(([filePath, source]) => ({
    path: filePath,
    size: Buffer.byteLength(source),
    sha256: sha256(source),
  }));
  const scopedBindings =
    recoveryScope === "CANARY_ONLY"
      ? { candidateIdentityHash, infraAuthorizationHash }
      : { actHash, issuanceHash };
  const capsuleManifest = createExceptionalOpenRecoveryCapsule({
    recoveryScope,
    head,
    requestHash,
    artifactHash,
    recoveryArtifactHash,
    ...scopedBindings,
    openSourceBaseline: baseline,
    expectedBaselineSha256: baselineSha256,
    sourceSnapshot,
    recoveryVersionId,
    compatibilityEvidence,
    expectedCompatibilitySha256: exceptionalOpenRecoveryEvidenceHash(
      compatibilityEvidence,
    ),
    recoveryUploadEvidence,
    expectedRecoveryUploadEvidenceSha256: exceptionalOpenRecoveryEvidenceHash(
      recoveryUploadEvidence,
    ),
    files,
    createdAtUtc,
  });
  const expectedBindings = Object.fromEntries(
    [
      "recoveryScope",
      "head",
      "requestHash",
      "artifactHash",
      "recoveryArtifactHash",
      "openSourceBaselineSha256",
      "sourceVersionId",
      "sourceDeploymentId",
      "recoveryVersionId",
      "compatibilitySha256",
      "recoveryUploadEvidenceSha256",
      ...Object.keys(scopedBindings),
    ].map((key) => [key, capsuleManifest[key]]),
  );
  expectedBindings.expectedCapsuleHash = capsuleManifest.contentSha256;
  if (recoveryRoot) {
    mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 });
    chmodSync(recoveryRoot, 0o700);
    for (const [filePath, source] of Object.entries(sources)) {
      writeFileSync(path.join(recoveryRoot, filePath), source, {
        mode: 0o600,
        flag: "wx",
      });
    }
  }
  return { capsuleManifest, expectedBindings, sources, recoveryRoot };
}
