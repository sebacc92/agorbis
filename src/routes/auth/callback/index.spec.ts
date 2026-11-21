import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeOAuthCodeWithServerSecret: vi.fn(),
  hasCurrentLegalAcceptance: vi.fn(),
  logEvent: vi.fn(),
  logFailure: vi.fn(),
  revokeAndClearProtectedAuthSession: vi.fn(),
  persistGoogleAuthConsent: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("~/lib/protected-auth", () => ({
  exchangeOAuthCodeWithServerSecret:
    mocks.exchangeOAuthCodeWithServerSecret,
  revokeAndClearProtectedAuthSession:
    mocks.revokeAndClearProtectedAuthSession,
}));

vi.mock("~/lib/log", () => ({
  logEvent: mocks.logEvent,
  logFailure: mocks.logFailure,
}));
vi.mock("~/lib/google-auth-consent", () => ({ persistGoogleAuthConsent: mocks.persistGoogleAuthConsent }));

vi.mock("~/lib/legal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/legal")>()),
  hasCurrentLegalAcceptance: mocks.hasCurrentLegalAcceptance,
}));

import { onGet } from "./index";
import { oauthConsentMarker } from "~/lib/auth-security";
import { OAUTH_CONTEXT_COOKIE } from "~/lib/oauth-context";
import {
  COMMUNITY_RULES_VERSION,
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  MINIMUM_ACCOUNT_AGE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "~/lib/legal";

function fixtureSessionToken(method: string) {
  const payload = Buffer.from(JSON.stringify({ email: "fixture@example.test", phone: "", amr: [{ method, timestamp: 1770000000 }] })).toString("base64url");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  return `${header}.${payload}.c2lnbmF0dXJl`;
}
const OAUTH_ACCESS_TOKEN = fixtureSessionToken("oauth");
const EMAIL_ACCESS_TOKEN = fixtureSessionToken("otp");

const currentVersions = {
  terms: TERMS_VERSION,
  privacy: PRIVACY_VERSION,
  communityRules: COMMUNITY_RULES_VERSION,
  internationalTransfers: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  minimumAge: MINIMUM_ACCOUNT_AGE,
};

function contextMarker(provider = "google", intent = "login", next = "/comunidades") {
  const startedAt = new Date().toISOString();
  return JSON.stringify({
    format: 1, nonce: "nonce", provider, intent, startedAt,
    nextHash: createHash("sha256").update(next).digest("hex"),
    ...(provider === "google" ? { googleDecision: { version: "test-v1", contentHash: "a".repeat(64), startedAt, locale: "es" } } : {}),
  });
}

function callbackEvent(
  query = "code=pkce-code&intent=login&consent=nonce&next=%2Fcomunidades",
  marker: string | null = oauthConsentMarker("nonce", currentVersions),
) {
  const values: Record<string, string> = {
    PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    PUBLIC_GOOGLE_AUTH_ENABLED: "true",
    PUBLIC_FACEBOOK_AUTH_ENABLED: "true",
  };
  const url = new URL(`https://agorbis.com/auth/callback?${query}`);
  return {
    cookie: { delete: vi.fn(), get: (name: string) => name === OAUTH_CONTEXT_COOKIE ? { value: contextMarker() } : marker ? { value: marker } : null },
    env: { get: (name: string) => values[name] },
    headers: new Headers(),
    redirect: vi.fn((status: number, location: string) =>
      Object.assign(new Error("redirect"), { status, location }),
    ),
    sharedMap: new Map(),
    request: new Request(url),
    url,
  };
}

function successfulExchange(oauthProviderTokensSeen = true) {
  return {
    data: {
      user: { id: "user-id", app_metadata: { provider: oauthProviderTokensSeen ? "google" : "email" } },
      session: { access_token: oauthProviderTokensSeen ? OAUTH_ACCESS_TOKEN : EMAIL_ACCESS_TOKEN, refresh_token: "refresh-token" },
    },
    error: null,
    oauthProviderTokensSeen,
    providerTokenCleanupFailed: false,
  };
}

describe("callback OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.persistGoogleAuthConsent.mockResolvedValue(true);
  });
  it.each(["google", "facebook"])("deriva la cuenta nueva de %s al consentimiento autenticado", async (provider) => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue({
      data: {
        user: { id: "user-id", app_metadata: { provider } },
        session: { access_token: OAUTH_ACCESS_TOKEN, refresh_token: "refresh-token" },
      },
      error: null,
      oauthProviderTokensSeen: true,
      providerTokenCleanupFailed: false,
    });
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
    mocks.createClient.mockReturnValue({});
    const values: Record<string, string> = {
      PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
      PUBLIC_GOOGLE_AUTH_ENABLED: "true",
      PUBLIC_FACEBOOK_AUTH_ENABLED: "true",
    };
    const nonce = "nonce";
    const marker = oauthConsentMarker(nonce, {
      terms: TERMS_VERSION,
      privacy: PRIVACY_VERSION,
      communityRules: COMMUNITY_RULES_VERSION,
      internationalTransfers: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
      minimumAge: MINIMUM_ACCOUNT_AGE,
    });
    const ev = {
      cookie: { delete: vi.fn(), get: (name: string) => ({ value: name === OAUTH_CONTEXT_COOKIE ? contextMarker(provider, "register") : marker }) },
      env: { get: (name: string) => values[name] },
      headers: new Headers(),
      redirect: vi.fn((status: number, location: string) => Object.assign(new Error("redirect"), { status, location })),
      sharedMap: new Map(),
      request: new Request("https://agorbis.com/auth/callback"),
      url: new URL(`https://agorbis.com/auth/callback?code=pkce-code&intent=register&consent=${nonce}&next=%2Fcomunidades`),
    };

    await expect(onGet(ev as never)).rejects.toMatchObject({
      status: 302,
      location: "/consentimiento?next=%2Fcomunidades",
    });
    const [, key, options] = mocks.createClient.mock.calls.at(-1)!;
    expect(key).toBe("sb_publishable_test");
    await expect(options.accessToken()).resolves.toBe(OAUTH_ACCESS_TOKEN);
    expect(ev.headers.get("Cache-Control")).toBe("no-store");
    expect(ev.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("falla cerrado y limpia la sesión si falta la marca previa válida", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue({
      data: {
        user: { id: "user-id" },
        session: {
          access_token: OAUTH_ACCESS_TOKEN,
          refresh_token: "refresh-token",
        },
      },
      error: null,
      oauthProviderTokensSeen: true,
      providerTokenCleanupFailed: false,
    });
    mocks.revokeAndClearProtectedAuthSession.mockResolvedValue({
      error: null,
      revocationError: null,
      cleanupError: null,
    });
    const redirect = vi.fn((status: number, location: string) =>
      Object.assign(new Error("redirect"), { location, status }),
    );
    const cookieDelete = vi.fn();
    const ev = {
      cookie: {
        delete: cookieDelete,
        get: () => ({ value: "invalid-or-expired-marker" }),
      },
      env: { get: () => undefined },
      headers: new Headers(),
      redirect,
      request: new Request(
        "https://agorbis.com/auth/callback?code=pkce-code&intent=login&consent=nonce",
      ),
      sharedMap: new Map(),
      url: new URL(
        "https://agorbis.com/auth/callback?code=pkce-code&intent=login&consent=nonce",
      ),
    };

    await expect(onGet(ev as never)).rejects.toMatchObject({
      location: "/ingresar?oauth_error=invalid",
      status: 302,
    });

    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledWith(
      ev,
      OAUTH_ACCESS_TOKEN,
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(cookieDelete).toHaveBeenCalled();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "warn",
      expect.objectContaining({ reason: "missing_or_expired_preflight" }),
    );
  });
});

describe("regresos OAuth y compatibilidad de correo", () => {
  const profile = { home_community_id: "home-id" as string | null };
  const maybeSingle = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const from = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    profile.home_community_id = "home-id";
    maybeSingle.mockImplementation(async () => ({ data: profile, error: null }));
    eq.mockReturnValue({ maybeSingle });
    select.mockReturnValue({ eq });
    from.mockReturnValue({ select });
    mocks.createClient.mockReturnValue({ from });
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue(successfulExchange());
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(true);
    mocks.persistGoogleAuthConsent.mockResolvedValue(true);
    mocks.revokeAndClearProtectedAuthSession.mockResolvedValue({ error: null, revocationError: null, cleanupError: null });
  });

  it("una cuenta existente con aceptación vigente vuelve a su destino interno con su JWT", async () => {
    const ev = callbackEvent();
    await expect(onGet(ev as never)).rejects.toMatchObject({ status: 302, location: "/comunidades" });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("home_community_id");
    expect(eq).toHaveBeenCalledWith("id", "user-id");
    const [, key, options] = mocks.createClient.mock.calls[0];
    expect(key).toBe("sb_publishable_test");
    await expect(options.accessToken()).resolves.toBe(OAUTH_ACCESS_TOKEN);
    expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  });

  it("una cuenta sin comunidad termina el onboarding antes de ir a next", async () => {
    profile.home_community_id = null;
    await expect(onGet(callbackEvent() as never)).rejects.toMatchObject({ status: 302, location: "/onboarding?next=%2Fcomunidades" });
  });

  it("OAuth conserva la publicación y su fragmento al pedir la residencia", async () => {
    profile.home_community_id = null;
    const next = "/c/barrio/reclamos/nuevo?categoria=veredas#descripcion";
    const ev = callbackEvent(`code=pkce-code&intent=login&consent=nonce&next=${encodeURIComponent(next)}`);
    ev.cookie.get = (name: string) => ({ value: name === OAUTH_CONTEXT_COOKIE ? contextMarker("google", "login", next) : oauthConsentMarker("nonce", currentVersions) });
    await expect(onGet(ev as never)).rejects.toMatchObject({ status: 302, location: `/onboarding?next=${encodeURIComponent(next)}` });
  });

  it("una cuenta existente con documentos pendientes pasa por el consentimiento durable", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
    await expect(onGet(callbackEvent() as never)).rejects.toMatchObject({ location: "/consentimiento?next=%2Fcomunidades" });
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])("rechaza un destino cambiado después del inicio: %s", async (next) => {
    const ev = callbackEvent(`code=pkce-code&intent=login&consent=nonce&next=${encodeURIComponent(next)}`);
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid" });
  });

  it.each(["login", "register"])("cancelar %s no canjea código ni crea otra sesión", async (intent) => {
    const ev = callbackEvent(`error=access_denied&error_description=fixture&code=untrusted-code&intent=${intent}&consent=nonce`);
    await expect(onGet(ev as never)).rejects.toMatchObject({ status: 302, location: `${intent === "register" ? "/registro" : "/ingresar"}?oauth_error=cancelled` });
    expect(mocks.exchangeOAuthCodeWithServerSecret).not.toHaveBeenCalled();
    expect(mocks.revokeAndClearProtectedAuthSession).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(ev.cookie.delete).toHaveBeenCalled();
    expect(ev.headers.get("Cache-Control")).toBe("no-store");
    expect(ev.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it.each([
    ["cookie vencida y ausente", null],
    ["nonce de otra ceremonia", oauthConsentMarker("different-nonce", currentVersions)],
    ["versión del aviso reemplazada", oauthConsentMarker("nonce", { ...currentVersions, internationalTransfers: "previous-version" })],
  ])("revoca la sesión del retorno con %s", async (_reason, marker) => {
    const ev = callbackEvent(undefined, marker);
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid&next=%2Fcomunidades" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledWith(ev, OAUTH_ACCESS_TOKEN);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un retorno OAuth sin parámetros de ceremonia tampoco evita el consentimiento previo", async () => {
    const ev = callbackEvent("code=pkce-code", null);
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledWith(ev, OAUTH_ACCESS_TOKEN);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un código PKCE vencido o ya usado vuelve al ingreso sin establecer sesión de aplicación", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue({
      ...successfulExchange(),
      data: { user: null, session: null },
      error: { code: "flow_state_expired", message: "Fixture expired code" },
    });
    const ev = callbackEvent();
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid&next=%2Fcomunidades" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(ev.cookie.delete).toHaveBeenCalled();
  });

  it("no permite continuar cuando no se pudieron retirar los tokens del proveedor", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue({
      ...successfulExchange(),
      data: { user: null, session: null },
      error: new Error("Fixture cleanup failure"),
      providerTokenCleanupFailed: true,
    });
    await expect(onGet(callbackEvent() as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=session&next=%2Fcomunidades" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.hasCurrentLegalAcceptance).not.toHaveBeenCalled();
  });

  it("un enlace PKCE de correo no necesita una marca OAuth", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue(successfulExchange(false));
    await expect(onGet(callbackEvent("code=email-code&next=%2Fperfil", null) as never)).rejects.toMatchObject({ location: "/perfil" });
    expect(mocks.revokeAndClearProtectedAuthSession).not.toHaveBeenCalled();
    expect(mocks.hasCurrentLegalAcceptance).toHaveBeenCalled();
    expect(mocks.persistGoogleAuthConsent).not.toHaveBeenCalled();
  });

  it("la recuperación por correo conserva su destino aunque falten las aceptaciones actuales", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue(successfulExchange(false));
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
    await expect(onGet(callbackEvent("code=email-code&recovery=1&next=%2Fcomunidades", null) as never)).rejects.toMatchObject({ location: "/perfil/contrasena?recovery=1" });
    expect(mocks.hasCurrentLegalAcceptance).not.toHaveBeenCalled();
    expect(mocks.revokeAndClearProtectedAuthSession).not.toHaveBeenCalled();
    expect(mocks.persistGoogleAuthConsent).not.toHaveBeenCalled();
  });

  it("registra Google con el JWT autenticado antes de habilitar el resto del recorrido", async () => {
    await expect(onGet(callbackEvent() as never)).rejects.toMatchObject({ location: "/comunidades" });
    expect(mocks.persistGoogleAuthConsent).toHaveBeenCalledWith(expect.objectContaining({ from }), expect.objectContaining({ version: "test-v1", contentHash: "a".repeat(64), locale: "es" }));
    expect(mocks.persistGoogleAuthConsent.mock.invocationCallOrder[0]).toBeLessThan(mocks.hasCurrentLegalAcceptance.mock.invocationCallOrder[0]);
  });

  it("rechaza OAuth sin tokens del proveedor ni parámetros en lugar de tratarlo como correo", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue({ ...successfulExchange(), oauthProviderTokensSeen: false });
    const ev = callbackEvent("code=pkce-code&next=%2Fperfil", null);
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid&next=%2Fperfil" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledWith(ev, OAUTH_ACCESS_TOKEN);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.persistGoogleAuthConsent).not.toHaveBeenCalled();
  });

  it("exige decisión Google aunque el canje no incluya tokens del proveedor", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue({ ...successfulExchange(), oauthProviderTokensSeen: false });
    await expect(onGet(callbackEvent() as never)).rejects.toMatchObject({ location: "/comunidades" });
    expect(mocks.persistGoogleAuthConsent).toHaveBeenCalledOnce();
  });

  it("no atribuye a Google una sesión obtenida por correo con parámetros OAuth", async () => {
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue(successfulExchange(false));
    await expect(onGet(callbackEvent() as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid&next=%2Fcomunidades" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledOnce();
    expect(mocks.persistGoogleAuthConsent).not.toHaveBeenCalled();
  });

  it("un método de sesión desconocido falla cerrado y revoca sólo la sesión nueva", async () => {
    const exchange = successfulExchange(false);
    exchange.data.session.access_token = fixtureSessionToken("unknown_method");
    mocks.exchangeOAuthCodeWithServerSecret.mockResolvedValue(exchange);
    await expect(onGet(callbackEvent("code=unknown-code", null) as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("una retirada posterior o fallo de registro revoca la sesión nueva y no habilita participación", async () => {
    mocks.persistGoogleAuthConsent.mockResolvedValue(false);
    const ev = callbackEvent();
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=consent&next=%2Fcomunidades" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalledWith(ev, OAUTH_ACCESS_TOKEN);
    expect(mocks.hasCurrentLegalAcceptance).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("no convierte una ceremonia Google en recuperación para omitir su decisión", async () => {
    const ev = callbackEvent("code=pkce-code&intent=login&consent=nonce&next=%2Fcomunidades&recovery=1");
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid&next=%2Fcomunidades" });
    expect(mocks.persistGoogleAuthConsent).not.toHaveBeenCalled();
  });

  it("un proveedor apagado durante el regreso no deja una sesión nueva", async () => {
    const ev = callbackEvent();
    const env = ev.env.get;
    ev.env.get = (name) => name === "PUBLIC_GOOGLE_AUTH_ENABLED" ? "false" : env(name);
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: "/ingresar?oauth_error=invalid&next=%2Fcomunidades" });
    expect(mocks.revokeAndClearProtectedAuthSession).toHaveBeenCalled();
  });

  it.each(["login", "register"])("cancelar %s conserva la publicación para reintentar", async (intent) => {
    const next = "/c/barrio/reclamos/nuevo?categoria=veredas#descripcion";
    const ev = callbackEvent(`error=access_denied&intent=${intent}&next=${encodeURIComponent(next)}`);
    await expect(onGet(ev as never)).rejects.toMatchObject({ location: `${intent === "register" ? "/registro" : "/ingresar"}?oauth_error=cancelled&next=${encodeURIComponent(next)}` });
    expect(mocks.exchangeOAuthCodeWithServerSecret).not.toHaveBeenCalled();
  });
});
