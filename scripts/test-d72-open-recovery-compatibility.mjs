import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANDIDATE_MIGRATION_IDS } from "./production-preflight-policy.mjs";
import { EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS } from "./exceptional-open-recovery-capsule.mjs";
import {
  assertLocalOpenRecoveryObservation,
  assertD72OpenRecoveryCompatibilityIssued,
  collectD72OpenRecoveryCompatibility,
} from "./d72-open-recovery-compatibility.mjs";
import { createAndPublishD72OpenCanaryRecoveryCapsule } from "./d72-open-canary-recovery-capsule.mjs";
import { createD72OpenUpdateEvidenceTestFixture } from "./d72-open-update-evidence-test-fixture.mjs";

// Structural fixtures deliberately do not create an issued receipt or invoke
// a database, browser, build, local server, or remote resource.
const recoveryArtifactHash = "a".repeat(64);
const observation = {
  schemaVersion: "agorbis-local-open-recovery-observation/v1",
  scope: "frozen-worker-node-local-supabase-offline-turnstile",
  recoveryArtifactHash,
  migrationIds: [...CANDIDATE_MIGRATION_IDS],
  checks: EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.map((id) => ({
    id,
    status: "PASS",
  })),
  accountCleanupConfirmed: true,
  externalNetworkRequests: 0,
  completedAtUtc: "2026-09-09T12:00:00.000Z",
};
assert.equal(
  assertLocalOpenRecoveryObservation(observation, { recoveryArtifactHash }),
  observation,
);
for (const mutate of [
  (value) => {
    value.scope = "production";
  },
  (value) => {
    value.schemaVersion = "unknown";
  },
  (value) => {
    value.recoveryArtifactHash = "b".repeat(64);
  },
  (value) => {
    value.migrationIds.pop();
  },
  (value) => {
    value.migrationIds.splice(58, 0, "0059");
  },
  (value) => {
    value.checks.pop();
  },
  (value) => {
    value.checks.reverse();
  },
  (value) => {
    value.checks[0].status = "NOT_VERIFIED";
  },
  (value) => {
    value.checks[0].status = true;
  },
  (value) => {
    value.checks[0].extra = "unsupported";
  },
  (value) => {
    value.accountCleanupConfirmed = false;
  },
  (value) => {
    value.accountCleanupConfirmed = "true";
  },
  (value) => {
    value.externalNetworkRequests = 1;
  },
  (value) => {
    value.externalNetworkRequests = "0";
  },
  (value) => {
    value.completedAtUtc = "invalid";
  },
  (value) => {
    value.extra = true;
  },
]) {
  const changed = structuredClone(observation);
  mutate(changed);
  assert.throws(() =>
    assertLocalOpenRecoveryObservation(changed, { recoveryArtifactHash }),
  );
}
for (const value of [
  observation,
  structuredClone(observation),
  {
    compatibilityEvidence: observation,
    compatibilitySha256: recoveryArtifactHash,
  },
  undefined,
  null,
]) {
  assert.throws(
    () =>
      assertD72OpenRecoveryCompatibilityIssued(value, {
        head: "a".repeat(40),
        requestHash: "b".repeat(64),
        recoveryArtifactHash,
      }),
    /opaca/,
  );
}
assert.throws(
  () =>
    collectD72OpenRecoveryCompatibility({
      repositoryRoot: "/unapproved",
      request: {},
      requestPath: "/unapproved/request.json",
      recoveryArtifact: {},
    }),
  /repositorio/,
);
const fixture = createD72OpenUpdateEvidenceTestFixture();
assert.throws(
  () =>
    collectD72OpenRecoveryCompatibility({
      repositoryRoot: path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
      ),
      request: fixture.request,
      requestPath: "/unused/request.json",
      recoveryArtifact: {
        manifest: fixture.recoveryArtifactManifest,
        artifactHash: fixture.recoveryArtifactManifest.contentSha256,
        artifactRoot: "/wrong/other.artifact",
      },
    }),
  /ruta del fallback/,
);
let reads = 0;
const previousFetch = globalThis.fetch;
try {
  globalThis.fetch = () => {
    reads += 1;
    throw new Error("No network is allowed in a structural fixture.");
  };
  await assert.rejects(
    () =>
      createAndPublishD72OpenCanaryRecoveryCapsule({
        repositoryRoot: path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
        ),
        requestPath: "/unused/request.json",
        request: fixture.request,
        artifactManifest: fixture.artifactManifest,
        recoveryArtifact: {
          artifactHash: fixture.recoveryArtifactManifest.contentSha256,
          manifest: fixture.recoveryArtifactManifest,
          artifactRoot: "/unused/request.recovery.artifact",
        },
        candidateIdentity: fixture.candidateIdentity,
        compatibilityReceipt: {
          compatibilityEvidence: observation,
          compatibilitySha256: recoveryArtifactHash,
        },
      }),
    /opaca/,
  );
  assert.equal(reads, 0);
} finally {
  globalThis.fetch = previousFetch;
}
console.log(
  "OPEN local compatibility policy: PASS (exact seven checks/ledger/scope/cleanup; caller facts never acquire authority; no local or remote effects).",
);
