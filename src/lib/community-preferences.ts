import type { RequestEventAction } from "@qwik.dev/router";
import { isRlsViolation, participationBlockMessage } from "./db-error";
import { requireUser, supabase } from "./session";
import type { DB } from "./supabase";

export async function setCommunityFollowing(
  data: { community_id: string; following: "true" | "false" },
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  const following = data.following === "true";
  const { error } = following
    ? await db
        .from("follows")
        .delete()
        .eq("user_id", viewer.userId)
        .eq("community_id", data.community_id)
    : await db
        .from("follows")
        .insert({ user_id: viewer.userId, community_id: data.community_id });

  // 23505 al seguir significa que otra pestaña ya confirmó el mismo estado.
  if (error && (following || error.code !== "23505")) {
    const blocked = participationBlockMessage(error);
    return ev.fail(blocked ? 403 : 400, {
      message:
        blocked ??
        (following
          ? "No pudimos dejar de seguir esta comunidad. Probá de nuevo."
          : "No pudimos guardar el cambio. Probá de nuevo."),
      // Es el último estado que mostró el formulario, no una escritura nueva.
      following,
      communityId: data.community_id,
    });
  }
  return { following: !following, communityId: data.community_id };
}

/** Un fallo no permite deducir que la persona aparece públicamente. */
export async function readMyCommunityVisibility(
  db: Pick<DB, "rpc">,
  userId: string | null,
  communityId: string,
  canToggle: boolean,
): Promise<boolean | null> {
  if (!userId || !canToggle) return null;
  const { data, error } = await db.rpc("my_community_visibility", {
    p_user: userId,
    p_community: communityId,
  });
  return !error && typeof data === "boolean" ? data : null;
}

export async function setCommunityVisibility(
  data: { community_id: string; is_anonymous: "true" | "false" },
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { error } = await supabase(ev).rpc("set_community_visibility", {
    p_community: data.community_id,
    p_is_anonymous: data.is_anonymous === "true",
  });
  if (error) {
    const blocked = participationBlockMessage(error);
    return ev.fail(blocked ? 403 : 400, {
      message:
        blocked ??
        (isRlsViolation(error)
          ? "Sólo podés configurar tu visibilidad en comunidades donde vivís."
          : "No pudimos guardar tu preferencia. Probá de nuevo."),
      // La operación es un cambio al estado opuesto. Si falla se conserva el
      // estado conocido que originó ese intento, incluso tras otro éxito.
      isAnonymous: data.is_anonymous !== "true",
      communityId: data.community_id,
    });
  }
  return {
    isAnonymous: data.is_anonymous === "true",
    communityId: data.community_id,
  };
}
