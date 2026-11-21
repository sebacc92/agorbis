import { describe, expect, it } from "vitest";
import { parseProjectBudgetInput } from "./project-budget-input";

describe("presupuestos escritos en el idioma del formulario", () => {
  it.each([
    ["es", "2.500,50", "2500.50", 2500.5],
    ["es", "2500,5", "2500.5", 2500.5],
    ["es", "2.500", "2500", 2500],
    ["es", "0,01", "0.01", 0.01],
    ["es", "0002,50", "2.50", 2.5],
    ["en", "2,500.50", "2500.50", 2500.5],
    ["en", "2500.5", "2500.5", 2500.5],
    ["en", "2,500", "2500", 2500],
    ["en", "0.01", "0.01", 0.01],
    ["es", "999.999.999.999,99", "999999999999.99", 999999999999.99],
  ] as const)("convierte %s %s a decimal canónico sin cambiar su magnitud", (locale, raw, canonical, amount) => {
    expect(parseProjectBudgetInput(raw, locale)).toEqual({ valid: true, canonical, amount });
  });

  it.each(["", "   ", "\t\n"])("mantiene opcional un presupuesto vacío: %j", (raw) => {
    expect(parseProjectBudgetInput(raw, "es")).toEqual({ valid: true, canonical: "", amount: null });
  });

  it.each([
    ["es", "2,500.50"], ["es", "2500.50"], ["es", "2.50"],
    ["es", "2.500,501"], ["es", "2 500,50"], ["es", "$2.500,50"],
    ["en", "2.500,50"], ["en", "2,50"], ["en", "2,500.501"],
    ["en", "1e6"], ["en", "Infinity"], ["en", "2,500."],
  ] as const)("rechaza %s %s antes de interpretar separadores o redondear", (locale, raw) => {
    expect(parseProjectBudgetInput(raw, locale)).toEqual({ valid: false, reason: "format" });
  });

  it.each(["0", "0,00", "-2.500,50"])("explica que el importe %s debe ser positivo", (raw) => {
    expect(parseProjectBudgetInput(raw, "es")).toEqual({ valid: false, reason: "positive" });
  });

  it("no deja superar numeric(14,2) y conserva el mayor importe permitido", () => {
    expect(parseProjectBudgetInput("1.000.000.000.000", "es")).toEqual({ valid: false, reason: "range" });
    expect(parseProjectBudgetInput("999,999,999,999.99", "en")).toMatchObject({ valid: true, canonical: "999999999999.99" });
  });
});
