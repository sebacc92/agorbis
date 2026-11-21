import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { MetricTile } from "./MetricTile";

/* La anatomía única de las cifras (D123, D126): el color va en el rótulo, el
   número queda neutro y el cero se dice en palabras atenuadas. Antes el cero
   de "resueltos" salía en verde grande, como algo que festejar. */
describe("MetricTile", () => {
  it("sin cifra dice el vacío en palabras atenuadas y no dibuja un cero", async () => {
    const { document } = await renderWithLocale(
      <MetricTile
        icon="trophy"
        tone="text-success"
        label="Resueltos"
        value={null}
        emptyText="Todavía ninguno"
      />,
    );
    const tile = document.querySelector(".rounded-2xl")!;
    expect(tile.textContent).toContain("Todavía ninguno");
    expect(tile.textContent).not.toMatch(/\b0\b/);
    expect(tile.querySelector(".text-display-md")).toBeFalsy();
  });

  it("con cifra la muestra neutra y deja el color del significado en el rótulo", async () => {
    const { document } = await renderWithLocale(
      <MetricTile
        icon="trophy"
        tone="text-success"
        label="Resueltos"
        value="12"
      />,
    );
    const number = document.querySelector(".text-display-md")!;
    expect(number.textContent).toBe("12");
    expect(number.className).toContain("text-ink-strong");
    expect(number.className).not.toContain("text-success");
    expect(document.querySelector(".text-success")?.textContent).toContain(
      "Resueltos",
    );
  });

  it("con destino la ficha entera es un enlace sin bloques adentro", async () => {
    const { document } = await renderWithLocale(
      <MetricTile
        icon="megaphone"
        label="En curso"
        value="3"
        href="/c/barrio/reclamos?estado=abiertos"
      />,
    );
    const link = document.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(
      "/c/barrio/reclamos?estado=abiertos",
    );
    expect(link.textContent).toContain("En curso");
    // Un `<div>` o un `<p>` dentro de un `<a>` es HTML inválido.
    expect(link.querySelector("div, p")).toBeFalsy();
  });

  it("con destino anima y apaga `translate`, que es lo que mueve Tailwind 4", async () => {
    const { document } = await renderWithLocale(
      <MetricTile
        icon="inbox"
        label="Total"
        value="8"
        href="/c/barrio/reclamos"
      />,
    );
    // Con `transform` en la transición la elevación saltaba de golpe, y
    // `transform-none` no la frenaba con "reducir movimiento".
    const classes = document.querySelector("a")!.getAttribute("class")!;
    expect(classes).toContain("hover:-translate-y-0.5");
    expect(classes).toContain("transition-[border-color,box-shadow,translate]");
    expect(classes).toContain("motion-reduce:hover:translate-none");
    expect(classes).not.toContain("transform");
  });

  it("sin destino no hay enlace", async () => {
    const { document } = await renderWithLocale(
      <MetricTile icon="inbox" label="Total" value="8" />,
    );
    expect(document.querySelector("a")).toBeFalsy();
    expect(document.querySelector(".text-display-md")?.textContent).toBe("8");
  });
});
