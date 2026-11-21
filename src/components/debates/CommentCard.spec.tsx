import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { voteComment } from "~/lib/debate-actions";
import { showToast } from "~/components/ui/Toast";
import { CommentCard, type DebateCommentData } from "./CommentCard";

vi.mock("~/lib/debate-actions", () => ({ voteComment: vi.fn() }));
vi.mock("~/components/ui/Toast", () => ({ showToast: vi.fn() }));
vi.mock("~/components/moderation/ReportButton", () => ({
  ReportButton: () => null,
}));

const debateId = "c0000000-0000-4000-8000-000000000001";
const comment: DebateCommentData = {
  id: "d0000000-0000-4000-8000-000000000001",
  body: "Una propuesta para mejorar las conexiones entre ciudades.",
  score: 7,
  created_at: "2026-10-01T12:00:00Z",
  author: null,
  myVote: 1,
};
const permalink = `/debates/${debateId}?comentario=${comment.id}#comment-${comment.id}`;
const Example = component$<{ anonymous?: boolean }>(({ anonymous }) => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  return (
    <QwikRouterMockProvider
      url={`http://localhost/debates/${debateId}?comunidad=caba`}
    >
      <CommentCard
        comment={comment}
        debateId={debateId}
        canVote
        isAuthenticated={!anonymous}
      />
    </QwikRouterMockProvider>
  );
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recuperación de votos de comentarios", () => {
  it("restaura el estado ante un corte de red y deja volver a intentar", async () => {
    vi.mocked(voteComment).mockRejectedValueOnce(
      new Error("Network disconnected"),
    );
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const up = screen.querySelector<HTMLButtonElement>(
      'button[aria-label="Votar a favor"]',
    )!;
    const down = screen.querySelector<HTMLButtonElement>(
      'button[aria-label="Votar en contra"]',
    )!;
    await userEvent(down, "click");
    expect(up.getAttribute("aria-pressed")).toBe("true");
    expect(down.getAttribute("aria-pressed")).toBe("false");
    expect(down.disabled).toBe(false);
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "No pudimos confirmar tu voto",
    );
    expect(screen.querySelector('[role="status"]')?.textContent).toBe("");

    vi.mocked(voteComment).mockResolvedValueOnce({
      ok: true,
      value: -1,
      score: 6,
    });
    await userEvent(down, "click");
    expect(voteComment).toHaveBeenNthCalledWith(2, comment.id, -1);
    expect(down.getAttribute("aria-pressed")).toBe("true");
    expect(up.getAttribute("aria-pressed")).toBe("false");
    expect(down.disabled).toBe(false);
    expect(screen.querySelector('[role="alert"]')).toBeFalsy();
    expect(screen.querySelector('[role="status"]')?.textContent).toContain(
      "Votaste en contra. Puntaje 6",
    );
  });

  it("conserva el rechazo de permisos y el voto previo sin anunciar éxito", async () => {
    vi.mocked(voteComment).mockResolvedValueOnce({
      ok: false,
      message: "Sólo pueden votar quienes viven en esta comunidad.",
    });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const up = screen.querySelector<HTMLButtonElement>(
      'button[aria-label="Votar a favor"]',
    )!;
    await userEvent(up, "click");
    expect(up.getAttribute("aria-pressed")).toBe("true");
    expect(up.disabled).toBe(false);
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "Sólo pueden votar quienes viven en esta comunidad.",
    );
    expect(screen.querySelector('[role="status"]')?.textContent).toBe("");
  });
});

describe("enlaces directos a comentarios", () => {
  it("sin sesión ofrece votos como enlaces HTML y vuelve al comentario exacto con la consulta", async () => {
    const { render, screen } = await createDOM();
    await render(<Example anonymous />);
    const links = screen.querySelectorAll(
      'a[title="Iniciá sesión para votar"]',
    );
    expect(links).toHaveLength(2);
    for (const link of links) {
      const href = new URL(link.getAttribute("href")!, "http://localhost");
      expect(href.pathname).toBe("/ingresar");
      expect(href.searchParams.get("next")).toBe(
        `/debates/${debateId}?comunidad=caba&comentario=${comment.id}#comment-${comment.id}`,
      );
    }
    expect(screen.querySelector('button[aria-label^="Votar"]')).toBeFalsy();
    expect(voteComment).not.toHaveBeenCalled();
  });
  it("ofrece un ancla estable y una consulta que identifica el comentario", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    expect(screen.querySelector("article")?.id).toBe(`comment-${comment.id}`);
    expect(screen.querySelector("article")?.getAttribute("tabindex")).toBe(
      "-1",
    );
    expect(screen.querySelector(`a[href="${permalink}"]`)?.textContent).toBe(
      "Enlace al comentario",
    );
  });

  it("confirma sólo una copia efectiva y muestra cómo recuperar un fallo", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Denied"))
      .mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { location: { origin: "https://agorbis.test" } });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const copy = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent === "Copiar enlace al comentario",
    )!;
    await userEvent(copy, "click");
    expect(showToast).toHaveBeenCalledWith(
      "No pudimos copiar el enlace. Podés abrir el enlace al comentario y copiar su dirección.",
      "danger",
    );
    expect(showToast).not.toHaveBeenCalledWith(
      "Enlace al comentario copiado.",
      "success",
    );
    await userEvent(copy, "click");
    expect(writeText).toHaveBeenCalledWith(`https://agorbis.test${permalink}`);
    expect(showToast).toHaveBeenCalledWith(
      "Enlace al comentario copiado.",
      "success",
    );
  });
});
