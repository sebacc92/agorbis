import { isDev } from "@qwik.dev/core/build";
import { setServerPlatform } from "@qwik.dev/core/server";
import {
  _TextEncoderStream_polyfill,
  getErrorHtml,
  isStaticPath,
  mergeHeadersCookies,
  requestHandler,
  type ServerRenderOptions,
} from "@qwik.dev/router/middleware/request-handler";
import type {
  CloudflareWorkerEnv,
  CloudflareWorkerExecutionContext,
  QwikWorkerFetch,
} from "./cloudflare-worker-runtime";
import { getTrustedClientIp } from "./client-ip";
import { logFailure } from "./log";

const DYNAMIC_ASSET_COLLISION_PATHS = new Set([
  "/sitemap.xml",
  "/404.html",
  "/404.html/",
]);

function runtimeString(
  env: CloudflareWorkerEnv,
  key: string,
): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Variante deliberadamente local del middleware Cloudflare de Qwik Router
 * 2.0.0-beta.40. Conserva el contrato oficial pero elimina su Cache API
 * compartida: esa versión intentaba guardar cualquier GET 2xx que tuviera
 * Cache-Control, incluso respuestas `private, no-store` de cuentas distintas.
 */
export function createQwikCloudflareWorkerRouter(
  options: ServerRenderOptions,
): QwikWorkerFetch {
  try {
    new globalThis.TextEncoderStream();
  } catch {
    globalThis.TextEncoderStream =
      _TextEncoderStream_polyfill as unknown as typeof TextEncoderStream;
  }

  if (options.manifest) setServerPlatform(options.manifest);

  return async function onCloudflareWorkerFetch(
    request: Request,
    env: CloudflareWorkerEnv,
    ctx: CloudflareWorkerExecutionContext,
  ): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (
        !DYNAMIC_ASSET_COLLISION_PATHS.has(url.pathname) &&
        isStaticPath(request.method, url)
      ) {
        return env.ASSETS.fetch(request);
      }

      const runtimeEvent = {
        request,
        env: {
          get(key: string) {
            return runtimeString(env, key);
          },
        },
      };

      const handledResponse = await requestHandler<Response>(
        {
          mode: "server",
          locale: undefined,
          url,
          request,
          env: {
            get(key) {
              return runtimeString(env, key);
            },
          },
          getWritableStream: (status, headers, cookies, resolve) => {
            const { readable, writable } = new TransformStream<Uint8Array>();
            resolve(
              new Response(readable, {
                status,
                headers: mergeHeadersCookies(headers, cookies),
              }),
            );
            return writable;
          },
          getClientConn: () => ({
            ip: getTrustedClientIp(runtimeEvent) ?? "",
            country:
              env.AGORBIS_RUNTIME === "cloudflare-workers"
                ? request.headers.get("CF-IPCountry") || ""
                : "",
          }),
          platform: { request, env, ctx },
        },
        options,
      );

      if (handledResponse) {
        ctx.waitUntil(
          handledResponse.completion
            .then((completion) => {
              if (completion) {
                logFailure({ scope: "worker/router-completion" }, completion);
              }
            })
            .catch((error) => {
              logFailure({ scope: "worker/router-completion" }, error);
            }),
        );
        const response = await handledResponse.response;
        if (response) return response;
      }

      const notFoundHtml =
        !request.headers.get("accept")?.includes("text/html") ||
        isStaticPath(request.method || "GET", url)
          ? "Not Found"
          : getErrorHtml(404, "Not Found");
      return new Response(notFoundHtml, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Not-Found": url.pathname,
        },
      });
    } catch (error) {
      logFailure({ scope: "worker/router" }, error);
      return new Response(
        isDev ? String(error || "Error") : "Internal Server Error",
        {
          status: 500,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Error": "cloudflare-workers",
          },
        },
      );
    }
  };
}
