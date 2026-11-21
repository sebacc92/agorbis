import { createHash } from "node:crypto";
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
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  AUTHORIZED_RISK_OWNER,
  EVIDENCE_STATUS,
  GATE_POLICY,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  SENSITIVE_CONSENT_0059_AFFECTED_SURFACES,
  WAIVER_POLICY,
  applyReleaseGateWaivers,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";
import {
  EXCEPTIONAL_RELEASE_STEP_IDS,
  EXCEPTIONAL_OPEN_UPDATE_STEP_IDS,
  requiredRiskConfirmationPhrases,
  validateRiskConfirmations,
} from "./exceptional-open-release-runner-policy.mjs";
import { findKnownSecrets } from "./secret-patterns.mjs";
import { assertOpenReleaseBaselineRecord } from "./open-release-baseline-policy.mjs";

export const EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION =
  "agorbis-exceptional-release-request/v1";
export const EXCEPTIONAL_OPEN_UPDATE_REQUEST_SCHEMA_VERSION =
  "agorbis-exceptional-release-request/v2";
export const EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION =
  "agorbis-exceptional-release-act/v2";
export const EXCEPTIONAL_OPEN_UPDATE_ACT_SCHEMA_VERSION =
  "agorbis-exceptional-release-act/v3";
export const EXCEPTIONAL_RELEASE_ACT_VALIDITY_MS = 60 * 60 * 1_000;
export const TTY_CONFIRMATION_SOURCE = "/dev/tty";

const REQUEST_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const REQUEST_MAX_FUTURE_MS = 5 * 60 * 1_000;
const MAX_REQUEST_BYTES = 256 * 1_024;
const MAX_ACT_BYTES = 512 * 1_024;
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const REQUEST_KEYS = Object.freeze([
  "deploymentAuthorized",
  "head",
  "owner",
  "policyHash",
  "policyVersion",
  "risks",
  "schemaVersion",
  "timestampUtc",
]);
const OPEN_UPDATE_REQUEST_KEYS = Object.freeze(
  [
    ...REQUEST_KEYS,
    "releaseMode",
    "openSourceBaseline",
    "openSourceBaselineSha256",
  ].sort(),
);
const REQUEST_RISK_KEYS = Object.freeze([
  "acceptedConsequence",
  "evidenceStatus",
  "gateId",
  "rawResult",
  "requestedDisposition",
  "reviewRequiredBy",
]);
const TTY_CONFIRMATION_KEYS = Object.freeze(["gateId", "source", "statements"]);
const COMMAND_KEYS = Object.freeze(["exitCode", "label"]);
const ACT_KEYS = Object.freeze([
  "artifactHash",
  "commands",
  "contentSha256",
  "deploymentAuthorized",
  "deploymentExecuted",
  "expiresAtUtc",
  "gates",
  "head",
  "owner",
  "policyHash",
  "policyVersion",
  "productionMutationCommandsExecuted",
  "requestHash",
  "schemaVersion",
  "timestampUtc",
]);
const OPEN_UPDATE_ACT_KEYS = Object.freeze(
  [
    ...ACT_KEYS,
    "releaseMode",
    "openSourceBaselineSha256",
    "openUpdateEvidenceHash",
  ].sort(),
);
const ACT_GATE_KEYS = Object.freeze([
  "acceptedConsequence",
  "confirmation",
  "evidenceStatus",
  "facts",
  "gateId",
  "gatePolicy",
  "rawResult",
  "releaseDisposition",
  "reviewRequiredBy",
  "severity",
]);

const ACCEPTED_GATE_FACTS = Object.freeze({
  "legal.aaip-registration-pending": Object.freeze({
    AAIP_DATABASE_REGISTRATION_STATUS: "pending",
    PUBLIC_AAIP_DATABASE_REGISTRATION_ID: null,
  }),
  "recovery.production-backup-not-verified": Object.freeze({
    GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
    PRODUCTION_BACKUP_STATUS: "not_verified",
    RISK_ACCEPTED_BY_OWNER: true,
  }),
  "legal.sensitive-consent-0059-omitted": Object.freeze({
    SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
    affectedSurfaces: SENSITIVE_CONSENT_0059_AFFECTED_SURFACES,
    legalConformityClaimAllowed: false,
  }),
});

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
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

function sameKeys(value, expected) {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected)
  );
}

function sha256(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function hasKnownSecret(source) {
  return typeof source === "string" && findKnownSecrets(source).length > 0;
}

function hasUnsafeText(source) {
  return typeof source !== "string" || CONTROL_OR_BIDI_PATTERN.test(source);
}

function normalizedNow(now) {
  const value = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  return Number.isFinite(value.getTime()) ? value : null;
}

function isCanonicalUtcTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function expectedActExpirationUtc(timestampUtc) {
  if (!isCanonicalUtcTimestamp(timestampUtc)) return null;
  const expiration = new Date(
    new Date(timestampUtc).getTime() + EXCEPTIONAL_RELEASE_ACT_VALIDITY_MS,
  );
  return Number.isFinite(expiration.getTime())
    ? expiration.toISOString()
    : null;
}

function isPathInsideOrEqual(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export function canonicalJson(value) {
  const serialized = JSON.stringify(canonicalize(value));
  if (typeof serialized !== "string") {
    throw new Error("El valor no puede representarse como JSON canónico.");
  }
  return `${serialized}\n`;
}

export function exceptionalReleaseRequestHash(request) {
  return sha256(canonicalJson(request));
}

export function exceptionalReleaseActContentHash(actOrPayload) {
  if (!isPlainObject(actOrPayload)) {
    throw new Error("El contenido del acta debe ser un objeto.");
  }
  const { contentSha256: _contentSha256, ...payload } = actOrPayload;
  return sha256(canonicalJson(payload));
}

export function validateExceptionalReleaseRequest(
  request,
  { currentHead, now = new Date() } = {},
) {
  const errors = [];
  if (!isPlainObject(request)) return ["El request debe ser un objeto JSON."];
  const openUpdate =
    request.schemaVersion === EXCEPTIONAL_OPEN_UPDATE_REQUEST_SCHEMA_VERSION;
  if (
    !sameKeys(request, openUpdate ? OPEN_UPDATE_REQUEST_KEYS : REQUEST_KEYS)
  ) {
    errors.push(
      "El request debe contener exactamente schemaVersion, policyVersion, policyHash, head, owner, timestampUtc, deploymentAuthorized y risks.",
    );
  }
  if (
    !openUpdate &&
    request.schemaVersion !== EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION
  ) {
    errors.push("El request tiene schemaVersion desconocido.");
  }
  if (request.policyVersion !== RELEASE_GATE_POLICY_VERSION) {
    errors.push("El request usa una policyVersion stale o desconocida.");
  }
  if (request.policyHash !== RELEASE_GATE_POLICY_SHA256) {
    errors.push("El request usa un policyHash stale o desconocido.");
  }
  if (request.deploymentAuthorized !== false) {
    errors.push("deploymentAuthorized debe ser false.");
  }
  if (typeof currentHead !== "string" || !FULL_HEAD_PATTERN.test(currentHead)) {
    errors.push("currentHead debe ser el HEAD completo actual en minúsculas.");
  }
  if (
    typeof request.head !== "string" ||
    !FULL_HEAD_PATTERN.test(request.head)
  ) {
    errors.push(
      "head debe contener exactamente 40 hexadecimales en minúsculas.",
    );
  } else if (
    typeof currentHead === "string" &&
    FULL_HEAD_PATTERN.test(currentHead) &&
    request.head !== currentHead
  ) {
    errors.push(
      "El request corresponde a un HEAD stale o distinto del actual.",
    );
  }
  if (request.owner !== AUTHORIZED_RISK_OWNER) {
    errors.push(
      `owner debe ser exactamente el responsable autorizado por ${RELEASE_GATE_POLICY_VERSION}.`,
    );
  }

  const currentTime = normalizedNow(now);
  if (!currentTime) {
    errors.push("now debe ser una fecha válida.");
  }
  if (openUpdate) {
    if (request.releaseMode !== "OPEN_UPDATE") {
      errors.push("El request v2 requiere el modo explícito OPEN_UPDATE.");
    }
    try {
      if (!currentTime) throw new Error("now inválido");
      assertOpenReleaseBaselineRecord({
        baseline: request.openSourceBaseline,
        expectedBaselineSha256: request.openSourceBaselineSha256,
        nowUtc: currentTime.toISOString(),
      });
      if (
        Date.parse(request.timestampUtc) <
        Date.parse(request.openSourceBaseline.observedAtUtc)
      ) {
        throw new Error(
          "El request es anterior a la observación de su origen.",
        );
      }
      if (hasKnownSecret(canonicalJson(request.openSourceBaseline))) {
        throw new Error("El baseline contiene una credencial reconocible.");
      }
    } catch (error) {
      errors.push(
        `Origen OPEN del request inválido: ${error instanceof Error ? error.message : "registro no verificable"}`,
      );
    }
  }
  if (!isCanonicalUtcTimestamp(request.timestampUtc)) {
    errors.push(
      "timestampUtc debe ser UTC canónico con formato ISO y milisegundos.",
    );
  } else if (currentTime) {
    const requestedTime = new Date(request.timestampUtc).getTime();
    const delta = currentTime.getTime() - requestedTime;
    if (delta > REQUEST_MAX_AGE_MS) {
      errors.push("El request tiene más de 24 horas y está stale.");
    }
    if (delta < -REQUEST_MAX_FUTURE_MS) {
      errors.push("El request está fechado más de 5 minutos en el futuro.");
    }
  }

  if (!Array.isArray(request.risks)) {
    errors.push("risks debe ser un array.");
    return errors;
  }
  const gateIds = [];
  for (const [index, risk] of request.risks.entries()) {
    const label = `risks[${index}]`;
    if (!isPlainObject(risk)) {
      errors.push(`${label} debe ser un objeto.`);
      continue;
    }
    if (!sameKeys(risk, REQUEST_RISK_KEYS)) {
      errors.push(`${label} contiene claves desconocidas o incompletas.`);
    }
    if (
      typeof risk.gateId !== "string" ||
      !GATE_ID_PATTERN.test(risk.gateId) ||
      ["all", "global", "todos", "todas"].includes(
        String(risk.gateId).toLowerCase(),
      ) ||
      /[*?{}[\]]/.test(String(risk.gateId))
    ) {
      errors.push(`${label}.gateId no puede ser global ni usar wildcards.`);
      continue;
    }
    gateIds.push(risk.gateId);
    const definition = getReleaseGateDefinition(risk.gateId);
    if (!definition) {
      errors.push(`${label} referencia un gate desconocido: ${risk.gateId}.`);
      continue;
    }
    if (
      definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE ||
      definition.waiverPolicy === WAIVER_POLICY.NEVER
    ) {
      errors.push(`${risk.gateId} es NON_WAIVABLE_SECURITY_GATE.`);
    }
    if (
      risk.evidenceStatus === EVIDENCE_STATUS.PASS ||
      risk.rawResult === RAW_RESULT.PASS
    ) {
      errors.push(
        `${risk.gateId} está en PASS y no admite aceptación de riesgo.`,
      );
    }
    if (risk.evidenceStatus !== definition.evidenceStatus) {
      errors.push(`${risk.gateId} no conserva evidenceStatus original exacto.`);
    }
    if (risk.rawResult !== definition.rawResult) {
      errors.push(`${risk.gateId} no conserva rawResult original exacto.`);
    }
    if (
      risk.requestedDisposition !== RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER
    ) {
      errors.push(
        `${risk.gateId} debe solicitar requestedDisposition=RISK_ACCEPTED_BY_OWNER.`,
      );
    }
    if (risk.acceptedConsequence !== definition.consequence) {
      errors.push(`${risk.gateId} no acepta la consequence canónica exacta.`);
    }
    if (risk.reviewRequiredBy !== definition.reviewRequiredBy) {
      errors.push(`${risk.gateId} no conserva reviewRequiredBy canónico.`);
    }
    if (
      currentTime &&
      typeof definition.reviewRequiredBy === "string" &&
      currentTime.getTime() >
        new Date(`${definition.reviewRequiredBy}T23:59:59.999Z`).getTime()
    ) {
      errors.push(
        `${risk.gateId} superó su fecha de revisión y exige una política nueva.`,
      );
    }
  }
  if (gateIds.length !== new Set(gateIds).size) {
    errors.push("risks contiene gate IDs duplicados.");
  }
  const expectedOrder = OWNER_WAIVER_CANDIDATE_GATE_IDS.filter((gateId) =>
    gateIds.includes(gateId),
  );
  if (JSON.stringify(gateIds) !== JSON.stringify(expectedOrder)) {
    errors.push("risks debe conservar el orden canónico de la política.");
  }
  return [...new Set(errors)];
}

export function assertExceptionalReleaseRequest(request, options) {
  const errors = validateExceptionalReleaseRequest(request, options);
  if (errors.length > 0) {
    throw new Error(`Request excepcional inválido:\n${errors.join("\n")}`);
  }
}

export function renderExceptionalReleaseRequestJson(request, options) {
  assertExceptionalReleaseRequest(request, options);
  const rendered = canonicalJson(request);
  if (hasKnownSecret(rendered)) {
    throw new Error("El request contiene material con formato de secreto.");
  }
  return rendered;
}

export function parseExceptionalReleaseRequestJson(source, options) {
  if (
    typeof source !== "string" ||
    Buffer.byteLength(source) > MAX_REQUEST_BYTES
  ) {
    throw new Error("El request JSON no es texto válido o excede el límite.");
  }
  if (hasKnownSecret(source)) {
    throw new Error("El request contiene material con formato de secreto.");
  }
  let request;
  try {
    request = JSON.parse(source);
  } catch {
    throw new Error("El request no es JSON válido.");
  }
  assertExceptionalReleaseRequest(request, options);
  if (source !== canonicalJson(request)) {
    throw new Error("El request no usa el formato JSON canónico exacto.");
  }
  return deepFreeze(request);
}

export function validateExceptionalReleaseRequestPath({
  requestPath,
  worktreeRoot,
} = {}) {
  const errors = [];
  if (typeof requestPath !== "string" || !path.isAbsolute(requestPath)) {
    errors.push("requestPath debe ser una ruta absoluta.");
  }
  if (typeof worktreeRoot !== "string" || !path.isAbsolute(worktreeRoot)) {
    errors.push("worktreeRoot debe ser una ruta absoluta.");
  }
  if (errors.length > 0) return errors;
  if (CONTROL_OR_BIDI_PATTERN.test(requestPath)) {
    errors.push("requestPath contiene caracteres de control no permitidos.");
  }
  if (!requestPath.endsWith(".json")) {
    errors.push("requestPath debe terminar en .json.");
  }
  if (
    path.basename(requestPath).endsWith(".act.json") ||
    path.basename(requestPath).length <= ".json".length
  ) {
    errors.push("requestPath usa un nombre reservado o vacío.");
  }
  if (
    isPathInsideOrEqual(path.resolve(requestPath), path.resolve(worktreeRoot))
  ) {
    errors.push("requestPath debe estar fuera del worktree.");
  }
  return errors;
}

export function readExceptionalReleaseRequestFile({
  requestPath,
  worktreeRoot,
  currentHead,
  now = new Date(),
} = {}) {
  const pathErrors = validateExceptionalReleaseRequestPath({
    requestPath,
    worktreeRoot,
  });
  if (pathErrors.length > 0) {
    throw new Error(`Ruta de request inválida:\n${pathErrors.join("\n")}`);
  }
  const requestStats = lstatSync(requestPath);
  if (!requestStats.isFile() || requestStats.isSymbolicLink()) {
    throw new Error("requestPath debe ser un archivo regular, no un symlink.");
  }
  if (requestStats.size > MAX_REQUEST_BYTES) {
    throw new Error("El request JSON excede el límite permitido.");
  }
  const realRequestPath = realpathSync(requestPath);
  const realWorktreeRoot = realpathSync(worktreeRoot);
  if (isPathInsideOrEqual(realRequestPath, realWorktreeRoot)) {
    throw new Error("El request real debe estar fuera del worktree.");
  }
  return parseExceptionalReleaseRequestJson(readFileSync(requestPath, "utf8"), {
    currentHead,
    now,
  });
}

export function validateTtyRiskConfirmations({ request, confirmations } = {}) {
  const errors = [];
  if (!isPlainObject(request) || !Array.isArray(request.risks)) {
    return ["El request validado es obligatorio para confirmar riesgos."];
  }
  if (!Array.isArray(confirmations)) {
    return ["Las confirmaciones /dev/tty deben ser un array."];
  }
  const requestedIds = request.risks.map(({ gateId }) => gateId);
  const confirmationIds = [];
  for (const [index, confirmation] of confirmations.entries()) {
    if (!isPlainObject(confirmation)) {
      errors.push(`Confirmación ${index} inválida.`);
      continue;
    }
    if (!sameKeys(confirmation, TTY_CONFIRMATION_KEYS)) {
      errors.push(`Confirmación ${index} contiene claves no permitidas.`);
    }
    if (typeof confirmation.gateId !== "string") {
      errors.push(`Confirmación ${index} carece de gateId.`);
      continue;
    }
    confirmationIds.push(confirmation.gateId);
    if (!requestedIds.includes(confirmation.gateId)) {
      errors.push(
        `Confirmación para gate no solicitado: ${confirmation.gateId}.`,
      );
    }
    if (confirmation.source !== TTY_CONFIRMATION_SOURCE) {
      errors.push(
        `${confirmation.gateId} sólo admite confirmación obtenida de /dev/tty.`,
      );
    }
    errors.push(
      ...validateRiskConfirmations({
        gateId: confirmation.gateId,
        fullHead: request.head,
        confirmations: confirmation.statements,
      }),
    );
  }
  if (confirmationIds.length !== new Set(confirmationIds).size) {
    errors.push("Las confirmaciones contienen gate IDs duplicados.");
  }
  if (
    confirmationIds.length !== requestedIds.length ||
    requestedIds.some((gateId) => !confirmationIds.includes(gateId))
  ) {
    errors.push("Falta una confirmación /dev/tty por cada riesgo solicitado.");
  }
  if (JSON.stringify(confirmationIds) !== JSON.stringify(requestedIds)) {
    errors.push(
      "Las confirmaciones deben conservar el orden canónico del request.",
    );
  }
  return [...new Set(errors)];
}

function validateCommandRecords(commands, openUpdate = false) {
  const stepIds = openUpdate
    ? EXCEPTIONAL_OPEN_UPDATE_STEP_IDS
    : EXCEPTIONAL_RELEASE_STEP_IDS;
  const errors = [];
  if (!Array.isArray(commands)) return ["commands debe ser un array."];
  for (const [index, command] of commands.entries()) {
    if (!isPlainObject(command) || !sameKeys(command, COMMAND_KEYS)) {
      errors.push(
        `commands[${index}] debe contener únicamente label y exitCode.`,
      );
      continue;
    }
    if (
      typeof command.label !== "string" ||
      command.label !== command.label.trim() ||
      command.label.length < 2 ||
      command.label.length > 160 ||
      hasUnsafeText(command.label) ||
      hasKnownSecret(command.label)
    ) {
      errors.push(`commands[${index}].label no es seguro.`);
    }
    if (
      !Number.isSafeInteger(command.exitCode) ||
      command.exitCode < 0 ||
      command.exitCode > 255
    ) {
      errors.push(`commands[${index}].exitCode no es válido.`);
    } else if (command.exitCode !== 0) {
      errors.push(
        `commands[${index}].exitCode debe ser 0 para integrar un acta válida.`,
      );
    }
  }
  const actualLabels = commands.map((command) =>
    isPlainObject(command) ? command.label : null,
  );
  if (JSON.stringify(actualLabels) !== JSON.stringify(stepIds)) {
    errors.push(
      `commands debe contener exactamente los ${stepIds.length} pasos canónicos y en orden.`,
    );
  }
  return errors;
}

function validateCompleteGateResults(gateResults) {
  const errors = [];
  if (!Array.isArray(gateResults)) return ["gateResults debe ser un array."];
  const expectedIds = RELEASE_GATE_POLICY.gates.map(({ id }) => id);
  const actualIds = [];
  for (const [index, result] of gateResults.entries()) {
    if (!isPlainObject(result)) {
      errors.push(`gateResults[${index}] debe ser un objeto.`);
      continue;
    }
    const keys = Object.keys(result).sort();
    if (
      JSON.stringify(keys) !==
      JSON.stringify(["evidenceStatus", "gateId", "rawResult"])
    ) {
      errors.push(
        `gateResults[${index}] debe contener sólo gateId, evidenceStatus y rawResult.`,
      );
    }
    if (typeof result.gateId !== "string") {
      errors.push(`gateResults[${index}] carece de gateId.`);
      continue;
    }
    actualIds.push(result.gateId);
    if (!getReleaseGateDefinition(result.gateId)) {
      errors.push(`gateResults contiene gate desconocido: ${result.gateId}.`);
    }
    if (!Object.values(EVIDENCE_STATUS).includes(result.evidenceStatus)) {
      errors.push(`${result.gateId} tiene evidenceStatus inválido.`);
    }
    if (!Object.values(RAW_RESULT).includes(result.rawResult)) {
      errors.push(`${result.gateId} tiene rawResult inválido.`);
    }
    const expectedRaw =
      result.evidenceStatus === EVIDENCE_STATUS.PASS
        ? RAW_RESULT.PASS
        : RAW_RESULT.FAIL;
    if (result.rawResult !== expectedRaw) {
      errors.push(`${result.gateId} contradice evidenceStatus y rawResult.`);
    }
  }
  if (actualIds.length !== new Set(actualIds).size) {
    errors.push("gateResults contiene gate IDs duplicados.");
  }
  if (
    actualIds.length !== expectedIds.length ||
    expectedIds.some((gateId) => !actualIds.includes(gateId))
  ) {
    errors.push(
      "gateResults debe enumerar exactamente todos los gates de la política.",
    );
  } else if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    errors.push("gateResults debe conservar el orden canónico de la política.");
  }
  return [...new Set(errors)];
}

export function createExceptionalReleaseAct({
  request,
  currentHead,
  artifactHash,
  openUpdateEvidenceHash,
  gateResults,
  confirmations,
  commands = [],
  now = new Date(),
} = {}) {
  assertExceptionalReleaseRequest(request, { currentHead, now });
  const confirmationErrors = validateTtyRiskConfirmations({
    request,
    confirmations,
  });
  const gateResultErrors = validateCompleteGateResults(gateResults);
  const openUpdate =
    request.schemaVersion === EXCEPTIONAL_OPEN_UPDATE_REQUEST_SCHEMA_VERSION;
  const commandErrors = validateCommandRecords(commands, openUpdate);
  if (
    openUpdate
      ? !SHA256_PATTERN.test(openUpdateEvidenceHash ?? "")
      : openUpdateEvidenceHash !== undefined
  )
    commandErrors.push(
      "El acta OPEN requiere un certificado final D72 fijado por hash; un acta legacy no lo admite.",
    );
  const artifactErrors = SHA256_PATTERN.test(artifactHash ?? "")
    ? []
    : ["artifactHash debe ser un SHA-256 completo en minúsculas."];
  const errors = [
    ...confirmationErrors,
    ...gateResultErrors,
    ...commandErrors,
    ...artifactErrors,
  ];
  if (errors.length > 0) {
    throw new Error(
      `No se puede crear el acta excepcional:\n${errors.join("\n")}`,
    );
  }

  const requestRiskById = new Map(
    request.risks.map((risk) => [risk.gateId, risk]),
  );
  for (const risk of request.risks) {
    const result = gateResults.find(({ gateId }) => gateId === risk.gateId);
    if (
      result.evidenceStatus !== risk.evidenceStatus ||
      result.rawResult !== risk.rawResult
    ) {
      errors.push(
        `${risk.gateId} no coincide con evidenceStatus/rawResult del request.`,
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `No se puede crear el acta excepcional:\n${errors.join("\n")}`,
    );
  }

  const confirmationById = new Map(
    confirmations.map((confirmation) => [confirmation.gateId, confirmation]),
  );
  const waiverRequests = request.risks.map((risk) => ({
    gateId: risk.gateId,
    owner: request.owner,
    rationale: risk.acceptedConsequence,
    riskAcceptedByOwner: true,
  }));
  const dispositions = applyReleaseGateWaivers({
    gateResults,
    waiverRequests,
  });
  const dispositionById = new Map(
    dispositions.map((result) => [result.gateId, result]),
  );
  const actGates = RELEASE_GATE_POLICY.gates.map((definition) => {
    const result = dispositionById.get(definition.id);
    const risk = requestRiskById.get(definition.id);
    const ttyConfirmation = confirmationById.get(definition.id);
    return Object.freeze({
      gateId: definition.id,
      evidenceStatus: result.evidenceStatus,
      rawResult: result.rawResult,
      gatePolicy: definition.gatePolicy,
      releaseDisposition: result.releaseDisposition,
      severity: definition.severity,
      acceptedConsequence: risk?.acceptedConsequence ?? null,
      facts: risk ? (ACCEPTED_GATE_FACTS[definition.id] ?? null) : null,
      confirmation: ttyConfirmation
        ? Object.freeze({
            source: TTY_CONFIRMATION_SOURCE,
            statements: Object.freeze([...ttyConfirmation.statements]),
          })
        : null,
      reviewRequiredBy: risk?.reviewRequiredBy ?? null,
    });
  });
  const actTime = normalizedNow(now);
  const payload = {
    schemaVersion: openUpdate
      ? EXCEPTIONAL_OPEN_UPDATE_ACT_SCHEMA_VERSION
      : EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION,
    ...(openUpdate
      ? {
          releaseMode: "OPEN_UPDATE",
          openSourceBaselineSha256: request.openSourceBaselineSha256,
          openUpdateEvidenceHash,
        }
      : {}),
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head: request.head,
    owner: request.owner,
    timestampUtc: actTime.toISOString(),
    expiresAtUtc: new Date(
      actTime.getTime() + EXCEPTIONAL_RELEASE_ACT_VALIDITY_MS,
    ).toISOString(),
    requestHash: exceptionalReleaseRequestHash(request),
    artifactHash,
    gates: actGates,
    commands: commands.map((command) =>
      Object.freeze({ label: command.label, exitCode: command.exitCode }),
    ),
    deploymentAuthorized: false,
    deploymentExecuted: false,
    productionMutationCommandsExecuted: false,
  };
  const act = {
    ...payload,
    contentSha256: exceptionalReleaseActContentHash(payload),
  };
  const validationErrors = validateExceptionalReleaseAct(act);
  if (validationErrors.length > 0) {
    throw new Error(
      `Acta excepcional inválida:\n${validationErrors.join("\n")}`,
    );
  }
  return deepFreeze(act);
}

export function validateExceptionalActSource({
  request,
  act,
  artifactManifest,
}) {
  const openUpdate =
    request?.schemaVersion === EXCEPTIONAL_OPEN_UPDATE_REQUEST_SCHEMA_VERSION;
  if (openUpdate) {
    if (
      request.releaseMode !== "OPEN_UPDATE" ||
      act?.schemaVersion !== EXCEPTIONAL_OPEN_UPDATE_ACT_SCHEMA_VERSION ||
      act.releaseMode !== "OPEN_UPDATE" ||
      act.openSourceBaselineSha256 !== request.openSourceBaselineSha256 ||
      artifactManifest?.releaseMode !== "OPEN_UPDATE" ||
      artifactManifest.artifactPurpose !== "primary" ||
      artifactManifest.openSourceBaselineSha256 !==
        request.openSourceBaselineSha256 ||
      canonicalJson(artifactManifest.openSourceBaseline) !==
        canonicalJson(request.openSourceBaseline)
    )
      return [
        "Request, acta y artifact OPEN no corresponden al mismo perfil y baseline.",
      ];
  } else if (
    act?.schemaVersion !== EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION ||
    artifactManifest?.releaseMode !== undefined
  ) {
    return [
      "Un request legacy no puede emitir ni consumir un acta o artifact OPEN_UPDATE.",
    ];
  }
  return [];
}

export function validateExceptionalReleaseAct(act) {
  const errors = [];
  if (!isPlainObject(act)) return ["El acta debe ser un objeto."];
  const openUpdate =
    act.schemaVersion === EXCEPTIONAL_OPEN_UPDATE_ACT_SCHEMA_VERSION;
  if (!sameKeys(act, openUpdate ? OPEN_UPDATE_ACT_KEYS : ACT_KEYS)) {
    errors.push("El acta contiene claves desconocidas o incompletas.");
  }
  if (
    !openUpdate &&
    act.schemaVersion !== EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION
  ) {
    errors.push("El acta tiene schemaVersion desconocido.");
  }
  if (
    act.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    act.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    errors.push("El acta usa una política stale o desconocida.");
  }
  if (!FULL_HEAD_PATTERN.test(act.head ?? "")) {
    errors.push("El acta no contiene un HEAD completo válido.");
  }
  if (act.owner !== AUTHORIZED_RISK_OWNER) {
    errors.push(
      "El acta no contiene el responsable autorizado por la política.",
    );
  }
  if (!isCanonicalUtcTimestamp(act.timestampUtc)) {
    errors.push("El acta no contiene timestampUtc canónico.");
  }
  if (!isCanonicalUtcTimestamp(act.expiresAtUtc)) {
    errors.push("El acta no contiene expiresAtUtc canónico.");
  } else if (expectedActExpirationUtc(act.timestampUtc) !== act.expiresAtUtc) {
    errors.push(
      "expiresAtUtc debe ser exactamente 60 minutos posterior a timestampUtc.",
    );
  }
  if (!SHA256_PATTERN.test(act.requestHash ?? "")) {
    errors.push("El acta no contiene requestHash válido.");
  }
  if (!SHA256_PATTERN.test(act.artifactHash ?? "")) {
    errors.push("El acta no contiene artifactHash válido.");
  }
  if (
    act.deploymentAuthorized !== false ||
    act.deploymentExecuted !== false ||
    act.productionMutationCommandsExecuted !== false
  ) {
    errors.push(
      "El acta debe conservar todos los indicadores de deployment en false.",
    );
  }
  if (
    openUpdate &&
    (act.releaseMode !== "OPEN_UPDATE" ||
      !SHA256_PATTERN.test(act.openSourceBaselineSha256 ?? "") ||
      !SHA256_PATTERN.test(act.openUpdateEvidenceHash ?? ""))
  )
    errors.push("El acta OPEN no fija correctamente su perfil y baseline.");
  errors.push(...validateCommandRecords(act.commands, openUpdate));

  if (!Array.isArray(act.gates)) {
    errors.push("El acta no contiene gates.");
  } else {
    const expectedIds = RELEASE_GATE_POLICY.gates.map(({ id }) => id);
    const actualIds = [];
    for (const [index, gate] of act.gates.entries()) {
      if (!isPlainObject(gate) || !sameKeys(gate, ACT_GATE_KEYS)) {
        errors.push(`gates[${index}] contiene claves inválidas.`);
        continue;
      }
      actualIds.push(gate.gateId);
      const definition = getReleaseGateDefinition(gate.gateId);
      if (!definition) {
        errors.push(`El acta contiene gate desconocido: ${gate.gateId}.`);
        continue;
      }
      if (gate.gatePolicy !== definition.gatePolicy) {
        errors.push(`${gate.gateId} altera gatePolicy.`);
      }
      if (gate.severity !== definition.severity) {
        errors.push(`${gate.gateId} altera severity.`);
      }
      const expectedFacts =
        gate.releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER
          ? (ACCEPTED_GATE_FACTS[gate.gateId] ?? null)
          : null;
      if (
        JSON.stringify(canonicalize(gate.facts)) !==
        JSON.stringify(canonicalize(expectedFacts))
      ) {
        errors.push(`${gate.gateId} altera facts canónicos.`);
      }
      const expectedRaw =
        gate.evidenceStatus === EVIDENCE_STATUS.PASS
          ? RAW_RESULT.PASS
          : RAW_RESULT.FAIL;
      if (
        !Object.values(EVIDENCE_STATUS).includes(gate.evidenceStatus) ||
        gate.rawResult !== expectedRaw
      ) {
        errors.push(`${gate.gateId} altera evidenceStatus/rawResult.`);
      }
      if (gate.rawResult === RAW_RESULT.PASS) {
        if (
          gate.releaseDisposition !== RELEASE_DISPOSITION.PASS ||
          gate.acceptedConsequence !== null ||
          gate.confirmation !== null ||
          gate.reviewRequiredBy !== null
        ) {
          errors.push(`${gate.gateId} PASS no puede contener una aceptación.`);
        }
      } else if (
        gate.releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER
      ) {
        if (
          definition.waiverPolicy !== WAIVER_POLICY.OWNER_EXPLICIT ||
          gate.acceptedConsequence !== definition.consequence ||
          gate.reviewRequiredBy !== definition.reviewRequiredBy ||
          !isPlainObject(gate.confirmation) ||
          !sameKeys(gate.confirmation, ["source", "statements"]) ||
          gate.confirmation?.source !== TTY_CONFIRMATION_SOURCE
        ) {
          errors.push(`${gate.gateId} contiene una aceptación inválida.`);
        } else {
          errors.push(
            ...validateRiskConfirmations({
              gateId: gate.gateId,
              fullHead: act.head,
              confirmations: gate.confirmation.statements,
            }),
          );
        }
      } else if (
        gate.releaseDisposition !== RELEASE_DISPOSITION.STOP ||
        gate.acceptedConsequence !== null ||
        gate.confirmation !== null ||
        gate.reviewRequiredBy !== null
      ) {
        errors.push(`${gate.gateId} FAIL sin aceptación debe permanecer STOP.`);
      }
      if (
        definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE &&
        gate.releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER
      ) {
        errors.push(`${gate.gateId} non-waivable no admite aceptación.`);
      }
    }
    const gateById = new Map(
      act.gates
        .filter(
          (gate) => isPlainObject(gate) && typeof gate.gateId === "string",
        )
        .map((gate) => [gate.gateId, gate]),
    );
    for (const gateId of NON_WAIVABLE_SECURITY_GATE_IDS) {
      const gate = gateById.get(gateId);
      if (
        !gate ||
        gate.evidenceStatus !== EVIDENCE_STATUS.PASS ||
        gate.rawResult !== RAW_RESULT.PASS ||
        gate.releaseDisposition !== RELEASE_DISPOSITION.PASS
      ) {
        errors.push(
          `${gateId} NON_WAIVABLE_SECURITY_GATE debe constar como PASS técnico sin waiver.`,
        );
      }
    }
    if (
      act.gates.some(
        (gate) =>
          isPlainObject(gate) &&
          gate.releaseDisposition === RELEASE_DISPOSITION.STOP,
      )
    ) {
      errors.push("Un acta válida no puede contener disposition STOP.");
    }
    if (actualIds.length !== new Set(actualIds).size) {
      errors.push("El acta contiene gate IDs duplicados.");
    }
    if (
      actualIds.length !== expectedIds.length ||
      expectedIds.some((gateId) => !actualIds.includes(gateId))
    ) {
      errors.push("El acta debe enumerar exactamente todos los gates.");
    } else if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      errors.push("El acta debe conservar el orden canónico de la política.");
    }
  }

  if (!SHA256_PATTERN.test(act.contentSha256 ?? "")) {
    errors.push("El acta no contiene contentSha256 válido.");
  } else {
    if (exceptionalReleaseActContentHash(act) !== act.contentSha256) {
      errors.push(
        "contentSha256 no coincide con el contenido canónico del acta.",
      );
    }
  }
  return [...new Set(errors)];
}

export function assertExceptionalReleaseAct(act) {
  const errors = validateExceptionalReleaseAct(act);
  if (errors.length > 0) {
    throw new Error(`Acta excepcional inválida:\n${errors.join("\n")}`);
  }
}

export function renderExceptionalReleaseActJson(act) {
  assertExceptionalReleaseAct(act);
  const rendered = canonicalJson(act);
  if (hasKnownSecret(rendered)) {
    throw new Error("El acta contiene material con formato de secreto.");
  }
  return rendered;
}

export function parseExceptionalReleaseActJson(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAX_ACT_BYTES) {
    throw new Error("El acta JSON no es texto válido o excede el límite.");
  }
  if (hasKnownSecret(source)) {
    throw new Error("El acta contiene material con formato de secreto.");
  }
  let act;
  try {
    act = JSON.parse(source);
  } catch {
    throw new Error("El acta no es JSON válido.");
  }
  assertExceptionalReleaseAct(act);
  if (source !== canonicalJson(act)) {
    throw new Error("El acta no usa el formato JSON canónico exacto.");
  }
  return deepFreeze(act);
}

function assertRestrictedActFileMetadata(metadata, label) {
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} debe ser un archivo regular, no un symlink.`);
  }
  if ((metadata.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} debe tener modo 0600 exacto.`);
  }
  if (typeof process.getuid !== "function") {
    throw new Error(`${label} no puede verificar el owner actual.`);
  }
  if (metadata.uid !== process.getuid()) {
    throw new Error(`${label} debe pertenecer al usuario actual.`);
  }
  if (metadata.nlink !== 1) {
    throw new Error(`${label} no puede tener hard links.`);
  }
  if (metadata.size < 1 || metadata.size > MAX_ACT_BYTES) {
    throw new Error(`${label} está vacío o excede el tamaño máximo.`);
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export function readExceptionalReleaseActFile({
  actPath,
  worktreeRoot,
  currentHead,
  now = new Date(),
} = {}) {
  if (typeof actPath !== "string" || !path.isAbsolute(actPath)) {
    throw new Error("actPath debe ser una ruta absoluta.");
  }
  if (typeof worktreeRoot !== "string" || !path.isAbsolute(worktreeRoot)) {
    throw new Error("worktreeRoot debe ser una ruta absoluta.");
  }
  if (
    CONTROL_OR_BIDI_PATTERN.test(actPath) ||
    CONTROL_OR_BIDI_PATTERN.test(worktreeRoot)
  ) {
    throw new Error("Las rutas del acta contienen caracteres no permitidos.");
  }
  if (
    !actPath.endsWith(".act.json") ||
    path.basename(actPath).length <= ".act.json".length
  ) {
    throw new Error("actPath debe terminar en .act.json y tener nombre.");
  }
  if (typeof currentHead !== "string" || !FULL_HEAD_PATTERN.test(currentHead)) {
    throw new Error("currentHead debe ser el HEAD completo actual.");
  }
  const currentTime = normalizedNow(now);
  if (!currentTime) throw new Error("now debe ser una fecha válida.");

  const resolvedActPath = path.resolve(actPath);
  const resolvedWorktreeRoot = path.resolve(worktreeRoot);
  if (isPathInsideOrEqual(resolvedActPath, resolvedWorktreeRoot)) {
    throw new Error("El acta debe quedar fuera del worktree.");
  }
  const realWorktreeRoot = realpathSync(worktreeRoot);
  const initialMetadata = lstatSync(actPath);
  assertRestrictedActFileMetadata(initialMetadata, "El acta");
  const initialRealPath = realpathSync(actPath);
  if (isPathInsideOrEqual(initialRealPath, realWorktreeRoot)) {
    throw new Error("El acta real debe quedar fuera del worktree.");
  }

  const descriptor = openSync(
    actPath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  let source;
  let openedMetadata;
  let finalDescriptorMetadata;
  try {
    openedMetadata = fstatSync(descriptor);
    assertRestrictedActFileMetadata(openedMetadata, "El acta abierta");
    if (!sameFileIdentity(initialMetadata, openedMetadata)) {
      throw new Error("El acta cambió antes de abrirse.");
    }
    source = readFileSync(descriptor, "utf8");
    finalDescriptorMetadata = fstatSync(descriptor);
    if (
      !sameFileIdentity(openedMetadata, finalDescriptorMetadata) ||
      openedMetadata.size !== finalDescriptorMetadata.size ||
      openedMetadata.mtimeMs !== finalDescriptorMetadata.mtimeMs ||
      openedMetadata.ctimeMs !== finalDescriptorMetadata.ctimeMs
    ) {
      throw new Error("El acta cambió mientras se leía.");
    }
  } finally {
    closeSync(descriptor);
  }

  const finalPathMetadata = lstatSync(actPath);
  assertRestrictedActFileMetadata(finalPathMetadata, "El acta final");
  if (
    !sameFileIdentity(finalDescriptorMetadata, finalPathMetadata) ||
    realpathSync(actPath) !== initialRealPath ||
    Buffer.byteLength(source) !== finalPathMetadata.size
  ) {
    throw new Error("El acta cambió durante la lectura.");
  }

  const act = parseExceptionalReleaseActJson(source);
  if (act.head !== currentHead) {
    throw new Error("El acta corresponde a un HEAD distinto del actual.");
  }
  const createdAt = new Date(act.timestampUtc).getTime();
  if (currentTime.getTime() < createdAt - REQUEST_MAX_FUTURE_MS) {
    throw new Error("El acta está fechada más de 5 minutos en el futuro.");
  }
  if (currentTime.getTime() >= new Date(act.expiresAtUtc).getTime()) {
    throw new Error("El acta excepcional está vencida.");
  }
  return act;
}

function markdownInline(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replace(/([`*_{}\[\]()#+.!|<>-])/g, "\\$1");
}

export function renderExceptionalReleaseActMarkdown(act) {
  assertExceptionalReleaseAct(act);
  const acceptedCount = act.gates.filter(
    ({ releaseDisposition }) =>
      releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
  ).length;
  const lines = [
    "# Acta de release excepcional de Agorbis",
    "",
    "> NO DEPLOY · deploymentAuthorized=false · deploymentExecuted=false · productionMutationCommandsExecuted=false",
    ...(acceptedCount > 0 ? ["> ESTO NO ES PASS"] : []),
    "",
    `- Policy: ${markdownInline(act.policyVersion)}`,
    `- Policy hash: ${markdownInline(act.policyHash)}`,
    `- HEAD: ${markdownInline(act.head)}`,
    `- Owner: ${markdownInline(act.owner)}`,
    `- Timestamp UTC: ${markdownInline(act.timestampUtc)}`,
    `- Expires at UTC: ${markdownInline(act.expiresAtUtc)}`,
    `- Request hash: ${markdownInline(act.requestHash)}`,
    `- Artifact hash: ${markdownInline(act.artifactHash)}`,
    `- Content SHA-256: ${markdownInline(act.contentSha256)}`,
    "",
    "## Gates",
    "",
    "| Gate ID | Evidence | Raw | Policy | Disposition | Severity | Review |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...act.gates.map(
      (gate) =>
        `| ${markdownInline(gate.gateId)} | ${markdownInline(gate.evidenceStatus)} | ${markdownInline(gate.rawResult)} | ${markdownInline(gate.gatePolicy)} | ${markdownInline(gate.releaseDisposition)} | ${markdownInline(gate.severity)} | ${markdownInline(gate.reviewRequiredBy ?? "—")} |`,
    ),
  ];
  for (const gate of act.gates.filter(
    ({ releaseDisposition }) =>
      releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
  )) {
    lines.push(
      "",
      `### ${markdownInline(gate.gateId)}`,
      "",
      `- Consecuencia aceptada: ${markdownInline(gate.acceptedConsequence)}`,
      `- Confirmación vía: ${markdownInline(gate.confirmation.source)}`,
      ...gate.confirmation.statements.map(
        (statement) => `- Declaración: ${markdownInline(statement)}`,
      ),
      ...Object.entries(gate.facts ?? {}).map(
        ([name, value]) =>
          `- Hecho canónico: ${markdownInline(name)}=${markdownInline(JSON.stringify(value))}`,
      ),
    );
  }
  lines.push(
    "",
    "## Comandos evaluados",
    "",
    "| Label | Exit code |",
    "| --- | --- |",
    ...act.commands.map(
      (command) => `| ${markdownInline(command.label)} | ${command.exitCode} |`,
    ),
    "",
    "Esta acta registra evidencia y aceptación de riesgo; no autoriza un deployment ni acredita cumplimiento jurídico.",
    "",
  );
  const rendered = lines.join("\n");
  if (hasKnownSecret(rendered)) {
    throw new Error(
      "El Markdown del acta contiene material con formato de secreto.",
    );
  }
  return rendered;
}

export function deriveExceptionalReleaseActPaths(requestPath) {
  if (typeof requestPath !== "string" || !path.isAbsolute(requestPath)) {
    throw new Error("requestPath debe ser una ruta absoluta.");
  }
  if (!requestPath.endsWith(".json")) {
    throw new Error("requestPath debe terminar en .json.");
  }
  const stem = requestPath.slice(0, -".json".length);
  return Object.freeze({
    jsonPath: `${stem}.act.json`,
    markdownPath: `${stem}.act.md`,
  });
}

function closeQuietly(fileDescriptor) {
  if (fileDescriptor === null) return;
  try {
    closeSync(fileDescriptor);
  } catch {
    // El error original de escritura conserva prioridad.
  }
}

function unlinkQuietly(filePath) {
  try {
    unlinkSync(filePath);
  } catch {
    // Sólo limpia archivos nuevos creados por esta misma operación fallida.
  }
}

export function writeExceptionalReleaseActFiles({
  requestPath,
  worktreeRoot,
  act,
} = {}) {
  const pathErrors = validateExceptionalReleaseRequestPath({
    requestPath,
    worktreeRoot,
  });
  if (pathErrors.length > 0) {
    throw new Error(`Ruta de acta inválida:\n${pathErrors.join("\n")}`);
  }
  assertExceptionalReleaseAct(act);
  const requestStats = lstatSync(requestPath);
  if (!requestStats.isFile() || requestStats.isSymbolicLink()) {
    throw new Error("requestPath debe ser un archivo regular, no un symlink.");
  }
  const realRequestPath = realpathSync(requestPath);
  const realWorktreeRoot = realpathSync(worktreeRoot);
  const realParent = realpathSync(path.dirname(requestPath));
  if (
    isPathInsideOrEqual(realRequestPath, realWorktreeRoot) ||
    isPathInsideOrEqual(realParent, realWorktreeRoot)
  ) {
    throw new Error(
      "El request y las actas reales deben quedar fuera del worktree.",
    );
  }
  const requestSource = readFileSync(requestPath, "utf8");
  if (sha256(requestSource) !== act.requestHash) {
    throw new Error("El request cambió después de crear el acta.");
  }

  const { jsonPath, markdownPath } =
    deriveExceptionalReleaseActPaths(requestPath);
  const json = renderExceptionalReleaseActJson(act);
  const markdown = renderExceptionalReleaseActMarkdown(act);
  const openFlags =
    fsConstants.O_WRONLY |
    fsConstants.O_CREAT |
    fsConstants.O_EXCL |
    (fsConstants.O_NOFOLLOW ?? 0);
  let jsonDescriptor = null;
  let markdownDescriptor = null;
  let jsonCreated = false;
  let markdownCreated = false;
  try {
    jsonDescriptor = openSync(jsonPath, openFlags, 0o600);
    jsonCreated = true;
    markdownDescriptor = openSync(markdownPath, openFlags, 0o600);
    markdownCreated = true;
    fchmodSync(jsonDescriptor, 0o600);
    fchmodSync(markdownDescriptor, 0o600);
    writeFileSync(jsonDescriptor, json, "utf8");
    writeFileSync(markdownDescriptor, markdown, "utf8");
    fsyncSync(jsonDescriptor);
    fsyncSync(markdownDescriptor);
    closeSync(jsonDescriptor);
    jsonDescriptor = null;
    closeSync(markdownDescriptor);
    markdownDescriptor = null;
  } catch (error) {
    closeQuietly(jsonDescriptor);
    closeQuietly(markdownDescriptor);
    if (jsonCreated) unlinkQuietly(jsonPath);
    if (markdownCreated) unlinkQuietly(markdownPath);
    throw error;
  }
  if (
    (statSync(jsonPath).mode & 0o777) !== 0o600 ||
    (statSync(markdownPath).mode & 0o777) !== 0o600
  ) {
    throw new Error("Las actas no quedaron con modo 0600.");
  }
  return Object.freeze({
    jsonPath,
    markdownPath,
    contentSha256: act.contentSha256,
  });
}

export function ttyConfirmationTemplate(request) {
  if (!isPlainObject(request) || !Array.isArray(request.risks)) {
    throw new Error("El request validado es obligatorio.");
  }
  return Object.freeze(
    request.risks.map((risk) =>
      Object.freeze({
        gateId: risk.gateId,
        source: TTY_CONFIRMATION_SOURCE,
        statements: requiredRiskConfirmationPhrases(risk.gateId, request.head),
      }),
    ),
  );
}
