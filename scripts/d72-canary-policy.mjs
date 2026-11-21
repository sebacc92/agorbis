import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  openSync,
  readSync,
} from "node:fs";
import path from "node:path";
import {
  assertD72NonStatefulEvidenceAllowsCanary,
  d72CandidateIdentityHash,
  d72NonStatefulEvidenceCertificationHash,
} from "./d72-non-waivable-evidence-policy.mjs";
import { validateExceptionalReleaseArtifactManifest } from "./exceptional-release-artifact.mjs";
import {
  validateCloudflareClosedState,
  validateCloudflareOpenSourceState,
} from "./cloudflare-closed-state.mjs";
import {
  assertOpenReleaseBaselineRecord,
  assertOpenReleaseBaselineMatches,
} from "./open-release-baseline-policy.mjs";
import { d72ReleaseEvidenceProfile } from "./non-waivable-gate-evidence-catalog.mjs";
import { assertExceptionalOpenRecoveryCapsule } from "./exceptional-open-recovery-capsule.mjs";
import { createExceptionalOpenRecoveryPlan } from "./exceptional-release-cutover-policy.mjs";
import { RELEASE_GATE_POLICY_VERSION } from "./release-gate-policy.mjs";

export const D72_CANARY_NODE_VERSION = "22.22.0";
export const D72_CANARY_WRANGLER_VERSION = "4.160.1";
export const D72_CANARY_ACCOUNT_ID = "4d78fb10c1ae65281ec851479d5045dc";
export const D72_CANARY_WORKER_NAME = "agorbis";
export const D72_CANARY_RECEIPT_SCHEMA_VERSION =
  "agorbis-d72-canary-receipt/v2";
export const D72_CANARY_VERSION_CERTIFICATION_SCHEMA_VERSION =
  "agorbis-d72-canary-version-certification/v1";
export const D72_CANARY_VERSION_GET_ATTESTATION_SCHEMA_VERSION =
  "agorbis-d72-canary-version-get-attestation/v1";
export const D72_CANARY_VERSION_UPLOAD_RECEIPT_SCHEMA_VERSION =
  "agorbis-d72-canary-version-upload-receipt/v2";
export const D72_CANARY_VERSION_UPLOAD_PREVIEW_SCHEMA_VERSION =
  "agorbis-d72-canary-version-upload-preview/v1";
export const D72_CANARY_MAX_RECEIPT_AGE_MS = 60 * 60 * 1_000;
export const D72_CANARY_MAX_CAPABILITY_AGE_MS = 20 * 60 * 1_000;
const D72_CANARY_MAX_AUTHORIZATION_AGE_MS = 15 * 60 * 1_000;
const D72_CANARY_AUTHORIZATION_CLOCK_SKEW_MS = 30 * 1_000;
export const D72_CANARY_VERSION_OVERRIDE_HEADER =
  "Cloudflare-Workers-Version-Overrides";
export const D72_CANARY_CAPABILITY_HEADER = "X-Agorbis-D72-Canary";
export const D72_CANARY_HMAC_SECRET_BINDING = "CRON_SECRET";
export const D72_CANARY_DENIED_STATUS = 403;

export const D72_CANARY_ALLOWED_HOSTNAMES = Object.freeze([
  "agorbis.com",
  "www.agorbis.com",
]);

export const D72_CANARY_ALLOWED_WRANGLER_OPERATIONS = Object.freeze([
  "versions upload",
  "versions deploy",
]);

export const D72_CANARY_EXPECTED_SECRET_NAMES = Object.freeze([
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
]);
export const D72_CANARY_EXPECTED_BINDING_NAMES = Object.freeze([
  "AGORBIS_LAUNCH_MODE",
  "AGORBIS_RUNTIME",
  "ASSETS",
  "CRON_SECRET",
  "PUBLIC_FACEBOOK_AUTH_ENABLED",
  "PUBLIC_GOOGLE_AUTH_ENABLED",
  "PUBLIC_SITE_URL",
  "PUBLIC_SUPABASE_ANON_KEY",
  "PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_HOSTNAMES",
  "TURNSTILE_SECRET",
]);
export const D72_CANARY_EXPECTED_OPEN_CRONS = Object.freeze([
  "10 * * * *",
  "5 0 * * *",
  "25 0 * * *",
  "20 3 * * *",
  "40 3 * * *",
]);

const D72_CANARY_EXPECTED_PLAINTEXT_BINDINGS = Object.freeze({
  AGORBIS_LAUNCH_MODE: "open",
  AGORBIS_RUNTIME: "cloudflare-workers",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
  PUBLIC_GOOGLE_AUTH_ENABLED: "true",
  PUBLIC_SITE_URL: "https://agorbis.com",
  PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
  PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
  TURNSTILE_HOSTNAMES: "agorbis.com",
});

// These process-local capabilities deliberately do not survive cloning or JSON
// serialization. A structural object can be audited, but it cannot authorize
// the next mutating stage unless this module issued it from the preceding
// parser/factory in the same process.
const ISSUED_VERSION_UPLOAD_PLANS = new WeakSet();
const PRODUCTION_VERSION_UPLOAD_PLANS = new WeakSet();
const TEST_ONLY_VERSION_UPLOAD_PLANS = new WeakSet();
const VERSION_UPLOAD_RECEIPT_DATA = new WeakMap();
const VERSION_GET_ATTESTATION_DATA = new WeakMap();
const ISSUED_VERSION_CERTIFICATIONS = new WeakSet();
const ISSUED_CAPABILITY_GRANTS = new WeakMap();
const TTY_READER_DATA = new WeakMap();
const AUTHORIZATION_TOKEN_DATA = new WeakMap();

export const D72_CANARY_STATEFUL_CHECK_IDS = Object.freeze([
  "turnstile-a-valid",
  "turnstile-a-invalid-and-replay-rejected",
  "turnstile-b-direct-rejected",
  "auth-registration-email-confirmation",
  "smtp-confirmation-and-recovery",
  "auth-login-and-recovery",
  "pkce-and-secure-cookies",
  "mfa-totp",
  "storage-private-and-proxy",
  "ephemeral-state-cleanup",
]);

const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANARY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{6,62}[a-z0-9])$/;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const CAPABILITY_PATTERN = /^v1\.[A-Za-z0-9_-]{100,2048}\.[A-Za-z0-9_-]{43}$/;
const CAPABILITY_PAYLOAD_KEYS = Object.freeze([
  "artifactHash",
  "expiresAtUtc",
  "head",
  "issuedAtUtc",
  "nonce",
  "policyHash",
  "requestHash",
  "schemaVersion",
  "versionId",
]);
const CAPABILITY_NONCE_PATTERN = /^[0-9a-f]{64}$/;
const FORBIDDEN_WRANGLER_TOP_LEVEL_COMMANDS = new Set([
  "deploy",
  "dns",
  "domain",
  "domains",
  "route",
  "routes",
  "secret",
  "secrets",
  "triggers",
]);
const FORBIDDEN_WRANGLER_FLAGS = Object.freeze([
  "--domain",
  "--domains",
  "--preview-alias",
  "--route",
  "--routes",
  "--schedule",
  "--schedules",
  "--secret",
  "--secrets-file",
  "--trigger",
  "--triggers",
  "--workers-dev",
]);
const AUTHORIZATION_EVIDENCE_KEYS = Object.freeze([
  "confirmedAtUtc",
  "kind",
  "source",
  "statementSha256",
]);
const VERSION_OBSERVATION_KEYS = Object.freeze([
  "accountId",
  "activeClosedPercentage",
  "activeDeploymentId",
  "bindingNames",
  "candidateInActiveDeployment",
  "candidateTrafficPercentage",
  "candidateVersionId",
  "closedVersionId",
  "cronCount",
  "domains",
  "finalOpenCrons",
  "launchMode",
  "method",
  "message",
  "observedAtUtc",
  "previewUrlsEnabled",
  "secretNames",
  "source",
  "tag",
  "unknownBindingCount",
  "workerName",
  "workersDevEnabled",
  "versionScriptEtag",
]);
const VERSION_CERTIFICATION_KEYS = Object.freeze([
  "accountId",
  "activeClosedPercentage",
  "artifactHash",
  "candidateAttached",
  "candidateIdentityHash",
  "candidateTrafficPercentage",
  "candidateVersionId",
  "capabilityCreated",
  "closedDeploymentId",
  "closedVersionId",
  "configurationDigest",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "evidenceCertificationHash",
  "head",
  "observedAtUtc",
  "phase",
  "policyHash",
  "requestHash",
  "schemaVersion",
  "uploadPlanHash",
  "versionScriptEtag",
  "workerName",
]);
const VERSION_UPLOAD_OUTPUT_RECORD_KEYS = Object.freeze([
  "timestamp",
  "type",
  "version",
  "version_id",
  "worker_name",
  "worker_name_overridden",
  "worker_tag",
]);
const VERSION_UPLOAD_OUTPUT_OPTIONAL_KEYS = Object.freeze([
  "preview_alias_url",
  "preview_url",
  "wrangler_environment",
]);
const WRANGLER_SESSION_OUTPUT_KEYS = Object.freeze([
  "command_line_args",
  "log_file_path",
  "timestamp",
  "type",
  "version",
  "wrangler_version",
]);
const VERSION_GET_SET_KEYS = Object.freeze(["closedState", "version"]);
const VERSION_GET_REQUEST_KEYS = Object.freeze([
  "body",
  "endpoint",
  "method",
  "observedAtUtc",
  "status",
]);
const CLOSED_STATE_GET_KEYS = Object.freeze([
  "method",
  "observedAtUtc",
  "snapshot",
]);
const STANDARD_API_ENVELOPE_KEYS = Object.freeze([
  "errors",
  "messages",
  "result",
  "success",
]);
const VERSION_UPLOAD_PLAN_KEYS = Object.freeze([
  "artifactHash",
  "candidateAttached",
  "candidateIdentityHash",
  "candidateTrafficPercentage",
  "candidateVersionId",
  "capabilityCreated",
  "closedDeploymentId",
  "closedTrafficPercentage",
  "closedVersionId",
  "deploymentAuthorized",
  "deploymentExecuted",
  "evidenceCertificationHash",
  "head",
  "phase",
  "planSha256",
  "policyHash",
  "postUploadVerification",
  "requestHash",
  "schemaVersion",
  "upload",
  "versionUploadAuthorizationHash",
  "workerName",
]);
const POST_UPLOAD_VERIFICATION_KEYS = Object.freeze([
  "capabilityAllowedBeforeVerification",
  "candidateVersionIdSource",
  "method",
  "required",
]);
const PROBE_RESULT_KEYS = Object.freeze([
  "httpStatus",
  "id",
  "requestId",
  "status",
]);
const STATEFUL_RESULT_KEYS = Object.freeze(["id", "requestId", "status"]);
const CLEANUP_KEYS = Object.freeze([
  "activeVersionId",
  "activeVersionPercentage",
  "browserStateDestroyed",
  "canaryAccountDisposition",
  "canaryVersionInActiveDeployment",
  "cronCount",
  "deploymentDetached",
  "ephemeralStorageRemoved",
  "mailboxArtifactsRemoved",
  "testSessionsRevoked",
]);
const RECEIPT_KEYS = Object.freeze([
  "accountId",
  "artifactHash",
  "canaryCapabilityBindingHash",
  "canaryCapabilityExpiresAtUtc",
  "canaryId",
  "canaryInfrastructureMutationExecuted",
  "canaryTrafficPercentage",
  "canaryVersionId",
  "canaryVersionRetainedUndeployed",
  "cleanup",
  "closedVersionId",
  "completedAtUtc",
  "contentSha256",
  "expiresAtUtc",
  "head",
  "issuedAtUtc",
  "policyHash",
  "probes",
  "productionOpenDeploymentAuthorized",
  "productionOpenDeploymentExecuted",
  "requestHash",
  "schemaVersion",
  "statefulAuthorization",
  "statefulChecks",
  "statefulManifestHash",
  "versionCertifiedAtUtc",
  "versionCertificationHash",
  "versionUploadAuthorization",
  "workerName",
  "zeroPercentDeploymentAuthorization",
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} no es un objeto plano.`);
  }
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label} contiene campos faltantes o no aprobados.`);
  }
}

function allowedKeys(value, required, optional, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} no es un objeto plano.`);
  }
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error(`${label} contiene campos faltantes o no aprobados.`);
  }
}

function safeHead(value, label = "head") {
  if (typeof value !== "string" || !FULL_HEAD_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un HEAD completo en minúsculas.`);
  }
  return value;
}

function safeHash(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un SHA-256 completo en minúsculas.`);
  }
  return value;
}

function safeVersionId(value, label) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un Version ID UUID en minúsculas.`);
  }
  return value;
}

function safeScriptEtag(value, label = "versionScriptEtag") {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(
      `${label} debe ser el ETag SHA-256 retornado por Cloudflare.`,
    );
  }
  return value.toLowerCase();
}

function safeCanaryId(value) {
  if (typeof value !== "string" || !CANARY_ID_PATTERN.test(value)) {
    throw new Error(
      "canaryId debe tener 8-64 caracteres lowercase alfanuméricos o guiones.",
    );
  }
  return value;
}

function safeAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    CONTROL_OR_BIDI_PATTERN.test(value)
  ) {
    throw new Error(`${label} debe ser una ruta absoluta segura.`);
  }
  return path.resolve(value);
}

function isPathInsideOrEqual(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function safeInstant(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} debe ser un timestamp UTC.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} debe ser un timestamp UTC canónico.`);
  }
  return date;
}

function safeCloudflareInstant(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} debe ser un timestamp retornado por Cloudflare.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(
      `${label} no es un timestamp retornado por Cloudflare válido.`,
    );
  }
  return date;
}

function safeNow(value) {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("now no es una fecha válida.");
  }
  return date;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function d72CanaryCanonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function recordHash(value, label, excludedKey = "contentSha256") {
  if (!isPlainObject(value)) throw new Error(`${label} debe ser un objeto.`);
  const payload = { ...value };
  delete payload[excludedKey];
  return sha256(Buffer.from(d72CanaryCanonicalJson(payload), "utf8"));
}

export function d72CanaryVersionUploadPlanHash(plan) {
  return recordHash(plan, "plan upload canary", "planSha256");
}

export function d72CanaryVersionCertificationHash(certification) {
  return recordHash(certification, "certificación de Version canary");
}

function sameStrings(left, right) {
  return (
    Array.isArray(left) &&
    left.every((value) => typeof value === "string") &&
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
  );
}

function safeExistingSecret(value) {
  if (!(
    (typeof value === "string" && Buffer.byteLength(value, "utf8") >= 32) ||
    (Buffer.isBuffer(value) && value.byteLength >= 32)
  )) {
    throw new Error(
      `El capability canary exige ${D72_CANARY_HMAC_SECRET_BINDING} existente y de al menos 32 bytes.`,
    );
  }
  return value;
}

function capabilityBinding({
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryVersionId,
  versionId,
  issuedAtUtc,
  expiresAtUtc,
  nonce,
} = {}) {
  safeInstant(issuedAtUtc, "capability.issuedAtUtc");
  safeInstant(expiresAtUtc, "capability.expiresAtUtc");
  if (typeof nonce !== "string" || !CAPABILITY_NONCE_PATTERN.test(nonce)) {
    throw new Error("capability.nonce debe contener 32 bytes hexadecimales.");
  }
  return Object.freeze({
    artifactHash: safeHash(artifactHash, "artifactHash"),
    expiresAtUtc,
    head: safeHead(head),
    issuedAtUtc,
    nonce,
    policyHash: safeHash(policyHash, "policyHash"),
    requestHash: safeHash(requestHash, "requestHash"),
    schemaVersion: "agorbis-d72-canary-capability/v1",
    versionId: safeVersionId(canaryVersionId ?? versionId, "canaryVersionId"),
  });
}

export function d72CanaryCapabilityBindingHash(input = {}) {
  return sha256(
    Buffer.from(d72CanaryCanonicalJson(capabilityBinding(input)), "utf8"),
  );
}

function assertCapabilityWindow(issuedAtUtc, expiresAtUtc, now) {
  const issuedAt = safeInstant(issuedAtUtc, "capability.issuedAtUtc");
  const expiresAt = safeInstant(expiresAtUtc, "capability.expiresAtUtc");
  const current = safeNow(now);
  const remaining = expiresAt.getTime() - current.getTime();
  if (
    expiresAt <= issuedAt ||
    expiresAt.getTime() - issuedAt.getTime() >
      D72_CANARY_MAX_CAPABILITY_AGE_MS ||
    issuedAt.getTime() > current.getTime() + 30_000 ||
    remaining <= 0
  ) {
    throw new Error(
      "El capability canary debe estar vigente y expirar dentro de 20 minutos.",
    );
  }
}

export function createD72CanaryCapability({
  existingSecret,
  versionCertification,
  now = new Date(),
  ...bindingInput
} = {}) {
  const secret = safeExistingSecret(existingSecret);
  assertIssuedVersionCertification(versionCertification);
  if (versionCertification.artifactPurpose === "recovery") {
    throw new Error(
      "Una certificación recovery no autoriza capability ni tráfico canary.",
    );
  }
  const candidateVersionId = versionCertification?.candidateVersionId;
  const certificationErrors = validateD72CanaryVersionCertification(
    versionCertification,
    {
      expectedHead: bindingInput.head,
      expectedRequestHash: bindingInput.requestHash,
      expectedPolicyHash: bindingInput.policyHash,
      expectedArtifactHash: bindingInput.artifactHash,
      expectedCandidateVersionId: candidateVersionId,
      ...expectedSourceBindings(versionCertification),
      now,
    },
  );
  if (certificationErrors.length > 0) {
    throw new Error(
      `No se puede emitir capability antes de recertificar la Version por GET:\n${certificationErrors.join("\n")}`,
    );
  }
  if (
    Object.hasOwn(bindingInput, "canaryVersionId") &&
    bindingInput.canaryVersionId !== candidateVersionId
  ) {
    throw new Error(
      "candidateVersionId de capability no coincide con la Version recertificada.",
    );
  }
  bindingInput.canaryVersionId = candidateVersionId;
  assertCapabilityWindow(
    bindingInput.issuedAtUtc,
    bindingInput.expiresAtUtc,
    now,
  );
  const payload = capabilityBinding(bindingInput);
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signingInput = `${payload.schemaVersion}\0${encodedPayload}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput, "utf8")
    .digest("base64url");
  return `v1.${encodedPayload}.${signature}`;
}

export function createD72CanaryCapabilityGrant(options = {}) {
  const {
    versionCertification,
    issuedAtUtc,
    expiresAtUtc,
    ...capabilityOptions
  } = options;
  const capability = createD72CanaryCapability({
    ...capabilityOptions,
    issuedAtUtc,
    expiresAtUtc,
    versionCertification,
  });
  const binding = capabilityBinding({
    ...capabilityOptions,
    issuedAtUtc,
    expiresAtUtc,
    canaryVersionId: versionCertification.candidateVersionId,
  });
  const grant = deepFreeze({
    bindingHash: d72CanaryCapabilityBindingHash(binding),
    candidateVersionId: versionCertification.candidateVersionId,
    expiresAtUtc,
    issuedAtUtc,
    versionCertificationHash:
      d72CanaryVersionCertificationHash(versionCertification),
  });
  ISSUED_CAPABILITY_GRANTS.set(
    grant,
    Object.freeze({ binding, capability, versionCertification }),
  );
  return grant;
}

/** Project an issued grant for a stateful manifest without exposing its token or secret. */
export function d72CanaryStatefulCapabilityDescriptorFromGrant(
  grant,
  bindings,
  { now = new Date() } = {},
) {
  const issued = ISSUED_CAPABILITY_GRANTS.get(grant);
  if (!issued)
    throw new Error(
      "El manifiesto exige un grant canary opaco de esta corrida.",
    );
  for (const key of ["head", "requestHash", "policyHash", "artifactHash"])
    if (issued.binding[key] !== bindings?.[key])
      throw new Error(`Grant distinto de ${key}.`);
  if (issued.binding.versionId !== bindings?.canaryVersionId)
    throw new Error("Grant distinto de la versión stateful.");
  assertCapabilityWindow(
    issued.binding.issuedAtUtc,
    issued.binding.expiresAtUtc,
    now,
  );
  return deepFreeze({
    algorithm: "HMAC-SHA256",
    bindingHash: d72CanaryCapabilityBindingHash(issued.binding),
    capabilityId: sha256(Buffer.from(issued.capability, "utf8")),
    issuedAtUtc: issued.binding.issuedAtUtc,
    expiresAtUtc: issued.binding.expiresAtUtc,
    scope: "D72_STATEFUL_CANARY_ONLY",
    versionOverrideRequired: true,
    tokenStored: false,
    rawHeaderStored: false,
  });
}

function parseD72CanaryCapability(capability) {
  if (typeof capability !== "string" || !CAPABILITY_PATTERN.test(capability)) {
    throw new Error("Capability canary inválido.");
  }
  const [version, encodedPayload, signature] = capability.split(".");
  if (version !== "v1" || !encodedPayload || !signature) {
    throw new Error("Capability canary inválido.");
  }
  let source;
  let payload;
  try {
    source = Buffer.from(encodedPayload, "base64url").toString("utf8");
    if (Buffer.byteLength(source, "utf8") > 4 * 1_024) {
      throw new Error("oversize");
    }
    payload = JSON.parse(source);
    exactKeys(payload, CAPABILITY_PAYLOAD_KEYS, "capability.payload");
  } catch {
    throw new Error("Capability canary inválido.");
  }
  if (
    source !== JSON.stringify(capabilityBinding(payload)) ||
    Buffer.from(source, "utf8").toString("base64url") !== encodedPayload
  ) {
    throw new Error("Capability canary inválido.");
  }
  capabilityBinding(payload);
  return Object.freeze({ payload: Object.freeze({ ...payload }), signature });
}

export function verifyD72CanaryCapability({
  capability,
  existingSecret,
  retiredCapabilityBindingHashes = Object.freeze([]),
  now = new Date(),
  ...expectedBindingInput
} = {}) {
  try {
    const secret = safeExistingSecret(existingSecret);
    const parsed = parseD72CanaryCapability(capability);
    const expectedPayload = capabilityBinding(expectedBindingInput);
    if (
      !Array.isArray(retiredCapabilityBindingHashes) ||
      retiredCapabilityBindingHashes.some(
        (value) => typeof value !== "string" || !SHA256_PATTERN.test(value),
      )
    ) {
      return false;
    }
    const bindingHash = d72CanaryCapabilityBindingHash(expectedBindingInput);
    if (retiredCapabilityBindingHashes.includes(bindingHash)) return false;
    if (
      d72CanaryCanonicalJson(parsed.payload) !==
      d72CanaryCanonicalJson(expectedPayload)
    ) {
      return false;
    }
    assertCapabilityWindow(
      parsed.payload.issuedAtUtc,
      parsed.payload.expiresAtUtc,
      now,
    );
    const encodedPayload = Buffer.from(
      JSON.stringify(parsed.payload),
      "utf8",
    ).toString("base64url");
    const expectedSignature = createHmac("sha256", secret)
      .update(`${parsed.payload.schemaVersion}\0${encodedPayload}`, "utf8")
      .digest();
    const receivedSignature = Buffer.from(parsed.signature, "base64url");
    return (
      expectedSignature.length === receivedSignature.length &&
      timingSafeEqual(expectedSignature, receivedSignature)
    );
  } catch {
    return false;
  }
}

function immutableStep(step) {
  return Object.freeze({
    id: step.id,
    command: step.command,
    arguments: Object.freeze([...step.arguments]),
    shell: false,
  });
}

function immutableProbe(probe) {
  return Object.freeze({
    id: probe.id,
    phase: probe.phase,
    controlMode: probe.controlMode,
    method: "GET",
    url: probe.url,
    redirect: "manual",
    headers: Object.freeze({ ...probe.headers }),
    expectedStatus: probe.expectedStatus,
    expectedLocation: probe.expectedLocation ?? null,
  });
}

// OPEN_UPDATE uses explicit source identities. The historical CLOSED schema is
// kept unchanged; neither source profile can be inferred from a target config.
export function d72CanaryReleaseProfile(value = {}) {
  return d72ReleaseEvidenceProfile(value);
}
function isOpenUpdate(value) {
  return d72CanaryReleaseProfile(value).releaseMode === "OPEN_UPDATE";
}
function sourceField(value, legacy) {
  if (!isOpenUpdate(value)) return legacy;
  return (
    {
      closedVersionId: "sourceVersionId",
      closedDeploymentId: "sourceDeploymentId",
      closedTrafficPercentage: "sourceTrafficPercentage",
      activeClosedPercentage: "activeSourcePercentage",
    }[legacy] ?? legacy
  );
}
function sourceVersion(value) {
  return value[sourceField(value, "closedVersionId")];
}
function sourceDeployment(value) {
  return value[sourceField(value, "closedDeploymentId")];
}
function sourceKeys(keys, value, { baseline = false, recovery = false } = {}) {
  if (!isOpenUpdate(value)) return keys;
  return [
    ...keys.map((key) => sourceField(value, key)),
    "releaseMode",
    "openSourceBaselineSha256",
    ...(baseline ? ["openSourceBaseline"] : []),
    ...(recovery ? ["recoveryVersionId", "recoveryCapsuleHash"] : []),
  ];
}
export function d72CanarySourceBindings(
  value,
  { includeDeployment = true } = {},
) {
  const profile = d72CanaryReleaseProfile(value);
  if (
    profile.releaseMode === "OPEN_UPDATE" &&
    ["closedVersionId", "closedDeploymentId"].some((key) =>
      Object.hasOwn(value, key),
    )
  )
    throw new Error("OPEN_UPDATE no admite identidades CLOSED.");
  if (
    !profile.releaseMode &&
    ["sourceVersionId", "sourceDeploymentId", "openSourceBaseline"].some(
      (key) => Object.hasOwn(value, key),
    )
  )
    throw new Error(
      "Una identidad source exige el perfil OPEN_UPDATE explícito.",
    );
  return Object.freeze({
    ...profile,
    ...(includeDeployment
      ? {
          [sourceField(value, "closedDeploymentId")]: safeVersionId(
            sourceDeployment(value),
            "source deployment",
          ),
        }
      : {}),
    [sourceField(value, "closedVersionId")]: safeVersionId(
      sourceVersion(value),
      "source version",
    ),
  });
}
function expectedSourceBindings(value) {
  return isOpenUpdate(value)
    ? {
        expectedReleaseMode: "OPEN_UPDATE",
        expectedOpenSourceBaselineSha256: value.openSourceBaselineSha256,
        expectedSourceDeploymentId: value.sourceDeploymentId,
        expectedSourceVersionId: value.sourceVersionId,
      }
    : {
        expectedClosedDeploymentId: value.closedDeploymentId,
        expectedClosedVersionId: value.closedVersionId,
      };
}

// A recovery upload belongs to the primary candidate identity, but uploads a
// different, pinned artifact. Never replace artifactHash with that second hash.
export function d72CanaryUploadArtifactBindings(value = {}) {
  if (
    !Object.hasOwn(value, "artifactPurpose") &&
    !Object.hasOwn(value, "uploadArtifactHash")
  )
    return Object.freeze({});
  if (!isOpenUpdate(value) || value.artifactPurpose !== "recovery") {
    throw new Error(
      "Sólo OPEN_UPDATE admite un upload separado con propósito recovery.",
    );
  }
  const uploadArtifactHash = safeHash(
    value.uploadArtifactHash,
    "uploadArtifactHash",
  );
  if (
    value.artifactHash !== undefined &&
    uploadArtifactHash === value.artifactHash
  ) {
    throw new Error("El artifact recovery debe diferir del artifact primario.");
  }
  return Object.freeze({ artifactPurpose: "recovery", uploadArtifactHash });
}

function uploadArtifactKeys(keys, value) {
  return [...keys, ...Object.keys(d72CanaryUploadArtifactBindings(value))];
}

function assertRecoveryUploadManifests(options, context) {
  const recovery = context.artifactPurpose === "recovery";
  if (!recovery) {
    if (
      Object.hasOwn(options, "primaryArtifactManifest") ||
      Object.hasOwn(options, "recoveryArtifactManifest")
    ) {
      throw new Error(
        "Los manifiestos primary/recovery sólo corresponden al upload recovery explícito.",
      );
    }
    return;
  }
  for (const [manifest, purpose, expectedArtifactHash] of [
    [options.primaryArtifactManifest, "primary", context.artifactHash],
    [options.recoveryArtifactManifest, "recovery", context.uploadArtifactHash],
  ]) {
    const errors = validateExceptionalReleaseArtifactManifest(manifest, {
      expectedHead: context.head,
      expectedRequestHash: context.requestHash,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: context.policyHash,
      expectedArtifactHash,
    });
    if (
      errors.length ||
      manifest?.artifactPurpose !== purpose ||
      manifest.releaseMode !== context.releaseMode ||
      manifest.openSourceBaselineSha256 !== context.openSourceBaselineSha256
    ) {
      throw new Error(
        `El manifest ${purpose} no liga el upload recovery al candidato y baseline: ${errors.join("; ")}`,
      );
    }
  }
  if (
    options.primaryArtifactManifest.recoveryArtifactHash !==
    context.uploadArtifactHash
  ) {
    throw new Error(
      "El artifact primario no fija el hash del fallback a subir.",
    );
  }
}

function basePlanContext({
  repositoryRoot,
  artifactRoot,
  nodeExecutable,
  nodeVersion,
  wranglerVersion,
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryId,
  ...sourceOptions
} = {}) {
  const root = safeAbsolutePath(repositoryRoot, "repositoryRoot");
  const frozenRoot = safeAbsolutePath(artifactRoot, "artifactRoot");
  const node = safeAbsolutePath(nodeExecutable, "nodeExecutable");
  if (path.basename(node) !== "node") {
    throw new Error("nodeExecutable debe resolver a un binario llamado node.");
  }
  if (isPathInsideOrEqual(frozenRoot, root)) {
    throw new Error("artifactRoot debe quedar fuera del worktree.");
  }
  if (
    nodeVersion !== D72_CANARY_NODE_VERSION ||
    wranglerVersion !== D72_CANARY_WRANGLER_VERSION
  ) {
    throw new Error("El canary exige Node 22.22.0 y Wrangler 4.160.1.");
  }
  const context = {
    root,
    frozenRoot,
    node,
    head: safeHead(head),
    requestHash: safeHash(requestHash, "requestHash"),
    policyHash: safeHash(policyHash, "policyHash"),
    artifactHash: safeHash(artifactHash, "artifactHash"),
    ...d72CanaryUploadArtifactBindings({ artifactHash, ...sourceOptions }),
    canaryId: safeCanaryId(canaryId),
    ...d72CanarySourceBindings(sourceOptions),
    ...(isOpenUpdate(sourceOptions)
      ? { openSourceBaseline: sourceOptions.openSourceBaseline }
      : {}),
  };
  if (isOpenUpdate(context)) {
    assertOpenReleaseBaselineRecord({
      baseline: context.openSourceBaseline,
      expectedBaselineSha256: context.openSourceBaselineSha256,
      nowUtc: (sourceOptions.now ?? new Date()).toISOString(),
    });
    if (
      context.openSourceBaseline.versionId !== context.sourceVersionId ||
      context.openSourceBaseline.deploymentId !== context.sourceDeploymentId
    )
      throw new Error(
        "La identidad source no coincide con el baseline OPEN sellado.",
      );
  }
  assertRecoveryUploadManifests(sourceOptions, context);
  return Object.freeze(context);
}

function certifiedCandidateContext({
  versionCertification,
  zeroPercentDeploymentAuthorizationToken,
  canaryCapabilityGrant,
  canaryCapability,
  canaryCapabilityIssuedAtUtc,
  canaryCapabilityExpiresAtUtc,
  canaryCapabilityNonce,
  existingSecret,
  now = new Date(),
  ...baseOptions
} = {}) {
  const context = basePlanContext({ ...baseOptions, now });
  assertIssuedVersionCertification(versionCertification);
  if (
    context.artifactPurpose === "recovery" ||
    versionCertification.artifactPurpose === "recovery"
  ) {
    throw new Error(
      "Una versión recovery no puede adjuntarse como candidata canary.",
    );
  }
  const certificationErrors = validateD72CanaryVersionCertification(
    versionCertification,
    {
      expectedHead: context.head,
      expectedRequestHash: context.requestHash,
      expectedPolicyHash: context.policyHash,
      expectedArtifactHash: context.artifactHash,
      ...expectedSourceBindings(context),
      now,
    },
  );
  if (certificationErrors.length > 0) {
    throw new Error(
      `La Version candidata no fue recertificada por GET:\n${certificationErrors.join("\n")}`,
    );
  }
  const canaryVersionId = versionCertification.candidateVersionId;
  const versionCertificationHash =
    d72CanaryVersionCertificationHash(versionCertification);
  const zeroPercentAuthorizationBindings = Object.freeze({
    head: context.head,
    requestHash: context.requestHash,
    policyHash: context.policyHash,
    artifactHash: context.artifactHash,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    ...d72CanarySourceBindings(context),
    candidateVersionId: canaryVersionId,
    versionCertificationHash,
  });
  const zeroPercentAuthorization = assertAuthorizationToken(
    zeroPercentDeploymentAuthorizationToken,
    "zero-percent-deployment",
    zeroPercentAuthorizationBindings,
  );
  let issuedAt;
  let expiresAt;
  let capability;
  let nonce;
  if (
    canaryCapabilityGrant === undefined ||
    canaryCapability !== undefined ||
    canaryCapabilityIssuedAtUtc !== undefined ||
    canaryCapabilityExpiresAtUtc !== undefined ||
    canaryCapabilityNonce !== undefined ||
    existingSecret !== undefined
  ) {
    throw new Error(
      "El plan exige exclusivamente el grant HMAC opaco; no admite capability ni CRON_SECRET del caller.",
    );
  }
  const grantData = ISSUED_CAPABILITY_GRANTS.get(canaryCapabilityGrant);
  if (
    !grantData ||
    grantData.versionCertification !== versionCertification ||
    grantData.binding.head !== context.head ||
    grantData.binding.requestHash !== context.requestHash ||
    grantData.binding.policyHash !== context.policyHash ||
    grantData.binding.artifactHash !== context.artifactHash ||
    grantData.binding.versionId !== canaryVersionId
  ) {
    throw new Error(
      "El plan exige el grant HMAC opaco de la Version recertificada exacta.",
    );
  }
  assertCapabilityWindow(
    grantData.binding.issuedAtUtc,
    grantData.binding.expiresAtUtc,
    now,
  );
  capability = grantData.capability;
  issuedAt = grantData.binding.issuedAtUtc;
  expiresAt = grantData.binding.expiresAtUtc;
  nonce = grantData.binding.nonce;
  return Object.freeze({
    ...context,
    canaryVersionId,
    canaryCapability: capability,
    canaryCapabilityIssuedAtUtc: issuedAt,
    canaryCapabilityExpiresAtUtc: expiresAt,
    versionCertificationHash,
    zeroPercentDeploymentAuthorizationHash:
      zeroPercentAuthorization.evidence.statementSha256,
    canaryCapabilityBindingHash: d72CanaryCapabilityBindingHash({
      head: context.head,
      requestHash: context.requestHash,
      policyHash: context.policyHash,
      artifactHash: context.artifactHash,
      canaryVersionId,
      issuedAtUtc: issuedAt,
      expiresAtUtc: expiresAt,
      nonce,
    }),
  });
}

function wranglerEntrypoint(root) {
  return path.join(root, "node_modules", "wrangler", "wrangler-dist", "cli.js");
}

function emptyEnvironmentPath(context) {
  return path.join(context.frozenRoot, "exceptional-release-empty.env");
}

function remoteBinding(context, phase) {
  if (!["upload", "attach", "detach"].includes(phase)) {
    throw new Error("La fase remota canary no es válida.");
  }
  return Object.freeze({
    schemaVersion: "agorbis-d72-canary-remote-binding/v2",
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    phase,
    head: context.head,
    requestHash: context.requestHash,
    policyHash: context.policyHash,
    artifactHash: context.artifactHash,
    canaryId: context.canaryId,
    ...d72CanaryUploadArtifactBindings(context),
    canaryCapabilityBindingHash:
      phase === "upload" ? null : context.canaryCapabilityBindingHash,
    canaryCapabilityExpiresAtUtc:
      phase === "upload" ? null : context.canaryCapabilityExpiresAtUtc,
    ...d72CanarySourceBindings(context),
    canaryVersionId: phase === "upload" ? null : context.canaryVersionId,
    candidateTrafficPercentage: 0,
    [sourceField(context, "closedTrafficPercentage")]: 100,
  });
}

export function d72CanaryRemoteMessage(context, phase) {
  const binding = remoteBinding(context, phase);
  return `agorbis-d72-canary:${phase}:v1:${sha256(
    Buffer.from(d72CanaryCanonicalJson(binding), "utf8"),
  )}`;
}

export function d72CanaryInfrastructureAuthorizationPhrase({
  head,
  requestHash,
  policyHash,
  artifactHash,
  accountId = D72_CANARY_ACCOUNT_ID,
  workerName = D72_CANARY_WORKER_NAME,
  candidateVersionId,
  versionCertificationHash,
  ...sourceOptions
} = {}) {
  if (
    accountId !== D72_CANARY_ACCOUNT_ID ||
    workerName !== D72_CANARY_WORKER_NAME
  ) {
    throw new Error("La autorización 0% no corresponde a cuenta/Worker D72.");
  }
  const source = d72CanarySourceBindings(sourceOptions);
  if (isOpenUpdate(source))
    return `AUTORIZO CANARY CLOUDFLARE D72 AL CERO POR CIENTO PARA ${safeHead(head)} CON REQUEST ${safeHash(requestHash, "requestHash")} POLICY ${safeHash(policyHash, "policyHash")} Y ARTEFACTO ${safeHash(artifactHash, "artifactHash")} EN CUENTA ${accountId} WORKER ${workerName} OPEN SOURCE DEPLOYMENT ${source.sourceDeploymentId} VERSION ${source.sourceVersionId} BASELINE ${source.openSourceBaselineSha256} AL CIEN POR CIENTO Y CANDIDATE ${safeVersionId(candidateVersionId, "candidateVersionId")} AL CERO POR CIENTO CON CERTIFICACION ${safeHash(versionCertificationHash, "versionCertificationHash")}`;
  const { closedDeploymentId, closedVersionId } = source;
  return `AUTORIZO CANARY CLOUDFLARE D72 AL CERO POR CIENTO PARA ${safeHead(
    head,
  )} CON REQUEST ${safeHash(requestHash, "requestHash")} POLICY ${safeHash(
    policyHash,
    "policyHash",
  )} Y ARTEFACTO ${safeHash(artifactHash, "artifactHash")} EN CUENTA ${accountId} WORKER ${workerName} CLOSED DEPLOYMENT ${safeVersionId(
    closedDeploymentId,
    "closedDeploymentId",
  )} VERSION ${safeVersionId(
    closedVersionId,
    "closedVersionId",
  )} AL CIEN POR CIENTO Y CANDIDATE ${safeVersionId(
    candidateVersionId,
    "candidateVersionId",
  )} AL CERO POR CIENTO CON CERTIFICACION ${safeHash(
    versionCertificationHash,
    "versionCertificationHash",
  )}`;
}

export function d72CanaryVersionUploadAuthorizationPhrase({
  head,
  requestHash,
  policyHash,
  artifactHash,
  workerName = D72_CANARY_WORKER_NAME,
  ...sourceOptions
} = {}) {
  if (workerName !== D72_CANARY_WORKER_NAME) {
    throw new Error("La autorización upload sólo admite el Worker agorbis.");
  }
  const source = d72CanarySourceBindings(sourceOptions, {
    includeDeployment: false,
  });
  const upload = d72CanaryUploadArtifactBindings({
    artifactHash,
    ...sourceOptions,
  });
  if (upload.artifactPurpose === "recovery")
    return `AUTORIZO CREAR VERSION RECOVERY CLOUDFLARE D72 SIN DEPLOYMENT NI TRAFICO PARA ${safeHead(head)} CON REQUEST ${safeHash(requestHash, "requestHash")} POLICY ${safeHash(policyHash, "policyHash")} ARTEFACTO PRIMARIO ${safeHash(artifactHash, "artifactHash")} Y ARTEFACTO RECOVERY ${upload.uploadArtifactHash} CON GOOGLE FALSE FACEBOOK FALSE WORKER ${workerName} OPEN SOURCE ${source.sourceVersionId} BASELINE ${source.openSourceBaselineSha256} AL CIEN POR CIENTO`;
  if (isOpenUpdate(source))
    return `AUTORIZO CREAR VERSION CANARIA CLOUDFLARE D72 SIN DEPLOYMENT NI TRAFICO PARA ${safeHead(head)} CON REQUEST ${safeHash(requestHash, "requestHash")} POLICY ${safeHash(policyHash, "policyHash")} ARTEFACTO ${safeHash(artifactHash, "artifactHash")} WORKER ${workerName} OPEN SOURCE ${source.sourceVersionId} BASELINE ${source.openSourceBaselineSha256} AL CIEN POR CIENTO Y CANDIDATE AL CERO POR CIENTO`;
  const { closedVersionId } = source;
  return `AUTORIZO CREAR VERSION CANARIA CLOUDFLARE D72 SIN DEPLOYMENT NI TRAFICO PARA ${safeHead(
    head,
  )} CON REQUEST ${safeHash(requestHash, "requestHash")} POLICY ${safeHash(
    policyHash,
    "policyHash",
  )} ARTEFACTO ${safeHash(
    artifactHash,
    "artifactHash",
  )} WORKER ${workerName} CLOSED ${safeVersionId(
    closedVersionId,
    "closedVersionId",
  )} AL CIEN POR CIENTO Y CANDIDATE AL CERO POR CIENTO`;
}

export function d72CanaryStatefulAuthorizationPhrase({
  head,
  canaryId,
  statefulManifestHash,
} = {}) {
  return `AUTORIZO EJECUTAR EL MANIFIESTO STATEFUL D72 ${safeHash(
    statefulManifestHash,
    "statefulManifestHash",
  )} EN PRODUCCIÓN PARA ${safeHead(head)} CON CANARY ${safeCanaryId(
    canaryId,
  )} Y SU LIMPIEZA CONTROLADA`;
}

export function createD72CanaryAuthorizationEvidence({
  kind,
  statement,
  source,
  confirmedAtUtc,
  head,
  requestHash,
  artifactHash,
  policyHash,
  accountId,
  workerName,
  candidateVersionId,
  versionCertificationHash,
  canaryId,
  statefulManifestHash,
  ...sourceOptions
} = {}) {
  if (
    !["version-upload", "zero-percent-deployment", "stateful"].includes(kind)
  ) {
    throw new Error("kind de autorización canary no es válido.");
  }
  if (source !== "/dev/tty") {
    throw new Error("La autorización canary sólo se acepta desde /dev/tty.");
  }
  safeInstant(confirmedAtUtc, "confirmedAtUtc");
  let expected;
  if (kind === "version-upload") {
    expected = d72CanaryVersionUploadAuthorizationPhrase({
      head,
      requestHash,
      policyHash,
      artifactHash,
      workerName,
      ...d72CanarySourceBindings(sourceOptions, { includeDeployment: false }),
      ...d72CanaryUploadArtifactBindings({ artifactHash, ...sourceOptions }),
    });
  } else if (kind === "zero-percent-deployment") {
    expected = d72CanaryInfrastructureAuthorizationPhrase({
      head,
      requestHash,
      policyHash,
      artifactHash,
      accountId,
      workerName,
      ...d72CanarySourceBindings(sourceOptions),
      candidateVersionId,
      versionCertificationHash,
    });
  } else {
    expected = d72CanaryStatefulAuthorizationPhrase({
      head,
      canaryId,
      statefulManifestHash,
    });
  }
  if (statement !== expected) {
    throw new Error(`La autorización ${kind} no coincide literalmente.`);
  }
  return Object.freeze({
    kind,
    source,
    confirmedAtUtc,
    statementSha256: sha256(Buffer.from(statement, "utf8")),
  });
}

/**
 * Wraps the only reader accepted by the authorization issuer. Production code
 * passes a reader that opens `/dev/tty`; tests may inject a fixture reader but
 * cannot manufacture the resulting authorization token from a source string.
 */
export function createD72CanaryDevTtyReader({
  readLineImpl,
  testOnly = false,
} = {}) {
  if (testOnly !== true || typeof readLineImpl !== "function") {
    throw new Error(
      "El lector inyectable D72 existe sólo para fixtures testOnly.",
    );
  }
  const reader = () => readLineImpl();
  TTY_READER_DATA.set(
    reader,
    Object.freeze({ source: "/dev/tty", testOnly: true }),
  );
  return Object.freeze(reader);
}

export function createD72CanaryProductionDevTtyReader() {
  const reader = () => {
    const flags =
      fsConstants.O_RDONLY |
      (fsConstants.O_CLOEXEC ?? 0) |
      fsConstants.O_NOFOLLOW;
    const descriptor = openSync("/dev/tty", flags);
    const bytes = Buffer.alloc(16 * 1_024);
    let length = 0;
    try {
      while (length < bytes.length) {
        const count = readSync(descriptor, bytes, length, 1, null);
        if (count === 0 || bytes[length] === 0x0a) break;
        if (bytes[length] !== 0x0d) length += 1;
      }
      if (length === bytes.length) {
        throw new Error("La autorización /dev/tty excede el límite.");
      }
      return bytes.subarray(0, length).toString("utf8");
    } finally {
      bytes.fill(0);
      closeSync(descriptor);
    }
  };
  TTY_READER_DATA.set(
    reader,
    Object.freeze({ source: "/dev/tty", testOnly: false }),
  );
  return Object.freeze(reader);
}

function expectedAuthorizationStatement(kind, bindings) {
  if (kind === "version-upload") {
    return d72CanaryVersionUploadAuthorizationPhrase(bindings);
  }
  if (kind === "zero-percent-deployment") {
    return d72CanaryInfrastructureAuthorizationPhrase(bindings);
  }
  if (kind === "stateful") {
    return d72CanaryStatefulAuthorizationPhrase(bindings);
  }
  throw new Error("kind de autorización canary no es válido.");
}

export function readD72CanaryAuthorizationToken(options = {}) {
  const { kind, bindings, ttyReader } = options;
  const readerData = TTY_READER_DATA.get(ttyReader);
  if (!readerData || readerData.source !== "/dev/tty") {
    throw new Error(
      "La autorización D72 requiere el lector opaco de /dev/tty.",
    );
  }
  if (!readerData.testOnly && Object.hasOwn(options, "confirmedAtUtc")) {
    throw new Error(
      "La autorización productiva fija confirmedAtUtc con el reloj interno.",
    );
  }
  const allowedOptionKeys = readerData.testOnly
    ? ["bindings", "confirmedAtUtc", "kind", "ttyReader"]
    : ["bindings", "kind", "ttyReader"];
  if (
    !isPlainObject(options) ||
    JSON.stringify(Object.keys(options).sort()) !==
      JSON.stringify(allowedOptionKeys)
  ) {
    throw new Error(
      "La lectura de autorización D72 contiene opciones faltantes o desconocidas.",
    );
  }
  const confirmedAtUtc =
    readerData.testOnly && Object.hasOwn(options, "confirmedAtUtc")
      ? options.confirmedAtUtc
      : new Date().toISOString();
  const expected = expectedAuthorizationStatement(kind, bindings);
  const line = ttyReader();
  if (typeof line !== "string" || line !== expected) {
    throw new Error(`La autorización ${kind} no coincide literalmente.`);
  }
  safeInstant(confirmedAtUtc, "confirmedAtUtc");
  const evidence = Object.freeze({
    kind,
    source: "/dev/tty",
    confirmedAtUtc,
    statementSha256: sha256(Buffer.from(expected, "utf8")),
  });
  const token = Object.freeze({
    kind,
    confirmedAtUtc,
    statementSha256: evidence.statementSha256,
  });
  AUTHORIZATION_TOKEN_DATA.set(
    token,
    Object.freeze({
      bindings: deepFreeze({ ...bindings }),
      evidence,
      expected,
      testOnly: readerData.testOnly,
      consumed: false,
    }),
  );
  return token;
}

function assertAuthorizationToken(token, kind, bindings) {
  const data = AUTHORIZATION_TOKEN_DATA.get(token);
  const expected = expectedAuthorizationStatement(kind, bindings);
  if (
    !data ||
    data.kind === "invalid" ||
    token.kind !== kind ||
    data.expected !== expected
  ) {
    throw new Error(
      `La etapa ${kind} requiere el token opaco exacto emitido por /dev/tty.`,
    );
  }
  return data;
}

export function d72CanaryAuthorizationEvidenceFromToken(token) {
  const data = AUTHORIZATION_TOKEN_DATA.get(token);
  if (!data) {
    throw new Error(
      "El token de autorización D72 no fue emitido en este proceso.",
    );
  }
  return data.evidence;
}

/** Revalidate a production TTY grant without consuming the later mutation's token. */
export function assertD72CanaryProductionAuthorizationToken(
  token,
  options = {},
) {
  exactKeys(options, ["kind", "bindings"], "productionAuthorization");
  const data = assertAuthorizationToken(token, options.kind, options.bindings);
  const current = new Date();
  const confirmed = safeInstant(data.evidence.confirmedAtUtc, "confirmedAtUtc");
  if (
    data.testOnly ||
    data.consumed ||
    confirmed.getTime() >
      current.getTime() + D72_CANARY_AUTHORIZATION_CLOCK_SKEW_MS ||
    current.getTime() - confirmed.getTime() >
      D72_CANARY_MAX_AUTHORIZATION_AGE_MS
  )
    throw new Error(
      "La preparación exige autorización TTY productiva, vigente y no consumida.",
    );
  return data.evidence;
}

export function consumeD72CanaryAuthorizationToken(token, options = {}) {
  const { kind, bindings, allowTestToken = false } = options;
  const data = assertAuthorizationToken(token, kind, bindings);
  const allowedOptionKeys = data.testOnly
    ? ["allowTestToken", "bindings", "kind", "now"]
    : ["bindings", "kind"];
  if (
    !isPlainObject(options) ||
    JSON.stringify(Object.keys(options).sort()) !==
      JSON.stringify(allowedOptionKeys)
  ) {
    throw new Error(
      "El consumo de autorización D72 contiene opciones faltantes o desconocidas.",
    );
  }
  if (data.consumed || (data.testOnly && allowTestToken !== true)) {
    throw new Error(
      data.consumed
        ? "El token de autorización D72 ya fue consumido."
        : "Un token fixture nunca puede autorizar una mutación real.",
    );
  }
  if (!data.testOnly && Object.hasOwn(options, "now")) {
    throw new Error(
      "El consumo productivo de autorización fija el reloj internamente.",
    );
  }
  const injectedNow =
    data.testOnly && allowTestToken === true && Object.hasOwn(options, "now")
      ? options.now
      : null;
  const current =
    injectedNow instanceof Date && Number.isFinite(injectedNow.getTime())
      ? new Date(injectedNow.getTime())
      : injectedNow !== null
        ? safeInstant(injectedNow, "now")
        : new Date();
  const confirmedAt = safeInstant(
    data.evidence.confirmedAtUtc,
    "confirmedAtUtc",
  );
  if (
    confirmedAt.getTime() >
      current.getTime() + D72_CANARY_AUTHORIZATION_CLOCK_SKEW_MS ||
    current.getTime() - confirmedAt.getTime() >
      D72_CANARY_MAX_AUTHORIZATION_AGE_MS
  ) {
    throw new Error("El token de autorización D72 está vencido o adelantado.");
  }
  AUTHORIZATION_TOKEN_DATA.set(
    token,
    Object.freeze({ ...data, consumed: true }),
  );
  return data.evidence;
}

function assertCandidateIdentityCertification({
  candidateIdentity,
  nonStatefulCertification,
  context,
  now,
  allowTestOnly = false,
}) {
  const evidenceOptions = {
    candidateIdentity,
    expectedHead: context.head,
    expectedRequestHash: context.requestHash,
    expectedArtifactHash: context.artifactHash,
    ...(allowTestOnly ? { allowTestOnly: true, now } : {}),
  };
  assertD72NonStatefulEvidenceAllowsCanary(
    nonStatefulCertification,
    evidenceOptions,
  );
  if (
    candidateIdentity.releaseMode !== context.releaseMode ||
    candidateIdentity.openSourceBaselineSha256 !==
      context.openSourceBaselineSha256 ||
    nonStatefulCertification.releaseMode !== context.releaseMode ||
    nonStatefulCertification.openSourceBaselineSha256 !==
      context.openSourceBaselineSha256 ||
    candidateIdentity.policyHash !== context.policyHash ||
    nonStatefulCertification.policyHash !== context.policyHash
  ) {
    throw new Error(
      "Candidate identity y certificación no-stateful no coinciden con policyHash.",
    );
  }
}

function uploadStep(context) {
  const wrangler = wranglerEntrypoint(context.root);
  return immutableStep({
    id: "upload-open-canary-version-only",
    command: context.node,
    arguments: [
      wrangler,
      "versions",
      "upload",
      "--config",
      path.join(context.frozenRoot, "wrangler.jsonc"),
      "--cwd",
      context.frozenRoot,
      "--env-file",
      emptyEnvironmentPath(context),
      "--name",
      D72_CANARY_WORKER_NAME,
      "--no-experimental-provision",
      "--no-experimental-auto-create",
      "--strict",
      "--tag",
      `d72-canary-${context.head}`,
      "--message",
      d72CanaryRemoteMessage(context, "upload"),
    ],
  });
}

export function createD72CanaryVersionUploadAuthorizationPreview(options = {}) {
  for (const forbidden of [
    "candidateVersionId",
    "canaryCapability",
    "canaryCapabilityIssuedAtUtc",
    "canaryCapabilityExpiresAtUtc",
    "canaryCapabilityNonce",
    "existingSecret",
    "versionCertification",
    "versionUploadAuthorizationToken",
  ]) {
    if (Object.hasOwn(options, forbidden)) {
      throw new Error(
        `El preview Stage 1 no admite ${forbidden}: no existe autorización ni Version candidata.`,
      );
    }
  }
  const {
    candidateIdentity,
    nonStatefulCertification,
    testOnlyEvidence = false,
    ...baseOptions
  } = options;
  if (typeof testOnlyEvidence !== "boolean") {
    throw new Error("testOnlyEvidence debe ser booleano explícito.");
  }
  if (!testOnlyEvidence && Object.hasOwn(options, "now")) {
    throw new Error("El preview Stage 1 productivo no admite reloj inyectado.");
  }
  const now =
    testOnlyEvidence && Object.hasOwn(options, "now")
      ? options.now
      : new Date();
  const context = basePlanContext(baseOptions);
  assertCandidateIdentityCertification({
    candidateIdentity,
    nonStatefulCertification,
    context,
    now,
    allowTestOnly: testOnlyEvidence,
  });
  const authorizationBindings = Object.freeze({
    head: context.head,
    requestHash: context.requestHash,
    policyHash: context.policyHash,
    artifactHash: context.artifactHash,
    workerName: D72_CANARY_WORKER_NAME,
    ...d72CanarySourceBindings(context, { includeDeployment: false }),
    ...d72CanaryUploadArtifactBindings(context),
  });
  const payload = {
    schemaVersion: D72_CANARY_VERSION_UPLOAD_PREVIEW_SCHEMA_VERSION,
    phase: "version_upload_authorization_preview",
    workerName: D72_CANARY_WORKER_NAME,
    head: context.head,
    requestHash: context.requestHash,
    policyHash: context.policyHash,
    artifactHash: context.artifactHash,
    ...d72CanaryUploadArtifactBindings(context),
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    evidenceCertificationHash: d72NonStatefulEvidenceCertificationHash(
      nonStatefulCertification,
    ),
    ...d72CanarySourceBindings(context),
    ...(isOpenUpdate(context)
      ? { openSourceBaseline: context.openSourceBaseline }
      : {}),
    [sourceField(context, "closedTrafficPercentage")]: 100,
    candidateVersionId: null,
    candidateTrafficPercentage: 0,
    candidateAttached: false,
    capabilityCreated: false,
    authorizationRequired: true,
    authorizationPhrase: d72CanaryVersionUploadAuthorizationPhrase(
      authorizationBindings,
    ),
    deploymentAuthorized: false,
    deploymentExecuted: false,
    remoteMutationExecuted: false,
    upload: uploadStep(context),
    postUploadVerification: Object.freeze({
      required: true,
      method: "GET",
      candidateVersionIdSource: "wrangler-output-file-v1-then-cloudflare-get",
      capabilityAllowedBeforeVerification: false,
    }),
  };
  return deepFreeze({
    ...payload,
    previewSha256: sha256(Buffer.from(d72CanaryCanonicalJson(payload), "utf8")),
  });
}

export function createD72CanaryVersionUploadPlan(options = {}) {
  for (const forbidden of [
    "candidateVersionId",
    "canaryCapability",
    "canaryCapabilityIssuedAtUtc",
    "canaryCapabilityExpiresAtUtc",
    "canaryCapabilityNonce",
    "existingSecret",
    "versionCertification",
  ]) {
    if (Object.hasOwn(options, forbidden)) {
      throw new Error(
        `Stage 1 no admite ${forbidden}: Cloudflare todavía no creó la Version.`,
      );
    }
  }
  const {
    candidateIdentity,
    nonStatefulCertification,
    versionUploadAuthorizationToken,
    testOnlyEvidence = false,
    ...baseOptions
  } = options;
  if (typeof testOnlyEvidence !== "boolean") {
    throw new Error("testOnlyEvidence debe ser booleano explícito.");
  }
  if (!testOnlyEvidence && Object.hasOwn(options, "now")) {
    throw new Error("Stage 1 productivo no admite un reloj inyectado.");
  }
  const now =
    testOnlyEvidence && Object.hasOwn(options, "now")
      ? options.now
      : new Date();
  const context = basePlanContext(baseOptions);
  assertCandidateIdentityCertification({
    candidateIdentity,
    nonStatefulCertification,
    context,
    now,
    allowTestOnly: testOnlyEvidence,
  });
  const uploadAuthorizationBindings = Object.freeze({
    head: context.head,
    requestHash: context.requestHash,
    policyHash: context.policyHash,
    artifactHash: context.artifactHash,
    workerName: D72_CANARY_WORKER_NAME,
    ...d72CanarySourceBindings(context, { includeDeployment: false }),
    ...d72CanaryUploadArtifactBindings(context),
  });
  const uploadAuthorization = assertAuthorizationToken(
    versionUploadAuthorizationToken,
    "version-upload",
    uploadAuthorizationBindings,
  );
  const payload = {
    schemaVersion: "agorbis-d72-canary-version-upload-plan/v1",
    phase: "version_upload_only",
    workerName: D72_CANARY_WORKER_NAME,
    head: context.head,
    requestHash: context.requestHash,
    policyHash: context.policyHash,
    artifactHash: context.artifactHash,
    ...d72CanaryUploadArtifactBindings(context),
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    evidenceCertificationHash: d72NonStatefulEvidenceCertificationHash(
      nonStatefulCertification,
    ),
    ...d72CanarySourceBindings(context),
    ...(isOpenUpdate(context)
      ? { openSourceBaseline: context.openSourceBaseline }
      : {}),
    [sourceField(context, "closedTrafficPercentage")]: 100,
    candidateVersionId: null,
    candidateTrafficPercentage: 0,
    candidateAttached: false,
    capabilityCreated: false,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    versionUploadAuthorizationHash:
      uploadAuthorization.evidence.statementSha256,
    upload: uploadStep(context),
    postUploadVerification: Object.freeze({
      required: true,
      method: "GET",
      candidateVersionIdSource: "wrangler-output-file-v1-then-cloudflare-get",
      capabilityAllowedBeforeVerification: false,
    }),
  };
  const plan = deepFreeze({
    ...payload,
    planSha256: d72CanaryVersionUploadPlanHash(payload),
  });
  ISSUED_VERSION_UPLOAD_PLANS.add(plan);
  (testOnlyEvidence
    ? TEST_ONLY_VERSION_UPLOAD_PLANS
    : PRODUCTION_VERSION_UPLOAD_PLANS
  ).add(plan);
  return plan;
}

function validateUploadPlanShape(plan) {
  const errors = [];
  try {
    exactKeys(
      plan,
      uploadArtifactKeys(
        sourceKeys(VERSION_UPLOAD_PLAN_KEYS, plan, { baseline: true }),
        plan,
      ),
      "uploadPlan",
    );
    exactKeys(
      plan.postUploadVerification,
      POST_UPLOAD_VERIFICATION_KEYS,
      "uploadPlan.postUploadVerification",
    );
  } catch (error) {
    return [error.message];
  }
  if (
    plan.schemaVersion !== "agorbis-d72-canary-version-upload-plan/v1" ||
    plan.phase !== "version_upload_only" ||
    plan.workerName !== D72_CANARY_WORKER_NAME
  ) {
    errors.push("El upload plan no usa schema/fase/Worker canónicos.");
  }
  if (
    plan[sourceField(plan, "closedTrafficPercentage")] !== 100 ||
    plan.candidateVersionId !== null ||
    plan.candidateTrafficPercentage !== 0 ||
    plan.candidateAttached !== false ||
    plan.capabilityCreated !== false ||
    plan.deploymentAuthorized !== false ||
    plan.deploymentExecuted !== false
  ) {
    errors.push(
      "El upload plan debe conservar CLOSED 100%, candidata desconocida/no adjunta y cero autorización/ejecución de deployment.",
    );
  }
  if (!SHA256_PATTERN.test(plan.versionUploadAuthorizationHash ?? "")) {
    errors.push("El upload plan no sella la autorización /dev/tty exacta.");
  }
  if (
    plan.postUploadVerification.required !== true ||
    plan.postUploadVerification.method !== "GET" ||
    plan.postUploadVerification.candidateVersionIdSource !==
      "wrangler-output-file-v1-then-cloudflare-get" ||
    plan.postUploadVerification.capabilityAllowedBeforeVerification !== false
  ) {
    errors.push("El upload plan no exige la recertificación GET posterior.");
  }
  errors.push(...validateD72CanaryCommandStep(plan.upload));
  if (
    !SHA256_PATTERN.test(plan.planSha256 ?? "") ||
    plan.planSha256 !== d72CanaryVersionUploadPlanHash(plan)
  ) {
    errors.push("planSha256 no sella el upload plan.");
  }
  return errors;
}

export function validateD72CanaryVersionUploadPlan(plan, options = {}) {
  const errors = validateUploadPlanShape(plan);
  let expected;
  try {
    expected = createD72CanaryVersionUploadPlan(options);
  } catch (error) {
    return Object.freeze([...new Set([...errors, error.message])]);
  }
  if (d72CanaryCanonicalJson(plan) !== d72CanaryCanonicalJson(expected)) {
    errors.push(
      "El upload plan no coincide con la identidad certificada exacta.",
    );
  }
  return Object.freeze([...new Set(errors)]);
}

function assertIssuedVersionUploadPlan(uploadPlan) {
  const errors = validateUploadPlanShape(uploadPlan);
  if (errors.length > 0) {
    throw new Error(`Upload plan inválido:\n${errors.join("\n")}`);
  }
  if (!ISSUED_VERSION_UPLOAD_PLANS.has(uploadPlan)) {
    throw new Error(
      "El upload plan debe provenir de createD72CanaryVersionUploadPlan en este proceso; una copia JSON no autoriza upload ni recertificación.",
    );
  }
}

export function assertD72CanaryVersionUploadPlanAuthority(
  uploadPlan,
  { allowTestOnly = false } = {},
) {
  if (typeof allowTestOnly !== "boolean") {
    throw new Error("allowTestOnly debe ser booleano explícito.");
  }
  assertIssuedVersionUploadPlan(uploadPlan);
  if (
    (allowTestOnly && !TEST_ONLY_VERSION_UPLOAD_PLANS.has(uploadPlan)) ||
    (!allowTestOnly && !PRODUCTION_VERSION_UPLOAD_PLANS.has(uploadPlan))
  ) {
    throw new Error(
      allowTestOnly
        ? "El runner fixture exige un upload plan testOnly opaco."
        : "El runner productivo exige identity/evidencia productivas opacas; un plan fixture nunca autoriza upload.",
    );
  }
  return uploadPlan;
}

/**
 * Parses the two canonical machine-readable events written by Wrangler 4.160.1
 * via WRANGLER_OUTPUT_FILE_PATH after `versions upload`: wrangler-session then
 * version-upload. Human stdout/stderr is not used as authority. The returned
 * object is an opaque, process-local receipt; cloning or reconstructing its
 * public fields loses authority.
 */
export function parseD72CanaryVersionUploadReceipt({
  uploadPlan,
  uploadPayloadHash,
  outputFileSource,
  exitCode,
  now = new Date(),
} = {}) {
  assertIssuedVersionUploadPlan(uploadPlan);
  safeHash(uploadPayloadHash, "uploadPayloadHash");
  if (exitCode !== 0) {
    throw new Error("Wrangler versions upload no terminó con exit 0.");
  }
  if (
    typeof outputFileSource !== "string" ||
    Buffer.byteLength(outputFileSource, "utf8") > 16 * 1_024 ||
    !outputFileSource.endsWith("\n")
  ) {
    throw new Error(
      "El output machine-readable de Wrangler debe ser NDJSON cerrado terminado en newline.",
    );
  }
  const lines = outputFileSource.slice(0, -1).split("\n");
  if (lines.length !== 2 || lines.some((line) => line.length === 0)) {
    throw new Error(
      "Wrangler debe producir exactamente los eventos wrangler-session y version-upload.",
    );
  }
  let session;
  let record;
  try {
    session = JSON.parse(lines[0]);
    record = JSON.parse(lines[1]);
    exactKeys(session, WRANGLER_SESSION_OUTPUT_KEYS, "Wrangler session output");
    allowedKeys(
      record,
      VERSION_UPLOAD_OUTPUT_RECORD_KEYS,
      VERSION_UPLOAD_OUTPUT_OPTIONAL_KEYS,
      "Wrangler version-upload output",
    );
  } catch (error) {
    throw new Error(
      `Output machine-readable de Wrangler inválido: ${error.message}`,
    );
  }
  if (
    `${JSON.stringify(session)}\n${JSON.stringify(record)}\n` !==
    outputFileSource
  ) {
    throw new Error(
      "El output machine-readable de Wrangler no conserva su serialización canónica exacta.",
    );
  }
  const expectedArguments = uploadPlan.upload.arguments.slice(1);
  if (
    session.type !== "wrangler-session" ||
    session.version !== 1 ||
    session.wrangler_version !== D72_CANARY_WRANGLER_VERSION ||
    !Array.isArray(session.command_line_args) ||
    session.command_line_args.some(
      (argument) => typeof argument !== "string",
    ) ||
    d72CanaryCanonicalJson(session.command_line_args) !==
      d72CanaryCanonicalJson(expectedArguments) ||
    typeof session.log_file_path !== "string" ||
    !path.isAbsolute(session.log_file_path) ||
    CONTROL_OR_BIDI_PATTERN.test(session.log_file_path)
  ) {
    throw new Error(
      "El evento wrangler-session no corresponde a Wrangler 4.160.1 ni al argv exacto aprobado.",
    );
  }
  const sessionAt = safeInstant(
    session.timestamp,
    "Wrangler session timestamp",
  );
  const candidateVersionId = safeVersionId(
    record.version_id,
    "Wrangler version_id",
  );
  if (
    record.type !== "version-upload" ||
    record.version !== 1 ||
    record.worker_name !== D72_CANARY_WORKER_NAME ||
    record.worker_name_overridden !== false ||
    typeof record.worker_tag !== "string" ||
    !/^[0-9a-f]{32}$/i.test(record.worker_tag) ||
    candidateVersionId ===
      uploadPlan[sourceField(uploadPlan, "closedVersionId")]
  ) {
    throw new Error(
      "El registro version-upload no corresponde al Worker/Version esperado.",
    );
  }
  for (const key of [
    "preview_url",
    "preview_alias_url",
    "wrangler_environment",
  ]) {
    if (Object.hasOwn(record, key) && record[key] !== null) {
      throw new Error(
        `${key} debe estar ausente o null para preview/env deshabilitados.`,
      );
    }
  }
  const uploadedAt = safeInstant(record.timestamp, "Wrangler output timestamp");
  const current = safeNow(now);
  if (
    sessionAt > current ||
    current.getTime() - sessionAt.getTime() > 15 * 60 * 1_000 ||
    uploadedAt < sessionAt ||
    uploadedAt > current ||
    current.getTime() - uploadedAt.getTime() > 15 * 60 * 1_000
  ) {
    throw new Error("El registro version-upload no es actual.");
  }
  const receiptPayload = {
    schemaVersion: D72_CANARY_VERSION_UPLOAD_RECEIPT_SCHEMA_VERSION,
    artifactHash: uploadPlan.artifactHash,
    ...d72CanaryUploadArtifactBindings(uploadPlan),
    candidateVersionId,
    uploadedAtUtc: uploadedAt.toISOString(),
    sessionAtUtc: sessionAt.toISOString(),
    sessionArgumentsHash: sha256(
      Buffer.from(d72CanaryCanonicalJson(expectedArguments), "utf8"),
    ),
    uploadPayloadHash,
    uploadPlanHash: uploadPlan.planSha256,
    workerTag: record.worker_tag.toLowerCase(),
  };
  const receipt = deepFreeze({
    ...receiptPayload,
    contentSha256: sha256(
      Buffer.from(d72CanaryCanonicalJson(receiptPayload), "utf8"),
    ),
  });
  VERSION_UPLOAD_RECEIPT_DATA.set(
    receipt,
    Object.freeze({ ...receiptPayload }),
  );
  return receipt;
}

function validateStandardApiEnvelope(payload, label) {
  exactKeys(payload, STANDARD_API_ENVELOPE_KEYS, label);
  if (
    payload.success !== true ||
    !Array.isArray(payload.errors) ||
    payload.errors.length !== 0 ||
    !Array.isArray(payload.messages) ||
    payload.messages.length !== 0
  ) {
    throw new Error(
      `${label} no es una respuesta Cloudflare GET exitosa y limpia.`,
    );
  }
}

function parseCandidateVersionBindingSet(bindings, { recovery = false } = {}) {
  const expectedPlaintext = recovery
    ? {
        ...D72_CANARY_EXPECTED_PLAINTEXT_BINDINGS,
        PUBLIC_GOOGLE_AUTH_ENABLED: "false",
      }
    : D72_CANARY_EXPECTED_PLAINTEXT_BINDINGS;
  if (!Array.isArray(bindings)) {
    throw new Error("GET Version resources.bindings no es un array.");
  }
  const names = [];
  const secretNames = [];
  const plaintext = {};
  let assetsCount = 0;
  for (const [index, binding] of bindings.entries()) {
    if (!isPlainObject(binding)) {
      throw new Error(`GET Version binding[${index}] no es un objeto.`);
    }
    if (binding.type === "plain_text") {
      exactKeys(
        binding,
        ["name", "text", "type"],
        `GET Version binding[${index}]`,
      );
      if (
        !Object.hasOwn(expectedPlaintext, binding.name) ||
        expectedPlaintext[binding.name] !== binding.text
      ) {
        throw new Error(`GET Version plaintext ${binding.name} no coincide.`);
      }
      plaintext[binding.name] = binding.text;
    } else if (binding.type === "secret_text") {
      exactKeys(binding, ["name", "type"], `GET Version binding[${index}]`);
      if (!D72_CANARY_EXPECTED_SECRET_NAMES.includes(binding.name)) {
        throw new Error(`GET Version secret ${binding.name} no está aprobado.`);
      }
      secretNames.push(binding.name);
    } else if (binding.type === "assets") {
      exactKeys(binding, ["name", "type"], `GET Version binding[${index}]`);
      if (binding.name !== "ASSETS") {
        throw new Error("GET Version contiene un binding assets desconocido.");
      }
      assetsCount += 1;
    } else {
      throw new Error("GET Version contiene un tipo de binding desconocido.");
    }
    if (typeof binding.name !== "string" || names.includes(binding.name)) {
      throw new Error("GET Version contiene bindings sin nombre o duplicados.");
    }
    names.push(binding.name);
  }
  if (
    assetsCount !== 1 ||
    !sameStrings(names, D72_CANARY_EXPECTED_BINDING_NAMES) ||
    !sameStrings(secretNames, D72_CANARY_EXPECTED_SECRET_NAMES) ||
    !sameStrings(
      Object.keys(plaintext),
      Object.keys(D72_CANARY_EXPECTED_PLAINTEXT_BINDINGS),
    )
  ) {
    throw new Error(
      "GET Version no contiene el inventario exacto de bindings 11/11 y secrets 3/3.",
    );
  }
  return Object.freeze({
    bindingNames: Object.freeze([...names]),
    secretNames: Object.freeze([...secretNames]),
  });
}

function parseCandidateVersionGet(request, expected) {
  exactKeys(request, VERSION_GET_REQUEST_KEYS, "GET Version request/response");
  const endpoint = `/accounts/${D72_CANARY_ACCOUNT_ID}/workers/scripts/${D72_CANARY_WORKER_NAME}/versions/${expected.candidateVersionId}`;
  if (
    request.method !== "GET" ||
    request.status !== 200 ||
    request.endpoint !== endpoint
  ) {
    throw new Error(
      "La consulta de Version no usa el endpoint GET exacto aprobado.",
    );
  }
  validateStandardApiEnvelope(request.body, "GET Version");
  const version = request.body.result;
  allowedKeys(
    version,
    ["annotations", "id", "metadata", "resources"],
    ["number", "startup_time_ms"],
    "GET Version result",
  );
  if (
    safeVersionId(version.id, "GET Version result.id") !==
    expected.candidateVersionId
  ) {
    throw new Error("GET Version devolvió un candidateVersionId distinto.");
  }
  allowedKeys(
    version.annotations,
    ["workers/message", "workers/tag"],
    ["workers/triggered_by"],
    "GET Version annotations",
  );
  if (
    version.annotations["workers/tag"] !== expected.tag ||
    version.annotations["workers/message"] !== expected.message ||
    (Object.hasOwn(version.annotations, "workers/triggered_by") &&
      !["upload", "wrangler"].includes(
        version.annotations["workers/triggered_by"],
      ))
  ) {
    throw new Error(
      "GET Version no conserva tag/message/origen del upload sellado.",
    );
  }
  if (
    (Object.hasOwn(version, "number") &&
      (!Number.isSafeInteger(version.number) || version.number < 1)) ||
    (Object.hasOwn(version, "startup_time_ms") &&
      (typeof version.startup_time_ms !== "number" ||
        !Number.isFinite(version.startup_time_ms) ||
        version.startup_time_ms < 0))
  ) {
    throw new Error("GET Version contiene number/startup_time_ms inválidos.");
  }
  allowedKeys(
    version.metadata,
    ["created_on", "has_preview", "source"],
    ["author_email", "author_id", "modified_on"],
    "GET Version metadata",
  );
  const createdOn = safeCloudflareInstant(
    version.metadata.created_on,
    "GET Version metadata.created_on",
  );
  const uploadedAt = safeInstant(expected.uploadedAtUtc, "uploadedAtUtc");
  if (
    createdOn.getTime() > uploadedAt.getTime() + 30_000 ||
    uploadedAt.getTime() - createdOn.getTime() > 15 * 60 * 1_000
  ) {
    throw new Error("GET Version created_on no corresponde al upload actual.");
  }
  if (Object.hasOwn(version.metadata, "modified_on")) {
    safeCloudflareInstant(
      version.metadata.modified_on,
      "GET Version metadata.modified_on",
    );
  }
  for (const field of ["author_email", "author_id"]) {
    if (
      Object.hasOwn(version.metadata, field) &&
      (typeof version.metadata[field] !== "string" ||
        version.metadata[field].length === 0)
    ) {
      throw new Error(`GET Version metadata.${field} no es válido.`);
    }
  }
  if (
    version.metadata.has_preview !== false ||
    version.metadata.source !== "wrangler"
  ) {
    throw new Error(
      "GET Version no acredita source=wrangler y preview deshabilitado.",
    );
  }
  exactKeys(
    version.resources,
    ["bindings", "script", "script_runtime"],
    "GET Version resources",
  );
  const bindingSet = parseCandidateVersionBindingSet(
    version.resources.bindings,
    { recovery: expected.artifactPurpose === "recovery" },
  );
  allowedKeys(
    version.resources.script,
    ["etag", "handlers", "last_deployed_from"],
    ["named_handlers"],
    "GET Version resources.script",
  );
  const versionScriptEtag = safeScriptEtag(version.resources.script.etag);
  if (
    !sameStrings(version.resources.script.handlers, ["fetch", "scheduled"]) ||
    version.resources.script.last_deployed_from !== "wrangler" ||
    (Object.hasOwn(version.resources.script, "named_handlers") &&
      (!Array.isArray(version.resources.script.named_handlers) ||
        version.resources.script.named_handlers.length !== 0))
  ) {
    throw new Error(
      "GET Version no coincide con handlers/origen del Worker aprobado.",
    );
  }
  allowedKeys(
    version.resources.script_runtime,
    ["compatibility_date", "compatibility_flags", "limits", "usage_model"],
    ["exports", "migration_tag"],
    "GET Version resources.script_runtime",
  );
  exactKeys(
    version.resources.script_runtime.limits,
    ["cpu_ms"],
    "GET Version resources.script_runtime.limits",
  );
  if (
    version.resources.script_runtime.compatibility_date !== "2026-08-25" ||
    !sameStrings(version.resources.script_runtime.compatibility_flags, [
      "nodejs_compat",
    ]) ||
    !isPlainObject(version.resources.script_runtime.limits) ||
    version.resources.script_runtime.limits.cpu_ms !== 30_000 ||
    version.resources.script_runtime.usage_model !== "standard"
  ) {
    throw new Error("GET Version no coincide con runtime/limits aprobados.");
  }
  if (
    (Object.hasOwn(version.resources.script_runtime, "exports") &&
      !isPlainObject(version.resources.script_runtime.exports)) ||
    (Object.hasOwn(version.resources.script_runtime, "migration_tag") &&
      version.resources.script_runtime.migration_tag !== null &&
      typeof version.resources.script_runtime.migration_tag !== "string")
  ) {
    throw new Error("GET Version contiene exports/migration_tag inválidos.");
  }
  const observedAt = safeInstant(
    request.observedAtUtc,
    "GET Version observedAtUtc",
  );
  return Object.freeze({
    ...bindingSet,
    observedAtUtc: observedAt.toISOString(),
    versionScriptEtag,
  });
}

/** Revalidates the immutable fallback Version without uploading or authorizing it. */
export function assertD72OpenRecoveryVersionGet(
  request,
  {
    recoveryVersionId,
    versionScriptEtag,
    tag,
    message,
    uploadedAtUtc,
    now = new Date(),
  } = {},
) {
  const facts = parseCandidateVersionGet(request, {
    candidateVersionId: safeVersionId(recoveryVersionId, "recoveryVersionId"),
    tag,
    message,
    uploadedAtUtc,
    artifactPurpose: "recovery",
  });
  if (facts.versionScriptEtag !== safeScriptEtag(versionScriptEtag))
    throw new Error("El script de recuperación difiere del upload verificado.");
  const observed = safeInstant(facts.observedAtUtc, "observedAtUtc");
  const current = safeNow(now);
  if (observed > current || current - observed > 5 * 60 * 1000)
    throw new Error("El GET fallback no es actual.");
  return facts;
}

/**
 * Strict, GET-only attestation boundary. It consumes the real Wrangler upload
 * output receipt, a validated frozen artifact manifest, the raw Version GET
 * envelope, and the full raw CLOSED snapshot used by the existing hardened
 * Cloudflare auditor. The returned token is opaque through a WeakMap.
 */
export function parseD72CanaryVersionGetAttestation({
  uploadPlan,
  uploadReceipt,
  artifactManifest,
  getSet,
  now = new Date(),
} = {}) {
  assertIssuedVersionUploadPlan(uploadPlan);
  const uploadData = VERSION_UPLOAD_RECEIPT_DATA.get(uploadReceipt);
  if (
    !uploadData ||
    uploadData.uploadPlanHash !== uploadPlan.planSha256 ||
    uploadData.artifactHash !== uploadPlan.artifactHash ||
    uploadData.artifactPurpose !== uploadPlan.artifactPurpose ||
    uploadData.uploadArtifactHash !== uploadPlan.uploadArtifactHash
  ) {
    throw new Error("El GET requiere el receipt opaco del upload exacto.");
  }
  const manifestErrors = validateExceptionalReleaseArtifactManifest(
    artifactManifest,
    {
      expectedHead: uploadPlan.head,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: uploadPlan.policyHash,
      expectedRequestHash: uploadPlan.requestHash,
      expectedArtifactHash:
        uploadPlan.uploadArtifactHash ?? uploadPlan.artifactHash,
    },
  );
  if (manifestErrors.length > 0) {
    throw new Error(
      `Manifest del artefacto inválido:\n${manifestErrors.join("\n")}`,
    );
  }
  const openUpdate = isOpenUpdate(uploadPlan);
  if (
    artifactManifest.releaseMode !== uploadPlan.releaseMode ||
    artifactManifest.openSourceBaselineSha256 !==
      uploadPlan.openSourceBaselineSha256
  )
    throw new Error(
      "El manifest GET no coincide con perfil/baseline del upload.",
    );
  if (
    openUpdate &&
    artifactManifest.artifactPurpose !==
      (uploadPlan.artifactPurpose ?? "primary")
  ) {
    throw new Error(
      "El manifest GET no corresponde al propósito de upload aprobado.",
    );
  }
  exactKeys(
    getSet,
    openUpdate ? ["sourceState", "version"] : VERSION_GET_SET_KEYS,
    "version GET set",
  );
  const sourceState = getSet[openUpdate ? "sourceState" : "closedState"];
  exactKeys(sourceState, CLOSED_STATE_GET_KEYS, "source GET set");
  if (sourceState.method !== "GET") {
    throw new Error(
      "La recertificación CLOSED posterior al upload debe ser GET-only.",
    );
  }
  const closedObservedAt = safeInstant(
    sourceState.observedAtUtc,
    "closedState GET observedAtUtc",
  );
  const uploadedAt = safeInstant(uploadData.uploadedAtUtc, "uploadedAtUtc");
  const current = safeNow(now);
  if (
    closedObservedAt < uploadedAt ||
    closedObservedAt > current ||
    current.getTime() - closedObservedAt.getTime() > 5 * 60 * 1_000
  ) {
    throw new Error(
      "El snapshot CLOSED debe ser un GET actual y posterior al upload.",
    );
  }
  const closed = openUpdate
    ? validateCloudflareOpenSourceState(sourceState.snapshot)
    : validateCloudflareClosedState(sourceState.snapshot, {
        phase: "custom-domains",
        secretStage: "complete",
      });
  if (openUpdate)
    assertOpenReleaseBaselineMatches({
      baseline: uploadPlan.openSourceBaseline,
      expectedBaselineSha256: uploadPlan.openSourceBaselineSha256,
      snapshot: sourceState.snapshot,
      observedAtUtc: sourceState.observedAtUtc,
      nowUtc: current.toISOString(),
    });
  if (
    closed.activeDeploymentId !==
      uploadPlan[sourceField(uploadPlan, "closedDeploymentId")] ||
    closed.activeVersionId !==
      uploadPlan[sourceField(uploadPlan, "closedVersionId")]
  ) {
    throw new Error(
      "El snapshot GET posterior no conserva el deployment CLOSED sellado.",
    );
  }
  const candidateInActiveDeployment =
    sourceState.snapshot.deployments.result.deployments[0].versions.some(
      (entry) => entry.version_id === uploadData.candidateVersionId,
    );
  if (candidateInActiveDeployment) {
    throw new Error(
      "La candidata ya aparece en el deployment activo antes de autorizar 100/0.",
    );
  }
  const versionFacts = parseCandidateVersionGet(getSet.version, {
    ...d72CanaryUploadArtifactBindings(uploadPlan),
    candidateVersionId: uploadData.candidateVersionId,
    message: uploadPlan.upload.arguments.at(-1),
    tag: `d72-canary-${uploadPlan.head}`,
    uploadedAtUtc: uploadData.uploadedAtUtc,
  });
  const observedAt = safeInstant(
    versionFacts.observedAtUtc,
    "GET Version observedAtUtc",
  );
  if (
    observedAt > current ||
    current.getTime() - observedAt.getTime() > 15 * 60 * 1_000 ||
    observedAt < uploadedAt ||
    observedAt < closedObservedAt
  ) {
    throw new Error(
      "El GET de Version no es posterior al upload o ya no es actual.",
    );
  }
  const observation = deepFreeze({
    source: "cloudflare-read-only-get-set",
    method: "GET",
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    activeDeploymentId: closed.activeDeploymentId,
    ...d72CanaryReleaseProfile(uploadPlan),
    ...d72CanaryUploadArtifactBindings(uploadPlan),
    [sourceField(uploadPlan, "closedVersionId")]: closed.activeVersionId,
    [sourceField(uploadPlan, "activeClosedPercentage")]: 100,
    candidateVersionId: uploadData.candidateVersionId,
    candidateInActiveDeployment: false,
    candidateTrafficPercentage: 0,
    tag: `d72-canary-${uploadPlan.head}`,
    message: uploadPlan.upload.arguments.at(-1),
    launchMode: "open",
    bindingNames: versionFacts.bindingNames,
    secretNames: versionFacts.secretNames,
    unknownBindingCount: 0,
    domains: D72_CANARY_ALLOWED_HOSTNAMES,
    workersDevEnabled: false,
    previewUrlsEnabled: false,
    cronCount: openUpdate ? D72_CANARY_EXPECTED_OPEN_CRONS.length : 0,
    finalOpenCrons: D72_CANARY_EXPECTED_OPEN_CRONS,
    observedAtUtc: versionFacts.observedAtUtc,
    versionScriptEtag: versionFacts.versionScriptEtag,
  });
  const attestationPayload = {
    schemaVersion: D72_CANARY_VERSION_GET_ATTESTATION_SCHEMA_VERSION,
    candidateVersionId: uploadData.candidateVersionId,
    uploadPlanHash: uploadPlan.planSha256,
    expectedArtifactHash:
      uploadPlan.uploadArtifactHash ?? uploadPlan.artifactHash,
    ...d72CanaryUploadArtifactBindings(uploadPlan),
    versionScriptEtag: versionFacts.versionScriptEtag,
    observedAtUtc: versionFacts.observedAtUtc,
  };
  const attestation = deepFreeze({
    ...attestationPayload,
    contentSha256: sha256(
      Buffer.from(d72CanaryCanonicalJson(attestationPayload), "utf8"),
    ),
  });
  VERSION_GET_ATTESTATION_DATA.set(
    attestation,
    Object.freeze({
      observation,
      uploadPlanHash: uploadPlan.planSha256,
      uploadReceiptHash: uploadReceipt.contentSha256,
    }),
  );
  return attestation;
}

function versionObservationErrors(observation, uploadPlan, now) {
  const errors = [];
  try {
    exactKeys(
      observation,
      uploadArtifactKeys(
        sourceKeys(VERSION_OBSERVATION_KEYS, observation),
        observation,
      ),
      "versionObservation",
    );
  } catch (error) {
    return [error.message];
  }
  let candidateVersionId;
  try {
    candidateVersionId = safeVersionId(
      observation.candidateVersionId,
      "candidateVersionId observado",
    );
    if (
      candidateVersionId ===
      uploadPlan[sourceField(uploadPlan, "closedVersionId")]
    ) {
      errors.push("La Version candidata observada coincide con CLOSED.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  if (
    observation.source !== "cloudflare-read-only-get-set" ||
    observation.method !== "GET"
  ) {
    errors.push("La Version candidata sólo puede recertificarse mediante GET.");
  }
  try {
    safeScriptEtag(observation.versionScriptEtag);
  } catch (error) {
    errors.push(error.message);
  }
  if (
    observation.accountId !== D72_CANARY_ACCOUNT_ID ||
    observation.workerName !== D72_CANARY_WORKER_NAME ||
    observation.activeDeploymentId !==
      uploadPlan[sourceField(uploadPlan, "closedDeploymentId")] ||
    observation[sourceField(observation, "closedVersionId")] !==
      uploadPlan[sourceField(uploadPlan, "closedVersionId")] ||
    observation[sourceField(observation, "activeClosedPercentage")] !== 100 ||
    observation.candidateInActiveDeployment !== false ||
    observation.candidateTrafficPercentage !== 0
  ) {
    errors.push(
      "El GET no acredita el mismo Worker/deployment CLOSED 100% y candidata aún fuera del deployment (0% tráfico).",
    );
  }
  const expectedMessage = uploadPlan.upload.arguments.at(-1);
  if (
    observation.tag !== `d72-canary-${uploadPlan.head}` ||
    observation.message !== expectedMessage
  ) {
    errors.push(
      "El GET de Version no coincide con tag/message del upload exacto.",
    );
  }
  if (
    observation.launchMode !== "open" ||
    !sameStrings(observation.bindingNames, D72_CANARY_EXPECTED_BINDING_NAMES) ||
    !sameStrings(observation.secretNames, D72_CANARY_EXPECTED_SECRET_NAMES) ||
    observation.unknownBindingCount !== 0 ||
    !sameStrings(observation.domains, D72_CANARY_ALLOWED_HOSTNAMES) ||
    observation.workersDevEnabled !== false ||
    observation.previewUrlsEnabled !== false ||
    observation.cronCount !==
      (isOpenUpdate(uploadPlan) ? D72_CANARY_EXPECTED_OPEN_CRONS.length : 0) ||
    !sameStrings(observation.finalOpenCrons, D72_CANARY_EXPECTED_OPEN_CRONS)
  ) {
    errors.push(
      "La configuración GET/local correlacionada de la Version candidata no es la OPEN exacta aprobada.",
    );
  }
  try {
    const observedAt = safeInstant(
      observation.observedAtUtc,
      "versionObservation.observedAtUtc",
    );
    const current = safeNow(now);
    if (
      observedAt > current ||
      current.getTime() - observedAt.getTime() > 15 * 60 * 1_000
    ) {
      errors.push("El GET de Version no es actual.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

function configurationObservationDigest(observation) {
  const configuration = {
    ...d72CanaryUploadArtifactBindings(observation),
    bindingNames: observation.bindingNames,
    cronCount: observation.cronCount,
    domains: observation.domains,
    finalOpenCrons: observation.finalOpenCrons,
    launchMode: observation.launchMode,
    previewUrlsEnabled: observation.previewUrlsEnabled,
    secretNames: observation.secretNames,
    unknownBindingCount: observation.unknownBindingCount,
    workersDevEnabled: observation.workersDevEnabled,
  };
  return sha256(Buffer.from(d72CanaryCanonicalJson(configuration), "utf8"));
}

export function createD72CanaryVersionCertification({
  uploadPlan,
  versionGetAttestation,
  now = new Date(),
} = {}) {
  assertIssuedVersionUploadPlan(uploadPlan);
  const attestationData = VERSION_GET_ATTESTATION_DATA.get(
    versionGetAttestation,
  );
  if (
    !attestationData ||
    attestationData.uploadPlanHash !== uploadPlan.planSha256
  ) {
    throw new Error(
      "La certificación requiere una attestation GET opaca emitida por el parser estricto en este proceso.",
    );
  }
  const observation = attestationData.observation;
  const planErrors = validateUploadPlanShape(uploadPlan);
  const observationErrors = versionObservationErrors(
    observation,
    uploadPlan,
    now,
  );
  if (planErrors.length > 0 || observationErrors.length > 0) {
    throw new Error(
      `No se puede recertificar la Version candidata:\n${[
        ...planErrors,
        ...observationErrors,
      ].join("\n")}`,
    );
  }
  const payload = {
    schemaVersion: D72_CANARY_VERSION_CERTIFICATION_SCHEMA_VERSION,
    phase: "post_upload_get_certification",
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    head: uploadPlan.head,
    requestHash: uploadPlan.requestHash,
    policyHash: uploadPlan.policyHash,
    artifactHash: uploadPlan.artifactHash,
    ...d72CanaryUploadArtifactBindings(uploadPlan),
    candidateIdentityHash: uploadPlan.candidateIdentityHash,
    evidenceCertificationHash: uploadPlan.evidenceCertificationHash,
    uploadPlanHash: uploadPlan.planSha256,
    versionScriptEtag: observation.versionScriptEtag,
    ...d72CanarySourceBindings(uploadPlan),
    candidateVersionId: observation.candidateVersionId,
    [sourceField(uploadPlan, "activeClosedPercentage")]: 100,
    candidateTrafficPercentage: 0,
    candidateAttached: false,
    capabilityCreated: false,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    configurationDigest: configurationObservationDigest(observation),
    observedAtUtc: observation.observedAtUtc,
  };
  const certification = {
    ...payload,
    contentSha256: d72CanaryVersionCertificationHash(payload),
  };
  const errors = validateD72CanaryVersionCertification(certification, {
    expectedHead: uploadPlan.head,
    expectedRequestHash: uploadPlan.requestHash,
    expectedPolicyHash: uploadPlan.policyHash,
    expectedArtifactHash: uploadPlan.artifactHash,
    expectedArtifactPurpose: uploadPlan.artifactPurpose,
    expectedUploadArtifactHash: uploadPlan.uploadArtifactHash,
    ...expectedSourceBindings(uploadPlan),
    expectedUploadPlanHash: uploadPlan.planSha256,
    now,
  });
  if (errors.length > 0) {
    throw new Error(
      `Certificación de Version candidata inválida:\n${errors.join("\n")}`,
    );
  }
  const issuedCertification = deepFreeze(certification);
  ISSUED_VERSION_CERTIFICATIONS.add(issuedCertification);
  return issuedCertification;
}

export function validateD72CanaryVersionCertification(
  certification,
  {
    expectedHead,
    expectedRequestHash,
    expectedPolicyHash,
    expectedArtifactHash,
    expectedArtifactPurpose,
    expectedUploadArtifactHash,
    expectedClosedDeploymentId,
    expectedClosedVersionId,
    expectedReleaseMode,
    expectedOpenSourceBaselineSha256,
    expectedSourceDeploymentId,
    expectedSourceVersionId,
    expectedUploadPlanHash,
    expectedCandidateVersionId,
    now = new Date(),
  } = {},
) {
  const errors = [];
  try {
    exactKeys(
      certification,
      uploadArtifactKeys(
        sourceKeys(VERSION_CERTIFICATION_KEYS, certification),
        certification,
      ),
      "versionCertification",
    );
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (
    certification.schemaVersion !==
      D72_CANARY_VERSION_CERTIFICATION_SCHEMA_VERSION ||
    certification.phase !== "post_upload_get_certification" ||
    certification.accountId !== D72_CANARY_ACCOUNT_ID ||
    certification.workerName !== D72_CANARY_WORKER_NAME
  ) {
    errors.push("La certificación no usa schema/fase/cuenta/Worker canónicos.");
  }
  if (
    certification.releaseMode !== expectedReleaseMode ||
    certification.openSourceBaselineSha256 !==
      expectedOpenSourceBaselineSha256 ||
    (isOpenUpdate(certification) &&
      (expectedClosedVersionId !== undefined ||
        expectedClosedDeploymentId !== undefined))
  )
    errors.push(
      "La certificación no corresponde al perfil/baseline source esperado.",
    );
  if (
    certification.artifactPurpose !== expectedArtifactPurpose ||
    certification.uploadArtifactHash !== expectedUploadArtifactHash
  ) {
    errors.push(
      "La certificación no corresponde al propósito/hash del upload esperado.",
    );
  }
  for (const [field, expected, validator] of [
    ["head", expectedHead, safeHead],
    ["requestHash", expectedRequestHash, safeHash],
    ["policyHash", expectedPolicyHash, safeHash],
    ["artifactHash", expectedArtifactHash, safeHash],
    [
      sourceField(certification, "closedDeploymentId"),
      isOpenUpdate(certification)
        ? expectedSourceDeploymentId
        : expectedClosedDeploymentId,
      safeVersionId,
    ],
    [
      sourceField(certification, "closedVersionId"),
      isOpenUpdate(certification)
        ? expectedSourceVersionId
        : expectedClosedVersionId,
      safeVersionId,
    ],
  ]) {
    try {
      validator(certification[field], field);
      if (expected !== undefined && certification[field] !== expected) {
        errors.push(`${field} de certificación no coincide.`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  try {
    safeVersionId(certification.candidateVersionId, "candidateVersionId");
    if (
      certification.candidateVersionId ===
        certification[sourceField(certification, "closedVersionId")] ||
      (expectedCandidateVersionId !== undefined &&
        certification.candidateVersionId !== expectedCandidateVersionId)
    ) {
      errors.push("candidateVersionId recertificado no coincide.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  for (const field of [
    "candidateIdentityHash",
    "evidenceCertificationHash",
    "uploadPlanHash",
    "configurationDigest",
  ]) {
    if (!SHA256_PATTERN.test(certification[field] ?? "")) {
      errors.push(`${field} no es un SHA-256 canónico.`);
    }
  }
  try {
    safeScriptEtag(certification.versionScriptEtag);
  } catch (error) {
    errors.push(error.message);
  }
  if (
    expectedUploadPlanHash !== undefined &&
    certification.uploadPlanHash !== expectedUploadPlanHash
  ) {
    errors.push("uploadPlanHash de certificación no coincide.");
  }
  if (
    certification[sourceField(certification, "activeClosedPercentage")] !==
      100 ||
    certification.candidateTrafficPercentage !== 0 ||
    certification.candidateAttached !== false ||
    certification.capabilityCreated !== false ||
    certification.deploymentAuthorized !== false ||
    certification.deploymentExecuted !== false
  ) {
    errors.push(
      "La certificación post-upload debe conservar CLOSED 100%, candidate fuera/0% y capability/deployment todavía ausentes.",
    );
  }
  try {
    const observedAt = safeInstant(
      certification.observedAtUtc,
      "observedAtUtc",
    );
    const current = safeNow(now);
    if (
      observedAt > current ||
      current.getTime() - observedAt.getTime() > 15 * 60 * 1_000
    ) {
      errors.push("La certificación GET de Version no es actual.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  if (
    !SHA256_PATTERN.test(certification.contentSha256 ?? "") ||
    certification.contentSha256 !==
      d72CanaryVersionCertificationHash(certification)
  ) {
    errors.push("contentSha256 no sella la certificación de Version.");
  }
  return Object.freeze([...new Set(errors)]);
}

function assertIssuedVersionCertification(versionCertification) {
  if (!ISSUED_VERSION_CERTIFICATIONS.has(versionCertification)) {
    throw new Error(
      "La Version debe usar una certificación opaca emitida desde el GET real en este proceso; un objeto reconstruido no autoriza capability ni attach.",
    );
  }
}

function parsedApprovedUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("La URL del probe canary no es válida.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !D72_CANARY_ALLOWED_HOSTNAMES.includes(parsed.hostname)
  ) {
    throw new Error(
      "El version override sólo puede enviarse por HTTPS a agorbis.com o www.agorbis.com.",
    );
  }
  return parsed;
}

export function d72CanaryVersionOverrideHeaders(url, canaryVersionId) {
  parsedApprovedUrl(url);
  const versionId = safeVersionId(canaryVersionId, "canaryVersionId");
  return Object.freeze({
    [D72_CANARY_VERSION_OVERRIDE_HEADER]: `${D72_CANARY_WORKER_NAME}="${versionId}"`,
  });
}

export function d72CanaryAuthorizedHeaders(
  url,
  canaryVersionId,
  canaryCapability,
) {
  parsedApprovedUrl(url);
  parseD72CanaryCapability(canaryCapability);
  return Object.freeze({
    ...d72CanaryVersionOverrideHeaders(url, canaryVersionId),
    [D72_CANARY_CAPABILITY_HEADER]: canaryCapability,
  });
}

function overrideHeaderEntries(headers) {
  if (!isPlainObject(headers)) {
    throw new Error("headers debe ser un objeto plano saneado.");
  }
  const target = D72_CANARY_VERSION_OVERRIDE_HEADER.toLowerCase();
  return Object.entries(headers).filter(
    ([name]) => name.toLowerCase() === target,
  );
}

function capabilityHeaderEntries(headers) {
  if (!isPlainObject(headers)) {
    throw new Error("headers debe ser un objeto plano saneado.");
  }
  const target = D72_CANARY_CAPABILITY_HEADER.toLowerCase();
  return Object.entries(headers).filter(
    ([name]) => name.toLowerCase() === target,
  );
}

function stripD72CanaryControlHeaders(headers) {
  if (!isPlainObject(headers)) return Object.freeze({});
  const forbiddenNames = new Set([
    D72_CANARY_VERSION_OVERRIDE_HEADER.toLowerCase(),
    D72_CANARY_CAPABILITY_HEADER.toLowerCase(),
  ]);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).filter(
        ([name]) => !forbiddenNames.has(name.toLowerCase()),
      ),
    ),
  );
}

/**
 * Política para interceptar requests del navegador canario. Nunca se deben usar
 * extraHTTPHeaders globales: Turnstile y Supabase usan orígenes terceros. Esta
 * función retira cualquier control heredado y sólo lo agrega a apex/www HTTPS.
 */
export function d72CanaryScopedBrowserHeaders({
  url,
  headers = {},
  canaryVersionId,
  canaryCapability,
} = {}) {
  const sanitized = stripD72CanaryControlHeaders(headers);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("La URL del request del navegador no es válida.");
  }
  const allowed =
    parsed.protocol === "https:" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    D72_CANARY_ALLOWED_HOSTNAMES.includes(parsed.hostname);
  if (!allowed) return sanitized;
  return Object.freeze({
    ...sanitized,
    ...d72CanaryAuthorizedHeaders(
      parsed.toString(),
      canaryVersionId,
      canaryCapability,
    ),
  });
}

export function validateD72CanaryVersionOverrideScope({
  url,
  headers,
  canaryVersionId,
  required = true,
} = {}) {
  const errors = [];
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Object.freeze(["La URL del request no es válida."]);
  }
  let entries;
  try {
    entries = overrideHeaderEntries(headers);
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (entries.length > 1) {
    errors.push("El request contiene version override duplicado.");
  }
  const approved =
    parsed.protocol === "https:" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    D72_CANARY_ALLOWED_HOSTNAMES.includes(parsed.hostname);
  if (entries.length > 0 && !approved) {
    errors.push(
      "El version override intentó salir hacia un hostname tercero o un origen no aprobado.",
    );
  }
  if (required && entries.length !== 1) {
    errors.push("Falta el version override canary exacto.");
  }
  if (!required && entries.length !== 0) {
    errors.push("Este probe no debe llevar version override.");
  }
  if (entries.length === 1) {
    let expected;
    try {
      expected = `${D72_CANARY_WORKER_NAME}="${safeVersionId(
        canaryVersionId,
        "canaryVersionId",
      )}"`;
    } catch (error) {
      errors.push(error.message);
    }
    if (expected !== undefined && entries[0][1] !== expected) {
      errors.push("El valor del version override no coincide con el canary.");
    }
  }
  return Object.freeze([...new Set(errors)]);
}

export function validateD72CanaryCapabilityScope({
  url,
  headers,
  expectedCapability,
  required = true,
} = {}) {
  const errors = [];
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Object.freeze(["La URL del request no es válida."]);
  }
  let entries;
  try {
    entries = capabilityHeaderEntries(headers);
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (entries.length > 1) {
    errors.push("El request contiene capability canary duplicado.");
  }
  const approved =
    parsed.protocol === "https:" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    D72_CANARY_ALLOWED_HOSTNAMES.includes(parsed.hostname);
  if (entries.length > 0 && !approved) {
    errors.push(
      "El capability canary intentó salir hacia un hostname tercero o un origen no aprobado.",
    );
  }
  if (required && entries.length !== 1) {
    errors.push("Falta el capability HMAC canary exacto.");
  }
  if (!required && entries.length !== 0) {
    errors.push("Este probe no debe llevar capability canary.");
  }
  if (
    entries.length === 1 &&
    typeof expectedCapability === "string" &&
    entries[0][1] !== expectedCapability
  ) {
    errors.push("El capability HMAC no coincide con el plan canary.");
  }
  return Object.freeze([...new Set(errors)]);
}

export function authorizeD72CanaryRequest({
  url,
  headers,
  existingSecret,
  now = new Date(),
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryVersionId,
  issuedAtUtc,
  expiresAtUtc,
  nonce,
} = {}) {
  const forwardHeaders = stripD72CanaryControlHeaders(headers);
  const overrideErrors = validateD72CanaryVersionOverrideScope({
    url,
    headers,
    canaryVersionId,
    required: true,
  });
  const capabilityEntries = (() => {
    try {
      return capabilityHeaderEntries(headers);
    } catch {
      return [];
    }
  })();
  const scopeErrors = validateD72CanaryCapabilityScope({
    url,
    headers,
    expectedCapability: capabilityEntries[0]?.[1],
    required: true,
  });
  const capability =
    capabilityEntries.length === 1 ? capabilityEntries[0][1] : null;
  const authorized =
    overrideErrors.length === 0 &&
    scopeErrors.length === 0 &&
    verifyD72CanaryCapability({
      capability,
      existingSecret,
      now,
      head,
      requestHash,
      policyHash,
      artifactHash,
      canaryVersionId,
      issuedAtUtc,
      expiresAtUtc,
      nonce,
    });
  return Object.freeze({
    authorized,
    deniedStatus: authorized ? null : D72_CANARY_DENIED_STATUS,
    forwardHeaders,
  });
}

function probeDefinitions(canaryVersionId, canaryCapability, profile = {}) {
  const openUpdate = isOpenUpdate(profile);
  const override = (url) =>
    d72CanaryVersionOverrideHeaders(url, canaryVersionId);
  const authorized = (url) =>
    d72CanaryAuthorizedHeaders(url, canaryVersionId, canaryCapability);
  const noHeaders = () => Object.freeze({});
  const cronPaths = [
    "/internal/cleanup-claim-uploads/",
    "/internal/escalate-claims/",
    "/internal/process-account-deletions/",
    "/internal/purge-retained-data/",
    "/internal/sync-notifications/",
  ];
  return Object.freeze([
    immutableProbe({
      id: openUpdate
        ? "ordinary-root-remains-open"
        : "ordinary-root-remains-closed",
      phase: "attached",
      controlMode: "none",
      url: "https://agorbis.com/",
      headers: noHeaders(),
      expectedStatus: openUpdate ? 200 : 503,
    }),
    immutableProbe({
      id: "canary-missing-capability-denied",
      phase: "attached",
      controlMode: "override-only",
      url: "https://agorbis.com/",
      headers: override("https://agorbis.com/"),
      expectedStatus: D72_CANARY_DENIED_STATUS,
    }),
    immutableProbe({
      id: "canary-invalid-capability-denied",
      phase: "attached",
      controlMode: "invalid-capability",
      url: "https://agorbis.com/",
      headers: {
        ...override("https://agorbis.com/"),
        [D72_CANARY_CAPABILITY_HEADER]: "invalid",
      },
      expectedStatus: D72_CANARY_DENIED_STATUS,
    }),
    immutableProbe({
      id: "canary-root-open",
      phase: "attached",
      controlMode: "authorized",
      url: "https://agorbis.com/",
      headers: authorized("https://agorbis.com/"),
      expectedStatus: 200,
    }),
    immutableProbe({
      id: "canary-health",
      phase: "attached",
      controlMode: "authorized",
      url: "https://agorbis.com/internal/health/",
      headers: authorized("https://agorbis.com/internal/health/"),
      expectedStatus: 200,
    }),
    ...cronPaths.map((cronPath) => {
      const url = `https://agorbis.com${cronPath}`;
      return immutableProbe({
        id: `canary-cron-${cronPath.split("/").filter(Boolean).at(-1)}-unauthorized`,
        phase: "attached",
        controlMode: "authorized",
        url,
        headers: authorized(url),
        expectedStatus: 401,
      });
    }),
    immutableProbe({
      id: "canary-www-redirect",
      phase: "attached",
      controlMode: "authorized",
      url: "https://www.agorbis.com/smoke-path?check=1",
      headers: authorized("https://www.agorbis.com/smoke-path?check=1"),
      expectedStatus: 308,
      expectedLocation: "https://agorbis.com/smoke-path?check=1",
    }),
    immutableProbe({
      id: openUpdate ? "post-detach-root-open" : "post-detach-root-closed",
      phase: "detached",
      controlMode: "none",
      url: "https://agorbis.com/",
      headers: noHeaders(),
      expectedStatus: openUpdate ? 200 : 503,
    }),
    immutableProbe({
      id: openUpdate
        ? "post-detach-override-falls-back-open"
        : "post-detach-override-falls-back-closed",
      phase: "detached",
      controlMode: "authorized",
      url: "https://agorbis.com/",
      headers: authorized("https://agorbis.com/"),
      expectedStatus: openUpdate ? 200 : 503,
    }),
  ]);
}

export const D72_CANARY_PROBE_EXPECTATIONS = Object.freeze(
  [
    ["ordinary-root-remains-closed", 503],
    ["canary-missing-capability-denied", D72_CANARY_DENIED_STATUS],
    ["canary-invalid-capability-denied", D72_CANARY_DENIED_STATUS],
    ["canary-root-open", 200],
    ["canary-health", 200],
    ["canary-cron-cleanup-claim-uploads-unauthorized", 401],
    ["canary-cron-escalate-claims-unauthorized", 401],
    ["canary-cron-process-account-deletions-unauthorized", 401],
    ["canary-cron-purge-retained-data-unauthorized", 401],
    ["canary-cron-sync-notifications-unauthorized", 401],
    ["canary-www-redirect", 308],
    ["post-detach-root-closed", 503],
    ["post-detach-override-falls-back-closed", 503],
  ].map(([id, expectedStatus]) => Object.freeze({ id, expectedStatus })),
);

export function d72CanaryProbeExpectationsForRelease(profile = {}) {
  if (!isOpenUpdate(profile)) return D72_CANARY_PROBE_EXPECTATIONS;
  return Object.freeze(
    D72_CANARY_PROBE_EXPECTATIONS.map(({ id, expectedStatus }) =>
      Object.freeze({
        id:
          {
            "ordinary-root-remains-closed": "ordinary-root-remains-open",
            "post-detach-root-closed": "post-detach-root-open",
            "post-detach-override-falls-back-closed":
              "post-detach-override-falls-back-open",
          }[id] ?? id,
        expectedStatus: expectedStatus === 503 ? 200 : expectedStatus,
      }),
    ),
  );
}

export function createD72CanaryZeroPercentDeploymentPlan(options = {}) {
  if (Object.hasOwn(options, "candidateVersionId")) {
    throw new Error(
      "candidateVersionId no puede suministrarse: debe derivar de la certificación GET.",
    );
  }
  const context = certifiedCandidateContext(options);
  const wrangler = wranglerEntrypoint(context.root);
  const emptyEnv = emptyEnvironmentPath(context);
  const commonTrafficArguments = [
    "--config",
    path.join(context.frozenRoot, "wrangler.traffic.jsonc"),
    "--cwd",
    context.frozenRoot,
    "--env-file",
    emptyEnv,
    "--name",
    D72_CANARY_WORKER_NAME,
    "--no-experimental-provision",
    "--no-experimental-auto-create",
  ];
  const attach = immutableStep({
    id: "attach-open-canary-at-zero-percent",
    command: context.node,
    arguments: [
      wrangler,
      "versions",
      "deploy",
      `${context[sourceField(context, "closedVersionId")]}@100%`,
      `${context.canaryVersionId}@0%`,
      ...commonTrafficArguments,
      "--message",
      d72CanaryRemoteMessage(context, "attach"),
      "--yes",
    ],
  });
  const detach = immutableStep({
    id: isOpenUpdate(context)
      ? "detach-canary-and-restore-open-source"
      : "detach-canary-and-restore-closed",
    command: context.node,
    arguments: [
      wrangler,
      "versions",
      "deploy",
      `${context[sourceField(context, "closedVersionId")]}@100%`,
      ...commonTrafficArguments,
      "--message",
      d72CanaryRemoteMessage(context, "detach"),
      "--yes",
    ],
  });
  let recovery = {};
  if (isOpenUpdate(context)) {
    const capsule = assertExceptionalOpenRecoveryCapsule(
      options.recoveryCapsuleManifest,
      options.recoveryExpectedBindings,
    );
    if (
      capsule.recoveryScope !== "CANARY_ONLY" ||
      capsule.head !== context.head ||
      capsule.requestHash !== context.requestHash ||
      capsule.artifactHash !== context.artifactHash ||
      capsule.candidateIdentityHash !==
        options.versionCertification.candidateIdentityHash ||
      capsule.infraAuthorizationHash !==
        context.zeroPercentDeploymentAuthorizationHash ||
      capsule.openSourceBaselineSha256 !== context.openSourceBaselineSha256 ||
      capsule.sourceVersionId !== context.sourceVersionId ||
      capsule.sourceDeploymentId !== context.sourceDeploymentId
    )
      throw new Error(
        "La recuperación CANARY_ONLY no corresponde al canario/autorización/baseline exactos.",
      );
    const [step] = createExceptionalOpenRecoveryPlan({
      repositoryRoot: context.root,
      capsuleRoot: options.recoveryRoot,
      stateRoot: options.recoveryRoot,
      nodeExecutable: context.node,
      capsuleManifest: capsule,
      expectedBindings: options.recoveryExpectedBindings,
    });
    recovery = {
      recovery: step,
      recoveryCapsuleHash: capsule.contentSha256,
      recoveryArtifactHash: capsule.recoveryArtifactHash,
      recoveryVersionId: capsule.recoveryVersionId,
      ...d72CanarySourceBindings(context),
    };
  }
  return Object.freeze({
    ...recovery,
    versionCertificationHash: context.versionCertificationHash,
    zeroPercentDeploymentAuthorizationHash:
      context.zeroPercentDeploymentAuthorizationHash,
    attach,
    probes: probeDefinitions(
      context.canaryVersionId,
      context.canaryCapability,
      context,
    ),
    detach,
  });
}

export function createD72CanaryPlan(options = {}) {
  return createD72CanaryZeroPercentDeploymentPlan(options);
}

export function validateD72CanaryCommandStep(step) {
  const errors = [];
  try {
    exactKeys(step, ["arguments", "command", "id", "shell"], "step");
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (step.shell !== false)
    errors.push("El comando canary debe usar shell=false.");
  if (
    typeof step.command !== "string" ||
    !path.isAbsolute(step.command) ||
    path.basename(step.command) !== "node"
  ) {
    errors.push("El comando canary debe usar un binario node absoluto.");
  }
  if (
    !Array.isArray(step.arguments) ||
    step.arguments.some((argument) => typeof argument !== "string") ||
    step.arguments.length < 3
  ) {
    errors.push("El argv canary no es una lista de strings válida.");
    return Object.freeze([...new Set(errors)]);
  }
  const [entrypoint, topLevel, subcommand] = step.arguments;
  if (
    !path.isAbsolute(entrypoint) ||
    !entrypoint.endsWith("/node_modules/wrangler/wrangler-dist/cli.js")
  ) {
    errors.push("El comando no usa el entrypoint Wrangler versionado.");
  }
  if (FORBIDDEN_WRANGLER_TOP_LEVEL_COMMANDS.has(topLevel)) {
    errors.push(`Wrangler ${topLevel} está prohibido en el canary.`);
  }
  const operation = `${topLevel} ${subcommand}`;
  if (!D72_CANARY_ALLOWED_WRANGLER_OPERATIONS.includes(operation)) {
    errors.push(`La operación Wrangler ${operation} no está en la allowlist.`);
  }
  for (const argument of step.arguments.slice(3)) {
    if (
      FORBIDDEN_WRANGLER_FLAGS.some(
        (flag) => argument === flag || argument.startsWith(`${flag}=`),
      )
    ) {
      errors.push(`El flag ${argument.split("=")[0]} está prohibido.`);
    }
  }
  return Object.freeze([...new Set(errors)]);
}

export function validateD72CanaryPlan(plan, options = {}) {
  const errors = [];
  let expected;
  try {
    expected = createD72CanaryZeroPercentDeploymentPlan(options);
  } catch (error) {
    return Object.freeze([error.message]);
  }
  try {
    exactKeys(
      plan,
      [
        "attach",
        "detach",
        "probes",
        "versionCertificationHash",
        "zeroPercentDeploymentAuthorizationHash",
        ...(isOpenUpdate(options)
          ? [
              "recovery",
              "recoveryCapsuleHash",
              "recoveryArtifactHash",
              "recoveryVersionId",
              ...Object.keys(d72CanarySourceBindings(options)),
            ]
          : []),
      ],
      "plan",
    );
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (
    !SHA256_PATTERN.test(plan.versionCertificationHash ?? "") ||
    plan.versionCertificationHash !== expected.versionCertificationHash
  ) {
    errors.push("versionCertificationHash del plan 100/0 no coincide.");
  }
  if (
    !SHA256_PATTERN.test(plan.zeroPercentDeploymentAuthorizationHash ?? "") ||
    plan.zeroPercentDeploymentAuthorizationHash !==
      expected.zeroPercentDeploymentAuthorizationHash
  ) {
    errors.push("La autorización opaca del deployment 100/0 no coincide.");
  }
  for (const phase of [
    "attach",
    "detach",
    ...(isOpenUpdate(options) ? ["recovery"] : []),
  ]) {
    errors.push(
      ...validateD72CanaryCommandStep(plan[phase]).map(
        (error) => `${phase}: ${error}`,
      ),
    );
    if (
      d72CanaryCanonicalJson(plan[phase]) !==
      d72CanaryCanonicalJson(expected[phase])
    ) {
      errors.push(`${phase} no coincide con el argv exacto aprobado.`);
    }
  }
  if (isOpenUpdate(options))
    for (const key of [
      "recoveryCapsuleHash",
      "recoveryArtifactHash",
      "recoveryVersionId",
      ...Object.keys(d72CanarySourceBindings(options)),
    ])
      if (plan[key] !== expected[key])
        errors.push(`El vínculo ${key} de recuperación OPEN no coincide.`);
  if (!Array.isArray(plan.probes)) {
    errors.push("probes no es un array.");
  } else {
    if (
      d72CanaryCanonicalJson(plan.probes) !==
      d72CanaryCanonicalJson(expected.probes)
    ) {
      errors.push("Los probes no coinciden con el plan exacto aprobado.");
    }
    for (const probe of plan.probes) {
      const requiresOverride =
        probe.id.startsWith("canary-") ||
        [
          "post-detach-override-falls-back-closed",
          "post-detach-override-falls-back-open",
        ].includes(probe.id);
      errors.push(
        ...validateD72CanaryVersionOverrideScope({
          url: probe.url,
          headers: probe.headers,
          canaryVersionId: options.versionCertification?.candidateVersionId,
          required: requiresOverride,
        }).map((error) => `${probe.id}: ${error}`),
      );
      if (
        Object.keys(probe.headers).some(
          (name) => name.toLowerCase() === "authorization",
        )
      ) {
        errors.push(`${probe.id} no puede llevar Authorization.`);
      }
    }
  }
  return Object.freeze([...new Set(errors)]);
}

export function assertD72CanaryPlan(plan, options = {}) {
  const errors = validateD72CanaryPlan(plan, options);
  if (errors.length > 0) {
    throw new Error(`Plan canary D72 inválido:\n${errors.join("\n")}`);
  }
}

export function validateD72CanaryZeroPercentDeploymentPlan(plan, options = {}) {
  return validateD72CanaryPlan(plan, options);
}

export function assertD72CanaryZeroPercentDeploymentPlan(plan, options = {}) {
  return assertD72CanaryPlan(plan, options);
}

export function d72CanaryReceiptContentHash(receiptOrPayload) {
  if (!isPlainObject(receiptOrPayload)) {
    throw new Error("El receipt canary no es un objeto plano.");
  }
  const payload = { ...receiptOrPayload };
  delete payload.contentSha256;
  return sha256(Buffer.from(d72CanaryCanonicalJson(payload), "utf8"));
}

function validateAuthorizationEvidence(
  evidence,
  { kind, expectedStatement, issuedAt, completedAt },
) {
  const errors = [];
  try {
    exactKeys(evidence, AUTHORIZATION_EVIDENCE_KEYS, `${kind}Authorization`);
  } catch (error) {
    return [error.message];
  }
  if (evidence.kind !== kind || evidence.source !== "/dev/tty") {
    errors.push(`La autorización ${kind} no proviene de /dev/tty.`);
  }
  if (
    evidence.statementSha256 !== sha256(Buffer.from(expectedStatement, "utf8"))
  ) {
    errors.push(`La autorización ${kind} no corresponde a la frase literal.`);
  }
  try {
    const confirmedAt = safeInstant(
      evidence.confirmedAtUtc,
      `${kind}Authorization.confirmedAtUtc`,
    );
    if (confirmedAt < issuedAt || confirmedAt > completedAt) {
      errors.push(`La autorización ${kind} quedó fuera de la ventana canary.`);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

function validateResults(results, definitions, keys, label, withHttpStatus) {
  const errors = [];
  if (!Array.isArray(results)) return [`${label} no es un array.`];
  if (results.length !== definitions.length) {
    errors.push(
      `${label} no contiene exactamente todos los checks requeridos.`,
    );
  }
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    try {
      exactKeys(result, keys, `${label}[${index}]`);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    const definition = definitions[index];
    if (
      !definition ||
      result.id !== definition.id ||
      result.status !== "PASS"
    ) {
      errors.push(`${label}[${index}] no acredita PASS del check esperado.`);
    }
    if (withHttpStatus && result.httpStatus !== definition?.expectedStatus) {
      errors.push(`${label}[${index}] no conserva el HTTP esperado.`);
    }
    if (
      result.requestId !== null &&
      (typeof result.requestId !== "string" ||
        !REQUEST_ID_PATTERN.test(result.requestId))
    ) {
      errors.push(`${label}[${index}].requestId no está saneado.`);
    }
  }
  return errors;
}

export function validateD72CanaryReceipt(
  receipt,
  {
    expectedHead,
    expectedRequestHash,
    expectedPolicyHash,
    expectedArtifactHash,
    expectedCanaryId,
    expectedStatefulManifestHash,
    expectedVersionCertification,
    now = new Date(),
  } = {},
) {
  const errors = [];
  try {
    exactKeys(
      receipt,
      [
        ...sourceKeys(RECEIPT_KEYS, receipt),
        ...(isOpenUpdate(receipt)
          ? [
              "recoveryCapsuleHash",
              "recoveryArtifactHash",
              "recoveryVersionId",
              "cleanupDeploymentId",
              "deploymentChain",
            ]
          : []),
      ],
      "receipt",
    );
  } catch (error) {
    return Object.freeze([error.message]);
  }
  let expectedUploadStatement;
  let expectedZeroPercentStatement;
  let expectedStatefulStatement;
  let expectedVersionCertificationHash;
  try {
    safeHead(expectedHead, "expectedHead");
    safeHash(expectedRequestHash, "expectedRequestHash");
    safeHash(expectedPolicyHash, "expectedPolicyHash");
    safeHash(expectedArtifactHash, "expectedArtifactHash");
    safeCanaryId(expectedCanaryId);
    safeHash(expectedStatefulManifestHash, "expectedStatefulManifestHash");
    safeVersionId(
      receipt[sourceField(receipt, "closedVersionId")],
      "closedVersionId",
    );
    expectedUploadStatement = d72CanaryVersionUploadAuthorizationPhrase({
      head: expectedHead,
      requestHash: expectedRequestHash,
      policyHash: expectedPolicyHash,
      artifactHash: expectedArtifactHash,
      workerName: D72_CANARY_WORKER_NAME,
      ...d72CanarySourceBindings(receipt, { includeDeployment: false }),
    });
    expectedZeroPercentStatement = d72CanaryInfrastructureAuthorizationPhrase({
      head: expectedHead,
      requestHash: expectedRequestHash,
      policyHash: expectedPolicyHash,
      artifactHash: expectedArtifactHash,
      accountId: D72_CANARY_ACCOUNT_ID,
      workerName: D72_CANARY_WORKER_NAME,
      ...d72CanarySourceBindings(expectedVersionCertification),
      candidateVersionId: receipt.canaryVersionId,
      versionCertificationHash: d72CanaryVersionCertificationHash(
        expectedVersionCertification,
      ),
    });
    expectedStatefulStatement = d72CanaryStatefulAuthorizationPhrase({
      head: expectedHead,
      canaryId: expectedCanaryId,
      statefulManifestHash: expectedStatefulManifestHash,
    });
    const versionErrors = validateD72CanaryVersionCertification(
      expectedVersionCertification,
      {
        expectedHead,
        expectedRequestHash,
        expectedPolicyHash,
        expectedArtifactHash,
        ...expectedSourceBindings(expectedVersionCertification),
        expectedCandidateVersionId: receipt.canaryVersionId,
        now: expectedVersionCertification?.observedAtUtc,
      },
    );
    if (versionErrors.length > 0) {
      throw new Error(versionErrors.join("\n"));
    }
    expectedVersionCertificationHash = d72CanaryVersionCertificationHash(
      expectedVersionCertification,
    );
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (
    receipt.releaseMode !== expectedVersionCertification.releaseMode ||
    receipt.openSourceBaselineSha256 !==
      expectedVersionCertification.openSourceBaselineSha256 ||
    sourceVersion(receipt) !== sourceVersion(expectedVersionCertification)
  )
    errors.push(
      "El receipt no corresponde al perfil/source/baseline recertificado.",
    );
  if (isOpenUpdate(receipt)) {
    for (const key of ["recoveryCapsuleHash", "recoveryArtifactHash"])
      if (!SHA256_PATTERN.test(receipt[key] ?? ""))
        errors.push(`Falta ${key} exacto.`);
    for (const key of ["recoveryVersionId", "cleanupDeploymentId"])
      if (!VERSION_ID_PATTERN.test(receipt[key] ?? ""))
        errors.push(`Falta ${key} exacto.`);
    if (
      receipt.recoveryVersionId === sourceVersion(receipt) ||
      receipt.recoveryVersionId === receipt.canaryVersionId
    )
      errors.push(
        "La versión fallback debe ser distinta de source y candidata.",
      );
    try {
      if (
        !Array.isArray(receipt.deploymentChain) ||
        receipt.deploymentChain.length !== 2
      )
        throw new Error("La cadena requiere attach y cleanup.");
      const [attach, cleanup] = receipt.deploymentChain;
      for (const transition of receipt.deploymentChain)
        exactKeys(
          transition,
          ["phase", "previousDeploymentId", "deploymentId"],
          "deployment transition",
        );
      if (
        attach.phase !== "attach" ||
        cleanup.phase !== "cleanup" ||
        attach.previousDeploymentId !==
          sourceDeployment(expectedVersionCertification) ||
        cleanup.previousDeploymentId !== attach.deploymentId ||
        cleanup.deploymentId !== receipt.cleanupDeploymentId ||
        !VERSION_ID_PATTERN.test(attach.deploymentId ?? "") ||
        new Set([
          sourceDeployment(expectedVersionCertification),
          attach.deploymentId,
          cleanup.deploymentId,
        ]).size !== 3
      )
        errors.push(
          "La cadena no vincula los deployments source, attach y cleanup exactos.",
        );
    } catch (error) {
      errors.push(error.message);
    }
  }
  for (const [field, expected] of [
    ["head", expectedHead],
    ["requestHash", expectedRequestHash],
    ["policyHash", expectedPolicyHash],
    ["artifactHash", expectedArtifactHash],
    ["canaryId", expectedCanaryId],
    ["statefulManifestHash", expectedStatefulManifestHash],
    ["versionCertificationHash", expectedVersionCertificationHash],
  ]) {
    if (receipt[field] !== expected) errors.push(`${field} no coincide.`);
  }
  if (
    receipt.schemaVersion !== D72_CANARY_RECEIPT_SCHEMA_VERSION ||
    receipt.accountId !== D72_CANARY_ACCOUNT_ID ||
    receipt.workerName !== D72_CANARY_WORKER_NAME
  ) {
    errors.push("El receipt no corresponde al schema/cuenta/Worker aprobados.");
  }
  let issuedAt;
  let completedAt;
  let expiresAt;
  try {
    issuedAt = safeInstant(receipt.issuedAtUtc, "issuedAtUtc");
    completedAt = safeInstant(receipt.completedAtUtc, "completedAtUtc");
    expiresAt = safeInstant(receipt.expiresAtUtc, "expiresAtUtc");
    if (
      completedAt < issuedAt ||
      completedAt >= expiresAt ||
      expiresAt.getTime() - issuedAt.getTime() > D72_CANARY_MAX_RECEIPT_AGE_MS
    ) {
      errors.push("La ventana temporal del receipt canary no es válida.");
    }
    const current = safeNow(now);
    if (current >= expiresAt) errors.push("El receipt canary está vencido.");
  } catch (error) {
    errors.push(error.message);
  }
  if (issuedAt && completedAt) {
    errors.push(
      ...validateAuthorizationEvidence(receipt.versionUploadAuthorization, {
        kind: "version-upload",
        expectedStatement: expectedUploadStatement,
        issuedAt,
        completedAt,
      }),
      ...validateAuthorizationEvidence(
        receipt.zeroPercentDeploymentAuthorization,
        {
          kind: "zero-percent-deployment",
          expectedStatement: expectedZeroPercentStatement,
          issuedAt,
          completedAt,
        },
      ),
      ...validateAuthorizationEvidence(receipt.statefulAuthorization, {
        kind: "stateful",
        expectedStatement: expectedStatefulStatement,
        issuedAt,
        completedAt,
      }),
    );
    try {
      const uploadAt = safeInstant(
        receipt.versionUploadAuthorization.confirmedAtUtc,
        "versionUploadAuthorization.confirmedAtUtc",
      );
      const versionCertifiedAt = safeInstant(
        receipt.versionCertifiedAtUtc,
        "versionCertifiedAtUtc",
      );
      const zeroPercentAt = safeInstant(
        receipt.zeroPercentDeploymentAuthorization.confirmedAtUtc,
        "zeroPercentDeploymentAuthorization.confirmedAtUtc",
      );
      const statefulAt = safeInstant(
        receipt.statefulAuthorization.confirmedAtUtc,
        "statefulAuthorization.confirmedAtUtc",
      );
      if (
        versionCertifiedAt < uploadAt ||
        zeroPercentAt < versionCertifiedAt ||
        statefulAt < zeroPercentAt
      ) {
        errors.push(
          "El orden debe ser autorización upload, GET/certificación, autorización 100/0 y autorización stateful.",
        );
      }
    } catch {
      // Los validadores anteriores ya producen el error saneado.
    }
  }
  try {
    safeVersionId(
      receipt[sourceField(receipt, "closedVersionId")],
      "closedVersionId",
    );
    safeVersionId(receipt.canaryVersionId, "canaryVersionId");
    if (
      receipt[sourceField(receipt, "closedVersionId")] ===
      receipt.canaryVersionId
    ) {
      errors.push("Las versiones CLOSED y canary no pueden coincidir.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  if (
    receipt.canaryTrafficPercentage !== 0 ||
    receipt.canaryInfrastructureMutationExecuted !== true ||
    receipt.canaryVersionRetainedUndeployed !== true ||
    receipt.productionOpenDeploymentAuthorized !== false ||
    receipt.productionOpenDeploymentExecuted !== false
  ) {
    errors.push(
      "El receipt no conserva 0% canary y OPEN no autorizado/no ejecutado.",
    );
  }
  if (!SHA256_PATTERN.test(receipt.canaryCapabilityBindingHash ?? "")) {
    errors.push(
      "El receipt no conserva el hash saneado del capability binding.",
    );
  }
  try {
    const capabilityExpiresAt = safeInstant(
      receipt.canaryCapabilityExpiresAtUtc,
      "canaryCapabilityExpiresAtUtc",
    );
    if (
      (issuedAt && capabilityExpiresAt <= issuedAt) ||
      (completedAt && capabilityExpiresAt < completedAt)
    ) {
      errors.push("El capability no cubrió toda la ventana canary ejecutada.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  errors.push(
    ...validateResults(
      receipt.probes,
      d72CanaryProbeExpectationsForRelease(receipt),
      PROBE_RESULT_KEYS,
      "probes",
      true,
    ),
    ...validateResults(
      receipt.statefulChecks,
      [
        ...D72_CANARY_STATEFUL_CHECK_IDS,
        ...(isOpenUpdate(receipt) ? ["google-oauth-lifecycle"] : []),
      ].map((id) => ({ id })),
      STATEFUL_RESULT_KEYS,
      "statefulChecks",
      false,
    ),
  );
  try {
    exactKeys(receipt.cleanup, CLEANUP_KEYS, "cleanup");
    if (
      receipt.cleanup.deploymentDetached !== true ||
      receipt.cleanup.activeVersionId !==
        receipt[sourceField(receipt, "closedVersionId")] ||
      receipt.cleanup.activeVersionPercentage !== 100 ||
      receipt.cleanup.canaryVersionInActiveDeployment !== false ||
      receipt.cleanup.cronCount !==
        (isOpenUpdate(receipt) ? D72_CANARY_EXPECTED_OPEN_CRONS.length : 0) ||
      receipt.cleanup.ephemeralStorageRemoved !== true ||
      receipt.cleanup.browserStateDestroyed !== true ||
      receipt.cleanup.mailboxArtifactsRemoved !== true ||
      receipt.cleanup.testSessionsRevoked !== true ||
      receipt.cleanup.canaryAccountDisposition !== "deleted"
    ) {
      errors.push(
        "El cleanup canary no restaura CLOSED@100, cero crons y estado efímero limpio.",
      );
    }
  } catch (error) {
    errors.push(error.message);
  }
  try {
    if (
      !SHA256_PATTERN.test(receipt.contentSha256 ?? "") ||
      receipt.contentSha256 !== d72CanaryReceiptContentHash(receipt)
    ) {
      errors.push("contentSha256 no sella el receipt canary.");
    }
  } catch (error) {
    errors.push(error.message);
  }
  return Object.freeze([...new Set(errors)]);
}

export function createD72CanaryReceipt({
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryId,
  statefulManifestHash,
  issuedAtUtc,
  expiresAtUtc,
  completedAtUtc,
  closedVersionId,
  canaryVersionId,
  canaryCapabilityBindingHash,
  canaryCapabilityExpiresAtUtc,
  versionCertification,
  versionUploadAuthorization,
  zeroPercentDeploymentAuthorization,
  statefulAuthorization,
  probes,
  statefulChecks,
  cleanup,
  ...openOptions
} = {}) {
  assertIssuedVersionCertification(versionCertification);
  const payload = {
    schemaVersion: D72_CANARY_RECEIPT_SCHEMA_VERSION,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    head,
    requestHash,
    policyHash,
    artifactHash,
    canaryId,
    statefulManifestHash,
    issuedAtUtc,
    expiresAtUtc,
    completedAtUtc,
    ...(isOpenUpdate(versionCertification)
      ? {
          ...d72CanarySourceBindings(versionCertification, {
            includeDeployment: false,
          }),
          recoveryCapsuleHash: openOptions.recoveryCapsuleHash,
          recoveryArtifactHash: openOptions.recoveryArtifactHash,
          recoveryVersionId: openOptions.recoveryVersionId,
          cleanupDeploymentId: openOptions.cleanupDeploymentId,
          deploymentChain: openOptions.deploymentChain,
        }
      : { closedVersionId }),
    canaryVersionId,
    canaryCapabilityBindingHash,
    canaryCapabilityExpiresAtUtc,
    versionCertificationHash:
      d72CanaryVersionCertificationHash(versionCertification),
    versionCertifiedAtUtc: versionCertification.observedAtUtc,
    versionUploadAuthorization: { ...versionUploadAuthorization },
    zeroPercentDeploymentAuthorization: {
      ...zeroPercentDeploymentAuthorization,
    },
    statefulAuthorization: { ...statefulAuthorization },
    canaryTrafficPercentage: 0,
    canaryInfrastructureMutationExecuted: true,
    canaryVersionRetainedUndeployed: true,
    productionOpenDeploymentAuthorized: false,
    productionOpenDeploymentExecuted: false,
    probes: probes.map((result) => ({ ...result })),
    statefulChecks: statefulChecks.map((result) => ({ ...result })),
    cleanup: { ...cleanup },
  };
  const receipt = Object.freeze({
    ...payload,
    contentSha256: d72CanaryReceiptContentHash(payload),
  });
  const errors = validateD72CanaryReceipt(receipt, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedPolicyHash: policyHash,
    expectedArtifactHash: artifactHash,
    expectedCanaryId: canaryId,
    expectedStatefulManifestHash: statefulManifestHash,
    expectedVersionCertification: versionCertification,
    now: completedAtUtc,
  });
  if (errors.length > 0) {
    throw new Error(`Receipt canary D72 inválido:\n${errors.join("\n")}`);
  }
  return receipt;
}
