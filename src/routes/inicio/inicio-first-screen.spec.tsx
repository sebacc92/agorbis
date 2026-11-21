import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { OwnMarks } from "~/lib/feed-marks";
import Inicio, { usePersonalizedFeed } from "./index";

/**
 * Mejora 7 de D112 (D117): la primera pantalla del inicio muestra
 * publicaciones, dice qué filtro está puesto y no le pide participar a quien
 * ya votó.
 */
const marDelPlata = {
  id: "mdq",
  slug: "mar-del-plata",
  name: "Mar del Plata",
  emoji: "🌊",
  level: 4,
  path: "earth.south-america.argentina.buenos-aires.mar-del-plata",
};
const argentina = {
  id: "ar",
  slug: "argentina",
  name: "Argentina",
  emoji: "🇦🇷",
  level: 2,
  path: "earth.south-america.argentina",
};

function item(
  id: string,
  kind: string,
  status: string,
  title: string,
  engagement = 0,
) {
  return {
    id,
    kind,
    community_id: "ar",
    community_slug: "argentina",
    community_name: "Argentina",
    community_emoji: "🇦🇷",
    title,
    summary: null,
    status,
    engagement,
    created_at: "2026-11-01T00:00:00Z",
  };
}

const ITEMS = [
  item("poll-votada", "poll", "active", "Encuesta votada"),
  item("poll-abierta", "poll", "active", "Encuesta sin votar"),
  item("poll-cerrada", "poll", "closed", "Encuesta cerrada", 12),
  item("reclamo-apoyado", "claim", "open", "Reclamo apoyado", 3),
  item("reclamo-ajeno", "claim", "open", "Reclamo ajeno", 1),
  // Acuerdos (D118): la base deriva el estado y entrega comunidades
  // adheridas, nunca votos.
  item("acuerdo-votando", "agreement", "voting", "Ruta costera compartida", 2),
  item("acuerdo-aprobado", "agreement", "approved", "Feria regional", 3),
  item("acuerdo-propuesto", "agreement", "proposed", "Acuerdo propuesto", 1),
];

const KNOWN: OwnMarks = {
  votedPollIds: ["poll-votada"],
  supportedClaimIds: ["reclamo-apoyado"],
};
const UNKNOWN: OwnMarks = { votedPollIds: null, supportedClaimIds: null };

const Fixture = component$<{
  marks?: OwnMarks;
  communityFilter?: string | null;
  kindFilter?: "poll" | "claim" | "agreement" | null;
  empty?: boolean;
}>(
  ({
    marks = KNOWN,
    communityFilter = null,
    kindFilter = null,
    empty = false,
  }) => {
    useContextProvider(LocaleContext, "es");
    const params = new URLSearchParams();
    if (communityFilter) params.set("comunidad", communityFilter);
    if (kindFilter) params.set("tipo", kindFilter);
    const query = params.toString();
    return (
      <QwikRouterMockProvider
        url={`https://agorbis.test/inicio/${query ? `?${query}` : ""}`}
        loaders={[
          {
            loader: usePersonalizedFeed,
            data: {
              items: empty ? [] : ITEMS,
              chain: [argentina, marDelPlata],
              localCommunity: marDelPlata,
              communityFilter,
              kindFilter,
              hasFilters: !!communityFilter || !!kindFilter,
              latestHref: "/inicio",
              nextHref: "/inicio",
              since: null,
              nextCursor: null,
              marks,
            },
          },
        ]}
      >
        <Inicio />
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

function cardOf(screen: Element, id: string) {
  return screen.querySelector(`ol li a[href$="/${id}"]`)?.closest("li");
}

describe("marcas propias en las tarjetas", () => {
  it("una encuesta abierta ya votada dice que se votó y ofrece verla, no participar", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const card = cardOf(screen, "poll-votada");
    expect(card?.textContent).toContain("Ya votaste");
    expect(card?.textContent).toContain("Ver encuesta");
    expect(card?.textContent).not.toContain("Participar del voto");
  });

  it("una encuesta abierta sin recibo sigue invitando a participar", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const card = cardOf(screen, "poll-abierta");
    expect(card?.textContent).toContain("Participar del voto");
    expect(card?.textContent).not.toContain("Ya votaste");
  });

  it("sin lectura de recibos no afirma nada: todas las abiertas ofrecen verla", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture marks={UNKNOWN} />);
    for (const id of ["poll-votada", "poll-abierta"]) {
      const card = cardOf(screen, id);
      expect(card?.textContent).toContain("Ver encuesta");
      expect(card?.textContent).not.toContain("Ya votaste");
      expect(card?.textContent).not.toContain("Participar del voto");
    }
    expect(screen.textContent).not.toContain("Apoyaste");
  });

  it("una encuesta cerrada sólo se ve, aunque haya recibo", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        marks={{ votedPollIds: ["poll-cerrada"], supportedClaimIds: [] }}
      />,
    );
    const card = cardOf(screen, "poll-cerrada");
    expect(card?.textContent).toContain("Cerrada");
    expect(card?.textContent).toContain("Ver encuesta");
    expect(card?.textContent).not.toContain("Ya votaste");
    expect(card?.textContent).not.toContain("Participar del voto");
  });

  it("un reclamo con apoyo propio dice Apoyaste; el ajeno, no", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    expect(cardOf(screen, "reclamo-apoyado")?.textContent).toContain(
      "Apoyaste",
    );
    expect(cardOf(screen, "reclamo-ajeno")?.textContent).not.toContain(
      "Apoyaste",
    );
  });
});

describe("acuerdos en el inicio (D118)", () => {
  it("la tarjeta lleva a /acuerdos/[id] y dice el estado que la base derivó", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const voting = cardOf(screen, "acuerdo-votando");
    expect(voting?.querySelector("a")?.getAttribute("href")).toBe(
      "/acuerdos/acuerdo-votando",
    );
    expect(voting?.textContent).toContain("Acuerdo");
    expect(voting?.textContent).toContain("En votación");
    expect(voting?.textContent).toContain("2 comunidades adhirieron");
    expect(cardOf(screen, "acuerdo-aprobado")?.textContent).toContain(
      "Aprobado",
    );
    expect(cardOf(screen, "acuerdo-propuesto")?.textContent).toContain(
      "Propuesto, esperando adhesión",
    );
  });

  it("una ronda en votación no se presenta como encuesta ni muestra votos", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const card = cardOf(screen, "acuerdo-votando");
    expect(card?.textContent).not.toContain("Participar del voto");
    expect(card?.textContent).not.toContain("Encuesta");
    expect(card?.textContent).not.toMatch(/votantes?/);
    expect(card?.textContent).not.toContain("Resultados al cierre");
  });

  it("la pestaña Acuerdos filtra por tipo y la línea de estado lo nombra", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture kindFilter="agreement" />);
    const tab = Array.from(screen.querySelectorAll("nav a")).find(
      (a) => a.getAttribute("href") === "/inicio?tipo=agreement",
    );
    expect(tab?.getAttribute("aria-current")).toBe("page");
    expect(screen.querySelector('[role="status"]')?.textContent).toContain(
      "acuerdos",
    );
  });
});

describe("filtros con resultado visible", () => {
  it("con comunidad y tipo, una línea de estado dice qué se muestra y cómo quitarlo", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture communityFilter="argentina" kindFilter="poll" />);
    const status = screen.querySelector('[role="status"]');
    expect(status?.textContent).toContain("encuestas");
    expect(status?.textContent).toContain("Argentina");
    // El enlace va al lado de la región viva, no adentro: así el lector no
    // lo anuncia como parte del mensaje.
    expect(status?.querySelector("a")).toBeFalsy();
    const clear = status?.parentElement?.querySelector("a");
    expect(clear?.getAttribute("href")).toBe("/inicio");
    expect(clear?.textContent).toContain("Quitar filtros");
  });

  it("sólo con tipo, la línea nombra el tipo y todas las comunidades", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture kindFilter="claim" />);
    const status = screen.querySelector('[role="status"]');
    expect(status?.textContent).toContain("reclamos");
    expect(status?.textContent).toContain("todas tus comunidades");
  });

  it("sólo con comunidad, la línea nombra la comunidad y todas las publicaciones", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture communityFilter="argentina" />);
    const status = screen.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Argentina");
    expect(status?.textContent).toContain("todas las publicaciones");
  });

  it("sin filtros la región viva existe pero está vacía y oculta", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const status = screen.querySelector('[role="status"]');
    expect(status?.textContent?.trim()).toBe("");
    expect(status?.parentElement?.getAttribute("class")).toContain("hidden");
    expect(screen.textContent).not.toContain("Quitar filtros");
  });
});

describe("cabecera compacta", () => {
  it("la comunidad principal ofrece las cuatro acciones y el panel sin párrafos largos", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    expect(screen.textContent).not.toContain("Filtrar:");
    expect(screen.textContent).not.toContain("Tu voz tiene peso directo");
    const section = screen.querySelector(
      'section[aria-labelledby="comunidad-principal-titulo"]',
    );
    expect(section?.querySelector("h2")?.textContent).toBe("Mar del Plata");
    // El nombre accesible dice que se crea algo; "Reclamo" solo no alcanza.
    expect(
      Array.from(section?.querySelectorAll("ul a") ?? []).map((a) =>
        a.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Nuevo reclamo",
      "Nueva encuesta",
      "Nuevo debate",
      "Nuevo proyecto",
    ]);
    expect(
      Array.from(section?.querySelectorAll("a") ?? []).map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([
      "/c/mar-del-plata",
      "/c/mar-del-plata/reclamos/nuevo",
      "/c/mar-del-plata/encuestas/nueva",
      "/c/mar-del-plata/debates/nuevo",
      "/c/mar-del-plata/proyectos/nuevo",
    ]);
  });

  it("la invitación por WhatsApp sigue existiendo, una vez, fuera del bloque principal", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture />);
    const buttons = Array.from(screen.querySelectorAll("button")).filter(
      (button) => button.textContent?.includes("Invitar vecinos por WhatsApp"),
    );
    expect(buttons).toHaveLength(1);
    expect(
      buttons[0]?.closest(
        'section[aria-labelledby="comunidad-principal-titulo"]',
      ),
    ).toBeNull();
  });

  it("con el inicio vacío la invitación también está", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture empty />);
    expect(screen.textContent).toContain(
      "Todavía no hay publicaciones en tus comunidades",
    );
    expect(screen.textContent).toContain("Invitar vecinos por WhatsApp");
  });
});
