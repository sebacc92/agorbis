import { validateAaipDatabaseRegistration } from "./aaip-registration-policy.mjs";
import { EXCEPTIONAL_RELEASE_FACTUAL_STATE } from "./exceptional-release-state.mjs";
import { OWNER_WAIVER_CANDIDATE_GATE_IDS } from "./release-gate-policy.mjs";

const EXTERNAL_EMPTY_VARIABLES_BY_GATE = Object.freeze({
  "privacy.provider-locations-unverified": Object.freeze([
    "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
    "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
    "PUBLIC_SUPABASE_PROCESSING_LOCATION",
    "PUBLIC_SUPABASE_PROCESSING_LOCATION_EN",
    "PUBLIC_RESEND_PROCESSING_LOCATION",
    "PUBLIC_RESEND_PROCESSING_LOCATION_EN",
  ]),
  "privacy.provider-retention-unverified": Object.freeze([
    "PUBLIC_PROVIDER_RETENTION_SUMMARY",
    "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
  ]),
  "legal.transfer-safeguards-unverified": Object.freeze([
    "PUBLIC_TRANSFER_SAFEGUARDS",
    "PUBLIC_TRANSFER_SAFEGUARDS_EN",
  ]),
});

const CURRENT_STATE_GATE = Object.freeze({
  RETENTION_RECONCILIATION_STATUS: "privacy.retention-unreconciled",
  PRODUCTION_BACKUP_STATUS: "recovery.production-backup-not-verified",
  SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS:
    "legal.sensitive-consent-0059-omitted",
});

function currentValue(environment, name) {
  return typeof environment?.[name] === "string"
    ? environment[name].trim()
    : "";
}

function acceptedSet(acceptedRiskGateIds) {
  if (!Array.isArray(acceptedRiskGateIds)) {
    throw new Error("acceptedRiskGateIds debe ser un array.");
  }
  const accepted = new Set(acceptedRiskGateIds);
  if (accepted.size !== acceptedRiskGateIds.length) {
    throw new Error("acceptedRiskGateIds contiene duplicados.");
  }
  for (const gateId of accepted) {
    if (!OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gateId)) {
      throw new Error(`Gate desconocido o no renunciable: ${gateId}.`);
    }
  }
  return accepted;
}

function requestedCandidateSet(requestedRiskGateIds) {
  if (!Array.isArray(requestedRiskGateIds)) {
    throw new Error("requestedRiskGateIds debe ser un array.");
  }
  const requested = new Set(requestedRiskGateIds);
  if (requested.size !== requestedRiskGateIds.length) {
    throw new Error("requestedRiskGateIds contiene duplicados.");
  }
  for (const gateId of requested) {
    if (!OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gateId)) {
      throw new Error(
        `Gate candidato desconocido o no renunciable: ${gateId}.`,
      );
    }
  }
  return requested;
}

export function validateD72CandidatePreflightState({
  environment,
  requestedRiskGateIds,
} = {}) {
  const errors = [];
  const warnings = [];
  let requested;
  try {
    requested = requestedCandidateSet(requestedRiskGateIds);
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
      deploymentAuthorized: false,
      deploymentExecuted: false,
      riskAcceptanceRecorded: false,
    };
  }
  if (
    JSON.stringify([...requested]) !==
    JSON.stringify(OWNER_WAIVER_CANDIDATE_GATE_IDS)
  ) {
    errors.push(
      "El build candidato D72 exige exactamente los siete riesgos solicitados en orden canónico.",
    );
  }

  const aaipStatus = currentValue(
    environment,
    "AAIP_DATABASE_REGISTRATION_STATUS",
  );
  const publicAaipStatus = currentValue(
    environment,
    "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
  );
  errors.push(
    ...validateAaipDatabaseRegistration({
      status: aaipStatus,
      registrationId: currentValue(
        environment,
        "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
      ),
      controllerId: currentValue(environment, "PUBLIC_AAIP_CONTROLLER_ID"),
    }),
  );
  if (publicAaipStatus !== aaipStatus) {
    errors.push(
      "AAIP_DATABASE_REGISTRATION_STATUS y su proyección pública no coinciden.",
    );
  }
  if (aaipStatus !== "pending") {
    errors.push(
      "El request candidato ya no coincide con el estado factual AAIP pending.",
    );
  }

  for (const [gateId, names] of Object.entries(
    EXTERNAL_EMPTY_VARIABLES_BY_GATE,
  )) {
    if (!requested.has(gateId)) {
      errors.push(`${gateId} no fue solicitado por el request candidato.`);
      continue;
    }
    const nonEmpty = names.filter((name) => currentValue(environment, name));
    if (nonEmpty.length > 0) {
      errors.push(
        `${gateId} candidato exige mantener vacíos los valores no acreditados: ${nonEmpty.join(", ")}.`,
      );
    }
  }

  for (const [name, gateId] of Object.entries(CURRENT_STATE_GATE)) {
    const expected = EXCEPTIONAL_RELEASE_FACTUAL_STATE[name];
    if (currentValue(environment, name) !== expected) {
      errors.push(`${name} debe ser exactamente ${expected}.`);
    } else if (!requested.has(gateId)) {
      errors.push(`${gateId} no fue solicitado por el request candidato.`);
    }
  }
  if (
    currentValue(environment, "GOOGLE_DRIVE_BACKUP_STATUS") !==
    EXCEPTIONAL_RELEASE_FACTUAL_STATE.GOOGLE_DRIVE_BACKUP_STATUS
  ) {
    errors.push(
      "GOOGLE_DRIVE_BACKUP_STATUS debe permanecer inactive; cualquier activación es configuración desconocida.",
    );
  }
  if (errors.length === 0) {
    warnings.push(
      "Los siete estados se materializan sólo para un candidato local: solicitud no es aceptación, PASS ni autorización de deploy.",
    );
  }
  return {
    errors,
    warnings,
    deploymentAuthorized: false,
    deploymentExecuted: false,
    riskAcceptanceRecorded: false,
  };
}

export function validateExceptionalPreflightState({
  environment,
  acceptedRiskGateIds,
} = {}) {
  const errors = [];
  const warnings = [];
  let accepted;
  try {
    accepted = acceptedSet(acceptedRiskGateIds);
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
    };
  }

  const aaipStatus = currentValue(
    environment,
    "AAIP_DATABASE_REGISTRATION_STATUS",
  );
  const publicAaipStatus = currentValue(
    environment,
    "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
  );
  const aaipRegistrationId = currentValue(
    environment,
    "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
  );
  errors.push(
    ...validateAaipDatabaseRegistration({
      status: aaipStatus,
      registrationId: aaipRegistrationId,
      controllerId: currentValue(environment, "PUBLIC_AAIP_CONTROLLER_ID"),
    }),
  );
  if (publicAaipStatus !== aaipStatus) {
    errors.push(
      "AAIP_DATABASE_REGISTRATION_STATUS y su proyección pública no coinciden.",
    );
  }
  if (aaipStatus === "pending") {
    if (!accepted.has("legal.aaip-registration-pending")) {
      errors.push(
        "legal.aaip-registration-pending conserva BLOCKED_EXTERNAL y requiere aceptación individual.",
      );
    } else {
      warnings.push(
        "legal.aaip-registration-pending: BLOCKED_EXTERNAL; el ID permanece vacío; RISK_ACCEPTED_BY_OWNER no es PASS.",
      );
    }
  } else if (accepted.has("legal.aaip-registration-pending")) {
    errors.push(
      "legal.aaip-registration-pending no admite aceptación cuando la evidencia AAIP es PASS.",
    );
  }

  for (const [gateId, names] of Object.entries(
    EXTERNAL_EMPTY_VARIABLES_BY_GATE,
  )) {
    if (!accepted.has(gateId)) {
      errors.push(`${gateId} requiere aceptación individual.`);
      continue;
    }
    const nonEmpty = names.filter((name) => currentValue(environment, name));
    if (nonEmpty.length > 0) {
      errors.push(
        `${gateId} aceptado exige mantener vacíos los valores no acreditados: ${nonEmpty.join(", ")}.`,
      );
    } else {
      warnings.push(
        `${gateId}: BLOCKED_EXTERNAL; valores factuales vacíos; RISK_ACCEPTED_BY_OWNER no es PASS.`,
      );
    }
  }

  for (const [name, gateId] of Object.entries(CURRENT_STATE_GATE)) {
    const expected = EXCEPTIONAL_RELEASE_FACTUAL_STATE[name];
    if (currentValue(environment, name) !== expected) {
      errors.push(`${name} debe ser exactamente ${expected}.`);
    } else if (!accepted.has(gateId)) {
      errors.push(`${gateId} requiere aceptación individual.`);
    } else {
      warnings.push(
        `${gateId}: ${name}=${expected}; RISK_ACCEPTED_BY_OWNER no es PASS.`,
      );
    }
  }

  if (
    currentValue(environment, "GOOGLE_DRIVE_BACKUP_STATUS") !==
    EXCEPTIONAL_RELEASE_FACTUAL_STATE.GOOGLE_DRIVE_BACKUP_STATUS
  ) {
    errors.push(
      "GOOGLE_DRIVE_BACKUP_STATUS debe permanecer inactive; cualquier activación es configuración desconocida.",
    );
  } else {
    warnings.push(
      "Google Drive permanece inactive: sin OAuth, upload, descarga ni restore acreditados.",
    );
  }

  return { errors, warnings };
}

export function normalFactualStateBlockers(environment) {
  const errors = [];
  if (
    currentValue(environment, "RETENTION_RECONCILIATION_STATUS") !==
    "reconciled"
  ) {
    errors.push(
      "RETENTION_RECONCILIATION_STATUS debe ser reconciled para el release normal.",
    );
  }
  if (currentValue(environment, "PRODUCTION_BACKUP_STATUS") !== "verified") {
    errors.push(
      "PRODUCTION_BACKUP_STATUS debe ser verified para el release normal.",
    );
  }
  if (
    currentValue(environment, "SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS") !==
    "applied"
  ) {
    errors.push(
      "SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS debe ser applied para el release normal.",
    );
  }
  if (currentValue(environment, "GOOGLE_DRIVE_BACKUP_STATUS") !== "inactive") {
    errors.push(
      "GOOGLE_DRIVE_BACKUP_STATUS desconocido; debe permanecer inactive.",
    );
  }
  return errors;
}
