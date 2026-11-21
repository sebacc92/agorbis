import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { BeforeAfterSlider } from "./BeforeAfterSlider";

vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));
vi.mock("~/components/ui/ConfettiCelebration", () => ({ triggerCivicConfetti: vi.fn() }));

const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  return <BeforeAfterSlider beforeUrl="/before.png" afterUrl="/after.png" />;
});

describe("comparación antes y después", () => {
  it("los botones muestran la imagen que nombran y comunican su selección", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const buttons = Array.from(screen.querySelectorAll("button"));
    const before = buttons.find((b) => b.textContent?.includes("Solo Antes"))!;
    const after = buttons.find((b) => b.textContent?.includes("Solo Solución"))!;
    const range = screen.querySelector("input[type=range]")!;
    const overlay = screen.querySelector('img[src="/after.png"]')!.parentElement!;

    await userEvent(before, "click");
    expect(before.getAttribute("aria-pressed")).toBe("true");
    expect(range.getAttribute("aria-valuetext")).toBe("Antes 100% · Después 0%");
    expect(overlay.getAttribute("style")).toContain("100%");
    expect(screen.querySelector("[data-before-label]")).toBeTruthy();

    await userEvent(after, "click");
    expect(after.getAttribute("aria-pressed")).toBe("true");
    expect(before.getAttribute("aria-pressed")).toBe("false");
    expect(range.getAttribute("aria-valuetext")).toBe("Antes 0% · Después 100%");
    expect(overlay.getAttribute("style")).toContain("0%");
    expect(screen.querySelector("[data-before-label]")).toBeFalsy();
  });
});
