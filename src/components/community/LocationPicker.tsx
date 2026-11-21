import { component$, useId, useSignal } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import {
  Badge,
  Button,
  ButtonLink,
  CHIP_ROW,
  Chip,
  EmptyState,
  Icon,
  Input,
  cx,
} from "~/components/ui";
import type { CommunityRef } from "~/lib/community";
import { CHILD_LEVEL_LABEL, LEVEL_NAMES } from "~/lib/constants";
import { pluralize } from "~/lib/format";
import { localeTag, useLocale, translate } from "~/lib/i18n";

export type PickerOption = CommunityRef & {
  member_count: number;
  has_children: boolean;
  /**
   * Comunidad que la contiene. Sólo llega en búsquedas globales, donde dos
   * "San Martín" de provincias distintas se verían iguales.
   */
  context?: string | null;
};

/**
 * Selector de ubicación en cascada.
 *
 * Todo el estado vive en la URL (`?parent=&q=`) y toda la navegación es por
 * links: funciona sin JavaScript, se puede compartir el enlace y no hay
 * formularios anidados. La confirmación (el único POST) es un paso aparte.
 */
export const LocationPicker = component$<{
  /** Cadena desde `earth` hasta el nivel que se está mirando. */
  trail: CommunityRef[];
  options: PickerOption[];
  query: string;
  /** Prefijo para bajar un nivel; se le concatena el slug del hijo. */
  navBase: string;
  /** Ruta (sin query) a la que apunta el buscador GET. */
  searchAction: string;
  /** Campos ocultos extra del buscador, como pares [name, value]. */
  searchHidden?: [string, string][];
  /**
   * Prefijo del link de confirmación; se le concatena el slug elegido.
   * Es un string y no una función porque las props de un `component$` tienen
   * que ser serializables.
   */
  confirmBase: string;
  /** En residencia prioriza bajar hasta la localidad más específica. */
  purpose?: "browse" | "residence";
  /** Si se alcanza, se avisa que la consulta fue recortada. */
  resultLimit?: number;
  /** `all` cuando el buscador recorre todos los niveles, no sólo los hijos. */
  searchScope?: "children" | "all";
  /**
   * Formulario para pedir una comunidad que falta. Sin él, una búsqueda sin
   * resultados o el último nivel de una rama no tenían salida.
   */
  requestHref?: string;
}>(
  ({
    trail,
    options,
    query,
    navBase,
    searchAction,
    searchHidden = [],
    confirmBase,
    purpose = "browse",
    resultLimit,
    searchScope = "children",
    requestHref,
  }) => {
    const locale = useLocale();
    const tag = localeTag(locale);
    const instanceId = useId();
    const searchId = `location-search-${instanceId}`;
    const titleId = `location-title-${instanceId}`;
    const resultsId = `location-results-${instanceId}`;
    const current = trail.at(-1);
    const parent = trail.at(-2);
    const isBrowseLeaf =
      purpose === "browse" &&
      !!current &&
      current.level > 0 &&
      !query &&
      options.length === 0;
    const childLabel = current
      ? (CHILD_LEVEL_LABEL[current.level] ?? "Sub-comunidades")
      : "Continentes";
    const localizedChildLabel = translate(locale, childLabel);
    const lowerChildLabel = localizedChildLabel.toLocaleLowerCase(tag);
    const fullListHref = current ? `${navBase}${current.slug}` : searchAction;
    const resultSummary = query
      ? translate(locale, "{{results}} para “{{query}}”", {
          results: pluralize(options.length, "resultado", "resultados", locale),
          query,
        })
      : undefined;
    const isCapped = resultLimit !== undefined && options.length >= resultLimit;

    const quickFilter = useSignal<"all" | "active" | "sub">("all");
    // Lo tipeado vive en una señal atada a la consulta que lo originó: si un
    // redibujo llega con la misma consulta, el campo conserva lo escrito; con
    // una búsqueda nueva, la URL vuelve a mandar. Sin tarea que lea `query`:
    // leer datos del loader desde una tarea los vuelve a pedir (D99).
    const typedFor = useSignal<{ query: string; value: string }>({
      query,
      value: query,
    });
    const typed = typedFor.value.query === query ? typedFor.value.value : query;
    const activeOptionsCount = options.filter((o) => o.member_count > 0).length;
    const subOptionsCount = options.filter((o) => o.has_children).length;
    const narrowsByActivity =
      activeOptionsCount > 0 && activeOptionsCount < options.length;
    const narrowsBySubdivisions =
      subOptionsCount > 0 && subOptionsCount < options.length;

    // Un filtro elegido en otro nivel que acá no recorta (o vaciaría la
    // lista) vale como "Todas": su botón ya no se muestra.
    const visibleOptions = options.filter((o) => {
      if (quickFilter.value === "active" && narrowsByActivity)
        return o.member_count > 0;
      if (quickFilter.value === "sub" && narrowsBySubdivisions)
        return o.has_children;
      return true;
    });

    // En la raíz del alta, seis continentes antes del buscador eran ruido: la
    // lista queda plegada y el buscador manda. Con una búsqueda o un nivel
    // abajo, la lista es el resultado y se muestra (D121).
    const collapseRoot =
      purpose === "residence" && !query && (current?.level ?? 0) === 0;
    const resultsBlock = (
      <div>
        {purpose === "browse" ? (
          <h3
            id={resultsId}
            aria-live="polite"
            class={
              isBrowseLeaf
                ? "sr-only"
                : "mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint"
            }
          >
            {resultSummary}
          </h3>
        ) : (
          <h2
            id={resultsId}
            aria-live="polite"
            class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint"
          >
            {resultSummary}
          </h2>
        )}

        {/* Un filtro que deja todas las opciones no filtra nada: entre
              continentes "Con subdivisiones" daba 6 de 6 (D110). Un solo chip
              para los filtros (D123): el mismo componente que usan Inicio y
              la comunidad, con ícono propio en vez de emoji. */}
        {options.length >= 6 &&
          (narrowsByActivity || narrowsBySubdivisions) && (
            // Un renglón que se desliza en el teléfono: envolviendo, cada
            // filtro caía en su propia línea.
            <div
              role="group"
              aria-labelledby={`${resultsId}-quick`}
              class={cx("mb-3 text-xs", CHIP_ROW)}
            >
              <span
                id={`${resultsId}-quick`}
                class="font-medium text-ink-muted"
              >
                {translate(locale, "Filtro rápido:")}
              </span>
              <Chip
                selected={quickFilter.value === "all"}
                onClick$={() => {
                  quickFilter.value = "all";
                }}
              >
                <span>{translate(locale, "Todas")}</span>
                <span class="rounded-full bg-black/10 px-1.5 py-0.5 font-mono text-3xs dark:bg-white/15">
                  {options.length}
                </span>
              </Chip>
              {narrowsByActivity && (
                <Chip
                  icon="users"
                  selected={quickFilter.value === "active"}
                  onClick$={() => {
                    quickFilter.value = "active";
                  }}
                >
                  <span>{translate(locale, "Con miembros")}</span>
                  <span class="rounded-full bg-black/10 px-1.5 py-0.5 font-mono text-3xs dark:bg-white/15">
                    {activeOptionsCount}
                  </span>
                </Chip>
              )}
              {narrowsBySubdivisions && (
                <Chip
                  icon="layers"
                  selected={quickFilter.value === "sub"}
                  onClick$={() => {
                    quickFilter.value = "sub";
                  }}
                >
                  <span>{translate(locale, "Con subdivisiones")}</span>
                  <span class="rounded-full bg-black/10 px-1.5 py-0.5 font-mono text-3xs dark:bg-white/15">
                    {subOptionsCount}
                  </span>
                </Chip>
              )}
            </div>
          )}

        {options.length === 0 ? (
          query ? (
            <EmptyState
              emoji="🔍"
              title="No encontramos nada con ese nombre"
              description="Probá con menos letras, o volvé un paso atrás y bajá por otra rama."
            >
              <ButtonLink href={fullListHref} variant="secondary" size="lg">
                {translate(locale, "Ver {{level}}", {
                  level: lowerChildLabel,
                })}
              </ButtonLink>
              {requestHref && (
                <ButtonLink href={requestHref} variant="ghost" size="lg">
                  {translate(locale, "¿No está tu lugar? Pedí que lo sumemos")}
                </ButtonLink>
              )}
            </EmptyState>
          ) : (
            <EmptyState
              emoji="📍"
              title={translate(
                locale,
                "{{name}} no tiene sub-comunidades todavía",
                { name: current?.name ?? "" },
              )}
              description="Es el nivel más específico que existe por ahora en esta rama."
            >
              {isBrowseLeaf && current && (
                <div class="flex flex-col items-stretch justify-center gap-3 sm:flex-row">
                  <ButtonLink href={`${confirmBase}${current.slug}`} size="lg">
                    {translate(locale, "Abrir comunidad de {{name}}", {
                      name: current.name,
                    })}
                  </ButtonLink>
                  {parent && (
                    <ButtonLink
                      href={`${navBase}${parent.slug}`}
                      variant="secondary"
                      size="lg"
                    >
                      {translate(locale, "Volver a {{name}}", {
                        name: parent.name,
                      })}
                    </ButtonLink>
                  )}
                </div>
              )}
              {requestHref && current && current.level > 0 && (
                <Link
                  href={`${requestHref}?superior=${encodeURIComponent(current.slug)}`}
                  class="inline-flex min-h-11 basis-full items-center justify-center text-sm font-medium text-brand hover:underline"
                >
                  {translate(
                    locale,
                    "¿Falta una localidad de {{name}}? Pedí que la sumemos",
                    { name: current.name },
                  )}
                </Link>
              )}
            </EmptyState>
          )
        ) : visibleOptions.length === 0 ? (
          <div class="rounded-2xl border border-subtle bg-surface p-6 text-center">
            <p class="text-sm text-ink-muted">
              {translate(
                locale,
                "No hay opciones con el filtro rápido seleccionado.",
              )}
            </p>
            <button
              type="button"
              onClick$={() => {
                quickFilter.value = "all";
              }}
              class="mt-3 inline-flex items-center rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-ink-strong hover:bg-subtle"
            >
              {translate(locale, "Ver todas las opciones")}
            </button>
          </div>
        ) : (
          // La residencia se elige en una grilla que crece con su contenedor
          // (onboarding ancho o /perfil angosto), sin un scroll interno que
          // escondía la mayoría de las opciones (D110).
          <div class="@container">
            <ul
              aria-labelledby={resultsId}
              class={cx(
                purpose === "browse"
                  ? "grid gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                  : "grid gap-2 @2xl:grid-cols-2 @5xl:grid-cols-3",
              )}
            >
              {visibleOptions.map((option) => {
                const nextLevel = translate(
                  locale,
                  CHILD_LEVEL_LABEL[option.level] ?? "Sub-comunidades",
                ).toLocaleLowerCase(tag);
                const metadata = (
                  <>
                    {translate(
                      locale,
                      LEVEL_NAMES[option.level] ?? "Comunidad",
                    )}
                    {option.context &&
                      ` · ${translate(locale, "en {{name}}", { name: option.context })}`}
                    {option.member_count > 0 && (
                      <span class="inline-flex items-center gap-1">
                        <span aria-hidden="true">·</span>
                        <Icon name="users" class="text-[1.1em]" />
                        {pluralize(
                          option.member_count,
                          "miembro",
                          "miembros",
                          locale,
                        )}
                      </span>
                    )}
                  </>
                );

                return purpose === "browse" ? (
                  // La tarjeta entera abre la comunidad (D123): el enlace
                  // principal se extiende con `after:` sobre todo el `li`, y
                  // el "Abrir comunidad" repetido en cada tarjeta pasa a ser
                  // sólo para lectores de pantalla. El enlace para bajar de
                  // nivel queda por encima con `z-10`, sin anidar enlaces.
                  <li
                    key={option.id}
                    class="group relative flex min-h-20 items-stretch overflow-hidden rounded-2xl border border-subtle bg-surface transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-strong hover:shadow-lift motion-reduce:hover:transform-none"
                  >
                    <Link
                      href={`${confirmBase}${option.slug}`}
                      class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
                    >
                      <span
                        aria-hidden="true"
                        class="grid size-11 shrink-0 place-items-center rounded-xl border border-subtle bg-surface text-xl"
                      >
                        {option.emoji ?? "📍"}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="line-clamp-2 block font-display text-sm font-semibold text-ink-strong">
                          {option.name}
                        </span>
                        <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-faint">
                          {metadata}
                        </span>
                        <span class="sr-only">
                          {translate(locale, "Abrir comunidad")}
                        </span>
                      </span>
                      {!option.has_children && (
                        <Icon
                          name="chevron-right"
                          class="text-ink-faint transition-transform group-hover:translate-x-0.5"
                        />
                      )}
                    </Link>

                    {option.has_children && (
                      <Link
                        href={`${navBase}${option.slug}`}
                        aria-label={translate(
                          locale,
                          "Ver {{level}} de {{name}}",
                          { level: nextLevel, name: option.name },
                        )}
                        class="relative z-10 flex w-24 shrink-0 flex-col items-center justify-center gap-1 border-l border-subtle px-2 py-3 text-center text-xs font-medium leading-tight text-ink-muted transition-colors hover:bg-muted hover:text-brand sm:w-28"
                      >
                        <Icon name="layers" class="text-lg" />
                        {translate(locale, "Ver {{level}}", {
                          level: nextLevel,
                        })}
                      </Link>
                    )}
                  </li>
                ) : (
                  <li key={option.id} class="flex items-stretch gap-1.5">
                    <Link
                      href={`${option.has_children ? navBase : confirmBase}${option.slug}`}
                      class={cx(
                        "flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-subtle bg-surface px-3.5 py-3",
                        "transition-colors hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/40",
                      )}
                    >
                      <span aria-hidden="true" class="text-xl">
                        {option.emoji ?? "📍"}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-ink-strong">
                          {option.name}
                        </span>
                        <span class="block text-xs text-ink-faint">
                          {metadata}
                        </span>
                        {option.has_children && (
                          <span class="mt-0.5 block text-xs font-medium text-brand">
                            {translate(locale, "Ver {{level}}", {
                              level: nextLevel,
                            })}
                          </span>
                        )}
                      </span>
                    </Link>

                    {option.has_children && (
                      <Link
                        href={`${confirmBase}${option.slug}`}
                        aria-label={translate(
                          locale,
                          "Elegir {{name}} como residencia principal",
                          { name: option.name },
                        )}
                        class="grid shrink-0 place-items-center rounded-2xl border border-subtle bg-surface px-3 text-xs font-semibold text-ink-muted transition-colors hover:border-brand-500 hover:text-brand"
                      >
                        {translate(locale, "Elegir acá")}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isCapped && (
          <p class="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-ink-muted">
            {translate(
              locale,
              "La lista muestra hasta {{count}} comunidades. Usá la búsqueda para afinarla.",
              { count: resultLimit ?? options.length },
            )}
          </p>
        )}
      </div>
    );

    return (
      <section
        class="space-y-5"
        aria-labelledby={purpose === "browse" ? titleId : resultsId}
      >
        <CommunityBreadcrumb chain={trail} hrefBase={navBase} />

        {purpose === "browse" && (
          <div>
            <h2 id={titleId} class="text-xl font-semibold text-ink-strong">
              {isBrowseLeaf
                ? translate(locale, "Explorá {{name}}", {
                    name: current?.name ?? "",
                  })
                : query && searchScope === "all"
                  ? translate(locale, "Resultados en todas las comunidades")
                  : translate(locale, "Elegí entre {{level}}", {
                      level: lowerChildLabel,
                    })}
            </h2>
            <p class="mt-1 text-sm text-ink-muted">
              {translate(
                locale,
                isBrowseLeaf
                  ? "Podés abrir esta comunidad o volver al nivel anterior."
                  : "Abrí una comunidad o seguí bajando por la jerarquía.",
              )}
            </p>
          </div>
        )}

        {/* El buscador es un GET nativo: su estado se puede compartir y sigue
            funcionando aunque todavía no se haya descargado JavaScript. */}
        <form
          method="get"
          action={searchAction}
          role="search"
          hidden={isBrowseLeaf}
        >
          {searchHidden.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {current && (
            <input type="hidden" name="parent" value={current.slug} />
          )}

          <label
            for={searchId}
            class="mb-1.5 block text-sm font-medium text-ink-strong"
          >
            {purpose === "residence"
              ? translate(
                  locale,
                  "Buscar ciudad, barrio o municipio por nombre",
                )
              : searchScope === "all"
                ? translate(locale, "Buscar una comunidad por nombre")
                : translate(locale, "Buscar {{level}} por nombre", {
                    level: lowerChildLabel,
                  })}
          </label>
          {/* El botón va junto al campo también en el teléfono; si además
              está "Limpiar", los dos botones bajan juntos al renglón
              siguiente. */}
          <div class="flex flex-wrap gap-2 sm:flex-nowrap">
            <div class="relative min-w-[11rem] flex-1">
              <svg
                viewBox="0 0 24 24"
                class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path stroke-linecap="round" d="m16 16 4 4" />
              </svg>
              <Input
                id={searchId}
                name="q"
                type="search"
                value={typed}
                onInput$={(_, element) => {
                  typedFor.value = { query, value: element.value };
                }}
                placeholder={
                  purpose === "residence" || searchScope === "all"
                    ? translate(
                        locale,
                        "Ej: Mar del Plata, Quilmes, Córdoba, Palermo…",
                      )
                    : translate(locale, "Buscar en {{level}}…", {
                        level: lowerChildLabel,
                      })
                }
                class="pl-10"
              />
            </div>
            <div class="flex gap-2">
              <Button type="submit" variant="secondary" size="lg" class="px-5">
                {translate(locale, "Buscar")}
              </Button>
              {query && (
                <Link
                  href={fullListHref}
                  class="flex min-h-12 shrink-0 items-center justify-center rounded-2xl border border-control px-4 text-sm font-medium text-brand transition-colors hover:border-brand-500 hover:bg-muted"
                >
                  {translate(locale, "Limpiar")}
                </Link>
              )}
            </div>
          </div>
        </form>

        {collapseRoot ? (
          <details class="group rounded-2xl border border-subtle bg-surface">
            <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 font-medium text-ink-strong">
              <span>{translate(locale, "Explorar por continente")}</span>
              <span
                aria-hidden="true"
                class="text-ink-faint transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div class="px-4 pb-4">{resultsBlock}</div>
          </details>
        ) : (
          resultsBlock
        )}

        {/* En explorar este bloque abre la comunidad; sólo los flujos de
            residencia deben hablar de elegir una ubicación personal. */}
        {current &&
          current.level > 0 &&
          !isBrowseLeaf &&
          (purpose === "browse" ? (
            <div class="flex flex-col gap-4 rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-4 dark:border-brand-800 dark:bg-brand-950/30 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong">
                  {translate(locale, "Estás explorando {{name}}", {
                    name: current.name,
                  })}
                  <Badge tone="brand">
                    {translate(
                      locale,
                      LEVEL_NAMES[current.level] ?? "Comunidad",
                    )}
                  </Badge>
                </p>
                <p class="mt-1 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Abrí su comunidad para ver información, miembros y formas de participar.",
                  )}
                </p>
              </div>
              <ButtonLink
                href={`${confirmBase}${current.slug}`}
                size="lg"
                class="w-full shrink-0 sm:w-auto"
              >
                {translate(locale, "Abrir comunidad de {{name}}", {
                  name: current.name,
                })}
              </ButtonLink>
            </div>
          ) : (
            <div class="rounded-2xl border border-dashed border-strong px-4 py-3">
              <p class="text-sm text-ink-muted">
                {translate(locale, "¿No querés bajar más? Podés quedarte en")}{" "}
                <strong class="text-ink-strong">{current.name}</strong>.
              </p>
              <Link
                href={`${confirmBase}${current.slug}`}
                class="touch-target mt-2 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-brand hover:underline"
              >
                {translate(locale, "Elegir {{name}} como mi residencia", {
                  name: current.name,
                })}
                <Badge tone="brand">
                  {translate(locale, LEVEL_NAMES[current.level] ?? "Comunidad")}
                </Badge>
              </Link>
            </div>
          ))}
      </section>
    );
  },
);
