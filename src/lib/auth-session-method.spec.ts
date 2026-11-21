import { describe, expect, it } from "vitest";
import { classifyExchangedSessionMethod } from "./auth-session-method";

const earlier = 1788890100;
const later = earlier + 60;
const amr = (method: string, timestamp = later) => ({ method, timestamp });
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const token = (claims: unknown) =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.${encode("test-signature")}`;
const claims = (methods: unknown, extra: Record<string, unknown> = {}) => ({
  amr: methods,
  email: "persona@example.test",
  phone: "",
  ...extra,
});

describe("method of a trusted Supabase code exchange", () => {
  it("detects OAuth without provider tokens or social account metadata", () => {
    expect(
      classifyExchangedSessionMethod(
        token(claims([amr("oauth")], { app_metadata: { provider: "email" } })),
      ),
    ).toBe("oauth");
  });

  it("does not let an older phone-capable AMR obscure the newer OAuth method", () => {
    expect(
      classifyExchangedSessionMethod(
        token(
          claims([amr("password", earlier), amr("oauth")], {
            email: "",
            phone: "+5491100000000",
          }),
        ),
      ),
    ).toBe("oauth");
  });

  it.each([
    "password",
    "otp",
    "recovery",
    "invite",
    "magiclink",
    "email/signup",
    "email_change",
  ])("preserves %s on an account originally created with Google", (method) => {
    expect(
      classifyExchangedSessionMethod(
        token(
          claims([amr(method)], {
            app_metadata: {
              provider: "google",
              providers: ["google", "email"],
            },
            user_metadata: { provider: "facebook" },
          }),
        ),
      ),
    ).toBe("email");
  });

  it.each([
    ["oauth", "password", "oauth"],
    ["password", "oauth", "email"],
    ["magiclink", "oauth", "email"],
  ])(
    "uses timestamps for %s after %s, regardless of array order",
    (newer, older, expected) => {
      for (const methods of [
        [amr(older, earlier), amr(newer)],
        [amr(newer), amr(older, earlier)],
      ]) {
        expect(classifyExchangedSessionMethod(token(claims(methods)))).toBe(
          expected,
        );
      }
    },
  );

  it.each([
    "totp",
    "mfa/totp",
    "mfa/phone",
    "mfa/webauthn",
    "mfa/recovery_code",
    "token_refresh",
  ])(
    "%s cannot turn an OAuth session into email or establish a primary method",
    (method) => {
      expect(
        classifyExchangedSessionMethod(
          token(claims([amr(method), amr("oauth", earlier)])),
        ),
      ).toBe("oauth");
      expect(
        classifyExchangedSessionMethod(
          token(claims([amr(method), amr("password", earlier)])),
        ),
      ).toBe("email");
      expect(classifyExchangedSessionMethod(token(claims([amr(method)])))).toBe(
        "unknown",
      );
    },
  );

  it("does not resolve a same-second OAuth/email tie by array order", () => {
    for (const methods of [
      [amr("oauth"), amr("password")],
      [amr("password"), amr("oauth")],
      [amr("oauth"), amr("password"), amr("oauth")],
    ]) {
      expect(classifyExchangedSessionMethod(token(claims(methods)))).toBe(
        "unknown",
      );
    }
    expect(
      classifyExchangedSessionMethod(
        token(claims([amr("password"), amr("magiclink")])),
      ),
    ).toBe("email");
    expect(
      classifyExchangedSessionMethod(
        token(
          claims([
            amr("oauth", earlier),
            amr("password", earlier),
            amr("magiclink"),
          ]),
        ),
      ),
    ).toBe("email");
  });

  it.each([
    "sso/saml",
    "anonymous",
    "web3",
    "passkey",
    "oauth_provider/authorization_code",
    "google",
    "future-method",
    "mfa/future",
  ])("does not infer supported sign-in from %s", (method) => {
    expect(classifyExchangedSessionMethod(token(claims([amr(method)])))).toBe(
      "unknown",
    );
    expect(
      classifyExchangedSessionMethod(
        token(claims([amr("password"), amr(method, earlier)])),
      ),
    ).toBe("unknown");
  });

  it.each([null, undefined, "", 12])(
    "rejects email-family claims without an email (%j)",
    (email) => {
      expect(
        classifyExchangedSessionMethod(
          token(claims([amr("magiclink")], { email })),
        ),
      ).toBe("unknown");
    },
  );

  it.each(["otp", "password"])(
    "does not call ambiguous phone/email %s an email method",
    (method) => {
      expect(
        classifyExchangedSessionMethod(
          token(claims([amr(method)], { phone: "+5491100000000" })),
        ),
      ).toBe("unknown");
      expect(
        classifyExchangedSessionMethod(
          token(claims([amr(method)], { phone: null })),
        ),
      ).toBe("unknown");
      expect(
        classifyExchangedSessionMethod(
          token(claims([amr(method)], { phone: undefined })),
        ),
      ).toBe("email");
    },
  );

  it("keeps an explicit magic link usable when the account also has a phone", () => {
    expect(
      classifyExchangedSessionMethod(
        token(claims([amr("magiclink")], { phone: "+5491100000000" })),
      ),
    ).toBe("email");
  });

  it.each([
    null,
    {},
    [],
    "oauth",
    ["oauth"],
    [null],
    [[]],
    [{}],
    [{ method: "oauth" }],
    [{ timestamp: later }],
    [amr("oauth", 0)],
    [amr("oauth", -1)],
    [amr("oauth", 1.5)],
    [amr("oauth", Number.MAX_SAFE_INTEGER + 1)],
    [{ method: "oauth", timestamp: String(later) }],
    [amr("password"), { method: "totp", timestamp: null }],
  ])(
    "fails closed for missing, un-timestamped or malformed AMR: %j",
    (methods) => {
      expect(classifyExchangedSessionMethod(token(claims(methods)))).toBe(
        "unknown",
      );
    },
  );

  it.each([
    "",
    "not-a-jwt",
    "a.b.c",
    "e30.e30.",
    "e30.e30.c2ln.extra",
    "e30.%%%25.c2ln",
    "e30.e30=.c2ln",
    "e30._w.c2ln",
  ])(
    "fails closed without leaking a decode error for malformed JWT: %s",
    (value) => {
      expect(classifyExchangedSessionMethod(value)).toBe("unknown");
    },
  );

  it.each([null, [], "amr", 12])("rejects a non-object payload %j", (value) => {
    expect(classifyExchangedSessionMethod(token(value))).toBe("unknown");
  });

  it("does not accept an unsigned JWT as an exchanged token", () => {
    expect(
      classifyExchangedSessionMethod(
        `${encode({ alg: "none" })}.${encode(claims([amr("oauth")]))}.c2ln`,
      ),
    ).toBe("unknown");
  });
});
