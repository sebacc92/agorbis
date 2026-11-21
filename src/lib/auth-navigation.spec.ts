import { describe, expect, it } from "vitest";
import {
  authEntryHref,
  onboardingPath,
  returnPathFor,
  signedInHome,
  withAuthNext,
} from "./auth-navigation";

describe("destino del acceso", () => {
  it("conserva query y fragmento sin confundirlos con los del paso intermedio", () => {
    const next = "/c/barrio/reclamos/nuevo?categoria=veredas&titulo=Una%20vereda#descripcion";
    const step = new URL(withAuthNext("/onboarding?paso=confirmar&c=barrio", next), "https://agorbis.com");
    expect(step.searchParams.get("next")).toBe(next);
    expect(step.searchParams.get("paso")).toBe("confirmar");
    expect(step.searchParams.get("c")).toBe("barrio");
    expect(step.hash).toBe("");
  });

  it.each([undefined, null, "", "https://evil.example", "//evil.example", "/\\evil.example"])("no propaga destinos externos o ausentes: %s", (next) => {
    expect(withAuthNext("/registro", next)).toBe("/registro");
    expect(onboardingPath(next)).toBe("/onboarding");
  });

  it("no anida el onboarding al cruzar el consentimiento", () => {
    const onboarding = onboardingPath("/c/barrio/reclamos/nuevo");
    expect(onboardingPath(onboarding)).toBe(onboarding);
    expect(onboardingPath("/onboarding")).toBe("/onboarding");
  });
});

describe("regreso después del acceso", () => {
  it("crear cuenta desde una página vuelve a esa página, sin la acción enviada", () => {
    const href = authEntryHref(
      "/registro",
      "https://agorbis.com/c/barrio/encuestas?estado=abiertas&qaction=abc",
    );
    const url = new URL(href, "https://agorbis.com");
    expect(url.pathname).toBe("/registro");
    expect(url.searchParams.get("next")).toBe("/c/barrio/encuestas?estado=abiertas");
  });

  it.each([
    "https://agorbis.com/",
    "https://agorbis.com/ingresar?next=%2Fc%2Fbarrio",
    "https://agorbis.com/registro",
    "https://agorbis.com/onboarding?paso=lugar",
    "https://agorbis.com/consentimiento",
    "https://agorbis.com/auth/confirm?token_hash=x",
  ])("no vuelve a un paso del acceso ni a la portada: %s", (current) => {
    expect(returnPathFor(current)).toBe("");
    expect(authEntryHref("/ingresar", current)).toBe("/ingresar");
  });

  it("el onboarding exigido por una acción vuelve a la página de origen", () => {
    const back = returnPathFor(
      "https://agorbis.com/c/barrio/reclamos/nuevo?qaction=xyz",
    );
    expect(onboardingPath(back)).toBe(
      "/onboarding?next=%2Fc%2Fbarrio%2Freclamos%2Fnuevo",
    );
  });
});

describe("portada con sesión", () => {
  it("lleva al inicio a quien tiene residencia y al onboarding a quien no", () => {
    expect(
      signedInHome({ userId: "u", profile: { home_community_id: "c" } }),
    ).toBe("/inicio");
    expect(
      signedInHome({ userId: "u", profile: { home_community_id: null } }),
    ).toBe("/onboarding");
    expect(signedInHome({ userId: "u", profile: null })).toBe("/onboarding");
  });

  it("deja la portada a quien no ingresó", () => {
    expect(signedInHome({ userId: null, profile: null })).toBeNull();
  });
});

describe("returnPathFor con un next anidado", () => {
  it("quita el next que apunta a la misma página y conserva el que apunta a otra", async () => {
    const { returnPathFor } = await import("./auth-navigation");
    expect(
      returnPathFor(
        "https://agorbis.test/c/earth/debates/nuevo/?next=%2Fc%2Fearth%2Fdebates%2Fnuevo%2F",
      ),
    ).toBe("/c/earth/debates/nuevo/");
    expect(
      returnPathFor("https://agorbis.test/perfil/seguridad?next=%2Fmoderacion"),
    ).toBe("/perfil/seguridad?next=%2Fmoderacion");
  });
});
