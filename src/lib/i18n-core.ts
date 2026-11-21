export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "agorbis-locale";
export const LOCALE_QUERY_PARAM = "lang";

const localeMetadata: Record<Locale, { tag: string }> = {
  es: { tag: "es-AR" },
  en: { tag: "en" },
};

interface LanguagePreference {
  locale: Locale;
  quality: number;
  index: number;
}

const QUALITY_VALUE = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?|\.\d{1,3})$/;

function qualityValue(parameters: string[]): number {
  const quality = parameters
    .map((parameter) => /^q\s*=\s*(.*)$/i.exec(parameter.trim()))
    .find((match) => match !== null)?.[1];
  if (quality === undefined) return 1;
  if (!QUALITY_VALUE.test(quality)) return 0;
  return Number(quality);
}

function prefer(
  current: LanguagePreference | undefined,
  candidate: LanguagePreference,
): LanguagePreference {
  if (!current) return candidate;
  if (candidate.quality > current.quality) return candidate;
  if (
    candidate.quality === current.quality &&
    candidate.index < current.index
  ) {
    return candidate;
  }
  return current;
}

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/** Acepta la variante regional de un idioma soportado, pero no una lista. */
export function matchSupportedLocale(
  value: string | null | undefined,
): Locale | null {
  if (!value) return null;
  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  const exact = SUPPORTED_LOCALES.find(
    (locale) => normalized === locale.toLowerCase(),
  );
  if (exact) return exact;
  const base = normalized.split("-")[0];
  return (
    SUPPORTED_LOCALES.find(
      (locale) => base === locale.toLowerCase().split("-")[0],
    ) ?? null
  );
}

/**
 * Resuelve una etiqueta BCP 47 o un `Accept-Language` completo. Las variantes
 * explícitas prevalecen sobre `*`, incluso con q=0, para respetar exclusiones.
 */
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;

  const explicit = new Map<Locale, LanguagePreference>();
  let wildcard: Omit<LanguagePreference, "locale"> | undefined;

  value.split(",").forEach((raw, index) => {
    const [range = "", ...parameters] = raw.trim().split(";");
    const quality = qualityValue(parameters);

    if (range.trim() === "*") {
      const candidate = { quality, index };
      if (
        !wildcard ||
        candidate.quality > wildcard.quality ||
        (candidate.quality === wildcard.quality &&
          candidate.index < wildcard.index)
      ) {
        wildcard = candidate;
      }
      return;
    }

    const locale = matchSupportedLocale(range);
    if (!locale) return;
    explicit.set(
      locale,
      prefer(explicit.get(locale), { locale, quality, index }),
    );
  });

  const preferences = SUPPORTED_LOCALES.map((locale, supportedIndex) => {
    const direct = explicit.get(locale);
    if (direct) return { ...direct, supportedIndex };
    if (wildcard) return { locale, ...wildcard, supportedIndex };
    return null;
  })
    .filter(
      (
        preference,
      ): preference is LanguagePreference & { supportedIndex: number } =>
        preference !== null && preference.quality > 0,
    )
    .sort(
      (a, b) =>
        b.quality - a.quality ||
        a.index - b.index ||
        a.supportedIndex - b.supportedIndex,
    );

  return preferences[0]?.locale ?? DEFAULT_LOCALE;
}

/** Query válida > cookie válida > negociación del navegador. */
export function negotiateLocale({
  requested,
  stored,
  acceptLanguage,
}: {
  requested?: string | null;
  stored?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  return (
    matchSupportedLocale(requested) ??
    matchSupportedLocale(stored) ??
    resolveLocale(acceptLanguage)
  );
}

export function localeTag(locale: Locale): string {
  return localeMetadata[locale].tag;
}

export function localeDirection(locale: string): "ltr" | "rtl" {
  const base = locale.trim().replaceAll("_", "-").split("-")[0]!.toLowerCase();
  return ["ar", "fa", "he", "ur"].includes(base) ? "rtl" : "ltr";
}

/** Fuerza navegación completa: el servidor persiste la preferencia en cookie. */
export function localeSwitchHref(url: URL, locale: Locale): string {
  const params = new URLSearchParams(url.search);
  params.set(LOCALE_QUERY_PARAM, locale);
  const search = params.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/** Filtros, paginación, idioma y fragmentos no crean otra URL canónica. */
export function canonicalHref(url: URL): string {
  const canonical = new URL(url.href);
  canonical.search = "";
  canonical.hash = "";
  return canonical.href;
}
