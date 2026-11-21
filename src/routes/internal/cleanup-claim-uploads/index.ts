import type { RequestHandler } from "@qwik.dev/router";
import { cronAuthorized, sendJson } from "~/lib/http";
import { logEvent, logFailure } from "~/lib/log";
import { createAdminSupabase } from "~/lib/supabase";

const MAX_UPLOAD_AGE_HOURS = 24;
const BATCH_SIZE = 100;
const MAX_BATCHES = 10;
const MAX_RUNTIME_MS = 20_000;

/**
 * Borra adjuntos que se subieron para la vista previa de un reclamo pero nunca
 * llegaron a publicarse. Un Cron Trigger lo llama una vez por día en
 * producción. La ruta exige CRON_SECRET: no es una API pública ni de usuario.
 */
export const onGet: RequestHandler = async (ev) => {
  if (!(await cronAuthorized(ev))) return;

  const db = createAdminSupabase(ev);
  const cutoff = new Date(
    Date.now() - MAX_UPLOAD_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const started = Date.now();
  let deleted = 0;
  let batches = 0;

  while (batches < MAX_BATCHES && Date.now() - started < MAX_RUNTIME_MS) {
    // La RPC toma locks, marca un tombstone y recién entonces devuelve paths.
    // Una publicación concurrente o gana el lock y adjunta, o ve el tombstone
    // y falla sin referenciar un objeto que este cron está por borrar.
    const { data: pending, error: pendingError } = await db.rpc(
      "begin_claim_upload_cleanup",
      { p_cutoff: cutoff, p_limit: BATCH_SIZE },
    );

    if (pendingError) {
      logFailure(
        { scope: "cron/cleanup-uploads/buscar", deleted, batches },
        pendingError,
      );
      sendJson(ev, 500, {
        error: "No pudimos buscar adjuntos pendientes",
        deleted,
      });
      return;
    }
    if (!pending?.length) break;

    const { error: storageError } = await db.storage
      .from("claims")
      .remove(pending.map((upload) => upload.path));
    if (storageError) {
      logFailure(
        { scope: "cron/cleanup-uploads/borrar", deleted, batches },
        storageError,
      );
      sendJson(ev, 500, {
        error: "No pudimos borrar los archivos pendientes",
        deleted,
      });
      return;
    }

    const { data: finished, error: deleteError } = await db.rpc(
      "finish_claim_upload_cleanup",
      { p_ids: pending.map((upload) => upload.id) },
    );
    if (deleteError || finished !== pending.length) {
      logFailure(
        { scope: "cron/cleanup-uploads/registro", deleted, batches },
        deleteError ??
          new Error("cleanup incompleto después de borrar Storage"),
      );
      sendJson(ev, 500, {
        error: "Los archivos se borraron, pero no pudimos limpiar el registro",
        deleted,
      });
      return;
    }

    deleted += finished;
    batches += 1;
    if (pending.length < BATCH_SIZE) break;
  }

  const { count: backlog, error: backlogError } = await db
    .from("claim_uploads")
    .select("id", { count: "exact", head: true })
    .is("claim_id", null)
    .lt("created_at", cutoff);
  if (backlogError)
    logFailure({ scope: "cron/cleanup-uploads/backlog" }, backlogError);

  const remaining = backlog ?? null;
  const level = remaining && remaining > 0 ? "warn" : "info";
  logEvent(
    level,
    { scope: "cron/cleanup-uploads" },
    {
      deleted,
      batches,
      backlog: remaining,
      durationMs: Date.now() - started,
    },
  );
  sendJson(ev, 200, {
    deleted,
    batches,
    backlog: remaining,
    truncated: remaining === null || remaining > 0,
    ranAt: new Date().toISOString(),
  });
};
