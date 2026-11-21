import { describe, expect, it } from "vitest";
import {
  provisionalBudgetResults,
  toBudgetProposalViews,
  type BudgetProposalRow,
} from "./budget-page";

const project = {
  title: "Plaza nueva",
  summary: "Juegos y bancos",
  time_estimate: "3 meses",
  resources_needed: "Cuadrilla",
};

function row(overrides: Partial<BudgetProposalRow> = {}): BudgetProposalRow {
  return {
    id: "p1",
    project_id: "proj1",
    requested_amount: "150000.50",
    admitted_at: "2026-09-01T00:00:00Z",
    rejection_note: null,
    created_at: "2026-08-20T00:00:00Z",
    projects: project,
    ...overrides,
  };
}

describe("toBudgetProposalViews", () => {
  it("aplana el proyecto embebido y convierte el monto a número", () => {
    expect(toBudgetProposalViews([row()])).toEqual([
      {
        id: "p1",
        projectId: "proj1",
        projectTitle: "Plaza nueva",
        projectSummary: "Juegos y bancos",
        projectTimeEstimate: "3 meses",
        projectResourcesNeeded: "Cuadrilla",
        requestedAmount: 150000.5,
        admittedAt: "2026-09-01T00:00:00Z",
        rejectionNote: null,
        createdAt: "2026-08-20T00:00:00Z",
      },
    ]);
  });

  it("acepta la relación como lista y tolera que falte el proyecto", () => {
    const [asList, missing] = toBudgetProposalViews([
      row({ projects: [project] }),
      row({ id: "p2", projects: null }),
    ]);
    expect(asList?.projectTitle).toBe("Plaza nueva");
    expect(missing).toMatchObject({
      projectTitle: null,
      projectSummary: null,
    });
  });
});

describe("provisionalBudgetResults", () => {
  it("lista sólo las admitidas, en cero y sin ganadoras", () => {
    const views = toBudgetProposalViews([
      row(),
      row({ id: "p2", admitted_at: null }),
      row({ id: "p3", projects: null, requested_amount: 10 }),
    ]);
    expect(provisionalBudgetResults(views, "Proyecto")).toEqual([
      {
        proposal_id: "p1",
        project_id: "proj1",
        project_title: "Plaza nueva",
        requested_amount: 150000.5,
        tokens: 0,
        voters: 0,
        awarded: false,
        awarded_amount: 0,
      },
      {
        proposal_id: "p3",
        project_id: "proj1",
        project_title: "Proyecto",
        requested_amount: 10,
        tokens: 0,
        voters: 0,
        awarded: false,
        awarded_amount: 0,
      },
    ]);
  });
});
