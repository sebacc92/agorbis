import { resolveTimeZone } from "./timezone";

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const formatterFor = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

function civilParts(date: Date, timeZone: string) {
  const parts = formatterFor(timeZone).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return [
    value("year"),
    value("month"),
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  ] as const;
}

export function publicationDateTime(instant: Date, timeZone: string) {
  const [year, month, day, hour, minute] = civilParts(
    instant,
    resolveTimeZone(timeZone),
  );
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function publicationTimeZones(current: string) {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return [...new Set(["UTC", resolveTimeZone(current), ...supported])];
}

export type PublicationInstant =
  | { valid: true; iso: string }
  | { valid: false; reason: "zone" | "date" | "missing" | "ambiguous" };

/** Interpreta una hora civil en la zona elegida, sin usar la zona del Worker. */
export function publicationInstant(
  value: string,
  timeZone: string,
): PublicationInstant {
  if (resolveTimeZone(timeZone) !== timeZone)
    return { valid: false, reason: "zone" };
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return { valid: false, reason: "date" };
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  if (new Date(wall).toISOString().slice(0, 16) !== value)
    return { valid: false, reason: "date" };

  // Las zonas a ambos lados de una transición pueden tener dos desfases.
  // Se comprueban candidatos en ambos, sin elegir arbitrariamente una de las
  // dos repeticiones ni normalizar una hora inexistente durante el cambio.
  const offsets = new Set<number>();
  for (const delta of [-36, 0, 36]) {
    const probe = new Date(wall + delta * 3_600_000);
    const [y, mo, d, h, mi, s] = civilParts(probe, timeZone);
    offsets.add(Date.UTC(y, mo - 1, d, h, mi, s) - probe.getTime());
  }
  const candidates = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((instant) => publicationDateTime(instant, timeZone) === value);
  if (!candidates.length) return { valid: false, reason: "missing" };
  if (candidates.length > 1) return { valid: false, reason: "ambiguous" };
  return { valid: true, iso: candidates[0]!.toISOString() };
}

export function publicationTimeError(
  reason: Exclude<PublicationInstant, { valid: true }>["reason"],
) {
  if (reason === "zone") return "Elegí una zona horaria válida de la lista.";
  if (reason === "missing")
    return "Esa hora no existe en la zona elegida por el cambio de horario. Elegí otra hora.";
  if (reason === "ambiguous")
    return "Esa hora ocurre dos veces en la zona elegida por el cambio de horario. Elegí otra hora.";
  return "Ingresá una fecha y una hora de cierre válidas.";
}
