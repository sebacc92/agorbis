import { describe, expect, it } from "vitest";
import { feedHref, readFeedFilters } from "./personalized-feed";

describe("filtros del inicio personalizado", () => {
  const chain = [{ slug: "earth" }, { slug: "mar-del-plata" }];

  it("admite tipos conocidos y comunidades de la residencia", () => {
    expect(
      readFeedFilters(
        new URLSearchParams("comunidad=mar-del-plata&tipo=claim"),
        chain,
      ),
    ).toEqual({ communityFilter: "mar-del-plata", kindFilter: "claim" });
    expect(
      readFeedFilters(
        new URLSearchParams("comunidad=otra&tipo=unknown"),
        chain,
      ),
    ).toEqual({ communityFilter: null, kindFilter: null });
  });

  it("conserva comunidad y tipo al avanzar y al volver a lo último", () => {
    const filters = {
      communityFilter: "mar-del-plata",
      kindFilter: "claim" as const,
    };
    const cursor = "antes=2026-10-01T00%3A00%3A00Z&id=claim-id";
    const next = new URL(feedHref(filters, cursor), "https://agorbis.test");
    expect(Object.fromEntries(next.searchParams)).toEqual({
      antes: "2026-10-01T00:00:00Z",
      id: "claim-id",
      comunidad: "mar-del-plata",
      tipo: "claim",
    });
    expect(feedHref(filters)).toBe(
      "/inicio?comunidad=mar-del-plata&tipo=claim",
    );
    expect(feedHref({ communityFilter: null, kindFilter: null })).toBe(
      "/inicio",
    );
  });
});
