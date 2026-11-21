import {
  EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
  EXCEPTIONAL_CUTOVER_WORKER_NAME,
  exceptionalCutoverVersionMessage,
  exceptionalCutoverVersionTag,
} from "./exceptional-release-cutover-policy.mjs";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const MAX_VERSION_PAGES = 100;
const MAX_VERSION_ITEMS = 1_000;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const ALLOWED_ANNOTATION_KEYS = new Set([
  "workers/message",
  "workers/tag",
  "workers/triggered_by",
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

function exactKeys(value, expected, label) {
  invariant(isPlainObject(value), `${label} no es un objeto válido.`);
  invariant(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort()),
    `${label} cambió su estructura.`,
  );
}

function validateEnvelope(payload, { paginated, label }) {
  exactKeys(
    payload,
    paginated
      ? ["errors", "messages", "result", "result_info", "success"]
      : ["errors", "messages", "result", "success"],
    label,
  );
  invariant(payload.success === true, `${label} no indicó success=true.`);
  const cleanErrors = paginated
    ? payload.errors === null
    : Array.isArray(payload.errors) && payload.errors.length === 0;
  const cleanMessages = paginated
    ? payload.messages === null
    : Array.isArray(payload.messages) && payload.messages.length === 0;
  invariant(cleanErrors, `${label} informó errores.`);
  invariant(cleanMessages, `${label} informó mensajes inesperados.`);
}

function validateAnnotations(value, label) {
  invariant(isPlainObject(value), `${label} no es un objeto válido.`);
  invariant(
    Object.keys(value).every((key) => ALLOWED_ANNOTATION_KEYS.has(key)),
    `${label} contiene anotaciones desconocidas.`,
  );
  for (const [key, annotation] of Object.entries(value)) {
    invariant(
      typeof annotation === "string" && annotation.length > 0,
      `${label}.${key} no es un string válido.`,
    );
  }
}

function validateVersionMetadata(value, label) {
  exactKeys(
    value,
    ["author_email", "author_id", "created_on", "has_preview", "source"],
    label,
  );
  invariant(
    typeof value.created_on === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
        value.created_on,
      ) &&
      Number.isFinite(Date.parse(value.created_on)),
    `${label}.created_on no es UTC válido.`,
  );
  invariant(typeof value.has_preview === "boolean", `${label} es inválido.`);
  invariant(typeof value.source === "string", `${label} es inválido.`);
  invariant(typeof value.author_id === "string", `${label} es inválido.`);
  invariant(typeof value.author_email === "string", `${label} es inválido.`);
}

function validateVersionSummary(value, label) {
  exactKeys(value, ["annotations", "id", "metadata", "number"], label);
  invariant(
    typeof value.id === "string" && VERSION_ID_PATTERN.test(value.id),
    `${label}.id no es un UUID válido.`,
  );
  invariant(
    Number.isInteger(value.number) && value.number >= 0,
    `${label}.number no es válido.`,
  );
  validateVersionMetadata(value.metadata, `${label}.metadata`);
  validateAnnotations(value.annotations, `${label}.annotations`);
  return Object.freeze({
    id: value.id,
    tag: value.annotations["workers/tag"] ?? null,
    message: value.annotations["workers/message"] ?? null,
  });
}

function validateToken(token) {
  invariant(
    typeof token === "string" &&
      token.length >= 32 &&
      TOKEN_PATTERN.test(token),
    "No se proporcionó un OAuth Wrangler válido.",
  );
}

async function fetchJsonGet(fetchImpl, oauthToken, endpoint, label) {
  invariant(typeof fetchImpl === "function", "No existe un fetch válido.");
  validateToken(oauthToken);
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${endpoint}`, {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${oauthToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${label} no pudo completarse.`);
  }
  invariant(response instanceof Response, `${label} no devolvió HTTP válido.`);
  invariant(response.status === 200, `${label} devolvió un HTTP no aprobado.`);
  invariant(
    /^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    ),
    `${label} no devolvió application/json.`,
  );
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    invariant(/^\d+$/.test(declaredLength), `${label} tiene tamaño inválido.`);
    invariant(
      Number(declaredLength) <= MAX_RESPONSE_BYTES,
      `${label} excedió el límite.`,
    );
  }
  let source;
  try {
    source = await response.text();
  } catch {
    throw new Error(`${label} no pudo leerse.`);
  }
  invariant(source.length > 0, `${label} devolvió una respuesta vacía.`);
  invariant(
    Buffer.byteLength(source, "utf8") <= MAX_RESPONSE_BYTES,
    `${label} excedió el límite.`,
  );
  try {
    const payload = JSON.parse(source);
    invariant(isPlainObject(payload), `${label} no devolvió un objeto JSON.`);
    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${label} no devolvió JSON válido.`);
    }
    throw error;
  }
}

function versionsEndpoint() {
  return `/accounts/${EXCEPTIONAL_CUTOVER_ACCOUNT_ID}/workers/scripts/${EXCEPTIONAL_CUTOVER_WORKER_NAME}/versions`;
}

export function exceptionalCutoverRemoteIdentity({
  head,
  requestHash,
  policyVersion,
  policyHash,
  actHash,
  artifactHash,
} = {}) {
  invariant(
    SHA256_PATTERN.test(requestHash ?? ""),
    "requestHash no es válido.",
  );
  invariant(SHA256_PATTERN.test(actHash ?? ""), "actHash no es válido.");
  invariant(
    SHA256_PATTERN.test(artifactHash ?? ""),
    "artifactHash no es válido.",
  );
  return Object.freeze({
    tag: exceptionalCutoverVersionTag(head),
    message: exceptionalCutoverVersionMessage({
      mode: "upload",
      head,
      requestHash,
      policyVersion,
      policyHash,
      actHash,
      artifactHash,
    }),
  });
}

export function validateVersionInventoryPage(payload, { expectedPage } = {}) {
  const label = "GET versions";
  invariant(
    Number.isInteger(expectedPage) && expectedPage >= 1,
    "La página esperada no es válida.",
  );
  validateEnvelope(payload, { paginated: true, label });
  exactKeys(payload.result, ["items"], `${label}.result`);
  invariant(Array.isArray(payload.result.items), `${label}.items no es array.`);
  exactKeys(
    payload.result_info,
    ["count", "page", "per_page", "total_count"],
    `${label}.result_info`,
  );
  const itemCount = payload.result.items.length;
  for (const key of ["count", "page", "per_page", "total_count"]) {
    invariant(
      Number.isInteger(payload.result_info[key]) &&
        payload.result_info[key] >= 0,
      `${label}.result_info.${key} no es válido.`,
    );
  }
  invariant(
    payload.result_info.page === expectedPage &&
      payload.result_info.count === itemCount &&
      payload.result_info.per_page >= 1,
    `${label} no devolvió la página solicitada.`,
  );
  const items = payload.result.items.map((item, index) =>
    validateVersionSummary(item, `${label}.items[${index}]`),
  );
  invariant(
    new Set(items.map(({ id }) => id)).size === items.length,
    `${label} contiene Version IDs duplicados dentro de una página.`,
  );
  return Object.freeze({
    items: Object.freeze(items),
    page: payload.result_info.page,
    perPage: payload.result_info.per_page,
    totalCount: payload.result_info.total_count,
  });
}

export async function readVersionInventory({
  fetchImpl = globalThis.fetch,
  oauthToken,
} = {}) {
  const inventory = [];
  const seenIds = new Set();
  let expectedTotal = null;
  for (let page = 1; page <= MAX_VERSION_PAGES; page += 1) {
    const payload = await fetchJsonGet(
      fetchImpl,
      oauthToken,
      `${versionsEndpoint()}?page=${page}`,
      `GET versions page ${page}`,
    );
    const parsed = validateVersionInventoryPage(payload, {
      expectedPage: page,
    });
    if (expectedTotal === null) expectedTotal = parsed.totalCount;
    invariant(
      parsed.totalCount === expectedTotal,
      "GET versions cambió durante la paginación.",
    );
    if (parsed.items.length === 0) {
      invariant(
        inventory.length === expectedTotal,
        "GET versions no devolvió el inventario completo.",
      );
      return Object.freeze(inventory);
    }
    for (const item of parsed.items) {
      invariant(
        !seenIds.has(item.id),
        "GET versions repitió un Version ID entre páginas.",
      );
      seenIds.add(item.id);
      inventory.push(item);
      invariant(
        inventory.length <= MAX_VERSION_ITEMS,
        "GET versions excedió el máximo de items aprobado.",
      );
    }
  }
  throw new Error("GET versions no devolvió una página terminal.");
}

function collidesWithIdentity(version, { tag, message }) {
  return version.tag === tag || version.message === message;
}

export async function findExceptionalCutoverRemoteBindings({
  fetchImpl = globalThis.fetch,
  oauthToken,
  head,
  requestHash,
  policyVersion,
  policyHash,
  actHash,
  artifactHash,
} = {}) {
  const identity = exceptionalCutoverRemoteIdentity({
    head,
    requestHash,
    policyVersion,
    policyHash,
    actHash,
    artifactHash,
  });
  const inventory = await readVersionInventory({ fetchImpl, oauthToken });
  const versionIds = inventory
    .filter((version) => collidesWithIdentity(version, identity))
    .map(({ id }) => id);
  return Object.freeze({
    checkedVersionCount: inventory.length,
    versionIds: Object.freeze(versionIds),
  });
}

export async function assertExceptionalCutoverRemoteUnused({
  fetchImpl = globalThis.fetch,
  oauthToken,
  head,
  requestHash,
  policyVersion,
  policyHash,
  actHash,
  artifactHash,
} = {}) {
  const matches = await findExceptionalCutoverRemoteBindings({
    fetchImpl,
    oauthToken,
    head,
    requestHash,
    policyVersion,
    policyHash,
    actHash,
    artifactHash,
  });
  invariant(
    matches.versionIds.length === 0,
    "El HEAD o el acta ya tienen estado remoto y no pueden reutilizarse.",
  );
  return Object.freeze({ checkedVersionCount: matches.checkedVersionCount });
}

export function validateExceptionalUploadedVersion(
  payload,
  {
    versionId,
    head,
    requestHash,
    policyVersion,
    policyHash,
    actHash,
    artifactHash,
  } = {},
) {
  const label = "GET uploaded version";
  invariant(
    VERSION_ID_PATTERN.test(versionId ?? ""),
    "versionId no es válido.",
  );
  const identity = exceptionalCutoverRemoteIdentity({
    head,
    requestHash,
    policyVersion,
    policyHash,
    actHash,
    artifactHash,
  });
  validateEnvelope(payload, { paginated: false, label });
  exactKeys(
    payload.result,
    ["annotations", "id", "metadata", "number", "resources"],
    `${label}.result`,
  );
  const summary = validateVersionSummary(
    {
      annotations: payload.result.annotations,
      id: payload.result.id,
      metadata: payload.result.metadata,
      number: payload.result.number,
    },
    `${label}.result`,
  );
  invariant(isPlainObject(payload.result.resources), `${label} es inválido.`);
  invariant(summary.id === versionId, `${label} devolvió otro Version ID.`);
  invariant(
    summary.tag === identity.tag && summary.message === identity.message,
    `${label} no está ligado exactamente a HEAD/acta/artifact.`,
  );
  return Object.freeze({
    versionId: summary.id,
    tag: summary.tag,
    message: summary.message,
  });
}

export async function verifyExceptionalCutoverRemoteUpload({
  fetchImpl = globalThis.fetch,
  oauthToken,
  versionId,
  head,
  requestHash,
  policyVersion,
  policyHash,
  actHash,
  artifactHash,
} = {}) {
  invariant(
    VERSION_ID_PATTERN.test(versionId ?? ""),
    "versionId no es válido.",
  );
  const payload = await fetchJsonGet(
    fetchImpl,
    oauthToken,
    `${versionsEndpoint()}/${versionId}`,
    "GET uploaded version",
  );
  const verified = validateExceptionalUploadedVersion(payload, {
    versionId,
    head,
    requestHash,
    policyVersion,
    policyHash,
    actHash,
    artifactHash,
  });
  const matches = await findExceptionalCutoverRemoteBindings({
    fetchImpl,
    oauthToken,
    head,
    requestHash,
    policyVersion,
    policyHash,
    actHash,
    artifactHash,
  });
  invariant(
    matches.versionIds.length === 1 && matches.versionIds[0] === versionId,
    "El binding remoto no es único para este HEAD/acta/artifact.",
  );
  return verified;
}
