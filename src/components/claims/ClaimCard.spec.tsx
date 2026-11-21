import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { showToast } from "~/components/ui/Toast";
import { triggerHapticFeedback } from "~/lib/haptics";
import { ClaimCard, type ClaimCardData } from "./ClaimCard";

vi.mock("~/components/ui/Toast", () => ({ showToast: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));

const claim: ClaimCardData = {
  id: "a0000000-0000-4000-8000-000000000001",
  title: "Reparar la vereda de la escuela",
  description: "Hay baldosas sueltas frente a la entrada.",
  category: "infraestructura",
  status: "open",
  image_url: null,
  support_count: 7,
  created_at: "2026-10-01T12:00:00Z",
};

const Example = component$<{ count: number }>(({ count }) => {
  useContextProvider(TimeZoneContext, "UTC");
  return <ClaimCard claim={{ ...claim, support_count: count }} />;
});

const InteractiveExample = component$(() => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  return <QwikRouterMockProvider url="http://localhost/reclamos"><ClaimCard claim={claim} /></QwikRouterMockProvider>;
});

describe("compartir el reclamo mediante un gesto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function swipeLeft() {
    vi.stubGlobal("window", { location: { origin: "https://agorbis.test" } });
    const { render, screen, userEvent } = await createDOM();
    await render(<InteractiveExample />);
    const target = screen.querySelector("div[style]")!;
    await userEvent(target, "touchstart", { touches: [{ clientX: 250, clientY: 150 }] });
    await userEvent(target, "touchmove", { touches: [{ clientX: 80, clientY: 150 }] });
    await userEvent(target, "touchend");
  }

  it("confirma la hoja del sistema sólo después de compartir", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    await swipeLeft();
    expect(share).toHaveBeenCalledWith({ title: claim.title, url: `https://agorbis.test/reclamos/${claim.id}` });
    expect(showToast).toHaveBeenCalledWith("¡Gracias por compartir!", "success");
    expect(triggerHapticFeedback).toHaveBeenCalledWith("success");
  });

  it("distingue un fallo de permisos de la cancelación voluntaria", async () => {
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")) });
    await swipeLeft();
    expect(showToast).toHaveBeenCalledWith("No pudimos compartir el reclamo. Abrilo para volver a intentarlo.", "danger");
    expect(triggerHapticFeedback).toHaveBeenCalledWith("warning");

    vi.clearAllMocks();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")) });
    await swipeLeft();
    expect(showToast).not.toHaveBeenCalled();
    expect(triggerHapticFeedback).not.toHaveBeenCalledWith("warning");
    expect(triggerHapticFeedback).not.toHaveBeenCalledWith("success");
  });

  it("confirma una copia efectiva y permite volver a intentar una copia fallida", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("Clipboard denied")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await swipeLeft();
    expect(showToast).toHaveBeenCalledWith("No se pudo copiar el enlace", "danger");
    expect(triggerHapticFeedback).not.toHaveBeenCalledWith("success");

    vi.clearAllMocks();
    await swipeLeft();
    expect(writeText).toHaveBeenCalledWith(`https://agorbis.test/reclamos/${claim.id}`);
    expect(showToast).toHaveBeenCalledWith("Enlace copiado al portapapeles", "success");
    expect(triggerHapticFeedback).toHaveBeenCalledWith("success");
  });

  it("informa que no pudo copiar cuando no existe portapapeles", async () => {
    vi.stubGlobal("navigator", {});
    await swipeLeft();
    expect(showToast).toHaveBeenCalledWith("No se pudo copiar el enlace", "danger");
  });
});

describe("apoyos reales en la tarjeta de reclamo", () => {
  it.each([1, 7, 30])("muestra %i personas sin atribuir una meta o fuerza vecinal", async (count) => {
    const { document } = await renderWithLocale(<Example count={count} />);
    const card = document.querySelector(`a[href="/reclamos/${claim.id}"]`)!;
    expect(card.textContent).toContain(`${count} ${count === 1 ? "persona afectada" : "personas afectadas"}`);
    expect(card.textContent).not.toContain("Fuerza vecinal");
    expect(card.textContent).not.toContain("Sumando firmas");
  });

  it("distingue un reclamo que todavía no recibió apoyos", async () => {
    const { document } = await renderWithLocale(<Example count={0} />);
    expect(document.body.textContent).toContain("Todavía nadie más se sumó");
  });
});
