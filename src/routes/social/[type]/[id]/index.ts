import type { RequestEventBase, RequestHandler } from "@qwik.dev/router";
import { createAnonymousSupabase, type DB } from "~/lib/supabase";
import { summarizeText, xmlText } from "~/lib/text";
import { formatMoney, pluralize } from "~/lib/format";
import {
  localeTag,
  matchSupportedLocale,
  resolveLocale,
  translate,
} from "~/lib/i18n";
import { isUuid } from "~/lib/http";

const wrap = (value: string, max = 42) => {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (!last || `${last} ${word}`.length > max) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  return lines.slice(0, 3);
};

/**
 * Cliente anónimo, sin cookies: la imagen se cachea como `public` en el
 * navegador y en el CDN, así que tiene que ser exactamente la que vería
 * cualquier visitante. Con el cliente de la sesión, un moderador que abriera
 * el enlace de una publicación retirada (RLS le deja leer `removed`) dejaba
 * esa versión en la caché compartida para todos. Y un cliente con cookies
 * puede refrescar la sesión y agregar `Set-Cookie` a una respuesta pública.
 *
 * El cliente es el compartido de `~/lib/supabase`; acá queda el porqué de
 * esta ruta.
 */
function anonymousSupabase(ev: RequestEventBase): DB {
  return createAnonymousSupabase(ev);
}

export const onGet: RequestHandler = async (ev) => {
  const db = anonymousSupabase(ev);
  const locale =
    matchSupportedLocale(ev.query.get("locale")) ?? resolveLocale(ev.locale());
  const type = ev.params.type;
  const id = ev.params.id;
  if (!["poll", "debate", "claim", "project"].includes(type) || !isUuid(id)) {
    throw ev.error(404, translate(locale, "Publicación no encontrada"));
  }
  let title: string | null = null;
  let subtitle = translate(
    locale,
    "Participación ciudadana con contexto local",
  );
  let communityId: string | null = null;
  let metric: string | null = null;

  if (type === "poll") {
    const { data } = await db
      .from("polls")
      .select("question, description, community_id")
      .eq("id", id)
      // Además de RLS: lo retirado no se dibuja ni queda en caché.
      .neq("status", "removed")
      .maybeSingle();
    title = data?.question ?? null;
    subtitle = data?.description ?? subtitle;
    communityId = data?.community_id ?? null;
  } else if (type === "debate") {
    const { data } = await db
      .from("debates")
      .select("title, body, community_id")
      .eq("id", id)
      // Además de RLS: lo retirado no se dibuja ni queda en caché.
      .neq("status", "removed")
      .maybeSingle();
    title = data?.title ?? null;
    subtitle = data?.body ?? subtitle;
    communityId = data?.community_id ?? null;
  } else if (type === "claim") {
    const { data } = await db
      .from("claims")
      .select("title, description, community_id, support_count")
      .eq("id", id)
      // Además de RLS: lo retirado no se dibuja ni queda en caché.
      .neq("status", "removed")
      .maybeSingle();
    title = data?.title ?? null;
    subtitle = data?.description ?? subtitle;
    communityId = data?.community_id ?? null;
    metric = data
      ? pluralize(
          data.support_count,
          "persona afectada",
          "personas afectadas",
          locale,
        )
      : null;
  } else if (type === "project") {
    const { data } = await db
      .from("projects")
      .select("title, summary, community_id, pledged_total, currency")
      .eq("id", id)
      // Además de RLS: lo retirado no se dibuja ni queda en caché.
      .neq("status", "removed")
      .maybeSingle();
    title = data?.title ?? null;
    subtitle = data?.summary ?? subtitle;
    communityId = data?.community_id ?? null;
    metric =
      data && Number(data.pledged_total) > 0
        ? translate(locale, "{{amount}} comprometidos", {
            amount: formatMoney(
              Number(data.pledged_total),
              data.currency,
              locale,
            ),
          })
        : null;
  }

  if (!title)
    throw ev.error(404, translate(locale, "Publicación no encontrada"));

  const { data: community } = communityId
    ? await db
        .from("communities")
        .select("name, emoji")
        .eq("id", communityId)
        .maybeSingle()
    : { data: null };
  const typeName =
    {
      poll: translate(locale, "ENCUESTA"),
      debate: translate(locale, "DEBATE"),
      claim: translate(locale, "RECLAMO"),
      project: translate(locale, "PROYECTO"),
    }[type] ?? "AGORBIS";
  const titleLines = wrap(title);
  const safeSubtitle = summarizeText(subtitle, 150);
  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<tspan x="76" dy="${index === 0 ? 0 : 68}">${xmlText(line)}</tspan>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#123d37"/><stop offset="1" stop-color="#0b6960"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <circle cx="1090" cy="70" r="270" fill="#ffffff" opacity=".055"/><circle cx="1110" cy="610" r="350" fill="#56d6bd" opacity=".08"/>
    <rect x="76" y="58" width="176" height="42" rx="21" fill="#75ead0"/><text x="164" y="86" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="700" fill="#123d37">${typeName}</text>
    <text x="76" y="170" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="750" fill="#ffffff">${titleSvg}</text>
    <text x="76" y="400" font-family="Inter,Arial,sans-serif" font-size="23" fill="#d7f5ee">${xmlText(safeSubtitle)}</text>
    ${metric ? `<text x="76" y="462" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#75ead0">${xmlText(metric)}</text>` : ""}
    <text x="76" y="553" font-family="Inter,Arial,sans-serif" font-size="22" fill="#ffffff">${xmlText(community?.emoji ?? "📍")} ${xmlText(community?.name ?? translate(locale, "Comunidad"))}</text>
    <text x="1124" y="553" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="31" font-weight="800" fill="#ffffff">Agorbis</text>
    <text x="1124" y="580" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="15" fill="#bde8de">${xmlText(translate(locale, "Tu lugar. Tu voz. Tu comunidad."))}</text>
  </svg>`;

  ev.headers.set("Content-Type", "image/svg+xml; charset=utf-8");
  ev.headers.set(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  ev.headers.set("X-Content-Type-Options", "nosniff");
  ev.headers.set("Content-Language", localeTag(locale));
  ev.send(200, svg);
};
