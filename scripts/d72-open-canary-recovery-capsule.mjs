import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  exceptionalReleaseRequestHash,
} from "./exceptional-release-act.mjs";
import {
  deriveExceptionalReleaseArtifactPaths,
  readExceptionalReleaseArtifactManifest,
} from "./exceptional-release-artifact.mjs";
import { assertD72OpenRecoveryCompatibilityIssued } from "./d72-open-recovery-compatibility.mjs";
import { assertD72RecoveryUploadEvidence } from "./run-d72-canary.mjs";
import {
  D72_CANARY_ACCOUNT_ID,
  D72_CANARY_WORKER_NAME,
  assertD72CanaryProductionAuthorizationToken,
  d72CanaryVersionCertificationHash,
} from "./d72-canary-policy.mjs";
import {
  collectCloudflareState,
  loadWranglerOAuthToken,
} from "./cloudflare-closed-state.mjs";
import {
  createExceptionalOpenRecoveryCapsule,
  exceptionalOpenRecoveryEvidenceHash,
} from "./exceptional-open-recovery-capsule.mjs";
import {
  ensureExceptionalCutoverStateRoot,
  publishExceptionalOpenRecoveryCapsule,
  resolveExceptionalCutoverStateRoot,
} from "./run-exceptional-open-cutover.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const invariant = (value, message) => {
  if (!value) throw new Error(message);
};

/**
 * Local persistence after the separately authorized upload. The only network
 * operation here is the canonical source GET audit, after all opaque issuers
 * and the real unconsumed TTY authorization have been checked. This does not
 * attach a version, consume the infrastructure token or authorize promotion.
 */
export async function createAndPublishD72OpenCanaryRecoveryCapsule({
  repositoryRoot,
  requestPath,
  request,
  artifactManifest,
  recoveryArtifact,
  compatibilityReceipt,
  recoveryUploadEvidence,
  versionCertification,
  zeroPercentDeploymentAuthorizationToken,
  candidateIdentity,
} = {}) {
  invariant(
    repositoryRoot === ROOT && request?.releaseMode === "OPEN_UPDATE",
    "La cápsula canary requiere el repositorio y request OPEN fijados.",
  );
  const requestHash = exceptionalReleaseRequestHash(request);
  const artifactHash = artifactManifest?.contentSha256;
  const recoveryArtifactHash = recoveryArtifact?.artifactHash;
  invariant(
    recoveryArtifact?.artifactRoot ===
      deriveExceptionalReleaseArtifactPaths(requestPath, {
        artifactPurpose: "recovery",
      }).artifactRoot,
    "La cápsula debe usar la ruta del fallback congelado de este request.",
  );
  invariant(
    artifactManifest?.artifactPurpose === "primary" &&
      artifactManifest.recoveryArtifactHash === recoveryArtifactHash &&
      candidateIdentity?.artifactHash === artifactHash &&
      candidateIdentity.requestHash === requestHash &&
      candidateIdentity.head === request.head &&
      candidateIdentity.openSourceBaselineSha256 ===
        request.openSourceBaselineSha256,
    "Los artefactos, identidad y request de la cápsula no coinciden.",
  );
  assertD72OpenRecoveryCompatibilityIssued(compatibilityReceipt, {
    head: request.head,
    requestHash,
    recoveryArtifactHash,
  });
  assertD72RecoveryUploadEvidence(recoveryUploadEvidence, {
    candidateIdentityHash: candidateIdentity.contentSha256,
    head: request.head,
    requestHash,
    artifactHash,
    recoveryArtifactHash,
    recoveryVersionId: recoveryUploadEvidence?.recoveryVersionId,
    openSourceBaselineSha256: request.openSourceBaselineSha256,
  });
  invariant(
    versionCertification?.artifactHash === artifactHash &&
      versionCertification.candidateIdentityHash ===
        candidateIdentity.contentSha256,
    "La cápsula no corresponde a la certificación primaria del canary.",
  );
  const authBindings = {
    head: request.head,
    requestHash,
    policyHash: request.policyHash,
    artifactHash,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: request.openSourceBaselineSha256,
    sourceDeploymentId: request.openSourceBaseline.deploymentId,
    sourceVersionId: request.openSourceBaseline.versionId,
    candidateVersionId: versionCertification.candidateVersionId,
    versionCertificationHash:
      d72CanaryVersionCertificationHash(versionCertification),
  };
  const readAuthorization = () =>
    assertD72CanaryProductionAuthorizationToken(
      zeroPercentDeploymentAuthorizationToken,
      { kind: "zero-percent-deployment", bindings: authBindings },
    );
  const authorization = readAuthorization();
  const readFallback = () =>
    readExceptionalReleaseArtifactManifest({
      requestPath,
      artifactPurpose: "recovery",
      worktreeRoot: ROOT,
      expectedHead: request.head,
      expectedPolicyVersion: request.policyVersion,
      expectedPolicyHash: request.policyHash,
      expectedRequestHash: requestHash,
      expectedArtifactHash: recoveryArtifactHash,
    });
  const fallback = readFallback();
  invariant(
    canonicalJson(fallback) === canonicalJson(recoveryArtifact.manifest),
    "Cambió el fallback de la cápsula.",
  );
  const files = ["exceptional-release-empty.env", "wrangler.traffic.jsonc"].map(
    (name) => {
      const entry = fallback.files.find((file) => file.path === name);
      invariant(entry, "El fallback no contiene los archivos de recuperación.");
      return entry;
    },
  );
  const sources = Object.fromEntries(
    files.map((file) => [
      file.path,
      readFileSync(path.join(recoveryArtifact.artifactRoot, file.path), "utf8"),
    ]),
  );
  for (const file of files)
    invariant(
      Buffer.byteLength(sources[file.path]) === file.size &&
        createHash("sha256").update(sources[file.path]).digest("hex") ===
          file.sha256,
      "Cambió un archivo de recuperación antes de persistirlo.",
    );
  const oauthToken = await loadWranglerOAuthToken();
  const sourceSnapshot = await collectCloudflareState({
    oauthToken,
    fetchImpl: globalThis.fetch,
  });
  readAuthorization();
  invariant(
    canonicalJson(readFallback()) === canonicalJson(fallback),
    "Cambió el fallback durante la lectura del origen.",
  );
  const capsule = createExceptionalOpenRecoveryCapsule({
    recoveryScope: "CANARY_ONLY",
    head: request.head,
    requestHash,
    artifactHash,
    candidateIdentityHash: candidateIdentity.contentSha256,
    infraAuthorizationHash: authorization.statementSha256,
    openSourceBaseline: request.openSourceBaseline,
    expectedBaselineSha256: request.openSourceBaselineSha256,
    sourceSnapshot,
    recoveryVersionId: recoveryUploadEvidence.recoveryVersionId,
    recoveryArtifactHash,
    compatibilityEvidence: compatibilityReceipt.compatibilityEvidence,
    expectedCompatibilitySha256: compatibilityReceipt.compatibilitySha256,
    recoveryUploadEvidence,
    expectedRecoveryUploadEvidenceSha256: exceptionalOpenRecoveryEvidenceHash(
      recoveryUploadEvidence,
    ),
    files,
    createdAtUtc: new Date().toISOString(),
  });
  const expectedBindings = Object.fromEntries([
    ...[
      "recoveryScope",
      "head",
      "requestHash",
      "artifactHash",
      "candidateIdentityHash",
      "infraAuthorizationHash",
      "openSourceBaselineSha256",
      "sourceVersionId",
      "sourceDeploymentId",
      "recoveryVersionId",
      "recoveryArtifactHash",
      "compatibilitySha256",
      "recoveryUploadEvidenceSha256",
    ].map((key) => [key, capsule[key]]),
    ["expectedCapsuleHash", capsule.contentSha256],
  ]);
  const { stateRoot } = ensureExceptionalCutoverStateRoot({
    stateRoot: resolveExceptionalCutoverStateRoot(),
    worktreeRoot: ROOT,
  });
  const published = publishExceptionalOpenRecoveryCapsule({
    stateRoot,
    capsuleManifest: capsule,
    expectedBindings,
    sources,
  });
  return Object.freeze({
    recoveryRoot: published.capsuleRoot,
    recoveryCapsuleManifest: published.manifest,
    recoveryExpectedBindings: published.expectedBindings,
  });
}
