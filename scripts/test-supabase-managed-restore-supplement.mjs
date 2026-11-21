import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLOUD_MANAGED_DATA_PROFILE_ID,
  DEFAULT_MANAGED_DATA_PROFILE_ID,
  getManagedDataProfile,
} from "./supabase-managed-data-policy.mjs";
import {
  buildManagedRestoreSupplementPlan,
  getManagedRestoreSupplementPolicy,
  MANAGED_RESTORE_SUPPLEMENT_POLICY_ID,
} from "./supabase-managed-restore-supplement-policy.mjs";

const policy = getManagedRestoreSupplementPolicy(
  MANAGED_RESTORE_SUPPLEMENT_POLICY_ID,
);
const cloud = getManagedDataProfile(CLOUD_MANAGED_DATA_PROFILE_ID);
const local = getManagedDataProfile(DEFAULT_MANAGED_DATA_PROFILE_ID);
assert.equal(
  policy.source.canonicalSchemaSha256,
  "fbcee7200d4f8459f9eae4eead125cc3fb4b5f08b2122e3f6dd01b1ca55529ec",
);
assert.equal(
  policy.target.canonicalSchemaSha256,
  "7ab2528928d33f5462126da7587962f1279a767ee5f8e6e4c898bd9c2ebda1a4",
);
assert.equal(policy.indexSupplement.phase, "before-copy");
assert.deepEqual(
  policy.indexSupplement.indexes.map(({ name }) => name),
  [
    "idx_users_created_at_desc",
    "idx_users_email",
    "idx_users_last_sign_in_at_desc",
    "idx_users_name",
    "idx_objects_current_version",
    "idx_objects_null_version",
    "objects_bucket_id_name_version_key",
  ],
);
assert.equal(
  policy.indexSupplement.indexes.filter(({ unique }) => unique).length,
  3,
);
assert.deepEqual(
  policy.indexSupplement.indexes
    .filter(({ nullsNotDistinct }) => nullsNotDistinct)
    .map(({ name }) => name),
  ["objects_bucket_id_name_version_key"],
);
assert.ok(
  policy.indexSupplement.indexes.every(
    ({ sql }) =>
      !/IF NOT EXISTS|CONCURRENTLY|GRANT|ALTER|DROP|SET ROLE/.test(sql),
  ),
);
assert.deepEqual(policy.requiredEmptyTargetTables, [
  "storage.iceberg_namespaces",
  "storage.iceberg_tables",
]);
assert.equal(policy.requiredEmptyRowCount, 0);
assert.deepEqual(policy.emptyTableCheckPhases, [
  "before-copy",
  "after-sql",
  "after-managed-services",
]);
assert.equal(policy.aclPolicy.applySourceAclToTarget, false);
assert.ok(
  policy.pendingChecks.includes("encrypted-scratch-and-docker-storage"),
);

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertDeepFrozen(child);
}
assertDeepFrozen(policy);
assert.throws(() => {
  policy.source.canonicalSchemaSha256 = "0".repeat(64);
});
assert.throws(() => {
  policy.indexSupplement.indexes.push({});
});
for (const id of [undefined, null, "", "unknown", "__proto__", {}, cloud.id]) {
  assert.throws(() => getManagedRestoreSupplementPolicy(id), /desconocida/);
}

const untrustedInput = {
  policyId: policy.id,
  sourceProfile: cloud,
  targetProfile: local,
  sourceManagedSchemaSql: "SELECT 1;\n",
  targetManagedSchemaSql: "SELECT 1;\n",
};
assert.throws(
  () => buildManagedRestoreSupplementPlan(untrustedInput),
  /SHA-256/,
);
for (const input of [
  undefined,
  null,
  [],
  {},
  { ...untrustedInput, expectedSourceSha256: "x" },
]) {
  assert.throws(() => buildManagedRestoreSupplementPlan(input), /Entrada/);
}
assert.throws(
  () => buildManagedRestoreSupplementPlan(untrustedInput, { policy }),
  /Entrada/,
);
for (const key of Object.keys(untrustedInput)) {
  const missing = { ...untrustedInput };
  delete missing[key];
  assert.throws(() => buildManagedRestoreSupplementPlan(missing), /Entrada/);
}
for (const key of ["sourceProfile", "targetProfile"]) {
  for (const value of [
    undefined,
    null,
    "unknown",
    {},
    { ...(key === "sourceProfile" ? cloud : local) },
  ]) {
    assert.throws(
      () =>
        buildManagedRestoreSupplementPlan({ ...untrustedInput, [key]: value }),
      /Perfil|perfil/,
    );
  }
}
assert.throws(
  () =>
    buildManagedRestoreSupplementPlan({
      ...untrustedInput,
      policyId: "unknown",
    }),
  /desconocida/,
);
assert.throws(
  () =>
    buildManagedRestoreSupplementPlan({
      ...untrustedInput,
      sourceProfile: local,
      targetProfile: cloud,
    }),
  /pareja auditada/,
);

// Optional, read-only integration against references retained on encrypted
// storage. No real reference is copied into Git and no hash can be overridden.
const paths = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  assert.ok(
    ["--cloud-reference", "--local-reference"].includes(key),
    "Argumento desconocido.",
  );
  assert.equal(Object.hasOwn(paths, key), false, "Argumento duplicado.");
  assert.ok(
    args[i + 1] && !args[i + 1].startsWith("--"),
    "Falta ruta de referencia.",
  );
  paths[key] = args[i + 1];
}
if (Object.keys(paths).length > 0) {
  assert.equal(Object.keys(paths).length, 2, "Se requieren ambas referencias.");
  const input = {
    ...untrustedInput,
    sourceManagedSchemaSql: readFileSync(paths["--cloud-reference"], "utf8"),
    targetManagedSchemaSql: readFileSync(paths["--local-reference"], "utf8"),
  };
  const plan = buildManagedRestoreSupplementPlan(input);
  assert.equal(plan.status, "supplement_required");
  assert.equal(plan.executionAllowed, false);
  assert.equal(plan.managedSchemaReferenceApplied, false);
  assert.equal(plan.managedHistoriesPreservation, "not_verified");
  assertDeepFrozen(plan);
  assert.deepEqual(
    buildManagedRestoreSupplementPlan({
      ...input,
      sourceProfile: cloud.id,
      targetProfile: local.id,
    }),
    plan,
  );
  for (const { sql, name } of plan.indexSupplement.indexes) {
    assert.equal(input.sourceManagedSchemaSql.split(sql).length - 1, 1, name);
    assert.equal(input.targetManagedSchemaSql.includes(sql), false, name);
    assert.throws(
      () =>
        buildManagedRestoreSupplementPlan({
          ...input,
          sourceManagedSchemaSql: input.sourceManagedSchemaSql.replace(sql, ""),
        }),
      /SHA-256/,
    );
  }
  for (const key of ["sourceManagedSchemaSql", "targetManagedSchemaSql"]) {
    for (const mutation of [
      "\n",
      "-- extra canonical byte\n",
      'ALTER TABLE "storage"."objects" ADD COLUMN "unexpected" text;\n',
      'CREATE INDEX "unexpected" ON "storage"."objects" ("name");\n',
      'GRANT ALL ON "storage"."objects" TO PUBLIC;\n',
    ]) {
      assert.throws(
        () =>
          buildManagedRestoreSupplementPlan({
            ...input,
            [key]: input[key] + mutation,
          }),
        /SHA-256/,
      );
    }
    for (const sql of ["", null, input[key].slice(1)]) {
      assert.throws(
        () => buildManagedRestoreSupplementPlan({ ...input, [key]: sql }),
        /referencia|SHA-256/,
      );
    }
  }
  for (const [before, after] of [
    ["NULLS NOT DISTINCT", "NULLS DISTINCT"],
    ['WHERE ("archived_at" IS NULL)', 'WHERE ("archived_at" IS NOT NULL)'],
    ['WHERE (NOT "is_versioned")', 'WHERE ("is_versioned")'],
    ['"name" COLLATE "C"', '"name"'],
    [
      'CREATE UNIQUE INDEX "idx_objects_current_version"',
      'CREATE INDEX "idx_objects_current_version"',
    ],
  ]) {
    assert.ok(input.sourceManagedSchemaSql.includes(before));
    assert.throws(
      () =>
        buildManagedRestoreSupplementPlan({
          ...input,
          sourceManagedSchemaSql: input.sourceManagedSchemaSql.replace(
            before,
            after,
          ),
        }),
      /SHA-256/,
    );
  }
  console.log(
    "Suplemento administrado: pareja real auditada y mutaciones verificadas; plan supplement_required, ninguna ejecución habilitada.",
  );
} else {
  console.log(
    "Suplemento administrado: registro estricto y rechazos verificados; referencias completas externas no suministradas.",
  );
}
