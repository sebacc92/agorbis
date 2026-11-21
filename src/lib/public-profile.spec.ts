import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import {
  isPublicUsername,
  loadPublicProfileByUsername,
  publicProfileHref,
} from "./public-profile";

afterEach(() => vi.unstubAllGlobals());

describe("enlaces y resolución del perfil público", () => {
  const profile = {
    id: "33333333-3333-4333-8333-333333333333",
    username: "sofia_mdq",
    display_name: "Sofía",
    avatar_url: null,
  };

  it("resuelve un alias con el RPC limitado sin consultar profiles", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.pathname).toBe("/rest/v1/rpc/public_profile_by_username");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ p_username: "alias_anterior" });
      return Response.json([profile]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const db = createClient<Database>("https://fixture.supabase.co", "fixture-publishable-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const found = await loadPublicProfileByUsername(db, "ALIAS_ANTERIOR");
    expect(found).toEqual(profile);
    expect(publicProfileHref(found!)).toBe("/u/sofia_mdq");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["../perfil", "//evil.example", "sofia/mdq", "a", "a".repeat(21), "sofía"])(
    "rechaza el identificador inválido %s antes de consultar",
    async (username) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const db = createClient<Database>("https://fixture.supabase.co", "fixture-publishable-key", {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect(isPublicUsername(username)).toBe(false);
      expect(await loadPublicProfileByUsername(db, username)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(publicProfileHref({ ...profile, username })).toBe(`/u/${profile.id}`);
    },
  );

  it("un alias desconocido o eliminado no produce un destino", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const db = createClient<Database>("https://fixture.supabase.co", "fixture-publishable-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(await loadPublicProfileByUsername(db, "cuenta_eliminada")).toBeNull();
  });
});
