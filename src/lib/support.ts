/**
 * Donaciones por enlace externo (D128).
 *
 * Agorbis no cobra, no embebe un medio de pago y no sabe quién dona: sólo
 * ofrece un enlace al perfil de Cafecito del responsable, que la persona abre
 * con un clic. Por eso no hay host nuevo en la CSP ni en `/subencargados`.
 */

/**
 * Perfil de Cafecito, con la forma `https://cafecito.app/<usuario>`.
 *
 * Si queda vacío, ni el pie ni `/apoyar` muestran un botón. Es una constante
 * y no una variable de entorno porque no es un secreto ni cambia entre
 * ambientes, y así el cambio queda en el historial.
 */
export const DONATION_URL = "https://cafecito.app/agorbis";

const DONATION_HOST = "cafecito.app";
const DONATION_PROFILE_PATH = /^\/[A-Za-z0-9_.-]{1,64}$/;

/**
 * El enlace de donación listo para usar, o `null` si no hay ninguno válido.
 *
 * Falla cerrado: cualquier cosa que no sea exactamente un perfil de Cafecito
 * apaga el botón. Los parámetros y el fragmento se rechazan en vez de
 * limpiarse porque son el lugar donde entraría un identificador de la persona
 * o de la comunidad, y un enlace así cargado es un error que conviene ver.
 */
export function donationLink(url: string = DONATION_URL): string | null {
  const candidate = url.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const isCafecitoProfile =
    parsed.protocol === "https:" &&
    parsed.hostname === DONATION_HOST &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    // `search` y `hash` quedan vacíos con un "?" o un "#" pelados.
    !candidate.includes("?") &&
    !candidate.includes("#") &&
    DONATION_PROFILE_PATH.test(parsed.pathname);

  return isCafecitoProfile
    ? `https://${DONATION_HOST}${parsed.pathname}`
    : null;
}

export interface SupportFooterLink {
  href: string;
  label: string;
}

/**
 * A dónde lleva cualquier entrada a "Apoyar", o `null` si no hay cómo donar.
 *
 * Siempre a la página propia, nunca al proveedor: antes de salir del sitio la
 * persona lee qué sostiene el aporte y qué no compra (D128). El pie, el menú
 * de la cuenta y la portada pasan por acá para apagarse juntos.
 */
export function supportPageHref(url: string = DONATION_URL): string | null {
  return donationLink(url) ? "/apoyar" : null;
}

/** Entrada "Apoyar" del pie. */
export function supportFooterLinks(
  url: string = DONATION_URL,
): SupportFooterLink[] {
  const href = supportPageHref(url);
  return href ? [{ href, label: "Apoyar" }] : [];
}
