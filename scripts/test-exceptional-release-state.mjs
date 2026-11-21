#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  EXCEPTIONAL_RELEASE_FACTUAL_STATE,
  currentExceptionalRiskGateResults,
  nonWaivableGateResult,
} from "./exceptional-release-state.mjs";
import {
  EVIDENCE_STATUS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
} from "./release-gate-policy.mjs";

assert.deepEqual(EXCEPTIONAL_RELEASE_FACTUAL_STATE, {
  PRODUCTION_BACKUP_STATUS: "not_verified",
  GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
  RETENTION_RECONCILIATION_STATUS: "unreconciled",
  SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
});

const risks = currentExceptionalRiskGateResults();
assert.deepEqual(
  risks.map(({ gateId }) => gateId),
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
);
assert.ok(risks.every(({ rawResult }) => rawResult === RAW_RESULT.FAIL));
assert.equal(
  risks.find(
    ({ gateId }) => gateId === "recovery.production-backup-not-verified",
  ).evidenceStatus,
  EVIDENCE_STATUS.NOT_VERIFIED,
);
assert.equal(
  risks.find(({ gateId }) => gateId === "legal.sensitive-consent-0059-omitted")
    .evidenceStatus,
  EVIDENCE_STATUS.FAIL,
);

assert.deepEqual(
  nonWaivableGateResult("security.auth-functional", { passed: true }),
  {
    gateId: "security.auth-functional",
    evidenceStatus: EVIDENCE_STATUS.PASS,
    rawResult: RAW_RESULT.PASS,
  },
);
assert.deepEqual(
  nonWaivableGateResult("security.rls-enforced", {
    passed: false,
    failureEvidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
  }),
  {
    gateId: "security.rls-enforced",
    evidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
    rawResult: RAW_RESULT.FAIL,
  },
);
assert.throws(
  () =>
    nonWaivableGateResult("legal.aaip-registration-pending", { passed: true }),
  /desconocido/,
);

console.log("Exceptional release factual state tests: PASS");
