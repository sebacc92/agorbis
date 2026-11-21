import { $, component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { cx, triggerHapticFeedback } from "~/components/ui";
import { useLocale, translate } from "~/lib/i18n";
import { readStoredItem, writeStoredItem } from "~/lib/browser-storage";

export const CivicTour = component$<{
  communityName: string;
}>(({ communityName }) => {
  const currentStep = useSignal(0);
  const isDismissed = useSignal(true); // default true until visibleTask checks storage
  const locale = useLocale();

  // eslint-disable-next-line qwik/no-use-visible-task -- si el recorrido ya se vio está en localStorage, que sólo existe en el navegador
  useVisibleTask$(() => {
    const seen = readStoredItem("agorbis-civic-tour-seen");
    if (!seen) {
      isDismissed.value = false;
    }
  });

  const dismiss = $(() => {
    triggerHapticFeedback("medium");
    isDismissed.value = true;
    writeStoredItem("agorbis-civic-tour-seen", "true");
  });

  const nextStep = $(() => {
    triggerHapticFeedback("selection");
    if (currentStep.value < 2) {
      currentStep.value += 1;
    } else {
      dismiss();
    }
  });

  const prevStep = $(() => {
    triggerHapticFeedback("selection");
    if (currentStep.value > 0) {
      currentStep.value -= 1;
    }
  });

  if (isDismissed.value) return null;

  const steps = [
    {
      emoji: "📣",
      title: translate(locale, "Reclamos de {{community}}", {
        community: communityName,
      }),
      body: translate(
        locale,
        "Reportá problemas de tu cuadra con fotos y ubicación, reuní apoyos de quienes también están afectados y seguí cada respuesta.",
      ),
      tag: "1 / 3",
    },
    {
      emoji: "🗳️",
      title: translate(locale, "Encuestas de {{community}}", {
        community: communityName,
      }),
      body: translate(
        locale,
        "Participá en encuestas territoriales. Tu voto es secreto y los resultados se consolidan al cierre.",
      ),
      tag: "2 / 3",
    },
    {
      emoji: "💬",
      title: translate(locale, "Debates de {{community}}", {
        community: communityName,
      }),
      body: translate(
        locale,
        "Intercambiá perspectivas organizadas por columnas entre cada una de las sub-comunidades vecinas.",
      ),
      tag: "3 / 3",
    },
  ];

  const active = steps[currentStep.value];

  return (
    <div
      role="region"
      aria-label={translate(locale, "Guía rápida de participación ciudadana")}
      class="mb-6 overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-surface to-surface p-5 shadow-soft transition-all dark:border-brand-500/25 dark:from-brand-950/40"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <span
            aria-hidden="true"
            class="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-600/15 text-2xl shadow-xs"
          >
            {active.emoji}
          </span>
          <div>
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-brand-600/10 px-2 py-0.5 text-3xs font-bold text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                {translate(locale, "Paso {{current}} de {{total}}", {
                  current: currentStep.value + 1,
                  total: 3,
                })}
              </span>
              <span class="text-xs font-semibold text-ink-muted">
                {translate(locale, "Guía rápida de participación ciudadana")}
              </span>
            </div>
            <h3 class="mt-0.5 text-base font-bold text-ink-strong">
              {active.title}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick$={dismiss}
          aria-label={translate(locale, "Saltar guía")}
          class="rounded-xl p-1.5 text-ink-faint transition-colors hover:bg-muted hover:text-ink-strong"
        >
          ✕
        </button>
      </div>

      <p class="mt-3 text-sm leading-relaxed text-ink-muted">{active.body}</p>

      {/* Barra de progreso y botones de navegación */}
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-3">
        {/* Indicadores de paso interactivos */}
        <div
          class="flex items-center gap-1.5"
          role="tablist"
          aria-label={translate(locale, "Pasos del tour")}
        >
          {[0, 1, 2].map((idx) => (
            <button
              key={`step-dot-${idx}`}
              type="button"
              role="tab"
              aria-selected={currentStep.value === idx}
              aria-label={translate(locale, "Ir al paso {{step}}", {
                step: idx + 1,
              })}
              onClick$={() => {
                triggerHapticFeedback("selection");
                currentStep.value = idx;
              }}
              class={cx(
                "h-2 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                currentStep.value === idx
                  ? "w-7 bg-brand-600 ring-2 ring-brand-500/30 dark:bg-brand-400"
                  : "w-2.5 bg-subtle hover:bg-ink-faint/40 active:scale-95",
              )}
            />
          ))}
        </div>

        <div class="flex items-center gap-2">
          {currentStep.value > 0 && (
            <button
              type="button"
              onClick$={prevStep}
              class="rounded-xl border border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted transition-all hover:border-strong hover:text-ink-strong active:scale-95 touch-manipulation"
            >
              {translate(locale, "Anterior")}
            </button>
          )}

          <button
            type="button"
            onClick$={nextStep}
            class="rounded-xl bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-soft transition-all hover:bg-brand-700 active:scale-95 touch-manipulation dark:bg-brand-600"
          >
            {currentStep.value === 2
              ? translate(locale, "Entendido")
              : translate(locale, "Siguiente")}
          </button>
        </div>
      </div>
    </div>
  );
});
