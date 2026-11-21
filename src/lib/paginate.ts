/**
 * Lectura completa de una tabla a través de PostgREST.
 *
 * PostgREST corta cada respuesta en `max_rows` (1.000, en
 * `supabase/config.toml` y en el proyecto de Producción) sin avisar: un
 * `.limit(50_000)` devuelve las primeras 1.000 filas como si fueran todas. Así
 * el sitemap listó 1.000 de casi 6.000 comunidades y dejó afuera a todas las
 * ciudades.
 */

/** Filas que se piden por vuelta: el `max_rows` de PostgREST. */
export const PAGE_SIZE = 1000;

export interface Page<T> {
  data: T[] | null;
  error: unknown;
}

export interface CollectedRows<T> {
  rows: T[];
  error: unknown;
}

/**
 * Pide `range(from, to)` hasta juntar `limit` filas o recibir una página vacía.
 *
 * Corta con la página vacía y no con la página corta a propósito: si algún día
 * el servidor baja `max_rows` por debajo de `pageSize`, cortar por página
 * corta volvería a perder filas en silencio. Cuesta un pedido más al final.
 */
export async function collectPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
  limit: number,
  pageSize: number = PAGE_SIZE,
): Promise<CollectedRows<T>> {
  let rows: T[] = [];

  while (rows.length < limit) {
    const from = rows.length;
    const to = Math.min(from + pageSize, limit) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { rows, error };
    if (!data || data.length === 0) break;
    rows = rows.concat(data.slice(0, limit - from));
  }

  return { rows, error: null };
}
