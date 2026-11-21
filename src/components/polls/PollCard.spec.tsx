import { describe, expect, it } from "vitest";
import { component$, useContextProvider } from "@qwik.dev/core";
import { renderWithLocale } from "~/testing/render";
import { TimeZoneContext } from "~/lib/timezone";
import { PollCard, type PollCardData } from "./PollCard";

const poll: PollCardData = {
  id: "a0000000-0000-4000-8000-000000000001",
  question: "¿Dónde instalamos los bicicleteros?",
  description: "Elegí las escuelas que necesitan bicicleteros.",
  type: "multiple",
  category: "transporte",
  status: "open",
  closes_at: null,
  created_at: "2026-10-01T12:00:00Z",
  option_count: 4,
  total_votes: 37,
  has_voted: false,
  can_see: false,
};

const Example = component$<{ poll: PollCardData }>((props) => {
  useContextProvider(TimeZoneContext, "UTC");
  return <PollCard poll={props.poll} />;
});

describe("acceso a una encuesta desde su tarjeta", () => {
  it("anuncia que abre la encuesta sin prometer un voto inmediato", async () => {
    const { document } = await renderWithLocale(<Example poll={poll} />);
    const card = document.querySelector(`a[href="/encuestas/${poll.id}"]`)!;
    expect(card.textContent).toContain("Ver encuesta");
    expect(card.textContent).not.toContain("Votar en 1 clic");
    expect(card.textContent).toContain(poll.description);
    // Una sola llamada: la pastilla "Encuesta abierta · Ver encuesta →"
    // repetía el enlace de abajo (décima ronda, mejora 6).
    expect(card.textContent?.match(/Ver encuesta/g)).toHaveLength(1);
    expect(card.textContent).not.toContain("Encuesta abierta");
  });

  it.each([
    ["abierta", "active", "Resultados al cierre"],
    ["cerrada con pocos votos", "closed", "Sin resultados por baja participación"],
  ])("conserva la protección de los conteos de una encuesta %s", async (_, status, label) => {
    const { document } = await renderWithLocale(
      <Example poll={{ ...poll, status, closes_at: "2099-01-01T00:00:00Z" }} />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain(label);
    expect(text).not.toContain("37 votos");
  });

  it("sólo ofrece ver resultados cuando están disponibles", async () => {
    const { document } = await renderWithLocale(<Example poll={{ ...poll, status: "closed", can_see: true }} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ver resultados");
    expect(text).toContain("37 votos");
    expect(text).not.toContain("Encuesta abierta");
  });
});
