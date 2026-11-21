#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  chownSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as exceptionalActIssuanceModule from "./exceptional-act-issuance.mjs";
import {
  EXCEPTIONAL_ACT_ISSUANCE_SCHEMA_VERSION,
  createExceptionalActIssuance,
  deriveExceptionalActIssuancePath,
  exceptionalActIssuanceContentHash,
  readExceptionalActIssuance,
  resolveExceptionalActIssuanceStateRoot,
  validateExceptionalActIssuance,
  writeExceptionalActIssuanceTestFixture,
} from "./exceptional-act-issuance.mjs";
import {
  EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION,
  EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  canonicalJson,
  createExceptionalReleaseAct,
  exceptionalReleaseActContentHash,
  exceptionalReleaseRequestHash,
  readExceptionalReleaseActFile,
  readExceptionalReleaseRequestFile,
  renderExceptionalReleaseActMarkdown,
  validateExceptionalReleaseAct,
  validateExceptionalReleaseRequest,
  writeExceptionalReleaseActFiles,
} from "./exceptional-release-act.mjs";
import {
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
  exceptionalReleaseArtifactHash,
  validateExceptionalReleaseArtifactManifest,
} from "./exceptional-release-artifact.mjs";
import {
  EXCEPTIONAL_RELEASE_STEP_IDS,
  requiredRiskConfirmationPhrases,
} from "./exceptional-open-release-runner-policy.mjs";
import {
  EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY,
} from "./exceptional-wrangler-integrity.mjs";
import {
  AUTHORIZED_RISK_OWNER,
  EVIDENCE_STATUS,
  GATE_POLICY,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";

assert.equal(
  process.versions.node,
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  `Este test debe ejecutarse con Node ${EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION}.`,
);

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const BASE_ACT_TIME = new Date("2026-08-31T12:00:00.000Z");
const EMPTY_SHA256 = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-exceptional-act-issuance-test-"),
);
let fixtureCounter = 0;

assert.equal(
  Object.hasOwn(exceptionalActIssuanceModule, "issueExceptionalAct"),
  false,
);
assert.equal(
  typeof exceptionalActIssuanceModule.prepareExceptionalActIssuance,
  "function",
);
assert.equal(
  typeof exceptionalActIssuanceModule.writeExceptionalActIssuanceTestFixture,
  "function",
);

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function riskFor(gateId) {
  const definition = getReleaseGateDefinition(gateId);
  assert.ok(definition, `Falta el gate de fixture ${gateId}.`);
  return {
    gateId,
    evidenceStatus: definition.evidenceStatus,
    rawResult: definition.rawResult,
    requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
    acceptedConsequence: definition.consequence,
    reviewRequiredBy: definition.reviewRequiredBy,
  };
}

function createRequest(timestampUtc) {
  return {
    schemaVersion: EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head: HEAD,
    owner: AUTHORIZED_RISK_OWNER,
    timestampUtc,
    deploymentAuthorized: false,
    risks: OWNER_WAIVER_CANDIDATE_GATE_IDS.map(riskFor),
  };
}

function createArtifactManifest({ requestHash, createdAtUtc, salt }) {
  const fileHash = (name) => sha256(`${salt}:${name}`);
  const payload = {
    schemaVersion: EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
    head: HEAD,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash,
    createdAtUtc,
    nodeVersion: EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
    wranglerVersion: EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
    wranglerLockHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash,
    wranglerClosureHash: EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
    wranglerEntrypointHash: EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
    files: [
      {
        path: "dist/_worker.js",
        size: 1,
        sha256: fileHash("dist/_worker.js"),
      },
      {
        path: "exceptional-release-empty.env",
        size: 0,
        sha256: EMPTY_SHA256,
      },
      {
        path: "server/entry.cloudflare-workers.js",
        size: 1,
        sha256: fileHash("server/entry.cloudflare-workers.js"),
      },
      {
        path: "wrangler.crons-closed.jsonc",
        size: 1,
        sha256: fileHash("wrangler.crons-closed.jsonc"),
      },
      {
        path: "wrangler.crons-open.jsonc",
        size: 1,
        sha256: fileHash("wrangler.crons-open.jsonc"),
      },
      {
        path: "wrangler.jsonc",
        size: 1,
        sha256: fileHash("wrangler.jsonc"),
      },
      {
        path: "wrangler.traffic.jsonc",
        size: 1,
        sha256: fileHash("wrangler.traffic.jsonc"),
      },
    ],
  };
  return {
    ...payload,
    contentSha256: exceptionalReleaseArtifactHash(payload),
  };
}

function createGateResults() {
  return RELEASE_GATE_POLICY.gates.map((definition) => ({
    gateId: definition.id,
    evidenceStatus:
      definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE
        ? EVIDENCE_STATUS.PASS
        : definition.evidenceStatus,
    rawResult:
      definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE
        ? RAW_RESULT.PASS
        : RAW_RESULT.FAIL,
  }));
}

function createConfirmations(request) {
  return request.risks.map(({ gateId }) => ({
    gateId,
    source: "/dev/tty",
    statements: requiredRiskConfirmationPhrases(gateId, request.head),
  }));
}

function writeRestricted(filePath, source) {
  writeFileSync(filePath, source, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function replaceRestricted(filePath, source) {
  unlinkSync(filePath);
  writeRestricted(filePath, source);
}

function createFixture(label, offsetMs = 0) {
  fixtureCounter += 1;
  const fixtureRoot = path.join(
    temporaryRoot,
    `${String(fixtureCounter).padStart(2, "0")}-${label}`,
  );
  const worktreeRoot = path.join(fixtureRoot, "worktree");
  const evidenceRoot = path.join(fixtureRoot, "evidence");
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  mkdirSync(evidenceRoot, { mode: 0o700 });

  const actTime = new Date(BASE_ACT_TIME.getTime() + offsetMs);
  const requestTime = new Date(actTime.getTime() - 30 * 60 * 1_000);
  const request = createRequest(requestTime.toISOString());
  const requestHash = exceptionalReleaseRequestHash(request);
  const artifactManifest = createArtifactManifest({
    requestHash,
    createdAtUtc: new Date(actTime.getTime() - 60_000).toISOString(),
    salt: label,
  });
  const act = createExceptionalReleaseAct({
    request,
    currentHead: HEAD,
    artifactHash: artifactManifest.contentSha256,
    gateResults: createGateResults(),
    confirmations: createConfirmations(request),
    commands: EXCEPTIONAL_RELEASE_STEP_IDS.map((commandLabel) => ({
      label: commandLabel,
      exitCode: 0,
    })),
    now: actTime,
  });
  const requestPath = path.join(evidenceRoot, `${label}.json`);
  writeRestricted(requestPath, canonicalJson(request));
  const writtenAct = writeExceptionalReleaseActFiles({
    requestPath,
    worktreeRoot,
    act,
  });
  return {
    fixtureRoot,
    worktreeRoot,
    evidenceRoot,
    requestPath,
    request,
    requestHash,
    artifactManifest,
    act,
    actTime,
    ...writtenAct,
  };
}

function assertOutside(candidate, worktreeRoot) {
  const relative = path.relative(
    path.resolve(worktreeRoot),
    path.resolve(candidate),
  );
  assert.ok(
    relative === ".." || relative.startsWith(`..${path.sep}`),
    `${candidate} debe quedar fuera del worktree.`,
  );
}

function assertRestrictedFile(filePath) {
  const metadata = lstatSync(filePath);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.mode & 0o7777, 0o600);
  assert.equal(metadata.nlink, 1);
  if (typeof process.getuid === "function") {
    assert.equal(metadata.uid, process.getuid());
  }
  return metadata;
}

function assertRestrictedDirectory(directoryPath) {
  const metadata = lstatSync(directoryPath);
  assert.equal(metadata.isDirectory(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.mode & 0o7777, 0o700);
  if (typeof process.getuid === "function") {
    assert.equal(metadata.uid, process.getuid());
  }
  return metadata;
}

function readIssued(fixture, stateRoot, overrides = {}) {
  return readExceptionalActIssuance({
    requestPath: fixture.requestPath,
    stateRoot,
    request: fixture.request,
    act: fixture.act,
    artifactManifest: fixture.artifactManifest,
    expectedActHash: fixture.act.contentSha256,
    ...overrides,
  });
}

function readActSurface(fixture, overrides = {}) {
  return readExceptionalReleaseActFile({
    actPath: fixture.jsonPath,
    worktreeRoot: fixture.worktreeRoot,
    currentHead: HEAD,
    now: new Date(fixture.actTime.getTime() + 2_000),
    ...overrides,
  });
}

function restoreActSurfaces(fixture, act = fixture.act) {
  replaceRestricted(fixture.jsonPath, canonicalJson(act));
  replaceRestricted(
    fixture.markdownPath,
    renderExceptionalReleaseActMarkdown(act),
  );
}

function resealAct(act, mutate) {
  const resealed = structuredClone(act);
  mutate(resealed);
  resealed.contentSha256 = exceptionalReleaseActContentHash(resealed);
  return resealed;
}

try {
  const fixture = createFixture("happy");
  const stateRoot = path.join(temporaryRoot, "noncanonical-fixture-state");

  assert.equal(
    fixture.request.schemaVersion,
    EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  );
  assert.equal(
    fixture.act.schemaVersion,
    EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION,
  );
  assert.deepEqual(
    validateExceptionalReleaseRequest(fixture.request, {
      currentHead: HEAD,
      now: fixture.actTime,
    }),
    [],
  );
  assert.deepEqual(validateExceptionalReleaseAct(fixture.act), []);
  assert.deepEqual(
    validateExceptionalReleaseArtifactManifest(fixture.artifactManifest, {
      expectedHead: HEAD,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: fixture.requestHash,
      expectedArtifactHash: fixture.artifactManifest.contentSha256,
    }),
    [],
  );
  assert.equal(
    fixture.artifactManifest.wranglerLockHash,
    EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.lockHash,
  );
  assert.equal(
    fixture.artifactManifest.wranglerClosureHash,
    EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY.closureHash,
  );
  assert.equal(
    fixture.artifactManifest.wranglerEntrypointHash,
    EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  );

  for (const filePath of [fixture.jsonPath, fixture.markdownPath]) {
    assertOutside(filePath, fixture.worktreeRoot);
    assertRestrictedFile(filePath);
  }
  assert.deepEqual(
    readExceptionalReleaseRequestFile({
      requestPath: fixture.requestPath,
      worktreeRoot: fixture.worktreeRoot,
      currentHead: HEAD,
      now: fixture.actTime,
    }),
    fixture.request,
  );
  assert.deepEqual(
    readExceptionalReleaseActFile({
      actPath: fixture.jsonPath,
      worktreeRoot: fixture.worktreeRoot,
      currentHead: HEAD,
      now: new Date(fixture.actTime.getTime() + 1),
    }),
    fixture.act,
  );

  const createdRecord = createExceptionalActIssuance({
    request: fixture.request,
    act: fixture.act,
    artifactManifest: fixture.artifactManifest,
  });
  assert.equal(
    createdRecord.schemaVersion,
    EXCEPTIONAL_ACT_ISSUANCE_SCHEMA_VERSION,
  );
  assert.equal(createdRecord.requestHash, fixture.requestHash);
  assert.equal(createdRecord.actHash, fixture.act.contentSha256);
  assert.equal(
    createdRecord.artifactHash,
    fixture.artifactManifest.contentSha256,
  );
  assert.equal(
    createdRecord.contentSha256,
    exceptionalActIssuanceContentHash(createdRecord),
  );
  assert.deepEqual(
    validateExceptionalActIssuance(createdRecord, {
      request: fixture.request,
      act: fixture.act,
      artifactManifest: fixture.artifactManifest,
      expectedActHash: fixture.act.contentSha256,
    }),
    [],
  );

  assert.throws(
    () =>
      writeExceptionalActIssuanceTestFixture({
        requestPath: fixture.requestPath,
        request: fixture.request,
        act: fixture.act,
        artifactManifest: fixture.artifactManifest,
        stateRoot: resolveExceptionalActIssuanceStateRoot(),
      }),
    /no puede escribir el state root canónico/i,
  );
  assert.throws(
    () =>
      writeExceptionalActIssuanceTestFixture({
        requestPath: fixture.requestPath,
        request: fixture.request,
        act: fixture.act,
        artifactManifest: fixture.artifactManifest,
      }),
    /stateRoot absoluto no canónico explícito/i,
  );

  const issued = writeExceptionalActIssuanceTestFixture({
    requestPath: fixture.requestPath,
    request: fixture.request,
    act: fixture.act,
    artifactManifest: fixture.artifactManifest,
    stateRoot,
  });
  assert.deepEqual(issued.issuance, createdRecord);
  assert.equal(
    issued.issuancePath,
    deriveExceptionalActIssuancePath({
      stateRoot,
      requestHash: fixture.requestHash,
    }),
  );
  assert.equal(
    path.basename(issued.issuancePath),
    `${fixture.requestHash}.issued.json`,
  );
  assertOutside(issued.issuancePath, fixture.worktreeRoot);
  assertRestrictedDirectory(stateRoot);
  assertRestrictedDirectory(path.join(stateRoot, "issued"));
  assertRestrictedFile(issued.issuancePath);
  assert.equal(
    readFileSync(issued.issuancePath, "utf8"),
    canonicalJson(createdRecord),
  );

  const readHappy = readIssued(fixture, stateRoot);
  assert.deepEqual(readHappy.issuance, createdRecord);
  assert.equal(readHappy.issuancePath, issued.issuancePath);
  assert.equal(Object.isFrozen(readHappy.issuance), true);
  assert.throws(
    () => readIssued(fixture, stateRoot, { expectedActHash: undefined }),
    /actHash externo/i,
  );
  assert.throws(
    () =>
      readIssued(fixture, stateRoot, {
        expectedActHash: "f".repeat(64),
      }),
    /actHash externo/i,
  );

  const beforeExclusive = lstatSync(issued.issuancePath);
  const beforeExclusiveSource = readFileSync(issued.issuancePath, "utf8");
  assert.throws(
    () =>
      writeExceptionalActIssuanceTestFixture({
        requestPath: fixture.requestPath,
        request: fixture.request,
        act: fixture.act,
        artifactManifest: fixture.artifactManifest,
        stateRoot,
      }),
    (error) => error?.code === "EEXIST",
  );
  const afterExclusive = lstatSync(issued.issuancePath);
  assert.equal(afterExclusive.dev, beforeExclusive.dev);
  assert.equal(afterExclusive.ino, beforeExclusive.ino);
  assert.equal(afterExclusive.mtimeMs, beforeExclusive.mtimeMs);
  assert.equal(
    readFileSync(issued.issuancePath, "utf8"),
    beforeExclusiveSource,
  );

  const secondFixture = createFixture("second-request", 1_000);
  assert.notEqual(secondFixture.requestHash, fixture.requestHash);
  const secondIssued = writeExceptionalActIssuanceTestFixture({
    requestPath: secondFixture.requestPath,
    request: secondFixture.request,
    act: secondFixture.act,
    artifactManifest: secondFixture.artifactManifest,
    stateRoot,
  });
  assert.notEqual(secondIssued.issuancePath, issued.issuancePath);
  assert.equal(
    path.basename(secondIssued.issuancePath),
    `${secondFixture.requestHash}.issued.json`,
  );
  assert.deepEqual(
    readIssued(secondFixture, stateRoot).issuance,
    secondIssued.issuance,
  );
  assert.deepEqual(readIssued(fixture, stateRoot).issuance, issued.issuance);

  const recordBackupPath = `${issued.issuancePath}.missing`;
  renameSync(issued.issuancePath, recordBackupPath);
  assert.throws(() => readIssued(fixture, stateRoot), { code: "ENOENT" });
  renameSync(recordBackupPath, issued.issuancePath);

  const originalRecordSource = readFileSync(issued.issuancePath, "utf8");
  const tamperedRecord = {
    ...issued.issuance,
    artifactHash: "f".repeat(64),
  };
  replaceRestricted(issued.issuancePath, canonicalJson(tamperedRecord));
  assert.throws(
    () => readIssued(fixture, stateRoot),
    /issuance excepcional inválido/i,
  );
  replaceRestricted(issued.issuancePath, originalRecordSource);

  const resealedIssuance = {
    ...issued.issuance,
    issuedAtUtc: new Date(
      new Date(issued.issuance.issuedAtUtc).getTime() + 1_000,
    ).toISOString(),
  };
  resealedIssuance.contentSha256 =
    exceptionalActIssuanceContentHash(resealedIssuance);
  assert.equal(
    resealedIssuance.contentSha256,
    exceptionalActIssuanceContentHash(resealedIssuance),
  );
  replaceRestricted(issued.issuancePath, canonicalJson(resealedIssuance));
  assert.throws(
    () => readIssued(fixture, stateRoot),
    /timestamps del issuance/i,
  );
  replaceRestricted(issued.issuancePath, originalRecordSource);

  const markdownBackupPath = `${fixture.markdownPath}.missing`;
  renameSync(fixture.markdownPath, markdownBackupPath);
  assert.throws(() => readIssued(fixture, stateRoot), { code: "ENOENT" });
  renameSync(markdownBackupPath, fixture.markdownPath);
  const originalMarkdown = readFileSync(fixture.markdownPath, "utf8");
  replaceRestricted(fixture.markdownPath, `${originalMarkdown}alterado\n`);
  assert.throws(() => readIssued(fixture, stateRoot), /Markdown no coincide/i);
  replaceRestricted(fixture.markdownPath, originalMarkdown);

  const timestampAct = resealAct(fixture.act, (candidate) => {
    candidate.timestampUtc = new Date(
      new Date(candidate.timestampUtc).getTime() + 1_000,
    ).toISOString();
    candidate.expiresAtUtc = new Date(
      new Date(candidate.expiresAtUtc).getTime() + 1_000,
    ).toISOString();
  });
  assert.deepEqual(validateExceptionalReleaseAct(timestampAct), []);
  restoreActSurfaces(fixture, timestampAct);
  assert.deepEqual(readActSurface(fixture), timestampAct);
  assert.throws(
    () => readIssued(fixture, stateRoot, { act: timestampAct }),
    /actHash externo|timestamps del issuance/i,
  );
  restoreActSurfaces(fixture);

  const gateAct = resealAct(fixture.act, (candidate) => {
    candidate.gates[0].severity = "LOW";
  });
  assert.notEqual(gateAct.contentSha256, fixture.act.contentSha256);
  replaceRestricted(fixture.jsonPath, canonicalJson(gateAct));
  assert.throws(() => readActSurface(fixture), /altera severity/i);
  assert.throws(
    () => readIssued(fixture, stateRoot, { act: gateAct }),
    /altera severity|acta excepcional inválida/i,
  );
  restoreActSurfaces(fixture);

  const tamperedArtifactPayload = structuredClone(fixture.artifactManifest);
  delete tamperedArtifactPayload.contentSha256;
  tamperedArtifactPayload.files[0].sha256 = sha256("otro-worker");
  const tamperedArtifactManifest = {
    ...tamperedArtifactPayload,
    contentSha256: exceptionalReleaseArtifactHash(tamperedArtifactPayload),
  };
  const artifactAct = resealAct(fixture.act, (candidate) => {
    candidate.artifactHash = tamperedArtifactManifest.contentSha256;
  });
  assert.deepEqual(validateExceptionalReleaseAct(artifactAct), []);
  assert.deepEqual(
    validateExceptionalReleaseArtifactManifest(tamperedArtifactManifest, {
      expectedHead: HEAD,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: fixture.requestHash,
      expectedArtifactHash: tamperedArtifactManifest.contentSha256,
    }),
    [],
  );
  restoreActSurfaces(fixture, artifactAct);
  assert.deepEqual(readActSurface(fixture), artifactAct);
  assert.throws(
    () =>
      readIssued(fixture, stateRoot, {
        act: artifactAct,
        artifactManifest: tamperedArtifactManifest,
      }),
    /artifactHash del issuance|actHash externo/i,
  );
  restoreActSurfaces(fixture);

  const recordHardlink = `${issued.issuancePath}.hardlink`;
  linkSync(issued.issuancePath, recordHardlink);
  assert.equal(lstatSync(issued.issuancePath).nlink, 2);
  assert.throws(() => readIssued(fixture, stateRoot), /hard links/i);
  unlinkSync(recordHardlink);
  assert.deepEqual(readIssued(fixture, stateRoot).issuance, issued.issuance);

  chmodSync(issued.issuancePath, 0o640);
  assert.throws(() => readIssued(fixture, stateRoot), /modo 0600/i);
  chmodSync(issued.issuancePath, 0o600);

  const recordTarget = `${issued.issuancePath}.target`;
  renameSync(issued.issuancePath, recordTarget);
  symlinkSync(recordTarget, issued.issuancePath);
  assert.throws(() => readIssued(fixture, stateRoot), /archivo regular/i);
  unlinkSync(issued.issuancePath);
  renameSync(recordTarget, issued.issuancePath);

  const markdownHardlink = `${fixture.markdownPath}.hardlink`;
  linkSync(fixture.markdownPath, markdownHardlink);
  assert.equal(lstatSync(fixture.markdownPath).nlink, 2);
  assert.throws(() => readIssued(fixture, stateRoot), /hard links/i);
  unlinkSync(markdownHardlink);

  chmodSync(fixture.markdownPath, 0o644);
  assert.throws(() => readIssued(fixture, stateRoot), /modo 0600/i);
  chmodSync(fixture.markdownPath, 0o600);

  const markdownTarget = `${fixture.markdownPath}.target`;
  renameSync(fixture.markdownPath, markdownTarget);
  symlinkSync(markdownTarget, fixture.markdownPath);
  assert.throws(() => readIssued(fixture, stateRoot), /archivo regular/i);
  unlinkSync(fixture.markdownPath);
  renameSync(markdownTarget, fixture.markdownPath);

  const actJsonBackup = `${fixture.jsonPath}.missing`;
  renameSync(fixture.jsonPath, actJsonBackup);
  assert.throws(() => readActSurface(fixture), { code: "ENOENT" });
  renameSync(actJsonBackup, fixture.jsonPath);

  const originalActJson = readFileSync(fixture.jsonPath, "utf8");
  replaceRestricted(fixture.jsonPath, `${originalActJson}alterado\n`);
  assert.throws(() => readActSurface(fixture), /JSON válido/i);
  replaceRestricted(fixture.jsonPath, originalActJson);

  const actJsonHardlink = `${fixture.jsonPath}.hardlink`;
  linkSync(fixture.jsonPath, actJsonHardlink);
  assert.equal(lstatSync(fixture.jsonPath).nlink, 2);
  assert.throws(() => readActSurface(fixture), /hard links/i);
  unlinkSync(actJsonHardlink);

  chmodSync(fixture.jsonPath, 0o640);
  assert.throws(() => readActSurface(fixture), /modo 0600/i);
  chmodSync(fixture.jsonPath, 0o600);

  const actJsonTarget = `${fixture.jsonPath}.target`;
  renameSync(fixture.jsonPath, actJsonTarget);
  symlinkSync(actJsonTarget, fixture.jsonPath);
  assert.throws(() => readActSurface(fixture), /archivo regular/i);
  unlinkSync(fixture.jsonPath);
  renameSync(actJsonTarget, fixture.jsonPath);

  chmodSync(path.join(stateRoot, "issued"), 0o750);
  assert.throws(() => readIssued(fixture, stateRoot), /modo 0700/i);
  chmodSync(path.join(stateRoot, "issued"), 0o700);
  chmodSync(stateRoot, 0o750);
  assert.throws(() => readIssued(fixture, stateRoot), /modo 0700/i);
  chmodSync(stateRoot, 0o700);

  const stateSymlink = path.join(temporaryRoot, "state-symlink");
  symlinkSync(stateRoot, stateSymlink);
  assert.throws(
    () => readIssued(fixture, stateSymlink),
    /directorio regular|symlinks/i,
  );
  unlinkSync(stateSymlink);

  if (typeof process.getuid === "function" && process.getuid() === 0) {
    const originalRecordMetadata = lstatSync(issued.issuancePath);
    const foreignUid = originalRecordMetadata.uid === 1 ? 2 : 1;
    chownSync(issued.issuancePath, foreignUid, originalRecordMetadata.gid);
    assert.throws(() => readIssued(fixture, stateRoot), /usuario efectivo/i);
    chownSync(
      issued.issuancePath,
      originalRecordMetadata.uid,
      originalRecordMetadata.gid,
    );

    const originalMarkdownMetadata = lstatSync(fixture.markdownPath);
    chownSync(fixture.markdownPath, foreignUid, originalMarkdownMetadata.gid);
    assert.throws(() => readIssued(fixture, stateRoot), /usuario efectivo/i);
    chownSync(
      fixture.markdownPath,
      originalMarkdownMetadata.uid,
      originalMarkdownMetadata.gid,
    );

    const originalActJsonMetadata = lstatSync(fixture.jsonPath);
    chownSync(fixture.jsonPath, foreignUid, originalActJsonMetadata.gid);
    assert.throws(() => readActSurface(fixture), /usuario actual/i);
    chownSync(
      fixture.jsonPath,
      originalActJsonMetadata.uid,
      originalActJsonMetadata.gid,
    );
  }

  assertRestrictedFile(issued.issuancePath);
  assertRestrictedFile(fixture.jsonPath);
  assertRestrictedFile(fixture.markdownPath);
  assert.deepEqual(readIssued(fixture, stateRoot).issuance, issued.issuance);

  console.log("test-exceptional-act-issuance: ok");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
