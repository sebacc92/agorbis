import { describe, expect, it } from "vitest";
import {
  REGIONS,
  accentedName,
  buildPeruLevel4Rows,
  renderPeruDraftSql,
} from "../../scripts/peru-level4-lib.mjs";

// Filas mínimas con las columnas de per_admin2, per_admin3 y per_adminpoints
// (HDX COD-AB, fuente IGN).
const province = (adm1_pcode: string, adm1_name: string, adm2_pcode: string, adm2_name: string) => ({
  adm1_pcode,
  adm1_name,
  adm2_pcode,
  adm2_name,
});
const district = (adm2_pcode: string, adm3_pcode: string, adm3_name: string) => ({
  adm2_pcode,
  adm3_pcode,
  adm3_name,
});
const point = (admin_level: string, code: string, y: string, x: string) => ({
  admin_level,
  adm2_pcode: admin_level === "2" ? code : "",
  adm3_pcode: admin_level === "3" ? code : "",
  y_coord: y,
  x_coord: x,
});

describe("REGIONS", () => {
  it("cubre los 25 códigos del IGN con el slug que ya existe en la base", () => {
    expect(REGIONS.size).toBe(25);
    for (const region of REGIONS.values()) {
      expect(region.slug).toMatch(/^peru-[a-z-]+$/);
    }
  });
});

describe("accentedName", () => {
  it("toma las tildes del candidato sin su prefijo cuando sólo cambian tildes y mayúsculas", () => {
    expect(accentedName("Huanuco", ["Huánuco"])).toBe("Huánuco");
    expect(accentedName("Celendin", ["Provincia de Celendín"])).toBe("Celendín");
    expect(accentedName("Huallaga", ["provincia del Huallaga"])).toBe("Huallaga");
  });

  it("se queda con el nombre del IGN si el candidato cambia una palabra o un espacio", () => {
    expect(accentedName("Vilcas Huaman", ["Vilcashuamán"])).toBe("Vilcas Huaman");
    expect(accentedName("Antonio Raymondi", [])).toBe("Antonio Raymondi");
  });
});

describe("buildPeruLevel4Rows", () => {
  const provinces = [
    province("PE10", "Huanuco", "PE1001", "Huanuco"),
    province("PE15", "Lima", "PE1501", "Lima"),
    province("PE15", "Lima", "PE1506", "Huaral"),
    province("PE07", "Callao", "PE0701", "Callao"),
  ];
  const districts = [
    district("PE1501", "PE150122", "Miraflores"),
    district("PE1501", "PE150113", "Jesus Maria"),
    district("PE0701", "PE070106", "Ventanilla"),
    district("PE1001", "PE100101", "Huanuco"),
  ];
  const points = [
    point("2", "PE1001", "-9.93", "-76.24"),
    point("2", "PE1506", "-11.5", "-77.2"),
    point("3", "PE150122", "-12.12", "-77.03"),
    point("3", "PE150113", "-12.07", "-77.04"),
    point("3", "PE070106", "-11.87", "-77.13"),
  ];
  const accents = {
    provinces: [{ name: "Huánuco", parents: ["Huánuco"] }],
    districts: [{ name: "Jesús María", parents: ["provincia de Lima"] }],
  };
  const rows = buildPeruLevel4Rows({ provinces, districts, points, accents });

  it("usa las provincias como nivel 4 y, en Lima y El Callao, sus distritos", () => {
    expect(rows.map((row) => [row.slug, row.name, row.parentSlug])).toEqual([
      ["peru-el-callao-ventanilla", "Ventanilla", "peru-el-callao"],
      ["peru-huanuco-huanuco", "Huánuco", "peru-huanuco"],
      ["peru-lima-huaral", "Huaral", "peru-lima"],
      [
        "peru-municipalidad-metropolitana-de-lima-jesus-maria",
        "Jesús María",
        "peru-municipalidad-metropolitana-de-lima",
      ],
      [
        "peru-municipalidad-metropolitana-de-lima-miraflores",
        "Miraflores",
        "peru-municipalidad-metropolitana-de-lima",
      ],
    ]);
  });

  it("describe cada fila según su gobierno y lleva su punto", () => {
    const byCode = new Map(rows.map((row) => [row.code, row]));
    expect(byCode.get("PE1001")).toMatchObject({
      description: "Provincia del departamento de Huánuco",
      lat: -9.93,
      lng: -76.24,
    });
    expect(byCode.get("PE070106")?.description).toBe(
      "Distrito de la Provincia Constitucional del Callao",
    );
    expect(byCode.get("PE150122")?.description).toBe(
      "Distrito de Lima Metropolitana",
    );
  });

  it("falla ante un departamento desconocido, uno que no coincide o una fila sin punto", () => {
    const base = { districts: [], points, accents: { provinces: [], districts: [] } };
    expect(() =>
      buildPeruLevel4Rows({ ...base, provinces: [province("PE26", "X", "PE2601", "Y")] }),
    ).toThrow(/Departamento desconocido/);
    expect(() =>
      buildPeruLevel4Rows({ ...base, provinces: [province("PE10", "Puno", "PE1001", "Huanuco")] }),
    ).toThrow(/no coincide/);
    expect(() =>
      buildPeruLevel4Rows({ ...base, provinces: [province("PE10", "Huanuco", "PE1002", "Ambo")] }),
    ).toThrow(/sin punto/);
  });
});

describe("renderPeruDraftSql", () => {
  const rows = buildPeruLevel4Rows({
    provinces: [province("PE10", "Huanuco", "PE1001", "Huanuco")],
    districts: [],
    points: [point("2", "PE1001", "-9.93", "-76.24")],
    accents: { provinces: [], districts: [] },
  });
  const sql = renderPeruDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita las dos fuentes, la fecha y la decisión", () => {
    expect(sql).toContain("Agorbis · 0082 · Provincias de Perú como nivel 4 (D134)");
    expect(sql).toContain("scripts/build-peru-level4-draft.mjs");
    expect(sql).toContain("IGN");
    expect(sql).toContain("Wikidata");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0082 y lleva las coordenadas", () => {
    expect(sql).toContain("AGORBIS_0082_MISSING_REGION");
    expect(sql).toContain("path like 'earth.south-america.peru.%'");
    expect(sql).toContain("'Provincia del departamento de Huánuco', -9.93, -76.24)");
  });
});
