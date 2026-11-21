#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  baseline,
  expectedBaselineSha256,
  NOW,
} from "./cloudflare-open-source-smoke-test-fixture.mjs";
import {
  EXCEPTIONAL_OPEN_UPDATE_STEP_IDS,
  createExceptionalOpenReleaseDryRunPlan,
  validateExceptionalOpenReleaseDryRunPlan,
} from "./exceptional-open-release-runner-policy.mjs";
import { validateExceptionalActSource } from "./exceptional-release-act.mjs";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
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
import { EXCEPTIONAL_RELEASE_STEP_IDS } from "./exceptional-open-release-runner-policy.mjs";
import {
  EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION,
  EXCEPTIONAL_RELEASE_ACT_VALIDITY_MS,
  EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  TTY_CONFIRMATION_SOURCE,
  canonicalJson,
  createExceptionalReleaseAct as createExceptionalReleaseActV2,
  deriveExceptionalReleaseActPaths,
  exceptionalReleaseActContentHash,
  exceptionalReleaseRequestHash,
  parseExceptionalReleaseActJson,
  parseExceptionalReleaseRequestJson,
  readExceptionalReleaseActFile,
  readExceptionalReleaseRequestFile,
  renderExceptionalReleaseActJson,
  renderExceptionalReleaseActMarkdown,
  renderExceptionalReleaseRequestJson,
  ttyConfirmationTemplate,
  validateExceptionalReleaseAct,
  validateExceptionalReleaseRequest,
  validateExceptionalReleaseRequestPath,
  validateTtyRiskConfirmations,
  writeExceptionalReleaseActFiles,
} from "./exceptional-release-act.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-08-29T16:00:00.000Z");
const head = "0123456789abcdef0123456789abcdef01234567";
const artifactHash = "a".repeat(64);
const owner = "Sebastian Cardoso Castillo";

function riskFor(gateId) {
  const definition = getReleaseGateDefinition(gateId);
  assert.ok(definition, `Falta gate de fixture: ${gateId}`);
  return {
    gateId,
    evidenceStatus: definition.evidenceStatus,
    rawResult: definition.rawResult,
    requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
    acceptedConsequence: definition.consequence,
    reviewRequiredBy: definition.reviewRequiredBy,
  };
}

function requestFor(gateIds = OWNER_WAIVER_CANDIDATE_GATE_IDS, overrides = {}) {
  return {
    schemaVersion: EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head,
    owner,
    timestampUtc: "2026-08-29T15:00:00.000Z",
    deploymentAuthorized: false,
    risks: gateIds.map(riskFor),
    ...overrides,
  };
}

function completeGateResults(request) {
  const requestedIds = new Set(request.risks.map(({ gateId }) => gateId));
  return RELEASE_GATE_POLICY.gates.map((definition) =>
    requestedIds.has(definition.id)
      ? {
          gateId: definition.id,
          evidenceStatus: definition.evidenceStatus,
          rawResult: definition.rawResult,
        }
      : {
          gateId: definition.id,
          evidenceStatus: EVIDENCE_STATUS.PASS,
          rawResult: RAW_RESULT.PASS,
        },
  );
}

function createExceptionalReleaseAct(options) {
  return createExceptionalReleaseActV2({ artifactHash, ...options });
}

const request = requestFor();
const validationOptions = { currentHead: head, now };
assert.deepEqual(
  validateExceptionalReleaseRequest(request, validationOptions),
  [],
);
assert.equal(request.schemaVersion, EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION);
assert.equal(request.policyVersion, RELEASE_GATE_POLICY_VERSION);
assert.equal(request.policyHash, RELEASE_GATE_POLICY_SHA256);
assert.equal(request.deploymentAuthorized, false);
assert.equal(request.risks.length, 7);
assert.deepEqual(
  request.risks.map(({ gateId }) => gateId),
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
);
for (const risk of request.risks) {
  const definition = getReleaseGateDefinition(risk.gateId);
  assert.equal(risk.evidenceStatus, definition.evidenceStatus);
  assert.equal(risk.rawResult, definition.rawResult);
  assert.equal(risk.rawResult, RAW_RESULT.FAIL);
  assert.equal(risk.acceptedConsequence, definition.consequence);
  assert.equal(risk.reviewRequiredBy, definition.reviewRequiredBy);
}

const renderedRequest = renderExceptionalReleaseRequestJson(
  request,
  validationOptions,
);
assert.equal(renderedRequest, canonicalJson(request));
assert.equal(renderedRequest.endsWith("\n"), true);
assert.equal(
  renderedRequest.startsWith('{"deploymentAuthorized":false,'),
  true,
);
assert.match(exceptionalReleaseRequestHash(request), /^[0-9a-f]{64}$/);
assert.deepEqual(
  parseExceptionalReleaseRequestJson(renderedRequest, validationOptions),
  request,
);
assert.ok(
  Object.isFrozen(
    parseExceptionalReleaseRequestJson(renderedRequest, validationOptions),
  ),
);
const reorderedRequest = Object.fromEntries(Object.entries(request).reverse());
assert.equal(
  exceptionalReleaseRequestHash(reorderedRequest),
  exceptionalReleaseRequestHash(request),
);
assert.throws(
  () =>
    parseExceptionalReleaseRequestJson(
      `${JSON.stringify(request, null, 2)}\n`,
      validationOptions,
    ),
  /canónico exacto/,
);
assert.throws(
  () =>
    parseExceptionalReleaseRequestJson(
      renderedRequest.replace(
        '"deploymentAuthorized":false',
        '"deploymentAuthorized":true,"deploymentAuthorized":false',
      ),
      validationOptions,
    ),
  /canónico exacto|deploymentAuthorized/,
);

function requestErrors(mutator, options = validationOptions) {
  const changed = structuredClone(request);
  mutator(changed);
  return validateExceptionalReleaseRequest(changed, options).join("\n");
}

assert.match(
  requestErrors((changed) => {
    changed.confirmation = "prefirmada";
  }),
  /exactamente/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks[0].unknown = true;
  }),
  /claves desconocidas/,
);
assert.match(
  requestErrors((changed) => {
    changed.schemaVersion = "v0";
  }),
  /schemaVersion desconocido/,
);
assert.match(
  requestErrors((changed) => {
    changed.policyVersion += "-stale";
  }),
  /policyVersion stale/,
);
assert.match(
  requestErrors((changed) => {
    changed.policyHash = "0".repeat(64);
  }),
  /policyHash stale/,
);
assert.match(
  requestErrors((changed) => {
    changed.head = "f".repeat(40);
  }),
  /HEAD stale/,
);
assert.match(
  requestErrors((changed) => {
    changed.head = changed.head.toUpperCase();
  }),
  /40 hexadecimales/,
);
assert.match(
  requestErrors((changed) => {
    changed.deploymentAuthorized = true;
  }),
  /debe ser false/,
);
assert.match(
  requestErrors((changed) => {
    changed.owner = "pending";
  }),
  /responsable autorizado/,
);
assert.match(
  requestErrors((changed) => {
    changed.owner = "Persona\nInyectada";
  }),
  /responsable autorizado/,
);
assert.match(
  requestErrors((changed) => {
    changed.owner = "Persona Real Distinta";
  }),
  /responsable autorizado/,
);
assert.match(
  requestErrors((changed) => {
    changed.timestampUtc = new Date(
      now.getTime() - 24 * 60 * 60 * 1_000 - 1,
    ).toISOString();
  }),
  /más de 24 horas/,
);
assert.match(
  requestErrors((changed) => {
    changed.timestampUtc = new Date(
      now.getTime() + 5 * 60 * 1_000 + 1,
    ).toISOString();
  }),
  /más de 5 minutos/,
);
assert.deepEqual(
  validateExceptionalReleaseRequest(
    requestFor([], {
      timestampUtc: new Date(
        now.getTime() - 24 * 60 * 60 * 1_000,
      ).toISOString(),
    }),
    validationOptions,
  ),
  [],
);
const reviewDeadline = new Date(
  `${getReleaseGateDefinition(OWNER_WAIVER_CANDIDATE_GATE_IDS[0]).reviewRequiredBy}T23:59:59.999Z`,
);
assert.deepEqual(
  validateExceptionalReleaseRequest(
    requestFor(undefined, { timestampUtc: reviewDeadline.toISOString() }),
    { currentHead: head, now: reviewDeadline },
  ),
  [],
);
const afterReview = new Date(reviewDeadline.getTime() + 1);
assert.match(
  validateExceptionalReleaseRequest(
    requestFor(undefined, { timestampUtc: afterReview.toISOString() }),
    { currentHead: head, now: afterReview },
  ).join("\n"),
  /superó su fecha de revisión/,
);
assert.deepEqual(
  validateExceptionalReleaseRequest(
    requestFor([], {
      timestampUtc: new Date(now.getTime() + 5 * 60 * 1_000).toISOString(),
    }),
    validationOptions,
  ),
  [],
);

for (const gateId of ["*", "all", "global", "privacy.*"]) {
  assert.match(
    requestErrors((changed) => {
      changed.risks[0].gateId = gateId;
    }),
    /global ni usar wildcards/,
  );
}
assert.match(
  requestErrors((changed) => {
    changed.risks[0].gateId = "privacy.unknown";
  }),
  /gate desconocido/,
);
assert.match(
  validateExceptionalReleaseRequest(
    requestFor(["security.rls-enforced"]),
    validationOptions,
  ).join("\n"),
  /NON_WAIVABLE_SECURITY_GATE/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks[0].evidenceStatus = EVIDENCE_STATUS.PASS;
    changed.risks[0].rawResult = RAW_RESULT.PASS;
  }),
  /PASS|original exacto/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks[0].evidenceStatus = EVIDENCE_STATUS.FAIL;
  }),
  /evidenceStatus original exacto/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks[0].acceptedConsequence += " Alterada.";
  }),
  /consequence canónica exacta/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks[0].reviewRequiredBy = "2099-01-01";
  }),
  /reviewRequiredBy canónico/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks[0].requestedDisposition = RELEASE_DISPOSITION.PASS;
  }),
  /requestedDisposition=RISK_ACCEPTED_BY_OWNER/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks.push(structuredClone(changed.risks[0]));
  }),
  /gate IDs duplicados/,
);
assert.match(
  requestErrors((changed) => {
    changed.risks.reverse();
  }),
  /orden canónico/,
);

assert.match(
  validateExceptionalReleaseRequestPath({
    requestPath: "relative.json",
    worktreeRoot: root,
  }).join("\n"),
  /ruta absoluta/,
);
assert.match(
  validateExceptionalReleaseRequestPath({
    requestPath: path.join(root, "request.json"),
    worktreeRoot: root,
  }).join("\n"),
  /fuera del worktree/,
);
assert.deepEqual(
  validateExceptionalReleaseRequestPath({
    requestPath: path.join(tmpdir(), "agorbis-risk-request.json"),
    worktreeRoot: root,
  }),
  [],
);
assert.deepEqual(deriveExceptionalReleaseActPaths("/tmp/release.json"), {
  jsonPath: "/tmp/release.act.json",
  markdownPath: "/tmp/release.act.md",
});

const confirmations = ttyConfirmationTemplate(request);
assert.equal(confirmations.length, request.risks.length);
assert.equal(
  confirmations.every(({ source }) => source === TTY_CONFIRMATION_SOURCE),
  true,
);
const consentConfirmation = confirmations.find(
  ({ gateId }) => gateId === "legal.sensitive-consent-0059-omitted",
);
assert.equal(consentConfirmation.statements.length, 2);
assert.notEqual(
  consentConfirmation.statements[0],
  consentConfirmation.statements[1],
);
assert.deepEqual(validateTtyRiskConfirmations({ request, confirmations }), []);
assert.match(
  validateTtyRiskConfirmations({
    request,
    confirmations: confirmations.map((confirmation, index) =>
      index === 0 ? { ...confirmation, source: "/tmp/input" } : confirmation,
    ),
  }).join("\n"),
  /sólo admite confirmación obtenida de \/dev\/tty/,
);
assert.match(
  validateTtyRiskConfirmations({
    request,
    confirmations: confirmations.map((confirmation) =>
      confirmation.gateId === "legal.sensitive-consent-0059-omitted"
        ? { ...confirmation, statements: [confirmation.statements[0]] }
        : confirmation,
    ),
  }).join("\n"),
  /cada confirmación individual exacta/,
);
assert.match(
  validateTtyRiskConfirmations({
    request,
    confirmations: [...confirmations, confirmations[0]],
  }).join("\n"),
  /duplicados/,
);
assert.match(
  validateTtyRiskConfirmations({
    request,
    confirmations: confirmations.slice(1),
  }).join("\n"),
  /Falta una confirmación/,
);
assert.match(
  validateTtyRiskConfirmations({
    request,
    confirmations: [...confirmations].reverse(),
  }).join("\n"),
  /orden canónico/,
);

const gateResults = completeGateResults(request);
const commands = EXCEPTIONAL_RELEASE_STEP_IDS.map((label) => ({
  label,
  exitCode: 0,
}));
assert.deepEqual(
  commands.map(({ label }) => label),
  EXCEPTIONAL_RELEASE_STEP_IDS,
);
const gateResultsSnapshot = structuredClone(gateResults);
const requestSnapshot = structuredClone(request);
const act = createExceptionalReleaseAct({
  request,
  currentHead: head,
  gateResults,
  confirmations,
  commands,
  now,
});
assert.equal(act.schemaVersion, EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION);
assert.equal(
  EXCEPTIONAL_RELEASE_ACT_SCHEMA_VERSION,
  "agorbis-exceptional-release-act/v2",
);
assert.equal(EXCEPTIONAL_RELEASE_ACT_VALIDITY_MS, 60 * 60 * 1_000);
assert.equal(act.policyVersion, RELEASE_GATE_POLICY_VERSION);
assert.equal(act.policyHash, RELEASE_GATE_POLICY_SHA256);
assert.equal(act.head, head);
assert.equal(act.artifactHash, artifactHash);
assert.equal(act.timestampUtc, now.toISOString());
assert.equal(act.expiresAtUtc, "2026-08-29T17:00:00.000Z");
assert.equal(act.deploymentAuthorized, false);
assert.equal(act.deploymentExecuted, false);
assert.equal(act.productionMutationCommandsExecuted, false);
assert.equal(act.requestHash, exceptionalReleaseRequestHash(request));
assert.match(act.contentSha256, /^[0-9a-f]{64}$/);
assert.equal(act.contentSha256, exceptionalReleaseActContentHash(act));
assert.equal(act.gates.length, RELEASE_GATE_POLICY.gates.length);
assert.equal(act.commands.length, commands.length);
assert.deepEqual(validateExceptionalReleaseAct(act), []);
assert.ok(Object.isFrozen(act));
assert.ok(Object.isFrozen(act.gates));
assert.deepEqual(gateResults, gateResultsSnapshot);
assert.deepEqual(request, requestSnapshot);
assert.equal(
  act.gates.filter(
    ({ releaseDisposition }) =>
      releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
  ).length,
  7,
);
for (const gate of act.gates) {
  const sourceResult = gateResults.find(({ gateId }) => gateId === gate.gateId);
  assert.equal(gate.evidenceStatus, sourceResult.evidenceStatus);
  assert.equal(gate.rawResult, sourceResult.rawResult);
  if (OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gate.gateId)) {
    assert.equal(
      gate.releaseDisposition,
      RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
    );
    assert.equal(
      gate.acceptedConsequence,
      getReleaseGateDefinition(gate.gateId).consequence,
    );
    assert.equal(gate.confirmation.source, TTY_CONFIRMATION_SOURCE);
  } else {
    assert.equal(gate.gatePolicy, GATE_POLICY.NON_WAIVABLE_SECURITY_GATE);
    assert.equal(gate.releaseDisposition, RELEASE_DISPOSITION.PASS);
    assert.equal(gate.confirmation, null);
    assert.equal(gate.facts, null);
  }
}
assert.deepEqual(
  act.gates.find(({ gateId }) => gateId === "legal.aaip-registration-pending")
    .facts,
  {
    AAIP_DATABASE_REGISTRATION_STATUS: "pending",
    PUBLIC_AAIP_DATABASE_REGISTRATION_ID: null,
  },
);
assert.deepEqual(
  act.gates.find(
    ({ gateId }) => gateId === "recovery.production-backup-not-verified",
  ).facts,
  {
    GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
    PRODUCTION_BACKUP_STATUS: "not_verified",
    RISK_ACCEPTED_BY_OWNER: true,
  },
);
assert.deepEqual(
  act.gates.find(
    ({ gateId }) => gateId === "legal.sensitive-consent-0059-omitted",
  ).facts,
  {
    SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
    affectedSurfaces: [
      "publicaciones cívicas",
      "opiniones y debate",
      "apoyos y compromisos",
      "reclamos y evidencia",
      "votos de encuestas y presupuestos participativos",
      "visibilidad de membresía",
      "reportes y solicitudes",
    ],
    legalConformityClaimAllowed: false,
  },
);

const actJson = renderExceptionalReleaseActJson(act);
assert.equal(actJson, canonicalJson(act));
assert.deepEqual(JSON.parse(actJson), act);
const parsedAct = parseExceptionalReleaseActJson(actJson);
assert.deepEqual(parsedAct, act);
assert.ok(Object.isFrozen(parsedAct));
assert.throws(
  () => parseExceptionalReleaseActJson(`${JSON.stringify(act, null, 2)}\n`),
  /canónico exacto/,
);
assert.throws(
  () => parseExceptionalReleaseActJson("x".repeat(1024 * 1024)),
  /excede el límite/,
);
const actMarkdown = renderExceptionalReleaseActMarkdown(act);
assert.match(actMarkdown, /ESTO NO ES PASS/);
assert.match(actMarkdown, /NO DEPLOY/);
assert.match(actMarkdown, /Sebastian Cardoso Castillo/);
assert.match(actMarkdown, new RegExp(artifactHash));
assert.equal(actMarkdown.includes("2026\\-08\\-29T17:00:00\\.000Z"), true);
assert.equal(
  actMarkdown.includes('PRODUCTION\\_BACKUP\\_STATUS="not\\_verified"'),
  true,
);
assert.equal(
  actMarkdown.includes('GOOGLE\\_DRIVE\\_BACKUP\\_STATUS="inactive"'),
  true,
);
assert.match(actMarkdown, /legalConformityClaimAllowed=false/);
assert.equal(actMarkdown.includes("process.env"), false);
assert.equal(actMarkdown.includes("stdout"), false);

const tamperedAct = structuredClone(act);
tamperedAct.commands[0].exitCode = 1;
assert.match(
  validateExceptionalReleaseAct(tamperedAct).join("\n"),
  /exitCode debe ser 0/,
);
assert.match(
  validateExceptionalReleaseAct(tamperedAct).join("\n"),
  /contentSha256 no coincide/,
);
const tamperedArtifactAct = structuredClone(act);
tamperedArtifactAct.artifactHash = "b".repeat(64);
assert.match(
  validateExceptionalReleaseAct(tamperedArtifactAct).join("\n"),
  /contentSha256 no coincide/,
);
const tamperedExpirationAct = structuredClone(act);
tamperedExpirationAct.expiresAtUtc = "2026-08-29T17:00:00.001Z";
tamperedExpirationAct.contentSha256 = exceptionalReleaseActContentHash(
  tamperedExpirationAct,
);
assert.match(
  validateExceptionalReleaseAct(tamperedExpirationAct).join("\n"),
  /exactamente 60 minutos/,
);
const tamperedFactsAct = structuredClone(act);
tamperedFactsAct.gates.find(
  ({ gateId }) => gateId === "recovery.production-backup-not-verified",
).facts.PRODUCTION_BACKUP_STATUS = "verified";
assert.match(
  validateExceptionalReleaseAct(tamperedFactsAct).join("\n"),
  /altera facts canónicos/,
);
assert.throws(
  () =>
    createExceptionalReleaseActV2({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands,
      now,
    }),
  /artifactHash debe ser un SHA-256/,
);
assert.throws(
  () =>
    createExceptionalReleaseActV2({
      request,
      currentHead: head,
      artifactHash: artifactHash.toUpperCase(),
      gateResults,
      confirmations,
      commands,
      now,
    }),
  /artifactHash debe ser un SHA-256/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults: gateResults.slice(1),
      confirmations,
      commands,
      now,
    }),
  /exactamente todos los gates/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults: [...gateResults].reverse(),
      confirmations,
      commands,
      now,
    }),
  /orden canónico/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations: confirmations.slice(1),
      commands,
      now,
    }),
  /Falta una confirmación/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands: [],
      now,
    }),
  /exactamente los 6 pasos canónicos/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands: commands.map((command, index) =>
        index === 2 ? { ...command, exitCode: 1 } : command,
      ),
      now,
    }),
  /exitCode debe ser 0/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands: [...commands].reverse(),
      now,
    }),
  /exactamente los 6 pasos canónicos y en orden/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands: [
        {
          label: "build",
          exitCode: 0,
          stdout: "no debe archivarse",
        },
      ],
      now,
    }),
  /únicamente label y exitCode/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands: [
        {
          label: ["sb", "secret", "abcdefghijklmnopqrstuvwxyz"].join("_"),
          exitCode: 0,
        },
      ],
      now,
    }),
  /label no es seguro/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults,
      confirmations,
      commands: [{ label: "Worker Secret inventory names only", exitCode: 0 }],
      now,
    }),
  /exactamente los 6 pasos canónicos/,
);

const nonWaivableFailureResults = structuredClone(gateResults);
Object.assign(
  nonWaivableFailureResults.find(
    ({ gateId }) => gateId === "security.auth-functional",
  ),
  {
    evidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
    rawResult: RAW_RESULT.FAIL,
  },
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request,
      currentHead: head,
      gateResults: nonWaivableFailureResults,
      confirmations,
      commands,
      now,
    }),
  /security\.auth-functional NON_WAIVABLE_SECURITY_GATE debe constar como PASS técnico/,
);

const partialRiskRequest = requestFor(
  OWNER_WAIVER_CANDIDATE_GATE_IDS.slice(0, -1),
);
const stopGateResults = completeGateResults(partialRiskRequest);
const omittedRiskId = OWNER_WAIVER_CANDIDATE_GATE_IDS.at(-1);
const omittedRiskDefinition = getReleaseGateDefinition(omittedRiskId);
Object.assign(
  stopGateResults.find(({ gateId }) => gateId === omittedRiskId),
  {
    evidenceStatus: omittedRiskDefinition.evidenceStatus,
    rawResult: omittedRiskDefinition.rawResult,
  },
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      request: partialRiskRequest,
      currentHead: head,
      gateResults: stopGateResults,
      confirmations: ttyConfirmationTemplate(partialRiskRequest),
      commands,
      now,
    }),
  /no puede contener disposition STOP/,
);

const noRiskRequest = requestFor([]);
const noRiskAct = createExceptionalReleaseAct({
  request: noRiskRequest,
  currentHead: head,
  gateResults: completeGateResults(noRiskRequest),
  confirmations: [],
  commands,
  now,
});
assert.equal(
  noRiskAct.gates.every(
    ({ releaseDisposition }) => releaseDisposition === RELEASE_DISPOSITION.PASS,
  ),
  true,
);
assert.equal(
  renderExceptionalReleaseActMarkdown(noRiskAct).includes("ESTO NO ES PASS"),
  false,
);

const temp = mkdtempSync(path.join(tmpdir(), "agorbis-release-act-"));
try {
  const requestPath = path.join(temp, "release-request.json");
  writeFileSync(requestPath, renderedRequest, {
    encoding: "utf8",
    mode: 0o600,
  });
  const loaded = readExceptionalReleaseRequestFile({
    requestPath,
    worktreeRoot: root,
    currentHead: head,
    now,
  });
  assert.deepEqual(loaded, request);
  const written = writeExceptionalReleaseActFiles({
    requestPath,
    worktreeRoot: root,
    act,
  });
  assert.equal(written.jsonPath, path.join(temp, "release-request.act.json"));
  assert.equal(written.markdownPath, path.join(temp, "release-request.act.md"));
  assert.equal(readFileSync(written.jsonPath, "utf8"), actJson);
  assert.equal(readFileSync(written.markdownPath, "utf8"), actMarkdown);
  assert.equal(statSync(written.jsonPath).mode & 0o777, 0o600);
  assert.equal(statSync(written.markdownPath).mode & 0o777, 0o600);
  assert.deepEqual(
    readExceptionalReleaseActFile({
      actPath: written.jsonPath,
      worktreeRoot: root,
      currentHead: head,
      now: new Date("2026-08-29T16:59:59.999Z"),
    }),
    act,
  );
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: written.jsonPath,
        worktreeRoot: root,
        currentHead: head,
        now: new Date(act.expiresAtUtc),
      }),
    /vencida/,
  );
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: written.jsonPath,
        worktreeRoot: root,
        currentHead: "f".repeat(40),
        now,
      }),
    /HEAD distinto/,
  );
  chmodSync(written.jsonPath, 0o640);
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: written.jsonPath,
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /modo 0600 exacto/,
  );
  chmodSync(written.jsonPath, 0o600);

  const nonCanonicalActPath = path.join(temp, "non-canonical.act.json");
  writeFileSync(nonCanonicalActPath, `${JSON.stringify(act, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: nonCanonicalActPath,
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /canónico exacto/,
  );

  const tamperedActPath = path.join(temp, "tampered.act.json");
  writeFileSync(tamperedActPath, canonicalJson(tamperedArtifactAct), {
    encoding: "utf8",
    mode: 0o600,
  });
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: tamperedActPath,
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /contentSha256 no coincide/,
  );

  const oversizedActPath = path.join(temp, "oversized.act.json");
  writeFileSync(oversizedActPath, "x".repeat(1024 * 1024), {
    encoding: "utf8",
    mode: 0o600,
  });
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: oversizedActPath,
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /excede el tamaño máximo/,
  );

  const actLinkPath = path.join(temp, "linked.act.json");
  symlinkSync(written.jsonPath, actLinkPath);
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: actLinkPath,
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /archivo regular, no un symlink/,
  );
  assert.throws(
    () =>
      readExceptionalReleaseActFile({
        actPath: path.join(root, "forbidden.act.json"),
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /fuera del worktree/,
  );
  const originalJson = readFileSync(written.jsonPath, "utf8");
  const originalMarkdown = readFileSync(written.markdownPath, "utf8");
  assert.throws(
    () =>
      writeExceptionalReleaseActFiles({
        requestPath,
        worktreeRoot: root,
        act,
      }),
    /EEXIST|exist/i,
  );
  assert.equal(readFileSync(written.jsonPath, "utf8"), originalJson);
  assert.equal(readFileSync(written.markdownPath, "utf8"), originalMarkdown);

  const changedRequestPath = path.join(temp, "changed-request.json");
  writeFileSync(changedRequestPath, `${renderedRequest} `, {
    encoding: "utf8",
    mode: 0o600,
  });
  assert.throws(
    () =>
      writeExceptionalReleaseActFiles({
        requestPath: changedRequestPath,
        worktreeRoot: root,
        act,
      }),
    /request cambió/,
  );

  const targetPath = path.join(temp, "target.json");
  const linkPath = path.join(temp, "link.json");
  writeFileSync(targetPath, renderedRequest, { encoding: "utf8", mode: 0o600 });
  symlinkSync(targetPath, linkPath);
  assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
  assert.throws(
    () =>
      readExceptionalReleaseRequestFile({
        requestPath: linkPath,
        worktreeRoot: root,
        currentHead: head,
        now,
      }),
    /archivo regular, no un symlink/,
  );

  const preexistingRequestPath = path.join(temp, "preexisting-request.json");
  const preexistingMarkdownPath = path.join(temp, "preexisting-request.act.md");
  writeFileSync(preexistingRequestPath, renderedRequest, {
    encoding: "utf8",
    mode: 0o600,
  });
  writeFileSync(preexistingMarkdownPath, "keep\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  assert.throws(
    () =>
      writeExceptionalReleaseActFiles({
        requestPath: preexistingRequestPath,
        worktreeRoot: root,
        act,
      }),
    /EEXIST|exist/i,
  );
  assert.equal(
    lstatSync(path.join(temp, "preexisting-request.act.json"), {
      throwIfNoEntry: false,
    }),
    undefined,
  );
  assert.equal(readFileSync(preexistingMarkdownPath, "utf8"), "keep\n");
  chmodSync(preexistingMarkdownPath, 0o600);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const moduleSource = readFileSync(
  path.join(root, "scripts/exceptional-release-act.mjs"),
  "utf8",
);
assert.equal(moduleSource.includes("console."), false);
assert.equal(moduleSource.includes("process.env"), false);
assert.equal(moduleSource.includes("node:child_process"), false);

console.log(
  `Exceptional release act: PASS (${RELEASE_GATE_POLICY.gates.length} gates; ${OWNER_WAIVER_CANDIDATE_GATE_IDS.length} riesgos elegibles).`,
);

// The OPEN profile has its own source, command sequence and final evidence.
const openRequest = requestFor(OWNER_WAIVER_CANDIDATE_GATE_IDS, {
  schemaVersion: "agorbis-exceptional-release-request/v2",
  releaseMode: "OPEN_UPDATE",
  timestampUtc: NOW,
  openSourceBaseline: baseline,
  openSourceBaselineSha256: expectedBaselineSha256,
});
assert.deepEqual(
  validateExceptionalReleaseRequest(openRequest, {
    currentHead: head,
    now: NOW,
  }),
  [],
);
const openOptions = {
  request: openRequest,
  currentHead: head,
  artifactHash,
  openUpdateEvidenceHash: "e".repeat(64),
  gateResults: completeGateResults(openRequest),
  confirmations: ttyConfirmationTemplate(openRequest),
  commands: EXCEPTIONAL_OPEN_UPDATE_STEP_IDS.map((label) => ({
    label,
    exitCode: 0,
  })),
  now: NOW,
};
const openAct = createExceptionalReleaseAct(openOptions);
assert.equal(openAct.schemaVersion, "agorbis-exceptional-release-act/v3");
assert.equal(openAct.openSourceBaselineSha256, expectedBaselineSha256);
assert.deepEqual(validateExceptionalReleaseAct(openAct), []);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      ...openOptions,
      openUpdateEvidenceHash: undefined,
    }),
  /certificado/,
);
assert.throws(
  () =>
    createExceptionalReleaseAct({
      ...openOptions,
      commands: EXCEPTIONAL_RELEASE_STEP_IDS.map((label) => ({
        label,
        exitCode: 0,
      })),
    }),
  /canónicos/,
);
for (const mutate of [
  (v) => {
    v.releaseMode = "CLOSED";
  },
  (v) => {
    v.openSourceBaselineSha256 = "c".repeat(64);
  },
  (v) => {
    v.openSourceBaseline.configuration.crons = [];
  },
  (v) => {
    v.schemaVersion = EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION;
  },
  (v) => {
    v.extra = true;
  },
]) {
  const changed = structuredClone(openRequest);
  mutate(changed);
  assert.ok(
    validateExceptionalReleaseRequest(changed, { currentHead: head, now: NOW })
      .length,
  );
}
const openArtifact = {
  artifactPurpose: "primary",
  releaseMode: "OPEN_UPDATE",
  openSourceBaseline: baseline,
  openSourceBaselineSha256: expectedBaselineSha256,
};
assert.deepEqual(
  validateExceptionalActSource({
    request: openRequest,
    act: openAct,
    artifactManifest: openArtifact,
  }),
  [],
);
assert.ok(
  validateExceptionalActSource({
    request,
    act: openAct,
    artifactManifest: openArtifact,
  }).length,
);
assert.ok(
  validateExceptionalActSource({
    request: openRequest,
    act: openAct,
    artifactManifest: { ...openArtifact, artifactPurpose: "recovery" },
  }).length,
);
const openPlanOptions = {
  root,
  requestPath: "/tmp/open-profile-request.json",
  releaseMode: "OPEN_UPDATE",
};
const openPlan = createExceptionalOpenReleaseDryRunPlan(openPlanOptions);
assert.deepEqual(
  openPlan.map(({ id }) => id),
  EXCEPTIONAL_OPEN_UPDATE_STEP_IDS,
);
assert.equal(
  openPlan.some(({ arguments: args }) => args.includes("triggers")),
  false,
);
assert.deepEqual(
  validateExceptionalOpenReleaseDryRunPlan({
    ...openPlanOptions,
    plan: openPlan,
  }),
  [],
);
assert.ok(
  validateExceptionalOpenReleaseDryRunPlan({
    ...openPlanOptions,
    releaseMode: undefined,
    plan: openPlan,
  }).length,
);
console.log("OPEN request/artifact/act profiles: PASS");
