import { describe, expect, it } from "vitest";
import { mergeRecentActivity } from "./recent-activity";

const community = { name: "Mar del Plata", slug: "mar-del-plata", emoji: "🌊" };
const row = (id: string, created_at: string) => ({
  id,
  title: `Publicación ${id}`,
  created_at,
  community,
});

describe("mergeRecentActivity", () => {
  it("mezcla los tipos por fecha y deja sólo las más recientes", () => {
    const items = mergeRecentActivity(
      {
        poll: [row("p1", "2026-10-20T10:00:00Z"), row("p2", "2026-10-01T10:00:00Z")],
        claim: [row("c1", "2026-10-22T10:00:00Z")],
        project: [row("r1", "2026-10-21T10:00:00Z")],
      },
      3,
    );
    expect(items.map((item) => [item.kind, item.id])).toEqual([
      ["claim", "c1"],
      ["project", "r1"],
      ["poll", "p1"],
    ]);
  });

  it("desempata por id para que dos cargas iguales no cambien de orden", () => {
    const at = "2026-10-20T10:00:00Z";
    const items = mergeRecentActivity({
      debate: [row("a", at)],
      claim: [row("b", at)],
    });
    expect(items.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("omite un tipo que no se pudo leer y no inventa filas", () => {
    expect(
      mergeRecentActivity({
        poll: null,
        debate: [row("d1", "2026-10-20T10:00:00Z")],
      }).map((item) => item.id),
    ).toEqual(["d1"]);
    expect(mergeRecentActivity({ poll: null, claim: [] })).toEqual([]);
  });
});
