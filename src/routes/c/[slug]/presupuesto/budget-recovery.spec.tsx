import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it, vi } from "vitest";
import type { BudgetPageData } from "~/lib/budget-page";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import { useCommunity } from "../layout";
import BudgetPage, { useBudget } from "./index";

vi.mock("~/lib/budget-actions", () => {
  const action = () => ({
    actionPath: "?qaction=budget-fixture",
    isRunning: false,
    value: undefined,
    formData: undefined,
  });
  return {
    useCastBudgetVote: action,
    useProposeProject: action,
    useSubmitBudgetReport: action,
    reviewBudgetProposal: async () => ({ reviewed: true }),
    reviewBudgetProposalSchema: {},
  };
});

const budgetId = "a0000000-0000-4000-8000-000000000001";
const projectId = "a0000000-0000-4000-8000-000000000002";
const proposalId = "a0000000-0000-4000-8000-000000000003";
type Scenario =
  | "eligibility"
  | "participation"
  | "proposals"
  | "results"
  | "reports"
  | "projects"
  | "empty-intake"
  | "empty-closed"
  | "protected"
  | "ballot"
  | "anonymous";

function fixture(scenario: Scenario): BudgetPageData {
  const intake = scenario === "projects" || scenario === "empty-intake";
  const closed = ["results", "reports", "empty-closed", "protected"].includes(
    scenario,
  );
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString();
  const budget: BudgetPageData["budget"] = {
    id: budgetId,
    community_id: budgetId,
    title: "Partida de prueba del barrio",
    description: null,
    amount: 100000,
    currency: "ARS",
    tokens_per_voter: 10,
    max_tokens_per_proposal: 5,
    proposals_close_at: day(intake ? 1 : -4),
    voting_opens_at: day(intake ? 2 : -3),
    voting_closes_at: day(closed ? -2 : 3),
    report_due_at: day(closed ? -1 : 4),
    created_at: day(-10),
  };
  const proposals: BudgetPageData["proposals"] = [
    "proposals",
    "projects",
    "empty-intake",
    "empty-closed",
  ].includes(scenario)
    ? []
    : [
        {
          id: proposalId,
          projectId,
          projectTitle: "Plaza del barrio",
          projectSummary: "Bancos y juegos",
          projectTimeEstimate: null,
          projectResourcesNeeded: null,
          requestedAmount: 50000,
          admittedAt: day(-4),
          rejectionNote: null,
          createdAt: day(-5),
        },
      ];
  const results: BudgetPageData["results"] =
    proposals.length && (!closed || scenario === "reports")
      ? [
          {
            proposal_id: proposalId,
            project_id: projectId,
            project_title: "Plaza del barrio",
            requested_amount: 50000,
            tokens: scenario === "reports" ? 15 : 0,
            voters: scenario === "reports" ? 5 : 0,
            awarded: scenario === "reports",
            awarded_amount: scenario === "reports" ? 50000 : 0,
          },
        ]
      : [];
  return {
    budget,
    rounds: [
      {
        id: budgetId,
        title: budget.title,
        closesAt: budget.voting_closes_at,
        phase: closed ? "closed" : intake ? "intake" : "voting",
      },
    ],
    proposals,
    proposableProjects: [],
    myProjectIds: scenario === "reports" ? [projectId] : [],
    proposalCount: scenario === "proposals" ? null : proposals.length,
    admittedCount: scenario === "proposals" ? null : proposals.length,
    results,
    canVote:
      scenario === "eligibility"
        ? null
        : scenario === "anonymous"
          ? false
          : true,
    hasParticipated: scenario === "participation" ? null : false,
    isAuthenticated: scenario !== "anonymous",
    isModerator: false,
    reportedProjectIds: [],
    loadFailures: {
      eligibility: scenario === "eligibility",
      participation: scenario === "participation",
      proposals: scenario === "proposals",
      results: scenario === "results",
      reports: scenario === "reports",
      projects: scenario === "projects",
    },
  };
}

const Example = component$<{ scenario: Scenario }>(({ scenario }) => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  return (
    <QwikRouterMockProvider
      url={`http://localhost/c/barrio/presupuesto/?ronda=${budgetId}&qaction=vieja&origen=contexto#fichas`}
      loaders={[
        { loader: useBudget, data: fixture(scenario) },
        {
          loader: useCommunity,
          data: { community: { id: budgetId, slug: "barrio", name: "Barrio" } },
        },
      ]}
    >
      <BudgetPage />
    </QwikRouterMockProvider>
  );
});

async function render(scenario: Scenario) {
  const dom = await createDOM();
  await dom.render(<Example scenario={scenario} />);
  return dom.screen;
}

function expectRetry(screen: Element, message: string) {
  const alert = Array.from(screen.querySelectorAll('[role="status"]')).find(
    (node) => node.textContent?.includes(message),
  );
  expect(alert).toBeDefined();
  const link = alert!.querySelector<HTMLAnchorElement>("a")!;
  expect(link.textContent).toBe("Volver a cargar");
  const destination = new URL(link.getAttribute("href")!, "http://localhost");
  expect(destination.pathname).toBe("/c/barrio/presupuesto/");
  expect(destination.searchParams.get("ronda")).toBe(budgetId);
  expect(destination.searchParams.get("origen")).toBe("contexto");
  expect(destination.searchParams.has("qaction")).toBe(false);
  expect(destination.hash).toBe("#presupuesto-titulo");
}

describe("presupuesto con lecturas parciales recuperables", () => {
  it.each([
    ["eligibility", "No pudimos comprobar si podés votar esta ronda."],
    ["participation", "No pudimos comprobar si ya participaste."],
  ] as const)(
    "%s desconocida no inventa una restricción ni habilita otra boleta",
    async (scenario, message) => {
      const screen = await render(scenario);
      expectRetry(screen, message);
      expect(screen.textContent).not.toContain(
        "tu residencia tenía que estar declarada antes",
      );
      expect(screen.textContent).not.toContain("Ya participaste.");
      expect(screen.textContent).not.toContain("Tu reparto se sumó");
      expect(screen.querySelector("form")).toBeFalsy();
      expect(screen.querySelector('input[name="budget_id"]')).toBeFalsy();
      expect(screen.textContent).not.toContain("Enviar reparto (definitivo)");
    },
  );

  it("un fallo de resultados no se presenta como reserva por baja participación ni cierre vacío", async () => {
    const screen = await render("results");
    expectRetry(screen, "No pudimos cargar los resultados.");
    expect(screen.textContent).not.toContain(
      "Sin resultados por baja participación",
    );
    expect(screen.textContent).not.toContain(
      "Esta ronda cerró sin proyectos admitidos",
    );
    expect(screen.textContent).toContain("Resultado del reparto");
  });

  it("un fallo de postulaciones no afirma ausencia de admitidos ni habilita el reparto", async () => {
    const screen = await render("proposals");
    expectRetry(screen, "No pudimos cargar las postulaciones.");
    expect(screen.textContent).not.toContain(
      "Todavía no hay proyectos admitidos",
    );
    expect(screen.textContent).not.toContain(
      "No tenés proyectos en esta comunidad sin postular",
    );
    expect(screen.querySelector("form")).toBeFalsy();
  });

  it("proyectos propios desconocidos ofrecen reintento sin afirmar que falta crear uno", async () => {
    const screen = await render("projects");
    expectRetry(screen, "No pudimos cargar tus proyectos.");
    expect(screen.textContent).not.toContain(
      "No tenés proyectos en esta comunidad sin postular",
    );
    expect(screen.querySelector('select[name="project_id"]')).toBeFalsy();
    expect(screen.querySelector('input[name="requested_amount"]')).toBeFalsy();
  });

  it("rendiciones desconocidas conservan el resultado conocido sin atribuir deuda ni habilitar otra rendición", async () => {
    const screen = await render("reports");
    expectRetry(screen, "No pudimos cargar las rendiciones.");
    expect(screen.textContent).toContain("Plaza del barrio");
    expect(screen.textContent).toContain("Financiado");
    expect(screen.textContent).not.toContain("Sin rendir hace");
    expect(screen.textContent).not.toContain("Rinde en");
    expect(screen.textContent).not.toContain("Rendido");
    expect(screen.textContent).not.toContain("Publicar la rendición");
    expect(screen.querySelector('input[name="amount_spent"]')).toBeFalsy();
  });

  it("las lecturas correctas vacías conservan los vacíos reales de postulación", async () => {
    const screen = await render("empty-intake");
    expect(screen.textContent).toContain("Todavía no hay proyectos admitidos");
    expect(screen.textContent).toContain(
      "No tenés proyectos en esta comunidad sin postular",
    );
    expect(screen.textContent).not.toContain("No pudimos cargar");
  });

  it("distingue una ronda cerrada sin admitidos del resultado protegido con propuestas conocidas", async () => {
    const empty = await render("empty-closed");
    expect(empty.textContent).toContain(
      "Esta ronda cerró sin proyectos admitidos",
    );
    expect(empty.textContent).not.toContain(
      "Sin resultados por baja participación",
    );
    const protectedResult = await render("protected");
    expect(protectedResult.textContent).toContain(
      "Sin resultados por baja participación",
    );
    expect(protectedResult.textContent).toContain(
      "Los resultados requieren al menos 5 participantes",
    );
    expect(protectedResult.textContent).not.toContain(
      "Esta ronda cerró sin proyectos admitidos",
    );
    expect(protectedResult.textContent).not.toContain("No pudimos cargar");
  });
});

describe("reparto definitivo", () => {
  it("pide confirmar que el envío es definitivo y no ofrece un simulador", async () => {
    const screen = await render("ballot");
    const form = screen.querySelector("form")!;
    const confirm = form.querySelector<HTMLInputElement>(
      'input[name="confirm_final"]',
    )!;
    expect(confirm.type).toBe("checkbox");
    expect(confirm.hasAttribute("required")).toBe(true);
    expect(form.textContent).toContain(
      "Entiendo que el reparto es definitivo",
    );
    expect(form.textContent).toContain("Enviar reparto (definitivo)");
    expect(screen.textContent).not.toContain("Guardar mi reparto");
    expect(screen.textContent).not.toContain("Abrir simulador de reparto");
  });

  it("sin sesión ofrece ingresar y volver a la misma ronda", async () => {
    const screen = await render("anonymous");
    expect(screen.querySelector("form")).toBeFalsy();
    const link = Array.from(screen.querySelectorAll("a")).find(
      (anchor) => anchor.textContent === "Ingresar",
    )!;
    const destination = new URL(link.getAttribute("href")!, "http://localhost");
    expect(destination.pathname).toBe("/ingresar");
    const next = new URL(
      destination.searchParams.get("next")!,
      "http://localhost",
    );
    expect(next.pathname).toBe("/c/barrio/presupuesto/");
    expect(next.searchParams.get("ronda")).toBe(budgetId);
    expect(next.searchParams.has("qaction")).toBe(false);
    expect(next.hash).toBe("#repartir-fichas");
  });
});
