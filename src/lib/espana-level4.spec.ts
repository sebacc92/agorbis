import { describe, expect, it } from "vitest";
import {
  COMMUNITIES,
  PROVINCES,
  buildEspanaLevel4Rows,
  ineName,
  renderEspanaDraftSql,
} from "../../scripts/espana-level4-lib.mjs";

// Filas mínimas con las columnas de la Relación de municipios del INE.
const municipio = (
  codauto: string,
  cpro: string,
  cmun: string,
  nombre: string,
) => ({ codauto, cpro, cmun, nombre });

describe("COMMUNITIES y PROVINCES", () => {
  it("cubren las 17 comunidades y sus 50 provincias, sin Ceuta ni Melilla", () => {
    expect(COMMUNITIES.size).toBe(17);
    expect(COMMUNITIES.has("18")).toBe(false);
    expect(COMMUNITIES.has("19")).toBe(false);
    expect(PROVINCES.size).toBe(50);
    for (const community of COMMUNITIES.values()) {
      expect(community.slug).toMatch(/^espana-[a-z-]+$/);
    }
  });

  it("apunta a los slugs de 0016 tal como están, en inglés", () => {
    expect(COMMUNITIES.get("09")?.slug).toBe("espana-catalonia");
    expect(COMMUNITIES.get("15")?.slug).toBe("espana-navarre");
  });
});

describe("ineName", () => {
  it("pasa adelante el artículo que el INE pone al final", () => {
    expect(ineName("Bonillo, El")).toBe("El Bonillo");
    expect(ineName("Coruña, A")).toBe("A Coruña");
    expect(ineName("Rozas de Madrid, Las")).toBe("Las Rozas de Madrid");
  });

  it("pega el artículo apostrofado y lo pone en mayúscula al empezar", () => {
    expect(ineName("Alfàs del Pi, l'")).toBe("L'Alfàs del Pi");
  });

  it("ordena cada parte de un nombre bilingüe por separado", () => {
    expect(ineName("Vila Joiosa, la/Villajoyosa")).toBe(
      "La Vila Joiosa/Villajoyosa",
    );
    expect(ineName("Donostia/San Sebastián")).toBe("Donostia/San Sebastián");
  });

  it("no toca una coma que no precede a un artículo", () => {
    expect(ineName("Castell d'Aro, Platja d'Aro i s'Agaró")).toBe(
      "Castell d'Aro, Platja d'Aro i s'Agaró",
    );
  });
});

describe("buildEspanaLevel4Rows", () => {
  it("cuelga cada municipio de su comunidad con la provincia en el slug", () => {
    const [row] = buildEspanaLevel4Rows([
      municipio("12", "15", "030", "Coruña, A"),
    ]);

    expect(row).toEqual({
      slug: "espana-a-coruna-a-coruna",
      name: "A Coruña",
      parentSlug: "espana-galicia",
      path: "earth.europe.espana.espana-galicia.espana-a-coruna-a-coruna",
      description: "Municipio de la provincia de A Coruña",
      code: "15030",
    });
  });

  it("no choca con el slug de la comunidad que se llama igual", () => {
    const [row] = buildEspanaLevel4Rows([
      municipio("13", "28", "079", "Madrid"),
    ]);

    expect(row.slug).toBe("espana-madrid-madrid");
    expect(row.parentSlug).toBe("espana-madrid");
  });

  it("distingue homónimos de distintas provincias", () => {
    const rows = buildEspanaLevel4Rows([
      municipio("12", "15", "079", "Sada"),
      municipio("15", "31", "212", "Sada"),
    ]);

    expect(rows.map((row) => row.slug).sort()).toEqual([
      "espana-a-coruna-sada",
      "espana-navarra-sada",
    ]);
  });

  it("saca el punto volado del catalán del slug", () => {
    const [row] = buildEspanaLevel4Rows([
      municipio("09", "08", "999", "Cal·la"),
    ]);

    expect(row.slug).toBe("espana-barcelona-calla");
    expect(row.name).toBe("Cal·la");
  });

  it("deja afuera Ceuta y Melilla, que ya son nivel 3", () => {
    const rows = buildEspanaLevel4Rows([
      municipio("18", "51", "001", "Ceuta"),
      municipio("19", "52", "001", "Melilla"),
      municipio("01", "41", "091", "Sevilla"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual(["espana-sevilla-sevilla"]);
  });

  it("falla con una provincia que no es de la comunidad indicada", () => {
    expect(() =>
      buildEspanaLevel4Rows([municipio("01", "28", "079", "Madrid")]),
    ).toThrow(/provincia 28/i);
  });

  it("falla con un código repetido", () => {
    expect(() =>
      buildEspanaLevel4Rows([
        municipio("01", "41", "091", "Sevilla"),
        municipio("01", "41", "091", "Sevilla"),
      ]),
    ).toThrow(/repetido/i);
  });
});

describe("renderEspanaDraftSql", () => {
  it("escribe el borrador 0095 bajo España, sin coordenadas", () => {
    const rows = buildEspanaLevel4Rows([
      municipio("01", "41", "091", "Sevilla"),
    ]);
    const sql = renderEspanaDraftSql(rows, { fetchedAt: "2026-11-21" });

    expect(sql).toContain("Agorbis · 0095");
    expect(sql).toContain("path like 'earth.europe.espana.%'");
    expect(sql).toContain(
      "('espana-sevilla-sevilla', 'Sevilla', 'espana-andalusia', 'Municipio de la provincia de Sevilla', null, null)",
    );
    expect(sql).toContain("v_expected_level4 constant int := 1;");
    expect(sql).toContain("2026-11-21");
  });
});
