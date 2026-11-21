import { $, component$, useComputed$, useId, useSignal } from "@qwik.dev/core";
import {
  Button,
  cx,
  DialogFrame,
  triggerHapticFeedback,
} from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { formatMoney } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export interface SandboxProposal {
  id: string;
  projectTitle: string | null;
  requestedAmount: number;
}

export const BudgetSandboxSimulator = component$<{
  proposals: SandboxProposal[];
  currency: string;
  totalBudget: number;
  totalTokens?: number;
}>(({ proposals, currency, totalBudget, totalTokens = 10 }) => {
  const locale = useLocale();
  const isOpen = useSignal(false);
  const titleId = useId();

  // Fichas asignadas por proyecto
  const allocations = useSignal<Record<string, number>>({});

  const usedTokens = useComputed$(() =>
    Object.values(allocations.value).reduce((sum, v) => sum + v, 0),
  );

  const remainingTokens = useComputed$(() =>
    Math.max(0, totalTokens - usedTokens.value),
  );

  const estimatedSpend = useComputed$(() => {
    if (totalTokens <= 0) return 0;
    let total = 0;
    for (const p of proposals) {
      const assigned = allocations.value[p.id] || 0;
      if (assigned > 0) {
        total += (assigned / totalTokens) * totalBudget;
      }
    }
    return total;
  });

  const changeTokens = $((id: string, delta: number) => {
    triggerHapticFeedback("selection");
    playCivicSound("click");
    const current = allocations.value[id] || 0;
    const next = Math.max(0, current + delta);
    const newUsed = usedTokens.value - current + next;

    if (newUsed <= totalTokens) {
      allocations.value = {
        ...allocations.value,
        [id]: next,
      };
    }
  });

  const resetSandbox = $(() => {
    triggerHapticFeedback("selection");
    playCivicSound("reset");
    allocations.value = {};
  });

  if (proposals.length < 2) return null;

  return (
    <>
      <button
        type="button"
        onClick$={() => {
          triggerHapticFeedback("selection");
          playCivicSound("toggle");
          isOpen.value = true;
        }}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-subtle bg-surface px-3 py-1 text-xs font-semibold text-ink-strong shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-500 hover:bg-muted active:scale-95 touch-manipulation"
        aria-label={translate(locale, "Abrir simulador de reparto")}
      >
        <span aria-hidden="true">🧮</span>
        <span>{translate(locale, "Simulador de reparto")}</span>
      </button>

      {isOpen.value && (
        <DialogFrame
          onClose$={() => {
            isOpen.value = false;
          }}
          labelledBy={titleId}
          backdropClass="backdrop:bg-neutral-950/75 backdrop:backdrop-blur-sm"
          class="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-hidden animate-scale-pop rounded-3xl border border-subtle bg-surface text-ink shadow-2xl open:flex open:flex-col sm:w-[calc(100vw-3rem)]"
        >
          {/* Modal Header */}
          <div class="flex shrink-0 items-center justify-between border-b border-subtle bg-surface/95 px-5 py-4 backdrop-blur-md">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl" aria-hidden="true">
                🧮
              </span>
              <div>
                <h2
                  id={titleId}
                  class="text-base font-bold text-ink-strong sm:text-lg"
                >
                  {translate(locale, "Simulador Cívico de Presupuesto")}
                </h2>
                <p class="text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Probá combinaciones de fichas. La simulación no se guarda ni cuenta como voto.",
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick$={() => {
                playCivicSound("click");
                isOpen.value = false;
              }}
              class="cursor-pointer rounded-full p-2 text-ink-muted transition duration-150 hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation"
              aria-label={translate(locale, "Cerrar simulador")}
            >
              ✕
            </button>
          </div>

          {/* Panel de Estado y Fichas */}
          <div class="border-b border-subtle bg-muted/40 p-4 sm:p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span class="text-2xs font-bold uppercase tracking-wider text-ink-faint">
                  {translate(locale, "Fichas asignadas")}
                </span>
                <p class="text-2xl font-black text-ink-strong tabular-nums">
                  {usedTokens.value} / {totalTokens}
                </p>
              </div>
              <div class="text-right">
                <span class="text-2xs font-bold uppercase tracking-wider text-ink-faint">
                  {translate(locale, "Monto estimado simulado")}
                </span>
                <p class="text-lg font-black text-brand tabular-nums sm:text-xl">
                  {formatMoney(estimatedSpend.value, currency, locale)}
                </p>
              </div>
            </div>

            {/* Barra de Fichas */}
            <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-subtle">
              <div
                class={cx(
                  "h-full rounded-full transition-all duration-300",
                  remainingTokens.value === 0
                    ? "bg-success-500"
                    : "bg-brand-500",
                )}
                style={{
                  width: `${Math.min(100, (usedTokens.value / totalTokens) * 100)}%`,
                }}
              />
            </div>
            <div class="mt-1.5 flex items-center justify-between text-2xs text-ink-muted">
              <span>
                {remainingTokens.value === 0
                  ? translate(
                      locale,
                      "¡Reparto completo! Fichas 100% asignadas.",
                    )
                  : translate(
                      locale,
                      "Te quedan {{count}} fichas libres para simular.",
                      {
                        count: remainingTokens.value,
                      },
                    )}
              </span>
              {usedTokens.value > 0 && (
                <button
                  type="button"
                  onClick$={resetSandbox}
                  class="cursor-pointer font-semibold text-danger transition duration-150 hover:underline active:scale-95 touch-manipulation"
                >
                  {translate(locale, "Reiniciar simulador")}
                </button>
              )}
            </div>
          </div>

          {/* Lista de Proyectos */}
          <div class="scrollbar-slim flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {proposals.map((proposal) => {
              const assigned = allocations.value[proposal.id] || 0;
              return (
                <div
                  key={proposal.id}
                  class={cx(
                    "flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs",
                    assigned > 0
                      ? "border-brand-500/40 bg-brand-500/5 shadow-xs"
                      : "border-subtle bg-surface hover:border-strong",
                  )}
                >
                  <div class="min-w-0 flex-1">
                    <h4 class="text-xs font-bold text-ink-strong truncate sm:text-sm">
                      {proposal.projectTitle ??
                        translate(locale, "Proyecto sin título")}
                    </h4>
                    <p class="text-xs text-ink-muted">
                      {formatMoney(proposal.requestedAmount, currency, locale)}
                    </p>
                  </div>

                  {/* Controles de Fichas */}
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={assigned === 0}
                      onClick$={() => changeTokens(proposal.id, -1)}
                      class="touch-target flex size-8 cursor-pointer items-center justify-center rounded-full border border-subtle bg-surface text-sm font-bold text-ink-strong transition-all duration-150 hover:bg-muted active:scale-90 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={translate(locale, "Quitar ficha")}
                    >
                      -
                    </button>
                    <span class="w-6 text-center text-sm font-black tabular-nums text-ink-strong">
                      {assigned}
                    </span>
                    <button
                      type="button"
                      disabled={remainingTokens.value === 0}
                      onClick$={() => changeTokens(proposal.id, 1)}
                      class="touch-target flex size-8 cursor-pointer items-center justify-center rounded-full border border-subtle bg-surface text-sm font-bold text-ink-strong transition-all duration-150 hover:bg-muted active:scale-90 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={translate(locale, "Agregar ficha")}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div class="flex items-center justify-end border-t border-subtle bg-surface p-4">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick$={() => {
                playCivicSound("click");
                isOpen.value = false;
              }}
              class="active:scale-95 touch-manipulation cursor-pointer duration-150 hover:-translate-y-0.5"
            >
              {translate(locale, "Cerrar simulador")}
            </Button>
          </div>
        </DialogFrame>
      )}
    </>
  );
});
