import type { RequestEventLoader } from "@qwik.dev/router";
import { budgetPhase, type BudgetResultRow } from "./budget";
import { resolveLocale, translate } from "./i18n";
import { many, single } from "./query";
import { getViewer, supabase } from "./session";
import { communitySlugFromRoute } from "./community";
import { logFailure } from "./log";

/**
 * Datos de la página de presupuesto participativo (`/c/[slug]/presupuesto`).
 *
 * La ruta tenía 1.400 líneas con la consulta, el armado de los datos y la
 * vista en el mismo archivo; cualquier cambio en lo que se lee de la base
 * obligaba a navegar la maquetación. Acá queda lo que habla con Supabase y lo
 * que transforma filas en lo que muestra la vista; la ruta sólo envuelve
 * `loadBudgetPage` en su `routeLoader$` (Qwik exige que el loader se exporte
 * desde el archivo de la ruta). Las acciones ya vivían en `budget-actions.ts`.
 *
 * Es el primer ejemplo del patrón para las demás rutas grandes: misma
 * consulta, mismo resultado, sólo cambia dónde vive.
 */

/**
 * Cuántas rondas se traen. Una comunidad abre a lo sumo una o dos por año, así
 * que veinte cubren una década sin paginar.
 */
export const BUDGET_ROUNDS_LIMIT = 20;

interface BudgetProposalProject {
  title: string | null;
  summary: string | null;
  time_estimate: string | null;
  resources_needed: string | null;
}

/** Fila de `budget_proposals` con su proyecto embebido, tal como la pide la página. */
export interface BudgetProposalRow {
  id: string;
  project_id: string;
  requested_amount: number | string;
  admitted_at: string | null;
  rejection_note: string | null;
  created_at: string;
  projects: BudgetProposalProject | BudgetProposalProject[] | null;
}

export interface BudgetProposalView {
  id: string;
  projectId: string;
  projectTitle: string | null;
  projectSummary: string | null;
  projectTimeEstimate: string | null;
  projectResourcesNeeded: string | null;
  requestedAmount: number;
  admittedAt: string | null;
  rejectionNote: string | null;
  createdAt: string;
}

/**
 * Aplana cada postulación con su proyecto. PostgREST devuelve la relación
 * embebida como objeto o como lista según cómo infiera la cardinalidad; se
 * aceptan las dos.
 */
export function toBudgetProposalViews(
  rows: readonly BudgetProposalRow[],
): BudgetProposalView[] {
  return rows.map((proposal) => {
    const project = Array.isArray(proposal.projects)
      ? proposal.projects[0]
      : proposal.projects;
    return {
      id: proposal.id,
      projectId: proposal.project_id,
      projectTitle: project?.title ?? null,
      projectSummary: project?.summary ?? null,
      projectTimeEstimate: project?.time_estimate ?? null,
      projectResourcesNeeded: project?.resources_needed ?? null,
      requestedAmount: Number(proposal.requested_amount),
      admittedAt: proposal.admitted_at,
      rejectionNote: proposal.rejection_note,
      createdAt: proposal.created_at,
    };
  });
}

/**
 * La página pide el escrutinio (`budget_results`) sólo cuando la ronda cerró.
 * Antes, la tabla de resultados muestra las propuestas admitidas en cero, sin
 * fichas ni ganadoras: no se muestra un conteo parcial que nadie calculó.
 */
export function provisionalBudgetResults(
  proposals: readonly BudgetProposalView[],
  fallbackTitle: string,
): BudgetResultRow[] {
  return proposals
    .filter((proposal) => proposal.admittedAt)
    .map((proposal): BudgetResultRow => ({
      proposal_id: proposal.id,
      project_id: proposal.projectId,
      project_title: proposal.projectTitle ?? fallbackTitle,
      requested_amount: proposal.requestedAmount,
      tokens: 0,
      voters: 0,
      awarded: false,
      awarded_amount: 0,
    }));
}

export async function loadBudgetPage(ev: RequestEventLoader) {
  const db = supabase(ev);
  const viewer = await getViewer(ev);

  const community = await single(
    ev,
    "presupuesto/comunidad",
    db
      .from("communities")
      .select("id")
      .eq("slug", communitySlugFromRoute(ev.params, ev.url))
      .maybeSingle(),
  );
  if (!community) return null;

  /**
   * Todas las rondas de la comunidad, de la más nueva a la más vieja.
   *
   * Antes se traía sólo la última: una comunidad que repartió su presupuesto
   * en 2025 y volvió a hacerlo en 2026 mostraba únicamente la ronda nueva, y
   * lo decidido el año anterior —qué proyectos ganaron, con cuántas fichas,
   * quién rindió— dejaba de existir en la app. En un presupuesto participativo
   * ese historial es medio sentido del ejercicio: sirve para juzgar si lo
   * prometido se cumplió.
   */
  const rounds = await many(
    ev,
    "presupuesto/rondas",
    db
      .from("community_budgets")
      .select(
        "id, community_id, title, description, amount, currency, tokens_per_voter, max_tokens_per_proposal, proposals_close_at, voting_opens_at, voting_closes_at, report_due_at, created_at",
      )
      .eq("community_id", community.id)
      .order("voting_closes_at", { ascending: false })
      .limit(BUDGET_ROUNDS_LIMIT),
  );
  if (rounds.length === 0) return null;

  // Sin `?ronda=`, la vigente (o la última cerrada), que es lo que se venía
  // mostrando. Un id que no pertenece a esta comunidad cae en el mismo lugar
  // en vez de dar error: no hay nada que proteger acá, sólo que no confunda.
  const requested = ev.url.searchParams.get("ronda");
  const budget = rounds.find((round) => round.id === requested) ?? rounds[0]!;
  const currentPhase = budgetPhase(budget);

  const [proposalsRes, resultsRes, participationRes, reportsRes, eligibleRes] =
    await Promise.all([
      db
        .from("budget_proposals")
        .select(
          "id, project_id, requested_amount, admitted_at, rejection_note, created_at, projects:project_id (title, summary, time_estimate, resources_needed)",
        )
        .eq("budget_id", budget.id),
      currentPhase === "closed"
        ? db.rpc("budget_results", { p_budget: budget.id })
        : Promise.resolve({ data: [], error: null }),
      viewer.userId
        ? db
            .from("budget_participation_receipts")
            .select("budget_id")
            .eq("budget_id", budget.id)
            .eq("user_id", viewer.userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("budget_reports").select("project_id").eq("budget_id", budget.id),
      viewer.userId
        ? db.rpc("can_vote_budget", {
            p_user: viewer.userId,
            p_budget: budget.id,
          })
        : Promise.resolve({ data: false, error: null }),
    ]);

  const proposals = toBudgetProposalViews(proposalsRes.data ?? []);

  // Proyectos propios de esta comunidad que todavía no están postulados.
  // Se resuelve acá y no en el componente para no mostrar un desplegable con
  // opciones que la política de RLS va a rechazar igual.
  const proposedIds = new Set(
    (proposalsRes.data ?? []).map((p) => p.project_id),
  );
  const myProjectsRes = viewer.userId
    ? await db
        .from("projects")
        .select("id, title, budget_amount")
        .eq("community_id", community.id)
        .eq("author_id", viewer.userId)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  const myProjects = myProjectsRes.data;
  const loadFailures = {
    proposals: !!proposalsRes.error,
    results: !!resultsRes.error,
    participation: !!participationRes.error,
    eligibility: !!eligibleRes.error,
    reports: !!reportsRes.error,
    projects: !!myProjectsRes.error,
  };
  for (const [scope, result] of [
    ["presupuesto/postulaciones", proposalsRes],
    ["presupuesto/resultados", resultsRes],
    ["presupuesto/constancia", participationRes],
    ["presupuesto/elegibilidad", eligibleRes],
    ["presupuesto/rendiciones", reportsRes],
    ["presupuesto/proyectos-propios", myProjectsRes],
  ] as const) {
    if (result.error) logFailure({ scope }, result.error);
  }

  return {
    loadFailures,
    budget,
    // Sólo lo necesario para el selector: el resto de cada ronda se carga
    // cuando se la elige.
    rounds: rounds.map((round) => ({
      id: round.id,
      title: round.title,
      closesAt: round.voting_closes_at,
      phase: budgetPhase(round),
    })),
    proposals,
    proposableProjects: (loadFailures.proposals
      ? []
      : (myProjects ?? [])
    ).filter((p) => !proposedIds.has(p.id)),
    myProjectIds: (myProjects ?? []).map((p) => p.id),
    proposalCount: loadFailures.proposals ? null : proposals.length,
    admittedCount: loadFailures.proposals
      ? null
      : proposals.filter((p) => p.admittedAt).length,
    results:
      currentPhase === "closed"
        ? ((loadFailures.results
            ? []
            : (resultsRes.data ?? [])) as BudgetResultRow[])
        : provisionalBudgetResults(
            proposals,
            translate(resolveLocale(ev.locale()), "Proyecto"),
          ),
    hasParticipated: loadFailures.participation
      ? null
      : participationRes.data !== null,
    reportedProjectIds: (reportsRes.data ?? []).map((r) => r.project_id),
    canVote: loadFailures.eligibility ? null : eligibleRes.data === true,
    isAuthenticated: !!viewer.userId,
    isModerator: viewer.isModerator,
  };
}

export type BudgetPageData = NonNullable<
  Awaited<ReturnType<typeof loadBudgetPage>>
>;
