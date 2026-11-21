import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  CHIP_ROW,
  Card,
  Chip,
  Icon,
  Illustration,
  Input,
  buttonClass,
  cx,
  triggerHapticFeedback,
  type IconName,
} from "~/components/ui";
import {
  CivicHeatmapLegend,
  STATUS_TONE_COLOR,
  type StatusTone,
} from "~/components/map/CivicHeatmapLegend";
import {
  APP_NAME,
  CLAIM_CATEGORIES,
  CLAIM_STATUS_LABEL,
} from "~/lib/constants";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { playCivicSound } from "~/lib/audio-feedback";
import { pluralize } from "~/lib/format";
import { PUBLIC_LOCATION_GRID_METERS } from "~/lib/geolocation-privacy";
import { useLocale, translate } from "~/lib/i18n";
import { CLAIM_SEARCH_MAX_LENGTH } from "~/lib/claim-search";
import { MAP_CLAIMS_LIMIT, mapListHref, type MapFilters } from "./map-filters";
import { loadMapClaims } from "./map-data";
import { mapClaimSummary } from "./map-summary";
import { focusSelectedMapClaim } from "./map-selection-focus";
export type { MapClaim } from "./map-data";
import { useCommunity } from "../layout";
import { useLocaleLoader } from "~/routes/layout";
import {
  approximatePoint,
  mapCenter,
  openStreetMapUrl,
  projectClaims,
  type MapRadius,
} from "./map-view";

/** Una opción de los filtros del mapa, con su texto ya traducido. */
interface FilterOption<Key extends string> {
  key: Key;
  label: string;
  icon?: IconName;
}

/* Singular y plural del apoyo, del mismo lugar que usa el feed (D123). */
const [SUPPORT_ONE, SUPPORT_OTHER] = CONTENT_KINDS.claim.engagement;

export const useMapClaims = routeLoader$((ev) => loadMapClaims(ev));

export default component$(() => {
  const ctx = useCommunity();
  const claimsLoader = useMapClaims();
  const locale = useLocale();

  const filters = claimsLoader.value.filters;
  const selectedCategory = filters.category ?? "all";
  const selectedStatus = filters.status;
  const searchQuery = filters.query;
  // Los mismos filtros que escribe `mapListHref`. Con alguno puesto, el vacío
  // del esquema habla de estos resultados y no de toda la comunidad.
  const hasFilters = Boolean(
    searchQuery || filters.category || selectedStatus !== "todos",
  );
  const listHref = (next: Partial<MapFilters> = {}) =>
    mapListHref({ ...filters, ...next });
  const categoryHrefs = Object.fromEntries([
    ["all", listHref({ category: null })],
    ...CLAIM_CATEGORIES.map((category) => [
      category.key,
      listHref({ category: category.key }),
    ]),
  ]);
  const selectedRadius = useSignal<MapRadius>("1km");
  // Sólo la posición ya redondeada a la cuadrícula pública (~110 m): el GPS
  // exacto nunca se guarda en una señal (ver `approximatePoint`).
  const userLocation = useSignal<{ lat: number; lng: number } | null>(null);
  const locationFailed = useSignal(false);
  const locationLoading = useSignal(false);
  const locationRequest = useSignal(0);
  const activeClaimId = useSignal<string | null>(null);
  const claimDetail = useSignal<HTMLDivElement>();
  const detailFocusRequest = useSignal(0);
  const showNeighborhoodReview = useSignal(false);

  // El panel está antes de la lista en móvil. La carga y los filtros no
  // mueven el foco: sólo lo pide una selección, incluso de la misma fila.
  // eslint-disable-next-line qwik/no-use-visible-task -- foco después del commit del detalle nativo
  useVisibleTask$(
    ({ track, cleanup }) => {
      if (!track(() => detailFocusRequest.value)) return;
      const frame = requestAnimationFrame(() => {
        focusSelectedMapClaim(claimDetail.value);
      });
      cleanup(() => cancelAnimationFrame(frame));
    },
    { strategy: "document-ready" },
  );

  const allClaims = claimsLoader.value.claims;

  const streetTags = Array.from(
    new Set(
      allClaims
        .map((c) => c.location_text?.trim())
        .filter((loc): loc is string => Boolean(loc && loc.length > 2)),
    ),
  ).slice(0, 6);

  const baseCenter = mapCenter(
    userLocation.value,
    { lat: ctx.value.community.lat, lng: ctx.value.community.lng },
    allClaims,
  );
  const projection = baseCenter
    ? projectClaims(baseCenter, selectedRadius.value, allClaims)
    : { points: [], located: 0, center: null };
  const center = projection.center;
  const visibleIds = new Set(projection.points.map((point) => point.id));
  const filteredClaims = allClaims.filter((claim) => visibleIds.has(claim.id));
  const unlocatedClaims = allClaims.filter(
    (claim) => !approximatePoint(claim.lat, claim.lng),
  );
  const outsideCount = projection.located - filteredClaims.length;
  const activeClaim =
    filteredClaims.find((claim) => claim.id === activeClaimId.value) ??
    filteredClaims[0] ??
    null;
  const activeClaimIndex = filteredClaims.findIndex(
    (claim) => claim.id === activeClaim?.id,
  );
  const activeStatus = activeClaim
    ? CLAIM_STATUS_LABEL[activeClaim.status]
    : null;
  const prevClaim =
    activeClaimIndex > 0 ? filteredClaims[activeClaimIndex - 1] : null;
  const nextClaim =
    activeClaimIndex >= 0 && activeClaimIndex < filteredClaims.length - 1
      ? filteredClaims[activeClaimIndex + 1]
      : null;
  // El enlace externo apunta al reclamo elegido si tiene ubicación; si no, al
  // centro del esquema. Lo abre la persona: no se carga nada de antemano.
  const activeClaimPoint =
    activeClaim && activeClaim.lat !== null && activeClaim.lng !== null
      ? { lat: activeClaim.lat, lng: activeClaim.lng }
      : null;
  const externalMapUrl = activeClaimPoint
    ? openStreetMapUrl(activeClaimPoint, selectedRadius.value, {
        marker: true,
      })
    : center
      ? openStreetMapUrl(center, selectedRadius.value)
      : null;

  const { statusCounts, criticalPoints } = mapClaimSummary(allClaims);

  const categoryCounts = allClaims.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});

  // Las etiquetas van como msgid literal: `check-i18n` sólo verifica los
  // literales, y pasadas como variable salían en castellano en inglés.
  const statusFilters: FilterOption<MapFilters["status"]>[] = [
    { key: "todos", label: translate(locale, "Todos los reclamos") },
    {
      key: "abiertos",
      label: translate(locale, "Abiertos / En demanda"),
      icon: CONTENT_KINDS.claim.icon,
    },
    {
      key: "resueltos",
      label: translate(locale, "Resueltos (Victorias)"),
      icon: "trophy",
    },
  ];
  const radiusOptions: FilterOption<MapRadius>[] = [
    { key: "300m", label: translate(locale, "300 m") },
    { key: "500m", label: translate(locale, "500 m") },
    { key: "1km", label: translate(locale, "1 km") },
    { key: "2km", label: translate(locale, "2 km") },
    { key: "all", label: translate(locale, "Todo el territorio"), icon: "map" },
  ];

  return (
    <div class="space-y-6 py-2">
      {/* Encabezado: título y las dos acciones. El layout ya pone el h1 con el
          nombre y la pestaña marca "Mapa barrial": sobraban la insignia y el
          emoji (D126). Título y columna de texto como la cabecera de listado
          de rendición, victorias e instituciones, que comparten la fila de
          herramientas: al pasar de una a otra no cambian de tamaño ni de
          peso. Las acciones siguen en `md`, como el botón de crear de
          ListingHeader. */}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 max-w-xl">
          <h2 class="text-xl font-semibold tracking-tight">
            {translate(locale, "Problemáticas y victorias en {{name}}", {
              name: ctx.value.community.name,
            })}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Explorá los reclamos de cada cuadra y sumá tu apoyo a los que también te afectan.",
            )}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={`/c/${ctx.value.community.slug}/reclamos/nuevo`}
            variant="primary"
            size="md"
          >
            <Icon name={CONTENT_KINDS.claim.icon} />
            <span>{translate(locale, "Reportar un problema acá")}</span>
          </ButtonLink>
          {/* Abre un panel, no filtra: aria-expanded y no aria-pressed. */}
          <Button
            id="map-neighborhood-toggle"
            variant="secondary"
            size="md"
            aria-expanded={showNeighborhoodReview.value}
            aria-controls="map-neighborhood-review"
            onClick$={() => {
              showNeighborhoodReview.value = !showNeighborhoodReview.value;
              playCivicSound("toggle");
              triggerHapticFeedback("selection");
            }}
          >
            <Icon name="compass" />
            <span>{translate(locale, "Revisar mi barrio")}</span>
          </Button>
        </div>
      </div>

      {/* El panel va pegado a su botón: antes se dibujaba debajo de la
          leyenda y en el teléfono quedaba fuera de la pantalla. No depende de
          los reclamos cargados, así que también se ve si la carga falla.
          Tokens y no Card: la base de Card pisaba el ámbar. Sin segundo botón
          de reportar: la acción principal queda justo arriba. */}
      <section
        id="map-neighborhood-review"
        aria-labelledby="map-neighborhood-review-title"
        hidden={!showNeighborhoodReview.value}
        class="animate-fade-in rounded-2xl border border-accent-500/30 bg-accent-50 p-5 dark:bg-accent-500/10"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex items-start gap-3.5">
            <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-500/15 text-xl text-accent">
              <Icon name="compass" />
            </span>
            <div class="space-y-1.5">
              <h3
                id="map-neighborhood-review-title"
                class="font-display text-display-xs text-ink-strong"
              >
                {translate(locale, "Una invitación a recorrer el barrio")}
              </h3>
              <p class="text-sm text-ink-muted">
                {translate(
                  locale,
                  "Recorré {{community}} y, si encontrás un problema, consultá el mapa antes de publicarlo. Este panel no identifica zonas sin reclamos.",
                  { community: ctx.value.community.name },
                )}
              </p>
              <ul class="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-xs font-medium text-ink">
                <li class="inline-flex items-center gap-1.5">
                  <Icon name="bulb" class="text-accent" />
                  {translate(locale, "Revisá luces de la esquina")}
                </li>
                <li class="inline-flex items-center gap-1.5">
                  <Icon name="cone" class="text-accent" />
                  {translate(locale, "Verificá baches o veredas")}
                </li>
                <li class="inline-flex items-center gap-1.5">
                  <Icon name="leaf" class="text-accent" />
                  {translate(locale, "Poda o árboles caídos")}
                </li>
              </ul>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            class="shrink-0 self-end sm:self-start"
            onClick$={() => {
              showNeighborhoodReview.value = false;
              playCivicSound("click");
              // Se oculta con el panel: el foco vuelve al botón que lo abrió.
              document.getElementById("map-neighborhood-toggle")?.focus();
            }}
          >
            {translate(locale, "Ocultar")}
          </Button>
        </div>
      </section>

      {/* Búsqueda y filtros. Estado y categoría van juntos porque los dos
          vuelven a pedir la lista al servidor; la distancia sólo cambia el
          esquema en este navegador. */}
      <div class="flex flex-col gap-3">
        <form method="get" role="search" class="space-y-2">
          {filters.category && (
            <input type="hidden" name="categoria" value={filters.category} />
          )}
          {selectedStatus !== "todos" && (
            <input type="hidden" name="estado" value={selectedStatus} />
          )}
          <label for="map-search" class="sr-only">
            {translate(locale, "Buscar reclamos en el mapa")}
          </label>
          <div class="flex flex-wrap gap-2">
            {/* El campo del sistema: radio de 12 px (D124) y la tecla
                "buscar" en el teclado táctil. */}
            <Input
              id="map-search"
              name="q"
              type="search"
              value={searchQuery}
              maxLength={CLAIM_SEARCH_MAX_LENGTH}
              placeholder={translate(
                locale,
                "Buscar por calle, esquina o palabras clave...",
              )}
              class="min-w-0 flex-1"
            />
            <Button type="submit" size="sm">
              {translate(locale, "Buscar")}
            </Button>
            {searchQuery && (
              <ButtonLink
                href={listHref({ query: "" })}
                variant="ghost"
                size="sm"
              >
                {translate(locale, "Limpiar búsqueda")}
              </ButtonLink>
            )}
          </div>
          {streetTags.length > 0 && (
            <div class="scrollbar-slim flex items-center gap-1.5 overflow-x-auto py-1">
              <span class="shrink-0 text-2xs font-semibold text-ink-faint">
                {translate(locale, "Esquinas frecuentes:")}
              </span>
              {streetTags.map((tag) => (
                <Chip
                  key={tag}
                  href={listHref({ query: searchQuery === tag ? "" : tag })}
                  selected={searchQuery === tag}
                  icon="map-pin"
                  class="min-h-11 shrink-0"
                >
                  {tag}
                </Chip>
              ))}
            </div>
          )}
        </form>

        {/* Un solo chip para estado y categoría (D123): un único estado
            elegido y la misma altura táctil en las dos filas. En el teléfono
            cada fila es una línea con scroll horizontal. */}
        <nav
          aria-label={translate(locale, "Filtrar por estado")}
          class="scrollbar-slim -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {statusFilters.map(({ key, label, icon }) => (
            <Chip
              key={key}
              href={listHref({ status: key })}
              selected={selectedStatus === key}
              icon={icon}
              class="min-h-11 shrink-0"
            >
              {label}
            </Chip>
          ))}
        </nav>

        {/* Una sola fila de categorías. La leyenda repetía otra que escribía
            el mismo parámetro `categoria`; lo único propio que tenía era el
            conteo, que ahora va en el chip mientras no haya una elegida. */}
        <nav
          aria-label={translate(locale, "Filtrar reclamos por categoría")}
          class="scrollbar-slim -mx-4 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 sm:mx-0 sm:px-0"
        >
          <Chip
            href={categoryHrefs.all}
            selected={selectedCategory === "all"}
            class="min-h-11 shrink-0 snap-start"
          >
            {translate(locale, "Todas las categorías")}
          </Chip>
          {CLAIM_CATEGORIES.map((item) => {
            const count = categoryCounts[item.key] ?? 0;
            return (
              <Chip
                key={item.key}
                href={categoryHrefs[item.key]}
                selected={selectedCategory === item.key}
                icon={item.icon}
                class="min-h-11 shrink-0 snap-start"
              >
                {translate(locale, item.label)}
                {selectedCategory === "all" && count > 0 && (
                  <span class="tabular-nums text-ink-faint">{count}</span>
                )}
              </Chip>
            );
          })}
        </nav>

        {/* Distancia aproximada al centro; no se calculan recorridos. */}
        <div class="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          {/* Las distancias en un renglón que se desliza en el teléfono, con
              su rótulo arriba: envolviendo junto al rótulo ocupaban tres. */}
          <div
            role="group"
            aria-labelledby="map-distance-label"
            class="min-w-0 max-w-full sm:flex sm:items-center sm:gap-1.5"
          >
            <span
              id="map-distance-label"
              class="mb-1.5 block font-semibold text-ink-muted sm:mb-0 sm:mr-1"
            >
              {translate(locale, "Distancia aproximada:")}
            </span>
            <div class={cx(CHIP_ROW, "gap-1.5")}>
              {radiusOptions.map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selectedRadius.value === key}
                  onClick$={() => {
                    triggerHapticFeedback("selection");
                    playCivicSound("toggle");
                    selectedRadius.value = key;
                  }}
                  class={cx(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    selectedRadius.value === key
                      ? "bg-brand-600 text-white shadow-soft"
                      : "border border-subtle bg-surface text-ink-muted hover:border-strong hover:text-ink-strong",
                  )}
                >
                  {icon && <Icon name={icon} />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={locationLoading.value}
            aria-busy={locationLoading.value}
            aria-describedby="map-location-status"
            onClick$={() => {
              if (locationLoading.value) return;
              const request = ++locationRequest.value;
              locationLoading.value = true;
              locationFailed.value = false;
              if (typeof navigator === "undefined" || !navigator.geolocation) {
                locationLoading.value = false;
                locationFailed.value = true;
                return;
              }
              // Acción explícita: sólo corre cuando la persona toca el botón.
              // No hace falta alta precisión para centrar un esquema.
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  if (request !== locationRequest.value) return;
                  locationLoading.value = false;
                  const approx = approximatePoint(
                    pos.coords.latitude,
                    pos.coords.longitude,
                  );
                  if (!approx) {
                    locationFailed.value = true;
                    return;
                  }
                  userLocation.value = approx;
                  selectedRadius.value = "1km";
                  playCivicSound("click");
                  triggerHapticFeedback("medium");
                },
                () => {
                  if (request !== locationRequest.value) return;
                  locationLoading.value = false;
                  locationFailed.value = true;
                  triggerHapticFeedback("warning");
                },
                {
                  enableHighAccuracy: false,
                  maximumAge: 300000,
                  timeout: 10000,
                },
              );
            }}
            class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-subtle/80 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-strong hover:bg-muted transition-colors cursor-pointer"
          >
            <Icon name="map-pin" />
            <span>{translate(locale, "Mi ubicación")}</span>
          </button>

          {(userLocation.value ||
            locationLoading.value ||
            locationFailed.value) && (
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-full border border-subtle px-3 text-xs font-semibold text-brand"
              onClick$={() => {
                locationRequest.value++;
                userLocation.value = null;
                locationLoading.value = false;
                locationFailed.value = false;
                selectedRadius.value = "1km";
              }}
            >
              {translate(locale, "Centrar en la comunidad")}
            </button>
          )}
        </div>

        <p class="text-xs text-ink-muted">
          {translate(
            locale,
            "Distancia en línea recta desde el centro del esquema, calculada con ubicaciones aproximadas; no indica recorridos.",
          )}
        </p>
        <p
          id="map-location-status"
          role="status"
          aria-live="polite"
          class={
            locationLoading.value || locationFailed.value
              ? "text-xs text-ink-muted"
              : "sr-only"
          }
        >
          {locationLoading.value
            ? translate(locale, "Buscando tu ubicación aproximada…")
            : locationFailed.value
              ? translate(locale, "No pudimos obtener tu ubicación.")
              : ""}
        </p>
      </div>

      {/* Alert y no Card: la base de Card pisaba el borde rojo. Reintentar
          sigue siendo una recarga completa con los mismos filtros. */}
      {claimsLoader.value.failed ? (
        <Alert tone="danger" class="space-y-3">
          <p class="font-semibold">
            {translate(
              locale,
              "No pudimos cargar los reclamos del mapa. Probá de nuevo.",
            )}
          </p>
          <a href={listHref()} class={buttonClass("secondary", "sm")}>
            {translate(locale, "Reintentar")}
          </a>
        </Alert>
      ) : (
        <>
          <p role="status" class="text-xs text-ink-muted">
            {translate(
              locale,
              "Mostrando {{count}} reclamos con estos filtros. Esta vista incluye hasta {{limit}}; los indicadores describen sólo estos resultados.",
              { count: allClaims.length, limit: MAP_CLAIMS_LIMIT },
            )}
          </p>
          <CivicHeatmapLegend
            communitySlug={ctx.value.community.slug}
            statusCounts={statusCounts}
            criticalPoints={criticalPoints}
          />

          {/* Grilla principal: Mapa interactivo + Lista lateral de reclamos */}
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Esquema propio de reclamos (sin mosaicos de terceros) */}
            <div class="lg:col-span-8">
              <Card class="overflow-hidden rounded-3xl border border-subtle shadow-md">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-2.5 text-xs">
                  <span class="font-semibold text-ink-strong">
                    {selectedRadius.value === "all"
                      ? translate(
                          locale,
                          "Vista de todos los reclamos con ubicación",
                        )
                      : userLocation.value
                        ? translate(
                            locale,
                            "Centrado en tu ubicación aproximada",
                          )
                        : translate(locale, "Centrado en {{name}}", {
                            name: ctx.value.community.name,
                          })}
                    {selectedRadius.value !== "all" &&
                      ` · ${selectedRadius.value}`}
                  </span>
                  {externalMapUrl && (
                    <a
                      href={externalMapUrl}
                      target="_blank"
                      rel="noopener noreferrer external"
                      class="inline-flex min-h-11 items-center gap-1 rounded-full border border-control bg-surface px-3 font-semibold text-brand transition hover:border-brand-500 hover:bg-muted"
                    >
                      <span>{translate(locale, "Abrir en OpenStreetMap")}</span>
                      {/* Flecha en diagonal: "se abre afuera" (D125). */}
                      <Icon name="arrow-right" class="-rotate-45 text-sm" />
                      <span class="sr-only">
                        {translate(
                          locale,
                          "Se abre en openstreetmap.org, un sitio externo.",
                        )}
                      </span>
                    </a>
                  )}
                </div>

                {center && projection.located > 0 ? (
                  <svg
                    viewBox="0 0 100 100"
                    role="img"
                    aria-label={translate(
                      locale,
                      "Esquema de reclamos con ubicación en {{name}}",
                      { name: ctx.value.community.name },
                    )}
                    class="mx-auto block aspect-square w-full max-w-[480px] bg-muted/30"
                  >
                    {[25, 50, 75].map((line) => (
                      <g key={line} class="text-ink-faint" opacity="0.25">
                        <line
                          x1={line}
                          y1="0"
                          x2={line}
                          y2="100"
                          stroke="currentColor"
                          stroke-width="0.3"
                        />
                        <line
                          x1="0"
                          y1={line}
                          x2="100"
                          y2={line}
                          stroke="currentColor"
                          stroke-width="0.3"
                        />
                      </g>
                    ))}
                    {selectedRadius.value !== "all" && (
                      <circle
                        cx="50"
                        cy="50"
                        r="49.5"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="0.4"
                        stroke-dasharray="2 2"
                        class="text-ink-faint"
                        aria-hidden="true"
                      />
                    )}
                    <circle
                      cx="50"
                      cy="50"
                      r="1.4"
                      class="text-ink-strong"
                      fill="currentColor"
                    />
                    {projection.points.map((point) => {
                      const claim = filteredClaims.find(
                        (c) => c.id === point.id,
                      );
                      const isActive = activeClaim?.id === point.id;
                      const statusTone =
                        CLAIM_STATUS_LABEL[claim?.status ?? ""]?.tone;
                      // El mismo color que la leyenda; sin tono, el de abierto.
                      const color =
                        STATUS_TONE_COLOR[statusTone as StatusTone] ??
                        STATUS_TONE_COLOR.warn;
                      return (
                        <circle
                          key={point.id}
                          cx={point.x}
                          cy={point.y}
                          r={isActive ? 3 : 2}
                          class={cx("cursor-pointer", color.marker)}
                          fill="currentColor"
                          fill-opacity={isActive ? 1 : 0.75}
                          stroke={isActive ? "white" : "none"}
                          stroke-width="0.8"
                          onClick$={() => {
                            triggerHapticFeedback("selection");
                            activeClaimId.value = point.id;
                            detailFocusRequest.value++;
                          }}
                        />
                      );
                    })}
                  </svg>
                ) : (
                  <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    {/* Sin puntos que dibujar se explica el vacío, en lugar de
                        una grilla de 480 px sin nada adentro. */}
                    <Illustration name="compass" />
                    <p class="text-sm font-medium text-ink-strong">
                      {!center
                        ? translate(
                            locale,
                            "Sin ubicación de referencia para dibujar el esquema.",
                          )
                        : hasFilters
                          ? translate(
                              locale,
                              "Ningún reclamo con estos filtros tiene ubicación marcada.",
                            )
                          : translate(
                              locale,
                              "Ningún reclamo tiene ubicación marcada todavía.",
                            )}
                    </p>
                    <p class="max-w-sm text-xs text-ink-muted">
                      {translate(
                        locale,
                        "Los reclamos aparecen acá cuando quien los publica marca su ubicación aproximada.",
                      )}
                    </p>
                  </div>
                )}

                <div class="space-y-1 border-t border-subtle px-4 py-2.5 text-2xs text-ink-muted">
                  {projection.located > 0 && (
                    <p>
                      {translate(
                        locale,
                        "{{inside}} de {{total}} reclamos con ubicación entran en este radio.",
                        {
                          inside: projection.points.length,
                          total: projection.located,
                        },
                      )}
                    </p>
                  )}
                  <p>
                    {translate(
                      locale,
                      "Esquema propio sin calles: cada punto es un reclamo, ubicado con una precisión aproximada de {{meters}} m.",
                      { meters: PUBLIC_LOCATION_GRID_METERS },
                    )}
                  </p>
                  {userLocation.value && (
                    <p>
                      {translate(
                        locale,
                        "Tu ubicación se queda en este navegador, redondeada a unos {{meters}} m. Sólo sale si abrís OpenStreetMap.",
                        { meters: PUBLIC_LOCATION_GRID_METERS },
                      )}
                    </p>
                  )}
                </div>

                {/* Tarjeta flotante del reclamo seleccionado */}
                {activeClaim && (
                  <div
                    ref={claimDetail}
                    id="map-selected-claim"
                    data-map-claim-detail
                    role="region"
                    aria-labelledby="map-selected-claim-title"
                    tabIndex={-1}
                    class="m-4 scroll-mt-40 rounded-2xl border border-subtle bg-surface p-4 shadow-soft focus:outline-2 focus:outline-offset-2 focus:outline-brand-500"
                  >
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Badge
                        tone={
                          activeStatus?.tone as
                            "warn" | "brand" | "success" | "danger" | undefined
                        }
                      >
                        {translate(locale, activeStatus?.label ?? "Reclamo")}
                      </Badge>
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                        <Icon name="users" />
                        {pluralize(
                          activeClaim.support_count,
                          SUPPORT_ONE,
                          SUPPORT_OTHER,
                          locale,
                        )}
                      </span>
                      {activeClaim.location_text && (
                        <span class="inline-flex min-w-0 items-center gap-1 text-xs text-ink-muted">
                          <Icon name="map-pin" />
                          <span dir="auto" class="line-clamp-1">
                            {activeClaim.location_text}
                          </span>
                        </span>
                      )}
                    </div>

                    <h3
                      id="map-selected-claim-title"
                      dir="auto"
                      class="mt-2 line-clamp-2 font-display text-display-xs text-ink-strong"
                    >
                      {activeClaim.title}
                    </h3>

                    {/* Pie con la navegación entre reclamos y la acción: los
                        chevrons reemplazan a las flechas tipográficas. */}
                    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-3">
                      {filteredClaims.length > 1 && (
                        <div class="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!prevClaim}
                            onClick$={() => {
                              if (prevClaim) {
                                triggerHapticFeedback("selection");
                                activeClaimId.value = prevClaim.id;
                                detailFocusRequest.value++;
                              }
                            }}
                            class="flex size-11 items-center justify-center rounded-xl border border-subtle bg-surface text-ink-muted hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                            aria-label={translate(locale, "Reclamo anterior")}
                          >
                            <Icon name="chevron-left" class="text-base" />
                          </button>
                          <span class="px-1 text-2xs tabular-nums text-ink-faint">
                            ({activeClaimIndex + 1}/{filteredClaims.length})
                          </span>
                          <button
                            type="button"
                            disabled={!nextClaim}
                            onClick$={() => {
                              if (nextClaim) {
                                triggerHapticFeedback("selection");
                                activeClaimId.value = nextClaim.id;
                                detailFocusRequest.value++;
                              }
                            }}
                            class="flex size-11 items-center justify-center rounded-xl border border-subtle bg-surface text-ink-muted hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                            aria-label={translate(locale, "Reclamo siguiente")}
                          >
                            <Icon name="chevron-right" class="text-base" />
                          </button>
                        </div>
                      )}
                      <ButtonLink
                        href={`/reclamos/${activeClaim.id}`}
                        size="sm"
                        class="ml-auto"
                      >
                        <span>{translate(locale, "Ver el reclamo")}</span>
                        <Icon name="arrow-right" />
                      </ButtonLink>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Lista lateral de reclamos geolocalizados */}
            <div class="flex flex-col gap-3 lg:col-span-4">
              <h2 class="font-display text-display-xs text-ink-strong">
                {translate(locale, "Reclamos en la zona")}{" "}
                <span class="tabular-nums text-ink-muted">
                  ({filteredClaims.length})
                </span>
              </h2>

              {/* Con cero afuera, la línea repetía el vacío de abajo. */}
              {outsideCount > 0 && (
                <p class="text-xs text-ink-muted">
                  {outsideCount === 1
                    ? translate(
                        locale,
                        "1 reclamo con ubicación queda fuera de este radio.",
                      )
                    : translate(
                        locale,
                        "{{count}} reclamos con ubicación quedan fuera de este radio.",
                        { count: outsideCount },
                      )}
                </p>
              )}
              {/* Cada fila es un botón con sólo contenido de frase (span):
                  un div, un h3 o un p adentro tiraban el SSR de desarrollo
                  con Q12. Los E2E las cuentan como hijas de #map-claims. */}
              <div
                id="map-claims"
                class="scrollbar-slim flex max-h-[520px] flex-col gap-2.5 overflow-y-auto pr-1"
              >
                {filteredClaims.length === 0 ? (
                  <div class="rounded-2xl border border-dashed border-subtle p-6 text-center text-xs text-ink-muted">
                    {translate(
                      locale,
                      "No hay reclamos con ubicación dentro de este radio.",
                    )}
                  </div>
                ) : (
                  filteredClaims.map((claim) => (
                    <button
                      key={claim.id}
                      type="button"
                      aria-pressed={activeClaim?.id === claim.id}
                      aria-controls="map-selected-claim"
                      onClick$={() => {
                        activeClaimId.value = claim.id;
                        detailFocusRequest.value++;
                      }}
                      class={cx(
                        "flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-colors",
                        activeClaim?.id === claim.id
                          ? "border-brand-500 bg-brand-50/40 shadow-soft dark:bg-brand-950/30"
                          : "border-subtle bg-surface hover:border-strong",
                      )}
                    >
                      <span class="flex items-center justify-between gap-2">
                        <Badge
                          tone={
                            CLAIM_STATUS_LABEL[claim.status]?.tone as
                              | "warn"
                              | "brand"
                              | "success"
                              | "danger"
                              | undefined
                          }
                        >
                          {translate(
                            locale,
                            CLAIM_STATUS_LABEL[claim.status]?.label ??
                              "Reclamo",
                          )}
                        </Badge>
                        <span class="inline-flex items-center gap-1 text-2xs font-semibold text-ink-muted">
                          <Icon name="users" />
                          {pluralize(
                            claim.support_count,
                            SUPPORT_ONE,
                            SUPPORT_OTHER,
                            locale,
                          )}
                        </span>
                      </span>
                      <span
                        dir="auto"
                        class="line-clamp-2 font-display text-sm font-semibold text-ink-strong"
                      >
                        {claim.title}
                      </span>
                      {claim.location_text && (
                        <span class="flex items-center gap-1 text-2xs text-ink-faint">
                          <Icon name="map-pin" />
                          <span dir="auto" class="line-clamp-1">
                            {claim.location_text}
                          </span>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              {unlocatedClaims.length > 0 && (
                <section
                  aria-labelledby="unlocated-claims-title"
                  class="mt-3 space-y-2"
                >
                  <h3 id="unlocated-claims-title" class="text-sm font-semibold">
                    {translate(locale, "Sin ubicación marcada ({{count}})", {
                      count: unlocatedClaims.length,
                    })}
                  </h3>
                  <p class="text-xs text-ink-muted">
                    {translate(
                      locale,
                      "Estos reclamos coinciden con los filtros, pero no pueden ubicarse en el esquema ni asignarse a un radio.",
                    )}
                  </p>
                  {/* Misma anatomía que las filas interactivas de D125: el
                      ícono del tipo, el título y un chevron que dice que se
                      abre. El nombre accesible sigue siendo el título. */}
                  <ul class="space-y-2">
                    {unlocatedClaims.map((claim) => (
                      <li key={claim.id}>
                        <Link
                          href={`/reclamos/${claim.id}`}
                          class="group flex min-h-11 items-center gap-3 rounded-xl border border-subtle bg-surface px-3 py-2 transition-colors hover:border-strong"
                        >
                          <span
                            aria-hidden="true"
                            class={cx(
                              "grid size-8 shrink-0 place-items-center rounded-lg",
                              CONTENT_KIND_TONES.claim.bg,
                              CONTENT_KIND_TONES.claim.text,
                            )}
                          >
                            <Icon name={CONTENT_KINDS.claim.icon} />
                          </span>
                          <span
                            dir="auto"
                            class="min-w-0 flex-1 text-sm font-medium text-ink-strong"
                          >
                            {claim.title}
                          </span>
                          <Icon
                            name="chevron-right"
                            class="text-ink-faint transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader) ?? "es";
  const communityName = ctx?.community.name ?? translate(locale, "Comunidad");

  return {
    title: `${translate(locale, "Mapa barrial")} - ${communityName} · ${APP_NAME}`,
  };
};
