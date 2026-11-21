import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { SupportNote } from "./SupportNote";

describe("SupportNote", () => {
  it("con página de apoyo, explica cómo se sostiene y enlaza a /apoyar", async () => {
    const { document } = await renderWithLocale(
      <SupportNote href="/apoyar" />,
    );
    const links = Array.from(document.querySelectorAll("a"));

    expect(document.body.textContent).toContain(
      "Agorbis no tiene publicidad ni vende datos.",
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/apoyar",
    ]);
  });

  it("nunca enlaza directo al proveedor de pagos", async () => {
    const { document } = await renderWithLocale(
      <SupportNote href="/apoyar" />,
    );

    expect(document.querySelector('a[href^="https://"]')).toBeFalsy();
  });

  it("sin página de apoyo no muestra nada", async () => {
    const { document } = await renderWithLocale(<SupportNote href={null} />);

    expect(document.body.textContent ?? "").not.toContain("publicidad");
    expect(document.querySelector("a")).toBeFalsy();
  });

  it("tiene traducción al inglés", async () => {
    const { document } = await renderWithLocale(
      <SupportNote href="/apoyar" />,
      "en",
    );

    expect(document.body.textContent).toContain("Support Agorbis");
  });
});
