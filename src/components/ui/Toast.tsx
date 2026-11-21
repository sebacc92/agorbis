import { $, component$, useOnWindow, useSignal } from "@qwik.dev/core";
import { triggerHapticFeedback } from "~/lib/haptics";
import { translate, useLocale } from "~/lib/i18n";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ToastTone = "success" | "info" | "warn" | "danger";

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  duration?: number;
}

/** Nombre del evento que une `showToast` con el contenedor. */
export const TOAST_EVENT = "agorbis:toast";

export const DEFAULT_TOAST_MS = 3500;

/**
 * Cuánto espera un aviso antes de irse solo. Un error (`danger`) no se va: se
 * cierra a mano, como pide WCAG 2.2.1 para contenido que hay que leer y
 * sobre el que a veces hay que actuar ("No pudimos copiar…").
 */
export function toastAutoDismissMs(
  tone: ToastTone,
  duration?: number,
): number | null {
  if (tone === "danger") return null;
  return duration ?? DEFAULT_TOAST_MS;
}

/** Temporizadores por aviso: se pausan al enfocar o pasar el puntero. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Dispara una notificación toast flotante accesible desde cualquier componente.
 *
 * El evento sale de `window` y el contenedor escucha en `window`. Antes
 * escuchaba en `document`: un evento despachado en `window` no baja a
 * `document` (window está por encima en la cadena de propagación), así que
 * ningún toast llegaba a mostrarse.
 */
export const showToast = (
  message: string,
  tone: ToastTone = "info",
  duration = DEFAULT_TOAST_MS,
) => {
  if (typeof window === "undefined") return;
  const id = Math.random().toString(36).slice(2, 9);
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { id, message, tone, duration },
    }),
  );
};

export const ToastContainer = component$(() => {
  const locale = useLocale();
  const toasts = useSignal<ToastItem[]>([]);

  useOnWindow(
    TOAST_EVENT,
    $((event: Event) => {
      const custom = event as CustomEvent<ToastItem>;
      if (!custom.detail?.message) return;
      const item = custom.detail;

      toasts.value = [...toasts.value, item];
      const timeout = toastAutoDismissMs(item.tone, item.duration);
      if (timeout === null) return;
      timers.set(
        item.id,
        setTimeout(() => {
          timers.delete(item.id);
          toasts.value = toasts.value.filter((t) => t.id !== item.id);
        }, timeout),
      );
    }),
  );

  const removeToast$ = $((id: string) => {
    triggerHapticFeedback("selection");
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
    toasts.value = toasts.value.filter((t) => t.id !== id);
  });

  // Mientras el puntero o el foco están encima, el aviso se queda: quien
  // tabula hasta "Cerrar" no tiene que perseguirlo antes de que desaparezca.
  const pauseToast$ = $((id: string) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  });
  const resumeToast$ = $((id: string) => {
    const item = toasts.value.find((t) => t.id === id);
    if (!item || timers.has(id)) return;
    const timeout = toastAutoDismissMs(item.tone, item.duration);
    if (timeout === null) return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        toasts.value = toasts.value.filter((t) => t.id !== id);
      }, timeout),
    );
  });

  // La región se renderiza siempre, aunque esté vacía: los lectores de
  // pantalla anuncian mejor una región viva que ya existía que una que aparece
  // junto con su primer mensaje, y el listener de `useOnWindow` necesita un
  // elemento propio del componente donde quedar registrado.
  return (
    <div
      role="region"
      aria-label={translate(locale, "Avisos de la página")}
      class="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end"
    >
      {toasts.value.map((toast) => {
        const tones = {
          success:
            "border-success-500/30 bg-surface text-ink-strong dark:border-success-500/40",
          info: "border-brand-500/30 bg-surface text-ink-strong dark:border-brand-500/40",
          warn: "border-amber-500/30 bg-surface text-ink-strong dark:border-amber-500/40",
          danger:
            "border-rose-500/30 bg-surface text-ink-strong dark:border-rose-500/40",
        };

        // Íconos propios en vez de glifos tipográficos (D125).
        const icons = {
          success: "check",
          info: "info",
          warn: "alert",
          danger: "x",
        } as const;

        const iconColors = {
          success: "bg-success-500 text-white",
          info: "bg-brand-600 text-white",
          warn: "bg-amber-500 text-white",
          danger: "bg-rose-500 text-white",
        };

        return (
          <div
            key={toast.id}
            role={toast.tone === "danger" ? "alert" : "status"}
            aria-live={toast.tone === "danger" ? "assertive" : "polite"}
            onPointerEnter$={() => pauseToast$(toast.id)}
            onPointerLeave$={() => resumeToast$(toast.id)}
            onFocusin$={() => pauseToast$(toast.id)}
            onFocusout$={() => resumeToast$(toast.id)}
            class={cx(
              "pointer-events-auto flex w-full animate-scale-pop items-center justify-between gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-lg bg-surface/95 transition-all duration-200",
              tones[toast.tone],
            )}
          >
            <div class="flex items-center gap-2.5">
              <span
                class={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  iconColors[toast.tone],
                )}
                aria-hidden="true"
              >
                <Icon name={icons[toast.tone]} class="text-sm" />
              </span>
              <p class="text-sm font-medium leading-snug">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick$={() => removeToast$(toast.id)}
              aria-label={translate(locale, "Cerrar notificación")}
              class="touch-target grid size-7 shrink-0 place-items-center rounded-xl text-ink-muted transition-all hover:bg-muted hover:text-ink-strong active:scale-90"
            >
              <Icon name="x" class="text-sm" />
            </button>
          </div>
        );
      })}
    </div>
  );
});
