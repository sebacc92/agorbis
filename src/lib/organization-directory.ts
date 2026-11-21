import { readPage } from "./pagination";

export const ORGANIZATION_PAGE_SIZE = 24;
export const ORGANIZATION_TYPES: Record<string, string> = {
  government: "Organismo público",
  ngo: "Organización social",
  institution: "Institución",
  company: "Empresa",
  other: "Otra",
};

/** Los loaders estrictos pueden recibir params vacíos al cambiar la query. */
export function organizationSlugFromRoute(
  params: Readonly<Record<string, string>>,
  url: URL,
) {
  if (params.slug) return params.slug;
  const match = /^\/instituciones\/([^/]+)(?:\/|$)/.exec(url.pathname);
  if (!match) return "";
  try {
    const slug = decodeURIComponent(match[1]);
    return slug.includes("/") ? "" : slug;
  } catch {
    return "";
  }
}

export function readOrganizationFilters(params: URLSearchParams) {
  const requestedType = params.get("tipo") ?? "";
  return {
    query: (params.get("q") ?? "").trim().slice(0, 120),
    type: Object.hasOwn(ORGANIZATION_TYPES, requestedType) ? requestedType : "",
    page: readPage(params),
  };
}

export function organizationNamePattern(query: string) {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function organizationListHref(
  filters: { query: string; type: string },
  page = 1,
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.type) params.set("tipo", filters.type);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}
