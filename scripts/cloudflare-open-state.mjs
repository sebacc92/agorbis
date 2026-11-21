#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runCloudflareOpenStateCheck } from "./cloudflare-closed-state.mjs";

export { runCloudflareOpenStateCheck };

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseCloudflareOpenStateArgs(argv) {
  invariant(
    Array.isArray(argv),
    "Los argumentos del verificador open no son válidos.",
  );
  invariant(
    argv.length === 0,
    "El verificador open no admite argumentos ni perfiles relajados.",
  );
  return Object.freeze({});
}

async function main() {
  parseCloudflareOpenStateArgs(process.argv.slice(2));
  const result = await runCloudflareOpenStateCheck();
  process.stdout.write(
    `Cloudflare open verificado: phase=${result.phase}, secret-stage=${result.secretStage}, deployment=${result.activeDeploymentId}, version=${result.activeVersionId}.\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const message =
      error instanceof Error ? error.message : "Error desconocido.";
    process.stderr.write(`Cloudflare open: ${message}\n`);
    process.exitCode = 1;
  });
}
