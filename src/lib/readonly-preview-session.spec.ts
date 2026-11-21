import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("./supabase", () => ({
  createServerSupabase: mocks.createServerSupabase,
}));

import { ANONYMOUS, getViewer } from "./session";

function event(launchMode: string | undefined) {
  return {
    env: {
      get(name: string) {
        return name === "AGORBIS_LAUNCH_MODE" ? launchMode : undefined;
      },
    },
    sharedMap: new Map<string, unknown>(),
  } as Parameters<typeof getViewer>[0];
}

describe("sesión durante el preview read-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el visitante anónimo sin crear cliente ni llamar Supabase Auth", async () => {
    const value = await getViewer(event("public-read-only"));

    expect(value).toBe(ANONYMOUS);
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });

  it("no altera el flujo anónimo del modo abierto", async () => {
    const getUser = vi.fn(async () => ({ data: { user: null } }));
    mocks.createServerSupabase.mockReturnValue({ auth: { getUser } });

    const value = await getViewer(event("open"));

    expect(value).toBe(ANONYMOUS);
    expect(mocks.createServerSupabase).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
  });
});
