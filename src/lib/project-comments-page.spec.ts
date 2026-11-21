import { describe, expect, it, vi } from "vitest";
import {
  loadProjectCommentPage,
  projectCommentCursor,
  projectCommentsPageHref,
  projectCommentRefreshHref,
  PROJECT_COMMENT_PAGE_SIZE,
} from "./project-comments-page";
import type { DB } from "./supabase";

const projectId = "f0000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const date = "2026-10-23T12:00:00+00:00";
const comment = (n: number, parent_id: string | null = null) => ({
  id: id(n),
  body: `Mensaje ${n}`,
  parent_id,
  created_at: date,
  user_id: id(999),
  project_id: projectId,
  status: "visible",
});

function fixture(
  rows: ReturnType<typeof comment>[],
  error: object | null = null,
) {
  const queries: {
    filters: [string, unknown][];
    cursor: string;
    limit: number;
  }[] = [];
  const db = {
    from: vi.fn(() => {
      const state = {
        filters: [] as [string, unknown][],
        cursor: "",
        limit: Infinity,
      };
      queries.push(state);
      const result = () => {
        let data = rows.filter((row) =>
          state.filters.every(([name, value]) =>
            Array.isArray(value)
              ? value.includes(row[name as keyof typeof row])
              : row[name as keyof typeof row] === value,
          ),
        );
        const cursorId = state.cursor.match(/id\.gt\.([^)]*)/)?.[1];
        if (cursorId) data = data.filter((row) => row.id > cursorId);
        return { data: error ? null : data.slice(0, state.limit), error };
      };
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: (name: string, value: unknown) => {
          state.filters.push([name, value]);
          return query;
        },
        in: (name: string, value: unknown[]) => {
          state.filters.push([name, value]);
          return query;
        },
        order: vi.fn().mockReturnThis(),
        limit: (count: number) => {
          state.limit = count;
          return query;
        },
        or: (cursor: string) => {
          state.cursor = cursor;
          return query;
        },
        maybeSingle: async () => {
          const r = result();
          return { ...r, data: r.data?.[0] ?? null };
        },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    }),
  } as unknown as DB;
  return { db, queries };
}

describe("páginas de Q&A sin recorte global", () => {
  it("la relectura del mensaje confirmado conserva cursor y ancla y quita la acción del POST", () => {
    const original = new URL(
      `https://agorbis.test/proyectos/${projectId}?qa_antes=${encodeURIComponent(date)}&qa_id=${id(50)}&qaction=publicar#qa-titulo`,
    );
    const destination = new URL(
      projectCommentRefreshHref(original, id(223))!,
      original,
    );
    expect(projectCommentCursor(destination.searchParams)).toEqual({
      created_at: date,
      id: id(50),
    });
    expect(destination.searchParams.get("mensaje")).toBe(id(223));
    expect(destination.searchParams.has("qaction")).toBe(false);
    expect(destination.hash).toBe("#qa-titulo");
    expect(projectCommentRefreshHref(original, "invalido")).toBeNull();
  });
  it("recorre más de200 mensajes y respuestas con empate de fecha sin omisiones ni duplicados de página", async () => {
    const rows = Array.from({ length: 223 }, (_, n) =>
      comment(n + 1, n > 0 ? id(1) : null),
    );
    const { db, queries } = fixture(rows);
    const seen = new Set<string>();
    let cursor = null;
    let pages = 0;
    do {
      const page = await loadProjectCommentPage(db, projectId, cursor);
      expect(page.failed).toBe(false);
      expect(new Set(page.rows.map((row) => row.id)).size).toBe(
        page.rows.length,
      );
      page.rows.forEach((row) => seen.add(row.id));
      cursor = page.next;
      pages++;
    } while (cursor);
    expect(pages).toBe(5);
    expect(seen.size).toBe(223);
    expect(
      queries.every(
        (query) =>
          query.filters.some(
            ([name, value]) => name === "project_id" && value === projectId,
          ) &&
          query.filters.some(
            ([name, value]) => name === "status" && value === "visible",
          ),
      ),
    ).toBe(true);
    expect(
      queries.every((query) => query.limit <= PROJECT_COMMENT_PAGE_SIZE + 1),
    ).toBe(true);
  });
  it("recupera el mensaje enlazado/recién creado y su pregunta con los mismos límites de visibilidad", async () => {
    const rows = Array.from({ length: 223 }, (_, n) => comment(n + 1));
    rows[222]!.parent_id = id(190);
    rows.push({ ...comment(224), status: "removed" });
    const { db } = fixture(rows);
    const page = await loadProjectCommentPage(db, projectId, null, id(223));
    expect(page.rows.some((row) => row.id === id(223))).toBe(true);
    expect(page.rows.some((row) => row.id === id(190))).toBe(true);
    expect(
      (await loadProjectCommentPage(db, projectId, null, id(224))).rows.some(
        (row) => row.id === id(224),
      ),
    ).toBe(false);
  });
  it("distingue carga fallida y valida el cursor antes de construir filtros", async () => {
    expect(
      (
        await loadProjectCommentPage(
          fixture([], { code: "XX000" }).db,
          projectId,
          null,
        )
      ).failed,
    ).toBe(true);
    expect(
      projectCommentCursor(
        new URLSearchParams({ qa_antes: date, qa_id: "x),status.neq.visible" }),
      ),
    ).toBeNull();
    const cursor = { created_at: date, id: id(50) };
    const href = new URL(
      projectCommentsPageHref(projectId, cursor),
      "https://agorbis.test",
    );
    expect(projectCommentCursor(href.searchParams)).toEqual(cursor);
    expect(href.hash).toBe("#qa-titulo");
  });
});
