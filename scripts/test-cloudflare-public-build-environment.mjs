#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  readWranglerConfiguration,
  validateOpenRecoveryConfiguration,
} from "./cloudflare-worker-policy.mjs";
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  readCurrentTransferConsentSnapshot,
  socialAuthConsentBlockers,
} from "./social-auth-consent-policy.mjs";
import { fileURLToPath } from "node:url";
import {
  CLOUDFLARE_PUBLIC_BUILD_LOCK,
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  cloudflareBuildProcessEnvironment,
  d72CandidateBuildBlockers,
  publicBuildEnvironment,
  publicBuildOpeningBlockers,
  serializePublicBuildEnvironment,
  validatePublicBuildInventory,
} from "./cloudflare-public-build-environment.mjs";

const script = fileURLToPath(
  new URL("./cloudflare-public-build-environment.mjs", import.meta.url),
);
const publicExampleNames = readFileSync(
  fileURLToPath(new URL("../.env.example", import.meta.url)),
  "utf8",
)
  .split(/\r?\n/)
  .map((line) => /^\s*(PUBLIC_[A-Z0-9_]+)=/.exec(line)?.[1])
  .filter(Boolean)
  .sort();

assert.deepEqual(validatePublicBuildInventory(), []);
assert.equal(CLOUDFLARE_PUBLIC_BUILD_VARIABLES.length, 25);
assert.equal(
  new Set(CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(({ name }) => name)).size,
  25,
);
assert.ok(
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES.every(({ name }) =>
    name.startsWith("PUBLIC_"),
  ),
);
assert.deepEqual(
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(({ name }) => name).sort(),
  publicExampleNames,
);

const shared = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.filter(
  ({ scope }) => scope === "build-and-worker-runtime",
).map(({ name }) => name);
assert.deepEqual(shared, [
  "PUBLIC_SITE_URL",
  "PUBLIC_SUPABASE_URL",
  "PUBLIC_SUPABASE_ANON_KEY",
  "PUBLIC_GOOGLE_AUTH_ENABLED",
  "PUBLIC_FACEBOOK_AUTH_ENABLED",
]);
assert.equal(
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES.filter(
    ({ scope }) => scope === "vite-build-only",
  ).length,
  20,
);

const aaipStatus = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(
  ({ name }) => name === "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
);
assert.equal(aaipStatus?.status, "confirmed");
assert.equal(aaipStatus?.value, "pending");

for (const provider of ["GOOGLE", "FACEBOOK"]) {
  const flag = `PUBLIC_${provider}_AUTH_ENABLED`;
  assert.equal(
    CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(({ name }) => name === flag)?.value,
    provider === "GOOGLE" ? "true" : "false",
  );
  const enabledWithoutDestinations = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
    (variable) =>
      variable.name === flag
        ? { ...variable, value: "true" }
        : variable.name.startsWith(`PUBLIC_${provider}_PROCESSING_LOCATION`)
          ? {
              ...variable,
              status: "not-applicable",
              value: "",
              requiredForOpen: false,
            }
          : { ...variable },
  );
  const errors = validatePublicBuildInventory(enabledWithoutDestinations).join(
    "\n",
  );
  assert.ok(
    errors.includes(`PUBLIC_${provider}_PROCESSING_LOCATION debe confirmarse`),
  );
  assert.ok(
    errors.includes(
      `PUBLIC_${provider}_PROCESSING_LOCATION_EN debe confirmarse`,
    ),
  );
}

for (const name of [
  "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
  "PUBLIC_TRANSFER_SAFEGUARDS",
  "PUBLIC_TRANSFER_SAFEGUARDS_EN",
]) {
  const variable = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(
    (candidate) => candidate.name === name,
  );
  assert.equal(variable?.status, "pending");
  assert.equal(variable?.value, "");
  assert.equal(variable?.requiredForOpen, true);
}

const blockers = publicBuildOpeningBlockers();
const widgetASiteKey = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(
  ({ name }) => name === "PUBLIC_TURNSTILE_SITE_KEY",
);
assert.equal(widgetASiteKey?.status, "confirmed");
assert.equal(widgetASiteKey?.value, "0x4AAAAAAFsE7Y2uFQXTKPvn");
// El domicilio del responsable es su casa: no se publica ni se versiona en un
// repositorio público. Que no vuelva a entrar al build por error.
assert.equal(
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES.some(({ name }) => /DOMICILE/.test(name)),
  false,
);
assert.equal(
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(
    ({ name }) => name === "PUBLIC_AAIP_CONTROLLER_ID",
  )?.value,
  "RL-2026-81658385-APN-DNPDP#AAIP",
);
assert.ok(
  blockers.some((blocker) =>
    blocker.startsWith("PUBLIC_AAIP_DATABASE_REGISTRATION_ID:"),
  ),
);
assert.ok(
  blockers.some((blocker) => blocker.startsWith("PUBLIC_TRANSFER_SAFEGUARDS:")),
);
assert.ok(
  blockers.some((blocker) =>
    blocker.startsWith("PUBLIC_TRANSFER_SAFEGUARDS_EN:"),
  ),
);
assert.throws(
  () => publicBuildEnvironment({ mode: "open" }),
  /Apertura pública bloqueada:[\s\S]*PUBLIC_TRANSFER_SAFEGUARDS[\s\S]*PUBLIC_TRANSFER_SAFEGUARDS_EN/,
);

const exceptionalPublicRiskGateIds = [
  "legal.aaip-registration-pending",
  "privacy.provider-locations-unverified",
  "privacy.provider-retention-unverified",
  "legal.transfer-safeguards-unverified",
];
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
for (const name of [
  "PUBLIC_GOOGLE_PROCESSING_LOCATION",
  "PUBLIC_GOOGLE_PROCESSING_LOCATION_EN",
]) {
  const variable = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.find(
    (candidate) => candidate.name === name,
  );
  assert.equal(variable.status, "confirmed");
  assert.equal(variable.requiredForOpen, true);
  assert.match(variable.source, /operator-standard-terms-confirmed/);
  assert.match(variable.value, /global/);
}
const currentGoogleBlockers = publicBuildOpeningBlockers(
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  { acceptedRiskGateIds: exceptionalPublicRiskGateIds },
);
assert.deepEqual(currentGoogleBlockers, []);
// El escenario enciende Google a propósito: con D97 el objetivo real lo apaga y
// las ubicaciones pendientes dejan de bloquear.
const pendingGoogleLocations = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    variable.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
      ? { ...variable, value: "true" }
      : variable.name.startsWith("PUBLIC_GOOGLE_PROCESSING_LOCATION")
        ? {
            ...variable,
            status: "pending",
            value: "",
            blockingReason: "Falta confirmar ubicación de Google.",
          }
        : variable,
);
const googleBlockers = publicBuildOpeningBlockers(pendingGoogleLocations, {
  acceptedRiskGateIds: exceptionalPublicRiskGateIds,
});
assert.equal(googleBlockers.length, 2);
assert.doesNotMatch(
  googleBlockers.join("\n"),
  /consentimiento OAuth bloqueado para Google/,
);
assert.match(googleBlockers.join("\n"), /PUBLIC_GOOGLE_PROCESSING_LOCATION:/);
assert.match(
  googleBlockers.join("\n"),
  /PUBLIC_GOOGLE_PROCESSING_LOCATION_EN:/,
);
assert.doesNotMatch(googleBlockers.join("\n"), /PUBLIC_FACEBOOK_/);
// Escenario con Google encendido a propósito (D97 lo apaga en el objetivo real).
const googleDestinationsConfirmed = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    variable.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
      ? { ...variable, value: "true" }
      : variable.name.startsWith("PUBLIC_GOOGLE_PROCESSING_LOCATION")
        ? {
            ...variable,
            status: "confirmed",
            value: variable.name.endsWith("_EN")
              ? "Processing locations described by the contractual scope."
              : "Lugares de tratamiento descritos por el alcance contractual.",
          }
        : variable,
);
assert.deepEqual(validatePublicBuildInventory(googleDestinationsConfirmed), []);
assert.throws(
  () =>
    publicBuildEnvironment({
      mode: "open",
      variables: googleDestinationsConfirmed,
    }),
  /Apertura pública bloqueada/,
  "La cobertura de Google no aprueba la evidencia externa que sigue pendiente.",
);
for (const mode of ["exceptional-open", "d72-candidate"]) {
  const environment = publicBuildEnvironment({
    mode,
    variables: googleDestinationsConfirmed,
    ...(mode === "d72-candidate"
      ? { candidateRiskGateIds: exceptionalPublicRiskGateIds }
      : { acceptedRiskGateIds: exceptionalPublicRiskGateIds }),
  });
  assert.equal(environment.PUBLIC_GOOGLE_AUTH_ENABLED, "true");
  assert.equal(environment.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
}
assert.deepEqual(
  publicBuildOpeningBlockers(emailOnlyVariables, {
    acceptedRiskGateIds: exceptionalPublicRiskGateIds,
  }),
  [],
);
const exceptional = publicBuildEnvironment({
  variables: emailOnlyVariables,
  mode: "exceptional-open",
  acceptedRiskGateIds: exceptionalPublicRiskGateIds,
});
assert.deepEqual(
  d72CandidateBuildBlockers(emailOnlyVariables, {
    candidateRiskGateIds: exceptionalPublicRiskGateIds,
  }),
  [],
);
const candidate = publicBuildEnvironment({
  variables: emailOnlyVariables,
  mode: "d72-candidate",
  candidateRiskGateIds: exceptionalPublicRiskGateIds,
});
assert.deepEqual(candidate, exceptional);
assert.throws(
  () =>
    publicBuildEnvironment({
      mode: "d72-candidate",
      acceptedRiskGateIds: exceptionalPublicRiskGateIds,
    }),
  /parámetros separados/,
);
for (const name of [
  "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
  "PUBLIC_SUPABASE_PROCESSING_LOCATION",
  "PUBLIC_RESEND_PROCESSING_LOCATION",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY",
  "PUBLIC_TRANSFER_SAFEGUARDS",
]) {
  assert.equal(
    exceptional[name],
    "",
    `${name} debe seguir factualmente vacío.`,
  );
}
assert.throws(
  () =>
    publicBuildEnvironment({
      mode: "exceptional-open",
      acceptedRiskGateIds: ["security.auth-functional"],
    }),
  /desconocido o no renunciable/,
);
assert.throws(
  () =>
    publicBuildEnvironment({
      mode: "exceptional-open",
      acceptedRiskGateIds: ["legal.aaip-registration-pending"],
    }),
  /Apertura pública bloqueada:[\s\S]*PUBLIC_TRANSFER_SAFEGUARDS/,
);

const previousPublicSiteUrl = process.env.PUBLIC_SITE_URL;
try {
  process.env.PUBLIC_SITE_URL = "https://must-not-be-read.invalid";
  const closed = publicBuildEnvironment({ mode: "closed" });
  assert.equal(closed.PUBLIC_SITE_URL, "https://agorbis.com");
  assert.equal(closed.PUBLIC_GOOGLE_AUTH_ENABLED, "false");
  assert.equal(closed.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
  assert.ok(Object.keys(closed).every((name) => name.startsWith("PUBLIC_")));
  assert.ok(!JSON.stringify(closed).includes("must-not-be-read"));
  assert.match(closed.PUBLIC_SUPABASE_ANON_KEY, /^sb_publishable_/);
  assert.doesNotMatch(JSON.stringify(closed), /sb_secret_|eyJhbGciOi/);
} finally {
  if (previousPublicSiteUrl === undefined) {
    delete process.env.PUBLIC_SITE_URL;
  } else {
    process.env.PUBLIC_SITE_URL = previousPublicSiteUrl;
  }
}

const dotenv = serializePublicBuildEnvironment({ mode: "closed" });
assert.equal(dotenv.split("\n").filter(Boolean).length, 25);
assert.ok(
  dotenv
    .split("\n")
    .filter(Boolean)
    .every((line) => /^PUBLIC_[A-Z0-9_]+="/.test(line)),
);
assert.doesNotMatch(dotenv, /(?:^|\n)(?!PUBLIC_)[A-Z][A-Z0-9_]+=/);
assert.equal(
  dotenv,
  serializePublicBuildEnvironment({ mode: "closed", format: "dotenv" }),
);

const invalidUnknown = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map((variable) => ({
  ...variable,
}));
invalidUnknown.push({
  name: "RUNTIME_CREDENTIAL",
  scope: "vite-build-only",
  status: "confirmed",
  value: "forbidden",
  source: "test",
  requiredForOpen: true,
  blockingReason: "",
});
assert.match(
  validatePublicBuildInventory(invalidUnknown).join("\n"),
  /nombre no permitido/,
);

const invalidPendingValue = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map((variable) =>
  variable.name === "PUBLIC_TRANSFER_SAFEGUARDS"
    ? { ...variable, value: "texto no confirmado" }
    : { ...variable },
);
assert.match(
  validatePublicBuildInventory(invalidPendingValue).join("\n"),
  /no confirmado no puede contener un valor/,
);

for (const placeholder of [
  "valor de prueba",
  "valor de ejemplo",
  "fake-value",
  "valor falso",
]) {
  const invalidPlaceholder = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
    (variable) =>
      variable.name === "PUBLIC_PROVIDER_RETENTION_SUMMARY"
        ? { ...variable, status: "confirmed", value: placeholder }
        : { ...variable },
  );
  assert.match(
    validatePublicBuildInventory(invalidPlaceholder).join("\n"),
    /PUBLIC_PROVIDER_RETENTION_SUMMARY.*placeholder/,
  );
}

const identicalBilingualDisclosure = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    [
      "PUBLIC_PROVIDER_RETENTION_SUMMARY",
      "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
    ].includes(variable.name)
      ? {
          ...variable,
          status: "confirmed",
          value: "Contenido bilingüe sin evidencia acreditada",
        }
      : { ...variable },
);
assert.match(
  validatePublicBuildInventory(identicalBilingualDisclosure).join("\n"),
  /PUBLIC_PROVIDER_RETENTION_SUMMARY.*textos ES\/EN distintos/,
);

const cliOpen = spawnSync(process.execPath, [script, "export-open", "dotenv"], {
  encoding: "utf8",
  env: {
    PATH: process.env.PATH,
    SUPABASE_SECRET_KEY: "must-not-be-read",
    TURNSTILE_SECRET: "must-not-be-read",
    CRON_SECRET: "must-not-be-read",
  },
});
assert.notEqual(cliOpen.status, 0);
assert.match(cliOpen.stderr, /Apertura pública bloqueada/);
assert.doesNotMatch(cliOpen.stdout + cliOpen.stderr, /must-not-be-read/);

const cliClosed = spawnSync(
  process.execPath,
  [script, "export-closed", "json"],
  {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SUPABASE_SECRET_KEY: "must-not-be-read",
      TURNSTILE_SECRET: "must-not-be-read",
      CRON_SECRET: "must-not-be-read",
    },
  },
);
assert.equal(cliClosed.status, 0, cliClosed.stderr);
const parsedClosed = JSON.parse(cliClosed.stdout);
assert.equal(Object.keys(parsedClosed).length, 25);
assert.ok(
  Object.keys(parsedClosed).every((name) => name.startsWith("PUBLIC_")),
);
assert.doesNotMatch(cliClosed.stdout + cliClosed.stderr, /must-not-be-read/);

const isolatedClosedBuildEnvironment = cloudflareBuildProcessEnvironment({
  mode: "closed",
  processEnvironment: {
    PATH: "/safe/bin",
    PUBLIC_SITE_URL: "https://must-not-win.invalid",
    PUBLIC_UNKNOWN_VALUE: "must-not-enter-vite",
    VITE_ACCIDENTAL_VALUE: "must-not-enter-vite",
    SUPABASE_SECRET_KEY: "must-not-enter-vite",
    TURNSTILE_SECRET: "must-not-enter-vite",
    CRON_SECRET: "must-not-enter-vite",
    GITHUB_TOKEN: "must-not-enter-vite",
  },
});
assert.equal(isolatedClosedBuildEnvironment.PATH, "/safe/bin");
assert.equal(isolatedClosedBuildEnvironment[CLOUDFLARE_PUBLIC_BUILD_LOCK], "1");
assert.equal(
  isolatedClosedBuildEnvironment.PUBLIC_SITE_URL,
  "https://agorbis.com",
);
assert.equal(isolatedClosedBuildEnvironment.PUBLIC_UNKNOWN_VALUE, undefined);
assert.equal(isolatedClosedBuildEnvironment.VITE_ACCIDENTAL_VALUE, undefined);
assert.equal(isolatedClosedBuildEnvironment.SUPABASE_SECRET_KEY, undefined);
assert.equal(isolatedClosedBuildEnvironment.TURNSTILE_SECRET, undefined);
assert.equal(isolatedClosedBuildEnvironment.CRON_SECRET, undefined);
assert.equal(isolatedClosedBuildEnvironment.GITHUB_TOKEN, undefined);
assert.deepEqual(
  Object.keys(isolatedClosedBuildEnvironment)
    .filter((name) => name.startsWith("PUBLIC_"))
    .sort(),
  CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(({ name }) => name).sort(),
);
for (const { name, status } of CLOUDFLARE_PUBLIC_BUILD_VARIABLES) {
  if (status !== "confirmed") {
    assert.equal(
      isolatedClosedBuildEnvironment[name],
      "",
      `${name} pendiente/no aplicable debe entrar vacío al build cerrado.`,
    );
  }
}
assert.throws(
  () =>
    cloudflareBuildProcessEnvironment({
      mode: "open",
      processEnvironment: { PATH: "/safe/bin" },
    }),
  /Apertura pública bloqueada/,
);

const viteConfigurationSource = readFileSync(
  fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  "utf8",
);
assert.match(viteConfigurationSource, /AGORBIS_CLOUDFLARE_PUBLIC_BUILD_LOCKED/);
assert.match(viteConfigurationSource, /envDir:\s*false/);

const cloudflareBuildSource = readFileSync(
  fileURLToPath(new URL("./cloudflare-build.mjs", import.meta.url)),
  "utf8",
);
const publicEnvironmentGatePosition = cloudflareBuildSource.indexOf(
  "viteEnvironment = cloudflareBuildProcessEnvironment",
);
const viteBuildPosition = cloudflareBuildSource.indexOf(
  'd72CandidateRequestPath ? D72_COMPOSITE_PINNED_PNPM_EXECUTABLE : "pnpm",',
);
assert.ok(publicEnvironmentGatePosition >= 0);
assert.ok(viteBuildPosition > publicEnvironmentGatePosition);
assert.match(
  cloudflareBuildSource,
  /d72CandidateRequestPath \? D72_COMPOSITE_PINNED_GIT_EXECUTABLE : "git"/,
);
assert.doesNotMatch(
  cloudflareBuildSource.slice(publicEnvironmentGatePosition, viteBuildPosition),
  /spawnSync\(/,
  "check-open debe resolverse antes de que pueda arrancar un subproceso de build.",
);

// Consent coverage cannot be granted by changing a flag, version, or snapshot hash.
const currentConsent = readCurrentTransferConsentSnapshot();
assert.equal(currentConsent.version, "2026-08-29.1");
assert.equal(
  currentConsent.contentHash,
  "052a72a73375da6930313cbc9f2736f8b63f0ad321342b9fdd66f727a34a1baa",
);
assert.deepEqual(
  socialAuthConsentBlockers(
    { PUBLIC_GOOGLE_AUTH_ENABLED: "false" },
    { root: "/nonexistent-consent-fixture" },
  ),
  [],
);
assert.match(
  socialAuthConsentBlockers(
    { PUBLIC_GOOGLE_AUTH_ENABLED: "true" },
    { root: "/nonexistent-consent-fixture" },
  ).join("\n"),
  /Consentimiento OAuth bloqueado/,
);
const consentRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-social-consent-policy-"),
);
try {
  mkdirSync(path.join(consentRoot, "src/lib"), { recursive: true });
  mkdirSync(path.join(consentRoot, "supabase/migrations"), { recursive: true });
  const snapshot = {
    es: { summary: "Snapshot sintético para pruebas" },
    en: { summary: "Synthetic snapshot for tests" },
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  for (const version of ["2026-08-29.1", "2099-01-01.1"]) {
    writeFileSync(
      path.join(consentRoot, "src/lib/legal.ts"),
      `export const INTERNATIONAL_TRANSFER_NOTICE_VERSION = "${version}";`,
    );
    writeFileSync(
      path.join(consentRoot, "supabase/migrations", currentConsent.migration),
      `insert into public.international_transfer_notice_versions (version, content_hash, content_snapshot, content_hash_algorithm) values ('${version}', '${hash}', $snapshot$${JSON.stringify(snapshot)}$snapshot$::jsonb, 'sha256-json-stringify-v1');`,
    );
    assert.match(
      socialAuthConsentBlockers(
        { PUBLIC_GOOGLE_AUTH_ENABLED: "true" },
        { root: consentRoot },
      ).join("\n"),
      /no tiene cobertura de proveedores revisada/,
    );
  }
  const file = path.join(
    consentRoot,
    "supabase/migrations",
    currentConsent.migration,
  );
  writeFileSync(file, readFileSync(file, "utf8").replace(hash, "0".repeat(64)));
  assert.match(
    socialAuthConsentBlockers(
      { PUBLIC_GOOGLE_AUTH_ENABLED: "true" },
      { root: consentRoot },
    ).join("\n"),
    /no coincide con su SHA-256/,
  );
} finally {
  rmSync(consentRoot, { recursive: true, force: true });
}

const googleOffWithPendingDisclosure = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    variable.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
      ? { ...variable, value: "false" }
      : variable,
);
assert.deepEqual(
  publicBuildOpeningBlockers(googleOffWithPendingDisclosure, {
    acceptedRiskGateIds: exceptionalPublicRiskGateIds,
  }),
  [],
);
assert.deepEqual(
  d72CandidateBuildBlockers(googleOffWithPendingDisclosure, {
    candidateRiskGateIds: exceptionalPublicRiskGateIds,
  }),
  [],
);
// Con el proveedor encendido, su divulgación no puede volverse opcional (D97 lo
// apaga en el objetivo real; el invariante se prueba con Google en "true").
const optionalGoogleDisclosure = CLOUDFLARE_PUBLIC_BUILD_VARIABLES.map(
  (variable) =>
    variable.name === "PUBLIC_GOOGLE_AUTH_ENABLED"
      ? { ...variable, value: "true" }
      : variable.name.startsWith("PUBLIC_GOOGLE_PROCESSING_LOCATION")
        ? { ...variable, requiredForOpen: false }
        : variable,
);
assert.match(
  validatePublicBuildInventory(optionalGoogleDisclosure).join("\n"),
  /obligatorio para apertura/,
);
console.log("Cloudflare public build environment tests: PASS");

const recoveryEnvironment = publicBuildEnvironment({
  mode: "d72-recovery",
  candidateRiskGateIds: exceptionalPublicRiskGateIds,
});
assert.equal(recoveryEnvironment.PUBLIC_GOOGLE_AUTH_ENABLED, "false");
assert.equal(recoveryEnvironment.PUBLIC_FACEBOOK_AUTH_ENABLED, "false");
const currentCandidate = publicBuildEnvironment({
  mode: "d72-candidate",
  candidateRiskGateIds: exceptionalPublicRiskGateIds,
});
assert.deepEqual(recoveryEnvironment, {
  ...currentCandidate,
  PUBLIC_GOOGLE_AUTH_ENABLED: "false",
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
});
assert.throws(
  () =>
    publicBuildEnvironment({
      mode: "d72-recovery",
      acceptedRiskGateIds: exceptionalPublicRiskGateIds,
    }),
  /parámetros separados/,
);
assert.throws(
  () => publicBuildEnvironment({ mode: "d72-recovery" }),
  /bloqueada/,
);
const productionProfile = readWranglerConfiguration(
  new URL("../wrangler.jsonc", import.meta.url),
);
const recoveryProfile = readWranglerConfiguration(
  new URL("../wrangler.open-recovery.jsonc", import.meta.url),
);
assert.deepEqual(
  validateOpenRecoveryConfiguration(recoveryProfile, productionProfile),
  [],
);
for (const change of [
  (v) => {
    v.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "true";
  },
  (v) => {
    v.vars.PUBLIC_FACEBOOK_AUTH_ENABLED = "true";
  },
  (v) => {
    v.vars.AGORBIS_LAUNCH_MODE = "closed";
  },
  (v) => {
    v.triggers.crons = [];
  },
  (v) => {
    v.workers_dev = true;
  },
  (v) => {
    v.routes = [];
  },
]) {
  const changed = structuredClone(recoveryProfile);
  change(changed);
  assert.ok(
    validateOpenRecoveryConfiguration(changed, productionProfile).length,
  );
}
console.log("OPEN recovery client/Worker profile: PASS");
