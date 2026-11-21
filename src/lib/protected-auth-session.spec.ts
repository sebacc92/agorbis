import type { RequestEventBase } from "@qwik.dev/router";
import type { CookieOptions } from "@supabase/ssr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeOAuthCodeWithServerSecret } from "./protected-auth";

const storageKey = "sb-project-auth-token";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.invalid",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function encodedCookie(value: unknown) {
  return `base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
}

function fixture(options: { providerToken?: string; userLookupFails?: boolean } = {}) {
  const accessToken = [
    { alg: "HS256", typ: "JWT" },
    { sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 },
  ].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .concat(Buffer.from("test-signature").toString("base64url")).join(".");
  const session = {
    access_token: accessToken,
    refresh_token: "supabase-refresh-fixture",
    token_type: "bearer",
    expires_in: 3600,
    user,
    ...(options.providerToken ? {
      provider_token: options.providerToken,
      provider_refresh_token: "provider-refresh-fixture",
    } : {}),
  };
  const values: Record<string, string> = {
    PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_fixture",
    SUPABASE_SECRET_KEY: "sb_secret_fixture",
  };
  // Qwik getAll() includes writes made during the request. Values cleared
  // with Set-Cookie become null; response headers replace cookies by name.
  const responseCookies = new Map<string, { value: string; options: CookieOptions }>();
  const liveCookies: Record<string, { value: string } | null> = {
    [`${storageKey}-code-verifier`]: { value: encodedCookie("fixture-verifier") },
  };
  const ev = {
    env: { get: (name: string) => values[name] },
    request: new Request("https://agorbis.com/auth/callback?code=fixture-code"),
    url: new URL("https://agorbis.com/auth/callback?code=fixture-code"),
    cookie: {
      getAll: () => ({ ...liveCookies }),
      set: vi.fn((name: string, value: string, options: CookieOptions) => {
        liveCookies[name] = value ? { value } : null;
        responseCookies.set(name, { value: decodeURIComponent(value), options });
      }),
    },
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== values.PUBLIC_SUPABASE_URL) throw new Error("Unexpected fixture host");
    if (url.pathname === "/auth/v1/token" && url.search === "?grant_type=pkce" && init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toEqual({ auth_code: "fixture-code", code_verifier: "fixture-verifier" });
      return Response.json(session);
    }
    if (url.pathname === "/auth/v1/user" && init?.method === "GET") {
      return options.userLookupFails
        ? Response.json({ code: "bad_jwt", message: "Fixture lookup failed" }, { status: 401 })
        : Response.json(user);
    }
    if (url.pathname === "/auth/v1/logout" && url.search === "?scope=local" && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fixture request: ${init?.method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const liveSessionCookies = () => [...responseCookies.entries()].filter(([name, cookie]) =>
    (name === storageKey || new RegExp(`^${storageKey}\\.\\d+$`).test(name)) && cookie.options.maxAge !== 0,
  );
  return { ev: ev as unknown as RequestEventBase, responseCookies, liveSessionCookies, fetchMock, accessToken };
}

afterEach(() => vi.unstubAllGlobals());

describe("cookies OAuth con los SDK reales y transporte simulado", () => {
  it.each(["provider-access-fixture", "provider-access-fixture".repeat(300)])(
    "la respuesta final no conserva tokens del proveedor, incluso si la sesión inicial se fragmentó (%#)",
    async (providerToken) => {
      const { ev, liveSessionCookies, accessToken } = fixture({ providerToken });
      const result = await exchangeOAuthCodeWithServerSecret(ev, "fixture-code");
      expect(result.error).toBeNull();
      expect(result.oauthProviderTokensSeen).toBe(true);
      expect(result.providerTokenCleanupFailed).toBe(false);
      const cookies = liveSessionCookies();
      expect(cookies.map(([name]) => name)).toEqual([storageKey]);
      const cookie = cookies[0][1];
      const persisted = JSON.parse(Buffer.from(cookie.value.slice("base64-".length), "base64url").toString());
      expect(persisted.access_token).toBe(accessToken);
      expect(persisted.refresh_token).toBe("supabase-refresh-fixture");
      expect(persisted).not.toHaveProperty("provider_token");
      expect(persisted).not.toHaveProperty("provider_refresh_token");
      expect(cookie.options).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/" });
    },
  );

  it.each(["provider-access-fixture", "provider-access-fixture".repeat(300)])("si falla la limpieza revoca localmente y borra la sesión y sus fragmentos (%#)", async (providerToken) => {
    const { ev, liveSessionCookies, fetchMock } = fixture({ providerToken, userLookupFails: true });
    const result = await exchangeOAuthCodeWithServerSecret(ev, "fixture-code");
    expect(result.providerTokenCleanupFailed).toBe(true);
    expect(result.data.session).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/v1/logout?scope=local"))).toBe(true);
    expect(liveSessionCookies()).toEqual([]);
  });

  it("conserva la sesión PKCE de correo sin otra consulta de usuario ni limpieza OAuth", async () => {
    const { ev, liveSessionCookies, fetchMock } = fixture();
    const result = await exchangeOAuthCodeWithServerSecret(ev, "fixture-code");
    expect(result.error).toBeNull();
    expect(result.oauthProviderTokensSeen).toBe(false);
    expect(result.providerTokenCleanupFailed).toBe(false);
    expect(liveSessionCookies()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
