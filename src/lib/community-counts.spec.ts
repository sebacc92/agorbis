import { describe, expect, it } from "vitest";
import { communityCount, sumCommunityCounts } from "./community-counts";

describe("conteos comunitarios conocidos", () => {
  it("no convierte el error en cero aunque el cliente entregue un conteo", () => {
    expect(
      communityCount({ count: null, error: { code: "XX000" } }),
    ).toBeNull();
    expect(communityCount({ count: 0, error: { code: "XX000" } })).toBeNull();
    expect(communityCount({ count: 8, error: { code: "XX000" } })).toBeNull();
  });
  it("reserva cero a una lectura correcta y rechaza conteos ausentes o inválidos", () => {
    expect(communityCount({ count: 0, error: null })).toBe(0);
    expect(communityCount({ count: 8, error: null })).toBe(8);
    for (const count of [null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(communityCount({ count, error: null })).toBeNull();
    }
  });
  it("un agregado desconocido no afirma participación nula ni parcial", () => {
    expect(sumCommunityCounts(4, null, 2)).toBeNull();
    expect(sumCommunityCounts(0, 0, 0)).toBe(0);
    expect(sumCommunityCounts(4, 1, 2)).toBe(7);
  });
});
