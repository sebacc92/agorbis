#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  D72_STATEFUL_CANARY_AUTHORIZATION_SCHEMA_VERSION,
  D72_STATEFUL_CANARY_AUTHORIZATION_SOURCE,
  D72_STATEFUL_CANARY_CAPABILITY_ALGORITHM,
  D72_STATEFUL_CANARY_CHECKS,
  D72_STATEFUL_CANARY_CHECK_IDS,
  D72_STATEFUL_CANARY_DISPOSITION,
  D72_STATEFUL_CANARY_MANIFEST_SCHEMA_VERSION,
  D72_STATEFUL_CANARY_REPORT_SCHEMA_VERSION,
  D72_STATEFUL_CANARY_SCOPE,
  D72_STATEFUL_CANARY_STATUS,
  D72_STATEFUL_CANARY_VALIDITY_MS,
  d72StatefulCanaryChecksForRelease,
  canonicalD72StatefulCanaryJson,
  createD72StatefulCanaryAuthorization,
  createD72StatefulCanaryManifest,
  createD72StatefulCanaryReport,
  d72StatefulCanaryAuthorizationHash,
  d72StatefulCanaryAuthorizationPhrase,
  d72StatefulCanaryContinuationBlockers,
  d72StatefulCanaryExecutionBlockers,
  d72StatefulCanaryForbiddenEvidenceFieldNames,
  d72StatefulCanaryManifestHash,
  d72StatefulCanaryReportHash,
  validateD72StatefulCanaryAuthorization,
  validateD72StatefulCanaryEvidenceSanitization,
  validateD72StatefulCanaryManifest,
  validateD72StatefulCanaryReport,
} from "./d72-stateful-canary-policy.mjs";
import {
  authorizeD72CanaryRequest,
  d72CanaryAuthorizedHeaders,
  d72CanaryCapabilityBindingHash,
  d72CanaryStatefulAuthorizationPhrase,
} from "./d72-canary-policy.mjs";
import {
  AUTHORIZED_RISK_OWNER,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

assert.equal(
  process.versions.node,
  "22.22.0",
  "Este test exige exactamente Node 22.22.0.",
);

const HEAD = "90535d7d1877dd74bf758e67586bd8587cd79bce";
const REQUEST_HASH = "a".repeat(64);
const ARTIFACT_HASH = "b".repeat(64);
const CANARY_ID = "d72-stateful-90535d7d";
const CANARY_VERSION_ID = "12345678-1234-4234-9234-123456789abc";
const CREATED_AT = "2026-08-31T12:00:00.000Z";
const CAPABILITY_EXPIRES_AT = "2026-08-31T12:20:00.000Z";
const CAPABILITY_NONCE = "9".repeat(64);
const AUTHORIZED_AT = "2026-08-31T12:01:00.000Z";
const STARTED_AT = "2026-08-31T12:02:00.000Z";
const OBSERVED_AT = "2026-08-31T12:03:00.000Z";
const COMPLETED_AT = "2026-08-31T12:04:00.000Z";
const CONTINUED_AT = "2026-08-31T12:05:00.000Z";
const MANIFEST_EXPIRES_AT = "2026-08-31T13:00:00.000Z";
const EXISTING_CRON_SECRET = [
  "fake",
  "existing",
  "cron",
  "secret",
  "unit",
  "test",
  "only",
].join("-");
const DIFFERENT_CRON_SECRET = [
  "different",
  "existing",
  "cron",
  "secret",
  "unit",
  "test",
  "only",
].join("-");

const EXPECTED_BINDINGS = Object.freeze({
  head: HEAD,
  requestHash: REQUEST_HASH,
  policyHash: RELEASE_GATE_POLICY_SHA256,
  artifactHash: ARTIFACT_HASH,
  canaryVersionId: CANARY_VERSION_ID,
});

const EXPECTED_CHECK_IDS = Object.freeze([
  "canary.version-override-capability",
  "auth.account-lifecycle",
  "smtp.delivery",
  "turnstile.a",
  "turnstile.b",
  "auth.pkce",
  "security.cookies",
  "auth.mfa-totp",
  "storage.private-proxy",
  "database.rls",
  "authorization.residency",
  "participation.lifecycle",
  "cleanup.canary-account",
]);

function clone(value) {
  return structuredClone(value);
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function rehash(record) {
  const copy = clone(record);
  delete copy.contentSha256;
  return {
    ...copy,
    contentSha256: sha256(canonicalD72StatefulCanaryJson(copy)),
  };
}

function assertError(errors, pattern) {
  assert.ok(
    errors.some((error) => pattern.test(error)),
    errors.join("\n"),
  );
}

function capabilityBinding(overrides = {}) {
  return {
    head: HEAD,
    requestHash: REQUEST_HASH,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    artifactHash: ARTIFACT_HASH,
    canaryVersionId: CANARY_VERSION_ID,
    issuedAtUtc: CREATED_AT,
    expiresAtUtc: CAPABILITY_EXPIRES_AT,
    nonce: CAPABILITY_NONCE,
    ...overrides,
  };
}

function createFixtureCapability({ existingSecret, ...binding } = {}) {
  const payload = {
    artifactHash: binding.artifactHash,
    expiresAtUtc: binding.expiresAtUtc,
    head: binding.head,
    issuedAtUtc: binding.issuedAtUtc,
    nonce: binding.nonce,
    policyHash: binding.policyHash,
    requestHash: binding.requestHash,
    schemaVersion: "agorbis-d72-canary-capability/v1",
    versionId: binding.canaryVersionId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", existingSecret)
    .update(`${payload.schemaVersion}\0${encodedPayload}`, "utf8")
    .digest("base64url");
  return `v1.${encodedPayload}.${signature}`;
}

function makeFailingEvidence(
  checkIndex,
  status = D72_STATEFUL_CANARY_STATUS.FAIL,
) {
  const evidence = clone(passingEvidence);
  const definition = D72_STATEFUL_CANARY_CHECKS[checkIndex];
  const [factKey, passingValue] = Object.entries(definition.passingFacts)[0];
  evidence[checkIndex].status = status;
  evidence[checkIndex].facts[factKey] = !passingValue;
  return evidence;
}

function allKeys(value, result = []) {
  if (Array.isArray(value)) {
    for (const child of value) allKeys(child, result);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      result.push(key);
      allKeys(child, result);
    }
  }
  return result;
}

assert.deepEqual(D72_STATEFUL_CANARY_CHECK_IDS, EXPECTED_CHECK_IDS);
assert.equal(new Set(D72_STATEFUL_CANARY_CHECK_IDS).size, 13);
assert.equal(D72_STATEFUL_CANARY_VALIDITY_MS, 60 * 60 * 1_000);
assert.equal(D72_STATEFUL_CANARY_AUTHORIZATION_SOURCE, "/dev/tty");
assert.equal(D72_STATEFUL_CANARY_SCOPE, "D72_STATEFUL_CANARY_ONLY");
assert.equal(D72_STATEFUL_CANARY_CAPABILITY_ALGORITHM, "HMAC-SHA256");

const checksById = Object.fromEntries(
  D72_STATEFUL_CANARY_CHECKS.map(({ id, passingFacts }) => [id, passingFacts]),
);
assert.deepEqual(checksById["auth.account-lifecycle"], {
  registrationCompleted: true,
  emailConfirmed: true,
  loginCompleted: true,
  recoveryCompleted: true,
});
assert.deepEqual(checksById["smtp.delivery"], {
  confirmationDelivered: true,
  recoveryDelivered: true,
  deliveryEvidenceRedacted: true,
});
assert.deepEqual(checksById["turnstile.a"], {
  actionMatched: true,
  freshResponseConsumed: true,
  hostnameMatched: true,
  legitimateChallengeAccepted: true,
  replayRejected: true,
  sensitiveResponseRetained: false,
  siteverifySucceeded: true,
});
assert.deepEqual(checksById["turnstile.b"], {
  aResponseReused: false,
  captchaFailureClassMatched: true,
  directAuthWithoutCaptchaRejected: true,
  invalidCaptchaRejected: true,
  sessionCreated: false,
});
assert.deepEqual(checksById["auth.pkce"], {
  codeExchangeCompleted: true,
  exactRedirectObserved: true,
  missingOrReplayRejected: true,
  providerTokensAbsent: true,
});
assert.deepEqual(checksById["security.cookies"], {
  httpOnly: true,
  providerTokensAbsent: true,
  sameSiteLax: true,
  secure: true,
});
assert.deepEqual(checksById["auth.mfa-totp"], {
  aal2Observed: true,
  enrollmentAvailable: true,
  totpChallengeVerified: true,
  totpSeedRetained: false,
});
assert.deepEqual(checksById["storage.private-proxy"], {
  authorizedUploadCompleted: true,
  bucketPrivate: true,
  crossUserReadRejected: true,
  privatePathUsed: true,
  proxyReadAuthorized: true,
  unauthenticatedReadRejected: true,
});
assert.deepEqual(checksById["database.rls"], {
  authorizedScopeAllowed: true,
  unauthorizedReadRejected: true,
  unauthorizedWriteRejected: true,
});
assert.deepEqual(checksById["authorization.residency"], {
  inBoundaryWriteAllowed: true,
  outOfBoundaryWriteRejected: true,
});
assert.deepEqual(checksById["participation.lifecycle"], {
  aggregateVoteRecorded: true,
  commentCreated: true,
  individualBallotAbsent: true,
  publicationCreated: true,
  supportCreated: true,
});
assert.deepEqual(checksById["cleanup.canary-account"], {
  authIdentityDeleted: true,
  civicFixturesDeleted: true,
  profileDeleted: true,
  sessionsRevoked: true,
  storageObjectsDeleted: true,
});

const canaryCapability = createFixtureCapability({
  existingSecret: EXISTING_CRON_SECRET,
  ...capabilityBinding(),
});
const manifest = createD72StatefulCanaryManifest({
  head: HEAD,
  requestHash: REQUEST_HASH,
  artifactHash: ARTIFACT_HASH,
  canaryId: CANARY_ID,
  canaryVersionId: CANARY_VERSION_ID,
  canaryCapability,
  canaryCapabilityIssuedAtUtc: CREATED_AT,
  canaryCapabilityExpiresAtUtc: CAPABILITY_EXPIRES_AT,
  canaryCapabilityNonce: CAPABILITY_NONCE,
  existingSecret: EXISTING_CRON_SECRET,
  now: CREATED_AT,
});
assert.equal(
  manifest.schemaVersion,
  D72_STATEFUL_CANARY_MANIFEST_SCHEMA_VERSION,
);
assert.equal(manifest.policyVersion, RELEASE_GATE_POLICY_VERSION);
assert.equal(manifest.policyHash, RELEASE_GATE_POLICY_SHA256);
assert.equal(manifest.canaryId, CANARY_ID);
assert.equal(manifest.createdAtUtc, CREATED_AT);
assert.equal(manifest.expiresAtUtc, MANIFEST_EXPIRES_AT);
assert.equal(manifest.authorizationRequired, true);
assert.equal(manifest.statefulCanaryAuthorized, false);
assert.equal(manifest.deploymentAuthorized, false);
assert.equal(
  manifest.capability.algorithm,
  D72_STATEFUL_CANARY_CAPABILITY_ALGORITHM,
);
assert.equal(manifest.capability.issuedAtUtc, CREATED_AT);
assert.equal(manifest.capability.expiresAtUtc, CAPABILITY_EXPIRES_AT);
assert.equal(manifest.capability.scope, D72_STATEFUL_CANARY_SCOPE);
assert.equal(manifest.capability.versionOverrideRequired, true);
assert.equal(manifest.capability.tokenStored, false);
assert.equal(manifest.capability.rawHeaderStored, false);
assert.equal(
  manifest.capability.bindingHash,
  d72CanaryCapabilityBindingHash(capabilityBinding()),
);
assert.equal(manifest.capability.capabilityId, sha256(canaryCapability));
assert.equal(manifest.contentSha256, d72StatefulCanaryManifestHash(manifest));
assert.deepEqual(
  validateD72StatefulCanaryManifest(manifest, {
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
  }),
  [],
);
assert.ok(Object.isFrozen(manifest));
assert.ok(Object.isFrozen(manifest.capability));
assert.ok(Object.isFrozen(manifest.checks));

const deterministicManifest = createD72StatefulCanaryManifest({
  head: HEAD,
  requestHash: REQUEST_HASH,
  artifactHash: ARTIFACT_HASH,
  canaryId: CANARY_ID,
  canaryVersionId: CANARY_VERSION_ID,
  canaryCapability,
  canaryCapabilityIssuedAtUtc: CREATED_AT,
  canaryCapabilityExpiresAtUtc: CAPABILITY_EXPIRES_AT,
  canaryCapabilityNonce: CAPABILITY_NONCE,
  existingSecret: EXISTING_CRON_SECRET,
  now: CREATED_AT,
});
assert.deepEqual(deterministicManifest, manifest);

const capabilityWithDifferentSecret = createFixtureCapability({
  existingSecret: DIFFERENT_CRON_SECRET,
  ...capabilityBinding(),
});
const manifestWithDifferentSecret = createD72StatefulCanaryManifest({
  head: HEAD,
  requestHash: REQUEST_HASH,
  artifactHash: ARTIFACT_HASH,
  canaryId: CANARY_ID,
  canaryVersionId: CANARY_VERSION_ID,
  canaryCapability: capabilityWithDifferentSecret,
  canaryCapabilityIssuedAtUtc: CREATED_AT,
  canaryCapabilityExpiresAtUtc: CAPABILITY_EXPIRES_AT,
  canaryCapabilityNonce: CAPABILITY_NONCE,
  existingSecret: DIFFERENT_CRON_SECRET,
  now: CREATED_AT,
});
assert.equal(
  manifestWithDifferentSecret.capability.bindingHash,
  manifest.capability.bindingHash,
);
assert.notEqual(
  manifestWithDifferentSecret.capability.capabilityId,
  manifest.capability.capabilityId,
);
assert.notEqual(
  manifestWithDifferentSecret.contentSha256,
  manifest.contentSha256,
);

for (const [binding, differentValue] of Object.entries({
  head: "f".repeat(40),
  requestHash: "c".repeat(64),
  policyHash: "d".repeat(64),
  artifactHash: "e".repeat(64),
  canaryVersionId: "87654321-4321-4321-8321-cba987654321",
  expiresAtUtc: "2026-08-31T12:19:00.000Z",
})) {
  const changedCapability = createFixtureCapability({
    existingSecret: EXISTING_CRON_SECRET,
    ...capabilityBinding({ [binding]: differentValue }),
  });
  assert.notEqual(
    sha256(changedCapability),
    manifest.capability.capabilityId,
    `La capability debe quedar ligada a ${binding}.`,
  );
  assert.notEqual(
    d72CanaryCapabilityBindingHash(
      capabilityBinding({ [binding]: differentValue }),
    ),
    manifest.capability.bindingHash,
    `El bindingHash debe quedar ligado a ${binding}.`,
  );
}

const manifestJson = canonicalD72StatefulCanaryJson(manifest);
assert.equal(manifestJson.includes(canaryCapability), false);
assert.equal(manifestJson.includes(EXISTING_CRON_SECRET), false);
assert.equal(manifestJson.includes(CAPABILITY_NONCE), false);
for (const forbiddenKey of [
  "canaryCapability",
  "existingSecret",
  "nonce",
  "key",
  "secret",
  "token",
  "proof",
  "header",
  "versionOverrideHeader",
]) {
  assert.equal(allKeys(manifest).includes(forbiddenKey), false);
}

assert.throws(
  () =>
    createD72StatefulCanaryManifest({
      head: HEAD,
      requestHash: REQUEST_HASH,
      artifactHash: ARTIFACT_HASH,
      canaryId: CANARY_ID,
      canaryVersionId: CANARY_VERSION_ID,
      canaryCapability,
      canaryCapabilityIssuedAtUtc: CREATED_AT,
      canaryCapabilityExpiresAtUtc: CAPABILITY_EXPIRES_AT,
      canaryCapabilityNonce: CAPABILITY_NONCE,
      existingSecret: DIFFERENT_CRON_SECRET,
      now: CREATED_AT,
    }),
  /capability HMAC compartida/i,
);
assertError(
  d72StatefulCanaryExecutionBlockers({
    manifest,
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
    authorizationConsumed: false,
  }),
  /capability efímera|HMAC compartida/i,
);

const canaryUrl = "https://agorbis.com/__d72-stateful-canary";
const authorizedHeaders = d72CanaryAuthorizedHeaders(
  canaryUrl,
  CANARY_VERSION_ID,
  canaryCapability,
);
const runtimeAuthorization = authorizeD72CanaryRequest({
  url: canaryUrl,
  headers: authorizedHeaders,
  existingSecret: EXISTING_CRON_SECRET,
  now: STARTED_AT,
  ...capabilityBinding(),
});
assert.equal(runtimeAuthorization.authorized, true);
assert.deepEqual(runtimeAuthorization.forwardHeaders, {});

const authorizationStatement = d72StatefulCanaryAuthorizationPhrase(manifest);
assert.equal(
  authorizationStatement,
  d72CanaryStatefulAuthorizationPhrase({
    head: HEAD,
    canaryId: CANARY_ID,
    statefulManifestHash: manifest.contentSha256,
  }),
);
assert.equal(
  authorizationStatement,
  `AUTORIZO EJECUTAR EL MANIFIESTO STATEFUL D72 ${manifest.contentSha256} EN PRODUCCIÓN PARA ${HEAD} CON CANARY ${CANARY_ID} Y SU LIMPIEZA CONTROLADA`,
);
const authorization = createD72StatefulCanaryAuthorization({
  manifest,
  statement: authorizationStatement,
  now: AUTHORIZED_AT,
});
assert.equal(
  authorization.schemaVersion,
  D72_STATEFUL_CANARY_AUTHORIZATION_SCHEMA_VERSION,
);
assert.equal(authorization.authorizedBy, AUTHORIZED_RISK_OWNER);
assert.equal(authorization.authorizationSource, "/dev/tty");
assert.equal(authorization.scope, D72_STATEFUL_CANARY_SCOPE);
assert.equal(authorization.canaryId, CANARY_ID);
assert.equal(authorization.singleUse, true);
assert.equal(authorization.statefulCanaryAuthorized, true);
assert.equal(authorization.deploymentAuthorized, false);
assert.equal(authorization.manifestHash, manifest.contentSha256);
assert.match(authorization.statementSha256, /^[0-9a-f]{64}$/);
assert.equal(Object.hasOwn(authorization, "statement"), false);
assert.equal(
  canonicalD72StatefulCanaryJson(authorization).includes(
    authorizationStatement,
  ),
  false,
);
assert.equal(
  authorization.contentSha256,
  d72StatefulCanaryAuthorizationHash(authorization),
);
assert.equal(manifest.statefulCanaryAuthorized, false);
assert.equal(manifest.deploymentAuthorized, false);
assert.deepEqual(
  validateD72StatefulCanaryAuthorization(authorization, {
    manifest,
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
    authorizationConsumed: false,
  }),
  [],
);
assert.deepEqual(
  d72StatefulCanaryExecutionBlockers({
    manifest,
    authorization,
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
    authorizationConsumed: false,
    canaryCapability,
    canaryCapabilityNonce: CAPABILITY_NONCE,
    existingSecret: EXISTING_CRON_SECRET,
  }),
  [],
);
assertError(
  d72StatefulCanaryExecutionBlockers({
    manifest,
    authorization,
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
    authorizationConsumed: false,
    canaryCapability,
    canaryCapabilityNonce: CAPABILITY_NONCE,
    existingSecret: DIFFERENT_CRON_SECRET,
  }),
  /HMAC compartida/,
);
assertError(
  d72StatefulCanaryExecutionBlockers({
    manifest,
    authorization,
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
    authorizationConsumed: false,
    canaryCapability,
    canaryCapabilityNonce: "8".repeat(64),
    existingSecret: EXISTING_CRON_SECRET,
  }),
  /bindingHash|HMAC compartida/,
);
assertError(
  d72StatefulCanaryExecutionBlockers({
    manifest,
    authorization,
    expectedBindings: EXPECTED_BINDINGS,
    now: CAPABILITY_EXPIRES_AT,
    authorizationConsumed: false,
    canaryCapability,
    canaryCapabilityNonce: CAPABILITY_NONCE,
    existingSecret: EXISTING_CRON_SECRET,
  }),
  /vencida/,
);

for (const [binding, differentValue] of Object.entries({
  head: "f".repeat(40),
  requestHash: "c".repeat(64),
  policyHash: "d".repeat(64),
  artifactHash: "e".repeat(64),
  canaryVersionId: "87654321-4321-4321-8321-cba987654321",
})) {
  const tamperedAuthorization = clone(authorization);
  tamperedAuthorization[binding] = differentValue;
  const errors = validateD72StatefulCanaryAuthorization(
    rehash(tamperedAuthorization),
    {
      manifest,
      expectedBindings: EXPECTED_BINDINGS,
      now: STARTED_AT,
      authorizationConsumed: false,
    },
  );
  assertError(errors, new RegExp(binding));
}

for (const [field, value, pattern] of [
  ["authorizedBy", "Otra Persona", /identidad|scope/],
  ["authorizationSource", "stdin", /identidad|scope/],
  ["scope", "DEPLOY_OPEN", /identidad|scope/],
  ["singleUse", false, /identidad|scope/],
  ["deploymentAuthorized", true, /identidad|scope/],
  ["statementSha256", "c".repeat(64), /literal/],
]) {
  const changed = clone(authorization);
  changed[field] = value;
  assertError(
    validateD72StatefulCanaryAuthorization(rehash(changed), {
      manifest,
      now: STARTED_AT,
      authorizationConsumed: false,
    }),
    pattern,
  );
}

const authorizationBeforeManifest = clone(authorization);
authorizationBeforeManifest.authorizedAtUtc = "2026-08-31T11:59:59.999Z";
assertError(
  validateD72StatefulCanaryAuthorization(rehash(authorizationBeforeManifest), {
    manifest,
    now: CREATED_AT,
    authorizationConsumed: false,
  }),
  /precede/,
);
assertError(
  validateD72StatefulCanaryAuthorization(authorization, {
    manifest,
    now: STARTED_AT,
    authorizationConsumed: true,
  }),
  /consumida/,
);
assertError(
  validateD72StatefulCanaryAuthorization(authorization, {
    manifest,
    now: STARTED_AT,
  }),
  /consumida|incierto/,
);
assertError(
  validateD72StatefulCanaryAuthorization(authorization, {
    manifest,
    now: MANIFEST_EXPIRES_AT,
    authorizationConsumed: false,
  }),
  /vencida/,
);
const authorizationHashTampered = clone(authorization);
authorizationHashTampered.statementSha256 = "c".repeat(64);
assertError(
  validateD72StatefulCanaryAuthorization(authorizationHashTampered, {
    manifest,
    now: STARTED_AT,
    authorizationConsumed: false,
  }),
  /contentSha256/,
);

const passingEvidence = Object.freeze(
  D72_STATEFUL_CANARY_CHECKS.map(({ id, passingFacts }) =>
    Object.freeze({
      checkId: id,
      status: D72_STATEFUL_CANARY_STATUS.PASS,
      observedAtUtc: OBSERVED_AT,
      facts: Object.freeze({ ...passingFacts }),
    }),
  ),
);
assert.deepEqual(
  validateD72StatefulCanaryEvidenceSanitization(passingEvidence),
  [],
);
assert.ok(Object.isFrozen(passingEvidence));
assert.ok(Object.isFrozen(passingEvidence[0].facts));
for (const item of passingEvidence) {
  assert.equal(item.status, D72_STATEFUL_CANARY_STATUS.PASS);
  for (const value of Object.values(item.facts)) {
    assert.ok(value === true || value === false || value === null);
  }
}

const report = createD72StatefulCanaryReport({
  manifest,
  authorization,
  evidence: passingEvidence,
  startedAtUtc: STARTED_AT,
  completedAtUtc: COMPLETED_AT,
});
assert.equal(report.schemaVersion, D72_STATEFUL_CANARY_REPORT_SCHEMA_VERSION);
assert.equal(report.statefulCanaryPassed, true);
assert.equal(
  report.releaseDisposition,
  D72_STATEFUL_CANARY_DISPOSITION.CONTINUE,
);
assert.equal(report.deploymentAuthorized, false);
assert.equal(report.contentSha256, d72StatefulCanaryReportHash(report));
assert.deepEqual(
  validateD72StatefulCanaryReport(report, {
    manifest,
    authorization,
    expectedBindings: EXPECTED_BINDINGS,
  }),
  [],
);
assert.deepEqual(
  d72StatefulCanaryContinuationBlockers({
    manifest,
    authorization,
    report,
    expectedBindings: EXPECTED_BINDINGS,
    now: CONTINUED_AT,
    authorizationConsumed: true,
  }),
  [],
);
assertError(
  d72StatefulCanaryContinuationBlockers({
    manifest,
    authorization,
    report,
    expectedBindings: EXPECTED_BINDINGS,
    now: CONTINUED_AT,
    authorizationConsumed: false,
  }),
  /single-use/,
);
assertError(
  d72StatefulCanaryContinuationBlockers({
    manifest,
    authorization,
    report,
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
    authorizationConsumed: true,
  }),
  /precede a la finalización/,
);
assertError(
  d72StatefulCanaryContinuationBlockers({
    manifest,
    authorization,
    report,
    expectedBindings: EXPECTED_BINDINGS,
    now: MANIFEST_EXPIRES_AT,
    authorizationConsumed: true,
  }),
  /vencid/,
);

for (let index = 0; index < D72_STATEFUL_CANARY_CHECKS.length; index += 1) {
  const failedReport = createD72StatefulCanaryReport({
    manifest,
    authorization,
    evidence: makeFailingEvidence(index),
    startedAtUtc: STARTED_AT,
    completedAtUtc: COMPLETED_AT,
  });
  assert.equal(failedReport.statefulCanaryPassed, false);
  assert.equal(
    failedReport.releaseDisposition,
    D72_STATEFUL_CANARY_DISPOSITION.ROLLBACK_CLOSED,
  );
  assertError(
    d72StatefulCanaryContinuationBlockers({
      manifest,
      authorization,
      report: failedReport,
      expectedBindings: EXPECTED_BINDINGS,
      now: CONTINUED_AT,
      authorizationConsumed: true,
    }),
    /rollback CLOSED/,
  );
}

const notVerifiedReport = createD72StatefulCanaryReport({
  manifest,
  authorization,
  evidence: makeFailingEvidence(
    D72_STATEFUL_CANARY_CHECK_IDS.indexOf("cleanup.canary-account"),
    D72_STATEFUL_CANARY_STATUS.NOT_VERIFIED,
  ),
  startedAtUtc: STARTED_AT,
  completedAtUtc: COMPLETED_AT,
});
assert.equal(notVerifiedReport.statefulCanaryPassed, false);
assert.equal(
  notVerifiedReport.releaseDisposition,
  D72_STATEFUL_CANARY_DISPOSITION.ROLLBACK_CLOSED,
);

const passWithFalseFact = clone(passingEvidence);
passWithFalseFact[0].facts.capabilityHashMatched = false;
assertError(
  validateD72StatefulCanaryEvidenceSanitization(passWithFalseFact),
  /PASS sin/,
);
const failWithPassingFacts = clone(passingEvidence);
failWithPassingFacts[0].status = D72_STATEFUL_CANARY_STATUS.FAIL;
assertError(
  validateD72StatefulCanaryEvidenceSanitization(failWithPassingFacts),
  /contradice/,
);
const unknownStatus = clone(passingEvidence);
unknownStatus[0].status = "SKIPPED";
assertError(
  validateD72StatefulCanaryEvidenceSanitization(unknownStatus),
  /status desconocido/,
);
assertError(
  validateD72StatefulCanaryEvidenceSanitization(passingEvidence.slice(0, -1)),
  /exactamente todos/,
);
const duplicatedEvidence = clone(passingEvidence);
duplicatedEvidence[1] = clone(duplicatedEvidence[0]);
assertError(
  validateD72StatefulCanaryEvidenceSanitization(duplicatedEvidence),
  /duplicados/,
);
const reorderedEvidence = clone(passingEvidence);
[reorderedEvidence[0], reorderedEvidence[1]] = [
  reorderedEvidence[1],
  reorderedEvidence[0],
];
assertError(
  validateD72StatefulCanaryEvidenceSanitization(reorderedEvidence),
  /fuera de orden/,
);

const forbiddenEvidenceFieldNames =
  d72StatefulCanaryForbiddenEvidenceFieldNames();
assert.deepEqual(forbiddenEvidenceFieldNames, [
  "email",
  "cookies",
  "url",
  "token",
  "otp",
  "totpSeed",
  "userId",
  "storageKey",
  "rawResponse",
]);
for (const forbiddenField of forbiddenEvidenceFieldNames) {
  const unsafeEvidence = clone(passingEvidence);
  unsafeEvidence[0].facts[forbiddenField] = "sensitive-value";
  assertError(
    validateD72StatefulCanaryEvidenceSanitization(unsafeEvidence),
    new RegExp(forbiddenField, "i"),
  );
}
const unsafeEvidenceItem = clone(passingEvidence);
unsafeEvidenceItem[0].rawResponse = "provider-response";
assertError(
  validateD72StatefulCanaryEvidenceSanitization(unsafeEvidenceItem),
  /rawResponse/,
);
const rawValueInAllowedFact = clone(passingEvidence);
rawValueInAllowedFact[0].facts.capabilityHashMatched = "person@example.test";
assertError(
  validateD72StatefulCanaryEvidenceSanitization(rawValueInAllowedFact),
  /boolean\/null/,
);

for (const record of [manifest, authorization, report]) {
  const serialized = canonicalD72StatefulCanaryJson(record);
  for (const sentinel of [
    "person@example.test",
    "session-cookie-value",
    "https://sensitive.example.test/path",
    "provider-token-value",
    "OTP-VALUE-839201",
    "TOTP-SEED-VALUE",
    "auth-user-id-value",
    "private/storage/key",
    "provider-raw-response",
  ]) {
    assert.equal(serialized.includes(sentinel), false);
  }
}

for (const [binding, differentValue] of Object.entries({
  head: "f".repeat(40),
  requestHash: "c".repeat(64),
  policyHash: "d".repeat(64),
  artifactHash: "e".repeat(64),
  canaryVersionId: "87654321-4321-4321-8321-cba987654321",
})) {
  const tamperedReport = clone(report);
  tamperedReport[binding] = differentValue;
  assertError(
    validateD72StatefulCanaryReport(rehash(tamperedReport), {
      manifest,
      authorization,
      expectedBindings: EXPECTED_BINDINGS,
    }),
    new RegExp(binding),
  );
}

const reportWithDeploymentAuthorization = clone(report);
reportWithDeploymentAuthorization.deploymentAuthorized = true;
assertError(
  validateD72StatefulCanaryReport(rehash(reportWithDeploymentAuthorization), {
    manifest,
    authorization,
  }),
  /nunca autoriza/,
);
const reportWithUnknownField = clone(report);
reportWithUnknownField.rawResponse = "forbidden";
assertError(
  validateD72StatefulCanaryReport(reportWithUnknownField, {
    manifest,
    authorization,
  }),
  /claves desconocidas/,
);
const reportWithTamperedContent = clone(report);
reportWithTamperedContent.completedAtUtc = "2026-08-31T12:05:00.000Z";
assertError(
  validateD72StatefulCanaryReport(reportWithTamperedContent, {
    manifest,
    authorization,
  }),
  /contentSha256/,
);
const reportBeforeAuthorization = clone(report);
reportBeforeAuthorization.startedAtUtc = CREATED_AT;
assertError(
  validateD72StatefulCanaryReport(rehash(reportBeforeAuthorization), {
    manifest,
    authorization,
  }),
  /antes de la autorización/,
);
const reportAfterExpiry = clone(report);
reportAfterExpiry.completedAtUtc = CAPABILITY_EXPIRES_AT;
for (const item of reportAfterExpiry.evidence) item.observedAtUtc = STARTED_AT;
assertError(
  validateD72StatefulCanaryReport(rehash(reportAfterExpiry), {
    manifest,
    authorization,
  }),
  /vencer/,
);
const observationOutsideWindow = clone(report);
observationOutsideWindow.evidence[0].observedAtUtc = CREATED_AT;
assertError(
  validateD72StatefulCanaryReport(rehash(observationOutsideWindow), {
    manifest,
    authorization,
  }),
  /fuera de la ejecución/,
);

const manifestAuthorizedDirectly = clone(manifest);
manifestAuthorizedDirectly.statefulCanaryAuthorized = true;
assertError(
  validateD72StatefulCanaryManifest(rehash(manifestAuthorizedDirectly), {
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
  }),
  /no puede autorizar/,
);
const manifestWithOtherPolicy = clone(manifest);
manifestWithOtherPolicy.policyHash = "d".repeat(64);
assertError(
  validateD72StatefulCanaryManifest(rehash(manifestWithOtherPolicy), {
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
  }),
  /política D72 distinta/,
);
const manifestWithUnknownField = clone(manifest);
manifestWithUnknownField.secret = "forbidden";
assertError(
  validateD72StatefulCanaryManifest(manifestWithUnknownField, {
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
  }),
  /claves desconocidas/,
);
const manifestWithTamperedHash = clone(manifest);
manifestWithTamperedHash.artifactHash = "e".repeat(64);
assertError(
  validateD72StatefulCanaryManifest(manifestWithTamperedHash, {
    expectedBindings: EXPECTED_BINDINGS,
    now: STARTED_AT,
  }),
  /contentSha256/,
);
assertError(
  validateD72StatefulCanaryManifest(manifest, {
    expectedBindings: { ...EXPECTED_BINDINGS, extra: "forbidden" },
    now: STARTED_AT,
  }),
  /exactamente los cinco bindings/,
);
const malformedManifest = clone(manifest);
malformedManifest.requestHash = 1n;
let malformedErrors;
assert.doesNotThrow(() => {
  malformedErrors = validateD72StatefulCanaryManifest(malformedManifest, {
    now: STARTED_AT,
  });
});
assert.ok(malformedErrors.length > 0);

assert.equal(
  allKeys(manifest).some((key) => key === "workerSecret" || key === "binding"),
  false,
  "La capability efímera no introduce bindings ni secrets persistentes.",
);

const openProfile = {
  releaseMode: "OPEN_UPDATE",
  openSourceBaselineSha256: "e".repeat(64),
};
const openManifest = createD72StatefulCanaryManifest({
  head: HEAD,
  requestHash: REQUEST_HASH,
  artifactHash: ARTIFACT_HASH,
  canaryId: CANARY_ID,
  canaryVersionId: CANARY_VERSION_ID,
  canaryCapability,
  canaryCapabilityIssuedAtUtc: CREATED_AT,
  canaryCapabilityExpiresAtUtc: CAPABILITY_EXPIRES_AT,
  canaryCapabilityNonce: CAPABILITY_NONCE,
  existingSecret: EXISTING_CRON_SECRET,
  now: CREATED_AT,
  ...openProfile,
});
assert.equal(openManifest.checks.length, 14);
assert.equal(openManifest.checks.at(-1), "auth.google-oauth");
assert.equal(openManifest.expiresAtUtc, CAPABILITY_EXPIRES_AT);
assert.notDeepEqual(
  validateD72StatefulCanaryManifest(
    rehash({ ...openManifest, expiresAtUtc: MANIFEST_EXPIRES_AT }),
    {
      expectedBindings: { ...EXPECTED_BINDINGS, ...openProfile },
      now: AUTHORIZED_AT,
    },
  ),
  [],
);
const openAuthorization = createD72StatefulCanaryAuthorization({
  manifest: openManifest,
  statement: d72StatefulCanaryAuthorizationPhrase(openManifest),
  now: AUTHORIZED_AT,
});
const openEvidence = d72StatefulCanaryChecksForRelease(openProfile).map(
  ({ id, passingFacts }) => ({
    checkId: id,
    status: "PASS",
    observedAtUtc: OBSERVED_AT,
    facts: { ...passingFacts },
  }),
);
const openReport = createD72StatefulCanaryReport({
  manifest: openManifest,
  authorization: openAuthorization,
  evidence: openEvidence,
  startedAtUtc: STARTED_AT,
  completedAtUtc: COMPLETED_AT,
});
assert.equal(openReport.statefulCanaryPassed, true);
assert.equal(openReport.releaseDisposition, "CONTINUE");
assert.deepEqual(
  validateD72StatefulCanaryReport(openReport, {
    manifest: openManifest,
    authorization: openAuthorization,
    expectedBindings: { ...EXPECTED_BINDINGS, ...openProfile },
  }),
  [],
);
assert.throws(
  () =>
    createD72StatefulCanaryReport({
      manifest: openManifest,
      authorization: openAuthorization,
      evidence: passingEvidence,
      startedAtUtc: STARTED_AT,
      completedAtUtc: COMPLETED_AT,
    }),
  /checks|auth.google/,
);
const googleUnverified = clone(openEvidence);
googleUnverified.at(-1).status = "NOT_VERIFIED";
googleUnverified.at(-1).facts.providerTokensAbsent = null;
const openFailedReport = createD72StatefulCanaryReport({
  manifest: openManifest,
  authorization: openAuthorization,
  evidence: googleUnverified,
  startedAtUtc: STARTED_AT,
  completedAtUtc: COMPLETED_AT,
});
assert.equal(
  openFailedReport.releaseDisposition,
  "RECOVER_OPEN_GOOGLE_DISABLED",
);
assert.equal(openFailedReport.statefulCanaryPassed, false);
const crossedOpen = rehash({
  ...openReport,
  openSourceBaselineSha256: "f".repeat(64),
});
assert.notDeepEqual(
  validateD72StatefulCanaryReport(crossedOpen, {
    manifest: openManifest,
    authorization: openAuthorization,
  }),
  [],
);

console.log(
  `D72 stateful canary policy: PASS (${D72_STATEFUL_CANARY_CHECK_IDS.length} checks; HMAC efímera; evidencia saneada; fail-closed).`,
);
