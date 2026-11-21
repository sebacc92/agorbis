/**
 * La anatomía de una categoría para elegir en un formulario: una fila con el
 * ícono, el nombre y, en la elegida, un tilde en la esquina del ícono.
 *
 * Reclamo y encuesta elegían categoría con dos controles distintos (baldosas
 * altas con el ícono arriba y filas compactas), y la fila de la encuesta
 * medía menos de los 44 px táctiles. Las clases viven acá y el marcado sigue
 * en cada formulario: los radios no se mueven a un componente hijo, que en
 * Qwik beta se redibuja antes de que baje su manejador de `change` (D99).
 */
export const CATEGORY_CHOICE =
  "choice-control flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm transition-colors";

export const CATEGORY_CHOICE_ON =
  "border-brand-600 bg-brand-50 font-medium text-brand dark:bg-brand-950/50";

export const CATEGORY_CHOICE_OFF =
  "border-subtle text-ink-muted hover:border-strong";

export const CATEGORY_CHOICE_CHECK =
  "absolute -right-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-brand-700 text-[0.5625rem] leading-none text-white shadow-sm";
