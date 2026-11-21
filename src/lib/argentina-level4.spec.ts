import { describe, expect, it } from "vitest";
import {
  LOCALITY_MOVES,
  buildLevel4Rows,
  renderMigrationSql,
  slugify,
} from "../../scripts/argentina-level4-lib.mjs";

// Filas mínimas con la forma que devuelve la API Georef.
const municipio = (id: string, nombre: string, provinciaId: string) => ({
  id,
  nombre,
  provincia: { id: provinciaId },
  centroide: { lat: -31.4, lon: -64.18 },
});

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("quita tildes, puntos y apóstrofos sin dejar guiones de más", () => {
    expect(slugify("Capitán General Bernardo O'Higgins")).toBe(
      "capitan-general-bernardo-o-higgins",
    );
    expect(slugify("Dr. Atilio Oscar Viglione")).toBe(
      "dr-atilio-oscar-viglione",
    );
    expect(slugify("Villa Sabá Z. Hernández")).toBe("villa-saba-z-hernandez");
  });
});

describe("buildLevel4Rows", () => {
  it("deja afuera Buenos Aires, que ya tiene sus 135 partidos", () => {
    const rows = buildLevel4Rows({
      municipios: [
        municipio("060007", "Adolfo Alsina", "06"),
        municipio("140001", "Villa Carlos Paz", "14"),
      ],
      departamentos: [],
      departmentOf: new Map(),
    });

    expect(rows.map((row) => row.slug)).toEqual(["cordoba-villa-carlos-paz"]);
  });

  it("usa departamentos en Santa Cruz y Santiago del Estero, donde Georef no trae municipios", () => {
    const rows = buildLevel4Rows({
      municipios: [municipio("780001", "Municipio suelto", "78")],
      departamentos: [
        municipio("78014", "Deseado", "78"),
        municipio("86049", "Capital", "86"),
      ],
      departmentOf: new Map(),
    });

    expect(rows.map((row) => [row.slug, row.description])).toEqual([
      ["santa-cruz-deseado", "Departamento de Santa Cruz"],
      ["santiago-del-estero-capital", "Departamento de Santiago del Estero"],
    ]);
  });

  it("cuelga cada fila de su provincia con un path y un slug válidos", () => {
    const [row] = buildLevel4Rows({
      municipios: [municipio("020007", "Comuna 1", "02")],
      departamentos: [],
      departmentOf: new Map(),
    });

    expect(row).toMatchObject({
      slug: "caba-comuna-1",
      name: "Comuna 1",
      parentSlug: "caba",
      path: "earth.south-america.argentina.caba.caba-comuna-1",
      description: "Comuna de la Ciudad Autónoma de Buenos Aires",
      lat: -31.4,
      lng: -64.18,
    });
    expect(row.slug).toMatch(SLUG_FORMAT);
  });

  it("distingue homónimos de una provincia con su departamento", () => {
    const rows = buildLevel4Rows({
      municipios: [
        municipio("820001", "San Bernardo", "82"),
        municipio("820002", "San Bernardo", "82"),
        municipio("820003", "Rosario", "82"),
      ],
      departamentos: [],
      departmentOf: new Map([
        ["820001", "Nueve de Julio"],
        ["820002", "San Justo"],
      ]),
    });

    expect(rows.map((row) => [row.slug, row.name])).toEqual([
      ["santa-fe-rosario", "Rosario"],
      ["santa-fe-san-bernardo-nueve-de-julio", "San Bernardo (Nueve de Julio)"],
      ["santa-fe-san-bernardo-san-justo", "San Bernardo (San Justo)"],
    ]);
  });

  it("falla si a un homónimo le falta el departamento", () => {
    expect(() =>
      buildLevel4Rows({
        municipios: [
          municipio("820001", "San Bernardo", "82"),
          municipio("820002", "San Bernardo", "82"),
        ],
        departamentos: [],
        departmentOf: new Map([["820001", "Nueve de Julio"]]),
      }),
    ).toThrow(/820002/);
  });

  it("falla si dos homónimos caen en el mismo departamento", () => {
    expect(() =>
      buildLevel4Rows({
        municipios: [
          municipio("820001", "San Bernardo", "82"),
          municipio("820002", "San Bernardo", "82"),
        ],
        departamentos: [],
        departmentOf: new Map([
          ["820001", "Nueve de Julio"],
          ["820002", "Nueve de Julio"],
        ]),
      }),
    ).toThrow(/repetido/);
  });

  it("falla ante una provincia desconocida o un centroide inválido", () => {
    expect(() =>
      buildLevel4Rows({
        municipios: [municipio("990001", "Ninguna", "99")],
        departamentos: [],
        departmentOf: new Map(),
      }),
    ).toThrow(/99/);
    expect(() =>
      buildLevel4Rows({
        municipios: [
          { ...municipio("140001", "Sin centro", "14"), centroide: {} },
        ],
        departamentos: [],
        departmentOf: new Map(),
      }),
    ).toThrow(/140001/);
  });
});

describe("renderMigrationSql", () => {
  const rows = buildLevel4Rows({
    municipios: [
      municipio("220001", "Capitán General Bernardo O'Higgins", "22"),
      municipio("140001", "Villa Carlos Paz", "14"),
    ],
    departamentos: [],
    departmentOf: new Map(),
  });
  const sql = renderMigrationSql(rows, { fetchedAt: "2026-11-20" });

  it("dice qué script la genera y cita la fuente con su fecha", () => {
    expect(sql).not.toMatch(/BORRADOR/);
    expect(sql).toContain("scripts/build-argentina-level4-migration.mjs");
    expect(sql).toContain("API Georef");
    expect(sql).toContain("2026-11-20");
  });

  it("escapa los apóstrofos de los nombres", () => {
    expect(sql).toContain("'Capitán General Bernardo O''Higgins'");
  });

  it("corre en una transacción y verifica el total esperado", () => {
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n$/);
    // 135 partidos bonaerenses + las filas nuevas.
    expect(sql).toContain(`v_expected_level4 constant int := ${135 + 2};`);
  });

  it("mueve cada localidad bonaerense bajo su partido", () => {
    expect(LOCALITY_MOVES).toEqual([
      { slug: "mar-del-plata", parentSlug: "ba-general-pueyrredon" },
      { slug: "miramar", parentSlug: "ba-general-alvarado" },
      { slug: "mar-del-sud", parentSlug: "ba-general-alvarado" },
      { slug: "mechongue", parentSlug: "ba-general-alvarado" },
      { slug: "otamendi", parentSlug: "ba-general-alvarado" },
    ]);
    for (const move of LOCALITY_MOVES) {
      expect(sql).toContain(`('${move.slug}', '${move.parentSlug}')`);
    }
  });
});
