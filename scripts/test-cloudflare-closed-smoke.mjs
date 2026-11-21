#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CLOSED_PRODUCTION_SMOKE_CONSTANTS,
  assertClosedProductionSmokeReceipt,
  runClosedProductionSmoke,
} from "./cloudflare-closed-smoke-policy.mjs";

const ACTIVE_DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const FIXTURE_NOW = new Date("2026-08-31T20:00:00.000Z");
const fixtureNow = () => new Date(FIXTURE_NOW);
const CLOSED_SMOKE_CLI = fileURLToPath(
  new URL("./cloudflare-closed-smoke.mjs", import.meta.url),
);

function closedProfile(overrides = {}) {
  return {
    activeDeploymentId: ACTIVE_DEPLOYMENT_ID,
    activeVersionId: ACTIVE_VERSION_ID,
    cronCount: 0,
    phase: "custom-domains",
    profile: "closed",
    secretStage: "complete",
    ...overrides,
  };
}

function successfulClosedResponse(url, init, wwwOverrides = {}) {
  const requestUrl = new URL(url);
  if (requestUrl.origin === CLOSED_PRODUCTION_SMOKE_CONSTANTS.wwwOrigin) {
    return new Response(wwwOverrides.body ?? null, {
      status: wwwOverrides.status ?? 308,
      headers: {
        "Cache-Control": "no-store",
        Location: new URL(
          `${requestUrl.pathname}${requestUrl.search}`,
          CLOSED_PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
        ).href,
        ...(wwwOverrides.headers ?? {}),
      },
    });
  }
  return new Response(
    init.method === "HEAD"
      ? null
      : CLOSED_PRODUCTION_SMOKE_CONSTANTS.expectedBody,
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'",
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

let unmarkedFixtureCalled = false;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      async readClosedProfileImpl() {
        unmarkedFixtureCalled = true;
        return closedProfile();
      },
      async fetchImpl() {
        unmarkedFixtureCalled = true;
        return new Response(null, { status: 503 });
      },
    }),
  /requieren testOnly=true/,
);
assert.equal(unmarkedFixtureCalled, false);
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async fetchImpl() {
        return new Response(null, { status: 503 });
      },
    }),
  /exige exactamente ambos seams fixture/,
);
for (const instrumented of [
  spawnSync(process.execPath, [CLOSED_SMOKE_CLI], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
  }),
  spawnSync(process.execPath, [CLOSED_SMOKE_CLI, "--fixture"], {
    encoding: "utf8",
    env: process.env,
  }),
]) {
  assert.equal(instrumented.status, 1);
  assert.equal(instrumented.stdout, "");
  assert.match(instrumented.stderr, /Smoke de Producción cerrada: BLOQUEADO/);
}

const calls = [];
let profileReadCount = 0;
const result = await runClosedProductionSmoke({
  testOnly: true,
  nowImpl: fixtureNow,
  async readClosedProfileImpl() {
    profileReadCount += 1;
    return closedProfile();
  },
  async fetchImpl(url, init) {
    calls.push({ url: String(url), init });
    return successfulClosedResponse(url, init);
  },
});

assert.deepEqual(result.completed, [
  "CLOSED inicial cronCount=0",
  "GET /",
  "HEAD /",
  "POST /registro/",
  `GET www ${CLOSED_PRODUCTION_SMOKE_CONSTANTS.wwwRedirectPath}`,
  "CLOSED final cronCount=0",
]);
assert.equal(profileReadCount, 2);
assert.equal(result.activeDeploymentId, ACTIVE_DEPLOYMENT_ID);
assert.equal(result.activeVersionId, ACTIVE_VERSION_ID);
assert.equal(result.cronCount, 0);
assert.equal(result.profile, "closed");
assert.equal(result.postAttemptCount, 1);
assert.equal(result.postDeniedCount, 1);
assert.equal(result.startedAtUtc, FIXTURE_NOW.toISOString());
assert.equal(result.completedAtUtc, FIXTURE_NOW.toISOString());
assert.equal(
  result.postState,
  CLOSED_PRODUCTION_SMOKE_CONSTANTS.postDeniedState,
);
assert.equal(result.postState, "POST_HTTP_503_OBSERVED");
assert.equal(result.postWriteStatus, "NOT_VERIFIED");
assert.equal(
  result.postWriteStatus,
  CLOSED_PRODUCTION_SMOKE_CONSTANTS.postWriteStatus,
);
assert.equal(
  assertClosedProductionSmokeReceipt(result, { allowTestReceipt: true }),
  result,
);
assert.throws(
  () => assertClosedProductionSmokeReceipt(result),
  /no fue emitido por el runner autorizado/,
);
assert.throws(() => {
  const clonedReceipt = structuredClone(result);
  Object.freeze(clonedReceipt.completed);
  Object.freeze(clonedReceipt);
  return assertClosedProductionSmokeReceipt(clonedReceipt, {
    allowTestReceipt: true,
  });
}, /no fue emitido por el runner autorizado/);
assert.equal(Object.hasOwn(result, "writeAttemptCount"), false);
assert.equal(Object.hasOwn(result, "writeSucceededCount"), false);
assert.throws(() => {
  const overstatedReceipt = structuredClone(result);
  overstatedReceipt.postWriteStatus = "PASS";
  Object.freeze(overstatedReceipt.completed);
  Object.freeze(overstatedReceipt);
  return assertClosedProductionSmokeReceipt(overstatedReceipt, {
    allowTestReceipt: true,
  });
}, /receipt del smoke CLOSED no es válido/);
assert.deepEqual(
  calls.map(({ init }) => init.method),
  ["GET", "HEAD", "POST", "GET"],
);
assert.equal(calls[2].init.body, "fixture=non-sensitive");
assert.equal(calls[2].init.redirect, "manual");
assert.equal(
  calls[3].url,
  `${CLOSED_PRODUCTION_SMOKE_CONSTANTS.wwwOrigin}${CLOSED_PRODUCTION_SMOKE_CONSTANTS.wwwRedirectPath}`,
);
assert.equal(calls[3].init.redirect, "manual");

let backwardsClockReads = 0;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl() {
        backwardsClockReads += 1;
        return new Date(
          FIXTURE_NOW.getTime() + (backwardsClockReads === 1 ? 60_000 : 0),
        );
      },
      async readClosedProfileImpl() {
        return closedProfile();
      },
      async fetchImpl(url, init) {
        return successfulClosedResponse(url, init);
      },
    }),
  /receipt del smoke CLOSED no es válido/,
);
assert.equal(backwardsClockReads, 2);

await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        return closedProfile();
      },
      async fetchImpl() {
        return new Response("abierto", { status: 200 });
      },
    }),
  /HTTP 503/,
);

await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        return closedProfile();
      },
      async fetchImpl(url, init) {
        const requestUrl = new URL(url);
        if (requestUrl.origin === CLOSED_PRODUCTION_SMOKE_CONSTANTS.wwwOrigin) {
          return new Response(null, {
            status: 308,
            headers: {
              "Cache-Control": "no-store",
              Location: `${CLOSED_PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}${requestUrl.pathname}`,
            },
          });
        }
        return new Response(
          init.method === "HEAD"
            ? null
            : CLOSED_PRODUCTION_SMOKE_CONSTANTS.expectedBody,
          {
            status: 503,
            headers: {
              "Cache-Control": "no-store",
              "Content-Security-Policy": "default-src 'none'",
              "Retry-After": "300",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      },
    }),
  /no conservó exactamente path y query/,
);

let unsafeCronHttpCalls = 0;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        return closedProfile({ cronCount: 1 });
      },
      async fetchImpl() {
        unsafeCronHttpCalls += 1;
        throw new Error("no debe ejecutarse");
      },
    }),
  /no acredita el mismo perfil CLOSED sin Cron Triggers/,
);
assert.equal(unsafeCronHttpCalls, 0);

for (const [label, wwwOverrides, expectedMessage] of [
  ["status", { status: 307 }, /no devolvió HTTP 308/],
  [
    "cache",
    { headers: { "Cache-Control": "public, max-age=60" } },
    /no usa Cache-Control no-store/,
  ],
  [
    "cookie",
    { headers: { "Set-Cookie": "unsafe=1" } },
    /intentó crear una cookie/,
  ],
  ["body", { body: "unexpected" }, /devolvió un cuerpo inesperado/],
]) {
  await assert.rejects(
    () =>
      runClosedProductionSmoke({
        testOnly: true,
        nowImpl: fixtureNow,
        async readClosedProfileImpl() {
          return closedProfile();
        },
        async fetchImpl(url, init) {
          return successfulClosedResponse(url, init, wwwOverrides);
        },
      }),
    expectedMessage,
    `www ${label} debe fallar cerrado`,
  );
}

let oversizedBodyPullCount = 0;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        return closedProfile();
      },
      async fetchImpl() {
        return new Response(
          new ReadableStream({
            pull(controller) {
              oversizedBodyPullCount += 1;
              controller.enqueue(new Uint8Array(4097));
              controller.close();
            },
          }),
          {
            status: 503,
            headers: {
              "Cache-Control": "no-store",
              "Content-Security-Policy": "default-src 'none'",
              "Content-Type": "text/plain; charset=utf-8",
              "Retry-After": "300",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      },
    }),
  /excede 4 KiB/,
);
assert.equal(oversizedBodyPullCount, 1);

let deploymentProfileReads = 0;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        deploymentProfileReads += 1;
        return closedProfile(
          deploymentProfileReads === 1
            ? {}
            : {
                activeDeploymentId: "33333333-3333-4333-8333-333333333333",
              },
        );
      },
      async fetchImpl(url, init) {
        return successfulClosedResponse(url, init);
      },
    }),
  /Deployment o la Version CLOSED cambiaron/,
);
assert.equal(deploymentProfileReads, 2);

let versionProfileReads = 0;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        versionProfileReads += 1;
        return closedProfile(
          versionProfileReads === 1
            ? {}
            : { activeVersionId: "44444444-4444-4444-8444-444444444444" },
        );
      },
      async fetchImpl(url, init) {
        return successfulClosedResponse(url, init);
      },
    }),
  /Deployment o la Version CLOSED cambiaron/,
);
assert.equal(versionProfileReads, 2);

let cronProfileReads = 0;
await assert.rejects(
  () =>
    runClosedProductionSmoke({
      testOnly: true,
      nowImpl: fixtureNow,
      async readClosedProfileImpl() {
        cronProfileReads += 1;
        return closedProfile({ cronCount: cronProfileReads === 1 ? 0 : 1 });
      },
      async fetchImpl(url, init) {
        return successfulClosedResponse(url, init);
      },
    }),
  /lectura CLOSED final.*sin Cron Triggers/,
);
assert.equal(cronProfileReads, 2);

console.log("Cloudflare closed smoke tests: PASS");
