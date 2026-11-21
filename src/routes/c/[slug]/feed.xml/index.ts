import type { RequestEventBase, RequestHandler } from "@qwik.dev/router";
import { APP_NAME } from "~/lib/constants";
import { siteOrigin } from "~/lib/http";
import { createAnonymousSupabase, type DB } from "~/lib/supabase";
import { summarizeText, xmlText } from "~/lib/text";

/**
 * Largo máximo, en code points, del extracto de cada ítem. El texto completo
 * vive en la página del reclamo (`<link>`): los lectores RSS guardan copia de
 * cada ítem y no se enteran si el autor después lo edita o lo retira, así que
 * cuanto menos texto se redistribuya, menos queda dando vueltas.
 */
const EXCERPT_MAX = 280;

/**
 * Cliente anónimo, sin cookies: el feed se cachea como `public` en el CDN, así
 * que tiene que ser el mismo para cualquiera. El de la sesión podría refrescar
 * el token y agregar `Set-Cookie` a una respuesta compartida.
 *
 * El cliente es el compartido de `~/lib/supabase`; acá queda el porqué de
 * esta ruta.
 */
function anonymousSupabase(ev: RequestEventBase): DB {
  return createAnonymousSupabase(ev);
}

/**
 * Canal RSS 2.0 abierto de novedades cívicas barriales.
 * Permite la sindicación en lectores de noticias, agregadores y medios comunitarios.
 */
export const onGet: RequestHandler = async (ev) => {
  const db = anonymousSupabase(ev);
  const slug = ev.params.slug;

  const { data: community } = await db
    .from("communities")
    .select("id, slug, name, emoji")
    .eq("slug", slug)
    .maybeSingle();

  if (!community) {
    throw ev.error(404, "Comunidad no encontrada");
  }

  const { data: claims } = await db
    .from("claims")
    .select(
      "id, title, description, category, status, support_count, created_at",
    )
    .eq("community_id", community.id)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(25);

  const origin = siteOrigin(ev);
  const communityUrl = `${origin}/c/${community.slug}`;
  // Atribución neutra: la licencia de reutilización todavía no está decidida,
  // así que no se declara ninguna (ni `<copyright>`). Va en la descripción del
  // canal, que es lo que muestran los lectores, con el origen y los Términos.
  const attribution = `Contenido publicado por vecinos en ${APP_NAME} (${communityUrl}); consultá los Términos (${origin}/terminos).`;

  const itemsXml = (claims ?? [])
    .map((c) => {
      const claimUrl = `${origin}/reclamos/${c.id}`;
      const pubDate = new Date(c.created_at).toUTCString();
      const statusLabel =
        c.status === "resolved"
          ? "🏆 [RESUELTO / VICTORIA]"
          : "📣 [EN DEMANDA]";

      return `    <item>
      <title>${xmlText(`${statusLabel} ${c.title}`)}</title>
      <link>${xmlText(claimUrl)}</link>
      <guid isPermaLink="true">${xmlText(claimUrl)}</guid>
      <description>${xmlText(summarizeText(c.description, EXCERPT_MAX))}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlText(`${community.emoji} ${community.name} · Novedades Cívicas · ${APP_NAME}`)}</title>
    <link>${xmlText(communityUrl)}</link>
    <description>${xmlText(`Reclamos ciudadanos, victorias y participación vecinal en ${community.name}. ${attribution}`)}</description>
    <language>es</language>
    <atom:link href="${xmlText(`${origin}/c/${community.slug}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <atom:link href="${xmlText(communityUrl)}" rel="alternate" type="text/html" />
    <atom:link href="${xmlText(`${origin}/terminos`)}" rel="related" type="text/html" title="${xmlText("Términos")}" />
${itemsXml}
  </channel>
</rss>`;

  ev.headers.set("Content-Type", "application/rss+xml; charset=utf-8");
  ev.headers.set("Cache-Control", "public, max-age=600, s-maxage=1800");
  ev.send(200, rss);
};
