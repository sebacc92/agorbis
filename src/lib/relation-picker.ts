import type { ContentType, FnReturns } from "./database.types.helpers";
import type { DB } from "./supabase";
import { contentHref } from "./community";
import { isUuid, safeInternalPath } from "./http";
import { logFailure } from "./log";

export const RELATION_CONTENT_TYPES = [
  "poll",
  "debate",
  "claim",
  "project",
] as const;
export function isRelationContentType(
  value: string | null,
): value is ContentType {
  return RELATION_CONTENT_TYPES.some((type) => type === value);
}

type SearchRow = FnReturns<"global_search">[number];
export type RelationSearchTarget = Omit<
  Pick<
    SearchRow,
    "kind" | "id" | "title" | "community_name" | "community_emoji" | "status"
  >,
  "kind"
> & { kind: ContentType };
export type RelationSelection = Pick<
  RelationSearchTarget,
  "kind" | "id" | "title"
>;

export const RELATION_KINDS = [
  "related",
  "result_of",
  "proposal_for",
  "follow_up",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
export function relationKind(value: string | null | undefined): RelationKind {
  return RELATION_KINDS.find((kind) => kind === value) ?? "related";
}

/** La búsqueda HTML y la búsqueda mejorada usan la misma RPC y sus RLS. */
export async function findRelationTargets(
  db: DB,
  query: string,
  kind: ContentType | "",
  sourceType: ContentType,
  sourceId: string,
) {
  const term = query.trim().slice(0, 100);
  if (term.length < 3)
    return { items: [] as RelationSearchTarget[], failed: false };
  const kinds = kind ? [kind] : RELATION_CONTENT_TYPES;
  const responses = await Promise.all(
    kinds.map((targetKind) =>
      db.rpc("global_search", {
        p_query: term,
        p_kind: targetKind,
        p_limit: 8,
        p_offset: 0,
      }),
    ),
  );
  for (const response of responses) {
    if (response.error)
      logFailure({ scope: "relaciones/buscar" }, response.error);
  }
  if (responses.some((response) => response.error))
    return { items: [] as RelationSearchTarget[], failed: true };
  const items = responses
    .flatMap((response) => response.data ?? [])
    .filter(
      (row) =>
        isRelationContentType(row.kind) &&
        !(row.kind === sourceType && row.id === sourceId),
    )
    .sort((a, b) => b.rank - a.rank || b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map(({ kind, id, title, community_name, community_emoji, status }) => ({
      kind,
      id,
      title,
      community_name,
      community_emoji,
      status,
    })) as RelationSearchTarget[];
  return { items, failed: false };
}

/** El selector sólo puede regresar a la publicación que inició la búsqueda. */
export function relationReturnHref(
  type: ContentType,
  id: string,
  value?: string | null,
) {
  const expected = contentHref(type, id);
  const safe = safeInternalPath(
    value && value.length <= 4096 ? value : null,
    expected,
  );
  const url = new URL(safe, "https://agorbis.invalid");
  if (url.pathname.replace(/\/$/, "") !== expected)
    return `${expected}/#relacionados-titulo`;
  url.searchParams.delete("qaction");
  url.searchParams.delete("vincular_titulo");
  return `${expected}/${url.search}#relacionados-titulo`;
}

export function relationSearchHref(
  type: ContentType,
  id: string,
  context: string,
) {
  const params = new URLSearchParams({
    origen: type,
    origen_id: id,
    volver: relationReturnHref(type, id, context),
  });
  params.set(
    "relation_type",
    relationKind(
      new URL(context, "https://agorbis.invalid").searchParams.get(
        "vincular_relacion",
      ),
    ),
  );
  const locale = new URL(context, "https://agorbis.invalid").searchParams.get(
    "lang",
  );
  if (locale === "en") params.set("lang", locale);
  return `/vincular/?${params}`;
}

export function relationSelectionHref(
  type: ContentType,
  id: string,
  context: string,
  target: RelationSelection,
  relationType: string = "related",
) {
  const url = new URL(
    relationReturnHref(type, id, context),
    "https://agorbis.invalid",
  );
  url.searchParams.set("vincular_tipo", target.kind);
  url.searchParams.set("vincular_id", target.id);
  url.searchParams.delete("vincular_titulo");
  url.searchParams.set("vincular_relacion", relationKind(relationType));
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Es sólo una selección para revisar: la escritura vuelve a comprobar RLS. */
export function selectedRelationFromUrl(
  url: URL,
  type: ContentType,
  id: string,
): RelationSelection | null {
  if (url.pathname.replace(/\/$/, "") !== contentHref(type, id)) return null;
  const targetKind = url.searchParams.get("vincular_tipo");
  const targetId = url.searchParams.get("vincular_id");
  if (
    !isRelationContentType(targetKind) ||
    !isUuid(targetId) ||
    (targetKind === type && targetId === id)
  )
    return null;
  return {
    kind: targetKind,
    id: targetId,
    title: "",
  };
}
