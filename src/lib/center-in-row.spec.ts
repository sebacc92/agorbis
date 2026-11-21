import { describe, expect, it, vi } from "vitest";
import { centerInRow } from "./center-in-row";

type Box = { left: number; width: number };

/** Una fila deslizable y su chip, con las medidas que el navegador daría. */
function fakeRow(options: {
  row: Box;
  scrollWidth: number;
  scrollLeft?: number;
  chip?: Box;
}) {
  const chip = options.chip && {
    getBoundingClientRect: () => options.chip,
    scrollIntoView: vi.fn(),
  };
  const row = {
    scrollWidth: options.scrollWidth,
    clientWidth: options.row.width,
    scrollLeft: options.scrollLeft ?? 0,
    getBoundingClientRect: () => options.row,
    querySelector: vi.fn(() => chip ?? null),
    scrollTo: vi.fn(),
  };
  return { row: row as unknown as HTMLElement, spy: row, chip };
}

describe("centerInRow", () => {
  it("centra el chip moviendo sólo la fila, nunca la página", () => {
    // Arrange
    const { row, spy, chip } = fakeRow({
      row: { left: 16, width: 358 },
      scrollWidth: 900,
      chip: { left: 616, width: 100 },
    });

    // Act
    centerInRow(row, "[aria-current]");

    // Assert
    expect(spy.querySelector).toHaveBeenCalledWith("[aria-current]");
    expect(spy.scrollTo).toHaveBeenCalledExactlyOnceWith({
      left: 471,
      behavior: "auto",
    });
    expect(chip?.scrollIntoView).not.toHaveBeenCalled();
  });

  it("parte del desplazamiento que la fila ya tiene", () => {
    const { row, spy } = fakeRow({
      row: { left: 0, width: 300 },
      scrollWidth: 900,
      scrollLeft: 200,
      chip: { left: 250, width: 100 },
    });

    centerInRow(row, "[aria-current]");

    expect(spy.scrollTo).toHaveBeenCalledExactlyOnceWith({
      left: 350,
      behavior: "auto",
    });
  });

  it("no mueve una fila que entra entera", () => {
    const { row, spy } = fakeRow({
      row: { left: 0, width: 600 },
      scrollWidth: 600,
      chip: { left: 500, width: 80 },
    });

    centerInRow(row, "[aria-current]");

    expect(spy.scrollTo).not.toHaveBeenCalled();
  });

  it("no mueve una fila sin medidas, como la del DOM de pruebas", () => {
    const row = { querySelector: vi.fn(), scrollTo: vi.fn() };

    centerInRow(row as unknown as HTMLElement, "[aria-current]");

    expect(row.scrollTo).not.toHaveBeenCalled();
  });

  it("no hace nada sin fila o sin chip elegido", () => {
    const { row, spy } = fakeRow({
      row: { left: 0, width: 300 },
      scrollWidth: 900,
    });

    centerInRow(undefined, "[aria-current]");
    centerInRow(row, "[aria-current]");

    expect(spy.scrollTo).not.toHaveBeenCalled();
  });
});
