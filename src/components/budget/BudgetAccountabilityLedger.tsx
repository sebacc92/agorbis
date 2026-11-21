import { $, component$, useSignal } from "@qwik.dev/core";
import { Card, triggerHapticFeedback } from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { playCivicSound } from "~/lib/audio-feedback";
import { translate, useLocale } from "~/lib/i18n";
import type { BudgetResultRow } from "~/lib/budget";
import { currentPageUrl, shareNativeOrWhatsApp } from "~/lib/share";

export const BudgetAccountabilityLedger = component$<{
  budgetId: string;
  budgetTitle: string;
  currency: string;
  totalPartida: number;
  results: BudgetResultRow[];
  communityName: string;
}>(({ budgetTitle, currency, totalPartida, results, communityName }) => {
  const locale = useLocale();
  const isOpen = useSignal(true);

  const awardedResults = results.filter((r) => r.awarded);
  const totalAwarded = awardedResults.reduce(
    (acc, r) => acc + Number(r.awarded_amount ?? r.requested_amount),
    0,
  );

  // Sólo se muestra lo que salió del escrutinio. El "testimonio de obra" que
  // había acá vivía en localStorage y decía quedar "registrado en la
  // rendición comunitaria" sin que nadie más pudiera verlo: se retiró hasta
  // que exista una tabla con RLS que lo respalde.

  const handleShareLedger = $(() => {
    playCivicSound("click");
    triggerHapticFeedback("light");
    const currentUrl = currentPageUrl();
    const text = translate(
      locale,
      "📊 Rendición de Cuentas del Presupuesto Participativo en {{community}} ({{title}}). Partida asignada: ${{total}} a {{count}} proyectos. Mirá el balance vecinal: {{url}}",
      {
        community: communityName,
        title: budgetTitle,
        total: totalAwarded.toLocaleString(),
        count: awardedResults.length,
        url: currentUrl,
      },
    );

    const channel = shareNativeOrWhatsApp({
      title: budgetTitle,
      text,
      url: currentUrl,
    });
    if (channel === "whatsapp") {
      showToast(
        translate(locale, "Balance listo para compartir por WhatsApp"),
        "success",
      );
    }
  });

  if (awardedResults.length === 0) return null;

  return (
    <Card class="mt-6 border-2 border-success-500/20 bg-surface shadow-soft overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Encabezado colapsable */}
      <div class="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-subtle/60 bg-gradient-to-r from-success-500/10 via-surface to-surface">
        <div class="flex items-center gap-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-success-500/20 text-xl text-success-700 dark:text-success-300">
            📊
          </span>
          <div>
            {/* Sólo muestra el resultado del escrutinio: Agorbis no sigue ni
                  certifica qué pasó después con el dinero. */}
            <h3 class="text-base font-bold text-ink-strong">
              {translate(locale, "Libro de Rendición de Cuentas y Obras")}
            </h3>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick$={handleShareLedger}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-subtle/80 bg-surface text-xs font-semibold text-ink-strong hover:bg-muted hover:-translate-y-0.5 active:scale-95 touch-manipulation transition-all duration-150 cursor-pointer"
          >
            <span>📲</span>
            <span>{translate(locale, "Difundir rendición")}</span>
          </button>

          <button
            type="button"
            onClick$={() => {
              isOpen.value = !isOpen.value;
              playCivicSound("toggle");
              triggerHapticFeedback("selection");
            }}
            class="p-2 rounded-xl text-xs text-ink-muted hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation transition-all duration-150 cursor-pointer"
            aria-label={
              isOpen.value
                ? translate(locale, "Colapsar")
                : translate(locale, "Expandir")
            }
          >
            <span
              class={`inline-block transition-transform duration-200 transform ${
                isOpen.value ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </button>
        </div>
      </div>

      {isOpen.value && (
        <div class="p-5 sm:p-6 space-y-5 animate-fade-in">
          {/* Métricas clave de rendición */}
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div class="p-3.5 rounded-2xl bg-muted border border-subtle/40 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs hover:border-success-500/30">
              <span class="text-xs text-ink-muted block">
                {translate(locale, "Partida total")}
              </span>
              <span class="text-base sm:text-lg font-bold tabular-nums text-ink-strong">
                {currency} {totalPartida.toLocaleString()}
              </span>
            </div>
            <div class="p-3.5 rounded-2xl bg-muted border border-subtle/40 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs hover:border-success-500/30">
              <span class="text-xs text-ink-muted block">
                {translate(locale, "Asignado a obras")}
              </span>
              <span class="text-base sm:text-lg font-bold tabular-nums text-success-600 dark:text-success-400">
                {currency} {totalAwarded.toLocaleString()}
              </span>
            </div>
            <div class="p-3.5 rounded-2xl bg-muted border border-subtle/40 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs hover:border-success-500/30">
              <span class="text-xs text-ink-muted block">
                {translate(locale, "Proyectos ganadores")}
              </span>
              <span class="text-base sm:text-lg font-bold tabular-nums text-ink-strong">
                {awardedResults.length} {translate(locale, "obras")}
              </span>
            </div>
          </div>

          {/* Listado de proyectos ganadores */}
          <div class="space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-ink-faint">
              {translate(locale, "Proyectos ganadores")}
            </h4>

            {awardedResults.map((item, index) => {
              return (
                <div
                  key={item.proposal_id}
                  class="p-4 rounded-2xl border border-subtle/70 bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs hover:border-success-500/40"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-success-500/10 text-success-700 dark:text-success-300 text-xs font-bold shrink-0 tabular-nums">
                        {index + 1}
                      </span>
                      <h5 class="text-sm font-bold text-ink-strong truncate">
                        {item.project_title}
                      </h5>
                    </div>

                    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>
                        {translate(locale, "Asignado a obras")}:{" "}
                        <strong class="text-ink-strong tabular-nums">
                          {currency}{" "}
                          {Number(
                            item.awarded_amount ?? item.requested_amount,
                          ).toLocaleString()}
                        </strong>
                      </span>
                      <span>·</span>
                      <span class="tabular-nums">
                        {translate(locale, "{{tokens}} fichas comunitarias", {
                          tokens: item.tokens,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
});
