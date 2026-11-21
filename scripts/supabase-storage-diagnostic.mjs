import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceProjectId = "agorbis";
const sourceContainer = "supabase_db_agorbis";
const startedAt = process.hrtime.bigint();
const pinSourceVersions = process.argv.includes("--pin-source-versions");
const unexpectedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--pin-source-versions");
if (unexpectedArguments.length > 0) {
  throw new Error(`Argumentos inesperados: ${unexpectedArguments.join(", ")}.`);
}

const versionPinFiles = [
  "gotrue-version",
  "postgres-version",
  "rest-version",
  "storage-migration",
  "storage-version",
];

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} falló (${result.status}).`);
  }
  return result;
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
  const ports = new Set();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

function writeConfig(workdir, projectId, ports) {
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

[analytics]
enabled = false
`,
    { mode: 0o600 },
  );
}

function readSourceVersionPins() {
  return Object.fromEntries(
    versionPinFiles.map((name) => {
      const value = readFileSync(
        path.join(root, "supabase", ".temp", name),
        "utf8",
      ).trim();
      if (!/^[A-Za-z0-9._-]+$/.test(value)) {
        throw new Error(`Pin local inválido en ${name}.`);
      }
      return [name, value];
    }),
  );
}

function writeTargetVersionPins(workdir, pins) {
  const target = path.join(workdir, "supabase", ".temp");
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const [name, value] of Object.entries(pins)) {
    writeFileSync(path.join(target, name), value, { mode: 0o600 });
  }
}

function queryStorageSnapshot(container) {
  const exists = run("docker", [
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
    "select to_regclass('storage.migrations') is not null",
  ]).stdout.trim();
  if (exists !== "t") return { migrationTableExists: false };

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
      'migrationTableExists', true,
      'migrationTableColumns', (
        select jsonb_agg(column_name order by ordinal_position)
        from information_schema.columns
        where table_schema = 'storage' and table_name = 'migrations'
      ),
      'migrationCount', (select count(*) from storage.migrations),
      'migrationMin', (select min(id) from storage.migrations),
      'migrationMax', (select max(id) from storage.migrations),
      'migrations', (
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'name', name,
          'hash', hash,
          'executedAt', executed_at
        ) order by id)
        from storage.migrations
      ),
      'bucketColumns', (
        select jsonb_agg(column_name order by ordinal_position)
        from information_schema.columns
        where table_schema = 'storage' and table_name = 'buckets'
      ),
      'versioningStatusExists', exists(
        select 1 from information_schema.columns
        where table_schema = 'storage'
          and table_name = 'buckets'
          and column_name = 'versioning_status'
      ),
      'versioningConstraints', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', conname,
          'definition', pg_get_constraintdef(oid)
        ) order by conname), '[]'::jsonb)
        from pg_constraint
        where conrelid = 'storage.buckets'::regclass
          and conname like '%versioning%'
      )
    )::text`,
  ]);
  return JSON.parse(result.stdout.trim());
}

function safeStorageEnvironment(container) {
  const result = run("docker", [
    "inspect",
    container,
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
  ]);
  const allowed = new Set([
    "DB_MIGRATIONS_FREEZE_AT",
    "FILE_SIZE_LIMIT",
    "S3_PROTOCOL_ENABLED",
    "S3_PROTOCOL_PREFIX",
    "STORAGE_BACKEND",
    "STORAGE_S3_REGION",
    "GLOBAL_S3_BUCKET",
    "VECTOR_STORE_MIGRATIONS_ENABLED",
    "VERSION",
  ]);
  return Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
      .filter(([key]) => allowed.has(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function imageEvidence(container) {
  const inspect = JSON.parse(run("docker", ["inspect", container]).stdout)[0];
  const image = JSON.parse(
    run("docker", ["image", "inspect", inspect.Image]).stdout,
  )[0];
  return {
    container,
    configuredTag: inspect.Config.Image,
    imageId: inspect.Image,
    repoDigests: image.RepoDigests ?? [],
    createdAt: inspect.Created,
    running: inspect.State.Running,
    health: inspect.State.Health?.Status ?? null,
    portBindings: inspect.HostConfig.PortBindings ?? {},
  };
}

function serviceEvidence(projectId) {
  return ["db", "storage", "auth", "realtime", "rest", "kong"].map((service) =>
    imageEvidence(`supabase_${service}_${projectId}`),
  );
}

function migrationFileEvidence(storageContainer) {
  const file = "/app/migrations/tenant/0062-object-versioning-core.sql";
  const exists = run("docker", ["exec", storageContainer, "test", "-f", file], {
    allowFailure: true,
  });
  if (exists.status !== 0) {
    return { path: file, exists: false };
  }
  const hash = run("docker", [
    "exec",
    storageContainer,
    "sha256sum",
    file,
  ]).stdout.trim();
  const content = run("docker", [
    "exec",
    storageContainer,
    "sed",
    "-n",
    "1,120p",
    file,
  ]).stdout;
  return {
    path: file,
    exists: true,
    sha256: hash.split(/\s+/)[0],
    addsVersioningStatus:
      /ALTER TABLE storage\.buckets[\s\S]*ADD COLUMN IF NOT EXISTS versioning_status/.test(
        content,
      ),
  };
}

async function readinessSnapshot(projectId, apiUrl, elapsedMilliseconds) {
  const storageContainer = `supabase_storage_${projectId}`;
  const inspect = run(
    "docker",
    [
      "inspect",
      storageContainer,
      "--format",
      "{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
    ],
    { allowFailure: true },
  );
  let httpStatus = null;
  try {
    const response = await fetch(`${apiUrl}/storage/v1/status`, {
      signal: AbortSignal.timeout(750),
    });
    httpStatus = response.status;
  } catch {
    // El endpoint aún no está listo.
  }
  return {
    elapsedMilliseconds,
    container: inspect.status === 0 ? inspect.stdout.trim() : "missing",
    httpStatus,
    database: queryStorageSnapshot(`supabase_db_${projectId}`),
  };
}

function resourceNames(projectId) {
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

function labelledResources(projectId) {
  const commands = [
    [
      "ps",
      "-a",
      "--format",
      "{{.Names}}",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
    ],
    [
      "volume",
      "ls",
      "--format",
      "{{.Name}}",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
    ],
    [
      "network",
      "ls",
      "--format",
      "{{.Name}}",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
    ],
  ];
  return commands.flatMap((args) =>
    run("docker", args).stdout.trim().split("\n").filter(Boolean),
  );
}

function assertTargetContainerLabels(projectId, workdir) {
  const ids = run("docker", [
    "ps",
    "-a",
    "-q",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  for (const id of ids) {
    const labels = run("docker", [
      "inspect",
      id,
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
    ]).stdout.trim();
    if (labels !== `${projectId}|${workdir}`) {
      throw new Error(`Labels inesperados antes del cleanup: ${labels}.`);
    }
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const sourceLabels = run("docker", [
    "inspect",
    sourceContainer,
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}|{{index .Config.Labels "com.supabase.cli.workdir"}}',
  ]).stdout.trim();
  if (sourceLabels !== `${sourceProjectId}|${root}`) {
    throw new Error(`El source no pertenece al workspace: ${sourceLabels}.`);
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
  const cliVersion = installedPackage.version;
  if (
    typeof cliVersion !== "string" ||
    packageJson.devDependencies?.supabase !== cliVersion
  ) {
    throw new Error("No se pudo identificar Supabase CLI desde el paquete.");
  }
  const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
  if (!lockfile.includes(`supabase@${cliVersion}:`)) {
    throw new Error("La versión del CLI no coincide con pnpm-lock.yaml.");
  }

  const source = {
    projectId: sourceProjectId,
    services: serviceEvidence(sourceProjectId),
    storageEnvironment: safeStorageEnvironment(
      `supabase_storage_${sourceProjectId}`,
    ),
    storage: queryStorageSnapshot(sourceContainer),
    migration62: migrationFileEvidence(`supabase_storage_${sourceProjectId}`),
  };
  const sourceVersionPins = readSourceVersionPins();

  const suffix = randomBytes(5).toString("hex");
  const projectId = `agorbis-storage-diagnostic-${suffix}`;
  const portsArray = await allocatePorts(4);
  const ports = {
    api: portsArray[0],
    db: portsArray[1],
    shadow: portsArray[2],
    site: portsArray[3],
  };
  const preexistingTempDirectories = readdirSync(tmpdir())
    .filter((name) => name.startsWith("agorbis-storage-diagnostic-"))
    .sort();
  const workdir = mkdtempSync(
    path.join(tmpdir(), "agorbis-storage-diagnostic-"),
  );
  writeConfig(workdir, projectId, ports);
  if (pinSourceVersions) {
    writeTargetVersionPins(workdir, sourceVersionPins);
  }
  let startAttempted = false;
  let report;
  let primaryError;
  try {
    if (
      resourceNames(projectId).length > 0 ||
      labelledResources(projectId).length > 0
    ) {
      throw new Error("El project ID diagnóstico ya tiene recursos Docker.");
    }
    startAttempted = true;
    const startBeganAt = process.hrtime.bigint();
    run("pnpm", [
      "exec",
      "supabase",
      "start",
      "--workdir",
      workdir,
      "--exclude",
      "imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
    ]);
    const startReturnedAt = process.hrtime.bigint();
    const apiUrl = `http://127.0.0.1:${ports.api}`;

    const observedAfterStartSeconds = pinSourceVersions ? 2 : 30;
    const readiness = [];
    for (let second = 0; second <= observedAfterStartSeconds; second += 1) {
      readiness.push(
        await readinessSnapshot(
          projectId,
          apiUrl,
          Number(process.hrtime.bigint() - startReturnedAt) / 1_000_000,
        ),
      );
      if (second < observedAfterStartSeconds) await sleep(1000);
    }
    const first = readiness[0];
    const last = readiness.at(-1);
    const schemaStates = readiness.map((sample) => ({
      migrationCount: sample.database.migrationCount ?? null,
      migrationMax: sample.database.migrationMax ?? null,
      versioningStatusExists: sample.database.versioningStatusExists ?? false,
    }));
    const uniqueSchemaStates = [
      ...new Map(
        schemaStates.map((state) => [JSON.stringify(state), state]),
      ).values(),
    ];

    report = {
      ok: true,
      diagnosticOnly: true,
      applicationRestoreSqlExecuted: false,
      cli: {
        version: cliVersion,
        lockfilePinned: true,
      },
      source,
      target: {
        projectId,
        pinSourceVersions,
        versionPins: pinSourceVersions ? sourceVersionPins : {},
        startDurationMilliseconds:
          Number(startReturnedAt - startBeganAt) / 1_000_000,
        services: serviceEvidence(projectId),
        storageEnvironment: safeStorageEnvironment(
          `supabase_storage_${projectId}`,
        ),
        storage: last.database,
        migration62: migrationFileEvidence(`supabase_storage_${projectId}`),
        readiness: {
          observedAfterStartSeconds,
          first,
          last,
          uniqueSchemaStates,
          httpWasReadyInEverySample: readiness.every(
            (sample) => sample.httpStatus === 200,
          ),
        },
      },
    };
  } catch (error) {
    primaryError = error;
  } finally {
    let cleanupError;
    try {
      if (
        startAttempted &&
        (resourceNames(projectId).length > 0 ||
          labelledResources(projectId).length > 0)
      ) {
        assertTargetContainerLabels(projectId, workdir);
        run("pnpm", [
          "exec",
          "supabase",
          "stop",
          "--project-id",
          projectId,
          "--workdir",
          workdir,
          "--no-backup",
        ]);
      }
      const remaining = [
        ...new Set([
          ...resourceNames(projectId),
          ...labelledResources(projectId),
        ]),
      ];
      if (remaining.length > 0) {
        throw new Error(
          `Quedaron recursos del diagnóstico: ${remaining.join(", ")}.`,
        );
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      try {
        if (
          path.dirname(workdir) === path.resolve(tmpdir()) &&
          path.basename(workdir).startsWith("agorbis-storage-diagnostic-")
        ) {
          rmSync(workdir, { recursive: true, force: false });
        }
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) {
      if (primaryError) primaryError.cleanupError = cleanupError.message;
      else primaryError = cleanupError;
    }
  }

  if (primaryError) throw primaryError;
  const finalSource = {
    services: serviceEvidence(sourceProjectId),
    storageEnvironment: safeStorageEnvironment(
      `supabase_storage_${sourceProjectId}`,
    ),
    storage: queryStorageSnapshot(sourceContainer),
    migration62: migrationFileEvidence(`supabase_storage_${sourceProjectId}`),
  };
  if (
    JSON.stringify(finalSource) !==
    JSON.stringify({
      services: source.services,
      storageEnvironment: source.storageEnvironment,
      storage: source.storage,
      migration62: source.migration62,
    })
  ) {
    throw new Error("El stack source cambió durante el diagnóstico.");
  }
  const finalTempDirectories = readdirSync(tmpdir())
    .filter((name) => name.startsWith("agorbis-storage-diagnostic-"))
    .sort();
  if (
    JSON.stringify(finalTempDirectories) !==
    JSON.stringify(preexistingTempDirectories)
  ) {
    throw new Error("El diagnóstico dejó un directorio temporal.");
  }
  const durationNanoseconds = process.hrtime.bigint() - startedAt;
  report.durationNanoseconds = durationNanoseconds.toString();
  report.sourceIntact = true;
  report.cleanup = {
    containers: 0,
    volumes: 0,
    networks: 0,
    temporaryDirectories: 0,
  };
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  const durationNanoseconds = process.hrtime.bigint() - startedAt;
  console.error(
    JSON.stringify({
      ok: false,
      diagnosticOnly: true,
      durationNanoseconds: durationNanoseconds.toString(),
      error: error.message,
      cleanupError: error.cleanupError ?? null,
    }),
  );
  process.exitCode = 1;
});
