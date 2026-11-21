import { describe, expect, it } from "vitest";
import { calendarDates, escapeCalendarText } from "./calendar";

describe("fechas de calendario", () => {
  it.each([
    ["2028-02-29", "20280229", "20280301"],
    ["2026-12-31", "20261231", "20270101"],
  ])("exporta %s como día completo con fin exclusivo", (day, start, end) => {
    expect(calendarDates(day, true)).toEqual({ start, end });
  });
  it("conserva el instante del cierre y la hora previa para encuestas", () => {
    expect(calendarDates("2026-10-22T21:00:00-03:00")).toEqual({
      start: "20261022T230000Z",
      end: "20261023T000000Z",
    });
  });
  it.each(["2026-02-30", "sin fecha", "2026-10-22T12:00:00Z"])(
    "rechaza un día inválido %s",
    (day) => {
      expect(calendarDates(day, true)).toBeNull();
    },
  );
  it("mantiene contenido ciudadano dentro de la propiedad de texto", () => {
    expect(
      escapeCalendarText("Plaza, árbol; vereda\\n\r\nSTATUS:CANCELLED"),
    ).toBe("Plaza\\, árbol\\; vereda\\\\n\\nSTATUS:CANCELLED");
  });
});
