import { describe, expect, it } from "vitest";
import { COUNTRIES } from "../../scripts/cod-ab-level4-countries.mjs";
import {
  buildCodAbLevel4Rows,
  renderCodAbDraftSql,
} from "../../scripts/cod-ab-level4-lib.mjs";

// Configuración mínima con la forma de las de cod-ab-level4-countries.mjs.
const country = {
  key: "pais",
  slugPrefix: "pais",
  number: "0099",
  decision: "D999",
  title: "Municipios de País como nivel 4",
  countryPath: "earth.somewhere.pais",
  parentLabel: "DEPARTMENT",
  parents: [
    { pcode: "PA01", name: "Norte", slug: "pais-norte-department" },
    { pcode: "PA02", name: "Islas del Sur", slug: "pais-south-islands" },
  ],
  exclude: ["PA0100"],
  describe: (parent: string) => `Municipio del departamento de ${parent}`,
  header: ["Fuente: un COD-AB."],
};
const unit = (
  adm1_pcode: string,
  adm1_name: string,
  adm2_pcode: string,
  adm2_name: string,
) => ({ adm1_pcode, adm1_name, adm2_pcode, adm2_name });
const point = (adm2_pcode: string, y: string, x: string) => ({
  admin_level: "2",
  adm2_pcode,
  y_coord: y,
  x_coord: x,
});

describe("buildCodAbLevel4Rows", () => {
  it("cuelga cada unidad del slug de 0016, con el nombre correcto en su propio slug y su punto", () => {
    const [row] = buildCodAbLevel4Rows(country, {
      units: [unit("PA02", "Islas Del Sur", "PA0201", "Roatan")],
      points: [point("PA0201", "16.3", "-86.5")],
    });

    expect(row).toEqual({
      slug: "pais-islas-del-sur-roatan",
      name: "Roatan",
      parentSlug: "pais-south-islands",
      path: "earth.somewhere.pais.pais-south-islands.pais-islas-del-sur-roatan",
      description: "Municipio del departamento de Islas del Sur",
      lat: 16.3,
      lng: -86.5,
      code: "PA0201",
    });
  });

  it("toma tildes de los candidatos del mismo padre, sólo si cambian tildes o mayúsculas", () => {
    const rows = buildCodAbLevel4Rows(country, {
      units: [
        unit("PA02", "Islas del Sur", "PA0201", "Roatan"),
        unit("PA01", "Norte", "PA0102", "Cabana"),
      ],
      points: [point("PA0201", "16.3", "-86.5"), point("PA0102", "14.9", "-89")],
      accents: [
        { name: "Roatán", parents: ["Departamento de Islas del Sur"] },
        { name: "Cabañas", parents: ["Departamento de Norte"] },
        { name: "Roatán", parents: ["Departamento de Norte"] },
      ],
    });

    expect(rows.map((row) => row.name)).toEqual(["Cabana", "Roatán"]);
  });

  it("deja afuera los códigos excluidos y falla ante un padre desconocido, que no coincide o sin punto", () => {
    expect(
      buildCodAbLevel4Rows(country, {
        units: [unit("PA01", "Norte", "PA0100", "Lago")],
        points: [],
      }),
    ).toEqual([]);
    expect(() =>
      buildCodAbLevel4Rows(country, {
        units: [unit("PA09", "X", "PA0901", "Y")],
        points: [],
      }),
    ).toThrow(/Padre desconocido/);
    expect(() =>
      buildCodAbLevel4Rows(country, {
        units: [unit("PA01", "Sur", "PA0101", "Y")],
        points: [point("PA0101", "1", "1")],
      }),
    ).toThrow(/no coincide/);
    expect(() =>
      buildCodAbLevel4Rows(country, {
        units: [unit("PA01", "Norte", "PA0101", "Y")],
        points: [],
      }),
    ).toThrow(/sin punto/);
  });

  it("falla si dos unidades de un padre dan el mismo slug", () => {
    expect(() =>
      buildCodAbLevel4Rows(country, {
        units: [
          unit("PA01", "Norte", "PA0101", "San Luis"),
          unit("PA01", "Norte", "PA0102", "San  Luis"),
        ],
        points: [point("PA0101", "1", "1"), point("PA0102", "2", "2")],
      }),
    ).toThrow(/Slug repetido/);
  });
});

describe("buildCodAbLevel4Rows con alias y tildes de todo el país", () => {
  const haitiLike = {
    ...country,
    parents: [
      { pcode: "PA01", name: "Ouest", aliases: ["West"], slug: "pais-ouest" },
    ],
    accentsByParent: false,
  };

  it("reconoce al padre por un alias y lo describe con su nombre", () => {
    const [row] = buildCodAbLevel4Rows(haitiLike, {
      units: [unit("PA01", "West", "PA0101", "Petion-Ville")],
      points: [point("PA0101", "18.5", "-72.3")],
      accents: [{ name: "Pétion-Ville", parents: ["Arrondissement de Port-au-Prince"] }],
    });

    expect([row.slug, row.name, row.parentSlug, row.description]).toEqual([
      "pais-ouest-petion-ville",
      "Pétion-Ville",
      "pais-ouest",
      "Municipio del departamento de Ouest",
    ]);
  });
});

describe("renderCodAbDraftSql", () => {
  const rows = buildCodAbLevel4Rows(country, {
    units: [unit("PA01", "Norte", "PA0101", "Centro")],
    points: [point("PA0101", "1.5", "-2.5")],
  });
  const sql = renderCodAbDraftSql(country, rows, { fetchedAt: "2026-11-20" });

  it("arma el borrador con el número, la decisión, el generador y la fuente", () => {
    expect(sql).toContain("Agorbis · 0099 · Municipios de País como nivel 4 (D999)");
    expect(sql).toContain("scripts/build-cod-ab-level4-draft.mjs pais");
    expect(sql).toContain("-- Fuente: un COD-AB.");
    expect(sql).toContain("2026-11-20");
    expect(sql).toContain("AGORBIS_0099_MISSING_DEPARTMENT");
    expect(sql).toContain("'Municipio del departamento de Norte', 1.5, -2.5)");
  });
});

describe("COUNTRIES", () => {
  it("configura Honduras con sus 18 departamentos y los slugs de 0016", () => {
    const honduras = COUNTRIES.get("honduras");
    expect(honduras?.parents).toHaveLength(18);
    expect(honduras?.expected).toBe(298);
    expect(honduras?.parents.find((p) => p.pcode === "HN11")?.slug).toBe(
      "honduras-bay-islands",
    );
    expect(honduras?.wikidataClass).toBe("Q2602693");
  });

  it("configura Costa Rica con sus 7 provincias y los slugs de 0016", () => {
    const costaRica = COUNTRIES.get("costa-rica");
    expect(costaRica?.parents).toHaveLength(7);
    expect(costaRica?.expected).toBe(84);
    expect(costaRica?.parents.find((p) => p.pcode === "CR2")?.slug).toBe(
      "costa-rica-alajuela-province",
    );
    expect(costaRica?.describe("Limón")).toBe("Cantón de la provincia de Limón");
  });

  it("configura República Dominicana con municipios (adm3) bajo sus 31 provincias, sin el Distrito Nacional", () => {
    const dominicana = COUNTRIES.get("republica-dominicana");
    expect(dominicana?.parents).toHaveLength(31);
    expect(dominicana?.expected).toBe(154);
    expect(dominicana?.levels).toEqual({ parent: "adm2", unit: "adm3" });
    expect(dominicana?.exclude).toEqual(["DO080101"]);
    expect(dominicana?.parents.find((p) => p.pcode === "DO0303")?.slug).toBe(
      "republica-dominicana-santiago-province",
    );
    expect(dominicana?.stripPrefix?.test("Municipio Arenoso")).toBe(true);
    expect(dominicana?.stripPrefix?.test("Provincia Duarte")).toBe(true);
  });

  it("configura Haití con sus 10 departamentos, alias en inglés y tildes en francés", () => {
    const haiti = COUNTRIES.get("haiti");
    expect(haiti?.parents).toHaveLength(10);
    expect(haiti?.expected).toBe(140);
    expect(haiti?.wikidataClass).toBe("Q3685462");
    expect(haiti?.wikidataLanguage).toBe("fr");
    expect(haiti?.accentsByParent).toBe(false);
    expect(haiti?.parents.find((p) => p.pcode === "HT01")).toMatchObject({
      name: "Ouest",
      aliases: ["West"],
      slug: "haiti-ouest",
    });
  });

  it("no repite números ni decisiones entre países", () => {
    const all = [...COUNTRIES.values()];
    expect(new Set(all.map((c) => c.number)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.decision)).size).toBe(all.length);
    for (const config of all) {
      for (const parent of config.parents) {
        expect(parent.slug).toMatch(new RegExp(`^${config.slugPrefix}-[a-z-]+$`));
      }
    }
  });
});
