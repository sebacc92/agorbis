import { describe, expect, it } from "vitest";
import { LIST_COUNTRIES } from "../../scripts/list-level4-countries.mjs";
import {
  buildListLevel4Rows,
  renderListDraftSql,
} from "../../scripts/list-level4-lib.mjs";

// Configuración mínima con la forma de las de list-level4-countries.mjs.
const country = {
  key: "pais",
  slugPrefix: "pais",
  number: "0099",
  decision: "D999",
  title: "Municipios de País como nivel 4",
  countryPath: "earth.somewhere.pais",
  parentLabel: "DEPARTMENT",
  unit: "Municipio",
  parents: [
    { name: "León", slug: "pais-leon-department", of: "del departamento de León" },
    {
      name: "Costa Norte",
      aliases: ["Región Autónoma de la Costa Norte"],
      slug: "pais-north-coast",
      of: "de la Región Autónoma de la Costa Norte",
    },
  ],
  exclude: ["Q1"],
  header: ["Fuente: una lista."],
};

describe("buildListLevel4Rows", () => {
  it("cuelga cada unidad del padre por su nombre, con o sin prefijo, y lleva su punto si lo tiene", () => {
    const rows = buildListLevel4Rows(country, [
      { code: "Q2", name: "Achuapa", parent: "Departamento de León", lat: 13.05, lng: -86.6 },
      { code: "Q3", name: "Bilwi", parent: "Región Autónoma de la Costa Norte" },
    ]);

    expect(rows).toEqual([
      // Ordenadas por path: el slug del padre de León va antes.
      {
        slug: "pais-leon-achuapa",
        name: "Achuapa",
        parentSlug: "pais-leon-department",
        path: "earth.somewhere.pais.pais-leon-department.pais-leon-achuapa",
        description: "Municipio del departamento de León",
        lat: 13.05,
        lng: -86.6,
        code: "Q2",
      },
      {
        slug: "pais-costa-norte-bilwi",
        name: "Bilwi",
        parentSlug: "pais-north-coast",
        path: "earth.somewhere.pais.pais-north-coast.pais-costa-norte-bilwi",
        description: "Municipio de la Región Autónoma de la Costa Norte",
        code: "Q3",
      },
    ]);
  });

  it("deja afuera los códigos excluidos aunque no tengan padre conocido", () => {
    expect(
      buildListLevel4Rows(country, [{ code: "Q1", name: "X", parent: "Otro" }]),
    ).toEqual([]);
  });

  it("falla ante un padre desconocido, una unidad sin padre o un slug repetido", () => {
    expect(() =>
      buildListLevel4Rows(country, [{ code: "Q4", name: "Y", parent: "Departamento de Sur" }]),
    ).toThrow(/Padre desconocido/);
    expect(() =>
      buildListLevel4Rows(country, [{ code: "Q5", name: "Y", parent: "" }]),
    ).toThrow(/sin padre/);
    expect(() =>
      buildListLevel4Rows(country, [
        { code: "Q6", name: "San Luis", parent: "León" },
        { code: "Q7", name: "San  Luis", parent: "León" },
      ]),
    ).toThrow(/Slug repetido/);
  });
});

describe("renderListDraftSql", () => {
  const rows = buildListLevel4Rows(country, [
    { code: "Q2", name: "Achuapa", parent: "León" },
  ]);
  const sql = renderListDraftSql(country, rows, { fetchedAt: "2026-11-20" });

  it("arma el borrador con número, decisión, generador, fuente y fecha", () => {
    expect(sql).toContain("Agorbis · 0099 · Municipios de País como nivel 4 (D999)");
    expect(sql).toContain("scripts/build-list-level4-draft.mjs pais");
    expect(sql).toContain("-- Fuente: una lista.");
    expect(sql).toContain("2026-11-20");
    expect(sql).toContain("AGORBIS_0099_MISSING_DEPARTMENT");
    expect(sql).toContain("'Municipio del departamento de León', null, null)");
  });
});

describe("LIST_COUNTRIES", () => {
  it("configura El Salvador con los 44 municipios del Decreto 762 y sus 14 departamentos", () => {
    const salvador = LIST_COUNTRIES.get("el-salvador");
    expect(salvador?.expected).toBe(44);
    expect(salvador?.parents).toHaveLength(14);
    expect(salvador?.source).toEqual({ kind: "wikidata", classId: "Q3556889" });
    expect(salvador?.exclude).toContain("Q94339265");
  });

  it("configura Nicaragua con los 153 municipios de la Ley 59 y sus 17 departamentos y regiones", () => {
    const nicaragua = LIST_COUNTRIES.get("nicaragua");
    expect(nicaragua?.expected).toBe(153);
    expect(nicaragua?.parents).toHaveLength(17);
    expect(nicaragua?.source).toEqual({ kind: "wikidata", classId: "Q318727" });
  });

  it("configura Panamá con los distritos de la ANATI, sin las comarcas que ya son nivel 3", () => {
    const panama = LIST_COUNTRIES.get("panama");
    expect(panama?.expected).toBe(81);
    expect(panama?.source.kind).toBe("anati");
    expect(panama?.exclude).toEqual(["0105", "1001"]);
  });

  it("no repite números ni decisiones y usa slugs con el prefijo del país", () => {
    const all = [...LIST_COUNTRIES.values()];
    expect(new Set(all.map((c) => c.number)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.decision)).size).toBe(all.length);
    for (const config of all) {
      for (const parent of config.parents) {
        expect(parent.slug).toMatch(new RegExp(`^${config.slugPrefix}-[a-z-]+$`));
      }
    }
  });
});
