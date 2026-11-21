import {
  $,
  component$,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Card } from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  loadBookmarks,
  removeBookmark,
  type BookmarkItem,
} from "~/lib/bookmarks";
import { CONTENT_TYPES } from "~/lib/quota";
import { translate, useLocale } from "~/lib/i18n";

export const SavedBookmarksCard = component$(() => {
  const locale = useLocale();
  const bookmarks = useSignal<BookmarkItem[]>([]);
  const isLoaded = useSignal(false);
  const error = useSignal("");

  const refresh = $(() => {
    bookmarks.value = loadBookmarks();
    isLoaded.value = true;
  });

  // eslint-disable-next-line qwik/no-use-visible-task -- los guardados viven en localStorage; se leen cuando la tarjeta se ve
  useVisibleTask$(() => {
    refresh();
  });

  useOnWindow(
    "agorbis-bookmarks-updated",
    $(() => {
      refresh();
    }),
  );

  const handleRemove = $((id: string) => {
    if (!removeBookmark(id)) {
      error.value = translate(
        locale,
        "No pudimos quitar el favorito. Volvé a intentarlo.",
      );
      return;
    }
    error.value = "";
    refresh();
  });

  return (
    <Card class="mt-4 p-6 sm:p-8 transition-all duration-200 hover:shadow-soft">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold">
            {translate(locale, "Causas y temas guardados")}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Reclamos, encuestas y debates que marcaste como favoritos para seguir su evolución.",
            )}
          </p>
        </div>
        {bookmarks.value.length > 0 && (
          <span class="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            {bookmarks.value.length}{" "}
            {bookmarks.value.length === 1
              ? translate(locale, "guardada")
              : translate(locale, "guardadas")}
          </span>
        )}
      </div>

      <p
        role="status"
        aria-live="polite"
        class={error.value ? "mt-3 text-sm text-danger" : "sr-only"}
      >
        {error.value}
      </p>

      {!isLoaded.value ? (
        <div class="mt-4 py-8 text-center text-sm text-ink-faint">
          {translate(locale, "Cargando tus causas...")}
        </div>
      ) : bookmarks.value.length === 0 ? (
        <div class="mt-4">
          <p class="rounded-2xl border border-dashed border-strong px-4 py-6 text-center text-sm text-ink-faint">
            {translate(locale, "No guardaste ninguna causa todavía.")}{" "}
            <Link
              href="/explorar"
              class="font-medium text-brand hover:underline"
            >
              {translate(locale, "Explorar causas del mapa")}
            </Link>
          </p>
        </div>
      ) : (
        <ul class="mt-4 space-y-2">
          {bookmarks.value.map((item) => (
            <li key={item.id}>
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-subtle px-3 py-2.5 transition-all duration-150 hover:border-brand-500 hover:-translate-y-0.5 hover:shadow-xs">
                <Link
                  href={item.url}
                  class="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span aria-hidden="true" class="text-lg shrink-0">
                    {CONTENT_TYPES[item.type]?.emoji ?? "📌"}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p
                      dir="auto"
                      class="truncate text-sm font-medium text-ink-strong"
                    >
                      {item.title}
                    </p>
                    {item.communityName && (
                      <p class="truncate text-xs text-ink-faint">
                        {item.communityName}
                      </p>
                    )}
                  </div>
                  <RelativeTime
                    value={new Date(item.savedAt).toISOString()}
                    class="shrink-0 text-xs text-ink-faint"
                  />
                </Link>
                <button
                  type="button"
                  onClick$={() => handleRemove(item.id)}
                  title={translate(locale, "Quitar de favoritos")}
                  aria-label={translate(
                    locale,
                    "Quitar de favoritos: {{title}}",
                    { title: item.title },
                  )}
                  class="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-all duration-150 hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation cursor-pointer"
                >
                  <svg
                    aria-hidden="true"
                    class="size-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
