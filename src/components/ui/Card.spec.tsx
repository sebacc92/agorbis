import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { Card } from "./index";

/* La elevación de lo clicable (D123). Tailwind 4 la mueve con la propiedad
   `translate`: con `transform` en la transición la tarjeta saltaba de golpe y
   `transform-none` no la frenaba con "reducir movimiento". Es la misma regla
   que MetricTile, y las dos conviven en la rendición (D126). */
describe("Card", () => {
  it("interactiva anima y apaga `translate`, que es lo que mueve Tailwind 4", async () => {
    const { document } = await renderWithLocale(
      <Card as="article" interactive class="p-4">
        {"Ambiente"}
      </Card>,
    );
    const classes = document.querySelector("article")!.getAttribute("class")!;
    expect(classes).toContain("hover:-translate-y-0.5");
    expect(classes).toContain("transition-[border-color,box-shadow,translate]");
    expect(classes).toContain("motion-reduce:hover:translate-none");
    expect(classes).not.toContain("transform");
  });

  it("sin interactive no se eleva: la tarjeta de contenido es plana", async () => {
    const { document } = await renderWithLocale(
      <Card as="article">{"Dato"}</Card>,
    );
    const classes = document.querySelector("article")!.getAttribute("class")!;
    expect(classes).not.toContain("hover:-translate-y-0.5");
    expect(classes).not.toContain("hover:shadow-lift");
  });
});
