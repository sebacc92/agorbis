import { describe, expect, it } from "vitest";
import {
  isRlsViolation,
  participationBlockMessage,
  writeFailure,
} from "./db-error";

describe("gate de participación vs RLS", () => {
  it("no confunde la aceptación legal faltante con no residir", () => {
    const error = {
      code: "42501",
      message: "GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED",
    };
    expect(isRlsViolation(error)).toBe(false);
    expect(participationBlockMessage(error)).toMatch(/consentimiento/);
  });

  it("reconoce el consentimiento de transferencias, la suspensión y la baja", () => {
    for (const sentinel of [
      "AGORBIS_INTERNATIONAL_TRANSFER_CONSENT_REQUIRED",
      "GEOUNITY_ACCOUNT_SUSPENDED",
      "AGORBIS_ACCOUNT_DELETION_PENDING",
    ]) {
      expect(
        participationBlockMessage({ code: "42501", message: sentinel }),
      ).not.toBeNull();
    }
  });

  it("deja intacto el rechazo de RLS común", () => {
    const error = {
      code: "42501",
      message: 'new row violates row-level security policy for table "claims"',
    };
    expect(isRlsViolation(error)).toBe(true);
    expect(participationBlockMessage(error)).toBeNull();
  });
});

describe("writeFailure", () => {
  it("devuelve 403 con el motivo cuando rechazó el gate de participación", () => {
    const failure = writeFailure(
      {
        code: "42501",
        message: "GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED",
      },
      "No pudimos crear el hito.",
    );
    expect(failure.status).toBe(403);
    expect(failure.message).toMatch(/consentimiento/);
  });

  it("conserva el mensaje de la acción ante cualquier otro error", () => {
    expect(
      writeFailure(
        { code: "23514", message: "check constraint" },
        "No pudimos crear el hito.",
      ),
    ).toEqual({ status: 400, message: "No pudimos crear el hito." });
  });

  it("acepta la ausencia de error (la base no devolvió la fila)", () => {
    expect(writeFailure(null, "No pudimos asignar el organismo.")).toEqual({
      status: 400,
      message: "No pudimos asignar el organismo.",
    });
  });

  it("reconoce la baja en curso aunque el error no traiga código", () => {
    expect(
      writeFailure(
        { message: "AGORBIS_ACCOUNT_DELETION_PENDING" },
        "No pudimos registrar tu aporte.",
      ).status,
    ).toBe(403);
  });
});

describe("límites y motivos propios de la base", () => {
  it("traduce los topes de pendientes y de ventana a un mensaje concreto", async () => {
    const { limitMessage, writeFailure } = await import("./db-error");
    expect(
      limitMessage({ code: "54000", message: "GEOUNITY_TOO_MANY_PENDING_UPLOADS" }),
    ).toMatch(/12 fotos/);
    expect(
      limitMessage({ code: "54000", message: "GEOUNITY_RATE_LIMIT:claim-uploads-hour" }),
    ).toMatch(/20 fotos por hora/);
    expect(
      limitMessage({
        code: "54000",
        message: "GEOUNITY_RATE_LIMIT:community_requests-day",
      }),
    ).toMatch(/3 solicitudes por día/);
    expect(limitMessage({ code: "23505", message: "duplicate key" })).toBeNull();
    expect(writeFailure({ message: "GEOUNITY_TOO_MANY_PENDING_REQUESTS" }, "x")).toEqual({
      status: 429,
      message: expect.stringMatching(/3 solicitudes esperando/),
    });
    expect(writeFailure(null, "Genérico")).toEqual({ status: 400, message: "Genérico" });
  });

  it("devuelve el motivo real de moderación, sin el valor interpolado", async () => {
    const { moderationRaiseMessage } = await import("./db-error");
    expect(
      moderationRaiseMessage({
        message: "El nivel solicitado requiere una comunidad superior de nivel 3",
      }),
    ).toMatch(/otro nivel/);
    expect(
      moderationRaiseMessage({ message: "GEOUNITY_MODERATION_HIERARCHY" }),
    ).toMatch(/rol igual o superior/);
    expect(moderationRaiseMessage({ message: "otra cosa" })).toBeNull();
  });
});

describe("rechazos propios de acuerdos (0074)", () => {
  it("traduce cada mensaje estable y deja pasar lo que no conoce", async () => {
    const { agreementRaiseMessage } = await import("./db-error");
    expect(
      agreementRaiseMessage({
        message: "AGORBIS_AGREEMENT_PROPOSER_CANNOT_ADHERE",
        code: "42501",
      }),
    ).toContain("otra residente");
    expect(
      agreementRaiseMessage({ message: "AGORBIS_AGREEMENT_LAPSED" }),
    ).toContain("30 días");
    // NOT_PROPOSER y NOT_PROPOSED comparten prefijo: cada uno va a su texto.
    expect(
      agreementRaiseMessage({ message: "AGORBIS_AGREEMENT_NOT_PROPOSER" }),
    ).toContain("retirarlo");
    expect(
      agreementRaiseMessage({ message: "AGORBIS_AGREEMENT_NOT_PROPOSED" }),
    ).toContain("adhesiones");
    expect(agreementRaiseMessage({ message: "otra cosa" })).toBeNull();
    expect(agreementRaiseMessage(null)).toBeNull();
  });
});
