#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseJsonc,
  readWranglerConfiguration,
  validateProductionNodeVersion,
  validateReadOnlyPreviewConfiguration,
} from "./cloudflare-worker-policy.mjs";
import { validateCloudflareWorkerArtifact } from "./cloudflare-worker-artifact.mjs";
import {
  validateMigrationDraftFiles,
  validateProductionMigrationFiles,
} from "./production-preflight-policy.mjs";
import {
  EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS,
  runReadOnlyPreviewRemoteGates,
} from "./cloudflare-readonly-preview-remote-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [...validateProductionNodeVersion()];

let productionConfiguration;
let previewConfiguration;
try {
  productionConfiguration = readWranglerConfiguration(
    path.join(root, "wrangler.jsonc"),
  );
  previewConfiguration = parseJsonc(
    readFileSync(path.join(root, "wrangler.readonly-preview.jsonc"), "utf8"),
    "wrangler.readonly-preview.jsonc",
  );
  errors.push(
    ...validateReadOnlyPreviewConfiguration(
      previewConfiguration,
      productionConfiguration,
    ),
  );
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

try {
  const packageConfiguration = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const expectedScripts = {
    "build.cloudflare:readonly-preview":
      "node scripts/cloudflare-build.mjs --public-read-only-preview",
    "deploy:readonly-preview":
      "pnpm build.cloudflare:readonly-preview && wrangler deploy --config wrangler.readonly-preview.jsonc --strict --no-autoconfig",
    "deploy:readonly-preview:dry-run":
      "pnpm build.cloudflare:readonly-preview && wrangler deploy --config wrangler.readonly-preview.jsonc --dry-run --no-autoconfig",
    "preflight:readonly-preview":
      "node scripts/cloudflare-readonly-preview-preflight.mjs",
    "smoke:readonly-preview":
      "node scripts/cloudflare-readonly-preview-smoke.mjs",
  };
  for (const [name, command] of Object.entries(expectedScripts)) {
    if (packageConfiguration.scripts?.[name] !== command) {
      errors.push(`${name} no coincide con el comando fail-closed aprobado.`);
    }
  }
} catch {
  errors.push("package.json falta o no contiene JSON válido.");
}

const migrationEntries = readdirSync(path.join(root, "supabase", "migrations"));
const migrationDraftEntries = readdirSync(
  path.join(root, "supabase", "migration-drafts"),
);
errors.push(...validateProductionMigrationFiles(migrationEntries));
errors.push(...validateMigrationDraftFiles(migrationDraftEntries));

// El inventario local aprobado ya contiene 0061. El gate remoto distingue ese
// estado preparado (Producción todavía en 0060, por lo tanto STOP) del estado
// aplicado exacto, sin admitir nunca 0059, gaps ni IDs adicionales.

if (previewConfiguration) {
  errors.push(
    ...validateCloudflareWorkerArtifact(
      path.join(root, "dist"),
      previewConfiguration,
      // El proceso de build preview sólo contiene PUBLIC_* confirmadas y no
      // hereda .env.local. El scanner de formatos secretos corre igualmente.
      { runtimeSecrets: process.env },
    ),
  );
}

// Las comprobaciones remotas se ejecutan sólo después de que el perfil, el
// artefacto y el inventario local sean válidos. No imprimen claves ni cuerpos
// de Auth: devuelven exclusivamente el nombre del gate incumplido.
if (errors.length === 0) {
  errors.push(...(await runReadOnlyPreviewRemoteGates({ root })));
}

if (errors.length > 0) {
  console.error("Preflight del preview público read-only: BLOQUEADO");
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(
  `Preflight del preview público read-only: válido (${EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS.length} migraciones aplicadas exactamente: 0001–0058, 0060 y ${EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS.at(-1)}; borrador 0059 aislado, dos custom domains, cero crons, allowlist GET/HEAD y rollback cerrado conservado).`,
);
