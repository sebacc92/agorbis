#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLOUDFLARE_CACHE_AUDIT_FORMAT,
  CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV,
  CLOUDFLARE_CACHE_PHASE,
  fetchCloudflareCacheConfiguration,
  parseArguments,
  persistCloudflareCacheAudit,
  resolveAuditToken,
  reviewCloudflareCacheConfiguration,
  sha256,
  validateAuditToken,
  verifyPersistedCloudflareCacheAudit,
} from "./cloudflare-cache-audit.mjs";

const testToken = "cf_read_only_test_token_1234567890";
const capturedAt = "2026-08-26T12:00:00.000Z";
const cacheRulesetId = "10000000000000000000000000000001";
const cacheRuleId = "20000000000000000000000000000001";
const pageRuleId = "30000000000000000000000000000001";

const cacheSummary = Object.freeze({
  id: cacheRulesetId,
  kind: "zone",
  last_updated: capturedAt,
  name: "default",
  phase: CLOUDFLARE_CACHE_PHASE,
  version: "1",
});

// Enum `phase` documentado en la API de rulesets (GET .../rulesets/{id} y el
// entrypoint por fase): 25 valores. Fuente:
// https://developers.cloudflare.com/api/resources/rulesets/methods/get/
const API_RULESET_PHASES = Object.freeze([
  "ddos_l4",
  "ddos_l7",
  "http_config_settings",
  "http_custom_errors",
  "http_log_custom_fields",
  "http_ratelimit",
  "http_request_cache_settings",
  "http_request_dynamic_redirect",
  "http_request_firewall_custom",
  "http_request_firewall_managed",
  "http_request_late_transform",
  "http_request_origin",
  "http_request_redirect",
  "http_request_sanitize",
  "http_request_sbfm",
  "http_request_transform",
  "http_response_cache_settings",
  "http_response_compression",
  "http_response_firewall_custom",
  "http_response_firewall_managed",
  "http_response_headers_transform",
  "magic_transit",
  "magic_transit_ids_managed",
  "magic_transit_managed",
  "magic_transit_ratelimit",
]);
// Fases de la referencia del motor de reglas: 25 valores. Fuente:
// https://developers.cloudflare.com/ruleset-engine/reference/phases-list/
const REFERENCE_RULESET_PHASES = Object.freeze([
  "ddos_l4",
  "magic_transit",
  "magic_transit_managed",
  "magic_transit_ratelimit",
  "magic_transit_ids_managed",
  "http_request_dynamic_redirect",
  "http_request_sanitize",
  "http_request_transform",
  "http_config_settings",
  "http_request_origin",
  "ddos_l7",
  "http_request_firewall_custom",
  "http_ratelimit",
  "http_request_firewall_managed",
  "http_request_sbfm",
  "http_request_redirect",
  "http_request_late_transform",
  "http_request_cache_settings",
  "http_request_snippets",
  "http_request_cloud_connector",
  "http_custom_errors",
  "http_response_headers_transform",
  "http_response_compression",
  "http_response_firewall_managed",
  "http_log_custom_fields",
]);
assert.equal(new Set(API_RULESET_PHASES).size, 25);
assert.equal(new Set(REFERENCE_RULESET_PHASES).size, 25);
const DOCUMENTED_RULESET_PHASES = Object.freeze(
  [...new Set([...API_RULESET_PHASES, ...REFERENCE_RULESET_PHASES])].sort(),
);
assert.equal(DOCUMENTED_RULESET_PHASES.length, 27);

// Resumen de un ruleset de zona en otra fase, como los devuelve el listado.
function summaryWithPhase(phase, id) {
  return { ...cacheSummary, id, phase, name: `fase ${String(phase)}` };
}
const snippetsSummary = summaryWithPhase(
  "http_request_snippets",
  "40000000000000000000000000000001",
);
const cloudConnectorSummary = summaryWithPhase(
  "http_request_cloud_connector",
  "40000000000000000000000000000002",
);
const responseFirewallSummary = summaryWithPhase(
  "http_response_firewall_custom",
  "40000000000000000000000000000007",
);

function cacheRule({
  enabled = true,
  action = "set_cache_settings",
  actionParameters = { cache: false },
  extra = {},
} = {}) {
  return {
    action,
    action_parameters: actionParameters,
    enabled,
    expression: '(http.host eq "agorbis.com")',
    id: cacheRuleId,
    last_updated: capturedAt,
    version: "1",
    ...extra,
  };
}

function cacheRuleset(rule = cacheRule()) {
  return { ...cacheSummary, rules: [rule] };
}

function pageRule({
  status = "active",
  action = { id: "always_use_https" },
  extra = {},
} = {}) {
  return {
    actions: [action],
    created_on: capturedAt,
    id: pageRuleId,
    modified_on: capturedAt,
    priority: 1,
    status,
    targets: [
      {
        constraint: { operator: "matches", value: "*agorbis.com/*" },
        target: "url",
      },
    ],
    ...extra,
  };
}

function configuration({
  summaries = [],
  cacheRulesets = [],
  pageRules = [],
} = {}) {
  return { rulesetSummaries: summaries, cacheRulesets, pageRules };
}

assert.equal(validateAuditToken(testToken), testToken);
assert.throws(() => validateAuditToken(` ${testToken}`), /espacios/);
assert.throws(() => validateAuditToken("short"), /inválido/);
assert.equal(
  resolveAuditToken({
    environment: { [CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV]: testToken },
    promptHidden: () => assert.fail("No debe abrir el prompt"),
  }),
  testToken,
);
assert.equal(
  resolveAuditToken({ environment: {}, promptHidden: () => testToken }),
  testToken,
);
assert.throws(
  () =>
    resolveAuditToken({
      environment: { [CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV]: "" },
      promptHidden: () => testToken,
    }),
  /inválido/,
);
assert.deepEqual(
  parseArguments(["--output-root", "/tmp/agorbis-cache-audit"]),
  {
    outputRoot: "/tmp/agorbis-cache-audit",
  },
);
for (const invalidArguments of [
  [],
  ["--token", testToken, "--output-root", "/tmp/audit"],
  ["--output-root", "/tmp/audit", "extra"],
]) {
  assert.throws(() => parseArguments(invalidArguments), /únicamente/);
}

assert.equal(
  reviewCloudflareCacheConfiguration(configuration()).approvedForOpen,
  true,
);

const exactBypass = configuration({
  summaries: [cacheSummary],
  cacheRulesets: [cacheRuleset()],
});
assert.equal(
  reviewCloudflareCacheConfiguration(exactBypass).approvedForOpen,
  true,
);

const disabledCache = configuration({
  summaries: [cacheSummary],
  cacheRulesets: [
    cacheRuleset(
      cacheRule({
        enabled: false,
        actionParameters: {
          cache: true,
          edge_ttl: { mode: "override_origin", default: 3600 },
        },
      }),
    ),
  ],
});
assert.equal(
  reviewCloudflareCacheConfiguration(disabledCache).approvedForOpen,
  true,
);

for (const unsafeCache of [
  cacheRule({ actionParameters: { cache: true } }),
  cacheRule({
    actionParameters: {
      cache: false,
      edge_ttl: { mode: "override_origin", default: 3600 },
    },
  }),
  cacheRule({
    actionParameters: { edge_ttl: { mode: "override_origin", default: 3600 } },
  }),
]) {
  const review = reviewCloudflareCacheConfiguration(
    configuration({
      summaries: [cacheSummary],
      cacheRulesets: [cacheRuleset(unsafeCache)],
    }),
  );
  assert.equal(review.approvedForOpen, false);
  assert.match(review.errors.join("\n"), /contenido dinámico/);
}

assert.equal(
  reviewCloudflareCacheConfiguration(configuration({ pageRules: [pageRule()] }))
    .approvedForOpen,
  true,
);

// Fases oficiales que faltaban en la lista: Snippets y Cloud Connector. No son
// Cache Rules, así que no exigen detalle y no cambian la revisión de cache.
const otherPhasesReview = reviewCloudflareCacheConfiguration(
  configuration({ summaries: [snippetsSummary, cloudConnectorSummary] }),
);
assert.equal(otherPhasesReview.approvedForOpen, true);
assert.equal(otherPhasesReview.rulesetSummaryCount, 2);
assert.equal(otherPhasesReview.cacheRulesetCount, 0);
// Con ellas presentes, la fase de cache sigue exigiendo su detalle exacto y
// sigue marcando una regla peligrosa.
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({ summaries: [snippetsSummary, cacheSummary] }),
    ),
  /no cubren exactamente/,
);
const mixedUnsafeReview = reviewCloudflareCacheConfiguration(
  configuration({
    summaries: [snippetsSummary, cacheSummary, cloudConnectorSummary],
    cacheRulesets: [
      cacheRuleset(cacheRule({ actionParameters: { cache: true } })),
    ],
  }),
);
assert.equal(mixedUnsafeReview.approvedForOpen, false);
assert.match(mixedUnsafeReview.errors.join("\n"), /contenido dinámico/);

// Toda fase documentada en cualquiera de las dos fuentes se acepta; la de
// cache es la única que además exige su detalle. Así una omisión futura se
// detecta actualizando estas dos listas, no corrigiendo fase por fase.
for (const phase of DOCUMENTED_RULESET_PHASES) {
  const summaries = [
    summaryWithPhase(phase, "40000000000000000000000000000005"),
  ];
  if (phase === CLOUDFLARE_CACHE_PHASE) {
    assert.throws(
      () => reviewCloudflareCacheConfiguration(configuration({ summaries })),
      /no cubren exactamente/,
    );
    continue;
  }
  const review = reviewCloudflareCacheConfiguration(
    configuration({ summaries }),
  );
  assert.equal(review.approvedForOpen, true, phase);
  assert.equal(review.cacheRulesetCount, 0, phase);
}
// La fase que bloqueaba la auditoría real está en el enum de la API y no en la
// referencia de fases; la otra de respuesta, al revés. Las dos se aceptan.
for (const phase of [
  "http_response_firewall_custom",
  "http_response_cache_settings",
  "http_request_snippets",
  "http_request_cloud_connector",
]) {
  assert.ok(DOCUMENTED_RULESET_PHASES.includes(phase), phase);
}
// Variantes plausibles que ninguna fuente documenta siguen bloqueando.
for (const phase of [
  "http_response_snippets",
  "http_response_cloud_connector",
  "http_request_firewall",
  "http_response_firewall",
  "HTTP_REQUEST_FIREWALL_CUSTOM",
  "http_request_firewall_custom ",
  "",
]) {
  assert.throws(
    () =>
      reviewCloudflareCacheConfiguration(
        configuration({
          summaries: [
            summaryWithPhase(phase, "40000000000000000000000000000006"),
          ],
        }),
      ),
    /^Error: Ruleset 0\.phase desconocida: /,
    phase,
  );
}

// `source` es un metadato opcional del ruleset que el API agrega a los
// administrados y a los entry points. Se admite como identificador seguro en
// resúmenes y en el detalle de cache; no cambia la revisión.
const managedSummary = {
  ...summaryWithPhase(
    "http_request_firewall_managed",
    "40000000000000000000000000000008",
  ),
  source: "firewall_managed",
};
const sourcedCacheSummary = { ...cacheSummary, source: "firewall_managed" };
const sourcedReview = reviewCloudflareCacheConfiguration(
  configuration({
    summaries: [managedSummary, sourcedCacheSummary],
    cacheRulesets: [{ ...cacheRuleset(), source: "firewall_managed" }],
  }),
);
assert.equal(sourcedReview.approvedForOpen, true);
assert.equal(sourcedReview.rulesetSummaryCount, 2);
// Otro identificador válido también pasa: no se fija un único valor posible.
assert.equal(
  reviewCloudflareCacheConfiguration(
    configuration({ summaries: [{ ...managedSummary, source: "custom_2" }] }),
  ).approvedForOpen,
  true,
);
// Con `source`, una Cache Rule peligrosa sigue bloqueando.
const sourcedUnsafeReview = reviewCloudflareCacheConfiguration(
  configuration({
    summaries: [sourcedCacheSummary],
    cacheRulesets: [
      {
        ...cacheRuleset(cacheRule({ actionParameters: { cache: true } })),
        source: "firewall_managed",
      },
    ],
  }),
);
assert.equal(sourcedUnsafeReview.approvedForOpen, false);
assert.match(sourcedUnsafeReview.errors.join("\n"), /contenido dinámico/);
// Valores que no son un identificador seguro bloquean sin copiarse al mensaje.
for (const [source, described] of [
  ["", "cadena de 0 caracteres"],
  ["Firewall_Managed", "cadena de 16 caracteres"],
  ["firewall managed", "cadena de 16 caracteres"],
  ["firewall-managed", "cadena de 16 caracteres"],
  ["firewall_managed\n", "cadena de 17 caracteres"],
  ["../firewall", "cadena de 11 caracteres"],
  ["1firewall", "1firewall"],
  ["a".repeat(65), "cadena de 65 caracteres"],
  [7, "number"],
  [null, "null"],
  [{ id: "firewall_managed" }, "object"],
  [["firewall_managed"], "object"],
]) {
  assert.throws(
    () =>
      reviewCloudflareCacheConfiguration(
        configuration({ summaries: [{ ...managedSummary, source }] }),
      ),
    (error) => {
      assert.equal(error.message, `Ruleset 0.source inválido: ${described}.`);
      assert.doesNotMatch(error.message, /Firewall|\.\.\/|aaaa/);
      return true;
    },
  );
  assert.throws(
    () =>
      reviewCloudflareCacheConfiguration(
        configuration({
          summaries: [sourcedCacheSummary],
          cacheRulesets: [{ ...cacheRuleset(), source }],
        }),
      ),
    /source inválido/,
  );
}
// Cualquier otro campo desconocido sigue bloqueando, con `source` o sin él.
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({ summaries: [{ ...managedSummary, origin: "api" }] }),
    ),
  /Ruleset 0 contiene el campo desconocido origin/,
);
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({
        summaries: [sourcedCacheSummary],
        cacheRulesets: [
          { ...cacheRuleset(), source: "firewall_managed", origin: "api" },
        ],
      }),
    ),
  /Cache Ruleset 0 contiene el campo desconocido origin/,
);

// Una fase realmente desconocida bloquea y el error dice cuál es. Sólo se cita
// tal cual un identificador corto; otro valor se describe por tipo y largo.
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({
        summaries: [
          snippetsSummary,
          summaryWithPhase(
            "http_request_unknown",
            "40000000000000000000000000000003",
          ),
        ],
      }),
    ),
  /^Error: Ruleset 1\.phase desconocida: http_request_unknown\.$/,
);
for (const [phase, described] of [
  ["Snippets; DROP TABLE x", "cadena de 22 caracteres"],
  ["x".repeat(300), "cadena de 300 caracteres"],
  [7, "number"],
  [null, "null"],
  [undefined, "undefined"],
  [{ phase: "http_request_snippets" }, "object"],
]) {
  assert.throws(
    () =>
      reviewCloudflareCacheConfiguration(
        configuration({
          summaries: [
            summaryWithPhase(phase, "40000000000000000000000000000003"),
          ],
        }),
      ),
    (error) => {
      assert.equal(error.message, `Ruleset 0.phase desconocida: ${described}.`);
      assert.doesNotMatch(error.message, /DROP|xxx/);
      return true;
    },
  );
}
const pageCacheReview = reviewCloudflareCacheConfiguration(
  configuration({
    pageRules: [pageRule({ action: { id: "cache_everything" } })],
  }),
);
assert.equal(pageCacheReview.approvedForOpen, false);
assert.match(pageCacheReview.errors.join("\n"), /modifica cache/);

assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({
        summaries: [cacheSummary],
        cacheRulesets: [cacheRuleset(cacheRule({ action: "unknown_action" }))],
      }),
    ),
  /action desconocida/,
);
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({
        summaries: [cacheSummary],
        cacheRulesets: [
          cacheRuleset(
            cacheRule({ actionParameters: { new_parameter: true } }),
          ),
        ],
      }),
    ),
  /parámetro desconocido/,
);
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({
        pageRules: [pageRule({ action: { id: "new_action" } })],
      }),
    ),
  /acción desconocida/,
);
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({ pageRules: [pageRule({ extra: { new_field: true } })] }),
    ),
  /campo desconocido/,
);
assert.throws(
  () =>
    reviewCloudflareCacheConfiguration(
      configuration({ cacheRulesets: [cacheRuleset()] }),
    ),
  /no cubren exactamente/,
);

function response(
  payload,
  { contentType = "application/json", status = 200 } = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": contentType },
  });
}

// Contrato documentado de GET /zones/{zone_id}/pagerules: sobre con success,
// errors, messages y result, sin result_info ni paginación.
function pageRulesEnvelope(result) {
  return { errors: [], messages: [], result, success: true };
}

// Sobre con metadatos de paginación que el endpoint no documenta. El auditor
// lo rechaza como campo desconocido en lugar de inventar páginas.
function paginatedPageEnvelope(result) {
  return {
    ...pageRulesEnvelope(result),
    result_info: {
      count: result.length,
      page: 1,
      per_page: 50,
      total_count: result.length,
      total_pages: 1,
    },
  };
}

function rulesetListEnvelope(result) {
  return {
    errors: [],
    messages: [],
    result,
    result_info: { count: result.length },
    success: true,
  };
}

function detailEnvelope(result) {
  return { errors: [], messages: [], result, success: true };
}

const requests = [];
const fetched = await fetchCloudflareCacheConfiguration({
  token: testToken,
  fetchImpl: async (url, options) => {
    requests.push(url.pathname + url.search);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${testToken}`);
    if (url.pathname.endsWith("/pagerules"))
      return response(pageRulesEnvelope([]));
    if (url.pathname.endsWith("/rulesets")) {
      return response(rulesetListEnvelope([cacheSummary]));
    }
    if (url.pathname.endsWith(`/rulesets/${cacheRulesetId}`)) {
      return response(detailEnvelope(cacheRuleset()));
    }
    assert.fail(`URL inesperada: ${url}`);
  },
});
assert.deepEqual(fetched, exactBypass);
assert.equal(requests.length, 3);
// Una sola lectura de Page Rules, sólo con los filtros de orden documentados:
// nada de `page` ni `per_page`.
assert.equal(
  requests[0],
  `/client/v4/zones/1649628cde7b43fc40bceaca54d02e16/pagerules?direction=asc&order=priority`,
);
assert.equal(
  requests[1],
  `/client/v4/zones/1649628cde7b43fc40bceaca54d02e16/rulesets`,
);

// El listado de rulesets con las fases nuevas se lee y se revisa sin pedir
// detalles para ellas: sólo la fase de cache tiene detalle.
const detailRequests = [];
const withOtherPhases = await fetchCloudflareCacheConfiguration({
  token: testToken,
  fetchImpl: async (url) => {
    if (url.pathname.endsWith("/pagerules")) {
      return response(pageRulesEnvelope([]));
    }
    if (url.pathname.endsWith("/rulesets")) {
      return response(
        rulesetListEnvelope([
          snippetsSummary,
          cacheSummary,
          cloudConnectorSummary,
          responseFirewallSummary,
        ]),
      );
    }
    detailRequests.push(url.pathname);
    if (url.pathname.endsWith(`/rulesets/${cacheRulesetId}`)) {
      return response(detailEnvelope(cacheRuleset()));
    }
    assert.fail(`URL inesperada: ${url}`);
  },
});
assert.deepEqual(detailRequests, [
  `/client/v4/zones/1649628cde7b43fc40bceaca54d02e16/rulesets/${cacheRulesetId}`,
]);
assert.deepEqual(withOtherPhases.rulesetSummaries, [
  snippetsSummary,
  cacheSummary,
  cloudConnectorSummary,
  responseFirewallSummary,
]);
assert.equal(
  reviewCloudflareCacheConfiguration(withOtherPhases).approvedForOpen,
  true,
);
await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async (url) =>
      response(
        url.pathname.endsWith("/pagerules")
          ? pageRulesEnvelope([])
          : rulesetListEnvelope([
              summaryWithPhase(
                "http_request_future",
                "40000000000000000000000000000004",
              ),
            ]),
      ),
  }),
  /^Error: Ruleset 0\.phase desconocida: http_request_future\.$/,
);

// Lectura real con `source` en el listado y en el detalle de cache: se acepta
// y la revisión no cambia; un `source` que no sea identificador bloquea la
// lectura del detalle.
const sourcedFetched = await fetchCloudflareCacheConfiguration({
  token: testToken,
  fetchImpl: async (url) => {
    if (url.pathname.endsWith("/pagerules")) {
      return response(pageRulesEnvelope([]));
    }
    if (url.pathname.endsWith("/rulesets")) {
      return response(
        rulesetListEnvelope([managedSummary, sourcedCacheSummary]),
      );
    }
    return response(
      detailEnvelope({ ...cacheRuleset(), source: "firewall_managed" }),
    );
  },
});
assert.deepEqual(sourcedFetched.rulesetSummaries, [
  managedSummary,
  sourcedCacheSummary,
]);
assert.equal(sourcedFetched.cacheRulesets[0].source, "firewall_managed");
assert.equal(
  reviewCloudflareCacheConfiguration(sourcedFetched).approvedForOpen,
  true,
);
await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/pagerules")) {
        return response(pageRulesEnvelope([]));
      }
      if (url.pathname.endsWith("/rulesets")) {
        return response(rulesetListEnvelope([sourcedCacheSummary]));
      }
      return response(
        detailEnvelope({ ...cacheRuleset(), source: { id: "x" } }),
      );
    },
  }),
  /Ruleset 0\.source inválido: object\./,
);

// Respuesta válida sin result_info con reglas: la activa que toca cache queda
// marcada en la revisión; la deshabilitada se conserva pero no cuenta como
// activa.
const dangerousPageRule = pageRule({ action: { id: "cache_everything" } });
const disabledPageRule = pageRule({
  status: "disabled",
  action: { id: "cache_everything" },
  extra: { id: "30000000000000000000000000000002", priority: 2 },
});
const withPageRules = await fetchCloudflareCacheConfiguration({
  token: testToken,
  fetchImpl: async (url) => {
    if (url.pathname.endsWith("/pagerules")) {
      assert.equal(url.searchParams.has("page"), false);
      assert.equal(url.searchParams.has("per_page"), false);
      return response(pageRulesEnvelope([dangerousPageRule, disabledPageRule]));
    }
    return response(rulesetListEnvelope([]));
  },
});
assert.deepEqual(withPageRules.pageRules, [
  dangerousPageRule,
  disabledPageRule,
]);
const withPageRulesReview = reviewCloudflareCacheConfiguration(withPageRules);
assert.equal(withPageRulesReview.approvedForOpen, false);
assert.equal(withPageRulesReview.pageRuleCount, 2);
assert.equal(withPageRulesReview.activePageRuleCount, 1);
assert.match(
  withPageRulesReview.errors.join("\n"),
  /Page Rule activa 30000000000000000000000000000001 modifica cache \(cache_everything\)/,
);

// Respuestas inválidas de Page Rules: ninguna se convierte en "cero reglas".
async function rejectsPageRules(payload, pattern) {
  await assert.rejects(
    fetchCloudflareCacheConfiguration({
      token: testToken,
      fetchImpl: async (url) =>
        response(
          url.pathname.endsWith("/pagerules")
            ? payload
            : rulesetListEnvelope([]),
        ),
    }),
    pattern,
  );
}
await rejectsPageRules(
  paginatedPageEnvelope([]),
  /Page Rules contiene el campo desconocido result_info/,
);
await rejectsPageRules(
  paginatedPageEnvelope([pageRule()]),
  /campo desconocido result_info/,
);
await rejectsPageRules(
  { ...pageRulesEnvelope([]), result: {} },
  /estructura inesperada/,
);
await rejectsPageRules(
  { ...pageRulesEnvelope([]), result: null },
  /estructura inesperada/,
);
const { result: _omittedResult, ...envelopeWithoutResult } = pageRulesEnvelope(
  [],
);
await rejectsPageRules(envelopeWithoutResult, /no contiene result/);
await rejectsPageRules(
  { ...pageRulesEnvelope([]), success: false },
  /success=true/,
);
await rejectsPageRules(
  { ...pageRulesEnvelope([]), errors: [{ code: 10000, message: "x" }] },
  /informó errores/,
);
await rejectsPageRules(
  { ...pageRulesEnvelope([]), messages: [{ code: 10000, message: "x" }] },
  /mensajes inesperados/,
);
await rejectsPageRules(
  pageRulesEnvelope([pageRule({ status: "paused" })]),
  /status desconocido/,
);
await rejectsPageRules(
  pageRulesEnvelope([pageRule({ action: { id: "new_action" } })]),
  /acción desconocida/,
);
await rejectsPageRules(
  pageRulesEnvelope([pageRule({ extra: { result_info: {} } })]),
  /Page Rule 0 contiene el campo desconocido result_info/,
);
await rejectsPageRules(
  pageRulesEnvelope([pageRule(), pageRule()]),
  /IDs duplicados/,
);
await rejectsPageRules(
  pageRulesEnvelope([{ ...pageRule(), targets: [] }]),
  /targets inválido/,
);
await rejectsPageRules(
  pageRulesEnvelope([{ ...pageRule(), actions: [] }]),
  /actions inválido/,
);
await rejectsPageRules(
  pageRulesEnvelope([{ ...pageRule(), priority: "1" }]),
  /priority inválido/,
);

await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async () => response({}, { status: 403 }),
  }),
  (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, new RegExp(testToken));
    return true;
  },
);
await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async () =>
      response(pageRulesEnvelope([]), { contentType: "text/html" }),
  }),
  /application\/json/,
);
await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async () =>
      new Response(" ".repeat(4 * 1024 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      }),
  }),
  /tamaño máximo/,
);
await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async () =>
      new Response("{", {
        headers: { "content-type": "application/json" },
      }),
  }),
  /JSON inválido/,
);
await assert.rejects(
  fetchCloudflareCacheConfiguration({
    token: testToken,
    fetchImpl: async () =>
      response({ ...pageRulesEnvelope([]), unexpected: true }),
  }),
  /campo desconocido/,
);

const temporaryRoot = mkdtempSync(
  path.join(os.tmpdir(), "agorbis-cache-audit-test-"),
);
try {
  chmodSync(temporaryRoot, 0o700);
  const outputRoot = path.join(temporaryRoot, "audits");
  const audit = persistCloudflareCacheAudit({
    configuration: exactBypass,
    outputRoot,
    capturedAt,
    directoryName: "20260826T120000Z",
  });
  assert.equal(statSync(outputRoot).mode & 0o777, 0o700);
  assert.equal(statSync(audit.outputDirectory).mode & 0o777, 0o700);
  assert.equal(statSync(audit.snapshotPath).mode & 0o777, 0o600);
  assert.equal(statSync(audit.manifestPath).mode & 0o777, 0o600);
  const snapshotText = readFileSync(audit.snapshotPath, "utf8");
  const manifestText = readFileSync(audit.manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.format, CLOUDFLARE_CACHE_AUDIT_FORMAT);
  assert.equal(manifest.snapshotSha256, sha256(snapshotText));
  assert.equal(manifest.approvedForOpen, true);
  assert.equal(manifest.review.activeCacheRuleCount, 1);
  assert.doesNotMatch(snapshotText, new RegExp(testToken));
  assert.doesNotMatch(manifestText, new RegExp(testToken));
  const verified = verifyPersistedCloudflareCacheAudit(audit.outputDirectory);
  assert.equal(verified.snapshotSha256, manifest.snapshotSha256);
  assert.equal(verified.review.approvedForOpen, true);

  writeFileSync(audit.snapshotPath, `${snapshotText} `, { mode: 0o600 });
  assert.throws(
    () => verifyPersistedCloudflareCacheAudit(audit.outputDirectory),
    /JSON válido|SHA-256/,
  );

  const symlinkRoot = path.join(temporaryRoot, "symlink-root");
  symlinkSync(temporaryRoot, symlinkRoot);
  assert.throws(
    () =>
      persistCloudflareCacheAudit({
        configuration: configuration(),
        outputRoot: symlinkRoot,
        capturedAt,
        directoryName: "20260826T120001Z",
      }),
    /symlink/,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(
  "✓ Cloudflare cache audit · GET-only, fail-closed, token en memoria, modos y SHA-256",
);
