import { beforeCursor, readCursor, type Cursor } from "./cursor";
import type { Tables } from "./database.types.helpers";
import { isUuid } from "./http";
import type { DB } from "./supabase";

export const PROJECT_COMMENT_PAGE_SIZE = 50;
const SELECT = "id, body, created_at, parent_id, user_id";
type CommentRow = Pick<
  Tables<"project_comments">,
  "id" | "body" | "created_at" | "parent_id" | "user_id"
>;

export function projectCommentCursor(params: URLSearchParams): Cursor | null {
  return readCursor(
    new URLSearchParams({
      antes: params.get("qa_antes") ?? "",
      id: params.get("qa_id") ?? "",
    }),
  );
}

export function projectCommentsPageHref(
  projectId: string,
  cursor: Cursor | null,
): string {
  const params = cursor
    ? `?qa_antes=${encodeURIComponent(cursor.created_at)}&qa_id=${encodeURIComponent(cursor.id)}`
    : "";
  return `/proyectos/${projectId}${params}#qa-titulo`;
}

/** Relee el mensaje confirmado sin cambiar página, foco ni borradores. */
export function projectCommentRefreshHref(
  url: URL,
  commentId: string,
): string | null {
  if (!isUuid(commentId)) return null;
  const destination = new URL(url);
  destination.searchParams.delete("qaction");
  destination.searchParams.set("mensaje", commentId);
  return destination.pathname + destination.search + destination.hash;
}

/** Una página de mensajes más sus preguntas de contexto, siempre bajo RLS. */
export async function loadProjectCommentPage(
  db: DB,
  projectId: string,
  cursor: Cursor | null,
  linkedId?: string | null,
) {
  let query = db
    .from("project_comments")
    .select(SELECT)
    .eq("project_id", projectId)
    .eq("status", "visible")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PROJECT_COMMENT_PAGE_SIZE + 1);
  if (cursor) query = query.or(beforeCursor(cursor).replaceAll(".lt.", ".gt."));
  const { data, error } = await query;
  const rows: CommentRow[] = (data ?? []).slice(0, PROJECT_COMMENT_PAGE_SIZE);
  let failed = !!error;
  const next =
    !failed && data && data.length > PROJECT_COMMENT_PAGE_SIZE && rows.length
      ? { created_at: rows.at(-1)!.created_at, id: rows.at(-1)!.id }
      : null;
  if (
    linkedId &&
    isUuid(linkedId) &&
    !rows.some((row) => row.id === linkedId)
  ) {
    const result = await db
      .from("project_comments")
      .select(SELECT)
      .eq("project_id", projectId)
      .eq("status", "visible")
      .eq("id", linkedId)
      .maybeSingle();
    failed ||= !!result.error;
    if (result.data) rows.push(result.data);
  }
  const parentIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.parent_id && !rows.some((parent) => parent.id === row.parent_id)
          ? [row.parent_id]
          : [],
      ),
    ),
  ];
  if (parentIds.length) {
    const result = await db
      .from("project_comments")
      .select(SELECT)
      .eq("project_id", projectId)
      .eq("status", "visible")
      .in("id", parentIds)
      .limit(PROJECT_COMMENT_PAGE_SIZE + 1);
    failed ||= !!result.error;
    rows.push(...(result.data ?? []));
  }
  return {
    rows,
    next,
    failed,
    pageSize: Math.min(data?.length ?? 0, PROJECT_COMMENT_PAGE_SIZE),
  };
}
