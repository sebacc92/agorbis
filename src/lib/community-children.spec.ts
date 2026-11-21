import { describe, expect, it, vi } from "vitest";
import {
  CHILDREN_PAGE,
  MAX_CHILDREN_ROUNDS,
  parentsWithChildren,
  type ChildrenClient,
} from "./community-children";

vi.mock("./log", () => ({ logFailure: vi.fn(), logEvent: vi.fn() }));

type Event = Parameters<typeof parentsWithChildren>[0];

function event(): Event {
  return {
    sharedMap: new Map<string, unknown>(),
    locale: () => "es",
    error: (status: number, message: string) =>
      Object.assign(new Error(message), { status }),
  } as unknown as Event;
}

/**
 * Base falsa: `children` dice cuántas hijas tiene cada padre. Responde como
 * PostgREST con `max_rows`: devuelve filas de los padres pedidos, en el orden
 * en que están, y nunca más de `limit`.
 */
function fakeDb(children: Record<string, number>) {
  const asked: string[][] = [];
  const from = vi.fn(() => {
    let ids: string[] = [];
    let limit = Infinity;
    const builder = {
      select: () => builder,
      in(_column: string, value: string[]) {
        ids = value;
        asked.push(value);
        return builder;
      },
      limit(value: number) {
        limit = value;
        return builder;
      },
      then<T>(
        resolve: (value: {
          data: { parent_id: string }[];
          error: null;
        }) => T,
      ) {
        const rows = ids.flatMap((id) =>
          Array.from({ length: children[id] ?? 0 }, () => ({ parent_id: id })),
        );
        return Promise.resolve({
          data: rows.slice(0, Math.min(limit, CHILDREN_PAGE)),
          error: null,
        }).then(resolve);
      },
    };
    return builder;
  });
  return { db: { from } as unknown as ChildrenClient, asked };
}

describe("parentsWithChildren", () => {
  it("no consulta nada sin padres", async () => {
    const { db, asked } = fakeDb({});
    expect(await parentsWithChildren(event(), db, "t", [])).toEqual(new Set());
    expect(asked).toHaveLength(0);
  });

  it("con menos de una página, una sola vuelta alcanza", async () => {
    const { db, asked } = fakeDb({ a: 3, c: 1 });
    const found = await parentsWithChildren(event(), db, "t", ["a", "b", "c"]);
    expect(found).toEqual(new Set(["a", "c"]));
    expect(asked).toHaveLength(1);
  });

  it("no pierde padres cuando las nietas pasan de mil", async () => {
    // El recorte de PostgREST se llevaba todo con las nietas de `a`: `b` y
    // `c` quedaban como hojas aunque tuvieran hijas.
    const { db, asked } = fakeDb({ a: 1200, b: 5, c: 2 });
    const found = await parentsWithChildren(event(), db, "t", [
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(found).toEqual(new Set(["a", "b", "c"]));
    expect(asked[1]).toEqual(["b", "c", "d"]);
  });

  it("si se agota el techo, los no resueltos quedan navegables", async () => {
    const heavy = Object.fromEntries(
      Array.from({ length: MAX_CHILDREN_ROUNDS + 2 }, (_, i) => [
        `p${i}`,
        CHILDREN_PAGE,
      ]),
    );
    const ids = Object.keys(heavy);
    const { db, asked } = fakeDb(heavy);
    const found = await parentsWithChildren(event(), db, "t", ids);
    expect(asked).toHaveLength(MAX_CHILDREN_ROUNDS);
    expect(found).toEqual(new Set(ids));
  });

  it("un error corta con 500 en vez de mostrar hojas", async () => {
    const from = vi.fn(() => {
      const builder = {
        select: () => builder,
        in: () => builder,
        limit: () => builder,
        then: <T>(resolve: (v: unknown) => T) =>
          Promise.resolve({ data: null, error: { message: "boom" } }).then(
            resolve,
          ),
      };
      return builder;
    });
    await expect(
      parentsWithChildren(
        event(),
        { from } as unknown as ChildrenClient,
        "t",
        ["a"],
      ),
    ).rejects.toMatchObject({ status: 500 });
  });
});
