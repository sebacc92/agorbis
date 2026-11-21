import type { RequestHandler } from "@qwik.dev/router";
import { cronAuthorized, sendJson } from "~/lib/http";
import { logEvent, logFailure } from "~/lib/log";
import { createAdminSupabase } from "~/lib/supabase";

/**
 * Cierra encuestas vencidas. El trigger de `polls.status` crea una notificación
 * para el autor y para cada persona que votó, con deduplicación en PostgreSQL.
 */
export const onGet: RequestHandler = async (ev) => {
  if (!(await cronAuthorized(ev))) return;

  const started = Date.now();
  const db = createAdminSupabase(ev);
  const { data, error } = await db.rpc("sync_due_poll_notifications");
  if (error) {
    logFailure({ scope: "cron/sync-notifications" }, error);
    sendJson(ev, 500, { error: "No pudimos sincronizar los cierres" });
    return;
  }
  logEvent(
    "info",
    { scope: "cron/sync-notifications" },
    {
      closedPolls: data,
      durationMs: Date.now() - started,
    },
  );
  sendJson(ev, 200, { closedPolls: data, ranAt: new Date().toISOString() });
};
