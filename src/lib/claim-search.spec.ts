import { describe, expect, it } from "vitest";
import { claimListHref, claimSearchFilter, readClaimFilters, CLAIM_SEARCH_MAX_LENGTH } from "./claim-search";

describe("búsqueda completa de reclamos", () => {
  it("normaliza el término y sólo permite filtros conocidos", () => {
    expect(readClaimFilters(new URLSearchParams("q=+Bache+&categoria=otro&estado=abiertos&orden=apoyados"))).toEqual({
      query: "Bache", category: "otro", status: "abiertos", sort: "apoyados",
    });
    expect(readClaimFilters(new URLSearchParams("categoria=inexistente&estado=removed&orden=invalid"))).toEqual({
      query: "", category: null, status: "todos", sort: "recientes",
    });
    expect(readClaimFilters(new URLSearchParams({ q: "a".repeat(150) })).query).toHaveLength(CLAIM_SEARCH_MAX_LENGTH);
    expect(readClaimFilters(new URLSearchParams({ q: " bache\nroto\u0000 " })).query).toBe("bache roto");
  });

  it("escapa la regex y la gramática de PostgREST por separado", () => {
    expect(claimSearchFilter("")).toBeNull();
    expect(claimSearchFilter("bache.*%_" )).toBe('title.imatch."bache\\\\.\\\\*%_",description.imatch."bache\\\\.\\\\*%_"');
    const query = '\\"),status.neq.removed';
    const filter = claimSearchFilter(query)!;
    const expectedValue = JSON.stringify('\\\\"\\),status\\.neq\\.removed');
    expect(filter).toBe(`title.imatch.${expectedValue},description.imatch.${expectedValue}`);
  });

  it("conserva consulta, estado, categoría y orden al paginar y resetea el cursor al filtrar", () => {
    const filters = { query: 'bache, "100%"', category: "otro" as const, status: "abiertos" as const, sort: "recientes" as const };
    const next = new URL(claimListHref(filters, "antes=2026-01-01T00%3A00%3A00Z&id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), "https://agorbis.test");
    expect(Object.fromEntries(next.searchParams)).toEqual({ antes: "2026-01-01T00:00:00Z", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", q: filters.query, categoria: "otro", estado: "abiertos" });
    const reset = new URL(claimListHref({ ...filters, sort: "apoyados" }), "https://agorbis.test");
    expect(reset.searchParams.has("antes")).toBe(false);
    expect(reset.searchParams.get("orden")).toBe("apoyados");
    expect(claimListHref({ query: "", category: null, status: "todos", sort: "recientes" })).toBe("?");
  });
});
