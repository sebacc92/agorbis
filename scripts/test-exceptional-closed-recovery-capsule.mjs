#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createExceptionalClosedRecoveryCapsule,
  deriveExceptionalClosedRecoveryCapsulePath,
  deriveExceptionalClosedRecoveryPublicationPath,
  exceptionalClosedRecoveryCapsuleHash,
  EXCEPTIONAL_CLOSED_RECOVERY_CAPSULE_SCHEMA_VERSION,
  EXCEPTIONAL_CLOSED_RECOVERY_PUBLICATION_SCHEMA_VERSION,
  readExceptionalClosedRecoveryCapsule,
} from "./exceptional-closed-recovery-capsule.mjs";
import { canonicalJson } from "./exceptional-release-act.mjs";
import {
  EXCEPTIONAL_CUTOVER_ACCOUNT_ID,
  EXCEPTIONAL_CUTOVER_WORKER_NAME,
} from "./exceptional-release-cutover-policy.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

const REQUEST_HASH = "1".repeat(64);
const ACT_HASH = "2".repeat(64);
const ISSUANCE_HASH = "3".repeat(64);
const ARTIFACT_HASH = "4".repeat(64);
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const CLOSED_DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";
const CLOSED_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = new Date("2026-08-31T02:00:00.000Z");
const CAPSULE_NONCE = "5".repeat(32);
const RETRY_NONCE = "6".repeat(32);
const RECOVERY_FILES = Object.freeze([
  "exceptional-release-empty.env",
  "wrangler.crons-closed.jsonc",
  "wrangler.traffic.jsonc",
]);
const CLOSED_CONFIGURATION = `${JSON.stringify({
  $schema: "node_modules/wrangler/config-schema.json",
  name: "agorbis",
  account_id: "4d78fb10c1ae65281ec851479d5045dc",
  workers_dev: false,
  preview_urls: false,
  triggers: { crons: [] },
})}\n`;
const TRAFFIC_CONFIGURATION = `${JSON.stringify({
  $schema: "node_modules/wrangler/config-schema.json",
  name: "agorbis",
  account_id: "4d78fb10c1ae65281ec851479d5045dc",
})}\n`;
const temporaryRoot = mkdtempSync(
  path.join(tmpdir(), "agorbis-closed-recovery-capsule-test-"),
);
chmodSync(temporaryRoot, 0o700);
let fixtureCounter = 0;

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function fixedRandomBytes(nonce) {
  return (size) => {
    assert.equal(size, 16);
    return Buffer.from(nonce, "hex");
  };
}

function mkdirSecure(directoryPath) {
  mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  chmodSync(directoryPath, 0o700);
}

function writeSecure(filePath, source) {
  mkdirSecure(path.dirname(filePath));
  writeFileSync(filePath, source, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function createFixture(label) {
  fixtureCounter += 1;
  const root = path.join(
    temporaryRoot,
    `${String(fixtureCounter).padStart(2, "0")}-${label}`,
  );
  const stateRoot = path.join(root, "state");
  const artifactRoot = path.join(root, "artifact");
  mkdirSecure(stateRoot);
  mkdirSecure(artifactRoot);
  const sources = new Map([
    ["exceptional-release-empty.env", Buffer.alloc(0)],
    ["wrangler.crons-closed.jsonc", Buffer.from(CLOSED_CONFIGURATION)],
    ["wrangler.traffic.jsonc", Buffer.from(TRAFFIC_CONFIGURATION)],
  ]);
  for (const [relativePath, source] of sources) {
    writeSecure(path.join(artifactRoot, relativePath), source);
  }
  const artifactManifest = {
    contentSha256: ARTIFACT_HASH,
    files: RECOVERY_FILES.map((relativePath) => {
      const source = sources.get(relativePath);
      return {
        path: relativePath,
        size: source.length,
        sha256: sha256(source),
      };
    }),
  };
  return { root, stateRoot, artifactRoot, artifactManifest, sources };
}

function creationOptions(fixture, overrides = {}) {
  return {
    stateRoot: fixture.stateRoot,
    artifactRoot: fixture.artifactRoot,
    artifactManifest: fixture.artifactManifest,
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    issuanceHash: ISSUANCE_HASH,
    artifactHash: ARTIFACT_HASH,
    closedDeploymentId: CLOSED_DEPLOYMENT_ID,
    closedVersionId: CLOSED_VERSION_ID,
    head: HEAD,
    now: CREATED_AT,
    randomBytesImpl: fixedRandomBytes(CAPSULE_NONCE),
    ...overrides,
  };
}

function createCapsule(fixture, overrides = {}) {
  const created = createExceptionalClosedRecoveryCapsule(
    creationOptions(fixture, overrides),
  );
  fixture.created = created;
  return created;
}

function readOptions(fixture, overrides = {}) {
  return {
    stateRoot: fixture.stateRoot,
    requestHash: REQUEST_HASH,
    actHash: ACT_HASH,
    issuanceHash: ISSUANCE_HASH,
    artifactHash: ARTIFACT_HASH,
    closedDeploymentId: CLOSED_DEPLOYMENT_ID,
    closedVersionId: CLOSED_VERSION_ID,
    head: HEAD,
    expectedCapsuleHash: fixture.created.capsuleHash,
    ...overrides,
  };
}

function readCapsule(fixture, overrides = {}) {
  return readExceptionalClosedRecoveryCapsule(readOptions(fixture, overrides));
}

function manifestPath(fixture) {
  return path.join(fixture.created.capsuleRoot, "capsule.json");
}

function sourcePublicationPath(fixture) {
  return path.join(fixture.created.capsuleRoot, "publication.json");
}

function publicationPath(fixture) {
  return deriveExceptionalClosedRecoveryPublicationPath({
    stateRoot: fixture.stateRoot,
    requestHash: REQUEST_HASH,
  });
}

function readPublication(fixture) {
  return JSON.parse(readFileSync(publicationPath(fixture), "utf8"));
}

function publicationHash(publicationOrPayload) {
  const { contentSha256: _contentSha256, ...payload } = publicationOrPayload;
  return sha256(canonicalJson(payload));
}

function resealPublication(fixture, mutate) {
  const publication = readPublication(fixture);
  const mutated = mutate(structuredClone(publication));
  mutated.contentSha256 = publicationHash(mutated);
  writeSecure(publicationPath(fixture), canonicalJson(mutated));
  return mutated;
}

function readManifest(fixture) {
  return JSON.parse(readFileSync(manifestPath(fixture), "utf8"));
}

function writeManifest(fixture, manifest) {
  writeSecure(manifestPath(fixture), canonicalJson(manifest));
}

function resealManifest(fixture, mutate) {
  const manifest = readManifest(fixture);
  const mutated = mutate(structuredClone(manifest));
  mutated.contentSha256 = exceptionalClosedRecoveryCapsuleHash(mutated);
  writeManifest(fixture, mutated);
  return mutated.contentSha256;
}

function replacePayloadAndReseal(fixture, relativePath, source) {
  const payload = Buffer.isBuffer(source) ? source : Buffer.from(source);
  writeSecure(path.join(fixture.created.capsuleRoot, relativePath), payload);
  return resealManifest(fixture, (manifest) => {
    const entry = manifest.files.find((file) => file.path === relativePath);
    assert.ok(entry, `Fixture sin entrada para ${relativePath}`);
    entry.size = payload.length;
    entry.sha256 = sha256(payload);
    return manifest;
  });
}

function expectReadFailure(label, mutate, expected) {
  const fixture = createFixture(label);
  createCapsule(fixture);
  mutate(fixture);
  assert.throws(() => readCapsule(fixture), expected);
}

try {
  {
    const fixture = createFixture("happy-path");
    const created = createCapsule(fixture);
    assert.equal(
      created.capsuleRoot,
      deriveExceptionalClosedRecoveryCapsulePath({
        stateRoot: fixture.stateRoot,
        requestHash: REQUEST_HASH,
        capsuleHash: created.capsuleHash,
        nonce: CAPSULE_NONCE,
      }),
    );
    assert.equal(created.publicationPath, publicationPath(fixture));
    assert.equal(
      created.manifest.schemaVersion,
      EXCEPTIONAL_CLOSED_RECOVERY_CAPSULE_SCHEMA_VERSION,
    );
    assert.equal(created.manifest.accountId, EXCEPTIONAL_CUTOVER_ACCOUNT_ID);
    assert.equal(
      created.manifest.accountId,
      "4d78fb10c1ae65281ec851479d5045dc",
    );
    assert.equal(created.manifest.workerName, EXCEPTIONAL_CUTOVER_WORKER_NAME);
    assert.equal(created.manifest.workerName, "agorbis");
    assert.equal(created.manifest.policyVersion, RELEASE_GATE_POLICY_VERSION);
    assert.equal(created.manifest.policyHash, RELEASE_GATE_POLICY_SHA256);
    assert.equal(created.manifest.requestHash, REQUEST_HASH);
    assert.equal(created.manifest.actHash, ACT_HASH);
    assert.equal(created.manifest.issuanceHash, ISSUANCE_HASH);
    assert.equal(created.manifest.artifactHash, ARTIFACT_HASH);
    assert.equal(created.manifest.closedDeploymentId, CLOSED_DEPLOYMENT_ID);
    assert.equal(created.manifest.closedVersionId, CLOSED_VERSION_ID);
    assert.equal(created.manifest.head, HEAD);
    assert.equal(created.manifest.createdAtUtc, CREATED_AT.toISOString());
    assert.equal(
      created.capsuleHash,
      exceptionalClosedRecoveryCapsuleHash(created.manifest),
    );
    assert.equal(created.manifest.contentSha256, created.capsuleHash);
    assert.ok(Object.isFrozen(created));
    assert.ok(Object.isFrozen(created.manifest));
    assert.equal(lstatSync(created.capsuleRoot).mode & 0o777, 0o700);
    assert.deepEqual(
      readdirSync(created.capsuleRoot).sort(),
      ["capsule.json", "publication.json", ...RECOVERY_FILES].sort(),
    );
    for (const relativePath of [
      "capsule.json",
      "publication.json",
      ...RECOVERY_FILES,
    ]) {
      const metadata = lstatSync(path.join(created.capsuleRoot, relativePath));
      assert.equal(metadata.mode & 0o777, 0o600);
      assert.equal(metadata.nlink, relativePath === "publication.json" ? 2 : 1);
    }
    const sourcePublicationMetadata = lstatSync(sourcePublicationPath(fixture));
    const pointerMetadata = lstatSync(created.publicationPath);
    assert.equal(pointerMetadata.mode & 0o777, 0o600);
    assert.equal(pointerMetadata.nlink, 2);
    assert.equal(pointerMetadata.dev, sourcePublicationMetadata.dev);
    assert.equal(pointerMetadata.ino, sourcePublicationMetadata.ino);
    assert.deepEqual(
      readFileSync(created.publicationPath),
      readFileSync(sourcePublicationPath(fixture)),
    );
    const publication = readPublication(fixture);
    assert.equal(
      publication.schemaVersion,
      EXCEPTIONAL_CLOSED_RECOVERY_PUBLICATION_SCHEMA_VERSION,
    );
    assert.equal(publication.requestHash, REQUEST_HASH);
    assert.equal(publication.capsuleHash, created.capsuleHash);
    assert.equal(publication.directoryName, path.basename(created.capsuleRoot));
    assert.equal(publication.contentSha256, publicationHash(publication));
    assert.equal(
      readFileSync(manifestPath(fixture), "utf8"),
      canonicalJson(created.manifest),
    );
    for (const relativePath of RECOVERY_FILES) {
      assert.deepEqual(
        readFileSync(path.join(created.capsuleRoot, relativePath)),
        fixture.sources.get(relativePath),
      );
    }
    assert.equal(
      readFileSync(
        path.join(created.capsuleRoot, "exceptional-release-empty.env"),
      ).length,
      0,
    );

    const read = readCapsule(fixture);
    assert.equal(read.capsuleRoot, created.capsuleRoot);
    assert.equal(read.capsuleHash, created.capsuleHash);
    assert.deepEqual(read.manifest, created.manifest);
    assert.ok(Object.isFrozen(read));
    assert.ok(Object.isFrozen(read.manifest));

    const stateInventory = readdirSync(fixture.stateRoot).sort();
    const reused = createExceptionalClosedRecoveryCapsule(
      creationOptions(fixture, {
        now: new Date("2026-08-31T03:00:00.000Z"),
        randomBytesImpl() {
          throw new Error(
            "No debe generar otro nonce tras publicar el pointer.",
          );
        },
      }),
    );
    assert.equal(reused.capsuleRoot, created.capsuleRoot);
    assert.equal(reused.publicationPath, created.publicationPath);
    assert.equal(reused.capsuleHash, created.capsuleHash);
    assert.deepEqual(reused.manifest, created.manifest);
    assert.deepEqual(readdirSync(fixture.stateRoot).sort(), stateInventory);
  }

  for (const [label, override] of [
    ["invalid-request-binding", { requestHash: "x".repeat(64) }],
    ["invalid-act-binding", { actHash: "x".repeat(64) }],
    ["invalid-issuance-binding", { issuanceHash: "x".repeat(64) }],
    ["invalid-artifact-binding", { artifactHash: "x".repeat(64) }],
    ["invalid-deployment-binding", { closedDeploymentId: "not-a-version" }],
    ["invalid-version-binding", { closedVersionId: "not-a-version" }],
    ["invalid-head-binding", { head: "not-a-head" }],
  ]) {
    const fixture = createFixture(label);
    assert.throws(
      () =>
        createExceptionalClosedRecoveryCapsule(
          creationOptions(fixture, override),
        ),
      /bindings de la cápsula CLOSED son inválidos/,
    );
  }

  for (const [label, mutate, expected] of [
    [
      "wrong-account",
      (manifest) => ({ ...manifest, accountId: "0".repeat(32) }),
      /cuenta o Worker de la cápsula no coinciden/,
    ],
    [
      "wrong-worker",
      (manifest) => ({ ...manifest, workerName: "other-worker" }),
      /cuenta o Worker de la cápsula no coinciden/,
    ],
    [
      "wrong-schema-version",
      (manifest) => ({ ...manifest, schemaVersion: "capsule/v2" }),
      /schemaVersion de cápsula desconocido/,
    ],
    [
      "wrong-policy-version",
      (manifest) => ({ ...manifest, policyVersion: "D72/test/other" }),
      /policy de la cápsula no coincide/,
    ],
    [
      "wrong-policy-hash",
      (manifest) => ({ ...manifest, policyHash: "a".repeat(64) }),
      /policy de la cápsula no coincide/,
    ],
    [
      "wrong-request-binding",
      (manifest) => ({ ...manifest, requestHash: "a".repeat(64) }),
      /requestHash de la cápsula no coincide/,
    ],
    [
      "wrong-act-binding",
      (manifest) => ({ ...manifest, actHash: "a".repeat(64) }),
      /actHash de la cápsula no coincide/,
    ],
    [
      "wrong-issuance-binding",
      (manifest) => ({ ...manifest, issuanceHash: "a".repeat(64) }),
      /issuanceHash de la cápsula no coincide/,
    ],
    [
      "wrong-artifact-binding",
      (manifest) => ({ ...manifest, artifactHash: "a".repeat(64) }),
      /artifactHash de la cápsula no coincide/,
    ],
    [
      "wrong-deployment-binding",
      (manifest) => ({
        ...manifest,
        closedDeploymentId: "33333333-3333-4333-8333-333333333333",
      }),
      /closedDeploymentId de la cápsula no coincide/,
    ],
    [
      "wrong-version-binding",
      (manifest) => ({
        ...manifest,
        closedVersionId: "44444444-4444-4444-8444-444444444444",
      }),
      /closedVersionId de la cápsula no coincide/,
    ],
    [
      "wrong-head-binding",
      (manifest) => ({ ...manifest, head: "f".repeat(40) }),
      /head de la cápsula no coincide/,
    ],
  ]) {
    const fixture = createFixture(label);
    createCapsule(fixture);
    resealManifest(fixture, mutate);
    assert.throws(() => readCapsule(fixture), expected);
  }

  {
    const fixture = createFixture("closed-config-not-exact");
    createCapsule(fixture);
    replacePayloadAndReseal(
      fixture,
      "wrangler.crons-closed.jsonc",
      `${JSON.stringify({
        ...JSON.parse(CLOSED_CONFIGURATION),
        compatibility_date: "2026-08-31",
      })}\n`,
    );
    assert.throws(
      () => readCapsule(fixture),
      /wrangler\.crons-closed\.jsonc no coincide exactamente/,
    );
  }

  {
    const fixture = createFixture("traffic-config-not-exact");
    createCapsule(fixture);
    replacePayloadAndReseal(
      fixture,
      "wrangler.traffic.jsonc",
      `${JSON.stringify({
        ...JSON.parse(TRAFFIC_CONFIGURATION),
        workers_dev: false,
      })}\n`,
    );
    assert.throws(
      () => readCapsule(fixture),
      /wrangler\.traffic\.jsonc no coincide exactamente/,
    );
  }

  {
    const fixture = createFixture("empty-env-required");
    createCapsule(fixture);
    replacePayloadAndReseal(
      fixture,
      "exceptional-release-empty.env",
      "SECRET_VALUE=fixture-only\n",
    );
    assert.throws(() => readCapsule(fixture), /env de recovery no está vacío/);
  }

  expectReadFailure(
    "extra-file",
    (fixture) => {
      writeSecure(path.join(fixture.created.capsuleRoot, "extra.txt"), "extra");
    },
    /archivos faltantes o extra/,
  );
  expectReadFailure(
    "missing-file",
    (fixture) => {
      unlinkSync(
        path.join(fixture.created.capsuleRoot, "wrangler.traffic.jsonc"),
      );
    },
    /archivos faltantes o extra/,
  );
  expectReadFailure(
    "payload-tamper",
    (fixture) => {
      writeSecure(
        path.join(fixture.created.capsuleRoot, "wrangler.traffic.jsonc"),
        `${TRAFFIC_CONFIGURATION} `,
      );
    },
    /archivo wrangler\.traffic\.jsonc de la cápsula cambió/,
  );
  expectReadFailure(
    "manifest-tamper",
    (fixture) => {
      const manifest = readManifest(fixture);
      manifest.createdAtUtc = "2026-08-31T02:00:01.000Z";
      writeManifest(fixture, manifest);
    },
    /contentSha256 de cápsula no coincide/,
  );

  {
    const fixture = createFixture("resealed-manifest-old-expected-hash");
    createCapsule(fixture);
    const oldExpectedHash = fixture.created.capsuleHash;
    const resealedHash = resealManifest(fixture, (manifest) => ({
      ...manifest,
      createdAtUtc: "2026-08-31T02:00:01.000Z",
    }));
    assert.notEqual(resealedHash, oldExpectedHash);
    assert.throws(
      () => readCapsule(fixture, { expectedCapsuleHash: oldExpectedHash }),
      /publicación CLOSED cambió durante la lectura/,
    );
  }

  expectReadFailure(
    "payload-symlink",
    (fixture) => {
      const external = path.join(fixture.root, "external-symlink-target");
      writeSecure(external, TRAFFIC_CONFIGURATION);
      const target = path.join(
        fixture.created.capsuleRoot,
        "wrangler.traffic.jsonc",
      );
      unlinkSync(target);
      symlinkSync(external, target);
    },
    /no es un archivo 0600 seguro/,
  );
  expectReadFailure(
    "payload-hardlink",
    (fixture) => {
      const external = path.join(fixture.root, "external-hardlink-target");
      writeSecure(external, TRAFFIC_CONFIGURATION);
      const target = path.join(
        fixture.created.capsuleRoot,
        "wrangler.traffic.jsonc",
      );
      unlinkSync(target);
      linkSync(external, target);
    },
    /no es un archivo 0600 seguro/,
  );
  expectReadFailure(
    "payload-mode",
    (fixture) => {
      chmodSync(
        path.join(fixture.created.capsuleRoot, "wrangler.traffic.jsonc"),
        0o640,
      );
    },
    /no es un archivo 0600 seguro/,
  );
  expectReadFailure(
    "capsule-directory-mode",
    (fixture) => {
      chmodSync(fixture.created.capsuleRoot, 0o750);
    },
    /no es un directorio 0700 seguro/,
  );

  expectReadFailure(
    "publication-pointer-absent",
    (fixture) => {
      unlinkSync(publicationPath(fixture));
    },
    { code: "ENOENT" },
  );
  expectReadFailure(
    "publication-pointer-tampered",
    (fixture) => {
      writeSecure(publicationPath(fixture), "{}\n");
    },
    /publicación CLOSED no coincide con sus bindings/,
  );
  expectReadFailure(
    "publication-pointer-symlink",
    (fixture) => {
      const pointer = publicationPath(fixture);
      const external = path.join(fixture.root, "external-publication-target");
      writeSecure(external, readFileSync(pointer));
      unlinkSync(pointer);
      symlinkSync(external, pointer);
    },
    /no es un archivo 0600 seguro/,
  );
  expectReadFailure(
    "publication-extra-hardlink",
    (fixture) => {
      linkSync(
        publicationPath(fixture),
        path.join(fixture.root, "unexpected-publication-link"),
      );
    },
    /no es un archivo 0600 seguro/,
  );

  {
    const fixture = createFixture("publication-directory-traversal");
    createCapsule(fixture);
    resealPublication(fixture, (publication) => ({
      ...publication,
      directoryName: "../outside.closed-capsule",
    }));
    assert.throws(
      () => readCapsule(fixture),
      /publicación CLOSED apunta a un directorio inválido/,
    );
  }
  assert.throws(
    () =>
      deriveExceptionalClosedRecoveryCapsulePath({
        stateRoot: temporaryRoot,
        requestHash: REQUEST_HASH,
        capsuleHash: ARTIFACT_HASH,
        nonce: "../outside",
      }),
    /ruta de cápsula no es segura/,
  );

  {
    const referenceFixture = createFixture("orphan-hash-reference");
    const reference = createCapsule(referenceFixture);
    const fixture = createFixture("partial-orphan-retry");
    const orphanRoot = deriveExceptionalClosedRecoveryCapsulePath({
      stateRoot: fixture.stateRoot,
      requestHash: REQUEST_HASH,
      capsuleHash: reference.capsuleHash,
      nonce: CAPSULE_NONCE,
    });
    mkdirSecure(orphanRoot);
    const sentinelPath = path.join(orphanRoot, "crash-before-pointer");
    writeSecure(sentinelPath, "partial-publication");
    assert.throws(() => lstatSync(publicationPath(fixture)), {
      code: "ENOENT",
    });
    assert.throws(
      () =>
        createExceptionalClosedRecoveryCapsule(
          creationOptions(fixture, {
            randomBytesImpl: fixedRandomBytes(CAPSULE_NONCE),
          }),
        ),
      { code: "EEXIST" },
    );
    assert.throws(() => lstatSync(publicationPath(fixture)), {
      code: "ENOENT",
    });
    assert.equal(readFileSync(sentinelPath, "utf8"), "partial-publication");

    const retried = createCapsule(fixture, {
      randomBytesImpl: fixedRandomBytes(RETRY_NONCE),
    });
    assert.notEqual(retried.capsuleRoot, orphanRoot);
    assert.equal(
      retried.capsuleRoot,
      deriveExceptionalClosedRecoveryCapsulePath({
        stateRoot: fixture.stateRoot,
        requestHash: REQUEST_HASH,
        capsuleHash: reference.capsuleHash,
        nonce: RETRY_NONCE,
      }),
    );
    assert.equal(retried.capsuleHash, reference.capsuleHash);
    assert.equal(readCapsule(fixture).capsuleRoot, retried.capsuleRoot);
    assert.equal(readFileSync(sentinelPath, "utf8"), "partial-publication");
  }

  {
    const fixture = createFixture("pointer-eexist-different-bindings");
    const competingActHash = "a".repeat(64);
    let competingPublication;
    let raceInjected = false;
    const raceRandomBytes = (size) => {
      assert.equal(size, 16);
      assert.equal(raceInjected, false);
      raceInjected = true;
      competingPublication = createExceptionalClosedRecoveryCapsule(
        creationOptions(fixture, {
          actHash: competingActHash,
          randomBytesImpl: fixedRandomBytes(RETRY_NONCE),
        }),
      );
      return Buffer.from(CAPSULE_NONCE, "hex");
    };
    assert.throws(
      () =>
        createExceptionalClosedRecoveryCapsule(
          creationOptions(fixture, { randomBytesImpl: raceRandomBytes }),
        ),
      /actHash de la cápsula no coincide/,
    );
    assert.equal(raceInjected, true);
    assert.ok(competingPublication);
    fixture.created = competingPublication;
    const winner = readCapsule(fixture, { actHash: competingActHash });
    assert.equal(winner.capsuleRoot, competingPublication.capsuleRoot);
    assert.equal(winner.capsuleHash, competingPublication.capsuleHash);
    assert.equal(lstatSync(publicationPath(fixture)).nlink, 2);
    assert.equal(
      lstatSync(sourcePublicationPath(fixture)).ino,
      lstatSync(publicationPath(fixture)).ino,
    );
  }

  console.log("exceptional closed recovery capsule tests: PASS");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
