import {
  $,
  component$,
  Slot,
  useOnDocument,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import {
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  zod$,
  z,
} from "@qwik.dev/router";
import { CommunityFollowForm } from "~/components/community/CommunityPreferences";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { Chip, Icon, MetaLine, cx } from "~/components/ui";
import { CONTENT_KIND_TONES, type ContentKind } from "~/lib/content-kinds";
import type { CommunityRef } from "~/lib/community";
import {
  communitySectionFromPath,
  communitySlugFromRoute,
  isCommunityCreationPath,
  routes,
} from "~/lib/community";
import { CHILD_LEVEL_LABEL, LEVEL_NAMES, LOAD_FAILED } from "~/lib/constants";
import { setCommunityFollowing } from "~/lib/community-preferences";
import {
  COMMUNITY_TOOLS,
  communitySections,
  communityTools,
  compareViews,
  sectionIdFor,
  type CommunitySection,
} from "~/lib/community-sections";
import { communityCount } from "~/lib/community-counts";
import { formatNumber } from "~/lib/format";
import { getViewer, supabase, viewerIsMember } from "~/lib/session";
import type { Tables } from "~/lib/database.types.helpers";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";
import {
  authEntryHref,
  onboardingPath,
  returnPathFor,
} from "~/lib/auth-navigation";
import { residenceHint } from "~/lib/residence-hint";
import { localeTag, resolveLocale, translate, useLocale } from "~/lib/i18n";
import { whatsAppShareUrl } from "~/lib/share";

/** Secciones que son un tipo de contenido y por eso toman su color (D123). */
const SECTION_KIND: Record<string, ContentKind | undefined> = {
  encuestas: "poll",
  debates: "debate",
  reclamos: "claim",
  proyectos: "project",
};

export interface CommunityContext {
  community: Tables<"communities">;
  chain: CommunityRef[];
  childCount: number | null;
  isMember: boolean;
  isFollowing: boolean;
  isAuthenticated: boolean;
  /** Eligió residencia: sin ella, publicar manda primero al onboarding. */
  hasResidence: boolean;
  /**
   * Con sesión pero sin perfil legible: no se sabe si eligió residencia, así
   * que no se afirma nada sobre la persona (D116).
   */
  residenceUnknown: boolean;
  counts: {
    polls: number | null;
    debates: number | null;
    claims: number | null;
    resolvedClaims: number | null;
    projects: number | null;
    info: number | null;
  };
  /** Si la comunidad tiene al menos una ronda de presupuesto (D59). */
  hasBudget: boolean | null;
  isModerator: boolean;
}

/**
 * Datos de la comunidad, compartidos por todas las pestañas.
 * Las rutas hijas lo consumen importando `useCommunity` desde este layout.
 */
export const useCommunity = routeLoader$<CommunityContext>(async (ev) => {
  const db = supabase(ev);
  const viewer = await getViewer(ev);
  const slug = communitySlugFromRoute(ev.params, ev.url);

  const { data: community, error: communityError } = await db
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  // Una comunidad no deja de existir porque la consulta falle. Es la página más
  // enlazada del sitio: contestar 404 ante un error transitorio le pide a los
  // buscadores que la desindexen y le dice a quien vive ahí que su comunidad
  // ya no está.
  if (communityError) {
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }

  if (!community) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "No encontramos esa comunidad."),
    );
  }

  const segments = community.path.split(".");
  const ancestorPaths = segments.map((_, i) =>
    segments.slice(0, i + 1).join("."),
  );

  // Todos los conteos en paralelo: la cabecera los necesita juntos.
  const [
    chainRes,
    childRes,
    pollsRes,
    debatesRes,
    claimsRes,
    resolvedClaimsRes,
    projectsRes,
    infoRes,
    followRes,
    budgetRes,
  ] = await Promise.all([
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .in("path", ancestorPaths)
      .order("level", { ascending: true }),
    db
      .from("communities")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", community.id),
    db
      .from("polls")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id)
      .neq("status", "removed")
      // Las rondas de un acuerdo (D118) no cuentan como encuestas de la pestaña.
      .is("agreement_id", null),
    db
      .from("debates")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id)
      .neq("status", "removed"),
    db
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id)
      .neq("status", "removed"),
    db
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id)
      .eq("status", "resolved"),
    db
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("community_id", community.id)
      .neq("status", "removed"),
    db
      .from("community_info")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id),
    viewer.userId
      ? db
          .from("follows")
          .select("community_id")
          .eq("user_id", viewer.userId)
          .eq("community_id", community.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("community_budgets")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id),
  ]);

  return {
    community,
    chain: chainRes.data ?? [],
    childCount: communityCount(childRes),
    isMember: viewerIsMember(viewer, community.path),
    isFollowing: !!followRes.data,
    isAuthenticated: !!viewer.userId,
    // La misma señal que `requireResident`: la cadena puede venir vacía por
    // un fallo de consulta y mandaría a elegir residencia a quien ya la tiene.
    hasResidence: !!viewer.profile?.home_community_id,
    residenceUnknown: !!viewer.userId && !viewer.profile,
    counts: {
      polls: communityCount(pollsRes),
      debates: communityCount(debatesRes),
      claims: communityCount(claimsRes),
      resolvedClaims: communityCount(resolvedClaimsRes),
      projects: communityCount(projectsRes),
      info: communityCount(infoRes),
    },
    // D59: una comunidad sin partida no muestra la pestaña. Un presupuesto
    // vacío en todas menos las que tienen recursos convertiría la función en
    // un recordatorio de quién no los tiene.
    hasBudget: communityCount(budgetRes) === null ? null : budgetRes.count! > 0,
    isModerator: viewer.isModerator,
  };
});

export const useToggleFollow = routeAction$(
  (data, ev) => setCommunityFollowing(data, ev),
  zod$({
    community_id: z.string().uuid(),
    following: z.enum(["true", "false"]),
  }),
);

export default component$(() => {
  const data = useCommunity();
  const toggleFollow = useToggleFollow();
  const loc = useLocation();
  const locale = useLocale();
  const tag = localeTag(locale);
  const tabsList = useSignal<HTMLUListElement>();
  // Si el carril ya se deslizó, quedan pestañas escondidas a la izquierda.
  const railScrolled = useSignal(false);
  const moreMenu = useSignal<HTMLDetailsElement>();
  const lastPath = useSignal(loc.url.pathname);

  const hint = residenceHint(data.value);
  const { community, chain, isMember, counts, childCount, hasBudget } =
    data.value;
  const { primary, more } = communitySections({
    level: community.level,
    childCount,
    hasBudget,
  });
  const base = routes.community(community.slug);
  const countsUnavailable =
    childCount === null ||
    hasBudget === null ||
    Object.values(counts).some((count) => count === null);

  // El formulario ya trae su miga, su título y "Se publica en". Con la cabecera
  // de la comunidad arriba había dos h1 y el primer campo quedaba fuera de la
  // primera pantalla. Las pestañas se quedan (D79). Se mira la ruta en cada render
  // porque este layout sigue montado al llegar desde la sección y al volver con
  // Atrás, y se condiciona lo que rodea al único `Slot` en vez de devolver otro
  // árbol: el beta ya dio problemas con el `Slot` y con los hosts (D98, FormShell).
  const creating = isCommunityCreationPath(loc.url.pathname);
  const section = communitySectionFromPath(loc.url.pathname, community.slug);
  const activeId = sectionIdFor(section);
  // La sección de "Más" que se está viendo pasa al final del carril como una
  // pestaña más: pintada sobre el botón de "Más" se leía como un llamado a la
  // acción y, en el teléfono, le quitaba el carril a las pestañas (D126).
  // Presupuesto sin partida no figura en "Más" y tampoco se suma acá aunque
  // se abra por enlace directo: una comunidad sin partida no muestra la
  // pestaña (D59).
  const activeMore = more.find((tab) => tab.id === activeId);
  const railTabs: readonly CommunitySection[] = activeMore
    ? [...primary, activeMore]
    : primary;
  const activeTool = COMMUNITY_TOOLS.find((tool) => tool.segment === section);
  // Una herramienta abierta por enlace directo sigue marcada aunque no
  // corresponda a este nivel.
  const tools = communityTools(community.level);
  if (activeTool && !tools.includes(activeTool)) tools.push(activeTool);
  const comparing =
    activeId === "comparar"
      ? compareViews({ level: community.level, childCount })
      : [];

  const countFor = (id: string): number | null => {
    if (id === "info") return counts.info;
    if (id === "miembros") return community.member_count;
    if (id === "encuestas") return counts.polls;
    if (id === "debates") return counts.debates;
    if (id === "reclamos") return counts.claims;
    if (id === "proyectos") return counts.projects;
    if (id === "sub") return childCount;
    return null;
  };

  // "Más" es un `<details>` para que funcione sin JavaScript. Con él, se
  // cierra como los demás menús: con Escape, al tocar fuera y al navegar.
  useOnDocument(
    "keydown",
    $((event: KeyboardEvent) => {
      if (event.key !== "Escape" || !moreMenu.value?.open) return;
      moreMenu.value.open = false;
      moreMenu.value.querySelector("summary")?.focus();
    }),
  );
  useOnDocument(
    "pointerdown",
    $((event: PointerEvent) => {
      const menu = moreMenu.value;
      if (!menu?.open) return;
      const target = event.target as Node | null;
      if (target && menu.contains(target)) return;
      menu.open = false;
    }),
  );

  // En pantallas angostas, una ruta profunda puede dejar la pestaña activa
  // fuera del tramo visible. Se centra al hidratar y cada vez que cambia la
  // ruta, sin desplazar verticalmente el documento.
  // eslint-disable-next-line qwik/no-use-visible-task -- depende de medidas y scroll del DOM
  useVisibleTask$(({ track, cleanup }) => {
    const path = track(() => loc.url.pathname);
    // Sólo al cambiar de ruta: la tarea corre también al hidratar, y si el
    // primer toque había sido abrir "Más", lo volvía a cerrar.
    if (path !== lastPath.value) {
      lastPath.value = path;
      if (moreMenu.value) moreMenu.value.open = false;
    }

    const frame = requestAnimationFrame(() => {
      const list = tabsList.value;
      if (!list || list.scrollWidth <= list.clientWidth) return;

      const active = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;

      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const left =
        list.scrollLeft +
        activeRect.left -
        listRect.left -
        (list.clientWidth - activeRect.width) / 2;

      list.scrollTo({
        left,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    });

    cleanup(() => cancelAnimationFrame(frame));
  });

  // `--level-n` existe de 0 a 5; un nivel fuera de rango cae al último.
  const levelTint = Math.min(5, Math.max(0, community.level));

  return (
    <div data-community-page>
      {/* ------------------------------------------------------------ Cabecera */}
      {!creating && (
        <header
          class="level-band bg-surface"
          // Banda teñida con el matiz del nivel geográfico (D123): el color
          // ya existía como `--level-n` para ubicarse en la jerarquía; acá
          // pasa de una etiqueta a una franja suave detrás de la identidad.
          style={{ "--level-tint": `var(--level-${levelTint})` }}
        >
          <div class="container-content pt-6">
            <CommunityBreadcrumb chain={chain} class="mb-5" />

            <div class="flex flex-wrap items-start gap-4 sm:gap-5">
              {/* El emoji es identidad elegida por la comunidad y se queda;
                  el fondo gris lo hacía parecer un marcador de posición. */}
              <span
                aria-hidden="true"
                class="grid size-18 shrink-0 place-items-center rounded-3xl border border-subtle bg-surface text-4xl shadow-soft sm:size-20 sm:text-5xl"
              >
                {community.emoji ?? "📍"}
              </span>

              <div class="min-w-0 flex-1">
                <h1 class="text-display-lg sm:text-display-xl">
                  {community.name}
                </h1>

                {/* Nivel, pertenencia y cantidades en una sola línea de texto
                    discreto: antes eran badges y píldoras que competían con
                    el título (D123). */}
                <MetaLine class="mt-2 text-sm text-ink-muted">
                  <span>
                    {translate(
                      locale,
                      LEVEL_NAMES[community.level] ?? "Comunidad",
                    )}
                  </span>
                  {isMember && (
                    <>
                      <span class="inline-flex items-center gap-1 font-semibold text-success">
                        <Icon name="check" />
                        {translate(locale, "Sos parte")}
                      </span>
                    </>
                  )}
                  <span class="inline-flex items-center gap-1.5">
                    <Icon name="users" class="text-ink-faint" />
                    <strong class="font-semibold tabular-nums text-ink-strong">
                      {formatNumber(community.member_count, locale)}
                    </strong>{" "}
                    {translate(
                      locale,
                      community.member_count === 1 ? "miembro" : "miembros",
                    )}
                  </span>
                  {childCount !== null && childCount > 0 && (
                    <>
                      <span class="inline-flex items-center gap-1.5">
                        <Icon name="layers" class="text-ink-faint" />
                        <strong class="font-semibold tabular-nums text-ink-strong">
                          {formatNumber(childCount, locale)}
                        </strong>{" "}
                        {translate(
                          locale,
                          CHILD_LEVEL_LABEL[community.level] ??
                            "Sub-comunidades",
                        ).toLocaleLowerCase(tag)}
                      </span>
                    </>
                  )}
                </MetaLine>

                {community.description && (
                  <p class="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
                    {community.description}
                  </p>
                )}
              </div>

              <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                {/* Invitar es de quien vive acá: a una visitante le pedía
                    traer vecinos a una comunidad que todavía no es suya, y
                    sumaba un tercer llamado antes del contenido (décima
                    ronda, mejora 1). */}
                {isMember && (
                  <a
                    // El mensaje iba en español fijo y saludaba "vecinos" también
                    // de un continente o de la Tierra.
                    href={whatsAppShareUrl(
                      translate(
                        locale,
                        "Sumate a {{name}} en Agorbis para votar encuestas, visibilizar reclamos y proponer proyectos: {{url}}",
                        {
                          name: community.name,
                          url: `${loc.url.origin}${base}`,
                        },
                      ),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-success-700 px-4 text-sm font-semibold text-white shadow-soft transition-transform hover:scale-[1.02] hover:bg-success-800 active:scale-[0.98] sm:w-auto"
                    aria-label={translate(
                      locale,
                      "Invitar vecinos por WhatsApp",
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      class="size-4 fill-current"
                      aria-hidden="true"
                    >
                      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z" />
                    </svg>
                    <span>{translate(locale, "Invitar vecinos")}</span>
                  </a>
                )}

                {/* Seguir sólo tiene sentido si no vivís acá. Sin sesión no
                    hay botón: el recuadro de abajo ya pide crear la cuenta,
                    y un único llamado se entiende mejor que dos. */}
                {!isMember && data.value.isAuthenticated && (
                  <CommunityFollowForm
                    community={community}
                    initialFollowing={data.value.isFollowing}
                    action={toggleFollow}
                  />
                )}
              </div>
            </div>

            {!isMember && (
              <div class="mt-5 flex flex-col items-stretch gap-3.5 rounded-2xl border border-subtle bg-muted/60 p-4 text-sm text-ink-muted shadow-soft sm:flex-row sm:items-center sm:justify-between">
                <div class="flex items-start gap-2.5">
                  <Icon
                    name="info"
                    class="mt-0.5 shrink-0 text-base text-brand"
                  />
                  {/* "Residencia declarada" sólo para quien la declaró; texto
                      y botón salen de la misma función (D116). */}
                  <p class="leading-relaxed">
                    {hint === "signin"
                      ? translate(
                          locale,
                          "Podés leer esta comunidad. Creá una cuenta para seguirla y declará tu residencia para votar o comentar acá.",
                        )
                      : hint === "unknown"
                        ? translate(
                            locale,
                            "No pudimos leer tu residencia. Podés leer y seguir esta comunidad; recargá la página para ver si también podés votar o comentar acá.",
                          )
                        : hint === "choose"
                          ? translate(
                              locale,
                              "Todavía no elegiste dónde vivís. Podés leer y seguir esta comunidad; para votar o comentar acá, elegí tu residencia.",
                            )
                          : translate(
                              locale,
                              "Tu residencia declarada no pertenece a {{name}}. Podés leer y seguir esta comunidad, pero no votar ni comentar acá.",
                              { name: community.name },
                            )}
                  </p>
                </div>
                {hint === "choose" ? (
                  <Link
                    href={onboardingPath(returnPathFor(loc.url))}
                    class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-brand-700 sm:min-h-8"
                  >
                    {translate(locale, "Elegir mi residencia")}
                  </Link>
                ) : hint === "elsewhere" ? (
                  <Link
                    href={`/perfil/residencia?parent=${community.slug}`}
                    class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl bg-surface border border-control px-4 text-xs font-semibold text-brand shadow-sm transition-colors hover:bg-brand-50 sm:min-h-8"
                  >
                    {translate(locale, "Revisar mi residencia")}
                  </Link>
                ) : hint === "unknown" ? null : (
                  // En el teléfono las dos salidas van en un renglón: apiladas
                  // a todo el ancho sumaban alto en cada sección (el texto del
                  // aviso, D116, no cambia).
                  <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-col sm:items-end sm:gap-1.5">
                    <Link
                      href={authEntryHref("/registro", loc.url)}
                      class="inline-flex min-h-9 items-center justify-center rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-brand-700 sm:min-h-8"
                    >
                      {translate(locale, "Crear cuenta")}
                    </Link>
                    {/* Quien ya tiene cuenta y llegó por un enlace no tiene
                        que pasar por "Crear cuenta" para enterarse de que
                        existe Ingresar: el camino corto va al lado. */}
                    <p class="text-xs text-ink-muted sm:text-right">
                      {translate(locale, "¿Ya tenés cuenta?")}{" "}
                      <Link
                        href={authEntryHref("/ingresar", loc.url)}
                        class="font-semibold text-brand hover:underline"
                      >
                        {translate(locale, "Ingresá")}
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
      )}

      {/* Fuera del encabezado: el contenedor permite seguir al contenido. */}
      <nav
        aria-label={translate(locale, "Secciones de la comunidad")}
        class="sticky top-16 z-30 border-b border-subtle bg-surface/95 py-1.5 backdrop-blur-md"
      >
        {/* Eran nueve pestañas. Quedan a la vista las cinco de participar y
            el resto pasa a "Más", fuera del carril que se desplaza para que
            el desplegable no quede recortado (D96). */}
        <div class="container-content flex items-center gap-1.5">
          {/* A 390 px el carril cortaba una pestaña por la mitad y nada
              decía que seguía: un degradé fijo a la derecha avisa el
              desborde, y el relleno final deja que la última pestaña entre
              entera antes del degradé (décima ronda, mejora 5). Desde `sm`
              el carril ocupa sólo lo que miden sus pestañas y "Más" queda
              pegado a la última, no en el borde junto a los llamados de la
              cabecera; si no entran, se achica y se desplaza (D126). */}
          <div
            data-tabs-fade
            data-scrolled={railScrolled.value || undefined}
            // El degradé de la derecha avisa que hay más pestañas; el de la
            // izquierda aparece cuando el carril se deslizó. Sin él la
            // primera pestaña quedaba cortada contra el borde ("royectos").
            class="relative min-w-0 flex-1 before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-8 before:bg-gradient-to-r before:from-surface before:to-transparent before:opacity-0 before:transition-opacity after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-gradient-to-l after:from-surface after:to-transparent data-[scrolled]:before:opacity-100 sm:flex-initial sm:before:hidden sm:after:hidden"
          >
            <ul
              ref={tabsList}
              onScroll$={(_, list) =>
                (railScrolled.value = list.scrollLeft > 4)
              }
              class="scrollbar-slim -mb-px flex min-w-0 scroll-smooth snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain py-1 pr-10 sm:pr-0"
            >
              {railTabs.map((tab) => {
                const href = tab.segment ? `${base}/${tab.segment}` : base;
                const isActive = activeId === tab.id;
                const count = countFor(tab.id);
                // La pestaña activa de un tipo de contenido toma el color de
                // su tipo (D123); Info y el resto siguen en violeta.
                const kind = SECTION_KIND[tab.id];
                return (
                  <li key={tab.id} class="shrink-0 snap-start">
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      class={cx(
                        "flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95",
                        isActive
                          ? cx(
                              "font-semibold shadow-soft",
                              kind
                                ? CONTENT_KIND_TONES[kind].selected
                                : "border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500",
                            )
                          : "border-transparent text-ink-muted hover:bg-muted hover:text-ink-strong",
                      )}
                    >
                      <Icon name={tab.icon} class="text-base" />
                      <span>{translate(locale, tab.label)}</span>
                      {count !== null && count > 0 && (
                        <span
                          class={cx(
                            "rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-inset text-ink-faint",
                          )}
                        >
                          {formatNumber(count, locale)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <details ref={moreMenu} data-community-more class="relative shrink-0">
            {/* "Más" es el desborde de las pestañas, no un llamado a la
                acción: queda neutro aunque la sección abierta viva acá,
                porque esa sección ya se marca en el carril (D126). */}
            <summary class="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium text-ink-muted transition-all duration-150 hover:bg-muted hover:text-ink-strong active:scale-95 [&::-webkit-details-marker]:hidden">
              <span class="sr-only">{translate(locale, "Más secciones")}</span>
              <span aria-hidden="true">{translate(locale, "Más")}</span>
              <Icon name="chevron-down" class="text-xs" />
            </summary>
            <ul class="animate-scale-pop absolute right-0 top-full z-40 mt-1.5 w-60 rounded-2xl border border-subtle bg-surface p-1.5 shadow-lift">
              {more.map((tab) => {
                const isActive = activeId === tab.id;
                const count = countFor(tab.id);
                return (
                  <li key={tab.id}>
                    {/* Resaltada pero sin `aria-current`: la pestaña del
                        carril ya anuncia la página, y dos "página actual" en
                        la misma navegación confunden al lector de pantalla. */}
                    <Link
                      href={`${base}/${tab.segment}`}
                      onClick$={() => {
                        if (moreMenu.value) moreMenu.value.open = false;
                      }}
                      class={cx(
                        "flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm transition-colors",
                        isActive
                          ? "bg-brand-50 font-semibold text-brand dark:bg-brand-950/50"
                          : "text-ink hover:bg-muted",
                      )}
                    >
                      <Icon name={tab.icon} class="text-base text-ink-muted" />
                      <span class="flex-1">{translate(locale, tab.label)}</span>
                      {count !== null && count > 0 && (
                        <span class="rounded-full bg-inset px-2 py-0.5 text-2xs font-semibold tabular-nums text-ink-faint">
                          {formatNumber(count, locale)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      </nav>

      {/* El formulario trae su propio contenedor. Este otro le sumaba 32 px de
          alto y, en el teléfono, le quitaba 32 de ancho: más líneas partidas y el
          primer campo debajo de la barra inferior. */}
      <div class={creating ? undefined : "container-content py-8"}>
        {countsUnavailable && !creating && (
          <p
            role="status"
            class="mb-5 rounded-2xl border border-warn-500/30 bg-warn-500/5 p-4 text-sm text-ink-muted"
          >
            {translate(
              locale,
              "Algunas cantidades no están disponibles. Podés consultar las secciones o volver a cargar.",
            )}{" "}
            <a
              href={`${loc.url.pathname}${loc.url.search}`}
              class="inline-flex min-h-11 items-center font-semibold text-brand underline"
            >
              {translate(locale, "Reintentar")}
            </a>
          </p>
        )}
        {activeTool && (
          <nav
            aria-label={translate(locale, "Herramientas de la comunidad")}
            class="mb-6"
          >
            {/* Un solo chip para toda la interfaz (D123). */}
            <ul class="flex flex-wrap gap-2">
              {tools.map((tool) => (
                <li key={tool.label}>
                  <Chip
                    variant="action"
                    href={`${base}/${tool.segment}`}
                    selected={activeTool.segment === tool.segment}
                    icon={tool.icon}
                  >
                    {translate(locale, tool.label)}
                  </Chip>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {/* Contraste y Comparativa eran dos destinos que comparaban
            territorios; ahora son dos vistas de Comparar (D96). */}
        {comparing.length > 1 && (
          <nav
            aria-label={translate(locale, "Formas de comparar")}
            class="mb-6"
          >
            <ul class="flex flex-wrap gap-2">
              {comparing.map((view) => (
                <li key={view.segment}>
                  <Chip
                    variant="action"
                    href={`${base}/${view.segment}`}
                    selected={section === view.segment}
                  >
                    {translate(locale, view.label)}
                  </Chip>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <Slot />
      </div>
    </div>
  );
});
