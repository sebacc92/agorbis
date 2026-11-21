import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEventLoader } from "@qwik.dev/router";
import { loadBudgetPage } from "./budget-page";
import { getViewer, supabase } from "./session";
import { logFailure } from "./log";

vi.mock("./session", () => ({ getViewer: vi.fn(), supabase: vi.fn() }));
vi.mock("./log", () => ({ logFailure: vi.fn() }));

const budget = {
  id: "budget", community_id: "community", title: "Partida real", description: null,
  amount: 100, currency: "ARS", tokens_per_voter: 10, max_tokens_per_proposal: 5,
  proposals_close_at: "2000-01-01", voting_opens_at: "2000-02-01",
  voting_closes_at: "2999-01-01", report_due_at: "2999-02-01", created_at: "2000-01-01",
};
const proposal = {
  id: "proposal", project_id: "project", requested_amount: 10,
  admitted_at: "2000-01-01", rejection_note: null, created_at: "2000-01-01",
  projects: { title: "Plaza", summary: null, time_estimate: null, resources_needed: null },
};

function fixture(failures: string[] = [], closed = false, overrides: Record<string, unknown> = {}) {
  const rows: Record<string, unknown> = {
    communities: { id: "community" },
    community_budgets: [{ ...budget, voting_closes_at: closed ? "2001-01-01" : budget.voting_closes_at }],
    budget_proposals: [proposal], budget_results: [],
    budget_participation_receipts: null, budget_reports: [], can_vote_budget: true,
    projects: [{ id: "project", title: "Plaza", budget_amount: 10 }], ...overrides,
  };
  const read = (key: string) => {
    const result = { data: failures.includes(key) ? null : rows[key], error: failures.includes(key) ? { message: "database unavailable", code: "XX000" } : null };
    const builder = {
      select: () => builder, eq: () => builder, neq: () => builder,
      order: () => builder, limit: () => builder, maybeSingle: () => builder,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  };
  const db = { from: vi.fn(read), rpc: vi.fn(read) };
  vi.mocked(supabase).mockReturnValue(db as unknown as ReturnType<typeof supabase>);
  const ev = { params: {}, url: new URL("https://agorbis.test/c/barrio/presupuesto/?ronda=budget"), locale: () => "es", sharedMap: new Map(), error: (status: number, message: string) => Object.assign(new Error(message), { status }) } as unknown as RequestEventLoader;
  return { ev, db };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getViewer).mockResolvedValue({ userId: "viewer", isModerator: false } as Awaited<ReturnType<typeof getViewer>>);
});

describe("lecturas parciales del presupuesto", () => {
  it("una constancia ausente y una lista vacía correctas no se presentan como fallos", async () => {
    const { ev, db } = fixture([], false, { budget_proposals: [] });
    const result = await loadBudgetPage(ev);
    expect(result).toMatchObject({ hasParticipated: false, canVote: true, proposalCount: 0, admittedCount: 0 });
    expect(Object.values(result!.loadFailures).some(Boolean)).toBe(false);
    expect(db.rpc).not.toHaveBeenCalledWith("budget_results", expect.anything());
    expect(logFailure).not.toHaveBeenCalled();
  });
  it.each([
    ["budget_proposals", "proposals"], ["budget_results", "results"],
    ["budget_participation_receipts", "participation"], ["can_vote_budget", "eligibility"],
    ["budget_reports", "reports"], ["projects", "projects"],
  ] as const)("explica el fallo de %s y conserva las demás lecturas", async (source, flag) => {
    const { ev } = fixture([source], true);
    const result = (await loadBudgetPage(ev))!;
    expect(result.loadFailures[flag]).toBe(true);
    expect(Object.values(result.loadFailures).filter(Boolean)).toHaveLength(1);
    expect(result.budget.title).toBe("Partida real");
    if (flag !== "proposals") expect(result.proposals[0].projectTitle).toBe("Plaza");
    expect(logFailure).toHaveBeenCalledTimes(1);
  });
  it("elegibilidad y constancia desconocidas bloquean inferencias negativas", async () => {
    const { ev } = fixture(["can_vote_budget", "budget_participation_receipts"]);
    const result = await loadBudgetPage(ev);
    expect(result).toMatchObject({ canVote: null, hasParticipated: null });
  });
  it("postulaciones desconocidas no dan conteos cero ni opciones de alta incompletas", async () => {
    const { ev } = fixture(["budget_proposals"]);
    expect(await loadBudgetPage(ev)).toMatchObject({ proposalCount: null, admittedCount: null, proposableProjects: [] });
  });
  it("no atribuye fallos de lecturas personales que una visita anónima no necesita", async () => {
    vi.mocked(getViewer).mockResolvedValue({ userId: null, isModerator: false } as Awaited<ReturnType<typeof getViewer>>);
    const { ev, db } = fixture(["can_vote_budget", "budget_participation_receipts", "projects"]);
    const result = await loadBudgetPage(ev);
    expect(result).toMatchObject({ canVote: false, hasParticipated: false });
    expect(Object.values(result!.loadFailures).some(Boolean)).toBe(false);
    expect(db.from).not.toHaveBeenCalledWith("projects");
    expect(db.rpc).not.toHaveBeenCalledWith("can_vote_budget", expect.anything());
  });
  it("una consulta de rondas fallida conserva el error500 en lugar del vacío de partida", async () => {
    const { ev } = fixture(["community_budgets"]);
    await expect(loadBudgetPage(ev)).rejects.toMatchObject({ status: 500 });
  });
});
