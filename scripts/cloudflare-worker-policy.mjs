import { readFileSync } from "node:fs";

export const EXPECTED_WORKER_CRONS = Object.freeze([
  "10 * * * *",
  "5 0 * * *",
  "25 0 * * *",
  "20 3 * * *",
  "40 3 * * *",
]);

export const EXPECTED_WORKER_ROUTES = Object.freeze([
  Object.freeze({ pattern: "agorbis.com", custom_domain: true }),
  Object.freeze({ pattern: "www.agorbis.com", custom_domain: true }),
]);

export const EXPECTED_WORKER_SECRETS = Object.freeze([
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
]);

export const EXPECTED_WORKER_VARS = Object.freeze({
  AGORBIS_LAUNCH_MODE: "open",
  AGORBIS_RUNTIME: "cloudflare-workers",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
  PUBLIC_GOOGLE_AUTH_ENABLED: "true",
  PUBLIC_SITE_URL: "https://agorbis.com",
  PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
  PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
  TURNSTILE_HOSTNAMES: "agorbis.com",
});

export const EXPECTED_CLOUDFLARE_ACCOUNT_ID =
  "4d78fb10c1ae65281ec851479d5045dc";

export function validateProductionNodeVersion(version = process.versions.node) {
  if (typeof version !== "string" || !/^22(?:\.|$)/.test(version)) {
    return [
      `El preflight debe ejecutarse con Node 22.x; versión detectada: ${JSON.stringify(version)}.`,
    ];
  }
  return [];
}

export function validateClosedCutoverPlan(plan) {
  if (plan !== "paid") {
    return [
      "El cutover cerrado requiere CLOUDFLARE_WORKERS_PLAN=paid, igual que el perfil abierto.",
    ];
  }
  return [];
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sameJson(actual, expected) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    }
    return value;
  };
  return (
    JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected))
  );
}

function sameKeys(actual, expected) {
  return (
    isPlainObject(actual) &&
    sameJson(Object.keys(actual).sort(), [...expected].sort())
  );
}

const EXPECTED_TOP_LEVEL_KEYS = Object.freeze([
  "$schema",
  "name",
  "account_id",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "workers_dev",
  "preview_urls",
  "routes",
  "assets",
  "triggers",
  "observability",
  "limits",
  "keep_vars",
  "secrets",
  "vars",
]);

/**
 * Elimina comentarios y comas finales de JSONC sin tocar strings. Toda otra
 * sintaxis sigue delegándose a JSON.parse y, por lo tanto, falla cerrada.
 */
export function parseJsonc(raw, label = "wrangler.jsonc") {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${label} está vacío.`);
  }

  let withoutComments = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    const next = raw[index + 1];
    if (inString) {
      withoutComments += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      withoutComments += current;
      continue;
    }
    if (current === "/" && next === "/") {
      index += 2;
      while (index < raw.length && !["\n", "\r"].includes(raw[index])) {
        index += 1;
      }
      if (index < raw.length) withoutComments += raw[index];
      continue;
    }
    if (current === "/" && next === "*") {
      const commentStart = index;
      index += 2;
      while (
        index < raw.length &&
        !(raw[index] === "*" && raw[index + 1] === "/")
      ) {
        index += 1;
      }
      if (index >= raw.length) {
        throw new Error(
          `${label} contiene un comentario sin cerrar en ${commentStart}.`,
        );
      }
      index += 1;
      continue;
    }
    withoutComments += current;
  }
  if (inString) throw new Error(`${label} contiene un string sin cerrar.`);

  let normalized = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const current = withoutComments[index];
    if (inString) {
      normalized += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      normalized += current;
      continue;
    }
    if (current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(withoutComments[lookahead] ?? "")) lookahead += 1;
      if (["}", "]"].includes(withoutComments[lookahead])) continue;
    }
    normalized += current;
  }

  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(
      `${label} no es JSONC válido: ${error instanceof Error ? error.message : "error desconocido"}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${label} debe contener un único objeto de configuración.`);
  }
  return parsed;
}

export function readWranglerConfiguration(filePath) {
  return parseJsonc(readFileSync(filePath, "utf8"), "wrangler.jsonc");
}

export function validateWranglerConfiguration(configuration) {
  const errors = [];
  const error = (message) => errors.push(`wrangler.jsonc ${message}`);

  if (!isPlainObject(configuration)) {
    return ["wrangler.jsonc debe contener un objeto de configuración."];
  }
  if (!sameKeys(configuration, EXPECTED_TOP_LEVEL_KEYS)) {
    error(
      "debe contener exactamente las claves superiores aprobadas; no se admiten bindings, servicios, destinos de logs ni opciones implícitas adicionales.",
    );
  }
  if (configuration.$schema !== "node_modules/wrangler/config-schema.json") {
    error('debe usar $schema="node_modules/wrangler/config-schema.json".');
  }
  if (configuration.name !== "agorbis") error('debe usar name="agorbis".');
  if (configuration.account_id !== EXPECTED_CLOUDFLARE_ACCOUNT_ID) {
    error(
      `debe fijar account_id=${EXPECTED_CLOUDFLARE_ACCOUNT_ID} para impedir un deploy accidental en otra cuenta.`,
    );
  }
  if (configuration.main !== "dist/_worker.js") {
    error('debe usar main="dist/_worker.js".');
  }
  if (configuration.compatibility_date !== "2026-08-25") {
    error('debe fijar compatibility_date="2026-08-25".');
  }
  if (!sameJson(configuration.compatibility_flags, ["nodejs_compat"])) {
    error('debe fijar únicamente compatibility_flags=["nodejs_compat"].');
  }
  if (configuration.workers_dev !== false) {
    error(
      "debe deshabilitar workers_dev para no exponer un hostname alternativo.",
    );
  }
  if (configuration.preview_urls !== false) {
    error(
      "debe deshabilitar preview_urls para no exponer previews no aprobadas.",
    );
  }
  if (!sameJson(configuration.routes, EXPECTED_WORKER_ROUTES)) {
    error(
      "debe declarar únicamente los custom domains agorbis.com y www.agorbis.com.",
    );
  }
  if (
    !isPlainObject(configuration.assets) ||
    !sameKeys(configuration.assets, [
      "directory",
      "binding",
      "run_worker_first",
    ]) ||
    configuration.assets.directory !== "./dist" ||
    configuration.assets.binding !== "ASSETS" ||
    configuration.assets.run_worker_first !== true
  ) {
    error(
      'debe declarar assets {directory:"./dist", binding:"ASSETS", run_worker_first:true}.',
    );
  }
  if (
    !sameKeys(configuration.triggers, ["crons"]) ||
    !sameJson(configuration.triggers?.crons, EXPECTED_WORKER_CRONS)
  ) {
    error(
      `debe declarar exactamente estos cinco crons UTC y en este orden: ${EXPECTED_WORKER_CRONS.join(" | ")}.`,
    );
  }
  if (
    !sameKeys(configuration.observability, ["logs", "traces"]) ||
    !sameKeys(configuration.observability?.logs, [
      "enabled",
      "head_sampling_rate",
      "invocation_logs",
    ]) ||
    configuration.observability?.logs?.enabled !== true ||
    configuration.observability?.logs?.head_sampling_rate !== 1 ||
    configuration.observability?.logs?.invocation_logs !== false
  ) {
    error(
      "debe habilitar logs custom con head_sampling_rate=1 e invocation_logs=false.",
    );
  }
  const traces = configuration.observability?.traces;
  if (!sameKeys(traces, ["enabled"]) || traces.enabled !== false) {
    error("debe declarar traces únicamente como enabled=false.");
  }
  if (
    !sameKeys(configuration.limits, ["cpu_ms"]) ||
    configuration.limits?.cpu_ms !== 30_000
  ) {
    error("debe fijar limits.cpu_ms=30000.");
  }
  if (
    configuration.keep_vars !== undefined &&
    configuration.keep_vars !== false
  ) {
    error(
      "no puede usar keep_vars=true: el deploy debe retirar vars plaintext desconocidas; los secrets no dependen de esta opción.",
    );
  }
  if (
    !sameKeys(configuration.secrets, ["required"]) ||
    !sameJson(configuration.secrets?.required, EXPECTED_WORKER_SECRETS)
  ) {
    error(
      `debe exigir únicamente estos secretos server-only: ${EXPECTED_WORKER_SECRETS.join(", ")}.`,
    );
  }
  if (!sameJson(configuration.vars, EXPECTED_WORKER_VARS)) {
    error(
      "debe versionar únicamente las siete vars públicas/runtime aprobadas para Agorbis.",
    );
  }
  if (Object.hasOwn(configuration, "zone_id")) {
    error("no debe versionar zone_id.");
  }
  if (Object.hasOwn(configuration, "env")) {
    error(
      "no debe declarar entornos alternativos para este Worker de Producción.",
    );
  }
  return errors;
}

export function validateClosedCutoverConfiguration(
  configuration,
  productionConfiguration,
) {
  const productionErrors = validateWranglerConfiguration(
    productionConfiguration,
  );
  if (productionErrors.length > 0) {
    return [
      "wrangler.closed.jsonc no puede validarse porque wrangler.jsonc es inválido.",
      ...productionErrors,
    ];
  }
  if (!isPlainObject(configuration)) {
    return ["wrangler.closed.jsonc debe contener un objeto de configuración."];
  }
  const expected = structuredClone(productionConfiguration);
  expected.triggers = { crons: [] };
  expected.vars.AGORBIS_LAUNCH_MODE = "closed";
  expected.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "false";
  expected.vars.PUBLIC_FACEBOOK_AUTH_ENABLED = "false";
  if (!sameJson(configuration, expected)) {
    return [
      'wrangler.closed.jsonc debe derivar exactamente del perfil Paid canónico: conserva workers_dev=false, preview_urls=false, los dos custom domains, limits.cpu_ms=30000 y los tres secrets.required; cambia triggers.crons=[], AGORBIS_LAUNCH_MODE="closed" y deshabilita ambos proveedores OAuth.',
    ];
  }
  return [];
}

export function validateOpenRecoveryConfiguration(
  configuration,
  productionConfiguration,
) {
  const errors = validateWranglerConfiguration(productionConfiguration);
  if (errors.length) return errors;
  const expected = structuredClone(productionConfiguration);
  expected.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "false";
  return sameJson(configuration, expected)
    ? []
    : [
        "wrangler.open-recovery.jsonc debe conservar exactamente el perfil OPEN y sus cinco crons, con Google y Facebook deshabilitados.",
      ];
}

export function validateReadOnlyPreviewConfiguration(
  configuration,
  productionConfiguration,
) {
  const productionErrors = validateWranglerConfiguration(
    productionConfiguration,
  );
  if (productionErrors.length > 0) {
    return [
      "wrangler.readonly-preview.jsonc no puede validarse porque wrangler.jsonc es inválido.",
      ...productionErrors,
    ];
  }
  if (!isPlainObject(configuration)) {
    return [
      "wrangler.readonly-preview.jsonc debe contener un objeto de configuración.",
    ];
  }
  const expected = structuredClone(productionConfiguration);
  expected.triggers = { crons: [] };
  expected.vars.AGORBIS_LAUNCH_MODE = "public-read-only";
  expected.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "false";
  expected.vars.PUBLIC_FACEBOOK_AUTH_ENABLED = "false";
  if (!sameJson(configuration, expected)) {
    return [
      'wrangler.readonly-preview.jsonc debe derivar exactamente del perfil Paid canónico: conserva workers_dev=false, preview_urls=false, los dos custom domains, assets.run_worker_first=true, limits.cpu_ms=30000, keep_vars=false y los tres secrets.required; cambia triggers.crons=[], AGORBIS_LAUNCH_MODE="public-read-only" y deshabilita ambos proveedores OAuth.',
    ];
  }
  return [];
}
