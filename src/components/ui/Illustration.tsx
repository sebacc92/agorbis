import { component$ } from "@qwik.dev/core";
import { cx } from "./cx";

/**
 * Ilustraciones de línea propias para estados vacíos, 404 y bienvenida
 * (D123). Trazo fino en el violeta de la marca con un relleno suave; el
 * emoji brújula o la lupa cambiaban con cada sistema y no pertenecían a
 * nadie. Viewbox 96×96, color heredado.
 */
export type IllustrationName =
  | "compass"
  | "empty"
  | "search"
  | "sprout"
  | "done"
  | "locked"
  | "tools"
  | "people";

const ART: Record<IllustrationName, string> = {
  compass:
    '<circle cx="48" cy="48" r="30" class="fill-brand-500/10" /><circle cx="48" cy="48" r="30" /><path d="M48 18v6M48 72v6M18 48h6M72 48h6" /><path d="m60 36-7 17-17 7 7-17 17-7Z" class="fill-brand-500/25" /><circle cx="48" cy="48" r="3" class="fill-current" />',
  empty:
    '<path d="M20 40h56v30a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V40Z" class="fill-brand-500/10" /><path d="M20 40h56v30a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V40Z" /><path d="M20 40l8-16h40l8 16M20 40h18l4 8h12l4-8h18" /><path d="M34 14l-3-6M48 12V5M62 14l3-6" />',
  search:
    '<circle cx="42" cy="42" r="22" class="fill-brand-500/10" /><circle cx="42" cy="42" r="22" /><path d="m58 58 20 20" stroke-width="4" /><path d="M30 42a12 12 0 0 1 12-12" />',
  sprout:
    '<path d="M24 76h48" /><path d="M36 76c0-10 4-18 12-24" /><path d="M48 52c-2-12 6-22 18-22 0 12-6 20-18 22Z" class="fill-brand-500/15" /><path d="M46 60c0-8-6-14-14-14 0 8 6 14 14 14Z" class="fill-brand-500/10" /><path d="M48 52v24" />',
  done: '<circle cx="48" cy="48" r="30" class="fill-brand-500/10" /><circle cx="48" cy="48" r="30" /><path d="m33 49 10 10 20-22" stroke-width="4" />',
  locked:
    '<rect x="26" y="42" width="44" height="34" rx="6" class="fill-brand-500/10" /><rect x="26" y="42" width="44" height="34" rx="6" /><path d="M34 42v-8a14 14 0 0 1 28 0v8" /><circle cx="48" cy="58" r="4" class="fill-current" /><path d="M48 62v6" />',
  tools:
    '<path d="m30 66 26-26" stroke-width="4" /><path d="M56 40a12 12 0 0 0 16-14l-8 8-6-2-2-6 8-8a12 12 0 0 0-14 16" class="fill-brand-500/15" /><path d="m24 60 12 12-6 6-12-12z" class="fill-brand-500/25" /><path d="M64 56 76 68" stroke-width="4" />',
  people:
    '<circle cx="36" cy="36" r="10" class="fill-brand-500/15" /><circle cx="36" cy="36" r="10" /><path d="M16 74c0-12 9-20 20-20s20 8 20 20" class="fill-brand-500/10" /><path d="M16 74c0-12 9-20 20-20s20 8 20 20" /><circle cx="62" cy="34" r="8" /><path d="M62 52c10 0 18 7 18 18" />',
};

export const Illustration = component$<{
  name: IllustrationName;
  class?: string;
}>(({ name, class: cls }) => (
  <svg
    viewBox="0 0 96 96"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={cx("size-24 text-brand", cls)}
    aria-hidden="true"
    dangerouslySetInnerHTML={ART[name]}
  />
));
