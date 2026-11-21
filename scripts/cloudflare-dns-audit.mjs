#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLOUDFLARE_ACCOUNT_ID = "4d78fb10c1ae65281ec851479d5045dc";
export const CLOUDFLARE_ZONE_ID = "1649628cde7b43fc40bceaca54d02e16";
export const CLOUDFLARE_ZONE_NAME = "agorbis.com";
export const CLOUDFLARE_WORKER_NAME = "agorbis";
export const EXPECTED_CUSTOM_DOMAIN_PLACEHOLDER_IPV6 = "100::";
// v2 (D104): Resend pasó a Forge y reemplazó el MX y el SPF de
// `send.agorbis.com` por los CNAME `send` y `rsend` más un TXT de
// verificación. El hash sale de la auditoría GET-only del 01-11-2026; un
// cambio de zona que no venga de un proveedor se corrige en la zona.
export const EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION =
  "agorbis-non-web-dns-topology/2026-11-01/v2";
export const EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256 =
  "e7f8e3d420baceb49dc02b8128302bcbfd3a6713ec157607104c168d66ea257a";
export const EXPECTED_NON_WEB_DNS_RECORD_COUNT = 12;
export const EXPECTED_NON_WEB_DNS_TYPE_COUNTS = Object.freeze({
  CNAME: 5,
  MX: 2,
  TXT: 5,
});
export const EXPECTED_MAIL_CONTROL_COUNTS = Object.freeze({
  dkim: 4,
  dmarc: 1,
  mx: 2,
  spf: 1,
});

const API_ORIGIN = "https://api.cloudflare.com";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_TYPES = new Set(["A", "AAAA", "CNAME"]);

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

function normalizeDnsName(value) {
  invariant(
    typeof value === "string" && value.length > 0,
    "DNS name inválido.",
  );
  return value.toLowerCase().replace(/\.$/, "");
}

function normalizeDnsContent(value) {
  invariant(
    typeof value === "string" && value.length > 0,
    "DNS content inválido.",
  );
  return value.toLowerCase().replace(/\.$/, "");
}

function normalizeTopologyContent(record) {
  if (["CNAME", "MX", "NS"].includes(record.type)) {
    return normalizeDnsContent(record.content);
  }
  return record.content;
}

function normalizeTxtContent(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function validateRecordShape(record, index) {
  invariant(isPlainObject(record), `DNS record ${index} no es un objeto.`);
  for (const key of ["id", "name", "type", "content", "ttl", "proxied"]) {
    invariant(
      Object.hasOwn(record, key),
      `DNS record ${index} no contiene ${key}.`,
    );
  }
  invariant(
    typeof record.id === "string" && /^[a-f0-9]{32}$/i.test(record.id),
    `DNS record ${index} tiene ID inválido.`,
  );
  normalizeDnsName(record.name);
  invariant(
    typeof record.type === "string" && /^[A-Z][A-Z0-9]*$/.test(record.type),
    `DNS record ${index} tiene type inválido.`,
  );
  invariant(
    typeof record.content === "string",
    `DNS record ${index} tiene content inválido.`,
  );
  invariant(
    Number.isInteger(record.ttl) && record.ttl >= 1,
    `DNS record ${index} tiene TTL inválido.`,
  );
  invariant(
    typeof record.proxied === "boolean",
    `DNS record ${index} tiene proxied inválido.`,
  );
  if (Object.hasOwn(record, "priority")) {
    invariant(
      Number.isInteger(record.priority) && record.priority >= 0,
      `DNS record ${index} tiene priority inválida.`,
    );
  }
  if (Object.hasOwn(record, "meta")) {
    invariant(
      isPlainObject(record.meta),
      `DNS record ${index} tiene meta inválida.`,
    );
  }
  if (Object.hasOwn(record, "settings")) {
    invariant(
      isPlainObject(record.settings),
      `DNS record ${index} tiene settings inválido.`,
    );
  }
}

function sortRecords(records) {
  return [...records].sort((left, right) =>
    [left.name, left.type, left.content, left.id]
      .join("\0")
      .localeCompare(
        [right.name, right.type, right.content, right.id].join("\0"),
      ),
  );
}

function stableRecordMetadata(record) {
  if (
    !isPlainObject(record.meta) ||
    (!Object.hasOwn(record.meta, "origin_worker_id") &&
      !Object.hasOwn(record.meta, "read_only"))
  ) {
    return {};
  }
  return {
    meta: {
      originWorkerIdPresent:
        typeof record.meta.origin_worker_id === "string" &&
        record.meta.origin_worker_id.length > 0,
      readOnly: record.meta.read_only === true,
    },
  };
}

function stableRecordSettings(record) {
  if (
    !isPlainObject(record.settings) ||
    Object.keys(record.settings).length === 0
  ) {
    return {};
  }
  return { settings: canonicalize(record.settings) };
}

export function sanitizeDnsTopologyRecord(record, index = 0) {
  validateRecordShape(record, index);
  return {
    name: normalizeDnsName(record.name),
    type: record.type,
    content: normalizeTopologyContent(record),
    ttl: record.ttl,
    proxied: record.proxied,
    ...(Object.hasOwn(record, "priority") ? { priority: record.priority } : {}),
    ...stableRecordMetadata(record),
    ...stableRecordSettings(record),
  };
}

export function sanitizedDnsTopology(records) {
  invariant(Array.isArray(records), "La topología DNS no es un array.");
  return records
    .map(sanitizeDnsTopologyRecord)
    .sort((left, right) =>
      JSON.stringify(canonicalize(left)).localeCompare(
        JSON.stringify(canonicalize(right)),
      ),
    );
}

export function sanitizedDnsTopologySha256(records) {
  return sha256(canonicalJson(sanitizedDnsTopology(records)));
}

function recordTypeCounts(records) {
  return Object.fromEntries(
    [...new Set(records.map(({ type }) => type))]
      .sort()
      .map((type) => [
        type,
        records.filter((record) => record.type === type).length,
      ]),
  );
}

function mailControlCounts(records) {
  const normalized = records.map((record) => ({
    ...record,
    normalizedName: normalizeDnsName(record.name),
    normalizedTxt:
      record.type === "TXT"
        ? normalizeTxtContent(record.content).toLowerCase()
        : "",
  }));
  return {
    dkim: normalized.filter(
      ({ normalizedName, type }) =>
        normalizedName.includes("._domainkey.") &&
        ["CNAME", "TXT"].includes(type),
    ).length,
    dmarc: normalized.filter(
      ({ normalizedName, normalizedTxt, type }) =>
        normalizedName === `_dmarc.${CLOUDFLARE_ZONE_NAME}` &&
        type === "TXT" &&
        normalizedTxt.startsWith("v=dmarc1;"),
    ).length,
    mx: normalized.filter(({ type }) => type === "MX").length,
    spf: normalized.filter(
      ({ normalizedTxt, type }) =>
        type === "TXT" && normalizedTxt.startsWith("v=spf1 "),
    ).length,
  };
}

function sameCanonicalValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function matchesCustomDomainPlaceholder(record, expectedName) {
  return (
    normalizeDnsName(record.name) === expectedName &&
    record.type === "AAAA" &&
    normalizeDnsContent(record.content) ===
      EXPECTED_CUSTOM_DOMAIN_PLACEHOLDER_IPV6 &&
    record.proxied === true &&
    record.ttl === 1 &&
    isPlainObject(record.meta) &&
    record.meta.read_only === true &&
    typeof record.meta.origin_worker_id === "string" &&
    record.meta.origin_worker_id.length > 0
  );
}

export function classifyAgorbisDns(records) {
  invariant(Array.isArray(records), "El inventario DNS no es un array.");
  records.forEach(validateRecordShape);
  const ids = records.map((record) => record.id);
  invariant(
    new Set(ids).size === ids.length,
    "El inventario DNS contiene IDs duplicados.",
  );

  const webRecords = sortRecords(
    records.filter(
      (record) =>
        [CLOUDFLARE_ZONE_NAME, `www.${CLOUDFLARE_ZONE_NAME}`].includes(
          normalizeDnsName(record.name),
        ) && WEB_TYPES.has(record.type),
    ),
  );
  const nonWebRecords = sortRecords(
    records.filter((record) => !webRecords.some((web) => web.id === record.id)),
  );
  const apex = webRecords.filter(
    (record) => normalizeDnsName(record.name) === CLOUDFLARE_ZONE_NAME,
  );
  const www = webRecords.filter(
    (record) => normalizeDnsName(record.name) === `www.${CLOUDFLARE_ZONE_NAME}`,
  );
  const errors = [];

  if (
    www.length !== 1 ||
    !matchesCustomDomainPlaceholder(www[0], `www.${CLOUDFLARE_ZONE_NAME}`)
  ) {
    errors.push(
      "www debe contener exactamente el AAAA read-only y proxied de Cloudflare Custom Domains.",
    );
  }

  let apexVariant = "cloudflare-custom-domains";
  if (
    apex.length !== 1 ||
    !matchesCustomDomainPlaceholder(apex[0], CLOUDFLARE_ZONE_NAME)
  ) {
    apexVariant = "unknown";
    errors.push(
      "apex debe contener exactamente el AAAA read-only y proxied de Cloudflare Custom Domains.",
    );
  }

  const nonWebSha256 = sanitizedDnsTopologySha256(nonWebRecords);
  const nonWebTypeCounts = recordTypeCounts(nonWebRecords);
  const currentMailControlCounts = mailControlCounts(nonWebRecords);
  if (nonWebRecords.length !== EXPECTED_NON_WEB_DNS_RECORD_COUNT) {
    errors.push(
      `La topología DNS no-web debe contener exactamente ${EXPECTED_NON_WEB_DNS_RECORD_COUNT} registros.`,
    );
  }
  if (!sameCanonicalValue(nonWebTypeCounts, EXPECTED_NON_WEB_DNS_TYPE_COUNTS)) {
    errors.push(
      "La topología DNS no-web no conserva el inventario exacto de tipos.",
    );
  }
  if (
    !sameCanonicalValue(currentMailControlCounts, EXPECTED_MAIL_CONTROL_COUNTS)
  ) {
    errors.push(
      "La topología de correo no conserva la cobertura exacta de MX/SPF/DKIM/DMARC.",
    );
  }
  if (nonWebSha256 !== EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256) {
    errors.push(
      `La topología DNS no-web no coincide con ${EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION}.`,
    );
  }

  return {
    approved: errors.length === 0,
    errors,
    apexVariant,
    webRecords,
    nonWebRecords,
    webSha256: sanitizedDnsTopologySha256(webRecords),
    nonWebSha256,
    nonWebTopologyVersion: EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION,
    nonWebTypeCounts,
    mailControlCounts: currentMailControlCounts,
  };
}

function assertOutsideRepository(candidate, label) {
  const relative = path.relative(root, candidate);
  invariant(
    relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} debe quedar fuera del repositorio.`,
  );
}

export function readRestrictedToken(tokenPath) {
  invariant(
    typeof tokenPath === "string" && path.isAbsolute(tokenPath),
    "--token-file debe ser absoluto.",
  );
  const inputStat = lstatSync(tokenPath);
  invariant(
    !inputStat.isSymbolicLink(),
    "El token DNS no puede ser un symlink.",
  );
  const resolved = realpathSync(tokenPath);
  assertOutsideRepository(resolved, "El token DNS");
  const stat = lstatSync(resolved);
  invariant(stat.isFile(), "El token DNS debe ser un archivo regular.");
  invariant(
    (stat.mode & 0o777) === 0o600,
    "El token DNS debe tener permisos 0600 exactos.",
  );
  if (typeof process.getuid === "function") {
    invariant(
      stat.uid === process.getuid(),
      "El token DNS debe pertenecer al usuario actual.",
    );
  }
  invariant(stat.nlink === 1, "El token DNS no puede tener hard links.");
  const token = readFileSync(resolved, "utf8").trim();
  invariant(
    token.length >= 20 && token.length <= 512,
    "El token DNS no tiene una longitud válida.",
  );
  invariant(
    !/[\r\n\0]/.test(token),
    "El token DNS contiene caracteres no permitidos.",
  );
  return token;
}

function validateApiEnvelope(payload, label) {
  invariant(isPlainObject(payload), `${label}: respuesta API inválida.`);
  invariant(
    payload.success === true,
    `${label}: Cloudflare rechazó la solicitud.`,
  );
  invariant(
    Array.isArray(payload.errors) && payload.errors.length === 0,
    `${label}: Cloudflare devolvió errores.`,
  );
  invariant(Array.isArray(payload.messages), `${label}: messages inválido.`);
  invariant(Array.isArray(payload.result), `${label}: result inválido.`);
  invariant(
    isPlainObject(payload.result_info),
    `${label}: result_info inválido.`,
  );
  for (const key of [
    "page",
    "per_page",
    "count",
    "total_count",
    "total_pages",
  ]) {
    invariant(
      Number.isInteger(payload.result_info[key]),
      `${label}: result_info.${key} inválido.`,
    );
  }
}

export async function fetchAllDnsRecords({ token, fetchImpl = fetch }) {
  invariant(
    typeof token === "string" && token.length >= 20,
    "Token DNS inválido.",
  );
  const records = [];
  let page = 1;
  let expectedTotal;
  while (true) {
    const url = new URL(
      `/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      API_ORIGIN,
    );
    url.search = new URLSearchParams({
      page: String(page),
      per_page: "100",
      order: "name",
      direction: "asc",
    }).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error("No se pudo consultar Cloudflare DNS.");
    }
    invariant(
      response?.ok === true,
      `Cloudflare DNS respondió HTTP ${response?.status ?? "desconocido"}.`,
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Cloudflare DNS devolvió JSON inválido.");
    }
    validateApiEnvelope(payload, `Cloudflare DNS página ${page}`);
    invariant(
      payload.result_info.page === page,
      "Cloudflare DNS devolvió una página inesperada.",
    );
    invariant(
      payload.result_info.count === payload.result.length,
      "Cloudflare DNS count no coincide.",
    );
    expectedTotal ??= payload.result_info.total_count;
    invariant(
      payload.result_info.total_count === expectedTotal,
      "Cloudflare DNS cambió durante la paginación.",
    );
    payload.result.forEach(validateRecordShape);
    records.push(...payload.result);
    if (page === payload.result_info.total_pages) break;
    invariant(
      page < payload.result_info.total_pages,
      "Cloudflare DNS total_pages inválido.",
    );
    page += 1;
  }
  invariant(
    records.length === expectedTotal,
    "Cloudflare DNS total_count no coincide con el inventario.",
  );
  return sortRecords(records);
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function persistDnsAudit({ records, outputRoot, now = timestamp() }) {
  invariant(path.isAbsolute(outputRoot), "--output-root debe ser absoluto.");
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  chmodSync(outputRoot, 0o700);
  const resolvedRoot = realpathSync(outputRoot);
  assertOutsideRepository(resolvedRoot, "El archivo de auditoría DNS");
  const outputDirectory = path.join(resolvedRoot, now);
  mkdirSync(outputDirectory, { mode: 0o700 });
  const classification = classifyAgorbisDns(records);
  const snapshot = canonicalJson({
    version: 1,
    accountId: CLOUDFLARE_ACCOUNT_ID,
    zoneId: CLOUDFLARE_ZONE_ID,
    zoneName: CLOUDFLARE_ZONE_NAME,
    capturedAt: new Date().toISOString(),
    records,
  });
  const snapshotPath = path.join(outputDirectory, "dns-before.json");
  writeFileSync(snapshotPath, snapshot, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  const manifest = canonicalJson({
    version: 2,
    snapshotFile: "dns-before.json",
    snapshotSha256: sha256(snapshot),
    recordCount: records.length,
    approvedForCutover: classification.approved,
    classificationErrors: classification.errors,
    apexVariant: classification.apexVariant,
    webRecordCount: classification.webRecords.length,
    webSha256: classification.webSha256,
    nonWebTopologyVersion: classification.nonWebTopologyVersion,
    nonWebSha256: classification.nonWebSha256,
    nonWebTypeCounts: classification.nonWebTypeCounts,
    mailControlCounts: classification.mailControlCounts,
  });
  const manifestPath = path.join(outputDirectory, "dns-audit-manifest.json");
  writeFileSync(manifestPath, manifest, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  return {
    classification,
    manifestPath,
    outputDirectory,
    snapshotPath,
    snapshotSha256: sha256(snapshot),
  };
}

function parseArguments(arguments_) {
  const result = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const name = arguments_[index];
    invariant(
      ["--token-file", "--output-root"].includes(name),
      `Argumento no permitido: ${name}.`,
    );
    invariant(!Object.hasOwn(result, name), `Argumento duplicado: ${name}.`);
    const value = arguments_[index + 1];
    invariant(
      typeof value === "string" && !value.startsWith("--"),
      `Falta valor para ${name}.`,
    );
    result[name] = value;
    index += 1;
  }
  invariant(
    Object.keys(result).length === 2,
    "Se requieren --token-file y --output-root.",
  );
  return result;
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const token = readRestrictedToken(path.resolve(arguments_["--token-file"]));
  const records = await fetchAllDnsRecords({ token });
  const audit = persistDnsAudit({
    records,
    outputRoot: path.resolve(arguments_["--output-root"]),
  });
  console.log(
    `Auditoría DNS guardada fuera del repositorio: ${audit.outputDirectory}`,
  );
  console.log(`DNS snapshot SHA-256: ${audit.snapshotSha256}`);
  console.log(
    `Registros: ${records.length}; web Custom Domains: ${audit.classification.webRecords.length}.`,
  );
  if (!audit.classification.approved) {
    console.error("Auditoría DNS: BLOQUEADA");
    for (const error of audit.classification.errors)
      console.error(`  ✗ ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Auditoría DNS: PASS (${audit.classification.apexVariant}; ${audit.classification.nonWebTopologyVersion}; non-web SHA-256 ${audit.classification.nonWebSha256}).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Auditoría DNS falló.",
    );
    process.exitCode = 1;
  });
}
