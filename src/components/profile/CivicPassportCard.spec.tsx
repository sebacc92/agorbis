import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { CivicPassportCard, type CivicBadge } from "./CivicPassportCard";

/**
 * Décima ronda, mejora 10: una cuenta nueva abría el perfil con cinco
 * casilleros "Pendiente", la lista de lo que no hizo. El pasaporte muestra
 * los sellos obtenidos y, como mucho, el que sigue.
 */
const badge = (id: string, title: string, unlocked: boolean): CivicBadge => ({
  id,
  icon: "trophy",
  title,
  description: `Qué hay que hacer para ${title}.`,
  unlocked,
  progressText: unlocked ? "1 acción" : "0 acciones",
});

const Fixture = component$<{ badges: CivicBadge[]; own?: boolean }>(
  ({ badges, own = true }) => {
    useContextProvider(LocaleContext, "es");
    return <CivicPassportCard badges={badges} totalActions={0} own={own} />;
  },
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * `DialogFrame` abre con `showModal()`, que el documento de prueba no trae:
 * se simula igual que en GpsNavigationModal.spec.tsx.
 */
async function createDialogDOM() {
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
  return dom;
}

describe("CivicPassportCard", () => {
  it("sin sellos obtenidos ofrece un solo primer paso y ningún casillero pendiente", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        badges={[
          badge("a", "Victoria Vecinal", false),
          badge("b", "Votante Activo", false),
          badge("c", "Voz Barrial", false),
        ]}
      />,
    );
    expect(screen.textContent).toContain("Tu primer sello");
    expect(screen.textContent).not.toContain("Pendiente");
    expect(screen.textContent).not.toContain("Obtenido");
    const next = screen.querySelector("[data-next-badge]");
    expect(next?.textContent).toContain("Para empezar");
    expect(next?.textContent).toContain("Victoria Vecinal");
    expect(screen.textContent).not.toContain("Votante Activo");
    expect(screen.textContent).toContain("0 / 3");
  });

  it("con sellos obtenidos los lista y nombra sólo el siguiente", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        badges={[
          badge("a", "Victoria Vecinal", true),
          badge("b", "Votante Activo", false),
          badge("c", "Voz Barrial", false),
        ]}
      />,
    );
    expect(screen.textContent).toContain("Sellos obtenidos");
    expect(screen.textContent?.match(/Obtenido/g)).toHaveLength(1);
    const next = screen.querySelector("[data-next-badge]");
    expect(next?.textContent).toContain("Próximo sello");
    expect(next?.textContent).toContain("Votante Activo");
    expect(screen.textContent).not.toContain("Voz Barrial");
  });

  it("la victoria no es el primer paso: depende de que un reclamo se resuelva", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        badges={[
          badge("victory", "Victoria Vecinal", false),
          badge("voter", "Votante Activo", false),
        ]}
      />,
    );
    expect(screen.querySelector("[data-next-badge]")?.textContent).toContain(
      "Votante Activo",
    );
  });

  it("en un perfil ajeno no habla en segunda persona ni propone empezar", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture own={false} badges={[badge("voter", "Votante Activo", false)]} />,
    );
    expect(screen.textContent).toContain("Primer sello");
    expect(screen.textContent).not.toContain("Tu primer sello");
    expect(screen.textContent).not.toContain("Para empezar");
    expect(screen.querySelector("[data-next-badge]")?.textContent).toContain(
      "Próximo sello",
    );
  });

  it("sin sellos definidos no afirma que están todos", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture badges={[]} />);
    expect(screen.textContent).not.toContain("todos los sellos");
  });

  it("con todos los sellos no promete ninguno más", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        badges={[
          badge("a", "Victoria Vecinal", true),
          badge("b", "Votante Activo", true),
        ]}
      />,
    );
    expect(screen.querySelector("[data-next-badge]")).toBeFalsy();
    expect(screen.textContent).toContain(
      "Obtuviste todos los sellos que existen hoy.",
    );
  });

  /**
   * D126: con `div`, `h4` y `p` adentro de cada sello, Qwik cortaba el
   * servidor de desarrollo (Q12) en /u/[id] y en la pestaña Resumen.
   */
  it("los sellos son botones con contenido de frase y sin identidad repetida", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        badges={[
          badge("a", "Victoria Vecinal", true),
          badge("b", "Votante Activo", false),
        ]}
      />,
    );
    const earned = screen.querySelector('button[data-badge="a"]');
    expect(earned?.textContent).toContain("Victoria Vecinal");
    expect(screen.querySelector("[data-next-badge]")?.tagName).toBe("BUTTON");
    const blocks = ["div", "p", "ul", "li", "h2", "h3", "h4"].flatMap((tag) =>
      Array.from(screen.querySelectorAll(`button ${tag}`)),
    );
    expect(blocks).toHaveLength(0);
    // El nombre y la comunidad viven en la banda de la cabecera.
    expect(screen.querySelector("h2")?.textContent).toContain(
      "Pasaporte cívico",
    );
    expect(screen.textContent).not.toContain("Comunidad");
  });

  it("en el perfil propio muestra nivel y barra, y el sello abierto propone celebrarlo", async () => {
    const { render, screen, userEvent } = await createDialogDOM();
    await render(<Fixture badges={[badge("voter", "Votante Activo", true)]} />);
    expect(
      screen.querySelector('[role="progressbar"]')?.getAttribute("aria-label"),
    ).toBe("Progreso del pasaporte cívico");
    expect(screen.textContent).toContain("Nivel 1");
    const voter = screen.querySelector('button[data-badge="voter"]');
    await userEvent(voter, "click");
    const dialog = screen.querySelector("dialog");
    expect(dialog?.textContent).toContain("Votante Activo");
    expect(dialog?.textContent).toContain("¡Felicitaciones!");
    expect(dialog?.textContent).toContain("Celebrar sello");
  });

  it("en un perfil ajeno no muestra nivel ni barra, y el sello abierto no felicita ni celebra", async () => {
    const { render, screen, userEvent } = await createDialogDOM();
    await render(
      <Fixture own={false} badges={[badge("voter", "Votante Activo", true)]} />,
    );
    expect(screen.querySelector('[role="progressbar"]')).toBeFalsy();
    expect(screen.textContent).not.toContain("Nivel");
    const voter = screen.querySelector('button[data-badge="voter"]');
    await userEvent(voter, "click");
    const dialog = screen.querySelector("dialog");
    expect(dialog?.textContent).toContain("Votante Activo");
    expect(dialog?.textContent).not.toContain("¡Felicitaciones!");
    expect(dialog?.textContent).not.toContain("Consejo cívico");
    expect(dialog?.textContent).not.toContain("Celebrar sello");
  });
});
