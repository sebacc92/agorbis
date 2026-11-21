import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  buildUruguayLevel4Rows,
  municipalityName,
  parseCsv,
  renderUruguayDraftSql,
} from "../../scripts/uruguay-level4-lib.mjs";

// Filas mínimas con la forma del plan circuital de la Corte Electoral.
const circuit = (Departamento: string, Municipio: string) => ({
  Departamento,
  Municipio,
});

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("DEPARTMENTS", () => {
  it("cubre los 19 departamentos con el slug que ya existe en la base", () => {
    expect(DEPARTMENTS.size).toBe(19);
    for (const department of DEPARTMENTS.values()) {
      expect(department.slug).toMatch(/^uruguay-[a-z-]+$/);
    }
  });
});

describe("municipalityName", () => {
  it("nombra los de Montevideo como Municipio y su letra", () => {
    expect(municipalityName("MO", "CH")).toBe("Municipio CH");
  });

  it("saca la letra y pasa a mayúscula inicial sin subir las partículas", () => {
    expect(municipalityName("TA", "A - PASO DE LOS TOROS")).toBe(
      "Paso de los Toros",
    );
    expect(municipalityName("LA", "C - JOSÉ BATLLE Y ORDÓÑEZ")).toBe(
      "José Batlle y Ordóñez",
    );
    expect(municipalityName("CO", "B - JUAN L. LACAZE")).toBe(
      "Juan L. Lacaze",
    );
    expect(municipalityName("CA", "AC - DEL ANDALUZ")).toBe("Del Andaluz");
    expect(municipalityName("CA", "AB - 18 DE MAYO")).toBe("18 de Mayo");
  });

  it("quita el paréntesis cuando sólo repite el departamento o lo desambigua", () => {
    expect(municipalityName("PA", "B - QUEBRACHO (PAYSANDÚ)")).toBe(
      "Quebracho",
    );
    expect(municipalityName("CO", "J - LA PAZ (COLONIA)")).toBe("La Paz");
  });

  it("falla ante un municipio del interior sin letra", () => {
    expect(() => municipalityName("SA", "MATAOJO")).toThrow(/sin letra/);
  });
});

describe("buildUruguayLevel4Rows", () => {
  it("deja una fila por municipio aunque tenga muchos circuitos, sin el territorio no municipalizado", () => {
    const rows = buildUruguayLevel4Rows([
      circuit("SA", "A - VILLA CONSTITUCIÓN"),
      circuit("SA", "A - VILLA CONSTITUCIÓN"),
      circuit("SA", "SIN MUNICIPIO"),
      circuit("MO", "B"),
    ]);

    expect(rows.map((row) => [row.slug, row.name, row.parentSlug])).toEqual([
      ["uruguay-montevideo-municipio-b", "Municipio B", "uruguay-montevideo"],
      [
        "uruguay-salto-villa-constitucion",
        "Villa Constitución",
        "uruguay-salto",
      ],
    ]);
  });

  it("cuelga cada fila de su departamento con un path y un slug válidos", () => {
    const [row] = buildUruguayLevel4Rows([circuit("CA", "Ñ - ATLÁNTIDA")]);

    expect(row).toEqual({
      slug: "uruguay-canelones-atlantida",
      name: "Atlántida",
      parentSlug: "uruguay-canelones",
      path: "earth.south-america.uruguay.uruguay-canelones.uruguay-canelones-atlantida",
      description: "Municipio del departamento de Canelones",
      code: "CA:Ñ",
    });
    expect(row.slug).toMatch(SLUG_FORMAT);
  });

  it("acepta el mismo nombre en dos departamentos, porque el buscador muestra el departamento", () => {
    const rows = buildUruguayLevel4Rows([
      circuit("PA", "G - CERRO CHATO"),
      circuit("TT", "C - CERRO CHATO"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual([
      "uruguay-paysandu-cerro-chato",
      "uruguay-treinta-y-tres-cerro-chato",
    ]);
  });

  it("falla ante un departamento desconocido o una fila sin municipio", () => {
    expect(() => buildUruguayLevel4Rows([circuit("XX", "A - ALGO")])).toThrow(
      /Departamento desconocido/,
    );
    expect(() => buildUruguayLevel4Rows([circuit("SA", "  ")])).toThrow(
      /sin municipio/i,
    );
  });

  it("falla si dos municipios de un departamento dan el mismo slug", () => {
    expect(() =>
      buildUruguayLevel4Rows([
        circuit("CA", "A - LA PAZ"),
        circuit("CA", "B - LA PAZ (CANELONES)"),
      ]),
    ).toThrow(/Slug repetido/);
  });
});

describe("parseCsv", () => {
  it("respeta comas y comillas dentro de un campo entre comillas", () => {
    const rows = parseCsv(
      '﻿Departamento,Municipio,Local \r\nMO,B,"ESCUELA 1, ""CENTRO"""\r\n',
    );

    expect(rows).toEqual([
      { Departamento: "MO", Municipio: "B", Local: 'ESCUELA 1, "CENTRO"' },
    ]);
  });

  it("falla ante una fila con columnas de más o de menos", () => {
    expect(() => parseCsv("A,B\n1,2,3\n")).toThrow(/columnas/);
  });
});

describe("renderUruguayDraftSql", () => {
  const rows = buildUruguayLevel4Rows([
    circuit("CO", "K - CONCHILLAS"),
    circuit("MO", "A"),
  ]);
  const sql = renderUruguayDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("se presenta como borrador, dice qué script lo genera y cita la fuente", () => {
    expect(sql).toContain("BORRADOR");
    expect(sql).toContain("scripts/build-uruguay-level4-draft.mjs");
    expect(sql).toContain("Corte Electoral");
    expect(sql).toContain("2026-11-20");
  });

  it("corre en una transacción, falla cerrado y verifica el total", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toContain("set local search_path = ''");
    expect(sql).toContain("AGORBIS_0077_MISSING_DEPARTMENT");
    expect(sql).toContain("AGORBIS_0077_SLUG_TAKEN");
    expect(sql).toContain("v_expected_level4 constant int := 2;");
  });

  it("deja las coordenadas vacías para que el GPS sugiera el departamento", () => {
    expect(sql).toContain("null, null");
    expect(sql).not.toMatch(/lat double precision not null/);
  });
});
