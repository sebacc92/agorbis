import type { RequestEventBase, RequestHandler } from "@qwik.dev/router";
import { APP_NAME } from "~/lib/constants";
import { siteOrigin } from "~/lib/http";
import { createAnonymousSupabase, type DB } from "~/lib/supabase";
import { summarizeText } from "~/lib/text";

/**
 * Largo máximo, en code points, del extracto de cada reclamo. El texto
 * completo vive en la página del reclamo (`url`): este archivo se descarga con
 * CORS abierto y se cachea en el CDN, así que redistribuir el texto entero
 * multiplicaría las copias de algo que su autor puede editar o retirar, sin
 * que esas copias se enteren.
 */
const EXCERPT_MAX = 280;

/**
 * Cliente anónimo, sin cookies: la respuesta es `public` y con CORS `*`, así
 * que tiene que ser la misma para cualquiera. El de la sesión podría refrescar
 * el token y agregar `Set-Cookie` a una respuesta que queda en el CDN.
 *
 * El cliente es el compartido de `~/lib/supabase`; acá queda el porqué de
 * esta ruta.
 */
function anonymousSupabase(ev: RequestEventBase): DB {
  return createAnonymousSupabase(ev);
}

/**
 * GeoJSON abierto de datos cívicos barriales.
 * Permite a periodistas locales, radios comunitarias, investigadores urbanos
 * y desarrolladores cívicos consultar los puntos y estado de reclamos vecinales.
 *
 * `lat`/`lng` ya llegan cuantizados a ~110 m desde la base (0040): acá no se
 * publica nada más preciso que lo que muestra la página del reclamo.
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
      "id, title, description, category, status, lat, lng, location_text, support_count, created_at",
    )
    .eq("community_id", community.id)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(100);

  const origin = siteOrigin(ev);
  const communityUrl = `${origin}/c/${community.slug}`;

  const features = (claims ?? [])
    .filter((c) => c.lat !== null && c.lng !== null)
    .map((c) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [c.lng, c.lat],
      },
      properties: {
        id: c.id,
        title: c.title,
        // Extracto, no el texto completo: ver EXCERPT_MAX.
        description: summarizeText(c.description, EXCERPT_MAX),
        category: c.category,
        status: c.status,
        location_text: c.location_text,
        support_count: c.support_count,
        created_at: c.created_at,
        url: `${origin}/reclamos/${c.id}`,
      },
    }));

  const geojson = {
    type: "FeatureCollection",
    community: {
      slug: community.slug,
      name: community.name,
      emoji: community.emoji,
      url: communityUrl,
    },
    // Atribución neutra: la licencia de reutilización todavía no está
    // decidida, así que no se declara ninguna. Quien reutilice el archivo
    // tiene el origen y los Términos a mano.
    attribution: {
      text: `Contenido publicado por vecinos en ${APP_NAME}; consultá los Términos.`,
      source_url: communityUrl,
      terms_url: `${origin}/terminos`,
      description_note: `description es un extracto de hasta ${EXCERPT_MAX} caracteres; el texto completo está en url.`,
    },
    features,
  };

  ev.headers.set("Content-Type", "application/geo+json; charset=utf-8");
  ev.headers.set("Access-Control-Allow-Origin", "*");
  ev.headers.set("Cache-Control", "public, max-age=600, s-maxage=1800");
  ev.json(200, geojson);
};
