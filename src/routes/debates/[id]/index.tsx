import {
  addContentSource,
  sourceSchema,
  postInstitutionalResponse,
  institutionalResponseSchema,
  addContentRelation,
  relationSchema,
} from "~/lib/extension-actions";
import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  routeAction$,
  useLocation,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { AiSummaryCard } from "~/components/content/AiSummaryCard";
import { ContentExtensionsPanel } from "~/components/content/ContentExtensionsPanel";
import { RemoveContentButton } from "~/components/content/RemoveContentButton";
import { DetailActions } from "~/components/content/DetailActions";
import type { DebateCommentData } from "~/components/debates/CommentCard";
import { DebateConsensusCard } from "~/components/debates/DebateConsensusCard";
import { DebateQuotesDrawer } from "~/components/debates/DebateQuotesDrawer";
import { DebateGrid } from "~/components/debates/DebateGrid";
import type { DebateColumnData } from "~/components/debates/DebateColumn";
import { ReportButton } from "~/components/moderation/ReportButton";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  Icon,
  buttonClass,
  cx,
  triggerHapticFeedback,
  MetaLine,
} from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { AssemblyProjectorModal } from "~/components/ui/AssemblyProjectorModal";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  loadAiSummary,
  type AiSummaryView,
  isAiSummaryConfigured,
} from "~/lib/ai-summary";
import type { CommunityRef } from "~/lib/community";
import { compareNames, routes } from "~/lib/community";
import { omitKeys } from "~/lib/embed";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { selectedRelationFromUrl } from "~/lib/relation-picker";
import {
  loadContentExtensions,
  type ContentExtensions,
} from "~/lib/content-extensions";
import type { Tables } from "~/lib/database.types.helpers";
import { pluralize } from "~/lib/format";
import { withAuthNext } from "~/lib/auth-navigation";
import { PublishedNextSteps } from "~/components/content/PublishedNextSteps";
import { contentPermissions } from "~/lib/content-permissions";
import { PUBLISHED_PARAM } from "~/lib/content-publication";
import { useLocale, translate, resolveLocale } from "~/lib/i18n";
import {
  loadPublicProfile,
  loadPublicProfiles,
  publicProfileHref,
} from "~/lib/public-profile";
import { isUuid, siteOrigin } from "~/lib/http";
import { socialImageMeta } from "~/lib/social-meta";
import { DEBATE_COMMENT_PAGE_SIZE } from "~/lib/debate-comments";
import {
  focusLinkedDebateComment,
  linkedDebateCommentTarget,
} from "~/lib/debate-comment-focus";
import { getViewer, supabase } from "~/lib/session";
import { createAdminSupabase } from "~/lib/supabase";
import { useLocaleLoader } from "../../layout";

/**
 * Comentarios que trae cada columna.
 *
 * Antes había además un `COMMENT_FETCH_LIMIT` global de 400: se pedían los
 * mejores 400 del debate entero y recién después se repartían. Con muchas
 * sub-comunidades, las que no acumulaban votos se quedaban sin ninguno
 * —un país con 200 provincias habría necesitado 4.000 comentarios para llenar
 * todas las columnas—, que es justo lo contrario de lo que la grilla promete.
 * `debate_column_comments` aplica el tope por columna (D66), así que este
 * número ya no compite contra nada.
 */
const PER_COLUMN = DEBATE_COMMENT_PAGE_SIZE;

interface DebateDetail {
  debate: Tables<"debates">;
  community: CommunityRef;
  chain: CommunityRef[];
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  columns: DebateColumnData[];
  myColumnId: string | null;
  residence: CommunityRef | null;
  canVote: boolean;
  isAuthenticated: boolean;
  canManage: boolean;
  isAuthor: boolean;
  aiSummary: AiSummaryView | null;
  aiSummaryEnabled: boolean;
  extensions: ContentExtensions;
  socialImage: string;
  ogImage: string;
  linkedCommentMissing: boolean;
}

export const useDebate = routeLoader$<DebateDetail>(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "No encontramos ese debate."),
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
   * El embed nombra el constraint y no sólo la tabla: hoy `debates` tiene una
   * sola clave foránea a `communities` y bastaría con el nombre, pero el día
   * que se agregue una segunda —como ya le pasó a `claims` con
   * `escalated_to_community_id`— esto seguiría apuntando a donde debe en vez
   * de volverse ambiguo. El `select` va en un literal de una pieza porque
   * supabase-js deriva los tipos del embed parseando esta cadena.
   */
  const { data: row, error: debateError } = await db
    .from("debates")
    .select(
      "*, community:communities!debates_community_id_fkey(id, slug, name, emoji, level, path)",
    )
    .eq("id", ev.params.id)
    .maybeSingle();
  // Un fallo de la base no es un debate inexistente: un 404 lo deja fuera del
  // índice de los buscadores por un error pasajero.
  if (debateError) throw ev.error(500, translate(locale, LOAD_FAILED));
  if (!row) {
    throw ev.error(404, translate(locale, "No encontramos ese debate."));
  }

  // El embed se separa de la fila: `debate` sigue siendo exactamente una fila de
  // `debates` y ninguna vista recibe un campo de más.
  const community = row.community;
  const debate = omitKeys(row, "community");
  if (!community)
    throw ev.error(
      404,
      translate(locale, "No encontramos la comunidad de ese debate."),
    );

  const segments = community.path.split(".");

  const [chainRes, childrenRes, countsRes, commentsRes, authorRes] =
    await Promise.all([
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .in(
          "path",
          segments.map((_, i) => segments.slice(0, i + 1).join(".")),
        )
        .order("level", { ascending: true }),
      // Las columnas son exactamente los hijos directos de la comunidad del debate.
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .eq("parent_id", community.id),
      db.rpc("debate_column_counts", { p_debate: debate.id }),
      db.rpc("debate_column_comments", {
        p_debate: debate.id,
        p_per_column: PER_COLUMN,
      }),
      loadPublicProfile(db, debate.author_id),
    ]);

  const children = childrenRes.data ?? [];
  const commentRows = [...(commentsRes.data ?? [])];
  const linkedComment = ev.url.searchParams.get("comentario");
  if (
    linkedComment &&
    isUuid(linkedComment) &&
    !commentRows.some((comment) => comment.id === linkedComment)
  ) {
    // Una sola lectura puntual preserva el enlace aunque cambie el ranking.
    // RLS y el filtro visible impiden recuperar aportes retirados por su URL.
    const { data: linkedRow, error: linkedError } = await db
      .from("debate_comments")
      .select("id, body, score, created_at, user_id, column_community_id")
      .eq("id", linkedComment)
      .eq("debate_id", debate.id)
      .eq("status", "visible")
      .maybeSingle();
    if (linkedError) throw ev.error(500, translate(locale, LOAD_FAILED));
    if (
      linkedRow &&
      children.some((child) => child.id === linkedRow.column_community_id)
    ) {
      commentRows.push(linkedRow);
    }
  }
  const linkedCommentMissing = Boolean(
    linkedComment &&
    !commentRows.some((comment) => comment.id === linkedComment),
  );
  const publicProfiles = await loadPublicProfiles(
    db,
    commentRows.map((comment) => comment.user_id),
  );

  // Votos propios, para pintar las flechas ya usadas.
  const myVotes = new Map<string, -1 | 0 | 1>();
  if (viewer.userId) {
    const commentIds = commentRows.map((c) => c.id);
    if (commentIds.length > 0) {
      const { data: votes } = await db
        .from("comment_votes")
        .select("comment_id, value")
        .eq("user_id", viewer.userId)
        .in("comment_id", commentIds);
      for (const v of votes ?? []) myVotes.set(v.comment_id, v.value as -1 | 1);
    }
  }

  const countByColumn = new Map(
    (countsRes.data ?? []).map((r) => [
      r.column_community_id,
      Number(r.comment_count),
    ]),
  );

  // La RPC ya devuelve como mucho `PER_COLUMN` por columna, así que acá sólo
  // se agrupa: el recorte que antes se hacía en este bucle ahora vive en el
  // `LATERAL`, que es donde puede ser justo con cada sub-comunidad.
  const commentsByColumn = new Map<string, DebateCommentData[]>();
  for (const row of commentRows) {
    const list = commentsByColumn.get(row.column_community_id) ?? [];
    list.push({
      id: row.id,
      body: row.body,
      score: row.score,
      created_at: row.created_at,
      author: publicProfiles.get(row.user_id) ?? null,
      myVote: myVotes.get(row.id) ?? 0,
    });
    commentsByColumn.set(row.column_community_id, list);
  }

  const columns: DebateColumnData[] = children
    .map((child) => {
      const comments = commentsByColumn.get(child.id) ?? [];
      const commentCount = countByColumn.get(child.id) ?? 0;
      return {
        id: child.id,
        name: child.name,
        slug: child.slug,
        position: 0,
        commentCount,
        comments,
        truncated: commentCount > comments.length,
      };
    })
    .sort((a, b) => compareNames(a.name, b.name, locale))
    .map((column, index) => ({ ...column, position: index + 1 }));

  // La columna del usuario es el hijo directo que contiene su residencia.
  const myColumn = viewer.homePath
    ? children.find(
        (c) =>
          viewer.homePath === c.path ||
          viewer.homePath!.startsWith(`${c.path}.`),
      )
    : undefined;

  const aiSummaryPromise = (() => {
    try {
      return loadAiSummary(
        db,
        createAdminSupabase(ev),
        "debate",
        debate.id,
        locale,
      );
    } catch {
      return Promise.resolve(null);
    }
  })();
  const [extensions, aiSummary] = await Promise.all([
    loadContentExtensions(
      db,
      "debate",
      debate.id,
      viewer.userId,
      selectedRelationFromUrl(ev.url, "debate", debate.id),
    ),
    aiSummaryPromise,
  ]);
  const siteUrl = siteOrigin(ev);

  return {
    debate,
    community,
    chain: chainRes.data ?? [],
    author: authorRes,
    columns,
    myColumnId: myColumn?.id ?? null,
    residence: viewer.residenceChain.at(-1) ?? null,
    canVote:
      !!viewer.homePath &&
      (viewer.homePath === community.path ||
        viewer.homePath.startsWith(`${community.path}.`)),
    isAuthenticated: !!viewer.userId,
    ...contentPermissions(viewer, debate.author_id),
    aiSummary,
    aiSummaryEnabled: isAiSummaryConfigured(ev.env),
    extensions,
    socialImage: `${siteUrl}/social/debate/${debate.id}?locale=${locale}`,
    ogImage: `${siteUrl}/og.png`,
    linkedCommentMissing,
  };
});

export const useAddRelation = routeAction$(
  (data, ev) => addContentRelation(data, ev),
  { validation: [zod$(relationSchema)], invalidate: [useDebate] },
);
export const useAddSource = routeAction$(
  (data, ev) => addContentSource(data, ev),
  { validation: [zod$(sourceSchema)], invalidate: [useDebate] },
);
export const useInstitutionalResponse = routeAction$(
  (data, ev) => postInstitutionalResponse(data, ev),
  { validation: [zod$(institutionalResponseSchema)], invalidate: [useDebate] },
);

export default component$(() => {
  const addSource = useAddSource();
  const addRelation = useAddRelation();
  const institutionalResponse = useInstitutionalResponse();
  const locale = useLocale();
  const data = useDebate();
  const location = useLocation();
  const debateArticle = useSignal<HTMLElement>();
  const focusedCommentLink = useSignal("");

  // El hash puede llegar antes que la tarjeta dentro del carrusel y su lista.
  // eslint-disable-next-line qwik/no-use-visible-task -- foco tras el commit final de una navegación explícita a un comentario
  useVisibleTask$(
    ({ track, cleanup }) => {
      const url = track(() => location.url);
      const navigating = track(() => location.isNavigating);
      const columns = track(() => data.value.columns);
      const scope = track(() => debateArticle.value);
      const targetId = linkedDebateCommentTarget(url);
      if (!targetId) {
        focusedCommentLink.value = "";
        return;
      }
      if (
        navigating ||
        !scope ||
        focusedCommentLink.value === url.href ||
        !columns.some((column) =>
          column.comments.some(
            (comment) => `comment-${comment.id}` === targetId,
          ),
        )
      )
        return;
      const frame = requestAnimationFrame(() => {
        if (focusLinkedDebateComment(scope, targetId)) {
          focusedCommentLink.value = url.href;
        }
      });
      cleanup(() => cancelAnimationFrame(frame));
    },
    { strategy: "document-ready" },
  );
  const {
    debate,
    community,
    chain,
    author,
    columns,
    myColumnId,
    residence,
    canVote,
    isAuthenticated,
  } = data.value;
  // Primera visita de la autoría después de publicar: el parámetro se puede
  // compartir, así que a otra persona no se le muestra nada.
  const justPublished =
    data.value.isAuthor &&
    location.url.searchParams.get(PUBLISHED_PARAM) === "1";

  const isFocusMode = useSignal(false);
  const commentDraft = useSignal("");
  const authorName =
    author?.display_name ??
    author?.username ??
    translate(locale, "Cuenta eliminada");
  const isOpen = debate.status === "open";
  const totalComments = columns.reduce(
    (sum, column) => sum + column.commentCount,
    0,
  );
  // La columna lateral sólo lleva el resumen de IA, apagado en el lanzamiento
  // (AiSummaryCard no dibuja nada). Sin él, la cabecera ocupaba 7/12 junto a
  // un hueco: misma regla que el `hasAside` de la encuesta.
  const hasAside =
    !isFocusMode.value &&
    (data.value.aiSummaryEnabled || !!data.value.aiSummary);
  const myColumnName =
    columns.find((column) => column.id === myColumnId)?.name ?? community.name;

  return (
    <div class="container-content py-8">
      {/* Barra fija del modo foco: la etiqueta en oración normal y la salida
          como botón del sistema, no uno dibujado a mano. */}
      {isFocusMode.value && (
        <div class="sticky top-16 z-30 mb-6 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/40 bg-surface/90 px-4 py-3 shadow-lift backdrop-blur-md">
          <div class="flex min-w-0 items-center gap-2.5">
            <Icon name="book-open" class="shrink-0 text-lg text-brand" />
            <div class="min-w-0">
              <p class="text-xs font-semibold text-brand">
                {translate(locale, "Modo lectura y foco")}
              </p>
              <p
                dir="auto"
                class="truncate text-sm font-semibold text-ink-strong"
              >
                {debate.title}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            class="shrink-0"
            onClick$={() => {
              triggerHapticFeedback("selection");
              isFocusMode.value = false;
            }}
          >
            {translate(locale, "Salir del modo foco")}
          </Button>
        </div>
      )}

      {!isFocusMode.value && (
        <CommunityBreadcrumb chain={chain} currentIsLink class="mb-5" />
      )}

      <article ref={debateArticle}>
        {justPublished && (
          <PublishedNextSteps
            kind="debate"
            title={debate.title}
            url={routes.debate(debate.id)}
            communityName={community.name}
          />
        )}
        {/* Dos columnas sólo si hay algo al costado; si no, una sola con el
            ancho entero, que la grilla de abajo necesita. */}
        <div
          class={cx("grid gap-6", hasAside && "lg:grid-cols-12 lg:items-start")}
        >
          {/* Franja superior con el verde azulado del tipo (D123). */}
          <header
            class={cx(
              "min-w-0 border-t-4 border-t-kind-debate pt-5",
              hasAside && "lg:col-span-7 xl:col-span-8",
            )}
          >
            {/* Tres insignias como máximo, como la encuesta: tipo, estado y
                lectura. "Debate abierto" repetía el tipo, y los conteos son
                datos: van en la línea de abajo, atenuados (D123). */}
            <div
              data-detail-badges
              class="mb-2.5 flex flex-wrap items-center gap-2"
            >
              <Chip
                variant="badge"
                icon={CONTENT_KINDS.debate.icon}
                toneClass={CONTENT_KIND_TONES.debate.badge}
              >
                {translate(locale, CONTENT_KINDS.debate.label)}
              </Chip>
              <Badge tone={isOpen ? "success" : "neutral"}>
                {isOpen
                  ? translate(locale, "Abierto")
                  : translate(locale, "Cerrado")}
              </Badge>
              <Badge tone="neutral">
                <Icon name="clock" />{" "}
                {translate(locale, "~{{count}} min de lectura", {
                  count: Math.max(
                    1,
                    Math.ceil(debate.body.trim().split(/\s+/).length / 180),
                  ),
                })}
              </Badge>
            </div>

            <h1 dir="auto" class="text-display-lg sm:text-display-xl">
              {debate.title}
            </h1>

            {/* Prosa larga: en una sola columna, sin `measure`, corría los
                96 rem del contenedor. */}
            <p
              dir="auto"
              class="ugc-text measure mt-3.5 whitespace-pre-line leading-relaxed text-ink-muted text-base sm:text-lg"
            >
              {debate.body}
            </p>

            <MetaLine class="mt-5 text-sm text-ink-faint">
              {/* El avatar y el nombre son un solo dato. */}
              <span class="inline-flex items-center gap-2">
                <Avatar src={author?.avatar_url} name={authorName} size="sm" />
                {author ? (
                  <Link
                    href={publicProfileHref(author)}
                    dir="auto"
                    class="text-ink-muted hover:text-brand hover:underline"
                  >
                    {authorName}
                  </Link>
                ) : (
                  <span dir="auto" class="text-ink-muted">
                    {authorName}
                  </span>
                )}
              </span>
              <span>
                <RelativeTime value={debate.created_at} />
              </span>
              <span>
                <Link
                  href={routes.community(community.slug)}
                  class="font-medium text-brand hover:underline"
                >
                  {community.emoji} {community.name}
                </Link>
              </span>
              {/* Cuánta conversación hay acá adentro: desde la ficha no había
                  forma de saber si el debate estaba vivo o vacío sin bajar a
                  la grilla. Es un dato, así que va atenuado como el resto de
                  la línea, ni en violeta ni en verde (D123). */}
              <span class="tabular-nums">
                {pluralize(columns.length, "columna", "columnas", locale)}
              </span>
              <span class="tabular-nums">
                {totalComments === 0
                  ? translate(locale, "Todavía sin comentarios")
                  : pluralize(
                      totalComments,
                      "comentario",
                      "comentarios",
                      locale,
                    )}
              </span>
              {/* Desde un debate compartido por mensaje no había ninguna puerta
                  al resto: la miga de pan lleva a la comunidad, pero no a sus
                  otros debates, que es lo que se busca al terminar de leer. */}
              <span>
                <Link
                  href={`${routes.community(community.slug)}/debates`}
                  class="font-medium text-brand hover:underline"
                >
                  {translate(locale, "Ver todos los debates")}
                </Link>
              </span>
            </MetaLine>

            {/* Barra con jerarquía (D124): la acción de la página primero,
                después guardar y compartir, y las herramientas propias del
                debate como botones fantasma con ícono. "Comentar" vivía
                escondido en la nota de abajo, pintado a mano en verde. */}
            <div class="mt-4 flex flex-wrap items-center gap-2">
              {/* La caja para comentar está en la columna propia, más abajo y
                  dentro del carrusel: este acceso la trae a la vista y la
                  enfoca. Sin JavaScript, el ancla igual lleva hasta ella. */}
              {myColumnId && isOpen && (
                <a
                  href={`#comentario-${myColumnId}`}
                  preventdefault:click
                  onClick$={() => {
                    const field = document.getElementById(
                      `comentario-${myColumnId}`,
                    );
                    field?.scrollIntoView({
                      block: "center",
                      inline: "start",
                    });
                    field?.focus({ preventScroll: true });
                  }}
                  class={buttonClass("primary", "sm")}
                >
                  <Icon name="chat" class="text-base" />
                  {translate(locale, "Comentar desde {{name}}", {
                    name: myColumnName,
                  })}
                </a>
              )}
              <DetailActions
                type="debate"
                id={debate.id}
                title={debate.title}
                url={`/debates/${debate.id}`}
                communityName={community.name}
                class=""
              />
              {/* `aria-pressed` dice si el modo está puesto; el fondo lo
                  acompaña para quien lo ve. */}
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={isFocusMode.value}
                title={translate(locale, "Modo lectura sin distracciones")}
                class="aria-pressed:bg-muted aria-pressed:text-ink-strong"
                onClick$={() => {
                  triggerHapticFeedback("selection");
                  isFocusMode.value = !isFocusMode.value;
                }}
              >
                <Icon name="book-open" class="text-base" />
                {translate(locale, "Modo lectura")}
              </Button>
              <AssemblyProjectorModal
                title={debate.title}
                subtitle={debate.body}
                communityName={community.name}
                kind="debate"
                items={
                  columns.length > 0
                    ? columns.map((col) => ({
                        id: col.id,
                        title: col.name,
                        subtitle:
                          col.comments[0]?.body ??
                          translate(
                            locale,
                            "Sin intervenciones aún en esta columna",
                          ),
                        count: col.commentCount,
                      }))
                    : [
                        {
                          id: debate.id,
                          title: debate.title,
                          subtitle: debate.body,
                        },
                      ]
                }
              />
            </div>

            {/* "Cómo participar" era una tarjeta en la columna lateral que
                  competía con el título (D124). Ahora es una nota bajo los
                  datos del debate, con el mismo texto condicional. */}
            <div class="measure mt-4 flex gap-2.5 rounded-xl bg-muted/60 p-3 text-sm text-ink-muted">
              <Icon name="info" class="mt-0.5 shrink-0 text-base text-brand" />
              <div class="min-w-0 flex-1 space-y-2">
                <p class="font-semibold text-ink-strong">
                  {translate(locale, "Cómo participar")}
                </p>
                <p class="leading-relaxed">
                  {translate(
                    locale,
                    "Hay una columna por cada sub-comunidad de {{community}}.",
                    {
                      community: community.name,
                    },
                  )}{" "}
                  {myColumnId
                    ? translate(
                        locale,
                        "Tu residencia principal es {{residence}}; por eso escribís en la columna marcada como Tu comunidad y podés leer todas las demás.",
                        { residence: residence?.name ?? "" },
                      )
                    : isAuthenticated
                      ? residence
                        ? translate(
                            locale,
                            "Tu residencia principal actual, {{residence}}, no pertenece a este territorio. Revisala para habilitar la columna que te corresponde.",
                            { residence: residence.name },
                          )
                        : translate(
                            locale,
                            "Tu residencia principal actual no pertenece a este territorio. Revisala para habilitar la columna que te corresponde.",
                          )
                      : translate(
                          locale,
                          "Creá una cuenta y declará tu residencia principal para escribir en la columna que te corresponde.",
                        )}
                </p>

                {!myColumnId && isAuthenticated && (
                  <div class="pt-1">
                    <ButtonLink
                      href={`/perfil/residencia?parent=${community.slug}`}
                      variant="secondary"
                      size="sm"
                    >
                      {translate(locale, "Revisar mi residencia")}
                    </ButtonLink>
                  </div>
                )}
                {/* El aviso para visitantes vivía en la columna lateral,
                    repetía el texto de arriba y sumaba un segundo "Crear
                    cuenta" primario al lado del "Sumate" del header (D125).
                    Quedan sus dos enlaces, con los mismos destinos. */}
                {!isAuthenticated && (
                  <div class="flex flex-wrap gap-2 pt-1">
                    <ButtonLink
                      href={withAuthNext("/registro", routes.debate(debate.id))}
                      variant="secondary"
                      size="sm"
                    >
                      {translate(locale, "Crear cuenta")}
                    </ButtonLink>
                    {/* Quien ya tiene cuenta era empujado a crearse otra: el
                        `next` devuelve al debate en vez de al inicio. */}
                    <ButtonLink
                      href={`/ingresar?next=${encodeURIComponent(routes.debate(debate.id))}`}
                      variant="ghost"
                      size="sm"
                    >
                      {translate(locale, "Ingresar")}
                    </ButtonLink>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Columna lateral: el resumen de IA, oculto en modo foco. Sólo se
              arma si hay algo que mostrar (`hasAside`). */}
          {hasAside && (
            <div class="space-y-4 lg:col-span-5 xl:col-span-4">
              <AiSummaryCard
                summary={data.value.aiSummary}
                enabled={data.value.aiSummaryEnabled}
                contentType="debate"
                contentId={debate.id}
                isAuthenticated={isAuthenticated}
              />
            </div>
          )}
        </div>

        {/* Grilla y carrusel de columnas territoriales */}
        <div class="mt-10 border-t border-subtle pt-6">
          {data.value.linkedCommentMissing && (
            <Alert class="mb-4">
              {translate(
                locale,
                "El comentario enlazado no está disponible en este debate.",
              )}
            </Alert>
          )}
          {columns.length > 0 && (
            <div class="mb-6 space-y-4">
              <DebateConsensusCard
                columns={columns}
                myColumnId={myColumnId}
                communityName={community.name}
              />
              <DebateQuotesDrawer
                columns={columns}
                debateTitle={debate.title}
                replyColumn={
                  isOpen
                    ? columns.find((column) => column.id === myColumnId)
                    : undefined
                }
                replyDraft={isOpen && myColumnId ? commentDraft : undefined}
              />
            </div>
          )}

          {columns.length === 0 ? (
            // Un debate sin columnas es un vacío, no un error de la persona
            // que lo mira: una alerta naranja lo hacía sentir culpa ajena
            // (D124). El aviso a moderación sigue, como texto y con el botón
            // de reportar que ya está al pie.
            <EmptyState
              illustration="people"
              title="Este debate no tiene columnas"
              description="Esta comunidad no tiene sub-comunidades, así que no hay dónde escribir. No debería haberse podido crear: avisale a moderación con el botón de reportar."
            >
              <ButtonLink
                href="#reportar-contenido"
                variant="secondary"
                size="sm"
              >
                <Icon name="flag" />
                {translate(locale, "Reportar contenido")}
              </ButtonLink>
            </EmptyState>
          ) : (
            <DebateGrid
              columns={columns}
              debateId={debate.id}
              myColumnId={myColumnId}
              canVote={canVote}
              isAuthenticated={isAuthenticated}
              debateOpen={isOpen}
              commentDraft={commentDraft}
            />
          )}
        </div>

        <div class="mt-10 border-t border-subtle pt-8">
          <ContentExtensionsPanel
            addRelation={addRelation}
            addSource={addSource}
            respond={institutionalResponse}
            key={debate.id}
            type="debate"
            id={debate.id}
            data={data.value.extensions}
            canManage={data.value.canManage}
          />

          <RemoveContentButton
            type="debate"
            id={debate.id}
            isAuthor={data.value.isAuthor}
            createdAt={debate.created_at}
            backHref={`${routes.community(community.slug)}/debates`}
          />

          <div id="reportar-contenido" class="mt-8 scroll-mt-24">
            <ReportButton
              targetType="debate"
              targetId={debate.id}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </article>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useDebate);
  const locale = resolveValue(useLocaleLoader);
  const title = data?.debate.title ?? translate(locale, "Debate");
  const description = (data?.debate.body ?? "").slice(0, 180);

  return {
    title: `${title} · ${APP_NAME}`,
    meta: [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      ...socialImageMeta(data?.ogImage ?? "", title),
    ],
  };
};
