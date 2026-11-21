import { describe, expect, it } from "vitest";
import { USERNAME_PATTERN, suggestUsername } from "./username-suggestion";

describe("suggestUsername", () => {
  it("convierte el nombre para mostrar en un usuario válido", () => {
    expect(suggestUsername("Sofía Rearte")).toBe("sofia_rearte");
    expect(suggestUsername("  Ñandú   Pérez-Gómez ")).toBe("nandu_perez_gomez");
    expect(suggestUsername("Ana.María 2026")).toBe("ana_maria_2026");
  });

  it("recorta a 20 caracteres sin partir palabras ni dejar un guión bajo", () => {
    const suggestion = suggestUsername("Maximiliano Fernández Castillo");
    expect(suggestion).toBe("maximiliano");
    expect(suggestUsername("Sebastian Cardoso Castillo")).toBe(
      "sebastian_cardoso",
    );
    // La palabra que no entra se descarta entera, no queda "_l".
    expect(suggestUsername("Ana Maria Gonzalez Lopez")).toBe(
      "ana_maria_gonzalez",
    );
    // Una sola palabra larga se recorta: no hay otra forma de que entre.
    expect(suggestUsername("Supercalifragilisticoexpialidoso")).toBe(
      "supercalifragilistic",
    );
    expect(suggestUsername("abcdefghijklmnopqrs tuv")).toBe(
      "abcdefghijklmnopqrs",
    );
    expect(USERNAME_PATTERN.test(suggestion)).toBe(true);
  });

  it("no sugiere nada si no alcanza para un usuario válido", () => {
    expect(suggestUsername("")).toBe("");
    expect(suggestUsername("Al")).toBe("");
    expect(suggestUsername("💬 ¡!")).toBe("");
    expect(suggestUsername("李小龍")).toBe("");
  });
});
