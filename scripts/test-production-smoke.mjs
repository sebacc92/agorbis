import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AAIP_PENDING_COPY } from "./aaip-registration-policy.mjs";
import { EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION } from "./exceptional-release-act.mjs";
import { GOOGLE_PROCESSING_DISCLOSURE } from "./google-processing-disclosure.mjs";
import {
  AUTHORIZED_RISK_OWNER,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";
import {
  createExceptionalProductionSmokeLegalProfile,
  parseProductionSmokeArguments,
  PRODUCTION_SMOKE_CONSTANTS,
  runProductionCronSmoke,
  runProductionReadOnlySmoke,
} from "./production-smoke-policy.mjs";

const requestId = "d765c8e8-07d1-468d-8527-1f9ccf2612d2";
const securityHeaders = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' 'nonce-fixture' 'strict-dynamic' https://challenges.cloudflare.com",
    "script-src-attr 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; "),
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-request-id": requestId,
  "cf-ray": "0123456789abcdef-EZE",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function successfulFetch(overrides = new Map()) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (overrides.has(url)) return overrides.get(url)(init);

    if (
      url === `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/internal/health/`
    ) {
      return Response.json(
        {
          status: "ok",
          checks: { database: "ok", auth: "ok", storage: "ok" },
          durationMs: 7,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (
      PRODUCTION_SMOKE_CONSTANTS.cronPaths.some(
        (entry) =>
          url === `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}${entry}`,
      )
    ) {
      return Response.json(
        { error: "No autorizado" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    if (
      PRODUCTION_SMOKE_CONSTANTS.malformedResourcePaths.some(
        (entry) =>
          url === `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}${entry}`,
      )
    ) {
      return new Response("No encontrado", { status: 404 });
    }
    if (url.startsWith("https://www.agorbis.com/")) {
      return new Response(null, {
        status: 308,
        headers: {
          location: `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/smoke-path?check=1`,
        },
      });
    }
    if (
      url ===
      `${PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin}/auth/v1/signup`
    ) {
      return Response.json({ error_code: "captcha_failed" }, { status: 400 });
    }
    if (
      PRODUCTION_SMOKE_CONSTANTS.publicPaths.some(
        (entry) =>
          url === `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}${entry}`,
      )
    ) {
      return new Response(
        "<!doctype html><html><title>Agorbis</title><body>Agorbis · Código de responsable AAIP: RL-2026-81658385-APN-DNPDP#AAIP · Número de registro de la base AAIP: AAIP-DB-TEST-2026-12345678</body></html>",
        { headers: securityHeaders },
      );
    }
    throw new Error(`URL de prueba inesperada: ${url}`);
  };
  return { calls, fetchImpl };
}

const publishableKey = `sb_publishable_${"A".repeat(24)}`;
const head = "a".repeat(40);
const now = new Date("2026-09-07T12:00:00.000Z");
const request = {
  schemaVersion: EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  policyVersion: RELEASE_GATE_POLICY_VERSION,
  policyHash: RELEASE_GATE_POLICY_SHA256,
  head,
  owner: AUTHORIZED_RISK_OWNER,
  timestampUtc: now.toISOString(),
  deploymentAuthorized: false,
  risks: OWNER_WAIVER_CANDIDATE_GATE_IDS.map((gateId) => {
    const gate = getReleaseGateDefinition(gateId);
    return {
      gateId,
      evidenceStatus: gate.evidenceStatus,
      rawResult: gate.rawResult,
      requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
      acceptedConsequence: gate.consequence,
      reviewRequiredBy: gate.reviewRequiredBy,
    };
  }),
};
const legalProfile = createExceptionalProductionSmokeLegalProfile({
  request,
  currentHead: head,
  now,
});
const pendingCopy = PRODUCTION_SMOKE_CONSTANTS.exceptionalPendingCopy;
const legalSource = readFileSync(
  new URL("../src/lib/legal-content.ts", import.meta.url),
  "utf8",
);
for (const expected of [AAIP_PENDING_COPY.es, ...Object.values(pendingCopy)]) {
  assert.ok(
    legalSource.includes(expected),
    "El smoke debe coincidir con el copy ES publicado.",
  );
}
const html = (body) =>
  `<!doctype html><html><title>Agorbis</title><body>Agorbis ${body}</body></html>`;
const pendingPrivacyHtml = html(
  `<p>Código de responsable AAIP: RL-2026-81658385-APN-DNPDP&#35;AAIP</p><p>${AAIP_PENDING_COPY.es}</p>`,
);
const pendingProvidersHtml = html(
  [
    `<p>${pendingCopy.registerWarning}</p>`,
    ...["Supabase", "Resend", "Cloudflare DNS + Turnstile + Edge Compute"].map(
      (provider) =>
        `<h2>${provider}</h2><dl><dt>Lugar de tratamiento</dt><dd>${pendingCopy.processingLocationPending}<span>${pendingCopy.pendingLabel}</span></dd></dl>`,
    ),
    `<h2>Salvaguardas de transferencia</h2><p>${pendingCopy.transferSafeguardsPending}</p>`,
    `<h2>Retención de proveedores</h2><p>${pendingCopy.providerRetentionPending}</p>`,
  ].join(""),
);
// D122: con Google ofrecido, el registro suma una cuarta tarjeta cuya ubicación
// es la disclosure versionada, sin etiqueta de pendiente.
const providerCard = (provider, location) =>
  `<h2>${provider}</h2><dl><dt>Función</dt><dd>Prueba</dd><dt>Lugar de tratamiento</dt><dd>${location}</dd></dl>`;
const withGoogleProvidersHtml = pendingProvidersHtml.replace(
  "<h2>Salvaguardas de transferencia</h2>",
  `${providerCard("Google", GOOGLE_PROCESSING_DISCLOSURE.es)}<h2>Salvaguardas de transferencia</h2>`,
);
function exceptionalFetch(overrides = new Map()) {
  return successfulFetch(
    new Map([
      [
        "https://agorbis.com/privacidad/",
        () => new Response(pendingPrivacyHtml, { headers: securityHeaders }),
      ],
      [
        "https://agorbis.com/subencargados/",
        () => new Response(pendingProvidersHtml, { headers: securityHeaders }),
      ],
      ...overrides,
    ]),
  );
}
const smokeOptions = {
  supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
  publishableKey,
  now,
};
assert.deepEqual(parseProductionSmokeArguments([]), {});
assert.deepEqual(
  parseProductionSmokeArguments(["--exceptional-request", "/tmp/request.json"]),
  { exceptionalRequestPath: "/tmp/request.json" },
);
for (const argv of [
  ["--legal-status", "pending"],
  ["--exceptional-request"],
  ["--exceptional-request", "relative.json"],
  ["--exceptional-request", "/tmp/request.json", "--skip-security"],
]) {
  assert.throws(() => parseProductionSmokeArguments(argv), /Uso:/);
}
for (const [changedRequest, error] of [
  [{ ...request, head: "b".repeat(40) }, /HEAD stale/],
  [{ ...request, policyHash: "b".repeat(64) }, /policyHash stale/],
  [
    {
      ...request,
      timestampUtc: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
    },
    /24 horas/,
  ],
  [
    {
      ...request,
      risks: request.risks.filter(
        ({ gateId }) => gateId !== "privacy.provider-retention-unverified",
      ),
    },
    /exige privacy.provider-retention-unverified/,
  ],
]) {
  assert.throws(
    () =>
      createExceptionalProductionSmokeLegalProfile({
        request: changedRequest,
        currentHead: head,
        now,
      }),
    error,
  );
}
let invalidProfileCalls = 0;
await assert.rejects(
  runProductionReadOnlySmoke({
    ...smokeOptions,
    legalProfile: { mode: "exceptional-pending" },
    fetchImpl: async () => {
      invalidProfileCalls += 1;
    },
  }),
  /request validado/,
);
assert.equal(invalidProfileCalls, 0);
const expiredProfileFetch = exceptionalFetch();
await assert.rejects(
  runProductionReadOnlySmoke({
    ...smokeOptions,
    legalProfile,
    now: new Date(now.getTime() + 25 * 60 * 60 * 1000),
    fetchImpl: expiredProfileFetch.fetchImpl,
  }),
  /24 horas/,
);
assert.equal(expiredProfileFetch.calls.length, 0);
const honestPending = exceptionalFetch();
const exceptionalResult = await runProductionReadOnlySmoke({
  ...smokeOptions,
  legalProfile,
  fetchImpl: honestPending.fetchImpl,
});
assert.equal(exceptionalResult.completed.length, 22);
assert.equal(exceptionalResult.legalStatus, "pending-external-evidence");
assert.equal(
  honestPending.calls.filter(({ init }) => init.method === "POST").length,
  1,
);
const qwikMarkup = exceptionalFetch(
  new Map([
    [
      "https://agorbis.com/subencargados/",
      () =>
        new Response(
          pendingProvidersHtml.replaceAll(
            "Lugar de tratamiento",
            "<!--t=0-->Lugar de tratamiento<!--/t-->",
          ),
          { headers: securityHeaders },
        ),
    ],
  ]),
);
assert.equal(
  (
    await runProductionReadOnlySmoke({
      ...smokeOptions,
      legalProfile,
      fetchImpl: qwikMarkup.fetchImpl,
    })
  ).completed.length,
  22,
);
const withGoogle = exceptionalFetch(
  new Map([
    [
      "https://agorbis.com/subencargados/",
      () => new Response(withGoogleProvidersHtml, { headers: securityHeaders }),
    ],
  ]),
);
assert.equal(
  (
    await runProductionReadOnlySmoke({
      ...smokeOptions,
      legalProfile,
      fetchImpl: withGoogle.fetchImpl,
    })
  ).completed.length,
  22,
);
await assert.rejects(
  runProductionReadOnlySmoke({
    ...smokeOptions,
    fetchImpl: exceptionalFetch().fetchImpl,
  }),
  /AAIP como pendiente/,
);
await assert.rejects(
  runProductionReadOnlySmoke({
    ...smokeOptions,
    fetchImpl: successfulFetch(
      new Map([
        [
          "https://agorbis.com/subencargados/",
          () =>
            new Response(pendingProvidersHtml, { headers: securityHeaders }),
        ],
      ]),
    ).fetchImpl,
  }),
  /evidencia legal pendiente/,
);
for (const [url, body, error] of [
  [
    "https://agorbis.com/privacidad/",
    pendingPrivacyHtml.replace(
      AAIP_PENDING_COPY.es,
      "Número de registro de la base ante la AAIP: 123456",
    ),
    /pendiente honesto/,
  ],
  [
    "https://agorbis.com/privacidad/",
    pendingPrivacyHtml.replace(
      "</body>",
      "Número de registro de la base ante la AAIP: 123456</body>",
    ),
    /inscripción AAIP aprobada/,
  ],
  [
    "https://agorbis.com/subencargados/",
    pendingProvidersHtml.replace(
      pendingCopy.processingLocationPending,
      "Estados Unidos",
    ),
    /tres destinos pendientes/,
  ],
  [
    "https://agorbis.com/subencargados/",
    withGoogleProvidersHtml.replace(
      providerCard("Google", GOOGLE_PROCESSING_DISCLOSURE.es),
      providerCard("Google", "Estados Unidos"),
    ),
    /sumar Google con la ubicación declarada/,
  ],
  [
    "https://agorbis.com/subencargados/",
    withGoogleProvidersHtml.replace(
      providerCard("Google", GOOGLE_PROCESSING_DISCLOSURE.es),
      providerCard(
        "Google",
        `${pendingCopy.processingLocationPending}<span>${pendingCopy.pendingLabel}</span>`,
      ),
    ),
    /sumar Google con la ubicación declarada/,
  ],
  [
    "https://agorbis.com/subencargados/",
    withGoogleProvidersHtml.replace(
      providerCard("Google", GOOGLE_PROCESSING_DISCLOSURE.es),
      providerCard("Meta / Facebook", GOOGLE_PROCESSING_DISCLOSURE.es),
    ),
    /proveedor no previsto: Meta \/ Facebook/,
  ],
  [
    "https://agorbis.com/subencargados/",
    withGoogleProvidersHtml.replace(
      providerCard("Google", GOOGLE_PROCESSING_DISCLOSURE.es),
      providerCard("Google", GOOGLE_PROCESSING_DISCLOSURE.es).repeat(2),
    ),
    /repite el proveedor Google/,
  ],
  [
    "https://agorbis.com/subencargados/",
    withGoogleProvidersHtml.replace(
      `<h2>Resend</h2>`,
      `<h2>Resend (pendiente)</h2>`,
    ),
    /tres destinos pendientes/,
  ],
  [
    "https://agorbis.com/subencargados/",
    pendingProvidersHtml.replace(
      pendingCopy.transferSafeguardsPending,
      "DPA aprobado y suficiente",
    ),
    /contratos o salvaguardas acreditados/,
  ],
  [
    "https://agorbis.com/subencargados/",
    pendingProvidersHtml.replace(
      "</body>",
      "<p>DPA incorporado a los contratos</p></body>",
    ),
    /contratos o salvaguardas acreditados/,
  ],
  [
    "https://agorbis.com/subencargados/",
    pendingProvidersHtml.replace(
      pendingCopy.providerRetentionPending,
      "30 días",
    ),
    /providerRetentionPending/,
  ],
  [
    "https://agorbis.com/subencargados/",
    pendingProvidersHtml.replace("</body>", "Domicilio legal pendiente</body>"),
    /placeholder legal/,
  ],
]) {
  await assert.rejects(
    runProductionReadOnlySmoke({
      ...smokeOptions,
      legalProfile,
      fetchImpl: exceptionalFetch(
        new Map([
          [url, () => new Response(body, { headers: securityHeaders })],
        ]),
      ).fetchImpl,
    }),
    error,
  );
}
for (const [url, response, error] of [
  [
    "https://agorbis.com/",
    () => new Response(html(""), { headers: { "content-type": "text/html" } }),
    /x-content-type-options/,
  ],
  [
    "https://agorbis.com/internal/health/",
    () => new Response("Unavailable", { status: 503 }),
    /respondió 503/,
  ],
  [
    `${PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin}/auth/v1/signup`,
    () => Response.json({ error_code: "validation_failed" }, { status: 400 }),
    /captcha_failed/,
  ],
]) {
  await assert.rejects(
    runProductionReadOnlySmoke({
      ...smokeOptions,
      legalProfile,
      fetchImpl: exceptionalFetch(new Map([[url, response]])).fetchImpl,
    }),
    error,
  );
}
const successful = successfulFetch();
const result = await runProductionReadOnlySmoke({
  fetchImpl: successful.fetchImpl,
  baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
  supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
  publishableKey,
});
assert.equal(result.completed.length, 22);
assert.equal(result.legalStatus, "normal");

const widgetRequest = successful.calls.find((call) =>
  call.url.endsWith("/auth/v1/signup"),
);
assert.equal(widgetRequest?.init.method, "POST");
assert.equal(widgetRequest?.init.headers.apikey, publishableKey);
assert.deepEqual(JSON.parse(widgetRequest?.init.body), {
  email: "invalid",
  password: "x",
});
assert.doesNotMatch(widgetRequest?.init.body ?? "", /captcha/i);

await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: successful.fetchImpl,
    baseOrigin: "https://preview.example.com",
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /sólo puede apuntar a https:\/\/agorbis\.com/,
);

await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: successful.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: "http://127.0.0.1:54821",
    publishableKey,
  }),
  /debe usar HTTPS|proyecto de Producción/,
);

const unsafeRedirect = successfulFetch(
  new Map([
    [
      "https://www.agorbis.com/smoke-path?check=1",
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://agorbis.com/" },
        }),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: unsafeRedirect.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /respondió 302; se esperaba 308/,
);

const notServedByCloudflare = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/`,
      () =>
        new Response(
          "<!doctype html><html><title>Agorbis</title><body>Agorbis</body></html>",
          {
            headers: Object.fromEntries(
              Object.entries(securityHeaders).filter(
                ([name]) => name !== "cf-ray",
              ),
            ),
          },
        ),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: notServedByCloudflare.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /no devolvió cf-ray/,
);

const staleVercelRuntime = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/`,
      () =>
        new Response(
          "<!doctype html><html><title>Agorbis</title><body>Agorbis</body></html>",
          { headers: { ...securityHeaders, "x-vercel-id": "fixture" } },
        ),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: staleVercelRuntime.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /runtime Vercel/,
);

const unhealthy = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/internal/health/`,
      () =>
        Response.json(
          { status: "unavailable", incidentId: "fixture", durationMs: 4 },
          { status: 503, headers: { "cache-control": "no-store" } },
        ),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: unhealthy.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /respondió 503; se esperaba 200/,
);

const pendingAaip = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/privacidad/`,
      () =>
        new Response(
          "<!doctype html><html><title>Agorbis</title><body>Código de responsable AAIP pendiente</body></html>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: pendingAaip.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /identificación AAIP como pendiente/,
);

const missingDatabaseRegistration = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/privacidad/`,
      () =>
        new Response(
          "<!doctype html><html><title>Agorbis</title><body>Agorbis · Código de responsable AAIP: RL-2026-81658385-APN-DNPDP#AAIP</body></html>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: missingDatabaseRegistration.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /no publica separadamente el número de registro de la base AAIP/,
);

const pendingSafeguards = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin}/subencargados/`,
      () =>
        new Response(
          "<!doctype html><html><title>Agorbis</title><body>Agorbis · Salvaguardas de transferencia pendientes</body></html>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: pendingSafeguards.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /placeholder legal/,
);

const unguardedWidgetB = successfulFetch(
  new Map([
    [
      `${PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin}/auth/v1/signup`,
      () => Response.json({ error_code: "validation_failed" }, { status: 400 }),
    ],
  ]),
);
await assert.rejects(
  runProductionReadOnlySmoke({
    fetchImpl: unguardedWidgetB.fetchImpl,
    baseOrigin: PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin,
    supabaseOrigin: PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin,
    publishableKey,
  }),
  /no devolvió captcha_failed/,
);

const cronSecret = "C".repeat(32);
const authorizedCronCalls = [];
const authorizedCron = await runProductionCronSmoke({
  cronSecret,
  confirmation: "RUN_AGORBIS_PRODUCTION_CRONS",
  fetchImpl: async (input, init = {}) => {
    authorizedCronCalls.push({ input: String(input), init });
    return Response.json(
      { ranAt: "2026-08-25T12:00:00.000Z" },
      { headers: { "cache-control": "no-store" } },
    );
  },
});
assert.equal(authorizedCron.completed.length, 5);
assert.equal(authorizedCronCalls.length, 5);
assert.ok(
  authorizedCronCalls.every(
    ({ init }) => init.headers.Authorization === `Bearer ${cronSecret}`,
  ),
);

await assert.rejects(
  runProductionCronSmoke({
    cronSecret,
    confirmation: "",
    fetchImpl: async () => {
      throw new Error("no debe consultar la red");
    },
  }),
  /Falta la confirmación explícita/,
);

await assert.rejects(
  runProductionCronSmoke({
    cronSecret: "short",
    confirmation: "RUN_AGORBIS_PRODUCTION_CRONS",
    fetchImpl: async () => {
      throw new Error("no debe consultar la red");
    },
  }),
  /demasiado corto/,
);

let failedCronCalls = 0;
await assert.rejects(
  runProductionCronSmoke({
    cronSecret,
    confirmation: "RUN_AGORBIS_PRODUCTION_CRONS",
    fetchImpl: async () => {
      failedCronCalls += 1;
      return Response.json(
        { error: "fixture" },
        {
          status: 500,
          headers: { "cache-control": "no-store" },
        },
      );
    },
  }),
  /respondió 500; se esperaba 200/,
);
assert.equal(
  failedCronCalls,
  1,
  "El smoke debe detenerse en el primer cron fallido.",
);

await assert.rejects(
  runProductionCronSmoke({
    cronSecret,
    confirmation: "RUN_AGORBIS_PRODUCTION_CRONS",
    fetchImpl: async () =>
      Response.json(
        { ranAt: "fecha-inválida" },
        { headers: { "cache-control": "no-store" } },
      ),
  }),
  /estructura inesperada/,
);

console.log(
  "Production smoke: destino fijo, checks read-only, crons autorizados y fallos cerrados verificados.",
);
