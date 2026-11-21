import { describe, expect, it } from "vitest";
import { claimSearchFilter } from "~/lib/claim-search";
import { mapListHref, readMapFilters } from "./map-filters";

describe("filtros del mapa", () => {
  it("comparte la validación de categorías y búsqueda sin heredar el orden del listado", () => {
    expect(readMapFilters(new URLSearchParams("q=+Calle+Rota+&categoria=servicios&estado=abiertos&orden=apoyados"))).toEqual({ query: "Calle Rota", category: "servicios", status: "abiertos" });
    expect(readMapFilters(new URLSearchParams("categoria=no&estado=removed"))).toEqual({ query: "", category: null, status: "todos" });
  });
  it("conserva consulta y filtros en enlaces y reintentos", () => {
    const filters = { query: 'Esquina "100%" & .*', category: "servicios" as const, status: "resueltos" as const };
    const url = new URL(mapListHref(filters), "https://agorbis.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: filters.query, categoria: "servicios", estado: "resueltos" });
    expect(mapListHref({ query: "", category: null, status: "todos" })).toBe("?");
  });
  it("busca literalmente en el título o la ubicación, conservando la búsqueda de descripciones del listado", () => {
    expect(claimSearchFilter(".*%_", "location_text")).toBe('title.imatch."\\\\.\\\\*%_",location_text.imatch."\\\\.\\\\*%_"');
    expect(claimSearchFilter("plaza")).toBe('title.imatch."plaza",description.imatch."plaza"');
  });
});
