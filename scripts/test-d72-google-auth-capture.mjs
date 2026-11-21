import assert from "node:assert/strict";
import {
  createD72GoogleFlowObservationState,
  d72GoogleAuthResponseRequiresNoStore,
  d72GoogleSocialFormFields,
  inspectD72GoogleBrowserSession,
  routeD72GoogleCaptureRequest,
  runD72GoogleAuthBrowserCapture,
  assertD72GoogleAuthBrowserCaptureReceipt,
  testD72GoogleSessionRevocation,
  testD72WithdrawnGoogleDecision,
} from "./d72-google-auth-capture.mjs";
assert.equal(process.versions.node, "22.22.0");
for (const pathname of [
  "/ingresar/",
  "/ingresar/q-data.json",
  "/registro/q-data.json?x=1",
  "/recuperar/q-data.json",
  "/reenviar-confirmacion/q-data.json",
  "/perfil/acceso-google/q-data.json",
])
  assert.equal(
    d72GoogleAuthResponseRequiresNoStore(`https://agorbis.com${pathname}`),
    true,
  );
assert.equal(
  d72GoogleAuthResponseRequiresNoStore(
    "https://agorbis.com/ingresar-extra/q-data.json",
  ),
  false,
);
assert.equal(
  d72GoogleAuthResponseRequiresNoStore(
    "https://example.com/ingresar/q-data.json",
  ),
  false,
);
for (const contentType of [
  "application/x-www-form-urlencoded",
  "multipart/form-data; boundary=fixture-boundary",
]) {
  const body = contentType.startsWith("multipart")
    ? '--fixture-boundary\r\nContent-Disposition: form-data; name="provider"\r\n\r\ngoogle\r\n--fixture-boundary\r\nContent-Disposition: form-data; name="password"\r\n\r\nfixture-password\r\n--fixture-boundary--\r\n'
    : "provider=google&password=fixture-password";
  const fields = await d72GoogleSocialFormFields({
    postData: () => body,
    headers: () => ({ "content-type": contentType }),
  });
  assert.equal(fields.get("provider"), "google");
  assert.equal(fields.has("password"), false);
}
const startedAtUtc = "2026-09-09T00:00:00.000Z";
const cookieName = "sb-ibtvlvpxwourrxwcrfkf-auth-token";
function cookie(overrides = {}) {
  const session = {
    access_token: `fake.${Buffer.from(JSON.stringify({ amr: [{ method: "oauth" }] })).toString("base64url")}.fake`,
    refresh_token: "fake-refresh",
    user: { id: "fake-user", created_at: startedAtUtc },
    ...overrides,
  };
  return {
    name: cookieName,
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  };
}
assert.equal(
  inspectD72GoogleBrowserSession([cookie()], { startedAtUtc })
    .providerTokensAbsent,
  true,
);
assert.equal(
  inspectD72GoogleBrowserSession(
    [cookie({ provider_token: "fake-provider" })],
    { startedAtUtc },
  ).providerTokensAbsent,
  false,
);
assert.equal(
  inspectD72GoogleBrowserSession([{ ...cookie(), name: `${cookieName}.1` }], {
    startedAtUtc,
  }).sessionPresent,
  null,
);
assert.equal(
  inspectD72GoogleBrowserSession([], { startedAtUtc }).sessionPresent,
  false,
);
assert.ok(
  !JSON.stringify(
    inspectD72GoogleBrowserSession([cookie()], { startedAtUtc }),
  ).includes("fake-refresh"),
);
const flow = createD72GoogleFlowObservationState();
const base = {
  userId: "existing-B",
  emailConfirmed: true,
  createdAt: "2020-01-01T00:00:00Z",
  consentAccepted: true,
  googleIdentity: true,
};
flow.observeVerifiedSession({ ...base, passwordMethod: true });
flow.startGooglePost({ provider: "google", intent: "login", now: 0 });
flow.bindPreflight({
  provider: "google",
  intent: "login",
  startedAt: "1970-01-01T00:00:00Z",
  nonce: "flow-1",
});
flow.observeCallback({
  nonce: "flow-1",
  hasCode: true,
  error: null,
  status: 302,
  locationError: null,
  now: 1000,
});
assert.equal(
  flow.observeVerifiedSession({ ...base, passwordMethod: false })
    .existingAccountCompleted,
  true,
);
assert.equal(
  flow.observeVerifiedSession({
    ...base,
    userId: "unrelated-C",
    passwordMethod: false,
  }).existingAccountCompleted,
  false,
  "Callback must not remain latched for another account",
);
flow.startGooglePost({ provider: null, intent: "login", now: 2000 });
assert.equal(
  flow.observeVerifiedSession({ ...base, passwordMethod: true })
    .googleSessionCompleted,
  false,
  "Email POST is not Google proof",
);
flow.startGooglePost({ provider: "google", intent: "login", now: 0 });
flow.bindPreflight({
  provider: "google",
  intent: "login",
  startedAt: "1970-01-01T00:00:00Z",
  nonce: "flow-2",
});
flow.observeCallback({
  nonce: "different",
  hasCode: true,
  error: null,
  status: 302,
  locationError: null,
  now: 1000,
});
assert.equal(
  flow.observeVerifiedSession({ ...base, passwordMethod: false })
    .googleSessionCompleted,
  false,
);
flow.startGooglePost({ provider: "google", intent: "register", now: 0 });
flow.bindPreflight({
  provider: "google",
  intent: "register",
  startedAt: "1970-01-01T00:00:00Z",
  nonce: "flow-3",
});
assert.deepEqual(
  flow.observeCallback({
    nonce: "flow-3",
    hasCode: true,
    error: null,
    status: 302,
    locationError: "invalid",
    now: 600_001,
  }),
  { cancelled: false, expired: true, consentRejected: false },
);
assert.equal(
  flow.observeVerifiedSession({
    ...base,
    userId: "new-A",
    createdAt: "1970-01-01T00:00:01Z",
    passwordMethod: false,
  }).googleSessionCompleted,
  false,
);
flow.clear();
const calls = [];
function route(url, method = "GET") {
  return {
    request: () => ({
      url: () => url,
      method: () => method,
      headers: () => ({
        "X-Agorbis-D72-Canary": "fake-capability",
        "Cloudflare-Workers-Version-Overrides": "fake-version",
      }),
    }),
    continue: async (options) => calls.push({ kind: "continue", ...options }),
    fetch: async (options) => {
      calls.push({ kind: "fetch", ...options });
      return { dispose: async () => {} };
    },
    fulfill: async () => calls.push({ kind: "fulfill" }),
    abort: async () => calls.push({ kind: "abort" }),
  };
}
await routeD72GoogleCaptureRequest(
  route("https://accounts.google.com/o/oauth2/auth"),
  {
    headersFor: () => {
      throw Error("Must not ask for third-party headers");
    },
  },
);
assert.deepEqual(calls.pop(), { kind: "continue", headers: {} });
await routeD72GoogleCaptureRequest(route("https://agorbis.com/ingresar/"), {
  headersFor: () => ({ "X-Agorbis-D72-Canary": "fixture" }),
});
assert.equal(calls[0].maxRedirects, 0);
assert.equal(calls[0].maxRetries, 0);
assert.equal(calls[0].headers["X-Agorbis-D72-Canary"], "fixture");
calls.length = 0;
await routeD72GoogleCaptureRequest(
  route("https://agorbis.com/propuestas/", "POST"),
  {
    headersFor: () => {
      throw Error("No civic write");
    },
  },
);
assert.deepEqual(calls, [{ kind: "abort" }]);
assert.throws(
  () => assertD72GoogleAuthBrowserCaptureReceipt({}, {}),
  /emitido/,
);
await assert.rejects(runD72GoogleAuthBrowserCapture({}), /bindings/);
function api(sequence) {
  const observed = [];
  return {
    observed,
    post: async (url, options) => {
      observed.push({ url, options });
      const next = sequence.shift();
      assert.ok(next);
      return {
        status: () => next.status,
        json: async () => next.body,
        dispose: async () => {},
      };
    },
  };
}
const revoked = api([
  { status: 204 },
  { status: 400, body: { code: "refresh_token_not_found" } },
]);
assert.deepEqual(
  await testD72GoogleSessionRevocation({
    testOnly: true,
    api: revoked,
    session: {
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
    },
  }),
  { serverSessionRevoked: true, unexpectedRefreshSucceeded: false },
);
assert.equal(revoked.observed.length, 2);
assert.ok(revoked.observed.every((call) => call.options.maxRedirects === 0));
const unexpectedlyLive = api([
  { status: 204 },
  {
    status: 200,
    body: { access_token: "new-fake", refresh_token: "new-fake-refresh" },
  },
  { status: 204 },
]);
assert.deepEqual(
  await testD72GoogleSessionRevocation({
    testOnly: true,
    api: unexpectedlyLive,
    session: {
      access_token: "fake-access-token",
      refresh_token: "fake-refresh-token",
    },
  }),
  { serverSessionRevoked: true, unexpectedRefreshSucceeded: true },
);
assert.equal(
  unexpectedlyLive.observed.length,
  3,
  "Unexpected live session must be revoked",
);
const decision = {
  version: "2026-09-09.1",
  contentHash: "a".repeat(64),
  startedAt: "2026-09-09T00:01:00.000Z",
  locale: "es",
};
const withdrawal = {
  status: "withdrawn",
  last_withdrawn_at: "2026-09-09T00:02:00.000Z",
  current_version: decision.version,
  current_content_hash: decision.contentHash,
};
const rejectedDecision = api([
  { status: 200, body: withdrawal },
  {
    status: 400,
    body: { code: "23514", message: "AGORBIS_GOOGLE_CONSENT_WITHDRAWN" },
  },
  { status: 200, body: withdrawal },
]);
assert.deepEqual(
  await testD72WithdrawnGoogleDecision({
    testOnly: true,
    api: rejectedDecision,
    session: { access_token: "fake-access-token" },
    decision,
  }),
  {
    withdrawalRejected: true,
    unexpectedAcceptance: false,
  },
);
assert.equal(
  rejectedDecision.observed[1].options.data.p_started_at,
  decision.startedAt,
);
const acceptedDecision = api([
  { status: 200, body: withdrawal },
  { status: 200, body: { status: "accepted" } },
  { status: 200, body: withdrawal },
  { status: 200, body: withdrawal },
]);
assert.deepEqual(
  await testD72WithdrawnGoogleDecision({
    testOnly: true,
    api: acceptedDecision,
    session: { access_token: "fake-access-token" },
    decision,
  }),
  {
    withdrawalRejected: false,
    unexpectedAcceptance: true,
  },
);
assert.ok(
  acceptedDecision.observed[2].url.endsWith("/withdraw_google_auth_consent"),
);
const expiredDecision = api([
  { status: 200, body: withdrawal },
  {
    status: 400,
    body: { code: "23514", message: "AGORBIS_GOOGLE_CONSENT_EXPIRED" },
  },
  { status: 200, body: withdrawal },
]);
assert.equal(
  (
    await testD72WithdrawnGoogleDecision({
      testOnly: true,
      api: expiredDecision,
      session: { access_token: "fake-access-token" },
      decision,
    })
  ).withdrawalRejected,
  false,
);
console.log(
  "Google capture: flow/account binding, redaction, exact route scope and cleanup failure handling PASS with fixtures.",
);
