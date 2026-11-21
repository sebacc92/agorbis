import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithLocale } from "~/testing/render";
import {
  showToast,
  toastAutoDismissMs,
  TOAST_EVENT,
  ToastContainer,
} from "./Toast";

/**
 * El bug que cubre: `showToast` despachaba en `window` y el contenedor
 * escuchaba en `document`. Un evento de `window` no baja a `document`, así que
 * ningún toast se mostraba y nada lo detectaba. Las dos puntas tienen que
 * hablar en el mismo objeto.
 */
describe("Toast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("showToast despacha el evento en window con el mensaje", () => {
    const target = new EventTarget();
    const received: CustomEvent[] = [];
    target.addEventListener(TOAST_EVENT, (event) =>
      received.push(event as CustomEvent),
    );
    vi.stubGlobal("window", target);

    showToast("Enlace copiado", "success", 1000);

    expect(received).toHaveLength(1);
    expect(received[0].detail).toMatchObject({
      message: "Enlace copiado",
      tone: "success",
      duration: 1000,
    });
    expect(typeof received[0].detail.id).toBe("string");
  });

  it("el contenedor escucha ese evento en window, no en document", async () => {
    const { document } = await renderWithLocale(<ToastContainer />);
    const region = document.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    // `q-w:` es el prefijo de Qwik para listeners de window; `q-d:`, el de
    // document.
    expect(region!.hasAttribute(`q-w:${TOAST_EVENT}`)).toBe(true);
    expect(region!.hasAttribute(`q-d:${TOAST_EVENT}`)).toBe(false);
  });

  it("los errores se quedan hasta cerrarlos; el resto respeta su duración", () => {
    expect(toastAutoDismissMs("danger")).toBeNull();
    expect(toastAutoDismissMs("danger", 1000)).toBeNull();
    expect(toastAutoDismissMs("success")).toBe(3500);
    expect(toastAutoDismissMs("info", 1200)).toBe(1200);
  });

  it("la región viva existe desde el primer render, aunque esté vacía", async () => {
    const { document } = await renderWithLocale(<ToastContainer />);
    const region = document.querySelector('[role="region"]');
    expect(region?.children.length).toBe(0);
  });
});
