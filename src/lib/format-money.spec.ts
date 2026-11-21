import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("importes públicos con sus centavos", () => {
  it("mantiene la presentación de los enteros", () => {
    expect(formatMoney(2500, "USD", "en")).toBe("$2,500");
    expect(formatMoney(2500, "ARS", "es")).toMatch(/2\.500$/);
  });
  it("muestra los dos centavos sin redondear el importe a una unidad", () => {
    expect(formatMoney(2500.5, "USD", "en")).toBe("$2,500.50");
    expect(formatMoney(2500.5, "ARS", "es")).toMatch(/2\.500,50$/);
    expect(formatMoney(0.01, "USD", "en")).toBe("$0.01");
  });
});
