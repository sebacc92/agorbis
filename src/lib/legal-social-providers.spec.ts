import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("avisos de proveedores sociales", () => {
  it("no incluye Facebook si sólo está habilitado Google", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    vi.stubEnv("PUBLIC_FACEBOOK_AUTH_ENABLED", "false");
    const { PROCESSOR_DISCLOSURES } = await import("./legal");
    expect(PROCESSOR_DISCLOSURES.some(({ name }) => name === "Google")).toBe(true);
    expect(PROCESSOR_DISCLOSURES.some(({ name }) => name === "Meta / Facebook")).toBe(false);
  });

  it("incluye Facebook con destinos pendientes sin inventar ubicaciones", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "false");
    vi.stubEnv("PUBLIC_FACEBOOK_AUTH_ENABLED", "true");
    vi.stubEnv("PUBLIC_FACEBOOK_PROCESSING_LOCATION", "");
    vi.stubEnv("PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN", "");
    const { PROCESSOR_DISCLOSURES } = await import("./legal");
    expect(PROCESSOR_DISCLOSURES.find(({ name }) => name === "Meta / Facebook")).toMatchObject({
      processingLocationStatus: "pending",
    });
    expect(PROCESSOR_DISCLOSURES.some(({ name }) => name === "Google")).toBe(false);
  });
});
