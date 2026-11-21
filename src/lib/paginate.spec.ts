import { describe, expect, it } from "vitest";
import { collectPages, type Page } from "./paginate";

/** Simula PostgREST: sirve `range(from, to)` pero nunca más de `maxRows`. */
function fakeTable(total: number, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = (from: number, to: number): Promise<Page<number>> => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows);
    return Promise.resolve({ data: rows.slice(from, end), error: null });
  };
  return { fetchPage, calls };
}

describe("collectPages", () => {
  it("junta todas las filas aunque el servidor corte en 1.000", async () => {
    const { fetchPage } = fakeTable(5882);

    const result = await collectPages(fetchPage, 50_000);

    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(5882);
    expect(result.rows.at(-1)).toBe(5881);
  });

  it("sigue juntando si el servidor corta en menos filas que la página pedida", async () => {
    const { fetchPage } = fakeTable(2500, 300);

    const result = await collectPages(fetchPage, 50_000);

    expect(result.rows).toHaveLength(2500);
  });

  it("no pide más allá del tope", async () => {
    const { fetchPage, calls } = fakeTable(5000);

    const result = await collectPages(fetchPage, 1200);

    expect(result.rows).toHaveLength(1200);
    expect(calls.at(-1)?.[1]).toBe(1199);
  });

  it("devuelve el error y corta en la primera página que falla", async () => {
    const failure = new Error("caída");
    let call = 0;
    const fetchPage = (from: number, to: number): Promise<Page<number>> => {
      call += 1;
      return Promise.resolve(
        call === 2
          ? { data: null, error: failure }
          : {
              data: Array.from({ length: to - from + 1 }, (_, i) => from + i),
              error: null,
            },
      );
    };

    const result = await collectPages(fetchPage, 50_000);

    expect(result.error).toBe(failure);
    expect(call).toBe(2);
  });

  it("una tabla vacía hace un solo pedido", async () => {
    const { fetchPage, calls } = fakeTable(0);

    const result = await collectPages(fetchPage, 50_000);

    expect(result.rows).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
