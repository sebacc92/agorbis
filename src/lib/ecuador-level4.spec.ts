import { describe, expect, it } from "vitest";
import {
  PROVINCES,
  buildEcuadorLevel4Rows,
  renderEcuadorDraftSql,
} from "../../scripts/ecuador-level4-lib.mjs";

// Filas mínimas con las columnas de ecu_admgz_adm2 (HDX COD-AB, fuente INEC).
const canton = (
  ADM1_PCODE: string,
  ADM1_ES: string,
  ADM2_PCODE: string,
  ADM2_ES: string,
) => ({ ADM1_PCODE, ADM1_ES, ADM2_PCODE, ADM2_ES });

describe("PROVINCES", () => {
  it("cubre las 24 provincias con el slug que ya existe en la base", () => {
    expect(PROVINCES.size).toBe(24);
    for (const province of PROVINCES.values()) {
      expect(province.slug).toMatch(/^ecuador-[a-z-]+$/);
    }
  });
});

describe("buildEcuadorLevel4Rows", () => {
  it("cuelga cada cantón de su provincia, sin coordenadas", () => {
    const [row] = buildEcuadorLevel4Rows([
      canton("EC01", "Azuay", "EC0101", "Cuenca"),
    ]);

    expect(row).toEqual({
      slug: "ecuador-azuay-cuenca",
      name: "Cuenca",
      parentSlug: "ecuador-azuay",
      path: "earth.south-america.ecuador.ecuador-azuay.ecuador-azuay-cuenca",
      description: "Cantón de la provincia de Azuay",
      code: "EC0101",
    });
  });

  it("deja afuera las zonas sin cantón y falla ante otra provincia desconocida", () => {
    const rows = buildEcuadorLevel4Rows([
      canton("ECISLA", "Isla", "ECISLA", "Isla"),
      canton("ECNO APLICA", "No Aplica", "ECZONA", "Zona en Estudio: Juval"),
      canton("EC13", "Manabí", "EC1301", "Portoviejo"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual(["ecuador-manabi-portoviejo"]);
    expect(() =>
      buildEcuadorLevel4Rows([canton("EC25", "Nueva", "EC2501", "X")]),
    ).toThrow(/Provincia desconocida/);
  });

  it("distingue homónimos de distintas provincias con la provincia en el slug", () => {
    const rows = buildEcuadorLevel4Rows([
      canton("EC02", "Bolívar", "EC0206", "Olmedo"),
      canton("EC11", "Loja", "EC1114", "Olmedo"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual([
      "ecuador-bolivar-olmedo",
      "ecuador-loja-olmedo",
    ]);
  });

  it("colapsa espacios repetidos y corrige sólo las mayúsculas mal puestas", () => {
    const rows = buildEcuadorLevel4Rows([
      canton("EC09", "Guayas", "EC0928", "General  Antonio Elizalde"),
      canton("EC01", "Azuay", "EC0115", "Camilo Ponce enríquez"),
    ]);

    expect(rows.map((row) => row.name)).toEqual([
      "Camilo Ponce Enríquez",
      "General Antonio Elizalde",
    ]);
  });

  it("falla si el nombre de la provincia no es el del código o hay un slug repetido", () => {
    expect(() =>
      buildEcuadorLevel4Rows([canton("EC01", "Loja", "EC0101", "Cuenca")]),
    ).toThrow(/no coincide/);
    expect(() =>
      buildEcuadorLevel4Rows([
        canton("EC01", "Azuay", "EC0101", "Cuenca"),
        canton("EC01", "Azuay", "EC0199", "Cuenca"),
      ]),
    ).toThrow(/Slug repetido/);
  });
});

describe("renderEcuadorDraftSql", () => {
  const rows = buildEcuadorLevel4Rows([
    canton("EC17", "Pichincha", "EC1701", "Quito"),
  ]);
  const sql = renderEcuadorDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, la fecha y la decisión", () => {
    expect(sql).toContain(
      "Agorbis · 0081 · Cantones de Ecuador como nivel 4 (D133)",
    );
    expect(sql).toContain("scripts/build-ecuador-level4-draft.mjs");
    expect(sql).toContain("INEC");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0081 y sin coordenadas", () => {
    expect(sql).toContain("AGORBIS_0081_MISSING_PROVINCE");
    expect(sql).toContain("path like 'earth.south-america.ecuador.%'");
    expect(sql).toContain("'Cantón de la provincia de Pichincha', null, null)");
  });
});
