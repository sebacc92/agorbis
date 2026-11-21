import { createHash, randomUUID } from "node:crypto";
import {
  assertExceptionalReleaseRequest,
  exceptionalReleaseRequestHash,
} from "./exceptional-release-act.mjs";
import {
  exceptionalReleaseArtifactHash,
  validateExceptionalReleaseArtifact,
} from "./exceptional-release-artifact.mjs";
import { assertClosedProductionSmokeReceipt } from "./cloudflare-closed-smoke-policy.mjs";
import {
  assertOpenSourceProductionSmokeReceipt,
  openSourceProductionSmokeHash,
} from "./cloudflare-open-source-smoke-policy.mjs";
import { assertOpenReleaseBaselineRecord } from "./open-release-baseline-policy.mjs";
import {
  D72_COMPOSITE_NON_STATEFUL_GATE_IDS,
  assertD72NonStatefulCompositeCollectorReceipt,
} from "./d72-non-stateful-composite-collector.mjs";
import { assertD72ClosedNoWriteProofReceipt } from "./d72-closed-no-write-proof.mjs";
import { assertIssuedD72GitCurrentStateReceipt } from "./d72-git-current-state.mjs";
import { D72_SUPABASE_GATE_IDS } from "./d72-supabase-readonly-policy.mjs";
import {
  NON_STATEFUL_GATE_IDS,
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
  STATEFUL_CANARY_REQUIRED_GATE_IDS,
  d72ReleaseEvidenceProfile,
  getNonWaivableGateEvidenceDefinitionForRelease,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EVIDENCE_STATUS,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  RAW_RESULT,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";
import { assertD72SupabaseReadonlyReceipt } from "./run-d72-supabase-readonly.mjs";

export const D72_NON_WAIVABLE_EVIDENCE_SCHEMA_VERSION =
  "agorbis-d72-non-waivable-evidence/v2";
export const D72_NON_WAIVABLE_EVIDENCE_VALIDITY_MS = 60 * 60 * 1_000;
export const D72_CANDIDATE_IDENTITY_SCHEMA_VERSION =
  "agorbis-d72-candidate-identity/v1";
export const D72_NON_STATEFUL_EVIDENCE_SCHEMA_VERSION =
  "agorbis-d72-non-stateful-evidence/v2";
export const D72_CANDIDATE_INVALIDATION_SCHEMA_VERSION =
  "agorbis-d72-candidate-invalidation/v1";
export const D72_NON_STATEFUL_COLLECTOR_BUNDLE_SCHEMA_VERSION =
  "agorbis-d72-non-stateful-collector-bundle/v1";
export const D72_CANDIDATE_IDENTITY_VALIDITY_MS = 60 * 60 * 1_000;
export const D72_CANDIDATE_IDENTITY_DISPOSITION = Object.freeze({
  CERTIFIED: "CERTIFIED",
  INVALIDATED: "REQUEST_AND_ARTIFACT_INVALIDATED",
});

// Candidate identity and evidence certification are authorization-adjacent
// process capabilities, not merely self-hashed JSON. A serialized clone remains
// auditable but cannot start a canary stage in this process. This intentionally
// fails closed across process boundaries; a future persistent ledger would be
// required to make revocation survive a restart.
const CANDIDATE_IDENTITY_STATE = new WeakMap();
const ISSUED_NON_STATEFUL_CERTIFICATIONS = new WeakMap();
const PRODUCTION_CANDIDATE_IDENTITIES = new WeakSet();
const TEST_ONLY_CANDIDATE_IDENTITIES = new WeakSet();
const PRODUCTION_NON_STATEFUL_CERTIFICATIONS = new WeakSet();
const TEST_ONLY_NON_STATEFUL_CERTIFICATIONS = new WeakSet();
const PRODUCTION_CANDIDATE_AUTHORITY = new WeakMap();
const ISSUED_NON_STATEFUL_COLLECTOR_BUNDLES = new WeakMap();
const CANDIDATE_BINDING_STATE = new Map();

const ALLOWED_STATUS = new Set([
  EVIDENCE_STATUS.PASS,
  EVIDENCE_STATUS.FAIL,
  EVIDENCE_STATUS.NOT_VERIFIED,
]);
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECEIPT_KEYS = Object.freeze([
  "artifactHash",
  "candidateIdentityHash",
  "canaryExecuted",
  "canaryReportHash",
  "completedAtUtc",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "expiresAtUtc",
  "gates",
  "head",
  "policyHash",
  "policyVersion",
  "requestHash",
  "runId",
  "schemaVersion",
  "startedAtUtc",
]);
const CANDIDATE_IDENTITY_KEYS = Object.freeze([
  "actIssued",
  "artifactHash",
  "contentSha256",
  "createdAtUtc",
  "deploymentAuthorized",
  "deploymentExecuted",
  "diffCheckClean",
  "expiresAtUtc",
  "head",
  "leftCount",
  "originMain",
  "phase",
  "policyHash",
  "policyVersion",
  "requestHash",
  "rightCount",
  "riskAcceptanceRecorded",
  "schemaVersion",
  "worktreeClean",
]);
const NON_STATEFUL_CERTIFICATION_KEYS = Object.freeze([
  "actIssued",
  "artifactHash",
  "candidateIdentityDisposition",
  "candidateIdentityHash",
  "canaryPreparationAllowed",
  "completedAtUtc",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "expiresAtUtc",
  "gates",
  "head",
  "invalidationReceipt",
  "invalidationReceiptHash",
  "phase",
  "policyHash",
  "policyVersion",
  "requestHash",
  "riskAcceptanceRecorded",
  "runId",
  "schemaVersion",
  "startedAtUtc",
]);
const INVALIDATION_RECEIPT_KEYS = Object.freeze([
  "blockers",
  "candidateIdentityHash",
  "disposition",
  "invalidatedAtUtc",
  "runId",
  "schemaVersion",
]);
const GATE_KEYS = Object.freeze([
  "evidenceStatus",
  "gateId",
  "rawResult",
  "sourceEvidence",
]);
const SOURCE_KEYS = Object.freeze([
  "digest",
  "observedAtUtc",
  "sourceId",
  "status",
]);

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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function canonicalD72NonWaivableEvidenceJson(value) {
  const serialized = JSON.stringify(canonicalize(value));
  if (typeof serialized !== "string") {
    throw new Error("La evidencia D72 no puede serializarse.");
  }
  return `${serialized}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function d72NonWaivableEvidenceHash(receiptOrPayload) {
  if (!isPlainObject(receiptOrPayload)) {
    throw new Error("La evidencia D72 debe ser un objeto plano.");
  }
  const { contentSha256: _contentSha256, ...payload } = receiptOrPayload;
  return sha256(canonicalD72NonWaivableEvidenceJson(payload));
}

function contentHash(record, label) {
  if (!isPlainObject(record)) throw new Error(`${label} debe ser un objeto.`);
  const { contentSha256: _contentSha256, ...payload } = record;
  return sha256(canonicalD72NonWaivableEvidenceJson(payload));
}

export function d72CandidateIdentityHash(identityOrPayload) {
  return contentHash(identityOrPayload, "candidate identity D72");
}

function candidateBindingKey(candidate) {
  return sha256(
    canonicalD72NonWaivableEvidenceJson({
      artifactHash: candidate.artifactHash,
      head: candidate.head,
      policyHash: candidate.policyHash ?? RELEASE_GATE_POLICY_SHA256,
      requestHash: candidate.requestHash,
    }),
  );
}

export function d72NonStatefulEvidenceCertificationHash(
  certificationOrPayload,
) {
  return contentHash(certificationOrPayload, "certificación no-stateful D72");
}

export function d72CandidateInvalidationReceiptHash(receipt) {
  return contentHash(receipt, "receipt de invalidación D72");
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

function expectedGateStatus(sourceEvidence) {
  if (sourceEvidence.some(({ status }) => status === EVIDENCE_STATUS.FAIL)) {
    return EVIDENCE_STATUS.FAIL;
  }
  if (
    sourceEvidence.length > 0 &&
    sourceEvidence.every(({ status }) => status === EVIDENCE_STATUS.PASS)
  ) {
    return EVIDENCE_STATUS.PASS;
  }
  return EVIDENCE_STATUS.NOT_VERIFIED;
}

function expectedRawResult(evidenceStatus) {
  return evidenceStatus === EVIDENCE_STATUS.PASS
    ? RAW_RESULT.PASS
    : RAW_RESULT.FAIL;
}

function sourceErrors(source, expectedSourceId, window, label) {
  const errors = [];
  if (!sameKeys(source, SOURCE_KEYS)) {
    return [`${label} contiene campos faltantes o no aprobados.`];
  }
  if (source.sourceId !== expectedSourceId) {
    errors.push(`${label}.sourceId no coincide con el catálogo actual.`);
  }
  if (!ALLOWED_STATUS.has(source.status)) {
    errors.push(`${label}.status no es factual para un gate no renunciable.`);
  }
  if (!SHA256_PATTERN.test(source.digest ?? "")) {
    errors.push(`${label}.digest no es un SHA-256 saneado.`);
  }
  const observedAt = canonicalInstant(source.observedAtUtc);
  if (
    !observedAt ||
    !window.startedAt ||
    !window.completedAt ||
    observedAt < window.startedAt ||
    observedAt > window.completedAt
  ) {
    errors.push(`${label} no fue observada dentro de esta corrida.`);
  }
  return errors;
}

function gateErrors(gate, definition, window, receipt) {
  const errors = [];
  const label = `gate ${definition.gateId}`;
  if (!sameKeys(gate, GATE_KEYS)) {
    return [`${label} contiene campos faltantes o no aprobados.`];
  }
  if (gate.gateId !== definition.gateId) {
    errors.push(`${label}.gateId no conserva el orden canónico.`);
  }
  if (!Array.isArray(gate.sourceEvidence)) {
    errors.push(`${label}.sourceEvidence no es un array.`);
    return errors;
  }
  if (gate.sourceEvidence.length !== definition.sourceIds.length) {
    errors.push(`${label} no contiene exactamente todas sus fuentes actuales.`);
  }
  for (const [index, sourceId] of definition.sourceIds.entries()) {
    errors.push(
      ...sourceErrors(
        gate.sourceEvidence[index],
        sourceId,
        window,
        `${label}.sourceEvidence[${index}]`,
      ),
    );
  }
  if (gate.sourceEvidence.length === definition.sourceIds.length) {
    const expectedStatus = expectedGateStatus(gate.sourceEvidence);
    if (gate.evidenceStatus !== expectedStatus) {
      errors.push(`${label}.evidenceStatus no deriva de sus fuentes actuales.`);
    }
    if (gate.rawResult !== expectedRawResult(expectedStatus)) {
      errors.push(`${label}.rawResult no deriva del estado factual.`);
    }
  }
  if (
    gate.evidenceStatus === EVIDENCE_STATUS.PASS &&
    definition.canaryRequired &&
    (receipt.canaryExecuted !== true ||
      !SHA256_PATTERN.test(receipt.canaryReportHash ?? ""))
  ) {
    errors.push(`${label} no puede pasar sin report canario actual.`);
  }
  return errors;
}

function candidateIdentityWindowErrors(identity, now) {
  const errors = [];
  const createdAt = canonicalInstant(identity.createdAtUtc);
  const expiresAt = canonicalInstant(identity.expiresAtUtc);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (
    !createdAt ||
    !expiresAt ||
    !Number.isFinite(current.getTime()) ||
    expiresAt <= createdAt ||
    expiresAt.getTime() - createdAt.getTime() >
      D72_CANDIDATE_IDENTITY_VALIDITY_MS
  ) {
    errors.push("La ventana temporal de candidate identity D72 es inválida.");
  } else if (current >= expiresAt) {
    errors.push("La candidate identity D72 está vencida.");
  }
  return errors;
}

export function validateD72CandidateIdentity(
  identity,
  {
    expectedHead,
    expectedRequestHash,
    expectedArtifactHash,
    now = new Date(),
  } = {},
) {
  const errors = [];
  let releaseProfile;
  try {
    releaseProfile = d72ReleaseEvidenceProfile(identity ?? {});
  } catch {
    return Object.freeze(["Perfil o baseline de candidate identity inválido."]);
  }
  if (
    !sameKeys(identity, [
      ...CANDIDATE_IDENTITY_KEYS,
      ...Object.keys(releaseProfile),
    ])
  ) {
    return Object.freeze([
      "La candidate identity D72 contiene campos faltantes o no aprobados.",
    ]);
  }
  if (
    identity.schemaVersion !== D72_CANDIDATE_IDENTITY_SCHEMA_VERSION ||
    identity.phase !== "candidate_identity"
  ) {
    errors.push("La candidate identity D72 no usa la fase/schema canónicos.");
  }
  if (
    identity.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    identity.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("La candidate identity D72 no usa la policy canónica actual.");
  }
  for (const [field, expected, pattern] of [
    ["head", expectedHead, FULL_HEAD_PATTERN],
    ["requestHash", expectedRequestHash, SHA256_PATTERN],
    ["artifactHash", expectedArtifactHash, SHA256_PATTERN],
  ]) {
    if (!pattern.test(identity[field] ?? "") || identity[field] !== expected) {
      errors.push(`${field} de candidate identity D72 no coincide.`);
    }
  }
  if (
    identity.originMain !== identity.head ||
    identity.leftCount !== 0 ||
    identity.rightCount !== 0 ||
    identity.worktreeClean !== true ||
    identity.diffCheckClean !== true
  ) {
    errors.push(
      "La candidate identity D72 exige HEAD=origin/main, divergencia 0/0 y worktree/diff limpios.",
    );
  }
  if (
    identity.deploymentAuthorized !== false ||
    identity.deploymentExecuted !== false ||
    identity.actIssued !== false ||
    identity.riskAcceptanceRecorded !== false
  ) {
    errors.push(
      "La candidate identity local no autoriza/ejecuta deploy, no emite acta ni acepta riesgos.",
    );
  }
  errors.push(...candidateIdentityWindowErrors(identity, now));
  if (
    !SHA256_PATTERN.test(identity.contentSha256 ?? "") ||
    identity.contentSha256 !== d72CandidateIdentityHash(identity)
  ) {
    errors.push("contentSha256 no sella la candidate identity D72.");
  }
  return Object.freeze([...new Set(errors)]);
}

function issueD72CandidateIdentity(
  {
    head,
    originMain,
    leftCount,
    rightCount,
    worktreeClean,
    diffCheckClean,
    requestHash,
    artifactHash,
    createdAtUtc,
    expiresAtUtc,
    releaseMode,
    openSourceBaselineSha256,
  },
  { productionAuthority = null, testOnly = false } = {},
) {
  const payload = {
    ...(releaseMode === undefined && openSourceBaselineSha256 === undefined
      ? {}
      : d72ReleaseEvidenceProfile({ releaseMode, openSourceBaselineSha256 })),
    schemaVersion: D72_CANDIDATE_IDENTITY_SCHEMA_VERSION,
    phase: "candidate_identity",
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head,
    originMain,
    leftCount,
    rightCount,
    worktreeClean,
    diffCheckClean,
    requestHash,
    artifactHash,
    createdAtUtc,
    expiresAtUtc,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
  };
  const identity = {
    ...payload,
    contentSha256: d72CandidateIdentityHash(payload),
  };
  const bindingKey = candidateBindingKey(identity);
  if (CANDIDATE_BINDING_STATE.has(bindingKey)) {
    throw new Error(
      "El mismo HEAD/request/artifact D72 ya fue emitido, consumido o invalidado; se exige request y artifact nuevos.",
    );
  }
  const errors = validateD72CandidateIdentity(identity, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
    now: createdAtUtc,
  });
  if (errors.length > 0) {
    throw new Error(`Candidate identity D72 inválida:\n${errors.join("\n")}`);
  }
  const issuedIdentity = deepFreeze(identity);
  CANDIDATE_IDENTITY_STATE.set(issuedIdentity, "fresh");
  CANDIDATE_BINDING_STATE.set(
    bindingKey,
    Object.freeze({ identity: issuedIdentity, state: "fresh", testOnly }),
  );
  if (testOnly) {
    TEST_ONLY_CANDIDATE_IDENTITIES.add(issuedIdentity);
  } else {
    PRODUCTION_CANDIDATE_IDENTITIES.add(issuedIdentity);
    PRODUCTION_CANDIDATE_AUTHORITY.set(
      issuedIdentity,
      Object.freeze(productionAuthority),
    );
  }
  return issuedIdentity;
}

export function createD72CandidateIdentity(options = {}) {
  if (!isPlainObject(options)) {
    throw new Error(
      "Las autoridades de candidate identity deben ser un objeto.",
    );
  }
  if (options.testOnly === true) {
    const expectedTestKeys = [
      "artifactHash",
      "createdAtUtc",
      "diffCheckClean",
      "expiresAtUtc",
      "head",
      "leftCount",
      "originMain",
      "requestHash",
      "rightCount",
      "testOnly",
      "worktreeClean",
    ];
    if (
      !sameKeys(options, [
        ...expectedTestKeys,
        ...Object.keys(d72ReleaseEvidenceProfile(options)),
      ])
    ) {
      throw new Error(
        "La candidate identity testOnly exige exactamente sus flags fixture explícitos.",
      );
    }
    const { testOnly: _testOnly, ...fixture } = options;
    return issueD72CandidateIdentity(fixture, { testOnly: true });
  }

  const expectedProductionKeys = [
    "artifactManifest",
    "artifactRoot",
    "gitReceipt",
    "request",
    "worktreeRoot",
  ];
  if (!sameKeys(options, expectedProductionKeys)) {
    throw new Error(
      "La candidate identity productiva exige receipts Git, request y artifact reales; flags o hashes desnudos sólo son testOnly.",
    );
  }
  const now = new Date();
  assertIssuedD72GitCurrentStateReceipt(options.gitReceipt, { now });
  assertExceptionalReleaseRequest(options.request, {
    currentHead: options.gitReceipt.head,
    now,
  });
  const requestHash = exceptionalReleaseRequestHash(options.request);
  const artifactHash = exceptionalReleaseArtifactHash(options.artifactManifest);
  const artifactErrors = validateExceptionalReleaseArtifact({
    artifactRoot: options.artifactRoot,
    worktreeRoot: options.worktreeRoot,
    manifest: options.artifactManifest,
    expectedHead: options.gitReceipt.head,
    expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
    expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
  });
  if (artifactErrors.length > 0) {
    throw new Error(
      `El artifact real no habilita candidate identity:\n${artifactErrors.join("\n")}`,
    );
  }
  const createdAtUtc = now.toISOString();
  const releaseProfile = d72ReleaseEvidenceProfile(options.request);
  if (releaseProfile.releaseMode === "OPEN_UPDATE") {
    assertOpenReleaseBaselineRecord({
      baseline: options.request.openSourceBaseline,
      expectedBaselineSha256: releaseProfile.openSourceBaselineSha256,
      nowUtc: createdAtUtc,
    });
    if (
      options.artifactManifest.releaseMode !== releaseProfile.releaseMode ||
      options.artifactManifest.openSourceBaselineSha256 !==
        releaseProfile.openSourceBaselineSha256
    )
      throw new Error("Artifact y request no vinculan el mismo baseline OPEN.");
  }
  return issueD72CandidateIdentity(
    {
      ...releaseProfile,
      head: options.gitReceipt.head,
      originMain: options.gitReceipt.originMain,
      leftCount: options.gitReceipt.leftCount,
      rightCount: options.gitReceipt.rightCount,
      worktreeClean: options.gitReceipt.worktreeClean,
      diffCheckClean: options.gitReceipt.diffCheckClean,
      requestHash,
      artifactHash,
      createdAtUtc,
      expiresAtUtc: new Date(
        Math.min(
          now.getTime() + D72_CANDIDATE_IDENTITY_VALIDITY_MS,
          releaseProfile.releaseMode === "OPEN_UPDATE"
            ? Date.parse(options.request.openSourceBaseline.expiresAtUtc)
            : Infinity,
        ),
      ).toISOString(),
    },
    {
      productionAuthority: {
        artifactHash,
        artifactManifest: options.artifactManifest,
        artifactRoot: options.artifactRoot,
        gitReceipt: options.gitReceipt,
        request: options.request,
        requestHash,
        worktreeRoot: options.worktreeRoot,
      },
    },
  );
}

function assertCurrentProductionCandidateAuthority(candidateIdentity, now) {
  const authority = PRODUCTION_CANDIDATE_AUTHORITY.get(candidateIdentity);
  if (!authority) {
    throw new Error(
      "La candidate identity no conserva sus tres autoridades productivas opacas.",
    );
  }
  assertD72CandidateAuthorityGitReceiptAtIssuance(
    authority.gitReceipt,
    candidateIdentity,
  );
  assertExceptionalReleaseRequest(authority.request, {
    currentHead: candidateIdentity.head,
    now,
  });
  if (
    exceptionalReleaseRequestHash(authority.request) !==
      candidateIdentity.requestHash ||
    exceptionalReleaseArtifactHash(authority.artifactManifest) !==
      candidateIdentity.artifactHash
  ) {
    throw new Error(
      "Request o manifest real dejó de coincidir con candidate identity.",
    );
  }
  const artifactErrors = validateExceptionalReleaseArtifact({
    artifactRoot: authority.artifactRoot,
    worktreeRoot: authority.worktreeRoot,
    manifest: authority.artifactManifest,
    expectedHead: candidateIdentity.head,
    expectedPolicyVersion: candidateIdentity.policyVersion,
    expectedPolicyHash: candidateIdentity.policyHash,
    expectedRequestHash: candidateIdentity.requestHash,
    expectedArtifactHash: candidateIdentity.artifactHash,
  });
  if (artifactErrors.length > 0) {
    throw new Error(
      `El artifact productivo dejó de estar congelado:\n${artifactErrors.join("\n")}`,
    );
  }
  return authority;
}

export function assertD72CandidateAuthorityGitReceiptAtIssuance(
  gitReceipt,
  candidateIdentity,
  options = {},
) {
  if (
    !isPlainObject(options) ||
    !sameKeys(
      options,
      Object.hasOwn(options, "allowTestReceipt") ? ["allowTestReceipt"] : [],
    ) ||
    (Object.hasOwn(options, "allowTestReceipt") &&
      typeof options.allowTestReceipt !== "boolean")
  ) {
    throw new Error(
      "Las opciones de frescura Git de candidate identity son inválidas.",
    );
  }
  const issuedAt = canonicalInstant(candidateIdentity?.createdAtUtc);
  const allowTestReceipt = options.allowTestReceipt === true;
  const identityWasIssued = allowTestReceipt
    ? TEST_ONLY_CANDIDATE_IDENTITIES.has(candidateIdentity)
    : PRODUCTION_CANDIDATE_IDENTITIES.has(candidateIdentity);
  if (
    !identityWasIssued ||
    !issuedAt ||
    !FULL_HEAD_PATTERN.test(candidateIdentity?.head ?? "")
  ) {
    throw new Error(
      "La candidate identity no es una capability emitida con identidad Git válida.",
    );
  }
  return assertIssuedD72GitCurrentStateReceipt(gitReceipt, {
    allowTestReceipt,
    expectedHead: candidateIdentity.head,
    now: issuedAt,
  });
}

const NON_STATEFUL_CATALOG = Object.freeze(
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG.filter(({ gateId }) =>
    NON_STATEFUL_GATE_IDS.includes(gateId),
  ),
);

function nonStatefulDefinition(gateId, profile = {}) {
  const definition = NON_STATEFUL_GATE_IDS.includes(gateId)
    ? getNonWaivableGateEvidenceDefinitionForRelease(gateId, profile)
    : null;
  if (!definition) {
    throw new Error("El registry no-stateful contiene un gate desconocido.");
  }
  return definition;
}

function collectorSourceEvidence({
  definition,
  observedAtUtc,
  receiptDigest,
  status,
}) {
  return definition.sourceIds.map((sourceId) =>
    collectorSourceEvidenceEntry({
      definition,
      observedAtUtc,
      receiptDigest,
      sourceId,
      status,
    }),
  );
}

function collectorSourceEvidenceEntry({
  definition,
  observedAtUtc,
  receiptDigest,
  sourceId,
  status,
}) {
  return {
    sourceId,
    status,
    digest: sha256(
      canonicalD72NonWaivableEvidenceJson({
        gateId: definition.gateId,
        receiptDigest,
        sourceId,
        status,
      }),
    ),
    observedAtUtc,
  };
}

function missingCollectorSourceEvidence({
  candidateIdentity,
  definition,
  issuerId,
  observedAtUtc,
  reason,
}) {
  return definition.sourceIds.map((sourceId) =>
    missingCollectorSourceEvidenceEntry({
      candidateIdentity,
      definition,
      issuerId,
      observedAtUtc,
      reason,
      sourceId,
    }),
  );
}

function missingCollectorSourceEvidenceEntry({
  candidateIdentity,
  definition,
  issuerId,
  observedAtUtc,
  reason,
  sourceId,
}) {
  return {
    sourceId,
    status: EVIDENCE_STATUS.NOT_VERIFIED,
    digest: sha256(
      canonicalD72NonWaivableEvidenceJson({
        candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
        gateId: definition.gateId,
        issuerId,
        reason,
        sourceId,
        status: EVIDENCE_STATUS.NOT_VERIFIED,
      }),
    ),
    observedAtUtc,
  };
}

function assertCollectorWindowAfterIdentity(
  receipt,
  candidateIdentity,
  now,
  label,
) {
  const startedAt = canonicalInstant(receipt?.startedAtUtc);
  const completedAt = canonicalInstant(receipt?.completedAtUtc);
  const identityCreatedAt = canonicalInstant(candidateIdentity.createdAtUtc);
  if (
    !startedAt ||
    !completedAt ||
    !identityCreatedAt ||
    startedAt < identityCreatedAt ||
    completedAt < startedAt ||
    completedAt > now
  ) {
    throw new Error(
      `${label} debe haberse ejecutado íntegramente después de candidate identity.`,
    );
  }
  return receipt.completedAtUtc;
}

// El registry productivo es deliberadamente estático: un caller no puede
// registrar un issuer ad hoc. Cada entrada valida una capability opaca emitida
// por un collector real. Un receipt ausente queda NOT_VERIFIED; nunca se fabrica
// como PASS y por lo tanto invalida la identity y bloquea canary.
const PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY = new Map();

PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.set(
  "source.git-head-clean-and-recoverable",
  Object.freeze({
    issuerId: "scripts/d72-git-current-state.mjs",
    receiptKey: "gitReceipt",
    issueSourceEvidence({ allowTestReceipt, candidateIdentity, receipt, now }) {
      assertIssuedD72GitCurrentStateReceipt(receipt, {
        allowTestReceipt,
        expectedHead: candidateIdentity.head,
        now,
      });
      const observedAt = canonicalInstant(receipt.observedAt);
      const identityCreatedAt = canonicalInstant(
        candidateIdentity.createdAtUtc,
      );
      if (
        !observedAt ||
        !identityCreatedAt ||
        observedAt < identityCreatedAt ||
        observedAt > now
      ) {
        throw new Error(
          "El receipt Git del gate debe haberse emitido después de candidate identity.",
        );
      }
      const definition = nonStatefulDefinition(
        "source.git-head-clean-and-recoverable",
      );
      return collectorSourceEvidence({
        definition,
        observedAtUtc: observedAt.toISOString(),
        receiptDigest: sha256(canonicalD72NonWaivableEvidenceJson(receipt)),
        status: EVIDENCE_STATUS.PASS,
      });
    },
  }),
);

for (const gateId of D72_SUPABASE_GATE_IDS) {
  PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.set(
    gateId,
    Object.freeze({
      issuerId: "scripts/run-d72-supabase-readonly.mjs",
      receiptKey: "supabaseReceipt",
      issueSourceEvidence({
        allowTestReceipt,
        candidateIdentity,
        receipt,
        now,
      }) {
        assertD72SupabaseReadonlyReceipt(receipt, {
          allowTestReceipt,
          expectedHead: candidateIdentity.head,
          now,
        });
        const observedAtUtc = assertCollectorWindowAfterIdentity(
          receipt,
          candidateIdentity,
          now,
          "El receipt Supabase",
        );
        const gate = receipt.gates.find(
          (candidate) => candidate.gateId === gateId,
        );
        if (!gate || !ALLOWED_STATUS.has(gate.status)) {
          throw new Error(
            `El receipt Supabase no contiene estado factual para ${gateId}.`,
          );
        }
        return collectorSourceEvidence({
          definition: nonStatefulDefinition(gateId),
          observedAtUtc,
          receiptDigest: sha256(
            canonicalD72NonWaivableEvidenceJson({
              gateId,
              receiptContentSha256: receipt.contentSha256,
              status: gate.status,
            }),
          ),
          status: gate.status,
        });
      },
    }),
  );
}

PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.set(
  "quality.production-smoke",
  Object.freeze({
    issuerId: "scripts/cloudflare-closed-smoke-policy.mjs",
    receiptKey: "closedProductionSmokeReceipt",
    issueSourceEvidence({
      allowTestReceipt,
      candidateIdentity,
      currentProductionAuthority,
      receipt,
      receipts,
      now,
    }) {
      assertClosedProductionSmokeReceipt(receipt, { allowTestReceipt });
      const observedAtUtc = assertCollectorWindowAfterIdentity(
        receipt,
        candidateIdentity,
        now,
        "El receipt del smoke CLOSED",
      );
      const definition = nonStatefulDefinition("quality.production-smoke");
      const receiptDigest = sha256(
        canonicalD72NonWaivableEvidenceJson({
          activeDeploymentId: receipt.activeDeploymentId,
          activeVersionId: receipt.activeVersionId,
          completed: receipt.completed,
          completedAtUtc: receipt.completedAtUtc,
          cronCount: receipt.cronCount,
          postAttemptCount: receipt.postAttemptCount,
          postDeniedCount: receipt.postDeniedCount,
          postState: receipt.postState,
          postWriteStatus: receipt.postWriteStatus,
          profile: receipt.profile,
          startedAtUtc: receipt.startedAtUtc,
        }),
      );
      const closedNoWritePreproof = receipts.closedNoWritePreproof;
      const closedNoWriteProofReceipt = receipts.closedNoWriteProofReceipt;
      if (
        (closedNoWritePreproof === null) !==
        (closedNoWriteProofReceipt === null)
      ) {
        throw new Error(
          "La evidencia CLOSED no-write exige preproof y post-seal juntos.",
        );
      }
      let noWriteEvidence = missingCollectorSourceEvidenceEntry({
        candidateIdentity,
        definition,
        issuerId: "scripts/d72-closed-no-write-proof.mjs",
        observedAtUtc: now.toISOString(),
        reason: "closed-no-write-proof-not-provided",
        sourceId: "production.closed-post-no-write",
      });
      if (
        closedNoWritePreproof !== null &&
        closedNoWriteProofReceipt !== null
      ) {
        const closedNoWriteProof = assertD72ClosedNoWriteProofReceipt(
          closedNoWriteProofReceipt,
          {
            preproof: closedNoWritePreproof,
            candidateIdentity,
            artifactManifest: currentProductionAuthority?.artifactManifest,
            artifactRoot: currentProductionAuthority?.artifactRoot,
            worktreeRoot: currentProductionAuthority?.worktreeRoot,
            closedProductionSmokeReceipt: receipt,
            allowTestReceipt,
            now,
          },
        );
        if (!ALLOWED_STATUS.has(closedNoWriteProof.status)) {
          throw new Error(
            "El proof CLOSED no-write no contiene un estado factual permitido.",
          );
        }
        noWriteEvidence = collectorSourceEvidenceEntry({
          definition,
          observedAtUtc: closedNoWriteProof.completedAtUtc,
          receiptDigest: sha256(
            canonicalD72NonWaivableEvidenceJson(closedNoWriteProof),
          ),
          sourceId: "production.closed-post-no-write",
          status: closedNoWriteProof.status,
        });
      }
      return definition.sourceIds.map((sourceId) =>
        sourceId === "production.closed-post-no-write"
          ? noWriteEvidence
          : collectorSourceEvidenceEntry({
              definition,
              observedAtUtc,
              receiptDigest,
              sourceId,
              status: EVIDENCE_STATUS.PASS,
            }),
      );
    },
  }),
);

const expectedCompositeGateIds = NON_STATEFUL_GATE_IDS.filter(
  (gateId) => !PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.has(gateId),
);

const OPEN_SOURCE_SMOKE_COLLECTOR = Object.freeze({
  issuerId: "scripts/cloudflare-open-source-smoke-policy.mjs",
  receiptKey: "openSourceProductionSmokeReceipt",
  issueSourceEvidence({ allowTestReceipt, candidateIdentity, receipt, now }) {
    assertOpenSourceProductionSmokeReceipt(receipt, { allowTestReceipt });
    if (
      receipt.baselineSha256 !== candidateIdentity.openSourceBaselineSha256 ||
      receipt.profile !== "open-source-read-only"
    )
      throw new Error(
        "El smoke OPEN no corresponde al baseline de la identidad.",
      );
    const observedAtUtc = assertCollectorWindowAfterIdentity(
      receipt,
      candidateIdentity,
      now,
      "El receipt del smoke OPEN",
    );
    return collectorSourceEvidence({
      definition: nonStatefulDefinition(
        "quality.production-smoke",
        candidateIdentity,
      ),
      observedAtUtc,
      receiptDigest: openSourceProductionSmokeHash(receipt, {
        allowTestReceipt,
      }),
      status: EVIDENCE_STATUS.PASS,
    });
  },
});
if (
  JSON.stringify(D72_COMPOSITE_NON_STATEFUL_GATE_IDS) !==
  JSON.stringify(expectedCompositeGateIds)
) {
  throw new Error(
    "El collector compuesto debe cubrir exactamente los 12 gates no-stateful sin issuer dedicado.",
  );
}

for (const gateId of D72_COMPOSITE_NON_STATEFUL_GATE_IDS) {
  PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.set(
    gateId,
    Object.freeze({
      issuerId: "scripts/d72-non-stateful-composite-collector.mjs",
      receiptKey: "compositeReceipt",
      issueSourceEvidence({
        allowTestReceipt,
        candidateIdentity,
        receipt,
        now,
      }) {
        const composite = assertD72NonStatefulCompositeCollectorReceipt(
          receipt,
          {
            allowTestReceipt,
            candidateIdentity,
            now,
          },
        );
        const observedAtUtc = assertCollectorWindowAfterIdentity(
          composite,
          candidateIdentity,
          now,
          "El receipt compuesto no-stateful",
        );
        const gate = composite.gates.find(
          (candidate) => candidate.gateId === gateId,
        );
        if (!gate || !ALLOWED_STATUS.has(gate.status)) {
          throw new Error(
            `El receipt compuesto no contiene estado factual para ${gateId}.`,
          );
        }
        const definition = nonStatefulDefinition(gateId);
        if (
          !Array.isArray(gate.sources) ||
          gate.sources.length !== definition.sourceIds.length ||
          gate.sources.some(
            (source, index) =>
              source?.sourceId !== definition.sourceIds[index] ||
              !ALLOWED_STATUS.has(source?.status),
          )
        ) {
          throw new Error(
            `El receipt compuesto no contiene fuentes granulares exactas para ${gateId}.`,
          );
        }
        return gate.sources.map(({ sourceId, status }) =>
          collectorSourceEvidenceEntry({
            definition,
            observedAtUtc,
            receiptDigest: sha256(
              canonicalD72NonWaivableEvidenceJson({
                compositeContentSha256: composite.contentSha256,
                gateId,
                sourceId,
                status,
              }),
            ),
            sourceId,
            status,
          }),
        );
      },
    }),
  );
}

export function d72NonStatefulCollectorCoverage() {
  const registeredGateIds = NON_STATEFUL_GATE_IDS.filter((gateId) =>
    PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.has(gateId),
  );
  const notRegisteredGateIds = NON_STATEFUL_GATE_IDS.filter(
    (gateId) => !PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.has(gateId),
  );
  return deepFreeze({ registeredGateIds, notRegisteredGateIds });
}

export function issueD72NonStatefulCollectorBundle(options = {}) {
  if (!isPlainObject(options)) {
    throw new Error("El bundle no-stateful exige opciones cerradas.");
  }
  const testOnly = options.testOnly === true;
  const releaseProfile = d72ReleaseEvidenceProfile(
    options.candidateIdentity ?? {},
  );
  const expectedKeys = testOnly
    ? [
        "candidateIdentity",
        "closedNoWritePreproof",
        "closedNoWriteProofReceipt",
        "closedProductionSmokeReceipt",
        "compositeReceipt",
        "gitReceipt",
        "now",
        "supabaseReceipt",
        "testOnly",
      ]
    : [
        "candidateIdentity",
        "closedNoWritePreproof",
        "closedNoWriteProofReceipt",
        "closedProductionSmokeReceipt",
        "compositeReceipt",
        "gitReceipt",
        "supabaseReceipt",
      ];
  const profileKeys =
    releaseProfile.releaseMode === "OPEN_UPDATE"
      ? expectedKeys
          .filter(
            (key) =>
              ![
                "closedNoWritePreproof",
                "closedNoWriteProofReceipt",
                "closedProductionSmokeReceipt",
              ].includes(key),
          )
          .concat("openSourceProductionSmokeReceipt")
      : expectedKeys;
  if (!sameKeys(options, profileKeys)) {
    throw new Error(
      "El bundle no-stateful sólo acepta identity y receipts de collectors registrados; no acepta mapas arbitrarios.",
    );
  }
  const candidateIdentity = options.candidateIdentity;
  const productionAuthority =
    PRODUCTION_CANDIDATE_AUTHORITY.get(candidateIdentity);
  if (
    CANDIDATE_IDENTITY_STATE.get(candidateIdentity) !== "fresh" ||
    (testOnly
      ? !TEST_ONLY_CANDIDATE_IDENTITIES.has(candidateIdentity)
      : !PRODUCTION_CANDIDATE_IDENTITIES.has(candidateIdentity) ||
        !productionAuthority)
  ) {
    throw new Error(
      "El bundle no-stateful exige una candidate identity opaca, fresca y del mismo modo de ejecución.",
    );
  }
  const now = testOnly ? new Date(options.now) : new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("El bundle no-stateful no recibió un reloj válido.");
  }
  const currentProductionAuthority = testOnly
    ? null
    : assertCurrentProductionCandidateAuthority(candidateIdentity, now);
  const identityErrors = validateD72CandidateIdentity(candidateIdentity, {
    expectedHead: candidateIdentity.head,
    expectedRequestHash: candidateIdentity.requestHash,
    expectedArtifactHash: candidateIdentity.artifactHash,
    now,
  });
  if (identityErrors.length > 0) {
    throw new Error(
      `Candidate identity inválida para collectors:\n${identityErrors.join("\n")}`,
    );
  }
  const receipts = Object.freeze({
    openSourceProductionSmokeReceipt: options.openSourceProductionSmokeReceipt,
    closedNoWritePreproof: options.closedNoWritePreproof,
    closedNoWriteProofReceipt: options.closedNoWriteProofReceipt,
    closedProductionSmokeReceipt: options.closedProductionSmokeReceipt,
    compositeReceipt: options.compositeReceipt,
    gitReceipt: options.gitReceipt,
    supabaseReceipt: options.supabaseReceipt,
  });
  const sourceEvidenceByGate = Object.fromEntries(
    NON_STATEFUL_CATALOG.map((legacyDefinition) => {
      const definition = nonStatefulDefinition(
        legacyDefinition.gateId,
        candidateIdentity,
      );
      const issuer =
        definition.gateId === "quality.production-smoke" &&
        releaseProfile.releaseMode === "OPEN_UPDATE"
          ? OPEN_SOURCE_SMOKE_COLLECTOR
          : PRODUCTION_NON_STATEFUL_COLLECTOR_REGISTRY.get(definition.gateId);
      const receipt = issuer ? receipts[issuer.receiptKey] : null;
      const sourceEvidence =
        !issuer || receipt === null
          ? missingCollectorSourceEvidence({
              candidateIdentity,
              definition,
              issuerId: issuer?.issuerId ?? null,
              observedAtUtc: now.toISOString(),
              reason: issuer
                ? "collector-receipt-not-provided"
                : "collector-not-registered",
            })
          : issuer.issueSourceEvidence({
              allowTestReceipt: testOnly,
              candidateIdentity,
              currentProductionAuthority,
              receipt,
              receipts,
              now,
            });
      return [definition.gateId, sourceEvidence];
    }),
  );
  const observedTimes = Object.values(sourceEvidenceByGate)
    .flat()
    .map(({ observedAtUtc }) => canonicalInstant(observedAtUtc));
  if (observedTimes.some((instant) => !instant)) {
    throw new Error("Un collector no-stateful emitió un timestamp inválido.");
  }
  const startedAtUtc = new Date(
    Math.min(...observedTimes.map((instant) => instant.getTime())),
  ).toISOString();
  const expiresAtUtc = new Date(
    Math.min(
      new Date(candidateIdentity.expiresAtUtc).getTime(),
      new Date(startedAtUtc).getTime() + D72_NON_WAIVABLE_EVIDENCE_VALIDITY_MS,
    ),
  ).toISOString();
  if (now >= new Date(expiresAtUtc)) {
    throw new Error("La ventana de collectors no-stateful ya está vencida.");
  }
  const coverage = d72NonStatefulCollectorCoverage();
  const payload = {
    schemaVersion: D72_NON_STATEFUL_COLLECTOR_BUNDLE_SCHEMA_VERSION,
    ...releaseProfile,
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    collectorGateIds: coverage.registeredGateIds,
    issuedAtUtc: now.toISOString(),
  };
  const bundle = deepFreeze({
    ...payload,
    contentSha256: sha256(canonicalD72NonWaivableEvidenceJson(payload)),
  });
  ISSUED_NON_STATEFUL_COLLECTOR_BUNDLES.set(
    bundle,
    deepFreeze({
      candidateIdentity,
      completedAtUtc: now.toISOString(),
      expiresAtUtc,
      sourceEvidenceByGate,
      startedAtUtc,
      testOnly,
    }),
  );
  return bundle;
}

function expectedCandidateDisposition(gates, profile = {}) {
  const certified =
    gates.length === NON_STATEFUL_GATE_IDS.length &&
    gates.every(
      ({ evidenceStatus, rawResult }) =>
        evidenceStatus === EVIDENCE_STATUS.PASS &&
        rawResult === RAW_RESULT.PASS,
    );
  return Object.freeze({
    candidateIdentityDisposition: certified
      ? D72_CANDIDATE_IDENTITY_DISPOSITION.CERTIFIED
      : D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED,
    // El permiso sólo alcanza preparación; los tokens /dev/tty, la cápsula y
    // los recibos reales de cada fase siguen siendo obligatorios.
    canaryPreparationAllowed: certified,
  });
}

function expectedInvalidationReceipt(certification) {
  const blockers = certification.gates
    .filter(
      ({ evidenceStatus, rawResult }) =>
        evidenceStatus !== EVIDENCE_STATUS.PASS ||
        rawResult !== RAW_RESULT.PASS,
    )
    .map(({ gateId }) => gateId);
  if (blockers.length === 0) return null;
  return {
    schemaVersion: D72_CANDIDATE_INVALIDATION_SCHEMA_VERSION,
    candidateIdentityHash: certification.candidateIdentityHash,
    runId: certification.runId,
    invalidatedAtUtc: certification.completedAtUtc,
    disposition: D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED,
    blockers,
  };
}

export function validateD72NonStatefulEvidenceCertification(
  certification,
  {
    candidateIdentity,
    expectedHead,
    expectedRequestHash,
    expectedArtifactHash,
    now = new Date(),
  } = {},
) {
  const errors = [];
  let releaseProfile;
  try {
    releaseProfile = d72ReleaseEvidenceProfile(certification ?? {});
  } catch {
    return Object.freeze(["Perfil o baseline de certificación inválido."]);
  }
  if (
    !sameKeys(certification, [
      ...NON_STATEFUL_CERTIFICATION_KEYS,
      ...Object.keys(releaseProfile),
    ])
  ) {
    return Object.freeze([
      "La certificación no-stateful D72 contiene campos faltantes o no aprobados.",
    ]);
  }
  if (
    certification.schemaVersion !== D72_NON_STATEFUL_EVIDENCE_SCHEMA_VERSION ||
    certification.phase !== "evidence_certification"
  ) {
    errors.push(
      "La certificación no-stateful no usa la fase/schema canónicos.",
    );
  }
  if (
    certification.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    certification.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push(
      "La certificación no-stateful no usa la policy canónica actual.",
    );
  }
  const identityErrors = validateD72CandidateIdentity(candidateIdentity, {
    expectedHead,
    expectedRequestHash,
    expectedArtifactHash,
    now,
  });
  errors.push(...identityErrors.map((error) => `candidateIdentity: ${error}`));
  if (
    certification.releaseMode !== candidateIdentity?.releaseMode ||
    certification.openSourceBaselineSha256 !==
      candidateIdentity?.openSourceBaselineSha256
  )
    errors.push(
      "El perfil/baseline de certificación no coincide con la identidad.",
    );
  let expectedIdentityHash = null;
  try {
    expectedIdentityHash = d72CandidateIdentityHash(candidateIdentity);
  } catch {
    // El error estructural anterior conserva una salida saneada.
  }
  if (
    !SHA256_PATTERN.test(certification.candidateIdentityHash ?? "") ||
    certification.candidateIdentityHash !== expectedIdentityHash
  ) {
    errors.push("candidateIdentityHash no coincide con la fase local previa.");
  }
  for (const [field, expected, pattern] of [
    ["head", expectedHead, FULL_HEAD_PATTERN],
    ["requestHash", expectedRequestHash, SHA256_PATTERN],
    ["artifactHash", expectedArtifactHash, SHA256_PATTERN],
  ]) {
    if (
      !pattern.test(certification[field] ?? "") ||
      certification[field] !== expected ||
      certification[field] !== candidateIdentity?.[field]
    ) {
      errors.push(`${field} de certificación no-stateful no coincide.`);
    }
  }
  if (!RUN_ID_PATTERN.test(certification.runId ?? "")) {
    errors.push("runId de certificación no-stateful no es UUID v4 canónico.");
  }
  if (
    certification.deploymentAuthorized !== false ||
    certification.deploymentExecuted !== false ||
    certification.actIssued !== false ||
    certification.riskAcceptanceRecorded !== false
  ) {
    errors.push(
      "La certificación técnica no autoriza/ejecuta deploy, no emite acta ni acepta riesgos.",
    );
  }

  const startedAt = canonicalInstant(certification.startedAtUtc);
  const completedAt = canonicalInstant(certification.completedAtUtc);
  const expiresAt = canonicalInstant(certification.expiresAtUtc);
  const identityCreatedAt = canonicalInstant(candidateIdentity?.createdAtUtc);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (
    !startedAt ||
    !completedAt ||
    !expiresAt ||
    !identityCreatedAt ||
    !Number.isFinite(current.getTime()) ||
    startedAt < identityCreatedAt ||
    completedAt < startedAt ||
    completedAt >= expiresAt ||
    expiresAt.getTime() - startedAt.getTime() >
      D72_NON_WAIVABLE_EVIDENCE_VALIDITY_MS
  ) {
    errors.push("La ventana temporal no-stateful D72 es inválida.");
  } else if (current >= expiresAt) {
    errors.push("La certificación no-stateful D72 está vencida.");
  }

  if (!Array.isArray(certification.gates)) {
    errors.push("gates de certificación no-stateful no es un array.");
  } else {
    if (certification.gates.length !== NON_STATEFUL_GATE_IDS.length) {
      errors.push("La certificación debe contener exactamente 20 gates.");
    }
    const window = { startedAt, completedAt };
    for (const [index, legacyDefinition] of NON_STATEFUL_CATALOG.entries()) {
      const definition = nonStatefulDefinition(
        legacyDefinition.gateId,
        candidateIdentity,
      );
      errors.push(
        ...gateErrors(
          certification.gates[index],
          definition,
          window,
          Object.freeze({ canaryExecuted: false, canaryReportHash: null }),
        ),
      );
    }
    const expected = expectedCandidateDisposition(
      certification.gates,
      candidateIdentity,
    );
    if (
      certification.candidateIdentityDisposition !==
        expected.candidateIdentityDisposition ||
      certification.canaryPreparationAllowed !==
        expected.canaryPreparationAllowed
    ) {
      errors.push(
        "La disposición de candidate identity no deriva fail-closed de los 20 gates.",
      );
    }
    const expectedInvalidation = expectedInvalidationReceipt(certification);
    if (expectedInvalidation === null) {
      if (
        certification.invalidationReceipt !== null ||
        certification.invalidationReceiptHash !== null
      ) {
        errors.push(
          "Una certificación PASS no puede contener receipt de invalidación.",
        );
      }
    } else {
      if (
        !sameKeys(
          certification.invalidationReceipt,
          INVALIDATION_RECEIPT_KEYS,
        ) ||
        canonicalD72NonWaivableEvidenceJson(
          certification.invalidationReceipt,
        ) !== canonicalD72NonWaivableEvidenceJson(expectedInvalidation)
      ) {
        errors.push(
          "El receipt de invalidación no deriva de los blockers factuales.",
        );
      } else if (
        !SHA256_PATTERN.test(certification.invalidationReceiptHash ?? "") ||
        certification.invalidationReceiptHash !==
          d72CandidateInvalidationReceiptHash(certification.invalidationReceipt)
      ) {
        errors.push("invalidationReceiptHash no sella la invalidación D72.");
      }
    }
  }
  if (
    !SHA256_PATTERN.test(certification.contentSha256 ?? "") ||
    certification.contentSha256 !==
      d72NonStatefulEvidenceCertificationHash(certification)
  ) {
    errors.push("contentSha256 no sella la certificación no-stateful D72.");
  }
  return Object.freeze([...new Set(errors)]);
}

export function createD72NonStatefulEvidenceCertification(options = {}) {
  if (!isPlainObject(options)) {
    throw new Error("La certificación no-stateful exige opciones cerradas.");
  }
  const testOnly = options.testOnly === true;
  let candidateIdentity;
  let runId;
  let startedAtUtc;
  let completedAtUtc;
  let expiresAtUtc;
  let sourceEvidenceByGate;
  if (testOnly) {
    const rawFixtureKeys = [
      "candidateIdentity",
      "completedAtUtc",
      "expiresAtUtc",
      "runId",
      "sourceEvidenceByGate",
      "startedAtUtc",
      "testOnly",
    ];
    const collectorFixtureKeys = [
      "candidateIdentity",
      "collectorBundle",
      "testOnly",
    ];
    if (!TEST_ONLY_CANDIDATE_IDENTITIES.has(options.candidateIdentity)) {
      throw new Error(
        "La certificación fixture exige una identity testOnly opaca.",
      );
    }
    if (sameKeys(options, collectorFixtureKeys)) {
      const bundleData = ISSUED_NON_STATEFUL_COLLECTOR_BUNDLES.get(
        options.collectorBundle,
      );
      if (
        !bundleData ||
        bundleData.testOnly !== true ||
        bundleData.candidateIdentity !== options.candidateIdentity
      ) {
        throw new Error(
          "La certificación fixture exige un collector bundle testOnly opaco y enlazado.",
        );
      }
      candidateIdentity = options.candidateIdentity;
      runId = randomUUID();
      startedAtUtc = bundleData.startedAtUtc;
      completedAtUtc = bundleData.completedAtUtc;
      expiresAtUtc = bundleData.expiresAtUtc;
      sourceEvidenceByGate = bundleData.sourceEvidenceByGate;
    } else if (sameKeys(options, rawFixtureKeys)) {
      ({
        candidateIdentity,
        runId,
        startedAtUtc,
        completedAtUtc,
        expiresAtUtc,
        sourceEvidenceByGate,
      } = options);
    } else {
      throw new Error(
        "La certificación fixture exige bundle opaco o mapa testOnly explícito.",
      );
    }
  } else {
    if (
      !sameKeys(options, ["candidateIdentity", "collectorBundle"]) ||
      !PRODUCTION_CANDIDATE_IDENTITIES.has(options.candidateIdentity) ||
      !PRODUCTION_CANDIDATE_AUTHORITY.has(options.candidateIdentity)
    ) {
      throw new Error(
        "La certificación productiva exige identity y bundle opacos; mapas arbitrarios sólo son testOnly.",
      );
    }
    const bundleData = ISSUED_NON_STATEFUL_COLLECTOR_BUNDLES.get(
      options.collectorBundle,
    );
    if (
      !bundleData ||
      bundleData.testOnly !== false ||
      bundleData.candidateIdentity !== options.candidateIdentity
    ) {
      throw new Error(
        "El bundle no-stateful no fue emitido para esta identity productiva.",
      );
    }
    candidateIdentity = options.candidateIdentity;
    runId = randomUUID();
    startedAtUtc = bundleData.startedAtUtc;
    completedAtUtc = bundleData.completedAtUtc;
    expiresAtUtc = bundleData.expiresAtUtc;
    sourceEvidenceByGate = bundleData.sourceEvidenceByGate;
    assertCurrentProductionCandidateAuthority(
      candidateIdentity,
      new Date(completedAtUtc),
    );
  }
  const identityState = CANDIDATE_IDENTITY_STATE.get(candidateIdentity);
  if (identityState !== "fresh") {
    throw new Error(
      identityState === "invalidated"
        ? "La candidate identity D72 fue invalidada y no puede recertificarse."
        : identityState === "certified"
          ? "La candidate identity D72 ya fue consumida por una certificación."
          : "La candidate identity D72 debe ser la capability opaca emitida en este proceso.",
    );
  }
  if (!isPlainObject(sourceEvidenceByGate)) {
    throw new Error(
      "sourceEvidenceByGate no-stateful debe ser un objeto cerrado.",
    );
  }
  if (
    JSON.stringify(Object.keys(sourceEvidenceByGate).sort()) !==
    JSON.stringify([...NON_STATEFUL_GATE_IDS].sort())
  ) {
    throw new Error("sourceEvidenceByGate debe cubrir exactamente 20 gates.");
  }
  const identityErrors = validateD72CandidateIdentity(candidateIdentity, {
    expectedHead: candidateIdentity?.head,
    expectedRequestHash: candidateIdentity?.requestHash,
    expectedArtifactHash: candidateIdentity?.artifactHash,
    now: completedAtUtc,
  });
  if (identityErrors.length > 0) {
    throw new Error(
      `Candidate identity D72 inválida para certificar:\n${identityErrors.join("\n")}`,
    );
  }
  const gates = NON_STATEFUL_CATALOG.map((definition) => {
    const sourceEvidence = (sourceEvidenceByGate[definition.gateId] ?? []).map(
      (source) => ({ ...source }),
    );
    const evidenceStatus = expectedGateStatus(sourceEvidence);
    return {
      gateId: definition.gateId,
      sourceEvidence,
      evidenceStatus,
      rawResult: expectedRawResult(evidenceStatus),
    };
  });
  const disposition = expectedCandidateDisposition(gates, candidateIdentity);
  const invalidationReceipt =
    disposition.candidateIdentityDisposition ===
    D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED
      ? deepFreeze({
          schemaVersion: D72_CANDIDATE_INVALIDATION_SCHEMA_VERSION,
          candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
          runId,
          invalidatedAtUtc: completedAtUtc,
          disposition: D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED,
          blockers: gates
            .filter(
              ({ evidenceStatus, rawResult }) =>
                evidenceStatus !== EVIDENCE_STATUS.PASS ||
                rawResult !== RAW_RESULT.PASS,
            )
            .map(({ gateId }) => gateId),
        })
      : null;
  const payload = {
    schemaVersion: D72_NON_STATEFUL_EVIDENCE_SCHEMA_VERSION,
    ...d72ReleaseEvidenceProfile(candidateIdentity),
    phase: "evidence_certification",
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: candidateIdentity.policyHash,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: d72CandidateIdentityHash(candidateIdentity),
    runId,
    startedAtUtc,
    completedAtUtc,
    expiresAtUtc,
    invalidationReceipt,
    invalidationReceiptHash:
      invalidationReceipt === null
        ? null
        : d72CandidateInvalidationReceiptHash(invalidationReceipt),
    ...disposition,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    actIssued: false,
    riskAcceptanceRecorded: false,
    gates,
  };
  const certification = {
    ...payload,
    contentSha256: d72NonStatefulEvidenceCertificationHash(payload),
  };
  const errors = validateD72NonStatefulEvidenceCertification(certification, {
    candidateIdentity,
    expectedHead: candidateIdentity.head,
    expectedRequestHash: candidateIdentity.requestHash,
    expectedArtifactHash: candidateIdentity.artifactHash,
    now: completedAtUtc,
  });
  if (errors.length > 0) {
    throw new Error(
      `Certificación no-stateful D72 inválida:\n${errors.join("\n")}`,
    );
  }
  const issuedCertification = deepFreeze(certification);
  const nextState =
    disposition.candidateIdentityDisposition ===
    D72_CANDIDATE_IDENTITY_DISPOSITION.INVALIDATED
      ? "invalidated"
      : "certified";
  const bindingKey = candidateBindingKey(candidateIdentity);
  const bindingState = CANDIDATE_BINDING_STATE.get(bindingKey);
  if (
    !bindingState ||
    bindingState.identity !== candidateIdentity ||
    bindingState.state !== "fresh" ||
    bindingState.testOnly !== testOnly
  ) {
    throw new Error(
      "El binding HEAD/request/artifact no está fresco para certificarse.",
    );
  }
  CANDIDATE_IDENTITY_STATE.set(candidateIdentity, nextState);
  CANDIDATE_BINDING_STATE.set(
    bindingKey,
    Object.freeze({
      identity: candidateIdentity,
      state: nextState,
      testOnly,
    }),
  );
  ISSUED_NON_STATEFUL_CERTIFICATIONS.set(
    issuedCertification,
    candidateIdentity,
  );
  if (testOnly) {
    TEST_ONLY_NON_STATEFUL_CERTIFICATIONS.add(issuedCertification);
  } else {
    PRODUCTION_NON_STATEFUL_CERTIFICATIONS.add(issuedCertification);
  }
  return issuedCertification;
}

export function d72NonStatefulEvidenceBlockers(certification) {
  if (!Array.isArray(certification?.gates)) {
    return Object.freeze([...NON_STATEFUL_GATE_IDS]);
  }
  return Object.freeze(
    certification.gates
      .filter(
        ({ evidenceStatus, rawResult }) =>
          evidenceStatus !== EVIDENCE_STATUS.PASS ||
          rawResult !== RAW_RESULT.PASS,
      )
      .map(({ gateId }) => gateId),
  );
}

export function assertD72NonStatefulEvidenceAllowsCanary(
  certification,
  options = {},
) {
  if (!isPlainObject(options)) {
    throw new Error("Las opciones de autorización no-stateful son inválidas.");
  }
  if (
    Object.hasOwn(options, "allowTestOnly") &&
    typeof options.allowTestOnly !== "boolean"
  ) {
    throw new Error("allowTestOnly debe ser booleano explícito.");
  }
  const allowTestOnly = options.allowTestOnly === true;
  if (!allowTestOnly && Object.hasOwn(options, "now")) {
    throw new Error(
      "El reloj productivo no puede ser suministrado por el caller.",
    );
  }
  const allowedOptionKeys = new Set([
    "allowTestOnly",
    "candidateIdentity",
    "expectedArtifactHash",
    "expectedHead",
    "expectedRequestHash",
    ...(allowTestOnly ? ["now"] : []),
  ]);
  if (Object.keys(options).some((key) => !allowedOptionKeys.has(key))) {
    throw new Error(
      "Las opciones de autorización no-stateful contienen campos desconocidos.",
    );
  }
  const candidateIdentity = options.candidateIdentity;
  const authorityMatches = allowTestOnly
    ? TEST_ONLY_CANDIDATE_IDENTITIES.has(candidateIdentity) &&
      TEST_ONLY_NON_STATEFUL_CERTIFICATIONS.has(certification)
    : PRODUCTION_CANDIDATE_IDENTITIES.has(candidateIdentity) &&
      PRODUCTION_CANDIDATE_AUTHORITY.has(candidateIdentity) &&
      PRODUCTION_NON_STATEFUL_CERTIFICATIONS.has(certification);
  if (!authorityMatches) {
    throw new Error(
      allowTestOnly
        ? "La fase testOnly exige identity y certificación fixture opacas emitidas y enlazadas en este proceso."
        : "La fase no-stateful requiere identity, receipts y certificación productivos opacos emitidos y enlazados en este proceso.",
    );
  }
  const validationOptions = {
    candidateIdentity: options.candidateIdentity,
    expectedArtifactHash: options.expectedArtifactHash,
    expectedHead: options.expectedHead,
    expectedRequestHash: options.expectedRequestHash,
    now: allowTestOnly ? (options.now ?? new Date()) : new Date(),
  };
  const errors = validateD72NonStatefulEvidenceCertification(
    certification,
    validationOptions,
  );
  const blockers = d72NonStatefulEvidenceBlockers(certification);
  if (
    errors.length > 0 ||
    blockers.length > 0 ||
    certification?.candidateIdentityDisposition !==
      D72_CANDIDATE_IDENTITY_DISPOSITION.CERTIFIED ||
    certification?.canaryPreparationAllowed !== true
  ) {
    throw new Error(
      `La fase no-stateful no habilita el canary D72:\n${[
        ...errors,
        ...blockers.map((gateId) => `BLOCKER ${gateId}`),
      ].join("\n")}`,
    );
  }
  const bindingState = CANDIDATE_BINDING_STATE.get(
    candidateBindingKey(candidateIdentity ?? {}),
  );
  const linked =
    CANDIDATE_IDENTITY_STATE.get(candidateIdentity) === "certified" &&
    ISSUED_NON_STATEFUL_CERTIFICATIONS.get(certification) ===
      candidateIdentity &&
    bindingState?.identity === candidateIdentity &&
    bindingState.state === "certified";
  if (!linked) {
    throw new Error(
      allowTestOnly
        ? "La fase testOnly exige identity y certificación fixture opacas emitidas y enlazadas en este proceso."
        : "La fase no-stateful requiere identity, receipts y certificación productivos opacos emitidos y enlazados en este proceso.",
    );
  }
  return certification;
}

export function validateD72NonWaivableEvidenceReceipt(
  receipt,
  {
    expectedHead,
    expectedRequestHash,
    expectedArtifactHash,
    expectedCandidateIdentityHash,
    expectedReleaseMode,
    expectedOpenSourceBaselineSha256,
    now = new Date(),
  } = {},
) {
  const errors = [];
  let profile;
  try {
    profile = d72ReleaseEvidenceProfile(receipt ?? {});
  } catch (error) {
    return Object.freeze([error.message]);
  }
  if (!sameKeys(receipt, [...RECEIPT_KEYS, ...Object.keys(profile)])) {
    return Object.freeze([
      "La evidencia D72 contiene campos faltantes o no aprobados.",
    ]);
  }
  if (
    receipt.releaseMode !== expectedReleaseMode ||
    receipt.openSourceBaselineSha256 !== expectedOpenSourceBaselineSha256
  )
    errors.push("El receipt no corresponde al perfil/baseline esperado.");
  if (receipt.schemaVersion !== D72_NON_WAIVABLE_EVIDENCE_SCHEMA_VERSION) {
    errors.push("schemaVersion de evidencia D72 desconocido.");
  }
  if (
    receipt.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    receipt.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("La evidencia D72 no usa la policy canónica actual.");
  }
  for (const [field, expected, pattern] of [
    ["head", expectedHead, FULL_HEAD_PATTERN],
    ["requestHash", expectedRequestHash, SHA256_PATTERN],
    ["artifactHash", expectedArtifactHash, SHA256_PATTERN],
  ]) {
    if (!pattern.test(receipt[field] ?? "") || receipt[field] !== expected) {
      errors.push(`${field} de evidencia D72 no coincide.`);
    }
  }
  if (
    !SHA256_PATTERN.test(receipt.candidateIdentityHash ?? "") ||
    receipt.candidateIdentityHash !== expectedCandidateIdentityHash
  ) {
    errors.push("candidateIdentityHash de evidencia D72 no coincide.");
  }
  if (!RUN_ID_PATTERN.test(receipt.runId ?? "")) {
    errors.push("runId de evidencia D72 no es un UUID v4 canónico.");
  }
  if (
    typeof receipt.canaryExecuted !== "boolean" ||
    (receipt.canaryExecuted
      ? !SHA256_PATTERN.test(receipt.canaryReportHash ?? "")
      : receipt.canaryReportHash !== null)
  ) {
    errors.push("El binding al report canario es inválido.");
  }
  if (
    receipt.deploymentAuthorized !== false ||
    receipt.deploymentExecuted !== false
  ) {
    errors.push("La evidencia técnica no autoriza ni ejecuta deploy OPEN.");
  }

  const startedAt = canonicalInstant(receipt.startedAtUtc);
  const completedAt = canonicalInstant(receipt.completedAtUtc);
  const expiresAt = canonicalInstant(receipt.expiresAtUtc);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (
    !startedAt ||
    !completedAt ||
    !expiresAt ||
    !Number.isFinite(current.getTime()) ||
    completedAt < startedAt ||
    completedAt >= expiresAt ||
    expiresAt.getTime() - startedAt.getTime() >
      D72_NON_WAIVABLE_EVIDENCE_VALIDITY_MS
  ) {
    errors.push("La ventana temporal de evidencia D72 es inválida.");
  } else if (current >= expiresAt) {
    errors.push("La evidencia D72 está vencida.");
  }

  if (!Array.isArray(receipt.gates)) {
    errors.push("gates de evidencia D72 no es un array.");
  } else {
    if (receipt.gates.length !== NON_WAIVABLE_SECURITY_GATE_IDS.length) {
      errors.push("La evidencia D72 debe contener exactamente 27 gates.");
    }
    const window = { startedAt, completedAt };
    for (const [
      index,
      definition,
    ] of NON_WAIVABLE_GATE_EVIDENCE_CATALOG.entries()) {
      errors.push(
        ...gateErrors(
          receipt.gates[index],
          getNonWaivableGateEvidenceDefinitionForRelease(
            definition.gateId,
            profile,
          ),
          window,
          receipt,
        ),
      );
    }
  }
  if (
    !SHA256_PATTERN.test(receipt.contentSha256 ?? "") ||
    receipt.contentSha256 !== d72NonWaivableEvidenceHash(receipt)
  ) {
    errors.push("contentSha256 no sella la evidencia D72.");
  }
  return Object.freeze([...new Set(errors)]);
}

export function createD72NonWaivableEvidenceReceipt({
  head,
  requestHash,
  artifactHash,
  candidateIdentityHash,
  runId,
  startedAtUtc,
  completedAtUtc,
  expiresAtUtc,
  sourceEvidenceByGate,
  canaryExecuted = false,
  canaryReportHash = null,
  ...releaseOptions
} = {}) {
  const profile = d72ReleaseEvidenceProfile(releaseOptions);
  if (!sameKeys(releaseOptions, Object.keys(profile)))
    throw new Error("Perfil final contiene campos desconocidos.");
  if (!isPlainObject(sourceEvidenceByGate)) {
    throw new Error("sourceEvidenceByGate debe ser un objeto cerrado.");
  }
  if (
    JSON.stringify(Object.keys(sourceEvidenceByGate).sort()) !==
    JSON.stringify([...NON_WAIVABLE_SECURITY_GATE_IDS].sort())
  ) {
    throw new Error("sourceEvidenceByGate debe cubrir exactamente 27 gates.");
  }
  const gates = NON_WAIVABLE_GATE_EVIDENCE_CATALOG.map((definition) => {
    const sourceEvidence = (sourceEvidenceByGate[definition.gateId] ?? []).map(
      (source) => ({ ...source }),
    );
    const evidenceStatus = expectedGateStatus(sourceEvidence);
    return {
      gateId: definition.gateId,
      sourceEvidence,
      evidenceStatus,
      rawResult: expectedRawResult(evidenceStatus),
    };
  });
  const payload = {
    schemaVersion: D72_NON_WAIVABLE_EVIDENCE_SCHEMA_VERSION,
    ...profile,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head,
    requestHash,
    artifactHash,
    candidateIdentityHash,
    runId,
    startedAtUtc,
    completedAtUtc,
    expiresAtUtc,
    canaryExecuted,
    canaryReportHash,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    gates,
  };
  const receipt = {
    ...payload,
    contentSha256: d72NonWaivableEvidenceHash(payload),
  };
  const errors = validateD72NonWaivableEvidenceReceipt(receipt, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedArtifactHash: artifactHash,
    expectedCandidateIdentityHash: candidateIdentityHash,
    expectedReleaseMode: profile.releaseMode,
    expectedOpenSourceBaselineSha256: profile.openSourceBaselineSha256,
    now: completedAtUtc,
  });
  if (errors.length > 0) {
    throw new Error(
      `Evidencia NON_WAIVABLE D72 inválida:\n${errors.join("\n")}`,
    );
  }
  return deepFreeze(receipt);
}

export function d72NonWaivableEvidenceBlockers(receipt) {
  if (!Array.isArray(receipt?.gates)) {
    return Object.freeze([...NON_WAIVABLE_SECURITY_GATE_IDS]);
  }
  return Object.freeze(
    receipt.gates
      .filter(
        ({ evidenceStatus, rawResult }) =>
          evidenceStatus !== EVIDENCE_STATUS.PASS ||
          rawResult !== RAW_RESULT.PASS,
      )
      .map(({ gateId }) => gateId),
  );
}

export function d72CanaryRequiredGateIds() {
  return STATEFUL_CANARY_REQUIRED_GATE_IDS;
}
