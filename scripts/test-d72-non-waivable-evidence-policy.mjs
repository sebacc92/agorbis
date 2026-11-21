#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  EVIDENCE_STATUS,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
} from "./release-gate-policy.mjs";
import {
  NON_STATEFUL_GATE_IDS,
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
  STATEFUL_CANARY_REQUIRED_GATE_IDS,
  getNonWaivableGateEvidenceDefinitionForRelease,
  d72ReleaseEvidenceProfile,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  D72_CANDIDATE_IDENTITY_DISPOSITION,
  assertD72NonStatefulEvidenceAllowsCanary,
  canonicalD72NonWaivableEvidenceJson,
  createD72CandidateIdentity,
  createD72NonWaivableEvidenceReceipt,
  createD72NonStatefulEvidenceCertification,
  d72NonStatefulCollectorCoverage,
  d72CandidateInvalidationReceiptHash,
  d72CandidateIdentityHash,
  d72CanaryRequiredGateIds,
  d72NonWaivableEvidenceBlockers,
  d72NonWaivableEvidenceHash,
  d72NonStatefulEvidenceBlockers,
  d72NonStatefulEvidenceCertificationHash,
  issueD72NonStatefulCollectorBundle,
  validateD72CandidateIdentity,
  validateD72NonWaivableEvidenceReceipt,
  validateD72NonStatefulEvidenceCertification,
} from "./d72-non-waivable-evidence-policy.mjs";
import { collectD72GitCurrentState } from "./d72-git-current-state.mjs";
import {
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS,
  D72_COMPOSITE_OBSERVATION_IDS,
  D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE,
  collectTestD72NonStatefulCompositeReceipt,
  issueTestD72NonStatefulCompositeCollectorReceipt,
} from "./d72-non-stateful-composite-collector.mjs";
import {
  CLOSED_PRODUCTION_SMOKE_CONSTANTS,
  runClosedProductionSmoke,
} from "./cloudflare-closed-smoke-policy.mjs";
import {
  D72_CLOSED_NO_WRITE_PROOF_REASON,
  issueD72ClosedNoWritePreproofTestReceipt,
  issueD72ClosedNoWriteProofTestReceipt,
} from "./d72-closed-no-write-proof.mjs";

import { runOpenSourceProductionSmoke } from "./cloudflare-open-source-smoke-policy.mjs";
import {
  options as openSmokeOptions,
  expectedBaselineSha256 as realOpenBaselineHash,
  NOW as realOpenNow,
} from "./cloudflare-open-source-smoke-test-fixture.mjs";

assert.equal(process.versions.node, "22.22.0");

const head = "90535d7d1877dd74bf758e67586bd8587cd79bce";
const requestHash = "a".repeat(64);
const artifactHash = "b".repeat(64);
const collectorRequestHash = "8".repeat(64);
const collectorArtifactHash = "9".repeat(64);
const invalidatedRequestHash = "6".repeat(64);
const invalidatedArtifactHash = "7".repeat(64);
const canaryReportHash = "c".repeat(64);
const runId = "12345678-1234-4234-9234-123456789abc";
const startedAtUtc = "2026-08-31T12:00:00.000Z";
const completedAtUtc = "2026-08-31T12:20:00.000Z";
const expiresAtUtc = "2026-08-31T13:00:00.000Z";

const candidateIdentity = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash,
  artifactHash,
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
});
const candidateIdentityHash = d72CandidateIdentityHash(candidateIdentity);
assert.deepEqual(
  validateD72CandidateIdentity(candidateIdentity, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
    now: new Date(completedAtUtc),
  }),
  [],
);
assert.equal(candidateIdentity.contentSha256, candidateIdentityHash);
assert.equal(candidateIdentity.phase, "candidate_identity");
assert.equal(candidateIdentity.deploymentAuthorized, false);
assert.equal(candidateIdentity.deploymentExecuted, false);
assert.equal(candidateIdentity.actIssued, false);
assert.equal(candidateIdentity.riskAcceptanceRecorded, false);

function evidence(status = EVIDENCE_STATUS.PASS) {
  return Object.fromEntries(
    NON_WAIVABLE_GATE_EVIDENCE_CATALOG.map((definition, gateIndex) => [
      definition.gateId,
      definition.sourceIds.map((sourceId, sourceIndex) => ({
        sourceId,
        status,
        digest: (gateIndex * 100 + sourceIndex + 1)
          .toString(16)
          .padStart(64, "0"),
        observedAtUtc: completedAtUtc,
      })),
    ]),
  );
}

function nonStatefulEvidence(status = EVIDENCE_STATUS.PASS) {
  const all = evidence(status);
  return Object.fromEntries(
    NON_STATEFUL_GATE_IDS.map((gateId) => [gateId, all[gateId]]),
  );
}

const nonStatefulCertification = createD72NonStatefulEvidenceCertification({
  testOnly: true,
  candidateIdentity,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate: nonStatefulEvidence(),
});
const nonStatefulValidationOptions = {
  candidateIdentity,
  expectedHead: head,
  expectedRequestHash: requestHash,
  expectedArtifactHash: artifactHash,
  now: new Date(completedAtUtc),
};
assert.deepEqual(
  validateD72NonStatefulEvidenceCertification(
    nonStatefulCertification,
    nonStatefulValidationOptions,
  ),
  [],
);
const preIdentityCertification = structuredClone(nonStatefulCertification);
preIdentityCertification.startedAtUtc = "2026-08-31T11:59:59.999Z";
preIdentityCertification.contentSha256 =
  d72NonStatefulEvidenceCertificationHash(preIdentityCertification);
assert.match(
  validateD72NonStatefulEvidenceCertification(preIdentityCertification, {
    ...nonStatefulValidationOptions,
  }).join("\n"),
  /ventana temporal.*inválida/,
);
assert.equal(nonStatefulCertification.gates.length, 20);
assert.deepEqual(
  nonStatefulCertification.gates.map(({ gateId }) => gateId),
  NON_STATEFUL_GATE_IDS,
);
assert.equal(
  nonStatefulCertification.candidateIdentityDisposition,
  D72_CANDIDATE_IDENTITY_DISPOSITION.CERTIFIED,
);
assert.equal(nonStatefulCertification.canaryPreparationAllowed, true);
assert.equal(nonStatefulCertification.deploymentAuthorized, false);
assert.equal(nonStatefulCertification.deploymentExecuted, false);
assert.equal(nonStatefulCertification.actIssued, false);
assert.equal(nonStatefulCertification.riskAcceptanceRecorded, false);
assert.equal(
  nonStatefulCertification.contentSha256,
  d72NonStatefulEvidenceCertificationHash(nonStatefulCertification),
);
assert.deepEqual(d72NonStatefulEvidenceBlockers(nonStatefulCertification), []);
assert.throws(
  () =>
    assertD72NonStatefulEvidenceAllowsCanary(nonStatefulCertification, {
      candidateIdentity,
      expectedHead: head,
      expectedRequestHash: requestHash,
      expectedArtifactHash: artifactHash,
    }),
  /productivos opacos/,
);
assert.throws(
  () =>
    assertD72NonStatefulEvidenceAllowsCanary(nonStatefulCertification, {
      ...nonStatefulValidationOptions,
    }),
  /reloj productivo/,
);
assert.equal(
  assertD72NonStatefulEvidenceAllowsCanary(nonStatefulCertification, {
    ...nonStatefulValidationOptions,
    allowTestOnly: true,
  }),
  nonStatefulCertification,
);

assert.throws(
  () =>
    createD72CandidateIdentity({
      head,
      originMain: head,
      leftCount: 0,
      rightCount: 0,
      worktreeClean: true,
      diffCheckClean: true,
      requestHash,
      artifactHash,
      createdAtUtc: startedAtUtc,
      expiresAtUtc,
    }),
  /reales|testOnly/,
);
assert.throws(
  () =>
    createD72NonStatefulEvidenceCertification({
      candidateIdentity,
      runId,
      startedAtUtc,
      completedAtUtc,
      expiresAtUtc,
      sourceEvidenceByGate: nonStatefulEvidence(),
    }),
  /bundle opacos|testOnly/,
);
const collectorCoverage = d72NonStatefulCollectorCoverage();
assert.equal(collectorCoverage.registeredGateIds.length, 20);
assert.equal(collectorCoverage.notRegisteredGateIds.length, 0);
assert.deepEqual(collectorCoverage.registeredGateIds, NON_STATEFUL_GATE_IDS);
assert.deepEqual(
  collectorCoverage.registeredGateIds.filter((gateId) =>
    [
      "database.expected-migrations-only",
      "data.integrity-no-corruption",
      "security.rls-enforced",
      "authorization.residency-write-boundary",
      "privacy.no-individual-ballots",
      "security.anti-abuse-limits",
    ].includes(gateId),
  ),
  [
    "security.rls-enforced",
    "authorization.residency-write-boundary",
    "privacy.no-individual-ballots",
    "security.anti-abuse-limits",
    "database.expected-migrations-only",
    "data.integrity-no-corruption",
  ],
);
assert(
  collectorCoverage.registeredGateIds.includes("quality.production-smoke"),
);

const testOnlyGitReceipt = await collectD72GitCurrentState({
  testOnly: true,
  readGitStateImpl: async () => ({
    head,
    originMain: head,
    remoteHead: head,
    divergence: "0/0",
    worktreeClean: true,
    diffCheckClean: true,
    remoteObjectReachable: true,
    recoveryAuditPassed: true,
  }),
  nowImpl: () => new Date(startedAtUtc),
});
const preIdentityGitReceipt = await collectD72GitCurrentState({
  testOnly: true,
  readGitStateImpl: async () => ({
    head,
    originMain: head,
    remoteHead: head,
    divergence: "0/0",
    worktreeClean: true,
    diffCheckClean: true,
    remoteObjectReachable: true,
    recoveryAuditPassed: true,
  }),
  nowImpl: () => new Date("2026-08-31T11:59:59.999Z"),
});
const collectorCandidateIdentity = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: collectorRequestHash,
  artifactHash: collectorArtifactHash,
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
});
const allPassCompositeSourceStatuses = () =>
  Object.fromEntries(
    D72_COMPOSITE_NON_STATEFUL_GATE_IDS.map((gateId) => [
      gateId,
      Object.fromEntries(
        Object.keys(D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE[gateId]).map(
          (sourceId) => [sourceId, EVIDENCE_STATUS.PASS],
        ),
      ),
    ]),
  );
const compositeReceipt = issueTestD72NonStatefulCompositeCollectorReceipt({
  candidateIdentity: collectorCandidateIdentity,
  startedAtUtc: "2026-08-31T12:00:00.001Z",
  completedAtUtc: "2026-08-31T12:03:00.000Z",
  sourceStatusesByGate: allPassCompositeSourceStatuses(),
});
const closedSmokeReceipt = await runClosedProductionSmoke({
  testOnly: true,
  nowImpl: () => new Date("2026-08-31T12:01:00.000Z"),
  readClosedProfileImpl: async () => ({
    activeDeploymentId: "11111111-1111-4111-8111-111111111111",
    activeVersionId: "22222222-2222-4222-8222-222222222222",
    cronCount: 0,
    phase: "custom-domains",
    profile: "closed",
    secretStage: "complete",
  }),
  fetchImpl: async (url, init) => {
    const requestUrl = new URL(url);
    if (requestUrl.origin === CLOSED_PRODUCTION_SMOKE_CONSTANTS.wwwOrigin) {
      return new Response(null, {
        status: 308,
        headers: {
          "Cache-Control": "no-store",
          Location: new URL(
            `${requestUrl.pathname}${requestUrl.search}`,
            CLOSED_PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
          ).href,
        },
      });
    }
    return new Response(
      init.method === "HEAD"
        ? null
        : CLOSED_PRODUCTION_SMOKE_CONSTANTS.expectedBody,
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'",
          "Retry-After": "300",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  },
});
assert.equal(closedSmokeReceipt.postState, "POST_HTTP_503_OBSERVED");
assert.equal(closedSmokeReceipt.postWriteStatus, EVIDENCE_STATUS.NOT_VERIFIED);

function issueClosedNoWriteReceipts(
  candidate,
  {
    status = EVIDENCE_STATUS.PASS,
    reasonCode = D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
  } = {},
) {
  const preproof = issueD72ClosedNoWritePreproofTestReceipt({
    testOnly: true,
    candidateIdentity: candidate,
    status: EVIDENCE_STATUS.PASS,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
    facts: {
      activeDeploymentId: closedSmokeReceipt.activeDeploymentId,
      activeVersionId: closedSmokeReceipt.activeVersionId,
      observedAtUtc: "2026-08-31T12:00:30.000Z",
      stableScriptEtag: "1".repeat(64),
      mainModuleSha256: "2".repeat(64),
      moduleInventorySha256: "3".repeat(64),
      moduleCount: 1,
      assetsRunWorkerFirst: true,
      guardContractSha256: "4".repeat(64),
      guard: Object.freeze({
        assetsFetchCount: 0,
        bodyReadCount: 0,
        outboundFetchCount: 0,
        secretReadCount: 0,
        statusCode: 503,
        waitUntilCount: 0,
      }),
    },
  });
  const proofReceipt = issueD72ClosedNoWriteProofTestReceipt({
    testOnly: true,
    preproof,
    candidateIdentity: candidate,
    closedProductionSmokeReceipt: closedSmokeReceipt,
    status,
    reasonCode,
    observedPostAtUtc: "2026-08-31T12:02:00.000Z",
  });
  return { preproof, proofReceipt };
}

const collectorNoWrite = issueClosedNoWriteReceipts(collectorCandidateIdentity);
assert.throws(
  () =>
    issueD72NonStatefulCollectorBundle({
      testOnly: true,
      candidateIdentity: collectorCandidateIdentity,
      closedNoWritePreproof: collectorNoWrite.preproof,
      closedNoWriteProofReceipt: collectorNoWrite.proofReceipt,
      gitReceipt: preIdentityGitReceipt,
      supabaseReceipt: null,
      closedProductionSmokeReceipt: closedSmokeReceipt,
      compositeReceipt,
      now: "2026-08-31T12:04:00.000Z",
    }),
  /receipt Git.*después de candidate identity/,
);
assert.throws(
  () =>
    issueD72NonStatefulCollectorBundle({
      testOnly: true,
      candidateIdentity: collectorCandidateIdentity,
      closedNoWritePreproof: collectorNoWrite.preproof,
      closedNoWriteProofReceipt: collectorNoWrite.proofReceipt,
      gitReceipt: testOnlyGitReceipt,
      supabaseReceipt: null,
      closedProductionSmokeReceipt: closedSmokeReceipt,
      compositeReceipt: structuredClone(compositeReceipt),
      now: "2026-08-31T12:04:00.000Z",
    }),
  /receipt compuesto|opaco|emitido/,
);
const collectorBundle = issueD72NonStatefulCollectorBundle({
  testOnly: true,
  candidateIdentity: collectorCandidateIdentity,
  closedNoWritePreproof: collectorNoWrite.preproof,
  closedNoWriteProofReceipt: collectorNoWrite.proofReceipt,
  gitReceipt: testOnlyGitReceipt,
  supabaseReceipt: null,
  closedProductionSmokeReceipt: closedSmokeReceipt,
  compositeReceipt,
  now: "2026-08-31T12:04:00.000Z",
});
assert.equal(collectorBundle.collectorGateIds.length, 20);
const collectorCertification = createD72NonStatefulEvidenceCertification({
  testOnly: true,
  candidateIdentity: collectorCandidateIdentity,
  collectorBundle,
});
assert.equal(collectorCertification.gates.length, 20);
assert.equal(
  collectorCertification.gates.find(
    ({ gateId }) => gateId === "source.git-head-clean-and-recoverable",
  ).evidenceStatus,
  EVIDENCE_STATUS.PASS,
);
assert.equal(
  collectorCertification.gates.find(
    ({ gateId }) => gateId === "quality.production-smoke",
  ).evidenceStatus,
  EVIDENCE_STATUS.PASS,
);
assert.deepEqual(
  collectorCertification.gates
    .find(({ gateId }) => gateId === "quality.production-smoke")
    .sourceEvidence.map(({ sourceId, status }) => ({ sourceId, status })),
  [
    {
      sourceId: "production.closed-http-get",
      status: EVIDENCE_STATUS.PASS,
    },
    {
      sourceId: "production.closed-http-head",
      status: EVIDENCE_STATUS.PASS,
    },
    {
      sourceId: "production.closed-http-post-denial",
      status: EVIDENCE_STATUS.PASS,
    },
    {
      sourceId: "production.closed-post-no-write",
      status: EVIDENCE_STATUS.PASS,
    },
  ],
);
assert.equal(
  collectorCertification.gates
    .filter(
      ({ gateId }) =>
        gateId !== "source.git-head-clean-and-recoverable" &&
        gateId !== "quality.production-smoke" &&
        !D72_COMPOSITE_NON_STATEFUL_GATE_IDS.includes(gateId),
    )
    .every(
      ({ evidenceStatus, rawResult }) =>
        evidenceStatus === EVIDENCE_STATUS.NOT_VERIFIED &&
        rawResult === RAW_RESULT.FAIL,
    ),
  true,
);
assert.equal(
  collectorCertification.gates
    .filter(({ gateId }) =>
      D72_COMPOSITE_NON_STATEFUL_GATE_IDS.includes(gateId),
    )
    .every(
      ({ evidenceStatus, rawResult }) =>
        evidenceStatus === EVIDENCE_STATUS.PASS &&
        rawResult === RAW_RESULT.PASS,
    ),
  true,
);
assert.equal(
  collectorCertification.candidateIdentityDisposition,
  D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED,
);
assert.equal(collectorCertification.canaryPreparationAllowed, false);
assert.equal(d72NonStatefulEvidenceBlockers(collectorCertification).length, 6);
assert.throws(
  () =>
    createD72NonStatefulEvidenceCertification({
      testOnly: true,
      candidateIdentity: collectorCandidateIdentity,
      collectorBundle: structuredClone(collectorBundle),
    }),
  /invalidada|bundle testOnly opaco/,
);

const noWriteNotVerifiedCandidate = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: "0".repeat(64),
  artifactHash: "1".repeat(64),
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
});
const noWriteNotVerifiedComposite =
  issueTestD72NonStatefulCompositeCollectorReceipt({
    candidateIdentity: noWriteNotVerifiedCandidate,
    startedAtUtc: "2026-08-31T12:00:00.001Z",
    completedAtUtc: "2026-08-31T12:03:00.000Z",
    sourceStatusesByGate: allPassCompositeSourceStatuses(),
  });
const noWriteNotVerified = issueClosedNoWriteReceipts(
  noWriteNotVerifiedCandidate,
  {
    status: EVIDENCE_STATUS.NOT_VERIFIED,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
  },
);
const noWriteNotVerifiedBundle = issueD72NonStatefulCollectorBundle({
  testOnly: true,
  candidateIdentity: noWriteNotVerifiedCandidate,
  closedNoWritePreproof: noWriteNotVerified.preproof,
  closedNoWriteProofReceipt: noWriteNotVerified.proofReceipt,
  gitReceipt: testOnlyGitReceipt,
  supabaseReceipt: null,
  closedProductionSmokeReceipt: closedSmokeReceipt,
  compositeReceipt: noWriteNotVerifiedComposite,
  now: "2026-08-31T12:04:00.000Z",
});
const noWriteNotVerifiedCertification =
  createD72NonStatefulEvidenceCertification({
    testOnly: true,
    candidateIdentity: noWriteNotVerifiedCandidate,
    collectorBundle: noWriteNotVerifiedBundle,
  });
const noWriteNotVerifiedGate = noWriteNotVerifiedCertification.gates.find(
  ({ gateId }) => gateId === "quality.production-smoke",
);
assert.equal(
  noWriteNotVerifiedGate.sourceEvidence.find(
    ({ sourceId }) => sourceId === "production.closed-post-no-write",
  ).status,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  noWriteNotVerifiedGate.sourceEvidence
    .filter(({ sourceId }) => sourceId !== "production.closed-post-no-write")
    .every(({ status }) => status === EVIDENCE_STATUS.PASS),
  true,
);
assert.equal(
  noWriteNotVerifiedGate.evidenceStatus,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert(
  d72NonStatefulEvidenceBlockers(noWriteNotVerifiedCertification).includes(
    "quality.production-smoke",
  ),
);

const factualCompositeCandidate = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: "4".repeat(64),
  artifactHash: "5".repeat(64),
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
});
const factualCompositeReceipt = collectTestD72NonStatefulCompositeReceipt({
  candidateIdentity: factualCompositeCandidate,
  startedAtUtc: "2026-08-31T12:00:00.001Z",
  completedAtUtc: "2026-08-31T12:03:00.000Z",
  observations: {
    ...Object.fromEntries(
      D72_COMPOSITE_OBSERVATION_IDS.map((observationId) => [
        observationId,
        EVIDENCE_STATUS.PASS,
      ]),
    ),
    "remote.dns": EVIDENCE_STATUS.FAIL,
  },
});
const factualCompositeBundle = issueD72NonStatefulCollectorBundle({
  testOnly: true,
  candidateIdentity: factualCompositeCandidate,
  closedNoWritePreproof: null,
  closedNoWriteProofReceipt: null,
  gitReceipt: testOnlyGitReceipt,
  supabaseReceipt: null,
  closedProductionSmokeReceipt: null,
  compositeReceipt: factualCompositeReceipt,
  now: "2026-08-31T12:04:00.000Z",
});
const factualCompositeCertification = createD72NonStatefulEvidenceCertification(
  {
    testOnly: true,
    candidateIdentity: factualCompositeCandidate,
    collectorBundle: factualCompositeBundle,
  },
);
assert.equal(
  factualCompositeCertification.gates.find(
    ({ gateId }) => gateId === "network.production-dns-integrity",
  ).evidenceStatus,
  EVIDENCE_STATUS.FAIL,
);
assert.equal(
  factualCompositeCertification.gates
    .find(({ gateId }) => gateId === "network.production-dns-integrity")
    .sourceEvidence.every(({ status }) => status === EVIDENCE_STATUS.FAIL),
  true,
);
assert.equal(
  factualCompositeCertification.candidateIdentityDisposition,
  D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED,
);
assert(
  d72NonStatefulEvidenceBlockers(factualCompositeCertification).includes(
    "network.production-dns-integrity",
  ),
);

const granularCompositeCandidate = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: "2".repeat(64),
  artifactHash: "3".repeat(64),
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
});
const granularCompositeReceipt = collectTestD72NonStatefulCompositeReceipt({
  candidateIdentity: granularCompositeCandidate,
  startedAtUtc: "2026-08-31T12:00:00.001Z",
  completedAtUtc: "2026-08-31T12:03:00.000Z",
  observations: {
    ...Object.fromEntries(
      D72_COMPOSITE_OBSERVATION_IDS.map((observationId) => [
        observationId,
        EVIDENCE_STATUS.PASS,
      ]),
    ),
    "local.secret-scan": EVIDENCE_STATUS.NOT_VERIFIED,
  },
});
const granularCompositeBundle = issueD72NonStatefulCollectorBundle({
  testOnly: true,
  candidateIdentity: granularCompositeCandidate,
  closedNoWritePreproof: null,
  closedNoWriteProofReceipt: null,
  gitReceipt: testOnlyGitReceipt,
  supabaseReceipt: null,
  closedProductionSmokeReceipt: null,
  compositeReceipt: granularCompositeReceipt,
  now: "2026-08-31T12:04:00.000Z",
});
const granularCompositeCertification =
  createD72NonStatefulEvidenceCertification({
    testOnly: true,
    candidateIdentity: granularCompositeCandidate,
    collectorBundle: granularCompositeBundle,
  });
const granularQualityGate = granularCompositeCertification.gates.find(
  ({ gateId }) => gateId === "quality.build-and-test-suite",
);
assert.equal(
  granularQualityGate.sourceEvidence.find(
    ({ sourceId }) => sourceId === "local.secret-tests",
  ).status,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  granularQualityGate.sourceEvidence.find(
    ({ sourceId }) => sourceId === "local.lint",
  ).status,
  EVIDENCE_STATUS.PASS,
);
assert.equal(granularQualityGate.evidenceStatus, EVIDENCE_STATUS.NOT_VERIFIED);
assert(
  d72NonStatefulEvidenceBlockers(granularCompositeCertification).includes(
    "quality.build-and-test-suite",
  ),
);
assert.throws(
  () =>
    createD72CandidateIdentity({
      gitReceipt: testOnlyGitReceipt,
      request: {},
      artifactManifest: {},
      artifactRoot: "/tmp/not-authoritative",
      worktreeRoot: "/tmp/not-authoritative",
    }),
  /evidencia Git D72 no es válida/,
);

const failingNonStatefulSources = nonStatefulEvidence();
failingNonStatefulSources[NON_STATEFUL_GATE_IDS[0]][0].status =
  EVIDENCE_STATUS.FAIL;
const invalidatedCandidateIdentity = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: invalidatedRequestHash,
  artifactHash: invalidatedArtifactHash,
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
});
const invalidatedCertification = createD72NonStatefulEvidenceCertification({
  testOnly: true,
  candidateIdentity: invalidatedCandidateIdentity,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate: failingNonStatefulSources,
});
assert.equal(
  invalidatedCertification.candidateIdentityDisposition,
  D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED,
);
assert.equal(invalidatedCertification.canaryPreparationAllowed, false);
assert.equal(
  invalidatedCertification.invalidationReceiptHash,
  d72CandidateInvalidationReceiptHash(
    invalidatedCertification.invalidationReceipt,
  ),
);
assert.deepEqual(d72NonStatefulEvidenceBlockers(invalidatedCertification), [
  NON_STATEFUL_GATE_IDS[0],
]);
assert.throws(
  () =>
    assertD72NonStatefulEvidenceAllowsCanary(invalidatedCertification, {
      candidateIdentity: invalidatedCandidateIdentity,
      expectedHead: head,
      expectedRequestHash: invalidatedRequestHash,
      expectedArtifactHash: invalidatedArtifactHash,
      now: new Date(completedAtUtc),
      allowTestOnly: true,
    }),
  /no habilita|BLOCKER/,
);
assert.throws(
  () =>
    createD72NonStatefulEvidenceCertification({
      testOnly: true,
      candidateIdentity: invalidatedCandidateIdentity,
      runId,
      startedAtUtc,
      completedAtUtc,
      expiresAtUtc,
      sourceEvidenceByGate: nonStatefulEvidence(),
    }),
  /invalidada|recertificarse/,
);
assert.throws(
  () =>
    createD72CandidateIdentity({
      testOnly: true,
      head,
      originMain: head,
      leftCount: 0,
      rightCount: 0,
      worktreeClean: true,
      diffCheckClean: true,
      requestHash: invalidatedRequestHash,
      artifactHash: invalidatedArtifactHash,
      createdAtUtc: startedAtUtc,
      expiresAtUtc,
    }),
  /ya fue emitido, consumido o invalidado/,
);
assert.throws(
  () =>
    assertD72NonStatefulEvidenceAllowsCanary(
      structuredClone(nonStatefulCertification),
      {
        candidateIdentity,
        expectedHead: head,
        expectedRequestHash: requestHash,
        expectedArtifactHash: artifactHash,
      },
    ),
  /productivos opacos|emitidos/,
);
const substitutedIdentity = structuredClone(candidateIdentity);
substitutedIdentity.artifactHash = "f".repeat(64);
substitutedIdentity.contentSha256 =
  d72CandidateIdentityHash(substitutedIdentity);
assert.match(
  validateD72NonStatefulEvidenceCertification(nonStatefulCertification, {
    ...nonStatefulValidationOptions,
    candidateIdentity: substitutedIdentity,
  }).join("\n"),
  /candidateIdentity|artifactHash/,
);

const passing = createD72NonWaivableEvidenceReceipt({
  head,
  requestHash,
  artifactHash,
  candidateIdentityHash,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate: evidence(),
  canaryExecuted: true,
  canaryReportHash,
});
assert.deepEqual(
  validateD72NonWaivableEvidenceReceipt(passing, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
    expectedCandidateIdentityHash: candidateIdentityHash,
    now: new Date("2026-08-31T12:59:59.999Z"),
  }),
  [],
);
assert.equal(passing.gates.length, 27);
assert.deepEqual(
  passing.gates.map(({ gateId }) => gateId),
  NON_WAIVABLE_SECURITY_GATE_IDS,
);
assert.equal(
  passing.gates.some(({ gateId }) =>
    OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gateId),
  ),
  false,
);
assert.equal(
  passing.gates.every(
    ({ evidenceStatus, rawResult }) =>
      evidenceStatus === EVIDENCE_STATUS.PASS && rawResult === RAW_RESULT.PASS,
  ),
  true,
);
assert.deepEqual(d72NonWaivableEvidenceBlockers(passing), []);
assert.equal(passing.contentSha256, d72NonWaivableEvidenceHash(passing));
assert.equal(passing.deploymentAuthorized, false);
assert.equal(passing.deploymentExecuted, false);
assert.deepEqual(d72CanaryRequiredGateIds(), STATEFUL_CANARY_REQUIRED_GATE_IDS);
assert.equal(Object.isFrozen(passing), true);
assert.equal(Object.isFrozen(passing.gates[0].sourceEvidence), true);

const preCanaryEvidence = evidence();
for (const gateId of STATEFUL_CANARY_REQUIRED_GATE_IDS) {
  preCanaryEvidence[gateId] = preCanaryEvidence[gateId].map((source) => ({
    ...source,
    status: EVIDENCE_STATUS.NOT_VERIFIED,
  }));
}
const preCanary = createD72NonWaivableEvidenceReceipt({
  head,
  requestHash,
  artifactHash,
  candidateIdentityHash,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate: preCanaryEvidence,
  canaryExecuted: false,
  canaryReportHash: null,
});
assert.deepEqual(
  d72NonWaivableEvidenceBlockers(preCanary),
  STATEFUL_CANARY_REQUIRED_GATE_IDS,
);
for (const gateId of STATEFUL_CANARY_REQUIRED_GATE_IDS) {
  const gate = preCanary.gates.find((entry) => entry.gateId === gateId);
  assert.equal(gate.evidenceStatus, EVIDENCE_STATUS.NOT_VERIFIED);
  assert.equal(gate.rawResult, RAW_RESULT.FAIL);
}

const factualFailureEvidence = evidence();
factualFailureEvidence[NON_WAIVABLE_SECURITY_GATE_IDS[0]][0].status =
  EVIDENCE_STATUS.FAIL;
const factualFailure = createD72NonWaivableEvidenceReceipt({
  head,
  requestHash,
  artifactHash,
  candidateIdentityHash,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate: factualFailureEvidence,
  canaryExecuted: true,
  canaryReportHash,
});
assert.equal(factualFailure.gates[0].evidenceStatus, EVIDENCE_STATUS.FAIL);
assert.equal(factualFailure.gates[0].rawResult, RAW_RESULT.FAIL);

function changedReceipt(change) {
  const changed = structuredClone(passing);
  change(changed);
  changed.contentSha256 = d72NonWaivableEvidenceHash(changed);
  return changed;
}

for (const [change, pattern] of [
  [(value) => (value.head = "f".repeat(40)), /head/],
  [(value) => (value.requestHash = "d".repeat(64)), /requestHash/],
  [(value) => (value.artifactHash = "e".repeat(64)), /artifactHash/],
  [
    (value) => (value.candidateIdentityHash = "9".repeat(64)),
    /candidateIdentityHash/,
  ],
  [(value) => (value.deploymentAuthorized = true), /no autoriza/],
  [(value) => value.gates.pop(), /27 gates/],
  [
    (value) =>
      (value.gates[0].sourceEvidence[0].observedAtUtc =
        "2026-08-30T12:00:00.000Z"),
    /esta corrida/,
  ],
  [
    (value) =>
      (value.gates[0].sourceEvidence[0].status = "RISK_ACCEPTED_BY_OWNER"),
    /no es factual/,
  ],
  [
    (value) => (value.gates[0].evidenceStatus = EVIDENCE_STATUS.NOT_VERIFIED),
    /no deriva/,
  ],
  [(value) => (value.canaryExecuted = false), /report canario|binding/],
  [(value) => (value.gates[0].extra = "forbidden"), /no aprobados/],
]) {
  assert.match(
    validateD72NonWaivableEvidenceReceipt(changedReceipt(change), {
      expectedHead: head,
      expectedRequestHash: requestHash,
      expectedArtifactHash: artifactHash,
      expectedCandidateIdentityHash: candidateIdentityHash,
      now: new Date(completedAtUtc),
    }).join("\n"),
    pattern,
  );
}

assert.match(
  validateD72NonWaivableEvidenceReceipt(passing, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
    expectedCandidateIdentityHash: candidateIdentityHash,
    now: new Date(expiresAtUtc),
  }).join("\n"),
  /vencida/,
);
const unsealed = structuredClone(passing);
unsealed.gates[0].rawResult = RAW_RESULT.FAIL;
assert.match(
  validateD72NonWaivableEvidenceReceipt(unsealed, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
    now: new Date(completedAtUtc),
  }).join("\n"),
  /rawResult|contentSha256/,
);

assert.equal(
  canonicalD72NonWaivableEvidenceJson(passing).includes("RISK_ACCEPTED"),
  false,
);
assert.throws(
  () =>
    createD72NonWaivableEvidenceReceipt({
      head,
      requestHash,
      artifactHash,
      candidateIdentityHash,
      runId,
      startedAtUtc,
      completedAtUtc,
      expiresAtUtc,
      sourceEvidenceByGate: {},
    }),
  /exactamente 27/,
);

const openProfile = {
  releaseMode: "OPEN_UPDATE",
  openSourceBaselineSha256: "e".repeat(64),
};
const openIdentity = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: "ab".repeat(32),
  artifactHash: "cd".repeat(32),
  createdAtUtc: startedAtUtc,
  expiresAtUtc,
  ...openProfile,
});
assert.deepEqual(d72ReleaseEvidenceProfile(openIdentity), openProfile);
assert.throws(
  () => d72ReleaseEvidenceProfile({ releaseMode: "OPEN" }),
  /Perfil/,
);
assert.throws(
  () => d72ReleaseEvidenceProfile({ openSourceBaselineSha256: "e".repeat(64) }),
  /Perfil/,
);
assert.throws(
  () =>
    d72ReleaseEvidenceProfile({
      ...openProfile,
      openSourceBaselineSha256: "wrong",
    }),
  /Perfil/,
);
const openSources = Object.fromEntries(
  NON_STATEFUL_GATE_IDS.map((gateId) => [
    gateId,
    getNonWaivableGateEvidenceDefinitionForRelease(
      gateId,
      openIdentity,
    ).sourceIds.map((sourceId) => ({
      sourceId,
      status: EVIDENCE_STATUS.PASS,
      digest: "f".repeat(64),
      observedAtUtc: completedAtUtc,
    })),
  ]),
);
const openCertification = createD72NonStatefulEvidenceCertification({
  testOnly: true,
  candidateIdentity: openIdentity,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate: openSources,
});
assert.equal(openCertification.releaseMode, "OPEN_UPDATE");
assert.equal(
  openCertification.openSourceBaselineSha256,
  openProfile.openSourceBaselineSha256,
);
assert.equal(openCertification.candidateIdentityDisposition, "CERTIFIED");
assert.equal(openCertification.canaryPreparationAllowed, true);
assert.deepEqual(d72NonStatefulEvidenceBlockers(openCertification), []);
const openSmoke = openCertification.gates.find(
  ({ gateId }) => gateId === "quality.production-smoke",
);
assert.ok(
  openSmoke.sourceEvidence.every(({ sourceId }) =>
    sourceId.startsWith("production.open-source-"),
  ),
);
assert.ok(!JSON.stringify(openSmoke).includes("closed-post-no-write"));
const openValidation = {
  candidateIdentity: openIdentity,
  expectedHead: head,
  expectedRequestHash: openIdentity.requestHash,
  expectedArtifactHash: openIdentity.artifactHash,
  now: new Date(completedAtUtc),
};
assert.deepEqual(
  validateD72NonStatefulEvidenceCertification(
    openCertification,
    openValidation,
  ),
  [],
);
const wrongOpenBaseline = structuredClone(openCertification);
wrongOpenBaseline.openSourceBaselineSha256 = "d".repeat(64);
wrongOpenBaseline.contentSha256 =
  d72NonStatefulEvidenceCertificationHash(wrongOpenBaseline);
assert.match(
  validateD72NonStatefulEvidenceCertification(
    wrongOpenBaseline,
    openValidation,
  ).join("\n"),
  /perfil\/baseline/,
);
const forgedClosedSmoke = structuredClone(openCertification);
forgedClosedSmoke.gates.find(
  ({ gateId }) => gateId === "quality.production-smoke",
).sourceEvidence = nonStatefulEvidence()["quality.production-smoke"];
forgedClosedSmoke.contentSha256 =
  d72NonStatefulEvidenceCertificationHash(forgedClosedSmoke);
assert.notDeepEqual(
  validateD72NonStatefulEvidenceCertification(
    forgedClosedSmoke,
    openValidation,
  ),
  [],
);

const opaqueOpenIdentity = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash: "9a".repeat(32),
  artifactHash: "9b".repeat(32),
  createdAtUtc: "2026-09-09T00:00:00.000Z",
  expiresAtUtc: "2026-09-09T01:00:00.000Z",
  releaseMode: "OPEN_UPDATE",
  openSourceBaselineSha256: realOpenBaselineHash,
});
const opaqueOpenSmoke = await runOpenSourceProductionSmoke(openSmokeOptions());
const opaqueOpenBundleOptions = {
  testOnly: true,
  candidateIdentity: opaqueOpenIdentity,
  now: new Date(realOpenNow),
  gitReceipt: null,
  supabaseReceipt: null,
  compositeReceipt: null,
  openSourceProductionSmokeReceipt: opaqueOpenSmoke,
};
assert.throws(
  () =>
    issueD72NonStatefulCollectorBundle({
      ...opaqueOpenBundleOptions,
      openSourceProductionSmokeReceipt: structuredClone(opaqueOpenSmoke),
    }),
  /opaco|proceso|emitido|no es válido/,
);
assert.throws(
  () =>
    issueD72NonStatefulCollectorBundle({
      ...opaqueOpenBundleOptions,
      closedProductionSmokeReceipt: null,
    }),
  /campos|sólo acepta/,
);
const opaqueOpenBundle = issueD72NonStatefulCollectorBundle(
  opaqueOpenBundleOptions,
);
const opaqueOpenCertification = createD72NonStatefulEvidenceCertification({
  testOnly: true,
  candidateIdentity: opaqueOpenIdentity,
  collectorBundle: opaqueOpenBundle,
});
assert.equal(
  opaqueOpenCertification.gates.find(
    ({ gateId }) => gateId === "quality.production-smoke",
  ).evidenceStatus,
  "PASS",
);
assert.equal(opaqueOpenCertification.canaryPreparationAllowed, false);
assert.ok(d72NonStatefulEvidenceBlockers(opaqueOpenCertification).length > 0);

console.log(
  "D72 NON_WAIVABLE evidence receipt: PASS (27/27, current-run, canary-bound, no waivers).",
);
