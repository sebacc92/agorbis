import { describe, expect, it } from "vitest";
import {
  isCurrentAal2,
  isSafeTotpEnrollment,
  mfaDestination,
  moderatorMfaUrl,
  verifiedTotpFactors,
} from "./mfa";

describe("MFA de sesiones privilegiadas", () => {
  it("exige AAL2 en la sesión actual", () => {
    expect(isCurrentAal2("aal2")).toBe(true);
    expect(isCurrentAal2("aal1")).toBe(false);
    expect(isCurrentAal2(null)).toBe(false);
  });

  it("conserva un next interno sin permitir redirecciones externas", () => {
    expect(moderatorMfaUrl("/moderacion?estado=pending")).toBe(
      "/perfil/seguridad/?next=%2Fmoderacion%3Festado%3Dpending",
    );
    expect(moderatorMfaUrl("//evil.example/robo")).toBe(
      "/perfil/seguridad/?next=%2Fmoderacion",
    );
    expect(mfaDestination("https://evil.example/robo")).toBe(
      "/perfil/seguridad/?verified=1",
    );
    expect(
      moderatorMfaUrl(
        "/moderacion/?estado=pending&next=%2Fmoderacion%2F&approval=required",
      ),
    ).toBe(
      "/perfil/seguridad/?next=%2Fmoderacion%2F%3Festado%3Dpending",
    );
    expect(
      mfaDestination("/moderacion/?next=%2Fmoderacion%2F&approval=required"),
    ).toBe("/moderacion/");
  });

  it("sólo elige factores TOTP verificados", () => {
    const factors = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        factor_type: "totp",
        status: "verified",
        created_at: "2026-08-23T00:00:00Z",
        updated_at: "2026-08-23T00:00:00Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        factor_type: "totp",
        status: "unverified",
        created_at: "2026-08-23T00:00:00Z",
        updated_at: "2026-08-23T00:00:00Z",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        factor_type: "phone",
        status: "verified",
        created_at: "2026-08-23T00:00:00Z",
        updated_at: "2026-08-23T00:00:00Z",
      },
    ] as const;

    expect(verifiedTotpFactors(factors)).toHaveLength(1);
  });

  it("acepta únicamente una respuesta TOTP esperada del SDK", () => {
    const valid = {
      id: "11111111-1111-4111-8111-111111111111",
      type: "totp",
      totp: {
        qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
        secret: "ABCDEFGHIJKLMNOP",
      },
    };
    expect(isSafeTotpEnrollment(valid)).toBe(true);
    expect(
      isSafeTotpEnrollment({
        ...valid,
        totp: { ...valid.totp, qr_code: "https://evil.example/qr.svg" },
      }),
    ).toBe(false);
    expect(
      isSafeTotpEnrollment({
        ...valid,
        totp: { ...valid.totp, secret: "<script>alert(1)</script>" },
      }),
    ).toBe(false);
  });
});
