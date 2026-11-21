import { CLAIM_CATEGORIES } from "./constants";
import type { ClaimCategory } from "./database.types.helpers";

export const CLAIM_SEARCH_MAX_LENGTH = 100;

export interface ClaimFilters {
  query: string;
  category: ClaimCategory | null;
  status: "todos" | "resueltos" | "abiertos";
  sort: "recientes" | "apoyados";
}

export function readClaimFilters(params: URLSearchParams): ClaimFilters {
  const requestedCategory = params.get("categoria");
  const requestedStatus = params.get("estado");
  return {
    query: (params.get("q") ?? "")
      // Se quitan controles que no representan una palabra de búsqueda.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, CLAIM_SEARCH_MAX_LENGTH),
    category:
      CLAIM_CATEGORIES.find((item) => item.key === requestedCategory)?.key ??
      null,
    status:
      requestedStatus === "resueltos" || requestedStatus === "abiertos"
        ? requestedStatus
        : "todos",
    sort: params.get("orden") === "apoyados" ? "apoyados" : "recientes",
  };
}

/**
 * La consulta es una subcadena literal, incluso si contiene comas, comillas o
 * comodines. `imatch` evita el alias `*` de ilike; se escapan por separado la
 * regex de PostgreSQL y la cadena de la gramática de PostgREST.
 */
export function claimSearchFilter(
  query: string,
  secondaryField: "description" | "location_text" = "description",
): string | null {
  if (!query) return null;
  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = JSON.stringify(pattern);
  return `title.imatch.${value},${secondaryField}.imatch.${value}`;
}

/** Al cambiar filtros se quita el cursor; al avanzar se conservan todos. */
export function claimListHref(
  filters: ClaimFilters,
  cursor?: string | null,
): string {
  const params = new URLSearchParams(cursor ?? "");
  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.status !== "todos") params.set("estado", filters.status);
  if (filters.sort !== "recientes") params.set("orden", filters.sort);
  const query = params.toString();
  return query ? `?${query}` : "?";
}
