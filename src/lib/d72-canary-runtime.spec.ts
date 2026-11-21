import { describe, expect, it, vi } from "vitest";
import {
  createAgorbisCloudflareWorker,
  type CloudflareWorkerEnv,
  type CloudflareWorkerExecutionContext,
} from "./cloudflare-worker-runtime";
import {
  CLOUDFLARE_VERSION_OVERRIDE_HEADER,
  createD72CanaryCapability,
  D72_CANARY_CAPABILITY_HEADER,
  D72_CANARY_CAPABILITY_SCHEMA,
} from "./d72-canary-capability";

const CRON_SECRET = "fixture-cron-secret-0123456789abcdef0123456789abcdef";
const VERSION_ID = "123e4567-e89b-42d3-a456-426614174000";

function environment(overrides: Partial<CloudflareWorkerEnv> = {}) {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
    AGORBIS_LAUNCH_MODE: "open",
    AGORBIS_RUNTIME: "cloudflare-workers",
    CRON_SECRET,
    ...overrides,
  } satisfies CloudflareWorkerEnv;
}

function context(): CloudflareWorkerExecutionContext {
  return { waitUntil: vi.fn() };
}

async function capability(overrides: Record<string, string> = {}) {
  const now = new Date();
  return createD72CanaryCapability({
    binding: {
      artifactHash: "a".repeat(64),
      expiresAtUtc: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      head: "b".repeat(40),
      issuedAtUtc: now.toISOString(),
      nonce: "c".repeat(64),
      policyHash: "d".repeat(64),
      requestHash: "e".repeat(64),
      schemaVersion: D72_CANARY_CAPABILITY_SCHEMA,
      versionId: VERSION_ID,
      ...overrides,
    },
    secret: CRON_SECRET,
    now,
  });
}

function canaryHeaders(token: string, versionId = VERSION_ID) {
  return {
    [CLOUDFLARE_VERSION_OVERRIDE_HEADER]: `agorbis="${versionId}"`,
    [D72_CANARY_CAPABILITY_HEADER]: token,
  };
}

describe("Cloudflare D72 isolated canary", () => {
  it("no cambia el tráfico normal sin Version Override", async () => {
    const qwikFetch = vi.fn(async () => new Response("open"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://agorbis.com/manual"),
      environment(),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("open");
    expect(response.headers.has("x-agorbis-canary")).toBe(false);
  });

  it("rechaza el Version Override sin capability aun con Version ID conocido", async () => {
    const qwikFetch = vi.fn(async () => new Response("must-not-run"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://agorbis.com/registro", {
        headers: {
          [CLOUDFLARE_VERSION_OVERRIDE_HEADER]: `agorbis="${VERSION_ID}"`,
        },
      }),
      environment(),
      context(),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("x-agorbis-canary")).toBe("denied");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toBe("Canary access denied.");
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("rechaza una capability huérfana antes de Qwik", async () => {
    const token = await capability();
    const qwikFetch = vi.fn(async () => new Response("must-not-run"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://agorbis.com/", {
        headers: { [D72_CANARY_CAPABILITY_HEADER]: token },
      }),
      environment(),
      context(),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(token);
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("autoriza ambos headers, los retira antes de Qwik y marca no-store/noindex", async () => {
    const token = await capability();
    const qwikFetch = vi.fn(async (request: Request) => {
      expect(request.headers.has(CLOUDFLARE_VERSION_OVERRIDE_HEADER)).toBe(
        false,
      );
      expect(request.headers.has(D72_CANARY_CAPABILITY_HEADER)).toBe(false);
      return new Response("canary-open", {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    });
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://agorbis.com/registro", {
        headers: canaryHeaders(token),
      }),
      environment(),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("canary-open");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-agorbis-canary")).toBe("active");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
    expect([...response.headers.values()].join(" ")).not.toContain(token);
    expect([...response.headers.values()].join(" ")).not.toContain(CRON_SECRET);
  });

  it("conserva el redirect www exacto dentro de la capability", async () => {
    const token = await capability();
    const qwikFetch = vi.fn(async () => new Response("must-not-run"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://www.agorbis.com/auth/confirm?next=%2Fperfil", {
        headers: canaryHeaders(token),
      }),
      environment(),
      context(),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://agorbis.com/auth/confirm?next=%2Fperfil",
    );
    expect(response.headers.get("x-agorbis-canary")).toBe("active");
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("falla cerrado ante versión, host, protocolo, firma o secret distintos", async () => {
    const token = await capability();
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`;
    const otherVersion = "223e4567-e89b-42d3-a456-426614174000";
    const cases = [
      new Request("https://agorbis.com/", {
        headers: canaryHeaders(token, otherVersion),
      }),
      new Request("https://attacker.invalid/", {
        headers: canaryHeaders(token),
      }),
      new Request("http://agorbis.com/", { headers: canaryHeaders(token) }),
      new Request("https://agorbis.com/", {
        headers: canaryHeaders(tamperedToken),
      }),
    ];

    for (const request of cases) {
      const qwikFetch = vi.fn(async () => new Response("must-not-run"));
      const worker = createAgorbisCloudflareWorker(qwikFetch);
      const response = await worker.fetch(request, environment(), context());
      expect(response.status).toBe(403);
      expect(qwikFetch).not.toHaveBeenCalled();
    }

    const wrongSecretWorker = createAgorbisCloudflareWorker(
      vi.fn(async () => new Response("must-not-run")),
    );
    const response = await wrongSecretWorker.fetch(
      new Request("https://agorbis.com/", { headers: canaryHeaders(token) }),
      environment({ CRON_SECRET: `${CRON_SECRET}-wrong` }),
      context(),
    );
    expect(response.status).toBe(403);
  });
});
