import type { RequestEvent, RequestEventBase } from "@qwik.dev/router";

/**
 * Origen público del sitio, normalizado.
 *
 * `PUBLIC_SITE_URL` es configuración operativa y puede llegar con o sin barra
 * final. Sin normalizar, `${origin}/sitemap.xml` producía
 * `https://ejemplo.com//sitemap.xml`: una URL distinta para el rastreador y una
 * canónica que no coincide con la que sirve la página.
 *
 * Respaldo al origen de la petición para que funcione en local y en preview.
 */
export function siteOrigin(ev: RequestEventBase): string {
  const configured = ev.env.get("PUBLIC_SITE_URL")?.trim();
  if (!configured) return ev.url.origin;

  try {
    const parsed = new URL(configured);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("origen público inválido");
    }
    // Los callbacks nunca heredan paths, query strings ni fragments escritos
    // por error en el panel de despliegue.
    return parsed.origin;
  } catch {
    throw new Error("PUBLIC_SITE_URL debe ser un origen http(s) válido.");
  }
}

/** Callback canónico para OAuth (PKCE). */
export function authCallbackUrl(
  ev: RequestEventBase,
  options: { next?: string | null; recovery?: boolean } = {},
): string {
  const callback = new URL("/auth/callback", siteOrigin(ev));
  if (options.next) {
    callback.searchParams.set("next", safeInternalPath(options.next));
  }
  if (options.recovery) callback.searchParams.set("recovery", "1");
  return callback.toString();
}

/**
 * Destino que Supabase inserta en los correos de Auth.
 *
 * Las plantillas agregan el `token_hash` y el tipo de flujo. El token llega
 * primero a una pantalla propia y sólo se consume cuando la persona confirma
 * mediante POST; un scanner que haga GET no puede invalidarlo.
 */
export function authEmailConfirmUrl(
  ev: RequestEventBase,
  options: { next?: string | null } = {},
): string {
  const confirm = new URL("/auth/confirm", siteOrigin(ev));
  confirm.searchParams.set("next", safeInternalPath(options.next, "/"));
  return confirm.toString();
}

/** UUID RFC 4122: evita enviar texto arbitrario a filtros/RPC de rutas. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_PATTERN.test(value);
}

/**
 * Devuelve únicamente una ruta del mismo sitio.
 *
 * Comprobar sólo `startsWith("/")` no alcanza: los navegadores tratan barras
 * invertidas como separadores de URL, por lo que `/\\evil.example` puede
 * terminar fuera del sitio. Resolver contra un origen fijo deja que el parser
 * de URL aplique exactamente esas normalizaciones antes de decidir.
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/")) return fallback;

  try {
    const base = "https://agorbis.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * ¿Ya se hizo esto hace poco en este navegador?
 *
 * Sirve para tareas de escritura que corren "por las dudas" en cada carga y no
 * necesitan esa frecuencia: registrar una visita para métricas, sincronizar
 * notificaciones vencidas. Eran un INSERT y un SELECT en cada request de cada
 * sesión, todo el día, para producir a lo sumo una fila por día.
 *
 * La cookie es una pista de rendimiento, no una autorización: si se borra o se
 * falsifica, lo único que pasa es que la tarea corre de más o de menos, y las
 * dos son idempotentes en la base. Por eso no va firmada.
 *
 * Devuelve `true` si conviene saltearla, y si no, marca el momento y devuelve
 * `false`.
 */
export function throttledByCookie(
  ev: RequestEventBase,
  name: string,
  seconds: number,
  now: number = Date.now(),
): boolean {
  const previous = Number(ev.cookie.get(name)?.value);
  if (Number.isFinite(previous) && now - previous < seconds * 1000) return true;

  ev.cookie.set(name, String(now), {
    path: "/",
    maxAge: seconds,
    sameSite: "lax",
    httpOnly: true,
    secure: ev.url.protocol === "https:",
  });
  return false;
}

/** Respuesta JSON de un endpoint de mantenimiento: nunca se cachea. */
export function sendJson(
  ev: RequestEvent,
  status: number,
  payload: unknown,
): void {
  ev.headers.set("Content-Type", "application/json; charset=utf-8");
  ev.headers.set("Cache-Control", "no-store");
  ev.send(status, JSON.stringify(payload));
}

interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual?(left: BufferSource, right: BufferSource): boolean;
}

function isNodeTestRuntime(): boolean {
  if (typeof process === "undefined" || process.release?.name !== "node") {
    return false;
  }
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

async function equalSha256(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const subtle = crypto.subtle as TimingSafeSubtleCrypto;
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(leftDigest, rightDigest);
  }

  // Node no implementa la extensión timingSafeEqual de Workers. Este fallback
  // se habilita únicamente en procesos de prueba; un runtime real sin la
  // primitiva esperada falla cerrado.
  if (!isNodeTestRuntime()) return false;
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Autentica un endpoint de `/internal` mediante un Bearer server-only.
 *
 * Devuelve `false` habiendo respondido 401 — el handler sólo tiene que cortar.
 * Sin `CRON_SECRET` en el entorno, sin la primitiva constante del runtime o
 * ante cualquier diferencia no se autoriza a nadie.
 */
export async function cronAuthorized(ev: RequestEvent): Promise<boolean> {
  const secret = ev.env.get("CRON_SECRET")?.trim();
  const authorization = ev.request.headers.get("authorization") ?? "";
  const authorized =
    !!secret &&
    secret.length >= 32 &&
    secret.length <= 4096 &&
    authorization.length <= 8192 &&
    (await equalSha256(authorization, `Bearer ${secret}`));
  if (!authorized) {
    sendJson(ev, 401, { error: "No autorizado" });
    return false;
  }
  return true;
}
