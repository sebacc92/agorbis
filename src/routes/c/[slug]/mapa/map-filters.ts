import { readClaimFilters } from "~/lib/claim-search";
import type { ClaimCategory } from "~/lib/database.types.helpers";

export const MAP_CLAIMS_LIMIT = 100;

export interface MapFilters {
  query: string;
  category: ClaimCategory | null;
  status: "todos" | "resueltos" | "abiertos";
}

export function readMapFilters(params: URLSearchParams): MapFilters {
  const { query, category, status } = readClaimFilters(params);
  return { query, category, status };
}

export function mapListHref(filters: MapFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.status !== "todos") params.set("estado", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "?";
}
