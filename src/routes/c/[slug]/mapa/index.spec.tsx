import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { useCommunity } from "../layout";
import MapPage, { useMapClaims, type MapClaim } from "./index";

interface ExampleProps {
  failed: boolean;
  /** Lo que devuelve el loader; sin pasarlo, ningún reclamo. */
  claims?: MapClaim[];
  /** Las coordenadas de la comunidad; sin pasarlas, no tiene. */
  coords?: { lat: number; lng: number };
}

/**
 * Un reclamo que coincide con los filtros de la URL. Como la comunidad no
 * tiene coordenadas, el esquema se centra en él y queda adentro del radio.
 */
const LOCATED_CLAIM: MapClaim = {
  id: "c1",
  title: "Bache",
  description: "",
  category: "otro",
  status: "open",
  lat: -38,
  lng: -57.5,
  location_text: "Esquina",
  image_url: null,
  support_count: 1,
  created_at: "2026-11-01T12:00:00Z",
};

const Example = component$<ExampleProps>(({ failed, claims, coords }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url="https://agorbis.test/c/barrio/mapa/?q=Esquina&categoria=otro&estado=abiertos"
      loaders={[
        {
          loader: useCommunity,
          data: {
            community: {
              id: "community",
              name: "Barrio",
              slug: "barrio",
              emoji: "🏡",
              path: "earth.barrio",
              level: 4,
              lat: coords?.lat ?? null,
              lng: coords?.lng ?? null,
            },
            isMember: false,
            isAuthenticated: false,
          },
        },
        {
          loader: useMapClaims,
          data: {
            claims: claims ?? [],
            filters: { query: "Esquina", category: "otro", status: "abiertos" },
            failed,
          },
        },
      ]}
    >
      <MapPage />
    </QwikRouterMockProvider>
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("mapa con filtros y errores recuperables", () => {
  it("un fallo conserva filtros y reintento, sin presentar ceros como datos ni un vacío real", async () => {
    const { render, screen: document } = await createDOM();
    // D126: el fallo es un Alert de peligro, que mide su posición para
    // traerse el foco. Acá no hay geometría ni `window`: se le da una que lo
    // deja "a la vista", como en AgreementsSection.spec.
    const prototype = Object.getPrototypeOf(
      document.ownerDocument.createElement("div"),
    );
    const previousRect = Object.getOwnPropertyDescriptor(
      prototype,
      "getBoundingClientRect",
    );
    Object.defineProperty(prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, bottom: 1 }),
    });
    vi.stubGlobal("window", { innerHeight: 900 });
    try {
      await render(<Example failed />);
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "No pudimos cargar los reclamos del mapa",
      );
      const retry = Array.from(document.querySelectorAll("a")).find(
        (link) => link.textContent?.trim() === "Reintentar",
      );
      expect(retry?.getAttribute("href")).toBe(
        "?q=Esquina&categoria=otro&estado=abiertos",
      );
      expect(
        document.querySelector('input[name="q"]')?.getAttribute("value"),
      ).toBe("Esquina");
      expect(document.querySelector("#map-claims")).toBeFalsy();
      expect(
        document.querySelector('section[aria-label="Estado de los reclamos"]'),
      ).toBeFalsy();
    } finally {
      if (previousRect)
        Object.defineProperty(prototype, "getBoundingClientRect", previousRect);
      else delete prototype.getBoundingClientRect;
    }
  });

  it("el vacío real informa el alcance y los controles anuncian su selección", async () => {
    const { render, screen: document } = await createDOM();
    await render(<Example failed={false} />);
    expect(document.querySelector('[role="alert"]')).toBeFalsy();
    expect(
      Array.from(document.querySelectorAll('[role="status"]')).find((item) =>
        item.textContent?.includes("Mostrando"),
      )?.textContent,
    ).toContain("Mostrando 0 reclamos");
    expect(
      Array.from(document.querySelectorAll('[role="status"]')).find((item) =>
        item.textContent?.includes("Mostrando"),
      )?.textContent,
    ).toContain("hasta 100");
    // D126: estado y categoría usan el Chip, que marca aria-current="page".
    const current = Array.from(
      document.querySelectorAll('a[aria-current="page"]'),
    );
    expect(current.map((link) => link.textContent?.trim())).toContain(
      "Abiertos / En demanda",
    );
    expect(current.some((link) => link.textContent?.includes("Otro"))).toBe(
      true,
    );
    const radii = Array.from(document.querySelectorAll("button"));
    const active = radii.find(
      (button) => button.textContent?.trim() === "1 km",
    );
    const inactive = radii.find(
      (button) => button.textContent?.trim() === "500 m",
    );
    expect(active?.getAttribute("aria-pressed")).toBe("true");
    expect(inactive?.getAttribute("aria-pressed")).toBe("false");
    expect(document.textContent).toContain("Distancia aproximada:");
    expect(document.textContent).toContain("no indica recorridos");
    expect(document.textContent).not.toContain("min 🚶");
  });

  /**
   * D126: un div, un h3 o un p dentro de cada fila cortaban el servidor de
   * desarrollo (Q12). Los E2E corren sobre el build de producción, que no hace
   * ese control, así que esta prueba es la que lo nota si vuelve.
   */
  it("con un reclamo ubicado, las filas y el detalle no meten bloques dentro de un botón", async () => {
    const { render, screen: document } = await createDOM();
    await render(<Example failed={false} claims={[LOCATED_CLAIM]} />);
    const rows = document.querySelectorAll("#map-claims > button");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Bache");
    const blocks = ["div", "p", "ul", "li", "h2", "h3", "h4"].flatMap((tag) =>
      Array.from(document.querySelectorAll(`button ${tag}`)),
    );
    expect(blocks).toHaveLength(0);
    const title = document.querySelector("#map-selected-claim-title");
    expect(title?.tagName).toBe("H3");
    expect(title?.textContent).toBe("Bache");
    expect(title?.closest("button")).toBeNull();
    // Con el único reclamo adentro del radio no hay línea de los de afuera.
    expect(document.textContent).not.toContain("fuera de este radio");
  });

  it("con filtros y sin reclamos ubicados, el vacío del esquema no habla de toda la comunidad", async () => {
    const { render, screen: document } = await createDOM();
    await render(<Example failed={false} coords={{ lat: -38, lng: -57.5 }} />);
    expect(document.textContent).toContain(
      "Ningún reclamo con estos filtros tiene ubicación marcada.",
    );
    expect(document.textContent).not.toContain(
      "Ningún reclamo tiene ubicación marcada todavía.",
    );
  });
});
