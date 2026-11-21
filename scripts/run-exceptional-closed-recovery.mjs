#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalJson } from "./exceptional-release-act.mjs";
import { readExceptionalClosedRecoveryCapsule } from "./exceptional-closed-recovery-capsule.mjs";
import {
  EXCEPTIONAL_CUTOVER_NODE_VERSION,
  createExceptionalClosedRecoveryPlan,
  exceptionalCutoverConfirmationPhrase,
  validateExceptionalCutoverStep,
} from "./exceptional-release-cutover-policy.mjs";
import {
  ExceptionalCutoverError,
  assertNoWranglerDeployConfigInAncestors,
  deriveExceptionalCutoverStatePaths,
  ensureExceptionalCutoverStateRoot,
  exceptionalCutoverChildEnvironment,
  openExceptionalCutoverTty,
  readRecoverableGitState,
  resolveExceptionalCutoverStateRoot,
} from "./run-exceptional-open-cutover.mjs";
import { runExceptionalCutoverChildProcess } from "./exceptional-cutover-child-process.mjs";
import {
  loadWranglerOAuthToken,
  runCloudflareClosedStateCheck,
  runCloudflareClosedWithOpenCronsStateCheck,
  runCloudflareOpenStateCheck,
} from "./cloudflare-closed-state.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";
import { verifyExceptionalWranglerIntegrity } from "./exceptional-wrangler-integrity.mjs";
import {
  ExceptionalCutoverOperationLockError,
  acquireExceptionalCutoverOperationLock,
  assertExceptionalCutoverOperationLock,
  releaseExceptionalCutoverOperationLock,
} from "./exceptional-cutover-operation-lock.mjs";

export const EXCEPTIONAL_CLOSED_RECOVERY_JOURNAL_SCHEMA_VERSION =
  "agorbis-exceptional-closed-recovery-journal/v1";
export const EXCEPTIONAL_CLOSED_RECOVERY_RECEIPT_SCHEMA_VERSION =
  "agorbis-exceptional-closed-recovery-receipt/v1";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STATE_BYTES = 512 * 1_024;
const CLAIM_KEYS = Object.freeze([
  "actHash",
  "artifactHash",
  "claimedAtUtc",
  "closedDeploymentId",
  "closedVersionId",
  "confirmationSha256",
  "contentSha256",
  "head",
  "issuanceHash",
  "policyHash",
  "policyVersion",
  "recoveryCapsuleHash",
  "requestHash",
  "schemaVersion",
  "state",
]);

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("Recovery CLOSED exige O_NOFOLLOW.");
}

const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
const WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  (fsConstants.O_CLOEXEC ?? 0) |
  fsConstants.O_NOFOLLOW;

function recoveryError(code, message) {
  return new ExceptionalCutoverError(code, message);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function contentHash(value) {
  if (!isPlainObject(value)) throw new Error("Estado inválido.");
  const { contentSha256: _contentSha256, ...payload } = value;
  return sha256(canonicalJson(payload));
}

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected)
  );
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function assertSafeFile(metadata, label, { allowEmpty = false } = {}) {
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o7777) !== 0o600 ||
    typeof process.getuid !== "function" ||
    metadata.uid !== process.getuid() ||
    metadata.nlink !== 1 ||
    metadata.size > MAX_STATE_BYTES ||
    (!allowEmpty && metadata.size < 1)
  ) {
    throw recoveryError("UNSAFE_RECOVERY_STATE", `${label} no es seguro.`);
  }
}

function sameFile(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function readSecureCanonical(filePath) {
  const initial = lstatSync(filePath);
  assertSafeFile(initial, filePath);
  let descriptor = null;
  let source;
  let final;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    assertSafeFile(opened, filePath);
    if (!sameFile(initial, opened)) throw new Error();
    source = readFileSync(descriptor, "utf8");
    final = fstatSync(descriptor);
    if (!sameFile(opened, final) || Buffer.byteLength(source) !== final.size) {
      throw new Error();
    }
  } catch {
    throw recoveryError(
      "UNSAFE_RECOVERY_STATE",
      "Un archivo de recovery cambió durante la lectura.",
    );
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  if (!sameFile(final, lstatSync(filePath))) {
    throw recoveryError(
      "UNSAFE_RECOVERY_STATE",
      "Un archivo de recovery fue sustituido.",
    );
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw recoveryError(
      "UNSAFE_RECOVERY_STATE",
      "Un archivo de recovery no es JSON válido.",
    );
  }
  if (source !== canonicalJson(value)) {
    throw recoveryError(
      "UNSAFE_RECOVERY_STATE",
      "Un archivo de recovery no es canónico.",
    );
  }
  return value;
}

function fsyncDirectory(directoryPath) {
  const descriptor = openSync(
    directoryPath,
    fsConstants.O_RDONLY |
      (fsConstants.O_DIRECTORY ?? 0) |
      (fsConstants.O_CLOEXEC ?? 0) |
      fsConstants.O_NOFOLLOW,
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusiveCanonical(filePath, value) {
  const source = Buffer.from(canonicalJson(value), "utf8");
  if (/(?:stdout|stderr|token)/iu.test(source.toString("utf8"))) {
    throw recoveryError(
      "UNSAFE_RECOVERY_STATE",
      "El estado de recovery contiene campos prohibidos.",
    );
  }
  let descriptor = null;
  try {
    descriptor = openSync(filePath, WRITE_FLAGS, 0o600);
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < source.length) {
      offset += writeSync(descriptor, source, offset, source.length - offset);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  assertSafeFile(lstatSync(filePath), filePath);
  fsyncDirectory(path.dirname(filePath));
}

export function parseExceptionalClosedRecoveryArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 4 ||
    argv[0] !== "--request-hash" ||
    !SHA256_PATTERN.test(argv[1] ?? "") ||
    argv[2] !== "--act-hash" ||
    !SHA256_PATTERN.test(argv[3] ?? "")
  ) {
    throw recoveryError(
      "INVALID_RECOVERY_ARGUMENTS",
      "Uso: node scripts/run-exceptional-closed-recovery.mjs --request-hash <sha256> --act-hash <sha256>",
    );
  }
  return Object.freeze({ requestHash: argv[1], expectedActHash: argv[3] });
}

export function readExceptionalCutoverClaim({
  claimPath,
  requestHash,
  expectedActHash,
} = {}) {
  const claim = readSecureCanonical(claimPath);
  if (
    !sameKeys(claim, CLAIM_KEYS) ||
    claim.schemaVersion !== "agorbis-exceptional-cutover-claim/v2" ||
    claim.state !== "claimed-before-deploy" ||
    claim.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    claim.policyHash !== RELEASE_GATE_POLICY_SHA256 ||
    claim.requestHash !== requestHash ||
    claim.actHash !== expectedActHash ||
    !FULL_HEAD_PATTERN.test(claim.head ?? "") ||
    ![
      claim.requestHash,
      claim.actHash,
      claim.artifactHash,
      claim.issuanceHash,
      claim.recoveryCapsuleHash,
      claim.confirmationSha256,
    ].every((value) => SHA256_PATTERN.test(value ?? "")) ||
    !VERSION_ID_PATTERN.test(claim.closedDeploymentId ?? "") ||
    !VERSION_ID_PATTERN.test(claim.closedVersionId ?? "") ||
    !isCanonicalTimestamp(claim.claimedAtUtc) ||
    claim.confirmationSha256 !==
      sha256(
        Buffer.from(
          exceptionalCutoverConfirmationPhrase(claim.head, claim.actHash),
          "utf8",
        ),
      ) ||
    !SHA256_PATTERN.test(claim.contentSha256 ?? "") ||
    claim.contentSha256 !== contentHash(claim)
  ) {
    throw recoveryError(
      "INVALID_RECOVERY_CLAIM",
      "El claim no autoriza recovery CLOSED.",
    );
  }
  return Object.freeze(claim);
}

function acquireRecoveryOperationLock({
  stateRoot,
  requestHash,
  actHash,
  head,
  now,
}) {
  try {
    return acquireExceptionalCutoverOperationLock({
      stateRoot,
      operation: "recovery",
      requestHash,
      actHash,
      head,
      now,
    });
  } catch (error) {
    if (
      error instanceof ExceptionalCutoverOperationLockError &&
      error.code === "OPERATION_ALREADY_RUNNING"
    ) {
      throw recoveryError(
        "RECOVERY_ALREADY_RUNNING",
        "Ya existe una mutación productiva activa para Agorbis.",
      );
    }
    throw recoveryError(
      "RECOVERY_LOCK_FAILED",
      "No se pudo adquirir el lock operacional de recovery.",
    );
  }
}

function assertRecoveryOperationLock(acquired) {
  try {
    assertExceptionalCutoverOperationLock(acquired);
  } catch {
    throw recoveryError(
      "RECOVERY_LOCK_CHANGED",
      "El lock operacional de recovery cambió.",
    );
  }
}

function releaseRecoveryOperationLock(acquired) {
  try {
    releaseExceptionalCutoverOperationLock(acquired);
  } catch {
    throw recoveryError(
      "RECOVERY_LOCK_CHANGED",
      "No se pudo liberar el lock operacional de recovery.",
    );
  }
}

async function classifyCloudflareState({ oauthToken }) {
  const attempts = [
    [
      "closed",
      () =>
        runCloudflareClosedStateCheck({
          phase: "custom-domains",
          secretStage: "complete",
          oauthToken,
        }),
    ],
    [
      "closed-open-crons",
      () => runCloudflareClosedWithOpenCronsStateCheck({ oauthToken }),
    ],
    ["open", () => runCloudflareOpenStateCheck({ oauthToken })],
  ];
  for (const [profile, run] of attempts) {
    try {
      const result = await run();
      if (
        VERSION_ID_PATTERN.test(result?.activeDeploymentId ?? "") &&
        VERSION_ID_PATTERN.test(result?.activeVersionId ?? "")
      ) {
        return Object.freeze({
          profile,
          activeDeploymentId: result.activeDeploymentId,
          activeVersionId: result.activeVersionId,
        });
      }
    } catch {
      // Se prueban todos los perfiles GET-only antes de clasificar UNKNOWN.
    }
  }
  return Object.freeze({
    profile: "unknown",
    activeDeploymentId: null,
    activeVersionId: null,
  });
}

function assertSameClaim(initialClaim, currentClaim) {
  if (canonicalJson(initialClaim) !== canonicalJson(currentClaim)) {
    throw recoveryError(
      "RECOVERY_CLAIM_CHANGED",
      "El claim cambió antes de completar recovery CLOSED.",
    );
  }
}

async function readRecoveryGitState(expectedHead) {
  let gitState;
  try {
    gitState = await readRecoverableGitState({
      allowOriginAdvanceFromHead: true,
    });
  } catch {
    throw recoveryError(
      "RECOVERY_GIT_NOT_RECOVERABLE",
      "Git no está limpio, alineado 0/0 y recuperable desde origin/main.",
    );
  }
  if (gitState.head !== expectedHead) {
    throw recoveryError(
      "RECOVERY_GIT_HEAD_MISMATCH",
      "El HEAD recuperable no coincide con el HEAD de la cápsula.",
    );
  }
  return gitState;
}

function assertSameRecoveryGitState(initialGitState, currentGitState) {
  if (canonicalJson(initialGitState) !== canonicalJson(currentGitState)) {
    throw recoveryError(
      "RECOVERY_GIT_CHANGED",
      "Git cambió antes de completar recovery CLOSED.",
    );
  }
}

function readSameRecoveryInputs({
  claimPath,
  requestHash,
  expectedActHash,
  initialClaim,
  stateRoot,
}) {
  const currentClaim = readExceptionalCutoverClaim({
    claimPath,
    requestHash,
    expectedActHash,
  });
  assertSameClaim(initialClaim, currentClaim);
  return readExceptionalClosedRecoveryCapsule({
    stateRoot,
    requestHash,
    actHash: initialClaim.actHash,
    issuanceHash: initialClaim.issuanceHash,
    artifactHash: initialClaim.artifactHash,
    closedDeploymentId: initialClaim.closedDeploymentId,
    closedVersionId: initialClaim.closedVersionId,
    head: initialClaim.head,
    expectedCapsuleHash: initialClaim.recoveryCapsuleHash,
  });
}

function assertRecoveryWranglerIntegrity(step) {
  let integrity;
  try {
    integrity = verifyExceptionalWranglerIntegrity({
      repositoryRoot: REPOSITORY_ROOT,
    });
    if (
      step !== undefined &&
      realpathSync(step?.arguments?.[0] ?? "") !==
        integrity.executionEntrypointRealpath
    ) {
      throw new Error();
    }
  } catch {
    throw recoveryError(
      "WRANGLER_INTEGRITY_FAILED",
      "Wrangler cambió antes del recovery.",
    );
  }
  return integrity;
}

async function executeRecoveryStep({
  step,
  stepIndex,
  env,
  stateRoot,
  capsule,
  capsuleRoot,
  initialGitState,
  operationLock,
}) {
  assertRecoveryOperationLock(operationLock);
  const currentGitState = await readRecoveryGitState(capsule.manifest.head);
  assertSameRecoveryGitState(initialGitState, currentGitState);
  assertRecoveryWranglerIntegrity(step);
  assertNoWranglerDeployConfigInAncestors([
    REPOSITORY_ROOT,
    stateRoot,
    capsuleRoot,
  ]);
  const expectedPlan = createExceptionalClosedRecoveryPlan({
    repositoryRoot: REPOSITORY_ROOT,
    capsuleRoot,
    stateRoot,
    nodeExecutable: process.execPath,
    capsuleManifest: capsule.manifest,
  });
  const expectedStep = expectedPlan[stepIndex];
  const errors = validateExceptionalCutoverStep(step, { expectedStep });
  if (errors.length > 0) {
    throw recoveryError("UNSAFE_RECOVERY_STEP", "Paso de recovery inválido.");
  }
  await runExceptionalCutoverChildProcess({
    command: step.command,
    arguments: step.arguments,
    stepId: step.id,
    env,
    cwd: stateRoot,
    inheritedLockDescriptor: operationLock.descriptor,
  });
}

async function runExceptionalClosedRecovery() {
  if (
    process.versions.node !== EXCEPTIONAL_CUTOVER_NODE_VERSION ||
    process.execArgv.length !== 0 ||
    ["NODE_OPTIONS", "NODE_DEBUG", "NODE_V8_COVERAGE"].some(
      (name) => typeof process.env[name] === "string" && process.env[name],
    )
  ) {
    throw recoveryError(
      "UNSAFE_RECOVERY_RUNTIME",
      "Recovery exige Node 22.22.0 sin instrumentación.",
    );
  }
  const { requestHash, expectedActHash } =
    parseExceptionalClosedRecoveryArguments(process.argv.slice(2));
  assertRecoveryWranglerIntegrity();
  const requestedStateRoot = resolveExceptionalCutoverStateRoot();
  const securedState = ensureExceptionalCutoverStateRoot({
    stateRoot: requestedStateRoot,
    worktreeRoot: REPOSITORY_ROOT,
  });
  const stateRoot = securedState.stateRoot;
  const statePaths = deriveExceptionalCutoverStatePaths({
    stateRoot,
    requestHash,
  });
  const claim = readExceptionalCutoverClaim({
    claimPath: statePaths.claimPath,
    requestHash,
    expectedActHash,
  });
  const capsule = readExceptionalClosedRecoveryCapsule({
    stateRoot,
    requestHash,
    actHash: claim.actHash,
    issuanceHash: claim.issuanceHash,
    artifactHash: claim.artifactHash,
    closedDeploymentId: claim.closedDeploymentId,
    closedVersionId: claim.closedVersionId,
    head: claim.head,
    expectedCapsuleHash: claim.recoveryCapsuleHash,
  });
  if (
    capsule.manifest.workerName !== "agorbis" ||
    capsule.manifest.accountId !== "4d78fb10c1ae65281ec851479d5045dc"
  ) {
    throw recoveryError(
      "WRONG_RECOVERY_TARGET",
      "La cápsula no apunta a la cuenta/Worker exactos.",
    );
  }
  assertNoWranglerDeployConfigInAncestors([REPOSITORY_ROOT]);
  const initialGitState = await readRecoveryGitState(claim.head);
  const confirmation = `AUTORIZO RECOVERY CLOSED DE AGORBIS PARA ${requestHash} CON ACTA ${expectedActHash}`;
  const tty = openExceptionalCutoverTty();
  try {
    if (tty.readLine({ prompt: confirmation }) !== confirmation) {
      throw recoveryError(
        "RECOVERY_CONFIRMATION_REJECTED",
        "La confirmación de recovery no coincide.",
      );
    }
  } finally {
    tty.close();
  }
  const now = new Date();
  const acquired = acquireRecoveryOperationLock({
    stateRoot,
    requestHash,
    actHash: expectedActHash,
    head: claim.head,
    now,
  });
  try {
    assertRecoveryOperationLock(acquired);
    const lockedGitState = await readRecoveryGitState(claim.head);
    assertSameRecoveryGitState(initialGitState, lockedGitState);
    assertNoWranglerDeployConfigInAncestors([
      REPOSITORY_ROOT,
      stateRoot,
      capsule.capsuleRoot,
    ]);
    const attemptId = `${now.toISOString().replaceAll(/[^0-9]/gu, "")}-${randomBytes(16).toString("hex")}`;
    const journalPath = path.join(
      stateRoot,
      `${requestHash}.recovery.${attemptId}.journal.json`,
    );
    const receiptPath = path.join(
      stateRoot,
      `${requestHash}.recovery.${attemptId}.receipt.json`,
    );
    const journalPayload = {
      schemaVersion: EXCEPTIONAL_CLOSED_RECOVERY_JOURNAL_SCHEMA_VERSION,
      attemptId,
      requestHash,
      actHash: expectedActHash,
      claimHash: claim.contentSha256,
      capsuleHash: capsule.capsuleHash,
      startedAtUtc: now.toISOString(),
    };
    const journal = {
      ...journalPayload,
      contentSha256: contentHash(journalPayload),
    };
    readSameRecoveryInputs({
      claimPath: statePaths.claimPath,
      requestHash,
      expectedActHash,
      initialClaim: claim,
      stateRoot,
    });
    assertRecoveryOperationLock(acquired);
    writeExclusiveCanonical(journalPath, journal);
    const ignoredSignals = new Set();
    const handlers = new Map(
      ["SIGINT", "SIGTERM", "SIGHUP"].map((signalName) => [
        signalName,
        () => ignoredSignals.add(signalName),
      ]),
    );
    for (const [signalName, handler] of handlers)
      process.on(signalName, handler);
    let receipt;
    try {
      const env = exceptionalCutoverChildEnvironment(process.env);
      readSameRecoveryInputs({
        claimPath: statePaths.claimPath,
        requestHash,
        expectedActHash,
        initialClaim: claim,
        stateRoot,
      });
      assertRecoveryOperationLock(acquired);
      assertRecoveryWranglerIntegrity();
      assertNoWranglerDeployConfigInAncestors([
        REPOSITORY_ROOT,
        stateRoot,
        capsule.capsuleRoot,
      ]);
      const oauthToken = await loadWranglerOAuthToken({
        cwd: REPOSITORY_ROOT,
        env,
        nodeExecutable: process.execPath,
        wranglerEntrypoint: path.join(
          REPOSITORY_ROOT,
          "node_modules",
          "wrangler",
          "wrangler-dist",
          "cli.js",
        ),
      });
      assertRecoveryOperationLock(acquired);
      const initial = await classifyCloudflareState({ oauthToken });
      const stepRecords = [];
      if (
        initial.profile !== "closed" ||
        initial.activeVersionId !== claim.closedVersionId
      ) {
        const plan = createExceptionalClosedRecoveryPlan({
          repositoryRoot: REPOSITORY_ROOT,
          capsuleRoot: capsule.capsuleRoot,
          stateRoot,
          nodeExecutable: process.execPath,
          capsuleManifest: capsule.manifest,
        });
        for (const [stepIndex, step] of plan.entries()) {
          try {
            readSameRecoveryInputs({
              claimPath: statePaths.claimPath,
              requestHash,
              expectedActHash,
              initialClaim: claim,
              stateRoot,
            });
            await executeRecoveryStep({
              step,
              stepIndex,
              env,
              stateRoot,
              capsule,
              capsuleRoot: capsule.capsuleRoot,
              initialGitState,
              operationLock: acquired,
            });
            stepRecords.push({ id: step.id, status: "PASS" });
          } catch {
            stepRecords.push({ id: step.id, status: "FAIL" });
          }
        }
      }
      readSameRecoveryInputs({
        claimPath: statePaths.claimPath,
        requestHash,
        expectedActHash,
        initialClaim: claim,
        stateRoot,
      });
      assertRecoveryOperationLock(acquired);
      let final = null;
      try {
        final = await runCloudflareClosedStateCheck({
          phase: "custom-domains",
          secretStage: "complete",
          oauthToken,
        });
      } catch {
        // El receipt queda unconfirmed y habilita un retry explícito.
      }
      const confirmed =
        VERSION_ID_PATTERN.test(final?.activeDeploymentId ?? "") &&
        final?.activeVersionId === claim.closedVersionId;
      readSameRecoveryInputs({
        claimPath: statePaths.claimPath,
        requestHash,
        expectedActHash,
        initialClaim: claim,
        stateRoot,
      });
      assertRecoveryOperationLock(acquired);
      const receiptPayload = {
        schemaVersion: EXCEPTIONAL_CLOSED_RECOVERY_RECEIPT_SCHEMA_VERSION,
        attemptId,
        outcome: confirmed ? "closed-confirmed" : "closed-unconfirmed",
        requestHash,
        actHash: expectedActHash,
        claimHash: claim.contentSha256,
        capsuleHash: capsule.capsuleHash,
        initialProfile: initial.profile,
        baselineClosedDeploymentId: claim.closedDeploymentId,
        baselineClosedVersionId: claim.closedVersionId,
        finalClosedDeploymentId: final?.activeDeploymentId ?? null,
        finalClosedVersionId: final?.activeVersionId ?? null,
        steps: stepRecords,
        signalsObserved: [...ignoredSignals].sort(),
        completedAtUtc: new Date().toISOString(),
      };
      receipt = {
        ...receiptPayload,
        contentSha256: contentHash(receiptPayload),
      };
      assertRecoveryOperationLock(acquired);
      writeExclusiveCanonical(receiptPath, receipt);
      if (!confirmed) {
        throw recoveryError(
          "RECOVERY_UNCONFIRMED",
          "Recovery CLOSED no quedó confirmado; el claim permite retry.",
        );
      }
    } finally {
      for (const [signalName, handler] of handlers)
        process.off(signalName, handler);
    }
    return Object.freeze({ receiptPath, receipt: Object.freeze(receipt) });
  } finally {
    releaseRecoveryOperationLock(acquired);
  }
}

async function main() {
  const result = await runExceptionalClosedRecovery();
  process.stdout.write(
    `Recovery CLOSED confirmado: deployment=${result.receipt.finalClosedDeploymentId}, version=${result.receipt.finalClosedVersionId}.\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const message =
      error instanceof ExceptionalCutoverError
        ? error.message
        : "Fallo interno saneado de recovery CLOSED.";
    process.stderr.write(`Recovery CLOSED: ${message}\n`);
    process.exitCode = 1;
  });
}
