#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./exceptional-release-act.mjs";
import {
  EXCEPTIONAL_CUTOVER_OPERATION_LOCK_FILENAME,
  EXCEPTIONAL_CUTOVER_OPERATION_LOCK_SCHEMA_VERSION,
  ExceptionalCutoverOperationLockError,
  acquireExceptionalCutoverOperationLock,
  assertExceptionalCutoverOperationLock,
  releaseExceptionalCutoverOperationLock,
} from "./exceptional-cutover-operation-lock.mjs";
import {
  EXCEPTIONAL_CUTOVER_NODE_VERSION,
  exceptionalCutoverConfirmationPhrase,
} from "./exceptional-release-cutover-policy.mjs";
import {
  EXCEPTIONAL_CLOSED_RECOVERY_JOURNAL_SCHEMA_VERSION,
  EXCEPTIONAL_CLOSED_RECOVERY_RECEIPT_SCHEMA_VERSION,
  parseExceptionalClosedRecoveryArguments,
  readExceptionalCutoverClaim,
} from "./run-exceptional-closed-recovery.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";
import { ExceptionalCutoverError } from "./run-exceptional-open-cutover.mjs";

assert.equal(
  process.versions.node,
  EXCEPTIONAL_CUTOVER_NODE_VERSION,
  `Este test debe ejecutarse con Node ${EXCEPTIONAL_CUTOVER_NODE_VERSION}.`,
);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const runnerPath = path.join(
  repositoryRoot,
  "scripts",
  "run-exceptional-closed-recovery.mjs",
);
const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-exceptional-closed-recovery-test-"),
);
chmodSync(temporaryRoot, 0o700);

const REQUEST_HASH = "1".repeat(64);
const ACT_HASH = "2".repeat(64);
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OPEN_REQUEST_HASH = "7".repeat(64);
const OPEN_ACT_HASH = "8".repeat(64);
const OPEN_HEAD = "89abcdef0123456789abcdef0123456789abcdef";
const DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
let fixtureCounter = 0;

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function contentHash(value) {
  const { contentSha256: _contentSha256, ...payload } = value;
  return sha256(canonicalJson(payload));
}

function sealClaim(overrides = {}) {
  const payload = {
    schemaVersion: "agorbis-exceptional-cutover-claim/v2",
    state: "claimed-before-deploy",
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    artifactHash: "3".repeat(64),
    issuanceHash: "4".repeat(64),
    recoveryCapsuleHash: "5".repeat(64),
    confirmationSha256: sha256(
      exceptionalCutoverConfirmationPhrase(HEAD, ACT_HASH),
    ),
    head: HEAD,
    closedDeploymentId: DEPLOYMENT_ID,
    closedVersionId: VERSION_ID,
    claimedAtUtc: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
  delete payload.contentSha256;
  return { ...payload, contentSha256: contentHash(payload) };
}

function nextPath(label) {
  fixtureCounter += 1;
  return path.join(
    temporaryRoot,
    `${String(fixtureCounter).padStart(2, "0")}-${label}.json`,
  );
}

function writeRestricted(filePath, source) {
  writeFileSync(filePath, source, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function writeClaim(label, claim = sealClaim()) {
  const filePath = nextPath(label);
  writeRestricted(filePath, canonicalJson(claim));
  return filePath;
}

function assertThrowsCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ExceptionalCutoverError);
    assert.equal(error.code, code);
    return true;
  });
}

function assertThrowsOperationLockCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ExceptionalCutoverOperationLockError);
    assert.equal(error.code, code);
    return true;
  });
}

try {
  assert.equal(
    EXCEPTIONAL_CLOSED_RECOVERY_JOURNAL_SCHEMA_VERSION,
    "agorbis-exceptional-closed-recovery-journal/v1",
  );
  assert.equal(
    EXCEPTIONAL_CLOSED_RECOVERY_RECEIPT_SCHEMA_VERSION,
    "agorbis-exceptional-closed-recovery-receipt/v1",
  );

  const parsed = parseExceptionalClosedRecoveryArguments([
    "--request-hash",
    REQUEST_HASH,
    "--act-hash",
    ACT_HASH,
  ]);
  assert.deepEqual(parsed, {
    requestHash: REQUEST_HASH,
    expectedActHash: ACT_HASH,
  });
  assert.equal(Object.isFrozen(parsed), true);
  assert.throws(() => {
    parsed.requestHash = "9".repeat(64);
  }, TypeError);

  for (const argv of [
    undefined,
    null,
    [],
    ["--request-hash", REQUEST_HASH],
    ["--act-hash", ACT_HASH, "--request-hash", REQUEST_HASH],
    ["--request-hash", REQUEST_HASH, "--act-hash", ACT_HASH, "extra"],
    ["--request", REQUEST_HASH, "--act-hash", ACT_HASH],
    ["--request-hash", REQUEST_HASH, "--act", ACT_HASH],
    ["--request-hash", "a".repeat(63), "--act-hash", ACT_HASH],
    ["--request-hash", "A".repeat(64), "--act-hash", ACT_HASH],
    ["--request-hash", `${"a".repeat(63)}/`, "--act-hash", ACT_HASH],
    ["--request-hash", REQUEST_HASH, "--act-hash", "b".repeat(65)],
    ["--request-hash", REQUEST_HASH, "--act-hash", "B".repeat(64)],
  ]) {
    assertThrowsCode(
      () => parseExceptionalClosedRecoveryArguments(argv),
      "INVALID_RECOVERY_ARGUMENTS",
    );
  }

  const validClaimPath = writeClaim("valid");
  const validClaim = readExceptionalCutoverClaim({
    claimPath: validClaimPath,
    requestHash: REQUEST_HASH,
    expectedActHash: ACT_HASH,
  });
  assert.deepEqual(validClaim, sealClaim());
  assert.equal(Object.isFrozen(validClaim), true);

  const confirmationHashClaim = sealClaim({
    confirmationSha256: "6".repeat(64),
  });
  const confirmationHashPath = writeClaim(
    "confirmation-not-bound",
    confirmationHashClaim,
  );
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: confirmationHashPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "INVALID_RECOVERY_CLAIM",
  );

  const invalidClaims = [
    ["extra-key", { ...sealClaim(), extra: true }],
    ["schema", sealClaim({ schemaVersion: "claim/v1" })],
    ["state", sealClaim({ state: "deployed" })],
    ["policy-version", sealClaim({ policyVersion: "D72/other" })],
    ["policy-hash", sealClaim({ policyHash: "7".repeat(64) })],
    ["request-hash-field", sealClaim({ requestHash: "7".repeat(64) })],
    ["act-hash-field", sealClaim({ actHash: "8".repeat(64) })],
    ["head-short", sealClaim({ head: "a".repeat(39) })],
    ["head-uppercase", sealClaim({ head: "A".repeat(40) })],
    ["artifact-hash", sealClaim({ artifactHash: "g".repeat(64) })],
    ["issuance-hash", sealClaim({ issuanceHash: "4".repeat(63) })],
    ["capsule-hash", sealClaim({ recoveryCapsuleHash: null })],
    ["confirmation-hash", sealClaim({ confirmationSha256: "" })],
    ["deployment-id", sealClaim({ closedDeploymentId: "deployment" })],
    ["version-id", sealClaim({ closedVersionId: DEPLOYMENT_ID.slice(0, -1) })],
    ["timestamp", sealClaim({ claimedAtUtc: "2026-08-31T12:00:00Z" })],
  ];
  for (const [label, claim] of invalidClaims) {
    const claimPath = writeClaim(label, claim);
    assertThrowsCode(
      () =>
        readExceptionalCutoverClaim({
          claimPath,
          requestHash: REQUEST_HASH,
          expectedActHash: ACT_HASH,
        }),
      "INVALID_RECOVERY_CLAIM",
    );
  }

  const wrongRequestPath = writeClaim("wrong-request-argument");
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: wrongRequestPath,
        requestHash: "7".repeat(64),
        expectedActHash: ACT_HASH,
      }),
    "INVALID_RECOVERY_CLAIM",
  );
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: wrongRequestPath,
        requestHash: REQUEST_HASH,
        expectedActHash: "8".repeat(64),
      }),
    "INVALID_RECOVERY_CLAIM",
  );

  const badContentClaim = { ...sealClaim(), contentSha256: "9".repeat(64) };
  const badContentPath = writeClaim("content-hash", badContentClaim);
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: badContentPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "INVALID_RECOVERY_CLAIM",
  );

  const nonCanonicalPath = nextPath("non-canonical");
  writeRestricted(
    nonCanonicalPath,
    `${JSON.stringify(sealClaim(), null, 2)}\n`,
  );
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: nonCanonicalPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "UNSAFE_RECOVERY_STATE",
  );

  const broadModePath = writeClaim("broad-mode");
  chmodSync(broadModePath, 0o644);
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: broadModePath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "UNSAFE_RECOVERY_STATE",
  );

  const hardLinkSource = writeClaim("hard-link-source");
  const hardLinkPath = nextPath("hard-link");
  linkSync(hardLinkSource, hardLinkPath);
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: hardLinkPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "UNSAFE_RECOVERY_STATE",
  );

  const symlinkSource = writeClaim("symlink-source");
  const symlinkPath = nextPath("symlink");
  symlinkSync(symlinkSource, symlinkPath);
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: symlinkPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "UNSAFE_RECOVERY_STATE",
  );

  const emptyPath = nextPath("empty");
  writeRestricted(emptyPath, "");
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: emptyPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "UNSAFE_RECOVERY_STATE",
  );

  const directoryPath = nextPath("directory");
  mkdirSync(directoryPath, { mode: 0o700 });
  assertThrowsCode(
    () =>
      readExceptionalCutoverClaim({
        claimPath: directoryPath,
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    "UNSAFE_RECOVERY_STATE",
  );

  assert.throws(
    () =>
      readExceptionalCutoverClaim({
        claimPath: path.join(temporaryRoot, "missing.json"),
        requestHash: REQUEST_HASH,
        expectedActHash: ACT_HASH,
      }),
    { code: "ENOENT" },
  );
  assert.throws(() =>
    readExceptionalCutoverClaim({
      claimPath: undefined,
      requestHash: REQUEST_HASH,
      expectedActHash: ACT_HASH,
    }),
  );

  const successfulLockRoot = path.join(temporaryRoot, "successful-lock");
  mkdirSync(successfulLockRoot, { mode: 0o700 });
  let lockInvocation = null;
  const acquired = acquireExceptionalCutoverOperationLock({
    stateRoot: successfulLockRoot,
    operation: "recovery",
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    head: HEAD,
    now: new Date("2026-08-31T12:30:00.000Z"),
    spawnSyncImpl: (command, arguments_, options) => {
      lockInvocation = { command, arguments_, options };
      return { status: 0, signal: null };
    },
  });
  assert.equal(Object.isFrozen(acquired), true);
  assert.equal(Object.isFrozen(acquired.lock), true);
  assert.equal(
    acquired.lockPath,
    path.join(successfulLockRoot, EXCEPTIONAL_CUTOVER_OPERATION_LOCK_FILENAME),
  );
  assert.equal(
    EXCEPTIONAL_CUTOVER_OPERATION_LOCK_FILENAME,
    "agorbis.production-mutation.lock",
  );
  assert.equal(
    EXCEPTIONAL_CUTOVER_OPERATION_LOCK_SCHEMA_VERSION,
    "agorbis-exceptional-cutover-operation-lock/v1",
  );
  assert.equal(acquired.lock.requestHash, REQUEST_HASH);
  assert.equal(
    acquired.lock.schemaVersion,
    EXCEPTIONAL_CUTOVER_OPERATION_LOCK_SCHEMA_VERSION,
  );
  assert.equal(acquired.lock.operation, "recovery");
  assert.equal(acquired.lock.actHash, ACT_HASH);
  assert.equal(acquired.lock.head, HEAD);
  assert.equal(acquired.lock.workerName, "agorbis");
  assert.equal(acquired.lock.accountId, "4d78fb10c1ae65281ec851479d5045dc");
  assert.equal(acquired.lock.acquiredAtUtc, "2026-08-31T12:30:00.000Z");
  assert.equal(acquired.lock.contentSha256, contentHash(acquired.lock));
  assert.equal(lstatSync(acquired.lockPath).mode & 0o7777, 0o600);
  assert.equal(
    readFileSync(acquired.lockPath, "utf8"),
    canonicalJson(acquired.lock),
  );
  assert.equal(lockInvocation.command, "/usr/bin/flock");
  assert.deepEqual(lockInvocation.arguments_, [
    "--exclusive",
    "--nonblock",
    "3",
  ]);
  assert.equal(lockInvocation.options.shell, false);
  assert.equal(lockInvocation.options.timeout, 5_000);
  assert.deepEqual(lockInvocation.options.env, { LANG: "C", LC_ALL: "C" });
  assert.equal(lockInvocation.options.stdio.length, 4);
  assert.equal(lockInvocation.options.stdio[0], "ignore");
  assert.equal(lockInvocation.options.stdio[1], "ignore");
  assert.equal(lockInvocation.options.stdio[2], "ignore");
  assert.equal(lockInvocation.options.stdio[3], acquired.descriptor);
  assertExceptionalCutoverOperationLock(acquired);
  releaseExceptionalCutoverOperationLock(acquired);

  assertThrowsOperationLockCode(
    () => acquireExceptionalCutoverOperationLock(),
    "INVALID_OPERATION_LOCK_INPUT",
  );

  const kernelLockRoot = path.join(temporaryRoot, "kernel-lock");
  mkdirSync(kernelLockRoot, { mode: 0o700 });
  const firstKernelLock = acquireExceptionalCutoverOperationLock({
    stateRoot: kernelLockRoot,
    operation: "open",
    requestHash: OPEN_REQUEST_HASH,
    actHash: OPEN_ACT_HASH,
    head: OPEN_HEAD,
    now: new Date("2026-08-31T12:30:10.000Z"),
  });
  assert.equal(firstKernelLock.lock.operation, "open");
  assert.equal(firstKernelLock.lock.requestHash, OPEN_REQUEST_HASH);
  assertThrowsOperationLockCode(
    () =>
      acquireExceptionalCutoverOperationLock({
        stateRoot: kernelLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:30:11.000Z"),
      }),
    "OPERATION_ALREADY_RUNNING",
  );
  releaseExceptionalCutoverOperationLock(firstKernelLock);
  const reacquiredKernelLock = acquireExceptionalCutoverOperationLock({
    stateRoot: kernelLockRoot,
    operation: "recovery",
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    head: HEAD,
    now: new Date("2026-08-31T12:30:12.000Z"),
  });
  assert.equal(reacquiredKernelLock.lock.operation, "recovery");
  assert.equal(reacquiredKernelLock.lock.requestHash, REQUEST_HASH);
  assert.equal(
    reacquiredKernelLock.lock.acquiredAtUtc,
    "2026-08-31T12:30:12.000Z",
  );
  releaseExceptionalCutoverOperationLock(reacquiredKernelLock);

  const inheritedLockRoot = path.join(temporaryRoot, "inherited-kernel-lock");
  mkdirSync(inheritedLockRoot, { mode: 0o700 });
  const parentLock = acquireExceptionalCutoverOperationLock({
    stateRoot: inheritedLockRoot,
    operation: "open",
    requestHash: OPEN_REQUEST_HASH,
    actHash: OPEN_ACT_HASH,
    head: OPEN_HEAD,
    now: new Date("2026-08-31T12:30:20.000Z"),
  });
  const inheritingChild = spawn(
    process.execPath,
    ["-e", "setTimeout(() => {}, 250)"],
    {
      stdio: ["ignore", "ignore", "ignore", parentLock.descriptor],
    },
  );
  const inheritingChildClosed = once(inheritingChild, "close");
  await once(inheritingChild, "spawn");
  releaseExceptionalCutoverOperationLock(parentLock);
  assertThrowsOperationLockCode(
    () =>
      acquireExceptionalCutoverOperationLock({
        stateRoot: inheritedLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:30:21.000Z"),
      }),
    "OPERATION_ALREADY_RUNNING",
  );
  await inheritingChildClosed;
  const afterChildExit = acquireExceptionalCutoverOperationLock({
    stateRoot: inheritedLockRoot,
    operation: "recovery",
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    head: HEAD,
    now: new Date("2026-08-31T12:30:22.000Z"),
  });
  releaseExceptionalCutoverOperationLock(afterChildExit);

  for (const [label, arguments_] of [
    [
      "relative-root",
      {
        stateRoot: "relative",
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:30:00.000Z"),
      },
    ],
    [
      "invalid-request",
      {
        stateRoot: successfulLockRoot,
        operation: "recovery",
        requestHash: "bad",
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:30:00.000Z"),
      },
    ],
    [
      "invalid-operation",
      {
        stateRoot: successfulLockRoot,
        operation: "deploy",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:30:00.000Z"),
      },
    ],
    [
      "invalid-act",
      {
        stateRoot: successfulLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: "bad",
        head: HEAD,
        now: new Date("2026-08-31T12:30:00.000Z"),
      },
    ],
    [
      "invalid-head",
      {
        stateRoot: successfulLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: "bad",
        now: new Date("2026-08-31T12:30:00.000Z"),
      },
    ],
    [
      "invalid-date",
      {
        stateRoot: successfulLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date(Number.NaN),
      },
    ],
  ]) {
    assertThrowsOperationLockCode(
      () =>
        acquireExceptionalCutoverOperationLock({
          ...arguments_,
          spawnSyncImpl: () => {
            throw new Error(`${label} no debe ejecutar flock.`);
          },
        }),
      "INVALID_OPERATION_LOCK_INPUT",
    );
  }

  const activeLockRoot = path.join(temporaryRoot, "active-lock");
  mkdirSync(activeLockRoot, { mode: 0o700 });
  assertThrowsOperationLockCode(
    () =>
      acquireExceptionalCutoverOperationLock({
        stateRoot: activeLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:31:00.000Z"),
        spawnSyncImpl: () => ({ status: 1, signal: null }),
      }),
    "OPERATION_ALREADY_RUNNING",
  );

  const failedLockRoot = path.join(temporaryRoot, "failed-lock");
  mkdirSync(failedLockRoot, { mode: 0o700 });
  assertThrowsOperationLockCode(
    () =>
      acquireExceptionalCutoverOperationLock({
        stateRoot: failedLockRoot,
        operation: "recovery",
        requestHash: REQUEST_HASH,
        actHash: ACT_HASH,
        head: HEAD,
        now: new Date("2026-08-31T12:32:00.000Z"),
        spawnSyncImpl: () => ({ status: 2, signal: null }),
      }),
    "OPERATION_LOCK_FAILED",
  );

  const changedLockRoot = path.join(temporaryRoot, "changed-lock");
  mkdirSync(changedLockRoot, { mode: 0o700 });
  const changedLock = acquireExceptionalCutoverOperationLock({
    stateRoot: changedLockRoot,
    operation: "recovery",
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    head: HEAD,
    now: new Date("2026-08-31T12:33:00.000Z"),
    spawnSyncImpl: () => ({ status: 0, signal: null }),
  });
  unlinkSync(changedLock.lockPath);
  writeRestricted(changedLock.lockPath, canonicalJson(changedLock.lock));
  assertThrowsOperationLockCode(
    () => assertExceptionalCutoverOperationLock(changedLock),
    "OPERATION_LOCK_CHANGED",
  );
  assertThrowsOperationLockCode(
    () => releaseExceptionalCutoverOperationLock(changedLock),
    "OPERATION_LOCK_CHANGED",
  );

  const source = readFileSync(runnerPath, "utf8");
  assert.match(source, /async function runExceptionalClosedRecovery\(\)/u);
  assert.doesNotMatch(
    source,
    /export\s+(?:async\s+)?function\s+runExceptionalClosedRecovery/u,
  );
  assert.doesNotMatch(
    source,
    /runExceptionalClosedRecovery\s*\(\s*\{[^)]*(?:deps|dependencies)/u,
  );
  assert.match(
    source,
    /const result = await runExceptionalClosedRecovery\(\);/u,
  );
  assert.match(
    source,
    /AUTORIZO RECOVERY CLOSED DE AGORBIS PARA \$\{requestHash\} CON ACTA \$\{expectedActHash\}/u,
  );
  assert.match(source, /readExceptionalClosedRecoveryCapsule\(/u);
  assert.match(source, /createExceptionalClosedRecoveryPlan\(/u);
  assert.doesNotMatch(source, /readExceptionalReleaseArtifact/u);
  assert.match(
    source,
    /import \{ runExceptionalCutoverChildProcess \} from "\.\/exceptional-cutover-child-process\.mjs";/u,
  );
  assert.doesNotMatch(source, /executeExceptionalCutoverStep/u);
  const acquireRecoveryLockSource = source.slice(
    source.indexOf("function acquireRecoveryOperationLock("),
    source.indexOf("function assertRecoveryOperationLock("),
  );
  assert.match(
    acquireRecoveryLockSource,
    /return acquireExceptionalCutoverOperationLock\(\{/u,
  );
  assert.match(acquireRecoveryLockSource, /operation: "recovery"/u);
  assert.match(acquireRecoveryLockSource, /requestHash,/u);
  assert.match(acquireRecoveryLockSource, /actHash,/u);
  assert.match(acquireRecoveryLockSource, /head,/u);
  assert.match(acquireRecoveryLockSource, /now,/u);

  const executeRecoveryStepSource = source.slice(
    source.indexOf("async function executeRecoveryStep("),
    source.indexOf("async function runExceptionalClosedRecovery()"),
  );
  assert.match(executeRecoveryStepSource, /assertRecoveryOperationLock\(/u);
  assert.match(
    executeRecoveryStepSource,
    /const expectedPlan = createExceptionalClosedRecoveryPlan\(\{/u,
  );
  assert.match(
    executeRecoveryStepSource,
    /const expectedStep = expectedPlan\[stepIndex\];/u,
  );
  assert.match(
    executeRecoveryStepSource,
    /validateExceptionalCutoverStep\(step, \{ expectedStep \}\)/u,
  );
  assert.doesNotMatch(executeRecoveryStepSource, /expectedStep:\s*step/u);
  assert.match(
    executeRecoveryStepSource,
    /runExceptionalCutoverChildProcess\(\{/u,
  );
  assert.match(
    executeRecoveryStepSource,
    /inheritedLockDescriptor: operationLock\.descriptor/u,
  );
  assert.match(
    executeRecoveryStepSource,
    /assertNoWranglerDeployConfigInAncestors\(\[\s*REPOSITORY_ROOT,\s*stateRoot,\s*capsuleRoot,?\s*\]\)/u,
  );
  assert.match(source, /fsyncDirectory\(path\.dirname\(filePath\)\)/u);

  const recoveryGitStateSource = source.slice(
    source.indexOf("async function readRecoveryGitState("),
    source.indexOf("function assertSameRecoveryGitState("),
  );
  assert.match(
    recoveryGitStateSource,
    /readRecoverableGitState\(\{\s*allowOriginAdvanceFromHead: true,?\s*\}\)/u,
  );
  assert.match(recoveryGitStateSource, /gitState\.head !== expectedHead/u);
  assert.doesNotMatch(recoveryGitStateSource, /Impl/u);

  const productionRunner = source.slice(
    source.indexOf("async function runExceptionalClosedRecovery()"),
    source.indexOf("async function main()"),
  );
  const orderedOperations = [
    "parseExceptionalClosedRecoveryArguments(process.argv.slice(2))",
    "assertRecoveryWranglerIntegrity()",
    "ensureExceptionalCutoverStateRoot({",
    "readExceptionalCutoverClaim({",
    "readExceptionalClosedRecoveryCapsule({",
    "assertNoWranglerDeployConfigInAncestors([REPOSITORY_ROOT])",
    "readRecoveryGitState(claim.head)",
    "openExceptionalCutoverTty()",
    "acquireRecoveryOperationLock({",
    "loadWranglerOAuthToken({",
    "classifyCloudflareState({ oauthToken })",
    "createExceptionalClosedRecoveryPlan({",
    "runCloudflareClosedStateCheck({",
    "writeExclusiveCanonical(receiptPath, receipt)",
  ];
  let previousIndex = -1;
  for (const operation of orderedOperations) {
    const operationIndex = productionRunner.indexOf(operation);
    assert.ok(
      operationIndex > previousIndex,
      `${operation} está fuera de orden.`,
    );
    previousIndex = operationIndex;
  }
  assert.ok(
    productionRunner.lastIndexOf("releaseRecoveryOperationLock(acquired)") >
      previousIndex,
    "El lock debe liberarse después de persistir el receipt final.",
  );

  assert.match(productionRunner, /process\.execArgv\.length !== 0/u);
  assert.match(productionRunner, /NODE_OPTIONS/u);
  assert.match(productionRunner, /NODE_DEBUG/u);
  assert.match(productionRunner, /NODE_V8_COVERAGE/u);
  assert.match(productionRunner, /workerName !== "agorbis"/u);
  assert.match(
    productionRunner,
    /accountId !== "4d78fb10c1ae65281ec851479d5045dc"/u,
  );
  assert.match(productionRunner, /\["SIGINT", "SIGTERM", "SIGHUP"\]/u);
  assert.match(productionRunner, /initial\.profile !== "closed"/u);
  assert.match(
    productionRunner,
    /final\?\.activeVersionId === claim\.closedVersionId/u,
  );
  assert.match(productionRunner, /outcome: confirmed \? "closed-confirmed"/u);
  assert.match(
    productionRunner,
    /const lockedGitState = await readRecoveryGitState\(claim\.head\);/u,
  );
  assert.match(
    productionRunner,
    /assertSameRecoveryGitState\(initialGitState, lockedGitState\);/u,
  );
  assert.doesNotMatch(productionRunner, /readExceptionalReleaseArtifact/u);

  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_OPTIONS;
  delete childEnvironment.NODE_DEBUG;
  delete childEnvironment.NODE_V8_COVERAGE;
  const sentinel = "sentinel-recovery-token-must-not-leak";
  childEnvironment.CLOUDFLARE_API_TOKEN = sentinel;
  const invalidCli = spawnSync(
    process.execPath,
    [runnerPath, "--request-hash", "invalid", "--act-hash", ACT_HASH],
    {
      cwd: repositoryRoot,
      env: childEnvironment,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(invalidCli.error, undefined);
  assert.equal(invalidCli.status, 1);
  assert.equal(invalidCli.signal, null);
  assert.equal(invalidCli.stdout, "");
  assert.match(invalidCli.stderr, /^Recovery CLOSED: Uso:/u);
  assert.doesNotMatch(invalidCli.stderr, new RegExp(sentinel, "u"));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write("Exceptional CLOSED recovery runner tests: PASS\n");
