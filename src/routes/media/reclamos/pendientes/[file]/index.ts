import type { RequestHandler } from "@qwik.dev/router";
import { claimImageNotFound, sendClaimImage } from "~/lib/claim-media-response";
import { claimDraftMediaUrl } from "~/lib/claim-media";
import { createAdminSupabase, createServerSupabase } from "~/lib/supabase";

/** Preview privada: exige sesión y ownership del tracking todavía pendiente. */
const serve: RequestHandler = async (ev) => {
  if (claimDraftMediaUrl(`pending/${ev.params.file}`) === null) {
    claimImageNotFound(ev);
    return;
  }

  const session = createServerSupabase(ev);
  const { data: auth, error: authError } = await session.auth.getUser();
  if (authError || !auth.user) {
    claimImageNotFound(ev);
    return;
  }

  const admin = createAdminSupabase(ev);
  const { data: upload, error } = await admin
    .from("claim_uploads")
    .select("path")
    .eq("owner_id", auth.user.id)
    .is("claim_id", null)
    .is("cleanup_started_at", null)
    .like("path", `%/${ev.params.file}`)
    .maybeSingle();
  if (error || !upload) {
    claimImageNotFound(ev);
    return;
  }

  await sendClaimImage(ev, admin, upload.path, "private, no-store");
};

export const onGet = serve;
export const onHead = serve;
