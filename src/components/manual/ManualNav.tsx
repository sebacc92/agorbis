import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { cx } from "~/components/ui";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";
import { useLocale, translate } from "~/lib/i18n";
import { MANUAL_SECTIONS } from "~/lib/manual-content";
import { MANUAL_FAQ_CATEGORIES, categoryAnchor } from "~/lib/manual-faq";

/** Sección cuyo submenú son los temas de las preguntas de detalle. */
const DETAIL_SECTION = "detalle";

const TOPIC_ANCHORS: readonly string[] = MANUAL_FAQ_CATEGORIES.map((category) =>
  categoryAnchor(category.id),
);

/**
 * Menú del manual, con la sección actual marcada.
 *
 * Es un solo `<nav>` con dos formas. En teléfono y tablet es una franja
 * horizontal pegada arriba; desde `lg` es una columna fija a la izquierda, con
 * los temas de las preguntas como submenú. Antes el índice dejaba de estar
 * fijo en escritorio, así que el resaltado de la sección actual sólo lo veía
 * quien leía desde el teléfono.
 *
 * Qué sección se está leyendo lo resuelve un observador de intersección —no
 * hay forma de saberlo sin medir la pantalla— y `aria-current` convierte el
 * resaltado en información y no en decoración. En la franja horizontal la
 * pastilla marcada se trae a la vista: sin eso, al llegar a las preguntas
 * quedaba fuera de pantalla, a la derecha.
 *
 * Sin JavaScript queda una lista de enlaces que funcionan.
 */
export const ManualNav = component$(() => {
  const locale = useLocale();
  const active = useSignal("");
  const navRef = useSignal<HTMLElement>();

  // eslint-disable-next-line qwik/no-use-visible-task -- depende de qué se ve realmente en pantalla
  useVisibleTask$(({ cleanup }) => {
    const reveal = (id: string) => {
      const nav = navRef.value;
      if (!nav) return;
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      // Se desplaza el menú, no la página: `scrollIntoView` sobre un elemento
      // fijo también movería el documento.
      if (nav.scrollWidth > nav.clientWidth) {
        // Franja horizontal: los temas no se muestran, vale su sección.
        const sectionId = TOPIC_ANCHORS.includes(id) ? DETAIL_SECTION : id;
        const link = nav.querySelector<HTMLElement>(
          `[data-manual-link="${sectionId}"]`,
        );
        if (!link) return;
        nav.scrollTo({
          left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2,
          behavior,
        });
        return;
      }
      if (nav.scrollHeight > nav.clientHeight) {
        // Columna más alta que la ventana: el tema actual queda a la vista.
        const link = nav.querySelector<HTMLElement>(
          `[data-manual-link="${id}"]`,
        );
        if (!link) return;
        nav.scrollTo({
          top: link.offsetTop - (nav.clientHeight - link.offsetHeight) / 2,
          behavior,
        });
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          active.value = entry.target.id;
          reveal(entry.target.id);
        }
      },
      // La franja activa es el tercio superior: una sección cuenta como
      // "actual" cuando su comienzo llegó arriba, no cuando asoma abajo.
      { rootMargin: "-20% 0px -70% 0px" },
    );

    const ids = [
      ...MANUAL_SECTIONS.map((section) => section.id),
      ...TOPIC_ANCHORS,
    ];
    for (const id of ids) {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    }

    cleanup(() => observer.disconnect());
  });

  const inDetail = TOPIC_ANCHORS.includes(active.value);

  return (
    <nav
      ref={navRef}
      aria-label={translate(locale, "Secciones del manual")}
      class="scrollbar-slim sticky top-16 z-20 -mx-4 overflow-x-auto overscroll-x-contain border-y border-subtle bg-app/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-24 lg:mx-0 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-x-visible lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:pr-2 lg:backdrop-blur-none"
    >
      <p class="hidden px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:block">
        {translate(locale, "En este manual")}
      </p>
      <ul class="flex snap-x snap-proximity gap-2 lg:block lg:space-y-0.5">
        {MANUAL_SECTIONS.map((section) => {
          const isActive =
            active.value === section.id ||
            (section.id === DETAIL_SECTION && inDetail);
          return (
            <li key={section.id} class="shrink-0 snap-start">
              <a
                href={`#${section.id}`}
                data-manual-link={section.id}
                // Dentro del detalle la ubicación es el tema: la sección sólo
                // se resalta, para no anunciar dos lugares a la vez.
                aria-current={
                  isActive && !(section.id === DETAIL_SECTION && inDetail)
                    ? "location"
                    : undefined
                }
                class={cx(
                  "inline-flex min-h-11 items-center rounded-full border px-3.5 py-2 text-sm font-medium transition-colors lg:flex lg:min-h-10 lg:rounded-lg lg:border-0 lg:px-3",
                  isActive
                    ? "border-brand-600 bg-brand-50 text-brand lg:font-semibold dark:bg-brand-950/50"
                    : "border-control bg-surface text-ink-muted hover:border-brand-500 hover:text-brand lg:bg-transparent lg:hover:bg-muted",
                )}
              >
                {translate(locale, section.label)}
              </a>
              {section.id === DETAIL_SECTION && (
                <ul class="mt-0.5 ml-3 hidden space-y-0.5 border-l border-subtle pl-2 lg:block">
                  {MANUAL_FAQ_CATEGORIES.map((category) => {
                    const anchor = categoryAnchor(category.id);
                    const isTopic = active.value === anchor;
                    return (
                      <li key={category.id}>
                        <a
                          href={`#${anchor}`}
                          data-manual-link={anchor}
                          aria-current={isTopic ? "location" : undefined}
                          class={cx(
                            "flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm transition-colors",
                            isTopic
                              ? "font-semibold text-brand"
                              : "text-ink-muted hover:bg-muted hover:text-brand",
                          )}
                        >
                          {translate(locale, category.label)}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
