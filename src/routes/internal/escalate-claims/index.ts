import type { RequestHandler } from "@qwik.dev/router";
import { cronAuthorized, sendJson } from "~/lib/http";
import { logEvent, logFailure } from "~/lib/log";
import { createAdminSupabase } from "~/lib/supabase";

/**
 * Escala los reclamos que llevan su ventana de respuesta vencida sin que
 * ninguna institución acuse recibo (D58). Toda la decisión vive en
 * `escalate_silent_claims()`: acá sólo se autentica el cron y se reporta.
 *
 * La función es idempotente —marca `escalated_at` y deja de verlos— así que
 * una corrida repetida por reintento no duplica nada.
 */
export const onGet: RequestHandler = async (ev) => {
  if (!(await cronAuthorized(ev))) return;

  const started = Date.now();
  const db = createAdminSupabase(ev);
  const { data, error } = await db.rpc("escalate_silent_claims");
  if (error) {
    logFailure({ scope: "cron/escalate-claims" }, error);
    sendJson(ev, 500, { error: "No pudimos escalar los reclamos vencidos" });
    return;
  }
  logEvent(
    "info",
    { scope: "cron/escalate-claims" },
    {
      escalatedClaims: data,
      durationMs: Date.now() - started,
    },
  );
  sendJson(ev, 200, {
    escalatedClaims: data,
    ranAt: new Date().toISOString(),
  });
};
