import { component$ } from "@qwik.dev/core";

/**
 * Fondo del hero: el mismo globo de meridianos y paralelos que el favicon,
 * en grande y muy tenue.
 *
 * Reemplaza al degradado radial que había antes, que era el fondo genérico de
 * cualquier landing. Éste dice de qué trata el producto y además ata la
 * portada con el ícono de la pestaña.
 *
 * Va en SVG inline y no como imagen: pesa menos de 1 KB, hereda los colores del
 * tema y no agrega un request antes del LCP, que en esta página es el `h1` que
 * está justo encima.
 */
export const HeroBackdrop = component$(() => (
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 overflow-hidden"
  >
    {/* Calidez de marca detrás del título, apenas insinuada. */}
    <div class="absolute -top-40 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,var(--color-brand-200),transparent_70%)] opacity-40 blur-2xl dark:bg-[radial-gradient(ellipse_at_center,var(--color-brand-700),transparent_70%)] dark:opacity-30" />

    {/* El globo, descentrado a la derecha y recortado por el borde: sugiere que
        el planeta sigue más allá de la pantalla en vez de quedar como una
        pelotita decorativa en el medio. */}
    <svg
      viewBox="0 0 400 400"
      /* Oculto por debajo de `lg`: en un teléfono el globo cruza justo por
         detrás del titular y le come legibilidad, que es lo último que se
         puede sacrificar en el LCP de la portada. Ahí queda sólo el halo.
         En claro necesita más opacidad que en oscuro para leerse igual. */
      class="absolute right-[-16rem] top-[-4rem] hidden h-[40rem] w-[40rem] text-brand-500 opacity-[0.13] xl:block dark:opacity-[0.16]"
      fill="none"
      stroke="currentColor"
      stroke-width="1.1"
    >
      <circle cx="200" cy="200" r="150" />
      {/* Meridianos: elipses cada vez más angostas, como en el favicon. */}
      <ellipse cx="200" cy="200" rx="105" ry="150" />
      <ellipse cx="200" cy="200" rx="55" ry="150" />
      <line x1="200" y1="50" x2="200" y2="350" />
      {/* Paralelos: la cuerda del círculo a cada altura, calculada para que
          terminen exactamente sobre el borde y no asomen como púas.
          media cuerda = √(150² − Δy²) */}
      <line x1="110" y1="80" x2="290" y2="80" />
      <line x1="64.8" y1="135" x2="335.2" y2="135" />
      <line x1="50" y1="200" x2="350" y2="200" />
      <line x1="64.8" y1="265" x2="335.2" y2="265" />
      <line x1="110" y1="320" x2="290" y2="320" />
    </svg>

    {/* Difuminado inferior: el fondo se funde con la página en vez de cortarse
        con una línea dura. */}
    <div class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--surface-app)]" />
  </div>
));
