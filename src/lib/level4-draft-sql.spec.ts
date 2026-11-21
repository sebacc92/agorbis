import { describe, expect, it } from "vitest";
import { renderLevel4DraftSql } from "../../scripts/level4-draft-sql.mjs";

const rows = [
  {
    slug: "pais-norte-o-higgins",
    name: "O'Higgins",
    parentSlug: "pais-norte",
    description: "Comuna de Norte",
  },
];

const options = {
  number: "0099",
  title: "Comunas de País como nivel 4 (D999)",
  generator: "scripts/build-pais-level4-draft.mjs",
  countryPath: "earth.somewhere.pais",
  parentLabel: "REGION",
  header: ["Fuente: un catálogo oficial.", "Otra línea."],
};

describe("renderLevel4DraftSql", () => {
  const sql = renderLevel4DraftSql(rows, options);

  it("se presenta como borrador numerado con su generador y sus notas", () => {
    expect(sql).toContain("Agorbis · 0099 · Comunas de País como nivel 4");
    expect(sql).toContain("BORRADOR, NO APLICAR");
    expect(sql).toContain("scripts/build-pais-level4-draft.mjs");
    expect(sql).toContain("-- Fuente: un catálogo oficial.\n-- Otra línea.");
  });

  it("escapa los apóstrofos", () => {
    expect(sql).toContain("'O''Higgins'");
  });

  it("corre en una transacción y falla cerrado con códigos propios", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toContain("set local search_path = ''");
    expect(sql).toContain("AGORBIS_0099_MISSING_REGION");
    expect(sql).toContain("AGORBIS_0099_SLUG_TAKEN");
    expect(sql).toContain("AGORBIS_0099_UNEXPECTED_TOTALS");
    expect(sql).toContain("p.path = 'earth.somewhere.pais.' || p.slug");
  });

  it("verifica que el país quede con exactamente las filas cargadas", () => {
    expect(sql).toContain("v_expected_level4 constant int := 1;");
    expect(sql).toContain("path like 'earth.somewhere.pais.%'");
  });

  it("borra su tabla temporal para poder ir con otro borrador en la misma transacción", () => {
    expect(sql).toMatch(
      /drop table pg_temp\.level4_rows;\n\ncommit;$/m,
    );
  });

  it("deja las coordenadas vacías cuando la fila no las trae", () => {
    expect(sql).toContain("'Comuna de Norte', null, null)");
    expect(sql).toContain("i.description, i.lat, i.lng");
    expect(sql).not.toMatch(/lat double precision not null/);
  });

  it("escribe las coordenadas de la fila que las trae", () => {
    const withPoint = renderLevel4DraftSql(
      [{ ...rows[0], lat: -25.286, lng: -57.6 }],
      options,
    );

    expect(withPoint).toContain("'Comuna de Norte', -25.286, -57.6)");
  });

  it("rechaza coordenadas fuera de rango o a medias", () => {
    expect(() =>
      renderLevel4DraftSql([{ ...rows[0], lat: -95, lng: 0 }], options),
    ).toThrow(/Coordenadas/);
    expect(() =>
      renderLevel4DraftSql([{ ...rows[0], lat: -25 }], options),
    ).toThrow(/Coordenadas/);
  });

  it("rechaza opciones que romperían el SQL", () => {
    expect(() =>
      renderLevel4DraftSql(rows, { ...options, number: "99" }),
    ).toThrow(/número/);
    expect(() =>
      renderLevel4DraftSql(rows, { ...options, parentLabel: "región" }),
    ).toThrow(/parentLabel/);
    expect(() => renderLevel4DraftSql([], options)).toThrow(/filas/);
  });
});
