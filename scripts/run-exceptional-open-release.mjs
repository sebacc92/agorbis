#!/usr/bin/env node
import { readOpenUpdateEvidenceFile } from "./open-update-evidence-file.mjs";

import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TTY_CONFIRMATION_SOURCE,
  assertExceptionalReleaseRequest,
  canonicalJson,
  createExceptionalReleaseAct,
  exceptionalReleaseRequestHash,
  readExceptionalReleaseRequestFile,
  ttyConfirmationTemplate,
  validateExceptionalReleaseRequestPath,
  validateTtyRiskConfirmations,
  writeExceptionalReleaseActFiles,
} from "./exceptional-release-act.mjs";
import {
  deriveExceptionalReleaseArtifactPaths,
  prepareOrReuseExceptionalReleaseArtifact,
  readExceptionalReleaseArtifactManifest,
} from "./exceptional-release-artifact.mjs";
import {
  deriveExceptionalActIssuancePath,
  prepareExceptionalActIssuance,
  resolveExceptionalActIssuanceStateRoot,
} from "./exceptional-act-issuance.mjs";
import {
  EXCEPTIONAL_RELEASE_EXIT_CODE,
  EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH,
  assertExceptionalOpenReleaseDryRunPlan,
  createExceptionalOpenReleaseDryRunPlan,
  exceptionalReleaseExitCode,
} from "./exceptional-open-release-runner-policy.mjs";
import {
  currentExceptionalRiskGateResults,
  nonWaivableGateResult,
} from "./exceptional-release-state.mjs";
import {
  prepareExceptionalOpenReleaseEnvironment,
  prepareExceptionalWranglerKeyringTransportEnvironment,
} from "./open-release-runner-policy.mjs";
import {
  EVIDENCE_STATUS,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";

const scriptPath = fileURLToPath(import.meta.url);
export const EXCEPTIONAL_OPEN_RELEASE_ROOT = path.resolve(
  path.dirname(scriptPath),
  "..",
);

const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TTY_MAX_LINE_BYTES = 8192;
const MAX_ISSUANCE_BYTES = 8 * 1_024;
const PRODUCTION_RELEASE_CAPABILITY = Symbol("production-release");
const TEST_RELEASE_CAPABILITY = Symbol("test-release");
const TEST_HARNESS_DEPENDENCY_KEYS = Object.freeze(
  [
    "argv",
    "createAct",
    "errorOutput",
    "evaluateGateResults",
    "freezeArtifact",
    "inspectGitState",
    "nodeVersion",
    "now",
    "openTty",
    "output",
    "prepareEnvironment",
    "processEnvironment",
    "readArtifact",
    "readRequest",
    "root",
    "spawn",
    "writeAct",
  ].sort(),
);
const SAFE_PROCESS_ENVIRONMENT_NAMES = Object.freeze([
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
]);

if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("La emisión excepcional exige O_NOFOLLOW.");
}

const ISSUANCE_WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  (fsConstants.O_CLOEXEC ?? 0) |
  fsConstants.O_NOFOLLOW;

export const EXCEPTIONAL_GATE_PASS_REQUIREMENTS = Object.freeze({
  "security.secret-scan": Object.freeze([
    "local-phase-k-gates",
    "exceptional-build-preflight",
  ]),
  "security.worker-secrets-confidential": Object.freeze([
    "local-phase-k-gates",
    "cloudflare-closed-state-read",
    "exceptional-build-preflight",
    "wrangler-version-dry-run",
    "wrangler-crons-dry-run",
  ]),
  "quality.build-and-test-suite": Object.freeze([
    "local-phase-k-gates",
    "exceptional-build-preflight",
  ]),
  "cloudflare.secret-inventory-exact": Object.freeze([
    "cloudflare-closed-state-read",
  ]),
  "cloudflare.known-bindings-only": Object.freeze([
    "cloudflare-closed-state-read",
  ]),
  "cloudflare.domain-config-exact": Object.freeze([
    "cloudflare-closed-state-read",
  ]),
  "cloudflare.known-crons-only": Object.freeze([
    "cloudflare-closed-state-read",
  ]),
  "quality.production-smoke": Object.freeze(["production-closed-smoke-read"]),
  "configuration.no-unknown-release-config": Object.freeze([
    "cloudflare-closed-state-read",
    "exceptional-build-preflight",
    "wrangler-version-dry-run",
    "wrangler-crons-dry-run",
  ]),
  "configuration.ai-disabled": Object.freeze([
    "local-phase-k-gates",
    "cloudflare-closed-state-read",
    "exceptional-build-preflight",
  ]),
  "legal.pending-external-copy-honest": Object.freeze([
    "local-phase-k-gates",
    "exceptional-build-preflight",
  ]),
});

export const EXCEPTIONAL_OPEN_UPDATE_GATE_PASS_REQUIREMENTS = Object.freeze(
  Object.fromEntries(
    Object.entries(EXCEPTIONAL_GATE_PASS_REQUIREMENTS).map(
      ([gateId, steps]) => [
        gateId,
        Object.freeze(
          steps.flatMap((id) => {
            if (id === "cloudflare-closed-state-read")
              return ["cloudflare-open-source-state-read"];
            if (id === "production-closed-smoke-read")
              return ["production-open-source-smoke-read"];
            if (id === "wrangler-crons-dry-run")
              return [
                "wrangler-recovery-version-dry-run",
                "cloudflare-open-source-state-read",
              ];
            if (id === "exceptional-build-preflight")
              return [id, "open-recovery-build-preflight"];
            return [id];
          }),
        ),
      ],
    ),
  ),
);

class ExceptionalRunnerFailure extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

function safeProcessEnvironment(processEnvironment) {
  return Object.fromEntries(
    SAFE_PROCESS_ENVIRONMENT_NAMES.flatMap((name) =>
      typeof processEnvironment[name] === "string"
        ? [[name, processEnvironment[name]]]
        : [],
    ),
  );
}

function safeFailure(exitCode, message) {
  return new ExceptionalRunnerFailure(exitCode, message);
}

function currentUid() {
  if (typeof process.getuid !== "function") {
    throw new Error("No se puede verificar el usuario efectivo.");
  }
  return process.getuid();
}

function assertSafeIssuanceDirectory(directoryPath, label) {
  const metadata = lstatSync(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} debe ser un directorio regular.`);
  }
  if ((metadata.mode & 0o7777) !== 0o700) {
    throw new Error(`${label} debe tener modo 0700 exacto.`);
  }
  if (metadata.uid !== currentUid()) {
    throw new Error(`${label} debe pertenecer al usuario efectivo.`);
  }
  if (realpathSync(directoryPath) !== path.resolve(directoryPath)) {
    throw new Error(`${label} no puede atravesar symlinks.`);
  }
  return metadata;
}

function ensureSafeIssuanceDirectory(directoryPath, label) {
  mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  return assertSafeIssuanceDirectory(directoryPath, label);
}

function assertSafeIssuanceFile(metadata, label) {
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} debe ser un archivo regular.`);
  }
  if ((metadata.mode & 0o7777) !== 0o600) {
    throw new Error(`${label} debe tener modo 0600 exacto.`);
  }
  if (metadata.uid !== currentUid()) {
    throw new Error(`${label} debe pertenecer al usuario efectivo.`);
  }
  if (metadata.nlink !== 1) {
    throw new Error(`${label} no puede tener hard links.`);
  }
  if (metadata.size < 1 || metadata.size > MAX_ISSUANCE_BYTES) {
    throw new Error(`${label} está vacío o excede el límite.`);
  }
}

function sameFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function fsyncDirectory(directoryPath) {
  const descriptor = openSync(
    directoryPath,
    fsConstants.O_RDONLY |
      (fsConstants.O_DIRECTORY ?? 0) |
      (fsConstants.O_CLOEXEC ?? 0) |
      fsConstants.O_NOFOLLOW,
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeAll(descriptor, source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(
      descriptor,
      buffer,
      offset,
      buffer.length - offset,
    );
    if (written < 1) throw new Error("No se pudo persistir el issuance.");
    offset += written;
  }
}

function issueExceptionalActCanonical({
  requestPath,
  request,
  act,
  artifactManifest,
} = {}) {
  const issuance = prepareExceptionalActIssuance({
    requestPath,
    request,
    act,
    artifactManifest,
  });
  const stateRoot = resolveExceptionalActIssuanceStateRoot();
  ensureSafeIssuanceDirectory(stateRoot, "El state root excepcional");
  const issuedRoot = path.join(stateRoot, "issued");
  ensureSafeIssuanceDirectory(issuedRoot, "El directorio de issuance");
  fsyncDirectory(stateRoot);
  const issuancePath = deriveExceptionalActIssuancePath({
    stateRoot,
    requestHash: issuance.requestHash,
  });
  const source = canonicalJson(issuance);
  if (
    Buffer.byteLength(source) < 1 ||
    Buffer.byteLength(source) > MAX_ISSUANCE_BYTES
  ) {
    throw new Error("El issuance está vacío o excede el límite.");
  }
  let descriptor = null;
  let openedMetadata;
  try {
    descriptor = openSync(issuancePath, ISSUANCE_WRITE_FLAGS, 0o600);
    fchmodSync(descriptor, 0o600);
    writeAll(descriptor, source);
    fsyncSync(descriptor);
    openedMetadata = fstatSync(descriptor);
    assertSafeIssuanceFile(openedMetadata, "El issuance abierto");
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
  const finalMetadata = lstatSync(issuancePath);
  assertSafeIssuanceFile(finalMetadata, "El issuance final");
  if (!sameFileIdentity(openedMetadata, finalMetadata)) {
    throw new Error("El issuance fue sustituido antes de quedar durable.");
  }
  fsyncDirectory(issuedRoot);
  return Object.freeze({ issuance, issuancePath });
}

function simulateExceptionalActIssuanceForTest({ act } = {}) {
  if (
    !FULL_HEAD_PATTERN.test(act?.head ?? "") ||
    !SHA256_PATTERN.test(act?.contentSha256 ?? "")
  ) {
    throw new Error("El fixture de issuance recibió un acta inválida.");
  }
  return Object.freeze({
    issuancePath: `[test-only:no-issuance-written:${act.contentSha256}]`,
    issuance: Object.freeze({ actHash: act.contentSha256 }),
  });
}

export function parseExceptionalOpenReleaseArguments(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 2 ||
    argv[0] !== "--request" ||
    typeof argv[1] !== "string" ||
    argv[1].length === 0
  ) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
      "Uso: node scripts/run-exceptional-open-release.mjs --request <ruta-absoluta.json>",
    );
  }
  return Object.freeze({ requestPath: argv[1] });
}

export function assertExceptionalOpenReleaseNode(
  version = process.versions.node,
) {
  if (version !== "22.22.0") {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      `El runner excepcional exige Node 22.22.0; detectado ${JSON.stringify(version)}.`,
    );
  }
}

function successfulSpawnResult(result) {
  return result && !result.error && !result.signal && result.status === 0;
}

function childExitCode(result) {
  if (
    Number.isSafeInteger(result?.status) &&
    result.status >= 0 &&
    result.status <= 255
  ) {
    return result.status;
  }
  // No se inventa el status del hijo: 254 identifica una señal y 255 un
  // error de spawn/resultado inválido. El runner padre siempre termina en 1.
  return result?.signal ? 254 : 255;
}

export function assertExceptionalWranglerEmptyEnvironmentFile({
  root = EXCEPTIONAL_OPEN_RELEASE_ROOT,
} = {}) {
  const filePath = path.join(
    root,
    EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH,
  );
  try {
    const stats = lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== 0) {
      throw new Error("Archivo no vacío o no regular.");
    }
    const expectedRealPath = path.join(
      realpathSync(root),
      EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH,
    );
    if (realpathSync(filePath) !== expectedRealPath) {
      throw new Error("Ruta real inesperada.");
    }
    const source = readFileSync(filePath);
    try {
      if (source.byteLength !== 0) throw new Error("Archivo no vacío.");
    } finally {
      source.fill(0);
    }
  } catch {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "El --env-file excepcional de Wrangler debe ser el archivo regular versionado y deliberadamente vacío.",
    );
  }
  return filePath;
}

export function inspectExceptionalReleaseGitState({
  root = EXCEPTIONAL_OPEN_RELEASE_ROOT,
  spawn = spawnSync,
  processEnvironment = process.env,
} = {}) {
  const environment = safeProcessEnvironment(processEnvironment);
  const options = Object.freeze({
    cwd: root,
    encoding: "utf8",
    env: environment,
    shell: false,
    stdio: Object.freeze(["ignore", "pipe", "pipe"]),
  });
  const headResult = spawn("git", ["rev-parse", "--verify", "HEAD"], options);
  if (!successfulSpawnResult(headResult)) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "No se pudo resolver el HEAD de Git.",
    );
  }
  const head = String(headResult.stdout ?? "").trim();
  if (!FULL_HEAD_PATTERN.test(head)) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "Git no devolvió un HEAD completo válido.",
    );
  }
  const statusResult = spawn(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    options,
  );
  if (!successfulSpawnResult(statusResult)) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "No se pudo verificar el worktree de Git.",
    );
  }
  return Object.freeze({
    head,
    clean: String(statusResult.stdout ?? "").length === 0,
  });
}

function readTtyLine(fileDescriptor) {
  const bytes = [];
  const byte = Buffer.alloc(1);
  try {
    while (bytes.length <= TTY_MAX_LINE_BYTES) {
      const count = readSync(fileDescriptor, byte, 0, 1, null);
      if (count !== 1 || byte[0] === 10 || byte[0] === 13) break;
      bytes.push(byte[0]);
    }
  } finally {
    byte.fill(0);
  }
  if (bytes.length > TTY_MAX_LINE_BYTES) {
    bytes.fill(0);
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
      "La entrada de /dev/tty excede el máximo permitido.",
    );
  }
  const buffer = Buffer.from(bytes);
  bytes.fill(0);
  const value = buffer.toString("utf8");
  buffer.fill(0);
  return value;
}

export function openExceptionalReleaseTty() {
  let fileDescriptor;
  try {
    fileDescriptor = openSync("/dev/tty", "r+");
  } catch {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
      "Las confirmaciones exigen una terminal interactiva /dev/tty.",
    );
  }
  let closed = false;
  return Object.freeze({
    showRisk({ gateId, consequence } = {}) {
      if (
        closed ||
        typeof gateId !== "string" ||
        typeof consequence !== "string" ||
        consequence.length === 0
      ) {
        throw safeFailure(
          EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
          "No se pudo mostrar la consecuencia canónica del riesgo.",
        );
      }
      writeSync(
        fileDescriptor,
        `\nGate: ${gateId}\nConsecuencia canónica aceptada:\n${consequence}\n`,
      );
    },
    readLine({ prompt } = {}) {
      if (closed) {
        throw safeFailure(
          EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
          "La terminal de confirmación ya está cerrada.",
        );
      }
      if (typeof prompt !== "string" || prompt.length === 0) {
        throw safeFailure(
          EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
          "El prompt de /dev/tty es inválido.",
        );
      }
      writeSync(fileDescriptor, `Escribí exactamente:\n${prompt}\n> `);
      return readTtyLine(fileDescriptor);
    },
    close() {
      if (closed) return;
      closeSync(fileDescriptor);
      closed = true;
    },
  });
}

export function collectExceptionalRiskConfirmations({ request, tty } = {}) {
  if (
    !tty ||
    typeof tty.showRisk !== "function" ||
    typeof tty.readLine !== "function"
  ) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
      "No existe un lector /dev/tty válido para las confirmaciones.",
    );
  }
  const riskById = new Map(request.risks.map((risk) => [risk.gateId, risk]));
  const confirmations = ttyConfirmationTemplate(request).map((template) => {
    const risk = riskById.get(template.gateId);
    tty.showRisk({
      gateId: template.gateId,
      consequence: risk.acceptedConsequence,
    });
    for (const expectedStatement of template.statements) {
      const entered = tty.readLine({
        prompt: expectedStatement,
      });
      if (entered !== expectedStatement) {
        throw safeFailure(
          EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
          `Confirmación individual inválida para ${template.gateId}.`,
        );
      }
    }
    return Object.freeze({
      gateId: template.gateId,
      source: TTY_CONFIRMATION_SOURCE,
      statements: template.statements,
    });
  });
  const errors = validateTtyRiskConfirmations({ request, confirmations });
  if (errors.length > 0) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
      "Las confirmaciones individuales no coinciden con el request.",
    );
  }
  return Object.freeze(confirmations);
}

export function evaluateExceptionalGateResults({ execution } = {}) {
  const passedSteps = new Set(
    Array.isArray(execution?.commands)
      ? execution.commands
          .filter(({ exitCode }) => exitCode === 0)
          .map(({ label }) => label)
      : [],
  );
  const riskById = new Map(
    currentExceptionalRiskGateResults().map((result) => [
      result.gateId,
      result,
    ]),
  );
  const nonWaivableById = new Map(
    NON_WAIVABLE_SECURITY_GATE_IDS.map((gateId) => {
      const requirements = (
        execution?.releaseMode === "OPEN_UPDATE"
          ? EXCEPTIONAL_OPEN_UPDATE_GATE_PASS_REQUIREMENTS
          : EXCEPTIONAL_GATE_PASS_REQUIREMENTS
      )[gateId];
      const certificateGate =
        execution?.openUpdateEvidenceCertificate?.nonWaivableEvidenceReceipt?.gates?.find(
          (gate) => gate.gateId === gateId,
        );
      const certified =
        execution?.releaseMode === "OPEN_UPDATE" &&
        execution.completed === true &&
        execution.openUpdateEvidenceCertificate?.promotionAllowed === true &&
        certificateGate?.evidenceStatus === EVIDENCE_STATUS.PASS &&
        certificateGate?.rawResult === RAW_RESULT.PASS;
      const passed =
        execution?.releaseMode === "OPEN_UPDATE"
          ? certified &&
            (!requirements ||
              requirements.every((stepId) => passedSteps.has(stepId)))
          : Array.isArray(requirements) &&
            requirements.length > 0 &&
            requirements.every((stepId) => passedSteps.has(stepId));
      return [
        gateId,
        nonWaivableGateResult(gateId, {
          passed,
          failureEvidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
        }),
      ];
    }),
  );
  return Object.freeze(
    RELEASE_GATE_POLICY.gates.map(
      ({ id }) => riskById.get(id) ?? nonWaivableById.get(id),
    ),
  );
}

export function nonWaivableExceptionalGateBlockers(gateResults) {
  if (!Array.isArray(gateResults)) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "Los resultados de gates no tienen una estructura válida.",
    );
  }
  const byId = new Map(gateResults.map((result) => [result.gateId, result]));
  return Object.freeze(
    NON_WAIVABLE_SECURITY_GATE_IDS.flatMap((gateId) => {
      const result = byId.get(gateId);
      return result?.evidenceStatus === EVIDENCE_STATUS.PASS &&
        result.rawResult === RAW_RESULT.PASS
        ? []
        : [
            Object.freeze({
              gateId,
              evidenceStatus:
                result?.evidenceStatus ?? EVIDENCE_STATUS.NOT_VERIFIED,
              rawResult: result?.rawResult ?? RAW_RESULT.FAIL,
            }),
          ];
    }),
  );
}

export function renderExceptionalGateMatrixLines(gateResults) {
  if (!Array.isArray(gateResults)) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "Los resultados de gates no tienen una estructura válida.",
    );
  }
  const byId = new Map(gateResults.map((result) => [result.gateId, result]));
  return Object.freeze(
    RELEASE_GATE_POLICY.gates.map(({ id }) => {
      const definition = getReleaseGateDefinition(id);
      const result = byId.get(id) ?? {
        evidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
        rawResult: RAW_RESULT.FAIL,
      };
      const disposition =
        result.evidenceStatus === EVIDENCE_STATUS.PASS &&
        result.rawResult === RAW_RESULT.PASS
          ? RELEASE_DISPOSITION.PASS
          : RELEASE_DISPOSITION.STOP;
      return `${id}: evidenceStatus=${result.evidenceStatus}; rawResult=${result.rawResult}; gatePolicy=${definition.gatePolicy}; releaseDisposition=${disposition}`;
    }),
  );
}

export function executeExceptionalOpenReleasePlan({
  root = EXCEPTIONAL_OPEN_RELEASE_ROOT,
  requestPath,
  request,
  currentHead,
  nonSecretEnvironment,
  wranglerKeyringTransportEnvironment,
  spawn = spawnSync,
  freezeArtifact = prepareOrReuseExceptionalReleaseArtifact,
  readArtifact = readExceptionalReleaseArtifactManifest,
  now = new Date(),
} = {}) {
  if (
    !nonSecretEnvironment ||
    typeof nonSecretEnvironment !== "object" ||
    Array.isArray(nonSecretEnvironment) ||
    Object.entries(nonSecretEnvironment).some(
      ([name, value]) => name.length === 0 || typeof value !== "string",
    )
  ) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "El entorno no secreto no tiene una estructura válida.",
    );
  }
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SECRET",
    "CRON_SECRET",
  ]) {
    if (Object.hasOwn(nonSecretEnvironment ?? {}, name)) {
      throw safeFailure(
        EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
        "El entorno no secreto contiene una clave reservada.",
      );
    }
  }
  const openUpdate = request.releaseMode === "OPEN_UPDATE";
  const environment = Object.freeze({ ...nonSecretEnvironment });
  const keyringTransportEnvironment =
    prepareExceptionalWranglerKeyringTransportEnvironment({
      processEnvironment: wranglerKeyringTransportEnvironment,
    });
  const cloudflareAuditEnvironment = Object.freeze({
    ...environment,
    ...keyringTransportEnvironment,
  });
  assertExceptionalWranglerEmptyEnvironmentFile({ root });
  const plan = createExceptionalOpenReleaseDryRunPlan({
    root,
    requestPath,
    nodeExecutable: process.execPath,
    releaseMode: request.releaseMode,
  });
  assertExceptionalOpenReleaseDryRunPlan({
    root,
    requestPath,
    plan,
    nodeExecutable: process.execPath,
    releaseMode: request.releaseMode,
  });

  const commands = [];
  const failedStepIds = [];
  const failedSteps = [];
  const requestHash = exceptionalReleaseRequestHash(request);
  let frozenArtifact = null;
  let frozenRecovery = null;

  const verifyFrozenArtifact = (artifactPurpose = "primary") => {
    const frozen =
      artifactPurpose === "recovery" ? frozenRecovery : frozenArtifact;
    if (!frozen) {
      throw new Error("El artifact excepcional todavía no fue congelado.");
    }
    const manifest = readArtifact({
      requestPath,
      artifactPurpose,
      worktreeRoot: root,
      expectedHead: currentHead,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: requestHash,
      expectedArtifactHash: frozen.artifactHash,
    });
    if (
      !manifest ||
      manifest.contentSha256 !== frozen.artifactHash ||
      manifest.head !== currentHead ||
      manifest.requestHash !== requestHash
    ) {
      throw new Error("El artifact congelado no coincide con sus bindings.");
    }
    return manifest;
  };

  for (const step of plan) {
    const closedStateFailed =
      step.id ===
        (openUpdate
          ? "production-open-source-smoke-read"
          : "production-closed-smoke-read") &&
      commands.find(
        ({ label }) =>
          label ===
          (openUpdate
            ? "cloudflare-open-source-state-read"
            : "cloudflare-closed-state-read"),
      )?.exitCode !== 0;
    const artifactPurpose =
      step.id === "wrangler-recovery-version-dry-run" ? "recovery" : "primary";
    const isWranglerDryRun = step.id.startsWith("wrangler-");
    const priorStepFailed =
      isWranglerDryRun && commands.some(({ exitCode }) => exitCode !== 0);
    let artifactPrerequisiteFailed = false;
    let result = null;
    if (!closedStateFailed && !priorStepFailed) {
      try {
        if (
          [
            "wrangler-version-dry-run",
            "wrangler-recovery-version-dry-run",
          ].includes(step.id)
        ) {
          const { artifactRoot: currentArtifactRoot } =
            deriveExceptionalReleaseArtifactPaths(requestPath, {
              artifactPurpose,
            });
          try {
            rmSync(path.join(currentArtifactRoot, ".wrangler"), {
              recursive: true,
              force: true,
            });
          } catch {}
          const frozen = freezeArtifact({
            repositoryRoot: root,
            artifactPurpose,
            requestPath,
            head: currentHead,
            policyVersion: RELEASE_GATE_POLICY_VERSION,
            policyHash: RELEASE_GATE_POLICY_SHA256,
            requestHash,
            now,
          });
          if (artifactPurpose === "recovery") frozenRecovery = frozen;
          else frozenArtifact = frozen;
        }
        if (isWranglerDryRun) verifyFrozenArtifact(artifactPurpose);
        result = spawn(step.command, step.arguments, {
          cwd: root,
          env: [
            "cloudflare-closed-state-read",
            "cloudflare-open-source-state-read",
            "production-open-source-smoke-read",
          ].includes(step.id)
            ? cloudflareAuditEnvironment
            : environment,
          shell: false,
          stdio: "inherit",
        });
        if (isWranglerDryRun && successfulSpawnResult(result)) {
          const currentFrozen =
            artifactPurpose === "recovery" ? frozenRecovery : frozenArtifact;
          if (currentFrozen?.artifactRoot) {
            try {
              rmSync(path.join(currentFrozen.artifactRoot, ".wrangler"), {
                recursive: true,
                force: true,
              });
            } catch {}
          }
          verifyFrozenArtifact(artifactPurpose);
        }
      } catch {
        artifactPrerequisiteFailed = isWranglerDryRun;
      }
    }
    // 125 es un estado interno saneado de "no ejecutado": nunca se envía un
    // POST de smoke si el GET-only previo no acreditó el perfil cerrado.
    const skipped =
      closedStateFailed || priorStepFailed || artifactPrerequisiteFailed;
    const exitCode = skipped ? 125 : childExitCode(result);
    commands.push(Object.freeze({ label: step.id, exitCode }));
    if (exitCode !== 0) {
      failedStepIds.push(step.id);
      failedSteps.push(
        Object.freeze({
          label: step.id,
          exitCode,
          reason: closedStateFailed
            ? "closed-state-prerequisite"
            : priorStepFailed
              ? "prior-step-prerequisite"
              : artifactPrerequisiteFailed
                ? "artifact-prerequisite"
                : "child",
        }),
      );
    }
  }
  let artifactManifest = null;
  if (frozenArtifact && failedStepIds.length === 0) {
    artifactManifest = verifyFrozenArtifact();
  }
  const openUpdateEvidenceCertificate =
    openUpdate && artifactManifest && failedStepIds.length === 0
      ? readOpenUpdateEvidenceFile({
          requestPath,
          worktreeRoot: root,
          request,
          artifactManifest,
          now,
          requirePromotionReady: true,
        })
      : null;
  return Object.freeze({
    ...(openUpdate
      ? {
          releaseMode: "OPEN_UPDATE",
          openSourceBaselineSha256: request.openSourceBaselineSha256,
          recoveryArtifactHash: frozenRecovery?.artifactHash ?? null,
          openUpdateEvidenceCertificate,
          openUpdateEvidenceHash:
            openUpdateEvidenceCertificate?.contentSha256 ?? null,
        }
      : {}),
    completed: failedStepIds.length === 0,
    commands: Object.freeze(commands),
    failedStepId: failedStepIds[0] ?? null,
    failedStepIds: Object.freeze(failedStepIds),
    failedSteps: Object.freeze(failedSteps),
    artifactHash: frozenArtifact?.artifactHash ?? null,
    artifactManifest,
    artifactRoot: frozenArtifact?.artifactRoot ?? null,
    manifestPath: frozenArtifact?.manifestPath ?? null,
    requestHash,
  });
}

function currentDate(now) {
  const value = typeof now === "function" ? now() : null;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw safeFailure(
      EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
      "El reloj del runner no devolvió una fecha válida.",
    );
  }
  return date;
}

export function exceptionalRiskRequestBlockers({ request, gateResults } = {}) {
  if (
    !request ||
    !Array.isArray(request.risks) ||
    !Array.isArray(gateResults)
  ) {
    return Object.freeze(["Request o resultados de riesgo inválidos."]);
  }
  const requestedById = new Map(
    request.risks.map((risk) => [risk.gateId, risk]),
  );
  const resultById = new Map(
    gateResults.map((result) => [result.gateId, result]),
  );
  const blockers = [];
  for (const gateId of OWNER_WAIVER_CANDIDATE_GATE_IDS) {
    const result = resultById.get(gateId);
    const requested = requestedById.get(gateId);
    const passed =
      result?.evidenceStatus === EVIDENCE_STATUS.PASS &&
      result?.rawResult === RAW_RESULT.PASS;
    if (!result) {
      blockers.push(`${gateId} no tiene resultado factual.`);
    } else if (passed && requested) {
      blockers.push(`${gateId} ya es PASS y no admite aceptación de riesgo.`);
    } else if (!passed && !requested) {
      blockers.push(`${gateId} permanece STOP sin aceptación individual.`);
    } else if (
      requested &&
      (requested.evidenceStatus !== result.evidenceStatus ||
        requested.rawResult !== result.rawResult)
    ) {
      blockers.push(`${gateId} no conserva el resultado factual original.`);
    }
  }
  return Object.freeze(blockers);
}

function assertExplicitTestHarnessDependencies(dependencies) {
  if (
    !dependencies ||
    typeof dependencies !== "object" ||
    Array.isArray(dependencies) ||
    JSON.stringify(Object.keys(dependencies).sort()) !==
      JSON.stringify(TEST_HARNESS_DEPENDENCY_KEYS)
  ) {
    throw new TypeError(
      "El harness de tests exige todas las dependencias explícitas y ninguna adicional.",
    );
  }
  for (const name of [
    "createAct",
    "errorOutput",
    "evaluateGateResults",
    "freezeArtifact",
    "inspectGitState",
    "now",
    "openTty",
    "output",
    "prepareEnvironment",
    "readArtifact",
    "readRequest",
    "spawn",
    "writeAct",
  ]) {
    if (typeof dependencies[name] !== "function") {
      throw new TypeError(`La dependencia ${name} debe ser una función.`);
    }
  }
  return Object.freeze({ ...dependencies });
}

function runExceptionalOpenRelease(capability, dependencies) {
  if (
    capability !== PRODUCTION_RELEASE_CAPABILITY &&
    capability !== TEST_RELEASE_CAPABILITY
  ) {
    throw new TypeError("Capability excepcional inválida.");
  }
  const {
    argv,
    nodeVersion,
    root,
    processEnvironment,
    now,
    spawn,
    inspectGitState,
    readRequest,
    prepareEnvironment,
    evaluateGateResults,
    openTty,
    createAct,
    writeAct,
    issueAct,
    freezeArtifact,
    readArtifact,
    output,
    errorOutput,
  } = dependencies;
  let requestPath;
  try {
    ({ requestPath } = parseExceptionalOpenReleaseArguments(argv));
    assertExceptionalOpenReleaseNode(nodeVersion);
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : "Runner inválido.");
    return error instanceof ExceptionalRunnerFailure
      ? error.exitCode
      : EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  let initialGitState;
  try {
    initialGitState = inspectGitState({
      root,
      spawn,
      processEnvironment,
    });
    if (
      !initialGitState ||
      !FULL_HEAD_PATTERN.test(initialGitState.head ?? "") ||
      initialGitState.clean !== true
    ) {
      throw safeFailure(
        EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
        "El worktree debe estar totalmente limpio antes de leer el request.",
      );
    }
  } catch (error) {
    errorOutput(
      error instanceof ExceptionalRunnerFailure
        ? error.message
        : "No se pudo validar HEAD/worktree.",
    );
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  let request;
  try {
    const pathErrors = validateExceptionalReleaseRequestPath({
      requestPath,
      worktreeRoot: root,
    });
    if (pathErrors.length > 0) throw new Error("Ruta inválida.");
    const requestNow = currentDate(now);
    request = readRequest({
      requestPath,
      worktreeRoot: root,
      currentHead: initialGitState.head,
      now: requestNow,
    });
    assertExceptionalReleaseRequest(request, {
      currentHead: initialGitState.head,
      now: requestNow,
    });
  } catch {
    errorOutput("Request excepcional inválido, stale o con ruta no permitida.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST;
  }

  let nonSecretEnvironment;
  let wranglerKeyringTransportEnvironment;
  try {
    nonSecretEnvironment = prepareEnvironment({
      acceptedRiskGateIds: request.risks.map(({ gateId }) => gateId),
      processEnvironment,
    });
    wranglerKeyringTransportEnvironment =
      prepareExceptionalWranglerKeyringTransportEnvironment({
        processEnvironment,
      });
  } catch {
    errorOutput("Los gates de entorno excepcional permanecen bloqueados.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  let execution;
  try {
    const executionNow = currentDate(now);
    execution = executeExceptionalOpenReleasePlan({
      root,
      requestPath,
      request,
      currentHead: initialGitState.head,
      nonSecretEnvironment,
      wranglerKeyringTransportEnvironment,
      spawn,
      freezeArtifact,
      readArtifact,
      now: executionNow,
    });
  } catch {
    errorOutput("El plan dry-run excepcional es inválido o quedó bloqueado.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }
  let finalGitState;
  try {
    finalGitState = inspectGitState({
      root,
      spawn,
      processEnvironment,
    });
    if (
      !finalGitState ||
      finalGitState.clean !== true ||
      finalGitState.head !== initialGitState.head
    ) {
      throw new Error("Git cambió.");
    }
  } catch {
    errorOutput(
      "HEAD/worktree cambió durante el dry-run; el acta fue bloqueada.",
    );
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  let gateResults;
  let nonWaivableBlockers;
  let riskRequestBlockers;
  try {
    gateResults = evaluateGateResults({
      execution,
      initialGitState,
      finalGitState,
    });
    nonWaivableBlockers = nonWaivableExceptionalGateBlockers(gateResults);
    riskRequestBlockers = exceptionalRiskRequestBlockers({
      request,
      gateResults,
    });
  } catch {
    errorOutput("No se pudo construir la matriz factual completa de gates.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }
  output("Matriz factual de gates antes de cualquier aceptación:");
  for (const line of renderExceptionalGateMatrixLines(gateResults)) {
    output(`  - ${line}`);
  }
  if (!execution.completed) {
    errorOutput("Pasos dry-run con resultado no exitoso:");
    for (const failedStep of execution.failedSteps ?? []) {
      errorOutput(
        `  - ${failedStep.label}: exitCode=${failedStep.exitCode}; reason=${failedStep.reason}`,
      );
    }
  }
  if (riskRequestBlockers.length > 0) {
    errorOutput("Riesgos elegibles sin una decisión individual válida:");
    for (const blocker of riskRequestBlockers) errorOutput(`  - ${blocker}`);
  }
  if (nonWaivableBlockers.length > 0) {
    errorOutput("Gates no renunciables sin PASS real:");
    for (const blocker of nonWaivableBlockers) {
      errorOutput(
        `  - ${blocker.gateId}: evidenceStatus=${blocker.evidenceStatus}; rawResult=${blocker.rawResult}; releaseDisposition=STOP`,
      );
    }
  }
  if (
    !execution.completed ||
    riskRequestBlockers.length > 0 ||
    nonWaivableBlockers.length > 0
  ) {
    errorOutput("Release excepcional: BLOQUEADO; no se emitió acta.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  let tty;
  let confirmations = Object.freeze([]);
  let confirmationFailure = null;
  let ttyCloseFailed = false;
  try {
    if (request.risks.length > 0) {
      tty = openTty({ spawn, processEnvironment: nonSecretEnvironment });
      confirmations = collectExceptionalRiskConfirmations({ request, tty });
    }
  } catch (error) {
    confirmationFailure = error;
  } finally {
    try {
      tty?.close?.();
    } catch {
      ttyCloseFailed = true;
    }
  }
  if (confirmationFailure) {
    errorOutput(
      confirmationFailure instanceof ExceptionalRunnerFailure
        ? confirmationFailure.message
        : "No se pudieron validar las confirmaciones individuales.",
    );
    return confirmationFailure instanceof ExceptionalRunnerFailure
      ? confirmationFailure.exitCode
      : EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST;
  }
  if (ttyCloseFailed) {
    errorOutput("No se pudo cerrar /dev/tty de forma segura.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST;
  }

  try {
    const postConfirmationGitState = inspectGitState({
      root,
      spawn,
      processEnvironment,
    });
    if (
      !postConfirmationGitState ||
      postConfirmationGitState.clean !== true ||
      postConfirmationGitState.head !== initialGitState.head
    ) {
      throw new Error("Git cambió.");
    }
    const verifiedManifest = readArtifact({
      requestPath,
      worktreeRoot: root,
      expectedHead: initialGitState.head,
      expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
      expectedPolicyHash: RELEASE_GATE_POLICY_SHA256,
      expectedRequestHash: execution.requestHash,
      expectedArtifactHash: execution.artifactHash,
    });
    if (
      verifiedManifest?.contentSha256 !== execution.artifactHash ||
      verifiedManifest?.requestHash !== execution.requestHash
    ) {
      throw new Error("Artifact cambió.");
    }
  } catch {
    errorOutput(
      "HEAD/worktree/artifact cambió durante las confirmaciones; el acta fue bloqueada.",
    );
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  const acceptedRiskCount = request.risks.length;
  let actNow;
  try {
    actNow = currentDate(now);
    assertExceptionalReleaseRequest(request, {
      currentHead: initialGitState.head,
      now: actNow,
    });
  } catch {
    errorOutput("El request quedó stale o inválido antes de emitir el acta.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST;
  }

  let act;
  try {
    if (request.releaseMode === "OPEN_UPDATE")
      readOpenUpdateEvidenceFile({
        requestPath,
        worktreeRoot: root,
        request,
        artifactManifest: execution.artifactManifest,
        expectedCertificateHash: execution.openUpdateEvidenceHash,
        now: actNow,
        requirePromotionReady: true,
      });
    act = createAct({
      request,
      currentHead: initialGitState.head,
      artifactHash: execution.artifactHash,
      ...(request.releaseMode === "OPEN_UPDATE"
        ? { openUpdateEvidenceHash: execution.openUpdateEvidenceHash }
        : {}),
      gateResults,
      confirmations,
      commands: execution.commands,
      now: actNow,
    });
  } catch {
    errorOutput("Los resultados de gates no permiten crear el acta.");
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }

  let written;
  let issued;
  try {
    written = writeAct({
      requestPath,
      worktreeRoot: root,
      act,
    });
    if (
      !written ||
      typeof written.jsonPath !== "string" ||
      typeof written.markdownPath !== "string"
    ) {
      throw new Error("Resultado de escritura inválido.");
    }
    issued = issueAct({
      requestPath,
      request,
      act,
      artifactManifest: execution.artifactManifest,
    });
    if (
      !issued ||
      typeof issued.issuancePath !== "string" ||
      issued.issuance?.actHash !== act.contentSha256
    ) {
      throw new Error("Resultado de issuance inválido.");
    }
  } catch {
    errorOutput(
      "No se pudo escribir y emitir el acta canónica sin sobrescrituras.",
    );
    return EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST;
  }

  output(`Acta JSON: ${written.jsonPath}`);
  output(`Acta Markdown: ${written.markdownPath}`);
  output(`Issuance: ${issued.issuancePath}`);
  output(`Request hash: ${execution.requestHash}`);
  output(`Policy hash: ${RELEASE_GATE_POLICY_SHA256}`);
  output(`Artifact hash: ${execution.artifactHash}`);
  output(`Act hash: ${act.contentSha256}`);
  const exitCode = exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: true,
    acceptedRiskCount,
  });
  if (exitCode === EXCEPTIONAL_RELEASE_EXIT_CODE.RISK_ACCEPTED_BY_OWNER) {
    output("ESTO NO ES PASS");
  }
  return exitCode;
}

export function runExceptionalOpenReleaseTestHarness(dependencies) {
  return runExceptionalOpenRelease(
    TEST_RELEASE_CAPABILITY,
    Object.freeze({
      ...assertExplicitTestHarnessDependencies(dependencies),
      issueAct: simulateExceptionalActIssuanceForTest,
    }),
  );
}

function runExceptionalOpenReleaseProduction() {
  return runExceptionalOpenRelease(
    PRODUCTION_RELEASE_CAPABILITY,
    Object.freeze({
      argv: process.argv.slice(2),
      nodeVersion: process.versions.node,
      root: EXCEPTIONAL_OPEN_RELEASE_ROOT,
      processEnvironment: process.env,
      now: () => new Date(),
      spawn: spawnSync,
      inspectGitState: inspectExceptionalReleaseGitState,
      readRequest: readExceptionalReleaseRequestFile,
      prepareEnvironment: prepareExceptionalOpenReleaseEnvironment,
      evaluateGateResults: evaluateExceptionalGateResults,
      openTty: openExceptionalReleaseTty,
      createAct: createExceptionalReleaseAct,
      writeAct: writeExceptionalReleaseActFiles,
      issueAct: issueExceptionalActCanonical,
      freezeArtifact: prepareOrReuseExceptionalReleaseArtifact,
      readArtifact: readExceptionalReleaseArtifactManifest,
      output: console.log,
      errorOutput: console.error,
    }),
  );
}

const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === scriptPath;

if (isMain) {
  process.exitCode = runExceptionalOpenReleaseProduction();
}
