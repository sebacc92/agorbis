import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  type DocumentHead,
  useLocation,
} from "@qwik.dev/router";
import {
  ProjectCard,
  type ProjectCardData,
} from "~/components/projects/ProjectCard";
import { EmptyListing, ListingHeader } from "~/components/quota/ListingHeader";
import { Badge, Card, Icon, cx } from "~/components/ui";
import { CivicCalendarButton } from "~/components/ui/CivicCalendarButton";
import { centerInRow } from "~/lib/center-in-row";
import { formatDate } from "~/lib/format";
import { routes } from "~/lib/community";
import {
  APP_NAME,
  PAGE_SIZE,
  PLEDGE_DISCLAIMER,
  PROJECT_STATUS_LABEL,
} from "~/lib/constants";
import type { ProjectStatus } from "~/lib/database.types.helpers";
import { pluralize } from "~/lib/format";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { EMPTY_QUOTA, loadQuotaSummary } from "~/lib/quota";
import { beforeCursor, nextCursorParams, readCursor } from "~/lib/cursor";
import { many, single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";
import { useCommunity } from "../layout";
import { timeZoneOf } from "~/lib/timezone";

type AgendaProject = ProjectCardData & {
  nextMilestone: { title: string; target_date: string | null } | null;
};

/**
 * Estados filtrables, con su slug en la URL.
 *
 * Un proyecto recién propuesto, uno juntando apoyo y uno ya en obra piden
 * cosas distintas de quien mira: leer, comprometerse o seguir el avance.
 * Mezclados en una sola lista cronológica, la única forma de encontrar los que
 * todavía aceptan aporte era abrirlos de a uno.
 */
const STATE_FILTERS = [
  { slug: "propuestas", status: "proposal" },
  { slug: "apoyo", status: "funding" },
  { slug: "marcha", status: "in_progress" },
  { slug: "completados", status: "completed" },
] as const;

type StateSlug = (typeof STATE_FILTERS)[number]["slug"] | null;

export const useProjects = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const viewer = await getViewer(ev);

  const community = await single(
    ev,
    "proyectos/comunidad",
    db
      .from("communities")
      .select("id")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community)
    return {
      projects: [] as AgendaProject[],
      nextCursor: null,
      state: null as StateSlug,
      summary: EMPTY_QUOTA,
    };

  const cursor = readCursor(ev.url.searchParams);
  const requested = ev.url.searchParams.get("estado");
  const filter = STATE_FILTERS.find((item) => item.slug === requested) ?? null;
  const state: StateSlug = filter?.slug ?? null;
  const todayParts = new Intl.DateTimeFormat("en", {
    timeZone: timeZoneOf(ev),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = ["year", "month", "day"]
    .map((type) => todayParts.find((part) => part.type === type)!.value)
    .join("-");

  let query = db
    .from("projects")
    .select(
      "id, title, summary, status, budget_amount, currency, pledged_total, created_at, milestones:project_milestones(title, target_date)",
    )
    .eq("community_id", community.id)
    .neq("status", "removed")
    .in("milestones.status", ["pending", "in_progress"])
    .gte("milestones.target_date", today)
    .order("target_date", { referencedTable: "milestones", ascending: true })
    .order("id", { referencedTable: "milestones", ascending: true })
    .limit(1, { referencedTable: "milestones" })
    // El `id` desempata (D65): sin él, dos proyectos con el mismo instante de
    // creación hacían desaparecer al segundo al pasar de página.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  if (filter) query = query.eq("status", filter.status);
  if (cursor) query = query.or(beforeCursor(cursor));

  const [rows, summary] = await Promise.all([
    many(ev, "proyectos/listado", query),
    loadQuotaSummary(ev, viewer.userId),
  ]);

  const pledgeCounts = rows.length
    ? await many(
        ev,
        "proyectos/conteo-compromisos",
        db.rpc("project_pledge_counts", {
          p_projects: rows.map((project) => project.id),
        }),
      )
    : [];
  const pledgeCountByProject = new Map(
    pledgeCounts.map((entry) => [entry.project_id, Number(entry.pledge_count)]),
  );

  const projects: AgendaProject[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    status: p.status as ProjectStatus,
    budget_amount: p.budget_amount === null ? null : Number(p.budget_amount),
    currency: p.currency,
    pledged_total: Number(p.pledged_total),
    created_at: p.created_at,
    pledgeCount: pledgeCountByProject.get(p.id) ?? 0,
    nextMilestone: p.status !== "completed" ? (p.milestones[0] ?? null) : null,
  }));

  return {
    projects,
    nextCursor: nextCursorParams(projects, PAGE_SIZE),
    state,
    summary,
  };
});

export default component$(() => {
  const data = useProjects();
  const ctx = useCommunity();
  const locale = useLocale();
  const loc = useLocation();
  const { community, isMember, isAuthenticated } = ctx.value;
  const projects = data.value.projects;
  const state = data.value.state;
  const viewMode =
    loc.url.searchParams.get("vista") === "agenda" ? "agenda" : "grid";
  const listingHref = (
    nextState: StateSlug,
    nextView = viewMode,
    cursor?: string | null,
  ) => {
    const params = new URLSearchParams(loc.url.searchParams);
    params.delete("antes");
    params.delete("id");
    if (nextState) params.set("estado", nextState);
    else params.delete("estado");
    if (nextView === "agenda") params.set("vista", "agenda");
    else params.delete("vista");
    new URLSearchParams(cursor ?? "").forEach((value, key) =>
      params.set(key, value),
    );
    return `?${params}`;
  };
  const stateHref = (next: StateSlug) => listingHref(next);
  const currentCursor = new URLSearchParams();
  for (const key of ["antes", "id"]) {
    const value = loc.url.searchParams.get(key);
    if (value) currentCursor.set(key, value);
  }

  /**
   * La fila de estados desborda en pantallas angostas y arranca en el
   * principio: al entrar por un enlace con `?estado=marcha`, el chip aplicado
   * quedaba fuera de la vista y nada indicaba que había un filtro puesto.
   */
  const chips = useSignal<HTMLElement>();
  // eslint-disable-next-line qwik/no-use-visible-task -- depende del ancho real de la fila
  useVisibleTask$(({ track }) => {
    track(() => state);
    centerInRow(chips.value, "[aria-current]");
  });

  const shared = {
    type: "project" as const,
    communitySlug: community.slug,
    communityName: community.name,
    summary: data.value.summary,
    isMember,
    isAuthenticated,
  };

  return (
    <section aria-labelledby="proyectos-titulo">
      <ListingHeader
        {...shared}
        titleId="proyectos-titulo"
        title={translate(locale, "Proyectos de {{community}}", {
          community: community.name,
        })}
        description={translate(
          locale,
          "Propuestas con plan, presupuesto y tiempos. Se puede comprometer apoyo.",
        )}
      />

      <p class="mb-5 rounded-2xl bg-muted px-4 py-2.5 text-xs text-ink-muted">
        <span aria-hidden="true">⚠️</span>{" "}
        {translate(locale, PLEDGE_DISCLAIMER)}
      </p>

      {/* Única puerta a la creación de rondas: la pestaña Presupuesto sólo
          aparece cuando ya existe una (D59), así que la primera hay que poder
          abrirla desde algún lado. */}
      {ctx.value.isModerator && (
        <p class="mb-5 text-sm">
          <Link
            href={`${routes.community(community.slug)}/presupuesto/nueva`}
            class="font-medium text-brand hover:underline"
          >
            {translate(locale, "Abrir una ronda de presupuesto participativo")}
            <Icon name="arrow-right" class="ml-1 text-sm" />
          </Link>
        </p>
      )}

      {(projects.length > 0 || state) && (
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav
            ref={chips}
            aria-label={translate(locale, "Filtrar proyectos por estado")}
            class="scrollbar-slim tabs-scroll-hint -mx-4 flex flex-1 snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:px-0"
          >
            <Link
              href={stateHref(null)}
              aria-current={!state ? "true" : undefined}
              class={cx(
                "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 touch-target",
                !state
                  ? "border-brand-600 bg-brand-50 font-medium text-brand dark:bg-brand-950/50"
                  : "border-subtle text-ink-muted hover:border-strong",
              )}
            >
              {translate(locale, "Todos")}
            </Link>
            {STATE_FILTERS.map((item) => (
              <Link
                key={item.slug}
                href={stateHref(item.slug)}
                aria-current={state === item.slug ? "true" : undefined}
                class={cx(
                  "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 touch-target",
                  state === item.slug
                    ? "border-brand-600 bg-brand-50 font-medium text-brand dark:bg-brand-950/50"
                    : "border-subtle text-ink-muted hover:border-strong",
                )}
              >
                {translate(locale, PROJECT_STATUS_LABEL[item.status].label)}
              </Link>
            ))}
          </nav>

          <nav
            aria-label={translate(locale, "Vista de proyectos")}
            class="flex shrink-0 items-center rounded-2xl border border-subtle bg-surface p-1 shadow-xs"
          >
            <Link
              href={listingHref(state, "grid", currentCursor.toString())}
              aria-current={viewMode === "grid" ? "page" : undefined}
              class={cx(
                "flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                viewMode === "grid"
                  ? "bg-brand-600 text-white shadow-soft"
                  : "text-ink-muted hover:text-ink-strong",
              )}
            >
              <span aria-hidden="true">▦</span>
              <span>{translate(locale, "Cuadrícula")}</span>
            </Link>
            <Link
              href={listingHref(state, "agenda", currentCursor.toString())}
              aria-current={viewMode === "agenda" ? "page" : undefined}
              class={cx(
                "flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                viewMode === "agenda"
                  ? "bg-brand-600 text-white shadow-soft"
                  : "text-ink-muted hover:text-ink-strong",
              )}
            >
              <span aria-hidden="true">📅</span>
              <span>{translate(locale, "Agenda comunitaria")}</span>
            </Link>
          </nav>
        </div>
      )}

      {state && (
        <div class="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-subtle bg-muted/40 px-3.5 py-2 text-xs">
          <span class="font-semibold text-ink-muted">
            {translate(locale, "Filtros activos:")}
          </span>

          {STATE_FILTERS.find((s) => s.slug === state) && (
            <Link
              href={stateHref(null)}
              class="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-brand-500"
            >
              <span>
                {translate(
                  locale,
                  PROJECT_STATUS_LABEL[
                    STATE_FILTERS.find((s) => s.slug === state)!.status
                  ].label,
                )}
              </span>
              <span aria-hidden="true" class="ml-0.5 font-bold">
                ✕
              </span>
            </Link>
          )}

          <div class="ml-auto flex items-center gap-2">
            <span class="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-2xs font-semibold text-ink-muted border border-subtle tabular-nums shadow-xs">
              {projects.length}{" "}
              {pluralize(projects.length, "proyecto", "proyectos", locale)}
            </span>
            <Link
              href={stateHref(null)}
              class="text-2xs font-semibold text-ink-faint underline hover:text-ink-strong"
            >
              {translate(locale, "Limpiar filtros")}
            </Link>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        state ? (
          /* Un filtro sin resultados no es una comunidad sin proyectos: el
             estado general invitaría a proponer el primero de un lugar que
             puede tener diez en otro estado. */
          <div class="rounded-2xl border border-dashed border-strong px-6 py-12 text-center">
            <div class="text-4xl" aria-hidden="true">
              🛠️
            </div>
            <h3 class="mt-3 text-base font-semibold">
              {translate(
                locale,
                "No hay proyectos en ese estado en {{community}}",
                { community: community.name },
              )}
            </h3>
            <p class="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
              {translate(
                locale,
                "El filtro muestra un estado por vez: puede haber proyectos en los demás.",
              )}
            </p>
            <Link
              href={stateHref(null)}
              class="mt-5 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver todos los proyectos")}
            </Link>
          </div>
        ) : (
          <EmptyListing
            {...shared}
            emoji="🛠️"
            title={translate(
              locale,
              "Nadie propuso nada todavía en {{community}}",
              {
                community: community.name,
              },
            )}
            why={translate(
              locale,
              "Acá una idea se convierte en propuesta: con un plan por etapas, un presupuesto estimado y un tiempo. Después la comunidad compromete apoyo y se ve, con números, si hay respaldo real o era entusiasmo de sobremesa.",
            )}
          />
        )
      ) : (
        <>
          <p aria-live="polite" class="mb-3 text-xs text-ink-faint">
            {translate(locale, "Mostrando {{count}}", {
              count: pluralize(
                projects.length,
                "proyecto",
                "proyectos",
                locale,
              ),
            })}
          </p>

          {viewMode === "grid" ? (
            <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          ) : (
            <div class="space-y-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  as="article"
                  class="p-5 sm:p-6 transition hover:shadow-soft"
                >
                  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div class="flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            project.status === "completed"
                              ? "success"
                              : project.status === "in_progress"
                                ? "brand"
                                : "neutral"
                          }
                        >
                          {translate(
                            locale,
                            PROJECT_STATUS_LABEL[project.status].label,
                          )}
                        </Badge>
                        {project.pledgeCount > 0 && (
                          <Badge tone="brand">
                            👥 {project.pledgeCount}{" "}
                            {translate(locale, "voluntarios")}
                          </Badge>
                        )}
                      </div>

                      <h3 class="mt-2 text-lg font-bold text-ink-strong">
                        <Link
                          href={routes.project(project.id)}
                          class="hover:text-brand hover:underline"
                        >
                          {project.title}
                        </Link>
                      </h3>

                      {project.summary && (
                        <p class="mt-1 text-sm text-ink-muted line-clamp-2">
                          {project.summary}
                        </p>
                      )}
                      <p class="mt-3 text-xs text-ink-muted">
                        {project.nextMilestone?.target_date
                          ? translate(
                              locale,
                              "Próxima fecha objetivo: {{date}} · {{milestone}}",
                              {
                                date: formatDate(
                                  project.nextMilestone.target_date,
                                  locale,
                                ),
                                milestone: project.nextMilestone.title,
                              },
                            )
                          : translate(
                              locale,
                              "Sin próximas fechas objetivo. Consultá el plan del proyecto.",
                            )}
                      </p>
                    </div>

                    <div class="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      {project.nextMilestone?.target_date && (
                        <CivicCalendarButton
                          title={translate(
                            locale,
                            "Fecha objetivo: {{milestone}} · {{project}}",
                            {
                              milestone: project.nextMilestone.title,
                              project: project.title,
                            },
                          )}
                          description={translate(
                            locale,
                            "Fecha prevista del plan, sujeta a cambios. Consultá el proyecto: {{url}}",
                            {
                              url: `${loc.url.origin}${routes.project(project.id)}`,
                            },
                          )}
                          endDate={project.nextMilestone.target_date}
                          allDay
                          tentative
                          location={community.name}
                        />
                      )}
                      <Link
                        href={routes.project(project.id)}
                        class="inline-flex min-h-8 items-center text-xs font-semibold text-brand hover:underline"
                      >
                        {translate(locale, "Ver proyecto")}
                        <Icon name="arrow-right" class="ml-1 text-sm" />
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
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
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "← Volver al principio")}
            </Link>
          )}
          {data.value.nextCursor && (
            <Link
              href={listingHref(state, viewMode, data.value.nextCursor)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver proyectos más antiguos")}
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
  const name = ctx?.community.name ?? "";
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  return {
    title: `${translate(locale, "Proyectos de {{community}}", { community: name })} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Proyectos colaborativos propuestos en {{community}} dentro de Agorbis.",
          { community: name },
        ),
      },
    ],
  };
};
