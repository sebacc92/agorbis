import { component$, useSignal } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  useLocation,
  type DocumentHead,
} from "@qwik.dev/router";
import { Badge, Card, Chip, Icon } from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { WeeklyDigestModal } from "~/components/community/WeeklyDigestModal";
import { CivicSummaryCardModal } from "~/components/community/CivicSummaryCardModal";
import { NewNeighborWelcomeModal } from "~/components/community/NewNeighborWelcomeModal";
import { QuickVoteWidget } from "~/components/community/QuickVoteWidget";
import { MilestoneCarousel } from "~/components/community/MilestoneCarousel";
import { CommunityPressKitCard } from "~/components/community/CommunityPressKitCard";
import { APP_NAME, INFO_CATEGORIES } from "~/lib/constants";
import { publicationEntryHref } from "~/lib/publication-entry";
import { communitySlugFromRoute, routes } from "~/lib/community";
import { OPEN_CLAIM_STATUSES } from "~/lib/claim-stats";
import { communityCount } from "~/lib/community-counts";
import { sumCommunityCounts } from "~/lib/community-counts";
import {
  ancestorIds,
  CHAIN_POLLS_LIMIT,
  isConfirmedEmpty,
  labelChainPolls,
  type ChainPoll,
} from "~/lib/chain-polls";
import type { InfoCategory, Tables } from "~/lib/database.types.helpers";
import { formatDate, formatNumber } from "~/lib/format";
import { isMunicipalLevel } from "~/lib/community-sections";
import { orFallback, single } from "~/lib/query";
import { residenceHint } from "~/lib/residence-hint";
import { supabase } from "~/lib/session";
import { useCommunity } from "./layout";
import { useLocale, translate, canonicalHref } from "~/lib/i18n";
import {
  SOCIAL_IMAGE_PATH,
  communityShareDescription,
  communityShareMeta,
} from "~/lib/social-meta";
import { useLocaleLoader } from "../../layout";
import { safeHttpUrl } from "~/lib/url";

const CATEGORY_STYLES: Record<
  InfoCategory,
  {
    tone: "neutral" | "brand" | "success" | "warn" | "danger";
    borderAccent: string;
    textAccent: string;
    badgeBg: string;
  }
> = {
  historia: {
    tone: "warn",
    borderAccent: "hover:border-amber-500/60",
    textAccent: "text-amber-700 dark:text-amber-300",
    badgeBg:
      "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  },
  geografia: {
    tone: "success",
    borderAccent: "hover:border-success-500/60",
    textAccent: "text-success-700 dark:text-success-300",
    badgeBg:
      "bg-success-100 text-success-900 dark:bg-success-950/60 dark:text-success-200",
  },
  cultura: {
    tone: "brand",
    borderAccent: "hover:border-purple-500/60",
    textAccent: "text-purple-700 dark:text-purple-300",
    badgeBg:
      "bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-200",
  },
  economia: {
    tone: "neutral",
    borderAccent: "hover:border-sky-500/60",
    textAccent: "text-sky-700 dark:text-sky-300",
    badgeBg: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  },
  gastronomia: {
    tone: "warn",
    borderAccent: "hover:border-orange-500/60",
    textAccent: "text-orange-700 dark:text-orange-300",
    badgeBg:
      "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200",
  },
  simbolo: {
    tone: "neutral",
    borderAccent: "hover:border-indigo-500/60",
    textAccent: "text-indigo-700 dark:text-indigo-300",
    badgeBg:
      "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200",
  },
  dato_curioso: {
    tone: "warn",
    borderAccent: "hover:border-yellow-500/60",
    textAccent: "text-yellow-700 dark:text-yellow-300",
    badgeBg:
      "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/60 dark:text-yellow-200",
  },
};

/**
 * Primeras publicaciones de una comunidad vacía, con el texto del selector. El
 * destino lo decide `publicationEntryHref` según la persona: así el llamado
 * llega en vez de redirigir a mitad del dibujo (D115).
 */
const START_ACTIONS = [
  {
    path: "encuestas/nueva",
    type: "poll",
    label: "Crear la primera encuesta",
    description: "Consultá las prioridades de tu comunidad.",
  },
  {
    path: "debates/nuevo",
    type: "debate",
    label: "Abrir el primer debate",
    description: "Abrí una conversación para intercambiar ideas.",
  },
  {
    path: "reclamos/nuevo",
    type: "claim",
    label: "Hacer el primer reclamo",
    description: "Hacé visible un problema y reuní apoyo.",
  },
  {
    path: "proyectos/nuevo",
    type: "project",
    label: "Proponer el primer proyecto",
    description: "Proponé un plan con etapas y recursos.",
  },
] as const;

export const useInfo = routeLoader$(async (ev) => {
  const db = supabase(ev);

  const community = await single(
    ev,
    "c-c/community",
    db
      .from("communities")
      .select("id")
      .eq("slug", communitySlugFromRoute(ev.params, ev.url))
      .maybeSingle(),
  );

  if (!community)
    return {
      entries: [] as Omit<Tables<"community_info">, "updated_by">[],
      openClaims: null as number | null,
    };

  const [info, open] = await Promise.all([
    db
      .from("community_info")
      .select(
        "id, community_id, category, title, content, image_url, updated_at",
      )
      .eq("community_id", community.id),
    db
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id)
      .in("status", [...OPEN_CLAIM_STATUSES]),
  ]);

  return { entries: info.data ?? [], openClaims: communityCount(open) };
});

export const useActivePoll = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const community = await single(
    ev,
    "c-quick-poll/community",
    db
      .from("communities")
      .select("id")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community) return null;

  const { data: poll } = await db
    .from("polls")
    .select(
      "id, question, options:poll_options(label, sort_order), status, closes_at, created_at",
    )
    .eq("community_id", community.id)
    .eq("status", "active")
    // Una ronda de acuerdo (D118) vive en su propia página, no como destacada.
    .is("agreement_id", null)
    .gt("closes_at", new Date().toISOString())
    .order("sort_order", { referencedTable: "options", ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return poll;
});

/**
 * Encuestas activas de los ancestros: lo que una residente también vota
 * desde acá (D116). Nacieron para la comunidad vacía; desde la décima ronda
 * reemplazan al pie "Continuá explorando", que repetía las pestañas. Si la
 * lectura falla se ofrece nada y el fallo queda en el log: la página sigue
 * útil y "sin encuestas" no se confunde con "roto".
 */
export const useChainPolls = routeLoader$(async (ev): Promise<ChainPoll[]> => {
  const ctx = await ev.resolveValue(useCommunity);
  const ancestors = ancestorIds(ctx.chain, ctx.community.id);
  if (ancestors.length === 0) return [];

  // Una encuesta sin cierre sigue abierta (lo permite la base), así que
  // también cuenta; va al final porque no apura a nadie.
  const now = new Date().toISOString();
  const rows = await orFallback(
    "c/encuestas-cadena",
    supabase(ev)
      .from("polls")
      .select("id, question, closes_at, community_id")
      .in("community_id", ancestors)
      .eq("status", "active")
      .is("agreement_id", null)
      .or(`closes_at.is.null,closes_at.gt.${now}`)
      .order("closes_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(CHAIN_POLLS_LIMIT),
    [],
  );

  return labelChainPolls(rows, ctx.chain);
});

/** Encuestas de la cadena, enlazadas y sin conteos (D68): la misma lista en la
 *  comunidad vacía y debajo del contenido en la que ya tiene publicaciones. */
const ChainPollsList = component$<{ polls: ChainPoll[] }>(({ polls }) => {
  const locale = useLocale();
  return (
    <ul class="mt-3 space-y-2">
      {polls.map((poll) => (
        <li key={poll.id}>
          {/* Misma anatomía que las tarjetas del feed (D125): el emoji es la
              identidad de la comunidad, el reloj marca el cierre y el chevron
              dice que se abre. Sin conteos (D68). */}
          <Link
            href={routes.poll(poll.id)}
            class="group flex min-h-14 items-center gap-3 rounded-2xl border border-subtle bg-surface px-4 py-3 transition-[border-color,box-shadow,translate] hover:-translate-y-0.5 hover:border-strong hover:shadow-lift motion-reduce:hover:translate-none"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-xl border border-subtle bg-surface text-lg"
              aria-hidden="true"
            >
              {poll.communityEmoji ?? "🗳️"}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-display text-sm font-semibold text-ink-strong">
                {poll.question}
              </span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
                <span>{poll.communityName}</span>
                {poll.closes_at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Icon name="clock" class="text-[1.1em]" />
                    <span>
                      {translate(locale, "Cierra el {{date}}", {
                        date: formatDate(poll.closes_at, locale),
                      })}
                    </span>
                  </>
                )}
              </span>
            </span>
            <Icon
              name="chevron-right"
              class="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
});

export const InfoCardItem = component$<{
  meta: (typeof INFO_CATEGORIES)[number];
  entry: Omit<Tables<"community_info">, "updated_by">;
}>(({ meta, entry }) => {
  const locale = useLocale();
  const expanded = useSignal(false);
  const style = CATEGORY_STYLES[meta.key] ?? CATEGORY_STYLES.historia;

  const content = entry.content.trim();
  const imageUrl = safeHttpUrl(entry.image_url);
  const periodIndex = content.indexOf(". ");
  const hasMultipleSentences =
    periodIndex > 25 && periodIndex < content.length - 20;
  const lead = hasMultipleSentences
    ? content.slice(0, periodIndex + 1)
    : content;
  const body = hasMultipleSentences ? content.slice(periodIndex + 2) : "";

  return (
    <Card
      interactive
      class={`group flex flex-col overflow-hidden ${style.borderAccent}`}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          width={800}
          height={400}
          loading="lazy"
          decoding="async"
          class="h-44 w-full object-cover"
        />
      )}
      <div class="flex flex-1 flex-col p-5 sm:p-6">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span
              class={`flex size-8 items-center justify-center rounded-xl text-base ${style.badgeBg}`}
              aria-hidden="true"
            >
              <Icon name={meta.icon} />
            </span>
            <span
              class={`text-xs font-bold uppercase tracking-wider ${style.textAccent}`}
            >
              {translate(locale, meta.label)}
            </span>
          </div>
          <span class="text-2xs text-ink-faint">
            {translate(locale, meta.hint)}
          </span>
        </div>

        <h3 class="mt-3 text-lg font-semibold tracking-tight text-ink-strong transition-colors group-hover:text-brand-600">
          {entry.title}
        </h3>

        {/* Lead sentence */}
        <p class="mt-2 text-sm font-medium leading-relaxed text-ink-strong">
          {lead}
        </p>

        {/* Expandable rest of text to prevent visual text overload */}
        {body && (
          <div class="mt-2">
            <p
              id={`info-body-${entry.id}`}
              hidden={!expanded.value}
              class="mt-1 text-sm leading-relaxed text-ink-muted"
            >
              {body}
            </p>
            <button
              type="button"
              aria-expanded={expanded.value}
              aria-controls={`info-body-${entry.id}`}
              onClick$={() => (expanded.value = !expanded.value)}
              class="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-xl px-2 text-sm font-semibold text-brand transition-colors hover:bg-muted hover:underline"
            >
              {expanded.value
                ? translate(locale, "Leer menos")
                : translate(locale, "Leer más")}
              {/* Chevron propio en vez de "↓"/"↑" tipográficos (D125). */}
              <Icon
                name="chevron-down"
                class={`text-sm transition-transform ${expanded.value ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        )}
        {/* La fecha de actualización salió de cada ficha: repetida siete
            veces no decía nada; va una sola vez al pie de la sección (D125). */}
      </div>
    </Card>
  );
});

export default component$(() => {
  const info = useInfo();
  const activePoll = useActivePoll();
  const chainPolls = useChainPolls();
  const currentPoll = activePoll.value;
  const ctx = useCommunity();
  const locale = useLocale();
  const location = useLocation();
  const selectedCategory = useSignal<string>("all");

  const byCategory = new Map<
    InfoCategory,
    Omit<Tables<"community_info">, "updated_by">
  >(info.value.entries.map((e) => [e.category as InfoCategory, e]));

  const cards = INFO_CATEGORIES.map((meta) => ({
    meta,
    entry: byCategory.get(meta.key),
  })).filter((c) => c.entry);

  const filteredCards =
    selectedCategory.value === "all"
      ? cards
      : cards.filter((c) => c.meta.key === selectedCategory.value);
  // La más reciente: una sola fecha al pie dice hasta cuándo está al día la
  // sección, sin repetirla en cada ficha (D125).
  const latestInfoUpdate = cards.reduce<string | null>((latest, card) => {
    const updated = card.entry?.updated_at ?? null;
    return !latest || (updated && updated > latest) ? updated : latest;
  }, null);

  const activeClaimsCount = info.value.openClaims ?? null;
  const totalParticipationCount = sumCommunityCounts(
    ctx.value.counts.polls,
    ctx.value.counts.debates,
    ctx.value.counts.projects,
  );
  const isEmptyCommunity = isConfirmedEmpty(ctx.value.counts);
  const hint = residenceHint(ctx.value);
  const municipal = isMunicipalLevel(ctx.value.community.level);
  const displayCount = (count: number | null) =>
    count === null
      ? translate(locale, "No disponible")
      : formatNumber(count, locale);

  return (
    <div class="py-2 space-y-8">
      {/* Lo primero es una publicación para votar, no los contadores: a 390 px
          el balance y los llamados empujaban la primera encuesta a 1.350 px
          (décima ronda, mejora 1). */}
      {!isEmptyCommunity && currentPoll && (
        <QuickVoteWidget poll={currentPoll} />
      )}

      {isEmptyCommunity ? (
        // Una comunidad sin publicaciones abría con cuatro contadores en cero
        // y la guía escondida: lo primero que veía quien llegaba era que no
        // pasaba nada, y no qué podía hacer.
        <section
          aria-labelledby="empezar-titulo"
          class="rounded-3xl border border-brand-500/30 bg-brand-50/40 p-6 shadow-xs sm:p-7 dark:bg-brand-950/20"
        >
          <h2 id="empezar-titulo" class="text-display-sm sm:text-display-md">
            {translate(locale, "{{name}} todavía no tiene publicaciones", {
              name: ctx.value.community.name,
            })}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {/* Un pedido por situación, decidido por `residenceHint`: a quien
                no eligió dónde vive no se le pide "revisar" una residencia que
                no existe, y con el perfil ilegible no se afirma nada (D116). */}
            {hint === "member"
              ? translate(
                  locale,
                  "Podés abrir la primera conversación de tu comunidad.",
                )
              : hint === "signin"
                ? translate(
                    locale,
                    "Quienes viven en {{name}} pueden abrir la primera conversación. Si vivís acá, ingresá para publicar.",
                    { name: ctx.value.community.name },
                  )
                : hint === "unknown"
                  ? translate(
                      locale,
                      "Quienes viven en {{name}} pueden abrir la primera conversación. No pudimos leer tu residencia: recargá la página.",
                      { name: ctx.value.community.name },
                    )
                  : hint === "choose"
                    ? translate(
                        locale,
                        "Quienes viven en {{name}} pueden abrir la primera conversación. Si vivís acá, elegí tu residencia para publicar.",
                        { name: ctx.value.community.name },
                      )
                    : translate(
                        locale,
                        "Quienes viven en {{name}} pueden abrir la primera conversación. Si vivís acá, revisá tu residencia para publicar.",
                        { name: ctx.value.community.name },
                      )}
          </p>
          <nav
            aria-label={translate(
              locale,
              "Acciones principales de la comunidad",
            )}
            class="mt-5 grid gap-2 sm:grid-cols-2"
          >
            {START_ACTIONS.map((action) => (
              <Link
                key={action.path}
                href={publicationEntryHref({
                  communitySlug: ctx.value.community.slug,
                  type: action.type,
                  isAuthenticated: ctx.value.isAuthenticated,
                  hasResidence: ctx.value.hasResidence,
                  isMember: ctx.value.isMember,
                })}
                class="flex min-h-16 items-center gap-3 rounded-2xl border border-subtle bg-surface px-4 py-3 transition-colors hover:border-brand-500"
              >
                {/* Ícono de trazo con el color del tipo (D123). */}
                <span
                  class={`grid size-10 shrink-0 place-items-center rounded-xl text-xl ${CONTENT_KIND_TONES[action.type].bg} ${CONTENT_KIND_TONES[action.type].text}`}
                  aria-hidden="true"
                >
                  <Icon name={CONTENT_KINDS[action.type].icon} />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-ink-strong">
                    {translate(locale, action.label)}
                  </span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {translate(locale, action.description)}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
          {chainPolls.value.length > 0 && (
            <section
              aria-labelledby="encuestas-cadena-titulo"
              class="mt-6 border-t border-brand-500/20 pt-5"
            >
              <h3
                id="encuestas-cadena-titulo"
                class="text-base font-semibold text-ink-strong"
              >
                {/* Prometer el voto sólo a quien puede darlo: la cabecera le
                    acaba de decir a quien no es miembro que acá no vota. */}
                {translate(
                  locale,
                  "Encuestas abiertas en las comunidades que la contienen",
                )}
              </h3>
              <p class="mt-1 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Quien vive en {{name}} también vota en las comunidades que la contienen.",
                  { name: ctx.value.community.name },
                )}
              </p>
              <ChainPollsList polls={chainPolls.value} />
            </section>
          )}
          {ctx.value.childCount !== null && ctx.value.childCount > 0 && (
            <p class="mt-4 text-sm">
              <Link
                href={routes.community(ctx.value.community.slug) + "/sub"}
                class="font-medium text-brand hover:underline"
              >
                {translate(
                  locale,
                  "Ver sus {{count}} divisiones y localidades",
                  {
                    count: formatNumber(ctx.value.childCount, locale),
                  },
                )}{" "}
                <span aria-hidden="true">→</span>
              </Link>
            </p>
          )}
        </section>
      ) : (
        <div class="rounded-3xl border border-subtle bg-surface p-4 sm:p-5">
          <div class="border-b border-subtle/80 pb-3">
            {/* Sin insignia de "impacto" ni "poder medible": con dos
                residentes y cero victorias sonaba a folleto. El título
                dice lo que es: los números de hoy (décima ronda, mejora 2). */}
            <h2 class="text-display-sm sm:text-display-md">
              {translate(locale, "Lo que pasa en {{name}}", {
                name: ctx.value.community.name,
              })}
            </h2>
            <p class="text-xs text-ink-muted sm:text-sm">
              {translate(
                locale,
                "Personas, reclamos y participación, con los números de hoy.",
              )}
            </p>
          </div>

          {/* Una sola anatomía por tile (D123): ícono y etiqueta arriba,
              número grande, nota chica. El vacío se dice en palabras y en
              gris: en verde grande parecía un valor que celebrar. El enlace
              "Ver todos los reclamos" vivía en el título y hablaba de una
              sola de las cuatro; ahora es el pie de "En curso". */}
          <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="rounded-2xl border border-subtle bg-surface p-4">
              <div class="flex items-center gap-2 text-ink-muted">
                <Icon name="users" class="text-base" />
                <span class="text-xs font-semibold uppercase tracking-wider">
                  {translate(locale, "Vecinos")}
                </span>
              </div>
              <p class="mt-2 font-display text-display-md tabular-nums text-ink-strong">
                {formatNumber(ctx.value.community.member_count, locale)}
              </p>
              <p class="mt-1 text-xs text-ink-muted">
                {translate(locale, "viven acá o en sus localidades")}
              </p>
            </div>

            <Link
              href={`/c/${ctx.value.community.slug}/reclamos?estado=resueltos`}
              class="group block rounded-2xl border border-subtle bg-surface p-4 transition-[border-color,box-shadow,translate] hover:-translate-y-0.5 hover:border-strong hover:shadow-lift motion-reduce:hover:translate-none"
            >
              <div class="flex items-center gap-2 text-success">
                <Icon name="trophy" class="text-base" />
                <span class="text-xs font-semibold uppercase tracking-wider">
                  {translate(locale, "Victorias")}
                </span>
              </div>
              {ctx.value.counts.resolvedClaims === 0 ? (
                <p class="mt-2 text-sm text-ink-muted">
                  {translate(locale, "Todavía ninguno")}
                </p>
              ) : (
                <p class="mt-2 font-display text-display-md tabular-nums text-ink-strong">
                  {displayCount(ctx.value.counts.resolvedClaims)}
                </p>
              )}
              <p class="mt-1 text-xs text-ink-muted">
                {translate(locale, "reclamos resueltos")}
              </p>
            </Link>

            <Link
              href={`/c/${ctx.value.community.slug}/reclamos?estado=abiertos`}
              class="group block rounded-2xl border border-subtle bg-surface p-4 transition-[border-color,box-shadow,translate] hover:-translate-y-0.5 hover:border-strong hover:shadow-lift motion-reduce:hover:translate-none"
            >
              <div class="flex items-center gap-2 text-kind-claim-text">
                <Icon name="megaphone" class="text-base" />
                <span class="text-xs font-semibold uppercase tracking-wider">
                  {translate(locale, "En curso")}
                </span>
              </div>
              {activeClaimsCount === 0 ? (
                <p class="mt-2 text-sm text-ink-muted">
                  {translate(locale, "Todavía ninguno")}
                </p>
              ) : (
                <p class="mt-2 font-display text-display-md tabular-nums text-ink-strong">
                  {displayCount(activeClaimsCount)}
                </p>
              )}
              <p class="mt-1 text-xs text-ink-muted">
                {translate(locale, "reclamos abiertos o escalando")}
              </p>
              <p class="mt-2 text-xs font-semibold text-brand group-hover:underline">
                {translate(locale, "Ver todos los reclamos")}
              </p>
            </Link>

            <div class="rounded-2xl border border-subtle bg-surface p-4">
              <div class="flex items-center gap-2 text-ink-muted">
                <Icon name="sparkles" class="text-base" />
                <span class="text-xs font-semibold uppercase tracking-wider">
                  {translate(locale, "Acciones")}
                </span>
              </div>
              <p class="mt-2 font-display text-display-md tabular-nums text-ink-strong">
                {displayCount(totalParticipationCount)}
              </p>
              <p class="mt-1 text-xs text-ink-muted">
                {translate(locale, "encuestas, debates y proyectos")}
              </p>
            </div>
          </div>

          {/* Acciones directas: el mismo chip de toda la interfaz, con el
              ícono y el color de cada tipo (D123). El `aria-label` del nav
              ya dice qué son; la etiqueta "Acción directa:" repetía. */}
          <nav
            aria-label={translate(
              locale,
              "Acciones principales de la comunidad",
            )}
            class="scrollbar-slim mt-4 flex snap-x items-center gap-2 overflow-x-auto border-t border-subtle/80 pt-4 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
          >
            {/* En teléfono los cuatro chips se apilaban en cuatro líneas:
                ahora corren en un carril con snap y no se achican (D125). */}
            <Chip
              variant="action"
              class="shrink-0 snap-start"
              href={`/c/${ctx.value.community.slug}/reclamos/nuevo`}
              icon={CONTENT_KINDS.claim.icon}
              toneClass={CONTENT_KIND_TONES.claim.badge}
            >
              {translate(locale, "Hacer un reclamo")}
            </Chip>
            <Chip
              variant="action"
              class="shrink-0 snap-start"
              href={`/c/${ctx.value.community.slug}/encuestas`}
              icon={CONTENT_KINDS.poll.icon}
              toneClass={CONTENT_KIND_TONES.poll.badge}
            >
              {translate(locale, "Votar encuestas")}
            </Chip>
            <Chip
              variant="action"
              class="shrink-0 snap-start"
              href={`/c/${ctx.value.community.slug}/debates`}
              icon={CONTENT_KINDS.debate.icon}
              toneClass={CONTENT_KIND_TONES.debate.badge}
            >
              {translate(locale, "Debatir propuestas")}
            </Chip>
            <Chip
              variant="action"
              class="shrink-0 snap-start"
              href={`/c/${ctx.value.community.slug}/proyectos`}
              icon={CONTENT_KINDS.project.icon}
              toneClass={CONTENT_KIND_TONES.project.badge}
            >
              {translate(locale, "Proyectos")}
            </Chip>
          </nav>
        </div>
      )}

      {/* 2. Sección Descubrimiento (Fichas culturales/históricas). Sin fichas
          no se muestra nada: el aviso decía que estaban "en redacción", y
          nadie las estaba escribiendo. */}
      {cards.length > 0 && (
        <section aria-labelledby="info-titulo" class="py-2">
          {/* Header with Title & Intro */}
          <div class="flex flex-wrap items-end justify-between gap-4 border-b border-subtle pb-5">
            <div>
              <div class="mb-1 inline-flex items-center gap-2">
                <Badge tone="brand">
                  {translate(locale, "Descubrimiento")}
                </Badge>
              </div>
              <h2 id="info-titulo" class="text-display-md sm:text-display-lg">
                {translate(locale, "Lo esencial de {{name}}", {
                  name: ctx.value.community.name,
                })}
              </h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Una ficha por tema. Sólo lo importante, sin enciclopedismo.",
                )}
              </p>
            </div>
          </div>

          {/* Filtros por tema con el mismo Chip del resto (D125): eran
              píldoras propias con el violeta de marca y otra altura. */}
          <div class="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-slim">
            <Chip
              selected={selectedCategory.value === "all"}
              onClick$={() => (selectedCategory.value = "all")}
              class="shrink-0"
            >
              <span>{translate(locale, "Todos los temas")}</span>
              <span
                class={`rounded-full px-1.5 py-0.5 text-3xs tabular-nums ${
                  selectedCategory.value === "all"
                    ? "bg-white/20 text-white"
                    : "bg-inset text-ink-muted"
                }`}
              >
                {cards.length}
              </span>
            </Chip>
            {cards.map(({ meta }) => (
              <Chip
                key={meta.key}
                icon={meta.icon}
                selected={selectedCategory.value === meta.key}
                onClick$={() => (selectedCategory.value = meta.key)}
                class="shrink-0"
              >
                {translate(locale, meta.label)}
              </Chip>
            ))}
          </div>

          {/* Info Cards Grid */}
          {/* `auto-fill` llena el ancho con columnas de 18 rem y `items-start`
              deja que cada ficha mida lo suyo: antes la grilla fija de tres
              estiraba las tarjetas y la séptima quedaba sola (D125). */}
          <div class="mt-6 grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] items-start gap-4">
            {filteredCards.map(({ meta, entry }) => (
              <InfoCardItem key={meta.key} meta={meta} entry={entry!} />
            ))}
          </div>
          {latestInfoUpdate && (
            <p class="mt-4 text-xs text-ink-faint">
              {translate(locale, "Fichas actualizadas el {{date}}", {
                date: formatDate(latestInfoUpdate, locale),
              })}
            </p>
          )}
        </section>
      )}

      {/* Debajo del contenido propio, lo que la pestaña no muestra: las
          encuestas abiertas de las comunidades que la contienen, que quien
          vive acá también vota. Antes había un pie que repetía Encuestas,
          Debates y Reclamos, ya presentes en las pestañas (décima ronda,
          mejora 3). */}
      {!isEmptyCommunity && chainPolls.value.length > 0 && (
        <section
          aria-labelledby="encuestas-cadena-titulo"
          class="mt-10 border-t border-subtle pt-6"
        >
          <h3
            id="encuestas-cadena-titulo"
            class="text-base font-semibold text-ink-strong"
          >
            {translate(
              locale,
              "Encuestas abiertas en las comunidades que la contienen",
            )}
          </h3>
          <p class="mt-1 text-xs text-ink-muted">
            {translate(
              locale,
              "Quien vive en {{name}} también vota en las comunidades que la contienen.",
              { name: ctx.value.community.name },
            )}
          </p>
          <ChainPollsList polls={chainPolls.value} />
        </section>
      )}

      {/* Sigue siendo un `<details>` cerrado: los E2E y la décima ronda lo
          abren por el `summary`, y un `<details>` no se puede forzar abierto
          sólo en escritorio sin duplicar el DOM. Lo que cambia es que ahora
          parece una sección: ícono, título en la escala y chevron (D125). */}
      <details
        data-community-tools
        class="group rounded-2xl border border-subtle bg-surface p-5 sm:p-6"
      >
        <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl py-1 [&::-webkit-details-marker]:hidden">
          <Icon name="wrench" class="text-base text-ink-muted" />
          <span class="flex-1 font-display text-display-xs text-ink-strong">
            {translate(locale, "Más herramientas")}
          </span>
          <Icon
            name="chevron-down"
            class="text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>
        <div class="mt-4 space-y-6">
          <nav
            aria-label={translate(locale, "Herramientas de la comunidad")}
            class="flex flex-wrap gap-2"
          >
            {/* El mapa barrial y la rendición municipal, de ciudad para
                abajo; la comparativa pasó a Comparar, en "Más" (D96). */}
            {municipal && (
              <Chip
                variant="action"
                href={`/c/${ctx.value.community.slug}/mapa`}
                icon="map"
              >
                {translate(locale, "Mapa barrial")}
              </Chip>
            )}
            <Chip
              variant="action"
              href={`/c/${ctx.value.community.slug}/victorias`}
              icon="trophy"
            >
              {translate(locale, "Victorias")}
            </Chip>
            {municipal && (
              <Chip
                variant="action"
                href={`/c/${ctx.value.community.slug}/rendicion`}
                icon="list"
              >
                {translate(locale, "Rendición")}
              </Chip>
            )}
            <Chip
              variant="action"
              href={`/c/${ctx.value.community.slug}/instituciones`}
              icon="building"
            >
              {translate(locale, "Instituciones")}
            </Chip>
            {ctx.value.counts.resolvedClaims !== null &&
              activeClaimsCount !== null &&
              totalParticipationCount !== null && (
                <>
                  <WeeklyDigestModal
                    communityName={ctx.value.community.name}
                    resolvedClaimsCount={ctx.value.counts.resolvedClaims}
                    openClaimsCount={activeClaimsCount}
                    actionsCount={totalParticipationCount}
                    communityUrl={`${location.url.origin}/c/${ctx.value.community.slug}`}
                  />
                  <CivicSummaryCardModal
                    communityName={ctx.value.community.name}
                    communityEmoji={ctx.value.community.emoji}
                    communitySlug={ctx.value.community.slug}
                    memberCount={ctx.value.community.member_count}
                    resolvedClaimsCount={ctx.value.counts.resolvedClaims}
                    openClaimsCount={activeClaimsCount}
                    participationCount={totalParticipationCount}
                  />
                </>
              )}
            <NewNeighborWelcomeModal communityName={ctx.value.community.name} />
          </nav>
          {/* Qué hacer acá, como enlaces. Antes era una lista de pasos con
              casillas que se marcaban a mano y terminaba en "¡Felicitaciones!":
              un logro que la base nunca registró (D74, D116). */}
          <nav
            aria-labelledby="que-hacer-titulo"
            class="rounded-3xl border border-brand-500/30 bg-gradient-to-r from-brand-500/10 via-brand-500/5 to-transparent p-5 sm:p-6"
          >
            <h2
              id="que-hacer-titulo"
              class="text-base font-bold text-ink-strong sm:text-lg"
            >
              <Icon name="compass" class="mr-1 text-brand" />
              {translate(locale, "Qué podés hacer acá")}
            </h2>
            <ul class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {municipal && (
                <li>
                  <Link
                    href={`/c/${ctx.value.community.slug}/mapa`}
                    class="flex h-full flex-col rounded-2xl border border-subtle/60 bg-surface/80 p-3.5 transition-colors hover:border-brand-500/40"
                  >
                    <Icon name="map" class="text-2xl text-brand" />
                    <span class="mt-2 text-xs font-bold text-ink-strong">
                      {translate(locale, "Explorá el mapa")}
                    </span>
                    <span class="mt-1 text-2xs leading-relaxed text-ink-muted">
                      {translate(
                        locale,
                        "Revisá los puntos calientes y reclamos abiertos en tu cuadra.",
                      )}
                    </span>
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={`/c/${ctx.value.community.slug}/encuestas`}
                  class="flex h-full flex-col rounded-2xl border border-subtle/60 bg-surface/80 p-3.5 transition-colors hover:border-brand-500/40"
                >
                  <Icon name="ballot" class="text-2xl text-brand" />
                  <span class="mt-2 text-xs font-bold text-ink-strong">
                    {translate(locale, "Votá en una encuesta")}
                  </span>
                  <span class="mt-1 text-2xs leading-relaxed text-ink-muted">
                    {translate(
                      locale,
                      "Sumá tu opinión en las decisiones colectivas de la comunidad.",
                    )}
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href={publicationEntryHref({
                    communitySlug: ctx.value.community.slug,
                    type: "claim",
                    isAuthenticated: ctx.value.isAuthenticated,
                    hasResidence: ctx.value.hasResidence,
                    isMember: ctx.value.isMember,
                  })}
                  class="flex h-full flex-col rounded-2xl border border-subtle/60 bg-surface/80 p-3.5 transition-colors hover:border-brand-500/40"
                >
                  <Icon name="megaphone" class="text-2xl text-brand" />
                  <span class="mt-2 text-xs font-bold text-ink-strong">
                    {translate(locale, "Reportá un problema")}
                  </span>
                  <span class="mt-1 text-2xs leading-relaxed text-ink-muted">
                    {translate(
                      locale,
                      "Publicá una foto de lo que necesita arreglo en tu cuadra.",
                    )}
                  </span>
                </Link>
              </li>
            </ul>
          </nav>

          {/* Línea Temporal e Hitos Barriales */}
          {ctx.value.counts.resolvedClaims !== null &&
            ctx.value.counts.polls !== null &&
            ctx.value.counts.projects !== null && (
              <MilestoneCarousel
                communityName={ctx.value.community.name}
                communitySlug={ctx.value.community.slug}
                createdAt={ctx.value.community.created_at}
                memberCount={ctx.value.community.member_count}
                resolvedClaimsCount={ctx.value.counts.resolvedClaims}
                pollsCount={ctx.value.counts.polls}
                projectsCount={ctx.value.counts.projects}
              />
            )}

          {/* Kit de Difusión y Recursos Vecinales */}
          <CommunityPressKitCard
            communityName={ctx.value.community.name}
            communitySlug={ctx.value.community.slug}
            communityEmoji={ctx.value.community.emoji}
          />
        </div>
      </details>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue, params, url }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader);
  const name = ctx?.community.name ?? params.slug;
  const description = communityShareDescription(
    ctx?.community.description,
    translate(
      locale,
      "Conocé {{name}} en Agorbis: su historia, su geografía, su cultura, y participá de sus encuestas, debates, reclamos y proyectos.",
      { name },
    ),
  );

  return {
    title: `${name} · ${APP_NAME}`,
    meta: communityShareMeta({
      title: `${ctx?.community.emoji ?? ""} ${name} · ${APP_NAME}`.trim(),
      description,
      pageUrl: canonicalHref(url),
      imageUrl: `${url.origin}${SOCIAL_IMAGE_PATH}`,
    }),
  };
};
