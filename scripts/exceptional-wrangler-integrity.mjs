import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { TextDecoder } from "node:util";

export const EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION =
  "agorbis-exceptional-wrangler-integrity/v2";
export const EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION = "4.160.1";
export const EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_RELATIVE =
  "wrangler-dist/cli.js";
export const EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256 =
  "2400f3b5c672fe1f7fa11d79275746f9b311f83f6ff159e331ab8f6fb888eb5f";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SHA512_SRI_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const CANONICAL_REPOSITORY_ROOT_TOKEN = Buffer.from(
  "\0agorbis-exceptional-wrangler-repository-root/v2\0",
  "utf8",
);
const PNPM_SHIM_HEADER = "#!/bin/sh\n";
const PNPM_GENERATED_DIRECTORY_MODE = 0o755;
const MAX_LOCK_BYTES = 8 * 1_024 * 1_024;
const MAX_PACKAGE_JSON_BYTES = 2 * 1_024 * 1_024;
const MAX_PNPM_SHIM_BYTES = 64 * 1_024;
const MAX_FILE_BYTES = 256 * 1_024 * 1_024;
const MAX_CLOSURE_BYTES = 1_024 * 1_024 * 1_024;
const MAX_CLOSURE_ENTRIES = 100_000;
const MAX_CLOSURE_PACKAGES = 512;
const POLICY_KEYS = Object.freeze([
  "architecture",
  "closureHash",
  "entrypointHash",
  "entrypointRelative",
  "importerBlockHash",
  "importerResolution",
  "importerSpecifier",
  "lockHash",
  "lockRelative",
  "nodeMajor",
  "packageAliasRelative",
  "packageIntegrity",
  "packageKey",
  "packageName",
  "packageRealpathRelative",
  "platform",
  "schemaVersion",
  "snapshotBlockHash",
  "snapshotKey",
  "version",
]);

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error(
    "El filesystem no soporta O_NOFOLLOW; la integridad de Wrangler queda bloqueada.",
  );
}

const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY = deepFreeze({
  schemaVersion: EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION,
  platform: "linux",
  architecture: "x64",
  nodeMajor: 22,
  packageName: "wrangler",
  version: EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION,
  packageAliasRelative: "node_modules/wrangler",
  packageRealpathRelative:
    "node_modules/.pnpm/wrangler@4.160.1_@cloudflare+workers-types@5.20261110.1_@types+node@22.20.5/node_modules/wrangler",
  entrypointRelative: "bin/wrangler.js",
  entrypointHash:
    "d35986bcb0dc16bf6b9515fd2ba0d431b5705c80730702b764f0286a3b825414",
  lockRelative: "pnpm-lock.yaml",
  lockHash: "4b92469bd5bbe29902a1acfc1529efa1c4c676fe327e904e81c00dd7b0c7a73b",
  importerSpecifier: "4.160.1",
  importerResolution:
    "4.160.1(@cloudflare/workers-types@5.20261110.1)(@types/node@22.20.5)",
  importerBlockHash:
    "6465cdce6ee713d11b63cdd52d2f22f7fd98e26f8656877100155c3255f2ebce",
  packageKey: "wrangler@4.160.1",
  packageIntegrity:
    "sha512-gM8daj5geYTEw+038dV5OQAmrSIo/9e97FoJuNf+r9PllWR0ZnqMI2LXZZDSHpGsMez3mKKFYH5o/hBsf1ZTHg==",
  snapshotKey:
    "wrangler@4.160.1(@cloudflare/workers-types@5.20261110.1)(@types/node@22.20.5)",
  snapshotBlockHash:
    "09a4be0df213a674c6d2da0daa90fc63bb17a8d1977178388495ee20b27cf557",
  closureHash:
    "e44e24b5134db166eb7e4096a468cdbd4a9110959457a1b82f19894d9bd4ae9b",
});

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected)
  );
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareStrings)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function canonicalizePnpmShim(content, repositoryRootBytes) {
  if (content.indexOf(CANONICAL_REPOSITORY_ROOT_TOKEN) !== -1) {
    throw new Error("Un shim de pnpm contiene el token canónico reservado.");
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new Error("Un shim de pnpm no contiene UTF-8 válido.");
  }
  if (!Buffer.from(source, "utf8").equals(content)) {
    throw new Error("Un shim de pnpm no usa UTF-8 canónico.");
  }
  if (
    !source.startsWith(PNPM_SHIM_HEADER) ||
    !source.endsWith("\n") ||
    source.includes("\r") ||
    source.includes("\0")
  ) {
    throw new Error("Un shim de pnpm no usa el formato shell LF esperado.");
  }

  const chunks = [];
  let cursor = 0;
  let occurrences = 0;
  for (;;) {
    const match = content.indexOf(repositoryRootBytes, cursor);
    if (match === -1) break;
    chunks.push(
      content.subarray(cursor, match),
      CANONICAL_REPOSITORY_ROOT_TOKEN,
    );
    occurrences += 1;
    cursor = match + repositoryRootBytes.length;
  }
  if (occurrences === 0) {
    throw new Error(
      "Un shim de pnpm no referencia el repositoryRoot esperado.",
    );
  }
  chunks.push(content.subarray(cursor));
  return Buffer.concat(chunks);
}

function assertSafeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    CONTROL_OR_BIDI_PATTERN.test(value) ||
    path.posix.isAbsolute(value) ||
    value
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} no es una ruta relativa segura.`);
  }
}

function assertExpectedPolicy(policy) {
  if (!sameKeys(policy, POLICY_KEYS)) {
    throw new Error(
      "La policy de integridad de Wrangler tiene campos inválidos.",
    );
  }
  if (
    policy.schemaVersion !== EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION ||
    policy.platform !== "linux" ||
    policy.architecture !== "x64" ||
    policy.nodeMajor !== 22 ||
    policy.packageName !== "wrangler" ||
    policy.version !== EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION ||
    policy.packageKey !== `${policy.packageName}@${policy.version}` ||
    policy.importerSpecifier !== policy.version
  ) {
    throw new Error(
      "La policy de integridad de Wrangler no fija el runtime permitido.",
    );
  }
  for (const [value, label] of [
    [policy.packageAliasRelative, "packageAliasRelative"],
    [policy.packageRealpathRelative, "packageRealpathRelative"],
    [policy.entrypointRelative, "entrypointRelative"],
    [policy.lockRelative, "lockRelative"],
  ]) {
    assertSafeRelativePath(value, label);
  }
  for (const [value, label] of [
    [policy.closureHash, "closureHash"],
    [policy.entrypointHash, "entrypointHash"],
    [policy.importerBlockHash, "importerBlockHash"],
    [policy.lockHash, "lockHash"],
    [policy.snapshotBlockHash, "snapshotBlockHash"],
  ]) {
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
      throw new Error(`${label} no es un SHA-256 canónico.`);
    }
  }
  if (
    typeof policy.importerResolution !== "string" ||
    !policy.importerResolution.startsWith(`${policy.version}(`) ||
    CONTROL_OR_BIDI_PATTERN.test(policy.importerResolution) ||
    typeof policy.snapshotKey !== "string" ||
    !policy.snapshotKey.startsWith(`${policy.packageKey}(`) ||
    CONTROL_OR_BIDI_PATTERN.test(policy.snapshotKey) ||
    typeof policy.packageIntegrity !== "string" ||
    !SHA512_SRI_PATTERN.test(policy.packageIntegrity)
  ) {
    throw new Error("La policy no fija importer, snapshot y SRI válidos.");
  }
}

function selectPolicy(expectedPolicy, testOnlyExpectedPolicy) {
  if (expectedPolicy === undefined) {
    return EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY;
  }
  if (testOnlyExpectedPolicy !== true) {
    throw new Error(
      "Una expectedPolicy alternativa requiere testOnlyExpectedPolicy=true.",
    );
  }
  assertExpectedPolicy(expectedPolicy);
  return expectedPolicy;
}

function isPathInsideOrEqual(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function toPortableRelative(root, candidate, label) {
  if (!isPathInsideOrEqual(candidate, root)) {
    throw new Error(`${label} queda fuera del repositorio permitido.`);
  }
  const relative = path.relative(root, candidate).split(path.sep).join("/");
  if (relative === "") return ".";
  assertSafeRelativePath(relative, label);
  return relative;
}

function stableIdentity(stats) {
  return {
    ctimeMs: stats.ctimeMs,
    dev: stats.dev,
    gid: stats.gid,
    ino: stats.ino,
    mode: stats.mode,
    mtimeMs: stats.mtimeMs,
    nlink: stats.nlink,
    size: stats.size,
    uid: stats.uid,
  };
}

function sameStableIdentity(left, right) {
  const expected = stableIdentity(left);
  const actual = stableIdentity(right);
  return Object.keys(expected).every((key) => expected[key] === actual[key]);
}

function closeQuietly(descriptor) {
  if (descriptor === null) return;
  try {
    closeSync(descriptor);
  } catch {
    // El error original conserva prioridad.
  }
}

function readRegularFileNoFollow(filePath, maxBytes, label) {
  let descriptor = null;
  try {
    const pathStats = lstatSync(filePath);
    if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
      throw new Error(`${label} debe ser un archivo regular sin symlinks.`);
    }
    if (pathStats.size > maxBytes) {
      throw new Error(`${label} excede el límite de tamaño permitido.`);
    }
    descriptor = openSync(filePath, READ_FLAGS);
    const initialStats = fstatSync(descriptor);
    if (
      !initialStats.isFile() ||
      !sameStableIdentity(pathStats, initialStats)
    ) {
      throw new Error(`${label} cambió antes de su lectura segura.`);
    }
    const chunks = [];
    const buffer = Buffer.allocUnsafe(64 * 1_024);
    let total = 0;
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) {
        throw new Error(`${label} excede el límite de tamaño permitido.`);
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const finalStats = fstatSync(descriptor);
    if (
      !sameStableIdentity(initialStats, finalStats) ||
      total !== finalStats.size
    ) {
      throw new Error(`${label} cambió durante su lectura segura.`);
    }
    closeSync(descriptor);
    descriptor = null;
    return { content: Buffer.concat(chunks, total), stats: finalStats };
  } finally {
    closeQuietly(descriptor);
  }
}

function hashRegularFileNoFollow(filePath, expectedStats, label) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const initialStats = fstatSync(descriptor);
    if (
      !initialStats.isFile() ||
      !sameStableIdentity(expectedStats, initialStats)
    ) {
      throw new Error(`${label} cambió antes de calcular su hash.`);
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1_024);
    let total = 0;
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_FILE_BYTES) {
        throw new Error(`${label} excede el límite individual permitido.`);
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
    const finalStats = fstatSync(descriptor);
    if (
      !sameStableIdentity(initialStats, finalStats) ||
      total !== finalStats.size
    ) {
      throw new Error(`${label} cambió mientras se calculaba su hash.`);
    }
    closeSync(descriptor);
    descriptor = null;
    return hash.digest("hex");
  } finally {
    closeQuietly(descriptor);
  }
}

function parseJsonRegularFile(filePath, label) {
  const { content } = readRegularFileNoFollow(
    filePath,
    MAX_PACKAGE_JSON_BYTES,
    label,
  );
  try {
    const parsed = JSON.parse(content.toString("utf8"));
    if (!isPlainObject(parsed)) throw new Error("not-an-object");
    return parsed;
  } catch {
    throw new Error(`${label} no contiene JSON válido.`);
  }
}

function leadingSpaces(line) {
  let count = 0;
  while (line[count] === " ") count += 1;
  return count;
}

function findUniqueYamlBlock(lines, header, indent, start, end, label) {
  const expectedLine = `${" ".repeat(indent)}${header}:`;
  const matches = [];
  for (let index = start; index < end; index += 1) {
    if (lines[index] === expectedLine) matches.push(index);
  }
  if (matches.length !== 1) {
    throw new Error(
      `${label} debe existir exactamente una vez en pnpm-lock.yaml.`,
    );
  }
  const blockStart = matches[0];
  let blockEnd = blockStart + 1;
  for (; blockEnd < end; blockEnd += 1) {
    const line = lines[blockEnd];
    if (line === "") continue;
    if (leadingSpaces(line) <= indent) break;
  }
  const sourceLines = lines.slice(blockStart, blockEnd);
  while (sourceLines.at(-1) === "") sourceLines.pop();
  return {
    end: blockEnd,
    source: `${sourceLines.join("\n")}\n`,
    start: blockStart,
  };
}

function inspectLock(repositoryRoot, policy) {
  const lockPath = path.join(repositoryRoot, ...policy.lockRelative.split("/"));
  const { content, stats } = readRegularFileNoFollow(
    lockPath,
    MAX_LOCK_BYTES,
    "pnpm-lock.yaml",
  );
  if (stats.nlink !== 1) {
    throw new Error("pnpm-lock.yaml no puede ser un hardlink.");
  }
  const source = content.toString("utf8");
  if (
    source.includes("\r") ||
    source.includes("\0") ||
    source.split("\n").some((line) => line.includes("\t"))
  ) {
    throw new Error("pnpm-lock.yaml no usa el formato canónico esperado.");
  }
  const lines = source.split("\n");
  if (lines[0] !== "lockfileVersion: '9.0'") {
    throw new Error("pnpm-lock.yaml no usa lockfileVersion 9.0.");
  }

  const importers = findUniqueYamlBlock(
    lines,
    "importers",
    0,
    0,
    lines.length,
    "importers",
  );
  const rootImporter = findUniqueYamlBlock(
    lines,
    ".",
    2,
    importers.start + 1,
    importers.end,
    "importer raíz",
  );
  const devDependencies = findUniqueYamlBlock(
    lines,
    "devDependencies",
    4,
    rootImporter.start + 1,
    rootImporter.end,
    "devDependencies del importer raíz",
  );
  const wranglerImporter = findUniqueYamlBlock(
    lines,
    policy.packageName,
    6,
    devDependencies.start + 1,
    devDependencies.end,
    "Wrangler en el importer raíz",
  );
  const expectedImporterSource =
    `      ${policy.packageName}:\n` +
    `        specifier: ${policy.importerSpecifier}\n` +
    `        version: ${policy.importerResolution}\n`;
  if (wranglerImporter.source !== expectedImporterSource) {
    throw new Error(
      "El importer de Wrangler no coincide exactamente con la policy.",
    );
  }

  const packages = findUniqueYamlBlock(
    lines,
    "packages",
    0,
    0,
    lines.length,
    "packages",
  );
  const packageBlock = findUniqueYamlBlock(
    lines,
    policy.packageKey,
    2,
    packages.start + 1,
    packages.end,
    "paquete Wrangler",
  );
  const expectedResolution = `    resolution: {integrity: ${policy.packageIntegrity}}`;
  if (
    packageBlock.source
      .trimEnd()
      .split("\n")
      .filter((line) => line.startsWith("    resolution:"))
      .join("\n") !== expectedResolution
  ) {
    throw new Error(
      "El SRI de Wrangler no coincide exactamente con la policy.",
    );
  }

  const snapshots = findUniqueYamlBlock(
    lines,
    "snapshots",
    0,
    0,
    lines.length,
    "snapshots",
  );
  const snapshot = findUniqueYamlBlock(
    lines,
    policy.snapshotKey,
    2,
    snapshots.start + 1,
    snapshots.end,
    "snapshot de Wrangler",
  );

  return {
    importerBlockHash: sha256(wranglerImporter.source),
    lockHash: sha256(content),
    snapshotBlockHash: sha256(snapshot.source),
  };
}

function assertPackageDependencyMap(value, label) {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    throw new Error(`${label} debe ser un objeto plano.`);
  }
  const normalized = {};
  for (const name of Object.keys(value).sort(compareStrings)) {
    const requested = value[name];
    const segments = name.split("/");
    if (
      typeof requested !== "string" ||
      requested.length === 0 ||
      CONTROL_OR_BIDI_PATTERN.test(name) ||
      CONTROL_OR_BIDI_PATTERN.test(requested) ||
      (name.startsWith("@") ? segments.length !== 2 : segments.length !== 1) ||
      segments.some(
        (segment) =>
          segment === "" ||
          segment === "." ||
          segment === ".." ||
          segment.includes("\\"),
      )
    ) {
      throw new Error(`${label} contiene una dependencia inválida.`);
    }
    normalized[name] = requested;
  }
  return normalized;
}

function dependencyCandidatePath(searchPath, dependencyName) {
  return path.join(searchPath, ...dependencyName.split("/"));
}

function resolveDirectDependency(
  packageJsonPath,
  dependencyName,
  nodeModulesRoot,
  optional,
) {
  const resolver = createRequire(packageJsonPath);
  const searchPaths = resolver.resolve.paths(dependencyName) ?? [];
  for (const searchPath of searchPaths) {
    const candidate = dependencyCandidatePath(searchPath, dependencyName);
    let candidateStats;
    try {
      candidateStats = lstatSync(candidate);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") continue;
      throw error;
    }
    if (!candidateStats.isDirectory() && !candidateStats.isSymbolicLink()) {
      throw new Error("Una dependencia de Wrangler tiene un tipo inválido.");
    }
    const target = realpathSync(candidate);
    const targetStats = lstatSync(target);
    if (
      !targetStats.isDirectory() ||
      targetStats.isSymbolicLink() ||
      !isPathInsideOrEqual(target, nodeModulesRoot)
    ) {
      throw new Error(
        "Una dependencia de Wrangler resuelve fuera de node_modules.",
      );
    }
    const candidateKind = candidateStats.isSymbolicLink()
      ? "package-manager-symlink"
      : "directory";
    let linkText = null;
    if (candidateKind === "package-manager-symlink") {
      // pnpm necesita estos bordes; su ruta, texto y destino entran en la Merkle.
      linkText = readlinkSync(candidate);
      if (CONTROL_OR_BIDI_PATTERN.test(linkText)) {
        throw new Error(
          "Un enlace de resolución de pnpm contiene controles inválidos.",
        );
      }
    }
    return {
      candidate,
      candidateKind,
      linkText,
      target,
    };
  }
  if (optional) return null;
  throw new Error("Falta una dependencia runtime obligatoria de Wrangler.");
}

function merkleRoot(domain, records) {
  let level = records
    .map((record) => canonicalJson(record))
    .sort(compareStrings)
    .map((record) => sha256(`${domain}/leaf/v1\0${record}`));
  if (level.length === 0) return sha256(`${domain}/empty/v1`);
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(sha256(`${domain}/node/v1\0${left}\0${right}`));
    }
    level = next;
  }
  return level[0];
}

function inspectPackageClosure(repositoryRoot, policy) {
  const repositoryNodeModules = realpathSync(
    path.join(repositoryRoot, "node_modules"),
  );
  if (!isPathInsideOrEqual(repositoryNodeModules, repositoryRoot)) {
    throw new Error("node_modules resuelve fuera del repositorio.");
  }

  const aliasPath = path.join(
    repositoryRoot,
    ...policy.packageAliasRelative.split("/"),
  );
  const aliasStats = lstatSync(aliasPath);
  if (!aliasStats.isDirectory() && !aliasStats.isSymbolicLink()) {
    throw new Error("El alias instalado de Wrangler tiene un tipo inválido.");
  }
  const packageRoot = realpathSync(aliasPath);
  const expectedPackageRoot = path.join(
    repositoryRoot,
    ...policy.packageRealpathRelative.split("/"),
  );
  if (packageRoot !== expectedPackageRoot) {
    throw new Error(
      "El realpath instalado de Wrangler no coincide con la policy.",
    );
  }
  const packageRootStats = lstatSync(packageRoot);
  if (!packageRootStats.isDirectory() || packageRootStats.isSymbolicLink()) {
    throw new Error("El realpath de Wrangler no es un directorio regular.");
  }

  let aliasLinkText = null;
  if (aliasStats.isSymbolicLink()) {
    aliasLinkText = readlinkSync(aliasPath);
    if (CONTROL_OR_BIDI_PATTERN.test(aliasLinkText)) {
      throw new Error("El alias de Wrangler contiene controles inválidos.");
    }
  }

  const packageQueue = [packageRoot];
  const packagesByRoot = new Map();
  while (packageQueue.length > 0) {
    const currentRoot = packageQueue.shift();
    if (packagesByRoot.has(currentRoot)) continue;
    if (packagesByRoot.size >= MAX_CLOSURE_PACKAGES) {
      throw new Error(
        "La closure runtime de Wrangler excede el límite de paquetes.",
      );
    }
    if (!isPathInsideOrEqual(currentRoot, repositoryNodeModules)) {
      throw new Error(
        "Un paquete runtime de Wrangler queda fuera de node_modules.",
      );
    }
    const packageJsonPath = path.join(currentRoot, "package.json");
    const packageJson = parseJsonRegularFile(
      packageJsonPath,
      "package.json de la closure de Wrangler",
    );
    if (
      typeof packageJson.name !== "string" ||
      packageJson.name.length === 0 ||
      CONTROL_OR_BIDI_PATTERN.test(packageJson.name) ||
      typeof packageJson.version !== "string" ||
      packageJson.version.length === 0 ||
      CONTROL_OR_BIDI_PATTERN.test(packageJson.version)
    ) {
      throw new Error(
        "Un package.json de la closure no fija nombre y versión válidos.",
      );
    }
    if (
      currentRoot === packageRoot &&
      (packageJson.name !== policy.packageName ||
        packageJson.version !== policy.version ||
        !isPlainObject(packageJson.bin) ||
        packageJson.bin.wrangler !== `./${policy.entrypointRelative}`)
    ) {
      throw new Error(
        "El paquete o entrypoint instalado de Wrangler no coincide.",
      );
    }

    const dependencies = assertPackageDependencyMap(
      packageJson.dependencies,
      "dependencies",
    );
    const optionalDependencies = assertPackageDependencyMap(
      packageJson.optionalDependencies,
      "optionalDependencies",
    );
    const dependencyNames = [
      ...new Set([
        ...Object.keys(dependencies),
        ...Object.keys(optionalDependencies),
      ]),
    ].sort(compareStrings);
    const edges = [];
    for (const dependencyName of dependencyNames) {
      const optional = Object.hasOwn(optionalDependencies, dependencyName);
      const requested = optional
        ? optionalDependencies[dependencyName]
        : dependencies[dependencyName];
      const resolution = resolveDirectDependency(
        packageJsonPath,
        dependencyName,
        repositoryNodeModules,
        optional,
      );
      if (resolution === null) {
        edges.push({
          kind: "optional-unresolved",
          name: dependencyName,
          requested,
          target: null,
        });
        continue;
      }
      packageQueue.push(resolution.target);
      edges.push({
        candidate: toPortableRelative(
          repositoryRoot,
          resolution.candidate,
          "ruta de resolución runtime",
        ),
        kind: optional ? "optional-resolved" : "dependency",
        linkKind: resolution.candidateKind,
        linkText: resolution.linkText,
        name: dependencyName,
        requested,
        target: toPortableRelative(
          repositoryRoot,
          resolution.target,
          "destino de dependencia runtime",
        ),
      });
    }
    packagesByRoot.set(currentRoot, {
      edges,
      locator: toPortableRelative(
        repositoryRoot,
        currentRoot,
        "paquete runtime",
      ),
      name: packageJson.name,
      version: packageJson.version,
    });
  }

  let closureBytes = 0;
  let closureEntries = 0;
  const fileHashCache = new Map();
  const inodeMembers = new Map();
  const packageRecords = [];
  const repositoryRootBytes = Buffer.from(repositoryRoot, "utf8");
  let entrypointHash = null;

  function countClosureEntry() {
    closureEntries += 1;
    if (closureEntries > MAX_CLOSURE_ENTRIES) {
      throw new Error(
        "La closure runtime de Wrangler excede el límite de entradas.",
      );
    }
  }

  function scanPnpmBinDirectory(
    packageInfo,
    directory,
    segments,
    records,
    expectedStats,
  ) {
    const initialDirectoryStats = lstatSync(directory);
    if (
      !initialDirectoryStats.isDirectory() ||
      initialDirectoryStats.isSymbolicLink() ||
      (initialDirectoryStats.mode & 0o7777) !== PNPM_GENERATED_DIRECTORY_MODE ||
      !sameStableIdentity(expectedStats, initialDirectoryStats)
    ) {
      throw new Error(
        ".bin generado por pnpm debe ser un directorio regular 0755.",
      );
    }
    records.push({
      mode: PNPM_GENERATED_DIRECTORY_MODE,
      path: segments.join("/"),
      type: "directory",
    });
    countClosureEntry();

    const names = readdirSync(directory).sort(compareStrings);
    for (const name of names) {
      if (
        name === "" ||
        name === "." ||
        name === ".." ||
        name.includes("/") ||
        CONTROL_OR_BIDI_PATTERN.test(name)
      ) {
        throw new Error(".bin de pnpm contiene un nombre inválido.");
      }
      const childSegments = [...segments, name];
      const childRelative = childSegments.join("/");
      const childPath = path.join(directory, name);
      const childStats = lstatSync(childPath);
      if (
        !childStats.isFile() ||
        childStats.isSymbolicLink() ||
        (childStats.mode & 0o7777) !== PNPM_GENERATED_DIRECTORY_MODE
      ) {
        throw new Error(
          ".bin de pnpm sólo puede contener shims regulares 0755.",
        );
      }
      const { content, stats } = readRegularFileNoFollow(
        childPath,
        MAX_PNPM_SHIM_BYTES,
        "shim de pnpm",
      );
      if (!sameStableIdentity(childStats, stats)) {
        throw new Error("Un shim de pnpm cambió durante el inventario.");
      }
      const canonicalContent = canonicalizePnpmShim(
        content,
        repositoryRootBytes,
      );
      closureBytes += canonicalContent.length;
      countClosureEntry();
      if (closureBytes > MAX_CLOSURE_BYTES) {
        throw new Error("La closure runtime de Wrangler excede sus límites.");
      }

      const inodeKey = `${stats.dev}:${stats.ino}`;
      const rawHash = sha256(content);
      const cached = fileHashCache.get(inodeKey);
      if (
        cached &&
        (!sameStableIdentity(cached.stats, stats) || cached.hash !== rawHash)
      ) {
        throw new Error("Un hardlink de .bin cambió de contenido o metadata.");
      }
      if (!cached) fileHashCache.set(inodeKey, { hash: rawHash, stats });
      const member = `${packageInfo.locator}/${childRelative}`;
      const members = inodeMembers.get(inodeKey) ?? [];
      members.push(member);
      inodeMembers.set(inodeKey, members);
      records.push({
        mode: PNPM_GENERATED_DIRECTORY_MODE,
        path: childRelative,
        sha256: sha256(canonicalContent),
        size: canonicalContent.length,
        type: "file",
      });
    }

    const finalDirectoryStats = lstatSync(directory);
    if (!sameStableIdentity(initialDirectoryStats, finalDirectoryStats)) {
      throw new Error(".bin generado por pnpm cambió durante el inventario.");
    }
  }

  function scanPackageTree(packageInfo, directory, segments, records) {
    const initialDirectoryStats = lstatSync(directory);
    if (
      !initialDirectoryStats.isDirectory() ||
      initialDirectoryStats.isSymbolicLink()
    ) {
      throw new Error(
        "La closure de Wrangler contiene un directorio inválido.",
      );
    }
    const packageRootDirectory = segments.length === 0;
    const normalizedPackageNodeModules =
      segments.length === 1 && segments[0] === "node_modules";
    if (
      normalizedPackageNodeModules &&
      (initialDirectoryStats.mode & 0o7777) !== PNPM_GENERATED_DIRECTORY_MODE
    ) {
      throw new Error(
        "node_modules interno de pnpm debe ser un directorio regular 0755.",
      );
    }
    if (packageRootDirectory) {
      records.push({
        mode: initialDirectoryStats.mode & 0o7777,
        path: ".",
        type: "directory",
      });
      countClosureEntry();
      // La presencia física de este contenedor depende de si pnpm tuvo que
      // materializar shims. El record virtual es idéntico con o sin él; todo
      // hijo real se sigue recorriendo y sellando por separado.
      records.push({
        mode: PNPM_GENERATED_DIRECTORY_MODE,
        path: "node_modules",
        type: "pnpm-generated-directory",
      });
      countClosureEntry();
    } else if (!normalizedPackageNodeModules) {
      records.push({
        mode: initialDirectoryStats.mode & 0o7777,
        path: segments.join("/"),
        type: "directory",
      });
      countClosureEntry();
    }
    const names = readdirSync(directory).sort(compareStrings);
    for (const name of names) {
      if (
        name === "" ||
        name === "." ||
        name === ".." ||
        name.includes("/") ||
        CONTROL_OR_BIDI_PATTERN.test(name)
      ) {
        throw new Error(
          "La closure de Wrangler contiene un nombre de archivo inválido.",
        );
      }
      const childSegments = [...segments, name];
      const childRelative = childSegments.join("/");
      const childPath = path.join(directory, name);
      const childStats = lstatSync(childPath);
      if (normalizedPackageNodeModules && name === ".bin") {
        scanPnpmBinDirectory(
          packageInfo,
          childPath,
          childSegments,
          records,
          childStats,
        );
        continue;
      }
      if (
        packageRootDirectory &&
        name === "node_modules" &&
        (!childStats.isDirectory() ||
          childStats.isSymbolicLink() ||
          (childStats.mode & 0o7777) !== PNPM_GENERATED_DIRECTORY_MODE)
      ) {
        throw new Error(
          "node_modules interno de pnpm debe ser un directorio regular 0755.",
        );
      }
      if (childStats.isSymbolicLink()) {
        throw new Error(
          "La closure de Wrangler contiene un symlink no permitido.",
        );
      }
      if (childStats.isDirectory()) {
        scanPackageTree(packageInfo, childPath, childSegments, records);
        continue;
      }
      if (!childStats.isFile()) {
        throw new Error(
          "La closure de Wrangler contiene un tipo de archivo no permitido.",
        );
      }
      if ((childStats.mode & 0o7000) !== 0) {
        throw new Error(
          "La closure de Wrangler contiene permisos especiales no permitidos.",
        );
      }
      if (childStats.size > MAX_FILE_BYTES) {
        throw new Error(
          "La closure de Wrangler contiene un archivo demasiado grande.",
        );
      }
      closureBytes += childStats.size;
      closureEntries += 1;
      if (
        closureBytes > MAX_CLOSURE_BYTES ||
        closureEntries > MAX_CLOSURE_ENTRIES
      ) {
        throw new Error("La closure runtime de Wrangler excede sus límites.");
      }
      const inodeKey = `${childStats.dev}:${childStats.ino}`;
      const cached = fileHashCache.get(inodeKey);
      let contentHash;
      if (cached) {
        if (!sameStableIdentity(cached.stats, childStats)) {
          throw new Error("Un hardlink de la closure cambió de metadata.");
        }
        contentHash = cached.hash;
      } else {
        contentHash = hashRegularFileNoFollow(
          childPath,
          childStats,
          "archivo de la closure de Wrangler",
        );
        fileHashCache.set(inodeKey, { hash: contentHash, stats: childStats });
      }
      const member = `${packageInfo.locator}/${childRelative}`;
      const members = inodeMembers.get(inodeKey) ?? [];
      members.push(member);
      inodeMembers.set(inodeKey, members);
      records.push({
        mode: childStats.mode & 0o7777,
        path: childRelative,
        sha256: contentHash,
        size: childStats.size,
        type: "file",
      });
      if (
        packageInfo.locator ===
          toPortableRelative(repositoryRoot, packageRoot, "Wrangler") &&
        childRelative === policy.entrypointRelative
      ) {
        entrypointHash = contentHash;
      }
    }
    const finalDirectoryStats = lstatSync(directory);
    if (!sameStableIdentity(initialDirectoryStats, finalDirectoryStats)) {
      throw new Error(
        "Un directorio de la closure cambió durante el inventario.",
      );
    }
  }

  for (const packageInfo of [...packagesByRoot.values()].sort((left, right) =>
    compareStrings(left.locator, right.locator),
  )) {
    const records = [];
    const currentRoot = path.join(
      repositoryRoot,
      ...packageInfo.locator.split("/"),
    );
    scanPackageTree(packageInfo, currentRoot, [], records);
    packageRecords.push({
      dependenciesMerkle: merkleRoot(
        `${EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION}/dependencies`,
        packageInfo.edges,
      ),
      locator: packageInfo.locator,
      name: packageInfo.name,
      treeMerkle: merkleRoot(
        `${EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION}/tree`,
        records,
      ),
      version: packageInfo.version,
    });
  }

  if (entrypointHash === null) {
    throw new Error(
      "El entrypoint de Wrangler no forma parte de la closure inventariada.",
    );
  }
  const entrypointPath = path.join(
    packageRoot,
    ...policy.entrypointRelative.split("/"),
  );
  const entrypointRealpath = realpathSync(entrypointPath);
  if (entrypointRealpath !== entrypointPath) {
    throw new Error("El entrypoint de Wrangler no puede ser un symlink.");
  }

  const hardlinkGroups = [...inodeMembers.values()]
    .filter((members) => members.length > 1)
    .map((members) => ({ members: [...members].sort(compareStrings) }));
  // El store de pnpm puede cambiar st_nlink por consumidores externos. Sólo la
  // topología de alias dentro de la closure es estable y queda fijada aquí.
  const packageMerkle = merkleRoot(
    `${EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION}/packages`,
    packageRecords,
  );
  const hardlinkMerkle = merkleRoot(
    `${EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION}/hardlinks`,
    hardlinkGroups,
  );
  const rootLocator = toPortableRelative(
    repositoryRoot,
    packageRoot,
    "realpath de Wrangler",
  );
  const closureHash = sha256(
    canonicalJson({
      alias: {
        kind: aliasStats.isSymbolicLink()
          ? "package-manager-symlink"
          : "directory",
        linkText: aliasLinkText,
        path: policy.packageAliasRelative,
        target: rootLocator,
      },
      architecture: policy.architecture,
      hardlinkMerkle,
      packageMerkle,
      platform: policy.platform,
      root: rootLocator,
      schemaVersion: policy.schemaVersion,
    }),
  );

  return { closureHash, entrypointHash, entrypointRealpath };
}

function inspectExceptionalWranglerIntegrity({
  repositoryRoot = process.cwd(),
  expectedPolicy,
  testOnlyExpectedPolicy = false,
} = {}) {
  const policy = selectPolicy(expectedPolicy, testOnlyExpectedPolicy);
  assertExpectedPolicy(policy);
  if (
    process.platform !== policy.platform ||
    process.arch !== policy.architecture ||
    Number.parseInt(process.versions.node.split(".")[0], 10) !==
      policy.nodeMajor
  ) {
    throw new Error("Wrangler excepcional requiere Linux x64 y Node 22.");
  }
  const canonicalRepositoryRoot = realpathSync(repositoryRoot);
  const repositoryStats = lstatSync(canonicalRepositoryRoot);
  if (!repositoryStats.isDirectory() || repositoryStats.isSymbolicLink()) {
    throw new Error("El repositorio no resuelve a un directorio regular.");
  }
  const lock = inspectLock(canonicalRepositoryRoot, policy);
  const closure = inspectPackageClosure(canonicalRepositoryRoot, policy);
  const executionRelative = testOnlyExpectedPolicy
    ? policy.entrypointRelative
    : EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_RELATIVE;
  const executionEntrypointRealpath = realpathSync(
    path.join(
      canonicalRepositoryRoot,
      ...policy.packageRealpathRelative.split("/"),
      ...executionRelative.split("/"),
    ),
  );
  const executionStats = lstatSync(executionEntrypointRealpath);
  const executionEntrypointHash = hashRegularFileNoFollow(
    executionEntrypointRealpath,
    executionStats,
    "entrypoint de ejecución de Wrangler",
  );
  return {
    lockDetails: lock,
    metadata: deepFreeze({
      closureHash: closure.closureHash,
      entrypointHash: closure.entrypointHash,
      entrypointRealpath: closure.entrypointRealpath,
      executionEntrypointHash,
      executionEntrypointRealpath,
      lockHash: lock.lockHash,
      version: policy.version,
    }),
  };
}

export function readExceptionalWranglerIntegrity(options = {}) {
  return inspectExceptionalWranglerIntegrity(options).metadata;
}

export function verifyExceptionalWranglerIntegrity(options = {}) {
  const policy = selectPolicy(
    options.expectedPolicy,
    options.testOnlyExpectedPolicy ?? false,
  );
  const inspected = inspectExceptionalWranglerIntegrity(options);
  const executionExpectedHash = options.testOnlyExpectedPolicy
    ? policy.entrypointHash
    : EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256;
  const comparisons = [
    [inspected.metadata.lockHash, policy.lockHash, "hash de pnpm-lock.yaml"],
    [
      inspected.lockDetails.importerBlockHash,
      policy.importerBlockHash,
      "importer de Wrangler",
    ],
    [
      inspected.lockDetails.snapshotBlockHash,
      policy.snapshotBlockHash,
      "snapshot de Wrangler",
    ],
    [
      inspected.metadata.entrypointHash,
      policy.entrypointHash,
      "entrypoint de Wrangler",
    ],
    [
      inspected.metadata.closureHash,
      policy.closureHash,
      "closure runtime de Wrangler",
    ],
    [
      inspected.metadata.executionEntrypointHash,
      executionExpectedHash,
      "entrypoint de ejecución de Wrangler",
    ],
  ];
  for (const [actual, expected, label] of comparisons) {
    if (actual !== expected) {
      throw new Error(`No coincide ${label} con la policy versionada.`);
    }
  }
  return inspected.metadata;
}

export const readAndVerifyExceptionalWranglerIntegrity =
  verifyExceptionalWranglerIntegrity;
