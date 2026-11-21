import { Icon } from "./Icon";
import {
  $,
  component$,
  useId,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import { buttonClass, triggerHapticFeedback } from "~/components/ui";
import { DialogFrame } from "./Dialog";
import { playCivicSound } from "~/lib/audio-feedback";
import { pluralize } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";

export interface ProjectorSlideItem {
  id: string;
  title: string;
  subtitle?: string;
  count?: number;
  highlight?: boolean;
}

export const AssemblyProjectorModal = component$<{
  title: string;
  subtitle?: string;
  communityName: string;
  items: ProjectorSlideItem[];
  kind: "debate" | "budget";
}>(({ title, subtitle, communityName, items, kind }) => {
  const locale = useLocale();
  const isOpen = useSignal(false);
  const titleId = useId();
  const currentSlide = useSignal(0);
  const speakerSeconds = useSignal(120); // 2 minutos para orador
  const isTimerRunning = useSignal(false);
  const speakerDeadline = useSignal(0);

  // El intervalo pertenece al diálogo abierto. También se limpia al navegar,
  // y el plazo absoluto evita alargar el turno si la pestaña pierde actividad.
  // eslint-disable-next-line qwik/no-use-visible-task -- el temporizador se ejecuta y se limpia sólo en el navegador
  useVisibleTask$(
    ({ track, cleanup }) => {
      const open = track(() => isOpen.value);
      const running = track(() => isTimerRunning.value);
      const deadline = track(() => speakerDeadline.value);
      if (!open || !running) return;
      const update = () => {
        speakerSeconds.value = Math.max(
          0,
          Math.ceil((deadline - Date.now()) / 1000),
        );
        if (speakerSeconds.value === 0) {
          isTimerRunning.value = false;
          playCivicSound("reset");
        }
      };
      update();
      const interval = window.setInterval(update, 1000);
      cleanup(() => window.clearInterval(interval));
    },
    { strategy: "document-ready" },
  );

  const startSpeakerTimer = $(() => {
    if (isTimerRunning.value) return;
    speakerSeconds.value = 120;
    speakerDeadline.value = Date.now() + 120_000;
    isTimerRunning.value = true;
    playCivicSound("click");
    triggerHapticFeedback("selection");
  });

  const resetSpeakerTimer = $(() => {
    isTimerRunning.value = false;
    speakerSeconds.value = 120;
    speakerDeadline.value = 0;
    playCivicSound("reset");
    triggerHapticFeedback("selection");
  });

  const closeProjector = $(() => {
    isOpen.value = false;
    isTimerRunning.value = false;
    speakerSeconds.value = 120;
    speakerDeadline.value = 0;
  });

  const nextSlide = $(() => {
    if (currentSlide.value < items.length - 1) {
      currentSlide.value++;
      playCivicSound("toggle");
      triggerHapticFeedback("light");
    }
  });

  const prevSlide = $(() => {
    if (currentSlide.value > 0) {
      currentSlide.value--;
      playCivicSound("toggle");
      triggerHapticFeedback("light");
    }
  });

  useOnWindow(
    "keydown",
    $((e) => {
      const ev = e as KeyboardEvent;
      if (
        !isOpen.value ||
        ev.altKey ||
        ev.ctrlKey ||
        ev.metaKey ||
        ev.isComposing
      )
        return;
      // Escape lo resuelve el `<dialog>` nativo de `DialogFrame`.
      if (ev.key === "ArrowRight") {
        nextSlide();
      } else if (ev.key === "ArrowLeft") {
        prevSlide();
      }
    }),
  );

  const activeItem = items[currentSlide.value];

  if (items.length === 0) return null;

  return (
    <>
      {/* Herramienta propia del detalle: botón fantasma con ícono, al lado de
          guardar y compartir (D124). El texto no cambia: es el nombre que
          busca el E2E del proyector y el msgid que usa la rendición. */}
      <button
        type="button"
        onClick$={() => {
          isOpen.value = true;
          playCivicSound("click");
          triggerHapticFeedback("medium");
        }}
        class={buttonClass("ghost", "sm")}
      >
        <Icon name="projector" class="text-base" />
        {translate(locale, "Modo Asamblea / Proyector")}
      </button>

      {/* Modal a Pantalla Completa para Proyector */}
      {isOpen.value && (
        <DialogFrame
          onClose$={closeProjector}
          labelledBy={titleId}
          closeOnBackdrop={false}
          class="h-full max-h-none w-full max-w-none bg-black text-white p-4 sm:p-12 animate-fade-in select-none overflow-y-auto overscroll-contain open:flex open:flex-col open:justify-between"
        >
          {/* Barra Superior del Proyector */}
          <div class="flex shrink-0 flex-col gap-4 border-b border-white/20 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex min-w-0 items-center gap-3">
              <Icon name="users" class="shrink-0 text-2xl text-white/80" />
              <div class="min-w-0">
                <span class="text-sm font-bold uppercase tracking-widest text-success-400">
                  {communityName} ·{" "}
                  {kind === "debate"
                    ? translate(locale, "Asamblea de Debate")
                    : translate(locale, "Asamblea de Presupuesto")}
                </span>
                <h2
                  id={titleId}
                  class="text-xl sm:text-2xl font-black tracking-tight text-white line-clamp-1"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p class="text-xs text-white/75 line-clamp-1 mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              {/* Temporizador del turno de orador (2 min). Ámbar del tema
                  (`accent`), no la paleta cruda: se lee a distancia sobre el
                  negro del proyector. */}
              <div class="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/20">
                <Icon name="clock" class="shrink-0 text-lg text-accent-300" />
                <span
                  role="timer"
                  aria-label={translate(locale, "Tiempo restante del turno")}
                  aria-live="off"
                  class="font-mono text-xl sm:text-2xl font-black text-accent-300 tabular-nums"
                >
                  {Math.floor(speakerSeconds.value / 60)}:
                  {speakerSeconds.value % 60 < 10
                    ? `0${speakerSeconds.value % 60}`
                    : speakerSeconds.value % 60}
                </span>

                {/* Sin el salto al pasar el mouse (D124); la escala al tocar
                    se apaga con "reducir movimiento". */}
                {isTimerRunning.value ? (
                  <button
                    type="button"
                    onClick$={resetSpeakerTimer}
                    class="ml-2 min-h-11 px-2.5 py-1 text-xs font-bold bg-accent-500/30 text-accent-300 rounded-lg hover:bg-accent-500/50 active:scale-95 motion-reduce:transform-none touch-manipulation cursor-pointer transition-colors duration-150"
                  >
                    {translate(locale, "Reiniciar")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick$={startSpeakerTimer}
                    class="ml-2 min-h-11 px-2.5 py-1 text-xs font-bold bg-success-500 text-black rounded-lg hover:bg-success-400 active:scale-95 motion-reduce:transform-none touch-manipulation cursor-pointer transition-colors duration-150"
                  >
                    {translate(locale, "Turno 2m")}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick$={closeProjector}
                class="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20 active:scale-95 motion-reduce:transform-none touch-manipulation cursor-pointer transition-colors duration-150"
              >
                <Icon name="x" class="text-[1.1em]" />
                {translate(locale, "Salir (Esc)")}
              </button>
            </div>
          </div>

          <p role="status" class="sr-only">
            {speakerSeconds.value === 0 &&
              translate(
                locale,
                "El turno terminó. Podés iniciar otro de dos minutos.",
              )}
          </p>

          {/* Diapositiva Principal de Gran Tamaño (Legible a 15m) */}
          <div class="my-auto w-full shrink-0 py-8 text-center max-w-5xl mx-auto space-y-6 break-words">
            <div class="inline-flex items-center gap-2 bg-white/15 px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide text-success-300">
              <span class="tabular-nums">
                {translate(locale, "Tema / Propuesta")} {currentSlide.value + 1}{" "}
                / {items.length}
              </span>
            </div>

            {activeItem && (
              <div class="space-y-4">
                <h3 class="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight text-white drop-shadow-md">
                  {activeItem.title}
                </h3>
                {activeItem.subtitle && (
                  <p class="text-lg sm:text-2xl md:text-3xl text-white/80 max-w-3xl mx-auto font-medium leading-relaxed">
                    {activeItem.subtitle}
                  </p>
                )}
                {/* El conteo es un dato: texto con ícono y su plural, no un
                    badge violeta con emoji. */}
                {activeItem.count !== undefined && (
                  <p class="flex items-center justify-center gap-2 pt-4 text-base font-semibold text-white/80 tabular-nums sm:text-xl">
                    <Icon name="chat" />
                    {pluralize(
                      activeItem.count,
                      "comentario",
                      "comentarios",
                      locale,
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Barra Inferior con Navegación y Atajos de Teclado */}
          <div class="flex shrink-0 flex-col gap-3 border-t border-white/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="text-xs sm:text-sm text-white/60 font-medium">
              <span>
                {translate(
                  locale,
                  "Navegación: flechas del teclado o botones en pantalla",
                )}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={currentSlide.value === 0}
                onClick$={prevSlide}
                class="inline-flex min-h-11 items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white font-bold hover:bg-white/20 active:scale-95 motion-reduce:transform-none touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
              >
                <Icon name="chevron-left" />
                {translate(locale, "Anterior")}
              </button>

              <span class="font-mono font-bold text-sm tabular-nums">
                {currentSlide.value + 1} / {items.length}
              </span>

              <button
                type="button"
                disabled={currentSlide.value === items.length - 1}
                onClick$={nextSlide}
                class="inline-flex min-h-11 items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl bg-success-500 text-black font-black hover:bg-success-400 active:scale-95 motion-reduce:transform-none touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
              >
                {translate(locale, "Siguiente")}
                <Icon name="chevron-right" />
              </button>
            </div>
          </div>
        </DialogFrame>
      )}
    </>
  );
});
