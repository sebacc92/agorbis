import { escapeLike } from "./community";
import { readPage } from "./pagination";
import { searchHref } from "./search-href";

export function readTerritorySearch(params: URLSearchParams) {
  return {
    query: (params.get("territorio") ?? "").trim().slice(0, 100),
    page: readPage(params),
    context: {
      query: (params.get("q") ?? "").trim().slice(0, 100),
      kind: params.get("tipo") ?? "",
      status: params.get("estado") ?? "",
      community: params.get("comunidad") ?? "",
      sort: params.get("orden") === "recientes" ? "recientes" : "relevancia",
    },
  };
}

export const TERRITORIES_PAGE_SIZE = 24;
export function territoryPattern(term: string) {
  return `%${escapeLike(term)}%`;
}
export function territoryResultHref(
  context: ReturnType<typeof readTerritorySearch>["context"],
  slug: string | null,
) {
  return searchHref({ ...context, community: slug, page: 1 });
}
