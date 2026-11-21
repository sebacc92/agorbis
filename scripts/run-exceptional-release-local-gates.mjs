#!/usr/bin/env node

import { installedPnpmStoreEnvironment } from "./installed-pnpm-store.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateExceptionalReleaseScriptContract } from "./exceptional-release-script-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

const SAFE_PARENT_ENVIRONMENT_NAMES = Object.freeze([
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
]);

// Desde el contrato de scripts v11 `lint` ya no arrastra los tests: `test` y
// `test.release` corren acá explícitamente para que la suite local completa
// siga cubriendo exactamente los mismos comandos que antes cubría `lint`.
const steps = [
  ["lint", "pnpm", ["lint"]],
  ["test", "pnpm", ["test"]],
  ["test.release", "pnpm", ["test.release"]],
  ["build.types", "pnpm", ["build.types"]],
  ["audit", "pnpm", ["audit", "--audit-level=low"]],
  ["db.test", "pnpm", ["db.test"]],
  ["test.civic", "pnpm", ["test.civic"]],
  ["test.components", "pnpm", ["test.components"]],
  ["test.e2e", "pnpm", ["test.e2e"]],
  ["test.canary", "pnpm", ["test.canary"]],
  ["test.release-open", "pnpm", ["test.release-open"]],
  ["test.preflight", "pnpm", ["test.preflight"]],
  [
    "cloudflare-public-build-environment",
    process.execPath,
    [path.join(root, "scripts/test-cloudflare-public-build-environment.mjs")],
  ],
];

export const EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS = Object.freeze(
  steps.map(([id, command, arguments_]) =>
    Object.freeze({
      id,
      command,
      arguments: Object.freeze([...arguments_]),
      shell: false,
    }),
  ),
);

/**
 * Valor fijo, nunca heredado: en una corrida excepcional la toolchain auditada
 * es obligatoria. Sin esto, `test-d72-non-stateful-composite-collector` veía
 * que faltaba el pnpm canónico, imprimía SKIP y pasaba, porque
 * `safeEnvironment` descarta la variable del padre (no está en la lista
 * segura) y nada más la fijaba. Va después de todo lo demás para que ningún
 * entorno heredado la apague.
 */
export const PINNED_TOOLCHAIN_ENVIRONMENT = Object.freeze({
  AGORBIS_REQUIRE_PINNED_TOOLCHAIN: "1",
});

function safeEnvironment(processEnvironment) {
  return Object.freeze(
    Object.fromEntries(
      SAFE_PARENT_ENVIRONMENT_NAMES.flatMap((name) =>
        typeof processEnvironment[name] === "string"
          ? [[name, processEnvironment[name]]]
          : [],
      ),
    ),
  );
}

export function validateReleaseOpenTestIsNonRecursive(packageJsonText) {
  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonText);
  } catch {
    return ["package.json no contiene JSON válido."];
  }
  const command = packageJson?.scripts?.["test.release-open"];
  if (typeof command !== "string" || command.trim().length === 0) {
    return ["package.json no define test.release-open."];
  }
  const invocations = command.trim().split(/\s*&&\s*/);
  if (
    invocations.length === 0 ||
    invocations.some(
      (invocation) => !/^node scripts\/test-[a-z0-9-]+\.mjs$/.test(invocation),
    )
  ) {
    return [
      "test.release-open debe ejecutar sólo tests de políticas y nunca el runner excepcional.",
    ];
  }
  // `test.release` agrupa tests de release y `test.release-open`; tampoco
  // puede invocar el runner excepcional ni ningún comando con efectos.
  const releaseSuite = packageJson?.scripts?.["test.release"];
  if (releaseSuite !== undefined) {
    const releaseInvocations =
      typeof releaseSuite === "string"
        ? releaseSuite.trim().split(/\s*&&\s*/)
        : [];
    if (
      releaseInvocations.length === 0 ||
      releaseInvocations.some(
        (invocation) =>
          invocation !== "pnpm test.release-open" &&
          !/^node scripts\/test-[a-z0-9-]+\.mjs$/.test(invocation),
      )
    ) {
      return [
        "test.release debe ejecutar sólo tests de políticas y test.release-open, nunca el runner excepcional.",
      ];
    }
  }
  return [];
}

export function runExceptionalReleaseLocalGates({
  spawn = spawnSync,
  processEnvironment = process.env,
  packageJsonText = readFileSync(path.join(root, "package.json"), "utf8"),
  report = console.error,
} = {}) {
  if (process.versions.node !== "22.22.0") {
    report("Las validaciones locales excepcionales exigen Node 22.22.0.");
    return 1;
  }
  const contractErrors = [
    ...validateExceptionalReleaseScriptContract(packageJsonText),
    ...validateReleaseOpenTestIsNonRecursive(packageJsonText),
  ];
  if (contractErrors.length > 0) {
    report([...new Set(contractErrors)].join("\n"));
    return 1;
  }

  const environment = Object.freeze({
    ...safeEnvironment(processEnvironment),
    ...installedPnpmStoreEnvironment(root),
    ...PINNED_TOOLCHAIN_ENVIRONMENT,
  });
  let failed = false;
  for (const step of EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS) {
    const result = spawn(step.command, step.arguments, {
      cwd: root,
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    if (result.error || result.signal || result.status !== 0) {
      report(`Validación local bloqueada: ${step.id}.`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === scriptPath;

if (isMain) {
  if (process.argv.length !== 2) {
    console.error("Este script no acepta argumentos.");
    process.exitCode = 2;
  } else {
    process.exitCode = runExceptionalReleaseLocalGates();
  }
}
