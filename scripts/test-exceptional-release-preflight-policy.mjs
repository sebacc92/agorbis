#!/usr/bin/env node

import assert from "node:assert/strict";
import { EXCEPTIONAL_RELEASE_FACTUAL_STATE } from "./exceptional-release-state.mjs";
import {
  normalFactualStateBlockers,
  validateD72CandidatePreflightState,
  validateExceptionalPreflightState,
} from "./exceptional-release-preflight-policy.mjs";
import { OWNER_WAIVER_CANDIDATE_GATE_IDS } from "./release-gate-policy.mjs";

const pending = {
  ...EXCEPTIONAL_RELEASE_FACTUAL_STATE,
  AAIP_DATABASE_REGISTRATION_STATUS: "pending",
  PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS: "pending",
  PUBLIC_AAIP_DATABASE_REGISTRATION_ID: "",
  PUBLIC_AAIP_CONTROLLER_ID: "RL-2026-81658385-APN-DNPDP#AAIP",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION: "",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN: "",
  PUBLIC_SUPABASE_PROCESSING_LOCATION: "",
  PUBLIC_SUPABASE_PROCESSING_LOCATION_EN: "",
  PUBLIC_RESEND_PROCESSING_LOCATION: "",
  PUBLIC_RESEND_PROCESSING_LOCATION_EN: "",
  PUBLIC_PROVIDER_RETENTION_SUMMARY: "",
  PUBLIC_PROVIDER_RETENTION_SUMMARY_EN: "",
  PUBLIC_TRANSFER_SAFEGUARDS: "",
  PUBLIC_TRANSFER_SAFEGUARDS_EN: "",
};

const valid = validateExceptionalPreflightState({
  environment: pending,
  acceptedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS,
});
const candidate = validateD72CandidatePreflightState({
  environment: pending,
  requestedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS,
});
assert.deepEqual(candidate.errors, []);
assert.equal(candidate.deploymentAuthorized, false);
assert.equal(candidate.deploymentExecuted, false);
assert.equal(candidate.riskAcceptanceRecorded, false);
assert.match(candidate.warnings.join("\n"), /solicitud no es aceptación/i);
assert.doesNotMatch(candidate.warnings.join("\n"), /RISK_ACCEPTED_BY_OWNER/);
assert.deepEqual(valid.errors, []);
assert.equal(valid.warnings.length, 8);
assert.equal(
  valid.warnings.filter((warning) => /RISK_ACCEPTED_BY_OWNER/.test(warning))
    .length,
  7,
);
assert.ok(
  valid.warnings
    .filter((warning) => /RISK_ACCEPTED_BY_OWNER/.test(warning))
    .every((warning) => /no es PASS/.test(warning)),
);

for (const gateId of OWNER_WAIVER_CANDIDATE_GATE_IDS) {
  const missing = validateExceptionalPreflightState({
    environment: pending,
    acceptedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS.filter(
      (candidate) => candidate !== gateId,
    ),
  });
  assert.match(
    missing.errors.join("\n"),
    new RegExp(gateId.replaceAll(".", "\\.")),
  );
}

assert.match(
  validateExceptionalPreflightState({
    environment: { ...pending, PUBLIC_TRANSFER_SAFEGUARDS: "inventado" },
    acceptedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS,
  }).errors.join("\n"),
  /mantener vacíos.*PUBLIC_TRANSFER_SAFEGUARDS/,
);
assert.match(
  validateExceptionalPreflightState({
    environment: {
      ...pending,
      PUBLIC_AAIP_DATABASE_REGISTRATION_ID: "RL-2026-reference",
    },
    acceptedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS,
  }).errors.join("\n"),
  /pending exige.*vacío/,
);
assert.match(
  validateExceptionalPreflightState({
    environment: { ...pending, GOOGLE_DRIVE_BACKUP_STATUS: "active" },
    acceptedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS,
  }).errors.join("\n"),
  /inactive/,
);
assert.match(
  validateExceptionalPreflightState({
    environment: pending,
    acceptedRiskGateIds: [
      ...OWNER_WAIVER_CANDIDATE_GATE_IDS,
      "security.auth-functional",
    ],
  }).errors.join("\n"),
  /no renunciable/,
);

assert.deepEqual(
  normalFactualStateBlockers({
    RETENTION_RECONCILIATION_STATUS: "reconciled",
    PRODUCTION_BACKUP_STATUS: "verified",
    SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "applied",
    GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
  }),
  [],
);
assert.equal(normalFactualStateBlockers(pending).length, 3);

console.log("Exceptional release preflight state tests: PASS");
