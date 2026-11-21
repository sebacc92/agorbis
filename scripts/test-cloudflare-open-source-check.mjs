import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenSourceCheckArguments } from "./cloudflare-open-source-check.mjs";
import { assertOpenUpdateCertifiedSourceSnapshot } from "./open-update-source-policy.mjs";
import { runOpenSourceProductionSmoke } from "./cloudflare-open-source-smoke-policy.mjs";
import { d72OpenUpdateEvidenceCertificateHash } from "./d72-open-update-evidence-policy.mjs";
import { createD72OpenUpdateEvidenceTestFixture } from "./d72-open-update-evidence-test-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestPath = "/private-review/request.json";
assert.deepEqual(parseOpenSourceCheckArguments(["--request", requestPath]), {
  requestPath,
  smoke: false,
});
assert.deepEqual(
  parseOpenSourceCheckArguments(["--request", requestPath, "--smoke"]),
  { requestPath, smoke: true },
);
assert.ok(
  Object.isFrozen(parseOpenSourceCheckArguments(["--request", requestPath])),
);
const invalidCli = [
  [],
  ["--request"],
  ["--smoke"],
  ["--file", requestPath],
  ["--request", "request.json"],
  ["--request", ""],
  ["--request", requestPath, "--deploy"],
  ["--request", requestPath, "--smoke", "--smoke"],
  ["--request", requestPath, "--request", requestPath],
  ["--smoke", "--request", requestPath],
];
for (const argv of [
  undefined,
  null,
  {},
  "--request",
  ["--request", null],
  ["--request", [requestPath]],
  ...invalidCli,
]) {
  assert.throws(() => parseOpenSourceCheckArguments(argv), /Uso:/);
}

// Actual CLI process, but fail closed if it ever tries a credential helper,
// child command or network call. Malformed arguments must stop before those.
const temp = mkdtempSync(path.join(tmpdir(), "agorbis-open-source-cli-test-"));
chmodSync(temp, 0o700);
try {
  const preload = path.join(temp, "deny-side-effects.mjs");
  writeFileSync(
    preload,
    [
      'import childProcess from "node:child_process";',
      'import { syncBuiltinESMExports } from "node:module";',
      'function forbidden() { process.stderr.write("UNEXPECTED_SIDE_EFFECT\\n"); process.exit(93); }',
      "globalThis.fetch = forbidden;",
      'for (const key of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) childProcess[key] = forbidden;',
      "syncBuiltinESMExports();",
    ].join("\n"),
    { flag: "wx", mode: 0o600 },
  );
  for (const argv of invalidCli) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        preload,
        path.join(root, "scripts/cloudflare-open-source-check.mjs"),
        ...argv,
      ],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
        timeout: 5000,
        maxBuffer: 128 * 1024,
        env: {
          PATH: path.dirname(process.execPath),
          LANG: "C",
          NODE_NO_WARNINGS: "1",
        },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "OPEN source: BLOCKED. No se acreditó el estado público esperado.\n",
    );
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

// A valid diagnostic is not a final certificate. It cannot authorize a new
// cleanup deployment or turn a changed source observation into the baseline.
const fixture = createD72OpenUpdateEvidenceTestFixture();
const source = structuredClone(fixture.snapshot);
const before = JSON.stringify(source);
const certifiedSource = {
  certificate: fixture.certificate,
  expectedCertificateHash: fixture.expectedCertificateHash,
  request: fixture.request,
  artifactManifest: fixture.artifactManifest,
};
assert.throws(
  () =>
    assertOpenUpdateCertifiedSourceSnapshot({
      ...certifiedSource,
      snapshot: source,
      now: fixture.now,
    }),
  /promoci|complet|pendient/i,
);
assert.equal(JSON.stringify(source), before);
for (const expectedCertificateHash of [
  undefined,
  "0".repeat(64),
  "BAD",
  [fixture.expectedCertificateHash],
]) {
  assert.throws(
    () =>
      assertOpenUpdateCertifiedSourceSnapshot({
        ...certifiedSource,
        expectedCertificateHash,
        snapshot: source,
        now: fixture.now,
      }),
    /hash externo/,
  );
}
const forged = structuredClone(fixture.certificate);
forged.promotionAllowed = true;
forged.cleanupDeploymentId = "11111111-1111-4111-8111-111111111111";
forged.contentSha256 = d72OpenUpdateEvidenceCertificateHash(forged);
assert.throws(
  () =>
    assertOpenUpdateCertifiedSourceSnapshot({
      ...certifiedSource,
      certificate: forged,
      expectedCertificateHash: forged.contentSha256,
      snapshot: source,
      now: fixture.now,
    }),
  /promoci|complet|pendient|contradic|canary|cadena/i,
);
assert.equal(JSON.stringify(source), before);

let snapshotReads = 0;
let publicFetches = 0;
await assert.rejects(
  () =>
    runOpenSourceProductionSmoke({
      baseline: fixture.baseline,
      expectedBaselineSha256: fixture.baselineSha256,
      certifiedSource,
      testOnly: true,
      readSnapshotImpl: async () => {
        snapshotReads += 1;
        return source;
      },
      fetchImpl: async () => {
        publicFetches += 1;
        throw new Error("Unexpected public request");
      },
      nowImpl: () => fixture.now,
    }),
  /promoci|complet|pendient/i,
);
assert.equal(snapshotReads, 1);
assert.equal(publicFetches, 0);
assert.equal(JSON.stringify(source), before);
console.log(
  "OPEN source CLI/certified-source tests: PASS (invalid CLI stops before effects; diagnostics and forged cleanup cannot certify promotion or rewrite observations).",
);
