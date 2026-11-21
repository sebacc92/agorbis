import type { RequestEventLoader } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDebateColumns } from "./debate-form";
import { logFailure } from "./log";
import { supabase } from "./session";

vi.mock("./session", () => ({ supabase: vi.fn() }));
vi.mock("./log", () => ({ logFailure: vi.fn() }));
vi.mock("./request-id", () => ({
  requestIdOf: vi.fn(() => "request-debate-test"),
}));
const event = { locale: () => "es" } as unknown as RequestEventLoader;
function dbResult(result: unknown) {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve(result) }) }),
      }),
    }),
  };
  vi.mocked(supabase).mockReturnValue(
    db as unknown as ReturnType<typeof supabase>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe("columnas del formulario de debate", () => {
  it("distingue una consulta fallida de una comunidad sin columnas", async () => {
    const error = { message: "Unavailable", code: "503" };
    dbResult({ data: null, count: null, error });
    expect(await loadDebateColumns(event, "community")).toEqual({
      columns: [],
      childCount: 0,
      columnsFailed: true,
    });
    expect(logFailure).toHaveBeenCalledWith(
      { scope: "debate-form/columnas", requestId: "request-debate-test" },
      error,
    );
    dbResult({ data: [], count: 0, error: null });
    expect(await loadDebateColumns(event, "community")).toEqual({
      columns: [],
      childCount: 0,
      columnsFailed: false,
    });
  });
  it("conserva el conteo total y el orden público de las columnas recuperadas", async () => {
    dbResult({
      data: [
        { id: "b", name: "Zárate", emoji: null },
        { id: "a", name: "Álava", emoji: null },
      ],
      count: 52,
      error: null,
    });
    const result = await loadDebateColumns(event, "community");
    expect(result.columns.map((row) => row.id)).toEqual(["a", "b"]);
    expect(result.childCount).toBe(52);
    expect(result.columnsFailed).toBe(false);
    expect(logFailure).not.toHaveBeenCalled();
  });
});
