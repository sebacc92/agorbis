import { describe, expect, it } from "vitest";
import { residenceHint } from "./residence-hint";

const base = {
  isMember: false,
  isAuthenticated: true,
  hasResidence: true,
  residenceUnknown: false,
};

describe("residenceHint", () => {
  it("quien vive acá es miembro, aunque el resto diga otra cosa", () => {
    expect(residenceHint({ ...base, isMember: true })).toBe("member");
  });
  it("sin sesión se pide ingresar", () => {
    expect(
      residenceHint({ ...base, isAuthenticated: false, hasResidence: false }),
    ).toBe("signin");
  });
  it("con el perfil ilegible no se afirma nada ni se manda a elegir", () => {
    expect(
      residenceHint({ ...base, hasResidence: false, residenceUnknown: true }),
    ).toBe("unknown");
  });
  it("con sesión y sin residencia se ofrece elegirla", () => {
    expect(residenceHint({ ...base, hasResidence: false })).toBe("choose");
  });
  it("con residencia en otra comunidad, y sólo ahí, se habla de residencia declarada", () => {
    expect(residenceHint(base)).toBe("elsewhere");
  });
});
