import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { saveBookmark, removeBookmark } from "~/lib/bookmarks";
import { playCivicSound } from "~/lib/audio-feedback";
import { BookmarkButton } from "./BookmarkButton";

vi.mock("~/lib/bookmarks", () => ({
  isItemBookmarked: vi.fn(() => false),
  saveBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));
vi.mock("~/lib/audio-feedback", () => ({ playCivicSound: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));

const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <BookmarkButton
      id="claim-one"
      type="claim"
      title="Vereda accesible"
      url="/reclamos/claim-one"
    />
  );
});

const LabeledExample = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <BookmarkButton
      id="claim-one"
      type="claim"
      title="Vereda accesible"
      url="/reclamos/claim-one"
      showLabel
    />
  );
});

describe("favoritos con confirmación real", () => {
  it("avisa del fallo sin cambiar estado y permite reintentar guardar y quitar", async () => {
    vi.mocked(saveBookmark).mockReturnValue(false);
    vi.mocked(removeBookmark).mockReturnValue(false);
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const button = screen.querySelector("button")!;
    const status = screen.querySelector('[role="status"]')!;
    // Junto a "Compartir" (encuesta, debate y proyecto) va sólo la estrella:
    // sin texto visible, con el nombre en `aria-label`.
    expect(button.querySelector("span")).toBeFalsy();
    expect(button.querySelector("svg")).toBeTruthy();
    await userEvent(button, "click");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("No pudimos guardar el favorito");
    expect(button.getAttribute("aria-describedby")).toBe(status.id);
    expect(playCivicSound).not.toHaveBeenCalled();

    vi.mocked(saveBookmark).mockReturnValue(true);
    await userEvent(button, "click");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toBe("");
    expect(playCivicSound).toHaveBeenCalledTimes(1);

    await userEvent(button, "click");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("No pudimos quitar el favorito");
    expect(playCivicSound).toHaveBeenCalledTimes(1);

    vi.mocked(removeBookmark).mockReturnValue(true);
    await userEvent(button, "click");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toBe("");
  });

  // El reclamo no lleva "Compartir" en esa fila (D95) y la estrella sola no se
  // leía como acción. El texto visible tiene que ser el mismo nombre accesible
  // (WCAG 2.5.3) y seguir al estado, igual que el relleno de la estrella.
  it("con etiqueta muestra el mismo nombre accesible y lo cambia al guardar", async () => {
    vi.mocked(saveBookmark).mockReturnValue(true);
    const { render, screen, userEvent } = await createDOM();
    await render(<LabeledExample />);
    const button = screen.querySelector("button")!;
    const visibleLabel = () => button.querySelector("span")?.textContent;
    const starClass = () =>
      button.querySelector("svg")?.getAttribute("class") ?? "";

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(visibleLabel()).toBe("Guardar en favoritos");
    expect(button.getAttribute("aria-label")).toBe(visibleLabel());
    expect(starClass()).not.toContain("fill-current");

    await userEvent(button, "click");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(visibleLabel()).toBe("Quitar de favoritos");
    expect(button.getAttribute("aria-label")).toBe(visibleLabel());
    expect(starClass()).toContain("fill-current");
  });
});
