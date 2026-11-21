import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CLOUDFLARE_CLOSED_STATE_CONSTANTS,
  CloudflareStateFactualMismatchError,
  loadWranglerOAuthToken,
  runCloudflareClosedStateCheck,
} from "./cloudflare-closed-state.mjs";
import { assertClosedProductionSmokeReceipt } from "./cloudflare-closed-smoke-policy.mjs";
import {
  exceptionalReleaseArtifactHash,
  validateExceptionalReleaseArtifact,
} from "./exceptional-release-artifact.mjs";
import {
  EVIDENCE_STATUS,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const D72_CLOSED_NO_WRITE_PREPROOF_SCHEMA_VERSION =
  "agorbis-d72-closed-no-write-preproof/v1";
export const D72_CLOSED_NO_WRITE_PROOF_SCHEMA_VERSION =
  "agorbis-d72-closed-no-write-proof/v2";
export const D72_CLOSED_NO_WRITE_PROOF_REASON = Object.freeze({
  PASS: "EXACT_ACTIVE_CLOSED_VERSION_AND_GUARD_PROVED",
  ACTIVE_STATE_MISMATCH: "ACTIVE_CLOSED_STATE_MISMATCH",
  MODULE_MISMATCH: "ACTIVE_VERSION_MODULE_MISMATCH",
  CONFIGURATION_MISMATCH: "ACTIVE_VERSION_CONFIGURATION_MISMATCH",
  GUARD_MISMATCH: "EXACT_ACTIVE_CLOSED_GUARD_MISMATCH",
  HTTP_NOT_VERIFIED: "CLOUDFLARE_VERSION_HTTP_NOT_VERIFIED",
  SCHEMA_NOT_VERIFIED: "CLOUDFLARE_VERSION_SCHEMA_NOT_VERIFIED",
  GUARD_NOT_VERIFIED: "EXACT_ACTIVE_CLOSED_GUARD_NOT_VERIFIED",
});

const PREPROOF_AUTHORITIES = new WeakMap();
const RECEIPT_AUTHORITIES = new WeakMap();
const PASS = EVIDENCE_STATUS.PASS;
const NOT_VERIFIED = EVIDENCE_STATUS.NOT_VERIFIED;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const VITEST_ENTRYPOINT = path.join(
  REPOSITORY_ROOT,
  "node_modules",
  "vitest",
  "vitest.mjs",
);
const WORKER_RUNTIME_SOURCE = path.join(
  REPOSITORY_ROOT,
  "src/lib/cloudflare-worker-runtime.ts",
);
const WORKER_RUNTIME_TEST = path.join(
  REPOSITORY_ROOT,
  "src/lib/cloudflare-worker-runtime.spec.ts",
);
const MAX_VERSION_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_MODULE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_MODULE_BYTES = 64 * 1024 * 1024;
const MAX_CHILD_OUTPUT_BYTES = 2 * 1024 * 1024;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MODULE_NAME_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@+-]{1,512}$/;
const EXPECTED_SECRETS = Object.freeze([
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
]);
const EXPECTED_PLAINTEXT = Object.freeze({
  AGORBIS_LAUNCH_MODE: "closed",
  AGORBIS_RUNTIME: "cloudflare-workers",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
  PUBLIC_GOOGLE_AUTH_ENABLED: "false",
  PUBLIC_SITE_URL: "https://agorbis.com",
  PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
  PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
  TURNSTILE_HOSTNAMES: "agorbis.com",
});
const FAIL_REASONS = new Set([
  D72_CLOSED_NO_WRITE_PROOF_REASON.ACTIVE_STATE_MISMATCH,
  D72_CLOSED_NO_WRITE_PROOF_REASON.MODULE_MISMATCH,
  D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
  D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_MISMATCH,
]);
const NOT_VERIFIED_REASONS = new Set([
  D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
  D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
  D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
]);
const PREPROOF_KEYS = Object.freeze([
  "activeDeploymentId",
  "activeVersionId",
  "artifactHash",
  "assetsRunWorkerFirst",
  "candidateIdentityHash",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "guard",
  "guardContractSha256",
  "head",
  "mainModuleSha256",
  "moduleCount",
  "moduleInventorySha256",
  "observedAtUtc",
  "policyHash",
  "reasonCode",
  "requestHash",
  "schemaVersion",
  "stableScriptEtag",
  "status",
]);
const GUARD_KEYS = Object.freeze([
  "assetsFetchCount",
  "bodyReadCount",
  "outboundFetchCount",
  "secretReadCount",
  "statusCode",
  "waitUntilCount",
]);
const RECEIPT_KEYS = Object.freeze([
  "artifactHash",
  "assetsRunWorkerFirst",
  "candidateIdentityHash",
  "closedDeploymentId",
  "closedVersionId",
  "completedAtUtc",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "guard",
  "guardContractSha256",
  "head",
  "mainModuleSha256",
  "moduleCount",
  "moduleInventorySha256",
  "observedPostAtUtc",
  "observedPreAtUtc",
  "policyHash",
  "reasonCode",
  "requestHash",
  "schemaVersion",
  "stableScriptEtag",
  "status",
]);

class NotVerifiedError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

class FactualMismatchError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
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

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function exactKeys(value, expected, label) {
  if (!sameKeys(value, expected)) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      `${label} contiene campos faltantes o desconocidos.`,
    );
  }
}

function allowedKeys(value, required, optional, label) {
  if (!isPlainObject(value)) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      `${label} no es un objeto.`,
    );
  }
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      `${label} contiene campos faltantes o desconocidos.`,
    );
  }
}

function factual(condition, reasonCode, message) {
  if (!condition) throw new FactualMismatchError(reasonCode, message);
}

function statusFromError(error) {
  if (error instanceof FactualMismatchError) {
    return { status: EVIDENCE_STATUS.FAIL, reasonCode: error.reasonCode };
  }
  if (error instanceof CloudflareStateFactualMismatchError) {
    return {
      status: EVIDENCE_STATUS.FAIL,
      reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.ACTIVE_STATE_MISMATCH,
    };
  }
  if (error instanceof NotVerifiedError) {
    return { status: NOT_VERIFIED, reasonCode: error.reasonCode };
  }
  return {
    status: NOT_VERIFIED,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
  };
}

function validateFrozenArtifact({
  candidateIdentity,
  artifactManifest,
  artifactRoot,
  worktreeRoot,
}) {
  assertCandidate(candidateIdentity);
  if (
    candidateIdentity.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    candidateIdentity.policyHash !== RELEASE_GATE_POLICY_SHA256 ||
    candidateIdentity.originMain !== candidateIdentity.head ||
    candidateIdentity.leftCount !== 0 ||
    candidateIdentity.rightCount !== 0 ||
    candidateIdentity.worktreeClean !== true ||
    candidateIdentity.diffCheckClean !== true ||
    candidateIdentity.deploymentAuthorized !== false ||
    candidateIdentity.deploymentExecuted !== false ||
    exceptionalReleaseArtifactHash(artifactManifest) !==
      candidateIdentity.artifactHash
  ) {
    throw new Error("Candidate identity/artifact no conservan bindings D72.");
  }
  const errors = validateExceptionalReleaseArtifact({
    artifactRoot,
    worktreeRoot,
    manifest: artifactManifest,
    expectedHead: candidateIdentity.head,
    expectedPolicyVersion: candidateIdentity.policyVersion,
    expectedPolicyHash: candidateIdentity.policyHash,
    expectedRequestHash: candidateIdentity.requestHash,
    expectedArtifactHash: candidateIdentity.artifactHash,
  });
  if (errors.length > 0) {
    throw new Error(
      `Artifact D72 dejó de estar congelado: ${errors.join(" | ")}`,
    );
  }
}

function validStatusReason(status, reasonCode) {
  return (
    (status === PASS && reasonCode === D72_CLOSED_NO_WRITE_PROOF_REASON.PASS) ||
    (status === EVIDENCE_STATUS.FAIL && FAIL_REASONS.has(reasonCode)) ||
    (status === NOT_VERIFIED && NOT_VERIFIED_REASONS.has(reasonCode))
  );
}

function freezeReceipt(payload) {
  return Object.freeze({
    ...payload,
    contentSha256: sha256(canonicalJson(payload)),
  });
}

function assertCandidate(candidateIdentity) {
  if (
    !candidateIdentity ||
    typeof candidateIdentity !== "object" ||
    !/^[0-9a-f]{40}$/.test(candidateIdentity.head ?? "") ||
    !/^[0-9a-f]{64}$/.test(candidateIdentity.requestHash ?? "") ||
    !/^[0-9a-f]{64}$/.test(candidateIdentity.policyHash ?? "") ||
    !/^[0-9a-f]{64}$/.test(candidateIdentity.artifactHash ?? "") ||
    !/^[0-9a-f]{64}$/.test(candidateIdentity.contentSha256 ?? "")
  ) {
    throw new Error("Candidate identity D72 inválida para no-write proof.");
  }
}

async function readBoundedBody(response) {
  if (response.body === null) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
      "Version GET devolvió body vacío.",
    );
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new NotVerifiedError(
          D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
          "Version GET devolvió stream inválido.",
        );
      }
      total += value.byteLength;
      if (total > MAX_VERSION_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new NotVerifiedError(
          D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
          "Version GET excedió el límite.",
        );
      }
      chunks.push(Buffer.from(value));
    }
    if (total === 0) {
      throw new NotVerifiedError(
        D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
        "Version GET devolvió body vacío.",
      );
    }
    return Buffer.concat(chunks, total);
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}

async function versionJsonGet(endpoint, oauthToken) {
  let response;
  try {
    response = await globalThis.fetch(
      `${CLOUDFLARE_CLOSED_STATE_CONSTANTS.apiOrigin}${endpoint}`,
      {
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${oauthToken}`,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
      "Version GET no pudo completarse.",
    );
  }
  if (
    !(response instanceof Response) ||
    response.status !== 200 ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
      "Version GET no devolvió JSON HTTP 200.",
    );
  }
  const length = response.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > MAX_VERSION_RESPONSE_BYTES)
  ) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
      "Version GET declaró un tamaño no aprobado.",
    );
  }
  const bytes = await readBoundedBody(response);
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = JSON.parse(source);
    if (!isPlainObject(body)) throw new Error("object");
    return { body, endpoint, method: "GET", status: 200 };
  } catch {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      "Version GET no devolvió JSON UTF-8 válido.",
    );
  } finally {
    bytes.fill(0);
  }
}

function parseEnvelope(get, endpoint, label) {
  exactKeys(get, ["body", "endpoint", "method", "status"], label);
  if (get.endpoint !== endpoint || get.method !== "GET" || get.status !== 200) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
      `${label} no corresponde al GET exacto.`,
    );
  }
  exactKeys(get.body, ["errors", "messages", "result", "success"], label);
  if (
    get.body.success !== true ||
    !Array.isArray(get.body.errors) ||
    get.body.errors.length !== 0 ||
    !Array.isArray(get.body.messages) ||
    get.body.messages.length !== 0
  ) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
      `${label} no fue exitoso y limpio.`,
    );
  }
  return get.body.result;
}

function parseBindings(bindings) {
  factual(
    Array.isArray(bindings) &&
      bindings.length ===
        Object.keys(EXPECTED_PLAINTEXT).length + EXPECTED_SECRETS.length + 1,
    D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
    "La Version CLOSED no conserva el conjunto exacto de bindings.",
  );
  const plaintext = {};
  const secrets = [];
  const names = new Set();
  let assets = 0;
  for (const binding of bindings) {
    if (!isPlainObject(binding) || typeof binding.name !== "string") {
      throw new NotVerifiedError(
        D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
        "Binding remoto no es canónico.",
      );
    }
    factual(
      !names.has(binding.name),
      D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
      "Binding remoto duplicado.",
    );
    names.add(binding.name);
    if (binding.type === "plain_text") {
      exactKeys(binding, ["name", "text", "type"], "binding plaintext");
      if (typeof binding.text !== "string") {
        throw new NotVerifiedError(
          D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
          "Binding plaintext remoto no es texto.",
        );
      }
      plaintext[binding.name] = binding.text;
    } else if (binding.type === "secret_text") {
      exactKeys(binding, ["name", "type"], "binding secret");
      secrets.push(binding.name);
    } else if (binding.type === "assets") {
      exactKeys(binding, ["name", "type"], "binding assets");
      factual(
        binding.name === "ASSETS",
        D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
        "Binding assets remoto no se llama ASSETS.",
      );
      assets += 1;
    } else {
      throw new NotVerifiedError(
        D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
        "Tipo de binding remoto desconocido.",
      );
    }
  }
  secrets.sort();
  factual(
    canonicalJson(plaintext) === canonicalJson(EXPECTED_PLAINTEXT) &&
      canonicalJson(secrets) === canonicalJson([...EXPECTED_SECRETS].sort()) &&
      assets === 1,
    D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
    "Bindings/launch mode CLOSED no coinciden.",
  );
}

function parseStableVersion(get, versionId) {
  const { accountId, workerName } = CLOUDFLARE_CLOSED_STATE_CONSTANTS;
  const endpoint = `/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`;
  const result = parseEnvelope(get, endpoint, "GET Version estable");
  allowedKeys(
    result,
    ["annotations", "id", "metadata", "resources"],
    ["number", "startup_time_ms"],
    "GET Version estable result",
  );
  factual(
    result.id === versionId,
    D72_CLOSED_NO_WRITE_PROOF_REASON.ACTIVE_STATE_MISMATCH,
    "GET Version estable devolvió otra Version.",
  );
  exactKeys(
    result.resources,
    ["bindings", "script", "script_runtime"],
    "GET Version resources",
  );
  parseBindings(result.resources.bindings);
  allowedKeys(
    result.resources.script,
    ["etag", "handlers", "last_deployed_from"],
    ["named_handlers"],
    "GET Version script",
  );
  const script = result.resources.script;
  if (!SHA256_PATTERN.test(script.etag ?? "")) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      "script.etag no usa el schema observado fijado.",
    );
  }
  factual(
    canonicalJson([...(script.handlers ?? [])].sort()) ===
      canonicalJson(["fetch", "scheduled"]) &&
      script.last_deployed_from === "wrangler" &&
      (!Object.hasOwn(script, "named_handlers") ||
        (Array.isArray(script.named_handlers) &&
          script.named_handlers.length === 0)),
    D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
    "Handlers/origen de la Version CLOSED no coinciden.",
  );
  allowedKeys(
    result.resources.script_runtime,
    ["compatibility_date", "compatibility_flags", "limits", "usage_model"],
    ["exports", "migration_tag"],
    "GET Version runtime",
  );
  const runtime = result.resources.script_runtime;
  exactKeys(runtime.limits, ["cpu_ms"], "GET Version limits");
  factual(
    runtime.compatibility_date === "2026-08-25" &&
      canonicalJson([...(runtime.compatibility_flags ?? [])].sort()) ===
        canonicalJson(["nodejs_compat"]) &&
      runtime.limits.cpu_ms === 30_000 &&
      runtime.usage_model === "standard",
    D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
    "Runtime de la Version CLOSED no coincide.",
  );
  return script.etag;
}

function decodeBase64(value, label) {
  if (typeof value !== "string" || value.length > MAX_MODULE_BYTES * 2) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      `${label} no es base64 acotado.`,
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    bytes.fill(0);
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
      `${label} no es base64 canónico.`,
    );
  }
  return bytes;
}

function parseBetaVersion(get, versionId) {
  const { accountId, workerName } = CLOUDFLARE_CLOSED_STATE_CONSTANTS;
  const endpoint = `/accounts/${accountId}/workers/workers/${workerName}/versions/${versionId}?include=modules`;
  const result = parseEnvelope(get, endpoint, "GET Version beta");
  allowedKeys(
    result,
    [
      "annotations",
      "assets",
      "bindings",
      "compatibility_date",
      "compatibility_flags",
      "created_on",
      "id",
      "main_module",
      "modules",
      "number",
      "urls",
    ],
    [
      "cache_options",
      "containers",
      "exports",
      "exports_reconciliation",
      "limits",
      "logpush",
      "migration_tag",
      "migrations",
      "observability",
      "package_dependencies",
      "placement",
      "source",
      "startup_time_ms",
      "tail_consumers",
      "usage_model",
    ],
    "GET Version beta result",
  );
  factual(
    result.id === versionId,
    D72_CLOSED_NO_WRITE_PROOF_REASON.ACTIVE_STATE_MISMATCH,
    "GET Version beta devolvió otra Version.",
  );
  parseBindings(result.bindings);
  factual(
    result.compatibility_date === "2026-08-25" &&
      canonicalJson([...(result.compatibility_flags ?? [])].sort()) ===
        canonicalJson(["nodejs_compat"]) &&
      MODULE_NAME_PATTERN.test(result.main_module ?? "") &&
      Array.isArray(result.modules) &&
      result.modules.length > 0 &&
      result.modules.length <= 2_048,
    D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
    "GET beta no conserva config/main/módulos exactos.",
  );
  exactKeys(result.assets, ["config", "jwt"], "GET beta assets");
  factual(
    canonicalJson(result.assets.config) ===
      canonicalJson({ run_worker_first: true }) &&
      typeof result.assets.jwt === "string" &&
      result.assets.jwt.length >= 16 &&
      result.assets.jwt.length <= 16 * 1024 &&
      result.assets.jwt.split(".").length === 3,
    D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
    "assets.run_worker_first/JWT remoto no es canónico.",
  );
  const names = new Set();
  const modules = [];
  let total = 0;
  try {
    for (const remote of result.modules) {
      exactKeys(
        remote,
        ["content_base64", "content_type", "name"],
        "GET beta module",
      );
      if (
        !MODULE_NAME_PATTERN.test(remote.name ?? "") ||
        names.has(remote.name) ||
        ![
          "application/javascript+module",
          "application/wasm",
          "application/octet-stream",
          "text/plain",
        ].includes(remote.content_type)
      ) {
        throw new NotVerifiedError(
          D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
          "GET beta contiene módulo desconocido/duplicado.",
        );
      }
      names.add(remote.name);
      const content = decodeBase64(
        remote.content_base64,
        `módulo ${remote.name}`,
      );
      total += content.length;
      if (total > MAX_TOTAL_MODULE_BYTES) {
        content.fill(0);
        throw new NotVerifiedError(
          D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
          "GET beta excede el total de módulos permitido.",
        );
      }
      modules.push({
        content,
        contentType: remote.content_type,
        name: remote.name,
        sha256: sha256(content),
        size: content.length,
      });
    }
    modules.sort((left, right) => left.name.localeCompare(right.name, "en"));
    const main = modules.find((module) => module.name === result.main_module);
    factual(
      main?.contentType === "application/javascript+module",
      D72_CLOSED_NO_WRITE_PROOF_REASON.MODULE_MISMATCH,
      "GET beta no contiene el main ESM exacto.",
    );
    const inventory = modules.map(
      ({ contentType, name, sha256: digest, size }) => ({
        contentType,
        name,
        sha256: digest,
        size,
      }),
    );
    return {
      assetsRunWorkerFirst: true,
      mainModule: result.main_module,
      mainModuleSha256: main.sha256,
      moduleInventorySha256: sha256(canonicalJson(inventory)),
      moduleCount: modules.length,
      modules,
    };
  } catch (error) {
    for (const module of modules) module.content.fill(0);
    throw error;
  }
}

function wipeVersion(version) {
  for (const module of version?.modules ?? []) module.content.fill(0);
}

async function readActiveVersion(oauthToken, versionId) {
  const { accountId, workerName } = CLOUDFLARE_CLOSED_STATE_CONSTANTS;
  const [stable, beta] = await Promise.all([
    versionJsonGet(
      `/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`,
      oauthToken,
    ),
    versionJsonGet(
      `/accounts/${accountId}/workers/workers/${workerName}/versions/${versionId}?include=modules`,
      oauthToken,
    ),
  ]);
  const stableScriptEtag = parseStableVersion(stable, versionId);
  return { ...parseBetaVersion(beta, versionId), stableScriptEtag };
}

function assertSameVersionFacts(preproof, version) {
  factual(
    version.stableScriptEtag === preproof.stableScriptEtag &&
      version.mainModuleSha256 === preproof.mainModuleSha256 &&
      version.moduleInventorySha256 === preproof.moduleInventorySha256 &&
      version.moduleCount === preproof.moduleCount &&
      version.assetsRunWorkerFirst === true,
    D72_CLOSED_NO_WRITE_PROOF_REASON.MODULE_MISMATCH,
    "ETag/inventario/config CLOSED cambiaron entre preproof y post-seal.",
  );
}

function guardContractHash() {
  const source = readFileSync(WORKER_RUNTIME_SOURCE);
  const test = readFileSync(WORKER_RUNTIME_TEST);
  try {
    return sha256(
      Buffer.concat([
        Buffer.from("cloudflare-worker-runtime.ts\0"),
        source,
        Buffer.from("\0cloudflare-worker-runtime.spec.ts\0"),
        test,
      ]),
    );
  } finally {
    source.fill(0);
    test.fill(0);
  }
}

function runSourceGuardContract() {
  if (process.versions.node !== "22.22.0") {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
      "El guard exige Node 22.22.0.",
    );
  }
  const child = spawnSync(
    process.execPath,
    [VITEST_ENTRYPOINT, "run", "src/lib/cloudflare-worker-runtime.spec.ts"],
    {
      cwd: REPOSITORY_ROOT,
      encoding: null,
      env: {
        HOME: process.env.HOME ?? "",
        PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
        CI: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      maxBuffer: MAX_CHILD_OUTPUT_BYTES,
      shell: false,
      timeout: 120_000,
      windowsHide: true,
    },
  );
  child.stdout?.fill?.(0);
  child.stderr?.fill?.(0);
  if (child.error || child.signal !== null || child.status !== 0) {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
      "El test executable del guard CLOSED no pasó.",
    );
  }
}

function miniflareType(contentType) {
  return {
    "application/javascript+module": "esm",
    "application/wasm": "wasm",
    "application/octet-stream": "data",
    "text/plain": "text",
  }[contentType];
}

async function runExactRemoteGuard(version) {
  const requireFromWrangler = createRequire(
    realpathSync(
      path.join(REPOSITORY_ROOT, "node_modules/wrangler/package.json"),
    ),
  );
  let Miniflare;
  try {
    ({ Miniflare } = await import(
      pathToFileURL(requireFromWrangler.resolve("miniflare")).href
    ));
  } catch {
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
      "Miniflare fijado por Wrangler no está disponible.",
    );
  }
  const wrapperName = "d72-closed-proof-wrapper.mjs";
  const specifier = version.mainModule.startsWith("./")
    ? version.mainModule
    : `./${version.mainModule}`;
  const wrapper = `
import worker from ${JSON.stringify(specifier)};
const bodyMembers = new Set(["body", "bodyUsed", "arrayBuffer", "blob", "bytes", "clone", "formData", "json", "text"]);
const secretNames = new Set(["CRON_SECRET", "SUPABASE_SECRET_KEY", "TURNSTILE_SECRET"]);
export default { async fetch(request, env, ctx) {
  const counts = { bodyReadCount: 0, secretReadCount: 0, waitUntilCount: 0 };
  const requestProxy = new Proxy(request, { get(target, property) {
    if (bodyMembers.has(property)) counts.bodyReadCount += 1;
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  }});
  const envProxy = new Proxy(env, { get(target, property, receiver) {
    if (secretNames.has(property)) counts.secretReadCount += 1;
    return Reflect.get(target, property, receiver);
  }});
  const ctxProxy = new Proxy(ctx, { get(target, property, receiver) {
    if (property === "waitUntil") return (promise) => { counts.waitUntilCount += 1; return target.waitUntil(promise); };
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  }});
  const response = await worker.fetch(requestProxy, envProxy, ctxProxy);
  const headers = new Headers(response.headers);
  headers.set("X-D72-Closed-Proof", JSON.stringify(counts));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}};
`;
  let assetsFetchCount = 0;
  let outboundFetchCount = 0;
  let mf;
  try {
    const modules = Object.fromEntries(
      version.modules.map((module) => [
        module.name,
        { type: miniflareType(module.contentType), contents: module.content },
      ]),
    );
    factual(
      !Object.hasOwn(modules, wrapperName),
      D72_CLOSED_NO_WRITE_PROOF_REASON.MODULE_MISMATCH,
      "La Version remota colisiona con el wrapper de prueba reservado.",
    );
    modules[wrapperName] = { type: "esm", contents: wrapper };
    mf = new Miniflare({
      logRequests: false,
      workers: [
        {
          config: {
            name: "agorbis-d72-active-closed-proof",
            compatibilityDate: "2026-08-25",
            compatibilityFlags: ["nodejs_compat"],
            manifest: { mainModule: wrapperName, modules },
            env: {
              ...Object.fromEntries(
                Object.entries(EXPECTED_PLAINTEXT).map(([name, value]) => [
                  name,
                  { type: "text", value },
                ]),
              ),
              ...Object.fromEntries(
                EXPECTED_SECRETS.map((name) => [
                  name,
                  { type: "text", value: "x".repeat(32) },
                ]),
              ),
              ASSETS: {
                type: "fetcher",
                handler: async () => {
                  assetsFetchCount += 1;
                  return new Response("unexpected", { status: 599 });
                },
              },
            },
          },
          dev: {
            outboundService: {
              type: "fetcher",
              handler: async () => {
                outboundFetchCount += 1;
                return new Response("unexpected", { status: 599 });
              },
            },
          },
        },
      ],
    });
    const response = await mf.dispatchFetch(
      "https://agorbis.com/registro/?d72-proof=1",
      { method: "POST", body: "fixture=must-not-be-read" },
    );
    let inside;
    try {
      inside = JSON.parse(response.headers.get("x-d72-closed-proof") ?? "");
    } catch {
      throw new NotVerifiedError(
        D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
        "El wrapper no devolvió contadores canónicos.",
      );
    }
    exactKeys(
      inside,
      ["bodyReadCount", "secretReadCount", "waitUntilCount"],
      "contadores guard",
    );
    const body = await response.text();
    const guard = Object.freeze({
      assetsFetchCount,
      bodyReadCount: inside.bodyReadCount,
      outboundFetchCount,
      secretReadCount: inside.secretReadCount,
      statusCode: response.status,
      waitUntilCount: inside.waitUntilCount,
    });
    factual(
      response.status === 503 &&
        body === "Agorbis todavía no está abierto." &&
        response.headers.get("cache-control") === "no-store" &&
        response.headers.get("set-cookie") === null &&
        Object.entries(guard).every(
          ([name, value]) => name === "statusCode" || value === 0,
        ),
      D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_MISMATCH,
      "Los módulos remotos exactos no cortaron antes de side effects.",
    );
    return guard;
  } catch (error) {
    if (
      error instanceof FactualMismatchError ||
      error instanceof NotVerifiedError
    ) {
      throw error;
    }
    throw new NotVerifiedError(
      D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_NOT_VERIFIED,
      "No se pudieron ejecutar los módulos remotos exactos.",
    );
  } finally {
    await mf?.dispose?.().catch(() => {});
  }
}

function preproofPayload(candidateIdentity, status, reasonCode, facts = {}) {
  return {
    schemaVersion: D72_CLOSED_NO_WRITE_PREPROOF_SCHEMA_VERSION,
    status,
    reasonCode,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    policyHash: candidateIdentity.policyHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: candidateIdentity.contentSha256,
    activeDeploymentId: facts.activeDeploymentId ?? null,
    activeVersionId: facts.activeVersionId ?? null,
    observedAtUtc: facts.observedAtUtc ?? new Date().toISOString(),
    stableScriptEtag: facts.stableScriptEtag ?? null,
    mainModuleSha256: facts.mainModuleSha256 ?? null,
    moduleInventorySha256: facts.moduleInventorySha256 ?? null,
    moduleCount: facts.moduleCount ?? null,
    assetsRunWorkerFirst: facts.assetsRunWorkerFirst ?? null,
    guardContractSha256: facts.guardContractSha256 ?? null,
    guard: facts.guard ?? null,
    deploymentAuthorized: false,
    deploymentExecuted: false,
  };
}

export function assertD72ClosedNoWritePreproof(
  preproof,
  {
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    allowTestReceipt = false,
    now = new Date(),
  } = {},
) {
  const authority = PREPROOF_AUTHORITIES.get(preproof);
  const { contentSha256: _contentSha256, ...payload } = preproof ?? {};
  if (
    !authority ||
    authority.candidateIdentity !== candidateIdentity ||
    (!authority.testOnly &&
      (authority.artifactManifest !== artifactManifest ||
        authority.artifactRoot !== artifactRoot ||
        authority.worktreeRoot !== worktreeRoot)) ||
    (authority.testOnly && !allowTestReceipt) ||
    !sameKeys(preproof, PREPROOF_KEYS) ||
    preproof.schemaVersion !== D72_CLOSED_NO_WRITE_PREPROOF_SCHEMA_VERSION ||
    !validStatusReason(preproof.status, preproof.reasonCode) ||
    preproof.head !== candidateIdentity?.head ||
    preproof.requestHash !== candidateIdentity?.requestHash ||
    preproof.policyHash !== candidateIdentity?.policyHash ||
    preproof.artifactHash !== candidateIdentity?.artifactHash ||
    preproof.candidateIdentityHash !== candidateIdentity?.contentSha256 ||
    preproof.deploymentAuthorized !== false ||
    preproof.deploymentExecuted !== false ||
    !SHA256_PATTERN.test(preproof.contentSha256 ?? "") ||
    preproof.contentSha256 !== sha256(canonicalJson(payload)) ||
    !Object.isFrozen(preproof)
  ) {
    throw new Error("El preproof CLOSED debe ser opaco y ligado al candidato.");
  }
  const observed = new Date(preproof.observedAtUtc);
  const created = new Date(candidateIdentity.createdAtUtc);
  const expires = new Date(candidateIdentity.expiresAtUtc);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (
    ![observed, created, expires, current].every((date) =>
      Number.isFinite(date.getTime()),
    ) ||
    observed < created ||
    observed >= expires ||
    current < observed ||
    current.getTime() - observed.getTime() > 15 * 60 * 1_000
  ) {
    throw new Error("El preproof CLOSED está fuera de su ventana D72.");
  }
  if (preproof.status === PASS) {
    if (
      !VERSION_ID_PATTERN.test(preproof.activeDeploymentId ?? "") ||
      !VERSION_ID_PATTERN.test(preproof.activeVersionId ?? "") ||
      !SHA256_PATTERN.test(preproof.stableScriptEtag ?? "") ||
      !SHA256_PATTERN.test(preproof.mainModuleSha256 ?? "") ||
      !SHA256_PATTERN.test(preproof.moduleInventorySha256 ?? "") ||
      !SHA256_PATTERN.test(preproof.guardContractSha256 ?? "") ||
      !Number.isSafeInteger(preproof.moduleCount) ||
      preproof.moduleCount < 1 ||
      preproof.assetsRunWorkerFirst !== true ||
      !sameKeys(preproof.guard, GUARD_KEYS) ||
      !Object.isFrozen(preproof.guard) ||
      preproof.guard.statusCode !== 503 ||
      GUARD_KEYS.some(
        (key) =>
          !Number.isSafeInteger(preproof.guard[key]) || preproof.guard[key] < 0,
      ) ||
      [
        preproof.guard.assetsFetchCount,
        preproof.guard.bodyReadCount,
        preproof.guard.outboundFetchCount,
        preproof.guard.secretReadCount,
        preproof.guard.waitUntilCount,
      ].some((count) => count !== 0)
    ) {
      throw new Error("El preproof PASS no acredita módulos/guard exactos.");
    }
  }
  if (!authority.testOnly) {
    validateFrozenArtifact({
      candidateIdentity,
      artifactManifest,
      artifactRoot,
      worktreeRoot,
    });
  }
  return preproof;
}

export async function prepareD72ClosedNoWriteProof({
  candidateIdentity,
  artifactManifest,
  artifactRoot,
  worktreeRoot,
} = {}) {
  validateFrozenArtifact({
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
  });
  const facts = {
    activeDeploymentId: null,
    activeVersionId: null,
    observedAtUtc: new Date().toISOString(),
  };
  let oauthToken;
  let version;
  let outcome = {
    status: PASS,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
  };
  try {
    oauthToken = await loadWranglerOAuthToken();
    const state = await runCloudflareClosedStateCheck({
      phase: "custom-domains",
      secretStage: "complete",
      oauthToken,
    });
    facts.activeDeploymentId = state.activeDeploymentId;
    facts.activeVersionId = state.activeVersionId;
    version = await readActiveVersion(oauthToken, state.activeVersionId);
    Object.assign(facts, {
      assetsRunWorkerFirst: version.assetsRunWorkerFirst,
      stableScriptEtag: version.stableScriptEtag,
      mainModuleSha256: version.mainModuleSha256,
      moduleInventorySha256: version.moduleInventorySha256,
      moduleCount: version.moduleCount,
    });
    runSourceGuardContract();
    facts.guardContractSha256 = guardContractHash();
    facts.guard = await runExactRemoteGuard(version);
    facts.observedAtUtc = new Date().toISOString();
    validateFrozenArtifact({
      candidateIdentity,
      artifactManifest,
      artifactRoot,
      worktreeRoot,
    });
  } catch (error) {
    outcome = statusFromError(error);
  } finally {
    wipeVersion(version);
    oauthToken = undefined;
  }
  const preproof = freezeReceipt(
    preproofPayload(
      candidateIdentity,
      outcome.status,
      outcome.reasonCode,
      facts,
    ),
  );
  PREPROOF_AUTHORITIES.set(preproof, {
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    testOnly: false,
  });
  return assertD72ClosedNoWritePreproof(preproof, {
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
  });
}

function issueFinalReceipt({
  preproof,
  candidateIdentity,
  artifactManifest,
  artifactRoot,
  worktreeRoot,
  closedProductionSmokeReceipt,
  status,
  reasonCode,
  observedPostAtUtc,
  testOnly,
}) {
  const payload = {
    schemaVersion: D72_CLOSED_NO_WRITE_PROOF_SCHEMA_VERSION,
    status,
    reasonCode,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    policyHash: candidateIdentity.policyHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: candidateIdentity.contentSha256,
    closedDeploymentId: preproof.activeDeploymentId,
    closedVersionId: preproof.activeVersionId,
    observedPreAtUtc: preproof.observedAtUtc,
    observedPostAtUtc,
    completedAtUtc: observedPostAtUtc,
    stableScriptEtag: preproof.stableScriptEtag,
    mainModuleSha256: preproof.mainModuleSha256,
    moduleInventorySha256: preproof.moduleInventorySha256,
    moduleCount: preproof.moduleCount,
    assetsRunWorkerFirst: preproof.assetsRunWorkerFirst,
    guardContractSha256: preproof.guardContractSha256,
    guard: preproof.guard,
    deploymentAuthorized: false,
    deploymentExecuted: false,
  };
  const receipt = freezeReceipt(payload);
  RECEIPT_AUTHORITIES.set(receipt, {
    preproof,
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    closedProductionSmokeReceipt,
    testOnly,
  });
  return receipt;
}

export function assertD72ClosedNoWriteProofReceipt(
  receipt,
  {
    preproof,
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    closedProductionSmokeReceipt,
    allowTestReceipt = false,
    now = new Date(),
  } = {},
) {
  const authority = RECEIPT_AUTHORITIES.get(receipt);
  const { contentSha256: _contentSha256, ...payload } = receipt ?? {};
  if (
    !authority ||
    authority.preproof !== preproof ||
    authority.candidateIdentity !== candidateIdentity ||
    (!authority.testOnly &&
      (authority.artifactManifest !== artifactManifest ||
        authority.artifactRoot !== artifactRoot ||
        authority.worktreeRoot !== worktreeRoot)) ||
    authority.closedProductionSmokeReceipt !== closedProductionSmokeReceipt ||
    (authority.testOnly && !allowTestReceipt) ||
    !sameKeys(receipt, RECEIPT_KEYS) ||
    receipt.schemaVersion !== D72_CLOSED_NO_WRITE_PROOF_SCHEMA_VERSION ||
    !validStatusReason(receipt.status, receipt.reasonCode) ||
    receipt.head !== candidateIdentity?.head ||
    receipt.requestHash !== candidateIdentity?.requestHash ||
    receipt.policyHash !== candidateIdentity?.policyHash ||
    receipt.artifactHash !== candidateIdentity?.artifactHash ||
    receipt.candidateIdentityHash !== candidateIdentity?.contentSha256 ||
    receipt.closedDeploymentId !== preproof?.activeDeploymentId ||
    receipt.closedVersionId !== preproof?.activeVersionId ||
    receipt.deploymentAuthorized !== false ||
    receipt.deploymentExecuted !== false ||
    !SHA256_PATTERN.test(receipt.contentSha256 ?? "") ||
    receipt.contentSha256 !== sha256(canonicalJson(payload)) ||
    !Object.isFrozen(receipt)
  ) {
    throw new Error("El receipt CLOSED no-write debe ser opaco y emparejado.");
  }
  assertD72ClosedNoWritePreproof(preproof, {
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    allowTestReceipt,
    now,
  });
  assertClosedProductionSmokeReceipt(closedProductionSmokeReceipt, {
    allowTestReceipt,
  });
  const pre = new Date(receipt.observedPreAtUtc);
  const smokeStart = new Date(closedProductionSmokeReceipt.startedAtUtc);
  const smokeEnd = new Date(closedProductionSmokeReceipt.completedAtUtc);
  const post = new Date(receipt.observedPostAtUtc);
  const completed = new Date(receipt.completedAtUtc);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (
    ![pre, smokeStart, smokeEnd, post, completed, current].every((date) =>
      Number.isFinite(date.getTime()),
    ) ||
    pre > smokeStart ||
    smokeEnd > post ||
    post.getTime() !== completed.getTime() ||
    current < post ||
    current.getTime() - pre.getTime() > 15 * 60 * 1_000 ||
    receipt.closedDeploymentId !==
      closedProductionSmokeReceipt.activeDeploymentId ||
    receipt.closedVersionId !== closedProductionSmokeReceipt.activeVersionId
  ) {
    throw new Error("El receipt no sella preproof -> smoke -> post exactos.");
  }
  if (receipt.status === PASS) {
    if (
      preproof.status !== PASS ||
      receipt.stableScriptEtag !== preproof.stableScriptEtag ||
      receipt.mainModuleSha256 !== preproof.mainModuleSha256 ||
      receipt.moduleInventorySha256 !== preproof.moduleInventorySha256 ||
      receipt.moduleCount !== preproof.moduleCount ||
      receipt.assetsRunWorkerFirst !== true ||
      receipt.guardContractSha256 !== preproof.guardContractSha256 ||
      receipt.guard !== preproof.guard
    ) {
      throw new Error("El receipt PASS no conserva el preproof exacto.");
    }
  }
  if (!authority.testOnly) {
    validateFrozenArtifact({
      candidateIdentity,
      artifactManifest,
      artifactRoot,
      worktreeRoot,
    });
  }
  return receipt;
}

export async function completeD72ClosedNoWriteProof({
  preproof,
  candidateIdentity,
  artifactManifest,
  artifactRoot,
  worktreeRoot,
  closedProductionSmokeReceipt,
} = {}) {
  assertD72ClosedNoWritePreproof(preproof, {
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
  });
  if (preproof.status !== PASS) {
    throw new Error(
      "Un preproof bloqueado no autoriza ejecutar/completar smoke.",
    );
  }
  assertClosedProductionSmokeReceipt(closedProductionSmokeReceipt);
  if (
    closedProductionSmokeReceipt.activeDeploymentId !==
      preproof.activeDeploymentId ||
    closedProductionSmokeReceipt.activeVersionId !== preproof.activeVersionId ||
    new Date(closedProductionSmokeReceipt.startedAtUtc) <
      new Date(preproof.observedAtUtc)
  ) {
    throw new Error("El smoke no corresponde al preproof CLOSED exacto.");
  }
  let oauthToken;
  let version;
  let outcome = {
    status: PASS,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
  };
  try {
    oauthToken = await loadWranglerOAuthToken();
    const state = await runCloudflareClosedStateCheck({
      phase: "custom-domains",
      secretStage: "complete",
      oauthToken,
    });
    factual(
      state.activeDeploymentId === preproof.activeDeploymentId &&
        state.activeVersionId === preproof.activeVersionId,
      D72_CLOSED_NO_WRITE_PROOF_REASON.ACTIVE_STATE_MISMATCH,
      "Deployment/Version CLOSED cambiaron después del POST.",
    );
    version = await readActiveVersion(oauthToken, state.activeVersionId);
    assertSameVersionFacts(preproof, version);
  } catch (error) {
    outcome = statusFromError(error);
  } finally {
    wipeVersion(version);
    oauthToken = undefined;
  }
  const receipt = issueFinalReceipt({
    preproof,
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    closedProductionSmokeReceipt,
    ...outcome,
    observedPostAtUtc: new Date().toISOString(),
    testOnly: false,
  });
  return assertD72ClosedNoWriteProofReceipt(receipt, {
    preproof,
    candidateIdentity,
    artifactManifest,
    artifactRoot,
    worktreeRoot,
    closedProductionSmokeReceipt,
  });
}

export function issueD72ClosedNoWritePreproofTestReceipt({
  testOnly,
  candidateIdentity,
  status,
  reasonCode,
  facts,
} = {}) {
  if (testOnly !== true || !validStatusReason(status, reasonCode)) {
    throw new Error("Fixture preproof testOnly inválido.");
  }
  assertCandidate(candidateIdentity);
  const preproof = freezeReceipt(
    preproofPayload(candidateIdentity, status, reasonCode, facts),
  );
  PREPROOF_AUTHORITIES.set(preproof, { candidateIdentity, testOnly: true });
  return preproof;
}

export function issueD72ClosedNoWriteProofTestReceipt({
  testOnly,
  preproof,
  candidateIdentity,
  closedProductionSmokeReceipt,
  status,
  reasonCode,
  observedPostAtUtc,
} = {}) {
  if (
    testOnly !== true ||
    !validStatusReason(status, reasonCode) ||
    !PREPROOF_AUTHORITIES.has(preproof) ||
    preproof.status !== PASS
  ) {
    throw new Error("Fixture receipt no-write testOnly inválido.");
  }
  return issueFinalReceipt({
    preproof,
    candidateIdentity,
    closedProductionSmokeReceipt,
    status,
    reasonCode,
    observedPostAtUtc,
    testOnly: true,
  });
}

export async function inspectD72ClosedVersionTestHarness({
  testOnly,
  versionId,
  stableGet,
  betaGet,
  executeGuard = false,
} = {}) {
  if (
    testOnly !== true ||
    !VERSION_ID_PATTERN.test(versionId ?? "") ||
    typeof executeGuard !== "boolean"
  ) {
    throw new Error("Harness de Version CLOSED testOnly inválido.");
  }
  let version;
  try {
    const stableScriptEtag = parseStableVersion(stableGet, versionId);
    version = parseBetaVersion(betaGet, versionId);
    version.stableScriptEtag = stableScriptEtag;
    const guard = executeGuard ? await runExactRemoteGuard(version) : null;
    return Object.freeze({
      status: PASS,
      reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
      stableScriptEtag,
      mainModuleSha256: version.mainModuleSha256,
      moduleInventorySha256: version.moduleInventorySha256,
      moduleCount: version.moduleCount,
      guard,
    });
  } catch (error) {
    return Object.freeze({ ...statusFromError(error) });
  } finally {
    wipeVersion(version);
  }
}

export function compareD72ClosedVersionFactsTestHarness({
  testOnly,
  preproof,
  version,
} = {}) {
  if (
    testOnly !== true ||
    !isPlainObject(preproof) ||
    !isPlainObject(version)
  ) {
    throw new Error("Harness de comparación CLOSED testOnly inválido.");
  }
  try {
    assertSameVersionFacts(preproof, version);
    return Object.freeze({
      status: PASS,
      reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
    });
  } catch (error) {
    return Object.freeze({ ...statusFromError(error) });
  }
}

// Compatibilidad transitoria deliberadamente fail-closed: el runner debe usar
// prepare -> smoke sólo si PASS -> complete.
export async function collectD72ClosedNoWriteProof() {
  throw new Error(
    "El collector monolítico no está autorizado; use preproof -> smoke -> post-seal.",
  );
}
