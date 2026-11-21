import { component$, useSignal, type QRL } from "@qwik.dev/core";
import { Badge, Card, cx, triggerHapticFeedback } from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { translate, useLocale } from "~/lib/i18n";

export interface AssertiveCivicToneAssistantProps {
  commentText: string;
  onSuggestionApplied$?: QRL<(newText: string) => void>;
}

export const AssertiveCivicToneAssistant =
  component$<AssertiveCivicToneAssistantProps>(
    ({ commentText, onSuggestionApplied$ }) => {
      const locale = useLocale();
      const isDismissed = useSignal(false);

      const confrontationalPhrases = [
        {
          pattern: /son todos unos/i,
          suggestion: translate(
            locale,
            "sugiero revisar la responsabilidad de",
          ),
        },
        {
          pattern: /es una vergüenza/i,
          suggestion: translate(
            locale,
            "me preocupa el impacto negativo de esta situación",
          ),
        },
        {
          pattern: /nadie hace nada/i,
          suggestion: translate(
            locale,
            "es necesario redoblar las acciones concretas para",
          ),
        },
        {
          pattern: /no tienen vergüenza/i,
          suggestion: translate(
            locale,
            "solicito mayor compromiso y celeridad a",
          ),
        },
        {
          pattern: /inútiles/i,
          suggestion: translate(
            locale,
            "con escasa efectividad hasta el momento",
          ),
        },
      ];

      const detected = confrontationalPhrases.find((p) =>
        p.pattern.test(commentText),
      );

      if (!detected || isDismissed.value || commentText.trim().length < 5) {
        return null;
      }

      return (
        <Card class="my-3 p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-surface to-surface border border-amber-500/35 text-xs shadow-soft animate-scale-pop backdrop-blur-xs transition-all duration-200 hover:shadow-md">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-2.5">
              <span class="text-xl shrink-0" aria-hidden="true">
                🕊️
              </span>
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-ink-strong">
                    {translate(
                      locale,
                      "Asistente de Tono Asertivo y Convivencia",
                    )}
                  </span>
                  <Badge tone="warn">
                    {translate(locale, "Recomendación")}
                  </Badge>
                </div>
                {/* Sin cifras de "consensos": no hay medición que las respalde. */}
                <div
                  class={cx(
                    "p-2.5 rounded-xl border border-amber-500/25 bg-surface/90 text-ink-strong font-medium shadow-2xs transition-all duration-150",
                    onSuggestionApplied$
                      ? "cursor-pointer hover:border-amber-500 hover:bg-amber-500/10 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.99] touch-manipulation"
                      : "",
                  )}
                  onClick$={async () => {
                    if (onSuggestionApplied$) {
                      playCivicSound("click");
                      triggerHapticFeedback("success");
                      await onSuggestionApplied$(detected.suggestion);
                    }
                  }}
                >
                  💡 {translate(locale, "Idea de reformulación sugerida:")}{" "}
                  <em class="text-amber-700 dark:text-amber-300 font-semibold">
                    {`"${detected.suggestion}"`}
                  </em>
                  {onSuggestionApplied$ && (
                    <span class="ml-2 inline-block text-3xs text-amber-600 dark:text-amber-400 font-normal">
                      ({translate(locale, "Tocar para aplicar")})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick$={() => {
                isDismissed.value = true;
                playCivicSound("toggle");
                triggerHapticFeedback("selection");
              }}
              class="cursor-pointer shrink-0 rounded-lg p-1.5 text-ink-faint transition-all duration-150 hover:bg-muted hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-90 touch-manipulation"
              aria-label={translate(locale, "Cerrar sugerencia")}
            >
              ✕
            </button>
          </div>
        </Card>
      );
    },
  );
