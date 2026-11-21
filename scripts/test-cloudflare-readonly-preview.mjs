#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseJsonc,
  validateReadOnlyPreviewConfiguration,
  validateWranglerConfiguration,
} from "./cloudflare-worker-policy.mjs";
import {
  EXPECTED_D72_MIGRATION_FILE,
  EXPECTED_MIGRATION_DRAFT_FILE,
  EXPECTED_PRODUCTION_MIGRATION_IDS,
  validateMigrationDraftFiles,
  validateProductionMigrationFiles,
} from "./production-preflight-policy.mjs";
import { EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS } from "./cloudflare-readonly-preview-remote-policy.mjs";

const production = parseJsonc(
  readFileSync(
    fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
    "utf8",
  ),
  "wrangler.jsonc",
);
const preview = parseJsonc(
  readFileSync(
    fileURLToPath(
      new URL("../wrangler.readonly-preview.jsonc", import.meta.url),
    ),
    "utf8",
  ),
  "wrangler.readonly-preview.jsonc",
);

assert.deepEqual(validateWranglerConfiguration(production), []);
assert.deepEqual(validateReadOnlyPreviewConfiguration(preview, production), []);
assert.equal(preview.vars.AGORBIS_LAUNCH_MODE, "public-read-only");
assert.equal(production.vars.PUBLIC_GOOGLE_AUTH_ENABLED, "true");
assert.equal(production.vars.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
assert.equal(preview.vars.PUBLIC_GOOGLE_AUTH_ENABLED, "false");
assert.equal(preview.vars.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
assert.deepEqual(preview.triggers.crons, []);
assert.equal(preview.workers_dev, false);
assert.equal(preview.preview_urls, false);
assert.equal(preview.keep_vars, false);
assert.equal(preview.assets.run_worker_first, true);
assert.deepEqual(preview.routes, [
  { pattern: "agorbis.com", custom_domain: true },
  { pattern: "www.agorbis.com", custom_domain: true },
]);
assert.deepEqual(preview.secrets.required, [
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
]);

assert.deepEqual(EXPECTED_PRODUCTION_MIGRATION_IDS.slice(-3), [
  "0057",
  "0058",
  "0060",
]);
assert.equal(EXPECTED_PRODUCTION_MIGRATION_IDS.includes("0059"), false);
assert.equal(
  EXPECTED_D72_MIGRATION_FILE,
  "0061_reconcile_sequence_acl_drift.sql",
);
assert.deepEqual(EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS, [
  ...EXPECTED_PRODUCTION_MIGRATION_IDS,
  EXPECTED_D72_MIGRATION_FILE.slice(0, 4),
]);
assert.deepEqual(EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS.slice(-3), [
  "0058",
  "0060",
  "0061",
]);
assert.equal(EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS.includes("0059"), false);
assert.equal(
  EXPECTED_MIGRATION_DRAFT_FILE,
  "0059_versioned_sensitive_participation_consent.sql",
);
assert.deepEqual(
  validateProductionMigrationFiles(
    readdirSync(new URL("../supabase/migrations", import.meta.url)),
  ),
  [],
);
assert.deepEqual(
  validateMigrationDraftFiles(
    readdirSync(new URL("../supabase/migration-drafts", import.meta.url)),
  ),
  [],
);

for (const mutation of [
  (candidate) => {
    candidate.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "true";
  },
  (candidate) => {
    candidate.vars.PUBLIC_FACEBOOK_AUTH_ENABLED = "true";
  },
  (candidate) => candidate.triggers.crons.push("* * * * *"),
  (candidate) => {
    candidate.vars.AGORBIS_LAUNCH_MODE = "open";
  },
  (candidate) => {
    candidate.workers_dev = true;
  },
  (candidate) => candidate.routes.pop(),
  (candidate) => candidate.secrets.required.pop(),
  (candidate) => {
    candidate.keep_vars = true;
  },
]) {
  const candidate = structuredClone(preview);
  mutation(candidate);
  assert.notDeepEqual(
    validateReadOnlyPreviewConfiguration(candidate, production),
    [],
  );
}

const runtimeSource = readFileSync(
  fileURLToPath(
    new URL("../src/lib/cloudflare-worker-runtime.ts", import.meta.url),
  ),
  "utf8",
);
for (const requiredGate of [
  'AGORBIS_LAUNCH_MODE === "public-read-only"',
  'headers.delete("authorization")',
  'headers.delete("cookie")',
  'headers.delete("set-cookie")',
  '"form-action", "form-action \'none\'"',
  '"frame-src", "frame-src \'none\'"',
]) {
  assert.ok(
    runtimeSource.includes(requiredGate),
    `Falta gate: ${requiredGate}`,
  );
}

const buildSource = readFileSync(
  fileURLToPath(new URL("./cloudflare-build.mjs", import.meta.url)),
  "utf8",
);
assert.match(buildSource, /--public-read-only-preview/);
assert.match(buildSource, /wrangler\.readonly-preview\.jsonc/);
assert.match(buildSource, /cloudflare-readonly-preview-preflight\.mjs/);

const preflightSource = readFileSync(
  new URL("./cloudflare-readonly-preview-preflight.mjs", import.meta.url),
  "utf8",
);
assert.match(preflightSource, /0061.*estado preparado.*0060.*STOP/s);
assert.match(
  preflightSource,
  /EXPECTED_READ_ONLY_PREVIEW_MIGRATION_IDS\.length/,
);
assert.match(
  preflightSource,
  /migraciones aplicadas exactamente: 0001–0058, 0060 y.*\.at\(-1\)/s,
);
assert.doesNotMatch(
  preflightSource,
  /migraciones aplicadas exactamente: 0001–0058 y 0060/,
);

const globalCss = readFileSync(
  fileURLToPath(new URL("../src/global.css", import.meta.url)),
  "utf8",
);
assert.match(globalCss, /\[data-agorbis-launch-mode="public-read-only"\] form/);

const layoutSource = readFileSync(
  fileURLToPath(new URL("../src/routes/layout.tsx", import.meta.url)),
  "utf8",
);
assert.match(layoutSource, /useLaunchMode = routeLoader\$/);
assert.match(layoutSource, /ev\.env\.get\("AGORBIS_LAUNCH_MODE"\)/);
assert.match(
  layoutSource,
  /data-agorbis-launch-mode=\{launchMode\.value \|\| undefined\}/,
);
assert.match(layoutSource, /launchMode\.value === "public-read-only"/);
assert.doesNotMatch(layoutSource, /useServerData.*agorbisLaunchMode/);

const rootSource = readFileSync(
  fileURLToPath(new URL("../src/root.tsx", import.meta.url)),
  "utf8",
);
assert.doesNotMatch(rootSource, /useServerData.*agorbisLaunchMode/);

const headersPluginSource = readFileSync(
  fileURLToPath(new URL("../src/routes/plugin@cabeceras.ts", import.meta.url)),
  "utf8",
);
assert.doesNotMatch(headersPluginSource, /sharedMap\.set\("agorbisLaunchMode"/);

const packageConfiguration = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ),
);
assert.equal(
  packageConfiguration.scripts["deploy:readonly-preview"],
  "pnpm build.cloudflare:readonly-preview && wrangler deploy --config wrangler.readonly-preview.jsonc --strict --no-autoconfig",
);
assert.equal(
  packageConfiguration.scripts["deploy:readonly-preview:dry-run"],
  "pnpm build.cloudflare:readonly-preview && wrangler deploy --config wrangler.readonly-preview.jsonc --dry-run --no-autoconfig",
);

console.log("Cloudflare read-only preview tests: PASS");
