import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { PollResults } from "./PollResults";
import { LiveResults } from "./LiveResults";

describe("resultados de encuestas", () => {
  it("muestra los votos agregados sin ofrecer un desglose geográfico inventado", async () => {
    const { document } = await renderWithLocale(
      <PollResults
        totalVotes={10}
        totalVoters={10}
        results={[
          { option_id: "a", label: "Plaza", votes: 6, percentage: 60 },
          { option_id: "b", label: "Biblioteca", votes: 4, percentage: 40 },
        ]}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Plaza");
    expect(text).toContain("60%");
    expect(text).toContain("4 votos");
    expect(text).not.toMatch(/Desglose Territorial|Tendencia Territorial|Casco Histórico|Barrios Residenciales/);
  });

  it("explicita la muestra sin inferir consenso de toda la comunidad", async () => {
    const { document } = await renderWithLocale(
      <PollResults totalVotes={5} totalVoters={5} results={[
        { option_id: "a", label: "Plaza", votes: 3, percentage: 60 },
        { option_id: "b", label: "Biblioteca", votes: 2, percentage: 40 },
      ]} />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Participantes: 5");
    expect(text).toContain("Los resultados reflejan sólo a quienes participaron.");
    expect(text).not.toMatch(/Fuerte consenso|Opiniones divididas|Participación plural/);
  });

  it("distingue personas y selecciones en una encuesta de varias respuestas", async () => {
    const { document } = await renderWithLocale(
      <LiveResults initialTotal={8} initialVoters={5} initialResults={[
        { option_id: "a", label: "Plaza", votes: 4, percentage: 50 },
        { option_id: "b", label: "Biblioteca", votes: 4, percentage: 50 },
      ]} />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Participantes: 5");
    expect(text).not.toContain("Participantes: 8");
    expect(text).toContain("8 votos emitidos");
    expect(text).toContain("una persona puede emitir más de un voto");
  });
});
