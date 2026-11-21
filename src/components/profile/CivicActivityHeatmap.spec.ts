import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  dayKeyInZone,
  mondayBasedWeekday,
  heatmapNextIndex,
} from "./CivicActivityHeatmap";

describe("dayKeyInZone", () => {
  it("usa el día civil de la zona, no el día UTC", () => {
    // 01:30 UTC del 5 de abril son las 22:30 del 4 en Buenos Aires.
    const instant = "2026-04-05T01:30:00Z";
    expect(dayKeyInZone(instant, "UTC")).toBe("2026-04-05");
    expect(dayKeyInZone(instant, "America/Argentina/Buenos_Aires")).toBe(
      "2026-04-04",
    );
    // Y en la otra punta del mundo el desfase va para el otro lado.
    expect(dayKeyInZone("2026-04-04T13:00:00Z", "Pacific/Auckland")).toBe(
      "2026-04-05",
    );
  });

  it("acepta Date y descarta fechas inválidas", () => {
    expect(dayKeyInZone(new Date("2026-10-21T12:00:00Z"), "UTC")).toBe(
      "2026-10-21",
    );
    expect(dayKeyInZone("no es una fecha", "UTC")).toBe("");
  });
});

describe("recorrido del mapa de actividad", () => {
  it("recorre días y semanas sin salir del período disponible", () => {
    expect(heatmapNextIndex(10, "ArrowUp", 108)).toBe(9);
    expect(heatmapNextIndex(10, "ArrowDown", 108)).toBe(11);
    expect(heatmapNextIndex(10, "ArrowLeft", 108)).toBe(3);
    expect(heatmapNextIndex(10, "ArrowRight", 108)).toBe(17);
    expect(heatmapNextIndex(0, "ArrowUp", 108)).toBe(0);
    expect(heatmapNextIndex(108, "ArrowRight", 108)).toBe(108);
    expect(heatmapNextIndex(10, "Home", 108)).toBe(7);
    expect(heatmapNextIndex(108, "End", 108)).toBe(108);
    expect(heatmapNextIndex(10, "Home", 108, true)).toBe(0);
    expect(heatmapNextIndex(10, "End", 108, true)).toBe(108);
    expect(heatmapNextIndex(10, "Tab", 108)).toBe(10);
  });
});

describe("addDaysToKey", () => {
  it("cruza meses, años y bisiestos", () => {
    expect(addDaysToKey("2026-10-21", -1)).toBe("2026-10-20");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToKey("2026-10-21", -111)).toBe("2026-07-02");
  });

  it("no se corre con los cambios de horario", () => {
    // Fin del horario de verano en Europa (25-oct-2026) y en Chile (abril).
    expect(addDaysToKey("2026-10-26", -1)).toBe("2026-10-25");
    expect(addDaysToKey("2026-04-05", -1)).toBe("2026-04-04");
  });
});

describe("mondayBasedWeekday", () => {
  it("numera de lunes (0) a domingo (6)", () => {
    expect(mondayBasedWeekday("2026-10-19")).toBe(0); // lunes
    expect(mondayBasedWeekday("2026-10-21")).toBe(2); // miércoles
    expect(mondayBasedWeekday("2026-10-25")).toBe(6); // domingo
  });
});
