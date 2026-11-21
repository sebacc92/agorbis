#!/usr/bin/env node

import { openSync, closeSync, readSync, writeSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  OPEN_RELEASE_SECRET_NAMES,
  assertOpenReleaseNode,
  executeOpenReleaseDryRun,
  prepareOpenReleaseEnvironment,
} from "./open-release-runner-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTE_FLAG = "--execute-dry-run";

function readHiddenLine(tty, name) {
  writeSync(tty, `${name}: `);
  const disabled = spawnSync("stty", ["-F", "/dev/tty", "-echo"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  if (disabled.status !== 0)
    throw new Error("No se pudo desactivar el eco de /dev/tty.");
  const bytes = [];
  const byte = Buffer.alloc(1);
  try {
    while (bytes.length <= 8192) {
      const count = readSync(tty, byte, 0, 1, null);
      if (count !== 1 || byte[0] === 10 || byte[0] === 13) break;
      bytes.push(byte[0]);
    }
  } finally {
    byte.fill(0);
    spawnSync("stty", ["-F", "/dev/tty", "echo"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    writeSync(tty, "\n");
  }
  if (bytes.length > 8192)
    throw new Error(`${name} excede el máximo permitido.`);
  const buffer = Buffer.from(bytes);
  const value = buffer.toString("utf8");
  buffer.fill(0);
  bytes.fill(0);
  return value;
}

function readSecretsFromTty() {
  let tty;
  try {
    tty = openSync("/dev/tty", "r+");
  } catch {
    throw new Error(
      "El modo de ejecución requiere una terminal interactiva /dev/tty.",
    );
  }
  try {
    return Object.fromEntries(
      OPEN_RELEASE_SECRET_NAMES.map((name) => [
        name,
        readHiddenLine(tty, name),
      ]),
    );
  } finally {
    closeSync(tty);
  }
}

try {
  assertOpenReleaseNode();
  if (
    process.argv.length > 3 ||
    (process.argv[2] && process.argv[2] !== EXECUTE_FLAG)
  ) {
    throw new Error(`Uso: node scripts/run-open-release.mjs [${EXECUTE_FLAG}]`);
  }
  // Este gate ocurre deliberadamente antes de abrir /dev/tty o crear procesos.
  const environment = prepareOpenReleaseEnvironment();
  if (process.argv[2] !== EXECUTE_FLAG) {
    console.log(
      "Release abierto: configuración versionada lista; no se solicitaron secretos ni se ejecutaron comandos.",
    );
  } else {
    const secrets = readSecretsFromTty();
    try {
      process.exitCode = executeOpenReleaseDryRun({
        root,
        nonSecretEnvironment: environment,
        secrets,
      });
    } finally {
      for (const name of OPEN_RELEASE_SECRET_NAMES) secrets[name] = "";
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
