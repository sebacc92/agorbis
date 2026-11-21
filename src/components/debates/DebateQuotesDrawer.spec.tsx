import { component$, useContextProvider, useSignal } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { showToast } from "~/components/ui/Toast";
import { DebateColumn, type DebateColumnData } from "./DebateColumn";
import { DebateQuotesDrawer } from "./DebateQuotesDrawer";

vi.mock("~/components/ui/Toast", () => ({ showToast: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));
vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: vi.fn() }));
const column: DebateColumnData = { id: "caba", name: "CABA", slug: "caba", position: 1, truncated: false, commentCount: 1, comments: [{ id: "comment-one", body: "We suggest safer crossings.", score: 2, created_at: "2026-10-01T12:00:00Z", author: null, myVote: 0 }] };
const Example = component$<{ initial?: string; proposal?: boolean }>(({ initial = "Mi comentario", proposal = true }) => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  const draft = useSignal(initial);
  const columns = [{ ...column, comments: [{ ...column.comments[0], body: proposal ? column.comments[0].body : "Hoy pasó un colectivo." }] }];
  return <QwikRouterMockProvider url="http://localhost/debates/one">
    <textarea id="unrelated-report" value="Texto de otro formulario" />
    <DebateQuotesDrawer columns={columns} debateTitle="Transporte" replyColumn={column} replyDraft={draft} />
    <DebateColumn column={columns[0]} debateId="one" totalColumns={1} isMine canVote isAuthenticated debateOpen commentDraft={draft} />
  </QwikRouterMockProvider>;
});
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0)); });
afterEach(() => vi.unstubAllGlobals());

async function example(initial?: string, proposal?: boolean) {
  const dom = await createDOM();
  await dom.render(<Example initial={initial} proposal={proposal} />);
  await dom.userEvent(dom.screen.querySelector("button"), "click");
  return dom;
}

describe("citas sobre el borrador controlado", () => {
  it("conserva lo escrito, inserta en la comunidad propia y actualiza el contador", async () => {
    const { screen, userEvent } = await example();
    const insert = Array.from(screen.querySelectorAll("button")).find((button) => button.textContent === "Citar en mi comentario")!;
    await userEvent(insert, "click");
    const input = screen.querySelector<HTMLTextAreaElement>("#comentario-caba")!;
    expect(input.value).toContain("Mi comentario\n\n> We suggest safer crossings.");
    expect(screen.querySelector("#comentario-caba-count")?.textContent).toBe(`${input.value.length}/1000`);
    expect(screen.querySelector<HTMLTextAreaElement>("#unrelated-report")?.value).toBe("Texto de otro formulario");
    expect(showToast).toHaveBeenCalledWith("Cita agregada al borrador de CABA.", "success");
  });

  it("rechaza la cita que no entra y conserva el texto y contador anteriores", async () => {
    const { screen, userEvent } = await example("a".repeat(990));
    const insert = Array.from(screen.querySelectorAll("button")).find((button) => button.textContent === "Citar en mi comentario")!;
    await userEvent(insert, "click");
    expect(screen.querySelector<HTMLTextAreaElement>("#comentario-caba")?.value).toBe("a".repeat(990));
    expect(screen.querySelector("#comentario-caba-count")?.textContent).toBe("990/1000");
    expect(showToast).toHaveBeenCalledWith("La cita no entra en el límite de 1000 caracteres. Tu comentario se conserva; podés copiar la cita y acortarla.", "warn");
  });

  it("explica el filtro y recupera todos los resultados desde su estado vacío", async () => {
    const { screen, userEvent } = await example("", false);
    const proposals = Array.from(screen.querySelectorAll("button")).find((button) => button.textContent?.includes("Propuestas"))!;
    await userEvent(proposals, "click");
    expect(proposals.getAttribute("aria-pressed")).toBe("true");
    expect(screen.textContent).toContain("Busca palabras de propuesta en español o inglés");
    expect(screen.textContent).toContain("No hay citas cargadas que coincidan con este filtro.");
    const all = Array.from(screen.querySelectorAll("button")).find((button) => button.textContent === "Mostrar todas las citas")!;
    await userEvent(all, "click");
    expect(screen.textContent).not.toContain("No hay citas cargadas que coincidan con este filtro.");
    expect(screen.textContent).toContain("Mostrando 1 de 1 citas cargadas.");
  });

  // Un bloque dentro de <button> corta el servidor de desarrollo de Qwik (Q12):
  // el disparador va dentro del h2 y sólo lleva spans.
  it("abre un disclosure válido y fija la cita con un botón que tiene nombre propio", async () => {
    const { screen, userEvent } = await example();
    const trigger = screen.querySelector<HTMLButtonElement>("h2 > button[aria-expanded]")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const drawer = trigger.closest("h2")!.parentElement!;
    expect(drawer.querySelector("button div, button p, button h2, button h3, button h4, button blockquote")).toBeFalsy();
    const pin = () => drawer.querySelector<HTMLButtonElement>('button[aria-label="Fijar cita"]')!;
    expect(pin().getAttribute("aria-pressed")).toBe("false");
    await userEvent(pin(), "click");
    expect(pin().getAttribute("aria-pressed")).toBe("true");
    expect(trigger.textContent).toContain("1 fijada");
  });
});
