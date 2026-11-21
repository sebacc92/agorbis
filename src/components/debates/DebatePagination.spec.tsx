import { component$, useContextProvider, useSignal } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDebateComments } from "~/lib/debate-actions";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { DebateGrid } from "./DebateGrid";
import type { DebateColumnData } from "./DebateColumn";

vi.mock("~/lib/debate-actions", () => ({
  fetchDebateComments: vi.fn(),
  usePostComment: () => ({ value: undefined }),
  voteComment: vi.fn(),
}));
vi.mock("~/components/moderation/ReportButton", () => ({ ReportButton: () => null }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));

const firstDebate = "c0000000-0000-4000-8000-000000000001";
const nextDebate = "c0000000-0000-4000-8000-000000000002";
const columnId = "a0000000-0000-4000-8000-000000000001";
const switchFixtureLabel = "Otro debate";
const comment = (index: number) => ({
  id: `d0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  body: `Comentario ${index}`,
  score: index,
  created_at: "2026-10-01T12:00:00Z",
  author: null,
  myVote: 0 as const,
});
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  const debateId = useSignal(firstDebate);
  const column: DebateColumnData = {
    id: columnId,
    name: "CABA",
    slug: "caba",
    position: 1,
    truncated: true,
    commentCount: 45,
    comments: [comment(debateId.value === firstDebate ? 1 : 3)],
  };
  return <QwikRouterMockProvider url={`http://localhost/debates/${firstDebate}`}>
    <button id="switch-debate" onClick$={() => { debateId.value = nextDebate; }}>{switchFixtureLabel}</button>
    <DebateGrid columns={[column]} debateId={debateId.value} myColumnId={null} canVote={false} isAuthenticated={false} debateOpen={false} />
  </QwikRouterMockProvider>;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("window", { scrollY: 0, scrollTo: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("estado de paginación por debate y columna", () => {
  it("permite reintentar sin borrar tarjetas y al cambiar de debate reinicia comentarios y cursor", async () => {
    vi.mocked(fetchDebateComments)
      .mockRejectedValueOnce(new Error("Network disconnected"))
      .mockResolvedValueOnce({ ok: true, comments: [comment(2), comment(1)], hasMore: true, cursor: { created_at: comment(2).created_at, id: comment(2).id } })
      .mockResolvedValueOnce({ ok: true, comments: [comment(4)], hasMore: false, cursor: { created_at: comment(4).created_at, id: comment(4).id } });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const more = () => Array.from(screen.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Cargar más comentarios")!;
    await userEvent(more(), "click");
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain("No pudimos cargar más comentarios");
    expect(screen.querySelectorAll('article[id^="comment-"]')).toHaveLength(1);
    await userEvent(more(), "click");
    expect(screen.querySelectorAll('article[id^="comment-"]')).toHaveLength(2);
    expect(screen.querySelector(`#comment-${comment(1).id}`)).toBeTruthy();
    await userEvent(screen.querySelector("#switch-debate"), "click");
    expect(screen.querySelectorAll('article[id^="comment-"]')).toHaveLength(1);
    expect(screen.querySelector(`#comment-${comment(1).id}`)).toBeFalsy();
    expect(screen.querySelector(`#comment-${comment(2).id}`)).toBeFalsy();
    expect(screen.querySelector(`#comment-${comment(3).id}`)).toBeTruthy();
    await userEvent(more(), "click");
    expect(fetchDebateComments).toHaveBeenLastCalledWith({ debateId: nextDebate, columnId, initialIds: [comment(3).id], cursor: null });
    expect(screen.querySelectorAll('article[id^="comment-"]')).toHaveLength(2);
  });
});
