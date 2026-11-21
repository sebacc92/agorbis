import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { MilestoneCarousel } from "./MilestoneCarousel";
import { QuickVoteWidget } from "./QuickVoteWidget";
import { VictoriesHonorRoll } from "./VictoriesHonorRoll";
import { WeeklyDigestModal } from "./WeeklyDigestModal";

describe("widgets de comunidad sin datos de relleno", () => {
  it("MilestoneCarousel: sin actividad, el progreso es 0 % y no un valor fijo", async () => {
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
    const t = document.body.textContent ?? "";
    for (const filler of ["35%", "20%", "15%"]) {
      expect(t).not.toContain(filler);
    }
    expect(t).toContain("0%");
  });

  it("QuickVoteWidget: no promete un voto anónimo y verificable", async () => {
    const { document } = await renderWithLocale(
      <QuickVoteWidget
        poll={{
          id: "00000000-0000-4000-8000-000000000001",
          question: "¿Arreglamos la plaza?",
          options: ["Sí", "No"],
          status: "active",
          closes_at: "2099-01-01T00:00:00Z",
        }}
      />,
    );
    const t = document.body.textContent ?? "";
    expect(t).toContain("¿Arreglamos la plaza?");
    expect(t).not.toMatch(/anónimo|verificable/);
    expect(t).toContain("Resultados al cierre");
    expect(t).not.toMatch(/votos? emitidos?/);
  });

  it.each([
    ["active", "2020-01-01T00:00:00Z"],
    ["closed", "2099-01-01T00:00:00Z"],
    ["removed", "2099-01-01T00:00:00Z"],
    ["active", "fecha inválida"],
    ["active", null],
  ])("QuickVoteWidget no invita a votar si estado=%s y cierre=%s", async (status, closes_at) => {
    const { document } = await renderWithLocale(
      <QuickVoteWidget poll={{
        id: "00000000-0000-4000-8000-000000000001",
        question: "Consulta fuera de plazo",
        options: ["Sí", "No"],
        status,
        closes_at,
      }} />,
    );
    expect(document.querySelector("h3")).toBeFalsy();
    expect(document.body.textContent).not.toContain("Votar en esta consulta");
  });

  it("VictoriesHonorRoll: no ofrece un agradecimiento que no sale del navegador", async () => {
    const { document } = await renderWithLocale(
      <VictoriesHonorRoll
        communityName="Barrio de prueba"
        communitySlug="barrio-de-prueba"
        victories={[
          {
            id: "v1",
            title: "Luminaria repuesta",
            supportCount: 8,
            solvedAt: "1 oct 2026",
          },
        ]}
      />,
    );
    const t = document.body.textContent ?? "";
    expect(t).toContain("Luminaria repuesta");
    expect(t).not.toContain("Agradecer");
  });

  it("WeeklyDigestModal: el botón no habla de un resumen semanal", async () => {
    const { document } = await renderWithLocale(
      <WeeklyDigestModal
        communityName="Barrio de prueba"
        resolvedClaimsCount={2}
        openClaimsCount={5}
        actionsCount={3}
        communityUrl="https://example.test/c/barrio-de-prueba"
      />,
    );
    const t = document.body.textContent ?? "";
    expect(t).not.toMatch(/semanal|esta semana/i);
  });
});
