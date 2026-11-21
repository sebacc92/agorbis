import { createHash } from "node:crypto";

export const EXPECTED_STORAGE_MIGRATION_COUNT = 65;
export const EXPECTED_STORAGE_MIGRATIONS_SHA256 =
  "7c447bec2242d0dd2dbae8b2e5144929f96ec533227b9446ad453327c24e1dae";
export const EXPECTED_AUTH_MIGRATION_COUNT = 77;
export const EXPECTED_AUTH_MIGRATIONS_SHA256 =
  "1e6673dc3ca115d5ab0ce925e16a81fcbb0843ce89543b0d1e5bd4f6fc989eb7";

export const EXPECTED_MANAGED_READINESS_COLUMNS = Object.freeze([
  Object.freeze({
    qualified: "auth.mfa_factors.id",
    ordinalPosition: 1,
    dataType: "uuid",
    udtName: "uuid",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.mfa_factors.user_id",
    ordinalPosition: 2,
    dataType: "uuid",
    udtName: "uuid",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.mfa_factors.factor_type",
    ordinalPosition: 4,
    dataType: "USER-DEFINED",
    udtName: "factor_type",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.mfa_factors.status",
    ordinalPosition: 5,
    dataType: "USER-DEFINED",
    udtName: "factor_status",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.sessions.id",
    ordinalPosition: 1,
    dataType: "uuid",
    udtName: "uuid",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.sessions.user_id",
    ordinalPosition: 2,
    dataType: "uuid",
    udtName: "uuid",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.users.id",
    ordinalPosition: 2,
    dataType: "uuid",
    udtName: "uuid",
    nullable: false,
    default: null,
  }),
  Object.freeze({
    qualified: "auth.users.email",
    ordinalPosition: 5,
    dataType: "character varying",
    udtName: "varchar",
    nullable: true,
    default: null,
  }),
  Object.freeze({
    qualified: "storage.buckets.versioning_status",
    ordinalPosition: 12,
    dataType: "text",
    udtName: "text",
    nullable: false,
    default: "'DISABLED'::text",
  }),
  Object.freeze({
    qualified: "storage.objects.archived_at",
    ordinalPosition: 13,
    dataType: "timestamp with time zone",
    udtName: "timestamptz",
    nullable: true,
    default: null,
  }),
  Object.freeze({
    qualified: "storage.objects.is_delete_marker",
    ordinalPosition: 14,
    dataType: "boolean",
    udtName: "bool",
    nullable: false,
    default: "false",
  }),
  Object.freeze({
    qualified: "storage.objects.is_versioned",
    ordinalPosition: 15,
    dataType: "boolean",
    udtName: "bool",
    nullable: false,
    default: "false",
  }),
]);

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function storageMigrationIdentity(migrations) {
  return migrations.map((migration) => ({
    id: migration.id,
    hash: migration.hash,
    name: migration.name,
  }));
}

export function storageMigrationIdentitySha256(migrations) {
  return sha256Json(storageMigrationIdentity(migrations));
}

export function authMigrationIdentitySha256(migrations) {
  return sha256Json(migrations);
}

function exactObjectKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function validateStorageRows(rows, errors) {
  if (!Array.isArray(rows)) {
    errors.push("storage.migrations no devolvió un array JSON.");
    return;
  }
  for (const [index, row] of rows.entries()) {
    if (
      !exactObjectKeys(row, ["id", "name", "hash"]) ||
      !Number.isInteger(row.id) ||
      typeof row.name !== "string" ||
      !row.name ||
      typeof row.hash !== "string" ||
      !/^[a-f0-9]{40}$/.test(row.hash)
    ) {
      errors.push(`storage.migrations[${index}] tiene una firma inesperada.`);
    }
  }
}

function validateAuthRows(rows, errors) {
  if (!Array.isArray(rows)) {
    errors.push("auth.schema_migrations no devolvió un array JSON.");
    return;
  }
  for (const [index, version] of rows.entries()) {
    if (typeof version !== "string" || !/^\d+$/.test(version)) {
      errors.push(
        `auth.schema_migrations[${index}] tiene una versión inesperada.`,
      );
    }
  }
}

function columnIdentity(column) {
  return {
    qualified: column.qualified,
    ordinalPosition: column.ordinalPosition,
    dataType: column.dataType,
    udtName: column.udtName,
    nullable: column.nullable,
    default: column.default,
  };
}

export function evaluateManagedSchemaReadiness(
  snapshot,
  {
    storageMigrationCount = EXPECTED_STORAGE_MIGRATION_COUNT,
    storageMigrationsSha256 = EXPECTED_STORAGE_MIGRATIONS_SHA256,
    authMigrationCount = EXPECTED_AUTH_MIGRATION_COUNT,
    authMigrationsSha256 = EXPECTED_AUTH_MIGRATIONS_SHA256,
    expectedColumns = EXPECTED_MANAGED_READINESS_COLUMNS,
  } = {},
) {
  const errors = [];
  const pending = [];
  if (
    !exactObjectKeys(snapshot, [
      "storageMigrations",
      "authMigrations",
      "columns",
    ])
  ) {
    return {
      ready: false,
      pending,
      errors: ["El snapshot administrado tiene una estructura inesperada."],
    };
  }

  validateStorageRows(snapshot.storageMigrations, errors);
  validateAuthRows(snapshot.authMigrations, errors);
  if (!Array.isArray(snapshot.columns)) {
    errors.push("El inventario de columnas administradas no es un array JSON.");
  }
  if (errors.length > 0) return { ready: false, pending, errors };

  const storageIds = snapshot.storageMigrations.map(({ id }) => id);
  let storageHistoryComplete = false;
  const expectedStoragePrefix = Array.from(
    { length: snapshot.storageMigrations.length },
    (_, index) => index,
  );
  if (
    snapshot.storageMigrations.length > storageMigrationCount ||
    JSON.stringify(storageIds) !== JSON.stringify(expectedStoragePrefix)
  ) {
    errors.push(
      `storage.migrations no es el prefijo exacto 0–${storageMigrationCount - 1}.`,
    );
  } else if (snapshot.storageMigrations.length < storageMigrationCount) {
    pending.push(
      `Storage aplicó ${snapshot.storageMigrations.length}/${storageMigrationCount} migraciones administradas.`,
    );
  } else {
    const actual = storageMigrationIdentitySha256(snapshot.storageMigrations);
    if (actual !== storageMigrationsSha256) {
      errors.push(
        `Storage migrations 0–${storageMigrationCount - 1} no coincide en nombres/hashes (SHA-256 ${actual}).`,
      );
    } else {
      storageHistoryComplete = true;
    }
  }

  let authHistoryComplete = false;
  if (snapshot.authMigrations.length > authMigrationCount) {
    errors.push(
      `auth.schema_migrations contiene ${snapshot.authMigrations.length} versiones; se esperaban exactamente ${authMigrationCount}.`,
    );
  } else if (
    new Set(snapshot.authMigrations).size !== snapshot.authMigrations.length ||
    JSON.stringify([...snapshot.authMigrations].sort()) !==
      JSON.stringify(snapshot.authMigrations)
  ) {
    errors.push(
      "auth.schema_migrations no está ordenado o contiene duplicados.",
    );
  } else if (snapshot.authMigrations.length < authMigrationCount) {
    pending.push(
      `Auth aplicó ${snapshot.authMigrations.length}/${authMigrationCount} migraciones administradas.`,
    );
  } else {
    const actual = authMigrationIdentitySha256(snapshot.authMigrations);
    if (actual !== authMigrationsSha256) {
      errors.push(
        `Auth no coincide en versiones administradas (SHA-256 ${actual}).`,
      );
    } else {
      authHistoryComplete = true;
    }
  }

  const expectedByName = new Map(
    expectedColumns.map((column) => [column.qualified, column]),
  );
  const actualByName = new Map();
  for (const [index, column] of snapshot.columns.entries()) {
    if (
      !exactObjectKeys(column, [
        "qualified",
        "ordinalPosition",
        "dataType",
        "udtName",
        "nullable",
        "default",
      ]) ||
      typeof column.qualified !== "string"
    ) {
      errors.push(`columns[${index}] tiene una estructura inesperada.`);
      continue;
    }
    if (!expectedByName.has(column.qualified)) {
      errors.push(`Columna administrada inesperada: ${column.qualified}.`);
      continue;
    }
    if (actualByName.has(column.qualified)) {
      errors.push(`Columna administrada duplicada: ${column.qualified}.`);
      continue;
    }
    actualByName.set(column.qualified, column);
    if (
      JSON.stringify(columnIdentity(column)) !==
      JSON.stringify(columnIdentity(expectedByName.get(column.qualified)))
    ) {
      errors.push(`Firma administrada distinta en ${column.qualified}.`);
    }
  }
  for (const qualified of expectedByName.keys()) {
    if (!actualByName.has(qualified)) {
      const message = `Falta la columna administrada ${qualified}.`;
      if (storageHistoryComplete && authHistoryComplete) errors.push(message);
      else pending.push(`Todavía ${message.toLowerCase()}`);
    }
  }

  if (errors.length > 0) return { ready: false, pending, errors };
  return { ready: pending.length === 0, pending, errors };
}
