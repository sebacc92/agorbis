import type { ContentType } from "./database.types.helpers";

/**
 * Lo que el inicio sabe listar. Un acuerdo (D118) no es un `ContentType`: no
 * tiene cuota mensual, formulario común ni ruta bajo la comunidad, pero la
 * RPC `personalized_feed` lo entrega como `kind = 'agreement'`.
 */
export type FeedKind = ContentType | "agreement";
// `satisfies` obliga a que cada entrada sea un `FeedKind`; si `ContentType`
// suma un tipo, acá hay que decidir si el inicio lo lista.
const FEED_KINDS = [
  "claim",
  "poll",
  "debate",
  "project",
  "agreement",
] as const satisfies readonly FeedKind[];

export function isFeedKind(kind: string): kind is FeedKind {
  return (FEED_KINDS as readonly string[]).includes(kind);
}

export interface FeedFilters {
  communityFilter: string | null;
  kindFilter: FeedKind | null;
}

export function readFeedFilters(
  params: URLSearchParams,
  chain: readonly { slug: string }[],
): FeedFilters {
  const community = params.get("comunidad");
  const kind = params.get("tipo");
  return {
    communityFilter: chain.some((item) => item.slug === community)
      ? community
      : null,
    kindFilter: kind && isFeedKind(kind) ? kind : null,
  };
}

/** El cursor cambia de página; los filtros siguen describiendo el mismo listado. */
export function feedHref(filters: FeedFilters, cursor?: string | null): string {
  const params = new URLSearchParams(cursor ?? "");
  if (filters.communityFilter) params.set("comunidad", filters.communityFilter);
  if (filters.kindFilter) params.set("tipo", filters.kindFilter);
  const query = params.toString();
  return query ? `/inicio?${query}` : "/inicio";
}
