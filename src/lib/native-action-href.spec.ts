import { describe, expect, it } from "vitest";
import { nativeActionHref } from "./native-action-href";

describe("destino nativo de una acción con filtros", () => {
  it("conserva búsqueda, foto y cursor con un único separador de query", () => {
    expect(
      nativeActionHref(
        "/c/barrio/miembros/?q=Sof%C3%ADa&foto=1&despues=vecina",
        "?qaction=visibility",
      ),
    ).toBe(
      "/c/barrio/miembros/?q=Sof%C3%ADa&foto=1&despues=vecina&qaction=visibility",
    );
  });

  it("reemplaza una acción previa y retira el fragmento tras un POST nativo", () => {
    const href = nativeActionHref(
      "/c/barrio/miembros/?q=Centro&qaction=previous#miembros",
      "?qaction=visibility",
    );
    expect(href).toBe("/c/barrio/miembros/?q=Centro&qaction=visibility");
    expect(
      new URL(href, "https://agorbis.test").searchParams.getAll("qaction"),
    ).toEqual(["visibility"]);
  });

  it("añade la acción cuando el documento no tiene filtros", () => {
    expect(nativeActionHref("/c/barrio/miembros/", "?qaction=visibility")).toBe(
      "/c/barrio/miembros/?qaction=visibility",
    );
  });
});
