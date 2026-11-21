import { createContextId, useContext } from "@qwik.dev/core";
import { isServer } from "@qwik.dev/core/build";
import { enMessages } from "~/i18n/en";
import { CATALOG_GLOBAL, createCatalogRegistry } from "./i18n-catalogs";
import enCatalogUrl from "./i18n-en-bundle?worker&url";
import { DEFAULT_LOCALE, matchSupportedLocale, type Locale } from "./i18n-core";

export {
  canonicalHref,
  DEFAULT_LOCALE,
  isSupportedLocale,
  localeDirection,
  localeSwitchHref,
  localeTag,
  LOCALE_COOKIE,
  LOCALE_QUERY_PARAM,
  matchSupportedLocale,
  negotiateLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from "./i18n-core";

/**
 * Catálogos por idioma. El español es el texto fuente, así que no necesita
 * catálogo.
 *
 * El inglés pesa más de 300 KB y antes viajaba en un chunk que importaban
 * casi todos los segmentos: lo descargaba también quien nunca lo iba a usar.
 * Ahora:
 *
 * - En el servidor se importa estático. `isServer` es una constante del
 *   build, así que en el bundle del cliente esa rama y el import desaparecen.
 * - En el navegador se carga aparte, sólo si el documento está en inglés.
 *   `?worker&url` hace que Vite compile `i18n-en-bundle.ts` como un archivo
 *   independiente y nos dé sólo su URL, sin que el grafo de bundles de Qwik
 *   se entere. Un `import("~/i18n/en")` común no sirve: queda como
 *   dependencia dinámica del chunk de i18n, y el preloader de Qwik precarga
 *   con ~99% de probabilidad las dependencias de un bundle seguro, es decir,
 *   lo bajaría en todas las páginas.
 * - La carga es un `await` de nivel superior de este módulo. Todo segmento
 *   que llama a `translate()` importa este módulo, así que ningún render,
 *   handler ni tarea del cliente corre antes de que el catálogo esté:
 *   `translate()` sigue siendo síncrono y un componente que se re-renderiza
 *   en el navegador sigue en inglés. Quien navega en español no espera nada.
 */
const CATALOG_SOURCES = {
  en: { url: enCatalogUrl, global: CATALOG_GLOBAL.en },
} as const;

const catalogs = createCatalogRegistry({
  initial: isServer ? { es: {}, en: enMessages } : { es: {} },
  sources: CATALOG_SOURCES,
});

/**
 * URL del catálogo que el navegador carga aparte para `locale`, o `null` si
 * ese idioma no necesita catálogo. `root.tsx` la precarga en el `<head>` para
 * que la descarga no espere a que el primer segmento importe este módulo. El
 * servidor y el cliente compilan el mismo archivo, así que la URL coincide.
 */
export function localeCatalogUrl(locale: Locale): string | null {
  return locale === "en" ? CATALOG_SOURCES.en.url : null;
}

/** Carga el catálogo de `locale` si hace falta; ver `createCatalogRegistry`. */
export const loadLocaleMessages = catalogs.load;

if (!isServer && typeof document !== "undefined") {
  const locale = matchSupportedLocale(document.documentElement.lang);
  if (locale && locale !== DEFAULT_LOCALE) await loadLocaleMessages(locale);
}

export const LocaleContext = createContextId<Locale>("agorbis.locale");

export type MessageParams = Readonly<Record<string, string | number>>;

/** Traduce solamente texto de interfaz. El contenido de la comunidad no pasa por esta función. */
export function translate(
  locale: Locale,
  source: string,
  params?: MessageParams,
): string {
  const catalog = catalogs.get(locale);
  // Sólo pasa en el navegador si el catálogo no pudo cargarse o el idioma
  // cambió sin recargar el documento: se muestra el texto fuente y se vuelve
  // a intentar la carga para los próximos renders.
  if (!catalog) void loadLocaleMessages(locale);
  const template = catalog?.[source] ?? source;
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Devuelve sólo un valor serializable. Los componentes llaman a la función
 * importada `translate(locale, ...)`, que Qwik no necesita capturar como dato.
 */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
