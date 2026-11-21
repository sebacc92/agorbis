import { createHash, X509Certificate } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

export const PRODUCTION_QUERY_PROJECT_REF = "ibtvlvpxwourrxwcrfkf";
export const PRODUCTION_QUERY_POOLER_HOST =
  "aws-0-us-east-2.pooler.supabase.com";
export const PRODUCTION_QUERY_POSTGRES_IMAGE =
  "public.ecr.aws/supabase/postgres:17.6.1.155";
export const PRODUCTION_QUERY_POSTGRES_IMAGE_ID =
  "sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b";
export const PRODUCTION_QUERY_POSTGRES_REPO_DIGEST =
  "public.ecr.aws/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b";
export const PRODUCTION_QUERY_CA_RELATIVE_PATH =
  "config/ssl/supabase-root-2021-ca.crt";
export const PRODUCTION_QUERY_CA_CONTAINER_PATH =
  "/opt/agorbis/tls/supabase-root-2021-ca.crt";
export const PRODUCTION_QUERY_CA_SHA256 =
  "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7";
export const PRODUCTION_QUERY_CA_FINGERPRINT_SHA256 =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";
export const PRODUCTION_QUERY_CA_DISTINGUISHED_NAME =
  "C=US\nST=Delware\nL=New Castle\nO=Supabase Inc\nCN=Supabase Root 2021 CA";
export const PRODUCTION_QUERY_CA_SERIAL =
  "6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6";
export const PRODUCTION_QUERY_CA_VALID_FROM = "Apr 28 10:56:53 2021 GMT";
export const PRODUCTION_QUERY_CA_VALID_TO = "Apr 26 10:56:53 2031 GMT";

const PRODUCTION_DUMP_SCRIPT_CONTAINER_ROOT =
  "/opt/agorbis/supabase-cli-2.115.0";
const PRODUCTION_DUMP_SCRIPTS = Object.freeze({
  data: Object.freeze({
    relativePath: "scripts/vendor/supabase-cli-2.115.0/dump_data.sh",
    containerPath: `${PRODUCTION_DUMP_SCRIPT_CONTAINER_ROOT}/dump_data.sh`,
    sha256: "c943c7a926122ea0649ddd4bf9b8fb9b12bed23ac9f33da0b489ac83e687d241",
  }),
  roles: Object.freeze({
    relativePath: "scripts/vendor/supabase-cli-2.115.0/dump_role.sh",
    containerPath: `${PRODUCTION_DUMP_SCRIPT_CONTAINER_ROOT}/dump_role.sh`,
    sha256: "cc442e4f19d349b7db1dde69913ed06ef20f68198391d9beef33f63493cf26c8",
  }),
  schema: Object.freeze({
    relativePath: "scripts/vendor/supabase-cli-2.115.0/dump_schema.sh",
    containerPath: `${PRODUCTION_DUMP_SCRIPT_CONTAINER_ROOT}/dump_schema.sh`,
    sha256: "5cd57189f6565ddf651ff149995398a4c9b1971ca34a0093a77c011a41f21d64",
  }),
});

// Exact ordered values from supabase/cli v2.115.0 pkg/migration/dump.go.
const CLI_2_115_INTERNAL_SCHEMAS = Object.freeze([
  "information_schema",
  "pg_*",
  "_analytics",
  "_realtime",
  "_supavisor",
  "auth",
  "etl",
  "extensions",
  "pgbouncer",
  "realtime",
  "storage",
  "supabase_functions",
  "supabase_migrations",
  "cron",
  "dbdev",
  "graphql",
  "graphql_public",
  "net",
  "pgmq",
  "pgsodium",
  "pgsodium_masks",
  "pgtle",
  "repack",
  "tiger",
  "tiger_data",
  "timescaledb_*",
  "_timescaledb_*",
  "topology",
  "vault",
]);
const CLI_2_115_DATA_EXCLUDED_SCHEMAS = Object.freeze([
  "information_schema",
  "pg_*",
  "graphql",
  "graphql_public",
  "pgsodium",
  "pgsodium_masks",
  "pgtle",
  "repack",
  "tiger",
  "tiger_data",
  "timescaledb_*",
  "_timescaledb_*",
  "topology",
  "vault",
  "etl",
  "extensions",
  "pgbouncer",
  "realtime",
  "supabase_migrations",
  "_analytics",
  "_realtime",
  "_supavisor",
]);
const CLI_2_115_RESERVED_ROLES = Object.freeze([
  "anon",
  "authenticated",
  "authenticator",
  "cli_login_.*",
  "dashboard_user",
  "pgbouncer",
  "postgres",
  "service_role",
  "supabase_.*",
  "pgsodium_keyholder",
  "pgsodium_keyiduser",
  "pgsodium_keymaker",
  "pgtle_admin",
]);
const CLI_2_115_ALLOWED_CONFIGS = Object.freeze([
  "pgaudit.*",
  "pgrst.*",
  "session_replication_role",
  "statement_timeout",
  "track_io_timing",
]);
export const EXPECTED_REMOTE_DUMP_DRY_RUN_STDERR =
  "DRY RUN: *only* printing the pg_dump script to console.\n" +
  "Dumping schemas from remote database...\n";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertPinnedRegularFile(filePath, expectedSha256, label) {
  let metadata;
  let bytes;
  try {
    metadata = lstatSync(filePath);
    bytes = readFileSync(filePath);
  } catch {
    throw new Error(`${label} fijado no existe o no puede leerse.`);
  }
  invariant(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${label} fijado debe ser un archivo regular, no un symlink.`,
  );
  invariant(
    realpathSync(filePath) === filePath,
    `${label} fijado no puede atravesar symlinks.`,
  );
  invariant(
    sha256(bytes) === expectedSha256,
    `${label} no coincide con SHA-256.`,
  );
  return bytes;
}

function assertExactAssetHostPath(repositoryRoot, hostPath, relativePath) {
  invariant(
    typeof repositoryRoot === "string" &&
      path.isAbsolute(repositoryRoot) &&
      path.resolve(repositoryRoot) === repositoryRoot &&
      !/[\r\n\0,]/.test(repositoryRoot),
    "La raíz del repositorio para assets productivos no es canónica.",
  );
  const expected = path.join(repositoryRoot, relativePath);
  invariant(
    typeof hostPath === "string" &&
      path.isAbsolute(hostPath) &&
      hostPath === expected &&
      !/[\r\n\0,]/.test(hostPath),
    "La ruta host del asset productivo no coincide exactamente con el pin.",
  );
  return expected;
}

function assertProductionBackupAssets(assets) {
  invariant(
    assets && typeof assets === "object" && Object.isFrozen(assets),
    "Faltan los assets productivos validados.",
  );
  const caPath = assertExactAssetHostPath(
    assets.repositoryRoot,
    assets.caHostPath,
    PRODUCTION_QUERY_CA_RELATIVE_PATH,
  );
  const pem = assertPinnedRegularFile(
    caPath,
    PRODUCTION_QUERY_CA_SHA256,
    "Supabase Root 2021 CA",
  );
  let certificate;
  try {
    certificate = new X509Certificate(pem);
  } catch {
    throw new Error("Supabase Root 2021 CA no contiene un X.509 válido.");
  }
  invariant(
    certificate.fingerprint256 === PRODUCTION_QUERY_CA_FINGERPRINT_SHA256 &&
      certificate.subject === PRODUCTION_QUERY_CA_DISTINGUISHED_NAME &&
      certificate.issuer === PRODUCTION_QUERY_CA_DISTINGUISHED_NAME &&
      certificate.serialNumber === PRODUCTION_QUERY_CA_SERIAL &&
      certificate.validFrom === PRODUCTION_QUERY_CA_VALID_FROM &&
      certificate.validTo === PRODUCTION_QUERY_CA_VALID_TO &&
      certificate.ca === true &&
      Date.now() >= Date.parse(PRODUCTION_QUERY_CA_VALID_FROM) &&
      Date.now() <= Date.parse(PRODUCTION_QUERY_CA_VALID_TO),
    "La identidad X.509 de Supabase Root 2021 CA no coincide con el pin.",
  );
  for (const [kind, specification] of Object.entries(PRODUCTION_DUMP_SCRIPTS)) {
    const hostPath = assertExactAssetHostPath(
      assets.repositoryRoot,
      assets.dumpScriptHostPaths?.[kind],
      specification.relativePath,
    );
    assertPinnedRegularFile(
      hostPath,
      specification.sha256,
      `Script oficial ${kind} de Supabase CLI 2.115.0`,
    );
  }
  return true;
}

export function loadProductionBackupAssets(repositoryRoot) {
  invariant(
    typeof repositoryRoot === "string" &&
      path.isAbsolute(repositoryRoot) &&
      path.resolve(repositoryRoot) === repositoryRoot &&
      realpathSync(repositoryRoot) === repositoryRoot,
    "La raíz del repositorio debe ser absoluta y canónica.",
  );
  const dumpScriptHostPaths = Object.freeze(
    Object.fromEntries(
      Object.entries(PRODUCTION_DUMP_SCRIPTS).map(([kind, specification]) => [
        kind,
        path.join(repositoryRoot, specification.relativePath),
      ]),
    ),
  );
  const assets = Object.freeze({
    repositoryRoot,
    caHostPath: path.join(repositoryRoot, PRODUCTION_QUERY_CA_RELATIVE_PATH),
    dumpScriptHostPaths,
  });
  assertProductionBackupAssets(assets);
  return assets;
}

function isProductionConnection(connection) {
  if (!connection || typeof connection !== "object") return false;
  const direct =
    connection.host === `db.${PRODUCTION_QUERY_PROJECT_REF}.supabase.co` &&
    connection.user === "postgres" &&
    connection.port === "5432";
  const pooler =
    connection.host === PRODUCTION_QUERY_POOLER_HOST &&
    connection.user === `postgres.${PRODUCTION_QUERY_PROJECT_REF}` &&
    connection.port === "5432";
  return (direct || pooler) && connection.database === "postgres";
}

function parsePlainExport(line, name) {
  const match = line.match(new RegExp(`^export ${name}=\"([^\"\\r\\n]+)\"$`));
  invariant(match, `El dry-run no declaró ${name} de forma canónica.`);
  return match[1];
}

function assertKnownDumpScriptSuffix(lines) {
  invariant(
    lines[0] === "# Explanation of pg_dump flags:",
    "El cuerpo del dry-run de pg_dump es inesperado.",
  );
  let pgDumpLines = 0;
  let blankContinuationLines = 0;
  const dumpFlags = [];
  const sedPipeline = [];
  for (const [index, line] of lines.entries()) {
    if (line === "") {
      invariant(
        pgDumpLines === 0 ||
          (index === lines.length - 1 && sedPipeline.length === 26),
        "El dry-run contiene una línea vacía dentro del pipeline.",
      );
      continue;
    }
    if (line.startsWith("#")) {
      invariant(
        pgDumpLines === 0,
        "El dry-run contiene comentarios dentro del pipeline.",
      );
      continue;
    }
    if (line === "pg_dump \\") {
      pgDumpLines += 1;
      continue;
    }
    if (line === "     \\") {
      blankContinuationLines += 1;
      continue;
    }
    const flag = line.match(/^ {4}(--[a-z-]+)(?: \"([^\"\r\n]*)\")? \\$/);
    if (flag) {
      dumpFlags.push({ name: flag[1], value: flag[2] ?? null });
      continue;
    }
    if (
      /^\| sed -E (?:'[^'\r\n]*'|\"(?:[^\"\\\r\n]|\\[^\r\n])*\")(?: \\)?$/.test(
        line,
      )
    ) {
      sedPipeline.push(line);
      continue;
    }
    throw new Error("El dry-run contiene una instrucción no reconocida.");
  }
  invariant(
    pgDumpLines === 1 &&
      blankContinuationLines === 1 &&
      JSON.stringify(dumpFlags.map(({ name }) => name)) ===
        JSON.stringify([
          "--schema-only",
          "--quote-all-identifier",
          "--role",
          "--exclude-schema",
        ]) &&
      dumpFlags[0].value === null &&
      dumpFlags[1].value === null &&
      dumpFlags[2].value === "postgres" &&
      typeof dumpFlags[3].value === "string" &&
      dumpFlags[3].value.length > 0 &&
      sedPipeline.length === 26 &&
      sedPipeline.slice(0, -1).every((line) => line.endsWith(" \\")) &&
      sedPipeline.at(-1) === '| sed -E "/^--/d"',
    "El dry-run no contiene el pipeline pg_dump/sed esperado.",
  );
}

export function parseProductionDumpDryRun(
  output,
  { expectedPassword, projectRef = PRODUCTION_QUERY_PROJECT_REF } = {},
) {
  invariant(
    typeof output === "string" &&
      output.length > 0 &&
      output.length <= 256 * 1024 &&
      !output.includes("\0") &&
      !output.includes("\r") &&
      output.endsWith("\n"),
    "La salida del dry-run es inválida.",
  );
  invariant(
    typeof expectedPassword === "string" &&
      expectedPassword.length >= 8 &&
      expectedPassword.length <= 1024 &&
      !/[\r\n\0]/.test(expectedPassword),
    "La contraseña esperada para validar el dry-run es inválida.",
  );
  invariant(
    projectRef === PRODUCTION_QUERY_PROJECT_REF,
    "El project ref del dry-run no está autorizado.",
  );
  const lines = output.slice(0, -1).split("\n");
  invariant(
    lines[0] === "#!/usr/bin/env bash" &&
      lines[1] === "set -euo pipefail" &&
      lines[2] === "" &&
      lines[8] === "",
    "El encabezado del dry-run es inesperado.",
  );
  const host = parsePlainExport(lines[3], "PGHOST");
  const port = parsePlainExport(lines[4], "PGPORT");
  const user = parsePlainExport(lines[5], "PGUSER");
  invariant(
    lines[6] === `export PGPASSWORD="${expectedPassword}"`,
    "PGPASSWORD del dry-run no coincide con la entrada local.",
  );
  const database = parsePlainExport(lines[7], "PGDATABASE");
  const suffix = lines.slice(9);
  invariant(
    suffix.every((line) => !line.includes("PGPASSWORD")) &&
      output.split("PGPASSWORD").length === 2,
    "El dry-run expuso PGPASSWORD fuera del export esperado.",
  );
  assertKnownDumpScriptSuffix(suffix);
  const connection = { host, port, user, database };
  invariant(
    isProductionConnection(connection),
    "El endpoint Postgres del dry-run no es válido.",
  );
  return Object.freeze(connection);
}

export function productionDumpDryRunArgs(
  projectRef = PRODUCTION_QUERY_PROJECT_REF,
) {
  invariant(
    projectRef === PRODUCTION_QUERY_PROJECT_REF,
    "El project ref del dry-run no está autorizado.",
  );
  return Object.freeze([
    "db",
    "dump",
    "--project-ref",
    projectRef,
    "--dry-run",
  ]);
}

export function redactSensitiveText(text, secrets) {
  return (secrets ?? []).reduce(
    (current, secret) =>
      typeof secret === "string" && secret.length > 0
        ? current.replaceAll(secret, "<redacted>")
        : current,
    String(text ?? ""),
  );
}

export function assertApprovedProductionQuery(sql, approvedSha256) {
  invariant(
    typeof sql === "string" && sql.length > 0 && sql.length <= 256 * 1024,
    "La consulta productiva es inválida.",
  );
  const semicolons = [...sql.matchAll(/;/g)].map((match) => match.index);
  const finalNonWhitespace = sql.trimEnd().length - 1;
  invariant(
    !/[\\]|--|\/\*/.test(sql) &&
      /^\s*(?:select|with)\b/i.test(sql) &&
      (semicolons.length === 0 ||
        (semicolons.length === 1 && semicolons[0] === finalNonWhitespace)),
    "La consulta productiva no es una sentencia read-only canónica.",
  );
  invariant(
    approvedSha256 instanceof Set && approvedSha256.has(sha256(sql)),
    "La consulta productiva no pertenece al inventario read-only aprobado.",
  );
  return true;
}

export function buildProductionPsqlContainerInvocation({
  connection,
  imageId,
  sql,
  assets,
}) {
  invariant(
    imageId === PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
    "El image ID de Postgres no coincide con el pin auditado.",
  );
  invariant(
    isProductionConnection(connection),
    "La conexión productiva no es válida.",
  );
  invariant(
    typeof sql === "string" &&
      sql.length > 0 &&
      sql.length <= 256 * 1024 &&
      !/[\r\0]/.test(sql),
    "La consulta para psql no es válida.",
  );
  assertProductionBackupAssets(assets);
  const statement = sql.trim().replace(/;$/, "");
  const transaction = `begin transaction read only; ${statement}; rollback`;
  const args = [
    "run",
    "--rm",
    "--network",
    "host",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "postgres",
    "--mount",
    `type=bind,source=${assets.caHostPath},target=${PRODUCTION_QUERY_CA_CONTAINER_PATH},readonly`,
    "-e",
    "PGPASSWORD",
    "-e",
    "PGHOST",
    "-e",
    "PGPORT",
    "-e",
    "PGUSER",
    "-e",
    "PGDATABASE",
    "-e",
    "PGSSLMODE",
    "-e",
    "PGSSLROOTCERT",
    "--entrypoint",
    "psql",
    imageId,
    "--no-psqlrc",
    "--no-align",
    "--tuples-only",
    "--quiet",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    transaction,
  ];
  return Object.freeze({ command: "docker", args: Object.freeze(args) });
}

export function buildProductionPsqlEnvironment(
  baseEnvironment,
  connection,
  password,
  assets,
) {
  invariant(
    typeof password === "string" &&
      password.length >= 8 &&
      !/[\r\n\0]/.test(password),
    "PGPASSWORD es inválida.",
  );
  invariant(
    isProductionConnection(connection),
    "La conexión productiva no es válida.",
  );
  assertProductionBackupAssets(assets);
  const environment = {};
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
    "LANG",
    "LC_ALL",
  ]) {
    if (typeof baseEnvironment?.[name] === "string") {
      environment[name] = baseEnvironment[name];
    }
  }
  return {
    ...environment,
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGUSER: connection.user,
    PGPASSWORD: password,
    PGDATABASE: connection.database,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: PRODUCTION_QUERY_CA_CONTAINER_PATH,
  };
}

function sameArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

export function productionDumpSpecification(extraFlags) {
  let kind;
  let environment;
  if (sameArray(extraFlags, ["--role-only"])) {
    kind = "roles";
    environment = {
      RESERVED_ROLES: CLI_2_115_RESERVED_ROLES.join("|"),
      ALLOWED_CONFIGS: CLI_2_115_ALLOWED_CONFIGS.join("|"),
      EXTRA_SED: "/^--/d",
    };
  } else if (sameArray(extraFlags, [])) {
    kind = "schema";
    environment = {
      EXCLUDED_SCHEMAS: CLI_2_115_INTERNAL_SCHEMAS.join("|"),
      EXTRA_SED: "/^--/d",
    };
  } else if (
    sameArray(extraFlags, [
      "--data-only",
      "--use-copy",
      "--exclude",
      "storage.buckets_vectors",
      "--exclude",
      "storage.vector_indexes",
    ])
  ) {
    kind = "data";
    environment = {
      INCLUDED_SCHEMAS: "*",
      EXCLUDED_SCHEMAS: CLI_2_115_DATA_EXCLUDED_SCHEMAS.join("|"),
      EXTRA_FLAGS:
        '--exclude-table "storage"."buckets_vectors" --exclude-table "storage"."vector_indexes"',
    };
  } else if (sameArray(extraFlags, ["--schema", "supabase_migrations"])) {
    kind = "schema";
    environment = {
      EXTRA_FLAGS: "--schema=supabase_migrations",
      EXTRA_SED: "/^--/d",
    };
  } else if (
    sameArray(extraFlags, [
      "--data-only",
      "--use-copy",
      "--schema",
      "supabase_migrations",
    ])
  ) {
    kind = "data";
    environment = { INCLUDED_SCHEMAS: "supabase_migrations" };
  } else if (sameArray(extraFlags, ["--schema", "auth,storage"])) {
    kind = "schema";
    environment = {
      EXTRA_FLAGS: "--schema=auth|storage",
      EXTRA_SED: "/^--/d",
    };
  } else {
    throw new Error(
      "La especificación del dump productivo no coincide con el inventario Supabase CLI 2.115.0.",
    );
  }
  const script = PRODUCTION_DUMP_SCRIPTS[kind];
  return Object.freeze({
    kind,
    environment: Object.freeze(environment),
    script: Object.freeze({ ...script }),
  });
}

export function buildProductionDumpContainerInvocation({
  connection,
  imageId,
  extraFlags,
  assets,
}) {
  invariant(
    imageId === PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
    "El image ID de Postgres no coincide con el pin auditado.",
  );
  invariant(
    isProductionConnection(connection),
    "La conexión productiva no es válida.",
  );
  assertProductionBackupAssets(assets);
  const specification = productionDumpSpecification(extraFlags);
  const scriptHostPath = assets.dumpScriptHostPaths[specification.kind];
  const args = [
    "run",
    "--rm",
    "--network",
    "host",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "postgres",
    "--mount",
    `type=bind,source=${assets.caHostPath},target=${PRODUCTION_QUERY_CA_CONTAINER_PATH},readonly`,
    "--mount",
    `type=bind,source=${scriptHostPath},target=${specification.script.containerPath},readonly`,
  ];
  for (const name of [
    "PGPASSWORD",
    "PGHOST",
    "PGPORT",
    "PGUSER",
    "PGDATABASE",
    "PGSSLMODE",
    "PGSSLROOTCERT",
    ...Object.keys(specification.environment),
  ]) {
    args.push("-e", name);
  }
  args.push(
    "--entrypoint",
    "bash",
    imageId,
    specification.script.containerPath,
  );
  return Object.freeze({
    command: "docker",
    args: Object.freeze(args),
    specification,
  });
}

export function buildProductionDumpEnvironment(
  baseEnvironment,
  connection,
  password,
  assets,
  extraFlags,
) {
  const specification = productionDumpSpecification(extraFlags);
  return {
    ...buildProductionPsqlEnvironment(
      baseEnvironment,
      connection,
      password,
      assets,
    ),
    ...specification.environment,
  };
}

export function parseProductionPsqlJson(output) {
  invariant(
    typeof output === "string" &&
      output.length > 1 &&
      output.length <= 64 * 1024 * 1024 &&
      output.endsWith("\n") &&
      !/[\r\0]/.test(output),
    "psql no devolvió una salida JSON canónica.",
  );
  const body = output.slice(0, -1);
  invariant(!body.includes("\n"), "psql devolvió más de una fila.");
  try {
    const parsed = JSON.parse(body);
    invariant(
      parsed !== null && typeof parsed === "object",
      "El payload JSON de psql tiene una estructura inesperada.",
    );
    return parsed;
  } catch {
    throw new Error("El payload JSON de psql es inválido.");
  }
}
