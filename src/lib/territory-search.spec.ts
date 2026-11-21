import { describe, expect, it } from "vitest";
import {
  readTerritorySearch,
  territoryPattern,
  territoryResultHref,
} from "./territory-search";

describe("elección HTML de territorio", () => {
  it("selecciona un slug real sin perder filtros y reinicia la página de publicaciones", () => {
    const { context } = readTerritorySearch(
      new URLSearchParams(
        "q=agua&tipo=claim&estado=open&orden=recientes&comunidad=earth&pagina=3",
      ),
    );
    const selected = new URL(
      territoryResultHref(context, "mar-del-plata"),
      "https://agorbis.test",
    );
    expect(Object.fromEntries(selected.searchParams)).toEqual({
      q: "agua",
      tipo: "claim",
      estado: "open",
      orden: "recientes",
      comunidad: "mar-del-plata",
    });
    expect(
      new URL(territoryResultHref(context, null), selected).searchParams.has(
        "comunidad",
      ),
    ).toBe(false);
  });
  it("normaliza término y página y busca literalmente comodines", () => {
    expect(
      readTerritorySearch(new URLSearchParams("territorio=+Mar+&pagina=-1"))
        .query,
    ).toBe("Mar");
    expect(readTerritorySearch(new URLSearchParams("pagina=-1")).page).toBe(1);
    expect(territoryPattern("Mar%_\\")).toBe("%Mar\\%\\_\\\\%");
  });
});
