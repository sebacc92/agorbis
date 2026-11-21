import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import type { CommunityRef } from "~/lib/community";
import { routes } from "~/lib/community";
import { Icon, cx } from "~/components/ui";
import { useLocale, translate } from "~/lib/i18n";

/**
 * 🌍 › 🌎 América del Sur › 🇦🇷 Argentina › Buenos Aires › Mar del Plata
 *
 * Omnipresente en la app. Muestra "… › Buenos Aires › Mar del Plata": lo
 * cercano a la vista y los ancestros detrás de los puntos, que al tocarlos
 * despliegan la cadena entera. Antes la cadena completa se desplazaba y la
 * pantalla mostraba "Tierra › América del Sur › Argentina ›" con la comunidad
 * actual afuera (décima ronda, mejora 4). Con tres migas el colapso es sólo
 * de teléfono; con más de tres vale en todo ancho (D124): cada detalle
 * repetía la cadena completa con cinco emojis arriba del título.
 */
/** Cuántas migas quedan a la vista antes de colapsar el resto. */
const VISIBLE_ON_PHONE = 2;
/** Desde cuántas migas el colapso también vale en escritorio. */
const COLLAPSE_EVERYWHERE_FROM = 4;

export const CommunityBreadcrumb = component$<{
  chain: CommunityRef[];
  /** La última no es link cuando ya estás parado en ella. */
  currentIsLink?: boolean;
  /**
   * Destino alternativo para navegar la cadena en un selector jerárquico.
   * Si no se pasa, las migas siguen abriendo las comunidades públicas.
   */
  hrefBase?: string;
  class?: string;
}>(({ chain, currentIsLink = false, hrefBase, class: cls }) => {
  const locale = useLocale();
  const list = useSignal<HTMLOListElement>();
  const currentItem = useSignal<HTMLElement>();
  // El despliegue se guarda atado a la cadena que lo pidió: al cambiar de
  // comunidad la clave cambia y la miga vuelve a colapsarse sola. Antes una
  // tarea seguía la cadena, y leer datos del loader desde una tarea hace que
  // Qwik Router los vuelva a pedir y redibuje la página medio segundo después
  // de cargar (D99); en el alta eso borraba lo tipeado en el buscador.
  const chainKey = chain.map((community) => community.id).join("/");
  const expandedFor = useSignal<string | null>(null);
  const expanded = expandedFor.value === chainKey;
  // Sin JavaScript todo queda visible y el riel se desliza como antes: el
  // colapso recién se aplica cuando la tarea visible confirma que hay quien
  // lo despliegue.
  const enhanced = useSignal(false);
  const collapsible = enhanced.value && chain.length > VISIBLE_ON_PHONE;
  const everywhere = chain.length >= COLLAPSE_EVERYWHERE_FROM;

  // En cadenas largas, el extremo útil es el lugar actual. El scroll nativo
  // sigue permitiendo volver a cualquier ancestro, pero no obliga a descubrir
  // primero que las últimas migas quedaron fuera del teléfono.
  // eslint-disable-next-line qwik/no-use-visible-task -- depende del ancho y del scroll reales del breadcrumb
  useVisibleTask$(() => {
    enhanced.value = true;
    const rail = list.value;
    const current = currentItem.value;
    if (!rail || !current || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollLeft =
      current.offsetLeft + current.offsetWidth - rail.clientWidth;
  });

  if (chain.length === 0) return null;

  return (
    <nav
      aria-label={translate(locale, "Cadena de comunidades")}
      class={cx("min-w-0", cls)}
    >
      <ol
        ref={list}
        class="scrollbar-slim flex items-center gap-1 overflow-x-auto text-sm whitespace-nowrap scroll-smooth snap-x snap-mandatory py-0.5"
      >
        {collapsible && !expanded && (
          <li
            class={cx("flex shrink-0 items-center", !everywhere && "sm:hidden")}
          >
            <button
              type="button"
              aria-label={translate(
                locale,
                "Mostrar toda la cadena de comunidades",
              )}
              aria-expanded="false"
              class="touch-target inline-flex min-h-9 items-center rounded-lg px-2 text-ink-muted transition-colors hover:bg-muted hover:text-ink-strong"
              onClick$={() => {
                expandedFor.value = chainKey;
                // El botón desaparece al desplegar: el foco pasa al primer
                // ancestro revelado, para teclado y lector de pantalla.
                requestAnimationFrame(() => {
                  list.value
                    ?.querySelector<HTMLElement>("[data-breadcrumb-item] a")
                    ?.focus();
                });
              }}
            >
              <Icon name="more" class="text-base" />
            </button>
          </li>
        )}
        {chain.map((community, i) => {
          const isLast = i === chain.length - 1;
          // En teléfono sólo las últimas quedan a la vista; el resto espera
          // detrás de los puntos hasta que alguien los toque.
          const hiddenOnPhone =
            collapsible && !expanded && i < chain.length - VISIBLE_ON_PHONE;
          const content = (
            <>
              {community.emoji && (
                <span aria-hidden="true" class="mr-1">
                  {community.emoji}
                </span>
              )}
              {community.name}
            </>
          );

          return (
            <li
              key={community.id}
              data-breadcrumb-item
              class={cx(
                "shrink-0 items-center gap-1.5 snap-end",
                hiddenOnPhone
                  ? everywhere
                    ? "hidden"
                    : "hidden sm:flex"
                  : "flex",
              )}
            >
              {/* Separador uniforme (D124): el "›" tipográfico cambiaba de
                  peso con la fuente; el chevron es el mismo trazo que el
                  resto de los íconos. */}
              {i > 0 && (
                <Icon name="chevron-right" class="text-xs text-ink-faint" />
              )}
              {isLast && !currentIsLink ? (
                <span
                  ref={currentItem}
                  class="inline-flex items-center rounded-lg border border-subtle/40 bg-muted px-2 py-0.5 font-semibold text-ink-strong shadow-2xs"
                  aria-current="page"
                >
                  {content}
                </span>
              ) : (
                <Link
                  href={
                    hrefBase
                      ? `${hrefBase}${community.slug}`
                      : routes.community(community.slug)
                  }
                  class="touch-target inline-flex items-center rounded-lg px-2 py-1 text-ink-muted transition-all hover:bg-muted hover:text-ink-strong active:scale-95"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
