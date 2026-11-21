import { prefersReducedMotion } from "~/lib/accessibility-preferences";

/** Acerca el detalle apilado en móvil sólo después de una selección explícita. */
export function focusSelectedMapClaim(detail: HTMLElement | undefined): void {
  if (!detail || window.matchMedia("(min-width: 64rem)").matches) return;
  detail.focus({ preventScroll: true });
  detail.scrollIntoView({
    block: "start",
    behavior: prefersReducedMotion() ? "instant" : "smooth",
  });
}
