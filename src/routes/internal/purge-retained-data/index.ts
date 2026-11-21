import type { RequestHandler } from "@qwik.dev/router";
import { cronAuthorized, sendJson } from "~/lib/http";
import { logEvent, logFailure } from "~/lib/log";
import { requestIdOf } from "~/lib/request-id";
import { createAdminSupabase } from "~/lib/supabase";

/**
 * Aplica las ventanas de retención definidas en PostgreSQL. La respuesta no
 * revela nombres de tablas ni cantidades; ese detalle queda en logs internos.
 */
export const onGet: RequestHandler = async (ev) => {
  if (!(await cronAuthorized(ev))) return;

  const started = Date.now();
  const admin = createAdminSupabase(ev);
  const { data, error } = await admin.rpc("purge_expired_operational_data");
  if (error) {
    logFailure(
      { scope: "cron/purge-retained-data", requestId: requestIdOf(ev) },
      error,
    );
    sendJson(ev, 500, { error: "No pudimos completar la retención" });
    return;
  }

  const [oauth, transferConsents] = await Promise.all([
    admin.rpc("purge_abandoned_oauth_accounts"),
    admin.rpc("purge_expired_transfer_consents"),
  ]);
  const followUpError = oauth.error ?? transferConsents.error;
  if (followUpError) {
    logFailure(
      {
        scope: "cron/purge-retained-data",
        requestId: requestIdOf(ev),
        stage: oauth.error ? "abandoned-oauth" : "transfer-consents",
      },
      followUpError,
    );
    sendJson(ev, 500, { error: "No pudimos completar la retención" });
    return;
  }

  logEvent(
    "info",
    { scope: "cron/purge-retained-data", requestId: requestIdOf(ev) },
    {
      purged: data,
      abandonedOAuth: oauth.data,
      transferConsents: transferConsents.data,
      durationMs: Date.now() - started,
    },
  );
  sendJson(ev, 200, { ok: true, ranAt: new Date().toISOString() });
};
