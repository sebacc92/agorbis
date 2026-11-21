import type { RequestEventBase } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logFailure } from "~/lib/log";
import { supabase } from "~/lib/session";
import { loadMapClaims } from "./map-data";

vi.mock("~/lib/session", () => ({ supabase: vi.fn() }));
vi.mock("~/lib/log", () => ({ logFailure: vi.fn() }));
vi.mock("~/lib/request-id", () => ({ requestIdOf: vi.fn(() => "request-map-test") }));

function mockQueries(result: { data: unknown; error: unknown }, communityError: unknown = null) {
  const calls: [string, ...unknown[]][] = [];
  const list = {
    select: vi.fn((...args: unknown[]) => { calls.push(["select", ...args]); return list; }),
    eq: vi.fn((...args: unknown[]) => { calls.push(["eq", ...args]); return list; }),
    neq: vi.fn((...args: unknown[]) => { calls.push(["neq", ...args]); return list; }),
    in: vi.fn((...args: unknown[]) => { calls.push(["in", ...args]); return list; }),
    or: vi.fn((...args: unknown[]) => { calls.push(["or", ...args]); return list; }),
    order: vi.fn((...args: unknown[]) => { calls.push(["order", ...args]); return list; }),
    limit: vi.fn((...args: unknown[]) => { calls.push(["limit", ...args]); return Promise.resolve(result); }),
  };
  const community = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: communityError ? null : { id: "community-id" }, error: communityError }) }) }) };
  const db = { from: vi.fn((name: string) => name === "communities" ? community : list) };
  vi.mocked(supabase).mockReturnValue(db as unknown as ReturnType<typeof supabase>);
  return { calls, list, db };
}
const event = (query = "") => ({ url: new URL(`https://agorbis.test/c/barrio/mapa/${query}`), params: { slug: "barrio" } }) as unknown as RequestEventBase;

beforeEach(() => vi.clearAllMocks());

describe("carga del mapa", () => {
  it("aplica búsqueda literal, categoría y estado antes del límite, con orden estable", async () => {
    const rows = [{ id: "claim-a" }];
    const { calls, list } = mockQueries({ data: rows, error: null });
    const result = await loadMapClaims(event("?q=+Esquina.*%25_+&categoria=servicios&estado=abiertos"));
    expect(result).toMatchObject({ failed: false, claims: rows, filters: { query: "Esquina.*%_", category: "servicios", status: "abiertos" } });
    expect(list.or).toHaveBeenCalledWith('title.imatch."Esquina\\\\.\\\\*%_",location_text.imatch."Esquina\\\\.\\\\*%_"');
    expect(list.eq).toHaveBeenCalledWith("category", "servicios");
    expect(list.in).toHaveBeenCalledWith("status", ["open", "under_review", "acknowledged", "in_progress"]);
    expect(list.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(list.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(calls.at(-1)).toEqual(["limit", 100]);
    expect(logFailure).not.toHaveBeenCalled();
  });

  it.each(["claims", "community"])("distingue un error de %s de un mapa vacío y registra un request id", async (scope) => {
    const error = { code: "42501", message: "Permission denied" };
    mockQueries({ data: null, error: scope === "claims" ? error : null }, scope === "community" ? error : null);
    const result = await loadMapClaims(event("?q=Vereda&categoria=otro&estado=resueltos"));
    expect(result).toEqual({ failed: true, claims: [], filters: { query: "Vereda", category: "otro", status: "resueltos" } });
    expect(logFailure).toHaveBeenCalledExactlyOnceWith({ scope: "mapa/listado", requestId: "request-map-test" }, error);
  });

  it("un resultado vacío confirmado no se anuncia como error", async () => {
    const { list } = mockQueries({ data: [], error: null });
    const result = await loadMapClaims(event("?estado=resueltos"));
    expect(result.failed).toBe(false);
    expect(result.claims).toEqual([]);
    expect(list.eq).toHaveBeenCalledWith("status", "resolved");
    expect(logFailure).not.toHaveBeenCalled();
  });
});
