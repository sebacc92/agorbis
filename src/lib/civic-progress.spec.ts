import { describe, expect, it } from "vitest";
import { civicProgress } from "./civic-progress";

describe("progreso cívico real", () => {
  it.each([
    [0, 1, 0, 5],
    [4, 1, 80, 5],
    [5, 2, 0, 10],
    [9, 2, 80, 10],
    [10, 3, 0, 25],
    [24, 3, 93, 25],
    [25, 4, 100, null],
    [50, 4, 100, null],
  ])(
    "%s acciones produce nivel %s y progreso %s",
    (total, level, percent, nextThreshold) => {
      expect(civicProgress(total!)).toMatchObject({
        level,
        percent,
        nextThreshold,
      });
    },
  );

  it("no atribuye avance a un valor inválido", () => {
    for (const value of [-3, NaN, Infinity])
      expect(civicProgress(value).percent).toBe(0);
  });
});
