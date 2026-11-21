import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  buildGuatemalaLevel4Rows,
  renderGuatemalaDraftSql,
} from "../../scripts/guatemala-level4-lib.mjs";

// Filas mínimas con las columnas de gtm_admin2 y gtm_adminpoints (HDX COD-AB).
const municipio = (
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

describe("DEPARTMENTS", () => {
  it("cubre los 22 departamentos con el slug que ya existe en la base", () => {
    expect(DEPARTMENTS.size).toBe(22);
    expect(DEPARTMENTS.get("GT18")?.slug).toBe("guatemala-izabal-department");
    expect(DEPARTMENTS.get("GT10")?.slug).toBe("guatemala-suchitepeque");
    for (const department of DEPARTMENTS.values()) {
      expect(department.slug).toMatch(/^guatemala-[a-z-]+$/);
    }
  });
});

describe("buildGuatemalaLevel4Rows", () => {
  it("cuelga cada municipio de su departamento con su punto", () => {
    const [row] = buildGuatemalaLevel4Rows(
      [municipio("GT18", "Izabal", "GT1801", "Puerto Barrios")],
      [point("GT1801", "15.72", "-88.59")],
    );

    expect(row).toEqual({
      slug: "guatemala-izabal-puerto-barrios",
      name: "Puerto Barrios",
      parentSlug: "guatemala-izabal-department",
      path: "earth.north-america.guatemala.guatemala-izabal-department.guatemala-izabal-puerto-barrios",
      description: "Municipio del departamento de Izabal",
      lat: 15.72,
      lng: -88.59,
      code: "GT1801",
    });
  });

  it("deja afuera los lagos, que la capa trae como unidades sin municipio", () => {
    const rows = buildGuatemalaLevel4Rows(
      [
        municipio("GT07", "Sololá", "GT0700", "Lago De Atitlan"),
        municipio("GT07", "Sololá", "GT0718", "San Pedro La Laguna"),
      ],
      [point("GT0718", "14.69", "-91.27")],
    );

    expect(rows.map((row) => row.name)).toEqual(["San Pedro La Laguna"]);
  });

  it("distingue homónimos de distintos departamentos con el departamento en el slug", () => {
    const rows = buildGuatemalaLevel4Rows(
      [
        municipio("GT01", "Guatemala", "GT0109", "San Pedro Sacatepéquez"),
        municipio("GT12", "San Marcos", "GT1202", "San Pedro Sacatepéquez"),
      ],
      [point("GT0109", "14.68", "-90.64"), point("GT1202", "14.96", "-91.77")],
    );

    expect(rows.map((row) => row.slug)).toEqual([
      "guatemala-guatemala-san-pedro-sacatepequez",
      "guatemala-san-marcos-san-pedro-sacatepequez",
    ]);
  });

  it("falla ante un departamento desconocido, uno que no coincide o un municipio sin punto", () => {
    expect(() =>
      buildGuatemalaLevel4Rows([municipio("GT23", "X", "GT2301", "Y")], []),
    ).toThrow(/Departamento desconocido/);
    expect(() =>
      buildGuatemalaLevel4Rows(
        [municipio("GT18", "Zacapa", "GT1801", "Puerto Barrios")],
        [point("GT1801", "15.72", "-88.59")],
      ),
    ).toThrow(/no coincide/);
    expect(() =>
      buildGuatemalaLevel4Rows(
        [municipio("GT18", "Izabal", "GT1801", "Puerto Barrios")],
        [],
      ),
    ).toThrow(/sin punto/);
  });
});

describe("renderGuatemalaDraftSql", () => {
  const rows = buildGuatemalaLevel4Rows(
    [municipio("GT09", "Quetzaltenango", "GT0901", "Quetzaltenango")],
    [point("GT0901", "14.83", "-91.52")],
  );
  const sql = renderGuatemalaDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, la fecha y la decisión", () => {
    expect(sql).toContain(
      "Agorbis · 0087 · Municipios de Guatemala como nivel 4 (D139)",
    );
    expect(sql).toContain("scripts/build-guatemala-level4-draft.mjs");
    expect(sql).toContain("CONRED");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0087 y lleva las coordenadas", () => {
    expect(sql).toContain("AGORBIS_0087_MISSING_DEPARTMENT");
    expect(sql).toContain("path like 'earth.north-america.guatemala.%'");
    expect(sql).toContain(
      "'Municipio del departamento de Quetzaltenango', 14.83, -91.52)",
    );
  });
});
