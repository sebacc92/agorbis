import { closeSync, openSync, readSync, writeSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildProductionBackupChildEnvironment,
  parseProductionBackupArguments,
  PRODUCTION_PROJECT_REF,
  readProductionBackupSecret,
} from "./production-backup-runner-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.umask(0o077);

function setTtyEcho(enabled) {
  const result = spawnSync(
    "stty",
    ["-F", "/dev/tty", enabled ? "echo" : "-echo"],
    { stdio: "ignore" },
  );
  if (result.status !== 0) {
    throw new Error("No se pudo controlar el eco de /dev/tty.");
  }
}

function readDatabasePassword() {
  let tty;
  try {
    tty = openSync("/dev/tty", "r+");
  } catch {
    throw new Error(
      "El runner requiere una terminal interactiva; no acepta la contraseña por pipe ni argv.",
    );
  }
  const bytes = [];
  const byte = Buffer.alloc(1);
  let echoDisabled = false;
  try {
    writeSync(tty, "Contraseña DB de Supabase Producción (entrada oculta): ");
    setTtyEcho(false);
    echoDisabled = true;
    while (bytes.length <= 1024) {
      if (readSync(tty, byte, 0, 1, null) !== 1) {
        throw new Error("La terminal se cerró antes de recibir la contraseña.");
      }
      if (byte[0] === 3) throw new Error("Ingreso cancelado.");
      if (byte[0] === 10 || byte[0] === 13) break;
      if (byte[0] === 8 || byte[0] === 127) bytes.pop();
      else bytes.push(byte[0]);
    }
    if (bytes.length > 1024) {
      throw new Error("La contraseña excede el máximo permitido.");
    }
    return Buffer.from(bytes).toString("utf8");
  } finally {
    byte.fill(0);
    bytes.fill(0);
    if (echoDisabled) {
      setTtyEcho(true);
      writeSync(tty, "\n");
    }
    closeSync(tty);
  }
}

function main() {
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error(`El runner exige Node 22.x; actual ${process.version}.`);
  }
  if (Object.hasOwn(process.env, "SUPABASE_DB_PASSWORD")) {
    throw new Error(
      "Retirá SUPABASE_DB_PASSWORD del entorno: este runner sólo la acepta por TTY oculto.",
    );
  }
  const options = parseProductionBackupArguments(process.argv.slice(2));
  const secretEnvFile = path.resolve(
    options.secretEnvFile ?? path.join(root, ".env.local"),
  );
  const secretKey = readProductionBackupSecret(secretEnvFile);
  let databasePassword = readDatabasePassword();
  try {
    const env = buildProductionBackupChildEnvironment(
      process.env,
      secretKey,
      databasePassword,
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts", "supabase-backup.mjs"),
        "--project-ref",
        PRODUCTION_PROJECT_REF,
        "--output-dir",
        options.outputDir,
        ...(options.managedProfile
          ? ["--managed-profile", options.managedProfile]
          : []),
      ],
      { cwd: root, env, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `El backup de Producción terminó con exit ${String(result.status)}.`,
      );
    }
  } finally {
    databasePassword = "";
  }
}

try {
  main();
} catch (error) {
  console.error(`Runner de backup: BLOQUEADO — ${error.message}`);
  process.exitCode = 1;
}
