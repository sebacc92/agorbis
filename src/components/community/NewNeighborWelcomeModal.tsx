import { $, component$, useSignal } from "@qwik.dev/core";
import { Button, Modal, triggerHapticFeedback, Icon } from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { useLocale, translate } from "~/lib/i18n";

export interface NewNeighborWelcomeModalProps {
  communityName: string;
}

export const NewNeighborWelcomeModal = component$<NewNeighborWelcomeModalProps>(
  ({ communityName }) => {
    const locale = useLocale();
    const isOpen = useSignal(false);
    const activeStep = useSignal<1 | 2 | 3>(1);

    const tourSteps = [
      {
        step: 1,
        title: "1. Tu Cuadra y Territorio",
        desc: "Consultá en el mapa los reclamos de la comunidad con ubicación aproximada. Podés filtrar los problemas que te interesan.",
        icon: "🗺️",
        actionText: "Ver siguiente paso",
      },
      {
        step: 2,
        title: "2. Reclamos y Victorias Vecinales",
        desc: "Publicá los problemas que ves y apoyá los reclamos que te afectan. Los apoyos muestran cuántas personas comparten el problema; no garantizan una respuesta de las autoridades.",
        icon: "📣",
        actionText: "Ver siguiente paso",
      },
      {
        step: 3,
        title: "3. Presupuesto y Decisiones",
        desc: "Consultá las encuestas y debates de tu comunidad. Si hay una ronda de presupuesto, revisá su fase y los requisitos para participar.",
        icon: "🗳️",
        actionText: "¡Empezar a participar! 🚀",
      },
    ];

    const nextStep = $(() => {
      triggerHapticFeedback("selection");
      playCivicSound("click");
      if (activeStep.value < 3) {
        activeStep.value = (activeStep.value + 1) as 2 | 3;
      } else {
        // Acá se guardaba `agorbis_welcome_<slug>`, pero nada lo leía: era un
        // rastro de uso sin función. Se dejó de escribir; la clave sigue
        // clasificada en `local-data.ts` para que la limpieza la borre.
        isOpen.value = false;
      }
    });

    const currentTour = tourSteps[activeStep.value - 1];

    return (
      <>
        <button
          type="button"
          onClick$={() => {
            triggerHapticFeedback("selection");
            playCivicSound("toggle");
            activeStep.value = 1;
            isOpen.value = true;
          }}
          class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-subtle bg-surface px-3 text-xs font-semibold text-ink-strong transition duration-150 hover:-translate-y-0.5 hover:bg-muted active:scale-95 touch-manipulation"
          aria-label={translate(locale, "Abrir guía de bienvenida")}
        >
          <span aria-hidden="true">🧭</span>
          <span>{translate(locale, "Guía de bienvenida")}</span>
        </button>

        {isOpen.value && (
          <Modal
            open={isOpen.value}
            onClose$={() => {
              isOpen.value = false;
            }}
            title={translate(locale, "¡Te damos la bienvenida a {{name}}!", {
              name: communityName,
            })}
          >
            <div class="space-y-5">
              <div class="flex items-center justify-between border-b border-subtle pb-3">
                <span class="text-xs font-bold uppercase tracking-wider text-brand tabular-nums">
                  {translate(locale, "Paso {{current}} de 3", {
                    current: activeStep.value,
                  })}
                </span>
                <div class="flex items-center gap-1.5">
                  {[1, 2, 3].map((s) => (
                    <span
                      key={s}
                      class={`h-2.5 rounded-full transition-all duration-300 ${
                        activeStep.value === s
                          ? "w-6 bg-brand-600"
                          : "w-2.5 bg-subtle"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Paso Activo */}
              <div class="flex flex-col items-center rounded-2xl border border-subtle/50 bg-surface/50 p-4 text-center transition-all duration-200 hover:-translate-y-0.5 animate-fade-in">
                <div class="flex size-16 items-center justify-center rounded-3xl bg-brand-500/10 text-4xl shadow-inner animate-scale-pop">
                  {currentTour.icon}
                </div>
                <h3 class="mt-4 text-lg font-black text-ink-strong">
                  {translate(locale, currentTour.title)}
                </h3>
                <p class="mt-2 text-xs leading-relaxed text-ink-muted sm:text-sm">
                  {translate(locale, currentTour.desc)}
                </p>
              </div>

              {/* Controles de Navegación */}
              <div class="flex items-center justify-between border-t border-subtle pt-4">
                <button
                  type="button"
                  onClick$={() => {
                    playCivicSound("click");
                    isOpen.value = false;
                  }}
                  class="cursor-pointer text-xs font-semibold text-ink-muted transition duration-150 hover:text-ink-strong hover:underline active:scale-95 touch-manipulation"
                >
                  {translate(locale, "Saltar introducción")}
                </button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick$={nextStep}
                  class="active:scale-95 touch-manipulation cursor-pointer duration-150 hover:-translate-y-0.5"
                >
                  {translate(locale, currentTour.actionText)}
                  {currentTour.actionText === "Ver siguiente paso" && (
                    <Icon name="arrow-right" class="text-[1.1em]" />
                  )}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  },
);
