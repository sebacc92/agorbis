import { describe, expect, it } from "vitest";
import {
  isQwikRouterUserResponseModule,
  sanitizePinnedQwikServerLogs,
} from "../../adapters/cloudflare-workers/qwik-log-sanitizer";

const PINNED_SOURCE = [
  'console.warn(`Redirect URL ${url} is invalid, fixing to ${fixedURL}`);',
  'console.error("JSON request error:", err);',
  'console.error(`Server function ${serverFnHash} failed:`, err);',
].join("\n");

describe("saneamiento de logs internos de Qwik en Workers", () => {
  it("reemplaza únicamente las tres firmas pineadas por marcadores fijos", () => {
    const output = sanitizePinnedQwikServerLogs(PINNED_SOURCE);
    expect(output).toContain("Qwik corrected an invalid redirect URL.");
    expect(output).toContain("Qwik JSON request failed.");
    expect(output).toContain("Qwik server function failed.");
    expect(output).not.toContain("${url}");
    expect(output).not.toContain("${serverFnHash}");
    expect(output).not.toContain(", err");
  });

  it("falla cerrado si falta, cambia o se duplica cualquier firma", () => {
    expect(() =>
      sanitizePinnedQwikServerLogs(PINNED_SOURCE.replace("JSON request", "JSON response")),
    ).toThrow(/0 coincidencias/);
    expect(() =>
      sanitizePinnedQwikServerLogs(`${PINNED_SOURCE}\n${PINNED_SOURCE}`),
    ).toThrow(/2 coincidencias/);
  });

  it("sólo reconoce el módulo exacto de la dependencia pineada", () => {
    expect(
      isQwikRouterUserResponseModule(
        "/repo/node_modules/@qwik.dev/router/lib/chunks/user-response.mjs?v=1",
      ),
    ).toBe(true);
    expect(
      isQwikRouterUserResponseModule(
        "/repo/node_modules/otra/lib/chunks/user-response.mjs",
      ),
    ).toBe(false);
  });
});
