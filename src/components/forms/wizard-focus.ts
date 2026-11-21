import { useSignal, useVisibleTask$, type Signal } from "@qwik.dev/core";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";

/** Enfoca el paso visible después de actualizar su DOM, sin animar si se pidió. */
export function focusWizardStep(
  form: HTMLFormElement | undefined,
  step: number,
  field?: string,
): void {
  const scope = form?.querySelector<HTMLElement>(
    `[data-wizard-step="${step}"]`,
  );
  if (!scope) return;
  const target = field
    ? scope.querySelector<HTMLElement>(`[name="${CSS.escape(field)}"]`)
    : (scope.querySelector<HTMLElement>("[data-wizard-heading]") ??
      scope.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, select",
      ));
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion() ? "instant" : "smooth",
  });
}
interface WizardFocusRequest {
  step: number;
  field?: string;
}

/** El evento solicita foco; la tarea lo aplica después del commit del paso. */
export function useWizardFocus(form: Signal<HTMLFormElement | undefined>) {
  const request = useSignal<WizardFocusRequest>();
  // eslint-disable-next-line qwik/no-use-visible-task -- foco del paso sólo después de actualizar el DOM
  useVisibleTask$(
    ({ track, cleanup }) => {
      const pending = track(() => request.value);
      if (!pending) return;
      const frame = requestAnimationFrame(() => {
        // Se consume: el beta puede volver a correr la tarea al montar otra rama
        // (D99), y un pedido viejo le sacaba el foco al título al Volver a editar.
        request.value = undefined;
        focusWizardStep(form.value, pending.step, pending.field);
      });
      cleanup(() => cancelAnimationFrame(frame));
    },
    { strategy: "document-ready" },
  );
  return request;
}
