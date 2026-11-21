import { createHash } from "node:crypto";
import { d72ReleaseEvidenceProfile } from "./non-waivable-gate-evidence-catalog.mjs";
import {
  createD72CanaryAuthorizationEvidence,
  d72CanaryCapabilityBindingHash,
  d72CanaryStatefulCapabilityDescriptorFromGrant,
  d72CanaryStatefulAuthorizationPhrase,
  verifyD72CanaryCapability,
} from "./d72-canary-policy.mjs";
import {
  AUTHORIZED_RISK_OWNER,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const D72_STATEFUL_CANARY_MANIFEST_SCHEMA_VERSION =
  "agorbis-d72-stateful-canary-manifest/v1";
export const D72_STATEFUL_CANARY_AUTHORIZATION_SCHEMA_VERSION =
  "agorbis-d72-stateful-canary-authorization/v1";
export const D72_STATEFUL_CANARY_REPORT_SCHEMA_VERSION =
  "agorbis-d72-stateful-canary-report/v1";
export const D72_STATEFUL_CANARY_VALIDITY_MS = 60 * 60 * 1_000;
export const D72_STATEFUL_CANARY_AUTHORIZATION_SOURCE = "/dev/tty";
export const D72_STATEFUL_CANARY_SCOPE = "D72_STATEFUL_CANARY_ONLY";
export const D72_STATEFUL_CANARY_CAPABILITY_ALGORITHM = "HMAC-SHA256";

export const D72_STATEFUL_CANARY_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  NOT_VERIFIED: "NOT_VERIFIED",
});

export const D72_STATEFUL_CANARY_DISPOSITION = Object.freeze({
  CONTINUE: "CONTINUE",
  ROLLBACK_CLOSED: "ROLLBACK_CLOSED",
  RECOVER_OPEN_GOOGLE_DISABLED: "RECOVER_OPEN_GOOGLE_DISABLED",
});

const CHECK_DEFINITIONS = [
  [
    "canary.version-override-capability",
    {
      capabilityHashMatched: true,
      requestedVersionObserved: true,
      versionOverrideApplied: true,
    },
  ],
  [
    "auth.account-lifecycle",
    {
      registrationCompleted: true,
      emailConfirmed: true,
      loginCompleted: true,
      recoveryCompleted: true,
    },
  ],
  [
    "smtp.delivery",
    {
      confirmationDelivered: true,
      recoveryDelivered: true,
      deliveryEvidenceRedacted: true,
    },
  ],
  [
    "turnstile.a",
    {
      actionMatched: true,
      freshResponseConsumed: true,
      hostnameMatched: true,
      legitimateChallengeAccepted: true,
      replayRejected: true,
      sensitiveResponseRetained: false,
      siteverifySucceeded: true,
    },
  ],
  [
    "turnstile.b",
    {
      aResponseReused: false,
      captchaFailureClassMatched: true,
      directAuthWithoutCaptchaRejected: true,
      invalidCaptchaRejected: true,
      sessionCreated: false,
    },
  ],
  [
    "auth.pkce",
    {
      codeExchangeCompleted: true,
      exactRedirectObserved: true,
      missingOrReplayRejected: true,
      providerTokensAbsent: true,
    },
  ],
  [
    "security.cookies",
    {
      httpOnly: true,
      providerTokensAbsent: true,
      sameSiteLax: true,
      secure: true,
    },
  ],
  [
    "auth.mfa-totp",
    {
      aal2Observed: true,
      enrollmentAvailable: true,
      totpChallengeVerified: true,
      totpSeedRetained: false,
    },
  ],
  [
    "storage.private-proxy",
    {
      authorizedUploadCompleted: true,
      bucketPrivate: true,
      crossUserReadRejected: true,
      privatePathUsed: true,
      proxyReadAuthorized: true,
      unauthenticatedReadRejected: true,
    },
  ],
  [
    "database.rls",
    {
      authorizedScopeAllowed: true,
      unauthorizedReadRejected: true,
      unauthorizedWriteRejected: true,
    },
  ],
  [
    "authorization.residency",
    {
      inBoundaryWriteAllowed: true,
      outOfBoundaryWriteRejected: true,
    },
  ],
  [
    "participation.lifecycle",
    {
      aggregateVoteRecorded: true,
      commentCreated: true,
      individualBallotAbsent: true,
      publicationCreated: true,
      supportCreated: true,
    },
  ],
  [
    "cleanup.canary-account",
    {
      authIdentityDeleted: true,
      civicFixturesDeleted: true,
      profileDeleted: true,
      sessionsRevoked: true,
      storageObjectsDeleted: true,
    },
  ],
];

export const D72_STATEFUL_CANARY_CHECKS = Object.freeze(
  CHECK_DEFINITIONS.map(([id, passingFacts]) =>
    Object.freeze({ id, passingFacts: Object.freeze({ ...passingFacts }) }),
  ),
);
export const D72_STATEFUL_CANARY_CHECK_IDS = Object.freeze(
  D72_STATEFUL_CANARY_CHECKS.map(({ id }) => id),
);

const GOOGLE_OAUTH_CHECK = Object.freeze({
  id: "auth.google-oauth",
  passingFacts: Object.freeze({
    newAccountCompleted: true,
    existingAccountCompleted: true,
    emailAccessPreserved: true,
    cancellationReturnedSafely: true,
    generalConsentRequired: true,
    googleConsentRequired: true,
    consentStored: true,
    withdrawalBlocksFutureGoogleAccess: true,
    expiredReturnRejected: true,
    finalSessionEstablished: true,
    providerTokensAbsent: true,
    testAccountGoogleConsentRevoked: true,
    testAccountSessionsRevoked: true,
    authResponsesNoStore: true,
  }),
});
export function d72StatefulCanaryChecksForRelease(profile = {}) {
  return d72ReleaseEvidenceProfile(profile).releaseMode === "OPEN_UPDATE"
    ? Object.freeze([...D72_STATEFUL_CANARY_CHECKS, GOOGLE_OAUTH_CHECK])
    : D72_STATEFUL_CANARY_CHECKS;
}
function checkIds(profile = {}) {
  return d72StatefulCanaryChecksForRelease(profile).map(({ id }) => id);
}
function releaseKeys(keys, profile) {
  return [...keys, ...Object.keys(d72ReleaseEvidenceProfile(profile))];
}
function failureDisposition(profile) {
  return d72ReleaseEvidenceProfile(profile).releaseMode === "OPEN_UPDATE"
    ? D72_STATEFUL_CANARY_DISPOSITION.RECOVER_OPEN_GOOGLE_DISABLED
    : D72_STATEFUL_CANARY_DISPOSITION.ROLLBACK_CLOSED;
}

const CHECK_BY_ID = new Map(
  [...D72_STATEFUL_CANARY_CHECKS, GOOGLE_OAUTH_CHECK].map((definition) => [
    definition.id,
    definition,
  ]),
);
const FORBIDDEN_EVIDENCE_FIELD_PATTERN =
  /(?:e-?mail|cookie|url|uri|token|otp|seed|user-?id|storage-?key|raw-?(?:response|body|payload)|authorization-?code|password|secret)/iu;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CANARY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{6,62}[a-z0-9])$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FUTURE_MS = 5 * 60 * 1_000;

const MANIFEST_KEYS = Object.freeze([
  "artifactHash",
  "authorizationRequired",
  "capability",
  "canaryId",
  "canaryVersionId",
  "checks",
  "contentSha256",
  "createdAtUtc",
  "deploymentAuthorized",
  "expiresAtUtc",
  "head",
  "policyHash",
  "policyVersion",
  "requestHash",
  "schemaVersion",
  "statefulCanaryAuthorized",
]);
const CAPABILITY_KEYS = Object.freeze([
  "algorithm",
  "bindingHash",
  "capabilityId",
  "expiresAtUtc",
  "issuedAtUtc",
  "rawHeaderStored",
  "scope",
  "tokenStored",
  "versionOverrideRequired",
]);
const AUTHORIZATION_KEYS = Object.freeze([
  "artifactHash",
  "authorizationSource",
  "authorizedAtUtc",
  "authorizedBy",
  "canaryId",
  "canaryVersionId",
  "contentSha256",
  "deploymentAuthorized",
  "expiresAtUtc",
  "head",
  "manifestHash",
  "policyHash",
  "policyVersion",
  "requestHash",
  "schemaVersion",
  "scope",
  "singleUse",
  "statementSha256",
  "statefulCanaryAuthorized",
]);
const REPORT_KEYS = Object.freeze([
  "artifactHash",
  "authorizationHash",
  "canaryId",
  "canaryVersionId",
  "completedAtUtc",
  "contentSha256",
  "deploymentAuthorized",
  "evidence",
  "head",
  "manifestHash",
  "policyHash",
  "policyVersion",
  "releaseDisposition",
  "requestHash",
  "schemaVersion",
  "startedAtUtc",
  "statefulCanaryPassed",
]);
const EVIDENCE_KEYS = Object.freeze([
  "checkId",
  "facts",
  "observedAtUtc",
  "status",
]);
const BINDING_KEYS = Object.freeze([
  "artifactHash",
  "canaryVersionId",
  "head",
  "policyHash",
  "requestHash",
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function sha256(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function canonicalJson(value) {
  const source = JSON.stringify(canonicalize(value));
  if (typeof source !== "string") {
    throw new Error("El registro canario no puede serializarse.");
  }
  return `${source}\n`;
}

function contentHash(recordOrPayload) {
  if (!isPlainObject(recordOrPayload)) {
    throw new Error("El registro canario debe ser un objeto.");
  }
  const { contentSha256: _contentSha256, ...payload } = recordOrPayload;
  return sha256(canonicalJson(payload));
}

function normalizedDate(value) {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isCanonicalUtcTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const parsed = normalizedDate(value);
  return parsed !== null && parsed.toISOString() === value;
}

function exactExpiration(createdAtUtc) {
  if (!isCanonicalUtcTimestamp(createdAtUtc)) return null;
  return new Date(
    new Date(createdAtUtc).getTime() + D72_STATEFUL_CANARY_VALIDITY_MS,
  ).toISOString();
}

function expectedManifestExpiration(manifest) {
  const standard = exactExpiration(manifest.createdAtUtc);
  if (manifest.releaseMode !== "OPEN_UPDATE") return standard;
  const expiry = Math.min(
    Date.parse(standard),
    Date.parse(manifest.capability?.expiresAtUtc),
  );
  return Number.isFinite(expiry) ? new Date(expiry).toISOString() : null;
}

function runtimeCapabilityBinding({
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryVersionId,
  issuedAtUtc,
  expiresAtUtc,
  nonce,
} = {}) {
  return {
    head,
    requestHash,
    policyHash,
    artifactHash,
    canaryVersionId,
    issuedAtUtc,
    expiresAtUtc,
    nonce,
  };
}

function createCapabilityDescriptor({
  canaryCapability,
  existingSecret,
  now,
  ...binding
} = {}) {
  if (
    typeof canaryCapability !== "string" ||
    !verifyD72CanaryCapability({
      capability: canaryCapability,
      existingSecret,
      now,
      ...binding,
    })
  ) {
    throw new Error(
      "La capability HMAC compartida no coincide con sus bindings o vigencia.",
    );
  }
  return {
    algorithm: D72_STATEFUL_CANARY_CAPABILITY_ALGORITHM,
    bindingHash: d72CanaryCapabilityBindingHash(binding),
    capabilityId: sha256(canaryCapability),
    issuedAtUtc: binding.issuedAtUtc,
    expiresAtUtc: binding.expiresAtUtc,
    scope: D72_STATEFUL_CANARY_SCOPE,
    versionOverrideRequired: true,
    tokenStored: false,
    rawHeaderStored: false,
  };
}

function capabilityErrors(capability, manifest) {
  const errors = [];
  if (!isPlainObject(capability) || !sameKeys(capability, CAPABILITY_KEYS)) {
    return ["La capability contiene claves desconocidas o incompletas."];
  }
  if (
    capability.algorithm !== D72_STATEFUL_CANARY_CAPABILITY_ALGORITHM ||
    capability.scope !== D72_STATEFUL_CANARY_SCOPE ||
    capability.versionOverrideRequired !== true ||
    capability.tokenStored !== false ||
    capability.rawHeaderStored !== false
  ) {
    errors.push(
      "La capability no conserva su algoritmo, scope o no-retención.",
    );
  }
  if (!SHA256_PATTERN.test(capability.bindingHash ?? "")) {
    errors.push("La capability no contiene un bindingHash válido.");
  }
  if (!SHA256_PATTERN.test(capability.capabilityId ?? "")) {
    errors.push("La capability no contiene un ID no reversible válido.");
  }
  if (
    !isCanonicalUtcTimestamp(capability.issuedAtUtc) ||
    !isCanonicalUtcTimestamp(capability.expiresAtUtc) ||
    capability.issuedAtUtc !== manifest?.createdAtUtc ||
    (isCanonicalUtcTimestamp(manifest?.expiresAtUtc) &&
      new Date(capability.expiresAtUtc).getTime() >
        new Date(manifest.expiresAtUtc).getTime()) ||
    (isCanonicalUtcTimestamp(capability.issuedAtUtc) &&
      isCanonicalUtcTimestamp(capability.expiresAtUtc) &&
      new Date(capability.expiresAtUtc).getTime() <=
        new Date(capability.issuedAtUtc).getTime())
  ) {
    errors.push("La ventana de la capability no coincide con el manifiesto.");
  }
  return errors;
}

function capabilityRuntimeErrors({
  manifest,
  canaryCapability,
  existingSecret,
  canaryCapabilityNonce,
  now,
} = {}) {
  const errors = [];
  if (
    typeof canaryCapability !== "string" ||
    sha256(canaryCapability) !== manifest?.capability?.capabilityId
  ) {
    errors.push("La capability efímera no coincide con el ID autorizado.");
  }
  const binding = runtimeCapabilityBinding({
    ...manifest,
    issuedAtUtc: manifest?.capability?.issuedAtUtc,
    expiresAtUtc: manifest?.capability?.expiresAtUtc,
    nonce: canaryCapabilityNonce,
  });
  try {
    if (
      d72CanaryCapabilityBindingHash(binding) !==
      manifest?.capability?.bindingHash
    ) {
      errors.push("La capability efímera no conserva su bindingHash.");
    }
  } catch {
    errors.push("Los bindings runtime de la capability no son válidos.");
  }
  if (
    !verifyD72CanaryCapability({
      capability: canaryCapability,
      existingSecret,
      now,
      ...binding,
    })
  ) {
    errors.push(
      "La capability HMAC compartida no es válida o ya está vencida.",
    );
  }
  return errors;
}

function bindingErrors(value, label) {
  const errors = [];
  if (!FULL_HEAD_PATTERN.test(value?.head ?? "")) {
    errors.push(`${label}.head no es un commit completo.`);
  }
  for (const key of ["requestHash", "policyHash", "artifactHash"]) {
    if (!SHA256_PATTERN.test(value?.[key] ?? "")) {
      errors.push(`${label}.${key} no es un SHA-256 completo.`);
    }
  }
  if (!VERSION_ID_PATTERN.test(value?.canaryVersionId ?? "")) {
    errors.push(`${label}.canaryVersionId no es un Version ID válido.`);
  }
  return errors;
}

function exactBindingErrors(actual, expected, label) {
  if (
    !isPlainObject(expected) ||
    !sameKeys(expected, releaseKeys(BINDING_KEYS, actual))
  ) {
    return [`${label} requiere exactamente los cinco bindings esperados.`];
  }
  const errors = bindingErrors(expected, "expectedBindings");
  for (const key of releaseKeys(BINDING_KEYS, actual)) {
    if (actual?.[key] !== expected[key]) {
      errors.push(`${label}.${key} no coincide con el binding esperado.`);
    }
  }
  return errors;
}

function recordHashErrors(record, label) {
  let expectedHash = null;
  try {
    expectedHash = contentHash(record);
  } catch {
    return [`${label} no admite contenido no serializable.`];
  }
  if (
    !SHA256_PATTERN.test(record?.contentSha256 ?? "") ||
    record.contentSha256 !== expectedHash
  ) {
    return [`${label}.contentSha256 no coincide.`];
  }
  return [];
}

function forbiddenUnknownFactKeys(facts, expectedKeys) {
  if (!isPlainObject(facts)) return [];
  return Object.keys(facts).flatMap((key) =>
    !expectedKeys.has(key) && FORBIDDEN_EVIDENCE_FIELD_PATTERN.test(key)
      ? [`La evidencia contiene el campo sensible prohibido ${key}.`]
      : [],
  );
}

function validateEvidenceItem(item, expectedCheckId) {
  const errors = [];
  if (!isPlainObject(item)) {
    return [
      `${expectedCheckId} debe contener sólo checkId, status, observedAtUtc y facts.`,
    ];
  }
  const forbiddenItemKeys = Object.keys(item).flatMap((key) =>
    !EVIDENCE_KEYS.includes(key) && FORBIDDEN_EVIDENCE_FIELD_PATTERN.test(key)
      ? [`La evidencia contiene el campo sensible prohibido ${key}.`]
      : [],
  );
  if (!sameKeys(item, EVIDENCE_KEYS)) {
    return [
      `${expectedCheckId} debe contener sólo checkId, status, observedAtUtc y facts.`,
      ...forbiddenItemKeys,
    ];
  }
  if (item.checkId !== expectedCheckId) {
    errors.push(`${expectedCheckId} está ausente o fuera de orden.`);
  }
  if (!Object.values(D72_STATEFUL_CANARY_STATUS).includes(item.status)) {
    errors.push(`${expectedCheckId} tiene status desconocido.`);
  }
  if (!isCanonicalUtcTimestamp(item.observedAtUtc)) {
    errors.push(`${expectedCheckId} carece de observedAtUtc canónico.`);
  }

  const definition = CHECK_BY_ID.get(expectedCheckId);
  const expectedFacts = definition.passingFacts;
  const expectedFactKeys = new Set(Object.keys(expectedFacts));
  errors.push(...forbiddenUnknownFactKeys(item.facts, expectedFactKeys));
  if (!isPlainObject(item.facts) || !sameKeys(item.facts, expectedFactKeys)) {
    errors.push(`${expectedCheckId} no contiene los facts saneados exactos.`);
    return errors;
  }
  for (const [key, value] of Object.entries(item.facts)) {
    if (value !== true && value !== false && value !== null) {
      errors.push(
        `${expectedCheckId}.${key} sólo admite boolean/null, nunca valores crudos.`,
      );
    }
  }
  const factsMatchPass = Object.entries(expectedFacts).every(
    ([key, value]) => item.facts[key] === value,
  );
  if (item.status === D72_STATEFUL_CANARY_STATUS.PASS && !factsMatchPass) {
    errors.push(
      `${expectedCheckId} declara PASS sin todos los facts esperados.`,
    );
  }
  if (item.status !== D72_STATEFUL_CANARY_STATUS.PASS && factsMatchPass) {
    errors.push(`${expectedCheckId} contradice sus facts completos.`);
  }
  return errors;
}

function evidenceErrors(
  evidence,
  { startedAtUtc, completedAtUtc, profile = {} } = {},
) {
  const requiredChecks = checkIds(profile);
  const errors = [];
  if (!Array.isArray(evidence)) {
    return ["evidence debe enumerar todos los checks canarios."];
  }
  if (evidence.length !== requiredChecks.length) {
    errors.push("evidence no contiene exactamente todos los checks canarios.");
  }
  for (let index = 0; index < requiredChecks.length; index += 1) {
    const checkId = requiredChecks[index];
    const item = evidence[index];
    errors.push(...validateEvidenceItem(item, checkId));
    if (
      isCanonicalUtcTimestamp(item?.observedAtUtc) &&
      isCanonicalUtcTimestamp(startedAtUtc) &&
      isCanonicalUtcTimestamp(completedAtUtc)
    ) {
      const observed = new Date(item.observedAtUtc).getTime();
      if (
        observed < new Date(startedAtUtc).getTime() ||
        observed > new Date(completedAtUtc).getTime()
      ) {
        errors.push(`${checkId}.observedAtUtc queda fuera de la ejecución.`);
      }
    }
  }
  const ids = evidence.flatMap((item) =>
    typeof item?.checkId === "string" ? [item.checkId] : [],
  );
  if (ids.length !== new Set(ids).size) {
    errors.push("evidence contiene check IDs duplicados.");
  }
  return [...new Set(errors)];
}

function allEvidencePassed(evidence, profile = {}) {
  const requiredChecks = checkIds(profile);
  return (
    Array.isArray(evidence) &&
    evidence.length === requiredChecks.length &&
    evidence.every(
      (item, index) =>
        item?.checkId === requiredChecks[index] &&
        item.status === D72_STATEFUL_CANARY_STATUS.PASS,
    )
  );
}

export function d72StatefulCanaryManifestHash(manifest) {
  return contentHash(manifest);
}

export function d72StatefulCanaryAuthorizationHash(authorization) {
  return contentHash(authorization);
}

export function d72StatefulCanaryReportHash(report) {
  return contentHash(report);
}

export function createD72StatefulCanaryManifest({
  head,
  requestHash,
  artifactHash,
  canaryId,
  canaryVersionId,
  canaryCapability,
  canaryCapabilityIssuedAtUtc,
  canaryCapabilityExpiresAtUtc,
  canaryCapabilityNonce,
  canaryCapabilityGrant,
  existingSecret,
  now = new Date(),
  ...releaseOptions
} = {}) {
  const releaseProfile = d72ReleaseEvidenceProfile(releaseOptions);
  if (!sameKeys(releaseOptions, Object.keys(releaseProfile)))
    throw new Error("Perfil stateful contiene campos desconocidos.");
  const createdAt = normalizedDate(now);
  if (!createdAt) throw new Error("now no es una fecha válida.");
  const createdAtUtc = createdAt.toISOString();
  if (
    canaryCapabilityGrant !== undefined &&
    [
      canaryCapability,
      existingSecret,
      canaryCapabilityIssuedAtUtc,
      canaryCapabilityExpiresAtUtc,
      canaryCapabilityNonce,
    ].some((value) => value !== undefined)
  )
    throw new Error(
      "El grant stateful no admite tokens ni secretos del caller.",
    );
  const capability =
    canaryCapabilityGrant !== undefined
      ? d72CanaryStatefulCapabilityDescriptorFromGrant(
          canaryCapabilityGrant,
          {
            head,
            requestHash,
            policyHash: RELEASE_GATE_POLICY_SHA256,
            artifactHash,
            canaryVersionId,
          },
          { now: createdAt },
        )
      : createCapabilityDescriptor({
          canaryCapability,
          existingSecret,
          now: createdAt,
          head,
          requestHash,
          policyHash: RELEASE_GATE_POLICY_SHA256,
          artifactHash,
          canaryVersionId,
          issuedAtUtc: canaryCapabilityIssuedAtUtc,
          expiresAtUtc: canaryCapabilityExpiresAtUtc,
          nonce: canaryCapabilityNonce,
        });
  const expiresAtUtc = new Date(
    releaseProfile.releaseMode === "OPEN_UPDATE"
      ? Math.min(
          createdAt.getTime() + D72_STATEFUL_CANARY_VALIDITY_MS,
          Date.parse(capability.expiresAtUtc),
        )
      : createdAt.getTime() + D72_STATEFUL_CANARY_VALIDITY_MS,
  ).toISOString();
  const payload = {
    schemaVersion: D72_STATEFUL_CANARY_MANIFEST_SCHEMA_VERSION,
    ...releaseProfile,
    head,
    requestHash,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    artifactHash,
    canaryId,
    canaryVersionId,
    createdAtUtc,
    expiresAtUtc,
    capability,
    checks: checkIds(releaseProfile),
    authorizationRequired: true,
    statefulCanaryAuthorized: false,
    deploymentAuthorized: false,
  };
  const manifest = { ...payload, contentSha256: contentHash(payload) };
  const errors = validateD72StatefulCanaryManifest(manifest, {
    expectedBindings: {
      ...releaseProfile,
      head,
      requestHash,
      policyHash: RELEASE_GATE_POLICY_SHA256,
      artifactHash,
      canaryVersionId,
    },
    now: createdAt,
  });
  if (errors.length > 0) {
    throw new Error(`Manifiesto canario inválido:\n${errors.join("\n")}`);
  }
  return deepFreeze(manifest);
}

export function validateD72StatefulCanaryManifest(
  manifest,
  { expectedBindings, now = new Date() } = {},
) {
  const errors = [];
  if (
    !isPlainObject(manifest) ||
    !sameKeys(manifest, releaseKeys(MANIFEST_KEYS, manifest))
  ) {
    return ["El manifiesto contiene claves desconocidas o incompletas."];
  }
  if (manifest.schemaVersion !== D72_STATEFUL_CANARY_MANIFEST_SCHEMA_VERSION) {
    errors.push("schemaVersion del manifiesto desconocido.");
  }
  if (
    manifest.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    manifest.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("El manifiesto usa una política D72 distinta.");
  }
  errors.push(...bindingErrors(manifest, "manifest"));
  if (!CANARY_ID_PATTERN.test(manifest.canaryId ?? "")) {
    errors.push("manifest.canaryId no es un ID canario válido.");
  }
  if (expectedBindings !== undefined) {
    errors.push(...exactBindingErrors(manifest, expectedBindings, "manifest"));
  }
  if (!isCanonicalUtcTimestamp(manifest.createdAtUtc)) {
    errors.push("createdAtUtc del manifiesto no es canónico.");
  }
  if (
    !isCanonicalUtcTimestamp(manifest.expiresAtUtc) ||
    expectedManifestExpiration(manifest) !== manifest.expiresAtUtc
  ) {
    errors.push(
      "expiresAtUtc no coincide con la ventana de manifest/capability.",
    );
  }
  const currentTime = normalizedDate(now);
  if (!currentTime) {
    errors.push("now no es una fecha válida.");
  } else if (isCanonicalUtcTimestamp(manifest.createdAtUtc)) {
    if (
      new Date(manifest.createdAtUtc).getTime() - currentTime.getTime() >
      MAX_FUTURE_MS
    ) {
      errors.push("El manifiesto está fechado demasiado en el futuro.");
    }
    if (
      isCanonicalUtcTimestamp(manifest.expiresAtUtc) &&
      currentTime.getTime() >= new Date(manifest.expiresAtUtc).getTime()
    ) {
      errors.push("El manifiesto canario está vencido.");
    }
  }
  if (
    !Array.isArray(manifest.checks) ||
    JSON.stringify(manifest.checks) !== JSON.stringify(checkIds(manifest))
  ) {
    errors.push("El manifiesto no fija exactamente todos los checks canarios.");
  }
  errors.push(...capabilityErrors(manifest.capability, manifest));
  if (
    manifest.authorizationRequired !== true ||
    manifest.statefulCanaryAuthorized !== false ||
    manifest.deploymentAuthorized !== false
  ) {
    errors.push("El manifiesto no puede autorizar canary ni deployment.");
  }
  errors.push(...recordHashErrors(manifest, "manifest"));
  return [...new Set(errors)];
}

export function d72StatefulCanaryAuthorizationPhrase(manifest) {
  const manifestHash = d72StatefulCanaryManifestHash(manifest);
  if (
    !FULL_HEAD_PATTERN.test(manifest?.head ?? "") ||
    !SHA256_PATTERN.test(manifestHash) ||
    !CANARY_ID_PATTERN.test(manifest?.canaryId ?? "")
  ) {
    throw new Error("El manifiesto no permite construir la autorización.");
  }
  return d72CanaryStatefulAuthorizationPhrase({
    head: manifest.head,
    canaryId: manifest.canaryId,
    statefulManifestHash: manifestHash,
  });
}

export function createD72StatefulCanaryAuthorization({
  manifest,
  statement,
  authorizationSource = D72_STATEFUL_CANARY_AUTHORIZATION_SOURCE,
  now = new Date(),
} = {}) {
  const authorizedAt = normalizedDate(now);
  if (!authorizedAt) throw new Error("now no es una fecha válida.");
  const manifestErrors = validateD72StatefulCanaryManifest(manifest, {
    now: authorizedAt,
  });
  if (manifestErrors.length > 0) {
    throw new Error(
      `Manifiesto canario inválido:\n${manifestErrors.join("\n")}`,
    );
  }
  const authorizationEvidence = createD72CanaryAuthorizationEvidence({
    kind: "stateful",
    statement,
    source: authorizationSource,
    confirmedAtUtc: authorizedAt.toISOString(),
    head: manifest.head,
    canaryId: manifest.canaryId,
    statefulManifestHash: d72StatefulCanaryManifestHash(manifest),
  });
  const payload = {
    schemaVersion: D72_STATEFUL_CANARY_AUTHORIZATION_SCHEMA_VERSION,
    ...d72ReleaseEvidenceProfile(manifest),
    manifestHash: d72StatefulCanaryManifestHash(manifest),
    head: manifest.head,
    requestHash: manifest.requestHash,
    policyVersion: manifest.policyVersion,
    policyHash: manifest.policyHash,
    artifactHash: manifest.artifactHash,
    canaryId: manifest.canaryId,
    canaryVersionId: manifest.canaryVersionId,
    authorizedBy: AUTHORIZED_RISK_OWNER,
    authorizedAtUtc: authorizedAt.toISOString(),
    expiresAtUtc: manifest.expiresAtUtc,
    authorizationSource,
    statementSha256: authorizationEvidence.statementSha256,
    scope: D72_STATEFUL_CANARY_SCOPE,
    singleUse: true,
    statefulCanaryAuthorized: true,
    deploymentAuthorized: false,
  };
  const authorization = {
    ...payload,
    contentSha256: contentHash(payload),
  };
  const errors = validateD72StatefulCanaryAuthorization(authorization, {
    manifest,
    now: authorizedAt,
    authorizationConsumed: false,
  });
  if (errors.length > 0) {
    throw new Error(`Autorización canaria inválida:\n${errors.join("\n")}`);
  }
  return deepFreeze(authorization);
}

export function validateD72StatefulCanaryAuthorization(
  authorization,
  { manifest, expectedBindings, now = new Date(), authorizationConsumed } = {},
) {
  const errors = [];
  if (
    !isPlainObject(authorization) ||
    !sameKeys(authorization, releaseKeys(AUTHORIZATION_KEYS, authorization))
  ) {
    return ["La autorización contiene claves desconocidas o incompletas."];
  }
  if (
    authorization.schemaVersion !==
    D72_STATEFUL_CANARY_AUTHORIZATION_SCHEMA_VERSION
  ) {
    errors.push("schemaVersion de autorización desconocido.");
  }
  if (!isPlainObject(manifest)) {
    errors.push("La autorización exige el manifiesto original.");
  } else {
    let manifestHash = null;
    try {
      manifestHash = d72StatefulCanaryManifestHash(manifest);
    } catch {
      errors.push("El manifiesto original no es serializable.");
    }
    if (
      authorization.manifestHash !== manifestHash ||
      authorization.manifestHash !== manifest.contentSha256
    ) {
      errors.push("La autorización no coincide con el manifiesto.");
    }
    for (const key of releaseKeys(BINDING_KEYS, manifest)) {
      if (authorization[key] !== manifest[key]) {
        errors.push(`authorization.${key} no coincide con el manifiesto.`);
      }
    }
    if (authorization.canaryId !== manifest.canaryId) {
      errors.push("authorization.canaryId no coincide con el manifiesto.");
    }
    if (
      authorization.policyVersion !== manifest.policyVersion ||
      authorization.expiresAtUtc !== manifest.expiresAtUtc
    ) {
      errors.push("La política o expiración autorizada no coincide.");
    }
    if (
      isCanonicalUtcTimestamp(authorization.authorizedAtUtc) &&
      isCanonicalUtcTimestamp(manifest.createdAtUtc) &&
      new Date(authorization.authorizedAtUtc).getTime() <
        new Date(manifest.createdAtUtc).getTime()
    ) {
      errors.push("La autorización precede a la creación del manifiesto.");
    }
  }
  if (
    authorization.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    authorization.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("La autorización usa una política D72 distinta.");
  }
  errors.push(...bindingErrors(authorization, "authorization"));
  if (!CANARY_ID_PATTERN.test(authorization.canaryId ?? "")) {
    errors.push("authorization.canaryId no es un ID canario válido.");
  }
  if (expectedBindings !== undefined) {
    errors.push(
      ...exactBindingErrors(authorization, expectedBindings, "authorization"),
    );
  }
  if (
    authorization.authorizedBy !== AUTHORIZED_RISK_OWNER ||
    authorization.authorizationSource !==
      D72_STATEFUL_CANARY_AUTHORIZATION_SOURCE ||
    authorization.scope !== D72_STATEFUL_CANARY_SCOPE ||
    authorization.singleUse !== true ||
    authorization.statefulCanaryAuthorized !== true ||
    authorization.deploymentAuthorized !== false
  ) {
    errors.push("La autorización no tiene identidad, fuente o scope exactos.");
  }
  if (isPlainObject(manifest)) {
    try {
      const expectedEvidence = createD72CanaryAuthorizationEvidence({
        kind: "stateful",
        statement: d72StatefulCanaryAuthorizationPhrase(manifest),
        source: D72_STATEFUL_CANARY_AUTHORIZATION_SOURCE,
        confirmedAtUtc: authorization.authorizedAtUtc,
        head: manifest.head,
        canaryId: manifest.canaryId,
        statefulManifestHash: d72StatefulCanaryManifestHash(manifest),
      });
      if (authorization.statementSha256 !== expectedEvidence.statementSha256) {
        errors.push("La declaración de autorización no es literal.");
      }
    } catch {
      errors.push("El manifiesto no permite validar la declaración literal.");
    }
  }
  if (!isCanonicalUtcTimestamp(authorization.authorizedAtUtc)) {
    errors.push("authorizedAtUtc no es canónico.");
  }
  if (
    !isCanonicalUtcTimestamp(authorization.expiresAtUtc) ||
    (isPlainObject(manifest) &&
      authorization.expiresAtUtc !== manifest.expiresAtUtc)
  ) {
    errors.push("expiresAtUtc de autorización no coincide.");
  }
  const currentTime = normalizedDate(now);
  if (!currentTime) {
    errors.push("now no es una fecha válida.");
  } else {
    if (
      isCanonicalUtcTimestamp(authorization.authorizedAtUtc) &&
      new Date(authorization.authorizedAtUtc).getTime() -
        currentTime.getTime() >
        MAX_FUTURE_MS
    ) {
      errors.push("La autorización está fechada demasiado en el futuro.");
    }
    if (
      isCanonicalUtcTimestamp(authorization.expiresAtUtc) &&
      currentTime.getTime() >= new Date(authorization.expiresAtUtc).getTime()
    ) {
      errors.push("La autorización canaria está vencida.");
    }
  }
  if (authorizationConsumed !== false) {
    errors.push("La autorización ya fue consumida o su consumo es incierto.");
  }
  errors.push(...recordHashErrors(authorization, "authorization"));
  return [...new Set(errors)];
}

export function createD72StatefulCanaryReport({
  manifest,
  authorization,
  evidence,
  startedAtUtc,
  completedAtUtc,
} = {}) {
  const structuralAuthorizationErrors = validateD72StatefulCanaryAuthorization(
    authorization,
    {
      manifest,
      now: startedAtUtc,
      authorizationConsumed: false,
    },
  );
  if (structuralAuthorizationErrors.length > 0) {
    throw new Error(
      `Autorización canaria inválida:\n${structuralAuthorizationErrors.join("\n")}`,
    );
  }
  const passed = allEvidencePassed(evidence, manifest);
  const payload = {
    schemaVersion: D72_STATEFUL_CANARY_REPORT_SCHEMA_VERSION,
    ...d72ReleaseEvidenceProfile(manifest),
    manifestHash: manifest.contentSha256,
    authorizationHash: authorization.contentSha256,
    head: manifest.head,
    requestHash: manifest.requestHash,
    policyVersion: manifest.policyVersion,
    policyHash: manifest.policyHash,
    artifactHash: manifest.artifactHash,
    canaryId: manifest.canaryId,
    canaryVersionId: manifest.canaryVersionId,
    startedAtUtc,
    completedAtUtc,
    evidence: evidence.map((item) => ({
      checkId: item.checkId,
      status: item.status,
      observedAtUtc: item.observedAtUtc,
      facts: { ...item.facts },
    })),
    statefulCanaryPassed: passed,
    releaseDisposition: passed
      ? D72_STATEFUL_CANARY_DISPOSITION.CONTINUE
      : failureDisposition(manifest),
    deploymentAuthorized: false,
  };
  const report = { ...payload, contentSha256: contentHash(payload) };
  const errors = validateD72StatefulCanaryReport(report, {
    manifest,
    authorization,
  });
  if (errors.length > 0) {
    throw new Error(`Reporte canario inválido:\n${errors.join("\n")}`);
  }
  return deepFreeze(report);
}

export function validateD72StatefulCanaryReport(
  report,
  { manifest, authorization, expectedBindings } = {},
) {
  const errors = [];
  if (
    !isPlainObject(report) ||
    !sameKeys(report, releaseKeys(REPORT_KEYS, report))
  ) {
    return ["El reporte contiene claves desconocidas o incompletas."];
  }
  if (report.schemaVersion !== D72_STATEFUL_CANARY_REPORT_SCHEMA_VERSION) {
    errors.push("schemaVersion del reporte desconocido.");
  }
  if (
    report.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    report.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("El reporte usa una política D72 distinta.");
  }
  errors.push(...bindingErrors(report, "report"));
  if (!CANARY_ID_PATTERN.test(report.canaryId ?? "")) {
    errors.push("report.canaryId no es un ID canario válido.");
  }
  if (expectedBindings !== undefined) {
    errors.push(...exactBindingErrors(report, expectedBindings, "report"));
  }
  if (!isPlainObject(manifest) || !isPlainObject(authorization)) {
    errors.push("El reporte exige manifiesto y autorización originales.");
  } else {
    let manifestHash = null;
    let authorizationHash = null;
    try {
      manifestHash = d72StatefulCanaryManifestHash(manifest);
      authorizationHash = d72StatefulCanaryAuthorizationHash(authorization);
    } catch {
      errors.push("Los registros originales no son serializables.");
    }
    if (
      report.manifestHash !== manifest.contentSha256 ||
      report.manifestHash !== manifestHash
    ) {
      errors.push("El reporte no coincide con el manifiesto.");
    }
    if (
      report.authorizationHash !== authorization.contentSha256 ||
      report.authorizationHash !== authorizationHash
    ) {
      errors.push("El reporte no coincide con la autorización.");
    }
    for (const key of releaseKeys(BINDING_KEYS, manifest)) {
      if (report[key] !== manifest[key] || report[key] !== authorization[key]) {
        errors.push(`report.${key} no conserva los bindings autorizados.`);
      }
    }
    if (
      report.canaryId !== manifest.canaryId ||
      report.canaryId !== authorization.canaryId
    ) {
      errors.push("report.canaryId no conserva el canary autorizado.");
    }
  }
  errors.push(
    ...validateD72StatefulCanaryAuthorization(authorization, {
      manifest,
      expectedBindings,
      now: report.startedAtUtc,
      authorizationConsumed: false,
    }),
  );
  if (
    !isCanonicalUtcTimestamp(report.startedAtUtc) ||
    !isCanonicalUtcTimestamp(report.completedAtUtc)
  ) {
    errors.push("La ventana de ejecución no usa timestamps UTC canónicos.");
  } else {
    const started = new Date(report.startedAtUtc).getTime();
    const completed = new Date(report.completedAtUtc).getTime();
    if (completed < started) {
      errors.push("La finalización canaria precede al inicio.");
    }
    if (
      isPlainObject(authorization) &&
      isCanonicalUtcTimestamp(authorization.authorizedAtUtc) &&
      started < new Date(authorization.authorizedAtUtc).getTime()
    ) {
      errors.push("El canary comenzó antes de la autorización separada.");
    }
    if (
      isPlainObject(manifest) &&
      isCanonicalUtcTimestamp(manifest.expiresAtUtc) &&
      completed >= new Date(manifest.expiresAtUtc).getTime()
    ) {
      errors.push("El canary terminó después de vencer el manifiesto.");
    }
    if (
      isPlainObject(manifest?.capability) &&
      isCanonicalUtcTimestamp(manifest.capability.expiresAtUtc) &&
      completed >= new Date(manifest.capability.expiresAtUtc).getTime()
    ) {
      errors.push("El canary terminó después de vencer la capability.");
    }
  }
  errors.push(
    ...evidenceErrors(report.evidence, {
      startedAtUtc: report.startedAtUtc,
      completedAtUtc: report.completedAtUtc,
      profile: report,
    }),
  );
  const passed = allEvidencePassed(report.evidence, report);
  if (
    report.statefulCanaryPassed !== passed ||
    report.releaseDisposition !==
      (passed
        ? D72_STATEFUL_CANARY_DISPOSITION.CONTINUE
        : failureDisposition(report))
  ) {
    errors.push("El reporte contradice la disposición fail-closed derivada.");
  }
  if (report.deploymentAuthorized !== false) {
    errors.push("El reporte canario nunca autoriza un deployment.");
  }
  errors.push(...recordHashErrors(report, "report"));
  return [...new Set(errors)];
}

export function d72StatefulCanaryExecutionBlockers({
  manifest,
  authorization,
  expectedBindings,
  now = new Date(),
  authorizationConsumed,
  canaryCapability,
  canaryCapabilityNonce,
  existingSecret,
} = {}) {
  return Object.freeze(
    [
      ...validateD72StatefulCanaryManifest(manifest, {
        expectedBindings,
        now,
      }),
      ...validateD72StatefulCanaryAuthorization(authorization, {
        manifest,
        expectedBindings,
        now,
        authorizationConsumed,
      }),
      ...capabilityRuntimeErrors({
        manifest,
        canaryCapability,
        existingSecret,
        canaryCapabilityNonce,
        now,
      }),
    ].filter((error, index, all) => all.indexOf(error) === index),
  );
}

export function d72StatefulCanaryContinuationBlockers({
  manifest,
  authorization,
  report,
  expectedBindings,
  now = new Date(),
  authorizationConsumed,
} = {}) {
  const errors = [
    ...validateD72StatefulCanaryManifest(manifest, {
      expectedBindings,
      now,
    }),
    ...validateD72StatefulCanaryReport(report, {
      manifest,
      authorization,
      expectedBindings,
    }),
  ];
  const currentTime = normalizedDate(now);
  if (!currentTime) {
    errors.push("now no es una fecha válida.");
  }
  if (authorizationConsumed !== true) {
    errors.push("La autorización single-use no consta como consumida.");
  }
  if (
    currentTime &&
    isCanonicalUtcTimestamp(report?.completedAtUtc) &&
    currentTime.getTime() < new Date(report.completedAtUtc).getTime()
  ) {
    errors.push("La continuación precede a la finalización del canary.");
  }
  if (
    report?.statefulCanaryPassed !== true ||
    report?.releaseDisposition !== D72_STATEFUL_CANARY_DISPOSITION.CONTINUE
  ) {
    errors.push("El canary exige rollback CLOSED.");
  }
  if (
    currentTime &&
    isCanonicalUtcTimestamp(manifest?.expiresAtUtc) &&
    currentTime.getTime() >= new Date(manifest.expiresAtUtc).getTime()
  ) {
    errors.push("La continuación canaria está vencida.");
  }
  return Object.freeze(
    errors.filter((error, index, all) => all.indexOf(error) === index),
  );
}

export function d72StatefulCanaryForbiddenEvidenceFieldNames() {
  return Object.freeze([
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
}

export function validateD72StatefulCanaryEvidenceSanitization(evidence) {
  return Object.freeze(evidenceErrors(evidence));
}

export function canonicalD72StatefulCanaryJson(value) {
  return canonicalJson(value);
}
