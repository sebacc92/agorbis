import { describe, expect, it } from "vitest";
import {
  organizationListHref,
  organizationNamePattern,
  readOrganizationFilters,
  organizationSlugFromRoute,
} from "./organization-directory";

describe("directorios institucionales paginados", () => {
  it("normaliza filtros conocidos y páginas defensivas", () => {
    expect(
      readOrganizationFilters(
        new URLSearchParams("q=+Club+&tipo=institution&pagina=2"),
      ),
    ).toEqual({ query: "Club", type: "institution", page: 2 });
    expect(
      readOrganizationFilters(new URLSearchParams("tipo=unknown&pagina=-1")),
    ).toEqual({ query: "", type: "", page: 1 });
    expect(
      readOrganizationFilters(new URLSearchParams("pagina=999999999")).page,
    ).toBe(10_000);
    expect(
      readOrganizationFilters(new URLSearchParams({ q: "a".repeat(140) }))
        .query,
    ).toHaveLength(120);
  });
  it("preserva nombre y tipo al paginar y permite volver al comienzo", () => {
    const filters = { query: 'Club.*%_ "A&B"', type: "institution" };
    const url = new URL(
      organizationListHref(filters, 2),
      "https://agorbis.test",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: filters.query,
      tipo: filters.type,
      pagina: "2",
    });
    expect(
      new URL(organizationListHref(filters), url).searchParams.has("pagina"),
    ).toBe(false);
  });
  it("trata comodines y operadores de regex como parte literal del nombre", () => {
    const query = 'Club.*%_ "A&B" (casa)';
    const pattern = organizationNamePattern(query);
    const regex = new RegExp(pattern, "i");
    expect(regex.test(query)).toBe(true);
    expect(regex.test('ClubABC "A&B" casa')).toBe(false);
  });
});

describe("slug institucional durante la navegación estricta", () => {
  it("recupera el perfil al paginar con params vacíos", () => {
    expect(
      organizationSlugFromRoute(
        {},
        new URL("https://agorbis.test/instituciones/club-centro/?respuestas=2"),
      ),
    ).toBe("club-centro");
    expect(
      organizationSlugFromRoute(
        { slug: "original" },
        new URL("https://agorbis.test/instituciones/otro/"),
      ),
    ).toBe("original");
  });
  it("no interpreta slugs inválidos ni otra ruta como perfil", () => {
    for (const path of [
      "/instituciones/",
      "/c/club/instituciones/",
      "/instituciones/%ZZ/",
      "/instituciones/club%2Fcentro/",
    ]) {
      expect(
        organizationSlugFromRoute({}, new URL(path, "https://agorbis.test")),
      ).toBe("");
    }
  });
});
