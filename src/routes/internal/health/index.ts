import type { RequestHandler } from "@qwik.dev/router";
import { logFailure } from "~/lib/log";

const TIMEOUT_MS = 5_000;

type HealthCheck = "database" | "auth" | "storage";

async function checkSupabase(
  origin: string,
  anonKey: string,
  check: HealthCheck,
): Promise<void> {
  const path =
    check === "database"
      ? "/rest/v1/communities?select=id&limit=1"
      : check === "auth"
        ? "/auth/v1/health"
        : "/storage/v1/status";
  const response = await fetch(`${origin}${path}`, {
    // Las nuevas `sb_publishable_` van sólo en `apikey`. Enviarlas además
    // como Bearer hace que el gateway intente interpretarlas como JWT.
    headers: { apikey: anonKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${check} health returned ${response.status}`);
  }
}

export const onGet: RequestHandler = async (ev) => {
  const incidentId = crypto.randomUUID();
  const started = Date.now();
  const url = ev.env.get("PUBLIC_SUPABASE_URL");
  const anonKey = ev.env.get("PUBLIC_SUPABASE_ANON_KEY");

  ev.headers.set("Content-Type", "application/json; charset=utf-8");
  ev.headers.set("Cache-Control", "no-store");
  ev.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (!url || !anonKey) {
    logFailure(
      { scope: "health/config", incidentId },
      new Error("missing public Supabase env"),
    );
    ev.send(
      503,
      JSON.stringify({
        status: "unavailable",
        incidentId,
        durationMs: Date.now() - started,
      }),
    );
    return;
  }

  try {
    const origin = url.replace(/\/+$/, "");
    await Promise.all(
      (["database", "auth", "storage"] as const).map((check) =>
        checkSupabase(origin, anonKey, check),
      ),
    );

    ev.send(
      200,
      JSON.stringify({
        status: "ok",
        checks: { database: "ok", auth: "ok", storage: "ok" },
        durationMs: Date.now() - started,
      }),
    );
  } catch (error) {
    logFailure({ scope: "health/supabase", incidentId }, error);
    ev.send(
      503,
      JSON.stringify({
        status: "unavailable",
        incidentId,
        durationMs: Date.now() - started,
      }),
    );
  }
};
