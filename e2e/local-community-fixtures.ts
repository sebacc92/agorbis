import { execFileSync } from "node:child_process";

export function localCommunityFixture(sql: string) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (
    !url ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).port !== "54821"
  )
    throw new Error(
      "Esta prueba sólo puede escribir en Supabase local de Agorbis.",
    );
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_agorbis",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}
