import { describe, expect, it } from "vitest";
import { changePollOptionMode } from "./poll-options";

describe("opciones de encuesta conservadas al cambiar tipo", () => {
  it("recupera la lista completa y las etiquetas binarias editadas por separado", () => {
    const original = ["Colectivos", "Plazas", "Salud", "Educación", "Veredas"];
    const binary = changePollOptionMode(
      "single",
      "binary",
      original,
      [],
      [],
      ["Sí", "No"],
    );
    expect(binary.options).toEqual(["Colectivos", "Plazas"]);
    const list = changePollOptionMode(
      "binary",
      "multiple",
      ["Avanzar", "Revisar"],
      binary.listOptions,
      binary.binaryOptions,
      ["Sí", "No"],
    );
    expect(list.options).toEqual(original);
    const back = changePollOptionMode(
      "multiple",
      "binary",
      [...list.options, "Ambiente"],
      list.listOptions,
      list.binaryOptions,
      ["Sí", "No"],
    );
    expect(back.options).toEqual(["Avanzar", "Revisar"]);
    expect(back.listOptions).toEqual([...original, "Ambiente"]);
    expect(original).toHaveLength(5);
  });
  it("no mete las sugerencias binarias en una lista originalmente vacía", () => {
    const binary = changePollOptionMode(
      "single",
      "binary",
      ["", "", ""],
      [],
      [],
      ["Sí", "No"],
    );
    expect(binary.options).toEqual(["Sí", "No"]);
    expect(
      changePollOptionMode(
        "binary",
        "single",
        binary.options,
        binary.listOptions,
        binary.binaryOptions,
        ["Sí", "No"],
      ).options,
    ).toEqual(["", "", ""]);
  });
  it("conserva etiquetas de una binaria recibida por POST aunque no exista respaldo local", () => {
    expect(
      changePollOptionMode(
        "binary",
        "single",
        ["Avanzar", "Revisar"],
        [],
        [],
        ["Sí", "No"],
      ).options,
    ).toEqual(["Avanzar", "Revisar", ""]);
  });
});
