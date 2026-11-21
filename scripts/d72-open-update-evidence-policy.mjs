import { assertD72GoogleAuthBrowserCaptureReceipt } from "./d72-google-auth-capture.mjs";
import * as canaryExecutor from "./run-d72-canary.mjs";
import { createHash, randomUUID } from "node:crypto";
import {
  canonicalJson,
  exceptionalReleaseRequestHash,
  assertExceptionalReleaseRequest,
} from "./exceptional-release-act.mjs";
import { validateExceptionalReleaseArtifactManifest } from "./exceptional-release-artifact.mjs";
import { assertOpenReleaseBaselineRecord } from "./open-release-baseline-policy.mjs";
import { assertExceptionalOpenRecoveryCapsule } from "./exceptional-open-recovery-capsule.mjs";
import {
  assertD72NonStatefulEvidenceAllowsCanary,
  createD72NonWaivableEvidenceReceipt,
  d72NonWaivableEvidenceBlockers,
  validateD72NonWaivableEvidenceReceipt,
} from "./d72-non-waivable-evidence-policy.mjs";
import {
  validateD72CanaryReceipt,
  validateD72CanaryVersionCertification,
} from "./d72-canary-policy.mjs";
import {
  validateD72StatefulCanaryReport,
  createD72StatefulCanaryAuthorization,
  createD72StatefulCanaryReport,
  d72StatefulCanaryChecksForRelease,
  d72StatefulCanaryAuthorizationPhrase,
} from "./d72-stateful-canary-policy.mjs";
import {
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
  getNonWaivableGateEvidenceDefinitionForRelease,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const D72_OPEN_UPDATE_EVIDENCE_SCHEMA_VERSION =
  "agorbis-d72-open-update-evidence/v1";
const ISSUED_CERTIFICATES = new WeakMap();
const CONSENT_CLEANUP_RECEIPTS = new WeakMap();
const HASH = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KEYS = [
  "schemaVersion",
  "releaseMode",
  "head",
  "requestHash",
  "artifactHash",
  "candidateIdentityHash",
  "openSourceBaselineSha256",
  "sourceVersionId",
  "sourceDeploymentId",
  "createdAtUtc",
  "expiresAtUtc",
  "nonWaivableEvidenceReceipt",
  "statefulManifest",
  "statefulAuthorization",
  "statefulReport",
  "canaryReceipt",
  "versionCertification",
  "recoveryCapsuleManifest",
  "recoveryExpectedBindings",
  "recoveryArtifactHash",
  "recoveryVersionId",
  "cleanupDeploymentId",
  "deploymentChain",
  "canaryExecution",
  "promotionAllowed",
  "deploymentAuthorized",
  "deploymentExecuted",
  "contentSha256",
];
function invariant(value, message) {
  if (!value) throw new Error(message);
}
function data(value, depth = 0) {
  invariant(depth < 40, "Profundidad de evidencia inválida.");
  if (value === null || ["string", "boolean"].includes(typeof value))
    return value;
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "Número no JSON.");
    return value;
  }
  invariant(
    value &&
      typeof value === "object" &&
      [Object.prototype, Array.prototype].includes(
        Object.getPrototypeOf(value),
      ),
    "Evidencia requiere datos JSON planos.",
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  invariant(
    Reflect.ownKeys(descriptors).every((key) => typeof key === "string"),
    "Evidencia contiene símbolos.",
  );
  for (const [key, descriptor] of Object.entries(descriptors))
    if (!(Array.isArray(value) && key === "length"))
      invariant(
        Object.hasOwn(descriptor, "value") && descriptor.enumerable,
        "Evidencia no admite accessors ni propiedades ocultas.",
      );
  return Array.isArray(value)
    ? value.map((item) => data(item, depth + 1))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          data(item, depth + 1),
        ]),
      );
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function exact(value, keys, label) {
  invariant(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
    `${label}: campos desconocidos o incompletos.`,
  );
}
export function d72OpenUpdateEvidenceCertificateHash(certificate) {
  const payload = data(certificate);
  delete payload.contentSha256;
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
function currentUtc(now) {
  const date = new Date(now);
  invariant(Number.isFinite(date.getTime()), "Reloj inválido.");
  return date.toISOString();
}
function promotionFacts(certificate) {
  return (
    d72NonWaivableEvidenceBlockers(certificate.nonWaivableEvidenceReceipt)
      .length === 0 &&
    certificate.statefulReport?.statefulCanaryPassed === true &&
    certificate.statefulReport.evidence.some(
      (item) => item.checkId === "auth.google-oauth" && item.status === "PASS",
    ) &&
    certificate.canaryReceipt !== null &&
    certificate.versionCertification !== null &&
    certificate.recoveryCapsuleManifest !== null &&
    certificate.cleanupDeploymentId !== null &&
    certificate.deploymentChain.length === 2
  );
}
export function validateD72OpenUpdateEvidenceCertificate(
  certificate,
  options = {},
) {
  try {
    assertD72OpenUpdateEvidenceCertificate(certificate, options);
    return Object.freeze([]);
  } catch (error) {
    return Object.freeze([error.message]);
  }
}
/** Structural validation requires an external hash. It never confers execution authority. */
export function assertD72OpenUpdateEvidenceCertificate(
  certificate,
  {
    expectedCertificateHash,
    request,
    artifactManifest,
    now = new Date(),
    requirePromotionReady = false,
  } = {},
) {
  const record = data(certificate);
  exact(record, KEYS, "Certificado OPEN");
  invariant(
    HASH.test(expectedCertificateHash ?? "") &&
      expectedCertificateHash === record.contentSha256 &&
      record.contentSha256 === d72OpenUpdateEvidenceCertificateHash(record),
    "El certificado OPEN no coincide con el hash externo.",
  );
  invariant(
    record.schemaVersion === D72_OPEN_UPDATE_EVIDENCE_SCHEMA_VERSION &&
      record.releaseMode === "OPEN_UPDATE" &&
      record.deploymentAuthorized === false &&
      record.deploymentExecuted === false,
    "Schema/alcance OPEN inválido.",
  );
  invariant(
    request?.releaseMode === "OPEN_UPDATE" &&
      artifactManifest?.releaseMode === "OPEN_UPDATE" &&
      artifactManifest.artifactPurpose === "primary",
    "El certificado exige request y artefacto primary OPEN_UPDATE.",
  );
  assertExceptionalReleaseRequest(request, { currentHead: record.head, now });
  const manifestErrors = validateExceptionalReleaseArtifactManifest(
    artifactManifest,
    {
      expectedHead: record.head,
      expectedRequestHash: record.requestHash,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedArtifactHash: record.artifactHash,
    },
  );
  invariant(
    manifestErrors.length === 0,
    `Artefacto certificado inválido: ${manifestErrors.join("; ")}`,
  );
  invariant(
    record.requestHash === exceptionalReleaseRequestHash(request) &&
      record.artifactHash === artifactManifest.contentSha256 &&
      record.head === artifactManifest.head &&
      record.openSourceBaselineSha256 === request.openSourceBaselineSha256 &&
      record.openSourceBaselineSha256 ===
        artifactManifest.openSourceBaselineSha256,
    "Bindings del certificado OPEN no coinciden.",
  );
  assertOpenReleaseBaselineRecord({
    baseline: request.openSourceBaseline,
    expectedBaselineSha256: record.openSourceBaselineSha256,
    nowUtc: currentUtc(now),
  });
  invariant(
    record.sourceVersionId === request.openSourceBaseline.versionId &&
      record.sourceDeploymentId === request.openSourceBaseline.deploymentId,
    "Origen OPEN distinto del baseline.",
  );
  invariant(
    record.createdAtUtc === currentUtc(record.createdAtUtc) &&
      record.expiresAtUtc === currentUtc(record.expiresAtUtc) &&
      record.createdAtUtc < record.expiresAtUtc &&
      currentUtc(now) < record.expiresAtUtc &&
      record.expiresAtUtc <= request.openSourceBaseline.expiresAtUtc,
    "Ventana del certificado OPEN inválida o vencida.",
  );
  const receiptErrors = validateD72NonWaivableEvidenceReceipt(
    record.nonWaivableEvidenceReceipt,
    {
      expectedHead: record.head,
      expectedRequestHash: record.requestHash,
      expectedArtifactHash: record.artifactHash,
      expectedCandidateIdentityHash: record.candidateIdentityHash,
      expectedReleaseMode: "OPEN_UPDATE",
      expectedOpenSourceBaselineSha256: record.openSourceBaselineSha256,
      now,
    },
  );
  invariant(
    receiptErrors.length === 0,
    `Evidencia 27 gates inválida: ${receiptErrors.join("; ")}`,
  );
  const stateful = [
    record.statefulManifest,
    record.statefulAuthorization,
    record.statefulReport,
  ];
  if (record.canaryExecution !== null) {
    const execution = record.canaryExecution;
    exact(
      execution,
      [
        "outcome",
        "candidateVersionId",
        "cleanupVerified",
        "cleanupDeploymentId",
        "recoveryVerified",
        "recoveryVersionId",
        "recoveryDeploymentId",
        "recoveryCapsuleHash",
        "newFixtureDeletionStatus",
      ],
      "Ejecución diagnóstica canary",
    );
    invariant(
      UUID.test(execution.candidateVersionId) &&
        HASH.test(execution.recoveryCapsuleHash) &&
        execution.newFixtureDeletionStatus === "NOT_VERIFIED",
      "La ejecución diagnóstica no acredita borrado de cuentas ni datos cívicos.",
    );
    const emergency = execution.outcome === "EMERGENCY_RECOVERED";
    invariant(
      emergency || execution.outcome === "SOURCE_RESTORED",
      "Resultado de recuperación diagnóstica desconocido.",
    );
    invariant(
      emergency
        ? execution.cleanupVerified === false &&
            execution.cleanupDeploymentId === null &&
            execution.recoveryVerified === true &&
            UUID.test(execution.recoveryVersionId) &&
            UUID.test(execution.recoveryDeploymentId)
        : execution.cleanupVerified === true &&
            UUID.test(execution.cleanupDeploymentId) &&
            execution.recoveryVerified === false &&
            execution.recoveryVersionId === null &&
            execution.recoveryDeploymentId === null,
      "La recuperación de infraestructura no acredita retiro ni cierre de sesiones.",
    );
    invariant(
      record.promotionAllowed === false,
      "Una ejecución diagnóstica no autoriza promoción.",
    );
  }
  invariant(
    stateful.every((value) => value === null) ||
      stateful.every((value) => value !== null),
    "El stateful debe incluir manifiesto, autorización y reporte juntos.",
  );
  if (record.statefulReport) {
    const errors = validateD72StatefulCanaryReport(record.statefulReport, {
      manifest: record.statefulManifest,
      authorization: record.statefulAuthorization,
      expectedBindings: {
        head: record.head,
        requestHash: record.requestHash,
        policyHash: RELEASE_GATE_POLICY_SHA256,
        artifactHash: record.artifactHash,
        canaryVersionId: record.statefulManifest.canaryVersionId,
        releaseMode: "OPEN_UPDATE",
        openSourceBaselineSha256: record.openSourceBaselineSha256,
      },
    });
    invariant(
      errors.length === 0,
      `Stateful OPEN inválido: ${errors.join("; ")}`,
    );
    invariant(
      record.nonWaivableEvidenceReceipt.canaryReportHash ===
        record.statefulReport.contentSha256,
      "El stateful no está ligado a los 27 gates.",
    );
  } else
    invariant(
      record.nonWaivableEvidenceReceipt.canaryExecuted === false,
      "Un diagnóstico sin stateful no acredita ejecución.",
    );
  invariant(
    Array.isArray(record.deploymentChain),
    "Falta cadena de deployment.",
  );
  const recovery = [
    record.recoveryCapsuleManifest,
    record.recoveryExpectedBindings,
    record.recoveryArtifactHash,
    record.recoveryVersionId,
  ];
  invariant(
    recovery.every((value) => value === null) ||
      recovery.every((value) => value !== null),
    "Recuperación OPEN incompleta.",
  );
  if (record.recoveryCapsuleManifest) {
    const capsule = assertExceptionalOpenRecoveryCapsule(
      record.recoveryCapsuleManifest,
      record.recoveryExpectedBindings,
    );
    invariant(
      capsule.recoveryScope === "CANARY_ONLY" &&
        capsule.head === record.head &&
        capsule.requestHash === record.requestHash &&
        capsule.artifactHash === record.artifactHash &&
        capsule.candidateIdentityHash === record.candidateIdentityHash &&
        capsule.openSourceBaselineSha256 === record.openSourceBaselineSha256 &&
        capsule.recoveryArtifactHash === record.recoveryArtifactHash &&
        capsule.recoveryVersionId === record.recoveryVersionId &&
        record.recoveryArtifactHash === artifactManifest.recoveryArtifactHash,
      "La cápsula de recuperación no está ligada al candidato exacto.",
    );
  }
  if (
    record.canaryReceipt ||
    record.versionCertification ||
    record.cleanupDeploymentId ||
    record.deploymentChain.length
  ) {
    invariant(
      record.canaryReceipt &&
        record.versionCertification &&
        record.recoveryCapsuleManifest &&
        record.statefulManifest,
      "La prueba de deployment requiere receipts y recuperación completos.",
    );
    const versionErrors = validateD72CanaryVersionCertification(
      record.versionCertification,
      {
        expectedHead: record.head,
        expectedRequestHash: record.requestHash,
        expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
        expectedArtifactHash: record.artifactHash,
        expectedReleaseMode: "OPEN_UPDATE",
        expectedOpenSourceBaselineSha256: record.openSourceBaselineSha256,
        expectedSourceVersionId: record.sourceVersionId,
        expectedSourceDeploymentId: record.sourceDeploymentId,
        now: record.versionCertification.observedAtUtc,
      },
    );
    invariant(
      versionErrors.length === 0,
      `Version certificada inválida: ${versionErrors.join("; ")}`,
    );
    const canaryErrors = validateD72CanaryReceipt(record.canaryReceipt, {
      expectedHead: record.head,
      expectedRequestHash: record.requestHash,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedArtifactHash: record.artifactHash,
      expectedCanaryId: record.statefulManifest.canaryId,
      expectedStatefulManifestHash: record.statefulManifest.contentSha256,
      expectedVersionCertification: record.versionCertification,
      now,
    });
    invariant(
      canaryErrors.length === 0,
      `Receipt canary inválido: ${canaryErrors.join("; ")}`,
    );
    invariant(
      record.deploymentChain.length === 2,
      "La cadena sólo permite attach y cleanup normales.",
    );
    const [attach, cleanup] = record.deploymentChain;
    for (const transition of record.deploymentChain)
      exact(
        transition,
        ["phase", "previousDeploymentId", "deploymentId"],
        "Transición",
      );
    invariant(
      attach.phase === "attach" &&
        cleanup.phase === "cleanup" &&
        attach.previousDeploymentId === record.sourceDeploymentId &&
        cleanup.previousDeploymentId === attach.deploymentId &&
        cleanup.deploymentId === record.cleanupDeploymentId &&
        UUID.test(attach.deploymentId) &&
        UUID.test(cleanup.deploymentId) &&
        new Set([
          record.sourceDeploymentId,
          attach.deploymentId,
          cleanup.deploymentId,
        ]).size === 3,
      "La cadena OPEN no acredita las dos transiciones autorizadas.",
    );
    invariant(
      record.canaryReceipt.cleanupDeploymentId === record.cleanupDeploymentId &&
        record.canaryReceipt.recoveryCapsuleHash ===
          record.recoveryCapsuleManifest.contentSha256 &&
        record.canaryReceipt.recoveryVersionId === record.recoveryVersionId &&
        record.canaryReceipt.recoveryArtifactHash ===
          record.recoveryArtifactHash,
      "El receipt no conserva cleanup y fallback exactos.",
    );
  }
  invariant(
    record.promotionAllowed === promotionFacts(record),
    "promotionAllowed no deriva de hechos completos.",
  );
  invariant(
    !requirePromotionReady || record.promotionAllowed,
    "El certificado mantiene gates/stateful/Google/recuperación pendientes; no permite promoción.",
  );
  return freeze(record);
}

/** Opaque local evidence, including diagnostics, may be persisted. A JSON clone cannot be issued. */
export function assertD72OpenUpdateEvidenceCertificateIssued(
  certificate,
  { allowTestOnly = false } = {},
) {
  const issued = ISSUED_CERTIFICATES.get(certificate);
  invariant(
    issued && (!issued.testOnly || allowTestOnly === true),
    "El certificado OPEN no fue emitido por observaciones de esta corrida.",
  );
  return certificate;
}

/** Until each stateful collector observes its check, its sources remain NOT_VERIFIED. */
export function createD72OpenUpdateEvidenceDiagnostic({
  candidateIdentity,
  nonStatefulCertification,
  request,
  artifactManifest,
  testOnly = false,
  now,
} = {}) {
  invariant(
    testOnly === true || now === undefined,
    "El reloj productivo no es inyectable.",
  );
  const current = testOnly ? new Date(now) : new Date();
  assertD72NonStatefulEvidenceAllowsCanary(nonStatefulCertification, {
    candidateIdentity,
    expectedHead: candidateIdentity.head,
    expectedRequestHash: candidateIdentity.requestHash,
    expectedArtifactHash: candidateIdentity.artifactHash,
    ...(testOnly ? { allowTestOnly: true, now: current } : {}),
  });
  invariant(
    candidateIdentity.releaseMode === "OPEN_UPDATE",
    "El diagnóstico exige identidad OPEN opaca.",
  );
  const observedAtUtc = current.toISOString();
  const sourceEvidenceByGate = Object.fromEntries(
    NON_WAIVABLE_GATE_EVIDENCE_CATALOG.map(({ gateId }) => {
      const observed = nonStatefulCertification.gates.find(
        (gate) => gate.gateId === gateId,
      );
      return [
        gateId,
        observed
          ? observed.sourceEvidence
          : getNonWaivableGateEvidenceDefinitionForRelease(
              gateId,
              candidateIdentity,
            ).sourceIds.map((sourceId) => ({
              sourceId,
              status: "NOT_VERIFIED",
              digest: createHash("sha256")
                .update(
                  `${candidateIdentity.contentSha256}:${sourceId}:not-observed`,
                )
                .digest("hex"),
              observedAtUtc,
            })),
      ];
    }),
  );
  const nonWaivableEvidenceReceipt = createD72NonWaivableEvidenceReceipt({
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: candidateIdentity.contentSha256,
    runId: randomUUID(),
    startedAtUtc: nonStatefulCertification.startedAtUtc,
    completedAtUtc: observedAtUtc,
    expiresAtUtc: candidateIdentity.expiresAtUtc,
    sourceEvidenceByGate,
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: candidateIdentity.openSourceBaselineSha256,
  });
  const payload = {
    schemaVersion: D72_OPEN_UPDATE_EVIDENCE_SCHEMA_VERSION,
    releaseMode: "OPEN_UPDATE",
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    artifactHash: candidateIdentity.artifactHash,
    candidateIdentityHash: candidateIdentity.contentSha256,
    openSourceBaselineSha256: candidateIdentity.openSourceBaselineSha256,
    sourceVersionId: request.openSourceBaseline.versionId,
    sourceDeploymentId: request.openSourceBaseline.deploymentId,
    createdAtUtc: observedAtUtc,
    expiresAtUtc: candidateIdentity.expiresAtUtc,
    nonWaivableEvidenceReceipt,
    statefulManifest: null,
    statefulAuthorization: null,
    statefulReport: null,
    canaryReceipt: null,
    versionCertification: null,
    recoveryCapsuleManifest: null,
    recoveryExpectedBindings: null,
    recoveryArtifactHash: null,
    recoveryVersionId: null,
    cleanupDeploymentId: null,
    deploymentChain: [],
    canaryExecution: null,
    promotionAllowed: false,
    deploymentAuthorized: false,
    deploymentExecuted: false,
  };
  const certificate = freeze({
    ...payload,
    contentSha256: d72OpenUpdateEvidenceCertificateHash(payload),
  });
  assertD72OpenUpdateEvidenceCertificate(certificate, {
    expectedCertificateHash: certificate.contentSha256,
    request,
    artifactManifest,
    now: current,
  });
  ISSUED_CERTIFICATES.set(certificate, { testOnly });
  return certificate;
}

// Cleanup authority comes only from a browser collector that actually observed
// withdrawal AND sign-out. A structurally valid stateful fact map is insufficient.
export function assertD72OpenCanaryConsentCleanupEvidence(
  evidence,
  bindings,
  { allowTestOnly = false } = {},
) {
  const issued = CONSENT_CLEANUP_RECEIPTS.get(evidence);
  invariant(
    issued && (!issued.testOnly || allowTestOnly),
    "Falta evidencia opaca de retiro y cierre de las sesiones Google de prueba.",
  );
  for (const key of [
    "candidateIdentityHash",
    "head",
    "requestHash",
    "artifactHash",
    "canaryVersionId",
    "openSourceBaselineSha256",
    "attachedDeploymentId",
  ])
    invariant(
      issued.bindings[key] === bindings[key],
      `La evidencia de consentimiento no corresponde a ${key}.`,
    );
  return evidence;
}
export function issueTestD72OpenCanaryConsentCleanupEvidence({
  testOnly,
  bindings,
} = {}) {
  invariant(
    testOnly === true,
    "El emisor de fixtures de limpieza sólo admite testOnly.",
  );
  const evidence = freeze({
    schemaVersion: "agorbis-d72-open-consent-cleanup/v1",
    ...data(bindings),
    consentsWithdrawn: true,
    testSessionsClosed: true,
  });
  CONSENT_CLEANUP_RECEIPTS.set(evidence, {
    testOnly: true,
    bindings: data(bindings),
  });
  return evidence;
}

export function createD72OpenCanaryConsentCleanupEvidenceFromBrowserCapture(
  captureReceipt,
  bindings,
) {
  assertD72GoogleAuthBrowserCaptureReceipt(captureReceipt, bindings);
  invariant(
    captureReceipt.failed === false &&
      captureReceipt.attachedDeploymentId === bindings.attachedDeploymentId &&
      captureReceipt.cleanup.twoDistinctTestAccountsObserved === true &&
      captureReceipt.cleanup.consentsWithdrawn === true &&
      captureReceipt.cleanup.testSessionsClosed === true &&
      captureReceipt.cleanup.serverSessionRevocation === "PASS",
    "La captura no acredita retiro y revocación de las dos cuentas de prueba.",
  );
  const evidence = freeze({
    schemaVersion: "agorbis-d72-open-consent-cleanup/v1",
    ...data(bindings),
    observedAtUtc: captureReceipt.completedAtUtc,
    captureHash: captureReceipt.contentSha256,
    consentsWithdrawn: true,
    testSessionsClosed: true,
  });
  CONSENT_CLEANUP_RECEIPTS.set(evidence, {
    testOnly: false,
    bindings: data(bindings),
  });
  return evidence;
}

/** Builds an honest report: unimplemented collectors stay NOT_VERIFIED. */
export function createD72StatefulReportFromGoogleBrowserCapture({
  captureReceipt,
  manifest,
  bindings,
} = {}) {
  assertD72GoogleAuthBrowserCaptureReceipt(captureReceipt, bindings);
  invariant(
    captureReceipt.statefulManifestHash === manifest.contentSha256,
    "La captura no corresponde al manifiesto stateful autorizado.",
  );
  const authorization = createD72StatefulCanaryAuthorization({
    manifest,
    statement: d72StatefulCanaryAuthorizationPhrase(manifest),
    now: captureReceipt.statefulAuthorizationEvidence.confirmedAtUtc,
  });
  invariant(
    authorization.statementSha256 ===
      captureReceipt.statefulAuthorizationEvidence.statementSha256,
    "La autorización TTY de la captura no coincide.",
  );
  const evidence = d72StatefulCanaryChecksForRelease(manifest).map(
    ({ id, passingFacts }) =>
      captureReceipt.evidence.find((item) => item.checkId === id) ?? {
        checkId: id,
        status: "NOT_VERIFIED",
        observedAtUtc: captureReceipt.completedAtUtc,
        facts: Object.fromEntries(
          Object.keys(passingFacts).map((key) => [key, null]),
        ),
      },
  );
  const report = createD72StatefulCanaryReport({
    manifest,
    authorization,
    evidence,
    startedAtUtc: captureReceipt.startedAtUtc,
    completedAtUtc: captureReceipt.completedAtUtc,
  });
  return freeze({ manifest, authorization, report });
}

/** A partial real browser run records its findings; seven stateful gates stay unverified. */
export function createD72OpenUpdateEvidenceFromGoogleCapture({
  candidateIdentity,
  nonStatefulCertification,
  request,
  artifactManifest,
  statefulManifest,
  captureReceipt,
  cleanupReceipt,
  emergency = false,
} = {}) {
  const bindings = {
    candidateIdentityHash: candidateIdentity.contentSha256,
    head: candidateIdentity.head,
    requestHash: candidateIdentity.requestHash,
    artifactHash: candidateIdentity.artifactHash,
    canaryVersionId: statefulManifest.canaryVersionId,
    openSourceBaselineSha256: candidateIdentity.openSourceBaselineSha256,
  };
  invariant(
    typeof emergency === "boolean",
    "La recuperación debe indicar su tipo exacto.",
  );
  if (emergency)
    canaryExecutor.assertD72OpenCanaryEmergencyRecoveryReceipt(
      cleanupReceipt,
      bindings,
    );
  else
    canaryExecutor.assertD72OpenCanaryCleanupReceipt(cleanupReceipt, bindings);
  const stateful = captureReceipt
    ? createD72StatefulReportFromGoogleBrowserCapture({
        captureReceipt,
        manifest: statefulManifest,
        bindings,
      })
    : null;
  const base = createD72OpenUpdateEvidenceDiagnostic({
    candidateIdentity,
    nonStatefulCertification,
    request,
    artifactManifest,
  });
  const previousReceipt = base.nonWaivableEvidenceReceipt;
  const receipt = createD72NonWaivableEvidenceReceipt({
    head: base.head,
    requestHash: base.requestHash,
    artifactHash: base.artifactHash,
    candidateIdentityHash: base.candidateIdentityHash,
    runId: previousReceipt.runId,
    startedAtUtc: previousReceipt.startedAtUtc,
    completedAtUtc: base.createdAtUtc,
    expiresAtUtc: base.expiresAtUtc,
    sourceEvidenceByGate: Object.fromEntries(
      previousReceipt.gates.map((gate) => [gate.gateId, gate.sourceEvidence]),
    ),
    canaryExecuted: !!stateful,
    canaryReportHash: stateful?.report.contentSha256 ?? null,
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: base.openSourceBaselineSha256,
  });
  const payload = {
    ...base,
    nonWaivableEvidenceReceipt: receipt,
    statefulManifest: stateful?.manifest ?? null,
    statefulAuthorization: stateful?.authorization ?? null,
    statefulReport: stateful?.report ?? null,
    canaryExecution: {
      outcome: emergency ? "EMERGENCY_RECOVERED" : "SOURCE_RESTORED",
      candidateVersionId: statefulManifest.canaryVersionId,
      cleanupVerified: !emergency,
      cleanupDeploymentId: emergency
        ? null
        : cleanupReceipt.cleanupDeploymentId,
      recoveryVerified: emergency,
      recoveryVersionId: emergency ? cleanupReceipt.recoveryVersionId : null,
      recoveryDeploymentId: emergency
        ? cleanupReceipt.recoveryDeploymentId
        : null,
      recoveryCapsuleHash: cleanupReceipt.recoveryCapsuleHash,
      newFixtureDeletionStatus: "NOT_VERIFIED",
    },
  };
  const certificate = freeze({
    ...payload,
    contentSha256: d72OpenUpdateEvidenceCertificateHash(payload),
  });
  assertD72OpenUpdateEvidenceCertificate(certificate, {
    expectedCertificateHash: certificate.contentSha256,
    request,
    artifactManifest,
    now: new Date(),
  });
  ISSUED_CERTIFICATES.set(certificate, { testOnly: false });
  return certificate;
}
