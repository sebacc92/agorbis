/** Formateo dependiente del idioma, seguro para SSR. */
import { DEFAULT_LOCALE, localeTag, translate, type Locale } from "./i18n";

export function formatNumber(
  value: number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value ?? 0);
}

export function formatMoney(
  amount: number | null | undefined,
  currency = "ARS",
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (amount === null || amount === undefined)
    return translate(locale, "Sin definir");
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Milisegundos de una fecha ISO, o `null` si no se puede leer.
 *
 * Una fecha ilegible —una columna nula que el tipo declara `string`, un
 * parámetro de URL escrito a mano, un dato viejo migrado a medias— no tiene por
 * qué tumbar una página entera, y `Intl` no perdona: `RelativeTimeFormat` y
 * `DateTimeFormat` lanzan `RangeError` con un valor no finito. Cada función de
 * abajo decide cómo degradar, pero todas parten de esta única comprobación en
 * vez de repetirla (o de olvidarla, que es lo que pasaba).
 */
function instantOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** "hace 3 horas", "hace 2 días". Devuelve "recién" para menos de un minuto. */
export function timeAgo(
  iso: string,
  locale: Locale = DEFAULT_LOCALE,
  now: Date = new Date(),
): string {
  const timestamp = instantOf(iso);
  if (timestamp === null) return translate(locale, "recién");
  const seconds = Math.max(0, (now.getTime() - timestamp) / 1000);
  if (seconds < 60) return translate(locale, "recién");

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2629800, "month"],
    [31557600, "year"],
  ];

  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), {
    numeric: "auto",
  });
  let chosen: [number, Intl.RelativeTimeFormatUnit] = units[0];
  for (const unit of units) {
    if (seconds >= unit[0]) chosen = unit;
  }
  return rtf.format(-Math.floor(seconds / chosen[0]), chosen[1]);
}

/**
 * Una **fecha de calendario**: un día, no un instante.
 *
 * Se fija en UTC a propósito y eso no es un descuido de zona horaria. Las
 * columnas `date` de la base —`event_date` de un reclamo, `target_date` de un
 * hito, `due_date` de una tarea— no representan un momento sino un día, y
 * llegan como medianoche UTC. Convertirlas a la zona del visitante las correría
 * un día entero hacia atrás para cualquiera al oeste de Greenwich.
 *
 * Para un instante real —cuándo cierra una encuesta, cuándo se publicó algo—
 * va `formatInstant`, que sí respeta la zona.
 */
export function formatDate(
  iso: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const timestamp = instantOf(iso);
  // `timeAgo` ya degradaba, pero ésta no: `RelativeTime` llama a las dos para
  // la misma fecha, así que una fecha ilegible seguía lanzando `RangeError`
  // desde acá y tumbaba el render de cualquier tarjeta que la mostrara.
  if (timestamp === null) return translate(locale, "fecha desconocida");
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
}

/**
 * Un **instante**, en la zona horaria de quien mira.
 *
 * Para columnas `timestamptz`: cuándo cierra una encuesta, cuándo se publicó
 * un comentario, cuándo vence una rendición. Antes todo esto se mostraba en
 * UTC sin decirlo, así que una encuesta que cierra el 4 a las 21:00 en Buenos
 * Aires anunciaba el día 5.
 *
 * Incluye la hora y el nombre corto de la zona: sin la hora, un cierre "el 4 de
 * abril" no dice si quedan dos horas o veintiséis, y sin la zona no hay forma
 * de saber respecto de qué reloj.
 */
export function formatInstant(
  iso: string,
  locale: Locale = DEFAULT_LOCALE,
  timeZone: string = "UTC",
): string {
  const timestamp = instantOf(iso);
  if (timestamp === null) return translate(locale, "fecha desconocida");
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(timestamp);
}

/**
 * Cuenta regresiva legible para el cierre de una encuesta.
 * Devuelve `null` si no hay fecha o si ya venció.
 */
export function countdown(
  closesAt: string | null,
  locale: Locale = DEFAULT_LOCALE,
  now: Date = new Date(),
): string | null {
  const closesAtMs = instantOf(closesAt);
  // Sin esto el `NaN` no cortaba en el `<= 0` de abajo —ninguna comparación con
  // `NaN` es verdadera— y la encuesta anunciaba "Cierra en NaN días".
  if (closesAtMs === null) return null;
  const ms = closesAtMs - now.getTime();
  if (ms <= 0) return null;

  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  if (days >= 1) {
    return days === 1
      ? translate(locale, "Cierra en 1 día")
      : translate(locale, "Cierra en {{count}} días", { count: days });
  }

  const hours = Math.floor(minutes / 60);
  if (hours >= 1) {
    return hours === 1
      ? translate(locale, "Cierra en 1 hora")
      : translate(locale, "Cierra en {{count}} horas", { count: hours });
  }
  return minutes <= 1
    ? translate(locale, "Cierra en menos de un minuto")
    : translate(locale, "Cierra en {{count}} minutos", { count: minutes });
}

export function isClosed(
  closesAt: string | null,
  status: string,
  now: Date = new Date(),
): boolean {
  if (status !== "active") return true;
  // `null` es un caso legítimo: la encuesta no tiene fecha de cierre y sigue
  // abierta. Un valor presente pero ilegible es otra cosa, y antes caía en la
  // misma rama: `NaN <= now` es `false`, así que la encuesta quedaba abierta
  // para siempre y se le seguían aceptando votos. Ante la duda se cierra —la
  // base es la que decide de verdad, y el error recuperable es no dejar votar,
  // no contar votos de una encuesta vencida.
  if (closesAt === null) return false;
  const closesAtMs = instantOf(closesAt);
  return closesAtMs === null || closesAtMs <= now.getTime();
}

/** "1 voto" / "12 votos", sin el "(s)" que afea todo. */
export function pluralize(
  count: number,
  singular: string,
  plural: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const category = new Intl.PluralRules(localeTag(locale)).select(count);
  return `${formatNumber(count, locale)} ${translate(locale, category === "one" ? singular : plural)}`;
}
