import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { SupportContent } from "./SupportContent";

const CAFECITO = "https://cafecito.app/agorbis";

describe("SupportContent", () => {
  it("con enlace, el botón sale del sitio sin referrer ni parámetros", async () => {
    const { document } = await renderWithLocale(
      <SupportContent donationHref={CAFECITO} />,
    );
    const link = document.querySelector('a[href^="https://"]');

    expect(link?.getAttribute("href")).toBe(CAFECITO);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer external");
    expect(link?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(document.querySelectorAll('a[href^="https://"]').length).toBe(1);
  });

  it("sin enlace, no hay botón y lo dice", async () => {
    const { document } = await renderWithLocale(
      <SupportContent donationHref={null} />,
    );
    const text = document.body.textContent ?? "";

    expect(document.querySelector('a[href^="https://"]')).toBeFalsy();
    expect(text).toContain("Todavía no recibimos aportes.");
  });

  it("dice que donar no da ningún beneficio y que no se registra quién dona", async () => {
    const { document } = await renderWithLocale(
      <SupportContent donationHref={CAFECITO} />,
    );
    const text = document.body.textContent ?? "";

    expect(text).toContain(
      "Donar no cambia nada dentro de Agorbis: no da más visibilidad, más peso en una votación ni funciones extra.",
    );
    expect(text).toContain(
      "Agorbis no registra quién dona ni cuánto. El aporte no queda asociado a tu cuenta.",
    );
  });

  it("tiene traducción al inglés", async () => {
    const { document } = await renderWithLocale(
      <SupportContent donationHref={CAFECITO} />,
      "en",
    );
    const text = document.body.textContent ?? "";

    expect(text).toContain("Support Agorbis");
    expect(text).not.toContain("Apoyar a Agorbis");
  });
});
