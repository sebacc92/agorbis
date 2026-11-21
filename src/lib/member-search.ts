export const MEMBER_SEARCH_MAX_LENGTH = 100;

export interface MemberFilters {
  query: string;
  withPhoto: boolean;
}

export function readMemberFilters(params: URLSearchParams): MemberFilters {
  return {
    query: (params.get("q") ?? "").trim().slice(0, MEMBER_SEARCH_MAX_LENGTH),
    withPhoto: params.get("foto") === "1",
  };
}

/** Al cambiar filtros se vuelve al principio; al avanzar se conservan. */
export function memberListHref(
  filters: MemberFilters,
  after?: string | null,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.withPhoto) params.set("foto", "1");
  if (after) params.set("despues", after);
  const query = params.toString();
  return query ? `?${query}` : "?";
}
