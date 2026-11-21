import type { RequestEventCommon } from "@qwik.dev/router";
import type { CommunityCardData } from "~/components/community/CommunityCard";
import type { ChildrenClient } from "./community-children";
import { organizationNamePattern } from "./organization-directory";
import { readPage } from "./pagination";
import { many } from "./query";

export const COMMUNITY_DIRECTORY_PAGE_SIZE = 24;

export function readCommunityDirectoryFilters(params: URLSearchParams) {
  return {
    query: (params.get("q") ?? "").trim().slice(0, 120),
    page: readPage(params),
  };
}

export function communityDirectoryHref(query: string, page = 1) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("pagina", String(page));
  const search = params.toString();
  return search ? `?${search}` : "?";
}

export async function loadChildDirectory(
  ev: RequestEventCommon,
  db: ChildrenClient,
  communityId: string,
  filters: ReturnType<typeof readCommunityDirectoryFilters>,
) {
  let listing = db
    .from("communities")
    .select("id, slug, name, emoji, level, path, member_count, description")
    .eq("parent_id", communityId);
  if (filters.query)
    listing = listing.filter(
      "name",
      "imatch",
      organizationNamePattern(filters.query),
    );

  // El mismo orden de base se conserva en todas las páginas; el ID desempata
  // nombres iguales. Una fila extra evita ofrecer una página vacía al final.
  const rows = await many(
    ev,
    "sub/hijas",
    listing
      .order("name")
      .order("id")
      .range(
        (filters.page - 1) * COMMUNITY_DIRECTORY_PAGE_SIZE,
        filters.page * COMMUNITY_DIRECTORY_PAGE_SIZE,
      ),
  );
  return {
    ...filters,
    children: rows.slice(
      0,
      COMMUNITY_DIRECTORY_PAGE_SIZE,
    ) as CommunityCardData[],
    hasMore: rows.length > COMMUNITY_DIRECTORY_PAGE_SIZE,
  };
}
