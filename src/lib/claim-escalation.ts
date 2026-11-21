import { DEFAULT_LOCALE, translate, type Locale } from "./i18n";

/**
 * Estado del reloj de respuesta de un reclamo (D58).
 *
 * La base decide *si* un reclamo escala; acá sólo se traduce el estado a algo
 * mostrable. Las cuatro variantes son excluyentes y cubren todo el ciclo:
 *
 *   · `answered`  · alguna institución acusó recibo. El reloj se detuvo.
 *   · `escalated` · venció sin respuesta y ya subió a la comunidad padre.
 *   · `overdue`   · venció sin respuesta pero todavía no escaló (le falta
 *                   apoyo, o el cron no corrió).
 *   · `waiting`   · el reloj corre.
 *
 * `none` es el caso de los niveles sin ventana configurada: no hay reloj que
 * mostrar y la UI no debe inventar uno.
 */
export type ResponseClockState =
  "none" | "waiting" | "overdue" | "escalated" | "answered";

export interface ClaimClockFields {
  response_due_at: string | null;
  first_response_at: string | null;
  escalated_at: string | null;
  status: string;
}

export interface ResponseClock {
  state: ResponseClockState;
  /** Días que faltan (waiting) o que lleva vencido (overdue/escalated). */
  days: number;
}

const DAY_MS = 86_400_000;

/** Días calendario entre dos instantes, redondeando hacia arriba. */
const daysBetween = (from: number, to: number) =>
  Math.max(0, Math.ceil((to - from) / DAY_MS));

export function responseClock(
  claim: ClaimClockFields,
  now: Date = new Date(),
): ResponseClock {
  // Un reclamo cerrado ya no espera nada de nadie: mostrarle un reloj sería
  // pedir una respuesta que dejó de tener sentido.
  const settled = !["open", "under_review"].includes(claim.status);

  if (claim.first_response_at) return { state: "answered", days: 0 };
  if (claim.escalated_at) {
    return {
      state: "escalated",
      days: daysBetween(new Date(claim.escalated_at).getTime(), now.getTime()),
    };
  }
  if (!claim.response_due_at || settled) return { state: "none", days: 0 };

  const due = new Date(claim.response_due_at).getTime();
  const t = now.getTime();
  return due > t
    ? { state: "waiting", days: daysBetween(t, due) }
    : { state: "overdue", days: daysBetween(due, t) };
}

/** Etiqueta corta para tarjetas de listado. `null` cuando no hay nada que decir. */
export function clockBadge(
  clock: ResponseClock,
  locale: Locale = DEFAULT_LOCALE,
): { label: string; tone: "neutral" | "brand" | "success" | "warn" } | null {
  switch (clock.state) {
    case "answered":
      return { label: translate(locale, "Con respuesta"), tone: "success" };
    case "escalated":
      return { label: translate(locale, "Escalado"), tone: "brand" };
    case "overdue":
      return {
        label:
          clock.days === 1
            ? translate(locale, "Sin respuesta hace 1 día")
            : translate(locale, "Sin respuesta hace {{count}} días", {
                count: clock.days,
              }),
        tone: "warn",
      };
    default:
      return null;
  }
}

/**
 * Cuánto apoyo le falta a un reclamo para poder escalar.
 *
 * Replica `claim_escalation_threshold` de 0026. Duplicar la fórmula en el
 * cliente es deliberado y acotado: la base sigue siendo la única que decide, y
 * acá sólo se usa para explicarle a alguien cuánto le falta. Si divergen, lo
 * peor que pasa es que el texto quede desactualizado un día; la alternativa
 * —una consulta más por tarjeta— no lo justifica.
 */
export function escalationThreshold(memberCount: number): number {
  return Math.max(3, Math.min(50, Math.ceil(memberCount * 0.01)));
}

/**
 * Días que tienen las instituciones para acusar recibo, por nivel.
 *
 * Refleja las filas que 0026 siembra en `claim_response_windows`. Se duplica
 * acá por el mismo criterio acotado que `escalationThreshold`, y además por una
 * razón concreta: esa tabla no tiene `grant select` para `anon` ni para
 * `authenticated` —sólo la lee el trigger, que corre como `security definer`—,
 * así que consultarla desde el navegador devuelve `42501` y el texto quedaría
 * mudo para siempre.
 *
 * Los niveles 0 y 1 no figuran a propósito (D58): por encima del país no hay
 * institución con competencia, y ahí no hay plazo que prometer.
 */
const RESPONSE_DAYS_BY_LEVEL: Record<number, number> = {
  2: 45,
  3: 30,
  4: 20,
  5: 15,
};

/** Plazo de respuesta del nivel, o `null` si ese nivel no tiene ventana. */
export function responseDaysForLevel(level: number): number | null {
  return RESPONSE_DAYS_BY_LEVEL[level] ?? null;
}
