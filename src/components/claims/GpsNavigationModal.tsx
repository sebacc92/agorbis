import { component$, useId, useSignal } from "@qwik.dev/core";
import {
  Icon,
  Badge,
  Button,
  cx,
  DialogFrame,
  ExternalLinkHint,
  triggerHapticFeedback,
} from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import {
  formatPublicCoordinate,
  PUBLIC_LOCATION_GRID_METERS,
  toPublicLocationPoint,
} from "~/lib/geolocation-privacy";
import { useLocale, translate } from "~/lib/i18n";

export interface GpsNavigationModalProps {
  lat: number;
  lng: number;
  locationText?: string | null;
  claimTitle: string;
}

export const GpsNavigationModal = component$<GpsNavigationModalProps>(
  ({ lat, lng, locationText, claimTitle }) => {
    const isOpen = useSignal(false);
    const copyState = useSignal<"idle" | "pending" | "copied" | "failed">(
      "idle",
    );
    const coordinateInput = useSignal<HTMLInputElement>();
    const instanceId = useId();
    const coordinatesId = `gps-coordinates-${instanceId}`;
    const locale = useLocale();

    // La base guarda la ubicación pública cuantizada a 3 decimales (~110 m,
    // migración 0040). Mostrarla con 6 decimales y llamarla "exacta" sugería
    // una precisión que el dato no tiene. Se vuelve a cuantizar acá por si el
    // componente recibe alguna vez un punto sin pasar por la base.
    const point = toPublicLocationPoint(lat, lng);
    if (!point) return null;
    const publicLat = formatPublicCoordinate(point.lat);
    const publicLng = formatPublicCoordinate(point.lng);
    const formattedCoords = `${publicLat}, ${publicLng}`;
    // Todos son enlaces salientes que abre la persona: Agorbis no embebe mapas
    // de terceros (la CSP bloquea `frame-src` y un iframe le pasaría la
    // ubicación y la IP al proveedor sin que nadie lo pida).
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${publicLat},${publicLng}`;
    const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(claimTitle)}&ll=${publicLat},${publicLng}`;
    const wazeUrl = `https://www.waze.com/ul?ll=${publicLat},${publicLng}&navigate=yes`;
    const osmUrl = `https://www.openstreetmap.org/?mlat=${publicLat}&mlon=${publicLng}#map=16/${publicLat}/${publicLng}`;
    // Sin emojis de mapa, manzana, auto y globo haciendo de logos (D126): el
    // nombre de cada aplicación alcanza.
    const launchers = [
      {
        href: googleMapsUrl,
        name: translate(locale, "Google Maps"),
        hint: translate(locale, "Navegación"),
      },
      {
        href: appleMapsUrl,
        name: translate(locale, "Apple Maps"),
        hint: translate(locale, "iOS / macOS"),
      },
      {
        href: wazeUrl,
        name: translate(locale, "Waze"),
        hint: translate(locale, "En tránsito"),
      },
      {
        href: osmUrl,
        name: translate(locale, "OpenStreetMap"),
        hint: translate(locale, "Datos libres"),
      },
    ];

    return (
      <div class="inline-flex items-center">
        {/* Botón secundario y no chip: con `onClick$` el chip se anuncia como
            interruptor (`aria-pressed`) y esto abre un diálogo. */}
        <Button
          variant="secondary"
          size="sm"
          onClick$={() => {
            triggerHapticFeedback("selection");
            copyState.value = "idle";
            isOpen.value = true;
          }}
        >
          <Icon name="map" class="text-base" />
          <span>{translate(locale, "Abrir en GPS / Mapas")}</span>
        </Button>

        {isOpen.value && (
          <DialogFrame
            onClose$={() => {
              isOpen.value = false;
            }}
            label={translate(locale, "Navegación GPS y Mapas")}
            class="w-[calc(100vw-2rem)] max-w-lg rounded-3xl border border-subtle bg-surface text-ink p-6 shadow-lift animate-scale-pop sm:p-7"
          >
            {/* Encabezado */}
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="inline-flex items-center gap-2">
                  <Icon name="map-pin" class="text-xl text-brand" />
                  <Badge tone="brand">
                    {translate(locale, "Navegación cívica")}
                  </Badge>
                </div>
                <h3
                  dir="auto"
                  class="mt-1.5 text-lg font-bold text-ink-strong line-clamp-1"
                >
                  {locationText || claimTitle}
                </h3>
                <p class="text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Elegí tu aplicación de navegación preferida o copiá las coordenadas aproximadas.",
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick$={() => {
                  isOpen.value = false;
                }}
                class="cursor-pointer rounded-full p-2 text-ink-muted transition duration-150 hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation"
                aria-label={translate(locale, "Cerrar")}
              >
                <Icon name="x" class="text-base" />
              </button>
            </div>

            {/* Coordenadas copiables, con su precisión real */}
            <div class="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-subtle bg-muted/40 p-3">
              <div class="min-w-0">
                <label
                  for={coordinatesId}
                  class="text-2xs font-bold uppercase tracking-wider text-ink-faint"
                >
                  {translate(locale, "Coordenadas aproximadas")}
                </label>
                <input
                  ref={coordinateInput}
                  id={coordinatesId}
                  type="text"
                  readOnly
                  value={formattedCoords}
                  aria-describedby={`${coordinatesId}-precision`}
                  class="block min-h-11 w-full rounded-lg bg-transparent px-1 font-mono text-xs font-semibold tabular-nums text-ink-strong focus:outline-2 focus:outline-brand-500"
                />
                <p
                  id={`${coordinatesId}-precision`}
                  class="mt-0.5 text-2xs text-ink-muted"
                >
                  {translate(
                    locale,
                    "Ubicación aproximada, con una precisión de unos {{meters}} m.",
                    { meters: PUBLIC_LOCATION_GRID_METERS },
                  )}
                </p>
              </div>

              <button
                type="button"
                disabled={copyState.value === "pending"}
                aria-busy={copyState.value === "pending"}
                onClick$={async () => {
                  copyState.value = "pending";
                  try {
                    await navigator.clipboard.writeText(formattedCoords);
                    copyState.value = "copied";
                    triggerHapticFeedback("success");
                    showToast(
                      translate(
                        locale,
                        "Coordenadas copiadas al portapapeles.",
                      ),
                      "success",
                    );
                  } catch {
                    copyState.value = "failed";
                  }
                }}
                class={cx(
                  "inline-flex cursor-pointer shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-xs transition-all duration-150 active:scale-95 touch-manipulation",
                  copyState.value === "copied"
                    ? "border border-success-500/50 bg-success-500/15 text-success-700 dark:text-success-300 ring-2 ring-success-500/20 scale-102"
                    : "border border-control bg-surface text-ink-strong hover:border-brand-500",
                )}
              >
                {copyState.value === "copied" ? (
                  <Icon name="check" />
                ) : (
                  <Icon name="copy" />
                )}
                <span>
                  {copyState.value === "copied"
                    ? translate(locale, "Copiado")
                    : translate(locale, "Copiar")}
                </span>
              </button>
            </div>
            {copyState.value === "failed" && (
              <div class="mt-2 space-y-2">
                <p role="alert" class="text-sm text-danger">
                  {translate(
                    locale,
                    "No pudimos copiar las coordenadas. Podés seleccionarlas y copiarlas manualmente.",
                  )}
                </p>
                <button
                  type="button"
                  onClick$={() => {
                    coordinateInput.value?.focus();
                    coordinateInput.value?.select();
                  }}
                  class="inline-flex min-h-11 items-center rounded-xl border border-control px-3 text-sm font-semibold text-brand"
                >
                  {translate(locale, "Seleccionar coordenadas")}
                </button>
              </div>
            )}

            {/* Lanzadores de aplicaciones GPS: salen del sitio en otra
                pestaña y ahora lo anuncian. Una sola columna en el teléfono:
                a 320 px "OpenStreetMap" no entra en media columna. */}
            <div class="mt-5 grid gap-2 sm:grid-cols-2">
              {launchers.map((launcher) => (
                <a
                  key={launcher.href}
                  href={launcher.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick$={() => triggerHapticFeedback("selection")}
                  class="flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border border-control bg-surface px-3 py-2 text-left transition-colors hover:border-brand-500 hover:bg-muted touch-manipulation"
                >
                  <span class="text-sm font-semibold text-ink-strong">
                    {launcher.name}
                    <ExternalLinkHint />
                  </span>
                  <span class="text-2xs text-ink-muted">{launcher.hint}</span>
                </a>
              ))}
            </div>
          </DialogFrame>
        )}
      </div>
    );
  },
);
