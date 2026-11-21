// Synthetic D72 fixtures; importing this file never uses HTTP or child processes.
import path from "node:path";
import {
  D72_CANARY_EXPECTED_SECRET_NAMES,
  D72_CANARY_NODE_VERSION,
  D72_CANARY_WRANGLER_VERSION,
} from "./d72-canary-policy.mjs";
import {
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
  exceptionalReleaseArtifactHash,
} from "./exceptional-release-artifact.mjs";
import {
  EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY,
} from "./exceptional-wrangler-integrity.mjs";
import {
  createD72CandidateIdentity,
  createD72NonStatefulEvidenceCertification,
} from "./d72-non-waivable-evidence-policy.mjs";
import {
  NON_STATEFUL_GATE_IDS,
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EVIDENCE_STATUS,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

const head = "0123456789abcdef0123456789abcdef01234567";
const requestHash = "a".repeat(64);
const policyHash = RELEASE_GATE_POLICY_SHA256;
const statefulManifestHash = "d".repeat(64);
const canaryId = "d72-canary-01234567";
const closedDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const closedVersionId = "11111111-1111-4111-8111-111111111111";
const canaryVersionId = "22222222-2222-4222-8222-222222222222";
const differentVersionId = "33333333-3333-4333-8333-333333333333";
const root = "/repo/agorbis";
const artifactRoot = "/evidence/d72.artifact";
const nodeExecutable = "/runtime/node";
const existingSecret = "fixture-cron-secret-0123456789abcdef0123456789abcdef";
const canaryCapabilityIssuedAtUtc = "2026-08-31T12:00:00.000Z";
const canaryCapabilityExpiresAtUtc = "2026-08-31T12:20:00.000Z";
const canaryCapabilityNonce = "e".repeat(64);
const capabilityNow = new Date(canaryCapabilityIssuedAtUtc);
const wrangler = path.join(
  root,
  "node_modules",
  "wrangler",
  "wrangler-dist",
  "cli.js",
);

const artifactManifestPayload = {
  schemaVersion: EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  createdAtUtc: "2026-08-31T11:25:00.000Z",
  files: [
    ["dist/_worker.js", 1, "1".repeat(64)],
    [
      "exceptional-release-empty.env",
      0,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ],
    ["server/index.mjs", 1, "2".repeat(64)],
    ["wrangler.crons-closed.jsonc", 1, "3".repeat(64)],
    ["wrangler.crons-open.jsonc", 1, "4".repeat(64)],
    ["wrangler.jsonc", 1, "5".repeat(64)],
    ["wrangler.traffic.jsonc", 1, "6".repeat(64)],
  ]
    .map(([filePath, size, sha256]) => ({ path: filePath, sha256, size }))
    .sort((left, right) => left.path.localeCompare(right.path)),
  head,
  nodeVersion: EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  policyHash,
  policyVersion: RELEASE_GATE_POLICY_VERSION,
  requestHash,
  wranglerClosureHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
  wranglerEntrypointHash: EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  wranglerLockHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash,
  wranglerVersion: EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
};
const artifactManifest = Object.freeze({
  ...artifactManifestPayload,
  contentSha256: exceptionalReleaseArtifactHash(artifactManifestPayload),
});
const artifactHash = artifactManifest.contentSha256;
const uploadPayloadHash = "5".repeat(64);

function standardEnvelope(result) {
  return { errors: [], messages: [], result, success: true };
}

function observability() {
  return {
    enabled: false,
    head_sampling_rate: 1,
    logs: {
      enabled: true,
      head_sampling_rate: 1,
      invocation_logs: false,
      persist: true,
    },
    redact_query_string: false,
    traces: { enabled: false, head_sampling_rate: 1, persist: true },
  };
}

function customDomain(hostname, id, certId) {
  return {
    cert_id: certId,
    enabled: true,
    environment: "production",
    hostname,
    id,
    previews_enabled: false,
    service: "agorbis",
    zone_id: "1649628cde7b43fc40bceaca54d02e16",
    zone_name: "agorbis.com",
  };
}

function closedStateSnapshot() {
  const secretBindings = D72_CANARY_EXPECTED_SECRET_NAMES.map((name) => ({
    name,
    type: "secret_text",
  }));
  const plaintextBindings = [
    ["AGORBIS_LAUNCH_MODE", "closed"],
    ["AGORBIS_RUNTIME", "cloudflare-workers"],
    ["PUBLIC_FACEBOOK_AUTH_ENABLED", "false"],
    ["PUBLIC_GOOGLE_AUTH_ENABLED", "false"],
    ["PUBLIC_SITE_URL", "https://agorbis.com"],
    [
      "PUBLIC_SUPABASE_ANON_KEY",
      "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
    ],
    ["PUBLIC_SUPABASE_URL", "https://ibtvlvpxwourrxwcrfkf.supabase.co"],
    ["TURNSTILE_HOSTNAMES", "agorbis.com"],
  ].map(([name, text]) => ({ name, text, type: "plain_text" }));
  const domains = [
    customDomain(
      "agorbis.com",
      "1".repeat(40),
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ),
    customDomain(
      "www.agorbis.com",
      "2".repeat(40),
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ),
  ];
  return {
    accountSettings: standardEnvelope({
      default_usage_model: "standard",
      green_compute: false,
    }),
    deployments: standardEnvelope({
      deployments: [
        {
          annotations: { "workers/triggered_by": "deployment" },
          author_email: "operator@example.test",
          created_on: "2026-08-31T11:00:00.000Z",
          id: closedDeploymentId,
          source: "wrangler",
          strategy: "percentage",
          versions: [{ percentage: 100, version_id: closedVersionId }],
        },
      ],
    }),
    settings: standardEnvelope({
      annotations: { "workers/triggered_by": "version_upload" },
      bindings: [
        ...plaintextBindings,
        { name: "ASSETS", type: "assets" },
        ...secretBindings,
      ],
      compatibility_date: "2026-08-25",
      compatibility_flags: ["nodejs_compat"],
      limits: { cpu_ms: 30_000 },
      logpush: false,
      observability: observability(),
      placement: {},
      tags: [],
      tail_consumers: [],
      usage_model: "standard",
    }),
    schedules: standardEnvelope({ schedules: [] }),
    secrets: standardEnvelope(secretBindings),
    subdomain: standardEnvelope({ enabled: false, previews_enabled: false }),
    domains: {
      errors: null,
      messages: null,
      result: domains,
      result_info: { count: 2, page: 1, per_page: 2, total_count: 2 },
      success: true,
    },
    routes: standardEnvelope([]),
    scripts: standardEnvelope([
      {
        compatibility_date: "2026-08-25",
        compatibility_flags: ["nodejs_compat"],
        created_on: "2026-08-30T10:00:00.000Z",
        deployment_id: closedDeploymentId,
        etag: "7".repeat(64),
        handlers: ["fetch", "scheduled"],
        has_assets: true,
        has_modules: true,
        id: "agorbis",
        last_deployed_from: "wrangler",
        limits: { cpu_ms: 30_000 },
        logpush: false,
        modified_on: "2026-08-31T11:00:00.000Z",
        observability: observability(),
        routes: null,
        tag: "8".repeat(32),
        tags: [],
        tail_consumers: null,
        usage_model: "standard",
      },
      { id: "unrelated-worker" },
    ]),
  };
}

function attachedAtZeroStateSnapshot() {
  const snapshot = closedStateSnapshot();
  snapshot.deployments.result.deployments[0] = {
    ...snapshot.deployments.result.deployments[0],
    created_on: "2026-08-31T11:55:00.000Z",
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    versions: [
      { percentage: 100, version_id: closedVersionId },
      { percentage: 0, version_id: canaryVersionId },
    ],
  };
  return snapshot;
}

function candidateVersionResponse(uploadPlan, overrides = {}) {
  const bindings = [
    { name: "AGORBIS_LAUNCH_MODE", text: "open", type: "plain_text" },
    {
      name: "AGORBIS_RUNTIME",
      text: "cloudflare-workers",
      type: "plain_text",
    },
    { name: "ASSETS", type: "assets" },
    { name: "CRON_SECRET", type: "secret_text" },
    {
      name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
      text: "false",
      type: "plain_text",
    },
    {
      name: "PUBLIC_GOOGLE_AUTH_ENABLED",
      text: "true",
      type: "plain_text",
    },
    {
      name: "PUBLIC_SITE_URL",
      text: "https://agorbis.com",
      type: "plain_text",
    },
    {
      name: "PUBLIC_SUPABASE_ANON_KEY",
      text: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
      type: "plain_text",
    },
    {
      name: "PUBLIC_SUPABASE_URL",
      text: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
      type: "plain_text",
    },
    { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
    {
      name: "TURNSTILE_HOSTNAMES",
      text: "agorbis.com",
      type: "plain_text",
    },
    { name: "TURNSTILE_SECRET", type: "secret_text" },
  ];
  const result = {
    annotations: {
      "workers/message": uploadPlan.upload.arguments.at(-1),
      "workers/tag": `d72-canary-${head}`,
      "workers/triggered_by": "wrangler",
    },
    id: canaryVersionId,
    metadata: {
      created_on: "2026-08-31T11:52:59.000000Z",
      has_preview: false,
      source: "wrangler",
    },
    number: 99,
    resources: {
      bindings,
      script: {
        etag: "9".repeat(64),
        handlers: ["fetch", "scheduled"],
        last_deployed_from: "wrangler",
        named_handlers: [],
      },
      script_runtime: {
        compatibility_date: "2026-08-25",
        compatibility_flags: ["nodejs_compat"],
        limits: { cpu_ms: 30_000 },
        usage_model: "standard",
      },
    },
    startup_time_ms: 11,
    ...overrides,
  };
  return standardEnvelope(result);
}

function nonStatefulEvidence() {
  const catalog = new Map(
    NON_WAIVABLE_GATE_EVIDENCE_CATALOG.map((entry) => [entry.gateId, entry]),
  );
  return Object.fromEntries(
    NON_STATEFUL_GATE_IDS.map((gateId, gateIndex) => [
      gateId,
      catalog.get(gateId).sourceIds.map((sourceId, sourceIndex) => ({
        sourceId,
        status: EVIDENCE_STATUS.PASS,
        digest: (gateIndex * 100 + sourceIndex + 1)
          .toString(16)
          .padStart(64, "0"),
        observedAtUtc: "2026-08-31T11:45:00.000Z",
      })),
    ]),
  );
}

const candidateIdentity = createD72CandidateIdentity({
  testOnly: true,
  head,
  originMain: head,
  leftCount: 0,
  rightCount: 0,
  worktreeClean: true,
  diffCheckClean: true,
  requestHash,
  artifactHash,
  createdAtUtc: "2026-08-31T11:30:00.000Z",
  expiresAtUtc: "2026-08-31T12:30:00.000Z",
});
const nonStatefulCertification = createD72NonStatefulEvidenceCertification({
  testOnly: true,
  candidateIdentity,
  runId: "12345678-1234-4234-9234-123456789abc",
  startedAtUtc: "2026-08-31T11:35:00.000Z",
  completedAtUtc: "2026-08-31T11:45:00.000Z",
  expiresAtUtc: "2026-08-31T12:30:00.000Z",
  sourceEvidenceByGate: nonStatefulEvidence(),
});

const basePlanOptions = {
  repositoryRoot: root,
  artifactRoot,
  nodeExecutable,
  nodeVersion: D72_CANARY_NODE_VERSION,
  wranglerVersion: D72_CANARY_WRANGLER_VERSION,
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryId,
  closedDeploymentId,
  closedVersionId,
};

export {
  head,
  requestHash,
  policyHash,
  statefulManifestHash,
  canaryId,
  closedDeploymentId,
  closedVersionId,
  canaryVersionId,
  differentVersionId,
  root,
  artifactRoot,
  nodeExecutable,
  existingSecret,
  canaryCapabilityIssuedAtUtc,
  canaryCapabilityExpiresAtUtc,
  canaryCapabilityNonce,
  capabilityNow,
  wrangler,
  artifactManifestPayload,
  artifactManifest,
  artifactHash,
  uploadPayloadHash,
  standardEnvelope,
  observability,
  customDomain,
  closedStateSnapshot,
  attachedAtZeroStateSnapshot,
  candidateVersionResponse,
  nonStatefulEvidence,
  candidateIdentity,
  nonStatefulCertification,
  basePlanOptions,
};
