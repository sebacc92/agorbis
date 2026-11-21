import { $, component$, useSignal } from "@qwik.dev/core";
import { useLocation } from "@qwik.dev/router";
import {
  Badge,
  Button,
  Modal,
  showToast,
  triggerHapticFeedback,
} from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { APP_NAME } from "~/lib/constants";
import { formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { shareOnWhatsApp } from "~/lib/share";
import { communitySummaryText } from "~/lib/community-summary";

export interface CivicSummaryCardProps {
  communityName: string;
  communityEmoji?: string | null;
  communitySlug: string;
  memberCount: number;
  resolvedClaimsCount: number;
  openClaimsCount: number;
  participationCount: number;
}

export const CivicSummaryCardModal = component$<CivicSummaryCardProps>(
  ({
    communityName,
    communityEmoji,
    communitySlug,
    memberCount,
    resolvedClaimsCount,
    openClaimsCount,
    participationCount,
  }) => {
    const locale = useLocale();
    const isOpen = useSignal(false);
    const copied = useSignal(false);
    const emoji = communityEmoji || "🏛️";
    // El origen en el que se navega, no uno fijo: en preview o en local el
    // enlace compartido tiene que llevar al mismo sitio.
    const location = useLocation();

    const shareUrl = `${location.url.origin}/c/${communitySlug}`;
    const text = communitySummaryText(locale, {
      communityName,
      communityUrl: shareUrl,
      memberCount,
      resolvedClaimsCount,
      openClaimsCount,
      participationCount,
    });

    const copyCardInfo = $(async () => {
      copied.value = false;
      try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        triggerHapticFeedback("success");
        playCivicSound("click");
      } catch {
        showToast(translate(locale, "No se pudo copiar"), "danger");
      }
    });

    const shareSummary$ = $(() => {
      triggerHapticFeedback("selection");
      playCivicSound("click");
      shareOnWhatsApp(text);
    });

    return (
      <>
        <button
          type="button"
          onClick$={() => {
            triggerHapticFeedback("selection");
            playCivicSound("click");
            isOpen.value = true;
            copied.value = false;
          }}
          class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 text-xs font-semibold text-brand transition duration-150 hover:-translate-y-0.5 hover:bg-brand-500/20 active:scale-95 touch-manipulation"
          aria-label={translate(locale, "Generar tarjeta cívica para redes")}
        >
          <span aria-hidden="true">🪪</span>
          <span>{translate(locale, "Tarjeta cívica barrial")}</span>
        </button>

        {isOpen.value && (
          <Modal
            open={isOpen.value}
            onClose$={() => {
              isOpen.value = false;
            }}
            title={translate(locale, "Tarjeta de Vitalidad Cívica Barrial")}
          >
            <div class="space-y-4">
              <p class="text-xs text-ink-muted">
                {translate(
                  locale,
                  "Compartí el pulso cívico de tu barrio en redes sociales, historias o grupos comunitarios para convocar más vecinos.",
                )}
              </p>

              {/* Tarjeta Visual de Alta Fidelidad Cívica (Proporción Social) */}
              <div
                id="civic-summary-canvas"
                class="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-900 via-neutral-900 to-brand-950 p-6 text-white shadow-xl transition-all duration-300 hover:shadow-2xl"
              >
                {/* Glow decorativo de fondo */}
                <div
                  class="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-500/20 blur-3xl"
                  aria-hidden="true"
                />
                <div
                  class="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-success-500/20 blur-3xl"
                  aria-hidden="true"
                />

                {/* Encabezado de la Tarjeta */}
                <div class="relative z-10 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div class="flex items-center gap-3">
                    <span class="text-3xl sm:text-4xl" aria-hidden="true">
                      {emoji}
                    </span>
                    <div>
                      <Badge tone="brand">
                        {translate(locale, "Resumen de la comunidad")}
                      </Badge>
                      <h3 class="mt-1 text-lg font-black tracking-tight text-white sm:text-xl">
                        {communityName}
                      </h3>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="text-3xs font-bold uppercase tracking-widest text-brand-300">
                      {APP_NAME}
                    </span>
                    <p class="text-2xs font-medium text-neutral-300">
                      {translate(locale, "Democracia Vecinal")}
                    </p>
                  </div>
                </div>

                {/* Métricas Cívicas Cuadrícula */}
                <div class="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div class="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
                    <span class="text-xs font-semibold text-neutral-300">
                      🙋 {translate(locale, "Vecinos")}
                    </span>
                    <p class="mt-1 text-xl font-black tabular-nums text-white sm:text-2xl">
                      {formatNumber(memberCount, locale)}
                    </p>
                  </div>

                  <div class="rounded-2xl border border-success-500/30 bg-success-500/10 p-3 backdrop-blur-xs">
                    <span class="text-xs font-semibold text-success-300">
                      🏆 {translate(locale, "Victorias")}
                    </span>
                    <p class="mt-1 text-xl font-black tabular-nums text-success-200 sm:text-2xl">
                      {formatNumber(resolvedClaimsCount, locale)}
                    </p>
                  </div>

                  <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 backdrop-blur-xs">
                    <span class="text-xs font-semibold text-amber-300">
                      📣 {translate(locale, "Reclamos")}
                    </span>
                    <p class="mt-1 text-xl font-black tabular-nums text-amber-200 sm:text-2xl">
                      {formatNumber(openClaimsCount, locale)}
                    </p>
                  </div>

                  <div class="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
                    <span class="text-xs font-semibold text-neutral-300">
                      🗳️ {translate(locale, "Encuestas, debates y proyectos")}
                    </span>
                    <p class="mt-1 text-xl font-black tabular-nums text-white sm:text-2xl">
                      {formatNumber(participationCount, locale)}
                    </p>
                  </div>
                </div>

                {/* Footer de la Tarjeta */}
                <div class="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-neutral-300">
                  <span class="font-medium">
                    🌐 {`${location.url.host}/c/${communitySlug}`}
                  </span>
                  <span class="text-2xs text-neutral-400">
                    {translate(
                      locale,
                      "Participación ciudadana con contexto local",
                    )}
                  </span>
                </div>
              </div>

              <details class="rounded-xl border border-subtle p-3 text-xs">
                <summary class="cursor-pointer font-semibold">
                  {translate(locale, "Vista previa del mensaje")}
                </summary>
                <p class="mt-3 whitespace-pre-line break-words">{text}</p>
              </details>

              {/* Botones de Acción */}
              <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick$={copyCardInfo}
                  class="active:scale-95 touch-manipulation cursor-pointer duration-150 hover:-translate-y-0.5"
                >
                  {copied.value
                    ? translate(locale, "¡Copiado al portapapeles! ✓")
                    : translate(locale, "Copiar texto del balance")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick$={shareSummary$}
                  class="gap-1.5 active:scale-95 touch-manipulation cursor-pointer duration-150 hover:-translate-y-0.5"
                >
                  <span aria-hidden="true">📲</span>
                  <span>{translate(locale, "Compartir en WhatsApp")}</span>
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  },
);
