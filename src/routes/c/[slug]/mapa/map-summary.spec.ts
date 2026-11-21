import { describe, expect, it } from "vitest";
import { mapClaimSummary } from "./map-summary";

describe("estados de los resultados cargados del mapa", () => {
  it("conserva todos los estados sin contar respuestas negativas como abiertas ni críticas", () => {
    const result = mapClaimSummary([
      { status: "open", support_count: 4 },
      { status: "under_review", support_count: 5 },
      { status: "acknowledged", support_count: 6 },
      { status: "in_progress", support_count: 8 },
      { status: "resolved", support_count: 20 },
      { status: "rejected", support_count: 20 },
    ]);
    expect(result.criticalPoints).toBe(3);
    expect(result.statusCounts).toEqual({
      open: 1,
      under_review: 1,
      acknowledged: 1,
      in_progress: 1,
      resolved: 1,
      rejected: 1,
    });
  });

  it("no convierte un estado desconocido o retirado con apoyos en foco crítico", () => {
    expect(
      mapClaimSummary([
        { status: "removed", support_count: 30 },
        { status: "unknown", support_count: 30 },
      ]).criticalPoints,
    ).toBe(0);
    expect(mapClaimSummary([])).toEqual({
      statusCounts: {},
      criticalPoints: 0,
    });
  });
});
