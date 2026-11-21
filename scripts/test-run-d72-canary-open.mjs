#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createD72CanaryRunner,
  assertD72OpenCanaryCleanupReceipt,
  assertD72OpenCanaryEmergencyRecoveryReceipt,
  assertD72CanaryBrowserCaptureSession,
} from "./run-d72-canary.mjs";
import { issueTestD72OpenCanaryConsentCleanupEvidence } from "./d72-open-update-evidence-policy.mjs";
import { createD72OpenCanaryTestFixture } from "./d72-canary-open-test-fixture.mjs";
import { createSyntheticOpenRecoveryFixture } from "./test-support/open-recovery-fixture.mjs";
import {
  createD72CanaryDevTtyReader,
  readD72CanaryAuthorizationToken,
  d72CanaryInfrastructureAuthorizationPhrase,
  d72CanaryAuthorizationEvidenceFromToken,
  d72CanaryVersionCertificationHash,
  createD72CanaryPlan,
} from "./d72-canary-policy.mjs";

const roots = [];
const ATTACH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CLEANUP_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const RECOVERY_ID = "44444444-4444-4444-8444-444444444444";
const RECOVERY_VERSION = "55555555-5555-4555-8555-555555555555";

async function prepare({
  mutateSnapshot = () => {},
  mutateVersion = () => {},
  failAttach = false,
  failRecovery = false,
} = {}) {
  const f = createD72OpenCanaryTestFixture();
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "agorbis-open-canary-test-"),
  );
  roots.push(directory);
  const calls = [];
  let state = "source";
  let now = "2026-08-31T11:55:00.000Z";
  let recovery;
  function snapshot() {
    const snapshot = structuredClone(f.snapshot);
    const deployment = snapshot.deployments.result.deployments[0];
    if (state === "attached") {
      deployment.id = ATTACH_ID;
      deployment.versions = [
        { percentage: 100, version_id: f.baseline.versionId },
        { percentage: 0, version_id: f.canaryVersionId },
      ];
    } else if (state === "cleaned") {
      deployment.id = CLEANUP_ID;
    } else if (state === "recovered") {
      deployment.id = RECOVERY_ID;
      deployment.versions = [{ percentage: 100, version_id: RECOVERY_VERSION }];
      snapshot.settings.result.bindings.push({
        name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
        text: "false",
        type: "plain_text",
      });
      snapshot.scripts.result[0].etag = "b".repeat(64);
      snapshot.scripts.result[0].tag = "c".repeat(32);
    }
    mutateSnapshot(snapshot, state);
    return snapshot;
  }
  const runner = createD72CanaryRunner({
    testOnly: true,
    nowImpl: () => new Date(now),
    ttyLineReaderImpl: () => "unused",
    validateArtifactImpl: () => [],
    verifyWranglerImpl: () => ({ version: "4.160.1" }),
    cronSecretReaderImpl: () => Buffer.from(f.existingSecret),
    prepareExpectedUploadManifestImpl: ({ uploadPlan }) => ({
      expectedArtifactHash: uploadPlan.artifactHash,
      uploadPayloadHash: f.uploadPayloadHash,
    }),
    verifyRemoteArtifactImpl: () => ({
      proofHash: "4".repeat(64),
      remoteScriptEtag: "9".repeat(64),
      staticAssetsVerified: true,
      uploadPayloadHash: f.uploadPayloadHash,
    }),
    getClosedStateImpl: async () => snapshot(),
    getVersionImpl: async (versionId) => {
      const body = f.candidateVersionResponse();
      if (versionId === RECOVERY_VERSION) {
        const upload = recovery.capsuleManifest.recoveryUploadEvidence;
        body.result.id = RECOVERY_VERSION;
        body.result.annotations["workers/message"] = upload.message;
        body.result.annotations["workers/tag"] = upload.tag;
        body.result.metadata.created_on = upload.uploadedAtUtc;
        body.result.resources.script.etag = upload.versionScriptEtag;
        body.result.resources.bindings.find(
          ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
        ).text = "false";
      }
      mutateVersion(body, versionId);
      return {
        stable: {
          body,
          endpoint: `/accounts/${f.baseline.accountId}/workers/scripts/agorbis/versions/${versionId}`,
          status: 200,
        },
        beta: {
          body: f.standardEnvelope({}),
          endpoint: `/accounts/${f.baseline.accountId}/workers/workers/agorbis/versions/${versionId}?include=modules`,
          method: "GET",
          status: 200,
        },
      };
    },
    createUploadApiGuardImpl: async () => ({
      apiBaseUrl: `http://127.0.0.1:49152/${"a".repeat(64)}`,
      close: async () => ({
        assetBulkPosts: 0,
        assetSessionPosts: 0,
        assetSinglePosts: 0,
        blockedMutationAttempts: 0,
        forwardedGets: 0,
        versionPosts: 0,
      }),
    }),
    execFileImpl: async (_command, args, options) => {
      calls.push([...args]);
      if (args.includes("--dry-run")) return { stdout: "", stderr: "" };
      if (args[2] === "upload")
        writeFileSync(
          options.env.WRANGLER_OUTPUT_FILE_PATH,
          f.uploadOutputSource,
          { mode: 0o600 },
        );
      else if (args.includes(`${f.canaryVersionId}@0%`)) {
        state = "attached";
        if (failAttach) throw new Error("synthetic attach failure");
      } else if (args.includes(`${RECOVERY_VERSION}@100%`)) {
        if (failRecovery) throw new Error("synthetic recovery failure");
        state = "recovered";
      } else if (args.includes(`${f.baseline.versionId}@100%`))
        state = "cleaned";
      else throw new Error("unexpected fixture command");
      return { stdout: "", stderr: "" };
    },
  });
  const uploadReceipt = await runner.uploadVersion({
    uploadPlan: f.uploadPlan,
    uploadPlanOptions: f.uploadOptions,
    artifactManifest: f.artifactManifest,
    authorizationToken: f.uploadAuthorizationToken,
  });
  const certification = await runner.certifyVersion({
    uploadPlan: f.uploadPlan,
    uploadPlanOptions: f.uploadOptions,
    uploadReceipt,
    artifactManifest: f.artifactManifest,
  });
  now = f.canaryCapabilityIssuedAtUtc;
  const grant = await runner.issueCapability({
    versionCertification: certification,
    expiresAtUtc: f.canaryCapabilityExpiresAtUtc,
    testOnlyNonce: f.canaryCapabilityNonce,
  });
  const zeroBindings = {
    head: f.head,
    requestHash: f.requestHash,
    policyHash: f.policyHash,
    artifactHash: f.artifactHash,
    accountId: f.baseline.accountId,
    workerName: "agorbis",
    ...f.profile,
    sourceDeploymentId: f.baseline.deploymentId,
    sourceVersionId: f.baseline.versionId,
    candidateVersionId: f.canaryVersionId,
    versionCertificationHash: d72CanaryVersionCertificationHash(certification),
  };
  const phrase = d72CanaryInfrastructureAuthorizationPhrase(zeroBindings);
  const authorizationToken = readD72CanaryAuthorizationToken({
    kind: "zero-percent-deployment",
    bindings: zeroBindings,
    ttyReader: createD72CanaryDevTtyReader({
      readLineImpl: () => phrase,
      testOnly: true,
    }),
    confirmedAtUtc: now,
  });
  recovery = createSyntheticOpenRecoveryFixture({
    head: f.head,
    requestHash: f.requestHash,
    artifactHash: f.artifactHash,
    recoveryArtifactHash: f.recoveryArtifactManifest.contentSha256,
    baseline: f.baseline,
    baselineSha256: f.baselineSha256,
    sourceSnapshot: f.snapshot,
    recoveryVersionId: RECOVERY_VERSION,
    candidateIdentityHash: certification.candidateIdentityHash,
    infraAuthorizationHash:
      d72CanaryAuthorizationEvidenceFromToken(authorizationToken)
        .statementSha256,
    createdAtUtc: now,
    recoveryRoot: path.join(directory, "recovery"),
  });
  const planOptions = {
    ...f.basePlanOptions,
    versionCertification: certification,
    zeroPercentDeploymentAuthorizationToken: authorizationToken,
    canaryCapabilityGrant: grant,
    now: new Date(now),
    recoveryCapsuleManifest: recovery.capsuleManifest,
    recoveryExpectedBindings: recovery.expectedBindings,
    recoveryRoot: recovery.recoveryRoot,
  };
  const plan = createD72CanaryPlan(planOptions);
  const attachOptions = {
    plan,
    planOptions,
    uploadPlan: f.uploadPlan,
    uploadPlanOptions: f.uploadOptions,
    artifactManifest: f.artifactManifest,
    capabilityGrant: grant,
    authorizationToken,
  };
  return {
    f,
    runner,
    calls,
    plan,
    planOptions,
    recovery,
    attachOptions,
    certification,
    getState: () => state,
    setNow: (value) => {
      now = value;
    },
  };
}

try {
  const p = await prepare();
  assert.equal(p.certification.releaseMode, "OPEN_UPDATE");
  assert.equal(p.plan.detach.arguments[3], `${p.f.baseline.versionId}@100%`);
  assert.equal(p.plan.recovery.arguments[3], `${RECOVERY_VERSION}@100%`);
  assert.equal(p.calls.filter((args) => args[2] === "deploy").length, 0);
  const suppliedPlan = structuredClone(p.plan);
  p.attachOptions.plan = suppliedPlan;
  const session = await p.runner.attachAtZero(p.attachOptions);
  suppliedPlan.detach.arguments[3] = `${RECOVERY_VERSION}@100%`;
  assert.equal(session.ordinaryTrafficExpectedOpen, true);
  assert.equal(Object.hasOwn(session, "closedVersionId"), false);
  assert.equal(session.attachedDeploymentId, ATTACH_ID);
  assert.equal(p.getState(), "attached");
  assert.deepEqual(await p.runner.assertCanarySessionStillAttached(session), {
    attachedAtZero: true,
    ordinaryTrafficExpectedOpen: true,
  });
  await assert.rejects(
    p.runner.assertCanarySessionStillAttached(structuredClone(session)),
    /sesión canaria no está activa/,
  );
  const cleanupBindings = {
    head: p.f.head,
    requestHash: p.f.requestHash,
    artifactHash: p.f.artifactHash,
    candidateIdentityHash: p.certification.candidateIdentityHash,
    canaryVersionId: p.f.canaryVersionId,
    openSourceBaselineSha256: p.f.baselineSha256,
    attachedDeploymentId: ATTACH_ID,
  };
  const browserController = await assertD72CanaryBrowserCaptureSession(
    session,
    cleanupBindings,
    { allowTestOnly: true },
  );
  assert.equal(browserController.attachedDeploymentId, ATTACH_ID);
  assert.equal(browserController.canaryVersionId, p.f.canaryVersionId);
  assert.equal(
    Object.keys(browserController.headersFor("https://agorbis.com/ingresar/"))
      .length,
    2,
  );
  assert.equal(
    Object.keys(
      browserController.headersFor("https://www.agorbis.com/registro/"),
    ).length,
    2,
  );
  for (const url of [
    "https://accounts.google.com/",
    "https://example.supabase.co/",
    "http://agorbis.com/",
    "https://agorbis.com:8443/",
    "https://user@agorbis.com/",
  ])
    assert.deepEqual(browserController.headersFor(url), {});
  await assert.rejects(
    assertD72CanaryBrowserCaptureSession(session, cleanupBindings),
    /runner autorizado/,
  );
  await assert.rejects(
    assertD72CanaryBrowserCaptureSession(
      structuredClone(session),
      cleanupBindings,
      { allowTestOnly: true },
    ),
    /runner autorizado/,
  );
  const consentCleanupEvidence = issueTestD72OpenCanaryConsentCleanupEvidence({
    testOnly: true,
    bindings: cleanupBindings,
  });
  const mutationsBeforeCleanup = p.calls.length;
  await assert.rejects(
    p.runner.cleanupCanarySession(session),
    /evidencia de retiro/,
  );
  await assert.rejects(
    p.runner.cleanupCanarySession(session, {
      consentCleanupEvidence: structuredClone(consentCleanupEvidence),
    }),
    /evidencia opaca/,
  );
  assert.equal(p.calls.length, mutationsBeforeCleanup);
  const cleanup = await p.runner.cleanupCanarySession(session, {
    consentCleanupEvidence,
  });
  assert.equal(p.getState(), "cleaned");
  assert.throws(
    () => browserController.headersFor("https://agorbis.com/"),
    /venció o terminó/,
  );
  assert.equal(cleanup.sourceVersionId, p.f.baseline.versionId);
  assert.equal(cleanup.cleanupDeploymentId, CLEANUP_ID);
  assert.equal(cleanup.recoveryVersionId, RECOVERY_VERSION);
  assert.equal(cleanup.cronCount, 5);
  assert.deepEqual(cleanup.deploymentChain, [
    {
      phase: "attach",
      previousDeploymentId: p.f.baseline.deploymentId,
      deploymentId: ATTACH_ID,
    },
    {
      phase: "cleanup",
      previousDeploymentId: ATTACH_ID,
      deploymentId: CLEANUP_ID,
    },
  ]);
  assert.equal(
    assertD72OpenCanaryCleanupReceipt(cleanup, cleanupBindings, {
      allowTestOnly: true,
    }),
    cleanup,
  );
  assert.throws(
    () => assertD72OpenCanaryCleanupReceipt(cleanup, cleanupBindings),
    /runner autorizado/,
  );
  assert.throws(
    () =>
      assertD72OpenCanaryCleanupReceipt(
        structuredClone(cleanup),
        cleanupBindings,
        { allowTestOnly: true },
      ),
    /runner autorizado/,
  );
  assert.equal(
    p.calls.some((args) => args.includes(`${RECOVERY_VERSION}@100%`)),
    false,
  );
  await assert.rejects(
    p.runner.cleanupCanarySession(session, { consentCleanupEvidence }),
    /sesión canaria opaca activa/,
  );

  const emergency = await prepare();
  const emergencySession = await emergency.runner.attachAtZero(
    emergency.attachOptions,
  );
  emergency.setNow("2026-09-01T12:00:00.000Z");
  const recovery =
    await emergency.runner.recoverOpenCanarySession(emergencySession);
  assert.equal(recovery.recoveryVerified, true);
  assert.equal(recovery.canarySucceeded, false);
  assert.equal(recovery.recoveryVersionId, RECOVERY_VERSION);
  assert.equal(recovery.recoveryDeploymentId, RECOVERY_ID);
  assert.equal(recovery.observedAtUtc, "2026-09-01T12:00:00.000Z");
  assert.equal(emergency.getState(), "recovered");
  assert.equal(Object.hasOwn(recovery, "deploymentChain"), false);
  assert.equal(Object.hasOwn(recovery, "cleanupVerified"), false);
  const emergencyBindings = {
    candidateIdentityHash: emergency.certification.candidateIdentityHash,
    head: emergency.f.head,
    requestHash: emergency.f.requestHash,
    artifactHash: emergency.f.artifactHash,
    canaryVersionId: emergency.f.canaryVersionId,
    openSourceBaselineSha256: emergency.f.baselineSha256,
  };
  assert.equal(
    assertD72OpenCanaryEmergencyRecoveryReceipt(recovery, emergencyBindings, {
      allowTestOnly: true,
    }),
    recovery,
  );
  assert.throws(
    () =>
      assertD72OpenCanaryEmergencyRecoveryReceipt(recovery, emergencyBindings),
    /runner autorizado/,
  );
  assert.throws(
    () =>
      assertD72OpenCanaryEmergencyRecoveryReceipt(
        structuredClone(recovery),
        emergencyBindings,
        { allowTestOnly: true },
      ),
    /runner autorizado/,
  );
  for (const key of Object.keys(emergencyBindings)) {
    assert.throws(
      () =>
        assertD72OpenCanaryEmergencyRecoveryReceipt(
          recovery,
          { ...emergencyBindings, [key]: "changed" },
          { allowTestOnly: true },
        ),
      /no corresponde/,
    );
  }
  assert.throws(
    () =>
      assertD72OpenCanaryEmergencyRecoveryReceipt(cleanup, emergencyBindings, {
        allowTestOnly: true,
      }),
    /runner autorizado/,
  );
  assert.throws(
    () =>
      assertD72OpenCanaryCleanupReceipt(recovery, cleanupBindings, {
        allowTestOnly: true,
      }),
    /runner autorizado/,
  );

  const attachFailure = await prepare({ failAttach: true });
  await assert.rejects(
    attachFailure.runner.attachAtZero(attachFailure.attachOptions),
    /cleanup restauró fallback OPEN verificado/,
  );
  assert.equal(attachFailure.getState(), "recovered");
  const incidentFailure = await prepare({
    failAttach: true,
    failRecovery: true,
  });
  await assert.rejects(
    incidentFailure.runner.attachAtZero(incidentFailure.attachOptions),
    /fallback OPEN no pudo verificarse/,
  );
  assert.equal(incidentFailure.getState(), "attached");

  const duplicatedZero = await prepare({
    mutateSnapshot(snapshot, state) {
      if (state === "attached")
        snapshot.deployments.result.deployments[0].versions = [
          {
            percentage: 0,
            version_id:
              snapshot.deployments.result.deployments[0].versions[1].version_id,
          },
          {
            percentage: 0,
            version_id:
              snapshot.deployments.result.deployments[0].versions[1].version_id,
          },
        ];
    },
  });
  await assert.rejects(
    duplicatedZero.runner.attachAtZero(duplicatedZero.attachOptions),
    /cleanup restauró fallback OPEN verificado/,
  );
  assert.equal(duplicatedZero.getState(), "recovered");

  const badFallback = await prepare({
    mutateVersion(body, versionId) {
      if (versionId === RECOVERY_VERSION)
        body.result.resources.bindings.find(
          ({ name }) => name === "PUBLIC_GOOGLE_AUTH_ENABLED",
        ).text = "true";
    },
  });
  await assert.rejects(
    badFallback.runner.attachAtZero(badFallback.attachOptions),
    /PUBLIC_GOOGLE_AUTH_ENABLED/,
  );
  assert.equal(
    badFallback.calls.some((args) => args[2] === "deploy"),
    false,
  );

  const alteredRecoveryFile = await prepare();
  writeFileSync(
    path.join(
      alteredRecoveryFile.recovery.recoveryRoot,
      "wrangler.traffic.jsonc",
    ),
    "{}",
    { mode: 0o600 },
  );
  await assert.rejects(
    alteredRecoveryFile.runner.attachAtZero(alteredRecoveryFile.attachOptions),
    /hash fijado/,
  );
  assert.equal(
    alteredRecoveryFile.calls.some((args) => args[2] === "deploy"),
    false,
  );
  console.log(
    "OPEN canary runner: PASS, fixture upload/GET/capability/100-0/opaque cleanup chain and emergency recovery; no production operations.",
  );
} finally {
  for (const directory of roots)
    rmSync(directory, { recursive: true, force: true });
}
