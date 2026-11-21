import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  exceptionalReleaseRequestHash,
} from "./exceptional-release-act.mjs";
import {
  deriveExceptionalReleaseArtifactPaths,
  readExceptionalReleaseArtifactManifest,
} from "./exceptional-release-artifact.mjs";
import { CANDIDATE_MIGRATION_IDS } from "./production-preflight-policy.mjs";
import {
  EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS,
  EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION,
  exceptionalOpenRecoveryEvidenceHash,
} from "./exceptional-open-recovery-capsule.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ISSUED = new WeakMap();
const HASH = /^[a-f0-9]{64}$/;
const OBSERVATION_SCHEMA = "agorbis-local-open-recovery-observation/v1";
const SCOPE = "frozen-worker-node-local-supabase-offline-turnstile";
const SOURCES = Object.freeze([
  "scripts/run-local-open-recovery-compatibility.mjs",
  "scripts/d72-open-recovery-compatibility.mjs",
  "supabase/tests/google_auth_consent_checks.sql",
  "src/lib/oauth-session.spec.ts",
  "src/lib/protected-auth-session.spec.ts",
]);
function invariant(value, message) {
  if (!value) throw new Error(message);
}
const hash = (source) => createHash("sha256").update(source).digest("hex");
const exact = (value, keys) =>
  value &&
  Object.getPrototypeOf(value) === Object.prototype &&
  JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...keys].sort());

/** Structural validation only. It cannot issue a compatibility receipt. */
export function assertLocalOpenRecoveryObservation(
  value,
  { recoveryArtifactHash } = {},
) {
  invariant(
    exact(value, [
      "schemaVersion",
      "scope",
      "recoveryArtifactHash",
      "migrationIds",
      "checks",
      "accountCleanupConfirmed",
      "externalNetworkRequests",
      "completedAtUtc",
    ]),
    "Observación local de recuperación inválida.",
  );
  invariant(
    value.schemaVersion === OBSERVATION_SCHEMA &&
      value.scope === SCOPE &&
      typeof recoveryArtifactHash === "string" &&
      HASH.test(recoveryArtifactHash) &&
      value.recoveryArtifactHash === recoveryArtifactHash,
    "La comprobación local no pertenece al fallback congelado.",
  );
  invariant(
    JSON.stringify(value.migrationIds) ===
      JSON.stringify(CANDIDATE_MIGRATION_IDS),
    `La comprobación local no observó el ledger exacto de ${CANDIDATE_MIGRATION_IDS.length} migraciones.`,
  );
  invariant(
    Array.isArray(value.checks) &&
      value.checks.length === EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.length &&
      value.checks.every(
        (item, index) =>
          exact(item, ["id", "status"]) &&
          item.id === EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS[index] &&
          item.status === "PASS",
      ),
    "La compatibilidad local requiere las siete comprobaciones reales.",
  );
  invariant(
    value.accountCleanupConfirmed === true &&
      value.externalNetworkRequests === 0 &&
      typeof value.completedAtUtc === "string" &&
      new Date(value.completedAtUtc).toISOString() === value.completedAtUtc,
    "La comprobación local no confirmó limpieza o aislamiento.",
  );
  return value;
}

function fixedEnvironment() {
  return Object.fromEntries(
    [
      "HOME",
      "USER",
      "LOGNAME",
      "XDG_CACHE_HOME",
      "XDG_RUNTIME_DIR",
      "DISPLAY",
      "WAYLAND_DISPLAY",
    ]
      .flatMap((name) =>
        typeof process.env[name] === "string"
          ? [[name, process.env[name]]]
          : [],
      )
      .concat([
        ["PATH", `${path.dirname(process.execPath)}:/usr/bin:/bin`],
        ["LANG", "C.UTF-8"],
        ["CI", "1"],
      ]),
  );
}

/**
 * Runs only the frozen fallback with local backend bindings. The offline dummy
 * Turnstile and Node execution are explicit limits: this is neither an OAuth
 * production check nor a Cloudflare edge / antiabuse certification. dist is not
 * rebuilt or rewritten. No receipt is issued until local account cleanup passes.
 */
export function collectD72OpenRecoveryCompatibility({
  repositoryRoot,
  request,
  requestPath,
  recoveryArtifact,
} = {}) {
  invariant(
    repositoryRoot === ROOT &&
      realpathSync(repositoryRoot) === ROOT &&
      process.versions.node === "22.22.0",
    "La compatibilidad exige repositorio y runtime locales fijados.",
  );
  invariant(
    request?.releaseMode === "OPEN_UPDATE" &&
      recoveryArtifact?.manifest?.artifactPurpose === "recovery",
    "La compatibilidad requiere el fallback OPEN congelado.",
  );
  const requestHash = exceptionalReleaseRequestHash(request);
  const recoveryArtifactHash = recoveryArtifact.artifactHash;
  invariant(
    recoveryArtifact.artifactRoot ===
      deriveExceptionalReleaseArtifactPaths(requestPath, {
        artifactPurpose: "recovery",
      }).artifactRoot,
    "La comprobación debe ejecutar la ruta del fallback congelado de este request.",
  );
  const readArtifact = () =>
    readExceptionalReleaseArtifactManifest({
      requestPath,
      artifactPurpose: "recovery",
      worktreeRoot: ROOT,
      expectedHead: request.head,
      expectedPolicyVersion: request.policyVersion,
      expectedPolicyHash: request.policyHash,
      expectedRequestHash: requestHash,
      expectedArtifactHash: recoveryArtifactHash,
    });
  const before = readArtifact();
  invariant(
    canonicalJson(before) === canonicalJson(recoveryArtifact.manifest),
    "El fallback proporcionado no coincide con sus archivos congelados.",
  );
  const env = fixedEnvironment();
  const git = (args) => {
    const result = spawnSync("/usr/bin/git", args, {
      cwd: ROOT,
      env,
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      maxBuffer: 256 * 1024,
    });
    invariant(
      !result.error && !result.signal && result.status === 0,
      "No se pudo verificar el código local del fallback.",
    );
    return result.stdout.trim();
  };
  invariant(
    git(["rev-parse", "HEAD"]) === request.head &&
      git(["status", "--porcelain=v1", "--untracked-files=all"]) === "",
    "La compatibilidad exige el HEAD limpio del artefacto.",
  );
  const sources = SOURCES.map((file) => ({
    path: file,
    sha256: hash(readFileSync(path.join(ROOT, file))),
  }));
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts/run-local-open-recovery-compatibility.mjs"),
      "--artifact-root",
      recoveryArtifact.artifactRoot,
      "--artifact-hash",
      recoveryArtifactHash,
    ],
    {
      cwd: ROOT,
      env,
      encoding: "utf8",
      shell: false,
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  invariant(
    !result.error && !result.signal && result.status === 0,
    "La comprobación real del fallback local falló; no se emitió compatibilidad.",
  );
  let observation;
  try {
    observation = assertLocalOpenRecoveryObservation(
      JSON.parse(result.stdout),
      { recoveryArtifactHash },
    );
  } catch {
    throw new Error(
      "El runner local no entregó una comprobación válida y saneada.",
    );
  }
  invariant(
    canonicalJson(before) === canonicalJson(readArtifact()) &&
      git(["rev-parse", "HEAD"]) === request.head &&
      git(["status", "--porcelain=v1", "--untracked-files=all"]) === "",
    "Cambió el artefacto o su código durante la comprobación local.",
  );
  invariant(
    sources.every(
      (file) => hash(readFileSync(path.join(ROOT, file.path))) === file.sha256,
    ),
    "Cambió una prueba durante la comprobación local.",
  );
  const compatibilityEvidence = Object.freeze({
    schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_COMPATIBILITY_SCHEMA_VERSION,
    head: request.head,
    recoveryArtifactHash,
    migrationIds: Object.freeze([...CANDIDATE_MIGRATION_IDS]),
    checks: Object.freeze(
      EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.map((id) =>
        Object.freeze({
          id,
          result: "PASS",
          evidenceSha256: exceptionalOpenRecoveryEvidenceHash({
            id,
            scope: SCOPE,
            recoveryArtifactHash,
            sources,
            observation,
          }),
        }),
      ),
    ),
    verifiedAtUtc: observation.completedAtUtc,
  });
  const receipt = Object.freeze({
    compatibilityEvidence,
    compatibilitySha256: exceptionalOpenRecoveryEvidenceHash(
      compatibilityEvidence,
    ),
  });
  ISSUED.set(receipt, {
    head: request.head,
    requestHash,
    recoveryArtifactHash,
  });
  return receipt;
}

export function assertD72OpenRecoveryCompatibilityIssued(
  receipt,
  bindings = {},
) {
  const issued = ISSUED.get(receipt);
  invariant(
    issued &&
      ["head", "requestHash", "recoveryArtifactHash"].every(
        (key) => issued[key] === bindings[key],
      ),
    "La compatibilidad exige la observación opaca de este fallback; los facts y clones no sirven.",
  );
  return receipt;
}
