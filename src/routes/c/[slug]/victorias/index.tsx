import { component$, useSignal } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Chip,
  EmptyState,
  Icon,
  triggerHapticFeedback,
} from "~/components/ui";
import { MetricTile } from "~/components/ui/MetricTile";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { ClaimCard } from "~/components/claims/ClaimCard";
import { VictoriesHonorRoll } from "~/components/community/VictoriesHonorRoll";
import {
  APP_NAME,
  CLAIM_CATEGORIES,
  PROJECT_STATUS_LABEL,
} from "~/lib/constants";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import type { ClaimCategory } from "~/lib/database.types.helpers";
import { formatDate, formatNumber } from "~/lib/format";
import { exactCount } from "~/lib/claim-stats";
import { single, many } from "~/lib/query";
import { supabase } from "~/lib/session";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { routes } from "~/lib/community";
import { useLocaleLoader } from "~/routes/layout";

/**
 * Cuántas victorias de cada tipo se dibujan. Las más recientes primero; el
 * resto queda a un enlace del listado filtrado, que pagina.
 */
const VICTORIES_LIST_LIMIT = 48;

export const useCommunityVictories = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const community = await single(
    ev,
    "victorias/comunidad",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, member_count")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community) {
    throw ev.error(404, translate(locale, "No encontramos esa comunidad."));
  }

  // Los totales salen de conteos exactos y los listados tienen techo. Antes se
  // traían todas las filas: PostgREST cortaba en mil sin avisar, así que en
  // una comunidad grande "Victorias" mostraba 1000 aunque fueran más, y cada
  // visita bajaba miles de descripciones para dibujar una grilla.
  const [resolvedTotal, completedTotal, resolvedClaims, completedProjects] =
    await Promise.all([
      exactCount(
        ev,
        "victorias/reclamos/total",
        db
          .from("claims")
          .select("id", { count: "exact", head: true })
          .eq("community_id", community.id)
          .eq("status", "resolved"),
      ),
      exactCount(
        ev,
        "victorias/proyectos/total",
        db
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("community_id", community.id)
          .eq("status", "completed"),
      ),
      many(
        ev,
        "victorias/reclamos",
        db
          .from("claims")
          .select(
            "id, title, description, category, status, image_url, image_urls, support_count, created_at",
          )
          .eq("community_id", community.id)
          .eq("status", "resolved")
          // El `id` desempata: con dos reclamos del mismo instante, cuál
          // entra en el recorte no puede depender del plan de Postgres.
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(VICTORIES_LIST_LIMIT),
      ),
      many(
        ev,
        "victorias/proyectos",
        db
          .from("projects")
          .select("id, title, summary, status, created_at")
          .eq("community_id", community.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(VICTORIES_LIST_LIMIT),
      ),
    ]);

  // La suma de apoyos no se puede pedir como conteo: es un `sum` y PostgREST
  // no agrega sin habilitarlo. Se calcula sobre los reclamos listados y la
  // pantalla lo dice cuando no son todos, en vez de presentar un piso como
  // el total.
  const totalMobilized = resolvedClaims.reduce(
    (acc, c) => acc + (c.support_count || 0),
    0,
  );

  return {
    community,
    resolvedClaims,
    completedProjects,
    resolvedTotal,
    completedTotal,
    totalVictories: resolvedTotal + completedTotal,
    totalMobilized,
    claimsTruncated: resolvedClaims.length < resolvedTotal,
    projectsTruncated: completedProjects.length < completedTotal,
  };
});

export default component$(() => {
  const data = useCommunityVictories();
  const locale = useLocale();
  const {
    community,
    resolvedClaims,
    completedProjects,
    resolvedTotal,
    completedTotal,
    totalVictories,
    totalMobilized,
    claimsTruncated,
    projectsTruncated,
  } = data.value;

  const activeTab = useSignal<"all" | "claims" | "projects">("all");
  const selectedCategory = useSignal<string>("all");
  // `Chip` no reenvía `ref`: "Limpiar filtros" devuelve el foco al primer
  // chip de este grupo, que es "Todas las victorias".
  const tabsRow = useSignal<HTMLDivElement>();

  // Cada etiqueta con su `translate` literal: pasadas por variable,
  // `check-i18n` no las veía y en inglés salían en español.
  const victoryTabs = [
    {
      key: "all",
      label: translate(locale, "Todas las victorias"),
      count: totalVictories,
      icon: "trophy",
      selectedClass: undefined,
    },
    {
      key: "claims",
      label: translate(locale, "Reclamos solucionados"),
      count: resolvedTotal,
      icon: CONTENT_KINDS.claim.icon,
      selectedClass: CONTENT_KIND_TONES.claim.selected,
    },
    {
      key: "projects",
      label: translate(locale, "Proyectos completados"),
      count: completedTotal,
      icon: CONTENT_KINDS.project.icon,
      selectedClass: CONTENT_KIND_TONES.project.selected,
    },
  ] as const;

  const filteredClaims = resolvedClaims.filter((claim) => {
    if (
      selectedCategory.value !== "all" &&
      claim.category !== selectedCategory.value
    ) {
      return false;
    }
    return true;
  });

  const showClaims = activeTab.value === "all" || activeTab.value === "claims";
  const showProjects =
    activeTab.value === "all" || activeTab.value === "projects";

  return (
    <section aria-labelledby="victorias-titulo">
      {/* Cabecera de listado dentro de la comunidad: el layout ya pone el
          contenedor, la miga, el h1 y el chip de "Victorias". Las cifras van
          debajo del texto y no al costado: compartiendo fila, en el teléfono
          la descripción caía una palabra por línea y las cajas quedaban
          encima del texto. */}
      <div class="mb-6">
        <div class="min-w-0 max-w-xl">
          <h2
            id="victorias-titulo"
            class="text-xl font-semibold tracking-tight"
          >
            {translate(locale, "Victorias de {{community}}", {
              community: community.name,
            })}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Reclamos de {{name}} marcados como resueltos y proyectos completados, con la fecha en que se publicaron.",
              { name: community.name },
            )}
          </p>
        </div>

        {/* Una sola anatomía por cifra (D123), sin degradé ni ámbar: el cero
            se dice en palabras y no como un número que festejar. */}
        <div class="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <MetricTile
            icon="trophy"
            tone="text-success"
            label={translate(locale, "Victorias")}
            value={
              totalVictories > 0 ? formatNumber(totalVictories, locale) : null
            }
            emptyText={translate(locale, "Todavía ninguna")}
          />
          <MetricTile
            icon="users"
            label={translate(locale, "Apoyos sumados")}
            value={
              totalMobilized > 0 ? formatNumber(totalMobilized, locale) : null
            }
            emptyText={translate(locale, "Todavía ninguno")}
            note={
              claimsTruncated
                ? translate(
                    locale,
                    "Apoyos en los {{count}} reclamos resueltos más recientes",
                    { count: resolvedClaims.length },
                  )
                : undefined
            }
          />
        </div>
      </div>

      <VictoriesHonorRoll
        communityName={community.name}
        communitySlug={community.slug}
        victories={resolvedClaims.map((c) => ({
          id: c.id,
          title: c.title,
          categoryIcon: CLAIM_CATEGORIES.find((cat) => cat.key === c.category)
            ?.icon,
          categoryLabel: CLAIM_CATEGORIES.find((cat) => cat.key === c.category)
            ?.label,
          supportCount: c.support_count,
          solvedAt: translate(locale, "Reportado el {{date}}", {
            date: formatDate(c.created_at, locale),
          }),
        }))}
      />

      {/* Tipo y categoría con el mismo chip (D123): antes el tipo usaba
          píldoras propias con emoji justo encima de los chips de categoría,
          dos dibujos distintos para el mismo filtro. */}
      {totalVictories > 0 && (
        <div class="mt-6 flex flex-col gap-3">
          <div
            ref={tabsRow}
            role="group"
            aria-label={translate(locale, "Tipo de victoria")}
            class="flex flex-wrap gap-2"
          >
            {victoryTabs.map((tab) => (
              <Chip
                key={tab.key}
                icon={tab.icon}
                selected={activeTab.value === tab.key}
                selectedClass={tab.selectedClass}
                onClick$={() => {
                  triggerHapticFeedback("selection");
                  activeTab.value = tab.key;
                }}
              >
                {tab.label}
                {/* El contador se aparta por peso y no por opacidad: al 75 %
                    el texto de 12 px quedaba debajo de AA sobre el relleno
                    del tipo y sobre la superficie. */}
                <span class="font-normal tabular-nums">
                  {formatNumber(tab.count, locale)}
                </span>
              </Chip>
            ))}
          </div>

          {/* Filtro de categorías para reclamos */}
          {(activeTab.value === "all" || activeTab.value === "claims") && (
            <div class="scrollbar-slim -mx-4 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:px-0">
              {/* Chip único con íconos propios por categoría (D125). */}
              <Chip
                selected={selectedCategory.value === "all"}
                class="shrink-0 snap-start"
                onClick$={() => {
                  triggerHapticFeedback("selection");
                  selectedCategory.value = "all";
                }}
              >
                {translate(locale, "Todas las categorías")}
              </Chip>
              {CLAIM_CATEGORIES.map((cat) => (
                <Chip
                  key={cat.key}
                  selected={selectedCategory.value === cat.key}
                  icon={cat.icon}
                  class="shrink-0 snap-start"
                  onClick$={() => {
                    triggerHapticFeedback("selection");
                    selectedCategory.value = cat.key;
                  }}
                >
                  {translate(locale, cat.label)}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista de Victorias */}
      {totalVictories > 0 &&
        !(showClaims && filteredClaims.length > 0) &&
        !(showProjects && completedProjects.length > 0) && (
          <div role="status" class="mt-8">
            <EmptyState
              illustration="search"
              title="No hay victorias con estos filtros"
              description="Probá otro tipo o categoría. Los filtros se aplican a las victorias cargadas."
            >
              <Button
                variant="secondary"
                onClick$={() => {
                  activeTab.value = "all";
                  selectedCategory.value = "all";
                  tabsRow.value?.querySelector("button")?.focus();
                }}
              >
                {translate(locale, "Limpiar filtros")}
              </Button>
            </EmptyState>
          </div>
        )}
      {totalVictories === 0 ? (
        <div class="mt-8">
          {/* Sin "inmortalizados" ni "¡Sé el primero!": el vacío dice cuándo
              aparece algo acá y nada más. */}
          <EmptyState
            illustration="sprout"
            title={translate(locale, "Todavía no hay victorias registradas")}
            description={translate(
              locale,
              "Cuando un reclamo se marca como resuelto o un proyecto como completado, aparece acá.",
            )}
          >
            <ButtonLink href={routes.community(community.slug) + "/reclamos"}>
              {translate(locale, "Ver reclamos en curso")}
            </ButtonLink>
          </EmptyState>
        </div>
      ) : (
        <div class="mt-8 space-y-10">
          {showClaims && filteredClaims.length > 0 && (
            <section class="space-y-4">
              <h2 class="flex items-center gap-2 text-lg font-semibold text-ink-strong">
                <Icon
                  name={CONTENT_KINDS.claim.icon}
                  class={CONTENT_KIND_TONES.claim.text}
                />
                <span>{translate(locale, "Reclamos resueltos con éxito")}</span>
                <span class="text-sm font-normal tabular-nums text-ink-faint">
                  {formatNumber(filteredClaims.length, locale)}
                </span>
              </h2>

              {/* La tarjeta del feed (D123): franja verde de resuelto, ícono
                  de la categoría, foto pasada por `safeClaimMediaUrl` y un
                  solo enlace. La de acá tenía un badge en Title Case, la foto
                  cruda y dos enlaces al mismo reclamo. Sin comparador
                  antes/después: las fotos del reclamo son del problema; la
                  evidencia de la solución vive en el detalle. */}
              <ul class="grid gap-3 md:grid-cols-2">
                {filteredClaims.map((claim) => (
                  <li key={claim.id}>
                    <ClaimCard
                      claim={{
                        ...claim,
                        category: claim.category as ClaimCategory,
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Con más resueltos que el techo del listado, se dice cuántos se
              ven y se ofrece el listado completo, que pagina. El filtro de
              categoría viaja en el enlace: acá sólo filtra lo cargado. */}
          {showClaims && claimsTruncated && (
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Se muestran los {{shown}} reclamos resueltos más recientes de {{total}}.",
                { shown: resolvedClaims.length, total: resolvedTotal },
              )}{" "}
              <Link
                href={`${routes.communityTab(community.slug, "reclamos")}?estado=resueltos${
                  selectedCategory.value === "all"
                    ? ""
                    : `&categoria=${encodeURIComponent(selectedCategory.value)}`
                }`}
                class="font-semibold text-brand hover:underline"
              >
                {translate(locale, "Ver todos los reclamos resueltos")}
              </Link>
            </p>
          )}

          {showProjects && completedProjects.length > 0 && (
            <section class="space-y-4">
              <h2 class="flex items-center gap-2 text-lg font-semibold text-ink-strong">
                <Icon
                  name={CONTENT_KINDS.project.icon}
                  class={CONTENT_KIND_TONES.project.text}
                />
                <span>
                  {translate(locale, "Proyectos comunitarios completados")}
                </span>
                <span class="text-sm font-normal tabular-nums text-ink-faint">
                  {formatNumber(completedProjects.length, locale)}
                </span>
              </h2>

              {/* La anatomía de ProjectCard sin montos: este listado no los
                  carga, y "Todavía sin compromisos" sería afirmar algo que
                  nadie consultó (D74). El enlace vive en el título y se
                  estira sobre la tarjeta (`after:inset-0`), así no hay dos
                  enlaces al mismo proyecto ni bloques dentro de un `<a>`. */}
              <ul class="grid gap-3 md:grid-cols-2">
                {completedProjects.map((project) => (
                  <li key={project.id}>
                    <Card
                      interactive
                      accent="border-l-success-500"
                      class="group relative flex h-full flex-col p-5"
                    >
                      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Icon
                          name={CONTENT_KINDS.project.icon}
                          class={CONTENT_KIND_TONES.project.text}
                        />
                        <Badge tone="success">
                          <Icon name="check" />
                          {translate(
                            locale,
                            PROJECT_STATUS_LABEL.completed.label,
                          )}
                        </Badge>
                        <span class="ml-auto text-ink-faint">
                          <RelativeTime value={project.created_at} />
                        </span>
                      </div>

                      <h3
                        dir="auto"
                        class="font-display text-display-xs text-ink-strong"
                      >
                        <Link
                          href={routes.project(project.id)}
                          class="transition-colors after:absolute after:inset-0 after:rounded-2xl group-hover:text-brand focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
                        >
                          {project.title}
                        </Link>
                      </h3>

                      {project.summary && (
                        <p
                          dir="auto"
                          class="ugc-text mt-2 line-clamp-3 text-base text-ink-muted"
                        >
                          {project.summary}
                        </p>
                      )}

                      {/* Pista visual de que la tarjeta entera abre el
                          proyecto; el enlace ya se anuncia con el título. */}
                      <span
                        aria-hidden="true"
                        class="mt-auto inline-flex items-center gap-1 self-start pt-4 text-sm font-medium text-brand"
                      >
                        {translate(locale, "Ver el proyecto")}
                        <Icon
                          name="arrow-right"
                          class="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                        />
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showProjects && projectsTruncated && (
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Se muestran los {{shown}} proyectos completados más recientes de {{total}}.",
                { shown: completedProjects.length, total: completedTotal },
              )}{" "}
              <Link
                href={`${routes.communityTab(community.slug, "proyectos")}?estado=completados`}
                class="font-semibold text-brand hover:underline"
              >
                {translate(locale, "Ver todos los proyectos completados")}
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useCommunityVictories);
  const locale = resolveValue(useLocaleLoader) ?? "es";
  const name = data?.community.name ?? "Comunidad";

  // El mismo nombre que el chip de la herramienta.
  return {
    title: `${translate(locale, "Victorias")} · ${name} · ${APP_NAME}`,
  };
};
