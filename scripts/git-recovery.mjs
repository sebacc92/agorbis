import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditGitRepository,
  createGitRecoveryBundle,
  verifyGitRecoveryBundleDirectory,
} from "./git-recovery-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.umask(0o077);

function usage() {
  console.error(`Uso:
  node scripts/git-recovery.mjs audit
  node scripts/git-recovery.mjs create --output-dir /ruta/nueva/fuera-del-repo
  node scripts/git-recovery.mjs verify --bundle-dir /ruta/existente`);
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!command || !["audit", "create", "verify"].includes(command)) {
    usage();
    throw new Error("Comando de recuperación Git inválido.");
  }
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (current === "--") continue;
    if (current === "--output-dir" && command === "create") {
      if (options.outputDir || !rest[index + 1])
        throw new Error("--output-dir requiere una única ruta.");
      options.outputDir = rest[++index];
    } else if (current === "--bundle-dir" && command === "verify") {
      if (options.bundleDir || !rest[index + 1])
        throw new Error("--bundle-dir requiere una única ruta.");
      options.bundleDir = rest[++index];
    } else {
      throw new Error(`Argumento inesperado: ${current}`);
    }
  }
  if (command === "create" && !options.outputDir)
    throw new Error("Falta --output-dir.");
  if (command === "verify" && !options.bundleDir)
    throw new Error("Falta --bundle-dir.");
  return options;
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 22) {
    throw new Error(
      `La recuperación Git exige Node 22.x; versión activa: ${process.version}.`,
    );
  }
}

function summarizeAudit(audit) {
  const blockingFindings =
    !audit.fsckValid ||
    audit.shallow ||
    audit.hasGitmodules ||
    audit.history.findings.length > 0 ||
    audit.history.gitlinks.length > 0 ||
    audit.history.lfsPointers.length > 0 ||
    audit.worktree.findings.length > 0 ||
    audit.remotes.some((remote) => !remote.safe);
  const bundleReady =
    !blockingFindings && audit.statusEntryCount === 0 && !audit.stash;
  console.log(`Auditoría Git: ${blockingFindings ? "BLOQUEADA" : "íntegra"}`);
  console.log(`  HEAD: ${audit.headRef} @ ${audit.headOid}`);
  console.log(`  Integridad fsck: ${audit.fsckValid ? "OK" : "FAIL"}`);
  console.log(`  Repositorio shallow: ${audit.shallow ? "sí" : "no"}`);
  console.log(`  Ramas/tags recuperables: ${audit.localRefs.length}`);
  console.log(`  Remote(s): ${audit.remotes.length}`);
  console.log(`  Upstream: ${audit.upstream ?? "ninguno"}`);
  console.log(`  Refs internas excluidas: ${audit.internalRefCount}`);
  console.log(`  Entradas dirty: ${audit.statusEntryCount}`);
  console.log(`  Stash excluido presente: ${audit.stash ? "sí" : "no"}`);
  console.log(
    `  Historial: ${audit.history.objectCount} objetos; ${audit.history.textObjectCount} textos; ${audit.history.findings.length} secretos conocidos; ${audit.history.lfsPointers.length} punteros LFS; ${audit.history.gitlinks.length} gitlinks`,
  );
  console.log(
    `  Archivos versionables: ${audit.worktree.fileCount}; ${audit.worktree.findings.length} secretos conocidos`,
  );
  for (const finding of audit.history.findings) {
    console.error(
      `  ✗ historial ${finding.oid.slice(0, 12)} ${finding.path}:${finding.line} · ${finding.label}`,
    );
  }
  for (const finding of audit.worktree.findings) {
    console.error(
      `  ✗ worktree ${finding.path}:${finding.line} · ${finding.label}`,
    );
  }
  for (const remote of audit.remotes.filter((entry) => !entry.safe)) {
    console.error(
      `  ✗ remote ${remote.name} usa una URL insegura o con credenciales.`,
    );
  }
  console.log(`  Listo para bundle: ${bundleReady ? "sí" : "no"}`);
  if (audit.remotes.length === 0) {
    console.warn(
      "  ! No existe remote: el código comprometido depende todavía de este disco.",
    );
  }
  if (audit.statusEntryCount > 0) {
    console.warn(
      "  ! El bundle se bloqueará hasta que el release candidate esté comprometido y el worktree limpio.",
    );
  }
  if (audit.stash)
    console.warn("  ! El bundle se bloqueará mientras exista refs/stash.");
  if (blockingFindings) process.exitCode = 1;
}

function printVerification(result) {
  console.log("Bundle Git verificado y restaurable.");
  console.log(`  HEAD: ${result.headRef} @ ${result.headOid}`);
  console.log(`  Refs: ${result.refCount}`);
  console.log(`  Bytes: ${result.bundleBytes}`);
  console.log(`  SHA-256: ${result.bundleSha256}`);
}

try {
  assertNodeVersion();
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "audit") {
    summarizeAudit(auditGitRepository(root));
  } else if (options.command === "create") {
    printVerification(
      createGitRecoveryBundle({ repoRoot: root, outputDir: options.outputDir }),
    );
  } else {
    printVerification(verifyGitRecoveryBundleDirectory(options.bundleDir));
  }
} catch (error) {
  console.error(`Recuperación Git: BLOQUEADA · ${error.message}`);
  process.exit(1);
}
