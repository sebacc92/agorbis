import { canonicalizePgDump, sha256Buffer } from "./supabase-backup-lib.mjs";
import {
  CLOUD_MANAGED_DATA_PROFILE_ID,
  DEFAULT_MANAGED_DATA_PROFILE_ID,
  getManagedDataProfile,
  sha256CanonicalJson,
} from "./supabase-managed-data-policy.mjs";

// This registry describes an audited DDL pair, not a supported restore route.
// It does not apply SQL, inspect Docker, prove that extra tables are empty,
// compare application schemas, or attest that managed histories stayed intact.
// Full production references remain outside Git; only their fixed hashes and
// the seven observed index definitions needed by a future supplement are here.
export const MANAGED_RESTORE_SUPPLEMENT_POLICY_ID =
  "supabase-cloud29-local31-20260908/v1";
export const MANAGED_RESTORE_SUPPLEMENT_PLAN_FORMAT =
  "agorbis-managed-restore-supplement-plan/v1";

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const policy = deepFreeze({
  id: MANAGED_RESTORE_SUPPLEMENT_POLICY_ID,
  source: {
    profileId: CLOUD_MANAGED_DATA_PROFILE_ID,
    policyVersion: "supabase-cli-2.115.0-storage-v1.70.7/v3",
    inventorySha256:
      "fa7bc92de4e114698f44660104929705bcba855791f7c7718792a40fde1ba62c",
    canonicalSchemaSha256:
      "fbcee7200d4f8459f9eae4eead125cc3fb4b5f08b2122e3f6dd01b1ca55529ec",
    inventoryTableCount: 29,
    includedCopyTableCount: 27,
  },
  target: {
    profileId: DEFAULT_MANAGED_DATA_PROFILE_ID,
    policyVersion: "supabase-cli-2.115.0-storage-v1.70.7/v1",
    inventorySha256:
      "b4129461662cc2c9e453dc7975bbdc83fe1363ffdd39afb96b8e9b118a395996",
    canonicalSchemaSha256:
      "7ab2528928d33f5462126da7587962f1279a767ee5f8e6e4c898bd9c2ebda1a4",
    inventoryTableCount: 31,
    includedCopyTableCount: 29,
  },
  indexSupplement: {
    phase: "before-copy",
    target: "isolated-local-restore-target-only",
    indexes: [
      {
        schema: "auth",
        table: "users",
        name: "idx_users_created_at_desc",
        owner: "supabase_auth_admin",
        unique: false,
        nullsNotDistinct: false,
        sql: 'CREATE INDEX "idx_users_created_at_desc" ON "auth"."users" USING "btree" ("created_at" DESC);',
      },
      {
        schema: "auth",
        table: "users",
        name: "idx_users_email",
        owner: "supabase_auth_admin",
        unique: false,
        nullsNotDistinct: false,
        sql: 'CREATE INDEX "idx_users_email" ON "auth"."users" USING "btree" ("email");',
      },
      {
        schema: "auth",
        table: "users",
        name: "idx_users_last_sign_in_at_desc",
        owner: "supabase_auth_admin",
        unique: false,
        nullsNotDistinct: false,
        sql: 'CREATE INDEX "idx_users_last_sign_in_at_desc" ON "auth"."users" USING "btree" ("last_sign_in_at" DESC);',
      },
      {
        schema: "auth",
        table: "users",
        name: "idx_users_name",
        owner: "supabase_auth_admin",
        unique: false,
        nullsNotDistinct: false,
        sql: `CREATE INDEX "idx_users_name" ON "auth"."users" USING "btree" ((("raw_user_meta_data" ->> 'name'::"text"))) WHERE (("raw_user_meta_data" ->> 'name'::"text") IS NOT NULL);`,
      },
      {
        schema: "storage",
        table: "objects",
        name: "idx_objects_current_version",
        owner: "supabase_storage_admin",
        unique: true,
        nullsNotDistinct: false,
        sql: 'CREATE UNIQUE INDEX "idx_objects_current_version" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C") WHERE ("archived_at" IS NULL);',
      },
      {
        schema: "storage",
        table: "objects",
        name: "idx_objects_null_version",
        owner: "supabase_storage_admin",
        unique: true,
        nullsNotDistinct: false,
        sql: 'CREATE UNIQUE INDEX "idx_objects_null_version" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C") WHERE (NOT "is_versioned");',
      },
      {
        schema: "storage",
        table: "objects",
        name: "objects_bucket_id_name_version_key",
        owner: "supabase_storage_admin",
        unique: true,
        nullsNotDistinct: true,
        sql: 'CREATE UNIQUE INDEX "objects_bucket_id_name_version_key" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C", "version") NULLS NOT DISTINCT;',
      },
    ],
    requiredVerification: [
      "exact-seven-index-delta-from-verified-local-baseline",
      "exact-definition-owner-uniqueness-collation-predicate-and-null-semantics",
      "all-seven-indexes-valid-and-ready-before-copy-and-after-restart",
      "reject-preexisting-name-collisions-and-any-additional-index",
    ],
  },
  requiredEmptyTargetTables: [
    "storage.iceberg_namespaces",
    "storage.iceberg_tables",
  ],
  requiredEmptyRowCount: 0,
  emptyTableCheckPhases: ["before-copy", "after-sql", "after-managed-services"],
  aclPolicy: {
    sourceProfileId: CLOUD_MANAGED_DATA_PROFILE_ID,
    targetProfileId: DEFAULT_MANAGED_DATA_PROFILE_ID,
    knownDifferentTables: ["storage.buckets", "storage.objects"],
    action: "verify-each-side-against-its-own-registered-profile",
    applySourceAclToTarget: false,
    applicationAndDefaultPrivileges: "exact-backup-parity-required",
  },
  pendingChecks: [
    "backup-manifest-origin-and-checksums",
    "backup-commit-and-restorer-revision-policy",
    "application-baseline-matches-backup-ledger-not-newer-local-candidate",
    "encrypted-scratch-and-docker-storage",
    "isolated-target-identity-runtime-pins-and-complete-local-catalog",
    "apply-and-verify-only-the-seven-index-supplement",
    "prove-local-only-iceberg-tables-empty-at-each-required-phase",
    "verify-both-managed-acl-profiles-and-exact-application-acl",
    "exact-copy-data-and-storage-bytes-restoration",
    "prove-managed-histories-and-other-managed-ddl-unchanged",
    "prove-source-unchanged-and-complete-target-cleanup",
  ],
});

export function getManagedRestoreSupplementPolicy(policyId) {
  if (policyId !== policy.id) {
    throw new Error(`Política de suplemento desconocida: ${String(policyId)}.`);
  }
  return policy;
}

function registeredProfile(value, expected, label) {
  const registered = getManagedDataProfile(
    typeof value === "string" ? value : value?.id,
  );
  if (typeof value !== "string" && value !== registered) {
    throw new Error(`${label}: se requiere el objeto de perfil registrado.`);
  }
  if (
    registered.id !== expected.profileId ||
    registered.policyVersion !== expected.policyVersion ||
    sha256CanonicalJson(registered.tables) !== expected.inventorySha256 ||
    registered.tables.length !== expected.inventoryTableCount ||
    registered.tables.filter(({ excluded }) => !excluded).length !==
      expected.includedCopyTableCount
  ) {
    throw new Error(`${label}: el perfil no coincide con la pareja auditada.`);
  }
  return registered;
}

function verifyReference(sql, expected, label) {
  if (typeof sql !== "string" || sql.length === 0) {
    throw new Error(`${label}: falta la referencia SQL completa.`);
  }
  const canonicalSha256 = sha256Buffer(Buffer.from(canonicalizePgDump(sql)));
  if (canonicalSha256 !== expected.canonicalSchemaSha256) {
    throw new Error(
      `${label}: el SHA-256 canónico no coincide con la referencia auditada.`,
    );
  }
  return canonicalSha256;
}

export function buildManagedRestoreSupplementPlan(input) {
  const expectedKeys = [
    "policyId",
    "sourceManagedSchemaSql",
    "sourceProfile",
    "targetManagedSchemaSql",
    "targetProfile",
  ];
  if (
    arguments.length !== 1 ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(expectedKeys)
  ) {
    throw new Error(
      "Entrada de suplemento inválida o con campos desconocidos.",
    );
  }
  const selected = getManagedRestoreSupplementPolicy(input.policyId);
  const source = registeredProfile(
    input.sourceProfile,
    selected.source,
    "source",
  );
  const target = registeredProfile(
    input.targetProfile,
    selected.target,
    "target",
  );
  const sourceSha256 = verifyReference(
    input.sourceManagedSchemaSql,
    selected.source,
    "source",
  );
  const targetSha256 = verifyReference(
    input.targetManagedSchemaSql,
    selected.target,
    "target",
  );

  return deepFreeze({
    format: MANAGED_RESTORE_SUPPLEMENT_PLAN_FORMAT,
    policyId: selected.id,
    status: "supplement_required",
    executionAllowed: false,
    scope: "managed-ddl-references-only",
    references: {
      source: { profileId: source.id, canonicalSchemaSha256: sourceSha256 },
      target: { profileId: target.id, canonicalSchemaSha256: targetSha256 },
    },
    indexSupplement: selected.indexSupplement,
    requiredEmptyTargetTables: selected.requiredEmptyTargetTables,
    requiredEmptyRowCount: selected.requiredEmptyRowCount,
    emptyTableCheckPhases: selected.emptyTableCheckPhases,
    aclPolicy: selected.aclPolicy,
    managedSchemaReferenceApplied: false,
    managedHistoriesPreservation: "not_verified",
    pendingChecks: selected.pendingChecks,
  });
}
