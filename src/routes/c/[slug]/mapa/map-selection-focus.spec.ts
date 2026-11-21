import { afterEach, describe, expect, it, vi } from "vitest";
import { focusSelectedMapClaim } from "./map-selection-focus";

afterEach(() => vi.unstubAllGlobals());

function fixture(desktop = false, appReduced = false, systemReduced = false) {
  const detail = { focus: vi.fn(), scrollIntoView: vi.fn() };
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: query === "(min-width: 64rem)" ? desktop : systemReduced,
    }),
  });
  vi.stubGlobal("document", {
    documentElement: { classList: { contains: () => appReduced } },
  });
  return detail;
}

describe("detalle elegido en el mapa móvil", () => {
  it("acerca y enfoca el panel apilado, conservando el margen de la cabecera", () => {
    const detail = fixture();
    focusSelectedMapClaim(detail as unknown as HTMLElement);
    expect(detail.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(detail.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it.each([
    [true, false],
    [false, true],
  ])("respeta movimiento reducido de la app o el sistema", (app, system) => {
    const detail = fixture(false, app, system);
    focusSelectedMapClaim(detail as unknown as HTMLElement);
    expect(detail.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "instant",
    });
  });

  it("conserva el foco de la lista en escritorio y tolera no tener detalle", () => {
    const detail = fixture(true);
    focusSelectedMapClaim(detail as unknown as HTMLElement);
    expect(detail.focus).not.toHaveBeenCalled();
    expect(detail.scrollIntoView).not.toHaveBeenCalled();
    expect(() => focusSelectedMapClaim(undefined)).not.toThrow();
  });
});
