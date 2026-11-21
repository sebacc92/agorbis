#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  AUTHORIZED_RISK_OWNER,
  applyReleaseGateWaivers,
  EVIDENCE_STATUS,
  GATE_POLICY,
  getReleaseGateDefinition,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  SENSITIVE_CONSENT_0059_AFFECTED_SURFACES,
  SEVERITY,
  validateReleaseGateDecisionInput,
  validateReleaseGatePolicy,
  WAIVER_POLICY,
} from "./release-gate-policy.mjs";
import { EXPECTED_D72_MIGRATION_FILE } from "./production-preflight-policy.mjs";

const owner = AUTHORIZED_RISK_OWNER;
const rationale =
  "El responsable acepta individualmente la consecuencia canónica y mantiene una fecha de revisión.";
const EXPECTED_NON_WAIVABLE_SECURITY_GATE_IDS = Object.freeze([
  "source.git-head-clean-and-recoverable",
  "security.auth-functional",
  "operations.smtp-functional",
  "security.turnstile-a",
  "security.turnstile-b",
  "security.rls-enforced",
  "security.private-storage",
  "authorization.residency-write-boundary",
  "privacy.no-individual-ballots",
  "security.anti-abuse-limits",
  "security.csp",
  "security.cookies",
  "security.secret-scan",
  "security.worker-secrets-confidential",
  "cloudflare.secret-inventory-exact",
  "database.expected-migrations-only",
  "data.integrity-no-corruption",
  "quality.build-and-test-suite",
  "cloudflare.known-bindings-only",
  "cloudflare.domain-config-exact",
  "cloudflare.known-crons-only",
  "network.production-dns-integrity",
  "quality.production-smoke",
  "configuration.no-unknown-release-config",
  "configuration.auth-providers-aligned",
  "configuration.ai-disabled",
  "legal.pending-external-copy-honest",
]);

function resultFor(gateId, evidenceStatus, rawResult) {
  return { gateId, evidenceStatus, rawResult };
}

function waiverFor(gateId) {
  return { gateId, riskAcceptedByOwner: true, owner, rationale };
}

function assertRejected(gateResults, waiverRequests, pattern) {
  const errors = validateReleaseGateDecisionInput({
    gateResults,
    waiverRequests,
  });
  assert.ok(
    errors.some((error) => pattern.test(error)),
    errors.join("\n"),
  );
}

assert.deepEqual(validateReleaseGatePolicy(), []);
assert.match(RELEASE_GATE_POLICY_SHA256, /^[a-f0-9]{64}$/);
assert.equal(
  RELEASE_GATE_POLICY_SHA256,
  "59f6283b36a2805ee73710d6f1223d3c98385cf732d72e3eba31dcab4053c03e",
);
assert.equal(RELEASE_GATE_POLICY_VERSION, "D72/2026-11-01/v6");
assert.deepEqual(
  [
    ...new Set(
      OWNER_WAIVER_CANDIDATE_GATE_IDS.map(
        (gateId) => getReleaseGateDefinition(gateId).reviewRequiredBy,
      ),
    ),
  ],
  ["2026-11-30"],
);
assert.equal(RELEASE_GATE_POLICY.authorizedRiskOwner, AUTHORIZED_RISK_OWNER);
assert.equal(
  new Set(RELEASE_GATE_POLICY.gates.map(({ id }) => id)).size,
  RELEASE_GATE_POLICY.gates.length,
);

assert.deepEqual(
  RELEASE_GATE_POLICY.gates
    .filter(({ waiverPolicy }) => waiverPolicy === WAIVER_POLICY.OWNER_EXPLICIT)
    .map(({ id }) => id),
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
);
assert.deepEqual(
  NON_WAIVABLE_SECURITY_GATE_IDS,
  EXPECTED_NON_WAIVABLE_SECURITY_GATE_IDS,
);
assert.equal(EXPECTED_NON_WAIVABLE_SECURITY_GATE_IDS.length, 27);

const expectedD72MigrationId = EXPECTED_D72_MIGRATION_FILE.slice(0, 4);
assert.match(EXPECTED_D72_MIGRATION_FILE, /^0061_.+\.sql$/);
assert.equal(
  getReleaseGateDefinition("database.expected-migrations-only").description,
  `Ledger exacto 0001–0058 + 0060 + ${expectedD72MigrationId} y 0059 aislada.`,
);

for (const gateId of OWNER_WAIVER_CANDIDATE_GATE_IDS) {
  const definition = getReleaseGateDefinition(gateId);
  assert.equal(definition.gatePolicy, GATE_POLICY.GATE_REQUIRED);
  assert.equal(definition.waiverPolicy, WAIVER_POLICY.OWNER_EXPLICIT);
  assert.notEqual(definition.evidenceStatus, EVIDENCE_STATUS.PASS);
  assert.equal(definition.rawResult, RAW_RESULT.FAIL);
  assert.match(definition.reviewRequiredBy, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(definition.name, definition.description);
  assert.ok(definition.riskTypes.length > 0);
  assert.equal(typeof definition.dependsOnExternalEvidence, "boolean");
  assert.equal(definition.technicallyOmittable, true);

  const decisions = applyReleaseGateWaivers({
    gateResults: [
      resultFor(gateId, definition.evidenceStatus, definition.rawResult),
    ],
    waiverRequests: [waiverFor(gateId)],
  });
  assert.equal(
    decisions[0].releaseDisposition,
    RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
  );
  assert.equal(decisions[0].evidenceStatus, definition.evidenceStatus);
  assert.equal(decisions[0].rawResult, RAW_RESULT.FAIL);
}

const consent = getReleaseGateDefinition(
  "legal.sensitive-consent-0059-omitted",
);
assert.equal(consent.severity, SEVERITY.HIGH);
assert.equal(consent.evidenceStatus, EVIDENCE_STATUS.FAIL);
assert.deepEqual(
  consent.affectedSurfaces,
  SENSITIVE_CONSENT_0059_AFFECTED_SURFACES,
);
assert.equal(consent.affectedSurfaces.length, 7);
assert.equal(
  getReleaseGateDefinition("recovery.production-backup-not-verified")
    .dependsOnExternalEvidence,
  true,
);

for (const gateId of NON_WAIVABLE_SECURITY_GATE_IDS) {
  const definition = getReleaseGateDefinition(gateId);
  assert.equal(definition.gatePolicy, GATE_POLICY.NON_WAIVABLE_SECURITY_GATE);
  assert.equal(definition.waiverPolicy, WAIVER_POLICY.NEVER);
  assert.equal(definition.technicallyOmittable, true);
  assertRejected(
    [resultFor(gateId, EVIDENCE_STATUS.FAIL, RAW_RESULT.FAIL)],
    [waiverFor(gateId)],
    /NON_WAIVABLE_SECURITY_GATE/,
  );
}

const pendingAaip = resultFor(
  "legal.aaip-registration-pending",
  EVIDENCE_STATUS.BLOCKED_EXTERNAL,
  RAW_RESULT.FAIL,
);
assertRejected([pendingAaip], [waiverFor("*")], /global|wildcard/i);
assertRejected([pendingAaip], [waiverFor("unknown.gate")], /desconocido/i);
assertRejected(
  [pendingAaip],
  [
    {
      ...waiverFor("legal.aaip-registration-pending"),
      owner: "Persona Real Distinta",
    },
  ],
  /owner autorizado exacto/,
);
assert.throws(
  () =>
    applyReleaseGateWaivers({
      gateResults: [pendingAaip],
      waiverRequests: [
        {
          ...waiverFor("legal.aaip-registration-pending"),
          owner: ` ${AUTHORIZED_RISK_OWNER}`,
        },
      ],
    }),
  /owner autorizado exacto/,
);
assertRejected(
  [pendingAaip],
  [
    waiverFor("legal.aaip-registration-pending"),
    waiverFor("legal.aaip-registration-pending"),
  ],
  /duplicados/i,
);

assertRejected(
  [
    resultFor(
      "legal.aaip-registration-pending",
      EVIDENCE_STATUS.PASS,
      RAW_RESULT.PASS,
    ),
  ],
  [waiverFor("legal.aaip-registration-pending")],
  /ya es PASS/,
);

const withoutWaiver = applyReleaseGateWaivers({ gateResults: [pendingAaip] });
assert.equal(withoutWaiver[0].releaseDisposition, RELEASE_DISPOSITION.STOP);
assert.equal(withoutWaiver[0].evidenceStatus, EVIDENCE_STATUS.BLOCKED_EXTERNAL);
assert.equal(withoutWaiver[0].rawResult, RAW_RESULT.FAIL);

console.log(
  `Release gate policy: PASS (${RELEASE_GATE_POLICY.gates.length} gates; sha256 ${RELEASE_GATE_POLICY_SHA256}).`,
);

assert.equal(
  getReleaseGateDefinition("configuration.google-auth-disabled"),
  null,
);
const authProvidersGate = getReleaseGateDefinition(
  "configuration.auth-providers-aligned",
);
assert.equal(authProvidersGate.waiverPolicy, WAIVER_POLICY.NEVER);
assert.equal(
  OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(authProvidersGate.id),
  false,
);
assert.match(
  authProvidersGate.consequence,
  /destinos sin evidencia.*consentimiento versionado/,
);
