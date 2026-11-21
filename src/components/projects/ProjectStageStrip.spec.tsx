import { describe, expect, it } from "vitest";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { renderWithLocale } from "~/testing/render";
import { ProjectStageStrip } from "./ProjectStageStrip";

describe("ProjectStageStrip", () => {
  it("marca la etapa actual con los mismos nombres que el resto de la app", async () => {
    const { document } = await renderWithLocale(
      <ProjectStageStrip status="in_progress" />,
    );
    const stages = Array.from(document.querySelectorAll("ol > li"));
    expect(stages.map((stage) => stage.querySelector("p")?.textContent)).toEqual([
      "Propuesta",
      "Juntando apoyo",
      "En ejecución",
      "Completado",
    ]);
    expect(
      stages.map((stage) => stage.getAttribute("aria-current")),
    ).toEqual([null, null, "step", null]);
    expect(document.body.textContent).toContain(
      "Quien lo propuso marca cada etapa",
    );
  });

  it("no marca como cumplidas las etapas que el proyecto pudo saltear", async () => {
    const { document } = await renderWithLocale(
      <ProjectStageStrip status="in_progress" />,
    );
    expect(document.body.textContent).not.toContain("✓");
    expect(
      Array.from(document.querySelectorAll("ol > li")).map((stage) =>
        stage.getAttribute("data-state"),
      ),
    ).toEqual(["pending", "pending", "current", "pending"]);
  });

  it("la etapa actual lleva el color del proyecto y no el violeta, y en el teléfono su pista va debajo (D126)", async () => {
    const { document } = await renderWithLocale(
      <ProjectStageStrip status="funding" />,
    );
    const titles = Array.from(document.querySelectorAll("ol > li")).map(
      (stage) => stage.querySelector("p"),
    );
    expect(titles[1]?.className).toContain(CONTENT_KIND_TONES.project.text);
    expect(titles[0]?.className).not.toContain(CONTENT_KIND_TONES.project.text);
    expect(document.querySelector("section")?.innerHTML).not.toContain(
      "brand-",
    );
    expect(document.querySelector("ol + p")?.textContent).toBe(
      "Juntando apoyo: Recibe compromisos de dinero, tiempo o materiales.",
    );
  });

  it("en el teléfono las cuatro pistas siguen en su etapa para el lector de pantalla y la copia de abajo no se lee dos veces (D126)", async () => {
    const { document } = await renderWithLocale(
      <ProjectStageStrip status="funding" />,
    );
    const hints = Array.from(document.querySelectorAll("ol > li")).map(
      (stage) => stage.querySelectorAll("p")[1],
    );
    expect(hints.map((hint) => hint?.textContent)).toEqual([
      "Se presenta la idea.",
      "Recibe compromisos de dinero, tiempo o materiales.",
      "Se ejecuta y registra sus avances.",
      "Terminó; queda su historial.",
    ]);
    // Se ocultan a la vista y no al árbol de accesibilidad: nada de `hidden`.
    expect(
      hints.map((hint) => {
        const classes = hint?.className.split(/\s+/) ?? [];
        return classes.includes("sr-only") && !classes.includes("hidden");
      }),
    ).toEqual([true, true, true, true]);
    expect(document.querySelector("ol + p")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("el texto de cada etapa ocupa el ancho de su columna, para que una palabra larga se corte y no pise a la vecina", async () => {
    const { document } = await renderWithLocale(
      <ProjectStageStrip status="proposal" />,
    );
    expect(
      Array.from(document.querySelectorAll("ol > li")).map((stage) =>
        (stage.querySelector("div")?.className.split(/\s+/) ?? []).includes(
          "w-full",
        ),
      ),
    ).toEqual([true, true, true, true]);
  });

  it("no se muestra para un proyecto dado de baja", async () => {
    const { document } = await renderWithLocale(
      <ProjectStageStrip status="removed" />,
    );
    expect(document.querySelector("#etapas-proyecto")).toBeFalsy();
  });
});
