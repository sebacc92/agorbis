const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CAPABILITY_BYTES = 4096;
const MAX_CAPABILITY_LIFETIME_MS = 20 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;

export const D72_CANARY_CAPABILITY_SCHEMA = "agorbis-d72-canary-capability/v1";
export const D72_CANARY_CAPABILITY_HEADER = "x-agorbis-d72-canary";
export const CLOUDFLARE_VERSION_OVERRIDE_HEADER =
  "cloudflare-workers-version-overrides";
export const D72_CANARY_WORKER_NAME = "agorbis";

const PAYLOAD_KEYS = Object.freeze([
  "artifactHash",
  "expiresAtUtc",
  "head",
  "issuedAtUtc",
  "nonce",
  "policyHash",
  "requestHash",
  "schemaVersion",
  "versionId",
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function canonicalPayload(binding) {
  return {
    artifactHash: binding.artifactHash,
    expiresAtUtc: binding.expiresAtUtc,
    head: binding.head,
    issuedAtUtc: binding.issuedAtUtc,
    nonce: binding.nonce,
    policyHash: binding.policyHash,
    requestHash: binding.requestHash,
    schemaVersion: D72_CANARY_CAPABILITY_SCHEMA,
    versionId: binding.versionId.toLowerCase(),
  };
}

function parseTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : Number.NaN;
}

function assertBinding(binding, { now, enforceTime = true } = {}) {
  if (!exactKeys(binding, PAYLOAD_KEYS)) {
    throw new Error("D72_CANARY_BINDING_INVALID");
  }
  if (binding.schemaVersion !== D72_CANARY_CAPABILITY_SCHEMA) {
    throw new Error("D72_CANARY_BINDING_INVALID");
  }
  if (!FULL_HEAD_PATTERN.test(binding.head)) {
    throw new Error("D72_CANARY_BINDING_INVALID");
  }
  for (const name of ["requestHash", "policyHash", "artifactHash"]) {
    if (!SHA256_PATTERN.test(binding[name])) {
      throw new Error("D72_CANARY_BINDING_INVALID");
    }
  }
  if (!UUID_PATTERN.test(binding.versionId)) {
    throw new Error("D72_CANARY_BINDING_INVALID");
  }
  if (!NONCE_PATTERN.test(binding.nonce)) {
    throw new Error("D72_CANARY_BINDING_INVALID");
  }
  const issuedAt = parseTimestamp(binding.issuedAtUtc);
  const expiresAt = parseTimestamp(binding.expiresAtUtc);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_CAPABILITY_LIFETIME_MS
  ) {
    throw new Error("D72_CANARY_BINDING_INVALID");
  }
  if (enforceTime) {
    const current = now instanceof Date ? now.getTime() : Number.NaN;
    if (
      !Number.isFinite(current) ||
      issuedAt > current + CLOCK_SKEW_MS ||
      expiresAt <= current
    ) {
      throw new Error("D72_CANARY_CAPABILITY_EXPIRED");
    }
  }
  return canonicalPayload(binding);
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new Error("D72_CANARY_CAPABILITY_INVALID");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (padded.length % 4)) % 4;
  let binary;
  try {
    binary = atob(`${padded}${"=".repeat(padding)}`);
  } catch {
    throw new Error("D72_CANARY_CAPABILITY_INVALID");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assertSecret(secret) {
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    secret.length > 4096 ||
    /[\0\r\n]/u.test(secret)
  ) {
    throw new Error("D72_CANARY_KEY_UNAVAILABLE");
  }
  return secret;
}

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(assertSecret(secret)),
    { hash: "SHA-256", name: "HMAC" },
    false,
    usages,
  );
}

function signedMessage(payloadBase64Url) {
  return new TextEncoder().encode(
    `${D72_CANARY_CAPABILITY_SCHEMA}\0${payloadBase64Url}`,
  );
}

/**
 * Crea una capability sólo en memoria. El secreto nunca forma parte del token:
 * se usa como clave HMAC con separación de dominio.
 */
export async function createD72CanaryCapability({ binding, secret, now } = {}) {
  const payload = assertBinding(binding, { now, enforceTime: true });
  const payloadJson = JSON.stringify(payload);
  const payloadBase64Url = encodeBase64Url(
    new TextEncoder().encode(payloadJson),
  );
  const key = await hmacKey(secret, ["sign"]);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, signedMessage(payloadBase64Url)),
  );
  const token = `v1.${payloadBase64Url}.${encodeBase64Url(signature)}`;
  if (new TextEncoder().encode(token).byteLength > MAX_CAPABILITY_BYTES) {
    throw new Error("D72_CANARY_CAPABILITY_INVALID");
  }
  return token;
}

/**
 * Verifica firma, codificación canónica, versión objetivo y vigencia. Devuelve
 * sólo el binding no secreto; nunca devuelve ni registra la capability.
 */
export async function verifyD72CanaryCapability({
  token,
  secret,
  expectedVersionId,
  now,
} = {}) {
  try {
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      new TextEncoder().encode(token).byteLength > MAX_CAPABILITY_BYTES ||
      /[\0\r\n]/u.test(token)
    ) {
      return null;
    }
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const [, payloadBase64Url, signatureBase64Url] = parts;
    const signature = decodeBase64Url(signatureBase64Url);
    if (
      signature.byteLength !== 32 ||
      encodeBase64Url(signature) !== signatureBase64Url
    ) {
      return null;
    }
    const key = await hmacKey(secret, ["verify"]);
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      signedMessage(payloadBase64Url),
    );
    if (!verified) return null;

    const payloadBytes = decodeBase64Url(payloadBase64Url);
    if (encodeBase64Url(payloadBytes) !== payloadBase64Url) return null;
    const payloadJson = new TextDecoder("utf-8", { fatal: true }).decode(
      payloadBytes,
    );
    const parsed = JSON.parse(payloadJson);
    const binding = assertBinding(parsed, { now, enforceTime: true });
    if (JSON.stringify(binding) !== payloadJson) return null;
    if (
      typeof expectedVersionId !== "string" ||
      binding.versionId !== expectedVersionId.toLowerCase()
    ) {
      return null;
    }
    return Object.freeze(binding);
  } catch {
    return null;
  }
}

/** Acepta exactamente `agorbis="<uuid>"`; no admite listas ni ambigüedad. */
export function parseAgorbisVersionOverride(value) {
  if (typeof value !== "string" || /[\0\r\n]/u.test(value)) return null;
  const match = /^agorbis="([0-9a-f-]{36})"$/iu.exec(value);
  if (!match || !UUID_PATTERN.test(match[1])) return null;
  return match[1].toLowerCase();
}

export const D72_CANARY_CAPABILITY_LIMITS = Object.freeze({
  clockSkewMs: CLOCK_SKEW_MS,
  maxBytes: MAX_CAPABILITY_BYTES,
  maxLifetimeMs: MAX_CAPABILITY_LIFETIME_MS,
});
