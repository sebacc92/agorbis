import { describe, expect, it } from "vitest";
import { searchHref } from "./search-href";

describe("contexto de una búsqueda reciente", () => {
  const applied = {
    query: "salud",
    kind: "claim",
    status: "open",
    community: "argentina",
    sort: "recientes",
    page: 2,
  };
  it("cambia el término y vuelve al principio conservando los demás filtros", () => {
    const target = new URL(
      searchHref({ ...applied, query: "agua & barrio", page: 1 }),
      "https://agorbis.test",
    );
    expect(Object.fromEntries(target.searchParams)).toEqual({
      q: "agua & barrio",
      tipo: "claim",
      estado: "open",
      comunidad: "argentina",
      orden: "recientes",
    });
  });
  it("también sirve a paginación y permite retirar filtros sin volverlos a incluir", () => {
    const page = new URL(searchHref(applied), "https://agorbis.test");
    expect(page.searchParams.get("pagina")).toBe("2");
    const cleared = new URL(
      searchHref({
        ...applied,
        kind: null,
        community: null,
        status: null,
        sort: "relevancia",
        page: 1,
      }),
      page,
    );
    expect(Object.fromEntries(cleared.searchParams)).toEqual({ q: "salud" });
  });
});
