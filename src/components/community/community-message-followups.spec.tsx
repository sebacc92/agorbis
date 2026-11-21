import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext, type Locale } from "~/lib/i18n";
import { CommunityPressKitCard } from "./CommunityPressKitCard";
import { NewNeighborWelcomeModal } from "./NewNeighborWelcomeModal";

const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: vi.fn() }));
vi.mock("~/components/ui/Toast", () => ({ showToast: vi.fn() }));
const Example = component$<{ locale?: Locale; guide?: boolean }>(
  ({ locale = "en", guide = false }) => {
    useContextProvider(LocaleContext, locale);
    return (
      <QwikRouterMockProvider url="https://agorbis.test/c/barrio/">
        {guide ? (
          <NewNeighborWelcomeModal communityName="Barrio del Árbol" />
        ) : (
          <CommunityPressKitCard
            communityName="Barrio del Árbol"
            communitySlug="barrio"
          />
        )}
      </QwikRouterMockProvider>
    );
  },
);
beforeEach(() => {
  clipboard.writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("mensajes comunitarios comprobables", () => {
  it("la vista previa inglesa y el portapapeles comparten exactamente la misma invitación y firma", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    await userEvent(screen.querySelector("button"), "click");
    const invitation = screen.querySelector("p.font-mono")?.textContent;
    expect(invitation).toContain("Hello neighbors of Barrio del Árbol");
    const copy = Array.from(screen.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Copy WhatsApp message"),
    );
    expect(copy).toBeTruthy();
    await userEvent(copy!, "click");
    expect(clipboard.writeText).toHaveBeenLastCalledWith(invitation);
    const tab = Array.from(screen.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Institutional signature"),
    );
    expect(tab).toBeTruthy();
    await userEvent(tab!, "click");
    const signature = screen.querySelector("pre")?.textContent;
    expect(signature).toContain("Barrio del Árbol on Agorbis");
    const email = Array.from(screen.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Copy email signature"),
    );
    expect(email).toBeTruthy();
    await userEvent(email!, "click");
    expect(clipboard.writeText).toHaveBeenLastCalledWith(signature);
  });
  it("la guía describe el mapa real y condiciona presupuesto sin garantizar una respuesta", async () => {
    const { render, screen, userEvent } = await createDOM();
    const document = screen.ownerDocument;
    vi.stubGlobal("document", document);
    vi.stubGlobal("HTMLElement", class {});
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const element = createElement(tag);
      if (tag === "dialog")
        Object.defineProperties(element, {
          showModal: {
            configurable: true,
            value() {
              this.open = true;
            },
          },
          close: {
            configurable: true,
            value() {
              this.open = false;
            },
          },
        });
      return element;
    });
    await render(<Example locale="es" guide />);
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.textContent).toContain(
      "reclamos de la comunidad con ubicación aproximada",
    );
    expect(screen.textContent).not.toContain("luminarias y proyectos a metros");
    const next = () =>
      Array.from(screen.querySelectorAll("button")).find((el) =>
        el.textContent?.includes("Ver siguiente paso"),
      );
    expect(next()).toBeTruthy();
    await userEvent(next()!, "click");
    expect(screen.textContent).toContain(
      "no garantizan una respuesta de las autoridades",
    );
    await userEvent(next()!, "click");
    expect(screen.textContent).toContain("Si hay una ronda de presupuesto");
  });
});
