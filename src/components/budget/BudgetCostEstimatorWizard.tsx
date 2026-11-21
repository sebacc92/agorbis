import { $, component$, useSignal, type QRL } from "@qwik.dev/core";
import { Badge, Card, Icon, cx, triggerHapticFeedback } from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { playCivicSound } from "~/lib/audio-feedback";
import { translate, useLocale } from "~/lib/i18n";

export interface BudgetCostEstimatorWizardProps {
  currency?: string;
  onApplyEstimates$?: QRL<(total: number, breakdownText: string) => void>;
}

export const BudgetCostEstimatorWizard =
  component$<BudgetCostEstimatorWizardProps>(
    ({ currency = "ARS", onApplyEstimates$ }) => {
      const locale = useLocale();
      const isOpen = useSignal(false);

      // Rubros del presupuesto
      const materialsCost = useSignal(150000);
      const laborCost = useSignal(90000);
      const logisticsCost = useSignal(35000);
      const contingencyPercent = useSignal(10); // 10% por defecto

      const subtotal =
        materialsCost.value + laborCost.value + logisticsCost.value;
      const contingencyCost = Math.round(
        subtotal * (contingencyPercent.value / 100),
      );
      const grandTotal = subtotal + contingencyCost;

      const handleApply = $(async () => {
        playCivicSound("celebrate");
        triggerHapticFeedback("success");

        const breakdown = translate(
          locale,
          "📋 Desglose Estimado de Costos y Viabilidad:\n- 🛠️ Materiales e insumos: {{currency}} {{materials}}\n- 👷 Mano de obra y coordinación: {{currency}} {{labor}}\n- 🚚 Flete y logística: {{currency}} {{logistics}}\n- 🛡️ Imprevistos y contingencia ({{percent}}%): {{currency}} {{contingency}}\n\nTotal estimado: {{currency}} {{total}}",
          {
            currency,
            materials: materialsCost.value.toLocaleString(),
            labor: laborCost.value.toLocaleString(),
            logistics: logisticsCost.value.toLocaleString(),
            percent: contingencyPercent.value,
            contingency: contingencyCost.toLocaleString(),
            total: grandTotal.toLocaleString(),
          },
        );

        // Si existe callback lo invocamos
        if (onApplyEstimates$) {
          await onApplyEstimates$(grandTotal, breakdown);
        }

        // Además, si estamos en el DOM intentamos volcar los datos a los inputs 'amount' y 'description'
        if (typeof document !== "undefined") {
          const amountInput = document.querySelector<HTMLInputElement>(
            'input[name="amount"]',
          );
          if (amountInput) {
            amountInput.value = grandTotal.toString();
            amountInput.dispatchEvent(new Event("input", { bubbles: true }));
          }

          const descTextarea = document.querySelector<HTMLTextAreaElement>(
            'textarea[name="description"]',
          );
          if (descTextarea) {
            const currentText = descTextarea.value.trim();
            descTextarea.value = currentText
              ? `${currentText}\n\n${breakdown}`
              : breakdown;
            descTextarea.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        showToast(
          translate(locale, "Estimación de costos aplicada al formulario"),
          "success",
        );
      });

      return (
        <Card class="border-2 border-brand-500/20 bg-surface shadow-soft overflow-hidden my-4 transition-all duration-200 hover:shadow-md">
          <button
            type="button"
            onClick$={() => {
              isOpen.value = !isOpen.value;
              playCivicSound("toggle");
              triggerHapticFeedback("selection");
            }}
            class="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-brand-500/10 via-surface to-surface text-left cursor-pointer active:scale-[0.99] touch-manipulation transition-all duration-200"
            aria-expanded={isOpen.value}
          >
            {/* Dentro de un <button> sólo va contenido de frase (D126): el
              título, la etiqueta y la descripción eran <h3>, <div> y <p>, y
              en desarrollo Qwik cortaba el servidor (Q12) al dibujar "Abrir
              una ronda". Los <span> en bloque se ven igual, salvo el del
              título: lo que global.css les da a los h3 (Manrope, el
              espaciado y el balanceo) un <span> no lo hereda, así que va en
              sus clases. */}
            <span class="flex items-center gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/20 text-xl text-brand">
                <Icon name="receipt" />
              </span>
              <span class="block">
                <span class="flex items-center gap-2">
                  <span class="block font-display text-sm sm:text-base font-bold tracking-[-0.02em] text-balance text-ink-strong">
                    {translate(
                      locale,
                      "Asistente Guiado de Costos y Viabilidad",
                    )}
                  </span>
                  <Badge tone="brand">{translate(locale, "Calculadora")}</Badge>
                </span>
                <span class="block text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Desglosá materiales, mano de obra, logística e imprevistos para una partida realista.",
                  )}
                </span>
              </span>
            </span>

            <Icon
              name="chevron-down"
              class={cx(
                "ml-2 text-base text-ink-faint transition-transform duration-200 motion-reduce:transition-none",
                isOpen.value && "rotate-180",
              )}
            />
          </button>

          {isOpen.value && (
            <div class="p-4 sm:p-6 space-y-5 border-t border-subtle/60 animate-fade-in">
              <div class="grid gap-4 sm:grid-cols-3">
                {/* Materiales */}
                <div class="space-y-1.5 p-3 rounded-2xl bg-muted border border-subtle/50 hover:border-brand-500/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs">
                  <label class="flex items-center gap-1.5 text-xs font-semibold text-ink-strong">
                    <Icon name="wrench" class="text-sm text-ink-muted" />
                    {translate(locale, "Materiales e Insumos")}
                  </label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
                      {currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={materialsCost.value}
                      onInput$={(e) => {
                        materialsCost.value = Math.max(
                          0,
                          Number((e.target as HTMLInputElement).value) || 0,
                        );
                      }}
                      class="w-full rounded-xl border border-control bg-surface py-1.5 pl-12 pr-3 text-xs font-mono font-medium text-ink-strong focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <span class="text-3xs text-ink-faint block">
                    {translate(locale, "Pintura, cemento, caños, luminarias")}
                  </span>
                </div>

                {/* Mano de Obra */}
                <div class="space-y-1.5 p-3 rounded-2xl bg-muted border border-subtle/50 hover:border-brand-500/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs">
                  <label class="flex items-center gap-1.5 text-xs font-semibold text-ink-strong">
                    <Icon name="users" class="text-sm text-ink-muted" />
                    {translate(locale, "Mano de Obra y Coordinación")}
                  </label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
                      {currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={laborCost.value}
                      onInput$={(e) => {
                        laborCost.value = Math.max(
                          0,
                          Number((e.target as HTMLInputElement).value) || 0,
                        );
                      }}
                      class="w-full rounded-xl border border-control bg-surface py-1.5 pl-12 pr-3 text-xs font-mono font-medium text-ink-strong focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <span class="text-3xs text-ink-faint block">
                    {translate(locale, "Jornales técnicos o especialistas")}
                  </span>
                </div>

                {/* Logística */}
                <div class="space-y-1.5 p-3 rounded-2xl bg-muted border border-subtle/50 hover:border-brand-500/30 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs">
                  <label class="flex items-center gap-1.5 text-xs font-semibold text-ink-strong">
                    <Icon name="truck" class="text-sm text-ink-muted" />
                    {translate(locale, "Flete y Logística")}
                  </label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">
                      {currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={logisticsCost.value}
                      onInput$={(e) => {
                        logisticsCost.value = Math.max(
                          0,
                          Number((e.target as HTMLInputElement).value) || 0,
                        );
                      }}
                      class="w-full rounded-xl border border-control bg-surface py-1.5 pl-12 pr-3 text-xs font-mono font-medium text-ink-strong focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  <span class="text-3xs text-ink-faint block">
                    {translate(locale, "Traslado de materiales y herramientas")}
                  </span>
                </div>
              </div>

              {/* Contingencia e Imprevistos */}
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
                <div class="flex items-center gap-2">
                  <Icon name="shield" class="text-lg" />
                  <div>
                    <span class="font-semibold text-ink-strong block">
                      {translate(
                        locale,
                        "Fondo de Imprevistos / Contingencia:",
                      )}
                    </span>
                    <span class="text-2xs text-ink-muted">
                      {translate(
                        locale,
                        "Recomendado para absorber inflación y desvíos técnicos.",
                      )}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  {[5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick$={() => {
                        contingencyPercent.value = pct;
                        playCivicSound("toggle");
                        triggerHapticFeedback("selection");
                      }}
                      class={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 hover:-translate-y-0.5 active:scale-95 touch-manipulation shadow-2xs ${
                        contingencyPercent.value === pct
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-surface border border-subtle/70 text-ink-muted hover:text-ink-strong"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <span class="font-mono text-xs font-bold text-amber-800 dark:text-amber-300 ml-2 tabular-nums">
                    + {currency} {contingencyCost.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Total Resumen y Botón de Aplicación */}
              <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-subtle/60">
                <div class="flex items-baseline gap-2">
                  <span class="text-xs text-ink-muted font-medium">
                    {translate(locale, "Presupuesto Total Calculado:")}
                  </span>
                  <span class="text-xl sm:text-2xl font-black text-brand tabular-nums">
                    {currency} {grandTotal.toLocaleString()}
                  </span>
                </div>

                <button
                  type="button"
                  onClick$={handleApply}
                  class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold shadow-soft hover:bg-brand-700 hover:-translate-y-0.5 active:scale-95 touch-manipulation transition-all duration-150 cursor-pointer"
                >
                  <span>
                    {translate(locale, "Aplicar desglose y monto total")}
                  </span>
                </button>
              </div>
            </div>
          )}
        </Card>
      );
    },
  );
