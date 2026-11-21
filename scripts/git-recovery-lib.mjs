import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { findKnownSecrets, KNOWN_SECRET_RULES } from "./secret-patterns.mjs";

export const GIT_RECOVERY_FORMAT_VERSION = 1;
export const GIT_BUNDLE_FILENAME = "agorbis.bundle";
export const GIT_BUNDLE_MANIFEST_FILENAME = "git-bundle-manifest.json";
export const GIT_BUNDLE_CHECKSUM_FILENAME = "SHA256SUMS.git-recovery";
export const EXCLUDED_REF_NAMESPACES = Object.freeze([
  "refs/codex/",
  "refs/remotes/",
  "refs/stash",
]);

const maxGitOutput = 512 * 1024 * 1024;
const GIT_BINARY = "/usr/bin/git";
const GIT_CHILD_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C",
  LC_ALL: "C",
  PATH: "/usr/bin:/bin",
});

function commandFailure(result) {
  return new Error(
    `Git terminó con ${result.status ?? "estado desconocido"}; la salida fue descartada de forma saneada.`,
  );
}

function runGit(repoRoot, args, { input, allowFailure = false } = {}) {
  const commandArgs = ["-C", repoRoot, ...args];
  const result = spawnSync(GIT_BINARY, commandArgs, {
    encoding: input instanceof Buffer ? null : "utf8",
    env: GIT_CHILD_ENVIRONMENT,
    input,
    maxBuffer: maxGitOutput,
    shell: false,
    windowsHide: true,
  });
  if (result.error)
    throw new Error("No se pudo ejecutar Git de forma saneada.");
  if (!allowFailure && result.status !== 0) {
    throw commandFailure(result);
  }
  return result;
}

export function gitRecoveryChildProcessContract() {
  return Object.freeze({
    command: GIT_BINARY,
    environment: GIT_CHILD_ENVIRONMENT,
    shell: false,
  });
}

function sha256Buffer(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".."
  );
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `${label} tiene claves inesperadas: ${actual.join(", ") || "(ninguna)"}.`,
    );
  }
}

function listLocalRefs(repoRoot) {
  const output = runGit(repoRoot, [
    "for-each-ref",
    "--format=%(refname)%09%(objectname)",
    "refs/heads/",
    "refs/tags/",
  ]).stdout.trim();
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => {
      const separator = line.indexOf("\t");
      if (separator <= 0)
        throw new Error("Git devolvió un inventario de refs inválido.");
      return { name: line.slice(0, separator), oid: line.slice(separator + 1) };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listReachableObjectIds(repoRoot, refs) {
  const revisionArguments = refs.map((entry) => entry.name);
  const output = runGit(repoRoot, [
    "rev-list",
    "--objects",
    ...revisionArguments,
  ]).stdout;
  const objectPaths = new Map();
  const objectIds = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf(" ");
    const oid = separator === -1 ? line : line.slice(0, separator);
    if (!/^[0-9a-f]{40,64}$/.test(oid)) {
      throw new Error("git rev-list devolvió un object ID inválido.");
    }
    if (!objectPaths.has(oid)) {
      objectIds.push(oid);
      objectPaths.set(oid, separator === -1 ? "" : line.slice(separator + 1));
    }
  }
  for (const entry of refs) {
    if (!objectPaths.has(entry.oid)) {
      objectIds.push(entry.oid);
      objectPaths.set(entry.oid, entry.name);
    }
  }
  return { objectIds, objectPaths };
}

function readGitObjects(repoRoot, objectIds) {
  const result = runGit(repoRoot, ["cat-file", "--batch"], {
    input: Buffer.from(`${objectIds.join("\n")}\n`),
  });
  const output = result.stdout;
  const objects = [];
  let offset = 0;
  for (const requestedOid of objectIds) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd === -1)
      throw new Error("git cat-file devolvió una cabecera truncada.");
    const header = output.subarray(offset, headerEnd).toString("utf8");
    const parts = header.split(" ");
    if (
      parts.length !== 3 ||
      parts[0] !== requestedOid ||
      !/^\d+$/.test(parts[2])
    ) {
      throw new Error(
        `git cat-file devolvió una cabecera inesperada para ${requestedOid}.`,
      );
    }
    const size = Number(parts[2]);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= output.length || output[contentEnd] !== 0x0a) {
      throw new Error(
        `git cat-file devolvió contenido truncado para ${requestedOid}.`,
      );
    }
    objects.push({
      oid: requestedOid,
      type: parts[1],
      content: output.subarray(contentStart, contentEnd),
    });
    offset = contentEnd + 1;
  }
  if (offset !== output.length) {
    throw new Error("git cat-file devolvió contenido adicional inesperado.");
  }
  return objects;
}

export function scanReachableGitHistory(
  repoRoot,
  refs = listLocalRefs(repoRoot),
) {
  if (refs.length === 0)
    throw new Error("No hay ramas ni tags locales para auditar.");
  const { objectIds, objectPaths } = listReachableObjectIds(repoRoot, refs);
  const findings = [];
  const gitlinks = [];
  const lfsPointers = [];
  let textObjects = 0;
  for (const object of readGitObjects(repoRoot, objectIds)) {
    if (
      object.type === "tree" &&
      object.content.includes(Buffer.from("160000 "))
    ) {
      gitlinks.push({ oid: object.oid });
    }
    if (!["blob", "commit", "tag"].includes(object.type)) continue;
    if (object.type === "blob" && object.content.includes(0)) continue;
    const source = object.content.toString("utf8");
    if (
      object.type === "blob" &&
      source.startsWith("version https://git-lfs.github.com/spec/v1\n")
    ) {
      lfsPointers.push({
        oid: object.oid,
        path: objectPaths.get(object.oid) || "(sin ruta)",
      });
    }
    textObjects += 1;
    for (const finding of findKnownSecrets(source)) {
      const line = source.slice(0, finding.index).split("\n").length;
      findings.push({
        label: finding.label,
        line,
        oid: object.oid,
        path: objectPaths.get(object.oid) || `(${object.type})`,
      });
    }
  }
  return {
    findings,
    gitlinks,
    lfsPointers,
    objectCount: objectIds.length,
    textObjectCount: textObjects,
  };
}

export function scanVersionableFiles(repoRoot) {
  const output = runGit(repoRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]).stdout;
  const files = output.split("\0").filter(Boolean);
  const findings = [];
  for (const file of files) {
    const absolute = path.join(repoRoot, file);
    let content;
    try {
      content = readFileSync(absolute);
    } catch {
      continue;
    }
    if (content.includes(0)) continue;
    const source = content.toString("utf8");
    for (const finding of findKnownSecrets(source)) {
      findings.push({
        label: finding.label,
        line: source.slice(0, finding.index).split("\n").length,
        path: file,
      });
    }
  }
  return { fileCount: files.length, findings };
}

export function classifyRemoteUrl(remoteUrl) {
  if (!remoteUrl || /[\u0000-\u001f\u007f]/.test(remoteUrl)) {
    return { kind: "invalid", safe: false };
  }
  if (/^[^/@:]+@[^/:]+:.+$/.test(remoteUrl)) {
    return { kind: "ssh", safe: true };
  }
  if (
    path.isAbsolute(remoteUrl) ||
    remoteUrl.startsWith("./") ||
    remoteUrl.startsWith("../")
  ) {
    return { kind: "local", safe: true };
  }
  let parsed;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return { kind: "unknown", safe: false };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { kind: "credentialed", safe: false };
  }
  if (parsed.protocol === "https:") return { kind: "https", safe: true };
  if (parsed.protocol === "ssh:") return { kind: "ssh", safe: true };
  if (parsed.protocol === "file:") return { kind: "local", safe: true };
  return { kind: parsed.protocol.replace(/:$/, "") || "unknown", safe: false };
}

function remoteInventory(repoRoot) {
  const names = runGit(repoRoot, ["remote"])
    .stdout.trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  const remotes = [];
  for (const name of names) {
    const fetchResult = runGit(repoRoot, ["remote", "get-url", "--all", name], {
      allowFailure: true,
    });
    const pushResult = runGit(
      repoRoot,
      ["remote", "get-url", "--all", "--push", name],
      {
        allowFailure: true,
      },
    );
    if (fetchResult.status !== 0 || pushResult.status !== 0) {
      remotes.push({ name, safe: false, kinds: ["invalid"] });
      continue;
    }
    const urls = `${fetchResult.stdout}\n${pushResult.stdout}`
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const classifications = urls.map(classifyRemoteUrl);
    remotes.push({
      name,
      safe: classifications.every((entry) => entry.safe),
      kinds: [...new Set(classifications.map((entry) => entry.kind))].sort(),
    });
  }
  return remotes;
}

export function auditGitRepository(repoRoot) {
  const resolvedRoot = realpathSync(repoRoot);
  const insideWorkTree = runGit(resolvedRoot, [
    "rev-parse",
    "--is-inside-work-tree",
  ]).stdout.trim();
  if (insideWorkTree !== "true")
    throw new Error("La ruta no es un worktree Git.");
  const localRefs = listLocalRefs(resolvedRoot);
  if (localRefs.length === 0)
    throw new Error("No hay ramas ni tags locales recuperables.");
  const headRefResult = runGit(
    resolvedRoot,
    ["symbolic-ref", "--quiet", "HEAD"],
    {
      allowFailure: true,
    },
  );
  if (headRefResult.status !== 0)
    throw new Error("HEAD debe apuntar a una rama local, no estar detached.");
  const headRef = headRefResult.stdout.trim();
  const headOid = runGit(resolvedRoot, [
    "rev-parse",
    "--verify",
    "HEAD^{commit}",
  ]).stdout.trim();
  if (
    !localRefs.some((entry) => entry.name === headRef && entry.oid === headOid)
  ) {
    throw new Error("HEAD no coincide con el tip de su rama local.");
  }
  const shallow =
    runGit(resolvedRoot, [
      "rev-parse",
      "--is-shallow-repository",
    ]).stdout.trim() === "true";
  const statusEntries = runGit(resolvedRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ])
    .stdout.split("\n")
    .filter(Boolean);
  const fsck = runGit(
    resolvedRoot,
    ["fsck", "--full", "--strict", "--no-dangling"],
    {
      allowFailure: true,
    },
  );
  const upstreamResult = runGit(
    resolvedRoot,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { allowFailure: true },
  );
  const remotes = remoteInventory(resolvedRoot);
  const history = scanReachableGitHistory(resolvedRoot, localRefs);
  const worktree = scanVersionableFiles(resolvedRoot);
  const stash =
    runGit(resolvedRoot, ["show-ref", "--verify", "--quiet", "refs/stash"], {
      allowFailure: true,
    }).status === 0;
  const internalRefCount = runGit(resolvedRoot, [
    "for-each-ref",
    "--format=%(refname)",
    "refs/codex/",
    "refs/remotes/",
  ])
    .stdout.split("\n")
    .filter(Boolean).length;
  return {
    fsckValid: fsck.status === 0,
    headOid,
    headRef,
    history,
    hasGitmodules: existsSync(path.join(resolvedRoot, ".gitmodules")),
    internalRefCount,
    localRefs,
    remotes,
    shallow,
    stash,
    statusEntryCount: statusEntries.length,
    upstream: upstreamResult.status === 0 ? upstreamResult.stdout.trim() : null,
    worktree,
  };
}

function bundleHeader(bundlePath) {
  const content = readFileSync(bundlePath);
  const boundary = content.indexOf(Buffer.from("\n\n"));
  if (boundary === -1)
    throw new Error("El bundle no contiene una cabecera completa.");
  const lines = content.subarray(0, boundary).toString("utf8").split("\n");
  if (lines[0] !== "# v2 git bundle") {
    throw new Error(
      "El bundle debe usar exactamente el formato Git bundle v2.",
    );
  }
  const refs = [];
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("@")) continue;
    if (line.startsWith("-")) {
      throw new Error(
        "El bundle contiene prerequisitos y no es una copia autónoma.",
      );
    }
    const separator = line.indexOf(" ");
    if (separator <= 0)
      throw new Error("El bundle contiene una cabecera de ref inválida.");
    const oid = line.slice(0, separator);
    const name = line.slice(separator + 1);
    if (!/^[0-9a-f]{40,64}$/.test(oid) || !name) {
      throw new Error("El bundle contiene una ref inválida.");
    }
    refs.push({ name, oid });
  }
  return refs.sort((left, right) => left.name.localeCompare(right.name));
}

function assertExpectedBundleRefs(bundlePath, expectedRefs) {
  const actual = bundleHeader(bundlePath);
  const expected = [...expectedRefs].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "Las refs del bundle no coinciden exactamente con el inventario firmado.",
    );
  }
}

function restoreCheck(bundlePath, expectedRefs, headRef) {
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), "agorbis-git-bundle-verify-"),
  );
  chmodSync(temporaryRoot, 0o700);
  const bareRoot = path.join(temporaryRoot, "recovered.git");
  try {
    runGit(temporaryRoot, ["init", "--quiet", "--bare", bareRoot]);
    runGit(bareRoot, ["bundle", "verify", bundlePath]);
    const fetchRefs = expectedRefs
      .filter(
        (entry) =>
          entry.name.startsWith("refs/heads/") ||
          entry.name.startsWith("refs/tags/"),
      )
      .map((entry) => `+${entry.name}:${entry.name}`);
    runGit(bareRoot, [
      "fetch",
      "--quiet",
      "--no-tags",
      bundlePath,
      ...fetchRefs,
    ]);
    runGit(bareRoot, ["symbolic-ref", "HEAD", headRef]);
    for (const expected of expectedRefs.filter(
      (entry) => entry.name !== "HEAD",
    )) {
      const actual = runGit(bareRoot, [
        "rev-parse",
        "--verify",
        expected.name,
      ]).stdout.trim();
      if (actual !== expected.oid) {
        throw new Error(
          `La restauración de prueba no preservó ${expected.name}.`,
        );
      }
    }
    runGit(bareRoot, ["fsck", "--full", "--strict", "--no-dangling"]);
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function safeTimestamp(sourceDateEpoch) {
  if (
    sourceDateEpoch === undefined ||
    sourceDateEpoch === null ||
    sourceDateEpoch === ""
  ) {
    return new Date().toISOString();
  }
  if (!/^\d+$/.test(String(sourceDateEpoch))) {
    throw new Error(
      "SOURCE_DATE_EPOCH debe ser una cantidad entera de segundos Unix.",
    );
  }
  const date = new Date(Number(sourceDateEpoch) * 1000);
  if (Number.isNaN(date.getTime()))
    throw new Error("SOURCE_DATE_EPOCH está fuera de rango.");
  return date.toISOString();
}

export function assertGitRecoveryAuditBundleReady(audit) {
  const failures = [];
  if (!audit.fsckValid) failures.push("git fsck no pasó");
  if (audit.shallow) failures.push("el repositorio es shallow");
  if (audit.statusEntryCount !== 0)
    failures.push("el worktree o el índice no están limpios");
  if (audit.stash)
    failures.push("existe refs/stash, que el bundle excluye deliberadamente");
  if (audit.history.findings.length)
    failures.push("el historial alcanzable contiene secretos conocidos");
  if (audit.worktree.findings.length)
    failures.push("hay secretos conocidos en archivos versionables");
  if (audit.history.lfsPointers.length)
    failures.push(
      "hay objetos Git LFS que el bundle no puede respaldar por sí solo",
    );
  if (audit.history.gitlinks.length)
    failures.push(
      "el historial contiene gitlinks de submódulos que el bundle no puede respaldar por sí solo",
    );
  if (audit.remotes.some((remote) => !remote.safe))
    failures.push("existe una URL remote insegura o con credenciales");
  if (audit.hasGitmodules)
    failures.push("hay submódulos, no soportados por este bundle");
  if (failures.length)
    throw new Error(`Bundle bloqueado: ${failures.join("; ")}.`);
}

export function createGitRecoveryBundle({
  repoRoot,
  outputDir,
  sourceDateEpoch = process.env.SOURCE_DATE_EPOCH,
}) {
  const resolvedRoot = realpathSync(repoRoot);
  if (!path.isAbsolute(outputDir))
    throw new Error("--output-dir debe ser una ruta absoluta.");
  const resolvedOutput = path.resolve(outputDir);
  if (existsSync(resolvedOutput))
    throw new Error("--output-dir debe ser una ruta nueva.");
  const parent = realpathSync(path.dirname(resolvedOutput));
  const candidate = path.join(parent, path.basename(resolvedOutput));
  if (candidate === resolvedRoot || isPathInside(resolvedRoot, candidate)) {
    throw new Error(
      "El bundle de recuperación debe vivir fuera del repositorio.",
    );
  }
  const audit = auditGitRepository(resolvedRoot);
  assertGitRecoveryAuditBundleReady(audit);
  const expectedRefs = [
    { name: "HEAD", oid: audit.headOid },
    ...audit.localRefs,
  ].sort((left, right) => left.name.localeCompare(right.name));
  mkdirSync(candidate, { mode: 0o700 });
  chmodSync(candidate, 0o700);
  const bundlePath = path.join(candidate, GIT_BUNDLE_FILENAME);
  try {
    runGit(resolvedRoot, [
      "bundle",
      "create",
      "--version=2",
      bundlePath,
      "HEAD",
      ...audit.localRefs.map((entry) => entry.name),
    ]);
    chmodSync(bundlePath, 0o600);
    assertExpectedBundleRefs(bundlePath, expectedRefs);
    restoreCheck(bundlePath, expectedRefs, audit.headRef);
    const bundleStat = statSync(bundlePath);
    const manifest = {
      application: "Agorbis",
      bundle: {
        bytes: bundleStat.size,
        formatVersion: 2,
        path: GIT_BUNDLE_FILENAME,
        sha256: sha256File(bundlePath),
      },
      checks: {
        bundleVerify: true,
        gitFsck: true,
        historyObjectCount: audit.history.objectCount,
        historyGitlinkCount: 0,
        historyLfsPointerCount: 0,
        historySecretFindingCount: 0,
        historyTextObjectCount: audit.history.textObjectCount,
        knownSecretRuleCount: KNOWN_SECRET_RULES.length,
        restoreCheck: true,
        versionableFileCount: audit.worktree.fileCount,
        worktreeSecretFindingCount: 0,
      },
      createdAt: safeTimestamp(sourceDateEpoch),
      excludedRefNamespaces: [...EXCLUDED_REF_NAMESPACES],
      formatVersion: GIT_RECOVERY_FORMAT_VERSION,
      includedRefs: expectedRefs,
      source: {
        gitVersion: runGit(resolvedRoot, ["--version"]).stdout.trim(),
        headOid: audit.headOid,
        headRef: audit.headRef,
        internalRefCountExcluded: audit.internalRefCount,
        objectFormat: runGit(resolvedRoot, [
          "rev-parse",
          "--show-object-format",
        ]).stdout.trim(),
        remoteCount: audit.remotes.length,
        shallow: false,
        upstream: audit.upstream,
        worktreeClean: true,
      },
    };
    const manifestPath = path.join(candidate, GIT_BUNDLE_MANIFEST_FILENAME);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    const checksumPath = path.join(candidate, GIT_BUNDLE_CHECKSUM_FILENAME);
    const checksumLines = [GIT_BUNDLE_FILENAME, GIT_BUNDLE_MANIFEST_FILENAME]
      .sort()
      .map((name) => `${sha256File(path.join(candidate, name))}  ${name}`);
    writeFileSync(checksumPath, `${checksumLines.join("\n")}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(manifestPath, 0o600);
    chmodSync(checksumPath, 0o600);
    return verifyGitRecoveryBundleDirectory(candidate);
  } catch (error) {
    rmSync(candidate, { force: true, recursive: true });
    throw error;
  }
}

function parseChecksumIndex(content) {
  const lines = content.split("\n");
  if (lines.at(-1) !== "")
    throw new Error("El índice SHA-256 debe terminar con newline.");
  lines.pop();
  if (lines.length !== 2)
    throw new Error(
      "El índice SHA-256 debe contener exactamente dos archivos.",
    );
  const entries = lines.map((line) => {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) throw new Error("El índice SHA-256 tiene un formato inválido.");
    return { sha256: match[1], path: match[2] };
  });
  const expected = [GIT_BUNDLE_FILENAME, GIT_BUNDLE_MANIFEST_FILENAME].sort();
  if (
    JSON.stringify(entries.map((entry) => entry.path)) !==
    JSON.stringify(expected)
  ) {
    throw new Error(
      "El índice SHA-256 enumera archivos inesperados o fuera de orden.",
    );
  }
  return entries;
}

function validateManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      "application",
      "bundle",
      "checks",
      "createdAt",
      "excludedRefNamespaces",
      "formatVersion",
      "includedRefs",
      "source",
    ],
    "manifest",
  );
  if (
    manifest.application !== "Agorbis" ||
    manifest.formatVersion !== GIT_RECOVERY_FORMAT_VERSION
  ) {
    throw new Error(
      "El manifest no pertenece al formato soportado de Agorbis.",
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(manifest.createdAt)
  ) {
    throw new Error("createdAt no es un timestamp UTC canónico.");
  }
  assertExactKeys(
    manifest.bundle,
    ["bytes", "formatVersion", "path", "sha256"],
    "manifest.bundle",
  );
  if (
    manifest.bundle.path !== GIT_BUNDLE_FILENAME ||
    manifest.bundle.formatVersion !== 2 ||
    !Number.isSafeInteger(manifest.bundle.bytes) ||
    manifest.bundle.bytes <= 0 ||
    !/^[0-9a-f]{64}$/.test(manifest.bundle.sha256)
  ) {
    throw new Error("manifest.bundle tiene valores inválidos.");
  }
  assertExactKeys(
    manifest.checks,
    [
      "bundleVerify",
      "gitFsck",
      "historyObjectCount",
      "historyGitlinkCount",
      "historyLfsPointerCount",
      "historySecretFindingCount",
      "historyTextObjectCount",
      "knownSecretRuleCount",
      "restoreCheck",
      "versionableFileCount",
      "worktreeSecretFindingCount",
    ],
    "manifest.checks",
  );
  for (const name of ["bundleVerify", "gitFsck", "restoreCheck"]) {
    if (manifest.checks[name] !== true)
      throw new Error(`manifest.checks.${name} debe ser true.`);
  }
  for (const name of [
    "historyObjectCount",
    "historyTextObjectCount",
    "knownSecretRuleCount",
    "versionableFileCount",
  ]) {
    if (
      !Number.isSafeInteger(manifest.checks[name]) ||
      manifest.checks[name] < 1
    ) {
      throw new Error(`manifest.checks.${name} debe ser un entero positivo.`);
    }
  }
  for (const name of [
    "historyGitlinkCount",
    "historyLfsPointerCount",
    "historySecretFindingCount",
    "worktreeSecretFindingCount",
  ]) {
    if (manifest.checks[name] !== 0)
      throw new Error(`manifest.checks.${name} debe ser cero.`);
  }
  if (manifest.checks.knownSecretRuleCount !== KNOWN_SECRET_RULES.length) {
    throw new Error(
      "El manifest fue creado con otro inventario de patrones secretos.",
    );
  }
  if (
    JSON.stringify(manifest.excludedRefNamespaces) !==
    JSON.stringify(EXCLUDED_REF_NAMESPACES)
  ) {
    throw new Error(
      "El manifest no declara exactamente los namespaces excluidos.",
    );
  }
  if (
    !Array.isArray(manifest.includedRefs) ||
    manifest.includedRefs.length < 2
  ) {
    throw new Error("El manifest debe incluir HEAD y al menos una rama.");
  }
  const refNames = new Set();
  for (const entry of manifest.includedRefs) {
    assertExactKeys(entry, ["name", "oid"], "manifest.includedRefs[]");
    if (
      !/^[0-9a-f]{40,64}$/.test(entry.oid) ||
      !(
        entry.name === "HEAD" ||
        entry.name.startsWith("refs/heads/") ||
        entry.name.startsWith("refs/tags/")
      ) ||
      refNames.has(entry.name)
    ) {
      throw new Error("El manifest contiene una ref inválida o duplicada.");
    }
    refNames.add(entry.name);
  }
  const sortedRefs = [...manifest.includedRefs].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (JSON.stringify(sortedRefs) !== JSON.stringify(manifest.includedRefs)) {
    throw new Error("Las refs del manifest deben estar ordenadas.");
  }
  assertExactKeys(
    manifest.source,
    [
      "gitVersion",
      "headOid",
      "headRef",
      "internalRefCountExcluded",
      "objectFormat",
      "remoteCount",
      "shallow",
      "upstream",
      "worktreeClean",
    ],
    "manifest.source",
  );
  if (
    manifest.source.worktreeClean !== true ||
    manifest.source.shallow !== false ||
    !manifest.source.headRef.startsWith("refs/heads/") ||
    !/^[0-9a-f]{40,64}$/.test(manifest.source.headOid) ||
    !["sha1", "sha256"].includes(manifest.source.objectFormat) ||
    !Number.isSafeInteger(manifest.source.remoteCount) ||
    manifest.source.remoteCount < 0 ||
    !Number.isSafeInteger(manifest.source.internalRefCountExcluded) ||
    manifest.source.internalRefCountExcluded < 0 ||
    !(
      manifest.source.upstream === null ||
      typeof manifest.source.upstream === "string"
    )
  ) {
    throw new Error("manifest.source tiene valores inválidos.");
  }
  const head = manifest.includedRefs.find((entry) => entry.name === "HEAD");
  const branch = manifest.includedRefs.find(
    (entry) => entry.name === manifest.source.headRef,
  );
  if (
    !head ||
    !branch ||
    head.oid !== manifest.source.headOid ||
    branch.oid !== manifest.source.headOid
  ) {
    throw new Error("HEAD no coincide con la rama fuente en el manifest.");
  }
}

export function verifyGitRecoveryBundleDirectory(bundleDir) {
  const resolved = realpathSync(bundleDir);
  if (!lstatSync(resolved).isDirectory())
    throw new Error("La ruta del bundle no es un directorio.");
  const expectedFiles = [
    GIT_BUNDLE_CHECKSUM_FILENAME,
    GIT_BUNDLE_FILENAME,
    GIT_BUNDLE_MANIFEST_FILENAME,
  ].sort();
  const actualFiles = readdirSync(resolved).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      "El directorio de recuperación contiene archivos faltantes o inesperados.",
    );
  }
  if ((statSync(resolved).mode & 0o077) !== 0) {
    throw new Error(
      "El directorio de recuperación debe tener permisos 0700 o más restrictivos.",
    );
  }
  for (const name of expectedFiles) {
    const target = path.join(resolved, name);
    if (!lstatSync(target).isFile() || (statSync(target).mode & 0o077) !== 0) {
      throw new Error(
        `${name} debe ser un archivo regular con permisos 0600 o más restrictivos.`,
      );
    }
  }
  const checksums = parseChecksumIndex(
    readFileSync(path.join(resolved, GIT_BUNDLE_CHECKSUM_FILENAME), "utf8"),
  );
  for (const entry of checksums) {
    if (sha256File(path.join(resolved, entry.path)) !== entry.sha256) {
      throw new Error(`SHA-256 no coincide para ${entry.path}.`);
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(path.join(resolved, GIT_BUNDLE_MANIFEST_FILENAME), "utf8"),
    );
  } catch {
    throw new Error("git-bundle-manifest.json no contiene JSON válido.");
  }
  validateManifest(manifest);
  const bundlePath = path.join(resolved, GIT_BUNDLE_FILENAME);
  const bundleStat = statSync(bundlePath);
  if (
    bundleStat.size !== manifest.bundle.bytes ||
    sha256File(bundlePath) !== manifest.bundle.sha256
  ) {
    throw new Error("El bundle no coincide con tamaño/hash del manifest.");
  }
  assertExpectedBundleRefs(bundlePath, manifest.includedRefs);
  restoreCheck(bundlePath, manifest.includedRefs, manifest.source.headRef);
  return {
    bundleBytes: bundleStat.size,
    bundleSha256: manifest.bundle.sha256,
    createdAt: manifest.createdAt,
    headOid: manifest.source.headOid,
    headRef: manifest.source.headRef,
    refCount: manifest.includedRefs.length,
  };
}
