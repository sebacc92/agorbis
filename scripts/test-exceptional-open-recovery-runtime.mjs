import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalJson } from "./exceptional-release-act.mjs";
import {
  EXCEPTIONAL_OPEN_UPDATE_CLAIM_SCHEMA_VERSION,
  parseExceptionalOpenRecoveryArguments,
  publishExceptionalOpenRecoveryCapsule,
  readPublishedExceptionalOpenRecoveryCapsule,
  readExceptionalOpenRecoveryClaim,
  validateExceptionalOpenRecoveryActiveState,
} from "./run-exceptional-open-cutover.mjs";
import { rebindExceptionalOpenRecoveryCapsuleForFinalRelease } from "./exceptional-open-recovery-capsule.mjs";
import { createSyntheticOpenRecoveryFixture } from "./test-support/open-recovery-fixture.mjs";
import {
  baseline,
  expectedBaselineSha256,
  sourceSnapshot,
  NOW,
} from "./cloudflare-open-source-smoke-test-fixture.mjs";
import {
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";

// Disk operations below use synthetic records in a private temporary directory.
// No subprocess, keyring, provider, database or network request is invoked.
const root = mkdtempSync(
  path.join(tmpdir(), "agorbis-open-recovery-runtime-test-"),
);
chmodSync(root, 0o700);
const h = (value) =>
  createHash("sha256").update(`synthetic:${value}`).digest("hex");
const payloadHash = (payload) =>
  createHash("sha256").update(canonicalJson(payload)).digest("hex");
const head = "a".repeat(40);
const requestHash = h("request");
const actHash = h("act");
const issuanceHash = h("issuance");
const recoveryVersionId = "11111111-1111-4111-8111-111111111111";
const primaryVersionId = "22222222-2222-4222-8222-222222222222";
const cleanupDeploymentId = "33333333-3333-4333-8333-333333333333";
const primaryDeploymentId = "44444444-4444-4444-8444-444444444444";
const recoveredDeploymentId = "55555555-5555-4555-8555-555555555555";
const afterExpiration = new Date(
  Date.parse(baseline.expiresAtUtc) + 2 * 60 * 60 * 1000,
);

try {
  const fixture = createSyntheticOpenRecoveryFixture({
    head,
    requestHash,
    artifactHash: h("primary"),
    recoveryArtifactHash: h("fallback"),
    baseline,
    baselineSha256: expectedBaselineSha256,
    sourceSnapshot: sourceSnapshot(),
    recoveryVersionId,
    candidateIdentityHash: h("candidate"),
    infraAuthorizationHash: h("infra"),
    createdAtUtc: NOW,
  });
  const manifest = rebindExceptionalOpenRecoveryCapsuleForFinalRelease({
    canaryCapsule: fixture.capsuleManifest,
    canaryExpectedBindings: fixture.expectedBindings,
    actHash,
    issuanceHash,
    createdAtUtc: NOW,
  });
  const expectedBindings = {
    ...fixture.expectedBindings,
    recoveryScope: "FINAL_RELEASE",
    actHash,
    issuanceHash,
    expectedCapsuleHash: manifest.contentSha256,
  };
  delete expectedBindings.candidateIdentityHash;
  delete expectedBindings.infraAuthorizationHash;
  const published = publishExceptionalOpenRecoveryCapsule({
    stateRoot: root,
    capsuleManifest: manifest,
    expectedBindings,
    sources: fixture.sources,
  });
  assert.deepEqual(
    readPublishedExceptionalOpenRecoveryCapsule({
      stateRoot: root,
      expectedBindings,
    }).manifest,
    manifest,
  );
  assert.throws(
    () =>
      publishExceptionalOpenRecoveryCapsule({
        stateRoot: root,
        capsuleManifest: manifest,
        expectedBindings,
        sources: fixture.sources,
      }),
    /exist/i,
  );
  assert.throws(() =>
    rebindExceptionalOpenRecoveryCapsuleForFinalRelease({
      canaryCapsule: manifest,
      canaryExpectedBindings: expectedBindings,
      actHash,
      issuanceHash,
      createdAtUtc: NOW,
    }),
  );
  assert.throws(() =>
    rebindExceptionalOpenRecoveryCapsuleForFinalRelease({
      canaryCapsule: fixture.capsuleManifest,
      canaryExpectedBindings: fixture.expectedBindings,
      actHash,
      issuanceHash,
      createdAtUtc: afterExpiration.toISOString(),
    }),
  );

  const payload = {
    schemaVersion: EXCEPTIONAL_OPEN_UPDATE_CLAIM_SCHEMA_VERSION,
    releaseMode: "OPEN_UPDATE",
    state: "claimed-before-deploy",
    head,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    requestHash,
    actHash,
    artifactHash: manifest.artifactHash,
    issuanceHash,
    recoveryCapsuleHash: manifest.contentSha256,
    confirmationSha256: h("confirmation"),
    claimedAtUtc: NOW,
    openSourceBaselineSha256: expectedBaselineSha256,
    openUpdateEvidenceHash: h("certificate"),
    sourceDeploymentId: cleanupDeploymentId,
    sourceVersionId: baseline.versionId,
    recoveryBindings: expectedBindings,
  };
  const claim = { ...payload, contentSha256: payloadHash(payload) };
  const claimPath = path.join(root, `${requestHash}.claim.json`);
  writeFileSync(claimPath, canonicalJson(claim), { mode: 0o600, flag: "wx" });
  const args = [
    "--recover-open",
    "--request-hash",
    requestHash,
    "--act-hash",
    actHash,
    "--claim-hash",
    claim.contentSha256,
  ];
  const parsed = parseExceptionalOpenRecoveryArguments(args);
  assert.deepEqual(parsed, {
    requestHash,
    actHash,
    claimHash: claim.contentSha256,
  });
  assert.deepEqual(
    readExceptionalOpenRecoveryClaim({ stateRoot: root, ...parsed }).claim,
    claim,
  );
  for (const invalid of [
    [],
    args.slice(1),
    args.slice(0, -1),
    [...args, "--force"],
    [...args.slice(0, 2), "main", ...args.slice(3)],
    ["--recover-closed", ...args.slice(1)],
    [args[0], args[3], args[4], args[1], args[2], args[5], args[6]],
    [...args.slice(0, 6), [claim.contentSha256]],
  ])
    assert.throws(() => parseExceptionalOpenRecoveryArguments(invalid));
  for (const key of ["actHash", "claimHash"])
    assert.throws(() =>
      readExceptionalOpenRecoveryClaim({
        stateRoot: root,
        ...parsed,
        [key]: h("wrong"),
      }),
    );

  const legacySnapshot = sourceSnapshot();
  legacySnapshot.deployments.result.deployments[0].id = cleanupDeploymentId;
  assert.equal(
    validateExceptionalOpenRecoveryActiveState({
      snapshot: legacySnapshot,
      claim,
      recoveryCapsule: published,
      matchingVersionIds: [],
      now: afterExpiration,
    }).alreadyRecovered,
    false,
  );
  // Simulate a process dying AFTER promotion; current HEAD/act expiry is never
  // used to classify the version as belonging to the interrupted release.
  const promoted = structuredClone(legacySnapshot);
  promoted.deployments.result.deployments[0].id = primaryDeploymentId;
  promoted.deployments.result.deployments[0].versions[0].version_id =
    primaryVersionId;
  promoted.settings.result.bindings.push({
    name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
    type: "plain_text",
    text: "false",
  });
  // D122: la versión primaria lleva Google encendido; la clasificación sigue
  // dependiendo de los version IDs, no del binding.
  promoted.settings.result.bindings.find(
    ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
  ).text = "true";
  assert.equal(
    validateExceptionalOpenRecoveryActiveState({
      snapshot: promoted,
      claim,
      recoveryCapsule: published,
      matchingVersionIds: [primaryVersionId],
      now: afterExpiration,
    }).activeVersionId,
    primaryVersionId,
  );
  const recovered = structuredClone(promoted);
  recovered.deployments.result.deployments[0].id = recoveredDeploymentId;
  recovered.deployments.result.deployments[0].versions[0].version_id =
    recoveryVersionId;
  recovered.settings.result.bindings.find(
    ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
  ).text = "false";
  assert.equal(
    validateExceptionalOpenRecoveryActiveState({
      snapshot: recovered,
      claim,
      recoveryCapsule: published,
      matchingVersionIds: [primaryVersionId],
      now: afterExpiration,
    }).alreadyRecovered,
    true,
  );
  for (const [snapshot, versionIds] of [
    [promoted, []],
    [promoted, [recoveryVersionId]],
    [promoted, [primaryVersionId, recoveryVersionId]],
    [sourceSnapshot(), []],
  ]) {
    assert.throws(() =>
      validateExceptionalOpenRecoveryActiveState({
        snapshot,
        claim,
        recoveryCapsule: published,
        matchingVersionIds: versionIds,
        now: afterExpiration,
      }),
    );
  }
  const split = structuredClone(promoted);
  split.deployments.result.deployments[0].versions[0].percentage = 50;
  assert.throws(() =>
    validateExceptionalOpenRecoveryActiveState({
      snapshot: split,
      claim,
      recoveryCapsule: published,
      matchingVersionIds: [primaryVersionId],
      now: afterExpiration,
    }),
  );

  const writeClaim = (value) =>
    writeFileSync(claimPath, canonicalJson(value), { mode: 0o600 });
  for (const mutate of [
    (v) => {
      v.releaseMode = "CLOSED";
    },
    (v) => {
      v.recoveryBindings.recoveryScope = "CANARY_ONLY";
    },
    (v) => {
      v.recoveryBindings.artifactHash = h("different-artifact");
    },
    (v) => {
      v.sourceVersionId = primaryVersionId;
    },
    (v) => {
      v.recoveryCapsuleHash = h("different-capsule");
    },
    (v) => {
      v.skipChecks = true;
    },
  ]) {
    const changed = structuredClone(payload);
    mutate(changed);
    const changedHash = payloadHash(changed);
    writeClaim({ ...changed, contentSha256: changedHash });
    assert.throws(() =>
      readExceptionalOpenRecoveryClaim({
        stateRoot: root,
        ...parsed,
        claimHash: changedHash,
      }),
    );
  }
  writeClaim(claim);
  const traffic = path.join(published.capsuleRoot, "wrangler.traffic.jsonc");
  const originalTraffic = readFileSync(traffic);
  const readCapsule = () =>
    readPublishedExceptionalOpenRecoveryCapsule({
      stateRoot: root,
      expectedBindings,
    });
  chmodSync(traffic, 0o644);
  assert.throws(readCapsule);
  chmodSync(traffic, 0o600);
  const link = path.join(root, "traffic-hardlink");
  linkSync(traffic, link);
  assert.throws(readCapsule);
  unlinkSync(link);
  const originalPath = `${traffic}.original`;
  renameSync(traffic, originalPath);
  symlinkSync(originalPath, traffic);
  assert.throws(readCapsule);
  unlinkSync(traffic);
  renameSync(originalPath, traffic);
  writeFileSync(traffic, "{}");
  assert.throws(readCapsule);
  writeFileSync(traffic, originalTraffic);
  const extra = path.join(published.capsuleRoot, ".env");
  writeFileSync(extra, "SYNTHETIC=1\n", { mode: 0o600 });
  assert.throws(readCapsule);
  unlinkSync(extra);
  chmodSync(published.capsuleRoot, 0o755);
  assert.throws(readCapsule);
  chmodSync(published.capsuleRoot, 0o700);
  assert.deepEqual(readCapsule().manifest, manifest);
  console.log(
    "OPEN recovery runtime: PASS (private FS, exact CLI/claim/scope, interrupted promotion, expired baseline, unrelated releases rejected; no remote calls).",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
