import { describe, expect, it } from "vitest";
import type { DocumentMeta } from "@qwik.dev/router";
import { communityShareDescription, communityShareMeta } from "./social-meta";

const INVITATION =
  "Conocé Mar del Plata en Agorbis: su historia, su geografía, su cultura, y participá de sus encuestas, debates, reclamos y proyectos.";

function content(meta: DocumentMeta[], key: string): string | undefined {
  return meta.find((item) => item.property === key || item.name === key)
    ?.content;
}

describe("communityShareDescription", () => {
  it("suma la invitación a una descripción corta", () => {
    expect(
      communityShareDescription("Partido de General Pueyrredón", INVITATION),
    ).toBe(`Partido de General Pueyrredón. ${INVITATION}`);
  });

  it("no duplica el punto final de la descripción", () => {
    expect(communityShareDescription("Ciudad costera.", INVITATION)).toBe(
      `Ciudad costera. ${INVITATION}`,
    );
  });

  it("usa sólo la invitación si no hay descripción", () => {
    expect(communityShareDescription(null, INVITATION)).toBe(INVITATION);
    expect(communityShareDescription("   ", INVITATION)).toBe(INVITATION);
  });

  it("recorta una descripción larga", () => {
    const result = communityShareDescription("a".repeat(500), INVITATION);

    expect(Array.from(result).length).toBeLessThanOrEqual(301);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("communityShareMeta", () => {
  const meta = communityShareMeta({
    title: "🌊 Mar del Plata · Agorbis",
    description: "Partido de General Pueyrredón. Conocé Mar del Plata.",
    pageUrl: "https://agorbis.com/c/mar-del-plata/",
    imageUrl: "https://agorbis.com/og.png",
  });

  it("declara imagen grande con medidas para que la tarjeta no salga vacía", () => {
    expect(content(meta, "og:image")).toBe("https://agorbis.com/og.png");
    expect(content(meta, "og:image:width")).toBe("1200");
    expect(content(meta, "twitter:card")).toBe("summary_large_image");
    expect(content(meta, "twitter:image")).toBe("https://agorbis.com/og.png");
  });

  it("declara la URL canónica y el sitio", () => {
    expect(content(meta, "og:url")).toBe(
      "https://agorbis.com/c/mar-del-plata/",
    );
    expect(content(meta, "og:site_name")).toBe("Agorbis");
  });

  it("repite título y descripción en las etiquetas de cada red", () => {
    expect(content(meta, "description")).toContain("General Pueyrredón");
    expect(content(meta, "og:title")).toBe("🌊 Mar del Plata · Agorbis");
    expect(content(meta, "twitter:title")).toBe("🌊 Mar del Plata · Agorbis");
    expect(content(meta, "twitter:description")).toContain(
      "General Pueyrredón",
    );
  });
});
