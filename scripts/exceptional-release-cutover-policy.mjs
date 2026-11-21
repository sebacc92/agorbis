import { createHash } from "node:crypto";
import path from "node:path";
import {
  exceptionalReleaseRequestHash,
  validateExceptionalReleaseAct,
  validateExceptionalReleaseRequest,
} from "./exceptional-release-act.mjs";
import { validateExceptionalReleaseArtifactManifest } from "./exceptional-release-artifact.mjs";
import { validateExceptionalActIssuance } from "./exceptional-act-issuance.mjs";
import { assertExceptionalOpenRecoveryCapsule } from "./exceptional-open-recovery-capsule.mjs";
import {
  EVIDENCE_STATUS,
  GATE_POLICY,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

export const EXCEPTIONAL_CUTOVER_NODE_VERSION = "22.22.0";
export const EXCEPTIONAL_CUTOVER_WRANGLER_VERSION = "4.160.1";
export const EXCEPTIONAL_CUTOVER_WORKER_NAME = "agorbis";
export const EXCEPTIONAL_CUTOVER_ACCOUNT_ID =
  "4d78fb10c1ae65281ec851479d5045dc";

const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function safeAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    CONTROL_OR_BIDI_PATTERN.test(value)
  ) {
    throw new Error(`${label} debe ser una ruta absoluta segura.`);
  }
  return path.resolve(value);
}

function safeHash(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un SHA-256 completo en minúsculas.`);
  }
  return value;
}

function safeHead(value, label) {
  if (typeof value !== "string" || !FULL_HEAD_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un HEAD completo en minúsculas.`);
  }
  return value;
}

function safeVersionId(value, label) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un Version ID UUID válido.`);
  }
  return value;
}

function immutableStep(step) {
  return Object.freeze({
    ...step,
    arguments: Object.freeze([...step.arguments]),
  });
}

export function parseExceptionalCutoverArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 4 ||
    argv[0] !== "--request" ||
    typeof argv[1] !== "string" ||
    !path.isAbsolute(argv[1]) ||
    !argv[1].endsWith(".json") ||
    CONTROL_OR_BIDI_PATTERN.test(argv[1]) ||
    argv[2] !== "--act-hash" ||
    typeof argv[3] !== "string" ||
    !SHA256_PATTERN.test(argv[3])
  ) {
    throw new Error(
      "Uso: node scripts/run-exceptional-open-cutover.mjs --request <ruta-absoluta.json> --act-hash <sha256>",
    );
  }
  return Object.freeze({
    requestPath: path.resolve(argv[1]),
    expectedActHash: argv[3],
  });
}

export function exceptionalCutoverConfirmationPhrase(fullHead, actHash) {
  safeHead(fullHead, "full-head");
  safeHash(actHash, "act-hash");
  return `AUTORIZO DEPLOY OPEN DE AGORBIS PARA ${fullHead} CON ACTA ${actHash}`;
}

export function validateExceptionalCutoverBundle({
  request,
  act,
  artifactManifest,
  issuance,
  expectedActHash,
  currentHead,
  now = new Date(),
  nodeVersion,
  wranglerVersion,
  claimExists,
} = {}) {
  const errors = [];
  const currentTime = now instanceof Date ? new Date(now) : new Date(now);
  if (!Number.isFinite(currentTime.getTime())) {
    errors.push("now no es una fecha válida.");
  }
  errors.push(
    ...validateExceptionalReleaseRequest(request, {
      currentHead,
      now: currentTime,
    }),
  );
  errors.push(...validateExceptionalReleaseAct(act));
  errors.push(
    ...validateExceptionalActIssuance(issuance, {
      request,
      act,
      artifactManifest,
      expectedActHash,
    }),
  );

  let requestHash;
  try {
    requestHash = exceptionalReleaseRequestHash(request);
  } catch {
    errors.push("No se pudo calcular el request hash canónico.");
  }
  if (
    request?.head !== currentHead ||
    act?.head !== currentHead ||
    act?.requestHash !== requestHash
  ) {
    errors.push("Request, acta, request hash y HEAD actual no coinciden.");
  }
  if (
    !SHA256_PATTERN.test(expectedActHash ?? "") ||
    act?.contentSha256 !== expectedActHash
  ) {
    errors.push("El actHash externo no coincide con el acta emitida.");
  }

  if (!isPlainObject(artifactManifest)) {
    errors.push("El manifest del artifact no es un objeto válido.");
  } else {
    errors.push(
      ...validateExceptionalReleaseArtifactManifest(artifactManifest, {
        expectedHead: currentHead,
        expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
        expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
        expectedRequestHash: requestHash,
        expectedArtifactHash: act?.artifactHash,
      }),
    );
    if (artifactManifest.contentSha256 !== act?.artifactHash) {
      errors.push("El acta y el artifact hash no coinciden.");
    }
  }

  if (
    nodeVersion !== EXCEPTIONAL_CUTOVER_NODE_VERSION ||
    wranglerVersion !== EXCEPTIONAL_CUTOVER_WRANGLER_VERSION
  ) {
    errors.push("El cutover exige Node 22.22.0 y Wrangler 4.160.1.");
  }
  if (claimExists !== false) {
    errors.push(
      "El acta ya está consumida o su estado de consumo es incierto.",
    );
  }
  if (
    Number.isFinite(currentTime.getTime()) &&
    typeof act?.expiresAtUtc === "string" &&
    currentTime.getTime() >= new Date(act.expiresAtUtc).getTime()
  ) {
    errors.push("El acta excepcional está vencida.");
  }

  const requestRiskIds = Array.isArray(request?.risks)
    ? request.risks.map(({ gateId }) => gateId)
    : [];
  if (
    JSON.stringify(requestRiskIds) !==
    JSON.stringify(OWNER_WAIVER_CANDIDATE_GATE_IDS)
  ) {
    errors.push("El request debe enumerar exactamente los siete riesgos D72.");
  }
  const gateById = new Map(
    Array.isArray(act?.gates)
      ? act.gates.map((gate) => [gate.gateId, gate])
      : [],
  );
  for (const gateId of OWNER_WAIVER_CANDIDATE_GATE_IDS) {
    const gate = gateById.get(gateId);
    const requestRisk = Array.isArray(request?.risks)
      ? request.risks.find((risk) => risk.gateId === gateId)
      : null;
    if (
      !gate ||
      !requestRisk ||
      gate.evidenceStatus === EVIDENCE_STATUS.PASS ||
      gate.rawResult !== RAW_RESULT.FAIL ||
      gate.releaseDisposition !== RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER ||
      gate.evidenceStatus !== requestRisk.evidenceStatus ||
      gate.rawResult !== requestRisk.rawResult ||
      gate.acceptedConsequence !== requestRisk.acceptedConsequence ||
      gate.reviewRequiredBy !== requestRisk.reviewRequiredBy
    ) {
      errors.push(
        `${gateId} debe conservar su estado factual no-PASS y RISK_ACCEPTED_BY_OWNER.`,
      );
    }
  }
  for (const gateId of NON_WAIVABLE_SECURITY_GATE_IDS) {
    const gate = gateById.get(gateId);
    if (
      !gate ||
      gate.gatePolicy !== GATE_POLICY.NON_WAIVABLE_SECURITY_GATE ||
      gate.evidenceStatus !== EVIDENCE_STATUS.PASS ||
      gate.rawResult !== RAW_RESULT.PASS ||
      gate.releaseDisposition !== RELEASE_DISPOSITION.PASS
    ) {
      errors.push(`${gateId} no tiene PASS técnico no renunciable.`);
    }
  }
  return Object.freeze([...new Set(errors)]);
}

export function assertExceptionalCutoverBundle(input) {
  const errors = validateExceptionalCutoverBundle(input);
  if (errors.length > 0) {
    throw new Error(`Bundle excepcional inválido:\n${errors.join("\n")}`);
  }
}

function planContext({
  repositoryRoot,
  artifactRoot,
  stateRoot,
  nodeExecutable,
  head,
  act,
  artifactManifest,
} = {}) {
  const root = safeAbsolutePath(repositoryRoot, "repositoryRoot");
  const frozenRoot = safeAbsolutePath(artifactRoot, "artifactRoot");
  const runtimeRoot = safeAbsolutePath(stateRoot, "stateRoot");
  const node = safeAbsolutePath(nodeExecutable, "nodeExecutable");
  if (path.basename(node) !== "node") {
    throw new Error("nodeExecutable debe resolver al binario node.");
  }
  const currentHead = safeHead(head, "head");
  const actHash = safeHash(act?.contentSha256, "act.contentSha256");
  const artifactHash = safeHash(
    artifactManifest?.contentSha256,
    "artifactManifest.contentSha256",
  );
  if (
    act?.head !== currentHead ||
    artifactManifest?.head !== currentHead ||
    act?.artifactHash !== artifactHash
  ) {
    throw new Error("El contexto del plan no coincide con acta/artifact/HEAD.");
  }
  const actErrors = validateExceptionalReleaseAct(act);
  const manifestErrors = validateExceptionalReleaseArtifactManifest(
    artifactManifest,
    {
      expectedHead: currentHead,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: act.requestHash,
      expectedArtifactHash: act.artifactHash,
    },
  );
  if (actErrors.length > 0 || manifestErrors.length > 0) {
    throw new Error(
      "El contexto del plan contiene un acta o artifact inválido.",
    );
  }
  return Object.freeze({
    root,
    frozenRoot,
    runtimeRoot,
    node,
    head: currentHead,
    actHash,
    artifactHash,
    requestHash: act.requestHash,
    policyVersion: act.policyVersion,
    policyHash: act.policyHash,
  });
}

function wranglerEntrypoint(root) {
  return path.join(root, "node_modules", "wrangler", "wrangler-dist", "cli.js");
}

function emptyEnvironmentPath(context) {
  return path.join(context.frozenRoot, "exceptional-release-empty.env");
}

export function exceptionalCutoverVersionTag(head) {
  return safeHead(head, "head");
}

export function exceptionalCutoverVersionMessage({
  mode,
  head,
  requestHash,
  policyVersion,
  policyHash,
  actHash,
  artifactHash,
} = {}) {
  if (!["closed", "open", "upload"].includes(mode)) {
    throw new Error("El modo de anotación remota no es válido.");
  }
  const binding = JSON.stringify({
    schemaVersion: "agorbis-d72-remote-binding/v1",
    accountId: EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
    workerName: EXCEPTIONAL_CUTOVER_WORKER_NAME,
    mode,
    head: safeHead(head, "head"),
    requestHash: safeHash(requestHash, "requestHash"),
    policyVersion,
    policyHash: safeHash(policyHash, "policyHash"),
    actHash: safeHash(actHash, "actHash"),
    artifactHash: safeHash(artifactHash, "artifactHash"),
  });
  if (
    policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    throw new Error("La anotación remota no usa la policy exacta vigente.");
  }
  const digest = createHash("sha256").update(binding, "utf8").digest("hex");
  return `agorbis-d72:${mode}:v1:${digest}`;
}

function message(context, mode) {
  return exceptionalCutoverVersionMessage({
    mode,
    head: context.head,
    requestHash: context.requestHash,
    policyVersion: context.policyVersion,
    policyHash: context.policyHash,
    actHash: context.actHash,
    artifactHash: context.artifactHash,
  });
}

export function createExceptionalCutoverPlan(options = {}) {
  const context = planContext(options);
  const wrangler = wranglerEntrypoint(context.root);
  const emptyEnv = emptyEnvironmentPath(context);
  return Object.freeze(
    [
      {
        id: "upload-open-version",
        command: context.node,
        arguments: [
          wrangler,
          "versions",
          "upload",
          "--config",
          path.join(context.frozenRoot, "wrangler.jsonc"),
          "--cwd",
          context.frozenRoot,
          "--env-file",
          emptyEnv,
          "--name",
          EXCEPTIONAL_CUTOVER_WORKER_NAME,
          "--strict",
          "--tag",
          exceptionalCutoverVersionTag(context.head),
          "--message",
          message(context, "upload"),
        ],
        shell: false,
      },
      {
        id: "install-open-crons",
        command: context.node,
        arguments: [
          wrangler,
          "triggers",
          "deploy",
          "--config",
          path.join(context.frozenRoot, "wrangler.crons-open.jsonc"),
          "--cwd",
          context.frozenRoot,
          "--env-file",
          emptyEnv,
          "--name",
          EXCEPTIONAL_CUTOVER_WORKER_NAME,
        ],
        shell: false,
      },
    ]
      .filter(
        (step) =>
          options.artifactManifest?.releaseMode !== "OPEN_UPDATE" ||
          step.id !== "install-open-crons",
      )
      .map(immutableStep),
  );
}

function trafficStep({ id, versionId, mode, ...options }) {
  const context = planContext(options);
  return immutableStep({
    id,
    command: context.node,
    arguments: [
      wranglerEntrypoint(context.root),
      "versions",
      "deploy",
      `${safeVersionId(versionId, `${mode}VersionId`)}@100%`,
      "--config",
      path.join(context.frozenRoot, "wrangler.traffic.jsonc"),
      "--cwd",
      context.frozenRoot,
      "--env-file",
      emptyEnvironmentPath(context),
      "--name",
      EXCEPTIONAL_CUTOVER_WORKER_NAME,
      "--message",
      message(context, mode),
      "--yes",
    ],
    shell: false,
  });
}

export function createExceptionalPromotionStep({ openVersionId, ...options }) {
  return trafficStep({
    ...options,
    id: "promote-open-version-100",
    mode: "open",
    versionId: openVersionId,
  });
}

export function createExceptionalRollbackPlan({ closedVersionId, ...options }) {
  const context = planContext(options);
  const restore = trafficStep({
    ...options,
    id: "restore-closed-version-100",
    mode: "closed",
    versionId: closedVersionId,
  });
  return Object.freeze([
    restore,
    immutableStep({
      id: "remove-open-crons",
      command: context.node,
      arguments: [
        wranglerEntrypoint(context.root),
        "triggers",
        "deploy",
        "--config",
        path.join(context.frozenRoot, "wrangler.crons-closed.jsonc"),
        "--cwd",
        context.frozenRoot,
        "--env-file",
        emptyEnvironmentPath(context),
        "--name",
        EXCEPTIONAL_CUTOVER_WORKER_NAME,
      ],
      shell: false,
    }),
  ]);
}

export function createExceptionalClosedRecoveryPlan({
  repositoryRoot,
  capsuleRoot,
  stateRoot,
  nodeExecutable,
  capsuleManifest,
} = {}) {
  const root = safeAbsolutePath(repositoryRoot, "repositoryRoot");
  const frozenRoot = safeAbsolutePath(capsuleRoot, "capsuleRoot");
  safeAbsolutePath(stateRoot, "stateRoot");
  const node = safeAbsolutePath(nodeExecutable, "nodeExecutable");
  if (path.basename(node) !== "node") {
    throw new Error("nodeExecutable de recovery debe resolver a node.");
  }
  if (
    !isPlainObject(capsuleManifest) ||
    capsuleManifest.accountId !== EXCEPTIONAL_CUTOVER_ACCOUNT_ID ||
    capsuleManifest.workerName !== EXCEPTIONAL_CUTOVER_WORKER_NAME ||
    capsuleManifest.policyVersion !== RELEASE_GATE_POLICY_VERSION ||
    capsuleManifest.policyHash !== RELEASE_GATE_POLICY_SHA256
  ) {
    throw new Error("La cápsula no permite construir recovery CLOSED.");
  }
  const binding = {
    mode: "closed",
    head: safeHead(capsuleManifest.head, "capsule.head"),
    requestHash: safeHash(capsuleManifest.requestHash, "capsule.requestHash"),
    policyVersion: capsuleManifest.policyVersion,
    policyHash: safeHash(capsuleManifest.policyHash, "capsule.policyHash"),
    actHash: safeHash(capsuleManifest.actHash, "capsule.actHash"),
    artifactHash: safeHash(
      capsuleManifest.artifactHash,
      "capsule.artifactHash",
    ),
  };
  const common = [
    "--cwd",
    frozenRoot,
    "--env-file",
    path.join(frozenRoot, "exceptional-release-empty.env"),
    "--name",
    EXCEPTIONAL_CUTOVER_WORKER_NAME,
  ];
  return Object.freeze([
    immutableStep({
      id: "recover-closed-version-100",
      command: node,
      arguments: [
        wranglerEntrypoint(root),
        "versions",
        "deploy",
        `${safeVersionId(
          capsuleManifest.closedVersionId,
          "capsule.closedVersionId",
        )}@100%`,
        "--config",
        path.join(frozenRoot, "wrangler.traffic.jsonc"),
        ...common,
        "--message",
        exceptionalCutoverVersionMessage(binding),
        "--yes",
      ],
      shell: false,
    }),
    immutableStep({
      id: "recover-zero-crons",
      command: node,
      arguments: [
        wranglerEntrypoint(root),
        "triggers",
        "deploy",
        "--config",
        path.join(frozenRoot, "wrangler.crons-closed.jsonc"),
        ...common,
      ],
      shell: false,
    }),
  ]);
}

/**
 * Recover the separately verified Google-off artifact at 100%, preserving the
 * existing five crons. The caller must use its operation lock, immutable files,
 * runtime integrity checks and the dedicated post-recovery OPEN audit.
 * This pure plan neither inherits promotion expiry nor authorizes execution.
 */
export function createExceptionalOpenRecoveryPlan({
  repositoryRoot,
  capsuleRoot,
  stateRoot,
  nodeExecutable,
  capsuleManifest,
  expectedBindings,
} = {}) {
  const root = safeAbsolutePath(repositoryRoot, "repositoryRoot");
  const frozenRoot = safeAbsolutePath(capsuleRoot, "capsuleRoot");
  safeAbsolutePath(stateRoot, "stateRoot");
  const node = safeAbsolutePath(nodeExecutable, "nodeExecutable");
  if (path.basename(node) !== "node") {
    throw new Error("nodeExecutable de recovery debe resolver a node.");
  }
  const manifest = assertExceptionalOpenRecoveryCapsule(
    capsuleManifest,
    expectedBindings,
  );
  return Object.freeze([
    immutableStep({
      id: "recover-open-google-disabled-version-100",
      command: node,
      arguments: [
        wranglerEntrypoint(root),
        "versions",
        "deploy",
        `${safeVersionId(manifest.recoveryVersionId, "recoveryVersionId")}@100%`,
        "--config",
        path.join(frozenRoot, "wrangler.traffic.jsonc"),
        "--cwd",
        frozenRoot,
        "--env-file",
        path.join(frozenRoot, "exceptional-release-empty.env"),
        "--name",
        EXCEPTIONAL_CUTOVER_WORKER_NAME,
        "--message",
        `agorbis-open-recovery:v1:${manifest.contentSha256}`,
        "--yes",
      ],
      shell: false,
    }),
  ]);
}

export function validateExceptionalCutoverStep(step, { expectedStep } = {}) {
  const errors = [];
  if (!isPlainObject(step)) return ["El paso no es un objeto válido."];
  if (!isPlainObject(expectedStep)) {
    return ["El paso esperado exacto es obligatorio."];
  }
  const expectedKeys = ["arguments", "command", "id", "shell"];
  if (
    JSON.stringify(Object.keys(step).sort()) !== JSON.stringify(expectedKeys)
  ) {
    errors.push("El paso contiene propiedades no aprobadas.");
  }
  if (step.shell !== false) errors.push("El paso debe usar shell=false.");
  if (step.id !== expectedStep.id) errors.push("El step id no coincide.");
  if (step.command !== expectedStep.command) {
    errors.push("El ejecutable del paso no coincide.");
  }
  if (
    !Array.isArray(step.arguments) ||
    step.arguments.some((argument) => typeof argument !== "string") ||
    JSON.stringify(step.arguments) !== JSON.stringify(expectedStep.arguments)
  ) {
    errors.push("El argv del paso no coincide exactamente.");
  }
  return Object.freeze([...new Set(errors)]);
}

export function assertExceptionalCutoverStep(step, expectedStep) {
  const errors = validateExceptionalCutoverStep(step, { expectedStep });
  if (errors.length > 0) {
    throw new Error(`Paso de cutover inseguro:\n${errors.join("\n")}`);
  }
}
