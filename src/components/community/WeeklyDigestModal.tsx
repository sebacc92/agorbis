import { $, component$, useSignal } from "@qwik.dev/core";
import {
  Button,
  Modal,
  showToast,
  triggerHapticFeedback,
} from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { useLocale, translate } from "~/lib/i18n";
import { shareOnWhatsApp } from "~/lib/share";
import { communitySummaryText } from "~/lib/community-summary";

export const WeeklyDigestModal = component$<{
  communityName: string;
  resolvedClaimsCount: number;
  openClaimsCount: number;
  actionsCount: number;
  communityUrl: string;
}>(
  ({
    communityName,
    resolvedClaimsCount,
    openClaimsCount,
    actionsCount,
    communityUrl,
  }) => {
    const locale = useLocale();
    const isOpen = useSignal(false);
    const copied = useSignal(false);

    const text = communitySummaryText(locale, {
      communityName,
      communityUrl,
      resolvedClaimsCount,
      openClaimsCount,
      participationCount: actionsCount,
    });

    const copyToClipboard = $(async () => {
      copied.value = false;
      try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        playCivicSound("click");
        triggerHapticFeedback("success");
      } catch {
        showToast(translate(locale, "No se pudo copiar"), "danger");
      }
    });

    const shareWhatsApp = $(() => {
      playCivicSound("celebrate");
      triggerHapticFeedback("selection");
      shareOnWhatsApp(text);
    });

    return (
      <>
        <button
          type="button"
          onClick$={() => {
            playCivicSound("toggle");
            triggerHapticFeedback("selection");
            isOpen.value = true;
            copied.value = false;
          }}
          class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-success-500/40 bg-success-500/10 px-3 text-xs font-semibold text-success-700 transition-all duration-150 hover:-translate-y-0.5 hover:bg-success-500/20 active:scale-95 touch-manipulation dark:text-success-300"
        >
          <span aria-hidden="true">📢</span>
          <span>{translate(locale, "Resumen Barrial para WhatsApp")}</span>
        </button>

        {isOpen.value && (
          <Modal
            open={isOpen.value}
            onClose$={() => {
              isOpen.value = false;
            }}
            title={translate(locale, "Resumen Barrial para WhatsApp")}
          >
            <div class="space-y-4">
              <p class="text-xs text-ink-muted">
                {translate(
                  locale,
                  "Copiá o compartí este mensaje en el grupo de WhatsApp de tu cuadra o consorcio para mantener a todos los vecinos al tanto de los avances:",
                )}
              </p>

              <div class="rounded-xl border border-control bg-muted/40 p-3.5 font-mono text-xs whitespace-pre-line text-ink-strong tabular-nums">
                {text}
              </div>

              <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  class="active:scale-95 touch-manipulation cursor-pointer duration-150 hover:-translate-y-0.5"
                  onClick$={copyToClipboard}
                >
                  {copied.value
                    ? translate(locale, "¡Copiado! ✓")
                    : translate(locale, "Copiar texto")}
                </Button>

                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  class="active:scale-95 touch-manipulation cursor-pointer duration-150 hover:-translate-y-0.5"
                  onClick$={shareWhatsApp}
                >
                  <span aria-hidden="true">📲</span>
                  <span>{translate(locale, "Enviar por WhatsApp")}</span>
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  },
);
