import { describe, expect, it } from "vitest";
import {
  createD72CanaryCapability,
  D72_CANARY_CAPABILITY_LIMITS,
  D72_CANARY_CAPABILITY_SCHEMA,
  parseAgorbisVersionOverride,
  verifyD72CanaryCapability,
} from "./d72-canary-capability";

const SECRET = "fixture-cron-secret-0123456789abcdef0123456789abcdef";
const VERSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-08-31T18:00:00.000Z");

function binding(overrides: Record<string, string> = {}) {
  return {
    artifactHash: "a".repeat(64),
    expiresAtUtc: "2026-08-31T18:10:00.000Z",
    head: "b".repeat(40),
    issuedAtUtc: "2026-08-31T18:00:00.000Z",
    nonce: "c".repeat(64),
    policyHash: "d".repeat(64),
    requestHash: "e".repeat(64),
    schemaVersion: D72_CANARY_CAPABILITY_SCHEMA,
    versionId: VERSION_ID,
    ...overrides,
  };
}

describe("D72 canary capability", () => {
  it("firma y verifica únicamente el binding canónico vigente", async () => {
    const token = await createD72CanaryCapability({
      binding: binding(),
      secret: SECRET,
      now: NOW,
    });

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(SECRET);
    await expect(
      verifyD72CanaryCapability({
        token,
        secret: SECRET,
        expectedVersionId: VERSION_ID,
        now: new Date("2026-08-31T18:09:59.999Z"),
      }),
    ).resolves.toEqual(binding());
  });

  it("rechaza modificación, clave o Version ID distintos", async () => {
    const token = await createD72CanaryCapability({
      binding: binding(),
      secret: SECRET,
      now: NOW,
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    for (const candidate of [
      { token: tampered, secret: SECRET, expectedVersionId: VERSION_ID },
      {
        token,
        secret: `${SECRET}-different`,
        expectedVersionId: VERSION_ID,
      },
      {
        token,
        secret: SECRET,
        expectedVersionId: "223e4567-e89b-42d3-a456-426614174000",
      },
    ]) {
      await expect(
        verifyD72CanaryCapability({ ...candidate, now: NOW }),
      ).resolves.toBeNull();
    }
  });

  it("rechaza expiración, emisión futura y ventanas mayores a veinte minutos", async () => {
    const token = await createD72CanaryCapability({
      binding: binding(),
      secret: SECRET,
      now: NOW,
    });
    await expect(
      verifyD72CanaryCapability({
        token,
        secret: SECRET,
        expectedVersionId: VERSION_ID,
        now: new Date("2026-08-31T18:10:00.000Z"),
      }),
    ).resolves.toBeNull();

    await expect(
      createD72CanaryCapability({
        binding: binding({
          issuedAtUtc: "2026-08-31T18:00:31.000Z",
          expiresAtUtc: "2026-08-31T18:10:31.000Z",
        }),
        secret: SECRET,
        now: NOW,
      }),
    ).rejects.toThrow(/EXPIRED/);

    await expect(
      createD72CanaryCapability({
        binding: binding({ expiresAtUtc: "2026-08-31T18:20:00.001Z" }),
        secret: SECRET,
        now: NOW,
      }),
    ).rejects.toThrow(/BINDING_INVALID/);
    expect(D72_CANARY_CAPABILITY_LIMITS.maxLifetimeMs).toBe(20 * 60 * 1000);
  });

  it("rechaza payload no canónico, tamaños y claves inválidas sin filtrar datos", async () => {
    await expect(
      createD72CanaryCapability({
        binding: { ...binding(), extra: "forbidden" },
        secret: SECRET,
        now: NOW,
      }),
    ).rejects.toThrow("D72_CANARY_BINDING_INVALID");

    for (const token of [
      "",
      "v1.not_base64!.signature",
      `v1.${"a".repeat(D72_CANARY_CAPABILITY_LIMITS.maxBytes)}.b`,
      "v1.a.b\r\nInjected: value",
    ]) {
      await expect(
        verifyD72CanaryCapability({
          token,
          secret: SECRET,
          expectedVersionId: VERSION_ID,
          now: NOW,
        }),
      ).resolves.toBeNull();
    }

    await expect(
      createD72CanaryCapability({
        binding: binding(),
        secret: "short",
        now: NOW,
      }),
    ).rejects.toThrow("D72_CANARY_KEY_UNAVAILABLE");
  });

  it("acepta exclusivamente el selector exacto del Worker agorbis", () => {
    expect(parseAgorbisVersionOverride(`agorbis="${VERSION_ID}"`)).toBe(
      VERSION_ID,
    );
    for (const value of [
      VERSION_ID,
      `other="${VERSION_ID}"`,
      `agorbis="${VERSION_ID}",other="${VERSION_ID}"`,
      ` agorbis="${VERSION_ID}"`,
      `agorbis="${VERSION_ID}"\r\nX-Test: injected`,
    ]) {
      expect(parseAgorbisVersionOverride(value)).toBeNull();
    }
  });
});
