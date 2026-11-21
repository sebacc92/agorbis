import { isForbiddenAaipDatabaseRegistrationIdValue } from "../src/lib/legal-evidence-policy.js";

export const AAIP_DATABASE_REGISTRATION_STATUSES = Object.freeze({
  pending: "pending",
  approved: "approved",
});

// Fuente canónica y versionada. PUBLIC_AAIP_DATABASE_REGISTRATION_ID conserva
// exclusivamente el significado de número real incluido en una constancia
// aprobada; nunca se reutiliza como estado.
export const AAIP_DATABASE_REGISTRATION_STATUS =
  AAIP_DATABASE_REGISTRATION_STATUSES.pending;

export const AAIP_PENDING_COPY = Object.freeze({
  es: "Inscripción de la base ante la AAIP: en trámite. Aún no se cuenta con una constancia aprobada ni con un número de registro de la base. El código del responsable y las referencias del trámite no sustituyen ese número.",
  en: "AAIP database registration: pending. No approved registration certificate or database registration number is currently available. Controller and filing references do not replace that number.",
});

export function isForbiddenAaipDatabaseRegistrationId(
  registrationId,
  { controllerId = "" } = {},
) {
  return isForbiddenAaipDatabaseRegistrationIdValue(registrationId, {
    controllerId,
  });
}

export function validateAaipDatabaseRegistration({
  status,
  registrationId = "",
  controllerId = "",
} = {}) {
  const errors = [];
  const currentId =
    typeof registrationId === "string" ? registrationId.trim() : "";

  if (!Object.values(AAIP_DATABASE_REGISTRATION_STATUSES).includes(status)) {
    return [
      "AAIP_DATABASE_REGISTRATION_STATUS debe ser exactamente pending o approved.",
    ];
  }

  if (status === AAIP_DATABASE_REGISTRATION_STATUSES.pending) {
    if (currentId) {
      errors.push(
        "AAIP_DATABASE_REGISTRATION_STATUS=pending exige que PUBLIC_AAIP_DATABASE_REGISTRATION_ID permanezca vacío.",
      );
    }
    return errors;
  }

  if (!currentId) {
    errors.push(
      "AAIP_DATABASE_REGISTRATION_STATUS=approved exige el número real de la constancia aprobada en PUBLIC_AAIP_DATABASE_REGISTRATION_ID.",
    );
    return errors;
  }
  if (isForbiddenAaipDatabaseRegistrationId(currentId, { controllerId })) {
    errors.push(
      "PUBLIC_AAIP_DATABASE_REGISTRATION_ID no puede contener RL/EX/RE/PV/IF, CUIL/CUIT, referencias de trámite, estados pendientes ni placeholders de prueba, ejemplo, fake o falso.",
    );
  }
  return errors;
}

export function evaluateAaipDatabaseRegistration(input = {}) {
  const errors = validateAaipDatabaseRegistration(input);
  if (errors.length > 0) {
    return Object.freeze({
      evidenceStatus: "FAIL",
      rawResult: "FAIL",
      errors: Object.freeze(errors),
    });
  }
  if (input.status === AAIP_DATABASE_REGISTRATION_STATUSES.pending) {
    return Object.freeze({
      evidenceStatus: "BLOCKED_EXTERNAL",
      rawResult: "FAIL",
      errors: Object.freeze([]),
    });
  }
  return Object.freeze({
    evidenceStatus: "PASS",
    rawResult: "PASS",
    errors: Object.freeze([]),
  });
}
