#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  attachClosedWorkerDomain,
  createIpv4Placeholder,
  deleteExactVercelDns,
  deleteIpv4Placeholder,
  detachClosedWorkerDomain,
  disableWorkersDev,
  reconcileDeletedVercelDns,
  restoreExactVercelDns,
} from "./cloudflare-cutover-actions.mjs";
import {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_WORKER_NAME,
  CLOUDFLARE_ZONE_ID,
  CLOUDFLARE_ZONE_NAME,
  persistDnsAudit,
} from "./cloudflare-dns-audit.mjs";

const dnsRecord = ({ id, name, type, content, proxied = false }) => ({
  id,
  name,
  type,
  content,
  proxied,
  proxiable: ["A", "AAAA", "CNAME"].includes(type),
  ttl: 1,
  comment: null,
  tags: [],
  meta: {},
  settings: type === "CNAME" ? { flatten_cname: false } : {},
  created_on: "2026-08-26T00:00:00.000000Z",
  modified_on: "2026-08-26T00:00:00.000000Z",
});

const legacyVercelDns = [
  dnsRecord({
    id: "10000000000000000000000000000001",
    name: CLOUDFLARE_ZONE_NAME,
    type: "CNAME",
    content: "legacy-web-target.example.invalid",
  }),
  dnsRecord({
    id: "10000000000000000000000000000002",
    name: `www.${CLOUDFLARE_ZONE_NAME}`,
    type: "CNAME",
    content: "legacy-web-target.example.invalid",
  }),
  dnsRecord({
    id: "10000000000000000000000000000003",
    name: CLOUDFLARE_ZONE_NAME,
    type: "MX",
    content: "aspmx1.migadu.com",
  }),
];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function success(result, { paginated = false } = {}) {
  return {
    success: true,
    errors: paginated ? [] : null,
    messages: paginated ? [] : null,
    result,
    ...(paginated
      ? {
          result_info: {
            page: 1,
            per_page: 100,
            count: result.length,
            total_count: result.length,
            total_pages: 1,
          },
        }
      : {}),
  };
}

function createWorkerFetch(state) {
  return async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? "GET";
    assert.match(options.headers.Authorization, /^Bearer /);
    const domainsPath = `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/domains`;
    if (url.pathname === domainsPath && method === "GET") {
      return json(success(state.domains));
    }
    if (url.pathname === domainsPath && method === "PUT") {
      const body = JSON.parse(options.body);
      const domain = {
        id: `30000000-0000-4000-8000-${String(state.domains.length + 1).padStart(12, "0")}`,
        cert_id: `40000000-0000-4000-8000-${String(state.domains.length + 1).padStart(12, "0")}`,
        hostname: body.hostname,
        service: body.service,
        zone_id: body.zone_id,
        zone_name: body.zone_name,
      };
      state.domains.push(domain);
      return json(success(domain));
    }
    if (url.pathname.startsWith(`${domainsPath}/`) && method === "DELETE") {
      const id = url.pathname.slice(`${domainsPath}/`.length);
      state.domains = state.domains.filter((domain) => domain.id !== id);
      return new Response(null, { status: 204 });
    }
    if (
      url.pathname ===
        `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${CLOUDFLARE_WORKER_NAME}/subdomain` &&
      method === "POST"
    ) {
      assert.deepEqual(JSON.parse(options.body), {
        enabled: false,
        previews_enabled: false,
      });
      return json(success({ enabled: false, previews_enabled: false }));
    }
    throw new Error(
      `Unexpected Worker test request: ${method} ${url.pathname}`,
    );
  };
}

const temporaryRoot = mkdtempSync(
  path.join(os.tmpdir(), "agorbis-cutover-actions-test-"),
);
try {
  chmodSync(temporaryRoot, 0o700);
  const audit = persistDnsAudit({
    records: legacyVercelDns,
    outputRoot: path.join(temporaryRoot, "audits"),
    now: "20260831T130000Z",
  });
  assert.equal(audit.classification.approved, false);
  assert.match(
    audit.classification.errors.join("\n"),
    /Cloudflare Custom Domains|topología DNS no-web/,
  );

  let dnsRequestCount = 0;
  const dnsFetch = async () => {
    dnsRequestCount += 1;
    throw new Error("El snapshot legacy nunca debe alcanzar la API DNS.");
  };
  const dnsToken = "test_only_dns_token_with_sufficient_length";
  const legacyDnsOperations = [
    () =>
      deleteExactVercelDns({
        hostname: CLOUDFLARE_ZONE_NAME,
        snapshotDirectory: audit.outputDirectory,
        dnsToken,
        fetchImpl: dnsFetch,
      }),
    () =>
      restoreExactVercelDns({
        hostname: CLOUDFLARE_ZONE_NAME,
        snapshotDirectory: audit.outputDirectory,
        dnsToken,
        fetchImpl: dnsFetch,
      }),
    () =>
      reconcileDeletedVercelDns({
        hostname: CLOUDFLARE_ZONE_NAME,
        snapshotDirectory: audit.outputDirectory,
        dnsToken,
        fetchImpl: dnsFetch,
      }),
    () =>
      createIpv4Placeholder({
        hostname: CLOUDFLARE_ZONE_NAME,
        snapshotDirectory: audit.outputDirectory,
        dnsToken,
        fetchImpl: dnsFetch,
      }),
    () =>
      deleteIpv4Placeholder({
        hostname: CLOUDFLARE_ZONE_NAME,
        snapshotDirectory: audit.outputDirectory,
        dnsToken,
        fetchImpl: dnsFetch,
      }),
  ];
  for (const operation of legacyDnsOperations) {
    await assert.rejects(operation(), /versión inválida|no fue aprobado/);
  }
  assert.equal(dnsRequestCount, 0);

  const workerState = { domains: [] };
  const workerFetch = createWorkerFetch(workerState);
  const oauthToken = "test_only_oauth_token_with_sufficient_length";
  await attachClosedWorkerDomain({
    hostname: CLOUDFLARE_ZONE_NAME,
    oauthToken,
    fetchImpl: workerFetch,
  });
  await attachClosedWorkerDomain({
    hostname: `www.${CLOUDFLARE_ZONE_NAME}`,
    oauthToken,
    fetchImpl: workerFetch,
  });
  assert.deepEqual(
    workerState.domains.map((domain) => domain.hostname),
    [CLOUDFLARE_ZONE_NAME, `www.${CLOUDFLARE_ZONE_NAME}`],
  );
  await disableWorkersDev({ oauthToken, fetchImpl: workerFetch });
  await detachClosedWorkerDomain({
    hostname: `www.${CLOUDFLARE_ZONE_NAME}`,
    oauthToken,
    fetchImpl: workerFetch,
  });
  assert.deepEqual(
    workerState.domains.map((domain) => domain.hostname),
    [CLOUDFLARE_ZONE_NAME],
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log(
  "✓ Cloudflare cutover actions · Vercel legacy bloqueado; domains y workers.dev aislados",
);
