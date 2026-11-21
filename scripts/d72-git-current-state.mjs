#!/usr/bin/env node

import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertRecoverableGitReaderRuntime,
  readRecoverableGitState,
} from "./run-exceptional-open-cutover.mjs";

export const D72_GIT_CURRENT_STATE_SCHEMA_VERSION =
  "agorbis-d72-git-current-state/v1";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const D72_GIT_RECEIPT_MAX_AGE_MS = 5 * 60 * 1_000;
const ISSUED_PRODUCTION_GIT_RECEIPTS = new WeakSet();
const ISSUED_TEST_ONLY_GIT_RECEIPTS = new WeakSet();
const RECEIPT_KEYS = Object.freeze([
  "diffCheckClean",
  "head",
  "headSha256",
  "leftCount",
  "observedAt",
  "originMain",
  "originMainSha256",
  "recoveryAuditPassed",
  "remoteObjectReachable",
  "rightCount",
  "schemaVersion",
  "worktreeClean",
]);

function invariant(condition) {
  if (!condition) throw new Error("La evidencia Git D72 no es válida.");
}

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
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function canonicalInstant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? parsed
    : null;
}

function assertReceiptStructure(receipt) {
  invariant(sameKeys(receipt, RECEIPT_KEYS));
  invariant(
    receipt.schemaVersion === D72_GIT_CURRENT_STATE_SCHEMA_VERSION &&
      FULL_HEAD_PATTERN.test(receipt.head ?? "") &&
      receipt.originMain === receipt.head &&
      SHA256_PATTERN.test(receipt.headSha256 ?? "") &&
      receipt.headSha256 ===
        createHash("sha256").update(receipt.head).digest("hex") &&
      receipt.originMainSha256 === receipt.headSha256 &&
      receipt.leftCount === 0 &&
      receipt.rightCount === 0 &&
      receipt.worktreeClean === true &&
      receipt.diffCheckClean === true &&
      receipt.remoteObjectReachable === true &&
      receipt.recoveryAuditPassed === true &&
      canonicalInstant(receipt.observedAt) !== null,
  );
}

export function assertIssuedD72GitCurrentStateReceipt(
  receipt,
  { allowTestReceipt = false, expectedHead, now = new Date() } = {},
) {
  invariant(typeof allowTestReceipt === "boolean");
  assertReceiptStructure(receipt);
  invariant(
    ISSUED_PRODUCTION_GIT_RECEIPTS.has(receipt) ||
      (allowTestReceipt && ISSUED_TEST_ONLY_GIT_RECEIPTS.has(receipt)),
  );
  invariant(
    expectedHead === undefined ||
      (FULL_HEAD_PATTERN.test(expectedHead) && receipt.head === expectedHead),
  );
  const observedAt = canonicalInstant(receipt.observedAt);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  invariant(
    Number.isFinite(current.getTime()) &&
      observedAt <= current &&
      current.getTime() - observedAt.getTime() <= D72_GIT_RECEIPT_MAX_AGE_MS,
  );
  return receipt;
}

export async function collectD72GitCurrentState(options = {}) {
  invariant(isPlainObject(options));
  const testOnly = options.testOnly === true;
  const customSeamRequested = [
    "repositoryRoot",
    "readGitStateImpl",
    "nowImpl",
  ].some((key) => Object.hasOwn(options, key));
  if (customSeamRequested && !testOnly) {
    throw new Error("Los seams del collector Git D72 requieren testOnly=true.");
  }
  if (
    testOnly &&
    (typeof options.readGitStateImpl !== "function" ||
      typeof options.nowImpl !== "function")
  ) {
    throw new Error(
      "El collector Git D72 testOnly exige reader y reloj fixtures explícitos.",
    );
  }
  const repositoryRoot = testOnly
    ? (options.repositoryRoot ?? REPOSITORY_ROOT)
    : REPOSITORY_ROOT;
  const readGitStateImpl = testOnly
    ? options.readGitStateImpl
    : readRecoverableGitState;
  const nowImpl = testOnly ? options.nowImpl : () => new Date();
  invariant(typeof readGitStateImpl === "function");
  invariant(typeof nowImpl === "function");
  assertRecoverableGitReaderRuntime();
  const state = await readGitStateImpl({ repositoryRoot });
  const observedAt = nowImpl();
  invariant(observedAt instanceof Date && !Number.isNaN(observedAt.getTime()));
  invariant(
    state !== null &&
      typeof state === "object" &&
      !Array.isArray(state) &&
      FULL_HEAD_PATTERN.test(state.head ?? "") &&
      state.originMain === state.head &&
      state.remoteHead === state.head &&
      state.divergence === "0/0" &&
      state.worktreeClean === true &&
      state.diffCheckClean === true &&
      state.remoteObjectReachable === true &&
      state.recoveryAuditPassed === true,
  );
  const receipt = Object.freeze({
    schemaVersion: D72_GIT_CURRENT_STATE_SCHEMA_VERSION,
    head: state.head,
    headSha256: createHash("sha256").update(state.head).digest("hex"),
    originMain: state.originMain,
    originMainSha256: createHash("sha256")
      .update(state.originMain)
      .digest("hex"),
    leftCount: 0,
    rightCount: 0,
    worktreeClean: true,
    diffCheckClean: true,
    remoteObjectReachable: true,
    recoveryAuditPassed: true,
    observedAt: observedAt.toISOString(),
  });
  assertReceiptStructure(receipt);
  if (testOnly) {
    ISSUED_TEST_ONLY_GIT_RECEIPTS.add(receipt);
  } else {
    ISSUED_PRODUCTION_GIT_RECEIPTS.add(receipt);
  }
  return receipt;
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("El lector Git D72 no acepta argumentos.");
  }
  const evidence = await collectD72GitCurrentState();
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch(() => {
    process.stderr.write("Git D72 actual: BLOQUEADO\n");
    process.exitCode = 1;
  });
}
