import { logFailure } from "./log";
import type { DB } from "./supabase";

/** Los únicos campos que una pantalla pública puede mostrar de otra persona. */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function isPublicUsername(value: string): boolean {
  return /^[a-z0-9_]{3,20}$/i.test(value);
}

/** Sólo usa la identidad que el consumidor ya recibió por una lectura pública. */
export function publicProfileHref(
  profile: Pick<PublicProfile, "id" | "username">,
): string {
  const identifier = isPublicUsername(profile.username)
    ? profile.username.toLowerCase()
    : profile.id;
  return `/u/${encodeURIComponent(identifier)}`;
}

/** La resolución de aliases nunca requiere consultar la tabla privada profiles. */
export async function loadPublicProfileByUsername(
  db: DB,
  username: string,
): Promise<PublicProfile | null> {
  if (!isPublicUsername(username)) return null;
  const { data, error } = await db.rpc("public_profile_by_username", {
    p_username: username.toLowerCase(),
  });
  if (error) logFailure({ scope: "perfil-publico/alias" }, error);
  return data?.[0] ?? null;
}

/**
 * El perfil de quien firma una publicación.
 *
 * `null` lo interpretan las vistas como "Cuenta eliminada". Descartar el
 * `error` hacía que un fallo de la consulta —o un permiso mal puesto— firmara
 * reclamos y proyectos de gente real con ese cartel: una afirmación sobre una
 * persona, no un dato faltante. Degrada igual, porque una página sin nombre de
 * autor sigue siendo útil, pero el fallo deja de perderse.
 */
export async function loadPublicProfile(
  db: DB,
  userId: string | null,
): Promise<PublicProfile | null> {
  if (!userId) return null;
  const { data, error } = await db.rpc("public_profile", { p_user: userId });
  if (error) logFailure({ scope: "perfil-publico/uno", userId }, error);
  return data?.[0] ?? null;
}

export async function loadPublicProfiles(
  db: DB,
  userIds: string[],
): Promise<Map<string, PublicProfile>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await db.rpc("public_profiles", {
    p_users: uniqueIds,
  });
  // Lo mismo en lote: sin esto, una lista entera de comentarios podía quedar
  // firmada por "Cuenta eliminada".
  if (error)
    logFailure(
      { scope: "perfil-publico/lote", count: uniqueIds.length },
      error,
    );
  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}
