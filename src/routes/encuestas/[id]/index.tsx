import {
  addContentSource,
  sourceSchema,
  postInstitutionalResponse,
  institutionalResponseSchema,
  addContentRelation,
  relationSchema,
} from "~/lib/extension-actions";
import {
  $,
  component$,
  isBrowser,
  useComputed$,
  useOnDocument,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  zod$,
  z,
  type DocumentHead,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { AiSummaryCard } from "~/components/content/AiSummaryCard";
import { ContentExtensionsPanel } from "~/components/content/ContentExtensionsPanel";
import { RemoveContentButton } from "~/components/content/RemoveContentButton";
import { DetailActions } from "~/components/content/DetailActions";
import { ClosePollButton } from "~/components/polls/ClosePollButton";
import { LiveResults } from "~/components/polls/LiveResults";
import { observePollDeadline } from "~/lib/poll-deadline";
import { selectedRelationFromUrl } from "~/lib/relation-picker";
import { ReportButton } from "~/components/moderation/ReportButton";
import type { PollResultRow } from "~/components/polls/PollResults";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  Chip,
  Icon,
  Illustration,
  SubmitButton,
  buttonClass,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { CivicCalendarButton } from "~/components/ui/CivicCalendarButton";
import {
  loadAiSummary,
  type AiSummaryView,
  isAiSummaryConfigured,
} from "~/lib/ai-summary";
import type { CommunityRef } from "~/lib/community";
import { routes } from "~/lib/community";
import { omitKeys } from "~/lib/embed";
import {
  loadContentExtensions,
  type ContentExtensions,
} from "~/lib/content-extensions";
import {
  APP_NAME,
  LOAD_FAILED,
  POLL_CATEGORY_BY_KEY,
  POLL_TYPE_LABEL,
} from "~/lib/constants";
import {
  isRlsViolation,
  isUniqueViolation,
  participationBlockMessage,
} from "~/lib/db-error";
import type {
  PollCategory,
  PollType,
  Tables,
} from "~/lib/database.types.helpers";
import { countdown, formatInstant, formatNumber, isClosed } from "~/lib/format";
import { withAuthNext } from "~/lib/auth-navigation";
import { PublishedNextSteps } from "~/components/content/PublishedNextSteps";
import { contentPermissions } from "~/lib/content-permissions";
import { PUBLISHED_PARAM } from "~/lib/content-publication";
import { useLocale, translate, resolveLocale } from "~/lib/i18n";
import { collectionLimits } from "~/lib/form-collection-limits";
import { MAX_POLL_OPTIONS } from "~/lib/constants";
import { useTimeZone } from "~/lib/timezone";
import { useClosePoll } from "~/lib/content-actions";
import { isUuid, siteOrigin } from "~/lib/http";
import { socialImageMeta } from "~/lib/social-meta";
import { getViewer, supabase } from "~/lib/session";
import { createAdminSupabase } from "~/lib/supabase";
import { useLocaleLoader } from "../../layout";

/**
 * Aviso de que votar no tiene vuelta atrás.
 *
 * El mensaje existía —"Ya votaste… En el MVP el voto no se puede cambiar"—
 * pero aparecía **después** de votar, cuando ya no sirve para decidir. Llama la
 * atención el contraste con el resto de la app: bajar una publicación son dos
 * pasos, cerrar una encuesta son dos pasos, borrar la cuenta pide escribir el
 * usuario. Votar, que tampoco se deshace, era un solo click sin advertencia.
 *
 * La cuenta conserva sólo un recibo sin elección. La selección se suma a
 * tallies agregados y no queda como fila individual recuperable.
 */
const VoteWarning = component$(() => {
  const locale = useLocale();
  // Sin el ⚠ naranja: justo arriba de los botones parecía una falla, y lo que
  // describe es una protección. Lo único que hay que retener es que no se
  // cambia, y por eso va aparte.
  // D124: en gris de 11 px la garantía del voto secreto no se leía. Va en
  // un bloque con candado y texto normal, que es lo que una protección pide.
  return (
    <div class="flex items-start gap-2.5 rounded-xl bg-muted/70 px-3.5 py-3 text-sm">
      <Icon name="lock" class="mt-0.5 shrink-0 text-base text-ink-muted" />
      <div class="space-y-0.5">
        <p class="text-ink-muted">
          {translate(
            locale,
            "Tu elección no queda guardada: sólo se suma al total y registramos que participaste.",
          )}
        </p>
        <p class="font-medium text-ink">
          {translate(locale, "Una vez enviada, no se puede cambiar.")}
        </p>
      </div>
    </div>
  );
});

interface PollDetail {
  poll: Tables<"polls">;
  options: Tables<"poll_options">[];
  community: CommunityRef;
  chain: CommunityRef[];
  results: PollResultRow[];
  totalVotes: number;
  /** Personas, no votos: en las múltiples una persona emite varios. */
  totalVoters: number;
  canSeeResults: boolean;
  closedAtLoad: boolean;
  hasVoted: boolean;
  optionsLoadFailed: boolean;
  statsLoadFailed: boolean;
  resultsLoadFailed: boolean;
  isMember: boolean;
  isAuthenticated: boolean;
  canManage: boolean;
  isAuthor: boolean;
  aiSummary: AiSummaryView | null;
  aiSummaryEnabled: boolean;
  extensions: ContentExtensions;
  socialImage: string;
  ogImage: string;
}

export const usePoll = routeLoader$<PollDetail>(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "No encontramos esa encuesta."),
    );
  }
  const db = supabase(ev);
  const viewer = await getViewer(ev);
  const locale = resolveLocale(ev.locale());

  /**
   * El contenido y su comunidad en un solo viaje.
   *
   * Eran dos consultas en serie, y la segunda no necesitaba nada de la primera
   * salvo un id que la clave foránea ya relaciona. Contra Supabase desde el
   * runtime edge cada una es un ida y vuelta completo. Misma técnica que
   * `getViewer()` con el perfil y su comunidad de residencia.
   *
   * El embed nombra el constraint y no sólo la tabla: hoy `polls` tiene una
   * sola clave foránea a `communities` y bastaría con el nombre, pero el día
   * que se agregue una segunda —como ya le pasó a `claims` con
   * `escalated_to_community_id`— esto seguiría apuntando a donde debe en vez
   * de volverse ambiguo. El `select` va en un literal de una pieza porque
   * supabase-js deriva los tipos del embed parseando esta cadena.
   */
  const { data: row, error: pollError } = await db
    .from("polls")
    .select(
      "*, community:communities!polls_community_id_fkey(id, slug, name, emoji, level, path)",
    )
    .eq("id", ev.params.id)
    .maybeSingle();
  // Un fallo de la base no es una encuesta inexistente: un 404 la deja fuera del
  // índice de los buscadores por un error pasajero.
  if (pollError) throw ev.error(500, translate(locale, LOAD_FAILED));
  if (!row) {
    throw ev.error(404, translate(locale, "No encontramos esa encuesta."));
  }

  // El embed se separa de la fila: `poll` sigue siendo exactamente una fila de
  // `polls` y ninguna vista recibe un campo de más.
  const community = row.community;
  const poll = omitKeys(row, "community");

  // La ronda de un acuerdo no es una encuesta común: se vota y se lee desde
  // la página del acuerdo (D118).
  if (poll.agreement_id) {
    throw ev.redirect(302, routes.agreement(poll.agreement_id));
  }

  if (!community)
    throw ev.error(
      404,
      translate(locale, "No encontramos la comunidad de esa encuesta."),
    );

  const segments = community.path.split(".");
  // Se toma antes de leer estadísticas: si el plazo vence durante la consulta,
  // la pantalla ofrece volver a consultarlas en lugar de inferir un mínimo.
  const closedAtLoad = isClosed(poll.closes_at, poll.status);

  const [optionsRes, chainRes, resultsRes, statsRes] = await Promise.all([
    db
      .from("poll_options")
      .select("*")
      .eq("poll_id", poll.id)
      .order("sort_order"),
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .in(
        "path",
        segments.map((_, i) => segments.slice(0, i + 1).join(".")),
      )
      .order("level", { ascending: true }),
    db.rpc("poll_results", { p_poll: poll.id }),
    db.rpc("poll_stats", { p_poll: poll.id }),
  ]);

  const stats = statsRes.data?.[0];
  const options = optionsRes.data ?? [];

  const aiSummaryPromise = (() => {
    try {
      return loadAiSummary(
        db,
        createAdminSupabase(ev),
        "poll",
        poll.id,
        locale,
      );
    } catch {
      return Promise.resolve(null);
    }
  })();
  const [extensions, aiSummary] = await Promise.all([
    loadContentExtensions(
      db,
      "poll",
      poll.id,
      viewer.userId,
      selectedRelationFromUrl(ev.url, "poll", poll.id),
    ),
    aiSummaryPromise,
  ]);
  const siteUrl = siteOrigin(ev);

  return {
    poll,
    options,
    community,
    chain: chainRes.data ?? [],
    results: (resultsRes.data ?? []) as PollResultRow[],
    totalVotes: stats?.total_votes ?? 0,
    totalVoters: stats?.total_voters ?? 0,
    canSeeResults: stats?.can_see ?? false,
    closedAtLoad,
    hasVoted: stats?.has_voted ?? false,
    optionsLoadFailed: !!optionsRes.error || !options.length,
    statsLoadFailed: !!statsRes.error || !stats,
    resultsLoadFailed:
      !!resultsRes.error || (!!stats?.can_see && !resultsRes.data?.length),
    isMember:
      !!viewer.homePath &&
      (viewer.homePath === community.path ||
        viewer.homePath.startsWith(`${community.path}.`)),
    isAuthenticated: !!viewer.userId,
    ...contentPermissions(viewer, poll.author_id),
    aiSummary,
    aiSummaryEnabled: isAiSummaryConfigured(ev.env),
    extensions,
    socialImage: `${siteUrl}/social/poll/${poll.id}?locale=${locale}`,
    ogImage: `${siteUrl}/og.png`,
  };
});

export const useVote = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const db = supabase(ev);
    const optionIds = Array.isArray(data.option_id)
      ? data.option_id
      : [data.option_id];

    if (optionIds.length === 0) {
      return ev.fail(400, { message: "Elegí al menos una opción." });
    }

    // La RPC valida actor, membresía, estado, tipo, máximo y pertenencia de las
    // opciones, registra el recibo e incrementa todos los tallies dentro de la
    // misma transacción. No se crea ni devuelve una fila de boleta individual.
    const { error } = await db.rpc("cast_poll_ballot", {
      p_poll: data.poll_id,
      p_option_ids: optionIds,
    });

    if (error) {
      // `Ya votaste` y el nombre del índice `one_per_user` son nuestros y no
      // cambian con el locale del servidor; el "duplicate key" que los
      // acompañaba sí era prosa de Postgres, y tiene código propio.
      const message =
        participationBlockMessage(error) ??
        (isUniqueViolation(error) ||
        /AGORBIS_ALREADY_VOTED/i.test(error.message)
          ? "Ya votaste en esta encuesta. Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla."
          : /cerrada|venció|closed/i.test(error.message)
            ? "Esta encuesta ya está cerrada."
            : /elige una sola/i.test(error.message)
              ? "En esta encuesta se elige una sola opción."
              : /permite elegir hasta/i.test(error.message)
                ? error.message
                : isRlsViolation(error)
                  ? "Sólo pueden votar quienes viven en esta comunidad."
                  : "No pudimos registrar tu voto. Probá de nuevo.");
      return ev.fail(400, { message });
    }

    return { voted: true as const };
  },
  zod$({
    poll_id: z.string().uuid(),
    // Un checkbox marcado llega como string; varios, como array.
    option_id: z.union([z.string().uuid(), z.array(z.string().uuid())]),
  }),
  // Va después de zod$ para correr antes (D100).
  collectionLimits({ option_id: MAX_POLL_OPTIONS }),
);

export const useAddRelation = routeAction$(
  (data, ev) => addContentRelation(data, ev),
  { validation: [zod$(relationSchema)], invalidate: [usePoll] },
);
export const useAddSource = routeAction$(
  (data, ev) => addContentSource(data, ev),
  { validation: [zod$(sourceSchema)], invalidate: [usePoll] },
);
export const useInstitutionalResponse = routeAction$(
  (data, ev) => postInstitutionalResponse(data, ev),
  { validation: [zod$(institutionalResponseSchema)], invalidate: [usePoll] },
);

export default component$(() => {
  const addSource = useAddSource();
  const addRelation = useAddRelation();
  const institutionalResponse = useInstitutionalResponse();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const data = usePoll();
  const vote = useVote();
  const closePoll = useClosePoll();

  const {
    poll,
    options,
    community,
    chain,
    isMember,
    isAuthenticated,
    canSeeResults,
  } = data.value;
  const location = useLocation();
  // Primera visita de la autoría después de publicar: el parámetro se puede
  // compartir, así que a otra persona no se le muestra nada.
  const justPublished =
    data.value.isAuthor &&
    location.url.searchParams.get(PUBLISHED_PARAM) === "1";

  const clock = useSignal(Date.now());
  // eslint-disable-next-line qwik/no-use-visible-task -- vencimiento y eventos reales del navegador, sin polling
  useVisibleTask$(
    ({ track, cleanup }) => {
      const current = track(() => data.value.poll);
      cleanup(
        observePollDeadline(current.closes_at, current.status, (now) => {
          clock.value = now;
        }),
      );
    },
    { strategy: "document-ready" },
  );
  const closed = useComputed$(
    () =>
      isClosed(
        data.value.poll.closes_at,
        data.value.poll.status,
        new Date(clock.value),
      ) ||
      (closePoll.formData?.get("id") === data.value.poll.id &&
        closePoll.value?.closed === true),
  );
  const remaining = countdown(poll.closes_at, locale, new Date(clock.value));
  const needsResultRefresh = useComputed$(
    () => closed.value && !data.value.closedAtLoad && !data.value.canSeeResults,
  );
  /** Último día: el aviso deja de ser informativo y pasa a ser urgente. */
  const closingSoon = useComputed$(
    () =>
      !closed.value &&
      !!data.value.poll.closes_at &&
      new Date(data.value.poll.closes_at).getTime() - clock.value < 86_400_000,
  );

  // Cuántas opciones lleva marcadas en una encuesta múltiple. El máximo lo
  // decide y lo hace cumplir Postgres (D35); acá sólo evitamos que alguien
  // marque seis, envíe y recién entonces se entere de que el tope era tres.
  const chosen = useSignal<string[]>([]);
  const selectionPollId = useSignal(poll.id);
  useTask$(({ track }) => {
    const currentId = track(() => data.value.poll.id);
    if (selectionPollId.value !== currentId) {
      selectionPollId.value = currentId;
      chosen.value = [];
    }
  });
  const maxChoices = useComputed$(() =>
    data.value.poll.type === "multiple" ? data.value.poll.max_choices : null,
  );
  const atMax = useComputed$(
    () => maxChoices.value !== null && chosen.value.length >= maxChoices.value,
  );
  /** Opción que ya no se puede marcar porque se llegó al tope. */
  const blocked = (id: string) => atMax.value && !chosen.value.includes(id);
  const currentVote = useComputed$(() =>
    vote.formData?.get("poll_id") === data.value.poll.id
      ? vote.value
      : undefined,
  );
  const justVoted = useComputed$(() => currentVote.value?.voted === true);
  // La vibración de éxito acompaña el voto ya registrado. Antes sonaba al
  // apoyar el dedo en "Votar", aunque después el voto fallara (D96).
  useTask$(({ track }) => {
    if (track(() => justVoted.value) && isBrowser) {
      triggerHapticFeedback("success");
    }
  });
  /**
   * ¿Está Qwik vivo en esta pestaña?
   *
   * `chosen` sólo se actualiza desde el cliente, así que un botón deshabilitado
   * ya en el HTML del servidor no se volvería a habilitar nunca sin JavaScript:
   * el bloqueo dejaría de ser una ayuda y pasaría a impedir votar. Se asume que
   * no hay JavaScript hasta que el propio JavaScript diga lo contrario.
   */
  const interactive = useSignal(false);
  useOnDocument(
    "qinit",
    $(() => (interactive.value = true)),
  );
  /** Múltiple sin nada marcado: enviar así sólo puede terminar en un error. */
  const nothingChosen = useComputed$(
    () =>
      interactive.value &&
      data.value.poll.type === "multiple" &&
      chosen.value.length === 0,
  );
  const hasVoted = useComputed$(() => data.value.hasVoted || justVoted.value);
  const canVote = useComputed$(
    () =>
      data.value.isMember &&
      !closed.value &&
      !hasVoted.value &&
      !data.value.optionsLoadFailed &&
      !data.value.statsLoadFailed,
  );
  const showResults = canSeeResults;
  // Si la lectura de resultados falló, la tarjeta sólo muestra el error: las
  // etiquetas no están en ningún otro lado.
  const resultsVisible = showResults && !data.value.resultsLoadFailed;
  // Lo mismo que dibuja el aside: la descarga, sólo con resultados, y la tarjeta
  // de IA, que sin resumen ni generación no dibuja nada (AiSummaryCard).
  const hasAside =
    canSeeResults || !!data.value.aiSummary || data.value.aiSummaryEnabled;
  const isBinary = poll.type === "binary";
  const pollCategory = poll.category as PollCategory;
  const translatedVoteMessage = useComputed$(() => {
    const voteMessage = currentVote.value?.message;
    return voteMessage
      ? voteMessage.startsWith("Esta encuesta permite elegir hasta ")
        ? translate(
            locale,
            "Esta encuesta permite elegir hasta {{count}} opciones.",
            {
              count: formatNumber(poll.max_choices ?? 0, locale),
            },
          )
        : translate(locale, voteMessage)
      : null;
  });

  return (
    // Sin aside, una sola columna acotada y centrada, con la miga de pan: a todo
    // el ancho la tarjeta de voto medía 1400 px, y alineada a la izquierda dejaba
    // a la derecha el mismo hueco que la columna reservada.
    <div class={cx("container-content py-8", !hasAside && "lg:max-w-4xl")}>
      <CommunityBreadcrumb chain={chain} currentIsLink class="mb-5" />

      {/* Mismo esqueleto que reclamos y proyectos: la columna de lectura no
          debe correr todo el ancho del contenedor (96rem desde D111). */}
      <div class={cx("grid gap-6", hasAside && "lg:grid-cols-[1fr_22rem]")}>
        {/* Franja superior con el azul del tipo (D123): la página se reconoce
            como encuesta antes de leer el título. */}
        <article class="min-w-0 border-t-4 border-t-kind-poll pt-5">
          {justPublished && (
            <PublishedNextSteps
              kind="poll"
              title={poll.question}
              url={routes.poll(poll.id)}
              communityName={community.name}
              closesLabel={
                poll.closes_at
                  ? formatInstant(poll.closes_at, locale, timeZone)
                  : undefined
              }
            />
          )}
          {/* Hasta tres insignias: tema, estado y si ya votaste. El tipo lo
              dice la consigna de la votación y el estado de los resultados,
              su propia tarjeta; acá llegaban a ser siete (D96). */}
          <div
            data-detail-badges
            class="mb-3 flex flex-wrap items-center gap-2"
          >
            <Chip
              variant="badge"
              icon={CONTENT_KINDS.poll.icon}
              toneClass={CONTENT_KIND_TONES.poll.badge}
            >
              {translate(locale, CONTENT_KINDS.poll.label)}
            </Chip>
            <Badge tone="neutral">
              {POLL_CATEGORY_BY_KEY[pollCategory].emoji}{" "}
              {translate(locale, POLL_CATEGORY_BY_KEY[pollCategory].label)}
            </Badge>
            {closed.value ? (
              <Badge tone="neutral">{translate(locale, "Cerrada")}</Badge>
            ) : remaining ? (
              <Badge tone={closingSoon.value ? "danger" : "warn"}>
                <Icon name={closingSoon.value ? "alert" : "clock"} />{" "}
                {remaining}
              </Badge>
            ) : (
              <Badge tone="success">{translate(locale, "Abierta")}</Badge>
            )}
            {hasVoted.value && (
              <Badge tone="success">
                <Icon name="check" /> {translate(locale, "Ya votaste")}
              </Badge>
            )}
            {!closed.value && poll.closes_at && (
              <CivicCalendarButton
                title={`Cierre de votación: ${poll.question}`}
                description={`Recordatorio de cierre para la encuesta ciudadana en ${community.name}.`}
                endDate={poll.closes_at}
                location={community.name}
              />
            )}
          </div>

          <h1 dir="auto" class="text-display-lg sm:text-display-xl">
            {poll.question}
          </h1>

          {poll.description && (
            <p
              dir="auto"
              class="ugc-text measure mt-3 whitespace-pre-line leading-relaxed text-ink-muted"
            >
              {poll.description}
            </p>
          )}

          <p class="mt-3 text-sm text-ink-faint">
            {translate(locale, "Encuesta de")}{" "}
            <Link
              href={routes.community(community.slug)}
              class="font-medium text-brand hover:underline"
            >
              {community.emoji} {community.name}
            </Link>
            {poll.closes_at && (
              <>
                {" "}
                ·{" "}
                {translate(locale, "Cierra el {{date}}", {
                  date: formatInstant(poll.closes_at, locale, timeZone),
                })}
              </>
            )}{" "}
            ·{" "}
            {/* Desde una encuesta compartida por WhatsApp no había ninguna
                puerta al resto: la miga de pan lleva a la comunidad, pero no a
                sus otras encuestas, que es lo que quiere quien acaba de votar. */}
            <Link
              href={`${routes.community(community.slug)}/encuestas`}
              class="font-medium text-brand hover:underline"
            >
              {translate(locale, "Ver todas las encuestas")}
            </Link>
          </p>

          {/* Barra con jerarquía (D124): la acción de la página primero,
              después guardar y compartir como secundarios. Antes eran
              píldoras iguales y nada decía qué se venía a hacer acá. */}
          <div class="mt-4 flex flex-wrap items-center gap-2">
            {canVote.value && (
              <a
                href="#votacion"
                class={buttonClass("primary", "sm")}
                onClick$={() => triggerHapticFeedback("selection")}
              >
                <Icon name="ballot" class="text-base" />
                {translate(locale, "Votar")}
              </a>
            )}
            <DetailActions
              type="poll"
              id={poll.id}
              title={poll.question}
              url={`/encuestas/${poll.id}`}
              communityName={community.name}
              class="flex flex-wrap items-center gap-2"
            />
          </div>

          {/* --------------------------------------------------------- Votación */}
          <div id="votacion" class="scroll-mt-24">
            <Card
              class="mt-6 p-5 sm:p-6"
              accent={
                canVote.value ? CONTENT_KIND_TONES.poll.accent : undefined
              }
            >
              {translatedVoteMessage.value && (
                <Alert class="mb-4">{translatedVoteMessage.value}</Alert>
              )}

              {justVoted.value && (
                <Alert tone="success" class="mb-4">
                  {translate(locale, "¡Listo! Tu voto quedó registrado.")}
                </Alert>
              )}

              {data.value.optionsLoadFailed || data.value.statsLoadFailed ? (
                <div role="alert" class="text-sm text-danger">
                  <p>
                    {translate(
                      locale,
                      data.value.optionsLoadFailed
                        ? "No pudimos cargar las opciones para votar."
                        : "No pudimos comprobar tu participación en esta encuesta.",
                    )}
                  </p>
                  <a
                    href={`/encuestas/${poll.id}`}
                    class={cx(buttonClass("secondary", "sm"), "mt-3")}
                  >
                    {translate(locale, "Reintentar")}
                  </a>
                </div>
              ) : canVote.value ? (
                <Form action={vote}>
                  <input type="hidden" name="poll_id" value={poll.id} />

                  <fieldset>
                    <legend class="mb-3 text-sm font-medium text-ink-strong">
                      {translate(
                        locale,
                        POLL_TYPE_LABEL[poll.type as PollType],
                      )}
                      {poll.type === "multiple" && (
                        <span class="ml-1 font-normal text-ink-faint">
                          {poll.max_choices
                            ? translate(
                                locale,
                                "(podés marcar hasta {{count}})",
                                {
                                  count: formatNumber(poll.max_choices, locale),
                                },
                              )
                            : translate(locale, "(podés marcar varias)")}
                        </span>
                      )}
                    </legend>

                    {/* Sin esto, el tope era una frase entre paréntesis: se
                      marcaban cinco opciones, se enviaba y el servidor
                      rechazaba el voto entero. Ahora se ve cuántas van y las
                      demás dejan de aceptar clicks al llegar al máximo. */}
                    {poll.type === "multiple" && maxChoices.value !== null && (
                      <p
                        aria-live="polite"
                        class={cx(
                          "mb-3 text-xs tabular-nums",
                          atMax.value
                            ? "font-medium text-warn"
                            : "text-ink-faint",
                        )}
                      >
                        {atMax.value
                          ? translate(
                              locale,
                              "Llegaste al máximo: {{count}} de {{max}} opciones",
                              {
                                count: formatNumber(
                                  chosen.value.length,
                                  locale,
                                ),
                                max: formatNumber(maxChoices.value, locale),
                              },
                            )
                          : translate(
                              locale,
                              "Llevás {{count}} de {{max}} opciones",
                              {
                                count: formatNumber(
                                  chosen.value.length,
                                  locale,
                                ),
                                max: formatNumber(maxChoices.value, locale),
                              },
                            )}
                      </p>
                    )}

                    {/* En la binaria cada botón emite el voto al tocarlo: la
                      irreversibilidad se explica antes de llegar a ellos. */}
                    {isBinary && (
                      <div class="mb-3">
                        <VoteWarning />
                      </div>
                    )}

                    {isBinary ? (
                      // Binaria: dos botones grandes, uno al lado del otro.
                      <div class="grid gap-3 sm:grid-cols-2">
                        {options.map((option) => (
                          <button
                            key={option.id}
                            type="submit"
                            name="option_id"
                            value={option.id}
                            disabled={vote.isRunning}
                            aria-busy={
                              vote.isRunning &&
                              vote.formData?.get("option_id") === option.id
                            }
                            class={cx(
                              "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 text-center touch-manipulation",
                              "transition-all hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98] disabled:opacity-60",
                              "border-control bg-surface text-ink-strong hover:border-brand-500 hover:bg-muted",
                            )}
                          >
                            {vote.isRunning &&
                              vote.formData?.get("option_id") === option.id && (
                                <svg
                                  viewBox="0 0 24 24"
                                  class="size-7 animate-spin"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2.5"
                                  aria-hidden="true"
                                >
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="9"
                                    class="opacity-25"
                                  />
                                  <path
                                    stroke-linecap="round"
                                    d="M21 12a9 9 0 00-9-9"
                                  />
                                </svg>
                              )}
                            <span
                              dir="auto"
                              class="text-base font-semibold text-balance"
                            >
                              {option.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <ul class="space-y-2.5">
                        {options.map((option, idx) => (
                          <li key={option.id}>
                            {/* D124: la opción es una tarjeta de 56 px con el
                              número a la izquierda; el color del tipo marca
                              la elegida. Los radios de 18 px eran lo único
                              para tocar en una decisión que no se deshace. */}
                            <label
                              class={cx(
                                "group flex min-h-14 items-center gap-3.5 rounded-xl border border-subtle bg-surface px-4 py-3 touch-manipulation",
                                "transition-[border-color,background-color,box-shadow] duration-150",
                                "has-checked:border-kind-poll has-checked:bg-kind-poll-bg has-checked:ring-2 has-checked:ring-kind-poll/30",
                                "has-focus-visible:ring-2 has-focus-visible:ring-brand-500 has-focus-visible:ring-offset-2",
                                // Bloqueada por el tope: se ve que no es
                                // elegible antes de intentar tocarla.
                                blocked(option.id)
                                  ? "cursor-not-allowed opacity-50"
                                  : "cursor-pointer hover:border-strong hover:bg-muted/60 active:scale-[0.99]",
                              )}
                            >
                              <span
                                aria-hidden="true"
                                class="grid size-8 shrink-0 place-items-center rounded-full border border-control bg-muted/40 font-display text-sm font-bold tabular-nums text-ink-muted transition-colors group-has-checked:border-kind-poll group-has-checked:bg-kind-poll group-has-checked:text-white"
                              >
                                {idx + 1}
                              </span>
                              {/* Un <span> y no un <div>: dentro de un <label>
                                sólo va contenido de frase (D126). */}
                              <span class="flex min-w-0 flex-1 items-center gap-3">
                                <input
                                  type={
                                    poll.type === "multiple"
                                      ? "checkbox"
                                      : "radio"
                                  }
                                  name="option_id"
                                  value={option.id}
                                  required={poll.type === "single"}
                                  disabled={blocked(option.id)}
                                  onChange$={(_, el) => {
                                    if (poll.type !== "multiple") return;
                                    chosen.value = el.checked
                                      ? [...chosen.value, option.id]
                                      : chosen.value.filter(
                                          (id) => id !== option.id,
                                        );
                                  }}
                                  class="size-4.5 shrink-0 accent-[var(--kind-poll)] focus-visible:outline-none"
                                />
                                <span
                                  dir="auto"
                                  class="text-base font-medium text-ink-strong"
                                >
                                  {option.label}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </fieldset>

                  {!isBinary && (
                    <>
                      <div class="mt-2">
                        <VoteWarning />
                      </div>
                      {/* En las múltiples ningún control es `required`: se podía
                        enviar el formulario sin marcar nada y esperar el viaje
                        de ida y vuelta para que el servidor contestara "elegí
                        al menos una opción". Ahora el botón dice por qué no
                        está disponible, antes de tocarlo. */}
                      <SubmitButton
                        size="lg"
                        class="mt-4 w-full touch-manipulation active:scale-[0.98] transition-transform duration-150"
                        pending={vote.isRunning}
                        disabled={nothingChosen.value}
                      >
                        {translate(locale, "Votar")}
                      </SubmitButton>
                      {nothingChosen.value && (
                        <p class="mt-1.5 text-center text-xs text-ink-faint">
                          {translate(
                            locale,
                            "Marcá al menos una opción para poder votar.",
                          )}
                        </p>
                      )}
                    </>
                  )}
                </Form>
              ) : (
                <div class="space-y-3">
                  {/* Quien llegaba por un enlace compartido veía la pregunta y un
                    muro de ingreso, sin saber qué se está eligiendo. Sólo las
                    etiquetas, que el widget de la comunidad ya publica: ningún
                    número ni marca de lo elegido, y después de votar tampoco
                    (D68). No es una lista de opciones para tocar: por eso no
                    lleva bordes de tarjeta. */}
                  {!resultsVisible && (
                    <div>
                      <h2
                        id="opciones-encuesta"
                        class="text-sm font-semibold text-ink-strong"
                      >
                        {translate(locale, "Opciones")}
                      </h2>
                      <ul
                        aria-labelledby="opciones-encuesta"
                        class="mt-1.5 list-disc space-y-1 ps-5 text-sm text-ink marker:text-ink-faint"
                      >
                        {options.map((option) => (
                          <li key={option.id} dir="auto" class="ugc-text">
                            {option.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!isAuthenticated ? (
                    <>
                      <p class="text-sm text-ink-muted">
                        {/* En la Tierra vale cualquier residencia: "vivir en
                          Tierra" no le dice a nadie qué le falta. */}
                        {community.level === 0
                          ? translate(
                              locale,
                              "Para votar necesitás una cuenta y elegir dónde vivís.",
                            )
                          : translate(
                              locale,
                              "Para votar necesitás una cuenta y vivir en {{community}}.",
                              {
                                community: community.name,
                              },
                            )}
                      </p>
                      <div class="flex flex-wrap gap-2">
                        <ButtonLink
                          href={withAuthNext(
                            "/registro",
                            `/encuestas/${poll.id}`,
                          )}
                        >
                          {translate(locale, "Crear cuenta")}
                        </ButtonLink>
                        <ButtonLink
                          href={`/ingresar?next=${encodeURIComponent(`/encuestas/${poll.id}`)}`}
                          variant="secondary"
                        >
                          {translate(locale, "Ingresar")}
                        </ButtonLink>
                      </div>
                    </>
                  ) : !isMember ? (
                    <p class="text-sm text-ink-muted">
                      <span aria-hidden="true">👀</span>{" "}
                      {community.level === 0
                        ? translate(
                            locale,
                            "Podés leer la encuesta y los resultados finales cuando se publiquen. Para votar, elegí dónde vivís desde",
                          )
                        : translate(
                            locale,
                            "Podés leer la encuesta y los resultados finales cuando se publiquen, pero votar sólo pueden quienes viven en {{community}}. Si te mudaste, cambiá tu residencia desde",
                            { community: community.name },
                          )}{" "}
                      <Link
                        href="/perfil"
                        class="font-medium text-brand hover:underline"
                      >
                        {translate(locale, "tu perfil")}
                      </Link>
                      .
                    </p>
                  ) : closed.value ? (
                    <p class="text-sm text-ink-muted">
                      {translate(
                        locale,
                        canSeeResults
                          ? "Esta encuesta está cerrada. Los resultados finales están disponibles abajo."
                          : "Esta encuesta está cerrada. El total de participaciones también se protege cuando no se alcanza el mínimo.",
                      )}
                    </p>
                  ) : (
                    // Después de votar sólo quedaba "Ya votaste": no se sabía que
                    // el cierre llega como notificación (0047) ni adónde seguir.
                    <div class="space-y-2 text-sm text-ink-muted">
                      <p>
                        {translate(
                          locale,
                          "Ya votaste en esta encuesta. Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla.",
                        )}
                      </p>
                      <p>
                        {translate(
                          locale,
                          "Te avisamos cuando cierre, según tus preferencias de notificaciones. Si participaron al menos 5 personas, los resultados se publican acá.",
                        )}
                      </p>
                      <Link
                        href={`${routes.community(community.slug)}/encuestas`}
                        class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
                      >
                        {translate(
                          locale,
                          "Ver otras encuestas de {{community}}",
                          {
                            community: community.name,
                          },
                        )}{" "}
                        <Icon name="arrow-right" class="text-sm" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* -------------------------------------------------------- Resultados */}
          {/* El `id` es el destino del enlace que aparece al votar; el
              `scroll-mt` deja el título por debajo de la cabecera pegajosa, que
              si no se le monta encima. */}
          <div id="resultados" class="scroll-mt-24">
            <Card class="mt-4 p-5 sm:p-6">
              {data.value.statsLoadFailed || data.value.resultsLoadFailed ? (
                <div role="alert" class="text-sm text-danger">
                  <h2 class="font-semibold">
                    {translate(locale, "No pudimos cargar los resultados")}
                  </h2>
                  <p class="mt-1">
                    {translate(
                      locale,
                      "Probá de nuevo. Un error de carga no indica cuántas personas participaron.",
                    )}
                  </p>
                  <a
                    href={`/encuestas/${poll.id}#resultados`}
                    class={cx(buttonClass("secondary", "sm"), "mt-3")}
                  >
                    {translate(locale, "Reintentar")}
                  </a>
                </div>
              ) : showResults ? (
                <LiveResults
                  initialResults={data.value.results}
                  initialTotal={data.value.totalVotes}
                  initialVoters={data.value.totalVoters}
                  question={poll.question}
                  communityName={community.name}
                />
              ) : (
                <div class="py-6 text-center">
                  {/* D124: ilustración propia en vez del candado emoji, y la
                      fecha de cierre como dato a la vista, no escondida en
                      medio de una frase. La regla de las 5 personas (D68) se
                      sigue diciendo con las mismas palabras. */}
                  <Illustration name="locked" class="mx-auto size-20" />
                  <h2 class="mt-3 text-display-xs">
                    {translate(locale, "Los resultados están reservados")}
                  </h2>
                  {!needsResultRefresh.value && !closed.value && (
                    <p class="mt-2 font-display text-base font-semibold tabular-nums text-ink-strong">
                      {translate(locale, "Cierra el {{date}}", {
                        date: formatInstant(poll.closes_at!, locale, timeZone),
                      })}
                    </p>
                  )}
                  <p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                    {needsResultRefresh.value
                      ? translate(
                          locale,
                          "El plazo terminó. Consultá los resultados para comprobar si ya están disponibles.",
                        )
                      : closed.value
                        ? translate(
                            locale,
                            "La ronda cerró, pero los resultados siguen ocultos porque participaron menos de 5 personas. No mostramos el número exacto.",
                          )
                        : translate(
                            locale,
                            "Se publican al cierre y sólo si participaron al menos 5 personas.",
                          )}
                  </p>
                  {needsResultRefresh.value && (
                    <a
                      href={`/encuestas/${poll.id}#resultados`}
                      preventdefault:click
                      onClick$={() => window.location.reload()}
                      class={cx(buttonClass("secondary", "sm"), "mt-4")}
                    >
                      {translate(locale, "Consultar resultados finales")}
                    </a>
                  )}
                </div>
              )}
            </Card>
          </div>

          <ContentExtensionsPanel
            addRelation={addRelation}
            addSource={addSource}
            respond={institutionalResponse}
            key={poll.id}
            type="poll"
            id={poll.id}
            data={data.value.extensions}
            canManage={data.value.canManage}
          />

          {/* Un solo panel de autor (D124): antes "Zona del autor" aparecía
              dos veces, una por acción. Cada componente conserva su lógica y
              decide si se dibuja; acá sólo cambia el envoltorio. */}
          {(data.value.isAuthor ||
            (data.value.canManage &&
              (!closed.value ||
                closePoll.formData?.get("id") === poll.id))) && (
            <section class="mt-8" aria-labelledby="zona-autor">
              <Card class="p-4 sm:p-5">
                <h2
                  id="zona-autor"
                  class="flex items-center gap-2 text-display-xs"
                >
                  <Icon name="settings" class="text-base text-ink-muted" />
                  {translate(locale, "Zona del autor")}
                </h2>
                <div class="mt-3 divide-y divide-subtle">
                  <ClosePollButton
                    close={closePoll}
                    pollId={poll.id}
                    canManage={data.value.canManage}
                    isClosed={closed.value}
                    closesAt={poll.closes_at}
                    embedded
                  />
                  <RemoveContentButton
                    type="poll"
                    id={poll.id}
                    isAuthor={data.value.isAuthor}
                    createdAt={poll.created_at}
                    backHref={`${routes.community(community.slug)}/encuestas`}
                    embedded
                  />
                </div>
              </Card>
            </section>
          )}

          <div class="mt-8">
            <ReportButton
              targetType="poll"
              targetId={poll.id}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </article>

        {hasAside && (
          <aside class="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            {/* Sólo si esta sesión puede ver los resultados. El endpoint lo
                verifica igual —`poll_results` aplica la visibilidad— pero
                ofrecer una descarga que va a venir vacía es peor que no
                ofrecerla. No es un `Link`: es una descarga, no una navegación
                del router. */}
            {data.value.canSeeResults && (
              <>
                <a
                  href={`/encuestas/${poll.id}/resultados.csv`}
                  class={buttonClass("secondary", "sm")}
                  download
                >
                  <Icon name="arrow-right" class="rotate-90 text-sm" />
                  {translate(locale, "Descargar resultados (CSV)")}
                </a>
                <button
                  type="button"
                  onClick$={() => window.print()}
                  class={buttonClass("secondary", "sm")}
                >
                  <span aria-hidden="true">🖨️</span>{" "}
                  {translate(locale, "Imprimir reporte para asamblea")}
                </button>
              </>
            )}
            <AiSummaryCard
              summary={data.value.aiSummary}
              enabled={data.value.aiSummaryEnabled}
              contentType="poll"
              contentId={poll.id}
              isAuthenticated={isAuthenticated}
            />
          </aside>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(usePoll);
  const locale = resolveValue(useLocaleLoader);
  const question = data?.poll.question ?? translate(locale, "Encuesta");
  const description =
    data?.poll.description ??
    translate(locale, "Encuesta de {{community}} en Agorbis.", {
      community: data?.community.name ?? "",
    });

  return {
    title: `${question} · ${APP_NAME}`,
    meta: [
      { name: "description", content: description.slice(0, 160) },
      { property: "og:title", content: question },
      { property: "og:description", content: description.slice(0, 200) },
      { property: "og:type", content: "article" },
      ...socialImageMeta(data?.ogImage ?? "", question),
    ],
  };
};
