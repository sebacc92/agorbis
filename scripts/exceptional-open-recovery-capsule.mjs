import { createHash } from "node:crypto";
import { canonicalJson } from "./exceptional-release-act.mjs";
import {
  CLOUDFLARE_STATE_CONSTANTS,
  validateCloudflareOpenRecoveryState,
} from "./cloudflare-closed-state.mjs";
import {
  OPEN_RELEASE_BASELINE_SCHEMA_VERSION,
  OPEN_RELEASE_BASELINE_PROFILE,
  OPEN_RELEASE_BASELINE_MAX_AGE_MS,
  assertOpenReleaseBaselineMatches,
} from "./open-release-baseline-policy.mjs";
import { CANDIDATE_MIGRATION_IDS } from "./production-preflight-policy.mjs";
import { parseJsonc } from "./cloudflare-worker-policy.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const EXCEPTIONAL_OPEN_RECOVERY_CAPSULE_SCHEMA_VERSION =
  "agorbis-exceptional-open-recovery-capsule/v1";
export const EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION =
  "agorbis-exceptional-open-recovery-compatibility/v1";
export const EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION =
  "agorbis-exceptional-open-recovery-upload/v1";
export const EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS = Object.freeze([
  "email-sign-in",
  "email-recovery",
  "google-consent-withdrawal-0066",
  "google-consent-export-0066",
  "google-notice-snapshot-0067",
  "provider-token-redaction",
  "post-0067-database-compatibility",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const HEAD = /^[0-9a-f]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILES = ["exceptional-release-empty.env", "wrangler.traffic.jsonc"];
const BINDINGS = [
  "head",
  "requestHash",
  "artifactHash",
  "openSourceBaselineSha256",
  "sourceVersionId",
  "sourceDeploymentId",
  "recoveryVersionId",
  "recoveryArtifactHash",
  "compatibilitySha256",
  "recoveryUploadEvidenceSha256",
];
const MANIFEST_KEYS = [
  ...BINDINGS,
  "schemaVersion",
  "releaseMode",
  "recoveryScope",
  "accountId",
  "workerName",
  "policyVersion",
  "policyHash",
  "createdAtUtc",
  "openSourceBaseline",
  "compatibilityEvidence",
  "recoveryUploadEvidence",
  "files",
  "contentSha256",
];

function isHash(value) {
  return typeof value === "string" && SHA256.test(value);
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function scopeBindings(scope) {
  if (scope === "FINAL_RELEASE") return ["actHash", "issuanceHash"];
  if (scope === "CANARY_ONLY")
    return ["candidateIdentityHash", "infraAuthorizationHash"];
  throw new Error(
    "El ámbito de recuperación OPEN debe ser explícito y conocido.",
  );
}

// Never invoke getters/toJSON or accept data that hashes differently after
// persistence. The capsule is JSON data, not an executable authority object.
function jsonData(value, ancestors = new Set(), depth = 0) {
  invariant(depth < 32, "Recovery OPEN excede la profundidad JSON permitida.");
  if (value === null || ["string", "boolean"].includes(typeof value))
    return value;
  if (typeof value === "number") {
    invariant(
      Number.isFinite(value),
      "Recovery OPEN contiene un número inválido.",
    );
    return value;
  }
  invariant(
    value &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) ===
        (Array.isArray(value) ? Array.prototype : Object.prototype),
    "Recovery OPEN requiere exclusivamente datos JSON.",
  );
  invariant(
    !ancestors.has(value),
    "Recovery OPEN contiene una referencia cíclica.",
  );
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).filter(
    (key) => !Array.isArray(value) || key !== "length",
  );
  invariant(
    keys.every(
      (key) =>
        typeof key === "string" &&
        descriptors[key].enumerable &&
        Object.hasOwn(descriptors[key], "value"),
    ),
    "Recovery OPEN no admite accessors ni propiedades ocultas.",
  );
  let result;
  if (Array.isArray(value)) {
    invariant(
      keys.length === value.length &&
        keys.every((key, index) => key === String(index)),
      "Recovery OPEN no admite arrays dispersos.",
    );
    result = keys.map((key) =>
      jsonData(descriptors[key].value, ancestors, depth + 1),
    );
  } else {
    result = Object.fromEntries(
      keys
        .sort()
        .map((key) => [
          key,
          jsonData(descriptors[key].value, ancestors, depth + 1),
        ]),
    );
  }
  ancestors.delete(value);
  return result;
}

function exactKeys(value, keys, label) {
  invariant(
    value &&
      !Array.isArray(value) &&
      typeof value === "object" &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
    `${label} contiene campos faltantes o desconocidos.`,
  );
}
function hash(value) {
  return createHash("sha256")
    .update(canonicalJson(jsonData(value)))
    .digest("hex");
}
function sourceBaselineHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(jsonData(value)))
    .digest("hex");
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function instant(value) {
  invariant(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    "Recovery OPEN requiere un instante UTC canónico.",
  );
  return Date.parse(value);
}
function same(left, right, label) {
  invariant(
    canonicalJson(left) === canonicalJson(right),
    `${label} no coincide con su referencia fijada.`,
  );
}

export function exceptionalOpenRecoveryEvidenceHash(evidence) {
  return hash(evidence);
}

export function exceptionalOpenRecoveryCapsuleHash(capsuleOrPayload) {
  const { contentSha256: _hash, ...payload } = jsonData(capsuleOrPayload);
  return hash(payload);
}

function assertEvidence(manifest) {
  const compatibility = manifest.compatibilityEvidence;
  exactKeys(
    compatibility,
    [
      "schemaVersion",
      "head",
      "recoveryArtifactHash",
      "migrationIds",
      "checks",
      "verifiedAtUtc",
    ],
    "La compatibilidad OPEN",
  );
  invariant(
    compatibility.schemaVersion ===
      EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION &&
      compatibility.head === manifest.head &&
      compatibility.recoveryArtifactHash === manifest.recoveryArtifactHash &&
      hash(compatibility) === manifest.compatibilitySha256,
    "La evidencia de compatibilidad no pertenece al artefacto de recuperación.",
  );
  same(
    compatibility.migrationIds,
    CANDIDATE_MIGRATION_IDS,
    "El ledger compatible",
  );
  invariant(
    instant(compatibility.verifiedAtUtc) <= instant(manifest.createdAtUtc),
    "La compatibilidad proviene del futuro.",
  );
  invariant(
    Array.isArray(compatibility.checks) &&
      compatibility.checks.length ===
        EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.length,
    "La compatibilidad de recuperación está incompleta.",
  );
  for (const [index, check] of compatibility.checks.entries()) {
    exactKeys(
      check,
      ["id", "result", "evidenceSha256"],
      "El check de compatibilidad",
    );
    invariant(
      check.id === EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS[index] &&
        check.result === "PASS" &&
        isHash(check.evidenceSha256),
      "La compatibilidad de recuperación no tiene todos los checks verificados.",
    );
  }
  const upload = manifest.recoveryUploadEvidence;
  exactKeys(
    upload,
    [
      "schemaVersion",
      "head",
      "recoveryArtifactHash",
      "recoveryVersionId",
      "uploadPayloadHash",
      "modulesProofSha256",
      "staticAssetsProofSha256",
      "configurationProofSha256",
      "versionScriptEtag",
      "tag",
      "message",
      "uploadedAtUtc",
      "verifiedAtUtc",
    ],
    "La evidencia de upload OPEN",
  );
  invariant(
    upload.schemaVersion === EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION &&
      upload.head === manifest.head &&
      upload.recoveryArtifactHash === manifest.recoveryArtifactHash &&
      upload.recoveryVersionId === manifest.recoveryVersionId &&
      hash(upload) === manifest.recoveryUploadEvidenceSha256,
    "El upload no corresponde a la versión/artefacto de recuperación.",
  );
  for (const key of [
    "uploadPayloadHash",
    "modulesProofSha256",
    "staticAssetsProofSha256",
    "configurationProofSha256",
    "versionScriptEtag",
  ])
    invariant(
      isHash(upload[key]),
      "Falta evidencia verificable del upload de recuperación.",
    );
  invariant(
    instant(upload.verifiedAtUtc) <= instant(manifest.createdAtUtc),
    "El upload proviene del futuro.",
  );
  invariant(
    upload.tag === `d72-canary-${manifest.head}` &&
      typeof upload.message === "string" &&
      /^agorbis-d72-canary:upload:v1:[0-9a-f]{64}$/.test(upload.message) &&
      instant(upload.uploadedAtUtc) <= instant(upload.verifiedAtUtc),
    "El upload de recuperación no conserva sus anotaciones e instante fijados.",
  );
}

function assertManifest(manifest) {
  const scopedBindings = scopeBindings(manifest.recoveryScope);
  exactKeys(manifest, [...MANIFEST_KEYS, ...scopedBindings], "La cápsula OPEN");
  invariant(
    manifest.schemaVersion ===
      EXCEPTIONAL_OPEN_RECOVERY_CAPSULE_SCHEMA_VERSION &&
      manifest.releaseMode === "OPEN_UPDATE" &&
      manifest.accountId === CLOUDFLARE_STATE_CONSTANTS.accountId &&
      manifest.workerName === CLOUDFLARE_STATE_CONSTANTS.workerName &&
      manifest.policyVersion === RELEASE_GATE_POLICY_VERSION &&
      manifest.policyHash === RELEASE_GATE_POLICY_SHA256,
    "La cápsula no pertenece a la recuperación OPEN aprobada.",
  );
  for (const key of [...BINDINGS, ...scopedBindings]) {
    const pattern = key === "head" ? HEAD : key.endsWith("Id") ? UUID : SHA256;
    invariant(
      typeof manifest[key] === "string" && pattern.test(manifest[key]),
      "Los vínculos de recuperación OPEN son inválidos.",
    );
  }
  instant(manifest.createdAtUtc);
  invariant(
    manifest.recoveryVersionId !== manifest.sourceVersionId &&
      manifest.recoveryArtifactHash !== manifest.artifactHash,
    "La recuperación requiere su versión y artefacto Google deshabilitado independientes.",
  );
  const baseline = manifest.openSourceBaseline;
  exactKeys(
    baseline,
    [
      "accountId",
      "configuration",
      "crons",
      "deploymentId",
      "domains",
      "expiresAtUtc",
      "observedAtUtc",
      "percentage",
      "profile",
      "schemaVersion",
      "secretNames",
      "subdomain",
      "versionId",
      "workerName",
      "zoneId",
    ],
    "El baseline histórico OPEN",
  );
  invariant(
    sourceBaselineHash(baseline) === manifest.openSourceBaselineSha256 &&
      baseline.versionId === manifest.sourceVersionId &&
      baseline.deploymentId === manifest.sourceDeploymentId &&
      baseline.accountId === manifest.accountId &&
      baseline.workerName === manifest.workerName &&
      baseline.zoneId === CLOUDFLARE_STATE_CONSTANTS.zoneId &&
      baseline.schemaVersion === OPEN_RELEASE_BASELINE_SCHEMA_VERSION &&
      baseline.profile === OPEN_RELEASE_BASELINE_PROFILE &&
      baseline.percentage === 100,
    "El baseline histórico de recuperación no coincide.",
  );
  invariant(
    instant(baseline.observedAtUtc) <= instant(manifest.createdAtUtc) &&
      instant(manifest.createdAtUtc) < instant(baseline.expiresAtUtc) &&
      instant(baseline.expiresAtUtc) - instant(baseline.observedAtUtc) <=
        OPEN_RELEASE_BASELINE_MAX_AGE_MS,
    "La cápsula no fue preparada dentro de la ventana histórica del baseline.",
  );
  assertEvidence(manifest);
  invariant(
    Array.isArray(manifest.files) && manifest.files.length === FILES.length,
    "La cápsula debe contener sólo tráfico y env vacío.",
  );
  for (const [index, file] of manifest.files.entries()) {
    exactKeys(file, ["path", "sha256", "size"], "El archivo de recuperación");
    invariant(
      file.path === FILES[index] &&
        isHash(file.sha256) &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0 &&
        file.size <= 1024 * 1024,
      "El inventario de recuperación es inválido.",
    );
  }
  invariant(
    manifest.files[0].size === 0 &&
      manifest.files[0].sha256 ===
        createHash("sha256").update("").digest("hex"),
    "El env de recuperación debe permanecer vacío.",
  );
  invariant(
    isHash(manifest.contentSha256) &&
      exceptionalOpenRecoveryCapsuleHash(manifest) === manifest.contentSha256,
    "El hash de la cápsula OPEN no coincide.",
  );
}

/**
 * Pure manifest preparation. The caller must verify the compatibility receipts
 * and remote upload (including static assets), then pin their external hashes;
 * this function does not certify those bytes or create release authority.
 * Persist this JSON and its two files using the existing exclusive/fsync capsule
 * storage, external hash binding and operation lock; do not use a plain write.
 */
export function createExceptionalOpenRecoveryCapsule(options) {
  const input = jsonData(options);
  const scopedBindings = scopeBindings(input.recoveryScope);
  exactKeys(
    input,
    [
      "head",
      "requestHash",
      "recoveryScope",
      ...scopedBindings,
      "artifactHash",
      "openSourceBaseline",
      "expectedBaselineSha256",
      "sourceSnapshot",
      "recoveryVersionId",
      "recoveryArtifactHash",
      "compatibilityEvidence",
      "expectedCompatibilitySha256",
      "recoveryUploadEvidence",
      "expectedRecoveryUploadEvidenceSha256",
      "files",
      "createdAtUtc",
    ],
    "La preparación de recovery OPEN",
  );
  assertOpenReleaseBaselineMatches({
    baseline: input.openSourceBaseline,
    expectedBaselineSha256: input.expectedBaselineSha256,
    snapshot: input.sourceSnapshot,
    observedAtUtc: input.createdAtUtc,
    nowUtc: input.createdAtUtc,
  });
  const payload = {
    schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_CAPSULE_SCHEMA_VERSION,
    releaseMode: "OPEN_UPDATE",
    recoveryScope: input.recoveryScope,
    accountId: CLOUDFLARE_STATE_CONSTANTS.accountId,
    workerName: CLOUDFLARE_STATE_CONSTANTS.workerName,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head: input.head,
    requestHash: input.requestHash,
    ...Object.fromEntries(scopedBindings.map((key) => [key, input[key]])),
    artifactHash: input.artifactHash,
    openSourceBaseline: input.openSourceBaseline,
    openSourceBaselineSha256: input.expectedBaselineSha256,
    sourceVersionId: input.openSourceBaseline.versionId,
    sourceDeploymentId: input.openSourceBaseline.deploymentId,
    recoveryVersionId: input.recoveryVersionId,
    recoveryArtifactHash: input.recoveryArtifactHash,
    compatibilityEvidence: input.compatibilityEvidence,
    compatibilitySha256: input.expectedCompatibilitySha256,
    recoveryUploadEvidence: input.recoveryUploadEvidence,
    recoveryUploadEvidenceSha256: input.expectedRecoveryUploadEvidenceSha256,
    files: input.files,
    createdAtUtc: input.createdAtUtc,
  };
  const manifest = {
    ...payload,
    contentSha256: exceptionalOpenRecoveryCapsuleHash(payload),
  };
  assertManifest(manifest);
  return freeze(manifest);
}

/**
 * Validate a persisted capsule against bindings held outside that capsule.
 * There is intentionally no promotion-expiry check: urgent recovery remains
 * possible after the original one-hour baseline expires. This is integrity
 * validation, not permission to run a subprocess or bypass an operation lock.
 */
export function assertExceptionalOpenRecoveryCapsule(
  capsule,
  expectedBindings,
) {
  const manifest = jsonData(capsule);
  const expected = jsonData(expectedBindings);
  const scopedBindings = scopeBindings(expected.recoveryScope);
  exactKeys(
    expected,
    [...BINDINGS, ...scopedBindings, "recoveryScope", "expectedCapsuleHash"],
    "Los vínculos externos de recuperación",
  );
  assertManifest(manifest);
  invariant(
    isHash(expected.expectedCapsuleHash) &&
      expected.expectedCapsuleHash === manifest.contentSha256,
    "La cápsula no coincide con su hash externo.",
  );
  for (const key of [...BINDINGS, ...scopedBindings, "recoveryScope"])
    same(manifest[key], expected[key], `El vínculo ${key}`);
  return freeze(manifest);
}

/**
 * Bind the already verified canary fallback to the final act/issuance. The
 * caller must separately validate the current source using the certified
 * canary deployment chain; no historical observation is presented as current.
 */
export function rebindExceptionalOpenRecoveryCapsuleForFinalRelease({
  canaryCapsule,
  canaryExpectedBindings,
  actHash,
  issuanceHash,
  createdAtUtc,
}) {
  const previous = assertExceptionalOpenRecoveryCapsule(
    canaryCapsule,
    canaryExpectedBindings,
  );
  invariant(
    previous.recoveryScope === "CANARY_ONLY",
    "El fallback debe provenir de la cápsula canary verificada.",
  );
  const {
    candidateIdentityHash: _candidate,
    infraAuthorizationHash: _infra,
    contentSha256: _hash,
    ...previousPayload
  } = previous;
  const payload = {
    ...previousPayload,
    recoveryScope: "FINAL_RELEASE",
    actHash,
    issuanceHash,
    createdAtUtc,
  };
  const manifest = {
    ...payload,
    contentSha256: exceptionalOpenRecoveryCapsuleHash(payload),
  };
  assertManifest(manifest);
  return freeze(manifest);
}

// The existing safe filesystem reader passes exact file contents here after
// O_NOFOLLOW, owner/mode/link-count, stable-read and directory checks.
export function assertExceptionalOpenRecoveryFiles({
  capsuleManifest,
  expectedBindings,
  sources,
}) {
  const manifest = assertExceptionalOpenRecoveryCapsule(
    capsuleManifest,
    expectedBindings,
  );
  const input = jsonData(sources);
  exactKeys(input, FILES, "Los archivos de recuperación OPEN");
  for (const file of manifest.files) {
    invariant(
      typeof input[file.path] === "string" &&
        Buffer.byteLength(input[file.path]) === file.size &&
        createHash("sha256").update(input[file.path]).digest("hex") ===
          file.sha256,
      "Un archivo de recuperación no coincide con su hash fijado.",
    );
  }
  same(
    parseJsonc(input["wrangler.traffic.jsonc"]),
    {
      $schema: "node_modules/wrangler/config-schema.json",
      name: CLOUDFLARE_STATE_CONSTANTS.workerName,
      account_id: CLOUDFLARE_STATE_CONSTANTS.accountId,
    },
    "La configuración exclusiva de tráfico",
  );
  return manifest;
}

/** Verify post-recovery configuration; remote byte/asset evidence is separate. */
export function assertExceptionalOpenRecoveredState({
  capsuleManifest,
  expectedBindings,
  snapshot,
  observedAtUtc,
}) {
  const manifest = assertExceptionalOpenRecoveryCapsule(
    capsuleManifest,
    expectedBindings,
  );
  const observed = jsonData(snapshot);
  invariant(
    instant(observedAtUtc) >= instant(manifest.createdAtUtc),
    "La observación de recovery es anterior a la cápsula.",
  );
  const identity = validateCloudflareOpenRecoveryState(observed);
  invariant(
    identity.activeVersionId === manifest.recoveryVersionId,
    "Recovery no desplegó la versión fallback exacta.",
  );
  const baseline = manifest.openSourceBaseline;
  const byName = (a, b) => a.name.localeCompare(b.name, "en");
  const { annotations: _annotations, ...settings } = observed.settings.result;
  settings.bindings.sort(byName);
  settings.compatibility_flags.sort();
  const expectedSettings = jsonData(baseline.configuration.settings);
  expectedSettings.bindings.push({
    name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
    text: "false",
    type: "plain_text",
  });
  expectedSettings.bindings.sort(byName);
  same(
    settings,
    expectedSettings,
    "La configuración OPEN con Google/Facebook deshabilitados",
  );
  same(
    observed.accountSettings.result,
    baseline.configuration.account,
    "La configuración de cuenta",
  );
  same(
    observed.domains.result.sort((a, b) =>
      a.hostname.localeCompare(b.hostname, "en"),
    ),
    baseline.domains,
    "Los dominios",
  );
  same(
    observed.schedules.result.schedules.map(({ cron }) => cron).sort(),
    baseline.crons,
    "Los crons preservados",
  );
  same(
    observed.secrets.result.map(({ name }) => name).sort(),
    baseline.secretNames,
    "Los nombres de secretos",
  );
  same(observed.subdomain.result, baseline.subdomain, "El subdominio");
  // Version and deployment changes are expected. The dedicated upload evidence
  // binds fallback module/asset bytes; do not compare the old source ETag/tag.
  const {
    created_on: _created,
    modified_on: _modified,
    deployment_id: _deployment,
    etag: _etag,
    tag: _tag,
    ...script
  } = observed.scripts.result.find(({ id }) => id === manifest.workerName);
  script.handlers.sort();
  script.compatibility_flags.sort();
  same(script, baseline.configuration.script, "La configuración del script");
  return freeze({
    status: "OPEN_RECOVERY_STATE_MATCHED",
    recoveryScope: manifest.recoveryScope,
    executionAllowed: false,
    capsuleHash: manifest.contentSha256,
    recoveryVersionId: identity.activeVersionId,
    deploymentId: identity.activeDeploymentId,
    observedAtUtc,
  });
}
