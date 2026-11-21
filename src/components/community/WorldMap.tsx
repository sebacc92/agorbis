import {
  $,
  component$,
  sync$,
  useId,
  useOnDocument,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import { Button, ButtonLink, Card, cx } from "~/components/ui";
import {
  WORLD_MAP_COUNTRY_IDS,
  WORLD_MAP_MARKERS,
  WORLD_MAP_VIEW_BOX,
} from "~/data/world-map";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";
import { routes } from "~/lib/community";
import { formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export type WorldMapCountry = {
  iso2: string;
  slug: string;
  name: string;
  flag: string;
  continentName: string;
  memberCount: number;
  description: string | null;
};

function countryCodeFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof SVGElement)) return null;
  return target.dataset.country ?? null;
}

function normalizedCountryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .trim();
}

export const WorldMap = component$<{ countries: WorldMapCountry[] }>(
  ({ countries }) => {
    const locale = useLocale();
    const selectedIso = useSignal("");
    const hoveredIso = useSignal("");
    const tooltipX = useSignal(0);
    const tooltipY = useSignal(0);
    const zoom = useSignal(1);
    const isFullscreen = useSignal(false);
    const fullscreenFailed = useSignal(false);
    const countryQuery = useSignal("");
    const countrySearchOpen = useSignal(false);
    const activeCountry = useSignal(-1);
    const revealSelectedCountry = useSignal(false);
    const mapShell = useSignal<HTMLElement>();
    const detailPanel = useSignal<HTMLElement>();
    const instanceId = useId();
    const countryInputId = `world-map-country-${instanceId}`;
    const countryResultsId = `world-map-country-results-${instanceId}`;
    const countryHintId = `world-map-country-hint-${instanceId}`;
    const selectedCountryId = `selected-country-${instanceId}`;

    useOnDocument(
      "fullscreenchange",
      $(() => {
        isFullscreen.value = document.fullscreenElement === mapShell.value;
      }),
    );

    // eslint-disable-next-line qwik/no-use-visible-task -- el detalle condicional debe existir en el DOM antes de desplazarlo
    useVisibleTask$(({ track, cleanup }) => {
      const iso2 = track(() => selectedIso.value);
      const shouldReveal = track(() => revealSelectedCountry.value);
      if (
        !iso2 ||
        !shouldReveal ||
        !window.matchMedia("(width < 64rem)").matches
      )
        return;

      // El panel se crea después de elegir; esperar al siguiente pintado evita
      // intentar desplazar un ref que todavía no entró al DOM.
      const timer = setTimeout(() => {
        detailPanel.value?.scrollIntoView({
          block: "start",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }, 50);
      cleanup(() => clearTimeout(timer));
    });

    const countryByIso = new Map(
      countries.map((country) => [country.iso2, country]),
    );
    const locations = WORLD_MAP_COUNTRY_IDS.filter((iso2) =>
      countryByIso.has(iso2.toUpperCase()),
    );
    const selected = countryByIso.get(selectedIso.value);
    const hovered = countryByIso.get(hoveredIso.value);
    const normalizedQuery = normalizedCountryName(countryQuery.value);
    const matchingCountries = normalizedQuery
      ? countries
          .filter((country) =>
            normalizedCountryName(country.name).includes(normalizedQuery),
          )
          .slice(0, 8)
      : [];
    const selectedMatchesQuery =
      selected !== undefined &&
      normalizedCountryName(selected.name) === normalizedQuery;
    const countryResultsVisible =
      countrySearchOpen.value &&
      normalizedQuery.length > 0 &&
      !selectedMatchesQuery;

    const selectCountry = $((iso2: string, reveal: boolean) => {
      const country = countries.find((item) => item.iso2 === iso2);
      if (!country) return;
      revealSelectedCountry.value = reveal;
      selectedIso.value = iso2;
      countryQuery.value = country.name;
      countrySearchOpen.value = false;
      activeCountry.value = -1;
    });

    const handleCountryKeyDown = $((event: KeyboardEvent) => {
      if (event.key === "Escape") {
        countrySearchOpen.value = false;
        activeCountry.value = -1;
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        countrySearchOpen.value = true;
        if (matchingCountries.length === 0) {
          activeCountry.value = -1;
          return;
        }
        activeCountry.value =
          event.key === "ArrowDown"
            ? (activeCountry.value + 1) % matchingCountries.length
            : activeCountry.value <= 0
              ? matchingCountries.length - 1
              : activeCountry.value - 1;
        document
          .getElementById(`${countryResultsId}-option-${activeCountry.value}`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }

      if (event.key === "Enter") {
        const country = matchingCountries[activeCountry.value];
        if (country) void selectCountry(country.iso2, false);
      }
    });

    return (
      <div ref={mapShell} class="world-map-shell">
        <Card as="section" class="overflow-hidden">
          <div class="border-b border-subtle p-4 sm:p-5">
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-brand">
                  {pluralize(countries.length, "país", "países", locale)}
                </p>
                <h2 class="mt-1 text-xl font-semibold">
                  {translate(locale, "Mapamundi de comunidades")}
                </h2>
                <p class="mt-1 max-w-2xl text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Buscá un país por nombre o seleccionalo en el mapa para conocer su comunidad.",
                  )}
                </p>
              </div>

              <div>
                <label
                  for={countryInputId}
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "Buscar un país")}
                </label>
                <div class="relative mt-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    class="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-ink-faint"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path stroke-linecap="round" d="m16 16 4 4" />
                  </svg>
                  <input
                    id={countryInputId}
                    name="world-map-country"
                    dir="auto"
                    type="search"
                    enterKeyHint="search"
                    role="combobox"
                    autocomplete="off"
                    spellcheck={false}
                    value={countryQuery.value}
                    placeholder={translate(locale, "Escribí un país…")}
                    aria-expanded={countryResultsVisible}
                    aria-controls={countryResultsId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      countryResultsVisible && activeCountry.value >= 0
                        ? `${countryResultsId}-option-${activeCountry.value}`
                        : undefined
                    }
                    aria-describedby={countryHintId}
                    class="min-h-11 w-full rounded-2xl border border-control bg-surface px-3.5 py-2.5 pl-10 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                    onFocus$={(_, element) => {
                      countrySearchOpen.value = true;
                      if (selectedIso.value) element.select();
                    }}
                    onInput$={(_, element) => {
                      countryQuery.value = element.value;
                      countrySearchOpen.value = true;
                      activeCountry.value = -1;
                      revealSelectedCountry.value = false;
                      const exact = countries.find(
                        (country) =>
                          normalizedCountryName(country.name) ===
                          normalizedCountryName(element.value),
                      );
                      selectedIso.value = exact?.iso2 ?? "";
                    }}
                    onBlur$={() =>
                      setTimeout(() => {
                        countrySearchOpen.value = false;
                        activeCountry.value = -1;
                      }, 150)
                    }
                    onKeyDown$={[
                      sync$(
                        (event: KeyboardEvent, element: HTMLInputElement) => {
                          const hasActiveOption = element.hasAttribute(
                            "aria-activedescendant",
                          );
                          const isOpen =
                            element.getAttribute("aria-expanded") === "true";
                          if (
                            event.key === "ArrowDown" ||
                            event.key === "ArrowUp" ||
                            (event.key === "Enter" && hasActiveOption) ||
                            (event.key === "Escape" && isOpen)
                          ) {
                            event.preventDefault();
                          }
                        },
                      ),
                      handleCountryKeyDown,
                    ]}
                  />

                  {countryResultsVisible && (
                    <ul
                      id={countryResultsId}
                      role="listbox"
                      aria-label={translate(locale, "Países encontrados")}
                      class="scrollbar-slim absolute z-30 mt-1 max-h-72 w-full overflow-auto overscroll-contain rounded-2xl border border-subtle bg-surface p-1 shadow-lift"
                    >
                      {matchingCountries.length === 0 ? (
                        <li
                          role="option"
                          aria-disabled="true"
                          aria-selected="false"
                          class="rounded-xl px-3 py-3 text-sm text-ink-muted"
                        >
                          {translate(
                            locale,
                            "No encontramos ningún país con ese nombre.",
                          )}
                        </li>
                      ) : (
                        matchingCountries.map((country, index) => (
                          <li
                            key={country.iso2}
                            id={`${countryResultsId}-option-${index}`}
                            role="option"
                            aria-selected={activeCountry.value === index}
                            preventdefault:pointerdown={true}
                            class={cx(
                              "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm",
                              activeCountry.value === index
                                ? "bg-muted"
                                : "hover:bg-muted",
                            )}
                            onMouseEnter$={() => (activeCountry.value = index)}
                            onPointerDown$={() =>
                              selectCountry(country.iso2, true)
                            }
                            onClick$={() => selectCountry(country.iso2, true)}
                          >
                            <span aria-hidden="true">{country.flag}</span>
                            <span class="min-w-0 flex-1 truncate font-medium text-ink-strong">
                              {country.name}
                            </span>
                            <span class="text-xs text-ink-faint">
                              {country.continentName}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <p
                  id={countryHintId}
                  aria-live="polite"
                  class={cx(
                    "mt-1.5 text-xs",
                    selected ? "font-medium text-brand" : "text-ink-faint",
                  )}
                >
                  {selected
                    ? `✓ ${translate(locale, "País seleccionado")}: ${selected.name}`
                    : translate(
                        locale,
                        "Escribí para filtrar {{count}} países.",
                        { count: countries.length },
                      )}
                </p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
              <span class="mr-1 text-xs font-semibold text-ink-muted">
                {translate(locale, "Zoom")}
              </span>
              <div
                class="flex items-center gap-2"
                role="group"
                aria-label={translate(locale, "Controles del mapa")}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  style={{
                    height: "2.75rem",
                    width: "2.75rem",
                    paddingInline: "0",
                  }}
                  disabled={zoom.value <= 1}
                  aria-label={translate(locale, "Alejar mapa")}
                  onClick$={() => (zoom.value = Math.max(1, zoom.value - 0.5))}
                >
                  −
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  style={{ height: "2.75rem", minWidth: "4rem" }}
                  disabled={zoom.value === 1}
                  aria-label={translate(locale, "Restablecer zoom al 100%")}
                  aria-live="polite"
                  title={translate(locale, "Restablecer zoom")}
                  onClick$={() => (zoom.value = 1)}
                >
                  {Math.round(zoom.value * 100)}%
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  style={{
                    height: "2.75rem",
                    width: "2.75rem",
                    paddingInline: "0",
                  }}
                  disabled={zoom.value >= 4}
                  aria-label={translate(locale, "Acercar mapa")}
                  title={translate(locale, "Acercar")}
                  onClick$={() => (zoom.value = Math.min(4, zoom.value + 0.5))}
                >
                  +
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  style={{
                    height: "2.75rem",
                    width: "2.75rem",
                    paddingInline: "0",
                  }}
                  aria-label={
                    isFullscreen.value
                      ? translate(locale, "Salir de pantalla completa")
                      : translate(locale, "Ver en pantalla completa")
                  }
                  aria-pressed={isFullscreen.value}
                  title={
                    isFullscreen.value
                      ? translate(locale, "Salir de pantalla completa")
                      : translate(locale, "Pantalla completa")
                  }
                  onClick$={async () => {
                    fullscreenFailed.value = false;
                    try {
                      if (document.fullscreenElement) {
                        await document.exitFullscreen();
                      } else {
                        await mapShell.value?.requestFullscreen();
                      }
                    } catch {
                      fullscreenFailed.value = true;
                    }
                  }}
                >
                  {isFullscreen.value ? (
                    <svg
                      viewBox="0 0 24 24"
                      class="size-4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      class="size-4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5"
                      />
                    </svg>
                  )}
                </Button>
              </div>
            </div>

            {fullscreenFailed.value && (
              <p role="status" class="mt-2 text-right text-xs text-danger">
                {translate(
                  locale,
                  "No pudimos abrir la pantalla completa. Podés seguir usando el mapa acá.",
                )}
              </p>
            )}
          </div>

          <div
            class={cx("grid", selected && "lg:grid-cols-[minmax(0,1fr)_19rem]")}
          >
            <div class="min-w-0 bg-brand-50/60 p-3 dark:bg-night-950/40 sm:p-5 lg:col-start-1 lg:row-start-1">
              <div
                class="scrollbar-slim mx-auto max-w-5xl overflow-auto rounded-2xl border border-brand-200 bg-[#dff2ff] focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-night-700 dark:bg-[#17243a]"
                role="region"
                aria-label={translate(locale, "Área desplazable del mapamundi")}
                tabIndex={zoom.value > 1 ? 0 : undefined}
              >
                <svg
                  viewBox={WORLD_MAP_VIEW_BOX}
                  width="1010"
                  height="666"
                  class="block h-auto max-w-none transition-[width] duration-200"
                  style={{ width: `${zoom.value * 100}%` }}
                  aria-hidden="true"
                  focusable="false"
                  onPointerMove$={(event) => {
                    hoveredIso.value =
                      countryCodeFromTarget(event.target) ?? "";
                    tooltipX.value = event.clientX;
                    tooltipY.value = event.clientY;
                  }}
                  onPointerLeave$={() => (hoveredIso.value = "")}
                  onClick$={(event) => {
                    const iso2 = countryCodeFromTarget(event.target);
                    if (iso2) void selectCountry(iso2, true);
                  }}
                >
                  {locations.map((mapIso2) => {
                    const iso2 = mapIso2.toUpperCase();
                    const country = countryByIso.get(iso2)!;
                    const isSelected = selectedIso.value === iso2;
                    const isHovered = hoveredIso.value === iso2;

                    return (
                      <use
                        key={iso2}
                        href={`/world-map.svg#${mapIso2}`}
                        data-country={iso2}
                        class={cx(
                          "world-map-country",
                          isHovered && "world-map-country-hovered",
                          isSelected && "world-map-country-selected",
                        )}
                      >
                        <title>{`${country.flag} ${country.name}`}</title>
                      </use>
                    );
                  })}
                  {WORLD_MAP_MARKERS.map(([mapIso2, x, y]) => {
                    const iso2 = mapIso2.toUpperCase();
                    const country = countryByIso.get(iso2);
                    if (!country) return null;
                    const isSelected = selectedIso.value === iso2;
                    const isHovered = hoveredIso.value === iso2;

                    return (
                      <circle
                        key={`${iso2}-marker`}
                        cx={x}
                        cy={y}
                        r={3}
                        data-country={iso2}
                        vector-effect="non-scaling-stroke"
                        class={cx(
                          "world-map-marker",
                          isHovered && "world-map-marker-hovered",
                          isSelected && "world-map-marker-selected",
                        )}
                      >
                        <title>{`${country.flag} ${country.name}`}</title>
                      </circle>
                    );
                  })}
                </svg>
              </div>

              <p class="mt-2 text-center text-2xs text-ink-faint">
                {translate(
                  locale,
                  "Fronteras cartográficas: @svg-maps/world y MapSVG, licencia CC BY 4.0.",
                )}
              </p>
              {zoom.value > 1 && (
                <p class="mt-2 text-center text-xs font-medium text-brand">
                  {translate(
                    locale,
                    "Mapa ampliado: desplazalo para recorrerlo completo.",
                  )}
                </p>
              )}
            </div>

            {selected && (
              <aside
                ref={detailPanel}
                class="scroll-mt-20 border-t border-subtle p-5 lg:col-start-2 lg:row-start-1 lg:border-l lg:border-t-0"
                aria-labelledby={selectedCountryId}
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-brand">
                  {translate(locale, "País seleccionado")}
                </p>
                <span class="mt-3 block text-5xl" aria-hidden="true">
                  {selected.flag}
                </span>
                <h3 id={selectedCountryId} class="mt-3 text-2xl font-semibold">
                  {selected.name}
                </h3>
                <p class="mt-1 text-sm font-medium text-brand">
                  {selected.continentName}
                </p>
                <p class="mt-3 text-sm leading-relaxed text-ink-muted">
                  {selected.description ??
                    translate(
                      locale,
                      "Comunidad nacional de {{name}}, con sus provincias, estados, departamentos o regiones.",
                      { name: selected.name },
                    )}
                </p>
                <p class="mt-4 text-sm text-ink-muted">
                  <strong class="text-ink-strong">
                    {formatNumber(selected.memberCount, locale)}
                  </strong>{" "}
                  {translate(
                    locale,
                    selected.memberCount === 1 ? "miembro" : "miembros",
                  )}
                </p>
                <div class="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <ButtonLink
                    href={routes.community(selected.slug)}
                    size="lg"
                    class="w-full"
                  >
                    {translate(locale, "Abrir comunidad")}
                  </ButtonLink>
                  <ButtonLink
                    href={`/explorar?parent=${selected.slug}`}
                    variant="secondary"
                    size="lg"
                    class="w-full"
                  >
                    {translate(locale, "Ver sus divisiones")}
                  </ButtonLink>
                </div>
              </aside>
            )}
          </div>

          {hovered && (
            <div
              class="pointer-events-none fixed z-50 rounded-xl border border-subtle bg-surface px-3 py-2 text-sm font-medium text-ink-strong shadow-lift"
              style={{
                left: `min(${tooltipX.value + 14}px, calc(100vw - 13rem))`,
                top: `min(${tooltipY.value + 14}px, calc(100vh - 4rem))`,
              }}
              aria-hidden="true"
            >
              <span class="mr-1.5">{hovered.flag}</span>
              {hovered.name}
            </div>
          )}
        </Card>
      </div>
    );
  },
);
