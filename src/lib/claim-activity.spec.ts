import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markSeenClaimIds, readSeenClaimIds } from "./claim-activity";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
});
afterEach(() => vi.unstubAllGlobals());

describe("historial de tarjetas vistas", () => {
  it("no infiere reclamos vistos desde una fecha vieja o datos inválidos", () => {
    for (const raw of ["2026-10-01T12:00:00Z", "{bad", JSON.stringify({ version: 2, ids: [4] })]) {
      values.set("agorbis-last-visit-caba", raw);
      expect(readSeenClaimIds("caba")).toBeNull();
    }
  });

  it("registra sólo los IDs observados, sin marcar ocultos ni otra comunidad", () => {
    expect(markSeenClaimIds("caba", ["visible-a", "visible-a"])).toBe(true);
    expect(readSeenClaimIds("caba")).toEqual(["visible-a"]);
    expect(readSeenClaimIds("caba")).not.toContain("oculto-b");
    expect(readSeenClaimIds("la-plata")).toBeNull();
    markSeenClaimIds("caba", ["oculto-b"]);
    expect(readSeenClaimIds("caba")).toEqual(["visible-a", "oculto-b"]);
  });

  it("limita el historial reciente y conserva los IDs revisados más recientemente", () => {
    markSeenClaimIds("caba", Array.from({ length: 500 }, (_, index) => `claim-${index}`));
    markSeenClaimIds("caba", ["claim-0", "claim-500"]);
    const ids = readSeenClaimIds("caba")!;
    expect(ids).toHaveLength(500);
    expect(ids.slice(-2)).toEqual(["claim-0", "claim-500"]);
    expect(ids).not.toContain("claim-1");
  });

  it("no afirma guardar si el dispositivo lo rechaza", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("blocked"); } });
    expect(markSeenClaimIds("caba", ["claim-a"])).toBe(false);
    expect(readSeenClaimIds("caba")).toBeNull();
  });
});
