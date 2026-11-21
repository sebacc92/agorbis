import {
  $,
  component$,
  sync$,
  useId,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { cx } from "~/components/ui";
import { LEVEL_NAMES } from "~/lib/constants";
import {
  searchCommunities,
  type SearchHit,
} from "~/components/layout/CommunitySearch";
import { useLocale, translate } from "~/lib/i18n";

export const CommunityPicker = component$<{
  name: string;
  label: string;
  hint?: string;
  error?: string | string[];
  required?: boolean;
  initial?: SearchHit | null;
  nativeFallback?: boolean;
  postedSlug?: string;
  class?: string;
}>(
  ({
    name,
    label,
    hint,
    error,
    required,
    initial = null,
    nativeFallback = false,
    postedSlug = "",
    class: className,
  }) => {
    const locale = useLocale();
    const enhanced = useSignal(!nativeFallback);
    const nativeField = useSignal<HTMLInputElement>();
    // eslint-disable-next-line qwik/no-use-visible-task -- mejora el campo HTML sólo si no hay un valor escrito que se perdería al cambiarlo
    useVisibleTask$(
      () => {
        const value = nativeField.value?.value ?? "";
        // Una sugerencia que llegó cargada no es texto escrito: el selector
        // la muestra elegida, con su nombre en vez del identificador.
        const suggested = !postedSlug && !!initial && value === initial.slug;
        if (nativeFallback && (!value || suggested)) enhanced.value = true;
      },
      { strategy: "document-ready" },
    );
    const query = useSignal("");
    const hits = useSignal<SearchHit[]>([]);
    const selected = useSignal<SearchHit | null>(initial);
    const open = useSignal(false);
    const active = useSignal(-1);
    const loading = useSignal(false);
    const searchFailed = useSignal(false);
    const requestVersion = useSignal(0);
    const instanceId = useId();
    const inputId = `community-picker-input-${instanceId}`;
    const resultsId = `community-picker-results-${instanceId}`;
    const hintId = `community-picker-hint-${instanceId}`;
    const errorId = `community-picker-error-${instanceId}`;
    const errorMessage = Array.isArray(error) ? error[0] : error;
    const describedBy = [errorMessage ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ");

    useTask$(({ track, cleanup }) => {
      const term = track(() => query.value);
      const version = requestVersion.value + 1;
      requestVersion.value = version;
      active.value = -1;
      hits.value = [];
      searchFailed.value = false;

      if (term.trim().length < 2 || selected.value) {
        loading.value = false;
        return;
      }

      loading.value = true;
      const timer = setTimeout(async () => {
        try {
          const nextHits = await searchCommunities(term, locale);
          if (requestVersion.value !== version) return;
          hits.value = nextHits;
        } catch {
          if (requestVersion.value !== version) return;
          searchFailed.value = true;
        } finally {
          if (requestVersion.value === version) loading.value = false;
        }
      }, 180);
      cleanup(() => clearTimeout(timer));
    });

    const selectHit = $((hit: SearchHit) => {
      // Invalida también una consulta que ya salió del debounce.
      requestVersion.value += 1;
      selected.value = hit;
      query.value = "";
      hits.value = [];
      active.value = -1;
      loading.value = false;
      searchFailed.value = false;
      open.value = false;
    });

    const handleKeyDown = $((event: KeyboardEvent) => {
      if (event.key === "Escape") {
        open.value = false;
        active.value = -1;
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (query.value.trim().length < 2) return;
        open.value = true;

        if (hits.value.length === 0) {
          active.value = -1;
          return;
        }

        active.value =
          event.key === "ArrowDown"
            ? (active.value + 1) % hits.value.length
            : active.value <= 0
              ? hits.value.length - 1
              : active.value - 1;

        document
          .getElementById(`${resultsId}-option-${active.value}`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }

      if (event.key === "Enter") {
        const hit = hits.value[active.value];
        if (hit) void selectHit(hit);
      }
    });

    const resultsVisible =
      open.value && !selected.value && query.value.trim().length >= 2;

    if (!enhanced.value)
      return (
        <div class={cx("space-y-1.5", className)}>
          <label
            for={inputId}
            class="block text-sm font-medium text-ink-strong"
          >
            {translate(locale, label)}
          </label>
          <input
            ref={nativeField}
            id={inputId}
            name={name}
            value={postedSlug || initial?.slug || ""}
            required={required}
            maxLength={160}
            aria-invalid={errorMessage ? "true" : undefined}
            aria-describedby={describedBy || undefined}
            class="min-h-11 w-full rounded-2xl border border-control bg-surface px-3.5 py-2.5 text-sm"
          />
          <p id={hintId} class="text-xs text-ink-muted">
            {translate(
              locale,
              "Ingresá el identificador de la URL de esa comunidad, por ejemplo mar-del-plata. Lo comprobaremos al enviar.",
            )}
          </p>
          {errorMessage && (
            <p id={errorId} role="alert" class="text-xs text-danger">
              {translate(locale, errorMessage)}
            </p>
          )}
        </div>
      );

    return (
      <div class={cx("space-y-1.5", className)}>
        <label for={inputId} class="block text-sm font-medium text-ink-strong">
          {translate(locale, label)}
          {required && (
            <span class="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input type="hidden" name={name} value={selected.value?.slug ?? ""} />
        {selected.value ? (
          <div
            class={cx(
              "flex min-h-11 items-center gap-2 rounded-2xl border bg-brand-50 px-3.5 py-2 dark:bg-brand-950/30",
              errorMessage ? "border-danger-500" : "border-brand-500/40",
            )}
          >
            <span aria-hidden="true">{selected.value.emoji ?? "📍"}</span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">
              {selected.value.name}
            </span>
            <span class="text-xs text-ink-faint">
              {translate(
                locale,
                LEVEL_NAMES[selected.value.level] ?? "Comunidad",
              )}
            </span>
            <button
              type="button"
              /* "Cambiar" solo no dice qué se cambia cuando se lo escucha
               fuera de contexto, y con 24 px de alto era la mitad del mínimo
               táctil. */
              aria-label={translate(locale, "Cambiar comunidad: {{name}}", {
                name: selected.value.name,
              })}
              class="touch-target shrink-0 rounded-lg px-2 py-1 text-xs text-brand hover:bg-brand-100 dark:hover:bg-brand-900"
              onClick$={() => {
                selected.value = null;
                query.value = "";
                requestVersion.value += 1;
                setTimeout(() => document.getElementById(inputId)?.focus());
              }}
            >
              {translate(locale, "Cambiar")}
            </button>
          </div>
        ) : (
          <div class="relative">
            <input
              id={inputId}
              type="search"
              enterKeyHint="search"
              role="combobox"
              aria-expanded={resultsVisible}
              aria-controls={resultsId}
              aria-autocomplete="list"
              aria-invalid={errorMessage ? "true" : undefined}
              aria-activedescendant={
                resultsVisible && active.value >= 0
                  ? `${resultsId}-option-${active.value}`
                  : undefined
              }
              aria-describedby={describedBy || undefined}
              value={query.value}
              autocomplete="off"
              required={required}
              placeholder={translate(locale, "Escribí al menos dos letras…")}
              class={cx(
                "min-h-11 w-full rounded-2xl border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25",
                errorMessage ? "border-danger-500" : "border-control",
              )}
              onInput$={(_, element) => {
                requestVersion.value += 1;
                query.value = element.value;
                hits.value = [];
                active.value = -1;
                searchFailed.value = false;
                loading.value = element.value.trim().length >= 2;
                open.value = true;
              }}
              onFocus$={() => (open.value = true)}
              onBlur$={() =>
                setTimeout(() => {
                  open.value = false;
                  active.value = -1;
                }, 150)
              }
              onKeyDown$={[
                sync$((event: KeyboardEvent, element: HTMLInputElement) => {
                  const hasActiveOption = element.hasAttribute(
                    "aria-activedescendant",
                  );
                  const isOpen =
                    element.getAttribute("aria-expanded") === "true";

                  if (
                    event.key === "ArrowDown" ||
                    event.key === "ArrowUp" ||
                    (event.key === "Enter" && hasActiveOption) ||
                    (event.key === "Escape" && isOpen)
                  ) {
                    event.preventDefault();
                  }
                }),
                handleKeyDown,
              ]}
            />
            {resultsVisible && (
              <ul
                id={resultsId}
                role="listbox"
                aria-label={translate(locale, "Comunidades encontradas")}
                aria-busy={loading.value}
                aria-live="polite"
                class="scrollbar-slim absolute z-30 mt-1 max-h-72 w-full overflow-auto overscroll-contain rounded-2xl border border-subtle bg-surface p-1 shadow-lift"
              >
                {loading.value ? (
                  <li
                    role="option"
                    aria-disabled="true"
                    aria-selected="false"
                    class="flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm text-ink-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      class="size-4 shrink-0 animate-spin text-brand"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" class="opacity-25" />
                      <path stroke-linecap="round" d="M21 12a9 9 0 00-9-9" />
                    </svg>
                    {translate(locale, "Buscando comunidades…")}
                  </li>
                ) : searchFailed.value ? (
                  <li
                    role="option"
                    aria-disabled="true"
                    aria-selected="false"
                    class="rounded-xl px-3 py-3 text-sm text-danger"
                  >
                    {translate(locale, "No pudimos buscar. Probá de nuevo.")}
                  </li>
                ) : hits.value.length === 0 ? (
                  <li
                    role="option"
                    aria-disabled="true"
                    aria-selected="false"
                    class="rounded-xl px-3 py-3 text-sm text-ink-muted"
                  >
                    {translate(
                      locale,
                      "No encontramos comunidades con ese nombre.",
                    )}
                  </li>
                ) : (
                  hits.value.map((hit, index) => (
                    <li
                      key={hit.slug}
                      id={`${resultsId}-option-${index}`}
                      role="option"
                      aria-selected={active.value === index}
                      preventdefault:pointerdown={true}
                      class={cx(
                        "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm",
                        active.value === index ? "bg-muted" : "hover:bg-muted",
                      )}
                      onMouseEnter$={() => (active.value = index)}
                      onPointerDown$={() => selectHit(hit)}
                      onClick$={() => selectHit(hit)}
                    >
                      <span aria-hidden="true">{hit.emoji ?? "📍"}</span>
                      <span class="min-w-0 flex-1 truncate font-medium text-ink-strong">
                        {hit.name}
                      </span>
                      <span class="text-xs text-ink-faint">
                        {translate(
                          locale,
                          LEVEL_NAMES[hit.level] ?? "Comunidad",
                        )}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}
        {errorMessage && (
          <p id={errorId} role="alert" class="text-xs text-danger">
            {translate(locale, errorMessage)}
          </p>
        )}
        {hint && (
          <p id={hintId} class="text-xs text-ink-faint">
            {translate(locale, hint)}
          </p>
        )}
      </div>
    );
  },
);
