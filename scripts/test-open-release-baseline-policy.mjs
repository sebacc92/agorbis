import assert from "node:assert/strict";
import {
  CLOUDFLARE_CLOSED_STATE_CONSTANTS,
  CLOUDFLARE_STATE_CONSTANTS,
  validateCloudflareOpenState,
  validateCloudflareOpenSourceState,
} from "./cloudflare-closed-state.mjs";
import {
  OPEN_RELEASE_BASELINE_SCHEMA_VERSION,
  OPEN_RELEASE_BASELINE_PROFILE,
  OPEN_RELEASE_BASELINE_MAX_AGE_MS,
  createOpenReleaseBaselineCandidate,
  assertOpenReleaseBaselineMatches,
} from "./open-release-baseline-policy.mjs";

const { accountId, secretNamesByStage, workerName, zoneId, zoneName } =
  CLOUDFLARE_CLOSED_STATE_CONSTANTS;
const { openCrons } = CLOUDFLARE_STATE_CONSTANTS;
const activeDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activeVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Synthetic Cloudflare envelopes: no network or production observations.
function standardEnvelope(result) {
  return { errors: [], messages: [], result, success: true };
}

function observability() {
  return {
    enabled: false,
    head_sampling_rate: 1,
    redact_query_string: false,
    logs: {
      enabled: true,
      head_sampling_rate: 1,
      invocation_logs: false,
      persist: true,
    },
    traces: { enabled: false, head_sampling_rate: 1, persist: true },
  };
}

const plaintextBindings = Object.freeze([
  {
    name: "AGORBIS_LAUNCH_MODE",
    text: "closed",
    type: "plain_text",
  },
  {
    name: "AGORBIS_RUNTIME",
    text: "cloudflare-workers",
    type: "plain_text",
  },
  {
    name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
    text: "false",
    type: "plain_text",
  },
  {
    name: "PUBLIC_GOOGLE_AUTH_ENABLED",
    text: "false",
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
  {
    name: "TURNSTILE_HOSTNAMES",
    text: "agorbis.com",
    type: "plain_text",
  },
]);

function domain(hostname, id, certId) {
  return {
    cert_id: certId,
    enabled: true,
    environment: "production",
    hostname,
    id,
    previews_enabled: false,
    service: workerName,
    zone_id: zoneId,
    zone_name: zoneName,
  };
}

function makeSnapshot({
  phase = "workers-dev",
  profile = "closed",
  secretStage = "none",
} = {}) {
  const secretNames = secretNamesByStage[secretStage];
  const secretBindings = secretNames.map((name) => ({
    name,
    type: "secret_text",
  }));
  const domains =
    phase === "custom-domains"
      ? [
          domain(
            "agorbis.com",
            "1111111111111111111111111111111111111111",
            "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          ),
          domain(
            "www.agorbis.com",
            "2222222222222222222222222222222222222222",
            "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          ),
        ]
      : [];
  const profilePlaintextBindings = plaintextBindings.map((entry) => ({
    ...entry,
    text:
      entry.name === "AGORBIS_LAUNCH_MODE"
        ? profile
        : entry.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
          ? profile === "open"
            ? "true"
            : "false"
          : entry.text,
  }));
  const schedules =
    profile === "open"
      ? openCrons.map((cron) => ({
          created_on: "2026-08-26T00:11:35.373556Z",
          cron,
          modified_on: "2026-08-26T00:11:37.000000Z",
        }))
      : [];
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
          created_on: "2026-08-26T00:11:35.373556Z",
          id: activeDeploymentId,
          source: "wrangler",
          strategy: "percentage",
          versions: [{ percentage: 100, version_id: activeVersionId }],
        },
      ],
    }),
    settings: standardEnvelope({
      annotations: { "workers/triggered_by": "version_upload" },
      bindings: [
        ...profilePlaintextBindings,
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
    schedules: standardEnvelope({ schedules }),
    secrets: standardEnvelope(
      secretNames.map((name) => ({ name, type: "secret_text" })),
    ),
    subdomain: standardEnvelope({
      enabled: phase === "workers-dev",
      previews_enabled: false,
    }),
    domains: {
      errors: null,
      messages: null,
      result: domains,
      result_info: {
        count: domains.length,
        page: 1,
        per_page: domains.length,
        total_count: domains.length,
      },
      success: true,
    },
    routes: standardEnvelope([]),
    scripts: standardEnvelope([
      {
        compatibility_date: "2026-08-25",
        compatibility_flags: ["nodejs_compat"],
        created_on: "2026-08-25T23:32:23.948185Z",
        deployment_id: "",
        etag: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        handlers: ["fetch", "scheduled"],
        has_assets: true,
        has_modules: true,
        id: workerName,
        last_deployed_from: "wrangler",
        limits: { cpu_ms: 30_000 },
        logpush: false,
        modified_on: "2026-08-26T00:11:37.000000Z",
        observability: observability(),
        routes: null,
        tag: "ffffffffffffffffffffffffffffffff",
        tags: [],
        tail_consumers: null,
        usage_model: "standard",
      },
      { id: "unrelated-worker" },
    ]),
  };
}

function sourceSnapshot() {
  const snapshot = makeSnapshot({
    phase: "custom-domains",
    profile: "open",
    secretStage: "complete",
  });
  snapshot.settings.result.bindings = snapshot.settings.result.bindings.filter(
    ({ name }) => name !== "PUBLIC_FACEBOOK_AUTH_ENABLED",
  );
  snapshot.settings.result.bindings.find(
    ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
  ).text = "false";
  return snapshot;
}

const observedAtUtc = "2026-09-09T00:00:00.000Z";
const expiresAtUtc = "2026-09-09T01:00:00.000Z";
const nowUtc = "2026-09-09T00:05:00.000Z";
const snapshot = sourceSnapshot();
const original = structuredClone(snapshot);
const candidate = createOpenReleaseBaselineCandidate({
  snapshot,
  observedAtUtc,
  expiresAtUtc,
  nowUtc,
});
assert.deepEqual(snapshot, original);
assert.equal(candidate.status, "REVIEW_REQUIRED");
assert.equal(candidate.executionAllowed, false);
assert.equal(
  candidate.baseline.schemaVersion,
  OPEN_RELEASE_BASELINE_SCHEMA_VERSION,
);
assert.equal(candidate.baseline.profile, OPEN_RELEASE_BASELINE_PROFILE);
assert.equal(OPEN_RELEASE_BASELINE_MAX_AGE_MS, 3_600_000);
assert.equal(candidate.baseline.accountId, accountId);
assert.equal(candidate.baseline.versionId, activeVersionId);
assert.equal(candidate.baseline.deploymentId, activeDeploymentId);
assert.equal(candidate.baseline.percentage, 100);
assert.deepEqual(candidate.baseline.crons, [...openCrons].sort());
assert.deepEqual(
  candidate.baseline.secretNames,
  [...secretNamesByStage.complete].sort(),
);
assert.deepEqual(
  candidate.baseline.domains.map(({ hostname }) => hostname),
  ["agorbis.com", "www.agorbis.com"],
);
assert.match(candidate.baselineSha256, /^[a-f0-9]{64}$/);
assert.equal(
  Object.isFrozen(candidate.baseline.configuration.settings.bindings[0]),
  true,
);
assert.equal(Object.isFrozen(candidate.baseline.domains), true);
assert.throws(() => {
  candidate.baseline.percentage = 50;
}, TypeError);
assert.doesNotMatch(
  JSON.stringify(candidate),
  /operator@example|author_email|workers\/triggered_by|authorization|oauthToken|secret_text[^}]*text/,
);
const baselineArgs = {
  baseline: candidate.baseline,
  expectedBaselineSha256: candidate.baselineSha256,
  snapshot,
  observedAtUtc: nowUtc,
  nowUtc,
};
const result = assertOpenReleaseBaselineMatches(baselineArgs);
assert.equal(result.status, "BASELINE_MATCHED");
assert.equal(result.executionAllowed, false);
assert.equal(Object.isFrozen(result), true);
assert.equal(result.versionId, activeVersionId);

// Source and destination are deliberately different fixed contracts.
assert.doesNotThrow(() => validateCloudflareOpenSourceState(snapshot));
assert.throws(() => validateCloudflareOpenState(snapshot));
const destination = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
assert.doesNotThrow(() => validateCloudflareOpenState(destination));
assert.throws(() => validateCloudflareOpenSourceState(destination));
assert.throws(() =>
  createOpenReleaseBaselineCandidate({
    snapshot: destination,
    observedAtUtc,
    expiresAtUtc,
    nowUtc,
  }),
);

// Equivalent ordering and unrelated metadata do not change a baseline.
const reordered = structuredClone(snapshot);
reordered.settings.result.bindings.reverse();
reordered.secrets.result.reverse();
reordered.domains.result.reverse();
reordered.schedules.result.schedules.reverse();
reordered.scripts.result.find(({ id }) => id === workerName).handlers.reverse();
reordered.deployments.result.deployments[0].author_email =
  "another-operator@example.test";
reordered.scripts.result.find(({ id }) => id === workerName).modified_on =
  "2026-09-09T00:01:00.000Z";
assert.doesNotThrow(() =>
  assertOpenReleaseBaselineMatches({ ...baselineArgs, snapshot: reordered }),
);

let rejectedChanges = 0;
for (const [label, mutate] of [
  [
    "another deployment",
    (s) => {
      s.deployments.result.deployments[0].id =
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    },
  ],
  [
    "another version",
    (s) => {
      s.deployments.result.deployments[0].versions[0].version_id =
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    },
  ],
  [
    "gradual deployment",
    (s) => {
      s.deployments.result.deployments[0].versions = [
        { percentage: 50, version_id: activeVersionId },
        { percentage: 50, version_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      ];
    },
  ],
  [
    "partial traffic",
    (s) => {
      s.deployments.result.deployments[0].versions[0].percentage = 99;
    },
  ],
  [
    "Google enabled",
    (s) => {
      s.settings.result.bindings.find(
        ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
      ).text = "true";
    },
  ],
  [
    "Facebook explicit false",
    (s) => {
      s.settings.result.bindings.push({
        name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
        type: "plain_text",
        text: "false",
      });
    },
  ],
  [
    "closed profile",
    (s) => {
      s.settings.result.bindings.find(
        ({ name }) => name === "AGORBIS_LAUNCH_MODE",
      ).text = "closed";
    },
  ],
  [
    "unknown plaintext",
    (s) => {
      s.settings.result.bindings.push({
        name: "UNKNOWN",
        type: "plain_text",
        text: "value",
      });
    },
  ],
  [
    "duplicate binding",
    (s) => {
      s.settings.result.bindings.push({ ...s.settings.result.bindings[0] });
    },
  ],
  [
    "missing binding",
    (s) => {
      s.settings.result.bindings.shift();
    },
  ],
  [
    "unknown secret",
    (s) => {
      s.settings.result.bindings.push({
        name: "UNEXPECTED_SECRET",
        type: "secret_text",
      });
    },
  ],
  [
    "secret value",
    (s) => {
      s.settings.result.bindings.find(
        ({ type }) => type === "secret_text",
      ).text = "private-fixture";
    },
  ],
  [
    "secret inventory changed",
    (s) => {
      s.secrets.result.pop();
    },
  ],
  [
    "AI binding",
    (s) => {
      s.settings.result.bindings.push({ name: "AI", type: "ai" });
    },
  ],
  [
    "no schedules",
    (s) => {
      s.schedules.result.schedules = [];
    },
  ],
  [
    "another cron",
    (s) => {
      s.schedules.result.schedules[0].cron = "* * * * *";
    },
  ],
  [
    "duplicate cron",
    (s) => {
      s.schedules.result.schedules.push({ ...s.schedules.result.schedules[0] });
    },
  ],
  [
    "missing domain",
    (s) => {
      s.domains.result.pop();
    },
  ],
  [
    "another hostname",
    (s) => {
      s.domains.result[0].hostname = "example.test";
    },
  ],
  [
    "another zone",
    (s) => {
      s.domains.result[0].zone_id = "f".repeat(32);
    },
  ],
  [
    "another service",
    (s) => {
      s.domains.result[0].service = "other";
    },
  ],
  [
    "another certificate",
    (s) => {
      s.domains.result[0].cert_id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    },
  ],
  [
    "another domain identity",
    (s) => {
      s.domains.result[0].id = "3".repeat(40);
    },
  ],
  [
    "workers.dev enabled",
    (s) => {
      s.subdomain.result.enabled = true;
    },
  ],
  [
    "previews enabled",
    (s) => {
      s.subdomain.result.previews_enabled = true;
    },
  ],
  [
    "zone route",
    (s) => {
      s.routes.result.push({ pattern: "agorbis.com/*", script: workerName });
    },
  ],
  [
    "compatibility changed",
    (s) => {
      s.settings.result.compatibility_date = "2026-09-09";
    },
  ],
  [
    "logs enabled",
    (s) => {
      s.settings.result.observability.enabled = true;
    },
  ],
  [
    "runtime limits changed",
    (s) => {
      s.settings.result.limits.cpu_ms = 60_000;
    },
  ],
  [
    "unknown snapshot key",
    (s) => {
      s.unknown = {};
    },
  ],
  [
    "unreadable settings",
    (s) => {
      s.settings.success = false;
    },
  ],
  [
    "worker code reference changed",
    (s) => {
      s.scripts.result.find(({ id }) => id === workerName).etag = "new-etag";
    },
  ],
  [
    "account configuration changed",
    (s) => {
      s.accountSettings.result.green_compute = true;
    },
  ],
]) {
  const changed = structuredClone(snapshot);
  mutate(changed);
  assert.throws(
    () =>
      assertOpenReleaseBaselineMatches({ ...baselineArgs, snapshot: changed }),
    undefined,
    label,
  );
  rejectedChanges += 1;
}

for (const change of [
  { percentage: 50 },
  { profile: "open" },
  { workerName: "other" },
  { accountId: "f".repeat(32) },
  { observedAtUtc: "2026-09-08T23:00:00.000Z" },
  { expiresAtUtc: "2026-09-09T02:00:00.000Z" },
  { approved: true },
]) {
  assert.throws(() =>
    assertOpenReleaseBaselineMatches({
      ...baselineArgs,
      baseline: { ...candidate.baseline, ...change },
    }),
  );
}
for (const expectedBaselineSha256 of [
  "",
  "0".repeat(64),
  candidate.baselineSha256.toUpperCase(),
  null,
]) {
  assert.throws(() =>
    assertOpenReleaseBaselineMatches({
      ...baselineArgs,
      expectedBaselineSha256,
    }),
  );
}
for (const change of [
  { nowUtc: expiresAtUtc },
  { nowUtc: "2026-09-08T23:59:59.999Z" },
  { observedAtUtc: "2026-09-08T23:59:59.999Z" },
  { observedAtUtc: "2026-09-09T00:05:00.001Z" },
  { nowUtc: "2026-09-09T00:05:00Z" },
  { nowUtc: "2026-09-09T00:05:00.000+00:00" },
  { nowUtc: "2026-02-30T00:05:00.000Z" },
  { nowUtc: "invalid" },
  { deploymentAuthorized: true },
]) {
  assert.throws(() =>
    assertOpenReleaseBaselineMatches({ ...baselineArgs, ...change }),
  );
}
for (const change of [
  { expiresAtUtc: "2026-09-09T01:00:00.001Z" },
  { expiresAtUtc: observedAtUtc },
  { observedAtUtc: "2026-09-09T00:05:00.001Z" },
  { deploymentAuthorized: true },
]) {
  assert.throws(() =>
    createOpenReleaseBaselineCandidate({
      snapshot,
      observedAtUtc,
      expiresAtUtc,
      nowUtc,
      ...change,
    }),
  );
}

// Reject non-JSON values without invoking an accessor or silently dropping it.
let getterCalls = 0;
const accessorSnapshot = structuredClone(snapshot);
Object.defineProperty(accessorSnapshot, "injected", {
  enumerable: true,
  get() {
    getterCalls += 1;
    return {};
  },
});
assert.throws(() =>
  createOpenReleaseBaselineCandidate({
    snapshot: accessorSnapshot,
    observedAtUtc,
    expiresAtUtc,
    nowUtc,
  }),
);
assert.equal(getterCalls, 0);
for (const value of [
  undefined,
  NaN,
  Infinity,
  () => true,
  new Date(),
  Object.create(null),
]) {
  assert.throws(() =>
    createOpenReleaseBaselineCandidate({
      snapshot: value,
      observedAtUtc,
      expiresAtUtc,
      nowUtc,
    }),
  );
}
for (const mutate of [
  (s) => {
    s[Symbol("hidden")] = true;
  },
  (s) => {
    s.cycle = s;
  },
  (s) => {
    Object.defineProperty(s, "hidden", { value: true });
  },
  (s) => {
    s.settings.result.bindings.extra = true;
  },
  (s) => {
    delete s.settings.result.bindings[0];
  },
]) {
  const altered = structuredClone(snapshot);
  mutate(altered);
  assert.throws(() =>
    createOpenReleaseBaselineCandidate({
      snapshot: altered,
      observedAtUtc,
      expiresAtUtc,
      nowUtc,
    }),
  );
}

console.log(
  `Open release baseline policy: PASS (${rejectedChanges} changed origins rejected; no release authority).`,
);
