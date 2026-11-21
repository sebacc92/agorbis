import { describe, expect, it } from "vitest";
import {
  memberListHref,
  readMemberFilters,
  MEMBER_SEARCH_MAX_LENGTH,
} from "./member-search";

describe("búsqueda de miembros públicos", () => {
  it("normaliza término y admite sólo el filtro de foto conocido", () => {
    expect(readMemberFilters(new URLSearchParams("q=+Sofía+&foto=1"))).toEqual({
      query: "Sofía",
      withPhoto: true,
    });
    expect(readMemberFilters(new URLSearchParams("foto=yes"))).toEqual({
      query: "",
      withPhoto: false,
    });
    expect(
      readMemberFilters(new URLSearchParams({ q: "a".repeat(150) })).query,
    ).toHaveLength(MEMBER_SEARCH_MAX_LENGTH);
  });
  it("conserva ambos filtros al paginar y quita el cursor al aplicar otros", () => {
    const filters = { query: "María & Luz", withPhoto: true };
    const next = new URL(
      memberListHref(filters, "vecina_100"),
      "https://agorbis.test",
    );
    expect(Object.fromEntries(next.searchParams)).toEqual({
      q: "María & Luz",
      foto: "1",
      despues: "vecina_100",
    });
    expect(
      new URL(memberListHref(filters), "https://agorbis.test").searchParams.has(
        "despues",
      ),
    ).toBe(false);
  });
});
