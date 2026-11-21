import { createContextId, useContext } from "@qwik.dev/core";
import type { RequestEventBase } from "@qwik.dev/router";

/**
 * Zona horaria del visitante.
 *
 * Hasta ahora **todo** se mostraba en UTC y nada lo decía. Para quien vive en
 * Buenos Aires, una encuesta que cierra el 4 de abril a las 21:00 aparecía
 * cerrando "el 5 de abril"; en Auckland el desfase da vuelta el día en la
 * dirección contraria. No es un detalle de formato: la fecha de cierre es lo
 * que decide hasta cuándo se puede votar.
 *
 * El servidor no puede adivinarla —`Accept-Language` no la lleva— así que la
 * pone el navegador en una cookie, igual que el tema en `root.tsx`. La primera
 * pintura de la primera visita todavía sale en UTC; de ahí en más, en la zona
 * real.
 */
export const TIMEZONE_COOKIE = "agorbis-tz";

/** UTC como respaldo: es lo que se venía mostrando y no sorprende a nadie. */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * Valida la zona antes de usarla.
 *
 * El valor llega de una cookie, así que lo escribe el cliente. `Intl` **lanza**
 * con una zona desconocida, y eso tumbaría el render de cualquier página con
 * una fecha — es decir, casi todas. Se prueba una vez y se descarta si no
 * sirve.
 */
export function resolveTimeZone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** La zona del visitante, leída de la cookie de la petición. */
export function timeZoneOf(ev: RequestEventBase): string {
  return resolveTimeZone(ev.cookie.get(TIMEZONE_COOKIE)?.value);
}

export const TimeZoneContext = createContextId<string>("agorbis.timezone");

export function useTimeZone(): string {
  // Con el valor por defecto, un componente que muestra un instante se puede
  // probar sin proveer el contexto: cae en UTC, como el servidor sin cookie.
  return useContext(TimeZoneContext, DEFAULT_TIME_ZONE);
}
