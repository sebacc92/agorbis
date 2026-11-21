import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { assertD72CanaryBrowserCaptureSession } from "./run-d72-canary.mjs";
import { consumeD72CanaryAuthorizationToken } from "./d72-canary-policy.mjs";
import {
  d72StatefulCanaryChecksForRelease,
  validateD72StatefulCanaryManifest,
} from "./d72-stateful-canary-policy.mjs";

const ISSUED = new WeakMap();
const APP_ORIGINS = new Set(["https://agorbis.com", "https://www.agorbis.com"]);
const PRIVATE_SESSION_COOKIE = "sb-ibtvlvpxwourrxwcrfkf-auth-token";
const AUTH_CACHE_PATHS = new Set([
  "/ingresar/",
  "/registro/",
  "/recuperar/",
  "/reenviar-confirmacion/",
  "/consentimiento/",
  "/auth/callback/",
  "/auth/confirm/",
  "/perfil/",
  "/perfil/acceso-google/",
  "/perfil/contrasena/",
]);
const INITIAL_AUTH_PROBES = [
  "/ingresar/",
  "/registro/",
  "/recuperar/",
  "/reenviar-confirmacion/",
];
const AUTH_WRITE_PATHS = new Set([
  "/",
  "/ingresar/",
  "/registro/",
  "/consentimiento/",
  "/perfil/",
  "/perfil/acceso-google/",
  "/perfil/contrasena/",
  "/recuperar/",
  "/reenviar-confirmacion/",
]);
const PROJECT_URL = "https://ibtvlvpxwourrxwcrfkf.supabase.co";
const PUBLIC_KEY = "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s";
const BINDING_KEYS = [
  "candidateIdentityHash",
  "head",
  "requestHash",
  "artifactHash",
  "canaryVersionId",
  "openSourceBaselineSha256",
];
function invariant(ok, message) {
  if (!ok) throw new Error(message);
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function appUrl(value) {
  try {
    const url = new URL(value);
    return APP_ORIGINS.has(url.origin) && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}
function canonicalPath(url) {
  const pathname = url.pathname.replace(/\/q-data\.json\/?$/, "/");
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** Qwik data responses inherit the account route's no-store requirement. */
export function d72GoogleAuthResponseRequiresNoStore(value) {
  const url = appUrl(value);
  return !!url && AUTH_CACHE_PATHS.has(canonicalPath(url));
}

/** Extract only consent/provider discriminators from Qwik's real FormData POST. */
export async function d72GoogleSocialFormFields(request) {
  const allowed = [
    "provider",
    "intent",
    "age_confirmed",
    "privacy_acknowledged",
    "international_transfers_consented",
    "google_auth_consented",
  ];
  const projected = new URLSearchParams();
  let body = request.postData() ?? "";
  if (Buffer.byteLength(body, "utf8") > 128 * 1024) return projected;
  const contentType =
    Object.entries(request.headers()).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1] ?? "";
  try {
    const parsed = contentType.toLowerCase().startsWith("multipart/form-data")
      ? await new Response(body, {
          headers: { "content-type": contentType },
        }).formData()
      : new URLSearchParams(body);
    for (const key of allowed) {
      const values = parsed.getAll(key);
      if (values.length === 1 && typeof values[0] === "string")
        projected.set(key, values[0]);
    }
    return projected;
  } catch {
    return projected;
  } finally {
    body = "";
  }
}

/** Pure redacted projection. Raw cookie/JWT strings never leave this function. */
export function inspectD72GoogleBrowserSession(cookies, { startedAtUtc } = {}) {
  const matching = cookies.filter(
    ({ name }) =>
      name === PRIVATE_SESSION_COOKIE ||
      new RegExp(`^${PRIVATE_SESSION_COOKIE}\\.\\d+$`).test(name),
  );
  if (!matching.length)
    return {
      sessionPresent: false,
      providerTokensAbsent: null,
      httpOnly: null,
      secure: null,
      sameSiteLax: null,
      newAccount: null,
      passwordMethod: null,
    };
  try {
    const parts = matching.sort(
      (a, b) =>
        (Number(a.name.split(".").at(-1)) || 0) -
        (Number(b.name.split(".").at(-1)) || 0),
    );
    invariant(
      !(
        parts.length > 1 &&
        parts.some((part) => part.name === PRIVATE_SESSION_COOKIE)
      ),
      "Cookie ambigua.",
    );
    if (parts[0].name !== PRIVATE_SESSION_COOKIE)
      invariant(
        parts.every(
          (part, index) => part.name === `${PRIVATE_SESSION_COOKIE}.${index}`,
        ),
        "Chunks incompletos.",
      );
    let source = parts.map((part) => part.value).join("");
    if (source.startsWith("base64-"))
      source = Buffer.from(source.slice(7), "base64url").toString("utf8");
    const session = JSON.parse(source);
    source = "";
    invariant(
      session &&
        typeof session.access_token === "string" &&
        typeof session.refresh_token === "string" &&
        typeof session.user?.id === "string",
      "Sesión inválida.",
    );
    const claims = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64url").toString(
        "utf8",
      ),
    );
    return {
      sessionPresent: true,
      providerTokensAbsent:
        !session.provider_token && !session.provider_refresh_token,
      httpOnly: parts.every((cookie) => cookie.httpOnly === true),
      secure: parts.every((cookie) => cookie.secure === true),
      sameSiteLax: parts.every((cookie) => cookie.sameSite === "Lax"),
      newAccount: Number.isFinite(Date.parse(session.user.created_at))
        ? Date.parse(session.user.created_at) >= Date.parse(startedAtUtc)
        : null,
      passwordMethod: Array.isArray(claims.amr)
        ? claims.amr.some((item) => item.method === "password")
        : null,
    };
  } catch {
    return {
      sessionPresent: null,
      providerTokensAbsent: null,
      httpOnly: null,
      secure: null,
      sameSiteLax: null,
      newAccount: null,
      passwordMethod: null,
    };
  }
}
function inMemorySession(cookies) {
  try {
    const parts = cookies
      .filter(
        ({ name }) =>
          name === PRIVATE_SESSION_COOKIE ||
          new RegExp(`^${PRIVATE_SESSION_COOKIE}\\.\\d+$`).test(name),
      )
      .sort(
        (a, b) =>
          (Number(a.name.split(".").at(-1)) || 0) -
          (Number(b.name.split(".").at(-1)) || 0),
      );
    let text = parts.map((cookie) => cookie.value).join("");
    if (text.startsWith("base64-"))
      text = Buffer.from(text.slice(7), "base64url").toString("utf8");
    const session = JSON.parse(text);
    text = "";
    return typeof session?.access_token === "string" &&
      typeof session.user?.id === "string"
      ? session
      : null;
  } catch {
    return null;
  }
}

/** Flow-local state; no report or execution authority is issued here. */
export function createD72GoogleFlowObservationState() {
  const emailAccounts = new Set();
  let flow = null;
  return {
    startGooglePost({ provider, intent, now }) {
      if (provider !== "google") {
        if (flow?.callback) flow = null;
        return;
      }
      flow =
        provider === "google" && ["login", "register"].includes(intent)
          ? {
              intent,
              postAt: now,
              nonce: null,
              startedAt: null,
              callback: false,
              expired: false,
              decision: null,
            }
          : null;
    },
    bindPreflight(context) {
      if (
        flow &&
        context?.provider === "google" &&
        context.intent === flow.intent &&
        Date.parse(context.startedAt) >= flow.postAt &&
        typeof context.nonce === "string"
      ) {
        flow.nonce = context.nonce;
        flow.startedAt = Date.parse(context.startedAt);
        flow.decision = context.googleDecision
          ? { ...context.googleDecision }
          : null;
      }
    },
    currentDecision() {
      return flow?.decision ? { ...flow.decision } : null;
    },
    currentNonce() {
      return flow?.nonce ?? null;
    },
    observeCallback({ nonce, hasCode, error, status, locationError, now }) {
      if (!flow || !flow.nonce || flow.nonce !== nonce)
        return { cancelled: false, expired: false, consentRejected: false };
      flow.expired = now - flow.startedAt > 600_000;
      flow.callback =
        hasCode &&
        !error &&
        status >= 300 &&
        status < 400 &&
        !locationError &&
        !flow.expired;
      return {
        cancelled: error === "access_denied" && locationError === "cancelled",
        expired: flow.expired && locationError === "invalid",
        consentRejected:
          !flow.expired &&
          hasCode &&
          !error &&
          status >= 300 &&
          status < 400 &&
          locationError === "consent",
      };
    },
    observeVerifiedSession({
      userId,
      emailConfirmed,
      createdAt,
      passwordMethod,
      consentAccepted,
      googleIdentity = false,
    }) {
      if (passwordMethod === true && emailConfirmed) emailAccounts.add(userId);
      const outcome = {
        newAccountCompleted: false,
        existingAccountCompleted: false,
        googleSessionCompleted: false,
      };
      if (
        flow?.callback &&
        consentAccepted &&
        googleIdentity &&
        emailConfirmed &&
        passwordMethod !== true
      ) {
        outcome.newAccountCompleted =
          flow.intent === "register" &&
          Date.parse(createdAt) >= flow.startedAt &&
          !emailAccounts.has(userId);
        outcome.existingAccountCompleted =
          flow.intent === "login" && emailAccounts.has(userId);
        outcome.googleSessionCompleted =
          outcome.newAccountCompleted || outcome.existingAccountCompleted;
        flow = null;
      }
      return outcome;
    },
    clear() {
      flow = null;
      emailAccounts.clear();
    },
  };
}

async function verifyD72WithdrawnGoogleDecision(api, session, decision) {
  const headers = {
    apikey: PUBLIC_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
  const rpc = async (name, data) => {
    const response = await api.post(`${PROJECT_URL}/rest/v1/rpc/${name}`, {
      headers,
      data,
      maxRedirects: 0,
      timeout: 10000,
    });
    try {
      return { status: response.status(), data: await response.json() };
    } finally {
      await response.dispose();
    }
  };
  const before = await rpc("my_google_auth_consent", {});
  if (
    before.status !== 200 ||
    before.data?.status !== "withdrawn" ||
    !Number.isFinite(Date.parse(decision?.startedAt)) ||
    Date.parse(decision.startedAt) >
      Date.parse(before.data.last_withdrawn_at) ||
    before.data.current_version !== decision.version ||
    before.data.current_content_hash !== decision.contentHash
  )
    return { withdrawalRejected: false, unexpectedAcceptance: false };
  const attempt = await rpc("grant_google_auth_consent", {
    p_version: decision.version,
    p_content_hash: decision.contentHash,
    p_started_at: decision.startedAt,
    p_locale: decision.locale,
    p_expressly_accepted: true,
  });
  const unexpectedAcceptance = attempt.status === 200;
  if (unexpectedAcceptance) await rpc("withdraw_google_auth_consent", {});
  const after = await rpc("my_google_auth_consent", {});
  return {
    withdrawalRejected:
      attempt.status === 400 &&
      attempt.data?.code === "23514" &&
      attempt.data?.message === "AGORBIS_GOOGLE_CONSENT_WITHDRAWN" &&
      after.status === 200 &&
      after.data?.status === "withdrawn",
    unexpectedAcceptance,
  };
}

/** Each redirect gets a new routing decision. Canary headers never follow OAuth redirects. */
export async function routeD72GoogleCaptureRequest(
  route,
  {
    headersFor,
    onRequest = () => {},
    onResponse = () => {},
    onBlocked = () => {},
  },
) {
  const request = route.request();
  const url = appUrl(request.url());
  const headers = { ...request.headers() };
  for (const name of Object.keys(headers))
    if (
      ["cloudflare-workers-version-overrides", "x-agorbis-d72-canary"].includes(
        name.toLowerCase(),
      )
    )
      delete headers[name];
  if (!url) {
    await route.continue({ headers });
    return;
  }
  if (
    !["GET", "HEAD"].includes(request.method()) &&
    !(request.method() === "POST" && AUTH_WRITE_PATHS.has(canonicalPath(url)))
  ) {
    onBlocked();
    await route.abort("blockedbyclient");
    return;
  }
  // fetch maxRedirects=0 prevents header propagation to Google/Supabase. The
  // browser follows a returned Location as a separately intercepted request.
  await onRequest({ request, url });
  const response = await route.fetch({
    headers: { ...headers, ...headersFor(url.href) },
    maxRedirects: 0,
    maxRetries: 0,
    timeout: 30_000,
  });
  try {
    await onResponse({ request, response, url });
    await route.fulfill({ response });
  } finally {
    await response.dispose();
  }
}

function newFacts(profile) {
  return Object.fromEntries(
    d72StatefulCanaryChecksForRelease(profile)
      .filter(({ id }) =>
        [
          "auth.google-oauth",
          "auth.pkce",
          "security.cookies",
          "auth.account-lifecycle",
        ].includes(id),
      )
      .map(({ id, passingFacts }) => [
        id,
        Object.fromEntries(Object.keys(passingFacts).map((key) => [key, null])),
      ]),
  );
}
function finishReceipt({
  bindings,
  attachedDeploymentId,
  startedAtUtc,
  facts,
  cleanup,
  failed,
  testOnly,
  statefulManifestHash,
  statefulAuthorizationEvidence,
}) {
  const completedAtUtc = new Date().toISOString();
  const definitions = d72StatefulCanaryChecksForRelease({
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: bindings.openSourceBaselineSha256,
  });
  const evidence = Object.entries(facts).map(([checkId, observed]) => {
    const required = definitions.find(({ id }) => id === checkId).passingFacts;
    const passed = Object.entries(required).every(
      ([key, value]) => observed[key] === value,
    );
    const disproved = Object.entries(required).some(
      ([key, value]) => observed[key] !== null && observed[key] !== value,
    );
    return {
      checkId,
      status: passed ? "PASS" : disproved ? "FAIL" : "NOT_VERIFIED",
      observedAtUtc: completedAtUtc,
      facts: observed,
    };
  });
  const payload = {
    schemaVersion: "agorbis-d72-google-browser-capture/v1",
    ...bindings,
    attachedDeploymentId,
    statefulManifestHash,
    statefulAuthorizationEvidence,
    startedAtUtc,
    completedAtUtc,
    evidence,
    cleanup,
    rawCredentialsStored: false,
    providerHeadersForwarded: false,
    browserContextDestroyed: true,
    failed,
  };
  const receipt = freeze({
    ...payload,
    contentSha256: createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
  });
  ISSUED.set(receipt, { testOnly, bindings });
  return receipt;
}

/** Uses only the current test user's credentials; never service role. */
async function verifyD72GoogleTestSessionRevocation(api, session) {
  let unexpectedRefreshSucceeded = false,
    serverSessionRevoked = false;
  const logout = await api.post(`${PROJECT_URL}/auth/v1/logout?scope=global`, {
    headers: {
      apikey: PUBLIC_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    maxRedirects: 0,
    timeout: 10_000,
  });
  try {
    if (logout.status() !== 204)
      return { serverSessionRevoked: false, unexpectedRefreshSucceeded: false };
  } finally {
    await logout.dispose();
  }
  const refresh = await api.post(
    `${PROJECT_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      headers: { apikey: PUBLIC_KEY },
      data: { refresh_token: session.refresh_token },
      maxRedirects: 0,
      timeout: 10_000,
    },
  );
  try {
    const result = await refresh.json();
    if (
      refresh.status() === 400 &&
      [
        "refresh_token_not_found",
        "refresh_token_already_used",
        "session_not_found",
      ].includes(result?.error_code ?? result?.code)
    )
      serverSessionRevoked = true;
    else if (
      refresh.status() === 200 &&
      typeof result?.access_token === "string"
    ) {
      unexpectedRefreshSucceeded = true;
      const cleanup = await api.post(
        `${PROJECT_URL}/auth/v1/logout?scope=global`,
        {
          headers: {
            apikey: PUBLIC_KEY,
            Authorization: `Bearer ${result.access_token}`,
          },
          maxRedirects: 0,
          timeout: 10_000,
        },
      );
      try {
        serverSessionRevoked = cleanup.status() === 204;
      } finally {
        await cleanup.dispose();
        result.access_token = "";
        result.refresh_token = "";
      }
    }
  } finally {
    await refresh.dispose();
  }
  return { serverSessionRevoked, unexpectedRefreshSucceeded };
}

/**
 * Runs ONLY after the stateful /dev/tty authorization and a live opaque 100/0
 * session. The owner operates Google's UI and enters credentials in that UI.
 * No passwords, providers' tokens, HAR, traces, screenshots, user IDs, emails,
 * storageState or callback URLs are written. Closing the browser ends capture.
 * This collector reports only facts actually observed; it cannot certify MFA,
 * civic fixtures, private Storage/RLS, or mailbox delivery by inference.
 */
export async function runD72GoogleAuthBrowserCapture({
  canarySession,
  bindings,
  statefulManifest,
  statefulAuthorizationToken,
} = {}) {
  invariant(
    bindings &&
      Object.keys(bindings).sort().join() ===
        BINDING_KEYS.slice().sort().join(),
    "El capturador exige los seis bindings exactos.",
  );
  invariant(
    !process.env.DEBUG &&
      !process.env.PWDEBUG &&
      !process.env.PW_TEST_TRACE_DIR,
    "El capturador no admite modos de debug/tracing.",
  );
  const controller = await assertD72CanaryBrowserCaptureSession(
    canarySession,
    bindings,
  );
  const errors = validateD72StatefulCanaryManifest(statefulManifest, {
    expectedBindings: {
      head: bindings.head,
      requestHash: bindings.requestHash,
      policyHash: statefulManifest?.policyHash,
      artifactHash: bindings.artifactHash,
      canaryVersionId: bindings.canaryVersionId,
      releaseMode: "OPEN_UPDATE",
      openSourceBaselineSha256: bindings.openSourceBaselineSha256,
    },
  });
  invariant(
    !errors.length,
    "El manifiesto Google/stateful no coincide con el canario vigente.",
  );
  const statefulAuthorizationEvidence = consumeD72CanaryAuthorizationToken(
    statefulAuthorizationToken,
    {
      kind: "stateful",
      bindings: {
        head: bindings.head,
        canaryId: statefulManifest.canaryId,
        statefulManifestHash: statefulManifest.contentSha256,
      },
    },
  );
  const startedAtUtc = new Date().toISOString();
  const facts = newFacts(statefulManifest);
  const withdrawn = new Set();
  const closed = new Set();
  const sessions = new Map();
  const observedAccounts = new Set();
  let lastAccount = null;
  let cacheFailed = false,
    initialAuthProbeCount = 0;
  const withdrawnDecisionRejected = new Set(),
    withdrawnCallbackRejected = new Set();
  const attemptedWithdrawnDecisions = new Set();
  const flowObserver = createD72GoogleFlowObservationState();
  const observeCache = (pathname, headers) => {
    if (
      AUTH_CACHE_PATHS.has(pathname) &&
      !/(?:^|,)\s*(?:private,\s*)?no-store(?:\s*,|$)/i.test(
        headers["cache-control"] ?? "",
      )
    )
      cacheFailed = true;
  };
  let failed = false,
    finished = false,
    browser,
    context;
  try {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      locale: "es-AR",
    });
    context.setDefaultTimeout(10_000);
    browser.on("disconnected", () => {
      finished = true;
    });
    context.on("close", () => {
      finished = true;
    });
    await context.route("**/*", (route) =>
      routeD72GoogleCaptureRequest(route, {
        headersFor: controller.headersFor,
        onBlocked: () => {
          failed = true;
        },
        onRequest: async ({ request, url }) => {
          const pathname = canonicalPath(url);
          if (
            request.method() === "POST" &&
            ["/ingresar/", "/registro/"].includes(pathname)
          ) {
            // Read the social form's provider discriminator only; no body is
            // retained, printed, serialized or included in error messages.
            const form = await d72GoogleSocialFormFields(request);
            flowObserver.startGooglePost({
              provider: form.get("provider"),
              intent: form.get("intent") ?? "login",
              now: Date.now(),
            });
          }
          if (pathname === "/auth/callback/") {
            const cookie = (
              await context.cookies(["https://agorbis.com/auth/callback/"])
            ).find((item) => item.name === "agorbis-oauth-context");
            if (cookie)
              try {
                flowObserver.bindPreflight(
                  JSON.parse(decodeURIComponent(cookie.value)),
                );
              } catch {
                /* no proof */
              }
          }
        },
        onResponse: async ({ request, response, url }) => {
          const pathname = canonicalPath(url);
          observeCache(pathname, response.headers());
          if (pathname === "/auth/callback/") {
            let locationError = null;
            try {
              locationError = new URL(
                response.headers().location,
                url.origin,
              ).searchParams.get("oauth_error");
            } catch {
              /* no redirect proof */
            }
            const observed = flowObserver.observeCallback({
              nonce: url.searchParams.get("consent"),
              hasCode: url.searchParams.has("code"),
              error: url.searchParams.get("error"),
              status: response.status(),
              locationError,
              now: Date.now(),
            });
            if (observed.cancelled)
              facts["auth.google-oauth"].cancellationReturnedSafely = true;
            if (observed.expired) {
              facts["auth.google-oauth"].expiredReturnRejected = true;
              facts["auth.pkce"].missingOrReplayRejected = true;
            }
            if (observed.consentRejected)
              withdrawnCallbackRejected.add(url.searchParams.get("consent"));
          }
          // Required attributes alone do not prove server-side rejection. Only a
          // real negative response can be evidence; until then these stay null.
          if (
            request.method() === "POST" &&
            ["/ingresar/", "/registro/"].includes(pathname) &&
            response.status() === 400
          ) {
            const form = await d72GoogleSocialFormFields(request);
            if (form.get("provider") === "google") {
              const text = await response.text();
              const basic =
                form.get("age_confirmed") === "si" &&
                form.get("privacy_acknowledged") === "si";
              if (
                basic &&
                form.get("international_transfers_consented") !== "si" &&
                text.includes(
                  "confirmá la edad, el aviso de privacidad y el consentimiento para las transferencias internacionales",
                )
              )
                facts["auth.google-oauth"].generalConsentRequired = true;
              if (
                basic &&
                form.get("google_auth_consented") !== "si" &&
                form.get("international_transfers_consented") === "si" &&
                text.includes("Para usar Google, aceptá su aviso opcional")
              )
                facts["auth.google-oauth"].googleConsentRequired = true;
            }
          }
        },
      }).catch(() => {
        failed = true;
      }),
    );
    for (const pathname of INITIAL_AUTH_PROBES)
      for (const method of ["GET", "HEAD"]) {
        const probe = await context.request.fetch(
          `https://agorbis.com${pathname}`,
          {
            method,
            headers: controller.headersFor(`https://agorbis.com${pathname}`),
            maxRedirects: 0,
            timeout: 10_000,
          },
        );
        try {
          observeCache(pathname, probe.headers());
          if (probe.status() !== 200) cacheFailed = true;
          initialAuthProbeCount += 1;
        } finally {
          await probe.dispose();
        }
      }
    const page = await context.newPage();
    await page.goto("https://agorbis.com/ingresar/", {
      waitUntil: "domcontentloaded",
    });
    process.stdout.write(
      "Prueba Google autorizada: primero ingresá por correo con la cuenta existente B, cerrá sesión y luego ingresá a esa misma cuenta con Google. Registrá la cuenta nueva A con Google. En cada cuenta retirale el consentimiento desde Perfil > Acceso con Google y cerrá sesión; la limpieza autorizada cerrará sus demás sesiones. No se borra ni desvincula B. Cerrá esta ventana al terminar. Los casos no observados quedarán pendientes.\n",
    );
    process.stdout.write(
      "Para el retorno posterior al retiro: dejá un inicio Google de B pendiente en la selección de cuenta; en otra pestaña de esta ventana ingresá por correo a B y retirale el consentimiento. Esperá el aviso del capturador y después completá aquel retorno Google. Iniciar otra ceremonia con una aceptación nueva no prueba este caso.\n",
    );
    const captureDeadline = Date.parse(controller.expiresAtUtc) - 30_000;
    while (!finished && Date.now() < captureDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (finished) break;
      try {
        const cookies = await context.cookies([
          "https://agorbis.com/auth/callback/",
        ]);
        const preflight = cookies.find(
          (cookie) => cookie.name === "agorbis-oauth-context",
        );
        if (preflight)
          try {
            flowObserver.bindPreflight(
              JSON.parse(decodeURIComponent(preflight.value)),
            );
          } catch {
            /* no proof */
          }
        const projection = inspectD72GoogleBrowserSession(cookies, {
          startedAtUtc,
        });
        const session = inMemorySession(cookies);
        if (!session && lastAccount) {
          if (withdrawn.has(lastAccount) && sessions.has(lastAccount)) {
            const revoked = await verifyD72GoogleTestSessionRevocation(
              context.request,
              sessions.get(lastAccount),
            );
            if (revoked.serverSessionRevoked) {
              closed.add(lastAccount);
              process.stdout.write(
                `Limpieza de sesiones confirmada para ${closed.size} de 2 cuentas de prueba.\n`,
              );
            }
            if (
              revoked.unexpectedRefreshSucceeded ||
              !revoked.serverSessionRevoked
            )
              failed = true;
          }
          const prior = sessions.get(lastAccount);
          if (prior) {
            prior.access_token = "";
            prior.refresh_token = "";
          }
          sessions.delete(lastAccount);
          lastAccount = null;
        }
        if (session && projection.sessionPresent === true) {
          lastAccount = session.user.id;
          invariant(
            observedAccounts.has(lastAccount) || observedAccounts.size < 2,
            "El capturador sólo admite las dos cuentas de prueba.",
          );
          observedAccounts.add(lastAccount);
          sessions.set(lastAccount, {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          // Read-only RPC under the current user's JWT. No service role and no
          // caller-selected account, endpoint or provider credential are used.
          const consentResponse = await context.request.post(
            `${PROJECT_URL}/rest/v1/rpc/my_google_auth_consent`,
            {
              headers: {
                apikey: PUBLIC_KEY,
                Authorization: `Bearer ${session.access_token}`,
              },
              data: {},
              maxRedirects: 0,
              timeout: 10_000,
            },
          );
          let consent;
          try {
            if (consentResponse.status() === 200)
              consent = await consentResponse.json();
          } finally {
            await consentResponse.dispose();
          }
          const userResponse = await context.request.get(
            `${PROJECT_URL}/auth/v1/user`,
            {
              headers: {
                apikey: PUBLIC_KEY,
                Authorization: `Bearer ${session.access_token}`,
              },
              maxRedirects: 0,
              timeout: 10_000,
            },
          );
          let user;
          try {
            if (userResponse.status() === 200) user = await userResponse.json();
          } finally {
            await userResponse.dispose();
          }
          if (user?.id !== session.user.id)
            throw new Error("Sesión no verificada.");
          const consentAccepted =
            consent?.provider === "google" &&
            consent.status === "accepted" &&
            consent.notice_hash === consent.current_content_hash &&
            consent.notice_version === consent.current_version;
          if (consentAccepted) facts["auth.google-oauth"].consentStored = true;
          const googleFlow = flowObserver.observeVerifiedSession({
            userId: user.id,
            emailConfirmed: Number.isFinite(
              Date.parse(user.email_confirmed_at),
            ),
            createdAt: user.created_at,
            passwordMethod: projection.passwordMethod,
            consentAccepted,
            googleIdentity:
              Array.isArray(user.identities) &&
              user.identities.some(
                (identity) => identity.provider === "google",
              ),
          });
          if (googleFlow.newAccountCompleted)
            facts["auth.google-oauth"].newAccountCompleted = true;
          if (googleFlow.existingAccountCompleted)
            facts["auth.google-oauth"].existingAccountCompleted = true;
          if (googleFlow.googleSessionCompleted) {
            facts["auth.google-oauth"].finalSessionEstablished = true;
            facts["auth.pkce"].codeExchangeCompleted = true;
            facts["auth.pkce"].exactRedirectObserved = true;
          }
          if (
            consent?.provider === "google" &&
            consent.status === "withdrawn" &&
            consent.withdrawn_at &&
            consent.last_withdrawn_at
          ) {
            withdrawn.add(session.user.id);
            const decision = flowObserver.currentDecision();
            const decisionNonce = flowObserver.currentNonce();
            const attemptKey = decision
              ? `${user.id}:${decision.startedAt}`
              : null;
            if (
              decision &&
              decisionNonce &&
              !attemptedWithdrawnDecisions.has(attemptKey)
            ) {
              attemptedWithdrawnDecisions.add(attemptKey);
              const rejection = await verifyD72WithdrawnGoogleDecision(
                context.request,
                session,
                decision,
              );
              if (rejection.withdrawalRejected) {
                withdrawnDecisionRejected.add(decisionNonce);
                process.stdout.write(
                  "Retiro verificado para la decisión pendiente: ahora podés completar aquel retorno Google.\n",
                );
              }
              if (rejection.unexpectedAcceptance) failed = true;
            }
          }
          for (const key of [
            "httpOnly",
            "secure",
            "sameSiteLax",
            "providerTokensAbsent",
          ])
            facts["security.cookies"][key] =
              facts["security.cookies"][key] === false
                ? false
                : projection[key];
          facts["auth.google-oauth"].providerTokensAbsent =
            facts["auth.google-oauth"].providerTokensAbsent === false
              ? false
              : projection.providerTokensAbsent;
          facts["auth.pkce"].providerTokensAbsent =
            projection.providerTokensAbsent;
          if (projection.passwordMethod === true) {
            facts["auth.google-oauth"].emailAccessPreserved = true;
            facts["auth.account-lifecycle"].loginCompleted = true;
          }
          session.access_token = "";
          session.refresh_token = "";
        }
      } catch {
        failed = true;
        break;
      }
    }
    if (!finished && Date.now() >= captureDeadline) failed = true;
  } catch {
    failed = true;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
  facts["auth.google-oauth"].testAccountGoogleConsentRevoked =
    withdrawn.size >= 2 ? true : null;
  facts["auth.google-oauth"].testAccountSessionsRevoked =
    closed.size >= 2 ? true : null;
  facts["auth.google-oauth"].withdrawalBlocksFutureGoogleAccess = [
    ...withdrawnDecisionRejected,
  ].some((nonce) => withdrawnCallbackRejected.has(nonce))
    ? true
    : null;
  facts["auth.google-oauth"].authResponsesNoStore = cacheFailed
    ? false
    : initialAuthProbeCount === 8
      ? true
      : null;
  const cleanup = {
    twoDistinctTestAccountsObserved: withdrawn.size >= 2,
    consentsWithdrawn: withdrawn.size >= 2,
    testSessionsClosed: closed.size >= 2,
    serverSessionRevocation: closed.size >= 2 ? "PASS" : "NOT_VERIFIED",
  };
  withdrawn.clear();
  closed.clear();
  lastAccount = null;
  flowObserver.clear();
  for (const session of sessions.values()) {
    session.access_token = "";
    session.refresh_token = "";
  }
  sessions.clear();
  observedAccounts.clear();
  attemptedWithdrawnDecisions.clear();
  withdrawnDecisionRejected.clear();
  withdrawnCallbackRejected.clear();
  return finishReceipt({
    bindings,
    attachedDeploymentId: controller.attachedDeploymentId,
    startedAtUtc,
    facts,
    cleanup,
    failed,
    testOnly: false,
    statefulManifestHash: statefulManifest.contentSha256,
    statefulAuthorizationEvidence,
  });
}
export function assertD72GoogleAuthBrowserCaptureReceipt(
  receipt,
  bindings,
  { allowTestOnly = false } = {},
) {
  const issued = ISSUED.get(receipt);
  invariant(
    issued && (!issued.testOnly || allowTestOnly),
    "Falta un receipt de observaciones Google emitido en esta corrida.",
  );
  for (const key of BINDING_KEYS)
    invariant(
      issued.bindings[key] === bindings[key],
      `El capturador no coincide con ${key}.`,
    );
  return receipt;
}

export async function testD72GoogleSessionRevocation({
  testOnly,
  api,
  session,
} = {}) {
  invariant(
    testOnly === true &&
      session?.access_token === "fake-access-token" &&
      session?.refresh_token === "fake-refresh-token",
    "El seam sólo admite credenciales ficticias exactas.",
  );
  return verifyD72GoogleTestSessionRevocation(api, session);
}

export async function testD72WithdrawnGoogleDecision({
  testOnly,
  api,
  session,
  decision,
} = {}) {
  invariant(
    testOnly === true && session?.access_token === "fake-access-token",
    "El seam sólo admite credenciales ficticias exactas.",
  );
  return verifyD72WithdrawnGoogleDecision(api, session, decision);
}
