import type { Tables } from "./database.types.helpers";

/**
 * Fases de una partida (D59). Se derivan de las cuatro fechas, igual que en la
 * base: `budget_phase()` es la autoridad, esto es su espejo para no pedir una
 * RPC sólo para saber qué pintar.
 *
 *   · `intake`  · se postulan proyectos
 *   · `review`  · evaluación de viabilidad, sin postulaciones nuevas
 *   · `voting`  · se reparten fichas
 *   · `closed`  · resultado en firme
 */
export type BudgetPhase = "intake" | "review" | "voting" | "closed";

type BudgetDates = Pick<
  Tables<"community_budgets">,
  "proposals_close_at" | "voting_opens_at" | "voting_closes_at"
>;

/**
 * Milisegundos de una fecha ISO, o `null` si no se puede leer.
 *
 * Está duplicada de `format.ts` a propósito: este archivo se transpila en
 * memoria en `test-civic.mjs` y ahí un `import` relativo no resuelve, así que
 * compartirla obligaría a stubbearla en cada carga. Son cuatro líneas; el
 * costo de acoplar las pruebas es mayor.
 */
function instantOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Una fecha ilegible corta la cadena en la fase más restrictiva.
 *
 * Sin la guarda, cada `t < NaN` daba `false` y las tres comparaciones caían
 * hasta `closed`: una partida con una fecha rota se declaraba cerrada y con
 * resultado en firme, que es el estado que menos se puede deshacer. Cortar en
 * la fase anterior deja la ronda quieta —nadie postula ni vota— sin inventar
 * un resultado.
 */
export function budgetPhase(
  budget: BudgetDates,
  now: Date = new Date(),
): BudgetPhase {
  const t = now.getTime();
  const proposalsClose = instantOf(budget.proposals_close_at);
  const votingOpens = instantOf(budget.voting_opens_at);
  const votingCloses = instantOf(budget.voting_closes_at);

  if (
    proposalsClose === null ||
    votingOpens === null ||
    votingCloses === null
  ) {
    return "review";
  }

  if (t < proposalsClose) return "intake";
  if (t < votingOpens) return "review";
  if (t < votingCloses) return "voting";
  return "closed";
}

export const PHASE_LABEL: Record<BudgetPhase, string> = {
  intake: "Postulaciones abiertas",
  review: "En evaluación",
  voting: "Votación abierta",
  closed: "Resultado",
};

export const PHASE_TONE: Record<
  BudgetPhase,
  "neutral" | "brand" | "success" | "warn"
> = {
  intake: "brand",
  review: "warn",
  voting: "success",
  closed: "neutral",
};

/**
 * Cuándo termina la fase actual, para la cuenta regresiva.
 *
 * Pedía además `report_due_at` sin leerlo nunca: obligaba a cualquier llamador
 * a traer una columna más de la que la función usa.
 */
export function phaseEndsAt(
  budget: BudgetDates,
  phase: BudgetPhase,
): string | null {
  return {
    intake: budget.proposals_close_at,
    review: budget.voting_opens_at,
    voting: budget.voting_closes_at,
    closed: null,
  }[phase];
}

export interface BudgetResultRow {
  proposal_id: string;
  project_id: string;
  project_title: string;
  requested_amount: number;
  tokens: number;
  voters: number;
  awarded: boolean;
  awarded_amount: number;
}

/**
 * Estado de rendición de un proyecto que recibió partida (D59).
 * Espejo del reloj de respuesta de los reclamos (D58): el silencio es un hecho
 * con fecha, no una acusación.
 */
export type ReportState = "reported" | "pending" | "overdue";

export function reportState(
  hasReport: boolean,
  reportDueAt: string,
  now: Date = new Date(),
): { state: ReportState; days: number } {
  if (hasReport) return { state: "reported", days: 0 };
  const due = instantOf(reportDueAt);
  // Sin fecha legible no hay vencimiento que sostener: marcar "overdue" con
  // `NaN` días pintaba una acusación de incumplimiento —y la pintaba como
  // "hace NaN días"— a partir de un dato roto.
  if (due === null) return { state: "pending", days: 0 };
  const t = now.getTime();
  const days = Math.max(0, Math.ceil(Math.abs(t - due) / 86_400_000));
  return due > t ? { state: "pending", days } : { state: "overdue", days };
}

/** Fichas que le quedan a alguien por repartir. */
export function tokensLeft(
  tokensPerVoter: number,
  used: Record<string, number>,
): number {
  const spent = Object.values(used).reduce((a, b) => a + (b || 0), 0);
  return Math.max(0, tokensPerVoter - spent);
}
