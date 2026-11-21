import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { CommunityRef } from "~/lib/community";
import { CommunityBreadcrumb } from "./CommunityBreadcrumb";

/**
 * Décima ronda, mejora 4: a 390 px la miga mostraba "Tierra › América del
 * Sur › Argentina ›" y la comunidad actual quedaba fuera de pantalla. En
 * teléfono se ven las dos últimas y los ancestros esperan detrás de "…".
 */
const ref = (slug: string, name: string, level: number): CommunityRef => ({
  id: slug,
  slug,
  name,
  emoji: null,
  level,
  path: slug,
});

const CHAIN = [
  ref("earth", "Tierra", 0),
  ref("south-america", "América del Sur", 1),
  ref("argentina", "Argentina", 2),
  ref("buenos-aires", "Buenos Aires", 3),
  ref("miramar", "Miramar", 4),
];

const Fixture = component$<{ chain: CommunityRef[] }>(({ chain }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider url="https://agorbis.test/c/miramar/">
      <CommunityBreadcrumb chain={chain} />
    </QwikRouterMockProvider>
  );
});

// Al desplegar, el foco se mueve en el siguiente cuadro: acá no hay cuadros.
beforeEach(() => vi.stubGlobal("requestAnimationFrame", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("CommunityBreadcrumb", () => {
  // D124: con más de tres migas el colapso vale en todo ancho, así que los
  // ancestros llevan `hidden` a secas y el botón de puntos se ve siempre.
  it("con más de tres migas deja a la vista las dos últimas en todo ancho", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture chain={CHAIN} />);
    const items = Array.from(screen.querySelectorAll("[data-breadcrumb-item]"));
    expect(items).toHaveLength(5);
    for (const li of items.slice(0, 3)) {
      const cls = li.getAttribute("class") ?? "";
      expect(cls).toContain("hidden");
      expect(cls).not.toContain("sm:flex");
    }
    for (const li of items.slice(3)) {
      expect(li.getAttribute("class")).not.toContain("hidden");
    }
    const toggle = screen.querySelector("button[aria-expanded]");
    expect(toggle?.getAttribute("aria-label")).toBe(
      "Mostrar toda la cadena de comunidades",
    );
    expect(toggle?.closest("li")?.getAttribute("class")).not.toContain(
      "sm:hidden",
    );
    // El separador es un ícono, no el carácter "›".
    expect(screen.textContent).not.toContain("›");
    // La actual sigue marcada y ninguna miga desapareció del documento.
    expect(screen.querySelector('[aria-current="page"]')?.textContent).toContain(
      "Miramar",
    );
    expect(screen.textContent).toContain("Tierra");
  });

  it("al tocar los puntos se despliega la cadena entera y el botón se va", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Fixture chain={CHAIN} />);
    await userEvent("button[aria-expanded]", "click");
    expect(screen.querySelector("button[aria-expanded]")).toBeFalsy();
    for (const li of Array.from(
      screen.querySelectorAll("[data-breadcrumb-item]"),
    )) {
      expect(li.getAttribute("class")).not.toContain("hidden");
    }
  });

  it("con tres migas el colapso es sólo de teléfono", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture chain={CHAIN.slice(-3)} />);
    const items = Array.from(screen.querySelectorAll("[data-breadcrumb-item]"));
    expect(items[0]?.getAttribute("class")).toContain("hidden sm:flex");
    expect(
      screen.querySelector("button[aria-expanded]")?.closest("li")?.getAttribute("class"),
    ).toContain("sm:hidden");
  });

  it("con dos migas no hay nada que colapsar", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture chain={CHAIN.slice(-2)} />);
    expect(screen.querySelector("button[aria-expanded]")).toBeFalsy();
    for (const li of Array.from(
      screen.querySelectorAll("[data-breadcrumb-item]"),
    )) {
      expect(li.getAttribute("class")).not.toContain("hidden");
    }
  });
});
