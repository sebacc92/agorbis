import { describe, expect, it } from "vitest";
import {
  STATES,
  buildVenezuelaLevel4Rows,
  renderVenezuelaDraftSql,
} from "../../scripts/venezuela-level4-lib.mjs";

// Filas mínimas con las columnas de ven_admin2 y ven_adminpoints (HDX COD-AB).
const municipality = (
  adm1_pcode: string,
  adm1_name: string,
  adm2_pcode: string,
  adm2_name: string,
) => ({ adm1_pcode, adm1_name, adm2_pcode, adm2_name });
const point = (adm2_pcode: string, y_coord: string, x_coord: string) => ({
  admin_level: "2",
  adm2_pcode,
  y_coord,
  x_coord,
});

describe("STATES", () => {
  it("cubre las 24 entidades con municipios, sin las Dependencias Federales", () => {
    expect(STATES.size).toBe(24);
    expect(STATES.has("VE25")).toBe(false);
    for (const state of STATES.values()) {
      expect(state.slug).toMatch(/^venezuela-[a-z-]+$/);
    }
  });
});

describe("buildVenezuelaLevel4Rows", () => {
  it("cuelga el municipio Libertador del Distrito Capital, con su punto", () => {
    const [row] = buildVenezuelaLevel4Rows(
      [municipality("VE01", "Distrito Capital", "VE0101", "Libertador")],
      [point("VE0101", "10.5", "-66.93")],
    );

    expect(row).toEqual({
      slug: "venezuela-distrito-capital-libertador",
      name: "Libertador",
      parentSlug: "venezuela-distrito-capital",
      path: "earth.south-america.venezuela.venezuela-distrito-capital.venezuela-distrito-capital-libertador",
      description: "Municipio del Distrito Capital",
      lat: 10.5,
      lng: -66.93,
      code: "VE0101",
    });
  });

  it("deja afuera las Dependencias Federales, que no tienen municipio", () => {
    const rows = buildVenezuelaLevel4Rows(
      [
        municipality("VE25", "Dependencias Federales", "VE2501", "Dependencias Federales"),
        municipality("VE24", "La Guaira", "VE2401", "Vargas"),
      ],
      [point("VE2401", "10.6", "-66.9")],
    );

    expect(rows.map((row) => [row.slug, row.description])).toEqual([
      ["venezuela-la-guaira-vargas", "Municipio del estado La Guaira"],
    ]);
  });

  it("distingue homónimos de distintos estados con el estado en el slug", () => {
    const rows = buildVenezuelaLevel4Rows(
      [
        municipality("VE14", "Mérida", "VE1401", "Andrés Bello"),
        municipality("VE20", "Táchira", "VE2001", "Andrés Bello"),
      ],
      [point("VE1401", "8.6", "-71.2"), point("VE2001", "7.8", "-72.2")],
    );

    expect(rows.map((row) => row.slug)).toEqual([
      "venezuela-merida-andres-bello",
      "venezuela-tachira-andres-bello",
    ]);
  });

  it("corrige sólo la tilde que falta en la fuente", () => {
    const [row] = buildVenezuelaLevel4Rows(
      [municipality("VE02", "Amazonas", "VE0207", "Autónomo Rio Negro")],
      [point("VE0207", "1.9", "-67.0")],
    );

    expect(row.name).toBe("Autónomo Río Negro");
  });

  it("falla ante un estado desconocido, uno que no coincide o un municipio sin punto", () => {
    expect(() =>
      buildVenezuelaLevel4Rows([municipality("VE26", "X", "VE2601", "Y")], []),
    ).toThrow(/Estado desconocido/);
    expect(() =>
      buildVenezuelaLevel4Rows(
        [municipality("VE14", "Zulia", "VE1401", "Andrés Bello")],
        [point("VE1401", "8.6", "-71.2")],
      ),
    ).toThrow(/no coincide/);
    expect(() =>
      buildVenezuelaLevel4Rows(
        [municipality("VE14", "Mérida", "VE1401", "Andrés Bello")],
        [],
      ),
    ).toThrow(/sin punto/);
  });
});

describe("renderVenezuelaDraftSql", () => {
  const rows = buildVenezuelaLevel4Rows(
    [municipality("VE23", "Zulia", "VE2313", "Maracaibo")],
    [point("VE2313", "10.66", "-71.64")],
  );
  const sql = renderVenezuelaDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, la fecha y la decisión", () => {
    expect(sql).toContain(
      "Agorbis · 0084 · Municipios de Venezuela como nivel 4 (D136)",
    );
    expect(sql).toContain("scripts/build-venezuela-level4-draft.mjs");
    expect(sql).toContain("Instituto Nacional de Estadística");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0084 y lleva las coordenadas", () => {
    expect(sql).toContain("AGORBIS_0084_MISSING_STATE");
    expect(sql).toContain("path like 'earth.south-america.venezuela.%'");
    expect(sql).toContain("'Municipio del estado Zulia', 10.66, -71.64)");
  });
});
