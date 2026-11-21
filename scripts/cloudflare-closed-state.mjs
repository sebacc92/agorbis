#!/usr/bin/env node

import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID = "4d78fb10c1ae65281ec851479d5045dc";
const ZONE_ID = "1649628cde7b43fc40bceaca54d02e16";
const ZONE_NAME = "agorbis.com";
const WORKER_NAME = "agorbis";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const WRANGLER_AUTH_TIMEOUT_MS = 15_000;
const WRANGLER_AUTH_MAX_BUFFER_BYTES = 64 * 1024;
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const WRANGLER_ENTRYPOINT = resolve(
  REPOSITORY_ROOT,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const WRANGLER_EMPTY_ENV_FILE = resolve(
  REPOSITORY_ROOT,
  "scripts",
  "exceptional-release-empty.env",
);
const execFileAsync = promisify(execFile);

const PHASES = Object.freeze(["workers-dev", "custom-domains"]);
const STATE_PROFILES = Object.freeze(["closed", "closed-open-crons", "open"]);
const SECRET_STAGES = Object.freeze([
  "none",
  "supabase",
  "turnstile",
  "complete",
]);
export const CLOUDFLARE_CLOSED_STATE_COMPONENTS = Object.freeze([
  "secrets",
  "bindings",
  "domains",
  "crons",
  "configuration",
  "ai",
]);

const SECRET_NAMES_BY_STAGE = Object.freeze({
  none: Object.freeze([]),
  supabase: Object.freeze(["SUPABASE_SECRET_KEY"]),
  turnstile: Object.freeze(["SUPABASE_SECRET_KEY", "TURNSTILE_SECRET"]),
  complete: Object.freeze([
    "CRON_SECRET",
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SECRET",
  ]),
});

const EXPECTED_SHARED_PLAINTEXT_BINDINGS = Object.freeze({
  AGORBIS_RUNTIME: "cloudflare-workers",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
  PUBLIC_SITE_URL: "https://agorbis.com",
  PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
  PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
  TURNSTILE_HOSTNAMES: "agorbis.com",
});

const EXPECTED_OPEN_CRONS = Object.freeze([
  "10 * * * *",
  "5 0 * * *",
  "25 0 * * *",
  "20 3 * * *",
  "40 3 * * *",
]);

const EXPECTED_CRONS_BY_PROFILE = Object.freeze({
  closed: Object.freeze([]),
  "closed-open-crons": EXPECTED_OPEN_CRONS,
  open: EXPECTED_OPEN_CRONS,
});
const FORBIDDEN_AI_BINDING_NAMES = new Set([
  "AI",
  "AI_SUMMARY_ENABLED",
  "OPENAI_API_KEY",
  "OPENAI_SUMMARY_MODEL",
  "SUMMARY_ENABLED",
]);
const FORBIDDEN_AI_BINDING_TYPES = new Set(["ai", "vectorize"]);

const ENDPOINTS = Object.freeze({
  accountSettings: `/accounts/${ACCOUNT_ID}/workers/account-settings`,
  deployments: `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/deployments`,
  settings: `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/settings`,
  schedules: `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/schedules`,
  secrets: `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/secrets`,
  subdomain: `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}/subdomain`,
  domains: `/accounts/${ACCOUNT_ID}/workers/domains?zone_id=${ZONE_ID}`,
  routes: `/zones/${ZONE_ID}/workers/routes`,
  scripts: `/accounts/${ACCOUNT_ID}/workers/scripts`,
});

const STANDARD_ENVELOPE_KEYS = Object.freeze([
  "errors",
  "messages",
  "result",
  "success",
]);
const DOMAINS_ENVELOPE_KEYS = Object.freeze([
  "errors",
  "messages",
  "result",
  "result_info",
  "success",
]);
const DEPLOYMENTS_RESULT_INFO_KEYS = Object.freeze([
  "count",
  "page",
  "per_page",
  "total_count",
  "total_pages",
]);
const DEPLOYMENT_MESSAGE_MAX_BYTES = 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN_ID_PATTERN = /^[0-9a-f]{40}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const APPROVED_DEPLOYMENT_TRIGGERS = Object.freeze([
  "deployment",
  "promotion",
  "rollback",
  "secret",
  "upload",
]);
const APPROVED_SETTINGS_TRIGGERS = Object.freeze([
  "promotion",
  "rollback",
  "secret",
  "upload",
  "version_upload",
]);
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/
const MAX_SETTINGS_ANNOTATION_BYTES = Object.freeze({
  "workers/message": 1_000,
  "workers/tag": 100,
});

export const CLOUDFLARE_CLOSED_STATE_CONSTANTS = Object.freeze({
  accountId: ACCOUNT_ID,
  apiOrigin: API_ORIGIN,
  phases: PHASES,
  secretNamesByStage: SECRET_NAMES_BY_STAGE,
  secretStages: SECRET_STAGES,
  workerName: WORKER_NAME,
  zoneId: ZONE_ID,
  zoneName: ZONE_NAME,
});

export const CLOUDFLARE_STATE_CONSTANTS = Object.freeze({
  ...CLOUDFLARE_CLOSED_STATE_CONSTANTS,
  openCrons: EXPECTED_OPEN_CRONS,
  profiles: STATE_PROFILES,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export class CloudflareStateFactualMismatchError extends Error {}

function factualInvariant(condition, message) {
  if (!condition) throw new CloudflareStateFactualMismatchError(message);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.every((entry) => typeof entry === "string") &&
    JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected))
  );
}

function expectedPlaintextBindings(profile) {
  return Object.freeze({
    AGORBIS_LAUNCH_MODE: profile === "open" ? "open" : "closed",
    ...EXPECTED_SHARED_PLAINTEXT_BINDINGS,
    // D122: el perfil abierto vuelve a ofrecer Google; el cerrado y el de
    // respaldo siguen sólo con correo. La identidad de la versión activa se
    // verifica igual por id, etag, tag y mensaje (D97).
    PUBLIC_GOOGLE_AUTH_ENABLED: profile === "open" ? "true" : "false",
  });
}

function exactKeys(value, expectedKeys, label) {
  invariant(isPlainObject(value), `${label} no es un objeto válido.`);
  invariant(
    JSON.stringify(sorted(Object.keys(value))) ===
      JSON.stringify(sorted(expectedKeys)),
    `${label} no coincide con la estructura aprobada.`,
  );
}

function allowedKeys(value, requiredKeys, optionalKeys, label) {
  invariant(isPlainObject(value), `${label} no es un objeto válido.`);
  const actual = Object.keys(value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  invariant(
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
      actual.every((key) => allowed.has(key)),
    `${label} no coincide con la estructura aprobada.`,
  );
}

function nonEmptyString(value, label) {
  invariant(
    typeof value === "string" && value.length > 0,
    `${label} no contiene un string válido.`,
  );
}

function isoTimestamp(value, label) {
  nonEmptyString(value, label);
  invariant(
    !Number.isNaN(Date.parse(value)),
    `${label} no es una fecha válida.`,
  );
}

function uuid(value, label) {
  invariant(
    typeof value === "string" && UUID_PATTERN.test(value),
    `${label} no contiene un UUID válido.`,
  );
}

function validateStandardEnvelope(payload, label) {
  exactKeys(payload, STANDARD_ENVELOPE_KEYS, label);
  invariant(payload.success === true, `${label} no indicó success=true.`);
  invariant(
    Array.isArray(payload.errors) && payload.errors.length === 0,
    `${label} informó errores.`,
  );
  invariant(
    Array.isArray(payload.messages) && payload.messages.length === 0,
    `${label} informó mensajes inesperados.`,
  );
}

function validateDomainsEnvelope(payload) {
  const label = "GET custom domains";
  exactKeys(payload, DOMAINS_ENVELOPE_KEYS, label);
  invariant(payload.success === true, `${label} no indicó success=true.`);
  invariant(payload.errors === null, `${label} informó errores.`);
  invariant(
    payload.messages === null,
    `${label} informó mensajes inesperados.`,
  );
  exactKeys(
    payload.result_info,
    ["count", "page", "per_page", "total_count"],
    `${label}.result_info`,
  );
  for (const field of ["count", "page", "per_page", "total_count"]) {
    invariant(
      Number.isInteger(payload.result_info[field]) &&
        payload.result_info[field] >= 0,
      `${label}.result_info.${field} no es válido.`,
    );
  }
  invariant(
    payload.result_info.page === 1,
    `${label} no devolvió la página 1.`,
  );
}

function validateObservability(value, label) {
  exactKeys(
    value,
    ["enabled", "head_sampling_rate", "logs", "redact_query_string", "traces"],
    label,
  );
  factualInvariant(value.enabled === false, `${label}.enabled debe ser false.`);
  factualInvariant(
    value.head_sampling_rate === 1,
    `${label}.head_sampling_rate debe ser 1.`,
  );
  factualInvariant(
    value.redact_query_string === false,
    `${label}.redact_query_string no coincide con el estado aprobado.`,
  );
  exactKeys(
    value.logs,
    ["enabled", "head_sampling_rate", "invocation_logs", "persist"],
    `${label}.logs`,
  );
  factualInvariant(
    value.logs.enabled === true,
    `${label}.logs debe estar habilitado.`,
  );
  factualInvariant(
    value.logs.head_sampling_rate === 1,
    `${label}.logs.head_sampling_rate debe ser 1.`,
  );
  factualInvariant(
    value.logs.invocation_logs === false,
    `${label}.logs.invocation_logs debe ser false.`,
  );
  factualInvariant(
    value.logs.persist === true,
    `${label}.logs.persist debe ser true.`,
  );
  exactKeys(
    value.traces,
    ["enabled", "head_sampling_rate", "persist"],
    `${label}.traces`,
  );
  factualInvariant(
    value.traces.enabled === false,
    `${label}.traces debe estar apagado.`,
  );
  factualInvariant(
    value.traces.head_sampling_rate === 1,
    `${label}.traces.head_sampling_rate debe ser 1.`,
  );
  invariant(
    value.traces.persist === true,
    `${label}.traces.persist debe ser true.`,
  );
}

function validateAccountSettings(payload) {
  const label = "GET account settings";
  validateStandardEnvelope(payload, label);
  exactKeys(
    payload.result,
    ["default_usage_model", "green_compute"],
    `${label}.result`,
  );
  factualInvariant(
    payload.result.default_usage_model === "standard",
    "La cuenta no usa el usage model standard.",
  );
  invariant(
    typeof payload.result.green_compute === "boolean",
    `${label}.result.green_compute no es booleano.`,
  );
}

function validateDeploymentShape(deployment, index) {
  const label = `GET deployments.result.deployments[${index}]`;
  allowedKeys(
    deployment,
    ["annotations", "created_on", "id", "source", "strategy", "versions"],
    ["author_email"],
    label,
  );
  uuid(deployment.id, `${label}.id`);
  isoTimestamp(deployment.created_on, `${label}.created_on`);
  factualInvariant(
    deployment.source === "wrangler",
    `${label}.source no es wrangler.`,
  );
  factualInvariant(
    deployment.strategy === "percentage",
    `${label}.strategy no es percentage.`,
  );
  if (Object.hasOwn(deployment, "author_email")) {
    nonEmptyString(deployment.author_email, `${label}.author_email`);
  }
  allowedKeys(
    deployment.annotations,
    ["workers/triggered_by"],
    ["workers/message"],
    `${label}.annotations`,
  );
  factualInvariant(
    APPROVED_DEPLOYMENT_TRIGGERS.includes(
      deployment.annotations["workers/triggered_by"],
    ),
    `${label}.annotations contiene un trigger de deployment no aprobado.`,
  );
  // La API documenta `workers/message` como string opcional de hasta 1000
  // bytes, sin mínimo: `wrangler versions deploy -y` sin mensaje deja "" en
  // el historial, y ese historial no se puede corregir después.
  if (Object.hasOwn(deployment.annotations, "workers/message")) {
    const message = deployment.annotations["workers/message"];
    invariant(
      typeof message === "string" &&
        Buffer.byteLength(message, "utf8") <= DEPLOYMENT_MESSAGE_MAX_BYTES,
      `${label}.annotations.workers/message no contiene un string válido.`,
    );
  }
  invariant(
    Array.isArray(deployment.versions) && deployment.versions.length > 0,
    `${label}.versions está vacío o no es un array.`,
  );
  const versionIds = new Set();
  let totalPercentage = 0;
  for (const [versionIndex, version] of deployment.versions.entries()) {
    const versionLabel = `${label}.versions[${versionIndex}]`;
    exactKeys(version, ["percentage", "version_id"], versionLabel);
    uuid(version.version_id, `${versionLabel}.version_id`);
    invariant(
      typeof version.percentage === "number" &&
        Number.isFinite(version.percentage) &&
        version.percentage > 0 &&
        version.percentage <= 100,
      `${versionLabel}.percentage no es válido.`,
    );
    invariant(
      !versionIds.has(version.version_id),
      `${label}.versions contiene un ID duplicado.`,
    );
    versionIds.add(version.version_id);
    totalPercentage += version.percentage;
  }
  factualInvariant(
    Math.abs(totalPercentage - 100) < Number.EPSILON,
    `${label}.versions no distribuye exactamente 100%.`,
  );
}

// GET deployments documenta `result_info` opcional, y Producción lo devolvió
// el 01-11-2026. Se acepta sólo como la primera página, coherente con lo
// recibido: el activo es el primero de la lista según la API, así que las
// páginas siguientes no cambian qué versión sirve tráfico. Con al menos un
// deployment recibido, estas igualdades ya excluyen ceros y negativos.
function validateDeploymentsResultInfo(resultInfo, receivedCount, label) {
  exactKeys(resultInfo, DEPLOYMENTS_RESULT_INFO_KEYS, `${label}.result_info`);
  for (const field of DEPLOYMENTS_RESULT_INFO_KEYS) {
    invariant(
      Number.isSafeInteger(resultInfo[field]),
      `${label}.result_info.${field} no es válido.`,
    );
  }
  const {
    count,
    page,
    per_page: perPage,
    total_count: totalCount,
    total_pages: totalPages,
  } = resultInfo;
  invariant(
    page === 1 &&
      count === receivedCount &&
      count <= perPage &&
      totalCount >= count &&
      totalPages === Math.ceil(totalCount / perPage) &&
      (totalPages !== 1 || totalCount === count),
    `${label}.result_info no es coherente con la primera página recibida.`,
  );
}

function validateDeployments(payload) {
  const label = "GET deployments";
  invariant(isPlainObject(payload), `${label} no es un objeto válido.`);
  const { result_info: resultInfo, ...envelope } = payload;
  validateStandardEnvelope(envelope, label);
  exactKeys(payload.result, ["deployments"], `${label}.result`);
  invariant(
    Array.isArray(payload.result.deployments) &&
      payload.result.deployments.length > 0,
    `${label} no devolvió deployments.`,
  );
  if (Object.hasOwn(payload, "result_info")) {
    validateDeploymentsResultInfo(
      resultInfo,
      payload.result.deployments.length,
      label,
    );
  }
  const ids = new Set();
  payload.result.deployments.forEach((deployment, index) => {
    validateDeploymentShape(deployment, index);
    invariant(!ids.has(deployment.id), `${label} contiene un ID duplicado.`);
    ids.add(deployment.id);
  });
  const active = payload.result.deployments[0];
  factualInvariant(
    active.versions.length === 1 && active.versions[0].percentage === 100,
    "El deployment activo no tiene una única versión sirviendo al 100%.",
  );
  return {
    deploymentId: active.id,
    versionId: active.versions[0].version_id,
  };
}

function validateBinding(binding, expectedPlaintext, expectedSecrets) {
  invariant(
    isPlainObject(binding),
    "GET settings contiene un binding inválido.",
  );
  nonEmptyString(binding.name, "GET settings binding.name");
  nonEmptyString(binding.type, "GET settings binding.type");
  if (binding.type === "plain_text") {
    exactKeys(binding, ["name", "text", "type"], `Binding ${binding.name}`);
    factualInvariant(
      Object.hasOwn(expectedPlaintext, binding.name) &&
        expectedPlaintext[binding.name] === binding.text,
      `El binding plaintext ${binding.name} no coincide con el perfil solicitado.`,
    );
    return "plaintext";
  }
  if (binding.type === "assets") {
    exactKeys(binding, ["name", "type"], `Binding ${binding.name}`);
    factualInvariant(
      binding.name === "ASSETS",
      "El único binding assets permitido es ASSETS.",
    );
    return "assets";
  }
  if (binding.type === "secret_text") {
    exactKeys(binding, ["name", "type"], `Binding ${binding.name}`);
    factualInvariant(
      expectedSecrets.includes(binding.name),
      "GET settings contiene un binding secret no aprobado para el stage.",
    );
    return "secret";
  }
  throw new CloudflareStateFactualMismatchError(
    "GET settings contiene un tipo de binding no aprobado.",
  );
}

function validateSettingsEnvelope(payload) {
  const label = "GET settings";
  validateStandardEnvelope(payload, label);
  exactKeys(
    payload.result,
    [
      "annotations",
      "bindings",
      "compatibility_date",
      "compatibility_flags",
      "limits",
      "logpush",
      "observability",
      "placement",
      "tags",
      "tail_consumers",
      "usage_model",
    ],
    `${label}.result`,
  );
  invariant(
    Array.isArray(payload.result.bindings),
    `${label}.result.bindings no es un array.`,
  );
  return payload.result;
}

function validateSettingsConfiguration(payload) {
  const label = "GET settings";
  const result = validateSettingsEnvelope(payload);
  allowedKeys(
    result.annotations,
    ["workers/triggered_by"],
    Object.keys(MAX_SETTINGS_ANNOTATION_BYTES),
    `${label}.result.annotations`,
  );
  for (const [name, maxBytes] of Object.entries(
    MAX_SETTINGS_ANNOTATION_BYTES,
  )) {
    if (!Object.hasOwn(result.annotations, name)) continue;
    invariant(
      typeof result.annotations[name] === "string" &&
        Buffer.byteLength(result.annotations[name], "utf8") <= maxBytes,
      `${label}.result.annotations.${name} no es un string dentro del límite de bytes aprobado.`,
    );
  }
  factualInvariant(
    APPROVED_SETTINGS_TRIGGERS.includes(
      result.annotations["workers/triggered_by"],
    ),
    `${label}.result.annotations contiene un trigger no aprobado.`,
  );
  factualInvariant(
    result.compatibility_date === "2026-08-25",
    `${label} no usa la compatibility date aprobada.`,
  );
  factualInvariant(
    sameStrings(result.compatibility_flags, ["nodejs_compat"]),
    `${label} no usa únicamente nodejs_compat.`,
  );
  exactKeys(result.limits, ["cpu_ms"], `${label}.result.limits`);
  factualInvariant(
    result.limits.cpu_ms === 30_000,
    `${label} no fija cpu_ms=30000.`,
  );
  factualInvariant(
    result.usage_model === "standard",
    `${label} no usa usage_model=standard.`,
  );
  factualInvariant(
    result.logpush === false,
    `${label}.logpush debe ser false.`,
  );
  validateObservability(result.observability, `${label}.result.observability`);
  exactKeys(result.placement, [], `${label}.result.placement`);
  factualInvariant(
    Array.isArray(result.tags) && result.tags.length === 0,
    `${label}.result.tags debe estar vacío.`,
  );
  factualInvariant(
    Array.isArray(result.tail_consumers) && result.tail_consumers.length === 0,
    `${label}.result.tail_consumers debe estar vacío.`,
  );
}

function validateSettingsBindings(payload, expectedPlaintext, expectedSecrets) {
  const label = "GET settings";
  const result = validateSettingsEnvelope(payload);
  const seenNames = new Set();
  const plaintextNames = [];
  const secretNames = [];
  let assetsCount = 0;
  for (const binding of result.bindings) {
    const kind = validateBinding(binding, expectedPlaintext, expectedSecrets);
    factualInvariant(
      !seenNames.has(binding.name),
      `${label}.result.bindings contiene un nombre duplicado.`,
    );
    seenNames.add(binding.name);
    if (kind === "plaintext") plaintextNames.push(binding.name);
    else if (kind === "secret") secretNames.push(binding.name);
    else assetsCount += 1;
  }
  factualInvariant(
    sameStrings(plaintextNames, Object.keys(expectedPlaintext)),
    `${label} no contiene exactamente los bindings plaintext aprobados.`,
  );
  factualInvariant(
    assetsCount === 1,
    `${label} debe contener un único binding ASSETS.`,
  );
  factualInvariant(
    sameStrings(secretNames, expectedSecrets),
    `${label} no contiene exactamente los secrets del stage.`,
  );
}

function validateSettingsSecrets(payload, expectedSecrets) {
  const label = "GET settings";
  const result = validateSettingsEnvelope(payload);
  const secretNames = [];
  for (const binding of result.bindings) {
    invariant(
      isPlainObject(binding),
      `${label} contiene un binding inválido para acreditar secrets.`,
    );
    nonEmptyString(binding.name, `${label} binding.name`);
    nonEmptyString(binding.type, `${label} binding.type`);
    if (binding.type !== "secret_text") continue;
    exactKeys(binding, ["name", "type"], `Binding ${binding.name}`);
    secretNames.push(binding.name);
  }
  factualInvariant(
    new Set(secretNames).size === secretNames.length,
    `${label} contiene un nombre de secret duplicado.`,
  );
  factualInvariant(
    sameStrings(secretNames, expectedSecrets),
    `${label} no contiene exactamente los secrets del stage.`,
  );
}

function validateSettingsAiDisabled(payload) {
  const label = "GET settings";
  const result = validateSettingsEnvelope(payload);
  for (const binding of result.bindings) {
    invariant(
      isPlainObject(binding),
      `${label} contiene un binding inválido para acreditar IA deshabilitada.`,
    );
    nonEmptyString(binding.name, `${label} binding.name`);
    nonEmptyString(binding.type, `${label} binding.type`);
    const normalizedName = binding.name.toUpperCase();
    factualInvariant(
      !FORBIDDEN_AI_BINDING_NAMES.has(normalizedName) &&
        !/(?:^|_)(?:AI|SUMMARY|SUMMARIES)(?:_|$)/.test(normalizedName) &&
        !FORBIDDEN_AI_BINDING_TYPES.has(binding.type.toLowerCase()),
      `${label} contiene un binding habilitante de IA o resúmenes.`,
    );
  }
}

function validateSettings(payload, expectedPlaintext, expectedSecrets) {
  validateSettingsConfiguration(payload);
  validateSettingsBindings(payload, expectedPlaintext, expectedSecrets);
  validateSettingsAiDisabled(payload);
}

function validateSchedules(payload, profile) {
  const label = "GET schedules";
  validateStandardEnvelope(payload, label);
  exactKeys(payload.result, ["schedules"], `${label}.result`);
  invariant(
    Array.isArray(payload.result.schedules),
    `${label}.result.schedules no es un array.`,
  );
  const crons = [];
  for (const [index, schedule] of payload.result.schedules.entries()) {
    const scheduleLabel = `${label}.result.schedules[${index}]`;
    allowedKeys(
      schedule,
      ["cron"],
      ["created_on", "modified_on"],
      scheduleLabel,
    );
    nonEmptyString(schedule.cron, `${scheduleLabel}.cron`);
    for (const timestamp of ["created_on", "modified_on"]) {
      if (Object.hasOwn(schedule, timestamp)) {
        isoTimestamp(schedule[timestamp], `${scheduleLabel}.${timestamp}`);
      }
    }
    crons.push(schedule.cron);
  }
  factualInvariant(
    new Set(crons).size === crons.length,
    `${label} contiene un Cron Trigger duplicado.`,
  );
  factualInvariant(
    sameStrings(crons, EXPECTED_CRONS_BY_PROFILE[profile]),
    profile === "closed"
      ? "El Worker cerrado tiene uno o más Cron Triggers."
      : "El Worker no contiene exactamente los cinco Cron Triggers aprobados.",
  );
}

function validateSecrets(payload, expectedSecrets) {
  const label = "GET secrets";
  validateStandardEnvelope(payload, label);
  invariant(Array.isArray(payload.result), `${label}.result no es un array.`);
  const names = [];
  for (const secret of payload.result) {
    exactKeys(secret, ["name", "type"], `${label}.result[]`);
    nonEmptyString(secret.name, `${label}.result[].name`);
    factualInvariant(
      secret.type === "secret_text",
      `${label}.result[] contiene un tipo de secret no aprobado.`,
    );
    names.push(secret.name);
  }
  factualInvariant(
    new Set(names).size === names.length,
    `${label}.result contiene un nombre duplicado.`,
  );
  factualInvariant(
    sameStrings(names, expectedSecrets),
    `${label} no coincide con el secret stage solicitado.`,
  );
}

function validateSubdomain(payload, phase) {
  const label = "GET subdomain";
  validateStandardEnvelope(payload, label);
  exactKeys(payload.result, ["enabled", "previews_enabled"], `${label}.result`);
  factualInvariant(
    payload.result.previews_enabled === false,
    "Las preview URLs del Worker deben permanecer deshabilitadas.",
  );
  const expectedEnabled = phase === "workers-dev";
  factualInvariant(
    payload.result.enabled === expectedEnabled,
    phase === "workers-dev"
      ? "La fase workers-dev requiere el subdominio workers.dev habilitado."
      : "La fase custom-domains requiere workers.dev deshabilitado.",
  );
}

function validateDomain(domain, expectedHostname) {
  const label = `Custom Domain ${expectedHostname}`;
  exactKeys(
    domain,
    [
      "cert_id",
      "enabled",
      "environment",
      "hostname",
      "id",
      "previews_enabled",
      "service",
      "zone_id",
      "zone_name",
    ],
    label,
  );
  invariant(
    typeof domain.id === "string" && DOMAIN_ID_PATTERN.test(domain.id),
    `${label}.id no es válido.`,
  );
  uuid(domain.cert_id, `${label}.cert_id`);
  factualInvariant(
    domain.hostname === expectedHostname,
    `${label}.hostname no coincide.`,
  );
  factualInvariant(
    domain.service === WORKER_NAME,
    `${label}.service no coincide.`,
  );
  factualInvariant(domain.zone_id === ZONE_ID, `${label}.zone_id no coincide.`);
  factualInvariant(
    domain.zone_name === ZONE_NAME,
    `${label}.zone_name no coincide.`,
  );
  factualInvariant(
    domain.environment === "production",
    `${label}.environment no es production.`,
  );
  factualInvariant(domain.enabled === true, `${label}.enabled no es true.`);
  factualInvariant(
    domain.previews_enabled === false,
    `${label}.previews_enabled no es false.`,
  );
}

function validateDomains(payload, phase) {
  const label = "GET custom domains";
  validateDomainsEnvelope(payload);
  invariant(Array.isArray(payload.result), `${label}.result no es un array.`);
  const expectedCount = phase === "workers-dev" ? 0 : 2;
  factualInvariant(
    payload.result.length === expectedCount,
    phase === "workers-dev"
      ? "La fase workers-dev no admite Custom Domains."
      : "La fase custom-domains requiere exactamente apex y www.",
  );
  factualInvariant(
    payload.result_info.count === expectedCount &&
      payload.result_info.total_count === expectedCount &&
      payload.result_info.per_page >= expectedCount,
    `${label}.result_info no coincide con el inventario esperado.`,
  );
  if (phase === "workers-dev") return;
  const byHostname = new Map();
  for (const domain of payload.result) {
    invariant(
      isPlainObject(domain),
      `${label}.result contiene un item inválido.`,
    );
    nonEmptyString(domain.hostname, `${label}.result[].hostname`);
    factualInvariant(
      !byHostname.has(domain.hostname),
      `${label}.result contiene un hostname duplicado.`,
    );
    byHostname.set(domain.hostname, domain);
  }
  factualInvariant(
    byHostname.size === 2 &&
      byHostname.has("agorbis.com") &&
      byHostname.has("www.agorbis.com"),
    "Los Custom Domains no son exactamente agorbis.com y www.agorbis.com.",
  );
  validateDomain(byHostname.get("agorbis.com"), "agorbis.com");
  validateDomain(byHostname.get("www.agorbis.com"), "www.agorbis.com");
}

function validateRoutes(payload) {
  const label = "GET zone routes";
  validateStandardEnvelope(payload, label);
  factualInvariant(
    Array.isArray(payload.result) && payload.result.length === 0,
    "La zona tiene una o más Worker Routes; el corte cerrado sólo admite Custom Domains.",
  );
}

function validateTargetScript(script) {
  const label = "GET scripts.result[agorbis]";
  exactKeys(
    script,
    [
      "compatibility_date",
      "compatibility_flags",
      "created_on",
      "deployment_id",
      "etag",
      "handlers",
      "has_assets",
      "has_modules",
      "id",
      "last_deployed_from",
      "limits",
      "logpush",
      "modified_on",
      "observability",
      "routes",
      "tag",
      "tags",
      "tail_consumers",
      "usage_model",
    ],
    label,
  );
  factualInvariant(script.id === WORKER_NAME, `${label}.id no coincide.`);
  factualInvariant(
    script.compatibility_date === "2026-08-25",
    `${label}.compatibility_date no coincide.`,
  );
  factualInvariant(
    sameStrings(script.compatibility_flags, ["nodejs_compat"]),
    `${label}.compatibility_flags no coincide.`,
  );
  factualInvariant(
    sameStrings(script.handlers, ["fetch", "scheduled"]),
    "El Worker debe exponer exactamente los handlers fetch y scheduled.",
  );
  factualInvariant(
    script.has_assets === true,
    `${label}.has_assets debe ser true.`,
  );
  factualInvariant(
    script.has_modules === true,
    `${label}.has_modules debe ser true.`,
  );
  factualInvariant(
    script.last_deployed_from === "wrangler",
    `${label}.last_deployed_from no es wrangler.`,
  );
  factualInvariant(
    script.usage_model === "standard",
    `${label}.usage_model no es standard.`,
  );
  exactKeys(script.limits, ["cpu_ms"], `${label}.limits`);
  factualInvariant(
    script.limits.cpu_ms === 30_000,
    `${label}.limits.cpu_ms no es 30000.`,
  );
  factualInvariant(
    script.logpush === false,
    `${label}.logpush debe ser false.`,
  );
  validateObservability(script.observability, `${label}.observability`);
  factualInvariant(script.routes === null, `${label}.routes debe ser null.`);
  factualInvariant(
    Array.isArray(script.tags) && script.tags.length === 0,
    `${label}.tags debe estar vacío.`,
  );
  factualInvariant(
    script.tail_consumers === null,
    `${label}.tail_consumers debe ser null.`,
  );
  nonEmptyString(script.created_on, `${label}.created_on`);
  isoTimestamp(script.created_on, `${label}.created_on`);
  isoTimestamp(script.modified_on, `${label}.modified_on`);
  invariant(
    typeof script.deployment_id === "string",
    `${label}.deployment_id no es string.`,
  );
  nonEmptyString(script.etag, `${label}.etag`);
  nonEmptyString(script.tag, `${label}.tag`);
}

function validateScripts(payload) {
  const label = "GET scripts";
  validateStandardEnvelope(payload, label);
  invariant(Array.isArray(payload.result), `${label}.result no es un array.`);
  const targets = [];
  for (const script of payload.result) {
    invariant(
      isPlainObject(script),
      `${label}.result contiene un item inválido.`,
    );
    nonEmptyString(script.id, `${label}.result[].id`);
    if (script.id === WORKER_NAME) targets.push(script);
  }
  factualInvariant(
    targets.length === 1,
    `${label} no devolvió un único Worker agorbis.`,
  );
  validateTargetScript(targets[0]);
}

/**
 * Valida una dimensión D72 del mismo snapshot CLOSED ya recolectado. Mantener
 * esta función pura permite atribuir un mismatch observado sólo a los gates
 * que dependen de esa dimensión, sin repetir ningún GET ni aceptar snapshots
 * parciales como PASS.
 */
export function validateD72CloudflareClosedStateComponent(snapshot, component) {
  invariant(
    isPlainObject(snapshot),
    "Snapshot Cloudflare no es un objeto válido.",
  );
  invariant(
    CLOUDFLARE_CLOSED_STATE_COMPONENTS.includes(component),
    "El componente Cloudflare D72 no es válido.",
  );
  const expectedSecrets = SECRET_NAMES_BY_STAGE.complete;
  const expectedPlaintext = expectedPlaintextBindings("closed");

  if (component === "secrets") {
    validateSecrets(snapshot.secrets, expectedSecrets);
    validateSettingsSecrets(snapshot.settings, expectedSecrets);
  } else if (component === "bindings") {
    validateSettingsBindings(
      snapshot.settings,
      expectedPlaintext,
      expectedSecrets,
    );
  } else if (component === "domains") {
    validateSubdomain(snapshot.subdomain, "custom-domains");
    validateDomains(snapshot.domains, "custom-domains");
    validateRoutes(snapshot.routes);
  } else if (component === "crons") {
    validateSchedules(snapshot.schedules, "closed");
  } else if (component === "configuration") {
    validateAccountSettings(snapshot.accountSettings);
    validateDeployments(snapshot.deployments);
    validateSettingsConfiguration(snapshot.settings);
    validateSettingsBindings(
      snapshot.settings,
      expectedPlaintext,
      expectedSecrets,
    );
    validateScripts(snapshot.scripts);
  } else {
    validateSettingsAiDisabled(snapshot.settings);
  }
  return true;
}

export function validateCloudflareState(
  snapshot,
  { phase, profile = "closed", secretStage } = {},
) {
  invariant(STATE_PROFILES.includes(profile), "El perfil remoto no es válido.");
  invariant(PHASES.includes(phase), "La fase remota no es válida.");
  invariant(
    SECRET_STAGES.includes(secretStage),
    "El secret stage no es válido.",
  );
  if (profile !== "closed") {
    invariant(
      phase === "custom-domains",
      "El perfil con crons open requiere la fase custom-domains.",
    );
    invariant(
      secretStage === "complete",
      "El perfil con crons open requiere el secret stage complete.",
    );
  }
  return validateCloudflareStateWithBindings(snapshot, {
    phase,
    profile,
    secretStage,
    expectedPlaintext: expectedPlaintextBindings(profile),
  });
}

function validateCloudflareStateWithBindings(
  snapshot,
  { phase, profile, secretStage, expectedPlaintext },
) {
  exactKeys(snapshot, Object.keys(ENDPOINTS), "Snapshot Cloudflare");
  const expectedSecrets = SECRET_NAMES_BY_STAGE[secretStage];
  validateAccountSettings(snapshot.accountSettings);
  const active = validateDeployments(snapshot.deployments);
  validateSettings(snapshot.settings, expectedPlaintext, expectedSecrets);
  validateSchedules(snapshot.schedules, profile);
  validateSecrets(snapshot.secrets, expectedSecrets);
  validateSubdomain(snapshot.subdomain, phase);
  validateDomains(snapshot.domains, phase);
  validateRoutes(snapshot.routes);
  validateScripts(snapshot.scripts);
  return Object.freeze({
    activeDeploymentId: active.deploymentId,
    activeVersionId: active.versionId,
    phase,
    secretStage,
  });
}

// Contrato del origen anterior a Google: no modifica los perfiles de destino
// ni acepta expectativas arbitrarias enviadas por un caller.
export function validateCloudflareOpenSourceState(snapshot) {
  const sourcePlaintext = { ...expectedPlaintextBindings("open") };
  delete sourcePlaintext.PUBLIC_FACEBOOK_AUTH_ENABLED;
  sourcePlaintext.PUBLIC_GOOGLE_AUTH_ENABLED = "false";
  return validateCloudflareStateWithBindings(snapshot, {
    phase: "custom-domains",
    profile: "open",
    secretStage: "complete",
    expectedPlaintext: sourcePlaintext,
  });
}

// Fallback from the current release code: both provider bindings are explicitly
// false. The historical source profile still requires Facebook to be absent.
export function validateCloudflareOpenRecoveryState(snapshot) {
  return validateCloudflareStateWithBindings(snapshot, {
    phase: "custom-domains",
    profile: "open",
    secretStage: "complete",
    expectedPlaintext: {
      ...expectedPlaintextBindings("open"),
      PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    },
  });
}

export function validateCloudflareClosedState(snapshot, options) {
  return validateCloudflareState(snapshot, { ...options, profile: "closed" });
}

export function validateCloudflareOpenState(snapshot) {
  return validateCloudflareState(snapshot, {
    phase: "custom-domains",
    profile: "open",
    secretStage: "complete",
  });
}

export function validateCloudflareClosedWithOpenCronsState(snapshot) {
  return validateCloudflareState(snapshot, {
    phase: "custom-domains",
    profile: "closed-open-crons",
    secretStage: "complete",
  });
}

export function parseWranglerOAuthToken(raw) {
  invariant(
    typeof raw === "string" && raw.length > 0,
    "Wrangler no devolvió una credencial OAuth válida.",
  );
  let credential;
  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error("Wrangler no devolvió una credencial OAuth válida.");
  }
  exactKeys(credential, ["token", "type"], "Credencial OAuth Wrangler");
  invariant(
    credential.type === "oauth",
    "Wrangler no resolvió la sesión OAuth esperada.",
  );
  invariant(
    typeof credential.token === "string" &&
      credential.token.length >= 32 &&
      TOKEN_PATTERN.test(credential.token),
    "Wrangler no devolvió una credencial OAuth válida.",
  );
  return credential.token;
}

function wranglerAuthEnvironment(env) {
  const sanitized = { ...env };
  for (const key of Object.keys(sanitized)) {
    if (
      key.startsWith("WRANGLER_") ||
      [
        "CF_ACCOUNT_ID",
        "CF_API_BASE_URL",
        "CF_API_KEY",
        "CF_API_TOKEN",
        "CF_EMAIL",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_API_BASE_URL",
        "CLOUDFLARE_API_KEY",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_AUTH_USE_KEYRING",
        "CLOUDFLARE_EMAIL",
        "FORCE_COLOR",
        "NODE_DEBUG",
        "NODE_DEBUG_NATIVE",
        "NODE_OPTIONS",
        "NODE_V8_COVERAGE",
      ].includes(key)
    ) {
      delete sanitized[key];
    }
  }
  return {
    ...sanitized,
    CLOUDFLARE_AUTH_USE_KEYRING: "true",
    FORCE_COLOR: "0",
    WRANGLER_LOG_SANITIZE: "true",
    WRANGLER_SEND_ERROR_REPORTS: "false",
    WRANGLER_SEND_METRICS: "false",
  };
}

export async function loadWranglerOAuthToken({
  cwd = REPOSITORY_ROOT,
  env = process.env,
  execFileImpl = execFileAsync,
  lstatImpl = lstat,
  nodeExecutable = process.execPath,
  wranglerEntrypoint = WRANGLER_ENTRYPOINT,
} = {}) {
  let result;
  try {
    const emptyEnvStat = await lstatImpl(WRANGLER_EMPTY_ENV_FILE);
    invariant(
      emptyEnvStat.isFile() &&
        !emptyEnvStat.isSymbolicLink() &&
        emptyEnvStat.size === 0,
      "El env-file vacío versionado de Wrangler no es válido.",
    );
    result = await execFileImpl(
      nodeExecutable,
      [
        wranglerEntrypoint,
        "auth",
        "token",
        "--json",
        "--env-file",
        WRANGLER_EMPTY_ENV_FILE,
      ],
      {
        cwd,
        encoding: "utf8",
        env: wranglerAuthEnvironment(env),
        maxBuffer: WRANGLER_AUTH_MAX_BUFFER_BYTES,
        shell: false,
        timeout: WRANGLER_AUTH_TIMEOUT_MS,
        windowsHide: true,
      },
    );
  } catch {
    throw new Error("Wrangler no pudo resolver la sesión OAuth.");
  }
  invariant(
    isPlainObject(result) && typeof result.stdout === "string",
    "Wrangler no devolvió una credencial OAuth válida.",
  );
  return parseWranglerOAuthToken(result.stdout);
}

async function fetchJsonGet(fetchImpl, token, path, label) {
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${path}`, {
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
    response.status === 200,
    `${label} devolvió un estado HTTP no aprobado.`,
  );
  const contentType = response.headers.get("content-type") ?? "";
  invariant(
    /^application\/json(?:;|$)/i.test(contentType),
    `${label} no devolvió application/json.`,
  );
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    invariant(
      /^\d+$/.test(declaredLength),
      `${label} devolvió Content-Length inválido.`,
    );
    invariant(
      Number(declaredLength) <= MAX_RESPONSE_BYTES,
      `${label} excedió el tamaño máximo permitido.`,
    );
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw new Error(`No se pudo leer ${label}.`);
  }
  invariant(text.length > 0, `${label} devolvió una respuesta vacía.`);
  invariant(
    Buffer.byteLength(text, "utf8") <= MAX_RESPONSE_BYTES,
    `${label} excedió el tamaño máximo permitido.`,
  );
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${label} no devolvió JSON válido.`);
  }
  invariant(isPlainObject(payload), `${label} no devolvió un objeto JSON.`);
  return payload;
}

export async function collectCloudflareState({ fetchImpl, oauthToken }) {
  invariant(
    typeof fetchImpl === "function",
    "No se configuró un cliente HTTP válido.",
  );
  invariant(
    typeof oauthToken === "string" &&
      oauthToken.length >= 32 &&
      TOKEN_PATTERN.test(oauthToken),
    "No se proporcionó un OAuth Wrangler válido.",
  );
  const entries = await Promise.all(
    Object.entries(ENDPOINTS).map(async ([key, path]) => [
      key,
      await fetchJsonGet(fetchImpl, oauthToken, path, `GET ${key}`),
    ]),
  );
  return Object.fromEntries(entries);
}

export async function collectCloudflareClosedState(options) {
  return collectCloudflareState(options);
}

export async function runCloudflareStateCheck({
  phase,
  profile = "closed",
  secretStage,
  fetchImpl = globalThis.fetch,
  loadWranglerOAuthTokenImpl = loadWranglerOAuthToken,
  oauthToken,
} = {}) {
  const token = oauthToken ?? (await loadWranglerOAuthTokenImpl());
  const snapshot = await collectCloudflareState({
    fetchImpl,
    oauthToken: token,
  });
  return validateCloudflareState(snapshot, { phase, profile, secretStage });
}

export async function runCloudflareClosedStateCheck({
  phase,
  secretStage,
  fetchImpl = globalThis.fetch,
  loadWranglerOAuthTokenImpl = loadWranglerOAuthToken,
  oauthToken,
} = {}) {
  return runCloudflareStateCheck({
    fetchImpl,
    loadWranglerOAuthTokenImpl,
    oauthToken,
    phase,
    profile: "closed",
    secretStage,
  });
}

export async function runCloudflareOpenStateCheck({
  fetchImpl = globalThis.fetch,
  loadWranglerOAuthTokenImpl = loadWranglerOAuthToken,
  oauthToken,
} = {}) {
  return runCloudflareStateCheck({
    fetchImpl,
    loadWranglerOAuthTokenImpl,
    oauthToken,
    phase: "custom-domains",
    profile: "open",
    secretStage: "complete",
  });
}

export async function runCloudflareClosedWithOpenCronsStateCheck({
  fetchImpl = globalThis.fetch,
  loadWranglerOAuthTokenImpl = loadWranglerOAuthToken,
  oauthToken,
} = {}) {
  return runCloudflareStateCheck({
    fetchImpl,
    loadWranglerOAuthTokenImpl,
    oauthToken,
    phase: "custom-domains",
    profile: "closed-open-crons",
    secretStage: "complete",
  });
}

export function parseCloudflareClosedStateArgs(argv) {
  invariant(
    Array.isArray(argv),
    "Los argumentos del verificador no son válidos.",
  );
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    invariant(
      ["--phase", "--secret-stage"].includes(argument),
      "El verificador recibió un argumento no aprobado.",
    );
    invariant(index + 1 < argv.length, `Falta el valor de ${argument}.`);
    const value = argv[index + 1];
    invariant(!value.startsWith("--"), `Falta el valor de ${argument}.`);
    index += 1;
    const key = argument === "--phase" ? "phase" : "secretStage";
    invariant(!Object.hasOwn(parsed, key), `${argument} está repetido.`);
    parsed[key] = value;
  }
  invariant(
    PHASES.includes(parsed.phase),
    "--phase debe ser workers-dev o custom-domains.",
  );
  invariant(
    SECRET_STAGES.includes(parsed.secretStage),
    "--secret-stage debe ser none, supabase, turnstile o complete.",
  );
  return parsed;
}

async function main() {
  const options = parseCloudflareClosedStateArgs(process.argv.slice(2));
  const result = await runCloudflareClosedStateCheck(options);
  process.stdout.write(
    `Cloudflare cerrado verificado: phase=${result.phase}, secret-stage=${result.secretStage}, deployment=${result.activeDeploymentId}, version=${result.activeVersionId}.\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const message =
      error instanceof Error ? error.message : "Error desconocido.";
    process.stderr.write(`Cloudflare cerrado: ${message}\n`);
    process.exitCode = 1;
  });
}
