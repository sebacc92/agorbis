// TEST EVIDENCE ONLY. No network, production observations, or release authority.
import * as legacy from "./d72-canary-test-fixture.mjs";
import { sourceSnapshot } from "./cloudflare-open-source-smoke-test-fixture.mjs";
import { createOpenReleaseBaselineCandidate } from "./open-release-baseline-policy.mjs";
import {
  createD72CandidateIdentity,
  createD72NonStatefulEvidenceCertification,
} from "./d72-non-waivable-evidence-policy.mjs";
import {
  NON_STATEFUL_GATE_IDS,
  getNonWaivableGateEvidenceDefinitionForRelease,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION,
  exceptionalReleaseArtifactHash,
} from "./exceptional-release-artifact.mjs";
import {
  createD72CanaryDevTtyReader,
  readD72CanaryAuthorizationToken,
  d72CanaryVersionUploadAuthorizationPhrase,
  createD72CanaryVersionUploadPlan,
} from "./d72-canary-policy.mjs";

let fixtureSequence = 0;
export function createD72OpenCanaryTestFixture({ requestHashOverride } = {}) {
  const requestHash =
    requestHashOverride ?? (++fixtureSequence).toString(16).padStart(64, "0");
  const snapshot = sourceSnapshot();
  snapshot.deployments.result.deployments[0].id = legacy.closedDeploymentId;
  snapshot.deployments.result.deployments[0].versions[0].version_id =
    legacy.closedVersionId;
  const { baseline, baselineSha256 } = createOpenReleaseBaselineCandidate({
    snapshot,
    observedAtUtc: "2026-08-31T11:25:00.000Z",
    expiresAtUtc: "2026-08-31T12:25:00.000Z",
    nowUtc: "2026-08-31T11:30:00.000Z",
  });
  const profile = {
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: baselineSha256,
  };
  const recoveryPayload = {
    ...legacy.artifactManifestPayload,
    requestHash,
    schemaVersion: EXCEPTIONAL_OPEN_UPDATE_ARTIFACT_SCHEMA_VERSION,
    ...profile,
    artifactPurpose: "recovery",
    recoveryArtifactHash: null,
    openSourceBaseline: baseline,
  };
  const recoveryArtifactManifest = Object.freeze({
    ...recoveryPayload,
    contentSha256: exceptionalReleaseArtifactHash(recoveryPayload),
  });
  const payload = {
    ...recoveryPayload,
    artifactPurpose: "primary",
    recoveryArtifactHash: recoveryArtifactManifest.contentSha256,
  };
  const artifactManifest = Object.freeze({
    ...payload,
    contentSha256: exceptionalReleaseArtifactHash(payload),
  });
  const artifactHash = artifactManifest.contentSha256;
  const candidateIdentity = createD72CandidateIdentity({
    testOnly: true,
    head: legacy.head,
    originMain: legacy.head,
    leftCount: 0,
    rightCount: 0,
    worktreeClean: true,
    diffCheckClean: true,
    requestHash: requestHash,
    artifactHash,
    ...profile,
    createdAtUtc: "2026-08-31T11:30:00.000Z",
    expiresAtUtc: "2026-08-31T12:25:00.000Z",
  });
  const sourceEvidenceByGate = Object.fromEntries(
    NON_STATEFUL_GATE_IDS.map((gateId, gateIndex) => [
      gateId,
      getNonWaivableGateEvidenceDefinitionForRelease(
        gateId,
        profile,
      ).sourceIds.map((sourceId, sourceIndex) => ({
        sourceId,
        status: "PASS",
        digest: (gateIndex * 100 + sourceIndex + 1)
          .toString(16)
          .padStart(64, "0"),
        observedAtUtc: "2026-08-31T11:45:00.000Z",
      })),
    ]),
  );
  const nonStatefulCertification = createD72NonStatefulEvidenceCertification({
    testOnly: true,
    candidateIdentity,
    runId: "12345678-1234-4234-9234-123456789abc",
    startedAtUtc: "2026-08-31T11:35:00.000Z",
    completedAtUtc: "2026-08-31T11:45:00.000Z",
    expiresAtUtc: "2026-08-31T12:25:00.000Z",
    sourceEvidenceByGate,
  });
  const {
    closedDeploymentId: _deployment,
    closedVersionId: _version,
    ...base
  } = legacy.basePlanOptions;
  const basePlanOptions = {
    ...base,
    requestHash,
    artifactHash,
    ...profile,
    openSourceBaseline: baseline,
    sourceDeploymentId: baseline.deploymentId,
    sourceVersionId: baseline.versionId,
  };
  const uploadAuthorizationBindings = {
    head: legacy.head,
    requestHash: requestHash,
    policyHash: legacy.policyHash,
    artifactHash,
    workerName: "agorbis",
    ...profile,
    sourceVersionId: baseline.versionId,
  };
  const uploadPhrase = d72CanaryVersionUploadAuthorizationPhrase(
    uploadAuthorizationBindings,
  );
  function createUploadAuthorizationToken() {
    return readD72CanaryAuthorizationToken({
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
      ttyReader: createD72CanaryDevTtyReader({
        readLineImpl: () => uploadPhrase,
        testOnly: true,
      }),
      confirmedAtUtc: "2026-08-31T11:51:00.000Z",
    });
  }
  const uploadAuthorizationToken = createUploadAuthorizationToken();
  const uploadOptions = {
    ...basePlanOptions,
    candidateIdentity,
    nonStatefulCertification,
    versionUploadAuthorizationToken: uploadAuthorizationToken,
    testOnlyEvidence: true,
    now: new Date("2026-08-31T11:52:00.000Z"),
  };
  const uploadPlan = createD72CanaryVersionUploadPlan(uploadOptions);
  const uploadOutputRecord = {
    type: "version-upload",
    version: 1,
    worker_name: "agorbis",
    worker_tag: "f".repeat(32),
    version_id: legacy.canaryVersionId,
    worker_name_overridden: false,
    timestamp: "2026-08-31T11:53:00.000Z",
  };
  const uploadSessionRecord = {
    type: "wrangler-session",
    version: 1,
    wrangler_version: "4.160.1",
    command_line_args: uploadPlan.upload.arguments.slice(1),
    log_file_path: "/tmp/agorbis-d72-wrangler.log",
    timestamp: "2026-08-31T11:52:59.000Z",
  };
  const uploadOutputSource = `${JSON.stringify(uploadSessionRecord)}\n${JSON.stringify(uploadOutputRecord)}\n`;
  function createRecoveryUpload({
    versionId = "55555555-5555-4555-8555-555555555555",
  } = {}) {
    const recoveryBindings = {
      ...uploadAuthorizationBindings,
      artifactPurpose: "recovery",
      uploadArtifactHash: recoveryArtifactManifest.contentSha256,
    };
    const phrase = d72CanaryVersionUploadAuthorizationPhrase(recoveryBindings);
    const authorizationToken = readD72CanaryAuthorizationToken({
      kind: "version-upload",
      bindings: recoveryBindings,
      ttyReader: createD72CanaryDevTtyReader({
        readLineImpl: () => phrase,
        testOnly: true,
      }),
      confirmedAtUtc: "2026-08-31T11:51:00.000Z",
    });
    const options = {
      ...uploadOptions,
      ...recoveryBindings,
      artifactRoot: `${legacy.artifactRoot}.recovery`,
      primaryArtifactManifest: artifactManifest,
      recoveryArtifactManifest,
      versionUploadAuthorizationToken: authorizationToken,
    };
    const plan = createD72CanaryVersionUploadPlan(options);
    return {
      uploadPlan: plan,
      uploadPlanOptions: options,
      authorizationToken,
      artifactManifest: recoveryArtifactManifest,
      authorizationBindings: recoveryBindings,
      phrase,
      outputSource: `${JSON.stringify({ ...uploadSessionRecord, command_line_args: plan.upload.arguments.slice(1) })}\n${JSON.stringify({ ...uploadOutputRecord, version_id: versionId })}\n`,
      versionId,
      candidateVersionResponse() {
        const body = legacy.candidateVersionResponse(plan);
        body.result.id = versionId;
        body.result.resources.bindings.find(
          ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
        ).text = "false";
        return body;
      },
    };
  }
  return {
    ...legacy,
    requestHash,
    profile,
    baseline,
    baselineSha256,
    snapshot,
    artifactManifest,
    artifactHash,
    recoveryArtifactManifest,
    candidateIdentity,
    nonStatefulCertification,
    basePlanOptions,
    uploadAuthorizationBindings,
    uploadPhrase,
    createUploadAuthorizationToken,
    uploadAuthorizationToken,
    uploadOptions,
    uploadPlan,
    uploadOutputSource,
    createRecoveryUpload,
    candidateVersionResponse: (overrides = {}) =>
      legacy.candidateVersionResponse(uploadPlan, overrides),
  };
}
