import type { RequestHandler } from "@qwik.dev/router";
import { APP_NAME, APP_TAGLINE, THEME_COLOR_LIGHT } from "~/lib/constants";
import {
  localeDirection,
  localeTag,
  matchSupportedLocale,
  resolveLocale,
  translate,
} from "~/lib/i18n";

/** Violeta de marca (`--color-brand-600`): es el color del sistema, no el del fondo. */
const BRAND_COLOR = "#7c3aed";

export const onGet: RequestHandler = (ev) => {
  const requested = matchSupportedLocale(ev.query.get("locale"));
  const locale = requested ?? resolveLocale(ev.locale());
  const description = `${translate(locale, APP_TAGLINE)}.`;

  const manifest = {
    name: APP_NAME,
    short_name: APP_NAME,
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: localeTag(locale),
    dir: localeDirection(locale),
    // El fondo del splash es el mismo que el del cromo del navegador en tema
    // claro. Estaba escrito a mano como `#faf9fc`, igual que
    // `THEME_COLOR_LIGHT`: dos literales que había que cambiar juntos.
    background_color: THEME_COLOR_LIGHT,
    theme_color: BRAND_COLOR,
    // El SVG solo no alcanza: el diálogo de instalación de Android y el icono
    // adaptativo piden PNG de tamaños concretos. Los genera
    // `scripts/gen-images.mjs` (ver pnpm gen.images).
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: translate(locale, "Inicio"),
        short_name: translate(locale, "Inicio"),
        description: translate(locale, "Tu feed vecinal y comunidad"),
        url: "/inicio",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: translate(locale, "Explorar"),
        short_name: translate(locale, "Explorar"),
        description: translate(locale, "Explorar el mapa de comunidades"),
        url: "/explorar",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: translate(locale, "Buscar"),
        short_name: translate(locale, "Buscar"),
        description: translate(locale, "Buscar problemas y consultas"),
        url: "/buscar",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };

  ev.headers.set("Content-Type", "application/manifest+json; charset=utf-8");
  ev.headers.set("Content-Language", localeTag(locale));
  ev.headers.set(
    "Cache-Control",
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  );
  // Con `?locale=es|en` el idioma ya forma parte de la URL: no depende de la
  // cookie ni del header y puede compartir caché entre todos los visitantes.
  if (requested) ev.headers.set("Vary", "Accept-Encoding");
  ev.send(200, JSON.stringify(manifest));
};
