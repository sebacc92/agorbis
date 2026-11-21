import { describe, expect, it } from "vitest";
import {
  ENTITIES,
  buildMexicoLevel4Rows,
  renderMexicoDraftSql,
} from "../../scripts/mexico-level4-lib.mjs";

// Filas mínimas con los campos del catálogo geoestadístico del INEGI.
const municipio = (cve_ent: string, cve_mun: string, nomgeo: string) => ({
  cvegeo: `${cve_ent}${cve_mun}`,
  cve_ent,
  cve_mun,
  nomgeo,
});
const entityNames = new Map([
  ["09", "Ciudad de México"],
  ["14", "Jalisco"],
  ["20", "Oaxaca"],
  ["30", "Veracruz de Ignacio de la Llave"],
  ["11", "Guanajuato"],
]);

describe("ENTITIES", () => {
  it("cubre las 32 entidades con el slug que ya existe en la base", () => {
    expect(ENTITIES.size).toBe(32);
    expect(ENTITIES.get("09")?.slug).toBe("mexico-mexico-city");
    expect(ENTITIES.get("15")?.slug).toBe("mexico-mexico");
    for (const entity of ENTITIES.values()) {
      expect(entity.slug).toMatch(/^mexico-[a-z-]+$/);
    }
  });
});

describe("buildMexicoLevel4Rows", () => {
  it("cuelga cada municipio de su entidad con la entidad en el slug, sin coordenadas", () => {
    const [row] = buildMexicoLevel4Rows(
      [municipio("14", "039", "Guadalajara")],
      entityNames,
    );

    expect(row).toEqual({
      slug: "mexico-jalisco-guadalajara",
      name: "Guadalajara",
      parentSlug: "mexico-jalisco",
      path: "earth.north-america.mexico.mexico-jalisco.mexico-jalisco-guadalajara",
      description: "Municipio del estado de Jalisco",
      code: "14039",
    });
  });

  it("llama alcaldías a las de la Ciudad de México", () => {
    const [row] = buildMexicoLevel4Rows(
      [municipio("09", "003", "Coyoacán")],
      entityNames,
    );

    expect([row.slug, row.description]).toEqual([
      "mexico-mexico-city-coyoacan",
      "Alcaldía de la Ciudad de México",
    ]);
  });

  it("distingue con su clave a los homónimos dentro de una entidad", () => {
    const rows = buildMexicoLevel4Rows(
      [
        municipio("20", "208", "San Juan Mixtepec"),
        municipio("20", "209", "San Juan Mixtepec"),
        municipio("20", "067", "Oaxaca de Juárez"),
      ],
      entityNames,
    );

    expect(rows.map((row) => [row.slug, row.name])).toEqual([
      ["mexico-oaxaca-oaxaca-de-juarez", "Oaxaca de Juárez"],
      ["mexico-oaxaca-san-juan-mixtepec-20208", "San Juan Mixtepec (clave INEGI 20208)"],
      ["mexico-oaxaca-san-juan-mixtepec-20209", "San Juan Mixtepec (clave INEGI 20209)"],
    ]);
  });

  it("falla ante una entidad desconocida o con otro nombre", () => {
    expect(() =>
      buildMexicoLevel4Rows([municipio("33", "001", "X")], entityNames),
    ).toThrow(/Entidad desconocida/);
    expect(() =>
      buildMexicoLevel4Rows(
        [municipio("11", "015", "Guanajuato")],
        new Map([["11", "Jalisco"]]),
      ),
    ).toThrow(/no coincide/);
  });
});

describe("renderMexicoDraftSql", () => {
  const rows = buildMexicoLevel4Rows(
    [municipio("30", "087", "Xalapa")],
    entityNames,
  );
  const sql = renderMexicoDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, la fecha y la decisión", () => {
    expect(sql).toContain(
      "Agorbis · 0086 · Municipios y alcaldías de México como nivel 4 (D138)",
    );
    expect(sql).toContain("scripts/build-mexico-level4-draft.mjs");
    expect(sql).toContain("INEGI");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0086 y sin coordenadas", () => {
    expect(sql).toContain("AGORBIS_0086_MISSING_STATE");
    expect(sql).toContain("path like 'earth.north-america.mexico.%'");
    expect(sql).toContain("'Municipio del estado de Veracruz', null, null)");
  });
});
