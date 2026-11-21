import { centerInRow } from "~/lib/center-in-row";
import { searchHref } from "~/lib/search-href";
import {
  $,
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { Highlight } from "~/components/ui/Highlight";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  Link,
  routeLoader$,
  useNavigate,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Icon,
  Badge,
  Button,
  ButtonLink,
  Card,
  Chip,
  EmptyState,
  Illustration,
  Select,
  buttonClass,
  cx,
  triggerHapticFeedback,
  type IconName,
} from "~/components/ui";
import {
  APP_NAME,
  CLAIM_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
} from "~/lib/constants";
import {
  CONTENT_KINDS,
  CONTENT_KIND_TONES,
  isContentKind,
} from "~/lib/content-kinds";
import { formatNumber, pluralize } from "~/lib/format";
import { excerptAround, highlightSegments } from "~/lib/text";
import { many, single } from "~/lib/query";
import { supabase } from "~/lib/session";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { useLocaleLoader } from "../layout";
import {
  GLOBAL_SEARCH_MIN_LENGTH as MIN_QUERY_LENGTH,
  GLOBAL_SEARCH_MAX_LENGTH as MAX_QUERY_LENGTH,
} from "~/lib/search";
import {
  isStringArray,
  readStoredJson,
  removeStoredItem,
  writeStoredJson,
} from "~/lib/browser-storage";

const KINDS = [
  "community",
  "poll",
  "debate",
  "claim",
  "project",
  "institution",
] as const;
type SearchKind = (typeof KINDS)[number];

/* Ícono propio de cada tipo (D123). Los cuatro de publicación salen de
   `CONTENT_KINDS`, que además les da su color; comunidad e institución usan
   el pin y el edificio de las herramientas de comunidad. */
const META: Record<SearchKind, { label: string; icon: IconName }> = {
  community: { label: "Comunidad", icon: "map-pin" },
  poll: { label: CONTENT_KINDS.poll.label, icon: CONTENT_KINDS.poll.icon },
  debate: {
    label: CONTENT_KINDS.debate.label,
    icon: CONTENT_KINDS.debate.icon,
  },
  claim: { label: CONTENT_KINDS.claim.label, icon: CONTENT_KINDS.claim.icon },
  project: {
    label: CONTENT_KINDS.project.label,
    icon: CONTENT_KINDS.project.icon,
  },
  institution: { label: "Institución", icon: "building" },
};

/* Comunidad e institución no tienen color de tipo: su badge es el neutro,
   el mismo de `Badge`. */
const NEUTRAL_BADGE =
  "border-subtle/80 bg-inset text-ink-muted dark:border-subtle dark:bg-muted/70 dark:text-ink-strong";

/* Tinte de marca de los filtros activos que no son un tipo de contenido. */
const ACTIVE_FILTER_TONE =
  "border-brand-500/20 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-400/40 dark:bg-brand-950/70 dark:text-brand-200 dark:hover:bg-brand-900";

type StatusLabel = { label: string; tone: string };
type StatusTone = "neutral" | "brand" | "success" | "warn" | "danger";

/* Estado de cada resultado con las etiquetas y tonos que ya usan el detalle y
   los listados de su tipo. La tabla del filtro (`STATUS_LABELS`) no tenía
   "proposal" ni "rejected", y la tarjeta caía en el valor crudo de la base.
   La comunidad no muestra estado: "Disponible" es constante. */
const RESULT_STATUS: Record<
  SearchKind,
  Record<string, StatusLabel | undefined>
> = {
  claim: CLAIM_STATUS_LABEL,
  project: PROJECT_STATUS_LABEL,
  poll: {
    active: { label: "Activa", tone: "neutral" },
    closed: { label: "Cerrada", tone: "neutral" },
  },
  debate: {
    open: { label: "Abierto", tone: "neutral" },
    closed: { label: "Cerrado", tone: "neutral" },
  },
  institution: { verified: { label: "Verificada", tone: "success" } },
  community: {},
};

const STATUS_LABELS: Record<string, string> = {
  available: "Disponible",
  active: "Activa",
  open: "Abierto",
  under_review: "En evaluación",
  acknowledged: "Recibido",
  funding: "Juntando apoyo",
  in_progress: "En ejecución",
  resolved: "Resuelto",
  completed: "Completado",
  closed: "Cerrado",
  verified: "Verificada",
};

/* Temas para arrancar, con el ícono de su categoría de reclamo (D125);
   agua, presupuesto y alumbrado no tienen categoría y llevan el suyo. */
const STARTER_QUERIES: readonly { query: string; icon: IconName }[] = [
  { query: "salud", icon: "heart" },
  { query: "transporte", icon: "bus" },
  { query: "seguridad", icon: "shield" },
  { query: "agua", icon: "droplet" },
  { query: "educación", icon: "book-open" },
  { query: "presupuesto", icon: "receipt" },
  { query: "alumbrado", icon: "bulb" },
];

const RECENT_SEARCHES_KEY = "agorbis_recent_searches";

type SearchSort = "relevancia" | "recientes";

function searchFormKey(data: {
  query: string;
  kind: SearchKind | null;
  status: string | null;
  community: { slug: string } | null;
  sort: SearchSort;
  page: number;
}): string {
  return JSON.stringify([
    data.query,
    data.kind,
    data.status,
    data.community?.slug,
    data.sort,
    data.page,
  ]);
}

/**
 * Qué estados existen para cada tipo.
 */
const STATUSES_BY_KIND: Record<SearchKind, readonly string[]> = {
  community: ["available"],
  poll: ["active", "closed"],
  debate: ["open", "closed"],
  claim: ["open", "under_review", "acknowledged", "in_progress", "resolved"],
  project: ["funding", "in_progress", "completed"],
  institution: ["verified"],
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

const PAGE_SIZE = 20;
// El RPC limita el offset a 500: la última página empieza en ese offset.
const MAX_PAGES = 26;

/** Reclamos que se ofrecen cuando todavía no se escribió nada. */
const SUGGESTIONS = 6;

export const useSearch = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const query = (ev.url.searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const requestedKind = ev.url.searchParams.get("tipo");
  const kind = KINDS.includes(requestedKind as SearchKind)
    ? (requestedKind as SearchKind)
    : null;
  const requestedStatus = (ev.url.searchParams.get("estado") ?? "").trim();
  const status =
    requestedStatus &&
    (!kind || STATUSES_BY_KIND[kind].includes(requestedStatus))
      ? requestedStatus
      : null;
  const requestedSort = ev.url.searchParams.get("orden");
  const sort: SearchSort =
    requestedSort === "recientes" ? "recientes" : "relevancia";
  const communitySlug =
    (ev.url.searchParams.get("comunidad") ?? "").trim() || null;
  const requestedPage = Math.max(
    1,
    Math.trunc(Number(ev.url.searchParams.get("pagina"))) || 1,
  );
  if (requestedPage > MAX_PAGES) {
    const boundedUrl = new URL(ev.url);
    boundedUrl.searchParams.set("pagina", String(MAX_PAGES));
    throw ev.redirect(302, boundedUrl.pathname + boundedUrl.search);
  }
  const page = requestedPage;

  const community = communitySlug
    ? await single(
        ev,
        "buscar/territorio",
        db
          .from("communities")
          .select("id, slug, name, emoji, level, member_count")
          .eq("slug", communitySlug)
          .maybeSingle(),
      )
    : null;
  if (communitySlug && !community)
    throw ev.error(
      404,
      translate(
        resolveLocale(ev.locale()),
        "No encontramos ese territorio. Volvé a elegirlo.",
      ),
    );

  const { data, error } =
    query.length >= MIN_QUERY_LENGTH
      ? await db.rpc("global_search", {
          p_query: query,
          // La sobrecarga requiere las siete claves. Los tipos generados no
          // expresan NULL en argumentos SQL; enviarlo evita omitir filtros
          // opcionales y seleccionar por error la firma antigua de seis.
          p_kind: kind as string,
          p_community: (community?.id ?? null) as string,
          p_status: status as string,
          p_limit: PAGE_SIZE,
          p_offset: (page - 1) * PAGE_SIZE,
          p_sort: sort,
        })
      : { data: [], error: null };
  if (error) {
    throw ev.error(
      500,
      translate(
        resolveLocale(ev.locale()),
        "No pudimos completar la búsqueda.",
      ),
    );
  }

  const results = query.length >= MIN_QUERY_LENGTH ? [...(data ?? [])] : [];

  const suggestions =
    query.length >= MIN_QUERY_LENGTH
      ? []
      : await many(
          ev,
          "buscar/sugerencias",
          db
            .from("claims")
            .select("id, title, support_count, community_id")
            .in("status", ["open", "under_review", "in_progress"])
            .gt("support_count", 0)
            .order("support_count", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(SUGGESTIONS),
        );

  const suggestionCommunities = suggestions.length
    ? await many(
        ev,
        "buscar/sugerencias-comunidades",
        db
          .from("communities")
          .select("id, name, emoji")
          .in("id", [...new Set(suggestions.map((c) => c.community_id))]),
      )
    : [];
  const communityById = new Map(suggestionCommunities.map((c) => [c.id, c]));

  const total = Number(data?.[0]?.total_count ?? 0);
  const pageHref = (target: number) =>
    searchHref({
      query,
      kind,
      status,
      community: community?.slug,
      sort,
      page: target,
    });

  const buildHref = (patch: {
    query?: string;
    kind?: SearchKind | null;
    status?: string | null;
    community?: string | null;
    sort?: SearchSort;
    page?: number;
  }) => {
    return searchHref({
      query: patch.query ?? query,
      kind: patch.kind === undefined ? kind : patch.kind,
      status: patch.status === undefined ? status : patch.status,
      community:
        patch.community === undefined ? community?.slug : patch.community,
      sort: patch.sort ?? sort,
      page: patch.page ?? page,
    });
  };

  const hrefWithout = (filter: "kind" | "status" | "community" | "query") => {
    const params = new URLSearchParams();
    if (query && filter !== "query") params.set("q", query);
    if (kind && filter !== "kind") params.set("tipo", kind);
    if (status && filter !== "status") params.set("estado", status);
    if (community && filter !== "community")
      params.set("comunidad", community.slug);
    if (sort === "recientes") params.set("orden", sort);
    return `/buscar?${params.toString()}`;
  };

  const kindLinks = [
    {
      kind: null as SearchKind | null,
      label: "Todo",
      active: !kind,
    },
    ...KINDS.map((kindValue) => ({
      kind: kindValue as SearchKind | null,
      label: META[kindValue].label,
      active: kind === kindValue,
    })),
  ];

  const starterLinks = STARTER_QUERIES.map((starter) => ({
    query: starter.query,
    icon: starter.icon,
    href: buildHref({
      query: starter.query,
      page: 1,
    }),
  }));

  const pageCount = Math.max(
    1,
    Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE)),
  );

  return {
    query,
    kind,
    status,
    community,
    page,
    pageCount,
    total,
    limitedResults: total > MAX_PAGES * PAGE_SIZE,
    results,
    sort,
    kindLinks,
    starterLinks,
    firstPage: page > 1 ? pageHref(1) : null,
    lastPage: page < pageCount ? pageHref(pageCount) : null,
    previous: page > 1 ? pageHref(page - 1) : null,
    next: page < pageCount ? pageHref(page + 1) : null,
    withoutFilters: query
      ? `/buscar?q=${encodeURIComponent(query)}`
      : "/buscar",
    withoutQuery: hrefWithout("query"),
    withoutKind: hrefWithout("kind"),
    withoutStatus: hrefWithout("status"),
    withoutCommunity: hrefWithout("community"),
    hasFilters: !!kind || !!status || !!community,
    suggestions: suggestions.map((claim) => ({
      id: claim.id,
      title: claim.title,
      supportCount: claim.support_count,
      community: communityById.get(claim.community_id) ?? null,
    })),
  };
});

export default component$(() => {
  const search = useSearch();
  const data = search.value;
  const locale = useLocale();
  const navigate = useNavigate();

  const queryInput = useSignal(data.query);
  // En teléfono la fila de tipos se desliza: el tipo elegido tiene que
  // quedar a la vista al volver con la página recargada o navegada.
  const kindChips = useSignal<HTMLElement>();
  // eslint-disable-next-line qwik/no-use-visible-task -- depende del ancho real de la fila
  useVisibleTask$(({ track }) => {
    track(() => data.kind);
    centerInRow(kindChips.value, '[aria-pressed="true"]');
  });
  const queryField = useSignal<HTMLInputElement>();
  const statusInput = useSignal(data.status ?? "");
  const sortInput = useSignal(data.sort);
  const showAdvanced = useSignal(data.hasFilters || data.sort === "recientes");
  const appliedKey = searchFormKey(data);
  const lastAppliedKey = useSignal(appliedKey);

  // El componente se conserva al cambiar parámetros mediante Link o historial.
  // La búsqueda aplicada en la URL también debe actualizar el campo editable.
  // Reanudar el loader con la misma búsqueda no debe pisar el primer click ni
  // las ediciones locales que todavía no se enviaron.
  useTask$(({ track }) => {
    const applied = track(() => search.value);
    const key = searchFormKey(applied);
    if (key === lastAppliedKey.value) return;
    lastAppliedKey.value = key;
    queryInput.value = applied.query;
    statusInput.value = applied.status ?? "";
    sortInput.value = applied.sort;
    showAdvanced.value = applied.hasFilters || applied.sort === "recientes";
  });

  const statusOptions = data.kind ? STATUSES_BY_KIND[data.kind] : ALL_STATUSES;
  const sortLabel =
    data.sort === "recientes"
      ? translate(locale, "más recientes")
      : translate(locale, "relevancia");
  const recentSearches = useSignal<string[]>([]);

  // eslint-disable-next-line qwik/no-use-visible-task -- las búsquedas recientes viven en localStorage y la ruta puede renderizarse en el cliente, donde no hay qinit
  useVisibleTask$(({ track }) => {
    track(() => data.query);
    let list = readStoredJson(RECENT_SEARCHES_KEY, isStringArray) ?? [];
    if (data.query && data.query.trim().length >= MIN_QUERY_LENGTH) {
      const q = data.query.trim();
      list = [
        q,
        ...list.filter((item) => item.toLowerCase() !== q.toLowerCase()),
      ].slice(0, 6);
      writeStoredJson(RECENT_SEARCHES_KEY, list);
    }
    recentSearches.value = list;
  });

  const clearRecentSearches = $(() => {
    removeStoredItem(RECENT_SEARCHES_KEY);
    recentSearches.value = [];
  });

  // El botón trae su búsqueda en `data-query` y este manejador se pasa por
  // referencia. Una función en línea que capture la variable del `.map` hace
  // que el optimizador declare su QRL justo antes del `return`, después del
  // JSX de `recentHistory` que la usa: con una búsqueda guardada el redibujado
  // en el navegador lanzaba ReferenceError y caía todo `/buscar` (D75).
  const removeRecentSearch = $((_: Event, button: HTMLButtonElement) => {
    const qToRemove = button.dataset.query ?? "";
    const updated = recentSearches.value.filter((q) => q !== qToRemove);
    recentSearches.value = updated;
    writeStoredJson(RECENT_SEARCHES_KEY, updated);
  });

  // La consulta en curso ya está escrita en el campo: listarla también en el
  // historial era ruido. Se filtra sólo al dibujar; lo guardado no cambia.
  const currentQuery = data.query.trim().toLowerCase();
  const shownRecentSearches = recentSearches.value.filter(
    (recent) => recent.toLowerCase() !== currentQuery,
  );

  /* Temas para arrancar. Sin consulta van arriba, para empezar por algo;
     con una consulta escrita bajan debajo de los resultados: siguen ahí
     (acompañan la consulta) pero no empujan lo que se buscó fuera de la
     primera pantalla (décima ronda, mejora 8). */
  const starterTopics = (
    <section
      class="flex flex-wrap items-center gap-2"
      aria-labelledby="temas-populares"
    >
      <span
        id="temas-populares"
        class="text-xs font-semibold uppercase tracking-wider text-ink-faint"
      >
        {translate(locale, "Temas destacados")}:
      </span>
      <div class="flex flex-wrap gap-1.5">
        {data.starterLinks.map((starter) => (
          <Chip
            key={starter.query}
            href={starter.href}
            icon={starter.icon}
            onClick$={() => triggerHapticFeedback("selection")}
            class="touch-target"
          >
            {starter.query}
          </Chip>
        ))}
      </div>
    </section>
  );

  /* Cada búsqueda guardada es una píldora con las medidas del chip de filtro
     que lleva el enlace y el botón de quitar: el botón conserva su caja
     táctil de 44 px y dibuja adentro un círculo de 28. El relleno izquierdo
     va en el enlace y no en la píldora: así esos 12 px también se tocan y el
     foco los cubre; `touch-target` le da los 44 px con dedo, como a los
     temas. */
  const recentHistory = shownRecentSearches.length > 0 && (
    <section
      class="flex flex-wrap items-center gap-2"
      aria-labelledby="busquedas-recientes"
    >
      <span
        id="busquedas-recientes"
        class="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ink-faint"
      >
        <Icon name="clock" class="text-sm" />
        {translate(locale, "Búsquedas recientes")}:
      </span>
      <div class="flex flex-wrap items-center gap-1.5">
        {shownRecentSearches.map((recent) => (
          <div
            key={recent}
            class="inline-flex min-h-9 items-center rounded-full border border-subtle bg-surface text-xs font-medium text-ink-muted transition-colors hover:border-strong hover:text-ink-strong"
          >
            <Link
              href={searchHref({
                query: recent,
                kind: data.kind,
                status: data.status,
                community: data.community?.slug,
                sort: data.sort,
                page: 1,
              })}
              onClick$={() => triggerHapticFeedback("selection")}
              class="touch-target inline-flex min-h-9 items-center rounded-s-full ps-3 hover:underline"
            >
              {recent}
            </Link>
            <button
              type="button"
              aria-label={translate(
                locale,
                "Eliminar {{query}} del historial",
                { query: recent },
              )}
              data-query={recent}
              onClick$={removeRecentSearch}
              class="group/quitar -my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:text-danger-500"
            >
              <span class="inline-flex size-7 items-center justify-center rounded-full transition-colors group-hover/quitar:bg-muted">
                <Icon name="x" class="text-sm" />
              </span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick$={clearRecentSearches}
          class="ml-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 text-xs text-ink-faint hover:bg-muted hover:text-ink-strong hover:underline"
        >
          {translate(locale, "Borrar historial")}
        </button>
      </div>
    </section>
  );

  /* Temas e historial van en un bloque que siempre se dibuja. El historial
     sale de localStorage y aparece recién en el cliente: suelto entre las
     otras partes condicionales de la página terminaba dibujado al final,
     debajo de todo. Adentro de este ancla queda junto a los temas. */
  const startBlock = (
    <div class="mt-4 space-y-3">
      {starterTopics}
      {recentHistory}
    </div>
  );

  return (
    <div class="container-content py-8">
      {/* Cabecera de una línea: la insignia "Descubrimiento", el título
          grande y el párrafo empujaban el campo y los resultados fuera de la
          primera pantalla del teléfono (décima ronda, mejora 8). */}
      <header>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
          {translate(locale, "Buscar en Agorbis")}
        </h1>
      </header>

      {/* Main Search & Filters Card */}
      <Card class="mt-4 p-4 sm:p-6 shadow-soft transition-all">
        <form
          method="get"
          action="/buscar"
          preventdefault:submit
          onSubmit$={async (event, form) => {
            // El botón pulsado aporta el tipo junto a los campos editados,
            // incluso los del panel plegado. Sin JS queda el mismo GET nativo.
            const submitter = (event as SubmitEvent).submitter;
            const fields = new FormData(form, submitter);
            const params = new URLSearchParams();
            for (const [name, value] of fields) {
              if (typeof value === "string") params.set(name, value);
            }
            const destination =
              submitter?.getAttribute("formaction") === "/buscar/territorios/"
                ? "/buscar/territorios/"
                : "/buscar";
            await navigate(`${destination}?${params.toString()}`);
          }}
          role="search"
          aria-label={translate(locale, "Buscar en Agorbis")}
          class="space-y-4"
        >
          {/* Main search bar row. La etiqueta repetía el título de la
              página: queda para lectores de pantalla. */}
          <label for="global-search-query" class="sr-only">
            {translate(locale, "Buscar en Agorbis")}
          </label>
          <div class="relative flex items-center">
            <div class="pointer-events-none absolute left-4 flex items-center text-ink-muted">
              <Icon name="search" class="text-xl" />
            </div>
            <input
              ref={queryField}
              id="global-search-query"
              name="q"
              type="search"
              minLength={MIN_QUERY_LENGTH}
              maxLength={MAX_QUERY_LENGTH}
              value={queryInput.value}
              onInput$={(_, el) => (queryInput.value = el.value)}
              placeholder={translate(
                locale,
                "Ej: transporte, hospital, alumbrado, seguridad…",
              )}
              enterKeyHint="search"
              autoComplete="off"
              class="min-h-12 w-full rounded-2xl border border-control bg-surface pl-11 pr-28 text-base text-ink shadow-sm placeholder:text-ink-faint transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 sm:pr-36"
            />
            <div class="absolute inset-y-0 right-1 flex items-center gap-1">
              {queryInput.value && (
                <button
                  type="button"
                  aria-label={translate(locale, "Borrar búsqueda")}
                  onClick$={() => {
                    queryInput.value = "";
                    queryField.value?.focus();
                  }}
                  class="flex size-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-muted hover:text-ink-strong"
                >
                  <Icon name="x" class="text-sm" />
                </button>
              )}
              <button
                type="submit"
                name="tipo"
                value={data.kind ?? ""}
                aria-label={translate(locale, "Buscar")}
                class="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-sm font-medium text-white shadow-soft transition-[background-color,transform] hover:bg-brand-700 active:scale-95"
              >
                <Icon name="search" class="text-base sm:hidden" />
                <span class="hidden sm:inline">
                  {translate(locale, "Buscar")}
                </span>
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-subtle px-3 py-2">
            <input
              type="hidden"
              name="comunidad"
              value={data.community?.slug ?? ""}
            />
            <p class="min-w-0 flex-1 text-sm text-ink-muted">
              {translate(locale, "Territorio y sus comunidades hijas")}:{" "}
              {data.community?.name ?? translate(locale, "Todo el territorio")}
            </p>
            <Button
              type="submit"
              name="tipo"
              value={data.kind ?? ""}
              formAction="/buscar/territorios/"
              formNoValidate
              variant="secondary"
              size="sm"
            >
              {translate(locale, "Elegir territorio")}
            </Button>
          </div>

          {/* Category Tabs / Chips */}
          <div class="pt-1">
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {translate(locale, "Tipos de contenido")}
              </span>
              <button
                type="button"
                aria-expanded={showAdvanced.value}
                aria-controls="search-advanced-filters"
                onClick$={() => (showAdvanced.value = !showAdvanced.value)}
                class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-brand hover:underline"
              >
                <Icon name="filter" />
                {showAdvanced.value
                  ? translate(locale, "Ocultar filtros")
                  : translate(locale, "Más filtros")}
              </button>
            </div>
            {/* En teléfono los siete tipos ocupaban tres filas y bajaban los
                resultados: una fila que se desliza, con degradé que avisa, y
                desde `sm` vuelven a envolver (décima ronda, mejora 8). */}
            <div
              data-chips-fade
              class="relative after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-surface after:to-transparent sm:after:hidden"
            >
              <nav
                ref={kindChips}
                aria-label={translate(locale, "Tipos de contenido")}
                class="scrollbar-slim flex items-center gap-1.5 overflow-x-auto pb-1 pr-8 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0"
              >
                {/* El chip único (D123) como botón de envío: manda `tipo`
                    junto con lo editado y anuncia con `aria-pressed` el
                    vigente. Seleccionado, cada tipo de publicación toma
                    su color; "Todo", comunidad e institución quedan en
                    violeta. */}
                {data.kindLinks.map((kindLink) => (
                  <Chip
                    key={kindLink.kind ?? "all"}
                    type="submit"
                    name="tipo"
                    value={kindLink.kind ?? ""}
                    selected={kindLink.active}
                    icon={kindLink.kind ? META[kindLink.kind].icon : undefined}
                    selectedClass={
                      kindLink.kind && isContentKind(kindLink.kind)
                        ? CONTENT_KIND_TONES[kindLink.kind].selected
                        : undefined
                    }
                    class="min-h-11 shrink-0"
                  >
                    {translate(locale, kindLink.label)}
                  </Chip>
                ))}
              </nav>
            </div>
          </div>

          {/* Collapsible secondary filters: Estado, Territorio, Ordenar */}
          {/* Se ocultan sin desmontarlos: cerrar el panel no borra los valores
              elegidos ni los excluye del siguiente envío GET. La clave vuelve
              a aplicar los filtros de la URL al navegar con Link o historial. */}
          <div
            id="search-advanced-filters"
            key={appliedKey}
            hidden={!showAdvanced.value}
            class="mt-4 grid gap-3 border-t border-subtle pt-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div>
              <label
                for="estado"
                class="mb-1 block text-xs font-medium text-ink-strong"
              >
                {translate(locale, "Estado")}
              </label>
              <Select
                name="estado"
                class="h-10 text-xs"
                onChange$={(_, element) => (statusInput.value = element.value)}
              >
                <option value="">
                  {translate(locale, "Cualquier estado")}
                </option>
                {statusOptions.map((status) => (
                  <option
                    key={status}
                    value={status}
                    selected={statusInput.value === status}
                  >
                    {translate(locale, STATUS_LABELS[status] ?? status)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label
                for="orden"
                class="mb-1 block text-xs font-medium text-ink-strong"
              >
                {translate(locale, "Ordenar por")}
              </label>
              <Select
                name="orden"
                class="h-10 text-xs"
                onChange$={(_, element) => {
                  sortInput.value =
                    element.value === "recientes" ? "recientes" : "relevancia";
                }}
              >
                <option
                  value="relevancia"
                  selected={sortInput.value === "relevancia"}
                >
                  {translate(locale, "Más relevantes")}
                </option>
                <option
                  value="recientes"
                  selected={sortInput.value === "recientes"}
                >
                  {translate(locale, "Más recientes")}
                </option>
              </Select>
            </div>

            <div class="flex items-center gap-2 pt-1 sm:col-span-2 lg:col-span-3">
              <Button
                type="submit"
                name="tipo"
                value={data.kind ?? ""}
                size="sm"
              >
                {translate(locale, "Aplicar filtros")}
              </Button>
              {data.hasFilters && (
                <Link
                  href={data.withoutFilters}
                  class="inline-flex min-h-8 items-center rounded-xl px-2 text-xs font-medium text-brand hover:underline"
                >
                  {translate(locale, "Limpiar filtros")}
                </Link>
              )}
            </div>
          </div>
        </form>
      </Card>

      {!data.query && startBlock}

      {/* Active Filter Chips. Sólo con filtros de verdad: con la consulta
          como único "filtro" repetía el campo de arriba y bajaba los
          resultados (décima ronda, mejora 8). Cada filtro es el chip único
          con su ícono y una cruz; el tipo lleva su color y el territorio el
          emoji de la comunidad, que es su identidad. Sin `selected`: en un
          enlace anunciaría la página actual. El texto se recorta para no
          desbordar el teléfono con una consulta o un territorio largos. */}
      {data.hasFilters && (
        <ul
          class="mt-4 flex flex-wrap items-center gap-2"
          aria-label={translate(locale, "Filtros activos")}
        >
          <li class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            {translate(locale, "Filtros activos")}:
          </li>
          {data.query && (
            <li class="min-w-0 max-w-full">
              <Chip
                href={data.withoutQuery}
                ariaLabel={translate(
                  locale,
                  "Quitar término de búsqueda: {{query}}",
                  {
                    query: data.query,
                  },
                )}
                icon="search"
                toneClass={ACTIVE_FILTER_TONE}
                class="max-w-full"
              >
                <span class="truncate">
                  {translate(locale, "Búsqueda: {{query}}", {
                    query: data.query,
                  })}
                </span>
                <Icon name="x" />
              </Chip>
            </li>
          )}
          {data.kind && (
            <li class="min-w-0 max-w-full">
              <Chip
                href={data.withoutKind}
                ariaLabel={translate(locale, "Quitar filtro: {{filter}}", {
                  filter: translate(locale, META[data.kind].label),
                })}
                icon={META[data.kind].icon}
                toneClass={
                  isContentKind(data.kind)
                    ? CONTENT_KIND_TONES[data.kind].badge
                    : ACTIVE_FILTER_TONE
                }
                class="max-w-full"
              >
                <span class="truncate">
                  {translate(locale, "Tipo")}:{" "}
                  {translate(locale, META[data.kind].label)}
                </span>
                <Icon name="x" />
              </Chip>
            </li>
          )}
          {data.status && (
            <li class="min-w-0 max-w-full">
              <Chip
                href={data.withoutStatus}
                ariaLabel={translate(locale, "Quitar filtro: {{filter}}", {
                  filter: translate(
                    locale,
                    STATUS_LABELS[data.status] ?? data.status,
                  ),
                })}
                toneClass={ACTIVE_FILTER_TONE}
                class="max-w-full"
              >
                <span class="truncate">
                  {translate(locale, "Estado")}:{" "}
                  {translate(locale, STATUS_LABELS[data.status] ?? data.status)}
                </span>
                <Icon name="x" />
              </Chip>
            </li>
          )}
          {data.community && (
            <li class="min-w-0 max-w-full">
              <Chip
                href={data.withoutCommunity}
                ariaLabel={translate(locale, "Quitar filtro: {{filter}}", {
                  filter: data.community.name,
                })}
                toneClass={ACTIVE_FILTER_TONE}
                class="max-w-full"
              >
                <span class="truncate">
                  {translate(locale, "Territorio")}:{" "}
                  <span aria-hidden="true">{data.community.emoji}</span>{" "}
                  {data.community.name}
                </span>
                <Icon name="x" />
              </Chip>
            </li>
          )}
          <li>
            <Link
              href={data.withoutFilters}
              class="inline-flex min-h-9 items-center text-xs font-medium text-brand hover:underline"
            >
              {translate(locale, "Limpiar filtros")}
            </Link>
          </li>
        </ul>
      )}

      {/* Main Results / Empty / Suggestions View */}
      {data.query.length < MIN_QUERY_LENGTH ? (
        <div class="mt-8 space-y-8">
          {/* Con sugerencias, la invitación es una fila compacta: la caja
              grande de estado vacío dejaba "Lo que más se está apoyando"
              fuera de la primera pantalla del teléfono. La caja completa
              queda para cuando no hay nada que sugerir. */}
          {data.suggestions.length > 0 ? (
            <div class="flex items-center gap-4">
              {/* `max-*` y no `size-12`: el `size-24` propio de la
                  ilustración sale después en el CSS y ganaría. */}
              <Illustration name="search" class="max-h-12 max-w-12 shrink-0" />
              <div class="min-w-0">
                <h2 class="font-display text-display-xs text-ink-strong">
                  {translate(locale, "¿Qué querés encontrar?")}
                </h2>
                <p class="mt-0.5 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Escribí al menos tres letras y, si querés, acotá por tipo, estado o territorio.",
                  )}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              illustration="search"
              headingLevel="h2"
              title={translate(locale, "¿Qué querés encontrar?")}
              description="Escribí al menos tres letras y, si querés, acotá por tipo, estado o territorio."
            />
          )}

          {/* Las sugerencias son reclamos: la anatomía de la tarjeta de
              reclamo (D123), con el apoyo como dato atenuado y en singular
              cuando es uno. */}
          {data.suggestions.length > 0 && (
            <section aria-labelledby="sugerencias-titulo" class="space-y-4">
              <h2
                id="sugerencias-titulo"
                class="flex items-center gap-2 font-display text-display-sm text-ink-strong"
              >
                <Icon
                  name={CONTENT_KINDS.claim.icon}
                  class={CONTENT_KIND_TONES.claim.text}
                />
                {translate(locale, "Lo que más se está apoyando")}
              </h2>
              <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.suggestions.map((claim) => (
                  <li key={claim.id}>
                    <Link
                      href={`/reclamos/${claim.id}`}
                      class="group block h-full rounded-2xl"
                    >
                      <Card
                        interactive
                        accent={CONTENT_KIND_TONES.claim.accent}
                        class="h-full p-4"
                      >
                        <div class="flex items-center gap-2 text-xs text-ink-faint">
                          <Chip
                            variant="badge"
                            icon={CONTENT_KINDS.claim.icon}
                            toneClass={CONTENT_KIND_TONES.claim.badge}
                            class="shrink-0"
                          >
                            {translate(locale, CONTENT_KINDS.claim.label)}
                          </Chip>
                          {claim.community && (
                            <span class="min-w-0 truncate">
                              <span aria-hidden="true">
                                {claim.community.emoji}
                              </span>{" "}
                              {claim.community.name}
                            </span>
                          )}
                        </div>
                        <h3
                          dir="auto"
                          class="mt-3 line-clamp-2 font-display text-display-xs text-ink-strong transition-colors group-hover:text-brand"
                        >
                          {claim.title}
                        </h3>
                        <p class="mt-3 flex items-center gap-1 text-xs font-medium text-ink-muted">
                          <Icon name="users" />
                          {pluralize(
                            claim.supportCount,
                            CONTENT_KINDS.claim.engagement[0],
                            CONTENT_KINDS.claim.engagement[1],
                            locale,
                          )}
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : data.results.length === 0 ? (
        <div class="mt-8">
          {/* h2, como "Resultados para…" cuando hay resultados: entre el h1
              y este título no hay otro, y un h3 saltaba un nivel. */}
          <EmptyState
            illustration="compass"
            headingLevel="h2"
            title={translate(locale, "No encontramos nada para “{{query}}”", {
              query: data.query,
            })}
            description="Probá con menos filtros, otra palabra o un territorio más amplio."
          >
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              {data.hasFilters && (
                <ButtonLink href={data.withoutFilters} variant="secondary">
                  {translate(locale, "Buscar sin filtros")}
                </ButtonLink>
              )}
              <ButtonLink href="/buscar" variant="ghost">
                {translate(locale, "Reiniciar búsqueda")}
              </ButtonLink>
            </div>
            {/* Si lo que se buscaba era un lugar que todavía no existe, la
                búsqueda era un callejón sin salida. */}
            <Link
              href="/comunidades/solicitar"
              class="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
            >
              {translate(locale, "¿No está tu lugar? Pedí que lo sumemos")}
            </Link>
          </EmptyState>
        </div>
      ) : (
        <section class="mt-5" aria-labelledby="resultados-busqueda">
          {/* Cabecera de resultados. El conteo era una píldora que en el
              teléfono ocupaba su propia línea: ahora va en la misma línea
              atenuada que el orden, y la página se nombra sólo cuando hay
              más de una. */}
          <div class="border-b border-subtle pb-3">
            <h2
              id="resultados-busqueda"
              class="font-display text-display-sm text-ink-strong"
            >
              {translate(locale, "Resultados para “{{query}}”", {
                query: data.query,
              })}
            </h2>
            <p class="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-faint">
              <span role="status" aria-live="polite">
                {translate(locale, "Mostrando {{from}}–{{to}} de {{total}}", {
                  from: formatNumber((data.page - 1) * PAGE_SIZE + 1, locale),
                  to: formatNumber(
                    Math.min(data.page * PAGE_SIZE, data.total),
                    locale,
                  ),
                  total: formatNumber(data.total, locale),
                })}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {data.pageCount > 1
                  ? translate(
                      locale,
                      "Orden: {{sort}} · Página {{page}} de {{pages}}",
                      {
                        sort: sortLabel,
                        page: formatNumber(data.page, locale),
                        pages: formatNumber(data.pageCount, locale),
                      },
                    )
                  : translate(locale, "Orden: {{sort}}", { sort: sortLabel })}
              </span>
            </p>
          </div>

          {data.limitedResults && (
            <p class="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-ink-muted">
              {translate(
                locale,
                "Podés recorrer los primeros {{limit}} resultados. Refiná la búsqueda por palabra, tipo o territorio para encontrar más coincidencias.",
                { limit: formatNumber(MAX_PAGES * PAGE_SIZE, locale) },
              )}
            </p>
          )}

          {/* Misma anatomía que el feed y "Pasando ahora" (D123): franja y
              badge con el color del tipo, una línea de meta que no envuelve,
              el título como pieza dominante y un pie con el estado. */}
          <ol class="mt-4 grid gap-3 lg:grid-cols-2">
            {data.results.map((result) => {
              const kind = result.kind as SearchKind;
              const meta = META[kind] ?? {
                label: kind,
                icon: "file-text" as IconName,
              };
              const tones = isContentKind(kind)
                ? CONTENT_KIND_TONES[kind]
                : null;
              const status = result.status
                ? RESULT_STATUS[kind]?.[result.status]
                : undefined;
              // El extracto arranca cerca de lo buscado: con dos líneas
              // visibles, una coincidencia del final quedaba cortada.
              const excerpt = result.summary
                ? excerptAround(result.summary, data.query)
                : "";
              // La base también compara el plan del proyecto y el texto
              // entero del debate o el reclamo. Si nada de lo visible lleva
              // la marca, se dice dónde está la coincidencia en lugar de
              // dejar el resultado sin explicación.
              const matchHidden = ![result.title, excerpt].some((value) =>
                highlightSegments(value, data.query).some(
                  (segment) => segment.match,
                ),
              );

              return (
                // `min-w-0`: un ítem de grilla mide como mínimo su contenido,
                // y la línea de meta no envuelve; sin esto la tarjeta se
                // salía de un teléfono de 320 px en vez de truncar.
                <li key={`${kind}-${result.id}`} class="min-w-0">
                  <Link
                    href={result.href}
                    class="group block h-full rounded-2xl"
                  >
                    <Card interactive accent={tones?.accent} class="h-full p-5">
                      <div class="flex items-center gap-2 text-xs text-ink-faint">
                        <Chip
                          variant="badge"
                          icon={meta.icon}
                          toneClass={tones?.badge ?? NEUTRAL_BADGE}
                          class="shrink-0"
                        >
                          {translate(locale, meta.label)}
                        </Chip>
                        {/* Una comunidad ya es el título: no se repite. */}
                        {kind !== "community" && result.community_name && (
                          <span class="min-w-0 truncate">
                            <span aria-hidden="true">
                              {result.community_emoji}
                            </span>{" "}
                            {result.community_name}
                          </span>
                        )}
                        <RelativeTime
                          value={result.created_at}
                          class="ml-auto shrink-0 tabular-nums"
                        />
                      </div>
                      <h3
                        dir="auto"
                        class="mt-3 font-display text-display-xs text-ink-strong transition-colors group-hover:text-brand"
                      >
                        {kind === "community" && result.community_emoji && (
                          <span aria-hidden="true" class="me-1.5">
                            {result.community_emoji}
                          </span>
                        )}
                        <Highlight text={result.title} query={data.query} />
                      </h3>
                      {excerpt && (
                        <p
                          dir="auto"
                          class="ugc-text mt-2 line-clamp-2 text-base text-ink-muted"
                        >
                          <Highlight text={excerpt} query={data.query} />
                        </p>
                      )}
                      {(status || matchHidden) && (
                        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                          {status && (
                            <Badge tone={status.tone as StatusTone}>
                              {translate(locale, status.label)}
                            </Badge>
                          )}
                          {matchHidden && (
                            <span class="inline-flex items-center gap-1 text-ink-faint">
                              <Icon name="file-text" />
                              {translate(
                                locale,
                                "La coincidencia está en el texto completo",
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* Clean Pagination Bar */}
          {(data.previous || data.next) && (
            <nav
              aria-label={translate(locale, "Páginas de resultados")}
              class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-6"
            >
              <div class="flex items-center gap-2">
                {data.firstPage && (
                  <Link
                    href={data.firstPage}
                    class={cx(
                      buttonClass("secondary", "sm"),
                      "touch-target min-h-11 min-w-11 tabular-nums active:scale-90",
                    )}
                  >
                    {translate(locale, "⟪ Primera")}
                  </Link>
                )}
                {data.previous ? (
                  <Link
                    href={data.previous}
                    class={cx(
                      buttonClass("secondary", "sm"),
                      "touch-target min-h-11 min-w-11 tabular-nums active:scale-90",
                    )}
                  >
                    {translate(locale, "← Anterior")}
                  </Link>
                ) : (
                  <span />
                )}
              </div>

              <span class="text-sm font-medium tabular-nums text-ink-muted">
                {translate(locale, "Página {{page}} de {{pages}}", {
                  page: formatNumber(data.page, locale),
                  pages: formatNumber(data.pageCount, locale),
                })}
              </span>

              <div class="flex items-center gap-2">
                {data.next ? (
                  <Link
                    href={data.next}
                    class={cx(
                      buttonClass("secondary", "sm"),
                      "touch-target min-h-11 min-w-11 tabular-nums active:scale-90",
                    )}
                  >
                    {translate(locale, "Siguiente")}{" "}
                    <Icon name="arrow-right" class="text-[1.1em]" />
                  </Link>
                ) : (
                  <span />
                )}
                {data.lastPage && (
                  <Link
                    href={data.lastPage}
                    class={cx(
                      buttonClass("secondary", "sm"),
                      "touch-target min-h-11 min-w-11 tabular-nums active:scale-90",
                    )}
                  >
                    {translate(locale, "Última ⟫")}
                  </Link>
                )}
              </div>
            </nav>
          )}
        </section>
      )}
      {data.query && startBlock}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useSearch);
  const locale = resolveValue(useLocaleLoader);
  return {
    title: data?.query
      ? `${data.query} · ${translate(locale, "Buscar")} · ${APP_NAME}`
      : `${translate(locale, "Buscar")} · ${APP_NAME}`,
    meta: [
      { name: "robots", content: "noindex, follow" },
      {
        name: "description",
        content: translate(
          locale,
          "Buscador global de comunidades, encuestas, debates, reclamos, proyectos e instituciones en Agorbis.",
        ),
      },
    ],
  };
};
