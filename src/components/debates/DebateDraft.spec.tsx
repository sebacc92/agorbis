import {
  component$,
  useContextProvider,
  useSignal,
  useStore,
} from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { DebateColumn } from "./DebateColumn";

const fixture = vi.hoisted(() => ({ action: undefined as unknown }));
vi.mock("~/lib/debate-actions", () => ({
  usePostComment: () => fixture.action,
  fetchDebateComments: vi.fn(),
  voteComment: vi.fn(),
}));
vi.mock("~/components/moderation/ReportButton", () => ({
  ReportButton: () => null,
}));
vi.mock("./AssertiveCivicToneAssistant", () => ({
  AssertiveCivicToneAssistant: () => null,
}));
const debateId = "c0000000-0000-4000-8000-000000000001";
const columnId = "a0000000-0000-4000-8000-000000000001";
const postedId = "d0000000-0000-4000-8000-000000000001";
const controlLabel = "Acción de prueba";
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  const draft = useSignal("");
  const post = useStore({
    isRunning: false,
    formData: undefined as FormData | undefined,
    value: undefined as unknown,
  });
  fixture.action = post;
  return (
    <QwikRouterMockProvider url={`http://localhost/debates/${debateId}`}>
      <button
        id="start-post"
        onClick$={() => {
          const data = new FormData();
          data.set("body", draft.value);
          post.formData = data;
          post.value = undefined;
          post.isRunning = true;
        }}
      >
        {controlLabel}
      </button>
      <button
        id="confirm-post"
        onClick$={() => {
          post.isRunning = false;
          post.value = {
            posted: true,
            debateId,
            columnId,
            postedComment: {
              id: postedId,
              body: post.formData?.get("body")?.toString() ?? "",
              score: 0,
              created_at: "2026-10-01T12:00:00Z",
              author: null,
              myVote: 0,
            },
          };
        }}
      >
        {controlLabel}
      </button>
      <button
        id="reject-post"
        onClick$={() => {
          post.isRunning = false;
          post.value = {
            message: "No pudimos publicar tu comentario. Probá de nuevo.",
          };
        }}
      >
        {controlLabel}
      </button>
      <DebateColumn
        column={{
          id: columnId,
          name: "Mar del Plata",
          slug: "mar-del-plata",
          position: 1,
          commentCount: 0,
          comments: [],
          truncated: false,
        }}
        debateId={debateId}
        totalColumns={1}
        isMine
        canVote
        isAuthenticated
        debateOpen
        commentDraft={draft}
      />
    </QwikRouterMockProvider>
  );
});
beforeEach(() => vi.clearAllMocks());
let restoreGeometry = () => {};
afterEach(() => {
  restoreGeometry();
  restoreGeometry = () => {};
  vi.unstubAllGlobals();
});

describe("borrador de comentario en viaje", () => {
  it("publica sólo el texto enviado, conserva la edición posterior y procesa cada confirmación una vez", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const input = screen.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "Texto enviado";
    await userEvent(input, "input");
    await userEvent(screen.querySelector("#start-post"), "click");
    input.value = "Texto editado durante la espera";
    await userEvent(input, "input");
    await userEvent(screen.querySelector("#confirm-post"), "click");
    expect(input.value).toBe("Texto editado durante la espera");
    expect(screen.querySelector(`#comment-${postedId}`)?.textContent).toContain(
      "Texto enviado",
    );
    expect(screen.textContent).toContain(
      "Las ediciones posteriores siguen en el borrador.",
    );
    input.value = "Otro borrador posterior";
    await userEvent(input, "input");
    await userEvent(screen.querySelector("#confirm-post"), "click");
    expect(input.value).toBe("Otro borrador posterior");
    expect(screen.querySelectorAll(`#comment-${postedId}`)).toHaveLength(1);
    expect(screen.textContent).not.toContain(
      "Las ediciones posteriores siguen en el borrador.",
    );
  });
  it("limpia lo enviado intacto, pero un rechazo nunca borra el borrador ni anuncia publicación", async () => {
    const { render, screen, userEvent } = await createDOM();
    const prototype = Object.getPrototypeOf(
      screen.ownerDocument.createElement("div"),
    );
    const previousRect = Object.getOwnPropertyDescriptor(
      prototype,
      "getBoundingClientRect",
    );
    Object.defineProperty(prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, bottom: 1 }),
    });
    vi.stubGlobal("window", { innerHeight: 900 });
    restoreGeometry = () => {
      if (previousRect)
        Object.defineProperty(prototype, "getBoundingClientRect", previousRect);
      else delete prototype.getBoundingClientRect;
    };
    await render(<Example />);
    const input = screen.querySelector<HTMLTextAreaElement>("textarea")!;
    input.value = "Texto confirmado";
    await userEvent(input, "input");
    await userEvent(screen.querySelector("#start-post"), "click");
    await userEvent(screen.querySelector("#confirm-post"), "click");
    expect(input.value).toBe("");
    expect(screen.textContent).toContain(
      "Listo, tu comentario ya está en la columna.",
    );
    input.value = "Texto que debe conservarse";
    await userEvent(input, "input");
    await userEvent(screen.querySelector("#start-post"), "click");
    await userEvent(screen.querySelector("#reject-post"), "click");
    expect(input.value).toBe("Texto que debe conservarse");
    expect(screen.textContent).toContain("No pudimos publicar tu comentario.");
    expect(screen.textContent).not.toContain(
      "Listo, tu comentario ya está en la columna.",
    );
  });
});
