import {
  $,
  component$,
  useId,
  useOnWindow,
  useSignal,
  useVisibleTask$,
  type ClassList,
} from "@qwik.dev/core";
import {
  isItemBookmarked,
  removeBookmark,
  saveBookmark,
  type BookmarkItem,
} from "~/lib/bookmarks";
import { Icon, cx, triggerHapticFeedback } from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { useLocale, translate } from "~/lib/i18n";

/*
 * Tamaños del botón (D126). El cuadrado `md` mide lo mismo que el
 * "Compartir" de al lado (44 px): con 36 quedaba más bajo en la misma fila.
 * Con etiqueta, el texto visible es el mismo nombre accesible.
 */
const SQUARE = { sm: "size-8 text-sm", md: "size-11 text-base" } as const;
const LABELED = {
  sm: "h-8 gap-1.5 px-2.5 text-xs font-medium",
  md: "min-h-11 gap-1.5 px-3 text-sm font-medium",
} as const;

export const BookmarkButton = component$<{
  id: string;
  type: "claim" | "poll" | "debate" | "project";
  title: string;
  url: string;
  communityName?: string;
  size?: "sm" | "md";
  /**
   * Muestra el nombre como texto. Sola en su fila, una estrella sin palabra
   * no se leía como acción; junto a "Compartir" alcanza con el ícono.
   */
  showLabel?: boolean;
  class?: ClassList;
}>(
  ({
    id,
    type,
    title,
    url,
    communityName,
    size = "md",
    showLabel = false,
    class: cls,
  }) => {
    const locale = useLocale();
    const isSaved = useSignal(false);
    const error = useSignal("");
    const instanceId = useId();
    const errorId = `bookmark-error-${instanceId}`;

    const checkStatus = $(() => {
      isSaved.value = isItemBookmarked(id);
    });

    // eslint-disable-next-line qwik/no-use-visible-task -- el estado de guardado vive en localStorage; se lee cuando el botón se ve
    useVisibleTask$(() => {
      checkStatus();
    });

    useOnWindow(
      "agorbis-bookmarks-updated",
      $(() => {
        checkStatus();
      }),
    );

    const toggle = $(() => {
      const wasSaved = isSaved.value;
      let saved: boolean;
      if (wasSaved) {
        saved = removeBookmark(id);
      } else {
        const item: BookmarkItem = {
          id,
          type,
          title,
          url,
          savedAt: Date.now(),
          communityName,
        };
        saved = saveBookmark(item);
      }
      if (!saved) {
        error.value = translate(
          locale,
          wasSaved
            ? "No pudimos quitar el favorito. Volvé a intentarlo."
            : "No pudimos guardar el favorito en este dispositivo. Volvé a intentarlo.",
        );
        triggerHapticFeedback("warning");
        return;
      }
      error.value = "";
      isSaved.value = !wasSaved;
      triggerHapticFeedback("selection");
      playCivicSound("toggle");
    });

    const label = isSaved.value
      ? translate(locale, "Quitar de favoritos")
      : translate(locale, "Guardar en favoritos");

    return (
      // `flex-wrap`: con la etiqueta el botón es más ancho y el aviso de
      // error pasa abajo en lugar de apretarse en una columna angosta.
      <span class="inline-flex max-w-full flex-wrap items-center gap-2">
        <button
          type="button"
          onClick$={toggle}
          aria-pressed={isSaved.value}
          aria-describedby={error.value ? errorId : undefined}
          title={
            isSaved.value
              ? translate(locale, "Guardado en tus causas favoritas")
              : translate(locale, "Guardar causa en favoritos")
          }
          aria-label={label}
          class={cx(
            "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors duration-150 active:scale-95 motion-reduce:transform-none touch-manipulation",
            showLabel ? LABELED[size] : SQUARE[size],
            // Guardado con el ámbar del tema (`accent`), no con la paleta
            // cruda.
            isSaved.value
              ? "border-accent-400/80 bg-accent-50 text-accent-700 ring-2 ring-accent-400/30 shadow-xs animate-scale-pop dark:bg-accent-950/40 dark:text-accent-300"
              : "border-control bg-surface text-ink-muted hover:border-strong hover:text-ink-strong",
            cls as string,
          )}
        >
          {/* La estrella es un ícono propio (D126); el relleno marca lo
              guardado y pisa el `fill="none"` del trazo. */}
          <Icon
            name="star"
            class={isSaved.value ? "fill-current" : undefined}
          />
          {showLabel && <span>{label}</span>}
        </button>
        <span
          id={errorId}
          role="status"
          aria-live="polite"
          class={error.value ? "min-w-0 text-xs text-danger" : "sr-only"}
        >
          {error.value}
        </span>
      </span>
    );
  },
);
