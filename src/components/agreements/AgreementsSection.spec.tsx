import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import {
  AgreementsSection,
  type AgreementListItem,
} from "./AgreementsSection";

const items: AgreementListItem[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    title: "Ruta costera compartida",
    status: "voting",
    closes_at: "2026-12-01T00:00:00Z",
    party_count: 2,
    adhered_count: 2,
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    title: "Feria regional de productores",
    status: "proposed",
    closes_at: null,
    party_count: 3,
    adhered_count: 1,
  },
];

const Fixture = component$<{
  items: AgreementListItem[];
  proposeHref: string | null;
  failed?: boolean;
}>(({ items, proposeHref, failed }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider url="https://agorbis.test/c/mar-del-plata/encuestas/">
      <AgreementsSection
        items={items}
        proposeHref={proposeHref}
        communityName="Mar del Plata"
        failed={failed}
      />
    </QwikRouterMockProvider>
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("AgreementsSection", () => {
  it("lista cada acuerdo con su estado en palabras y cuántas comunidades adhirieron", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture items={items} proposeHref="/c/mar-del-plata/acuerdos/nuevo" />,
    );
    const links = Array.from(screen.querySelectorAll("ul a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual([
      "/acuerdos/a0000000-0000-4000-8000-000000000001",
      "/acuerdos/a0000000-0000-4000-8000-000000000002",
    ]);
    expect(screen.textContent).toMatch(/En votación hasta el /);
    expect(screen.textContent).toContain("Propuesto, esperando adhesión");
    expect(screen.textContent).toContain("1 de 3 comunidades adhirieron");
    expect(
      screen.querySelector('a[href="/c/mar-del-plata/acuerdos/nuevo"]')
        ?.textContent,
    ).toContain("Proponer un acuerdo");
  });

  it("una residente sin acuerdos ve la invitación a proponer el primero", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture items={[]} proposeHref="/c/mar-del-plata/acuerdos/nuevo" />,
    );
    expect(screen.textContent).toContain("Todavía no hay acuerdos acá");
    expect(screen.textContent).toContain("Proponer un acuerdo");
  });

  it("sin acuerdos y sin permiso para proponer no dibuja nada", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture items={[]} proposeHref={null} />);
    expect(screen.querySelector("section")).toBeFalsy();
    expect(screen.textContent).not.toContain("Acuerdos");
  });

  it("una visitante ve la lista pero no el botón de proponer", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture items={items} proposeHref={null} />);
    expect(screen.querySelectorAll("ul a")).toHaveLength(2);
    expect(screen.textContent).not.toContain("Proponer un acuerdo");
  });

  it("si la base no respondió lo dice, también a una visitante, y no invita a proponer el primero", async () => {
    const { render, screen } = await createDOM();
    // El Alert de peligro mide su posición para traerse el foco; acá no hay
    // geometría, así que se le da una que lo deja "a la vista".
    const prototype = Object.getPrototypeOf(
      screen.ownerDocument.createElement("div"),
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
      await render(<Fixture items={[]} proposeHref={null} failed />);
      expect(screen.textContent).toContain(
        "No pudimos cargar los acuerdos de esta comunidad",
      );
      expect(screen.textContent).not.toContain("Todavía no hay acuerdos acá");
      expect(screen.textContent).not.toContain("Proponer un acuerdo");
    } finally {
      if (previousRect)
        Object.defineProperty(prototype, "getBoundingClientRect", previousRect);
      else delete prototype.getBoundingClientRect;
    }
  });
});
