import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  auditGitRepository,
  classifyRemoteUrl,
  createGitRecoveryBundle,
  GIT_BUNDLE_CHECKSUM_FILENAME,
  GIT_BUNDLE_FILENAME,
  GIT_BUNDLE_MANIFEST_FILENAME,
  gitRecoveryChildProcessContract,
  verifyGitRecoveryBundleDirectory,
} from "./git-recovery-lib.mjs";

function git(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || `git ${args.join(" ")} falló.`,
  );
  return result.stdout.trim();
}

function initializeRepository(parent, name) {
  const repoRoot = path.join(parent, name);
  git(parent, ["init", "--quiet", "--initial-branch=master", repoRoot]);
  git(repoRoot, ["config", "user.name", "Agorbis Test"]);
  git(repoRoot, ["config", "user.email", "test@agorbis.test"]);
  git(repoRoot, ["config", "commit.gpgsign", "false"]);
  writeFileSync(path.join(repoRoot, "README.md"), "# Fixture Git\n");
  git(repoRoot, ["add", "README.md"]);
  git(repoRoot, ["commit", "--quiet", "-m", "initial"]);
  return repoRoot;
}

function commitFile(repoRoot, name, content, message) {
  writeFileSync(path.join(repoRoot, name), content);
  git(repoRoot, ["add", "--", name]);
  git(repoRoot, ["commit", "--quiet", "-m", message]);
}

const sandbox = mkdtempSync(path.join(tmpdir(), "agorbis-git-recovery-tests-"));
chmodSync(sandbox, 0o700);

try {
  const childContract = gitRecoveryChildProcessContract();
  assert.equal(childContract.command, "/usr/bin/git");
  assert.equal(childContract.shell, false);
  assert.deepEqual(childContract.environment, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
  });
  assert.equal(
    JSON.stringify(childContract).includes("TOKEN") ||
      JSON.stringify(childContract).includes("credential"),
    false,
  );

  assert.deepEqual(classifyRemoteUrl("git@github.com:seba-ar/agorbis.git"), {
    kind: "ssh",
    safe: true,
  });
  assert.deepEqual(
    classifyRemoteUrl("https://github.com/seba-ar/agorbis.git"),
    { kind: "https", safe: true },
  );
  assert.equal(
    classifyRemoteUrl("https://token@github.com/seba-ar/agorbis.git").safe,
    false,
  );
  assert.equal(
    classifyRemoteUrl("http://github.com/seba-ar/agorbis.git").safe,
    false,
  );

  const cleanRepo = initializeRepository(sandbox, "clean-repo");
  commitFile(cleanRepo, "app.mjs", "export const ready = true;\n", "add app");
  git(cleanRepo, ["tag", "-a", "v1.0.0", "-m", "release"]);

  const mainOid = git(cleanRepo, ["rev-parse", "HEAD"]);
  git(cleanRepo, ["checkout", "--quiet", "--detach", "HEAD"]);
  const excludedSecret = ["sb", "secret", "X".repeat(32)].join("_");
  commitFile(
    cleanRepo,
    "internal-only.txt",
    `${excludedSecret}\n`,
    "internal checkpoint",
  );
  const internalOid = git(cleanRepo, ["rev-parse", "HEAD"]);
  git(cleanRepo, ["checkout", "--quiet", "master"]);
  assert.equal(git(cleanRepo, ["rev-parse", "HEAD"]), mainOid);
  git(cleanRepo, ["update-ref", "refs/codex/test-only", internalOid]);

  const cleanAudit = auditGitRepository(cleanRepo);
  assert.equal(cleanAudit.fsckValid, true);
  assert.equal(cleanAudit.history.findings.length, 0);
  assert.equal(cleanAudit.internalRefCount, 1);
  assert.equal(cleanAudit.statusEntryCount, 0);

  const bundleOne = path.join(sandbox, "bundle-one");
  const bundleTwo = path.join(sandbox, "bundle-two");
  const first = createGitRecoveryBundle({
    repoRoot: cleanRepo,
    outputDir: bundleOne,
    sourceDateEpoch: "0",
  });
  const second = createGitRecoveryBundle({
    repoRoot: cleanRepo,
    outputDir: bundleTwo,
    sourceDateEpoch: "0",
  });
  assert.equal(first.headOid, mainOid);
  assert.equal(first.bundleSha256, second.bundleSha256);
  assert.deepEqual(verifyGitRecoveryBundleDirectory(bundleOne), first);
  assert.equal(statSync(bundleOne).mode & 0o777, 0o700);
  for (const name of [
    GIT_BUNDLE_FILENAME,
    GIT_BUNDLE_MANIFEST_FILENAME,
    GIT_BUNDLE_CHECKSUM_FILENAME,
  ]) {
    assert.equal(statSync(path.join(bundleOne, name)).mode & 0o777, 0o600);
  }
  const manifest = JSON.parse(
    readFileSync(path.join(bundleOne, GIT_BUNDLE_MANIFEST_FILENAME), "utf8"),
  );
  assert.equal(
    manifest.includedRefs.some((entry) => entry.name.startsWith("refs/codex/")),
    false,
  );
  assert.equal(manifest.source.internalRefCountExcluded, 1);

  assert.throws(
    () =>
      createGitRecoveryBundle({
        repoRoot: cleanRepo,
        outputDir: path.join(cleanRepo, "forbidden-bundle"),
      }),
    /fuera del repositorio/,
  );

  const extraPath = path.join(bundleTwo, "unexpected.txt");
  writeFileSync(extraPath, "unexpected\n", { mode: 0o600 });
  assert.throws(
    () => verifyGitRecoveryBundleDirectory(bundleTwo),
    /archivos faltantes o inesperados/,
  );
  unlinkSync(extraPath);
  appendFileSync(path.join(bundleTwo, GIT_BUNDLE_FILENAME), "tamper");
  assert.throws(
    () => verifyGitRecoveryBundleDirectory(bundleTwo),
    /SHA-256 no coincide/,
  );

  writeFileSync(path.join(cleanRepo, "dirty.txt"), "not committed\n");
  const dirtyOutput = path.join(sandbox, "dirty-output");
  assert.throws(
    () =>
      createGitRecoveryBundle({
        repoRoot: cleanRepo,
        outputDir: dirtyOutput,
      }),
    /worktree o el índice no están limpios/,
  );
  assert.equal(existsSync(dirtyOutput), false);

  const secretRepo = initializeRepository(sandbox, "secret-history-repo");
  const historicalSecret = ["sb", "secret", "A".repeat(32)].join("_");
  commitFile(
    secretRepo,
    "temporary.txt",
    `${historicalSecret}\n`,
    "add secret",
  );
  commitFile(secretRepo, "temporary.txt", "removed\n", "remove secret");
  const secretAudit = auditGitRepository(secretRepo);
  assert.equal(secretAudit.history.findings.length, 1);
  assert.equal(secretAudit.history.findings[0].label, "Supabase secret key");
  assert.doesNotMatch(
    JSON.stringify(secretAudit.history.findings),
    new RegExp(historicalSecret),
  );
  const secretOutput = path.join(sandbox, "secret-output");
  assert.throws(
    () =>
      createGitRecoveryBundle({
        repoRoot: secretRepo,
        outputDir: secretOutput,
      }),
    /historial alcanzable contiene secretos conocidos/,
  );
  assert.equal(existsSync(secretOutput), false);

  const unsafeRemoteRepo = initializeRepository(sandbox, "unsafe-remote-repo");
  const credentialedRemote = `https://${["token", "fixture"].join("-")}@github.com/seba-ar/agorbis.git`;
  git(unsafeRemoteRepo, ["remote", "add", "origin", credentialedRemote]);
  const unsafeAudit = auditGitRepository(unsafeRemoteRepo);
  assert.equal(unsafeAudit.remotes[0].safe, false);
  let unsafeRemoteError;
  try {
    createGitRecoveryBundle({
      repoRoot: unsafeRemoteRepo,
      outputDir: path.join(sandbox, "unsafe-remote-output"),
    });
  } catch (error) {
    unsafeRemoteError = error;
  }
  assert.match(
    unsafeRemoteError?.message ?? "",
    /URL remote insegura o con credenciales/,
  );
  assert.doesNotMatch(
    unsafeRemoteError?.message ?? "",
    new RegExp(credentialedRemote),
  );

  console.log(
    "Git recovery: auditoría, bundle, restore y fallos cerrados verificados.",
  );
} finally {
  rmSync(sandbox, { force: true, recursive: true });
}
