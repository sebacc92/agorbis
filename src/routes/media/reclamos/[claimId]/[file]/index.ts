import type { RequestHandler } from "@qwik.dev/router";
import { claimImageNotFound, sendClaimImage } from "~/lib/claim-media-response";
import { claimPublishedMediaUrl } from "~/lib/claim-media";
import { createAdminSupabase } from "~/lib/supabase";

/**
 * Evidencia deliberadamente pública, pero sólo después de quedar ligada a un
 * reclamo visible. El bucket permanece privado y el path físico nunca sale.
 */
const serve: RequestHandler = async (ev) => {
  const publicPath = claimPublishedMediaUrl(
    ev.params.claimId,
    ev.params.file,
  )?.replace("/media/reclamos/", "");
  if (!publicPath) {
    claimImageNotFound(ev);
    return;
  }

  const admin = createAdminSupabase(ev);
  const [
    { data: claim, error: claimError },
    { data: upload, error: uploadError },
  ] = await Promise.all([
    admin
      .from("claims")
      .select("id")
      .eq("id", ev.params.claimId)
      .neq("status", "removed")
      .maybeSingle(),
    admin
      .from("claim_uploads")
      .select("path")
      .eq("claim_id", ev.params.claimId)
      .eq("public_path", publicPath)
      .maybeSingle(),
  ]);

  if (claimError || uploadError || !claim || !upload) {
    claimImageNotFound(ev);
    return;
  }

  // Cache corto: la evidencia es inmutable, pero una moderación que quite el
  // reclamo debe revocar su acceso sin quedar un año retenida en un CDN.
  await sendClaimImage(
    ev,
    admin,
    upload.path,
    "public, max-age=300, s-maxage=300, no-transform",
  );
};

export const onGet = serve;
export const onHead = serve;
