import { randomBytes } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  ACL_INVENTORY_FORMAT,
  APPLICATION_ACL_SQL,
  assertFixtureBackupIntegrity,
  assertLocalRestoreManagedDataProfile,
  assertLoopbackUrl,
  assertMigrationHistorySchemaSql,
  assertNoPrivilegeEscalationSql,
  assertSupabaseCliVersionResult,
  BACKUP_FORMAT,
  buildPostSchemaApplicationAclSql,
  buildOwnerAclMaterializationSql,
  buildPreSchemaDefaultPrivilegesSql,
  canonicalizeCopyRowOrder,
  canonicalizePgDump,
  decodeCopyTextValue,
  DEFAULT_PRIVILEGES_SQL,
  parseCopyDefinitions,
  parseCopyCounts,
  restoreStorage,
  sha256Buffer,
  sha256File,
  verifyBackupDirectory,
  verifyRestoredStorage,
  validateAclInventory,
  withSupabaseUpdateNotifierDisabled,
} from "./supabase-backup-lib.mjs";
import {
  assertManagedCatalogSnapshot,
  assertManagedDataDump,
  assertManagedHistoriesAbsent,
  EXPECTED_MANAGED_DATA_TABLES,
  managedDataDumpFlags,
  MANAGED_CATALOG_SQL,
  sha256CanonicalJson,
} from "./supabase-managed-data-policy.mjs";
import {
  assertManagedLintParity,
  databaseLintArgs,
  evaluateApplicationLint,
  evaluateManagedLint,
  parseDatabaseLintOutput,
} from "./supabase-lint-policy.mjs";
import {
  assertStorageMetadataDifferencesAreRegenerable,
  buildRestoreTriggerSequenceSetvalSql,
  classifyRestoreBackupSource,
  compareBackupDataStructure,
  compareRestoredDataAfterManagedServices,
  parseRestoreTriggerSequenceState,
  RESTORE_TRIGGER_PROBE_SEQUENCE,
} from "./supabase-restore-source-policy.mjs";
import {
  EXPECTED_STORAGE_MIGRATIONS_SHA256,
  storageMigrationIdentitySha256,
} from "./supabase-managed-readiness-policy.mjs";
import {
  SUPABASE_VERSION_PIN_FILES,
  SUPABASE_VERSION_PINS,
  verifyMaterializedSupabaseVersionPins,
} from "./supabase-version-pins-policy.mjs";
import {
  assertReleaseMigrationFileInventory,
  releaseMigrationStateFromManifest,
} from "./supabase-backup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceContainer = "supabase_db_agorbis";
const drillStartedAt = process.hrtime.bigint();
const phaseTimings = [];
let activePhase;
const expectedNodeMajor = 22;
const expectedSupabaseCliVersion = "2.115.0";
const expectedApplicationTriggerMigrationSha256 =
  "c374e4e024d24ff13608d962af1e5853beb2a64caaca8bdd8359a2fb5b848a67";
const expectedMigrationHistorySchemaSha256 =
  "dcb3e0cf0a2720c65e6211b0b63f93f68202bdf119af12c85782afb3e244cf24";
const expectedDefaultPrivilegesSha256 =
  "f4360145711dd7b0dce9906b230447fd5e68e145c9a060e0434d6571119ea2fa";
const expectedApplicationAclSha256 =
  "3be1fa22a5352afa50c4f2e5ce9e7706ac548bdc2a9310555dcf4a87cc16f0e6";
const expectedStorageMigrationsSha256 = EXPECTED_STORAGE_MIGRATIONS_SHA256;
const versionPinFiles = SUPABASE_VERSION_PIN_FILES;
const expectedVersionPins = SUPABASE_VERSION_PINS;
const expectedImages = {
  db: {
    tag: "public.ecr.aws/supabase/postgres:17.6.1.155",
    digest:
      "sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b",
  },
  storage: {
    tag: "public.ecr.aws/supabase/storage-api:v1.70.7",
    digest:
      "sha256:a28f297ca9e74dfbe444e964a4497b017f9d9cf8b07145a4098797118f406ee8",
  },
  auth: {
    tag: "public.ecr.aws/supabase/gotrue:v2.195.0",
    digest:
      "sha256:362659ca70eaa75ba05bbaf963caa84c1c5afe5e8fbf0777e17b830dd5f0f60a",
  },
  realtime: {
    tag: "public.ecr.aws/supabase/realtime:v2.129.0",
    digest:
      "sha256:48ee05253213f014006a20bb34d0639f936b36a78e1972ec16b1985ac951d917",
  },
  rest: {
    tag: "public.ecr.aws/supabase/postgrest:v14.15",
    digest:
      "sha256:2f8e7b656f09db697a8875177694b417b35cb76c21370de07fc54e711e902326",
  },
  kong: {
    tag: "public.ecr.aws/supabase/kong:2.8.1",
    digest:
      "sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d",
  },
};
const managedHistoryTables = [
  "auth.schema_migrations",
  "storage.migrations",
  "realtime.schema_migrations",
  "_realtime.schema_migrations",
  "supabase_functions.migrations",
];
const expectedTemplateNames = [
  "confirmation.html",
  "email_change.html",
  "email_changed.html",
  "identity_linked.html",
  "identity_unlinked.html",
  "magic_link.html",
  "mfa_factor_enrolled.html",
  "mfa_factor_unenrolled.html",
  "password_changed.html",
  "reauthentication.html",
  "recovery.html",
];

function closeActivePhase(endedAt = process.hrtime.bigint()) {
  if (!activePhase) return;
  const durationNanoseconds = endedAt - activePhase.startedAt;
  const durationMilliseconds = Number(durationNanoseconds) / 1_000_000;
  phaseTimings.push({
    name: activePhase.name,
    startedOffsetNanoseconds: (
      activePhase.startedAt - drillStartedAt
    ).toString(),
    endedOffsetNanoseconds: (endedAt - drillStartedAt).toString(),
    durationNanoseconds: durationNanoseconds.toString(),
    durationMilliseconds: Number(durationMilliseconds.toFixed(3)),
    durationSeconds: Number((durationMilliseconds / 1000).toFixed(3)),
  });
  activePhase = undefined;
}

function beginPhase(name) {
  const boundary =
    phaseTimings.length === 0 && !activePhase
      ? drillStartedAt
      : process.hrtime.bigint();
  closeActivePhase(boundary);
  activePhase = { name, startedAt: boundary };
}

function finishPhaseTimings(endedAt) {
  closeActivePhase(endedAt);
  const totalNanoseconds = endedAt - drillStartedAt;
  const summedNanoseconds = phaseTimings.reduce(
    (total, phase) => total + BigInt(phase.durationNanoseconds),
    0n,
  );
  if (summedNanoseconds !== totalNanoseconds) {
    throw new Error(
      `El cronometraje por fases no cubre exactamente el drill: fases=${summedNanoseconds}, total=${totalNanoseconds}.`,
    );
  }
  return phaseTimings.map((phase) => ({ ...phase }));
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--backup-dir") options.backupDir = argv[++index];
    else if (argv[index] === "--confirm-local-only") options.confirmed = true;
    else if (argv[index] === "--confirm-production-backup") {
      options.productionConfirmed = true;
    } else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!options.backupDir || !options.confirmed) {
    throw new Error(
      "Uso: node scripts/supabase-restore-drill.mjs --backup-dir /ruta --confirm-local-only [--confirm-production-backup]",
    );
  }
  return options;
}

function run(
  command,
  args,
  { input, allowFailure = false, env = process.env } = {},
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} falló (${result.status}): ${result.stderr.trim()}`,
    );
  }
  return result;
}

function runDatabaseLintScope(workdir, label, scope) {
  const result = run("pnpm", databaseLintArgs(scope, workdir), {
    allowFailure: true,
  });
  const payload = parseDatabaseLintOutput(
    result.stdout,
    result.status,
    `${label} db lint ${scope}`,
  );
  return scope === "application"
    ? evaluateApplicationLint(payload, result.status, `${label} public/private`)
    : evaluateManagedLint(payload, result.status, `${label} auth/storage`);
}

function lintDatabase(workdir, label) {
  return {
    application: runDatabaseLintScope(workdir, label, "application"),
    managed: runDatabaseLintScope(workdir, label, "managed"),
  };
}

function assertToolchain() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor !== expectedNodeMajor) {
    throw new Error(
      `El restore drill exige Node 22.x; runtime actual ${process.version}.`,
    );
  }

  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const installedPackage = JSON.parse(
    readFileSync(
      path.join(root, "node_modules", "supabase", "package.json"),
      "utf8",
    ),
  );
  const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  if (
    packageJson.engines?.node !== "22.x" ||
    packageJson.devDependencies?.supabase !== expectedSupabaseCliVersion ||
    installedPackage.version !== expectedSupabaseCliVersion ||
    !/\n      supabase:\n        specifier: 2\.115\.0\n        version: 2\.115\.0\n/.test(
      lockfile,
    )
  ) {
    throw new Error(
      "package.json, pnpm-lock.yaml o el paquete instalado no fijan Supabase CLI exactamente en 2.115.0.",
    );
  }
  const cliVersion = assertSupabaseCliVersionResult(
    spawnSync(
      path.join(root, "node_modules", ".bin", "supabase"),
      ["--version"],
      {
        cwd: root,
        env: withSupabaseUpdateNotifierDisabled(process.env),
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    ),
    expectedSupabaseCliVersion,
  );
  const dockerVersion = run("docker", [
    "version",
    "--format",
    "{{.Server.Version}}",
  ]).stdout.trim();
  const dockerMajor = Number(dockerVersion.split(".")[0]);
  if (!Number.isInteger(dockerMajor) || dockerMajor < 28) {
    throw new Error(
      `Docker Engine >=28 es obligatorio para garantizar aislamiento de puertos loopback; versión ${dockerVersion || "desconocida"}.`,
    );
  }
  return {
    node: process.version,
    nodeExecutable: process.execPath,
    supabaseCli: cliVersion,
    dockerEngine: dockerVersion,
  };
}

function readSourceVersionPins() {
  const sourceTemp = path.join(root, "supabase", ".temp");
  return Object.fromEntries(
    versionPinFiles.map((name) => {
      const filePath = path.join(sourceTemp, name);
      const stat = lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`El pin ${name} no es un archivo regular.`);
      }
      const raw = readFileSync(filePath);
      const value = raw.toString("utf8").trim();
      if (value !== expectedVersionPins[name]) {
        throw new Error(
          `Pin ${name} inesperado: ${value || "vacío"}; esperado ${expectedVersionPins[name]}.`,
        );
      }
      return [name, { raw, value, sha256: sha256Buffer(raw) }];
    }),
  );
}

function writeTargetVersionPins(workdir, pins) {
  const targetTemp = path.join(workdir, "supabase", ".temp");
  mkdirSync(targetTemp, { recursive: true, mode: 0o700 });
  for (const name of versionPinFiles) {
    writeFileSync(path.join(targetTemp, name), pins[name].raw, { mode: 0o600 });
  }
  verifyMaterializedSupabaseVersionPins(workdir);
  const targetFiles = readdirSync(targetTemp).sort();
  const expectedFiles = [...versionPinFiles].sort();
  if (JSON.stringify(targetFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `El target .temp debe contener únicamente los cinco pins permitidos; contiene ${targetFiles.join(", ")}.`,
    );
  }
  for (const name of versionPinFiles) {
    const targetPath = path.join(targetTemp, name);
    const stat = lstatSync(targetPath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      sha256File(targetPath) !== pins[name].sha256
    ) {
      throw new Error(`El pin target ${name} no coincide byte a byte.`);
    }
  }
}

function assertBackupChecksumIndex(backupRoot, manifest) {
  const expectedFiles = [
    "SHA256SUMS.backup",
    "backup-manifest.json",
    ...manifest.artifacts.map((artifact) => artifact.path),
  ].sort();
  const actualFiles = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile())
        actualFiles.push(path.relative(backupRoot, absolute));
      else
        throw new Error(`El backup contiene un archivo especial: ${absolute}.`);
    }
  };
  walk(backupRoot);
  actualFiles.sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      "El backup contiene archivos no inventariados o le faltan artefactos del manifiesto.",
    );
  }

  const checksumLines = readFileSync(
    path.join(backupRoot, "SHA256SUMS.backup"),
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const checksumEntries = checksumLines.map((line) => {
    const match = line.match(/^([a-f0-9]{64})  ([^\0]+)$/);
    if (!match)
      throw new Error("SHA256SUMS.backup contiene una línea inválida.");
    return { sha256: match[1], relative: match[2] };
  });
  const expectedChecksumFiles = [
    "backup-manifest.json",
    ...manifest.artifacts.map((artifact) => artifact.path),
  ].sort();
  if (
    JSON.stringify(checksumEntries.map((entry) => entry.relative).sort()) !==
    JSON.stringify(expectedChecksumFiles)
  ) {
    throw new Error(
      "SHA256SUMS.backup no cubre exactamente el manifiesto y sus artefactos.",
    );
  }
  for (const entry of checksumEntries) {
    const absolute = path.resolve(backupRoot, entry.relative);
    const relative = path.relative(backupRoot, absolute);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      sha256File(absolute) !== entry.sha256
    ) {
      throw new Error(`SHA256SUMS.backup falló para ${entry.relative}.`);
    }
  }

  const requiredArtifacts = [
    "database/roles.sql",
    "database/schema.sql",
    "database/data.sql",
    "database/migration-history-data.sql",
    "database/migration-history-schema.sql",
    "database/managed-schema-reference.sql",
    "configuration/RECOVERY_INVENTORY.md",
    "configuration/supabase-local-config.toml",
    ...expectedTemplateNames.map(
      (name) => `configuration/auth-email-templates/${name}`,
    ),
  ];
  const artifactPaths = new Set(
    manifest.artifacts.map((artifact) => artifact.path),
  );
  for (const required of requiredArtifacts) {
    if (!artifactPaths.has(required)) {
      throw new Error(
        `El artefacto consumido ${required} no está en el manifiesto.`,
      );
    }
  }
  return { files: actualFiles.length, checksums: checksumEntries.length };
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function allocatePorts(count) {
  const result = new Set();
  while (result.size < count) result.add(await freePort());
  return [...result];
}

function writeTargetConfig(workdir, projectId, ports, authTemplateConfig) {
  const supabaseRoot = path.join(workdir, "supabase");
  mkdirSync(path.join(supabaseRoot, "migrations"), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(
    path.join(supabaseRoot, "config.toml"),
    `project_id = "${projectId}"

[api]
enabled = true
port = ${ports.api}
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${ports.db}
shadow_port = ${ports.shadow}
major_version = 17

[db.seed]
enabled = false

[db.pooler]
enabled = false

[realtime]
enabled = true

[studio]
enabled = false

[local_smtp]
enabled = false

[storage]
enabled = true
file_size_limit = "5MiB"

[auth]
enabled = true
site_url = "http://127.0.0.1:${ports.site}"
enable_signup = false

${authTemplateConfig}

[analytics]
enabled = false
`,
    { mode: 0o600 },
  );
}

function restoreConfigurationArtifacts(backupRoot, workdir, manifest) {
  const configurationRoot = path.join(backupRoot, "configuration");
  const templateRoot = path.join(configurationRoot, "auth-email-templates");
  const templateNames = readdirSync(templateRoot)
    .filter((name) => name.endsWith(".html"))
    .sort();
  if (JSON.stringify(templateNames) !== JSON.stringify(expectedTemplateNames)) {
    throw new Error(
      `El backup no contiene exactamente las 11 plantillas Auth esperadas: ${templateNames.join(", ")}.`,
    );
  }

  const recoveredRoot = path.join(workdir, "recovered-configuration");
  cpSync(configurationRoot, recoveredRoot, { recursive: true });
  const activeTemplateRoot = path.join(workdir, "supabase", "templates");
  mkdirSync(activeTemplateRoot, { recursive: true, mode: 0o700 });
  cpSync(templateRoot, activeTemplateRoot, { recursive: true });

  const configurationArtifacts = manifest.artifacts.filter((artifact) =>
    artifact.path.startsWith("configuration/"),
  );
  for (const artifact of configurationArtifacts) {
    const relative = artifact.path.slice("configuration/".length);
    const recovered = path.join(recoveredRoot, relative);
    if (
      statSync(recovered).size !== artifact.bytes ||
      sha256File(recovered) !== artifact.sha256
    ) {
      throw new Error(
        `El artefacto recuperable ${artifact.path} difiere después de copiarlo.`,
      );
    }
  }
  for (const templateName of templateNames) {
    if (
      sha256File(path.join(activeTemplateRoot, templateName)) !==
      sha256File(path.join(templateRoot, templateName))
    ) {
      throw new Error(
        `La plantilla activa ${templateName} difiere de su backup.`,
      );
    }
  }

  const localConfig = readFileSync(
    path.join(configurationRoot, "supabase-local-config.toml"),
    "utf8",
  );
  const templateBlock = localConfig.match(
    /\[auth\.email\.template\.confirmation\][\s\S]*?(?=\n\[auth\.external\.)/,
  )?.[0];
  if (!templateBlock) {
    throw new Error(
      "El backup no contiene el bloque de configuración de plantillas Auth.",
    );
  }
  const configuredTemplates = [
    ...templateBlock.matchAll(
      /content_path = "\.\/supabase\/templates\/([^"/]+\.html)"/g,
    ),
  ]
    .map((match) => match[1])
    .sort();
  if (
    JSON.stringify(configuredTemplates) !==
    JSON.stringify(expectedTemplateNames)
  ) {
    throw new Error(
      "El config recuperado no referencia exactamente las 11 plantillas Auth.",
    );
  }

  return {
    authTemplateConfig: templateBlock.trim(),
    configurationInventory: manifest.configuration?.inventory
      ? {
          format: manifest.configuration.inventory.format,
          humanInputCount: manifest.configuration.inventory.humanInputCount,
          readiness: manifest.configuration.inventory.readiness,
          sha256: manifest.configuration.inventory.sha256,
        }
      : null,
    configurationArtifactCount: configurationArtifacts.length,
    inventorySha256: sha256File(
      path.join(recoveredRoot, "RECOVERY_INVENTORY.md"),
    ),
    templateCount: templateNames.length,
    templateSha256: Object.fromEntries(
      templateNames.map((name) => [
        name,
        sha256File(path.join(activeTemplateRoot, name)),
      ]),
    ),
  };
}

function parseStatus(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("Supabase status no devolvió JSON.");
  return JSON.parse(stdout.slice(start));
}

function applySql(container, sql, label, username = "postgres") {
  if (label === "roles.sql" && username !== "supabase_admin") {
    throw new Error("roles.sql sólo puede ejecutarse como supabase_admin.");
  }
  if (label !== "roles.sql" && username === "supabase_admin") {
    throw new Error(
      `supabase_admin está prohibido para ${label}; sólo puede ejecutar roles.sql.`,
    );
  }
  const result = run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "--single-transaction",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      username,
      "--dbname",
      "postgres",
    ],
    { input: sql },
  );
  if (result.stderr && /ERROR|FATAL|PANIC/.test(result.stderr)) {
    throw new Error(`${label} emitió un error de PostgreSQL.`);
  }
}

function sqlIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function queryTableCounts(container, expectedCounts) {
  const clauses = [...expectedCounts.keys()].map((qualified) => {
    const separator = qualified.indexOf(".");
    const schema = qualified.slice(0, separator);
    const table = qualified.slice(separator + 1);
    const literal = qualified.replaceAll("'", "''");
    return `select '${literal}' as table_name, count(*)::bigint as row_count from ${sqlIdentifier(schema)}.${sqlIdentifier(table)}`;
  });
  if (clauses.length === 0)
    throw new Error("data.sql no contiene bloques COPY.");
  const result = run("docker", [
    "exec",
    container,
    "psql",
    "-X",
    "-A",
    "-t",
    "-F",
    "|",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    clauses.join(" union all "),
  ]);
  return new Map(
    result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.lastIndexOf("|");
        return [line.slice(0, separator), Number(line.slice(separator + 1))];
      }),
  );
}

function assertNoManagedHistoryRestore(sqlFiles, dataDefinitions, historySql) {
  for (const [label, sql] of Object.entries(sqlFiles)) {
    const normalized = sql.replaceAll('"', "").toLowerCase();
    for (const table of managedHistoryTables) {
      if (normalized.includes(table)) {
        throw new Error(
          `${label} referencia el historial administrado prohibido ${table}.`,
        );
      }
    }
  }

  const forbiddenCopy = dataDefinitions.find(
    (definition) =>
      [
        "auth",
        "storage",
        "realtime",
        "_realtime",
        "supabase_functions",
      ].includes(definition.schema) && /migration/i.test(definition.table),
  );
  if (forbiddenCopy) {
    throw new Error(`COPY administrado prohibido: ${forbiddenCopy.qualified}.`);
  }
  const authDefinitions = dataDefinitions.filter(
    (definition) => definition.schema === "auth",
  );
  const storageDefinitions = dataDefinitions.filter(
    (definition) => definition.schema === "storage",
  );
  const expectedAuthTables = EXPECTED_MANAGED_DATA_TABLES.filter(
    ({ table, excluded }) => table.startsWith("auth.") && !excluded,
  )
    .map(({ table }) => table)
    .sort();
  const expectedStorageTables = EXPECTED_MANAGED_DATA_TABLES.filter(
    ({ table, excluded }) => table.startsWith("storage.") && !excluded,
  )
    .map(({ table }) => table)
    .sort();
  const actualAuthTables = authDefinitions
    .map(({ qualified }) => qualified)
    .sort();
  const actualStorageTables = storageDefinitions
    .map(({ qualified }) => qualified)
    .sort();
  if (
    JSON.stringify(actualAuthTables) !== JSON.stringify(expectedAuthTables) ||
    JSON.stringify(actualStorageTables) !==
      JSON.stringify(expectedStorageTables)
  ) {
    throw new Error(
      `Se esperaban exactamente 22 COPY Auth y 7 COPY Storage; se obtuvieron ${authDefinitions.length} y ${storageDefinitions.length}.`,
    );
  }

  const historyDefinitions = parseCopyDefinitions(historySql);
  const historyTables = historyDefinitions
    .map((definition) => definition.qualified)
    .sort();
  if (
    JSON.stringify(historyTables) !==
    JSON.stringify([
      "supabase_migrations.schema_migrations",
      "supabase_migrations.seed_files",
    ])
  ) {
    throw new Error(
      `migration-history-data.sql contiene destinos inesperados: ${historyTables.join(", ")}.`,
    );
  }
  return { authDefinitions, storageDefinitions, historyDefinitions };
}

function extractFixtureMetadata(dataDefinitions, manifest, backupRoot) {
  const verified = assertFixtureBackupIntegrity(
    dataDefinitions,
    manifest,
    backupRoot,
  );
  return {
    id: verified.id,
    bucketId: verified.bucket,
    name: verified.object,
    path: verified.path,
    owner: verified.owner,
    ownerId: verified.ownerId,
    userMetadata: verified.userMetadata,
    bytes: verified.bytes,
    sha256: verified.sha256,
  };
}

function extractApplicationTrigger() {
  const migrationPath = path.join(
    root,
    "supabase",
    "migrations",
    "0002_functions.sql",
  );
  if (sha256File(migrationPath) !== expectedApplicationTriggerMigrationSha256) {
    throw new Error(
      "La migración canónica 0002 cambió respecto del hash auditado.",
    );
  }
  const sql = readFileSync(migrationPath, "utf8");
  const matches = [
    ...sql.matchAll(
      /drop trigger if exists on_auth_user_created on auth\.users;\s*create trigger on_auth_user_created\s+after insert on auth\.users\s+for each row execute function public\.handle_new_user\(\);/gi,
    ),
  ];
  if (matches.length !== 1) {
    throw new Error(
      "0002 no contiene exactamente el trigger app-owned on_auth_user_created esperado.",
    );
  }
  return matches[0][0];
}

async function waitForHealthyUrl(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // El contenedor todavía está reiniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`El servicio local no recuperó salud: ${url}`);
}

function queryStorageOwners(container) {
  const result = run("docker", [
    "exec",
    container,
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
    `select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name, 'owner', owner, 'ownerId', owner_id) order by bucket_id, name), '[]'::jsonb)::text from storage.objects`,
  ]);
  return JSON.parse(result.stdout.trim() || "[]");
}

function queryStorageRows(container) {
  const result = run("docker", [
    "exec",
    container,
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
    `select coalesce(jsonb_agg(to_jsonb(o) order by o.bucket_id, o.name), '[]'::jsonb)::text from storage.objects o`,
  ]);
  return JSON.parse(result.stdout.trim() || "[]");
}

function queryJson(container, sql) {
  const result = run("docker", [
    "exec",
    container,
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
  ]);
  return JSON.parse(result.stdout.trim());
}

function queryFixtureMetadata(container, expected) {
  const bucket = expected.bucketId.replaceAll("'", "''");
  const name = expected.name.replaceAll("'", "''");
  const result = queryJson(
    container,
    `select coalesce((
      select jsonb_build_object(
        'id', id,
        'bucketId', bucket_id,
        'name', name,
        'path', bucket_id || '/' || name,
        'owner', owner,
        'ownerId', owner_id,
        'userMetadata', user_metadata
      )
      from storage.objects
      where bucket_id = '${bucket}' and name = '${name}'
    ), 'null'::jsonb)::text`,
  );
  return result;
}

function assertFixtureMetadata(container, expected, phase) {
  const actual = queryFixtureMetadata(container, expected);
  const protectedExpected = {
    id: expected.id,
    bucketId: expected.bucketId,
    name: expected.name,
    path: expected.path,
    owner: expected.owner,
    ownerId: expected.ownerId,
    userMetadata: expected.userMetadata,
  };
  if (!isDeepStrictEqual(actual, protectedExpected)) {
    throw new Error(
      `La metadata protegida del fixture difiere ${phase}: expected=${sha256Buffer(Buffer.from(JSON.stringify(protectedExpected)))}, actual=${sha256Buffer(Buffer.from(JSON.stringify(actual)))}.`,
    );
  }
  return actual;
}

function queryCopyTableSignatures(container, definitions) {
  const qualified = definitions.map((definition) => definition.qualified);
  const values = qualified
    .map((value) => `'${value.replaceAll("'", "''")}'`)
    .join(", ");
  const result = queryJson(
    container,
    `select coalesce(jsonb_agg(jsonb_build_object(
      'qualified', n.nspname || '.' || c.relname,
      'relkind', c.relkind,
      'owner', pg_get_userbyid(c.relowner),
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, a.atttypmod),
          'notNull', a.attnotnull,
          'identity', a.attidentity,
          'generated', a.attgenerated,
          'collation', case when a.attcollation = 0 then null else coll.collname end,
          'default', pg_get_expr(ad.adbin, ad.adrelid)
        ) order by a.attnum), '[]'::jsonb)
        from pg_attribute a
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        left join pg_collation coll on coll.oid = a.attcollation
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      ),
      'constraints', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', con.conname,
          'type', con.contype,
          'definition', pg_get_constraintdef(con.oid),
          'validated', con.convalidated,
          'deferrable', con.condeferrable,
          'deferred', con.condeferred
        ) order by con.conname), '[]'::jsonb)
        from pg_constraint con where con.conrelid = c.oid
      ),
      'indexes', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', idx.relname,
          'definition', pg_get_indexdef(i.indexrelid)
        ) order by idx.relname), '[]'::jsonb)
        from pg_index i
        join pg_class idx on idx.oid = i.indexrelid
        where i.indrelid = c.oid
      )
    ) order by n.nspname, c.relname), '[]'::jsonb)::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname || '.' || c.relname in (${values})
      and c.relkind in ('r', 'p')`,
  );
  if (
    JSON.stringify(result.map((entry) => entry.qualified)) !==
    JSON.stringify([...qualified].sort())
  ) {
    throw new Error(
      "No se encontraron todas las tablas Auth/Storage usadas por COPY.",
    );
  }
  const byName = new Map(result.map((entry) => [entry.qualified, entry]));
  for (const definition of definitions) {
    const signature = byName.get(definition.qualified);
    const existingColumns = new Set(
      signature.columns.map((column) => column.name),
    );
    for (const column of definition.columns) {
      if (!existingColumns.has(column)) {
        throw new Error(
          `${definition.qualified}.${column} del COPY no existe en el schema administrado.`,
        );
      }
    }
  }
  return result;
}

function queryManagedOwners(container) {
  return queryJson(
    container,
    `with managed_objects as (
      select 'schema'::text as kind, n.nspname as schema_name,
             n.nspname as object_name, pg_get_userbyid(n.nspowner) as owner
      from pg_namespace n where n.nspname in ('auth', 'storage')
      union all
      select 'relation:' || c.relkind::text, n.nspname, c.relname,
             pg_get_userbyid(c.relowner)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('auth', 'storage')
        and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'i', 'I')
      union all
      select 'routine', n.nspname,
             p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
             pg_get_userbyid(p.proowner)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('auth', 'storage')
      union all
      select 'type', n.nspname, t.typname, pg_get_userbyid(t.typowner)
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname in ('auth', 'storage') and t.typtype <> 'p'
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', kind, 'schema', schema_name, 'name', object_name, 'owner', owner
    ) order by schema_name, kind, object_name), '[]'::jsonb)::text
    from managed_objects`,
  );
}

function assertExpectedManagedOwners(snapshot, label) {
  for (const object of snapshot) {
    const expected =
      object.kind === "schema"
        ? "supabase_admin"
        : object.schema === "auth"
          ? "supabase_auth_admin"
          : "supabase_storage_admin";
    if (object.owner !== expected) {
      throw new Error(
        `${label}: owner inesperado en ${object.schema}.${object.name}: ${object.owner}; esperado ${expected}.`,
      );
    }
  }
}

function queryManagedHistories(container) {
  return queryJson(
    container,
    `select jsonb_build_object(
      'auth.schema_migrations', (
        select coalesce(jsonb_agg(to_jsonb(t) order by version), '[]'::jsonb)
        from auth.schema_migrations t
      ),
      'storage.migrations', (
        select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
        from storage.migrations t
      ),
      'realtime.schema_migrations', (
        select coalesce(jsonb_agg(to_jsonb(t) order by version), '[]'::jsonb)
        from realtime.schema_migrations t
      ),
      '_realtime.schema_migrations', (
        select coalesce(jsonb_agg(to_jsonb(t) order by version), '[]'::jsonb)
        from _realtime.schema_migrations t
      ),
      'supabase_functions.migrations', (
        select coalesce(jsonb_agg(to_jsonb(t) order by version), '[]'::jsonb)
        from supabase_functions.migrations t
      )
    )::text`,
  );
}

function managedHistoryIdentity(snapshot) {
  return {
    "auth.schema_migrations": snapshot["auth.schema_migrations"].map(
      (row) => row.version,
    ),
    "storage.migrations": snapshot["storage.migrations"].map((row) => ({
      id: row.id,
      name: row.name,
      hash: row.hash,
    })),
    "realtime.schema_migrations": snapshot["realtime.schema_migrations"].map(
      (row) => row.version,
    ),
    "_realtime.schema_migrations": snapshot["_realtime.schema_migrations"].map(
      (row) => row.version,
    ),
    "supabase_functions.migrations": snapshot[
      "supabase_functions.migrations"
    ].map((row) => row.version),
  };
}

async function waitForManagedHistories(
  container,
  expectedIdentity,
  label,
  attempts = 40,
) {
  let latest;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      latest = queryManagedHistories(container);
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    const actualIdentity = managedHistoryIdentity(latest);
    let complete = true;
    for (const [history, expectedRows] of Object.entries(expectedIdentity)) {
      const actualRows = actualIdentity[history];
      if (
        actualRows.length > expectedRows.length ||
        JSON.stringify(actualRows) !==
          JSON.stringify(expectedRows.slice(0, actualRows.length))
      ) {
        throw new Error(
          `${label}: ${history} no es un prefijo válido del historial esperado.`,
        );
      }
      if (actualRows.length !== expectedRows.length) complete = false;
    }
    if (complete) return latest;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} no completó todos los historiales administrados.`);
}

function queryStorageMigrations(container) {
  return queryJson(
    container,
    `select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'hash', hash
    ) order by id), '[]'::jsonb)::text from storage.migrations`,
  );
}

function assertStorageMigrations(migrations, label) {
  const ids = migrations.map((migration) => migration.id);
  const expectedIds = Array.from({ length: 65 }, (_, index) => index);
  const migrationSha256 = storageMigrationIdentitySha256(migrations);
  if (
    JSON.stringify(ids) !== JSON.stringify(expectedIds) ||
    migrations.some(
      (migration) =>
        typeof migration.name !== "string" ||
        !/^[a-f0-9]{40}$/.test(migration.hash),
    ) ||
    migrationSha256 !== expectedStorageMigrationsSha256
  ) {
    throw new Error(
      `${label} no contiene exactamente Storage migrations 0–64 con nombres/hashes auditados (SHA ${migrationSha256}).`,
    );
  }
  return migrationSha256;
}

async function waitForStorageMigrations(container, label, attempts = 40) {
  let latest;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      latest = queryStorageMigrations(container);
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    const ids = latest.map((migration) => migration.id);
    const validIncompletePrefix =
      latest.length < 65 &&
      JSON.stringify(ids) ===
        JSON.stringify(
          Array.from({ length: latest.length }, (_, index) => index),
        );
    if (!validIncompletePrefix) {
      assertStorageMigrations(latest, label);
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assertStorageMigrations(latest ?? [], label);
  throw new Error(`${label} no completó sus migraciones administradas.`);
}

function imageEvidence(projectId) {
  return Object.fromEntries(
    Object.keys(expectedImages).map((service) => {
      const container = `supabase_${service}_${projectId}`;
      const inspect = JSON.parse(
        run("docker", ["inspect", container]).stdout,
      )[0];
      const image = JSON.parse(
        run("docker", ["image", "inspect", inspect.Image]).stdout,
      )[0];
      return [
        service,
        {
          tag: inspect.Config.Image,
          digest: inspect.Image,
          repoDigests: [...(image.RepoDigests ?? [])].sort(),
        },
      ];
    }),
  );
}

function assertExpectedImages(images, label) {
  for (const [service, expected] of Object.entries(expectedImages)) {
    const actual = images[service];
    if (actual?.tag !== expected.tag || actual?.digest !== expected.digest) {
      throw new Error(
        `${label}: imagen ${service} inesperada: ${actual?.tag ?? "ausente"}/${actual?.digest ?? "sin digest"}.`,
      );
    }
  }
}

function storageRuntimePins(projectId) {
  const output = run("docker", [
    "inspect",
    `supabase_storage_${projectId}`,
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
  ]).stdout;
  return Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
      .filter(([key]) => ["VERSION", "DB_MIGRATIONS_FREEZE_AT"].includes(key)),
  );
}

function assertStorageRuntimePins(projectId, label) {
  const pins = storageRuntimePins(projectId);
  if (
    pins.VERSION !== expectedVersionPins["storage-version"].slice(1) ||
    pins.DB_MIGRATIONS_FREEZE_AT !== expectedVersionPins["storage-migration"]
  ) {
    throw new Error(`${label}: Storage arrancó con pins runtime inesperados.`);
  }
  return pins;
}

function storageRowDifferences(before, after) {
  const beforeByKey = new Map(
    before.map((row) => [`${row.bucket_id}/${row.name}`, row]),
  );
  const afterByKey = new Map(
    after.map((row) => [`${row.bucket_id}/${row.name}`, row]),
  );
  const keys = [
    ...new Set([...beforeByKey.keys(), ...afterByKey.keys()]),
  ].sort();
  return keys.flatMap((key) => {
    const beforeRow = beforeByKey.get(key);
    const afterRow = afterByKey.get(key);
    if (!beforeRow || !afterRow) {
      return [
        {
          object: key,
          changedFields: [beforeRow ? "removed" : "added"],
          beforeSha256: beforeRow
            ? sha256Buffer(Buffer.from(JSON.stringify(beforeRow)))
            : null,
          afterSha256: afterRow
            ? sha256Buffer(Buffer.from(JSON.stringify(afterRow)))
            : null,
        },
      ];
    }
    const fields = [
      ...new Set([...Object.keys(beforeRow), ...Object.keys(afterRow)]),
    ]
      .filter(
        (field) =>
          JSON.stringify(beforeRow[field]) !== JSON.stringify(afterRow[field]),
      )
      .sort();
    return fields.length === 0
      ? []
      : [
          {
            object: key,
            changedFields: fields,
            beforeSha256: sha256Buffer(Buffer.from(JSON.stringify(beforeRow))),
            afterSha256: sha256Buffer(Buffer.from(JSON.stringify(afterRow))),
          },
        ];
  });
}

function queryMigrationVersions(container) {
  const result = run("docker", [
    "exec",
    container,
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
    "select version from supabase_migrations.schema_migrations order by version",
  ]);
  return result.stdout.trim().split("\n").filter(Boolean);
}

function queryRestoreTriggerSequenceState(container) {
  const result = run("docker", [
    "exec",
    container,
    "psql",
    "-X",
    "-A",
    "-t",
    "-q",
    "-F",
    "|",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    `select last_value, is_called from ${RESTORE_TRIGGER_PROBE_SEQUENCE}`,
  ]);
  return parseRestoreTriggerSequenceState(result.stdout);
}

function restoreTriggerProbeSequenceState(container, expected) {
  run("docker", [
    "exec",
    container,
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
    buildRestoreTriggerSequenceSetvalSql(expected),
  ]);
  const restored = queryRestoreTriggerSequenceState(container);
  if (!isDeepStrictEqual(restored, expected)) {
    throw new Error(
      "El probe funcional no restauró exactamente el estado de su secuencia.",
    );
  }
}

function queryFixtureBucketCount(container) {
  const result = run("docker", [
    "exec",
    container,
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
    "select count(*) from storage.buckets where id like 'agorbis-restore-fixture-%'",
  ]);
  return Number(result.stdout.trim());
}

function projectResources(projectId) {
  const containers = run("docker", [
    "ps",
    "-a",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean)
    .map((id) =>
      run("docker", [
        "inspect",
        id,
        "--format",
        "{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.RestartCount}}|{{.State.Running}}|{{.State.Paused}}",
      ]).stdout.trim(),
    )
    .sort();
  const volumes = run("docker", [
    "volume",
    "ls",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  const networks = run("docker", [
    "network",
    "ls",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean)
    .map((id) =>
      run("docker", [
        "network",
        "inspect",
        id,
        "--format",
        "{{.Id}}|{{.Name}}",
      ]).stdout.trim(),
    )
    .sort();
  return { containers, volumes, networks };
}

function projectNamedResourceLeaks(projectId) {
  const commands = [
    ["ps", "-a", "--format", "{{.Names}}"],
    ["volume", "ls", "--format", "{{.Name}}"],
    ["network", "ls", "--format", "{{.Name}}"],
  ];
  return commands.flatMap((args) =>
    run("docker", args)
      .stdout.trim()
      .split("\n")
      .filter((name) => name.includes(projectId)),
  );
}

function createLoopbackNetwork(projectId, workdir) {
  const name = `${projectId}-loopback`;
  const existing = run("docker", ["network", "inspect", name], {
    allowFailure: true,
  });
  if (existing.status === 0) {
    throw new Error(`Ya existe la red temporal ${name}.`);
  }
  const id = run("docker", [
    "network",
    "create",
    "--driver",
    "bridge",
    "--opt",
    "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
    "--label",
    `com.agorbis.restore.project=${projectId}`,
    "--label",
    `com.agorbis.restore.workdir=${workdir}`,
    name,
  ]).stdout.trim();
  if (!/^[a-f0-9]{64}$/.test(id)) {
    throw new Error(`Docker devolvió un ID de red temporal inválido: ${id}.`);
  }
  const network = { id, name };
  try {
    assertLoopbackNetwork(network, projectId, workdir);
    return network;
  } catch (error) {
    const cleanup = run("docker", ["network", "rm", id], {
      allowFailure: true,
    });
    if (cleanup.status !== 0) {
      error.cleanupError = `No se pudo retirar la red recién creada ${name}.`;
    }
    throw error;
  }
}

function assertLoopbackNetwork(network, projectId, workdir) {
  const inspectResult = run("docker", ["network", "inspect", network.id], {
    allowFailure: true,
  });
  if (inspectResult.status !== 0) {
    throw new Error(`La red temporal ${network.name} no existe.`);
  }
  const inspect = JSON.parse(inspectResult.stdout)[0];
  if (
    inspect.Id !== network.id ||
    inspect.Name !== network.name ||
    inspect.Driver !== "bridge" ||
    inspect.EnableIPv6 !== false ||
    inspect.Options?.["com.docker.network.bridge.host_binding_ipv4"] !==
      "127.0.0.1" ||
    inspect.Labels?.["com.agorbis.restore.project"] !== projectId ||
    inspect.Labels?.["com.agorbis.restore.workdir"] !== workdir
  ) {
    throw new Error(
      "La red temporal no cumple la guarda de aislamiento loopback.",
    );
  }
  return inspect;
}

function targetContainerIds(projectId) {
  return run("docker", [
    "ps",
    "-a",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
}

function targetVolumeIds(projectId) {
  return run("docker", [
    "volume",
    "ls",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
}

function targetCliNetworkIds(projectId) {
  return run("docker", [
    "network",
    "ls",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
}

function assertTargetContainerLabels(projectId, workdir) {
  const ids = targetContainerIds(projectId);
  for (const id of ids) {
    const labels = run("docker", [
      "inspect",
      id,
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
    ]).stdout.trim();
    if (labels !== `${projectId}|${workdir}`) {
      throw new Error(
        `La guarda del target rechazó un contenedor con labels ${labels}.`,
      );
    }
  }
  return ids;
}

function assertTargetVolumeLabels(projectId) {
  const ids = targetVolumeIds(projectId);
  for (const id of ids) {
    const inspect = JSON.parse(
      run("docker", ["volume", "inspect", id]).stdout,
    )[0];
    if (
      inspect.Labels?.["com.supabase.cli.project"] !== projectId ||
      inspect.Labels?.["com.docker.compose.project"] !== projectId ||
      !inspect.Name.endsWith(`_${projectId}`)
    ) {
      throw new Error(
        `La guarda rechazó el volumen target ${inspect.Name || id}.`,
      );
    }
  }
  return ids;
}

function assertTargetCliNetworkLabels(projectId) {
  const ids = targetCliNetworkIds(projectId);
  for (const id of ids) {
    const inspect = JSON.parse(
      run("docker", ["network", "inspect", id]).stdout,
    )[0];
    if (
      inspect.Labels?.["com.supabase.cli.project"] !== projectId ||
      inspect.Labels?.["com.docker.compose.project"] !== projectId ||
      !inspect.Name.endsWith(`_${projectId}`)
    ) {
      throw new Error(
        `La guarda rechazó la red CLI target ${inspect.Name || id}.`,
      );
    }
  }
  return ids;
}

function publishedHostIps(projectId) {
  const bindings = [];
  for (const id of targetContainerIds(projectId)) {
    const inspect = JSON.parse(run("docker", ["inspect", id]).stdout)[0];
    for (const [containerPort, values] of Object.entries(
      inspect.NetworkSettings.Ports ?? {},
    )) {
      for (const binding of values ?? []) {
        bindings.push({
          container: inspect.Name.replace(/^\//, ""),
          containerPort,
          hostIp: binding.HostIp,
          hostPort: Number(binding.HostPort),
        });
      }
    }
  }
  return bindings.sort((left, right) =>
    `${left.container}/${left.containerPort}/${left.hostPort}`.localeCompare(
      `${right.container}/${right.containerPort}/${right.hostPort}`,
    ),
  );
}

function nonLoopbackHostAddresses() {
  const addresses = [];
  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal && [4, 6, "IPv4", "IPv6"].includes(entry.family)) {
        addresses.push({ interfaceName, address: entry.address });
      }
    }
  }
  return addresses.sort((left, right) =>
    `${left.interfaceName}/${left.address}`.localeCompare(
      `${right.interfaceName}/${right.address}`,
    ),
  );
}

async function canConnect(host, port, timeoutMilliseconds = 750) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMilliseconds, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function assertTargetNetworkExposure(projectId, workdir, network, ports) {
  assertLoopbackNetwork(network, projectId, workdir);
  const ids = assertTargetContainerLabels(projectId, workdir);
  const expectedContainers = Object.keys(expectedImages)
    .map((service) => `supabase_${service}_${projectId}`)
    .sort();
  const actualContainers = ids
    .map((id) =>
      run("docker", ["inspect", id, "--format", "{{.Name}}"])
        .stdout.trim()
        .replace(/^\//, ""),
    )
    .sort();
  if (JSON.stringify(actualContainers) !== JSON.stringify(expectedContainers)) {
    throw new Error(
      `Servicios target inesperados: ${actualContainers.join(", ")}.`,
    );
  }
  for (const id of ids) {
    const networks = Object.keys(
      JSON.parse(run("docker", ["inspect", id]).stdout)[0].NetworkSettings
        .Networks ?? {},
    );
    if (networks.length !== 1 || networks[0] !== network.name) {
      throw new Error(
        `Un contenedor target está conectado fuera de ${network.name}: ${networks.join(", ")}.`,
      );
    }
  }

  const bindings = publishedHostIps(projectId);
  const hostPorts = [...new Set(bindings.map((binding) => binding.hostPort))];
  if (
    bindings.length === 0 ||
    bindings.some(
      (binding) =>
        binding.hostIp !== "127.0.0.1" ||
        !Number.isInteger(binding.hostPort) ||
        binding.hostPort < 1,
    ) ||
    !hostPorts.includes(ports.api) ||
    !hostPorts.includes(ports.db)
  ) {
    throw new Error(
      `Los bindings efectivos del target no son exclusivamente loopback: ${JSON.stringify(bindings)}.`,
    );
  }
  for (const port of hostPorts) {
    if (!(await canConnect("127.0.0.1", port))) {
      throw new Error(`El puerto target ${port} no responde por loopback.`);
    }
  }
  const denied = [];
  for (const host of nonLoopbackHostAddresses()) {
    for (const port of hostPorts) {
      if (await canConnect(host.address, port)) {
        throw new Error(
          `El target acepta conexiones no-loopback en ${host.address}:${port}.`,
        );
      }
      denied.push(`${host.address}:${port}`);
    }
  }
  return { bindings, denied, network: network.name };
}

function removeLoopbackNetwork(network, projectId, workdir) {
  const inspect = run("docker", ["network", "inspect", network.id], {
    allowFailure: true,
  });
  if (inspect.status !== 0) return;
  assertLoopbackNetwork(network, projectId, workdir);
  run("docker", ["network", "rm", network.id]);
}

function assertNetworkExposureStable(before, after) {
  if (
    before.network !== after.network ||
    !isDeepStrictEqual(before.bindings, after.bindings)
  ) {
    throw new Error(
      `La red o los bindings loopback del target cambiaron: network=${before.network}/${after.network}, bindings=${JSON.stringify(firstArrayDifference(before.bindings, after.bindings))}.`,
    );
  }
  return {
    networkStable: true,
    bindingsStable: true,
    initialDeniedCount: before.denied.length,
    finalDeniedCount: after.denied.length,
    initialDeniedSha256: sha256Buffer(
      Buffer.from(JSON.stringify(before.denied)),
    ),
    finalDeniedSha256: sha256Buffer(Buffer.from(JSON.stringify(after.denied))),
    hostInterfaceSetChanged: !isDeepStrictEqual(before.denied, after.denied),
    allObservedNonLoopbackConnectionsDenied: true,
  };
}

function restoreTempDirectories() {
  return readdirSync(tmpdir())
    .filter((name) => name.startsWith("agorbis-restore-drill-"))
    .sort();
}

function assertMapsEqual(before, after, label) {
  if (JSON.stringify([...before]) !== JSON.stringify([...after])) {
    throw new Error(
      `${label} del stack local original cambió durante el drill.`,
    );
  }
}

function queryRestorableDefaultPrivileges(container) {
  return queryJson(container, DEFAULT_PRIVILEGES_SQL);
}

function queryApplicationAclSnapshot(container) {
  return queryJson(container, APPLICATION_ACL_SQL);
}

function queryCatalogSnapshot(container) {
  const result = run("docker", [
    "exec",
    container,
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
    `select jsonb_build_object(
      'schemas', coalesce((
        select jsonb_agg(n.nspname order by n.nspname)
        from pg_namespace n
        where n.nspname in ('auth', 'private', 'public', 'storage')
      ), '[]'::jsonb),
      'relations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'schema', n.nspname,
          'name', c.relname,
          'kind', c.relkind,
          'rls', c.relrowsecurity,
          'forceRls', c.relforcerowsecurity
        ) order by n.nspname, c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('auth', 'private', 'public', 'storage')
          and c.relkind in ('r', 'p')
      ), '[]'::jsonb),
      'checkConstraints', coalesce((
        select jsonb_agg(jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname,
          'name', con.conname,
          'definitionRaw', pg_get_constraintdef(con.oid, false),
          'definitionCanonical', pg_get_constraintdef(con.oid, true),
          'validated', con.convalidated,
          'noInherit', con.connoinherit,
          'local', con.conislocal,
          'inheritCount', con.coninhcount,
          'deferrable', con.condeferrable,
          'deferred', con.condeferred,
          'key', coalesce(to_jsonb(con.conkey), '[]'::jsonb)
        ) order by n.nspname, c.relname, con.conname)
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('auth', 'private', 'public', 'storage')
          and con.contype = 'c'
      ), '[]'::jsonb),
      'policies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'schema', p.schemaname,
          'table', p.tablename,
          'name', p.policyname,
          'permissive', p.permissive,
          'roles', p.roles,
          'command', p.cmd,
          'using', p.qual,
          'check', p.with_check
        ) order by p.schemaname, p.tablename, p.policyname)
        from pg_policies p
        where p.schemaname in ('auth', 'private', 'public', 'storage')
      ), '[]'::jsonb),
      'functions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'schema', n.nspname,
          'name', p.proname,
          'arguments', pg_get_function_identity_arguments(p.oid),
          'result', pg_get_function_result(p.oid),
          'owner', pg_get_userbyid(p.proowner),
          'securityDefiner', p.prosecdef,
          'leakproof', p.proleakproof,
          'volatility', p.provolatile,
          'parallel', p.proparallel,
          'config', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
          'definitionMd5', md5(pg_get_functiondef(p.oid))
        ) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('auth', 'private', 'public', 'storage')
      ), '[]'::jsonb),
      'managedTriggers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'schema', n.nspname,
          'table', c.relname,
          'name', t.tgname,
          'definitionMd5', md5(pg_get_triggerdef(t.oid))
        ) order by n.nspname, c.relname, t.tgname)
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('auth', 'storage')
          and not t.tgisinternal
      ), '[]'::jsonb)
    )::text`,
  ]);
  return JSON.parse(result.stdout.trim());
}

function catalogSummary(snapshot) {
  const relationCounts = Object.fromEntries(
    snapshot.schemas.map((schema) => [
      schema,
      snapshot.relations.filter((relation) => relation.schema === schema)
        .length,
    ]),
  );
  return {
    sha256: sha256Buffer(Buffer.from(JSON.stringify(snapshot))),
    schemas: snapshot.schemas,
    relations: relationCounts,
    rlsEnabledTables: snapshot.relations.filter((relation) => relation.rls)
      .length,
    rlsDisabledTables: snapshot.relations.filter((relation) => !relation.rls)
      .length,
    policies: snapshot.policies.length,
    checkConstraints: snapshot.checkConstraints.length,
    functions: snapshot.functions.length,
    managedTriggers: snapshot.managedTriggers.length,
  };
}

function assertCatalogMatches(source, target) {
  for (const section of [
    "schemas",
    "relations",
    "checkConstraints",
    "policies",
    "functions",
    "managedTriggers",
  ]) {
    const comparable = (entries) =>
      section === "checkConstraints"
        ? entries.map(({ definitionRaw: _definitionRaw, ...entry }) => entry)
        : entries;
    const sourceComparable = comparable(source[section]);
    const targetComparable = comparable(target[section]);
    const sourceJson = JSON.stringify(sourceComparable);
    const targetJson = JSON.stringify(targetComparable);
    if (sourceJson !== targetJson) {
      throw new Error(
        `El catálogo restaurado difiere en ${section}: source=${sha256Buffer(Buffer.from(sourceJson))}/${source[section].length}, target=${sha256Buffer(Buffer.from(targetJson))}/${target[section].length}.`,
      );
    }
  }
}

function canonicalDumpDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return {
        line: index + 1,
        expectedLines: expectedLines.length,
        actualLines: actualLines.length,
        expected: expectedLines[index] ?? null,
        actual: actualLines[index] ?? null,
      };
    }
  }
  return null;
}

function firstArrayDifference(expected, actual) {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (!isDeepStrictEqual(expected[index], actual[index])) {
      return {
        index,
        expectedLength: expected.length,
        actualLength: actual.length,
        expected: expected[index] ?? null,
        actual: actual[index] ?? null,
      };
    }
  }
  return null;
}

function copyStructure(sql) {
  const kept = [];
  let insideCopy = false;
  for (const line of canonicalizePgDump(sql).split("\n")) {
    if (/^COPY ".+"\.".+" \(.+\) FROM stdin;$/.test(line)) {
      insideCopy = true;
      kept.push(line);
    } else if (insideCopy && line === "\\.") {
      insideCopy = false;
      kept.push(line);
    } else if (!insideCopy) {
      kept.push(line);
    }
  }
  if (insideCopy) throw new Error("Dump con bloque COPY incompleto.");
  return kept.join("\n");
}

function compareSourceDataToBackup(sourcePath, backupPath, fixture) {
  const sourceSql = readFileSync(sourcePath, "utf8");
  const backupSql = readFileSync(backupPath, "utf8");
  const sourceDefinitions = parseCopyDefinitions(sourceSql);
  const backupDefinitions = parseCopyDefinitions(backupSql);
  const sourceByTable = new Map(
    sourceDefinitions.map((definition) => [definition.qualified, definition]),
  );
  if (
    JSON.stringify(
      sourceDefinitions.map((definition) => ({
        qualified: definition.qualified,
        columns: definition.columns,
      })),
    ) !==
    JSON.stringify(
      backupDefinitions.map((definition) => ({
        qualified: definition.qualified,
        columns: definition.columns,
      })),
    )
  ) {
    throw new Error("La estructura COPY source-backup difiere.");
  }

  const removedFixtureRows = [];
  for (const backupDefinition of backupDefinitions) {
    const sourceDefinition = sourceByTable.get(backupDefinition.qualified);
    const backupRows = backupDefinition.rows.filter((line) => {
      if (
        !["storage.buckets", "storage.objects"].includes(
          backupDefinition.qualified,
        )
      ) {
        return true;
      }
      const fields = line.split("\t").map(decodeCopyTextValue);
      const row = Object.fromEntries(
        backupDefinition.columns.map((column, index) => [
          column,
          fields[index],
        ]),
      );
      const isFixture =
        backupDefinition.qualified === "storage.buckets"
          ? row.id === fixture.bucket
          : row.bucket_id === fixture.bucket && row.name === fixture.object;
      if (isFixture) removedFixtureRows.push(backupDefinition.qualified);
      return !isFixture;
    });
    if (JSON.stringify(sourceDefinition.rows) !== JSON.stringify(backupRows)) {
      throw new Error(
        `Los valores source-backup difieren en ${backupDefinition.qualified}.`,
      );
    }
  }
  if (
    JSON.stringify(removedFixtureRows) !==
    JSON.stringify(["storage.buckets", "storage.objects"])
  ) {
    throw new Error(
      `La comparación source-backup no retiró exactamente el fixture: ${removedFixtureRows.join(", ")}.`,
    );
  }
  const sourceStructure = copyStructure(sourceSql);
  const backupStructure = copyStructure(backupSql);
  if (sourceStructure !== backupStructure) {
    throw new Error("Las sentencias no-COPY o headers source-backup difieren.");
  }
  return {
    tables: sourceDefinitions.length,
    fixtureRowsExcluded: removedFixtureRows,
    structureSha256: sha256Buffer(Buffer.from(sourceStructure)),
    sourceRows: sourceDefinitions.reduce(
      (total, definition) => total + definition.rows.length,
      0,
    ),
    backupRows: backupDefinitions.reduce(
      (total, definition) => total + definition.rows.length,
      0,
    ),
  };
}

function sourceDataFingerprint(filePath) {
  return sha256Buffer(
    Buffer.from(canonicalizePgDump(readFileSync(filePath, "utf8"))),
  );
}

function verifySourceDataUnchanged(expectedSha256) {
  const directory = mkdtempSync(
    path.join(tmpdir(), "agorbis-source-integrity-"),
  );
  const output = path.join(directory, "data.sql");
  let firstError;
  try {
    run("pnpm", [
      "exec",
      "supabase",
      "db",
      "dump",
      "--local",
      ...managedDataDumpFlags(),
      "--file",
      output,
    ]);
    const actualSha256 = sourceDataFingerprint(output);
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Los datos del stack source cambiaron: expected=${expectedSha256}, actual=${actualSha256}.`,
      );
    }
  } catch (error) {
    firstError = error;
  }
  try {
    if (
      !path.basename(directory).startsWith("agorbis-source-integrity-") ||
      path.dirname(directory) !== path.resolve(tmpdir())
    ) {
      throw new Error(`Directorio source rechazado: ${directory}.`);
    }
    rmSync(directory, { recursive: true, force: false });
  } catch (error) {
    if (firstError) firstError.cleanupError = error.message;
    else firstError = error;
  }
  if (firstError) throw firstError;
  return expectedSha256;
}

function verifySourceSchemaMatchesBackup(workdir, databaseRoot) {
  const source = path.join(workdir, "source-current-schema.sql");
  const expected = path.join(databaseRoot, "schema.sql");
  run("pnpm", ["exec", "supabase", "db", "dump", "--local", "--file", source]);
  const expectedCanonical = canonicalizePgDump(readFileSync(expected, "utf8"));
  const actualCanonical = canonicalizePgDump(readFileSync(source, "utf8"));
  const expectedSha256 = sha256Buffer(Buffer.from(expectedCanonical));
  const actualSha256 = sha256Buffer(Buffer.from(actualCanonical));
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `El schema source difiere del backup antes del restore: expected=${expectedSha256}, actual=${actualSha256}, firstDifference=${JSON.stringify(canonicalDumpDifference(expectedCanonical, actualCanonical))}.`,
    );
  }
  return {
    expectedRawSha256: sha256File(expected),
    actualRawSha256: sha256File(source),
    canonicalSha256: actualSha256,
  };
}

function checkConstraintsForSchemas(catalog, schemas) {
  if (!catalog || !Array.isArray(catalog.checkConstraints)) {
    throw new Error("Falta el inventario de CHECK para comparar los dumps.");
  }
  const allowed = new Set(schemas);
  return catalog.checkConstraints.filter((entry) => allowed.has(entry.schema));
}

function verifyTargetDumps(
  workdir,
  databaseRoot,
  {
    includeData = true,
    sourceCatalog,
    targetCatalog,
    sourceDefaultPrivileges,
    targetDefaultPrivileges,
  } = {},
) {
  const specifications = [
    { name: "roles.sql", flags: ["--role-only"] },
    {
      name: "schema.sql",
      flags: [],
      checkSchemas: ["private", "public"],
    },
    { name: "data.sql", flags: managedDataDumpFlags() },
    {
      name: "migration-history-schema.sql",
      flags: ["--schema", "supabase_migrations"],
    },
    {
      name: "migration-history-data.sql",
      flags: ["--data-only", "--use-copy", "--schema", "supabase_migrations"],
    },
    {
      name: "managed-schema-reference.sql",
      flags: ["--schema", "auth,storage"],
      checkSchemas: ["auth", "storage"],
    },
  ].filter((specification) => includeData || specification.name !== "data.sql");
  return Object.fromEntries(
    specifications.map((specification) => {
      const target = path.join(workdir, `restored-${specification.name}`);
      run("pnpm", [
        "exec",
        "supabase",
        "db",
        "dump",
        "--local",
        "--workdir",
        workdir,
        ...specification.flags,
        "--file",
        target,
      ]);
      const expected = path.join(databaseRoot, specification.name);
      const expectedRawSha256 = sha256File(expected);
      const actualRawSha256 = sha256File(target);
      const expectedChecks = specification.checkSchemas
        ? checkConstraintsForSchemas(sourceCatalog, specification.checkSchemas)
        : undefined;
      const actualChecks = specification.checkSchemas
        ? checkConstraintsForSchemas(targetCatalog, specification.checkSchemas)
        : undefined;
      const expectedDefaults =
        specification.name === "schema.sql"
          ? sourceDefaultPrivileges
          : undefined;
      const actualDefaults =
        specification.name === "schema.sql"
          ? targetDefaultPrivileges
          : undefined;
      let expectedCanonical = canonicalizePgDump(
        readFileSync(expected, "utf8"),
        expectedChecks,
        expectedDefaults,
      );
      let actualCanonical = canonicalizePgDump(
        readFileSync(target, "utf8"),
        actualChecks,
        actualDefaults,
      );
      if (specification.name === "data.sql") {
        expectedCanonical = canonicalizeCopyRowOrder(expectedCanonical);
        actualCanonical = canonicalizeCopyRowOrder(actualCanonical);
      }
      const expectedCanonicalSha256 = sha256Buffer(
        Buffer.from(expectedCanonical),
      );
      const actualCanonicalSha256 = sha256Buffer(Buffer.from(actualCanonical));
      if (actualCanonicalSha256 !== expectedCanonicalSha256) {
        const difference = canonicalDumpDifference(
          expectedCanonical,
          actualCanonical,
        );
        throw new Error(
          `${specification.name} restaurado difiere: expected=${expectedCanonicalSha256}, actual=${actualCanonicalSha256}, firstDifference=${JSON.stringify(difference)}.`,
        );
      }
      return [
        specification.name,
        {
          expectedRawSha256,
          actualRawSha256,
          canonicalSha256: actualCanonicalSha256,
          rawSha256Equal: expectedRawSha256 === actualRawSha256,
          normalizedOnly: specification.checkSchemas
            ? [
                "pg_dump restrict/unrestrict key",
                "PostgreSQL CHECK pretty-print association with exact canonical catalog parity",
                ...(specification.name === "schema.sql"
                  ? [
                      "pg_dump ALTER DEFAULT PRIVILEGES spacing/order with exact signed ACL parity",
                    ]
                  : []),
              ]
            : specification.name === "data.sql"
              ? [
                  "pg_dump restrict/unrestrict key",
                  "unordered relational COPY rows sorted within each exact block",
                ]
              : ["pg_dump restrict/unrestrict key"],
        },
      ];
    }),
  );
}

function verifyFinalRestoredDataAfterManagedServices(workdir, databaseRoot) {
  const restoredDataPath = path.join(
    workdir,
    "restored-final-managed-services-data.sql",
  );
  run("pnpm", [
    "exec",
    "supabase",
    "db",
    "dump",
    "--local",
    "--workdir",
    workdir,
    ...managedDataDumpFlags(),
    "--file",
    restoredDataPath,
  ]);
  return compareRestoredDataAfterManagedServices(
    readFileSync(path.join(databaseRoot, "data.sql"), "utf8"),
    readFileSync(restoredDataPath, "utf8"),
  );
}

async function main() {
  beginPhase("backup_preflight");
  const options = parseArguments(process.argv.slice(2));
  const backupRoot = path.resolve(options.backupDir);
  const manifest = verifyBackupDirectory(backupRoot);
  const backupChecksumIndex = assertBackupChecksumIndex(backupRoot, manifest);
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error(
      `El restore drill sólo admite ${BACKUP_FORMAT}; los backups previos quedan reservados para comparación.`,
    );
  }
  // A verified cloud export is not yet a supported local restore source.
  // Resolve its known profile before invoking any toolchain or Docker command.
  assertLocalRestoreManagedDataProfile(manifest);
  const initialRestoreTempDirectories = restoreTempDirectories();
  const toolchain = assertToolchain();
  const currentRepository = {
    commit: run("git", ["rev-parse", "HEAD"]).stdout.trim(),
    dirty: run("git", ["status", "--porcelain"]).stdout.trim().length > 0,
  };
  const backupSource = classifyRestoreBackupSource(manifest, {
    currentRepository,
    productionConfirmed: options.productionConfirmed === true,
  });
  if (
    backupSource.fixtureRequired &&
    (!/^agorbis-restore-fixture-[a-f0-9]{12}$/.test(
      manifest.fixture?.bucket ?? "",
    ) ||
      manifest.fixture?.object !== "sentinel.bin" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        manifest.fixture?.ownerId ?? "",
      ))
  ) {
    throw new Error(
      "El backup local no contiene el fixture aislado requerido para probar Storage.",
    );
  }
  if (manifest.database.managedPolicyCount !== 0) {
    throw new Error(
      "Hay policies administradas auth/storage; el drill exige un suplemento explícito antes de restaurar.",
    );
  }

  const releaseMigrationFiles = readdirSync(
    path.join(root, "supabase", "migrations"),
  )
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  assertReleaseMigrationFileInventory(releaseMigrationFiles);
  const { releaseState: migrationReleaseState, versions } =
    releaseMigrationStateFromManifest(manifest.database);
  const expectedMigrationVersions = [...versions];
  const databaseRoot = path.join(backupRoot, "database");
  const aclInventory = JSON.parse(
    readFileSync(path.join(databaseRoot, "acl-inventory.json"), "utf8"),
  );
  if (aclInventory.format !== ACL_INVENTORY_FORMAT) {
    throw new Error("El backup no contiene el inventario ACL v1 requerido.");
  }
  const aclInventorySummary = validateAclInventory(aclInventory);
  const ownerAclMaterializationPlan =
    buildOwnerAclMaterializationSql(aclInventory);
  const rolesSql = readFileSync(path.join(databaseRoot, "roles.sql"), "utf8");
  if (/\bCREATE\s+(?:ROLE|USER)\b/i.test(rolesSql)) {
    throw new Error(
      "roles.sql intenta crear manualmente un rol/usuario; los roles de plataforma deben ser administrados por Supabase.",
    );
  }
  const schemaSql = readFileSync(path.join(databaseRoot, "schema.sql"), "utf8");
  const defaultPrivilegesPlan = buildPreSchemaDefaultPrivilegesSql(
    schemaSql,
    expectedDefaultPrivilegesSha256,
  );
  const applicationAclPlan = buildPostSchemaApplicationAclSql(
    schemaSql,
    expectedApplicationAclSha256,
  );
  const dataSql = readFileSync(path.join(databaseRoot, "data.sql"), "utf8");
  assertManagedHistoriesAbsent(dataSql, "database/data.sql");
  assertNoPrivilegeEscalationSql(dataSql, "database/data.sql");
  const dataDefinitions = parseCopyDefinitions(dataSql);
  const expectedCounts = parseCopyCounts(dataSql);
  const historySchemaSql = readFileSync(
    path.join(databaseRoot, "migration-history-schema.sql"),
    "utf8",
  );
  const historySchemaValidation = assertMigrationHistorySchemaSql(
    historySchemaSql,
    expectedMigrationHistorySchemaSha256,
  );
  const historySql = readFileSync(
    path.join(databaseRoot, "migration-history-data.sql"),
    "utf8",
  );
  const historyCounts = parseCopyCounts(historySql);
  const copyPlan = assertNoManagedHistoryRestore(
    {
      "roles.sql": rolesSql,
      "schema.sql": schemaSql,
      "data.sql": dataSql,
      "migration-history-schema.sql": historySchemaSql,
      "migration-history-data.sql": historySql,
    },
    dataDefinitions,
    historySql,
  );
  const managedCopyDefinitions = [
    ...copyPlan.authDefinitions,
    ...copyPlan.storageDefinitions,
  ];
  const excludedDefinitions = manifest.database.dataExcludes.map(
    (exclusion) => {
      const [schema, table] = exclusion.table.split(".");
      return {
        schema,
        table,
        qualified: exclusion.table,
        columns: exclusion.columnSignature
          .filter((column) => column.generated === "")
          .map((column) => column.name),
        rows: [],
      };
    },
  );
  const managedInventoryDefinitions = [
    ...managedCopyDefinitions,
    ...excludedDefinitions,
  ];
  const fixtureExpected = backupSource.fixtureRequired
    ? extractFixtureMetadata(dataDefinitions, manifest, backupRoot)
    : null;
  const applicationTriggerSql = extractApplicationTrigger();
  const sourceVersionPins = readSourceVersionPins();

  beginPhase("temporary_target_workspace_preparation");
  const suffix = randomBytes(5).toString("hex");
  const projectId = `agorbis-restore-drill-${suffix}`;
  if (!/^agorbis-restore-drill-[a-f0-9]{10}$/.test(projectId)) {
    throw new Error("Project ID temporal inválido.");
  }
  const allocated = await allocatePorts(4);
  const ports = {
    api: allocated[0],
    db: allocated[1],
    shadow: allocated[2],
    site: allocated[3],
  };
  const workdir = mkdtempSync(path.join(tmpdir(), "agorbis-restore-drill-"));
  const container = `supabase_db_${projectId}`;
  let startAttempted = false;
  let loopbackNetwork;
  let recoveredConfiguration;
  let report;
  let sourceBaseline;
  let firstError;
  try {
    recoveredConfiguration = restoreConfigurationArtifacts(
      backupRoot,
      workdir,
      manifest,
    );
    writeTargetConfig(
      workdir,
      projectId,
      ports,
      recoveredConfiguration.authTemplateConfig,
    );
    writeTargetVersionPins(workdir, sourceVersionPins);
    beginPhase("source_baseline");
    const sourceLabels = run("docker", [
      "inspect",
      sourceContainer,
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
    ]).stdout.trim();
    if (sourceLabels !== `agorbis|${root}`) {
      throw new Error(
        `El stack source local no pertenece a este workspace: ${sourceLabels || "sin labels"}.`,
      );
    }
    const sourceCatalog = queryCatalogSnapshot(sourceContainer);
    const sourceSchemaBackupComparison = verifySourceSchemaMatchesBackup(
      workdir,
      databaseRoot,
    );
    const sourceDefaultPrivileges =
      queryRestorableDefaultPrivileges(sourceContainer);
    const sourceApplicationAcl = queryApplicationAclSnapshot(sourceContainer);
    if (
      JSON.stringify(sourceDefaultPrivileges) !==
        JSON.stringify(aclInventory.defaultPrivileges) ||
      JSON.stringify(sourceApplicationAcl) !==
        JSON.stringify(aclInventory.applicationAcl)
    ) {
      throw new Error(
        "El inventario ACL firmado no coincide con el stack source local.",
      );
    }
    const sourceStatus = parseStatus(
      run("pnpm", ["exec", "supabase", "status", "--output", "json"]).stdout,
    );
    assertLoopbackUrl(sourceStatus.API_URL, "API source");
    assertLoopbackUrl(sourceStatus.DB_URL, "DB source");
    await waitForHealthyUrl(`${sourceStatus.API_URL}/auth/v1/health`);
    await waitForHealthyUrl(`${sourceStatus.API_URL}/storage/v1/status`);
    const sourceImages = imageEvidence("agorbis");
    assertExpectedImages(sourceImages, "stack source");
    const sourceStorageRuntimePins = assertStorageRuntimePins(
      "agorbis",
      "stack source",
    );
    const sourceStorageMigrations = queryStorageMigrations(sourceContainer);
    const sourceStorageMigrationsSha256 = assertStorageMigrations(
      sourceStorageMigrations,
      "stack source",
    );
    const sourceManagedHistories = queryManagedHistories(sourceContainer);
    const sourceManagedCatalog = queryJson(
      sourceContainer,
      MANAGED_CATALOG_SQL,
    );
    const sourceManagedPolicy = assertManagedCatalogSnapshot(
      sourceManagedCatalog,
      "stack source",
    );
    assertManagedDataDump(
      dataDefinitions,
      sourceManagedCatalog,
      "backup database/data.sql",
    );
    const sourceManagedOwners = queryManagedOwners(sourceContainer);
    assertExpectedManagedOwners(sourceManagedOwners, "stack source");
    const sourceCopySignatures = queryCopyTableSignatures(
      sourceContainer,
      managedInventoryDefinitions,
    );
    const sourceCurrentDataPath = path.join(workdir, "source-current-data.sql");
    run("pnpm", [
      "exec",
      "supabase",
      "db",
      "dump",
      "--local",
      ...managedDataDumpFlags(),
      "--file",
      sourceCurrentDataPath,
    ]);
    const sourceBackupDataComparison = backupSource.compareSourceValues
      ? {
          ...compareSourceDataToBackup(
            sourceCurrentDataPath,
            path.join(databaseRoot, "data.sql"),
            manifest.fixture,
          ),
          comparison: "exact-after-removing-local-fixture",
          sourceValuesCompared: true,
        }
      : {
          ...compareBackupDataStructure(
            readFileSync(sourceCurrentDataPath, "utf8"),
            dataSql,
            { sequenceValues: "ignore-current-value" },
          ),
          comparison: "structure-only-distinct-production-source",
          sourceValuesCompared: false,
        };
    const sourceDataSha256 = sourceDataFingerprint(sourceCurrentDataPath);
    const sourceMigrationVersions = queryMigrationVersions(sourceContainer);
    if (
      JSON.stringify(sourceMigrationVersions) !==
      JSON.stringify(expectedMigrationVersions)
    ) {
      throw new Error(
        "El stack local original no contiene exactamente las migraciones esperadas antes del drill.",
      );
    }
    if (queryFixtureBucketCount(sourceContainer) !== 0) {
      throw new Error(
        "El bucket fixture no fue retirado del stack local original antes del drill.",
      );
    }
    const sourceTableCounts = queryTableCounts(sourceContainer, expectedCounts);
    const sourceBackupCountDifferences = backupSource.compareSourceValues
      ? [...expectedCounts]
          .filter(
            ([table, expected]) => sourceTableCounts.get(table) !== expected,
          )
          .map(([table, expected]) => ({
            table,
            source: sourceTableCounts.get(table),
            backup: expected,
          }))
      : null;
    if (
      backupSource.compareSourceValues &&
      (sourceBackupCountDifferences.length !== 2 ||
        sourceBackupCountDifferences[0]?.table !== "storage.buckets" ||
        sourceBackupCountDifferences[1]?.table !== "storage.objects" ||
        sourceBackupCountDifferences.some(
          (difference) => difference.backup !== difference.source + 1,
        ))
    ) {
      throw new Error(
        `Las diferencias source-backup exceden el fixture retirado: ${JSON.stringify(sourceBackupCountDifferences)}.`,
      );
    }
    sourceBaseline = {
      catalog: sourceCatalog,
      schemaBackupComparison: sourceSchemaBackupComparison,
      defaultPrivileges: sourceDefaultPrivileges,
      applicationAcl: sourceApplicationAcl,
      tableCounts: sourceTableCounts,
      backupCountDifferences: sourceBackupCountDifferences,
      migrations: sourceMigrationVersions,
      resources: projectResources("agorbis"),
      status: {
        apiUrl: sourceStatus.API_URL,
        dbUrl: sourceStatus.DB_URL,
      },
      storageOwners: queryStorageOwners(sourceContainer),
      storageRows: queryStorageRows(sourceContainer),
      storageMigrations: sourceStorageMigrations,
      storageMigrationsSha256: sourceStorageMigrationsSha256,
      storageRuntimePins: sourceStorageRuntimePins,
      managedHistories: sourceManagedHistories,
      managedCatalog: sourceManagedCatalog,
      managedPolicy: sourceManagedPolicy,
      managedOwners: sourceManagedOwners,
      copySignatures: sourceCopySignatures,
      backupDataComparison: sourceBackupDataComparison,
      dataSha256: sourceDataSha256,
      images: sourceImages,
      publishedBindings: publishedHostIps("agorbis"),
      databaseLint: lintDatabase(undefined, "stack source"),
    };

    const existing = run("docker", [
      "ps",
      "-a",
      "--filter",
      `name=^/${container}$`,
      "--format",
      "{{.Names}}",
    ]);
    if (existing.stdout.trim())
      throw new Error(`Ya existe el target temporal ${container}.`);

    beginPhase("target_startup");
    loopbackNetwork = createLoopbackNetwork(projectId, workdir);
    startAttempted = true;
    run("pnpm", [
      "exec",
      "supabase",
      "start",
      "--workdir",
      workdir,
      "--network-id",
      loopbackNetwork.name,
      "--exclude",
      "imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
    ]);
    const status = parseStatus(
      run("pnpm", [
        "exec",
        "supabase",
        "status",
        "--workdir",
        workdir,
        "--output",
        "json",
      ]).stdout,
    );
    assertLoopbackUrl(status.API_URL, "API target");
    assertLoopbackUrl(status.DB_URL, "DB target");
    if (new URL(status.DB_URL).port !== String(ports.db)) {
      throw new Error("El target DB no usa el puerto temporal asignado.");
    }
    await waitForHealthyUrl(`${status.API_URL}/auth/v1/health`);
    await waitForHealthyUrl(`${status.API_URL}/storage/v1/status`);

    beginPhase("target_pre_restore_gates");
    const targetNetworkExposure = await assertTargetNetworkExposure(
      projectId,
      workdir,
      loopbackNetwork,
      ports,
    );
    const targetImages = imageEvidence(projectId);
    assertExpectedImages(targetImages, "target temporal");
    if (JSON.stringify(targetImages) !== JSON.stringify(sourceImages)) {
      throw new Error(
        "Los tags/digests source-target no coinciden exactamente.",
      );
    }
    const targetStorageRuntimePins = assertStorageRuntimePins(
      projectId,
      "target temporal",
    );
    if (
      JSON.stringify(targetStorageRuntimePins) !==
      JSON.stringify(sourceStorageRuntimePins)
    ) {
      throw new Error("Los pins runtime de Storage source-target difieren.");
    }
    const targetStorageMigrationsBefore = await waitForStorageMigrations(
      container,
      "target temporal pre-restore",
    );
    if (
      JSON.stringify(targetStorageMigrationsBefore) !==
      JSON.stringify(sourceStorageMigrations)
    ) {
      throw new Error(
        "Storage migrations 0–64 (id/nombre/hash) difieren entre source y target.",
      );
    }
    const targetManagedHistoriesBefore = await waitForManagedHistories(
      container,
      managedHistoryIdentity(sourceManagedHistories),
      "target temporal pre-restore",
    );
    if (
      JSON.stringify(managedHistoryIdentity(targetManagedHistoriesBefore)) !==
      JSON.stringify(managedHistoryIdentity(sourceManagedHistories))
    ) {
      throw new Error(
        "Las versiones de los historiales administrados source-target difieren antes del restore.",
      );
    }
    const targetManagedOwnersBefore = queryManagedOwners(container);
    assertExpectedManagedOwners(
      targetManagedOwnersBefore,
      "target temporal pre-restore",
    );
    if (
      JSON.stringify(targetManagedOwnersBefore) !==
      JSON.stringify(sourceManagedOwners)
    ) {
      throw new Error(
        "Los owners administrados Auth/Storage source-target difieren antes del restore.",
      );
    }
    const targetCopySignaturesBefore = queryCopyTableSignatures(
      container,
      managedInventoryDefinitions,
    );
    if (
      JSON.stringify(targetCopySignaturesBefore) !==
      JSON.stringify(sourceCopySignatures)
    ) {
      throw new Error(
        "Las firmas de tablas Auth/Storage usadas por COPY difieren antes del restore.",
      );
    }
    const targetManagedCatalogBefore = queryJson(
      container,
      MANAGED_CATALOG_SQL,
    );
    assertManagedCatalogSnapshot(
      targetManagedCatalogBefore,
      "target temporal pre-restore",
    );
    if (
      sha256CanonicalJson(targetManagedCatalogBefore) !==
      sha256CanonicalJson(sourceManagedCatalog)
    ) {
      throw new Error(
        "El inventario/owner/firma/ACL administrado source-target difiere antes del restore.",
      );
    }
    const targetApplicationTriggerBefore = run("docker", [
      "exec",
      container,
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
      "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created' and not t.tgisinternal",
    ]).stdout.trim();
    if (targetApplicationTriggerBefore !== "0") {
      throw new Error(
        "El target fresco ya contiene inesperadamente on_auth_user_created.",
      );
    }

    const realtimeRoleCount = run("docker", [
      "exec",
      container,
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
      "select count(*) from pg_roles where rolname = 'supabase_realtime_admin'",
    ]).stdout.trim();
    if (realtimeRoleCount !== "1") {
      throw new Error(
        "Realtime no creó normalmente el rol administrado supabase_realtime_admin.",
      );
    }

    const targetDefaultPrivilegesFresh =
      queryRestorableDefaultPrivileges(container);
    beginPhase("restore_roles");
    applySql(container, rolesSql, "roles.sql", "supabase_admin");
    beginPhase("restore_pre_schema_default_privileges");
    applySql(
      container,
      defaultPrivilegesPlan.sql,
      "ACL por defecto pre-schema derivadas del backup",
      "postgres",
    );
    const targetDefaultPrivilegesNormalized =
      queryRestorableDefaultPrivileges(container);
    if (
      JSON.stringify(targetDefaultPrivilegesNormalized) !==
      JSON.stringify(sourceDefaultPrivileges)
    ) {
      throw new Error(
        `Las ACL por defecto pre-schema no coinciden con source: source=${sha256Buffer(Buffer.from(JSON.stringify(sourceDefaultPrivileges)))}, target=${sha256Buffer(Buffer.from(JSON.stringify(targetDefaultPrivilegesNormalized)))}.`,
      );
    }
    beginPhase("restore_schema");
    applySql(container, schemaSql, "schema.sql", "postgres");
    const targetDefaultPrivilegesAfterSchema =
      queryRestorableDefaultPrivileges(container);
    if (
      JSON.stringify(targetDefaultPrivilegesAfterSchema) !==
      JSON.stringify(sourceDefaultPrivileges)
    ) {
      throw new Error(
        "schema.sql alteró las ACL por defecto respecto del source.",
      );
    }
    beginPhase("restore_post_schema_application_acl");
    applySql(
      container,
      applicationAclPlan.sql,
      "ACL de objetos app derivadas del backup",
      "postgres",
    );
    applySql(
      container,
      ownerAclMaterializationPlan.sql,
      "materialización owner ACL firmada",
      "postgres",
    );
    const targetApplicationAclAfterSchema =
      queryApplicationAclSnapshot(container);
    if (
      JSON.stringify(targetApplicationAclAfterSchema) !==
      JSON.stringify(sourceApplicationAcl)
    ) {
      throw new Error(
        `Las ACL de objetos app no coinciden con source: source=${sha256Buffer(Buffer.from(JSON.stringify(sourceApplicationAcl)))}, target=${sha256Buffer(Buffer.from(JSON.stringify(targetApplicationAclAfterSchema)))}, firstDifference=${JSON.stringify(firstArrayDifference(sourceApplicationAcl, targetApplicationAclAfterSchema))}.`,
      );
    }
    beginPhase("restore_data_and_fixture_gate");
    applySql(container, dataSql, "data.sql", "postgres");
    const fixtureMetadataAfterData = fixtureExpected
      ? assertFixtureMetadata(
          container,
          fixtureExpected,
          "inmediatamente después de data.sql",
        )
      : null;
    beginPhase("restore_migration_history_schema");
    applySql(
      container,
      historySchemaSql,
      "migration-history-schema.sql",
      "postgres",
    );
    beginPhase("restore_migration_history_data_and_trigger");
    applySql(
      container,
      `truncate table supabase_migrations.schema_migrations, supabase_migrations.seed_files;\n${historySql}`,
      "migration-history-data.sql",
      "postgres",
    );
    applySql(
      container,
      applicationTriggerSql,
      "trigger app-owned canónico de 0002",
      "postgres",
    );
    const targetManagedHistoriesAfterSql = queryManagedHistories(container);
    if (
      JSON.stringify(targetManagedHistoriesAfterSql) !==
      JSON.stringify(targetManagedHistoriesBefore)
    ) {
      throw new Error(
        "La restauración modificó un historial administrado por Supabase.",
      );
    }
    const targetStorageMigrationsAfterSql = queryStorageMigrations(container);
    assertStorageMigrations(
      targetStorageMigrationsAfterSql,
      "target temporal post-SQL",
    );
    if (
      JSON.stringify(targetStorageMigrationsAfterSql) !==
      JSON.stringify(targetStorageMigrationsBefore)
    ) {
      throw new Error("El restore SQL modificó storage.migrations.");
    }
    const targetManagedOwnersAfterSql = queryManagedOwners(container);
    const targetCopySignaturesAfterSql = queryCopyTableSignatures(
      container,
      managedInventoryDefinitions,
    );
    const targetManagedCatalogAfterSql = queryJson(
      container,
      MANAGED_CATALOG_SQL,
    );
    assertManagedCatalogSnapshot(
      targetManagedCatalogAfterSql,
      "target temporal post-SQL",
    );
    if (
      JSON.stringify(targetManagedOwnersAfterSql) !==
        JSON.stringify(targetManagedOwnersBefore) ||
      JSON.stringify(targetCopySignaturesAfterSql) !==
        JSON.stringify(targetCopySignaturesBefore) ||
      sha256CanonicalJson(targetManagedCatalogAfterSql) !==
        sha256CanonicalJson(targetManagedCatalogBefore)
    ) {
      throw new Error(
        "El restore alteró owners o firmas de tablas administradas Auth/Storage.",
      );
    }

    beginPhase("database_post_restore_validation");
    const targetDefaultPrivilegesAfterRestore =
      queryRestorableDefaultPrivileges(container);
    if (
      JSON.stringify(targetDefaultPrivilegesAfterRestore) !==
      JSON.stringify(sourceDefaultPrivileges)
    ) {
      throw new Error(
        "Las ACL por defecto del target cambiaron durante el restore SQL.",
      );
    }
    const targetApplicationAclAfterRestore =
      queryApplicationAclSnapshot(container);
    if (
      JSON.stringify(targetApplicationAclAfterRestore) !==
      JSON.stringify(sourceApplicationAcl)
    ) {
      throw new Error(
        "Las ACL de objetos app cambiaron durante el restore SQL.",
      );
    }
    const targetCatalog = queryCatalogSnapshot(container);
    assertCatalogMatches(sourceCatalog, targetCatalog);
    const restoredDumpSha256 = verifyTargetDumps(workdir, databaseRoot, {
      sourceCatalog,
      targetCatalog,
      sourceDefaultPrivileges,
      targetDefaultPrivileges: targetDefaultPrivilegesAfterRestore,
    });

    const actualCounts = queryTableCounts(container, expectedCounts);
    for (const [table, expected] of expectedCounts) {
      if (actualCounts.get(table) !== expected) {
        throw new Error(
          `Conteo distinto en ${table}: esperado ${expected}, obtenido ${String(actualCounts.get(table))}.`,
        );
      }
    }
    const actualHistoryCounts = queryTableCounts(container, historyCounts);
    for (const [table, expected] of historyCounts) {
      if (actualHistoryCounts.get(table) !== expected) {
        throw new Error(`Historial distinto en ${table}.`);
      }
    }

    const migrationState = run("docker", [
      "exec",
      container,
      "psql",
      "-X",
      "-A",
      "-t",
      "-F",
      "|",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "select count(*), count(distinct version), min(version), max(version) from supabase_migrations.schema_migrations",
    ]).stdout.trim();
    const expectedMigrationState = `${manifest.database.migrationCount}|${manifest.database.migrationCount}|0001|${manifest.database.migrationHead}`;
    if (migrationState !== expectedMigrationState) {
      throw new Error(
        `Historial de migraciones inesperado: ${migrationState || "vacío"}.`,
      );
    }
    const restoredMigrationVersions = queryMigrationVersions(container);
    if (
      JSON.stringify(restoredMigrationVersions) !==
      JSON.stringify(expectedMigrationVersions)
    ) {
      throw new Error(
        `La secuencia restaurada de migraciones no coincide exactamente con el estado ${migrationReleaseState}.`,
      );
    }

    const triggerCheck = run("docker", [
      "exec",
      container,
      "psql",
      "-X",
      "-A",
      "-t",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and t.tgname='on_auth_user_created' and not t.tgisinternal",
    ]);
    if (triggerCheck.stdout.trim() !== "1") {
      throw new Error(
        "on_auth_user_created no quedó restaurado exactamente una vez.",
      );
    }

    const triggerFixtureId = randomBytes(16).toString("hex");
    const triggerUuid = `${triggerFixtureId.slice(0, 8)}-${triggerFixtureId.slice(8, 12)}-${triggerFixtureId.slice(12, 16)}-${triggerFixtureId.slice(16, 20)}-${triggerFixtureId.slice(20)}`;
    const triggerProbeSequenceState =
      queryRestoreTriggerSequenceState(container);
    let triggerFunctionalCheck;
    try {
      triggerFunctionalCheck = run("docker", [
        "exec",
        container,
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
        `begin; insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('${triggerUuid}', 'authenticated', 'authenticated', 'restore-drill@agorbis.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"username":"restore_drill"}', now(), now()); select count(*) from public.profiles where id='${triggerUuid}'; rollback;`,
      ]);
    } finally {
      restoreTriggerProbeSequenceState(container, triggerProbeSequenceState);
    }
    if (triggerFunctionalCheck.stdout.trim() !== "1") {
      throw new Error(
        "on_auth_user_created existe pero no creó el perfil de prueba.",
      );
    }

    beginPhase("storage_restore_and_metadata_validation");
    const secretKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
    const client = createClient(status.API_URL, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const ownersBeforeBlobRestore = queryStorageOwners(container);
    const storageRowsBeforeBlobRestore = queryStorageRows(container);
    await restoreStorage(client, backupRoot, manifest.storage);
    await verifyRestoredStorage(client, manifest.storage);
    const fixtureMetadataAfterBlobRestore = fixtureExpected
      ? assertFixtureMetadata(
          container,
          fixtureExpected,
          "después de restaurar el blob",
        )
      : null;
    const ownersAfterBlobRestore = queryStorageOwners(container);
    if (
      JSON.stringify(ownersAfterBlobRestore) !==
      JSON.stringify(ownersBeforeBlobRestore)
    ) {
      throw new Error("La carga de blobs alteró owner/owner_id de Storage.");
    }

    if (fixtureExpected) {
      const fixtureOwner = run("docker", [
        "exec",
        container,
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
        `select coalesce(owner::text, '') || '|' || coalesce(owner_id, '') from storage.objects where bucket_id='${manifest.fixture.bucket}' and name='${manifest.fixture.object}'`,
      ]).stdout.trim();
      if (
        fixtureOwner !==
        `${manifest.fixture.ownerId}|${manifest.fixture.ownerId}`
      ) {
        throw new Error(
          `El restore de Storage alteró owner/owner_id del fixture: ${fixtureOwner || "vacío"}.`,
        );
      }
    }

    const { data: authUsers, error: authError } =
      await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (authError || !authUsers) {
      throw new Error(
        `Auth local no pudo leer los usuarios restaurados: ${authError?.message ?? "sin respuesta"}`,
      );
    }

    beginPhase("managed_services_restart_and_validation");
    run("docker", [
      "restart",
      `supabase_auth_${projectId}`,
      `supabase_storage_${projectId}`,
    ]);
    await waitForHealthyUrl(`${status.API_URL}/auth/v1/health`);
    await waitForHealthyUrl(`${status.API_URL}/storage/v1/status`);
    const targetManagedHistoriesAfterRestart = queryManagedHistories(container);
    if (
      JSON.stringify(targetManagedHistoriesAfterRestart) !==
      JSON.stringify(targetManagedHistoriesBefore)
    ) {
      throw new Error(
        "Auth/Storage alteraron un historial administrado después del reinicio.",
      );
    }
    const targetStorageMigrationsAfterRestart =
      queryStorageMigrations(container);
    assertStorageMigrations(
      targetStorageMigrationsAfterRestart,
      "target temporal post-restart",
    );
    if (
      JSON.stringify(targetStorageMigrationsAfterRestart) !==
      JSON.stringify(targetStorageMigrationsBefore)
    ) {
      throw new Error("Storage migrations cambió después del reinicio.");
    }
    const targetManagedOwnersAfterRestart = queryManagedOwners(container);
    const targetCopySignaturesAfterRestart = queryCopyTableSignatures(
      container,
      managedInventoryDefinitions,
    );
    const targetManagedCatalogAfterRestart = queryJson(
      container,
      MANAGED_CATALOG_SQL,
    );
    assertManagedCatalogSnapshot(
      targetManagedCatalogAfterRestart,
      "target temporal post-restart",
    );
    if (
      JSON.stringify(targetManagedOwnersAfterRestart) !==
        JSON.stringify(targetManagedOwnersBefore) ||
      JSON.stringify(targetCopySignaturesAfterRestart) !==
        JSON.stringify(targetCopySignaturesBefore) ||
      sha256CanonicalJson(targetManagedCatalogAfterRestart) !==
        sha256CanonicalJson(targetManagedCatalogBefore)
    ) {
      throw new Error(
        "Auth/Storage alteraron owners o firmas administradas después del reinicio.",
      );
    }
    const restartedStorageVerification = await verifyRestoredStorage(
      client,
      manifest.storage,
    );
    const fixtureMetadataAfterRestart = fixtureExpected
      ? assertFixtureMetadata(
          container,
          fixtureExpected,
          "después de reiniciar Auth/Storage",
        )
      : null;
    const ownersAfterRestart = queryStorageOwners(container);
    if (
      JSON.stringify(ownersAfterRestart) !==
      JSON.stringify(ownersBeforeBlobRestore)
    ) {
      throw new Error(
        "Storage alteró owner/owner_id después del reinicio y verificación.",
      );
    }
    const storageRowsAfterRestore = queryStorageRows(container);
    const storageMetadataDifferences = storageRowDifferences(
      storageRowsBeforeBlobRestore,
      storageRowsAfterRestore,
    );
    const storageMetadataDifferencePolicy =
      assertStorageMetadataDifferencesAreRegenerable(
        storageMetadataDifferences,
      );
    const countsAfterStorage = queryTableCounts(container, expectedCounts);
    for (const [table, expected] of expectedCounts) {
      if (countsAfterStorage.get(table) !== expected) {
        throw new Error(
          `Storage alteró el conteo restaurado en ${table}: esperado ${expected}, obtenido ${String(countsAfterStorage.get(table))}.`,
        );
      }
    }
    const { error: restartedAuthError } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (restartedAuthError) {
      throw new Error(
        `Auth no leyó usuarios después del reinicio: ${restartedAuthError.message}`,
      );
    }
    beginPhase("post_managed_services_data_validation");
    const finalRestoredDataComparison =
      verifyFinalRestoredDataAfterManagedServices(workdir, databaseRoot);
    beginPhase("final_sql_suite_lint_and_dump_diff");
    run("pnpm", ["db.test"], {
      env: {
        ...process.env,
        AGORBIS_DB_CONTAINER: container,
        DATABASE_URL: status.DB_URL,
      },
    });
    const targetDatabaseLint = lintDatabase(workdir, "target temporal final");
    const managedLintParity = assertManagedLintParity(
      sourceBaseline.databaseLint.managed,
      targetDatabaseLint.managed,
    );
    const finalTargetCatalog = queryCatalogSnapshot(container);
    assertCatalogMatches(sourceCatalog, finalTargetCatalog);
    const finalStructuralDumpDiff = verifyTargetDumps(workdir, databaseRoot, {
      includeData: false,
      sourceCatalog,
      targetCatalog: finalTargetCatalog,
      sourceDefaultPrivileges,
      targetDefaultPrivileges: queryRestorableDefaultPrivileges(container),
    });

    beginPhase("final_target_invariants");
    const finalTargetNetworkExposure = await assertTargetNetworkExposure(
      projectId,
      workdir,
      loopbackNetwork,
      ports,
    );
    const networkExposureStability = assertNetworkExposureStable(
      targetNetworkExposure,
      finalTargetNetworkExposure,
    );

    const fixtureVerification = fixtureExpected
      ? restartedStorageVerification.objects.find(
          (object) =>
            object.bucket === manifest.fixture.bucket &&
            object.name === manifest.fixture.object,
        )
      : null;
    if (fixtureExpected && !fixtureVerification) {
      throw new Error("La verificación final no encontró el objeto fixture.");
    }
    if (
      fixtureExpected &&
      (fixtureVerification.bytes !== fixtureExpected.bytes ||
        fixtureVerification.sha256 !== fixtureExpected.sha256 ||
        `${fixtureVerification.bucket}/${fixtureVerification.name}` !==
          fixtureExpected.path)
    ) {
      throw new Error("Bytes, path o SHA-256 final del fixture difieren.");
    }

    report = {
      ok: true,
      target: "isolated-supabase-local",
      projectId,
      backupSource,
      toolchain,
      cliPinnedExactly: true,
      versionPins: Object.fromEntries(
        versionPinFiles.map((name) => [
          name,
          {
            value: sourceVersionPins[name].value,
            sha256: sourceVersionPins[name].sha256,
          },
        ]),
      ),
      imagePins: targetImages,
      networkIsolation: targetNetworkExposure,
      finalNetworkIsolation: finalTargetNetworkExposure,
      networkExposureStability,
      sourceExistingPublishedBindings: sourceBaseline.publishedBindings,
      backupChecksumIndex,
      migrationCount: manifest.database.migrationCount,
      migrationReleaseState,
      migrationVersionsSha256: sha256Buffer(
        Buffer.from(JSON.stringify(restoredMigrationVersions)),
      ),
      migrationFirst: restoredMigrationVersions.at(0),
      migrationLast: restoredMigrationVersions.at(-1),
      verifiedDatabaseTables: expectedCounts.size,
      buckets: manifest.storage.buckets.length,
      objects: manifest.storage.objects.length,
      fixture: fixtureExpected
        ? {
            expected: fixtureExpected,
            afterData: fixtureMetadataAfterData,
            afterBlobRestore: fixtureMetadataAfterBlobRestore,
            afterRestart: fixtureMetadataAfterRestart,
            actualBytes: fixtureVerification.bytes,
            actualPath: `${fixtureVerification.bucket}/${fixtureVerification.name}`,
            actualSha256: fixtureVerification.sha256,
          }
        : null,
      applicationTriggerRestoredFromMigration0002: true,
      applicationTriggerFunctional: true,
      managedSchemaReferenceApplied: false,
      sqlExecutors: {
        "roles.sql": "supabase_admin",
        "pre-schema default ACL from signed schema.sql": "postgres",
        "schema.sql": "postgres",
        "post-schema object ACL from signed schema.sql": "postgres",
        "owner ACL materialization from signed inventory": "postgres",
        "data.sql": "postgres",
        "migration-history-schema.sql": "postgres",
        "migration-history-data.sql": "postgres",
        "0002 app-owned trigger": "postgres",
      },
      migrationHistorySchema: historySchemaValidation,
      defaultPrivileges: {
        sourceSha256: sha256Buffer(
          Buffer.from(JSON.stringify(sourceDefaultPrivileges)),
        ),
        freshTargetSha256: sha256Buffer(
          Buffer.from(JSON.stringify(targetDefaultPrivilegesFresh)),
        ),
        normalizedTargetSha256: sha256Buffer(
          Buffer.from(JSON.stringify(targetDefaultPrivilegesNormalized)),
        ),
        statementsSha256: defaultPrivilegesPlan.sha256,
        canonicalStatements: defaultPrivilegesPlan.count,
        sourceSchemaBackupComparison: sourceBaseline.schemaBackupComparison,
      },
      applicationAcl: {
        sourceEntries: sourceApplicationAcl.length,
        sourceSha256: sha256Buffer(
          Buffer.from(JSON.stringify(sourceApplicationAcl)),
        ),
        targetSha256: sha256Buffer(
          Buffer.from(JSON.stringify(targetApplicationAclAfterRestore)),
        ),
        statementsSha256: applicationAclPlan.sha256,
        canonicalStatements: applicationAclPlan.count,
        inventory: aclInventorySummary,
        ownerMaterialization: ownerAclMaterializationPlan,
      },
      managedHistoriesRestored: false,
      managedHistoriesImmutable: true,
      managedHistoryCounts: Object.fromEntries(
        Object.entries(targetManagedHistoriesAfterRestart).map(
          ([name, rows]) => [name, rows.length],
        ),
      ),
      storageMigrations: {
        count: targetStorageMigrationsAfterRestart.length,
        first: targetStorageMigrationsAfterRestart.at(0)?.id,
        last: targetStorageMigrationsAfterRestart.at(-1)?.id,
        namesAndHashesSha256: expectedStorageMigrationsSha256,
      },
      managedOwnersVerified: targetManagedOwnersAfterRestart.length,
      copyTableSignatures: {
        auth: copyPlan.authDefinitions.length,
        storage: copyPlan.storageDefinitions.length,
        managedInventory: managedInventoryDefinitions.length,
        sha256: sha256Buffer(
          Buffer.from(JSON.stringify(targetCopySignaturesAfterRestart)),
        ),
      },
      storageOwnershipPreserved: true,
      storageProtectedMetadataPreserved: true,
      storageInventoryExact: true,
      storageMetadataDifferences,
      storageMetadataDifferencePolicy,
      sourceBackupCountDifferences: sourceBaseline.backupCountDifferences,
      sourceBackupDataComparison: sourceBaseline.backupDataComparison,
      targetMatchesBackupCounts: true,
      restoredDumpSha256,
      databaseDumpMatchesBackup: true,
      schemaMatchesSource: true,
      managedSchemasMatchSource: true,
      catalogMatchesSource: true,
      catalog: catalogSummary(targetCatalog),
      realtimeManagedRoleAvailable: true,
      authTemplatesRestored: recoveredConfiguration.templateCount,
      authTemplateSha256: recoveredConfiguration.templateSha256,
      recoveryInventorySha256: recoveredConfiguration.inventorySha256,
      recoveryConfigurationInventory:
        recoveredConfiguration.configurationInventory,
      recoveredConfigurationArtifacts:
        recoveredConfiguration.configurationArtifactCount,
      authServiceReadable: true,
      databaseTestsPassed: true,
      databaseLint: {
        application: {
          schemas: targetDatabaseLint.application.schemas,
          sourceIssueCount: sourceBaseline.databaseLint.application.issueCount,
          targetIssueCount: targetDatabaseLint.application.issueCount,
          sourceResultsSha256:
            sourceBaseline.databaseLint.application.resultsSha256,
          targetResultsSha256: targetDatabaseLint.application.resultsSha256,
          clean: true,
        },
        managed: {
          schemas: targetDatabaseLint.managed.schemas,
          sourceWarningCount: sourceBaseline.databaseLint.managed.warningCount,
          targetWarningCount: targetDatabaseLint.managed.warningCount,
          sourceWarningsSha256:
            sourceBaseline.databaseLint.managed.warningsSha256,
          targetWarningsSha256: targetDatabaseLint.managed.warningsSha256,
          sourceWarnings: sourceBaseline.databaseLint.managed.warnings,
          targetWarnings: targetDatabaseLint.managed.warnings,
          ...managedLintParity,
        },
      },
      finalCanonicalDumpDiff: {
        stage: "post-storage-restart-post-sql-suite-post-lint",
        comparison: "backup-to-target canonical pg_dump",
        status: "clean",
        dataComparedAtPostSqlRestore: true,
        structuralArtifactsComparedAtFinalStage: Object.keys(
          finalStructuralDumpDiff,
        ).sort(),
        structuralArtifacts: finalStructuralDumpDiff,
        finalRestoredDataComparison,
        storageDataDifferencesAfterOfficialApiRestore:
          storageMetadataDifferences,
      },
      servicesRestartedAndHealthy: true,
    };
  } catch (error) {
    firstError = error;
  } finally {
    beginPhase("target_cleanup");
    const cleanupErrors = [];
    const recordCleanupError = (phase, error) => {
      cleanupErrors.push(`${phase}: ${error?.message ?? String(error)}`);
    };
    let targetOwnershipValidated = false;
    if (startAttempted) {
      try {
        assertTargetContainerLabels(projectId, workdir);
        assertTargetVolumeLabels(projectId);
        assertTargetCliNetworkLabels(projectId);
        targetOwnershipValidated = true;
      } catch (error) {
        recordCleanupError("validación de ownership", error);
      }

      if (targetOwnershipValidated) {
        const stopResult = run(
          "pnpm",
          [
            "exec",
            "supabase",
            "stop",
            "--project-id",
            projectId,
            "--workdir",
            workdir,
            "--no-backup",
          ],
          { allowFailure: true },
        );
        if (stopResult.status !== 0) {
          recordCleanupError(
            "supabase stop",
            new Error(`exit ${stopResult.status}`),
          );
        }

        try {
          for (const id of assertTargetContainerLabels(projectId, workdir)) {
            run("docker", ["rm", "--force", id]);
          }
        } catch (error) {
          recordCleanupError("fallback de containers", error);
        }
        try {
          for (const id of assertTargetVolumeLabels(projectId)) {
            run("docker", ["volume", "rm", id]);
          }
        } catch (error) {
          recordCleanupError("fallback de volumes", error);
        }
        try {
          for (const id of assertTargetCliNetworkLabels(projectId)) {
            run("docker", ["network", "rm", id]);
          }
        } catch (error) {
          recordCleanupError("fallback de networks CLI", error);
        }
      }
    }

    if (loopbackNetwork) {
      try {
        removeLoopbackNetwork(loopbackNetwork, projectId, workdir);
      } catch (error) {
        recordCleanupError("red loopback temporal", error);
      }
    }

    try {
      const remaining = projectResources(projectId);
      const namedLeaks = projectNamedResourceLeaks(projectId);
      if (
        remaining.containers.length > 0 ||
        remaining.volumes.length > 0 ||
        remaining.networks.length > 0 ||
        namedLeaks.length > 0
      ) {
        throw new Error(
          `quedaron recursos: ${[
            ...remaining.containers,
            ...remaining.volumes,
            ...remaining.networks,
            ...namedLeaks,
          ].join(", ")}`,
        );
      }
    } catch (error) {
      recordCleanupError("inventario final Docker", error);
    }

    try {
      if (
        !path.basename(workdir).startsWith("agorbis-restore-drill-") ||
        path.dirname(workdir) !== path.resolve(tmpdir())
      ) {
        throw new Error(`workdir rechazado por la guarda: ${workdir}`);
      }
      rmSync(workdir, { recursive: true, force: false });
    } catch (error) {
      recordCleanupError("directorio temporal", error);
    }

    if (cleanupErrors.length > 0) {
      const cleanupMessage = cleanupErrors.join(" | ");
      if (firstError) firstError.cleanupError = cleanupMessage;
      else firstError = new Error(`La limpieza local falló: ${cleanupMessage}`);
    }
  }

  if (firstError) throw firstError;

  if (!report || !sourceBaseline) {
    throw new Error("El drill terminó sin producir evidencia completa.");
  }
  beginPhase("source_postflight_and_residue_audit");
  const finalSourceCatalog = queryCatalogSnapshot(sourceContainer);
  assertCatalogMatches(sourceBaseline.catalog, finalSourceCatalog);
  const finalSourceCounts = queryTableCounts(sourceContainer, expectedCounts);
  assertMapsEqual(
    sourceBaseline.tableCounts,
    finalSourceCounts,
    "Los conteos DB",
  );
  const finalSourceMigrations = queryMigrationVersions(sourceContainer);
  if (
    JSON.stringify(finalSourceMigrations) !==
    JSON.stringify(sourceBaseline.migrations)
  ) {
    throw new Error(
      "Las migraciones del stack local original cambiaron durante el drill.",
    );
  }
  if (
    JSON.stringify(projectResources("agorbis")) !==
    JSON.stringify(sourceBaseline.resources)
  ) {
    throw new Error(
      "Los recursos Docker del stack local original cambiaron durante el drill.",
    );
  }
  if (
    JSON.stringify(queryStorageOwners(sourceContainer)) !==
      JSON.stringify(sourceBaseline.storageOwners) ||
    JSON.stringify(queryStorageRows(sourceContainer)) !==
      JSON.stringify(sourceBaseline.storageRows) ||
    queryFixtureBucketCount(sourceContainer) !== 0
  ) {
    throw new Error(
      "Storage del stack local original cambió o conserva un fixture temporal.",
    );
  }
  if (
    JSON.stringify(imageEvidence("agorbis")) !==
      JSON.stringify(sourceBaseline.images) ||
    JSON.stringify(queryStorageMigrations(sourceContainer)) !==
      JSON.stringify(sourceBaseline.storageMigrations) ||
    JSON.stringify(queryManagedHistories(sourceContainer)) !==
      JSON.stringify(sourceBaseline.managedHistories) ||
    JSON.stringify(queryManagedOwners(sourceContainer)) !==
      JSON.stringify(sourceBaseline.managedOwners) ||
    sha256CanonicalJson(queryJson(sourceContainer, MANAGED_CATALOG_SQL)) !==
      sha256CanonicalJson(sourceBaseline.managedCatalog) ||
    JSON.stringify(queryRestorableDefaultPrivileges(sourceContainer)) !==
      JSON.stringify(sourceBaseline.defaultPrivileges) ||
    JSON.stringify(queryApplicationAclSnapshot(sourceContainer)) !==
      JSON.stringify(sourceBaseline.applicationAcl) ||
    JSON.stringify(
      queryCopyTableSignatures(sourceContainer, managedInventoryDefinitions),
    ) !== JSON.stringify(sourceBaseline.copySignatures) ||
    JSON.stringify(storageRuntimePins("agorbis")) !==
      JSON.stringify(sourceBaseline.storageRuntimePins) ||
    JSON.stringify(publishedHostIps("agorbis")) !==
      JSON.stringify(sourceBaseline.publishedBindings)
  ) {
    throw new Error(
      "Las imágenes, historiales, owners, firmas o bindings del stack original cambiaron.",
    );
  }
  const finalSourceStatus = parseStatus(
    run("pnpm", ["exec", "supabase", "status", "--output", "json"]).stdout,
  );
  if (
    finalSourceStatus.API_URL !== sourceBaseline.status.apiUrl ||
    finalSourceStatus.DB_URL !== sourceBaseline.status.dbUrl
  ) {
    throw new Error("Los endpoints del stack local original cambiaron.");
  }
  await waitForHealthyUrl(`${finalSourceStatus.API_URL}/auth/v1/health`);
  await waitForHealthyUrl(`${finalSourceStatus.API_URL}/storage/v1/status`);
  const finalSourceDataSha256 = verifySourceDataUnchanged(
    sourceBaseline.dataSha256,
  );
  if (
    JSON.stringify(restoreTempDirectories()) !==
    JSON.stringify(initialRestoreTempDirectories)
  ) {
    throw new Error(
      "El drill dejó un directorio temporal nuevo o alteró uno preexistente.",
    );
  }
  if (
    projectResources(projectId).containers.length > 0 ||
    projectResources(projectId).volumes.length > 0 ||
    projectResources(projectId).networks.length > 0 ||
    projectNamedResourceLeaks(projectId).length > 0
  ) {
    throw new Error("El target temporal reapareció después de la limpieza.");
  }

  const drillEndedAt = process.hrtime.bigint();
  const measuredPhases = finishPhaseTimings(drillEndedAt);
  const durationNanoseconds = drillEndedAt - drillStartedAt;
  const durationMilliseconds = Number(durationNanoseconds) / 1_000_000;
  report.phaseTimings = measuredPhases;
  report.phaseDurationNanoseconds = measuredPhases
    .reduce((total, phase) => total + BigInt(phase.durationNanoseconds), 0n)
    .toString();
  report.durationNanoseconds = durationNanoseconds.toString();
  report.durationMilliseconds = Number(durationMilliseconds.toFixed(3));
  report.durationSeconds = Number((durationMilliseconds / 1000).toFixed(3));
  report.sourceStackIntact = true;
  report.sourceStack = {
    projectId: "agorbis",
    migrationCount: finalSourceMigrations.length,
    containers: sourceBaseline.resources.containers.length,
    volumes: sourceBaseline.resources.volumes.length,
    buckets: finalSourceCounts.get("storage.buckets"),
    objects: finalSourceCounts.get("storage.objects"),
    fixtureBuckets: 0,
    storageMigrations: sourceBaseline.storageMigrations.length,
    managedHistoriesIntact: true,
    managedOwnersIntact: true,
    copySignaturesIntact: true,
    dataSha256: finalSourceDataSha256,
    authAndStorageHealthy: true,
  };
  report.cleanup = {
    containers: 0,
    volumes: 0,
    networks: 0,
    newTemporaryDirectories: 0,
  };
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  const drillEndedAt = process.hrtime.bigint();
  let measuredPhases = [];
  let timingError = null;
  try {
    measuredPhases = finishPhaseTimings(drillEndedAt);
  } catch (phaseError) {
    timingError = phaseError.message;
  }
  const durationNanoseconds = drillEndedAt - drillStartedAt;
  const durationMilliseconds = Number(durationNanoseconds) / 1_000_000;
  console.error(`Restore drill Agorbis: FALLÓ — ${error.message}`);
  console.error(
    JSON.stringify({
      ok: false,
      target: "isolated-supabase-local",
      durationNanoseconds: durationNanoseconds.toString(),
      durationMilliseconds: Number(durationMilliseconds.toFixed(3)),
      durationSeconds: Number((durationMilliseconds / 1000).toFixed(3)),
      phaseTimings: measuredPhases,
      timingError,
      error: error.message,
      cleanupError: error.cleanupError ?? null,
    }),
  );
  process.exitCode = 1;
});
