import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_MIGRATION_FILES,
  CANDIDATE_MIGRATION_IDS,
  EXPECTED_D72_MIGRATION_FILE,
  EXPECTED_MIGRATION_DRAFT_FILE,
  EXPECTED_PRODUCTION_MIGRATION_IDS,
  validateMigrationDraftFiles,
  validateProductionMigrationFiles,
} from "./production-preflight-policy.mjs";
import {
  EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  EXPECTED_WORKER_CRONS,
  EXPECTED_WORKER_ROUTES,
  EXPECTED_WORKER_SECRETS,
  EXPECTED_WORKER_VARS,
  parseJsonc,
  validateClosedCutoverConfiguration,
  validateClosedCutoverPlan,
  validateProductionNodeVersion,
  validateWranglerConfiguration,
} from "./cloudflare-worker-policy.mjs";
import {
  EXPECTED_STATIC_ASSET_EXCLUSIONS,
  loadProductionBuildEnvironment,
  validateCloudflareWorkerArtifact,
} from "./cloudflare-worker-artifact.mjs";
import { CLOUDFLARE_PUBLIC_BUILD_VARIABLES } from "./cloudflare-public-build-environment.mjs";
import {
  CLOUDFLARE_SECRET_ONBOARDING_STAGES,
  queryRemoteCloudflareSecretInventory,
  validateCloudflareSecretInventory,
} from "./cloudflare-secret-inventory.mjs";
import {
  EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  renderExceptionalReleaseRequestJson,
} from "./exceptional-release-act.mjs";
import {
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Posterior a la aprobación Google0067 y anterior al vencimiento de revisión
// excepcional; los casos de caducidad mantienen sus relojes específicos.
const fixtureNow = new Date("2026-09-09T12:00:00.000Z");

function confirmedPublicValue(name) {
  const variable = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(
    (candidate) => candidate.name === name,
  );
  assert.equal(variable?.status, "confirmed", `${name} debe estar confirmado.`);
  return variable.value;
}

assert.deepEqual(validateProductionNodeVersion("22.22.0"), []);
assert.match(validateProductionNodeVersion("24.0.0").join("\n"), /Node 22\.x/);
assert.match(validateProductionNodeVersion("").join("\n"), /Node 22\.x/);

function isIgnoredByGit(relativePath) {
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", "--", relativePath],
    { cwd: root, encoding: "utf8" },
  );
  assert.ok(
    result.status === 0 || result.status === 1,
    result.stderr || `git check-ignore terminó con ${result.status}.`,
  );
  return result.status === 0;
}

for (const sensitivePath of [
  ".env.production",
  ".env.staging",
  "config/.env.production",
  "backup-manifest.json",
  "recovery/backup-manifest.json",
  "agorbis.backup-manifest.json",
  "database.dump",
  "database.pgdump",
  "database.sql.gz",
  "database.sql.zst",
  "objects.tar.zst",
  "backups/database/data.sql",
  ".agorbis-backups/storage/buckets.json",
  "agorbis-backup-20260825/database/data.sql",
  "agorbis-restore-drill-20260825/storage/buckets.json",
  "agorbis-git-recovery-20260825/agorbis.bundle",
  "recovery/agorbis.bundle",
  "recovery/agorbis.bundle.gpg",
  "recovery/agorbis.git-recovery.tar",
  "recovery/agorbis.git-recovery.tar.gpg",
  "recovery/git-bundle-manifest.json",
  "recovery/SHA256SUMS.git-recovery",
]) {
  assert.equal(
    isIgnoredByGit(sensitivePath),
    true,
    `${sensitivePath} debe quedar excluido de Git.`,
  );
}

for (const versionedPath of [
  ".env.example",
  "supabase/migration-drafts/0059_versioned_sensitive_participation_consent.sql",
  "supabase/migrations/0058_correct_provider_disclosures.sql",
  "supabase/templates/confirmation.html",
  "wrangler.traffic.jsonc",
  "wrangler.crons-open.jsonc",
  "wrangler.crons-closed.jsonc",
  "scripts/run-exceptional-open-cutover.mjs",
  "scripts/run-exceptional-closed-recovery.mjs",
  "scripts/exceptional-act-issuance.mjs",
  "scripts/exceptional-closed-recovery-capsule.mjs",
  "scripts/exceptional-cutover-child-process.mjs",
  "scripts/exceptional-cutover-operation-lock.mjs",
]) {
  assert.equal(
    isIgnoredByGit(versionedPath),
    false,
    `${versionedPath} debe continuar siendo versionable.`,
  );
}

const packageConfiguration = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);
assert.equal(
  packageConfiguration.scripts.build,
  "qwik build",
  "El build debe delegar en el grafo de Qwik sin duplicar los gates de lint.",
);
assert.equal(
  packageConfiguration.scripts["build.cloudflare"],
  "node scripts/cloudflare-build.mjs",
  "El release de Cloudflare debe pasar por el build fail-closed versionado.",
);
assert.equal(
  packageConfiguration.scripts["build.cloudflare:closed"],
  "node scripts/cloudflare-build.mjs --closed-cutover",
  "El primer release cerrado debe tener un build/preflight aislado del perfil abierto.",
);
assert.equal(
  packageConfiguration.scripts["cf-typegen"],
  "wrangler types --include-runtime=false --strict-vars=true",
  "El typegen no debe duplicar los globals del runtime de Workers.",
);
assert.equal(
  packageConfiguration.scripts["db.test.draft-0059:ephemeral"],
  "bash scripts/test-sensitive-participation-consent-draft.sh",
  "El draft 0059 debe conservar un runner explícito y fuera de db.reset.",
);
const draftRunnerPath = path.join(
  root,
  "scripts/test-sensitive-participation-consent-draft.sh",
);
const draftRunnerSyntax = spawnSync("bash", ["-n", draftRunnerPath], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(draftRunnerSyntax.status, 0, draftRunnerSyntax.stderr);
const draftRunnerHelp = spawnSync("bash", [draftRunnerPath, "--help"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(draftRunnerHelp.status, 0, draftRunnerHelp.stderr);
assert.match(draftRunnerHelp.stdout, /base efímera/);
const draftRunnerWithoutAcknowledgement = spawnSync("bash", [draftRunnerPath], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(draftRunnerWithoutAcknowledgement.status, 2);
assert.equal(
  packageConfiguration.scripts.deploy,
  undefined,
  "No puede existir un deploy open genérico fuera del cutover versionado.",
);
assert.equal(
  packageConfiguration.scripts["deploy:dry-run"],
  "pnpm build.cloudflare && wrangler deploy --dry-run --no-autoconfig",
  "El dry-run debe usar el mismo build y no permitir autoconfiguración.",
);
assert.equal(
  packageConfiguration.scripts["deploy:closed"],
  "pnpm build.cloudflare:closed && wrangler deploy --config wrangler.closed.jsonc --strict --no-autoconfig",
  "El deploy cerrado debe usar únicamente el build y config del cutover cerrado.",
);
assert.equal(
  packageConfiguration.scripts["deploy:closed:dry-run"],
  "pnpm build.cloudflare:closed && wrangler deploy --config wrangler.closed.jsonc --dry-run --no-autoconfig",
  "El dry-run cerrado debe validar exactamente el mismo perfil sin subirlo.",
);
assert.equal(
  packageConfiguration.scripts["release:open:exceptional:dry-run"],
  "node scripts/run-exceptional-open-release.mjs",
  "El runner excepcional debe ser exclusivamente dry-run y no delegar en deploy.",
);
assert.equal(
  packageConfiguration.scripts["release:open:exceptional:cutover"],
  "node scripts/run-exceptional-open-cutover.mjs",
  "El cutover excepcional debe consumir exclusivamente acta y artifact versionados.",
);
assert.equal(
  packageConfiguration.scripts["release:open:exceptional:recover-closed"],
  "node scripts/run-exceptional-closed-recovery.mjs",
  "El recovery excepcional debe usar exclusivamente el runner CLOSED versionado.",
);
assert.equal(packageConfiguration.scripts["deploy:exceptional"], undefined);
assert.equal(
  Object.entries(packageConfiguration.scripts).some(
    ([name, command]) =>
      /exceptional/i.test(name) && /deploy/i.test(`${name} ${command}`),
  ),
  false,
  "No puede existir un comando de deployment excepcional.",
);
assert.equal(
  packageConfiguration.scripts.lint.match(/scripts\/check-legal\.mjs/g)?.length,
  1,
  "El lint invocado por qwik build debe ejecutar check-legal exactamente una vez.",
);
assert.equal(
  packageConfiguration.scripts.lint.match(
    /scripts\/test-cloudflare-public-build-environment\.mjs/g,
  )?.length,
  1,
  "El lint debe ejecutar exactamente una vez el test de la fuente pública del build.",
);
assert.doesNotMatch(
  readFileSync(path.join(root, "scripts/cloudflare-build.mjs"), "utf8"),
  /scripts\/check-legal\.mjs/,
  "cloudflare-build no debe duplicar el check legal que ya ejecuta pnpm build.",
);
{
  // Con lint partido en lint/test/test.release, `pnpm build` ya no corre
  // vitest ni los gates de release. cloudflare-build tiene que exigirlos
  // antes de construir: si no, deploy:closed, deploy:readonly-preview,
  // deploy:dry-run y release:open:dry-run publican sin pruebas.
  const cloudflareBuildSource = readFileSync(
    path.join(root, "scripts/cloudflare-build.mjs"),
    "utf8",
  );
  const suites =
    /const CLOUDFLARE_BUILD_TEST_SCRIPTS = Object\.freeze\(\[([^\]]*)\]\)/.exec(
      cloudflareBuildSource,
    );
  assert.ok(suites, "cloudflare-build debe declarar sus suites previas.");
  assert.deepEqual(
    [...suites[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]),
    ["test", "test.release"],
    "cloudflare-build debe correr pnpm test y pnpm test.release.",
  );
  for (const script of ["test", "test.release"]) {
    assert.equal(
      typeof packageConfiguration.scripts[script],
      "string",
      `package.json debe definir ${script}.`,
    );
  }
  const suitesRun = cloudflareBuildSource.indexOf(
    "for (const script of CLOUDFLARE_BUILD_TEST_SCRIPTS)",
  );
  const buildRun = cloudflareBuildSource.indexOf('["build"]');
  assert.ok(
    suitesRun >= 0,
    "cloudflare-build debe ejecutar sus suites previas.",
  );
  assert.ok(
    buildRun > suitesRun,
    "Las suites tienen que correr antes de pnpm build, no después.",
  );
  assert.ok(
    cloudflareBuildSource.indexOf("assertExceptionalReleaseScriptContract(") <
      suitesRun,
    "El contrato de scripts se valida antes de correr cualquier suite.",
  );
}
assert.equal(packageConfiguration.devDependencies.vercel, undefined);
assert.equal(
  Object.entries(packageConfiguration.scripts).some(([name, command]) =>
    /vercel/i.test(`${name} ${command}`),
  ),
  false,
  "package.json no debe conservar scripts de Vercel.",
);

const productionRunbook = readFileSync(
  path.join(root, "docs/PRODUCTION_RUNBOOK.md"),
  "utf8",
);
assert.doesNotMatch(
  productionRunbook,
  /wrangler secret put[^\n]*--config/,
  "El onboarding de secrets no puede interpretar routes/triggers desde un config local.",
);
assert.doesNotMatch(
  productionRunbook,
  /wrangler secret put/,
  "Los tres Worker Secrets ya están cargados y el runbook de apertura no debe volver a ingresarlos.",
);
assert.match(
  productionRunbook,
  /wrangler secret list --name agorbis --cwd \/tmp --format json \|[\s\S]*?--stage=complete/,
  "La apertura debe volver a comprobar el inventario remoto exacto 3\/3 sin leer valores.",
);

const expectedMigrationFiles = EXPECTED_PRODUCTION_MIGRATION_IDS.map(
  (migrationId) => `${migrationId}_fixture.sql`,
);
expectedMigrationFiles.push(
  EXPECTED_D72_MIGRATION_FILE,
  ...CANDIDATE_MIGRATION_FILES,
);
assert.equal(CANDIDATE_MIGRATION_IDS.length, 73);
assert.deepEqual(CANDIDATE_MIGRATION_IDS.slice(-6), [
  "0071",
  "0072",
  "0073",
  "0074",
  "0075",
  "0076",
]);
assert.equal(
  CANDIDATE_MIGRATION_FILES.at(-1),
  "0076_argentina_local_governments.sql",
);
assert.deepEqual(EXPECTED_PRODUCTION_MIGRATION_IDS.slice(-3), [
  "0057",
  "0058",
  "0060",
]);
assert.ok(!EXPECTED_PRODUCTION_MIGRATION_IDS.includes("0059"));
assert.deepEqual(validateProductionMigrationFiles(expectedMigrationFiles), []);
assert.match(
  validateProductionMigrationFiles(expectedMigrationFiles.slice(1)).join("\n"),
  /faltan 0001/,
);
assert.match(
  validateProductionMigrationFiles([
    ...expectedMigrationFiles,
    "0001_duplicate.sql",
  ]).join("\n"),
  /duplicadas 0001/,
);
assert.match(
  validateProductionMigrationFiles([
    ...expectedMigrationFiles,
    "0059_unexpected.sql",
  ]).join("\n"),
  /inesperadas 0059/,
);
assert.match(
  validateProductionMigrationFiles([
    ...expectedMigrationFiles.map((file) =>
      file === EXPECTED_D72_MIGRATION_FILE ? "0061_otro_nombre.sql" : file,
    ),
  ]).join("\n"),
  /0061 debe llamarse 0061_reconcile_sequence_acl_drift\.sql/,
);
// El candidato requiere las cinco migraciones como conjunto completo;
// tampoco puede sustituir un nombre aprobado conservando sólo su número.
for (const file of CANDIDATE_MIGRATION_FILES) {
  assert.match(
    validateProductionMigrationFiles(
      expectedMigrationFiles.filter((entry) => entry !== file),
    ).join("\n"),
    new RegExp(`faltan ${file.slice(0, 4)}`),
  );
  assert.match(
    validateProductionMigrationFiles(
      expectedMigrationFiles.map((entry) =>
        entry === file ? `${file.slice(0, 4)}_changed.sql` : entry,
      ),
    ).join("\n"),
    new RegExp(`${file.slice(0, 4)} debe llamarse`),
  );
}
for (
  let omitted = 1;
  omitted <= CANDIDATE_MIGRATION_FILES.length;
  omitted += 1
) {
  assert.notDeepEqual(
    validateProductionMigrationFiles(expectedMigrationFiles.slice(0, -omitted)),
    [],
  );
}
assert.match(
  validateProductionMigrationFiles([
    ...expectedMigrationFiles,
    "0068_unexpected.sql",
  ]).join("\n"),
  /inesperadas 0068/,
);
assert.deepEqual(
  validateMigrationDraftFiles([EXPECTED_MIGRATION_DRAFT_FILE]),
  [],
);
for (const invalidDraftEntries of [
  [],
  ["0059_otro_borrador.sql"],
  [EXPECTED_MIGRATION_DRAFT_FILE, "0060_otro_borrador.sql"],
]) {
  assert.match(
    validateMigrationDraftFiles(invalidDraftEntries).join("\n"),
    /migration-drafts/,
  );
}

const names = [
  "PUBLIC_SITE_URL",
  "PUBLIC_SUPABASE_URL",
  "PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR",
  "SUPABASE_AUTH_CAPTCHA_ENABLED",
  "SUPABASE_AUTH_CAPTCHA_PROVIDER",
  "SUPABASE_AUTH_IP_FORWARDING_ENABLED",
  "SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED",
  "SUPABASE_AUTH_SIGNUPS_ENABLED",
  "SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED",
  "SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED",
  "SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED",
  "SUPABASE_AUTH_PHONE_AUTH_ENABLED",
  "SUPABASE_AUTH_MIN_PASSWORD_LENGTH",
  "SUPABASE_AUTH_PASSWORD_REQUIREMENTS",
  "SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED",
  "SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED",
  "SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED",
  "SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS",
  "SUPABASE_AUTH_SITE_URL",
  "SUPABASE_AUTH_REDIRECT_URLS",
  "SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED",
  "SUPABASE_LEGACY_SERVICE_ROLE_DISABLED",
  "CRON_SECRET",
  "CLOUDFLARE_WORKERS_PLAN",
  "SUPABASE_PLAN",
  "CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED",
  "VERCEL_PLAN",
  "PUBLIC_LEGAL_CONTROLLER_NAME",
  "PUBLIC_LEGAL_CONTACT_EMAIL",
  "PUBLIC_AAIP_CONTROLLER_ID",
  "AAIP_DATABASE_REGISTRATION_STATUS",
  "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
  "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
  "PUBLIC_SUPABASE_PROCESSING_LOCATION",
  "PUBLIC_SUPABASE_PROCESSING_LOCATION_EN",
  "PUBLIC_VERCEL_PROCESSING_LOCATION",
  "PUBLIC_VERCEL_PROCESSING_LOCATION_EN",
  "PUBLIC_RESEND_PROCESSING_LOCATION",
  "PUBLIC_RESEND_PROCESSING_LOCATION_EN",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
  "PUBLIC_TRANSFER_SAFEGUARDS",
  "PUBLIC_TRANSFER_SAFEGUARDS_EN",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
  "RETENTION_RECONCILIATION_STATUS",
  "PRODUCTION_BACKUP_STATUS",
  "GOOGLE_DRIVE_BACKUP_STATUS",
  "SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS",
  "PUBLIC_GOOGLE_AUTH_ENABLED",
  "PUBLIC_FACEBOOK_AUTH_ENABLED",
  "PUBLIC_FACEBOOK_PROCESSING_LOCATION",
  "PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN",
  "PUBLIC_GOOGLE_PROCESSING_LOCATION",
  "PUBLIC_GOOGLE_PROCESSING_LOCATION_EN",
  "OPENAI_API_KEY",
  "OPENAI_SUMMARY_MODEL",
  "PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET",
  "TURNSTILE_TESTING",
  "TURNSTILE_HOSTNAMES",
  "TURNSTILE_SUPABASE_GUARD_HOSTNAMES",
];

const base = {
  PUBLIC_SITE_URL: "https://agorbis.com",
  PUBLIC_SUPABASE_URL: EXPECTED_WORKER_VARS.PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY: EXPECTED_WORKER_VARS.PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: [
    "sb",
    "secret",
    "abcdefghijklmnopqrstuvwxyz0123456789",
  ].join("_"),
  SUPABASE_SERVICE_ROLE_KEY: "",
  SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR: "6",
  SUPABASE_AUTH_CAPTCHA_ENABLED: "true",
  SUPABASE_AUTH_CAPTCHA_PROVIDER: "turnstile",
  SUPABASE_AUTH_IP_FORWARDING_ENABLED: "true",
  SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED: "true",
  SUPABASE_AUTH_SIGNUPS_ENABLED: "true",
  SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED: "true",
  SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED: "true",
  SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED: "false",
  SUPABASE_AUTH_PHONE_AUTH_ENABLED: "false",
  SUPABASE_AUTH_MIN_PASSWORD_LENGTH: "12",
  SUPABASE_AUTH_PASSWORD_REQUIREMENTS: "letters_digits",
  SUPABASE_PLAN: "free",
  SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED: "false",
  SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED: "true",
  SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED: "true",
  SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS: "2",
  SUPABASE_AUTH_SITE_URL: "https://agorbis.com",
  SUPABASE_AUTH_REDIRECT_URLS:
    "https://agorbis.com/auth/callback,https://agorbis.com/auth/confirm",
  SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED:
    "password_changed,email_changed,identity_linked,identity_unlinked,mfa_factor_enrolled,mfa_factor_unenrolled",
  SUPABASE_LEGACY_SERVICE_ROLE_DISABLED: "true",
  CRON_SECRET: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_WORKERS_PLAN: "paid",
  CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED: "true",
  PUBLIC_LEGAL_CONTROLLER_NAME: confirmedPublicValue(
    "PUBLIC_LEGAL_CONTROLLER_NAME",
  ),
  PUBLIC_LEGAL_CONTACT_EMAIL: confirmedPublicValue(
    "PUBLIC_LEGAL_CONTACT_EMAIL",
  ),
  PUBLIC_AAIP_CONTROLLER_ID: confirmedPublicValue("PUBLIC_AAIP_CONTROLLER_ID"),
  AAIP_DATABASE_REGISTRATION_STATUS: "pending",
  PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS: "pending",
  PUBLIC_AAIP_DATABASE_REGISTRATION_ID: "",
  PUBLIC_SUPABASE_PROCESSING_LOCATION: "",
  PUBLIC_SUPABASE_PROCESSING_LOCATION_EN: "",
  PUBLIC_RESEND_PROCESSING_LOCATION: "",
  PUBLIC_RESEND_PROCESSING_LOCATION_EN: "",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION: "",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN: "",
  PUBLIC_TRANSFER_SAFEGUARDS: "",
  PUBLIC_TRANSFER_SAFEGUARDS_EN: "",
  PUBLIC_PROVIDER_RETENTION_SUMMARY: "",
  PUBLIC_PROVIDER_RETENTION_SUMMARY_EN: "",
  RETENTION_RECONCILIATION_STATUS: "unreconciled",
  PRODUCTION_BACKUP_STATUS: "not_verified",
  GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
  SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
  PUBLIC_GOOGLE_AUTH_ENABLED: "true",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
  PUBLIC_FACEBOOK_PROCESSING_LOCATION: "",
  PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN: "",
  PUBLIC_GOOGLE_PROCESSING_LOCATION:
    "Lugares de tratamiento descritos por el alcance contractual.",
  PUBLIC_GOOGLE_PROCESSING_LOCATION_EN:
    "Processing locations described by the contractual scope.",
  OPENAI_API_KEY: "",
  OPENAI_SUMMARY_MODEL: "",
  PUBLIC_TURNSTILE_SITE_KEY: confirmedPublicValue("PUBLIC_TURNSTILE_SITE_KEY"),
  TURNSTILE_SECRET: "ci_turnstile_secret_abcdefghijklmnop",
  TURNSTILE_TESTING: "",
  TURNSTILE_HOSTNAMES: "agorbis.com",
  TURNSTILE_SUPABASE_GUARD_HOSTNAMES: "agorbis.com",
};

function createHermeticPreflightFixture() {
  const fixtureRoot = mkdtempSync(
    path.join(tmpdir(), "agorbis-production-preflight-"),
  );
  mkdirSync(path.join(fixtureRoot, "scripts"));
  mkdirSync(path.join(fixtureRoot, "dist"));
  mkdirSync(path.join(fixtureRoot, "server"));
  mkdirSync(path.join(fixtureRoot, "src/lib"), { recursive: true });
  mkdirSync(path.join(fixtureRoot, "supabase/migrations"), { recursive: true });
  mkdirSync(path.join(fixtureRoot, "supabase/migration-drafts"));

  for (const relative of [
    "package.json",
    "wrangler.jsonc",
    "wrangler.closed.jsonc",
    "wrangler.open-recovery.jsonc",
    "scripts/production-preflight.mjs",
    "scripts/production-preflight-policy.mjs",
    "scripts/cloudflare-worker-policy.mjs",
    "scripts/cloudflare-worker-artifact.mjs",
    "scripts/cloudflare-public-build-environment.mjs",
    "scripts/social-auth-consent-policy.mjs",
    "scripts/google-processing-disclosure.mjs",
    "src/lib/legal.ts",
    "scripts/aaip-registration-policy.mjs",
    "scripts/release-gate-policy.mjs",
    "scripts/exceptional-release-state.mjs",
    "scripts/exceptional-release-preflight-policy.mjs",
    "scripts/exceptional-open-release-runner-policy.mjs",
    "scripts/exceptional-release-act.mjs",
    "scripts/open-release-baseline-policy.mjs",
    "scripts/cloudflare-closed-state.mjs",
    "scripts/exceptional-release-artifact.mjs",
    "scripts/exceptional-wrangler-integrity.mjs",
    "scripts/exceptional-cutover-config-policy.mjs",
    "scripts/cloudflare-secret-inventory.mjs",
    "scripts/secret-patterns.mjs",
    "src/lib/legal-evidence-policy.js",
  ]) {
    cpSync(path.join(root, relative), path.join(fixtureRoot, relative));
  }
  const repositoryMigrations = readdirSync(
    path.join(root, "supabase/migrations"),
  );
  for (const migrationId of EXPECTED_PRODUCTION_MIGRATION_IDS) {
    const matches = repositoryMigrations.filter(
      (name) =>
        name.startsWith(`${migrationId}_`) && /^\d{4}_.+\.sql$/.test(name),
    );
    assert.equal(
      matches.length,
      1,
      `El fixture productivo requiere exactamente un archivo ${migrationId}.`,
    );
    cpSync(
      path.join(root, "supabase/migrations", matches[0]),
      path.join(fixtureRoot, "supabase/migrations", matches[0]),
    );
  }
  cpSync(
    path.join(root, "supabase/migrations", EXPECTED_D72_MIGRATION_FILE),
    path.join(fixtureRoot, "supabase/migrations", EXPECTED_D72_MIGRATION_FILE),
  );
  for (const file of CANDIDATE_MIGRATION_FILES) {
    cpSync(
      path.join(root, "supabase/migrations", file),
      path.join(fixtureRoot, "supabase/migrations", file),
    );
  }
  cpSync(
    path.join(root, "supabase/migration-drafts", EXPECTED_MIGRATION_DRAFT_FILE),
    path.join(
      fixtureRoot,
      "supabase/migration-drafts",
      EXPECTED_MIGRATION_DRAFT_FILE,
    ),
  );
  symlinkSync(
    path.join(root, "node_modules"),
    path.join(fixtureRoot, "node_modules"),
  );

  writeFileSync(
    path.join(fixtureRoot, "dist/_worker.js"),
    'import {fetch,scheduled} from "../server/entry.cloudflare-workers.js"; export default {fetch,scheduled};\n',
  );
  writeFileSync(
    path.join(fixtureRoot, "dist/q-manifest.json"),
    `${JSON.stringify({
      version: "1",
      manifestHash: "hermetic-preflight-fixture",
      options: { buildMode: "production" },
    })}\n`,
  );
  writeFileSync(
    path.join(fixtureRoot, "dist/.assetsignore"),
    `${EXPECTED_STATIC_ASSET_EXCLUSIONS.join("\n")}\n`,
  );
  writeFileSync(
    path.join(fixtureRoot, "server/entry.cloudflare-workers.js"),
    "export const fetch=()=>new Response(); export const scheduled=()=>{};\n",
  );
  return fixtureRoot;
}

const preflightFixtureRoot = createHermeticPreflightFixture();
for (const arguments_ of [
  ["init", "--quiet"],
  ["config", "user.name", "Agorbis Preflight Test"],
  ["config", "user.email", "preflight@localhost.invalid"],
  ["add", "."],
  ["commit", "--quiet", "--no-gpg-sign", "-m", "fixture"],
]) {
  const result = spawnSync("git", arguments_, {
    cwd: preflightFixtureRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
const fixtureHead = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: preflightFixtureRoot,
  encoding: "utf8",
}).stdout.trim();
const exceptionalRequestRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-exceptional-preflight-request-"),
);
const script = path.join(
  preflightFixtureRoot,
  "scripts/production-preflight.mjs",
);
const cleanupPreflightFixture = () =>
  [preflightFixtureRoot, exceptionalRequestRoot].forEach((directory) =>
    rmSync(directory, { recursive: true, force: true }),
  );
process.once("exit", cleanupPreflightFixture);

function runPreflight(arguments_, overrides = {}, now = fixtureNow) {
  const clean = Object.fromEntries(names.map((name) => [name, ""]));
  // Sólo el subprocess de este fixture usa un reloj fijo; el preflight real
  // conserva sus checks de frescura y vencimiento con el reloj del sistema.
  const clockModule = `import { mock } from "node:test"; mock.timers.enable({ apis: ["Date"], now: ${now.getTime()} });`;
  return spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--import",
      `data:text/javascript,${encodeURIComponent(clockModule)}`,
      script,
      ...arguments_,
    ],
    {
      cwd: preflightFixtureRoot,
      encoding: "utf8",
      env: { ...process.env, ...clean, ...base, ...overrides },
    },
  );
}

function run(overrides = {}) {
  return runPreflight([], overrides);
}

function runClosed(overrides = {}) {
  const emptyProductionValues = Object.fromEntries(
    names.map((name) => [name, ""]),
  );
  return runPreflight(["--closed-cutover"], {
    ...emptyProductionValues,
    ...overrides,
  });
}

function writeExceptionalRequest(fileName, gateIds) {
  const now = fixtureNow;
  const request = {
    schemaVersion: EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head: fixtureHead,
    owner: "Sebastian Cardoso Castillo",
    timestampUtc: now.toISOString(),
    deploymentAuthorized: false,
    risks: gateIds.map((gateId) => {
      const definition = getReleaseGateDefinition(gateId);
      return {
        gateId,
        evidenceStatus: definition.evidenceStatus,
        rawResult: definition.rawResult,
        requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
        acceptedConsequence: definition.consequence,
        reviewRequiredBy: definition.reviewRequiredBy,
      };
    }),
  };
  const requestPath = path.join(exceptionalRequestRoot, fileName);
  writeFileSync(
    requestPath,
    renderExceptionalReleaseRequestJson(request, {
      currentHead: fixtureHead,
      now,
    }),
    { mode: 0o600 },
  );
  return requestPath;
}

const exceptionalEnvironment = {
  SUPABASE_SECRET_KEY: "",
  TURNSTILE_SECRET: "",
  CRON_SECRET: "",
  AAIP_DATABASE_REGISTRATION_STATUS: "pending",
  PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS: "pending",
  PUBLIC_AAIP_DATABASE_REGISTRATION_ID: "",
  PUBLIC_SUPABASE_PROCESSING_LOCATION: "",
  PUBLIC_SUPABASE_PROCESSING_LOCATION_EN: "",
  PUBLIC_RESEND_PROCESSING_LOCATION: "",
  PUBLIC_RESEND_PROCESSING_LOCATION_EN: "",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION: "",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN: "",
  PUBLIC_TRANSFER_SAFEGUARDS: "",
  PUBLIC_TRANSFER_SAFEGUARDS_EN: "",
  PUBLIC_PROVIDER_RETENTION_SUMMARY: "",
  PUBLIC_PROVIDER_RETENTION_SUMMARY_EN: "",
  RETENTION_RECONCILIATION_STATUS: "unreconciled",
  PRODUCTION_BACKUP_STATUS: "not_verified",
  GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
  SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
};

const valid = run();
assert.equal(valid.status, 1);
assert.match(valid.stderr, /AAIP_DATABASE_REGISTRATION_STATUS=approved/);
assert.match(valid.stderr, /RETENTION_RECONCILIATION_STATUS.*reconciled/);
assert.match(valid.stderr, /PRODUCTION_BACKUP_STATUS.*verified/);
assert.match(
  valid.stderr,
  /SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS.*applied/,
);

const completeExceptionalRequestPath = writeExceptionalRequest(
  "complete.json",
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
);
const exceptionalValid = runPreflight(
  ["--exceptional-request", completeExceptionalRequestPath],
  exceptionalEnvironment,
);
assert.equal(exceptionalValid.status, 0, exceptionalValid.stderr);
assert.doesNotMatch(
  exceptionalValid.stderr,
  /consentimiento OAuth bloqueado para Google/,
);
assert.match(exceptionalValid.stdout, /ESTO NO ES PASS/);
assert.match(exceptionalValid.stdout, /BLOCKED_EXTERNAL/);
assert.match(exceptionalValid.stderr, /PRODUCTION_BACKUP_STATUS=not_verified/);
assert.match(exceptionalValid.stderr, /draft_not_applied/);

const afterReview = new Date(
  new Date(
    `${getReleaseGateDefinition(OWNER_WAIVER_CANDIDATE_GATE_IDS[0]).reviewRequiredBy}T23:59:59.999Z`,
  ).getTime() + 1,
);
const expiredRequestPath = path.join(exceptionalRequestRoot, "expired.json");
const expiredRequest = JSON.parse(
  readFileSync(completeExceptionalRequestPath, "utf8"),
);
// Fecha de emisión fresca para aislar el rechazo por revisión vencida.
expiredRequest.timestampUtc = afterReview.toISOString();
writeFileSync(expiredRequestPath, JSON.stringify(expiredRequest), {
  mode: 0o600,
});
const expired = runPreflight(
  ["--exceptional-request", expiredRequestPath],
  exceptionalEnvironment,
  afterReview,
);
assert.equal(expired.status, 1, expired.stderr);
assert.match(expired.stderr, /superó su fecha de revisión/);
assert.doesNotMatch(expired.stdout, /ESTO NO ES PASS/);

function runExceptional(overrides = {}) {
  return runPreflight(
    ["--exceptional-request", completeExceptionalRequestPath],
    {
      ...exceptionalEnvironment,
      ...overrides,
    },
  );
}

const exceptionalAmbientSecret = runPreflight(
  ["--exceptional-request", completeExceptionalRequestPath],
  {
    ...exceptionalEnvironment,
    CRON_SECRET: "must-not-be-read-by-exceptional-runner",
  },
);
assert.equal(exceptionalAmbientSecret.status, 1);
assert.match(
  exceptionalAmbientSecret.stderr,
  /CRON_SECRET no debe ser leído ni heredado/,
);

const missingBackupRequestPath = writeExceptionalRequest(
  "missing-backup.json",
  OWNER_WAIVER_CANDIDATE_GATE_IDS.filter(
    (gateId) => gateId !== "recovery.production-backup-not-verified",
  ),
);
const missingBackupAcceptance = runPreflight(
  ["--exceptional-request", missingBackupRequestPath],
  exceptionalEnvironment,
);
assert.equal(missingBackupAcceptance.status, 1);
assert.match(
  missingBackupAcceptance.stderr,
  /recovery\.production-backup-not-verified requiere aceptación individual/,
);

const fixtureDraftPath = path.join(
  preflightFixtureRoot,
  "supabase/migration-drafts",
  EXPECTED_MIGRATION_DRAFT_FILE,
);
rmSync(fixtureDraftPath);
const missingDraft = run();
assert.equal(missingDraft.status, 1);
assert.match(missingDraft.stderr, /migration-drafts/);
cpSync(
  path.join(root, "supabase/migration-drafts", EXPECTED_MIGRATION_DRAFT_FILE),
  fixtureDraftPath,
);
const extraDraftPath = path.join(
  preflightFixtureRoot,
  "supabase/migration-drafts/0060_unexpected.sql",
);
writeFileSync(extraDraftPath, "-- borrador de fixture\n");
const extraDraft = run();
assert.equal(extraDraft.status, 1);
assert.match(extraDraft.stderr, /0060_unexpected\.sql/);
rmSync(extraDraftPath);
const executable0059Path = path.join(
  preflightFixtureRoot,
  "supabase/migrations/0059_unexpected.sql",
);
writeFileSync(executable0059Path, "-- migración ejecutable de fixture\n");
const executable0059 = run();
assert.equal(executable0059.status, 1);
assert.match(executable0059.stderr, /inesperadas 0059/);
rmSync(executable0059Path);

assert.deepEqual(validateClosedCutoverPlan("paid"), []);
for (const invalidPlan of ["", "free", "pro", "PAID"]) {
  assert.match(
    validateClosedCutoverPlan(invalidPlan).join("\n"),
    /CLOUDFLARE_WORKERS_PLAN=paid/,
  );
  const invalidClosedPlan = runClosed({
    CLOUDFLARE_WORKERS_PLAN: invalidPlan,
  });
  assert.equal(invalidClosedPlan.status, 1);
  assert.match(invalidClosedPlan.stderr, /CLOUDFLARE_WORKERS_PLAN/);
}

const obsoleteClosedWorkersDevMode = runPreflight(["--closed-workers-dev"]);
assert.equal(obsoleteClosedWorkersDevMode.status, 1);
assert.match(obsoleteClosedWorkersDevMode.stderr, /argumento no permitido/);

const unknownPreflightMode = runPreflight(["--desconocido"]);
assert.equal(unknownPreflightMode.status, 1);
assert.match(unknownPreflightMode.stderr, /argumento no permitido/);

for (const [name, mismatched] of [
  ["PUBLIC_SITE_URL", "https://otro.agorbis.com"],
  ["PUBLIC_GOOGLE_AUTH_ENABLED", "false"],
  ["PUBLIC_FACEBOOK_AUTH_ENABLED", "true"],
  ["PUBLIC_SUPABASE_URL", "https://otro-proyecto.supabase.co"],
  [
    "PUBLIC_SUPABASE_ANON_KEY",
    "sb_publishable_otra_clave_publica_abcdefghijklmnopqrstuvwxyz",
  ],
  ["TURNSTILE_HOSTNAMES", "www.agorbis.com"],
]) {
  const result = run({ [name]: mismatched });
  assert.equal(
    result.status,
    1,
    `${name} distinto debe bloquear el preflight.`,
  );
  assert.match(result.stderr, new RegExp(`${name}.*wrangler\\.jsonc`));
}

const validWranglerConfiguration = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: "agorbis",
  account_id: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  main: "dist/_worker.js",
  compatibility_date: "2026-08-25",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: false,
  preview_urls: false,
  routes: EXPECTED_WORKER_ROUTES,
  assets: {
    directory: "./dist",
    binding: "ASSETS",
    run_worker_first: true,
  },
  triggers: { crons: EXPECTED_WORKER_CRONS },
  observability: {
    logs: {
      enabled: true,
      head_sampling_rate: 1,
      invocation_logs: false,
    },
    traces: { enabled: false },
  },
  limits: { cpu_ms: 30_000 },
  keep_vars: false,
  secrets: { required: EXPECTED_WORKER_SECRETS },
  vars: EXPECTED_WORKER_VARS,
};
assert.deepEqual(validateWranglerConfiguration(validWranglerConfiguration), []);
const validClosedWranglerConfiguration = structuredClone(
  validWranglerConfiguration,
);
validClosedWranglerConfiguration.triggers = { crons: [] };
validClosedWranglerConfiguration.vars = {
  ...validClosedWranglerConfiguration.vars,
  AGORBIS_LAUNCH_MODE: "closed",
  PUBLIC_GOOGLE_AUTH_ENABLED: "false",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
};
assert.deepEqual(
  validateClosedCutoverConfiguration(
    validClosedWranglerConfiguration,
    validWranglerConfiguration,
  ),
  [],
);
assert.match(
  validateClosedCutoverConfiguration(
    {
      ...validClosedWranglerConfiguration,
      routes: validWranglerConfiguration.routes.slice(0, 1),
    },
    validWranglerConfiguration,
  ).join("\n"),
  /perfil Paid canónico/,
);
assert.match(
  validateClosedCutoverConfiguration(
    {
      ...validClosedWranglerConfiguration,
      triggers: { crons: [EXPECTED_WORKER_CRONS[0]] },
    },
    validWranglerConfiguration,
  ).join("\n"),
  /perfil Paid canónico/,
);
for (const mutation of [
  { workers_dev: true },
  { preview_urls: true },
  { routes: [] },
  { routes: validWranglerConfiguration.routes.slice(0, 1) },
  { limits: undefined },
  { limits: { cpu_ms: 10 } },
  { secrets: { required: [] } },
  { secrets: { required: ["SUPABASE_SECRET_KEY"] } },
  {
    vars: {
      ...validClosedWranglerConfiguration.vars,
      AGORBIS_LAUNCH_MODE: "open",
    },
  },
]) {
  assert.match(
    validateClosedCutoverConfiguration(
      { ...validClosedWranglerConfiguration, ...mutation },
      validWranglerConfiguration,
    ).join("\n"),
    /perfil Paid canónico/,
  );
}
assert.deepEqual(
  parseJsonc(
    `// config\n${JSON.stringify(validWranglerConfiguration).replace(/}$/, ",\n}")}`,
  ),
  validWranglerConfiguration,
);
assert.throws(() => parseJsonc("/* sin cierre"), /comentario sin cerrar/);
assert.throws(() => parseJsonc('{"name":'), /no es JSONC válido/);

for (const [mutation, expected] of [
  [{ workers_dev: true }, /workers_dev/],
  [{ preview_urls: true }, /preview_urls/],
  [
    { assets: { ...validWranglerConfiguration.assets, binding: "ASSET" } },
    /ASSETS/,
  ],
  [
    {
      assets: {
        ...validWranglerConfiguration.assets,
        html_handling: "auto-trailing-slash",
      },
    },
    /ASSETS/,
  ],
  [
    { triggers: { crons: EXPECTED_WORKER_CRONS.slice(1) } },
    /exactamente estos cinco crons/,
  ],
  [
    {
      triggers: { crons: [...EXPECTED_WORKER_CRONS, EXPECTED_WORKER_CRONS[0]] },
    },
    /exactamente estos cinco crons/,
  ],
  [
    {
      triggers: {
        crons: EXPECTED_WORKER_CRONS,
        extra: true,
      },
    },
    /exactamente estos cinco crons/,
  ],
  [
    { secrets: { required: EXPECTED_WORKER_SECRETS.slice(1) } },
    /secretos server-only/,
  ],
  [{ vars: { ...EXPECTED_WORKER_VARS, EXTRA: "prohibida" } }, /siete vars/],
  [
    { kv_namespaces: [{ binding: "EXTRA", id: "fixture" }] },
    /claves superiores aprobadas/,
  ],
  [{ r2_buckets: [] }, /claves superiores aprobadas/],
  [{ services: [] }, /claves superiores aprobadas/],
  [{ tail_consumers: [] }, /claves superiores aprobadas/],
  [{ keep_vars: true }, /keep_vars=true/],
  [
    {
      observability: {
        ...validWranglerConfiguration.observability,
        traces: { enabled: true },
      },
    },
    /traces.*enabled=false/,
  ],
  [
    {
      observability: {
        ...validWranglerConfiguration.observability,
        logs: {
          ...validWranglerConfiguration.observability.logs,
          invocation_logs: true,
        },
      },
    },
    /invocation_logs=false/,
  ],
  [
    {
      observability: {
        ...validWranglerConfiguration.observability,
        logs: {
          ...validWranglerConfiguration.observability.logs,
          destination: "external",
        },
      },
    },
    /head_sampling_rate=1/,
  ],
  [
    {
      observability: {
        ...validWranglerConfiguration.observability,
        extra: true,
      },
    },
    /head_sampling_rate=1/,
  ],
  [
    { limits: { ...validWranglerConfiguration.limits, extra: true } },
    /limits\.cpu_ms=30000/,
  ],
  [
    {
      secrets: {
        ...validWranglerConfiguration.secrets,
        extra: true,
      },
    },
    /secretos server-only/,
  ],
  [{ account_id: "00000000000000000000000000000000" }, /account_id/],
]) {
  const errors = validateWranglerConfiguration({
    ...validWranglerConfiguration,
    ...mutation,
  });
  assert.match(errors.join("\n"), expected);
}

const artifactFixtureRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-cloudflare-artifact-"),
);
try {
  const outputRoot = path.join(artifactFixtureRoot, "dist");
  assert.match(
    validateCloudflareWorkerArtifact(
      outputRoot,
      validWranglerConfiguration,
    ).join("\n"),
    /pnpm build\.cloudflare/,
  );
  mkdirSync(outputRoot, { recursive: true });
  const serverRoot = path.join(artifactFixtureRoot, "server");
  mkdirSync(serverRoot, { recursive: true });
  writeFileSync(
    path.join(serverRoot, "entry.cloudflare-workers.js"),
    "export const fetch=()=>new Response(); export const scheduled=()=>{};\n",
  );
  writeFileSync(
    path.join(outputRoot, "_worker.js"),
    'import {fetch,scheduled} from "../server/entry.cloudflare-workers.js"; export default {fetch,scheduled};\n',
  );
  writeFileSync(
    path.join(outputRoot, "q-manifest.json"),
    `${JSON.stringify({
      version: "1",
      manifestHash: "fixture",
      options: { buildMode: "production" },
    })}\n`,
  );
  writeFileSync(
    path.join(outputRoot, ".assetsignore"),
    "_worker.js\nsitemap.xml\n404.html\n",
  );
  assert.match(
    validateCloudflareWorkerArtifact(
      outputRoot,
      validWranglerConfiguration,
    ).join("\n"),
    /exactamente estas exclusiones/,
  );
  writeFileSync(
    path.join(outputRoot, ".assetsignore"),
    `${EXPECTED_STATIC_ASSET_EXCLUSIONS.join("\n")}\n`,
  );
  assert.deepEqual(
    validateCloudflareWorkerArtifact(outputRoot, validWranglerConfiguration),
    [],
  );
  writeFileSync(
    path.join(serverRoot, "entry.cloudflare-workers.js"),
    'console.error("JSON request error:", error); export const fetch=()=>new Response(); export const scheduled=()=>{};\n',
  );
  assert.match(
    validateCloudflareWorkerArtifact(
      outputRoot,
      validWranglerConfiguration,
    ).join("\n"),
    /logger dinámico no saneado de Qwik/,
  );
  writeFileSync(
    path.join(serverRoot, "entry.cloudflare-workers.js"),
    "export const fetch=()=>new Response(); export const scheduled=()=>{};\n",
  );
  for (const omitted of EXPECTED_STATIC_ASSET_EXCLUSIONS) {
    writeFileSync(
      path.join(outputRoot, ".assetsignore"),
      `${EXPECTED_STATIC_ASSET_EXCLUSIONS.filter((entry) => entry !== omitted).join("\n")}\n`,
    );
    assert.match(
      validateCloudflareWorkerArtifact(
        outputRoot,
        validWranglerConfiguration,
      ).join("\n"),
      /exactamente estas exclusiones/,
    );
  }
  writeFileSync(
    path.join(outputRoot, ".assetsignore"),
    `${EXPECTED_STATIC_ASSET_EXCLUSIONS.join("\n")}\nextra-private-file\n`,
  );
  assert.match(
    validateCloudflareWorkerArtifact(
      outputRoot,
      validWranglerConfiguration,
    ).join("\n"),
    /exactamente estas exclusiones/,
  );
  writeFileSync(
    path.join(outputRoot, ".assetsignore"),
    `${EXPECTED_STATIC_ASSET_EXCLUSIONS.join("\n")}\n`,
  );
  writeFileSync(
    path.join(outputRoot, "_worker.js"),
    'import {fetch,scheduled} from "../server/entry.cloudflare-workers.js"; const stale="VERCEL_ENV"; export default {fetch,scheduled};\n',
  );
  assert.match(
    validateCloudflareWorkerArtifact(
      outputRoot,
      validWranglerConfiguration,
    ).join("\n"),
    /acoplamiento de Vercel/,
  );

  writeFileSync(
    path.join(outputRoot, "_worker.js"),
    'import {fetch,scheduled} from "../server/entry.cloudflare-workers.js"; export default {fetch,scheduled};\n',
  );
  const exactFixtureSecret =
    "opaque-turnstile-value-not-matching-a-known-format";
  const exactCronSecret = "opaque-cron-value-not-matching-a-known-format";
  const knownFixtureSecret = `sb_secret_${"S".repeat(24)}`;
  writeFileSync(
    path.join(serverRoot, "chunk-with-secret.js"),
    `const a=${JSON.stringify(exactFixtureSecret)}; const b=${JSON.stringify(knownFixtureSecret)}; const c=${JSON.stringify(exactCronSecret)};\n`,
  );
  const secretErrors = validateCloudflareWorkerArtifact(
    outputRoot,
    validWranglerConfiguration,
    {
      runtimeSecrets: {
        TURNSTILE_SECRET: exactFixtureSecret,
        CRON_SECRET: exactCronSecret,
      },
    },
  );
  assert.match(secretErrors.join("\n"), /TURNSTILE_SECRET/);
  assert.match(secretErrors.join("\n"), /CRON_SECRET/);
  assert.match(secretErrors.join("\n"), /Supabase secret key/);
  assert.doesNotMatch(secretErrors.join("\n"), new RegExp(exactFixtureSecret));
  assert.doesNotMatch(secretErrors.join("\n"), new RegExp(exactCronSecret));
  assert.doesNotMatch(secretErrors.join("\n"), new RegExp(knownFixtureSecret));

  const viteLocalCronSecret =
    "opaque-vite-local-cron-secret-not-matching-a-known-format";
  const viteProductionTurnstileSecret =
    "opaque-vite-production-turnstile-secret-not-matching-a-known-format";
  writeFileSync(
    path.join(artifactFixtureRoot, ".env.local"),
    `CRON_SECRET=${viteLocalCronSecret}\n`,
  );
  writeFileSync(
    path.join(artifactFixtureRoot, ".env.production"),
    `TURNSTILE_SECRET=${viteProductionTurnstileSecret}\n`,
  );
  writeFileSync(
    path.join(serverRoot, "chunk-with-vite-env-secret.js"),
    `const cron=${JSON.stringify(viteLocalCronSecret)}; const turnstile=${JSON.stringify(viteProductionTurnstileSecret)};\n`,
  );
  const previousCronSecret = process.env.CRON_SECRET;
  const previousTurnstileSecret = process.env.TURNSTILE_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.TURNSTILE_SECRET;
  let viteLoadedEnvironment;
  try {
    viteLoadedEnvironment = loadProductionBuildEnvironment(artifactFixtureRoot);
  } finally {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
    if (previousTurnstileSecret === undefined)
      delete process.env.TURNSTILE_SECRET;
    else process.env.TURNSTILE_SECRET = previousTurnstileSecret;
  }
  const viteLoadedSecretErrors = validateCloudflareWorkerArtifact(
    outputRoot,
    validWranglerConfiguration,
    { runtimeSecrets: viteLoadedEnvironment },
  );
  assert.match(viteLoadedSecretErrors.join("\n"), /CRON_SECRET/);
  assert.match(viteLoadedSecretErrors.join("\n"), /TURNSTILE_SECRET/);
  assert.doesNotMatch(
    viteLoadedSecretErrors.join("\n"),
    new RegExp(viteLocalCronSecret),
  );
  assert.doesNotMatch(
    viteLoadedSecretErrors.join("\n"),
    new RegExp(viteProductionTurnstileSecret),
  );

  assert.match(
    validateCloudflareWorkerArtifact(outputRoot, validWranglerConfiguration, {
      runtimeSecrets: { INTERNAL_API_TOKEN: "short" },
    }).join("\n"),
    /INTERNAL_API_TOKEN.*demasiado corto/,
  );
} finally {
  rmSync(artifactFixtureRoot, { recursive: true });
}

const exactCloudflareSecrets = JSON.stringify([
  { name: "CRON_SECRET", type: "secret_text" },
  { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
  { name: "TURNSTILE_SECRET", type: "secret_text" },
]);
assert.deepEqual(validateCloudflareSecretInventory(exactCloudflareSecrets), []);
for (const invalid of [
  "",
  "{}",
  JSON.stringify([
    { name: "CRON_SECRET", type: "secret_text" },
    { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
  ]),
  JSON.stringify([
    { name: "CRON_SECRET", type: "secret_text" },
    { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
    { name: "TURNSTILE_SECRET", type: "secret_text" },
    { name: "STALE_SECRET", type: "secret_text" },
  ]),
  JSON.stringify([
    { name: "CRON_SECRET", type: "secret_text", value: "never-accepted" },
    { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
    { name: "TURNSTILE_SECRET", type: "secret_text" },
  ]),
  JSON.stringify([
    { name: "CRON_SECRET", type: "plain_text" },
    { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
    { name: "TURNSTILE_SECRET", type: "secret_text" },
  ]),
]) {
  assert.ok(validateCloudflareSecretInventory(invalid).length > 0);
}

const supabaseSecretInventory = JSON.stringify([
  { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
]);
const turnstileSecretInventory = JSON.stringify([
  { name: "SUPABASE_SECRET_KEY", type: "secret_text" },
  { name: "TURNSTILE_SECRET", type: "secret_text" },
]);
assert.deepEqual(CLOUDFLARE_SECRET_ONBOARDING_STAGES, {
  supabase: ["SUPABASE_SECRET_KEY"],
  turnstile: ["SUPABASE_SECRET_KEY", "TURNSTILE_SECRET"],
  complete: ["CRON_SECRET", "SUPABASE_SECRET_KEY", "TURNSTILE_SECRET"],
});
assert.deepEqual(
  validateCloudflareSecretInventory(supabaseSecretInventory, {
    stage: "supabase",
  }),
  [],
);
assert.deepEqual(
  validateCloudflareSecretInventory(turnstileSecretInventory, {
    stage: "turnstile",
  }),
  [],
);
for (const [stage, invalidInventories] of [
  ["supabase", ["[]", turnstileSecretInventory, exactCloudflareSecrets]],
  ["turnstile", ["[]", supabaseSecretInventory, exactCloudflareSecrets]],
  ["complete", ["[]", supabaseSecretInventory, turnstileSecretInventory]],
]) {
  for (const invalid of invalidInventories) {
    assert.ok(
      validateCloudflareSecretInventory(invalid, { stage }).length > 0,
      `La etapa ${stage} debe exigir su inventario remoto exacto.`,
    );
  }
}
assert.match(
  validateCloudflareSecretInventory(exactCloudflareSecrets, {
    stage: "arbitraria",
  }).join("\n"),
  /Etapa.*no permitida/,
);

const remoteInventoryCalls = [];
const exactRemoteInventoryRunner = (binary, arguments_, options) => {
  remoteInventoryCalls.push({ binary, arguments_, options });
  return {
    status: 0,
    signal: null,
    stdout: exactCloudflareSecrets,
    stderr: "",
  };
};
assert.deepEqual(
  queryRemoteCloudflareSecretInventory({
    root,
    runner: exactRemoteInventoryRunner,
  }),
  [],
);
assert.equal(remoteInventoryCalls.length, 1);
assert.equal(
  remoteInventoryCalls[0].binary,
  path.join(root, "node_modules", ".bin", "wrangler"),
);
assert.deepEqual(remoteInventoryCalls[0].arguments_, [
  "secret",
  "list",
  "--config",
  "wrangler.closed.jsonc",
  "--format",
  "json",
]);
assert.equal(remoteInventoryCalls[0].options.cwd, root);
assert.equal(remoteInventoryCalls[0].options.shell, false);

for (const result of [
  { status: 1, signal: null, stdout: "", stderr: "" },
  { status: 0, signal: "SIGTERM", stdout: "", stderr: "" },
  { status: 0, signal: null, stdout: exactCloudflareSecrets, stderr: "warn" },
  { status: 0, signal: null, stdout: "[]", stderr: "" },
  { status: 0, signal: null, stdout: "not-json", stderr: "" },
]) {
  assert.ok(
    queryRemoteCloudflareSecretInventory({
      root,
      runner: () => result,
    }).length > 0,
    "El inventario remoto debe fallar cerrado ante proceso u output inesperado.",
  );
}
assert.ok(
  queryRemoteCloudflareSecretInventory({
    root: ".",
    runner: exactRemoteInventoryRunner,
  }).length > 0,
);
assert.ok(
  queryRemoteCloudflareSecretInventory({
    root,
    configPath: "wrangler.jsonc",
    runner: exactRemoteInventoryRunner,
  }).length > 0,
);

const secretInventoryScript = path.join(
  root,
  "scripts/cloudflare-secret-inventory.mjs",
);
for (const [stage, input, expectedCount] of [
  ["supabase", supabaseSecretInventory, "1/3"],
  ["turnstile", turnstileSecretInventory, "2/3"],
  ["complete", exactCloudflareSecrets, "3/3"],
]) {
  const result = spawnSync(
    process.execPath,
    [secretInventoryScript, `--stage=${stage}`],
    { cwd: root, encoding: "utf8", input },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`${expectedCount} exactos`));
}
const obsoleteSecretInventoryFlag = spawnSync(
  process.execPath,
  [secretInventoryScript, "--closed-workers-dev"],
  { cwd: root, encoding: "utf8", input: exactCloudflareSecrets },
);
assert.equal(obsoleteSecretInventoryFlag.status, 1);
assert.match(obsoleteSecretInventoryFlag.stderr, /argumento no permitido/);

const blockedWithoutTurnstile = run({
  PUBLIC_TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET: "",
  TURNSTILE_HOSTNAMES: "",
});
assert.equal(blockedWithoutTurnstile.status, 1);
assert.match(blockedWithoutTurnstile.stderr, /PUBLIC_TURNSTILE_SITE_KEY/);

const dummyTurnstileKeys = run({
  PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
});
assert.equal(dummyTurnstileKeys.status, 1);
assert.match(dummyTurnstileKeys.stderr, /clave dummy/);

const turnstileTestingInProduction = run({ TURNSTILE_TESTING: "true" });
assert.equal(turnstileTestingInProduction.status, 1);
assert.match(turnstileTestingInProduction.stderr, /exclusivo del E2E local/);

const unrelatedTurnstileHostname = run({
  TURNSTILE_HOSTNAMES: "otro.agorbis.com",
});
assert.equal(unrelatedTurnstileHostname.status, 1);
assert.match(unrelatedTurnstileHostname.stderr, /PUBLIC_SITE_URL/);

const unrelatedGuardHostname = run({
  TURNSTILE_SUPABASE_GUARD_HOSTNAMES: "otro.agorbis.com",
});
assert.equal(unrelatedGuardHostname.status, 1);
assert.match(unrelatedGuardHostname.stderr, /SUPABASE_GUARD_HOSTNAMES/);

for (const [name, value] of [
  ["CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED", "false"],
  ["SUPABASE_AUTH_CAPTCHA_ENABLED", "false"],
  ["SUPABASE_AUTH_CAPTCHA_PROVIDER", "hcaptcha"],
  ["SUPABASE_AUTH_IP_FORWARDING_ENABLED", "false"],
  ["SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED", "false"],
  ["SUPABASE_AUTH_SIGNUPS_ENABLED", "false"],
  ["SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED", "false"],
  ["SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED", "false"],
  ["SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED", "true"],
  ["SUPABASE_AUTH_PHONE_AUTH_ENABLED", "true"],
  ["SUPABASE_AUTH_MIN_PASSWORD_LENGTH", "8"],
  // D101: sólo `letters_digits` es honesto. El valor anterior con símbolos, el
  // intermedio con mayúsculas, el rótulo del Dashboard y el vacío bloquean.
  ["SUPABASE_AUTH_PASSWORD_REQUIREMENTS", "lower_upper_letters_digits_symbols"],
  ["SUPABASE_AUTH_PASSWORD_REQUIREMENTS", "lower_upper_letters_digits"],
  ["SUPABASE_AUTH_PASSWORD_REQUIREMENTS", "Letters and digits"],
  ["SUPABASE_AUTH_PASSWORD_REQUIREMENTS", ""],
  ["SUPABASE_PLAN", "hobby"],
  ["SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED", "true"],
  ["SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED", "false"],
  ["SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED", "false"],
  ["SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS", "1"],
  ["SUPABASE_LEGACY_SERVICE_ROLE_DISABLED", "false"],
]) {
  const attestation = run({ [name]: value });
  assert.equal(attestation.status, 1);
  assert.match(attestation.stderr, new RegExp(name));
}

// D91: el plan de Supabase decide qué atestación de contraseñas filtradas es
// honesta. Free exige "false" y avisa en cada corrida; Pro o superior exige
// "true"; sin plan declarado el preflight falla cerrado. La corrida base sigue
// bloqueada por los gates externos, así que se mira el detalle de stderr y la
// corrida excepcional completa prueba el estado 0 con el plan Free.
const planErrorPattern =
  /✗ .*SUPABASE_(?:PLAN|AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED)/;
const freePlanWithoutLeakedProtection = run();
assert.doesNotMatch(freePlanWithoutLeakedProtection.stderr, planErrorPattern);
assert.match(freePlanWithoutLeakedProtection.stderr, /! SUPABASE_PLAN=free/);
// D101: la atestación de requisitos de contraseña acepta exactamente
// `letters_digits`. La corrida base no la objeta y el aviso de Free ya no
// promete "cuatro clases"; la corrida excepcional completa de abajo termina
// en 0 con ese valor. El valor anterior y el vacío bloquean con el mensaje
// exacto, no con uno genérico.
assert.doesNotMatch(
  freePlanWithoutLeakedProtection.stderr,
  /SUPABASE_AUTH_PASSWORD_REQUIREMENTS/,
);
assert.match(
  freePlanWithoutLeakedProtection.stderr,
  /letras y números \(D101\)/,
);
assert.doesNotMatch(freePlanWithoutLeakedProtection.stderr, /cuatro clases/);
const previousPasswordRequirements = run({
  SUPABASE_AUTH_PASSWORD_REQUIREMENTS: "lower_upper_letters_digits_symbols",
});
assert.equal(previousPasswordRequirements.status, 1);
assert.match(
  previousPasswordRequirements.stderr,
  /SUPABASE_AUTH_PASSWORD_REQUIREMENTS debe ser exactamente "letters_digits"/,
);
const missingPasswordRequirements = run({
  SUPABASE_AUTH_PASSWORD_REQUIREMENTS: "",
});
assert.equal(missingPasswordRequirements.status, 1);
assert.match(
  missingPasswordRequirements.stderr,
  /SUPABASE_AUTH_PASSWORD_REQUIREMENTS falta/,
);
const freePlanExceptional = runPreflight(
  ["--exceptional-request", completeExceptionalRequestPath],
  exceptionalEnvironment,
);
assert.equal(freePlanExceptional.status, 0, freePlanExceptional.stderr);
assert.match(freePlanExceptional.stderr, /! SUPABASE_PLAN=free/);
const proPlanWithLeakedProtection = run({
  SUPABASE_PLAN: "pro",
  SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED: "true",
});
assert.doesNotMatch(proPlanWithLeakedProtection.stderr, planErrorPattern);
assert.doesNotMatch(proPlanWithLeakedProtection.stderr, /SUPABASE_PLAN=free/);
const proPlanWithoutLeakedProtection = run({ SUPABASE_PLAN: "pro" });
assert.equal(proPlanWithoutLeakedProtection.status, 1);
assert.match(
  proPlanWithoutLeakedProtection.stderr,
  /SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED debe ser exactamente "true"/,
);
const missingPlan = run({ SUPABASE_PLAN: "" });
assert.equal(missingPlan.status, 1);
assert.match(missingPlan.stderr, /SUPABASE_PLAN falta/);

const wrongAuthSiteUrl = run({
  SUPABASE_AUTH_SITE_URL: "https://otro.agorbis.com",
});
assert.equal(wrongAuthSiteUrl.status, 1);
assert.match(wrongAuthSiteUrl.stderr, /SUPABASE_AUTH_SITE_URL/);

const trailingSlashOnMatchingOrigins = run({
  PUBLIC_SITE_URL: "https://agorbis.com/",
  SUPABASE_AUTH_SITE_URL: "https://agorbis.com/",
});
assert.equal(trailingSlashOnMatchingOrigins.status, 1);
assert.match(
  trailingSlashOnMatchingOrigins.stderr,
  /PUBLIC_SITE_URL.*wrangler\.jsonc/,
);

const coherentlyWrongProductionOrigin = run({
  PUBLIC_SITE_URL: "https://otro.agorbis.com",
  SUPABASE_AUTH_SITE_URL: "https://otro.agorbis.com",
  SUPABASE_AUTH_REDIRECT_URLS:
    "https://otro.agorbis.com/auth/callback,https://otro.agorbis.com/auth/confirm",
  TURNSTILE_HOSTNAMES: "otro.agorbis.com",
  TURNSTILE_SUPABASE_GUARD_HOSTNAMES: "otro.agorbis.com",
});
assert.equal(coherentlyWrongProductionOrigin.status, 1);
assert.match(coherentlyWrongProductionOrigin.stderr, /origen canónico/);

const wildcardAuthRedirect = run({
  SUPABASE_AUTH_REDIRECT_URLS: "https://agorbis.com/**",
});
assert.equal(wildcardAuthRedirect.status, 1);
assert.match(wildcardAuthRedirect.stderr, /SUPABASE_AUTH_REDIRECT_URLS/);

const missingAuthRedirect = run({
  SUPABASE_AUTH_REDIRECT_URLS: "https://agorbis.com/auth/callback",
});
assert.equal(missingAuthRedirect.status, 1);
assert.match(missingAuthRedirect.stderr, /SUPABASE_AUTH_REDIRECT_URLS/);

const reversedAuthRedirectOrder = runExceptional({
  SUPABASE_AUTH_REDIRECT_URLS:
    "https://agorbis.com/auth/confirm,https://agorbis.com/auth/callback",
});
assert.equal(
  reversedAuthRedirectOrder.status,
  0,
  reversedAuthRedirectOrder.stderr,
);
assert.doesNotMatch(
  reversedAuthRedirectOrder.stderr,
  /consentimiento OAuth bloqueado para Google/,
);
assert.doesNotMatch(
  reversedAuthRedirectOrder.stderr,
  /SUPABASE_AUTH_REDIRECT_URLS/,
);

for (const redirectUrls of [
  "https://agorbis.com/auth/callback,https://agorbis.com/auth/confirm,https://agorbis.com/extra",
  "https://agorbis.com/auth/callback,https://agorbis.com/auth/callback",
]) {
  const invalidRedirectSet = run({
    SUPABASE_AUTH_REDIRECT_URLS: redirectUrls,
  });
  assert.equal(invalidRedirectSet.status, 1);
  assert.match(invalidRedirectSet.stderr, /SUPABASE_AUTH_REDIRECT_URLS/);
}

const missingSecurityNotification = run({
  SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED:
    "password_changed,email_changed,identity_linked,identity_unlinked,mfa_factor_enrolled",
});
assert.equal(missingSecurityNotification.status, 1);
assert.match(
  missingSecurityNotification.stderr,
  /SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED/,
);

for (const notifications of [
  `${base.SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED},phone_changed`,
  `${base.SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED},unknown_notification`,
  "password_changed,password_changed,email_changed,identity_linked,identity_unlinked,mfa_factor_enrolled,mfa_factor_unenrolled",
]) {
  const invalidNotificationSet = run({
    SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED: notifications,
  });
  assert.equal(invalidNotificationSet.status, 1);
  assert.match(
    invalidNotificationSet.stderr,
    /SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED/,
  );
}

const missing = run({ CRON_SECRET: "" });
assert.equal(missing.status, 1);
assert.match(missing.stderr, /CRON_SECRET/);

const staleVercelPlan = run({ VERCEL_PLAN: "pro" });
assert.equal(staleVercelPlan.status, 1);
assert.match(staleVercelPlan.stderr, /ya no usa Vercel/);

const freeCloudflarePlan = run({ CLOUDFLARE_WORKERS_PLAN: "free" });
assert.equal(freeCloudflarePlan.status, 1);
assert.match(freeCloudflarePlan.stderr, /5\/5 Cron Triggers/);

const permissiveAuthEmailRate = run({
  SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR: "100",
});
assert.equal(permissiveAuthEmailRate.status, 1);
assert.match(permissiveAuthEmailRate.stderr, /Auth > Rate Limits/);

const missingControllerId = run({ PUBLIC_AAIP_CONTROLLER_ID: "" });
assert.equal(missingControllerId.status, 1);
assert.match(missingControllerId.stderr, /PUBLIC_AAIP_CONTROLLER_ID/);

const pendingControllerId = run({
  PUBLIC_AAIP_CONTROLLER_ID: "inscripción en trámite",
});
assert.equal(pendingControllerId.status, 1);
assert.match(pendingControllerId.stderr, /código público RL-/);

const missingDatabaseRegistration = run({
  AAIP_DATABASE_REGISTRATION_STATUS: "approved",
  PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS: "approved",
  PUBLIC_AAIP_DATABASE_REGISTRATION_ID: "",
});
assert.equal(missingDatabaseRegistration.status, 1);
assert.match(
  missingDatabaseRegistration.stderr,
  /PUBLIC_AAIP_DATABASE_REGISTRATION_ID/,
);

for (const invalidDatabaseRegistration of [
  "EX-2026-82087278-APN-DNPDP#AAIP",
  "RE-2026-12345678-APN-DNPDP#AAIP",
  "PV-2026-12345678-APN-DNPDP#AAIP",
  "IF-2026-12345678-APN-DNPDP#AAIP",
  "RL-2026-12345678-APN-DNPDP#AAIP",
  "AAIP-RL202681658385",
  "AAIP-EX202682087278",
  "referencia-RE20260001",
  "referencia-PV20260001",
  "referencia-IF20260001",
  "inscripción en trámite",
  "CUIT 20-00000000-0",
  "valor de prueba",
  "valor de ejemplo",
  "fake-value",
  "valor falso",
]) {
  const result = run({
    AAIP_DATABASE_REGISTRATION_STATUS: "approved",
    PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS: "approved",
    PUBLIC_AAIP_DATABASE_REGISTRATION_ID: invalidDatabaseRegistration,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no puede contener RL\/EX\/RE\/PV\/IF/);
}

const missingProcessorDestination = run({
  PUBLIC_SUPABASE_PROCESSING_LOCATION: "pendiente",
});
assert.equal(missingProcessorDestination.status, 1);
assert.match(
  missingProcessorDestination.stderr,
  /PUBLIC_SUPABASE_PROCESSING_LOCATION/,
);

const missingEnglishProcessorDestination = run({
  PUBLIC_SUPABASE_PROCESSING_LOCATION_EN: "",
});
assert.equal(missingEnglishProcessorDestination.status, 1);
assert.match(
  missingEnglishProcessorDestination.stderr,
  /PUBLIC_SUPABASE_PROCESSING_LOCATION_EN/,
);

for (const placeholder of [
  "valor de prueba",
  "valor de ejemplo",
  "fake-value",
  "valor falso",
]) {
  const placeholderDisclosure = run({
    PUBLIC_SUPABASE_PROCESSING_LOCATION: placeholder,
  });
  assert.equal(placeholderDisclosure.status, 1);
  assert.match(
    placeholderDisclosure.stderr,
    /PUBLIC_SUPABASE_PROCESSING_LOCATION.*placeholder/,
  );
}

const identicalBilingualDisclosure = run({
  PUBLIC_SUPABASE_PROCESSING_LOCATION:
    "Contenido bilingüe sin evidencia acreditada",
  PUBLIC_SUPABASE_PROCESSING_LOCATION_EN:
    "Contenido bilingüe sin evidencia acreditada",
});
assert.equal(identicalBilingualDisclosure.status, 1);
assert.match(
  identicalBilingualDisclosure.stderr,
  /PUBLIC_SUPABASE_PROCESSING_LOCATION.*textos ES\/EN distintos/,
);

const staleVercelDisclosure = run({
  PUBLIC_VERCEL_PROCESSING_LOCATION:
    "Functions regionales en iad1 y distribución mediante CDN global de Vercel.",
});
assert.equal(staleVercelDisclosure.status, 1);
assert.match(staleVercelDisclosure.stderr, /debe retirarse/);

const incompleteCloudflareDisclosure = run({
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION:
    "Red global de Cloudflare con tratamiento internacional.",
});
assert.equal(incompleteCloudflareDisclosure.status, 1);
assert.match(incompleteCloudflareDisclosure.stderr, /Cloudflare Workers/);

const singleTurnstileDisclosure = run({
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN:
    "Cloudflare global network for authoritative DNS in DNS-only mode and Turnstile signals; it does not act as a reverse proxy, CDN, or WAF.",
});
assert.equal(singleTurnstileDisclosure.status, 1);
assert.match(singleTurnstileDisclosure.stderr, /Turnstile A\/B/);

const legacyDnsOnlyDisclosure = run({
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN:
    "Cloudflare global network for authoritative DNS in DNS-only mode and two Turnstile configurations identified as A/B.",
});
assert.equal(legacyDnsOnlyDisclosure.status, 1);
assert.match(
  legacyDnsOnlyDisclosure.stderr,
  /no puede seguir diciendo DNS only/,
);

const cloudflareDisclosureWithoutHttpRuntime = run({
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION:
    "Cloudflare Workers opera en red global, brinda DNS autoritativo y Turnstile A/B.",
});
assert.equal(cloudflareDisclosureWithoutHttpRuntime.status, 1);
assert.match(cloudflareDisclosureWithoutHttpRuntime.stderr, /runtime HTTP/);

const vagueTransferSafeguards = run({
  PUBLIC_TRANSFER_SAFEGUARDS:
    "Hay seguridad suficiente para transferir los datos afuera.",
});
assert.equal(vagueTransferSafeguards.status, 1);
assert.match(vagueTransferSafeguards.stderr, /mecanismo argentino real/);

const genericDpaIsNotAnArgentineTransferBasis = run({
  PUBLIC_TRANSFER_SAFEGUARDS:
    "Los DPA de los proveedores establecen seguridad y confidencialidad para transferencias desde Argentina a destinos no adecuados.",
});
assert.equal(genericDpaIsNotAnArgentineTransferBasis.status, 1);
assert.match(genericDpaIsNotAnArgentineTransferBasis.stderr, /DPA genérico/);

const signupConsentDoesNotCoverTheFirstRequest = run({
  PUBLIC_TRANSFER_SAFEGUARDS:
    "Las transferencias desde Argentina a destinos no adecuados se basan en el consentimiento previo, expreso e informado que la persona otorga al crear su cuenta.",
});
assert.equal(signupConsentDoesNotCoverTheFirstRequest.status, 1);
assert.match(
  signupConsentDoesNotCoverTheFirstRequest.stderr,
  /no los cubre retroactivamente/,
);
assert.match(
  signupConsentDoesNotCoverTheFirstRequest.stderr,
  /lectura pública.*ingreso, recuperación, seguridad y ejercicio de derechos/,
);

const englishSignupConsentDoesNotCoverTheFirstRequest = run({
  PUBLIC_TRANSFER_SAFEGUARDS_EN:
    "Transfers from Argentina to non-adequate destinations rely on prior, express and informed consent granted during account creation.",
});
assert.equal(englishSignupConsentDoesNotCoverTheFirstRequest.status, 1);
assert.match(
  englishSignupConsentDoesNotCoverTheFirstRequest.stderr,
  /no los cubre retroactivamente/,
);

const vagueArticleTwelveReferenceIsNotConcrete = run({
  PUBLIC_TRANSFER_SAFEGUARDS:
    "Las transferencias desde Argentina se amparan en una excepción del artículo 12 de la Ley 25.326.",
});
assert.equal(vagueArticleTwelveReferenceIsNotConcrete.status, 1);
assert.match(
  vagueArticleTwelveReferenceIsNotConcrete.stderr,
  /una excepción concreta del artículo 12/,
);

const availableButNotIncorporatedModelClausesAreNotEnough = run({
  PUBLIC_TRANSFER_SAFEGUARDS:
    "Para transferencias desde Argentina, las cláusulas contractuales modelo de la AAIP están disponibles, pero todavía no fueron incorporadas a los contratos.",
});
assert.equal(availableButNotIncorporatedModelClausesAreNotEnough.status, 1);
assert.match(
  availableButNotIncorporatedModelClausesAreNotEnough.stderr,
  /efectivamente incorporadas/,
);

const local = run({ PUBLIC_SITE_URL: "http://localhost:5173" });
assert.equal(local.status, 1);
assert.match(local.stderr, /PUBLIC_SITE_URL/);

const leakedServiceKey = run({
  PUBLIC_SUPABASE_ANON_KEY: base.SUPABASE_SECRET_KEY,
});
assert.equal(leakedServiceKey.status, 1);
assert.match(leakedServiceKey.stderr, /bundle público/);

const swappedKeys = run({
  PUBLIC_SUPABASE_ANON_KEY: base.SUPABASE_SECRET_KEY,
  SUPABASE_SECRET_KEY: base.PUBLIC_SUPABASE_ANON_KEY,
});
assert.equal(swappedKeys.status, 1);
assert.match(swappedKeys.stderr, /sb_publishable_/);
assert.match(swappedKeys.stderr, /sb_secret_/);

const sameKeys = run({
  PUBLIC_SUPABASE_ANON_KEY: base.PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: base.PUBLIC_SUPABASE_ANON_KEY,
});
assert.equal(sameKeys.status, 1);
assert.match(sameKeys.stderr, /deben ser distintas/);

const legacySecret = run({
  SUPABASE_SECRET_KEY: [
    "eyJhbGciOiJIUzI1NiJ9",
    "eyJyb2xlIjoic2VydmljZV9yb2xlIn0",
    "fake-signature",
  ].join("."),
});
assert.equal(legacySecret.status, 1);
assert.match(legacySecret.stderr, /JWT legacy/);

const deprecatedName = run({
  SUPABASE_SERVICE_ROLE_KEY: base.SUPABASE_SECRET_KEY,
});
assert.equal(deprecatedName.status, 1);
assert.match(deprecatedName.stderr, /Retirá SUPABASE_SERVICE_ROLE_KEY/);

const legacyAnon = run({
  PUBLIC_SUPABASE_ANON_KEY: [
    "eyJhbGciOiJIUzI1NiJ9",
    "eyJyb2xlIjoiYW5vbiJ9",
    "fake-signature",
  ].join("."),
});
assert.equal(legacyAnon.status, 1);
assert.match(legacyAnon.stderr, /JWT legado/);

const prematureAi = run({
  OPENAI_API_KEY: "ci-server-key",
  OPENAI_SUMMARY_MODEL: "ci-model",
});
assert.equal(prematureAi.status, 1);
assert.match(prematureAi.stderr, /resúmenes de IA deben permanecer/);

const invalidGoogle = run({ PUBLIC_GOOGLE_AUTH_ENABLED: "yes" });
assert.equal(invalidGoogle.status, 1);
assert.match(invalidGoogle.stderr, /PUBLIC_GOOGLE_AUTH_ENABLED/);

const invalidFacebook = run({ PUBLIC_FACEBOOK_AUTH_ENABLED: "yes" });
assert.equal(invalidFacebook.status, 1);
assert.match(invalidFacebook.stderr, /PUBLIC_FACEBOOK_AUTH_ENABLED/);

const facebookWithoutDestinations = run({
  PUBLIC_FACEBOOK_AUTH_ENABLED: "true",
  PUBLIC_FACEBOOK_PROCESSING_LOCATION: "",
  PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN: "",
});
assert.equal(facebookWithoutDestinations.status, 1);
assert.match(
  facebookWithoutDestinations.stderr,
  /PUBLIC_FACEBOOK_PROCESSING_LOCATION/,
);
assert.match(
  facebookWithoutDestinations.stderr,
  /PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN/,
);

const googleWithoutDestination = run({
  PUBLIC_GOOGLE_AUTH_ENABLED: "true",
  PUBLIC_GOOGLE_PROCESSING_LOCATION: "",
});
assert.equal(googleWithoutDestination.status, 1);
assert.match(
  googleWithoutDestination.stderr,
  /PUBLIC_GOOGLE_PROCESSING_LOCATION/,
);

const googleWithoutEnglishDestination = run({
  PUBLIC_GOOGLE_AUTH_ENABLED: "true",
  PUBLIC_GOOGLE_PROCESSING_LOCATION_EN: "",
});
assert.equal(googleWithoutEnglishDestination.status, 1);
assert.match(
  googleWithoutEnglishDestination.stderr,
  /PUBLIC_GOOGLE_PROCESSING_LOCATION_EN/,
);

process.removeListener("exit", cleanupPreflightFixture);
cleanupPreflightFixture();
console.log("Preflight: bloqueos de producción y fallos cerrados verificados.");
