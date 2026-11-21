import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { PublishedNextSteps } from "./PublishedNextSteps";

const base = {
  title: "Bache en la esquina",
  url: "/reclamos/33333333-3333-4333-8333-333333333333",
  communityName: "Mar del Plata",
};

describe("PublishedNextSteps", () => {
  it("un reclamo cuenta el plazo real del nivel y cómo darlo de baja", async () => {
    const { document } = await renderWithLocale(
      <PublishedNextSteps kind="claim" {...base} responseDays={20} />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Tu reclamo ya está publicado");
    expect(text).toContain(
      "Las instituciones de Mar del Plata tienen 20 días para acusar recibo.",
    );
    expect(text).toContain("dar de baja la publicación");
    expect(text).not.toContain("Municipalidad");
  });

  it("un nivel sin ventana no promete un plazo", async () => {
    const { document } = await renderWithLocale(
      <PublishedNextSteps kind="claim" {...base} responseDays={null} />,
    );
    expect(document.body.textContent).toContain(
      "En este nivel no hay un plazo de respuesta institucional.",
    );
  });

  it("un proyecto aclara que nadie transfiere dinero por la plataforma", async () => {
    const { document } = await renderWithLocale(
      <PublishedNextSteps kind="project" {...base} />,
    );
    expect(document.body.textContent).toContain(
      "Nadie transfiere dinero a través de Agorbis.",
    );
  });

  it("comparte la ruta canónica, sin el parámetro de la primera visita", async () => {
    const { document } = await renderWithLocale(
      <PublishedNextSteps kind="debate" {...base} />,
    );
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.includes("Compartir"),
      ),
    ).toBe(true);
    expect(document.body.innerHTML).not.toContain("publicado=1");
  });
});
