import {
  component$,
  Slot,
  useSignal,
  useVisibleTask$,
  type QRL,
} from "@qwik.dev/core";
import { cx } from "./cx";

/**
 * Marco accesible para cualquier diálogo modal: `<Modal>` lo usa con su
 * encabezado estándar y los diálogos con diseño propio (proyector, simulador,
 * comparador, sellos) lo usan directo para no perder su maquetación.
 *
 * Se apoya en `<dialog>` + `showModal()` en vez de un `div` flotante con rol
 * de diálogo porque el navegador ya resuelve lo difícil: el resto de la página
 * queda inerte (el foco no se escapa con Tab, el lector de pantalla no lo
 * recorre), Escape cierra y el foco inicial va al primer control. Lo que el
 * navegador no hace, lo hace este componente:
 *
 * - **Bloqueo de scroll** del `body` mientras está abierto.
 * - **Retorno del foco** al control que lo abrió. El navegador sólo lo hace
 *   si se llama a `close()`; acá casi todos los diálogos se desmontan al
 *   cerrarse (`{abierto && <…>}`) y el foco quedaba perdido en el `body`.
 * - **Clic afuera** que cierra, medido contra el rectángulo del panel: el
 *   `event.target === dialog` de antes también cerraba al tocar el padding
 *   del propio panel.
 * - **Etiqueta**: `label` o `labelledBy` (el id de un título visible).
 */
export interface DialogFrameProps {
  /** Por defecto `true`: lo habitual es montarlo sólo mientras está abierto. */
  open?: boolean;
  onClose$: QRL<() => void>;
  /** Nombre accesible si no hay un título visible al que apuntar. */
  label?: string;
  /** Id del título visible que nombra al diálogo (preferible a `label`). */
  labelledBy?: string;
  /**
   * Clases del panel: tamaño, fondo, color de texto, bordes, padding. El
   * color va acá y no en la base porque el navegador le pone `CanvasText` a
   * `<dialog>` y cada panel decide el suyo (el proyector es blanco sobre negro).
   */
  class?: string;
  /** Clases del fondo (`backdrop:`), por defecto un velo oscuro con blur. */
  backdropClass?: string;
  /** Si tocar afuera del panel lo cierra. Por defecto sí. */
  closeOnBackdrop?: boolean;
  /**
   * Dónde se ubica el panel. `center` (por defecto) lo centra; `top` lo deja
   * arriba, como un buscador; `bottom-end` lo apoya abajo a la derecha, como
   * el panel de accesibilidad del pie. Va
   * como opción y no como clases sueltas porque el margen `auto` que centra
   * chocaría con cualquier margen que se pase en `class`.
   */
  placement?: "center" | "top" | "bottom-end";
}

const PLACEMENT_CLASS = {
  center: "m-auto",
  top: "mx-auto mb-auto mt-4 sm:mt-6 md:mt-20",
  "bottom-end": "mt-auto ms-auto mb-4 me-4",
} as const;

/** Si un clic cayó fuera del rectángulo del panel (en el `::backdrop`). */
export function isOutsideRect(
  point: { clientX: number; clientY: number },
  rect: { left: number; right: number; top: number; bottom: number },
): boolean {
  return (
    point.clientX < rect.left ||
    point.clientX > rect.right ||
    point.clientY < rect.top ||
    point.clientY > rect.bottom
  );
}

/**
 * Lo que hay que deshacer al cerrar, guardado por nodo. La tarea visible
 * vuelve a correr cada vez que el padre se redibuja (un loader que se
 * refresca después de cargar, el redibujado que sigue a la hidratación), y
 * Qwik ejecuta su limpieza antes de cada corrida. Si esa limpieza cerrara el
 * diálogo, un redibujado cualquiera lo cerraría solo: pasaba con el proyector
 * de asamblea medio segundo después de abrirlo. Por eso el estado se toma una
 * sola vez por apertura y se deshace sólo cuando el diálogo de verdad se cerró
 * o salió del documento.
 */
const openState = new WeakMap<
  HTMLDialogElement,
  { overflow: string; opener: HTMLElement | null }
>();

function restoreAfterClose(
  dialog: HTMLDialogElement,
  state: { overflow: string; opener: HTMLElement | null },
) {
  if (openState.get(dialog) !== state) return;
  openState.delete(dialog);
  // Mientras siga modal, el navegador impide enfocar el botón que quedó
  // afuera.
  if (dialog.open) dialog.close();
  document.body.style.overflow = state.overflow;
  // Si el diálogo se desmontó, el foco quedó en el `body`; si se cerró con
  // `close()`, el navegador ya lo devolvió y esto no cambia nada.
  if (state.opener?.isConnected) state.opener.focus({ preventScroll: true });
}

export const DialogFrame = component$<DialogFrameProps>((props) => {
  const dialogRef = useSignal<HTMLDialogElement>();

  // eslint-disable-next-line qwik/no-use-visible-task -- showModal(), el bloqueo de scroll y el retorno del foco necesitan el DOM real
  useVisibleTask$(
    ({ track, cleanup }) => {
      const open = track(() => props.open ?? true);
      const dialog = dialogRef.value;
      if (!dialog) return;
      if (!open) {
        const state = openState.get(dialog);
        if (state) restoreAfterClose(dialog, state);
        else if (dialog.open) dialog.close();
        return;
      }
      let state = openState.get(dialog);
      if (!state) {
        state = {
          overflow: document.body.style.overflow,
          opener:
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
        };
        openState.set(dialog, state);
        document.body.style.overflow = "hidden";
      }
      if (!dialog.open) dialog.showModal();
      const current = state;
      cleanup(() => {
        // La limpieza corre tanto al desmontar como antes de volver a correr.
        // Se decide en una microtarea: si para entonces el diálogo sigue en
        // el documento y abierto, fue un redibujado y no hay nada que deshacer.
        queueMicrotask(() => {
          if (dialog.isConnected && dialog.open && (props.open ?? true)) return;
          restoreAfterClose(dialog, current);
        });
      });
    },
    // "document-ready" y no la estrategia por visibilidad: un `<dialog>`
    // cerrado no ocupa lugar en pantalla y el observador nunca lo vería.
    { strategy: "document-ready" },
  );

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-label={props.labelledBy ? undefined : props.label}
      aria-labelledby={props.labelledBy}
      // `close` llega tanto por Escape (cancel → close) como por `close()`.
      onClose$={props.onClose$}
      onClick$={(event, el) => {
        if (props.closeOnBackdrop === false || event.target !== el) return;
        if (isOutsideRect(event, el.getBoundingClientRect())) props.onClose$();
      }}
      class={cx(
        // El navegador ya lo fija al viewport al abrirlo con showModal(); se
        // explicita para que no dependa de los estilos de cada motor.
        "fixed inset-0",
        PLACEMENT_CLASS[props.placement ?? "center"],
        props.backdropClass ?? "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        props.class,
      )}
    >
      <Slot />
    </dialog>
  );
});
