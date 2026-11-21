import { useSignal, useVisibleTask$, type Signal } from "@qwik.dev/core";
import type { PublicationFeedback } from "~/lib/content-publication";

/** El ref y el envío se observan también para reenfocar un rechazo repetido. */
export function useFieldErrorFocus(
  error: Signal<string | undefined>,
  action: {
    isRunning: boolean;
    value?: PublicationFeedback | { saved: true };
  },
) {
  const field = useSignal<HTMLInputElement>();
  // eslint-disable-next-line qwik/no-use-visible-task -- foco del campo sólo después de actualizar su DOM
  useVisibleTask$(
    ({ track, cleanup }) => {
      const message = track(() => error.value);
      const running = track(() => action.isRunning);
      track(() => action.value);
      track(() => field.value);
      if (!message || running) return;
      const frame = requestAnimationFrame(() => {
        const element = field.value;
        if (
          !element?.isConnected ||
          !element.getClientRects().length ||
          action.isRunning ||
          !error.value
        )
          return;
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: "center", behavior: "instant" });
      });
      cleanup(() => cancelAnimationFrame(frame));
    },
    { strategy: "document-ready" },
  );
  return field;
}
