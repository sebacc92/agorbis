#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
} from "./release-gate-policy.mjs";
import {
  assertNonWaivableGateEvidenceCatalog,
  D72_CANDIDATE_IDENTITY_PREREQUISITES,
  getNonWaivableGateEvidenceDefinition,
  NON_WAIVABLE_EVIDENCE_EFFECT,
  NON_WAIVABLE_EVIDENCE_EXPECTED_RESULT,
  NON_WAIVABLE_EVIDENCE_SCOPE,
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
  NON_WAIVABLE_GATE_EVIDENCE_ENTRY_KEYS,
  NON_STATEFUL_GATE_IDS,
  STATEFUL_CANARY_REQUIRED_GATE_IDS,
  validateNonWaivableGateEvidenceCatalog,
} from "./non-waivable-gate-evidence-catalog.mjs";

const EXPECTED_SCOPE_BY_GATE = Object.freeze({
  "source.git-head-clean-and-recoverable": "mixed",
  "security.auth-functional": "remote",
  "operations.smtp-functional": "remote",
  "security.turnstile-a": "remote",
  "security.turnstile-b": "remote",
  "security.rls-enforced": "mixed",
  "security.private-storage": "mixed",
  "authorization.residency-write-boundary": "mixed",
  "privacy.no-individual-ballots": "mixed",
  "security.anti-abuse-limits": "mixed",
  "security.csp": "mixed",
  "security.cookies": "mixed",
  "security.secret-scan": "local",
  "security.worker-secrets-confidential": "mixed",
  "cloudflare.secret-inventory-exact": "remote",
  "database.expected-migrations-only": "mixed",
  "data.integrity-no-corruption": "mixed",
  "quality.build-and-test-suite": "local",
  "cloudflare.known-bindings-only": "mixed",
  "cloudflare.domain-config-exact": "mixed",
  "cloudflare.known-crons-only": "mixed",
  "network.production-dns-integrity": "mixed",
  "quality.production-smoke": "remote",
  "configuration.no-unknown-release-config": "mixed",
  "configuration.auth-providers-aligned": "mixed",
  "configuration.ai-disabled": "mixed",
  "legal.pending-external-copy-honest": "mixed",
});

assert.deepEqual(validateNonWaivableGateEvidenceCatalog([]), [
  "El catálogo debe contener exactamente 27 gates no renunciables.",
  "El catálogo debe cubrir exactamente los 27 gateId canónicos.",
]);
assert.deepEqual(
  validateNonWaivableGateEvidenceCatalog(NON_WAIVABLE_GATE_EVIDENCE_CATALOG),
  [],
);
assert.doesNotThrow(() =>
  assertNonWaivableGateEvidenceCatalog(NON_WAIVABLE_GATE_EVIDENCE_CATALOG),
);

assert.equal(NON_WAIVABLE_GATE_EVIDENCE_CATALOG.length, 27);
assert.deepEqual(
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG.map(({ gateId }) => gateId),
  NON_WAIVABLE_SECURITY_GATE_IDS,
);
assert.equal(
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG.some(({ gateId }) =>
    OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gateId),
  ),
  false,
);
assert.deepEqual(
  Object.keys(EXPECTED_SCOPE_BY_GATE),
  NON_WAIVABLE_SECURITY_GATE_IDS,
);

assert.equal(Object.isFrozen(NON_WAIVABLE_EVIDENCE_SCOPE), true);
assert.equal(Object.isFrozen(NON_WAIVABLE_EVIDENCE_EFFECT), true);
assert.equal(Object.isFrozen(NON_WAIVABLE_GATE_EVIDENCE_ENTRY_KEYS), true);
assert.equal(Object.isFrozen(STATEFUL_CANARY_REQUIRED_GATE_IDS), true);
assert.equal(Object.isFrozen(NON_STATEFUL_GATE_IDS), true);
assert.equal(Object.isFrozen(D72_CANDIDATE_IDENTITY_PREREQUISITES), true);
assert.equal(Object.isFrozen(NON_WAIVABLE_GATE_EVIDENCE_CATALOG), true);

for (const entry of NON_WAIVABLE_GATE_EVIDENCE_CATALOG) {
  assert.deepEqual(
    Object.keys(entry).sort(),
    NON_WAIVABLE_GATE_EVIDENCE_ENTRY_KEYS,
  );
  assert.equal(entry.scope, EXPECTED_SCOPE_BY_GATE[entry.gateId]);
  assert.equal(entry.expectedResult, NON_WAIVABLE_EVIDENCE_EXPECTED_RESULT);
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.sourceIds), true);
  assert.equal(Object.isFrozen(entry.prerequisites), true);
  assert.equal(Object.isFrozen(entry.sanitizedEvidence), true);
  assert.equal(
    entry.prerequisites.includes("d72.request-bound-to-current-head"),
    true,
  );
  assert.equal(
    entry.prerequisites.includes("d72.evidence-collected-in-current-run"),
    true,
  );
  for (const prerequisite of D72_CANDIDATE_IDENTITY_PREREQUISITES) {
    assert.equal(entry.prerequisites.includes(prerequisite), true);
  }
  assert.equal(entry.sourceIds.length > 0, true);
  assert.equal(entry.sanitizedEvidence.length > 0, true);
  assert.equal(typeof entry.PASS, "string");
  assert.equal(typeof entry.FAIL, "string");
  assert.equal(typeof entry.NOT_VERIFIED, "string");
  assert.notEqual(entry.PASS, entry.FAIL);
  assert.notEqual(entry.PASS, entry.NOT_VERIFIED);
  assert.notEqual(entry.FAIL, entry.NOT_VERIFIED);
  assert.equal(
    entry.canaryRequired,
    STATEFUL_CANARY_REQUIRED_GATE_IDS.includes(entry.gateId),
  );
  assert.equal(
    entry.effect,
    entry.canaryRequired
      ? NON_WAIVABLE_EVIDENCE_EFFECT.STATEFUL_CANARY
      : NON_WAIVABLE_EVIDENCE_EFFECT.READ_ONLY,
  );
  assert.equal(getNonWaivableGateEvidenceDefinition(entry.gateId), entry);
}

const gitSourceGate = getNonWaivableGateEvidenceDefinition(
  "source.git-head-clean-and-recoverable",
);
assert.equal(gitSourceGate.harness, "scripts/d72-git-current-state.mjs");
assert.equal(gitSourceGate.sourceIds.includes("git.remote-object-read"), true);

const closedSmokeGate = getNonWaivableGateEvidenceDefinition(
  "quality.production-smoke",
);
assert.equal(
  closedSmokeGate.sanitizedEvidence.includes("postDeniedCount"),
  true,
);
assert.equal(
  closedSmokeGate.sanitizedEvidence.includes("writeSucceededCount"),
  false,
);
assert.equal(
  closedSmokeGate.sanitizedEvidence.includes("postWriteStatus"),
  true,
);
assert.equal(
  closedSmokeGate.sourceIds.includes("production.closed-post-no-write"),
  true,
);

assert.deepEqual(
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG.filter(
    ({ canaryRequired }) => canaryRequired,
  ).map(({ gateId }) => gateId),
  STATEFUL_CANARY_REQUIRED_GATE_IDS,
);
assert.equal(NON_STATEFUL_GATE_IDS.length, 20);
assert.deepEqual(
  NON_STATEFUL_GATE_IDS,
  NON_WAIVABLE_SECURITY_GATE_IDS.filter(
    (gateId) => !STATEFUL_CANARY_REQUIRED_GATE_IDS.includes(gateId),
  ),
);
assert.deepEqual(
  STATEFUL_CANARY_REQUIRED_GATE_IDS,
  Object.freeze([
    "security.auth-functional",
    "operations.smtp-functional",
    "security.turnstile-a",
    "security.turnstile-b",
    "security.private-storage",
    "security.csp",
    "security.cookies",
  ]),
);
assert.equal(getNonWaivableGateEvidenceDefinition("legal.unknown"), null);

assert.throws(() => NON_WAIVABLE_GATE_EVIDENCE_CATALOG.push({}), TypeError);
assert.throws(() => {
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG[0].scope = "remote";
}, TypeError);
assert.throws(
  () => NON_WAIVABLE_GATE_EVIDENCE_CATALOG[0].sourceIds.push("git.other"),
  TypeError,
);

function changedCatalog(change) {
  const changed = structuredClone(NON_WAIVABLE_GATE_EVIDENCE_CATALOG);
  change(changed);
  return changed;
}

function assertInvalid(change, pattern) {
  const changed = changedCatalog(change);
  const errors = validateNonWaivableGateEvidenceCatalog(changed);
  assert.notEqual(errors.length, 0);
  assert.match(errors.join("\n"), pattern);
  assert.throws(
    () => assertNonWaivableGateEvidenceCatalog(changed),
    /Catálogo NON_WAIVABLE inválido/,
  );
}

assertInvalid((catalog) => catalog.pop(), /exactamente 27/);
assertInvalid((catalog) => {
  catalog[0].unexpected = true;
}, /esquema cerrado/);
assertInvalid((catalog) => {
  delete catalog[0].PASS;
}, /esquema cerrado|PASS/);
assertInvalid((catalog) => {
  [catalog[0], catalog[1]] = [catalog[1], catalog[0]];
}, /orden canónico|27 gateId canónicos/);
assertInvalid((catalog) => {
  catalog[0].gateId = OWNER_WAIVER_CANDIDATE_GATE_IDS[0];
}, /orden canónico|27 gateId canónicos/);
assertInvalid((catalog) => {
  catalog[0].scope = "historical";
}, /local, remote o mixed/);
assertInvalid((catalog) => {
  catalog[0].effect = "write";
}, /read_only o stateful_canary/);
assertInvalid((catalog) => {
  catalog[0].expectedResult = "NOT_VERIFIED";
}, /expectedResult debe ser PASS/);
assertInvalid((catalog) => {
  catalog[0].canaryRequired = true;
}, /canaryRequired contradice/);
assertInvalid((catalog) => {
  catalog[1].effect = "read_only";
}, /effect contradice/);
assertInvalid((catalog) => {
  catalog[0].sourceIds = [];
}, /sourceIds debe ser un array no vacío/);
assertInvalid((catalog) => {
  catalog[0].sourceIds.push(catalog[0].sourceIds[0]);
}, /sourceIds no admite duplicados/);
assertInvalid((catalog) => {
  catalog[0].prerequisites = catalog[0].prerequisites.filter(
    (value) => value !== "d72.evidence-collected-in-current-run",
  );
}, /evidencia histórica/);
assertInvalid((catalog) => {
  catalog[0].prerequisites = catalog[0].prerequisites.filter(
    (value) => value !== "d72.candidate-identity-created-before-evidence",
  );
}, /candidate identity|evidencia histórica/);
assertInvalid((catalog) => {
  catalog[0].NOT_VERIFIED = catalog[0].FAIL;
}, /distinguir PASS, FAIL y NOT_VERIFIED/);
assertInvalid((catalog) => {
  catalog[1].commandLabel = catalog[0].commandLabel;
}, /commandLabel único/);

console.log(
  "Catálogo formal de evidencia NON_WAIVABLE D72 27/27: PASS (esquema cerrado, frescura e inmutabilidad).",
);

const authProviders = getNonWaivableGateEvidenceDefinition(
  "configuration.auth-providers-aligned",
);
assert.equal(
  authProviders.sourceIds.includes("repository.social-auth-consent-snapshot"),
  true,
);
assert.equal(
  authProviders.sourceIds.includes(
    "repository.social-auth-processing-evidence",
  ),
  true,
);
assert.match(
  authProviders.PASS,
  /Google activo, Facebook apagado y correo disponible/,
);
assert.match(authProviders.FAIL, /Ningún waiver/);
