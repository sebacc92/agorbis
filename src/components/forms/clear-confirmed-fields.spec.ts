import { describe, expect, it } from "vitest";
import { clearConfirmedFields } from "./clear-confirmed-fields";

describe("clearConfirmedFields", () => {
  it("limpia lo confirmado y conserva cada edición hecha después del envío", () => {
    const submitted = new FormData();
    submitted.set("title", "Fuente enviada");
    submitted.set("url", "https://example.com/enviada");
    submitted.set("publisher", "Medio enviado");
    const draft = {
      title: "Otra fuente en preparación",
      url: "https://example.com/enviada",
      publisher: "Medio enviado",
      otherForm: "Una respuesta que todavía no envié",
    };
    clearConfirmedFields(draft, submitted, ["title", "url", "publisher"]);
    expect(draft).toEqual({
      title: "Otra fuente en preparación",
      url: "",
      publisher: "",
      otherForm: "Una respuesta que todavía no envié",
    });
  });

  it("conserva selecciones y campos ausentes del POST nativo", () => {
    const submitted = new FormData();
    submitted.set("body", "Respuesta confirmada");
    submitted.set("organization_id", "organizacion");
    const draft = {
      body: "Respuesta confirmada",
      source_url: "https://example.com/nuevo",
      organization_id: "organizacion",
    };
    clearConfirmedFields(draft, submitted, ["body", "source_url"]);
    expect(draft).toEqual({
      body: "",
      source_url: "https://example.com/nuevo",
      organization_id: "organizacion",
    });
  });
});
