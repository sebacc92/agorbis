import type { RequestEventAction } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startOAuth: vi.fn(), logFailure: vi.fn(), notice: vi.fn() }));

vi.mock("./protected-auth", () => ({
  startSocialOAuthWithServerSecret: mocks.startOAuth,
}));
vi.mock("./log", () => ({ logFailure: mocks.logFailure }));
vi.mock("./supabase", () => ({ createServerSupabase: () => ({}) }));
vi.mock("./google-auth-consent", () => ({ readGoogleAuthNotice: mocks.notice }));

import {
  SIGNED_OUT_HOME,
  socialSignInSchema,
  startSocialSignIn,
} from "./auth-actions";
import {
  facebookAuthEnabled,
  OAUTH_CONSENT_COOKIE,
  OAUTH_CONSENT_MAX_AGE_SECONDS,
  validOauthConsentMarker,
} from "./auth-security";
import {
  COMMUNITY_RULES_VERSION,
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  MINIMUM_ACCOUNT_AGE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "./legal";

function event(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    PUBLIC_GOOGLE_AUTH_ENABLED: "true",
    PUBLIC_FACEBOOK_AUTH_ENABLED: "true",
    PUBLIC_SITE_URL: "https://agorbis.com",
    PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    ...overrides,
  };
  return {
    url: new URL("https://agorbis.com/registro"),
    env: { get: (name: string) => values[name] },
    cookie: { set: vi.fn() },
    locale: () => "es",
    fail: vi.fn((status: number, data: { message: string }) => ({
      ...data,
      status,
      failed: true,
    })),
    redirect: vi.fn((status: number, location: string) =>
      Object.assign(new Error("redirect"), { status, location }),
    ),
  };
}

const registration = {
  intent: "register" as const,
  next: "/comunidades?orden=recientes",
  age_confirmed: "si",
  terms_accepted: "si",
  privacy_acknowledged: "si",
  community_rules_accepted: "si",
  international_transfers_consented: "si",
  google_auth_consented: "si",
  google_notice_version: "test-google-v1",
  google_notice_hash: "a".repeat(64),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notice.mockResolvedValue({ version: "test-google-v1", content_hash: "a".repeat(64), issued_at: new Date().toISOString() });
  mocks.startOAuth.mockImplementation(async (_ev, provider, redirectTo) => {
    const target = new URL("https://project.supabase.co/auth/v1/authorize");
    target.searchParams.set("provider", provider);
    target.searchParams.set("redirect_to", redirectTo);
    return { data: { url: target.toString() }, error: null };
  });
});

describe("inicio OAuth social", () => {
  it("no inicia Google con el checkbox general solamente", async () => {
    const ev = event();
    await expect(startSocialSignIn({ ...registration, provider: "google", google_auth_consented: undefined }, ev as never)).resolves.toMatchObject({ status: 400 });
    expect(mocks.startOAuth).not.toHaveBeenCalled();
  });

  it("no contacta OAuth cuando no existe aviso Google aprobado", async () => {
    mocks.notice.mockResolvedValue(null);
    await expect(startSocialSignIn({ ...registration, provider: "google" }, event() as never)).resolves.toMatchObject({ status: 503 });
    expect(mocks.startOAuth).not.toHaveBeenCalled();
  });

  it.each(["google_notice_version", "google_notice_hash"])("rechaza un formulario cuyo %s quedó desactualizado", async (field) => {
    await expect(startSocialSignIn({ ...registration, provider: "google", [field]: "stale" }, event() as never)).resolves.toMatchObject({ status: 400 });
    expect(mocks.startOAuth).not.toHaveBeenCalled();
  });
  it("acepta únicamente Google y Facebook y exige un proveedor explícito", () => {
    for (const provider of ["google", "facebook"]) {
      expect(socialSignInSchema.safeParse({ provider }).success).toBe(true);
    }
    for (const provider of ["github", "Google", "", undefined]) {
      expect(socialSignInSchema.safeParse({ provider }).success).toBe(false);
    }
  });

  it("Facebook permanece cerrado salvo true explícito", () => {
    expect(facebookAuthEnabled("true")).toBe(true);
    for (const value of ["false", "TRUE", "1", "", undefined]) {
      expect(facebookAuthEnabled(value)).toBe(false);
    }
  });

  describe.each(["google", "facebook"] as const)("%s", (provider) => {
    it.each([undefined, "false", "yes"])(
      "rechaza el proveedor con flag %s aunque el otro esté habilitado",
      async (value) => {
        const ev = event({ [`PUBLIC_${provider.toUpperCase()}_AUTH_ENABLED`]: value });
        await expect(
          startSocialSignIn({ ...registration, provider }, ev as unknown as RequestEventAction),
        ).resolves.toMatchObject({ status: 400, failed: true });
        expect(mocks.startOAuth).not.toHaveBeenCalled();
        expect(ev.cookie.set).not.toHaveBeenCalled();
      },
    );

    it.each([
      "age_confirmed",
      "terms_accepted",
      "privacy_acknowledged",
      "community_rules_accepted",
      "international_transfers_consented",
    ])("no inicia registro sin %s", async (field) => {
      const ev = event();
      const data = { ...registration, provider, [field]: undefined };
      await expect(startSocialSignIn(data, ev as unknown as RequestEventAction)).resolves.toMatchObject({ status: 400 });
      expect(mocks.startOAuth).not.toHaveBeenCalled();
      expect(ev.cookie.set).not.toHaveBeenCalled();
    });

    it("redirige con nonce y consentimiento vinculado a las versiones actuales", async () => {
      const ev = event();
      await expect(startSocialSignIn({ ...registration, provider }, ev as unknown as RequestEventAction)).rejects.toMatchObject({ status: 302 });
      const callback = new URL(mocks.startOAuth.mock.calls[0][2]);
      expect(mocks.startOAuth.mock.calls[0][1]).toBe(provider);
      expect(callback.origin).toBe("https://agorbis.com");
      expect(callback.pathname).toBe("/auth/callback");
      expect(callback.searchParams.get("next")).toBe(registration.next);
      expect(callback.searchParams.get("intent")).toBe("register");
      expect(callback.searchParams.get("consent")).toBeTruthy();
      expect(ev.cookie.set).toHaveBeenCalledWith(
        OAUTH_CONSENT_COOKIE,
        expect.any(String),
        { path: "/auth/callback", maxAge: OAUTH_CONSENT_MAX_AGE_SECONDS, httpOnly: true, sameSite: "lax", secure: true },
      );
      expect(validOauthConsentMarker(ev.cookie.set.mock.calls[0][1], callback.searchParams.get("consent"), {
        terms: TERMS_VERSION,
        privacy: PRIVACY_VERSION,
        communityRules: COMMUNITY_RULES_VERSION,
        internationalTransfers: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
        minimumAge: MINIMUM_ACCOUNT_AGE,
      })).toBe(true);
    });

    it("el ingreso exige consentimiento previo sin repetir términos de registro", async () => {
      const ev = event();
      await expect(startSocialSignIn({ ...registration, provider, intent: "login", terms_accepted: undefined, community_rules_accepted: undefined }, ev as unknown as RequestEventAction)).rejects.toMatchObject({ status: 302 });
    });

    it.each(["age_confirmed", "privacy_acknowledged", "international_transfers_consented"])("el ingreso tampoco inicia OAuth sin %s", async (field) => {
      const ev = event();
      await expect(startSocialSignIn({ ...registration, provider, intent: "login", [field]: undefined }, ev as unknown as RequestEventAction)).resolves.toMatchObject({ status: 400 });
      expect(mocks.startOAuth).not.toHaveBeenCalled();
      expect(ev.cookie.set).not.toHaveBeenCalled();
    });

    it.each(["https://evil.example", "//evil.example", "/\\evil.example"])("neutraliza next externo %s", async (next) => {
      const ev = event();
      await expect(startSocialSignIn({ ...registration, provider, next }, ev as unknown as RequestEventAction)).rejects.toMatchObject({ status: 302 });
      expect(new URL(mocks.startOAuth.mock.calls[0][2]).searchParams.get("next")).toBe("/");
    });

    it.each([
      "https://evil.example/auth/v1/authorize",
      "https://project.supabase.co/auth/v1/callback",
      "javascript:alert(1)",
      "https://user:password@project.supabase.co/auth/v1/authorize",
      "https://project.supabase.co/auth/v1/authorize?provider=github",
    ])("rechaza destino inesperado %s", async (url) => {
      mocks.startOAuth.mockResolvedValue({ data: { url }, error: null });
      const ev = event();
      await expect(startSocialSignIn({ ...registration, provider }, ev as unknown as RequestEventAction)).resolves.toMatchObject({ status: 500 });
      expect(ev.cookie.set).not.toHaveBeenCalled();
      expect(ev.redirect).not.toHaveBeenCalled();
    });

    it("no crea la marca de consentimiento si Supabase falla", async () => {
      mocks.startOAuth.mockResolvedValue({ data: { url: null }, error: new Error("Provider disabled") });
      const ev = event();
      await expect(startSocialSignIn({ ...registration, provider }, ev as unknown as RequestEventAction)).resolves.toMatchObject({ status: 400 });
      expect(ev.cookie.set).not.toHaveBeenCalled();
    });
  });
});

describe("cierre de sesión", () => {
  it("vuelve al inicio con la marca que monta la limpieza local", () => {
    // `src/routes/index.tsx` monta `LocalDataCleanup` sólo con esta marca: si
    // cambia de un lado y no del otro, el cierre sin JavaScript deja datos.
    const url = new URL(SIGNED_OUT_HOME, "https://agorbis.com");
    expect(url.origin).toBe("https://agorbis.com");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("sesion")).toBe("cerrada");
  });
});
