import { component$, useContextProvider, useSignal } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { PublicLocationPoint } from "~/lib/geolocation-privacy";
import { LocationCapture } from "./LocationCapture";

vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));

const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  const point = useSignal<PublicLocationPoint | null>(null);
  return (
    <>
      <LocationCapture locationText="" point={point} />
      <output>
        {point.value ? JSON.stringify(point.value) : "sin ubicación"}
      </output>
    </>
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("ubicación compartida con la revisión", () => {
  it("comparte sólo coordenadas públicas y las borra también del formulario al quitar", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: -38.0055274, longitude: -57.5426107 },
          } as GeolocationPosition),
      },
    });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    expect(screen.querySelector("output")?.textContent).toBe("sin ubicación");
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.querySelector("output")?.textContent).toBe(
      '{"lat":-38.006,"lng":-57.543}',
    );
    expect(
      screen.querySelector<HTMLInputElement>('input[name="lat"]')?.value,
    ).toBe("-38.006");
    expect(screen.textContent).not.toContain("-38.0055274");
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.querySelector("output")?.textContent).toBe("sin ubicación");
    expect(
      screen.querySelector<HTMLInputElement>('input[name="lat"]')?.value,
    ).toBe("");
    expect(
      screen.querySelector<HTMLInputElement>('input[name="lng"]')?.value,
    ).toBe("");
  });

  it("no inventa coordenadas cuando el navegador rechaza el permiso", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (
          _: PositionCallback,
          failure: PositionErrorCallback,
        ) => failure({ code: 1 } as GeolocationPositionError),
      },
    });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.textContent).toContain("No pudimos obtener tu ubicación.");
    expect(screen.querySelector("output")?.textContent).toBe("sin ubicación");
    expect(
      screen.querySelector<HTMLInputElement>('input[name="lat"]')?.value,
    ).toBe("");
    expect(
      screen.querySelector<HTMLInputElement>('input[name="lng"]')?.value,
    ).toBe("");
  });
});
