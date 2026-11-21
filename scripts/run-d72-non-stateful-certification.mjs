#!/usr/bin/env node

import { installedPnpmStoreEnvironment } from "./installed-pnpm-store.mjs";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runClosedProductionSmoke } from "./cloudflare-closed-smoke-policy.mjs";
import { runOpenSourceProductionSmoke } from "./cloudflare-open-source-smoke-policy.mjs";
import {
  createD72OpenUpdateEvidenceDiagnostic,
  createD72OpenUpdateEvidenceFromGoogleCapture,
  createD72OpenCanaryConsentCleanupEvidenceFromBrowserCapture,
} from "./d72-open-update-evidence-policy.mjs";
import { runD72GoogleAuthBrowserCapture } from "./d72-google-auth-capture.mjs";
import {
  createD72StatefulCanaryManifest,
  d72StatefulCanaryAuthorizationPhrase,
} from "./d72-stateful-canary-policy.mjs";
import { writeOpenUpdateEvidenceFile } from "./open-update-evidence-file.mjs";
import { collectD72OpenRecoveryCompatibility } from "./d72-open-recovery-compatibility.mjs";
import { createAndPublishD72OpenCanaryRecoveryCapsule } from "./d72-open-canary-recovery-capsule.mjs";
import {
  D72_CANARY_ACCOUNT_ID,
  D72_CANARY_MAX_CAPABILITY_AGE_MS,
  D72_CANARY_NODE_VERSION,
  D72_CANARY_WORKER_NAME,
  D72_CANARY_WRANGLER_VERSION,
  createD72CanaryVersionUploadAuthorizationPreview,
  createD72CanaryVersionUploadPlan,
  createD72CanaryZeroPercentDeploymentPlan,
  d72CanaryInfrastructureAuthorizationPhrase,
  d72CanaryVersionCertificationHash,
  d72CanarySourceBindings,
  d72CanaryUploadArtifactBindings,
} from "./d72-canary-policy.mjs";
import {
  completeD72ClosedNoWriteProof,
  prepareD72ClosedNoWriteProof,
} from "./d72-closed-no-write-proof.mjs";
import {
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS,
  D72_COMPOSITE_PINNED_PNPM_EXECUTABLE,
  assertD72CompositeProductionRuntime,
  assertD72NonStatefulCompositeCollectorReceipt,
  collectD72NonStatefulCompositeReceipt,
} from "./d72-non-stateful-composite-collector.mjs";
import {
  assertIssuedD72GitCurrentStateReceipt,
  collectD72GitCurrentState,
} from "./d72-git-current-state.mjs";
import {
  assertD72NonStatefulEvidenceAllowsCanary,
  createD72CandidateIdentity,
  createD72NonStatefulEvidenceCertification,
  d72CandidateIdentityHash,
  d72NonStatefulEvidenceBlockers,
  d72NonStatefulEvidenceCertificationHash,
  issueD72NonStatefulCollectorBundle,
} from "./d72-non-waivable-evidence-policy.mjs";
import {
  NON_STATEFUL_GATE_IDS,
  d72ReleaseEvidenceProfile,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  exceptionalReleaseRequestHash,
  readExceptionalReleaseRequestFile,
  renderExceptionalReleaseRequestJson,
  validateExceptionalReleaseRequestPath,
} from "./exceptional-release-act.mjs";
import { freezeExceptionalReleaseArtifact } from "./exceptional-release-artifact.mjs";
import {
  AUTHORIZED_RISK_OWNER,
  EVIDENCE_STATUS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  RAW_RESULT,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";
import { findKnownSecrets } from "./secret-patterns.mjs";
import { prepareD72CandidateBuildEnvironment } from "./open-release-runner-policy.mjs";
import { createD72CanaryRunner } from "./run-d72-canary.mjs";
import {
  assertD72SupabaseReadonlyReceipt,
  runD72SupabaseReadonly,
} from "./run-d72-supabase-readonly.mjs";
import { D72_SUPABASE_GATE_IDS } from "./d72-supabase-readonly-policy.mjs";

export const D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION =
  "agorbis-d72-non-stateful-certification-run/v1";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const PRODUCTION_CAPABILITY = Symbol("d72-non-stateful-production");
const TEST_ONLY_CAPABILITY = Symbol("d72-non-stateful-test-only");
const TEST_HARNESS_DEPENDENCY_KEYS = Object.freeze(
  [
    "assertCanaryAllowed",
    "buildCandidate",
    "collectComposite",
    "collectGit",
    "completeClosedNoWriteProof",
    "createCanaryRunner",
    "createCandidateIdentity",
    "createCertification",
    "createRequest",
    "createUploadPlan",
    "createUploadPreview",
    "createZeroPercentPlan",
    "emit",
    "freezeArtifact",
    "issueCollectorBundle",
    "inspectPreSmokeEvidence",
    "inspectSupabaseCheckpoint",
    "prepareClosedNoWriteProof",
    "runClosedSmoke",
    "runSupabaseReadonly",
    "now",
  ].sort(),
);

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("La creación del request D72 exige O_NOFOLLOW.");
}

const REQUEST_WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  (fsConstants.O_CLOEXEC ?? 0) |
  fsConstants.O_NOFOLLOW;

const QUALITY_PRODUCTION_SMOKE_GATE_ID = "quality.production-smoke";
const PRE_SMOKE_GATE_IDS = Object.freeze(
  NON_STATEFUL_GATE_IDS.filter(
    (gateId) => gateId !== QUALITY_PRODUCTION_SMOKE_GATE_ID,
  ),
);
if (PRE_SMOKE_GATE_IDS.length !== 19) {
  throw new Error(
    "El catálogo D72 no contiene exactamente 19 gates pre-smoke.",
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function currentUid() {
  if (typeof process.getuid !== "function") {
    throw new Error("No se puede acreditar el propietario del request D72.");
  }
  return process.getuid();
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertSafeRequestParent(requestPath) {
  const parentPath = path.dirname(requestPath);
  const parentBefore = lstatSync(parentPath);
  if (
    !parentBefore.isDirectory() ||
    parentBefore.isSymbolicLink() ||
    (parentBefore.mode & 0o7777) !== 0o700 ||
    parentBefore.uid !== currentUid() ||
    realpathSync(parentPath) !== path.resolve(parentPath)
  ) {
    throw new Error(
      "El directorio del request D72 debe ser propio, real y modo 0700.",
    );
  }
  return { parentBefore, parentPath };
}

function assertWrittenRequestFile(requestPath, fileStats) {
  const pathStats = lstatSync(requestPath);
  if (
    !fileStats.isFile() ||
    fileStats.isSymbolicLink() ||
    !pathStats.isFile() ||
    pathStats.isSymbolicLink() ||
    !sameFileIdentity(fileStats, pathStats) ||
    (fileStats.mode & 0o7777) !== 0o600 ||
    fileStats.uid !== currentUid() ||
    fileStats.nlink !== 1 ||
    realpathSync(requestPath) !== path.resolve(requestPath)
  ) {
    throw new Error(
      "El request D72 no quedó como archivo propio, único y modo 0600.",
    );
  }
}

function writeAll(fd, source) {
  const bytes = Buffer.from(source, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) {
      throw new Error("No se pudo completar la escritura del request D72.");
    }
    offset += written;
  }
  bytes.fill(0);
}

function buildD72ExceptionalRequest({ head, now }) {
  if (!FULL_HEAD_PATTERN.test(head ?? "")) {
    throw new Error("El request D72 exige un HEAD completo.");
  }
  const timestamp =
    now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("El request D72 exige un reloj válido.");
  }
  return {
    schemaVersion: EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head,
    owner: AUTHORIZED_RISK_OWNER,
    timestampUtc: timestamp.toISOString(),
    deploymentAuthorized: false,
    risks: OWNER_WAIVER_CANDIDATE_GATE_IDS.map((gateId) => {
      const definition = getReleaseGateDefinition(gateId);
      if (!definition) {
        throw new Error("La policy D72 no contiene todos los riesgos.");
      }
      return {
        gateId,
        evidenceStatus: definition.evidenceStatus,
        rawResult: definition.rawResult,
        requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
        acceptedConsequence: definition.consequence,
        reviewRequiredBy: definition.reviewRequiredBy,
      };
    }),
  };
}

function createD72ExceptionalRequestFile({
  head,
  now,
  requestPath,
  worktreeRoot,
}) {
  if (
    typeof requestPath !== "string" ||
    path.resolve(requestPath) !== requestPath ||
    typeof worktreeRoot !== "string" ||
    path.resolve(worktreeRoot) !== worktreeRoot
  ) {
    throw new Error(
      "Las rutas del request D72 deben ser absolutas y canónicas.",
    );
  }
  const pathErrors = validateExceptionalReleaseRequestPath({
    requestPath,
    worktreeRoot,
  });
  if (pathErrors.length > 0) {
    throw new Error("La ruta del request D72 no está autorizada.");
  }
  const { parentBefore, parentPath } = assertSafeRequestParent(requestPath);
  const request = buildD72ExceptionalRequest({ head, now });
  const source = renderExceptionalReleaseRequestJson(request, {
    currentHead: head,
    now,
  });
  let requestFd;
  try {
    requestFd = openSync(requestPath, REQUEST_WRITE_FLAGS, 0o600);
    fchmodSync(requestFd, 0o600);
    writeAll(requestFd, source);
    fsyncSync(requestFd);
    assertWrittenRequestFile(requestPath, fstatSync(requestFd));
  } finally {
    if (requestFd !== undefined) closeSync(requestFd);
  }
  const parentAfter = lstatSync(parentPath);
  if (!sameFileIdentity(parentBefore, parentAfter)) {
    throw new Error(
      "El directorio del request D72 cambió durante la escritura.",
    );
  }
  let parentFd;
  try {
    parentFd = openSync(
      parentPath,
      fsConstants.O_RDONLY |
        (fsConstants.O_DIRECTORY ?? 0) |
        (fsConstants.O_CLOEXEC ?? 0) |
        fsConstants.O_NOFOLLOW,
    );
    fsyncSync(parentFd);
  } finally {
    if (parentFd !== undefined) closeSync(parentFd);
  }
  return readExceptionalReleaseRequestFile({
    requestPath,
    worktreeRoot,
    currentHead: head,
    now,
  });
}

function readOpenUpdateRequestOrCreateClosed(options) {
  let exists = false;
  try {
    lstatSync(options.requestPath);
    exists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!exists) return createD72ExceptionalRequestFile(options);
  const request = readExceptionalReleaseRequestFile({
    requestPath: options.requestPath,
    worktreeRoot: options.worktreeRoot,
    currentHead: options.head,
    now: options.now,
  });
  if (request.releaseMode !== "OPEN_UPDATE")
    throw new Error(
      "Un request existente debe ser OPEN_UPDATE; CLOSED conserva su emisión exclusiva.",
    );
  return request;
}

function productionDnsTokenFile() {
  const home = process.env.HOME;
  if (typeof home !== "string" || !path.isAbsolute(home)) {
    throw new Error("HOME no permite resolver el token DNS fijado.");
  }
  return path.join(home, ".config", "agorbis", "cloudflare-dns-read.token");
}

function emitSanitizedRecord(record) {
  const serialized = JSON.stringify(record);
  if (findKnownSecrets(serialized).length > 0) {
    throw new Error("La salida interactiva D72 contiene material sensible.");
  }
  process.stdout.write(`${serialized}\n`);
}

function d72CandidateBuildInvocation({
  requestPath,
  repositoryRoot,
  artifactPurpose = "primary",
}) {
  if (!["primary", "recovery"].includes(artifactPurpose)) {
    throw new Error("El build D72 exige un propósito de artefacto conocido.");
  }
  if (
    process.versions.node !== "22.22.0" ||
    process.execPath !== path.resolve(process.execPath) ||
    path.basename(process.execPath) !== "node" ||
    repositoryRoot !== REPOSITORY_ROOT
  ) {
    throw new Error("El build candidato D72 exige el Node 22.22.0 fijado.");
  }
  const home = process.env.HOME;
  if (typeof home !== "string" || !path.isAbsolute(home)) {
    throw new Error("El build candidato D72 exige HOME absoluto.");
  }
  const baseEnvironment = prepareD72CandidateBuildEnvironment({
    requestedRiskGateIds: [...OWNER_WAIVER_CANDIDATE_GATE_IDS],
  });
  const environment = Object.freeze({
    ...baseEnvironment,
    ...(artifactPurpose === "recovery"
      ? { PUBLIC_GOOGLE_AUTH_ENABLED: "false" }
      : {}),
    ...installedPnpmStoreEnvironment(repositoryRoot),
    CI: "true",
    DO_NOT_TRACK: "1",
    FORCE_COLOR: "0",
    LC_ALL: "C",
    NO_COLOR: "1",
    PATH: `${path.dirname(D72_COMPOSITE_PINNED_PNPM_EXECUTABLE)}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
  });
  return Object.freeze({
    command: process.execPath,
    arguments: Object.freeze([
      path.join(repositoryRoot, "scripts", "cloudflare-build.mjs"),
      artifactPurpose === "recovery"
        ? "--open-recovery-request"
        : "--d72-candidate-request",
      requestPath,
    ]),
    options: Object.freeze({
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
      maxBuffer: 64 * 1_024 * 1_024,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30 * 60 * 1_000,
    }),
  });
}

function buildD72OpenCandidate({
  requestPath,
  repositoryRoot,
  artifactPurpose,
}) {
  // La attestation incluye hash/metadata/version de Node, pnpm y /usr/bin/git.
  // Se ejecuta antes de construir siquiera la invocación del child.
  assertD72CompositeProductionRuntime();
  const invocation = d72CandidateBuildInvocation({
    requestPath,
    repositoryRoot,
    artifactPurpose,
  });
  const result = spawnSync(
    invocation.command,
    invocation.arguments,
    invocation.options,
  );
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("El build OPEN candidato D72 falló (salida saneada).");
  }
  return Object.freeze({
    built: true,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    mode: artifactPurpose === "recovery" ? "open-recovery" : "d72-candidate",
    riskAcceptanceRecorded: false,
  });
}

export function createD72CandidateBuildInvocationTestHarness(options = {}) {
  if (
    !exactKeys(options, [
      "repositoryRoot",
      "requestPath",
      "testOnly",
      ...(Object.hasOwn(options, "artifactPurpose") ? ["artifactPurpose"] : []),
    ]) ||
    options.testOnly !== true
  ) {
    throw new Error("La inspección del build candidato exige testOnly=true.");
  }
  return d72CandidateBuildInvocation(options);
}

function sanitizedGateStatus(gate) {
  if (
    !gate ||
    typeof gate !== "object" ||
    !PRE_SMOKE_GATE_IDS.includes(gate.gateId) ||
    !new Set([
      EVIDENCE_STATUS.PASS,
      EVIDENCE_STATUS.FAIL,
      EVIDENCE_STATUS.NOT_VERIFIED,
    ]).has(gate.status)
  ) {
    throw new Error("Un gate pre-smoke no contiene estado factual saneado.");
  }
  return Object.freeze({ gateId: gate.gateId, status: gate.status });
}

function inspectD72SupabaseCheckpoint({
  candidateIdentity,
  supabaseReceipt,
  now,
}) {
  assertD72SupabaseReadonlyReceipt(supabaseReceipt, {
    expectedHead: candidateIdentity.head,
    now,
  });
  const gates = Object.freeze(supabaseReceipt.gates.map(sanitizedGateStatus));
  if (
    JSON.stringify(gates.map(({ gateId }) => gateId)) !==
    JSON.stringify(D72_SUPABASE_GATE_IDS)
  ) {
    throw new Error(
      "El checkpoint Supabase no contiene sus seis gates exactos.",
    );
  }
  return Object.freeze({
    allowed: gates.every(({ status }) => status === EVIDENCE_STATUS.PASS),
    gates,
  });
}

function inspectD72PreSmokeEvidence({
  candidateIdentity,
  compositeReceipt,
  gitReceipt,
  now,
  supabaseReceipt,
}) {
  assertIssuedD72GitCurrentStateReceipt(gitReceipt, {
    expectedHead: candidateIdentity.head,
    now,
  });
  assertD72SupabaseReadonlyReceipt(supabaseReceipt, {
    expectedHead: candidateIdentity.head,
    now,
  });
  assertD72NonStatefulCompositeCollectorReceipt(compositeReceipt, {
    candidateIdentity,
    now,
  });
  const gates = Object.freeze([
    Object.freeze({
      gateId: "source.git-head-clean-and-recoverable",
      status: EVIDENCE_STATUS.PASS,
    }),
    ...supabaseReceipt.gates.map(sanitizedGateStatus),
    ...compositeReceipt.gates.map(sanitizedGateStatus),
  ]);
  if (
    gates.length !== PRE_SMOKE_GATE_IDS.length ||
    new Set(gates.map(({ gateId }) => gateId)).size !== gates.length ||
    PRE_SMOKE_GATE_IDS.some(
      (gateId) => !gates.some((gate) => gate.gateId === gateId),
    )
  ) {
    throw new Error("La evidencia pre-smoke no cubre exactamente 19 gates.");
  }
  const blockers = Object.freeze(
    gates
      .filter(({ status }) => status !== EVIDENCE_STATUS.PASS)
      .map(({ gateId }) => gateId),
  );
  return Object.freeze({ allowed: blockers.length === 0, blockers, gates });
}

const PRODUCTION_DEPENDENCIES = Object.freeze({
  assertCanaryAllowed: assertD72NonStatefulEvidenceAllowsCanary,
  buildCandidate: buildD72OpenCandidate,
  collectComposite: collectD72NonStatefulCompositeReceipt,
  collectGit: collectD72GitCurrentState,
  completeClosedNoWriteProof: completeD72ClosedNoWriteProof,
  createCanaryRunner: createD72CanaryRunner,
  createCandidateIdentity: createD72CandidateIdentity,
  createCertification: createD72NonStatefulEvidenceCertification,
  createOpenDiagnostic: createD72OpenUpdateEvidenceDiagnostic,
  createOpenCaptureDiagnostic: createD72OpenUpdateEvidenceFromGoogleCapture,
  createConsentCleanupEvidence:
    createD72OpenCanaryConsentCleanupEvidenceFromBrowserCapture,
  createStatefulManifest: createD72StatefulCanaryManifest,
  captureGoogle: runD72GoogleAuthBrowserCapture,
  collectRecoveryCompatibility: collectD72OpenRecoveryCompatibility,
  createRecoveryCapsule: createAndPublishD72OpenCanaryRecoveryCapsule,
  createRequest: readOpenUpdateRequestOrCreateClosed,
  createUploadPlan: createD72CanaryVersionUploadPlan,
  createUploadPreview: createD72CanaryVersionUploadAuthorizationPreview,
  createZeroPercentPlan: createD72CanaryZeroPercentDeploymentPlan,
  emit: emitSanitizedRecord,
  freezeArtifact: freezeExceptionalReleaseArtifact,
  issueCollectorBundle: issueD72NonStatefulCollectorBundle,
  inspectPreSmokeEvidence: inspectD72PreSmokeEvidence,
  inspectSupabaseCheckpoint: inspectD72SupabaseCheckpoint,
  prepareClosedNoWriteProof: prepareD72ClosedNoWriteProof,
  runClosedSmoke: runClosedProductionSmoke,
  runOpenSourceSmoke: runOpenSourceProductionSmoke,
  runSupabaseReadonly: runD72SupabaseReadonly,
  writeOpenDiagnostic: writeOpenUpdateEvidenceFile,
  now: () => new Date(),
});

function assertHarnessDependencies(dependencies) {
  const keys = [
    ...TEST_HARNESS_DEPENDENCY_KEYS,
    ...[
      "runOpenSourceSmoke",
      "createOpenDiagnostic",
      "writeOpenDiagnostic",
      "collectRecoveryCompatibility",
      "createRecoveryCapsule",
      "createOpenCaptureDiagnostic",
      "createConsentCleanupEvidence",
      "createStatefulManifest",
      "captureGoogle",
    ].filter((key) => Object.hasOwn(dependencies ?? {}, key)),
  ];
  if (
    !exactKeys(dependencies, keys) ||
    keys.some((name) => typeof dependencies[name] !== "function")
  ) {
    throw new Error(
      "El harness D72 testOnly exige exactamente todas sus dependencias explícitas.",
    );
  }
}

function sanitizedSummary({
  artifact,
  candidateIdentity,
  certification,
  closedSmokeReceipt,
  openSourceSmokeReceipt,
}) {
  const blockers = [...d72NonStatefulEvidenceBlockers(certification)];
  const allowed =
    blockers.length === 0 && certification.canaryPreparationAllowed === true;
  const exactGateOrder =
    JSON.stringify(certification.gates?.map(({ gateId }) => gateId)) ===
    JSON.stringify(NON_STATEFUL_GATE_IDS);
  const bindingsMatch =
    certification.head === candidateIdentity.head &&
    certification.requestHash === candidateIdentity.requestHash &&
    certification.policyHash === candidateIdentity.policyHash &&
    certification.artifactHash === candidateIdentity.artifactHash;
  const authorizationFlagsRemainFalse = [
    candidateIdentity.deploymentAuthorized,
    candidateIdentity.deploymentExecuted,
    candidateIdentity.actIssued,
    candidateIdentity.riskAcceptanceRecorded,
    certification.deploymentAuthorized,
    certification.deploymentExecuted,
    certification.actIssued,
    certification.riskAcceptanceRecorded,
  ].every((value) => value === false);
  const summary = {
    ...d72ReleaseEvidenceProfile(candidateIdentity),
    schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
    status: allowed ? "CERTIFIED" : "BLOCKED",
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    policyHash: candidateIdentity.policyHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    evidenceCertificationHash:
      d72NonStatefulEvidenceCertificationHash(certification),
    candidateIdentityDisposition: certification.candidateIdentityDisposition,
    canaryPreparationAllowed: allowed,
    ...(candidateIdentity.releaseMode === "OPEN_UPDATE"
      ? {
          sourceDeploymentId: openSourceSmokeReceipt.activeDeploymentId,
          sourceVersionId: openSourceSmokeReceipt.activeVersionId,
        }
      : {
          closedDeploymentId: closedSmokeReceipt.activeDeploymentId,
          closedVersionId: closedSmokeReceipt.activeVersionId,
        }),
    gates: certification.gates.map(({ evidenceStatus, gateId, rawResult }) => ({
      gateId,
      evidenceStatus,
      rawResult,
    })),
    blockers,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
    remoteMutationExecuted: false,
  };
  if (
    artifact?.artifactHash !== summary.artifactHash ||
    !exactGateOrder ||
    !bindingsMatch ||
    !authorizationFlagsRemainFalse ||
    findKnownSecrets(JSON.stringify(summary)).length > 0
  ) {
    throw new Error("El resumen D72 saneado no coincide con el artifact.");
  }
  return Object.freeze({
    ...summary,
    gates: Object.freeze(summary.gates.map((gate) => Object.freeze(gate))),
    blockers: Object.freeze(summary.blockers),
  });
}

function blockedClosedNoWritePreproofSummary({
  artifact,
  candidateIdentity,
  preSmokeGates,
  preproof,
}) {
  const factualGates = preSmokeGates.map(sanitizedGateStatus);
  if (
    factualGates.length !== PRE_SMOKE_GATE_IDS.length ||
    new Set(factualGates.map(({ gateId }) => gateId)).size !==
      factualGates.length ||
    PRE_SMOKE_GATE_IDS.some(
      (gateId) => !factualGates.some((gate) => gate.gateId === gateId),
    )
  ) {
    throw new Error("La preprueba CLOSED exige los 19 gates previos PASS.");
  }
  const gates = NON_STATEFUL_GATE_IDS.map((gateId) => {
    const evidenceStatus =
      gateId === QUALITY_PRODUCTION_SMOKE_GATE_ID
        ? EVIDENCE_STATUS.NOT_VERIFIED
        : factualGates.find((gate) => gate.gateId === gateId).status;
    return Object.freeze({
      evidenceStatus,
      gateId,
      rawResult:
        evidenceStatus === EVIDENCE_STATUS.PASS
          ? RAW_RESULT.PASS
          : RAW_RESULT.FAIL,
    });
  });
  const summary = {
    schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
    status: "BLOCKED_CLOSED_NO_WRITE_PREPROOF",
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    policyHash: candidateIdentity.policyHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    closedDeploymentId: preproof.activeDeploymentId ?? null,
    closedVersionId: preproof.activeVersionId ?? null,
    closedNoWritePreproofStatus: preproof.status,
    closedNoWritePreproofReasonCode: preproof.reasonCode,
    gates,
    blockers: gates
      .filter(({ evidenceStatus }) => evidenceStatus !== EVIDENCE_STATUS.PASS)
      .map(({ gateId }) => gateId),
    gatesCollected: 19,
    preproofExecuted: true,
    closedSmokeExecuted: false,
    requestAndArtifactInvalidated: true,
    canaryPreparationAllowed: false,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
    remoteMutationExecuted: false,
  };
  if (
    artifact?.artifactHash !== candidateIdentity.artifactHash ||
    preproof.status === EVIDENCE_STATUS.PASS ||
    factualGates.some(({ status }) => status !== EVIDENCE_STATUS.PASS) ||
    !new Set([EVIDENCE_STATUS.FAIL, EVIDENCE_STATUS.NOT_VERIFIED]).has(
      preproof.status,
    ) ||
    findKnownSecrets(JSON.stringify(summary)).length > 0
  ) {
    throw new Error("La preprueba CLOSED no-write bloqueada no es saneada.");
  }
  return Object.freeze({
    ...summary,
    gates: Object.freeze(summary.gates),
    blockers: Object.freeze(summary.blockers),
  });
}

function blockedPreSmokeEvidenceSummary({
  artifact,
  candidateIdentity,
  observedGates,
  status,
}) {
  if (
    !new Set(["BLOCKED_SUPABASE_CHECKPOINT", "BLOCKED_PRE_SMOKE_EVIDENCE"]).has(
      status,
    ) ||
    !Array.isArray(observedGates)
  ) {
    throw new Error("El bloqueo pre-smoke no contiene una fase válida.");
  }
  const factualGates = observedGates.map(sanitizedGateStatus);
  if (
    new Set(factualGates.map(({ gateId }) => gateId)).size !==
    factualGates.length
  ) {
    throw new Error("El bloqueo pre-smoke contiene gates duplicados.");
  }
  const gates = NON_STATEFUL_GATE_IDS.map((gateId) => {
    const observed = factualGates.find((gate) => gate.gateId === gateId);
    const evidenceStatus = observed?.status ?? EVIDENCE_STATUS.NOT_VERIFIED;
    return Object.freeze({
      evidenceStatus,
      gateId,
      rawResult:
        evidenceStatus === EVIDENCE_STATUS.PASS
          ? RAW_RESULT.PASS
          : RAW_RESULT.FAIL,
    });
  });
  const summary = {
    schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
    status,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    policyHash: candidateIdentity.policyHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    gates,
    blockers: gates
      .filter(({ evidenceStatus }) => evidenceStatus !== EVIDENCE_STATUS.PASS)
      .map(({ gateId }) => gateId),
    gatesCollected: factualGates.length,
    preproofExecuted: false,
    closedSmokeExecuted: false,
    canaryPreparationAllowed: false,
    requestAndArtifactInvalidated: true,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
    remoteMutationExecuted: false,
  };
  if (
    artifact?.artifactHash !== candidateIdentity.artifactHash ||
    factualGates.every(
      ({ status: gateStatus }) => gateStatus === EVIDENCE_STATUS.PASS,
    ) ||
    findKnownSecrets(JSON.stringify(summary)).length > 0
  ) {
    throw new Error("El resumen de bloqueo pre-smoke no es factual y saneado.");
  }
  return Object.freeze({
    ...summary,
    gates: Object.freeze(summary.gates),
    blockers: Object.freeze(summary.blockers),
  });
}

async function executeD72OpenCanaryStages({
  dependencies,
  testOnly,
  stopAt,
  requestPath,
  repositoryRoot,
  request,
  artifact,
  recoveryArtifact,
  recoveryCompatibility,
  candidateIdentity,
  certification,
  canaryBaseOptions,
  primaryUploadOptions,
  recoveryUploadOptions,
  preparedSummary,
}) {
  const runner = dependencies.createCanaryRunner();
  const upload = async (options, manifest) => {
    const bindings = {
      head: options.head,
      requestHash: options.requestHash,
      policyHash: options.policyHash,
      artifactHash: options.artifactHash,
      workerName: D72_CANARY_WORKER_NAME,
      ...d72CanarySourceBindings(options, { includeDeployment: false }),
      ...d72CanaryUploadArtifactBindings(options),
    };
    const token = runner.readAuthorization({
      kind: "version-upload",
      bindings,
      ...(testOnly ? { confirmedAtUtc: dependencies.now().toISOString() } : {}),
    });
    const git = await dependencies.collectGit();
    if (git.head !== candidateIdentity.head)
      throw new Error("HEAD cambió antes del upload OPEN autorizado.");
    const uploadPlanOptions = {
      ...options,
      versionUploadAuthorizationToken: token,
    };
    const uploadPlan = await dependencies.createUploadPlan(uploadPlanOptions);
    const uploadReceipt = await runner.uploadVersion({
      uploadPlan,
      uploadPlanOptions,
      artifactManifest: manifest,
      authorizationToken: token,
    });
    const versionCertification = await runner.certifyVersion({
      uploadPlan,
      uploadPlanOptions,
      uploadReceipt,
      artifactManifest: manifest,
    });
    return { uploadPlan, uploadPlanOptions, versionCertification };
  };
  const recovery = await upload(
    recoveryUploadOptions,
    recoveryArtifact.manifest,
  );
  // The issuer verifies the exact upload/GET chain; a caller-supplied hash map
  // cannot replace fallback byte/configuration evidence.
  const recoveryUploadEvidence = runner.exportRecoveryUploadEvidence(
    recovery.versionCertification,
  );
  const primary = await upload(primaryUploadOptions, artifact.manifest);
  const versionCertification = primary.versionCertification;
  const readiness = runner.inspectCapabilityReadiness(versionCertification);
  if (readiness.ready !== true) {
    return Object.freeze({
      exitCode: 1,
      summary: Object.freeze({
        ...preparedSummary,
        status: "BLOCKED_OPEN_REMOTE_ARTIFACT_PROOF",
        blocker: readiness.blocker,
        remoteMutationExecuted: true,
        versionUploadExecuted: true,
        canaryAttached: false,
      }),
    });
  }
  const versionCertificationHash =
    d72CanaryVersionCertificationHash(versionCertification);
  const infraBindings = {
    head: canaryBaseOptions.head,
    requestHash: canaryBaseOptions.requestHash,
    policyHash: canaryBaseOptions.policyHash,
    artifactHash: canaryBaseOptions.artifactHash,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    ...d72CanarySourceBindings(canaryBaseOptions),
    candidateVersionId: versionCertification.candidateVersionId,
    versionCertificationHash,
  };
  const waiting = Object.freeze({
    ...preparedSummary,
    status: "WAITING_OPEN_ZERO_PERCENT_AUTHORIZATION",
    candidateVersionId: versionCertification.candidateVersionId,
    recoveryVersionId: recovery.versionCertification.candidateVersionId,
    versionCertificationHash,
    staticAssetsVerified: true,
    versionUploadExecuted: true,
    remoteMutationExecuted: true,
    authorizationPhrase:
      d72CanaryInfrastructureAuthorizationPhrase(infraBindings),
  });
  dependencies.emit(waiting);
  if (stopAt === "ZERO_PERCENT_AUTHORIZATION")
    return Object.freeze({ exitCode: 0, summary: waiting });
  const infraToken = runner.readAuthorization({
    kind: "zero-percent-deployment",
    bindings: infraBindings,
    ...(testOnly ? { confirmedAtUtc: dependencies.now().toISOString() } : {}),
  });
  const recoveryPlan = await dependencies.createRecoveryCapsule({
    repositoryRoot,
    requestPath,
    request,
    artifactManifest: artifact.manifest,
    recoveryArtifact,
    compatibilityReceipt: recoveryCompatibility,
    recoveryUploadEvidence,
    versionCertification,
    zeroPercentDeploymentAuthorizationToken: infraToken,
    candidateIdentity,
  });
  const capabilityExpiresAt = Math.min(
    Date.parse(candidateIdentity.expiresAtUtc),
    Date.parse(request.openSourceBaseline.expiresAtUtc),
    dependencies.now().getTime() + D72_CANARY_MAX_CAPABILITY_AGE_MS,
  );
  if (capabilityExpiresAt <= dependencies.now().getTime() + 45_000)
    throw new Error(
      "La ventana OPEN restante no permite prueba y limpieza; requiere un recontrol fresco, sin ampliar el vencimiento.",
    );
  const grant = await runner.issueCapability({
    versionCertification,
    expiresAtUtc: new Date(capabilityExpiresAt).toISOString(),
    ...(testOnly ? { testOnlyNonce: "1".repeat(64) } : {}),
  });
  const statefulManifest = dependencies.createStatefulManifest({
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    artifactHash: candidateIdentity.artifactHash,
    canaryId: canaryBaseOptions.canaryId,
    canaryVersionId: versionCertification.candidateVersionId,
    canaryCapabilityGrant: grant,
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: candidateIdentity.openSourceBaselineSha256,
    now: dependencies.now(),
  });
  dependencies.emit(
    Object.freeze({
      status: "WAITING_GOOGLE_BROWSER_AUTHORIZATION",
      statefulManifestHash: statefulManifest.contentSha256,
      expiresAtUtc: statefulManifest.expiresAtUtc,
      authorizationPhrase:
        d72StatefulCanaryAuthorizationPhrase(statefulManifest),
      executedScope:
        "Two owner-controlled accounts: email and Google, consent rejection/withdrawal, old decision rejection, global session revocation and refresh rejection.",
      pendingScope:
        "MFA, mailbox delivery, Turnstile negative probes, private Storage/RLS, civic lifecycle and new-fixture deletion are NOT_VERIFIED.",
      existingAccountDeletionAuthorized: false,
      existingGoogleIdentityUnlinkAuthorized: false,
    }),
  );
  const statefulToken = runner.readAuthorization({
    kind: "stateful",
    bindings: {
      head: canaryBaseOptions.head,
      canaryId: canaryBaseOptions.canaryId,
      statefulManifestHash: statefulManifest.contentSha256,
    },
    ...(testOnly ? { confirmedAtUtc: dependencies.now().toISOString() } : {}),
  });
  const git = await dependencies.collectGit();
  if (git.head !== candidateIdentity.head)
    throw new Error("HEAD cambió antes del attach OPEN autorizado.");
  const planOptions = {
    ...canaryBaseOptions,
    ...recoveryPlan,
    versionCertification,
    zeroPercentDeploymentAuthorizationToken: infraToken,
    canaryCapabilityGrant: grant,
    ...(testOnly ? { now: dependencies.now() } : {}),
  };
  const plan = await dependencies.createZeroPercentPlan(planOptions);
  const session = await runner.attachAtZero({
    plan,
    planOptions,
    ...primary,
    artifactManifest: artifact.manifest,
    capabilityGrant: grant,
    authorizationToken: infraToken,
  });
  const bindings = {
    candidateIdentityHash: candidateIdentity.contentSha256,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    artifactHash: candidateIdentity.artifactHash,
    canaryVersionId: versionCertification.candidateVersionId,
    openSourceBaselineSha256: candidateIdentity.openSourceBaselineSha256,
  };
  let captureReceipt = null,
    cleanup = null,
    emergency = false;
  try {
    captureReceipt = await dependencies.captureGoogle({
      canarySession: session,
      bindings,
      statefulManifest,
      statefulAuthorizationToken: statefulToken,
    });
    const consentCleanupEvidence = dependencies.createConsentCleanupEvidence(
      captureReceipt,
      {
        ...bindings,
        attachedDeploymentId: session.attachedDeploymentId,
      },
    );
    cleanup = await runner.cleanupCanarySession(session, {
      consentCleanupEvidence,
    });
  } catch {
    emergency = true;
    cleanup = await runner.recoverOpenCanarySession(session);
  }
  const diagnosticOptions = {
    candidateIdentity,
    nonStatefulCertification: certification,
    request,
    artifactManifest: artifact.manifest,
  };
  const diagnostic = await dependencies.createOpenCaptureDiagnostic({
    ...diagnosticOptions,
    statefulManifest,
    captureReceipt,
    cleanupReceipt: cleanup,
    emergency,
  });
  const file = await dependencies.writeOpenDiagnostic({
    requestPath,
    worktreeRoot: repositoryRoot,
    certificate: diagnostic,
  });
  return Object.freeze({
    exitCode: 1,
    summary: Object.freeze({
      ...waiting,
      status: emergency
        ? "OPEN_CANARY_EMERGENCY_RECOVERED"
        : "OPEN_GOOGLE_CANARY_DIAGNOSTIC",
      canaryAttached: false,
      statefulCanaryExecuted: !!captureReceipt,
      cleanupVerified: !emergency && cleanup.cleanupVerified === true,
      recoveryVerified: emergency && cleanup.recoveryVerified === true,
      recoveryVersionId: emergency ? cleanup.recoveryVersionId : null,
      recoveryDeploymentId: emergency ? cleanup.recoveryDeploymentId : null,
      residualCleanup: emergency
        ? "CONSENT_AND_SESSION_CLEANUP_NOT_VERIFIED"
        : "NEW_FIXTURE_DELETION_NOT_VERIFIED",
      cleanupDeploymentId: cleanup.cleanupDeploymentId ?? null,
      promotionAllowed: false,
      canarySucceeded: false,
      diagnosticPath: file.path,
      diagnosticHash: file.contentSha256,
      statefulChecks:
        diagnostic.statefulReport?.evidence.map(({ checkId, status }) => ({
          checkId,
          status,
        })) ?? [],
    }),
  });
}

async function executeD72NonStatefulCertification({
  capability,
  dependencies,
  requestPath,
  repositoryRoot,
  stopAt,
}) {
  const testOnly = capability === TEST_ONLY_CAPABILITY;
  if (
    capability !== PRODUCTION_CAPABILITY &&
    capability !== TEST_ONLY_CAPABILITY
  ) {
    throw new Error("Capability D72 inválida.");
  }
  if (!testOnly && dependencies !== PRODUCTION_DEPENDENCIES) {
    throw new Error("La corrida productiva D72 no admite seams.");
  }
  if (!testOnly && repositoryRoot !== REPOSITORY_ROOT) {
    throw new Error("La corrida productiva D72 exige el repositorio fijado.");
  }
  if (
    ![null, "UPLOAD_AUTHORIZATION", "ZERO_PERCENT_AUTHORIZATION"].includes(
      stopAt,
    ) ||
    (!testOnly && stopAt !== null)
  ) {
    throw new Error("El punto de detención D72 sólo existe en testOnly.");
  }

  // Esta primera lectura es deliberadamente anterior a toda creación local o
  // consulta remota: un HEAD no recuperable no genera request ni artifact.
  const preIdentityGitReceipt = await dependencies.collectGit();
  const request = await dependencies.createRequest({
    head: preIdentityGitReceipt.head,
    now: dependencies.now(),
    requestPath,
    worktreeRoot: repositoryRoot,
  });
  const requestHash = exceptionalReleaseRequestHash(request);
  const freezeOptions = {
    repositoryRoot,
    requestPath,
    head: preIdentityGitReceipt.head,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash,
  };
  let recoveryArtifact = null;
  let recoveryCompatibility = null;
  if (request.releaseMode === "OPEN_UPDATE") {
    await dependencies.buildCandidate({
      requestPath,
      repositoryRoot,
      artifactPurpose: "recovery",
    });
    recoveryArtifact = await dependencies.freezeArtifact({
      ...freezeOptions,
      artifactPurpose: "recovery",
    });
    if (typeof dependencies.collectRecoveryCompatibility !== "function")
      throw new Error(
        "La corrida OPEN exige productor local de compatibilidad fallback.",
      );
    recoveryCompatibility = await dependencies.collectRecoveryCompatibility({
      repositoryRoot,
      request,
      requestPath,
      recoveryArtifact,
    });
  }
  await dependencies.buildCandidate({ requestPath, repositoryRoot });
  const postBuildGitReceipt = await dependencies.collectGit();
  const artifact = await dependencies.freezeArtifact(freezeOptions);
  const candidateIdentity = await dependencies.createCandidateIdentity({
    gitReceipt: postBuildGitReceipt,
    request,
    artifactManifest: artifact.manifest,
    artifactRoot: artifact.artifactRoot,
    worktreeRoot: repositoryRoot,
  });

  // El segundo receipt acredita el estado Git una vez congelada la identidad;
  // nunca se sustituye por el receipt pre-identidad conservado como autoridad.
  await dependencies.collectGit();
  const supabaseReceipt = await dependencies.runSupabaseReadonly();
  const supabaseCheckpoint = await dependencies.inspectSupabaseCheckpoint({
    candidateIdentity,
    supabaseReceipt,
    now: dependencies.now(),
  });
  if (!supabaseCheckpoint.allowed) {
    return Object.freeze({
      exitCode: 1,
      summary: blockedPreSmokeEvidenceSummary({
        artifact,
        candidateIdentity,
        observedGates: [
          {
            gateId: "source.git-head-clean-and-recoverable",
            status: EVIDENCE_STATUS.PASS,
          },
          ...supabaseCheckpoint.gates,
        ],
        status: "BLOCKED_SUPABASE_CHECKPOINT",
      }),
    });
  }
  const compositeReceipt = await dependencies.collectComposite({
    artifactManifest: artifact.manifest,
    artifactRoot: artifact.artifactRoot,
    candidateIdentity,
    dnsTokenFile: testOnly ? "/test-only/dns-token" : productionDnsTokenFile(),
    repositoryRoot,
    supabaseReceipt,
  });
  // La suite/consulta compuesta puede ser larga. Sólo este receipt Git fresco,
  // obtenido inmediatamente antes de permitir el POST smoke, llega al bundle.
  const preSmokeGitReceipt = await dependencies.collectGit();
  const preSmokeEvidence = await dependencies.inspectPreSmokeEvidence({
    candidateIdentity,
    compositeReceipt,
    gitReceipt: preSmokeGitReceipt,
    now: dependencies.now(),
    supabaseReceipt,
  });
  if (!preSmokeEvidence.allowed) {
    return Object.freeze({
      exitCode: 1,
      summary: blockedPreSmokeEvidenceSummary({
        artifact,
        candidateIdentity,
        observedGates: preSmokeEvidence.gates,
        status: "BLOCKED_PRE_SMOKE_EVIDENCE",
      }),
    });
  }
  if (candidateIdentity.releaseMode === "OPEN_UPDATE") {
    if (typeof dependencies.runOpenSourceSmoke !== "function")
      throw new Error("Falta el collector OPEN_SOURCE del mismo proceso.");
    const openSourceSmokeReceipt = await dependencies.runOpenSourceSmoke({
      baseline: request.openSourceBaseline,
      expectedBaselineSha256: candidateIdentity.openSourceBaselineSha256,
    });
    const collectorBundle = await dependencies.issueCollectorBundle({
      candidateIdentity,
      openSourceProductionSmokeReceipt: openSourceSmokeReceipt,
      compositeReceipt,
      gitReceipt: preSmokeGitReceipt,
      supabaseReceipt,
    });
    const certification = await dependencies.createCertification({
      candidateIdentity,
      collectorBundle,
    });
    const summary = sanitizedSummary({
      artifact,
      candidateIdentity,
      certification,
      openSourceSmokeReceipt,
    });
    if (!summary.canaryPreparationAllowed) {
      return Object.freeze({ exitCode: 1, summary });
    }
    await dependencies.assertCanaryAllowed(certification, {
      candidateIdentity,
      expectedArtifactHash: candidateIdentity.artifactHash,
      expectedHead: candidateIdentity.head,
      expectedRequestHash: candidateIdentity.requestHash,
    });
    if (
      !recoveryArtifact ||
      artifact.manifest.recoveryArtifactHash !==
        recoveryArtifact.artifactHash ||
      typeof dependencies.createOpenDiagnostic !== "function" ||
      typeof dependencies.writeOpenDiagnostic !== "function"
    ) {
      throw new Error(
        "La preparación OPEN exige fallback fijado y emisor de diagnóstico.",
      );
    }
    const canaryBaseOptions = {
      repositoryRoot,
      artifactRoot: artifact.artifactRoot,
      nodeExecutable: process.execPath,
      nodeVersion: D72_CANARY_NODE_VERSION,
      wranglerVersion: D72_CANARY_WRANGLER_VERSION,
      head: candidateIdentity.head,
      requestHash: candidateIdentity.requestHash,
      policyHash: candidateIdentity.policyHash,
      artifactHash: candidateIdentity.artifactHash,
      canaryId: `d72-canary-${candidateIdentity.head.slice(0, 16)}`,
      releaseMode: "OPEN_UPDATE",
      openSourceBaseline: request.openSourceBaseline,
      openSourceBaselineSha256: candidateIdentity.openSourceBaselineSha256,
      sourceDeploymentId: openSourceSmokeReceipt.activeDeploymentId,
      sourceVersionId: openSourceSmokeReceipt.activeVersionId,
    };
    const primaryUploadOptions = {
      ...canaryBaseOptions,
      candidateIdentity,
      nonStatefulCertification: certification,
      ...(testOnly ? { testOnlyEvidence: true, now: dependencies.now() } : {}),
    };
    const recoveryUploadOptions = {
      ...primaryUploadOptions,
      artifactRoot: recoveryArtifact.artifactRoot,
      artifactPurpose: "recovery",
      uploadArtifactHash: recoveryArtifact.artifactHash,
      primaryArtifactManifest: artifact.manifest,
      recoveryArtifactManifest: recoveryArtifact.manifest,
    };
    const recoveryUploadPreview = await dependencies.createUploadPreview(
      recoveryUploadOptions,
    );
    const primaryUploadPreview =
      await dependencies.createUploadPreview(primaryUploadOptions);
    const preparedSummary = Object.freeze({
      ...summary,
      status: "OPEN_CANDIDATES_PREPARED",
      recoveryArtifactHash: recoveryArtifact.artifactHash,
      promotionAllowed: false,
      productionCanaryReady: false,
      openSourceReadsCertified: true,
      statefulCanaryExecuted: false,
      primaryUploadPreview,
      recoveryUploadPreview,
    });
    dependencies.emit(preparedSummary);
    if (stopAt === "UPLOAD_AUTHORIZATION") {
      const diagnostic = await dependencies.createOpenDiagnostic({
        candidateIdentity,
        nonStatefulCertification: certification,
        request,
        artifactManifest: artifact.manifest,
        ...(testOnly ? { testOnly: true, now: dependencies.now() } : {}),
      });
      const file = await dependencies.writeOpenDiagnostic({
        requestPath,
        worktreeRoot: repositoryRoot,
        certificate: diagnostic,
      });
      return Object.freeze({
        exitCode: 0,
        summary: Object.freeze({
          ...preparedSummary,
          diagnosticPath: file.path,
          diagnosticHash: file.contentSha256,
        }),
      });
    }
    return executeD72OpenCanaryStages({
      dependencies,
      testOnly,
      stopAt,
      requestPath,
      repositoryRoot,
      request,
      artifact,
      recoveryArtifact,
      recoveryCompatibility,
      candidateIdentity,
      certification,
      canaryBaseOptions,
      primaryUploadOptions,
      recoveryUploadOptions,
      preparedSummary,
    });
  }
  const closedNoWritePreproof = await dependencies.prepareClosedNoWriteProof({
    candidateIdentity,
    artifactManifest: artifact.manifest,
    artifactRoot: artifact.artifactRoot,
    worktreeRoot: repositoryRoot,
  });
  if (closedNoWritePreproof.status !== EVIDENCE_STATUS.PASS) {
    return Object.freeze({
      exitCode: 1,
      summary: blockedClosedNoWritePreproofSummary({
        artifact,
        candidateIdentity,
        preSmokeGates: preSmokeEvidence.gates,
        preproof: closedNoWritePreproof,
      }),
    });
  }
  const closedSmokeReceipt = await dependencies.runClosedSmoke();
  const closedNoWriteProofReceipt =
    await dependencies.completeClosedNoWriteProof({
      preproof: closedNoWritePreproof,
      candidateIdentity,
      artifactManifest: artifact.manifest,
      artifactRoot: artifact.artifactRoot,
      worktreeRoot: repositoryRoot,
      closedProductionSmokeReceipt: closedSmokeReceipt,
    });
  const collectorBundle = await dependencies.issueCollectorBundle({
    candidateIdentity,
    closedNoWritePreproof,
    closedNoWriteProofReceipt,
    closedProductionSmokeReceipt: closedSmokeReceipt,
    compositeReceipt,
    gitReceipt: preSmokeGitReceipt,
    supabaseReceipt,
  });
  const certification = await dependencies.createCertification({
    candidateIdentity,
    collectorBundle,
  });
  const blockers = d72NonStatefulEvidenceBlockers(certification);
  if (
    blockers.length === 0 &&
    certification.canaryPreparationAllowed === true
  ) {
    await dependencies.assertCanaryAllowed(certification, {
      candidateIdentity,
      expectedArtifactHash: candidateIdentity.artifactHash,
      expectedHead: candidateIdentity.head,
      expectedRequestHash: candidateIdentity.requestHash,
    });
  }
  const summary = sanitizedSummary({
    artifact,
    candidateIdentity,
    certification,
    closedSmokeReceipt,
  });
  if (!summary.canaryPreparationAllowed) {
    return Object.freeze({ exitCode: 1, summary });
  }

  const canaryBaseOptions = Object.freeze({
    repositoryRoot,
    artifactRoot: artifact.artifactRoot,
    nodeExecutable: process.execPath,
    nodeVersion: D72_CANARY_NODE_VERSION,
    wranglerVersion: D72_CANARY_WRANGLER_VERSION,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    policyHash: candidateIdentity.policyHash,
    artifactHash: candidateIdentity.artifactHash,
    canaryId: `d72-canary-${candidateIdentity.head.slice(0, 16)}`,
    closedDeploymentId: closedSmokeReceipt.activeDeploymentId,
    closedVersionId: closedSmokeReceipt.activeVersionId,
  });
  const uploadPreviewOptions = {
    ...canaryBaseOptions,
    candidateIdentity,
    nonStatefulCertification: certification,
    ...(testOnly ? { testOnlyEvidence: true, now: dependencies.now() } : {}),
  };
  const uploadPreview =
    await dependencies.createUploadPreview(uploadPreviewOptions);
  const uploadWaiting = Object.freeze({
    schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
    status: "WAITING_UPLOAD_AUTHORIZATION",
    certification: summary,
    uploadPreview,
    versionUploadExecuted: false,
    canaryAttached: false,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    remoteMutationExecuted: false,
  });
  dependencies.emit(uploadWaiting);
  if (stopAt === "UPLOAD_AUTHORIZATION") {
    return Object.freeze({ exitCode: 0, summary: uploadWaiting });
  }

  const canaryRunner = dependencies.createCanaryRunner();
  const uploadAuthorizationBindings = Object.freeze({
    head: canaryBaseOptions.head,
    requestHash: canaryBaseOptions.requestHash,
    policyHash: canaryBaseOptions.policyHash,
    artifactHash: canaryBaseOptions.artifactHash,
    workerName: D72_CANARY_WORKER_NAME,
    closedVersionId: canaryBaseOptions.closedVersionId,
  });
  const uploadAuthorizationToken = canaryRunner.readAuthorization({
    kind: "version-upload",
    bindings: uploadAuthorizationBindings,
    ...(testOnly ? { confirmedAtUtc: dependencies.now().toISOString() } : {}),
  });

  // La confirmación humana puede demorar. Revalidamos Git después de leerla y
  // justo antes de crear/ejecutar el plan mutante; ninguna autoridad conservada
  // en memoria permite subir una Version si HEAD dejó de ser el certificado.
  const preUploadGitReceipt = await dependencies.collectGit();
  if (preUploadGitReceipt?.head !== candidateIdentity.head) {
    throw new Error(
      "El estado Git cambió antes del upload D72; la identidad candidata quedó invalidada.",
    );
  }
  const uploadPlanOptions = {
    ...canaryBaseOptions,
    candidateIdentity,
    nonStatefulCertification: certification,
    versionUploadAuthorizationToken: uploadAuthorizationToken,
    ...(testOnly ? { testOnlyEvidence: true, now: dependencies.now() } : {}),
  };
  const uploadPlan = await dependencies.createUploadPlan(uploadPlanOptions);
  const uploadReceipt = await canaryRunner.uploadVersion({
    uploadPlan,
    uploadPlanOptions,
    artifactManifest: artifact.manifest,
    authorizationToken: uploadAuthorizationToken,
  });
  const versionCertification = await canaryRunner.certifyVersion({
    uploadPlan,
    uploadPlanOptions,
    uploadReceipt,
    artifactManifest: artifact.manifest,
  });
  const capabilityReadiness =
    canaryRunner.inspectCapabilityReadiness(versionCertification);
  const versionCertificationHash =
    d72CanaryVersionCertificationHash(versionCertification);
  if (capabilityReadiness.ready !== true) {
    const blocked = Object.freeze({
      schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
      status: "BLOCKED_AFTER_VERSION_RECERTIFICATION",
      head: canaryBaseOptions.head,
      requestHash: canaryBaseOptions.requestHash,
      policyHash: canaryBaseOptions.policyHash,
      artifactHash: canaryBaseOptions.artifactHash,
      candidateVersionId: versionCertification.candidateVersionId,
      versionCertificationHash,
      blocker: capabilityReadiness.blocker,
      staticAssetsVerified: false,
      versionUploadExecuted: true,
      canaryAttached: false,
      deploymentAuthorized: false,
      deploymentExecuted: false,
      remoteMutationExecuted: true,
    });
    return Object.freeze({ exitCode: 1, summary: blocked });
  }

  const capabilityIssuedAt = dependencies.now();
  if (
    !(capabilityIssuedAt instanceof Date) ||
    !Number.isFinite(capabilityIssuedAt.getTime())
  ) {
    throw new Error("El reloj de capability D72 no es válido.");
  }
  const capabilityGrant = await canaryRunner.issueCapability({
    versionCertification,
    expiresAtUtc: new Date(
      capabilityIssuedAt.getTime() +
        Math.min(D72_CANARY_MAX_CAPABILITY_AGE_MS, 15 * 60 * 1_000),
    ).toISOString(),
    ...(testOnly ? { testOnlyNonce: "1".repeat(64) } : {}),
  });
  const zeroPercentAuthorizationBindings = Object.freeze({
    head: canaryBaseOptions.head,
    requestHash: canaryBaseOptions.requestHash,
    policyHash: canaryBaseOptions.policyHash,
    artifactHash: canaryBaseOptions.artifactHash,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    closedDeploymentId: canaryBaseOptions.closedDeploymentId,
    closedVersionId: canaryBaseOptions.closedVersionId,
    candidateVersionId: versionCertification.candidateVersionId,
    versionCertificationHash,
  });
  const zeroPercentWaiting = Object.freeze({
    schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
    status: "WAITING_ZERO_PERCENT_AUTHORIZATION",
    head: canaryBaseOptions.head,
    requestHash: canaryBaseOptions.requestHash,
    policyHash: canaryBaseOptions.policyHash,
    artifactHash: canaryBaseOptions.artifactHash,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    closedDeploymentId: canaryBaseOptions.closedDeploymentId,
    closedVersionId: canaryBaseOptions.closedVersionId,
    candidateVersionId: versionCertification.candidateVersionId,
    closedTrafficPercentage: 100,
    candidateTrafficPercentage: 0,
    versionCertificationHash,
    remoteArtifactProofHash: capabilityReadiness.remoteArtifactProofHash,
    staticAssetsVerified: true,
    authorizationPhrase: d72CanaryInfrastructureAuthorizationPhrase(
      zeroPercentAuthorizationBindings,
    ),
    versionUploadExecuted: true,
    canaryAttached: false,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    remoteMutationExecuted: true,
  });
  dependencies.emit(zeroPercentWaiting);
  if (stopAt === "ZERO_PERCENT_AUTHORIZATION") {
    return Object.freeze({ exitCode: 0, summary: zeroPercentWaiting });
  }

  const zeroPercentAuthorizationToken = canaryRunner.readAuthorization({
    kind: "zero-percent-deployment",
    bindings: zeroPercentAuthorizationBindings,
    ...(testOnly ? { confirmedAtUtc: dependencies.now().toISOString() } : {}),
  });
  const zeroPercentPlanOptions = {
    ...canaryBaseOptions,
    versionCertification,
    zeroPercentDeploymentAuthorizationToken: zeroPercentAuthorizationToken,
    canaryCapabilityGrant: capabilityGrant,
    ...(testOnly ? { now: dependencies.now() } : {}),
  };
  const zeroPercentPlan = await dependencies.createZeroPercentPlan(
    zeroPercentPlanOptions,
  );
  const canarySession = await canaryRunner.attachAtZero({
    plan: zeroPercentPlan,
    planOptions: zeroPercentPlanOptions,
    uploadPlan,
    uploadPlanOptions,
    artifactManifest: artifact.manifest,
    capabilityGrant,
    authorizationToken: zeroPercentAuthorizationToken,
  });
  let cleanup;
  try {
    await canaryRunner.assertCanarySessionStillAttached(canarySession);
  } finally {
    // Una vez creado el deployment 100/0, todo camino de salida intenta volver
    // a CLOSED 100%. No hay manifiesto stateful dentro de este runner.
    cleanup = await canaryRunner.cleanupCanarySession(canarySession);
  }
  return Object.freeze({
    exitCode: 0,
    summary: Object.freeze({
      schemaVersion: D72_NON_STATEFUL_CERTIFICATION_RUN_SCHEMA_VERSION,
      status: "ZERO_PERCENT_ATTACHED_AND_CLOSED_RESTORED",
      head: canaryBaseOptions.head,
      requestHash: canaryBaseOptions.requestHash,
      policyHash: canaryBaseOptions.policyHash,
      artifactHash: canaryBaseOptions.artifactHash,
      candidateVersionId: versionCertification.candidateVersionId,
      versionCertificationHash,
      canaryDeploymentExecuted: true,
      canaryAttached: false,
      cleanupVerified: cleanup.cleanupVerified === true,
      closedDeploymentId: cleanup.closedDeploymentId,
      closedVersionId: cleanup.closedVersionId,
      deploymentAuthorized: false,
      deploymentExecuted: false,
      remoteMutationExecuted: true,
    }),
  });
}

export async function runD72NonStatefulCertificationTestHarness(options = {}) {
  if (
    !exactKeys(options, [
      "dependencies",
      "repositoryRoot",
      "requestPath",
      "stopAt",
      "testOnly",
    ]) ||
    options.testOnly !== true ||
    typeof options.repositoryRoot !== "string" ||
    typeof options.requestPath !== "string"
  ) {
    throw new Error(
      "El harness D72 requiere testOnly=true, rutas y todas las dependencias explícitas.",
    );
  }
  assertHarnessDependencies(options.dependencies);
  return executeD72NonStatefulCertification({
    capability: TEST_ONLY_CAPABILITY,
    dependencies: options.dependencies,
    requestPath: options.requestPath,
    repositoryRoot: options.repositoryRoot,
    stopAt: options.stopAt,
  });
}

export function createD72ExceptionalRequestFileTestHarness(options = {}) {
  if (
    !exactKeys(options, [
      "head",
      "now",
      "requestPath",
      "testOnly",
      "worktreeRoot",
    ]) ||
    options.testOnly !== true
  ) {
    throw new Error(
      "El writer de request fixture exige testOnly=true y opciones cerradas.",
    );
  }
  return createD72ExceptionalRequestFile(options);
}

function parseProductionArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 2 ||
    argv[0] !== "--request" ||
    typeof argv[1] !== "string" ||
    !path.isAbsolute(argv[1]) ||
    path.resolve(argv[1]) !== argv[1]
  ) {
    throw new Error(
      "Uso: run-d72-non-stateful-certification.mjs --request <ruta-absoluta-nueva.json>",
    );
  }
  return argv[1];
}

async function main() {
  const requestPath = parseProductionArguments(process.argv.slice(2));
  const result = await executeD72NonStatefulCertification({
    capability: PRODUCTION_CAPABILITY,
    dependencies: PRODUCTION_DEPENDENCIES,
    requestPath,
    repositoryRoot: REPOSITORY_ROOT,
    stopAt: null,
  });
  PRODUCTION_DEPENDENCIES.emit(result.summary);
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch(() => {
    process.stderr.write("Certificación no-stateful D72: BLOQUEADA\n");
    process.exitCode = 1;
  });
}
