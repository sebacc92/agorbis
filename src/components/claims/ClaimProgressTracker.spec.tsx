import { describe, expect, it } from "vitest";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { renderWithLocale } from "~/testing/render";
import { ClaimProgressTracker } from "./ClaimProgressTracker";

const base = {
  status: "open",
  supportCount: 0,
  threshold: 10,
  createdAt: "2026-10-01T12:00:00Z",
  hasOfficialResponse: false,
};

const text = async (props: Partial<typeof base> & Record<string, unknown>) => {
  const { document } = await renderWithLocale(
    <ClaimProgressTracker {...base} {...props} />,
  );
  return document.body.textContent ?? "";
};

describe("ClaimProgressTracker", () => {
  it("llegar a la meta de apoyos no lo presenta como escalado (D58)", async () => {
    const t = await text({ supportCount: 12 });
    expect(t).toContain("Meta alcanzada");
    expect(t).toContain("Meta de apoyos alcanzada");
    expect(t).not.toContain("Escalado por falta de respuesta");
    expect(t).not.toContain("Elevado a autoridades");
    expect(t).not.toContain("Listo para elevar");
  });

  it("sólo muestra escalado cuando la base registró escalated_at", async () => {
    const t = await text({
      supportCount: 12,
      escalatedAt: "2026-10-10T12:00:00Z",
    });
    expect(t).toContain("Escalado por falta de respuesta");
  });

  it("no inventa una inspección cuando todavía no hay respuesta", async () => {
    const t = await text({ escalatedAt: "2026-10-10T12:00:00Z" });
    expect(t).not.toContain("Inspección");
    expect(t).toContain("Sin respuesta institucional registrada");
  });

  it("resolver sin firmas ni respuesta no completa retrospectivamente las otras etapas", async () => {
    const { document } = await renderWithLocale(
      <ClaimProgressTracker {...base} status="resolved" supportCount={2} />,
    );
    const steps = Array.from(document.querySelectorAll("section ol li"));
    expect(steps[1]?.textContent).toContain("Etapa sin registrar");
    expect(steps[1]?.textContent).toContain("2 / 10");
    expect(steps[2]?.textContent).toContain("Sin elevación registrada");
    expect(steps[2]?.textContent).toContain("Etapa sin registrar");
    expect(steps[3]?.textContent).toContain(
      "Sin respuesta institucional registrada",
    );
    expect(steps[3]?.textContent).toContain("Etapa sin registrar");
    expect(steps[4]?.textContent).toContain("Etapa registrada");
    expect(steps[4]?.getAttribute("aria-current")).toBe("step");
    expect(document.body.textContent).not.toContain(
      "Respuesta oficial registrada",
    );
  });

  it("un estado de gestión y un acuse institucional no inventan una respuesta oficial", async () => {
    const progress = await text({ status: "in_progress" });
    expect(progress).toContain("Estado de gestión registrado");
    expect(progress).toContain("Sin elevación registrada");
    expect(progress).not.toContain("Respuesta oficial registrada");
    const acknowledgment = await text({
      firstResponseAt: "2026-10-02T12:00:00Z",
    });
    expect(acknowledgment).toContain("Acuse institucional registrado");
    expect(acknowledgment).not.toContain("Respuesta oficial registrada");
    expect(await text({ hasOfficialResponse: true })).toContain(
      "Respuesta oficial registrada",
    );
  });

  it("la elevación registrada identifica el territorio real sin acreditar firmas ni respuesta", async () => {
    const t = await text({
      escalatedAt: "2026-10-10T12:00:00Z",
      escalatedToName: "Buenos Aires",
    });
    expect(t).toContain("Visible también en Buenos Aires");
    expect(t).toContain("0 / 10");
    expect(t).toContain("Sin respuesta institucional registrada");
    expect(t).not.toContain("Meta alcanzada");
  });

  it("es una sección con título, no un landmark de navegación, y la etapa actual lleva el color del reclamo (D126)", async () => {
    const { document } = await renderWithLocale(
      <ClaimProgressTracker {...base} supportCount={1} threshold={3} />,
    );
    expect(document.querySelector("nav")).toBeFalsy();
    const section = document.querySelector(
      'section[aria-labelledby="etapas-reclamo"]',
    );
    expect(section).toBeTruthy();
    expect(document.querySelector("#etapas-reclamo")?.textContent).toBe(
      "Etapas del reclamo",
    );
    const steps = Array.from(document.querySelectorAll("section ol li"));
    expect(steps.map((step) => step.getAttribute("data-state"))).toEqual([
      "done",
      "current",
      "pending",
      "pending",
      "pending",
    ]);
    const current = steps[1]?.querySelector("p");
    expect(current?.textContent).toBe("Apoyos vecinales");
    expect(current?.className).toContain(CONTENT_KIND_TONES.claim.text);
    expect(steps[0]?.querySelector("svg")).toBeTruthy();
    expect(steps[1]?.querySelector("svg")).toBeTruthy();
    const markup = section?.innerHTML ?? "";
    expect(markup).not.toMatch(
      /opacity-60|text-3xs|animate-pulse|bg-gradient|shadow-soft|brand-/,
    );
    expect(document.body.textContent).not.toContain("✓");
  });

  it("desde sm el texto de cada etapa ocupa el ancho de su columna, para que una palabra larga se corte y no pise a la vecina", async () => {
    const { document } = await renderWithLocale(
      <ClaimProgressTracker {...base} />,
    );
    expect(
      Array.from(document.querySelectorAll("section ol li")).map((step) =>
        (step.querySelector("div")?.className.split(/\s+/) ?? []).includes(
          "sm:w-full",
        ),
      ),
    ).toEqual([true, true, true, true, true]);
  });
});
