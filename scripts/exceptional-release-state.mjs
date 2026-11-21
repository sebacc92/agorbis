import {
  EVIDENCE_STATUS,
  getReleaseGateDefinition,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
} from "./release-gate-policy.mjs";

export const EXCEPTIONAL_RELEASE_FACTUAL_STATE = Object.freeze({
  PRODUCTION_BACKUP_STATUS: "not_verified",
  GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
  RETENTION_RECONCILIATION_STATUS: "unreconciled",
  SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
});

export function currentExceptionalRiskGateResults() {
  return Object.freeze(
    OWNER_WAIVER_CANDIDATE_GATE_IDS.map((gateId) => {
      const definition = getReleaseGateDefinition(gateId);
      return Object.freeze({
        gateId,
        evidenceStatus: definition.evidenceStatus,
        rawResult: definition.rawResult,
      });
    }),
  );
}

export function nonWaivableGateResult(
  gateId,
  { passed, failureEvidenceStatus = EVIDENCE_STATUS.FAIL } = {},
) {
  const definition = getReleaseGateDefinition(gateId);
  if (!definition || definition.waiverPolicy !== "NEVER") {
    throw new Error(`Gate no renunciable desconocido: ${gateId}.`);
  }
  if (typeof passed !== "boolean") {
    throw new Error(`${gateId} requiere un resultado booleano explícito.`);
  }
  if (
    passed === false &&
    ![EVIDENCE_STATUS.FAIL, EVIDENCE_STATUS.NOT_VERIFIED].includes(
      failureEvidenceStatus,
    )
  ) {
    throw new Error(`${gateId} tiene failureEvidenceStatus inválido.`);
  }
  return Object.freeze({
    gateId,
    evidenceStatus: passed ? EVIDENCE_STATUS.PASS : failureEvidenceStatus,
    rawResult: passed ? RAW_RESULT.PASS : RAW_RESULT.FAIL,
  });
}
