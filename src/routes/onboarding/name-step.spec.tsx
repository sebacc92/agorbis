import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import OnboardingPage, { useOnboarding } from "./index";

/**
 * D121, mejora 10: el paso del nombre muestra cómo se va a ver la persona y
 * dice que el correo no se muestra. Lo que la gente teme al registrarse es
 * exponer el correo; acá se ve lo que sí se expone.
 */
const Fixture = component$<{ displayName: string; username: string }>(
  ({ displayName, username }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider
        url="https://agorbis.test/onboarding/"
        loaders={[
          {
            loader: useOnboarding,
            data: {
              step: "nombre",
              username,
              displayName,
              next: "",
              trail: [],
              options: [],
              query: "",
              chain: [],
              chosen: null,
            },
          },
        ]}
      >
        <OnboardingPage />
      </QwikRouterMockProvider>
    );
  },
);

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("paso del nombre", () => {
  it("muestra cómo se va a ver y aclara que el correo no se muestra", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture displayName="Dai Lentz" username="dai_lentz" />);
    const preview = screen.querySelector("[data-name-preview]");
    expect(preview?.textContent).toContain("Así te van a ver");
    expect(preview?.textContent).toContain("Dai Lentz");
    expect(preview?.textContent).toContain("@dai_lentz");
    expect(preview?.textContent).toContain(
      "Tu correo no se muestra en ningún lado.",
    );
    // El formulario navega como documento: sin router trabado tras redirigir.
    expect(
      screen.querySelector("form")?.getAttribute("data-spa-reset") ?? "",
    ).toBe("");
  });

  it("sin nombre todavía, la vista previa no inventa uno", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture displayName="" username="" />);
    const preview = screen.querySelector("[data-name-preview]");
    expect(preview?.textContent).toContain("…");
    expect(preview?.textContent).toContain("@usuario");
  });
});
