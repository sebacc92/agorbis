import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementState } from "~/lib/agreements";
import { LocaleContext } from "~/lib/i18n";
import AgreementPage, { useAgreement } from "./index";

/**
 * D118: la página muestra lo que la base dijo y nada más. Los flags del
 * viewer vienen de `agreement_state`; acá se simulan para cada situación.
 */
const mdq = {
  community_id: "c-mdq",
  slug: "mar-del-plata",
  name: "Mar del Plata",
  emoji: "🌊",
  level: 4,
};
const tandil = {
  community_id: "c-tandil",
  slug: "tandil",
  name: "Tandil",
  emoji: "🪨",
  level: 4,
};
const noParty = { adhered_at: null, poll_id: null, outcome: null, participants: null } as const;

function state(partial: Partial<AgreementState> = {}): AgreementState {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    title: "Ruta costera compartida",
    body: "Las dos ciudades se comprometen a coordinar el mantenimiento de la ruta.",
    status_derived: "proposed",
    proposer_id: "u-sofia",
    proposer_community: {
      id: "c-mdq",
      slug: "mar-del-plata",
      name: "Mar del Plata",
      emoji: "🌊",
    },
    duration_days: 14,
    created_at: "2026-11-09T00:00:00Z",
    opened_at: null,
    closes_at: null,
    parties: [
      { ...mdq, ...noParty },
      { ...tandil, ...noParty },
    ],
    viewer: {
      party_community_id: null,
      can_adhere: false,
      can_withdraw: false,
      has_receipt: false,
      can_vote: false,
    },
    ...partial,
  };
}

const Fixture = component$<{
  state: AgreementState;
  options?: { id: string; label: string; sort_order: number }[];
  isAuthenticated?: boolean;
}>(({ state, options = [], isAuthenticated = true }) => {
  useContextProvider(LocaleContext, "es");
  return (
    <QwikRouterMockProvider
      url={`https://agorbis.test/acuerdos/${state.id}/`}
      params={{ id: state.id }}
      loaders={[
        { loader: useAgreement, data: { state, options, isAuthenticated } },
      ]}
    >
      <AgreementPage />
    </QwikRouterMockProvider>
  );
});

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Las acciones del acuerdo. El formulario de reporte (D120) es un <details>
 * propio y vive en toda ficha que no esté removida: no cuenta como acción.
 */
const buttons = (screen: Element) =>
  Array.from(screen.querySelectorAll("button"))
    .filter((b) => !b.closest("details"))
    .map((b) => b.textContent?.trim());

describe("visitante", () => {
  it("lee título, compromiso, comunidades y estado, sin ninguna acción", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture state={state()} isAuthenticated={false} />);
    expect(screen.querySelector("h1")?.textContent).toBe(
      "Ruta costera compartida",
    );
    expect(screen.textContent).toContain("Propuesto, esperando adhesión");
    expect(screen.textContent).toContain("Tandil");
    expect(screen.textContent).toContain("Esperando adhesión");
    expect(buttons(screen)).toEqual([]);
    const signup = screen.querySelector('a[href^="/registro"]');
    expect(signup?.textContent).toContain("Crear cuenta");
  });
});

describe("propuesta", () => {
  it("la proponente ve a quién le falta adherir y puede retirar", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        state={state({
          parties: [
            { ...mdq, ...noParty, adhered_at: "2026-11-09T01:00:00Z" },
            { ...tandil, ...noParty },
          ],
          viewer: {
            party_community_id: "c-mdq",
            can_adhere: false,
            can_withdraw: true,
            has_receipt: false,
            can_vote: false,
          },
        })}
      />,
    );
    expect(screen.textContent).toContain("Esperando que adhiera: Tandil");
    expect(buttons(screen)).toEqual(["Retirar la propuesta"]);
    expect(screen.textContent).toContain("Adhirió");
  });

  it("una residente de la otra comunidad puede adherir, y el texto no promete aprobar", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        state={state({
          viewer: {
            party_community_id: "c-tandil",
            can_adhere: true,
            can_withdraw: false,
            has_receipt: false,
            can_vote: false,
          },
        })}
      />,
    );
    expect(buttons(screen)).toEqual(["Adherir por Tandil"]);
    expect(screen.textContent).toContain("Adherir no aprueba nada");
    expect(screen.textContent).not.toContain("Aprobado");
  });

  it("quien no vive en ninguna comunidad nombrada lee y nada más", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture state={state()} />);
    expect(buttons(screen)).toEqual([]);
    expect(screen.textContent).toContain(
      "Tu comunidad no participa en este acuerdo",
    );
  });
});

describe("votación", () => {
  const voting = state({
    status_derived: "voting",
    opened_at: "2026-11-10T00:00:00Z",
    closes_at: "2026-11-24T00:00:00Z",
    parties: [
      {
        ...mdq,
        adhered_at: "2026-11-09T01:00:00Z",
        poll_id: "p-mdq",
        outcome: "pending",
        participants: null,
      },
      {
        ...tandil,
        adhered_at: "2026-11-10T00:00:00Z",
        poll_id: "p-tandil",
        outcome: "pending",
        participants: null,
      },
    ],
  });
  const options = [
    { id: "o-si", label: "Sí", sort_order: 0 },
    { id: "o-no", label: "No", sort_order: 1 },
  ];

  it("quien puede votar ve Sí y No para su comunidad, con la advertencia de secreto", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        state={{
          ...voting,
          viewer: {
            party_community_id: "c-mdq",
            can_adhere: false,
            can_withdraw: false,
            has_receipt: false,
            can_vote: true,
          },
        }}
        options={options}
      />,
    );
    expect(screen.textContent).toContain(
      "¿Aprobás este acuerdo por Mar del Plata?",
    );
    expect(buttons(screen)).toEqual(["Sí", "No"]);
    expect(screen.textContent).toContain("Tu voto es secreto");
    expect(
      screen.querySelector('input[name="poll_id"]')?.getAttribute("value"),
    ).toBe("p-mdq");
    expect(screen.textContent).toMatch(/En votación hasta el /);
    expect(screen.textContent).not.toMatch(/\d+ participantes/);
  });

  it("quien ya votó ve su constancia y ningún botón de voto", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        state={{
          ...voting,
          viewer: {
            party_community_id: "c-mdq",
            can_adhere: false,
            can_withdraw: false,
            has_receipt: true,
            can_vote: false,
          },
        }}
      />,
    );
    expect(screen.textContent).toContain("Ya votaste");
    expect(screen.textContent).toContain("no podemos mostrarla ni cambiarla");
    expect(buttons(screen)).toEqual([]);
  });
});

describe("resultado", () => {
  it("aprobado: resultado y participación por comunidad, sin total", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        state={state({
          status_derived: "approved",
          opened_at: "2026-10-01T00:00:00Z",
          closes_at: "2026-10-15T00:00:00Z",
          parties: [
            {
              ...mdq,
              adhered_at: "2026-09-30T00:00:00Z",
              poll_id: "p-mdq",
              outcome: "approved",
              participants: 6,
            },
            {
              ...tandil,
              adhered_at: "2026-10-01T00:00:00Z",
              poll_id: "p-tandil",
              outcome: "approved",
              participants: 7,
            },
          ],
        })}
        isAuthenticated={false}
      />,
    );
    expect(screen.textContent).toContain("Aprobado");
    expect(screen.textContent).toContain("Aprobó · 6 participantes");
    expect(screen.textContent).toContain("Aprobó · 7 participantes");
    expect(screen.textContent).not.toContain("13 participantes");
    expect(screen.textContent).toContain("no se suman");
  });

  it("sin quórum: la comunidad sin cinco participantes no muestra conteo", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Fixture
        state={state({
          status_derived: "no_quorum",
          opened_at: "2026-10-01T00:00:00Z",
          closes_at: "2026-10-15T00:00:00Z",
          parties: [
            {
              ...mdq,
              adhered_at: "2026-09-30T00:00:00Z",
              poll_id: "p-mdq",
              outcome: "approved",
              participants: 6,
            },
            {
              ...tandil,
              adhered_at: "2026-10-01T00:00:00Z",
              poll_id: "p-tandil",
              outcome: "no_quorum",
              participants: null,
            },
          ],
        })}
      />,
    );
    expect(screen.textContent).toContain(
      "Sin quórum: menos de cinco participantes",
    );
    expect(buttons(screen)).toEqual([]);
  });

  it("retirado tiene su palabra y ninguna acción ni aviso de no participar", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture state={state({ status_derived: "withdrawn" })} />);
    expect(screen.textContent).toContain("Retirado");
    expect(buttons(screen)).toEqual([]);
    expect(screen.textContent).not.toContain("Tu comunidad no participa");
  });
});
