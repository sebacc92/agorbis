import { $, component$, useId, useSignal, useTask$ } from "@qwik.dev/core";
import { server$, useNavigate } from "@qwik.dev/router";
import { Icon, cx, triggerHapticFeedback } from "~/components/ui";
import { openCommandPalette } from "~/components/ui/CommandPalette";
import { compareNames, escapeLike } from "~/lib/community";
import { LEVEL_NAMES } from "~/lib/constants";
import { createServerSupabase } from "~/lib/supabase";
import { serverMany } from "~/lib/query";
import { DEFAULT_LOCALE, useLocale, translate, type Locale } from "~/lib/i18n";
import {
  COMMUNITY_SEARCH_MIN_LENGTH,
  GLOBAL_SEARCH_MIN_LENGTH,
  GLOBAL_SEARCH_MAX_LENGTH,
  globalSearchHref,
} from "~/lib/search";

/** Cuántas comunidades y cuántas publicaciones entran en el desplegable. */
const COMMUNITY_HITS = 5;
const CONTENT_HITS = 4;

/** Cómo se anuncia cada tipo en la lista. */
const KIND_LABEL: Record<HeaderHit["kind"], { label: string; emoji: string }> =
  {
    community: { label: "Comunidad", emoji: "📍" },
    poll: { label: "Encuesta", emoji: "🗳️" },
    debate: { label: "Debate", emoji: "💬" },
    claim: { label: "Reclamo", emoji: "📣" },
    project: { label: "Proyecto", emoji: "🛠️" },
    institution: { label: "Institución", emoji: "🏛️" },
  };

/** Un resultado del desplegable del header: comunidad o publicación. */
export interface HeaderHit {
  /** `null` para una comunidad; el tipo de contenido para el resto. */
  kind: "community" | "poll" | "debate" | "claim" | "project" | "institution";
  /** A dónde lleva. Se resuelve en el servidor, que es quien sabe la ruta. */
  href: string;
  name: string;
  emoji: string | null;
  /** Sólo comunidades: el nivel decide el color del punto y la etiqueta. */
  level: number | null;
  /** Sólo publicaciones: en qué comunidad vive. */
  communityName: string | null;
}

/**
 * Lo que devuelve la búsqueda de comunidades a secas.
 *
 * La usan `CommunityPicker` —elegir un territorio en un formulario— y las
 * pantallas de moderación. Es otra necesidad que la del header: ahí sólo se
 * quiere una comunidad, así que traer publicaciones sería ruido.
 */
export interface SearchHit {
  slug: string;
  name: string;
  emoji: string | null;
  level: number;
  memberCount: number;
}

/** Sólo comunidades, para elegir un territorio. */
export const searchCommunities = server$(async function (
  query: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<SearchHit[]> {
  const term = query.trim();
  if (term.length < COMMUNITY_SEARCH_MIN_LENGTH) return [];

  const db = createServerSupabase(this);
  const data = await serverMany(
    this,
    "buscar/comunidades",
    db
      .from("communities")
      .select("slug, name, emoji, level, member_count")
      .ilike("name", `%${escapeLike(term)}%`)
      .order("level", { ascending: true })
      .order("name", { ascending: true })
      .limit(30),
  );

  const lower = term.toLowerCase();
  return (data ?? [])
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      emoji: r.emoji,
      level: r.level,
      memberCount: r.member_count,
    }))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.level !== b.level) return a.level - b.level;
      return compareNames(a.name, b.name, locale);
    })
    .slice(0, 8);
});

/**
 * Búsqueda del header.
 *
 * Antes consultaba **sólo** `communities`, mientras el campo se anunciaba como
 * "Buscar comunidades y publicaciones": con lector de pantalla se prometía una
 * búsqueda de publicaciones que jamás devolvía ninguna, y el único acceso a
 * ellas era el enlace al pie del desplegable. Ahora las dos cosas llegan acá.
 *
 * Se hacen dos consultas y no una porque cada una ordena distinto. Las
 * comunidades tienen su propio criterio —empieza-con, después nivel, después
 * alfabético— que `global_search` no reproduce, y son el caso más frecuente:
 * quien escribe en el header casi siempre busca un lugar. Las publicaciones
 * salen de `global_search`, que ya rankea por relevancia.
 */
export const searchEverything = server$(async function (
  query: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<HeaderHit[]> {
  const term = query.trim().slice(0, GLOBAL_SEARCH_MAX_LENGTH);
  if (term.length < COMMUNITY_SEARCH_MIN_LENGTH) return [];

  const db = createServerSupabase(this);
  const lower = term.toLowerCase();

  const [comunidades, publicaciones] = await Promise.all([
    serverMany(
      this,
      "buscar/autocompletar-comunidades",
      db
        .from("communities")
        .select("slug, name, emoji, level")
        .ilike("name", `%${escapeLike(term)}%`)
        // El orden lo decide el `sort` de abajo, pero *qué 30 filas llegan* lo
        // decidía Postgres sin criterio: sin `ORDER BY`, un `LIMIT` devuelve las
        // primeras que salgan del plan. Con un término amplio ("san", "nueva")
        // hay muchas más de 30 coincidencias, así que el ranking del cliente
        // ordenaba un subconjunto arbitrario y el mejor resultado podía no estar
        // entre los candidatos.
        .order("level", { ascending: true })
        .order("name", { ascending: true })
        .limit(30),
    ),
    term.length >= GLOBAL_SEARCH_MIN_LENGTH
      ? serverMany(
          this,
          "buscar/autocompletar-publicaciones",
          db.rpc("global_search", { p_query: term, p_limit: 12, p_offset: 0 }),
        )
      : Promise.resolve([]),
  ]);

  const hits: HeaderHit[] = comunidades
    .map((r) => ({
      kind: "community" as const,
      href: `/c/${r.slug}`,
      name: r.name,
      emoji: r.emoji,
      level: r.level,
      communityName: null,
    }))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.level !== b.level) return (a.level ?? 0) - (b.level ?? 0);
      return compareNames(a.name, b.name, locale);
    })
    .slice(0, COMMUNITY_HITS);

  // Las comunidades ya vinieron de la consulta dedicada, con mejor orden.
  for (const row of publicaciones) {
    if (row.kind === "community") continue;
    if (hits.length >= COMMUNITY_HITS + CONTENT_HITS) break;
    hits.push({
      kind: row.kind as HeaderHit["kind"],
      href: row.href,
      name: row.title,
      emoji: null,
      level: null,
      communityName: row.community_name,
    });
  }

  return hits;
});

/**
 * Buscador del header. Combobox accesible: `/` lo enfoca desde cualquier parte,
 * las flechas recorren los resultados y Escape cierra.
 */
export const CommunitySearch = component$<{
  /**
   * Muestra adentro del campo el atajo de la paleta de comandos como botón
   * (D124). El header tenía dos entradas a lo mismo: este campo con "/" y un
   * botón aparte con ⌘K; ahora la paleta se abre desde el atajo del campo.
   */
  palette?: boolean;
}>(({ palette = false }) => {
  const locale = useLocale();
  const query = useSignal("");
  const hits = useSignal<HeaderHit[]>([]);
  const open = useSignal(false);
  const active = useSignal(-1);
  const loading = useSignal(false);
  const searchFailed = useSignal(false);
  // Cada cambio invalida cualquier respuesta anterior. Sin esta versión, una
  // búsqueda lenta de "cor" podía pisar después los resultados de "córdoba".
  const requestVersion = useSignal(0);
  // El header puede renderizar una instancia visible y otra dentro del drawer.
  // IDs únicos evitan que el atajo `/` o aria-controls apunten a la oculta.
  const instanceId = useId();
  const inputId = `buscador-comunidades-${instanceId}`;
  const resultsId = `resultados-comunidades-${instanceId}`;
  const nav = useNavigate();
  const shell = useSignal<HTMLDivElement>();

  // Debounce: no se consulta en cada tecla.
  useTask$(({ track, cleanup }) => {
    const term = track(() => query.value);
    const version = requestVersion.value + 1;
    requestVersion.value = version;
    active.value = -1;
    hits.value = [];
    searchFailed.value = false;

    if (term.trim().length < COMMUNITY_SEARCH_MIN_LENGTH) {
      loading.value = false;
      return;
    }

    loading.value = true;
    const timer = setTimeout(async () => {
      try {
        const nextHits = await searchEverything(term, locale);
        if (requestVersion.value !== version) return;
        hits.value = nextHits;
      } catch {
        if (requestVersion.value !== version) return;
        searchFailed.value = true;
      } finally {
        if (requestVersion.value === version) loading.value = false;
      }
    }, 150);
    cleanup(() => clearTimeout(timer));
  });

  const go = $((href: string) => {
    open.value = false;
    query.value = "";
    hits.value = [];
    void nav(href);
  });

  const searchAll = $(() => {
    const href = globalSearchHref(query.value);
    if (!href) return;
    open.value = false;
    void nav(href);
  });

  const clearQuery = $(() => {
    triggerHapticFeedback("selection");
    query.value = "";
    open.value = false;
    const input = document.getElementById(inputId);
    if (input) input.focus();
  });

  return (
    <div ref={shell} class="relative w-full max-w-xs">
      <div class="relative flex items-center">
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        >
          <Icon name="search" class="text-base" />
        </span>

        <input
          id={inputId}
          type="search"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={
            open.value &&
            query.value.trim().length >= COMMUNITY_SEARCH_MIN_LENGTH
          }
          aria-controls={resultsId}
          aria-autocomplete="list"
          aria-activedescendant={
            active.value >= 0 ? `${resultsId}-hit-${active.value}` : undefined
          }
          autocomplete="off"
          maxLength={GLOBAL_SEARCH_MAX_LENGTH}
          placeholder={translate(locale, "Buscar en Agorbis…")}
          aria-label={translate(locale, "Buscar comunidades y publicaciones")}
          value={query.value}
          class={cx(
            "h-11 w-full rounded-xl border border-control bg-surface pl-9 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25",
            palette ? "pr-16" : "pr-9",
          )}
          onInput$={(_, el) => {
            query.value = el.value;
            open.value = true;
          }}
          onFocus$={() => (open.value = true)}
          /* El panel se cerraba en cuanto el input perdía el foco, incluso
             cuando el foco iba *hacia adentro* del panel: tabular desde el
             campo hacia "Buscar … en todo Agorbis" desmontaba el botón antes
             de que lo recibiera y el foco terminaba en el `<body>`. Sólo se
             cierra si el foco salió de todo el buscador. */
          onBlur$={() =>
            setTimeout(() => {
              const active = document.activeElement;
              if (active && shell.value?.contains(active)) return;
              open.value = false;
            }, 150)
          }
          onKeyDown$={(event) => {
            if (event.key === "Escape") {
              open.value = false;
              (event.target as HTMLInputElement).blur();
            } else if (event.key === "ArrowDown") {
              active.value = Math.min(active.value + 1, hits.value.length - 1);
            } else if (event.key === "ArrowUp") {
              active.value = Math.max(active.value - 1, -1);
            } else if (event.key === "Enter") {
              // El input no está dentro de un <form>, así que Enter no dispara
              // ningún envío y no hace falta cancelarlo.
              const hit = hits.value[active.value];
              if (hit) void go(hit.href);
              else void searchAll();
            }
          }}
        />

        {query.value ? (
          <button
            type="button"
            onClick$={clearQuery}
            aria-label={translate(locale, "Borrar búsqueda")}
            class="touch-target absolute right-2.5 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-full text-ink-faint hover:bg-muted hover:text-ink-strong transition-all duration-150 active:scale-90"
          >
            <Icon name="x" class="text-sm" />
          </button>
        ) : palette ? (
          /* El atajo es un botón real: abre la paleta con un clic y sigue
             siendo el mismo nombre accesible que tenía el botón separado. */
          <button
            type="button"
            onClick$={() => openCommandPalette()}
            aria-label={translate(locale, "Paleta de comandos")}
            title={translate(locale, "Paleta de comandos")}
            class="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg px-1.5 py-1 text-ink-faint transition-colors hover:bg-muted hover:text-ink-strong sm:inline-flex"
          >
            <Icon name="sparkles" class="text-xs" />
            <kbd
              aria-hidden="true"
              class="rounded border border-control bg-muted/80 px-1.5 py-0.5 text-3xs font-semibold"
            >
              {"⌘K"}
            </kbd>
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center rounded-md border border-control bg-muted/80 px-1.5 py-0.5 text-3xs font-semibold text-ink-faint"
          >
            /
          </kbd>
        )}

        {/* La lista aparece y se actualiza sin decir nada: con lector de
            pantalla, tras escribir sólo se sabía que había resultados
            bajando por ellos uno por uno. Esto anuncia cuántos hay en cuanto
            terminan de llegar. */}
        <span role="status" aria-live="polite" class="sr-only">
          {loading.value ||
          query.value.trim().length < COMMUNITY_SEARCH_MIN_LENGTH
            ? ""
            : searchFailed.value
              ? translate(locale, "No pudimos buscar. Probá de nuevo.")
              : hits.value.length === 0
                ? translate(locale, "No encontramos nada con ese nombre.")
                : translate(locale, "{{count}} resultados encontrados", {
                    count: hits.value.length,
                  })}
        </span>
      </div>

      {open.value &&
        query.value.trim().length >= COMMUNITY_SEARCH_MIN_LENGTH && (
          <div class="animate-scale-pop absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-subtle bg-surface/95 backdrop-blur-md shadow-lift">
            <ul
              id={resultsId}
              role="listbox"
              aria-label={translate(locale, "Resultados de la búsqueda")}
              aria-busy={loading.value}
              class="p-1"
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
              ) : hits.value.length === 0 ? (
                <li
                  role="option"
                  aria-disabled="true"
                  aria-selected="false"
                  class="rounded-xl px-3 py-3 text-sm text-ink-muted"
                >
                  {translate(locale, "No encontramos nada con ese nombre.")}
                </li>
              ) : (
                hits.value.map((hit, i) => (
                  <li
                    key={hit.href}
                    id={`${resultsId}-hit-${i}`}
                    role="option"
                    aria-selected={active.value === i}
                    class={cx(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150 active:scale-[0.99] touch-manipulation",
                      active.value === i
                        ? "bg-muted font-medium text-ink-strong"
                        : "hover:bg-muted text-ink",
                    )}
                    onMouseDown$={() => go(hit.href)}
                    onMouseEnter$={() => (active.value = i)}
                  >
                    {/* El punto de color codifica el nivel territorial y sólo
                      tiene sentido en una comunidad; una publicación lleva el
                      emoji de su tipo en su lugar. */}
                    {hit.kind === "community" ? (
                      <span
                        aria-hidden="true"
                        class="size-1.5 shrink-0 rounded-full"
                        style={{ background: `var(--level-${hit.level ?? 0})` }}
                      />
                    ) : (
                      <span aria-hidden="true" class="shrink-0 text-xs">
                        {KIND_LABEL[hit.kind].emoji}
                      </span>
                    )}
                    {hit.kind === "community" && (
                      <span aria-hidden="true">{hit.emoji ?? "📍"}</span>
                    )}
                    <span
                      dir="auto"
                      class="min-w-0 flex-1 truncate font-medium text-ink-strong"
                    >
                      {hit.name}
                    </span>
                    {/* A la derecha, de qué se trata: el nivel para una
                      comunidad, la comunidad para una publicación. Sin esto,
                      dos resultados con el mismo título no se distinguen. */}
                    <span class="shrink-0 text-xs text-ink-faint">
                      {hit.kind === "community"
                        ? translate(
                            locale,
                            LEVEL_NAMES[hit.level ?? 0] ?? "Comunidad",
                          )
                        : (hit.communityName ??
                          translate(locale, KIND_LABEL[hit.kind].label))}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <div class="border-t border-subtle p-1">
              {query.value.trim().length < GLOBAL_SEARCH_MIN_LENGTH ? (
                <p class="px-3 py-2 text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Escribí al menos tres letras para buscar en todo Agorbis.",
                  )}
                </p>
              ) : (
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-brand hover:bg-muted"
                  onClick$={searchAll}
                  onBlur$={() =>
                    setTimeout(() => {
                      const active = document.activeElement;
                      if (active && shell.value?.contains(active)) return;
                      open.value = false;
                    }, 150)
                  }
                >
                  <span aria-hidden="true">🔎</span>{" "}
                  {translate(locale, "Buscar “{{query}}” en todo Agorbis", {
                    query: query.value.trim(),
                  })}
                </button>
              )}
            </div>
          </div>
        )}
    </div>
  );
});
