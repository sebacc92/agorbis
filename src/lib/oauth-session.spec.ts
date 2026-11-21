import { describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  hasOAuthProviderTokens,
  stripOAuthProviderTokens,
} from "./oauth-session";
import type { DB } from "./supabase";

const baseSession = {
  access_token: "supabase-access",
  refresh_token: "supabase-refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user" },
};

describe("OAuth provider tokens", () => {
  it("detecta cualquiera de las credenciales del proveedor", () => {
    expect(hasOAuthProviderTokens({})).toBe(false);
    expect(hasOAuthProviderTokens({ provider_token: "google" })).toBe(true);
    expect(
      hasOAuthProviderTokens({ provider_refresh_token: "google-refresh" }),
    ).toBe(true);
  });

  it("reescribe la sesión usando sólo los tokens de Supabase", async () => {
    const setSession = vi.fn().mockResolvedValue({
      data: { session: baseSession },
      error: null,
    });
    const db = { auth: { setSession } } as unknown as DB;

    await expect(
      stripOAuthProviderTokens(db, {
        ...baseSession,
        provider_token: "google-provider-token",
      } as unknown as Session),
    ).resolves.toBe(true);
    expect(setSession).toHaveBeenCalledWith({
      access_token: "supabase-access",
      refresh_token: "supabase-refresh",
    });
  });

  it("falla cerrado si auth-js conserva el token del proveedor", async () => {
    const db = {
      auth: {
        setSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              ...baseSession,
              provider_token: "still-present",
            } as unknown as Session,
          },
          error: null,
        }),
      },
    } as unknown as DB;

    await expect(
      stripOAuthProviderTokens(db, {
        ...baseSession,
        provider_token: "google-provider-token",
      } as unknown as Session),
    ).resolves.toBe(false);
  });
});
