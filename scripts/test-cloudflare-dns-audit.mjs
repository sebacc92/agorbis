#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EXPECTED_CUSTOM_DOMAIN_PLACEHOLDER_IPV6,
  EXPECTED_MAIL_CONTROL_COUNTS,
  EXPECTED_NON_WEB_DNS_RECORD_COUNT,
  EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256,
  EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION,
  EXPECTED_NON_WEB_DNS_TYPE_COUNTS,
  canonicalJson,
  classifyAgorbisDns,
  fetchAllDnsRecords,
  persistDnsAudit,
  readRestrictedToken,
  sanitizedDnsTopology,
  sanitizedDnsTopologySha256,
  sha256,
} from "./cloudflare-dns-audit.mjs";

const record = ({
  id,
  name,
  type,
  content,
  ttl = 1,
  proxied = false,
  priority,
  meta,
  ...metadata
}) => ({
  id,
  name,
  type,
  content,
  ttl,
  proxied,
  ...(priority === undefined ? {} : { priority }),
  ...(meta === undefined ? {} : { meta }),
  ...metadata,
});

const customDomainMeta = (originWorkerId) => ({
  read_only: true,
  origin_worker_id: originWorkerId,
});

const records = [
  record({
    id: "00000000000000000000000000000001",
    name: "agorbis.com",
    type: "AAAA",
    content: EXPECTED_CUSTOM_DOMAIN_PLACEHOLDER_IPV6,
    proxied: true,
    meta: customDomainMeta("worker-version-apex"),
  }),
  record({
    id: "00000000000000000000000000000002",
    name: "www.agorbis.com",
    type: "AAAA",
    content: EXPECTED_CUSTOM_DOMAIN_PLACEHOLDER_IPV6,
    proxied: true,
    meta: customDomainMeta("worker-version-www"),
  }),
  record({
    id: "00000000000000000000000000000003",
    name: "agorbis.com",
    type: "MX",
    content: "mail-one.example.invalid",
    priority: 10,
  }),
  record({
    id: "00000000000000000000000000000004",
    name: "agorbis.com",
    type: "MX",
    content: "mail-two.example.invalid",
    priority: 20,
  }),
  record({
    id: "00000000000000000000000000000005",
    name: "agorbis.com",
    type: "TXT",
    content: '"v=spf1 include:mail.example.invalid -all"',
  }),
  record({
    id: "00000000000000000000000000000006",
    name: "agorbis.com",
    type: "TXT",
    content: '"hosted-email-verification=fake"',
  }),
  record({
    id: "00000000000000000000000000000007",
    name: "_dmarc.agorbis.com",
    type: "TXT",
    content: '"v=DMARC1; p=reject"',
  }),
  record({
    id: "00000000000000000000000000000008",
    name: "key1._domainkey.agorbis.com",
    type: "CNAME",
    content: "key1.example.invalid",
  }),
  record({
    id: "00000000000000000000000000000009",
    name: "key2._domainkey.agorbis.com",
    type: "CNAME",
    content: "key2.example.invalid",
  }),
  record({
    id: "0000000000000000000000000000000a",
    name: "key3._domainkey.agorbis.com",
    type: "CNAME",
    content: "key3.example.invalid",
  }),
  record({
    id: "0000000000000000000000000000000b",
    name: "resend._domainkey.agorbis.com",
    type: "TXT",
    content: '"p=fake-public-key-material"',
    ttl: 3600,
  }),
  // Resend Forge (v2, D104): CNAME de envío y de retorno más el TXT de
  // verificación, en lugar del MX y el SPF propios de `send`.
  record({
    id: "0000000000000000000000000000000c",
    name: "send.agorbis.com",
    type: "CNAME",
    content: "send.forge.example.invalid",
    ttl: 3600,
  }),
  record({
    id: "0000000000000000000000000000000d",
    name: "rsend.agorbis.com",
    type: "CNAME",
    content: "rsend-region.forge.example.invalid",
    ttl: 3600,
  }),
  record({
    id: "0000000000000000000000000000000f",
    name: "agorbis.com",
    type: "TXT",
    content: '"resend-domain-verification=fake"',
    ttl: 3600,
  }),
];

const isWeb = ({ name, type }) =>
  ["agorbis.com", "www.agorbis.com"].includes(name) &&
  ["A", "AAAA", "CNAME"].includes(type);
const fixtureNonWebRecords = records.filter((item) => !isWeb(item));
const fixtureNonWebSha256 = sanitizedDnsTopologySha256(fixtureNonWebRecords);

assert.match(EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256, /^[a-f0-9]{64}$/);
assert.equal(
  EXPECTED_NON_WEB_DNS_TOPOLOGY_SHA256,
  "e7f8e3d420baceb49dc02b8128302bcbfd3a6713ec157607104c168d66ea257a",
);
assert.equal(
  EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION,
  "agorbis-non-web-dns-topology/2026-11-01/v2",
);
assert.equal(EXPECTED_NON_WEB_DNS_RECORD_COUNT, 12);
assert.deepEqual(EXPECTED_NON_WEB_DNS_TYPE_COUNTS, {
  CNAME: 5,
  MX: 2,
  TXT: 5,
});
assert.deepEqual(EXPECTED_MAIL_CONTROL_COUNTS, {
  dkim: 4,
  dmarc: 1,
  mx: 2,
  spf: 1,
});

const classification = classifyAgorbisDns(records);
assert.equal(classification.approved, false);
assert.deepEqual(classification.errors, [
  `La topología DNS no-web no coincide con ${EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION}.`,
]);
assert.equal(classification.apexVariant, "cloudflare-custom-domains");
assert.equal(classification.webRecords.length, 2);
assert.equal(classification.nonWebRecords.length, 12);
assert.equal(classification.nonWebSha256, fixtureNonWebSha256);
assert.deepEqual(classification.nonWebTypeCounts, {
  CNAME: 5,
  MX: 2,
  TXT: 5,
});
assert.deepEqual(classification.mailControlCounts, {
  dkim: 4,
  dmarc: 1,
  mx: 2,
  spf: 1,
});

for (const changed of [
  records.map((item) =>
    item.id === "00000000000000000000000000000001"
      ? { ...item, content: "2001:db8::1" }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000002"
      ? { ...item, proxied: false }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000002"
      ? { ...item, ttl: 300 }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000001"
      ? { ...item, meta: { ...item.meta, read_only: false } }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000001"
      ? { ...item, meta: { read_only: true } }
      : item,
  ),
  [
    ...records,
    record({
      id: "0000000000000000000000000000000e",
      name: "www.agorbis.com",
      type: "AAAA",
      content: EXPECTED_CUSTOM_DOMAIN_PLACEHOLDER_IPV6,
      proxied: true,
      meta: customDomainMeta("unexpected-extra-version"),
    }),
  ],
]) {
  const changedClassification = classifyAgorbisDns(changed);
  assert.equal(changedClassification.approved, false);
  assert.match(
    changedClassification.errors.join("\n"),
    /Cloudflare Custom Domains/,
  );
}

for (const changed of [
  records.map((item) =>
    item.id === "00000000000000000000000000000003"
      ? { ...item, priority: 11 }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000005"
      ? { ...item, content: '"v=spf1 -all"' }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000007"
      ? { ...item, content: '"not-dmarc"' }
      : item,
  ),
  records.map((item) =>
    item.id === "00000000000000000000000000000008"
      ? { ...item, settings: { flatten_cname: true } }
      : item,
  ),
  records.filter((item) => item.id !== "0000000000000000000000000000000b"),
  // Volver al esquema v1 de Resend o perder un CNAME Forge también falla.
  [
    ...records.filter(
      (item) =>
        ![
          "0000000000000000000000000000000c",
          "0000000000000000000000000000000d",
        ].includes(item.id),
    ),
    record({
      id: "0000000000000000000000000000000c",
      name: "send.agorbis.com",
      type: "MX",
      content: "feedback.example.invalid",
      ttl: 3600,
      priority: 10,
    }),
    record({
      id: "0000000000000000000000000000000d",
      name: "send.agorbis.com",
      type: "TXT",
      content: '"v=spf1 include:send.example.invalid -all"',
      ttl: 3600,
    }),
  ],
  records.filter((item) => item.id !== "0000000000000000000000000000000d"),
  records.map((item) =>
    item.id === "0000000000000000000000000000000c"
      ? { ...item, content: "send.elsewhere.example.invalid" }
      : item,
  ),
]) {
  const changedClassification = classifyAgorbisDns(changed);
  assert.equal(changedClassification.approved, false);
  assert.match(
    changedClassification.errors.join("\n"),
    /topología|MX\/SPF\/DKIM\/DMARC|inventario/,
  );
  // El fixture base nunca coincide con el hash real, así que "no aprobado"
  // solo no prueba nada: cada cambio tiene que mover el hash no-web.
  assert.notEqual(
    changedClassification.nonWebSha256,
    classification.nonWebSha256,
  );
}

const operationalMetadataOnly = records.map((item, index) => ({
  ...item,
  id: (index + 101).toString(16).padStart(32, "0"),
  created_on: "2099-01-01T00:00:00.000000Z",
  modified_on: "2099-01-02T00:00:00.000000Z",
  comment: `ignored-operational-comment-${index}`,
  tags: [`ignored-operational-tag-${index}`],
  meta: isWeb(item) ? item.meta : { api_internal_flag: false },
}));
assert.equal(
  sanitizedDnsTopologySha256(
    operationalMetadataOnly.filter((item) => !isWeb(item)),
  ),
  fixtureNonWebSha256,
);
assert.equal(
  classifyAgorbisDns(operationalMetadataOnly).nonWebSha256,
  classification.nonWebSha256,
);
assert.deepEqual(
  classifyAgorbisDns(operationalMetadataOnly).errors,
  classification.errors,
);
assert.deepEqual(
  sanitizedDnsTopology(fixtureNonWebRecords).map(Object.keys),
  sanitizedDnsTopology(
    operationalMetadataOnly.filter((item) => !isWeb(item)),
  ).map(Object.keys),
);

assert.throws(
  () =>
    classifyAgorbisDns(
      records.map((item) =>
        item.id === "00000000000000000000000000000003"
          ? { ...item, priority: null }
          : item,
      ),
    ),
  /priority inválida/,
);

function envelope(result, page, totalPages, totalCount) {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
    result_info: {
      page,
      per_page: 100,
      count: result.length,
      total_count: totalCount,
      total_pages: totalPages,
    },
  };
}

const requestedPages = [];
const tokenForTest = "cfut_test_only_never_a_real_token_1234567890";
const fetched = await fetchAllDnsRecords({
  token: tokenForTest,
  fetchImpl: async (url, options) => {
    assert.equal(url.origin, "https://api.cloudflare.com");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, `Bearer ${tokenForTest}`);
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    const result = page === 1 ? records.slice(0, 6) : records.slice(6);
    return {
      ok: true,
      status: 200,
      json: async () => envelope(result, page, 2, records.length),
    };
  },
});
assert.deepEqual(requestedPages, [1, 2]);
assert.equal(fetched.length, records.length);

await assert.rejects(
  fetchAllDnsRecords({
    token: tokenForTest,
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: tokenForTest }),
    }),
  }),
  (error) => {
    assert.doesNotMatch(error.message, new RegExp(tokenForTest));
    assert.match(error.message, /HTTP 403/);
    return true;
  },
);

await assert.rejects(
  fetchAllDnsRecords({
    token: tokenForTest,
    fetchImpl: async () => {
      throw new Error(tokenForTest);
    },
  }),
  (error) => {
    assert.doesNotMatch(error.message, new RegExp(tokenForTest));
    assert.match(error.message, /No se pudo consultar/);
    return true;
  },
);

const temporaryRoot = mkdtempSync(
  path.join(os.tmpdir(), "agorbis-dns-audit-test-"),
);
try {
  chmodSync(temporaryRoot, 0o700);
  const tokenPath = path.join(temporaryRoot, "token");
  writeFileSync(tokenPath, tokenForTest, { mode: 0o600 });
  assert.equal(readRestrictedToken(tokenPath), tokenForTest);
  assert.throws(() => readRestrictedToken("relative-token"), /absoluto/);
  chmodSync(tokenPath, 0o644);
  assert.throws(() => readRestrictedToken(tokenPath), /0600/);
  chmodSync(tokenPath, 0o600);
  const tokenLink = path.join(temporaryRoot, "token-link");
  symlinkSync(tokenPath, tokenLink);
  assert.throws(() => readRestrictedToken(tokenLink), /symlink/);

  const outputRoot = path.join(temporaryRoot, "audits");
  const audit = persistDnsAudit({
    records,
    outputRoot,
    now: "20260831T120000Z",
  });
  assert.equal(statSync(outputRoot).mode & 0o777, 0o700);
  assert.equal(statSync(audit.outputDirectory).mode & 0o777, 0o700);
  assert.equal(statSync(audit.snapshotPath).mode & 0o777, 0o600);
  assert.equal(statSync(audit.manifestPath).mode & 0o777, 0o600);
  const snapshot = readFileSync(audit.snapshotPath, "utf8");
  const manifest = JSON.parse(readFileSync(audit.manifestPath, "utf8"));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.snapshotSha256, sha256(snapshot));
  assert.equal(manifest.approvedForCutover, false);
  assert.equal(manifest.recordCount, records.length);
  assert.equal(manifest.webRecordCount, 2);
  assert.equal(Object.hasOwn(manifest, "webRecordIds"), false);
  assert.equal(
    manifest.nonWebTopologyVersion,
    EXPECTED_NON_WEB_DNS_TOPOLOGY_VERSION,
  );
  assert.equal(manifest.nonWebSha256, fixtureNonWebSha256);
  assert.deepEqual(manifest.nonWebTypeCounts, EXPECTED_NON_WEB_DNS_TYPE_COUNTS);
  assert.deepEqual(manifest.mailControlCounts, EXPECTED_MAIL_CONTROL_COUNTS);
  assert.equal(canonicalJson(JSON.parse(snapshot)), snapshot);
  assert.doesNotMatch(snapshot, new RegExp(tokenForTest));
  assert.doesNotMatch(JSON.stringify(manifest), new RegExp(tokenForTest));
  assert.doesNotMatch(JSON.stringify(manifest), /worker-version-/);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(
  "✓ Cloudflare DNS audit · Custom Domains, topología no-web versionada, GET-only, permisos y redacción",
);
