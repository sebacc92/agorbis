import path from "node:path";
import { deriveExceptionalReleaseArtifactPaths } from "./exceptional-release-artifact.mjs";

export const EXCEPTIONAL_RELEASE_EXIT_CODE = Object.freeze({
  TECHNICAL_PASS: 0,
  BLOCKED: 1,
  INVALID_REQUEST: 2,
  RISK_ACCEPTED_BY_OWNER: 20,
});

export const SENSITIVE_CONSENT_0059_GATE_ID =
  "legal.sensitive-consent-0059-omitted";
export const EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH =
  "scripts/exceptional-release-empty.env";

const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const GATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const FORBIDDEN_EXECUTABLES = new Set([
  "bash",
  "curl",
  "dig",
  "nslookup",
  "powershell",
  "psql",
  "sh",
  "supabase",
  "wget",
  "wrangler2",
]);

export const EXCEPTIONAL_RELEASE_STEP_IDS = Object.freeze([
  "local-phase-k-gates",
  "cloudflare-closed-state-read",
  "production-closed-smoke-read",
  "exceptional-build-preflight",
  "wrangler-version-dry-run",
  "wrangler-crons-dry-run",
]);

export const EXCEPTIONAL_OPEN_UPDATE_STEP_IDS = Object.freeze([
  "local-phase-k-gates",
  "cloudflare-open-source-state-read",
  "production-open-source-smoke-read",
  "open-recovery-build-preflight",
  "wrangler-recovery-version-dry-run",
  "exceptional-build-preflight",
  "wrangler-version-dry-run",
]);

function executableName(command) {
  const basename = path.basename(command ?? "").toLowerCase();
  return basename.replace(/\.(?:cmd|exe)$/, "");
}

function wranglerArguments(step) {
  if (!isPlainObject(step) || !Array.isArray(step.arguments)) return null;
  const directName = executableName(step.command);
  if (directName === "wrangler") return step.arguments;
  if (
    directName === "node" &&
    typeof step.arguments[0] === "string" &&
    step.arguments[0].endsWith("/node_modules/wrangler/bin/wrangler.js")
  ) {
    return step.arguments.slice(1);
  }
  return null;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateRootAndRequest(root, requestPath) {
  const errors = [];
  if (typeof root !== "string" || !path.isAbsolute(root)) {
    errors.push("root debe ser una ruta absoluta.");
  }
  if (typeof requestPath !== "string" || !path.isAbsolute(requestPath)) {
    errors.push("requestPath debe ser una ruta absoluta.");
  }
  return errors;
}

function immutableStep(step) {
  return Object.freeze({
    ...step,
    arguments: Object.freeze([...step.arguments]),
  });
}

function expectedPlan({ root, requestPath, nodeExecutable, releaseMode }) {
  if (releaseMode === "OPEN_UPDATE")
    return expectedOpenUpdatePlan({ root, requestPath, nodeExecutable });
  if (releaseMode !== undefined)
    throw new Error("Perfil de release desconocido.");
  const { artifactRoot } = deriveExceptionalReleaseArtifactPaths(requestPath);
  const wranglerEntrypoint = path.join(
    root,
    "node_modules/wrangler/bin/wrangler.js",
  );
  const emptyEnvironmentPath = path.join(
    artifactRoot,
    "exceptional-release-empty.env",
  );
  return [
    {
      id: EXCEPTIONAL_RELEASE_STEP_IDS[0],
      command: nodeExecutable,
      arguments: [
        path.join(root, "scripts/run-exceptional-release-local-gates.mjs"),
      ],
      shell: false,
    },
    {
      id: EXCEPTIONAL_RELEASE_STEP_IDS[1],
      command: nodeExecutable,
      arguments: [
        path.join(root, "scripts/cloudflare-closed-state.mjs"),
        "--phase",
        "custom-domains",
        "--secret-stage",
        "complete",
      ],
      shell: false,
    },
    {
      id: EXCEPTIONAL_RELEASE_STEP_IDS[2],
      command: nodeExecutable,
      arguments: [path.join(root, "scripts/cloudflare-closed-smoke.mjs")],
      shell: false,
    },
    {
      id: EXCEPTIONAL_RELEASE_STEP_IDS[3],
      command: nodeExecutable,
      arguments: [
        path.join(root, "scripts/cloudflare-build.mjs"),
        "--exceptional-request",
        requestPath,
      ],
      shell: false,
    },
    {
      id: EXCEPTIONAL_RELEASE_STEP_IDS[4],
      command: nodeExecutable,
      arguments: [
        wranglerEntrypoint,
        "versions",
        "upload",
        "--config",
        path.join(artifactRoot, "wrangler.jsonc"),
        "--cwd",
        artifactRoot,
        "--env-file",
        emptyEnvironmentPath,
        "--dry-run",
        "--strict",
      ],
      shell: false,
    },
    {
      id: EXCEPTIONAL_RELEASE_STEP_IDS[5],
      command: nodeExecutable,
      arguments: [
        wranglerEntrypoint,
        "triggers",
        "deploy",
        "--config",
        path.join(artifactRoot, "wrangler.crons-open.jsonc"),
        "--cwd",
        artifactRoot,
        "--env-file",
        emptyEnvironmentPath,
        "--dry-run",
      ],
      shell: false,
    },
  ];
}

function expectedOpenUpdatePlan({ root, requestPath, nodeExecutable }) {
  const main = deriveExceptionalReleaseArtifactPaths(requestPath).artifactRoot;
  const recovery = deriveExceptionalReleaseArtifactPaths(requestPath, {
    artifactPurpose: "recovery",
  }).artifactRoot;
  const dry = (artifactRoot) => [
    path.join(root, "node_modules/wrangler/bin/wrangler.js"),
    "versions",
    "upload",
    "--config",
    path.join(artifactRoot, "wrangler.jsonc"),
    "--cwd",
    artifactRoot,
    "--env-file",
    path.join(artifactRoot, "exceptional-release-empty.env"),
    "--dry-run",
    "--strict",
  ];
  const argumentsByStep = [
    [path.join(root, "scripts/run-exceptional-release-local-gates.mjs")],
    [
      path.join(root, "scripts/cloudflare-open-source-check.mjs"),
      "--request",
      requestPath,
    ],
    [
      path.join(root, "scripts/cloudflare-open-source-check.mjs"),
      "--request",
      requestPath,
      "--smoke",
    ],
    [
      path.join(root, "scripts/cloudflare-build.mjs"),
      "--open-recovery-request",
      requestPath,
    ],
    dry(recovery),
    [
      path.join(root, "scripts/cloudflare-build.mjs"),
      "--exceptional-request",
      requestPath,
    ],
    dry(main),
  ];
  return EXCEPTIONAL_OPEN_UPDATE_STEP_IDS.map((id, i) => ({
    id,
    command: nodeExecutable,
    arguments: argumentsByStep[i],
    shell: false,
  }));
}

export function individualRiskConfirmationPhrase(gateId, fullHead) {
  if (typeof gateId !== "string" || !GATE_ID_PATTERN.test(gateId)) {
    throw new Error("gate-id inválido para la confirmación individual.");
  }
  if (typeof fullHead !== "string" || !FULL_HEAD_PATTERN.test(fullHead)) {
    throw new Error("full-head inválido para la confirmación individual.");
  }
  return `ACEPTO EL RIESGO ${gateId} PARA ${fullHead}`;
}

export function sensitiveConsent0059AdditionalConfirmationPhrase(fullHead) {
  if (typeof fullHead !== "string" || !FULL_HEAD_PATTERN.test(fullHead)) {
    throw new Error(
      "full-head inválido para la confirmación adicional de 0059.",
    );
  }
  return `ACEPTO ADEMÁS QUE AGORBIS NO DEBE DESCRIBIRSE COMO JURÍDICAMENTE CONFORME PARA ${fullHead}`;
}

export function requiredRiskConfirmationPhrases(gateId, fullHead) {
  const phrases = [individualRiskConfirmationPhrase(gateId, fullHead)];
  if (gateId === SENSITIVE_CONSENT_0059_GATE_ID) {
    phrases.push(sensitiveConsent0059AdditionalConfirmationPhrase(fullHead));
  }
  return Object.freeze(phrases);
}

export function validateRiskConfirmations({
  gateId,
  fullHead,
  confirmations,
} = {}) {
  let expected;
  try {
    expected = requiredRiskConfirmationPhrases(gateId, fullHead);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  if (!Array.isArray(confirmations)) {
    return [`${gateId} requiere confirmaciones individuales.`];
  }
  if (confirmations.length !== new Set(confirmations).size) {
    return [`${gateId} contiene confirmaciones duplicadas.`];
  }
  if (
    confirmations.length !== expected.length ||
    confirmations.some(
      (confirmation, index) => confirmation !== expected[index],
    )
  ) {
    return [
      `${gateId} no contiene cada confirmación individual exacta y en orden.`,
    ];
  }
  return [];
}

export function assertRiskConfirmations(input) {
  const errors = validateRiskConfirmations(input);
  if (errors.length > 0) {
    throw new Error(`Confirmación de riesgo inválida:\n${errors.join("\n")}`);
  }
}

export function exceptionalCommandSafetyErrors(step) {
  const errors = [];
  if (!isPlainObject(step)) return ["El paso no es un objeto válido."];
  if (step.shell !== false) {
    errors.push("Todo paso debe declarar shell=false.");
  }
  if (typeof step.command !== "string" || step.command.length === 0) {
    errors.push("El paso carece de un ejecutable explícito.");
    return errors;
  }
  if (
    !Array.isArray(step.arguments) ||
    step.arguments.some((argument) => typeof argument !== "string")
  ) {
    errors.push("El paso debe usar un vector de argumentos de strings.");
    return errors;
  }

  const name = executableName(step.command);
  const wrangler = wranglerArguments(step);
  let approvedWranglerDryRun = false;
  const normalizedArguments = step.arguments.map((argument) =>
    argument.toLowerCase(),
  );
  if (FORBIDDEN_EXECUTABLES.has(name)) {
    errors.push(`${name} no está permitido en el runner excepcional.`);
  }

  if (name === "pnpm" || name === "npm" || name === "yarn") {
    const scriptArguments = normalizedArguments.filter(
      (argument) => argument !== "run" && !argument.startsWith("--"),
    );
    if (
      scriptArguments.some((argument) =>
        /(?:^|[:.-])deploy(?:$|[:.-])/.test(argument),
      )
    ) {
      errors.push("No se permite invocar scripts de deploy.");
    }
    if (
      scriptArguments.some((argument) =>
        /(?:migrat|db[.:_-]?(?:push|reset)|dns|cron)/.test(argument),
      )
    ) {
      errors.push("No se permiten scripts mutantes de DB, DNS o crons.");
    }
  }

  if (wrangler) {
    const lowerWrangler = wrangler.map((argument) => argument.toLowerCase());
    const isVersionDryRun =
      lowerWrangler.length === 10 &&
      lowerWrangler[0] === "versions" &&
      lowerWrangler[1] === "upload" &&
      lowerWrangler[2] === "--config" &&
      path.isAbsolute(wrangler[3]) &&
      wrangler[3].endsWith("/wrangler.jsonc") &&
      lowerWrangler[4] === "--cwd" &&
      path.isAbsolute(wrangler[5]) &&
      lowerWrangler[6] === "--env-file" &&
      path.isAbsolute(wrangler[7]) &&
      wrangler[7].endsWith("/exceptional-release-empty.env") &&
      lowerWrangler[8] === "--dry-run" &&
      lowerWrangler[9] === "--strict";
    const isCronDryRun =
      lowerWrangler.length === 9 &&
      lowerWrangler[0] === "triggers" &&
      lowerWrangler[1] === "deploy" &&
      lowerWrangler[2] === "--config" &&
      path.isAbsolute(wrangler[3]) &&
      wrangler[3].endsWith("/wrangler.crons-open.jsonc") &&
      lowerWrangler[4] === "--cwd" &&
      path.isAbsolute(wrangler[5]) &&
      lowerWrangler[6] === "--env-file" &&
      path.isAbsolute(wrangler[7]) &&
      wrangler[7].endsWith("/exceptional-release-empty.env") &&
      lowerWrangler[8] === "--dry-run";
    if (!isVersionDryRun && !isCronDryRun) {
      errors.push(
        "Wrangler sólo puede validar por --dry-run el upload versionado y los cinco crons congelados.",
      );
    }
    approvedWranglerDryRun = isVersionDryRun || isCronDryRun;
  }

  const joined = normalizedArguments.join(" ");
  if (
    /(?:^|\s)(?:secret|secrets|config|configuration|kv|r2|d1|queues?|routes?|domains?|dns|triggers?|schedules?|cron)(?:\s|$)/.test(
      joined,
    ) &&
    wrangler &&
    !approvedWranglerDryRun
  ) {
    errors.push("No se permiten mutaciones de Cloudflare.");
  }
  if (
    name === "supabase" ||
    /(?:^|\s)(?:db\s+(?:push|reset)|migration\s+(?:up|repair|squash)|migrate)(?:\s|$)/.test(
      joined,
    )
  ) {
    errors.push("No se permiten migraciones ni mutaciones de Supabase.");
  }
  return [...new Set(errors)];
}

export function createExceptionalOpenReleaseDryRunPlan({
  root,
  requestPath,
  nodeExecutable = process.execPath,
  releaseMode,
} = {}) {
  const errors = validateRootAndRequest(root, requestPath);
  if (typeof nodeExecutable !== "string" || nodeExecutable.length === 0) {
    errors.push("nodeExecutable debe ser explícito.");
  } else if (executableName(nodeExecutable) !== "node") {
    errors.push("nodeExecutable debe resolver al binario node.");
  }
  if (errors.length > 0) {
    throw new Error(
      `No se puede construir el plan excepcional:\n${errors.join("\n")}`,
    );
  }
  const plan = Object.freeze(
    expectedPlan({ root, requestPath, nodeExecutable, releaseMode }).map(
      immutableStep,
    ),
  );
  const planErrors = validateExceptionalOpenReleaseDryRunPlan({
    root,
    requestPath,
    plan,
    nodeExecutable,
    releaseMode,
  });
  if (planErrors.length > 0) {
    throw new Error(
      `No se puede construir el plan excepcional:\n${planErrors.join("\n")}`,
    );
  }
  return plan;
}

export function validateExceptionalOpenReleaseDryRunPlan({
  root,
  requestPath,
  plan,
  nodeExecutable = process.execPath,
  releaseMode,
} = {}) {
  const errors = validateRootAndRequest(root, requestPath);
  if (!Array.isArray(plan)) return [...errors, "El plan debe ser un array."];
  if (typeof nodeExecutable !== "string" || nodeExecutable.length === 0) {
    errors.push("nodeExecutable debe ser explícito.");
    return errors;
  }
  if (executableName(nodeExecutable) !== "node") {
    errors.push("nodeExecutable debe resolver al binario node.");
  }
  if (errors.length > 0) return errors;

  const expected = expectedPlan({
    root,
    requestPath,
    nodeExecutable,
    releaseMode,
  });
  if (plan.length !== expected.length) {
    errors.push(
      `El plan debe contener exactamente ${expected.length} pasos dry-run.`,
    );
  }
  const ids = [];
  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index];
    errors.push(
      ...exceptionalCommandSafetyErrors(step).map(
        (error) => `Paso ${index + 1}: ${error}`,
      ),
    );
    if (!isPlainObject(step)) continue;
    ids.push(step.id);
    const expectedStep = expected[index];
    if (!expectedStep) {
      errors.push(`Paso ${index + 1}: el paso adicional no está permitido.`);
      continue;
    }
    if (step.id !== expectedStep.id) {
      errors.push(`Paso ${index + 1}: id u orden no aprobado.`);
    }
    if (step.command !== expectedStep.command) {
      errors.push(`Paso ${index + 1}: ejecutable no aprobado.`);
    }
    if (
      !Array.isArray(step.arguments) ||
      JSON.stringify(step.arguments) !== JSON.stringify(expectedStep.arguments)
    ) {
      errors.push(`Paso ${index + 1}: argumentos no aprobados.`);
    }
    const actualKeys = Object.keys(step).sort();
    const expectedKeys = ["arguments", "command", "id", "shell"];
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      errors.push(`Paso ${index + 1}: contiene propiedades no aprobadas.`);
    }
  }
  if (ids.length !== new Set(ids).size) {
    errors.push("El plan contiene pasos duplicados.");
  }
  return [...new Set(errors)];
}

export function assertExceptionalOpenReleaseDryRunPlan(input) {
  const errors = validateExceptionalOpenReleaseDryRunPlan(input);
  if (errors.length > 0) {
    throw new Error(`Plan excepcional inseguro:\n${errors.join("\n")}`);
  }
}

export function exceptionalReleaseExitCode({
  requestValid,
  technicalComplete,
  blocked = false,
  acceptedRiskCount = 0,
} = {}) {
  if (requestValid !== true)
    return EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST;
  if (
    blocked === true ||
    (blocked !== true && blocked !== false) ||
    technicalComplete !== true ||
    !Number.isSafeInteger(acceptedRiskCount) ||
    acceptedRiskCount < 0
  ) {
    return EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED;
  }
  return acceptedRiskCount === 0
    ? EXCEPTIONAL_RELEASE_EXIT_CODE.TECHNICAL_PASS
    : EXCEPTIONAL_RELEASE_EXIT_CODE.RISK_ACCEPTED_BY_OWNER;
}
