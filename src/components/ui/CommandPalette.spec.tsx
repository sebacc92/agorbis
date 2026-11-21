import { $, component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import {
  searchEverything,
  type HeaderHit,
} from "~/components/layout/CommunitySearch";
import { CONTENT_KINDS } from "~/lib/content-kinds";
import { renderWithLocale } from "~/testing/render";
import {
  CommandPalette,
  communityQuickLinks,
  OPEN_COMMAND_PALETTE_EVENT,
  openCommandPalette,
} from "./CommandPalette";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("~/components/layout/CommunitySearch", () => ({
  searchEverything: vi.fn(),
}));
vi.mock("~/lib/haptics", () => ({ triggerHapticFeedback: vi.fn() }));
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url="http://localhost/explorar"
      goto={$(async (href) => {
        mocks.navigate(href);
      })}
    >
      <CommandPalette />
    </QwikRouterMockProvider>
  );
});

async function openPalette() {
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
            (this as unknown as HTMLDialogElement).open = true;
          },
        },
        close: {
          configurable: true,
          value() {
            (this as unknown as HTMLDialogElement).open = false;
          },
        },
      });
    Object.defineProperty(element, "focus", {
      configurable: true,
      value: () => {},
    });
    return element;
  });
  await dom.render(<Example />);
  await dom.userEvent(null, "d:keydown", { key: "k", ctrlKey: true });
  const input = dom.screen.querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  expect(input).toBeDefined();
  return { ...dom, input };
}

function hit(name: string, slug: string): HeaderHit {
  return {
    kind: "community",
    href: `/c/${slug}`,
    name,
    emoji: null,
    level: 3,
    communityName: null,
  };
}

/**
 * El bug que cubre: el botón del header despachaba en `window` y la paleta
 * escuchaba con `useOnDocument`. Un evento de `window` no baja a `document`,
 * así que el botón no abría nada. Igual que en `Toast.spec.tsx`, se afirma
 * sobre el atributo que lee qwikloader: `q-w:` es `window`, `q-d:` `document`.
 */
describe("CommandPalette", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("openCommandPalette despacha el evento en window", () => {
    const target = new EventTarget();
    const received: Event[] = [];
    target.addEventListener(OPEN_COMMAND_PALETTE_EVENT, (event) =>
      received.push(event),
    );
    vi.stubGlobal("window", target);

    openCommandPalette();

    expect(received).toHaveLength(1);
  });

  it("la paleta cerrada escucha ese evento en window, no en document", async () => {
    const { container } = await renderWithLocale(
      <CommandPalette homeSlug={null} />,
    );
    // El host persistente conserva el listener aunque el diálogo esté cerrado.
    // En el nombre del atributo cada guion va duplicado
    // (`camelToKebab` de qwikloader), y así lo vuelve a armar al despachar.
    const encoded = OPEN_COMMAND_PALETTE_EVENT.replace(/-/g, "--");
    const html = container.element.outerHTML;
    expect(html).toContain(`q-w:${encoded}=`);
    expect(html).not.toContain(`q-d:${encoded}=`);
  });
});

describe("atajos de la paleta", () => {
  const same = (source: string) => source;
  const shape = (links: ReturnType<typeof communityQuickLinks>) =>
    links.map(({ href, icon, kind }) => ({ href, icon, kind }));

  it("sin residencia van a rutas generales, con íconos neutros", () => {
    expect(shape(communityQuickLinks("  ", same))).toEqual([
      { href: "/explorar", icon: "compass", kind: undefined },
      { href: "/buscar", icon: "search", kind: undefined },
    ]);
  });

  it("con residencia cada atajo lleva el ícono y el tipo de lo que abre", () => {
    expect(shape(communityQuickLinks("mar-del-plata", same))).toEqual([
      {
        href: "/c/mar-del-plata/reclamos/nuevo",
        icon: CONTENT_KINDS.claim.icon,
        kind: "claim",
      },
      {
        href: "/c/mar-del-plata/encuestas",
        icon: CONTENT_KINDS.poll.icon,
        kind: "poll",
      },
      {
        href: "/c/mar-del-plata/debates",
        icon: CONTENT_KINDS.debate.icon,
        kind: "debate",
      },
    ]);
  });
});

describe("resultados vigentes de la paleta", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });
  it("no permite abrir resultados anteriores al cambiar la consulta o mientras espera", async () => {
    vi.useFakeTimers();
    vi.mocked(searchEverything).mockResolvedValueOnce([
      hit("Argentina", "argentina"),
    ]);
    let resolveNext!: (hits: HeaderHit[]) => void;
    vi.mocked(searchEverything).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
    const { screen, userEvent, input } = await openPalette();
    input.value = "Argentina";
    await userEvent(input, "input");
    await vi.advanceTimersByTimeAsync(200);
    await userEvent(input, "focus");
    expect(screen.textContent).toContain("Argentina");

    input.value = "Cordoba";
    await userEvent(input, "input");
    await userEvent(input, "keydown", { key: "Enter" });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.querySelector('input[type="search"]')).toBeTruthy();
    expect(screen.textContent).not.toContain("Argentina");
    await vi.advanceTimersByTimeAsync(200);
    await userEvent(input, "keydown", { key: "Enter" });
    expect(mocks.navigate).not.toHaveBeenCalled();
    resolveNext([hit("Córdoba", "cordoba")]);
    await userEvent(input, "focus");
    await userEvent(input, "keydown", { key: "Enter" });
    expect(mocks.navigate).toHaveBeenCalledWith("/c/cordoba");
  });

  it("distingue el error de resultados vacíos y reintenta la misma consulta", async () => {
    vi.useFakeTimers();
    vi.mocked(searchEverything)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([]);
    const { screen, userEvent, input } = await openPalette();
    input.value = "Cordoba";
    await userEvent(input, "input");
    await vi.advanceTimersByTimeAsync(200);
    await userEvent(input, "focus");
    expect(screen.querySelector('[role="alert"]')?.textContent).toContain(
      "No pudimos buscar. Probá de nuevo.",
    );
    expect(screen.textContent).not.toContain("No se encontraron resultados");
    const retry = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent === "Reintentar búsqueda",
    )!;
    await userEvent(retry, "click");
    await vi.advanceTimersByTimeAsync(200);
    await userEvent(input, "focus");
    expect(searchEverything).toHaveBeenNthCalledWith(2, "Cordoba", "es");
    expect(screen.textContent).toContain("No se encontraron resultados");
    expect(screen.querySelector('[role="alert"]')).toBeFalsy();
  });

  it("cada resultado dice qué es y su botón no lleva bloques adentro", async () => {
    vi.useFakeTimers();
    vi.mocked(searchEverything).mockResolvedValueOnce([
      hit("Córdoba", "cordoba"),
      {
        kind: "poll",
        href: "/encuestas/plaza",
        name: "Plaza de Córdoba",
        emoji: null,
        level: null,
        communityName: "Córdoba",
      },
      {
        kind: "institution",
        href: "/instituciones/concejo",
        name: "Concejo de Córdoba",
        emoji: null,
        level: null,
        communityName: "Córdoba",
      },
    ]);
    const { screen, userEvent, input } = await openPalette();
    input.value = "Córdoba";
    await userEvent(input, "input");
    await vi.advanceTimersByTimeAsync(200);
    await userEvent(input, "focus");

    const rows = Array.from(screen.querySelectorAll("li button"));
    expect(rows).toHaveLength(3);
    // La comunidad dice su nivel; cada publicación, su tipo. Antes todas
    // decían "Publicaciones", aunque fuera un solo resultado.
    expect(rows[0].textContent).toContain("Provincia o estado");
    expect(rows[1].textContent).toContain("Encuesta");
    expect(rows[2].textContent).toContain("Institución");
    expect(screen.textContent).not.toContain("Publicaciones");
    // Dentro de un <button> sólo va contenido de frase (Q12 en desarrollo).
    expect(
      screen.querySelectorAll("button div, button p, button h3"),
    ).toHaveLength(0);
  });
});
