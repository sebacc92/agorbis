import { $ } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it, vi } from "vitest";
import { triggerHapticFeedback } from "~/lib/haptics";
import { renderWithLocale } from "~/testing/render";
import { Chip } from "./Chip";

// El handler de prueba vibra, como los temas de /buscar y los filtros de
// /notificaciones: así se ve si el clic llegó al `onClick$` del chip.
const haptic = vi.hoisted(() => vi.fn());
vi.mock("~/lib/haptics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/haptics")>()),
  triggerHapticFeedback: haptic,
}));

/* Los chips con `href` son un `Link` del router: se renderizan como en el
   servidor, con el proveedor de ruta de prueba, igual que las tarjetas. */
describe("Chip (D123)", () => {
  it("como enlace seleccionado marca aria-current y el relleno de marca", async () => {
    const { document } = await renderWithLocale(
      <Chip href="/inicio?tipo=poll" selected icon="ballot">
        {"Encuestas"}
      </Chip>,
    );
    const link = document.querySelector("a")!;
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.className).toContain("bg-brand-600");
    expect(link.querySelector("svg")).toBeTruthy();
    expect(link.textContent).toContain("Encuestas");
  });

  it("un tipo de contenido seleccionado usa su propio color, no el violeta", async () => {
    const { document } = await renderWithLocale(
      <Chip href="/x" selected selectedClass="bg-kind-claim text-white">
        {"Reclamos"}
      </Chip>,
    );
    const link = document.querySelector("a")!;
    expect(link.className).toContain("bg-kind-claim");
    expect(link.className).not.toContain("bg-brand-600");
  });

  it("un badge sin acción es un span, no un botón", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Chip variant="badge" icon="megaphone">
        {"Reclamo"}
      </Chip>,
    );
    expect(screen.querySelector("span")).toBeTruthy();
    expect(screen.querySelector("button")).toBeFalsy();
    expect(screen.querySelector("a")).toBeFalsy();
  });

  it("un chip con onClick$ es un botón con aria-pressed", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Chip selected onClick$={$(() => {})}>
        {"Con miembros"}
      </Chip>,
    );
    const button = screen.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  /* D126: los tipos de /buscar envían un formulario GET. Sin `onClick$`, el
     chip igual tiene que mandar `name=value` y decir cuál es el vigente. */
  it("un chip de formulario manda name y value y anuncia el vigente con aria-pressed", async () => {
    const { render, screen } = await createDOM();
    await render(
      <div>
        <Chip type="submit" name="tipo" value="poll" selected>
          {"Encuestas"}
        </Chip>
        <Chip type="submit" name="tipo" value="debate">
          {"Debates"}
        </Chip>
      </div>,
    );
    const [poll, debate] = Array.from(screen.querySelectorAll("button"));
    expect(poll.getAttribute("type")).toBe("submit");
    expect(poll.getAttribute("name")).toBe("tipo");
    expect(poll.getAttribute("value")).toBe("poll");
    expect(poll.getAttribute("aria-pressed")).toBe("true");
    expect(debate.getAttribute("name")).toBe("tipo");
    expect(debate.getAttribute("value")).toBe("debate");
    expect(debate.getAttribute("aria-pressed")).toBe("false");
  });

  /* Hasta D126 el chip-enlace descartaba su `onClick$` en silencio, y de ese
     pase dependen la vibración de los temas de /buscar y la de los filtros de
     /notificaciones. El destino es absoluto y de otro origen a propósito: el
     documento de prueba no tiene URL propia, así que un `href` relativo queda
     relativo y la precarga del `Link` (`new URL(a.href)`) falla antes de
     llegar al handler. Lo que se prueba es el pase del handler, no la
     navegación. */
  it("como enlace corre su onClick$ y sigue anunciándose con aria-current, no aria-pressed", async () => {
    haptic.mockClear();
    const { render, screen, userEvent } = await createDOM();
    await render(
      <QwikRouterMockProvider url="https://agorbis.test/buscar">
        <Chip
          href="https://ejemplo.test/buscar?tema=agua"
          selected
          onClick$={$(() => triggerHapticFeedback("selection"))}
        >
          {"Agua"}
        </Chip>
      </QwikRouterMockProvider>,
    );
    const link = screen.querySelector("a")!;
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.hasAttribute("aria-pressed")).toBe(false);
    expect(haptic).not.toHaveBeenCalled();
    await userEvent(link, "click");
    expect(haptic).toHaveBeenCalledWith("selection");
  });
});
