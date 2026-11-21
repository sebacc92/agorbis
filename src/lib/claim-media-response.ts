import type { RequestEvent } from "@qwik.dev/router";
import type { DB } from "./supabase";

const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** Respuesta opaca: no revela si falló el mapping, Storage o la autorización. */
export function claimImageNotFound(ev: RequestEvent): void {
  ev.headers.set("Cache-Control", "private, no-store");
  ev.headers.set("X-Content-Type-Options", "nosniff");
  ev.send(404, "");
}

/**
 * Descarga con service_role un objeto cuyo acceso ya autorizó la ruta.
 * `nosniff` y la allowlist mantienen inerte un upload que haya evitado la
 * validación de bytes del formulario hablando directo con Storage.
 */
export async function sendClaimImage(
  ev: RequestEvent,
  admin: DB,
  path: string,
  cacheControl: string,
): Promise<void> {
  const { data, error } = await admin.storage.from("claims").download(path);
  const type = data?.type?.toLowerCase() ?? "";
  if (error || !data || !SAFE_IMAGE_TYPES.has(type)) {
    claimImageNotFound(ev);
    return;
  }

  const headers = new Headers({
    "Cache-Control": cacheControl,
    "Content-Disposition": "inline",
    "Content-Length": String(data.size),
    "Content-Type": type,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  ev.send(
    new Response(ev.method === "HEAD" ? null : data, {
      status: 200,
      headers,
    }),
  );
}

/** Sirve únicamente un avatar que la ruta ya comprobó como referencia vigente. */
export async function sendAvatarImage(
  ev: RequestEvent,
  admin: DB,
  path: string,
): Promise<void> {
  const { data, error } = await admin.storage.from("avatars").download(path);
  const type = data?.type?.toLowerCase() ?? "";
  if (error || !data || !SAFE_IMAGE_TYPES.has(type) || type === "image/avif") {
    claimImageNotFound(ev);
    return;
  }

  ev.send(
    new Response(ev.method === "HEAD" ? null : data, {
      status: 200,
      headers: new Headers({
        // Al cambiar o borrar el avatar, la referencia anterior deja de ser
        // accesible. Un cache corto evita revivirla durante meses en un CDN.
        "Cache-Control": "public, max-age=300, s-maxage=300, no-transform",
        "Content-Disposition": "inline",
        "Content-Length": String(data.size),
        "Content-Type": type,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      }),
    }),
  );
}
