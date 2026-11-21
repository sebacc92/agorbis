import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readMyCommunityVisibility,
  setCommunityFollowing,
  setCommunityVisibility,
} from "./community-preferences";

const mocks = vi.hoisted(() => ({
  result: {
    data: true as boolean | null,
    error: null as { code: string; message: string } | null,
  },
  eq: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("./session", () => ({
  requireUser: mocks.requireUser,
  supabase: () => ({
    from: () => ({ delete: () => ({ eq: mocks.eq }), insert: mocks.insert }),
    rpc: mocks.rpc,
  }),
}));
type Event = Parameters<typeof setCommunityFollowing>[1];
const event = () =>
  ({
    fail: (status: number, payload: object) => ({
      failed: true,
      status,
      ...payload,
    }),
  }) as unknown as Event;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = { data: true, error: null };
  mocks.requireUser.mockResolvedValue({ userId: "viewer" });
  mocks.eq.mockImplementation(() => ({ eq: async () => mocks.result }));
  mocks.insert.mockImplementation(async () => mocks.result);
  mocks.rpc.mockImplementation(async () => mocks.result);
});

describe("preferencias comunitarias confirmadas", () => {
  it("un DELETE rechazado conserva seguimiento y permite reintentar con la sesión de la persona", async () => {
    mocks.result.error = { code: "XX000", message: "offline" };
    const input = { community_id: "community", following: "true" as const };
    expect(await setCommunityFollowing(input, event())).toMatchObject({
      failed: true,
      following: true,
      communityId: "community",
      message: "No pudimos dejar de seguir esta comunidad. Probá de nuevo.",
    });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "viewer");
    mocks.result.error = null;
    expect(await setCommunityFollowing(input, event())).toEqual({
      following: false,
      communityId: "community",
    });
  });
  it("un intento de seguir fallido conserva el estado previo y el gate conserva su explicación", async () => {
    mocks.result.error = {
      code: "42501",
      message: "GEOUNITY_ACCOUNT_SUSPENDED",
    };
    expect(
      await setCommunityFollowing(
        { community_id: "community", following: "false" },
        event(),
      ),
    ).toMatchObject({ failed: true, following: false, status: 403 });
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: "viewer",
      community_id: "community",
    });
  });
  it("una duplicación al seguir confirma el estado ya existente", async () => {
    mocks.result.error = { code: "23505", message: "duplicate" };
    expect(
      await setCommunityFollowing(
        { community_id: "community", following: "false" },
        event(),
      ),
    ).toEqual({ following: true, communityId: "community" });
  });
  it.each([true, false])(
    "la lectura devuelve sólo un booleano confirmado: %s",
    async (value) => {
      mocks.result.data = value;
      expect(
        await readMyCommunityVisibility(
          { rpc: mocks.rpc },
          "viewer",
          "community",
          true,
        ),
      ).toBe(value);
    },
  );
  it("error y dato ausente se mantienen desconocidos; no se consulta a quien no puede cambiar", async () => {
    mocks.result.error = { code: "42501", message: "unavailable" };
    expect(
      await readMyCommunityVisibility(
        { rpc: mocks.rpc },
        "viewer",
        "community",
        true,
      ),
    ).toBeNull();
    mocks.result = { data: null, error: null };
    expect(
      await readMyCommunityVisibility(
        { rpc: mocks.rpc },
        "viewer",
        "community",
        true,
      ),
    ).toBeNull();
    mocks.rpc.mockClear();
    expect(
      await readMyCommunityVisibility(
        { rpc: mocks.rpc },
        "viewer",
        "community",
        false,
      ),
    ).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["true", "false"] as const)(
    "el rechazo de visibilidad conserva el estado anterior al solicitar %s",
    async (desired) => {
      mocks.result.error = { code: "42501", message: "row-level security" };
      expect(
        await setCommunityVisibility(
          { community_id: "community", is_anonymous: desired },
          event(),
        ),
      ).toMatchObject({
        failed: true,
        isAnonymous: desired !== "true",
        communityId: "community",
      });
      expect(mocks.rpc).toHaveBeenCalledWith("set_community_visibility", {
        p_community: "community",
        p_is_anonymous: desired === "true",
      });
      mocks.result.error = null;
      expect(
        await setCommunityVisibility(
          { community_id: "community", is_anonymous: desired },
          event(),
        ),
      ).toEqual({ isAnonymous: desired === "true", communityId: "community" });
    },
  );
});
