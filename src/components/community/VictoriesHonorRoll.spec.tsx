import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { shareNativeOrWhatsApp } from "~/lib/share";
import { VictoriesHonorRoll } from "./VictoriesHonorRoll";

vi.mock("~/lib/share", async (original) => ({
  ...(await original<typeof import("~/lib/share")>()),
  currentPageUrl: () =>
    "https://agorbis.test/c/barrio/victorias/?categoria=otro#lista",
  shareNativeOrWhatsApp: vi.fn(() => "native"),
}));
vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));
const titles = ["Esquina arreglada", "Luminaria repuesta"];
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider url="https://agorbis.test/c/barrio/victorias/">
      <VictoriesHonorRoll
        communityName="Barrio"
        communitySlug="barrio"
        victories={titles.map((title, i) => ({
          id: `claim-${i}`,
          title,
          supportCount: 3,
          solvedAt: "23/10/2026",
        }))}
      />
    </QwikRouterMockProvider>
  );
});
describe("victorias con destino propio", () => {
  it("cada título abre su reclamo y compartir conserva el mismo ID sin filtros de la comunidad", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const links = Array.from(screen.querySelectorAll("h4 a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/reclamos/claim-0",
      "/reclamos/claim-1",
    ]);
    for (let i = 0; i < titles.length; i++) {
      const button = screen.querySelector(
        `[aria-label="Compartir victoria: ${titles[i]}"]`,
      );
      await userEvent(button, "click");
      expect(shareNativeOrWhatsApp).toHaveBeenLastCalledWith({
        title: titles[i],
        text: expect.stringContaining(
          `https://agorbis.test/reclamos/claim-${i}`,
        ),
        url: `https://agorbis.test/reclamos/claim-${i}`,
      });
    }
  });
});
