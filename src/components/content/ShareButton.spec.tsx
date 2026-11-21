import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext, type Locale } from "~/lib/i18n";
import { showToast } from "~/components/ui/Toast";
import { openShareWindow, shareOnWhatsApp } from "~/lib/share";
import { ShareButton, formatShareMessage } from "./ShareButton";

vi.mock("~/components/ui/Toast", () => ({ showToast: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));
vi.mock("~/lib/share", async (original) => ({ ...await original<typeof import("~/lib/share")>(), openShareWindow: vi.fn(), shareOnWhatsApp: vi.fn() }));

const title = "La vereda de José";
const community = "Mar del Plata";
const url = "https://agorbis.test/reclamos/one";
const Example = component$<{ locale: Locale; compact?: boolean }>(({ locale, compact }) => {
  useContextProvider(LocaleContext, locale);
  return <ShareButton title={title} communityName={community} kind="claim" url={url} compact={compact} />;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://agorbis.test", href: url }, clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
});
afterEach(() => vi.unstubAllGlobals());

describe("mensajes compartidos localizados", () => {
  it("mantiene compatible la firma y el texto fuente en español", () => {
    expect(formatShareMessage(title, undefined, "claim", false, community, url)).toBe(`📣 Vecinos en ${community}: necesitamos su apoyo en este reclamo: "${title}". Sumá tu apoyo acá: ${url}`);
    expect(formatShareMessage(title, undefined, "generic", false, undefined, undefined)).toBe(`📢 "${title}".`);
  });
  it.each([["claim", false, "Neighbours"], ["claim", true, "community win"], ["poll", false, "Community poll"], ["project", false, "Community project"], ["debate", false, "See it here"]])("traduce %s sin alterar el título ni la comunidad", (kind, resolved, expected) => {
    const message = formatShareMessage(title, undefined, kind as string, resolved as boolean, community, url, "en");
    expect(message).toContain(expected);
    expect(message).toContain(title);
    expect(message).toContain(`in ${community}`);
    expect(message).toContain(url);
  });
  it("conserva el texto ciudadano personalizado en ambos idiomas", () => {
    expect(formatShareMessage(title, "Mensaje de la vecina", "claim", false, community, url, "en")).toBe(`Mensaje de la vecina\n\n${url}`);
  });
  it("usa el idioma actual en la hoja nativa, WhatsApp y Telegram", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example locale="en" />);
    const buttons = Array.from(screen.querySelectorAll("button"));
    await userEvent(buttons[0], "click");
    const expected = formatShareMessage(title, undefined, "claim", false, community, url, "en");
    expect(share).toHaveBeenCalledWith({ title, text: expected, url });
    await userEvent(buttons.find((button) => button.textContent?.includes("WhatsApp"))!, "click");
    expect(shareOnWhatsApp).toHaveBeenCalledWith(expected);
    await userEvent(buttons.find((button) => button.textContent?.includes("Telegram"))!, "click");
    const href = vi.mocked(openShareWindow).mock.calls[0][0];
    expect(new URL(href).searchParams.get("text")).toBe(expected);
  });
});

describe("recuperación al compartir", () => {
  it("conserva el enlace exacto para copia manual cuando falla el portapapeles", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example locale="es" />);
    await userEvent(screen.querySelector("button"), "click");
    const input = screen.querySelector('input[readonly]');
    expect(input?.getAttribute("value")).toBe(url);
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain("Podés seleccionarlo y copiarlo manualmente");
    const label = screen.querySelector("label");
    expect(label?.getAttribute("for")).toBe(input?.getAttribute("id"));
    expect(screen.textContent).toContain("Seleccionar enlace");
    expect(screen.textContent).not.toContain("barra de direcciones");
    expect(window.setTimeout).not.toHaveBeenCalled();
  });
  it("muestra el fallo nativo y confirma sólo una copia efectiva al recuperarse", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("Clipboard denied")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")), clipboard: { writeText } });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example locale="es" />);
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain("No pudimos compartir");
    const copy = Array.from(screen.querySelectorAll("button")).find((button) => button.textContent === "Copiar enlace")!;
    await userEvent(copy, "click");
    expect(showToast).toHaveBeenCalledWith("No se pudo copiar el enlace", "danger");
    expect(showToast).not.toHaveBeenCalledWith("Enlace copiado al portapapeles", "success");
    await userEvent(copy, "click");
    expect(writeText).toHaveBeenCalledWith(url);
    expect(showToast).toHaveBeenCalledWith("Enlace copiado al portapapeles", "success");
    expect(screen.querySelector('[role="alert"]')).toBeFalsy();
  });
  it("respeta una cancelación voluntaria sin informar error ni copiar", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")), clipboard: { writeText } });
    const { render, screen, userEvent } = await createDOM();
    await render(<Example locale="es" />);
    await userEvent(screen.querySelector("button"), "click");
    expect(screen.querySelector('[role="alert"]')).toBeFalsy();
    expect(showToast).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("variante compacta", () => {
  it("deja sólo Compartir para no desplazar la acción de una barra fija", async () => {
    const { screen, render } = await createDOM();
    await render(<Example locale="es" compact />);
    const labels = Array.from(screen.querySelectorAll("button")).map((button) => button.textContent?.trim());
    // D124: la flecha tipográfica pasó a ser un ícono SVG sin texto.
    expect(labels).toEqual(["Compartir"]);
  });
});
