import { $, component$, useId, useSignal } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import {
  Icon,
  Badge,
  cx,
  DialogFrame,
  triggerHapticFeedback,
} from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { formatMoney } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export interface ProposalComparisonItem {
  id: string;
  projectId: string;
  projectTitle: string | null;
  projectSummary?: string | null;
  projectTimeEstimate?: string | null;
  projectResourcesNeeded?: string | null;
  requestedAmount: number;
  admittedAt?: string | null;
}

export const ProposalComparisonModal = component$<{
  proposals: ProposalComparisonItem[];
  currency: string;
  totalBudget: number;
}>(({ proposals, currency, totalBudget }) => {
  const locale = useLocale();
  const isOpen = useSignal(false);
  const admittedProposals = proposals.filter((p) => p.admittedAt);

  // Seleccionamos inicialmente las primeras 2 o 3 admitidas
  const selectedIds = useSignal<string[]>(
    admittedProposals.slice(0, 3).map((p) => p.id),
  );

  // Escape, foco atrapado y bloqueo de scroll los resuelve `DialogFrame`.
  const titleId = useId();

  const toggleProposal = $((id: string) => {
    triggerHapticFeedback("selection");
    playCivicSound("toggle");
    if (selectedIds.value.includes(id)) {
      if (selectedIds.value.length > 1) {
        selectedIds.value = selectedIds.value.filter((item) => item !== id);
      }
    } else {
      if (selectedIds.value.length < 3) {
        selectedIds.value = [...selectedIds.value, id];
      } else {
        // Reemplazar la primera si ya hay 3
        selectedIds.value = [...selectedIds.value.slice(1), id];
      }
    }
  });

  const compared = admittedProposals.filter((p) =>
    selectedIds.value.includes(p.id),
  );

  if (admittedProposals.length < 2) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick$={() => {
          triggerHapticFeedback("selection");
          playCivicSound("click");
          isOpen.value = true;
        }}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-subtle bg-surface px-3 py-1 text-xs font-semibold text-ink-strong shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-500 hover:bg-muted active:scale-95 touch-manipulation"
        aria-label={translate(locale, "Comparar propuestas de presupuesto")}
      >
        <span aria-hidden="true">⚖️</span>
        <span>{translate(locale, "Comparar proyectos")}</span>
      </button>

      {isOpen.value && (
        <DialogFrame
          onClose$={() => {
            isOpen.value = false;
          }}
          labelledBy={titleId}
          backdropClass="backdrop:bg-neutral-950/70 backdrop:backdrop-blur-sm"
          class="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-hidden rounded-3xl border border-subtle bg-surface text-ink shadow-2xl animate-scale-pop open:flex open:flex-col sm:w-[calc(100vw-3rem)]"
        >
          {/* Modal Header */}
          <div class="flex shrink-0 items-center justify-between border-b border-subtle bg-surface/95 px-5 py-4 backdrop-blur-md">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl" aria-hidden="true">
                ⚖️
              </span>
              <div>
                <h2
                  id={titleId}
                  class="text-base font-bold text-ink-strong sm:text-lg"
                >
                  {translate(locale, "Comparador de proyectos vecinales")}
                </h2>
                <p class="text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Elegí hasta 3 proyectos para comparar costos y viabilidad antes de votar.",
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick$={() => (isOpen.value = false)}
              class="rounded-full p-2 text-ink-muted transition-colors duration-150 hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation cursor-pointer"
              aria-label={translate(locale, "Cerrar comparador")}
            >
              <Icon name="x" class="text-base" />
            </button>
          </div>

          {/* Selector de proyectos a comparar */}
          <div class="scrollbar-slim flex shrink-0 items-center gap-2 overflow-x-auto border-b border-subtle bg-muted/40 px-5 py-2.5">
            <span class="text-xs font-semibold text-ink-muted shrink-0">
              {translate(locale, "Seleccionar:")}
            </span>
            {admittedProposals.map((proposal) => {
              const isSelected = selectedIds.value.includes(proposal.id);
              return (
                <button
                  key={proposal.id}
                  type="button"
                  onClick$={() => toggleProposal(proposal.id)}
                  class={cx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 hover:-translate-y-0.5 active:scale-95 touch-manipulation cursor-pointer",
                    isSelected
                      ? "border-brand-500 bg-brand-600 text-white shadow-soft font-semibold"
                      : "border-subtle bg-surface text-ink-muted hover:border-strong",
                  )}
                >
                  {isSelected ? <Icon name="check" /> : <Icon name="plus" />}
                  <span class="max-w-40 truncate">
                    {proposal.projectTitle ??
                      translate(locale, "Proyecto sin título")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Grid de Comparación Split-View */}
          <div class="scrollbar-slim overflow-y-auto p-5">
            <div
              class={cx(
                "grid gap-4",
                compared.length === 1
                  ? "grid-cols-1"
                  : compared.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {compared.map((proposal) => {
                const pct =
                  totalBudget > 0
                    ? ((proposal.requestedAmount / totalBudget) * 100).toFixed(
                        1,
                      )
                    : "0";

                return (
                  <div
                    key={proposal.id}
                    class="flex flex-col justify-between rounded-2xl border border-subtle bg-surface p-4 shadow-xs transition-all duration-200 hover:shadow-soft hover:-translate-y-0.5"
                  >
                    <div>
                      {/* Header de la tarjeta */}
                      <div class="flex items-center justify-between gap-2">
                        <Badge tone="brand">
                          {translate(locale, "Proyecto")}
                        </Badge>
                        <span class="text-xs font-semibold text-brand tabular-nums">
                          {pct}% {translate(locale, "del pozo")}
                        </span>
                      </div>

                      <h3 class="mt-2.5 text-base font-bold text-ink-strong">
                        <Link
                          href={`/proyectos/${proposal.projectId}`}
                          class="hover:text-brand hover:underline active:scale-95 touch-manipulation inline-block transition-transform"
                        >
                          {proposal.projectTitle ??
                            translate(locale, "Sin título")}
                        </Link>
                      </h3>

                      {/* Presupuesto solicitado con barra de comparación */}
                      <div class="mt-3 rounded-xl border border-subtle bg-muted/40 p-3">
                        <div class="flex items-center justify-between">
                          <span class="text-2xs font-semibold uppercase text-ink-faint">
                            {translate(locale, "Monto solicitado")}
                          </span>
                          <span class="text-2xs font-bold text-brand">
                            {pct}% {translate(locale, "del total")}
                          </span>
                        </div>
                        <p class="mt-0.5 text-lg font-black tabular-nums text-ink-strong">
                          {formatMoney(
                            proposal.requestedAmount,
                            currency,
                            locale,
                          )}
                        </p>
                        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-subtle">
                          <div
                            class="h-full rounded-full bg-brand-500 transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(4, Number(pct)))}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Resumen */}
                      <div class="mt-3">
                        <span class="text-2xs font-semibold uppercase text-ink-faint">
                          {translate(locale, "Propósito del proyecto")}
                        </span>
                        <p class="mt-1 text-xs text-ink-muted leading-relaxed">
                          {proposal.projectSummary ||
                            translate(
                              locale,
                              "No se especificó un resumen para este proyecto.",
                            )}
                        </p>
                      </div>

                      {/* Tiempo estimado */}
                      {proposal.projectTimeEstimate && (
                        <div class="mt-3">
                          <span class="text-2xs font-semibold uppercase text-ink-faint">
                            {translate(locale, "Plazo estimado")}
                          </span>
                          <p class="mt-0.5 text-xs font-medium text-ink-strong">
                            ⏱️ {proposal.projectTimeEstimate}
                          </p>
                        </div>
                      )}

                      {/* Recursos requeridos */}
                      {proposal.projectResourcesNeeded && (
                        <div class="mt-3">
                          <span class="text-2xs font-semibold uppercase text-ink-faint">
                            {translate(locale, "Recursos y aportes necesarios")}
                          </span>
                          <p class="mt-0.5 text-xs text-ink-muted">
                            🛠️ {proposal.projectResourcesNeeded}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer de la tarjeta */}
                    <div class="mt-4 border-t border-subtle pt-3 text-right">
                      <Link
                        href={`/proyectos/${proposal.projectId}`}
                        class="inline-flex items-center text-xs font-semibold text-brand hover:underline"
                      >
                        {translate(locale, "Ver proyecto completo")}
                        <Icon name="arrow-right" class="ml-1" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogFrame>
      )}
    </>
  );
});
