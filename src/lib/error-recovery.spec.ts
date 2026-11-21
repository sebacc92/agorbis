import { describe, expect, it } from "vitest";
import {
  cameFromNavigation,
  hasRecovered,
  NAVIGATION_WINDOW_MS,
  RECOVERY_STATE_KEY,
  recoveryDecision,
  withRecoveredMark,
} from "./error-recovery";

const error = new Error("insertBefore");

describe("recoveryDecision", () => {
  it("sin error muestra el contenido", () => {
    expect(
      recoveryDecision({ error: undefined, navigating: true, alreadyRecovered: false }),
    ).toBe("content");
  });

  it("con error durante una navegación interna recarga una vez", () => {
    expect(
      recoveryDecision({ error, navigating: true, alreadyRecovered: false }),
    ).toBe("reload");
  });

  it("si esta entrada ya se recargó, muestra el aviso: recargar de nuevo sería un bucle", () => {
    expect(
      recoveryDecision({ error, navigating: true, alreadyRecovered: true }),
    ).toBe("fallback");
  });

  it("un error sin navegación es un error real de la página y se muestra", () => {
    expect(
      recoveryDecision({ error, navigating: false, alreadyRecovered: false }),
    ).toBe("fallback");
  });
});

describe("marca en history.state", () => {
  it("el router guarda null: sin marca no hay recuperación previa", () => {
    expect(hasRecovered(null)).toBe(false);
    expect(hasRecovered(undefined)).toBe(false);
    expect(hasRecovered({})).toBe(false);
    expect(hasRecovered("x")).toBe(false);
  });

  it("la marca se pone sin pisar lo que hubiera y se lee de vuelta", () => {
    const marked = withRecoveredMark({ scroll: 12 });
    expect(marked).toEqual({ scroll: 12, [RECOVERY_STATE_KEY]: true });
    expect(hasRecovered(marked)).toBe(true);
    expect(hasRecovered(withRecoveredMark(null))).toBe(true);
  });
});

describe("cameFromNavigation", () => {
  it("un cambio de ruta reciente cuenta", () => {
    expect(cameFromNavigation({ msSincePathChange: NAVIGATION_WINDOW_MS - 1 })).toBe(true);
    expect(cameFromNavigation({ msSincePathChange: 0 })).toBe(true);
  });

  it("con la ruta quieta hace rato, o sin ningún cambio, no; el límite es estricto", () => {
    expect(cameFromNavigation({ msSincePathChange: NAVIGATION_WINDOW_MS })).toBe(false);
    expect(cameFromNavigation({ msSincePathChange: NAVIGATION_WINDOW_MS + 1 })).toBe(false);
    expect(cameFromNavigation({ msSincePathChange: null })).toBe(false);
  });

  it("un valor negativo (reloj que retrocede) cuenta como reciente, sin romper", () => {
    expect(cameFromNavigation({ msSincePathChange: -5 })).toBe(true);
  });
});
