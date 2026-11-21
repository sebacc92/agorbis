import {
  $,
  component$,
  sync$,
  useId,
  useSignal,
  useTask$,
} from "@qwik.dev/core";
import { server$, useLocation } from "@qwik.dev/router";
import { Badge, Select } from "~/components/ui";
import type { ContentType } from "~/lib/database.types.helpers";
import { createServerSupabase } from "~/lib/supabase";
import { useLocale, translate } from "~/lib/i18n";
import { postedText } from "~/components/forms/posted-fields";
import { isUuid } from "~/lib/http";
import {
  findRelationTargets,
  relationReturnHref,
  relationSearchHref,
  type RelationSelection,
  type RelationSearchTarget,
} from "~/lib/relation-picker";

type Target = RelationSearchTarget;

const TYPES: Record<ContentType, { label: string; emoji: string }> = {
  poll: { label: "Encuesta", emoji: "🗳️" },
  debate: { label: "Debate", emoji: "💬" },
  claim: { label: "Reclamo", emoji: "📣" },
  project: { label: "Proyecto", emoji: "🛠️" },
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  open: "Abierto",
  under_review: "En evaluación",
  acknowledged: "Recibido",
  funding: "Juntando apoyo",
  in_progress: "En ejecución",
  resolved: "Resuelto",
  completed: "Completado",
  closed: "Cerrado",
  proposal: "Propuesta",
  rejected: "Respuesta negativa",
};

export const searchRelationTargets = server$(async function (
  query: string,
  kind: ContentType | "",
  sourceType: ContentType,
  sourceId: string,
): Promise<Target[]> {
  const db = createServerSupabase(this);
  const result = await findRelationTargets(
    db,
    query,
    kind,
    sourceType,
    sourceId,
  );
  if (result.failed) throw new Error("Could not search relation targets");
  return result.items;
});

export const ContentRelationPicker = component$<{
  sourceType: ContentType;
  sourceId: string;
  posted?: FormData;
  error?: string | string[];
  selection?: RelationSelection | null;
}>(({ sourceType, sourceId, posted, error, selection }) => {
  const locale = useLocale();
  const location = useLocation();
  const query = useSignal("");
  const kind = useSignal<ContentType | "">("");
  const results = useSignal<Target[]>([]);
  const postedId = postedText(posted, "target_id");
  const postedType = postedText(posted, "target_type");
  const selected = useSignal<Pick<Target, "kind" | "id" | "title"> | null>(
    isUuid(postedId) && Object.hasOwn(TYPES, postedType)
      ? {
          kind: postedType as ContentType,
          id: postedId,
          title: postedText(
            posted,
            "target_title",
            translate(locale, "Publicación seleccionada"),
          ),
        }
      : !posted && selection
        ? {
            ...selection,
            title:
              selection.title || translate(locale, "Publicación seleccionada"),
          }
        : null,
  );
  const loading = useSignal(false);
  const open = useSignal(false);
  const active = useSignal(-1);
  const searchFailed = useSignal(false);
  const requestVersion = useSignal(0);
  const instanceId = useId();
  const typeId = `relation-target-type-${instanceId}`;
  const searchId = `relation-${sourceId}-target_id`;
  const searchLabelId = `relation-target-search-label-${instanceId}`;
  const resultsId = `relation-target-results-${instanceId}`;

  useTask$(({ track, cleanup }) => {
    const term = track(() => query.value);
    const targetKind = track(() => kind.value);
    const version = requestVersion.value + 1;
    requestVersion.value = version;
    active.value = -1;
    results.value = [];
    searchFailed.value = false;

    if (term.trim().length < 3 || selected.value) {
      loading.value = false;
      return;
    }

    loading.value = true;
    const timer = setTimeout(async () => {
      try {
        const nextResults = await searchRelationTargets(
          term,
          targetKind,
          sourceType,
          sourceId,
        );
        if (requestVersion.value !== version) return;
        results.value = nextResults;
      } catch {
        if (requestVersion.value !== version) return;
        searchFailed.value = true;
      } finally {
        if (requestVersion.value === version) loading.value = false;
      }
    }, 180);
    cleanup(() => clearTimeout(timer));
  });

  const selectResult = $((result: Target) => {
    requestVersion.value += 1;
    selected.value = result;
    query.value = "";
    results.value = [];
    active.value = -1;
    loading.value = false;
    searchFailed.value = false;
    open.value = false;
  });

  // `Select` es un componente Qwik, no un elemento `<select>` directo: sus
  // listeners cruzan el límite de componente y deben entregarse como QRL.
  const handleKindChange = $((_: Event, element: HTMLSelectElement) => {
    const wasSelected = Boolean(selected.value);
    requestVersion.value += 1;
    kind.value = element.value as ContentType | "";
    selected.value = null;
    results.value = [];
    active.value = -1;
    searchFailed.value = false;
    loading.value = query.value.trim().length >= 3;
    open.value = true;
    if (wasSelected) {
      setTimeout(() => document.getElementById(searchId)?.focus());
    }
  });

  const handleKeyDown = $((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      open.value = false;
      active.value = -1;
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (query.value.trim().length < 3) return;
      open.value = true;

      if (results.value.length === 0) {
        active.value = -1;
        return;
      }

      active.value =
        event.key === "ArrowDown"
          ? (active.value + 1) % results.value.length
          : active.value <= 0
            ? results.value.length - 1
            : active.value - 1;

      document
        .getElementById(`${resultsId}-option-${active.value}`)
        ?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (event.key === "Enter") {
      const result = results.value[active.value];
      if (result) void selectResult(result);
    }
  });

  const resultsVisible =
    open.value && !selected.value && query.value.trim().length >= 3;

  return (
    <div class="min-w-0 space-y-3 sm:col-span-2">
      <input
        type="hidden"
        name="volver"
        value={relationReturnHref(
          sourceType,
          sourceId,
          location.url.pathname + location.url.search,
        )}
      />
      {locale === "en" && <input type="hidden" name="lang" value="en" />}
      <button
        type="submit"
        formAction="/vincular/"
        formMethod="get"
        formNoValidate
        data-search-href={relationSearchHref(
          sourceType,
          sourceId,
          location.url.pathname + location.url.search,
        )}
        class="inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-2"
        onClick$={sync$((event: MouseEvent, button: HTMLButtonElement) => {
          if (!button.form) return;
          event.preventDefault();
          const url = new URL(
            button.dataset.searchHref ?? button.formAction,
            window.location.href,
          );
          const fields = new FormData(button.form);
          url.searchParams.set(
            "relation_type",
            String(fields.get("relation_type") ?? "related"),
          );
          url.searchParams.set("q", String(fields.get("q") ?? ""));
          url.searchParams.set(
            "tipo",
            String(fields.get("relation_target_filter") ?? ""),
          );
          window.location.assign(url.href);
        })}
      >
        {translate(locale, "Buscar publicaciones en otra página")}
      </button>
      <input
        type="hidden"
        name="target_type"
        value={selected.value?.kind ?? ""}
      />
      <input type="hidden" name="target_id" value={selected.value?.id ?? ""} />
      <input
        type="hidden"
        name="target_title"
        value={selected.value?.title ?? ""}
      />
      <div class="grid min-w-0 gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div>
          <label for={typeId} class="block text-sm font-medium text-ink-strong">
            {translate(locale, "Tipo de contenido")}
          </label>
          <Select
            name="relation_target_filter"
            id={typeId}
            class="mt-1.5"
            value={kind.value}
            onChange$={handleKindChange}
          >
            <option value="">{translate(locale, "Todos")}</option>
            {Object.entries(TYPES).map(([value, meta]) => (
              <option key={value} value={value}>
                {translate(locale, meta.label)}
              </option>
            ))}
          </Select>
        </div>
        <div class="relative min-w-0">
          <label
            id={searchLabelId}
            for={searchId}
            class="block text-sm font-medium text-ink-strong"
          >
            {translate(locale, "Buscar por título")}
          </label>
          {selected.value ? (
            <div
              id={searchId}
              tabIndex={-1}
              role="group"
              aria-labelledby={searchLabelId}
              aria-describedby={error ? `${searchId}-error` : undefined}
              class="mt-1.5 flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-2xl border border-brand-500/40 bg-brand-50 px-3 dark:bg-brand-950/30"
            >
              <span aria-hidden="true">
                {TYPES[selected.value.kind as ContentType].emoji}
              </span>
              <span
                dir="auto"
                class="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong"
              >
                {selected.value.title}
              </span>
              <button
                type="button"
                /* Igual que en el selector de comunidad: 24 px de alto y una
                   etiqueta que fuera de contexto no dice qué se cambia. */
                aria-label={translate(
                  locale,
                  "Cambiar publicación: {{title}}",
                  {
                    title: selected.value.title,
                  },
                )}
                class="touch-target shrink-0 rounded-lg px-2 py-1 text-xs text-brand hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:hover:bg-brand-900"
                onClick$={() => {
                  requestVersion.value += 1;
                  selected.value = null;
                  query.value = "";
                  setTimeout(() => document.getElementById(searchId)?.focus());
                }}
              >
                {translate(locale, "Cambiar")}
              </button>
            </div>
          ) : (
            <>
              <input
                id={searchId}
                name="q"
                type="search"
                maxLength={100}
                enterKeyHint="search"
                dir="auto"
                role="combobox"
                aria-expanded={resultsVisible}
                aria-controls={resultsId}
                aria-autocomplete="list"
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? `${searchId}-error` : undefined}
                aria-activedescendant={
                  resultsVisible && active.value >= 0
                    ? `${resultsId}-option-${active.value}`
                    : undefined
                }
                required
                value={query.value}
                autocomplete="off"
                placeholder={translate(locale, "Escribí tres letras o más…")}
                class="mt-1.5 w-full rounded-2xl border border-subtle bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                onInput$={(_, element) => {
                  requestVersion.value += 1;
                  query.value = element.value;
                  results.value = [];
                  active.value = -1;
                  searchFailed.value = false;
                  loading.value = element.value.trim().length >= 3;
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
                  aria-labelledby={searchLabelId}
                  aria-busy={loading.value}
                  aria-live="polite"
                  class="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-2xl border border-subtle bg-surface p-1 shadow-lift"
                >
                  {loading.value ? (
                    <li
                      role="option"
                      aria-disabled="true"
                      aria-selected="false"
                      class="flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm text-ink-faint"
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
                      {translate(locale, "Buscando…")}
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
                  ) : results.value.length === 0 ? (
                    <li
                      role="option"
                      aria-disabled="true"
                      aria-selected="false"
                      class="rounded-xl px-3 py-3 text-sm text-ink-faint"
                    >
                      {translate(locale, "No encontramos publicaciones.")}
                    </li>
                  ) : (
                    results.value.map((result, index) => (
                      <li
                        key={`${result.kind}-${result.id}`}
                        id={`${resultsId}-option-${index}`}
                        role="option"
                        aria-selected={active.value === index}
                        preventdefault:pointerdown={true}
                        class={
                          active.value === index
                            ? "cursor-pointer rounded-xl bg-muted px-3 py-2 ring-1 ring-inset ring-brand-500/40"
                            : "cursor-pointer rounded-xl px-3 py-2 hover:bg-muted"
                        }
                        onMouseEnter$={() => (active.value = index)}
                        onPointerDown$={() => selectResult(result)}
                        onClick$={() => selectResult(result)}
                      >
                        <span class="flex items-center gap-2 text-xs text-ink-faint">
                          <span>
                            {TYPES[result.kind as ContentType].emoji}{" "}
                            {translate(
                              locale,
                              TYPES[result.kind as ContentType].label,
                            )}
                          </span>
                          <Badge tone="neutral">
                            {translate(
                              locale,
                              STATUS_LABELS[result.status] ?? result.status,
                            )}
                          </Badge>
                          {result.community_name && (
                            <span class="truncate">
                              {result.community_emoji} {result.community_name}
                            </span>
                          )}
                        </span>
                        <span
                          dir="auto"
                          class="mt-1 block truncate text-sm font-medium text-ink-strong"
                        >
                          {result.title}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <p id={`${searchId}-error`} class="text-sm text-danger">
          {translate(locale, Array.isArray(error) ? error[0] : error)}
        </p>
      )}
    </div>
  );
});
