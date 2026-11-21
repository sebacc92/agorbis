import type { RequestEventCommon } from "@qwik.dev/router";
import type { DB } from "./supabase";
import { describe, expect, it, vi } from "vitest";
import { institutionalResponseTitles } from "./institutional-history";

describe("títulos institucionales por lote", () => {
  it("agrupa los ids por tipo y evita una consulta por respuesta", async () => {
    const rows: Record<string, unknown[]> = {
      polls: [{ id: "poll-a", question: "Consulta" }],
      claims: [{ id: "claim-a", title: "Reclamo" }, { id: "claim-b", title: "Otro reclamo" }],
      debates: [{ id: "debate-a", title: "Debate" }],
      projects: [{ id: "project-a", title: "Proyecto" }],
    };
    const batches: [string, string[]][] = [];
    const from = vi.fn((table: string) => ({ select: () => ({ in: (_column: string, ids: string[]) => { batches.push([table, ids]); return Promise.resolve({ data: rows[table], error: null }); } }) }));
    const db = { from } as unknown as DB;
    const responses = [
      ...Array.from({ length: 15 }, () => ({ content_type: "claim", content_id: "claim-a" })),
      { content_type: "claim", content_id: "claim-b" },
      { content_type: "poll", content_id: "poll-a" },
      { content_type: "debate", content_id: "debate-a" },
      { content_type: "project", content_id: "project-a" },
    ];
    const titles = await institutionalResponseTitles({} as RequestEventCommon, db, responses);
    expect(from).toHaveBeenCalledTimes(4);
    expect(batches.find(([table]) => table === "claims")?.[1]).toEqual(["claim-a", "claim-b"]);
    expect(titles.get("claim:claim-b")).toBe("Otro reclamo");
    expect(titles.get("poll:poll-a")).toBe("Consulta");
    expect(titles.get("project:project-a")).toBe("Proyecto");
  });
  it("no consulta tipos ausentes ni carga títulos si la página está vacía", async () => {
    const from = vi.fn();
    const titles = await institutionalResponseTitles({} as RequestEventCommon, { from } as unknown as DB, []);
    expect(from).not.toHaveBeenCalled();
    expect(titles.size).toBe(0);
  });
});
