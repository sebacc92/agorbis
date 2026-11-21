import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { getManagedDataProfile } from "./supabase-managed-data-policy.mjs";

export const PRODUCTION_PROJECT_REF = "ibtvlvpxwourrxwcrfkf";
export const PRODUCTION_SUPABASE_URL =
  "https://ibtvlvpxwourrxwcrfkf.supabase.co";

export function parseProductionBackupArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--") continue;
    if (current === "--output-dir") options.outputDir = argv[++index];
    else if (current === "--secret-env-file") {
      options.secretEnvFile = argv[++index];
    } else if (current === "--managed-profile") {
      if (options.managedProfile !== undefined) {
        throw new Error("--managed-profile no admite valores repetidos.");
      }
      const profileId = argv[++index];
      if (!profileId || profileId.startsWith("--")) {
        throw new Error("Falta un identificador para --managed-profile.");
      }
      options.managedProfile = getManagedDataProfile(profileId).id;
    } else {
      throw new Error(`Argumento desconocido: ${String(current)}.`);
    }
  }
  if (
    typeof options.outputDir !== "string" ||
    options.outputDir.length === 0 ||
    /[\r\n\0]/.test(options.outputDir)
  ) {
    throw new Error("Falta --output-dir con una ruta nueva y segura.");
  }
  if (!path.isAbsolute(options.outputDir)) {
    throw new Error("--output-dir debe ser una ruta absoluta.");
  }
  if (
    options.secretEnvFile !== undefined &&
    (typeof options.secretEnvFile !== "string" ||
      options.secretEnvFile.length === 0 ||
      /[\r\n\0]/.test(options.secretEnvFile))
  ) {
    throw new Error("--secret-env-file es inválido.");
  }
  return options;
}

export function readProductionBackupSecret(secretEnvFile) {
  const absolute = path.resolve(secretEnvFile);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("El archivo de secretos debe ser regular y no un symlink.");
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      "El archivo de secretos debe tener permisos 600 o menores.",
    );
  }
  const parsed = parseEnv(readFileSync(absolute, "utf8"));
  if (Object.hasOwn(parsed, "SUPABASE_DB_PASSWORD")) {
    throw new Error(
      "SUPABASE_DB_PASSWORD está prohibida en archivos; se ingresa por TTY.",
    );
  }
  const secretKey = parsed.SUPABASE_SECRET_KEY;
  if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secretKey ?? "")) {
    throw new Error(
      "El archivo no contiene una SUPABASE_SECRET_KEY moderna válida.",
    );
  }
  return secretKey;
}

export function buildProductionBackupChildEnvironment(
  sourceEnv,
  secretKey,
  databasePassword,
) {
  if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secretKey ?? "")) {
    throw new Error("SUPABASE_SECRET_KEY de backup inválida.");
  }
  if (
    typeof databasePassword !== "string" ||
    databasePassword.length < 8 ||
    /[\r\n\0]/.test(databasePassword)
  ) {
    throw new Error("La contraseña de DB ingresada es inválida.");
  }
  const env = { LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };
  for (const name of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "TMPDIR",
    "DOCKER_HOST",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "SUPABASE_ACCESS_TOKEN",
  ]) {
    if (sourceEnv[name]) env[name] = sourceEnv[name];
  }
  env.AGORBIS_BACKUP_SUPABASE_URL = PRODUCTION_SUPABASE_URL;
  env.AGORBIS_BACKUP_SUPABASE_SECRET_KEY = secretKey;
  env.SUPABASE_DB_PASSWORD = databasePassword;
  env.SUPABASE_NO_UPDATE_NOTIFIER = "1";
  return env;
}
