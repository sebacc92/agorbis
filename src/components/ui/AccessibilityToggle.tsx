import {
  $,
  component$,
  useSignal,
  useVisibleTask$,
  type QRL,
} from "@qwik.dev/core";
import {
  applyFontScale,
  applyVisualFlag,
  clearA11yPreferences,
  countActiveA11yPreferences,
  DEFAULT_A11Y_PREFERENCES,
  persistA11yFlag,
  persistFontScale,
  readA11yPreferences,
  stepFontScale,
  type A11yFlag,
  type A11yPreferences,
  type A11yVisualFlag,
} from "~/lib/accessibility-preferences";
import { playCivicSound } from "~/lib/audio-feedback";
import { triggerHapticFeedback } from "~/lib/haptics";
import { translate, useLocale } from "~/lib/i18n";
import { cx } from "./cx";
import { DialogFrame } from "./Dialog";
import { Icon } from "./Icon";

const VISUAL_FLAGS: readonly A11yVisualFlag[] = [
  "highContrast",
  "dyslexia",
  "reducedMotion",
  "enhancedFocus",
];

/**
 * Una opción del panel: la fila entera es el botón y el interruptor de la
 * derecha dice si está encendida (D126).
 *
 * Eran siete copias con un `<div>` dentro de cada `<button>`, HTML inválido
 * que en desarrollo corta el servidor (Q12), y cada opción encendida se
 * pintaba como un botón primario: con varias prendidas, el panel era una
 * pila de barras violetas iguales. Encendida, la fila queda apenas teñida y
 * el estado lo marca el interruptor. En claro ese tinte es opaco a propósito:
 * el E2E del panel mide el contraste entre el fondo y el texto de la fila, y
 * un fondo transparente se lee como negro.
 */
const ToggleRow = component$<{
  label: string;
  hint: string;
  pressed: boolean;
  onToggle$: QRL<() => void>;
}>(({ label, hint, pressed, onToggle$ }) => (
  <button
    type="button"
    onClick$={onToggle$}
    aria-pressed={pressed}
    class={cx(
      "flex min-h-[44px] w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs touch-manipulation cursor-pointer",
      "transition-colors duration-150 motion-reduce:transition-none",
      pressed
        ? "bg-brand-50 text-ink-strong dark:bg-brand-950/60"
        : "bg-muted/50 text-ink hover:bg-muted",
    )}
  >
    <span class="block min-w-0 flex-1">
      <span class="block font-semibold">{label}</span>
      <span class="block text-2xs text-ink-muted">{hint}</span>
    </span>
    {/* El interruptor es dibujo: el estado ya lo anuncia `aria-pressed`.
      En colores forzados (alto contraste de Windows) el navegador cambia
      los fondos por el del sistema y anula las sombras: la perilla
      desaparecía y encendido y apagado eran la misma píldora vacía. Los
      colores del sistema sí se respetan, así que la pista encendida se
      rellena con Highlight y la perilla usa el texto que contrasta con su
      fondo en cada estado. */}
    <span
      aria-hidden="true"
      class={cx(
        "flex h-6 w-10 shrink-0 items-center rounded-full border",
        "transition-colors duration-150 motion-reduce:transition-none",
        pressed
          ? "border-brand-600 bg-brand-600 dark:border-brand-500 dark:bg-brand-500 forced-colors:border-[Highlight] forced-colors:bg-[Highlight]"
          : "border-control bg-inset",
      )}
    >
      <span
        class={cx(
          "size-5 rounded-full bg-white shadow-xs",
          "transition-transform duration-150 motion-reduce:transition-none",
          pressed
            ? "translate-x-4 forced-colors:bg-[HighlightText]"
            : "translate-x-0.5 forced-colors:bg-[CanvasText]",
        )}
      />
    </span>
  </button>
));

export const AccessibilityToggle = component$(() => {
  const locale = useLocale();
  const openMenu = useSignal(false);
  const fontScale = useSignal<number>(DEFAULT_A11Y_PREFERENCES.fontScale);
  const highContrast = useSignal(DEFAULT_A11Y_PREFERENCES.highContrast);
  const dyslexia = useSignal(DEFAULT_A11Y_PREFERENCES.dyslexia);
  const reducedMotion = useSignal(DEFAULT_A11Y_PREFERENCES.reducedMotion);
  const enhancedFocus = useSignal(DEFAULT_A11Y_PREFERENCES.enhancedFocus);
  const soundFeedback = useSignal(DEFAULT_A11Y_PREFERENCES.sound);
  const hapticFeedback = useSignal(DEFAULT_A11Y_PREFERENCES.haptic);
  const singleKeyShortcuts = useSignal(DEFAULT_A11Y_PREFERENCES.shortcuts);

  // Las preferencias ya las aplicó el bootstrap del `<head>` antes del primer
  // pintado (`A11Y_BOOTSTRAP`); acá sólo se lee lo guardado para que el botón
  // muestre el contador y el panel arranque con cada opción como está. Por
  // eso alcanza con la estrategia por defecto: hace falta recién cuando el
  // pie, donde vive este botón, entra en pantalla.
  // eslint-disable-next-line qwik/no-use-visible-task -- localStorage sólo existe en el navegador y el contador se ve sin interacción
  useVisibleTask$(() => {
    const prefs = readA11yPreferences();
    fontScale.value = prefs.fontScale;
    highContrast.value = prefs.highContrast;
    dyslexia.value = prefs.dyslexia;
    reducedMotion.value = prefs.reducedMotion;
    enhancedFocus.value = prefs.enhancedFocus;
    soundFeedback.value = prefs.sound;
    hapticFeedback.value = prefs.haptic;
    singleKeyShortcuts.value = prefs.shortcuts;
  });

  const updateFontScale$ = $((delta: number) => {
    const nextScale = stepFontScale(fontScale.value, delta);
    fontScale.value = nextScale;
    applyFontScale(document.documentElement, nextScale);
    persistFontScale(nextScale);
  });

  /** Cambia una opción: primero la pantalla, después lo guardado. */
  const setFlag$ = $((flag: A11yFlag, next: boolean) => {
    if (flag === "sound" || flag === "haptic" || flag === "shortcuts") {
      persistA11yFlag(flag, next);
      // Se confirma con el propio canal recién encendido.
      if (next && flag === "sound") playCivicSound("toggle");
      if (next && flag === "haptic") triggerHapticFeedback("selection");
      return;
    }
    applyVisualFlag(document.documentElement, flag, next);
    persistA11yFlag(flag, next);
  });

  const toggleHighContrast$ = $(() => {
    highContrast.value = !highContrast.value;
    return setFlag$("highContrast", highContrast.value);
  });
  const toggleDyslexia$ = $(() => {
    dyslexia.value = !dyslexia.value;
    return setFlag$("dyslexia", dyslexia.value);
  });
  const toggleReducedMotion$ = $(() => {
    reducedMotion.value = !reducedMotion.value;
    return setFlag$("reducedMotion", reducedMotion.value);
  });
  const toggleEnhancedFocus$ = $(() => {
    enhancedFocus.value = !enhancedFocus.value;
    return setFlag$("enhancedFocus", enhancedFocus.value);
  });
  const toggleSoundFeedback$ = $(() => {
    soundFeedback.value = !soundFeedback.value;
    return setFlag$("sound", soundFeedback.value);
  });
  const toggleHapticFeedback$ = $(() => {
    hapticFeedback.value = !hapticFeedback.value;
    return setFlag$("haptic", hapticFeedback.value);
  });
  const toggleSingleKeyShortcuts$ = $(() => {
    singleKeyShortcuts.value = !singleKeyShortcuts.value;
    return setFlag$("shortcuts", singleKeyShortcuts.value);
  });

  const resetAll$ = $(() => {
    const defaults = DEFAULT_A11Y_PREFERENCES;
    fontScale.value = defaults.fontScale;
    highContrast.value = defaults.highContrast;
    dyslexia.value = defaults.dyslexia;
    reducedMotion.value = defaults.reducedMotion;
    enhancedFocus.value = defaults.enhancedFocus;
    soundFeedback.value = defaults.sound;
    hapticFeedback.value = defaults.haptic;
    singleKeyShortcuts.value = defaults.shortcuts;

    clearA11yPreferences();
    const root = document.documentElement;
    applyFontScale(root, defaults.fontScale);
    for (const flag of VISUAL_FLAGS) applyVisualFlag(root, flag, false);
    playCivicSound("reset");
  });

  const current: A11yPreferences = {
    fontScale: fontScale.value,
    highContrast: highContrast.value,
    dyslexia: dyslexia.value,
    reducedMotion: reducedMotion.value,
    enhancedFocus: enhancedFocus.value,
    sound: soundFeedback.value,
    haptic: hapticFeedback.value,
    shortcuts: singleKeyShortcuts.value,
  };
  const activeCount = countActiveA11yPreferences(current);

  return (
    <div class="relative inline-block text-xs">
      <button
        type="button"
        onClick$={() => {
          openMenu.value = !openMenu.value;
        }}
        class={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-ink-muted transition hover:border-brand-500 hover:text-ink-strong active:scale-95 touch-manipulation cursor-pointer ${
          activeCount > 0
            ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
            : "border-subtle bg-surface"
        }`}
        title={translate(locale, "Opciones de accesibilidad cívica")}
        aria-label={translate(locale, "Opciones de accesibilidad cívica")}
        aria-expanded={openMenu.value}
      >
        <Icon name="accessibility" class="text-base" />
        <span class="font-medium">{translate(locale, "Accesibilidad")}</span>
        {activeCount > 0 && (
          <span class="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-3xs font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {openMenu.value && (
        <DialogFrame
          onClose$={() => {
            openMenu.value = false;
          }}
          label={translate(locale, "Preferencias de accesibilidad")}
          placement="bottom-end"
          backdropClass="backdrop:bg-black/40 backdrop:backdrop-blur-sm"
          class="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-subtle bg-surface p-4 text-ink shadow-2xl animate-scale-pop"
        >
          <div class="flex items-start justify-between gap-2 border-b border-subtle pb-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-bold text-ink-strong">
                {translate(locale, "Preferencias de accesibilidad")}
              </h3>
              <p class="mt-0.5 text-2xs text-ink-muted">
                {translate(
                  locale,
                  "Personalizá la visualización según tus necesidades de lectura y contraste.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick$={() => {
                openMenu.value = false;
              }}
              class="flex size-[44px] shrink-0 items-center justify-center rounded-lg p-1 text-ink-faint hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation cursor-pointer"
              aria-label={translate(locale, "Cerrar opciones de accesibilidad")}
            >
              <Icon name="x" class="text-base" />
            </button>
          </div>

          <div class="mt-3.5 space-y-3">
            {/* Stepper Tamaño de texto */}
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-2.5">
              <div>
                <span class="block text-xs font-semibold text-ink-strong">
                  {translate(locale, "Tamaño de texto")}
                </span>
                <span class="text-2xs text-ink-muted tabular-nums">
                  {fontScale.value}%
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick$={() => updateFontScale$(-1)}
                  disabled={fontScale.value <= 90}
                  class="flex size-[44px] items-center justify-center rounded-lg border border-subtle bg-surface text-ink disabled:opacity-40 active:scale-90 touch-manipulation cursor-pointer"
                  aria-label={translate(locale, "Disminuir tamaño de texto")}
                >
                  <Icon name="minus" class="text-base" />
                </button>
                <button
                  type="button"
                  onClick$={() => updateFontScale$(1)}
                  disabled={fontScale.value >= 130}
                  class="flex size-[44px] items-center justify-center rounded-lg border border-subtle bg-surface text-ink disabled:opacity-40 active:scale-90 touch-manipulation cursor-pointer"
                  aria-label={translate(locale, "Aumentar tamaño de texto")}
                >
                  <Icon name="plus" class="text-base" />
                </button>
              </div>
            </div>

            <ToggleRow
              label={translate(locale, "Alto contraste")}
              hint={translate(
                locale,
                "Aumenta la diferenciación entre texto y fondo",
              )}
              pressed={highContrast.value}
              onToggle$={toggleHighContrast$}
            />

            <ToggleRow
              label={translate(locale, "Lectura facilitada")}
              hint={translate(
                locale,
                "Mayor interlineado y separación para lectura cómoda",
              )}
              pressed={dyslexia.value}
              onToggle$={toggleDyslexia$}
            />

            <ToggleRow
              label={translate(locale, "Reducir animaciones")}
              hint={translate(
                locale,
                "Minimiza transiciones y efectos de movimiento",
              )}
              pressed={reducedMotion.value}
              onToggle$={toggleReducedMotion$}
            />

            <ToggleRow
              label={translate(locale, "Foco visual reforzado")}
              hint={translate(
                locale,
                "Resalta con borde grueso el elemento activo",
              )}
              pressed={enhancedFocus.value}
              onToggle$={toggleEnhancedFocus$}
            />

            <ToggleRow
              label={translate(locale, "Sonidos cívicos de confirmación")}
              hint={translate(
                locale,
                "Emite tonos suaves al votar, apoyar o celebrar acciones",
              )}
              pressed={soundFeedback.value}
              onToggle$={toggleSoundFeedback$}
            />

            <ToggleRow
              label={translate(locale, "Vibración háptica táctil")}
              hint={translate(
                locale,
                "Vibra al completar una acción, en teléfonos compatibles",
              )}
              pressed={hapticFeedback.value}
              onToggle$={toggleHapticFeedback$}
            />

            {/* Atajos de una sola tecla (WCAG 2.1.4): se pueden apagar. */}
            <ToggleRow
              label={translate(locale, "Atajos de una sola tecla")}
              hint={translate(
                locale,
                "/, ?, H y E navegan desde cualquier página. Apagalos si dictás por voz o si una tecla suelta te cambia de página.",
              )}
              pressed={singleKeyShortcuts.value}
              onToggle$={toggleSingleKeyShortcuts$}
            />
          </div>

          {activeCount > 0 && (
            <div class="mt-4 border-t border-subtle pt-3">
              <button
                type="button"
                onClick$={resetAll$}
                class="min-h-[44px] w-full rounded-xl border border-subtle bg-surface py-1.5 text-center text-xs font-medium text-ink-muted hover:border-danger-500 hover:text-danger active:scale-95 touch-manipulation cursor-pointer transition-all"
              >
                {translate(locale, "Restablecer preferencias")}
              </button>
            </div>
          )}
        </DialogFrame>
      )}
    </div>
  );
});
