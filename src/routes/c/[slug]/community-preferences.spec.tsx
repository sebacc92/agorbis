import {
  component$,
  useContextProvider,
  useSignal,
  useStore,
} from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunityFollowForm,
  CommunityVisibilityForm,
} from "~/components/community/CommunityPreferences";
import { LocaleContext } from "~/lib/i18n";
import type { useToggleFollow } from "./layout";
import type { useSetVisibility } from "./miembros/index";

const fixtureLabel = "Enviar preferencia";
const community = { id: "community", name: "Barrio" };
const Example = component$<{ member?: boolean; unknown?: boolean }>(
  ({ member = false, unknown = false }) => {
    useContextProvider(LocaleContext, "es");
    const attempt = useSignal(0);
    const action = useStore({
      value: undefined as
        | undefined
        | {
            communityId: string;
            following: boolean;
            isAnonymous: boolean;
            failed?: boolean;
            message?: string;
          },
      formData: undefined,
      isRunning: false,
      actionPath: "?qaction=fixture",
    });
    return (
      <QwikRouterMockProvider url="https://agorbis.test/c/barrio/miembros/?q=Centro&foto=1&despues=vecina">
        {member ? (
          <CommunityVisibilityForm
            community={community}
            initialAnonymous={unknown ? null : true}
            retryHref="/c/barrio/miembros/?q=Centro&foto=1&despues=vecina"
            action={action as unknown as ReturnType<typeof useSetVisibility>}
          />
        ) : (
          <CommunityFollowForm
            community={community}
            initialFollowing={false}
            action={action as unknown as ReturnType<typeof useToggleFollow>}
          />
        )}
        <button
          id="fixture-submit"
          onClick$={() => {
            const failed = attempt.value++ === 1;
            const following = action.value?.following ?? false;
            const isAnonymous = action.value?.isAnonymous ?? true;
            action.value = {
              communityId: community.id,
              following: failed ? following : !following,
              isAnonymous: failed ? isAnonymous : !isAnonymous,
              ...(failed
                ? {
                    failed: true,
                    message: member
                      ? "No pudimos guardar tu preferencia. Probá de nuevo."
                      : "No pudimos dejar de seguir esta comunidad. Probá de nuevo.",
                  }
                : {}),
            };
          }}
        >
          {fixtureLabel}
        </button>
      </QwikRouterMockProvider>
    );
  },
);

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("estado confirmado y reintento de preferencias", () => {
  it("después de seguir, un rechazo al retirar mantiene el estado y el intento siguiente", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    await userEvent(screen.querySelector("#fixture-submit"), "click");
    expect(
      screen.querySelector('input[name="following"]')?.getAttribute("value"),
    ).toBe("true");
    await userEvent(screen.querySelector("#fixture-submit"), "click");
    expect(
      screen.querySelector('input[name="following"]')?.getAttribute("value"),
    ).toBe("true");
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "Seguís esta comunidad.",
    );
    expect(screen.textContent).toContain("Reintentar dejar de seguir");
    expect(screen.textContent).not.toContain("Dejaste de seguir Barrio");
    await userEvent(screen.querySelector("#fixture-submit"), "click");
    expect(
      screen.querySelector('input[name="following"]')?.getAttribute("value"),
    ).toBe("false");
    expect(screen.textContent).toContain("Dejaste de seguir Barrio");
  });

  it("la lectura desconocida no ofrece un cambio hacia visibilidad pública y conserva un reintento nativo con filtros", async () => {
    const { render, screen } = await createDOM();
    await render(<Example member unknown />);
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "No pudimos consultar tu visibilidad pública",
    );
    expect(screen.querySelector('input[name="is_anonymous"]')).toBeFalsy();
    const retry = Array.from(screen.querySelectorAll("a")).find(
      (a) => a.textContent === "Reintentar",
    );
    expect(retry?.getAttribute("href")).toBe(
      "/c/barrio/miembros/?q=Centro&foto=1&despues=vecina",
    );
  });

  it("tras mostrarse, un rechazo al ocultarse no anuncia éxito ni olvida el estado público conocido", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example member />);
    expect(
      screen.querySelector('button[type="submit"]')?.getAttribute("formaction"),
    ).toBe(
      "/c/barrio/miembros/?q=Centro&foto=1&despues=vecina&qaction=fixture",
    );
    await userEvent(screen.querySelector("#fixture-submit"), "click");
    expect(
      screen.querySelector('input[name="is_anonymous"]')?.getAttribute("value"),
    ).toBe("true");
    expect(screen.textContent).toContain(
      "Ahora aparecés en la lista de Barrio",
    );
    await userEvent(screen.querySelector("#fixture-submit"), "click");
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "No pudimos guardar tu preferencia",
    );
    expect(
      screen.querySelector('input[name="is_anonymous"]')?.getAttribute("value"),
    ).toBe("true");
    expect(screen.textContent).not.toContain("Ahora aparecés");
    await userEvent(screen.querySelector("#fixture-submit"), "click");
    expect(
      screen.querySelector('input[name="is_anonymous"]')?.getAttribute("value"),
    ).toBe("false");
    expect(screen.textContent).toContain(
      "Ahora aparecés como anónimo en Barrio",
    );
  });
});
