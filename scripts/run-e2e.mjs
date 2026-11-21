import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseBin = path.join(root, "node_modules", ".bin", "supabase");

function localSupabaseEnvironment() {
  let output;
  try {
    output = execFileSync(supabaseBin, ["status", "-o", "env"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Supabase local no está disponible. Ejecutá `pnpm exec supabase start` antes de los E2E.",
    );
  }

  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|(.*))$/);
    if (match) values.set(match[1], match[2] ?? match[3] ?? "");
  }

  for (const required of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
    if (!values.get(required)) {
      throw new Error(`Supabase local no informó ${required}.`);
    }
  }

  const mailpitUrl = values.get("MAILPIT_URL") ?? values.get("INBUCKET_URL");
  if (!mailpitUrl) {
    throw new Error("Supabase local no informó MAILPIT_URL/INBUCKET_URL.");
  }

  return {
    PUBLIC_SUPABASE_URL: values.get("API_URL"),
    PUBLIC_SUPABASE_ANON_KEY: values.get("PUBLISHABLE_KEY"),
    SUPABASE_SECRET_KEY: values.get("SECRET_KEY"),
    MAILPIT_URL: mailpitUrl,
  };
}

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const env = {
  ...process.env,
  ...localSupabaseEnvironment(),
  PUBLIC_SITE_URL: baseUrl,
  CRON_SECRET: process.env.CRON_SECRET ?? "agorbis-e2e-cron-secret",
  // Claves dummy oficiales. Se fijan después de process.env para que una suite
  // local jamás envíe tokens a un widget o secret reales por accidente.
  PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  TURNSTILE_HOSTNAMES: new URL(baseUrl).hostname,
  TURNSTILE_TESTING: "true",
};

const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", ...process.argv.slice(2)],
  {
    cwd: root,
    env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
