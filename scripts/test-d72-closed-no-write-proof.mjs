#!/usr/bin/env node

import assert from "node:assert/strict";

import { runClosedProductionSmoke } from "./cloudflare-closed-smoke-policy.mjs";
import {
  D72_CLOSED_NO_WRITE_PROOF_REASON,
  assertD72ClosedNoWritePreproof,
  assertD72ClosedNoWriteProofReceipt,
  compareD72ClosedVersionFactsTestHarness,
  inspectD72ClosedVersionTestHarness,
  issueD72ClosedNoWritePreproofTestReceipt,
  issueD72ClosedNoWriteProofTestReceipt,
} from "./d72-closed-no-write-proof.mjs";
import {
  EVIDENCE_STATUS,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

assert.equal(process.versions.node, "22.22.0");

const accountId = "4d78fb10c1ae65281ec851479d5045dc";
const workerName = "agorbis";
const deploymentId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const stableEndpoint = `/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`;
const betaEndpoint = `/accounts/${accountId}/workers/workers/${workerName}/versions/${versionId}?include=modules`;
const workerSource = `
export default {
  async fetch(request, env) {
    if (env.AGORBIS_LAUNCH_MODE !== "open") {
      return new Response("Agorbis todavía no está abierto.", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'", "Retry-After": "300", "X-Content-Type-Options": "nosniff" }
      });
    }
    return new Response("unexpected", { status: 599 });
  },
  async scheduled() {}
};
`;

function bindings(launchMode = "closed") {
  return [
    { name: "AGORBIS_LAUNCH_MODE", text: launchMode, type: "plain_text" },
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
    { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
    {
      name: "TURNSTILE_HOSTNAMES",
      text: "agorbis.com",
      type: "plain_text",
    },
    { name: "TURNSTILE_SECRET", type: "secret_text" },
  ];
}

function envelope(result) {
  return { errors: [], messages: [], result, success: true };
}

function stableGet(overrides = {}) {
  return {
    endpoint: stableEndpoint,
    method: "GET",
    status: 200,
    body: envelope({
      annotations: {
        "workers/message": "closed fixture",
        "workers/tag": "closed-fixture",
      },
      id: versionId,
      metadata: {
        created_on: "2026-08-31T12:00:00.000000Z",
        has_preview: false,
        source: "wrangler",
      },
      resources: {
        bindings: bindings(),
        script: {
          etag: "a".repeat(64),
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
      ...overrides,
    }),
  };
}

function betaGet({ launchMode = "closed", modules, resultPatch = {} } = {}) {
  const canonicalModules = modules ?? [
    {
      content_base64: Buffer.from(workerSource).toString("base64"),
      content_type: "application/javascript+module",
      name: "worker.mjs",
    },
  ];
  return {
    endpoint: betaEndpoint,
    method: "GET",
    status: 200,
    body: envelope({
      annotations: { "workers/tag": "closed-fixture" },
      assets: {
        config: { run_worker_first: true },
        jwt: "fixture-header.fixture-payload.fixture-signature",
      },
      bindings: bindings(launchMode),
      compatibility_date: "2026-08-25",
      compatibility_flags: ["nodejs_compat"],
      created_on: "2026-08-31T12:00:00.000000Z",
      id: versionId,
      main_module: canonicalModules[0].name,
      modules: canonicalModules,
      number: 7,
      urls: { preview: null },
      ...resultPatch,
    }),
  };
}

const exact = await inspectD72ClosedVersionTestHarness({
  testOnly: true,
  versionId,
  stableGet: stableGet(),
  betaGet: betaGet(),
  executeGuard: true,
});
assert.equal(exact.status, EVIDENCE_STATUS.PASS);
assert.equal(exact.moduleCount, 1);
assert.deepEqual(exact.guard, {
  assetsFetchCount: 0,
  bodyReadCount: 0,
  outboundFetchCount: 0,
  secretReadCount: 0,
  statusCode: 503,
  waitUntilCount: 0,
});

const unexpectedSchema = betaGet();
unexpectedSchema.body.result.unexpected = true;
assert.deepEqual(
  await inspectD72ClosedVersionTestHarness({
    testOnly: true,
    versionId,
    stableGet: stableGet(),
    betaGet: unexpectedSchema,
  }),
  {
    status: EVIDENCE_STATUS.NOT_VERIFIED,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
  },
);

const wrongLaunchMode = await inspectD72ClosedVersionTestHarness({
  testOnly: true,
  versionId,
  stableGet: stableGet(),
  betaGet: betaGet({ launchMode: "open" }),
});
assert.equal(wrongLaunchMode.status, EVIDENCE_STATUS.FAIL);
assert.equal(
  wrongLaunchMode.reasonCode,
  D72_CLOSED_NO_WRITE_PROOF_REASON.CONFIGURATION_MISMATCH,
);

const unknownEtag = stableGet();
unknownEtag.body.result.resources.script.etag = "opaque-etag";
const etagResult = await inspectD72ClosedVersionTestHarness({
  testOnly: true,
  versionId,
  stableGet: unknownEtag,
  betaGet: betaGet(),
});
assert.equal(etagResult.status, EVIDENCE_STATUS.NOT_VERIFIED);
assert.equal(
  etagResult.reasonCode,
  D72_CLOSED_NO_WRITE_PROOF_REASON.SCHEMA_NOT_VERIFIED,
);

const bodyReadingSource = `
export default { async fetch(request) { await request.text(); return new Response("Agorbis todavía no está abierto.", { status: 503, headers: { "Cache-Control": "no-store" } }); }, async scheduled() {} };
`;
const bodyReading = await inspectD72ClosedVersionTestHarness({
  testOnly: true,
  versionId,
  stableGet: stableGet(),
  betaGet: betaGet({
    modules: [
      {
        content_base64: Buffer.from(bodyReadingSource).toString("base64"),
        content_type: "application/javascript+module",
        name: "worker.mjs",
      },
    ],
  }),
  executeGuard: true,
});
assert.equal(bodyReading.status, EVIDENCE_STATUS.FAIL);
assert.equal(
  bodyReading.reasonCode,
  D72_CLOSED_NO_WRITE_PROOF_REASON.GUARD_MISMATCH,
);

const collision = await inspectD72ClosedVersionTestHarness({
  testOnly: true,
  versionId,
  stableGet: stableGet(),
  betaGet: betaGet({
    modules: [
      {
        content_base64: Buffer.from(workerSource).toString("base64"),
        content_type: "application/javascript+module",
        name: "d72-closed-proof-wrapper.mjs",
      },
    ],
  }),
  executeGuard: true,
});
assert.equal(collision.status, EVIDENCE_STATUS.FAIL);
assert.equal(
  collision.reasonCode,
  D72_CLOSED_NO_WRITE_PROOF_REASON.MODULE_MISMATCH,
);

const twoModules = await inspectD72ClosedVersionTestHarness({
  testOnly: true,
  versionId,
  stableGet: stableGet(),
  betaGet: betaGet({
    modules: [
      {
        content_base64: Buffer.from(workerSource).toString("base64"),
        content_type: "application/javascript+module",
        name: "worker.mjs",
      },
      {
        content_base64: Buffer.from("fixture auxiliary").toString("base64"),
        content_type: "text/plain",
        name: "fixture.txt",
      },
    ],
  }),
});
assert.equal(twoModules.status, EVIDENCE_STATUS.PASS);
assert.equal(twoModules.moduleCount, 2);

assert.deepEqual(
  compareD72ClosedVersionFactsTestHarness({
    testOnly: true,
    preproof: exact,
    version: { ...exact, moduleInventorySha256: "f".repeat(64) },
  }),
  {
    status: EVIDENCE_STATUS.FAIL,
    reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.MODULE_MISMATCH,
  },
);

const baseTime = Date.now() - 5_000;
const iso = (offset) => new Date(baseTime + offset).toISOString();
const candidateIdentity = Object.freeze({
  head: "1".repeat(40),
  requestHash: "2".repeat(64),
  policyHash: RELEASE_GATE_POLICY_SHA256,
  policyVersion: RELEASE_GATE_POLICY_VERSION,
  artifactHash: "3".repeat(64),
  contentSha256: "4".repeat(64),
  createdAtUtc: iso(-1_000),
  expiresAtUtc: iso(60 * 60 * 1_000),
});
const guard = Object.freeze({
  assetsFetchCount: 0,
  bodyReadCount: 0,
  outboundFetchCount: 0,
  secretReadCount: 0,
  statusCode: 503,
  waitUntilCount: 0,
});
const preproof = issueD72ClosedNoWritePreproofTestReceipt({
  testOnly: true,
  candidateIdentity,
  status: EVIDENCE_STATUS.PASS,
  reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
  facts: {
    activeDeploymentId: deploymentId,
    activeVersionId: versionId,
    observedAtUtc: iso(0),
    stableScriptEtag: "a".repeat(64),
    mainModuleSha256: exact.mainModuleSha256,
    moduleInventorySha256: exact.moduleInventorySha256,
    moduleCount: 1,
    assetsRunWorkerFirst: true,
    guardContractSha256: "b".repeat(64),
    guard,
  },
});
assert.equal(
  assertD72ClosedNoWritePreproof(preproof, {
    candidateIdentity,
    allowTestReceipt: true,
    now: new Date(baseTime + 500),
  }),
  preproof,
);
assert.throws(
  () =>
    assertD72ClosedNoWritePreproof(structuredClone(preproof), {
      candidateIdentity,
      allowTestReceipt: true,
      now: new Date(baseTime + 500),
    }),
  /opaco/,
);

let clockIndex = 0;
const smokeTimes = [iso(1_000), iso(2_000)];
const smokeReceipt = await runClosedProductionSmoke({
  testOnly: true,
  nowImpl: () => new Date(smokeTimes[clockIndex++]),
  readClosedProfileImpl: async () => ({
    activeDeploymentId: deploymentId,
    activeVersionId: versionId,
    cronCount: 0,
    phase: "custom-domains",
    profile: "closed",
    secretStage: "complete",
  }),
  fetchImpl: async (url, init) => {
    if (url.hostname === "www.agorbis.com") {
      return new Response(null, {
        status: 308,
        headers: {
          "Cache-Control": "no-store",
          Location: `https://agorbis.com${url.pathname}${url.search}`,
        },
      });
    }
    return new Response(
      init.method === "HEAD" ? null : "Agorbis todavía no está abierto.",
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
});
const receipt = issueD72ClosedNoWriteProofTestReceipt({
  testOnly: true,
  preproof,
  candidateIdentity,
  closedProductionSmokeReceipt: smokeReceipt,
  status: EVIDENCE_STATUS.PASS,
  reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
  observedPostAtUtc: iso(3_000),
});
assert.equal(
  assertD72ClosedNoWriteProofReceipt(receipt, {
    preproof,
    candidateIdentity,
    closedProductionSmokeReceipt: smokeReceipt,
    allowTestReceipt: true,
    now: new Date(baseTime + 4_000),
  }),
  receipt,
);
assert.throws(
  () =>
    assertD72ClosedNoWriteProofReceipt(structuredClone(receipt), {
      preproof,
      candidateIdentity,
      closedProductionSmokeReceipt: smokeReceipt,
      allowTestReceipt: true,
      now: new Date(baseTime + 4_000),
    }),
  /opaco/,
);
assert.throws(
  () =>
    issueD72ClosedNoWriteProofTestReceipt({
      testOnly: true,
      preproof: issueD72ClosedNoWritePreproofTestReceipt({
        testOnly: true,
        candidateIdentity,
        status: EVIDENCE_STATUS.NOT_VERIFIED,
        reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.HTTP_NOT_VERIFIED,
        facts: { observedAtUtc: iso(0) },
      }),
      candidateIdentity,
      closedProductionSmokeReceipt: smokeReceipt,
      status: EVIDENCE_STATUS.PASS,
      reasonCode: D72_CLOSED_NO_WRITE_PROOF_REASON.PASS,
      observedPostAtUtc: iso(3_000),
    }),
  /inválido/,
);

process.stdout.write("D72 CLOSED no-write proof tests: PASS\n");
