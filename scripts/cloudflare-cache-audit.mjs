#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CLOUDFLARE_CACHE_AUDIT_FORMAT =
  "agorbis-cloudflare-cache-audit/v1";
export const CLOUDFLARE_ACCOUNT_ID = "4d78fb10c1ae65281ec851479d5045dc";
export const CLOUDFLARE_ZONE_ID = "1649628cde7b43fc40bceaca54d02e16";
export const CLOUDFLARE_ZONE_NAME = "agorbis.com";
export const CLOUDFLARE_CACHE_PHASE = "http_request_cache_settings";
export const CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV = "CLOUDFLARE_API_TOKEN";

const API_ORIGIN = "https://api.cloudflare.com";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEX_ID = /^[a-f0-9]{32}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
// `source` de un ruleset: metadato opcional que el API agrega a los rulesets
// administrados y a los entry points (en la documentación siempre
// "firewall_managed"), sin esquema público. Se admite sólo como identificador
// corto en minúsculas, dígitos y guiones bajos; cualquier otra forma bloquea.
const RULESET_SOURCE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

// Fases oficiales del motor de reglas: la unión del enum `phase` de la API
// (GET /zones/{zone_id}/rulesets/{ruleset_id} y el entrypoint por fase, 25
// valores) y de la referencia de fases
// (https://developers.cloudflare.com/ruleset-engine/reference/phases-list/,
// 25 valores). Las dos fuentes difieren en dos fases por lado: la API suma
// `http_response_cache_settings` y `http_response_firewall_custom`; la
// referencia suma `http_request_snippets` y `http_request_cloud_connector`.
// Una fase que no figure en ninguna de las dos bloquea la auditoría; el test
// del auditor compara esta lista contra ambas fuentes completas.
const RULESET_PHASES = new Set([
  "ddos_l4",
  "ddos_l7",
  "http_config_settings",
  "http_custom_errors",
  "http_log_custom_fields",
  "http_ratelimit",
  "http_request_cache_settings",
  "http_request_cloud_connector",
  "http_request_dynamic_redirect",
  "http_request_firewall_custom",
  "http_request_firewall_managed",
  "http_request_late_transform",
  "http_request_origin",
  "http_request_redirect",
  "http_request_sanitize",
  "http_request_sbfm",
  "http_request_snippets",
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

const CACHE_PARAMETER_KEYS = new Set([
  "browser_ttl",
  "cache",
  "cache_by_device_type",
  "cache_deception_armor",
  "cache_key",
  "cache_reserve",
  "cache_tag",
  "cache_ttl_by_status",
  "edge_ttl",
  "host",
  "origin_error_page_passthru",
  "read_timeout",
  "respect_strong_etags",
  "serve_stale",
]);

const PAGE_RULE_CACHE_ACTIONS = new Set([
  "browser_cache_ttl",
  "bypass_cache_on_cookie",
  "cache_by_device_type",
  "cache_deception_armor",
  "cache_everything",
  "cache_key",
  "cache_level",
  "cache_on_cookie",
  "cache_ttl_by_status",
  "edge_cache_ttl",
  "origin_cache_control",
  "sort_query_string_for_cache",
]);

const PAGE_RULE_NON_CACHE_ACTIONS = new Set([
  "always_online",
  "always_use_https",
  "automatic_https_rewrites",
  "browser_check",
  "disable_apps",
  "disable_performance",
  "disable_railgun",
  "disable_security",
  "email_obfuscation",
  "forwarding_url",
  "host",
  "hotlink_protection",
  "ip_geolocation",
  "minify",
  "mirage",
  "opportunistic_encryption",
  "polish",
  "resolve_override",
  "respect_strong_etags",
  "rocket_loader",
  "security_level",
  "server_side_exclude",
  "ssl",
  "true_client_ip_header",
  "waf",
]);
const PAGE_RULE_ACTIONS = new Set([
  ...PAGE_RULE_CACHE_ACTIONS,
  ...PAGE_RULE_NON_CACHE_ACTIONS,
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Cómo citar en un error un valor que vino del API. Sólo se copia tal cual un
 * identificador corto como son las fases (minúsculas, dígitos y guiones
 * bajos); cualquier otra cosa se describe por tipo y largo, para que el log
 * nunca lleve payloads ni texto arbitrario de la respuesta.
 */
function describeIdentifier(value) {
  if (typeof value === "string") {
    return /^[a-z0-9_]{1,64}$/.test(value)
      ? value
      : `cadena de ${value.length} caracteres`;
  }
  return value === null ? "null" : typeof value;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, required, optional, label) {
  invariant(isPlainObject(value), `${label} no es un objeto válido.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    invariant(Object.hasOwn(value, key), `${label} no contiene ${key}.`);
  }
  for (const key of Object.keys(value)) {
    invariant(
      allowed.has(key),
      `${label} contiene el campo desconocido ${key}.`,
    );
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateIsoTimestamp(value, label) {
  invariant(
    typeof value === "string" &&
      value.length > 0 &&
      !Number.isNaN(Date.parse(value)),
    `${label} no es un timestamp ISO válido.`,
  );
}

function validateJsonValue(value, label, depth = 0) {
  invariant(depth <= 12, `${label} excede la profundidad permitida.`);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    invariant(Number.isFinite(value), `${label} contiene un número inválido.`);
    return;
  }
  if (Array.isArray(value)) {
    invariant(value.length <= 1_000, `${label} contiene un array excesivo.`);
    value.forEach((item, index) =>
      validateJsonValue(item, `${label}[${index}]`, depth + 1),
    );
    return;
  }
  invariant(isPlainObject(value), `${label} contiene un valor desconocido.`);
  invariant(
    Object.keys(value).length <= 100,
    `${label} contiene demasiados campos.`,
  );
  for (const [key, item] of Object.entries(value)) {
    invariant(
      /^[A-Za-z0-9_.-]{1,80}$/.test(key),
      `${label} contiene una clave inválida.`,
    );
    validateJsonValue(item, `${label}.${key}`, depth + 1);
  }
}

export function validateAuditToken(token) {
  invariant(typeof token === "string", "Token Cloudflare ausente.");
  invariant(token === token.trim(), "Token Cloudflare contiene espacios.");
  invariant(
    token.length >= 20 && token.length <= 512 && TOKEN_PATTERN.test(token),
    "Token Cloudflare inválido.",
  );
  return token;
}

export function resolveAuditToken({
  environment = process.env,
  promptHidden,
} = {}) {
  const environmentToken = environment?.[CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV];
  if (environmentToken !== undefined)
    return validateAuditToken(environmentToken);
  invariant(
    typeof promptHidden === "function",
    `${CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV} no está definido y no hay una terminal interactiva.`,
  );
  return validateAuditToken(promptHidden());
}

function setTtyEcho(enabled) {
  const result = spawnSync(
    "stty",
    ["-F", "/dev/tty", enabled ? "echo" : "-echo"],
    { stdio: "ignore" },
  );
  invariant(result.status === 0, "No se pudo controlar el eco de /dev/tty.");
}

export function readHiddenAuditToken() {
  let tty;
  try {
    tty = openSync("/dev/tty", "r+");
  } catch {
    throw new Error(
      `${CLOUDFLARE_CACHE_AUDIT_TOKEN_ENV} no está definido y no hay una terminal interactiva.`,
    );
  }
  const bytes = [];
  const byte = Buffer.alloc(1);
  let echoDisabled = false;
  try {
    writeSync(tty, "Token Cloudflare read-only (entrada oculta): ");
    setTtyEcho(false);
    echoDisabled = true;
    while (bytes.length <= 512) {
      invariant(
        readSync(tty, byte, 0, 1, null) === 1,
        "La terminal se cerró antes de recibir el token.",
      );
      if (byte[0] === 3) throw new Error("Ingreso cancelado.");
      if (byte[0] === 10 || byte[0] === 13) break;
      if (byte[0] === 8 || byte[0] === 127) bytes.pop();
      else bytes.push(byte[0]);
    }
    invariant(bytes.length <= 512, "El token excede el máximo permitido.");
    return Buffer.from(bytes).toString("utf8");
  } finally {
    byte.fill(0);
    bytes.fill(0);
    if (echoDisabled) {
      setTtyEcho(true);
      writeSync(tty, "\n");
    }
    closeSync(tty);
  }
}

// Sobre documentado de la API v4 para las respuestas que este auditor lee:
// success, errors, messages y result, nada más. Un `result_info` u otro campo
// extra es una respuesta que no conocemos y bloquea.
function validateEnvelope(payload, { label, resultType }) {
  exactKeys(payload, ["errors", "messages", "result", "success"], [], label);
  invariant(payload.success === true, `${label} no indicó success=true.`);
  invariant(
    Array.isArray(payload.errors) && payload.errors.length === 0,
    `${label} informó errores.`,
  );
  invariant(
    Array.isArray(payload.messages) && payload.messages.length === 0,
    `${label} informó mensajes inesperados.`,
  );
  invariant(
    resultType === "array"
      ? Array.isArray(payload.result)
      : isPlainObject(payload.result),
    `${label}.result tiene una estructura inesperada.`,
  );
}

async function fetchJson({ token, pathname, fetchImpl, label }) {
  const url = new URL(pathname, API_ORIGIN);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`No se pudo completar ${label}.`);
  }
  invariant(
    response instanceof Response,
    `${label} no devolvió una respuesta HTTP válida.`,
  );
  invariant(
    response.ok === true,
    `${label} respondió HTTP ${response.status}.`,
  );
  const contentType = response.headers.get("content-type") ?? "";
  invariant(
    /^application\/json(?:;|$)/i.test(contentType),
    `${label} no devolvió application/json.`,
  );
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 0) {
    invariant(
      contentLength <= MAX_RESPONSE_BYTES,
      `${label} excede el tamaño máximo.`,
    );
  }
  let bytes;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    throw new Error(`${label} no pudo leerse.`);
  }
  invariant(
    bytes.length <= MAX_RESPONSE_BYTES,
    `${label} excede el tamaño máximo.`,
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} devolvió JSON inválido.`);
  } finally {
    bytes.fill(0);
  }
}

function validatePageAction(action, label) {
  exactKeys(action, ["id"], ["value"], label);
  invariant(
    typeof action.id === "string" && PAGE_RULE_ACTIONS.has(action.id),
    `${label} contiene una acción desconocida.`,
  );
  if (Object.hasOwn(action, "value")) {
    validateJsonValue(action.value, `${label}.value`);
  }
}

function validatePageRule(rule, index) {
  const label = `Page Rule ${index}`;
  exactKeys(
    rule,
    [
      "actions",
      "created_on",
      "id",
      "modified_on",
      "priority",
      "status",
      "targets",
    ],
    [],
    label,
  );
  invariant(
    typeof rule.id === "string" && HEX_ID.test(rule.id),
    `${label}.id inválido.`,
  );
  invariant(Number.isInteger(rule.priority), `${label}.priority inválido.`);
  invariant(
    ["active", "disabled"].includes(rule.status),
    `${label}.status desconocido.`,
  );
  validateIsoTimestamp(rule.created_on, `${label}.created_on`);
  validateIsoTimestamp(rule.modified_on, `${label}.modified_on`);
  invariant(
    Array.isArray(rule.targets) && rule.targets.length > 0,
    `${label}.targets inválido.`,
  );
  for (const [targetIndex, target] of rule.targets.entries()) {
    const targetLabel = `${label}.targets[${targetIndex}]`;
    exactKeys(target, ["constraint", "target"], [], targetLabel);
    invariant(target.target === "url", `${targetLabel}.target desconocido.`);
    exactKeys(
      target.constraint,
      ["operator", "value"],
      [],
      `${targetLabel}.constraint`,
    );
    invariant(
      ["contains", "equals", "matches", "not_contain", "not_equal"].includes(
        target.constraint.operator,
      ),
      `${targetLabel}.constraint.operator desconocido.`,
    );
    invariant(
      typeof target.constraint.value === "string" &&
        target.constraint.value.length > 0,
      `${targetLabel}.constraint.value inválido.`,
    );
  }
  invariant(
    Array.isArray(rule.actions) && rule.actions.length > 0,
    `${label}.actions inválido.`,
  );
  rule.actions.forEach((action, actionIndex) =>
    validatePageAction(action, `${label}.actions[${actionIndex}]`),
  );
}

function validateRulesetSummary(summary, index) {
  const label = `Ruleset ${index}`;
  exactKeys(
    summary,
    ["id", "kind", "last_updated", "name", "phase", "version"],
    ["description", "source"],
    label,
  );
  invariant(
    typeof summary.id === "string" && HEX_ID.test(summary.id),
    `${label}.id inválido.`,
  );
  invariant(
    ["custom", "managed", "root", "zone"].includes(summary.kind),
    `${label}.kind desconocido.`,
  );
  invariant(
    typeof summary.name === "string" && summary.name.length > 0,
    `${label}.name inválido.`,
  );
  invariant(
    typeof summary.version === "string" && /^\d+$/.test(summary.version),
    `${label}.version inválido.`,
  );
  invariant(
    RULESET_PHASES.has(summary.phase),
    `${label}.phase desconocida: ${describeIdentifier(summary.phase)}.`,
  );
  validateIsoTimestamp(summary.last_updated, `${label}.last_updated`);
  if (Object.hasOwn(summary, "description")) {
    invariant(
      typeof summary.description === "string",
      `${label}.description inválida.`,
    );
  }
  if (Object.hasOwn(summary, "source")) {
    invariant(
      typeof summary.source === "string" &&
        RULESET_SOURCE_PATTERN.test(summary.source),
      `${label}.source inválido: ${describeIdentifier(summary.source)}.`,
    );
  }
}

function validateCacheRule(rule, index) {
  const label = `Cache Rule ${index}`;
  exactKeys(
    rule,
    [
      "action",
      "action_parameters",
      "enabled",
      "expression",
      "id",
      "last_updated",
      "version",
    ],
    ["description", "ref"],
    label,
  );
  invariant(
    typeof rule.id === "string" && HEX_ID.test(rule.id),
    `${label}.id inválido.`,
  );
  invariant(
    rule.action === "set_cache_settings",
    `${label}.action desconocida.`,
  );
  invariant(typeof rule.enabled === "boolean", `${label}.enabled inválido.`);
  invariant(
    typeof rule.expression === "string" && rule.expression.length > 0,
    `${label}.expression inválida.`,
  );
  invariant(
    typeof rule.version === "string" && /^\d+$/.test(rule.version),
    `${label}.version inválido.`,
  );
  validateIsoTimestamp(rule.last_updated, `${label}.last_updated`);
  if (Object.hasOwn(rule, "description")) {
    invariant(
      typeof rule.description === "string",
      `${label}.description inválida.`,
    );
  }
  if (Object.hasOwn(rule, "ref")) {
    invariant(
      typeof rule.ref === "string" && rule.ref.length > 0,
      `${label}.ref inválido.`,
    );
  }
  invariant(
    isPlainObject(rule.action_parameters),
    `${label}.action_parameters inválido.`,
  );
  const parameterKeys = Object.keys(rule.action_parameters);
  invariant(parameterKeys.length > 0, `${label}.action_parameters está vacío.`);
  for (const key of parameterKeys) {
    invariant(
      CACHE_PARAMETER_KEYS.has(key),
      `${label} contiene el parámetro desconocido ${key}.`,
    );
    validateJsonValue(
      rule.action_parameters[key],
      `${label}.action_parameters.${key}`,
    );
  }
  if (Object.hasOwn(rule.action_parameters, "cache")) {
    invariant(
      typeof rule.action_parameters.cache === "boolean",
      `${label}.action_parameters.cache inválido.`,
    );
  }
}

function validateCacheRuleset(detail, index) {
  const label = `Cache Ruleset ${index}`;
  exactKeys(
    detail,
    ["id", "kind", "last_updated", "name", "phase", "rules", "version"],
    ["description", "source"],
    label,
  );
  validateRulesetSummary(
    Object.fromEntries(
      Object.entries(detail).filter(([key]) => key !== "rules"),
    ),
    index,
  );
  invariant(
    detail.phase === CLOUDFLARE_CACHE_PHASE,
    `${label}.phase no es Cache Rules.`,
  );
  invariant(detail.kind === "zone", `${label}.kind debe ser zone.`);
  invariant(Array.isArray(detail.rules), `${label}.rules no es un array.`);
  detail.rules.forEach(validateCacheRule);
  const ids = detail.rules.map((rule) => rule.id);
  invariant(
    new Set(ids).size === ids.length,
    `${label} contiene IDs duplicados.`,
  );
}

export async function fetchCloudflareCacheConfiguration({
  token,
  fetchImpl = fetch,
} = {}) {
  validateAuditToken(token);
  invariant(typeof fetchImpl === "function", "Cliente HTTP inválido.");

  // Page Rules no pagina. El contrato documentado de
  // GET /zones/{zone_id}/pagerules acepta sólo filtros de orden y estado y
  // devuelve la lista completa en `result`, dentro del sobre
  // success/errors/messages/result y sin `result_info`. Pedir `page` y
  // `per_page` no está documentado, y exigir metadatos de paginación bloqueaba
  // la auditoría ante una respuesta correcta ("no contiene result_info").
  const pageRulesUrl = new URL(
    `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/pagerules`,
    API_ORIGIN,
  );
  pageRulesUrl.search = new URLSearchParams({
    direction: "asc",
    order: "priority",
  }).toString();
  const pageRulesPayload = await fetchJson({
    token,
    pathname: `${pageRulesUrl.pathname}${pageRulesUrl.search}`,
    fetchImpl,
    label: "Page Rules",
  });
  validateEnvelope(pageRulesPayload, {
    label: "Page Rules",
    resultType: "array",
  });
  pageRulesPayload.result.forEach(validatePageRule);
  const pageRules = pageRulesPayload.result;
  const pageRuleIds = pageRules.map((rule) => rule.id);
  invariant(
    new Set(pageRuleIds).size === pageRuleIds.length,
    "Page Rules contiene IDs duplicados.",
  );

  const listPayload = await fetchJson({
    token,
    pathname: `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/rulesets`,
    fetchImpl,
    label: "Rulesets de zona",
  });
  exactKeys(
    listPayload,
    ["errors", "messages", "result", "success"],
    ["result_info"],
    "Rulesets de zona",
  );
  invariant(
    listPayload.success === true,
    "Rulesets de zona no indicó success=true.",
  );
  invariant(
    Array.isArray(listPayload.errors) && listPayload.errors.length === 0,
    "Rulesets de zona informó errores.",
  );
  invariant(
    Array.isArray(listPayload.messages) && listPayload.messages.length === 0,
    "Rulesets de zona informó mensajes inesperados.",
  );
  invariant(
    Array.isArray(listPayload.result),
    "Rulesets de zona.result no es un array.",
  );
  if (Object.hasOwn(listPayload, "result_info")) {
    exactKeys(
      listPayload.result_info,
      [],
      ["count", "cursors"],
      "Rulesets de zona.result_info",
    );
    if (Object.hasOwn(listPayload.result_info, "count")) {
      invariant(
        listPayload.result_info.count === listPayload.result.length,
        "Rulesets de zona count no coincide.",
      );
    }
    if (Object.hasOwn(listPayload.result_info, "cursors")) {
      exactKeys(
        listPayload.result_info.cursors,
        [],
        ["after", "before"],
        "Rulesets de zona cursors",
      );
      invariant(
        !listPayload.result_info.cursors.after,
        "Rulesets de zona requiere paginación no resuelta.",
      );
    }
  }
  listPayload.result.forEach(validateRulesetSummary);
  const summaryIds = listPayload.result.map((summary) => summary.id);
  invariant(
    new Set(summaryIds).size === summaryIds.length,
    "Rulesets de zona contiene IDs duplicados.",
  );
  const cacheSummaries = listPayload.result.filter(
    (summary) => summary.phase === CLOUDFLARE_CACHE_PHASE,
  );
  invariant(
    cacheSummaries.length <= 1,
    "Existe más de un Cache Ruleset de zona.",
  );

  const cacheRulesets = [];
  for (const [index, summary] of cacheSummaries.entries()) {
    const payload = await fetchJson({
      token,
      pathname: `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/rulesets/${summary.id}`,
      fetchImpl,
      label: `Cache Ruleset ${index}`,
    });
    validateEnvelope(payload, {
      label: `Cache Ruleset ${index}`,
      resultType: "object",
    });
    validateCacheRuleset(payload.result, index);
    for (const key of [
      "id",
      "kind",
      "last_updated",
      "name",
      "phase",
      "version",
    ]) {
      invariant(
        payload.result[key] === summary[key],
        `Cache Ruleset ${index} cambió durante la auditoría.`,
      );
    }
    cacheRulesets.push(payload.result);
  }

  return Object.freeze({
    rulesetSummaries: listPayload.result,
    cacheRulesets,
    pageRules,
  });
}

export function reviewCloudflareCacheConfiguration(configuration) {
  exactKeys(
    configuration,
    ["cacheRulesets", "pageRules", "rulesetSummaries"],
    [],
    "Configuración Cloudflare",
  );
  invariant(
    Array.isArray(configuration.rulesetSummaries),
    "rulesetSummaries inválido.",
  );
  invariant(
    Array.isArray(configuration.cacheRulesets),
    "cacheRulesets inválido.",
  );
  invariant(Array.isArray(configuration.pageRules), "pageRules inválido.");
  configuration.rulesetSummaries.forEach(validateRulesetSummary);
  configuration.cacheRulesets.forEach(validateCacheRuleset);
  configuration.pageRules.forEach(validatePageRule);

  const expectedCacheIds = configuration.rulesetSummaries
    .filter((summary) => summary.phase === CLOUDFLARE_CACHE_PHASE)
    .map((summary) => summary.id);
  const actualCacheIds = configuration.cacheRulesets.map(
    (ruleset) => ruleset.id,
  );
  invariant(
    JSON.stringify(expectedCacheIds) === JSON.stringify(actualCacheIds),
    "Los detalles de Cache Rules no cubren exactamente el inventario.",
  );

  const errors = [];
  let activeCacheRuleCount = 0;
  let activePageRuleCount = 0;
  for (const ruleset of configuration.cacheRulesets) {
    for (const rule of ruleset.rules) {
      if (!rule.enabled) continue;
      activeCacheRuleCount += 1;
      const parameterKeys = Object.keys(rule.action_parameters);
      const exactBypass =
        parameterKeys.length === 1 &&
        parameterKeys[0] === "cache" &&
        rule.action_parameters.cache === false;
      if (!exactBypass) {
        errors.push(
          `Cache Rule activa ${rule.id} puede hacer elegible o alterar el cache de contenido dinámico.`,
        );
      }
    }
  }
  for (const rule of configuration.pageRules) {
    if (rule.status !== "active") continue;
    activePageRuleCount += 1;
    const cacheActions = rule.actions
      .map((action) => action.id)
      .filter((id) => PAGE_RULE_CACHE_ACTIONS.has(id));
    if (cacheActions.length > 0) {
      errors.push(
        `Page Rule activa ${rule.id} modifica cache (${cacheActions.join(", ")}).`,
      );
    }
  }

  return Object.freeze({
    approvedForOpen: errors.length === 0,
    errors: Object.freeze(errors),
    rulesetSummaryCount: configuration.rulesetSummaries.length,
    cacheRulesetCount: configuration.cacheRulesets.length,
    cacheRuleCount: configuration.cacheRulesets.reduce(
      (count, ruleset) => count + ruleset.rules.length,
      0,
    ),
    activeCacheRuleCount,
    pageRuleCount: configuration.pageRules.length,
    activePageRuleCount,
  });
}

function assertOutsideRepository(candidate, label) {
  const relative = path.relative(root, candidate);
  invariant(
    relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} debe quedar fuera del repositorio.`,
  );
}

function prepareOutputRoot(outputRoot) {
  invariant(
    typeof outputRoot === "string" && path.isAbsolute(outputRoot),
    "--output-root debe ser absoluto.",
  );
  const lexicalRoot = path.resolve(outputRoot);
  assertOutsideRepository(lexicalRoot, "La auditoría Cloudflare");
  let existingAncestor = lexicalRoot;
  const missingSegments = [];
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    invariant(
      parent !== existingAncestor,
      "No se encontró un ancestro válido para --output-root.",
    );
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  const ancestorStat = lstatSync(existingAncestor);
  invariant(
    !ancestorStat.isSymbolicLink(),
    "El ancestro de --output-root no puede ser un symlink.",
  );
  invariant(
    ancestorStat.isDirectory(),
    "El ancestro de --output-root debe ser un directorio.",
  );
  const safeTarget = path.join(
    realpathSync(existingAncestor),
    ...missingSegments,
  );
  assertOutsideRepository(safeTarget, "La auditoría Cloudflare");
  if (existsSync(outputRoot)) {
    const inputStat = lstatSync(outputRoot);
    invariant(
      !inputStat.isSymbolicLink(),
      "--output-root no puede ser un symlink.",
    );
    invariant(inputStat.isDirectory(), "--output-root debe ser un directorio.");
  } else {
    mkdirSync(safeTarget, { recursive: true, mode: 0o700 });
  }
  const resolved = realpathSync(safeTarget);
  assertOutsideRepository(resolved, "La auditoría Cloudflare");
  chmodSync(resolved, 0o700);
  const stat = statSync(resolved);
  invariant(
    (stat.mode & 0o777) === 0o700,
    "--output-root debe tener mode 0700.",
  );
  if (typeof process.getuid === "function") {
    invariant(
      stat.uid === process.getuid(),
      "--output-root debe pertenecer al usuario actual.",
    );
  }
  return resolved;
}

function timestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function persistCloudflareCacheAudit({
  configuration,
  outputRoot,
  capturedAt = new Date().toISOString(),
  directoryName = timestamp(new Date(capturedAt)),
}) {
  const review = reviewCloudflareCacheConfiguration(configuration);
  validateIsoTimestamp(capturedAt, "capturedAt");
  invariant(
    /^\d{8}T\d{6}Z$/.test(directoryName),
    "Nombre de directorio inválido.",
  );
  const resolvedRoot = prepareOutputRoot(outputRoot);
  const outputDirectory = path.join(resolvedRoot, directoryName);
  mkdirSync(outputDirectory, { mode: 0o700 });
  const snapshot = canonicalJson({
    format: CLOUDFLARE_CACHE_AUDIT_FORMAT,
    accountId: CLOUDFLARE_ACCOUNT_ID,
    capturedAt,
    zoneId: CLOUDFLARE_ZONE_ID,
    zoneName: CLOUDFLARE_ZONE_NAME,
    configuration,
  });
  const snapshotPath = path.join(
    outputDirectory,
    "cloudflare-cache-rules.json",
  );
  writeFileSync(snapshotPath, snapshot, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const manifest = canonicalJson({
    format: CLOUDFLARE_CACHE_AUDIT_FORMAT,
    approvedForOpen: review.approvedForOpen,
    capturedAt,
    snapshotFile: "cloudflare-cache-rules.json",
    snapshotSha256: sha256(snapshot),
    review: {
      activeCacheRuleCount: review.activeCacheRuleCount,
      activePageRuleCount: review.activePageRuleCount,
      cacheRuleCount: review.cacheRuleCount,
      cacheRulesetCount: review.cacheRulesetCount,
      errors: review.errors,
      pageRuleCount: review.pageRuleCount,
      rulesetSummaryCount: review.rulesetSummaryCount,
    },
  });
  const manifestPath = path.join(
    outputDirectory,
    "cloudflare-cache-audit-manifest.json",
  );
  writeFileSync(manifestPath, manifest, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze({
    manifestPath,
    outputDirectory,
    review,
    snapshotPath,
    snapshotSha256: sha256(snapshot),
  });
}

export function verifyPersistedCloudflareCacheAudit(outputDirectory) {
  invariant(
    path.isAbsolute(outputDirectory),
    "El directorio de auditoría debe ser absoluto.",
  );
  const resolved = realpathSync(outputDirectory);
  assertOutsideRepository(resolved, "La auditoría Cloudflare");
  const directoryStat = lstatSync(resolved);
  invariant(
    directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
    "Directorio de auditoría inválido.",
  );
  invariant(
    (directoryStat.mode & 0o777) === 0o700,
    "Directorio de auditoría debe tener mode 0700.",
  );
  const snapshotPath = path.join(resolved, "cloudflare-cache-rules.json");
  const manifestPath = path.join(
    resolved,
    "cloudflare-cache-audit-manifest.json",
  );
  for (const file of [snapshotPath, manifestPath]) {
    const fileStat = lstatSync(file);
    invariant(
      fileStat.isFile() && !fileStat.isSymbolicLink(),
      `${path.basename(file)} no es un archivo regular.`,
    );
    invariant(
      (fileStat.mode & 0o777) === 0o600,
      `${path.basename(file)} debe tener mode 0600.`,
    );
  }
  const snapshotText = readFileSync(snapshotPath, "utf8");
  const manifestText = readFileSync(manifestPath, "utf8");
  let snapshot;
  let manifest;
  try {
    snapshot = JSON.parse(snapshotText);
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("La auditoría Cloudflare no contiene JSON válido.");
  }
  exactKeys(
    snapshot,
    [
      "accountId",
      "capturedAt",
      "configuration",
      "format",
      "zoneId",
      "zoneName",
    ],
    [],
    "Snapshot Cloudflare",
  );
  exactKeys(
    manifest,
    [
      "approvedForOpen",
      "capturedAt",
      "format",
      "review",
      "snapshotFile",
      "snapshotSha256",
    ],
    [],
    "Manifest Cloudflare",
  );
  invariant(
    snapshot.format === CLOUDFLARE_CACHE_AUDIT_FORMAT,
    "Formato de snapshot desconocido.",
  );
  invariant(
    manifest.format === CLOUDFLARE_CACHE_AUDIT_FORMAT,
    "Formato de manifest desconocido.",
  );
  invariant(
    manifest.snapshotFile === "cloudflare-cache-rules.json",
    "Manifest referencia otro snapshot.",
  );
  invariant(
    /^[a-f0-9]{64}$/.test(manifest.snapshotSha256),
    "SHA-256 del manifest inválido.",
  );
  invariant(
    manifest.snapshotSha256 === sha256(snapshotText),
    "SHA-256 del snapshot no coincide.",
  );
  invariant(
    snapshot.accountId === CLOUDFLARE_ACCOUNT_ID,
    "Account ID inesperado.",
  );
  invariant(snapshot.zoneId === CLOUDFLARE_ZONE_ID, "Zone ID inesperado.");
  invariant(
    snapshot.zoneName === CLOUDFLARE_ZONE_NAME,
    "Zone name inesperado.",
  );
  invariant(
    snapshot.capturedAt === manifest.capturedAt,
    "capturedAt no coincide.",
  );
  const review = reviewCloudflareCacheConfiguration(snapshot.configuration);
  invariant(
    manifest.approvedForOpen === review.approvedForOpen,
    "Resultado de revisión no coincide.",
  );
  invariant(
    canonicalJson(manifest.review) ===
      canonicalJson({
        activeCacheRuleCount: review.activeCacheRuleCount,
        activePageRuleCount: review.activePageRuleCount,
        cacheRuleCount: review.cacheRuleCount,
        cacheRulesetCount: review.cacheRulesetCount,
        errors: review.errors,
        pageRuleCount: review.pageRuleCount,
        rulesetSummaryCount: review.rulesetSummaryCount,
      }),
    "Detalle de revisión no coincide.",
  );
  return Object.freeze({
    manifest,
    review,
    snapshot,
    snapshotSha256: sha256(snapshotText),
  });
}

export function parseArguments(arguments_) {
  invariant(Array.isArray(arguments_), "Argumentos inválidos.");
  invariant(
    arguments_.length === 2 && arguments_[0] === "--output-root",
    "Se requiere únicamente --output-root ABSOLUTO.",
  );
  invariant(
    arguments_[1] && !arguments_[1].startsWith("--"),
    "Falta valor para --output-root.",
  );
  return Object.freeze({ outputRoot: arguments_[1] });
}

async function main() {
  invariant(
    Number(process.versions.node.split(".")[0]) === 22,
    `El auditor exige Node 22.x; actual ${process.version}.`,
  );
  process.umask(0o077);
  const { outputRoot } = parseArguments(process.argv.slice(2));
  let token = resolveAuditToken({ promptHidden: readHiddenAuditToken });
  try {
    const configuration = await fetchCloudflareCacheConfiguration({ token });
    const audit = persistCloudflareCacheAudit({
      configuration,
      outputRoot: path.resolve(outputRoot),
    });
    const verified = verifyPersistedCloudflareCacheAudit(audit.outputDirectory);
    console.log(
      `Auditoría Cloudflare guardada fuera del repositorio: ${audit.outputDirectory}`,
    );
    console.log(
      `Cloudflare cache snapshot SHA-256: ${verified.snapshotSha256}`,
    );
    console.log(
      `Cache Rules: ${verified.review.cacheRuleCount}; Page Rules: ${verified.review.pageRuleCount}.`,
    );
    if (!verified.review.approvedForOpen) {
      console.error("Auditoría Cloudflare cache: BLOQUEADA");
      for (const error of verified.review.errors) console.error(`  ✗ ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      "Auditoría Cloudflare cache: PASS (sin reglas activas que cacheen contenido dinámico).",
    );
  } finally {
    token = "";
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  main().catch((error) => {
    console.error(
      `Auditoría Cloudflare cache: BLOQUEADA — ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    );
    process.exitCode = 1;
  });
}
