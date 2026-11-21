import { describe, expect, it } from "vitest";
import { accountDeletionConfirmation } from "./account-deletion";

describe("accountDeletionConfirmation", () => {
  it("prefiere el usuario público normal", () => {
    expect(
      accountDeletionConfirmation("agorbis_user", "person@example.com"),
    ).toBe("agorbis_user");
  });

  it("conserva el camino de baja si falta el perfil", () => {
    expect(accountDeletionConfirmation(null, "person@example.com")).toBe(
      "person@example.com",
    );
  });

  it("tiene un último recurso para cuentas Auth sin correo", () => {
    expect(accountDeletionConfirmation(undefined, undefined)).toBe("ELIMINAR");
  });
});
