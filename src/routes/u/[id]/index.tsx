import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { Avatar, Card, Chip, EmptyState } from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  CivicPassportCard,
  type CivicBadge,
} from "~/components/profile/CivicPassportCard";
import { CivicActivityHeatmap } from "~/components/profile/CivicActivityHeatmap";
import { contentHref } from "~/lib/community";
import { APP_NAME } from "~/lib/constants";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import type { ContentType } from "~/lib/database.types.helpers";
import { useLocale, resolveLocale, translate } from "~/lib/i18n";
import {
  isPublicUsername,
  loadPublicProfile,
  loadPublicProfileByUsername,
  publicProfileHref,
} from "~/lib/public-profile";
import { many } from "~/lib/query";
import { supabase } from "~/lib/session";
import { isUuid } from "~/lib/http";

/** Publicaciones propias que se listan por tipo antes de recortar el total. */
const PER_TYPE = 10;
const SHOWN = 20;

interface Publicacion {
  kind: ContentType;
  id: string;
  title: string;
  created_at: string;
}

/**
 * Perfil público de otra persona.
 *
 * Muestra sólo dos cosas: quién es y qué publicó. Lo que **no** muestra es
 * deliberado y viene del modelo de privacidad ya existente:
 *
 * - Nada de votos. Sólo existe un recibo privado sin la opción elegida y
 *   tallies agregados; no se persiste una fila de boleta individual.
 * - Nada de comunidades. `community_visibility` deja pedir anonimato en una
 *   comunidad puntual (D-identidad pública), así que listar dónde vive alguien
 *   sortearía esa preferencia.
 * - Ni bio ni fecha de alta: `profiles` sólo la lee su dueño o moderación, y
 *   `public_profile()` expone nombre y avatar y nada más. Ampliarlo es una
 *   decisión de producto, no un detalle de implementación.
 *
 * El resolver de aliases devuelve esos mismos cuatro campos. Un UUID o alias
 * anterior redirige al username vigente sin abrir la tabla de perfiles.
 */
export const usePublicProfile = routeLoader$(async (ev) => {
  const identifier = ev.params.id;
  if (!isUuid(identifier) && !isPublicUsername(identifier)) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "Esa cuenta no existe."),
    );
  }

  const db = supabase(ev);
  const profile = isUuid(identifier)
    ? await loadPublicProfile(db, identifier)
    : await loadPublicProfileByUsername(db, identifier);
  if (!profile) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "Esa cuenta no existe."),
    );
  }

  if (identifier !== profile.username) {
    // Un nombre puede volver a usarse por su dueño. Cachear permanentemente
    // A → B y luego B → A crearía un ciclo aunque la base resuelva bien.
    ev.headers.set("Cache-Control", "private, no-store");
    const lang = ev.url.searchParams.get("lang");
    const suffix = lang === "es" || lang === "en" ? `?lang=${lang}` : "";
    throw ev.redirect(302, publicProfileHref(profile) + suffix);
  }
  const id = profile.id;

  const propias = <T extends { id: string; created_at: string }>(
    kind: ContentType,
    rows: T[],
    titulo: (row: T) => string,
  ): Publicacion[] =>
    rows.map((row) => ({
      kind,
      id: row.id,
      title: titulo(row),
      created_at: row.created_at,
    }));

  // Cada tipo por separado: RLS ya esconde lo que no corresponde y `removed`
  // se descarta acá para no listar lo que moderación bajó.
  const [encuestas, debates, reclamos, proyectos] = await Promise.all([
    many(
      ev,
      "perfil-publico/encuestas",
      db
        .from("polls")
        .select("id, question, created_at")
        .eq("author_id", id)
        .neq("status", "removed")
        // Las rondas de un acuerdo (D118) llevan como autora técnica a quien
        // adhirió último: no son publicaciones suyas.
        .is("agreement_id", null)
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
    ),
    many(
      ev,
      "perfil-publico/debates",
      db
        .from("debates")
        .select("id, title, created_at")
        .eq("author_id", id)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
    ),
    many(
      ev,
      "perfil-publico/reclamos",
      db
        .from("claims")
        .select("id, title, created_at")
        .eq("author_id", id)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
    ),
    many(
      ev,
      "perfil-publico/proyectos",
      db
        .from("projects")
        .select("id, title, created_at")
        .eq("author_id", id)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .limit(PER_TYPE),
    ),
  ]);

  const publicaciones = [
    ...propias("poll", encuestas, (r) => r.question),
    ...propias("debate", debates, (r) => r.title),
    ...propias("claim", reclamos, (r) => r.title),
    ...propias("project", proyectos, (r) => r.title),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, SHOWN);

  return { profile, publicaciones };
});

export default component$(() => {
  const data = usePublicProfile();
  const locale = useLocale();
  const { profile, publicaciones } = data.value;
  const nombre = profile.display_name ?? profile.username;

  // Íconos propios (D123, D126) en lugar del emoji fijado en el código; los
  // sellos de proyectos y reclamos usan el ícono de su tipo.
  const badges: CivicBadge[] = [
    {
      id: "creator",
      icon: "file-text",
      title: translate(locale, "Voz Ciudadana"),
      description: translate(
        locale,
        "Publicó iniciativas y reclamos abiertos para su comunidad.",
      ),
      unlocked: publicaciones.length >= 1,
      progressText: translate(locale, "{{count}} publicaciones abiertas", {
        count: publicaciones.length,
      }),
    },
    {
      id: "proposals",
      icon: "ballot",
      title: translate(locale, "Proponente Activo"),
      description: translate(
        locale,
        "Abrió encuestas o debates para deliberar con vecinos.",
      ),
      unlocked: publicaciones.some(
        (p) => p.kind === "poll" || p.kind === "debate",
      ),
      progressText: translate(locale, "Encuestas y debates comunitarios"),
    },
    {
      id: "solutions",
      icon: CONTENT_KINDS.project.icon,
      title: translate(locale, "Constructor Barrial"),
      description: translate(
        locale,
        "Impulsa proyectos vecinales para resolver necesidades concretas.",
      ),
      unlocked: publicaciones.some((p) => p.kind === "project"),
      progressText: translate(locale, "Proyectos de transformación vecinal"),
    },
    {
      id: "claims",
      icon: CONTENT_KINDS.claim.icon,
      title: translate(locale, "Defensor del Barrio"),
      description: translate(
        locale,
        "Visibiliza reclamos urgentes para mejorar la infraestructura común.",
      ),
      unlocked: publicaciones.some((p) => p.kind === "claim"),
      progressText: translate(locale, "Reclamos comunitarios presentados"),
    },
  ];

  return (
    <div class="container-reading py-10">
      {/* La misma banda de identidad que /perfil (D124), sin `--level-tint`:
          este perfil no conoce la residencia y no tiene por qué conocerla,
          así que queda el matiz por defecto. Sólo nombre y usuario. */}
      <header class="level-band -mx-4 flex flex-wrap items-center gap-4 rounded-2xl px-4 pb-5 pt-6 sm:-mx-6 sm:px-6">
        <Avatar src={profile.avatar_url} name={nombre} size="lg" />
        <div class="min-w-0">
          <h1 class="break-words text-display-lg sm:text-display-xl">
            {nombre}
          </h1>
          <p class="mt-1 text-sm text-ink-muted">@{profile.username}</p>
        </div>
      </header>

      {/* Lo útil primero, como en /perfil: quien llega desde un comentario
          busca lo que la persona publicó, no sus sellos. */}
      <section class="mt-8" aria-labelledby="publicaciones">
        <h2 id="publicaciones" class="text-display-sm">
          {translate(locale, "Lo que publicó")}
        </h2>
        {/* Se dice qué no está acá. Una página que muestra "actividad" y omite
            los votos sin explicarlo se lee como si la persona no votara. */}
        <p class="mt-1 text-sm text-ink-muted">
          {translate(
            locale,
            "Encuestas, debates, reclamos y proyectos que abrió. Las participaciones no muestran la elección, que no queda guardada.",
          )}
        </p>

        {/* Cada fila con la anatomía de "Pasando ahora" (D123): franja y
            badge con el color y el ícono del tipo, la fecha a la derecha y el
            título como pieza dominante. Antes era una tabla propia de emojis
            y un badge neutro, lo que content-kinds.ts vino a juntar. */}
        {publicaciones.length === 0 ? (
          <div class="mt-5">
            <EmptyState
              illustration="sprout"
              title="Todavía no publicó nada"
              description="Cuando abra una encuesta, un debate, un reclamo o un proyecto, va a aparecer acá."
            />
          </div>
        ) : (
          <ul class="mt-5 space-y-3">
            {publicaciones.map((item) => {
              const meta = CONTENT_KINDS[item.kind];
              const tones = CONTENT_KIND_TONES[item.kind];
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={contentHref(item.kind, item.id)}
                    class="block rounded-2xl"
                  >
                    <Card interactive accent={tones.accent} class="p-4">
                      <div class="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                        <Chip
                          variant="badge"
                          icon={meta.icon}
                          toneClass={tones.badge}
                        >
                          {translate(locale, meta.label)}
                        </Chip>
                        <RelativeTime
                          value={item.created_at}
                          class="ml-auto tabular-nums"
                        />
                      </div>
                      <h3
                        dir="auto"
                        class="mt-3 line-clamp-2 font-display text-display-xs text-ink-strong"
                      >
                        {item.title}
                      </h3>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Sólo sellos: nivel y barra son del perfil propio, que cuenta votos,
          comentarios y apoyos que acá no se ven (D126). */}
      <div class="mt-8">
        <CivicPassportCard badges={badges} own={false} />
      </div>

      <div class="mt-6">
        <CivicActivityHeatmap publicaciones={publicaciones} />
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(usePublicProfile);
  // El título es el nombre de la persona, que no se traduce: no hace falta el
  // locale acá.
  const nombre = data?.profile.display_name ?? data?.profile.username ?? "";
  return {
    title: `${nombre} · ${APP_NAME}`,
    // `noindex` a propósito: es contenido público dentro de la app, pero nadie
    // aceptó que su nombre y su historial de publicaciones queden en un
    // buscador. Las publicaciones sí se indexan, cada una en su página.
    meta: [{ name: "robots", content: "noindex" }],
  };
};
