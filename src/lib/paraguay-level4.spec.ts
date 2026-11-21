import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  buildParaguayLevel4Rows,
  compareWithElection,
  renderParaguayDraftSql,
} from "../../scripts/paraguay-level4-lib.mjs";

// Filas mínimas con las columnas de pry_admin2 y pry_adminpoints (HDX COD-AB).
const district = (adm1_pcode: string, adm2_pcode: string, adm2_name: string) => ({
  adm1_pcode,
  adm2_pcode,
  adm2_name,
});
const point = (adm2_pcode: string, y_coord: string, x_coord: string) => ({
  admin_level: "2",
  adm2_pcode,
  y_coord,
  x_coord,
});

describe("DEPARTMENTS", () => {
  it("cubre los 17 departamentos sin Asunción, que ya es su propio distrito", () => {
    expect(DEPARTMENTS.size).toBe(17);
    expect(DEPARTMENTS.has("PY00")).toBe(false);
    for (const department of DEPARTMENTS.values()) {
      expect(department.slug).toMatch(/^paraguay-[a-z-]+$/);
    }
  });
});

describe("buildParaguayLevel4Rows", () => {
  it("cuelga cada distrito de su departamento con su punto y deja afuera Asunción", () => {
    const rows = buildParaguayLevel4Rows(
      [
        district("PY00", "PY0000", "Asunción"),
        district("PY11", "PY1101", "Areguá"),
      ],
      [point("PY0000", "-25.28", "-57.59"), point("PY1101", "-25.2938939", "-57.3862801")],
    );

    expect(rows).toEqual([
      {
        slug: "paraguay-central-aregua",
        name: "Areguá",
        parentSlug: "paraguay-central",
        path: "earth.south-america.paraguay.paraguay-central.paraguay-central-aregua",
        description: "Distrito del departamento de Central",
        lat: -25.293894,
        lng: -57.38628,
        code: "PY1101",
      },
    ]);
  });

  it("distingue homónimos con el departamento en el slug", () => {
    const rows = buildParaguayLevel4Rows(
      [
        district("PY07", "PY0703", "Bella Vista"),
        district("PY13", "PY1302", "Bella Vista"),
      ],
      [point("PY0703", "-27", "-55.5"), point("PY1302", "-22.1", "-56.5")],
    );

    expect(rows.map((row) => row.slug)).toEqual([
      "paraguay-amambay-bella-vista",
      "paraguay-itapua-bella-vista",
    ]);
  });

  it("corrige sólo las mayúsculas mal puestas que trae la fuente", () => {
    const rows = buildParaguayLevel4Rows(
      [
        district("PY09", "PY0918", "R.i. 3 Corrales"),
        district("PY03", "PY0319", "Juan E. O'leary"),
      ],
      [point("PY0918", "-25.9", "-57.1"), point("PY0319", "-25.4", "-57")],
    );

    expect(rows.map((row) => row.name).sort()).toEqual([
      "Juan E. O'Leary",
      "R.I. 3 Corrales",
    ]);
  });

  it("falla ante un departamento desconocido o un distrito sin punto", () => {
    expect(() =>
      buildParaguayLevel4Rows([district("PY99", "PY9901", "X")], []),
    ).toThrow(/Departamento desconocido/);
    expect(() =>
      buildParaguayLevel4Rows([district("PY11", "PY1101", "Areguá")], []),
    ).toThrow(/sin punto/);
  });
});

describe("compareWithElection", () => {
  const rows = buildParaguayLevel4Rows(
    [district("PY11", "PY1101", "Areguá"), district("PY11", "PY1102", "Capiatá")],
    [point("PY1101", "-25.3", "-57.4"), point("PY1102", "-25.35", "-57.45")],
  );

  it("no informa nada si cada departamento tiene tantos distritos como intendencias electas", () => {
    const election = [
      { COD_DEPARTAMENTO: "0", COD_DISTRITO: "0" },
      { COD_DEPARTAMENTO: "11", COD_DISTRITO: "1" },
      { COD_DEPARTAMENTO: "11", COD_DISTRITO: "2" },
    ];

    expect(compareWithElection(rows, election)).toEqual([]);
  });

  it("informa el departamento donde los conteos no coinciden", () => {
    const election = [{ COD_DEPARTAMENTO: "11", COD_DISTRITO: "1" }];

    expect(compareWithElection(rows, election)).toEqual([
      "PY11: 2 distritos y 1 intendencias electas",
    ]);
  });
});

describe("renderParaguayDraftSql", () => {
  const rows = buildParaguayLevel4Rows(
    [district("PY11", "PY1101", "Areguá")],
    [point("PY1101", "-25.3", "-57.4")],
  );
  const sql = renderParaguayDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita las dos fuentes, la fecha y la decisión", () => {
    expect(sql).toContain("Agorbis · 0079 · Distritos de Paraguay como nivel 4 (D131)");
    expect(sql).toContain("scripts/build-paraguay-level4-draft.mjs");
    expect(sql).toContain("CC BY-IGO");
    expect(sql).toContain("Justicia Electoral");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0079 y lleva las coordenadas", () => {
    expect(sql).toContain("AGORBIS_0079_MISSING_DEPARTMENT");
    expect(sql).toContain("path like 'earth.south-america.paraguay.%'");
    expect(sql).toContain("'Distrito del departamento de Central', -25.3, -57.4)");
  });
});
