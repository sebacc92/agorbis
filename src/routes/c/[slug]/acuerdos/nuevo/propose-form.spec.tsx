import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import ProposeForm, { useProposeContext } from "./index";

const community = {
  id: "c-mdq",
  slug: "mar-del-plata",
  name: "Mar del Plata",
  emoji: "🌊",
  level: 4,
  path: "earth.south-america.argentina.buenos-aires.mar-del-plata",
};
const candidates = [
  {
    id: "c-tandil",
    slug: "tandil",
    name: "Tandil",
    emoji: "🪨",
    level: 4,
    path: "earth.south-america.argentina.buenos-aires.tandil",
  },
  {
    id: "c-cordoba",
    slug: "cordoba",
    name: "Córdoba",
    emoji: "⛰️",
    level: 3,
    path: "earth.south-america.argentina.cordoba",
  },
];

const Fixture = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url="https://agorbis.test/c/mar-del-plata/acuerdos/nuevo/"
      params={{ slug: "mar-del-plata" }}
      loaders={[
        {
          loader: useProposeContext,
          data: { draftOwnerId: "u-sofia", community, candidates, truncated: false },
        },
      ]}
    >
      <ProposeForm />
    </QwikRouterMockProvider>
  );
});

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  // El borrador del dispositivo escucha eventos de la ventana; acá no hay
  // navegador, así que alcanza con una ventana que no haga nada.
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { assign: vi.fn() },
    confirm: () => true,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("formulario de proponer un acuerdo", () => {
  it("pide título, compromiso, comunidades y duración, y manda la comunidad propia", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    expect(screen.querySelector("h1")?.textContent).toBe(
      "Proponer un acuerdo",
    );
    expect(
      screen
        .querySelector('input[name="community_slug"]')
        ?.getAttribute("value"),
    ).toBe("mar-del-plata");
    expect(screen.querySelector('input[name="title"]')).toBeTruthy();
    expect(screen.querySelector('textarea[name="body"]')).toBeTruthy();
    expect(screen.querySelector('select[name="duration_days"]')).toBeTruthy();
    const boxes = Array.from(
      screen.querySelectorAll('input[type="checkbox"][name="communities"]'),
    ).map((box) => box.getAttribute("value"));
    expect(boxes).toEqual(["c-tandil", "c-cordoba"]);
    expect(screen.querySelector("button[type=submit]")?.textContent).toContain(
      "Proponer el acuerdo",
    );
  });

  it("dice las reglas antes de enviar y no afirma ningún resultado", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    expect(screen.textContent).toContain("Mar del Plata participa siempre");
    expect(screen.textContent).toContain("cinco participantes o más");
    expect(screen.textContent).toContain("el texto no se puede cambiar");
    expect(screen.textContent).not.toContain("Aprobado");
    expect(screen.textContent).not.toContain("Publicado");
  });

  it("la duración por defecto es 14 días y las opciones van de 7 a 30", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const options = Array.from(
      screen.querySelectorAll('select[name="duration_days"] option'),
    );
    expect(options.map((o) => o.getAttribute("value"))).toEqual([
      "7",
      "14",
      "21",
      "30",
    ]);
    expect(
      options.find((o) => o.hasAttribute("selected"))?.getAttribute("value"),
    ).toBe("14");
  });
});
