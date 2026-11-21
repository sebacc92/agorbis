import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { ProgressBar } from "./index";

/**
 * Lo que se prueba es el contrato accesible, que es todo el punto del
 * componente: un `<div>` con `role="progressbar"` sin valores correctos es un
 * rectángulo de color y nada más.
 */
describe("ProgressBar", () => {
  const render = (props: Parameters<typeof ProgressBar>[0]) =>
    renderWithLocale(<ProgressBar {...props} />);

  it("expone el porcentaje redondeado y el rango", async () => {
    const { document } = await render({ value: 1, max: 3, label: "Apoyo" });
    const bar = document.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("33");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("sin `valueText`, el valor se anuncia con unidad", async () => {
    const { document } = await render({ value: 1, max: 4, label: "Apoyo" });
    // Antes se anunciaba "25" a secas: un número sin decir de qué.
    expect(
      document.querySelector('[role="progressbar"]')!.getAttribute("aria-valuetext"),
    ).toBe("25%");
  });

  it("con `valueText`, gana el texto explícito", async () => {
    const { document } = await render({
      value: 12,
      max: 30,
      label: "Apoyo",
      valueText: "12 de 30 apoyos",
    });
    expect(
      document.querySelector('[role="progressbar"]')!.getAttribute("aria-valuetext"),
    ).toBe("12 de 30 apoyos");
  });

  it("nunca pasa del 100% ni divide por cero", async () => {
    const { document: excedido } = await render({
      value: 50,
      max: 10,
      label: "Apoyo",
    });
    expect(
      excedido.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"),
    ).toBe("100");

    const { document: sinTotal } = await render({
      value: 5,
      max: 0,
      label: "Apoyo",
    });
    expect(
      sinTotal.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"),
    ).toBe("0");
  });
});
