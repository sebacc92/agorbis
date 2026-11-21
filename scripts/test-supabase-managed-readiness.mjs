import assert from "node:assert/strict";
import {
  EXPECTED_MANAGED_READINESS_COLUMNS,
  authMigrationIdentitySha256,
  evaluateManagedSchemaReadiness,
  storageMigrationIdentitySha256,
} from "./supabase-managed-readiness-policy.mjs";

const storageMigrations = Array.from({ length: 65 }, (_, id) => ({
  id,
  name: `migration-${id}`,
  hash: id.toString(16).padStart(40, "0"),
}));
const authMigrations = Array.from({ length: 77 }, (_, index) =>
  index.toString().padStart(14, "0"),
);
const expectations = {
  storageMigrationCount: storageMigrations.length,
  storageMigrationsSha256: storageMigrationIdentitySha256(storageMigrations),
  authMigrationCount: authMigrations.length,
  authMigrationsSha256: authMigrationIdentitySha256(authMigrations),
  expectedColumns: EXPECTED_MANAGED_READINESS_COLUMNS,
};
const snapshot = {
  storageMigrations,
  authMigrations,
  columns: structuredClone(EXPECTED_MANAGED_READINESS_COLUMNS),
};

assert.deepEqual(evaluateManagedSchemaReadiness(snapshot, expectations), {
  ready: true,
  pending: [],
  errors: [],
});

const storagePending = evaluateManagedSchemaReadiness(
  { ...snapshot, storageMigrations: storageMigrations.slice(0, -1) },
  expectations,
);
assert.equal(storagePending.ready, false);
assert.match(storagePending.pending.join("\n"), /Storage aplicó 64\/65/);
assert.deepEqual(storagePending.errors, []);

const authPending = evaluateManagedSchemaReadiness(
  { ...snapshot, authMigrations: authMigrations.slice(0, -1) },
  expectations,
);
assert.equal(authPending.ready, false);
assert.match(authPending.pending.join("\n"), /Auth aplicó 76\/77/);
assert.deepEqual(authPending.errors, []);

for (const mutation of [
  storageMigrations.map((migration, index) =>
    index === 64 ? { ...migration, name: "changed" } : migration,
  ),
  storageMigrations.map((migration, index) =>
    index === 64 ? { ...migration, hash: "f".repeat(40) } : migration,
  ),
]) {
  const result = evaluateManagedSchemaReadiness(
    { ...snapshot, storageMigrations: mutation },
    expectations,
  );
  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /nombres\/hashes/);
}

const skippedStorageId = structuredClone(storageMigrations.slice(0, -1));
skippedStorageId[32].id = 33;
assert.match(
  evaluateManagedSchemaReadiness(
    { ...snapshot, storageMigrations: skippedStorageId },
    expectations,
  ).errors.join("\n"),
  /prefijo exacto/,
);

const changedAuth = [...authMigrations];
changedAuth[76] = "99999999999999";
assert.match(
  evaluateManagedSchemaReadiness(
    { ...snapshot, authMigrations: changedAuth },
    expectations,
  ).errors.join("\n"),
  /Auth no coincide/,
);

const missingColumn = evaluateManagedSchemaReadiness(
  { ...snapshot, columns: snapshot.columns.slice(0, -1) },
  expectations,
);
assert.equal(missingColumn.ready, false);
assert.match(missingColumn.errors.join("\n"), /Falta la columna administrada/);

const historiesAndColumnsPending = evaluateManagedSchemaReadiness(
  {
    ...snapshot,
    storageMigrations: storageMigrations.slice(0, -1),
    columns: snapshot.columns.slice(0, -1),
  },
  expectations,
);
assert.match(historiesAndColumnsPending.pending.join("\n"), /Todavía falta/);

const changedColumn = structuredClone(snapshot.columns);
changedColumn.at(-1).nullable = true;
assert.match(
  evaluateManagedSchemaReadiness(
    { ...snapshot, columns: changedColumn },
    expectations,
  ).errors.join("\n"),
  /Firma administrada distinta/,
);

const unknownColumn = structuredClone(snapshot.columns);
unknownColumn.push({
  ...unknownColumn.at(-1),
  qualified: "storage.objects.unexpected",
});
assert.match(
  evaluateManagedSchemaReadiness(
    { ...snapshot, columns: unknownColumn },
    expectations,
  ).errors.join("\n"),
  /Columna administrada inesperada/,
);

assert.match(
  evaluateManagedSchemaReadiness(
    { ...snapshot, extra: true },
    expectations,
  ).errors.join("\n"),
  /estructura inesperada/,
);

console.log("Managed-schema readiness tests: ok");
