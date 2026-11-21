import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { WorldMap, type WorldMapCountry } from "./WorldMap";

const countries: WorldMapCountry[] = [
  {
    iso2: "AR",
    slug: "argentina",
    name: "Argentina",
    flag: "🇦🇷",
    continentName: "América del Sur",
    memberCount: 8,
    description: "Comunidad argentina",
  },
  {
    iso2: "DZ",
    slug: "argelia",
    name: "Argelia",
    flag: "🇩🇿",
    continentName: "África",
    memberCount: 0,
    description: null,
  },
];

describe("WorldMap", () => {
  it("ofrece una búsqueda accesible como alternativa al SVG", async () => {
    const { document } = await renderWithLocale(
      <WorldMap countries={countries} />,
    );
    const input = document.querySelector(
      'input[name="world-map-country"]',
    );

    expect(input?.getAttribute("role")).toBe("combobox");
    expect(input?.getAttribute("aria-expanded")).toBe("false");
    expect(input?.getAttribute("aria-autocomplete")).toBe("list");
    expect(document.querySelector(`label[for="${input?.id}"]`)?.textContent).toContain(
      "Buscar un país",
    );
    expect(document.querySelector("select")).toBeFalsy();
  });

  it("no reserva un panel de detalle vacío", async () => {
    const { document } = await renderWithLocale(
      <WorldMap countries={countries} />,
    );
    expect(document.querySelector("aside")).toBeFalsy();
    expect(document.body.textContent).not.toContain(
      "Seleccioná un país para ver sus detalles",
    );
  });

  it("renderiza controles con tamaño táctil real", async () => {
    const { document } = await renderWithLocale(
      <WorldMap countries={countries} />,
    );
    const zoomIn = document.querySelector('button[aria-label="Acercar mapa"]');
    const fullscreen = document.querySelector(
      'button[aria-label="Ver en pantalla completa"]',
    );

    expect(zoomIn?.getAttribute("style")).toContain("height:2.75rem");
    expect(fullscreen?.getAttribute("style")).toContain("width:2.75rem");
  });
});
