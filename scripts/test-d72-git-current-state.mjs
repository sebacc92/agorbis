#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  D72_GIT_CURRENT_STATE_SCHEMA_VERSION,
  assertIssuedD72GitCurrentStateReceipt,
  collectD72GitCurrentState,
} from "./d72-git-current-state.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OBSERVED_AT = new Date("2026-08-31T12:00:00.000Z");

const evidence = await collectD72GitCurrentState({
  testOnly: true,
  readGitStateImpl: async () => ({
    head: HEAD,
    originMain: HEAD,
    remoteHead: HEAD,
    divergence: "0/0",
    worktreeClean: true,
    diffCheckClean: true,
    remoteObjectReachable: true,
    recoveryAuditPassed: true,
  }),
  nowImpl: () => OBSERVED_AT,
});

assert.equal(evidence.schemaVersion, D72_GIT_CURRENT_STATE_SCHEMA_VERSION);
assert.equal(evidence.head, HEAD);
assert.equal(evidence.originMain, HEAD);
assert.equal(evidence.leftCount, 0);
assert.equal(evidence.rightCount, 0);
assert.equal(evidence.worktreeClean, true);
assert.equal(evidence.diffCheckClean, true);
assert.equal(evidence.remoteObjectReachable, true);
assert.equal(evidence.recoveryAuditPassed, true);
assert.equal(evidence.observedAt, OBSERVED_AT.toISOString());
assert.match(evidence.headSha256, /^[0-9a-f]{64}$/u);
assert.equal(evidence.headSha256, evidence.originMainSha256);
assert.throws(
  () =>
    assertIssuedD72GitCurrentStateReceipt(evidence, {
      expectedHead: HEAD,
      now: OBSERVED_AT,
    }),
  /evidencia Git D72 no es válida/u,
);
assert.equal(
  assertIssuedD72GitCurrentStateReceipt(evidence, {
    allowTestReceipt: true,
    expectedHead: HEAD,
    now: OBSERVED_AT,
  }),
  evidence,
);
assert.throws(
  () =>
    assertIssuedD72GitCurrentStateReceipt(structuredClone(evidence), {
      allowTestReceipt: true,
      expectedHead: HEAD,
      now: OBSERVED_AT,
    }),
  /evidencia Git D72 no es válida/u,
);

let unsafeReaderInvoked = false;
await assert.rejects(
  () =>
    collectD72GitCurrentState({
      readGitStateImpl: async () => {
        unsafeReaderInvoked = true;
        return {};
      },
      nowImpl: () => OBSERVED_AT,
    }),
  /testOnly=true/u,
);
assert.equal(unsafeReaderInvoked, false);
await assert.rejects(
  () => collectD72GitCurrentState({ testOnly: true }),
  /reader y reloj fixtures/u,
);

for (const unsafeState of [
  { originMain: "f".repeat(40) },
  { remoteHead: "f".repeat(40) },
  { divergence: "1/0" },
  { worktreeClean: false },
  { diffCheckClean: false },
  { remoteObjectReachable: false },
  { recoveryAuditPassed: false },
]) {
  await assert.rejects(
    () =>
      collectD72GitCurrentState({
        testOnly: true,
        readGitStateImpl: async () => ({
          head: HEAD,
          originMain: HEAD,
          remoteHead: HEAD,
          divergence: "0/0",
          worktreeClean: true,
          diffCheckClean: true,
          remoteObjectReachable: true,
          recoveryAuditPassed: true,
          ...unsafeState,
        }),
        nowImpl: () => OBSERVED_AT,
      }),
    /evidencia Git D72 no es válida/u,
  );
}

console.log("D72 current Git state tests: PASS");
