import { describe, expect, it } from "vitest";
import {
  communitySections,
  communityTools,
  compareViews,
  sectionIdFor,
} from "./community-sections";

const ids = (sections: { id: string }[]) => sections.map((s) => s.id);

describe("communitySections", () => {
  it("deja a la vista sólo las cinco secciones de participación", () => {
    const { primary } = communitySections({
      level: 4,
      childCount: 3,
      hasBudget: true,
    });
    expect(ids([...primary])).toEqual([
      "info",
      "encuestas",
      "debates",
      "reclamos",
      "proyectos",
    ]);
  });

  it("pone el resto bajo Más, con presupuesto sólo si hay partida (D59)", () => {
    expect(
      ids(communitySections({ level: 4, childCount: 3, hasBudget: true }).more),
    ).toEqual(["miembros", "presupuesto", "sub", "comparar"]);
    expect(
      ids(
        communitySections({ level: 4, childCount: 3, hasBudget: false }).more,
      ),
    ).toEqual(["miembros", "sub", "comparar"]);
    // Sin poder consultar la partida, se ofrece como antes.
    expect(
      ids(communitySections({ level: 4, childCount: 3, hasBudget: null }).more),
    ).toContain("presupuesto");
  });

  it("Comparar lleva al contraste si hay dos hijas y si no, a sus pares", () => {
    const compare = (level: number, childCount: number | null) =>
      communitySections({ level, childCount, hasBudget: false }).more.find(
        (section) => section.id === "comparar",
      )?.segment;
    expect(compare(4, 2)).toBe("contraste");
    expect(compare(4, null)).toBe("contraste");
    expect(compare(5, 0)).toBe("comparativa");
    expect(compare(5, 1)).toBe("comparativa");
    // La Tierra sin dos continentes no tendría con qué compararse.
    expect(compare(0, 1)).toBeUndefined();
    expect(compare(0, 6)).toBe("contraste");
  });
});

describe("compareViews", () => {
  it("ofrece las dos formas sólo cuando las dos tienen sentido", () => {
    expect(
      compareViews({ level: 4, childCount: 5 }).map((v) => v.segment),
    ).toEqual(["contraste", "comparativa"]);
    expect(
      compareViews({ level: 0, childCount: 5 }).map((v) => v.segment),
    ).toEqual(["contraste"]);
    expect(
      compareViews({ level: 5, childCount: 0 }).map((v) => v.segment),
    ).toEqual(["comparativa"]);
  });
});

describe("sectionIdFor", () => {
  it("marca Comparar en sus dos páginas y no confunde herramientas con secciones", () => {
    expect(sectionIdFor("")).toBe("info");
    expect(sectionIdFor("reclamos")).toBe("reclamos");
    expect(sectionIdFor("miembros")).toBe("miembros");
    expect(sectionIdFor("contraste")).toBe("comparar");
    expect(sectionIdFor("comparativa")).toBe("comparar");
    expect(sectionIdFor("mapa")).toBeNull();
    expect(sectionIdFor("victorias")).toBeNull();
  });
});

describe("communityTools", () => {
  it("ofrece el mapa barrial y la rendición municipal de ciudad para abajo", () => {
    const segments = (level: number) =>
      communityTools(level).map((tool) => tool.segment);
    expect(segments(4)).toEqual([
      "mapa",
      "victorias",
      "rendicion",
      "instituciones",
    ]);
    expect(segments(5)).toEqual(segments(4));
    expect(segments(3)).toEqual(["victorias", "instituciones"]);
    expect(segments(0)).toEqual(["victorias", "instituciones"]);
  });
});
