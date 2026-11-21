/** Paginacion numerada defensiva para colas internas. */
export function readPage(
  params: URLSearchParams,
  name = "pagina",
  maximum = 10_000,
): number {
  const raw = params.get(name);
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, maximum);
}

export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Conserva filtros y las otras colas, cambiando solamente una pagina. */
export function pageHref(
  current: URLSearchParams,
  name: string,
  page: number,
): string {
  const params = new URLSearchParams(current);
  if (page <= 1) params.delete(name);
  else params.set(name, String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}
