#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION,
  EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION,
  readExceptionalWranglerIntegrity,
  verifyExceptionalWranglerIntegrity,
} from "./exceptional-wrangler-integrity.mjs";

assert.equal(process.platform, "linux", "Este test requiere Linux.");
assert.equal(process.arch, "x64", "Este test requiere x64.");
assert.equal(
  Number.parseInt(process.versions.node.split(".")[0], 10),
  22,
  "Este test requiere Node 22.",
);

const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-wrangler-integrity-test-"),
);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const IMPORTER_RESOLUTION = `${EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION}(fixture-peer@1.0.0)`;
const SNAPSHOT_KEY = `wrangler@${EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION}(fixture-peer@1.0.0)`;
const PACKAGE_INTEGRITY = "sha512-Zml4dHVyZS13cmFuZ2xlcg==";
const WRANGLER_VIRTUAL_DIRECTORY = "wrangler@4.160.1_fixture-peer@1.0.0";
const PACKAGE_REALPATH_RELATIVE =
  `node_modules/.pnpm/${WRANGLER_VIRTUAL_DIRECTORY}/` + "node_modules/wrangler";
let fixtureCounter = 0;
const CANONICAL_REPOSITORY_ROOT_TOKEN = Buffer.from(
  "\0agorbis-exceptional-wrangler-repository-root/v2\0",
  "utf8",
);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function writeFile(filePath, content, mode = 0o644) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { mode });
  chmodSync(filePath, mode);
}

function createPnpmBinDirectory(packageDirectory) {
  const nodeModulesDirectory = path.join(packageDirectory, "node_modules");
  const binDirectory = path.join(nodeModulesDirectory, ".bin");
  mkdirSync(binDirectory, { recursive: true, mode: 0o755 });
  chmodSync(nodeModulesDirectory, 0o755);
  chmodSync(binDirectory, 0o755);
  return binDirectory;
}

function writePnpmShim(packageDirectory, name, content, mode = 0o755) {
  const binDirectory = createPnpmBinDirectory(packageDirectory);
  writeFile(path.join(binDirectory, name), content, mode);
}

function repinFixture(fixture) {
  const observed = readExceptionalWranglerIntegrity({
    repositoryRoot: fixture.repositoryRoot,
    expectedPolicy: fixture.expectedPolicy,
    testOnlyExpectedPolicy: true,
  });
  fixture.expectedPolicy = {
    ...fixture.expectedPolicy,
    closureHash: observed.closureHash,
    entrypointHash: observed.entrypointHash,
    lockHash: observed.lockHash,
  };
  return observed;
}

function packageRoot(repositoryRoot, virtualDirectory, packageName) {
  return path.join(
    repositoryRoot,
    "node_modules/.pnpm",
    virtualDirectory,
    "node_modules",
    ...packageName.split("/"),
  );
}

function writePackage(root, manifest, files) {
  writeFile(path.join(root, "package.json"), `${JSON.stringify(manifest)}\n`);
  for (const [relative, content] of Object.entries(files)) {
    writeFile(path.join(root, ...relative.split("/")), content);
  }
}

function linkVirtualDependency(
  repositoryRoot,
  fromVirtualDirectory,
  dependencyName,
  toVirtualDirectory,
) {
  const fromNodeModules = path.join(
    repositoryRoot,
    "node_modules/.pnpm",
    fromVirtualDirectory,
    "node_modules",
  );
  const linkPath = path.join(fromNodeModules, ...dependencyName.split("/"));
  mkdirSync(path.dirname(linkPath), { recursive: true });
  const levels = dependencyName.startsWith("@") ? "../../../" : "../../";
  const target =
    `${levels}${toVirtualDirectory}/node_modules/` + dependencyName;
  symlinkSync(target, linkPath);
}

function fixtureLockSource() {
  return (
    "lockfileVersion: '9.0'\n" +
    "\n" +
    "importers:\n" +
    "\n" +
    "  .:\n" +
    "    devDependencies:\n" +
    "      wrangler:\n" +
    `        specifier: ${EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION}\n` +
    `        version: ${IMPORTER_RESOLUTION}\n` +
    "\n" +
    "packages:\n" +
    "\n" +
    `  wrangler@${EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION}:\n` +
    `    resolution: {integrity: ${PACKAGE_INTEGRITY}}\n` +
    "\n" +
    "snapshots:\n" +
    "\n" +
    `  ${SNAPSHOT_KEY}:\n` +
    "    dependencies:\n" +
    "      tiny-dep: 1.0.0\n" +
    "    optionalDependencies:\n" +
    "      missing-optional: 1.0.0\n" +
    "      tiny-optional: 1.0.0\n"
  );
}

function importerBlockSource() {
  return (
    "      wrangler:\n" +
    `        specifier: ${EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION}\n` +
    `        version: ${IMPORTER_RESOLUTION}\n`
  );
}

function snapshotBlockSource() {
  return (
    `  ${SNAPSHOT_KEY}:\n` +
    "    dependencies:\n" +
    "      tiny-dep: 1.0.0\n" +
    "    optionalDependencies:\n" +
    "      missing-optional: 1.0.0\n" +
    "      tiny-optional: 1.0.0\n"
  );
}

function createFixture(label) {
  fixtureCounter += 1;
  const repositoryRoot = path.join(
    temporaryRoot,
    `${String(fixtureCounter).padStart(2, "0")}-${label}`,
  );
  mkdirSync(path.join(repositoryRoot, "node_modules/.pnpm"), {
    recursive: true,
  });

  const wranglerRoot = packageRoot(
    repositoryRoot,
    WRANGLER_VIRTUAL_DIRECTORY,
    "wrangler",
  );
  const dependencyRoot = packageRoot(
    repositoryRoot,
    "tiny-dep@1.0.0",
    "tiny-dep",
  );
  const leafRoot = packageRoot(repositoryRoot, "tiny-leaf@1.0.0", "tiny-leaf");
  const optionalRoot = packageRoot(
    repositoryRoot,
    "tiny-optional@1.0.0",
    "tiny-optional",
  );

  writePackage(
    wranglerRoot,
    {
      name: "wrangler",
      version: EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION,
      bin: { wrangler: "./bin/wrangler.js" },
      dependencies: { "tiny-dep": "1.0.0" },
      optionalDependencies: {
        "missing-optional": "1.0.0",
        "tiny-optional": "1.0.0",
      },
    },
    {
      "bin/wrangler.js": "#!/usr/bin/env node\nconsole.log('fixture');\n",
      "lib/runtime.js": "export const runtime = true;\n",
    },
  );
  writePackage(
    dependencyRoot,
    {
      name: "tiny-dep",
      version: "1.0.0",
      dependencies: { "tiny-leaf": "1.0.0" },
    },
    {
      "copy.js": "export const value = 1;\n",
      "index.js": "export const value = 1;\n",
    },
  );
  writePackage(
    leafRoot,
    { name: "tiny-leaf", version: "1.0.0" },
    { "index.js": "export const leaf = true;\n" },
  );
  writePackage(
    optionalRoot,
    { name: "tiny-optional", version: "1.0.0" },
    { "index.js": "export const optional = true;\n" },
  );

  linkVirtualDependency(
    repositoryRoot,
    WRANGLER_VIRTUAL_DIRECTORY,
    "tiny-dep",
    "tiny-dep@1.0.0",
  );
  linkVirtualDependency(
    repositoryRoot,
    WRANGLER_VIRTUAL_DIRECTORY,
    "tiny-optional",
    "tiny-optional@1.0.0",
  );
  linkVirtualDependency(
    repositoryRoot,
    "tiny-dep@1.0.0",
    "tiny-leaf",
    "tiny-leaf@1.0.0",
  );
  symlinkSync(
    `.pnpm/${WRANGLER_VIRTUAL_DIRECTORY}/node_modules/wrangler`,
    path.join(repositoryRoot, "node_modules/wrangler"),
  );

  const lockPath = path.join(repositoryRoot, "pnpm-lock.yaml");
  writeFile(lockPath, fixtureLockSource());
  const basePolicy = {
    schemaVersion: EXCEPTIONAL_WRANGLER_INTEGRITY_SCHEMA_VERSION,
    platform: "linux",
    architecture: "x64",
    nodeMajor: 22,
    packageName: "wrangler",
    version: EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION,
    packageAliasRelative: "node_modules/wrangler",
    packageRealpathRelative: PACKAGE_REALPATH_RELATIVE,
    entrypointRelative: "bin/wrangler.js",
    entrypointHash: "0".repeat(64),
    lockRelative: "pnpm-lock.yaml",
    lockHash: "0".repeat(64),
    importerSpecifier: EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION,
    importerResolution: IMPORTER_RESOLUTION,
    importerBlockHash: sha256(importerBlockSource()),
    packageKey: `wrangler@${EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION}`,
    packageIntegrity: PACKAGE_INTEGRITY,
    snapshotKey: SNAPSHOT_KEY,
    snapshotBlockHash: sha256(snapshotBlockSource()),
    closureHash: "0".repeat(64),
  };
  const observed = readExceptionalWranglerIntegrity({
    repositoryRoot,
    expectedPolicy: basePolicy,
    testOnlyExpectedPolicy: true,
  });
  const expectedPolicy = {
    ...basePolicy,
    closureHash: observed.closureHash,
    entrypointHash: observed.entrypointHash,
    lockHash: observed.lockHash,
  };
  return {
    dependencyRoot,
    expectedPolicy,
    leafRoot,
    lockPath,
    optionalRoot,
    repositoryRoot,
    wranglerRoot,
  };
}

function verify(fixture, policy = fixture.expectedPolicy) {
  return verifyExceptionalWranglerIntegrity({
    repositoryRoot: fixture.repositoryRoot,
    expectedPolicy: policy,
    testOnlyExpectedPolicy: true,
  });
}

function expectFailure(fixture, expected, policy = fixture.expectedPolicy) {
  assert.throws(() => verify(fixture, policy), expected);
}

try {
  {
    const fixture = createFixture("happy-path");
    const result = verify(fixture);
    assert.deepEqual(Object.keys(result).sort(), [
      "closureHash",
      "entrypointHash",
      "entrypointRealpath",
      "executionEntrypointHash",
      "executionEntrypointRealpath",
      "lockHash",
      "version",
    ]);
    assert.equal(result.version, EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION);
    assert.equal(result.lockHash, fixture.expectedPolicy.lockHash);
    assert.equal(result.closureHash, fixture.expectedPolicy.closureHash);
    assert.equal(result.entrypointHash, fixture.expectedPolicy.entrypointHash);
    assert.equal(
      result.entrypointRealpath,
      path.join(fixture.wranglerRoot, "bin/wrangler.js"),
    );
    assert.equal(result.executionEntrypointHash, result.entrypointHash);
    assert.equal(result.executionEntrypointRealpath, result.entrypointRealpath);
    assert.ok(Object.isFrozen(result));
    assert.throws(
      () =>
        verifyExceptionalWranglerIntegrity({
          repositoryRoot: fixture.repositoryRoot,
          expectedPolicy: fixture.expectedPolicy,
        }),
      /testOnlyExpectedPolicy=true/,
    );
  }

  {
    const fixture = createFixture("entrypoint-tamper");
    writeFile(
      path.join(fixture.wranglerRoot, "bin/wrangler.js"),
      "#!/usr/bin/env node\nconsole.log('tampered');\n",
    );
    expectFailure(fixture, /entrypoint de Wrangler/);
  }

  {
    const fixture = createFixture("dependency-tamper");
    writeFile(
      path.join(fixture.dependencyRoot, "index.js"),
      "export const value = 2;\n",
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("optional-dependency-tamper");
    writeFile(
      path.join(fixture.optionalRoot, "index.js"),
      "export const optional = false;\n",
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("optional-dependency-appears");
    const missingOptionalRoot = packageRoot(
      fixture.repositoryRoot,
      "missing-optional@1.0.0",
      "missing-optional",
    );
    writePackage(
      missingOptionalRoot,
      { name: "missing-optional", version: "1.0.0" },
      { "index.js": "export const appeared = true;\n" },
    );
    linkVirtualDependency(
      fixture.repositoryRoot,
      WRANGLER_VIRTUAL_DIRECTORY,
      "missing-optional",
      "missing-optional@1.0.0",
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("lock-tamper");
    writeFile(fixture.lockPath, `${fixtureLockSource()}# extra\n`);
    expectFailure(fixture, /hash de pnpm-lock\.yaml/);
  }

  {
    const fixture = createFixture("importer-tamper");
    const changed = fixtureLockSource().replace(
      `        version: ${IMPORTER_RESOLUTION}`,
      "        version: 4.160.1(other-peer@1.0.0)",
    );
    writeFile(fixture.lockPath, changed);
    expectFailure(fixture, /importer de Wrangler/, {
      ...fixture.expectedPolicy,
      lockHash: sha256(changed),
    });
  }

  {
    const fixture = createFixture("sri-tamper");
    const changed = fixtureLockSource().replace(
      PACKAGE_INTEGRITY,
      "sha512-dGFtcGVyZWQ=",
    );
    writeFile(fixture.lockPath, changed);
    expectFailure(fixture, /SRI de Wrangler/, {
      ...fixture.expectedPolicy,
      lockHash: sha256(changed),
    });
  }

  {
    const fixture = createFixture("snapshot-tamper");
    const changed = fixtureLockSource().replace(
      "      tiny-optional: 1.0.0\n",
      "      tiny-optional: 1.0.0\n      unapproved-extra: 1.0.0\n",
    );
    writeFile(fixture.lockPath, changed);
    expectFailure(fixture, /snapshot de Wrangler/, {
      ...fixture.expectedPolicy,
      lockHash: sha256(changed),
    });
  }

  {
    const fixture = createFixture("symlink-content");
    const indexPath = path.join(fixture.dependencyRoot, "index.js");
    unlinkSync(indexPath);
    symlinkSync("copy.js", indexPath);
    expectFailure(fixture, /symlink no permitido/);
  }

  {
    const fixture = createFixture("extra-file");
    writeFile(
      path.join(fixture.dependencyRoot, "extra.js"),
      "export const extra = true;\n",
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("hostile-store-group-writable-file");
    chmodSync(path.join(fixture.dependencyRoot, "index.js"), 0o664);
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("hostile-store-group-writable-directory");
    chmodSync(fixture.dependencyRoot, 0o755);
    repinFixture(fixture);
    chmodSync(fixture.dependencyRoot, 0o775);
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const first = createFixture("pnpm-bin-first-root");
    const second = createFixture("pnpm-bin-second-root");
    writePnpmShim(
      first.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${first.repositoryRoot}/tiny-dep.js "$@"\n`,
    );
    writePnpmShim(
      second.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${second.repositoryRoot}/tiny-dep.js "$@"\n`,
    );
    const firstObserved = repinFixture(first);
    const secondObserved = repinFixture(second);
    assert.equal(verify(first).closureHash, firstObserved.closureHash);
    assert.equal(verify(second).closureHash, secondObserved.closureHash);
    assert.equal(
      first.expectedPolicy.closureHash,
      second.expectedPolicy.closureHash,
    );
  }

  {
    const fixture = createFixture("pnpm-bin-target-tamper");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${fixture.repositoryRoot}/tiny-dep.js "$@"\n`,
    );
    repinFixture(fixture);
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${fixture.repositoryRoot}/different.js "$@"\n`,
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("pnpm-bin-extra");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${fixture.repositoryRoot}/tiny-dep.js "$@"\n`,
    );
    repinFixture(fixture);
    writePnpmShim(
      fixture.dependencyRoot,
      "unexpected",
      `#!/bin/sh\nexec node ${fixture.repositoryRoot}/unexpected.js "$@"\n`,
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("pnpm-bin-missing");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${fixture.repositoryRoot}/tiny-dep.js "$@"\n`,
    );
    repinFixture(fixture);
    unlinkSync(path.join(fixture.dependencyRoot, "node_modules/.bin/tiny-dep"));
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("pnpm-bin-reserved-token");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      Buffer.concat([
        Buffer.from(`#!/bin/sh\n# ${fixture.repositoryRoot}\n`, "utf8"),
        CANONICAL_REPOSITORY_ROOT_TOKEN,
        Buffer.from("\n", "utf8"),
      ]),
    );
    expectFailure(fixture, /token canónico reservado/);
  }

  {
    const fixture = createFixture("pnpm-bin-crlf");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\r\nexec node ${fixture.repositoryRoot}/tiny-dep.js "$@"\r\n`,
    );
    expectFailure(fixture, /formato shell LF esperado/);
  }

  {
    const fixture = createFixture("pnpm-bin-non-utf8");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      Buffer.concat([
        Buffer.from(
          `#!/bin/sh\nexec node ${fixture.repositoryRoot}/tiny-dep.js `,
          "utf8",
        ),
        Buffer.from([0xff, 0x0a]),
      ]),
    );
    expectFailure(fixture, /UTF-8 válido/);
  }

  {
    const fixture = createFixture("pnpm-bin-oversized");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\n# ${fixture.repositoryRoot}\n${"#".repeat(64 * 1_024)}\n`,
    );
    expectFailure(fixture, /excede el límite de tamaño permitido/);
  }

  {
    const fixture = createFixture("pnpm-bin-no-root");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      '#!/bin/sh\nexec node ./tiny-dep.js "$@"\n',
    );
    expectFailure(fixture, /no referencia el repositoryRoot esperado/);
  }

  {
    const fixture = createFixture("pnpm-bin-wrong-header");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/usr/bin/env sh\nexec node ${fixture.repositoryRoot}/tiny-dep.js "$@"\n`,
    );
    expectFailure(fixture, /formato shell LF esperado/);
  }

  {
    const absent = createFixture("pnpm-container-absent");
    const generated = createFixture("pnpm-container-generated");
    const generatedNodeModules = path.join(
      generated.dependencyRoot,
      "node_modules",
    );
    mkdirSync(generatedNodeModules, { mode: 0o755 });
    chmodSync(generatedNodeModules, 0o755);
    assert.equal(verify(absent).closureHash, verify(generated).closureHash);
  }

  {
    const fixture = createFixture("node-modules-sibling-tamper");
    const nodeModulesDirectory = path.join(
      fixture.dependencyRoot,
      "node_modules",
    );
    mkdirSync(nodeModulesDirectory, { mode: 0o755 });
    chmodSync(nodeModulesDirectory, 0o755);
    writeFile(
      path.join(nodeModulesDirectory, "rogue.js"),
      "export const rogue = true;\n",
    );
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("pnpm-bin-symlink");
    mkdirSync(path.join(fixture.dependencyRoot, "node_modules"), {
      recursive: true,
      mode: 0o755,
    });
    chmodSync(path.join(fixture.dependencyRoot, "node_modules"), 0o755);
    symlinkSync(
      fixture.optionalRoot,
      path.join(fixture.dependencyRoot, "node_modules/.bin"),
    );
    expectFailure(fixture, /\.bin generado por pnpm|directorio inválido/);
  }

  {
    const fixture = createFixture("pnpm-bin-child-symlink");
    const binDirectory = createPnpmBinDirectory(fixture.dependencyRoot);
    symlinkSync(
      path.join(fixture.dependencyRoot, "index.js"),
      path.join(binDirectory, "tiny-dep"),
    );
    expectFailure(fixture, /shims regulares 0755/);
  }

  {
    const fixture = createFixture("pnpm-bin-nested-directory");
    const binDirectory = createPnpmBinDirectory(fixture.dependencyRoot);
    mkdirSync(path.join(binDirectory, "nested"), { mode: 0o755 });
    expectFailure(fixture, /shims regulares 0755/);
  }

  {
    const fixture = createFixture("pnpm-bin-special-file");
    const binDirectory = createPnpmBinDirectory(fixture.dependencyRoot);
    execFileSync("mkfifo", [path.join(binDirectory, "rogue")], {
      stdio: "ignore",
    });
    expectFailure(fixture, /shims regulares 0755/);
  }

  {
    const fixture = createFixture("pnpm-bin-wrong-mode");
    writePnpmShim(
      fixture.dependencyRoot,
      "tiny-dep",
      `#!/bin/sh\nexec node ${fixture.repositoryRoot}/tiny-dep.js "$@"\n`,
      0o775,
    );
    expectFailure(fixture, /shims regulares 0755/);
  }

  {
    const fixture = createFixture("pnpm-bin-directory-wrong-mode");
    const binDirectory = createPnpmBinDirectory(fixture.dependencyRoot);
    chmodSync(binDirectory, 0o775);
    expectFailure(fixture, /directorio regular 0755/);
  }

  {
    const fixture = createFixture("pnpm-container-wrong-mode");
    const nodeModulesDirectory = path.join(
      fixture.dependencyRoot,
      "node_modules",
    );
    mkdirSync(nodeModulesDirectory, { mode: 0o755 });
    chmodSync(nodeModulesDirectory, 0o775);
    expectFailure(fixture, /directorio regular 0755/);
  }

  {
    const fixture = createFixture("hardlink-topology");
    const copyPath = path.join(fixture.dependencyRoot, "copy.js");
    unlinkSync(copyPath);
    linkSync(path.join(fixture.dependencyRoot, "index.js"), copyPath);
    expectFailure(fixture, /closure runtime de Wrangler/);
  }

  {
    const fixture = createFixture("external-hardlink");
    const target = path.join(fixture.dependencyRoot, "index.js");
    const originalLinkCount = lstatSync(target).nlink;
    linkSync(
      target,
      path.join(fixture.repositoryRoot, "outside-closure-hardlink.js"),
    );
    assert.equal(lstatSync(target).nlink, originalLinkCount + 1);
    assert.equal(
      verify(fixture).closureHash,
      fixture.expectedPolicy.closureHash,
    );
  }

  {
    const fixture = createFixture("special-file-type");
    execFileSync("mkfifo", [path.join(fixture.leafRoot, "rogue.fifo")], {
      stdio: "ignore",
    });
    expectFailure(fixture, /tipo de archivo no permitido/);
  }

  {
    const versioned = verifyExceptionalWranglerIntegrity({ repositoryRoot });
    assert.equal(versioned.version, EXCEPTIONAL_WRANGLER_INTEGRITY_VERSION);
    assert.match(versioned.lockHash, /^[0-9a-f]{64}$/);
    assert.match(versioned.closureHash, /^[0-9a-f]{64}$/);
    assert.match(versioned.entrypointHash, /^[0-9a-f]{64}$/);
  }

  console.log("Exceptional Wrangler integrity tests: PASS");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
