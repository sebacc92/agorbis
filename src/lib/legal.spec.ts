import { describe, expect, it } from "vitest";
import {
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  PRIVACY_VERSION,
  PROCESSOR_DISCLOSURES,
  isDisplayableAaipDatabaseRegistrationId,
  resolveAaipDatabaseRegistrationStatus,
  resolveBilingualExternalDisclosure,
} from "./legal";
import {
  internationalTransferNoticeContent,
  privacyContent,
} from "./legal-content";

describe("Turnstile invisible (D109)", () => {
  it("Privacidad cita el anexo de Turnstile de Cloudflare en los dos idiomas", () => {
    const addendum = "https://www.cloudflare.com/turnstile-privacy-policy/";
    for (const locale of ["es", "en"] as const) {
      const text = JSON.stringify(privacyContent[locale]);
      expect(text).toContain(addendum);
      expect(text).toContain("Turnstile Privacy Addendum");
    }
  });
});

describe("pending external evidence legal activation", () => {
  it("uses the prepared versions without stronger unsupported assertions", () => {
    // D109: Privacidad pasa a 2026-11-02.1 para citar el anexo de Turnstile;
    // el Aviso de transferencias no cambia.
    expect(PRIVACY_VERSION).toBe("2026-11-02.1");
    expect(INTERNATIONAL_TRANSFER_NOTICE_VERSION).toBe("2026-08-29.1");

    const activeContent = JSON.stringify({
      privacyContent,
      internationalTransferNoticeContent,
    });
    for (const unsupported of [
      "AWS us-east-2",
      "Ohio, Estados Unidos",
      "Ohio, United States",
      "Los DPA incorporados a los contratos obligan",
      "The DPAs incorporated into each contract require",
      "La telemetría cruda de activación se elimina a los 90 días",
      "Raw activation telemetry is deleted after 90 days",
      "Las copias de respaldo vencen por rotación",
      "Backups expire through rotation",
    ]) {
      expect(activeContent).not.toContain(unsupported);
    }
    expect(activeContent).toContain(
      "no debe describirse como jurídicamente conforme",
    );
    expect(activeContent).toContain(
      "must not be described as legally compliant",
    );
  });

  it("does not encode a global location into Cloudflare's purpose", () => {
    const cloudflare = PROCESSOR_DISCLOSURES.find(({ name }) =>
      name.startsWith("Cloudflare"),
    );
    expect(cloudflare?.purposeEs).not.toMatch(/global/i);
    expect(cloudflare?.purposeEn).not.toMatch(/global/i);
  });
});

describe("AAIP database registration state", () => {
  it("stays pending when approved evidence is absent", () => {
    expect(resolveAaipDatabaseRegistrationStatus(undefined, undefined)).toBe(
      "pending",
    );
    expect(
      resolveAaipDatabaseRegistrationStatus("pending", "RL-2026-reference"),
    ).toBe("pending");
    expect(
      resolveAaipDatabaseRegistrationStatus("APPROVED", "RL-2026-reference"),
    ).toBe("pending");
  });

  it.each([
    "",
    "EX-2026-reference",
    "RE-2026-reference",
    "PV-2026-reference",
    "RL-2026-reference",
    "IF-2026-reference",
    "RL202681658385",
    "EX202682087278",
    "RE20260001",
    "PV20260001",
    "IF20260001",
    "AAIP-RL202681658385",
    "AAIP-EX202682087278",
    "referencia-RE20260001",
    "referencia-PV20260001",
    "referencia-IF20260001",
    "inscripción pendiente",
    "en trámite",
    "fixture-value",
    "<registration-id>",
    "sample",
    "dummy",
    "TODO",
    "N/A",
    "unknown",
    "valor de prueba",
    "valor de ejemplo",
    "fake-value",
    "valor falso",
    "linea\nsegunda",
  ])("does not display a known non-registration value: %s", (value) => {
    expect(isDisplayableAaipDatabaseRegistrationId(value)).toBe(false);
    expect(resolveAaipDatabaseRegistrationStatus("approved", value)).toBe(
      "pending",
    );
  });
});

describe("external legal disclosures", () => {
  it("keeps both values empty while the pair is incomplete", () => {
    expect(
      resolveBilingualExternalDisclosure("texto acreditado", undefined),
    ).toEqual({ status: "pending", es: "", en: "" });
  });

  it("rejects pending copy as provider evidence", () => {
    expect(
      resolveBilingualExternalDisclosure(
        "Destino pendiente",
        "Processing destination pending",
      ),
    ).toEqual({ status: "pending", es: "", en: "" });
  });

  it.each([
    ["fixture", "translated disclosure"],
    ["sample", "translated disclosure"],
    ["dummy", "translated disclosure"],
    ["test value", "translated disclosure"],
    ["texto de prueba", "translated disclosure"],
    ["valor de ejemplo", "translated disclosure"],
    ["texto traducido", "fake value"],
    ["valor falso", "translated disclosure"],
  ])("rejects a placeholder in either locale: %s / %s", (es, en) => {
    expect(resolveBilingualExternalDisclosure(es, en)).toEqual({
      status: "pending",
      es: "",
      en: "",
    });
  });

  it("rejects the same normalized text for ES and EN", () => {
    expect(
      resolveBilingualExternalDisclosure(
        "Contenido bilingüe sin evidencia acreditada",
        "  contenido bilingüe  sin evidencia acreditada  ",
      ),
    ).toEqual({ status: "pending", es: "", en: "" });
  });

  // La suite no fabrica un par positivo: la rama confirmed sólo debe ejercerse
  // con evidencia externa real.
});
