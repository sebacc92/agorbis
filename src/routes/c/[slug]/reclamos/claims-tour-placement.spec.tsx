import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { EMPTY_QUOTA } from "~/lib/quota";
import { useCommunity } from "../layout";
import ClaimsPage, { useClaims } from "./index";

/**
 * Décima ronda, mejora 7: la guía de tres pasos aparecía arriba de la lista
 * de reclamos, también para visitantes, y empujaba el contenido fuera de la
 * primera pantalla. Ahora va después del primer reclamo y sólo para quien
 * vive acá. La guía se dibuja oculta hasta que una tarea visible lee el
 * navegador, así que acá se comprueba dónde queda montada.
 */
const community = {
  id: "c-barrio",
  slug: "barrio",
  name: "Barrio",
  emoji: "🏘️",
  level: 5,
  path: "earth.south-america.argentina.buenos-aires.barrio",
  description: null,
  member_count: 2,
  parent_id: null,
};

const claim = (id: string, title: string) => ({
  id,
  title,
  description: "Descripción del problema.",
  category: "otro" as const,
  status: "open",
  image_url: null,
  support_count: 1,
  created_at: "2026-11-01T00:00:00Z",
  response_due_at: null,
  first_response_at: null,
  escalated_at: null,
});

const Fixture = component$<{ member: boolean; empty?: boolean }>(
  ({ member, empty = false }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider
        url="https://agorbis.test/c/barrio/reclamos/"
        params={{ slug: "barrio" }}
        loaders={[
          {
            loader: useCommunity,
            data: {
              community,
              chain: [community],
              isMember: member,
              isAuthenticated: member,
              hasResidence: member,
              residenceUnknown: false,
              isFollowing: false,
              childCount: 0,
              hasBudget: false,
              counts: {
                polls: 0,
                debates: 0,
                claims: empty ? 0 : 2,
                resolvedClaims: 0,
                projects: 0,
                info: 0,
              },
            },
          },
          {
            loader: useClaims,
            data: {
              claims: empty
                ? []
                : [claim("c1", "Primer reclamo"), claim("c2", "Segundo reclamo")],
              escalated: [],
              nextCursor: null,
              sort: "recientes",
              category: null,
              status: "todos",
              query: "",
              summary: EMPTY_QUOTA,
            },
          },
        ]}
      >
        <ClaimsPage />
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

/**
 * La página centra el filtro activo con `scrollIntoView`, que el DOM de
 * pruebas no tiene: sin simularlo la tarea visible falla y el render no
 * termina nunca.
 */
async function createPageDOM() {
  const dom = await createDOM();
  const prototype = Object.getPrototypeOf(
    dom.screen.ownerDocument.createElement("a"),
  );
  Object.defineProperty(prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  // El aviso de actividad nueva lee `document` en su tarea visible y el
  // tirón para recargar mira `window`: una ventana quieta alcanza.
  vi.stubGlobal("document", dom.screen.ownerDocument);
  vi.stubGlobal("window", {
    scrollY: 0,
    innerHeight: 900,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { reload: vi.fn() },
  });
  return dom;
}

/** La celda que la página reserva para la guía, montada o no. */
const slots = (screen: Element) =>
  Array.from(screen.querySelectorAll("#listado-reclamos > li"));
const slotIndex = (screen: Element) =>
  slots(screen).findIndex((li) => li.hasAttribute("data-claims-tour-slot"));

describe("dónde vive la guía rápida de Reclamos", () => {
  it("para quien vive acá, el hueco de la guía está después del primer reclamo y de ningún otro", async () => {
    const { render, screen } = await createPageDOM();
    await render(<Fixture member />);
    expect(screen.querySelector("#listado-reclamos")).toBeTruthy();
    // Reclamo, guía, reclamo: la guía es la segunda celda y la única.
    expect(slotIndex(screen)).toBe(1);
    expect(screen.querySelectorAll("[data-claims-tour-slot]")).toHaveLength(1);
  });

  it("una visitante no tiene guía: no puede publicar, así que no hay pasos que darle", async () => {
    const { render, screen } = await createPageDOM();
    await render(<Fixture member={false} />);
    expect(screen.querySelector("#listado-reclamos")).toBeTruthy();
    expect(slotIndex(screen)).toBe(-1);
    expect(screen.textContent).not.toContain("Guía rápida");
  });

  it("sin reclamos no hay guía intercalada: el estado vacío ya orienta", async () => {
    const { render, screen } = await createPageDOM();
    await render(<Fixture member empty />);
    expect(screen.querySelector("#listado-reclamos")).toBeFalsy();
    expect(screen.textContent).not.toContain("Guía rápida");
  });
});
