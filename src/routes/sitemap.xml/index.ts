import type { RequestHandler } from "@qwik.dev/router";
import { ORGANIZATIONS_LIMIT } from "~/lib/constants";
import { siteOrigin } from "~/lib/http";
import { logFailure } from "~/lib/log";
import { collectPages } from "~/lib/paginate";
import { escapeXml } from "~/lib/text";
import { createAnonymousSupabase } from "~/lib/supabase";

/**
 * Tope de la especificación: un sitemap admite 50.000 URLs y 50 MB sin
 * comprimir. Pasarse no degrada, invalida — el rastreador descarta el archivo
 * completo, no las URLs de más.
 *
 * Importa porque cada comunidad aporta hasta cinco entradas: con miles de
 * comunidades sobra lugar, pero la jerarquía crece sin techo y el barrio número
 * 10.001 dejaría el sitio entero sin sitemap sin que nada avisara. Cuando se
 * llegue al tope habrá que partirlo en un índice de sitemaps.
 */
const MAX_URLS = 50_000;

/**
 * Sitemap de comunidades. Son las páginas indexables que importan: cada una
 * tiene contenido propio (info, encuestas, debates, reclamos, proyectos).
 *
 * Las páginas de sesión (`/perfil`, `/onboarding`, `/moderacion`) quedan fuera
 * a propósito; además llevan `robots: noindex` en su `head`.
 */
export const onGet: RequestHandler = async (ev) => {
  // Cliente anónimo: la respuesta se cachea como `public` en el CDN, así que
  // tiene que ser la de cualquier visitante y no puede arrastrar un
  // `Set-Cookie` del refresco de sesión de quien la pidió primero.
  const db = createAnonymousSupabase(ev);
  const origin = siteOrigin(ev);

  const [communitiesResult, organizationsResult] = await Promise.all([
    // Por páginas: un `.limit()` solo devuelve 1.000 filas (`max_rows`) y
    // dejaba afuera a todas las ciudades. El orden por `slug`, que es único,
    // hace estable el corte entre páginas dentro de un mismo nivel.
    collectPages(
      (from, to) =>
        db
          .from("communities")
          .select("slug, level, member_count")
          .order("level", { ascending: true })
          .order("slug", { ascending: true })
          .range(from, to),
      MAX_URLS,
    ),
    // Las instituciones verificadas tienen página pública, indexable y con
    // `head` propio, y no estaban en el sitemap: existían para quien llegaba
    // por un enlace y para nadie más. Son pocas y estables, justo lo que un
    // sitemap sirve para declarar.
    db
      .from("organizations")
      .select("slug")
      .not("verified_at", "is", null)
      .order("name")
      .limit(ORGANIZATIONS_LIMIT),
  ]);

  if (communitiesResult.error || organizationsResult.error) {
    logFailure(
      { scope: "sitemap/cargar" },
      communitiesResult.error ?? organizationsResult.error,
    );
    ev.headers.set("Content-Type", "text/plain; charset=utf-8");
    ev.headers.set("Cache-Control", "no-store");
    ev.headers.set("Retry-After", "60");
    ev.send(503, "Sitemap temporalmente no disponible");
    return;
  }

  const communities = communitiesResult.rows;
  const organizations = organizationsResult.data;

  const urls: string[] = [
    `<url><loc>${escapeXml(origin)}/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/explorar/</loc><priority>0.8</priority><changefreq>weekly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/manual/</loc><priority>0.8</priority><changefreq>monthly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/instituciones/</loc><priority>0.7</priority><changefreq>weekly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/privacidad/</loc><priority>0.3</priority><changefreq>yearly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/eliminar-datos/</loc><priority>0.3</priority><changefreq>yearly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/terminos/</loc><priority>0.3</priority><changefreq>yearly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/normas-comunitarias/</loc><priority>0.4</priority><changefreq>monthly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/moderacion-y-apelaciones/</loc><priority>0.4</priority><changefreq>monthly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/subencargados/</loc><priority>0.3</priority><changefreq>monthly</changefreq></url>`,
    `<url><loc>${escapeXml(origin)}/transferencias-internacionales/</loc><priority>0.3</priority><changefreq>yearly</changefreq></url>`,
  ];

  // Antes de las comunidades: son un puñado y no pueden quedar afuera si algún
  // día la jerarquía llena el cupo de 50.000.
  for (const organization of organizations ?? []) {
    if (urls.length >= MAX_URLS) break;
    urls.push(
      `<url><loc>${escapeXml(origin)}/instituciones/${escapeXml(organization.slug)}/</loc><priority>0.5</priority><changefreq>monthly</changefreq></url>`,
    );
  }

  for (const community of communities ?? []) {
    if (urls.length >= MAX_URLS) break;

    // Las comunidades más generales y las más pobladas son las más relevantes.
    const priority = Math.max(0.3, 0.9 - community.level * 0.12).toFixed(1);
    const base = `${escapeXml(origin)}/c/${escapeXml(community.slug)}`;

    urls.push(
      `<url><loc>${base}/</loc><priority>${priority}</priority><changefreq>weekly</changefreq></url>`,
    );

    // Las sub-páginas sólo valen la pena donde hay actividad real.
    if (community.member_count > 0) {
      for (const tab of ["encuestas", "debates", "reclamos", "proyectos"]) {
        if (urls.length >= MAX_URLS) break;
        urls.push(
          `<url><loc>${base}/${tab}/</loc><priority>0.4</priority><changefreq>daily</changefreq></url>`,
        );
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  ev.headers.set("Content-Type", "application/xml; charset=utf-8");
  ev.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  ev.send(200, xml);
};
