import assert from "node:assert/strict";
import {
  CLOUDFLARE_CLOSED_STATE_COMPONENTS,
  CLOUDFLARE_CLOSED_STATE_CONSTANTS,
  CLOUDFLARE_STATE_CONSTANTS,
  CloudflareStateFactualMismatchError,
  loadWranglerOAuthToken,
  parseCloudflareClosedStateArgs,
  parseWranglerOAuthToken,
  runCloudflareClosedStateCheck,
  validateCloudflareClosedWithOpenCronsState,
  validateCloudflareOpenState,
  validateCloudflareOpenSourceState,
  validateCloudflareOpenRecoveryState,
  validateCloudflareClosedState,
  validateD72CloudflareClosedStateComponent,
  validateCloudflareState,
} from "./cloudflare-closed-state.mjs";
import {
  parseCloudflareOpenStateArgs,
  runCloudflareOpenStateCheck,
} from "./cloudflare-open-state.mjs";

const { accountId, secretNamesByStage, workerName, zoneId, zoneName } =
  CLOUDFLARE_CLOSED_STATE_CONSTANTS;
const { openCrons } = CLOUDFLARE_STATE_CONSTANTS;
const fixtureToken = "fixture_wranger_oauth_token_0123456789abcdef";
const activeDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activeVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function endpointForUrl(url) {
  const parsed = new URL(url);
  if (parsed.pathname.endsWith("/workers/account-settings")) {
    return "accountSettings";
  }
  if (parsed.pathname.endsWith(`/${workerName}/deployments`)) {
    return "deployments";
  }
  if (parsed.pathname.endsWith(`/${workerName}/settings`)) return "settings";
  if (parsed.pathname.endsWith(`/${workerName}/schedules`)) return "schedules";
  if (parsed.pathname.endsWith(`/${workerName}/secrets`)) return "secrets";
  if (parsed.pathname.endsWith(`/${workerName}/subdomain`)) return "subdomain";
  if (parsed.pathname.endsWith("/workers/domains")) return "domains";
  if (parsed.pathname.endsWith("/workers/routes")) return "routes";
  if (parsed.pathname === `/client/v4/accounts/${accountId}/workers/scripts`) {
    return "scripts";
  }
  throw new Error("Endpoint de test inesperado.");
}

function fetchForSnapshot(snapshot, calls = []) {
  return async (url, init) => {
    calls.push({ init, url: String(url) });
    const key = endpointForUrl(String(url));
    return Response.json(snapshot[key]);
  };
}

for (const phase of ["workers-dev", "custom-domains"]) {
  for (const secretStage of ["none", "supabase", "turnstile", "complete"]) {
    const result = validateCloudflareClosedState(
      makeSnapshot({ phase, secretStage }),
      { phase, secretStage },
    );
    assert.equal(result.phase, phase);
    assert.equal(result.secretStage, secretStage);
    assert.equal(result.activeDeploymentId, activeDeploymentId);
    assert.equal(result.activeVersionId, activeVersionId);
  }
}

const d72ClosedSnapshot = makeSnapshot({
  phase: "custom-domains",
  secretStage: "complete",
});
for (const component of CLOUDFLARE_CLOSED_STATE_COMPONENTS) {
  assert.equal(
    validateD72CloudflareClosedStateComponent(d72ClosedSnapshot, component),
    true,
  );
}
const d72CronMismatch = structuredClone(d72ClosedSnapshot);
d72CronMismatch.schedules.result.schedules.push({ cron: "0 0 * * *" });
for (const component of CLOUDFLARE_CLOSED_STATE_COMPONENTS) {
  if (component === "crons") {
    assert.throws(
      () =>
        validateD72CloudflareClosedStateComponent(d72CronMismatch, component),
      CloudflareStateFactualMismatchError,
    );
  } else {
    assert.equal(
      validateD72CloudflareClosedStateComponent(d72CronMismatch, component),
      true,
    );
  }
}
const d72MalformedCrons = structuredClone(d72ClosedSnapshot);
d72MalformedCrons.schedules.result = {};
assert.throws(
  () => validateD72CloudflareClosedStateComponent(d72MalformedCrons, "crons"),
  (error) => !(error instanceof CloudflareStateFactualMismatchError),
);
const d72WrongPlaintext = structuredClone(d72ClosedSnapshot);
d72WrongPlaintext.settings.result.bindings.find(
  ({ name }) => name === "PUBLIC_SITE_URL",
).text = "https://invalid.example";
assert.throws(
  () =>
    validateD72CloudflareClosedStateComponent(d72WrongPlaintext, "bindings"),
  CloudflareStateFactualMismatchError,
);
assert.equal(
  validateD72CloudflareClosedStateComponent(d72WrongPlaintext, "ai"),
  true,
);
const d72SecretSurfaceMismatch = structuredClone(d72ClosedSnapshot);
d72SecretSurfaceMismatch.settings.result.bindings =
  d72SecretSurfaceMismatch.settings.result.bindings.filter(
    ({ name }) => name !== "CRON_SECRET",
  );
assert.throws(
  () =>
    validateD72CloudflareClosedStateComponent(
      d72SecretSurfaceMismatch,
      "secrets",
    ),
  CloudflareStateFactualMismatchError,
);
const d72AiBinding = structuredClone(d72ClosedSnapshot);
d72AiBinding.settings.result.bindings.push({
  name: "OPENAI_API_KEY",
  type: "secret_text",
});
assert.throws(
  () => validateD72CloudflareClosedStateComponent(d72AiBinding, "ai"),
  CloudflareStateFactualMismatchError,
);

const defaultClosedResult = validateCloudflareState(makeSnapshot(), {
  phase: "workers-dev",
  secretStage: "none",
});
assert.equal(defaultClosedResult.phase, "workers-dev");
assert.deepEqual(Object.keys(defaultClosedResult).sort(), [
  "activeDeploymentId",
  "activeVersionId",
  "phase",
  "secretStage",
]);
assert.throws(
  () =>
    validateCloudflareState(
      makeSnapshot({
        phase: "custom-domains",
        profile: "open",
        secretStage: "complete",
      }),
      { phase: "custom-domains", secretStage: "complete" },
    ),
  /binding plaintext AGORBIS_LAUNCH_MODE/,
);

const openSnapshot = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
const openResult = validateCloudflareOpenState(openSnapshot);
assert.equal(openResult.phase, "custom-domains");
assert.equal(openResult.secretStage, "complete");
assert.equal(openResult.activeDeploymentId, activeDeploymentId);
assert.equal(openResult.activeVersionId, activeVersionId);

const sourceAnnotationsSnapshot = structuredClone(openSnapshot);
const recoverySnapshot = structuredClone(openSnapshot);
recoverySnapshot.settings.result.bindings.find(
  ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
).text = "false";
assert.equal(
  validateCloudflareOpenRecoveryState(recoverySnapshot).activeVersionId,
  activeVersionId,
);
// D122: el perfil abierto ofrece Google y el de respaldo no; cada validación
// rechaza el snapshot del otro, además de verificar id, etag y anotaciones.
assert.throws(() => validateCloudflareOpenRecoveryState(openSnapshot));
assert.throws(() => validateCloudflareOpenState(recoverySnapshot));
assert.throws(() => validateCloudflareOpenSourceState(recoverySnapshot));
sourceAnnotationsSnapshot.settings.result.bindings =
  sourceAnnotationsSnapshot.settings.result.bindings.filter(
    ({ name }) => name !== "PUBLIC_FACEBOOK_AUTH_ENABLED",
  );
sourceAnnotationsSnapshot.settings.result.bindings.find(
  ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
).text = "false";
for (const [snapshot, validate] of [
  [sourceAnnotationsSnapshot, validateCloudflareOpenSourceState],
  [recoverySnapshot, validateCloudflareOpenRecoveryState],
  [openSnapshot, validateCloudflareOpenState],
  [
    d72ClosedSnapshot,
    (candidate) =>
      validateCloudflareClosedState(candidate, {
        phase: "custom-domains",
        secretStage: "complete",
      }),
  ],
]) {
  for (const annotations of [
    { "workers/triggered_by": "version_upload" },
    {
      "workers/triggered_by": "version_upload",
      "workers/message": "Fixture upload with reviewed annotations",
      "workers/tag": "fixture-release",
    },
    {
      "workers/triggered_by": "version_upload",
      "workers/message": "á".repeat(500),
      "workers/tag": "🌎".repeat(25),
    },
    {
      "workers/triggered_by": "version_upload",
      "workers/message": "",
      "workers/tag": "",
    },
  ]) {
    const candidate = structuredClone(snapshot);
    candidate.settings.result.annotations = annotations;
    assert.doesNotThrow(() => validate(candidate));
  }
  for (const malformed of [
    { "workers/triggered_by": "unknown" },
    { "workers/message": "trigger missing" },
    { "workers/triggered_by": null },
    {
      "workers/triggered_by": "version_upload",
      "workers/unknown": "PRIVATE_ANNOTATION_FIXTURE",
    },
    ...["workers/message", "workers/tag"].flatMap((name) =>
      [null, 10, [], {}, "PRIVATE_ANNOTATION_FIXTURE".repeat(100)].map(
        (value) => ({
          "workers/triggered_by": "version_upload",
          [name]: value,
        }),
      ),
    ),
    {
      "workers/triggered_by": "version_upload",
      "workers/message": "á".repeat(501),
    },
    {
      "workers/triggered_by": "version_upload",
      "workers/tag": "🌎".repeat(26),
    },
  ]) {
    const candidate = structuredClone(snapshot);
    candidate.settings.result.annotations = malformed;
    assert.throws(
      () => validate(candidate),
      (error) => {
        assert.match(error.message, /annotations/);
        assert.doesNotMatch(error.message, /PRIVATE_ANNOTATION_FIXTURE|á|🌎/);
        return true;
      },
    );
  }
}

const closedWithOpenCronsSnapshot = makeSnapshot({
  phase: "custom-domains",
  profile: "closed",
  secretStage: "complete",
});
closedWithOpenCronsSnapshot.schedules.result.schedules = openCrons.map(
  (cron) => ({
    created_on: "2026-08-26T00:11:35.373556Z",
    cron,
    modified_on: "2026-08-26T00:11:37.000000Z",
  }),
);
const transientResult = validateCloudflareClosedWithOpenCronsState(
  closedWithOpenCronsSnapshot,
);
assert.equal(transientResult.activeDeploymentId, activeDeploymentId);
assert.equal(transientResult.activeVersionId, activeVersionId);
assert.throws(
  () => validateCloudflareOpenState(closedWithOpenCronsSnapshot),
  /AGORBIS_LAUNCH_MODE/,
);

assert.throws(
  () =>
    validateCloudflareState(openSnapshot, {
      phase: "workers-dev",
      profile: "open",
      secretStage: "complete",
    }),
  /perfil con crons open requiere la fase custom-domains/,
);
assert.throws(
  () =>
    validateCloudflareState(openSnapshot, {
      phase: "custom-domains",
      profile: "open",
      secretStage: "turnstile",
    }),
  /perfil con crons open requiere el secret stage complete/,
);

const closedLaunchModeInOpen = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
closedLaunchModeInOpen.settings.result.bindings.find(
  ({ name }) => name === "AGORBIS_LAUNCH_MODE",
).text = "closed";
assert.throws(
  () => validateCloudflareOpenState(closedLaunchModeInOpen),
  /binding plaintext AGORBIS_LAUNCH_MODE/,
);

const missingOpenCron = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
missingOpenCron.schedules.result.schedules.pop();
assert.throws(
  () => validateCloudflareOpenState(missingOpenCron),
  /exactamente los cinco Cron Triggers aprobados/,
);

const unexpectedOpenCron = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
unexpectedOpenCron.schedules.result.schedules[0].cron = "* * * * *";
assert.throws(
  () => validateCloudflareOpenState(unexpectedOpenCron),
  /exactamente los cinco Cron Triggers aprobados/,
);

const duplicatedOpenCron = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
duplicatedOpenCron.schedules.result.schedules[1].cron =
  duplicatedOpenCron.schedules.result.schedules[0].cron;
assert.throws(
  () => validateCloudflareOpenState(duplicatedOpenCron),
  /Cron Trigger duplicado/,
);

const workersDevEnabledInOpen = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
workersDevEnabledInOpen.subdomain.result.enabled = true;
assert.throws(
  () => validateCloudflareOpenState(workersDevEnabledInOpen),
  /workers.dev deshabilitado/,
);

const secretDeployment = makeSnapshot({ secretStage: "supabase" });
secretDeployment.deployments.result.deployments[0].annotations[
  "workers/triggered_by"
] = "secret";
secretDeployment.settings.result.annotations["workers/triggered_by"] = "secret";
const secretDeploymentResult = validateCloudflareClosedState(secretDeployment, {
  phase: "workers-dev",
  secretStage: "supabase",
});
assert.equal(secretDeploymentResult.activeDeploymentId, activeDeploymentId);
assert.equal(secretDeploymentResult.activeVersionId, activeVersionId);

const promotionDeployment = makeSnapshot({
  phase: "custom-domains",
  profile: "open",
  secretStage: "complete",
});
promotionDeployment.deployments.result.deployments[0].annotations[
  "workers/triggered_by"
] = "promotion";
promotionDeployment.settings.result.annotations["workers/triggered_by"] =
  "promotion";
assert.equal(
  validateCloudflareOpenState(promotionDeployment).phase,
  "custom-domains",
);

const rollbackDeployment = makeSnapshot({
  phase: "custom-domains",
  secretStage: "complete",
});
rollbackDeployment.deployments.result.deployments[0].annotations[
  "workers/triggered_by"
] = "rollback";
rollbackDeployment.settings.result.annotations["workers/triggered_by"] =
  "rollback";
assert.equal(
  validateCloudflareClosedState(rollbackDeployment, {
    phase: "custom-domains",
    secretStage: "complete",
  }).phase,
  "custom-domains",
);

const uploadState = makeSnapshot();
uploadState.deployments.result.deployments[0].annotations[
  "workers/triggered_by"
] = "upload";
uploadState.settings.result.annotations["workers/triggered_by"] = "upload";
assert.equal(
  validateCloudflareClosedState(uploadState, {
    phase: "workers-dev",
    secretStage: "none",
  }).phase,
  "workers-dev",
);

const unknownDeploymentTrigger = makeSnapshot();
unknownDeploymentTrigger.deployments.result.deployments[0].annotations[
  "workers/triggered_by"
] = "manual";
assert.throws(
  () =>
    validateCloudflareClosedState(unknownDeploymentTrigger, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /trigger de deployment no aprobado/,
);

const unknownSettingsTrigger = makeSnapshot();
unknownSettingsTrigger.settings.result.annotations["workers/triggered_by"] =
  "manual";
assert.throws(
  () =>
    validateCloudflareClosedState(unknownSettingsTrigger, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /annotations contiene un trigger no aprobado/,
);

const extraField = makeSnapshot();
extraField.accountSettings.unapproved = "DO_NOT_PRINT_THIS";
assert.throws(
  () =>
    validateCloudflareClosedState(extraField, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  (error) => {
    assert.match(error.message, /estructura aprobada/);
    assert.doesNotMatch(error.message, /DO_NOT_PRINT_THIS/);
    return true;
  },
);

const cron = makeSnapshot();
cron.schedules.result.schedules.push({ cron: "* * * * *" });
assert.throws(
  () =>
    validateCloudflareClosedState(cron, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /Cron Triggers/,
);

const splitDeployment = makeSnapshot();
splitDeployment.deployments.result.deployments[0].annotations[
  "workers/triggered_by"
] = "secret";
splitDeployment.deployments.result.deployments[0].versions = [
  { percentage: 50, version_id: activeVersionId },
  {
    percentage: 50,
    version_id: "abababab-abab-4bab-8bab-abababababab",
  },
];
assert.throws(
  () =>
    validateCloudflareClosedState(splitDeployment, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /única versión sirviendo al 100%/,
);

// Forma observada en Producción el 01-11-2026: sobre con `result_info` y un
// deployment histórico de `wrangler versions deploy -y` con mensaje vacío.
function deploymentHistorySnapshot({ total = 3, perPage = 10 } = {}) {
  const snapshot = makeSnapshot();
  const [active] = snapshot.deployments.result.deployments;
  const history = Array.from(
    { length: Math.min(total, perPage) - 1 },
    (_, i) => {
      const suffix = String(i + 1).padStart(12, "0");
      return {
        ...structuredClone(active),
        annotations: {
          "workers/message": i === 0 ? "" : "Automatic deployment on upload.",
          "workers/triggered_by": i === 0 ? "deployment" : "upload",
        },
        id: `cccccccc-cccc-4ccc-8ccc-${suffix}`,
        versions: [
          { percentage: 100, version_id: `dddddddd-dddd-4ddd-8ddd-${suffix}` },
        ],
      };
    },
  );
  snapshot.deployments.result.deployments.push(...history);
  snapshot.deployments.result_info = {
    count: snapshot.deployments.result.deployments.length,
    page: 1,
    per_page: perPage,
    total_count: total,
    total_pages: Math.ceil(total / perPage),
  };
  return snapshot;
}

function validateClosedNone(snapshot) {
  return validateCloudflareClosedState(snapshot, {
    phase: "workers-dev",
    secretStage: "none",
  });
}

{
  const observed = validateClosedNone(deploymentHistorySnapshot());
  assert.equal(observed.activeDeploymentId, activeDeploymentId);
  assert.equal(observed.activeVersionId, activeVersionId);

  // Más deployments que una página: el activo sigue siendo el primero.
  const paginated = validateClosedNone(
    deploymentHistorySnapshot({ total: 25, perPage: 10 }),
  );
  assert.equal(paginated.activeVersionId, activeVersionId);

  // Sin `result_info` el sobre anterior sigue siendo válido.
  assert.equal(
    validateClosedNone(makeSnapshot()).activeVersionId,
    activeVersionId,
  );
}

// Cada caso viola una sola condición y deja coherentes las demás (3 recibidos).
for (const [name, mutate] of [
  ["clave extra", (info) => (info.cursor = "DO_NOT_PRINT_THIS")],
  ["clave faltante", (info) => delete info.total_pages],
  ["no es objeto", (info, snapshot) => (snapshot.deployments.result_info = [])],
  ["per_page no entero", (info) => (info.per_page = 10.5)],
  ["número como texto", (info) => (info.page = "1")],
  ["segunda página", (info) => Object.assign(info, { page: 2 })],
  [
    "count distinto de lo recibido",
    (info) => Object.assign(info, { count: 4, total_count: 4 }),
  ],
  [
    "count mayor que per_page",
    (info) => Object.assign(info, { per_page: 2, total_pages: 2 }),
  ],
  [
    "per_page cero",
    (info) => Object.assign(info, { per_page: 0, total_pages: 0 }),
  ],
  [
    "total_count menor que count",
    (info) => Object.assign(info, { total_count: 0, total_pages: 0 }),
  ],
  ["total_pages incoherente", (info) => (info.total_pages = 2)],
  ["una página pero faltan resultados", (info) => (info.total_count = 4)],
]) {
  const snapshot = deploymentHistorySnapshot();
  mutate(snapshot.deployments.result_info, snapshot);
  assert.throws(
    () => validateClosedNone(snapshot),
    (error) => {
      assert.match(error.message, /GET deployments\.result_info/, name);
      assert.doesNotMatch(error.message, /DO_NOT_PRINT_THIS/, name);
      return true;
    },
    name,
  );
}

{
  // Otra clave de sobre sigue fallando aunque venga junto a `result_info`.
  const extraEnvelope = deploymentHistorySnapshot();
  extraEnvelope.deployments.cursor = "DO_NOT_PRINT_THIS";
  assert.throws(
    () => validateClosedNone(extraEnvelope),
    (error) => {
      assert.match(error.message, /GET deployments no coincide/);
      assert.doesNotMatch(error.message, /DO_NOT_PRINT_THIS/);
      return true;
    },
  );
}

for (const [name, message, accepted] of [
  ["vacío", "", true],
  ["1000 bytes multibyte", "ñ".repeat(500), true],
  ["1002 bytes multibyte", "ñ".repeat(501), false],
  ["1001 bytes", "a".repeat(1001), false],
  ["número", 1, false],
  ["null", null, false],
]) {
  const snapshot = deploymentHistorySnapshot();
  snapshot.deployments.result.deployments[1].annotations["workers/message"] =
    message;
  if (accepted) {
    assert.equal(
      validateClosedNone(snapshot).activeVersionId,
      activeVersionId,
      name,
    );
  } else {
    assert.throws(
      () => validateClosedNone(snapshot),
      /deployments\[1\]\.annotations\.workers\/message no contiene un string válido/,
      name,
    );
  }
}

const unexpectedDomain = makeSnapshot({ phase: "custom-domains" });
unexpectedDomain.domains.result[1].hostname = "preview.agorbis.com";
assert.throws(
  () =>
    validateCloudflareClosedState(unexpectedDomain, {
      phase: "custom-domains",
      secretStage: "none",
    }),
  /exactamente agorbis\.com y www\.agorbis\.com/,
);

const disabledCustomDomain = makeSnapshot({ phase: "custom-domains" });
disabledCustomDomain.domains.result[0].enabled = false;
assert.throws(
  () =>
    validateCloudflareClosedState(disabledCustomDomain, {
      phase: "custom-domains",
      secretStage: "none",
    }),
  /enabled no es true/,
);

const previewCustomDomain = makeSnapshot({ phase: "custom-domains" });
previewCustomDomain.domains.result[0].previews_enabled = true;
assert.throws(
  () =>
    validateCloudflareClosedState(previewCustomDomain, {
      phase: "custom-domains",
      secretStage: "none",
    }),
  /previews_enabled no es false/,
);

const domainInWorkersDev = makeSnapshot();
domainInWorkersDev.domains.result.push(
  domain(
    "agorbis.com",
    "1111111111111111111111111111111111111111",
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  ),
);
domainInWorkersDev.domains.result_info = {
  count: 1,
  page: 1,
  per_page: 1,
  total_count: 1,
};
assert.throws(
  () =>
    validateCloudflareClosedState(domainInWorkersDev, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /no admite Custom Domains/,
);

const wrongBinding = makeSnapshot();
wrongBinding.settings.result.bindings.find(
  ({ name }) => name === "AGORBIS_LAUNCH_MODE",
).text = "open";
assert.throws(
  () =>
    validateCloudflareClosedState(wrongBinding, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /binding plaintext AGORBIS_LAUNCH_MODE/,
);

const extraBinding = makeSnapshot();
extraBinding.settings.result.bindings.push({
  name: "UNAPPROVED",
  text: "not-secret",
  type: "plain_text",
});
assert.throws(
  () =>
    validateCloudflareClosedState(extraBinding, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /binding plaintext UNAPPROVED/,
);

const wrongSecretStage = makeSnapshot({ secretStage: "supabase" });
assert.throws(
  () =>
    validateCloudflareClosedState(wrongSecretStage, {
      phase: "workers-dev",
      secretStage: "turnstile",
    }),
  /secret|stage/i,
);

const secretOnlyInEndpoint = makeSnapshot({ secretStage: "none" });
secretOnlyInEndpoint.secrets.result.push({
  name: "TURNSTILE_SECRET",
  type: "secret_text",
});
assert.throws(
  () =>
    validateCloudflareClosedState(secretOnlyInEndpoint, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /secret stage/,
);

const unexpectedHandler = makeSnapshot();
unexpectedHandler.scripts.result[0].handlers.push("email");
assert.throws(
  () =>
    validateCloudflareClosedState(unexpectedHandler, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /exactamente los handlers fetch y scheduled/,
);

const badRoute = makeSnapshot();
badRoute.routes.result.push({ id: "fixture", pattern: "agorbis.com/*" });
assert.throws(
  () =>
    validateCloudflareClosedState(badRoute, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /Worker Routes/,
);

const previewEnabled = makeSnapshot();
previewEnabled.subdomain.result.previews_enabled = true;
assert.throws(
  () =>
    validateCloudflareClosedState(previewEnabled, {
      phase: "workers-dev",
      secretStage: "none",
    }),
  /preview URLs/,
);

const calls = [];
const liveStyleSnapshot = makeSnapshot();
const remoteResult = await runCloudflareClosedStateCheck({
  fetchImpl: fetchForSnapshot(liveStyleSnapshot, calls),
  oauthToken: fixtureToken,
  phase: "workers-dev",
  secretStage: "none",
});
assert.equal(remoteResult.activeVersionId, activeVersionId);
assert.equal(calls.length, 9);
for (const call of calls) {
  assert.equal(call.init.method, "GET");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.headers.Authorization, `Bearer ${fixtureToken}`);
}

const openCalls = [];
const remoteOpenResult = await runCloudflareOpenStateCheck({
  fetchImpl: fetchForSnapshot(openSnapshot, openCalls),
  oauthToken: fixtureToken,
});
assert.equal(remoteOpenResult.phase, "custom-domains");
assert.equal(remoteOpenResult.activeVersionId, activeVersionId);
assert.equal(openCalls.length, 9);
for (const call of openCalls) {
  assert.equal(call.init.method, "GET");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.headers.Authorization, `Bearer ${fixtureToken}`);
}

await assert.rejects(
  runCloudflareClosedStateCheck({
    fetchImpl: async () => {
      throw new Error(`upstream accidentally echoed ${fixtureToken}`);
    },
    oauthToken: fixtureToken,
    phase: "workers-dev",
    secretStage: "none",
  }),
  (error) => {
    assert.match(error.message, /No se pudo completar GET/);
    assert.doesNotMatch(error.message, new RegExp(fixtureToken));
    return true;
  },
);

await assert.rejects(
  loadWranglerOAuthToken({
    execFileImpl: async () => {
      const error = new Error(`child failure ${fixtureToken}`);
      error.stdout = fixtureToken;
      error.stderr = `stderr ${fixtureToken}`;
      throw error;
    },
  }),
  (error) => {
    assert.match(error.message, /Wrangler no pudo resolver la sesión OAuth/);
    assert.doesNotMatch(error.message, new RegExp(fixtureToken));
    return true;
  },
);

let symlinkEnvSpawned = false;
await assert.rejects(
  loadWranglerOAuthToken({
    execFileImpl: async () => {
      symlinkEnvSpawned = true;
      throw new Error("No debe ejecutar Wrangler.");
    },
    lstatImpl: async () => ({
      isFile: () => true,
      isSymbolicLink: () => true,
      size: 0,
    }),
  }),
  /Wrangler no pudo resolver la sesión OAuth/,
);
assert.equal(symlinkEnvSpawned, false);

const execFileCalls = [];
assert.equal(
  await loadWranglerOAuthToken({
    cwd: "/fixture/repository",
    env: {
      CF_API_TOKEN: fixtureToken,
      CLOUDFLARE_API_KEY: fixtureToken,
      CLOUDFLARE_API_TOKEN: fixtureToken,
      CLOUDFLARE_AUTH_USE_KEYRING: "false",
      CLOUDFLARE_EMAIL: "sensitive@example.test",
      FIXTURE_ONLY: "true",
      FORCE_COLOR: "1",
      NODE_OPTIONS: `--require=${fixtureToken}`,
      WRANGLER_LOG: "debug",
      WRANGLER_LOG_PATH: `/tmp/${fixtureToken}.log`,
      WRANGLER_LOG_SANITIZE: "false",
      WRANGLER_OUTPUT_FILE_DIRECTORY: `/tmp/${fixtureToken}`,
      WRANGLER_OUTPUT_FILE_PATH: `/tmp/${fixtureToken}.json`,
      WRANGLER_SEND_ERROR_REPORTS: "true",
    },
    execFileImpl: async (executable, args, options) => {
      execFileCalls.push({ args, executable, options });
      return {
        stderr: `ignored ${fixtureToken}`,
        stdout: JSON.stringify({ type: "oauth", token: fixtureToken }),
      };
    },
    nodeExecutable: "/fixture/node",
    wranglerEntrypoint: "/fixture/wrangler.js",
  }),
  fixtureToken,
);
assert.equal(execFileCalls.length, 1);
assert.equal(execFileCalls[0].executable, "/fixture/node");
assert.deepEqual(execFileCalls[0].args, [
  "/fixture/wrangler.js",
  "auth",
  "token",
  "--json",
  "--env-file",
  new URL("exceptional-release-empty.env", import.meta.url).pathname,
]);
assert.equal(execFileCalls[0].options.cwd, "/fixture/repository");
assert.equal(execFileCalls[0].options.encoding, "utf8");
assert.equal(execFileCalls[0].options.maxBuffer, 64 * 1024);
assert.equal(execFileCalls[0].options.shell, false);
assert.equal(execFileCalls[0].options.timeout, 15_000);
assert.equal(execFileCalls[0].options.windowsHide, true);
assert.equal(execFileCalls[0].options.env.CLOUDFLARE_AUTH_USE_KEYRING, "true");
assert.equal(execFileCalls[0].options.env.FORCE_COLOR, "0");
assert.equal(
  Object.hasOwn(execFileCalls[0].options.env, "WRANGLER_LOG"),
  false,
);
assert.equal(execFileCalls[0].options.env.WRANGLER_LOG_SANITIZE, "true");
assert.equal(execFileCalls[0].options.env.WRANGLER_SEND_ERROR_REPORTS, "false");
assert.equal(execFileCalls[0].options.env.WRANGLER_SEND_METRICS, "false");
assert.equal(execFileCalls[0].options.env.FIXTURE_ONLY, "true");
for (const key of [
  "CF_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_EMAIL",
  "NODE_OPTIONS",
  "WRANGLER_LOG_PATH",
  "WRANGLER_OUTPUT_FILE_DIRECTORY",
  "WRANGLER_OUTPUT_FILE_PATH",
]) {
  assert.equal(Object.hasOwn(execFileCalls[0].options.env, key), false);
}
assert.doesNotMatch(JSON.stringify(execFileCalls[0]), new RegExp(fixtureToken));

await assert.rejects(
  runCloudflareClosedStateCheck({
    fetchImpl: async () => {
      throw new Error("No debe consultar la red sin token.");
    },
    loadWranglerOAuthTokenImpl: async () =>
      loadWranglerOAuthToken({
        execFileImpl: async () => ({
          stderr: "",
          stdout: JSON.stringify({ type: "api_token", token: fixtureToken }),
        }),
      }),
    phase: "workers-dev",
    secretStage: "none",
  }),
  /sesión OAuth esperada/,
);

assert.equal(
  parseWranglerOAuthToken(
    JSON.stringify({ type: "oauth", token: fixtureToken }),
  ),
  fixtureToken,
);
assert.throws(
  () =>
    parseWranglerOAuthToken(
      JSON.stringify({ extra: true, type: "oauth", token: fixtureToken }),
    ),
  /estructura aprobada/,
);
assert.throws(
  () => parseWranglerOAuthToken("not-json"),
  /credencial OAuth válida/,
);
assert.throws(
  () =>
    parseWranglerOAuthToken(JSON.stringify({ type: "oauth", token: "short" })),
  /credencial OAuth válida/,
);

assert.deepEqual(
  parseCloudflareClosedStateArgs([
    "--phase",
    "custom-domains",
    "--secret-stage",
    "complete",
  ]),
  {
    phase: "custom-domains",
    secretStage: "complete",
  },
);
assert.throws(
  () =>
    parseCloudflareClosedStateArgs([
      "--phase",
      "workers-dev",
      "--secret-stage",
      "none",
      "--wrangler-config",
      "/tmp/wrangler.toml",
    ]),
  /argumento no aprobado/,
);
assert.throws(
  () =>
    parseCloudflareClosedStateArgs([
      "--phase",
      "workers-dev",
      "--secret-stage",
      "none",
      "--mutate",
      "true",
    ]),
  /argumento no aprobado/,
);

assert.deepEqual(parseCloudflareOpenStateArgs([]), {});
assert.throws(
  () => parseCloudflareOpenStateArgs(["--phase", "custom-domains"]),
  /no admite argumentos ni perfiles relajados/,
);

console.log(
  "✓ Cloudflare state · strict GET-only closed/open profiles, bindings, crons, secrets and supported Wrangler OAuth",
);
