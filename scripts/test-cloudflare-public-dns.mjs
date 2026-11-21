#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildDnsQuery,
  encodeDnsName,
  parseCloudflareIpRanges,
  parseDnsMessage,
  validateWorkerDns,
} from "./cloudflare-public-dns.mjs";

const hostname = "agorbis.com";
const ranges = parseCloudflareIpRanges({
  success: true,
  errors: [],
  result: { ipv4_cidrs: ["104.16.0.0/13", "172.64.0.0/13"] },
});

function result(resolver, overrides = {}) {
  return {
    resolver,
    answers: {
      A: ["104.21.92.136"],
      AAAA: ["2606:4700:3030:0:0:0:6815:5c88"],
      CNAME: [],
      HTTPS: [],
      ...overrides,
    },
  };
}

const valid = [result("cloudflare"), result("google")];
assert.equal(validateWorkerDns(valid, ranges, hostname), valid);
assert.throws(
  () =>
    validateWorkerDns(
      [result("cloudflare"), result("google", { A: [] })],
      ranges,
      hostname,
    ),
  /todavía no publica A/,
);
assert.throws(
  () =>
    validateWorkerDns(
      [result("cloudflare"), result("google", { A: ["216.150.1.65"] })],
      ranges,
      hostname,
    ),
  /fuera de los rangos vigentes/,
);
assert.throws(
  () =>
    validateWorkerDns(
      [result("cloudflare"), result("google", { AAAA: [] })],
      ranges,
      hostname,
    ),
  /no publica AAAA/,
);
assert.throws(
  () =>
    validateWorkerDns(
      [result("cloudflare"), result("google", { CNAME: ["old.example"] })],
      ranges,
      hostname,
    ),
  /todavía publica un CNAME/,
);
assert.throws(
  () =>
    validateWorkerDns(
      [result("cloudflare"), result("cloudflare")],
      ranges,
      hostname,
    ),
  /resolvers duplicados/,
);

function rr({ type, rdata, ownerPointer = [0xc0, 0x0c] }) {
  return new Uint8Array([
    ...ownerPointer,
    (type >>> 8) & 0xff,
    type & 0xff,
    0,
    1,
    0,
    0,
    1,
    44,
    (rdata.length >>> 8) & 0xff,
    rdata.length & 0xff,
    ...rdata,
  ]);
}

function responseFor({ query, records = [], flags = 0x8180, trailing = [] }) {
  const bytes = new Uint8Array(
    query.length +
      records.reduce((sum, record) => sum + record.length, 0) +
      trailing.length,
  );
  bytes.set(query);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, flags);
  view.setUint16(6, records.length);
  let offset = query.length;
  for (const record of records) {
    bytes.set(record, offset);
    offset += record.length;
  }
  bytes.set(trailing, offset);
  return bytes;
}

const aQuery = buildDnsQuery({ hostname, queryType: "A", id: 0x1234 });
const aResponse = responseFor({
  query: aQuery,
  records: [rr({ type: 1, rdata: [104, 21, 92, 136] })],
});
assert.deepEqual(
  parseDnsMessage(aResponse, { id: 0x1234, hostname, queryType: "A" }),
  ["104.21.92.136"],
);

const aaaaQuery = buildDnsQuery({ hostname, queryType: "AAAA", id: 0x2345 });
const aaaaBytes = [
  0x26, 0x06, 0x47, 0x00, 0x30, 0x30, 0, 0, 0, 0, 0, 0, 0x68, 0x15, 0x5c, 0x88,
];
assert.deepEqual(
  parseDnsMessage(
    responseFor({
      query: aaaaQuery,
      records: [rr({ type: 28, rdata: aaaaBytes })],
    }),
    { id: 0x2345, hostname, queryType: "AAAA" },
  ),
  ["2606:4700:3030:0:0:0:6815:5c88"],
);

const cnameQuery = buildDnsQuery({ hostname, queryType: "CNAME", id: 0x3456 });
const cnameData = encodeDnsName("target.example");
assert.deepEqual(
  parseDnsMessage(
    responseFor({
      query: cnameQuery,
      records: [rr({ type: 5, rdata: cnameData })],
    }),
    { id: 0x3456, hostname, queryType: "CNAME" },
  ),
  ["target.example"],
);

assert.throws(
  () => parseDnsMessage(aResponse, { id: 0x9999, hostname, queryType: "A" }),
  /ID distinto/,
);
assert.throws(
  () =>
    parseDnsMessage(responseFor({ query: aQuery, flags: 0x8380 }), {
      id: 0x1234,
      hostname,
      queryType: "A",
    }),
  /truncada/,
);
assert.throws(
  () =>
    parseDnsMessage(responseFor({ query: aQuery, trailing: [0] }), {
      id: 0x1234,
      hostname,
      queryType: "A",
    }),
  /bytes posteriores/,
);
assert.throws(
  () =>
    parseDnsMessage(
      responseFor({
        query: aQuery,
        records: [rr({ type: 1, rdata: [104, 21, 92] })],
      }),
      { id: 0x1234, hostname, queryType: "A" },
    ),
  /A inválido/,
);
assert.throws(
  () =>
    parseDnsMessage(
      responseFor({
        query: aQuery,
        records: [
          rr({
            type: 1,
            rdata: [104, 21, 92, 136],
            ownerPointer: [0xc0, 0xff],
          }),
        ],
      }),
      { id: 0x1234, hostname, queryType: "A" },
    ),
  /Puntero DNS inválido/,
);

console.log("✓ Cloudflare public DNS · RFC 8484 doble y fail-closed");
