import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { MilestoneCarousel } from "./MilestoneCarousel";

describe("accesibilidad del carrusel de hitos", () => {
  it("sólo el hito actual permite interacción y anuncia su posición y título", async () => {
    const { document } = await renderWithLocale(
      <MilestoneCarousel
        communityName="Barrio de prueba"
        communitySlug="barrio-de-prueba"
        createdAt="2026-01-01T00:00:00Z"
        memberCount={0}
        resolvedClaimsCount={0}
        pollsCount={0}
        projectsCount={0}
      />,
    );
    const slides = [...document.querySelectorAll("[aria-hidden]")].filter(
      (node) => node.querySelector("h3"),
    );
    expect(slides).toHaveLength(6);
    expect(slides[0].getAttribute("aria-hidden")).toBe("false");
    expect(slides[0].hasAttribute("inert")).toBe(false);
    for (const slide of slides.slice(1)) {
      expect(slide.getAttribute("aria-hidden")).toBe("true");
      expect(slide.hasAttribute("inert")).toBe(true);
    }
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Hito 1 de 6: Comunidad creada",
    );
    const indicators = document.querySelectorAll(
      'button[aria-label^="Ir al hito"]',
    );
    expect(indicators).toHaveLength(6);
    expect(indicators[0].getAttribute("aria-current")).toBe("true");
    expect(
      [...indicators]
        .slice(1)
        .some((button) => button.hasAttribute("aria-current")),
    ).toBe(false);
  });
});
