#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertExceptionalCutoverRemoteUnused,
  exceptionalCutoverRemoteIdentity,
  readVersionInventory,
  validateVersionInventoryPage,
  validateExceptionalUploadedVersion,
  verifyExceptionalCutoverRemoteUpload,
} from "./exceptional-cutover-version-binding.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

const head = "0123456789abcdef0123456789abcdef01234567";
const requestHash = "c".repeat(64);
const actHash = "a".repeat(64);
const artifactHash = "b".repeat(64);
const versionId = "11111111-1111-4111-8111-111111111111";
const otherVersionId = "22222222-2222-4222-8222-222222222222";
const oauthToken = "oauth_token_that_is_only_a_test_fixture_1234567890";
const versionsApiUrl =
  "https://api.cloudflare.com/client/v4/accounts/4d78fb10c1ae65281ec851479d5045dc/workers/scripts/agorbis/versions";
const versionApiUrl = `${versionsApiUrl}/${versionId}`;
const pageApiUrl = (page) => `${versionsApiUrl}?page=${page}`;
const remoteBinding = Object.freeze({
  head,
  requestHash,
  policyVersion: RELEASE_GATE_POLICY_VERSION,
  policyHash: RELEASE_GATE_POLICY_SHA256,
  actHash,
  artifactHash,
});
const identity = exceptionalCutoverRemoteIdentity(remoteBinding);
for (const mutation of [
  { head: "f".repeat(40) },
  { requestHash: "d".repeat(64) },
  { actHash: "e".repeat(64) },
  { artifactHash: "f".repeat(64) },
]) {
  assert.notEqual(
    exceptionalCutoverRemoteIdentity({
      ...remoteBinding,
      ...mutation,
    }).message,
    identity.message,
  );
}
assert.throws(
  () =>
    exceptionalCutoverRemoteIdentity({
      ...remoteBinding,
      policyHash: "0".repeat(64),
    }),
  /policy exacta/,
);

function summary(id, annotations = { "workers/triggered_by": "upload" }) {
  return {
    id,
    number: 7,
    metadata: {
      author_email: "fixture@example.invalid",
      author_id: "fixture-author",
      created_on: "2026-08-30T12:30:00.000Z",
      has_preview: false,
      source: "wrangler",
    },
    annotations,
  };
}

function listPayload(items, { page = 1, totalCount = items.length } = {}) {
  return {
    success: true,
    errors: null,
    messages: null,
    result: { items },
    result_info: {
      count: items.length,
      page,
      per_page: 10,
      total_count: totalCount,
    },
  };
}

function versionPayload(
  id = versionId,
  annotations = {
    "workers/message": identity.message,
    "workers/tag": identity.tag,
    "workers/triggered_by": "upload",
  },
) {
  return {
    success: true,
    errors: [],
    messages: [],
    result: {
      ...summary(id, annotations),
      resources: { bindings: [], script: {}, script_runtime: {} },
    },
  };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const sanitizedPage = validateVersionInventoryPage(
  listPayload([summary(otherVersionId)]),
  { expectedPage: 1 },
);
assert.deepEqual(sanitizedPage.items, [
  { id: otherVersionId, tag: null, message: null },
]);
assert.equal(
  JSON.stringify(sanitizedPage).includes("fixture@example.invalid"),
  false,
);

assert.throws(
  () =>
    validateVersionInventoryPage(
      {
        ...listPayload([]),
        result_info: { count: 0, page: 2, per_page: 10, total_count: 1 },
      },
      { expectedPage: 1 },
    ),
  /página solicitada/,
);
assert.throws(
  () =>
    validateVersionInventoryPage(
      listPayload([
        {
          ...summary(otherVersionId),
          unexpected: true,
        },
      ]),
      { expectedPage: 1 },
    ),
  /estructura/,
);

assert.equal(
  validateExceptionalUploadedVersion(versionPayload(), {
    versionId,
    ...remoteBinding,
  }).versionId,
  versionId,
);
assert.throws(
  () =>
    validateExceptionalUploadedVersion(
      versionPayload(versionId, {
        "workers/message": identity.message,
        "workers/tag": "f".repeat(40),
      }),
      { versionId, ...remoteBinding },
    ),
  /ligado exactamente/,
);
assert.throws(
  () =>
    validateExceptionalUploadedVersion(
      versionPayload(versionId, {
        "workers/message": "different-cutover-message",
        "workers/tag": identity.tag,
      }),
      { versionId, ...remoteBinding },
    ),
  /ligado exactamente/,
);

const precheckCalls = [];
await assertExceptionalCutoverRemoteUnused({
  oauthToken,
  ...remoteBinding,
  fetchImpl: async (url, options) => {
    precheckCalls.push({ url, options });
    if (url === pageApiUrl(1)) {
      return jsonResponse(
        listPayload([summary(otherVersionId)], { totalCount: 1 }),
      );
    }
    assert.equal(url, pageApiUrl(2));
    return jsonResponse(listPayload([], { page: 2, totalCount: 1 }));
  },
});
assert.equal(precheckCalls.length, 2);
assert.deepEqual(
  precheckCalls.map(({ url }) => url),
  [pageApiUrl(1), pageApiUrl(2)],
);
assert.equal(precheckCalls[0].options.method, "GET");
assert.equal(precheckCalls[0].options.redirect, "error");
assert.equal(
  precheckCalls[0].options.headers.Authorization,
  `Bearer ${oauthToken}`,
);

await assert.rejects(
  assertExceptionalCutoverRemoteUnused({
    oauthToken,
    ...remoteBinding,
    fetchImpl: async (url) => {
      if (url === pageApiUrl(1)) {
        return jsonResponse(
          listPayload(
            [
              summary(otherVersionId, {
                "workers/message": identity.message,
                "workers/tag": identity.tag,
              }),
            ],
            { totalCount: 1 },
          ),
        );
      }
      assert.equal(url, pageApiUrl(2));
      return jsonResponse(listPayload([], { page: 2, totalCount: 1 }));
    },
  }),
  /no pueden reutilizarse/,
);

for (const collidingAnnotations of [
  {
    "workers/message": "different-cutover-message",
    "workers/tag": identity.tag,
  },
  {
    "workers/message": identity.message,
    "workers/tag": "different-cutover-tag",
  },
]) {
  await assert.rejects(
    assertExceptionalCutoverRemoteUnused({
      oauthToken,
      ...remoteBinding,
      fetchImpl: async (url) => {
        if (url === pageApiUrl(1)) {
          return jsonResponse(
            listPayload([summary(otherVersionId, collidingAnnotations)], {
              totalCount: 1,
            }),
          );
        }
        assert.equal(url, pageApiUrl(2));
        return jsonResponse(listPayload([], { page: 2, totalCount: 1 }));
      },
    }),
    /no pueden reutilizarse/,
  );
}

await assert.rejects(
  assertExceptionalCutoverRemoteUnused({
    oauthToken,
    ...remoteBinding,
    fetchImpl: async (url) => {
      if (url === pageApiUrl(1)) {
        return jsonResponse(
          listPayload([summary(otherVersionId)], { totalCount: 2 }),
        );
      }
      if (url === pageApiUrl(2)) {
        return jsonResponse(
          listPayload(
            [
              summary(versionId, {
                "workers/message": identity.message,
                "workers/tag": identity.tag,
              }),
            ],
            { page: 2, totalCount: 2 },
          ),
        );
      }
      assert.equal(url, pageApiUrl(3));
      return jsonResponse(listPayload([], { page: 3, totalCount: 2 }));
    },
  }),
  /no pueden reutilizarse/,
);

await assert.rejects(
  readVersionInventory({
    oauthToken,
    fetchImpl: async (url) => {
      if (url === pageApiUrl(1)) {
        return jsonResponse(
          listPayload([summary(versionId)], { totalCount: 2 }),
        );
      }
      assert.equal(url, pageApiUrl(2));
      return jsonResponse(
        listPayload([summary(versionId)], { page: 2, totalCount: 2 }),
      );
    },
  }),
  /repitió un Version ID/,
);

const mismatchedVersionCalls = [];
await assert.rejects(
  verifyExceptionalCutoverRemoteUpload({
    oauthToken,
    versionId,
    ...remoteBinding,
    fetchImpl: async (url) => {
      mismatchedVersionCalls.push(url);
      assert.equal(url, versionApiUrl);
      return jsonResponse(versionPayload(otherVersionId));
    },
  }),
  /devolvió otro Version ID/,
);
assert.deepEqual(mismatchedVersionCalls, [versionApiUrl]);

const verificationCalls = [];
const verified = await verifyExceptionalCutoverRemoteUpload({
  oauthToken,
  versionId,
  ...remoteBinding,
  fetchImpl: async (url, options) => {
    verificationCalls.push({ url, options });
    if (url === versionApiUrl) return jsonResponse(versionPayload());
    if (url === pageApiUrl(1)) {
      return jsonResponse(
        listPayload(
          [
            summary(versionId, {
              "workers/message": identity.message,
              "workers/tag": identity.tag,
              "workers/triggered_by": "upload",
            }),
          ],
          { totalCount: 1 },
        ),
      );
    }
    assert.equal(url, pageApiUrl(2));
    return jsonResponse(listPayload([], { page: 2, totalCount: 1 }));
  },
});
assert.equal(verified.versionId, versionId);
assert.equal(verificationCalls.length, 3);
assert.deepEqual(
  verificationCalls.map(({ url }) => url),
  [versionApiUrl, pageApiUrl(1), pageApiUrl(2)],
);
assert.equal(
  verificationCalls.every(({ options }) => options.method === "GET"),
  true,
);

await assert.rejects(
  verifyExceptionalCutoverRemoteUpload({
    oauthToken,
    versionId,
    ...remoteBinding,
    fetchImpl: async (url) => {
      if (url === versionApiUrl) return jsonResponse(versionPayload());
      if (url === pageApiUrl(1)) {
        return jsonResponse(
          listPayload(
            [
              summary(versionId, {
                "workers/message": identity.message,
                "workers/tag": identity.tag,
              }),
              summary(otherVersionId, {
                "workers/message": identity.message,
                "workers/tag": identity.tag,
              }),
            ],
            { totalCount: 2 },
          ),
        );
      }
      assert.equal(url, pageApiUrl(2));
      return jsonResponse(listPayload([], { page: 2, totalCount: 2 }));
    },
  }),
  /no es único/,
);

console.log("Exceptional cutover remote version binding: PASS");
