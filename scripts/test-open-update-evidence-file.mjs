import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./exceptional-release-act.mjs";
import {
  deriveOpenUpdateEvidencePath,
  readOpenUpdateEvidenceFile,
  writeOpenUpdateEvidenceFile,
} from "./open-update-evidence-file.mjs";
import { d72OpenUpdateEvidenceCertificateHash } from "./d72-open-update-evidence-policy.mjs";
import { createD72OpenUpdateEvidenceTestFixture } from "./d72-open-update-evidence-test-fixture.mjs";

// Only synthetic documents in a private temporary directory. The real writer
// must reject these test-only receipts; this suite does not create an issuer.
const fixture = createD72OpenUpdateEvidenceTestFixture();
const worktreeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = mkdtempSync(
  path.join(tmpdir(), "agorbis-open-evidence-file-test-"),
);
chmodSync(root, 0o700);
const requestPath = path.join(root, "request.json");
const evidencePath = deriveOpenUpdateEvidencePath(requestPath);
const source = canonicalJson(fixture.certificate);
const options = {
  requestPath,
  worktreeRoot,
  request: fixture.request,
  artifactManifest: fixture.artifactManifest,
  expectedCertificateHash: fixture.expectedCertificateHash,
  now: fixture.now,
};
let rejected = 0;
function rejects(operation, pattern) {
  assert.throws(operation, pattern);
  rejected += 1;
}
function put(value = source) {
  if (existsSync(evidencePath)) rmSync(evidencePath, { recursive: true });
  writeFileSync(evidencePath, value, { flag: "wx", mode: 0o600 });
}
function edited(mutator, { reseal = false } = {}) {
  const certificate = structuredClone(fixture.certificate);
  mutator(certificate);
  if (reseal)
    certificate.contentSha256 =
      d72OpenUpdateEvidenceCertificateHash(certificate);
  put(canonicalJson(certificate));
  return certificate;
}

try {
  writeFileSync(requestPath, canonicalJson(fixture.request), {
    flag: "wx",
    mode: 0o600,
  });
  assert.equal(
    evidencePath,
    path.join(root, "request.open-update-evidence.json"),
  );
  for (const invalid of [
    undefined,
    null,
    [],
    "request.json",
    "/tmp/request.txt",
    "/tmp/a/../request.json",
    "/tmp/a\u0000.json",
    "/tmp/a\n.json",
  ]) {
    rejects(() => deriveOpenUpdateEvidencePath(invalid), /Ruta/);
  }
  // Opaque issuance and test provenance are both required before any write.
  for (const certificate of [
    fixture.certificate,
    structuredClone(fixture.certificate),
    {},
    { ...fixture.certificate, promotionAllowed: true },
  ]) {
    rejects(
      () =>
        writeOpenUpdateEvidenceFile({ requestPath, worktreeRoot, certificate }),
      /emitido/,
    );
    assert.deepEqual(readdirSync(root), ["request.json"]);
  }
  rejects(() => readOpenUpdateEvidenceFile(options), /ENOENT/);
  put();
  assert.deepEqual(readOpenUpdateEvidenceFile(options), fixture.certificate);
  assert.equal(readOpenUpdateEvidenceFile(options).promotionAllowed, false);
  rejects(
    () =>
      readOpenUpdateEvidenceFile({ ...options, requirePromotionReady: true }),
    /promoci|complet|pendient/i,
  );
  for (const expectedCertificateHash of [
    "0".repeat(64),
    "BAD",
    [],
    [fixture.expectedCertificateHash],
  ]) {
    rejects(
      () => readOpenUpdateEvidenceFile({ ...options, expectedCertificateHash }),
      /hash externo/,
    );
  }
  // Omitted pin is the current read-only discovery API, not independent proof.
  assert.equal(
    readOpenUpdateEvidenceFile({
      ...options,
      expectedCertificateHash: undefined,
    }).promotionAllowed,
    false,
  );
  // The diagnostic never becomes final merely by using its internally stored
  // hash or copying it to the final filename.
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        expectedCertificateHash: undefined,
        requirePromotionReady: true,
      }),
    /promoci|complet|pendient/i,
  );
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        now: new Date(fixture.certificate.expiresAtUtc),
      }),
    /venci|vigencia|baseline/i,
  );
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        request: { ...fixture.request, head: "f".repeat(40) },
      }),
    /HEAD|request|head/i,
  );
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        artifactManifest: {
          ...fixture.artifactManifest,
          contentSha256: "0".repeat(64),
        },
      }),
    /[Aa]rtefact|artifact/i,
  );

  for (const mode of [0o400, 0o640, 0o644, 0o660, 0o1600]) {
    chmodSync(evidencePath, mode);
    rejects(() => readOpenUpdateEvidenceFile(options), /0600/);
  }
  chmodSync(evidencePath, 0o600);
  for (const mode of [0o755, 0o750, 0o770, 0o1700]) {
    chmodSync(root, mode);
    rejects(() => readOpenUpdateEvidenceFile(options), /0700/);
  }
  chmodSync(root, 0o700);
  const hardlink = path.join(root, "linked.json");
  linkSync(evidencePath, hardlink);
  rejects(() => readOpenUpdateEvidenceFile(options), /enlaces/);
  unlinkSync(hardlink);
  const original = path.join(root, "original.json");
  renameSync(evidencePath, original);
  symlinkSync(original, evidencePath);
  rejects(() => readOpenUpdateEvidenceFile(options), /enlaces/);
  unlinkSync(evidencePath);
  renameSync(original, evidencePath);
  const alias = `${root}-alias`;
  try {
    symlinkSync(root, alias);
    rejects(
      () =>
        readOpenUpdateEvidenceFile({
          ...options,
          requestPath: path.join(alias, "request.json"),
        }),
      /aliases|0700/,
    );
  } finally {
    rmSync(alias, { force: true });
  }
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        requestPath: path.join(worktreeRoot, "request.json"),
      }),
    /ruta del request/i,
  );
  rmSync(evidencePath);
  mkdirSync(evidencePath, { mode: 0o700 });
  rejects(() => readOpenUpdateEvidenceFile(options), /regular/);
  put("");
  rejects(() => readOpenUpdateEvidenceFile(options), /Tamaño/);
  put(" ".repeat(1024 * 1024 + 1));
  rejects(() => readOpenUpdateEvidenceFile(options), /Tamaño/);

  for (const malformed of [
    "{",
    "null\n",
    source.trimEnd(),
    ` ${source}`,
    JSON.stringify(fixture.certificate, null, 2),
    source.replace(
      '"promotionAllowed":false',
      '"promotionAllowed":false,"promotionAllowed":false',
    ),
  ]) {
    put(malformed);
    rejects(() => readOpenUpdateEvidenceFile(options));
  }
  put(
    canonicalJson({
      ...fixture.certificate,
      syntheticSecret: "sb_" + "secret_" + "x".repeat(24),
    }),
  );
  rejects(() => readOpenUpdateEvidenceFile(options), /datos no permitidos/);
  edited((record) => {
    record.cleanupDeploymentId = "11111111-1111-4111-8111-111111111111";
  });
  rejects(() => readOpenUpdateEvidenceFile(options), /hash externo/);
  const altered = edited(
    (record) => {
      record.promotionAllowed = true;
    },
    { reseal: true },
  );
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        expectedCertificateHash: altered.contentSha256,
        requirePromotionReady: true,
      }),
    /promoci|complet|pendient|contradic/i,
  );
  const scope = edited(
    (record) => {
      record.deploymentAuthorized = true;
    },
    { reseal: true },
  );
  rejects(
    () =>
      readOpenUpdateEvidenceFile({
        ...options,
        expectedCertificateHash: scope.contentSha256,
      }),
    /alcance/,
  );
  put();
  const before = readFileSync(evidencePath);
  rejects(
    () =>
      writeOpenUpdateEvidenceFile({
        requestPath,
        worktreeRoot,
        certificate: fixture.certificate,
      }),
    /emitido/,
  );
  assert.deepEqual(readFileSync(evidencePath), before);
  console.log(
    `OPEN evidence private-file tests: PASS (${rejected} rejected cases; synthetic diagnostics never authorize promotion or persistence).`,
  );
} finally {
  chmodSync(root, 0o700);
  rmSync(root, { recursive: true, force: true });
}
