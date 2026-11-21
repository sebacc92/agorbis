import { component$, useSignal, type Signal } from "@qwik.dev/core";
import { Button } from "~/components/ui";
import { triggerHapticFeedback } from "~/lib/haptics";
import {
  toPublicLocationPoint,
  type PublicLocationPoint,
} from "~/lib/geolocation-privacy";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Marcar dónde está el problema.
 *
 * `location_text` seguía siendo prosa libre: "la esquina de Rivadavia y San
 * Martín" no se puede agrupar, ni ordenar, ni ubicar. Sin coordenadas no hay
 * forma de ver que tres vecinos reportaron el mismo pozo, ni de mostrar los
 * reclamos de un barrio en un mapa, ni de avisarle a alguien que lo que va a
 * publicar ya está publicado.
 *
 * Es opcional y se queda opcional: un reclamo se puede escribir desde una
 * computadora de escritorio, o ser sobre algo sin un punto único —"no pasa el
 * camión por todo el barrio"—. El texto sigue siendo el campo principal; esto
 * lo complementa.
 *
 * La ubicación la da el navegador, que pide permiso por su cuenta. Acá no se
 * insiste ni se vuelve a preguntar: si se dice que no, el reclamo se publica
 * igual con su texto.
 */
export const LocationCapture = component$<{
  locationText: string;
  initialLat?: string;
  initialLng?: string;
  /** Comparte sólo la zona pública con la revisión del formulario. */
  point?: Signal<PublicLocationPoint | null>;
}>(({ locationText, initialLat, initialLng, point: sharedPoint }) => {
  const locale = useLocale();
  // Los campos reenviados tampoco son confiables: degradamos la precisión
  // antes de restaurar una edición o un rechazo del formulario.
  const initialPoint = toPublicLocationPoint(initialLat, initialLng);
  const ownPoint = useSignal(initialPoint);
  const point = sharedPoint ?? ownPoint;
  const state = useSignal<"idle" | "asking" | "denied" | "unavailable">("idle");

  const hasPoint = point.value !== null;

  return (
    <div class="mt-3">
      {/* Van juntos o no van: la base rechaza media coordenada, así que los
            dos campos se llenan y se vacían a la vez. */}
      <input type="hidden" name="lat" value={point.value?.lat ?? ""} />
      <input type="hidden" name="lng" value={point.value?.lng ?? ""} />

      {hasPoint ? (
        <div class="rounded-2xl border border-success-500/30 bg-success-50/50 p-3.5 dark:bg-success-950/30 animate-scale-pop shadow-xs">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="inline-flex items-center gap-1.5 font-medium text-success-700 dark:text-success-300">
              <span aria-hidden="true" class="text-sm">
                📍
              </span>
              <span>{translate(locale, "Ubicación aproximada lista")}</span>
              <span class="rounded-md bg-success-500/15 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-success-800 dark:text-success-200">
                {point.value!.lat.toFixed(3)}, {point.value!.lng.toFixed(3)}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              class="text-xs text-ink-muted hover:text-danger-600"
              onClick$={() => {
                triggerHapticFeedback("selection");
                point.value = null;
                state.value = "idle";
              }}
            >
              {translate(locale, "Quitar")}
            </Button>
          </div>
          <p class="mt-1.5 text-xs text-ink-muted">
            {translate(
              locale,
              "Publicamos una zona de unos 100 m; no guardamos ni mostramos el punto GPS exacto.",
            )}
          </p>
        </div>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={state.value === "asking"}
            onClick$={() => {
              if (!navigator.geolocation) {
                state.value = "unavailable";
                return;
              }
              state.value = "asking";
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  // La precisión se degrada antes de guardarla en señales o
                  // inputs. El servidor y la DB vuelven a imponerla.
                  const publicPoint = toPublicLocationPoint(
                    position.coords.latitude,
                    position.coords.longitude,
                  );
                  if (!publicPoint) {
                    state.value = "unavailable";
                    return;
                  }
                  point.value = publicPoint;
                  state.value = "idle";
                  triggerHapticFeedback("success");
                },
                () => {
                  // No se distingue "dijo que no" de "no se pudo": para quien
                  // publica el resultado es el mismo y el reclamo sale igual.
                  state.value = "denied";
                },
                {
                  enableHighAccuracy: false,
                  maximumAge: 5 * 60_000,
                  timeout: 10_000,
                },
              );
            }}
          >
            <span aria-hidden="true">📍</span>{" "}
            {state.value === "asking"
              ? translate(locale, "Buscando tu ubicación…")
              : translate(locale, "Marcar zona aproximada")}
          </Button>

          <p class="mt-1.5 text-xs text-ink-faint">
            {state.value === "denied"
              ? translate(
                  locale,
                  "No pudimos obtener tu ubicación. El reclamo se publica igual con lo que escribiste.",
                )
              : state.value === "unavailable"
                ? translate(
                    locale,
                    "Este navegador no puede darnos la ubicación. El reclamo se publica igual.",
                  )
                : translate(
                    locale,
                    "Opcional. El navegador pide permiso una vez y publicamos sólo una zona aproximada de unos 100 m, nunca el punto GPS exacto.",
                  )}
          </p>
        </>
      )}

      {/* Marcar el punto no reemplaza describirlo: una coordenada sin texto
            no dice si el problema es el semáforo o el pozo de al lado. */}
      {hasPoint && !locationText.trim() && (
        <p class="mt-1.5 text-xs text-warn">
          {translate(
            locale,
            "Escribí también la referencia: la coordenada sola no dice qué hay ahí.",
          )}
        </p>
      )}
    </div>
  );
});
