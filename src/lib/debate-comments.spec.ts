import { describe, expect, it, vi } from "vitest";
import type { DebateCommentData } from "~/components/debates/CommentCard";
import {
  appendDebateComments,
  DEBATE_COMMENT_PAGE_SIZE,
  loadDebateCommentPage,
  validDebateCommentPageRequest,
} from "./debate-comments";
import type { DB } from "./supabase";

const debateId = "c0000000-0000-4000-8000-000000000001";
const columnId = "a0000000-0000-4000-8000-000000000001";
const id = (index: number) => `d0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const request = { debateId, columnId, initialIds: [id(1)], cursor: null };
const comment = (index: number): DebateCommentData => ({
  id: id(index),
  body: `Comentario ${index}`,
  score: index,
  created_at: "2026-10-01T12:00:00+00:00",
  author: null,
  myVote: 0,
});

function fixture(rows: ReturnType<typeof comment>[], error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({ data: rows.map((row) => ({ ...row, user_id: columnId })), error }).then(resolve),
  };
  const from = vi.fn(() => query);
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  return { db: { from, rpc } as unknown as DB, query, from, rpc };
}

describe("continuación de comentarios del debate", () => {
  it("rechaza filtros inyectados, cursores incompletos y exclusiones sin límite antes de consultar", async () => {
    const { db, from } = fixture([]);
    for (const input of [
      null,
      { ...request, debateId: "x),status.neq.removed" },
      { ...request, columnId: "x" },
      { ...request, initialIds: ["x),status.neq.visible"] },
      { ...request, initialIds: Array.from({ length: 22 }, (_, i) => id(i)) },
      { ...request, cursor: {} },
      { ...request, cursor: { created_at: "2026-02-31T00:00:00Z", id: id(2) } },
      { ...request, cursor: { created_at: "2026-10-01T00:00:00Z", id: "x),id.neq.0" } },
    ]) {
      expect(validDebateCommentPageRequest(input)).toBe(false);
      expect(await loadDebateCommentPage(db, null, input)).toMatchObject({ ok: false });
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("acota la lectura a una columna visible y pagina con fecha e id, nunca por puntaje", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => comment(100 - index));
    const { db, query } = fixture(rows);
    const cursor = { created_at: rows[0].created_at, id: id(120) };
    const result = await loadDebateCommentPage(db, null, { ...request, cursor });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comments).toHaveLength(DEBATE_COMMENT_PAGE_SIZE);
    expect(result.comments[0]).not.toHaveProperty("user_id");
    expect(result.comments[0]).not.toHaveProperty("debate");
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toEqual({ created_at: rows[19].created_at, id: rows[19].id });
    expect(query.eq.mock.calls).toEqual([
      ["debate_id", debateId],
      ["column_community_id", columnId],
      ["status", "visible"],
    ]);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("debate:debates!inner(status)"));
    expect(query.neq).toHaveBeenCalledWith("debate.status", "removed");
    expect(query.limit).toHaveBeenCalledWith(21);
    expect(query.not).toHaveBeenCalledWith("id", "in", `(${id(1)})`);
    expect(query.or).toHaveBeenCalledWith(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    expect(query.order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("termina con una página parcial y conserva el error de lectura sin anunciar datos", async () => {
    const success = await loadDebateCommentPage(fixture([comment(2)]).db, null, request);
    expect(success).toMatchObject({ ok: true, hasMore: false, comments: [comment(2)] });
    const failure = await loadDebateCommentPage(fixture([], { code: "42501" }).db, null, request);
    expect(failure).toMatchObject({ ok: false });
    expect(failure).not.toHaveProperty("comments");
  });

  it("hidrata sólo los votos propios de las tarjetas de la nueva página", async () => {
    const base = fixture([comment(2)]);
    const votes = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({ data: [{ comment_id: id(2), value: -1 }], error: null })),
    };
    const db = {
      from: vi.fn((table: string) => table === "comment_votes" ? votes : base.query),
      rpc: base.rpc,
    } as unknown as DB;
    const result = await loadDebateCommentPage(db, columnId, request);
    expect(result).toMatchObject({ ok: true, comments: [{ id: id(2), myVote: -1, score: 2 }] });
    expect(votes.eq).toHaveBeenCalledWith("user_id", columnId);
    expect(votes.in).toHaveBeenCalledWith("comment_id", [id(2)]);
  });

  it("combina páginas, enlaces y revalidaciones sin duplicar ni reemplazar tarjetas ya votadas", () => {
    const voted = { ...comment(1), score: 99, myVote: 1 as const };
    const current = [voted, comment(2)];
    const merged = appendDebateComments(current, [comment(2), comment(3), comment(3), comment(1), comment(4)]);
    expect(merged.map((row) => row.id)).toEqual([id(1), id(2), id(3), id(4)]);
    expect(merged[0]).toBe(voted);
    expect(merged[0].score).toBe(99);
    expect(merged[0].myVote).toBe(1);
    expect(current).toHaveLength(2);
  });
});
