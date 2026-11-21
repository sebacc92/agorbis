import { z } from "@qwik.dev/router";
import { describe, expect, it } from "vitest";
import { RESIDENCE_COOLDOWN_DAYS } from "./constants";
import { nextResidenceChangeAt, updateProfileSchema } from "./profile-page";

describe("nextResidenceChangeAt", () => {
  it("sin residencia o sin cambio previo no hay espera", () => {
    expect(nextResidenceChangeAt(null, "c1")).toBeNull();
    expect(nextResidenceChangeAt("2026-10-01T00:00:00Z", null)).toBeNull();
  });

  it("suma el período de espera al último cambio", () => {
    const next = nextResidenceChangeAt("2026-10-01T00:00:00Z", "c1");
    expect(next?.getTime()).toBe(
      Date.parse("2026-10-01T00:00:00Z") + RESIDENCE_COOLDOWN_DAYS * 86400_000,
    );
  });
});

describe("updateProfileSchema", () => {
  const schema = z.object(updateProfileSchema);

  it("normaliza el usuario a minúsculas y recorta espacios", () => {
    const parsed = schema.parse({ username: "  Vecina_42 " });
    expect(parsed.username).toBe("vecina_42");
  });

  it("rechaza usuarios fuera del formato y textos largos", () => {
    expect(schema.safeParse({ username: "ab" }).success).toBe(false);
    expect(schema.safeParse({ username: "con espacio" }).success).toBe(false);
    expect(
      schema.safeParse({ username: "vecina", bio: "x".repeat(301) }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ username: "vecina", display_name: "x".repeat(61) })
        .success,
    ).toBe(false);
  });

  it("explica la misma regla para formatos y límites inválidos", () => {
    for (const username of ["ab", "x".repeat(21), "con espacio", "vecina-42"]) {
      const result = schema.safeParse({ username });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Entre 3 y 20 caracteres: minúsculas, números y guión bajo.",
        );
      }
    }
    expect(schema.parse({ username: "vecina", remove_avatar: "si" }).remove_avatar).toBe("si");
    expect(schema.safeParse({ username: "vecina", remove_avatar: "no" }).success).toBe(false);
  });
});
