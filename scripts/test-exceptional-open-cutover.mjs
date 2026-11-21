#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXCEPTIONAL_CUTOVER_NODE_VERSION,
  EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
} from "./exceptional-release-cutover-policy.mjs";
import {
  ExceptionalCutoverError,
  assertNoWranglerDeployConfigInAncestors,
  deriveExceptionalCutoverStatePaths,
  ensureExceptionalCutoverStateRoot,
  exceptionalCutoverChildEnvironment,
  findWranglerDeployConfigsInAncestors,
  parseWranglerVersionUploadNdjson,
  prepareRecoverableGitRemoteTransport,
  readRecoverableGitState,
  resolveExceptionalCutoverStateRoot,
} from "./run-exceptional-open-cutover.mjs";
import {
  ExceptionalCutoverChildProcessError,
  runExceptionalCutoverChildProcess,
} from "./exceptional-cutover-child-process.mjs";

assert.equal(process.versions.node, EXCEPTIONAL_CUTOVER_NODE_VERSION);
assert.equal(EXCEPTIONAL_CUTOVER_WRANGLER_VERSION, "4.160.1");

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-cutover-low-level-test-"),
);
chmodSync(temporaryRoot, 0o700);
const requestHash = "a".repeat(64);
const versionId = "11111111-1111-4111-8111-111111111111";

function writeSecure(filePath, source) {
  writeFileSync(filePath, source, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function sessionEvent(arguments_) {
  return {
    command_line_args: arguments_,
    log_file_path: "/tmp/agorbis-wrangler.log",
    timestamp: "2026-08-31T12:00:00.000Z",
    type: "wrangler-session",
    version: 1,
    wrangler_version: EXCEPTIONAL_CUTOVER_WRANGLER_VERSION,
  };
}

function uploadEvent(overrides = {}) {
  return {
    preview_alias_url: null,
    preview_url: null,
    timestamp: "2026-08-31T12:00:01.000Z",
    type: "version-upload",
    version: 1,
    version_id: versionId,
    worker_name: "agorbis",
    worker_name_overridden: false,
    worker_tag: "0123456789abcdef0123456789abcdef01234567",
    wrangler_environment: null,
    ...overrides,
  };
}

async function assertRejectsCode(
  promise,
  code,
  ErrorClass = ExceptionalCutoverError,
) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorClass);
    assert.equal(error.code, code);
    return true;
  });
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForFile(filePath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return Number.parseInt(readFileSync(filePath, "utf8"), 10);
    } catch (error) {
      if (error?.code !== "ENOENT" || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

try {
  const source = readFileSync(
    path.join(repositoryRoot, "scripts/run-exceptional-open-cutover.mjs"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /export\s+(?:async\s+)?function\s+runExceptionalOpenCutover/u,
  );
  assert.doesNotMatch(
    source,
    /export\s+(?:async\s+)?function\s+executeExceptionalCutoverStep/u,
  );
  assert.match(source, /PRODUCTION_CUTOVER_CAPABILITY/u);
  assert.match(
    readFileSync(
      path.join(
        repositoryRoot,
        "scripts/exceptional-release-cutover-policy.mjs",
      ),
      "utf8",
    ),
    /--act-hash/u,
  );
  const productionRunner = source.slice(
    source.indexOf("async function runExceptionalOpenCutoverInternal("),
    source.indexOf("async function runExceptionalOpenCutover()"),
  );
  const preOAuthConfigIndex = productionRunner.indexOf(
    "assertNoWranglerDeployConfigInAncestors([",
  );
  const oauthIndex = productionRunner.indexOf(
    "oauthToken = await loadOAuthTokenImpl({",
  );
  assert.ok(preOAuthConfigIndex >= 0 && preOAuthConfigIndex < oauthIndex);
  assert.match(
    productionRunner.slice(preOAuthConfigIndex, oauthIndex),
    /repositoryRoot,/u,
  );
  const capsulePublishIndex = productionRunner.indexOf(
    "recoveryCapsule = openUpdate",
  );
  const capsuleDurableReadIndex = productionRunner.indexOf(
    "const durableRecoveryCapsule = openUpdate",
  );
  const finalTtyIndex = productionRunner.indexOf("const tty = openTtyImpl()");
  const postConfirmationGitIndex = productionRunner.indexOf(
    "const confirmedGit = await readGitStateImpl({",
  );
  const postConfirmationBundleIndex = productionRunner.indexOf(
    "const confirmedBundle = await readBundle({",
  );
  const postConfirmationLockIndex = productionRunner.indexOf(
    "assertOpenOperationLock(operationLock)",
    finalTtyIndex,
  );
  const postConfirmationConfigIndex = productionRunner.indexOf(
    "assertNoWranglerDeployConfigInAncestors([",
    postConfirmationBundleIndex,
  );
  const postConfirmationClosedIndex = productionRunner.indexOf(
    "const confirmedClosed = await auditSource(",
  );
  const postConfirmationRemoteIndex = productionRunner.indexOf(
    "await safeAssertRemoteUnused(\n      assertRemoteUnusedImpl,\n      oauthToken,\n      confirmedBundle,",
  );
  const postConfirmationCapsuleIndex = productionRunner.indexOf(
    "confirmedRecoveryCapsule = openUpdate",
  );
  const claimWriteIndex = productionRunner.indexOf(
    "writeCanonicalExclusive(statePaths.claimPath, claim)",
  );
  const orderedCutoverOperations = [
    capsulePublishIndex,
    capsuleDurableReadIndex,
    finalTtyIndex,
    postConfirmationLockIndex,
    postConfirmationGitIndex,
    postConfirmationBundleIndex,
    postConfirmationConfigIndex,
    postConfirmationClosedIndex,
    postConfirmationRemoteIndex,
    postConfirmationCapsuleIndex,
    claimWriteIndex,
  ];
  assert.equal(
    orderedCutoverOperations.every(
      (operationIndex, index) =>
        operationIndex >= 0 &&
        (index === 0 || operationIndex > orderedCutoverOperations[index - 1]),
    ),
    true,
    "La cápsula durable debe preceder al TTY y todas las revalidaciones posteriores deben preceder al claim.",
  );

  const statePaths = deriveExceptionalCutoverStatePaths({
    stateRoot: temporaryRoot,
    requestHash,
  });
  assert.equal(
    statePaths.claimPath,
    path.join(temporaryRoot, `${requestHash}.claim.json`),
  );
  assert.equal(
    statePaths.receiptPath,
    path.join(temporaryRoot, `${requestHash}.receipt.json`),
  );
  assert.throws(
    () =>
      deriveExceptionalCutoverStatePaths({
        stateRoot: temporaryRoot,
        requestHash: "bad",
      }),
    /SHA-256/u,
  );

  assert.equal(
    resolveExceptionalCutoverStateRoot({
      userInfoImpl: () => ({
        uid: process.getuid(),
        homedir: "/home/tester",
      }),
    }),
    "/home/tester/.local/state/agorbis/exceptional-cutovers",
  );

  const safeStateRoot = path.join(temporaryRoot, "safe-state");
  const ensured = ensureExceptionalCutoverStateRoot({
    stateRoot: safeStateRoot,
    worktreeRoot: repositoryRoot,
  });
  assert.equal(ensured.stateRoot, safeStateRoot);
  chmodSync(safeStateRoot, 0o755);
  assert.throws(
    () =>
      ensureExceptionalCutoverStateRoot({
        stateRoot: safeStateRoot,
        worktreeRoot: repositoryRoot,
      }),
    /0700/u,
  );

  const deployConfigRoot = path.join(temporaryRoot, "ancestor");
  const nested = path.join(deployConfigRoot, "a", "b");
  mkdirSync(path.join(deployConfigRoot, ".wrangler", "deploy"), {
    recursive: true,
  });
  mkdirSync(nested, { recursive: true });
  writeFileSync(
    path.join(deployConfigRoot, ".wrangler", "deploy", "config.json"),
    "{}\n",
  );
  assert.deepEqual(findWranglerDeployConfigsInAncestors({ cwd: nested }), [
    path.join(deployConfigRoot, ".wrangler", "deploy", "config.json"),
  ]);
  assert.throws(
    () => assertNoWranglerDeployConfigInAncestors([deployConfigRoot]),
    /\.wrangler\/deploy\/config\.json/u,
  );

  const childEnv = exceptionalCutoverChildEnvironment(
    {
      HOME: "/home/tester",
      PATH: "/usr/bin:/bin",
      XDG_CONFIG_HOME: "/home/tester/.config",
      XDG_RUNTIME_DIR: "/run/user/1000",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
      CLOUDFLARE_API_TOKEN: "forbidden",
      CF_API_TOKEN: "forbidden",
      NODE_OPTIONS: "--inspect",
      SECRET_VALUE: "forbidden",
    },
    { outputPath: path.join(temporaryRoot, "wrangler.ndjson") },
  );
  assert.equal(childEnv.HOME, "/home/tester");
  assert.equal(childEnv.CLOUDFLARE_ACCOUNT_ID.length, 32);
  assert.equal(childEnv.CLOUDFLARE_AUTH_USE_KEYRING, "true");
  assert.equal(childEnv.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(childEnv.CF_API_TOKEN, undefined);
  assert.equal(childEnv.NODE_OPTIONS, undefined);
  assert.equal(childEnv.SECRET_VALUE, undefined);
  assert.equal(Object.isFrozen(childEnv), true);

  const expectedArguments = ["versions", "upload", "--name", "agorbis"];
  const ndjsonPath = path.join(temporaryRoot, "valid.ndjson");
  writeSecure(
    ndjsonPath,
    `${JSON.stringify(sessionEvent(expectedArguments))}\n${JSON.stringify(uploadEvent())}\n`,
  );
  assert.equal(
    parseWranglerVersionUploadNdjson(ndjsonPath, { expectedArguments }),
    versionId,
  );
  for (const [label, lines] of [
    ["missing-session", [uploadEvent()]],
    ["wrong-command", [sessionEvent(["versions", "deploy"]), uploadEvent()]],
    [
      "wrong-worker",
      [sessionEvent(expectedArguments), uploadEvent({ worker_name: "other" })],
    ],
    [
      "overridden-worker",
      [
        sessionEvent(expectedArguments),
        uploadEvent({ worker_name_overridden: true }),
      ],
    ],
    [
      "extra-key",
      [sessionEvent(expectedArguments), uploadEvent({ secret: "bad" })],
    ],
  ]) {
    const filePath = path.join(temporaryRoot, `${label}.ndjson`);
    writeSecure(
      filePath,
      `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    );
    assert.throws(
      () => parseWranglerVersionUploadNdjson(filePath, { expectedArguments }),
      /Wrangler|evento|NDJSON/u,
    );
  }

  const head = "0123456789abcdef0123456789abcdef01234567";
  const fictitiousRemote = "https://code.example.invalid/team/private.git";
  const fictitiousRemoteOrigin = "https://code.example.invalid";
  const helperRoot = path.join(temporaryRoot, "git-helper-fixture");
  mkdirSync(helperRoot, { mode: 0o700 });
  chmodSync(helperRoot, 0o700);
  const helperPath = path.join(helperRoot, "gh");
  const helperContents = Buffer.from("fictitious helper fixture\n", "utf8");
  writeFileSync(helperPath, helperContents, { mode: 0o755 });
  chmodSync(helperPath, 0o755);
  const helperSha256 = createHash("sha256")
    .update(helperContents)
    .digest("hex");
  const helperCommand = `!${helperPath} auth git-credential`;
  const discoveryCalls = [];
  const remoteTransport = await prepareRecoverableGitRemoteTransport({
    repositoryRoot,
    environment: {
      GH_TOKEN: "fictitious-credential-must-not-pass",
      GIT_ASKPASS: "/fictitious/askpass",
      GIT_CONFIG_GLOBAL: "/fictitious/global-config",
      HOME: "/home/fictitious",
      PATH: "/fictitious/bin",
    },
    expectedRemoteUrl: fictitiousRemote,
    expectedHelperSha256: helperSha256,
    execFileImpl: async (command, arguments_, options) => {
      discoveryCalls.push({ command, arguments_, options });
      return { stdout: `\0${helperCommand}\0` };
    },
  });
  assert.deepEqual(remoteTransport, {
    schemaVersion: "agorbis-recoverable-git-remote-transport/v1",
    mode: "validated-host-scope",
  });
  assert.equal(
    JSON.stringify(remoteTransport).includes(helperPath) ||
      JSON.stringify(remoteTransport).includes(fictitiousRemote),
    false,
  );
  assert.equal(discoveryCalls.length, 1);
  assert.equal(
    discoveryCalls[0].arguments_.join(" ") ===
      `config --global --no-includes --null --get-all credential.${fictitiousRemoteOrigin}.helper`,
    true,
  );
  assert.equal(
    discoveryCalls[0].options.env.GIT_CONFIG_NOSYSTEM === "1" &&
      discoveryCalls[0].options.env.GIT_TERMINAL_PROMPT === "0" &&
      discoveryCalls[0].options.env.GIT_NO_LAZY_FETCH === "1" &&
      discoveryCalls[0].options.env.GIT_OPTIONAL_LOCKS === "0" &&
      discoveryCalls[0].options.env.GIT_CONFIG_GLOBAL === undefined &&
      discoveryCalls[0].options.env.PATH === "/usr/bin:/bin" &&
      discoveryCalls[0].options.env.GH_TOKEN === undefined &&
      discoveryCalls[0].options.env.GIT_ASKPASS === undefined,
    true,
  );
  const gitOutputs = new Map([
    [
      "config --local --null --list",
      [
        "core.repositoryformatversion\n0",
        "core.filemode\ntrue",
        "core.bare\nfalse",
        "core.logallrefupdates\ntrue",
        `remote.origin.url\n${fictitiousRemote}`,
        "remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*",
        "branch.main.remote\norigin",
        "branch.main.merge\nrefs/heads/main",
      ].join("\0") + "\0",
    ],
    ["remote get-url origin", `${fictitiousRemote}\n`],
    ["remote get-url --push origin", `${fictitiousRemote}\n`],
    ["status --porcelain=v1 --untracked-files=all", ""],
    ["rev-parse HEAD", `${head}\n`],
    ["rev-parse origin/main", `${head}\n`],
    ["rev-list --left-right --count origin/main...HEAD", "0\t0\n"],
    ["diff --check", ""],
    [
      "for-each-ref --format=%(refname)%09%(objectname) refs/heads/ refs/tags/ refs/stash",
      `refs/heads/main\t${head}\n`,
    ],
    ["rev-parse --is-shallow-repository", "false\n"],
    ["init --bare --quiet .", ""],
    [
      `ls-remote --exit-code ${fictitiousRemote} refs/heads/main`,
      `${head}\trefs/heads/main\n`,
    ],
    [
      `fetch --quiet --no-tags --no-recurse-submodules --no-write-fetch-head ${fictitiousRemote} +refs/heads/main:refs/d72/remote-main`,
      "",
    ],
    ["rev-parse --verify refs/d72/remote-main^{commit}", `${head}\n`],
    ["cat-file -e 0123456789abcdef0123456789abcdef01234567^{commit}", ""],
    ["fsck --full --strict --no-dangling", ""],
  ]);
  const recoveryAudit = Object.freeze({
    fsckValid: true,
    hasGitmodules: false,
    headOid: head,
    headRef: "refs/heads/main",
    history: Object.freeze({
      findings: Object.freeze([]),
      gitlinks: Object.freeze([]),
      lfsPointers: Object.freeze([]),
    }),
    localRefs: Object.freeze([
      Object.freeze({ name: "refs/heads/main", oid: head }),
    ]),
    remotes: Object.freeze([
      Object.freeze({ name: "origin", safe: true, kinds: ["https"] }),
    ]),
    shallow: false,
    stash: false,
    statusEntryCount: 0,
    upstream: "origin/main",
    worktree: Object.freeze({ findings: Object.freeze([]) }),
  });
  let recoveryAuditCalls = 0;
  const auditGitRepositoryImpl = (auditedRoot) => {
    assert.equal(auditedRoot, repositoryRoot);
    recoveryAuditCalls += 1;
    return recoveryAudit;
  };
  const gitCalls = [];
  const gitState = await readRecoverableGitState({
    repositoryRoot,
    remoteTransport,
    auditGitRepositoryImpl,
    execFileImpl: async (command, arguments_, options) => {
      gitCalls.push({ command, arguments_, options });
      return { stdout: gitOutputs.get(arguments_.join(" ")) };
    },
  });
  assert.deepEqual(gitState, {
    head,
    originMain: head,
    divergence: "0/0",
    diffCheckClean: true,
    recoveryAuditPassed: true,
    remoteObjectReachable: true,
    remoteHead: head,
    worktreeClean: true,
  });
  assert.equal(recoveryAuditCalls, 2);
  const advancedOriginHead = "fedcba9876543210fedcba9876543210fedcba98";
  const advancedGitOutputs = new Map(gitOutputs);
  advancedGitOutputs.set("rev-parse origin/main", `${advancedOriginHead}\n`);
  advancedGitOutputs.set(
    "rev-list --left-right --count origin/main...HEAD",
    "1\t0\n",
  );
  advancedGitOutputs.set(
    `ls-remote --exit-code ${fictitiousRemote} refs/heads/main`,
    `${advancedOriginHead}\trefs/heads/main\n`,
  );
  advancedGitOutputs.set(
    "rev-parse --verify refs/d72/remote-main^{commit}",
    `${advancedOriginHead}\n`,
  );
  advancedGitOutputs.delete(
    "cat-file -e 0123456789abcdef0123456789abcdef01234567^{commit}",
  );
  advancedGitOutputs.set(`cat-file -e ${advancedOriginHead}^{commit}`, "");
  const advancedExecFile = async (_command, arguments_) => ({
    stdout: advancedGitOutputs.get(arguments_.join(" ")),
  });
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: advancedExecFile,
    }),
    "GIT_NOT_RECOVERABLE",
  );
  assert.deepEqual(
    await readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: advancedExecFile,
      allowOriginAdvanceFromHead: true,
    }),
    {
      head,
      originMain: advancedOriginHead,
      divergence: "1/0",
      diffCheckClean: true,
      recoveryAuditPassed: true,
      remoteObjectReachable: true,
      remoteHead: advancedOriginHead,
      worktreeClean: true,
    },
  );
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: async (_command, arguments_) => ({
        stdout:
          arguments_.join(" ") ===
          "rev-parse --verify refs/d72/remote-main^{commit}"
            ? `${advancedOriginHead}\n`
            : gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_REMOTE_CHANGED_DURING_FETCH",
  );
  assert.equal(
    gitCalls.every(({ command }) => command === "/usr/bin/git"),
    true,
  );
  assert.equal(
    gitCalls.every(
      ({ options }) =>
        options.env.GIT_CONFIG_NOSYSTEM === "1" &&
        options.env.GIT_CONFIG_GLOBAL === "/dev/null" &&
        options.env.GIT_NO_LAZY_FETCH === "1" &&
        options.env.GIT_OPTIONAL_LOCKS === "0" &&
        options.env.PATH === "/usr/bin:/bin" &&
        options.env.GH_TOKEN === undefined &&
        options.env.GIT_ASKPASS === undefined &&
        options.shell === false,
    ),
    true,
  );
  const remoteGitCalls = gitCalls.filter(({ arguments_ }) =>
    ["fetch", "ls-remote"].includes(arguments_[0]),
  );
  const localGitCalls = gitCalls.filter(
    ({ arguments_ }) => !["fetch", "ls-remote"].includes(arguments_[0]),
  );
  assert.equal(
    localGitCalls.every(
      ({ options }) => options.env.GIT_CONFIG_COUNT === undefined,
    ),
    true,
  );
  assert.equal(remoteGitCalls.length, 4);
  assert.equal(
    remoteGitCalls.every(
      ({ options }) =>
        options.env.GIT_CONFIG_COUNT === "2" &&
        options.env.GIT_CONFIG_KEY_0 ===
          `credential.${fictitiousRemoteOrigin}.helper` &&
        options.env.GIT_CONFIG_VALUE_0 === "" &&
        options.env.GIT_CONFIG_KEY_1 ===
          `credential.${fictitiousRemoteOrigin}.helper` &&
        /^!\/tmp\/agorbis-d72-git-helper-[A-Za-z0-9]+\/gh auth git-credential$/u.test(
          options.env.GIT_CONFIG_VALUE_1,
        ) &&
        options.env.GIT_CONFIG_VALUE_1 !== helperCommand,
    ),
    true,
  );
  const copiedHelperPaths = new Set(
    remoteGitCalls.map(({ options }) =>
      options.env.GIT_CONFIG_VALUE_1.slice(1, -" auth git-credential".length),
    ),
  );
  assert.equal(copiedHelperPaths.size, 2);
  for (const copiedHelperPath of copiedHelperPaths) {
    assert.throws(
      () => lstatSync(copiedHelperPath),
      (error) => error?.code === "ENOENT",
    );
  }
  const isolatedObjectStores = new Set(
    gitCalls
      .filter(({ arguments_ }) => arguments_[0] === "init")
      .map(({ options }) => options.cwd),
  );
  assert.equal(isolatedObjectStores.size, 2);
  for (const objectStore of isolatedObjectStores) {
    assert.match(objectStore, /^\/tmp\/agorbis-d72-git-objects-/u);
    assert.throws(
      () => lstatSync(objectStore),
      (error) => error?.code === "ENOENT",
    );
  }
  assert.equal(
    [...discoveryCalls, ...gitCalls].some(({ options }) =>
      JSON.stringify(options.env).includes(
        "fictitious-credential-must-not-pass",
      ),
    ),
    false,
  );
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: async (_command, arguments_) => ({
        stdout:
          arguments_.join(" ") === "config --local --null --list"
            ? "url.https://evil/.insteadof\nhttps://github.com/\0"
            : gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "UNSAFE_GIT_CONFIG",
  );
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: async (_command, arguments_) => ({
        stdout:
          arguments_.join(" ") === "config --local --null --list"
            ? "credential.helper\n!fictitious-command\0"
            : gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "UNSAFE_GIT_CONFIG",
  );
  await assertRejectsCode(
    prepareRecoverableGitRemoteTransport({
      repositoryRoot,
      environment: { HOME: "/home/fictitious" },
      expectedRemoteUrl: fictitiousRemote,
      expectedHelperSha256: helperSha256,
      execFileImpl: async () => ({ stdout: `${helperCommand}\0` }),
    }),
    "UNSAFE_GIT_REMOTE_TRANSPORT",
  );
  await assertRejectsCode(
    prepareRecoverableGitRemoteTransport({
      repositoryRoot,
      environment: { HOME: "/home/fictitious" },
      expectedRemoteUrl: fictitiousRemote,
      expectedHelperSha256: "0".repeat(64),
      execFileImpl: async () => ({ stdout: `\0${helperCommand}\0` }),
    }),
    "UNSAFE_GIT_REMOTE_TRANSPORT",
  );
  let oversizedHelperOpened = false;
  const helperMetadata = lstatSync(helperPath);
  const oversizedMetadata = new Proxy(helperMetadata, {
    get(target, property) {
      if (property === "size") return 300 * 1024 * 1024;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await assertRejectsCode(
    prepareRecoverableGitRemoteTransport({
      repositoryRoot,
      environment: { HOME: "/home/fictitious" },
      expectedRemoteUrl: fictitiousRemote,
      expectedHelperSha256: helperSha256,
      execFileImpl: async () => ({ stdout: `\0${helperCommand}\0` }),
      lstatImpl: () => oversizedMetadata,
      openImpl() {
        oversizedHelperOpened = true;
        throw new Error("no debe abrirse");
      },
    }),
    "UNSAFE_GIT_REMOTE_TRANSPORT",
  );
  assert.equal(oversizedHelperOpened, false);

  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl: () => ({
        ...recoveryAudit,
        fsckValid: false,
      }),
      execFileImpl: async (_command, arguments_) => ({
        stdout: gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_RECOVERY_AUDIT_FAILED",
  );
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl: () => ({
        ...recoveryAudit,
        upstream: "origin/other",
      }),
      execFileImpl: async (_command, arguments_) => ({
        stdout: gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_RECOVERY_AUDIT_MISMATCH",
  );
  let changingRecoveryAuditCalls = 0;
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl: () => {
        changingRecoveryAuditCalls += 1;
        if (changingRecoveryAuditCalls === 1) return recoveryAudit;
        return {
          ...recoveryAudit,
          localRefs: [
            ...recoveryAudit.localRefs,
            {
              name: "refs/tags/concurrent-change",
              oid: head,
            },
          ],
        };
      },
      execFileImpl: async (_command, arguments_) => ({
        stdout: gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_RECOVERY_AUDIT_CHANGED",
  );
  assert.equal(changingRecoveryAuditCalls, 2);
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: async (_command, arguments_) => ({
        stdout:
          arguments_[0] === "for-each-ref"
            ? `refs/heads/main\t${head}\nrefs/tags/concurrent-change\t${head}\n`
            : gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_CHANGED_DURING_RECOVERY_AUDIT",
  );
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: async (_command, arguments_) => ({
        stdout:
          arguments_.join(" ") === "diff --check"
            ? "fixture.txt:1: trailing whitespace.\n"
            : gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_NOT_RECOVERABLE",
  );

  const changedDuringAuditHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  let auditChangedGitState = false;
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl: () => {
        auditChangedGitState = true;
        return recoveryAudit;
      },
      execFileImpl: async (_command, arguments_) => ({
        stdout:
          auditChangedGitState && arguments_.join(" ") === "rev-parse HEAD"
            ? `${changedDuringAuditHead}\n`
            : gitOutputs.get(arguments_.join(" ")),
      }),
    }),
    "GIT_CHANGED_DURING_RECOVERY_AUDIT",
  );
  assert.equal(auditChangedGitState, true);

  let helperChangedDuringRemoteRead = false;
  await assertRejectsCode(
    readRecoverableGitState({
      repositoryRoot,
      remoteTransport,
      auditGitRepositoryImpl,
      execFileImpl: async (_command, arguments_, options) => {
        const stdout = gitOutputs.get(arguments_.join(" "));
        if (arguments_[0] === "ls-remote") {
          const copiedHelperPath = options.env.GIT_CONFIG_VALUE_1.slice(
            1,
            -" auth git-credential".length,
          );
          chmodSync(copiedHelperPath, 0o700);
          writeFileSync(copiedHelperPath, "changed helper fixture\n", {
            mode: 0o700,
          });
          chmodSync(copiedHelperPath, 0o500);
          helperChangedDuringRemoteRead = true;
        }
        return { stdout };
      },
    }),
    "UNSAFE_GIT_REMOTE_TRANSPORT",
  );
  assert.equal(helperChangedDuringRemoteRead, true);

  const mockStep = Object.freeze({
    id: "mock-step",
    command: process.execPath,
    arguments: Object.freeze(["--version"]),
    shell: false,
  });
  const mockChild = new EventEmitter();
  mockChild.pid = 987_654;
  const spawnRecords = [];
  const absentGroup = (_pid, signal) => {
    if (signal === 0) {
      const error = new Error("absent");
      error.code = "ESRCH";
      throw error;
    }
  };
  const mockPromise = runExceptionalCutoverChildProcess({
    command: mockStep.command,
    arguments: mockStep.arguments,
    stepId: mockStep.id,
    env: { PATH: "/usr/bin" },
    cwd: temporaryRoot,
    spawnImpl: (command, arguments_, options) => {
      spawnRecords.push({ command, arguments_, options });
      queueMicrotask(() => mockChild.emit("close", 0, null));
      return mockChild;
    },
    killProcessGroupImpl: absentGroup,
    timeoutMs: 1_000,
  });
  await mockPromise;
  assert.equal(spawnRecords[0].options.detached, true);
  assert.equal(spawnRecords[0].options.stdio, "ignore");
  assert.equal(spawnRecords[0].options.shell, false);

  const inheritedChild = new EventEmitter();
  inheritedChild.pid = 987_655;
  let inheritedSpawnOptions = null;
  const inheritedPromise = runExceptionalCutoverChildProcess({
    command: mockStep.command,
    arguments: mockStep.arguments,
    stepId: mockStep.id,
    env: { PATH: "/usr/bin" },
    cwd: temporaryRoot,
    inheritedLockDescriptor: 99,
    spawnImpl: (_command, _arguments, options) => {
      inheritedSpawnOptions = options;
      queueMicrotask(() => inheritedChild.emit("close", 0, null));
      return inheritedChild;
    },
    killProcessGroupImpl: absentGroup,
    timeoutMs: 1_000,
  });
  await inheritedPromise;
  assert.deepEqual(inheritedSpawnOptions.stdio, [
    "ignore",
    "ignore",
    "ignore",
    99,
  ]);

  const wrapperPath = path.join(temporaryRoot, "wrapper-with-grandchild.mjs");
  const grandchildPidPath = path.join(temporaryRoot, "grandchild.pid");
  writeFileSync(
    wrapperPath,
    `import { spawn } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nchild.unref();\nwriteFileSync(${JSON.stringify(grandchildPidPath)}, String(child.pid));\n`,
  );
  const descendantStep = Object.freeze({
    id: "descendant-step",
    command: process.execPath,
    arguments: Object.freeze([wrapperPath]),
    shell: false,
  });
  const descendantPromise = runExceptionalCutoverChildProcess({
    command: descendantStep.command,
    arguments: descendantStep.arguments,
    stepId: descendantStep.id,
    env: { PATH: process.env.PATH },
    cwd: temporaryRoot,
    timeoutMs: 2_000,
    terminationGraceMs: 100,
  });
  const grandchildPid = await waitForFile(grandchildPidPath);
  await assertRejectsCode(
    descendantPromise,
    "STEP_DESCENDANTS_PRESENT",
    ExceptionalCutoverChildProcessError,
  );
  assert.equal(processExists(grandchildPid), false);

  const hangingPath = path.join(temporaryRoot, "hanging-group.mjs");
  const hangingChildPidPath = path.join(temporaryRoot, "hanging-child.pid");
  writeFileSync(
    hangingPath,
    `import { spawn } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nwriteFileSync(${JSON.stringify(hangingChildPidPath)}, String(child.pid));\nsetInterval(() => {}, 1000);\n`,
  );
  const timeoutStep = Object.freeze({
    id: "timeout-group-step",
    command: process.execPath,
    arguments: Object.freeze([hangingPath]),
    shell: false,
  });
  const timeoutPromise = runExceptionalCutoverChildProcess({
    command: timeoutStep.command,
    arguments: timeoutStep.arguments,
    stepId: timeoutStep.id,
    env: { PATH: process.env.PATH },
    cwd: temporaryRoot,
    timeoutMs: 100,
    terminationGraceMs: 100,
  });
  const hangingChildPid = await waitForFile(hangingChildPidPath);
  await assertRejectsCode(
    timeoutPromise,
    "STEP_TIMEOUT",
    ExceptionalCutoverChildProcessError,
  );
  assert.equal(processExists(hangingChildPid), false);

  console.log("Exceptional open cutover low-level tests: PASS");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
