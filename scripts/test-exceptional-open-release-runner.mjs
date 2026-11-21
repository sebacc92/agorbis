#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  createExceptionalReleaseAct,
  exceptionalReleaseRequestHash,
  renderExceptionalReleaseActJson,
  renderExceptionalReleaseActMarkdown,
} from "./exceptional-release-act.mjs";
import {
  EXCEPTIONAL_RELEASE_EXIT_CODE,
  EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH,
  requiredRiskConfirmationPhrases,
} from "./exceptional-open-release-runner-policy.mjs";
import {
  EVIDENCE_STATUS,
  GATE_POLICY,
  NON_WAIVABLE_SECURITY_GATE_IDS,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RAW_RESULT,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";
import * as exceptionalOpenReleaseRunnerModule from "./run-exceptional-open-release.mjs";
import {
  EXCEPTIONAL_GATE_PASS_REQUIREMENTS,
  assertExceptionalOpenReleaseNode,
  assertExceptionalWranglerEmptyEnvironmentFile,
  evaluateExceptionalGateResults,
  exceptionalRiskRequestBlockers,
  inspectExceptionalReleaseGitState,
  nonWaivableExceptionalGateBlockers,
  parseExceptionalOpenReleaseArguments,
  runExceptionalOpenReleaseTestHarness,
} from "./run-exceptional-open-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestPath = "/tmp/agorbis-exceptional-request.json";
const head = "0123456789abcdef0123456789abcdef01234567";
const artifactHash = "a".repeat(64);
const now = new Date("2026-08-29T16:00:00.000Z");
const keyringUid = process.getuid();
const keyringRuntimeDirectory = `/run/user/${keyringUid}`;
const keyringSessionBusAddress = `unix:path=${keyringRuntimeDirectory}/bus`;
const reservedSecretNames = [
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
  "CRON_SECRET",
];
const ambientSecretValues = [
  `sb_secret_${"A".repeat(24)}`,
  "ambient-turnstile-secret-value",
  "ambient-cron-secret-value-that-must-not-propagate",
];

assert.equal(
  Object.hasOwn(
    exceptionalOpenReleaseRunnerModule,
    "runExceptionalOpenRelease",
  ),
  false,
);
assert.equal(
  Object.hasOwn(
    exceptionalOpenReleaseRunnerModule,
    "runExceptionalOpenReleaseProduction",
  ),
  false,
);
assert.equal(
  Object.hasOwn(
    exceptionalOpenReleaseRunnerModule,
    "issueExceptionalActCanonical",
  ),
  false,
);
assert.equal(
  typeof exceptionalOpenReleaseRunnerModule.runExceptionalOpenReleaseTestHarness,
  "function",
);
assert.throws(
  () => runExceptionalOpenReleaseTestHarness({}),
  /todas las dependencias explícitas/i,
);

function riskFor(gateId) {
  const definition = getReleaseGateDefinition(gateId);
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
    owner: "Sebastian Cardoso Castillo",
    timestampUtc: "2026-08-29T15:00:00.000Z",
    deploymentAuthorized: false,
    risks: gateIds.map(riskFor),
    ...overrides,
  };
}

function externallyVerifiedGateResults() {
  return RELEASE_GATE_POLICY.gates.map((definition) => ({
    gateId: definition.id,
    evidenceStatus:
      definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE
        ? EVIDENCE_STATUS.PASS
        : definition.evidenceStatus,
    rawResult:
      definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE
        ? RAW_RESULT.PASS
        : definition.rawResult,
  }));
}

function allPassGateResults() {
  return RELEASE_GATE_POLICY.gates.map(({ id }) => ({
    gateId: id,
    evidenceStatus: EVIDENCE_STATUS.PASS,
    rawResult: RAW_RESULT.PASS,
  }));
}

function exactTty({ wrongFirstConfirmation = false, onEvent = () => {} } = {}) {
  const prompts = [];
  const shownRisks = [];
  let closed = false;
  return {
    prompts,
    shownRisks,
    get closed() {
      return closed;
    },
    showRisk({ gateId, consequence, ...unexpected }) {
      assert.deepEqual(unexpected, {});
      shownRisks.push({ gateId, consequence });
      onEvent(`show-risk-${gateId}`);
    },
    readLine({ prompt, ...unexpected }) {
      assert.deepEqual(unexpected, {});
      prompts.push(prompt);
      onEvent("read-confirmation");
      if (wrongFirstConfirmation && prompts.length === 1) {
        return "ACEPTO TODOS LOS RIESGOS";
      }
      return prompt;
    },
    close() {
      closed = true;
      onEvent("close-tty");
    },
  };
}

assert.deepEqual(
  parseExceptionalOpenReleaseArguments(["--request", requestPath]),
  { requestPath },
);
for (const invalidArguments of [
  [],
  ["--request"],
  ["--request", requestPath, "extra"],
  ["--file", requestPath],
  ["--request", ""],
]) {
  assert.throws(
    () => parseExceptionalOpenReleaseArguments(invalidArguments),
    /--request/,
  );
}
assert.doesNotThrow(() => assertExceptionalOpenReleaseNode("22.22.0"));
assert.throws(() => assertExceptionalOpenReleaseNode("22.21.1"), /22\.22\.0/);
assert.throws(() => assertExceptionalOpenReleaseNode("24.0.0"), /22\.22\.0/);
assert.equal(
  assertExceptionalWranglerEmptyEnvironmentFile({ root }),
  path.join(root, EXCEPTIONAL_WRANGLER_EMPTY_ENV_RELATIVE_PATH),
);

assert.equal(NON_WAIVABLE_SECURITY_GATE_IDS.length, 27);
const successfulPlanExecution = {
  commands: [
    "local-phase-k-gates",
    "cloudflare-closed-state-read",
    "production-closed-smoke-read",
    "exceptional-build-preflight",
    "wrangler-version-dry-run",
    "wrangler-crons-dry-run",
  ].map((label) => ({ label, exitCode: 0 })),
};
const conservativeGateResults = evaluateExceptionalGateResults({
  execution: successfulPlanExecution,
});
assert.equal(
  conservativeGateResults.length,
  OWNER_WAIVER_CANDIDATE_GATE_IDS.length +
    NON_WAIVABLE_SECURITY_GATE_IDS.length,
);
assert.deepEqual(
  conservativeGateResults.map(({ gateId }) => gateId),
  RELEASE_GATE_POLICY.gates.map(({ id }) => id),
);
for (const result of conservativeGateResults) {
  const definition = getReleaseGateDefinition(result.gateId);
  if (definition.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE) {
    const hasExplicitPassingEvidence = Object.hasOwn(
      EXCEPTIONAL_GATE_PASS_REQUIREMENTS,
      result.gateId,
    );
    assert.equal(
      result.evidenceStatus,
      hasExplicitPassingEvidence
        ? EVIDENCE_STATUS.PASS
        : EVIDENCE_STATUS.NOT_VERIFIED,
    );
    assert.equal(
      result.rawResult,
      hasExplicitPassingEvidence ? RAW_RESULT.PASS : RAW_RESULT.FAIL,
    );
  } else {
    assert.equal(result.evidenceStatus, definition.evidenceStatus);
    assert.equal(result.rawResult, RAW_RESULT.FAIL);
  }
}
const conservativeBlockers = nonWaivableExceptionalGateBlockers(
  conservativeGateResults,
);
assert.deepEqual(
  conservativeBlockers.map(({ gateId }) => gateId),
  NON_WAIVABLE_SECURITY_GATE_IDS.filter(
    (gateId) => !Object.hasOwn(EXCEPTIONAL_GATE_PASS_REQUIREMENTS, gateId),
  ),
);
assert.ok(conservativeBlockers.length > 0);
assert.deepEqual(
  exceptionalRiskRequestBlockers({
    request: requestFor(),
    gateResults: conservativeGateResults,
  }),
  [],
);
assert.equal(
  exceptionalRiskRequestBlockers({
    request: requestFor(OWNER_WAIVER_CANDIDATE_GATE_IDS.slice(0, -1)),
    gateResults: conservativeGateResults,
  }).length,
  1,
);
assert.match(
  exceptionalRiskRequestBlockers({
    request: requestFor([OWNER_WAIVER_CANDIDATE_GATE_IDS[0]]),
    gateResults: allPassGateResults(),
  }).join("\n"),
  /ya es PASS/,
);

const gitSpawnCalls = [];
assert.deepEqual(
  inspectExceptionalReleaseGitState({
    root,
    processEnvironment: {
      HOME: "/safe/home",
      PATH: "/safe/path",
      SUPABASE_SECRET_KEY: ambientSecretValues[0],
      NODE_OPTIONS: "--require=unapproved-module",
    },
    spawn(command, arguments_, options) {
      gitSpawnCalls.push({ command, arguments_, options });
      return arguments_[0] === "rev-parse"
        ? { status: 0, stdout: `${head}\n`, stderr: "" }
        : { status: 0, stdout: "", stderr: "" };
    },
  }),
  { head, clean: true },
);
assert.deepEqual(
  gitSpawnCalls.map(({ command, arguments_ }) => [command, arguments_]),
  [
    ["git", ["rev-parse", "--verify", "HEAD"]],
    ["git", ["status", "--porcelain=v1", "--untracked-files=all"]],
  ],
);
for (const call of gitSpawnCalls) {
  assert.equal(call.options.shell, false);
  assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(call.options.env.SUPABASE_SECRET_KEY, undefined);
  assert.equal(call.options.env.NODE_OPTIONS, undefined);
}

const request = requestFor();
const events = [];
const tty = exactTty({ onEvent: (event) => events.push(event) });
const spawnCalls = [];
const output = [];
const errors = [];
let capturedAct = null;
let gitChecks = 0;
const successStatus = runExceptionalOpenReleaseTestHarness({
  argv: ["--request", requestPath],
  nodeVersion: "22.22.0",
  root,
  processEnvironment: {
    HOME: "/safe/home",
    PATH: "/safe/path",
    XDG_RUNTIME_DIR: keyringRuntimeDirectory,
    DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress,
    SUPABASE_SECRET_KEY: ambientSecretValues[0],
    TURNSTILE_SECRET: ambientSecretValues[1],
    CRON_SECRET: ambientSecretValues[2],
    COOKIE: "ambient-cookie-must-not-propagate",
    TOKEN: "ambient-token-must-not-propagate",
    NODE_OPTIONS: "--inspect",
  },
  now: () => new Date(now),
  inspectGitState() {
    gitChecks += 1;
    events.push(`git-${gitChecks}`);
    return { head, clean: true };
  },
  readRequest() {
    events.push("read-request");
    return request;
  },
  prepareEnvironment() {
    return { HOME: "/safe/home", PATH: "/safe/path" };
  },
  evaluateGateResults() {
    return externallyVerifiedGateResults();
  },
  createAct: createExceptionalReleaseAct,
  freezeArtifact() {
    events.push("freeze-artifact");
    return {
      artifactHash,
      artifactRoot: "/tmp/agorbis-exceptional-request.artifact",
      manifestPath: "/tmp/agorbis-exceptional-request.artifact.json",
    };
  },
  readArtifact({ expectedHead, expectedRequestHash, expectedArtifactHash }) {
    return {
      contentSha256: expectedArtifactHash,
      head: expectedHead,
      requestHash: expectedRequestHash,
    };
  },
  openTty() {
    events.push("open-tty");
    return tty;
  },
  spawn(command, arguments_, options) {
    events.push(`spawn-${spawnCalls.length + 1}`);
    spawnCalls.push({
      command,
      arguments_,
      options: { ...options, env: { ...options.env } },
    });
    return { status: 0 };
  },
  writeAct(input) {
    events.push("write-act");
    capturedAct = input.act;
    return {
      jsonPath: "/tmp/agorbis-exceptional-request.act.json",
      markdownPath: "/tmp/agorbis-exceptional-request.act.md",
      contentSha256: input.act.contentSha256,
    };
  },
  output(message) {
    output.push(message);
  },
  errorOutput(message) {
    errors.push(message);
  },
});

assert.equal(
  successStatus,
  EXCEPTIONAL_RELEASE_EXIT_CODE.RISK_ACCEPTED_BY_OWNER,
);
assert.equal(successStatus, 20);
assert.deepEqual(errors, []);
assert.equal(output.at(-1), "ESTO NO ES PASS");
assert.equal(gitChecks, 3);
assert.equal(events[0], "git-1");
assert.equal(events[1], "read-request");
assert.ok(events.indexOf("git-2") < events.indexOf("open-tty"));
assert.ok(events.indexOf("close-tty") < events.indexOf("git-3"));
assert.equal(events.at(-2), "git-3");
assert.equal(events.at(-1), "write-act");
assert.equal(tty.closed, true);
assert.ok(
  output.some((message) =>
    message.startsWith("Issuance: [test-only:no-issuance-written:"),
  ),
);

const expectedConfirmationPrompts = OWNER_WAIVER_CANDIDATE_GATE_IDS.flatMap(
  (gateId) => requiredRiskConfirmationPhrases(gateId, head),
);
assert.equal(expectedConfirmationPrompts.length, 8);
assert.deepEqual(tty.prompts, expectedConfirmationPrompts);
assert.deepEqual(
  tty.shownRisks,
  request.risks.map(({ gateId }) => ({
    gateId,
    consequence: getReleaseGateDefinition(gateId).consequence,
  })),
);
assert.ok(
  reservedSecretNames.every((name) => !tty.prompts.includes(name)),
  "El runner excepcional no solicita Worker Secrets.",
);

assert.equal(spawnCalls.length, 6);
for (const call of spawnCalls) {
  assert.equal(call.options.cwd, root);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.stdio, "inherit");
  for (const secretName of reservedSecretNames) {
    assert.equal(call.options.env[secretName], undefined);
  }
  for (const secretValue of ambientSecretValues) {
    assert.equal(Object.values(call.options.env).includes(secretValue), false);
  }
  assert.equal(call.options.env.COOKIE, undefined);
  assert.equal(call.options.env.TOKEN, undefined);
  assert.equal(call.options.env.NODE_OPTIONS, undefined);
}
assert.equal(
  spawnCalls[1].options.env.XDG_RUNTIME_DIR,
  keyringRuntimeDirectory,
);
assert.equal(
  spawnCalls[1].options.env.DBUS_SESSION_BUS_ADDRESS,
  keyringSessionBusAddress,
);
for (const [index, call] of spawnCalls.entries()) {
  if (index === 1) continue;
  assert.equal(call.options.env.XDG_RUNTIME_DIR, undefined);
  assert.equal(call.options.env.DBUS_SESSION_BUS_ADDRESS, undefined);
}
assert.deepEqual(spawnCalls.at(-1).arguments_.slice(1), [
  "triggers",
  "deploy",
  "--config",
  "/tmp/agorbis-exceptional-request.artifact/wrangler.crons-open.jsonc",
  "--cwd",
  "/tmp/agorbis-exceptional-request.artifact",
  "--env-file",
  "/tmp/agorbis-exceptional-request.artifact/exceptional-release-empty.env",
  "--dry-run",
]);
assert.equal(
  spawnCalls.filter(({ arguments_ }) => arguments_.includes("--dry-run"))
    .length,
  2,
);
assert.doesNotMatch(
  JSON.stringify(
    spawnCalls.map(({ command, arguments_ }) => ({ command, arguments_ })),
  ),
  /(?:secret\s+(?:put|delete|bulk)|db\s+push|migration\s+up|dns\s+(?:create|delete)|schedules?\s+(?:create|delete)|pnpm[^\n]*deploy)/i,
);

assert.ok(capturedAct);
assert.equal(capturedAct.deploymentAuthorized, false);
assert.equal(capturedAct.deploymentExecuted, false);
assert.equal(capturedAct.productionMutationCommandsExecuted, false);
assert.equal(capturedAct.commands.length, 6);
assert.deepEqual(
  capturedAct.commands.map((command) => Object.keys(command).sort()),
  Array.from({ length: 6 }, () => ["exitCode", "label"]),
);
assert.ok(capturedAct.commands.every(({ exitCode }) => exitCode === 0));
assert.equal(
  capturedAct.gates.filter(
    ({ releaseDisposition }) =>
      releaseDisposition === RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
  ).length,
  7,
);
assert.equal(
  capturedAct.gates.filter(
    ({ gatePolicy, evidenceStatus, releaseDisposition }) =>
      gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE &&
      evidenceStatus === EVIDENCE_STATUS.PASS &&
      releaseDisposition === RELEASE_DISPOSITION.PASS,
  ).length,
  27,
);
const actJson = renderExceptionalReleaseActJson(capturedAct);
const actMarkdown = renderExceptionalReleaseActMarkdown(capturedAct);
assert.match(actMarkdown, /ESTO NO ES PASS/);
for (const secretName of reservedSecretNames) {
  assert.doesNotMatch(actJson, new RegExp(secretName));
  assert.doesNotMatch(actMarkdown, new RegExp(secretName));
}
for (const secretValue of ambientSecretValues) {
  assert.doesNotMatch(actJson, new RegExp(secretValue));
  assert.doesNotMatch(actMarkdown, new RegExp(secretValue));
  assert.doesNotMatch(output.join("\n"), new RegExp(secretValue));
  assert.doesNotMatch(errors.join("\n"), new RegExp(secretValue));
}
for (const keyringTransportValue of [
  keyringRuntimeDirectory,
  keyringSessionBusAddress,
]) {
  assert.doesNotMatch(actJson, new RegExp(keyringTransportValue));
  assert.doesNotMatch(actMarkdown, new RegExp(keyringTransportValue));
  assert.doesNotMatch(output.join("\n"), new RegExp(keyringTransportValue));
  assert.doesNotMatch(errors.join("\n"), new RegExp(keyringTransportValue));
}

function inertDependencies(overrides = {}) {
  const counters = { read: 0, tty: 0, spawn: 0, write: 0 };
  return {
    counters,
    options: {
      argv: ["--request", requestPath],
      nodeVersion: "22.22.0",
      root,
      processEnvironment: {
        PATH: "/safe/path",
        XDG_RUNTIME_DIR: keyringRuntimeDirectory,
        DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress,
      },
      now: () => new Date(now),
      inspectGitState: () => ({ head, clean: true }),
      readRequest: () => {
        counters.read += 1;
        return request;
      },
      prepareEnvironment: () => ({ PATH: "/safe/path" }),
      evaluateGateResults: () => externallyVerifiedGateResults(),
      createAct: createExceptionalReleaseAct,
      freezeArtifact: () => ({
        artifactHash,
        artifactRoot: "/tmp/agorbis-exceptional-request.artifact",
        manifestPath: "/tmp/agorbis-exceptional-request.artifact.json",
      }),
      readArtifact: ({
        expectedHead,
        expectedRequestHash,
        expectedArtifactHash,
      }) => ({
        contentSha256: expectedArtifactHash,
        head: expectedHead,
        requestHash: expectedRequestHash,
      }),
      openTty: () => {
        counters.tty += 1;
        return exactTty();
      },
      spawn: () => {
        counters.spawn += 1;
        return { status: 0 };
      },
      writeAct: () => {
        counters.write += 1;
        return { jsonPath: "/tmp/a", markdownPath: "/tmp/b" };
      },
      output() {},
      errorOutput() {},
      ...overrides,
    },
  };
}

const forbiddenIssuerInjection = inertDependencies();
forbiddenIssuerInjection.options.issueAct = () => {
  throw new Error("El issuer inyectado nunca debe ejecutarse.");
};
assert.throws(
  () => runExceptionalOpenReleaseTestHarness(forbiddenIssuerInjection.options),
  /todas las dependencias explícitas/i,
);
assert.deepEqual(forbiddenIssuerInjection.counters, {
  read: 0,
  tty: 0,
  spawn: 0,
  write: 0,
});

const defaultConservativeErrors = [];
const defaultConservative = inertDependencies({
  evaluateGateResults: evaluateExceptionalGateResults,
  errorOutput: (message) => defaultConservativeErrors.push(message),
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(defaultConservative.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
);
assert.equal(defaultConservative.counters.spawn, 6);
assert.equal(defaultConservative.counters.tty, 0);
assert.equal(defaultConservative.counters.write, 0);
assert.ok(
  defaultConservativeErrors.includes("Gates no renunciables sin PASS real:"),
);
for (const blocker of conservativeBlockers) {
  assert.ok(
    defaultConservativeErrors.some((message) =>
      message.startsWith(`  - ${blocker.gateId}:`),
    ),
    `El bloqueo conservador debe enumerar ${blocker.gateId}.`,
  );
}
assert.equal(
  defaultConservativeErrors.at(-1),
  "Release excepcional: BLOQUEADO; no se emitió acta.",
);

const missingRisk = inertDependencies({
  readRequest: undefined,
});
missingRisk.options.readRequest = () => {
  missingRisk.counters.read += 1;
  return requestFor(OWNER_WAIVER_CANDIDATE_GATE_IDS.slice(0, -1));
};
assert.equal(
  runExceptionalOpenReleaseTestHarness(missingRisk.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
);
assert.deepEqual(missingRisk.counters, {
  read: 1,
  tty: 0,
  spawn: 6,
  write: 0,
});

const noRiskTechnicalPass = inertDependencies({
  readRequest: () => requestFor([]),
  evaluateGateResults: () => allPassGateResults(),
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(noRiskTechnicalPass.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.TECHNICAL_PASS,
);
assert.deepEqual(noRiskTechnicalPass.counters, {
  read: 0,
  tty: 0,
  spawn: 6,
  write: 1,
});

const invalidRequest = inertDependencies({
  readRequest: () => ({ ...request, policyHash: "0".repeat(64) }),
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(invalidRequest.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
);
assert.equal(invalidRequest.counters.tty, 0);
assert.equal(invalidRequest.counters.spawn, 0);
assert.equal(invalidRequest.counters.write, 0);

let readAfterDirty = false;
const dirtyWorktree = inertDependencies({
  inspectGitState: () => ({ head, clean: false }),
  readRequest: () => {
    readAfterDirty = true;
    return request;
  },
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(dirtyWorktree.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
);
assert.equal(readAfterDirty, false);
assert.equal(dirtyWorktree.counters.tty, 0);
assert.equal(dirtyWorktree.counters.spawn, 0);

const wrongConfirmationTty = exactTty({ wrongFirstConfirmation: true });
const wrongConfirmation = inertDependencies({
  openTty: () => wrongConfirmationTty,
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(wrongConfirmation.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
);
assert.equal(wrongConfirmationTty.closed, true);
assert.equal(wrongConfirmation.counters.spawn, 6);
assert.equal(wrongConfirmation.counters.write, 0);

let commandAttempts = 0;
const commandFailureErrors = [];
const commandFailure = inertDependencies({
  spawn: () => {
    commandAttempts += 1;
    return { status: commandAttempts === 3 ? 9 : 0 };
  },
  errorOutput: (message) => commandFailureErrors.push(message),
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(commandFailure.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
);
assert.equal(commandAttempts, 4);
assert.equal(commandFailure.counters.tty, 0);
assert.equal(commandFailure.counters.write, 0);
assert.ok(
  commandFailureErrors.includes(
    "  - production-closed-smoke-read: exitCode=9; reason=child",
  ),
);

let closedStateFailureAttempts = 0;
const closedStateFailureErrors = [];
const closedStateFailure = inertDependencies({
  spawn: () => {
    closedStateFailureAttempts += 1;
    return { status: closedStateFailureAttempts === 2 ? 23 : 0 };
  },
  errorOutput: (message) => closedStateFailureErrors.push(message),
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(closedStateFailure.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
);
assert.equal(closedStateFailureAttempts, 3);
assert.ok(
  closedStateFailureErrors.includes(
    "  - cloudflare-closed-state-read: exitCode=23; reason=child",
  ),
);
assert.ok(
  closedStateFailureErrors.includes(
    "  - production-closed-smoke-read: exitCode=125; reason=closed-state-prerequisite",
  ),
);

const relativePath = inertDependencies({
  argv: ["--request", "relative-request.json"],
});
assert.equal(
  runExceptionalOpenReleaseTestHarness(relativePath.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.INVALID_REQUEST,
);
assert.equal(relativePath.counters.read, 0);
assert.equal(relativePath.counters.tty, 0);
assert.equal(relativePath.counters.spawn, 0);

const wrongNode = inertDependencies({ nodeVersion: "22.21.1" });
assert.equal(
  runExceptionalOpenReleaseTestHarness(wrongNode.options),
  EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
);
assert.equal(wrongNode.counters.read, 0);
assert.equal(wrongNode.counters.spawn, 0);

for (const missingTransportName of [
  "XDG_RUNTIME_DIR",
  "DBUS_SESSION_BUS_ADDRESS",
]) {
  const errors = [];
  const missingTransport = inertDependencies({
    processEnvironment: {
      PATH: "/safe/path",
      XDG_RUNTIME_DIR: keyringRuntimeDirectory,
      DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress,
      [missingTransportName]: undefined,
    },
    errorOutput: (message) => errors.push(message),
  });
  delete missingTransport.options.processEnvironment[missingTransportName];
  assert.equal(
    runExceptionalOpenReleaseTestHarness(missingTransport.options),
    EXCEPTIONAL_RELEASE_EXIT_CODE.BLOCKED,
  );
  assert.equal(missingTransport.counters.read, 1);
  assert.equal(missingTransport.counters.spawn, 0);
  assert.equal(missingTransport.counters.tty, 0);
  assert.equal(missingTransport.counters.write, 0);
  assert.deepEqual(errors, [
    "Los gates de entorno excepcional permanecen bloqueados.",
  ]);
  assert.doesNotMatch(errors.join("\n"), /run\/user|unix:path/u);
}

console.log("Exceptional open release runner tests: PASS");
