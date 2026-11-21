#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { verifyD72CanaryCapability as verifyWorkerD72CanaryCapability } from "../src/lib/d72-canary-capability.js";
import {
  D72_CANARY_ALLOWED_WRANGLER_OPERATIONS,
  D72_CANARY_EXPECTED_BINDING_NAMES,
  D72_CANARY_EXPECTED_OPEN_CRONS,
  D72_CANARY_EXPECTED_SECRET_NAMES,
  D72_CANARY_NODE_VERSION,
  D72_CANARY_PROBE_EXPECTATIONS,
  D72_CANARY_STATEFUL_CHECK_IDS,
  D72_CANARY_VERSION_OVERRIDE_HEADER,
  D72_CANARY_WRANGLER_VERSION,
  assertD72CanaryPlan,
  assertD72CanaryProductionAuthorizationToken,
  consumeD72CanaryAuthorizationToken,
  createD72CanaryDevTtyReader,
  createD72CanaryProductionDevTtyReader,
  createD72CanaryAuthorizationEvidence,
  createD72CanaryCapability,
  createD72CanaryCapabilityGrant,
  createD72CanaryPlan,
  createD72CanaryReceipt,
  createD72CanaryVersionCertification,
  createD72CanaryVersionUploadAuthorizationPreview,
  createD72CanaryVersionUploadPlan,
  d72CanaryCapabilityBindingHash,
  d72CanaryStatefulCapabilityDescriptorFromGrant,
  d72CanaryInfrastructureAuthorizationPhrase,
  d72CanaryAuthorizationEvidenceFromToken,
  d72CanaryReceiptContentHash,
  d72CanaryScopedBrowserHeaders,
  d72CanaryStatefulAuthorizationPhrase,
  d72CanaryVersionCertificationHash,
  d72CanaryVersionOverrideHeaders,
  d72CanaryVersionUploadAuthorizationPhrase,
  parseD72CanaryVersionGetAttestation,
  parseD72CanaryVersionUploadReceipt,
  readD72CanaryAuthorizationToken,
  validateD72CanaryCommandStep,
  validateD72CanaryPlan,
  validateD72CanaryReceipt,
  validateD72CanaryVersionCertification,
  validateD72CanaryVersionOverrideScope,
  validateD72CanaryVersionUploadPlan,
  verifyD72CanaryCapability,
} from "./d72-canary-policy.mjs";
import {
  EXCEPTIONAL_RELEASE_ARTIFACT_NODE_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_SCHEMA_VERSION,
  EXCEPTIONAL_RELEASE_ARTIFACT_WRANGLER_VERSION,
  exceptionalReleaseArtifactHash,
} from "./exceptional-release-artifact.mjs";
import {
  EXCEPTIONAL_WRANGLER_EXECUTION_ENTRYPOINT_SHA256,
  EXCEPTIONAL_WRANGLER_INTEGRITY_POLICY,
} from "./exceptional-wrangler-integrity.mjs";
import {
  createD72CandidateIdentity,
  createD72NonStatefulEvidenceCertification,
} from "./d72-non-waivable-evidence-policy.mjs";
import {
  NON_STATEFUL_GATE_IDS,
  NON_WAIVABLE_GATE_EVIDENCE_CATALOG,
} from "./non-waivable-gate-evidence-catalog.mjs";
import {
  EVIDENCE_STATUS,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
} from "./release-gate-policy.mjs";
import {
  createD72CanaryUploadApiGuard,
  createD72CanaryRunner,
  readD72BoundedCloudflareJsonResponse,
} from "./run-d72-canary.mjs";

assert.equal(process.versions.node, D72_CANARY_NODE_VERSION);

const runnerSource = readFileSync(
  new URL("./run-d72-canary.mjs", import.meta.url),
  "utf8",
);
assert.equal(
  runnerSource.match(/Authorization: `Bearer \$\{oauthToken\}`/gu)?.length,
  1,
);
assert.match(
  runnerSource,
  /headers: \{\s*Accept: "application\/json",\s*Authorization: `Bearer \$\{oauthToken\}`,\s*\}/u,
);

const uploadGuardObservedUrls = [];
let uploadGuardSawAuthorization = false;
let uploadGuardSawIdentityEncoding = false;
const uploadGuardSecret = "fixture-oauth-secret-never-log";
const uploadGuardJwt = "fixture.assets.jwt.never-log";
const uploadGuard = await createD72CanaryUploadApiGuard({
  testOnly: true,
  fetchImpl: async (url, init) => {
    uploadGuardObservedUrls.push(url);
    uploadGuardSawAuthorization ||= init.headers.has("authorization");
    uploadGuardSawIdentityEncoding ||=
      init.headers.get("accept-encoding") === "identity";
    if (init.body !== undefined) {
      for await (const _chunk of init.body) {
        // Consume the fixture stream without retaining request bytes or JWTs.
      }
    }
    return new Response(JSON.stringify({ result: { jwt: uploadGuardJwt } }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  },
});
assert.match(
  uploadGuard.apiBaseUrl,
  /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}$/,
);
const guardedRequest = (resource, init = {}) =>
  fetch(`${uploadGuard.apiBaseUrl}${resource}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${uploadGuardSecret}`,
      ...(init.headers ?? {}),
    },
    redirect: "manual",
  });
const guardAccountRoot = "/accounts/4d78fb10c1ae65281ec851479d5045dc/workers";
const guardedGet = await guardedRequest(`${guardAccountRoot}/services/agorbis`);
assert.equal(guardedGet.status, 200);
assert.deepEqual(await guardedGet.json(), {
  result: { jwt: uploadGuardJwt },
});
for (const resource of [
  `${guardAccountRoot}/scripts/agorbis/assets-upload-session`,
  `${guardAccountRoot}/assets/upload?base64=true`,
  `${guardAccountRoot}/assets/upload/${"a".repeat(32)}`,
  `${guardAccountRoot}/scripts/agorbis/versions?bindings_inherit=strict`,
]) {
  const response = await guardedRequest(resource, {
    body: "fixture-body",
    method: "POST",
  });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
}
const upstreamCountBeforeRejectedMutations = uploadGuardObservedUrls.length;
const rejectedDuplicateVersion = await guardedRequest(
  `${guardAccountRoot}/scripts/agorbis/versions?bindings_inherit=strict`,
  { body: "duplicate-version", method: "POST" },
);
const rejectedDuplicateVersionBody = await rejectedDuplicateVersion.text();
assert.equal(rejectedDuplicateVersion.status, 405);
const rejectedPatch = await guardedRequest(
  `${guardAccountRoot}/scripts/agorbis/script-settings`,
  {
    body: JSON.stringify({ tags: [uploadGuardJwt] }),
    method: "PATCH",
  },
);
const rejectedPatchBody = await rejectedPatch.text();
assert.equal(rejectedPatch.status, 405);
const rejectedUnknownPost = await guardedRequest(
  `${guardAccountRoot}/scripts/agorbis/deployments`,
  { body: uploadGuardJwt, method: "POST" },
);
const rejectedUnknownPostBody = await rejectedUnknownPost.text();
assert.equal(rejectedUnknownPost.status, 405);
assert.equal(
  uploadGuardObservedUrls.length,
  upstreamCountBeforeRejectedMutations,
);
const uploadGuardReport = await uploadGuard.close();
assert.deepEqual(uploadGuardReport, {
  assetBulkPosts: 1,
  assetSessionPosts: 1,
  assetSinglePosts: 1,
  blockedMutationAttempts: 3,
  forwardedGets: 1,
  versionPosts: 1,
});
assert.equal(uploadGuardSawAuthorization, true);
assert.equal(uploadGuardSawIdentityEncoding, true);
assert.equal(
  `${rejectedDuplicateVersionBody}${rejectedPatchBody}${rejectedUnknownPostBody}${JSON.stringify(uploadGuardReport)}`.includes(
    uploadGuardSecret,
  ),
  false,
);
assert.equal(
  `${rejectedDuplicateVersionBody}${rejectedPatchBody}${rejectedUnknownPostBody}${JSON.stringify(uploadGuardReport)}`.includes(
    uploadGuardJwt,
  ),
  false,
);
assert.equal(
  uploadGuardObservedUrls.every((url) =>
    url.startsWith("https://api.cloudflare.com/client/v4/"),
  ),
  true,
);
await assert.rejects(
  createD72CanaryUploadApiGuard({
    fetchImpl: async () => new Response("{}"),
  }),
  /no admite transport ni opciones abiertas/,
);

let oversizedResponseCancelled = false;
const oversizedResponse = new Response(
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new Uint8Array(128));
    },
    cancel() {
      oversizedResponseCancelled = true;
    },
  }),
  { headers: { "content-type": "application/json" }, status: 200 },
);
assert.equal(oversizedResponse.headers.get("content-length"), null);
await assert.rejects(
  readD72BoundedCloudflareJsonResponse(oversizedResponse, 32),
  /excedió el tamaño aprobado/,
);
assert.equal(oversizedResponseCancelled, true);
const chunkedJsonResponse = new Response(
  new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"success":'));
      controller.enqueue(new TextEncoder().encode("true}"));
      controller.close();
    },
  }),
  { headers: { "content-type": "application/json" }, status: 200 },
);
assert.deepEqual(
  await readD72BoundedCloudflareJsonResponse(chunkedJsonResponse, 32),
  { success: true },
);

import {
  head,
  requestHash,
  policyHash,
  statefulManifestHash,
  canaryId,
  closedDeploymentId,
  closedVersionId,
  canaryVersionId,
  differentVersionId,
  root,
  artifactRoot,
  nodeExecutable,
  existingSecret,
  canaryCapabilityIssuedAtUtc,
  canaryCapabilityExpiresAtUtc,
  canaryCapabilityNonce,
  capabilityNow,
  wrangler,
  artifactManifestPayload,
  artifactManifest,
  artifactHash,
  uploadPayloadHash,
  standardEnvelope,
  observability,
  customDomain,
  closedStateSnapshot,
  attachedAtZeroStateSnapshot,
  nonStatefulEvidence,
  candidateIdentity,
  nonStatefulCertification,
  basePlanOptions,
  candidateVersionResponse as fixtureCandidateVersionResponse,
} from "./d72-canary-test-fixture.mjs";
function candidateVersionResponse(overrides = {}) {
  return fixtureCandidateVersionResponse(uploadPlan, overrides);
}

const uploadAuthorizationBindings = {
  head,
  requestHash,
  policyHash,
  artifactHash,
  workerName: "agorbis",
  closedVersionId,
};
const uploadPhrase = d72CanaryVersionUploadAuthorizationPhrase(
  uploadAuthorizationBindings,
);
assert.throws(
  () =>
    createD72CanaryDevTtyReader({
      readLineImpl: () => uploadPhrase,
    }),
  /sólo para fixtures testOnly/,
);
const uploadAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "version-upload",
  bindings: uploadAuthorizationBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => uploadPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T11:51:00.000Z",
});
assert.throws(
  () =>
    assertD72CanaryProductionAuthorizationToken(uploadAuthorizationToken, {
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
    }),
  /productiva/,
);
assert.throws(
  () =>
    readD72CanaryAuthorizationToken({
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
      ttyReader: createD72CanaryDevTtyReader({
        readLineImpl: () => uploadPhrase,
        testOnly: true,
      }),
      confirmedAtUtc: "2026-08-31T11:51:00.000Z",
      unexpected: true,
    }),
  /opciones faltantes o desconocidas/,
);
assert.throws(
  () =>
    readD72CanaryAuthorizationToken({
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
      ttyReader: createD72CanaryProductionDevTtyReader(),
      confirmedAtUtc: "2026-08-31T11:51:00.000Z",
    }),
  /reloj interno/,
);
const staleUploadAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "version-upload",
  bindings: uploadAuthorizationBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => uploadPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T11:00:00.000Z",
});
const unknownOptionUploadAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "version-upload",
  bindings: uploadAuthorizationBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => uploadPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T11:01:00.000Z",
});
assert.throws(
  () =>
    consumeD72CanaryAuthorizationToken(unknownOptionUploadAuthorizationToken, {
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
      allowTestToken: true,
      now: new Date("2026-08-31T11:02:00.000Z"),
      unexpected: true,
    }),
  /opciones faltantes o desconocidas/,
);
assert.throws(
  () =>
    consumeD72CanaryAuthorizationToken(staleUploadAuthorizationToken, {
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
      allowTestToken: true,
      now: new Date("2026-08-31T11:15:00.001Z"),
    }),
  /vencido o adelantado/,
);
const uploadOptions = {
  ...basePlanOptions,
  candidateIdentity,
  nonStatefulCertification,
  versionUploadAuthorizationToken: uploadAuthorizationToken,
  testOnlyEvidence: true,
  now: new Date("2026-08-31T11:50:00.000Z"),
};
const uploadPreview = createD72CanaryVersionUploadAuthorizationPreview({
  ...basePlanOptions,
  candidateIdentity,
  nonStatefulCertification,
  testOnlyEvidence: true,
  now: new Date("2026-08-31T11:50:00.000Z"),
});
assert.equal(uploadPreview.authorizationPhrase, uploadPhrase);
assert.equal(uploadPreview.authorizationRequired, true);
assert.equal(uploadPreview.candidateVersionId, null);
assert.equal(uploadPreview.closedTrafficPercentage, 100);
assert.equal(uploadPreview.candidateTrafficPercentage, 0);
assert.equal(uploadPreview.deploymentAuthorized, false);
assert.equal(uploadPreview.deploymentExecuted, false);
assert.equal(uploadPreview.remoteMutationExecuted, false);
assert.throws(
  () =>
    createD72CanaryVersionUploadPlan({
      ...uploadOptions,
      testOnlyEvidence: false,
    }),
  /no admite un reloj inyectado/,
);
const uploadPlan = createD72CanaryVersionUploadPlan(uploadOptions);
assert.deepEqual(uploadPreview.upload, uploadPlan.upload);
assert.deepEqual(
  uploadPreview.postUploadVerification,
  uploadPlan.postUploadVerification,
);
assert.throws(
  () =>
    createD72CanaryVersionUploadPlan({
      ...uploadOptions,
      versionUploadAuthorizationToken: structuredClone(
        uploadAuthorizationToken,
      ),
    }),
  /token opaco|\/dev\/tty/,
);
assert.deepEqual(
  validateD72CanaryVersionUploadPlan(uploadPlan, uploadOptions),
  [],
);
assert.equal(uploadPlan.candidateVersionId, null);
assert.equal(uploadPlan.capabilityCreated, false);
assert.equal(uploadPlan.candidateAttached, false);
assert.equal(uploadPlan.closedTrafficPercentage, 100);
assert.equal(uploadPlan.candidateTrafficPercentage, 0);
assert.deepEqual(uploadPlan.upload.arguments, [
  wrangler,
  "versions",
  "upload",
  "--config",
  path.join(artifactRoot, "wrangler.jsonc"),
  "--cwd",
  artifactRoot,
  "--env-file",
  path.join(artifactRoot, "exceptional-release-empty.env"),
  "--name",
  "agorbis",
  "--no-experimental-provision",
  "--no-experimental-auto-create",
  "--strict",
  "--tag",
  `d72-canary-${head}`,
  "--message",
  uploadPlan.upload.arguments.at(-1),
]);
assert.throws(
  () =>
    createD72CanaryVersionUploadPlan({
      ...uploadOptions,
      candidateVersionId: canaryVersionId,
    }),
  /todavía no creó|no admite candidateVersionId/,
);
assert.throws(
  () =>
    createD72CanaryVersionUploadPlan({
      ...uploadOptions,
      canaryCapability: "placeholder",
    }),
  /todavía no creó|no admite canaryCapability/,
);

assert.equal(
  uploadPhrase,
  `AUTORIZO CREAR VERSION CANARIA CLOUDFLARE D72 SIN DEPLOYMENT NI TRAFICO PARA ${head} CON REQUEST ${requestHash} POLICY ${policyHash} ARTEFACTO ${artifactHash} WORKER agorbis CLOSED ${closedVersionId} AL CIEN POR CIENTO Y CANDIDATE AL CERO POR CIENTO`,
);

const uploadOutputRecord = {
  type: "version-upload",
  version: 1,
  worker_name: "agorbis",
  worker_tag: "f".repeat(32),
  version_id: canaryVersionId,
  worker_name_overridden: false,
  timestamp: "2026-08-31T11:53:00.000Z",
};
const uploadSessionRecord = {
  type: "wrangler-session",
  version: 1,
  wrangler_version: D72_CANARY_WRANGLER_VERSION,
  command_line_args: uploadPlan.upload.arguments.slice(1),
  log_file_path: "/tmp/agorbis-d72-wrangler.log",
  timestamp: "2026-08-31T11:52:59.000Z",
};
const uploadOutputSource = `${JSON.stringify(uploadSessionRecord)}\n${JSON.stringify(uploadOutputRecord)}\n`;
const uploadReceipt = parseD72CanaryVersionUploadReceipt({
  uploadPlan,
  uploadPayloadHash,
  outputFileSource: uploadOutputSource,
  exitCode: 0,
  now: new Date("2026-08-31T11:53:00.000Z"),
});
const uploadReceiptWithCanonicalOptionals = parseD72CanaryVersionUploadReceipt({
  uploadPlan,
  uploadPayloadHash,
  outputFileSource: `${JSON.stringify(uploadSessionRecord)}\n${JSON.stringify({
    ...uploadOutputRecord,
    preview_alias_url: null,
    preview_url: null,
    wrangler_environment: null,
  })}\n`,
  exitCode: 0,
  now: new Date("2026-08-31T11:53:00.000Z"),
});
assert.equal(
  uploadReceiptWithCanonicalOptionals.candidateVersionId,
  canaryVersionId,
);
assert.throws(
  () =>
    parseD72CanaryVersionUploadReceipt({
      uploadPlan,
      uploadPayloadHash,
      outputFileSource: uploadOutputSource,
      exitCode: 1,
      now: new Date("2026-08-31T11:53:00.000Z"),
    }),
  /exit 0/,
);
assert.throws(
  () =>
    parseD72CanaryVersionUploadReceipt({
      uploadPlan,
      uploadPayloadHash,
      outputFileSource: `${JSON.stringify(uploadSessionRecord)}\n${JSON.stringify(
        {
          ...uploadOutputRecord,
          unexpected: true,
        },
      )}\n`,
      exitCode: 0,
      now: new Date("2026-08-31T11:53:00.000Z"),
    }),
  /faltantes o no aprobados/,
);
const getSet = {
  closedState: {
    method: "GET",
    observedAtUtc: "2026-08-31T11:54:00.000Z",
    snapshot: closedStateSnapshot(),
  },
  version: {
    body: candidateVersionResponse(),
    endpoint: `/accounts/4d78fb10c1ae65281ec851479d5045dc/workers/scripts/agorbis/versions/${canaryVersionId}`,
    method: "GET",
    observedAtUtc: "2026-08-31T11:55:00.000Z",
    status: 200,
  },
};
const versionGetAttestation = parseD72CanaryVersionGetAttestation({
  uploadPlan,
  uploadReceipt,
  artifactManifest,
  getSet,
  now: new Date(getSet.version.observedAtUtc),
});
assert.throws(
  () =>
    parseD72CanaryVersionGetAttestation({
      uploadPlan,
      uploadReceipt: structuredClone(uploadReceipt),
      artifactManifest,
      getSet,
      now: new Date(getSet.version.observedAtUtc),
    }),
  /receipt opaco/,
);
const unexpectedVersionFieldGet = structuredClone(getSet);
unexpectedVersionFieldGet.version.body.result.unexpected = true;
assert.throws(
  () =>
    parseD72CanaryVersionGetAttestation({
      uploadPlan,
      uploadReceipt,
      artifactManifest,
      getSet: unexpectedVersionFieldGet,
      now: new Date(getSet.version.observedAtUtc),
    }),
  /faltantes o no aprobados/,
);
const versionCertification = createD72CanaryVersionCertification({
  uploadPlan,
  versionGetAttestation,
  now: new Date(getSet.version.observedAtUtc),
});
const versionCertificationHash =
  d72CanaryVersionCertificationHash(versionCertification);
const zeroPercentAuthorizationBindings = {
  head,
  requestHash,
  policyHash,
  artifactHash,
  accountId: "4d78fb10c1ae65281ec851479d5045dc",
  workerName: "agorbis",
  closedDeploymentId,
  closedVersionId,
  candidateVersionId: canaryVersionId,
  versionCertificationHash,
};
const zeroPercentPhrase = d72CanaryInfrastructureAuthorizationPhrase(
  zeroPercentAuthorizationBindings,
);
assert.match(zeroPercentPhrase, new RegExp(canaryVersionId));
assert.match(zeroPercentPhrase, new RegExp(versionCertificationHash));
assert.notEqual(uploadPhrase, zeroPercentPhrase);
const zeroPercentAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "zero-percent-deployment",
  bindings: zeroPercentAuthorizationBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => zeroPercentPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T11:56:00.000Z",
});
assert.deepEqual(
  validateD72CanaryVersionCertification(versionCertification, {
    expectedHead: head,
    expectedRequestHash: requestHash,
    expectedPolicyHash: policyHash,
    expectedArtifactHash: artifactHash,
    expectedClosedDeploymentId: closedDeploymentId,
    expectedClosedVersionId: closedVersionId,
    expectedUploadPlanHash: uploadPlan.planSha256,
    expectedCandidateVersionId: canaryVersionId,
    now: capabilityNow,
  }),
  [],
);
assert.equal(versionCertification.candidateVersionId, canaryVersionId);
assert.equal(versionCertification.candidateAttached, false);
assert.equal(versionCertification.capabilityCreated, false);
assert.throws(
  () =>
    createD72CanaryVersionCertification({
      uploadPlan,
      versionGetAttestation: structuredClone(versionGetAttestation),
      now: new Date(getSet.version.observedAtUtc),
    }),
  /attestation GET opaca/,
);
assert.throws(
  () =>
    createD72CanaryVersionCertification({
      uploadPlan,
      observation: {
        artifactHash,
        candidateVersionId: canaryVersionId,
        source: "cloudflare-read-only-get-set",
      },
      now: new Date(getSet.version.observedAtUtc),
    }),
  /attestation GET opaca/,
);
assert.throws(
  () =>
    parseD72CanaryVersionGetAttestation({
      uploadPlan,
      uploadReceipt,
      artifactManifest: { ...artifactManifest, contentSha256: "0".repeat(64) },
      getSet,
      now: new Date(getSet.version.observedAtUtc),
    }),
  /Manifest del artefacto|artifact/i,
);
const differentVersionGet = structuredClone(getSet);
differentVersionGet.version.body.result.id = differentVersionId;
assert.throws(
  () =>
    parseD72CanaryVersionGetAttestation({
      uploadPlan,
      uploadReceipt,
      artifactManifest,
      getSet: differentVersionGet,
      now: new Date(getSet.version.observedAtUtc),
    }),
  /candidateVersionId distinto/,
);
const unexpectedBindingGet = structuredClone(getSet);
unexpectedBindingGet.version.body.result.resources.bindings.push({
  name: "UNAPPROVED_BINDING",
  text: "forbidden",
  type: "plain_text",
});
assert.throws(
  () =>
    parseD72CanaryVersionGetAttestation({
      uploadPlan,
      uploadReceipt,
      artifactManifest,
      getSet: unexpectedBindingGet,
      now: new Date(getSet.version.observedAtUtc),
    }),
  /plaintext|binding/i,
);
const postUploadCronMutation = structuredClone(getSet);
postUploadCronMutation.closedState.snapshot.schedules.result.schedules.push({
  cron: "* * * * *",
});
assert.throws(
  () =>
    parseD72CanaryVersionGetAttestation({
      uploadPlan,
      uploadReceipt,
      artifactManifest,
      getSet: postUploadCronMutation,
      now: new Date(getSet.version.observedAtUtc),
    }),
  /Cron Trigger/i,
);

const capabilityBinding = {
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryVersionId,
  issuedAtUtc: canaryCapabilityIssuedAtUtc,
  expiresAtUtc: canaryCapabilityExpiresAtUtc,
  nonce: canaryCapabilityNonce,
};
const canaryCapability = createD72CanaryCapability({
  ...capabilityBinding,
  versionCertification,
  existingSecret,
  now: capabilityNow,
});
const policyCapabilityGrant = createD72CanaryCapabilityGrant({
  ...capabilityBinding,
  existingSecret,
  versionCertification,
  now: capabilityNow,
});
assert.equal(Object.hasOwn(policyCapabilityGrant, "capability"), false);
const statefulDescriptor = d72CanaryStatefulCapabilityDescriptorFromGrant(
  policyCapabilityGrant,
  capabilityBinding,
  { now: capabilityNow },
);
assert.equal(statefulDescriptor.bindingHash, policyCapabilityGrant.bindingHash);
assert.equal(
  statefulDescriptor.expiresAtUtc,
  policyCapabilityGrant.expiresAtUtc,
);
assert.equal(
  JSON.stringify(statefulDescriptor).includes(canaryCapability),
  false,
);
assert.equal(
  JSON.stringify(statefulDescriptor).includes(existingSecret),
  false,
);
assert.throws(
  () =>
    d72CanaryStatefulCapabilityDescriptorFromGrant(
      structuredClone(policyCapabilityGrant),
      capabilityBinding,
      { now: capabilityNow },
    ),
  /opaco/,
);
assert.throws(
  () =>
    d72CanaryStatefulCapabilityDescriptorFromGrant(
      policyCapabilityGrant,
      { ...capabilityBinding, artifactHash: "f".repeat(64) },
      { now: capabilityNow },
    ),
  /Grant distinto/,
);
assert.equal(
  JSON.stringify(policyCapabilityGrant).includes(canaryCapability),
  false,
);
assert.equal(
  JSON.stringify(policyCapabilityGrant).includes(existingSecret),
  false,
);
assert.equal(
  verifyD72CanaryCapability({
    capability: canaryCapability,
    existingSecret,
    now: capabilityNow,
    ...capabilityBinding,
  }),
  true,
);
assert.equal(
  verifyD72CanaryCapability({
    capability: canaryCapability,
    existingSecret,
    now: new Date(canaryCapabilityExpiresAtUtc),
    ...capabilityBinding,
  }),
  false,
);
const capabilityBindingHash = d72CanaryCapabilityBindingHash(capabilityBinding);
assert.equal(
  verifyD72CanaryCapability({
    capability: canaryCapability,
    existingSecret,
    now: capabilityNow,
    retiredCapabilityBindingHashes: [capabilityBindingHash],
    ...capabilityBinding,
  }),
  false,
);
assert.throws(
  () =>
    createD72CanaryCapability({
      ...capabilityBinding,
      canaryVersionId: differentVersionId,
      versionCertification,
      existingSecret,
      now: capabilityNow,
    }),
  /no coincide/,
);
assert.equal(
  verifyD72CanaryCapability({
    capability: canaryCapability,
    existingSecret,
    now: capabilityNow,
    ...capabilityBinding,
    canaryVersionId: differentVersionId,
  }),
  false,
);
assert.deepEqual(
  await verifyWorkerD72CanaryCapability({
    token: canaryCapability,
    secret: existingSecret,
    expectedVersionId: canaryVersionId,
    now: capabilityNow,
  }),
  Object.freeze({
    artifactHash,
    expiresAtUtc: canaryCapabilityExpiresAtUtc,
    head,
    issuedAtUtc: canaryCapabilityIssuedAtUtc,
    nonce: canaryCapabilityNonce,
    policyHash,
    requestHash,
    schemaVersion: "agorbis-d72-canary-capability/v1",
    versionId: canaryVersionId,
  }),
);

const deploymentPlanOptions = {
  ...basePlanOptions,
  versionCertification,
  canaryCapabilityGrant: policyCapabilityGrant,
  zeroPercentDeploymentAuthorizationToken: zeroPercentAuthorizationToken,
  now: capabilityNow,
};
assert.throws(
  () =>
    createD72CanaryPlan({
      ...basePlanOptions,
      versionCertification,
      canaryCapability,
      canaryCapabilityIssuedAtUtc,
      canaryCapabilityExpiresAtUtc,
      canaryCapabilityNonce,
      existingSecret,
      zeroPercentDeploymentAuthorizationToken: zeroPercentAuthorizationToken,
      now: capabilityNow,
    }),
  /exclusivamente el grant HMAC opaco/,
);
const plan = createD72CanaryPlan(deploymentPlanOptions);
const shortLivedCapabilityGrant = createD72CanaryCapabilityGrant({
  ...capabilityBinding,
  expiresAtUtc: "2026-08-31T12:00:10.000Z",
  existingSecret,
  versionCertification,
  now: capabilityNow,
});
assert.throws(
  () =>
    createD72CanaryPlan({
      ...deploymentPlanOptions,
      canaryCapabilityGrant: shortLivedCapabilityGrant,
      now: new Date("2026-08-31T12:00:10.000Z"),
    }),
  /vigente|expirar|20 minutos/,
);
assert.deepEqual(validateD72CanaryPlan(plan, deploymentPlanOptions), []);
assert.doesNotThrow(() => assertD72CanaryPlan(plan, deploymentPlanOptions));
assert.deepEqual(D72_CANARY_ALLOWED_WRANGLER_OPERATIONS, [
  "versions upload",
  "versions deploy",
]);
assert.equal(Object.hasOwn(plan, "upload"), false);
assert.equal(
  plan.versionCertificationHash,
  d72CanaryVersionCertificationHash(versionCertification),
);
assert.deepEqual(plan.attach.arguments.slice(0, 5), [
  wrangler,
  "versions",
  "deploy",
  `${closedVersionId}@100%`,
  `${canaryVersionId}@0%`,
]);
assert.deepEqual(plan.detach.arguments.slice(0, 4), [
  wrangler,
  "versions",
  "deploy",
  `${closedVersionId}@100%`,
]);
for (const step of [uploadPlan.upload, plan.attach, plan.detach]) {
  assert.equal(step.arguments.includes("--no-experimental-provision"), true);
  assert.equal(step.arguments.includes("--no-experimental-auto-create"), true);
  assert.equal(
    step.arguments.some((argument) =>
      ["triggers", "routes", "domains", "secret", "secrets", "dns"].includes(
        argument,
      ),
    ),
    false,
  );
}
assert.equal(plan.probes.length, D72_CANARY_PROBE_EXPECTATIONS.length);
assert.throws(
  () =>
    createD72CanaryPlan({
      ...deploymentPlanOptions,
      candidateVersionId: canaryVersionId,
    }),
  /debe derivar/,
);
const differentCertification = structuredClone(versionCertification);
differentCertification.candidateVersionId = differentVersionId;
assert.match(
  validateD72CanaryPlan(plan, {
    ...deploymentPlanOptions,
    versionCertification: differentCertification,
  }).join("\n"),
  /opaca|recertificada|contentSha256|candidateVersionId/,
);

for (const [operation, expected] of [
  [[wrangler, "deploy", "--config", "/tmp/config"], /prohibido|allowlist/],
  [[wrangler, "triggers", "deploy"], /prohibido|allowlist/],
  [[wrangler, "routes", "list"], /prohibido|allowlist/],
  [[wrangler, "domains", "list"], /prohibido|allowlist/],
  [[wrangler, "secret", "put"], /prohibido|allowlist/],
  [[wrangler, "dns", "list"], /prohibido|allowlist/],
]) {
  assert.match(
    validateD72CanaryCommandStep({
      id: "malicious",
      command: nodeExecutable,
      arguments: operation,
      shell: false,
    }).join("\n"),
    expected,
  );
}
const onePercent = structuredClone(plan);
onePercent.attach.arguments[4] = `${canaryVersionId}@1%`;
assert.match(
  validateD72CanaryPlan(onePercent, deploymentPlanOptions).join("\n"),
  /attach.*exacto/i,
);
const closedBelowHundred = structuredClone(plan);
closedBelowHundred.attach.arguments[3] = `${closedVersionId}@99%`;
assert.match(
  validateD72CanaryPlan(closedBelowHundred, deploymentPlanOptions).join("\n"),
  /attach.*exacto/i,
);
const triggerMutation = structuredClone(plan);
triggerMutation.attach.arguments = [wrangler, "triggers", "deploy"];
assert.match(
  validateD72CanaryPlan(triggerMutation, deploymentPlanOptions).join("\n"),
  /prohibido|allowlist/,
);
const uploadSecretMutation = structuredClone(uploadPlan);
uploadSecretMutation.upload.arguments.push("--secrets-file", "/tmp/secrets");
assert.match(
  validateD72CanaryVersionUploadPlan(uploadSecretMutation, uploadOptions).join(
    "\n",
  ),
  /secrets-file|sella|coincide/,
);

for (const url of [
  "https://agorbis.com/",
  "https://www.agorbis.com/smoke-path?check=1",
]) {
  const headers = d72CanaryVersionOverrideHeaders(url, canaryVersionId);
  assert.deepEqual(headers, {
    [D72_CANARY_VERSION_OVERRIDE_HEADER]: `agorbis="${canaryVersionId}"`,
  });
  assert.deepEqual(
    validateD72CanaryVersionOverrideScope({
      url,
      headers,
      canaryVersionId,
      required: true,
    }),
    [],
  );
}
for (const thirdParty of [
  "https://ibtvlvpxwourrxwcrfkf.supabase.co/auth/v1/signup",
  "https://challenges.cloudflare.com/turnstile/v0/siteverify",
]) {
  assert.throws(
    () => d72CanaryVersionOverrideHeaders(thirdParty, canaryVersionId),
    /override|HTTPS/,
  );
  const scoped = d72CanaryScopedBrowserHeaders({
    url: thirdParty,
    headers: {
      Authorization: "Bearer browser-session-fixture",
      [D72_CANARY_VERSION_OVERRIDE_HEADER]: `agorbis="${canaryVersionId}"`,
      "X-Agorbis-D72-Canary": canaryCapability,
    },
    canaryVersionId,
    canaryCapability,
  });
  assert.deepEqual(scoped, { Authorization: "Bearer browser-session-fixture" });
}

const uploadAuthorization = d72CanaryAuthorizationEvidenceFromToken(
  uploadAuthorizationToken,
);
const zeroPercentAuthorization = d72CanaryAuthorizationEvidenceFromToken(
  zeroPercentAuthorizationToken,
);
const statefulPhrase = d72CanaryStatefulAuthorizationPhrase({
  head,
  canaryId,
  statefulManifestHash,
});
const statefulAuthorization = createD72CanaryAuthorizationEvidence({
  kind: "stateful",
  statement: statefulPhrase,
  source: "/dev/tty",
  confirmedAtUtc: "2026-08-31T12:02:00.000Z",
  head,
  canaryId,
  statefulManifestHash,
});
assert.throws(
  () =>
    createD72CanaryAuthorizationEvidence({
      kind: "infrastructure",
      statement: zeroPercentPhrase,
      source: "/dev/tty",
      confirmedAtUtc: "2026-08-31T11:56:00.000Z",
      head,
      requestHash,
      artifactHash,
    }),
  /kind/,
);

const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const probes = D72_CANARY_PROBE_EXPECTATIONS.map(({ id, expectedStatus }) => ({
  id,
  status: "PASS",
  httpStatus: expectedStatus,
  requestId,
}));
const statefulChecks = D72_CANARY_STATEFUL_CHECK_IDS.map((id) => ({
  id,
  status: "PASS",
  requestId: null,
}));
const cleanup = {
  deploymentDetached: true,
  activeVersionId: closedVersionId,
  activeVersionPercentage: 100,
  canaryVersionInActiveDeployment: false,
  cronCount: 0,
  ephemeralStorageRemoved: true,
  browserStateDestroyed: true,
  mailboxArtifactsRemoved: true,
  testSessionsRevoked: true,
  canaryAccountDisposition: "deleted",
};
const receipt = createD72CanaryReceipt({
  head,
  requestHash,
  policyHash,
  artifactHash,
  canaryId,
  statefulManifestHash,
  issuedAtUtc: "2026-08-31T11:50:00.000Z",
  expiresAtUtc: "2026-08-31T12:30:00.000Z",
  completedAtUtc: "2026-08-31T12:15:00.000Z",
  closedVersionId,
  canaryVersionId,
  canaryCapabilityBindingHash: capabilityBindingHash,
  canaryCapabilityExpiresAtUtc,
  versionCertification,
  versionUploadAuthorization: uploadAuthorization,
  zeroPercentDeploymentAuthorization: zeroPercentAuthorization,
  statefulAuthorization,
  probes,
  statefulChecks,
  cleanup,
});
const receiptExpectations = {
  expectedHead: head,
  expectedRequestHash: requestHash,
  expectedPolicyHash: policyHash,
  expectedArtifactHash: artifactHash,
  expectedCanaryId: canaryId,
  expectedStatefulManifestHash: statefulManifestHash,
  expectedVersionCertification: versionCertification,
  now: new Date("2026-08-31T12:19:59.999Z"),
};
assert.deepEqual(validateD72CanaryReceipt(receipt, receiptExpectations), []);
assert.equal(receipt.contentSha256, d72CanaryReceiptContentHash(receipt));
assert.equal(receipt.productionOpenDeploymentAuthorized, false);
assert.equal(receipt.productionOpenDeploymentExecuted, false);
assert.equal(receipt.canaryTrafficPercentage, 0);
assert.equal(JSON.stringify(receipt).includes(uploadPhrase), false);
assert.equal(JSON.stringify(receipt).includes(zeroPercentPhrase), false);
assert.equal(JSON.stringify(receipt).includes(statefulPhrase), false);
assert.equal(JSON.stringify(receipt).includes(canaryCapability), false);
assert.equal(JSON.stringify(receipt).includes(existingSecret), false);

const executorChildCalls = [];
let executorArtifactValidationCount = 0;
let executorWranglerValidationCount = 0;
let executorRemoteState = "closed";
let executorNow = "2026-08-31T11:55:00.000Z";
const executorSecretBuffer = Buffer.from(existingSecret, "utf8");
const executorSecretQueue = [executorSecretBuffer];
let executorProofEtag = "8".repeat(64);
let executorProofAssetsVerified = false;
let executorGuardAttack = false;
let executorGuardUnexpectedUpstreamCalls = 0;
let executorGuardRejectedBody = "";
assert.throws(
  () =>
    createD72CanaryRunner({
      testOnly: true,
      ttyLineReaderImpl: () => "fixture",
    }),
  /child fixture|child real/,
);
assert.throws(
  () => createD72CanaryRunner({ testOnly: "true" }),
  /testOnly inválidos/,
);
assert.throws(
  () => createD72CanaryRunner({ unexpected: true }),
  /campos o testOnly inválidos/,
);
assert.throws(
  () =>
    createD72CanaryRunner({
      getClosedStateImpl: async () => closedStateSnapshot(),
      getVersionImpl: async () => ({ body: {}, endpoint: "", status: 200 }),
    }),
  /no permite sustituir|executor real/,
);
assert.throws(
  () =>
    createD72CanaryRunner({
      cronSecretReaderImpl: () => Buffer.from(existingSecret),
    }),
  /no permite sustituir.*CRON_SECRET/,
);
assert.throws(
  () => createD72CanaryRunner({ nowImpl: () => new Date(executorNow) }),
  /no permite sustituir|executor real/,
);
assert.throws(
  () => createD72CanaryRunner({ environment: {} }),
  /no permite sustituir|executor real/,
);
assert.throws(
  () =>
    createD72CanaryRunner({
      createUploadApiGuardImpl: async () => ({
        apiBaseUrl: "http://127.0.0.1:1/fixture",
        close: async () => ({}),
      }),
    }),
  /no permite sustituir|API guard|executor real/,
);
const productionBlockedRunner = createD72CanaryRunner();
assert.throws(
  () =>
    productionBlockedRunner.readAuthorization({
      kind: "version-upload",
      bindings: uploadAuthorizationBindings,
      confirmedAtUtc: "2026-08-31T11:51:00.000Z",
    }),
  /reloj interno/,
);
await assert.rejects(
  productionBlockedRunner.uploadVersion(),
  /Stage upload admite exclusivamente/,
);
await assert.rejects(
  productionBlockedRunner.uploadVersion({
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    artifactManifest,
    authorizationToken: uploadAuthorizationToken,
  }),
  /productivo exige identity\/evidencia productivas|plan fixture/,
);
const executor = createD72CanaryRunner({
  testOnly: true,
  nowImpl: () => new Date(executorNow),
  ttyLineReaderImpl: () => "fixture-reader-not-used",
  validateArtifactImpl: () => {
    executorArtifactValidationCount += 1;
    return [];
  },
  verifyWranglerImpl: () => {
    executorWranglerValidationCount += 1;
    return Object.freeze({ version: D72_CANARY_WRANGLER_VERSION });
  },
  cronSecretReaderImpl: () => executorSecretQueue.shift(),
  prepareExpectedUploadManifestImpl: ({ uploadPlan: preparedPlan }) => ({
    expectedArtifactHash: preparedPlan.artifactHash,
    uploadPayloadHash,
  }),
  verifyRemoteArtifactImpl: () => ({
    proofHash: "4".repeat(64),
    remoteScriptEtag: executorProofEtag,
    staticAssetsBlocker: executorProofAssetsVerified
      ? null
      : "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE",
    staticAssetsVerified: executorProofAssetsVerified,
    uploadPayloadHash,
  }),
  getClosedStateImpl: async () =>
    executorRemoteState === "attached"
      ? attachedAtZeroStateSnapshot()
      : closedStateSnapshot(),
  getVersionImpl: async () => ({
    stable: {
      body: candidateVersionResponse(),
      endpoint: getSet.version.endpoint,
      status: 200,
    },
    beta: {
      body: standardEnvelope({}),
      endpoint: `/accounts/4d78fb10c1ae65281ec851479d5045dc/workers/workers/agorbis/versions/${canaryVersionId}?include=modules`,
      method: "GET",
      status: 200,
    },
  }),
  createUploadApiGuardImpl: () =>
    createD72CanaryUploadApiGuard({
      testOnly: true,
      fetchImpl: async () => {
        executorGuardUnexpectedUpstreamCalls += 1;
        return new Response("{}", {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    }),
  execFileImpl: async (command, arguments_, options) => {
    executorChildCalls.push({ command, arguments_: [...arguments_], options });
    if (arguments_.includes("--dry-run")) {
      // The manifest builder is an explicit testOnly fixture above.
    } else if (arguments_[1] === "versions" && arguments_[2] === "upload") {
      if (executorGuardAttack) {
        const response = await fetch(
          `${options.env.CLOUDFLARE_API_BASE_URL}${guardAccountRoot}/scripts/agorbis/script-settings`,
          {
            body: JSON.stringify({ tags: [uploadGuardJwt] }),
            headers: { Authorization: `Bearer ${uploadGuardSecret}` },
            method: "PATCH",
          },
        );
        executorGuardRejectedBody = await response.text();
      }
      writeFileSync(options.env.WRANGLER_OUTPUT_FILE_PATH, uploadOutputSource, {
        mode: 0o600,
      });
    } else if (
      arguments_[1] === "versions" &&
      arguments_[2] === "deploy" &&
      arguments_.some((argument) => argument === `${canaryVersionId}@0%`)
    ) {
      executorRemoteState = "attached";
    } else if (arguments_[1] === "versions" && arguments_[2] === "deploy") {
      executorRemoteState = "closed";
    }
    return { stderr: "", stdout: "" };
  },
});
assert.equal(executor.mode, "plan-only");
assert.equal(executor.remoteMutationDefault, false);
await assert.rejects(
  executor.uploadVersion({
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    artifactManifest,
    authorizationToken: uploadAuthorizationToken,
    capabilityGrant: {},
  }),
  /nunca capability ni secret/,
);
const mismatchedClosedAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "version-upload",
  bindings: uploadAuthorizationBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => uploadPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T11:51:00.000Z",
});
executorRemoteState = "attached";
const actualUploadsBeforeClosedMismatch = executorChildCalls.filter(
  ({ arguments_ }) =>
    arguments_[1] === "versions" &&
    arguments_[2] === "upload" &&
    !arguments_.includes("--dry-run"),
).length;
await assert.rejects(
  executor.uploadVersion({
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    artifactManifest,
    authorizationToken: mismatchedClosedAuthorizationToken,
  }),
  /CLOSED|deployment|Version|100%/i,
);
assert.equal(
  executorChildCalls.filter(
    ({ arguments_ }) =>
      arguments_[1] === "versions" &&
      arguments_[2] === "upload" &&
      !arguments_.includes("--dry-run"),
  ).length,
  actualUploadsBeforeClosedMismatch,
);
executorRemoteState = "closed";
const blockedMutationAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "version-upload",
  bindings: uploadAuthorizationBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => uploadPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T11:51:00.000Z",
});
executorGuardAttack = true;
await assert.rejects(
  executor.uploadVersion({
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    artifactManifest,
    authorizationToken: blockedMutationAuthorizationToken,
  }),
  /mutación fuera del API guard|POST único de Version/,
);
executorGuardAttack = false;
assert.equal(executorGuardUnexpectedUpstreamCalls, 0);
assert.equal(executorGuardRejectedBody.includes(uploadGuardSecret), false);
assert.equal(executorGuardRejectedBody.includes(uploadGuardJwt), false);
const executorUploadReceipt = await executor.uploadVersion({
  uploadPlan,
  uploadPlanOptions: uploadOptions,
  artifactManifest,
  authorizationToken: uploadAuthorizationToken,
});
await assert.rejects(
  executor.issueCapability({
    versionCertification,
    expiresAtUtc: canaryCapabilityExpiresAtUtc,
    testOnlyNonce: canaryCapabilityNonce,
  }),
  /falta certificación GET opaca/,
);
assert.equal(executorSecretQueue.length, 1);
await assert.rejects(
  executor.certifyVersion({
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    uploadReceipt: executorUploadReceipt,
    artifactManifest,
  }),
  /Hashed script content exactos/,
);
executorProofEtag = "9".repeat(64);
const executorAssetsBlockedCertification = await executor.certifyVersion({
  uploadPlan,
  uploadPlanOptions: uploadOptions,
  uploadReceipt: executorUploadReceipt,
  artifactManifest,
});
assert.deepEqual(
  executor.inspectCapabilityReadiness(executorAssetsBlockedCertification),
  {
    status: "BLOCKED",
    ready: false,
    staticAssetsVerified: false,
    blocker: "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE",
    remoteArtifactProofHash: "4".repeat(64),
  },
);
executorNow = canaryCapabilityIssuedAtUtc;
await assert.rejects(
  executor.issueCapability({
    versionCertification: executorAssetsBlockedCertification,
    expiresAtUtc: canaryCapabilityExpiresAtUtc,
    testOnlyNonce: canaryCapabilityNonce,
  }),
  /BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE/,
);
assert.equal(executorSecretQueue.length, 1);
executorProofAssetsVerified = true;
const executorVersionCertification = await executor.certifyVersion({
  uploadPlan,
  uploadPlanOptions: uploadOptions,
  uploadReceipt: executorUploadReceipt,
  artifactManifest,
});
assert.deepEqual(
  executor.inspectCapabilityReadiness(executorVersionCertification),
  {
    status: "READY",
    ready: true,
    staticAssetsVerified: true,
    blocker: null,
    remoteArtifactProofHash: "4".repeat(64),
  },
);
await assert.rejects(
  executor.issueCapability({
    versionCertification: executorVersionCertification,
    expiresAtUtc: canaryCapabilityExpiresAtUtc,
    nonce: canaryCapabilityNonce,
  }),
  /testOnlyNonce|opciones|fixture capability/,
);
assert.equal(executorSecretQueue.length, 1);
const executorCapabilityGrant = await executor.issueCapability({
  versionCertification: executorVersionCertification,
  expiresAtUtc: canaryCapabilityExpiresAtUtc,
  testOnlyNonce: canaryCapabilityNonce,
});
assert.equal(
  executorSecretBuffer.every((byte) => byte === 0),
  true,
);
const executorErrorSecretBuffer = Buffer.from(existingSecret, "utf8");
executorSecretQueue.push(executorErrorSecretBuffer);
await assert.rejects(
  executor.issueCapability({
    versionCertification: executorVersionCertification,
    expiresAtUtc: canaryCapabilityExpiresAtUtc,
    testOnlyNonce: "not-a-valid-nonce",
  }),
  /nonce/,
);
assert.equal(
  executorErrorSecretBuffer.every((byte) => byte === 0),
  true,
);
const executorControlSecretBuffer = Buffer.from(existingSecret, "utf8");
executorControlSecretBuffer[5] = 0x0d;
executorSecretQueue.push(executorControlSecretBuffer);
await assert.rejects(
  executor.issueCapability({
    versionCertification: executorVersionCertification,
    expiresAtUtc: canaryCapabilityExpiresAtUtc,
    testOnlyNonce: "f".repeat(64),
  }),
  /Buffer CRON_SECRET válido/,
);
assert.equal(
  executorControlSecretBuffer.every((byte) => byte === 0),
  true,
);
const executorZeroBindings = {
  head,
  requestHash,
  policyHash,
  artifactHash,
  accountId: "4d78fb10c1ae65281ec851479d5045dc",
  workerName: "agorbis",
  closedDeploymentId,
  closedVersionId,
  candidateVersionId: canaryVersionId,
  versionCertificationHash: d72CanaryVersionCertificationHash(
    executorVersionCertification,
  ),
};
const executorZeroPhrase =
  d72CanaryInfrastructureAuthorizationPhrase(executorZeroBindings);
const executorZeroPercentAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "zero-percent-deployment",
  bindings: executorZeroBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => executorZeroPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: canaryCapabilityIssuedAtUtc,
});
const executorDeploymentOptions = {
  ...basePlanOptions,
  versionCertification: executorVersionCertification,
  zeroPercentDeploymentAuthorizationToken:
    executorZeroPercentAuthorizationToken,
  canaryCapabilityGrant: executorCapabilityGrant,
  now: capabilityNow,
};
const executorDeploymentPlan = createD72CanaryPlan(executorDeploymentOptions);
assert.throws(
  () =>
    createD72CanaryPlan({
      ...executorDeploymentOptions,
      canaryCapabilityGrant: structuredClone(executorCapabilityGrant),
    }),
  /grant HMAC opaco/,
);
executorNow = canaryCapabilityIssuedAtUtc;
await assert.rejects(
  executor.attachAtZero({
    plan: executorDeploymentPlan,
    planOptions: executorDeploymentOptions,
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    artifactManifest,
    capabilityGrant: structuredClone(executorCapabilityGrant),
    authorizationToken: executorZeroPercentAuthorizationToken,
  }),
  /grant HMAC opaco/,
);
const executorCanarySession = await executor.attachAtZero({
  plan: executorDeploymentPlan,
  planOptions: executorDeploymentOptions,
  uploadPlan,
  uploadPlanOptions: uploadOptions,
  artifactManifest,
  capabilityGrant: executorCapabilityGrant,
  authorizationToken: executorZeroPercentAuthorizationToken,
});
assert.equal(executorCanarySession.attachedAtZero, true);
assert.equal(executorRemoteState, "attached");
assert.equal(executorChildCalls.length, 6);
await executor.assertCanarySessionStillAttached(executorCanarySession);
await assert.rejects(
  executor.assertCanarySessionStillAttached(
    structuredClone(executorCanarySession),
  ),
  /sesión canaria no está activa|opaca/,
);
const executorCleanup = await executor.cleanupCanarySession(
  executorCanarySession,
);
assert.equal(executorCleanup.cleanupVerified, true);
assert.equal(executorRemoteState, "closed");
const replayZeroPercentAuthorizationToken = readD72CanaryAuthorizationToken({
  kind: "zero-percent-deployment",
  bindings: executorZeroBindings,
  ttyReader: createD72CanaryDevTtyReader({
    readLineImpl: () => executorZeroPhrase,
    testOnly: true,
  }),
  confirmedAtUtc: "2026-08-31T12:00:01.000Z",
});
const replayDeploymentOptions = {
  ...executorDeploymentOptions,
  zeroPercentDeploymentAuthorizationToken: replayZeroPercentAuthorizationToken,
};
const replayDeploymentPlan = createD72CanaryPlan(replayDeploymentOptions);
const mutationCallsBeforeGrantReplay = executorChildCalls.length;
await assert.rejects(
  executor.attachAtZero({
    plan: replayDeploymentPlan,
    planOptions: replayDeploymentOptions,
    uploadPlan,
    uploadPlanOptions: uploadOptions,
    artifactManifest,
    capabilityGrant: executorCapabilityGrant,
    authorizationToken: replayZeroPercentAuthorizationToken,
  }),
  /grant HMAC opaco, vigente y no consumido/,
);
assert.equal(executorChildCalls.length, mutationCallsBeforeGrantReplay);
await assert.rejects(
  executor.cleanupCanarySession(executorCanarySession),
  /sesión canaria opaca activa/,
);
assert.equal(executorArtifactValidationCount, 25);
assert.equal(executorWranglerValidationCount, 5);
assert.deepEqual(
  executorChildCalls.map(
    ({ arguments_ }) =>
      `${arguments_.slice(1, 3).join(" ")}${arguments_.includes("--dry-run") ? " --dry-run" : ""}`,
  ),
  [
    "versions upload --dry-run",
    "versions upload --dry-run",
    "versions upload",
    "versions upload --dry-run",
    "versions upload",
    "versions deploy",
    "versions deploy",
  ],
);
const guardedUploadChild = executorChildCalls.find(
  ({ arguments_ }) =>
    arguments_[1] === "versions" &&
    arguments_[2] === "upload" &&
    !arguments_.includes("--dry-run"),
);
assert.match(
  guardedUploadChild.options.env.CLOUDFLARE_API_BASE_URL,
  /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}$/,
);
assert.equal(
  executorChildCalls
    .filter(({ arguments_ }) => arguments_.includes("--dry-run"))
    .every(({ options }) => options.env.CLOUDFLARE_API_BASE_URL === undefined),
  true,
);
assert.equal(
  executorChildCalls.every(({ options }) => options.shell === false),
  true,
);

for (const [mutate, expected] of [
  [(value) => (value.head = "f".repeat(40)), /head no coincide/],
  [(value) => (value.canaryTrafficPercentage = 1), /0% canary/],
  [(value) => (value.cleanup.cronCount = 5), /cleanup/],
  [(value) => (value.cleanup.deploymentDetached = false), /cleanup/],
  [(value) => (value.probes[0].status = "FAIL"), /PASS/],
  [
    (value) =>
      (value.zeroPercentDeploymentAuthorization = {
        ...value.versionUploadAuthorization,
      }),
    /zero-percent-deployment/,
  ],
  [
    (value) => (value.versionCertifiedAtUtc = "2026-08-31T11:49:00.000Z"),
    /orden/,
  ],
  [(value) => (value.email = "canary@example.invalid"), /no aprobados/],
]) {
  const changed = structuredClone(receipt);
  mutate(changed);
  changed.contentSha256 = d72CanaryReceiptContentHash(changed);
  assert.match(
    validateD72CanaryReceipt(changed, receiptExpectations).join("\n"),
    expected,
  );
}

console.log(
  "D72 canary policy: candidate identity -> upload-only -> GET certification -> capability -> 100/0 verificados con fakes.",
);
