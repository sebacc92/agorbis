import { describe, expect, it, vi } from "vitest";
import {
  CRON_ROUTE_BY_SCHEDULE,
  createAgorbisCloudflareWorker,
  MAX_WORKER_REQUEST_BODY_BYTES,
  type CloudflareScheduledController,
  type CloudflareWorkerEnv,
  type CloudflareWorkerExecutionContext,
  type QwikWorkerFetch,
} from "./cloudflare-worker-runtime";

const CRON_SECRET = "0123456789abcdef0123456789abcdef";

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

function controller(cron: string): CloudflareScheduledController {
  return { cron, scheduledTime: 0, noRetry: vi.fn() };
}

function chunkedPost(chunks: Uint8Array[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      for (const chunk of chunks) streamController.enqueue(chunk);
      streamController.close();
    },
  });
  return new Request("https://agorbis.com/reclamos", {
    body: stream,
    duplex: "half",
    method: "POST",
  } as RequestInit);
}

describe("Cloudflare Worker runtime", () => {
  it("redirige www al apex antes de invocar Qwik o ASSETS", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const env = environment();
    const worker = createAgorbisCloudflareWorker(qwikFetch);

    const response = await worker.fetch(
      new Request("https://www.agorbis.com/build/app.js?v=1"),
      env,
      context(),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://agorbis.com/build/app.js?v=1",
    );
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=63072000",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(qwikFetch).not.toHaveBeenCalled();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("redirige http apex a https sin perder path ni query sensible", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request(
        "http://agorbis.com/auth/confirm?token_hash=a%2Fb%2Bc&next=%2Fperfil",
      ),
      environment(),
      context(),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://agorbis.com/auth/confirm?token_hash=a%2Fb%2Bc&next=%2Fperfil",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("redirige http www directamente a https apex", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("http://www.agorbis.com/assets/icon.png?version=2"),
      environment(),
      context(),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://agorbis.com/assets/icon.png?version=2",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("mantiene todo el workers.dev cerrado para cualquier método, ruta o modo no abierto", async () => {
    const methods = [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ];
    const paths = [
      "/",
      "/manual?fixture=1",
      "/explorar?parent=earth&view=map",
      "/debates/fixture?next=%2Fperfil",
      "/internal/purge-retained-data?token=no-debe-aparecer",
      "/build/app.js?v=fixture",
    ];
    const launchModes = ["closed", undefined, "valor-invalido"] as const;

    for (const launchMode of launchModes) {
      const qwikFetch = vi.fn(async () => new Response("qwik"));
      const env = environment();
      if (launchMode === undefined) {
        Reflect.deleteProperty(env, "AGORBIS_LAUNCH_MODE");
      } else {
        Reflect.set(env, "AGORBIS_LAUNCH_MODE", launchMode);
      }
      const worker = createAgorbisCloudflareWorker(qwikFetch);

      for (const method of methods) {
        for (const requestPath of paths) {
          const request = new Request(`https://agorbis.com${requestPath}`, {
            method,
            ...(method === "GET" || method === "HEAD"
              ? {}
              : { body: "dato=sensible" }),
          });
          const response = await worker.fetch(request, env, context());

          expect(response.status, `${launchMode} ${method} ${requestPath}`).toBe(
            503,
          );
          expect(response.headers.get("retry-after")).toBe("300");
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(response.headers.get("content-security-policy")).toBe(
            "default-src 'none'",
          );
          expect(response.headers.get("x-content-type-options")).toBe(
            "nosniff",
          );
          expect(response.headers.get("content-type")).toBe(
            "text/plain; charset=utf-8",
          );
          expect(await response.text()).toBe(
            method === "HEAD" ? "" : "Agorbis todavía no está abierto.",
          );
          expect(request.bodyUsed).toBe(false);
        }
      }

      expect(qwikFetch).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();

      const event = controller("10 * * * *");
      await worker.scheduled(event, env, context());
      expect(event.noRetry).toHaveBeenCalledOnce();
      expect(qwikFetch).not.toHaveBeenCalled();
    }
  });

  it("corta un POST CLOSED antes de body, Qwik, ASSETS, red, waitUntil y secrets", async () => {
    const externalFetch = vi.fn(async () => {
      throw new Error("fetch externo inesperado");
    });
    vi.stubGlobal("fetch", externalFetch);
    try {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("fixture=sensible"));
          controller.close();
        },
      });
      const request = new Request("https://agorbis.com/registro/", {
        body,
        duplex: "half",
        method: "POST",
      } as RequestInit);
      const baseEnv = environment({ AGORBIS_LAUNCH_MODE: "closed" });
      Object.assign(baseEnv, {
        SUPABASE_SECRET_KEY: "must-not-be-read",
        TURNSTILE_SECRET: "must-not-be-read",
      });
      const secretReads = new Map<PropertyKey, number>();
      const secretNames = new Set<PropertyKey>([
        "CRON_SECRET",
        "SUPABASE_SECRET_KEY",
        "TURNSTILE_SECRET",
      ]);
      const env = new Proxy(baseEnv, {
        get(target, property, receiver) {
          if (secretNames.has(property)) {
            secretReads.set(property, (secretReads.get(property) ?? 0) + 1);
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const qwikFetch = vi.fn(async () => new Response("qwik"));
      const waitUntil = vi.fn();
      const worker = createAgorbisCloudflareWorker(qwikFetch);

      const response = await worker.fetch(request, env, { waitUntil });

      expect(response.status).toBe(503);
      expect(await response.text()).toBe("Agorbis todavía no está abierto.");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(request.bodyUsed).toBe(false);
      expect(qwikFetch).not.toHaveBeenCalled();
      expect(baseEnv.ASSETS.fetch).not.toHaveBeenCalled();
      expect(externalFetch).not.toHaveBeenCalled();
      expect(waitUntil).not.toHaveBeenCalled();
      expect(secretReads.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("canonicaliza manual y explorar antes de Qwik, sin cuerpo, cookies ni red", async () => {
    const externalFetch = vi.fn(async () => {
      throw new Error("fetch externo inesperado");
    });
    vi.stubGlobal("fetch", externalFetch);

    try {
      const cases = [
        {
          location: "/manual/?fixture=a%2Fb+c",
          method: "GET",
          source: "/manual?fixture=a%2Fb+c",
        },
        {
          location: "/manual/?fixture=a%2Fb+c",
          method: "HEAD",
          source: "/manual?fixture=a%2Fb+c",
        },
        {
          location: "/explorar/?parent=buenos-aires&view=map",
          method: "GET",
          source: "/explorar?parent=buenos-aires&view=map",
        },
        {
          location: "/explorar/?parent=buenos-aires&view=map",
          method: "HEAD",
          source: "/explorar?parent=buenos-aires&view=map",
        },
      ];

      for (const { location, method, source } of cases) {
        const qwikFetch = vi.fn(async () => {
          throw new Error("Qwik no debe ejecutarse para canonicalizar");
        });
        const env = environment({
          AGORBIS_LAUNCH_MODE: "public-read-only",
        });
        const worker = createAgorbisCloudflareWorker(qwikFetch);
        const response = await worker.fetch(
          new Request(`https://agorbis.com${source}`, {
            headers: { Cookie: "fixture=1" },
            method,
          }),
          env,
          context(),
        );

        expect(response.status, `${method} ${source}`).toBe(301);
        expect(response.headers.get("location"), source).toBe(location);
        expect(new URL(location, "https://agorbis.com").origin).toBe(
          "https://agorbis.com",
        );
        expect(response.headers.get("set-cookie"), source).toBeNull();
        expect(response.headers.get("refresh"), source).toBeNull();
        expect(response.headers.get("cache-control"), source).toBe(
          "private, no-store",
        );
        expect(response.headers.get("x-agorbis-launch-mode"), source).toBe(
          "public-read-only",
        );
        expect(await response.text(), source).toBe("");
        expect(qwikFetch, source).not.toHaveBeenCalled();
        expect(env.ASSETS.fetch, source).not.toHaveBeenCalled();
      }

      expect(externalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("no aplica el redirect canónico del gate en modo open", async () => {
    const qwikFetch = vi.fn(async () =>
      new Response("open", { status: 202 }),
    );
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const env = environment({ AGORBIS_LAUNCH_MODE: "open" });

    for (const path of [
      "/manual?fixture=1",
      "/explorar?parent=earth&view=map",
    ]) {
      const response = await worker.fetch(
        new Request(`https://agorbis.com${path}`),
        env,
        context(),
      );
      expect(response.status, path).toBe(202);
      expect(await response.text(), path).toBe("open");
    }

    expect(qwikFetch).toHaveBeenCalledTimes(2);
  });

  it("permite sólo páginas públicas explícitas en el preview read-only y elimina identidad y cookies", async () => {
    const seenRequests: Request[] = [];
    const qwikFetch = vi.fn<QwikWorkerFetch>(async (request) => {
      seenRequests.push(request);
      return new Response("<html>lectura</html>", {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'self'; connect-src 'self' https://ibtvlvpxwourrxwcrfkf.supabase.co https://challenges.cloudflare.com; form-action 'self'; frame-src https://challenges.cloudflare.com; img-src 'self' data: blob: https://ibtvlvpxwourrxwcrfkf.supabase.co",
          "Set-Cookie": "sb-access-token=sensible; Path=/; HttpOnly",
          Refresh: "0; url=/registro",
        },
      });
    });
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const env = environment({ AGORBIS_LAUNCH_MODE: "public-read-only" });
    const paths = [
      "/",
      "/manual/",
      "/privacidad",
      "/eliminar-datos",
      "/eliminar-datos/",
      "/explorar/?parent=argentina",
      "/explorar/?view=map",
      "/c/earth",
      "/c/argentina/debates",
      "/debates/123e4567-e89b-42d3-a456-426614174000",
      "/instituciones/defensoria-del-pueblo",
      "/assets/vCSP3ZA6-style.css",
      "/build/q-fixture.js?v=1",
      "/favicon.svg",
    ];

    for (const path of paths) {
      const response = await worker.fetch(
        new Request(`https://agorbis.com${path}`, {
          headers: {
            Authorization: "Bearer no-debe-llegar",
            Cookie: "sb-access-token=no-debe-llegar; locale=es",
            "Proxy-Authorization": "Basic no-debe-llegar",
          },
        }),
        env,
        context(),
      );
      expect(response.status, path).toBe(200);
      expect(response.headers.get("set-cookie"), path).toBeNull();
      expect(response.headers.get("refresh"), path).toBeNull();
      expect(response.headers.get("cache-control"), path).toBe(
        "private, no-store",
      );
      expect(response.headers.get("x-agorbis-launch-mode"), path).toBe(
        "public-read-only",
      );
      const csp = response.headers.get("content-security-policy")!;
      expect(csp, path).toContain("connect-src 'self'");
      expect(csp, path).toContain("form-action 'none'");
      expect(csp, path).toContain("frame-src 'none'");
      expect(csp, path).toContain("img-src 'self' data: blob:");
      expect(csp, path).not.toContain("challenges.cloudflare.com");
      expect(csp, path).not.toContain("supabase.co");
      expect(await response.text()).toBe("<html>lectura</html>");
    }

    expect(qwikFetch).toHaveBeenCalledTimes(paths.length);
    for (const request of seenRequests) {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBeNull();
      expect(request.headers.get("proxy-authorization")).toBeNull();
    }
  });

  it("bloquea rutas interactivas, métodos de escritura y bypasses antes de Qwik", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const env = environment({ AGORBIS_LAUNCH_MODE: "public-read-only" });
    const blockedPaths = [
      "/auth/callback?code=sensible",
      "/buscar?q=sensible",
      "/c/earth/debates/nuevo",
      "/c/earth/miembros",
      "/comunidades/solicitar",
      "/consentimiento",
      "/encuestas/123e4567-e89b-42d3-a456-426614174000/resultados.csv",
      "/ingresar",
      "/internal/sync-notifications",
      "/media/avatares/123e4567-e89b-42d3-a456-426614174000/a.png",
      "/moderacion",
      "/notificaciones",
      "/onboarding",
      "/perfil",
      "/recuperar",
      "/reenviar-confirmacion",
      "/registro",
      "/u/123e4567-e89b-42d3-a456-426614174000",
      "/c/earth%2fmiembros",
      "/build/%2e%2e/registro",
      "/desconocida",
      "/explorar?q=opinion-politica",
      "/explorar?parent=earth&q=texto-libre",
      "/explorar?parent=earth&parent=argentina",
      "/explorar?view=jerarquia",
      "/explorar?desconocido=valor",
      "/explorar/?q=opinion-politica",
      "/explorar/?parent=earth&q=texto-libre",
      "/explorar/?parent=earth&parent=argentina",
      "/explorar/?view=jerarquia",
      "/explorar/?desconocido=valor",
      "/instituciones?q=texto-libre",
      "/instituciones?desconocido=valor",
    ];

    for (const path of blockedPaths) {
      const request = new Request(`https://agorbis.com${path}`);
      const response = await worker.fetch(request, env, context());
      expect(response.status, path).toBe(403);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("x-agorbis-launch-mode"), path).toBe(
        "public-read-only",
      );
      expect(await response.text(), path).toBe(
        "Agorbis está disponible temporalmente sólo para lectura.",
      );
      expect(request.bodyUsed, path).toBe(false);
    }

    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      for (const path of [
        "/",
        "/manual",
        "/manual/",
        "/explorar?parent=earth",
        "/explorar/?parent=earth",
      ]) {
        const request = new Request(`https://agorbis.com${path}`, {
          body: method === "OPTIONS" ? undefined : "dato=sensible",
          method,
        });
        const response = await worker.fetch(request, env, context());
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(response.headers.get("location"), `${method} ${path}`).toBeNull();
        expect(
          response.headers.get("set-cookie"),
          `${method} ${path}`,
        ).toBeNull();
        expect(request.bodyUsed, `${method} ${path}`).toBe(false);
      }
    }

    for (const name of [
      "X-QRL",
      "X-HTTP-Method-Override",
      "X-Method-Override",
      "Upgrade",
      "Sec-WebSocket-Key",
    ]) {
      const response = await worker.fetch(
        new Request("https://agorbis.com/", {
          headers: { [name]: "POST" },
        }),
        env,
        context(),
      );
      expect(response.status, name).toBe(403);
    }

    expect(qwikFetch).not.toHaveBeenCalled();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("bloquea host alternativo y redirecciones externas, Auth o con query prohibida", async () => {
    const env = environment({ AGORBIS_LAUNCH_MODE: "public-read-only" });
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const hostWorker = createAgorbisCloudflareWorker(qwikFetch);

    const alternateHost = await hostWorker.fetch(
      new Request("https://agorbis.example/manual"),
      env,
      context(),
    );
    expect(alternateHost.status).toBe(403);
    expect(qwikFetch).not.toHaveBeenCalled();

    const alternatePort = await hostWorker.fetch(
      new Request("https://agorbis.com:444/manual"),
      env,
      context(),
    );
    expect(alternatePort.status).toBe(403);
    expect(qwikFetch).not.toHaveBeenCalled();

    const externalFetch = vi.fn(async () => {
      throw new Error("el Worker no debe seguir redirects");
    });
    vi.stubGlobal("fetch", externalFetch);

    try {
      const destinations = [
        "https://external.invalid/manual/",
        "//external.invalid/manual/",
        "/auth/login",
        "https://fixture:fixture@agorbis.com/manual/",
        "/explorar/?q=fixture",
      ];

      for (const destination of destinations) {
        const redirectingQwik = vi.fn(async () =>
          new Response("body upstream que no debe filtrarse", {
            status: 302,
            headers: {
              Location: destination,
              Refresh: "0; url=/auth/login",
              "Set-Cookie": "fixture=1; Path=/; HttpOnly",
            },
          }),
        );
        const worker = createAgorbisCloudflareWorker(redirectingQwik);
        const redirect = await worker.fetch(
          new Request("https://agorbis.com/manual/"),
          env,
          context(),
        );

        expect(redirect.status, destination).toBe(403);
        expect(redirect.headers.get("location"), destination).toBeNull();
        expect(redirect.headers.get("set-cookie"), destination).toBeNull();
        expect(redirect.headers.get("refresh"), destination).toBeNull();
        expect(await redirect.text(), destination).toBe(
          "Agorbis está disponible temporalmente sólo para lectura.",
        );
        expect(redirectingQwik, destination).toHaveBeenCalledOnce();
      }

      const publicRedirectQwik = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: "/c/earth/",
            Refresh: "0; url=/auth/login",
            "Set-Cookie": "fixture=1; Path=/; HttpOnly",
          },
        }),
      );
      const publicRedirectWorker =
        createAgorbisCloudflareWorker(publicRedirectQwik);
      const publicRedirect = await publicRedirectWorker.fetch(
        new Request("https://agorbis.com/manual/"),
        env,
        context(),
      );

      expect(publicRedirect.status).toBe(302);
      expect(publicRedirect.headers.get("location")).toBe("/c/earth/");
      expect(publicRedirect.headers.get("set-cookie")).toBeNull();
      expect(publicRedirect.headers.get("refresh")).toBeNull();
      expect(await publicRedirect.text()).toBe("");
      expect(publicRedirectQwik).toHaveBeenCalledOnce();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
      expect(externalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("HEAD read-only nunca devuelve body y los cron permanecen desactivados", async () => {
    const qwikFetch = vi.fn(async () =>
      new Response("body que HEAD no debe entregar", {
        headers: { "Content-Type": "text/html" },
      }),
    );
    const env = environment({ AGORBIS_LAUNCH_MODE: "public-read-only" });
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://agorbis.com/manual/", { method: "HEAD" }),
      env,
      context(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");

    const event = controller("10 * * * *");
    await worker.scheduled(event, env, context());
    expect(event.noRetry).toHaveBeenCalledOnce();
    expect(qwikFetch).toHaveBeenCalledOnce();
  });

  it("acepta exactamente 5 MiB y entrega a Qwik los mismos bytes", async () => {
    const body = new Uint8Array(MAX_WORKER_REQUEST_BODY_BYTES).fill(37);
    const qwikFetch = vi.fn(async (request: Request) => {
      const restored = new Uint8Array(await request.arrayBuffer());
      expect(restored.byteLength).toBe(body.byteLength);
      expect(restored.every((byte) => byte === 37)).toBe(true);
      expect(request.headers.has("content-length")).toBe(false);
      return new Response("ok");
    });
    const worker = createAgorbisCloudflareWorker(qwikFetch);

    const response = await worker.fetch(
      new Request("https://agorbis.com/reclamos", {
        body,
        headers: { "Content-Length": String(body.byteLength) },
        method: "POST",
      }),
      environment(),
      context(),
    );

    expect(response.status).toBe(200);
    expect(qwikFetch).toHaveBeenCalledOnce();
  });

  it("rechaza por Content-Length antes de leer o invocar Qwik", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const request = new Request("https://agorbis.com/reclamos", {
      body: new Uint8Array([1]),
      headers: {
        "Content-Length": String(MAX_WORKER_REQUEST_BODY_BYTES + 1),
      },
      method: "POST",
    });

    const response = await worker.fetch(request, environment(), context());

    expect(response.status).toBe(413);
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'",
    );
    expect(qwikFetch).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it("rechaza un body chunked al primer byte por encima del límite", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const request = chunkedPost([
      new Uint8Array(MAX_WORKER_REQUEST_BODY_BYTES),
      new Uint8Array([1]),
    ]);

    const response = await worker.fetch(request, environment(), context());

    expect(response.status).toBe(413);
    expect(qwikFetch).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(true);
  });

  it("rechaza Content-Length malformado", async () => {
    const qwikFetch = vi.fn(async () => new Response("qwik"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const response = await worker.fetch(
      new Request("https://agorbis.com/reclamos", {
        body: new Uint8Array([1]),
        headers: { "Content-Length": "1, 2" },
        method: "POST",
      }),
      environment(),
      context(),
    );

    expect(response.status).toBe(400);
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("despacha cada schedule exacto por llamada interna autenticada", async () => {
    const publicFetch = vi.spyOn(globalThis, "fetch");
    const qwikFetch = vi.fn<QwikWorkerFetch>(async () => new Response("ok"));
    const env = environment();
    const ctx = context();
    const worker = createAgorbisCloudflareWorker(qwikFetch);

    for (const [cron, path] of Object.entries(CRON_ROUTE_BY_SCHEDULE)) {
      await worker.scheduled(controller(cron), env, ctx);
      const [request, passedEnv, passedContext] = qwikFetch.mock.calls.at(-1)!;
      expect(request.url).toBe(`https://agorbis.com${path}`);
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization")).toBe(
        `Bearer ${CRON_SECRET}`,
      );
      expect(passedEnv).toBe(env);
      expect(passedContext).toBe(ctx);
    }

    expect(qwikFetch).toHaveBeenCalledTimes(5);
    expect(publicFetch).not.toHaveBeenCalled();
    publicFetch.mockRestore();
  });

  it("falla cerrado y desactiva reintentos para cron desconocido", async () => {
    const qwikFetch = vi.fn(async () => new Response("ok"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const event = controller("* * * * *");

    await expect(
      worker.scheduled(event, environment(), context()),
    ).rejects.toThrow("Unknown Agorbis cron schedule");
    expect(event.noRetry).toHaveBeenCalledOnce();
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("falla cerrado sin un CRON_SECRET de al menos 32 caracteres", async () => {
    const qwikFetch = vi.fn(async () => new Response("ok"));
    const worker = createAgorbisCloudflareWorker(qwikFetch);
    const event = controller("10 * * * *");

    await expect(
      worker.scheduled(
        event,
        environment({ CRON_SECRET: "demasiado-corto" }),
        context(),
      ),
    ).rejects.toThrow("CRON_SECRET is not configured");
    expect(event.noRetry).toHaveBeenCalledOnce();
    expect(qwikFetch).not.toHaveBeenCalled();
  });

  it("consume la respuesta y falla ante un status no exitoso", async () => {
    const routeResponse = new Response("detalle que no debe registrarse", {
      status: 503,
    });
    const qwikFetch = vi.fn(async () => routeResponse);
    const worker = createAgorbisCloudflareWorker(qwikFetch);

    await expect(
      worker.scheduled(controller("5 0 * * *"), environment(), context()),
    ).rejects.toThrow("HTTP 503");
    expect(routeResponse.bodyUsed).toBe(true);
  });
});
