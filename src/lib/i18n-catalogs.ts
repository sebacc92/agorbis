import type { Messages } from "~/i18n/types";
import type { Locale } from "./i18n-core";

/** Nombre de la global por la que el catálogo cargado aparte llega a `i18n.ts`. */
export const CATALOG_GLOBAL = { en: "__agorbisMessagesEn" } as const;

interface CatalogSource {
  /** URL del archivo compilado aparte; ver `i18n-en-bundle.ts`. */
  url: string;
  /** Global en la que ese archivo deja el catálogo. */
  global: string;
}

export interface CatalogRegistryOptions {
  /** Catálogos disponibles de entrada (el español, y el inglés en el servidor). */
  initial: Partial<Record<Locale, Messages>>;
  sources: Partial<Record<Locale, CatalogSource>>;
  /** Inyectables para probar sin red ni `import()` real. */
  importModule?: (url: string) => Promise<unknown>;
  scope?: Record<string, unknown>;
  warn?: (message: string, error: unknown) => void;
}

/**
 * Registro de catálogos por idioma, con carga diferida de los que no vienen
 * en el bundle. Vive aparte de `i18n.ts` para poder probar la carga sin
 * navegador.
 */
export function createCatalogRegistry({
  initial,
  sources,
  importModule = (url) => import(/* @vite-ignore */ url),
  scope = globalThis as unknown as Record<string, unknown>,
  warn = (message, error) => console.warn(message, error),
}: CatalogRegistryOptions) {
  const catalogs: Partial<Record<Locale, Messages>> = { ...initial };
  const loading = new Map<Locale, Promise<boolean>>();

  /**
   * Carga el catálogo de `locale`. Devuelve si quedó disponible y nunca
   * rechaza: una falla de red no puede tirar abajo cada segmento que importa
   * `i18n.ts`; en ese caso se ve el texto fuente.
   */
  function load(locale: Locale): Promise<boolean> {
    if (catalogs[locale]) return Promise.resolve(true);
    const source = sources[locale];
    if (!source) return Promise.resolve(false);

    let pending = loading.get(locale);
    if (pending) return pending;
    pending = importModule(source.url)
      .then(() => {
        const catalog = scope[source.global] as Messages | undefined;
        delete scope[source.global];
        if (!catalog || typeof catalog !== "object") return false;
        catalogs[locale] = catalog;
        return true;
      })
      .catch((error: unknown) => {
        warn(`No se pudo cargar el catálogo de interfaz "${locale}".`, error);
        return false;
      })
      .then((loaded) => {
        // Una falla no queda cacheada: el próximo intento vuelve a pedirlo.
        if (!loaded) loading.delete(locale);
        return loaded;
      });
    loading.set(locale, pending);
    return pending;
  }

  return {
    get: (locale: Locale): Messages | undefined => catalogs[locale],
    load,
  };
}
