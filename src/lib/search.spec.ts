import { describe, expect, it } from "vitest";
import { GLOBAL_SEARCH_MAX_LENGTH, globalSearchHref } from "./search";

describe("destino de búsqueda global", () => {
  it("no navega con una consulta vacía o menor de tres letras", () => {
    for (const query of ["", " ", "s", "sa", " sa "]) {
      expect(globalSearchHref(query)).toBeNull();
    }
  });

  it("recorta espacios, codifica el término y conserva el máximo del servidor", () => {
    expect(globalSearchHref("  río y agua  ")).toBe(
      "/buscar?q=r%C3%ADo%20y%20agua",
    );
    const url = new URL(
      globalSearchHref("a".repeat(150))!,
      "https://agorbis.test",
    );
    expect(url.searchParams.get("q")).toHaveLength(GLOBAL_SEARCH_MAX_LENGTH);
  });
});
