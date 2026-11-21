import type { RequestHandler } from "@qwik.dev/router";
import {
  claimImageNotFound,
  sendAvatarImage,
} from "~/lib/claim-media-response";
import { createAdminSupabase } from "~/lib/supabase";
import { isCanonicalUploadPath } from "~/lib/uploads";

/**
 * El bucket de avatares es privado. Sólo se sirve el objeto que el perfil
 * público referencia en este momento; un borrador, reemplazo o huérfano no es
 * una URL pública aunque alguien conozca su UUID.
 */
const serve: RequestHandler = async (ev) => {
  const path = `${ev.params.userId}/${ev.params.file}`;
  const publicUrl = `/media/avatares/${path}`;
  if (!isCanonicalUploadPath(path, ev.params.userId)) {
    claimImageNotFound(ev);
    return;
  }

  const admin = createAdminSupabase(ev);
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .eq("id", ev.params.userId)
    .eq("avatar_url", publicUrl)
    .maybeSingle();
  if (error || !profile) {
    claimImageNotFound(ev);
    return;
  }

  await sendAvatarImage(ev, admin, path);
};

export const onGet = serve;
export const onHead = serve;
