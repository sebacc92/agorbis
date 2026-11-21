import { describe, expect, it } from "vitest";
import { pageCount, pageHref, readPage } from "./pagination";

describe("paginacion numerada", () => {
  it("ignora paginas malformadas y limita valores extremos", () => {
    expect(readPage(new URLSearchParams("pagina=-2"))).toBe(1);
    expect(readPage(new URLSearchParams("pagina=2.5"))).toBe(1);
    expect(readPage(new URLSearchParams("pagina=abc"))).toBe(1);
    expect(readPage(new URLSearchParams("pagina=999999"), "pagina", 500)).toBe(
      500,
    );
  });

  it("calcula al menos una pagina y redondea hacia arriba", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });

  it("cambia una cola sin perder filtros ni la pagina de la otra", () => {
    const current = new URLSearchParams(
      "estado=reviewing&pagina-organizaciones=3",
    );
    expect(pageHref(current, "pagina-comunidades", 2)).toBe(
      "?estado=reviewing&pagina-organizaciones=3&pagina-comunidades=2",
    );
    expect(pageHref(current, "pagina-organizaciones", 1)).toBe(
      "?estado=reviewing",
    );
  });
});
