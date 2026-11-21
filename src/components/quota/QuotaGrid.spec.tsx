import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import type { QuotaSummary } from "~/lib/quota";
import { QuotaGrid } from "./QuotaGrid";

const row = (
  contentType: QuotaSummary["entries"][number]["contentType"],
  remaining: number | null,
  monthlyLimit: number | null,
) => ({
  communitySlug: "mar-del-plata",
  communityId: "c1",
  communityName: "Mar del Plata",
  communityEmoji: null,
  level: 4,
  contentType,
  remaining,
  monthlyLimit,
});

describe("accesos desde los cupos disponibles (D124)", () => {
  it("una fila tiene un solo enlace, al primer tipo con cupo, y conserva el conteo accesible", async () => {
    const summary: QuotaSummary = {
      unlimited: false,
      unavailable: false,
      entries: [
        row("claim", 2, 4),
        row("debate", 0, 3),
        row("poll", null, null),
      ],
    };
    const { document } = await renderWithLocale(<QuotaGrid summary={summary} />);
    const links = document.querySelectorAll("tbody a");
    expect(links).toHaveLength(1);
    // El orden de la tabla es encuesta, debate, reclamo, proyecto: la encuesta
    // sin límite va primero.
    expect(links[0].getAttribute("href")).toBe("/c/mar-del-plata/encuestas/nueva");
    expect(links[0].getAttribute("aria-label")).toBe("Publicar en Mar del Plata");
    expect(document.body.textContent).toContain("Te quedan 2 de 4");
    expect(document.body.textContent).toContain("Te quedan 0 de 3");
    expect(document.body.textContent).toContain("Sin límite");
  });

  it("sin cupo en ningún tipo, el enlace lleva a la comunidad y no promete publicar", async () => {
    const summary: QuotaSummary = {
      unlimited: false,
      unavailable: false,
      entries: [row("poll", 0, 1), row("claim", 0, 2)],
    };
    const { document } = await renderWithLocale(<QuotaGrid summary={summary} />);
    const link = document.querySelector("tbody a")!;
    expect(link.getAttribute("href")).toBe("/c/mar-del-plata");
    expect(link.textContent).not.toContain("Publicar");
  });
});
