import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertBackupManagedDataProfile,
  verifyBackupChecksumIndex,
  verifyBackupDirectory,
} from "./supabase-backup-lib.mjs";
import {
  CLOUD_MANAGED_DATA_PROFILE_ID,
  DEFAULT_MANAGED_DATA_PROFILE_ID,
  getManagedDataProfile,
} from "./supabase-managed-data-policy.mjs";
import {
  buildManagedRestoreSupplementPlan,
  MANAGED_RESTORE_SUPPLEMENT_POLICY_ID,
} from "./supabase-managed-restore-supplement-policy.mjs";

function main() {
  if (Number(process.versions.node.split(".")[0]) !== 22) {
    throw new Error("La auditoría requiere Node 22.x.");
  }
  const options = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!["--backup-dir", "--local-managed-reference"].includes(flag)) {
      throw new Error("Argumento desconocido para la auditoría de referencia.");
    }
    const value = args[index + 1];
    if (
      Object.hasOwn(options, flag) ||
      !value ||
      !path.isAbsolute(value) ||
      /[\r\n\0]/.test(value)
    ) {
      throw new Error("Cada argumento requiere una única ruta absoluta.");
    }
    options[flag] = value;
  }
  if (!options["--backup-dir"] || !options["--local-managed-reference"]) {
    throw new Error("Faltan --backup-dir y --local-managed-reference.");
  }
  const manifest = verifyBackupDirectory(options["--backup-dir"]);
  verifyBackupChecksumIndex(options["--backup-dir"], manifest);
  const sourceProfile = assertBackupManagedDataProfile(manifest);
  if (sourceProfile.id !== CLOUD_MANAGED_DATA_PROFILE_ID) {
    throw new Error("Esta auditoría requiere el perfil cloud registrado.");
  }
  const plan = buildManagedRestoreSupplementPlan({
    policyId: MANAGED_RESTORE_SUPPLEMENT_POLICY_ID,
    sourceProfile,
    targetProfile: getManagedDataProfile(DEFAULT_MANAGED_DATA_PROFILE_ID),
    sourceManagedSchemaSql: readFileSync(
      path.join(
        options["--backup-dir"],
        "database/managed-schema-reference.sql",
      ),
      "utf8",
    ),
    targetManagedSchemaSql: readFileSync(
      options["--local-managed-reference"],
      "utf8",
    ),
  });
  if (
    plan.status !== "supplement_required" ||
    plan.executionAllowed !== false
  ) {
    throw new Error("La auditoría no puede autorizar una restauración.");
  }
  console.log(
    JSON.stringify(
      {
        format: "agorbis-managed-restore-audit/v1",
        checkedAt: new Date().toISOString(),
        backupId: manifest.backupId,
        backupCommit: manifest.repository.commit,
        migrationCount: manifest.database.migrationCount,
        migrationHead: manifest.database.migrationHead,
        status: plan.status,
        executionAllowed: false,
        explanation:
          "Las referencias coinciden con la pareja auditada. Faltan aplicar y verificar el suplemento en un destino aislado y cifrado, con baseline y commit compatibles. No se ejecutó SQL ni se verificó la restauración.",
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch {
  // Do not echo SQL, backup contents, filesystem values or provider errors.
  console.error(
    "Auditoría de referencia: BLOQUEADA. Revisá argumentos, integridad del backup y pareja DDL registrada; no se ejecutó SQL.",
  );
  process.exitCode = 1;
}
