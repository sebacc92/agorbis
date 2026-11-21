import { describe, expect, it } from "vitest";
import { publicationEntryHref } from "./publication-entry";

const base = {
  communitySlug: "ba-25-de-mayo",
  isAuthenticated: true,
  hasResidence: true,
  isMember: true,
} as const;

describe("publicationEntryHref", () => {
  it("quien vive en la comunidad va directo al formulario de cada tipo", () => {
    expect(publicationEntryHref({ ...base, type: "poll" })).toBe(
      "/c/ba-25-de-mayo/encuestas/nueva",
    );
    expect(publicationEntryHref({ ...base, type: "debate" })).toBe(
      "/c/ba-25-de-mayo/debates/nuevo",
    );
    expect(publicationEntryHref({ ...base, type: "claim" })).toBe(
      "/c/ba-25-de-mayo/reclamos/nuevo",
    );
    expect(publicationEntryHref({ ...base, type: "project" })).toBe(
      "/c/ba-25-de-mayo/proyectos/nuevo",
    );
  });

  it("sin sesión va a ingresar con el formulario como destino", () => {
    expect(
      publicationEntryHref({ ...base, type: "poll", isAuthenticated: false }),
    ).toBe("/ingresar?next=%2Fc%2Fba-25-de-mayo%2Fencuestas%2Fnueva");
  });

  it("con sesión y sin residencia va a elegir residencia, con el formulario como destino", () => {
    expect(
      publicationEntryHref({
        ...base,
        type: "claim",
        hasResidence: false,
        isMember: false,
      }),
    ).toBe("/onboarding?next=%2Fc%2Fba-25-de-mayo%2Freclamos%2Fnuevo");
  });

  it("con residencia en otro lado va al selector, que conserva tipo y comunidad", () => {
    expect(
      publicationEntryHref({ ...base, type: "debate", isMember: false }),
    ).toBe("/publicar?comunidad=ba-25-de-mayo&tipo=debate");
  });

  it("sin sesión manda la sesión antes que la residencia o la pertenencia", () => {
    expect(
      publicationEntryHref({
        ...base,
        type: "project",
        isAuthenticated: false,
        hasResidence: false,
        isMember: false,
      }),
    ).toMatch(/^\/ingresar\?next=/);
  });
});
