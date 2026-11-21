import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { DebateConsensusCard } from "./DebateConsensusCard";

vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));
vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: vi.fn() }));
const Example = component$<{ score: number }>(({ score }) => {
  useContextProvider(LocaleContext, "es");
  return <DebateConsensusCard communityName="Argentina" myColumnId={null} columns={[{ id: "caba", name: "CABA", slug: "caba", position: 1, truncated: true, commentCount: 100, comments: [{ id: "one", body: "Un aporte cargado", score, created_at: "2026-10-01T12:00:00Z", author: null, myVote: 0 }] }]} />;
});

describe("resumen de participación y puntajes", () => {
  it.each([[-3, "-3"], [0, "0"], [4, "+4"]])("muestra %i sin atribuir acuerdo comunitario", async (score, expected) => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example score={score as number} />);
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.textContent).toContain("Mayor puntaje entre los comentarios cargados");
    expect(screen.textContent).toContain("No miden el acuerdo de toda la comunidad.");
    const label = Array.from(screen.querySelectorAll("p")).find((paragraph) => paragraph.textContent === "Mayor puntaje entre los comentarios cargados")!;
    expect(label.parentElement?.querySelector("span")?.textContent).toBe(expected);
    expect(screen.textContent).not.toContain("+-");
    expect(screen.textContent).not.toContain("Aporte con mayor respaldo");
  });
});
