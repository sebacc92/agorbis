import { component$, useContextProvider, type QRL } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPES,
} from "~/lib/notifications";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  logFailure: vi.fn(),
  invalidateViewer: vi.fn(),
  haptic: vi.fn(),
  sound: vi.fn(),
  confetti: vi.fn(),
}));
vi.mock("~/lib/session", () => ({
  requireUser: mocks.requireUser,
  supabase: () => ({ rpc: mocks.rpc }),
  invalidateViewer: mocks.invalidateViewer,
}));
vi.mock("~/lib/log", () => ({ logFailure: mocks.logFailure }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: mocks.haptic }));
vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: mocks.sound }));
vi.mock("~/components/ui/ConfettiCelebration", () => ({
  triggerCivicConfetti: mocks.confetti,
}));
vi.mock("~/routes/layout", () => ({
  useLocaleLoader: vi.fn(),
  // El fixture no monta el header; invalidate sí requiere la identidad del loader.
  useViewer: Object.assign(vi.fn(), { __id: "notification-test-viewer" }),
}));

import NotificationsPage, {
  useNotifications,
  useReadNotifications,
} from "./index";

const notificationId = "a0000000-0000-4000-8000-000000000001";
const communityId = "a0000000-0000-4000-8000-000000000002";
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  return (
    <QwikRouterMockProvider
      url="http://localhost/notificaciones"
      loaders={[
        {
          loader: useNotifications,
          data: {
            items: [
              {
                id: notificationId,
                recipient_id: notificationId,
                actor_id: null,
                created_at: "2025-01-01T12:00:00Z",
                read_at: null,
                type: "reply",
                title: "Una respuesta anterior",
                body: null,
                href: "/perfil",
                community_id: null,
                entity_id: null,
                entity_type: null,
                dedupe_key: null,
              },
            ],
            total: 100,
            unread: 75,
            nextCursor: undefined,
            filters: { unreadOnly: false, type: "", communityId: "" },
            filtered: false,
            hasCursor: true,
            cursor: { created_at: "2025-01-02T00:00:00Z", id: notificationId },
            preferences: DEFAULT_NOTIFICATION_PREFERENCES,
            communities: [],
          },
        },
      ]}
    >
      <NotificationsPage />
    </QwikRouterMockProvider>
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-id" });
  mocks.rpc.mockResolvedValue({ data: 2, error: null });
});

async function markRead(
  data: Record<string, unknown> = {},
  internalRequest?: "action",
) {
  const handler = await (
    useReadNotifications as unknown as {
      __qrl: QRL<(data: unknown, ev: unknown) => Promise<unknown>>;
    }
  ).__qrl.resolve();
  return handler(data, {
    internalRequest,
    fail: (status: number, value: unknown) => ({ status, value }),
  });
}

describe("confirmación real del marcado de notificaciones", () => {
  it("confirma la cantidad devuelta por la base y respeta todos los filtros", async () => {
    expect(
      await markRead({
        notification_id: notificationId,
        tipo: "reply",
        sin_leer: "1",
        comunidad: communityId,
      }),
    ).toEqual({ done: true, updated: 2 });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.invalidateViewer).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("mark_notifications_read", {
      p_notification_id: notificationId,
      p_type: "reply",
      p_unread_only: true,
      p_community_id: communityId,
    });
  });

  it("el envío SPA deja la relectura a los loaders invalidados", async () => {
    expect(await markRead({}, "action")).toEqual({ done: true, updated: 2 });
    expect(mocks.invalidateViewer).not.toHaveBeenCalled();
  });

  it.each([null, undefined, -1, 1.5, "2"])(
    "rechaza una respuesta sin cantidad confirmada: %s",
    async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect(await markRead()).toEqual({
        status: 400,
        value: { message: "No pudimos marcar las notificaciones como leídas." },
      });
      expect(mocks.logFailure).toHaveBeenCalledOnce();
    },
  );

  it("registra el error real sin devolver un éxito", async () => {
    const error = { message: "Permission denied", code: "42501" };
    mocks.rpc.mockResolvedValue({ data: null, error });
    expect(await markRead()).toEqual({
      status: 400,
      value: { message: "No pudimos marcar las notificaciones como leídas." },
    });
    expect(mocks.logFailure).toHaveBeenCalledWith(
      { scope: "notificaciones/marcar-leidas" },
      error,
    );
  });

  it("acepta cero cambios sin atribuir un marcado inexistente", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    expect(await markRead()).toEqual({ done: true, updated: 0 });
    expect(mocks.invalidateViewer).not.toHaveBeenCalled();
  });

  it("confirma sólo una respuesta con cambios y nunca festeja con confeti", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const forms = Array.from(screen.querySelectorAll<HTMLFormElement>("form"));
    const bulk = forms.find(
      (form) =>
        form.querySelector<HTMLInputElement>('input[name="notification_id"]')
          ?.value === "",
    )!;
    const single = forms.find(
      (form) =>
        form.querySelector<HTMLInputElement>('input[name="notification_id"]')
          ?.value === notificationId,
    )!;
    expect(bulk).toBeDefined();
    expect(single).toBeDefined();
    for (const form of [bulk, single]) {
      const action = new URL(
        form.querySelector("button")!.getAttribute("formaction")!,
        "http://localhost",
      );
      expect(action.pathname).toBe("/notificaciones/");
      expect(action.searchParams.get("qaction")).toBeTruthy();
      expect(action.searchParams.get("antes")).toBe("2025-01-02T00:00:00Z");
      expect(action.searchParams.get("id")).toBe(notificationId);
    }
    await userEvent(bulk.querySelector("button"), "click");
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.haptic).not.toHaveBeenCalledWith("success");
    expect(mocks.sound).not.toHaveBeenCalled();
    for (const detail of [
      {
        status: 400,
        value: {
          failed: true,
          message: "No pudimos marcar las notificaciones como leídas.",
        },
      },
      { status: 500, value: { done: true, updated: 2 } },
      { status: 200, value: { done: true, updated: 0 } },
      { status: 200, value: {} },
    ]) {
      await userEvent(bulk, "submitcompleted", { detail });
    }
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.haptic).not.toHaveBeenCalledWith("success");
    expect(mocks.sound).not.toHaveBeenCalled();

    // Vaciar la bandeja es una tarea hecha, no un logro (D96).
    await userEvent(bulk, "submitcompleted", {
      detail: { status: 200, value: { done: true, updated: 2 } },
    });
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.haptic).toHaveBeenCalledWith("success");
    expect(mocks.sound).toHaveBeenCalledWith("click");
    expect(mocks.sound).not.toHaveBeenCalledWith("celebrate");

    vi.clearAllMocks();
    await userEvent(single, "submitcompleted", {
      detail: { status: 200, value: { done: true, updated: 1 } },
    });
    expect(mocks.confetti).not.toHaveBeenCalled();
    expect(mocks.haptic).toHaveBeenCalledWith("success");
    expect(mocks.sound).toHaveBeenCalledWith("click");
  });
});

describe("alcance del resumen de la bandeja", () => {
  it("describe la página visible aunque el historial filtrado sea más grande y antiguo", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const text = screen.textContent ?? "";
    const listen = screen.querySelector<HTMLButtonElement>(
      'button[aria-label="Escuchar resumen auditivo"]',
    )!;
    const scope = screen.querySelector(
      `#${listen.getAttribute("aria-describedby")}`,
    );
    expect(scope?.textContent).toBe(
      "Lee las notificaciones de esta página, con los filtros actuales.",
    );
    expect(text).not.toContain("de la Semana");
    expect(text).not.toContain("semanal");
  });

  it("muestra la lista antes que las preferencias", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const html = screen.innerHTML;
    expect(html.indexOf("<ol")).toBeGreaterThan(-1);
    expect(html.indexOf('id="preferencias"')).toBeGreaterThan(
      html.indexOf("<ol"),
    );
    expect(
      screen.querySelector('a[href="#preferencias"]')?.textContent,
    ).toContain("Elegir qué recibir");
  });
});

describe("borrador de filtros", () => {
  it("anuncia sólo el filtro rápido activo y reserva una superficie táctil suficiente", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const active = screen.querySelectorAll('a[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain("Todas");
    const chips = Array.from(
      screen.querySelectorAll<HTMLAnchorElement>("a.snap-start"),
    );
    expect(chips.length).toBeGreaterThan(1);
    expect(
      chips.every(
        (chip) =>
          chip.classList.contains("min-h-11") &&
          chip.classList.contains("min-w-11"),
      ),
    ).toBe(true);
  });
  it("plegar y reabrir no reaplica los filtros anteriores de la URL", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const summary = screen.querySelector<HTMLElement>(
      'summary[aria-controls="notification-filters"]',
    )!;
    const details = summary.parentElement as HTMLDetailsElement;
    const type = screen.querySelector<HTMLSelectElement>(
      '#notification-filters select[name="tipo"]',
    )!;
    const unread = screen.querySelector<HTMLInputElement>(
      '#notification-filters input[name="sin_leer"]',
    )!;
    type.value = "poll_closed";
    await userEvent(type, "change");
    unread.checked = true;
    await userEvent(unread, "change");
    for (const open of [true, false, true]) {
      details.open = open;
      await userEvent(details, "toggle");
      expect(type.value).toBe("poll_closed");
      expect(type.querySelectorAll("option")).toHaveLength(
        NOTIFICATION_TYPES.length,
      );
      expect(unread.checked).toBe(true);
    }
  });
});

describe("cambios pendientes en preferencias", () => {
  it("distingue cambios, valores confirmados y ediciones durante un guardado", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const input = screen.querySelector<HTMLInputElement>(
      'input[name="replies"]',
    )!;
    const form = input.closest("form")!;
    expect(screen.textContent).not.toContain("Cambios sin guardar");
    input.checked = false;
    await userEvent(input, "change");
    expect(screen.textContent).toContain("Cambios sin guardar");

    await userEvent(form, "submitcompleted", {
      detail: {
        status: 400,
        value: { failed: true },
      },
    });
    expect(screen.textContent).toContain("Cambios sin guardar");

    // La base confirma la casilla desmarcada; una edición posterior que la
    // volvió a marcar sigue sin guardar al llegar esa respuesta.
    input.checked = true;
    await userEvent(input, "change");
    await userEvent(form, "submitcompleted", {
      detail: {
        status: 200,
        value: {
          saved: true,
          preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, replies: false },
        },
      },
    });
    expect(screen.textContent).toContain("Cambios sin guardar");
    input.checked = false;
    await userEvent(input, "change");
    expect(screen.textContent).not.toContain("Cambios sin guardar");

    input.checked = true;
    await userEvent(input, "change");
    await userEvent(form, "submitcompleted", {
      detail: {
        status: 200,
        value: { saved: true, preferences: DEFAULT_NOTIFICATION_PREFERENCES },
      },
    });
    expect(screen.textContent).not.toContain("Cambios sin guardar");
  });
});
