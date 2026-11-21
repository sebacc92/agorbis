import type { RequestEventAction, RequestEventLoader } from "@qwik.dev/router";
import { z } from "@qwik.dev/router";
import type { CivicBadge } from "~/components/profile/CivicPassportCard";
import type { CommunityRef } from "./community";
import { routes } from "./community";
import { LOAD_FAILED, RESIDENCE_COOLDOWN_DAYS } from "./constants";
import { CONTENT_KINDS } from "./content-kinds";
import { debateCommentHref } from "./debate-comment-link";
import { participationBlockMessage } from "./db-error";
import { resolveLocale, translate } from "./i18n";
import { logFailure } from "./log";
import { many } from "./query";
import { EMPTY_QUOTA, loadQuotaSummary } from "./quota";
import { requireUser, supabase } from "./session";
import { createAdminSupabase } from "./supabase";
import { canonicalUploadPathFromPublicUrl, uploadImage } from "./uploads";
import { beforeCursor } from "./cursor";
import {
  activityCursorFilter,
  compareActivity,
  comparePublications,
  publicationCursorFilter,
  readProfilePublicationCursor,
  readProfileActivityCursor,
  readProfileCursor,
  readActivityFilter,
} from "./profile-navigation";

/**
 * Datos y acción de la página de perfil propio (`/perfil`).
 *
 * Mismo patrón que `budget-page.ts`: la ruta sólo envuelve estas funciones en
 * su `routeLoader$` y su `routeAction$` (Qwik exige exportarlos desde el
 * archivo de la ruta) y se queda con la vista. Las consultas, el armado de la
 * actividad y la subida del avatar viven acá, sin cambios de comportamiento.
 */

export interface ActivityItem {
  id: string;
  kind: "voto" | "comentario" | "apoyo" | "compromiso";
  emoji: string;
  title: string | null;
  amount: number | null;
  currency: string | null;
  href: string;
  created_at: string;
}

export const ACTIVITY_LIMIT = 25;

export const PUBLISHED_SHOWN = 20;
/** Una fila adicional por fuente alcanza para detectar la página siguiente. */
export const PUBLISHED_LIMIT = PUBLISHED_SHOWN + 1;

/** Comunidades por página; se pide una adicional para saber si hay otra. */
export const FOLLOWS_LIMIT = 25;

/**
 * Cuándo puede volver a cambiar de residencia: `RESIDENCE_COOLDOWN_DAYS`
 * después del último cambio. Sin residencia o sin cambio previo, ya puede.
 */
export function nextResidenceChangeAt(
  changedAt: string | null | undefined,
  homeCommunityId: string | null | undefined,
): Date | null {
  if (!changedAt || !homeCommunityId) return null;
  return new Date(
    new Date(changedAt).getTime() + RESIDENCE_COOLDOWN_DAYS * 86400_000,
  );
}

export async function loadProfilePage(ev: RequestEventLoader) {
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  const userId = viewer.userId;
  const locale = resolveLocale(ev.locale());
  const activityFilterKind = readActivityFilter(ev.url.searchParams);
  const requestedCursor = readProfileActivityCursor(ev.url.searchParams);
  const activityCursor =
    activityFilterKind === "all" || requestedCursor?.kind === activityFilterKind
      ? requestedCursor
      : null;
  const followsCursor = readProfileCursor(ev.url.searchParams, "seguidos");
  const publicationsCursor = readProfilePublicationCursor(ev.url.searchParams);
  const publicationFilter = (
    kind: Parameters<typeof publicationCursorFilter>[1],
  ) =>
    publicationCursorFilter(publicationsCursor, kind) ??
    `author_id.eq.${userId}`;
  const activityFilter = (
    kind: ActivityItem["kind"],
    date: string,
    id: string,
  ) =>
    activityCursorFilter(activityCursor, kind, date, id) ??
    `user_id.eq.${userId}`;

  const [
    followsRes,
    votesRes,
    commentsRes,
    supportsRes,
    pledgesRes,
    quotaSummary,
    ownPolls,
    ownDebates,
    ownClaims,
    ownProjects,
    ownResolvedClaims,
    supportedResolvedClaims,
  ] = await Promise.all([
    db
      .from("follows")
      .select(
        "created_at, community_id, communities:community_id (id, slug, name, emoji, level, path, member_count)",
        { count: followsCursor ? undefined : "exact" },
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("community_id", { ascending: false })
      .or(
        followsCursor
          ? beforeCursor(followsCursor).replaceAll("id.", "community_id.")
          : `user_id.eq.${userId}`,
      )
      .limit(FOLLOWS_LIMIT + 1),
    db
      .from("poll_participation_receipts")
      .select("participated_at, poll_id, polls:poll_id (question)", {
        count: activityCursor ? undefined : "exact",
      })
      .eq("user_id", userId)
      .order("participated_at", { ascending: false })
      .order("poll_id", { ascending: false })
      .or(activityFilter("voto", "participated_at", "poll_id"))
      .limit(ACTIVITY_LIMIT + 1),
    db
      .from("debate_comments")
      .select("id, created_at, debate_id, body, debates:debate_id (title)", {
        count: activityCursor ? undefined : "exact",
      })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .or(activityFilter("comentario", "created_at", "id"))
      .limit(ACTIVITY_LIMIT + 1),
    db
      .from("claim_supports")
      .select("created_at, claim_id, claims:claim_id (title, status)", {
        count: activityCursor ? undefined : "exact",
      })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("claim_id", { ascending: false })
      .or(activityFilter("apoyo", "created_at", "claim_id"))
      .limit(ACTIVITY_LIMIT + 1),
    db
      .from("project_pledges")
      .select(
        "id, created_at, project_id, amount, projects:project_id (title, currency)",
        { count: activityCursor ? undefined : "exact" },
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .or(activityFilter("compromiso", "created_at", "id"))
      .limit(ACTIVITY_LIMIT + 1),
    loadQuotaSummary(ev, userId),
    /**
     * Lo que publicó, que es lo que faltaba.
     *
     * El perfil listaba votos, comentarios, apoyos y compromisos —o sea, la
     * participación en lo ajeno— y no las encuestas, debates, reclamos y
     * proyectos propios. Con `/u/[id]` la ausencia quedó absurda: cualquier
     * otra persona ve tus publicaciones y vos no las veías en tu propio
     * perfil, ni tenías desde dónde volver a algo tuyo sin recordar en qué
     * comunidad lo habías dejado.
     */
    many(
      ev,
      "perfil/encuestas",
      db
        .from("polls")
        .select("id, question, created_at")
        .eq("author_id", userId)
        .neq("status", "removed")
        // Las rondas de un acuerdo (D118) no son encuestas propias.
        .is("agreement_id", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .or(publicationFilter("poll"))
        .limit(PUBLISHED_LIMIT),
    ),
    many(
      ev,
      "perfil/debates",
      db
        .from("debates")
        .select("id, title, created_at")
        .eq("author_id", userId)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .or(publicationFilter("debate"))
        .limit(PUBLISHED_LIMIT),
    ),
    many(
      ev,
      "perfil/reclamos",
      db
        .from("claims")
        .select("id, title, status, created_at")
        .eq("author_id", userId)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .or(publicationFilter("claim"))
        .limit(PUBLISHED_LIMIT),
    ),
    many(
      ev,
      "perfil/proyectos",
      db
        .from("projects")
        .select("id, title, created_at")
        .eq("author_id", userId)
        .neq("status", "removed")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .or(publicationFilter("project"))
        .limit(PUBLISHED_LIMIT),
    ),
    many(
      ev,
      "perfil/victoria-propia",
      db
        .from("claims")
        .select("id")
        .eq("author_id", userId)
        .eq("status", "resolved")
        .limit(1),
    ),
    many(
      ev,
      "perfil/victoria-apoyada",
      db
        .from("claim_supports")
        .select("claim_id, claims:claim_id!inner(status)")
        .eq("user_id", userId)
        .eq("claims.status", "resolved")
        .limit(1),
    ),
  ]);

  const results = [followsRes, votesRes, commentsRes, supportsRes, pledgesRes];
  const countResults =
    activityCursor || followsCursor
      ? await Promise.all([
          followsCursor
            ? db
                .from("follows")
                .select("community_id", { count: "exact", head: true })
                .eq("user_id", userId)
            : followsRes,
          activityCursor
            ? db
                .from("poll_participation_receipts")
                .select("poll_id", { count: "exact", head: true })
                .eq("user_id", userId)
            : votesRes,
          activityCursor
            ? db
                .from("debate_comments")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId)
            : commentsRes,
          activityCursor
            ? db
                .from("claim_supports")
                .select("claim_id", { count: "exact", head: true })
                .eq("user_id", userId)
            : supportsRes,
          activityCursor
            ? db
                .from("project_pledges")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId)
            : pledgesRes,
        ])
      : results;
  const failed = [...results, ...countResults].find((result) => result.error);
  if (failed) {
    logFailure({ scope: "perfil/actividad-seguidos", userId }, failed.error);
    throw ev.error(500, translate(locale, LOAD_FAILED));
  }
  const [followsCount, votesCount, commentsCount, supportsCount, pledgesCount] =
    countResults.map((result) => result.count ?? 0);

  const one = <T>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : ((v ?? null) as T | null);

  const activity: ActivityItem[] = [
    ...(votesRes.data ?? []).map((v) => ({
      id: v.poll_id,
      kind: "voto" as const,
      emoji: "🗳️",
      title: one<{ question: string }>(v.polls)?.question ?? null,
      amount: null,
      currency: null,
      href: routes.poll(v.poll_id),
      created_at: v.participated_at,
    })),
    ...(commentsRes.data ?? []).map((c) => ({
      id: c.id,
      kind: "comentario" as const,
      emoji: "💬",
      title: one<{ title: string }>(c.debates)?.title ?? null,
      amount: null,
      currency: null,
      href: debateCommentHref(c.debate_id, c.id),
      created_at: c.created_at,
    })),
    ...(supportsRes.data ?? []).map((s) => ({
      id: s.claim_id,
      kind: "apoyo" as const,
      emoji: "🙋",
      title: one<{ title: string }>(s.claims)?.title ?? null,
      amount: null,
      currency: null,
      href: routes.claim(s.claim_id),
      created_at: s.created_at,
    })),
    ...(pledgesRes.data ?? []).map((p) => {
      const project = one<{ title: string; currency: string }>(p.projects);
      return {
        id: p.id,
        kind: "compromiso" as const,
        emoji: "🤝",
        title: project?.title ?? null,
        amount: Number(p.amount),
        currency: project?.currency ?? "ARS",
        href: routes.project(p.project_id),
        created_at: p.created_at,
      };
    }),
  ]
    .filter(
      (item) =>
        activityFilterKind === "all" || item.kind === activityFilterKind,
    )
    .sort(compareActivity);
  const activityShown = activity.slice(0, ACTIVITY_LIMIT);
  const lastActivity = activityShown.at(-1);
  const followsShown = (followsRes.data ?? []).slice(0, FOLLOWS_LIMIT);
  const lastFollow = followsShown.at(-1);

  const publications = [
    ...ownPolls.map((row) => ({
      kind: "poll" as const,
      id: row.id,
      title: row.question,
      created_at: row.created_at,
    })),
    ...ownDebates.map((row) => ({
      kind: "debate" as const,
      id: row.id,
      title: row.title,
      created_at: row.created_at,
    })),
    ...ownClaims.map((row) => ({
      kind: "claim" as const,
      id: row.id,
      title: row.title,
      created_at: row.created_at,
    })),
    ...ownProjects.map((row) => ({
      kind: "project" as const,
      id: row.id,
      title: row.title,
      created_at: row.created_at,
    })),
  ].sort(comparePublications);
  const published = publications.slice(0, PUBLISHED_SHOWN);
  const lastPublication = published.at(-1);

  // Cuándo va a poder volver a mudarse.
  const nextChange = nextResidenceChangeAt(
    viewer.profile?.residence_changed_at,
    viewer.profile?.home_community_id,
  );

  const hasResolvedVictories =
    ownResolvedClaims.length > 0 || supportedResolvedClaims.length > 0;

  // Íconos propios (D123, D126): el emoji de cada sello lo fijaba el código,
  // no la persona. El voto y el debate usan el ícono de su tipo.
  const badges: CivicBadge[] = [
    {
      id: "victory",
      icon: "trophy",
      title: translate(locale, "Victoria Vecinal"),
      description: translate(
        locale,
        "Impulsaste o apoyaste reclamos que llegaron a una solución concreta.",
      ),
      unlocked: hasResolvedVictories,
      progressText: hasResolvedVictories
        ? translate(locale, "¡Logro cívico alcanzado!")
        : translate(locale, "Apoyá o publicá reclamos para celebrar victorias"),
    },
    {
      id: "voter",
      icon: CONTENT_KINDS.poll.icon,
      title: translate(locale, "Votante Activo"),
      description: translate(
        locale,
        "Ejerciste tu derecho democrático en consultas y encuestas.",
      ),
      unlocked: votesCount >= 1,
      progressText: translate(locale, "{{count}} votos emitidos", {
        count: votesCount,
      }),
    },
    {
      id: "debate",
      icon: CONTENT_KINDS.debate.icon,
      title: translate(locale, "Voz Barrial"),
      description: translate(
        locale,
        "Aportaste tu perspectiva constructiva en debates.",
      ),
      unlocked: commentsCount >= 1,
      progressText: translate(locale, "{{count}} aportes en debates", {
        count: commentsCount,
      }),
    },
    {
      id: "support",
      icon: "users",
      title: translate(locale, "Fuerza Vecinal"),
      description: translate(
        locale,
        "Te sumaste a problemas de otros vecinos para no dejarlos solos.",
      ),
      unlocked: supportsCount >= 1,
      progressText: translate(locale, "{{count}} reclamos apoyados", {
        count: supportsCount,
      }),
    },
    {
      id: "pledge",
      icon: "handshake",
      title: translate(locale, "Mecenas Comunitario"),
      description: translate(
        locale,
        "Respaldaste proyectos colectivos para transformar tu entorno.",
      ),
      unlocked: pledgesCount >= 1,
      progressText: translate(locale, "{{count}} proyectos respaldados", {
        count: pledgesCount,
      }),
    },
  ];

  return {
    profile: viewer.profile,
    residenceChain: viewer.residenceChain,
    following: followsShown
      .map((f) =>
        Array.isArray(f.communities) ? f.communities[0] : f.communities,
      )
      .filter((c): c is CommunityRef & { member_count: number } => !!c),
    followsPage: {
      total: followsCount,
      hasCursor: !!followsCursor,
      nextCursor:
        (followsRes.data?.length ?? 0) > FOLLOWS_LIMIT && lastFollow
          ? { created_at: lastFollow.created_at, id: lastFollow.community_id }
          : null,
    },
    activity: activityShown,
    activityFilter: activityFilterKind,
    activityPage: {
      hasCursor: !!activityCursor,
      nextCursor:
        activity.length > ACTIVITY_LIMIT && lastActivity
          ? {
              created_at: lastActivity.created_at,
              id: lastActivity.id,
              kind: lastActivity.kind,
            }
          : null,
    },
    published,
    publicationsPage: {
      hasCursor: !!publicationsCursor,
      nextCursor:
        publications.length > PUBLISHED_SHOWN && lastPublication
          ? {
              created_at: lastPublication.created_at,
              id: lastPublication.id,
              kind: lastPublication.kind,
            }
          : null,
    },
    badges,
    quotaSummary: quotaSummary ?? EMPTY_QUOTA,
    canChangeResidence: !nextChange || nextChange.getTime() <= Date.now(),
    nextChangeAt: nextChange ? nextChange.toISOString() : null,
    counts: {
      // La página está acotada; estos conteos conservan el total de cada fuente.
      votes: votesCount,
      comments: commentsCount,
      supports: supportsCount,
      pledges: pledgesCount,
    },
  };
}

export type ProfilePageData = Awaited<ReturnType<typeof loadProfilePage>>;

/** Campos del formulario de perfil (se pasa a `zod$` en la ruta). */
export const updateProfileSchema = {
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{3,20}$/,
      "Entre 3 y 20 caracteres: minúsculas, números y guión bajo.",
    ),
  display_name: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
  bio: z.string().trim().max(300, "Máximo 300 caracteres.").optional(),
  avatar: z.any().optional(),
  remove_avatar: z.enum(["si"]).optional(),
};

export type UpdateProfileInput = z.infer<
  z.ZodObject<typeof updateProfileSchema>
>;

export async function updateProfile(
  data: UpdateProfileInput,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  const removeAvatar = data.remove_avatar === "si";
  if (removeAvatar && data.avatar instanceof File && data.avatar.size > 0) {
    return ev.fail(400, {
      message: "Elegí subir una foto nueva o quitar la actual, no ambas cosas.",
    });
  }
  const admin = createAdminSupabase(ev);

  const upload = removeAvatar
    ? { url: null, path: null, error: null }
    : await uploadImage(
        admin,
        "avatars",
        viewer.userId,
        data.avatar,
        2 * 1024 * 1024,
        resolveLocale(ev.locale()),
        1024,
      );
  if (upload.error) return ev.fail(400, { message: upload.error });

  const { data: savedProfile, error } = await db
    .from("profiles")
    .update({
      username: data.username,
      display_name: data.display_name?.trim() || null,
      bio: data.bio?.trim() || null,
      ...(removeAvatar
        ? { avatar_url: null }
        : upload.url
          ? { avatar_url: upload.url }
          : {}),
    })
    .eq("id", viewer.userId)
    .select("id")
    .single();

  if (error || !savedProfile) {
    if (upload.path) {
      const { error: cleanupError } = await admin.storage
        .from("avatars")
        .remove([upload.path]);
      if (!cleanupError) {
        await admin.rpc("release_avatar_upload", {
          p_owner: viewer.userId,
          p_path: upload.path,
        });
      }
      if (cleanupError) {
        logFailure(
          { scope: "perfil/avatar-nuevo", userId: viewer.userId },
          cleanupError,
        );
      }
    }
    // Cambiar `username` o `display_name` pasa por el gate de participación
    // (`guard_profile_system_fields`, 0056): se dice el motivo real.
    const blocked = participationBlockMessage(error);
    if (blocked) return ev.fail(403, { message: blocked });
    if (error?.code === "23505") {
      const message = "Ese nombre de usuario ya está tomado.";
      return ev.fail(400, { message, fieldErrors: { username: message } });
    }
    return ev.fail(400, {
      message: "No pudimos guardar los cambios. Probá de nuevo.",
    });
  }

  if (upload.path || removeAvatar) {
    const previousPath = canonicalUploadPathFromPublicUrl(
      viewer.profile?.avatar_url,
      "avatars",
      viewer.userId,
    );
    if (previousPath && previousPath !== upload.path) {
      const { error: cleanupError } = await admin.storage
        .from("avatars")
        .remove([previousPath]);
      if (!cleanupError) {
        await admin.rpc("release_avatar_upload", {
          p_owner: viewer.userId,
          p_path: previousPath,
        });
      }
      if (cleanupError) {
        logFailure(
          { scope: "perfil/avatar-anterior", userId: viewer.userId },
          cleanupError,
        );
      }
    }
  }

  return { saved: true as const };
}
