import { describe, expect, it } from "vitest";
import {
  REGIONS,
  buildChileLevel4Rows,
  parseDbf,
  renderChileDraftSql,
} from "../../scripts/chile-level4-lib.mjs";

// Filas mínimas con los atributos de la capa COMUNAS de la DPA 2023.
const comuna = (CUT_REG: string, CUT_COM: string, COMUNA: string) => ({
  CUT_REG,
  CUT_COM,
  COMUNA,
});

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Arma un .dbf (dBase III) en memoria con campos de texto. */
function dbf(fields: [string, number][], records: string[][]): Uint8Array {
  const headerLength = 32 + 32 * fields.length + 1;
  const recordLength = 1 + fields.reduce((sum, [, size]) => sum + size, 0);
  const bytes = new Uint8Array(
    headerLength + recordLength * records.length + 1,
  );
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x03;
  view.setUint32(4, records.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  const encoder = new TextEncoder();
  fields.forEach(([name, size], index) => {
    const at = 32 + 32 * index;
    bytes.set(encoder.encode(name), at);
    bytes[at + 11] = "C".charCodeAt(0);
    bytes[at + 16] = size;
  });
  bytes[headerLength - 1] = 0x0d;
  records.forEach((record, row) => {
    let at = headerLength + recordLength * row;
    bytes[at] = 0x20;
    at += 1;
    fields.forEach(([, size], column) => {
      const value = encoder.encode(record[column] ?? "");
      bytes.fill(0x20, at, at + size);
      bytes.set(value.slice(0, size), at);
      at += size;
    });
  });
  bytes[bytes.length - 1] = 0x1a;
  return bytes;
}

describe("REGIONS", () => {
  it("cubre las 16 regiones con el slug que ya existe en la base", () => {
    expect(REGIONS.size).toBe(16);
    for (const region of REGIONS.values()) {
      expect(region.slug).toMatch(/^chile-region-[a-z-]+$/);
    }
  });
});

describe("parseDbf", () => {
  it("lee campos de texto en UTF-8 y recorta el relleno", () => {
    const bytes = dbf(
      [
        ["CUT_COM", 10],
        ["COMUNA", 20],
      ],
      [
        ["13101", "Santiago"],
        ["06107", "Ñuñoa O'Higgins"],
      ],
    );

    expect(parseDbf(bytes)).toEqual([
      { CUT_COM: "13101", COMUNA: "Santiago" },
      { CUT_COM: "06107", COMUNA: "Ñuñoa O'Higgins" },
    ]);
  });

  it("salta los registros marcados como borrados", () => {
    const bytes = dbf([["COMUNA", 10]], [["Viva"], ["Borrada"]]);
    const recordLength = 11;
    const headerLength = 32 + 32 + 1;
    bytes[headerLength + recordLength] = 0x2a;

    expect(parseDbf(bytes)).toEqual([{ COMUNA: "Viva" }]);
  });

  it("falla si no es un dBase", () => {
    expect(() => parseDbf(new Uint8Array([0x50, 0x4b, 3, 4]))).toThrow(
      /dBase/,
    );
  });
});

describe("buildChileLevel4Rows", () => {
  it("cuelga cada comuna de su región con un slug corto y un path válido", () => {
    const [row] = buildChileLevel4Rows([comuna("13", "13114", "Las Condes")]);

    expect(row).toEqual({
      slug: "chile-las-condes",
      name: "Las Condes",
      parentSlug: "chile-region-metropolitana-de-santiago",
      path: "earth.south-america.chile.chile-region-metropolitana-de-santiago.chile-las-condes",
      description: "Comuna de la Región Metropolitana de Santiago",
      code: "13114",
    });
    expect(row.slug).toMatch(SLUG_FORMAT);
  });

  it("conserva el nombre oficial con tildes y apóstrofos", () => {
    const rows = buildChileLevel4Rows([
      comuna("11", "11302", "O'Higgins"),
      comuna("05", "05201", "Isla de Pascua"),
    ]);

    // Ordenadas por path: la región de Aysén (11) va antes que Valparaíso (05).
    expect(rows.map((row) => [row.slug, row.name])).toEqual([
      ["chile-o-higgins", "O'Higgins"],
      ["chile-isla-de-pascua", "Isla de Pascua"],
    ]);
  });

  it("falla ante una región desconocida, un nombre vacío o un código repetido", () => {
    expect(() => buildChileLevel4Rows([comuna("17", "17101", "X")])).toThrow(
      /Región desconocida/,
    );
    expect(() => buildChileLevel4Rows([comuna("13", "13101", " ")])).toThrow(
      /sin nombre/,
    );
    expect(() =>
      buildChileLevel4Rows([
        comuna("13", "13101", "Santiago"),
        comuna("13", "13101", "Santiago Centro"),
      ]),
    ).toThrow(/Código repetido/);
  });

  it("falla si dos comunas dan el mismo slug, porque el slug no lleva región", () => {
    expect(() =>
      buildChileLevel4Rows([
        comuna("08", "08101", "Concepción"),
        comuna("13", "13999", "Concepcion"),
      ]),
    ).toThrow(/Slug repetido/);
  });
});

describe("renderChileDraftSql", () => {
  const rows = buildChileLevel4Rows([comuna("13", "13101", "Santiago")]);
  const sql = renderChileDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, su fecha y la decisión", () => {
    expect(sql).toContain("Agorbis · 0078 · Comunas de Chile como nivel 4 (D130)");
    expect(sql).toContain("scripts/build-chile-level4-draft.mjs");
    expect(sql).toContain("DPA 2023");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0078 y sin coordenadas", () => {
    expect(sql).toContain("AGORBIS_0078_MISSING_REGION");
    expect(sql).toContain("AGORBIS_0078_SLUG_TAKEN");
    expect(sql).toContain("path like 'earth.south-america.chile.%'");
    expect(sql).toContain("'Comuna de la Región Metropolitana de Santiago', null, null)");
  });
});
