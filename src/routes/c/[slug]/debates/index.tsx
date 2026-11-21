import { component$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  type DocumentHead,
  useLocation,
} from "@qwik.dev/router";
import { EmptyListing, ListingHeader } from "~/components/quota/ListingHeader";
import { Badge, Card, Icon, cx } from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { routes } from "~/lib/community";
import { APP_NAME, PAGE_SIZE } from "~/lib/constants";
import { formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "~/routes/layout";
import { EMPTY_QUOTA, loadQuotaSummary } from "~/lib/quota";
import { beforeCursor, nextCursorParams, readCursor } from "~/lib/cursor";
import { many, single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useCommunity } from "../layout";

/** Los únicos estados filtrables; cualquier otra cosa en la URL es "todos". */
type DebateState = "abiertos" | "cerrados" | null;

export const useDebates = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const viewer = await getViewer(ev);

  const community = await single(
    ev,
    "debates/comunidad",
    db
      .from("communities")
      .select("id")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community)
    return {
      debates: [],
      nextCursor: null,
      state: null as DebateState,
      summary: EMPTY_QUOTA,
    };

  const cursor = readCursor(ev.url.searchParams);
  /**
   * Filtro por estado. Un debate cerrado ya no acepta comentarios, así que
   * mezclarlo con los abiertos hace perder tiempo: se entra, se escribe y
   * recién ahí se descubre que no hay dónde publicar. Sólo se aceptan los dos
   * valores conocidos; cualquier otra cosa en la URL es "todos".
   */
  const requestedState = ev.url.searchParams.get("estado");
  const state: DebateState =
    requestedState === "abiertos" || requestedState === "cerrados"
      ? requestedState
      : null;

  let query = db
    .from("debates")
    .select("id, title, body, status, created_at, debate_comments(count)")
    .eq("community_id", community.id)
    .neq("status", "removed")
    // El `id` desempata: sin él, dos debates publicados en el mismo instante
    // hacían desaparecer al segundo al pasar de página (D65).
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  if (state === "abiertos") query = query.eq("status", "open");
  if (state === "cerrados") query = query.eq("status", "closed");
  if (cursor) query = query.or(beforeCursor(cursor));

  const [rows, summary] = await Promise.all([
    many(ev, "debates/listado", query),
    loadQuotaSummary(ev, viewer.userId),
  ]);

  const debates = rows.map((d) => ({
    id: d.id,
    title: d.title,
    body: d.body,
    status: d.status,
    created_at: d.created_at,
    commentCount: Array.isArray(d.debate_comments)
      ? (d.debate_comments[0]?.count ?? 0)
      : 0,
  }));

  return {
    debates,
    nextCursor: nextCursorParams(debates, PAGE_SIZE),
    state,
    summary,
  };
});

export default component$(() => {
  const locale = useLocale();
  const loc = useLocation();
  const data = useDebates();
  const ctx = useCommunity();
  const { community, isMember, isAuthenticated, childCount } = ctx.value;
  const debates = data.value.debates;
  const state = data.value.state;
  /** El filtro viaja con la paginación: sin esto "más antiguos" lo perdía. */
  const stateHref = (next: "abiertos" | "cerrados" | null) =>
    next ? `?estado=${next}` : "?";

  const shared = {
    type: "debate" as const,
    communitySlug: community.slug,
    communityName: community.name,
    summary: data.value.summary,
    isMember,
    isAuthenticated,
  };

  return (
    <section aria-labelledby="debates-titulo">
      <ListingHeader
        {...shared}
        titleId="debates-titulo"
        title={translate(locale, "Debates de {{community}}", {
          community: community.name,
        })}
        description={translate(
          locale,
          "Cada debate se organiza en una columna por sub-comunidad. Vos escribís en la tuya y leés todas las demás.",
        )}
      />

      {/* Mismo control que en reclamos: tres pestañas, no un `select`. Sólo
          cuando hay algo que filtrar — sobre una comunidad sin debates el
          filtro no ayuda, sólo ocupa lugar por encima del estado vacío. */}
      {(debates.length > 0 || state) && (
        <nav
          aria-label={translate(locale, "Filtrar debates por estado")}
          class="mb-4 flex gap-1 rounded-2xl bg-inset p-1 sm:w-fit"
        >
          {(
            [
              [null, "Todos"],
              ["abiertos", "Abiertos"],
              ["cerrados", "Cerrados"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key ?? "todos"}
              href={stateHref(key)}
              aria-current={state === key ? "true" : undefined}
              class={cx(
                "flex-1 min-h-9 inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-center text-xs font-medium transition-all active:scale-95 touch-target sm:flex-none",
                state === key
                  ? "bg-surface text-ink-strong shadow-soft"
                  : "text-ink-muted hover:text-ink-strong",
              )}
            >
              {translate(locale, label)}
            </Link>
          ))}
        </nav>
      )}

      {state && (
        <div class="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-subtle bg-muted/40 px-3.5 py-2 text-xs">
          <span class="font-semibold text-ink-muted">
            {translate(locale, "Filtros activos:")}
          </span>

          <Link
            href={stateHref(null)}
            class="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-brand-500 transition-all active:scale-95 touch-manipulation"
          >
            <span>
              {state === "abiertos"
                ? translate(locale, "Abiertos")
                : translate(locale, "Cerrados")}
            </span>
            <span aria-hidden="true" class="ml-0.5 font-bold">
              ✕
            </span>
          </Link>

          <div class="ml-auto flex items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-2xs font-semibold text-ink-muted border border-subtle tabular-nums shadow-xs">
              {debates.length}{" "}
              {pluralize(debates.length, "debate", "debates", locale)}
            </span>
            <Link
              href={`/c/${community.slug}/debates`}
              class="text-2xs font-semibold text-ink-faint underline hover:text-ink-strong"
            >
              {translate(locale, "Limpiar filtros")}
            </Link>
          </div>
        </div>
      )}

      {debates.length === 0 ? (
        state ? (
          /* Un filtro vacío no es una comunidad sin debates: el estado general
             invitaría a abrir el primero de un lugar que puede tener veinte
             cerrados, y no ofrece la única salida útil, que es sacar el filtro. */
          <div class="rounded-2xl border border-dashed border-strong px-6 py-12 text-center">
            <div class="text-4xl" aria-hidden="true">
              {state === "abiertos" ? "💬" : "🔒"}
            </div>
            <h3 class="mt-3 text-base font-semibold">
              {state === "abiertos"
                ? translate(
                    locale,
                    "No hay debates abiertos en {{community}}",
                    { community: community.name },
                  )
                : translate(
                    locale,
                    "No hay debates cerrados en {{community}}",
                    { community: community.name },
                  )}
            </h3>
            <p class="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
              {translate(
                locale,
                "El filtro muestra un estado por vez: puede haber debates en el otro.",
              )}
            </p>
            <Link
              href={stateHref(null)}
              class="mt-5 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver todos los debates")}
            </Link>
          </div>
        ) : childCount === 0 ? (
          <div class="rounded-2xl border border-dashed border-strong px-6 py-12 text-center">
            <div class="text-4xl" aria-hidden="true">
              🚧
            </div>
            <h3 class="mt-3 text-base font-semibold">
              {translate(locale, "{{community}} no tiene sub-comunidades", {
                community: community.name,
              })}
            </h3>
            <p class="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
              {translate(
                locale,
                "La grilla de un debate se arma con una columna por sub-comunidad. Sin ellas no hay debate posible acá; probá en un nivel más general.",
              )}
            </p>
          </div>
        ) : (
          <EmptyListing
            {...shared}
            emoji="💬"
            title={translate(
              locale,
              "Todavía no se abrió ningún debate en {{community}}",
              {
                community: community.name,
              },
            )}
            why={
              childCount === null
                ? translate(
                    locale,
                    "Consultá las sub-comunidades para conocer las columnas de los debates.",
                  )
                : translate(
                    locale,
                    "Un debate acá se despliega en {{count}} columnas, una por sub-comunidad. Sirve para ver de una sola pasada cómo se ve el mismo problema desde cada lugar, en vez de una discusión donde gana el que más escribe.",
                    { count: formatNumber(childCount, locale) },
                  )
            }
          />
        )
      ) : (
        <>
          {/* Cuántos hay en pantalla y bajo qué filtro. Una grilla recortada a
              20 no se distinguía de una comunidad con exactamente 20. */}
          <p aria-live="polite" class="mb-3 text-xs text-ink-faint">
            {translate(locale, "Mostrando {{count}}", {
              count: pluralize(debates.length, "debate", "debates", locale),
            })}
          </p>

          <ul class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {debates.map((debate) => {
              const isOpen = debate.status === "open";
              return (
                <li key={debate.id}>
                  <Card class="h-full transition-all hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] touch-manipulation">
                    <Link
                      href={routes.debate(debate.id)}
                      class="flex h-full flex-col rounded-2xl p-5 touch-target"
                    >
                      <div class="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={isOpen ? "success" : "neutral"}>
                          {isOpen
                            ? translate(locale, "Abierto")
                            : translate(locale, "Cerrado")}
                        </Badge>
                        {childCount !== null && (
                          <Badge tone="neutral">
                            {pluralize(
                              childCount,
                              "columna",
                              "columnas",
                              locale,
                            )}
                          </Badge>
                        )}
                      </div>
                      <h3
                        dir="auto"
                        class="text-balance text-lg font-semibold tracking-tight text-ink-strong"
                      >
                        {debate.title}
                      </h3>
                      <p
                        dir="auto"
                        class="ugc-text mt-1.5 line-clamp-2 flex-1 text-sm text-ink-muted"
                      >
                        {debate.body}
                      </p>
                      {/* Barra de actividad comunitaria */}
                      <div class="mt-3.5">
                        <div class="flex items-center justify-between text-xs text-ink-faint">
                          <span class="flex items-center gap-1 font-medium">
                            {debate.commentCount >= 10 ? (
                              <span class="text-amber-600 dark:text-amber-400">
                                🔥 {translate(locale, "Debate activo")}
                              </span>
                            ) : debate.commentCount > 0 ? (
                              <span class="text-brand">
                                💬 {translate(locale, "En discusión")}
                              </span>
                            ) : (
                              <span>
                                ✨ {translate(locale, "Iniciando conversación")}
                              </span>
                            )}
                          </span>
                          <span>
                            {debate.commentCount === 0
                              ? translate(locale, "Sin aportes")
                              : translate(locale, "{{count}} aportes", {
                                  count: formatNumber(
                                    debate.commentCount,
                                    locale,
                                  ),
                                })}
                          </span>
                        </div>
                        <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                          <div
                            class={cx(
                              "h-full rounded-full transition-all duration-500",
                              debate.commentCount >= 10
                                ? "bg-gradient-to-r from-amber-500 to-rose-500"
                                : debate.commentCount > 0
                                  ? "bg-gradient-to-r from-brand-500 to-indigo-500"
                                  : "bg-ink-faint/20",
                            )}
                            style={{
                              width: `${Math.min(100, Math.max(debate.commentCount > 0 ? 15 : 4, (debate.commentCount / 20) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>

                      <p class="mt-2 text-xs text-ink-faint">
                        <RelativeTime value={debate.created_at} />
                      </p>
                      {/* La tarjeta entera es un enlace y nada decía a qué
                          lleva. Entrar a escribir y entrar a leer un debate ya
                          cerrado son dos cosas distintas, y se sabe acá. */}
                      <p class="mt-2.5 text-sm font-medium text-brand">
                        {isOpen
                          ? translate(locale, "Sumar tu perspectiva")
                          : translate(locale, "Leer el debate")}
                        <Icon name="arrow-right" class="ml-1 text-sm" />
                      </p>
                    </Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* La paginación por cursor sólo avanza. Sin esto, quien bajó tres
          páginas no tiene forma de volver al principio salvo editar la URL. */}
      {(data.value.nextCursor || loc.url.searchParams.has("antes")) && (
        <nav
          aria-label={translate(locale, "Paginación")}
          class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium"
        >
          {loc.url.searchParams.has("antes") && (
            <Link
              href={stateHref(state)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand transition-all active:scale-95 touch-target hover:bg-muted hover:underline"
            >
              {translate(locale, "← Volver al principio")}
            </Link>
          )}
          {data.value.nextCursor && (
            <Link
              href={`?${data.value.nextCursor}${state ? `&estado=${state}` : ""}`}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand transition-all active:scale-95 touch-target hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver debates más antiguos")}
              <Icon name="arrow-right" class="ml-1 text-sm" />
            </Link>
          )}
        </nav>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader);
  const name = ctx?.community.name ?? "";
  return {
    title: `${translate(locale, "Debates de {{community}}", { community: name })} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Debates de {{community}} en Agorbis, organizados en columnas por sub-comunidad.",
          { community: name },
        ),
      },
    ],
  };
};
