import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { EMPTY_QUOTA } from "~/lib/quota";
import CommunityLayout, { useCommunity } from "./layout";
import PollsPage, {
  useCommunityAgreements,
  usePolls,
} from "./encuestas/index";
import SubPage, { useChildren } from "./sub/index";

let restoreScroll = () => {};
beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  restoreScroll();
  vi.unstubAllGlobals();
});

async function createPageDOM() {
  const dom = await createDOM();
  const prototype = Object.getPrototypeOf(
    dom.screen.ownerDocument.createElement("a"),
  );
  const descriptor = Object.getOwnPropertyDescriptor(
    prototype,
    "scrollIntoView",
  );
  Object.defineProperty(prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  restoreScroll = () => {
    if (descriptor)
      Object.defineProperty(prototype, "scrollIntoView", descriptor);
    else Reflect.deleteProperty(prototype, "scrollIntoView");
  };
  return dom;
}

const community = {
  community: {
    id: "community",
    name: "Barrio",
    slug: "barrio",
    emoji: "🏡",
    path: "earth.barrio",
    level: 4,
    member_count: 0,
  },
  chain: [
    {
      id: "community",
      name: "Barrio",
      slug: "barrio",
      emoji: "🏡",
      path: "earth.barrio",
      level: 4,
    },
  ],
  isMember: true,
  isAuthenticated: false,
  isFollowing: false,
  childCount: 330,
  hasBudget: false,
  counts: {
    polls: 0,
    debates: 0,
    claims: 0,
    resolvedClaims: 0,
    projects: 0,
    info: 0,
  },
};

const Navigation = component$<{ section: string }>(({ section }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url={`https://agorbis.test/c/barrio/${section}`}
      loaders={[{ loader: useCommunity, data: community }]}
    >
      <CommunityLayout>
        <span />
      </CommunityLayout>
    </QwikRouterMockProvider>
  );
});

/** Una visitante sin sesión: el recuadro que pide crear la cuenta. */
const Visitor = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url="https://agorbis.test/c/barrio/"
      loaders={[
        {
          loader: useCommunity,
          data: { ...community, isMember: false, isAuthenticated: false },
        },
      ]}
    >
      <CommunityLayout>
        <span />
      </CommunityLayout>
    </QwikRouterMockProvider>
  );
});

/** Con conteos desconocidos el layout dibuja su aviso: se comprueba dónde no. */
const UnknownCounts = component$<{ section: string }>(({ section }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url={`https://agorbis.test/c/barrio/${section}`}
      loaders={[
        {
          loader: useCommunity,
          data: {
            ...community,
            childCount: null,
            hasBudget: null,
            counts: { ...community.counts, claims: null },
          },
        },
      ]}
    >
      <CommunityLayout>
        <span id="contenido-de-la-ruta" />
      </CommunityLayout>
    </QwikRouterMockProvider>
  );
});

const EmptyPolls = component$<{ cursor: boolean; category: string | null }>(
  ({ cursor, category }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider
        url="https://agorbis.test/c/barrio/encuestas/"
        loaders={[
          { loader: useCommunity, data: community },
          // La sección de acuerdos (D118) sin datos no dibuja nada.
          { loader: useCommunityAgreements, data: { items: [], failed: false } },
          {
            loader: usePolls,
            data: {
              polls: [],
              nextCursor: null,
              category,
              hasCursor: cursor,
              summary: EMPTY_QUOTA,
            },
          },
        ]}
      >
        <PollsPage />
      </QwikRouterMockProvider>
    );
  },
);

const EmptyDirectory = component$<{ page: number; query: string }>(
  ({ page, query }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider
        url="https://agorbis.test/c/barrio/sub/"
        loaders={[
          { loader: useCommunity, data: community },
          {
            loader: useChildren,
            data: { children: [], homePath: null, query, page, hasMore: false },
          },
        ]}
      >
        <SubPage />
      </QwikRouterMockProvider>
    );
  },
);

describe("los formularios de creación dentro del layout de la comunidad", () => {
  it.each([
    ["reclamos/nuevo", "Reclamos"],
    ["reclamos/nuevo/", "Reclamos"],
    ["encuestas/nueva/", "Encuestas"],
    ["debates/nuevo/", "Debates"],
    ["proyectos/nuevo/", "Proyectos"],
    ["presupuesto/nueva/", "Presupuesto"],
  ])(
    "%s deja al formulario el título y la miga, y conserva su pestaña",
    async (section, label) => {
      const { render, screen: document } = await createPageDOM();
      await render(<UnknownCounts section={section} />);
      expect(document.querySelector("[data-community-page] > header")).toBeFalsy();
      expect(document.querySelectorAll("h1")).toHaveLength(0);
      expect(
        document.querySelector('nav[aria-label="Cadena de comunidades"]'),
      ).toBeFalsy();
      expect(document.textContent).not.toContain("Invitar vecinos");
      expect(document.textContent).not.toContain(
        "Algunas cantidades no están disponibles",
      );
      // D79: la sección sigue marcada mientras se crea.
      expect(
        document.querySelector(
          'nav[aria-label="Secciones de la comunidad"] a[aria-current="page"]',
        )?.textContent,
      ).toContain(label);
      // El scroll-padding de las pestañas cuelga de `data-community-page`, y el
      // formulario trae su contenedor: el del layout no le suma alto ni relleno.
      const content = document.querySelector("#contenido-de-la-ruta");
      expect(content?.closest("[data-community-page]")).toBeTruthy();
      expect(content?.parentElement?.className ?? "").not.toMatch(
        /container-content|py-8/,
      );
    },
  );

  it.each(["", "reclamos/", "reclamos"])(
    "la sección %s conserva cabecera, aviso y contenedor",
    async (section) => {
      const { render, screen: document } = await createPageDOM();
      await render(<UnknownCounts section={section} />);
      expect(document.querySelector("[data-community-page] > header")).toBeTruthy();
      expect(document.querySelector("h1")?.textContent).toBe("Barrio");
      expect(
        document.querySelectorAll('nav[aria-label="Cadena de comunidades"]'),
      ).toHaveLength(1);
      expect(document.textContent).toContain(
        "Algunas cantidades no están disponibles",
      );
      expect(
        document.querySelector("#contenido-de-la-ruta")?.parentElement?.className,
      ).toContain("container-content py-8");
    },
  );
});

describe("orientación en herramientas y listados comunitarios", () => {
  it.each([
    ["mapa", "Mapa barrial"],
    ["victorias", "Victorias"],
    ["rendicion", "Rendición"],
    ["instituciones", "Instituciones"],
  ])(
    "%s anuncia su herramienta activa y no marca Info",
    async (section, label) => {
      const { render, screen: document } = await createPageDOM();
      await render(<Navigation section={`${section}/`} />);
      const tools = document.querySelector(
        'nav[aria-label="Herramientas de la comunidad"]',
      );
      expect(
        tools?.querySelector('a[aria-current="page"]')?.textContent,
      ).toContain(label);
      expect(tools?.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
      expect(
        document.querySelector(
          'nav[aria-label="Secciones de la comunidad"] a[aria-current]',
        ),
      ).toBeFalsy();
      // La comparativa dejó las herramientas: es una vista de Comparar (D96).
      expect(tools?.querySelectorAll("a")).toHaveLength(4);
    },
  );

  it("la comparativa se marca como Comparar, en el carril, con sus dos vistas", async () => {
    const { render, screen: document } = await createPageDOM();
    await render(<Navigation section="comparativa/" />);
    const sections = document.querySelector(
      'nav[aria-label="Secciones de la comunidad"]',
    );
    const current = sections?.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current?.[0]?.textContent).toContain("Comparar");
    // D126: la sección abierta desde Más es una pestaña más del carril, y
    // Más queda neutro como desborde, sin repetir la sección.
    expect(
      sections?.querySelector('[data-tabs-fade] ul a[aria-current="page"]')
        ?.textContent,
    ).toContain("Comparar");
    const summary = sections?.querySelector(
      "details[data-community-more] summary",
    );
    expect(
      summary?.querySelector('span[aria-hidden="true"]')?.textContent,
    ).toBe("Más");
    expect(summary?.textContent).not.toContain("Comparar");
    expect(
      Array.from(
        sections?.querySelectorAll("details[data-community-more] a") ?? [],
      ).some((link) => link.textContent?.includes("Comparar")),
    ).toBe(true);
    const views = document.querySelector(
      'nav[aria-label="Formas de comparar"]',
    );
    expect(views?.querySelectorAll("a")).toHaveLength(2);
    expect(
      views?.querySelector('a[aria-current="page"]')?.textContent,
    ).toContain("Con comunidades del mismo nivel");
    expect(
      document.querySelector('nav[aria-label="Herramientas de la comunidad"]'),
    ).toBeFalsy();
  });

  it("Presupuesto sin partida no aparece en el carril ni en Más, tampoco al abrirlo por enlace (D59)", async () => {
    const { render, screen: document } = await createPageDOM();
    // El fixture no tiene partida (`hasBudget: false`): se llega por enlace.
    await render(<Navigation section="presupuesto/" />);
    const sections = document.querySelector(
      'nav[aria-label="Secciones de la comunidad"]',
    );
    // Una pestaña marcada sería el recordatorio de quién no tiene partida que
    // D59 descarta: ninguna sección se anuncia como la actual.
    const current = sections?.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(0);
    // Quedan las cinco pestañas, sin una sexta al final.
    const rail = Array.from(
      sections?.querySelectorAll("[data-tabs-fade] ul a") ?? [],
    );
    expect(rail).toHaveLength(5);
    expect(
      rail.some((link) => link.textContent?.includes("Presupuesto")),
    ).toBe(false);
    // "Más" sigue neutro, sin ninguna sección escrita en el botón.
    expect(
      sections
        ?.querySelector("details[data-community-more] summary")
        ?.querySelector('span[aria-hidden="true"]')?.textContent,
    ).toBe("Más");
    const more = Array.from(
      sections?.querySelectorAll("details[data-community-more] a") ?? [],
    ).map((link) => link.textContent);
    expect(more.some((text) => text?.includes("Presupuesto"))).toBe(false);
  });

  it("deja a la vista las cinco secciones de participar y el resto en Más", async () => {
    const { render, screen: document } = await createPageDOM();
    await render(<Navigation section="" />);
    const sections = document.querySelector(
      'nav[aria-label="Secciones de la comunidad"]',
    );
    const visible = Array.from(
      sections?.querySelector("ul")?.querySelectorAll("a") ?? [],
    ).map((link) => link.textContent);
    expect(visible).toHaveLength(5);
    for (const label of ["Info", "Encuestas", "Debates", "Reclamos", "Proyectos"]) {
      expect(visible.some((text) => text?.includes(label))).toBe(true);
    }
    const more = Array.from(
      sections?.querySelectorAll("details[data-community-more] a") ?? [],
    ).map((link) => link.textContent);
    // Sin partida no hay presupuesto (D59).
    // D123: el ícono es un SVG sin texto; la etiqueta queda sola.
    expect(more.map((text) => text?.replace(/[\d.,\s]+$/, "").trim())).toEqual([
      "Miembros",
      "Sub-comunidades",
      "Comparar",
    ]);
  });

  it("Info conserva su selección en la raíz", async () => {
    const { render, screen: document } = await createPageDOM();
    await render(<Navigation section="" />);
    expect(
      document.querySelector(
        'nav[aria-label="Secciones de la comunidad"] a[aria-current="page"]',
      )?.textContent,
    ).toContain("Info");
    expect(
      document.querySelector('nav[aria-label="Herramientas de la comunidad"]'),
    ).toBeFalsy();
  });

  it.each([null, "ambiente"])(
    "el fin vacío conserva el regreso con categoría %s y no invita a estrenar encuestas",
    async (category) => {
      const { render, screen: document } = await createPageDOM();
      await render(<EmptyPolls cursor category={category} />);
      expect(document.textContent).toContain(
        "Llegaste al final de las encuestas.",
      );
      expect(document.textContent).not.toContain("Nadie preguntó nada");
      expect(document.textContent).not.toContain(
        "No hay encuestas de Ambiente",
      );
      const nav = document.querySelector('nav[aria-label="Paginación"]');
      const target = new URL(
        nav!.querySelector("a")!.getAttribute("href")!,
        "https://agorbis.test",
      );
      expect(target.searchParams.get("categoria")).toBe(category);
      expect(target.searchParams.has("antes")).toBe(false);
      expect(target.searchParams.has("id")).toBe(false);
      expect(nav?.querySelectorAll("a")).toHaveLength(1);
    },
  );

  it("el vacío inicial conserva su explicación de comunidad sin encuestas", async () => {
    const { render, screen: document } = await createPageDOM();
    await render(<EmptyPolls cursor={false} category={null} />);
    expect(document.textContent).toContain(
      "Nadie preguntó nada todavía en Barrio",
    );
    expect(document.textContent).not.toContain("Llegaste al final");
  });

  it("el directorio agotado mantiene búsqueda, alcance de página y regreso filtrado", async () => {
    const { render, screen: document } = await createPageDOM();
    await render(<EmptyDirectory page={14} query="Centro & Puerto" />);
    expect(document.textContent).toContain(
      "No hay más sub-comunidades para mostrar.",
    );
    expect(document.textContent).not.toContain(
      "Barrio no tiene sub-comunidades",
    );
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Página 14 · 0 sub-comunidades en esta página.",
    );
    expect(
      document.querySelector('input[name="q"]')?.getAttribute("value"),
    ).toBe("Centro & Puerto");
    const first = Array.from(
      document.querySelectorAll(
        'nav[aria-label="Paginación de sub-comunidades"] a',
      ),
    ).find((a) => a.textContent?.includes("Volver al principio"));
    expect(
      new URL(
        first!.getAttribute("href")!,
        "https://agorbis.test",
      ).searchParams.get("q"),
    ).toBe("Centro & Puerto");
    expect(
      new URL(
        first!.getAttribute("href")!,
        "https://agorbis.test",
      ).searchParams.has("pagina"),
    ).toBe(false);
  });
});

describe("el recuadro de visitante", () => {
  it("ofrece crear la cuenta y, al lado, el camino corto para quien ya la tiene", async () => {
    const { render, screen: document } = await createPageDOM();
    await render(<Visitor />);
    const links = Array.from(document.querySelectorAll("a"));
    const signup = links.find((a) => a.textContent?.trim() === "Crear cuenta");
    const signin = links.find((a) => a.textContent?.trim() === "Ingresá");
    expect(signup?.getAttribute("href")).toContain("/registro");
    expect(signin?.getAttribute("href")).toContain("/ingresar");
    expect(document.textContent).toContain("¿Ya tenés cuenta?");
    // Los dos vuelven a la comunidad después de entrar.
    expect(signin?.getAttribute("href")).toContain("barrio");
    expect(document.textContent).not.toContain("Invitar vecinos");
  });
});
