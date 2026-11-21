import { $, component$, useSignal } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { Badge, Card, triggerHapticFeedback } from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { playCivicSound } from "~/lib/audio-feedback";
import { translate, useLocale } from "~/lib/i18n";

export interface CommunityPressKitCardProps {
  communityName: string;
  communitySlug: string;
  communityEmoji?: string | null;
}

export const CommunityPressKitCard = component$<CommunityPressKitCardProps>(
  ({ communityName, communitySlug, communityEmoji = "🏘️" }) => {
    const locale = useLocale();
    const isOpen = useSignal(false);
    const activeTab = useSignal<"social" | "flyer" | "signature">("social");
    // El origen en el que se navega, no uno fijo: en preview o en local el
    // enlace compartido tiene que llevar al mismo sitio.
    const location = useLocation();
    const communityPageUrl = `${location.url.origin}/c/${communitySlug}`;

    const invitation = translate(
      locale,
      "👋 ¡Hola vecinos de {{community}}! Ya estamos coordinando reclamos, votando encuestas y organizando asambleas vecinales en Agorbis. Sumate y hacé escuchar tu voz acá: {{url}}",
      { community: communityName, url: communityPageUrl },
    );
    const signature = translate(
      locale,
      "—\n{{community}} en Agorbis\nParticipación Vecinal y Control Ciudadano Transparente\n{{url}}",
      { community: communityName, url: communityPageUrl },
    );
    const copy = $(async (text: string, message: string) => {
      playCivicSound("click");
      try {
        await navigator.clipboard.writeText(text);
        triggerHapticFeedback("success");
        showToast(message, "success");
      } catch {
        triggerHapticFeedback("warning");
        showToast(
          translate(
            locale,
            "No pudimos copiar. Seleccioná el texto de la vista previa para copiarlo manualmente.",
          ),
          "danger",
        );
      }
    });
    const handleCopyWhatsappText = $(() =>
      copy(
        invitation,
        translate(locale, "Texto para WhatsApp copiado al portapapeles"),
      ),
    );
    const handleCopyEmailSignature = $(() =>
      copy(signature, translate(locale, "Firma digital de correo copiada")),
    );

    return (
      <Card class="mt-8 overflow-hidden border-2 border-brand-500/25 bg-surface shadow-soft transition-all duration-200 hover:shadow-md">
        <button
          type="button"
          onClick$={() => {
            isOpen.value = !isOpen.value;
            playCivicSound("toggle");
            triggerHapticFeedback("selection");
          }}
          class="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-brand-500/10 via-surface to-surface text-left cursor-pointer active:scale-[0.99] touch-manipulation transition-all duration-150"
          aria-expanded={isOpen.value}
        >
          <span class="flex items-center gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/20 text-xl text-brand">
              📢
            </span>
            <span>
              <span class="flex items-center gap-2">
                <span class="text-sm sm:text-base font-bold text-ink-strong">
                  {translate(locale, "Kit de Difusión y Recursos Vecinales")}
                </span>
                <Badge tone="brand">{translate(locale, "Difusión")}</Badge>
              </span>
              <span class="block text-xs text-ink-muted">
                {translate(
                  locale,
                  "Materiales listos para compartir en WhatsApp, afiches callejeros y firmas institucionales.",
                )}
              </span>
            </span>
          </span>

          <span
            class={`text-xs text-ink-faint transition-transform duration-200 ml-2 ${
              isOpen.value ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {isOpen.value && (
          <div class="p-4 sm:p-6 space-y-5 border-t border-subtle/60 animate-fade-in">
            {/* Pestañas de recursos */}
            <div class="flex gap-2 border-b border-subtle/60 pb-3">
              {[
                { id: "social", label: "Redes y WhatsApp", emoji: "📲" },
                { id: "flyer", label: "Afiche Comunitario", emoji: "📄" },
                { id: "signature", label: "Firma Institucional", emoji: "✉️" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick$={() => {
                    activeTab.value = tab.id as
                      "social" | "flyer" | "signature";
                    playCivicSound("toggle");
                    triggerHapticFeedback("selection");
                  }}
                  class={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-150 active:scale-95 touch-manipulation hover:-translate-y-0.5 ${
                    activeTab.value === tab.id
                      ? "bg-brand-600 text-white shadow-soft"
                      : "bg-surface border border-subtle/80 text-ink-muted hover:text-ink-strong"
                  }`}
                >
                  <span aria-hidden="true">{tab.emoji}</span>
                  <span>{translate(locale, tab.label)}</span>
                </button>
              ))}
            </div>

            {/* Contenido pestaña: Redes y WhatsApp */}
            {activeTab.value === "social" && (
              <div class="space-y-4">
                <div class="p-4 rounded-2xl bg-brand-50/50 border border-brand-500/20 dark:bg-brand-950/20">
                  <span class="text-xs font-bold text-brand block mb-1">
                    {translate(
                      locale,
                      "Mensaje de invitación para grupos vecinales:",
                    )}
                  </span>
                  <p class="text-xs text-ink-strong font-mono leading-relaxed bg-surface p-3 rounded-xl border border-subtle/60">
                    {invitation}
                  </p>

                  <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span class="text-2xs text-ink-muted">
                      {translate(
                        locale,
                        "Optimizá la difusión compartiendo en grupos de cuadra o consorcios.",
                      )}
                    </span>
                    <button
                      type="button"
                      onClick$={handleCopyWhatsappText}
                      class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-success-700 hover:bg-success-800 active:scale-95 touch-manipulation text-white text-xs font-bold shadow-soft transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
                    >
                      <span aria-hidden="true">📋</span>
                      <span>
                        {translate(locale, "Copiar mensaje para WhatsApp")}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Contenido pestaña: Afiche Comunitario */}
            {activeTab.value === "flyer" && (
              <div class="space-y-4">
                <div class="p-4 rounded-2xl bg-muted border border-subtle/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <span class="text-3xl">{communityEmoji}</span>
                    <div>
                      <h4 class="text-xs font-bold text-ink-strong">
                        {translate(
                          locale,
                          "Afiche oficial con código QR de {{community}}",
                          { community: communityName },
                        )}
                      </h4>
                      <p class="text-2xs text-ink-muted mt-0.5">
                        {translate(
                          locale,
                          "Diseñado en alto contraste para imprimir y pegar en carteleras de clubes, comercios o paradas.",
                        )}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={`/c/${communitySlug}/afiche`}
                    class="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-soft hover:bg-brand-700"
                  >
                    <span aria-hidden="true">🖨️</span>
                    <span>{translate(locale, "Imprimir afiche con QR")}</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Contenido pestaña: Firma Institucional */}
            {activeTab.value === "signature" && (
              <div class="space-y-4">
                <div class="p-4 rounded-2xl bg-muted border border-subtle/60">
                  <span class="text-xs font-bold text-ink-strong block mb-1">
                    {translate(
                      locale,
                      "Firma para juntas vecinales y comisiones barriales:",
                    )}
                  </span>
                  <pre class="text-xs text-ink-muted bg-surface p-3 rounded-xl border border-subtle/60 overflow-x-auto whitespace-pre-wrap font-sans">
                    {signature}
                  </pre>

                  <div class="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick$={handleCopyEmailSignature}
                      class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-subtle/80 text-xs font-semibold text-ink-strong hover:bg-surface active:scale-95 touch-manipulation transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
                    >
                      <span aria-hidden="true">✉️</span>
                      <span>{translate(locale, "Copiar firma de correo")}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  },
);
