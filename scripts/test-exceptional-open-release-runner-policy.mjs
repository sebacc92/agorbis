#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installedPnpmStoreEnvironment } from "./installed-pnpm-store.mjs";
import {
  EXCEPTIONAL_RELEASE_EXIT_CODE,
  EXCEPTIONAL_RELEASE_STEP_IDS,
  EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH,
  SENSITIVE_CONSENT_0059_GATE_ID,
  assertExceptionalOpenReleaseDryRunPlan,
  assertRiskConfirmations,
  createExceptionalOpenReleaseDryRunPlan,
  exceptionalCommandSafetyErrors,
  exceptionalReleaseExitCode,
  individualRiskConfirmationPhrase,
  requiredRiskConfirmationPhrases,
  sensitiveConsent0059AdditionalConfirmationPhrase,
  validateExceptionalOpenReleaseDryRunPlan,
  validateRiskConfirmations,
} from "./exceptional-open-release-runner-policy.mjs";
import {
  EXCEPTIONAL_RELEASE_REQUIRED_SCRIPT_NAMES,
  EXCEPTIONAL_RELEASE_SCRIPT_CONTRACT_SHA256,
  assertExceptionalReleaseScriptContract,
  validateExceptionalReleaseScriptContract,
} from "./exceptional-release-script-contract.mjs";
import {
  EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS,
  runExceptionalReleaseLocalGates,
  validateReleaseOpenTestIsNonRecursive,
} from "./run-exceptional-release-local-gates.mjs";

const root = "/workspace/agorbis";
const requestPath = "/tmp/agorbis-risk-request.json";
const nodeExecutable = "/runtime/node";
const fullHead = "a".repeat(40);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const plan = createExceptionalOpenReleaseDryRunPlan({
  root,
  requestPath,
  nodeExecutable,
});
assert.equal(Object.isFrozen(plan), true);
assert.equal(plan.length, 6);
assert.deepEqual(
  plan.map(({ id }) => id),
  EXCEPTIONAL_RELEASE_STEP_IDS,
);
assert.equal(Object.isFrozen(EXCEPTIONAL_RELEASE_STEP_IDS), true);
const artifactRoot = "/tmp/agorbis-risk-request.artifact";
const wranglerEntrypoint = path.join(
  root,
  "node_modules/wrangler/bin/wrangler.js",
);
assert.deepEqual(plan[4].arguments, [
  wranglerEntrypoint,
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
]);
assert.deepEqual(plan[5].arguments, [
  wranglerEntrypoint,
  "triggers",
  "deploy",
  "--config",
  path.join(artifactRoot, "wrangler.crons-open.jsonc"),
  "--cwd",
  artifactRoot,
  "--env-file",
  path.join(artifactRoot, "exceptional-release-empty.env"),
  "--dry-run",
]);
assert.equal(plan.at(-1).arguments.includes(path.join(root, ".env")), false);
assert.equal(
  plan.at(-1).arguments.includes(path.join(root, ".env.local")),
  false,
);
assert.equal(
  plan[4].arguments.filter((argument) => argument === "--env-file").length,
  1,
);
for (const step of plan) {
  assert.equal(step.shell, false);
  assert.equal(Object.isFrozen(step), true);
  assert.equal(Object.isFrozen(step.arguments), true);
  assert.deepEqual(exceptionalCommandSafetyErrors(step), []);
}
assert.deepEqual(
  validateExceptionalOpenReleaseDryRunPlan({
    root,
    requestPath,
    plan,
    nodeExecutable,
  }),
  [],
);
assert.doesNotThrow(() =>
  assertExceptionalOpenReleaseDryRunPlan({
    root,
    requestPath,
    plan,
    nodeExecutable,
  }),
);
assert.throws(
  () =>
    createExceptionalOpenReleaseDryRunPlan({
      root,
      requestPath,
      nodeExecutable: "/bin/sh",
    }),
  /binario node/,
);
assert.deepEqual(
  validateExceptionalOpenReleaseDryRunPlan({
    root: "relative-root",
    requestPath,
    plan,
    nodeExecutable,
  }),
  ["root debe ser una ruta absoluta."],
);

function changedPlan(index, changes) {
  return plan.map((step, currentIndex) =>
    currentIndex === index ? { ...step, ...changes } : { ...step },
  );
}

function assertUnsafe(mutatedPlan, pattern) {
  const errors = validateExceptionalOpenReleaseDryRunPlan({
    root,
    requestPath,
    plan: mutatedPlan,
    nodeExecutable,
  });
  assert.notEqual(errors.length, 0);
  assert.match(errors.join("\n"), pattern);
  assert.throws(
    () =>
      assertExceptionalOpenReleaseDryRunPlan({
        root,
        requestPath,
        plan: mutatedPlan,
        nodeExecutable,
      }),
    /Plan excepcional inseguro/,
  );
}

assertUnsafe(changedPlan(0, { shell: true }), /shell=false/);
assertUnsafe(changedPlan(0, { shell: undefined }), /shell=false/);
assertUnsafe(changedPlan(3, { env: { TOKEN: "forbidden" } }), /propiedades/);
assertUnsafe(
  changedPlan(4, { arguments: [wranglerEntrypoint, "versions", "upload"] }),
  /dry-run/,
);
assertUnsafe(
  changedPlan(5, { arguments: [wranglerEntrypoint, "triggers", "deploy"] }),
  /sólo puede/,
);
for (const unapprovedEnvironmentPath of [
  path.join(root, ".env"),
  path.join(root, ".env.local"),
  "/tmp/otro-entorno-vacio.env",
]) {
  assertUnsafe(
    changedPlan(4, {
      arguments: plan[4].arguments.map((argument) =>
        argument.endsWith("/exceptional-release-empty.env")
          ? unapprovedEnvironmentPath
          : argument,
      ),
    }),
    /env-file|argumentos no aprobados/,
  );
}
assertUnsafe(
  changedPlan(4, {
    arguments: [...plan[4].arguments, "--outdir", "/tmp/unapproved"],
  }),
  /sólo puede ejecutar|argumentos no aprobados/,
);
assertUnsafe(
  changedPlan(4, {
    arguments: [wranglerEntrypoint, "secret", "put", "SUPABASE_SECRET_KEY"],
  }),
  /Cloudflare|Wrangler/,
);
assertUnsafe(
  changedPlan(4, {
    arguments: [wranglerEntrypoint, "dns", "create", "agorbis.com"],
  }),
  /Cloudflare|Wrangler/,
);
assertUnsafe(
  changedPlan(4, {
    arguments: [wranglerEntrypoint, "triggers", "deploy"],
  }),
  /Cloudflare|Wrangler/,
);
assertUnsafe(
  changedPlan(4, {
    arguments: [wranglerEntrypoint, "schedules", "create", "* * * * *"],
  }),
  /Cloudflare|Wrangler/,
);
assertUnsafe(
  changedPlan(4, { command: "/usr/bin/pnpm", arguments: ["deploy"] }),
  /scripts de deploy/,
);
assertUnsafe(
  changedPlan(4, {
    command: "/usr/bin/pnpm",
    arguments: ["run", "db:migrate"],
  }),
  /DB, DNS o crons/,
);
assertUnsafe(
  changedPlan(4, {
    command: "/usr/bin/supabase",
    arguments: ["db", "push"],
  }),
  /Supabase|no está permitido/,
);
assertUnsafe(
  changedPlan(4, {
    command: "/usr/bin/supabase",
    arguments: ["migration", "up"],
  }),
  /migraciones|Supabase|no está permitido/,
);
assertUnsafe(
  changedPlan(4, {
    command: "/usr/bin/psql",
    arguments: ["--file", "0059.sql"],
  }),
  /no está permitido/,
);
assertUnsafe(
  changedPlan(4, {
    command: "/bin/bash",
    arguments: ["-c", "external mutation"],
  }),
  /no está permitido/,
);
assertUnsafe([...plan, { ...plan[0] }], /exactamente 6|adicional|duplicados/);
assertUnsafe([plan[1], plan[0], plan[2], plan[3], plan[4], plan[5]], /orden/);

assert.equal(EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS.length, 13);
assert.deepEqual(
  EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS.map(
    ({ id, command, arguments: arguments_, shell }) => [
      id,
      command,
      arguments_,
      shell,
    ],
  ),
  [
    ["lint", "pnpm", ["lint"], false],
    ["test", "pnpm", ["test"], false],
    ["test.release", "pnpm", ["test.release"], false],
    ["build.types", "pnpm", ["build.types"], false],
    ["audit", "pnpm", ["audit", "--audit-level=low"], false],
    ["db.test", "pnpm", ["db.test"], false],
    ["test.civic", "pnpm", ["test.civic"], false],
    ["test.components", "pnpm", ["test.components"], false],
    ["test.e2e", "pnpm", ["test.e2e"], false],
    ["test.canary", "pnpm", ["test.canary"], false],
    ["test.release-open", "pnpm", ["test.release-open"], false],
    ["test.preflight", "pnpm", ["test.preflight"], false],
    [
      "cloudflare-public-build-environment",
      process.execPath,
      [
        path.join(
          repositoryRoot,
          "scripts/test-cloudflare-public-build-environment.mjs",
        ),
      ],
      false,
    ],
  ],
);
assert.equal(
  EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS.every(
    (step) =>
      Object.isFrozen(step) &&
      Object.isFrozen(step.arguments) &&
      Object.keys(step).sort().join(",") === "arguments,command,id,shell",
  ),
  true,
);
assert.doesNotMatch(
  JSON.stringify(EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS),
  /(?:wrangler|supabase|\bdns\b|migration|migrate|deploy)/i,
);

const nonRecursivePackageJson = JSON.stringify({
  scripts: {
    "test.release-open":
      "node scripts/test-open-release-runner.mjs && node scripts/test-release-gate-policy.mjs && node scripts/test-exceptional-open-release-runner-policy.mjs",
  },
});
assert.deepEqual(
  validateReleaseOpenTestIsNonRecursive(nonRecursivePackageJson),
  [],
);
for (const recursiveCommand of [
  "node scripts/run-exceptional-open-release.mjs --request /tmp/request.json",
  "node scripts/run-exceptional-release-local-gates.mjs",
  "pnpm release:open:exceptional:dry-run --request /tmp/request.json",
]) {
  assert.notDeepEqual(
    validateReleaseOpenTestIsNonRecursive(
      JSON.stringify({
        scripts: { "test.release-open": recursiveCommand },
      }),
    ),
    [],
  );
}
// `test.release` (contrato v11) tampoco puede volverse recursivo ni ejecutar
// comandos con efectos, aunque `test.release-open` siga intacto.
for (const recursiveReleaseSuite of [
  "node scripts/run-exceptional-release-local-gates.mjs",
  "pnpm test.release-open && node scripts/run-exceptional-open-release.mjs --request /tmp/request.json",
  "pnpm release:open:exceptional:dry-run --request /tmp/request.json",
  "pnpm verify",
  "",
]) {
  assert.notDeepEqual(
    validateReleaseOpenTestIsNonRecursive(
      JSON.stringify({
        scripts: {
          "test.release-open": "node scripts/test-open-release-runner.mjs",
          "test.release": recursiveReleaseSuite,
        },
      }),
    ),
    [],
    `test.release debe rechazar ${JSON.stringify(recursiveReleaseSuite)}`,
  );
}
assert.deepEqual(
  validateReleaseOpenTestIsNonRecursive(
    JSON.stringify({
      scripts: {
        "test.release-open": "node scripts/test-open-release-runner.mjs",
        "test.release":
          "node scripts/test-preflight.mjs && pnpm test.release-open",
      },
    }),
  ),
  [],
);

const contractedPackageJsonText = readFileSync(
  path.join(repositoryRoot, "package.json"),
  "utf8",
);
assert.match(EXCEPTIONAL_RELEASE_SCRIPT_CONTRACT_SHA256, /^[0-9a-f]{64}$/);
assert.equal(Object.isFrozen(EXCEPTIONAL_RELEASE_REQUIRED_SCRIPT_NAMES), true);
assert.deepEqual(
  validateExceptionalReleaseScriptContract(contractedPackageJsonText),
  [],
);
assert.doesNotThrow(() =>
  assertExceptionalReleaseScriptContract(contractedPackageJsonText),
);
const contractedLint = JSON.parse(contractedPackageJsonText).scripts.lint;
const contractedTest = JSON.parse(contractedPackageJsonText).scripts.test;
const contractedReleaseSuite = JSON.parse(contractedPackageJsonText).scripts[
  "test.release"
];
const contractedRelease = JSON.parse(contractedPackageJsonText).scripts[
  "test.release-open"
];
for (const command of contractedRelease.split(" && ")) {
  const omitted = JSON.parse(contractedPackageJsonText);
  omitted.scripts["test.release-open"] = contractedRelease
    .split(" && ")
    .filter((entry) => entry !== command)
    .join(" && ");
  assert.notDeepEqual(
    validateExceptionalReleaseScriptContract(JSON.stringify(omitted)),
    [],
    `El contrato debe rechazar la omisión de ${command}`,
  );
}
// Partir el antiguo `lint` no puede abrir una puerta para perder controles:
// omitir cualquier comando de `lint`, `test` o `test.release` rompe el
// contrato v11, y entre los tres cubren exactamente los pasos del monolito v10.
for (const scriptName of ["lint", "test", "test.release"]) {
  const contracted = JSON.parse(contractedPackageJsonText).scripts[scriptName];
  for (const command of contracted.split(" && ")) {
    const omitted = JSON.parse(contractedPackageJsonText);
    omitted.scripts[scriptName] = contracted
      .split(" && ")
      .filter((entry) => entry !== command)
      .join(" && ");
    assert.notDeepEqual(
      validateExceptionalReleaseScriptContract(JSON.stringify(omitted)),
      [],
      `El contrato debe rechazar la omisión de ${command} en ${scriptName}`,
    );
  }
}
const contractV10LintSteps = [
  'eslint "src/**/*.ts*" "e2e/**/*.ts" playwright.config.ts --max-warnings 0',
  "prettier --check .",
  "node scripts/scan-secrets.mjs",
  "node scripts/check-keys.mjs",
  "node scripts/check-i18n.mjs",
  "node scripts/check-legal.mjs",
  "node scripts/check-pending-external-evidence-legal-draft.mjs",
  "node scripts/test-cloudflare-public-build-environment.mjs",
  "pnpm test.release-open",
  "node scripts/test-cloudflare-closed-state.mjs",
  "node scripts/test-cloudflare-readonly-preview.mjs",
  "node scripts/test-cloudflare-readonly-preview-remote.mjs",
  "node scripts/test-cloudflare-dns-audit.mjs",
  "node scripts/test-cloudflare-cache-audit.mjs",
  "node scripts/test-cloudflare-cutover-actions.mjs",
  "node scripts/test-cloudflare-public-dns.mjs",
  "node scripts/test-preflight.mjs",
  "node scripts/test-production-smoke.mjs",
  "node scripts/test-git-recovery.mjs",
  "node scripts/test-backup-tools.mjs",
  "node scripts/test-supabase-managed-data-profiles.mjs",
  "node scripts/test-supabase-managed-restore-supplement.mjs",
  "node scripts/test-supabase-version-pins.mjs",
  "node scripts/test-supabase-managed-readiness.mjs",
  "node scripts/test-i18n.mjs",
  "node scripts/test-ai-summary.mjs",
  "node scripts/test-ugc-bidi.mjs",
  "node scripts/test-civic.mjs",
  "node scripts/test-shared.mjs",
  "vitest run --silent",
];
// Agregados explícitos de v11; cualquier otro cambio en la partición falla.
const contractV11AddedSteps = [
  "node scripts/check-audit-ignores.mjs",
  "node scripts/test-check-audit-ignores.mjs",
  "node scripts/check-db-contract.mjs",
  "node scripts/test-check-db-contract.mjs",
];
// Agregado explícito de v12 (D107): el test de `deploy:open`.
const contractV12AddedSteps = ["node scripts/test-simple-open-release.mjs"];
assert.deepEqual(
  ["lint", "test", "test.release"]
    .flatMap((scriptName) =>
      JSON.parse(contractedPackageJsonText).scripts[scriptName].split(" && "),
    )
    .sort(),
  [
    ...contractV10LintSteps,
    ...contractV11AddedSteps,
    ...contractV12AddedSteps,
  ].sort(),
  "lint + test + test.release deben cubrir exactamente los pasos del lint v10 más los agregados de v11 y v12.",
);
for (const [scriptName, unsafeCommand] of [
  ["lint", "pnpm deploy"],
  ["build", "supabase migration up"],
  ["build", "wrangler dns create agorbis.com"],
  ["test.canary", "node -e process.exit(0)"],
  [
    "test.release-open",
    contractedRelease.replace(
      "node scripts/test-open-release-baseline-policy.mjs && ",
      "",
    ),
  ],
  [
    "test.release-open",
    contractedRelease.replace(
      "node scripts/test-social-auth-consent-policy.mjs && ",
      "",
    ),
  ],
  [
    "test.release",
    contractedReleaseSuite.replace(
      " && node scripts/test-supabase-managed-data-profiles.mjs",
      "",
    ),
  ],
  [
    "test.release",
    contractedReleaseSuite.replace(
      " && node scripts/test-supabase-managed-restore-supplement.mjs",
      "",
    ),
  ],
  ["lint", contractedLint.replace(" && node scripts/check-legal.mjs", "")],
  ["test", contractedTest.replace(" && node scripts/test-civic.mjs", "")],
]) {
  // Una mutación que no cambia nada no prueba el contrato.
  assert.notEqual(
    unsafeCommand,
    JSON.parse(contractedPackageJsonText).scripts[scriptName],
  );
  const mutatedPackageJson = JSON.parse(contractedPackageJsonText);
  mutatedPackageJson.scripts[scriptName] = unsafeCommand;
  const errors = validateExceptionalReleaseScriptContract(
    JSON.stringify(mutatedPackageJson),
  );
  assert.notDeepEqual(errors, []);
  assert.match(errors.join("\n"), new RegExp(scriptName));
  assert.match(errors.join("\n"), /hash|contrato/i);

  let unsafeSpawnAttempts = 0;
  assert.equal(
    runExceptionalReleaseLocalGates({
      spawn() {
        unsafeSpawnAttempts += 1;
        return { status: 0 };
      },
      processEnvironment: { PATH: "/safe/path" },
      packageJsonText: JSON.stringify(mutatedPackageJson),
      report() {},
    }),
    1,
  );
  assert.equal(unsafeSpawnAttempts, 0);
}

const exceptionalEmptyEnvironmentPath = path.join(
  repositoryRoot,
  EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH,
);
assert.equal(statSync(exceptionalEmptyEnvironmentPath).isFile(), true);
assert.equal(statSync(exceptionalEmptyEnvironmentPath).size, 0);
assert.equal(readFileSync(exceptionalEmptyEnvironmentPath).byteLength, 0);
const ignoredEmptyEnvironment = spawnSync(
  "git",
  ["check-ignore", "-q", "--", exceptionalEmptyEnvironmentPath],
  { cwd: repositoryRoot, shell: false },
);
assert.equal(ignoredEmptyEnvironment.status, 1);

const cloudflareBuildSource = readFileSync(
  path.join(repositoryRoot, "scripts/cloudflare-build.mjs"),
  "utf8",
);
const buildContractPosition = cloudflareBuildSource.indexOf(
  "assertExceptionalReleaseScriptContract(",
);
const pnpmBuildPosition = cloudflareBuildSource.indexOf(
  'd72CandidateRequestPath ? D72_COMPOSITE_PINNED_PNPM_EXECUTABLE : "pnpm",',
);
assert.ok(buildContractPosition >= 0);
assert.ok(pnpmBuildPosition > buildContractPosition);

const localGateCalls = [];
const localGateStatus = runExceptionalReleaseLocalGates({
  spawn(command, arguments_, options) {
    localGateCalls.push({ command, arguments_, options });
    return { status: 0 };
  },
  processEnvironment: {
    HOME: "/safe/home",
    PATH: "/safe/path",
    SUPABASE_SECRET_KEY: "must-not-be-inherited",
    TURNSTILE_SECRET: "must-not-be-inherited",
    NODE_OPTIONS: "--require=unapproved-module",
    pnpm_config_store_dir: "/unapproved/store",
    // Un padre no puede apagar la exigencia de la toolchain auditada.
    AGORBIS_REQUIRE_PINNED_TOOLCHAIN: "0",
  },
  packageJsonText: contractedPackageJsonText,
});
assert.equal(localGateStatus, 0);
assert.equal(localGateCalls.length, 13);
assert.deepEqual(
  localGateCalls.map(({ command, arguments_ }) => [command, arguments_]),
  EXCEPTIONAL_RELEASE_LOCAL_GATE_STEPS.map(
    ({ command, arguments: arguments_ }) => [command, arguments_],
  ),
);
for (const call of localGateCalls) {
  assert.equal(call.options.cwd, repositoryRoot);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.stdio, "inherit");
  assert.deepEqual(call.options.env, {
    HOME: "/safe/home",
    PATH: "/safe/path",
    ...installedPnpmStoreEnvironment(repositoryRoot),
    AGORBIS_REQUIRE_PINNED_TOOLCHAIN: "1",
  });
}

let accumulatedAttempts = 0;
const accumulatedFailures = [];
assert.equal(
  runExceptionalReleaseLocalGates({
    spawn() {
      accumulatedAttempts += 1;
      return { status: [5, 9].includes(accumulatedAttempts) ? 37 : 0 };
    },
    processEnvironment: { PATH: "/safe/path" },
    packageJsonText: contractedPackageJsonText,
    report(message) {
      accumulatedFailures.push(message);
    },
  }),
  1,
);
assert.equal(accumulatedAttempts, 13);
assert.deepEqual(accumulatedFailures, [
  "Validación local bloqueada: audit.",
  "Validación local bloqueada: test.e2e.",
]);

const rejectedArguments = spawnSync(
  process.execPath,
  [
    path.join(
      repositoryRoot,
      "scripts/run-exceptional-release-local-gates.mjs",
    ),
    "--unapproved-argument",
  ],
  {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    shell: false,
  },
);
assert.equal(rejectedArguments.status, 2);
assert.match(rejectedArguments.stderr, /no acepta argumentos/);

const individualGateId = "legal.aaip-registration-pending";
const individualPhrase = individualRiskConfirmationPhrase(
  individualGateId,
  fullHead,
);
assert.equal(
  individualPhrase,
  `ACEPTO EL RIESGO ${individualGateId} PARA ${fullHead}`,
);
assert.deepEqual(requiredRiskConfirmationPhrases(individualGateId, fullHead), [
  individualPhrase,
]);
assert.deepEqual(
  validateRiskConfirmations({
    gateId: individualGateId,
    fullHead,
    confirmations: [individualPhrase],
  }),
  [],
);
assert.doesNotThrow(() =>
  assertRiskConfirmations({
    gateId: individualGateId,
    fullHead,
    confirmations: [individualPhrase],
  }),
);
assert.notDeepEqual(
  validateRiskConfirmations({
    gateId: individualGateId,
    fullHead,
    confirmations: ["ACEPTO TODOS LOS RIESGOS"],
  }),
  [],
);
assert.notDeepEqual(
  validateRiskConfirmations({
    gateId: individualGateId,
    fullHead,
    confirmations: [individualPhrase, individualPhrase],
  }),
  [],
);
assert.notDeepEqual(
  validateRiskConfirmations({
    gateId: individualGateId,
    fullHead,
    confirmations: [`${individualPhrase} `],
  }),
  [],
);
assert.throws(
  () => individualRiskConfirmationPhrase(individualGateId, "short-head"),
  /full-head inválido/,
);

const consentPhrases = requiredRiskConfirmationPhrases(
  SENSITIVE_CONSENT_0059_GATE_ID,
  fullHead,
);
assert.equal(consentPhrases.length, 2);
assert.equal(
  consentPhrases[0],
  `ACEPTO EL RIESGO ${SENSITIVE_CONSENT_0059_GATE_ID} PARA ${fullHead}`,
);
assert.equal(
  consentPhrases[1],
  `ACEPTO ADEMÁS QUE AGORBIS NO DEBE DESCRIBIRSE COMO JURÍDICAMENTE CONFORME PARA ${fullHead}`,
);
assert.equal(
  consentPhrases[1],
  sensitiveConsent0059AdditionalConfirmationPhrase(fullHead),
);
assert.deepEqual(
  validateRiskConfirmations({
    gateId: SENSITIVE_CONSENT_0059_GATE_ID,
    fullHead,
    confirmations: consentPhrases,
  }),
  [],
);
assert.notDeepEqual(
  validateRiskConfirmations({
    gateId: SENSITIVE_CONSENT_0059_GATE_ID,
    fullHead,
    confirmations: [consentPhrases[0]],
  }),
  [],
);
assert.notDeepEqual(
  validateRiskConfirmations({
    gateId: SENSITIVE_CONSENT_0059_GATE_ID,
    fullHead,
    confirmations: [consentPhrases[1], consentPhrases[0]],
  }),
  [],
);

assert.deepEqual(EXCEPTIONAL_RELEASE_EXIT_CODE, {
  TECHNICAL_PASS: 0,
  BLOCKED: 1,
  INVALID_REQUEST: 2,
  RISK_ACCEPTED_BY_OWNER: 20,
});
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: true,
    acceptedRiskCount: 0,
  }),
  0,
);
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: true,
    acceptedRiskCount: 1,
  }),
  20,
);
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: false,
    acceptedRiskCount: 1,
  }),
  1,
);
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: true,
    blocked: "false",
    acceptedRiskCount: 0,
  }),
  1,
);
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: true,
    blocked: true,
    acceptedRiskCount: 1,
  }),
  1,
);
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: false,
    technicalComplete: true,
    acceptedRiskCount: 1,
  }),
  2,
);
assert.equal(
  exceptionalReleaseExitCode({
    requestValid: true,
    technicalComplete: true,
    acceptedRiskCount: -1,
  }),
  1,
);

// Un exit 20 hace que el shell no ejecute el comando situado después de &&.
const chained = spawnSync(
  "/bin/sh",
  [
    "-c",
    '"$EXCEPTIONAL_TEST_NODE" -e "process.exit(20)" && "$EXCEPTIONAL_TEST_NODE" -e "process.stdout.write(\'FOLLOWING_COMMAND_RAN\')"',
  ],
  {
    encoding: "utf8",
    env: { EXCEPTIONAL_TEST_NODE: process.execPath },
    shell: false,
  },
);
assert.equal(chained.status, 20);
assert.doesNotMatch(chained.stdout, /FOLLOWING_COMMAND_RAN/);

console.log("Exceptional open release runner policy tests: PASS");
