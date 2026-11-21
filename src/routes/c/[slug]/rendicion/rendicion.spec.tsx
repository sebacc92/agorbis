import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it } from "vitest";
import { makeTally, type CategoryClaimTally } from "~/lib/claim-stats";
import { CLAIM_CATEGORIES } from "~/lib/constants";
import type { ClaimCategory } from "~/lib/database.types.helpers";
import { LocaleContext } from "~/lib/i18n";
import AccountabilityPage, { useCommunityAccountability } from "./index";

/* Rendición dentro de la comunidad (D126). La página dibujaba las ocho
   categorías aunque no tuvieran reclamos, con "0% resuelto" en cada una,
   pegaba el número a una palabra fija ("1 resueltos", "1 pendientes") y sin
   reclamos mostraba cuatro ceros y un proyector de ceros. Estas pruebas fijan
   el corte por categoría, el plural y el estado vacío. */

const community = {
  id: "community",
  slug: "barrio",
  name: "Barrio",
  emoji: "🏡",
  level: 4,
  member_count: 0,
};

const ambiente = CLAIM_CATEGORIES.find((cat) => cat.key === "ambiente")!;

type Counts = { total: number; resolved: number; open: number };
const NONE: Counts = { total: 0, resolved: 0, open: 0 };

/**
 * Lo que devuelve el loader: las ocho categorías en cero salvo las que pide
 * el caso, y los totales sumados como en `categoryClaimTallies`.
 */
function accountability(filled: Partial<Record<ClaimCategory, Counts>> = {}) {
  const categoryStats: CategoryClaimTally[] = CLAIM_CATEGORIES.map((cat) => {
    const { total, resolved, open } = filled[cat.key] ?? NONE;
    return {
      key: cat.key,
      label: cat.label,
      emoji: cat.emoji,
      ...makeTally(total, resolved, open),
    };
  });
  const sum = (pick: (cat: CategoryClaimTally) => number) =>
    categoryStats.reduce((acc, cat) => acc + pick(cat), 0);
  const overall = makeTally(
    sum((cat) => cat.total),
    sum((cat) => cat.resolved),
    sum((cat) => cat.open),
  );
  return {
    community,
    totalClaims: overall.total,
    resolvedClaims: overall.resolved,
    openClaims: overall.open,
    closedUnresolved: overall.total - overall.resolved - overall.open,
    globalRate: overall.rate,
    categoryStats,
  };
}

const Example = component$<{ withClaims: boolean }>(({ withClaims }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url="http://localhost/c/barrio/rendicion/"
      loaders={[
        {
          loader: useCommunityAccountability,
          // Un solo reclamo, resuelto, en Ambiente: antes salían "1
          // resueltos" y otras siete tarjetas con "0% resuelto".
          data: withClaims
            ? accountability({ ambiente: { total: 1, resolved: 1, open: 0 } })
            : accountability(),
        },
      ]}
    >
      <AccountabilityPage />
    </QwikRouterMockProvider>
  );
});

async function renderPage(withClaims: boolean) {
  const dom = await createDOM();
  await dom.render(<Example withClaims={withClaims} />);
  return dom.screen;
}

const projectorButton = (screen: Element) =>
  Array.from(screen.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Modo Asamblea / Proyector"),
  );

describe("rendición dentro de la comunidad", () => {
  it("sin reclamos es un estado vacío: sin cifras en cero, sin tarjetas y sin proyector", async () => {
    const screen = await renderPage(false);
    expect(screen.textContent).toContain("Todavía no hay reclamos en Barrio");
    expect(projectorButton(screen)).toBeUndefined();
    expect(screen.querySelector('a[href^="/c/barrio/reclamos"]')).toBeFalsy();
    expect(screen.querySelector('[role="progressbar"]')).toBeFalsy();
    expect(screen.textContent).not.toContain("% resuelto");
  });

  it("la cabecera es la de un listado de la comunidad, sin otro h1 ni un «Volver a»", async () => {
    const screen = await renderPage(true);
    const section = screen.querySelector(
      'section[aria-labelledby="rendicion-titulo"]',
    );
    expect(section?.querySelector("h2#rendicion-titulo")?.textContent).toBe(
      "Reclamos por categoría y estado",
    );
    // El layout ya pone el contenedor y el h1 con el nombre de la comunidad.
    expect(screen.querySelector("h1")).toBeFalsy();
    expect(screen.querySelector(".container-content")).toBeFalsy();
    expect(screen.textContent).not.toContain("Volver a");
    expect(projectorButton(screen)).toBeTruthy();
  });

  it("sólo las categorías con reclamos llevan tarjeta, con plural correcto y enlace al listado filtrado", async () => {
    const screen = await renderPage(true);
    const links = screen.querySelectorAll("h3 a");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(
      "/c/barrio/reclamos?categoria=ambiente",
    );
    expect(links[0]?.textContent).toBe(ambiente.label);
    expect(screen.querySelectorAll('[role="progressbar"]')).toHaveLength(1);

    const card = links[0]?.closest("li");
    expect(card?.textContent).toContain("1 resuelto");
    expect(card?.textContent).not.toContain("1 resueltos");
    expect(card?.textContent).toContain("0 en curso");
    expect(screen.textContent).not.toContain("pendientes");
    // El ícono propio de la categoría reemplaza al emoji.
    expect(card?.textContent).not.toContain(ambiente.emoji);

    // Las vacías quedan en una fila de chips atenuados, sin enlace.
    const emptyHeading = Array.from(screen.querySelectorAll("h3")).find(
      (heading) => heading.textContent === "Categorías sin reclamos",
    );
    const emptyList = emptyHeading?.parentElement;
    expect(
      Array.from(emptyList?.querySelectorAll("li") ?? []).map(
        (item) => item.textContent,
      ),
    ).toEqual(
      CLAIM_CATEGORIES.filter((cat) => cat.key !== ambiente.key).map(
        (cat) => cat.label,
      ),
    );
    expect(emptyList?.querySelector("a")).toBeFalsy();
  });

  it("una cifra en cero se dice en palabras y las que filtran llevan al listado", async () => {
    const screen = await renderPage(true);
    const open = screen.querySelector(
      'a[href="/c/barrio/reclamos?estado=abiertos"]',
    );
    expect(open?.textContent).toContain("Todavía ninguno");
    expect(open?.textContent).not.toMatch(/\b0\b/);
    const resolved = screen.querySelector(
      'a[href="/c/barrio/reclamos?estado=resueltos"]',
    );
    expect(resolved?.textContent).toContain("1");
    expect(resolved?.textContent).not.toContain("Todavía ninguno");
  });
});
