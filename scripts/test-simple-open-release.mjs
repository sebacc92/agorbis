import assert from "node:assert/strict";
import { parseExceptionalReleaseRequestJson } from "./exceptional-release-act.mjs";
import { OWNER_WAIVER_CANDIDATE_GATE_IDS } from "./release-gate-policy.mjs";
import {
  SIMPLE_OPEN_RELEASE_MANUAL_CHECKS,
  buildSimpleOpenReleaseRequest,
  parseSimpleOpenReleaseArguments,
  simpleOpenReleaseGitErrors,
  simpleOpenReleaseRequestPath,
  simpleOpenReleaseRiskSummary,
  simpleOpenReleaseSteps,
} from "./simple-open-release.mjs";

const head = "0123456789abcdef0123456789abcdef01234567";
const now = new Date("2026-11-02T12:00:00.000Z");

// Argumentos: sólo vacío o --dry-run.
assert.deepEqual(parseSimpleOpenReleaseArguments([]), { dryRun: false });
assert.deepEqual(parseSimpleOpenReleaseArguments(["--dry-run"]), {
  dryRun: true,
});
for (const argv of [["--yes"], ["--dry-run", "--dry-run"], ["deploy"]]) {
  assert.throws(() => parseSimpleOpenReleaseArguments(argv), /Uso/);
}

// Git: limpio, en main y alineado con origin/main.
const cleanGit = { branch: "main", head, originHead: head, porcelain: "" };
assert.deepEqual(simpleOpenReleaseGitErrors(cleanGit), []);
assert.equal(
  simpleOpenReleaseGitErrors({ ...cleanGit, porcelain: " M x" }).length,
  1,
);
assert.equal(
  simpleOpenReleaseGitErrors({ ...cleanGit, branch: "feature" }).length,
  1,
);
assert.match(
  simpleOpenReleaseGitErrors({ ...cleanGit, originHead: "f".repeat(40) })[0],
  /origin\/main/,
);
assert.equal(simpleOpenReleaseGitErrors({ ...cleanGit, head: null }).length, 1);
// La prueba sin subir puede correr antes del push, pero sigue exigiendo
// árbol limpio.
assert.deepEqual(
  simpleOpenReleaseGitErrors({
    ...cleanGit,
    originHead: "f".repeat(40),
    requireOrigin: false,
  }),
  [],
);
assert.equal(
  simpleOpenReleaseGitErrors({
    ...cleanGit,
    porcelain: " M x",
    requireOrigin: false,
  }).length,
  1,
);

// El request sale canónico, válido para el validador real y con los siete
// riesgos en el orden de la política.
const rendered = buildSimpleOpenReleaseRequest({ head, now });
const request = parseExceptionalReleaseRequestJson(rendered, {
  currentHead: head,
  now,
});
assert.equal(request.deploymentAuthorized, false);
assert.deepEqual(
  request.risks.map(({ gateId }) => gateId),
  [...OWNER_WAIVER_CANDIDATE_GATE_IDS],
);
assert.ok(
  request.risks.some(
    ({ gateId }) => gateId === "recovery.production-backup-not-verified",
  ),
);
// Con la revisión de la política vencida, no hay request ni build.
assert.throws(
  () =>
    buildSimpleOpenReleaseRequest({
      head,
      now: new Date("2026-12-01T00:00:01.000Z"),
    }),
  /fecha de revisión/,
);
// Un HEAD que no es completo tampoco produce request.
assert.throws(() => buildSimpleOpenReleaseRequest({ head: "abc", now }));

assert.equal(
  simpleOpenReleaseRiskSummary().length,
  OWNER_WAIVER_CANDIDATE_GATE_IDS.length,
);
assert.equal(
  simpleOpenReleaseRequestPath({ home: "/home/x", now }),
  "/home/x/.local/share/agorbis-release-requests/2026-11-02T12-00-00-000Z/request.json",
);

// Pasos: el dry-run nunca despliega ni corre el smoke contra Producción.
const common = {
  root: "/repo",
  requestPath: "/home/x/r/request.json",
  nodeExecutable: "/usr/bin/node",
};
const dryRunSteps = simpleOpenReleaseSteps({ ...common, dryRun: true });
assert.equal(dryRunSteps.length, 2);
assert.deepEqual(dryRunSteps[0].arguments, [
  "/repo/scripts/cloudflare-build.mjs",
  "--exceptional-request",
  "/home/x/r/request.json",
]);
assert.ok(dryRunSteps[1].arguments.includes("--dry-run"));
assert.equal(dryRunSteps[1].arguments.includes("--strict"), false);

const realSteps = simpleOpenReleaseSteps({ ...common, dryRun: false });
assert.equal(realSteps.length, 3);
assert.deepEqual(realSteps[1].arguments, [
  "/repo/node_modules/wrangler/bin/wrangler.js",
  "deploy",
  "--config",
  "/repo/wrangler.jsonc",
  "--strict",
  "--no-autoconfig",
]);
assert.equal(realSteps[1].arguments.includes("--dry-run"), false);
assert.deepEqual(realSteps[2].arguments, [
  "/repo/scripts/production-smoke.mjs",
  "--exceptional-request",
  "/home/x/r/request.json",
]);
for (const step of realSteps) assert.equal(step.command, "/usr/bin/node");

assert.ok(SIMPLE_OPEN_RELEASE_MANUAL_CHECKS.length >= 8);

console.log("Simple open release (D107): PASS");
