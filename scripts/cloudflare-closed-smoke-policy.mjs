import { runCloudflareClosedStateCheck } from "./cloudflare-closed-state.mjs";

const CANONICAL_ORIGIN = "https://agorbis.com";
const WWW_ORIGIN = "https://www.agorbis.com";
const EXPECTED_BODY = "Agorbis todavía no está abierto.";
const WWW_REDIRECT_PATH =
  "/privacidad/?source=closed-smoke&return=%2Fregistro%2F";
const MAX_BODY_BYTES = 4096;
const REQUEST_TIMEOUT_MS = 15_000;
const PRODUCTION_FETCH = globalThis.fetch;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POST_HTTP_503_OBSERVED = "POST_HTTP_503_OBSERVED";
const POST_WRITE_STATUS = "NOT_VERIFIED";
const ISSUED_CLOSED_SMOKE_RECEIPTS = new WeakMap();
const RECEIPT_KEYS = Object.freeze([
  "activeDeploymentId",
  "activeVersionId",
  "completed",
  "completedAtUtc",
  "cronCount",
  "postAttemptCount",
  "postDeniedCount",
  "postState",
  "postWriteStatus",
  "profile",
  "startedAtUtc",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function assertProductionRuntime() {
  invariant(
    process.execArgv.length === 0 &&
      ["NODE_OPTIONS", "NODE_DEBUG", "NODE_V8_COVERAGE"].every(
        (name) =>
          typeof process.env[name] !== "string" || process.env[name] === "",
      ) &&
      PRODUCTION_FETCH === globalThis.fetch,
    "El smoke CLOSED productivo no admite instrumentación de Node ni reemplazo de fetch.",
  );
}

function readCanonicalClock(nowImpl, label) {
  const value = nowImpl();
  invariant(
    value instanceof Date && Number.isFinite(value.getTime()),
    `${label} no devolvió un instante válido.`,
  );
  return value.toISOString();
}

async function readCanonicalClosedProfile() {
  const state = await runCloudflareClosedStateCheck({
    phase: "custom-domains",
    secretStage: "complete",
  });
  // El auditor canónico sólo retorna después de validar schedules=[] para CLOSED.
  return Object.freeze({ ...state, cronCount: 0, profile: "closed" });
}

function validateClosedProfile(profile, label) {
  invariant(
    profile !== null &&
      typeof profile === "object" &&
      !Array.isArray(profile) &&
      profile.profile === "closed" &&
      profile.phase === "custom-domains" &&
      profile.secretStage === "complete" &&
      profile.cronCount === 0 &&
      VERSION_ID_PATTERN.test(profile.activeDeploymentId ?? "") &&
      VERSION_ID_PATTERN.test(profile.activeVersionId ?? ""),
    `${label} no acredita el mismo perfil CLOSED sin Cron Triggers.`,
  );
  return profile;
}

async function readClosedProfile(readClosedProfileImpl, label) {
  let profile;
  try {
    profile = await readClosedProfileImpl();
  } catch {
    throw new Error(`${label} no pudo acreditar el perfil CLOSED vigente.`);
  }
  return validateClosedProfile(profile, label);
}

async function readBoundedText(response, label) {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      invariant(
        value instanceof Uint8Array,
        `${label} devolvió un body inválido.`,
      );
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} excede 4 KiB.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function validateClosedHeaders(response, label) {
  invariant(response.status === 503, `${label} no devolvió HTTP 503.`);
  invariant(
    response.headers.get("cache-control") === "no-store",
    `${label} no usa Cache-Control no-store.`,
  );
  invariant(
    response.headers.get("content-security-policy") === "default-src 'none'",
    `${label} no conserva la CSP cerrada.`,
  );
  invariant(
    response.headers.get("x-content-type-options") === "nosniff",
    `${label} no conserva X-Content-Type-Options.`,
  );
  invariant(
    response.headers.get("retry-after") === "300",
    `${label} no conserva Retry-After 300.`,
  );
  invariant(
    response.headers.get("set-cookie") === null,
    `${label} intentó crear una cookie.`,
  );
  invariant(
    response.headers.get("location") === null,
    `${label} intentó redirigir una solicitud cerrada.`,
  );
}

function validateWwwRedirect(response, expectedLocation, label) {
  invariant(response.status === 308, `${label} no devolvió HTTP 308.`);
  invariant(
    response.headers.get("location") === expectedLocation,
    `${label} no conservó exactamente path y query.`,
  );
  invariant(
    response.headers.get("cache-control") === "no-store",
    `${label} no usa Cache-Control no-store.`,
  );
  invariant(
    response.headers.get("set-cookie") === null,
    `${label} intentó crear una cookie.`,
  );
}

export function assertClosedProductionSmokeReceipt(
  receipt,
  { allowTestReceipt = false } = {},
) {
  invariant(
    typeof allowTestReceipt === "boolean",
    "La política de receipt CLOSED no es válida.",
  );
  const startedAt = new Date(receipt?.startedAtUtc);
  const completedAt = new Date(receipt?.completedAtUtc);
  invariant(
    sameKeys(receipt, RECEIPT_KEYS) &&
      VERSION_ID_PATTERN.test(receipt.activeDeploymentId ?? "") &&
      VERSION_ID_PATTERN.test(receipt.activeVersionId ?? "") &&
      Array.isArray(receipt.completed) &&
      Object.isFrozen(receipt.completed) &&
      receipt.completed.length === 6 &&
      receipt.completed[0] === "CLOSED inicial cronCount=0" &&
      receipt.completed[1] === "GET /" &&
      receipt.completed[2] === "HEAD /" &&
      receipt.completed[3] === "POST /registro/" &&
      receipt.completed[4] === `GET www ${WWW_REDIRECT_PATH}` &&
      receipt.completed[5] === "CLOSED final cronCount=0" &&
      Number.isFinite(startedAt.getTime()) &&
      Number.isFinite(completedAt.getTime()) &&
      startedAt.toISOString() === receipt.startedAtUtc &&
      completedAt.toISOString() === receipt.completedAtUtc &&
      completedAt >= startedAt &&
      receipt.cronCount === 0 &&
      receipt.postAttemptCount === 1 &&
      receipt.postDeniedCount === 1 &&
      receipt.postState === POST_HTTP_503_OBSERVED &&
      receipt.postWriteStatus === POST_WRITE_STATUS &&
      receipt.profile === "closed" &&
      Object.isFrozen(receipt),
    "El receipt del smoke CLOSED no es válido.",
  );
  const issuance = ISSUED_CLOSED_SMOKE_RECEIPTS.get(receipt);
  invariant(
    issuance === "PRODUCTION" || (allowTestReceipt && issuance === "TEST_ONLY"),
    "El receipt del smoke CLOSED no fue emitido por el runner autorizado.",
  );
  return receipt;
}

export async function runClosedProductionSmoke(options = {}) {
  invariant(isPlainObject(options), "Las opciones del smoke no son válidas.");
  const testOnly = options.testOnly === true;
  const expectedOptionKeys = testOnly
    ? ["fetchImpl", "nowImpl", "readClosedProfileImpl", "testOnly"]
    : [];
  invariant(
    sameKeys(options, expectedOptionKeys),
    testOnly
      ? "El smoke testOnly exige exactamente ambos seams fixture."
      : "Los seams del smoke CLOSED requieren testOnly=true.",
  );
  if (!testOnly) assertProductionRuntime();
  const fetchImpl = testOnly ? options.fetchImpl : PRODUCTION_FETCH;
  const readClosedProfileImpl = testOnly
    ? options.readClosedProfileImpl
    : readCanonicalClosedProfile;
  const nowImpl = testOnly ? options.nowImpl : () => new Date();
  invariant(fetchImpl instanceof Function, "El smoke requiere fetch.");
  invariant(
    readClosedProfileImpl instanceof Function,
    "El smoke requiere el auditor canónico CLOSED.",
  );
  invariant(nowImpl instanceof Function, "El smoke requiere un reloj válido.");
  const origin = CANONICAL_ORIGIN;
  const startedAtUtc = readCanonicalClock(nowImpl, "El reloj CLOSED inicial");

  const initialClosedProfile = await readClosedProfile(
    readClosedProfileImpl,
    "La lectura CLOSED inicial",
  );

  const completed = ["CLOSED inicial cronCount=0"];
  let postHttp503Observed = false;
  for (const [method, pathname, body] of [
    ["GET", "/", undefined],
    ["HEAD", "/", undefined],
    ["POST", "/registro/", "fixture=non-sensitive"],
  ]) {
    const label = `${method} ${pathname}`;
    let response;
    try {
      response = await fetchImpl(new URL(pathname, origin), {
        method,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(body
          ? { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          : {}),
      });
    } catch {
      throw new Error(`${label} no pudo consultar Producción cerrada.`);
    }
    invariant(
      response instanceof Response,
      `${label} devolvió una respuesta inválida.`,
    );
    validateClosedHeaders(response, label);
    const text = await readBoundedText(response, label);
    invariant(
      text === (method === "HEAD" ? "" : EXPECTED_BODY),
      `${label} devolvió un cuerpo inesperado.`,
    );
    if (method === "POST") postHttp503Observed = true;
    completed.push(label);
  }

  const wwwLabel = `GET www ${WWW_REDIRECT_PATH}`;
  const expectedLocation = new URL(WWW_REDIRECT_PATH, CANONICAL_ORIGIN).href;
  let wwwResponse;
  try {
    wwwResponse = await fetchImpl(new URL(WWW_REDIRECT_PATH, WWW_ORIGIN), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${wwwLabel} no pudo consultar la redirección canónica.`);
  }
  invariant(
    wwwResponse instanceof Response,
    `${wwwLabel} devolvió una respuesta inválida.`,
  );
  validateWwwRedirect(wwwResponse, expectedLocation, wwwLabel);
  invariant(
    (await readBoundedText(wwwResponse, wwwLabel)) === "",
    `${wwwLabel} devolvió un cuerpo inesperado.`,
  );
  completed.push(wwwLabel);

  const finalClosedProfile = await readClosedProfile(
    readClosedProfileImpl,
    "La lectura CLOSED final",
  );
  invariant(
    finalClosedProfile.activeDeploymentId ===
      initialClosedProfile.activeDeploymentId &&
      finalClosedProfile.activeVersionId ===
        initialClosedProfile.activeVersionId,
    "El Deployment o la Version CLOSED cambiaron durante el smoke.",
  );
  completed.push("CLOSED final cronCount=0");

  invariant(
    postHttp503Observed,
    "El smoke no observó la respuesta POST HTTP 503 CLOSED canónica.",
  );
  const completedAtUtc = readCanonicalClock(nowImpl, "El reloj CLOSED final");

  const receipt = Object.freeze({
    activeDeploymentId: initialClosedProfile.activeDeploymentId,
    activeVersionId: initialClosedProfile.activeVersionId,
    completed: Object.freeze(completed),
    completedAtUtc,
    cronCount: 0,
    postAttemptCount: 1,
    postDeniedCount: 1,
    postState: POST_HTTP_503_OBSERVED,
    // El status HTTP no acredita que el Worker no haya escrito antes de
    // responder. Esa propiedad requiere una evidencia DB/artefacto separada.
    postWriteStatus: POST_WRITE_STATUS,
    profile: "closed",
    startedAtUtc,
  });
  ISSUED_CLOSED_SMOKE_RECEIPTS.set(
    receipt,
    testOnly ? "TEST_ONLY" : "PRODUCTION",
  );
  assertClosedProductionSmokeReceipt(receipt, {
    allowTestReceipt: testOnly,
  });
  return receipt;
}

export const CLOSED_PRODUCTION_SMOKE_CONSTANTS = Object.freeze({
  canonicalOrigin: CANONICAL_ORIGIN,
  expectedBody: EXPECTED_BODY,
  postDeniedState: POST_HTTP_503_OBSERVED,
  postWriteStatus: POST_WRITE_STATUS,
  wwwOrigin: WWW_ORIGIN,
  wwwRedirectPath: WWW_REDIRECT_PATH,
});
