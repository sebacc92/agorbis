import { safeInternalPath } from "./http";

/** Conserva el destino interno al pasar por un paso intermedio de acceso. */
export function withAuthNext(
  step: string,
  next: string | null | undefined,
): string {
  const destination = safeInternalPath(next, "");
  if (!destination) return step;
  const url = new URL(step, "https://agorbis.invalid");
  url.searchParams.set("next", destination);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Evita envolver de nuevo un onboarding que ya lleva su destino final. */
export function onboardingPath(next: string | null | undefined): string {
  const destination = safeInternalPath(next, "");
  if (
    destination &&
    new URL(destination, "https://agorbis.invalid").pathname === "/onboarding"
  ) {
    return destination;
  }
  return withAuthNext("/onboarding", destination);
}

/**
 * Pasos del propio acceso: volver a uno de ellos después de entrar no lleva a
 * ningún lado, y la portada ya es el destino por defecto.
 */
const ACCESS_PATHS = [
  "/ingresar",
  "/registro",
  "/recuperar",
  "/reenviar-confirmacion",
  "/consentimiento",
  "/onboarding",
  "/vincular",
  "/acceso-google",
];

/**
 * Dónde volver después de ingresar, crear la cuenta o elegir residencia.
 *
 * `qaction` identifica una acción ya enviada: repetirla al volver sería
 * reenviar un formulario, así que se descarta. Devuelve `""` cuando la página
 * actual no es un destino útil.
 */
export function returnPathFor(current: URL | string): string {
  const url = new URL(current, "https://agorbis.invalid");
  url.searchParams.delete("qaction");
  // Carrera del router (D93, D96): al redirigir a ingresar durante una
  // navegación SPA, vuelve a pedir el loader de la ruta anterior con el
  // `?next=` recién armado, y `requireUser` anidaba otro `next` en cada
  // vuelta. Un `next` que apunta a la misma página no agrega nada: se quita.
  // Uno que apunta a otra (`/perfil/seguridad?next=/moderacion`) se conserva.
  const nested = url.searchParams.get("next");
  if (nested) {
    const target = safeInternalPath(nested, "");
    const samePage =
      !!target &&
      new URL(target, "https://agorbis.invalid").pathname.replace(/\/$/, "") ===
        url.pathname.replace(/\/$/, "");
    if (samePage) url.searchParams.delete("next");
  }
  if (url.pathname === "/" || url.pathname.startsWith("/auth/")) return "";
  if (
    ACCESS_PATHS.some(
      (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
    )
  ) {
    return "";
  }
  return safeInternalPath(`${url.pathname}${url.search}${url.hash}`, "");
}

/**
 * Enlace a ingresar o crear la cuenta que vuelve a la página actual.
 *
 * "Crear cuenta" no llevaba destino: quien llegaba por una encuesta compartida
 * terminaba el alta en la comunidad y tenía que volver a buscarla.
 */
export function authEntryHref(step: string, current: URL | string): string {
  return withAuthNext(step, returnPathFor(current));
}

/**
 * Adónde lleva la portada a quien ya tiene sesión: su inicio, o elegir la
 * residencia si todavía no la tiene. `null` para quien no ingresó.
 */
export function signedInHome(viewer: {
  userId: string | null;
  profile: { home_community_id: string | null } | null;
}): string | null {
  if (!viewer.userId) return null;
  return viewer.profile?.home_community_id ? "/inicio" : "/onboarding";
}
