import { component$, useServerData } from "@qwik.dev/core";
import {
  DocumentHeadTags,
  QwikRouterProvider,
  RouterOutlet,
  useLocation,
} from "@qwik.dev/router";
import {
  canonicalHref,
  localeCatalogUrl,
  resolveLocale,
  translate,
} from "~/lib/i18n";

import "./global.css";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "~/lib/constants";
import { TIMEZONE_COOKIE } from "~/lib/timezone";
import { A11Y_BOOTSTRAP } from "~/lib/accessibility-preferences";
import { ACTION_GUARD_BOOTSTRAP } from "~/lib/action-guard";

/**
 * Aplica el tema antes del primer pintado para que no haya destello blanco al
 * entrar en modo oscuro. Corre síncrono en el `<head>`, antes de cualquier CSS
 * que dependa de `.dark`.
 *
 * De paso deja la zona horaria del navegador en una cookie. El servidor no
 * puede deducirla —no viaja en ningún header— y sin ella todas las fechas se
 * muestran en UTC: una encuesta que cierra el 4 a las 21:00 en Buenos Aires
 * anuncia el día 5. Se escribe acá, junto al tema, porque es el único punto
 * que corre antes de la primera pintura; sólo se toca si cambió, para no
 * reescribir la cookie en cada carga.
 *
 * También ajusta `theme-color`. Antes se resolvía sólo con
 * `prefers-color-scheme`, así que quien forzaba el tema claro sobre un sistema
 * oscuro terminaba con la barra del navegador oscura y la app clara. El tema
 * real lo decide esta misma función: que también decida el color del cromo.
 *
 * Y aplica las preferencias de accesibilidad guardadas (tamaño de texto,
 * contraste, lectura facilitada, movimiento, foco). Antes las aplicaba el
 * panel del pie recién cuando entraba en pantalla, así que en una página
 * larga la letra grande o el contraste llegaban al final y todo saltaba.
 */
const THEME_BOOTSTRAP = `(function(){try{
var saved=localStorage.getItem('agorbis-theme');
var dark=saved?saved==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark',dark);
var m=document.getElementById('meta-theme-color');
if(m)m.setAttribute('content',dark?'${THEME_COLOR_DARK}':'${THEME_COLOR_LIGHT}');
var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
var encodedTz=encodeURIComponent(tz);
if(tz&&document.cookie.indexOf('${TIMEZONE_COOKIE}='+encodedTz)<0){
document.cookie='${TIMEZONE_COOKIE}='+encodedTz+';path=/;max-age=31536000;samesite=lax'+(location.protocol==='https:'?';secure':'');}
}catch(e){}
try{
${A11Y_BOOTSTRAP}
}catch(e){}})();`;

// Sólo este enlace depende de la ruta. Volver a renderizar <head> elimina los
// estilos globales que Qwik/Vite agrega durante SSR fuera de nuestro JSX.
const CanonicalLink = component$(() => {
  const { url } = useLocation();
  return <link rel="canonical" href={canonicalHref(url)} />;
});

const RootDocument = component$(() => {
  const locale = resolveLocale(useServerData<string>("locale"));
  const nonce = useServerData<string>("nonce");
  const catalogUrl = localeCatalogUrl(locale);

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Va antes del script: así el bootstrap lo encuentra ya parseado y lo
            corrige de forma síncrona, sin parpadeo en la barra del navegador.
            El valor SSR es el claro, que es el fallback sin JavaScript. */}
        <meta
          id="meta-theme-color"
          name="theme-color"
          content={THEME_COLOR_LIGHT}
        />
        <script nonce={nonce} dangerouslySetInnerHTML={THEME_BOOTSTRAP} />
        {/* Ningún envío queda mudo: ver `src/lib/action-guard.ts` (D114). */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={ACTION_GUARD_BOOTSTRAP}
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {/* El manifiesto ya declaraba los PNG, pero iOS no lo mira para
            "Agregar a inicio": sin `apple-touch-icon` guardaba una captura
            borrosa de la página en vez del ícono. El PNG también es el
            respaldo de los navegadores que ignoran el favicon SVG. */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icon-192.png"
        />
        <link rel="manifest" href={`/manifest.webmanifest?locale=${locale}`} />
        {/* El catálogo de interfaz no va en el bundle común (ver `i18n.ts`):
            sólo quien navega en inglés lo precarga, antes de que el primer
            segmento lo pida. */}
        {catalogUrl && (
          <link rel="modulepreload" href={catalogUrl} nonce={nonce} />
        )}

        <DocumentHeadTags />

        <CanonicalLink />
      </head>
      <body class="bg-app text-ink">
        <a
          href="#contenido"
          class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-2xl focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          {translate(locale, "Saltar al contenido")}
        </a>
        <RouterOutlet />
      </body>
    </>
  );
});

// Los componentes reactivos del documento leen el router desde este provider,
// cuya inicialización es exclusiva de SSR.
export default component$(() => (
  <QwikRouterProvider>
    <RootDocument />
  </QwikRouterProvider>
));
