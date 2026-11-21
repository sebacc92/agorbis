import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  buildBoliviaLevel4Rows,
  renderBoliviaDraftSql,
} from "../../scripts/bolivia-level4-lib.mjs";

// Filas mínimas con las columnas de bol_admin3 y bol_adminpoints (HDX COD-AB).
const municipality = (
  adm1_pcode: string,
  adm1_name: string,
  adm3_pcode: string,
  adm3_name: string,
) => ({ adm1_pcode, adm1_name, adm3_pcode, adm3_name });
const point = (adm3_pcode: string, y_coord: string, x_coord: string) => ({
  admin_level: "3",
  adm3_pcode,
  y_coord,
  x_coord,
});

describe("DEPARTMENTS", () => {
  it("cubre los 9 departamentos con el slug que ya existe en la base", () => {
    expect(DEPARTMENTS.size).toBe(9);
    for (const department of DEPARTMENTS.values()) {
      expect(department.slug).toMatch(/^bolivia-[a-z-]+$/);
    }
  });
});

describe("buildBoliviaLevel4Rows", () => {
  it("cuelga cada municipio de su departamento, sin la provincia intermedia, con su punto", () => {
    const [row] = buildBoliviaLevel4Rows(
      [municipality("BO02", "La Paz", "BO020105", "El Alto")],
      [point("BO020105", "-16.5047", "-68.1633")],
    );

    expect(row).toEqual({
      slug: "bolivia-la-paz-el-alto",
      name: "El Alto",
      parentSlug: "bolivia-la-paz",
      path: "earth.south-america.bolivia.bolivia-la-paz.bolivia-la-paz-el-alto",
      description: "Municipio del departamento de La Paz",
      lat: -16.5047,
      lng: -68.1633,
      code: "BO020105",
    });
  });

  it("distingue homónimos de distintos departamentos con el departamento en el slug", () => {
    const rows = buildBoliviaLevel4Rows(
      [
        municipality("BO03", "Cochabamba", "BO031201", "Totora"),
        municipality("BO04", "Oruro", "BO041301", "Totora"),
      ],
      [point("BO031201", "-17.7", "-65.2"), point("BO041301", "-17.8", "-68.1")],
    );

    expect(rows.map((row) => row.slug)).toEqual([
      "bolivia-cochabamba-totora",
      "bolivia-oruro-totora",
    ]);
  });

  it("falla si el nombre del departamento no es el del código", () => {
    expect(() =>
      buildBoliviaLevel4Rows(
        [municipality("BO02", "Potosí", "BO020105", "El Alto")],
        [point("BO020105", "-16.5", "-68.1")],
      ),
    ).toThrow(/no coincide/);
  });

  it("falla ante un departamento desconocido, un municipio sin punto o un slug repetido", () => {
    expect(() =>
      buildBoliviaLevel4Rows([municipality("BO10", "X", "BO100101", "Y")], []),
    ).toThrow(/Departamento desconocido/);
    expect(() =>
      buildBoliviaLevel4Rows(
        [municipality("BO02", "La Paz", "BO020105", "El Alto")],
        [],
      ),
    ).toThrow(/sin punto/);
    expect(() =>
      buildBoliviaLevel4Rows(
        [
          municipality("BO02", "La Paz", "BO020105", "El Alto"),
          municipality("BO02", "La Paz", "BO020999", "El  Alto"),
        ],
        [point("BO020105", "-16.5", "-68.1"), point("BO020999", "-16.6", "-68.2")],
      ),
    ).toThrow(/Slug repetido/);
  });
});

describe("renderBoliviaDraftSql", () => {
  const rows = buildBoliviaLevel4Rows(
    [municipality("BO01", "Chuquisaca", "BO010101", "Sucre")],
    [point("BO010101", "-19.04", "-65.26")],
  );
  const sql = renderBoliviaDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, la fecha, la decisión y el municipio que falta", () => {
    expect(sql).toContain(
      "Agorbis · 0080 · Municipios de Bolivia como nivel 4 (D132)",
    );
    expect(sql).toContain("scripts/build-bolivia-level4-draft.mjs");
    expect(sql).toContain("Ministerio de Desarrollo Rural y Tierras");
    expect(sql).toContain("2026-11-20");
    expect(sql).toContain("340");
  });

  it("falla cerrado con los códigos de 0080 y lleva las coordenadas", () => {
    expect(sql).toContain("AGORBIS_0080_MISSING_DEPARTMENT");
    expect(sql).toContain("path like 'earth.south-america.bolivia.%'");
    expect(sql).toContain(
      "'Municipio del departamento de Chuquisaca', -19.04, -65.26)",
    );
  });
});
