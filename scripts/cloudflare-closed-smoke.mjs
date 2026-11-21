#!/usr/bin/env node

import {
  assertClosedProductionSmokeReceipt,
  runClosedProductionSmoke,
} from "./cloudflare-closed-smoke-policy.mjs";

try {
  if (process.argv.length !== 2) {
    throw new Error("El smoke CLOSED no acepta argumentos.");
  }
  const result = await runClosedProductionSmoke();
  assertClosedProductionSmokeReceipt(result);
  console.log(
    `Smoke HTTP de Producción cerrada: PASS (${result.completed.length} controles, ${result.cronCount} crons, ${result.postDeniedCount} POST con HTTP 503; ausencia de escritura ${result.postWriteStatus}).`,
  );
} catch (error) {
  console.error("Smoke de Producción cerrada: BLOQUEADO");
  console.error(
    `  ✗ ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
