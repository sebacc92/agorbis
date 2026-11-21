import { createHash } from "node:crypto";
import {
  collectCloudflareState,
  loadWranglerOAuthToken,
} from "./cloudflare-closed-state.mjs";
import {
  assertOpenReleaseBaselineMatches,
  assertOpenReleaseBaselineRecord,
} from "./open-release-baseline-policy.mjs";
import { PRODUCTION_SMOKE_CONSTANTS } from "./production-smoke-policy.mjs";

const ORIGIN = PRODUCTION_SMOKE_CONSTANTS.canonicalOrigin;
const WWW_ORIGIN = "https://www.agorbis.com";
const WWW_PATH = "/privacidad/?source=open-source-smoke&return=%2Fregistro%2F";
const SCHEMA = "agorbis-open-source-production-smoke/v1";
const PROFILE = "open-source-read-only";
const CERTIFIED_SCHEMA = "agorbis-open-source-production-smoke/v2";
const CERTIFIED_PROFILE = "open-source-after-authorized-canary";
const PUBLIC_PATHS = Object.freeze([
  ...PRODUCTION_SMOKE_CONSTANTS.publicPaths,
  "/eliminar-datos/",
]);
const AUTH_PATHS = new Set([
  "/registro/",
  "/ingresar/",
  "/recuperar/",
  "/reenviar-confirmacion/",
]);
const NAVIGATION = Object.freeze([
  Object.freeze(["/", "/ingresar/"]),
  Object.freeze(["/ingresar/", "/registro/"]),
  Object.freeze(["/registro/", "/ingresar/"]),
  Object.freeze(["/", "/privacidad/"]),
]);
const COMPLETED = Object.freeze([
  "OPEN source baseline inicial",
  ...PUBLIC_PATHS.map((path) => `GET ${path}`),
  "HEAD /",
  "HEAD /ingresar/",
  ...NAVIGATION.map(([from, to]) => `enlace HTML ${from} -> ${to}`),
  "CSS enlazado servido como CSS en páginas y navegación de documentos",
  `GET www ${WWW_PATH}`,
  "OPEN source baseline final",
]);
const RECEIPT_KEYS = Object.freeze([
  "schemaVersion",
  "profile",
  "baselineSha256",
  "activeDeploymentId",
  "activeVersionId",
  "startedAtUtc",
  "completedAtUtc",
  "completed",
  "requestCount",
  "requestMethods",
  "postAttemptCount",
  "authFunctionality",
  "databaseWriteStatus",
  "browserNavigation",
  "sourceAuthCachePolicy",
]);
const PRODUCTION_FETCH = globalThis.fetch;
const ISSUED = new WeakMap();
const HASH = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_REQUESTS = 150;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function plain(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys, label) {
  invariant(
    plain(value) &&
      JSON.stringify(Reflect.ownKeys(value).sort()) ===
        JSON.stringify([...keys].sort()) &&
      Object.values(Object.getOwnPropertyDescriptors(value)).every(
        (descriptor) =>
          Object.hasOwn(descriptor, "value") && descriptor.enumerable,
      ),
    `${label} contiene campos inesperados o accessors.`,
  );
}

// Canonical JSON data only; never invoke getters from supplied baseline data.
function canonicalData(value, ancestors = new Set(), depth = 0) {
  invariant(depth < 32, "El smoke excede la profundidad JSON permitida.");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "El smoke contiene un número inválido.");
    return value;
  }
  invariant(
    (plain(value) ||
      (Array.isArray(value) &&
        Object.getPrototypeOf(value) === Array.prototype)) &&
      !ancestors.has(value),
    "El smoke requiere datos JSON sin ciclos.",
  );
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).filter(
    (key) => !Array.isArray(value) || key !== "length",
  );
  invariant(
    keys.every(
      (key) =>
        typeof key === "string" &&
        descriptors[key].enumerable &&
        Object.hasOwn(descriptors[key], "value"),
    ),
    "El smoke no admite accessors ni propiedades ocultas.",
  );
  let result;
  if (Array.isArray(value)) {
    invariant(
      keys.length === value.length &&
        keys.every((key, index) => key === String(index)),
      "El smoke no admite arrays dispersos.",
    );
    result = keys.map((key) =>
      canonicalData(descriptors[key].value, ancestors, depth + 1),
    );
  } else {
    result = Object.fromEntries(
      keys
        .sort()
        .map((key) => [
          key,
          canonicalData(descriptors[key].value, ancestors, depth + 1),
        ]),
    );
  }
  ancestors.delete(value);
  return result;
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalData(value)))
    .digest("hex");
}

function instant(value) {
  invariant(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    "El smoke requiere un instante UTC canónico.",
  );
  return Date.parse(value);
}

function clock(nowImpl) {
  const now = nowImpl();
  invariant(
    now instanceof Date && Number.isFinite(now.getTime()),
    "El reloj del smoke es inválido.",
  );
  return now.toISOString();
}

function assertRuntime() {
  invariant(
    Number(process.versions.node.split(".")[0]) === 22 &&
      process.execArgv.length === 0 &&
      [
        "NODE_OPTIONS",
        "NODE_DEBUG",
        "NODE_DEBUG_NATIVE",
        "NODE_V8_COVERAGE",
      ].every((name) => !process.env[name]) &&
      globalThis.fetch === PRODUCTION_FETCH,
    "El smoke OPEN productivo exige Node 22 sin instrumentación ni reemplazo de fetch.",
  );
}

async function canonicalSnapshot() {
  const oauthToken = await loadWranglerOAuthToken();
  return collectCloudflareState({ fetchImpl: PRODUCTION_FETCH, oauthToken });
}

async function boundedText(response, label, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      invariant(
        value instanceof Uint8Array,
        `${label} devolvió bytes inválidos.`,
      );
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} excede el tamaño máximo permitido.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

function header(response, name, expected, label) {
  const value = response.headers.get(name) ?? "";
  invariant(
    typeof expected === "string" ? value === expected : expected.test(value),
    `${label} no conserva ${name}.`,
  );
}

function noCookies(response, label) {
  invariant(
    !response.headers.has("set-cookie"),
    `${label} emitió una cookie inesperada en una visita anónima.`,
  );
}

function noStore(response, label) {
  const directives = (response.headers.get("cache-control") ?? "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim());
  invariant(
    directives.includes("no-store") &&
      !directives.some(
        (part) =>
          /^(?:public|immutable)(?:$|\s*=)/.test(part) ||
          (/^(?:s-maxage|max-age|stale-while-revalidate|stale-if-error)\s*=/.test(
            part,
          ) &&
            !/=\s*(?:0|"0")$/.test(part)),
      ),
    `${label} permite cache de Auth o no contiene no-store.`,
  );
  notServedFromCache(response, label);
}

function notServedFromCache(response, label) {
  const age = response.headers.get("age");
  invariant(
    !/^(?:HIT|STALE|UPDATING|REVALIDATED)$/i.test(
      response.headers.get("cf-cache-status") ?? "",
    ) &&
      (age === null || (/^\d+$/.test(age) && Number(age) === 0)),
    `${label} fue servido desde caché.`,
  );
}

function defensiveHeaders(response, label) {
  // Same HTTP/CSP contract as production-smoke-policy, without invoking its
  // combined runner (which includes a POST to Supabase's Widget B guard).
  header(response, "x-content-type-options", "nosniff", label);
  header(response, "x-frame-options", "DENY", label);
  header(
    response,
    "referrer-policy",
    /^(?:strict-origin-when-cross-origin|same-origin|no-referrer)$/,
    label,
  );
  header(
    response,
    "strict-transport-security",
    /(?:^|;)\s*max-age=31536000(?:;|$).*includeSubDomains/i,
    label,
  );
  header(
    response,
    "x-request-id",
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    label,
  );
  header(response, "cf-ray", /^[a-f0-9]+-[a-z0-9]+$/i, label);
  invariant(
    !response.headers.has("x-vercel-id"),
    `${label} expone el runtime Vercel.`,
  );
  const directives = new Map();
  for (const entry of (
    response.headers.get("content-security-policy") ?? ""
  ).split(";")) {
    const [name, ...values] = entry.trim().split(/\s+/);
    if (!name) continue;
    invariant(
      !directives.has(name),
      `${label} contiene directivas CSP duplicadas.`,
    );
    directives.set(name, values);
  }
  for (const [name, expected] of Object.entries({
    "default-src": "'self'",
    "script-src-attr": "'none'",
    "frame-ancestors": "'none'",
    "base-uri": "'none'",
    // Este smoke observa el origen: antes del acceso OAuth sirve sólo 'self' y
    // después agrega exactamente Supabase y Google. Ambos valores son exactos.
    "form-action": [
      "'self'",
      `'self' ${PRODUCTION_SMOKE_CONSTANTS.productionSupabaseOrigin} https://accounts.google.com`,
    ],
    "object-src": "'none'",
    "upgrade-insecure-requests": "",
  })) {
    invariant(
      directives.has(name) &&
        [expected].flat().includes(directives.get(name).join(" ")),
      `${label} no conserva CSP ${name}.`,
    );
  }
  const scripts = directives.get("script-src") ?? [];
  invariant(
    scripts.includes("https://challenges.cloudflare.com") &&
      scripts.includes("'strict-dynamic'") &&
      scripts.some((entry) => /^'nonce-[A-Za-z0-9+/_-]+={0,2}'$/.test(entry)) &&
      !scripts.includes("'unsafe-inline'") &&
      !scripts.includes("'unsafe-eval'"),
    `${label} no conserva la CSP de scripts productiva.`,
  );
}

function markup(body) {
  return body
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function attributes(tag) {
  const values = new Map();
  for (const match of tag.matchAll(
    /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    const name = match[1].toLowerCase();
    invariant(!values.has(name), "El documento contiene atributos duplicados.");
    values.set(
      name,
      (match[2] ?? match[3] ?? match[4]).replaceAll("&amp;", "&"),
    );
  }
  return values;
}

function linkedCss(body, path) {
  const paths = new Set();
  for (const match of markup(body).matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (
      !(attrs.get("rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .includes("stylesheet")
    )
      continue;
    const href = attrs.get("href");
    invariant(href, `${path} enlaza CSS sin href.`);
    const url = new URL(href, `${ORIGIN}${path}`);
    invariant(
      url.origin === ORIGIN &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /^\/(?:build|assets)\/[A-Za-z0-9_.-]+\.css$/.test(url.pathname),
      `${path} enlaza CSS fuera del inventario estático propio.`,
    );
    invariant(
      !/\sdisabled(?:\s|=|\/?[>])/i.test(match[0]) &&
        (!attrs.has("media") || /^(?:all|screen)$/i.test(attrs.get("media"))),
      `${path} no carga su CSS como hoja activa.`,
    );
    paths.add(url.pathname);
  }
  invariant(
    paths.size > 0 && paths.size <= 8,
    `${path} no enlaza una cantidad válida de hojas CSS reales.`,
  );
  return [...paths].sort();
}

function navigationTarget(body, from, to) {
  const matches = [...markup(body).matchAll(/<a\b[^>]*>/gi)];
  for (const match of matches) {
    const href = attributes(match[0]).get("href");
    if (!href) continue;
    let url;
    try {
      url = new URL(href, `${ORIGIN}${from}`);
    } catch {
      continue;
    }
    if (
      url.origin === ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      `${url.pathname.replace(/\/$/, "")}/` === to
    )
      return url;
  }
  throw new Error(`No se encontró el enlace público ${from} -> ${to}.`);
}

export function assertOpenSourceProductionSmokeReceipt(receipt, options = {}) {
  exactKeys(
    options,
    [
      ...(Object.hasOwn(options, "allowTestReceipt")
        ? ["allowTestReceipt"]
        : []),
      ...(Object.hasOwn(options, "expectedCertificateHash")
        ? ["expectedCertificateHash"]
        : []),
    ],
    "La validación del receipt OPEN",
  );
  const allowTestReceipt = options.allowTestReceipt ?? false;
  invariant(
    typeof allowTestReceipt === "boolean",
    "La política de receipt OPEN es inválida.",
  );
  const certified = receipt?.schemaVersion === CERTIFIED_SCHEMA;
  exactKeys(
    receipt,
    certified ? [...RECEIPT_KEYS, "openUpdateEvidenceHash"] : RECEIPT_KEYS,
    "El receipt OPEN",
  );
  invariant(
    certified
      ? HASH.test(options.expectedCertificateHash ?? "") &&
          receipt.openUpdateEvidenceHash === options.expectedCertificateHash
      : options.expectedCertificateHash === undefined,
    "El receipt OPEN no pertenece al contexto de certificación esperado.",
  );
  canonicalData(receipt);
  exactKeys(
    receipt.sourceAuthCachePolicy,
    [...AUTH_PATHS],
    "Política observada en Auth fuente",
  );
  invariant(
    Object.values(receipt.sourceAuthCachePolicy).every(
      (value) =>
        value === "NO_STORE_OBSERVED" || value === "CANDIDATE_FIX_REQUIRED",
    ),
    "Observación de cache Auth inválida.",
  );
  invariant(
    Object.isFrozen(receipt) &&
      Object.isFrozen(receipt.completed) &&
      Object.isFrozen(receipt.requestMethods) &&
      receipt.schemaVersion === (certified ? CERTIFIED_SCHEMA : SCHEMA) &&
      receipt.profile === (certified ? CERTIFIED_PROFILE : PROFILE) &&
      HASH.test(receipt.baselineSha256) &&
      UUID.test(receipt.activeVersionId) &&
      UUID.test(receipt.activeDeploymentId) &&
      JSON.stringify(receipt.completed) === JSON.stringify(COMPLETED) &&
      JSON.stringify(receipt.requestMethods) ===
        JSON.stringify(["GET", "HEAD"]) &&
      Number.isInteger(receipt.requestCount) &&
      receipt.requestCount >=
        PUBLIC_PATHS.length +
          NAVIGATION.length +
          3 +
          PUBLIC_PATHS.length +
          NAVIGATION.length &&
      receipt.requestCount <= MAX_REQUESTS &&
      receipt.postAttemptCount === 0 &&
      receipt.authFunctionality === "NOT_VERIFIED" &&
      receipt.databaseWriteStatus === "NOT_VERIFIED" &&
      receipt.browserNavigation === "NOT_VERIFIED" &&
      instant(receipt.completedAtUtc) >= instant(receipt.startedAtUtc),
    "El receipt del smoke OPEN no es válido.",
  );
  const issuance = ISSUED.get(receipt);
  invariant(
    issuance === "PRODUCTION" || (allowTestReceipt && issuance === "TEST_ONLY"),
    "El receipt OPEN no fue emitido por el runner autorizado.",
  );
  return receipt;
}

export function openSourceProductionSmokeHash(receipt, options) {
  assertOpenSourceProductionSmokeReceipt(receipt, options);
  return hash(receipt);
}

/** Anonymous GET/HEAD observations only. HTTP reads do not certify database
 * side effects, account operations, Google sign-in, or hydrated browser routing.
 * The two Cloudflare snapshots bind the same source configuration/version,
 * not the future destination and not the bytes of the deployed Worker.
 * Missing/unsafe Auth cache policy is retained as a source finding. The OPEN
 * stateful Google check separately requires authResponsesNoStore on the actual
 * candidate; a source finding must never be converted into that check's PASS.
 */
export async function runOpenSourceProductionSmoke(options) {
  const testOnly = plain(options) && options.testOnly === true;
  const certified = plain(options) && Object.hasOwn(options, "certifiedSource");
  exactKeys(
    options,
    [
      ...(testOnly
        ? [
            "baseline",
            "expectedBaselineSha256",
            "testOnly",
            "fetchImpl",
            "readSnapshotImpl",
            "nowImpl",
          ]
        : ["baseline", "expectedBaselineSha256"]),
      ...(certified ? ["certifiedSource"] : []),
    ],
    "Las opciones del smoke OPEN (seams requieren testOnly=true)",
  );
  const baseline = canonicalData(options.baseline);
  const expectedBaselineSha256 = options.expectedBaselineSha256;
  invariant(
    typeof expectedBaselineSha256 === "string" &&
      HASH.test(expectedBaselineSha256) &&
      hash(baseline) === expectedBaselineSha256,
    "El smoke OPEN requiere un baseline con hash fijado válido.",
  );
  const certifiedSource = certified
    ? canonicalData(options.certifiedSource)
    : null;
  if (certified) {
    exactKeys(
      certifiedSource,
      ["certificate", "expectedCertificateHash", "request", "artifactManifest"],
      "Contexto posterior al canary",
    );
    invariant(
      certifiedSource.request?.openSourceBaselineSha256 ===
        expectedBaselineSha256 &&
        hash(certifiedSource.request.openSourceBaseline) ===
          expectedBaselineSha256,
      "El contexto certificado no usa el baseline fijado del smoke.",
    );
  }
  if (!testOnly) assertRuntime();
  const fetchImpl = testOnly ? options.fetchImpl : PRODUCTION_FETCH;
  const readSnapshotImpl = testOnly
    ? options.readSnapshotImpl
    : canonicalSnapshot;
  const nowImpl = testOnly ? options.nowImpl : () => new Date();
  invariant(
    [fetchImpl, readSnapshotImpl, nowImpl].every(
      (value) => typeof value === "function",
    ),
    "El smoke OPEN requiere fetch, auditor y reloj válidos.",
  );
  const sourceAuthCachePolicy = Object.fromEntries(
    [...AUTH_PATHS].map((path) => [path, "NO_STORE_OBSERVED"]),
  );
  function observeSourceAuthCache(response, path) {
    if (!AUTH_PATHS.has(path)) return;
    notServedFromCache(response, path);
    try {
      noStore(response, path);
    } catch {
      sourceAuthCachePolicy[path] = "CANDIDATE_FIX_REQUIRED";
    }
  }
  const startedAtUtc = clock(nowImpl);
  assertOpenReleaseBaselineRecord({
    baseline,
    expectedBaselineSha256,
    nowUtc: startedAtUtc,
  });
  async function audit() {
    let snapshot;
    try {
      snapshot = await readSnapshotImpl();
    } catch {
      throw new Error(
        "No se pudo acreditar el baseline OPEN mediante el auditor canónico.",
      );
    }
    const observedAtUtc = clock(nowImpl);
    if (certified) {
      const { assertOpenUpdateCertifiedSourceSnapshot } =
        await import("./open-update-source-policy.mjs");
      const checked = assertOpenUpdateCertifiedSourceSnapshot({
        ...certifiedSource,
        snapshot,
        now: observedAtUtc,
      });
      return Object.freeze({
        versionId: checked.activeVersionId,
        deploymentId: checked.activeDeploymentId,
        baselineSha256: checked.openSourceBaselineSha256,
        observedAtUtc,
      });
    }
    return assertOpenReleaseBaselineMatches({
      baseline,
      expectedBaselineSha256,
      snapshot,
      observedAtUtc,
      nowUtc: observedAtUtc,
    });
  }
  const before = await audit();
  let requestCount = 0;
  async function request(url, method = "GET") {
    const label = `${method} ${url.pathname}`;
    invariant(
      (method === "GET" || method === "HEAD") &&
        !url.username &&
        !url.password &&
        !url.hash &&
        ((url.origin === ORIGIN &&
          (PUBLIC_PATHS.includes(`${url.pathname.replace(/\/$/, "")}/`) ||
            /^\/(?:build|assets)\/[A-Za-z0-9_.-]+\.css$/.test(url.pathname)) &&
          !url.search) ||
          (url.origin === WWW_ORIGIN &&
            `${url.pathname}${url.search}` === WWW_PATH)),
      "El smoke OPEN intentó salir de su inventario GET/HEAD público.",
    );
    invariant(
      ++requestCount <= MAX_REQUESTS,
      "El smoke OPEN excedió su inventario máximo de solicitudes.",
    );
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: "manual",
        credentials: "omit",
        headers: { "Accept-Language": "es-AR,es;q=0.9" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(`${label} no pudo consultar el sitio público.`);
    }
    invariant(
      response instanceof Response &&
        !response.redirected &&
        (!response.url || response.url === url.href),
      `${label} devolvió una respuesta inválida o siguió una redirección.`,
    );
    noCookies(response, label);
    return response;
  }
  async function css(body, path) {
    for (const cssPath of linkedCss(body, path)) {
      const response = await request(new URL(cssPath, ORIGIN));
      invariant(
        response.status === 200 && !response.headers.has("location"),
        `${path} no pudo descargar su CSS.`,
      );
      header(response, "content-type", /^text\/css(?:;|$)/i, cssPath);
      const text = await boundedText(response, cssPath, 2 * 1024 * 1024);
      invariant(
        text.length >= 40 &&
          !/<(?:!doctype|html|script)\b/i.test(text) &&
          /[^{}]+\{[^{}]*[a-z-]+\s*:[^{}]+\}/i.test(text),
        `${path} recibió contenido que no es CSS real.`,
      );
    }
  }
  async function document(url, path, method = "GET") {
    let response = await request(url, method);
    if (url.pathname !== path) {
      invariant(
        [301, 302, 307, 308].includes(response.status) &&
          response.headers.get("location") &&
          new URL(response.headers.get("location"), url).href ===
            `${ORIGIN}${path}`,
        `El enlace ${path} no conserva la ruta canónica.`,
      );
      observeSourceAuthCache(response, path);
      await boundedText(response, path, 4096);
      response = await request(new URL(path, ORIGIN), method);
    }
    invariant(
      response.status === 200 && !response.headers.has("location"),
      `${path} no devolvió HTTP 200 sin redirección.`,
    );
    header(response, "content-type", /^text\/html(?:;|$)/i, path);
    defensiveHeaders(response, path);
    observeSourceAuthCache(response, path);
    const body = await boundedText(response, path, 1024 * 1024);
    if (method === "HEAD") {
      invariant(body === "", `${path} devolvió body para HEAD.`);
      return "";
    }
    invariant(
      /<!doctype html|<html[\s>]/i.test(body) && /Agorbis/i.test(markup(body)),
      `${path} no devolvió HTML público de Agorbis.`,
    );
    if (path === "/ingresar/") {
      invariant(
        [...markup(body).matchAll(/<input\b[^>]*>/gi)].some((match) => {
          const attrs = attributes(match[0]);
          return attrs.get("name") === "email" && attrs.get("type") === "email";
        }),
        "El ingreso no conserva el campo de correo.",
      );
    }
    await css(body, path);
    return body;
  }
  const bodies = new Map();
  for (const path of PUBLIC_PATHS)
    bodies.set(path, await document(new URL(path, ORIGIN), path));
  await document(new URL("/", ORIGIN), "/", "HEAD");
  await document(new URL("/ingresar/", ORIGIN), "/ingresar/", "HEAD");
  for (const [from, to] of NAVIGATION)
    await document(navigationTarget(bodies.get(from), from, to), to);
  const wwwResponse = await request(new URL(WWW_PATH, WWW_ORIGIN));
  invariant(
    wwwResponse.status === 308 &&
      wwwResponse.headers.get("location") === `${ORIGIN}${WWW_PATH}`,
    "www no conserva exactamente path y query en HTTP 308.",
  );
  noStore(wwwResponse, "www");
  invariant(
    (await boundedText(wwwResponse, "www", 4096)) === "",
    "www devolvió un cuerpo inesperado.",
  );
  const after = await audit();
  invariant(
    before.versionId === after.versionId &&
      before.deploymentId === after.deploymentId &&
      before.baselineSha256 === after.baselineSha256,
    "El origen OPEN cambió durante el smoke.",
  );
  const completedAtUtc = clock(nowImpl);
  invariant(
    instant(startedAtUtc) <= instant(before.observedAtUtc) &&
      instant(before.observedAtUtc) <= instant(after.observedAtUtc) &&
      instant(after.observedAtUtc) <= instant(completedAtUtc) &&
      instant(completedAtUtc) < instant(baseline.expiresAtUtc),
    "El reloj retrocedió o el baseline venció durante el smoke.",
  );
  const receipt = Object.freeze({
    schemaVersion: certified ? CERTIFIED_SCHEMA : SCHEMA,
    profile: certified ? CERTIFIED_PROFILE : PROFILE,
    ...(certified
      ? { openUpdateEvidenceHash: certifiedSource.expectedCertificateHash }
      : {}),
    baselineSha256: expectedBaselineSha256,
    activeDeploymentId: before.deploymentId,
    activeVersionId: before.versionId,
    startedAtUtc,
    completedAtUtc,
    completed: COMPLETED,
    requestCount,
    requestMethods: Object.freeze(["GET", "HEAD"]),
    postAttemptCount: 0,
    authFunctionality: "NOT_VERIFIED",
    databaseWriteStatus: "NOT_VERIFIED",
    browserNavigation: "NOT_VERIFIED",
    sourceAuthCachePolicy: Object.freeze(sourceAuthCachePolicy),
  });
  ISSUED.set(receipt, testOnly ? "TEST_ONLY" : "PRODUCTION");
  assertOpenSourceProductionSmokeReceipt(receipt, {
    allowTestReceipt: testOnly,
    ...(certified
      ? { expectedCertificateHash: certifiedSource.expectedCertificateHash }
      : {}),
  });
  return receipt;
}

export const OPEN_SOURCE_PRODUCTION_SMOKE_CONSTANTS = Object.freeze({
  schemaVersion: SCHEMA,
  profile: PROFILE,
  canonicalOrigin: ORIGIN,
  wwwOrigin: WWW_ORIGIN,
  wwwRedirectPath: WWW_PATH,
  publicPaths: PUBLIC_PATHS,
  completed: COMPLETED,
});
