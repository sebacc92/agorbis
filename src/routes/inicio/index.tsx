import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  useLocation,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Badge,
  ButtonLink,
  CHIP_ROW,
  CHIP_ROW_BLEED,
  Card,
  Chip,
  EmptyState,
  Icon,
  cx,
} from "~/components/ui";
import { centerInRow } from "~/lib/center-in-row";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { agreementStatusLabel, isAgreementStatus } from "~/lib/agreements";
import { contentHref, routes } from "~/lib/community";
import { nextCursorParams, readCursor } from "~/lib/cursor";
import { isNew, readLastSeen } from "~/lib/last-seen";
import { APP_NAME } from "~/lib/constants";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import type { ContentType } from "~/lib/database.types.helpers";
import {
  feedIdsByKind,
  isSupported,
  ownIds,
  pollCall,
  type OwnMarks,
} from "~/lib/feed-marks";
import { pluralize } from "~/lib/format";
import { logFailure } from "~/lib/log";
import { requestIdOf } from "~/lib/request-id";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { requireResident, supabase } from "~/lib/session";
import { useLocaleLoader } from "../layout";
import { shareOnWhatsApp } from "~/lib/share";
import {
  feedHref,
  isFeedKind,
  readFeedFilters,
  type FeedKind,
} from "~/lib/personalized-feed";

/* Nombre, plural, ícono y color de cada tipo viven en `content-kinds` (D123):
   esta tabla local repetía lo que la barra inferior y las secciones de
   comunidad tenían por su lado. */
const META = CONTENT_KINDS;

/** Las cuatro acciones de la comunidad principal, en el orden del formulario. */
const QUICK_ACTIONS: readonly {
  kind: ContentType;
  path: string;
  /** Nombre accesible: "Reclamo" solo no dice que se va a crear uno. */
  label: string;
}[] = [
  { kind: "claim", path: "reclamos/nuevo", label: "Nuevo reclamo" },
  { kind: "poll", path: "encuestas/nueva", label: "Nueva encuesta" },
  { kind: "debate", path: "debates/nuevo", label: "Nuevo debate" },
  { kind: "project", path: "proyectos/nuevo", label: "Nuevo proyecto" },
];

const KIND_TABS: readonly { key: FeedKind | null; label: string }[] = [
  { key: null, label: "Todas las publicaciones" },
  { key: "claim", label: "Reclamos" },
  { key: "poll", label: "Encuestas" },
  { key: "debate", label: "Debates" },
  { key: "project", label: "Proyectos" },
  { key: "agreement", label: "Acuerdos" },
];

/** Publicaciones por página del feed. */
const FEED_PAGE_SIZE = 24;

/** La página de un acuerdo vive fuera de la comunidad: `/acuerdos/[id]`. */
function feedItemHref(kind: FeedKind, id: string): string {
  return kind === "agreement" ? routes.agreement(id) : contentHref(kind, id);
}

export const usePersonalizedFeed = routeLoader$(async (ev) => {
  const viewer = await requireResident(ev);
  const db = supabase(ev);
  const cursor = readCursor(ev.url.searchParams);
  const { communityFilter, kindFilter } = readFeedFilters(
    ev.url.searchParams,
    viewer.residenceChain,
  );

  const { data, error } = await db.rpc("personalized_feed", {
    p_user: viewer.userId,
    p_limit: FEED_PAGE_SIZE,
    // La firma de seis argumentos es inequívoca para PostgREST. Los tipos
    // generados no expresan NULL en parámetros SQL, pero la RPC sí lo acepta.
    p_before_created: (cursor?.created_at ?? null) as string,
    p_before_id: (cursor?.id ?? null) as string,
    p_community_slug: communityFilter as string,
    p_kind: kindFilter as string,
  });
  if (error) {
    // El 500 es recuperable desde el navegador, pero sin rastro no se puede
    // diagnosticar: queda el alcance y el id de la petición, nada más.
    logFailure({ scope: "inicio/feed", requestId: requestIdOf(ev) }, error);
    throw ev.error(
      500,
      translate(
        resolveLocale(ev.locale()),
        "No pudimos cargar tu inicio personalizado.",
      ),
    );
  }
  // La RPC devuelve `kind` como texto. Un tipo que la interfaz no conoce no
  // debe tumbar la página: se deja afuera y queda en el log.
  const items = (data ?? []).flatMap((item) => {
    const { kind } = item;
    if (!isFeedKind(kind)) {
      logFailure(
        { scope: "inicio/tipo-desconocido", requestId: requestIdOf(ev) },
        { message: `kind ${kind}` },
      );
      return [];
    }
    // Un acuerdo con un estado que la interfaz no conoce tampoco se dibuja
    // a medias (D118).
    if (kind === "agreement" && !isAgreementStatus(item.status)) {
      logFailure(
        { scope: "inicio/estado-desconocido", requestId: requestIdOf(ev) },
        { message: `status ${item.status}` },
      );
      return [];
    }
    return [{ ...item, kind }];
  });

  // Marcas propias de la página (D117): el recibo no guarda la elección
  // (D68) y RLS sólo deja leer los de uno mismo. Si la lectura falla, la
  // página sigue en pie y las tarjetas no afirman nada.
  const { pollIds, claimIds } = feedIdsByKind(items);
  const [votedPollIds, supportedClaimIds] = await Promise.all([
    pollIds.length === 0
      ? []
      : ownIds(
          { scope: "inicio/recibos", requestId: requestIdOf(ev) },
          "poll_id",
          db
            .from("poll_participation_receipts")
            .select("poll_id")
            .eq("user_id", viewer.userId)
            .in("poll_id", pollIds),
        ),
    claimIds.length === 0
      ? []
      : ownIds(
          { scope: "inicio/apoyos", requestId: requestIdOf(ev) },
          "claim_id",
          db
            .from("claim_supports")
            .select("claim_id")
            .eq("user_id", viewer.userId)
            .in("claim_id", claimIds),
        ),
  ]);
  const marks: OwnMarks = { votedPollIds, supportedClaimIds };

  const { since } = readLastSeen(ev, !cursor);
  const localCommunity =
    viewer.residenceChain[viewer.residenceChain.length - 1] ?? null;
  const nextCursor = nextCursorParams(items, FEED_PAGE_SIZE);

  return {
    items,
    chain: viewer.residenceChain,
    localCommunity,
    communityFilter,
    kindFilter,
    hasFilters: !!communityFilter || !!kindFilter,
    latestHref: feedHref({ communityFilter, kindFilter }),
    nextHref: feedHref({ communityFilter, kindFilter }, nextCursor),
    since,
    nextCursor,
    marks,
  };
});

/**
 * Invitación por WhatsApp. Antes vivía dentro del bloque de la comunidad
 * principal y empujaba la primera publicación fuera de la pantalla del
 * teléfono; ahora va en la columna lateral o debajo de la lista.
 */
const InviteNeighbors = component$<{ name: string; slug: string }>(
  ({ name, slug }) => {
    const locale = useLocale();
    return (
      <Card class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-start">
        <div class="flex items-start gap-2.5">
          <Icon
            name="handshake"
            class="mt-0.5 size-6 shrink-0 text-brand"
            stroke={1.5}
          />
          <div>
            <h2 class="text-display-xs">
              {translate(locale, "¿Querés que tu zona tenga más peso?")}
            </h2>
            <p class="mt-1 text-xs text-ink-muted">
              {translate(
                locale,
                "Invitá a tus vecinos de {{name}} para votar y solucionar problemas juntos.",
                { name },
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick$={() => {
            // Mismo texto que la cabecera de la comunidad: traducido y
            // sin prometer que Agorbis resuelve reclamos.
            shareOnWhatsApp(
              translate(
                locale,
                "Sumate a {{name}} en Agorbis para votar encuestas, visibilizar reclamos y proponer proyectos: {{url}}",
                {
                  name,
                  url: `${window.location.origin}/c/${slug}`,
                },
              ),
            );
          }}
          class="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-success-700 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-success-800 active:scale-95"
        >
          <Icon name="chat" class="text-base" />
          <span>{translate(locale, "Invitar vecinos por WhatsApp")}</span>
        </button>
      </Card>
    );
  },
);

export default component$(() => {
  const data = usePersonalizedFeed();
  const locale = useLocale();
  const loc = useLocation();
  const { marks, localCommunity, communityFilter, kindFilter } = data.value;
  const filteredCommunity = communityFilter
    ? (data.value.chain.find((c) => c.slug === communityFilter) ?? null)
    : null;

  // Las filas de filtros se deslizan en el teléfono: el chip aplicado tiene
  // que quedar a la vista al llegar con el filtro puesto.
  const communityChips = useSignal<HTMLElement>();
  const kindChips = useSignal<HTMLElement>();
  // eslint-disable-next-line qwik/no-use-visible-task -- depende del ancho real de las filas
  useVisibleTask$(({ track }) => {
    track(() => communityFilter);
    track(() => kindFilter);
    centerInRow(communityChips.value, '[aria-current="page"]');
    centerInRow(kindChips.value, '[aria-current="page"]');
  });

  return (
    <div class="container-content py-6 sm:py-8">
      {/* El feed vive en 72 rem (D123): a pantalla completa las líneas del
          extracto pasaban los 70 caracteres y la barra lateral flotaba suelta. */}
      <div class="mx-auto max-w-6xl">
        {/* Cabecera compacta: el título y los chips de la cadena. El párrafo
            de bienvenida y la etiqueta "Filtrar:" empujaban la primera
            publicación a la segunda pantalla del teléfono (D117). */}
        <header class="mb-6">
          <p class="text-sm font-semibold text-brand">
            {translate(locale, "Tus comunidades")}
          </p>
          <h1 class="mt-1 text-display-lg sm:text-display-xl">
            {translate(locale, "Lo nuevo en tus comunidades")}
          </h1>

          {/* Un renglón que se desliza en el teléfono: envolviendo, las dos
              filas de filtros ocupaban seis renglones antes de la primera
              publicación. */}
          <nav
            ref={communityChips}
            aria-label={translate(locale, "Comunidades de tu cadena")}
            class={cx("mt-4", CHIP_ROW, CHIP_ROW_BLEED)}
          >
            <Chip
              href={feedHref({ communityFilter: null, kindFilter })}
              selected={!communityFilter}
            >
              {translate(locale, "Todas mis comunidades")}
            </Chip>
            {data.value.chain.map((community) => {
              const isSelected = communityFilter === community.slug;
              return (
                <Chip
                  key={community.id}
                  href={feedHref({
                    communityFilter: isSelected ? null : community.slug,
                    kindFilter,
                  })}
                  selected={isSelected}
                >
                  {/* El emoji de la comunidad es identidad elegida, no un
                      ícono de la interfaz: se queda (D123). */}
                  <span aria-hidden="true">{community.emoji}</span>
                  {community.name}
                </Chip>
              );
            })}
          </nav>
        </header>

        {/* Comunidad principal en una franja: nombre, panel y las cuatro
            acciones como chips. Las cuatro cajas blancas ocupaban un tercio
            de la pantalla con una palabra cada una (D123). */}
        {localCommunity && (
          <section
            aria-labelledby="comunidad-principal-titulo"
            class="mb-6 rounded-2xl border border-brand-500/25 bg-brand-50/50 p-4 dark:bg-brand-950/25"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-2xs font-semibold uppercase tracking-wider text-brand">
                  {translate(locale, "Tu comunidad principal")}
                </p>
                <h2
                  id="comunidad-principal-titulo"
                  class="truncate text-display-sm"
                >
                  {localCommunity.name}
                </h2>
              </div>
              <ButtonLink
                href={routes.community(localCommunity.slug)}
                variant="secondary"
                size="sm"
                class="shrink-0"
              >
                {translate(locale, "Ver panel")}
                <Icon name="arrow-right" />
              </ButtonLink>
            </div>
            {/* En el teléfono la barra inferior ya tiene el botón de
                publicar con los cuatro tipos; repetirlos acá era una fila
                más antes de la primera publicación (D123). */}
            <ul class="scrollbar-slim mt-4 hidden items-center gap-2 overflow-x-auto pb-1 sm:flex">
              {QUICK_ACTIONS.map((action) => (
                <li key={action.kind} class="shrink-0">
                  <Chip
                    variant="action"
                    href={routes.communityTab(localCommunity.slug, action.path)}
                    icon={META[action.kind].icon}
                    ariaLabel={translate(locale, action.label)}
                    toneClass={cx(
                      "bg-surface",
                      CONTENT_KIND_TONES[action.kind].text,
                      CONTENT_KIND_TONES[action.kind].border,
                      "hover:bg-muted",
                    )}
                  >
                    {translate(locale, META[action.kind].label)}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Filtros de tipo de contenido: el seleccionado toma el color del
            tipo, el mismo que lleva su badge y su acento en la tarjeta. */}
        <nav
          ref={kindChips}
          class={cx("mb-4", CHIP_ROW, CHIP_ROW_BLEED)}
          aria-label={translate(locale, "Tipos de contenido")}
        >
          {KIND_TABS.map((tab) => {
            const isActive = kindFilter === tab.key;
            return (
              <Chip
                key={tab.key ?? "all"}
                href={feedHref({ communityFilter, kindFilter: tab.key })}
                selected={isActive}
                icon={tab.key ? META[tab.key].icon : undefined}
                selectedClass={
                  tab.key ? CONTENT_KIND_TONES[tab.key].selected : undefined
                }
              >
                {translate(locale, tab.label)}
              </Chip>
            );
          })}
        </nav>

        {/* El chip cambiaba de color y la lista filtrada quedaba fuera de la
            pantalla: esta línea dice qué se está mostrando (D117). La región
            viva está siempre en el DOM, porque una que aparece ya con texto
            no se anuncia de forma fiable; el enlace va afuera para que no se
            lea como parte del anuncio. */}
        <div
          class={cx(
            "mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted px-3 py-2 text-sm text-ink-muted",
            !data.value.hasFilters && "hidden",
          )}
        >
          <p role="status" aria-live="polite">
            {data.value.hasFilters &&
              (kindFilter && filteredCommunity
                ? translate(locale, "Mostrando {{kind}} de {{community}}", {
                    kind: translate(locale, META[kindFilter].plural),
                    community: filteredCommunity.name,
                  })
                : kindFilter
                  ? translate(
                      locale,
                      "Mostrando {{kind}} de todas tus comunidades",
                      { kind: translate(locale, META[kindFilter].plural) },
                    )
                  : translate(
                      locale,
                      "Mostrando todas las publicaciones de {{community}}",
                      { community: filteredCommunity?.name ?? "" },
                    ))}
          </p>
          {data.value.hasFilters && (
            <Link
              href="/inicio"
              class="inline-flex min-h-9 items-center font-medium text-brand hover:underline"
            >
              {translate(locale, "Quitar filtros")}
            </Link>
          )}
        </div>

        {data.value.items.length === 0 ? (
          <div class="space-y-4">
            {loc.url.searchParams.has("antes") ? (
              <EmptyState
                illustration="empty"
                title="No hay nada más atrás"
                description="Llegaste al final de lo publicado en tus comunidades."
              >
                <ButtonLink href={data.value.latestHref} variant="secondary">
                  {translate(locale, "Volver a lo último")}
                </ButtonLink>
              </EmptyState>
            ) : data.value.hasFilters ? (
              <EmptyState
                illustration="search"
                title="No hay publicaciones con estos filtros"
                description="Probá otra comunidad o tipo de publicación para ver más actividad."
              >
                <ButtonLink href="/inicio" variant="secondary">
                  {translate(locale, "Limpiar filtros")}
                </ButtonLink>
              </EmptyState>
            ) : (
              // Con Producción recién abierta, éste es el estado más común:
              // mandar a explorar otras comunidades no ayudaba a que la
              // propia arranque.
              <EmptyState
                illustration="sprout"
                title="Todavía no hay publicaciones en tus comunidades"
                description="Lo que se publique en cualquiera de ellas va a aparecer acá. La primera conversación puede ser tuya."
              >
                {localCommunity ? (
                  <>
                    <ButtonLink
                      href={routes.communityTab(
                        localCommunity.slug,
                        "encuestas/nueva",
                      )}
                    >
                      {translate(locale, "Crear una encuesta en {{name}}", {
                        name: localCommunity.name,
                      })}
                    </ButtonLink>
                    <ButtonLink
                      href={routes.communityTab(
                        localCommunity.slug,
                        "reclamos/nuevo",
                      )}
                      variant="secondary"
                    >
                      {translate(locale, "Hacer un reclamo")}
                    </ButtonLink>
                  </>
                ) : (
                  <ButtonLink href="/explorar">
                    {translate(locale, "Explorar comunidades")}
                  </ButtonLink>
                )}
              </EmptyState>
            )}
            {localCommunity && (
              <div class="mx-auto max-w-2xl">
                <InviteNeighbors
                  name={localCommunity.name}
                  slug={localCommunity.slug}
                />
              </div>
            )}
          </div>
        ) : (
          <div class="grid gap-6 lg:grid-cols-[1fr_18rem]">
            {/* Una sola columna de tarjetas: con dos, cada una quedaba ancha
                y con pocas palabras (D123). */}
            <ol class="grid gap-4">
              {data.value.items.map((item) => {
                const { kind } = item;
                const meta = META[kind];
                const tones = CONTENT_KIND_TONES[kind];
                // El estado de un acuerdo lo deriva la base al leer (D118);
                // uno que la interfaz no conoce no se muestra como nada.
                const agreementStatus =
                  kind === "agreement" && isAgreementStatus(item.status)
                    ? item.status
                    : null;
                const call =
                  kind === "poll"
                    ? pollCall(item.status, item.id, marks)
                    : null;
                const supported =
                  kind === "claim" && isSupported(item.id, marks);
                // Participación: durante la ronda el feed no entrega conteos
                // (D68); cerrada, cero significa menos de cinco.
                const engagement =
                  kind === "poll" && Number(item.engagement) < 5
                    ? translate(
                        locale,
                        item.status === "closed"
                          ? "Sin resultados por baja participación"
                          : "Resultados al cierre",
                      )
                    : pluralize(
                        Number(item.engagement),
                        meta.engagement[0],
                        meta.engagement[1],
                        locale,
                      );
                // Un solo estado por tarjeta: antes el tipo, la píldora de
                // "Encuesta abierta", el llamado y los resultados eran cuatro
                // señales de lo mismo (D123).
                const status =
                  call === "closed"
                    ? { tone: "neutral" as const, label: "Cerrada" }
                    : call !== null
                      ? { tone: "poll" as const, label: "Encuesta abierta" }
                      : kind === "claim" && item.status === "resolved"
                        ? { tone: "success" as const, label: "Resuelto" }
                        : kind === "claim" && item.status === "in_progress"
                          ? { tone: "brand" as const, label: "En ejecución" }
                          : kind === "project" && item.status === "completed"
                            ? { tone: "success" as const, label: "Completado" }
                            : null;
                return (
                  <li key={`${kind}-${item.id}`}>
                    <Link
                      href={feedItemHref(kind, item.id)}
                      class="group block rounded-2xl"
                    >
                      <Card interactive accent={tones.accent} class="p-5">
                        {/* Meta en una línea: tipo con su color, comunidad
                            y fecha. */}
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-faint">
                          <Chip
                            variant="badge"
                            icon={meta.icon}
                            toneClass={tones.badge}
                          >
                            {translate(locale, meta.label)}
                          </Chip>
                          <span class="truncate">
                            <span aria-hidden="true">
                              {item.community_emoji}
                            </span>{" "}
                            {item.community_name}
                          </span>
                          {isNew(item.created_at, data.value.since) && (
                            <Badge tone="brand">
                              {translate(locale, "Nuevo")}
                            </Badge>
                          )}
                          <RelativeTime
                            value={item.created_at}
                            class="ml-auto tabular-nums"
                          />
                        </div>

                        <h2
                          dir="auto"
                          class="mt-3 text-display-sm group-hover:text-brand"
                        >
                          {item.title}
                        </h2>
                        {item.summary && (
                          <p
                            dir="auto"
                            class="ugc-text mt-2 line-clamp-2 text-base text-ink-muted"
                          >
                            {item.summary}
                          </p>
                        )}

                        {/* Un solo pie: estado y marcas propias a la
                            izquierda, participación o llamado a la derecha.
                            Las marcas salen del recibo y del apoyo de la
                            persona, nunca de su elección (D117). */}
                        <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-subtle pt-3 text-xs">
                          {status &&
                            (status.tone === "poll" ? (
                              <Chip variant="badge" toneClass={tones.badge}>
                                {translate(locale, status.label)}
                              </Chip>
                            ) : (
                              <Badge tone={status.tone}>
                                {translate(locale, status.label)}
                              </Badge>
                            ))}
                          {agreementStatus && (
                            <Badge
                              tone={
                                agreementStatus === "approved"
                                  ? "success"
                                  : agreementStatus === "voting"
                                    ? "brand"
                                    : agreementStatus === "rejected"
                                      ? "danger"
                                      : "neutral"
                              }
                            >
                              {agreementStatusLabel(
                                locale,
                                agreementStatus,
                                null,
                              )}
                            </Badge>
                          )}
                          {call === "voted" && (
                            <Badge tone="success">
                              <Icon name="check" />
                              {translate(locale, "Ya votaste")}
                            </Badge>
                          )}
                          {supported && (
                            <Badge tone="success">
                              <Icon name="check" />
                              {translate(locale, "Apoyaste")}
                            </Badge>
                          )}
                          <span
                            class={cx(
                              "ml-auto inline-flex items-center gap-1 font-semibold",
                              tones.text,
                            )}
                          >
                            {call !== null
                              ? translate(
                                  locale,
                                  // Sólo invita a participar a quien se sabe
                                  // que no votó. Cerrada, votada o sin
                                  // lectura: ver.
                                  call === "open"
                                    ? "Participar del voto"
                                    : "Ver encuesta",
                                )
                              : engagement}
                            {call !== null && <Icon name="arrow-right" />}
                          </span>
                        </div>
                        {/* Encuesta: la participación va aparte del llamado,
                            para no perder "Resultados al cierre" (D68). */}
                        {call !== null && (
                          <p class="mt-2 text-xs text-ink-faint">
                            {engagement}
                          </p>
                        )}
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ol>
            <aside class="space-y-4 lg:sticky lg:top-24 lg:self-start">
              {localCommunity && (
                <InviteNeighbors
                  name={localCommunity.name}
                  slug={localCommunity.slug}
                />
              )}
              <Card class="p-5">
                <h2 class="text-display-xs">
                  {translate(locale, "¿Falta tu localidad o barrio?")}
                </h2>
                <p class="mt-1 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Pedí incorporar tu ciudad o barrio para sumar a tus vecinos.",
                  )}
                </p>
                <ButtonLink
                  href="/comunidades/solicitar"
                  variant="secondary"
                  size="sm"
                  class="mt-4"
                >
                  {translate(locale, "Solicitar comunidad")}
                </ButtonLink>
              </Card>
              <Card class="p-5">
                <h2 class="text-display-xs">
                  {translate(locale, "¿Representás una institución?")}
                </h2>
                <p class="mt-1 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Verificá tu representación para responder reclamos de los vecinos.",
                  )}
                </p>
                <ButtonLink
                  href="/instituciones/solicitar"
                  variant="secondary"
                  size="sm"
                  class="mt-4"
                >
                  {translate(locale, "Solicitar verificación")}
                </ButtonLink>
              </Card>
            </aside>
          </div>
        )}

        {(data.value.nextCursor || loc.url.searchParams.has("antes")) && (
          <nav
            aria-label={translate(locale, "Paginación")}
            class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium"
          >
            {loc.url.searchParams.has("antes") && (
              <Link
                href={data.value.latestHref}
                class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
              >
                {translate(locale, "← Volver a lo último")}
              </Link>
            )}
            {data.value.nextCursor && (
              <Link
                href={data.value.nextHref}
                class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
              >
                {translate(locale, "Ver publicaciones más antiguas")} →
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Mi inicio")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
