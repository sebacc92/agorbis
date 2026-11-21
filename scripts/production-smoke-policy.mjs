import {
  assertExceptionalReleaseRequest,
  exceptionalReleaseRequestHash,
} from "./exceptional-release-act.mjs";
import { AAIP_PENDING_COPY } from "./aaip-registration-policy.mjs";
import { GOOGLE_PROCESSING_DISCLOSURE } from "./google-processing-disclosure.mjs";

const CANONICAL_ORIGIN = "https://agorbis.com";
const PRODUCTION_SUPABASE_ORIGIN = "https://ibtvlvpxwourrxwcrfkf.supabase.co";
const exceptionalLegalProfiles = new WeakMap();
const EXCEPTIONAL_PENDING_COPY = Object.freeze({
  registerWarning:
    "Los campos marcados como pendientes no están confirmados ni jurídicamente aprobados. Agorbis no completa países, contratos, plazos o salvaguardas por inferencia.",
  pendingLabel: "Pendiente de evidencia externa",
  processingLocationPending:
    "Agorbis todavía no cuenta con evidencia suficiente para publicar la lista completa y exacta de lugares de tratamiento y acceso aplicables a este proveedor.",
  transferSafeguardsPending:
    "El mecanismo argentino aplicable al primer request y a otros flujos sin una decisión previa vigente permanece pendiente de acreditación. No se presenta un DPA genérico, cláusulas extranjeras ni el consentimiento posterior como sustituto.",
  providerRetentionPending:
    "Los plazos y mecanismos de eliminación de los proveedores, incluidos logs, correo, backups y cachés, permanecen pendientes de evidencia contractual y de la configuración efectiva. No se afirma un plazo común.",
});

export function parseProductionSmokeArguments(argv) {
  if (Array.isArray(argv) && argv.length === 0) return {};
  invariant(
    Array.isArray(argv) &&
      argv.length === 2 &&
      argv[0] === "--exceptional-request" &&
      typeof argv[1] === "string" &&
      argv[1].startsWith("/"),
    "Uso: production-smoke.mjs [--exceptional-request <ruta-absoluta.json>]",
  );
  return { exceptionalRequestPath: argv[1] };
}

export function createExceptionalProductionSmokeLegalProfile({
  request,
  currentHead,
  now = new Date(),
} = {}) {
  assertExceptionalReleaseRequest(request, { currentHead, now });
  const riskIds = new Set(request.risks.map(({ gateId }) => gateId));
  for (const gateId of [
    "legal.aaip-registration-pending",
    "privacy.provider-locations-unverified",
    "privacy.provider-retention-unverified",
    "legal.transfer-safeguards-unverified",
  ]) {
    invariant(riskIds.has(gateId), `El smoke excepcional exige ${gateId}.`);
  }
  const profile = Object.freeze({
    mode: "exceptional-pending",
    head: currentHead,
    requestHash: exceptionalReleaseRequestHash(request),
  });
  exceptionalLegalProfiles.set(profile, {
    request: structuredClone(request),
    currentHead,
  });
  return profile;
}

function exceptionalLegalProfileEnabled(profile, now) {
  if (profile === undefined) return false;
  const state = exceptionalLegalProfiles.get(profile);
  invariant(
    state,
    "El perfil legal del smoke no proviene de un request validado.",
  );
  assertExceptionalReleaseRequest(state.request, {
    currentHead: state.currentHead,
    now,
  });
  return true;
}

function visibleHtml(body) {
  return body
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function visibleHtmlText(body) {
  return visibleHtml(body)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const point =
        code[0].toLowerCase() === "x"
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : "\ufffd";
    })
    .replace(
      /&(nbsp|amp|lt|gt|quot|apos|num);/g,
      (_, entity) =>
        ({
          nbsp: " ",
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          num: "#",
        })[entity],
    )
    .replace(/\s+/g, " ")
    .trim();
}

// Los tres proveedores que sostienen una cuenta siguen sin ubicación acreditada
// (D76). Google entra sólo cuando el perfil abierto lo ofrece (D122) y con la
// disclosure versionada que ya se publicó en Privacidad, nunca con otro texto.
const PENDING_LOCATION_PROVIDERS = Object.freeze([
  "Supabase",
  "Resend",
  "Cloudflare DNS + Turnstile + Edge Compute",
]);
const OPTIONAL_PROVIDER_LOCATIONS = Object.freeze({
  Google: GOOGLE_PROCESSING_DISCLOSURE.es,
});

function processingLocationsByProvider(body) {
  const locations = new Map();
  for (const match of visibleHtml(body).matchAll(
    /<h2\b[^>]*>([\s\S]*?)<\/h2>(?:(?!<h2\b)[\s\S])*?<dt\b[^>]*>\s*Lugar de tratamiento\s*<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi,
  )) {
    const provider = visibleHtmlText(match[1]);
    invariant(
      !locations.has(provider),
      `/subencargados/ repite el proveedor ${provider}.`,
    );
    locations.set(provider, visibleHtmlText(match[2]));
  }
  return locations;
}

const publicPaths = Object.freeze([
  "/",
  "/registro/",
  "/ingresar/",
  "/recuperar/",
  "/reenviar-confirmacion/",
  "/privacidad/",
  "/terminos/",
  "/transferencias-internacionales/",
  "/subencargados/",
]);

const cronPaths = Object.freeze([
  "/internal/cleanup-claim-uploads/",
  "/internal/escalate-claims/",
  "/internal/process-account-deletions/",
  "/internal/purge-retained-data/",
  "/internal/sync-notifications/",
]);

const malformedResourcePaths = Object.freeze([
  "/encuestas/no-es-uuid/",
  "/debates/no-es-uuid/",
  "/reclamos/no-es-uuid/",
  "/proyectos/no-es-uuid/",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} no es una URL válida.`);
  }
  invariant(
    parsed.origin === value &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password,
    `${label} debe ser únicamente un origen HTTPS sin ruta ni credenciales.`,
  );
  invariant(parsed.protocol === "https:", `${label} debe usar HTTPS.`);
  return parsed.origin;
}

async function request(fetchImpl, url, init = {}, timeoutMs = 15_000) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
    });
  } catch (error) {
    throw new Error(
      `No se pudo consultar ${url}: ${error instanceof Error ? error.message : "error desconocido"}`,
    );
  }
  invariant(response instanceof Response, `Respuesta inválida para ${url}.`);
  return response;
}

function expectStatus(response, expected, label) {
  invariant(
    response.status === expected,
    `${label} respondió ${response.status}; se esperaba ${expected}.`,
  );
}

function expectHeader(response, name, expected, label) {
  const current = response.headers.get(name) ?? "";
  invariant(
    typeof expected === "string"
      ? current === expected
      : expected.test(current),
    `${label} no devolvió ${name} con el valor esperado.`,
  );
}

function expectHtml(response, body, label, exceptionalPending) {
  expectHeader(response, "content-type", /^text\/html(?:;|$)/i, label);
  invariant(
    /<!doctype html|<html[\s>]/i.test(body),
    `${label} no devolvió HTML.`,
  );
  invariant(/Agorbis/i.test(body), `${label} no contiene la marca Agorbis.`);
  invariant(
    !/(?:Inscripci[oó]n (?:de la base )?AAIP|C[oó]digo de responsable AAIP) pendiente/i.test(
      body,
    ),
    `${label} todavía muestra una identificación AAIP como pendiente.`,
  );
  if (!exceptionalPending) {
    invariant(
      !/Inscripci[oó]n de la base ante la AAIP: en tr[aá]mite|AAIP database registration: pending/i.test(
        visibleHtmlText(body),
      ),
      `${label} todavía muestra una identificación AAIP como pendiente.`,
    );
  }
}

function expectSecurityHeaders(response) {
  const label = "GET /";
  expectHeader(response, "x-content-type-options", "nosniff", label);
  expectHeader(response, "x-frame-options", "DENY", label);
  expectHeader(
    response,
    "referrer-policy",
    "strict-origin-when-cross-origin",
    label,
  );
  expectHeader(
    response,
    "strict-transport-security",
    /(?:^|;)\s*max-age=31536000(?:;|$).*includeSubDomains/i,
    label,
  );
  expectHeader(
    response,
    "x-request-id",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    label,
  );
  expectHeader(response, "cf-ray", /^[a-f0-9]+-[a-z0-9]+$/i, label);
  invariant(
    !response.headers.has("x-vercel-id"),
    "GET / todavía expone una cabecera de runtime Vercel.",
  );
  const csp = response.headers.get("content-security-policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "script-src-attr 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ]) {
    invariant(csp.includes(directive), `GET / no incluye ${directive} en CSP.`);
  }
  invariant(
    csp.includes("https://challenges.cloudflare.com"),
    "GET / no permite Turnstile en CSP.",
  );
}

function expectAaipIdentifiers(body, exceptionalPending) {
  body = visibleHtmlText(body);
  invariant(
    /RL-\d{4}-\d{8,}-APN-DNPDP(?:#|&#35;|&num;)AAIP/i.test(body),
    "/privacidad/ no publica un código RL válido del responsable AAIP.",
  );
  if (exceptionalPending) {
    invariant(
      body.includes(AAIP_PENDING_COPY.es),
      "/privacidad/ no publica el estado AAIP pendiente honesto completo.",
    );
    invariant(
      !/(?:N[uú]mero de registro de la base (?:ante la )?AAIP|AAIP database registration number|base (?:est[aá] )?inscripta|inscripci[oó]n (?:de la base )?aprobada)/i.test(
        body,
      ),
      "/privacidad/ afirma una inscripción AAIP aprobada dentro del perfil pendiente.",
    );
    return;
  }
  invariant(
    /(?:N[uú]mero de registro de la base (?:ante la )?AAIP|AAIP database registration)/i.test(
      body,
    ),
    "/privacidad/ no publica separadamente el número de registro de la base AAIP.",
  );
}

function expectNoLegalPlaceholders(body, exceptionalPending) {
  body = visibleHtml(body);
  for (const placeholder of [
    /Salvaguardas de transferencia pendientes/i,
    /Transfer safeguards pending/i,
    /Destino pendiente/i,
    /Processing destination pending/i,
    /Retenci[oó]n de proveedores pendiente/i,
    /Provider retention pending/i,
    /Domicilio legal pendiente/i,
    /privacidad@agorbis\.invalid/i,
  ]) {
    invariant(
      !placeholder.test(body),
      "/subencargados/ todavía muestra un placeholder legal.",
    );
  }
  const text = visibleHtmlText(body);
  if (!exceptionalPending) {
    invariant(
      !text.includes(EXCEPTIONAL_PENDING_COPY.pendingLabel) &&
        !text.includes(EXCEPTIONAL_PENDING_COPY.registerWarning),
      "/subencargados/ todavía muestra evidencia legal pendiente.",
    );
    return;
  }
  invariant(
    !/(?:DPA|contratos?|salvaguardas|cl[aá]usulas)\s+(?:(?:est[aá]n|son|fueron)\s+)?(?:aprobados?|incorporados?|confirmados?|suficientes?)/i.test(
      text,
    ),
    "/subencargados/ afirma contratos o salvaguardas acreditados dentro del perfil pendiente.",
  );
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(
    (match) => visibleHtmlText(match[1]),
  );
  for (const name of [
    "registerWarning",
    "transferSafeguardsPending",
    "providerRetentionPending",
  ]) {
    invariant(
      paragraphs.includes(EXCEPTIONAL_PENDING_COPY[name]),
      `/subencargados/ no publica ${name} como pendiente honesto.`,
    );
  }
  const locations = processingLocationsByProvider(body);
  const pendingLocation = `${EXCEPTIONAL_PENDING_COPY.processingLocationPending} ${EXCEPTIONAL_PENDING_COPY.pendingLabel}`;
  invariant(
    PENDING_LOCATION_PROVIDERS.every(
      (provider) => locations.get(provider) === pendingLocation,
    ),
    "/subencargados/ debe conservar los tres destinos pendientes sin afirmar ubicaciones.",
  );
  for (const [provider, location] of locations) {
    if (PENDING_LOCATION_PROVIDERS.includes(provider)) continue;
    const declared = OPTIONAL_PROVIDER_LOCATIONS[provider];
    invariant(
      declared !== undefined,
      `/subencargados/ publica un proveedor no previsto: ${provider}.`,
    );
    invariant(
      location === declared,
      `/subencargados/ sólo puede sumar ${provider} con la ubicación declarada en su disclosure versionado.`,
    );
  }
  for (const provider of [
    "Supabase",
    "Resend",
    "Cloudflare DNS + Turnstile + Edge Compute",
  ]) {
    invariant(
      text.includes(provider),
      `/subencargados/ no identifica ${provider}.`,
    );
  }
}

async function expectHealth(fetchImpl, baseOrigin) {
  const label = "GET /internal/health/";
  const response = await request(fetchImpl, `${baseOrigin}/internal/health/`);
  expectStatus(response, 200, label);
  expectHeader(response, "content-type", /^application\/json(?:;|$)/i, label);
  expectHeader(response, "cache-control", /(?:^|,)\s*no-store(?:,|$)/i, label);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${label} no devolvió JSON válido.`);
  }
  invariant(
    payload && typeof payload === "object" && !Array.isArray(payload),
    `${label} devolvió una estructura inesperada.`,
  );
  invariant(payload.status === "ok", `${label} no informó status=ok.`);
  invariant(
    payload.checks?.database === "ok" &&
      payload.checks?.auth === "ok" &&
      payload.checks?.storage === "ok",
    `${label} no confirmó DB, Auth y Storage.`,
  );
  invariant(
    Number.isFinite(payload.durationMs) && payload.durationMs >= 0,
    `${label} no informó una duración válida.`,
  );
}

async function expectWidgetBGuard(fetchImpl, supabaseOrigin, publishableKey) {
  const label = "Widget B /auth/v1/signup sin CAPTCHA";
  const response = await request(
    fetchImpl,
    `${supabaseOrigin}/auth/v1/signup`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "invalid", password: "x" }),
    },
  );
  expectStatus(response, 400, label);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${label} no devolvió JSON válido.`);
  }
  invariant(
    (payload?.error_code ?? payload?.code) === "captcha_failed",
    `${label} no devolvió captcha_failed.`,
  );
}

export async function runProductionReadOnlySmoke({
  fetchImpl = fetch,
  baseOrigin = CANONICAL_ORIGIN,
  supabaseOrigin,
  publishableKey,
  legalProfile,
  now = new Date(),
} = {}) {
  const exceptionalPending = exceptionalLegalProfileEnabled(legalProfile, now);
  invariant(
    Number(process.versions.node.split(".")[0]) === 22,
    `El smoke de Producción exige Node 22.x; se detectó ${process.versions.node}.`,
  );
  invariant(
    normalizedOrigin(baseOrigin, "El origen de Agorbis") === CANONICAL_ORIGIN,
    `El smoke público sólo puede apuntar a ${CANONICAL_ORIGIN}.`,
  );
  invariant(
    normalizedOrigin(supabaseOrigin ?? "", "PUBLIC_SUPABASE_URL") ===
      PRODUCTION_SUPABASE_ORIGIN,
    `PUBLIC_SUPABASE_URL debe apuntar al proyecto de Producción ${PRODUCTION_SUPABASE_ORIGIN}.`,
  );
  invariant(
    /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey ?? ""),
    "PUBLIC_SUPABASE_ANON_KEY debe ser la sb_publishable_ de Producción.",
  );

  const completed = [];
  let rootResponse;
  for (const publicPath of publicPaths) {
    const label = `GET ${publicPath}`;
    const response = await request(fetchImpl, `${baseOrigin}${publicPath}`);
    expectStatus(response, 200, label);
    const body = await response.text();
    expectHtml(response, body, label, exceptionalPending);
    if (publicPath === "/") rootResponse = response;
    if (publicPath === "/privacidad/")
      expectAaipIdentifiers(body, exceptionalPending);
    if (publicPath === "/subencargados/")
      expectNoLegalPlaceholders(body, exceptionalPending);
    completed.push(label);
  }
  invariant(rootResponse, "No se verificó la portada canónica.");
  expectSecurityHeaders(rootResponse);
  completed.push("cabeceras defensivas");

  await expectHealth(fetchImpl, baseOrigin);
  completed.push("health DB/Auth/Storage");

  for (const cronPath of cronPaths) {
    const label = `GET ${cronPath} sin secreto`;
    const response = await request(fetchImpl, `${baseOrigin}${cronPath}`);
    expectStatus(response, 401, label);
    expectHeader(
      response,
      "cache-control",
      /(?:^|,)\s*no-store(?:,|$)/i,
      label,
    );
    completed.push(label);
  }

  for (const malformedPath of malformedResourcePaths) {
    const label = `GET ${malformedPath}`;
    const response = await request(fetchImpl, `${baseOrigin}${malformedPath}`);
    expectStatus(response, 404, label);
    invariant(
      !(await response.text()).includes("invalid input syntax for type uuid"),
      `${label} filtró un error interno de PostgreSQL.`,
    );
    completed.push(label);
  }

  for (const hostname of ["www.agorbis.com"]) {
    const source = `https://${hostname}/smoke-path?check=1`;
    const response = await request(fetchImpl, source);
    expectStatus(response, 308, `redirect ${hostname}`);
    expectHeader(
      response,
      "location",
      `${baseOrigin}/smoke-path?check=1`,
      `redirect ${hostname}`,
    );
    completed.push(`redirect ${hostname}`);
  }

  await expectWidgetBGuard(fetchImpl, supabaseOrigin, publishableKey);
  completed.push("Widget B directo sin CAPTCHA");

  return Object.freeze({
    completed: Object.freeze(completed),
    legalStatus: exceptionalPending ? "pending-external-evidence" : "normal",
  });
}

export async function runProductionCronSmoke({
  fetchImpl = fetch,
  baseOrigin = CANONICAL_ORIGIN,
  cronSecret,
  confirmation,
} = {}) {
  invariant(
    Number(process.versions.node.split(".")[0]) === 22,
    `El smoke de Producción exige Node 22.x; se detectó ${process.versions.node}.`,
  );
  invariant(
    normalizedOrigin(baseOrigin, "El origen de Agorbis") === CANONICAL_ORIGIN,
    `El smoke de crons sólo puede apuntar a ${CANONICAL_ORIGIN}.`,
  );
  invariant(
    confirmation === "RUN_AGORBIS_PRODUCTION_CRONS",
    "Falta la confirmación explícita AGORBIS_PRODUCTION_CRON_SMOKE_CONFIRM=RUN_AGORBIS_PRODUCTION_CRONS.",
  );
  invariant(
    typeof cronSecret === "string" && cronSecret.length >= 32,
    "CRON_SECRET falta o es demasiado corto.",
  );

  const completed = [];
  for (const cronPath of cronPaths) {
    const label = `GET ${cronPath} autorizado en Cloudflare Workers`;
    const response = await request(
      fetchImpl,
      `${baseOrigin}${cronPath}`,
      {
        headers: { Authorization: `Bearer ${cronSecret}` },
      },
      120_000,
    );
    expectStatus(response, 200, label);
    expectHeader(response, "content-type", /^application\/json(?:;|$)/i, label);
    expectHeader(
      response,
      "cache-control",
      /(?:^|,)\s*no-store(?:,|$)/i,
      label,
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`${label} no devolvió JSON válido.`);
    }
    invariant(
      payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        typeof payload.ranAt === "string" &&
        Number.isFinite(Date.parse(payload.ranAt)) &&
        new Date(payload.ranAt).toISOString() === payload.ranAt &&
        !Object.hasOwn(payload, "error"),
      `${label} devolvió una estructura inesperada.`,
    );
    completed.push(label);
  }

  return Object.freeze({ completed: Object.freeze(completed) });
}

export const PRODUCTION_SMOKE_CONSTANTS = Object.freeze({
  canonicalOrigin: CANONICAL_ORIGIN,
  productionSupabaseOrigin: PRODUCTION_SUPABASE_ORIGIN,
  publicPaths,
  cronPaths,
  malformedResourcePaths,
  exceptionalPendingCopy: EXCEPTIONAL_PENDING_COPY,
});
