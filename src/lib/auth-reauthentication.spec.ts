import { describe, expect, it } from "vitest";
import {
  isAuthEmailRateLimit,
  isPlausibleReauthenticationNonce,
  passwordReauthenticationError,
} from "./auth-reauthentication";

describe("reauth de cambios de contraseña", () => {
  it("acepta únicamente OTP numéricos con longitud acotada", () => {
    expect(isPlausibleReauthenticationNonce("123456")).toBe(true);
    expect(isPlausibleReauthenticationNonce("12345678")).toBe(true);
    expect(isPlausibleReauthenticationNonce("1234567890")).toBe(true);
    expect(isPlausibleReauthenticationNonce("12345")).toBe(false);
    expect(isPlausibleReauthenticationNonce("12345678901")).toBe(false);
    expect(isPlausibleReauthenticationNonce("123 456")).toBe(false);
    expect(isPlausibleReauthenticationNonce("abcdef")).toBe(false);
  });

  it("distingue el desafío pendiente de un nonce rechazado", () => {
    expect(
      passwordReauthenticationError({ code: "reauthentication_needed" }),
    ).toBe("required");
    expect(
      passwordReauthenticationError({ code: "reauth_nonce_missing" }),
    ).toBe("required");
    expect(
      passwordReauthenticationError({
        code: "reauthentication_not_valid",
      }),
    ).toBe("invalid");
    expect(passwordReauthenticationError({ code: "otp_expired" })).toBe(
      "invalid",
    );
    expect(passwordReauthenticationError({ code: "weak_password" })).toBe(
      null,
    );
    expect(passwordReauthenticationError(new Error("localized message"))).toBe(
      null,
    );
  });

  it("reconoce límites de envío sin depender del texto", () => {
    expect(
      isAuthEmailRateLimit({ code: "over_email_send_rate_limit" }),
    ).toBe(true);
    expect(isAuthEmailRateLimit({ code: "over_request_rate_limit" })).toBe(
      true,
    );
    expect(isAuthEmailRateLimit({ code: "unexpected_failure" })).toBe(false);
  });
});
