import { describe, expect, it } from "vitest";
import { createAdminSupabase } from "./supabase";

describe("cliente admin durante el preview read-only", () => {
  it("falla antes de leer SUPABASE_SECRET_KEY", () => {
    const reads: string[] = [];
    const event = {
      env: {
        get(name: string) {
          reads.push(name);
          return name === "AGORBIS_LAUNCH_MODE"
            ? "public-read-only"
            : "valor-que-no-debe-leerse";
        },
      },
    } as Parameters<typeof createAdminSupabase>[0];

    expect(() => createAdminSupabase(event)).toThrow(
      "cliente admin de Supabase está deshabilitado",
    );
    expect(reads).toEqual(["AGORBIS_LAUNCH_MODE"]);
  });
});
