// Synthetic test data only. No production observations, credentials or network calls.
import {
  CLOUDFLARE_CLOSED_STATE_CONSTANTS,
  CLOUDFLARE_STATE_CONSTANTS,
} from "./cloudflare-closed-state.mjs";
import { createOpenReleaseBaselineCandidate } from "./open-release-baseline-policy.mjs";
import { OPEN_SOURCE_PRODUCTION_SMOKE_CONSTANTS } from "./cloudflare-open-source-smoke-policy.mjs";

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
    text: entry.name === "AGORBIS_LAUNCH_MODE" ? profile : entry.text,
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

const NOW = "2026-09-09T00:05:00.000Z";
const candidate = createOpenReleaseBaselineCandidate({
  snapshot: sourceSnapshot(),
  observedAtUtc: "2026-09-09T00:00:00.000Z",
  expiresAtUtc: "2026-09-09T01:00:00.000Z",
  nowUtc: NOW,
});
const { baseline, baselineSha256: expectedBaselineSha256 } = candidate;
const C = OPEN_SOURCE_PRODUCTION_SMOKE_CONSTANTS;
const CSS_PATH = "/assets/fixture-style.css";
const CSS =
  "body { color: #222; background: #fff; } .container { max-width: 80rem; margin: auto; }";
const CSP =
  "default-src 'self'; script-src 'self' 'nonce-aabb001122' 'strict-dynamic' https://challenges.cloudflare.com; script-src-attr 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://ibtvlvpxwourrxwcrfkf.supabase.co https://accounts.google.com; object-src 'none'; upgrade-insecure-requests";
const securityHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Request-Id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "CF-Ray": "aa000001-EZE",
  "Content-Security-Policy": CSP,
};
function html({ css = CSS_PATH, links = true, email = true } = {}) {
  return `<!doctype html><html><head><link rel="stylesheet" href="${css}"></head><body><h1>Agorbis</h1>${links ? '<a href="/ingresar">Ingresar</a><a href="/registro">Crear cuenta</a><a href="/privacidad">Privacidad</a>' : ""}${email ? '<input type="email" name="email">' : ""}</body></html>`;
}
function successfulResponse(url, init) {
  url = new URL(url);
  if (url.origin === C.wwwOrigin) {
    return new Response(null, {
      status: 308,
      headers: {
        "Cache-Control": "no-store",
        Location: `${C.canonicalOrigin}${url.pathname}${url.search}`,
      },
    });
  }
  if (url.pathname === CSS_PATH)
    return new Response(CSS, {
      headers: { "Content-Type": "text/css; charset=utf-8" },
    });
  if (url.pathname !== "/" && !url.pathname.endsWith("/")) {
    return new Response(null, {
      status: 308,
      headers: { "Cache-Control": "no-store", Location: `${url.pathname}/` },
    });
  }
  return new Response(init.method === "HEAD" ? null : html(), {
    headers: securityHeaders,
  });
}
function options(overrides = {}) {
  return {
    baseline,
    expectedBaselineSha256,
    testOnly: true,
    fetchImpl: async (url, init) => successfulResponse(url, init),
    readSnapshotImpl: async () => sourceSnapshot(),
    nowImpl: () => new Date(NOW),
    ...overrides,
  };
}

export {
  sourceSnapshot,
  successfulResponse,
  options,
  baseline,
  expectedBaselineSha256,
  NOW,
  CSS_PATH,
  CSS,
  CSP,
  securityHeaders,
  html,
};
