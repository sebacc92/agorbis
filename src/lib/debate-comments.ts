import type { DebateCommentData } from "~/components/debates/CommentCard";
import { beforeCursor, readCursor, type Cursor } from "./cursor";
import { isUuid } from "./http";
import { loadPublicProfiles } from "./public-profile";
import type { DB } from "./supabase";

export const DEBATE_COMMENT_PAGE_SIZE = 20;
// La primera carga puede incluir un comentario enlazado fuera de los destacados.
export const MAX_INITIAL_DEBATE_COMMENTS = DEBATE_COMMENT_PAGE_SIZE + 1;

export interface DebateCommentPageRequest {
  debateId: string;
  columnId: string;
  initialIds: string[];
  cursor: Cursor | null;
}

export function validDebateCommentPageRequest(
  value: unknown,
): value is DebateCommentPageRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<DebateCommentPageRequest>;
  if (
    !isUuid(input.debateId) ||
    !isUuid(input.columnId) ||
    !Array.isArray(input.initialIds) ||
    input.initialIds.length > MAX_INITIAL_DEBATE_COMMENTS ||
    !input.initialIds.every((id) => typeof id === "string" && isUuid(id))
  )
    return false;
  if (input.cursor === null) return true;
  if (
    !input.cursor ||
    typeof input.cursor.created_at !== "string" ||
    typeof input.cursor.id !== "string"
  )
    return false;
  return !!readCursor(
    new URLSearchParams({
      antes: input.cursor.created_at,
      id: input.cursor.id,
    }),
  );
}

/** Conserva orden, nodos y votos locales al revalidar o recibir una página. */
export function appendDebateComments(
  current: DebateCommentData[],
  incoming: DebateCommentData[],
): DebateCommentData[] {
  const ids = new Set(current.map((comment) => comment.id));
  return [
    ...current,
    ...incoming.filter((comment) => {
      if (ids.has(comment.id)) return false;
      ids.add(comment.id);
      return true;
    }),
  ];
}

/**
 * Los destacados conservan el ranking inicial; el resto pagina por fecha e id.
 * El puntaje cambia al votar y usarlo como cursor haría desaparecer comentarios
 * entre páginas. Se excluye sólo la primera carga, de tamaño acotado.
 */
export async function loadDebateCommentPage(
  db: DB,
  viewerId: string | null,
  input: unknown,
) {
  const failure = {
    ok: false as const,
    message: "No pudimos cargar más comentarios. Volvé a intentarlo.",
  };
  if (!validDebateCommentPageRequest(input)) return failure;

  let query = db
    .from("debate_comments")
    .select(
      "id, body, score, created_at, user_id, debate:debates!inner(status)",
    )
    .eq("debate_id", input.debateId)
    .eq("column_community_id", input.columnId)
    .eq("status", "visible")
    // La sesión autora o de moderación puede leer retirados por RLS. Esta
    // interfaz pública conserva la restricción del detalle también para ellas.
    .neq("debate.status", "removed")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DEBATE_COMMENT_PAGE_SIZE + 1);
  if (input.initialIds.length > 0)
    query = query.not("id", "in", `(${input.initialIds.join(",")})`);
  if (input.cursor) query = query.or(beforeCursor(input.cursor));
  const { data, error } = await query;
  if (error) return failure;

  const rows = (data ?? []).slice(0, DEBATE_COMMENT_PAGE_SIZE);
  const profiles = await loadPublicProfiles(
    db,
    rows.map((row) => row.user_id),
  );
  const votes = new Map<string, -1 | 0 | 1>();
  if (viewerId && rows.length > 0) {
    const { data: ownVotes, error: voteError } = await db
      .from("comment_votes")
      .select("comment_id, value")
      .eq("user_id", viewerId)
      .in(
        "comment_id",
        rows.map((row) => row.id),
      );
    if (voteError) return failure;
    for (const vote of ownVotes ?? [])
      votes.set(vote.comment_id, vote.value as -1 | 1);
  }
  const last = rows.at(-1);
  return {
    ok: true as const,
    comments: rows.map((row): DebateCommentData => ({
      id: row.id,
      body: row.body,
      score: row.score,
      created_at: row.created_at,
      author: profiles.get(row.user_id) ?? null,
      myVote: votes.get(row.id) ?? 0,
    })),
    hasMore: (data?.length ?? 0) > DEBATE_COMMENT_PAGE_SIZE,
    cursor: last ? { created_at: last.created_at, id: last.id } : null,
  };
}
