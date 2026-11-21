import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { groupReports, type QueueReport } from "~/lib/moderation-queue";

vi.mock("~/lib/session", () => ({
  requireModerator: vi.fn(),
  supabase: vi.fn(),
}));
vi.mock("~/routes/layout", () => ({
  useLocaleLoader: vi.fn(),
  useViewer: () => ({ value: { profile: { role: "moderator" } } }),
}));

import ModerationPage, { useQueue } from "./index";

const CLAIM = "d0000000-0000-4000-8000-000000000001";
const COMMENT = "d0000000-0000-4000-8000-000000000002";

function report(
  id: string,
  type: QueueReport["target_type"],
  targetId: string,
  contentStatus: string,
): QueueReport {
  return {
    id: `e0000000-0000-4000-8000-00000000000${id}`,
    target_type: type,
    target_id: targetId,
    reason: `Motivo ${id}`,
    status: "pending",
    created_at: "2026-10-01T00:00:00Z",
    reporter: `persona${id}`,
    preview: `Contenido ${targetId.slice(-1)}`,
    contentStatus,
    href: null,
  };
}

const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  const reports = [
    report("1", "claim", CLAIM, "open"),
    report("2", "debate_comment", COMMENT, "removed"),
    report("3", "claim", CLAIM, "open"),
  ];
  return (
    <QwikRouterMockProvider
      url="http://localhost/moderacion/"
      loaders={[
        {
          loader: useQueue,
          data: {
            groups: groupReports(
              reports,
              new Map([[`claim:${CLAIM}`, 4]]),
            ),
            statusCounts: {
              pending: 5,
              reviewing: 0,
              resolved: null,
              dismissed: 2,
            },
            queueCounts: { requests: 3, appeals: null },
            filter: "pending",
            page: 1,
            pages: 1,
            total: 5,
            previous: null,
            next: null,
          },
        },
      ]}
    >
      <ModerationPage />
    </QwikRouterMockProvider>
  );
});

describe("cola de reportes agrupada", () => {
  it("muestra una tarjeta por contenido con sus reportes y la decisión que corresponde", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const cards = Array.from(screen.querySelectorAll("ul.grid > li"));
    expect(cards).toHaveLength(2);

    const [claim, comment] = cards;
    expect(claim.textContent).toContain("4 reportes abiertos");
    expect(claim.textContent).toContain("Motivo 1");
    expect(claim.textContent).toContain("Motivo 3");
    const claimButtons = Array.from(claim.querySelectorAll("button")).map(
      (button) => button.textContent?.trim(),
    );
    expect(claimButtons).toEqual([
      "Ocultar y resolver (4)",
      "Descartar reportes",
    ]);

    expect(comment.textContent).toContain("1 reporte abierto");
    expect(comment.textContent).toContain("Contenido oculto");
    const commentButtons = Array.from(comment.querySelectorAll("button")).map(
      (button) => button.textContent?.trim(),
    );
    expect(commentButtons).toEqual([
      "Marcar resueltos (1)",
      "Descartar reportes",
      "Restaurar",
    ]);
  });

  it("cuenta cada estado y cada cola, sin inventar ceros cuando no pudo contar", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const tabs = Array.from(
      screen.querySelectorAll('nav[aria-label="Filtrar reportes"] a'),
    ).map((link) => link.textContent?.replace(/\s+/g, " ").trim());
    expect(tabs).toEqual([
      "Pendientes5",
      "En revisión0",
      "Resueltos",
      "Descartados2",
      "Todos",
    ]);
    const requests = Array.from(screen.querySelectorAll("header a")).find(
      (link) => link.getAttribute("href") === "/moderacion/solicitudes",
    );
    expect(requests?.textContent).toContain("3");
    const appeals = Array.from(screen.querySelectorAll("header a")).find(
      (link) => link.getAttribute("href") === "/moderacion/apelaciones",
    );
    expect(appeals?.textContent?.trim()).toBe("Apelaciones");
  });
});
