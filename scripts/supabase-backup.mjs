import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  ACL_INVENTORY_FORMAT,
  APPLICATION_ACL_SQL,
  artifactEntries,
  assertFixtureBackupIntegrity,
  assertNoPrivilegeEscalationSql,
  assertSupabaseCliVersionResult,
  assertSuccessfulCommandResult,
  BACKUP_FORMAT,
  canonicalizeCopyRowOrder,
  canonicalizePgDump,
  DEFAULT_PRIVILEGES_SQL,
  expectedSupabaseDumpStderr,
  expectedSupabaseQueryStderr,
  exportStorage,
  isPathInside,
  parseCopyDefinitions,
  parseSupabaseDbQueryOutput,
  sha256Buffer,
  sha256File,
  validateAclInventory,
  verifyBackupChecksumIndex,
  verifyBackupDirectory,
  verifyRestoredStorage,
  withSupabaseUpdateNotifierDisabled,
  writeJson,
} from "./supabase-backup-lib.mjs";
import {
  assertManagedCatalogSnapshot,
  assertManagedDataDump,
  assertManagedHistoriesAbsent,
  buildManagedDataManifest,
  DEFAULT_MANAGED_DATA_PROFILE_ID,
  getManagedDataProfile,
  managedDataDumpFlags,
  MANAGED_CATALOG_SQL,
  sha256CanonicalJson,
} from "./supabase-managed-data-policy.mjs";
import {
  assertRecoveryInventoryFile,
  RECOVERY_CONFIGURATION_FORMAT,
  RECOVERY_CONFIGURATION_PATH,
} from "./recovery-inventory.mjs";
import {
  assertApprovedProductionQuery,
  buildProductionDumpContainerInvocation,
  buildProductionDumpEnvironment,
  buildProductionPsqlContainerInvocation,
  buildProductionPsqlEnvironment,
  EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR,
  loadProductionBackupAssets,
  parseProductionDumpDryRun,
  parseProductionPsqlJson,
  productionDumpDryRunArgs,
  PRODUCTION_QUERY_POSTGRES_IMAGE,
  PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
  PRODUCTION_QUERY_POSTGRES_REPO_DIGEST,
  PRODUCTION_QUERY_PROJECT_REF,
  redactSensitiveText,
} from "./production-backup-query-policy.mjs";
import {
  ACCOUNT_IMPROVEMENTS_MIGRATION_FILES,
  CANDIDATE_MIGRATION_FILES,
  FEED_AND_INSTITUTIONAL_MIGRATION_FILES,
  TURNSTILE_INVISIBLE_MIGRATION_FILES,
  AGREEMENTS_MIGRATION_FILES,
  AGREEMENT_MODERATION_MIGRATION_FILES,
  GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES,
  GOOGLE_AUTH_CONSENT_MIGRATION_FILES,
  EXPECTED_D72_MIGRATION_FILE,
  EXPECTED_PRODUCTION_MIGRATION_IDS,
} from "./production-preflight-policy.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const productionProjectRef = "ibtvlvpxwourrxwcrfkf";
const expectedNodeMajor = 22;
const expectedSupabaseCliVersion = "2.115.0";
export const RELEASE_MIGRATION_STATE = Object.freeze({
  PRE_0060: "pre-0060",
  POST_0060: "post-0060",
  POST_0061: "post-0061",
  POST_0065: "post-0065",
  POST_0066: "post-0066",
  POST_0067: "post-0067",
  POST_0072: "post-0072",
  POST_0073: "post-0073",
  POST_0074: "post-0074",
  POST_0075: "post-0075",
  POST_0076: "post-0076",
});
export const POST_0060_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...EXPECTED_PRODUCTION_MIGRATION_IDS,
]);
export const PRE_0060_RELEASE_MIGRATION_VERSIONS = Object.freeze(
  POST_0060_RELEASE_MIGRATION_VERSIONS.slice(0, -1),
);
export const POST_0061_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0060_RELEASE_MIGRATION_VERSIONS,
  EXPECTED_D72_MIGRATION_FILE.slice(0, 4),
]);
export const POST_0065_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0061_RELEASE_MIGRATION_VERSIONS,
  ...ACCOUNT_IMPROVEMENTS_MIGRATION_FILES.map((file) => file.slice(0, 4)),
]);
export const POST_0066_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0065_RELEASE_MIGRATION_VERSIONS,
  "0066",
]);
export const POST_0067_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0066_RELEASE_MIGRATION_VERSIONS,
  "0067",
]);
// D92: Producción nueva nace con las 69 migraciones; post-0072 es el ledger
// completo y los anteriores conservan su identidad histórica.
export const POST_0072_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0067_RELEASE_MIGRATION_VERSIONS,
  "0070",
  "0071",
  "0072",
]);
// D109: 0073 publica Privacidad 2026-11-02.1. post-0072 conserva su identidad
// y valida por prefijo, igual que post-0067.
export const POST_0073_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0072_RELEASE_MIGRATION_VERSIONS,
  "0073",
]);
// D118: 0074 crea los acuerdos entre comunidades. post-0073 conserva su
// identidad y valida por prefijo, igual que post-0072.
export const POST_0074_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0073_RELEASE_MIGRATION_VERSIONS,
  "0074",
]);
// D120: 0075 suma la moderación de acuerdos. post-0074 conserva su identidad
// y valida por prefijo, igual que los anteriores.
export const POST_0075_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0074_RELEASE_MIGRATION_VERSIONS,
  "0075",
]);
// D127: 0076 carga el nivel 4 de Argentina. post-0075 conserva su identidad
// y valida por prefijo, igual que los anteriores.
export const POST_0076_RELEASE_MIGRATION_VERSIONS = Object.freeze([
  ...POST_0075_RELEASE_MIGRATION_VERSIONS,
  "0076",
]);
// Crear un backup admite el estado previo y posterior de este rollout. Los
// estados más antiguos siguen siendo restaurables, pero no se recolectan.
export const BACKUP_CREATION_MIGRATION_STATES = Object.freeze([
  RELEASE_MIGRATION_STATE.POST_0061,
  RELEASE_MIGRATION_STATE.POST_0065,
  RELEASE_MIGRATION_STATE.POST_0066,
  RELEASE_MIGRATION_STATE.POST_0067,
  RELEASE_MIGRATION_STATE.POST_0072,
  RELEASE_MIGRATION_STATE.POST_0073,
  RELEASE_MIGRATION_STATE.POST_0074,
  RELEASE_MIGRATION_STATE.POST_0075,
  RELEASE_MIGRATION_STATE.POST_0076,
]);
const expected0060MigrationFile =
  "0060_activate_pending_external_evidence_legal_notices.sql";
const expected0061MigrationFile = EXPECTED_D72_MIGRATION_FILE;
const migrationLedgerSql = `select coalesce(jsonb_agg(jsonb_build_object(
  'version', version,
  'name', name
) order by version collate "C"), '[]'::jsonb)::text as payload
from supabase_migrations.schema_migrations`;
const approvedProductionQuerySha256 = new Set(
  [
    migrationLedgerSql,
    MANAGED_CATALOG_SQL,
    DEFAULT_PRIVILEGES_SQL,
    APPLICATION_ACL_SQL,
  ].map((sql) => sha256Buffer(Buffer.from(sql))),
);

function sameSequence(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function parseReleaseMigrationFiles(migrationFiles) {
  if (!Array.isArray(migrationFiles)) {
    throw new Error("El inventario local de migraciones es inválido.");
  }
  const entries = migrationFiles.map((file) => {
    if (typeof file !== "string") {
      throw new Error(`Nombre local de migración inválido: ${String(file)}.`);
    }
    const match = file.match(/^(\d{4})_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Nombre local de migración inválido: ${file}.`);
    }
    return Object.freeze({ file, version: match[1], name: match[2] });
  });
  const versions = entries.map(({ version }) => version);
  const isPost0061 = sameSequence(
    versions,
    POST_0061_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0065 = sameSequence(
    versions,
    POST_0065_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0066 = sameSequence(
    versions,
    POST_0066_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0067 = sameSequence(
    versions,
    POST_0067_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0072 = sameSequence(
    versions,
    POST_0072_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0073 = sameSequence(
    versions,
    POST_0073_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0074 = sameSequence(
    versions,
    POST_0074_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0075 = sameSequence(
    versions,
    POST_0075_RELEASE_MIGRATION_VERSIONS,
  );
  const isPost0076 = sameSequence(
    versions,
    POST_0076_RELEASE_MIGRATION_VERSIONS,
  );
  const exactFiles = [
    expected0060MigrationFile,
    expected0061MigrationFile,
    ...(isPost0065 ? ACCOUNT_IMPROVEMENTS_MIGRATION_FILES : []),
    ...(isPost0066 ? GOOGLE_AUTH_CONSENT_MIGRATION_FILES : []),
    ...(isPost0067 ? GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES : []),
    ...(isPost0072
      ? [
          ...GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES,
          ...FEED_AND_INSTITUTIONAL_MIGRATION_FILES,
        ]
      : []),
    ...(isPost0073
      ? [
          ...GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES,
          ...FEED_AND_INSTITUTIONAL_MIGRATION_FILES,
          ...TURNSTILE_INVISIBLE_MIGRATION_FILES,
        ]
      : []),
    ...(isPost0074
      ? [
          ...GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES,
          ...FEED_AND_INSTITUTIONAL_MIGRATION_FILES,
          ...TURNSTILE_INVISIBLE_MIGRATION_FILES,
          ...AGREEMENTS_MIGRATION_FILES,
        ]
      : []),
    ...(isPost0075
      ? [
          ...GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES,
          ...FEED_AND_INSTITUTIONAL_MIGRATION_FILES,
          ...TURNSTILE_INVISIBLE_MIGRATION_FILES,
          ...AGREEMENTS_MIGRATION_FILES,
          ...AGREEMENT_MODERATION_MIGRATION_FILES,
        ]
      : []),
    ...(isPost0076 ? CANDIDATE_MIGRATION_FILES : []),
  ];
  if (
    (!isPost0061 &&
      !isPost0065 &&
      !isPost0066 &&
      !isPost0067 &&
      !isPost0072 &&
      !isPost0073 &&
      !isPost0074 &&
      !isPost0075 &&
      !isPost0076) ||
    !exactFiles.every((file) => migrationFiles.includes(file))
  ) {
    throw new Error(
      "El repositorio debe contener exactamente 0001–0058 + 0060 + 0061, ese inventario completo más 0062–0065, más 0062–0066, más 0062–0067, más 0062–0067 y 0070–0072, más 0062–0067 y 0070–0073, más 0062–0067 y 0070–0074, más 0062–0067 y 0070–0075 o más 0062–0067 y 0070–0076 con sus nombres aprobados; 0059 y cualquier otra migración quedan rechazadas.",
    );
  }
  return Object.freeze(entries);
}

export function assertReleaseMigrationFileInventory(migrationFiles) {
  return parseReleaseMigrationFiles(migrationFiles).map(({ file }) => file);
}

export function releaseMigrationStateFromManifest(database) {
  const releaseStates = [
    [RELEASE_MIGRATION_STATE.PRE_0060, PRE_0060_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0060, POST_0060_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0061, POST_0061_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0065, POST_0065_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0066, POST_0066_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0067, POST_0067_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0072, POST_0072_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0073, POST_0073_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0074, POST_0074_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0075, POST_0075_RELEASE_MIGRATION_VERSIONS],
    [RELEASE_MIGRATION_STATE.POST_0076, POST_0076_RELEASE_MIGRATION_VERSIONS],
  ];
  const match = releaseStates.find(
    ([, versions]) =>
      database?.migrationCount === versions.length &&
      database?.migrationHead === versions.at(-1),
  );
  if (!match) {
    throw new Error(
      "El manifiesto debe declarar exactamente el ledger pre-0060 (0001–0058), post-0060 (0001–0058 + 0060), post-0061 (0001–0058 + 0060 + 0061), post-0065 (0001–0058 + 0060–0065), post-0066 (0001–0058 + 0060–0066), post-0067 (0001–0058 + 0060–0067) post-0072 (0001–0058 + 0060–0067 + 0070–0072), post-0073 (0001–0058 + 0060–0067 + 0070–0073), post-0074 (0001–0058 + 0060–0067 + 0070–0074), post-0075 (0001–0058 + 0060–0067 + 0070–0075) o post-0076 (0001–0058 + 0060–0067 + 0070–0076).",
    );
  }
  const [releaseState, versions] = match;
  return Object.freeze({ releaseState, versions });
}

export function assertReleaseMigrationLedger(
  ledger,
  migrationFiles,
  {
    allowedStates = [
      RELEASE_MIGRATION_STATE.PRE_0060,
      RELEASE_MIGRATION_STATE.POST_0060,
      RELEASE_MIGRATION_STATE.POST_0061,
      RELEASE_MIGRATION_STATE.POST_0065,
      RELEASE_MIGRATION_STATE.POST_0066,
      RELEASE_MIGRATION_STATE.POST_0067,
      RELEASE_MIGRATION_STATE.POST_0072,
      RELEASE_MIGRATION_STATE.POST_0073,
      RELEASE_MIGRATION_STATE.POST_0074,
      RELEASE_MIGRATION_STATE.POST_0075,
      RELEASE_MIGRATION_STATE.POST_0076,
    ],
  } = {},
) {
  const repositoryEntries = parseReleaseMigrationFiles(migrationFiles);
  if (
    !Array.isArray(ledger) ||
    !Array.isArray(allowedStates) ||
    allowedStates.length === 0 ||
    allowedStates.length !== new Set(allowedStates).size ||
    allowedStates.some(
      (state) => !Object.values(RELEASE_MIGRATION_STATE).includes(state),
    )
  ) {
    throw new Error(
      "El ledger o los estados de release permitidos son inválidos.",
    );
  }
  if (
    ledger.some(
      (entry) =>
        !entry ||
        typeof entry.version !== "string" ||
        typeof entry.name !== "string" ||
        !sameSequence(Object.keys(entry).sort(), ["name", "version"]),
    )
  ) {
    throw new Error(
      "El ledger de la DB no coincide exactamente con el release versionado.",
    );
  }
  const normalized = ledger.map(({ version, name }) => ({ version, name }));
  const repositoryExpected = repositoryEntries.map(({ version, name }) => ({
    version,
    name,
  }));
  const pre0060Expected = repositoryExpected.slice(
    0,
    PRE_0060_RELEASE_MIGRATION_VERSIONS.length,
  );
  const post0060Expected = repositoryExpected.slice(
    0,
    POST_0060_RELEASE_MIGRATION_VERSIONS.length,
  );
  const post0061Expected = repositoryExpected.slice(
    0,
    POST_0061_RELEASE_MIGRATION_VERSIONS.length,
  );
  const expectedByState = [
    [RELEASE_MIGRATION_STATE.PRE_0060, pre0060Expected],
    [RELEASE_MIGRATION_STATE.POST_0060, post0060Expected],
    [RELEASE_MIGRATION_STATE.POST_0061, post0061Expected],
    // Un checkout histórico no puede validar un ledger futuro por prefijo.
    ...(repositoryExpected.length >= POST_0065_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0065,
            repositoryExpected.slice(
              0,
              POST_0065_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length >= POST_0066_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0066,
            repositoryExpected.slice(
              0,
              POST_0066_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length >= POST_0067_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0067,
            repositoryExpected.slice(
              0,
              POST_0067_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length >= POST_0072_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0072,
            repositoryExpected.slice(
              0,
              POST_0072_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length >= POST_0073_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0073,
            repositoryExpected.slice(
              0,
              POST_0073_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length >= POST_0074_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0074,
            repositoryExpected.slice(
              0,
              POST_0074_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length >= POST_0075_RELEASE_MIGRATION_VERSIONS.length
      ? [
          [
            RELEASE_MIGRATION_STATE.POST_0075,
            repositoryExpected.slice(
              0,
              POST_0075_RELEASE_MIGRATION_VERSIONS.length,
            ),
          ],
        ]
      : []),
    ...(repositoryExpected.length ===
    POST_0076_RELEASE_MIGRATION_VERSIONS.length
      ? [[RELEASE_MIGRATION_STATE.POST_0076, repositoryExpected]]
      : []),
  ];
  const releaseState = expectedByState.find(([, expected]) =>
    sameSequence(normalized, expected),
  )?.[0];
  if (!releaseState || !allowedStates.includes(releaseState)) {
    throw new Error(
      "El ledger de la DB no coincide exactamente con un estado de release permitido; 0059 y cualquier otra migración quedan rechazadas.",
    );
  }
  return Object.freeze({
    count: normalized.length,
    head: normalized.at(-1).version,
    releaseState,
    sha256: sha256Buffer(Buffer.from(JSON.stringify(normalized))),
  });
}

function usage() {
  console.error(`Uso:
  node scripts/supabase-backup.mjs --local --output-dir /ruta/nueva [--with-drill-fixture]
  node scripts/supabase-backup.mjs --project-ref ${productionProjectRef} --output-dir /ruta/cifrada/nueva [--managed-profile ID]

Producción requiere SUPABASE_DB_PASSWORD y
AGORBIS_BACKUP_SUPABASE_SECRET_KEY en el entorno.`);
}

function parseArguments(argv) {
  const options = { local: false, fixture: false };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--") continue;
    if (current === "--local") options.local = true;
    else if (current === "--with-drill-fixture") options.fixture = true;
    else if (current === "--output-dir") options.outputDir = argv[++index];
    else if (current === "--project-ref") options.projectRef = argv[++index];
    else if (current === "--managed-profile") {
      if (options.managedProfile !== undefined) {
        throw new Error("--managed-profile no admite valores repetidos.");
      }
      const profileId = argv[++index];
      if (!profileId || profileId.startsWith("--")) {
        throw new Error("Falta un identificador para --managed-profile.");
      }
      options.managedProfile = getManagedDataProfile(profileId).id;
    } else throw new Error(`Argumento desconocido: ${current}`);
  }
  if (!options.outputDir || options.local === Boolean(options.projectRef)) {
    usage();
    throw new Error(
      "Elegí exactamente --local o --project-ref y un --output-dir.",
    );
  }
  if (options.fixture && !options.local) {
    throw new Error(
      "El fixture de drill está prohibido fuera de Supabase local.",
    );
  }
  if (options.projectRef && options.projectRef !== productionProjectRef) {
    throw new Error(
      `El único project ref cloud permitido es ${productionProjectRef}.`,
    );
  }
  if (
    options.local &&
    options.managedProfile &&
    options.managedProfile !== DEFAULT_MANAGED_DATA_PROFILE_ID
  ) {
    throw new Error("El backup local exige el perfil administrado local.");
  }
  return options;
}

function redact(text, secrets) {
  return redactSensitiveText(text, secrets);
}

function run(
  command,
  args,
  { env = process.env, secrets = [], input, expectedStderr } = {},
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assertSuccessfulCommandResult(
    { ...result, stderr: redact(result.stderr, secrets) },
    command,
    expectedStderr,
  );
  return result.stdout;
}

function runToNewFile(
  command,
  args,
  outputPath,
  { env = process.env, secrets = [], expectedStderr = "" } = {},
) {
  const descriptor = openSync(outputPath, "wx", 0o600);
  let result;
  try {
    result = spawnSync(command, args, {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", descriptor, "pipe"],
    });
  } finally {
    closeSync(descriptor);
  }
  assertSuccessfulCommandResult(
    { ...result, stderr: redact(result.stderr, secrets) },
    command,
    expectedStderr,
  );
}

function operationalChildEnvironment() {
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
  ]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function supabaseCliEnvironment(options) {
  const env = withSupabaseUpdateNotifierDisabled(operationalChildEnvironment());
  if (!options.local) {
    env.SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
    if (process.env.SUPABASE_ACCESS_TOKEN) {
      env.SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
    }
  }
  return env;
}

function assertToolchain() {
  if (Number(process.versions.node.split(".")[0]) !== expectedNodeMajor) {
    throw new Error(
      `El backup exige Node 22.x; runtime actual ${process.version}.`,
    );
  }
  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const installed = JSON.parse(
    readFileSync(
      path.join(root, "node_modules", "supabase", "package.json"),
      "utf8",
    ),
  );
  const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  if (
    packageJson.engines?.node !== "22.x" ||
    packageJson.devDependencies?.supabase !== expectedSupabaseCliVersion ||
    installed.version !== expectedSupabaseCliVersion ||
    !/\n      supabase:\n        specifier: 2\.115\.0\n        version: 2\.115\.0\n/.test(
      lockfile,
    )
  ) {
    throw new Error(
      "package.json, pnpm-lock.yaml o node_modules no fijan Supabase CLI exactamente en 2.115.0.",
    );
  }
  const cliVersion = assertSupabaseCliVersionResult(
    spawnSync(
      path.join(root, "node_modules", ".bin", "supabase"),
      ["--version"],
      {
        cwd: root,
        env: supabaseCliEnvironment({ local: true }),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    ),
    expectedSupabaseCliVersion,
  );
  return { node: process.version, supabaseCli: cliVersion };
}

function queryLocalJson(sql) {
  const output = run(
    "docker",
    [
      "exec",
      "supabase_db_agorbis",
      "psql",
      "-X",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { env: operationalChildEnvironment() },
  ).trim();
  if (!output) throw new Error("La consulta local no devolvió JSON.");
  return JSON.parse(output);
}

function pinnedProductionQueryImageId() {
  const childEnv = operationalChildEnvironment();
  const postgresVersion = readFileSync(
    path.join(root, "supabase", ".temp", "postgres-version"),
    "utf8",
  ).trim();
  if (
    !/^\d+\.\d+\.\d+\.\d+$/.test(postgresVersion) ||
    PRODUCTION_QUERY_POSTGRES_IMAGE !==
      `public.ecr.aws/supabase/postgres:${postgresVersion}`
  ) {
    throw new Error("El pin local de Postgres no coincide con el auditado.");
  }
  const labels = run(
    "docker",
    [
      "inspect",
      "supabase_db_agorbis",
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
    ],
    { env: childEnv, expectedStderr: "" },
  ).trim();
  if (labels !== `agorbis|${root}`) {
    throw new Error(
      "El runner psql no pudo atribuir supabase_db_agorbis a este workspace.",
    );
  }
  const configuredImage = run(
    "docker",
    ["inspect", "supabase_db_agorbis", "--format", "{{.Config.Image}}"],
    { env: childEnv, expectedStderr: "" },
  ).trim();
  if (configuredImage !== PRODUCTION_QUERY_POSTGRES_IMAGE) {
    throw new Error("El tag Postgres efectivo no coincide con el auditado.");
  }
  const imageId = run(
    "docker",
    ["inspect", "supabase_db_agorbis", "--format", "{{.Image}}"],
    { env: childEnv, expectedStderr: "" },
  ).trim();
  if (imageId !== PRODUCTION_QUERY_POSTGRES_IMAGE_ID) {
    throw new Error(
      "El image ID Postgres efectivo no coincide con el auditado.",
    );
  }
  const installedImageId = run(
    "docker",
    ["image", "inspect", imageId, "--format", "{{.Id}}"],
    { env: childEnv, expectedStderr: "" },
  ).trim();
  if (installedImageId !== imageId) {
    throw new Error("La imagen Postgres fijada no coincide con Docker local.");
  }
  let repoDigests;
  try {
    repoDigests = JSON.parse(
      run(
        "docker",
        ["image", "inspect", imageId, "--format", "{{json .RepoDigests}}"],
        { env: childEnv, expectedStderr: "" },
      ),
    );
  } catch {
    throw new Error("Docker no devolvió RepoDigests válidos para Postgres.");
  }
  if (
    JSON.stringify(repoDigests) !==
    JSON.stringify([PRODUCTION_QUERY_POSTGRES_REPO_DIGEST])
  ) {
    throw new Error("El RepoDigest Postgres no coincide con el auditado.");
  }
  return imageId;
}

function prepareProductionQueryContext(options, env, secrets) {
  if (
    options.local ||
    options.projectRef !== productionProjectRef ||
    options.projectRef !== PRODUCTION_QUERY_PROJECT_REF
  ) {
    throw new Error("El contexto de consultas productivas no está autorizado.");
  }
  const stdout = run(
    path.join(root, "node_modules", ".bin", "supabase"),
    productionDumpDryRunArgs(options.projectRef),
    {
      env,
      secrets,
      expectedStderr: EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR,
    },
  );
  const connection = parseProductionDumpDryRun(stdout, {
    expectedPassword: process.env.SUPABASE_DB_PASSWORD,
    projectRef: options.projectRef,
  });
  return Object.freeze({
    projectRef: options.projectRef,
    connection,
    imageId: pinnedProductionQueryImageId(),
    assets: loadProductionBackupAssets(root),
  });
}

function queryDatabaseJson(options, sql, env, secrets, productionContext) {
  if (options.local) {
    const stdout = run(
      path.join(root, "node_modules", ".bin", "supabase"),
      ["db", "query", "--local", "--output-format", "json", sql],
      {
        env,
        secrets,
        expectedStderr: expectedSupabaseQueryStderr("local"),
      },
    );
    return parseSupabaseDbQueryOutput(stdout);
  }
  if (
    productionContext?.projectRef !== productionProjectRef ||
    productionContext.projectRef !== options.projectRef
  ) {
    throw new Error("Falta el contexto psql productivo validado.");
  }
  assertApprovedProductionQuery(sql, approvedProductionQuerySha256);
  const invocation = buildProductionPsqlContainerInvocation({
    connection: productionContext.connection,
    imageId: productionContext.imageId,
    sql,
    assets: productionContext.assets,
  });
  const password = process.env.SUPABASE_DB_PASSWORD;
  const queryEnv = buildProductionPsqlEnvironment(
    operationalChildEnvironment(),
    productionContext.connection,
    password,
    productionContext.assets,
  );
  const stdout = run(invocation.command, invocation.args, {
    env: queryEnv,
    secrets: [...secrets, password],
    expectedStderr: "",
  });
  return parseProductionPsqlJson(stdout);
}

function queryManagedCatalog(options, env, secrets, productionContext) {
  return queryDatabaseJson(
    options,
    MANAGED_CATALOG_SQL,
    env,
    secrets,
    productionContext,
  );
}

function productionDumpStderr(circularTables) {
  let expected = "";
  for (const table of circularTables) {
    expected +=
      "pg_dump: warning: there are circular foreign-key constraints on this table:\n";
    expected += `pg_dump: detail: ${table}\n`;
    expected +=
      "pg_dump: hint: You might not be able to restore the dump without using --disable-triggers or temporarily dropping the constraints.\n";
    expected +=
      "pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.\n";
  }
  return expected;
}

function dump(
  options,
  sourceFlags,
  outputPath,
  extraFlags,
  env,
  secrets,
  productionContext,
) {
  const kind = extraFlags.includes("--role-only")
    ? "roles"
    : extraFlags.includes("--data-only")
      ? "data"
      : "schemas";
  const circularTables =
    kind === "data" && !extraFlags.includes("--schema")
      ? ["communities", "project_comments"]
      : [];
  if (options.local) {
    run(
      path.join(root, "node_modules", ".bin", "supabase"),
      ["db", "dump", ...sourceFlags, "--file", outputPath, ...extraFlags],
      {
        env,
        secrets,
        expectedStderr: expectedSupabaseDumpStderr(
          "local",
          kind,
          outputPath,
          circularTables,
        ),
      },
    );
    return;
  }
  if (
    JSON.stringify(sourceFlags) !==
      JSON.stringify(["--project-ref", productionProjectRef]) ||
    productionContext?.projectRef !== productionProjectRef ||
    productionContext.projectRef !== options.projectRef
  ) {
    throw new Error(
      "El dump productivo no tiene un contexto explícito válido.",
    );
  }
  const invocation = buildProductionDumpContainerInvocation({
    connection: productionContext.connection,
    imageId: productionContext.imageId,
    extraFlags,
    assets: productionContext.assets,
  });
  const password = process.env.SUPABASE_DB_PASSWORD;
  const dumpEnv = buildProductionDumpEnvironment(
    operationalChildEnvironment(),
    productionContext.connection,
    password,
    productionContext.assets,
    extraFlags,
  );
  runToNewFile(invocation.command, invocation.args, outputPath, {
    env: dumpEnv,
    secrets: [...secrets, password],
    expectedStderr: productionDumpStderr(circularTables),
  });
}

function dumpCanonicalSha256(filePath, { sortCopyRows = false } = {}) {
  let canonical = canonicalizePgDump(readFileSync(filePath, "utf8"));
  if (sortCopyRows) canonical = canonicalizeCopyRowOrder(canonical);
  return sha256Buffer(Buffer.from(canonical));
}

function localStatus() {
  const stdout = run(
    path.join(root, "node_modules", ".bin", "supabase"),
    ["status", "--output", "json"],
    { env: supabaseCliEnvironment({ local: true }) },
  );
  const status = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const api = new URL(status.API_URL);
  const db = new URL(status.DB_URL);
  if (
    !["127.0.0.1", "localhost", "::1"].includes(api.hostname) ||
    !["127.0.0.1", "localhost", "::1"].includes(db.hostname)
  ) {
    throw new Error("Supabase local devolvió endpoints que no son loopback.");
  }
  const labels = run(
    "docker",
    [
      "inspect",
      "supabase_db_agorbis",
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
    ],
    { env: operationalChildEnvironment() },
  ).trim();
  if (labels !== `agorbis|${root}`) {
    throw new Error(
      `El contenedor local no pertenece a este workspace (${labels || "sin labels"}).`,
    );
  }
  return {
    apiUrl: status.API_URL,
    dbUrl: status.DB_URL,
    secretKey: status.SECRET_KEY || status.SERVICE_ROLE_KEY,
  };
}

export function prepareConfiguration(outputRoot) {
  const destination = path.join(outputRoot, "configuration");
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  cpSync(
    path.join(root, "supabase", "templates"),
    path.join(destination, "auth-email-templates"),
    {
      recursive: true,
    },
  );
  cpSync(
    path.join(root, "supabase", "config.toml"),
    path.join(destination, "supabase-local-config.toml"),
  );
  for (const file of [
    "wrangler.jsonc",
    "wrangler.closed.jsonc",
    "wrangler.traffic.jsonc",
    "wrangler.crons-open.jsonc",
    "wrangler.crons-closed.jsonc",
    "wrangler.open-recovery.jsonc",
  ]) {
    cpSync(path.join(root, file), path.join(destination, file));
  }
  const recoveryInventorySource = path.join(root, RECOVERY_CONFIGURATION_PATH);
  const recoveryInventorySummary = assertRecoveryInventoryFile(
    recoveryInventorySource,
  );
  const recoveryInventoryDestination = path.join(
    destination,
    "configuration-inventory.v1.json",
  );
  cpSync(recoveryInventorySource, recoveryInventoryDestination);
  cpSync(
    path.join(root, "docs", "RECOVERY_INVENTORY.md"),
    path.join(destination, "RECOVERY_INVENTORY.md"),
  );
  const templates = readdirSync(
    path.join(destination, "auth-email-templates"),
  ).filter((name) => name.endsWith(".html"));
  if (templates.length !== 11) {
    throw new Error(
      `Se esperaban 11 plantillas Auth y se encontraron ${templates.length}.`,
    );
  }
  return {
    inventory: {
      ...recoveryInventorySummary,
      format: RECOVERY_CONFIGURATION_FORMAT,
      path: "configuration/configuration-inventory.v1.json",
      sha256: sha256File(recoveryInventoryDestination),
    },
  };
}

function hardenBackupPermissions(current) {
  const metadata = lstatSync(current);
  if (metadata.isSymbolicLink()) {
    throw new Error(`El backup no admite symlinks: ${current}`);
  }
  if (metadata.isDirectory()) {
    chmodSync(current, 0o700);
    for (const entry of readdirSync(current)) {
      hardenBackupPermissions(path.join(current, entry));
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new Error(`El backup no admite archivos especiales: ${current}`);
  }
  chmodSync(current, 0o600);
}

async function createFixture(client) {
  const bucket = `agorbis-restore-fixture-${randomBytes(6).toString("hex")}`;
  const object = "sentinel.bin";
  const body = Buffer.from(
    `Agorbis restore drill ${randomBytes(32).toString("hex")}\n`,
  );
  const { error: bucketError } = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 1024,
    allowedMimeTypes: ["application/octet-stream"],
  });
  if (bucketError)
    throw new Error(
      `No se pudo crear el fixture local: ${bucketError.message}`,
    );
  const { error: uploadError } = await client.storage
    .from(bucket)
    .upload(object, body, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    await client.storage.deleteBucket(bucket);
    throw new Error(
      `No se pudo cargar el fixture local: ${uploadError.message}`,
    );
  }
  const ownerId = randomUUID();
  const ownerUpdate = run(
    "docker",
    [
      "exec",
      "supabase_db_agorbis",
      "psql",
      "-X",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      `update storage.objects set owner='${ownerId}'::uuid, owner_id='${ownerId}' where bucket_id='${bucket}' and name='${object}' returning owner_id`,
    ],
    { env: operationalChildEnvironment() },
  );
  if (ownerUpdate.trim() !== ownerId) {
    await client.storage.from(bucket).remove([object]);
    await client.storage.deleteBucket(bucket);
    throw new Error("No se pudo fijar el owner de prueba del fixture local.");
  }
  const bucketLiteral = bucket.replaceAll("'", "''");
  const objectLiteral = object.replaceAll("'", "''");
  const source = queryLocalJson(`select coalesce((
    select jsonb_build_object(
      'id', id,
      'bucket', bucket_id,
      'object', name,
      'path', bucket_id || '/' || name,
      'owner', owner,
      'ownerId', owner_id,
      'userMetadata', user_metadata
    )
    from storage.objects
    where bucket_id = '${bucketLiteral}' and name = '${objectLiteral}'
  ), 'null'::jsonb)::text`);
  if (
    !source ||
    source.bucket !== bucket ||
    source.object !== object ||
    source.path !== `${bucket}/${object}` ||
    source.owner !== ownerId ||
    source.ownerId !== ownerId ||
    !/^[a-f0-9-]{36}$/i.test(source.id ?? "") ||
    !source.userMetadata ||
    typeof source.userMetadata !== "object" ||
    Array.isArray(source.userMetadata)
  ) {
    await client.storage.from(bucket).remove([object]);
    await client.storage.deleteBucket(bucket);
    throw new Error(
      "No se pudo capturar la metadata fuente del fixture local.",
    );
  }
  return source;
}

async function removeFixture(client, fixture) {
  if (!fixture) return;
  if (!fixture.bucket.startsWith("agorbis-restore-fixture-")) {
    throw new Error(
      "La guarda impidió borrar un bucket que no pertenece al drill.",
    );
  }
  const { error: removeError } = await client.storage
    .from(fixture.bucket)
    .remove([fixture.object]);
  if (removeError)
    throw new Error(`No se pudo retirar el fixture: ${removeError.message}`);
  const { error: bucketError } = await client.storage.deleteBucket(
    fixture.bucket,
  );
  if (bucketError)
    throw new Error(
      `No se pudo retirar el bucket fixture: ${bucketError.message}`,
    );
}

async function main() {
  const toolchain = assertToolchain();
  const options = parseArguments(process.argv.slice(2));
  const managedProfile = getManagedDataProfile(
    options.managedProfile ?? DEFAULT_MANAGED_DATA_PROFILE_ID,
  );
  const outputRoot = path.resolve(options.outputDir);
  if (isPathInside(root, outputRoot) || outputRoot === root) {
    throw new Error(
      "El backup debe vivir fuera del repositorio, incluso si Git lo ignora.",
    );
  }
  if (existsSync(outputRoot)) {
    throw new Error(
      "--output-dir debe ser una ruta nueva; no se sobrescriben backups.",
    );
  }
  mkdirSync(outputRoot, { recursive: false, mode: 0o700 });

  const startedAt = new Date().toISOString();
  let fixture;
  let client;
  let completed = false;
  try {
    const local = options.local ? localStatus() : null;
    const apiUrl = options.local
      ? local.apiUrl
      : process.env.AGORBIS_BACKUP_SUPABASE_URL;
    const secretKey = options.local
      ? local.secretKey
      : process.env.AGORBIS_BACKUP_SUPABASE_SECRET_KEY;
    if (!apiUrl || !secretKey) {
      throw new Error(
        "Faltan la URL o la secret key de sólo lectura operativa del backup.",
      );
    }
    if (!options.local) {
      const parsed = new URL(apiUrl);
      if (parsed.origin !== `https://${productionProjectRef}.supabase.co`) {
        throw new Error(
          "La URL cloud no coincide con el project ref de Producción.",
        );
      }
      if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secretKey)) {
        throw new Error(
          "Producción requiere una sb_secret_ moderna server-only.",
        );
      }
      if (!process.env.SUPABASE_DB_PASSWORD) {
        throw new Error(
          "SUPABASE_DB_PASSWORD falta en el entorno del runner de backup.",
        );
      }
    }

    const cliEnv = supabaseCliEnvironment(options);
    const secrets = [
      secretKey,
      process.env.SUPABASE_DB_PASSWORD,
      process.env.SUPABASE_ACCESS_TOKEN,
    ];
    const childEnv = operationalChildEnvironment();
    const commit = run("git", ["rev-parse", "HEAD"], {
      env: childEnv,
    }).trim();
    const dirty =
      run("git", ["status", "--porcelain"], { env: childEnv }).trim().length >
      0;
    if (!options.local && dirty) {
      throw new Error(
        "El backup de Producción exige un release commit limpio y recuperable.",
      );
    }
    const productionQueryContext = options.local
      ? null
      : prepareProductionQueryContext(options, cliEnv, secrets);
    const migrationFiles = readdirSync(
      path.join(root, "supabase", "migrations"),
    )
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const migrationLedgerBefore = queryDatabaseJson(
      options,
      migrationLedgerSql,
      cliEnv,
      secrets,
      productionQueryContext,
    );
    const migrationLedgerSummary = assertReleaseMigrationLedger(
      migrationLedgerBefore,
      migrationFiles,
      { allowedStates: BACKUP_CREATION_MIGRATION_STATES },
    );
    const managedCatalogBefore = queryManagedCatalog(
      options,
      cliEnv,
      secrets,
      productionQueryContext,
    );
    const managedPreflight = assertManagedCatalogSnapshot(
      managedCatalogBefore,
      "preflight pre-backup",
      managedProfile,
    );
    const aclInventoryBefore = {
      format: ACL_INVENTORY_FORMAT,
      defaultPrivileges: queryDatabaseJson(
        options,
        DEFAULT_PRIVILEGES_SQL,
        cliEnv,
        secrets,
        productionQueryContext,
      ),
      applicationAcl: queryDatabaseJson(
        options,
        APPLICATION_ACL_SQL,
        cliEnv,
        secrets,
        productionQueryContext,
      ),
    };
    const aclInventorySummary = validateAclInventory(aclInventoryBefore);

    client = createClient(apiUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    if (options.fixture) fixture = await createFixture(client);

    const databaseRoot = path.join(outputRoot, "database");
    mkdirSync(databaseRoot, { recursive: true, mode: 0o700 });
    const sourceFlags = options.local
      ? ["--local"]
      : ["--project-ref", options.projectRef];
    dump(
      options,
      sourceFlags,
      path.join(databaseRoot, "roles.sql"),
      ["--role-only"],
      cliEnv,
      secrets,
      productionQueryContext,
    );
    dump(
      options,
      sourceFlags,
      path.join(databaseRoot, "schema.sql"),
      [],
      cliEnv,
      secrets,
      productionQueryContext,
    );
    dump(
      options,
      sourceFlags,
      path.join(databaseRoot, "data.sql"),
      managedDataDumpFlags(),
      cliEnv,
      secrets,
      productionQueryContext,
    );
    dump(
      options,
      sourceFlags,
      path.join(databaseRoot, "migration-history-schema.sql"),
      ["--schema", "supabase_migrations"],
      cliEnv,
      secrets,
      productionQueryContext,
    );

    const dataPath = path.join(databaseRoot, "data.sql");
    const dataSql = readFileSync(dataPath, "utf8");
    assertManagedHistoriesAbsent(dataSql, "database/data.sql");
    assertNoPrivilegeEscalationSql(dataSql, "database/data.sql");
    const dataDefinitions = parseCopyDefinitions(dataSql);
    const managedCopyInventory = assertManagedDataDump(
      dataDefinitions,
      managedCatalogBefore,
      "database/data.sql",
      managedProfile,
    );
    const managedCatalogMidpoint = queryManagedCatalog(
      options,
      cliEnv,
      secrets,
      productionQueryContext,
    );
    assertManagedCatalogSnapshot(
      managedCatalogMidpoint,
      "preflight post-dump",
      managedProfile,
    );
    if (
      sha256CanonicalJson(managedCatalogMidpoint) !==
      sha256CanonicalJson(managedCatalogBefore)
    ) {
      throw new Error(
        "El catálogo administrado cambió entre los gates pre y post-dump.",
      );
    }
    const aclInventoryAfter = {
      format: ACL_INVENTORY_FORMAT,
      defaultPrivileges: queryDatabaseJson(
        options,
        DEFAULT_PRIVILEGES_SQL,
        cliEnv,
        secrets,
        productionQueryContext,
      ),
      applicationAcl: queryDatabaseJson(
        options,
        APPLICATION_ACL_SQL,
        cliEnv,
        secrets,
        productionQueryContext,
      ),
    };
    validateAclInventory(aclInventoryAfter);
    if (
      JSON.stringify(aclInventoryAfter) !== JSON.stringify(aclInventoryBefore)
    ) {
      throw new Error(
        "El inventario ACL cambió entre los gates pre y post-dump.",
      );
    }
    const aclInventoryPath = path.join(databaseRoot, "acl-inventory.json");
    writeJson(aclInventoryPath, aclInventoryAfter);
    dump(
      options,
      sourceFlags,
      path.join(databaseRoot, "migration-history-data.sql"),
      ["--data-only", "--use-copy", "--schema", "supabase_migrations"],
      cliEnv,
      secrets,
      productionQueryContext,
    );
    dump(
      options,
      sourceFlags,
      path.join(databaseRoot, "managed-schema-reference.sql"),
      ["--schema", "auth,storage"],
      cliEnv,
      secrets,
      productionQueryContext,
    );

    const databaseSnapshotCapturedAt = new Date().toISOString();
    const storage = await exportStorage(client, outputRoot);
    const sourceStoragePostflight = await verifyRestoredStorage(
      client,
      storage,
    );
    const postflightRoot = path.join(databaseRoot, ".consistency-postflight");
    mkdirSync(postflightRoot, { recursive: false, mode: 0o700 });
    const dumpSnapshots = {};
    const consistencyDumps = [
      {
        label: "roles",
        file: "roles.sql",
        flags: ["--role-only"],
        sortCopyRows: false,
      },
      { label: "schema", file: "schema.sql", flags: [], sortCopyRows: false },
      {
        label: "data",
        file: "data.sql",
        flags: managedDataDumpFlags(),
        sortCopyRows: true,
      },
      {
        label: "migrationHistorySchema",
        file: "migration-history-schema.sql",
        flags: ["--schema", "supabase_migrations"],
        sortCopyRows: false,
      },
      {
        label: "migrationHistoryData",
        file: "migration-history-data.sql",
        flags: ["--data-only", "--use-copy", "--schema", "supabase_migrations"],
        sortCopyRows: true,
      },
      {
        label: "managedSchemaReference",
        file: "managed-schema-reference.sql",
        flags: ["--schema", "auth,storage"],
        sortCopyRows: false,
      },
    ];
    for (const specification of consistencyDumps) {
      const initialPath = path.join(databaseRoot, specification.file);
      const postflightPath = path.join(postflightRoot, specification.file);
      dump(
        options,
        sourceFlags,
        postflightPath,
        specification.flags,
        cliEnv,
        secrets,
        productionQueryContext,
      );
      const initialSha256 = dumpCanonicalSha256(initialPath, specification);
      const postflightSha256 = dumpCanonicalSha256(
        postflightPath,
        specification,
      );
      if (postflightSha256 !== initialSha256) {
        throw new Error(
          `La DB cambió durante la ventana DB+Storage (${specification.label}): before=${initialSha256}, after=${postflightSha256}.`,
        );
      }
      dumpSnapshots[specification.label] = {
        initialSha256,
        postflightSha256,
      };
    }
    const managedCatalogFinal = queryManagedCatalog(
      options,
      cliEnv,
      secrets,
      productionQueryContext,
    );
    const managedPostflight = assertManagedCatalogSnapshot(
      managedCatalogFinal,
      "preflight final post-Storage",
      managedProfile,
    );
    if (
      sha256CanonicalJson(managedCatalogFinal) !==
      sha256CanonicalJson(managedCatalogBefore)
    ) {
      throw new Error(
        "El catálogo administrado cambió durante la ventana DB+Storage.",
      );
    }
    const aclInventoryFinal = {
      format: ACL_INVENTORY_FORMAT,
      defaultPrivileges: queryDatabaseJson(
        options,
        DEFAULT_PRIVILEGES_SQL,
        cliEnv,
        secrets,
        productionQueryContext,
      ),
      applicationAcl: queryDatabaseJson(
        options,
        APPLICATION_ACL_SQL,
        cliEnv,
        secrets,
        productionQueryContext,
      ),
    };
    validateAclInventory(aclInventoryFinal);
    if (
      JSON.stringify(aclInventoryFinal) !== JSON.stringify(aclInventoryBefore)
    ) {
      throw new Error(
        "El inventario ACL cambió durante la ventana DB+Storage.",
      );
    }
    const migrationLedgerFinal = queryDatabaseJson(
      options,
      migrationLedgerSql,
      cliEnv,
      secrets,
      productionQueryContext,
    );
    const finalMigrationLedgerSummary = assertReleaseMigrationLedger(
      migrationLedgerFinal,
      migrationFiles,
      { allowedStates: [migrationLedgerSummary.releaseState] },
    );
    if (finalMigrationLedgerSummary.sha256 !== migrationLedgerSummary.sha256) {
      throw new Error(
        "El ledger de migraciones cambió durante la ventana DB+Storage.",
      );
    }
    const postflightDatabaseCapturedAt = new Date().toISOString();
    rmSync(postflightRoot, { recursive: true, force: false });
    writeJson(
      path.join(outputRoot, "storage", "buckets.json"),
      storage.buckets,
    );
    const configuration = prepareConfiguration(outputRoot);
    hardenBackupPermissions(outputRoot);

    const managedReference = path.join(
      databaseRoot,
      "managed-schema-reference.sql",
    );
    const managedSql = readFileSync(managedReference, "utf8");
    const managedData = buildManagedDataManifest(
      managedCatalogFinal,
      managedProfile,
    );
    let fixtureManifest = null;
    if (fixture) {
      const storedFixture = storage.objects.find(
        (object) =>
          object.bucket === fixture.bucket && object.name === fixture.object,
      );
      if (!storedFixture) {
        throw new Error("Storage no exportó el blob fixture esperado.");
      }
      fixtureManifest = {
        bucket: fixture.bucket,
        object: fixture.object,
        path: fixture.path,
        id: fixture.id,
        ownerId: fixture.ownerId,
        userMetadata: fixture.userMetadata,
        bytes: storedFixture.bytes,
        sha256: storedFixture.sha256,
      };
    }
    const manifest = {
      format: BACKUP_FORMAT,
      backupId: `agorbis-${startedAt.replaceAll(/[:.]/g, "-")}`,
      startedAt,
      completedAt: new Date().toISOString(),
      source: {
        mode: options.local ? "local" : "production",
        projectRef: options.local ? "agorbis" : options.projectRef,
        apiOrigin: new URL(apiUrl).origin,
      },
      repository: { commit, dirty },
      configuration,
      database: {
        migrationCount: migrationLedgerSummary.count,
        migrationHead: migrationLedgerSummary.head,
        dataExcludes: managedData.dataExcludes,
        managedDataPolicy: {
          policyVersion: managedData.policyVersion,
          ...(managedData.profileId
            ? { profileId: managedData.profileId }
            : {}),
          inventoryTableCount: managedData.inventoryTableCount,
          includedCopyTableCount: managedData.includedCopyTableCount,
          expectedAuthCopyCount: managedData.expectedAuthCopyCount,
          expectedStorageCopyCount: managedData.expectedStorageCopyCount,
          inventorySha256: managedData.inventorySha256,
          blockSha256: managedData.blockSha256,
        },
        storageBlobsRestoredSeparately: true,
        managedSchemaReferenceSha256: sha256File(managedReference),
        managedTriggerCount: (
          managedSql.match(/CREATE OR REPLACE TRIGGER/g) ?? []
        ).length,
        managedPolicyCount: (managedSql.match(/CREATE POLICY/g) ?? []).length,
        aclInventory: {
          format: aclInventorySummary.format,
          path: "database/acl-inventory.json",
          sha256: sha256File(aclInventoryPath),
          defaultPrivilegeEntries: aclInventorySummary.defaultPrivilegeEntries,
          applicationAclEntries: aclInventorySummary.applicationAclEntries,
          defaultPrivilegesSha256: aclInventorySummary.defaultPrivilegesSha256,
          applicationAclSha256: aclInventorySummary.applicationAclSha256,
        },
        consistencyWindow: {
          dataCanonicalSha256: dumpSnapshots.data.initialSha256,
          postflightDataCanonicalSha256: dumpSnapshots.data.postflightSha256,
          databaseStable: true,
          storageReverifiedThroughOfficialApi: true,
          storageBucketsReverified: sourceStoragePostflight.bucketCount,
          storageObjectsReverified: sourceStoragePostflight.objectCount,
          initialDatabaseCapturedAt: databaseSnapshotCapturedAt,
          postflightDatabaseCapturedAt,
          dumpSnapshots,
          managedCatalogCanonicalSha256:
            sha256CanonicalJson(managedCatalogBefore),
          postflightManagedCatalogCanonicalSha256:
            sha256CanonicalJson(managedCatalogFinal),
          aclInventoryCanonicalSha256: sha256CanonicalJson(aclInventoryBefore),
          postflightAclInventoryCanonicalSha256:
            sha256CanonicalJson(aclInventoryFinal),
          migrationLedgerSha256: migrationLedgerSummary.sha256,
          postflightMigrationLedgerSha256: finalMigrationLedgerSummary.sha256,
        },
      },
      storage,
      fixture: fixtureManifest,
      artifacts: artifactEntries(outputRoot, [
        "backup-manifest.json",
        "SHA256SUMS.backup",
      ]),
    };
    writeJson(path.join(outputRoot, "backup-manifest.json"), manifest);
    const checksumEntries = artifactEntries(outputRoot, ["SHA256SUMS.backup"]);
    writeFileSync(
      path.join(outputRoot, "SHA256SUMS.backup"),
      `${checksumEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`,
      { mode: 0o600 },
    );
    hardenBackupPermissions(outputRoot);
    const verifiedManifest = verifyBackupDirectory(outputRoot);
    const checksumIndex = verifyBackupChecksumIndex(
      outputRoot,
      verifiedManifest,
    );
    const fixtureVerification = fixture
      ? assertFixtureBackupIntegrity(
          dataDefinitions,
          verifiedManifest,
          outputRoot,
        )
      : null;
    completed = true;
    console.log(
      JSON.stringify({
        ok: true,
        outputDir: outputRoot,
        migrationCount: manifest.database.migrationCount,
        migrationReleaseState: migrationLedgerSummary.releaseState,
        buckets: storage.buckets.length,
        objects: storage.objects.length,
        artifacts: manifest.artifacts.length,
        toolchain,
        managedPreflight: {
          inventorySha256: managedPreflight.inventorySha256,
          tables: managedPreflight.tables.length,
          included: managedPreflight.includedTables,
          excluded: managedPreflight.excludedTables,
        },
        managedPostflight: {
          inventorySha256: managedPostflight.inventorySha256,
        },
        managedCopyInventory,
        checksumIndex,
        fixtureVerification: fixtureVerification
          ? {
              path: fixtureVerification.path,
              bytes: fixtureVerification.bytes,
              sha256: fixtureVerification.sha256,
              idPreserved: true,
              ownerIdPreserved: true,
              userMetadataSha256: fixtureVerification.userMetadataSha256,
            }
          : null,
      }),
    );
  } finally {
    await removeFixture(client, fixture);
    if (!completed && existsSync(outputRoot)) {
      rmSync(outputRoot, { recursive: true, force: false });
    }
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === scriptPath;

if (isMain) {
  process.umask(0o077);
  main().catch((error) => {
    console.error(`Backup Agorbis: BLOQUEADO — ${error.message}`);
    process.exitCode = 1;
  });
}
