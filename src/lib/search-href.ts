/** URL compartida por páginas, sugerencias y búsquedas recientes. */
export function searchHref(filters: {
  query: string;
  kind?: string | null;
  status?: string | null;
  community?: string | null;
  sort?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.kind) params.set("tipo", filters.kind);
  if (filters.status) params.set("estado", filters.status);
  if (filters.community) params.set("comunidad", filters.community);
  if (filters.sort === "recientes") params.set("orden", filters.sort);
  if (filters.page && filters.page > 1)
    params.set("pagina", String(filters.page));
  return `/buscar?${params.toString()}`;
}
