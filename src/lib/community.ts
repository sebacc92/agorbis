import type { ContentType, Tables } from "./database.types.helpers";
import { DEFAULT_LOCALE, localeTag, type Locale } from "./i18n";

export type Community = Tables<"communities">;

/** Qwik 2 puede dar params vacíos al loader de un layout anidado. */
export function communitySlugFromRoute(
  params: Readonly<Record<string, string>>,
  url: URL,
): string {
  if (params.slug) return params.slug;
  const match = /^\/c\/([^/]+)(?:\/|$)/.exec(url.pathname);
  if (!match) return "";
  try {
    const slug = decodeURIComponent(match[1]);
    return slug.includes("/") ? "" : slug;
  } catch {
    return "";
  }
}

/** La creación pertenece a su sección: `reclamos/nuevo` activa Reclamos. */
export function communitySectionFromPath(
  pathname: string,
  slug: string,
): string {
  const base = `/c/${slug}/`;
  return pathname.startsWith(base)
    ? (pathname.slice(base.length).split("/")[0] ?? "")
    : "";
}

/**
 * ¿Es el formulario de una sección (`reclamos/nuevo`, `encuestas/nueva`)? No
 * compara con el slug de la comunidad: al cambiar de nivel desde el formulario, la
 * URL nueva llega antes que el dato de la comunidad. Exige una sección para que una
 * comunidad llamada "nueva" conserve su cabecera. La barra final es opcional
 * porque un `Link` llega sin ella.
 */
export function isCommunityCreationPath(pathname: string): boolean {
  return /^\/c\/[^/]+\/[^/]+\/nuev[oa]\/?$/.test(pathname);
}

/** Lo mínimo que necesita el breadcrumb y las tarjetas de comunidad. */
export type CommunityRef = Pick<
  Community,
  "id" | "slug" | "name" | "emoji" | "level" | "path"
>;

/**
 * Todos los `path` de los ancestros de una comunidad, incluida ella misma.
 * `earth.south-america.argentina` → ['earth', 'earth.south-america', 'earth.south-america.argentina']
 */
export function ancestorPaths(path: string): string[] {
  const segments = path.split(".");
  return segments.map((_, i) => segments.slice(0, i + 1).join("."));
}

/** ¿`ancestor` está en la cadena ascendente de `descendant` (o es el mismo)? */
export function isAncestorPath(ancestor: string, descendant: string): boolean {
  return descendant === ancestor || descendant.startsWith(`${ancestor}.`);
}

/**
 * Espejo en el cliente de la función SQL `is_member`. Sirve para decidir qué
 * mostrar; **nunca** para autorizar. La autorización vive en RLS.
 */
export function isMemberOf(
  homePath: string | null | undefined,
  communityPath: string,
): boolean {
  if (!homePath) return false;
  return isAncestorPath(communityPath, homePath);
}

/*
 * Acá vivía `sortByDepth`, que ordenaba por profundidad de `path`. No la
 * llamaba nadie: las cadenas ya llegan ordenadas desde la base con
 * `.order("level")`, que es el mismo criterio y no depende de contar puntos.
 */

/** Escapa los comodines de `LIKE`. Los slugs no los tienen, pero el input libre sí. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Comparador de nombres en español: pone "Álava" junto a "Alava" y no al final.
 */
export function compareNames(
  a: string,
  b: string,
  locale: Locale = DEFAULT_LOCALE,
): number {
  return a.localeCompare(b, localeTag(locale), { sensitivity: "base" });
}

/** Rutas canónicas, en un solo lugar para que no se desincronicen. */
export const routes = {
  community: (slug: string) => `/c/${slug}`,
  communityTab: (slug: string, tab: string) => `/c/${slug}/${tab}`,
  members: (slug: string) => `/c/${slug}/miembros`,
  poll: (id: string) => `/encuestas/${id}`,
  debate: (id: string) => `/debates/${id}`,
  claim: (id: string) => `/reclamos/${id}`,
  project: (id: string) => `/proyectos/${id}`,
  agreement: (id: string) => `/acuerdos/${id}`,
  /**
   * La creación cuelga de la comunidad (`/c/<slug>/reclamos/nuevo`) y no de una
   * ruta suelta con `?c=`: así el destino de publicación es parte de la URL y
   * no un parámetro que se puede perder al compartir el enlace.
   */
  newContent: (slug: string, path: string) => `/c/${slug}/${path}`,
} as const;

/**
 * La ruta de una publicación a partir de su tipo.
 *
 * Los cuatro tipos de contenido se guardan como `content_type` en varias tablas
 * (relaciones, respuestas institucionales, reportes), así que hay código que
 * recibe el tipo como dato y no puede llamar a `routes.poll` directamente.
 * Antes cada uno resolvía la ruta con su propia cadena de ternarios: tres
 * copias que había que recordar tocar juntas si una ruta cambiaba.
 */
export function contentHref(type: ContentType, id: string): string {
  const byType: Record<ContentType, (id: string) => string> = {
    poll: routes.poll,
    debate: routes.debate,
    claim: routes.claim,
    project: routes.project,
  };
  return byType[type](id);
}
