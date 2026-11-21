import type { RequestEventBase } from "@qwik.dev/router";
import { describe, expect, it } from "vitest";
import { ensureRequestId, requestIdOf } from "./request-id";

describe("request id", () => {
  it("genera un UUID y lo conserva durante todo el request", () => {
    const ev = { sharedMap: new Map() } as unknown as RequestEventBase;
    const first = ensureRequestId(ev);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(ensureRequestId(ev)).toBe(first);
    expect(requestIdOf(ev)).toBe(first);
  });
});
