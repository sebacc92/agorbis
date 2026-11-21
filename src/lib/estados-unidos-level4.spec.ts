import { describe, expect, it } from "vitest";
import {
  STATES,
  buildEstadosUnidosLevel4Rows,
  parseGazetteer,
  renderEstadosUnidosDraftSql,
} from "../../scripts/estados-unidos-level4-lib.mjs";

// Filas mínimas con las columnas del Gazetteer de condados del Census.
const county = (usps: string, geoid: string, name: string, lat = 1, lng = 2) => ({
  usps,
  geoid,
  name,
  lat,
  lng,
});

describe("STATES", () => {
  it("cubre los 50 estados con el slug de 0016, sin DC", () => {
    expect(STATES.size).toBe(50);
    expect(STATES.has("DC")).toBe(false);
    expect(STATES.get("NY")).toEqual({
      name: "New York",
      slug: "estados-unidos-new-york",
    });
  });
});

describe("parseGazetteer", () => {
  it("lee el archivo separado por tabuladores, con espacios de relleno", () => {
    const text =
      "USPS\tGEOID\tANSICODE\tNAME\tALAND\tAWATER\tALAND_SQMI\tAWATER_SQMI\tINTPTLAT\tINTPTLONG     \n" +
      "AL\t01001\t00161526\tAutauga County\t1\t2\t3\t4\t32.532237\t-86.64644     \n";

    expect(parseGazetteer(text)).toEqual([
      county("AL", "01001", "Autauga County", 32.532237, -86.64644),
    ]);
  });
});

describe("buildEstadosUnidosLevel4Rows", () => {
  it("cuelga cada condado de su estado con la sigla en el slug y su punto", () => {
    const [row] = buildEstadosUnidosLevel4Rows([
      county("AL", "01001", "Autauga County", 32.532237, -86.64644),
    ]);

    expect(row).toEqual({
      slug: "estados-unidos-al-autauga-county",
      name: "Autauga County",
      parentSlug: "estados-unidos-alabama",
      path: "earth.north-america.estados-unidos.estados-unidos-alabama.estados-unidos-al-autauga-county",
      description: "Condado del estado de Alabama",
      code: "01001",
      lat: 32.532237,
      lng: -86.64644,
    });
  });

  it("describe cada equivalente de condado por lo que es", () => {
    const rows = buildEstadosUnidosLevel4Rows([
      county("LA", "22071", "Orleans Parish"),
      county("AK", "02020", "Anchorage Municipality"),
      county("AK", "02290", "Yukon-Koyukuk Census Area"),
      county("AK", "02110", "Juneau City and Borough"),
      county("AK", "02090", "Fairbanks North Star Borough"),
      county("VA", "51510", "Alexandria city"),
      county("CT", "09110", "Capitol Planning Region"),
      county("NV", "32510", "Carson City"),
    ]);

    expect(Object.fromEntries(rows.map((r) => [r.name, r.description]))).toEqual({
      "Orleans Parish": "Parroquia del estado de Louisiana",
      "Anchorage Municipality": "Borough del estado de Alaska",
      "Yukon-Koyukuk Census Area": "Área censal del estado de Alaska",
      "Juneau City and Borough": "Borough del estado de Alaska",
      "Fairbanks North Star Borough": "Borough del estado de Alaska",
      "Alexandria city": "Ciudad independiente del estado de Virginia",
      "Capitol Planning Region": "Región de planificación del estado de Connecticut",
      "Carson City": "Ciudad independiente del estado de Nevada",
    });
  });

  it("distingue el condado de la ciudad independiente del mismo nombre", () => {
    const rows = buildEstadosUnidosLevel4Rows([
      county("VA", "51059", "Fairfax County"),
      county("VA", "51600", "Fairfax city"),
    ]);

    expect(rows.map((row) => row.slug).sort()).toEqual([
      "estados-unidos-va-fairfax-city",
      "estados-unidos-va-fairfax-county",
    ]);
  });

  it("deja afuera DC, Puerto Rico y Kalawao, que no tiene gobierno propio", () => {
    const rows = buildEstadosUnidosLevel4Rows([
      county("DC", "11001", "District of Columbia"),
      county("PR", "72001", "Adjuntas Municipio"),
      county("HI", "15005", "Kalawao County"),
      county("HI", "15003", "Honolulu County"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual([
      "estados-unidos-hi-honolulu-county",
    ]);
  });

  it("falla con un tipo de condado desconocido", () => {
    expect(() =>
      buildEstadosUnidosLevel4Rows([county("TX", "48999", "Lone Star Shire")]),
    ).toThrow(/tipo/i);
  });

  it("falla con un estado desconocido", () => {
    expect(() =>
      buildEstadosUnidosLevel4Rows([county("ZZ", "99001", "Nowhere County")]),
    ).toThrow(/estado/i);
  });
});

describe("renderEstadosUnidosDraftSql", () => {
  it("escribe el borrador 0096 bajo Estados Unidos, con coordenadas", () => {
    const rows = buildEstadosUnidosLevel4Rows([
      county("AL", "01001", "Autauga County", 32.532237, -86.64644),
    ]);
    const sql = renderEstadosUnidosDraftSql(rows, { fetchedAt: "2026-11-21" });

    expect(sql).toContain("Agorbis · 0096");
    expect(sql).toContain("path like 'earth.north-america.estados-unidos.%'");
    expect(sql).toContain(
      "('estados-unidos-al-autauga-county', 'Autauga County', 'estados-unidos-alabama', 'Condado del estado de Alabama', 32.532237, -86.64644)",
    );
    expect(sql).toContain("v_expected_level4 constant int := 1;");
  });
});
