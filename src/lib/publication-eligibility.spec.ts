import { describe, expect, it } from "vitest";
import type { CommunityRef } from "./community";
import type { QuotaSummary } from "./quota";
import {
  publicationBlockReason,
  publicationChooserHref,
  publicationCommunity,
} from "./publication-eligibility";

const chain: CommunityRef[] = [
  {
    id: "earth",
    slug: "earth",
    name: "Tierra",
    emoji: "🌍",
    level: 0,
    path: "earth",
  },
  {
    id: "local",
    slug: "mar-del-plata",
    name: "Mar del Plata",
    emoji: "📍",
    level: 4,
    path: "earth.ar.ba.mdp",
  },
];

function summary(remaining: number | null): QuotaSummary {
  return {
    unavailable: false,
    unlimited: remaining === null,
    entries: [
      {
        level: 4,
        communityId: "local",
        communitySlug: "mar-del-plata",
        communityName: "Mar del Plata",
        communityEmoji: "📍",
        contentType: "claim",
        monthlyLimit: remaining === null ? null : 10,
        remaining,
      },
    ],
  };
}

describe("destino y elegibilidad antes de escribir", () => {
  it("conserva una comunidad válida y reemplaza una ajena por la residencia más específica", () => {
    expect(publicationCommunity(chain, "earth")).toBe(chain[0]);
    expect(publicationCommunity(chain, "francia")).toBe(chain[1]);
    expect(publicationCommunity(chain, null)).toBe(chain[1]);
    expect(publicationCommunity([], "earth")).toBeNull();
  });

  it("orienta fuera de una comunidad ajena aunque el cupo sea ilimitado o desconocido", () => {
    expect(
      publicationBlockReason(false, summary(null), "francia", "claim"),
    ).toBe("not-member");
    expect(
      publicationBlockReason(
        false,
        { ...summary(2), unavailable: true },
        "francia",
        "claim",
      ),
    ).toBe("not-member");
  });

  it("detiene sólo un cupo conocido agotado del tipo y comunidad elegidos", () => {
    expect(
      publicationBlockReason(true, summary(0), "mar-del-plata", "claim"),
    ).toBe("quota-exhausted");
    expect(
      publicationBlockReason(true, summary(1), "mar-del-plata", "claim"),
    ).toBeNull();
    expect(
      publicationBlockReason(true, summary(null), "mar-del-plata", "claim"),
    ).toBeNull();
    expect(
      publicationBlockReason(true, summary(0), "earth", "claim"),
    ).toBeNull();
    expect(
      publicationBlockReason(true, summary(0), "mar-del-plata", "poll"),
    ).toBeNull();
  });

  it("no inventa un cupo agotado cuando la consulta falla o no devuelve la entrada", () => {
    expect(
      publicationBlockReason(
        true,
        { ...summary(0), unavailable: true },
        "mar-del-plata",
        "claim",
      ),
    ).toBeNull();
    expect(
      publicationBlockReason(
        true,
        { unavailable: false, unlimited: false, entries: [] },
        "mar-del-plata",
        "claim",
      ),
    ).toBeNull();
  });

  it("preserva tipo y comunidad al ofrecer alternativas", () => {
    const href = new URL(
      publicationChooserHref("mar-del-plata", "claim"),
      "https://agorbis.test",
    );
    expect(href.pathname).toBe("/publicar");
    expect(Object.fromEntries(href.searchParams)).toEqual({
      comunidad: "mar-del-plata",
      tipo: "claim",
    });
  });
});
