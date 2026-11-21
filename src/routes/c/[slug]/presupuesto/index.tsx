import { component$, useSignal } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  Icon,
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  ProgressBar,
  Select,
  SubmitButton,
  Textarea,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { CivicCalendarButton } from "~/components/ui/CivicCalendarButton";
import { ProposalComparisonModal } from "~/components/budget/ProposalComparisonModal";
import { BudgetSandboxSimulator } from "~/components/budget/BudgetSandboxSimulator";
import { BudgetAccountabilityLedger } from "~/components/budget/BudgetAccountabilityLedger";
import {
  budgetPhase,
  phaseEndsAt,
  reportState,
  PHASE_LABEL,
  PHASE_TONE,
} from "~/lib/budget";
import {
  reviewBudgetProposal,
  reviewBudgetProposalSchema,
  useCastBudgetVote,
  useProposeProject,
  useSubmitBudgetReport,
} from "~/lib/budget-actions";
import { routes } from "~/lib/community";
import { APP_NAME } from "~/lib/constants";
import { formatInstant, formatMoney, pluralize } from "~/lib/format";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { loadBudgetPage } from "~/lib/budget-page";
import { useLocaleLoader } from "~/routes/layout";
import { useCommunity } from "../layout";

export {
  useCastBudgetVote,
  useProposeProject,
  useSubmitBudgetReport,
} from "~/lib/budget-actions";

const PROPOSAL_COLOR_CLASSES = [
  {
    bg: "bg-brand-500",
    text: "text-brand-600 dark:text-brand-400",
    dot: "bg-brand-500",
    border: "border-brand-500",
  },
  {
    bg: "bg-success-500",
    text: "text-success-600 dark:text-success-400",
    dot: "bg-success-500",
    border: "border-success-500",
  },
  {
    bg: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-500",
  },
  {
    bg: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
    border: "border-sky-500",
  },
  {
    bg: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
    border: "border-rose-500",
  },
  {
    bg: "bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
    border: "border-purple-500",
  },
  {
    bg: "bg-teal-500",
    text: "text-teal-600 dark:text-teal-400",
    dot: "bg-teal-500",
    border: "border-teal-500",
  },
  {
    bg: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
    dot: "bg-indigo-500",
    border: "border-indigo-500",
  },
];

/**
 * La consulta y el armado de los datos viven en `~/lib/budget-page`; Qwik
 * exige que el `routeLoader$` se exporte desde acá.
 */
export const useBudget = routeLoader$((ev) => loadBudgetPage(ev), {
  search: ["ronda"],
});

/**
 * Declarada acá y no en `~/lib/budget-actions` porque necesita invalidar
 * `useBudget`: sin eso, admitir o rechazar una postulación dejaba la tarjeta
 * en "pendiente" hasta recargar la página.
 */
export const useReviewBudgetProposal = routeAction$(
  (data, ev) => reviewBudgetProposal(data, ev),
  { validation: [zod$(reviewBudgetProposalSchema)], invalidate: [useBudget] },
);

const BUDGET_LOAD_MESSAGES = {
  proposals:
    "No pudimos cargar las postulaciones. Los proyectos disponibles pueden estar incompletos.",
  results: "No pudimos cargar los resultados. No podemos confirmar el reparto.",
  participation:
    "No pudimos comprobar si ya participaste. Volvé a cargar antes de enviar.",
  eligibility:
    "No pudimos comprobar si podés votar esta ronda. Volvé a intentarlo.",
  reports:
    "No pudimos cargar las rendiciones. No podemos indicar cuáles están pendientes.",
  projects:
    "No pudimos cargar tus proyectos. Volvé a intentarlo para postular o rendir.",
} as const;

export default component$(() => {
  const data = useBudget();
  const ctx = useCommunity();
  const community = ctx.value.community;
  const vote = useCastBudgetVote();
  const propose = useProposeProject();
  const review = useReviewBudgetProposal();
  const submitReport = useSubmitBudgetReport();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const location = useLocation();
  const retryUrl = new URL(location.url);
  retryUrl.searchParams.delete("qaction");
  const retryHref = `${retryUrl.pathname}${retryUrl.search}#presupuesto-titulo`;

  /** Borrador local: el reparto individual nunca vuelve del servidor. */
  const draftTokens = useSignal<Record<string, number>>({});
  /** Proyecto elegido en la postulación: el monto precargado lo sigue. */
  const proposalProjectId = useSignal("");

  if (!data.value) {
    return (
      <section aria-labelledby="presupuesto-titulo">
        <h2 id="presupuesto-titulo" class="sr-only">
          {translate(locale, "Presupuesto participativo")}
        </h2>
        <EmptyState
          emoji="🗂️"
          title="Esta comunidad todavía no tiene una partida"
          description="Cuando haya un presupuesto para repartir, acá se van a poder postular proyectos y votar cómo se asigna."
        />
      </section>
    );
  }

  const {
    budget,
    proposableProjects,
    proposals,
    myProjectIds,
    results,
    canVote,
    isAuthenticated,
    isModerator,
    reportedProjectIds,
    admittedCount,
    rounds,
    hasParticipated: persistedParticipation,
    loadFailures,
  } = data.value;
  const voteSaved =
    vote.formData?.get("budget_id") === budget.id && vote.value?.saved === true;
  const hasParticipated = voteSaved ? true : persistedParticipation;
  const phase = budgetPhase(budget);
  const endsAt = phaseEndsAt(budget, phase);
  const money = (n: number) => formatMoney(n, budget.currency, locale);

  const awarded = results.filter((r) => r.awarded);
  const assigned = awarded.reduce(
    (sum, r) => sum + Number(r.awarded_amount),
    0,
  );
  const usedTokens = Object.values(draftTokens.value).reduce(
    (a, b) => a + b,
    0,
  );
  const leftTokens = budget.tokens_per_voter - usedTokens;
  /**
   * Un reparto inválido no puede llegar al servidor sólo para que lo rechace.
   * El contador ya avisaba en rojo que te habías pasado, pero el botón seguía
   * activo: se guardaba, volvía el error y había que rehacer el reparto entero
   * desde los números que el formulario ya no mostraba.
   */
  const overPerProposal = Object.values(draftTokens.value).some(
    (tokens) => tokens > budget.max_tokens_per_proposal,
  );
  const invalidAllocation =
    usedTokens === 0 || leftTokens < 0 || overPerProposal;

  return (
    <section aria-labelledby="presupuesto-titulo">
      {/* ------------------------------------------------- Rondas anteriores */}
      {rounds.length > 1 && (
        <nav
          aria-label={translate(locale, "Rondas de presupuesto")}
          class="scrollbar-slim mb-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1"
        >
          {rounds.map((round) => {
            const isCurrent = round.id === budget.id;
            return (
              <Link
                key={round.id}
                href={`?ronda=${round.id}`}
                aria-current={isCurrent ? "page" : undefined}
                class={cx(
                  "flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-2xl border px-3 text-sm transition-colors",
                  isCurrent
                    ? "border-brand-500 bg-brand-50 text-ink-strong dark:bg-brand-950/40"
                    : "border-subtle text-ink-muted hover:border-brand-500 hover:text-ink-strong",
                )}
              >
                <span class="font-medium">{round.title}</span>
                <span class="text-xs text-ink-faint">
                  {translate(locale, PHASE_LABEL[round.phase])}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* ------------------------------------------------ Cabecera de la ronda */}
      <Card class="p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <Badge tone={PHASE_TONE[phase]}>
                {translate(locale, PHASE_LABEL[phase])}
              </Badge>
              {endsAt && (
                <div class="flex items-center gap-2">
                  <span class="text-xs text-ink-muted">
                    {translate(locale, "hasta el {{date}}", {
                      date: formatInstant(endsAt, locale, timeZone),
                    })}
                  </span>
                  <CivicCalendarButton
                    title={`${budget.title} - ${translate(locale, PHASE_LABEL[phase])}`}
                    description={`Cierre de etapa (${translate(locale, PHASE_LABEL[phase])}) en el Presupuesto Participativo de ${community.name}.`}
                    endDate={endsAt}
                    location={community.name}
                  />
                </div>
              )}
            </div>
            <h2
              id="presupuesto-titulo"
              class="mt-2 text-2xl font-semibold tracking-tight"
            >
              {budget.title}
            </h2>
            {budget.description && (
              <p class="ugc-text mt-2 max-w-2xl text-sm text-ink-muted">
                {budget.description}
              </p>
            )}
          </div>

          <div class="shrink-0 text-right">
            <p class="text-xs uppercase tracking-wide text-ink-faint">
              {translate(locale, "Partida")}
            </p>
            <p class="text-2xl font-semibold tabular-nums text-brand">
              {money(Number(budget.amount))}
            </p>
          </div>
        </div>

        {/* Cuánto se asignó ya. Sólo tiene sentido cuando hay resultado. */}
        {phase === "closed" && results.length > 0 && (
          <div class="mt-5">
            <ProgressBar
              value={assigned}
              max={Number(budget.amount)}
              label="Partida asignada"
              tone="brand"
              valueText={translate(locale, "{{current}} de {{total}}", {
                current: money(assigned),
                total: money(Number(budget.amount)),
              })}
            />
            <p class="mt-1.5 text-xs text-ink-muted">
              {translate(
                locale,
                "{{assigned}} asignados de {{total}} · {{count}} proyectos financiados",
                {
                  assigned: money(assigned),
                  total: money(Number(budget.amount)),
                  count: awarded.length,
                },
              )}
            </p>
          </div>
        )}
      </Card>

      {Object.values(loadFailures).some(Boolean) && (
        <div class="mt-4 space-y-3">
          {Object.entries(BUDGET_LOAD_MESSAGES).map(([key, message]) =>
            loadFailures[key as keyof typeof loadFailures] ? (
              <Alert key={key} tone="warn">
                <p>{translate(locale, message)}</p>
                <a
                  href={retryHref}
                  class="inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
                >
                  {translate(locale, "Volver a cargar")}
                </a>
              </Alert>
            ) : null,
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- Fases */}
      <ol class="mt-4 grid gap-2 sm:grid-cols-4">
        {(
          [
            ["intake", budget.proposals_close_at],
            ["review", budget.voting_opens_at],
            ["voting", budget.voting_closes_at],
            ["closed", budget.report_due_at],
          ] as const
        ).map(([key, date]) => (
          <li
            key={key}
            aria-current={phase === key ? "step" : undefined}
            class={cx(
              "rounded-2xl border px-3 py-2.5 text-xs",
              phase === key
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                : "border-subtle text-ink-muted",
            )}
          >
            <p
              class={cx(
                "font-semibold",
                phase === key ? "text-brand" : "text-ink-muted",
              )}
            >
              {translate(locale, PHASE_LABEL[key])}
            </p>
            <p class="mt-0.5 text-ink-faint">
              {formatInstant(date, locale, timeZone)}
            </p>
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------- Proyectos postulados */}
      {(phase === "intake" || phase === "review") && proposals.length > 0 && (
        <section class="mt-6" aria-labelledby="postulados-titulo">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="postulados-titulo" class="text-lg font-semibold">
                {translate(locale, "Proyectos postulados")}
              </h3>
              <p class="mt-1 text-sm text-ink-muted">
                {phase === "intake"
                  ? translate(
                      locale,
                      "Se evalúan cuando cierre la etapa de postulaciones.",
                    )
                  : translate(
                      locale,
                      "La moderación admite los proyectos viables antes de abrir la votación.",
                    )}
              </p>
            </div>
            <div class="flex items-center gap-2">
              {!loadFailures.proposals && (
                <BudgetSandboxSimulator
                  proposals={proposals}
                  currency={budget.currency}
                  totalBudget={Number(budget.amount)}
                  totalTokens={budget.tokens_per_voter}
                />
              )}
              {!loadFailures.proposals && (
                <ProposalComparisonModal
                  proposals={proposals}
                  currency={budget.currency}
                  totalBudget={Number(budget.amount)}
                />
              )}
              {!loadFailures.proposals && (
                <Badge tone="neutral">
                  {translate(locale, "{{count}} postulados", {
                    count: proposals.length,
                  })}
                </Badge>
              )}
            </div>
          </div>

          <ul class="mt-3 space-y-3">
            {proposals.map((proposal) => {
              const isCurrent =
                review.formData?.get("proposal_id") === proposal.id;
              const rejected = !!proposal.rejectionNote;

              return (
                <li key={proposal.id}>
                  <Card class="p-4">
                    <div class="flex flex-wrap items-start gap-3">
                      <div class="min-w-0 flex-1">
                        <Link
                          href={routes.project(proposal.projectId)}
                          class="font-medium text-ink-strong hover:text-brand hover:underline"
                        >
                          <bdi dir="auto">
                            {proposal.projectTitle ??
                              translate(locale, "Proyecto")}
                          </bdi>
                        </Link>
                        <p class="mt-1 text-sm text-ink-muted">
                          {translate(locale, "Solicita {{amount}}", {
                            amount: money(proposal.requestedAmount),
                          })}
                        </p>
                      </div>
                      {proposal.admittedAt ? (
                        <Badge tone="success">
                          {translate(locale, "Admitido para votar")}
                        </Badge>
                      ) : rejected ? (
                        <Badge tone="warn">
                          {translate(locale, "No admitido")}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          {translate(locale, "Pendiente de evaluación")}
                        </Badge>
                      )}
                    </div>

                    {proposal.rejectionNote && (
                      <p class="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-ink-muted">
                        <strong class="text-ink-strong">
                          {translate(locale, "Motivo:")}
                        </strong>{" "}
                        <span dir="auto" class="ugc-text">
                          {proposal.rejectionNote}
                        </span>
                      </p>
                    )}

                    {isCurrent && review.value?.message && (
                      <Alert class="mt-3">
                        {translate(locale, review.value.message)}
                      </Alert>
                    )}

                    {phase === "review" && isModerator && (
                      <div class="mt-3 flex flex-wrap items-start gap-2 border-t border-subtle pt-3">
                        {!proposal.admittedAt && (
                          <Form action={review}>
                            <input
                              type="hidden"
                              name="proposal_id"
                              value={proposal.id}
                            />
                            <input
                              type="hidden"
                              name="decision"
                              value="admit"
                            />
                            <SubmitButton
                              variant="success"
                              size="sm"
                              pending={
                                review.isRunning &&
                                isCurrent &&
                                review.formData?.get("decision") === "admit"
                              }
                              disabled={review.isRunning}
                            >
                              {translate(locale, "Admitir")}
                            </SubmitButton>
                          </Form>
                        )}

                        <details class="min-w-0 flex-1 sm:max-w-xl">
                          <summary class="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm font-medium text-danger hover:bg-danger-500/10">
                            {translate(
                              locale,
                              rejected ? "Cambiar motivo" : "No admitir",
                            )}
                          </summary>
                          <Form
                            action={review}
                            class="mt-2 flex flex-col gap-2 sm:flex-row"
                          >
                            <input
                              type="hidden"
                              name="proposal_id"
                              value={proposal.id}
                            />
                            <input
                              type="hidden"
                              name="decision"
                              value="reject"
                            />
                            <label
                              for={`rechazo-${proposal.id}`}
                              class="sr-only"
                            >
                              {translate(locale, "Motivo de la decisión")}
                            </label>
                            <Input
                              id={`rechazo-${proposal.id}`}
                              name="rejection_note"
                              required
                              minLength={3}
                              maxLength={500}
                              value={proposal.rejectionNote ?? ""}
                              placeholder={translate(
                                locale,
                                "Explicá por qué no pasa a votación",
                              )}
                            />
                            <SubmitButton
                              variant="danger"
                              size="sm"
                              class="shrink-0"
                              pending={
                                review.isRunning &&
                                isCurrent &&
                                review.formData?.get("decision") === "reject"
                              }
                              disabled={review.isRunning}
                            >
                              {translate(locale, "Confirmar")}
                            </SubmitButton>
                          </Form>
                        </details>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------------- Votación */}
      {phase === "voting" && (admittedCount === null || admittedCount > 0) && (
        <Card class="mt-6 p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 id="repartir-fichas" class="font-semibold">
              {translate(locale, "Repartí tus fichas")}
            </h3>
            {/* Sin simulador: en la votación el formulario ya suma en vivo, y
                el botón final del simulador cerraba el diálogo descartando lo
                armado, como si ya se hubiera votado. */}
            {!loadFailures.proposals && (
              <ProposalComparisonModal
                proposals={proposals}
                currency={budget.currency}
                totalBudget={Number(budget.amount)}
              />
            )}
          </div>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Tenés {{total}} fichas para distribuir entre los proyectos que quieras, hasta {{max}} por proyecto. Tu reparto no queda guardado: sólo se suma al total y registramos que participaste. Una vez enviado, no se puede cambiar.",
              {
                total: budget.tokens_per_voter,
                max: budget.max_tokens_per_proposal,
              },
            )}
          </p>

          {!isAuthenticated && (
            <Alert tone="brand" class="mt-4">
              <span>
                {translate(locale, "Ingresá para participar del reparto.")}
              </span>{" "}
              <a
                href={`/ingresar?next=${encodeURIComponent(`${retryUrl.pathname}${retryUrl.search}#repartir-fichas`)}`}
                class="font-semibold underline underline-offset-2"
              >
                {translate(locale, "Ingresar")}
              </a>
            </Alert>
          )}

          {isAuthenticated && canVote === false && (
            <Alert tone="warn" class="mt-4">
              {translate(
                locale,
                "Para votar esta partida tu residencia tenía que estar declarada antes de que abriera la votación.",
              )}
            </Alert>
          )}

          {vote.value?.message && (
            <Alert class="mt-4">{translate(locale, vote.value.message)}</Alert>
          )}
          {voteSaved && (
            <Alert tone="success" class="mt-4">
              {translate(
                locale,
                "Tu reparto se sumó al total. No queda guardado, así que no se puede ver ni cambiar.",
              )}
            </Alert>
          )}

          {hasParticipated === true && !voteSaved && (
            <Alert tone="success" class="mt-4">
              {translate(
                locale,
                "Ya participaste. Tu reparto no quedó guardado, así que no podemos mostrarlo ni cambiarlo.",
              )}
            </Alert>
          )}

          {canVote === true &&
            hasParticipated === false &&
            !loadFailures.proposals && (
              <Form action={vote} class="mt-4 space-y-4">
                <input type="hidden" name="budget_id" value={budget.id} />

                {/* Panel visual de asignación de fichas */}
                <div class="rounded-2xl border border-subtle bg-muted/30 p-4 shadow-xs">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span class="text-xs font-bold uppercase tracking-wider text-ink-faint">
                        {translate(locale, "Distribución de tus fichas")}
                      </span>
                      <p
                        class={cx(
                          "mt-0.5 text-sm font-semibold",
                          leftTokens < 0
                            ? "text-danger"
                            : leftTokens === 0
                              ? "text-success-600 dark:text-success-400"
                              : "text-brand",
                        )}
                        aria-live="polite"
                      >
                        {translate(locale, "Usadas: {{used}} de {{total}}", {
                          used: usedTokens,
                          total: budget.tokens_per_voter,
                        })}
                        {leftTokens < 0
                          ? ` · ${translate(
                              locale,
                              "te pasaste por {{count}}",
                              {
                                count: -leftTokens,
                              },
                            )}`
                          : leftTokens > 0
                            ? ` · ${translate(locale, "te quedan {{count}}", {
                                count: leftTokens,
                              })}`
                            : ` · ${translate(locale, "¡repartiste todas!")}`}
                        {leftTokens === 0 && (
                          <Icon name="check" class="ml-1 text-success" />
                        )}
                      </p>
                    </div>

                    {usedTokens > 0 && (
                      <button
                        type="button"
                        onClick$={() => {
                          triggerHapticFeedback("selection");
                          draftTokens.value = {};
                        }}
                        class="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-ink-muted transition hover:text-danger hover:underline"
                      >
                        <Icon name="x" />
                        <span>{translate(locale, "Restablecer fichas")}</span>
                      </button>
                    )}
                  </div>

                  {/* Barra de progreso interactiva segmentada y multicolor */}
                  <div class="mt-3.5 flex h-3 w-full overflow-hidden rounded-full border border-subtle bg-surface">
                    {results.map((row, idx) => {
                      const tokens = draftTokens.value[row.proposal_id] ?? 0;
                      if (tokens <= 0) return null;
                      const pct = (tokens / budget.tokens_per_voter) * 100;
                      const color =
                        PROPOSAL_COLOR_CLASSES[
                          idx % PROPOSAL_COLOR_CLASSES.length
                        ]!;
                      return (
                        <div
                          key={row.proposal_id}
                          class={cx(
                            "h-full transition-all duration-300",
                            color.bg,
                          )}
                          style={{ width: `${pct}%` }}
                          title={`${row.project_title}: ${tokens} (${Math.round(pct)}%)`}
                        />
                      );
                    })}
                    {leftTokens > 0 && (
                      <div
                        class="h-full bg-muted/50 transition-all duration-300"
                        style={{
                          width: `${(leftTokens / budget.tokens_per_voter) * 100}%`,
                        }}
                        title={translate(locale, "Fichas disponibles")}
                      />
                    )}
                    {leftTokens < 0 && (
                      <div
                        class="h-full w-full animate-pulse bg-danger-500"
                        title={translate(locale, "Exceso de fichas")}
                      />
                    )}
                  </div>

                  {/* Desglose de impacto estimado en tiempo real */}
                  {usedTokens > 0 && (
                    <div class="mt-3.5 flex flex-wrap items-center gap-2 border-t border-subtle/60 pt-3">
                      <span class="text-2xs font-bold uppercase tracking-wider text-ink-faint">
                        {translate(locale, "Impacto estimado:")}
                      </span>
                      {results.map((row, idx) => {
                        const tokens = draftTokens.value[row.proposal_id] ?? 0;
                        if (tokens <= 0) return null;
                        const color =
                          PROPOSAL_COLOR_CLASSES[
                            idx % PROPOSAL_COLOR_CLASSES.length
                          ]!;
                        const estimatedShare = budget.amount
                          ? money(
                              (Number(budget.amount) * tokens) /
                                budget.tokens_per_voter,
                            )
                          : null;
                        return (
                          <div
                            key={row.proposal_id}
                            class="inline-flex items-center gap-1.5 rounded-xl border border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-ink-strong shadow-2xs"
                          >
                            <span
                              class={cx("size-2 rounded-full", color.dot)}
                            />
                            <span class="max-w-[120px] truncate">
                              {row.project_title}
                            </span>
                            <span class={cx("font-bold", color.text)}>
                              {tokens}{" "}
                              {tokens === 1
                                ? translate(locale, "ficha")
                                : translate(locale, "fichas")}
                            </span>
                            {estimatedShare && (
                              <span class="text-2xs text-ink-muted">
                                (~{estimatedShare})
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <ul class="space-y-2.5">
                  {results.map((row, idx) => {
                    const currentVal = draftTokens.value[row.proposal_id] ?? 0;
                    const isOver = currentVal > budget.max_tokens_per_proposal;
                    const hasTokens = currentVal > 0;
                    const color =
                      PROPOSAL_COLOR_CLASSES[
                        idx % PROPOSAL_COLOR_CLASSES.length
                      ]!;

                    return (
                      <li
                        key={row.proposal_id}
                        class={cx(
                          "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all",
                          hasTokens
                            ? "border-brand-500/40 bg-brand-50/20 shadow-xs dark:border-brand-500/30 dark:bg-brand-950/20"
                            : "border-subtle bg-surface hover:border-strong",
                        )}
                      >
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class={cx(
                                "size-2.5 rounded-full shrink-0",
                                color.dot,
                              )}
                            />
                            <Link
                              href={routes.project(row.project_id)}
                              class="font-semibold text-ink-strong hover:text-brand hover:underline"
                            >
                              <bdi dir="auto">{row.project_title}</bdi>
                            </Link>
                            {hasTokens && (
                              <Badge tone="brand" class="shrink-0 text-3xs">
                                {currentVal}{" "}
                                {pluralize(
                                  currentVal,
                                  "ficha",
                                  "fichas",
                                  locale,
                                )}
                              </Badge>
                            )}
                          </div>
                          <p class="mt-0.5 text-xs text-ink-muted">
                            {translate(locale, "Solicita {{amount}}", {
                              amount: money(Number(row.requested_amount)),
                            })}
                          </p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {/* Botón para vaciar fichas de este proyecto */}
                          {currentVal > 0 && (
                            <button
                              type="button"
                              onClick$={() => {
                                triggerHapticFeedback("selection");
                                draftTokens.value = {
                                  ...draftTokens.value,
                                  [row.proposal_id]: 0,
                                };
                              }}
                              class="cursor-pointer rounded-xl border border-control px-2 py-1 text-2xs font-semibold text-ink-muted transition hover:border-danger-500 hover:text-danger"
                              title={translate(locale, "Quitar fichas")}
                            >
                              0
                            </button>
                          )}

                          {/* Botón rápido para asignar el máximo disponible */}
                          {leftTokens > 0 &&
                            currentVal < budget.max_tokens_per_proposal && (
                              <button
                                type="button"
                                onClick$={() => {
                                  triggerHapticFeedback("selection");
                                  const addable = Math.min(
                                    budget.max_tokens_per_proposal - currentVal,
                                    leftTokens,
                                  );
                                  draftTokens.value = {
                                    ...draftTokens.value,
                                    [row.proposal_id]: currentVal + addable,
                                  };
                                }}
                                class="cursor-pointer rounded-xl border border-control px-2.5 py-1 text-2xs font-semibold text-ink-muted transition hover:border-brand-500 hover:text-brand"
                                title={translate(
                                  locale,
                                  "Asignar máximo posible",
                                )}
                              >
                                {translate(locale, "Máx")}
                              </button>
                            )}

                          {/* Controles de Stepper (+ / -) */}
                          <div class="flex items-center rounded-2xl border border-control bg-surface p-0.5 shadow-xs">
                            <button
                              type="button"
                              disabled={currentVal <= 0}
                              onClick$={() => {
                                triggerHapticFeedback("selection");
                                draftTokens.value = {
                                  ...draftTokens.value,
                                  [row.proposal_id]: Math.max(
                                    0,
                                    currentVal - 1,
                                  ),
                                };
                              }}
                              aria-label={translate(
                                locale,
                                "Restar ficha a {{project}}",
                                { project: row.project_title },
                              )}
                              class="flex size-9 cursor-pointer items-center justify-center rounded-xl text-base font-bold text-ink-strong transition active:scale-90 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                            >
                              −
                            </button>

                            <input
                              type="number"
                              inputMode="numeric"
                              name={`tokens.${row.proposal_id}`}
                              min={0}
                              max={budget.max_tokens_per_proposal}
                              value={currentVal}
                              onWheel$={(_, el) => {
                                if (document.activeElement === el) el.blur();
                              }}
                              onInput$={(_, el) => {
                                const raw = Number.parseInt(el.value, 10);
                                draftTokens.value = {
                                  ...draftTokens.value,
                                  [row.proposal_id]: Number.isFinite(raw)
                                    ? Math.max(0, raw)
                                    : 0,
                                };
                              }}
                              aria-label={translate(
                                locale,
                                "Fichas para {{project}}",
                                { project: row.project_title },
                              )}
                              aria-invalid={isOver ? "true" : undefined}
                              class="h-9 w-12 border-0 bg-transparent text-center text-sm font-bold tabular-nums text-ink focus:outline-none focus:ring-0"
                            />

                            <button
                              type="button"
                              disabled={
                                currentVal >= budget.max_tokens_per_proposal ||
                                leftTokens <= 0
                              }
                              onClick$={() => {
                                triggerHapticFeedback("selection");
                                draftTokens.value = {
                                  ...draftTokens.value,
                                  [row.proposal_id]: Math.min(
                                    budget.max_tokens_per_proposal,
                                    currentVal + 1,
                                  ),
                                };
                              }}
                              aria-label={translate(
                                locale,
                                "Sumar ficha a {{project}}",
                                { project: row.project_title },
                              )}
                              class="flex size-9 cursor-pointer items-center justify-center rounded-xl text-base font-bold text-brand transition active:scale-90 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* El reparto no se puede cambiar después (D68): el botón decía
                    "Guardar", como si se pudiera volver, y un reparto parcial
                    se enviaba sin avisar que las fichas libres se pierden. */}
                <div class="space-y-3">
                  {leftTokens > 0 && usedTokens > 0 && (
                    <p
                      role="status"
                      class="rounded-xl border border-warn-400/50 bg-warn-400/5 px-3 py-2 text-xs font-medium text-warn"
                    >
                      {leftTokens === 1
                        ? translate(
                            locale,
                            "Te queda 1 ficha sin repartir. Si enviás ahora, no vas a poder usarla después.",
                          )
                        : translate(
                            locale,
                            "Te quedan {{count}} fichas sin repartir. Si enviás ahora, no vas a poder usarlas después.",
                            { count: leftTokens },
                          )}
                    </p>
                  )}
                  <label class="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="confirm_final"
                      value="on"
                      required
                      class="mt-0.5 size-5 shrink-0 accent-brand-600"
                    />
                    <span>
                      {translate(
                        locale,
                        "Entiendo que el reparto es definitivo: después no se puede ver ni cambiar.",
                      )}
                    </span>
                  </label>
                  <SubmitButton
                    pending={vote.isRunning}
                    disabled={invalidAllocation}
                    aria-describedby={
                      invalidAllocation ? "reparto-invalido" : undefined
                    }
                  >
                    {translate(locale, "Enviar reparto (definitivo)")}
                  </SubmitButton>
                  {invalidAllocation && (
                    <p
                      id="reparto-invalido"
                      role="status"
                      class="mt-2 text-xs font-medium text-danger"
                    >
                      {overPerProposal
                        ? translate(
                            locale,
                            "Ningún proyecto puede llevar más de {{max}} fichas.",
                            { max: budget.max_tokens_per_proposal },
                          )
                        : usedTokens === 0
                          ? translate(locale, "Repartí al menos una ficha.")
                          : translate(
                              locale,
                              "Sacá fichas de algún proyecto: no podés repartir más de {{total}}.",
                              { total: budget.tokens_per_voter },
                            )}
                    </p>
                  )}
                </div>
              </Form>
            )}
        </Card>
      )}

      {/* ------------------------------------------------------ Postulación */}
      {phase === "intake" && (
        <Card class="mt-6 p-5">
          <h3 class="font-semibold">
            {translate(locale, "Postular un proyecto")}
          </h3>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Podés postular proyectos tuyos de esta comunidad. Después pasan por una evaluación de viabilidad antes de entrar a la votación.",
            )}
          </p>

          {propose.value?.message && (
            <Alert class="mt-4">
              {translate(locale, propose.value.message)}
            </Alert>
          )}
          {propose.value?.proposed && (
            <Alert tone="success" class="mt-4">
              {translate(locale, "Postulamos tu proyecto a esta partida.")}
            </Alert>
          )}

          {!isAuthenticated ? (
            <Alert tone="brand" class="mt-4">
              {translate(locale, "Ingresá para postular un proyecto.")}
            </Alert>
          ) : loadFailures.projects ||
            loadFailures.proposals ? null : proposableProjects.length === 0 ? (
            <p class="mt-4 text-sm text-ink-muted">
              {translate(
                locale,
                "No tenés proyectos en esta comunidad sin postular. Creá uno desde la pestaña Proyectos.",
              )}
            </p>
          ) : (
            <Form
              action={propose}
              class="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            >
              <input type="hidden" name="budget_id" value={budget.id} />
              <Field name="project_id" label="Proyecto">
                <Select
                  name="project_id"
                  required
                  onChange$={(_, el) => (proposalProjectId.value = el.value)}
                >
                  {proposableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                name="requested_amount"
                label="Monto solicitado"
                hint="Queda fijo aunque después cambie el presupuesto del proyecto."
              >
                {/* `key` remonta el campo al cambiar de proyecto: antes el monto
                    quedaba precargado con el del primero aunque se eligiera
                    otro, y se postulaba con un presupuesto ajeno. */}
                <Input
                  key={proposalProjectId.value || "primero"}
                  name="requested_amount"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="any"
                  required
                  value={
                    (
                      proposableProjects.find(
                        (project) => project.id === proposalProjectId.value,
                      ) ?? proposableProjects[0]
                    )?.budget_amount ?? undefined
                  }
                />
              </Field>
              <SubmitButton pending={propose.isRunning} class="sm:mb-0.5">
                {translate(locale, "Postular")}
              </SubmitButton>
            </Form>
          )}
        </Card>
      )}

      {/* --------------------------------------------- Postulaciones / vacío */}
      {phase !== "closed" && admittedCount === 0 && (
        <div class="mt-6">
          <EmptyState
            emoji="📋"
            title="Todavía no hay proyectos admitidos"
            description="Los proyectos de esta comunidad se postulan durante la fase de postulaciones y pasan por una evaluación de viabilidad antes de entrar a la votación."
          />
        </div>
      )}

      {/* ------------------------------------------------------- Resultado */}
      {phase === "closed" && (
        <section class="mt-6" aria-labelledby="resultado-titulo">
          <h3 id="resultado-titulo" class="text-lg font-semibold">
            {translate(locale, "Resultado del reparto")}
          </h3>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Se asigna en orden de fichas hasta agotar la partida. Un proyecto que no entra por monto se saltea y sigue el próximo.",
            )}
          </p>

          {results.length === 0 ? (
            loadFailures.results || loadFailures.proposals ? null : (
              <div class="mt-4">
                <EmptyState
                  emoji="🗳️"
                  title={
                    admittedCount === 0
                      ? "Esta ronda cerró sin proyectos admitidos"
                      : "Sin resultados por baja participación"
                  }
                  description={
                    admittedCount === 0
                      ? "No hubo nada que repartir."
                      : "Los resultados requieren al menos 5 participantes. Si hubo menos, no mostramos el número exacto ni el reparto."
                  }
                />
              </div>
            )
          ) : (
            <ol class="mt-4 space-y-2">
              {results.map((row, i) => {
                const report =
                  row.awarded && !loadFailures.reports
                    ? reportState(
                        reportedProjectIds.includes(row.project_id),
                        budget.report_due_at,
                      )
                    : null;
                return (
                  <li key={row.proposal_id}>
                    <Card
                      class={cx(
                        "flex flex-wrap items-center gap-3 p-4",
                        row.awarded
                          ? "border-success-500/40"
                          : "border-subtle opacity-75",
                      )}
                    >
                      <span class="w-6 shrink-0 text-sm tabular-nums text-ink-faint">
                        {i + 1}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="font-medium text-ink-strong">
                          {row.project_title}
                        </p>
                        <p class="mt-0.5 text-xs text-ink-muted">
                          {translate(
                            locale,
                            "{{tokens}} fichas · {{voters}} personas · pidió {{amount}}",
                            {
                              tokens: row.tokens,
                              voters: row.voters,
                              amount: money(Number(row.requested_amount)),
                            },
                          )}
                        </p>
                      </div>

                      <div class="flex shrink-0 flex-wrap items-center gap-2">
                        {row.awarded ? (
                          <Badge tone="success">
                            {translate(locale, "Financiado · {{amount}}", {
                              amount: money(Number(row.awarded_amount)),
                            })}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            {translate(locale, "Sin partida")}
                          </Badge>
                        )}

                        {/* Rendición: espejo del reloj del reclamo (D58). */}
                        {report?.state === "reported" && (
                          <Badge tone="success">
                            {translate(locale, "Rendido")}
                          </Badge>
                        )}
                        {report?.state === "pending" && (
                          <Badge tone="neutral">
                            {translate(locale, "Rinde en {{count}} días", {
                              count: report.days,
                            })}
                          </Badge>
                        )}
                        {report?.state === "overdue" && (
                          <Badge tone="warn">
                            {report.days === 1
                              ? translate(locale, "Sin rendir hace 1 día")
                              : translate(
                                  locale,
                                  "Sin rendir hace {{count}} días",
                                  { count: report.days },
                                )}
                          </Badge>
                        )}
                      </div>

                      {/* La rendición sólo la ve —y sólo la puede cargar— quien
                          creó el proyecto financiado. Va acá y no en otra
                          página porque es donde está el dato que rinde. */}
                      {row.awarded &&
                        !loadFailures.reports &&
                        !loadFailures.projects &&
                        report?.state !== "reported" &&
                        myProjectIds.includes(row.project_id) && (
                          <details class="w-full border-t border-subtle pt-3">
                            <summary class="cursor-pointer text-sm font-medium text-brand">
                              {translate(locale, "Publicar la rendición")}
                            </summary>
                            <Form
                              action={submitReport}
                              class="mt-3 grid gap-3 sm:grid-cols-2"
                            >
                              <input
                                type="hidden"
                                name="budget_id"
                                value={budget.id}
                              />
                              <input
                                type="hidden"
                                name="project_id"
                                value={row.project_id}
                              />
                              {/* El `Field` ya nombraba distinto a cada fila,
                                  pero el control seguía tomando su `id` del
                                  `name`: los `<label for="amount_spent-…">`
                                  apuntaban a un id inexistente y los campos de
                                  todas las filas compartían el mismo. Tocar la
                                  etiqueta no enfocaba nada y el lector de
                                  pantalla leía tres campos sin nombre. */}
                              <Field
                                name={`amount_spent-${row.project_id}`}
                                label="Monto ejecutado"
                              >
                                <Input
                                  name="amount_spent"
                                  id={`amount_spent-${row.project_id}`}
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  required
                                />
                              </Field>
                              <Field
                                name={`evidence_url-${row.project_id}`}
                                label="Comprobante o informe"
                              >
                                <Input
                                  name="evidence_url"
                                  id={`evidence_url-${row.project_id}`}
                                  type="url"
                                  inputMode="url"
                                  placeholder="https://…"
                                />
                              </Field>
                              <Field
                                name={`summary-${row.project_id}`}
                                label="En qué se gastó"
                                hint="Mínimo 20 caracteres."
                                class="sm:col-span-2"
                              >
                                <Textarea
                                  name="summary"
                                  id={`summary-${row.project_id}`}
                                  rows={3}
                                  required
                                />
                              </Field>
                              <SubmitButton
                                pending={submitReport.isRunning}
                                class="sm:col-span-2 sm:justify-self-start"
                              >
                                {translate(locale, "Publicar rendición")}
                              </SubmitButton>
                            </Form>
                          </details>
                        )}
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}

          {submitReport.value?.message && (
            <Alert class="mt-4">
              {translate(locale, submitReport.value.message)}
            </Alert>
          )}
          {submitReport.value?.reported && (
            <Alert tone="success" class="mt-4">
              {translate(locale, "Publicamos tu rendición.")}
            </Alert>
          )}

          {/* Libro de Rendición de Cuentas y Obras Ganadoras */}
          <BudgetAccountabilityLedger
            budgetId={budget.id}
            budgetTitle={budget.title}
            currency={budget.currency}
            totalPartida={Number(budget.amount)}
            results={results}
            communityName={community.name}
          />

          <p class="mt-4 rounded-2xl bg-muted px-4 py-3 text-xs text-ink-muted">
            <span aria-hidden="true">ℹ️</span>{" "}
            {translate(
              locale,
              "Agorbis registra la decisión y la rendición, no administra los fondos. La transferencia ocurre fuera de la plataforma.",
            )}
          </p>
        </section>
      )}

      <p class="mt-6 text-xs text-ink-faint">
        {translate(locale, "Ronda creada")}{" "}
        <RelativeTime value={budget.created_at} /> · {ctx.value.community.name}
      </p>
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  const name = ctx?.community.name ?? "";
  return {
    title: `${translate(locale, "Presupuesto participativo")} · ${name} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Cómo reparte {{community}} su partida entre proyectos, votado por quienes viven ahí.",
          { community: name },
        ),
      },
    ],
  };
};
