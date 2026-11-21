#!/usr/bin/env node

import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_WORKER_NAME,
  CLOUDFLARE_ZONE_ID,
  CLOUDFLARE_ZONE_NAME,
  canonicalJson,
  classifyAgorbisDns,
  fetchAllDnsRecords,
  readRestrictedToken,
  sha256,
} from "./cloudflare-dns-audit.mjs";
import { loadWranglerOAuthToken } from "./cloudflare-closed-state.mjs";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const HOSTNAMES = Object.freeze([
  CLOUDFLARE_ZONE_NAME,
  `www.${CLOUDFLARE_ZONE_NAME}`,
]);
const WEB_TYPES = new Set(["A", "AAAA", "CNAME"]);
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const IPV4_PLACEHOLDER = "192.0.2.0";
const IPV4_PLACEHOLDER_COMMENT =
  "Agorbis Workers Custom Domain IPv4 compatibility";
const CONFIRMATIONS = Object.freeze({
  "delete-dns": "DELETE_EXACT_VERCEL_DNS",
  "reconcile-deleted-dns": "RECONCILE_EXACT_DELETED_DNS",
  "restore-dns": "RESTORE_EXACT_VERCEL_DNS",
  "create-ipv4-placeholder": "CREATE_CLOUDFLARE_IPV4_PLACEHOLDER",
  "delete-ipv4-placeholder": "DELETE_CLOUDFLARE_IPV4_PLACEHOLDER",
  "attach-domain": "ATTACH_CLOSED_WORKER_DOMAIN",
  "detach-domain": "DETACH_CLOSED_WORKER_DOMAIN",
  "disable-workers-dev": "DISABLE_CLOSED_WORKERS_DEV",
  "verify-non-web": "READ_ONLY",
});

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

function normalizeName(value) {
  return String(value).toLowerCase().replace(/\.$/, "");
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertRestrictedFile(filePath, label) {
  invariant(path.isAbsolute(filePath), `${label} debe ser absoluto.`);
  const stat = lstatSync(filePath);
  invariant(
    stat.isFile() && !stat.isSymbolicLink(),
    `${label} debe ser un archivo regular.`,
  );
  invariant(
    (stat.mode & 0o777) === 0o600,
    `${label} debe tener permisos 0600.`,
  );
  if (typeof process.getuid === "function") {
    invariant(
      stat.uid === process.getuid(),
      `${label} debe pertenecer al usuario actual.`,
    );
  }
}

export function loadDnsSnapshot(snapshotDirectory) {
  invariant(
    path.isAbsolute(snapshotDirectory),
    "--snapshot-dir debe ser absoluto.",
  );
  const relative = path.relative(repositoryRoot, snapshotDirectory);
  invariant(
    relative.startsWith("..") && !path.isAbsolute(relative),
    "--snapshot-dir debe quedar fuera del repositorio.",
  );
  const directoryStat = lstatSync(snapshotDirectory);
  invariant(
    directoryStat.isDirectory() &&
      !directoryStat.isSymbolicLink() &&
      (directoryStat.mode & 0o777) === 0o700,
    "--snapshot-dir debe ser un directorio regular con permisos 0700.",
  );
  if (typeof process.getuid === "function") {
    invariant(
      directoryStat.uid === process.getuid(),
      "--snapshot-dir debe pertenecer al usuario actual.",
    );
  }
  const snapshotPath = path.join(snapshotDirectory, "dns-before.json");
  const manifestPath = path.join(snapshotDirectory, "dns-audit-manifest.json");
  assertRestrictedFile(snapshotPath, "dns-before.json");
  assertRestrictedFile(manifestPath, "dns-audit-manifest.json");
  const snapshotRaw = readFileSync(snapshotPath, "utf8");
  const manifestRaw = readFileSync(manifestPath, "utf8");
  let snapshot;
  let manifest;
  try {
    snapshot = JSON.parse(snapshotRaw);
    manifest = JSON.parse(manifestRaw);
  } catch {
    throw new Error("El snapshot DNS no contiene JSON válido.");
  }
  invariant(
    isPlainObject(snapshot) && snapshot.version === 1,
    "dns-before.json tiene versión inválida.",
  );
  invariant(
    isPlainObject(manifest) && manifest.version === 1,
    "dns-audit-manifest.json tiene versión inválida.",
  );
  invariant(
    snapshot.accountId === CLOUDFLARE_ACCOUNT_ID,
    "El snapshot pertenece a otra cuenta.",
  );
  invariant(
    snapshot.zoneId === CLOUDFLARE_ZONE_ID,
    "El snapshot pertenece a otra zona.",
  );
  invariant(
    snapshot.zoneName === CLOUDFLARE_ZONE_NAME,
    "El snapshot pertenece a otro dominio.",
  );
  invariant(
    manifest.snapshotSha256 === sha256(snapshotRaw),
    "El SHA-256 del snapshot DNS no coincide.",
  );
  invariant(
    manifest.approvedForCutover === true,
    "El snapshot no fue aprobado para cutover.",
  );
  invariant(
    Array.isArray(snapshot.records),
    "El snapshot DNS no contiene records.",
  );
  invariant(
    manifest.recordCount === snapshot.records.length,
    "El conteo del snapshot DNS no coincide.",
  );
  const classification = classifyAgorbisDns(snapshot.records);
  invariant(
    classification.approved,
    "El snapshot DNS ya no pasa la clasificación Vercel.",
  );
  invariant(
    classification.webSha256 === manifest.webSha256,
    "El hash web del snapshot DNS no coincide.",
  );
  invariant(
    classification.nonWebSha256 === manifest.nonWebSha256,
    "El hash no web del snapshot DNS no coincide.",
  );
  invariant(
    sameCanonical(
      classification.webRecords.map((record) => record.id),
      manifest.webRecordIds,
    ),
    "Los IDs web del snapshot DNS no coinciden.",
  );
  return { classification, manifest, snapshot, snapshotDirectory };
}

function dnsRecordForHostname(snapshotState, hostname) {
  const records = snapshotState.classification.webRecords.filter(
    (record) => normalizeName(record.name) === hostname,
  );
  invariant(
    records.length === 1 && records[0].type === "CNAME",
    `El snapshot no contiene un único CNAME para ${hostname}.`,
  );
  return records[0];
}

function nonWebHash(records) {
  return classifyAgorbisDns(records).nonWebSha256;
}

function webAtHostname(records, hostname) {
  return records.filter(
    (record) =>
      normalizeName(record.name) === hostname && WEB_TYPES.has(record.type),
  );
}

function validateNonWeb(records, snapshotState) {
  invariant(
    nonWebHash(records) === snapshotState.manifest.nonWebSha256,
    "Cambió al menos un registro DNS no web; cutover abortado.",
  );
}

function validateOriginalTarget(records, snapshotState, hostname) {
  const expected = dnsRecordForHostname(snapshotState, hostname);
  const actual = webAtHostname(records, hostname);
  invariant(
    actual.length === 1 && sameCanonical(actual[0], expected),
    `${hostname} cambió respecto del snapshot autenticado.`,
  );
  return expected;
}

function validateOtherOriginalBeforeApex(records, snapshotState, hostname) {
  if (hostname !== CLOUDFLARE_ZONE_NAME) return;
  validateOriginalTarget(records, snapshotState, `www.${CLOUDFLARE_ZONE_NAME}`);
}

async function fetchCloudflareJson({
  token,
  endpoint,
  method = "GET",
  body,
  allowEmptySuccess = false,
  fetchImpl = fetch,
}) {
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${endpoint}`, {
      method,
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Cloudflare API no pudo completar ${method} ${endpoint}.`);
  }
  invariant(
    response instanceof Response,
    "Cloudflare API no devolvió una respuesta HTTP válida.",
  );
  if (
    allowEmptySuccess &&
    response.status >= 200 &&
    response.status < 300 &&
    response.status === 204
  ) {
    return null;
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    invariant(
      /^\d+$/.test(declaredLength) &&
        Number(declaredLength) <= MAX_RESPONSE_BYTES,
      "Cloudflare API devolvió un Content-Length inválido.",
    );
  }
  const text = await response.text();
  invariant(
    text.length > 0 && Buffer.byteLength(text, "utf8") <= MAX_RESPONSE_BYTES,
    "Cloudflare API devolvió un body inválido.",
  );
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Cloudflare API devolvió JSON inválido.");
  }
  invariant(
    isPlainObject(payload),
    "Cloudflare API no devolvió un objeto JSON.",
  );
  if (response.status < 200 || response.status >= 300) {
    const details = Array.isArray(payload.errors)
      ? payload.errors
          .slice(0, 3)
          .map((error) => {
            const code = Number.isInteger(error?.code) ? error.code : "?";
            const rawMessage =
              typeof error?.message === "string"
                ? error.message
                : "sin detalle";
            const message = rawMessage
              .replaceAll(token, "[redacted]")
              .replace(/cf(?:ut|at|k)_[A-Za-z0-9_-]+/g, "[redacted]")
              .slice(0, 300);
            return `${code}: ${message}`;
          })
          .join(" | ")
      : "sin detalle";
    throw new Error(
      `Cloudflare API rechazó ${method} ${endpoint} con HTTP ${response.status} (${details}).`,
    );
  }
  invariant(payload.success === true, "Cloudflare API no indicó success=true.");
  invariant(
    (payload.errors === null ||
      (Array.isArray(payload.errors) && payload.errors.length === 0)) &&
      (payload.messages === null ||
        (Array.isArray(payload.messages) && payload.messages.length === 0)),
    "Cloudflare API devolvió errores o mensajes inválidos.",
  );
  return payload.result;
}

async function getDnsRecord(token, id, fetchImpl) {
  const result = await fetchCloudflareJson({
    token,
    endpoint: `/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${id}`,
    fetchImpl,
  });
  invariant(isPlainObject(result), "GET DNS record no devolvió un registro.");
  return result;
}

async function fetchDnsAfterMutation({ token, fetchImpl, sleepImpl = wait }) {
  const maximumAttempts = 6;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await fetchAllDnsRecords({ token, fetchImpl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const transient = [
        "Cloudflare DNS total_count no coincide con el inventario.",
        "Cloudflare DNS cambió durante la paginación.",
      ].includes(message);
      if (!transient || attempt === maximumAttempts) throw error;
      await sleepImpl(attempt * 250);
    }
  }
  throw new Error(
    "Cloudflare DNS no alcanzó consistencia después de la mutación.",
  );
}

function appendJournal(snapshotDirectory, entry) {
  const journalPath = path.join(snapshotDirectory, "cutover-journal.ndjson");
  appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "a",
  });
  return journalPath;
}

export async function deleteExactVercelDns({
  hostname,
  snapshotDirectory,
  dnsToken,
  fetchImpl = fetch,
  sleepImpl = wait,
}) {
  invariant(HOSTNAMES.includes(hostname), "Hostname de cutover no permitido.");
  const snapshotState = loadDnsSnapshot(snapshotDirectory);
  const before = await fetchAllDnsRecords({ token: dnsToken, fetchImpl });
  validateNonWeb(before, snapshotState);
  const expected = validateOriginalTarget(before, snapshotState, hostname);
  validateOtherOriginalBeforeApex(before, snapshotState, hostname);
  const fresh = await getDnsRecord(dnsToken, expected.id, fetchImpl);
  invariant(
    sameCanonical(fresh, expected),
    `${hostname} cambió durante el gate TOCTOU.`,
  );
  const result = await fetchCloudflareJson({
    token: dnsToken,
    endpoint: `/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${expected.id}`,
    method: "DELETE",
    fetchImpl,
  });
  invariant(
    isPlainObject(result) && result.id === expected.id,
    "Cloudflare no confirmó el ID DNS eliminado.",
  );
  const after = await fetchDnsAfterMutation({
    token: dnsToken,
    fetchImpl,
    sleepImpl,
  });
  validateNonWeb(after, snapshotState);
  invariant(
    webAtHostname(after, hostname).length === 0,
    `${hostname} todavía conserva un registro web.`,
  );
  appendJournal(snapshotDirectory, {
    action: "delete-dns",
    at: new Date().toISOString(),
    hostname,
    recordId: expected.id,
    nonWebSha256: snapshotState.manifest.nonWebSha256,
  });
  return { hostname, recordId: expected.id };
}

export async function reconcileDeletedVercelDns({
  hostname,
  snapshotDirectory,
  dnsToken,
  fetchImpl = fetch,
}) {
  invariant(
    HOSTNAMES.includes(hostname),
    "Hostname de reconcile no permitido.",
  );
  const snapshotState = loadDnsSnapshot(snapshotDirectory);
  const expected = dnsRecordForHostname(snapshotState, hostname);
  const current = await fetchAllDnsRecords({ token: dnsToken, fetchImpl });
  validateNonWeb(current, snapshotState);
  invariant(
    webAtHostname(current, hostname).length === 0,
    `${hostname} todavía contiene un registro web; reconcile abortado.`,
  );
  validateOtherOriginalBeforeApex(current, snapshotState, hostname);
  appendJournal(snapshotDirectory, {
    action: "delete-dns-reconciled",
    at: new Date().toISOString(),
    hostname,
    recordId: expected.id,
    nonWebSha256: snapshotState.manifest.nonWebSha256,
  });
  return { hostname, recordId: expected.id };
}

function restorePayload(record) {
  return Object.fromEntries(
    [
      "type",
      "name",
      "content",
      "ttl",
      "proxied",
      "priority",
      "data",
      "comment",
      "tags",
      "settings",
    ]
      .filter((key) => Object.hasOwn(record, key))
      .map((key) => [key, record[key]]),
  );
}

export async function restoreExactVercelDns({
  hostname,
  snapshotDirectory,
  dnsToken,
  fetchImpl = fetch,
  sleepImpl = wait,
}) {
  invariant(HOSTNAMES.includes(hostname), "Hostname de rollback no permitido.");
  const snapshotState = loadDnsSnapshot(snapshotDirectory);
  const expected = dnsRecordForHostname(snapshotState, hostname);
  const before = await fetchAllDnsRecords({ token: dnsToken, fetchImpl });
  validateNonWeb(before, snapshotState);
  invariant(
    webAtHostname(before, hostname).length === 0,
    `${hostname} todavía contiene un registro web; no se puede restaurar.`,
  );
  const result = await fetchCloudflareJson({
    token: dnsToken,
    endpoint: `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
    method: "POST",
    body: restorePayload(expected),
    fetchImpl,
  });
  invariant(
    isPlainObject(result),
    "Cloudflare no devolvió el registro restaurado.",
  );
  const after = await fetchDnsAfterMutation({
    token: dnsToken,
    fetchImpl,
    sleepImpl,
  });
  validateNonWeb(after, snapshotState);
  const restored = webAtHostname(after, hostname);
  invariant(
    restored.length === 1,
    `${hostname} no quedó restaurado exactamente una vez.`,
  );
  for (const key of [
    "name",
    "type",
    "content",
    "ttl",
    "proxied",
    "comment",
    "tags",
    "settings",
  ]) {
    invariant(
      sameCanonical(restored[0][key], expected[key]),
      `${hostname} no preservó ${key} durante rollback.`,
    );
  }
  appendJournal(snapshotDirectory, {
    action: "restore-dns",
    at: new Date().toISOString(),
    hostname,
    originalRecordId: expected.id,
    restoredRecordId: result.id,
    nonWebSha256: snapshotState.manifest.nonWebSha256,
  });
  return { hostname, restoredRecordId: result.id };
}

function validateManagedCustomDomainRecord(records, hostname) {
  const managed = records.filter(
    (record) =>
      normalizeName(record.name) === hostname &&
      record.type === "AAAA" &&
      record.content === "100::" &&
      record.proxied === true &&
      isPlainObject(record.meta) &&
      record.meta.read_only === true &&
      typeof record.meta.origin_worker_id === "string" &&
      record.meta.origin_worker_id.length > 0,
  );
  invariant(
    managed.length === 1,
    `${hostname} no contiene exactamente el AAAA administrado del Custom Domain.`,
  );
  return managed[0];
}

function findIpv4Placeholder(records, hostname) {
  return records.filter(
    (record) =>
      normalizeName(record.name) === hostname &&
      record.type === "A" &&
      record.content === IPV4_PLACEHOLDER &&
      record.proxied === true &&
      record.ttl === 1 &&
      record.comment === IPV4_PLACEHOLDER_COMMENT,
  );
}

export async function createIpv4Placeholder({
  hostname,
  snapshotDirectory,
  dnsToken,
  fetchImpl = fetch,
  sleepImpl = wait,
}) {
  invariant(
    HOSTNAMES.includes(hostname),
    "Hostname de placeholder no permitido.",
  );
  const snapshotState = loadDnsSnapshot(snapshotDirectory);
  const before = await fetchAllDnsRecords({ token: dnsToken, fetchImpl });
  validateNonWeb(before, snapshotState);
  validateManagedCustomDomainRecord(before, hostname);
  invariant(
    findIpv4Placeholder(before, hostname).length === 0,
    `${hostname} ya contiene el placeholder IPv4.`,
  );
  const otherWeb = webAtHostname(before, hostname).filter(
    (record) => record.type !== "AAAA",
  );
  invariant(
    otherWeb.length === 0,
    `${hostname} contiene un registro web adicional antes del placeholder.`,
  );
  const result = await fetchCloudflareJson({
    token: dnsToken,
    endpoint: `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
    method: "POST",
    body: {
      type: "A",
      name: hostname,
      content: IPV4_PLACEHOLDER,
      ttl: 1,
      proxied: true,
      comment: IPV4_PLACEHOLDER_COMMENT,
    },
    fetchImpl,
  });
  invariant(
    isPlainObject(result) &&
      result.name === hostname &&
      result.type === "A" &&
      result.content === IPV4_PLACEHOLDER &&
      result.proxied === true,
    "Cloudflare no confirmó el placeholder IPv4 exacto.",
  );
  const after = await fetchDnsAfterMutation({
    token: dnsToken,
    fetchImpl,
    sleepImpl,
  });
  validateNonWeb(after, snapshotState);
  validateManagedCustomDomainRecord(after, hostname);
  const placeholders = findIpv4Placeholder(after, hostname);
  invariant(
    placeholders.length === 1 && placeholders[0].id === result.id,
    `${hostname} no contiene exactamente el placeholder IPv4 creado.`,
  );
  appendJournal(snapshotDirectory, {
    action: "create-ipv4-placeholder",
    at: new Date().toISOString(),
    hostname,
    recordId: result.id,
    nonWebSha256: snapshotState.manifest.nonWebSha256,
  });
  return { hostname, recordId: result.id };
}

export async function deleteIpv4Placeholder({
  hostname,
  snapshotDirectory,
  dnsToken,
  fetchImpl = fetch,
  sleepImpl = wait,
}) {
  invariant(
    HOSTNAMES.includes(hostname),
    "Hostname de rollback del placeholder no permitido.",
  );
  const snapshotState = loadDnsSnapshot(snapshotDirectory);
  const before = await fetchAllDnsRecords({ token: dnsToken, fetchImpl });
  validateNonWeb(before, snapshotState);
  const placeholders = findIpv4Placeholder(before, hostname);
  invariant(
    placeholders.length === 1,
    `${hostname} no contiene exactamente un placeholder IPv4.`,
  );
  const fresh = await getDnsRecord(dnsToken, placeholders[0].id, fetchImpl);
  invariant(
    sameCanonical(fresh, placeholders[0]),
    `${hostname} cambió durante el gate TOCTOU del placeholder.`,
  );
  const result = await fetchCloudflareJson({
    token: dnsToken,
    endpoint: `/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${placeholders[0].id}`,
    method: "DELETE",
    fetchImpl,
  });
  invariant(
    isPlainObject(result) && result.id === placeholders[0].id,
    "Cloudflare no confirmó el placeholder IPv4 eliminado.",
  );
  const after = await fetchDnsAfterMutation({
    token: dnsToken,
    fetchImpl,
    sleepImpl,
  });
  validateNonWeb(after, snapshotState);
  invariant(
    findIpv4Placeholder(after, hostname).length === 0,
    `${hostname} todavía conserva el placeholder IPv4.`,
  );
  appendJournal(snapshotDirectory, {
    action: "delete-ipv4-placeholder",
    at: new Date().toISOString(),
    hostname,
    recordId: placeholders[0].id,
    nonWebSha256: snapshotState.manifest.nonWebSha256,
  });
  return { hostname, recordId: placeholders[0].id };
}

async function listWorkerDomains(oauthToken, fetchImpl = fetch) {
  const result = await fetchCloudflareJson({
    token: oauthToken,
    endpoint: `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/domains?zone_id=${CLOUDFLARE_ZONE_ID}&per_page=100`,
    fetchImpl,
  });
  invariant(
    Array.isArray(result),
    "Cloudflare no devolvió un inventario de Custom Domains.",
  );
  for (const domain of result) {
    invariant(
      isPlainObject(domain) &&
        typeof domain.id === "string" &&
        HOSTNAMES.includes(domain.hostname) &&
        domain.service === CLOUDFLARE_WORKER_NAME &&
        domain.zone_id === CLOUDFLARE_ZONE_ID &&
        domain.zone_name === CLOUDFLARE_ZONE_NAME,
      "Cloudflare contiene un Custom Domain desconocido en la zona Agorbis.",
    );
  }
  invariant(
    new Set(result.map((domain) => domain.hostname)).size === result.length,
    "Cloudflare contiene Custom Domains duplicados.",
  );
  return result;
}

function expectedBeforeAttach(hostname) {
  return hostname === CLOUDFLARE_ZONE_NAME ? [] : [CLOUDFLARE_ZONE_NAME];
}

function sameHostnames(domains, expected) {
  return sameCanonical(
    domains.map((domain) => domain.hostname).sort(),
    [...expected].sort(),
  );
}

export async function attachClosedWorkerDomain({
  hostname,
  oauthToken,
  fetchImpl = fetch,
}) {
  invariant(HOSTNAMES.includes(hostname), "Custom Domain no permitido.");
  const before = await listWorkerDomains(oauthToken, fetchImpl);
  invariant(
    sameHostnames(before, expectedBeforeAttach(hostname)),
    `Estado previo de Custom Domains inesperado para ${hostname}.`,
  );
  const result = await fetchCloudflareJson({
    token: oauthToken,
    endpoint: `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/domains`,
    method: "PUT",
    body: {
      hostname,
      service: CLOUDFLARE_WORKER_NAME,
      zone_id: CLOUDFLARE_ZONE_ID,
      zone_name: CLOUDFLARE_ZONE_NAME,
    },
    fetchImpl,
  });
  invariant(
    isPlainObject(result) &&
      result.hostname === hostname &&
      result.service === CLOUDFLARE_WORKER_NAME &&
      result.zone_id === CLOUDFLARE_ZONE_ID &&
      result.zone_name === CLOUDFLARE_ZONE_NAME,
    "Cloudflare no confirmó el Custom Domain esperado.",
  );
  const after = await listWorkerDomains(oauthToken, fetchImpl);
  invariant(
    sameHostnames(after, [...expectedBeforeAttach(hostname), hostname]),
    "El inventario posterior de Custom Domains no coincide.",
  );
  return { domainId: result.id, hostname };
}

export async function detachClosedWorkerDomain({
  hostname,
  oauthToken,
  fetchImpl = fetch,
}) {
  invariant(
    HOSTNAMES.includes(hostname),
    "Custom Domain de rollback no permitido.",
  );
  const before = await listWorkerDomains(oauthToken, fetchImpl);
  const domain = before.find((entry) => entry.hostname === hostname);
  invariant(domain, `No existe el Custom Domain ${hostname}.`);
  const result = await fetchCloudflareJson({
    token: oauthToken,
    endpoint: `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/domains/${domain.id}`,
    method: "DELETE",
    allowEmptySuccess: true,
    fetchImpl,
  });
  invariant(
    result === null || isPlainObject(result),
    "Cloudflare no confirmó el detach del Custom Domain.",
  );
  const after = await listWorkerDomains(oauthToken, fetchImpl);
  invariant(
    !after.some((entry) => entry.hostname === hostname),
    `${hostname} continúa adjunto al Worker.`,
  );
  return { domainId: domain.id, hostname };
}

export async function disableWorkersDev({ oauthToken, fetchImpl = fetch }) {
  const result = await fetchCloudflareJson({
    token: oauthToken,
    endpoint: `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${CLOUDFLARE_WORKER_NAME}/subdomain`,
    method: "POST",
    body: { enabled: false, previews_enabled: false },
    fetchImpl,
  });
  invariant(
    isPlainObject(result) &&
      result.enabled === false &&
      result.previews_enabled === false,
    "Cloudflare no confirmó workers.dev y previews deshabilitados.",
  );
  return result;
}

function parseArguments(argv) {
  invariant(
    Array.isArray(argv) && argv.length > 0,
    "Falta la acción de cutover.",
  );
  const action = argv[0];
  invariant(
    Object.hasOwn(CONFIRMATIONS, action),
    "Acción de cutover no permitida.",
  );
  const allowed = new Set([
    "--hostname",
    "--snapshot-dir",
    "--dns-token-file",
    "--confirm",
  ]);
  const parsed = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    invariant(
      allowed.has(name) && typeof value === "string" && !value.startsWith("--"),
      "Argumentos de cutover inválidos.",
    );
    invariant(!Object.hasOwn(parsed, name), `Argumento duplicado: ${name}.`);
    parsed[name] = value;
  }
  invariant(
    parsed["--confirm"] === CONFIRMATIONS[action],
    "Falta la confirmación literal de la acción.",
  );
  if (
    [
      "delete-dns",
      "reconcile-deleted-dns",
      "restore-dns",
      "create-ipv4-placeholder",
      "delete-ipv4-placeholder",
      "attach-domain",
      "detach-domain",
    ].includes(action)
  ) {
    invariant(
      HOSTNAMES.includes(parsed["--hostname"]),
      "Falta un hostname exacto permitido.",
    );
  }
  if (
    [
      "delete-dns",
      "reconcile-deleted-dns",
      "restore-dns",
      "create-ipv4-placeholder",
      "delete-ipv4-placeholder",
      "verify-non-web",
    ].includes(action)
  ) {
    invariant(
      typeof parsed["--snapshot-dir"] === "string",
      "Falta --snapshot-dir.",
    );
    invariant(
      typeof parsed["--dns-token-file"] === "string",
      "Falta --dns-token-file.",
    );
  }
  return parsed;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  const hostname = parsed["--hostname"];
  if (
    [
      "delete-dns",
      "reconcile-deleted-dns",
      "restore-dns",
      "create-ipv4-placeholder",
      "delete-ipv4-placeholder",
      "verify-non-web",
    ].includes(parsed.action)
  ) {
    const token = readRestrictedToken(path.resolve(parsed["--dns-token-file"]));
    const snapshotDirectory = path.resolve(parsed["--snapshot-dir"]);
    if (parsed.action === "delete-dns") {
      const result = await deleteExactVercelDns({
        hostname,
        snapshotDirectory,
        dnsToken: token,
      });
      console.log(
        `DNS Vercel eliminado de forma exacta: ${result.hostname} (${result.recordId}).`,
      );
      return;
    }
    if (parsed.action === "reconcile-deleted-dns") {
      const result = await reconcileDeletedVercelDns({
        hostname,
        snapshotDirectory,
        dnsToken: token,
      });
      console.log(
        `DELETE DNS reconciliado sin repetirlo: ${result.hostname} (${result.recordId}).`,
      );
      return;
    }
    if (parsed.action === "restore-dns") {
      const result = await restoreExactVercelDns({
        hostname,
        snapshotDirectory,
        dnsToken: token,
      });
      console.log(
        `DNS Vercel restaurado: ${result.hostname} (${result.restoredRecordId}).`,
      );
      return;
    }
    if (parsed.action === "create-ipv4-placeholder") {
      const result = await createIpv4Placeholder({
        hostname,
        snapshotDirectory,
        dnsToken: token,
      });
      console.log(
        `Placeholder IPv4 proxied creado: ${result.hostname} (${result.recordId}).`,
      );
      return;
    }
    if (parsed.action === "delete-ipv4-placeholder") {
      const result = await deleteIpv4Placeholder({
        hostname,
        snapshotDirectory,
        dnsToken: token,
      });
      console.log(
        `Placeholder IPv4 eliminado: ${result.hostname} (${result.recordId}).`,
      );
      return;
    }
    const snapshotState = loadDnsSnapshot(snapshotDirectory);
    const current = await fetchAllDnsRecords({ token });
    validateNonWeb(current, snapshotState);
    console.log(`DNS no web intacto: ${snapshotState.manifest.nonWebSha256}.`);
    return;
  }

  const oauthToken = await loadWranglerOAuthToken();
  if (parsed.action === "attach-domain") {
    const result = await attachClosedWorkerDomain({ hostname, oauthToken });
    console.log(
      `Custom Domain adjunto al Worker cerrado: ${result.hostname} (${result.domainId}).`,
    );
    return;
  }
  if (parsed.action === "detach-domain") {
    const result = await detachClosedWorkerDomain({ hostname, oauthToken });
    console.log(
      `Custom Domain desacoplado: ${result.hostname} (${result.domainId}).`,
    );
    return;
  }
  await disableWorkersDev({ oauthToken });
  console.log("workers.dev y Preview URLs deshabilitados para agorbis.");
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Cutover Cloudflare falló.",
    );
    process.exitCode = 1;
  });
}
