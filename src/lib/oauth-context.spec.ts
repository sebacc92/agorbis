import { describe, expect, it } from "vitest";
import { createOAuthContext, readOAuthContext } from "./oauth-context";

async function context() {
  const startedAt = new Date().toISOString();
  return createOAuthContext({ nonce: "nonce", provider: "google", intent: "login", next: "/perfil", startedAt,
    googleDecision: { version: "test-v1", contentHash: "a".repeat(64), locale: "es", startedAt } });
}

describe("contexto de una ceremonia OAuth", () => {
  it("vincula proveedor, destino, intención y decisión sin guardar el destino en la cookie", async () => {
    const original = await context();
    const marker = JSON.stringify(original);
    expect(marker).not.toContain("/perfil");
    expect(await readOAuthContext(marker, "nonce", "login", "/perfil")).toEqual(original);
    expect(await readOAuthContext(marker, "nonce", "register", "/perfil")).toBeNull();
    expect(await readOAuthContext(marker, "different", "login", "/perfil")).toBeNull();
    expect(await readOAuthContext(marker, "nonce", "login", "/otro")).toBeNull();
  });

  it.each([-601_000, 60_000])("rechaza timestamps fuera de la ventana (%i ms)", async (offset) => {
    const original = await context();
    original.startedAt = new Date(Date.now() + offset).toISOString();
    original.googleDecision!.startedAt = original.startedAt;
    expect(await readOAuthContext(JSON.stringify(original), "nonce", "login", "/perfil")).toBeNull();
  });

  it.each([undefined, { version: "test-v1" }, { version: "test-v1", contentHash: "a".repeat(64), locale: "xx" }])("rechaza una decisión incompleta o inválida", async (decision) => {
    const original = await context();
    expect(await readOAuthContext(JSON.stringify({ ...original, googleDecision: decision }), "nonce", "login", "/perfil")).toBeNull();
  });

  it("no puede atribuir a Facebook la decisión Google", async () => {
    const original = await context();
    expect(await readOAuthContext(JSON.stringify({ ...original, provider: "facebook" }), "nonce", "login", "/perfil")).toBeNull();
  });

  it.each([undefined, "", "{", "null", "x".repeat(2049)])("rechaza una marca inválida", async (marker) => {
    expect(await readOAuthContext(marker, "nonce", "login", "/perfil")).toBeNull();
  });
});
