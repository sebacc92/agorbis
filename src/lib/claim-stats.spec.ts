import { describe, expect, it, vi } from "vitest";
import {
  OPEN_CLAIM_STATUSES,
  categoryClaimTallies,
  claimTally,
  communityClaimTallies,
  exactCount,
  makeTally,
  resolutionRate,
  type CountClient,
} from "./claim-stats";
import { CLAIM_CATEGORIES } from "./constants";

vi.mock("./log", () => ({ logFailure: vi.fn() }));

type Event = Parameters<typeof exactCount>[0];

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function event(): Event {
  return {
    sharedMap: new Map<string, unknown>(),
    locale: () => "es",
    error: (status: number, message: string) => new HttpError(status, message),
  } as unknown as Event;
}

interface Recorded {
  table: string;
  select: { columns: string; options: unknown };
  filters: [string, string, unknown][];
}

/**
 * Cliente falso: registra cada cadena de filtros y responde con el conteo que
 * decida `respond` a partir de esos filtros. Así los tests verifican qué se
 * le pregunta a la base y no sólo qué se hace con la respuesta.
 */
function fakeDb(
  respond: (q: Recorded) => {
    count: number | null;
    error: { message: string } | null;
  },
) {
  const calls: Recorded[] = [];
  const from = vi.fn((table: string) => {
    const recorded: Recorded = {
      table,
      select: { columns: "", options: undefined },
      filters: [],
    };
    calls.push(recorded);
    const builder = {
      select(columns: string, options: unknown) {
        recorded.select = { columns, options };
        return builder;
      },
      eq(column: string, value: unknown) {
        recorded.filters.push(["eq", column, value]);
        return builder;
      },
      neq(column: string, value: unknown) {
        recorded.filters.push(["neq", column, value]);
        return builder;
      },
      in(column: string, value: unknown) {
        recorded.filters.push(["in", column, value]);
        return builder;
      },
      then<T>(resolve: (value: ReturnType<typeof respond>) => T) {
        return Promise.resolve(respond(recorded)).then(resolve);
      },
    };
    return builder;
  });
  return { db: { from } as unknown as CountClient, calls };
}

function filter(q: Recorded, op: string, column: string) {
  return q.filters.find(([o, c]) => o === op && c === column)?.[2];
}

/** Respuestas por (comunidad, categoría, alcance), con cero por defecto. */
function countsBy(
  table: Record<string, { visible: number; resolved: number; open: number }>,
) {
  return (q: Recorded) => {
    const community = String(filter(q, "eq", "community_id"));
    const category = filter(q, "eq", "category");
    const key = category ? `${community}/${String(category)}` : community;
    const row = table[key] ?? { visible: 0, resolved: 0, open: 0 };
    if (filter(q, "eq", "status") === "resolved")
      return { count: row.resolved, error: null };
    if (filter(q, "in", "status")) return { count: row.open, error: null };
    return { count: row.visible, error: null };
  };
}

describe("resolutionRate", () => {
  it("no divide por cero ni inventa un porcentaje sin reclamos", () => {
    expect(resolutionRate(0, 0)).toBe(0);
  });

  it("redondea al entero más cercano", () => {
    expect(resolutionRate(1, 3)).toBe(33);
    expect(resolutionRate(2, 3)).toBe(67);
    expect(resolutionRate(5, 5)).toBe(100);
  });

  it("makeTally calcula la tasa con el total, no con abiertos + resueltos", () => {
    // 10 publicados: 4 resueltos, 4 abiertos y 2 rechazados.
    expect(makeTally(10, 4, 4)).toEqual({
      total: 10,
      resolved: 4,
      open: 4,
      rate: 40,
    });
  });
});

describe("exactCount", () => {
  it("devuelve el conteo cuando PostgREST contó", async () => {
    await expect(
      exactCount(event(), "x", Promise.resolve({ count: 1500, error: null })),
    ).resolves.toBe(1500);
  });

  it("un error no es cero: corta con 500", async () => {
    await expect(
      exactCount(
        event(),
        "x",
        Promise.resolve({ count: null, error: { message: "boom" } }),
      ),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("un conteo ausente tampoco es cero", async () => {
    await expect(
      exactCount(event(), "x", Promise.resolve({ count: null, error: null })),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe("claimTally", () => {
  it("cuenta en la base sin traer filas y con los filtros de cada alcance", async () => {
    const { db, calls } = fakeDb(
      countsBy({ c1: { visible: 1500, resolved: 600, open: 800 } }),
    );

    const tally = await claimTally(event(), db, "t", "c1");

    // Más de mil: con filas crudas PostgREST habría cortado en 1000.
    expect(tally).toEqual({ total: 1500, resolved: 600, open: 800, rate: 40 });
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.table).toBe("claims");
      expect(call.select.options).toEqual({ count: "exact", head: true });
      expect(filter(call, "eq", "community_id")).toBe("c1");
    }
    const [visible, resolved, open] = calls;
    expect(filter(visible!, "neq", "status")).toBe("removed");
    expect(filter(resolved!, "eq", "status")).toBe("resolved");
    // Los rechazados no son "en curso".
    expect(filter(open!, "in", "status")).toEqual([...OPEN_CLAIM_STATUSES]);
    expect(OPEN_CLAIM_STATUSES).not.toContain("rejected");
    expect(OPEN_CLAIM_STATUSES).not.toContain("resolved");
  });

  it("filtra por categoría cuando se pide", async () => {
    const { db, calls } = fakeDb(
      countsBy({ "c1/salud": { visible: 3, resolved: 1, open: 2 } }),
    );
    const tally = await claimTally(event(), db, "t", "c1", "salud");
    expect(tally.total).toBe(3);
    for (const call of calls) {
      expect(filter(call, "eq", "category")).toBe("salud");
    }
  });

  it("si un conteo falla, falla todo en vez de mostrar un parcial", async () => {
    const { db } = fakeDb((q) =>
      filter(q, "eq", "status") === "resolved"
        ? { count: null, error: { message: "timeout" } }
        : { count: 10, error: null },
    );
    await expect(claimTally(event(), db, "t", "c1")).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("categoryClaimTallies", () => {
  it("desglosa por cada categoría y suma el total general", async () => {
    const { db, calls } = fakeDb(
      countsBy({
        "c1/infraestructura": { visible: 900, resolved: 300, open: 500 },
        "c1/salud": { visible: 700, resolved: 500, open: 150 },
      }),
    );

    const { overall, byCategory } = await categoryClaimTallies(
      event(),
      db,
      "rendicion",
      "c1",
    );

    expect(calls).toHaveLength(CLAIM_CATEGORIES.length * 3);
    expect(byCategory.map((c) => c.key)).toEqual(
      CLAIM_CATEGORIES.map((c) => c.key),
    );
    expect(byCategory.find((c) => c.key === "salud")).toMatchObject({
      total: 700,
      resolved: 500,
      open: 150,
      rate: 71,
    });
    expect(byCategory.find((c) => c.key === "otro")).toMatchObject({
      total: 0,
      rate: 0,
    });
    expect(overall).toEqual({
      total: 1600,
      resolved: 800,
      open: 650,
      rate: 50,
    });
  });
});

describe("communityClaimTallies", () => {
  it("devuelve un conteo por comunidad, sin mezclar", async () => {
    const { db } = fakeDb(
      countsBy({
        a: { visible: 2000, resolved: 1000, open: 900 },
        b: { visible: 4, resolved: 1, open: 3 },
      }),
    );
    const tallies = await communityClaimTallies(event(), db, "comp", [
      "a",
      "b",
      "c",
    ]);
    expect(tallies.get("a")).toEqual({
      total: 2000,
      resolved: 1000,
      open: 900,
      rate: 50,
    });
    expect(tallies.get("b")?.rate).toBe(25);
    expect(tallies.get("c")).toEqual({ total: 0, resolved: 0, open: 0, rate: 0 });
  });
});
