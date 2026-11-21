import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CLOUDFLARE_CLOSED_STATE_CONSTANTS,
  CLOUDFLARE_STATE_CONSTANTS,
  validateCloudflareOpenRecoveryState,
  validateCloudflareOpenSourceState,
  validateCloudflareOpenState,
} from "./cloudflare-closed-state.mjs";
import { createOpenReleaseBaselineCandidate } from "./open-release-baseline-policy.mjs";
import { CANDIDATE_MIGRATION_IDS } from "./production-preflight-policy.mjs";
import {
  EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS,
  EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION,
  EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION,
  createExceptionalOpenRecoveryCapsule,
  assertExceptionalOpenRecoveryCapsule,
  assertExceptionalOpenRecoveryFiles,
  assertExceptionalOpenRecoveredState,
  exceptionalOpenRecoveryCapsuleHash,
  exceptionalOpenRecoveryEvidenceHash,
} from "./exceptional-open-recovery-capsule.mjs";
import {
  createExceptionalOpenRecoveryPlan,
  assertExceptionalCutoverStep,
} from "./exceptional-release-cutover-policy.mjs";

// Every observation, evidence digest and version below is synthetic. No request,
// approval, production observation, recovery or remote upload is performed.
const { accountId, workerName, zoneId, zoneName } = CLOUDFLARE_STATE_CONSTANTS;
const { secretNamesByStage } = CLOUDFLARE_CLOSED_STATE_CONSTANTS;
const sourceVersionId = "11111111-1111-4111-8111-111111111111";
const sourceDeploymentId = "22222222-2222-4222-8222-222222222222";
const recoveryVersionId = "33333333-3333-4333-8333-333333333333";
const recoveryDeploymentId = "44444444-4444-4444-8444-444444444444";
const observedAtUtc = "2026-09-09T12:00:00.000Z";
const createdAtUtc = "2026-09-09T12:05:00.000Z";
const recoveredAtUtc = "2026-09-09T14:00:00.000Z";
const head = "a".repeat(40);
const digest = (source) => createHash("sha256").update(source).digest("hex");
const hash = (n) => digest(`synthetic-${n}`);
const envelope = (result) => ({
  success: true,
  errors: [],
  messages: [],
  result,
});
const clone = (value) => structuredClone(value);
const observability = () => ({
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
});

function sourceSnapshot() {
  const vars = {
    AGORBIS_LAUNCH_MODE: "open",
    AGORBIS_RUNTIME: "cloudflare-workers",
    PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    PUBLIC_SITE_URL: "https://agorbis.com",
    PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
    PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
    TURNSTILE_HOSTNAMES: "agorbis.com",
  };
  const domains = ["agorbis.com", "www.agorbis.com"].map((hostname, index) => ({
    cert_id:
      index === 0
        ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        : "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    enabled: true,
    environment: "production",
    hostname,
    id: String(index + 1).repeat(40),
    previews_enabled: false,
    service: workerName,
    zone_id: zoneId,
    zone_name: zoneName,
  }));
  return {
    accountSettings: envelope({
      default_usage_model: "standard",
      green_compute: false,
    }),
    deployments: envelope({
      deployments: [
        {
          annotations: { "workers/triggered_by": "deployment" },
          author_email: "synthetic@example.test",
          created_on: observedAtUtc,
          id: sourceDeploymentId,
          source: "wrangler",
          strategy: "percentage",
          versions: [{ percentage: 100, version_id: sourceVersionId }],
        },
      ],
    }),
    settings: envelope({
      annotations: { "workers/triggered_by": "version_upload" },
      bindings: [
        ...Object.entries(vars).map(([name, text]) => ({
          name,
          text,
          type: "plain_text",
        })),
        { name: "ASSETS", type: "assets" },
        ...secretNamesByStage.complete.map((name) => ({
          name,
          type: "secret_text",
        })),
      ],
      compatibility_date: "2026-08-25",
      compatibility_flags: ["nodejs_compat"],
      limits: { cpu_ms: 30000 },
      logpush: false,
      observability: observability(),
      placement: {},
      tags: [],
      tail_consumers: [],
      usage_model: "standard",
    }),
    schedules: envelope({
      schedules: CLOUDFLARE_STATE_CONSTANTS.openCrons.map((cron) => ({
        cron,
        created_on: observedAtUtc,
        modified_on: observedAtUtc,
      })),
    }),
    secrets: envelope(
      secretNamesByStage.complete.map((name) => ({
        name,
        type: "secret_text",
      })),
    ),
    subdomain: envelope({ enabled: false, previews_enabled: false }),
    domains: {
      success: true,
      errors: null,
      messages: null,
      result: domains,
      result_info: { count: 2, page: 1, per_page: 2, total_count: 2 },
    },
    routes: envelope([]),
    scripts: envelope([
      {
        compatibility_date: "2026-08-25",
        compatibility_flags: ["nodejs_compat"],
        created_on: observedAtUtc,
        deployment_id: "",
        etag: "e".repeat(64),
        handlers: ["fetch", "scheduled"],
        has_assets: true,
        has_modules: true,
        id: workerName,
        last_deployed_from: "wrangler",
        limits: { cpu_ms: 30000 },
        logpush: false,
        modified_on: observedAtUtc,
        observability: observability(),
        routes: null,
        tag: "f".repeat(32),
        tags: [],
        tail_consumers: null,
        usage_model: "standard",
      },
    ]),
  };
}

const snapshot = sourceSnapshot();
const baseline = createOpenReleaseBaselineCandidate({
  snapshot,
  observedAtUtc,
  expiresAtUtc: "2026-09-09T13:00:00.000Z",
  nowUtc: createdAtUtc,
});
const sources = {
  "exceptional-release-empty.env": "",
  "wrangler.traffic.jsonc": `${JSON.stringify({ $schema: "node_modules/wrangler/config-schema.json", name: workerName, account_id: accountId })}\n`,
};
const files = Object.entries(sources).map(([path, source]) => ({
  path,
  size: Buffer.byteLength(source),
  sha256: digest(source),
}));
const compatibilityEvidence = {
  schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION,
  head,
  recoveryArtifactHash: hash(5),
  migrationIds: [...CANDIDATE_MIGRATION_IDS],
  checks: EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.map((id) => ({
    id,
    result: "PASS",
    evidenceSha256: hash(id),
  })),
  verifiedAtUtc: createdAtUtc,
};
const recoveryUploadEvidence = {
  schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION,
  head,
  recoveryArtifactHash: hash(5),
  recoveryVersionId,
  uploadPayloadHash: hash(6),
  modulesProofSha256: hash(7),
  staticAssetsProofSha256: hash(8),
  configurationProofSha256: hash(9),
  versionScriptEtag: hash("recovery-script"),
  tag: `d72-canary-${head}`,
  message: `agorbis-d72-canary:upload:v1:${hash("recovery-message")}`,
  uploadedAtUtc: createdAtUtc,
  verifiedAtUtc: createdAtUtc,
};
const options = {
  recoveryScope: "FINAL_RELEASE",
  head,
  requestHash: hash(1),
  actHash: hash(2),
  issuanceHash: hash(3),
  artifactHash: hash(4),
  openSourceBaseline: baseline.baseline,
  expectedBaselineSha256: baseline.baselineSha256,
  sourceSnapshot: snapshot,
  recoveryVersionId,
  recoveryArtifactHash: hash(5),
  compatibilityEvidence,
  expectedCompatibilitySha256: exceptionalOpenRecoveryEvidenceHash(
    compatibilityEvidence,
  ),
  recoveryUploadEvidence,
  expectedRecoveryUploadEvidenceSha256: exceptionalOpenRecoveryEvidenceHash(
    recoveryUploadEvidence,
  ),
  files,
  createdAtUtc,
};
const capsule = createExceptionalOpenRecoveryCapsule(options);
const expectedBindings = Object.fromEntries(
  [
    "recoveryScope",
    "head",
    "requestHash",
    "actHash",
    "issuanceHash",
    "artifactHash",
    "openSourceBaselineSha256",
    "sourceVersionId",
    "sourceDeploymentId",
    "recoveryVersionId",
    "recoveryArtifactHash",
    "compatibilitySha256",
    "recoveryUploadEvidenceSha256",
  ].map((key) => [key, capsule[key]]),
);
expectedBindings.expectedCapsuleHash = capsule.contentSha256;
assert.equal(capsule.sourceVersionId, sourceVersionId);
assert.equal(capsule.recoveryVersionId, recoveryVersionId);
assert.equal(Object.isFrozen(capsule.compatibilityEvidence.checks[0]), true);
assert.equal(
  Object.isFrozen(capsule.openSourceBaseline.configuration.settings.bindings),
  true,
);
assert.deepEqual(
  assertExceptionalOpenRecoveryCapsule(
    JSON.parse(JSON.stringify(capsule)),
    expectedBindings,
  ),
  capsule,
);
assert.deepEqual(
  assertExceptionalOpenRecoveryFiles({
    capsuleManifest: capsule,
    expectedBindings,
    sources,
  }),
  capsule,
);

const context = {
  repositoryRoot: "/repo",
  capsuleRoot: "/safe/state/recovery",
  stateRoot: "/safe/state",
  nodeExecutable: "/runtime/bin/node",
  capsuleManifest: capsule,
  expectedBindings,
};
const plan = createExceptionalOpenRecoveryPlan(context);
assert.equal(plan.length, 1);
assert.equal(plan[0].id, "recover-open-google-disabled-version-100");
assert.equal(plan[0].shell, false);
assert.equal(plan[0].arguments[3], `${recoveryVersionId}@100%`);
assert.equal(plan[0].arguments.includes(`${sourceVersionId}@100%`), false);
assert.equal(plan[0].arguments.includes("triggers"), false);
assert.equal(
  plan[0].arguments.some((arg) => /closed|crons/.test(arg)),
  false,
);
assert.equal(Object.isFrozen(plan[0].arguments), true);
assertExceptionalCutoverStep(plan[0], plan[0]);
for (const changed of [
  { ...plan[0], shell: true },
  { ...plan[0], arguments: [...plan[0].arguments, "--unsafe"] },
])
  assert.throws(() => assertExceptionalCutoverStep(changed, plan[0]));

const recovered = clone(snapshot);
recovered.deployments.result.deployments[0].id = recoveryDeploymentId;
recovered.deployments.result.deployments[0].versions[0].version_id =
  recoveryVersionId;
recovered.settings.result.bindings.push({
  name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
  text: "false",
  type: "plain_text",
});
recovered.scripts.result[0].etag = "b".repeat(64);
assert.equal(
  validateCloudflareOpenRecoveryState(recovered).activeVersionId,
  recoveryVersionId,
);
// D122: abierto (Google encendido), respaldo (Google apagado) y origen
// histórico (sin binding de Facebook) son tres contratos distintos.
assert.throws(() => validateCloudflareOpenRecoveryState(snapshot));
assert.throws(() => validateCloudflareOpenSourceState(recovered));
assert.throws(() => validateCloudflareOpenState(recovered));
// The recovery is deliberately observed AFTER the promotion baseline expires.
const recoveredState = assertExceptionalOpenRecoveredState({
  capsuleManifest: capsule,
  expectedBindings,
  snapshot: recovered,
  observedAtUtc: recoveredAtUtc,
});
assert.equal(recoveredState.status, "OPEN_RECOVERY_STATE_MATCHED");
assert.equal(recoveredState.executionAllowed, false);
assert.equal(recoveredState.deploymentId, recoveryDeploymentId);
assert.equal(recoveredState.recoveryVersionId, recoveryVersionId);

// Infrastructure-only canary recovery exists before a final release act. It
// binds the actual candidate and infrastructure authorization instead of
// inventing act/issuance hashes or granting final promotion permission.
const canaryOptions = clone(options);
delete canaryOptions.actHash;
delete canaryOptions.issuanceHash;
canaryOptions.recoveryScope = "CANARY_ONLY";
canaryOptions.candidateIdentityHash = hash("candidate-identity");
canaryOptions.infraAuthorizationHash = hash("infra-authorization");
const canaryCapsule = createExceptionalOpenRecoveryCapsule(canaryOptions);
const canaryBindings = clone(expectedBindings);
delete canaryBindings.actHash;
delete canaryBindings.issuanceHash;
canaryBindings.recoveryScope = "CANARY_ONLY";
canaryBindings.candidateIdentityHash = canaryOptions.candidateIdentityHash;
canaryBindings.infraAuthorizationHash = canaryOptions.infraAuthorizationHash;
canaryBindings.expectedCapsuleHash = canaryCapsule.contentSha256;
assert.equal(Object.hasOwn(canaryCapsule, "actHash"), false);
assert.equal(Object.hasOwn(canaryCapsule, "issuanceHash"), false);
assert.deepEqual(
  assertExceptionalOpenRecoveryCapsule(canaryCapsule, canaryBindings),
  canaryCapsule,
);
const canaryPlan = createExceptionalOpenRecoveryPlan({
  ...context,
  capsuleManifest: canaryCapsule,
  expectedBindings: canaryBindings,
});
assert.equal(canaryPlan.length, 1);
assert.equal(canaryPlan[0].arguments[3], `${recoveryVersionId}@100%`);
assert.equal(
  assertExceptionalOpenRecoveredState({
    capsuleManifest: canaryCapsule,
    expectedBindings: canaryBindings,
    snapshot: recovered,
    observedAtUtc: recoveredAtUtc,
  }).recoveryScope,
  "CANARY_ONLY",
);
assert.throws(() =>
  assertExceptionalOpenRecoveryCapsule(canaryCapsule, expectedBindings),
);
assert.throws(() =>
  assertExceptionalOpenRecoveryCapsule(capsule, canaryBindings),
);
for (const mutation of [
  (v) => {
    delete v.candidateIdentityHash;
  },
  (v) => {
    delete v.infraAuthorizationHash;
  },
  (v) => {
    v.infraAuthorizationHash = "approved";
  },
  (v) => {
    v.actHash = hash("fabricated-act");
  },
  (v) => {
    v.issuanceHash = hash("fabricated-issuance");
  },
  (v) => {
    v.recoveryScope = "FINAL_RELEASE";
  },
  (v) => {
    v.recoveryScope = "anything";
  },
]) {
  const changed = clone(canaryOptions);
  mutation(changed);
  assert.throws(() => createExceptionalOpenRecoveryCapsule(changed));
}
for (const key of ["candidateIdentityHash", "infraAuthorizationHash"]) {
  assert.throws(() =>
    assertExceptionalOpenRecoveryCapsule(canaryCapsule, {
      ...canaryBindings,
      [key]: hash("changed"),
    }),
  );
}

let mutationCount = 0;
for (const [label, mutate] of [
  [
    "missing compatibility",
    (v) => {
      delete v.compatibilityEvidence;
    },
  ],
  [
    "missing upload",
    (v) => {
      delete v.recoveryUploadEvidence;
    },
  ],
  [
    "wrong compatibility hash",
    (v) => {
      v.expectedCompatibilitySha256 = hash(44);
    },
  ],
  [
    "wrong upload hash",
    (v) => {
      v.expectedRecoveryUploadEvidenceSha256 = hash(44);
    },
  ],
  [
    "fallback source version",
    (v) => {
      v.recoveryVersionId = sourceVersionId;
    },
  ],
  [
    "same artifact",
    (v) => {
      v.recoveryArtifactHash = v.artifactHash;
    },
  ],
  [
    "expired creation",
    (v) => {
      v.createdAtUtc = recoveredAtUtc;
    },
  ],
  [
    "changed source",
    (v) => {
      v.sourceSnapshot.deployments.result.deployments[0].id =
        recoveryDeploymentId;
    },
  ],
  [
    "unknown creation option",
    (v) => {
      v.skipCompatibility = true;
    },
  ],
  [
    "nonempty env",
    (v) => {
      v.files[0].size = 1;
    },
  ],
  [
    "cron config added",
    (v) => {
      v.files.push({
        path: "wrangler.crons-closed.jsonc",
        size: 0,
        sha256: digest(""),
      });
    },
  ],
  [
    "bad head",
    (v) => {
      v.head = "main";
    },
  ],
]) {
  const value = clone(options);
  mutate(value);
  assert.throws(() => createExceptionalOpenRecoveryCapsule(value), label);
  mutationCount++;
}
for (const [label, field, mutate] of [
  [
    "incomplete checks",
    "compatibilityEvidence",
    (v) => {
      v.checks.pop();
    },
  ],
  [
    "failed check",
    "compatibilityEvidence",
    (v) => {
      v.checks[0].result = "FAIL";
    },
  ],
  [
    "skipped check",
    "compatibilityEvidence",
    (v) => {
      v.checks[0].result = "SKIP";
    },
  ],
  [
    "missing check digest",
    "compatibilityEvidence",
    (v) => {
      v.checks[0].evidenceSha256 = "";
    },
  ],
  [
    "duplicate check",
    "compatibilityEvidence",
    (v) => {
      v.checks[1] = clone(v.checks[0]);
    },
  ],
  [
    "wrong ledger",
    "compatibilityEvidence",
    (v) => {
      v.migrationIds.pop();
    },
  ],
  [
    "draft 0059",
    "compatibilityEvidence",
    (v) => {
      v.migrationIds.push("0059");
    },
  ],
  [
    "wrong compat head",
    "compatibilityEvidence",
    (v) => {
      v.head = "b".repeat(40);
    },
  ],
  [
    "wrong compat artifact",
    "compatibilityEvidence",
    (v) => {
      v.recoveryArtifactHash = hash(99);
    },
  ],
  [
    "future compat",
    "compatibilityEvidence",
    (v) => {
      v.verifiedAtUtc = recoveredAtUtc;
    },
  ],
  [
    "wrong uploaded version",
    "recoveryUploadEvidence",
    (v) => {
      v.recoveryVersionId = sourceVersionId;
    },
  ],
  [
    "wrong uploaded artifact",
    "recoveryUploadEvidence",
    (v) => {
      v.recoveryArtifactHash = hash(99);
    },
  ],
  [
    "assets unverified",
    "recoveryUploadEvidence",
    (v) => {
      delete v.staticAssetsProofSha256;
    },
  ],
  [
    "assets false",
    "recoveryUploadEvidence",
    (v) => {
      v.staticAssetsProofSha256 = false;
    },
  ],
  [
    "provider token",
    "recoveryUploadEvidence",
    (v) => {
      v.providerToken = "sentinel-must-never-log";
    },
  ],
]) {
  const value = clone(options);
  mutate(value[field]);
  value[
    field === "compatibilityEvidence"
      ? "expectedCompatibilitySha256"
      : "expectedRecoveryUploadEvidenceSha256"
  ] = exceptionalOpenRecoveryEvidenceHash(value[field]);
  assert.throws(() => createExceptionalOpenRecoveryCapsule(value), label);
  mutationCount++;
}
for (const key of Object.keys(expectedBindings)) {
  const changed = clone(expectedBindings);
  changed[key] = hash(`different-${key}`);
  assert.throws(
    () => assertExceptionalOpenRecoveryCapsule(capsule, changed),
    `external ${key}`,
  );
  mutationCount++;
}
for (const key of [
  "openSourceBaseline",
  "compatibilityEvidence",
  "recoveryUploadEvidence",
  "files",
]) {
  const changed = clone(capsule);
  changed[key] = {};
  changed.contentSha256 = exceptionalOpenRecoveryCapsuleHash(changed);
  assert.throws(
    () => assertExceptionalOpenRecoveryCapsule(changed, expectedBindings),
    `capsule ${key}`,
  );
  mutationCount++;
}
for (const [label, mutate] of [
  [
    "historical worker",
    (v) => {
      v.deployments.result.deployments[0].versions[0].version_id =
        sourceVersionId;
    },
  ],
  [
    "partial traffic",
    (v) => {
      v.deployments.result.deployments[0].versions[0].percentage = 50;
    },
  ],
  [
    "missing Facebook binding",
    (v) => {
      v.settings.result.bindings = v.settings.result.bindings.filter(
        ({ name }) => name !== "PUBLIC_FACEBOOK_AUTH_ENABLED",
      );
    },
  ],
  [
    "Google enabled",
    (v) => {
      v.settings.result.bindings.find(
        ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
      ).text = "true";
    },
  ],
  [
    "Facebook enabled",
    (v) => {
      v.settings.result.bindings.find(
        ({ name }) => name === "PUBLIC_FACEBOOK_AUTH_ENABLED",
      ).text = "true";
    },
  ],
  [
    "closed",
    (v) => {
      v.settings.result.bindings.find(
        ({ name }) => name === "AGORBIS_LAUNCH_MODE",
      ).text = "closed";
    },
  ],
  [
    "removed crons",
    (v) => {
      v.schedules.result.schedules = [];
    },
  ],
  [
    "changed cron",
    (v) => {
      v.schedules.result.schedules[0].cron = "* * * * *";
    },
  ],
  [
    "changed cert",
    (v) => {
      v.domains.result[0].cert_id = recoveryDeploymentId;
    },
  ],
  [
    "secret injected",
    (v) => {
      v.settings.result.bindings.push({
        name: "PROVIDER_SECRET",
        type: "secret_text",
      });
    },
  ],
  [
    "missing Turnstile",
    (v) => {
      v.secrets.result.pop();
    },
  ],
]) {
  const value = clone(recovered);
  mutate(value);
  assert.throws(
    () =>
      assertExceptionalOpenRecoveredState({
        capsuleManifest: capsule,
        expectedBindings,
        snapshot: value,
        observedAtUtc: recoveredAtUtc,
      }),
    label,
  );
  mutationCount++;
}
const unsafeSources = { ...sources, "wrangler.traffic.jsonc": "{}" };
assert.throws(() =>
  assertExceptionalOpenRecoveryFiles({
    capsuleManifest: capsule,
    expectedBindings,
    sources: unsafeSources,
  }),
);
assert.throws(() =>
  assertExceptionalOpenRecoveryFiles({
    capsuleManifest: capsule,
    expectedBindings,
    sources: { ...sources, "wrangler.crons-closed.jsonc": "{}" },
  }),
);
assert.throws(() =>
  assertExceptionalOpenRecoveredState({
    capsuleManifest: capsule,
    expectedBindings,
    snapshot: recovered,
    observedAtUtc,
  }),
);
assert.throws(() =>
  createExceptionalOpenRecoveryPlan({ ...context, nodeExecutable: "/bin/sh" }),
);
assert.throws(() =>
  createExceptionalOpenRecoveryPlan({ ...context, capsuleRoot: "relative" }),
);
let getterCalls = 0;
const withGetter = clone(capsule);
Object.defineProperty(withGetter, "actHash", {
  enumerable: true,
  get() {
    getterCalls++;
    return capsule.actHash;
  },
});
assert.throws(() =>
  assertExceptionalOpenRecoveryCapsule(withGetter, expectedBindings),
);
assert.equal(getterCalls, 0);
for (const [field, key] of [
  ["recoveryUploadEvidence", "modulesProofSha256"],
  ["recoveryUploadEvidence", "staticAssetsProofSha256"],
  ["recoveryUploadEvidence", "configurationProofSha256"],
]) {
  const value = clone(options);
  value[field][key] = [hash("array-coercion")];
  value.expectedRecoveryUploadEvidenceSha256 =
    exceptionalOpenRecoveryEvidenceHash(value.recoveryUploadEvidence);
  assert.throws(() => createExceptionalOpenRecoveryCapsule(value));
}
// A rehashed file inventory cannot smuggle Worker vars or cron mutation through
// the traffic-only recovery command, even if an external caller pins that hash.
const injectedSources = {
  ...sources,
  "wrangler.traffic.jsonc": JSON.stringify({
    $schema: "node_modules/wrangler/config-schema.json",
    name: workerName,
    account_id: accountId,
    vars: { PUBLIC_GOOGLE_AUTH_ENABLED: "true" },
    triggers: { crons: [] },
  }),
};
const injected = clone(capsule);
injected.files[1] = {
  path: "wrangler.traffic.jsonc",
  sha256: digest(injectedSources["wrangler.traffic.jsonc"]),
  size: Buffer.byteLength(injectedSources["wrangler.traffic.jsonc"]),
};
injected.contentSha256 = exceptionalOpenRecoveryCapsuleHash(injected);
assert.throws(
  () =>
    assertExceptionalOpenRecoveryFiles({
      capsuleManifest: injected,
      expectedBindings: {
        ...expectedBindings,
        expectedCapsuleHash: injected.contentSha256,
      },
      sources: injectedSources,
    }),
  /configuración exclusiva/,
);
console.log(
  `OPEN recovery capsule/plan/state: PASS (${mutationCount} adversarial mutations; synthetic evidence only).`,
);
