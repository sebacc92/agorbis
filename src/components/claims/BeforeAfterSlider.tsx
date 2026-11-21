import { component$, useSignal, $, type ClassList } from "@qwik.dev/core";
import { Badge, cx, triggerHapticFeedback } from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { playCivicSound } from "~/lib/audio-feedback";
import { useLocale, translate } from "~/lib/i18n";
import { currentPageUrl, shareNativeOrWhatsApp } from "~/lib/share";

export const BeforeAfterSlider = component$<{
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  claimTitle?: string;
  class?: ClassList;
}>(
  ({
    beforeUrl,
    afterUrl,
    beforeLabel,
    afterLabel,
    claimTitle,
    class: cls,
  }) => {
    const locale = useLocale();
    const sliderPos = useSignal(50);
    const wasAtCenter = useSignal(true);

    const setPreset = $((val: number) => {
      sliderPos.value = val;
      playCivicSound("toggle");
      triggerHapticFeedback("selection");
    });

    const handleShareAchievement = $(() => {
      playCivicSound("click");
      triggerHapticFeedback("medium");
      const currentUrl = currentPageUrl();
      const text = translate(
        locale,
        "¡Mirá el antes y después de este reclamo barrial resuelto en Agorbis! {{title}} 👉 {{url}}",
        {
          title: claimTitle ? `"${claimTitle}"` : "",
          url: currentUrl,
        },
      );

      const channel = shareNativeOrWhatsApp({
        title: claimTitle ?? "Agorbis",
        text,
        url: currentUrl,
      });
      if (channel === "whatsapp") {
        showToast(translate(locale, "Enlace listo para compartir"), "success");
      }
    });

    return (
      <div class="space-y-3">
        <div
          class={cx(
            "group relative select-none overflow-hidden rounded-2xl border border-control bg-slate-900 shadow-md focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 focus-within:ring-offset-surface",
            cls as string,
          )}
        >
          {/* Contenedor de imágenes: altura fija responsiva */}
          <div class="relative h-72 w-full sm:h-96">
            {/* Imagen "Antes" (Fondo completo) */}
            <img
              src={beforeUrl}
              alt={
                beforeLabel ??
                translate(locale, "Foto del problema antes de resolver")
              }
              width={800}
              height={600}
              class="absolute inset-0 size-full object-cover"
              loading="lazy"
            />
            {sliderPos.value > 0 && (
              <div class="absolute bottom-3 left-3 z-10" data-before-label>
                <Badge tone="warn">
                  {beforeLabel ??
                    translate(locale, "Antes · Problema reportado")}
                </Badge>
              </div>
            )}

            {/* Imagen "Después" (Superpuesta con clip-path porcentual) */}
            <div
              class="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 0 0 ${sliderPos.value}%)` }}
            >
              <img
                src={afterUrl}
                alt={
                  afterLabel ??
                  translate(locale, "Foto de la solución completada")
                }
                width={800}
                height={600}
                class="absolute inset-0 size-full object-cover"
                loading="lazy"
              />
              <div class="absolute bottom-3 right-3 z-10">
                <Badge tone="success">
                  🏆 {afterLabel ?? translate(locale, "Después · Solucionado")}
                </Badge>
              </div>
            </div>

            {/* Línea divisoria visual */}
            <div
              class="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white shadow-lg transition-opacity group-hover:bg-brand-400"
              style={{ left: `${sliderPos.value}%` }}
            >
              {/* Manija circular de arrastre con indicador flotante de porcentaje */}
              <div class="absolute top-1/2 -left-5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/90 bg-neutral-900/95 text-white shadow-lift ring-2 ring-black/20 transition-transform active:scale-125 touch-manipulation">
                <span class="text-xs font-bold" aria-hidden="true">
                  ↔
                </span>
                {/* Pastilla flotante con porcentaje numérico */}
                <span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-neutral-900/90 px-1.5 py-0.5 font-mono text-3xs font-bold text-white shadow-md backdrop-blur-xs tabular-nums ring-1 ring-white/20">
                  {sliderPos.value}%
                </span>
              </div>
            </div>
          </div>

          {/* Control deslizante transparente sobre toda el área para interacción táctil y de teclado */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPos.value}
            onInput$={(e) => {
              const val = Number((e.target as HTMLInputElement).value);
              sliderPos.value = val;
              const isAtCenter = Math.abs(val - 50) <= 2;
              if (isAtCenter && !wasAtCenter.value) {
                playCivicSound("toggle");
                triggerHapticFeedback("selection");
              }
              wasAtCenter.value = isAtCenter;
            }}
            aria-label={translate(
              locale,
              "Deslizar para comparar antes y después",
            )}
            aria-valuetext={translate(
              locale,
              "Antes {{before}}% · Después {{after}}%",
              { before: sliderPos.value, after: 100 - sliderPos.value },
            )}
            class="absolute inset-0 z-30 size-full cursor-ew-resize opacity-0"
          />
        </div>

        {/* Botonera de control rápido y compartir logro */}
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-1 rounded-xl bg-muted p-1 border border-subtle/60">
            <button
              type="button"
              onClick$={() => setPreset(100)}
              aria-pressed={sliderPos.value === 100}
              class={[
                "px-2.5 py-1 rounded-lg font-medium transition-all duration-150 active:scale-95 touch-manipulation",
                sliderPos.value === 100
                  ? "bg-surface text-ink-strong shadow-xs ring-1 ring-brand-500/30"
                  : "text-ink-muted hover:text-ink-strong",
              ]}
            >
              {translate(locale, "Solo Antes")}
            </button>
            <button
              type="button"
              onClick$={() => setPreset(50)}
              aria-pressed={sliderPos.value === 50}
              class={[
                "px-2.5 py-1 rounded-lg font-medium transition-all duration-150 active:scale-95 touch-manipulation",
                sliderPos.value === 50
                  ? "bg-surface text-ink-strong shadow-xs ring-1 ring-brand-500/30"
                  : "text-ink-muted hover:text-ink-strong",
              ]}
            >
              {"50 / 50"}
            </button>
            <button
              type="button"
              onClick$={() => setPreset(0)}
              aria-pressed={sliderPos.value === 0}
              class={[
                "px-2.5 py-1 rounded-lg font-medium transition-all duration-150 active:scale-95 touch-manipulation",
                sliderPos.value === 0
                  ? "bg-surface text-ink-strong shadow-xs ring-1 ring-brand-500/30"
                  : "text-ink-muted hover:text-ink-strong",
              ]}
            >
              {translate(locale, "Solo Solución")} 🏆
            </button>
          </div>

          <button
            type="button"
            onClick$={handleShareAchievement}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-300 font-medium hover:bg-success-500/20 transition-colors"
          >
            <span>📲</span>
            <span>{translate(locale, "Compartir logro vecinal")}</span>
          </button>
        </div>
      </div>
    );
  },
);
