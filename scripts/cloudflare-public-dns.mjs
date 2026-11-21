#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { setTimeout as wait } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const CLOUDFLARE_IPS_ENDPOINT = "https://api.cloudflare.com/client/v4/ips";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const OBSERVATION_DELAY_MS = 5_000;
const HOSTNAMES = Object.freeze(["agorbis.com", "www.agorbis.com"]);
const DNS_TYPES = Object.freeze({ A: 1, CNAME: 5, AAAA: 28, HTTPS: 65 });
const RESOLVERS = Object.freeze([
  {
    name: "cloudflare",
    endpoint: "https://cloudflare-dns.com/dns-query",
  },
  { name: "google", endpoint: "https://dns.google/dns-query" },
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

function normalizeHostname(value) {
  return String(value).toLowerCase().replace(/\.$/, "");
}

export function encodeDnsName(hostname) {
  invariant(
    typeof hostname === "string" && hostname.length > 0,
    "Hostname DNS inválido.",
  );
  const bytes = [];
  for (const label of normalizeHostname(hostname).split(".")) {
    invariant(
      label.length > 0 && label.length <= 63 && /^[a-z0-9-]+$/.test(label),
      "Hostname DNS contiene un label inválido.",
    );
    const encoded = new TextEncoder().encode(label);
    bytes.push(encoded.byteLength, ...encoded);
  }
  bytes.push(0);
  invariant(bytes.length <= 255, "Hostname DNS demasiado largo.");
  return new Uint8Array(bytes);
}

export function buildDnsQuery({ hostname, queryType, id }) {
  invariant(HOSTNAMES.includes(hostname), "Hostname DNS no permitido.");
  invariant(Object.hasOwn(DNS_TYPES, queryType), "Tipo DNS no permitido.");
  invariant(
    Number.isInteger(id) && id >= 0 && id <= 0xffff,
    "DNS ID inválido.",
  );
  const qname = encodeDnsName(hostname);
  const bytes = new Uint8Array(12 + qname.byteLength + 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, id);
  view.setUint16(2, 0x0100);
  view.setUint16(4, 1);
  bytes.set(qname, 12);
  view.setUint16(12 + qname.byteLength, DNS_TYPES[queryType]);
  view.setUint16(14 + qname.byteLength, 1);
  return bytes;
}

function readDnsName(bytes, initialOffset) {
  invariant(
    Number.isInteger(initialOffset) &&
      initialOffset >= 0 &&
      initialOffset < bytes.length,
    "Offset DNS name inválido.",
  );
  const labels = [];
  const pointers = new Set();
  let offset = initialOffset;
  let nextOffset;
  let encodedLength = 1;
  for (let steps = 0; steps < 128; steps += 1) {
    invariant(offset < bytes.length, "DNS name truncado.");
    const length = bytes[offset];
    if (length === 0) {
      nextOffset ??= offset + 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      invariant(offset + 1 < bytes.length, "Puntero DNS truncado.");
      const pointer = ((length & 0x3f) << 8) | bytes[offset + 1];
      invariant(
        pointer < offset && !pointers.has(pointer),
        "Puntero DNS inválido o cíclico.",
      );
      pointers.add(pointer);
      nextOffset ??= offset + 2;
      offset = pointer;
      continue;
    }
    invariant((length & 0xc0) === 0 && length <= 63, "Label DNS inválido.");
    invariant(offset + 1 + length <= bytes.length, "Label DNS truncado.");
    const labelBytes = bytes.subarray(offset + 1, offset + 1 + length);
    invariant(
      [...labelBytes].every((byte) => byte >= 0x21 && byte <= 0x7e),
      "Label DNS contiene bytes no ASCII.",
    );
    labels.push(String.fromCharCode(...labelBytes).toLowerCase());
    encodedLength += length + 1;
    invariant(encodedLength <= 255, "DNS name demasiado largo.");
    offset += length + 1;
  }
  invariant(
    nextOffset !== undefined,
    "DNS name excede el límite de compresión.",
  );
  return { name: labels.join("."), nextOffset };
}

function ipv4FromBytes(bytes) {
  return [...bytes].join(".");
}

function ipv6FromBytes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: 8 }, (_, index) =>
    view.getUint16(index * 2).toString(16),
  ).join(":");
}

function parseHttpsRdata(bytes, start, end) {
  invariant(start + 3 <= end, "HTTPS RR truncado.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const priority = view.getUint16(start);
  const target = readDnsName(bytes, start + 2);
  invariant(target.nextOffset <= end, "HTTPS target excede RDLENGTH.");
  let offset = target.nextOffset;
  let previousKey = -1;
  const params = [];
  while (offset < end) {
    invariant(offset + 4 <= end, "HTTPS SvcParam truncado.");
    const key = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    offset += 4;
    invariant(
      key > previousKey,
      "HTTPS SvcParam no está ordenado o está duplicado.",
    );
    invariant(offset + length <= end, "HTTPS SvcParam excede RDLENGTH.");
    params.push({ key, bytes: length });
    previousKey = key;
    offset += length;
  }
  invariant(offset === end, "HTTPS RR no consumió RDLENGTH.");
  return { priority, target: target.name || ".", params };
}

export function parseDnsMessage(bytesLike, { id, hostname, queryType }) {
  const bytes =
    bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  const label = `DoH ${hostname}/${queryType}`;
  invariant(bytes.byteLength >= 12, `${label} devolvió un mensaje truncado.`);
  invariant(
    bytes.byteLength <= MAX_RESPONSE_BYTES,
    `${label} excede el límite.`,
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  invariant(view.getUint16(0) === id, `${label} devolvió un ID distinto.`);
  const flags = view.getUint16(2);
  invariant((flags & 0x8000) !== 0, `${label} no marcó QR.`);
  invariant(
    ((flags >>> 11) & 0x0f) === 0,
    `${label} devolvió opcode no estándar.`,
  );
  invariant(
    (flags & 0x0200) === 0,
    `${label} devolvió una respuesta truncada.`,
  );
  invariant(
    (flags & 0x000f) === 0,
    `${label} devolvió RCODE=${flags & 0x000f}.`,
  );
  const questionCount = view.getUint16(4);
  const sectionCounts = [
    view.getUint16(6),
    view.getUint16(8),
    view.getUint16(10),
  ];
  invariant(
    questionCount === 1,
    `${label} no contiene exactamente una pregunta.`,
  );

  const questionName = readDnsName(bytes, 12);
  let offset = questionName.nextOffset;
  invariant(
    offset + 4 <= bytes.length,
    `${label} contiene una pregunta truncada.`,
  );
  invariant(
    normalizeHostname(questionName.name) === hostname &&
      view.getUint16(offset) === DNS_TYPES[queryType] &&
      view.getUint16(offset + 2) === 1,
    `${label} devolvió una pregunta distinta de la solicitada.`,
  );
  offset += 4;

  const records = [];
  const sectionNames = ["answer", "authority", "additional"];
  for (let section = 0; section < sectionCounts.length; section += 1) {
    for (let index = 0; index < sectionCounts[section]; index += 1) {
      const owner = readDnsName(bytes, offset);
      offset = owner.nextOffset;
      invariant(
        offset + 10 <= bytes.length,
        `${label} contiene un RR truncado.`,
      );
      const type = view.getUint16(offset);
      const dnsClass = view.getUint16(offset + 2);
      const ttl = view.getUint32(offset + 4);
      const rdlength = view.getUint16(offset + 8);
      const dataStart = offset + 10;
      const dataEnd = dataStart + rdlength;
      invariant(dataEnd <= bytes.length, `${label} contiene RDATA truncado.`);
      let data;
      if (type === DNS_TYPES.A) {
        invariant(rdlength === 4, `${label} contiene un A inválido.`);
        data = ipv4FromBytes(bytes.subarray(dataStart, dataEnd));
      } else if (type === DNS_TYPES.AAAA) {
        invariant(rdlength === 16, `${label} contiene un AAAA inválido.`);
        data = ipv6FromBytes(bytes.subarray(dataStart, dataEnd));
      } else if (type === DNS_TYPES.CNAME) {
        const cname = readDnsName(bytes, dataStart);
        invariant(
          cname.nextOffset === dataEnd,
          `${label} contiene un CNAME inválido.`,
        );
        data = cname.name;
      } else if (type === DNS_TYPES.HTTPS) {
        data = parseHttpsRdata(bytes, dataStart, dataEnd);
      }
      records.push({
        section: sectionNames[section],
        owner: owner.name,
        type,
        class: dnsClass,
        ttl,
        data,
      });
      offset = dataEnd;
    }
  }
  invariant(
    offset === bytes.length,
    `${label} contiene bytes posteriores inesperados.`,
  );

  const matching = records
    .filter(
      (record) =>
        record.section === "answer" &&
        normalizeHostname(record.owner) === hostname &&
        record.type === DNS_TYPES[queryType] &&
        record.class === 1,
    )
    .map((record) => record.data);
  invariant(
    new Set(matching.map((value) => JSON.stringify(value))).size ===
      matching.length,
    `${label} contiene respuestas duplicadas.`,
  );
  return matching;
}

async function readBoundedBody(response, label, expectedContentType) {
  invariant(response.ok, `${label} devolvió HTTP ${response.status}.`);
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  invariant(
    contentType === expectedContentType,
    `${label} devolvió un Content-Type inesperado.`,
  );
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    invariant(
      /^\d+$/.test(declaredLength),
      `${label} tiene longitud inválida.`,
    );
    invariant(
      Number(declaredLength) <= MAX_RESPONSE_BYTES,
      `${label} excede el límite de respuesta.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  invariant(bytes.byteLength > 0, `${label} devolvió una respuesta vacía.`);
  invariant(
    bytes.byteLength <= MAX_RESPONSE_BYTES,
    `${label} excede el límite de respuesta.`,
  );
  return bytes;
}

async function readBoundedJson(response, label) {
  const bytes = await readBoundedBody(response, label, "application/json");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} devolvió JSON inválido.`);
  }
}

async function queryResolver({ hostname, resolver, fetchImpl }) {
  const answers = {};
  for (const queryType of Object.keys(DNS_TYPES)) {
    const id = randomBytes(2).readUInt16BE(0);
    const query = buildDnsQuery({ hostname, queryType, id });
    const response = await fetchImpl(resolver.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/dns-message",
        "Content-Type": "application/dns-message",
      },
      body: query,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const bytes = await readBoundedBody(
      response,
      `${resolver.name} DoH ${hostname}/${queryType}`,
      "application/dns-message",
    );
    answers[queryType] = parseDnsMessage(bytes, { id, hostname, queryType });
  }
  return { resolver: resolver.name, answers };
}

function parseIpv4(value) {
  if (isIP(value) !== 4) return undefined;
  return value
    .split(".")
    .reduce((result, octet) => (result << 8n) | BigInt(octet), 0n);
}

function ipv4InCidr(address, cidr) {
  const parts = cidr.split("/");
  invariant(parts.length === 2, `CIDR IPv4 inválido: ${cidr}.`);
  const value = parseIpv4(address);
  const networkValue = parseIpv4(parts[0]);
  const prefix = Number(parts[1]);
  invariant(
    value !== undefined &&
      networkValue !== undefined &&
      Number.isInteger(prefix) &&
      prefix >= 0 &&
      prefix <= 32,
    `CIDR IPv4 inválido: ${cidr}.`,
  );
  const mask =
    prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(32 - prefix);
  return (value & mask) === (networkValue & mask);
}

export function parseCloudflareIpRanges(payload) {
  invariant(
    isPlainObject(payload) &&
      payload.success === true &&
      Array.isArray(payload.errors) &&
      payload.errors.length === 0 &&
      isPlainObject(payload.result) &&
      Array.isArray(payload.result.ipv4_cidrs) &&
      payload.result.ipv4_cidrs.length > 0,
    "El inventario público de IPs de Cloudflare es inválido.",
  );
  for (const cidr of payload.result.ipv4_cidrs) {
    invariant(
      typeof cidr === "string",
      "Cloudflare devolvió un CIDR inválido.",
    );
    ipv4InCidr("0.0.0.0", cidr);
  }
  return [...payload.result.ipv4_cidrs].sort();
}

async function fetchCloudflareIpRanges(fetchImpl) {
  const response = await fetchImpl(CLOUDFLARE_IPS_ENDPOINT, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseCloudflareIpRanges(
    await readBoundedJson(response, "Cloudflare IP ranges"),
  );
}

export function validateWorkerDns(results, ipv4Cidrs, hostname) {
  invariant(
    Array.isArray(results) && results.length === RESOLVERS.length,
    "Faltan resultados de los dos resolvers DoH requeridos.",
  );
  invariant(
    new Set(results.map((result) => result.resolver)).size === RESOLVERS.length,
    "Los resultados DoH contienen resolvers duplicados.",
  );
  for (const { resolver, answers } of results) {
    invariant(
      RESOLVERS.some((expected) => expected.name === resolver),
      `Resolver DoH no permitido: ${resolver}.`,
    );
    invariant(
      answers.A.length > 0,
      `${resolver} todavía no publica A para ${hostname}.`,
    );
    invariant(
      answers.A.every(
        (address) =>
          isIP(address) === 4 &&
          ipv4Cidrs.some((cidr) => ipv4InCidr(address, cidr)),
      ),
      `${resolver} publicó un A fuera de los rangos vigentes de Cloudflare.`,
    );
    invariant(
      answers.AAAA.length > 0 &&
        answers.AAAA.every((address) => isIP(address) === 6),
      `${resolver} todavía no publica AAAA válidos para ${hostname}.`,
    );
    invariant(
      answers.CNAME.length === 0,
      `${resolver} todavía publica un CNAME para ${hostname}.`,
    );
  }
  return results;
}

export async function verifyPublicWorkerDns({
  hostname,
  fetchImpl = fetch,
  sleepImpl = wait,
  observations = 2,
}) {
  invariant(HOSTNAMES.includes(hostname), "Hostname público no permitido.");
  invariant(observations === 2, "El gate exige exactamente dos observaciones.");
  const ipv4Cidrs = await fetchCloudflareIpRanges(fetchImpl);
  let results;
  for (let observation = 0; observation < observations; observation += 1) {
    results = await Promise.all(
      RESOLVERS.map((resolver) =>
        queryResolver({ hostname, resolver, fetchImpl }),
      ),
    );
    validateWorkerDns(results, ipv4Cidrs, hostname);
    if (observation + 1 < observations) {
      await sleepImpl(OBSERVATION_DELAY_MS);
    }
  }
  return results;
}

function parseArguments(argv) {
  invariant(
    argv.length === 4 &&
      argv[0] === "--hostname" &&
      argv[2] === "--confirm" &&
      argv[3] === "READ_ONLY_PUBLIC_DNS" &&
      HOSTNAMES.includes(argv[1]),
    "Uso: --hostname <agorbis.com|www.agorbis.com> --confirm READ_ONLY_PUBLIC_DNS",
  );
  return { hostname: argv[1] };
}

async function main() {
  const { hostname } = parseArguments(process.argv.slice(2));
  const results = await verifyPublicWorkerDns({ hostname });
  const summary = results.map(({ resolver, answers }) => ({
    resolver,
    A: answers.A,
    AAAA: answers.AAAA,
    HTTPS: answers.HTTPS.length,
  }));
  process.stdout.write(
    `DNS público Cloudflare verificado para ${hostname}: ${JSON.stringify(summary)}\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Verificación DNS falló."}\n`,
    );
    process.exitCode = 1;
  });
}
