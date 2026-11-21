import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  CLOUDFLARE_PUBLIC_BUILD_LOCK,
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  d72CandidateBuildBlockers,
  publicBuildEnvironment,
  publicBuildOpeningBlockers,
} from "./cloudflare-public-build-environment.mjs";
import { EXPECTED_WORKER_SECRETS } from "./cloudflare-worker-policy.mjs";
import { KNOWN_NON_SECRET_ENVIRONMENT_VALUES } from "./recovery-inventory.mjs";

export const OPEN_RELEASE_SECRET_NAMES = Object.freeze([
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
  "CRON_SECRET",
]);

const expectedSecretNames = [...EXPECTED_WORKER_SECRETS].sort();
if (
  JSON.stringify([...OPEN_RELEASE_SECRET_NAMES].sort()) !==
  JSON.stringify(expectedSecretNames)
) {
  throw new Error(
    "El inventario de secretos del release no coincide con Wrangler.",
  );
}

const SAFE_PARENT_NAMES = Object.freeze([
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
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;

export function prepareExceptionalWranglerKeyringTransportEnvironment({
  processEnvironment = process.env,
  uid = typeof process.getuid === "function" ? process.getuid() : null,
} = {}) {
  if (
    !processEnvironment ||
    typeof processEnvironment !== "object" ||
    Array.isArray(processEnvironment) ||
    !Number.isSafeInteger(uid) ||
    uid < 0
  ) {
    throw new Error("El entorno de transporte del keyring no es válido.");
  }

  const runtimeDirectory = processEnvironment.XDG_RUNTIME_DIR;
  const sessionBusAddress = processEnvironment.DBUS_SESSION_BUS_ADDRESS;
  const expectedRuntimeDirectory = path.join("/run/user", String(uid));
  if (
    typeof runtimeDirectory !== "string" ||
    runtimeDirectory !== expectedRuntimeDirectory ||
    !path.isAbsolute(runtimeDirectory) ||
    path.resolve(runtimeDirectory) !== runtimeDirectory ||
    CONTROL_OR_BIDI_PATTERN.test(runtimeDirectory) ||
    typeof sessionBusAddress !== "string" ||
    sessionBusAddress !== `unix:path=${runtimeDirectory}/bus` ||
    CONTROL_OR_BIDI_PATTERN.test(sessionBusAddress)
  ) {
    throw new Error(
      "Wrangler OAuth exige el transporte canónico del keyring de la sesión Linux.",
    );
  }

  return Object.freeze({
    DBUS_SESSION_BUS_ADDRESS: sessionBusAddress,
    XDG_RUNTIME_DIR: runtimeDirectory,
  });
}

export function assertOpenReleaseNode(version = process.versions.node) {
  if (!/^22(?:\.|$)/.test(version ?? "")) {
    throw new Error(
      `El runner de apertura exige Node 22.x; detectado ${JSON.stringify(version)}.`,
    );
  }
}

export function prepareOpenReleaseEnvironment({
  processEnvironment = process.env,
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
} = {}) {
  const blockers = publicBuildOpeningBlockers(variables);
  if (blockers.length > 0) {
    throw new Error(
      `Apertura pública bloqueada antes de solicitar secretos:\n${blockers.join("\n")}`,
    );
  }
  const publicEnvironment = publicBuildEnvironment({ mode: "open", variables });
  const safeParent = Object.fromEntries(
    SAFE_PARENT_NAMES.flatMap((name) =>
      typeof processEnvironment[name] === "string"
        ? [[name, processEnvironment[name]]]
        : [],
    ),
  );
  return Object.freeze({
    ...safeParent,
    ...KNOWN_NON_SECRET_ENVIRONMENT_VALUES,
    ...publicEnvironment,
    [CLOUDFLARE_PUBLIC_BUILD_LOCK]: "1",
  });
}

export function prepareExceptionalOpenReleaseEnvironment({
  acceptedRiskGateIds,
  processEnvironment = process.env,
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
} = {}) {
  const blockers = publicBuildOpeningBlockers(variables, {
    acceptedRiskGateIds,
  });
  if (blockers.length > 0) {
    throw new Error(
      `Apertura excepcional bloqueada antes de solicitar confirmaciones individuales:\n${blockers.join("\n")}`,
    );
  }
  const publicEnvironment = publicBuildEnvironment({
    mode: "exceptional-open",
    variables,
    acceptedRiskGateIds,
  });
  const safeParent = Object.fromEntries(
    SAFE_PARENT_NAMES.flatMap((name) =>
      typeof processEnvironment[name] === "string"
        ? [[name, processEnvironment[name]]]
        : [],
    ),
  );
  return Object.freeze({
    ...safeParent,
    ...KNOWN_NON_SECRET_ENVIRONMENT_VALUES,
    ...publicEnvironment,
    AGORBIS_D72_CANDIDATE_BUILD: "true",
    AGORBIS_D72_DEPLOYMENT_AUTHORIZED: "false",
    AGORBIS_D72_DEPLOYMENT_EXECUTED: "false",
    AGORBIS_D72_RISK_ACCEPTANCE_RECORDED: "false",
    [CLOUDFLARE_PUBLIC_BUILD_LOCK]: "1",
  });
}

export function prepareD72CandidateBuildEnvironment({
  requestedRiskGateIds,
  processEnvironment = process.env,
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
} = {}) {
  const blockers = d72CandidateBuildBlockers(variables, {
    candidateRiskGateIds: requestedRiskGateIds,
  });
  if (blockers.length > 0) {
    throw new Error(
      `Build candidato D72 bloqueado sin aceptar riesgos:\n${blockers.join("\n")}`,
    );
  }
  const publicEnvironment = publicBuildEnvironment({
    mode: "d72-candidate",
    variables,
    candidateRiskGateIds: requestedRiskGateIds,
  });
  const safeParent = Object.fromEntries(
    SAFE_PARENT_NAMES.flatMap((name) =>
      typeof processEnvironment[name] === "string"
        ? [[name, processEnvironment[name]]]
        : [],
    ),
  );
  return Object.freeze({
    ...safeParent,
    ...KNOWN_NON_SECRET_ENVIRONMENT_VALUES,
    ...publicEnvironment,
    AGORBIS_D72_CANDIDATE_BUILD: "true",
    AGORBIS_D72_DEPLOYMENT_AUTHORIZED: "false",
    AGORBIS_D72_DEPLOYMENT_EXECUTED: "false",
    AGORBIS_D72_RISK_ACCEPTANCE_RECORDED: "false",
    [CLOUDFLARE_PUBLIC_BUILD_LOCK]: "1",
  });
}

export function validatePromptedSecrets(secrets) {
  const names = Object.keys(secrets ?? {});
  if (
    names.length !== OPEN_RELEASE_SECRET_NAMES.length ||
    JSON.stringify([...names].sort()) !==
      JSON.stringify([...OPEN_RELEASE_SECRET_NAMES].sort())
  ) {
    throw new Error(
      "El prompt debe entregar exactamente los tres secretos aprobados.",
    );
  }
  if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secrets.SUPABASE_SECRET_KEY)) {
    throw new Error(
      "SUPABASE_SECRET_KEY no tiene el formato sb_secret_ requerido.",
    );
  }
  if ((secrets.TURNSTILE_SECRET ?? "").length < 20) {
    throw new Error("TURNSTILE_SECRET no cumple la longitud mínima.");
  }
  if ((secrets.CRON_SECRET ?? "").length < 32) {
    throw new Error("CRON_SECRET no cumple la longitud mínima.");
  }
}

export function openReleaseSteps(root) {
  return Object.freeze([
    Object.freeze({
      label: "build abierto y preflight",
      command: process.execPath,
      arguments: [path.join(root, "scripts/cloudflare-build.mjs")],
      secrets: true,
    }),
    Object.freeze({
      label: "Wrangler dry-run",
      command: path.join(root, "node_modules/.bin/wrangler"),
      arguments: ["deploy", "--dry-run", "--no-autoconfig"],
      secrets: false,
    }),
  ]);
}

export function executeOpenReleaseDryRun({
  root,
  nonSecretEnvironment,
  secrets,
  spawn = spawnSync,
} = {}) {
  validatePromptedSecrets(secrets);
  for (const step of openReleaseSteps(root)) {
    const result = spawn(step.command, step.arguments, {
      cwd: root,
      env: step.secrets
        ? { ...nonSecretEnvironment, ...secrets }
        : nonSecretEnvironment,
      shell: false,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.signal) return 1;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
