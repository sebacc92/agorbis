import { createHash } from "node:crypto";
import {
  CLOUDFLARE_STATE_CONSTANTS,
  validateCloudflareOpenSourceState,
} from "./cloudflare-closed-state.mjs";

export const OPEN_RELEASE_BASELINE_SCHEMA_VERSION =
  "agorbis-open-release-baseline/v1";
export const OPEN_RELEASE_BASELINE_PROFILE =
  "open-google-disabled-facebook-binding-absent";
export const OPEN_RELEASE_BASELINE_MAX_AGE_MS = 60 * 60 * 1_000;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASELINE_KEYS = Object.freeze([
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
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// Only JSON data is accepted. Getters, non-finite numbers and ambiguous object
// shapes must not influence either the comparison or the content hash.
function jsonData(value, ancestors = new Set(), depth = 0) {
  invariant(depth < 32, "El baseline excede la profundidad JSON permitida.");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    invariant(
      Number.isFinite(value),
      "El baseline contiene un número inválido.",
    );
    return value;
  }
  invariant(
    plainObject(value) ||
      (Array.isArray(value) &&
        Object.getPrototypeOf(value) === Array.prototype),
    "El baseline requiere exclusivamente datos JSON.",
  );
  invariant(
    !ancestors.has(value),
    "El baseline contiene una referencia cíclica.",
  );
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  invariant(
    Reflect.ownKeys(descriptors).every((key) => typeof key === "string"),
    "El baseline contiene propiedades no JSON.",
  );
  const keys = Object.keys(descriptors).filter(
    (key) => !Array.isArray(value) || key !== "length",
  );
  for (const key of keys) {
    invariant(
      Object.hasOwn(descriptors[key], "value") && descriptors[key].enumerable,
      "El baseline no admite accessors ni propiedades ocultas.",
    );
  }
  let copied;
  if (Array.isArray(value)) {
    invariant(
      keys.length === value.length &&
        keys.every((key, index) => key === String(index)),
      "El baseline no admite arrays dispersos ni propiedades adicionales.",
    );
    copied = keys.map((key) =>
      jsonData(descriptors[key].value, ancestors, depth + 1),
    );
  } else {
    copied = Object.fromEntries(
      keys
        .sort()
        .map((key) => [
          key,
          jsonData(descriptors[key].value, ancestors, depth + 1),
        ]),
    );
  }
  ancestors.delete(value);
  return copied;
}

function exactKeys(value, keys, label) {
  invariant(
    plainObject(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
    `${label} no contiene exactamente los campos previstos.`,
  );
}

function instant(value) {
  invariant(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value),
    "El baseline requiere instantes UTC canónicos.",
  );
  const parsed = Date.parse(value);
  invariant(
    Number.isFinite(parsed) && new Date(parsed).toISOString() === value,
    "El baseline contiene un instante UTC inválido.",
  );
  return parsed;
}

function assertWindow({ observedAtUtc, expiresAtUtc, nowUtc }) {
  const observed = instant(observedAtUtc);
  const expires = instant(expiresAtUtc);
  const now = instant(nowUtc);
  invariant(
    observed <= now &&
      now < expires &&
      expires - observed <= OPEN_RELEASE_BASELINE_MAX_AGE_MS,
    "El baseline está vencido, es futuro o excede su ventana máxima.",
  );
}

function freeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(jsonData(value)))
    .digest("hex");
}

const byName = (left, right) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
const byHostname = (left, right) =>
  left.hostname < right.hostname ? -1 : left.hostname > right.hostname ? 1 : 0;

function baselineFromSnapshot(snapshot, { observedAtUtc, expiresAtUtc }) {
  const identity = validateCloudflareOpenSourceState(snapshot);
  const { annotations: _annotations, ...settings } = snapshot.settings.result;
  settings.bindings = [...settings.bindings].sort(byName);
  settings.compatibility_flags = [...settings.compatibility_flags].sort();
  const target = snapshot.scripts.result.find(
    (entry) => entry.id === CLOUDFLARE_STATE_CONSTANTS.workerName,
  );
  const {
    created_on: _created,
    modified_on: _modified,
    deployment_id: _deployment,
    etag,
    tag,
    ...script
  } = target;
  script.handlers = [...script.handlers].sort();
  script.compatibility_flags = [...script.compatibility_flags].sort();

  return {
    schemaVersion: OPEN_RELEASE_BASELINE_SCHEMA_VERSION,
    profile: OPEN_RELEASE_BASELINE_PROFILE,
    accountId: CLOUDFLARE_STATE_CONSTANTS.accountId,
    zoneId: CLOUDFLARE_STATE_CONSTANTS.zoneId,
    workerName: CLOUDFLARE_STATE_CONSTANTS.workerName,
    deploymentId: identity.activeDeploymentId,
    versionId: identity.activeVersionId,
    percentage: 100,
    observedAtUtc,
    expiresAtUtc,
    configuration: {
      account: snapshot.accountSettings.result,
      settings,
      script,
      scriptReferenceSha256: hash({ etag, tag }),
    },
    domains: [...snapshot.domains.result].sort(byHostname),
    crons: snapshot.schedules.result.schedules.map(({ cron }) => cron).sort(),
    secretNames: snapshot.secrets.result.map(({ name }) => name).sort(),
    subdomain: snapshot.subdomain.result,
  };
}

/**
 * Pure preparation from an already collected observation. This produces a
 * review candidate, not remote evidence, approval or permission to deploy.
 * A future caller must bind its hash into the reviewed frozen artifact.
 */
export function createOpenReleaseBaselineCandidate(options) {
  const input = jsonData(options);
  exactKeys(
    input,
    ["snapshot", "observedAtUtc", "expiresAtUtc", "nowUtc"],
    "La preparación del baseline",
  );
  assertWindow(input);
  const baseline = baselineFromSnapshot(input.snapshot, input);
  return freeze({
    baseline,
    baselineSha256: hash(baseline),
    status: "REVIEW_REQUIRED",
    executionAllowed: false,
  });
}

/**
 * Checks a pinned record before embedding it in a request or artifact. This is
 * integrity/freshness validation only: the current Cloudflare observation must
 * still pass assertOpenReleaseBaselineMatches before issuing evidence or
 * promoting a version. It never authorizes execution or emergency recovery.
 */
export function assertOpenReleaseBaselineRecord(options) {
  const input = jsonData(options);
  exactKeys(
    input,
    ["baseline", "expectedBaselineSha256", "nowUtc"],
    "El registro del baseline",
  );
  const { baseline, expectedBaselineSha256, nowUtc } = input;
  exactKeys(baseline, BASELINE_KEYS, "El baseline");
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  invariant(
    baseline.schemaVersion === OPEN_RELEASE_BASELINE_SCHEMA_VERSION &&
      baseline.profile === OPEN_RELEASE_BASELINE_PROFILE &&
      baseline.accountId === CLOUDFLARE_STATE_CONSTANTS.accountId &&
      baseline.zoneId === CLOUDFLARE_STATE_CONSTANTS.zoneId &&
      baseline.workerName === CLOUDFLARE_STATE_CONSTANTS.workerName &&
      baseline.percentage === 100 &&
      uuid.test(baseline.versionId) &&
      uuid.test(baseline.deploymentId),
    "El baseline no identifica el origen OPEN aprobado.",
  );
  invariant(
    SHA256_PATTERN.test(expectedBaselineSha256) &&
      hash(baseline) === expectedBaselineSha256,
    "El contenido del baseline no coincide con su hash fijado.",
  );
  exactKeys(
    baseline.configuration,
    ["account", "settings", "script", "scriptReferenceSha256"],
    "La configuración del baseline",
  );
  invariant(
    plainObject(baseline.configuration.account) &&
      plainObject(baseline.configuration.settings) &&
      plainObject(baseline.configuration.script) &&
      SHA256_PATTERN.test(baseline.configuration.scriptReferenceSha256) &&
      plainObject(baseline.subdomain) &&
      Array.isArray(baseline.domains) &&
      Array.isArray(baseline.secretNames) &&
      baseline.secretNames.every(
        (name) => typeof name === "string" && /^[A-Z][A-Z0-9_]*$/.test(name),
      ) &&
      Array.isArray(baseline.crons) &&
      JSON.stringify(baseline.crons) ===
        JSON.stringify([...CLOUDFLARE_STATE_CONSTANTS.openCrons].sort()),
    "El baseline no contiene la configuración y los crons esperados.",
  );
  assertWindow({ ...baseline, nowUtc });
  return freeze({
    baselineSha256: expectedBaselineSha256,
    versionId: baseline.versionId,
    deploymentId: baseline.deploymentId,
    executionAllowed: false,
  });
}

/**
 * Recheck the source BEFORE promotion against a fixed baseline hash. Equality never grants
 * release authority, proves a human review or certifies Worker byte contents.
 * No network, credentials, environment variables or subprocesses are read.
 * This expiry applies only to the forward preparation, not emergency recovery.
 * Recovery must validate its own fixed reference/version contract and must not
 * call this function with an expired promotion baseline to authorize rollback.
 */
export function assertOpenReleaseBaselineMatches(options) {
  const input = jsonData(options);
  exactKeys(
    input,
    [
      "baseline",
      "expectedBaselineSha256",
      "snapshot",
      "observedAtUtc",
      "nowUtc",
    ],
    "La revalidación del baseline",
  );
  const { baseline } = input;
  assertOpenReleaseBaselineRecord({
    baseline,
    expectedBaselineSha256: input.expectedBaselineSha256,
    nowUtc: input.nowUtc,
  });
  invariant(
    instant(input.observedAtUtc) >= instant(baseline.observedAtUtc) &&
      instant(input.observedAtUtc) <= instant(input.nowUtc),
    "La observación no pertenece a la ventana del baseline.",
  );
  const observed = baselineFromSnapshot(input.snapshot, baseline);
  invariant(
    hash(observed) === input.expectedBaselineSha256,
    "El origen observado cambió o no coincide con el baseline fijado.",
  );
  return freeze({
    baselineSha256: input.expectedBaselineSha256,
    deploymentId: observed.deploymentId,
    versionId: observed.versionId,
    observedAtUtc: input.observedAtUtc,
    status: "BASELINE_MATCHED",
    executionAllowed: false,
  });
}
