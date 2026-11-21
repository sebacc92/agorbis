import { describe, expect, it } from "vitest";
import { postedText, postedTexts } from "./posted-fields";

describe("campos conservados del envío nativo", () => {
  it("conserva texto vacío y notación local sin confundirlos con un valor ausente", () => {
    const submitted = new FormData();
    submitted.set("summary", "");
    submitted.set("budget_amount", "2.500,50");
    expect(postedText(submitted, "summary", "Resumen inicial")).toBe("");
    expect(postedText(submitted, "budget_amount")).toBe("2.500,50");
    expect(postedText(submitted, "currency", "ARS")).toBe("ARS");
  });

  it("no convierte un archivo enviado en el texto de un campo", () => {
    const submitted = new FormData();
    submitted.set("title", new File(["contenido"], "titulo.txt"));
    expect(postedText(submitted, "title", "Título inicial")).toBe(
      "Título inicial",
    );
  });

  it("recupera todas las opciones, incluso las vacías y repetidas que causaron el rechazo", () => {
    const submitted = new FormData();
    for (const value of ["Centro", "Centro", ""])
      submitted.append("options[]", value);
    expect(postedTexts(submitted, "options[]", ["", ""])).toEqual([
      "Centro",
      "Centro",
      "",
    ]);
  });

  it("el valor inicial de las opciones no se comparte con el estado editable", () => {
    const initial = ["", ""];
    const restored = postedTexts(undefined, "options[]", initial);
    restored[0] = "Centro";
    expect(initial).toEqual(["", ""]);
  });
});
