import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { showToast } from "~/components/ui/Toast";
import { GpsNavigationModal } from "./GpsNavigationModal";

vi.mock("~/components/ui/Toast", () => ({ showToast: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));

const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <GpsNavigationModal
      lat={-34.603722}
      lng={-58.381592}
      claimTitle="Un reclamo"
    />
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function openNavigation() {
  const dom = await createDOM();
  const document = dom.screen.ownerDocument;
  vi.stubGlobal("document", document);
  vi.stubGlobal("HTMLElement", class {});
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag) => {
    const element = createElement(tag);
    if (tag === "dialog")
      Object.defineProperties(element, {
        showModal: {
          configurable: true,
          value() {
            this.open = true;
          },
        },
        close: {
          configurable: true,
          value() {
            this.open = false;
          },
        },
      });
    return element;
  });
  await dom.render(<Example />);
  await dom.userEvent(dom.screen.querySelector("button"), "click");
  const dialog = dom.screen.querySelector("dialog")!;
  // D125: el portapapeles es un ícono SVG sin texto; el botón dice "Copiar".
  const copy = Array.from(dialog.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Copiar",
  )!;
  const coordinates =
    dialog.querySelector<HTMLInputElement>("input[readonly]")!;
  return { ...dom, dialog, copy, coordinates };
}

describe("copia recuperable de coordenadas públicas", () => {
  it.each(["denied", "unavailable"])(
    "ofrece selección manual cuando clipboard está %s, sin anunciar éxito",
    async (failure) => {
      vi.stubGlobal(
        "navigator",
        failure === "unavailable"
          ? {}
          : {
              clipboard: {
                writeText: vi.fn().mockRejectedValue(new Error("Denied")),
              },
            },
      );
      const { dialog, copy, coordinates, userEvent } = await openNavigation();
      expect(coordinates.value).toBe("-34.604, -58.382");
      await userEvent(copy, "click");
      expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
        "No pudimos copiar las coordenadas",
      );
      expect(showToast).not.toHaveBeenCalled();
      expect(copy.textContent).not.toContain("Copiado");
      const focus = vi.fn();
      const select = vi.fn();
      Object.defineProperties(coordinates, {
        focus: { configurable: true, value: focus },
        select: { configurable: true, value: select },
      });
      const manual = Array.from(dialog.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Seleccionar coordenadas",
      )!;
      await userEvent(manual, "click");
      expect(focus).toHaveBeenCalledOnce();
      expect(select).toHaveBeenCalledOnce();
    },
  );

  it("permite reintentar y sólo copia la cuadrícula pública sin conservar el error", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Denied"))
      .mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { dialog, copy, userEvent } = await openNavigation();
    await userEvent(copy, "click");
    await userEvent(copy, "click");
    expect(writeText).toHaveBeenLastCalledWith("-34.604, -58.382");
    expect(copy.textContent).toContain("Copiado");
    expect(dialog.querySelector('[role="alert"]')).toBeFalsy();
    expect(showToast).toHaveBeenCalledWith(
      "Coordenadas copiadas al portapapeles.",
      "success",
    );
    for (const link of Array.from(dialog.querySelectorAll("a")))
      expect(link.href).not.toMatch(/\d\.\d{4}/);
  });
});
