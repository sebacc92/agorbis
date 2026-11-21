import { installedPnpmStoreEnvironment } from "./installed-pnpm-store.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import {
  CLOUDFLARE_CLOSED_STATE_COMPONENTS,
  CloudflareStateFactualMismatchError,
  collectCloudflareClosedState,
  loadWranglerOAuthToken,
  validateD72CloudflareClosedStateComponent,
  validateCloudflareOpenSourceState,
} from "./cloudflare-closed-state.mjs";
import { assertOpenReleaseBaselineMatches } from "./open-release-baseline-policy.mjs";
import {
  EXPECTED_NON_WEB_DNS_RECORD_COUNT,
  EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256,
  EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION,
} from "./cloudflare-dns-audit.mjs";
import { verifyPublicWorkerDns } from "./cloudflare-public-dns.mjs";
import { validateCloudflareWorkerArtifact } from "./cloudflare-worker-artifact.mjs";
import {
  EXPECTED_WORKER_VARS,
  readWranglerConfiguration,
  validateWranglerConfiguration,
} from "./cloudflare-worker-policy.mjs";
import { assertExceptionalCutoverConfigurations } from "./exceptional-cutover-config-policy.mjs";
import { validateExceptionalReleaseArtifact } from "./exceptional-release-artifact.mjs";
import { validateExceptionalReleaseScriptContract } from "./exceptional-release-script-contract.mjs";
import {
  EVIDENCE_STATUS,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";
import {
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
  d72ReleaseEvidenceProfile,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS,
  validateReleaseOpenTestIsNonRecursive,
} from "./run-exceptional-release-local-gates.mjs";
import { assertD72SupabaseReadonlyReceipt } from "./run-d72-supabase-readonly.mjs";
import { findKnownSecrets } from "./secret-patterns.mjs";
import {
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  validatePublicBuildInventory,
} from "./cloudflare-public-build-environment.mjs";
import { socialAuthConsentBlockers } from "./social-auth-consent-policy.mjs";

export const D72_NON_STATEFUL_COMPOSITE_COLLECTOR_SCHEMA_VERSION =
  "agorbis-d72-non-stateful-composite-collector/v2";
export const D72_NON_STATEFUL_COMPOSITE_COLLECTOR_VALIDITY_MS = 60 * 60 * 1_000;
// Deliberadamente no hay CLI standalone: candidate identity y los receipts son
// capabilities opacas de proceso. El orchestrator versionado debe importar esta
// API y completar identity -> collectors -> certification en el mismo proceso;
// serializar cualquiera de esas autoridades debe seguir fallando cerrado.
export const D72_NON_STATEFUL_COMPOSITE_INTEGRATION_CONTRACT = Object.freeze({
  candidateIdentityTransport: "same-process-opaque-capability",
  collectorExport: "collectD72NonStatefulCompositeReceipt",
  deploymentAuthorized: false,
  deploymentExecuted: false,
  issuerId: "scripts/d72-non-stateful-composite-collector.mjs",
  standaloneCli: false,
});

export const D72_COMPOSITE_NON_STATEFUL_GATE_IDS = Object.freeze([
  "security.secret-scan",
  "security.worker-secrets-confidential",
  "cloudflare.secret-inventory-exact",
  "quality.build-and-test-suite",
  "cloudflare.known-bindings-only",
  "cloudflare.domain-config-exact",
  "cloudflare.known-crons-only",
  "network.production-dns-integrity",
  "configuration.no-unknown-release-config",
  "configuration.auth-providers-aligned",
  "configuration.ai-disabled",
  "legal.pending-external-copy-honest",
]);

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PRODUCTION_FETCH = globalThis.fetch;
const PRODUCTION_ABORT_SIGNAL = globalThis.AbortSignal;
const PRODUCTION_READABLE_STREAM = globalThis.ReadableStream;
const PRODUCTION_RESPONSE = globalThis.Response;
const PRODUCTION_DATE = globalThis.Date;
const PRODUCTION_DATE_NOW_METHOD = PRODUCTION_DATE.now;
const PRODUCTION_DATE_GET_TIME_METHOD = PRODUCTION_DATE.prototype.getTime;
const PRODUCTION_DATE_TO_ISO_METHOD = PRODUCTION_DATE.prototype.toISOString;
const PRODUCTION_DATE_NOW = PRODUCTION_DATE_NOW_METHOD.bind(PRODUCTION_DATE);
const PRODUCTION_DATE_GET_TIME = Function.prototype.call.bind(
  PRODUCTION_DATE_GET_TIME_METHOD,
);
const PRODUCTION_DATE_TO_ISO = Function.prototype.call.bind(
  PRODUCTION_DATE_TO_ISO_METHOD,
);
const PINNED_HOME = process.env.HOME;
const PINNED_NODE_EXECUTABLE = path.resolve(process.execPath);
const PINNED_NODE_BIN_DIRECTORY = path.dirname(PINNED_NODE_EXECUTABLE);
const PINNED_PNPM_DIRECTORY = path.join(
  PINNED_HOME ?? "",
  ".local",
  "share",
  "pnpm",
  "store",
  "v11",
  "links",
  "@pnpm",
  "exe",
  "11.15.0",
  "ff1311a9abb7c52b221f2ed434f6566da0b6def25cabdb13185748edbacb07cb",
  "node_modules",
  "@pnpm",
  "exe",
);
const PINNED_PNPM_EXECUTABLE = path.join(PINNED_PNPM_DIRECTORY, "pnpm");
const PINNED_GIT_EXECUTABLE = "/usr/bin/git";
const PINNED_DNS_TOKEN_FILE = path.join(
  PINNED_HOME ?? "",
  ".config",
  "agorbis",
  "cloudflare-dns-read.token",
);
const PINNED_PATH = `${PINNED_PNPM_DIRECTORY}:${PINNED_NODE_BIN_DIRECTORY}:/usr/bin:/bin`;
const PINNED_PACKAGE_MANAGER = "pnpm@11.15.0";
export const D72_COMPOSITE_PINNED_NODE_EXECUTABLE = PINNED_NODE_EXECUTABLE;
export const D72_COMPOSITE_PINNED_PNPM_EXECUTABLE = PINNED_PNPM_EXECUTABLE;
export const D72_COMPOSITE_PINNED_GIT_EXECUTABLE = PINNED_GIT_EXECUTABLE;
const PINNED_TOOL_METADATA = Object.freeze({
  git: Object.freeze({
    digest: "eb54b535467e0975c1284d4c4d08eea779aeb248a5d34b02e2ee171382e22201",
    gid: 0,
    mode: 0o755,
    path: PINNED_GIT_EXECUTABLE,
    size: 4_066_232,
    uid: 0,
  }),
  node: Object.freeze({
    digest: "1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31",
    gid: typeof process.getgid === "function" ? process.getgid() : null,
    mode: 0o755,
    path: PINNED_NODE_EXECUTABLE,
    size: 123_405_064,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
  }),
  pnpm: Object.freeze({
    digest: "5253220be9149295a49460c5e88fbfac2f78194be0a0050c7b4a65eca788a68b",
    gid: typeof process.getgid === "function" ? process.getgid() : null,
    mode: 0o755,
    path: PINNED_PNPM_EXECUTABLE,
    size: 146_738_295,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
  }),
});
const PINNED_NODE_BIN_ENTRIES = Object.freeze([
  "corepack",
  "node",
  "npm",
  "npx",
]);
const PINNED_PNPM_DIRECTORY_ENTRIES = Object.freeze([
  ".pnpm-needs-build",
  "README.md",
  "dist",
  "package.json",
  "platform-pkg-name.js",
  "pn",
  "pn.cmd",
  "pn.ps1",
  "pnpm",
  "pnpx",
  "pnpx.cmd",
  "pnpx.ps1",
  "pnx",
  "pnx.cmd",
  "pnx.ps1",
  "prepare.js",
  "setup.js",
]);
const WRANGLER_ENTRYPOINT = path.join(
  REPOSITORY_ROOT,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const DNS_AUDIT_ENTRYPOINT = path.join(
  REPOSITORY_ROOT,
  "scripts",
  "cloudflare-dns-audit.mjs",
);
const DNS_AUDIT_TEMPORARY_PREFIX = "/tmp/agorbis-d72-dns-audit-";
const MAX_DNS_AUDIT_OUTPUT_BYTES = 64 * 1_024;
const PINNED_NODE_VERSION = "22.22.0";
const SUPABASE_SETTINGS_URL = `${EXPECTED_WORKER_VARS.PUBLIC_SUPABASE_URL}/auth/v1/settings`;
const MAX_AUTH_SETTINGS_BYTES = 1024 * 1024;
const MAX_SCANNED_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_SCANNED_FILE_BYTES = 16 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const ALLOWED_GATE_STATUSES = new Set([
  EVIDENCE_STATUS.PASS,
  EVIDENCE_STATUS.FAIL,
  EVIDENCE_STATUS.NOT_VERIFIED,
]);
const RECEIPT_KEYS = Object.freeze([
  "artifactHash",
  "candidateIdentityHash",
  "completedAtUtc",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "gates",
  "head",
  "policyHash",
  "requestHash",
  "schemaVersion",
  "startedAtUtc",
]);
const GATE_KEYS = Object.freeze(["gateId", "sources", "status"]);
const SOURCE_KEYS = Object.freeze(["sourceId", "status"]);
const CANDIDATE_IDENTITY_KEYS = Object.freeze([
  "actIssued",
  "artifactHash",
  "contentSha256",
  "createdAtUtc",
  "deploymentAuthorized",
  "deploymentExecuted",
  "diffCheckClean",
  "expiresAtUtc",
  "head",
  "leftCount",
  "originMain",
  "phase",
  "policyHash",
  "policyVersion",
  "requestHash",
  "rightCount",
  "riskAcceptanceRecorded",
  "schemaVersion",
  "worktreeClean",
]);
const CANDIDATE_IDENTITY_SCHEMA_VERSION = "agorbis-d72-candidate-identity/v1";
const PRODUCTION_RECEIPTS = new WeakSet();
const TEST_RECEIPTS = new WeakSet();
const RECEIPT_AUTHORITIES = new WeakMap();
const PRODUCTION_COLLECTED_IDENTITIES = new WeakSet();
const TEST_COLLECTED_IDENTITIES = new WeakSet();
const SAFE_ENVIRONMENT_NAMES = Object.freeze([
  "DBUS_SESSION_BUS_ADDRESS",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
]);
const PINNED_SAFE_ENVIRONMENT = Object.freeze(
  Object.fromEntries(
    SAFE_ENVIRONMENT_NAMES.flatMap((name) => {
      const value = process.env[name];
      return typeof value === "string" && !value.includes("\0")
        ? [[name, value]]
        : [];
    }),
  ),
);
class FactualGateMismatchError extends Error {}
export const D72_AUTH_SETTINGS_SCHEMA_VERSION =
  "supabase-gotrue-settings/2026-08-31/v1";
export const D72_AUTH_SETTINGS_TOP_LEVEL_KEYS = Object.freeze([
  "disable_signup",
  "external",
  "mailer_autoconfirm",
  "passkeys_enabled",
  "phone_autoconfirm",
  "saml_enabled",
  "saml_private_key_next_configured",
  "sms_provider",
]);
export const D72_AUTH_SETTINGS_EXTERNAL_KEYS = Object.freeze([
  "anonymous_users",
  "apple",
  "azure",
  "bitbucket",
  "discord",
  "email",
  "facebook",
  "figma",
  "fly",
  "github",
  "gitlab",
  "google",
  "kakao",
  "keycloak",
  "linkedin",
  "linkedin_oidc",
  "notion",
  "phone",
  "slack",
  "slack_oidc",
  "snapchat",
  "spotify",
  "twitch",
  "twitter",
  "workos",
  "zoom",
]);
const REQUIRED_ARTIFACT_LEGAL_COPY = Object.freeze([
  "2026-08-29.1",
  "Pendiente de evidencia externa",
  "Pending external evidence",
  "Agorbis todavía no cuenta con evidencia suficiente para publicar la lista completa y exacta de lugares de tratamiento y acceso aplicables a este proveedor.",
  "Agorbis does not yet have sufficient evidence to publish the complete and exact list of processing and access locations applicable to this provider.",
]);
export const D72_COMPOSITE_OBSERVATION_IDS = Object.freeze([
  "artifact.identity.before",
  "artifact.identity.after",
  "artifact.secret-scan.before",
  "artifact.secret-scan.after",
  "artifact.legal-copy.before",
  "artifact.legal-copy.after",
  "artifact.worker.before",
  "artifact.worker.after",
  "candidate.bindings.before",
  "candidate.bindings.after",
  "candidate.domains.before",
  "candidate.domains.after",
  "candidate.crons.before",
  "candidate.crons.after",
  "candidate.configuration.before",
  "candidate.configuration.after",
  "candidate.auth-providers.before",
  "candidate.auth-providers.after",
  "candidate.ai.before",
  "candidate.ai.after",
  "evidence.redaction",
  "local.suite",
  "local.secret-scan",
  "remote.cloudflare.secrets",
  "remote.cloudflare.bindings",
  "remote.cloudflare.domains",
  "remote.cloudflare.crons",
  "remote.cloudflare.configuration",
  "remote.cloudflare.ai",
  "remote.dns",
  "remote.auth-providers",
  "dry-run.upload",
  "dry-run.crons",
  "remote.supabase-legal",
]);
export const D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE = deepFreeze({
  "security.secret-scan": {
    "repository.secret-scan": ["local.secret-scan"],
    "artifact.secret-scan": [
      "artifact.secret-scan.before",
      "artifact.secret-scan.after",
    ],
    "evidence.redaction-scan": ["evidence.redaction"],
  },
  "security.worker-secrets-confidential": {
    "repository.secret-scan": ["local.secret-scan"],
    "artifact.secret-scan": [
      "artifact.secret-scan.before",
      "artifact.secret-scan.after",
    ],
    "cloudflare.worker-secret-metadata": ["remote.cloudflare.secrets"],
    "runner.output-redaction": ["evidence.redaction"],
  },
  "cloudflare.secret-inventory-exact": {
    "cloudflare.worker-secret-metadata": ["remote.cloudflare.secrets"],
  },
  "quality.build-and-test-suite": {
    "local.lint": ["local.suite"],
    "local.build-types": ["local.suite"],
    "local.dependency-audit": ["local.suite"],
    "local.database-tests": ["local.suite"],
    "local.civic-tests": ["local.suite"],
    "local.component-tests": ["local.suite"],
    "local.e2e-tests": ["local.suite"],
    "local.preflight-tests": ["local.suite"],
    "local.release-open-tests": ["local.suite"],
    "local.secret-tests": ["local.suite", "local.secret-scan"],
    "artifact.open-build": [
      "artifact.identity.before",
      "artifact.identity.after",
      "artifact.worker.before",
      "artifact.worker.after",
    ],
  },
  "cloudflare.known-bindings-only": {
    "cloudflare.worker-version-bindings": ["remote.cloudflare.bindings"],
    "artifact.wrangler-bindings": [
      "candidate.bindings.before",
      "candidate.bindings.after",
    ],
  },
  "cloudflare.domain-config-exact": {
    "cloudflare.worker-domains": ["remote.cloudflare.domains"],
    "cloudflare.worker-subdomain-settings": ["remote.cloudflare.domains"],
    "cloudflare.worker-routes": ["remote.cloudflare.domains"],
    "artifact.wrangler-domains": [
      "candidate.domains.before",
      "candidate.domains.after",
    ],
  },
  "cloudflare.known-crons-only": {
    "cloudflare.worker-cron-triggers": ["remote.cloudflare.crons"],
    "artifact.closed-cron-config": [
      "candidate.crons.before",
      "candidate.crons.after",
    ],
    "artifact.open-cron-config": [
      "candidate.crons.before",
      "candidate.crons.after",
    ],
    "wrangler.open-cron-dry-run": ["dry-run.crons"],
  },
  "network.production-dns-integrity": {
    "cloudflare.dns-records-get": ["remote.dns"],
    "public-doh.cloudflare": ["remote.dns"],
    "public-doh.google": ["remote.dns"],
    "repository.dns-mail-policy": ["remote.dns"],
  },
  "configuration.no-unknown-release-config": {
    "artifact.release-config": [
      "candidate.configuration.before",
      "candidate.configuration.after",
    ],
    "cloudflare.worker-settings": ["remote.cloudflare.configuration"],
    "cloudflare.worker-version-bindings": ["remote.cloudflare.bindings"],
    "wrangler.version-upload-dry-run": ["dry-run.upload"],
    "wrangler.open-cron-dry-run": ["dry-run.crons"],
  },
  "configuration.auth-providers-aligned": {
    "supabase.production-auth-provider-config": ["remote.auth-providers"],
    "artifact.public-auth-config": [
      "candidate.auth-providers.before",
      "candidate.auth-providers.after",
    ],
    "repository.auth-provider-policy": [
      "local.suite",
      "candidate.auth-providers.before",
      "candidate.auth-providers.after",
    ],
    "repository.social-auth-consent-snapshot": [
      "local.suite",
      "candidate.auth-providers.before",
      "candidate.auth-providers.after",
    ],
    "repository.social-auth-processing-evidence": [
      "candidate.auth-providers.before",
      "candidate.auth-providers.after",
    ],
  },
  "configuration.ai-disabled": {
    "artifact.public-ai-config": ["candidate.ai.before", "candidate.ai.after"],
    "cloudflare.worker-settings": ["remote.cloudflare.ai"],
    "repository.ai-feature-policy": [
      "local.suite",
      "candidate.ai.before",
      "candidate.ai.after",
    ],
  },
  "legal.pending-external-copy-honest": {
    "repository.legal-snapshot-hashes": [
      "local.suite",
      "artifact.legal-copy.before",
      "artifact.legal-copy.after",
    ],
    "repository.legal-activation-0060": [
      "local.suite",
      "remote.supabase-legal",
    ],
    "supabase.production-migration-ledger": ["remote.supabase-legal"],
    "artifact.legal-copy": [
      "artifact.legal-copy.before",
      "artifact.legal-copy.after",
    ],
  },
});

const D72_COMPOSITE_CATALOG_BY_GATE = new Map(
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG.filter(({ gateId }) =>
    D72_COMPOSITE_NON_STATEFUL_GATE_IDS.includes(gateId),
  ).map((definition) => [definition.gateId, definition]),
);
for (const gateId of D72_COMPOSITE_NON_STATEFUL_GATE_IDS) {
  const definition = D72_COMPOSITE_CATALOG_BY_GATE.get(gateId);
  const dependencies = D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE[gateId];
  if (
    !definition ||
    !exactKeys(dependencies, definition.sourceIds) ||
    Object.values(dependencies).some(
      (observationIds) =>
        !Array.isArray(observationIds) ||
        observationIds.length === 0 ||
        observationIds.some(
          (observationId) =>
            !D72_COMPOSITE_OBSERVATION_IDS.includes(observationId),
        ),
    )
  ) {
    throw new Error(
      `El mapping granular del gate ${gateId} no coincide con el catálogo.`,
    );
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
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

function canonicalJson(value) {
  const serialized = JSON.stringify(canonicalize(value));
  if (typeof serialized !== "string") {
    throw new Error("El receipt compuesto no puede serializarse.");
  }
  return `${serialized}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contentHash(record) {
  if (!isPlainObject(record)) {
    throw new Error("El payload compuesto debe ser un objeto plano.");
  }
  const { contentSha256: _contentSha256, ...payload } = record;
  return sha256(canonicalJson(payload));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function canonicalInstant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(`${label} no es un timestamp UTC canónico.`);
  }
  const instant = new PRODUCTION_DATE(value);
  if (
    !Number.isFinite(PRODUCTION_DATE_GET_TIME(instant)) ||
    PRODUCTION_DATE_TO_ISO(instant) !== value
  ) {
    throw new Error(`${label} no es un timestamp UTC canónico.`);
  }
  return instant;
}

function candidateIdentityHash(candidateIdentity) {
  return contentHash(candidateIdentity);
}

function assertCandidateIdentityShape(candidateIdentity) {
  const releaseProfile = d72ReleaseEvidenceProfile(candidateIdentity ?? {});
  const descriptors = isPlainObject(candidateIdentity)
    ? Object.getOwnPropertyDescriptors(candidateIdentity)
    : {};
  if (
    !exactKeys(candidateIdentity, [
      ...CANDIDATE_IDENTITY_KEYS,
      ...Object.keys(releaseProfile),
    ]) ||
    !Object.isFrozen(candidateIdentity) ||
    Object.values(descriptors).some(
      (descriptor) =>
        !Object.hasOwn(descriptor, "value") || descriptor.writable !== false,
    ) ||
    candidateIdentity.schemaVersion !== CANDIDATE_IDENTITY_SCHEMA_VERSION ||
    candidateIdentity.phase !== "candidate_identity" ||
    candidateIdentity.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    candidateIdentity.policyHash !== RELEASE_GATE_POLICY_SHA256 ||
    !FULL_HEAD_PATTERN.test(candidateIdentity.head ?? "") ||
    candidateIdentity.originMain !== candidateIdentity.head ||
    candidateIdentity.leftCount !== 0 ||
    candidateIdentity.rightCount !== 0 ||
    candidateIdentity.worktreeClean !== true ||
    candidateIdentity.diffCheckClean !== true ||
    !SHA256_PATTERN.test(candidateIdentity.requestHash ?? "") ||
    !SHA256_PATTERN.test(candidateIdentity.artifactHash ?? "") ||
    !SHA256_PATTERN.test(candidateIdentity.contentSha256 ?? "") ||
    candidateIdentity.deploymentAuthorized !== false ||
    candidateIdentity.deploymentExecuted !== false ||
    candidateIdentity.actIssued !== false ||
    candidateIdentity.riskAcceptanceRecorded !== false ||
    candidateIdentity.contentSha256 !== candidateIdentityHash(candidateIdentity)
  ) {
    throw new Error(
      "El collector compuesto exige una candidate identity íntegra y no autorizante.",
    );
  }
  const createdAt = canonicalInstant(
    candidateIdentity.createdAtUtc,
    "candidate.createdAtUtc",
  );
  const expiresAt = canonicalInstant(
    candidateIdentity.expiresAtUtc,
    "candidate.expiresAtUtc",
  );
  if (
    PRODUCTION_DATE_GET_TIME(expiresAt) <=
      PRODUCTION_DATE_GET_TIME(createdAt) ||
    PRODUCTION_DATE_GET_TIME(expiresAt) - PRODUCTION_DATE_GET_TIME(createdAt) >
      D72_NON_STATEFUL_COMPOSITE_COLLECTOR_VALIDITY_MS
  ) {
    throw new Error("La ventana de candidate identity no es canónica.");
  }
  return candidateIdentity;
}

function sourceIdsForGate(gateId) {
  const definition = D72_COMPOSITE_CATALOG_BY_GATE.get(gateId);
  if (!definition) {
    throw new Error(`El gate compuesto ${gateId} no existe en el catálogo.`);
  }
  return definition.sourceIds;
}

function normalizedSourceStatuses(sourceStatusesByGate) {
  if (!exactKeys(sourceStatusesByGate, D72_COMPOSITE_NON_STATEFUL_GATE_IDS)) {
    throw new Error(
      "sourceStatusesByGate debe contener exactamente los doce gates compuestos.",
    );
  }
  return D72_COMPOSITE_NON_STATEFUL_GATE_IDS.map((gateId) => {
    const sourceIds = sourceIdsForGate(gateId);
    const sourceStatuses = sourceStatusesByGate[gateId];
    if (
      !exactKeys(sourceStatuses, sourceIds) ||
      sourceIds.some(
        (sourceId) => !ALLOWED_GATE_STATUSES.has(sourceStatuses[sourceId]),
      )
    ) {
      throw new Error(
        `sourceStatusesByGate.${gateId} no contiene exactamente sus sourceId y estados factuales.`,
      );
    }
    const sources = sourceIds.map((sourceId) => ({
      sourceId,
      status: sourceStatuses[sourceId],
    }));
    return {
      gateId,
      sources,
      status: combinedEvidenceStatus(sources.map(({ status }) => status)),
    };
  });
}

function validateReceiptStructure(receipt) {
  const releaseProfile = d72ReleaseEvidenceProfile(receipt ?? {});
  if (!exactKeys(receipt, [...RECEIPT_KEYS, ...Object.keys(releaseProfile)])) {
    throw new Error(
      "El receipt compuesto contiene campos faltantes o desconocidos.",
    );
  }
  if (
    receipt.schemaVersion !==
      D72_NON_STATEFUL_COMPOSITE_COLLECTOR_SCHEMA_VERSION ||
    !FULL_HEAD_PATTERN.test(receipt.head ?? "") ||
    !SHA256_PATTERN.test(receipt.requestHash ?? "") ||
    !SHA256_PATTERN.test(receipt.policyHash ?? "") ||
    !SHA256_PATTERN.test(receipt.artifactHash ?? "") ||
    !SHA256_PATTERN.test(receipt.candidateIdentityHash ?? "") ||
    !SHA256_PATTERN.test(receipt.contentSha256 ?? "") ||
    receipt.deploymentAuthorized !== false ||
    receipt.deploymentExecuted !== false ||
    receipt.contentSha256 !== contentHash(receipt)
  ) {
    throw new Error("El receipt compuesto no es canónico o fue modificado.");
  }
  const startedAt = canonicalInstant(
    receipt.startedAtUtc,
    "receipt.startedAtUtc",
  );
  const completedAt = canonicalInstant(
    receipt.completedAtUtc,
    "receipt.completedAtUtc",
  );
  if (
    PRODUCTION_DATE_GET_TIME(completedAt) <
      PRODUCTION_DATE_GET_TIME(startedAt) ||
    PRODUCTION_DATE_GET_TIME(completedAt) -
      PRODUCTION_DATE_GET_TIME(startedAt) >
      D72_NON_STATEFUL_COMPOSITE_COLLECTOR_VALIDITY_MS
  ) {
    throw new Error("La ventana temporal del receipt compuesto es inválida.");
  }
  if (
    !Array.isArray(receipt.gates) ||
    receipt.gates.length !== D72_COMPOSITE_NON_STATEFUL_GATE_IDS.length ||
    receipt.gates.some(
      (gate, index) =>
        !exactKeys(gate, GATE_KEYS) ||
        gate.gateId !== D72_COMPOSITE_NON_STATEFUL_GATE_IDS[index] ||
        !ALLOWED_GATE_STATUSES.has(gate.status) ||
        !Array.isArray(gate.sources) ||
        gate.sources.length !== sourceIdsForGate(gate.gateId).length ||
        gate.sources.some(
          (source, sourceIndex) =>
            !exactKeys(source, SOURCE_KEYS) ||
            source.sourceId !== sourceIdsForGate(gate.gateId)[sourceIndex] ||
            !ALLOWED_GATE_STATUSES.has(source.status),
        ) ||
        gate.status !==
          combinedEvidenceStatus(gate.sources.map(({ status }) => status)),
    )
  ) {
    throw new Error(
      "El inventario de gates del receipt compuesto es inválido.",
    );
  }
  return { completedAt, startedAt };
}

function issueReceipt({
  candidateIdentity,
  completedAtUtc,
  gates,
  startedAtUtc,
  testOnly,
}) {
  assertCandidateIdentityShape(candidateIdentity);
  const identityCreatedAt = canonicalInstant(
    candidateIdentity.createdAtUtc,
    "candidate.createdAtUtc",
  );
  const identityExpiresAt = canonicalInstant(
    candidateIdentity.expiresAtUtc,
    "candidate.expiresAtUtc",
  );
  const startedAt = canonicalInstant(startedAtUtc, "startedAtUtc");
  const completedAt = canonicalInstant(completedAtUtc, "completedAtUtc");
  if (
    PRODUCTION_DATE_GET_TIME(startedAt) <
      PRODUCTION_DATE_GET_TIME(identityCreatedAt) ||
    PRODUCTION_DATE_GET_TIME(completedAt) <
      PRODUCTION_DATE_GET_TIME(startedAt) ||
    PRODUCTION_DATE_GET_TIME(completedAt) >
      PRODUCTION_DATE_GET_TIME(identityExpiresAt)
  ) {
    throw new Error(
      "El collector compuesto debe ejecutarse íntegramente después de candidate identity y antes de su vencimiento.",
    );
  }
  const payload = {
    artifactHash: candidateIdentity.artifactHash,
    ...d72ReleaseEvidenceProfile(candidateIdentity),
    candidateIdentityHash: candidateIdentity.contentSha256,
    completedAtUtc,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    gates,
    head: candidateIdentity.head,
    policyHash: candidateIdentity.policyHash,
    requestHash: candidateIdentity.requestHash,
    schemaVersion: D72_NON_STATEFUL_COMPOSITE_COLLECTOR_SCHEMA_VERSION,
    startedAtUtc,
  };
  const receipt = deepFreeze({
    ...payload,
    contentSha256: sha256(canonicalJson(payload)),
  });
  validateReceiptStructure(receipt);
  RECEIPT_AUTHORITIES.set(receipt, {
    candidateIdentity,
    candidateIdentityHash: candidateIdentityHash(candidateIdentity),
  });
  (testOnly ? TEST_RECEIPTS : PRODUCTION_RECEIPTS).add(receipt);
  return receipt;
}

export function issueTestD72NonStatefulCompositeCollectorReceipt(options) {
  if (
    !exactKeys(options, [
      "candidateIdentity",
      "completedAtUtc",
      "sourceStatusesByGate",
      "startedAtUtc",
    ])
  ) {
    throw new Error(
      "El factory test-only compuesto acepta únicamente identity, ventana y sourceStatusesByGate cerrados.",
    );
  }
  return issueReceipt({
    candidateIdentity: options.candidateIdentity,
    completedAtUtc: options.completedAtUtc,
    gates: normalizedSourceStatuses(options.sourceStatusesByGate),
    startedAtUtc: options.startedAtUtc,
    testOnly: true,
  });
}

export function assertD72NonStatefulCompositeCollectorReceipt(
  receipt,
  {
    allowTestReceipt = false,
    candidateIdentity,
    now = new PRODUCTION_DATE(PRODUCTION_DATE_NOW()),
  } = {},
) {
  if (typeof allowTestReceipt !== "boolean") {
    throw new Error("allowTestReceipt debe ser booleano.");
  }
  const authority = RECEIPT_AUTHORITIES.get(receipt);
  if (
    !authority ||
    authority.candidateIdentity !== candidateIdentity ||
    authority.candidateIdentityHash !==
      candidateIdentityHash(candidateIdentity) ||
    (!PRODUCTION_RECEIPTS.has(receipt) &&
      !(allowTestReceipt && TEST_RECEIPTS.has(receipt)))
  ) {
    throw new Error(
      "El receipt compuesto debe ser opaco, emitido en este proceso y ligado a la misma candidate identity.",
    );
  }
  assertCandidateIdentityShape(candidateIdentity);
  const { completedAt, startedAt } = validateReceiptStructure(receipt);
  const observedNow =
    now instanceof PRODUCTION_DATE
      ? new PRODUCTION_DATE(PRODUCTION_DATE_GET_TIME(now))
      : new PRODUCTION_DATE(now);
  if (!Number.isFinite(PRODUCTION_DATE_GET_TIME(observedNow))) {
    throw new Error("El reloj del collector compuesto es inválido.");
  }
  const identityCreatedAt = canonicalInstant(
    candidateIdentity.createdAtUtc,
    "candidate.createdAtUtc",
  );
  const identityExpiresAt = canonicalInstant(
    candidateIdentity.expiresAtUtc,
    "candidate.expiresAtUtc",
  );
  if (
    receipt.head !== candidateIdentity.head ||
    receipt.requestHash !== candidateIdentity.requestHash ||
    receipt.policyHash !== candidateIdentity.policyHash ||
    receipt.artifactHash !== candidateIdentity.artifactHash ||
    receipt.candidateIdentityHash !== candidateIdentity.contentSha256 ||
    PRODUCTION_DATE_GET_TIME(startedAt) <
      PRODUCTION_DATE_GET_TIME(identityCreatedAt) ||
    PRODUCTION_DATE_GET_TIME(completedAt) >
      PRODUCTION_DATE_GET_TIME(observedNow) ||
    PRODUCTION_DATE_GET_TIME(observedNow) >
      PRODUCTION_DATE_GET_TIME(identityExpiresAt) ||
    PRODUCTION_DATE_GET_TIME(observedNow) -
      PRODUCTION_DATE_GET_TIME(completedAt) >
      D72_NON_STATEFUL_COMPOSITE_COLLECTOR_VALIDITY_MS
  ) {
    throw new Error(
      "El receipt compuesto no coincide con identity o está fuera de su ventana vigente.",
    );
  }
  return receipt;
}

export function validateD72AuthProviderSettings(settings) {
  if (!exactKeys(settings, D72_AUTH_SETTINGS_TOP_LEVEL_KEYS)) {
    return [
      `GET /auth/v1/settings no coincide con ${D72_AUTH_SETTINGS_SCHEMA_VERSION}.`,
    ];
  }
  const descriptors = Object.getOwnPropertyDescriptors(settings);
  if (
    Object.values(descriptors).some(
      (descriptor) => !Object.hasOwn(descriptor, "value"),
    )
  ) {
    return ["GET /auth/v1/settings contiene accessors no verificables."];
  }
  const external = descriptors.external.value;
  if (
    !isPlainObject(external) ||
    !exactKeys(external, D72_AUTH_SETTINGS_EXTERNAL_KEYS)
  ) {
    return ["GET /auth/v1/settings no contiene external canónico."];
  }
  const externalDescriptors = Object.getOwnPropertyDescriptors(external);
  if (
    Object.values(externalDescriptors).some(
      (descriptor) =>
        !Object.hasOwn(descriptor, "value") ||
        typeof descriptor.value !== "boolean",
    ) ||
    D72_AUTH_SETTINGS_TOP_LEVEL_KEYS.filter(
      (name) => !["external", "sms_provider"].includes(name),
    ).some((name) => typeof descriptors[name].value !== "boolean") ||
    !(
      descriptors.sms_provider.value === null ||
      (typeof descriptors.sms_provider.value === "string" &&
        descriptors.sms_provider.value.length <= 128)
    )
  ) {
    return [
      `GET /auth/v1/settings no coincide con ${D72_AUTH_SETTINGS_SCHEMA_VERSION}.`,
    ];
  }
  const expectedEnabled = new Set(["email", "google"]);
  const errors = D72_AUTH_SETTINGS_EXTERNAL_KEYS.flatMap((provider) =>
    externalDescriptors[provider].value === expectedEnabled.has(provider)
      ? []
      : [
          `Supabase Producción informa external.${provider}=${externalDescriptors[provider].value}; el objetivo exige ${expectedEnabled.has(provider)}.`,
        ],
  );
  for (const name of [
    "passkeys_enabled",
    "saml_enabled",
    "saml_private_key_next_configured",
  ]) {
    if (descriptors[name].value !== false)
      errors.push(
        `Supabase Producción informa ${name}=true fuera del objetivo aprobado.`,
      );
  }
  return errors;
}

export async function readBoundedD72AuthSettings(response) {
  if (!(response instanceof PRODUCTION_RESPONSE) || response.status !== 200) {
    throw new Error("GET Auth settings no devolvió HTTP 200.");
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:;|$)/i.test(contentType)) {
    throw new Error("GET Auth settings no devolvió application/json.");
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_AUTH_SETTINGS_BYTES)
  ) {
    throw new Error("GET Auth settings excedió el límite permitido.");
  }
  if (!(response.body instanceof PRODUCTION_READABLE_STREAM)) {
    throw new Error("GET Auth settings no devolvió un stream acotable.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) {
        throw new Error("GET Auth settings devolvió un chunk inválido.");
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_AUTH_SETTINGS_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("GET Auth settings excedió el límite permitido.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) {
    throw new Error("GET Auth settings devolvió un cuerpo inválido.");
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("GET Auth settings no devolvió JSON UTF-8 válido.");
  }
}

async function assertAuthProvidersAligned(fetchImpl) {
  const response = await fetchImpl(SUPABASE_SETTINGS_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: EXPECTED_WORKER_VARS.PUBLIC_SUPABASE_ANON_KEY,
    },
    redirect: "error",
    signal: PRODUCTION_ABORT_SIGNAL.timeout(15_000),
  });
  const errors = validateD72AuthProviderSettings(
    await readBoundedD72AuthSettings(response),
  );
  if (errors.some((error) => error.startsWith("Supabase Producción informa"))) {
    throw new FactualGateMismatchError(
      "Los proveedores Auth divergen del objetivo Google/correo activos y Facebook/otros apagados.",
    );
  }
  if (errors.length > 0) throw new Error("Auth settings no es verificable.");
}

function sha256PinnedFileDescriptor(descriptor, expectedSize) {
  const digest = createHash("sha256");
  const chunk = Buffer.alloc(64 * 1024);
  let totalBytes = 0;
  try {
    while (true) {
      const bytesRead = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.length, expectedSize + 1 - totalBytes),
        null,
      );
      if (!Number.isInteger(bytesRead) || bytesRead < 0) {
        throw new Error("No se pudo leer un ejecutable fijado.");
      }
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > expectedSize) {
        throw new Error("Un ejecutable fijado creció durante el hash.");
      }
      digest.update(chunk.subarray(0, bytesRead));
      chunk.fill(0, 0, bytesRead);
    }
    if (totalBytes !== expectedSize) {
      throw new Error("Un ejecutable fijado cambió de tamaño durante el hash.");
    }
    return digest.digest("hex");
  } finally {
    chunk.fill(0);
  }
}

function samePinnedFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function observedPinnedFile(filePath, expectedSize, { afterHash } = {}) {
  let descriptor;
  try {
    const before = lstatSync(filePath);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size !== expectedSize ||
      realpathSync(filePath) !== filePath
    ) {
      throw new Error("El ejecutable fijado no es un archivo regular exacto.");
    }
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.isSymbolicLink() ||
      opened.size !== expectedSize ||
      realpathSync(`/proc/self/fd/${descriptor}`) !== filePath ||
      !samePinnedFileIdentity(before, opened)
    ) {
      throw new Error("El descriptor del ejecutable fijado no coincide.");
    }
    const digest = sha256PinnedFileDescriptor(descriptor, expectedSize);
    if (afterHash !== undefined) afterHash();
    const after = lstatSync(filePath);
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      realpathSync(filePath) !== filePath ||
      !samePinnedFileIdentity(opened, after) ||
      realpathSync(`/proc/self/fd/${descriptor}`) !== filePath
    ) {
      throw new Error("El ejecutable fijado cambió durante su acreditación.");
    }
    return Object.freeze({
      digest,
      gid: opened.gid,
      mode: opened.mode & 0o777,
      path: filePath,
      realpath: filePath,
      size: opened.size,
      type: "regular-file",
      uid: opened.uid,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function collectTestD72CompositePinnedFileEvidence(options) {
  if (
    !isPlainObject(options) ||
    ![2, 3].includes(Object.keys(options).length) ||
    !Object.hasOwn(options, "filePath") ||
    !Object.hasOwn(options, "expectedSize") ||
    (Object.keys(options).length === 3 &&
      (!Object.hasOwn(options, "afterHash") ||
        typeof options.afterHash !== "function")) ||
    typeof options.filePath !== "string" ||
    !path.isAbsolute(options.filePath) ||
    !Number.isSafeInteger(options.expectedSize) ||
    options.expectedSize < 0
  ) {
    throw new Error("El collector test-only de archivo fijado es inválido.");
  }
  return observedPinnedFile(options.filePath, options.expectedSize, {
    afterHash: options.afterHash,
  });
}

function expectedPinnedFile(metadata) {
  return Object.freeze({
    ...metadata,
    realpath: metadata.path,
    type: "regular-file",
  });
}

function readPinnedPackageManager() {
  let packageJson;
  try {
    packageJson = JSON.parse(
      readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
    );
  } catch {
    throw new Error("package.json no puede acreditar el package manager.");
  }
  if (
    !isPlainObject(packageJson?.scripts) ||
    Object.values(packageJson.scripts).some(
      (command) =>
        typeof command !== "string" ||
        /(?:^|[\s;&|])(?:corepack|npm|npx|pn|pnpx|pnx)(?=$|[\s;&|])/.test(
          command,
        ),
    )
  ) {
    throw new Error("package.json intenta resolver un ejecutable no fijado.");
  }
  return packageJson?.packageManager;
}

function collectPinnedToolEvidence() {
  const nodeDirectoryStat = lstatSync(PINNED_NODE_BIN_DIRECTORY);
  const pnpmDirectoryStat = lstatSync(PINNED_PNPM_DIRECTORY);
  return Object.freeze({
    files: Object.freeze(
      Object.fromEntries(
        Object.entries(PINNED_TOOL_METADATA).map(([name, metadata]) => [
          name,
          observedPinnedFile(metadata.path, metadata.size),
        ]),
      ),
    ),
    nodeDirectory: Object.freeze({
      entries: readdirSync(PINNED_NODE_BIN_DIRECTORY).sort(),
      mode: nodeDirectoryStat.mode & 0o777,
      realpath: realpathSync(PINNED_NODE_BIN_DIRECTORY),
      type:
        nodeDirectoryStat.isDirectory() && !nodeDirectoryStat.isSymbolicLink()
          ? "directory"
          : "rejected",
    }),
    packageManager: readPinnedPackageManager(),
    pnpmDirectory: Object.freeze({
      entries: readdirSync(PINNED_PNPM_DIRECTORY).sort(),
      mode: pnpmDirectoryStat.mode & 0o777,
      realpath: realpathSync(PINNED_PNPM_DIRECTORY),
      type:
        pnpmDirectoryStat.isDirectory() && !pnpmDirectoryStat.isSymbolicLink()
          ? "directory"
          : "rejected",
    }),
  });
}

export function validateD72CompositePinnedToolEvidence(evidence) {
  const expectedFileNames = Object.keys(PINNED_TOOL_METADATA).sort();
  if (
    !exactKeys(evidence, [
      "files",
      "nodeDirectory",
      "packageManager",
      "pnpmDirectory",
    ]) ||
    !exactKeys(evidence.files, expectedFileNames) ||
    evidence.packageManager !== PINNED_PACKAGE_MANAGER ||
    !exactKeys(evidence.nodeDirectory, [
      "entries",
      "mode",
      "realpath",
      "type",
    ]) ||
    evidence.nodeDirectory.type !== "directory" ||
    evidence.nodeDirectory.mode !== 0o755 ||
    evidence.nodeDirectory.realpath !== PINNED_NODE_BIN_DIRECTORY ||
    JSON.stringify(evidence.nodeDirectory.entries) !==
      JSON.stringify(PINNED_NODE_BIN_ENTRIES) ||
    !exactKeys(evidence.pnpmDirectory, [
      "entries",
      "mode",
      "realpath",
      "type",
    ]) ||
    evidence.pnpmDirectory.type !== "directory" ||
    evidence.pnpmDirectory.mode !== 0o775 ||
    evidence.pnpmDirectory.realpath !== PINNED_PNPM_DIRECTORY ||
    JSON.stringify(evidence.pnpmDirectory.entries) !==
      JSON.stringify(PINNED_PNPM_DIRECTORY_ENTRIES)
  ) {
    return ["El inventario de ejecutables fijados no coincide."];
  }
  const errors = [];
  for (const [name, metadata] of Object.entries(PINNED_TOOL_METADATA)) {
    if (
      !exactKeys(evidence.files[name], [
        "digest",
        "gid",
        "mode",
        "path",
        "realpath",
        "size",
        "type",
        "uid",
      ]) ||
      canonicalJson(evidence.files[name]) !==
        canonicalJson(expectedPinnedFile(metadata))
    ) {
      errors.push(`El ejecutable fijado ${name} no coincide.`);
    }
  }
  return errors;
}

export function collectTestD72CompositePinnedToolEvidence() {
  return collectPinnedToolEvidence();
}

function pinnedChildEnvironment() {
  return {
    ...PINNED_SAFE_ENVIRONMENT,
    CI: "true",
    DO_NOT_TRACK: "1",
    FORCE_COLOR: "0",
    HOME: PINNED_HOME,
    LC_ALL: "C",
    NPM_CONFIG_GLOBALCONFIG: "/dev/null",
    NPM_CONFIG_USERCONFIG: "/dev/null",
    NO_COLOR: "1",
    PATH: PINNED_PATH,
    SHELL: "/bin/sh",
  };
}

function assertExactCommandVersion(command, arguments_, expected, env) {
  const result = spawnSync(command, arguments_, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env,
    maxBuffer: 4096,
    shell: false,
    timeout: 10_000,
  });
  if (
    result.error ||
    result.signal ||
    result.status !== 0 ||
    result.stdout !== `${expected}\n` ||
    result.stderr !== ""
  ) {
    throw new Error("La versión de un ejecutable fijado no coincide.");
  }
}

export function assertD72CompositeProductionRuntime() {
  if (
    process.versions.node !== PINNED_NODE_VERSION ||
    globalThis.fetch !== PRODUCTION_FETCH ||
    typeof PRODUCTION_FETCH !== "function" ||
    globalThis.AbortSignal !== PRODUCTION_ABORT_SIGNAL ||
    globalThis.ReadableStream !== PRODUCTION_READABLE_STREAM ||
    globalThis.Response !== PRODUCTION_RESPONSE ||
    globalThis.Date !== PRODUCTION_DATE ||
    PRODUCTION_DATE.now !== PRODUCTION_DATE_NOW_METHOD ||
    PRODUCTION_DATE.prototype.getTime !== PRODUCTION_DATE_GET_TIME_METHOD ||
    PRODUCTION_DATE.prototype.toISOString !== PRODUCTION_DATE_TO_ISO_METHOD ||
    typeof PINNED_HOME !== "string" ||
    !path.isAbsolute(PINNED_HOME) ||
    process.env.HOME !== PINNED_HOME ||
    process.execArgv.length !== 0 ||
    [
      "LD_LIBRARY_PATH",
      "LD_PRELOAD",
      "NODE_OPTIONS",
      "NODE_PATH",
      "NODE_V8_COVERAGE",
    ].some((name) => Object.hasOwn(process.env, name))
  ) {
    throw new Error("El runtime productivo está instrumentado o no fijado.");
  }
  let evidence;
  try {
    evidence = collectPinnedToolEvidence();
  } catch {
    throw new Error(
      "No se pudo acreditar el inventario de ejecutables fijados.",
    );
  }
  const errors = validateD72CompositePinnedToolEvidence(evidence);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const environment = pinnedChildEnvironment();
  assertExactCommandVersion(
    PINNED_GIT_EXECUTABLE,
    ["--version"],
    "git version 2.43.0",
    environment,
  );
  assertExactCommandVersion(
    PINNED_PNPM_EXECUTABLE,
    ["--version"],
    "11.15.0",
    environment,
  );
  return true;
}

function runFixedCommand(command, arguments_, { cwd, env, stdio = "ignore" }) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env,
    shell: false,
    stdio,
    timeout: 30 * 60_000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Un harness fijo del collector compuesto no terminó PASS.");
  }
}

function assertGitWorktreeStillClean(repositoryRoot, environment) {
  for (const arguments_ of [
    ["diff", "--check"],
    ["status", "--porcelain=v1"],
  ]) {
    const result = spawnSync(PINNED_GIT_EXECUTABLE, arguments_, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...environment,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_OPTIONAL_LOCKS: "0",
      },
      maxBuffer: 1024 * 1024,
      shell: false,
      timeout: 30_000,
    });
    if (
      result.error ||
      result.signal ||
      result.status !== 0 ||
      result.stdout !== "" ||
      result.stderr !== ""
    ) {
      throw new Error("La suite local dejó el worktree no limpio.");
    }
  }
}

function assertArtifactSecretFree({ artifactManifest, artifactRoot }) {
  let scannedBytes = 0;
  for (const entry of artifactManifest.files) {
    if (entry.size > MAX_SCANNED_FILE_BYTES) {
      throw new Error(
        "Un archivo del artifact excede el límite del secret scan.",
      );
    }
    scannedBytes += entry.size;
    if (scannedBytes > MAX_SCANNED_ARTIFACT_BYTES) {
      throw new Error("El artifact excede el límite total del secret scan.");
    }
    const bytes = readFileSync(path.join(artifactRoot, entry.path));
    if (bytes.length !== entry.size) {
      throw new Error("El artifact cambió durante el secret scan.");
    }
    if (bytes.includes(0)) continue;
    if (findKnownSecrets(bytes.toString("utf8")).length > 0) {
      throw new Error("El artifact contiene un patrón de secreto conocido.");
    }
  }
}

function assertArtifactLegalCopy({ artifactManifest, artifactRoot }) {
  const found = new Set();
  for (const entry of artifactManifest.files) {
    if (!entry.path.startsWith("server/") || entry.size === 0) continue;
    const bytes = readFileSync(path.join(artifactRoot, entry.path));
    if (bytes.includes(0)) continue;
    const source = bytes.toString("utf8");
    for (const required of REQUIRED_ARTIFACT_LEGAL_COPY) {
      if (source.includes(required)) found.add(required);
    }
  }
  if (found.size !== REQUIRED_ARTIFACT_LEGAL_COPY.length) {
    throw new Error(
      "El bundle SSR no contiene las versiones y frases legales honestas ES/EN esperadas.",
    );
  }
}

function assertSupabaseReceiptPasses({
  candidateIdentity,
  supabaseReceipt,
  now,
}) {
  assertD72SupabaseReadonlyReceipt(supabaseReceipt, {
    expectedHead: candidateIdentity.head,
    now,
  });
  const identityCreatedAt = canonicalInstant(
    candidateIdentity.createdAtUtc,
    "candidate.createdAtUtc",
  );
  const startedAt = canonicalInstant(
    supabaseReceipt.startedAtUtc,
    "supabase.startedAtUtc",
  );
  const completedAt = canonicalInstant(
    supabaseReceipt.completedAtUtc,
    "supabase.completedAtUtc",
  );
  if (
    PRODUCTION_DATE_GET_TIME(startedAt) <
      PRODUCTION_DATE_GET_TIME(identityCreatedAt) ||
    PRODUCTION_DATE_GET_TIME(completedAt) <
      PRODUCTION_DATE_GET_TIME(startedAt) ||
    !Array.isArray(supabaseReceipt.gates) ||
    supabaseReceipt.gates.some((gate) => gate.status !== EVIDENCE_STATUS.PASS)
  ) {
    throw new Error(
      "El receipt Supabase post-identity no acredita todos sus gates en PASS.",
    );
  }
}

function assertFrozenArtifactIdentity({
  artifactManifest,
  artifactRoot,
  candidateIdentity,
  repositoryRoot,
}) {
  const errors = validateExceptionalReleaseArtifact({
    artifactRoot,
    worktreeRoot: repositoryRoot,
    manifest: artifactManifest,
    expectedHead: candidateIdentity.head,
    expectedPolicyVersion: candidateIdentity.policyVersion,
    expectedPolicyHash: candidateIdentity.policyHash,
    expectedRequestHash: candidateIdentity.requestHash,
    expectedArtifactHash: candidateIdentity.artifactHash,
  });
  if (errors.length > 0) {
    throw new Error(
      "El artifact congelado no coincide con candidate identity.",
    );
  }
}

function readAndAssertCandidateConfiguration({ artifactRoot }) {
  const configuration = readWranglerConfiguration(
    path.join(artifactRoot, "wrangler.jsonc"),
  );
  if (validateWranglerConfiguration(configuration).length > 0) {
    throw new Error("wrangler.jsonc congelado no es el perfil OPEN canónico.");
  }
  assertExceptionalCutoverConfigurations(artifactRoot);
  return configuration;
}

export function validateD72CandidateAuthConfiguration(
  configuration,
  {
    variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
    repositoryRoot = REPOSITORY_ROOT,
  } = {},
) {
  const errors = [
    ...validateWranglerConfiguration(configuration),
    ...validatePublicBuildInventory(variables),
  ];
  if (errors.length > 0) return errors;
  const environment = Object.fromEntries(
    variables.map(({ name, value }) => [name, value]),
  );
  errors.push(
    ...socialProviderEvidenceBlockers(configuration, environment, variables),
    ...socialAuthConsentBlockers(environment, { root: repositoryRoot }),
  );
  return errors;
}

/**
 * Bloqueos por proveedor social: el flag del candidato tiene que coincidir con
 * el inventario público y, sólo si el proveedor está encendido, sus
 * ubicaciones de tratamiento (ES y EN) necesitan evidencia confirmada. Es una
 * función propia para poder probar el camino con Google encendido mientras
 * D97 lo apaga en el perfil abierto real: la policy de Wrangler no admite ese
 * candidato y `validateD72CandidateAuthConfiguration` no llega hasta acá.
 */
export function socialProviderEvidenceBlockers(
  configuration,
  environment,
  variables,
) {
  const errors = [];
  for (const provider of ["GOOGLE", "FACEBOOK"]) {
    const flag = `PUBLIC_${provider}_AUTH_ENABLED`;
    if (configuration.vars[flag] !== environment[flag])
      errors.push(
        `${flag} del candidato no coincide con el inventario público.`,
      );
    if (environment[flag] !== "true") continue;
    for (const name of [
      `PUBLIC_${provider}_PROCESSING_LOCATION`,
      `PUBLIC_${provider}_PROCESSING_LOCATION_EN`,
    ]) {
      const disclosure = variables.find((variable) => variable.name === name);
      if (
        disclosure.status !== "confirmed" ||
        disclosure.value.trim().length < 12
      ) {
        errors.push(
          `${name} requiere evidencia confirmada antes de certificar el proveedor activo.`,
        );
      }
    }
  }
  return errors;
}

function assertFrozenWorkerArtifact({ artifactRoot, configuration }) {
  if (
    validateCloudflareWorkerArtifact(
      path.join(artifactRoot, "dist"),
      configuration,
      { runtimeSecrets: {} },
    ).length > 0
  ) {
    throw new Error("El artifact Worker congelado no supera su validador.");
  }
}

async function observeArtifactPhase({
  artifactManifest,
  artifactRoot,
  candidateIdentity,
  phase,
  repositoryRoot,
}) {
  const observations = {};
  const identityStatus = await observeAuditor(
    () =>
      assertFrozenArtifactIdentity({
        artifactManifest,
        artifactRoot,
        candidateIdentity,
        repositoryRoot,
      }),
    EVIDENCE_STATUS.FAIL,
  );
  observations[`artifact.identity.${phase}`] = identityStatus;
  if (identityStatus !== EVIDENCE_STATUS.PASS) {
    for (const observationId of [
      `artifact.secret-scan.${phase}`,
      `artifact.legal-copy.${phase}`,
      `artifact.worker.${phase}`,
      `candidate.bindings.${phase}`,
      `candidate.domains.${phase}`,
      `candidate.crons.${phase}`,
      `candidate.configuration.${phase}`,
      `candidate.auth-providers.${phase}`,
      `candidate.ai.${phase}`,
    ]) {
      observations[observationId] = EVIDENCE_STATUS.NOT_VERIFIED;
    }
    return observations;
  }

  observations[`artifact.secret-scan.${phase}`] = await observeAuditor(
    () => assertArtifactSecretFree({ artifactManifest, artifactRoot }),
    EVIDENCE_STATUS.FAIL,
  );
  observations[`artifact.legal-copy.${phase}`] = await observeAuditor(
    () => assertArtifactLegalCopy({ artifactManifest, artifactRoot }),
    EVIDENCE_STATUS.FAIL,
  );

  let configuration;
  const configurationStatus = await observeAuditor(() => {
    configuration = readAndAssertCandidateConfiguration({ artifactRoot });
  }, EVIDENCE_STATUS.FAIL);
  observations[`candidate.configuration.${phase}`] = configurationStatus;
  for (const component of ["bindings", "domains", "crons", "ai"]) {
    observations[`candidate.${component}.${phase}`] =
      configurationStatus === EVIDENCE_STATUS.PASS
        ? EVIDENCE_STATUS.PASS
        : EVIDENCE_STATUS.NOT_VERIFIED;
  }
  observations[`candidate.auth-providers.${phase}`] =
    configurationStatus === EVIDENCE_STATUS.PASS
      ? await observeAuditor(() => {
          const errors = validateD72CandidateAuthConfiguration(configuration, {
            repositoryRoot,
          });
          if (errors.length > 0)
            throw new FactualGateMismatchError(
              "El candidato no acredita flags, destinos y consentimiento de sus proveedores Auth.",
            );
        }, EVIDENCE_STATUS.FAIL)
      : EVIDENCE_STATUS.NOT_VERIFIED;
  observations[`artifact.worker.${phase}`] =
    configurationStatus === EVIDENCE_STATUS.PASS
      ? await observeAuditor(
          () => assertFrozenWorkerArtifact({ artifactRoot, configuration }),
          EVIDENCE_STATUS.FAIL,
        )
      : EVIDENCE_STATUS.NOT_VERIFIED;
  configuration = undefined;
  return observations;
}

function runLocalSuiteAuditor({ repositoryRoot }) {
  const packageJsonText = readFileSync(
    path.join(repositoryRoot, "package.json"),
    "utf8",
  );
  const contractErrors = [
    ...validateExceptionalReleaseScriptContract(packageJsonText),
    ...validateReleaseOpenTestIsNonRecursive(packageJsonText),
  ];
  if (contractErrors.length > 0) {
    throw new Error("El contrato de suite local no coincide.");
  }
  const environment = {
    ...pinnedChildEnvironment(),
    ...installedPnpmStoreEnvironment(repositoryRoot),
  };
  for (const step of EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS) {
    const command =
      step.command === "pnpm"
        ? PINNED_PNPM_EXECUTABLE
        : step.command === process.execPath
          ? PINNED_NODE_EXECUTABLE
          : step.command;
    if (![PINNED_PNPM_EXECUTABLE, PINNED_NODE_EXECUTABLE].includes(command)) {
      throw new Error("La suite local contiene un ejecutable no fijado.");
    }
    runFixedCommand(command, step.arguments, {
      cwd: repositoryRoot,
      env: environment,
    });
  }
  assertGitWorktreeStillClean(repositoryRoot, environment);
}

function runLocalSecretScanAuditor({ repositoryRoot }) {
  const environment = {
    ...pinnedChildEnvironment(),
    ...installedPnpmStoreEnvironment(repositoryRoot),
  };
  runFixedCommand(PINNED_PNPM_EXECUTABLE, ["test.secrets"], {
    cwd: repositoryRoot,
    env: environment,
  });
  assertGitWorktreeStillClean(repositoryRoot, environment);
}

function assertCompositeEvidenceRedacted({ candidateIdentity, observations }) {
  if (
    !exactKeys(observations, D72_COMPOSITE_OBSERVATION_IDS) ||
    D72_COMPOSITE_OBSERVATION_IDS.some(
      (observationId) =>
        !ALLOWED_GATE_STATUSES.has(observations[observationId]),
    )
  ) {
    throw new Error("La evidencia compuesta no tiene forma cerrada.");
  }
  const sanitizedEvidence = canonicalJson({
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: candidateIdentity.contentSha256,
    head: candidateIdentity.head,
    observations: {
      ...observations,
      "evidence.redaction": EVIDENCE_STATUS.PASS,
    },
    policyHash: candidateIdentity.policyHash,
    rawOutputStored: false,
    requestHash: candidateIdentity.requestHash,
    secretValuesStored: false,
  });
  if (
    findKnownSecrets(sanitizedEvidence).length > 0 ||
    /"(?:stdout|stderr|token|password|secretValue|rawOutput)"\s*:/i.test(
      sanitizedEvidence,
    )
  ) {
    throw new Error("La evidencia compuesta no está saneada.");
  }
}

function wranglerDryRunContext({ artifactRoot }) {
  const emptyEnvironmentPath = path.join(
    artifactRoot,
    "exceptional-release-empty.env",
  );
  return {
    emptyEnvironmentPath,
    environment: pinnedChildEnvironment(),
  };
}

function runWranglerUploadDryRun({ artifactRoot, repositoryRoot }) {
  const { emptyEnvironmentPath, environment } = wranglerDryRunContext({
    artifactRoot,
  });
  runFixedCommand(
    PINNED_NODE_EXECUTABLE,
    [
      WRANGLER_ENTRYPOINT,
      "versions",
      "upload",
      "--config",
      path.join(artifactRoot, "wrangler.jsonc"),
      "--cwd",
      artifactRoot,
      "--env-file",
      emptyEnvironmentPath,
      "--dry-run",
      "--strict",
    ],
    { cwd: repositoryRoot, env: environment },
  );
}

function runWranglerCronDryRun({ artifactRoot, repositoryRoot }) {
  const { emptyEnvironmentPath, environment } = wranglerDryRunContext({
    artifactRoot,
  });
  runFixedCommand(
    PINNED_NODE_EXECUTABLE,
    [
      WRANGLER_ENTRYPOINT,
      "triggers",
      "deploy",
      "--config",
      path.join(artifactRoot, "wrangler.crons-open.jsonc"),
      "--cwd",
      artifactRoot,
      "--env-file",
      emptyEnvironmentPath,
      "--dry-run",
    ],
    { cwd: repositoryRoot, env: environment },
  );
}

async function collectCloudflareReadOnlySnapshot(fetchImpl) {
  let oauthToken = await loadWranglerOAuthToken({
    cwd: REPOSITORY_ROOT,
    env: pinnedChildEnvironment(),
    nodeExecutable: PINNED_NODE_EXECUTABLE,
    wranglerEntrypoint: WRANGLER_ENTRYPOINT,
  });
  try {
    return await collectCloudflareClosedState({
      fetchImpl,
      oauthToken,
    });
  } finally {
    oauthToken = undefined;
  }
}

function assertCloudflareComponent(snapshot, component) {
  try {
    validateD72CloudflareClosedStateComponent(snapshot, component);
  } catch (error) {
    if (!(error instanceof CloudflareStateFactualMismatchError)) throw error;
    throw new FactualGateMismatchError(
      `El componente Cloudflare ${component} difiere de la policy D72.`,
    );
  }
}

// Pure verification for the separate OPEN source. This never treats the
// source's disabled Google/absent Facebook binding as the candidate target.
export function assertD72OpenSourceCompositeSnapshot(
  snapshot,
  { candidateIdentity, artifactManifest, nowUtc },
) {
  const profile = d72ReleaseEvidenceProfile(candidateIdentity);
  if (
    profile.releaseMode !== "OPEN_UPDATE" ||
    artifactManifest?.releaseMode !== "OPEN_UPDATE" ||
    artifactManifest.openSourceBaselineSha256 !==
      profile.openSourceBaselineSha256
  )
    throw new Error(
      "La observación OPEN requiere identidad y artifact con el mismo baseline.",
    );
  validateCloudflareOpenSourceState(snapshot);
  return assertOpenReleaseBaselineMatches({
    baseline: artifactManifest.openSourceBaseline,
    expectedBaselineSha256: profile.openSourceBaselineSha256,
    snapshot,
    observedAtUtc: nowUtc,
    nowUtc,
  });
}

function isPathOutsideRepository(candidate) {
  const relative = path.relative(REPOSITORY_ROOT, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
  );
}

function assertCanonicalAbsolutePath(candidate, label) {
  if (
    typeof candidate !== "string" ||
    !path.isAbsolute(candidate) ||
    path.resolve(candidate) !== candidate ||
    candidate.includes("\0")
  ) {
    throw new Error(`${label} debe ser una ruta absoluta canónica.`);
  }
  return candidate;
}

function createDnsAuditChildInvocation({ dnsTokenFile, outputRoot }) {
  assertCanonicalAbsolutePath(dnsTokenFile, "dnsTokenFile");
  assertCanonicalAbsolutePath(outputRoot, "outputRoot DNS");
  if (!isPathOutsideRepository(outputRoot)) {
    throw new Error(
      "El output DNS temporal debe quedar fuera del repositorio.",
    );
  }
  return Object.freeze({
    command: PINNED_NODE_EXECUTABLE,
    arguments: Object.freeze([
      DNS_AUDIT_ENTRYPOINT,
      "--token-file",
      dnsTokenFile,
      "--output-root",
      outputRoot,
    ]),
  });
}

function escapeRegularExpression(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertDnsAuditChildResult(result, { outputRoot }) {
  assertCanonicalAbsolutePath(outputRoot, "outputRoot DNS");
  if (
    !result ||
    typeof result !== "object" ||
    result.error !== undefined ||
    result.signal !== null ||
    result.status !== 0 ||
    typeof result.stdout !== "string" ||
    result.stderr !== ""
  ) {
    throw new Error("El auditor DNS --token-file no terminó PASS.");
  }
  const outputDirectoryPattern = new RegExp(
    `^Auditoría DNS guardada fuera del repositorio: ${escapeRegularExpression(
      outputRoot,
    )}/[0-9]{8}T[0-9]{6}Z$`,
  );
  const lines = result.stdout.split("\n");
  const expectedRecordCount = EXPECTED_NON_WEB_DNS_RECORD_COUNT + 2;
  if (
    lines.length !== 5 ||
    lines[4] !== "" ||
    !outputDirectoryPattern.test(lines[0]) ||
    !/^DNS snapshot SHA-256: [0-9a-f]{64}$/.test(lines[1]) ||
    lines[2] !== `Registros: ${expectedRecordCount}; web Custom Domains: 2.` ||
    lines[3] !==
      `Auditoría DNS: PASS (cloudflare-custom-domains; ${EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION}; non-web SHA-256 ${EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256}).`
  ) {
    throw new Error(
      "El auditor DNS --token-file devolvió una salida no canónica.",
    );
  }
  return Object.freeze({
    recordCount: expectedRecordCount,
    snapshotSha256: lines[1].slice("DNS snapshot SHA-256: ".length),
    webRecordCount: 2,
  });
}

export function createTestD72DnsAuditChildInvocation(options = {}) {
  if (
    !exactKeys(options, ["dnsTokenFile", "outputRoot", "testOnly"]) ||
    options.testOnly !== true
  ) {
    throw new Error(
      "El builder DNS fixture exige testOnly=true, dnsTokenFile y outputRoot.",
    );
  }
  return createDnsAuditChildInvocation(options);
}

export function assertTestD72DnsAuditChildResult(options = {}) {
  if (
    !exactKeys(options, ["outputRoot", "result", "testOnly"]) ||
    options.testOnly !== true
  ) {
    throw new Error(
      "El parser DNS fixture exige testOnly=true, outputRoot y result.",
    );
  }
  return assertDnsAuditChildResult(options.result, options);
}

async function runDnsReadOnlyAuditor({ dnsTokenFile, fetchImpl }) {
  const outputRoot = mkdtempSync(DNS_AUDIT_TEMPORARY_PREFIX);
  chmodSync(outputRoot, 0o700);
  try {
    const stats = lstatSync(outputRoot);
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      (stats.mode & 0o7777) !== 0o700 ||
      (typeof process.getuid === "function" && stats.uid !== process.getuid())
    ) {
      throw new Error("El output DNS temporal no quedó aislado.");
    }
    const invocation = createDnsAuditChildInvocation({
      dnsTokenFile,
      outputRoot,
    });
    const result = spawnSync(invocation.command, invocation.arguments, {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: pinnedChildEnvironment(),
      maxBuffer: MAX_DNS_AUDIT_OUTPUT_BYTES,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2 * 60_000,
    });
    assertDnsAuditChildResult(result, { outputRoot });
  } finally {
    rmSync(outputRoot, { force: true, recursive: true });
  }
  await Promise.all([
    verifyPublicWorkerDns({ fetchImpl, hostname: "agorbis.com" }),
    verifyPublicWorkerDns({ fetchImpl, hostname: "www.agorbis.com" }),
  ]);
}

async function observeAuditor(auditor, failureStatus) {
  try {
    await auditor();
    return EVIDENCE_STATUS.PASS;
  } catch (error) {
    return error instanceof FactualGateMismatchError
      ? EVIDENCE_STATUS.FAIL
      : failureStatus;
  }
}

function combinedEvidenceStatus(statuses) {
  if (statuses.includes(EVIDENCE_STATUS.FAIL)) return EVIDENCE_STATUS.FAIL;
  if (statuses.every((status) => status === EVIDENCE_STATUS.PASS)) {
    return EVIDENCE_STATUS.PASS;
  }
  return EVIDENCE_STATUS.NOT_VERIFIED;
}

function combinedObservationStatus(observations, dependencies) {
  return combinedEvidenceStatus(
    dependencies.map((dependency) => observations[dependency]),
  );
}

export function deriveD72CompositeSourceStatuses(observations) {
  if (
    !exactKeys(observations, D72_COMPOSITE_OBSERVATION_IDS) ||
    D72_COMPOSITE_OBSERVATION_IDS.some(
      (observationId) =>
        !ALLOWED_GATE_STATUSES.has(observations[observationId]),
    )
  ) {
    throw new Error(
      "Las observaciones compuestas deben cubrir exactamente las fuentes granulares con estados factuales.",
    );
  }
  return deepFreeze(
    Object.fromEntries(
      D72_COMPOSITE_NON_STATEFUL_GATE_IDS.map((gateId) => [
        gateId,
        Object.fromEntries(
          sourceIdsForGate(gateId).map((sourceId) => [
            sourceId,
            combinedObservationStatus(
              observations,
              D72_COMPOSITE_SOURCE_DEPENDENCIES_BY_GATE[gateId][sourceId],
            ),
          ]),
        ),
      ]),
    ),
  );
}

export function deriveD72CompositeGateStatuses(observations) {
  const sourceStatusesByGate = deriveD72CompositeSourceStatuses(observations);
  return Object.freeze(
    Object.fromEntries(
      D72_COMPOSITE_NON_STATEFUL_GATE_IDS.map((gateId) => [
        gateId,
        combinedEvidenceStatus(
          sourceIdsForGate(gateId).map(
            (sourceId) => sourceStatusesByGate[gateId][sourceId],
          ),
        ),
      ]),
    ),
  );
}

export function collectTestD72NonStatefulCompositeReceipt(options) {
  if (
    !exactKeys(options, [
      "candidateIdentity",
      "completedAtUtc",
      "observations",
      "startedAtUtc",
    ])
  ) {
    throw new Error(
      "El collector testOnly exige exactamente identity, ventana y observaciones granulares.",
    );
  }
  const candidateIdentity = assertCandidateIdentityShape(
    options.candidateIdentity,
  );
  if (TEST_COLLECTED_IDENTITIES.has(candidateIdentity)) {
    throw new Error(
      "La candidate identity testOnly ya consumió su única corrida compuesta.",
    );
  }
  TEST_COLLECTED_IDENTITIES.add(candidateIdentity);
  const sourceStatusesByGate = deriveD72CompositeSourceStatuses(
    options.observations,
  );
  return issueReceipt({
    candidateIdentity,
    completedAtUtc: options.completedAtUtc,
    gates: normalizedSourceStatuses(sourceStatusesByGate),
    startedAtUtc: options.startedAtUtc,
    testOnly: true,
  });
}

export async function collectD72NonStatefulCompositeReceipt(options) {
  if (
    !exactKeys(options, [
      "artifactManifest",
      "artifactRoot",
      "candidateIdentity",
      "dnsTokenFile",
      "repositoryRoot",
      "supabaseReceipt",
    ])
  ) {
    throw new Error(
      "El issuer productivo compuesto acepta sólo identity, artifact y autoridades read-only fijadas; no acepta mapas ni callbacks.",
    );
  }
  if (
    process.versions.node !== PINNED_NODE_VERSION ||
    options.repositoryRoot !== REPOSITORY_ROOT ||
    typeof options.artifactRoot !== "string" ||
    !path.isAbsolute(options.artifactRoot) ||
    typeof options.dnsTokenFile !== "string" ||
    options.dnsTokenFile !== PINNED_DNS_TOKEN_FILE
  ) {
    throw new Error(
      "El issuer productivo compuesto recibió un runtime/path inválido.",
    );
  }
  const candidateIdentity = assertCandidateIdentityShape(
    options.candidateIdentity,
  );
  const startedAt = new PRODUCTION_DATE(PRODUCTION_DATE_NOW());
  const identityCreatedAt = canonicalInstant(
    candidateIdentity.createdAtUtc,
    "candidate.createdAtUtc",
  );
  const identityExpiresAt = canonicalInstant(
    candidateIdentity.expiresAtUtc,
    "candidate.expiresAtUtc",
  );
  if (
    PRODUCTION_DATE_GET_TIME(startedAt) <
      PRODUCTION_DATE_GET_TIME(identityCreatedAt) ||
    PRODUCTION_DATE_GET_TIME(startedAt) >
      PRODUCTION_DATE_GET_TIME(identityExpiresAt)
  ) {
    throw new Error(
      "Candidate identity no está vigente al iniciar el collector.",
    );
  }
  // Runtime, fetch y toolchain se acreditan antes de consumir la capability.
  // Un rechazo aquí no invalida una identity que nunca llegó al primer auditor.
  assertD72CompositeProductionRuntime();
  if (PRODUCTION_COLLECTED_IDENTITIES.has(candidateIdentity)) {
    throw new Error(
      "La candidate identity ya consumió su única corrida compuesta; se exige request y artifact nuevos.",
    );
  }
  // Consumir antes del primer auditor impide reintentar una corrida con
  // blockers hasta obtener PASS usando la misma identity/request/artifact.
  PRODUCTION_COLLECTED_IDENTITIES.add(candidateIdentity);

  const observations = Object.fromEntries(
    D72_COMPOSITE_OBSERVATION_IDS.map((observationId) => [
      observationId,
      EVIDENCE_STATUS.NOT_VERIFIED,
    ]),
  );
  Object.assign(
    observations,
    await observeArtifactPhase({
      artifactManifest: options.artifactManifest,
      artifactRoot: options.artifactRoot,
      candidateIdentity,
      phase: "before",
      repositoryRoot: options.repositoryRoot,
    }),
  );
  observations["local.suite"] = await observeAuditor(
    () => runLocalSuiteAuditor({ repositoryRoot: options.repositoryRoot }),
    EVIDENCE_STATUS.FAIL,
  );
  observations["local.secret-scan"] = await observeAuditor(
    () => runLocalSecretScanAuditor({ repositoryRoot: options.repositoryRoot }),
    EVIDENCE_STATUS.FAIL,
  );
  observations["remote.supabase-legal"] = await observeAuditor(
    () =>
      assertSupabaseReceiptPasses({
        candidateIdentity,
        supabaseReceipt: options.supabaseReceipt,
        now: new PRODUCTION_DATE(PRODUCTION_DATE_NOW()),
      }),
    EVIDENCE_STATUS.NOT_VERIFIED,
  );
  let cloudflareSnapshot;
  try {
    cloudflareSnapshot =
      await collectCloudflareReadOnlySnapshot(PRODUCTION_FETCH);
  } catch {
    cloudflareSnapshot = undefined;
  }
  for (const component of CLOUDFLARE_CLOSED_STATE_COMPONENTS) {
    observations[`remote.cloudflare.${component}`] = cloudflareSnapshot
      ? await observeAuditor(
          () =>
            candidateIdentity.releaseMode === "OPEN_UPDATE"
              ? assertD72OpenSourceCompositeSnapshot(cloudflareSnapshot, {
                  candidateIdentity,
                  artifactManifest: options.artifactManifest,
                  nowUtc: PRODUCTION_DATE_TO_ISO(
                    new PRODUCTION_DATE(PRODUCTION_DATE_NOW()),
                  ),
                })
              : assertCloudflareComponent(cloudflareSnapshot, component),
          EVIDENCE_STATUS.NOT_VERIFIED,
        )
      : EVIDENCE_STATUS.NOT_VERIFIED;
  }
  cloudflareSnapshot = undefined;
  observations["remote.dns"] = await observeAuditor(
    () =>
      runDnsReadOnlyAuditor({
        dnsTokenFile: options.dnsTokenFile,
        fetchImpl: PRODUCTION_FETCH,
      }),
    EVIDENCE_STATUS.NOT_VERIFIED,
  );
  observations["remote.auth-providers"] = await observeAuditor(
    () => assertAuthProvidersAligned(PRODUCTION_FETCH),
    EVIDENCE_STATUS.NOT_VERIFIED,
  );
  observations["dry-run.upload"] =
    observations["candidate.configuration.before"] === EVIDENCE_STATUS.PASS
      ? await observeAuditor(
          () =>
            runWranglerUploadDryRun({
              artifactRoot: options.artifactRoot,
              repositoryRoot: options.repositoryRoot,
            }),
          EVIDENCE_STATUS.FAIL,
        )
      : EVIDENCE_STATUS.NOT_VERIFIED;
  observations["dry-run.crons"] =
    observations["candidate.crons.before"] === EVIDENCE_STATUS.PASS
      ? await observeAuditor(
          () =>
            runWranglerCronDryRun({
              artifactRoot: options.artifactRoot,
              repositoryRoot: options.repositoryRoot,
            }),
          EVIDENCE_STATUS.FAIL,
        )
      : EVIDENCE_STATUS.NOT_VERIFIED;
  Object.assign(
    observations,
    await observeArtifactPhase({
      artifactManifest: options.artifactManifest,
      artifactRoot: options.artifactRoot,
      candidateIdentity,
      phase: "after",
      repositoryRoot: options.repositoryRoot,
    }),
  );
  observations["evidence.redaction"] = await observeAuditor(
    () => assertCompositeEvidenceRedacted({ candidateIdentity, observations }),
    EVIDENCE_STATUS.FAIL,
  );

  if (!exactKeys(observations, D72_COMPOSITE_OBSERVATION_IDS)) {
    throw new Error(
      "El collector no produjo todas las observaciones granulares.",
    );
  }

  const sourceStatusesByGate = deriveD72CompositeSourceStatuses(observations);
  const completedAt = new PRODUCTION_DATE(PRODUCTION_DATE_NOW());
  const receipt = issueReceipt({
    candidateIdentity,
    completedAtUtc: PRODUCTION_DATE_TO_ISO(completedAt),
    gates: normalizedSourceStatuses(sourceStatusesByGate),
    startedAtUtc: PRODUCTION_DATE_TO_ISO(startedAt),
    testOnly: false,
  });
  if (findKnownSecrets(JSON.stringify(receipt)).length > 0) {
    throw new Error("El receipt compuesto saneado activó el secret scan.");
  }
  return receipt;
}
