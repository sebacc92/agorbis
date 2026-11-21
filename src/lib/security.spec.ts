import { describe, expect, it, vi } from "vitest";
import { isUuid } from "./http";
import { isRecentAuthentication } from "./session";
import { hardenedSupabaseCookieOptions } from "./supabase";
import { isCanonicalUploadPath } from "./uploads";
import { normalizeHttpUrl } from "./url";
import { logEvent, sanitizeLogValue } from "./log";
import {
  googleAuthEnabled,
  oauthConsentMarker,
  strongPasswordSchema,
  validOauthConsentMarker,
} from "./auth-security";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const FILE_ID = "01890f47-3e77-7f5c-8ac1-84a18bbfcd32";

describe("hardening de entrada y sesión", () => {
  it("fuerza HttpOnly aunque la librería pida lo contrario", () => {
    expect(
      hardenedSupabaseCookieOptions(
        { httpOnly: false, secure: false, sameSite: "none" },
        true,
      ),
    ).toMatchObject({ httpOnly: true, secure: true, sameSite: "none" });
  });

  it("sólo acepta URLs web sin credenciales", () => {
    expect(normalizeHttpUrl(" https://example.com/a ")).toBe(
      "https://example.com/a",
    );
    expect(normalizeHttpUrl("http://localhost:54321/path")).toBe(
      "http://localhost:54321/path",
    );
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("data:text/html,test")).toBeNull();
    expect(normalizeHttpUrl("https://oficial.example@evil.example/")).toBeNull();
  });

  it("redacta credenciales y enlaces de Auth antes de registrar errores", () => {
    const value =
      "https://agorbis.test/auth/confirm?token_hash=muy-secreto&access_token=otro Authorization: Bearer opaco.123";
    const sanitized = sanitizeLogValue(value);
    expect(sanitized).not.toContain("muy-secreto");
    expect(sanitized).not.toContain("access_token=otro");
    expect(sanitized).not.toContain("opaco.123");
    expect(sanitized).toContain("token_hash=[redacted]");
  });

  it("redacta también credenciales OAuth y CAPTCHA por nombre de campo", () => {
    const write = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      logEvent("info", {
        scope: "auth/test",
        userId: "11111111-1111-4111-8111-111111111111",
        requestId: "22222222-2222-4222-8222-222222222222",
        note: "falló el objeto 33333333-3333-4333-8333-333333333333",
        provider_token: "google-opaco",
        turnstile_token: "captcha-opaco",
        session_cookie: "cookie-opaca",
        password: "clave-opaca",
      });
      const line = String(write.mock.calls[0]?.[0]);
      expect(line).not.toContain("google-opaco");
      expect(line).not.toContain("captcha-opaco");
      expect(line).not.toContain("cookie-opaca");
      expect(line).not.toContain("clave-opaca");
      expect(line).not.toContain("11111111-1111-4111-8111-111111111111");
      expect(line).not.toContain("33333333-3333-4333-8333-333333333333");
      expect(line).toContain("22222222-2222-4222-8222-222222222222");
      expect(line).toContain("falló el objeto [uuid]");
      expect(line.match(/\[redacted\]/g)).toHaveLength(5);
    } finally {
      write.mockRestore();
    }
  });

  it("sanea recursivamente objetos, arrays, errores, ciclos y valores JSON no nativos", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => {});
    const circular: Record<string, unknown> = {
      authorization: "Bearer secreto-anidado",
      email: "persona@example.com",
      userId: "11111111-1111-4111-8111-111111111111",
      nested: {
        password: "clave-anidada",
        note: "token=secreto-libre 33333333-3333-4333-8333-333333333333",
      },
      values: [
        "https://agorbis.com/auth/confirm?token_hash=opaco",
        { turnstile_token: "captcha-anidado" },
      ],
      count: 12n,
      failure: new Error("falló para persona@example.com con token=opaco"),
    };
    circular.self = circular;

    try {
      expect(() =>
        logEvent("error", { scope: "security/nested", payload: circular }),
      ).not.toThrow();
      const line = String(write.mock.calls[0]?.[0]);
      expect(() => JSON.parse(line)).not.toThrow();
      for (const secret of [
        "secreto-anidado",
        "persona@example.com",
        "11111111-1111-4111-8111-111111111111",
        "clave-anidada",
        "secreto-libre",
        "33333333-3333-4333-8333-333333333333",
        "opaco",
        "captcha-anidado",
      ]) {
        expect(line).not.toContain(secret);
      }
      expect(line).toContain("[circular]");
      expect(line).toContain("12n");
      expect(line).toContain("[email]");
      expect(line).toContain("[uuid]");
    } finally {
      write.mockRestore();
    }
  });

  it("valida UUIDs y paths de Storage canónicos", () => {
    expect(isUuid(USER_ID)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isCanonicalUploadPath(`${USER_ID}/${FILE_ID}.webp`, USER_ID)).toBe(
      true,
    );
    expect(
      isCanonicalUploadPath(`${USER_ID}/../otro/archivo.webp`, USER_ID),
    ).toBe(false);
    expect(
      isCanonicalUploadPath(
        `223e4567-e89b-42d3-a456-426614174000/${FILE_ID}.webp`,
        USER_ID,
      ),
    ).toBe(false);
  });

  it("aplica una ventana de step-up acotada", () => {
    const now = Date.parse("2026-08-23T12:00:00.000Z");
    expect(
      isRecentAuthentication(
        [{ method: "password", timestamp: now / 1000 - 10 * 60 }],
        now,
      ),
    ).toBe(true);
    expect(
      isRecentAuthentication(
        [{ method: "password", timestamp: now / 1000 - 20 * 60 }],
        now,
      ),
    ).toBe(false);
    expect(
      isRecentAuthentication(
        [{ method: "mfa/totp", timestamp: now / 1000 }],
        now,
      ),
    ).toBe(false);
    expect(isRecentAuthentication(["password"], now)).toBe(false);
    expect(isRecentAuthentication(null, now)).toBe(false);
  });

  it("alinea la validación de contraseña con GoTrue", () => {
    // D101 (`letters_digits`): 12 caracteres con una letra ASCII y un dígito.
    // Mayúsculas y símbolos suman, pero no se exigen.
    expect(strongPasswordSchema.safeParse("MuySegura-2026").success).toBe(true);
    expect(strongPasswordSchema.safeParse("solo-minusculas-2026").success).toBe(
      true,
    );
    expect(strongPasswordSchema.safeParse("agorbis12345678").success).toBe(true);
    expect(strongPasswordSchema.safeParse("Corta-1!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("sololetrasmuylargas").success).toBe(
      false,
    );
    expect(strongPasswordSchema.safeParse("123456789012").success).toBe(false);
    // GoTrue exige una letra ASCII: once "ñ" y un dígito no alcanzan.
    expect(strongPasswordSchema.safeParse("ñññññññññññ1").success).toBe(false);
  });

  it("deja Google cerrado salvo habilitación explícita", () => {
    expect(googleAuthEnabled("true")).toBe(true);
    expect(googleAuthEnabled("TRUE")).toBe(false);
    expect(googleAuthEnabled(undefined)).toBe(false);
  });

  it("liga el consentimiento OAuth al nonce y a las versiones exactas", () => {
    const versions = {
      terms: "2026-08-23",
      privacy: "2026-08-23",
      communityRules: "2026-08-23",
      internationalTransfers: "2026-08-29.1",
      minimumAge: 18,
    };
    const marker = oauthConsentMarker("nonce-unico", versions);
    expect(validOauthConsentMarker(marker, "nonce-unico", versions)).toBe(true);
    expect(validOauthConsentMarker(marker, "otro-nonce", versions)).toBe(false);
    expect(
      validOauthConsentMarker(marker, "nonce-unico", {
        ...versions,
        terms: "2026-09-01",
      }),
    ).toBe(false);
    expect(
      validOauthConsentMarker(marker, "nonce-unico", {
        ...versions,
        internationalTransfers: "2026-09-01.1",
      }),
    ).toBe(false);
  });
});
