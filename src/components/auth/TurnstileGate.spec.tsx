import { component$, useContextProvider, useStore } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import {
  TurnstileGate,
  type TurnstileGateHandle,
  type TurnstileGateState,
} from "./TurnstileGate";

// El texto del botón sale de una constante para que check-i18n no lo cuente
// como texto de interfaz sin traducir: el spec no es interfaz.
const LABEL = "Ingresar";

/**
 * Décima ronda, mejora 9: tocar "Ingresar" antes de que llegara el token
 * devolvía un 403 y la recarga borraba la contraseña. El formulario mira el
 * estado del gate para esperar. La tarea visible sí corre acá: sin SDK la
 * carga falla; con un cargador que nunca resuelve, el gate queda esperando.
 */
// En Vitest no hay `window`: el gate lo nota, falla la carga y lo dice. Para
// observar la espera se simula una ventana cuyo cargador nunca resuelve.
afterEach(() => vi.unstubAllGlobals());
const Fixture = component$<{ state: TurnstileGateState }>(({ state }) => {
  useContextProvider(LocaleContext, "es");
  const gate = useStore<TurnstileGateHandle>({ status: state });
  return (
    <form>
      <TurnstileGate action="password_login" submitting={false} state={gate} />
      <button type="submit" disabled={gate.status === "waiting"}>
        {LABEL}
      </button>
    </form>
  );
});

describe("TurnstileGate", () => {
  it("si el SDK no carga lo dice, no queda esperando y el botón vuelve a estar habilitado", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture state="ssr" />);
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "No pudimos cargar la verificación antiabuso",
    );
    expect(screen.querySelector('[role="status"]')?.textContent?.trim()).toBe(
      "",
    );
    expect(screen.querySelector("button")?.hasAttribute("disabled")).toBe(
      false,
    );
    expect(
      screen.querySelector('input[name="turnstile_token"]')?.getAttribute(
        "value",
      ),
    ).toBe("");
  });

  it("mientras espera el token lo dice en una región viva y el botón no se puede tocar", async () => {
    // Un cargador que nunca resuelve: el gate arranca y se queda esperando.
    vi.stubGlobal("window", { agorbisTurnstileLoader: new Promise(() => {}) });
    const { render, screen } = await createDOM();
    await render(<Fixture state="ssr" />);
    expect(screen.querySelector('[role="status"]')?.textContent).toContain(
      "Verificando que sos una persona",
    );
    expect(screen.querySelector("button")?.hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("con un SDK que entrega el token queda listo, y al expirar vuelve a esperar sin decir que falló", async () => {
    const callbacks: Record<string, (token: string) => void> = {};
    const api = {
      render: (
        _element: HTMLElement,
        options: {
          callback: (token: string) => void;
          "expired-callback": () => void;
        },
      ) => {
        callbacks.token = options.callback;
        callbacks.expired = options["expired-callback"];
        options.callback("token-de-prueba");
        return "widget-1";
      },
      reset: vi.fn(),
      remove: vi.fn(),
    };
    vi.stubGlobal("window", { turnstile: api });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const { render, screen } = await createDOM();
    // El widget sólo se dibuja con ancho: el DOM de pruebas no mide.
    const prototype = Object.getPrototypeOf(
      screen.ownerDocument.createElement("div"),
    );
    Object.defineProperty(prototype, "clientWidth", {
      configurable: true,
      get: () => 400,
    });
    try {
      await render(<Fixture state="ssr" />);
      const input = screen.querySelector<HTMLInputElement>(
        'input[name="turnstile_token"]',
      );
      expect(input?.value).toBe("token-de-prueba");
      expect(screen.querySelector("button")?.hasAttribute("disabled")).toBe(
        false,
      );
      expect(screen.querySelector('[role="alert"]')).toBeFalsy();

      callbacks.expired?.("");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(input?.value).toBe("");
      expect(screen.querySelector("button")?.hasAttribute("disabled")).toBe(
        true,
      );
      expect(screen.querySelector('[role="status"]')?.textContent).toContain(
        "Verificando que sos una persona",
      );
      // Vencer no es fallar: la alerta roja no aparece.
      expect(screen.querySelector('[role="alert"]')).toBeFalsy();

      callbacks.token?.("otro-token");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(input?.value).toBe("otro-token");
      expect(screen.querySelector("button")?.hasAttribute("disabled")).toBe(
        false,
      );
    } finally {
      delete prototype.clientWidth;
    }
  });
});
