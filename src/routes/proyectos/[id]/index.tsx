import {
  loadProjectCommentPage,
  projectCommentCursor,
  projectCommentsPageHref,
  projectCommentRefreshHref,
} from "~/lib/project-comments-page";
import {
  addProjectMilestone,
  updateProjectMilestone,
  addProjectTask,
  updateProjectTask,
  offerProjectContribution,
  updateProjectContribution,
  updateProjectStatus,
  milestoneSchema,
  milestoneStatusSchema,
  taskSchema,
  taskStatusSchema,
  contributionSchema,
  contributionStatusSchema,
  projectStatusSchema,
} from "~/lib/project-execution-actions";
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
  useComputed$,
  useSignal,
  useVisibleTask$,
  sync$,
  type QRL,
  type ReadonlySignal,
} from "@qwik.dev/core";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  useNavigate,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { AiSummaryCard } from "~/components/content/AiSummaryCard";
import { ContentExtensionsPanel } from "~/components/content/ContentExtensionsPanel";
import { RemoveContentButton } from "~/components/content/RemoveContentButton";
import { DetailActions } from "~/components/content/DetailActions";
import { ReportButton } from "~/components/moderation/ReportButton";
import {
  PledgePanel,
  type PledgeEntry,
} from "~/components/projects/PledgePanel";
import { ProjectExecution } from "~/components/projects/ProjectExecution";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  Chip,
  Icon,
  SubmitButton,
  Textarea,
  buttonClass,
  cx,
  MetaLine,
} from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { loadAiSummary, isAiSummaryConfigured } from "~/lib/ai-summary";
import type { CommunityRef } from "~/lib/community";
import { routes } from "~/lib/community";
import { omitKeys } from "~/lib/embed";
import {
  APP_NAME,
  LOAD_FAILED,
  ORGANIZATIONS_LIMIT,
  PROJECT_STATUS_LABEL,
} from "~/lib/constants";
import { loadContentExtensions } from "~/lib/content-extensions";
import { selectedRelationFromUrl } from "~/lib/relation-picker";
import type { ProjectStatus, Tables } from "~/lib/database.types.helpers";
import { formatMoney } from "~/lib/format";
import {
  useLocale,
  DEFAULT_LOCALE,
  resolveLocale,
  translate,
} from "~/lib/i18n";
import {
  loadPublicProfile,
  loadPublicProfiles,
  publicProfileHref,
} from "~/lib/public-profile";
import {
  postProjectComment,
  projectCommentSchema,
  pledgeSchema,
  setProjectPledge,
} from "~/lib/project-actions";
import { siteOrigin } from "~/lib/http";
import { projectIdFromRoute } from "~/lib/project-route-id";
import { socialImageMeta } from "~/lib/social-meta";
import { getViewer, supabase } from "~/lib/session";
import { logFailure } from "~/lib/log";
import { createAdminSupabase } from "~/lib/supabase";
import { PublishedNextSteps } from "~/components/content/PublishedNextSteps";
import { ProjectStageStrip } from "~/components/projects/ProjectStageStrip";
import { contentPermissions } from "~/lib/content-permissions";
import { PUBLISHED_PARAM } from "~/lib/content-publication";
import { useLocaleLoader } from "~/routes/layout";

interface QaEntry {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  isAuthorReply: boolean;
  author: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface ProjectCommentReceipt {
  commentId: string;
  projectId: string;
  parentId: string;
}

export const useProject = routeLoader$(
  async (ev) => {
    const projectId = projectIdFromRoute(ev.params, ev.url);
    if (!projectId) {
      throw ev.error(
        404,
        translate(resolveLocale(ev.locale()), "No encontramos ese proyecto."),
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
     * El embed nombra el constraint y no sólo la tabla: hoy `projects` tiene una
     * sola clave foránea a `communities` y bastaría con el nombre, pero el día
     * que se agregue una segunda —como ya le pasó a `claims` con
     * `escalated_to_community_id`— esto seguiría apuntando a donde debe en vez
     * de volverse ambiguo. El `select` va en un literal de una pieza porque
     * supabase-js deriva los tipos del embed parseando esta cadena.
     */
    const { data: row, error: projectError } = await db
      .from("projects")
      .select(
        "*, community:communities!projects_community_id_fkey(id, slug, name, emoji, level, path)",
      )
      .eq("id", projectId)
      .maybeSingle();
    // Un fallo de la base no es un proyecto inexistente: un 404 la deja fuera del
    // índice de los buscadores por un error pasajero.
    if (projectError) throw ev.error(500, translate(locale, LOAD_FAILED));
    if (!row) {
      throw ev.error(404, translate(locale, "No encontramos ese proyecto."));
    }

    // El embed se separa de la fila: `project` sigue siendo exactamente una fila de
    // `projects` y ninguna vista recibe un campo de más.
    const community = row.community;
    const project = omitKeys(row, "community");
    if (!community)
      throw ev.error(
        404,
        translate(locale, "No encontramos la comunidad de ese proyecto."),
      );

    const segments = community.path.split(".");
    const aiSummaryPromise = (() => {
      try {
        return loadAiSummary(
          db,
          createAdminSupabase(ev),
          "project",
          project.id,
          locale,
        );
      } catch {
        return Promise.resolve(null);
      }
    })();

    const [
      chainRes,
      pledgesRes,
      pledgeCountsRes,
      myPledgeRes,
      commentsPage,
      milestonesRes,
      tasksRes,
      contributionsRes,
      organizationsRes,
      extensions,
      aiSummary,
    ] = await Promise.all([
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .in(
          "path",
          segments.map((_, i) => segments.slice(0, i + 1).join(".")),
        )
        .order("level", { ascending: true }),
      db.rpc("project_public_pledges", {
        p_project: project.id,
        p_limit: 50,
      }),
      db.rpc("project_pledge_counts", { p_projects: [project.id] }),
      viewer.userId
        ? db
            .from("project_pledges")
            .select("amount, message")
            .eq("project_id", project.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      loadProjectCommentPage(
        db,
        project.id,
        projectCommentCursor(ev.url.searchParams),
        (ev.sharedMap.get("project:posted-comment") as string | undefined) ??
          ev.url.searchParams.get("mensaje"),
      ),
      db
        .from("project_milestones")
        .select("*")
        .eq("project_id", project.id)
        .order("sort_order"),
      db
        .from("project_tasks")
        .select(
          "id, project_id, milestone_id, title, description, assigned_organization_id, skills_needed, due_date, status, created_at",
        )
        .eq("project_id", project.id)
        .order("created_at"),
      db
        .from("project_contributions")
        .select(
          "id, project_id, kind, description, quantity, unit, status, created_at, updated_at",
        )
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
      db
        .from("organizations")
        .select("id, name")
        .not("verified_at", "is", null)
        .order("name")
        .limit(ORGANIZATIONS_LIMIT),
      loadContentExtensions(
        db,
        "project",
        project.id,
        viewer.userId,
        selectedRelationFromUrl(ev.url, "project", project.id),
      ),
      aiSummaryPromise,
    ]);

    const [author, publicProfiles] = await Promise.all([
      loadPublicProfile(db, project.author_id),
      loadPublicProfiles(
        db,
        commentsPage.rows.map((comment) => comment.user_id),
      ),
    ]);

    const pledges: PledgeEntry[] = (pledgesRes.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      message: p.message,
      created_at: p.created_at,
      author: p.author_username
        ? {
            username: p.author_username,
            display_name: p.author_display_name,
            avatar_url: p.author_avatar_url,
          }
        : null,
    }));

    const myPledgeRow = myPledgeRes.data;
    if (myPledgeRes.error)
      logFailure({ scope: "proyectos/mi-compromiso" }, myPledgeRes.error);
    const pledgeCountRow = pledgeCountsRes.data?.find(
      (entry) => entry.project_id === project.id,
    );

    // Las respuestas del autor se destacan: es la señal de que el proyecto está vivo.
    const comments: QaEntry[] = commentsPage.rows.map((c) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      parent_id: c.parent_id,
      isAuthorReply: !!project.author_id && c.user_id === project.author_id,
      author: publicProfiles.get(c.user_id) ?? null,
    }));

    const siteUrl = siteOrigin(ev);

    return {
      project: project as Tables<"projects">,
      community,
      chain: (chainRes.data ?? []) as CommunityRef[],
      author,
      pledges,
      pledgeCount:
        !pledgeCountsRes.error && pledgeCountRow
          ? Number(pledgeCountRow.pledge_count)
          : null,
      myPledge: myPledgeRow
        ? { amount: Number(myPledgeRow.amount), message: myPledgeRow.message }
        : null,
      myPledgeLoadFailed: !!myPledgeRes.error,
      comments,
      commentsPageFailed: commentsPage.failed,
      commentsNext: commentsPage.next,
      commentsHasCursor: !!projectCommentCursor(ev.url.searchParams),
      commentsPageSize: commentsPage.pageSize,
      ...contentPermissions(viewer, project.author_id),
      canModerate: viewer.isModerator,
      milestones: milestonesRes.data ?? [],
      tasks: tasksRes.data ?? [],
      contributions: contributionsRes.data ?? [],
      // Sin esto, un fallo de la consulta se dibujaba como "nadie ofreció
      // nada" (D74). Sólo se expone el fallo; la consulta no cambia.
      contributionsLoadFailed: !!contributionsRes.error,
      organizations: organizationsRes.data ?? [],
      extensions,
      aiSummary,
      aiSummaryEnabled: isAiSummaryConfigured(ev.env),
      socialImage: `${siteUrl}/social/project/${project.id}?locale=${locale}`,
      ogImage: `${siteUrl}/og.png`,
      isMember:
        !!viewer.homePath &&
        (viewer.homePath === community.path ||
          viewer.homePath.startsWith(`${community.path}.`)),
      isAuthenticated: !!viewer.userId,
    };
  },
  { search: ["qa_antes", "qa_id", "mensaje", "vincular_tipo", "vincular_id"] },
);

// El modo estricto no revalida loaders implícitamente. El Q&A necesita volver
// a leer las preguntas para mostrar la fila confirmada y sus respuestas.
export const useProjectComment = routeAction$(
  async (data, ev) => {
    const result = await postProjectComment(data, ev);
    if ("posted" in result)
      ev.sharedMap.set("project:posted-comment", result.commentId);
    return result;
  },
  {
    validation: [zod$(projectCommentSchema)],
    invalidate: [useProject],
  },
);

export const useAddMilestone = routeAction$(
  (data, ev) => addProjectMilestone(data, ev),
  { validation: [zod$(milestoneSchema)], invalidate: [useProject] },
);
export const useUpdateMilestone = routeAction$(
  (data, ev) => updateProjectMilestone(data, ev),
  { validation: [zod$(milestoneStatusSchema)], invalidate: [useProject] },
);
export const useAddTask = routeAction$((data, ev) => addProjectTask(data, ev), {
  validation: [zod$(taskSchema)],
  invalidate: [useProject],
});
export const useUpdateTask = routeAction$(
  (data, ev) => updateProjectTask(data, ev),
  { validation: [zod$(taskStatusSchema)], invalidate: [useProject] },
);
export const useOfferContribution = routeAction$(
  (data, ev) => offerProjectContribution(data, ev),
  { validation: [zod$(contributionSchema)], invalidate: [useProject] },
);
export const useUpdateContribution = routeAction$(
  (data, ev) => updateProjectContribution(data, ev),
  { validation: [zod$(contributionStatusSchema)], invalidate: [useProject] },
);
export const useUpdateProjectStatus = routeAction$(
  (data, ev) => updateProjectStatus(data, ev),
  { validation: [zod$(projectStatusSchema)], invalidate: [useProject] },
);

export const usePledge = routeAction$(
  (data, ev) => setProjectPledge(data, ev),
  {
    validation: [zod$(pledgeSchema)],
    invalidate: [useProject],
  },
);

export const useAddRelation = routeAction$(
  (data, ev) => addContentRelation(data, ev),
  { validation: [zod$(relationSchema)], invalidate: [useProject] },
);
export const useAddSource = routeAction$(
  (data, ev) => addContentSource(data, ev),
  { validation: [zod$(sourceSchema)], invalidate: [useProject] },
);
export const useInstitutionalResponse = routeAction$(
  (data, ev) => postInstitutionalResponse(data, ev),
  { validation: [zod$(institutionalResponseSchema)], invalidate: [useProject] },
);

export default component$(() => {
  const executionActions = {
    addMilestone: useAddMilestone(),
    updateMilestone: useUpdateMilestone(),
    addTask: useAddTask(),
    updateTask: useUpdateTask(),
    offer: useOfferContribution(),
    updateContribution: useUpdateContribution(),
    updateProjectStatus: useUpdateProjectStatus(),
  };
  const addSource = useAddSource();
  const addRelation = useAddRelation();
  const institutionalResponse = useInstitutionalResponse();
  const data = useProject();
  const comment = useProjectComment();
  const pledge = usePledge();
  const locale = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const handledComment = useSignal(
    comment.value?.posted ? comment.value.commentId : "",
  );
  // La relectura por URL limpia la acción. Conservamos sólo el recibo del
  // envío propio; el contenido y su visibilidad siempre vienen del loader.
  const confirmedComment = useSignal<ProjectCommentReceipt | undefined>(
    comment.value?.posted &&
      comment.formData?.get("project_id") === data.value.project.id
      ? {
          commentId: comment.value.commentId,
          projectId: data.value.project.id,
          parentId: comment.formData.get("parent_id")?.toString() ?? "",
        }
      : undefined,
  );
  // La invalidación SPA lee el loader en otra petición: sharedMap sólo cubre
  // el POST HTML. La URL conserva el cursor y deja que RLS relea el destino.
  // eslint-disable-next-line qwik/no-use-visible-task -- navegación tras confirmar y terminar la revalidación del formulario
  useVisibleTask$(
    ({ track }) => {
      const result = track(() => comment.value);
      const running = track(() => comment.isRunning);
      const navigating = track(() => location.isNavigating);
      // El id sale de la URL y no del loader. Leer `data.value` acá, apenas
      // cargada la página, hacía que el router volviera a pedir el loader y
      // redibujara todo medio segundo después, pisando lo que la persona ya
      // había tocado en los formularios de ejecución (D99). El loader sólo
      // hace falta con un comentario confirmado, para saber si ya aparece.
      const routeProjectId = projectIdFromRoute({}, location.url);
      if (
        running ||
        (result && !result.posted) ||
        (confirmedComment.value &&
          confirmedComment.value.projectId !== routeProjectId)
      ) {
        confirmedComment.value = undefined;
      }
      if (
        !result?.posted ||
        running ||
        comment.formData?.get("project_id") !== routeProjectId
      )
        return;
      const current = track(() => data.value);
      if (current.project.id !== routeProjectId) return;
      if (confirmedComment.value?.commentId !== result.commentId) {
        confirmedComment.value = {
          commentId: result.commentId,
          projectId: current.project.id,
          parentId: comment.formData.get("parent_id")?.toString() ?? "",
        };
      }
      if (navigating || handledComment.value === result.commentId) return;
      handledComment.value = result.commentId;
      if (current.comments.some((entry) => entry.id === result.commentId))
        return;
      const destination = projectCommentRefreshHref(
        location.url,
        result.commentId,
      );
      if (destination)
        void navigate(destination, { replaceState: true, scroll: false });
    },
    { strategy: "document-ready" },
  );
  const requestedAnchor = useSignal("");
  const focusProjectAnchor = $(
    (event: MouseEvent, anchor: HTMLAnchorElement) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      requestedAnchor.value = anchor.hash.slice(1);
    },
  );

  // Qwik intercepta las anclas y puede volver a dibujar el destino al navegar
  // en SPA. Enfocarlo antes de ese render pierde el foco al retirar el nodo.
  // eslint-disable-next-line qwik/no-use-visible-task -- el foco debe esperar el DOM final de una navegación solicitada con un enlace
  useVisibleTask$(
    ({ track }) => {
      const targetId = track(() => requestedAnchor.value);
      const navigating = track(() => location.isNavigating);
      track(() => location.url.hash);
      if (!targetId || navigating) return;
      document.getElementById(targetId)?.focus({ preventScroll: true });
      requestedAnchor.value = "";
    },
    { strategy: "document-ready" },
  );

  const {
    project,
    community,
    chain,
    author,
    comments,
    isMember,
    isAuthenticated,
  } = data.value;
  // Primera visita de la autoría después de publicar: el parámetro se puede
  // compartir, así que a otra persona no se le muestra nada.
  const justPublished =
    data.value.isAuthor &&
    location.url.searchParams.get(PUBLISHED_PARAM) === "1";
  const status = PROJECT_STATUS_LABEL[project.status as ProjectStatus];
  const authorName =
    author?.display_name ??
    author?.username ??
    translate(locale, "Cuenta eliminada");
  const path = `/proyectos/${project.id}`;
  // `!!` y no el número: un presupuesto en 0 dibujaba un "0" suelto en JSX.
  const hasBudget = !!project.budget_amount;
  const hasFacts =
    hasBudget || !!project.time_estimate || !!project.resources_needed;
  const postedCommentHref = useComputed$(() => {
    const receipt = confirmedComment.value;
    const current = data.value;
    return receipt?.projectId === current.project.id &&
      current.comments.some((entry) => entry.id === receipt.commentId)
      ? `/proyectos/${receipt.projectId}?mensaje=${receipt.commentId}#project-comment-${receipt.commentId}`
      : undefined;
  });

  // Q&A en dos niveles: pregunta y respuestas colgadas de ella.
  const roots = comments.filter(
    (c) =>
      !c.parent_id || !comments.some((parent) => parent.id === c.parent_id),
  );
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <div class="container-content py-8">
      <CommunityBreadcrumb chain={chain} currentIsLink class="mb-5" />

      <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Franja superior con el naranja del tipo (D123). */}
        <article class="min-w-0 border-t-4 border-t-kind-project pt-5">
          {justPublished && (
            <PublishedNextSteps
              kind="project"
              title={project.title}
              url={routes.project(project.id)}
              communityName={community.name}
            />
          )}
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <Chip
              variant="badge"
              icon={CONTENT_KINDS.project.icon}
              toneClass={CONTENT_KIND_TONES.project.badge}
            >
              {translate(locale, CONTENT_KINDS.project.label)}
            </Chip>
            <Badge
              tone={status.tone as "neutral" | "brand" | "success" | "danger"}
            >
              {translate(locale, status.label)}
            </Badge>
            <Badge tone="neutral">
              <Icon name="clock" />{" "}
              {translate(locale, "~{{count}} min de lectura", {
                count: Math.max(
                  1,
                  Math.ceil(
                    `${project.summary ?? ""} ${project.plan ?? ""}`
                      .trim()
                      .split(/\s+/).length / 180,
                  ),
                ),
              })}
            </Badge>
          </div>

          <h1 dir="auto" class="text-display-lg sm:text-display-xl">
            {project.title}
          </h1>
          <p dir="auto" class="ugc-text mt-3 text-lg text-ink-muted">
            {project.summary}
          </p>
          <a
            href="#aporte-proyecto"
            onClick$={focusProjectAnchor}
            class={cx(buttonClass("primary", "md"), "mt-4 w-full lg:hidden")}
          >
            {translate(locale, "Ver opciones de aporte")}
          </a>

          <MetaLine class="mt-4 text-sm text-ink-faint">
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
              <RelativeTime value={project.created_at} />
            </span>
            <span>
              <Link
                href={routes.community(community.slug)}
                class="font-medium text-brand hover:underline"
              >
                {community.emoji} {community.name}
              </Link>
            </span>
            {/* Desde un proyecto compartido por mensaje no había ninguna puerta
                al resto: la miga de pan lleva a la comunidad, pero no a sus
                otros proyectos. */}
            <span>
              <Link
                href={`${routes.community(community.slug)}/proyectos`}
                class="font-medium text-brand hover:underline"
              >
                {translate(locale, "Ver todos los proyectos")}
              </Link>
            </span>
          </MetaLine>
          <DetailActions
            type="project"
            id={project.id}
            title={project.title}
            url={`/proyectos/${project.id}`}
            communityName={community.name}
          />
          <ProjectStageStrip status={project.status} />

          {/* ----------------------------------------------- Ficha del proyecto
              Eran tres tarjetas sueltas después del plan largo: en el
              teléfono, unos 340 px apilados que se leían al final. Ahora es
              una sola ficha antes del plan, con la anatomía de las métricas
              (D123): ícono y rótulo arriba, el dato grande abajo. */}
          {hasFacts && (
            <Card class="mt-6">
              <dl class="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 sm:p-6">
                {hasBudget && (
                  <div>
                    <dt class="flex items-center gap-2 text-ink-muted">
                      <Icon name="receipt" class="text-base" />
                      <span class="text-xs font-semibold uppercase tracking-wider">
                        {translate(locale, "Presupuesto")}
                      </span>
                    </dt>
                    <dd class="mt-1.5 font-display text-display-sm tabular-nums text-ink-strong">
                      {formatMoney(
                        project.budget_amount,
                        project.currency,
                        locale,
                      )}
                    </dd>
                  </div>
                )}
                {project.time_estimate && (
                  <div>
                    <dt class="flex items-center gap-2 text-ink-muted">
                      <Icon name="clock" class="text-base" />
                      <span class="text-xs font-semibold uppercase tracking-wider">
                        {translate(locale, "Tiempo estimado")}
                      </span>
                    </dt>
                    <dd
                      dir="auto"
                      class="mt-1.5 break-words font-display text-display-sm tabular-nums text-ink-strong"
                    >
                      {project.time_estimate}
                    </dd>
                  </div>
                )}
                {project.resources_needed && (
                  <div
                    class={cx(
                      "sm:col-span-2",
                      (hasBudget || !!project.time_estimate) &&
                        "border-t border-subtle pt-4",
                    )}
                  >
                    <dt class="flex items-center gap-2 text-ink-muted">
                      <Icon name="wrench" class="text-base" />
                      <span class="text-xs font-semibold uppercase tracking-wider">
                        {translate(locale, "Recursos necesarios")}
                      </span>
                    </dt>
                    <dd
                      dir="auto"
                      class="ugc-text mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink"
                    >
                      {project.resources_needed}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {/* ------------------------------------------------------------ Plan */}
          <Card class={cx("p-5 sm:p-6", hasFacts ? "mt-4" : "mt-6")}>
            <h2 class="font-display text-display-xs">
              {translate(locale, "Cómo se llevaría a cabo")}
            </h2>
            <div
              dir="auto"
              class="ugc-text measure mt-3 whitespace-pre-line leading-relaxed text-ink"
            >
              {project.plan}
            </div>
          </Card>

          <div class="mt-6">
            <AiSummaryCard
              summary={data.value.aiSummary}
              enabled={data.value.aiSummaryEnabled}
              contentType="project"
              contentId={project.id}
              isAuthenticated={isAuthenticated}
            />
          </div>

          <ProjectExecution
            key={project.id}
            actions={executionActions}
            projectId={project.id}
            projectStatus={project.status}
            milestones={data.value.milestones}
            tasks={data.value.tasks}
            contributions={data.value.contributions}
            contributionsLoadFailed={data.value.contributionsLoadFailed}
            organizations={data.value.organizations}
            canManage={data.value.canManage}
            canModerate={data.value.canModerate}
            canContribute={isAuthenticated && isMember}
          />

          <ContentExtensionsPanel
            addRelation={addRelation}
            addSource={addSource}
            respond={institutionalResponse}
            key={project.id}
            type="project"
            id={project.id}
            data={data.value.extensions}
            canManage={data.value.canManage}
          />

          <RemoveContentButton
            type="project"
            id={project.id}
            isAuthor={data.value.isAuthor}
            createdAt={project.created_at}
            backHref={`${routes.community(community.slug)}/proyectos`}
          />

          {/* -------------------------------------------------------------- Q&A */}
          <section class="mt-8" aria-labelledby="qa-titulo">
            {/* Título de sección de página: la misma escala que Ejecución. */}
            <h2
              id="qa-titulo"
              tabIndex={-1}
              class="flex flex-wrap items-center gap-2 font-display text-display-sm"
            >
              {translate(locale, "Preguntas y respuestas")}
            </h2>
            <p class="mt-1 text-sm text-ink-muted">
              {translate(
                locale,
                "Las respuestas de quien propone el proyecto aparecen destacadas.",
              )}
            </p>

            {/* El aviso del tope sólo cuando hay más de una página; con dos
                mensajes explicaba una paginación que no existía. */}
            {(data.value.commentsHasCursor || data.value.commentsNext) && (
              <p class="mt-2 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Esta página muestra hasta 50 mensajes; las preguntas de contexto pueden aparecer en varias páginas.",
                )}
              </p>
            )}
            {data.value.commentsPageFailed && (
              <Alert class="mt-3">
                {translate(
                  locale,
                  "No pudimos cargar todos los mensajes. Probá de nuevo.",
                )}{" "}
                <a
                  href={
                    location.url.pathname + location.url.search + "#qa-titulo"
                  }
                  class="underline"
                >
                  {translate(locale, "Reintentar")}
                </a>
              </Alert>
            )}
            {roots.length === 0 ? (
              <p class="mt-4 rounded-2xl border border-dashed border-strong px-4 py-6 text-center text-sm text-ink-faint">
                {translate(
                  locale,
                  data.value.commentsPageFailed
                    ? "La carga de mensajes quedó incompleta."
                    : data.value.commentsHasCursor
                      ? "No hay más mensajes en esta página."
                      : "Todavía no preguntó nadie. Si algo no te cierra del plan, este es el lugar.",
                )}
              </p>
            ) : (
              <ul class="mt-4 space-y-4">
                {roots.map((entry) => (
                  <li key={entry.id}>
                    <QaBubble entry={entry} />
                    {repliesOf(entry.id).length > 0 && (
                      <ul class="mt-2 space-y-2 border-l-2 border-subtle pl-4 sm:ml-6">
                        {repliesOf(entry.id).map((reply) => (
                          <li key={reply.id}>
                            <QaBubble entry={reply} />
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* El autor puede responder cualquier pregunta. */}
                    {data.value.isAuthor && !entry.parent_id && (
                      <ProjectQaForm
                        comment={comment}
                        confirmedComment={confirmedComment}
                        onAnchorClick$={focusProjectAnchor}
                        projectId={project.id}
                        parentId={entry.id}
                        postedCommentHref={postedCommentHref}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {(data.value.commentsHasCursor || data.value.commentsNext) && (
              <nav
                aria-label={translate(
                  locale,
                  "Páginas de preguntas y respuestas",
                )}
                class="mt-4 flex flex-wrap gap-3"
              >
                {data.value.commentsHasCursor && (
                  <Link
                    href={projectCommentsPageHref(project.id, null)}
                    onClick$={focusProjectAnchor}
                    class={buttonClass("secondary", "sm")}
                  >
                    {translate(locale, "Volver a los primeros mensajes")}
                  </Link>
                )}
                {data.value.commentsNext && (
                  <Link
                    href={projectCommentsPageHref(
                      project.id,
                      data.value.commentsNext,
                    )}
                    onClick$={focusProjectAnchor}
                    class={buttonClass("secondary", "sm")}
                  >
                    {translate(locale, "Mensajes siguientes")}
                  </Link>
                )}
              </nav>
            )}

            {/* -------------------------------------------------- Nueva pregunta */}
            {isAuthenticated && isMember ? (
              <Card class="mt-5 p-4">
                <ProjectQaForm
                  comment={comment}
                  confirmedComment={confirmedComment}
                  onAnchorClick$={focusProjectAnchor}
                  projectId={project.id}
                  postedCommentHref={postedCommentHref}
                />
              </Card>
            ) : (
              /* Las dos frases eran callejones sin salida: decían que no se
                 puede y no dónde se arregla. "Ingresar" va como secundario:
                 el llamado principal a la cuenta ya está en el panel de
                 aporte, y uno por pantalla alcanza (D125). */
              <div class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p class="text-sm text-ink-muted">
                  {isAuthenticated
                    ? translate(
                        locale,
                        "Sólo pueden preguntar quienes viven en {{community}}.",
                        {
                          community: community.name,
                        },
                      )
                    : translate(locale, "Ingresá para hacer una pregunta.")}
                </p>
                {isAuthenticated ? (
                  <ButtonLink
                    href={`/perfil/residencia?parent=${community.slug}`}
                    variant="secondary"
                    size="sm"
                  >
                    {translate(locale, "Revisar mi residencia")}
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    href={`/ingresar?next=${encodeURIComponent(path)}`}
                    variant="secondary"
                    size="sm"
                  >
                    {translate(locale, "Ingresar")}
                  </ButtonLink>
                )}
              </div>
            )}
          </section>

          <div class="mt-8">
            <ReportButton
              targetType="project"
              targetId={project.id}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </article>

        {/* --------------------------------------------------- Panel de aporte */}
        <aside
          id="aporte-proyecto"
          tabIndex={-1}
          aria-label={translate(locale, "Apoyo comprometido")}
          class="scroll-mt-24 lg:sticky lg:top-24 lg:self-start"
        >
          <PledgePanel
            key={project.id}
            pledge={pledge}
            projectId={project.id}
            currency={project.currency}
            budget={project.budget_amount}
            pledgedTotal={Number(project.pledged_total)}
            pledgeCount={data.value.pledgeCount}
            pledges={data.value.pledges}
            myPledge={data.value.myPledge}
            myPledgeLoadFailed={data.value.myPledgeLoadFailed}
            isMember={isMember}
            isAuthenticated={isAuthenticated}
            returnPath={`${path}#aporte-proyecto`}
          />
          {/* El afiche con QR ya existía y nada lo enlazaba; imprimir la
              página entera queda como segunda opción, porque el detalle no
              tiene estilos de impresión. Sin listas acá: los E2E cuentan las
              filas de quienes se sumaron con `#aporte-proyecto ul > li`. */}
          <div class="mt-4">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {translate(locale, "Para imprimir o publicar")}
            </h2>
            <div class="mt-2 flex flex-col gap-2">
              <ButtonLink
                href={`${path}/afiche`}
                variant="secondary"
                size="sm"
                class="w-full"
              >
                <Icon name="printer" />
                {translate(locale, "Imprimir afiche con QR")}
              </ButtonLink>
              <button
                type="button"
                onClick$={() => window.print()}
                class={cx(buttonClass("ghost", "sm"), "w-full")}
              >
                <Icon name="printer" />
                {translate(locale, "Imprimir proyecto para asamblea")}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
});

/** Cada cuadro conserva su borrador aunque otra pregunta reciba una respuesta. */
const ProjectQaForm = component$<{
  comment: ReturnType<typeof useProjectComment>;
  confirmedComment: ReadonlySignal<ProjectCommentReceipt | undefined>;
  onAnchorClick$: QRL<(event: MouseEvent, anchor: HTMLAnchorElement) => void>;
  projectId: string;
  parentId?: string;
  postedCommentHref: ReadonlySignal<string | undefined>;
}>(
  ({
    comment,
    confirmedComment,
    onAnchorClick$,
    projectId,
    parentId,
    postedCommentHref,
  }) => {
    const locale = useLocale();
    const isCurrent = useComputed$(
      () =>
        comment.formData?.get("project_id") === projectId &&
        (comment.formData?.get("parent_id") ?? "") === (parentId ?? ""),
    );
    // El botón compuesto necesita señales derivadas estables al releer por
    // URL; así bloqueo, spinner y aria-busy terminan el mismo envío.
    const running = useComputed$(() => comment.isRunning);
    const pending = useComputed$(() => running.value && isCurrent.value);
    const body = useSignal(
      isCurrent.value && !comment.value?.posted
        ? (comment.formData?.get("body")?.toString() ?? "")
        : "",
    );
    const fieldError =
      isCurrent.value && !running.value
        ? comment.value?.fieldErrors?.body
        : undefined;
    const error =
      isCurrent.value && !running.value
        ? (comment.value?.message ?? fieldError)
        : undefined;
    const inputId = parentId ? `respuesta-${parentId}` : "nueva-pregunta";
    const posted = useComputed$(
      () =>
        !running.value &&
        (!comment.value || !!comment.value.posted) &&
        confirmedComment.value?.projectId === projectId &&
        confirmedComment.value.parentId === (parentId ?? ""),
    );

    return (
      <Form
        action={comment}
        class={parentId ? "mt-2 flex flex-wrap gap-2 sm:ml-6" : "space-y-3"}
        onSubmitCompleted$={$((event: CustomEvent<{ status: number }>) => {
          if (
            event.detail.status >= 200 &&
            event.detail.status < 300 &&
            comment.value?.posted &&
            comment.formData?.get("project_id") === projectId &&
            (comment.formData?.get("parent_id") ?? "") === (parentId ?? "") &&
            body.value === comment.formData?.get("body")
          ) {
            // Sólo se limpia lo que la base confirmó. El texto que se empezó
            // a escribir mientras viajaba el envío también se conserva.
            body.value = "";
          }
        })}
      >
        <input type="hidden" name="project_id" value={projectId} />
        {parentId && <input type="hidden" name="parent_id" value={parentId} />}
        {error && (
          <Alert class="w-full">
            <span id={`${inputId}-error`}>{translate(locale, error)}</span>
          </Alert>
        )}
        {posted.value && (
          <p role="status" class="w-full text-sm text-success">
            {translate(
              locale,
              parentId ? "Tu respuesta se publicó." : "Tu pregunta se publicó.",
            )}
            {postedCommentHref.value && (
              <>
                {" "}
                <a
                  href={postedCommentHref.value}
                  onClick$={[
                    sync$((event: MouseEvent, anchor: HTMLAnchorElement) => {
                      if (
                        event.button !== 0 ||
                        event.ctrlKey ||
                        event.metaKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      const target = document.getElementById(
                        anchor.hash.slice(1),
                      );
                      if (!target) return;
                      event.preventDefault();
                      const destination = new URL(window.location.href);
                      destination.hash = anchor.hash;
                      window.history.pushState(
                        window.history.state,
                        "",
                        destination,
                      );
                      target.focus({ preventScroll: true });
                      target.scrollIntoView({
                        block: "center",
                        behavior: "instant",
                      });
                    }),
                    onAnchorClick$,
                  ]}
                  class="font-medium underline"
                >
                  {translate(locale, "Ver mensaje publicado")}
                </a>
              </>
            )}
          </p>
        )}
        <Textarea
          name="body"
          id={inputId}
          value={body.value}
          onInput$={(_, element) => (body.value = element.value)}
          required
          rows={parentId ? 1 : 3}
          maxLength={1000}
          invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder={translate(
            locale,
            parentId
              ? "Responder…"
              : "¿Qué te gustaría saber antes de comprometerte?",
          )}
          aria-label={translate(
            locale,
            parentId ? "Responder a esta pregunta" : "Escribir una pregunta",
          )}
          class={parentId ? "min-h-10 flex-1 text-sm" : undefined}
        />
        <SubmitButton
          variant={parentId ? "secondary" : "primary"}
          size={parentId ? "sm" : "md"}
          pending={pending.value}
          disabled={running.value}
        >
          {translate(locale, parentId ? "Responder" : "Preguntar")}
        </SubmitButton>
      </Form>
    );
  },
);

/** Burbuja del Q&A. Las respuestas del autor van con fondo y etiqueta. */
const QaBubble = component$<{ entry: QaEntry; unanswered?: boolean }>(
  ({ entry, unanswered }) => {
    const locale = useLocale();
    const name =
      entry.author?.display_name ??
      entry.author?.username ??
      translate(locale, "Cuenta eliminada");
    return (
      <div
        id={`project-comment-${entry.id}`}
        tabIndex={-1}
        class={cx(
          "scroll-mt-24 rounded-2xl border p-4",
          entry.isAuthorReply
            ? "border-brand-500/40 bg-brand-50 dark:bg-brand-950/40"
            : "border-subtle bg-surface",
        )}
      >
        <div class="flex items-center gap-2">
          <Avatar src={entry.author?.avatar_url} name={name} size="sm" />
          <span class="text-sm font-medium text-ink-strong">{name}</span>
          {entry.isAuthorReply && (
            <Badge tone="brand">
              {translate(locale, "Autor del proyecto")}
            </Badge>
          )}
          {unanswered && (
            <Badge tone="warn">{translate(locale, "Sin responder")}</Badge>
          )}
          <RelativeTime
            value={entry.created_at}
            class="ml-auto text-xs text-ink-faint"
          />
        </div>
        <p
          dir="auto"
          class="ugc-text mt-2 whitespace-pre-line text-sm leading-relaxed text-ink"
        >
          {entry.body}
        </p>
      </div>
    );
  },
);

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useProject);
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  const title = data?.project.title ?? translate(locale, "Proyecto");
  const description = data?.project.summary ?? "";

  return {
    title: `${title} · ${APP_NAME}`,
    meta: [
      { name: "description", content: description.slice(0, 180) },
      { property: "og:title", content: title },
      { property: "og:description", content: description.slice(0, 200) },
      { property: "og:type", content: "article" },
      ...socialImageMeta(data?.ogImage ?? "", title),
    ],
  };
};
