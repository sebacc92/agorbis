import { describe, expect, it, vi } from "vitest";
import type { ChildrenClient } from "./community-children";
import { communitySlugFromRoute } from "./community";
import {
  COMMUNITY_DIRECTORY_PAGE_SIZE,
  communityDirectoryHref,
  loadChildDirectory,
  readCommunityDirectoryFilters,
} from "./community-directory";

vi.mock("./log", () => ({ logFailure: vi.fn(), logEvent: vi.fn() }));

type Row = { id: string; name: string; parent_id: string };
type Event = Parameters<typeof loadChildDirectory>[0];
const event = () =>
  ({
    sharedMap: new Map(),
    locale: () => "es",
    error: (status: number, message: string) =>
      Object.assign(new Error(message), { status }),
  }) as unknown as Event;

function fakeDb(rows: Row[], failed = false) {
  const operations: string[] = [];
  let result = [...rows];
  const ordering: string[] = [];
  const builder = {
    select() {
      return builder;
    },
    eq(column: keyof Row, value: string) {
      result = result.filter((row) => row[column] === value);
      return builder;
    },
    filter(column: keyof Row, operator: string, pattern: string) {
      operations.push("filter");
      expect(operator).toBe("imatch");
      result = result.filter((row) =>
        new RegExp(pattern, "i").test(row[column]),
      );
      return builder;
    },
    order(column: keyof Row) {
      ordering.push(column);
      return builder;
    },
    range(start: number, end: number) {
      operations.push("range");
      result.sort((a, b) => {
        for (const column of ordering as (keyof Row)[]) {
          if (a[column] !== b[column]) return a[column] < b[column] ? -1 : 1;
        }
        return 0;
      });
      result = result.slice(start, end + 1);
      return builder;
    },
    then<T>(
      resolve: (value: {
        data: Row[] | null;
        error: { message: string } | null;
      }) => T,
    ) {
      return Promise.resolve({
        data: failed ? null : result,
        error: failed ? { message: "offline" } : null,
      }).then(resolve);
    },
  };
  return {
    db: { from: () => builder } as unknown as ChildrenClient,
    operations,
  };
}

describe("directorio completo de sub-comunidades", () => {
  it.each([
    "/c/barrio/sub/?q=Centro&pagina=2",
    "/c/barrio/encuestas/?categoria=ambiente&antes=2020-01-01T00%3A00%3A00Z&id=00000000-0000-4000-8000-000000000001",
  ])(
    "conserva la comunidad cuando el loader normaliza la query y vacía params: %s",
    (path) => {
      expect(
        communitySlugFromRoute({}, new URL(path, "https://agorbis.test")),
      ).toBe("barrio");
    },
  );

  it("encuentra literalmente nombres posteriores al antiguo recorte y sólo dentro de la comunidad", async () => {
    const query = 'Z destino .*%_ "A&B" \\';
    const rows = Array.from({ length: 330 }, (_, i) => ({
      id: String(i).padStart(4, "0"),
      name: `A ${i}`,
      parent_id: "parent",
    }));
    rows.push(
      { id: "target", name: query, parent_id: "parent" },
      { id: "foreign", name: query, parent_id: "other" },
      { id: "wildcard", name: 'Z destino ABC "A&B"', parent_id: "parent" },
    );
    const { db, operations } = fakeDb(rows);
    const result = await loadChildDirectory(event(), db, "parent", {
      query,
      page: 1,
    });
    expect(result.children.map((row) => row.id)).toEqual(["target"]);
    expect(operations).toEqual(["filter", "range"]);
    expect(result.hasMore).toBe(false);
  });

  it("pagina más allá de 300 y desempata nombres iguales sin perder filas", async () => {
    const rows = Array.from({ length: 330 }, (_, i) => ({
      id: String(329 - i).padStart(4, "0"),
      name: "Mismo nombre",
      parent_id: "parent",
    }));
    const loaded: string[] = [];
    for (let page = 1; page <= 14; page++) {
      const { db } = fakeDb(rows);
      const result = await loadChildDirectory(event(), db, "parent", {
        query: "",
        page,
      });
      expect(result.children).toHaveLength(
        page === 14 ? 18 : COMMUNITY_DIRECTORY_PAGE_SIZE,
      );
      expect(result.hasMore).toBe(page < 14);
      loaded.push(...result.children.map((row) => row.id));
    }
    expect(loaded).toEqual([...rows.map((row) => row.id)].sort());
    expect(new Set(loaded).size).toBe(330);
  });

  it("una página completa sin fila extra no ofrece continuación; un fallo no se vuelve vacío", async () => {
    const rows = Array.from(
      { length: COMMUNITY_DIRECTORY_PAGE_SIZE },
      (_, i) => ({ id: String(i), name: "Centro", parent_id: "parent" }),
    );
    expect(
      (
        await loadChildDirectory(event(), fakeDb(rows).db, "parent", {
          query: "",
          page: 1,
        })
      ).hasMore,
    ).toBe(false);
    await expect(
      loadChildDirectory(event(), fakeDb([], true).db, "parent", {
        query: "",
        page: 1,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("normaliza páginas y conserva el nombre al avanzar o volver al principio", () => {
    expect(
      readCommunityDirectoryFilters(
        new URLSearchParams("q=+Centro+&pagina=-2"),
      ),
    ).toEqual({ query: "Centro", page: 1 });
    expect(
      readCommunityDirectoryFilters(
        new URLSearchParams({ q: "x".repeat(121), pagina: "999999" }),
      ),
    ).toEqual({ query: "x".repeat(120), page: 10000 });
    const query = '.*%_ "A&B"';
    expect(
      Object.fromEntries(
        new URL(communityDirectoryHref(query, 14), "https://agorbis.test")
          .searchParams,
      ),
    ).toEqual({ q: query, pagina: "14" });
    expect(
      new URL(
        communityDirectoryHref(query),
        "https://agorbis.test",
      ).searchParams.has("pagina"),
    ).toBe(false);
  });
});
