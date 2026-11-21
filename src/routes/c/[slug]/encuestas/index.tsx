import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  AgreementsSection,
  type AgreementListItem,
} from "~/components/agreements/AgreementsSection";
import { PollCard, type PollCardData } from "~/components/polls/PollCard";
import { EmptyListing, ListingHeader } from "~/components/quota/ListingHeader";
import { Chip, Icon } from "~/components/ui";
import { centerInRow } from "~/lib/center-in-row";
import {
  APP_NAME,
  PAGE_SIZE,
  POLL_CATEGORIES,
  POLL_CATEGORY_BY_KEY,
} from "~/lib/constants";
import type { PollCategory } from "~/lib/database.types.helpers";
import { pluralize } from "~/lib/format";
import { readCursor } from "~/lib/cursor";
import { isAgreementStatus } from "~/lib/agreements";
import { logFailure } from "~/lib/log";
import { requestIdOf } from "~/lib/request-id";
import { communitySlugFromRoute, routes } from "~/lib/community";
import { useLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "~/routes/layout";
import { EMPTY_QUOTA, loadQuotaSummary } from "~/lib/quota";
import { many, single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useCommunity } from "../layout";
import { pollListHref, pollPage } from "./poll-pagination";

/** Hasta diez acuerdos de la comunidad para la sección de la pestaña (D118). */
const AGREEMENTS_LIMIT = 10;

export const useCommunityAgreements = routeLoader$(
  async (ev): Promise<{ items: AgreementListItem[]; failed: boolean }> => {
    const ctx = await ev.resolveValue(useCommunity);
    const requestId = requestIdOf(ev);
    const { data, error } = await supabase(ev).rpc("community_agreements", {
      p_community: ctx.community.id,
      p_limit: AGREEMENTS_LIMIT,
    });
    if (error) {
      // Un fallo de lectura no es "no hay acuerdos": la sección lo dice y
      // la pestaña sigue en pie (D74).
      logFailure({ scope: "c/encuestas/acuerdos", requestId }, error);
      return { items: [], failed: true };
    }
    // Un estado que la interfaz no conoce no se dibuja con palabras
    // inventadas: se deja afuera y queda en el log.
    const items = (data ?? []).flatMap((row) => {
      if (!isAgreementStatus(row.status_derived)) {
        logFailure(
          { scope: "c/encuestas/acuerdos/estado-desconocido", requestId },
          { message: `status ${row.status_derived}` },
        );
        return [];
      }
      return [
        {
          id: row.id,
          title: row.title,
          status: row.status_derived,
          closes_at: row.closes_at,
          party_count: Number(row.party_count),
          adhered_count: Number(row.adhered_count),
        },
      ];
    });
    return { items, failed: false };
  },
);

export const usePolls = routeLoader$(
  async (ev) => {
    const db = supabase(ev);
    const viewer = await getViewer(ev);

    const community = await single(
      ev,
      "encuestas/comunidad",
      db
        .from("communities")
        .select("id, path")
        .eq("slug", communitySlugFromRoute(ev.params, ev.url))
        .maybeSingle(),
    );

    if (!community)
      return {
        polls: [] as PollCardData[],
        nextCursor: null,
        category: null,
        hasCursor: false,
        summary: EMPTY_QUOTA,
      };

    const requestedCategory = ev.url.searchParams.get("categoria");
    const category =
      POLL_CATEGORIES.find((item) => item.key === requestedCategory)?.key ??
      null;
    const cursor = readCursor(ev.url.searchParams);

    const [rows, summary] = await Promise.all([
      many(
        ev,
        "encuestas/listado",
        db.rpc("poll_feed", {
          p_community: community.id,
          p_limit: PAGE_SIZE + 1,
          p_before_created: cursor?.created_at,
          p_before_id: cursor?.id,
          p_category: category ?? undefined,
        }),
      ),
      loadQuotaSummary(ev, viewer.userId),
    ]);

    return {
      ...pollPage(rows as PollCardData[]),
      category,
      hasCursor: !!cursor,
      summary,
    };
  },
  { search: ["categoria", "antes", "id"] },
);

export default component$(() => {
  const locale = useLocale();
  const data = usePolls();
  const agreements = useCommunityAgreements();
  const ctx = useCommunity();
  const { community, isMember, isAuthenticated } = ctx.value;
  const category = data.value.category as PollCategory | null;
  const categoryHref = (next: PollCategory | null) => pollListHref(next);
  const polls = data.value.polls;

  /**
   * La fila de categorías desborda a la derecha y arranca siempre en el
   * principio. Al entrar por un enlace con `?categoria=seguridad` —o al volver
   * atrás desde una encuesta— el chip aplicado quedaba fuera de la pantalla:
   * el filtro estaba puesto y no había forma de verlo sin arrastrar la fila.
   * Se centra sólo el contenedor horizontal, no la página.
   */
  const chips = useSignal<HTMLElement>();
  // eslint-disable-next-line qwik/no-use-visible-task -- depende del ancho real de la fila
  useVisibleTask$(({ track }) => {
    track(() => category);
    centerInRow(chips.value, "[aria-current]");
  });

  const shared = {
    type: "poll" as const,
    communitySlug: community.slug,
    communityName: community.name,
    summary: data.value.summary,
    isMember,
    isAuthenticated,
  };

  return (
    <section aria-labelledby="encuestas-titulo">
      <ListingHeader
        {...shared}
        titleId="encuestas-titulo"
        title={translate(locale, "Encuestas de {{community}}", {
          community: community.name,
        })}
        description={
          isMember
            ? translate(
                locale,
                "Vivís acá, así que podés votar y crear. Los resultados se publican al cierre con al menos 5 participantes.",
              )
            : translate(
                locale,
                "Los resultados cerrados con participación suficiente son públicos; votar y crear pueden quienes viven acá.",
              )
        }
      />

      <AgreementsSection
        items={agreements.value.items}
        failed={agreements.value.failed}
        proposeHref={
          isMember ? routes.newContent(community.slug, "acuerdos/nuevo") : null
        }
        communityName={community.name}
      />

      <nav
        ref={chips}
        aria-label={translate(locale, "Filtrar encuestas por categoría")}
        class="scrollbar-slim tabs-scroll-hint -mx-4 mb-5 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {/* `aria-current` es lo único que dice cuál está aplicado cuando el
            color no se ve: los chips son enlaces idénticos entre sí. */}
        {/* El mismo Chip que Inicio y la comunidad, con el ícono propio de
            cada categoría en vez del emoji (D125). */}
        <Chip
          href={categoryHref(null)}
          selected={!category}
          class="min-h-11 shrink-0 snap-start"
        >
          {translate(locale, "Todas")}
        </Chip>
        {POLL_CATEGORIES.map((item) => (
          <Chip
            key={item.key}
            href={categoryHref(item.key)}
            selected={category === item.key}
            icon={item.icon}
            class="min-h-11 shrink-0 snap-start"
          >
            {translate(locale, item.label)}
          </Chip>
        ))}
      </nav>

      {category && (
        <div class="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-subtle bg-muted/40 px-3.5 py-2 text-xs">
          <span class="font-semibold text-ink-muted">
            {translate(locale, "Filtros activos:")}
          </span>

          <Link
            href={categoryHref(null)}
            class="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-brand-500"
          >
            <Icon name={POLL_CATEGORY_BY_KEY[category].icon} class="text-sm" />
            <span>
              {translate(locale, POLL_CATEGORY_BY_KEY[category].label)}
            </span>
            <Icon name="x" class="ml-0.5 text-xs" />
          </Link>

          <div class="ml-auto flex items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-2xs font-semibold text-ink-muted border border-subtle tabular-nums shadow-xs">
              {polls.length}{" "}
              {pluralize(polls.length, "encuesta", "encuestas", locale)}
            </span>
            <Link
              href={`/c/${community.slug}/encuestas`}
              class="text-2xs font-semibold text-ink-faint underline hover:text-ink-strong"
            >
              {translate(locale, "Limpiar filtros")}
            </Link>
          </div>
        </div>
      )}

      {polls.length === 0 ? (
        data.value.hasCursor ? (
          <div class="rounded-2xl border border-dashed border-strong px-6 py-12 text-center">
            <h3 class="text-base font-semibold">
              {translate(locale, "Llegaste al final de las encuestas.")}
            </h3>
            <p class="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
              {translate(
                locale,
                "No hay más encuestas con estos filtros. Podés volver al principio para ver las más recientes.",
              )}
            </p>
          </div>
        ) : category ? (
          /* Un filtro sin resultados no es una comunidad sin encuestas. El
             estado vacío general invitaba a crear la primera encuesta de un
             lugar que podía tener treinta, y no ofrecía la única salida útil:
             sacar el filtro. */
          <div class="rounded-2xl border border-dashed border-strong px-6 py-12 text-center">
            <Icon
              name={POLL_CATEGORY_BY_KEY[category].icon}
              class="mx-auto text-4xl text-ink-faint"
              stroke={1.5}
            />
            <h3 class="mt-3 text-base font-semibold">
              {translate(
                locale,
                "No hay encuestas de {{category}} en {{community}}",
                {
                  category: translate(
                    locale,
                    POLL_CATEGORY_BY_KEY[category].label,
                  ),
                  community: community.name,
                },
              )}
            </h3>
            <p class="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
              {translate(
                locale,
                "Puede haber encuestas de otros temas: el filtro sólo muestra una categoría por vez.",
              )}
            </p>
            <Link
              href={categoryHref(null)}
              class="mt-5 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver todas las categorías")}
            </Link>
          </div>
        ) : (
          <EmptyListing
            {...shared}
            emoji="🗳️"
            title={translate(
              locale,
              "Nadie preguntó nada todavía en {{community}}",
              {
                community: community.name,
              },
            )}
            why={translate(
              locale,
              "Las encuestas sirven para conocer prioridades sin exponer elecciones individuales. Los resultados se publican al cierre sólo con participación suficiente.",
            )}
          />
        )
      ) : (
        <>
          {/* Cuántas hay en pantalla y bajo qué filtro. Con la fila de chips
              desplazada, el único indicio de que había un filtro puesto era el
              color de un chip que podía no verse; y una grilla recortada a 20
              no se distinguía de una comunidad con exactamente 20. */}
          <p
            aria-live="polite"
            class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint"
          >
            <span>
              {translate(locale, "Mostrando {{count}}", {
                count: pluralize(polls.length, "encuesta", "encuestas", locale),
              })}
            </span>
            {category && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  href={categoryHref(null)}
                  class="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 font-medium text-brand transition-colors hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/60"
                >
                  <Icon
                    name={POLL_CATEGORY_BY_KEY[category].icon}
                    class="text-sm"
                  />
                  {translate(locale, POLL_CATEGORY_BY_KEY[category].label)}
                  <Icon name="x" class="text-xs" />
                  <span class="sr-only">
                    {translate(locale, "Quitar el filtro")}
                  </span>
                </Link>
              </>
            )}
          </p>

          <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {polls.map((poll) => (
              <li key={poll.id}>
                <PollCard poll={poll} />
              </li>
            ))}
          </ul>
        </>
      )}
      {/* La paginación por cursor sólo avanza. Sin esto, quien bajó tres
              páginas no tiene forma de volver al principio salvo editar la
              URL. El "principio" conserva la categoría elegida. */}
      {(data.value.nextCursor || data.value.hasCursor) && (
        <nav
          aria-label={translate(locale, "Paginación")}
          class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium"
        >
          {data.value.hasCursor && (
            <Link
              href={pollListHref(category)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "← Volver al principio")}
            </Link>
          )}
          {data.value.nextCursor && (
            <Link
              href={pollListHref(category, data.value.nextCursor)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver encuestas más antiguas")}
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
    title: `${translate(locale, "Encuestas de {{community}}", { community: name })} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Participá de las encuestas de {{community}} en Agorbis. Los resultados se protegen hasta el cierre y requieren al menos 5 participantes.",
          { community: name },
        ),
      },
    ],
  };
};
