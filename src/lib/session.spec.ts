import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("./supabase", () => ({
  createServerSupabase: mocks.createServerSupabase,
}));

import { ANONYMOUS, getViewer, invalidateViewer } from "./session";

type Event = Parameters<typeof getViewer>[0];

function event(visitCookie?: string): Event {
  const cookies = new Map<string, string>();
  if (visitCookie) cookies.set("agorbis-visit", visitCookie);
  return {
    env: { get: () => undefined },
    sharedMap: new Map<string, unknown>(),
    url: new URL("https://agorbis.example/c/earth"),
    cookie: {
      get: (name: string) =>
        cookies.has(name) ? { value: cookies.get(name)! } : null,
      set: (name: string, value: string) => cookies.set(name, value),
    },
  } as unknown as Event;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * Cliente falso con el mínimo de la API de PostgREST que usa `getViewer`.
 * Cada tabla devuelve lo que diga `responses`; el registro de llamadas permite
 * verificar cuántas consultas se hicieron y en qué orden.
 */
function fakeDb(responses: {
  user?: { id: string } | null;
  profile?: unknown;
  unread?: Promise<{ count: number }>;
  chain?: unknown[];
}) {
  const calls: string[] = [];
  const getUser = vi.fn(async () => {
    calls.push("auth.getUser");
    return { data: { user: responses.user ?? null } };
  });
  const from = vi.fn((table: string) => {
    calls.push(`from:${table}`);
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      in: () => builder,
      order: () => builder,
      maybeSingle: () => builder,
      then(
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const value =
          table === "profiles"
            ? Promise.resolve({ data: responses.profile ?? null })
            : table === "notifications"
              ? (responses.unread ?? Promise.resolve({ count: 0 }))
              : Promise.resolve({ data: responses.chain ?? [] });
        return value.then(onFulfilled, onRejected);
      },
    };
    return builder;
  });
  const rpc = vi.fn(async (name: string) => {
    calls.push(`rpc:${name}`);
    return { data: null, error: null };
  });
  return { calls, client: { auth: { getUser }, from, rpc }, getUser, from };
}

const PROFILE = {
  id: "user-1",
  role: "member",
  home_community_id: "community-1",
  home_community: { path: "earth.ar.caba" },
};

describe("getViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("un POST confirmado vuelve a leer la campana sin recrear el cliente de sesión", async () => {
    const responses = { user: { id: "user-1" }, profile: PROFILE, unread: Promise.resolve({ count: 3 }) };
    const db = fakeDb(responses);
    mocks.createServerSupabase.mockReturnValue(db.client);
    const ev = event();
    expect((await getViewer(ev)).unreadNotifications).toBe(3);
    responses.unread = Promise.resolve({ count: 0 });
    expect((await getViewer(ev)).unreadNotifications).toBe(3);
    invalidateViewer(ev);
    expect((await getViewer(ev)).unreadNotifications).toBe(0);
    expect(db.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.createServerSupabase).toHaveBeenCalledOnce();
  });

  it("los llamados simultáneos de una misma request comparten una sola resolución", async () => {
    const db = fakeDb({ user: { id: "user-1" }, profile: PROFILE });
    mocks.createServerSupabase.mockReturnValue(db.client);
    const ev = event();

    const [layout, page, action] = await Promise.all([
      getViewer(ev),
      getViewer(ev),
      getViewer(ev),
    ]);

    expect(page).toBe(layout);
    expect(action).toBe(layout);
    expect(db.getUser).toHaveBeenCalledOnce();
    expect(db.calls.filter((call) => call === "from:profiles")).toHaveLength(
      1,
    );
    expect(db.calls.filter((call) => call === "from:communities")).toHaveLength(
      1,
    );
    expect(mocks.createServerSupabase).toHaveBeenCalledOnce();
  });

  it("arma el visitante sin el embed y con la cadena de residencia", async () => {
    const chain = [
      { id: "1", slug: "earth", path: "earth", level: 0 },
      { id: "2", slug: "ar", path: "earth.ar", level: 1 },
    ];
    const db = fakeDb({
      user: { id: "user-1" },
      profile: PROFILE,
      unread: Promise.resolve({ count: 3 }),
      chain,
    });
    mocks.createServerSupabase.mockReturnValue(db.client);

    const viewer = await getViewer(event());

    expect(viewer).toEqual({
      userId: "user-1",
      profile: {
        id: "user-1",
        role: "member",
        home_community_id: "community-1",
      },
      residenceChain: chain,
      homePath: "earth.ar.caba",
      isModerator: false,
      unreadNotifications: 3,
      needsOnboarding: false,
    });
  });

  it("pide la cadena de residencia sin esperar al contador de no leídas", async () => {
    const unread = deferred<{ count: number }>();
    const db = fakeDb({
      user: { id: "user-1" },
      profile: PROFILE,
      unread: unread.promise,
    });
    mocks.createServerSupabase.mockReturnValue(db.client);

    const viewer = getViewer(event());
    await vi.waitFor(() => expect(db.calls).toContain("from:communities"));
    unread.resolve({ count: 1 });

    expect((await viewer).unreadNotifications).toBe(1);
  });

  it("no consulta la cadena cuando todavía no eligió residencia", async () => {
    const db = fakeDb({
      user: { id: "user-1" },
      profile: { ...PROFILE, home_community_id: null, home_community: null },
    });
    mocks.createServerSupabase.mockReturnValue(db.client);

    const viewer = await getViewer(event());

    expect(viewer.residenceChain).toEqual([]);
    expect(viewer.needsOnboarding).toBe(true);
    expect(db.calls).not.toContain("from:communities");
  });

  it("registra la visita sólo si no hay una marca reciente", async () => {
    const fresh = fakeDb({ user: { id: "user-1" }, profile: PROFILE });
    mocks.createServerSupabase.mockReturnValue(fresh.client);
    await getViewer(event());
    expect(fresh.calls).toContain("rpc:record_activation_visit");

    const throttled = fakeDb({ user: { id: "user-1" }, profile: PROFILE });
    mocks.createServerSupabase.mockReturnValue(throttled.client);
    await getViewer(event(String(Date.now())));
    expect(throttled.calls).not.toContain("rpc:record_activation_visit");
  });

  it("sin sesión devuelve el visitante anónimo y lo reutiliza", async () => {
    const db = fakeDb({ user: null });
    mocks.createServerSupabase.mockReturnValue(db.client);
    const ev = event();

    expect(await getViewer(ev)).toBe(ANONYMOUS);
    expect(await getViewer(ev)).toBe(ANONYMOUS);
    expect(db.getUser).toHaveBeenCalledOnce();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("una falla no queda cacheada: el siguiente llamado reintenta", async () => {
    const getUser = vi
      .fn()
      .mockRejectedValueOnce(new Error("red caída"))
      .mockResolvedValueOnce({ data: { user: null } });
    mocks.createServerSupabase.mockReturnValue({ auth: { getUser } });
    const ev = event();

    await expect(getViewer(ev)).rejects.toThrow("red caída");
    expect(await getViewer(ev)).toBe(ANONYMOUS);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
