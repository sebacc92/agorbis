/**
 * Lógica pura del límite de errores que se recupera (D115).
 *
 * En `@qwik.dev/router` 2.0.0-beta.40, si durante una navegación interna el
 * loader del destino redirige en el servidor, la página destino se dibuja
 * sobre datos vacíos mientras arranca otra navegación y el render falla
 * (`insertBefore`). Después de ese fallo el router queda trabado: la segunda
 * navegación no termina, `isNavigating` queda en `true` y el `ErrorBoundary`
 * del router nunca borra su error. Pero la URL ya es la final, así que
 * recargar siempre recupera. Acá se decide cuándo recargar y qué mostrar.
 */

/**
 * Cuánto después de un cambio de ruta un error sigue contando como "vino de
 * una navegación". Se mira el `pathname`, no `isNavigating`: una acción de
 * formulario también lo enciende sin cambiar la URL, y recargar ahí tiraría el
 * resultado de la acción; y un filtro sólo cambia la query. La redirección del
 * servidor que provoca el fallo siempre cambia de ruta.
 */
export const NAVIGATION_WINDOW_MS = 4000;

/** Si el error llegó poco después de un cambio de ruta. */
export function cameFromNavigation(state: {
  msSincePathChange: number | null;
}): boolean {
  return (
    state.msSincePathChange !== null &&
    state.msSincePathChange < NAVIGATION_WINDOW_MS
  );
}

/** Tras este plazo, si la recarga no ocurrió, "Un momento…" cede al aviso. */
export const RELOAD_TIMEOUT_MS = 5000;

/** Marca en `history.state` de que esta entrada ya se recargó una vez. */
export const RECOVERY_STATE_KEY = "agorbisRecovered";

export type RecoveryDecision = "content" | "reload" | "fallback";

/**
 * Con error durante una navegación interna, y si esta entrada del historial
 * no se recargó todavía, se recarga una vez. Un error sin navegación es un
 * error real de la página y se muestra. Una segunda vez en la misma entrada
 * también: la recarga no lo arregló y recargar de nuevo sería un bucle.
 */
export function recoveryDecision(state: {
  error: unknown;
  navigating: boolean;
  alreadyRecovered: boolean;
}): RecoveryDecision {
  if (!state.error) return "content";
  if (state.navigating && !state.alreadyRecovered) return "reload";
  return "fallback";
}

/** Lee la marca sin suponer la forma de `history.state` (el router guarda `null`). */
export function hasRecovered(historyState: unknown): boolean {
  return (
    typeof historyState === "object" &&
    historyState !== null &&
    (historyState as Record<string, unknown>)[RECOVERY_STATE_KEY] === true
  );
}

/** Devuelve el `history.state` con la marca puesta, sin pisar lo demás. */
export function withRecoveredMark(
  historyState: unknown,
): Record<string, unknown> {
  const base =
    typeof historyState === "object" && historyState !== null
      ? (historyState as Record<string, unknown>)
      : {};
  return { ...base, [RECOVERY_STATE_KEY]: true };
}
