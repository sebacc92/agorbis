#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLOUDFLARE_PUBLIC_BUILD_VARIABLES } from "./cloudflare-public-build-environment.mjs";
import {
  OPEN_RELEASE_SECRET_NAMES,
  assertOpenReleaseNode,
  executeOpenReleaseDryRun,
  openReleaseSteps,
  prepareD72CandidateBuildEnvironment,
  prepareExceptionalOpenReleaseEnvironment,
  prepareExceptionalWranglerKeyringTransportEnvironment,
  prepareOpenReleaseEnvironment,
  validatePromptedSecrets,
} from "./open-release-runner-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "scripts/run-open-release.mjs");
const testSecrets = Object.freeze({
  SUPABASE_SECRET_KEY: `sb_secret_${"S".repeat(24)}`,
  TURNSTILE_SECRET: "T".repeat(24),
  CRON_SECRET: "C".repeat(40),
});

assert.deepEqual(OPEN_RELEASE_SECRET_NAMES, [
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
  "CRON_SECRET",
]);
assert.doesNotThrow(() => assertOpenReleaseNode("22.22.0"));
assert.throws(() => assertOpenReleaseNode("24.0.0"), /Node 22/);

const pending = spawnSync(process.execPath, [runner], {
  cwd: root,
  encoding: "utf8",
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SUPABASE_SECRET_KEY: "ambient-secret-must-not-appear",
  },
});
assert.equal(pending.status, 1);
assert.match(pending.stderr, /bloqueada antes de solicitar secretos/);
assert.match(pending.stderr, /PUBLIC_AAIP_DATABASE_REGISTRATION_ID/);
assert.doesNotMatch(
  pending.stderr + pending.stdout,
  /ambient-secret-must-not-appear/,
);
assert.doesNotMatch(pending.stderr, /terminal interactiva|\/dev\/tty/);

assert.throws(
  () =>
    prepareOpenReleaseEnvironment({
      processEnvironment: { PATH: "/safe/path", HOME: "/safe/home" },
      variables: CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
    }),
  /PUBLIC_AAIP_DATABASE_REGISTRATION_ID/,
);

// Success paths keep testing the existing email-only release configuration.
// The repository's Google target is deliberately blocked by its current notice.
const emailOnlyVariables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map((variable) =>
  variable.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
    ? { ...variable, value: "false" }
    : variable.name.startsWith("PUBLIC_GOOGLE_PROCESSING_LOCATION")
      ? {
          ...variable,
          status: "not-applicable",
          value: "",
          requiredForOpen: false,
        }
      : variable,
);
const exceptionalEnvironment = prepareExceptionalOpenReleaseEnvironment({
  variables: emailOnlyVariables,
  acceptedRiskGateIds: [
    "legal.aaip-registration-pending",
    "privacy.provider-locations-unverified",
    "privacy.provider-retention-unverified",
    "legal.transfer-safeguards-unverified",
  ],
  processEnvironment: {
    PATH: "/safe/path",
    HOME: "/safe/home",
    SUPABASE_SECRET_KEY: "ambient-secret",
  },
});
const candidateEnvironment = prepareD72CandidateBuildEnvironment({
  variables: emailOnlyVariables,
  requestedRiskGateIds: [
    "legal.aaip-registration-pending",
    "privacy.retention-unreconciled",
    "privacy.provider-locations-unverified",
    "privacy.provider-retention-unverified",
    "legal.transfer-safeguards-unverified",
    "recovery.production-backup-not-verified",
    "legal.sensitive-consent-0059-omitted",
  ],
  processEnvironment: {
    PATH: "/safe/path",
    HOME: "/safe/home",
    CRON_SECRET: "ambient-secret",
  },
});
assert.equal(candidateEnvironment.AGORBIS_D72_CANDIDATE_BUILD, "true");
assert.equal(candidateEnvironment.AGORBIS_D72_DEPLOYMENT_AUTHORIZED, "false");
assert.equal(candidateEnvironment.AGORBIS_D72_DEPLOYMENT_EXECUTED, "false");
assert.equal(
  candidateEnvironment.AGORBIS_D72_RISK_ACCEPTANCE_RECORDED,
  "false",
);
assert.equal(candidateEnvironment.CRON_SECRET, undefined);
assert.equal(candidateEnvironment.PUBLIC_AAIP_DATABASE_REGISTRATION_ID, "");
assert.equal(
  exceptionalEnvironment.AAIP_DATABASE_REGISTRATION_STATUS,
  "pending",
);
assert.equal(exceptionalEnvironment.PUBLIC_AAIP_DATABASE_REGISTRATION_ID, "");
assert.equal(exceptionalEnvironment.PRODUCTION_BACKUP_STATUS, "not_verified");
assert.equal(exceptionalEnvironment.GOOGLE_DRIVE_BACKUP_STATUS, "inactive");
assert.equal(exceptionalEnvironment.SUPABASE_SECRET_KEY, undefined);
assert.equal(exceptionalEnvironment.PATH, "/safe/path");
assert.equal(exceptionalEnvironment.PUBLIC_SITE_URL, "https://agorbis.com");
assert.equal(exceptionalEnvironment.XDG_RUNTIME_DIR, undefined);
assert.equal(exceptionalEnvironment.DBUS_SESSION_BUS_ADDRESS, undefined);
const environment = exceptionalEnvironment;

const keyringRuntimeDirectory = "/run/user/1000";
const keyringSessionBusAddress = "unix:path=/run/user/1000/bus";
const keyringTransportEnvironment =
  prepareExceptionalWranglerKeyringTransportEnvironment({
    processEnvironment: {
      XDG_RUNTIME_DIR: keyringRuntimeDirectory,
      DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress,
      GNOME_KEYRING_CONTROL: "/run/user/1000/keyring",
      DISPLAY: ":0",
      SSH_AUTH_SOCK: "/run/user/1000/ssh-agent.socket",
      CLOUDFLARE_API_TOKEN: "fixture-token-must-not-propagate",
      NODE_OPTIONS: "--inspect",
    },
    uid: 1000,
  });
assert.deepEqual(keyringTransportEnvironment, {
  DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress,
  XDG_RUNTIME_DIR: keyringRuntimeDirectory,
});
assert.equal(Object.isFrozen(keyringTransportEnvironment), true);
for (const forbiddenName of [
  "GNOME_KEYRING_CONTROL",
  "DISPLAY",
  "SSH_AUTH_SOCK",
  "CLOUDFLARE_API_TOKEN",
  "NODE_OPTIONS",
]) {
  assert.equal(
    Object.hasOwn(keyringTransportEnvironment, forbiddenName),
    false,
  );
}

for (const invalidKeyringTransport of [
  {},
  { XDG_RUNTIME_DIR: keyringRuntimeDirectory },
  { DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress },
  {
    XDG_RUNTIME_DIR: "relative/runtime",
    DBUS_SESSION_BUS_ADDRESS: "unix:path=relative/runtime/bus",
  },
  {
    XDG_RUNTIME_DIR: "/run/user/1001",
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1001/bus",
  },
  {
    XDG_RUNTIME_DIR: keyringRuntimeDirectory,
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/tmp/untrusted-bus",
  },
  {
    XDG_RUNTIME_DIR: `${keyringRuntimeDirectory}\n`,
    DBUS_SESSION_BUS_ADDRESS: `${keyringSessionBusAddress}\n`,
  },
]) {
  assert.throws(
    () =>
      prepareExceptionalWranglerKeyringTransportEnvironment({
        processEnvironment: invalidKeyringTransport,
        uid: 1000,
      }),
    /transporte canónico del keyring/u,
  );
}
assert.throws(
  () =>
    prepareExceptionalWranglerKeyringTransportEnvironment({
      processEnvironment: null,
      uid: 1000,
    }),
  /entorno de transporte del keyring/u,
);
assert.throws(
  () =>
    prepareExceptionalWranglerKeyringTransportEnvironment({
      processEnvironment: {
        XDG_RUNTIME_DIR: keyringRuntimeDirectory,
        DBUS_SESSION_BUS_ADDRESS: keyringSessionBusAddress,
      },
      uid: null,
    }),
  /entorno de transporte del keyring/u,
);
assert.throws(
  () =>
    prepareExceptionalOpenReleaseEnvironment({
      acceptedRiskGateIds: ["legal.aaip-registration-pending"],
    }),
  /Apertura excepcional bloqueada/,
);

assert.doesNotThrow(() => validatePromptedSecrets(testSecrets));
assert.throws(
  () => validatePromptedSecrets({ ...testSecrets, EXTRA_SECRET: "no" }),
  /exactamente los tres secretos/,
);

const calls = [];
const successfulStatus = executeOpenReleaseDryRun({
  root,
  nonSecretEnvironment: environment,
  secrets: testSecrets,
  spawn(command, arguments_, options) {
    calls.push({ command, arguments_, options });
    return { status: 0 };
  },
});
assert.equal(successfulStatus, 0);
assert.equal(calls.length, 2);
assert.deepEqual(
  calls.map(({ arguments_ }) => arguments_),
  openReleaseSteps(root).map(({ arguments: arguments_ }) => arguments_),
);
for (const call of calls) {
  assert.equal(call.options.shell, false);
  assert.doesNotMatch(
    JSON.stringify(call.arguments_),
    /sb_secret_|T{20}|C{32}/,
  );
}
assert.equal(
  calls[0].options.env.SUPABASE_SECRET_KEY,
  testSecrets.SUPABASE_SECRET_KEY,
);
assert.equal(calls[1].options.env.SUPABASE_SECRET_KEY, undefined);
assert.equal(calls[1].options.env.TURNSTILE_SECRET, undefined);
assert.equal(calls[1].options.env.CRON_SECRET, undefined);

let attempts = 0;
const propagatedStatus = executeOpenReleaseDryRun({
  root,
  nonSecretEnvironment: environment,
  secrets: testSecrets,
  spawn() {
    attempts += 1;
    return { status: 37 };
  },
});
assert.equal(propagatedStatus, 37);
assert.equal(attempts, 1);

console.log("Open release runner tests: PASS");
