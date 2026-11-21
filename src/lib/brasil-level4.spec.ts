import { describe, expect, it } from "vitest";
import {
  STATES,
  buildBrasilLevel4Rows,
  renderBrasilDraftSql,
} from "../../scripts/brasil-level4-lib.mjs";

// Filas mínimas con los campos que el generador toma de la API de
// localidades del IBGE.
const municipio = (
  id: number,
  nome: string,
  ufId: number,
  ufSigla: string,
  ufNome: string,
) => ({ id, nome, ufId, ufSigla, ufNome });

describe("STATES", () => {
  it("cubre las 26 UF con municipios, con el slug que ya existe en la base", () => {
    expect(STATES.size).toBe(26);
    expect(STATES.has(53)).toBe(false);
    for (const state of STATES.values()) {
      expect(state.slug).toMatch(/^brasil-[a-z-]+$/);
      expect(state.sigla).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("apunta a los slugs de 0016 tal como están, con sus errores", () => {
    expect(STATES.get(33)?.slug).toBe("brasil-rio-de-jeneiro");
    expect(STATES.get(24)?.slug).toBe("brasil-rio-granda-do-norte");
  });
});

describe("buildBrasilLevel4Rows", () => {
  it("cuelga cada municipio de su estado con la sigla en el slug, sin coordenadas", () => {
    const [row] = buildBrasilLevel4Rows([
      municipio(3303302, "Niterói", 33, "RJ", "Rio de Janeiro"),
    ]);

    expect(row).toEqual({
      slug: "brasil-rj-niteroi",
      name: "Niterói",
      parentSlug: "brasil-rio-de-jeneiro",
      path: "earth.south-america.brasil.brasil-rio-de-jeneiro.brasil-rj-niteroi",
      description: "Municipio del estado de Rio de Janeiro",
      code: "3303302",
    });
  });

  it("deja afuera Brasília, que es el Distrito Federal", () => {
    const rows = buildBrasilLevel4Rows([
      municipio(5300108, "Brasília", 53, "DF", "Distrito Federal"),
      municipio(3550308, "São Paulo", 35, "SP", "São Paulo"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual(["brasil-sp-sao-paulo"]);
  });

  it("deja afuera Fernando de Noronha, distrito estadual sin prefeitura", () => {
    const rows = buildBrasilLevel4Rows([
      municipio(2605459, "Fernando de Noronha", 26, "PE", "Pernambuco"),
      municipio(2611606, "Recife", 26, "PE", "Pernambuco"),
    ]);

    expect(rows.map((row) => row.slug)).toEqual(["brasil-pe-recife"]);
  });

  it("distingue homónimos de distintos estados por la sigla", () => {
    const rows = buildBrasilLevel4Rows([
      municipio(2910800, "Feira de Santana", 29, "BA", "Bahia"),
      municipio(3115300, "Cachoeira", 31, "MG", "Minas Gerais"),
      municipio(2905206, "Cachoeira", 29, "BA", "Bahia"),
    ]);

    expect(rows.map((row) => row.slug).sort()).toEqual([
      "brasil-ba-cachoeira",
      "brasil-ba-feira-de-santana",
      "brasil-mg-cachoeira",
    ]);
  });

  it("falla ante una UF desconocida, una que no coincide o un slug repetido", () => {
    expect(() =>
      buildBrasilLevel4Rows([municipio(9900001, "X", 99, "XX", "Nueva")]),
    ).toThrow(/UF desconocida/);
    expect(() =>
      buildBrasilLevel4Rows([municipio(3550308, "São Paulo", 35, "RJ", "São Paulo")]),
    ).toThrow(/no coincide/);
    expect(() =>
      buildBrasilLevel4Rows([
        municipio(3550308, "São Paulo", 35, "SP", "São Paulo"),
        municipio(3599999, "Sao Paulo", 35, "SP", "São Paulo"),
      ]),
    ).toThrow(/Slug repetido/);
  });
});

describe("renderBrasilDraftSql", () => {
  const rows = buildBrasilLevel4Rows([
    municipio(4106902, "Curitiba", 41, "PR", "Paraná"),
  ]);
  const sql = renderBrasilDraftSql(rows, { fetchedAt: "2026-11-20" });

  it("cita la fuente, la fecha y la decisión", () => {
    expect(sql).toContain(
      "Agorbis · 0085 · Municipios de Brasil como nivel 4 (D137)",
    );
    expect(sql).toContain("scripts/build-brasil-level4-draft.mjs");
    expect(sql).toContain("IBGE");
    expect(sql).toContain("2026-11-20");
  });

  it("falla cerrado con los códigos de 0085 y sin coordenadas", () => {
    expect(sql).toContain("AGORBIS_0085_MISSING_STATE");
    expect(sql).toContain("path like 'earth.south-america.brasil.%'");
    expect(sql).toContain("'Municipio del estado de Paraná', null, null)");
  });
});
