import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  buildColombiaLevel4Rows,
  renderColombiaDraftSql,
} from "../../scripts/colombia-level4-lib.mjs";

// Filas mínimas con las columnas de la DIVIPOLA del DANE (datos.gov.co).
const unit = (
  cod_dpto: string,
  dpto: string,
  cod_mpio: string,
  nom_mpio: string,
  tipo_municipio = "Municipio",
) => ({ cod_dpto, dpto, cod_mpio, nom_mpio, tipo_municipio });

describe("DEPARTMENTS", () => {
  it("cubre los 32 departamentos sin Bogotá, que ya es su propio distrito", () => {
    expect(DEPARTMENTS.size).toBe(32);
    expect(DEPARTMENTS.has("11")).toBe(false);
    for (const department of DEPARTMENTS.values()) {
      expect(department.slug).toMatch(/^colombia-[a-z-]+$/);
    }
  });
});

describe("buildColombiaLevel4Rows", () => {
  const names = new Map([["05001", "Medellín"]]);

  it("toma la lista de la DIVIPOLA y el nombre del COD-AB por código", () => {
    const [row] = buildColombiaLevel4Rows(
      [unit("05", "ANTIOQUIA", "05001", "MEDELLÍN")],
      names,
    );

    expect(row).toEqual({
      slug: "colombia-antioquia-medellin",
      name: "Medellín",
      parentSlug: "colombia-antioquia",
      path: "earth.south-america.colombia.colombia-antioquia.colombia-antioquia-medellin",
      description: "Municipio del departamento de Antioquia",
      code: "05001",
      nameSource: "COD-AB",
    });
  });

  it("sin nombre en el COD-AB, usa el de la DIVIPOLA con mayúscula inicial", () => {
    const [row] = buildColombiaLevel4Rows(
      [unit("27", "CHOCÓ", "27493", "NUEVO BELÉN DE BAJIRÁ")],
      new Map(),
    );

    expect([row.name, row.nameSource]).toEqual([
      "Nuevo Belén de Bajirá",
      "DIVIPOLA",
    ]);
  });

  it("deja afuera Bogotá, las áreas no municipalizadas y la isla de San Andrés", () => {
    const rows = buildColombiaLevel4Rows(
      [
        unit("11", "BOGOTÁ, D.C.", "11001", "BOGOTÁ, D.C."),
        unit("91", "AMAZONAS", "91263", "EL ENCANTO", "Área no municipalizada"),
        unit("88", "ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA", "88001", "SAN ANDRÉS", "Isla"),
        unit("05", "ANTIOQUIA", "05001", "MEDELLÍN"),
      ],
      names,
    );

    expect(rows.map((row) => row.code)).toEqual(["05001"]);
  });

  it("distingue homónimos de distintos departamentos con el departamento en el slug", () => {
    const rows = buildColombiaLevel4Rows(
      [
        unit("44", "LA GUAJIRA", "44035", "ALBANIA"),
        unit("68", "SANTANDER", "68020", "ALBANIA"),
      ],
      new Map([
        ["44035", "Albania"],
        ["68020", "Albania"],
      ]),
    );

    expect(rows.map((row) => row.slug)).toEqual([
      "colombia-la-guajira-albania",
      "colombia-santander-albania",
    ]);
  });

  it("falla ante un tipo de unidad nuevo, un departamento desconocido o uno que no coincide", () => {
    expect(() =>
      buildColombiaLevel4Rows([unit("05", "ANTIOQUIA", "05999", "X", "Distrito especial")], names),
    ).toThrow(/Tipo de unidad desconocido/);
    expect(() =>
      buildColombiaLevel4Rows([unit("12", "NUEVO", "12001", "X")], names),
    ).toThrow(/Departamento desconocido/);
    expect(() =>
      buildColombiaLevel4Rows([unit("05", "CALDAS", "05001", "MEDELLÍN")], names),
    ).toThrow(/no coincide/);
  });
});

describe("renderColombiaDraftSql", () => {
  const rows = buildColombiaLevel4Rows(
    [unit("05", "ANTIOQUIA", "05001", "MEDELLÍN")],
    new Map([["05001", "Medellín"]]),
  );
  const sql = renderColombiaDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita las dos fuentes con su licencia, la fecha y la decisión", () => {
    expect(sql).toContain(
      "Agorbis · 0083 · Municipios de Colombia como nivel 4 (D135)",
    );
    expect(sql).toContain("scripts/build-colombia-level4-draft.mjs");
    expect(sql).toContain("DIVIPOLA");
    expect(sql).toContain("CC BY-SA 4.0");
    expect(sql).toContain("CC BY-IGO");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0083 y sin coordenadas", () => {
    expect(sql).toContain("AGORBIS_0083_MISSING_DEPARTMENT");
    expect(sql).toContain("path like 'earth.south-america.colombia.%'");
    expect(sql).toContain("'Municipio del departamento de Antioquia', null, null)");
  });
});
