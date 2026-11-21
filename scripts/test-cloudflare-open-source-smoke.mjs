#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  runOpenSourceProductionSmoke,
  assertOpenSourceProductionSmokeReceipt,
  openSourceProductionSmokeHash,
  OPEN_SOURCE_PRODUCTION_SMOKE_CONSTANTS,
} from "./cloudflare-open-source-smoke-policy.mjs";
import {
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
} from "./cloudflare-open-source-smoke-test-fixture.mjs";
const C = OPEN_SOURCE_PRODUCTION_SMOKE_CONSTANTS;

let checks = 0;
const calls = [];
const timeline = [];
const result = await runOpenSourceProductionSmoke(
  options({
    readSnapshotImpl: async () => {
      timeline.push("audit");
      return sourceSnapshot();
    },
    fetchImpl: async (url, init) => {
      timeline.push("http");
      calls.push({ url: String(url), init });
      return successfulResponse(url, init);
    },
  }),
);
assert.equal(timeline[0], "audit");
assert.equal(timeline.at(-1), "audit");
assert.equal(timeline.filter((event) => event === "audit").length, 2);
assert.equal(result.schemaVersion, "agorbis-open-source-production-smoke/v1");
assert.equal(result.profile, "open-source-read-only");
assert.equal(result.baselineSha256, expectedBaselineSha256);
assert.equal(result.activeVersionId, baseline.versionId);
assert.equal(result.activeDeploymentId, baseline.deploymentId);
assert.deepEqual(result.completed, C.completed);
assert.equal(result.requestCount, calls.length);
assert.equal(result.requestCount, 35);
assert.equal(result.postAttemptCount, 0);
assert.equal(result.authFunctionality, "NOT_VERIFIED");
assert.equal(result.databaseWriteStatus, "NOT_VERIFIED");
assert.equal(result.browserNavigation, "NOT_VERIFIED");
for (const { url, init } of calls) {
  assert.ok([C.canonicalOrigin, C.wwwOrigin].includes(new URL(url).origin));
  assert.ok(["GET", "HEAD"].includes(init.method));
  assert.equal(init.redirect, "manual");
  assert.equal(init.credentials, "omit");
  assert.equal(init.body, undefined);
  assert.equal(
    Object.keys(init.headers).some((name) =>
      /^(?:authorization|cookie)$/i.test(name),
    ),
    false,
  );
  assert.equal(
    /\/auth\/|\/internal\/|supabase|google|facebook/i.test(url),
    false,
  );
}
assert.equal(calls.filter(({ url }) => url.endsWith(CSS_PATH)).length, 14);
assert.equal(
  assertOpenSourceProductionSmokeReceipt(result, { allowTestReceipt: true }),
  result,
);
const hash = openSourceProductionSmokeHash(result, { allowTestReceipt: true });
assert.match(hash, /^[a-f0-9]{64}$/);
assert.equal(
  hash,
  openSourceProductionSmokeHash(result, { allowTestReceipt: true }),
);
assert.equal(result.startedAtUtc, NOW);
assert.equal(result.completedAtUtc, NOW);
checks += 1;

for (const operation of [
  () => assertOpenSourceProductionSmokeReceipt(result),
  () => openSourceProductionSmokeHash(result),
  () => {
    const copy = structuredClone(result);
    Object.freeze(copy.completed);
    Object.freeze(copy.requestMethods);
    Object.freeze(copy);
    return assertOpenSourceProductionSmokeReceipt(copy, {
      allowTestReceipt: true,
    });
  },
]) {
  assert.throws(operation, /no fue emitido por el runner autorizado/);
  checks += 1;
}

for (const [key, value] of [
  ["profile", "closed"],
  ["schemaVersion", "agorbis-closed-smoke/v1"],
  ["authFunctionality", "PASS"],
  ["databaseWriteStatus", "PASS"],
  ["postAttemptCount", 1],
  ["requestCount", 0],
  ["baselineSha256", "invalid"],
  ["requestMethods", ["GET", "HEAD", "POST"]],
]) {
  const copy = { ...result, [key]: value };
  if (Array.isArray(copy.requestMethods)) Object.freeze(copy.requestMethods);
  Object.freeze(copy);
  assert.throws(
    () =>
      assertOpenSourceProductionSmokeReceipt(copy, { allowTestReceipt: true }),
    /receipt.*no es válido/,
  );
  checks += 1;
}

let invalidCalls = 0;
for (const override of [
  { expectedBaselineSha256: "0".repeat(64) },
  { nowImpl: () => new Date("2026-09-09T01:00:00.000Z") },
  { nowImpl: () => new Date("2026-09-08T23:59:59.000Z") },
  { nowImpl: () => new Date("invalid") },
  { extra: true },
]) {
  await assert.rejects(() =>
    runOpenSourceProductionSmoke(
      options({
        fetchImpl: async () => {
          invalidCalls += 1;
          throw new Error("unexpected");
        },
        readSnapshotImpl: async () => {
          invalidCalls += 1;
          return sourceSnapshot();
        },
        ...override,
      }),
    ),
  );
  checks += 1;
}
assert.equal(invalidCalls, 0);
await assert.rejects(
  () =>
    runOpenSourceProductionSmoke({
      baseline,
      expectedBaselineSha256,
      fetchImpl: () => {
        invalidCalls += 1;
      },
    }),
  /testOnly=true/,
);
assert.equal(invalidCalls, 0);
checks += 1;

// Production seams remain closed before consulting Wrangler or HTTP.
const previousNodeOptions = process.env.NODE_OPTIONS;
try {
  process.env.NODE_OPTIONS = "--no-warnings";
  await assert.rejects(
    () => runOpenSourceProductionSmoke({ baseline, expectedBaselineSha256 }),
    /sin instrumentación/,
  );
} finally {
  if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = previousNodeOptions;
}
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => {
    invalidCalls += 1;
    throw new Error("unexpected network");
  };
  await assert.rejects(
    () => runOpenSourceProductionSmoke({ baseline, expectedBaselineSha256 }),
    /sin instrumentación/,
  );
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(invalidCalls, 0);
checks += 2;

let getterCalled = false;
const getterBaseline = {
  ...baseline,
  get configuration() {
    getterCalled = true;
    return baseline.configuration;
  },
};
await assert.rejects(
  () => runOpenSourceProductionSmoke(options({ baseline: getterBaseline })),
  /accessors/,
);
assert.equal(getterCalled, false);
checks += 1;

async function rejectResponse(label, select, response, pattern) {
  await assert.rejects(
    () =>
      runOpenSourceProductionSmoke(
        options({
          fetchImpl: async (url, init) =>
            select(new URL(url), init)
              ? response(new URL(url), init)
              : successfulResponse(url, init),
        }),
      ),
    pattern,
    label,
  );
  checks += 1;
}
const rootGet = (url, init) =>
  url.origin === C.canonicalOrigin &&
  url.pathname === "/" &&
  init.method === "GET";
const login = (url) =>
  url.origin === C.canonicalOrigin && url.pathname === "/ingresar/";
const css = (url) => url.pathname === CSS_PATH;
const www = (url) => url.origin === C.wwwOrigin;
await rejectResponse(
  "OPEN must be open",
  rootGet,
  () => new Response("closed", { status: 503 }),
  /HTTP 200/,
);
await rejectResponse(
  "unexpected session",
  rootGet,
  () =>
    new Response(html(), {
      headers: {
        ...securityHeaders,
        "Set-Cookie": "sb-fixture-auth-token=session; Secure; HttpOnly",
      },
    }),
  /cookie inesperada/,
);
await rejectResponse(
  "CSS session",
  css,
  () =>
    new Response(CSS, {
      headers: { "Content-Type": "text/css", "Set-Cookie": "unexpected=1" },
    }),
  /cookie inesperada/,
);
await rejectResponse(
  "CSP missing",
  rootGet,
  () =>
    new Response(html(), {
      headers: {
        ...securityHeaders,
        "Content-Security-Policy": "default-src 'self'",
      },
    }),
  /CSP/,
);
await rejectResponse(
  "CSP unsafe",
  rootGet,
  () =>
    new Response(html(), {
      headers: {
        ...securityHeaders,
        "Content-Security-Policy": `${CSP.replace("'strict-dynamic'", "'unsafe-eval'")}`,
      },
    }),
  /CSP/,
);
await rejectResponse(
  "CSP duplicate",
  rootGet,
  () =>
    new Response(html(), {
      headers: {
        ...securityHeaders,
        "Content-Security-Policy": `${CSP}; form-action *`,
      },
    }),
  /CSP duplicadas/,
);
// El origen previo al acceso OAuth todavía sirve `form-action 'self'`.
await runOpenSourceProductionSmoke(
  options({
    fetchImpl: async (url, init) => {
      const response = successfulResponse(url, init);
      if (response.headers.has("Content-Security-Policy"))
        response.headers.set(
          "Content-Security-Policy",
          CSP.replace(/form-action [^;]+/, "form-action 'self'"),
        );
      return response;
    },
  }),
);
checks += 1;
await rejectResponse(
  "CSP form-action Facebook",
  rootGet,
  () =>
    new Response(html(), {
      headers: {
        ...securityHeaders,
        "Content-Security-Policy": CSP.replace(
          /form-action [^;]+/,
          "$& https://www.facebook.com",
        ),
      },
    }),
  /CSP form-action/,
);
for (const cache of [
  "",
  "public, max-age=3600",
  "private, no-store, s-maxage=60",
  "no-cache",
  "no-store, immutable",
  "no-store, max-age=00060",
  'no-store, max-age="60"',
  "no-store, stale-while-revalidate=60",
]) {
  const observation = await runOpenSourceProductionSmoke(
    options({
      fetchImpl: async (url, init) =>
        login(new URL(url)) && init.method === "GET"
          ? new Response(html(), {
              headers: { ...securityHeaders, "Cache-Control": cache },
            })
          : successfulResponse(url, init),
    }),
  );
  assert.equal(
    observation.sourceAuthCachePolicy["/ingresar/"],
    "CANDIDATE_FIX_REQUIRED",
    `auth cache ${cache}`,
  );
  assert.equal(observation.authFunctionality, "NOT_VERIFIED");
  checks += 1;
}
assert.deepEqual(result.sourceAuthCachePolicy, {
  "/registro/": "NO_STORE_OBSERVED",
  "/ingresar/": "NO_STORE_OBSERVED",
  "/recuperar/": "NO_STORE_OBSERVED",
  "/reenviar-confirmacion/": "NO_STORE_OBSERVED",
});
for (const referrerPolicy of ["no-referrer", "same-origin"]) {
  const privateReferrer = await runOpenSourceProductionSmoke(
    options({
      fetchImpl: async (url, init) => {
        const response = successfulResponse(url, init);
        response.headers.set("Referrer-Policy", referrerPolicy);
        return response;
      },
    }),
  );
  assert.equal(privateReferrer.authFunctionality, "NOT_VERIFIED");
  checks += 1;
}
await rejectResponse(
  "CDN cache HIT",
  login,
  () =>
    new Response(html(), {
      headers: { ...securityHeaders, "CF-Cache-Status": "HIT" },
    }),
  /desde caché/,
);
await rejectResponse(
  "cached age",
  login,
  () => new Response(html(), { headers: { ...securityHeaders, Age: "12" } }),
  /desde caché/,
);
await rejectResponse(
  "missing email",
  login,
  () => new Response(html({ email: false }), { headers: securityHeaders }),
  /campo de correo/,
);
await rejectResponse(
  "HTML served as CSS",
  css,
  () => new Response(html(), { headers: { "Content-Type": "text/html" } }),
  /content-type/,
);
await rejectResponse(
  "HTML mislabeled as CSS",
  css,
  () => new Response(html(), { headers: { "Content-Type": "text/css" } }),
  /CSS real/,
);
await rejectResponse(
  "empty CSS",
  css,
  () => new Response("", { headers: { "Content-Type": "text/css" } }),
  /CSS real/,
);
await rejectResponse(
  "broken CSS",
  css,
  () =>
    new Response("not found", {
      status: 404,
      headers: { "Content-Type": "text/css" },
    }),
  /descargar su CSS/,
);
await rejectResponse(
  "CSS redirect",
  css,
  () =>
    new Response(null, {
      status: 302,
      headers: { Location: "https://example.test/style.css" },
    }),
  /descargar su CSS/,
);
for (const target of [
  "https://example.test/style.css",
  "//example.test/style.css",
  "/auth/callback/style.css",
  "/assets/style.css?oauth=1",
  "/assets/style.css#hidden",
]) {
  await rejectResponse(
    `unsafe CSS ${target}`,
    rootGet,
    () => new Response(html({ css: target }), { headers: securityHeaders }),
    /inventario estático/,
  );
}
await rejectResponse(
  "hidden stylesheet",
  rootGet,
  () =>
    new Response(
      html().replace('rel="stylesheet"', 'rel="stylesheet" media="print"'),
      { headers: securityHeaders },
    ),
  /hoja activa/,
);
await rejectResponse(
  "disabled stylesheet",
  rootGet,
  () =>
    new Response(
      html().replace('rel="stylesheet"', 'rel="stylesheet" disabled'),
      { headers: securityHeaders },
    ),
  /hoja activa/,
);
await rejectResponse(
  "no stylesheet",
  rootGet,
  () =>
    new Response(html().replace(/<link[^>]*>/, ""), {
      headers: securityHeaders,
    }),
  /hojas CSS reales/,
);
await rejectResponse(
  "no navigation",
  rootGet,
  () => new Response(html({ links: false }), { headers: securityHeaders }),
  /enlace público/,
);
await rejectResponse(
  "navigation redirect origin",
  (url) => url.origin === C.canonicalOrigin && url.pathname === "/ingresar",
  () =>
    new Response(null, {
      status: 308,
      headers: {
        Location: "https://example.test/ingresar/",
        "Cache-Control": "no-store",
      },
    }),
  /ruta canónica/,
);
await rejectResponse(
  "www query loss",
  www,
  () =>
    new Response(null, {
      status: 308,
      headers: {
        Location: `${C.canonicalOrigin}/privacidad/`,
        "Cache-Control": "no-store",
      },
    }),
  /path y query/,
);
await rejectResponse(
  "www unexpected cookie",
  www,
  () =>
    new Response(null, {
      status: 308,
      headers: {
        Location: `${C.canonicalOrigin}${C.wwwRedirectPath}`,
        "Cache-Control": "no-store",
        "Set-Cookie": "unexpected=1",
      },
    }),
  /cookie inesperada/,
);
await rejectResponse(
  "www cache",
  www,
  () =>
    new Response(null, {
      status: 308,
      headers: {
        Location: `${C.canonicalOrigin}${C.wwwRedirectPath}`,
        "Cache-Control": "public, max-age=60",
      },
    }),
  /cache de Auth/,
);
await rejectResponse(
  "HEAD body",
  (url, init) => url.pathname === "/" && init.method === "HEAD",
  () => new Response(html(), { headers: securityHeaders }),
  /body para HEAD/,
);
await rejectResponse(
  "body limit",
  rootGet,
  () => new Response("x".repeat(1024 * 1024 + 1), { headers: securityHeaders }),
  /tamaño máximo/,
);

for (const [label, mutate] of [
  [
    "version",
    (snapshot) => {
      snapshot.deployments.result.deployments[0].versions[0].version_id =
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    },
  ],
  [
    "deployment",
    (snapshot) => {
      snapshot.deployments.result.deployments[0].id =
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    },
  ],
  [
    "configuration",
    (snapshot) => {
      snapshot.settings.result.placement = { mode: "smart" };
    },
  ],
  [
    "Google enabled",
    (snapshot) => {
      snapshot.settings.result.bindings.find(
        ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
      ).text = "true";
    },
  ],
  [
    "Facebook added",
    (snapshot) => {
      snapshot.settings.result.bindings.push({
        name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
        type: "plain_text",
        text: "false",
      });
    },
  ],
  [
    "crons",
    (snapshot) => {
      snapshot.schedules.result.schedules.pop();
    },
  ],
  [
    "script bytes reference",
    (snapshot) => {
      snapshot.scripts.result[0].etag = "f".repeat(64);
    },
  ],
]) {
  for (const changeAt of [1, 2]) {
    let audits = 0;
    let httpCalls = 0;
    await assert.rejects(
      () =>
        runOpenSourceProductionSmoke(
          options({
            readSnapshotImpl: async () => {
              const snapshot = sourceSnapshot();
              if (++audits === changeAt) mutate(snapshot);
              return snapshot;
            },
            fetchImpl: async (url, init) => {
              httpCalls += 1;
              return successfulResponse(url, init);
            },
          }),
        ),
      undefined,
      `${label} audit ${changeAt}`,
    );
    if (changeAt === 1) assert.equal(httpCalls, 0);
    checks += 1;
  }
}

for (const times of [
  [NOW, NOW, "2026-09-09T01:00:00.000Z"],
  [NOW, NOW, "2026-09-09T00:04:00.000Z", NOW],
  [NOW, NOW, NOW, "2026-09-09T01:00:00.000Z"],
]) {
  let reads = 0;
  await assert.rejects(() =>
    runOpenSourceProductionSmoke(
      options({
        nowImpl: () => new Date(times[Math.min(reads++, times.length - 1)]),
      }),
    ),
  );
  checks += 1;
}

// Reordered JSON objects keep the pinned hash: representation order is not identity.
const reorderedBaseline = Object.fromEntries(
  Object.entries(baseline).reverse(),
);
const reordered = await runOpenSourceProductionSmoke(
  options({ baseline: reorderedBaseline }),
);
assert.equal(
  openSourceProductionSmokeHash(reordered, { allowTestReceipt: true }),
  hash,
);
checks += 1;

// Hash verification is independent of insertion order and never contains raw HTML/cookies.
const canonicalReceipt = Object.fromEntries(
  Object.entries(result).sort(([a], [b]) => a.localeCompare(b, "en")),
);
canonicalReceipt.sourceAuthCachePolicy = Object.fromEntries(
  Object.entries(result.sourceAuthCachePolicy).sort(([a], [b]) =>
    a.localeCompare(b, "en"),
  ),
);
assert.equal(
  hash,
  createHash("sha256").update(JSON.stringify(canonicalReceipt)).digest("hex"),
);
assert.equal(
  Object.keys(result).some((name) => /token|cookie|html|secret/i.test(name)),
  false,
);
checks += 1;
console.log(
  `Cloudflare OPEN source smoke tests: PASS (${checks} scenarios, synthetic GET/HEAD only).`,
);
