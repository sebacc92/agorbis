import assert from "node:assert/strict";
import {
  assertBackupManagedDataProfile,
  assertLocalRestoreManagedDataProfile,
  BACKUP_FORMAT,
} from "./supabase-backup-lib.mjs";
import { PRODUCTION_QUERY_PROJECT_REF } from "./production-backup-query-policy.mjs";
import {
  assertManagedCatalogSnapshot,
  assertManagedDataManifest,
  CLOUD_MANAGED_DATA_POLICY_VERSION,
  CLOUD_MANAGED_DATA_PROFILE_ID,
  DEFAULT_MANAGED_DATA_PROFILE_ID,
  EXPECTED_MANAGED_DATA_TABLES,
  getManagedDataManifestProfile,
  getManagedDataProfile,
  MANAGED_DATA_EXCLUSIONS,
  MANAGED_DATA_POLICY_VERSION,
  sha256CanonicalJson,
} from "./supabase-managed-data-policy.mjs";

const local = getManagedDataProfile(DEFAULT_MANAGED_DATA_PROFILE_ID);
const cloud = getManagedDataProfile(CLOUD_MANAGED_DATA_PROFILE_ID);
assert.equal(local.tables, EXPECTED_MANAGED_DATA_TABLES);
assert.equal(local.policyVersion, MANAGED_DATA_POLICY_VERSION);
assert.equal(cloud.policyVersion, CLOUD_MANAGED_DATA_POLICY_VERSION);
assert.equal(local.tables.length, 31);
assert.equal(cloud.tables.length, 29);
assert.equal(
  sha256CanonicalJson(local.tables),
  "b4129461662cc2c9e453dc7975bbdc83fe1363ffdd39afb96b8e9b118a395996",
);
assert.equal(
  sha256CanonicalJson(cloud.tables),
  "fa7bc92de4e114698f44660104929705bcba855791f7c7718792a40fde1ba62c",
);
assert.deepEqual(
  local.tables
    .filter(({ table }) => !cloud.tables.some((entry) => entry.table === table))
    .map(({ table }) => table),
  ["storage.iceberg_namespaces", "storage.iceberg_tables"],
);
const changed = [];
for (const entry of cloud.tables) {
  const previous = local.tables.find(({ table }) => table === entry.table);
  assert.ok(previous);
  const fields = Object.keys(entry).filter(
    (field) => entry[field] !== previous[field],
  );
  if (fields.length > 0) {
    assert.deepEqual(fields, ["aclSignatureSha256"]);
    assert.equal(
      entry.aclSignatureSha256,
      "c4b5117c295e9c02603424f840814ac7457ddc465d0515d9718634563e621b0b",
    );
    changed.push(entry.table);
  }
}
assert.deepEqual(changed, ["storage.buckets", "storage.objects"]);
for (const invalid of [undefined, null, "", "unknown", "__proto__", {}]) {
  assert.throws(() => getManagedDataProfile(invalid), /Perfil.*desconocido/);
}
assert.ok(Object.isFrozen(cloud));
assert.ok(Object.isFrozen(cloud.tables));
assert.ok(cloud.tables.every(Object.isFrozen));

// Metadata sintética de las dos exclusiones, sin filas ni datos productivos.
function columns(entries) {
  return entries.map(([name, type, overrides = {}], index) => ({
    ordinal: index + 1,
    name,
    type,
    notNull: true,
    identity: "",
    generated: "",
    collation: type === "text" ? 'pg_catalog."default"' : null,
    default: null,
    ...overrides,
  }));
}
const timestamps = [
  ["created_at", "timestamp with time zone", { default: "now()" }],
  ["updated_at", "timestamp with time zone", { default: "now()" }],
];
const exclusionColumns = {
  "storage.buckets_vectors": columns([
    ["id", "text"],
    ["type", "storage.buckettype", { default: "'VECTOR'::storage.buckettype" }],
    ...timestamps,
  ]),
  "storage.vector_indexes": columns([
    ["id", "text", { default: "gen_random_uuid()" }],
    ["name", "text", { collation: 'pg_catalog."C"' }],
    ["bucket_id", "text"],
    ["data_type", "text"],
    ["dimension", "integer"],
    ["distance_metric", "text"],
    ["metadata_configuration", "jsonb", { notNull: false }],
    ...timestamps,
  ]),
};

function databaseFixture(profile) {
  const dataExcludes = MANAGED_DATA_EXCLUSIONS.map(({ table, reason }) => {
    const expected = profile.tables.find((entry) => entry.table === table);
    return {
      table,
      owner: expected.owner,
      rowCount: 0,
      columnSignature: exclusionColumns[table],
      columnSignatureSha256: expected.columnSignatureSha256,
      aclSignatureSha256: expected.aclSignatureSha256,
      postgresCanInsert: false,
      ownerCanInsert: true,
      reason,
    };
  });
  const identity = {
    policyVersion: profile.policyVersion,
    ...(profile === cloud ? { profileId: cloud.id } : {}),
  };
  const inventorySha256 = sha256CanonicalJson(profile.tables);
  return {
    dataExcludes,
    managedDataPolicy: {
      ...identity,
      inventoryTableCount: profile === cloud ? 29 : 31,
      includedCopyTableCount: profile === cloud ? 27 : 29,
      expectedAuthCopyCount: 22,
      expectedStorageCopyCount: profile === cloud ? 5 : 7,
      inventorySha256,
      blockSha256: sha256CanonicalJson({
        ...identity,
        inventorySha256,
        dataExcludes,
      }),
    },
  };
}

const historicalDatabase = databaseFixture(local);
const cloudDatabase = databaseFixture(cloud);
assert.equal(
  assertManagedDataManifest(historicalDatabase),
  historicalDatabase.managedDataPolicy,
);
assert.equal(getManagedDataManifestProfile(historicalDatabase), local);
assert.equal(
  assertManagedDataManifest(cloudDatabase),
  cloudDatabase.managedDataPolicy,
);
assert.equal(getManagedDataManifestProfile(cloudDatabase), cloud);
assertManagedDataManifest(historicalDatabase, EXPECTED_MANAGED_DATA_TABLES);
assertManagedDataManifest(cloudDatabase, cloud);
assertManagedDataManifest(cloudDatabase, cloud.id);
assert.throws(
  () => assertManagedDataManifest(cloudDatabase, local),
  /perfil.*no coincide/,
);
assert.throws(
  () => assertManagedDataManifest(historicalDatabase, cloud),
  /perfil.*no coincide/,
);
assert.throws(
  () => assertManagedDataManifest(cloudDatabase, cloud.tables),
  /exactamente 31/,
);
assert.throws(
  () =>
    assertManagedDataManifest(cloudDatabase, {
      ...cloud,
      tables: local.tables,
    }),
  /objeto registrado/,
);

for (const original of [historicalDatabase, cloudDatabase]) {
  for (const mutate of [
    (database) => {
      database.managedDataPolicy.policyVersion = "unknown";
    },
    (database) => {
      database.managedDataPolicy.inventorySha256 = "0".repeat(64);
    },
    (database) => {
      database.managedDataPolicy.blockSha256 = "0".repeat(64);
    },
    (database) => {
      database.managedDataPolicy.inventoryTableCount += 1;
    },
    (database) => {
      database.managedDataPolicy.includedCopyTableCount += 1;
    },
    (database) => {
      database.managedDataPolicy.expectedAuthCopyCount -= 1;
    },
    (database) => {
      database.managedDataPolicy.expectedStorageCopyCount += 1;
    },
    (database) => {
      database.dataExcludes.pop();
    },
    (database) => {
      database.dataExcludes.reverse();
    },
    (database) => {
      database.dataExcludes[0].rowCount = 1;
    },
    (database) => {
      database.dataExcludes[0].rowCount = null;
    },
    (database) => {
      database.dataExcludes[0].owner = "postgres";
    },
    (database) => {
      database.dataExcludes[0].table = "storage.unknown";
    },
    (database) => {
      database.dataExcludes[0].columnSignature[0].type = "integer";
    },
    (database) => {
      database.dataExcludes[0].aclSignatureSha256 = "0".repeat(64);
    },
    (database) => {
      database.dataExcludes[0].postgresCanInsert = true;
    },
    (database) => {
      database.dataExcludes[0].ownerCanInsert = false;
    },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => assertManagedDataManifest(changed));
  }
}
for (const profileId of [undefined, "unknown", local.id]) {
  const changed = structuredClone(cloudDatabase);
  if (profileId === undefined) delete changed.managedDataPolicy.profileId;
  else changed.managedDataPolicy.profileId = profileId;
  assert.throws(() => assertManagedDataManifest(changed), /Perfil|perfil/);
}
for (const profileId of [undefined, local.id, cloud.id]) {
  const changed = structuredClone(historicalDatabase);
  changed.managedDataPolicy.profileId = profileId;
  assert.throws(() => assertManagedDataManifest(changed), /histórica/);
}
const unhashedProfile = structuredClone(cloudDatabase);
unhashedProfile.managedDataPolicy.blockSha256 = sha256CanonicalJson({
  policyVersion: CLOUD_MANAGED_DATA_POLICY_VERSION,
  inventorySha256: cloudDatabase.managedDataPolicy.inventorySha256,
  dataExcludes: cloudDatabase.dataExcludes,
});
assert.throws(() => assertManagedDataManifest(unhashedProfile), /hash/);

const emptyCatalog = {
  histories: [
    { qualified: "auth.schema_migrations", owner: "supabase_auth_admin" },
    { qualified: "storage.migrations", owner: "supabase_storage_admin" },
  ],
  tables: [],
};
assert.throws(
  () => assertManagedCatalogSnapshot(emptyCatalog, "empty", cloud),
  /inventario/,
);
assert.throws(
  () => assertManagedCatalogSnapshot(emptyCatalog, "unknown", "unknown"),
  /Perfil/,
);
assert.throws(
  () => assertManagedCatalogSnapshot(emptyCatalog, "forged", { ...cloud }),
  /objeto registrado/,
);

// La comparación del inventario precede a las firmas: ni siquiera un catálogo
// con formas válidas puede seleccionar el perfil por sus tablas presentes.
const shapedCloudCatalog = {
  histories: emptyCatalog.histories,
  tables: cloud.tables.map(({ table, owner, excluded }) => ({
    qualified: table,
    owner,
    columns: [{ name: "id" }],
    acl: { table: [], columns: [], effective: {} },
    rowCount: excluded ? 0 : null,
  })),
};
assert.throws(
  () => assertManagedCatalogSnapshot(shapedCloudCatalog),
  /inventario Auth\/Storage/,
);
for (const mutate of [
  (catalog) => {
    catalog.tables.pop();
  },
  (catalog) => {
    catalog.tables[0].qualified = "storage.unknown";
  },
  (catalog) => {
    catalog.tables.push(structuredClone(catalog.tables[0]));
  },
]) {
  const changed = structuredClone(shapedCloudCatalog);
  mutate(changed);
  assert.throws(
    () => assertManagedCatalogSnapshot(changed, "incomplete cloud", cloud),
    /inventario Auth\/Storage|duplicado/,
  );
}

const historicalV5 = { format: BACKUP_FORMAT, database: historicalDatabase };
assert.equal(assertBackupManagedDataProfile(historicalV5), local);
assert.equal(assertLocalRestoreManagedDataProfile(historicalV5), local);
const cloudV5 = {
  format: BACKUP_FORMAT,
  database: cloudDatabase,
  source: {
    mode: "production",
    projectRef: PRODUCTION_QUERY_PROJECT_REF,
    apiOrigin: `https://${PRODUCTION_QUERY_PROJECT_REF}.supabase.co`,
  },
  repository: { commit: "a".repeat(40), dirty: false },
};
assert.equal(assertBackupManagedDataProfile(cloudV5), cloud);
assert.throws(
  () => assertLocalRestoreManagedDataProfile(cloudV5),
  /cloud bloqueado/,
);
for (const mutate of [
  (manifest) => {
    manifest.format = "agorbis-supabase-backup/v4";
  },
  (manifest) => {
    manifest.source.mode = "local";
  },
  (manifest) => {
    manifest.source.projectRef = "unapproved-project";
  },
  (manifest) => {
    manifest.source.apiOrigin = "https://example.com";
  },
  (manifest) => {
    manifest.repository.dirty = true;
  },
  (manifest) => {
    manifest.repository.commit = "invalid";
  },
  (manifest) => {
    delete manifest.repository;
  },
  (manifest) => {
    delete manifest.source;
  },
]) {
  const changed = structuredClone(cloudV5);
  mutate(changed);
  assert.throws(() => assertBackupManagedDataProfile(changed), /cloud/);
}

console.log(
  "Perfiles administrados: local histórico y cloud explícito, inventarios completos, hashes y rechazos cruzados verificados.",
);
