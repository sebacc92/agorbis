import type { RequestHandler } from "@qwik.dev/router";
import { siteOrigin } from "~/lib/http";

/**
 * `robots.txt` como ruta y no como archivo estático.
 *
 * El motivo es una línea: la directiva `Sitemap:` **exige una URL absoluta**.
 * El `public/robots.txt` que había declaraba `Sitemap: /sitemap.xml`, que los
 * rastreadores descartan en silencio — el sitemap existía y nadie lo leía.
 * Acá el origen se resuelve igual que en `sitemap.xml`, con `PUBLIC_SITE_URL`
 * y respaldo al origen de la petición.
 */
export const onGet: RequestHandler = (ev) => {
  const origin = siteOrigin(ev);

  const body = `User-agent: *
Allow: /

# Páginas de sesión: no aportan nada a un buscador.
Disallow: /perfil
Disallow: /onboarding
Disallow: /moderacion
Disallow: /metricas
Disallow: /ingresar
Disallow: /registro
Disallow: /notificaciones
Disallow: /auth/

# El buscador con parámetros genera infinitas URLs distintas para el mismo
# contenido, que ya está indexado por su propia página.
Disallow: /buscar

# Endpoints de cron y mantenimiento: no son páginas.
Disallow: /internal/

# Generador de imágenes para compartir: lo consumen las redes por la etiqueta
# og:image, no hace falta que un buscador lo recorra.
Disallow: /social/

Sitemap: ${origin}/sitemap.xml
`;

  ev.headers.set("Content-Type", "text/plain; charset=utf-8");
  ev.headers.set(
    "Cache-Control",
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  );
  ev.send(200, body);
};
