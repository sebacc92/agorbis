import { component$, Slot, type ClassList } from "@qwik.dev/core";
import { cx } from "./cx";

/**
 * Una línea de datos cortos separados por un punto medio: autor, fecha,
 * comunidad, conteos.
 *
 * Cada hijo directo es un dato. Los puntos los pone el CSS (`.meta-line` en
 * `global.css`), no el marcado: así ninguno queda colgando al final o al
 * principio de un renglón cuando la línea envuelve en un teléfono. Lo que
 * tenga que ir junto (un avatar y su nombre) va dentro de un mismo hijo.
 */
export const MetaLine = component$<{ class?: ClassList }>(({ class: cls }) => (
  <div class={cx("meta-line", cls as string)}>
    <div class="meta-line-items">
      <Slot />
    </div>
  </div>
));
