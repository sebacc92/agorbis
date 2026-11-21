import type { RequestHandler } from "@qwik.dev/router";
import {
  getAccountDeletionJobStats,
  processAccountDeletionJobs,
  sweepOrphanAccountMedia,
} from "~/lib/account-deletion";
import { cronAuthorized, sendJson } from "~/lib/http";
import { logEvent, logFailure } from "~/lib/log";
import { requestIdOf } from "~/lib/request-id";
import { createAdminSupabase } from "~/lib/supabase";

/** Reintenta bajas cuyo Auth ya desapareció pero cuya limpieza quedó pendiente. */
export const onGet: RequestHandler = async (ev) => {
  if (!(await cronAuthorized(ev))) return;

  const started = Date.now();
  const admin = createAdminSupabase(ev);
  const result = await processAccountDeletionJobs(admin, {
    limit: 25,
  });
  if (result.error) {
    logFailure(
      { scope: "cron/account-deletions", requestId: requestIdOf(ev) },
      result.error,
    );
    sendJson(ev, 500, { error: "No pudimos procesar las bajas pendientes" });
    return;
  }

  const [orphanSweep, jobStats] = await Promise.all([
    sweepOrphanAccountMedia(admin, { limit: 100 }),
    getAccountDeletionJobStats(admin),
  ]);
  const followupError = orphanSweep.error ?? jobStats.error;
  if (followupError || !jobStats.stats) {
    logFailure(
      { scope: "cron/account-deletions", requestId: requestIdOf(ev) },
      followupError ?? new Error("No se pudieron leer métricas de la outbox"),
    );
    sendJson(ev, 500, {
      error: "No pudimos verificar la limpieza de las bajas",
    });
    return;
  }

  const unhealthy =
    result.failed > 0 ||
    jobStats.stats.deadLetter > 0 ||
    jobStats.stats.staleActiveAccounts > 0 ||
    jobStats.stats.staleLeases > 0;
  const level = unhealthy ? "warn" : "info";
  logEvent(
    level,
    { scope: "cron/account-deletions", requestId: requestIdOf(ev) },
    {
      ...result,
      orphanSweep,
      jobStats: jobStats.stats,
      durationMs: Date.now() - started,
    },
  );
  sendJson(ev, unhealthy ? 503 : 200, {
    ok: !unhealthy,
    claimed: result.claimed,
    completed: result.completed,
    failed: result.failed,
    orphanSweep: {
      claimsRemoved: orphanSweep.claimsRemoved,
      avatarsRemoved: orphanSweep.avatarsRemoved,
    },
    jobs: jobStats.stats,
    ranAt: new Date().toISOString(),
  });
};
