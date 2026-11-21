import type { RequestEventLoader } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentType } from "./database.types.helpers";

const mocks = vi.hoisted(() => ({
  requireResident: vi.fn(),
  supabase: vi.fn(),
  viewerIsMember: vi.fn(),
  loadQuotaSummary: vi.fn(),
}));
vi.mock("./session", async (original) => ({
  ...(await original<typeof import("./session")>()),
  requireResident: mocks.requireResident,
  supabase: mocks.supabase,
  viewerIsMember: mocks.viewerIsMember,
}));
vi.mock("./quota", async (original) => ({
  ...(await original<typeof import("./quota")>()),
  loadQuotaSummary: mocks.loadQuotaSummary,
}));

import { loadCreateContext } from "./content-actions";

function event(method = "GET") {
  return {
    params: { slug: "mar-del-plata" },
    request: { method },
    locale: () => "es",
    redirect: vi.fn(
      (status: number, href: string) => new Error(`${status}:${href}`),
    ),
  } as unknown as RequestEventLoader;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireResident.mockResolvedValue({ userId: "resident" });
  mocks.viewerIsMember.mockReturnValue(true);
  const community = {
    id: "city",
    slug: "mar-del-plata",
    name: "Mar del Plata",
    path: "earth.ar.ba.mdp",
    level: 4,
    emoji: "📍",
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => Promise.resolve({ data: [community] }),
    maybeSingle: () => Promise.resolve({ data: community, error: null }),
  };
  mocks.supabase.mockReturnValue({ from: () => builder });
  mocks.loadQuotaSummary.mockResolvedValue({
    unavailable: false,
    unlimited: false,
    entries: [],
  });
});

describe("entrada a los formularios de publicación", () => {
  it.each<ContentType>(["poll", "debate", "claim", "project"])(
    "orienta antes de escribir %s en una comunidad ajena",
    async (type) => {
      mocks.viewerIsMember.mockReturnValue(false);
      await expect(loadCreateContext(event(), type)).rejects.toThrow(
        `302:/publicar?comunidad=mar-del-plata&tipo=${type}`,
      );
    },
  );

  it("orienta fuera del formulario cuando el cupo consultado está agotado", async () => {
    mocks.loadQuotaSummary.mockResolvedValue({
      unavailable: false,
      unlimited: false,
      entries: [
        { communitySlug: "mar-del-plata", contentType: "claim", remaining: 0 },
      ],
    });
    await expect(loadCreateContext(event(), "claim")).rejects.toThrow(
      "302:/publicar?comunidad=mar-del-plata&tipo=claim",
    );
  });

  it("conserva el resultado del POST cuando publicar consumió el último cupo", async () => {
    mocks.loadQuotaSummary.mockResolvedValue({
      unavailable: false,
      unlimited: false,
      entries: [
        { communitySlug: "mar-del-plata", contentType: "claim", remaining: 0 },
      ],
    });
    const ev = event("POST");
    const context = await loadCreateContext(ev, "claim");
    expect(ev.redirect).not.toHaveBeenCalled();
    expect(context.quota?.remaining).toBe(0);
  });
});
