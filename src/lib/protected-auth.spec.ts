import type { RequestEventBase } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminSignOut: vi.fn(),
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  setSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("./turnstile", async (importOriginal) => {
  const original = await importOriginal<typeof import("./turnstile")>();
  return {
    ...original,
    verifyTurnstileToken: mocks.verifyTurnstileToken,
  };
});

import {
  exchangeOAuthCodeWithServerSecret,
  requestPasswordResetWithTurnstile,
  resendConfirmationWithTurnstile,
  revokeAndClearProtectedAuthSession,
  sendMagicLinkWithTurnstile,
  signInWithTurnstile,
  signUpWithTurnstile,
  startGoogleOAuthWithServerSecret,
  startSocialOAuthWithServerSecret,
} from "./protected-auth";
import { TURNSTILE_ACTIONS } from "./turnstile";

function event(
  cookies: Record<string, string> = {},
  overrides: { env?: Record<string, string>; headers?: HeadersInit } = {},
): RequestEventBase {
  const values: Record<string, string> = {
    PUBLIC_SITE_URL: "https://agorbis.com",
    PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    SUPABASE_SECRET_KEY: "sb_secret_server_only_test",
    AGORBIS_RUNTIME: "cloudflare-workers",
    ...overrides.env,
  };
  return {
    url: new URL("https://agorbis.com/registro"),
    request: new Request("https://agorbis.com/registro", {
      headers: overrides.headers ?? { "CF-Connecting-IP": "203.0.113.9" },
    }),
    env: { get: (name: string) => values[name] },
    cookie: {
      getAll: () =>
        Object.fromEntries(
          Object.entries(cookies).map(([name, value]) => [name, { value }]),
        ),
      set: vi.fn(),
    },
  } as unknown as RequestEventBase;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerClient.mockReturnValue({
    auth: {
      admin: { signOut: mocks.adminSignOut },
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      resend: mocks.resend,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      setSession: mocks.setSession,
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      signUp: mocks.signUp,
    },
  });
  const authResult = {
    data: { user: null, session: null },
    error: null,
  };
  mocks.resend.mockResolvedValue(authResult);
  mocks.adminSignOut.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue(authResult);
  mocks.exchangeCodeForSession.mockResolvedValue(authResult);
  mocks.setSession.mockResolvedValue(authResult);
  mocks.signInWithOAuth.mockResolvedValue(authResult);
  mocks.signInWithOtp.mockResolvedValue(authResult);
  mocks.signInWithPassword.mockResolvedValue(authResult);
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue(authResult);
});

describe("Auth público protegido", () => {
  it("revoca y limpia una ceremonia fallida sin leer la sesión entrante", async () => {
    const ev = event({
      "sb-project-auth-token": "session-that-must-not-be-read",
      "sb-project-auth-token.0": "session-chunk-that-must-not-be-read",
      "sb-project-auth-token-code-verifier": "pkce-verifier",
      "sb-other-auth-token": "another-project-session",
      "locale": "es",
    });
    const result = await revokeAndClearProtectedAuthSession(
      ev,
      "access-token",
    );

    const [, key, options] = mocks.createServerClient.mock.calls[0];
    expect(key).toBe("sb_secret_server_only_test");
    expect(options.cookies.getAll()).toEqual([]);
    expect(mocks.adminSignOut).toHaveBeenCalledWith("access-token", "local");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(vi.mocked(ev.cookie.set).mock.calls.map(([name]) => name)).toEqual([
      "sb-project-auth-token",
      "sb-project-auth-token.0",
      "sb-project-auth-token-code-verifier",
    ]);
    for (const [, value, cookieOptions] of vi.mocked(ev.cookie.set).mock.calls) {
      expect(value).toBe("");
      expect(cookieOptions).toMatchObject({ maxAge: 0, httpOnly: true, secure: true, path: "/" });
    }
    expect(result).toEqual({
      error: null,
      revocationError: null,
      cleanupError: null,
    });
  });

  it("limpia cookies aunque falle la revocación remota", async () => {
    const revocationError = new Error("revocation failed");
    const cleanupError = new Error("SDK signOut failed");
    mocks.adminSignOut.mockResolvedValue({ error: revocationError });
    mocks.signOut.mockRejectedValueOnce(cleanupError);
    const ev = event({ "sb-project-auth-token.0": "incoming-session-chunk" });

    const result = await revokeAndClearProtectedAuthSession(
      ev,
      "access-token",
    );

    expect(mocks.adminSignOut).toHaveBeenCalledWith("access-token", "local");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(ev.cookie.set).toHaveBeenCalledWith(
      "sb-project-auth-token.0", "", expect.objectContaining({ maxAge: 0 }),
    );
    expect(result).toEqual({
      error: revocationError,
      revocationError,
      cleanupError,
    });
  });

  it("inicia Google con sb_secret, PKCE y sin transmitir token B", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: {
        provider: "google",
        url: "https://project.supabase.co/auth/v1/authorize",
      },
      error: null,
    });

    await startGoogleOAuthWithServerSecret(
      event(),
      "https://agorbis.com/auth/callback?consent=nonce",
    );

    const [, key, options] = mocks.createServerClient.mock.calls[0];
    expect(key).toBe("sb_secret_server_only_test");
    expect(options.cookies.getAll()).toEqual([]);
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://agorbis.com/auth/callback?consent=nonce",
        skipBrowserRedirect: true,
      },
    });
    expect(JSON.stringify(mocks.signInWithOAuth.mock.calls[0])).not.toMatch(
      /captcha_?token/i,
    );
  });

  it("inicia Facebook con la credencial del servidor y solicita correo", async () => {
    await startSocialOAuthWithServerSecret(
      event({ "sb-project-auth-token": "incoming-session" }),
      "facebook",
      "https://agorbis.com/auth/callback?consent=nonce",
    );

    const [, key, options] = mocks.createServerClient.mock.calls[0];
    expect(key).toBe("sb_secret_server_only_test");
    expect(options.cookies.getAll()).toEqual([]);
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "facebook",
      options: {
        redirectTo: "https://agorbis.com/auth/callback?consent=nonce",
        skipBrowserRedirect: true,
        scopes: "email",
      },
    });
  });

  it.each(["google", "facebook"])("canjea OAuth con sb_secret leyendo sólo PKCE y limpia tokens de %s", async (provider) => {
    const sessionWithProvider = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      provider_token: `${provider}-token`,
      provider_refresh_token: `${provider}-refresh`,
    };
    const cleanSession = {
      access_token: "access-token",
      refresh_token: "refresh-token",
    };
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-id" }, session: sessionWithProvider },
      error: null,
    });
    mocks.setSession.mockResolvedValue({
      data: { user: { id: "user-id" }, session: cleanSession },
      error: null,
    });
    const ev = event({
      "sb-project-auth-token-code-verifier": "fixed-verifier",
      "sb-project-auth-token-flows-code-verifier": "flow-index",
      "sb-project-auth-token-flow-abcdefgh-code-verifier": "flow-verifier",
      "sb-project-auth-token-flow-abcdefgh-code-verifier.0": "flow-chunk",
      "sb-project-auth-token": "session-that-must-not-be-read",
      "sb-project-auth-token.0": "session-chunk-that-must-not-be-read",
      unrelated: "ignored",
    });

    const result = await exchangeOAuthCodeWithServerSecret(ev, "pkce-code");

    const [, key, options] = mocks.createServerClient.mock.calls[0];
    expect(key).toBe("sb_secret_server_only_test");
    expect(options.cookies.getAll()).toEqual([
      {
        name: "sb-project-auth-token-code-verifier",
        value: "fixed-verifier",
      },
      {
        name: "sb-project-auth-token-flows-code-verifier",
        value: "flow-index",
      },
      {
        name: "sb-project-auth-token-flow-abcdefgh-code-verifier",
        value: "flow-verifier",
      },
      {
        name: "sb-project-auth-token-flow-abcdefgh-code-verifier.0",
        value: "flow-chunk",
      },
    ]);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(
      JSON.stringify(mocks.exchangeCodeForSession.mock.calls[0]),
    ).not.toMatch(/captcha_?token/i);
    expect(result).toMatchObject({
      data: { session: cleanSession },
      oauthProviderTokensSeen: true,
      providerTokenCleanupFailed: false,
    });
  });

  it("borra la sesión local si no puede retirar tokens del proveedor", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: "user-id" },
        session: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          provider_token: "google-token",
        },
      },
      error: null,
    });
    mocks.setSession.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("cleanup failed"),
    });

    const result = await exchangeOAuthCodeWithServerSecret(
      event({
        "sb-project-auth-token-code-verifier": "fixed-verifier",
      }),
      "pkce-code",
    );

    expect(mocks.adminSignOut).toHaveBeenCalledWith("access-token", "local");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result).toMatchObject({
      data: { user: null, session: null },
      oauthProviderTokensSeen: true,
      providerTokenCleanupFailed: true,
    });
  });

  it("no construye ni invoca Auth cuando A falla", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({
      ok: false,
      reason: "response",
    });

    await expect(
      signUpWithTurnstile(event(), {
        email: "persona@agorbis.com",
        password: "password-opaca",
        turnstileToken: "token-a",
      }),
    ).resolves.toEqual({ turnstileVerified: false });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("registra el motivo del rechazo de A sin el token ni el correo", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({
      ok: false,
      reason: "response",
      siteverifyErrors: ["invalid-input-response"],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await signUpWithTurnstile(event(), {
      email: "persona@agorbis.com",
      password: "password-opaca",
      turnstileToken: "token-a-opaco",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({
      level: "warn",
      scope: "auth/turnstile",
      action: "signup",
      reason: "response",
      siteverifyErrors: ["invalid-input-response"],
    });
    expect(line).not.toContain("token-a-opaco");
    expect(line).not.toContain("persona@agorbis.com");
    warn.mockRestore();
  });

  it("valida A antes de Auth y llama signup sin token B", async () => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });

    await expect(
      signUpWithTurnstile(event(), {
        email: "persona@agorbis.com",
        password: "password-opaca",
        turnstileToken: "token-a",
      }),
    ).resolves.toMatchObject({ turnstileVerified: true });

    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.anything(),
      "token-a",
      TURNSTILE_ACTIONS.signup,
    );
    expect(mocks.verifyTurnstileToken.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServerClient.mock.invocationCallOrder[0],
    );

    const [, key, options] = mocks.createServerClient.mock.calls[0];
    expect(key).toBe("sb_secret_server_only_test");
    expect(options.cookies.getAll()).toEqual([]);
    expect(options.global.headers).toEqual({
      "Sb-Forwarded-For": "203.0.113.9",
    });
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "persona@agorbis.com",
      password: "password-opaca",
      options: {
        emailRedirectTo: "https://agorbis.com/auth/confirm?next=%2Fonboarding",
      },
    });
    expect(JSON.stringify(mocks.signUp.mock.calls[0])).not.toMatch(
      /captcha_?token/i,
    );
  });

  it("no reenvía headers de IP sin el runtime marker de Cloudflare", async () => {
    await startGoogleOAuthWithServerSecret(
      event(
        {},
        {
          env: { AGORBIS_RUNTIME: "" },
          headers: {
            "CF-Connecting-IP": "203.0.113.9",
            "x-forwarded-for": "198.51.100.8",
            "x-vercel-forwarded-for": "198.51.100.9",
          },
        },
      ),
      "https://agorbis.com/auth/callback",
    );

    const [, , options] = mocks.createServerClient.mock.calls[0];
    expect(options.global.headers).toEqual({});
  });

  it.each(["signup", "resend"] as const)("%s conserva el destino en el correo de confirmación", async (flow) => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });
    const next = "/c/barrio/reclamos/nuevo?categoria=veredas#descripcion";
    const input = { email: "persona@agorbis.com", password: "password-opaca", turnstileToken: "token-a", next };
    if (flow === "signup") await signUpWithTurnstile(event(), input);
    else await resendConfirmationWithTurnstile(event(), input);
    const call = flow === "signup" ? mocks.signUp : mocks.resend;
    const confirmation = new URL(call.mock.calls[0][0].options.emailRedirectTo);
    expect(confirmation.origin).toBe("https://agorbis.com");
    expect(confirmation.pathname).toBe("/auth/confirm");
    expect(confirmation.searchParams.get("next")).toBe(next);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])("el correo de registro rechaza un destino externo: %s", async (next) => {
    mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });
    await signUpWithTurnstile(event(), { email: "persona@agorbis.com", password: "password-opaca", turnstileToken: "token-a", next });
    const confirmation = new URL(mocks.signUp.mock.calls[0][0].options.emailRedirectTo);
    expect(confirmation.searchParams.get("next")).toBe("/");
  });

  it.each([
    {
      name: "password login",
      action: TURNSTILE_ACTIONS.passwordLogin,
      authCall: mocks.signInWithPassword,
      run: () =>
        signInWithTurnstile(event(), {
          email: "persona@agorbis.com",
          password: "password-opaca",
          turnstileToken: "token-a",
        }),
    },
    {
      name: "magic link",
      action: TURNSTILE_ACTIONS.magicLink,
      authCall: mocks.signInWithOtp,
      run: () =>
        sendMagicLinkWithTurnstile(event(), {
          email: "persona@agorbis.com",
          next: "/perfil",
          turnstileToken: "token-a",
        }),
    },
    {
      name: "password reset",
      action: TURNSTILE_ACTIONS.passwordReset,
      authCall: mocks.resetPasswordForEmail,
      run: () =>
        requestPasswordResetWithTurnstile(event(), {
          email: "persona@agorbis.com",
          turnstileToken: "token-a",
        }),
    },
    {
      name: "resend confirmation",
      action: TURNSTILE_ACTIONS.resendConfirmation,
      authCall: mocks.resend,
      run: () =>
        resendConfirmationWithTurnstile(event(), {
          email: "persona@agorbis.com",
          turnstileToken: "token-a",
        }),
    },
  ])(
    "$name valida Siteverify antes de construir e invocar Auth, sin token B",
    async ({ action, authCall, run }) => {
      mocks.verifyTurnstileToken.mockResolvedValue({ ok: true });

      await run();

      expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
        expect.anything(),
        "token-a",
        action,
      );
      expect(
        mocks.verifyTurnstileToken.mock.invocationCallOrder[0],
      ).toBeLessThan(mocks.createServerClient.mock.invocationCallOrder[0]);
      expect(mocks.createServerClient.mock.invocationCallOrder[0]).toBeLessThan(
        authCall.mock.invocationCallOrder[0],
      );
      expect(JSON.stringify(authCall.mock.calls[0])).not.toMatch(
        /captcha_?token/i,
      );
    },
  );
});
