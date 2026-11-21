#!/usr/bin/env node
// D107: `pnpm deploy:open` abre Producción en un solo comando. El responsable
// acepta los riesgos una vez por /dev/tty: así ningún proceso sin terminal
// (un agente, la CI) puede abrir en su nombre.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertOpenReleaseNode,
  prepareExceptionalOpenReleaseEnvironment,
  prepareExceptionalWranglerKeyringTransportEnvironment,
} from "./open-release-runner-policy.mjs";
import { OWNER_WAIVER_CANDIDATE_GATE_IDS } from "./release-gate-policy.mjs";
import {
  SIMPLE_OPEN_RELEASE_CONFIRMATION,
  SIMPLE_OPEN_RELEASE_MANUAL_CHECKS,
  buildSimpleOpenReleaseRequest,
  parseSimpleOpenReleaseArguments,
  simpleOpenReleaseGitErrors,
  simpleOpenReleaseRequestPath,
  simpleOpenReleaseRiskSummary,
  simpleOpenReleaseSteps,
} from "./simple-open-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function readTtyLine(prompt) {
  const descriptor = openSync("/dev/tty", "r+");
  try {
    writeSync(descriptor, prompt);
    const byte = Buffer.alloc(1);
    let line = "";
    while (line.length < 64) {
      if (readSync(descriptor, byte, 0, 1, null) !== 1) break;
      if (byte[0] === 10 || byte[0] === 13) break;
      line += String.fromCharCode(byte[0]);
    }
    return line.trim();
  } finally {
    closeSync(descriptor);
  }
}

function main() {
  const { dryRun } = parseSimpleOpenReleaseArguments(process.argv.slice(2));
  assertOpenReleaseNode();

  const head = git(["rev-parse", "HEAD"]);
  const gitErrors = simpleOpenReleaseGitErrors({
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    head,
    originHead: git(["rev-parse", "origin/main"]),
    porcelain: git(["status", "--porcelain"]),
    requireOrigin: !dryRun,
  });
  if (gitErrors.length > 0) {
    console.error("Salida a Producción: BLOQUEADA");
    for (const error of gitErrors) console.error(`  ✗ ${error}`);
    return 1;
  }

  const now = new Date();
  const rendered = buildSimpleOpenReleaseRequest({ head, now });
  console.log(
    `${dryRun ? "Prueba (sin subir)" : "Apertura de Producción"} sobre ${head}.`,
  );
  console.log("Riesgos que quedan aceptados a tu nombre:");
  for (const line of simpleOpenReleaseRiskSummary()) console.log(line);
  if (!dryRun) {
    const answer = readTtyLine(
      `\nEscribí ${SIMPLE_OPEN_RELEASE_CONFIRMATION} para aceptarlos y abrir: `,
    );
    if (answer !== SIMPLE_OPEN_RELEASE_CONFIRMATION) {
      console.error("Sin aceptación: no se despliega nada.");
      return 1;
    }
  }

  const requestPath = simpleOpenReleaseRequestPath({ home: homedir(), now });
  mkdirSync(path.dirname(requestPath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(requestPath), 0o700);
  writeFileSync(requestPath, rendered, { mode: 0o600, flag: "wx" });
  console.log(`Constancia del request: ${requestPath}`);

  const environment = {
    ...prepareExceptionalOpenReleaseEnvironment({
      acceptedRiskGateIds: OWNER_WAIVER_CANDIDATE_GATE_IDS,
    }),
    ...prepareExceptionalWranglerKeyringTransportEnvironment(),
    CLOUDFLARE_AUTH_USE_KEYRING: "true",
  };
  for (const step of simpleOpenReleaseSteps({
    root,
    requestPath,
    dryRun,
    nodeExecutable: process.execPath,
  })) {
    console.log(`\n→ ${step.label}`);
    const result = spawnSync(step.command, step.arguments, {
      cwd: root,
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    if (result.error || result.signal || result.status !== 0) {
      console.error(`\n✗ Falló: ${step.label}.`);
      if (!dryRun && step.label.startsWith("smoke")) {
        console.error(
          "El sitio ya está abierto. Si el smoke no pasa al repetirlo, volvé a CLOSED con: pnpm deploy:closed",
        );
      }
      return 1;
    }
  }

  if (dryRun) {
    console.log(
      "\nPrueba completa: build, preflight y wrangler dry-run en PASS.",
    );
    return 0;
  }
  console.log("\nAgorbis está abierto. Verificá a mano, en este orden:");
  SIMPLE_OPEN_RELEASE_MANUAL_CHECKS.forEach((check, index) =>
    console.log(`  ${index + 1}. ${check}`),
  );
  console.log("Si algo falla, volvé a CLOSED con: pnpm deploy:closed");
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error("Salida a Producción: BLOQUEADA");
  console.error(
    `  ✗ ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
