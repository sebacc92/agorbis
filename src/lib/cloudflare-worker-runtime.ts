export type CloudflareWorkerEnv = Omit<Partial<Env>, "AGORBIS_LAUNCH_MODE"> &
  Pick<Env, "ASSETS"> & {
    AGORBIS_LAUNCH_MODE?: "closed" | "open" | "public-read-only";
  };

import {
  CLOUDFLARE_VERSION_OVERRIDE_HEADER,
  D72_CANARY_CAPABILITY_HEADER,
  parseAgorbisVersionOverride,
  verifyD72CanaryCapability,
} from "./d72-canary-capability";

export interface CloudflareWorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface CloudflareScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
  noRetry(): void;
}

export type QwikWorkerFetch = (
  request: Request,
  env: CloudflareWorkerEnv,
  ctx: CloudflareWorkerExecutionContext,
) => Promise<Response>;

const CANONICAL_ORIGIN = "https://agorbis.com";
const WWW_HOSTNAME = "www.agorbis.com";

/**
 * Superficie pública deliberadamente acotada para el lanzamiento de sólo
 * lectura. Las rutas de cuenta, formularios de alta, perfiles privados,
 * moderación, creación y endpoints internos no entran por descarte: sólo se
 * permite lo que aparece acá.
 */
export const READ_ONLY_PUBLIC_EXACT_PATHS = Object.freeze([
  "/",
  "/404.html",
  "/eliminar-datos",
  "/eliminar-datos/",
  "/explorar",
  "/explorar/",
  "/instituciones",
  "/manual",
  "/manual/",
  "/manifest.webmanifest",
  "/moderacion-y-apelaciones",
  "/normas-comunitarias",
  "/privacidad",
  "/robots.txt",
  "/sitemap.xml",
  "/subencargados",
  "/terminos",
  "/transferencias-internacionales",
]);

const READ_ONLY_CANONICAL_TRAILING_SLASH_PATHS = Object.freeze([
  "/explorar",
  "/manual",
]);

const READ_ONLY_PUBLIC_PATH_PATTERNS = Object.freeze([
  /^\/c\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:debates|encuestas|presupuesto|proyectos|reclamos|sub))?\/?$/,
  /^\/(?:debates|encuestas|proyectos|reclamos)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/?$/i,
  /^\/instituciones\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/,
]);

const READ_ONLY_STATIC_PATH_PATTERNS = Object.freeze([
  /^\/(?:assets|build)\/[A-Za-z0-9._/-]+$/,
  /^\/(?:favicon\.svg|icon-(?:192|512|maskable)\.png|og\.png|world-map\.svg)$/,
]);

const READ_ONLY_FORBIDDEN_REQUEST_HEADERS = Object.freeze([
  "sec-websocket-key",
  "upgrade",
  "x-http-method-override",
  "x-method-override",
  "x-qrl",
]);

/**
 * 5 MiB soportan las cuatro imágenes de reclamo (4 × 950 KiB = 3,71 MiB),
 * dejan ~1,29 MiB para boundaries y campos multipart y también cubren el avatar
 * de 2 MiB. Se aplica antes de que Qwik parsee el formulario para no reemplazar
 * el límite de plataforma que anteriormente aportaba Vercel por uno de 100 MB.
 */
export const MAX_WORKER_REQUEST_BODY_BYTES = 5 * 1024 * 1024;

export const CRON_ROUTE_BY_SCHEDULE = Object.freeze({
  "10 * * * *": "/internal/process-account-deletions",
  "5 0 * * *": "/internal/sync-notifications",
  "25 0 * * *": "/internal/escalate-claims",
  "20 3 * * *": "/internal/cleanup-claim-uploads",
  "40 3 * * *": "/internal/purge-retained-data",
} as const);

function plainResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function closedLaunchResponse(request: Request): Response {
  const response = plainResponse(503, "Agorbis todavía no está abierto.");
  response.headers.set("Retry-After", "300");
  if (request.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}

function deniedCanaryResponse(request: Request): Response {
  const response = plainResponse(403, "Canary access denied.");
  response.headers.set("X-Agorbis-Canary", "denied");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (request.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}

function canaryResponse(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Agorbis-Canary", "active");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function authorizeCanaryOverride(
  request: Request,
  env: CloudflareWorkerEnv,
): Promise<
  | { canary: false; request: Request }
  | { canary: true; request: Request }
  | { canary: true; response: Response }
> {
  const override = request.headers.get(CLOUDFLARE_VERSION_OVERRIDE_HEADER);
  const capability = request.headers.get(D72_CANARY_CAPABILITY_HEADER);
  if (override === null && capability === null) {
    return { canary: false, request };
  }
  // Una capability huérfana nunca llega al router ni a logs de aplicación. En
  // particular, un proxy que quite sólo el Version Override no puede convertir
  // el token efímero en un header ordinario después del cutover.
  if (override === null) {
    return { canary: true, response: deniedCanaryResponse(request) };
  }

  const versionId = parseAgorbisVersionOverride(override);
  const url = new URL(request.url);
  const allowedOrigin =
    url.protocol === "https:" &&
    ["agorbis.com", WWW_HOSTNAME].includes(url.hostname.toLowerCase()) &&
    url.port === "";
  const binding =
    versionId && allowedOrigin
      ? await verifyD72CanaryCapability({
          token: capability,
          secret: env.CRON_SECRET,
          expectedVersionId: versionId,
          now: new Date(),
        })
      : null;
  if (!binding) {
    return { canary: true, response: deniedCanaryResponse(request) };
  }

  // Ninguno de los dos headers operativos llega al router, Supabase ni logs de
  // aplicación. Cloudflare ya resolvió la Version antes de ejecutar el Worker.
  const headers = new Headers(request.headers);
  headers.delete(CLOUDFLARE_VERSION_OVERRIDE_HEADER);
  headers.delete(D72_CANARY_CAPABILITY_HEADER);
  return { canary: true, request: new Request(request, { headers }) };
}

function isReadOnlyPublicPath(url: URL): boolean {
  const { pathname } = url;
  // URL.pathname conserva los escapes. Rechazar separadores o bytes nulos
  // codificados evita que Worker y router interpreten dos rutas distintas.
  if (pathname.includes("%") || pathname.includes("\\")) return false;
  if (READ_ONLY_PUBLIC_EXACT_PATHS.includes(pathname)) return true;
  return (
    READ_ONLY_PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    READ_ONLY_STATIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

function hasAllowedReadOnlyQuery(url: URL): boolean {
  const { pathname, searchParams } = url;

  // Estas dos páginas tenían búsquedas libres (`q`) que el preview no debe
  // recibir ni propagar a Supabase/logs. En explorar se conservan sólo los
  // parámetros estructurales necesarios para navegar la jerarquía o el mapa.
  if (pathname === "/instituciones") return searchParams.size === 0;
  if (pathname !== "/explorar" && pathname !== "/explorar/") return true;

  const allowed = new Set(["parent", "view"]);
  if ([...searchParams.keys()].some((key) => !allowed.has(key))) return false;
  if (
    searchParams.getAll("parent").length > 1 ||
    searchParams.getAll("view").length > 1
  ) {
    return false;
  }

  const parent = searchParams.get("parent");
  if (
    parent !== null &&
    (parent.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parent))
  ) {
    return false;
  }
  const view = searchParams.get("view");
  return view === null || view === "map";
}

function readonlyBlockedResponse(request: Request): Response {
  const response = plainResponse(
    403,
    "Agorbis está disponible temporalmente sólo para lectura.",
  );
  response.headers.set("X-Agorbis-Launch-Mode", "public-read-only");
  if (request.method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}

function replaceCspDirective(
  policy: string,
  directive: string,
  replacement: string,
): string {
  const expression = new RegExp(`(?:^|;\\s*)${directive}\\s+[^;]*`, "i");
  if (!expression.test(policy)) return `${policy}; ${replacement}`;
  return policy.replace(expression, (match) => {
    const separator = match.startsWith(";") ? "; " : "";
    return `${separator}${replacement}`;
  });
}

function readonlyResponseHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  // Ninguna respuesta del preview puede crear o refrescar una cookie Auth.
  // Se elimina todo Set-Cookie: las preferencias no son necesarias para leer.
  headers.delete("set-cookie");
  headers.delete("refresh");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Agorbis-Launch-Mode", "public-read-only");
  headers.set("X-Content-Type-Options", "nosniff");

  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html")) {
    let policy = headers.get("content-security-policy") ?? "default-src 'self'";
    policy = policy.replaceAll(" https://challenges.cloudflare.com", "");
    policy = replaceCspDirective(policy, "connect-src", "connect-src 'self'");
    policy = replaceCspDirective(policy, "form-action", "form-action 'none'");
    policy = replaceCspDirective(policy, "frame-src", "frame-src 'none'");
    policy = replaceCspDirective(
      policy,
      "img-src",
      "img-src 'self' data: blob:",
    );
    headers.set("Content-Security-Policy", policy);
    headers.set(
      "Permissions-Policy",
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
    );
  }
  return headers;
}

function readonlyCanonicalRedirect(
  request: Request,
  url: URL,
): Response | undefined {
  if (!READ_ONLY_CANONICAL_TRAILING_SLASH_PATHS.includes(url.pathname)) {
    return undefined;
  }

  // Qwik aplica el slash canónico después de ejecutar loaders. Resolver estos
  // dos redirects públicos en el gate evita consultar dependencias para una
  // respuesta vacía y conserva la query sin seguir ninguna URL.
  const destination = new URL(
    `${url.pathname}/${url.search}`,
    CANONICAL_ORIGIN,
  );
  if (
    destination.origin !== CANONICAL_ORIGIN ||
    destination.username ||
    destination.password ||
    !isReadOnlyPublicPath(destination) ||
    !hasAllowedReadOnlyQuery(destination)
  ) {
    return readonlyBlockedResponse(request);
  }

  const response = new Response(null, {
    status: 301,
    headers: { Location: `${destination.pathname}${destination.search}` },
  });
  return new Response(null, {
    status: response.status,
    headers: readonlyResponseHeaders(response),
  });
}

function sanitizeReadOnlyRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  // El preview no acepta ninguna identidad previa. Qwik y Supabase sólo ven
  // una lectura anónima aunque el navegador conserve cookies de otra etapa.
  headers.delete("authorization");
  headers.delete("cookie");
  headers.delete("proxy-authorization");
  return new Request(request, { headers });
}

async function dispatchReadOnlyPreview(
  request: Request,
  env: CloudflareWorkerEnv,
  ctx: CloudflareWorkerExecutionContext,
  qwikFetch: QwikWorkerFetch,
): Promise<Response> {
  if (
    !["GET", "HEAD"].includes(request.method) ||
    READ_ONLY_FORBIDDEN_REQUEST_HEADERS.some((name) =>
      request.headers.has(name),
    )
  ) {
    return readonlyBlockedResponse(request);
  }

  const url = new URL(request.url);
  if (url.origin !== CANONICAL_ORIGIN) {
    return readonlyBlockedResponse(request);
  }
  if (!isReadOnlyPublicPath(url) || !hasAllowedReadOnlyQuery(url)) {
    return readonlyBlockedResponse(request);
  }

  const canonical = readonlyCanonicalRedirect(request, url);
  if (canonical) return canonical;

  const sanitized = sanitizeReadOnlyRequest(request);
  const response = await qwikFetch(sanitized, env, ctx);
  const headers = readonlyResponseHeaders(response);

  // Un loader permitido no puede usar una redirección como salto hacia Auth o
  // una ruta de escritura. Las redirecciones relativas se resuelven contra el
  // request ya saneado y vuelven a atravesar la misma allowlist.
  if (response.status >= 300 && response.status < 400) {
    const location = headers.get("location");
    if (!location) return readonlyBlockedResponse(request);
    try {
      const destination = new URL(location, sanitized.url);
      if (
        destination.username ||
        destination.password ||
        destination.origin !== CANONICAL_ORIGIN ||
        !isReadOnlyPublicPath(destination) ||
        !hasAllowedReadOnlyQuery(destination)
      ) {
        return readonlyBlockedResponse(request);
      }
    } catch {
      return readonlyBlockedResponse(request);
    }
  }

  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function canonicalRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const shouldRedirect =
    hostname === WWW_HOSTNAME ||
    (hostname === "agorbis.com" && url.protocol === "http:");
  if (!shouldRedirect) return undefined;
  const requestWasHttps = url.protocol === "https:";
  url.protocol = "https:";
  url.hostname = "agorbis.com";
  url.port = "";
  const headers = new Headers({
    "Cache-Control": "no-store",
    Location: url.toString(),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (requestWasHttps) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return new Response(null, {
    status: 308,
    headers,
  });
}

type BoundedRequestResult =
  | { request: Request; response?: never }
  | { request?: never; response: Response };

async function requestWithBoundedBody(
  request: Request,
): Promise<BoundedRequestResult> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { request };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return { response: plainResponse(400, "Invalid request body.") };
    }
    if (BigInt(declaredLength) > BigInt(MAX_WORKER_REQUEST_BODY_BYTES)) {
      return { response: plainResponse(413, "Request body too large.") };
    }
  }
  if (!request.body) return { request };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WORKER_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { response: plainResponse(413, "Request body too large.") };
      }
      chunks.push(value);
    }
  } catch {
    return { response: plainResponse(400, "Invalid request body.") };
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // El tamaño fue medido localmente; no se propaga un Content-Length provisto
  // por el cliente que podría no coincidir con los bytes efectivamente leídos.
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return {
    request: new Request(request, {
      body,
      headers,
    }),
  };
}

async function dispatchScheduled(
  controller: CloudflareScheduledController,
  env: CloudflareWorkerEnv,
  ctx: CloudflareWorkerExecutionContext,
  qwikFetch: QwikWorkerFetch,
): Promise<void> {
  if (env.AGORBIS_LAUNCH_MODE !== "open") {
    controller.noRetry();
    return;
  }
  const path =
    CRON_ROUTE_BY_SCHEDULE[
      controller.cron as keyof typeof CRON_ROUTE_BY_SCHEDULE
    ];
  if (!path) {
    controller.noRetry();
    throw new Error("Unknown Agorbis cron schedule.");
  }

  const secret =
    typeof env.CRON_SECRET === "string" ? env.CRON_SECRET.trim() : "";
  if (secret.length < 32 || secret.length > 4096) {
    controller.noRetry();
    throw new Error("CRON_SECRET is not configured.");
  }

  // Invocación interna directa: no sale a Internet ni depende del DNS público.
  const response = await qwikFetch(
    new Request(new URL(path, CANONICAL_ORIGIN), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "User-Agent": "agorbis-cloudflare-cron/1",
      },
    }),
    env,
    ctx,
  );

  // Consumir el body permite detectar fallos de streaming antes de dar la
  // ejecución por terminada. El contenido nunca se registra (podría ser sensible).
  await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(`Agorbis cron route returned HTTP ${response.status}.`);
  }
}

export function createAgorbisCloudflareWorker(qwikFetch: QwikWorkerFetch) {
  return {
    async fetch(
      request: Request,
      env: CloudflareWorkerEnv,
      ctx: CloudflareWorkerExecutionContext,
    ): Promise<Response> {
      const canary = await authorizeCanaryOverride(request, env);
      if ("response" in canary) return canary.response;
      const effectiveRequest = canary.request;
      // Wrangler debe configurar assets.run_worker_first=true para que incluso
      // una URL estática de www llegue a este redirect antes del binding ASSETS.
      const redirect = canonicalRedirect(effectiveRequest);
      if (redirect) {
        return canary.canary
          ? canaryResponse(redirect, effectiveRequest)
          : redirect;
      }
      if (env.AGORBIS_LAUNCH_MODE === "public-read-only") {
        const response = await dispatchReadOnlyPreview(
          effectiveRequest,
          env,
          ctx,
          qwikFetch,
        );
        return canary.canary
          ? canaryResponse(response, effectiveRequest)
          : response;
      }
      if (env.AGORBIS_LAUNCH_MODE !== "open") {
        const response = closedLaunchResponse(effectiveRequest);
        return canary.canary
          ? canaryResponse(response, effectiveRequest)
          : response;
      }

      const bounded = await requestWithBoundedBody(effectiveRequest);
      if (bounded.response) {
        return canary.canary
          ? canaryResponse(bounded.response, effectiveRequest)
          : bounded.response;
      }
      const response = await qwikFetch(bounded.request, env, ctx);
      return canary.canary
        ? canaryResponse(response, effectiveRequest)
        : response;
    },

    async scheduled(
      controller: CloudflareScheduledController,
      env: CloudflareWorkerEnv,
      ctx: CloudflareWorkerExecutionContext,
    ): Promise<void> {
      await dispatchScheduled(controller, env, ctx, qwikFetch);
    },
  };
}
