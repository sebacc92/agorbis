import type { RequestEventBase } from "@qwik.dev/router";
import type { ContentType } from "./database.types.helpers";
import { logFailure } from "./log";
import { createAnonymousSupabase } from "./supabase";

export interface RecentActivityItem {
  kind: ContentType;
  id: string;
  title: string;
  createdAt: string;
  community: { name: string; slug: string; emoji: string | null } | null;
}

/** Lo que entra en la portada: pocas filas, las más recientes. */
export const RECENT_ACTIVITY_LIMIT = 6;

type Row = {
  id: string;
  title: string;
  created_at: string;
  community: { name: string; slug: string; emoji: string | null } | null;
};

/**
 * Mezcla las últimas publicaciones de cada tipo y deja las más recientes.
 *
 * Cada tipo trae como máximo el límite final, así que el resultado es exacto
 * sin leer de más. Una lectura fallida llega como `null` y se omite: el
 * bloque muestra lo que se pudo leer y, si no hay nada, no se muestra.
 */
export function mergeRecentActivity(
  byKind: Partial<Record<ContentType, Row[] | null>>,
  limit = RECENT_ACTIVITY_LIMIT,
): RecentActivityItem[] {
  return (Object.entries(byKind) as [ContentType, Row[] | null][])
    .flatMap(([kind, rows]) =>
      (rows ?? []).map((row) => ({
        kind,
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        community: row.community,
      })),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    )
    .slice(0, limit);
}

/**
 * Últimas publicaciones públicas de todas las comunidades, para la portada.
 *
 * Usa el cliente anónimo: la portada se muestra a quien no ingresó y nunca
 * debe incluir algo que sólo vería una sesión (CLAUDE.md, invariante 10).
 * Lo retirado se excluye como en los listados de cada comunidad.
 */
export async function loadRecentActivity(
  ev: RequestEventBase,
): Promise<RecentActivityItem[]> {
  const db = createAnonymousSupabase(ev);
  const limit = RECENT_ACTIVITY_LIMIT;
  const [polls, debates, claims, projects] = await Promise.all([
    db
      .from("polls")
      .select(
        "id, title:question, created_at, community:communities!polls_community_id_fkey(name, slug, emoji)",
      )
      .neq("status", "removed")
      // Las rondas de un acuerdo (D118) se muestran como acuerdo, no como encuesta.
      .is("agreement_id", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
    db
      .from("debates")
      .select(
        "id, title, created_at, community:communities!debates_community_id_fkey(name, slug, emoji)",
      )
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
    db
      .from("claims")
      .select(
        "id, title, created_at, community:communities!claims_community_id_fkey(name, slug, emoji)",
      )
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
    db
      .from("projects")
      .select(
        "id, title, created_at, community:communities!projects_community_id_fkey(name, slug, emoji)",
      )
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit),
  ]);

  const rows = (
    scope: string,
    result: { data: Row[] | null; error: unknown },
  ): Row[] | null => {
    if (!result.error) return result.data ?? [];
    logFailure({ scope: `portada/actividad/${scope}` }, result.error);
    return null;
  };

  return mergeRecentActivity({
    poll: rows("encuestas", polls),
    debate: rows("debates", debates),
    claim: rows("reclamos", claims),
    project: rows("proyectos", projects),
  });
}
