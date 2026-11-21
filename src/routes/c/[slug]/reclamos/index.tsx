import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  type DocumentHead,
  useLocation,
} from "@qwik.dev/router";
import { ClaimCard, type ClaimCardData } from "~/components/claims/ClaimCard";
import { centerInRow } from "~/lib/center-in-row";
import { routes } from "~/lib/community";
import { EmptyListing, ListingHeader } from "~/components/quota/ListingHeader";
import { CivicTour } from "~/components/onboarding/CivicTour";
import { NewActivityBanner } from "~/components/community/NewActivityBanner";
import { Chip, Icon, cx, PullToRefresh } from "~/components/ui";
import {
  CLAIM_SEARCH_MAX_LENGTH,
  claimListHref,
  claimSearchFilter,
  readClaimFilters,
  type ClaimFilters,
} from "~/lib/claim-search";
import {
  APP_NAME,
  CLAIMS_DISCLAIMER,
  CLAIM_CATEGORIES,
  PAGE_SIZE,
} from "~/lib/constants";
import { pluralize } from "~/lib/format";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { EMPTY_QUOTA, loadQuotaSummary } from "~/lib/quota";
import { beforeCursor, nextCursorParams, readCursor } from "~/lib/cursor";
import { many, single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";
import { useCommunity } from "../layout";

/**
 * Tope de reclamos elevados que se muestran (D58): sin él, un nivel superior
 * con muchas sub-comunidades silenciosas se vuelve un vertedero y pierde
 * justamente la señal que lo hacía útil.
 */
const ESCALATED_SHOWN = 10;

type EscalatedClaim = ClaimCardData & {
  community_id: string;
  /** Comunidad donde ocurre el problema; el reclamo sigue siendo suyo (D58). */
  origin: {
    id: string;
    slug: string;
    name: string;
    emoji: string | null;
  } | null;
};

export const useClaims = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const viewer = await getViewer(ev);
  const filters = readClaimFilters(ev.url.searchParams);
  const { sort, category, status, query: searchQuery } = filters;

  const community = await single(
    ev,
    "reclamos/comunidad",
    db
      .from("communities")
      .select("id")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community)
    return {
      claims: [] as ClaimCardData[],
      escalated: [] as EscalatedClaim[],
      nextCursor: null,
      ...filters,
      summary: EMPTY_QUOTA,
    };

  const cursor = readCursor(ev.url.searchParams);

  let query = db
    .from("claims")
    .select(
      "id, title, description, category, status, image_url, support_count, created_at, response_due_at, first_response_at, escalated_at",
    )
    .eq("community_id", community.id)
    .neq("status", "removed")
    .limit(PAGE_SIZE);

  if (category) query = query.eq("category", category);
  const searchFilter = claimSearchFilter(searchQuery);
  if (searchFilter) query = query.or(searchFilter);

  if (status === "resueltos") {
    query = query.eq("status", "resolved");
  } else if (status === "abiertos") {
    query = query.in("status", [
      "open",
      "under_review",
      "acknowledged",
      "in_progress",
    ]);
  }

  query =
    sort === "apoyados"
      ? query
          .order("support_count", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : // El `id` desempata (D65): sin él, dos reclamos publicados en el mismo
        // instante hacían desaparecer al segundo al pasar de página.
        query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });

  // El cursor sólo aplica al orden cronológico; ordenar por apoyos usa la
  // primera página, que es lo que interesa en ese modo.
  if (cursor && sort === "recientes") query = query.or(beforeCursor(cursor));

  const [rows, escalatedRows, summary] = await Promise.all([
    many(ev, "reclamos/listado", query),
    // Elevados desde abajo. Se muestran aparte y no mezclados en el listado:
    // pertenecen a otra comunidad y confundirlos sería mentir sobre dónde
    // ocurre el problema (D58).
    many(
      ev,
      "reclamos/elevados",
      db
        .from("claims")
        .select(
          "id, title, description, category, status, image_url, support_count, created_at, response_due_at, first_response_at, escalated_at, community_id",
        )
        .eq("escalated_to_community_id", community.id)
        .neq("status", "removed")
        .order("escalated_at", { ascending: false })
        .limit(ESCALATED_SHOWN),
    ),
    loadQuotaSummary(ev, viewer.userId),
  ]);
  const claims = rows as ClaimCardData[];

  // La comunidad de origen se resuelve aparte: los tipos generados no declaran
  // la relación, así que el embed de PostgREST no tipa.
  const escalatedBase = escalatedRows ?? [];
  const originIds = [...new Set(escalatedBase.map((c) => c.community_id))];
  const { data: origins } = originIds.length
    ? await db
        .from("communities")
        .select("id, slug, name, emoji")
        .in("id", originIds)
    : { data: [] };
  const originById = new Map((origins ?? []).map((c) => [c.id, c]));

  return {
    claims,
    escalated: escalatedBase.map((c) => ({
      ...c,
      origin: originById.get(c.community_id) ?? null,
    })) as EscalatedClaim[],
    nextCursor:
      sort === "recientes" ? nextCursorParams(claims, PAGE_SIZE) : null,
    ...filters,
    summary,
  };
});

export default component$(() => {
  const data = useClaims();
  const ctx = useCommunity();
  const locale = useLocale();
  const loc = useLocation();
  const { community, isMember, isAuthenticated } = ctx.value;
  const claims = data.value.claims;
  const sort = data.value.sort;
  const category = data.value.category;
  const status = data.value.status;
  const searchQuery = data.value.query;

  /**
   * Los filtros son independientes y tienen que poder combinarse: cambiar
   * de categoría no puede tirar abajo el orden elegido ni el estado. Se arma
   * la URL entera cada vez en vez de acumular parámetros a mano.
   */
  const listHref = (next: Partial<ClaimFilters> = {}, cursor?: string | null) =>
    claimListHref(
      { query: searchQuery, sort, category, status, ...next },
      cursor,
    );

  /**
   * La fila de categorías desborda a la derecha y arranca en el principio: al
   * entrar por un enlace con `?categoria=ambiente` el chip aplicado quedaba
   * fuera de la pantalla y nada indicaba que había un filtro puesto.
   */
  const chips = useSignal<HTMLElement>();
  // eslint-disable-next-line qwik/no-use-visible-task -- depende del ancho real de la fila
  useVisibleTask$(({ track }) => {
    track(() => category);
    centerInRow(chips.value, "[aria-current]");
  });

  const shared = {
    type: "claim" as const,
    communitySlug: community.slug,
    communityName: community.name,
    summary: data.value.summary,
    isMember,
    isAuthenticated,
  };

  return (
    <PullToRefresh>
      <section aria-labelledby="reclamos-titulo">
        <ListingHeader
          {...shared}
          titleId="reclamos-titulo"
          title={translate(locale, "Reclamos de {{community}}", {
            community: community.name,
          })}
          description={translate(
            locale,
            "Problemas concretos que afectan a quienes viven acá.",
          )}
        />

        <NewActivityBanner communitySlug={community.slug} claimDates={claims} />

        <p class="mb-5 rounded-2xl bg-muted px-4 py-2.5 text-xs text-ink-muted">
          <span aria-hidden="true">ℹ️</span>{" "}
          {translate(locale, CLAIMS_DISCLAIMER)}
        </p>

        {/* Filtro por estado del reclamo y enlace al Mapa interactivo */}
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label={translate(locale, "Filtrar por estado")}
            class="flex gap-1 rounded-2xl bg-inset p-1 sm:w-fit"
          >
            {(
              [
                ["todos", "Todos los reclamos"],
                ["abiertos", "📣 En curso"],
                ["resueltos", "🏆 Victorias"],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={listHref({ status: key })}
                aria-current={status === key ? "true" : undefined}
                class={cx(
                  "flex-1 rounded-xl px-3 py-1.5 text-center text-xs font-medium transition-colors sm:flex-none",
                  status === key
                    ? "bg-surface text-ink-strong shadow-soft"
                    : "text-ink-muted hover:text-ink-strong",
                )}
              >
                {translate(locale, label)}
              </Link>
            ))}
          </nav>

          <Link
            href={`/c/${community.slug}/mapa`}
            class="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-subtle bg-surface px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-brand-500 hover:text-brand"
          >
            <span aria-hidden="true">🗺️</span>{" "}
            {translate(locale, "Ver en Mapa")}
          </Link>
        </div>

        <form method="get" class="mb-4" role="search">
          {category && (
            <input type="hidden" name="categoria" value={category} />
          )}
          {status !== "todos" && (
            <input type="hidden" name="estado" value={status} />
          )}
          {sort !== "recientes" && (
            <input type="hidden" name="orden" value={sort} />
          )}
          <label for="claim-search" class="sr-only">
            {translate(locale, "Buscar reclamos")}
          </label>
          <div class="flex flex-wrap gap-2">
            <input
              id="claim-search"
              name="q"
              type="search"
              value={searchQuery}
              maxLength={CLAIM_SEARCH_MAX_LENGTH}
              aria-describedby="claim-search-help"
              placeholder={translate(
                locale,
                "Buscar reclamos por palabra clave (ej. bache, luminaria, basura)...",
              )}
              class="min-w-0 flex-1 rounded-2xl border border-control bg-surface px-4 py-2.5 text-sm text-ink-strong placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              class="inline-flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {translate(locale, "Buscar")}
            </button>
            {searchQuery && (
              <Link
                href={listHref({ query: "" })}
                class="inline-flex min-h-11 items-center rounded-2xl px-3 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink-strong"
              >
                {translate(locale, "Limpiar búsqueda")}
              </Link>
            )}
          </div>
          <p id="claim-search-help" class="mt-2 text-xs text-ink-muted">
            {translate(
              locale,
              "Busca en el título y la descripción de todos los reclamos de esta comunidad.",
            )}
          </p>
        </form>

        {/* Chips de categoría, como en encuestas. Un listado de reclamos mezcla
          ocho tipos de problema y hasta ahora la única forma de encontrar el
          propio era leerlos todos. */}
        <nav
          ref={chips}
          aria-label={translate(locale, "Filtrar reclamos por categoría")}
          class="scrollbar-slim tabs-scroll-hint sticky top-[6.75rem] z-20 -mx-4 mb-4 flex snap-x snap-proximity items-center gap-2 overflow-x-auto overscroll-x-contain bg-surface/90 px-4 py-2.5 backdrop-blur-md shadow-xs sm:mx-0 sm:rounded-2xl sm:px-3 sm:py-2"
        >
          <Chip
            href={listHref({ category: null })}
            selected={!category}
            class="min-h-11 shrink-0 snap-start"
          >
            {translate(locale, "Todas")}
          </Chip>
          {/* Chip único con el ícono propio de la categoría (D125). */}
          {CLAIM_CATEGORIES.map((item) => (
            <Chip
              key={item.key}
              href={listHref({ category: item.key })}
              selected={category === item.key}
              icon={item.icon}
              class="min-h-11 shrink-0 snap-start"
            >
              {translate(locale, item.label)}
            </Chip>
          ))}
        </nav>

        {claims.length > 0 && (
          <nav
            aria-label={translate(locale, "Ordenar reclamos")}
            class="mb-4 flex gap-1 rounded-2xl bg-inset p-1 sm:w-fit"
          >
            {(
              [
                ["recientes", "Más recientes"],
                ["apoyados", "Más apoyados"],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={listHref({ sort: key })}
                aria-current={sort === key ? "true" : undefined}
                class={cx(
                  "flex-1 min-h-9 inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-center text-xs font-medium transition-all active:scale-95 touch-target sm:flex-none",
                  sort === key
                    ? "bg-surface text-ink-strong shadow-soft"
                    : "text-ink-muted hover:text-ink-strong",
                )}
              >
                {translate(locale, label)}
              </Link>
            ))}
          </nav>
        )}

        {(category ||
          (status && status !== "todos") ||
          sort === "apoyados" ||
          searchQuery) && (
          <div class="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-subtle bg-muted/40 px-3.5 py-2 text-xs">
            <span class="font-semibold text-ink-muted">
              {translate(locale, "Filtros activos:")}
            </span>

            {category && (
              <Link
                href={listHref({ category: null })}
                class="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-brand-500 transition-all active:scale-95 touch-manipulation"
              >
                <Icon
                  name={
                    CLAIM_CATEGORIES.find((c) => c.key === category)?.icon ??
                    "tag"
                  }
                  class="text-sm"
                />
                <span>
                  {translate(
                    locale,
                    CLAIM_CATEGORIES.find((c) => c.key === category)?.label ??
                      "",
                  )}
                </span>
                <Icon name="x" class="ml-0.5 text-xs" />
              </Link>
            )}

            {status && status !== "todos" && (
              <Link
                href={listHref({ status: "todos" })}
                class="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-brand-500 transition-all active:scale-95 touch-manipulation"
              >
                <span>
                  {status === "resueltos"
                    ? translate(locale, "Victorias")
                    : translate(locale, "En curso")}
                </span>
                <span aria-hidden="true" class="ml-0.5 font-bold">
                  ✕
                </span>
              </Link>
            )}

            {sort === "apoyados" && (
              <Link
                href={listHref({ sort: "recientes" })}
                class="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-brand-500"
              >
                <span>{translate(locale, "Más apoyados")}</span>
                <span aria-hidden="true" class="ml-0.5 font-bold">
                  ✕
                </span>
              </Link>
            )}

            <div class="ml-auto flex items-center gap-2">
              <span class="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-2xs font-semibold text-ink-muted border border-subtle tabular-nums shadow-xs">
                {claims.length}{" "}
                {pluralize(claims.length, "reclamo", "reclamos", locale)}
              </span>
              <Link
                href={`/c/${community.slug}/reclamos`}
                class="text-2xs font-semibold text-ink-faint underline hover:text-ink-strong"
              >
                {translate(locale, "Limpiar filtros")}
              </Link>
            </div>
          </div>
        )}

        {claims.length === 0 ? (
          searchQuery ||
          status !== "todos" ||
          loc.url.searchParams.has("antes") ? (
            <div class="rounded-2xl border border-dashed border-strong px-6 py-10 text-center">
              <div class="text-3xl" aria-hidden="true">
                🔍
              </div>
              <h3 class="mt-2 text-base font-semibold">
                {translate(
                  locale,
                  searchQuery
                    ? "No se encontraron reclamos con esa búsqueda"
                    : "No hay reclamos con estos filtros.",
                )}
              </h3>
              <p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                {translate(
                  locale,
                  "Probá con otra palabra clave o revisá los filtros aplicados.",
                )}
              </p>
              <Link
                href={
                  searchQuery
                    ? listHref({ query: "" })
                    : listHref({ status: "todos" })
                }
                class="mt-4 inline-flex min-h-11 items-center rounded-xl bg-muted px-3 text-sm font-semibold text-ink-strong hover:bg-muted/80"
              >
                {translate(
                  locale,
                  searchQuery ? "Limpiar búsqueda" : "← Volver al principio",
                )}
              </Link>
            </div>
          ) : category ? (
            /* Un filtro sin resultados no es una comunidad sin reclamos: el
             estado general invitaría a publicar el primero de un lugar que
             puede tener treinta de otras categorías. */
            <div class="rounded-3xl border border-dashed border-strong/80 bg-surface/60 px-6 py-12 text-center shadow-soft">
              <Icon
                name={
                  CLAIM_CATEGORIES.find((c) => c.key === category)?.icon ??
                  "megaphone"
                }
                class="mx-auto text-4xl text-ink-faint"
                stroke={1.5}
              />
              <h3 class="mt-3 text-base font-semibold text-ink-strong">
                {translate(
                  locale,
                  "No hay reclamos de {{category}} en {{community}}",
                  {
                    category: translate(
                      locale,
                      CLAIM_CATEGORIES.find((c) => c.key === category)?.label ??
                        "",
                    ),
                    community: community.name,
                  },
                )}
              </h3>
              <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                {translate(
                  locale,
                  "Puede haber reclamos de otros temas: el filtro muestra una categoría por vez.",
                )}
              </p>
              <Link
                href={listHref({ category: null })}
                class="mt-5 inline-flex min-h-12 items-center rounded-2xl border border-brand-500/30 bg-surface px-5 text-sm font-semibold text-brand shadow-xs transition hover:bg-muted hover:border-brand-500 active:scale-95 touch-manipulation"
              >
                {translate(locale, "Ver todas las categorías")}
              </Link>
            </div>
          ) : (
            <EmptyListing
              {...shared}
              emoji="📣"
              title={translate(
                locale,
                "Todavía no hay reclamos en {{community}}",
                { community: community.name },
              )}
              why={translate(
                locale,
                "Un reclamo publicado, con foto y lugar, y con vecinos que dicen “a mí también me pasa”, es mucho más difícil de ignorar que una queja suelta. Acá se ve cuánta gente comparte el mismo problema.",
              )}
            />
          )
        ) : (
          <>
            <p aria-live="polite" class="mb-3 text-xs text-ink-faint">
              {translate(locale, "Mostrando {{count}}", {
                count: pluralize(claims.length, "reclamo", "reclamos", locale),
              })}
              {/* Ordenar por apoyos apaga la paginación por cursor (el orden ya
                no es cronológico): antes se veían veinte y no había ni enlace
                a la página siguiente ni nada que dijera por qué. */}
              {sort === "apoyados" && (
                <>
                  {" · "}
                  {translate(
                    locale,
                    "los más apoyados primero; para recorrerlos todos, ordená por fecha",
                  )}
                </>
              )}
            </p>

            <ul
              id="listado-reclamos"
              class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3"
            >
              {claims.map((claim, index) => (
                <>
                  <li key={claim.id}>
                    <ClaimCard claim={claim} />
                  </li>
                  {/* La guía de tres pasos iba arriba de la lista, también
                      para visitantes, y empujaba los reclamos fuera de la
                      primera pantalla. Va después del primer reclamo, en una
                      celda propia a todo el ancho, y sólo para quien vive
                      acá, que es quien puede publicar (décima ronda, mejora 7). */}
                  {index === 0 && isMember && (
                    <li
                      key={`${claim.id}-guia`}
                      data-claims-tour-slot
                      class="col-span-full"
                    >
                      <CivicTour communityName={community.name} />
                    </li>
                  )}
                </>
              ))}
            </ul>
          </>
        )}

        {/* ------------------------------------------- Elevados desde abajo */}
        {data.value.escalated.length > 0 && (
          <section class="mt-10" aria-labelledby="elevados-titulo">
            <div class="rounded-3xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-950/40 sm:p-6">
              <h2
                id="elevados-titulo"
                class="text-lg font-semibold tracking-tight"
              >
                <span aria-hidden="true">↑</span>{" "}
                {translate(locale, "Elevados desde tus sub-comunidades")}
              </h2>
              <p class="mt-1.5 max-w-2xl text-sm text-ink-muted">
                {translate(
                  locale,
                  "Reclamos que vencieron su plazo de respuesta más abajo y nadie acusó recibo. Siguen perteneciendo a su comunidad: acá se muestran para que no queden sin destinatario.",
                )}
              </p>

              <ul class="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {data.value.escalated.map((claim) => (
                  <li key={claim.id}>
                    {/* El nombre del lugar era texto plano. En la sección que
                      existe para no perder de vista dónde ocurre el problema,
                      lo primero que se quiere hacer con ese nombre es ir a
                      ver qué más está pasando ahí. */}
                    {claim.origin && (
                      <p class="mb-1.5 px-1 text-xs font-medium">
                        <Link
                          href={`${routes.community(claim.origin.slug)}/reclamos`}
                          class="text-ink-muted hover:text-brand hover:underline"
                        >
                          <span aria-hidden="true">
                            {claim.origin.emoji ?? "📍"}
                          </span>{" "}
                          {claim.origin.name}
                        </Link>
                      </p>
                    )}
                    <ClaimCard claim={claim} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* La paginación por cursor sólo avanza. Sin esto, quien bajó tres
          páginas no tiene forma de volver al principio salvo editar la URL. */}
        {(data.value.nextCursor || loc.url.searchParams.has("antes")) && (
          <nav
            aria-label={translate(locale, "Paginación")}
            class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            {loc.url.searchParams.has("antes") && (
              <Link
                href={listHref({})}
                class="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-subtle bg-surface px-4 py-2 text-xs font-semibold text-ink-muted shadow-xs transition-all active:scale-95 touch-target hover:border-strong hover:text-ink-strong"
              >
                {translate(locale, "← Volver al principio")}
              </Link>
            )}
            {data.value.nextCursor && (
              <Link
                href={listHref({}, data.value.nextCursor)}
                class="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-brand-500/30 bg-surface px-6 py-2.5 text-sm font-semibold text-brand shadow-soft transition-all hover:border-brand-500 hover:bg-brand-50/50 hover:shadow active:scale-[0.98] touch-manipulation cursor-pointer dark:hover:bg-brand-950/30"
              >
                {translate(locale, "Ver reclamos más antiguos")}{" "}
                <Icon name="arrow-right" class="text-[1.1em]" />
              </Link>
            )}
          </nav>
        )}
      </section>
    </PullToRefresh>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const name = ctx?.community.name ?? "";
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  return {
    title: `${translate(locale, "Reclamos de {{community}}", { community: name })} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Reclamos vecinales de {{community}} en Agorbis: qué no funciona y a cuánta gente afecta.",
          { community: name },
        ),
      },
    ],
  };
};
