#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

export const EXPECTED_CLOUDFLARE_WORKER_SECRETS = Object.freeze([
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
]);

export const CLOUDFLARE_SECRET_ONBOARDING_STAGES = Object.freeze({
  supabase: Object.freeze(["SUPABASE_SECRET_KEY"]),
  turnstile: Object.freeze(["SUPABASE_SECRET_KEY", "TURNSTILE_SECRET"]),
  complete: EXPECTED_CLOUDFLARE_WORKER_SECRETS,
});

function expectedSecretsForStage(stage) {
  return Object.hasOwn(CLOUDFLARE_SECRET_ONBOARDING_STAGES, stage)
    ? CLOUDFLARE_SECRET_ONBOARDING_STAGES[stage]
    : null;
}

export function validateCloudflareSecretInventory(
  raw,
  { stage = "complete" } = {},
) {
  const expectedSecrets = expectedSecretsForStage(stage);
  if (!expectedSecrets) {
    return [`Etapa de Worker Secrets no permitida: ${JSON.stringify(stage)}.`];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ["Wrangler no devolvió JSON válido para el inventario de secrets."];
  }
  if (!Array.isArray(parsed)) {
    return ["El inventario de Worker Secrets no es un array JSON."];
  }
  const errors = [];
  const names = [];
  for (const [index, entry] of parsed.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`Secret remoto ${index} no es un objeto.`);
      continue;
    }
    const keys = Object.keys(entry).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== "name" ||
      keys[1] !== "type" ||
      typeof entry.name !== "string" ||
      entry.type !== "secret_text"
    ) {
      errors.push(`Secret remoto ${index} tiene una estructura inesperada.`);
      continue;
    }
    names.push(entry.name);
  }
  const actual = [...names].sort();
  const expected = [...expectedSecrets].sort();
  if (
    names.length !== new Set(names).size ||
    JSON.stringify(actual) !== JSON.stringify(expected)
  ) {
    errors.push(
      `Worker Secrets en etapa ${stage} debe contener exactamente: ${expectedSecrets.join(", ")}.`,
    );
  }
  return errors;
}

export function queryRemoteCloudflareSecretInventory({
  root,
  configPath = "wrangler.closed.jsonc",
  stage = "complete",
  runner = spawnSync,
} = {}) {
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    return ["El inventario remoto requiere una raíz absoluta del proyecto."];
  }
  if (configPath !== "wrangler.closed.jsonc") {
    return [
      "El inventario remoto del cutover debe usar exactamente wrangler.closed.jsonc.",
    ];
  }
  if (!expectedSecretsForStage(stage)) {
    return [`Etapa de Worker Secrets no permitida: ${JSON.stringify(stage)}.`];
  }

  const wranglerBinary = path.join(root, "node_modules", ".bin", "wrangler");
  const arguments_ = [
    "secret",
    "list",
    "--config",
    configPath,
    "--format",
    "json",
  ];
  let result;
  try {
    result = runner(wranglerBinary, arguments_, {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      shell: false,
    });
  } catch {
    return ["No se pudo ejecutar Wrangler para consultar Worker Secrets."];
  }
  if (!result || typeof result !== "object") {
    return ["Wrangler no devolvió un resultado de proceso válido."];
  }
  if (result.error || result.signal || result.status !== 0) {
    return [
      "wrangler secret list falló; el cutover permanece bloqueado sin validar nombres remotos.",
    ];
  }
  if (typeof result.stderr !== "string" || result.stderr.trim()) {
    return [
      "wrangler secret list emitió salida de error inesperada; el cutover permanece bloqueado.",
    ];
  }
  if (typeof result.stdout !== "string") {
    return ["wrangler secret list no devolvió stdout de texto."];
  }
  return validateCloudflareSecretInventory(result.stdout, { stage });
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  const arguments_ = process.argv.slice(2);
  const stageArgument = arguments_.length === 1 ? arguments_[0] : "";
  const stage =
    arguments_.length === 0
      ? "complete"
      : stageArgument.startsWith("--stage=")
        ? stageArgument.slice("--stage=".length)
        : "";
  if (!expectedSecretsForStage(stage)) {
    console.error(
      "Inventario Cloudflare Worker Secrets: argumento no permitido. Etapas: supabase, turnstile o complete.",
    );
    process.exit(1);
  }

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const errors = validateCloudflareSecretInventory(raw, { stage });
  if (errors.length > 0) {
    console.error("Inventario Cloudflare Worker Secrets: BLOQUEADO");
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exitCode = 1;
  } else {
    const count = CLOUDFLARE_SECRET_ONBOARDING_STAGES[stage].length;
    console.log(
      `Inventario Cloudflare Worker Secrets: PASS (${count}/3 exactos, etapa ${stage}).`,
    );
  }
}
