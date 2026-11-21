import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import CommunityLayout, { useCommunity } from "./layout";
import InfoPage, { useActivePoll, useChainPolls, useInfo } from "./index";
import VictoriesPage, { useCommunityVictories } from "./victorias/index";

const community = {
  id: "community",
  name: "Barrio",
  slug: "barrio",
  emoji: "🏡",
  path: "earth.barrio",
  level: 4,
  member_count: 0,
  created_at: "2026-01-01",
};
const Fixture = component$<{
  unknown?: boolean;
  page?: "navigation" | "info" | "victories";
  /** Sin sesión: los llamados a publicar apuntan a ingresar (D115). */
  visitor?: boolean;
  /** Con sesión pero sin residencia elegida: nada de "residencia declarada" (D116). */
  noResidence?: boolean;
  /** Encuestas abiertas de la cadena que el estado vacío ofrece (D116). */
  chainPolls?: boolean;
  /** Con sesión pero el perfil no se pudo leer (D116). */
  residenceUnknown?: boolean;
  /** Con publicaciones pero sin reclamos resueltos ni abiertos (décima ronda). */
  withContent?: boolean;
}>(
  ({
    unknown = false,
    page = "navigation",
    visitor = false,
    noResidence = false,
    chainPolls = false,
    residenceUnknown = false,
    withContent = false,
  }) => {
  useContextProvider(LocaleContext, "es");
  const count = unknown ? null : 0;
  const content = (value: number) => (withContent ? value : count);
  const argentina = {
    id: "argentina",
    name: "Argentina",
    slug: "argentina",
    emoji: "🇦🇷",
    path: "earth",
    level: 2,
  };
  return (
    <QwikRouterMockProvider
      url="https://agorbis.test/c/barrio/?categoria=otro"
      loaders={[
        {
          loader: useCommunity,
          data: {
            community,
            chain: [argentina, community],
            isMember: !visitor && !noResidence && !residenceUnknown,
            isAuthenticated: !visitor,
            hasResidence: !visitor && !noResidence && !residenceUnknown,
            residenceUnknown,
            isFollowing: false,
            childCount: count,
            hasBudget: unknown ? null : false,
            counts: {
              polls: content(6),
              debates: content(1),
              claims: count,
              resolvedClaims: count,
              projects: content(1),
              info: count,
            },
          },
        },
        { loader: useInfo, data: { entries: [], openClaims: count } },
        { loader: useActivePoll, data: null },
        {
          loader: useChainPolls,
          data: chainPolls
            ? [
                {
                  id: "poll-argentina",
                  question: "¿Cuál debería ser la prioridad?",
                  closes_at: "2026-12-01T00:00:00Z",
                  community_id: "argentina",
                  communityName: "Argentina",
                  communityEmoji: "🇦🇷",
                },
              ]
            : [],
        },
        {
          loader: useCommunityVictories,
          data: {
            community,
            resolvedClaims: [
              {
                id: "claim",
                title: "Una victoria",
                category: "otro",
                description: "Problema resuelto.",
                status: "resolved",
                image_url: null,
                image_urls: [],
                support_count: 1,
                created_at: "2026-01-01",
              },
            ],
            completedProjects: [],
            resolvedTotal: 1,
            completedTotal: 0,
            totalVictories: 1,
            totalMobilized: 1,
            claimsTruncated: false,
            projectsTruncated: false,
          },
        },
      ]}
    >
      {page === "navigation" ? (
        <CommunityLayout>
          <span />
        </CommunityLayout>
      ) : page === "info" ? (
        <InfoPage />
      ) : (
        <VictoriesPage />
      )}
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

describe("orientación cuando falta un conteo o una coincidencia", () => {
  it("un conteo desconocido conserva presupuesto, contraste y reintento nativo", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture unknown />);
    const nav = screen.querySelector(
      'nav[aria-label="Secciones de la comunidad"]',
    );
    expect(nav?.querySelector('a[href="/c/barrio/presupuesto"]')).toBeTruthy();
    expect(nav?.querySelector('a[href="/c/barrio/contraste"]')).toBeTruthy();
    const status = screen.querySelector('[role="status"]');
    expect(status?.textContent).toContain(
      "Algunas cantidades no están disponibles",
    );
    expect(status?.querySelector("a")?.getAttribute("href")).toBe(
      "/c/barrio/?categoria=otro",
    );
  });
  it("un cero confirmado mantiene ocultas las herramientas que necesitan datos", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    expect(screen.querySelector('a[href="/c/barrio/presupuesto"]')).toBeFalsy();
    expect(screen.querySelector('a[href="/c/barrio/contraste"]')).toBeFalsy();
    expect(screen.textContent).not.toContain(
      "Algunas cantidades no están disponibles",
    );
  });
  it("Info presenta cantidades desconocidas y no ofrece resúmenes con ceros inventados", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" unknown />);
    expect(screen.textContent).toContain("No disponible");
    const tools = screen.querySelector("[data-community-tools]");
    expect(tools?.textContent).not.toContain("Resumen Barrial para WhatsApp");
    expect(tools?.textContent).not.toContain(
      "Generar tarjeta cívica para redes",
    );
    // El pie que enlazaba Sub-comunidades se quitó (décima ronda, mejora 3):
    // esa entrada vive en la pestaña "Más". Sin pie, no hay "0 divisiones".
    expect(screen.textContent).not.toContain("Explorá sus 0 divisiones");
  });
  it("una comunidad sin publicaciones confirmadas invita a abrir la primera en vez de mostrar ceros", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" />);
    expect(screen.querySelector("#empezar-titulo")?.textContent).toBe(
      "Barrio todavía no tiene publicaciones",
    );
    const actions = screen.querySelector(
      'nav[aria-label="Acciones principales de la comunidad"]',
    );
    expect(
      Array.from(actions?.querySelectorAll("a") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual([
      "/c/barrio/encuestas/nueva",
      "/c/barrio/debates/nuevo",
      "/c/barrio/reclamos/nuevo",
      "/c/barrio/proyectos/nuevo",
    ]);
    expect(screen.textContent).not.toContain("Lo que pasa en");
    expect(screen.textContent).not.toContain("en redacción");
    expect(screen.querySelector("#explorar-mas")).toBeFalsy();
  });
  it("la comunidad vacía ofrece las encuestas abiertas de su cadena, enlazadas y sin conteos (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" chainPolls />);
    const section = screen.querySelector('[aria-labelledby="empezar-titulo"]');
    const link = section?.querySelector('a[href="/encuestas/poll-argentina"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("¿Cuál debería ser la prioridad?");
    expect(section?.textContent).toContain("Argentina");
    expect(section?.textContent).toContain(
      "Encuestas abiertas en las comunidades que la contienen",
    );
    expect(section?.textContent).not.toMatch(/\d+ votos?/);
  });
  it("a quien no es miembro no se le promete el voto en las encuestas de la cadena (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" chainPolls visitor />);
    expect(screen.textContent).toContain(
      "Encuestas abiertas en las comunidades que la contienen",
    );
    expect(screen.textContent).not.toContain("ya podés votar");
    expect(
      screen.querySelector('a[href="/encuestas/poll-argentina"]'),
    ).toBeTruthy();
  });
  it("con el perfil ilegible no se afirma residencia ni se manda a elegirla (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture residenceUnknown />);
    expect(screen.textContent).toContain("No pudimos leer tu residencia");
    expect(screen.textContent).not.toContain("residencia declarada");
    expect(screen.textContent).not.toContain("Todavía no elegiste");
    expect(screen.textContent).not.toContain("Elegir mi residencia");
    expect(screen.textContent).not.toContain("Revisar mi residencia");
    const { render: render2, screen: screen2 } = await createDOM();
    await render2(<Fixture page="info" residenceUnknown />);
    expect(screen2.textContent).toContain("recargá la página");
    expect(screen2.textContent).not.toContain("elegí tu residencia");
  });
  it("sin encuestas abiertas en la cadena el estado vacío no promete ninguna (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" />);
    expect(screen.textContent).not.toContain("Encuestas abiertas");
    expect(screen.querySelector('a[href^="/encuestas/"]')).toBeFalsy();
  });
  it("Más herramientas enlaza qué hacer sin casillas que marcar ni felicitaciones (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" />);
    const tools = screen.querySelector("[data-community-tools]");
    expect(tools?.textContent).not.toContain("Felicitaciones");
    expect(tools?.textContent).not.toContain("camino cívico");
    expect(tools?.querySelector('button[aria-label^="Marcar como"]')).toBeFalsy();
    expect(tools?.textContent).toContain("Qué podés hacer acá");
    expect(tools?.querySelector('a[href="/c/barrio/encuestas"]')).toBeTruthy();
    expect(tools?.querySelector('a[href="/c/barrio/reclamos/nuevo"]')).toBeTruthy();
  });
  it("a quien tiene sesión sin residencia no se le afirma una residencia declarada (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture noResidence />);
    expect(screen.textContent).not.toContain("residencia declarada");
    expect(screen.textContent).toContain("Todavía no elegiste dónde vivís");
    const choose = Array.from(screen.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Elegir mi residencia"),
    );
    expect(choose?.getAttribute("href")?.startsWith("/onboarding?next=")).toBe(true);
    expect(screen.textContent).not.toContain("Revisar mi residencia");
  });
  it("el estado vacío pide elegir residencia a quien no la tiene y revisarla a quien vive en otro lado (D116)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" noResidence />);
    expect(screen.textContent).toContain("elegí tu residencia para publicar");
    expect(screen.textContent).not.toContain("revisá tu residencia");
    const { render: render2, screen: screen2 } = await createDOM();
    await render2(<Fixture page="info" visitor />);
    expect(screen2.textContent).toContain("ingresá para publicar");
    expect(screen2.textContent).not.toContain("revisá tu residencia");
  });
  it("a una visitante los llamados la llevan a ingresar con el formulario como destino (D115)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" visitor />);
    const actions = screen.querySelector(
      'nav[aria-label="Acciones principales de la comunidad"]',
    );
    expect(
      Array.from(actions?.querySelectorAll("a") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual([
      "/ingresar?next=%2Fc%2Fbarrio%2Fencuestas%2Fnueva",
      "/ingresar?next=%2Fc%2Fbarrio%2Fdebates%2Fnuevo",
      "/ingresar?next=%2Fc%2Fbarrio%2Freclamos%2Fnuevo",
      "/ingresar?next=%2Fc%2Fbarrio%2Fproyectos%2Fnuevo",
    ]);
  });
  it("con publicaciones y cero victorias, el balance lo dice en palabras y sin folleto (décima ronda, mejora 2)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" withContent />);
    expect(screen.textContent).toContain("Lo que pasa en Barrio");
    expect(screen.textContent).not.toContain("Poder ciudadano");
    expect(screen.textContent).not.toContain("Impacto Comunitario");
    const victories = screen.querySelector(
      'a[href="/c/barrio/reclamos?estado=resueltos"]',
    );
    expect(victories?.textContent).toContain("Todavía ninguno");
    expect(victories?.textContent).not.toMatch(/\b0\b/);
    expect(victories?.textContent).not.toContain("→");
  });
  it("con publicaciones, el pie que repetía las pestañas deja lugar a las encuestas de la cadena (décima ronda, mejora 3)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" withContent chainPolls />);
    expect(screen.querySelector("#explorar-mas")).toBeFalsy();
    expect(screen.textContent).not.toContain("Continuá explorando");
    expect(screen.textContent).not.toContain("Encuestas ciudadanas");
    const section = screen.querySelector(
      '[aria-labelledby="encuestas-cadena-titulo"]',
    );
    expect(section?.textContent).toContain(
      "Encuestas abiertas en las comunidades que la contienen",
    );
    expect(
      section?.querySelector('a[href="/encuestas/poll-argentina"]'),
    ).toBeTruthy();
  });
  it("con publicaciones y sin encuestas en la cadena no se promete ninguna", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture page="info" withContent />);
    expect(
      screen.querySelector('[aria-labelledby="encuestas-cadena-titulo"]'),
    ).toBeFalsy();
  });
  it("a una visitante la cabecera le hace un solo llamado: crear la cuenta (décima ronda, mejora 1)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture visitor />);
    const header = screen.querySelector("[data-community-page] > header");
    expect(header?.textContent).not.toContain("Invitar vecinos");
    expect(header?.textContent).not.toContain("Ingresá para seguir");
    const calls = Array.from(header?.querySelectorAll("a") ?? []).filter(
      (link) => link.textContent?.includes("Crear cuenta"),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.getAttribute("href")).toContain("/registro");
  });
  it("las pestañas no se parten y el carril avisa que sigue (décima ronda, mejora 5)", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const nav = screen.querySelector('nav[aria-label="Secciones de la comunidad"]');
    const rail = nav?.querySelector("[data-tabs-fade]");
    expect(rail?.getAttribute("class")).toContain("after:bg-gradient-to-l");
    expect(rail?.querySelector("ul")?.getAttribute("class")).toContain("pr-10");
    for (const link of Array.from(rail?.querySelectorAll("ul a") ?? [])) {
      expect(link.getAttribute("class")).toContain("whitespace-nowrap");
    }
  });
  it("a quien vive acá la cabecera sí le ofrece invitar vecinos", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const header = screen.querySelector("[data-community-page] > header");
    expect(header?.textContent).toContain("Invitar vecinos");
    expect(header?.textContent).not.toContain("Crear cuenta");
  });
  it("el vacío filtrado ofrece restablecer tipo y categoría sin afirmar que no hay victorias", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Fixture page="victories" />);
    const projects = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Proyectos completados"),
    );
    expect(projects).toBeTruthy();
    await userEvent(projects!, "click");
    expect(screen.textContent).toContain("No hay victorias con estos filtros");
    expect(screen.textContent).not.toContain(
      "Todavía no hay victorias registradas",
    );
    const clear = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent === "Limpiar filtros",
    );
    expect(clear).toBeTruthy();
    await userEvent(clear!, "click");
    expect(screen.textContent).not.toContain(
      "No hay victorias con estos filtros",
    );
    const all = Array.from(screen.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Todas las victorias"),
    );
    expect(all?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.textContent).toContain("Una victoria");
  });
});
