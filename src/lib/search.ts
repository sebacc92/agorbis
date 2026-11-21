/** La búsqueda global sigue los límites de global_search; el autocompletado
 * territorial puede empezar antes sin consultar publicaciones todavía. */
export const COMMUNITY_SEARCH_MIN_LENGTH = 2;
export const GLOBAL_SEARCH_MIN_LENGTH = 3;
export const GLOBAL_SEARCH_MAX_LENGTH = 100;

export function globalSearchHref(query: string): string | null {
  const term = query.trim().slice(0, GLOBAL_SEARCH_MAX_LENGTH);
  return term.length >= GLOBAL_SEARCH_MIN_LENGTH
    ? `/buscar?q=${encodeURIComponent(term)}`
    : null;
}
