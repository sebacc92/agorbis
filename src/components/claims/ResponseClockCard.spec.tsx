import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { observeClaimResponseClock } from "~/lib/claim-clock-observer";
import { ResponseClockCard } from "./ResponseClockCard";

vi.mock("~/lib/claim-clock-observer", () => ({
  observeClaimResponseClock: vi.fn(() => () => {}),
}));
beforeEach(() => vi.clearAllMocks());
const due = "2030-10-01T12:00:00Z";
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <ResponseClockCard
      claim={{
        status: "open",
        response_due_at: due,
        first_response_at: null,
        escalated_at: null,
        support_count: 20,
      }}
      community={{
        id: "community",
        slug: "barrio",
        name: "Barrio",
        path: "earth.barrio",
        level: 5,
        emoji: null,
      }}
      memberCount={100}
      escalatedTo={null}
    />
  );
});

describe("tarjeta del reloj con vencimiento local", () => {
  it("anuncia el plazo vencido sin inventar un escalado aunque alcance el apoyo", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    await vi.waitFor(() =>
      expect(observeClaimResponseClock).toHaveBeenCalled(),
    );
    const update = vi.mocked(observeClaimResponseClock).mock.calls.at(-1)![1];
    update(Date.parse(due));
    await vi.waitFor(() =>
      expect(screen.textContent).toContain("El plazo para responder terminó."),
    );
    expect(
      screen.querySelector('[role="status"]')?.getAttribute("aria-live"),
    ).toBe("polite");
    expect(screen.textContent).toContain("El escalado se confirma después");
    expect(screen.textContent).not.toContain("Escalado por falta de respuesta");
    expect(screen.textContent).not.toContain("sube solo");
  });

  it("conjuga el vencimiento en presente mientras corre el plazo y en pasado al vencer", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    await vi.waitFor(() =>
      expect(observeClaimResponseClock).toHaveBeenCalled(),
    );
    const update = vi.mocked(observeClaimResponseClock).mock.calls.at(-1)![1];
    update(Date.parse(due) - 3 * 86_400_000);
    await vi.waitFor(() =>
      expect(screen.textContent).toContain("Quedan 3 días para que respondan"),
    );
    expect(screen.textContent).toContain("Vence el");
    expect(screen.textContent).not.toContain("Vencía el");

    update(Date.parse(due));
    await vi.waitFor(() =>
      expect(screen.textContent).toContain("El plazo para responder terminó."),
    );
    expect(screen.textContent).toContain("Vencía el");
    expect(screen.textContent).not.toContain("Vence el");
  });
});
