import { component$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  useLocation,
  type DocumentHead,
} from "@qwik.dev/router";
import type { CommunityCardData } from "~/components/community/CommunityCard";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Chip,
  Icon,
  type IconName,
  cx,
} from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { ChainDiagram } from "~/components/community/ChainDiagram";
import { HeroBackdrop } from "~/components/layout/HeroBackdrop";
import { LocalDataCleanup } from "~/components/layout/LocalDataCleanup";
import { compareNames, contentHref, routes } from "~/lib/community";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  LEVEL_CONTINENT,
  LEVEL_COUNTRY,
  LOAD_FAILED,
} from "~/lib/constants";
import { formatNumber } from "~/lib/format";
import { getViewer, supabase } from "~/lib/session";
import {
  loadRecentActivity,
  type RecentActivityItem,
} from "~/lib/recent-activity";
import { signedInHome } from "~/lib/auth-navigation";
import { SOCIAL_IMAGE_PATH, socialImageMeta } from "~/lib/social-meta";
import { supportPageHref } from "~/lib/support";
import { SupportNote } from "~/components/support/SupportNote";
import { logFailure } from "~/lib/log";
import { useViewer } from "./layout";
import {
  useLocale,
  resolveLocale,
  translate,
  canonicalHref,
  localeTag,
  SUPPORTED_LOCALES,
} from "~/lib/i18n";
import { useLocaleLoader } from "./layout";

/** La portada se ancla en el país donde arranca Agorbis. */
const HOME_REGION = "argentina";

interface RegionLink {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface LandingData {
  communityCount: number;
  countryCount: number;
  continents: CommunityCardData[];
  /** Provincias de Argentina; sin ella, los continentes. */
  regions: RegionLink[];
  /** La comunidad que agrupa `regions`, o `null` si son los continentes. */
  region: { slug: string; name: string } | null;
  /** Últimas publicaciones públicas; vacío si no hay o no se pudieron leer. */
  recent: RecentActivityItem[];
  /** Cadena de residencia del visitante, si ya eligió. */
  homeSlug: string | null;
}

export const useLanding = routeLoader$<LandingData>(async (ev) => {
  const db = supabase(ev);
  const viewer = await getViewer(ev);

  // La portada presenta Agorbis a quien todavía no lo conoce. El logo, el
  // ingreso sin destino y los regresos de Google o del correo terminaban acá
  // también con sesión: en marketing, a un clic de la propia actividad. Los
  // regresos del cierre de sesión y de la baja se quedan para su aviso.
  const home = signedInHome(viewer);
  if (
    home &&
    !ev.url.searchParams.has("sesion") &&
    !ev.url.searchParams.has("cuenta")
  ) {
    ev.headers.set("Cache-Control", "private, no-store");
    throw ev.redirect(302, home);
  }

  const [countRes, countryRes, continentsRes, regionRes, recent] =
    await Promise.all([
      db.from("communities").select("*", { count: "exact", head: true }),
      // Antes el hero afirmaba "195 países" con el número escrito a mano. Hoy
      // coincide, pero cualquier alta o baja de territorio convertía la portada
      // en una afirmación falsa sin que nadie se enterara.
      db
        .from("communities")
        .select("*", { count: "exact", head: true })
        .eq("level", LEVEL_COUNTRY),
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path, member_count, description")
        .eq("level", LEVEL_CONTINENT),
      db
        .from("communities")
        .select("id, slug, name")
        .eq("slug", HOME_REGION)
        .maybeSingle(),
      loadRecentActivity(ev),
    ]);
  const regionChildren = regionRes.data
    ? await db
        .from("communities")
        .select("id, slug, name, emoji")
        .eq("parent_id", regionRes.data.id)
        .order("name", { ascending: true })
    : null;
  const loadError =
    countRes.error ??
    countryRes.error ??
    continentsRes.error ??
    regionRes.error ??
    regionChildren?.error;
  if (loadError) {
    logFailure({ scope: "inicio/comunidades" }, loadError);
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }

  const locale = resolveLocale(ev.locale());
  const continents = (continentsRes.data ?? []).sort((a, b) =>
    compareNames(a.name, b.name, locale),
  );
  const provinces = (regionChildren?.data ?? []).sort((a, b) =>
    compareNames(a.name, b.name, locale),
  );

  return {
    communityCount: countRes.count ?? 0,
    countryCount: countryRes.count ?? 0,
    continents,
    regions: provinces.length > 0 ? provinces : continents,
    region:
      regionRes.data && provinces.length > 0
        ? { slug: regionRes.data.slug, name: regionRes.data.name }
        : null,
    recent,
    homeSlug: viewer.residenceChain.at(-1)?.slug ?? null,
  };
});

// Los pasos llevaban glifos tipográficos (⌖ ◎ ✦) que cada fuente dibuja a
// su manera; ahora usan el set de íconos propio (D125).
const STEPS: readonly { icon: IconName; title: string; body: string }[] = [
  {
    icon: "search",
    title: "Encontrá tu lugar",
    body: "Buscá tu ciudad, municipio o provincia y recorré la comunidad antes de registrarte.",
  },
  {
    icon: "map-pin",
    title: "Elegí tu residencia",
    body: "Una sola elección te conecta también con tu provincia, país, continente y la Tierra.",
  },
  {
    icon: "sparkles",
    title: "Empezá a participar",
    body: "Votá, debatí, apoyá reclamos o impulsá proyectos en las comunidades que te corresponden.",
  },
];

// Cada herramienta se pinta con la familia de su tipo (D123) y con su ícono,
// en lugar de un color elegido a mano por tarjeta y un emoji (D125). Las
// clases van completas para que Tailwind las genere.
const PARTICIPATION = [
  {
    kind: "poll",
    title: "Encuestas",
    body: "Convertí preguntas en decisiones medibles, con resultados al cierre.",
    detail: "Tu elección no se guarda",
    border: "border-t-kind-poll",
  },
  {
    kind: "debate",
    title: "Debates",
    body: "Separá miradas por territorio sin perder la conversación común.",
    detail: "Contexto geográfico",
    border: "border-t-kind-debate",
  },
  {
    kind: "claim",
    title: "Reclamos",
    body: "Hacé visible un problema, reuní apoyos y seguí cada respuesta.",
    detail: "Seguimiento público",
    border: "border-t-kind-claim",
  },
  {
    kind: "project",
    title: "Proyectos",
    body: "Pasá de la propuesta a un plan con presupuesto, tiempos y aportes.",
    detail: "Avance verificable",
    border: "border-t-kind-project",
  },
] as const;

const TRUST_POINTS = [
  {
    title: "Privacidad por defecto",
    body: "Tu elección no queda guardada: sólo se suma al total y registramos que participaste.",
  },
  {
    title: "Participación con contexto",
    body: "Tu residencia define dónde podés votar y publicar; todas las comunidades se pueden leer.",
  },
  {
    title: "Seguimiento visible",
    body: "Reclamos, respuestas y avances conservan un historial público.",
  },
] as const;

export default component$(() => {
  const data = useLanding();
  const viewer = useViewer();
  const locale = useLocale();
  const loc = useLocation();
  const { continents, countryCount, communityCount } = data.value;

  // Cobertura real, no adopción simulada: durante una etapa temprana el número
  // de miembros perjudica más de lo que ayuda. Estas tres cifras describen con
  // honestidad qué parte del mundo ya se puede recorrer.
  const stats = [
    communityCount > 0 && {
      key: "communities",
      value: communityCount,
      tone: "text-brand",
      label: translate(
        locale,
        communityCount === 1
          ? "comunidad disponible"
          : "comunidades disponibles",
      ),
    },
    countryCount > 0 && {
      key: "countries",
      value: countryCount,
      tone: "text-ink-strong",
      label: translate(locale, countryCount === 1 ? "país" : "países"),
    },
    continents.length > 0 && {
      key: "continents",
      value: continents.length,
      tone: "text-success",
      label: translate(
        locale,
        continents.length === 1 ? "continente" : "continentes",
      ),
    },
  ].filter(Boolean) as {
    key: string;
    value: number;
    tone: string;
    label: string;
  }[];

  const primaryAction = data.value.homeSlug
    ? {
        href: routes.community(data.value.homeSlug),
        label: "Ir a mi comunidad",
      }
    : viewer.value.userId
      ? { href: "/onboarding", label: "Elegí tu comunidad" }
      : { href: "/explorar", label: "Encontrá tu comunidad" };

  const secondaryAction = data.value.homeSlug
    ? { href: "/inicio", label: "Ver mi inicio" }
    : viewer.value.userId
      ? { href: "/explorar", label: "Explorar primero" }
      : { href: "/registro", label: "Crear cuenta gratis" };

  return (
    <>
      {/* Confirmación de la baja. Se llega acá redirigido desde el borrado, ya
          sin sesión: sin esto la cuenta desaparecía y la única señal era que
          el header dejaba de mostrar el avatar. `Alert` con tono distinto de
          `danger` ya se anuncia como `role="status"`. */}
      {/* Vuelta del cierre de sesión (`SIGNED_OUT_HOME`): misma limpieza que
          la baja, por si el formulario se envió sin que corriera su handler. */}
      {loc.url.searchParams.get("sesion") === "cerrada" && <LocalDataCleanup />}
      {loc.url.searchParams.get("cuenta") === "eliminada" && (
        <div class="container-content pt-6">
          {/* Sin JavaScript el formulario de baja no limpia el navegador: se
              hace acá, con la baja ya confirmada por el servidor. */}
          <LocalDataCleanup />
          <Alert
            tone={
              loc.url.searchParams.get("limpieza") === "pendiente"
                ? "warn"
                : "success"
            }
          >
            {translate(
              locale,
              loc.url.searchParams.get("limpieza") === "pendiente"
                ? "Tu cuenta se borró, pero algunos archivos no pudieron limpiarse automáticamente. El equipo quedó avisado para completar la limpieza."
                : "Tu cuenta se borró. Lo que publicaste sigue en pie, ya sin tu nombre.",
            )}
          </Alert>
        </div>
      )}

      {/* ---------------------------------------------------------------- Hero */}
      <section
        class="relative overflow-hidden border-b border-subtle"
        aria-labelledby="hero-titulo"
      >
        <HeroBackdrop />

        <div class="relative container-content py-12 sm:py-16 xl:py-20">
          <div class="grid grid-cols-1 items-center gap-9 xl:grid-cols-[1.08fr_0.92fr] xl:gap-16">
            <div class="text-center xl:text-left">
              <p class="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand shadow-soft dark:border-brand-800 dark:bg-brand-950/60">
                <span aria-hidden="true">🌍</span>
                {translate(locale, "Participación local, conexión global")}
              </p>

              <h1
                id="hero-titulo"
                class="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl xl:mx-0 xl:text-[3.75rem]"
              >
                <span class="block">
                  {translate(locale, "Participá en tu comunidad.")}
                </span>
                <span class="block text-brand">
                  {translate(locale, "Llevá tu voz más lejos.")}
                </span>
              </h1>

              <p class="mx-auto mt-5 max-w-2xl text-balance text-lg leading-relaxed text-ink-muted xl:mx-0">
                {translate(
                  locale,
                  "Encontrá tu comunidad, participá en decisiones locales y seguí cómo las ideas escalan desde tu ciudad hasta el mundo.",
                )}
              </p>

              <div class="mx-auto mt-7 grid w-full max-w-md grid-cols-1 gap-3 sm:flex sm:max-w-none sm:justify-center xl:mx-0 xl:justify-start">
                <ButtonLink
                  href={primaryAction.href}
                  size="lg"
                  class="w-full sm:w-auto"
                >
                  {translate(locale, primaryAction.label)}
                  <Icon name="arrow-right" />
                </ButtonLink>
                <ButtonLink
                  href={secondaryAction.href}
                  variant="secondary"
                  size="lg"
                  class="w-full sm:w-auto"
                >
                  {translate(locale, secondaryAction.label)}
                </ButtonLink>
              </div>

              {!viewer.value.userId && (
                <p class="mt-4 flex items-center justify-center gap-1.5 text-sm text-ink-muted xl:justify-start">
                  <Icon name="check" class="text-success" />
                  {translate(
                    locale,
                    "Explorá sin registrarte · Tu voto es secreto por defecto",
                  )}
                </p>
              )}
            </div>

            <ChainDiagram chain={viewer.value.residenceChain} />
          </div>

          {stats.length > 0 && (
            <dl
              aria-label={translate(locale, "Cobertura disponible en Agorbis")}
              class="mt-9 grid grid-cols-3 divide-x divide-[var(--border-subtle)] rounded-3xl border border-subtle bg-surface/80 px-2 py-4 shadow-soft sm:mx-auto sm:max-w-3xl sm:px-6 xl:mx-0 xl:max-w-none"
            >
              {stats.map((stat) => (
                <div
                  key={stat.key}
                  class="flex min-w-0 flex-col-reverse px-1 text-center sm:px-4"
                >
                  <dt class="mt-1 text-2xs leading-tight text-ink-muted sm:text-sm">
                    {stat.label}
                  </dt>
                  <dd
                    class={cx(
                      "font-display text-display-md tabular-nums",
                      stat.tone,
                    )}
                  >
                    {formatNumber(stat.value, locale)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ Pasando ahora */}
      {/* Las tarjetas de herramientas llevaban a la comunidad global, que en
          una Producción nueva está vacía. Lo que se ve acá son publicaciones
          reales de cualquier comunidad; si no hay ninguna, la sección no se
          muestra en lugar de inventar movimiento. */}
      {data.value.recent.length > 0 && (
        <section
          class="container-content py-12 sm:py-14"
          aria-labelledby="actividad-titulo"
        >
          <h2 id="actividad-titulo" class="text-display-md">
            {translate(locale, "Pasando ahora en Agorbis")}
          </h2>
          <p class="mt-2 text-ink-muted">
            {translate(
              locale,
              "Las últimas publicaciones de todas las comunidades. Podés leerlas sin registrarte.",
            )}
          </p>
          {/* Misma anatomía que la tarjeta del feed de Inicio (D123): franja
              y badge del tipo, comunidad con su emoji como identidad, fecha
              a la derecha y el título como pieza dominante (D125). */}
          <ul class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.value.recent.map((item) => {
              const meta = CONTENT_KINDS[item.kind];
              const tones = CONTENT_KIND_TONES[item.kind];
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={contentHref(item.kind, item.id)}
                    class="block h-full rounded-2xl"
                  >
                    <Card interactive accent={tones.accent} class="h-full p-4">
                      <div class="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                        <Chip
                          variant="badge"
                          icon={meta.icon}
                          toneClass={tones.badge}
                        >
                          {translate(locale, meta.label)}
                        </Chip>
                        {item.community && (
                          <span>
                            {item.community.emoji} {item.community.name}
                          </span>
                        )}
                        <RelativeTime
                          value={item.createdAt}
                          class="ml-auto tabular-nums"
                        />
                      </div>
                      <h3
                        dir="auto"
                        class="mt-3 line-clamp-2 font-display text-display-xs text-ink-strong"
                      >
                        {item.title}
                      </h3>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* -------------------------------------------- Explorador de jerarquía */}
      <section
        class="border-b border-subtle bg-muted/50"
        aria-labelledby="explorar-titulo"
      >
        <div class="container-content py-12 sm:py-14">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="max-w-2xl">
              <p class="text-sm font-semibold text-brand">
                {translate(locale, "Empezá por lo cercano")}
              </p>
              <h2 id="explorar-titulo" class="mt-1 text-display-md">
                {translate(locale, "Encontrá dónde participar")}
              </h2>
              <p class="mt-2 text-ink-muted">
                {translate(
                  locale,
                  "Buscá tu localidad o recorré el mapa. Podés leer cada comunidad antes de elegir la tuya.",
                )}
              </p>
            </div>
            {data.value.region && (
              <Link
                href={routes.community(data.value.region.slug)}
                class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {translate(locale, "Ver {{name}}", {
                  name: data.value.region.name,
                })}
                <Icon name="arrow-right" />
              </Link>
            )}
          </div>

          <form action="/buscar" method="get" class="mt-6 max-w-3xl">
            <label
              for="busqueda-home"
              class="mb-2 block text-sm font-medium text-ink-strong"
            >
              {translate(locale, "Escribí tu ciudad, provincia o país")}
            </label>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <div class="relative">
                <svg
                  viewBox="0 0 24 24"
                  class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path stroke-linecap="round" d="M20 20l-3.5-3.5" />
                </svg>
                <input
                  id="busqueda-home"
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  autocomplete="off"
                  aria-describedby="busqueda-home-ayuda"
                  placeholder={translate(
                    locale,
                    "Ej: Mar del Plata, Quilmes, Córdoba, Palermo…",
                  )}
                  class="h-12 w-full rounded-2xl border border-control bg-surface pl-12 pr-4 text-base text-ink shadow-soft placeholder:text-ink-faint focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                />
              </div>
              <Button type="submit" size="lg" class="w-full sm:w-auto">
                {translate(locale, "Buscar comunidad")}
              </Button>
            </div>
            <p id="busqueda-home-ayuda" class="mt-2 text-xs text-ink-muted">
              {translate(
                locale,
                data.value.region
                  ? "También podés elegir tu provincia acá abajo."
                  : "También podés empezar por un continente y bajar por la jerarquía.",
              )}
            </p>
          </form>

          <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-6">
            <h3 class="text-base font-semibold">
              {translate(
                locale,
                data.value.region
                  ? "Elegí tu provincia"
                  : "Explorá por continente",
              )}
            </h3>
            <Link
              href="/explorar"
              class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              {translate(locale, "Abrir Explorar")}
              <Icon name="arrow-right" />
            </Link>
          </div>

          {data.value.regions.length > 0 && (
            <ul class="mt-4 flex flex-wrap gap-2">
              {data.value.regions.map((region) => (
                <li key={region.id}>
                  <Link
                    href={routes.community(region.slug)}
                    class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-subtle bg-surface px-3.5 text-sm font-medium text-ink-strong transition-colors hover:border-brand-500 hover:text-brand"
                  >
                    <span aria-hidden="true">{region.emoji ?? "📍"}</span>
                    {region.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ Cómo funciona */}
      <section
        class="container-content py-14 sm:py-16"
        aria-labelledby="como-funciona"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "En tres pasos")}
            </p>
            <h2 id="como-funciona" class="mt-1 text-display-md">
              {translate(locale, "De tu localidad al mundo")}
            </h2>
            <p class="mt-2 text-ink-muted">
              {translate(
                locale,
                "Una ubicación conecta todas las escalas en las que tu voz importa.",
              )}
            </p>
          </div>
          <Link
            href="/manual"
            class="hidden min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-brand hover:bg-muted hover:underline sm:inline-flex"
          >
            {translate(locale, "Ver cómo funciona")}
            <Icon name="arrow-right" />
          </Link>
        </div>

        <ol class="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} class="relative">
              <Card class="h-full p-5 sm:p-6">
                <div class="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl text-brand dark:bg-brand-900/60"
                  >
                    <Icon name={step.icon} />
                  </span>
                  <span class="text-xs font-semibold uppercase tracking-[0.15em] text-brand">
                    {translate(locale, "Paso {{number}}", { number: i + 1 })}
                  </span>
                </div>
                <h3 class="mt-4 text-display-xs">
                  {translate(locale, step.title)}
                </h3>
                <p class="mt-2 text-sm leading-relaxed text-ink-muted">
                  {translate(locale, step.body)}
                </p>
              </Card>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  class="absolute -right-3 top-1/2 z-10 hidden size-6 -translate-y-1/2 place-items-center rounded-full border border-subtle bg-app text-xs text-brand lg:grid"
                >
                  <Icon name="chevron-right" />
                </span>
              )}
            </li>
          ))}
        </ol>

        {/* Las reglas iban en una sección aparte que repetía el botón
            principal; acá acompañan a los pasos que regulan. */}
        <h3 class="mt-10 text-display-xs">
          {translate(locale, "Reglas claras desde el inicio")}
        </h3>
        <ul class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {TRUST_POINTS.map((point) => (
            <li
              key={point.title}
              class="flex gap-3 rounded-2xl border border-subtle bg-surface p-4"
            >
              <span
                aria-hidden="true"
                class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success-700 text-xs text-white"
              >
                <Icon name="check" stroke={2.5} />
              </span>
              <div>
                <h4 class="text-sm font-semibold">
                  {translate(locale, point.title)}
                </h4>
                <p class="mt-1 text-sm leading-relaxed text-ink-muted">
                  {translate(locale, point.body)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <Link
          href="/manual"
          class="mt-5 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-brand hover:bg-muted hover:underline"
        >
          {translate(locale, "Conocé todas las reglas")}
          <Icon name="arrow-right" />
        </Link>
        <SupportNote href={supportPageHref()} />
      </section>

      {/* ------------------------------------------------ Formas de participar */}
      <section
        class="border-y border-subtle bg-surface"
        aria-labelledby="participar-titulo"
      >
        <div class="container-content py-14 sm:py-16">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "Ideas que se vuelven acción")}
            </p>
            <h2 id="participar-titulo" class="mt-1 text-display-md">
              {translate(locale, "Elegí la herramienta adecuada")}
            </h2>
            <p class="mt-2 text-ink-muted">
              {translate(
                locale,
                "No todo necesita una votación: cada conversación tiene una forma clara de avanzar.",
              )}
            </p>
          </div>

          <ul class="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {PARTICIPATION.map((item) => (
              <li key={item.kind}>
                <Card
                  as="article"
                  class={cx(
                    "flex h-full flex-col overflow-hidden border-t-2 p-5 sm:p-6",
                    item.border,
                  )}
                >
                  <div class="flex items-start gap-4">
                    <span
                      aria-hidden="true"
                      class={cx(
                        "grid size-11 shrink-0 place-items-center rounded-xl text-xl",
                        CONTENT_KIND_TONES[item.kind].bg,
                        CONTENT_KIND_TONES[item.kind].text,
                      )}
                    >
                      <Icon name={CONTENT_KINDS[item.kind].icon} />
                    </span>
                    <div class="min-w-0">
                      <h3 class="text-display-xs">
                        {translate(locale, item.title)}
                      </h3>
                      <p class="mt-1 text-sm leading-relaxed text-ink-muted">
                        {translate(locale, item.body)}
                      </p>
                      <p class="mt-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
                        {translate(locale, item.detail)}
                      </p>
                    </div>
                  </div>

                  <div
                    aria-hidden="true"
                    class="mt-5 h-24 overflow-hidden rounded-2xl border border-subtle bg-muted/70 p-3"
                  >
                    {item.kind === "poll" ? (
                      <div class="space-y-2.5 pt-1">
                        {[
                          ["w-4/5", "w-3/4"],
                          ["w-3/5", "w-1/2"],
                          ["w-2/5", "w-1/3"],
                        ].map(([track, fill]) => (
                          <div
                            key={track}
                            class={cx("h-3 rounded-full bg-surface", track)}
                          >
                            <span
                              class={cx(
                                "block h-full rounded-full bg-kind-poll/70",
                                fill,
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    ) : item.kind === "debate" ? (
                      <div class="grid h-full grid-cols-2 gap-2">
                        {[0, 1].map((column) => (
                          <div
                            key={column}
                            class="rounded-xl bg-surface p-2 shadow-soft"
                          >
                            <span
                              class={cx(
                                "block h-2 w-12 rounded-full",
                                column === 0
                                  ? "bg-kind-debate/70"
                                  : "bg-kind-debate/40",
                              )}
                            />
                            <span class="mt-2 block h-1.5 w-full rounded-full bg-inset" />
                            <span class="mt-1.5 block h-1.5 w-3/4 rounded-full bg-inset" />
                            <span class="mt-2.5 block h-4 w-4 rounded-full bg-kind-debate/30" />
                          </div>
                        ))}
                      </div>
                    ) : item.kind === "claim" ? (
                      <div class="flex h-full items-center px-2">
                        {[0, 1, 2].map((point) => (
                          <div
                            key={point}
                            class="flex flex-1 items-center last:flex-none"
                          >
                            <span
                              class={cx(
                                "grid size-6 shrink-0 place-items-center rounded-full border-2",
                                point < 2
                                  ? "border-kind-claim bg-kind-claim text-white"
                                  : "border-strong bg-surface",
                              )}
                            >
                              {point < 2 && (
                                <Icon name="check" class="text-3xs" />
                              )}
                            </span>
                            {point < 2 && (
                              <span class="h-0.5 flex-1 bg-kind-claim/40" />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div class="flex h-full flex-col justify-center px-1">
                        <div class="flex items-end justify-between gap-3">
                          {["h-5", "h-8", "h-11", "h-14"].map((height, i) => (
                            <span
                              key={height}
                              class={cx(
                                "flex-1 rounded-t-lg",
                                height,
                                i < 3 ? "bg-kind-project/55" : "bg-inset",
                              )}
                            />
                          ))}
                        </div>
                        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-inset">
                          <span class="block h-full w-3/4 rounded-full bg-kind-project" />
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div class="mt-6">
            <ButtonLink href={primaryAction.href} class="w-full sm:w-auto">
              {translate(locale, primaryAction.label)}
              <Icon name="arrow-right" />
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
});

export const head: DocumentHead = ({ resolveValue, url }) => {
  const locale = resolveValue(useLocaleLoader);
  const tagline = translate(locale, APP_TAGLINE);
  const description = translate(locale, APP_DESCRIPTION);
  const title = `${APP_NAME} · ${tagline}`;
  const canonical = canonicalHref(url);

  return {
    title,
    meta: [
      { name: "description", content: description },

      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      // Faltaban los tres: sin `og:url` cada variante con parámetros se
      // comparte como una página distinta, y sin `og:site_name` la tarjeta no
      // dice de qué producto es.
      { property: "og:url", content: canonical },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:locale", content: localeTag(locale).replace("-", "_") },

      ...socialImageMeta(`${url.origin}${SOCIAL_IMAGE_PATH}`, title),
      { name: "twitter:image", content: `${url.origin}${SOCIAL_IMAGE_PATH}` },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    scripts: [
      {
        props: { type: "application/ld+json" },
        script: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${url.origin}/#website`,
              url: url.origin,
              name: APP_NAME,
              description,
              inLanguage: SUPPORTED_LOCALES.map((item) => localeTag(item)),
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${url.origin}/buscar?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@type": "Organization",
              "@id": `${url.origin}/#organization`,
              name: APP_NAME,
              url: url.origin,
              slogan: tagline,
              description,
            },
          ],
        }),
      },
    ],
  };
};
