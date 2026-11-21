import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isStaticPath: vi.fn(),
  requestHandler: vi.fn(),
  setServerPlatform: vi.fn(),
}));

vi.mock("@qwik.dev/core/build", () => ({ isDev: false }));
vi.mock("@qwik.dev/core/server", () => ({
  setServerPlatform: mocks.setServerPlatform,
}));
vi.mock("@qwik.dev/router/middleware/request-handler", () => ({
  _TextEncoderStream_polyfill: class TextEncoderStreamPolyfill {},
  getErrorHtml: () => "error html",
  isStaticPath: mocks.isStaticPath,
  mergeHeadersCookies: (headers: Headers) => headers,
  requestHandler: mocks.requestHandler,
}));

import { createQwikCloudflareWorkerRouter } from "./qwik-cloudflare-worker-router";
import type { CloudflareWorkerEnv } from "./cloudflare-worker-runtime";

function environment(overrides: Partial<CloudflareWorkerEnv> = {}) {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
    AGORBIS_LAUNCH_MODE: "open",
    AGORBIS_RUNTIME: "cloudflare-workers",
    ...overrides,
  } satisfies CloudflareWorkerEnv;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isStaticPath.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Qwik Cloudflare middleware sin caché compartida", () => {
  it("devuelve private,no-store y waitUntil sólo sigue completion", async () => {
    const privateResponse = new Response("cuenta privada", {
      headers: { "Cache-Control": "private, no-store" },
    });
    mocks.requestHandler.mockResolvedValue({
      completion: Promise.resolve(undefined),
      response: Promise.resolve(privateResponse),
    });
    const ctx = { waitUntil: vi.fn() };
    const router = createQwikCloudflareWorkerRouter({
      render: vi.fn(),
    } as never);

    const response = await router(
      new Request("https://agorbis.com/perfil"),
      environment(),
      ctx,
    );

    expect(response).toBe(privateResponse);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
    await ctx.waitUntil.mock.calls[0][0];
  });

  it("delega rutas estáticas únicamente al binding ASSETS plural", async () => {
    mocks.isStaticPath.mockReturnValue(true);
    const env = environment();
    const router = createQwikCloudflareWorkerRouter({
      render: vi.fn(),
    } as never);
    const request = new Request("https://agorbis.com/build/app.js");

    const response = await router(request, env, { waitUntil: vi.fn() });

    expect(await response.text()).toBe("asset");
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
    expect(mocks.requestHandler).not.toHaveBeenCalled();
  });

  it.each(["/sitemap.xml", "/404.html", "/404.html/"])(
    "mantiene %s en Qwik aunque isStaticPath la clasifique como asset",
    async (path) => {
      mocks.isStaticPath.mockReturnValue(true);
      mocks.requestHandler.mockResolvedValue({
        completion: Promise.resolve(undefined),
        response: Promise.resolve(
          new Response("dinámica", {
            headers: { "Cache-Control": "no-store" },
          }),
        ),
      });
      const env = environment();
      const router = createQwikCloudflareWorkerRouter({
        render: vi.fn(),
      } as never);

      const response = await router(
        new Request(`https://agorbis.com${path}`),
        env,
        { waitUntil: vi.fn() },
      );

      expect(await response.text()).toBe("dinámica");
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
      expect(mocks.requestHandler).toHaveBeenCalledOnce();
    },
  );

  it("entrega a Qwik únicamente la IP validada bajo runtime marker", async () => {
    mocks.requestHandler.mockImplementation(async (requestEvent) => {
      expect(requestEvent.getClientConn()).toMatchObject({
        ip: "203.0.113.7",
      });
      return {
        completion: Promise.resolve(undefined),
        response: Promise.resolve(new Response("ok")),
      };
    });
    const router = createQwikCloudflareWorkerRouter({
      render: vi.fn(),
    } as never);

    await router(
      new Request("https://agorbis.com/perfil", {
        headers: {
          "CF-Connecting-IP": "203.0.113.7",
          "x-forwarded-for": "198.51.100.4",
        },
      }),
      environment(),
      { waitUntil: vi.fn() },
    );

    expect(mocks.requestHandler).toHaveBeenCalledOnce();
  });

  it("mantiene el source libre de apertura y escritura en Cache API", () => {
    const source = readFileSync(
      new URL("./qwik-cloudflare-worker-router.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\bcaches\s*\.\s*open\s*\(/);
    expect(source).not.toMatch(/\bcache\s*\.\s*put\s*\(/);
    expect(source).not.toMatch(/console\s*\.\s*error\s*\(/);
  });
});
