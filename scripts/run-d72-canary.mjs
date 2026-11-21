#!/usr/bin/env node

import { promisify } from "node:util";
import { execFile as execFileCallback, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertD72CanaryVersionUploadPlanAuthority,
  assertD72OpenRecoveryVersionGet,
  consumeD72CanaryAuthorizationToken,
  createD72CanaryCapabilityGrant,
  createD72CanaryDevTtyReader,
  createD72CanaryProductionDevTtyReader,
  createD72CanaryVersionCertification,
  parseD72CanaryVersionGetAttestation,
  parseD72CanaryVersionUploadReceipt,
  validateD72CanaryPlan,
  validateD72CanaryVersionUploadPlan,
  D72_CANARY_ACCOUNT_ID,
  D72_CANARY_NODE_VERSION,
  D72_CANARY_WORKER_NAME,
  d72CanarySourceBindings,
  d72CanaryUploadArtifactBindings,
  readD72CanaryAuthorizationToken,
} from "./d72-canary-policy.mjs";
import { validateExceptionalReleaseArtifact } from "./exceptional-release-artifact.mjs";
import { verifyExceptionalWranglerIntegrity } from "./exceptional-wrangler-integrity.mjs";
import {
  collectCloudflareClosedState,
  loadWranglerOAuthToken,
  validateCloudflareClosedState,
} from "./cloudflare-closed-state.mjs";
import { RELEASE_GATE_POLICY_VERSION } from "./release-gate-policy.mjs";
import { assertOpenReleaseBaselineMatches } from "./open-release-baseline-policy.mjs";
import {
  assertExceptionalOpenRecoveryFiles,
  assertExceptionalOpenRecoveredState,
  EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION,
  exceptionalOpenRecoveryEvidenceHash,
} from "./exceptional-open-recovery-capsule.mjs";
import { createExceptionalOpenRecoveryPlan } from "./exceptional-release-cutover-policy.mjs";
import { assertD72OpenCanaryConsentCleanupEvidence } from "./d72-open-update-evidence-policy.mjs";
import {
  assertD72RemoteArtifactProof,
  createD72AssetUploadFetchObserver,
  createD72ExpectedUploadManifest,
  verifyD72RemoteVersionArtifact,
} from "./d72-canary-remote-artifact-policy.mjs";

const execFileAsync = promisify(execFileCallback);
const cloudflareFetch = globalThis.fetch.bind(globalThis);
const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com/client/v4";
const MAX_OUTPUT_BYTES = 64 * 1_024;
const MAX_API_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const MAX_BETA_VERSION_RESPONSE_BYTES = 64 * 1_024 * 1_024;
const MAX_UPLOAD_GUARD_REQUEST_BYTES = 128 * 1_024 * 1_024;
const MAX_UPLOAD_GUARD_RESPONSE_BYTES = 64 * 1_024 * 1_024;
const MAX_CRON_SECRET_BYTES = 4 * 1_024;
const STTY_EXECUTABLE = "/usr/bin/stty";
const DEFAULT_NOW_IMPL = () => new Date();
const ISSUED_OPEN_CANARY_CLEANUPS = new WeakMap();
const ISSUED_OPEN_CANARY_EMERGENCY_RECOVERIES = new WeakMap();
const ISSUED_CANARY_BROWSER_SESSIONS = new WeakMap();
const ISSUED_RECOVERY_UPLOAD_EVIDENCE = new WeakMap();
const OPAQUE_PLAN_OPTION_NAMES = new Set([
  "candidateIdentity",
  "nonStatefulCertification",
  "versionCertification",
  "versionUploadAuthorizationToken",
  "zeroPercentDeploymentAuthorizationToken",
  "canaryCapabilityGrant",
]);

function immutableCopy(value) {
  const copy = structuredClone(value);
  function freeze(item) {
    if (item && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  }
  return freeze(copy);
}

function snapshotPlanOptions(options) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(options).map(([name, value]) => [
        name,
        OPAQUE_PLAN_OPTION_NAMES.has(name) ? value : immutableCopy(value),
      ]),
    ),
  );
}
const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
const WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_EXCL |
  (fsConstants.O_CLOEXEC ?? 0) |
  fsConstants.O_NOFOLLOW;
const SAFE_ENVIRONMENT_NAMES = Object.freeze([
  "DBUS_SESSION_BUS_ADDRESS",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "TMPDIR",
  "USER",
  "XDG_CONFIG_HOME",
  "XDG_RUNTIME_DIR",
]);
const UPLOAD_GUARD_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const UPLOAD_GUARD_RESPONSE_HEADERS = new Set([
  "cache-control",
  "cf-ray",
  "content-type",
  "etag",
  "retry-after",
]);

function readHiddenCronSecretBuffer() {
  const flags =
    fsConstants.O_RDWR | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
  const descriptor = openSync("/dev/tty", flags);
  const bytes = Buffer.alloc(MAX_CRON_SECRET_BYTES);
  let length = 0;
  let echoDisabled = false;
  let echoRestoreFailed = false;
  try {
    const ttyStats = fstatSync(descriptor);
    if (!ttyStats.isCharacterDevice()) {
      throw new Error("/dev/tty no es un dispositivo de carácter.");
    }
    execFileSync(STTY_EXECUTABLE, ["-F", "/dev/tty", "-echo"], {
      env: childEnvironment(process.env),
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    echoDisabled = true;
    writeSync(
      descriptor,
      Buffer.from("CRON_SECRET para capability D72 (entrada oculta): ", "utf8"),
    );
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, 1, null);
      if (count === 0 || bytes[length] === 0x0a) break;
      if (bytes[length] === 0x00 || bytes[length] === 0x0d) {
        throw new Error(
          "CRON_SECRET contiene un byte de control no permitido.",
        );
      }
      length += 1;
    }
    writeSync(descriptor, Buffer.from("\n", "utf8"));
    if (length === bytes.length || length < 32) {
      throw new Error("CRON_SECRET no cumple el tamaño D72 aprobado.");
    }
    return bytes.subarray(0, length);
  } catch {
    bytes.fill(0);
    throw new Error(
      "No se pudo leer CRON_SECRET de forma oculta por /dev/tty.",
    );
  } finally {
    if (echoDisabled) {
      try {
        execFileSync(STTY_EXECUTABLE, ["-F", "/dev/tty", "echo"], {
          env: childEnvironment(process.env),
          shell: false,
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        bytes.fill(0);
        echoRestoreFailed = true;
      }
    }
    try {
      closeSync(descriptor);
    } catch {
      bytes.fill(0);
      throw new Error("No se pudo cerrar /dev/tty; CRON_SECRET fue borrado.");
    }
    if (echoRestoreFailed) {
      throw new Error(
        "No se pudo restaurar echo en /dev/tty; CRON_SECRET fue borrado.",
      );
    }
  }
}

function childEnvironment(source, outputPath, apiBaseUrl) {
  const environment = {};
  for (const name of SAFE_ENVIRONMENT_NAMES) {
    const value = source?.[name];
    if (typeof value === "string" && value.length > 0)
      environment[name] = value;
  }
  const hardened = {
    ...environment,
    CI: "true",
    CLOUDFLARE_ACCOUNT_ID: D72_CANARY_ACCOUNT_ID,
    CLOUDFLARE_AUTH_USE_KEYRING: "true",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    DO_NOT_TRACK: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    WRANGLER_LOG: "none",
    WRANGLER_LOG_SANITIZE: "true",
    WRANGLER_NO_SKILLS_UPDATE_PROMPTS: "true",
    WRANGLER_SEND_ERROR_REPORTS: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };
  if (outputPath !== undefined) {
    if (typeof outputPath !== "string" || !path.isAbsolute(outputPath)) {
      throw new Error("WRANGLER_OUTPUT_FILE_PATH debe ser absoluto.");
    }
    hardened.WRANGLER_OUTPUT_FILE_PATH = outputPath;
  }
  if (apiBaseUrl !== undefined) {
    if (
      typeof apiBaseUrl !== "string" ||
      !/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}$/.test(apiBaseUrl)
    ) {
      throw new Error("CLOUDFLARE_API_BASE_URL guard no es loopback sellado.");
    }
    hardened.CLOUDFLARE_API_BASE_URL = apiBaseUrl;
  }
  return Object.freeze(hardened);
}

function classifyD72UploadGuardPost(pathname, search) {
  const accountRoot = `/accounts/${D72_CANARY_ACCOUNT_ID}/workers`;
  if (
    pathname ===
      `${accountRoot}/scripts/${D72_CANARY_WORKER_NAME}/assets-upload-session` &&
    search === ""
  ) {
    return "asset-session";
  }
  if (
    pathname === `${accountRoot}/assets/upload` &&
    search === "?base64=true"
  ) {
    return "asset-bulk";
  }
  if (
    new RegExp(`^${accountRoot}/assets/upload/[0-9a-f]{32}$`).test(pathname) &&
    search === ""
  ) {
    return "asset-single";
  }
  if (
    pathname === `${accountRoot}/scripts/${D72_CANARY_WORKER_NAME}/versions` &&
    search === "?bindings_inherit=strict"
  ) {
    return "version";
  }
  return null;
}

function d72UploadGuardRequestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    const normalizedName = name.toLowerCase();
    if (
      value === undefined ||
      normalizedName === "host" ||
      normalizedName === "accept-encoding" ||
      UPLOAD_GUARD_HOP_BY_HOP_HEADERS.has(normalizedName)
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  // Undici transparently decodes compressed responses. Request identity and
  // omit upstream Content-Length on relay so the child never receives a
  // compressed byte count for a decoded body.
  headers.set("accept-encoding", "identity");
  return headers;
}

async function* d72UploadGuardRequestBody(request) {
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_UPLOAD_GUARD_REQUEST_BYTES) {
      throw new Error("request-size-limit");
    }
    yield bytes;
  }
}

async function relayD72UploadGuardResponse(upstream, response) {
  if (!(upstream instanceof Response) || upstream.body === null) {
    throw new Error("invalid-upstream-response");
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    throw new Error("upstream-redirect-rejected");
  }
  const declaredLength = upstream.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_UPLOAD_GUARD_RESPONSE_BYTES)
  ) {
    throw new Error("response-size-limit");
  }
  const responseHeaders = {};
  for (const [name, value] of upstream.headers) {
    if (UPLOAD_GUARD_RESPONSE_HEADERS.has(name.toLowerCase())) {
      responseHeaders[name] = value;
    }
  }
  response.writeHead(upstream.status, responseHeaders);
  const reader = upstream.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error("invalid-upstream-chunk");
      }
      total += value.byteLength;
      if (total > MAX_UPLOAD_GUARD_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size violation is already fatal and remains sanitized.
        }
        throw new Error("response-size-limit");
      }
      if (!response.write(Buffer.from(value))) await once(response, "drain");
    }
    response.end();
  } finally {
    reader.releaseLock();
  }
}

/**
 * Starts a process-local Cloudflare API guard for the one pinned Wrangler
 * `versions upload` child. The random path is never returned in evidence and
 * The proxy emits only counters and hashes. The upload observer compares
 * bounded bodies and JWTs in memory, then discards them; it never logs them.
 */
export async function createD72CanaryUploadApiGuard({
  fetchImpl = cloudflareFetch,
  testOnly = false,
  expectedUploadManifest,
  ...unknownOptions
} = {}) {
  if (
    typeof testOnly !== "boolean" ||
    typeof fetchImpl !== "function" ||
    Object.keys(unknownOptions).length !== 0 ||
    (!testOnly && fetchImpl !== cloudflareFetch) ||
    (testOnly && fetchImpl === cloudflareFetch)
  ) {
    throw new Error(
      "El API guard D72 no admite transport ni opciones abiertas.",
    );
  }
  if (!testOnly && !expectedUploadManifest)
    throw new Error("El guard productivo exige el manifest de upload sellado.");
  const assetObserver = expectedUploadManifest
    ? createD72AssetUploadFetchObserver({
        expectedUploadManifest,
        ...(testOnly ? { testOnly: true, fetchImpl } : {}),
      })
    : null;
  const guardPath = `/${randomBytes(32).toString("hex")}`;
  const counters = {
    assetBulkPosts: 0,
    assetSessionPosts: 0,
    assetSinglePosts: 0,
    blockedMutationAttempts: 0,
    forwardedGets: 0,
    versionPosts: 0,
  };
  const inFlight = new Set();
  let closed = false;

  const server = createServer(
    {
      headersTimeout: 5_000,
      keepAliveTimeout: 1_000,
      maxHeaderSize: 16 * 1_024,
      requestTimeout: 30_000,
    },
    (request, response) => {
      const operation = (async () => {
        try {
          if (
            request.socket.remoteAddress !== "127.0.0.1" ||
            typeof request.url !== "string" ||
            request.url.length > 16 * 1_024
          ) {
            response.writeHead(403, { "content-type": "text/plain" });
            response.end("D72 API guard rejected request.\n");
            return;
          }
          const incoming = new URL(request.url, "http://127.0.0.1");
          if (
            !incoming.pathname.startsWith(`${guardPath}/`) ||
            incoming.username !== "" ||
            incoming.password !== ""
          ) {
            response.writeHead(403, { "content-type": "text/plain" });
            response.end("D72 API guard rejected request.\n");
            return;
          }
          const pathname = incoming.pathname.slice(guardPath.length);
          const method = request.method?.toUpperCase() ?? "";
          let routeClass = null;
          if (method === "GET") {
            counters.forwardedGets += 1;
          } else if (method === "POST") {
            routeClass = classifyD72UploadGuardPost(pathname, incoming.search);
            if (routeClass === null) counters.blockedMutationAttempts += 1;
          } else {
            counters.blockedMutationAttempts += 1;
          }
          if (method !== "GET" && routeClass === null) {
            response.writeHead(405, { "content-type": "text/plain" });
            response.end("D72 API guard rejected mutation.\n");
            return;
          }
          if (routeClass === "version" && counters.versionPosts !== 0) {
            counters.blockedMutationAttempts += 1;
            response.writeHead(405, { "content-type": "text/plain" });
            response.end("D72 API guard rejected duplicate Version.\n");
            return;
          }
          const declaredLength = request.headers["content-length"];
          if (
            declaredLength !== undefined &&
            (!/^\d+$/.test(declaredLength) ||
              Number(declaredLength) > MAX_UPLOAD_GUARD_REQUEST_BYTES)
          ) {
            response.writeHead(413, { "content-type": "text/plain" });
            response.end("D72 API guard rejected request size.\n");
            return;
          }
          if (routeClass !== null) {
            counters[
              {
                "asset-bulk": "assetBulkPosts",
                "asset-session": "assetSessionPosts",
                "asset-single": "assetSinglePosts",
                version: "versionPosts",
              }[routeClass]
            ] += 1;
          }
          const upstream = await (assetObserver?.fetch ?? fetchImpl)(
            `${CLOUDFLARE_API_ORIGIN}${pathname}${incoming.search}`,
            {
              body:
                method === "GET"
                  ? undefined
                  : d72UploadGuardRequestBody(request),
              duplex: method === "GET" ? undefined : "half",
              headers: d72UploadGuardRequestHeaders(request),
              method,
              redirect: "manual",
              signal: AbortSignal.timeout(30_000),
            },
          );
          await relayD72UploadGuardResponse(upstream, response);
        } catch {
          if (!response.headersSent) {
            response.writeHead(502, { "content-type": "text/plain" });
          }
          if (!response.writableEnded) {
            response.end("D72 API guard upstream failure.\n");
          }
        }
      })();
      inFlight.add(operation);
      operation.finally(() => inFlight.delete(operation)).catch(() => {});
    },
  );
  server.on("clientError", (_error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ exclusive: true, host: "127.0.0.1", port: 0 }, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch {
    throw new Error("No se pudo iniciar el API guard D72 loopback.");
  }
  const address = server.address();
  if (
    !address ||
    typeof address === "string" ||
    address.address !== "127.0.0.1"
  ) {
    server.closeAllConnections();
    server.close();
    throw new Error("El API guard D72 no quedó ligado a loopback IPv4.");
  }
  server.unref();

  async function close() {
    if (!closed) {
      closed = true;
      server.closeIdleConnections();
      await new Promise((resolve) => server.close(resolve));
      await Promise.allSettled([...inFlight]);
      server.closeAllConnections();
    }
    return Object.freeze({ ...counters });
  }

  return Object.freeze({
    apiBaseUrl: `http://127.0.0.1:${address.port}${guardPath}`,
    close,
    ...(assetObserver
      ? { assetUploadObservation: () => assetObserver.receipt() }
      : {}),
  });
}

function assertD72CanaryUploadApiGuardReport(report, { testOnly }) {
  if (
    !report ||
    Object.keys(report).sort().join(",") !==
      "assetBulkPosts,assetSessionPosts,assetSinglePosts,blockedMutationAttempts,forwardedGets,versionPosts" ||
    !Object.values(report).every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    report.blockedMutationAttempts !== 0 ||
    (!testOnly && report.versionPosts !== 1)
  ) {
    throw new Error(
      "Wrangler intentó una mutación fuera del API guard o no acreditó el POST único de Version.",
    );
  }
}

function readSecureFile(filePath, maxBytes = MAX_OUTPUT_BYTES) {
  let descriptor = null;
  try {
    const before = lstatSync(filePath);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      (before.mode & 0o7777) !== 0o600 ||
      (typeof process.getuid === "function" &&
        before.uid !== process.getuid()) ||
      before.size > maxBytes
    ) {
      throw new Error(
        "El output NDJSON de Wrangler no es un archivo 0600 seguro.",
      );
    }
    descriptor = openSync(filePath, READ_FLAGS);
    const opened = fstatSync(descriptor);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size
    ) {
      throw new Error("El output NDJSON de Wrangler cambió antes de leerse.");
    }
    const buffer = Buffer.alloc(opened.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const count = readSync(
        descriptor,
        buffer,
        total,
        buffer.length - total,
        null,
      );
      if (count === 0) break;
      total += count;
    }
    const after = fstatSync(descriptor);
    if (
      total !== opened.size ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    ) {
      throw new Error(
        "El output NDJSON de Wrangler cambió durante su lectura.",
      );
    }
    return buffer.subarray(0, total);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function readSecureOutput(filePath) {
  return readSecureFile(filePath).toString("utf8");
}

function artifactErrors({
  uploadPlan,
  artifactManifest,
  repositoryRoot,
  validateArtifactImpl,
}) {
  return validateArtifactImpl({
    artifactRoot:
      uploadPlan.upload.arguments[
        uploadPlan.upload.arguments.indexOf("--cwd") + 1
      ],
    worktreeRoot: repositoryRoot,
    manifest: artifactManifest,
    expectedHead: uploadPlan.head,
    expectedPolicyVersion: RELEASE_GATE_POLICY_VERSION,
    expectedPolicyHash: uploadPlan.policyHash,
    expectedRequestHash: uploadPlan.requestHash,
    expectedArtifactHash:
      uploadPlan.uploadArtifactHash ?? uploadPlan.artifactHash,
  });
}

function assertArtifact(label, input) {
  const errors = artifactErrors(input);
  if (errors.length > 0) {
    throw new Error(`${label}:\n${errors.join("\n")}`);
  }
}

function uploadAuthorizationBindings(uploadPlan) {
  return Object.freeze({
    head: uploadPlan.head,
    requestHash: uploadPlan.requestHash,
    policyHash: uploadPlan.policyHash,
    artifactHash: uploadPlan.artifactHash,
    workerName: D72_CANARY_WORKER_NAME,
    ...d72CanarySourceBindings(uploadPlan, { includeDeployment: false }),
    ...d72CanaryUploadArtifactBindings(uploadPlan),
  });
}

function zeroPercentAuthorizationBindings(planOptions) {
  const certification = planOptions.versionCertification;
  return Object.freeze({
    head: planOptions.head,
    requestHash: planOptions.requestHash,
    policyHash: planOptions.policyHash,
    artifactHash: planOptions.artifactHash,
    accountId: D72_CANARY_ACCOUNT_ID,
    workerName: D72_CANARY_WORKER_NAME,
    ...d72CanarySourceBindings(planOptions),
    candidateVersionId: certification.candidateVersionId,
    versionCertificationHash: planOptions.plan.versionCertificationHash,
  });
}

function validateExactClosedSnapshot(
  snapshot,
  { closedDeploymentId, closedVersionId, requireDeploymentId = true },
) {
  const closed = validateCloudflareClosedState(snapshot, {
    phase: "custom-domains",
    secretStage: "complete",
  });
  if (
    closed.activeVersionId !== closedVersionId ||
    (requireDeploymentId && closed.activeDeploymentId !== closedDeploymentId)
  ) {
    throw new Error("El GET actual no conserva CLOSED exacto al 100%.");
  }
  return closed;
}

function validateExactSourceSnapshot(snapshot, source, now) {
  if (source.releaseMode !== "OPEN_UPDATE") {
    return validateExactClosedSnapshot(snapshot, source);
  }
  const observedAtUtc = now.toISOString();
  const matched = assertOpenReleaseBaselineMatches({
    baseline: source.openSourceBaseline,
    expectedBaselineSha256: source.openSourceBaselineSha256,
    snapshot,
    observedAtUtc,
    nowUtc: observedAtUtc,
  });
  if (
    matched.deploymentId !== source.sourceDeploymentId ||
    matched.versionId !== source.sourceVersionId
  ) {
    throw new Error("El GET actual no conserva el origen OPEN exacto al 100%.");
  }
  return Object.freeze({
    activeDeploymentId: matched.deploymentId,
    activeVersionId: matched.versionId,
  });
}

function validateExactAttachedAtZeroSnapshot(
  snapshot,
  {
    closedVersionId,
    sourceVersionId,
    releaseMode,
    openSourceBaseline,
    openSourceBaselineSha256,
    candidateVersionId,
    now,
  } = {},
) {
  const ordinaryVersionId =
    releaseMode === "OPEN_UPDATE" ? sourceVersionId : closedVersionId;
  const active = snapshot?.deployments?.result?.deployments?.[0];
  if (!active || !Array.isArray(active.versions)) {
    throw new Error("El GET post-attach no contiene el deployment activo.");
  }
  const expected = new Map([
    [ordinaryVersionId, 100],
    [candidateVersionId, 0],
  ]);
  if (
    active.versions.length !== 2 ||
    new Set(active.versions.map((entry) => entry?.version_id)).size !== 2 ||
    active.versions.some(
      (entry) =>
        !entry ||
        Object.keys(entry).sort().join(",") !== "percentage,version_id" ||
        !expected.has(entry.version_id) ||
        expected.get(entry.version_id) !== entry.percentage,
    )
  ) {
    throw new Error(
      releaseMode === "OPEN_UPDATE"
        ? "El GET post-attach no acredita origen OPEN=100% y candidate=0% exactos."
        : "El GET post-attach no acredita CLOSED=100% y candidate=0% exactos.",
    );
  }

  // Reuse the hardened CLOSED validator for every invariant unrelated to the
  // deliberate second 0%-traffic Version. The active deployment itself is
  // checked strictly above, then projected to its CLOSED-only equivalent.
  const closedProjection = structuredClone(snapshot);
  closedProjection.deployments.result.deployments[0].versions = [
    { percentage: 100, version_id: ordinaryVersionId },
  ];
  if (releaseMode === "OPEN_UPDATE") {
    // Only the deliberate 100/0 traffic shape and its new deployment id differ.
    // The fixed baseline still validates every setting, cron and script reference.
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        active.id ?? "",
      )
    ) {
      throw new Error("El deployment OPEN post-attach no tiene un id válido.");
    }
    closedProjection.deployments.result.deployments[0].id =
      openSourceBaseline.deploymentId;
    validateExactSourceSnapshot(
      closedProjection,
      {
        releaseMode,
        sourceVersionId,
        sourceDeploymentId: openSourceBaseline.deploymentId,
        openSourceBaseline,
        openSourceBaselineSha256,
      },
      now,
    );
    return Object.freeze({ activeDeploymentId: active.id });
  }
  const closed = validateCloudflareClosedState(closedProjection, {
    phase: "custom-domains",
    secretStage: "complete",
  });
  if (closed.activeVersionId !== closedVersionId) {
    throw new Error("El GET post-attach no conserva la Version CLOSED exacta.");
  }
  return Object.freeze({ activeDeploymentId: active.id });
}

async function defaultCloudflareClosedStateGet() {
  let oauthToken;
  try {
    oauthToken = await loadWranglerOAuthToken();
    return await collectCloudflareClosedState({
      fetchImpl: cloudflareFetch,
      oauthToken,
    });
  } finally {
    oauthToken = undefined;
  }
}

export async function readD72BoundedCloudflareJsonResponse(response, maxBytes) {
  if (
    !(response instanceof Response) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_BETA_VERSION_RESPONSE_BYTES ||
    response.body === null
  ) {
    throw new Error("Cloudflare Version GET no devolvió un body acotable.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error("Cloudflare Version GET devolvió un chunk inválido.");
      }
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // El límite ya fue excedido; el error de cancelación no se expone.
        }
        throw new Error("Cloudflare Version GET excedió el tamaño aprobado.");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "Cloudflare Version GET devolvió un chunk inválido.",
        "Cloudflare Version GET excedió el tamaño aprobado.",
      ].includes(error.message)
    ) {
      throw error;
    }
    throw new Error("Cloudflare Version GET no pudo leerse de forma acotada.");
  } finally {
    reader.releaseLock();
  }
  if (total === 0) {
    throw new Error("Cloudflare Version GET devolvió un cuerpo vacío.");
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, total),
    );
  } catch {
    throw new Error("Cloudflare Version GET no devolvió UTF-8 válido.");
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("Cloudflare Version GET no devolvió JSON válido.");
  }
}

async function cloudflareJsonGet(endpoint, oauthToken, maxBytes) {
  const response = await cloudflareFetch(
    `${CLOUDFLARE_API_ORIGIN}${endpoint}`,
    {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${oauthToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (
    !(response instanceof Response) ||
    response.status !== 200 ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new Error("Cloudflare Version GET no devolvió JSON 200.");
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)
  ) {
    throw new Error("Cloudflare Version GET excedió el tamaño aprobado.");
  }
  const body = await readD72BoundedCloudflareJsonResponse(response, maxBytes);
  return Object.freeze({ body, endpoint, status: response.status });
}

async function defaultCloudflareVersionGet(candidateVersionId) {
  if (
    typeof candidateVersionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidateVersionId,
    )
  ) {
    throw new Error("candidateVersionId GET no es un UUID válido.");
  }
  const stableEndpoint = `/accounts/${D72_CANARY_ACCOUNT_ID}/workers/scripts/${D72_CANARY_WORKER_NAME}/versions/${candidateVersionId}`;
  const betaEndpoint = `/accounts/${D72_CANARY_ACCOUNT_ID}/workers/workers/${D72_CANARY_WORKER_NAME}/versions/${candidateVersionId}?include=modules`;
  let oauthToken;
  try {
    oauthToken = await loadWranglerOAuthToken();
    const stable = await cloudflareJsonGet(
      stableEndpoint,
      oauthToken,
      MAX_API_RESPONSE_BYTES,
    );
    const beta = await cloudflareJsonGet(
      betaEndpoint,
      oauthToken,
      MAX_BETA_VERSION_RESPONSE_BYTES,
    );
    return Object.freeze({
      stable,
      beta: Object.freeze({ ...beta, method: "GET" }),
    });
  } catch {
    throw new Error("No se pudo completar Cloudflare Version GET.");
  } finally {
    oauthToken = undefined;
  }
}

export function assertD72OpenCanaryCleanupReceipt(
  receipt,
  bindings,
  { allowTestOnly = false } = {},
) {
  const issued = ISSUED_OPEN_CANARY_CLEANUPS.get(receipt);
  if (
    !issued ||
    typeof allowTestOnly !== "boolean" ||
    (issued.testOnly && !allowTestOnly)
  ) {
    throw new Error(
      "El cleanup OPEN no fue observado por el runner autorizado.",
    );
  }
  for (const key of [
    "candidateIdentityHash",
    "head",
    "requestHash",
    "artifactHash",
    "canaryVersionId",
    "openSourceBaselineSha256",
  ]) {
    if (issued.bindings[key] !== bindings?.[key])
      throw new Error(`El cleanup OPEN no corresponde a ${key}.`);
  }
  return receipt;
}

/** Confirms the fallback deployment only; it does not certify consent cleanup. */
export function assertD72OpenCanaryEmergencyRecoveryReceipt(
  receipt,
  bindings,
  { allowTestOnly = false } = {},
) {
  const issued = ISSUED_OPEN_CANARY_EMERGENCY_RECOVERIES.get(receipt);
  if (
    !issued ||
    typeof allowTestOnly !== "boolean" ||
    (issued.testOnly && !allowTestOnly)
  ) {
    throw new Error(
      "La recuperación OPEN no fue observada por el runner autorizado.",
    );
  }
  for (const key of [
    "candidateIdentityHash",
    "head",
    "requestHash",
    "artifactHash",
    "canaryVersionId",
    "openSourceBaselineSha256",
  ]) {
    if (issued.bindings[key] !== bindings?.[key])
      throw new Error(`La recuperación OPEN no corresponde a ${key}.`);
  }
  return receipt;
}

export function assertD72RecoveryUploadEvidence(
  evidence,
  bindings,
  { allowTestOnly = false } = {},
) {
  const issued = ISSUED_RECOVERY_UPLOAD_EVIDENCE.get(evidence);
  if (
    !issued ||
    typeof allowTestOnly !== "boolean" ||
    (issued.testOnly && !allowTestOnly)
  ) {
    throw new Error(
      "El upload recovery exige evidencia opaca del executor autorizado.",
    );
  }
  for (const key of [
    "candidateIdentityHash",
    "head",
    "requestHash",
    "artifactHash",
    "recoveryArtifactHash",
    "recoveryVersionId",
    "openSourceBaselineSha256",
  ]) {
    if (issued.bindings[key] !== bindings?.[key])
      throw new Error(`El upload recovery no corresponde a ${key}.`);
  }
  return evidence;
}

export async function assertD72CanaryBrowserCaptureSession(
  session,
  bindings,
  { allowTestOnly = false } = {},
) {
  const issued = ISSUED_CANARY_BROWSER_SESSIONS.get(session);
  if (
    !issued ||
    typeof allowTestOnly !== "boolean" ||
    (issued.testOnly && !allowTestOnly)
  ) {
    throw new Error(
      "La captura Google exige una sesión canaria opaca del runner autorizado.",
    );
  }
  for (const key of [
    "candidateIdentityHash",
    "head",
    "requestHash",
    "artifactHash",
    "canaryVersionId",
    "openSourceBaselineSha256",
  ]) {
    if (issued.bindings[key] !== bindings?.[key])
      throw new Error(`La sesión de captura no corresponde a ${key}.`);
  }
  await issued.assertAttached();
  return issued.controller;
}

export function createD72CanaryRunner({
  execFileImpl = execFileAsync,
  validateArtifactImpl = validateExceptionalReleaseArtifact,
  verifyWranglerImpl = verifyExceptionalWranglerIntegrity,
  environment = process.env,
  nowImpl = DEFAULT_NOW_IMPL,
  ttyLineReaderImpl,
  cronSecretReaderImpl,
  getClosedStateImpl = defaultCloudflareClosedStateGet,
  getVersionImpl = defaultCloudflareVersionGet,
  createUploadApiGuardImpl = createD72CanaryUploadApiGuard,
  prepareExpectedUploadManifestImpl = createD72ExpectedUploadManifest,
  verifyRemoteArtifactImpl = verifyD72RemoteVersionArtifact,
  testOnly = false,
  ...unknownOptions
} = {}) {
  if (
    typeof testOnly !== "boolean" ||
    Object.keys(unknownOptions).length !== 0
  ) {
    throw new Error(
      "Las opciones del executor canary D72 contienen campos o testOnly inválidos.",
    );
  }
  if (
    typeof execFileImpl !== "function" ||
    typeof validateArtifactImpl !== "function" ||
    typeof verifyWranglerImpl !== "function" ||
    typeof nowImpl !== "function" ||
    typeof getClosedStateImpl !== "function" ||
    typeof getVersionImpl !== "function" ||
    typeof createUploadApiGuardImpl !== "function" ||
    typeof prepareExpectedUploadManifestImpl !== "function" ||
    typeof verifyRemoteArtifactImpl !== "function"
  ) {
    throw new Error("Las dependencias del executor canary D72 son inválidas.");
  }
  if (ttyLineReaderImpl !== undefined && testOnly !== true) {
    throw new Error(
      "El executor real no permite sustituir el lector de /dev/tty.",
    );
  }
  if (cronSecretReaderImpl !== undefined && testOnly !== true) {
    throw new Error(
      "El executor real no permite sustituir el lector oculto de CRON_SECRET.",
    );
  }
  if (testOnly === true && execFileImpl === execFileAsync) {
    throw new Error(
      "El seam testOnly exige un child fixture y nunca puede alcanzar el child real.",
    );
  }
  if (
    !testOnly &&
    (execFileImpl !== execFileAsync ||
      validateArtifactImpl !== validateExceptionalReleaseArtifact ||
      verifyWranglerImpl !== verifyExceptionalWranglerIntegrity ||
      getClosedStateImpl !== defaultCloudflareClosedStateGet ||
      getVersionImpl !== defaultCloudflareVersionGet ||
      createUploadApiGuardImpl !== createD72CanaryUploadApiGuard ||
      prepareExpectedUploadManifestImpl !== createD72ExpectedUploadManifest ||
      verifyRemoteArtifactImpl !== verifyD72RemoteVersionArtifact ||
      environment !== process.env ||
      nowImpl !== DEFAULT_NOW_IMPL)
  ) {
    throw new Error(
      "El executor real no permite sustituir child, artifact, Wrangler, API guard ni transports GET.",
    );
  }
  if (testOnly && typeof ttyLineReaderImpl !== "function") {
    throw new Error("El executor testOnly exige un lector fixture explícito.");
  }
  const ttyReader = testOnly
    ? createD72CanaryDevTtyReader({
        readLineImpl: ttyLineReaderImpl,
        testOnly: true,
      })
    : createD72CanaryProductionDevTtyReader();
  const executedUploadReceipts = new WeakMap();
  const certifiedVersions = new WeakMap();
  const canarySessions = new WeakMap();
  const issuedCapabilityGrants = new WeakMap();
  const cronSecretReader = testOnly
    ? (cronSecretReaderImpl ??
      (() => {
        throw new Error("El test no configuró un CRON_SECRET fixture.");
      }))
    : readHiddenCronSecretBuffer;

  function assertMutationRuntime(step, repositoryRoot) {
    if (!testOnly) {
      if (
        process.versions.node !== D72_CANARY_NODE_VERSION ||
        step.command !== process.execPath
      ) {
        throw new Error("El executor exige el Node 22.22.0 actual y fijado.");
      }
    }
    verifyWranglerImpl({ repositoryRoot });
  }

  async function runMutationStep(step, { artifactRoot, repositoryRoot }) {
    assertMutationRuntime(step, repositoryRoot);
    try {
      await execFileImpl(step.command, step.arguments, {
        cwd: artifactRoot,
        env: childEnvironment(environment),
        maxBuffer: MAX_OUTPUT_BYTES,
        shell: false,
        windowsHide: true,
      });
    } catch {
      throw new Error(`Wrangler ${step.id} falló (salida saneada).`);
    }
  }

  function readAuthorization(options = {}) {
    const allowed = testOnly
      ? ["bindings", "confirmedAtUtc", "kind"]
      : ["bindings", "kind"];
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      JSON.stringify(Object.keys(options).sort()) !== JSON.stringify(allowed)
    ) {
      throw new Error(
        testOnly
          ? "La lectura fixture exige kind, bindings y confirmedAtUtc."
          : "La lectura productiva fija confirmedAtUtc con reloj interno.",
      );
    }
    const { kind, bindings, confirmedAtUtc } = options;
    return readD72CanaryAuthorizationToken({
      kind,
      bindings,
      ttyReader,
      ...(testOnly ? { confirmedAtUtc } : {}),
    });
  }

  async function uploadVersion(options = {}) {
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.keys(options).sort().join(",") !==
        "artifactManifest,authorizationToken,uploadPlan,uploadPlanOptions"
    ) {
      throw new Error(
        "Stage upload admite exclusivamente plan, artifact y autorización; nunca capability ni secret.",
      );
    }
    const {
      uploadPlan,
      uploadPlanOptions,
      artifactManifest,
      authorizationToken,
    } = options;
    assertD72CanaryVersionUploadPlanAuthority(uploadPlan, {
      allowTestOnly: testOnly,
    });
    const planErrors = validateD72CanaryVersionUploadPlan(
      uploadPlan,
      uploadPlanOptions,
    );
    if (planErrors.length > 0) {
      throw new Error(`Upload plan inválido:\n${planErrors.join("\n")}`);
    }
    assertMutationRuntime(uploadPlan.upload, uploadPlanOptions.repositoryRoot);
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), "agorbis-d72-canary-"),
    );
    chmodSync(temporaryRoot, 0o700);
    const outputPath = path.join(temporaryRoot, "wrangler-output.ndjson");
    const multipartPath = path.join(temporaryRoot, "expected-upload.multipart");
    for (const securePath of [outputPath, multipartPath]) {
      const descriptor = openSync(securePath, WRITE_FLAGS, 0o600);
      closeSync(descriptor);
    }
    let childFailed = false;
    try {
      assertArtifact("Artifact pre-dry-run inválido", {
        uploadPlan,
        artifactManifest,
        repositoryRoot: uploadPlanOptions.repositoryRoot,
        validateArtifactImpl,
      });
      try {
        await execFileImpl(
          uploadPlan.upload.command,
          [
            ...uploadPlan.upload.arguments,
            "--dry-run",
            "--outfile",
            multipartPath,
          ],
          {
            cwd: uploadPlanOptions.artifactRoot,
            env: childEnvironment(environment),
            maxBuffer: MAX_OUTPUT_BYTES,
            shell: false,
            windowsHide: true,
          },
        );
      } catch {
        throw new Error(
          "Wrangler versions upload --dry-run falló (salida saneada).",
        );
      } finally {
        assertArtifact("Artifact post-dry-run inválido", {
          uploadPlan,
          artifactManifest,
          repositoryRoot: uploadPlanOptions.repositoryRoot,
          validateArtifactImpl,
        });
      }
      const expectedUploadManifest = prepareExpectedUploadManifestImpl({
        uploadPlan,
        multipartSource: readSecureFile(
          multipartPath,
          MAX_BETA_VERSION_RESPONSE_BYTES,
        ),
        artifactRoot: uploadPlanOptions.artifactRoot,
        artifactManifest,
      });
      if (
        !expectedUploadManifest ||
        !/^[0-9a-f]{64}$/.test(
          expectedUploadManifest.uploadPayloadHash ?? "",
        ) ||
        expectedUploadManifest.expectedArtifactHash !==
          (uploadPlan.uploadArtifactHash ?? uploadPlan.artifactHash)
      ) {
        throw new Error(
          "El dry-run no produjo un expected upload manifest sellado.",
        );
      }
      assertArtifact("Artifact pre-upload inválido", {
        uploadPlan,
        artifactManifest,
        repositoryRoot: uploadPlanOptions.repositoryRoot,
        validateArtifactImpl,
      });
      const uploadGuard = await createUploadApiGuardImpl({
        expectedUploadManifest,
      });
      const guardedEnvironment = childEnvironment(
        environment,
        outputPath,
        uploadGuard.apiBaseUrl,
      );
      let uploadGuardReport;
      try {
        consumeD72CanaryAuthorizationToken(authorizationToken, {
          kind: "version-upload",
          bindings: uploadAuthorizationBindings(uploadPlan),
          ...(testOnly ? { allowTestToken: true, now: nowImpl() } : {}),
        });
        validateExactSourceSnapshot(
          await getClosedStateImpl(),
          uploadPlan,
          nowImpl(),
        );
        assertArtifact("Artifact immediate-pre-upload inválido", {
          uploadPlan,
          artifactManifest,
          repositoryRoot: uploadPlanOptions.repositoryRoot,
          validateArtifactImpl,
        });
        try {
          await execFileImpl(
            uploadPlan.upload.command,
            uploadPlan.upload.arguments,
            {
              cwd: uploadPlanOptions.artifactRoot,
              env: guardedEnvironment,
              maxBuffer: MAX_OUTPUT_BYTES,
              shell: false,
              windowsHide: true,
            },
          );
        } catch {
          childFailed = true;
        }
      } finally {
        uploadGuardReport = await uploadGuard.close();
        assertArtifact("Artifact post-upload inválido", {
          uploadPlan,
          artifactManifest,
          repositoryRoot: uploadPlanOptions.repositoryRoot,
          validateArtifactImpl,
        });
      }
      assertD72CanaryUploadApiGuardReport(uploadGuardReport, { testOnly });
      if (childFailed) {
        throw new Error("Wrangler versions upload falló (salida saneada).");
      }
      const assetUploadObservation = uploadGuard.assetUploadObservation?.();
      if (!testOnly && !assetUploadObservation)
        throw new Error(
          "El upload no produjo la observación correlacionada de assets.",
        );
      const outputFileSource = readSecureOutput(outputPath);
      const receipt = parseD72CanaryVersionUploadReceipt({
        uploadPlan,
        uploadPayloadHash: expectedUploadManifest.uploadPayloadHash,
        outputFileSource,
        exitCode: 0,
        now: nowImpl(),
      });
      executedUploadReceipts.set(
        receipt,
        Object.freeze({
          artifactHash: uploadPlan.artifactHash,
          ...d72CanaryUploadArtifactBindings(uploadPlan),
          expectedUploadManifest,
          assetUploadObservation,
          sessionArgumentsHash: receipt.sessionArgumentsHash,
          uploadPayloadHash: expectedUploadManifest.uploadPayloadHash,
          uploadPlanHash: uploadPlan.planSha256,
        }),
      );
      return receipt;
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  }

  async function certifyVersion({
    uploadPlan,
    uploadPlanOptions,
    uploadReceipt,
    artifactManifest,
  } = {}) {
    const executed = executedUploadReceipts.get(uploadReceipt);
    if (
      !executed ||
      executed.uploadPlanHash !== uploadPlan.planSha256 ||
      executed.artifactHash !== uploadPlan.artifactHash ||
      executed.artifactPurpose !== uploadPlan.artifactPurpose ||
      executed.uploadArtifactHash !== uploadPlan.uploadArtifactHash ||
      executed.uploadPayloadHash !== uploadReceipt?.uploadPayloadHash
    ) {
      throw new Error(
        "El GET exige el receipt opaco emitido por este executor tras revalidar el artifact.",
      );
    }
    assertArtifact("Artifact pre-GET inválido", {
      uploadPlan,
      artifactManifest,
      repositoryRoot: uploadPlanOptions.repositoryRoot,
      validateArtifactImpl,
    });
    try {
      const closedSnapshot = await getClosedStateImpl();
      const closedObservedAtUtc = nowImpl().toISOString();
      const versionResult = await getVersionImpl(
        uploadReceipt.candidateVersionId,
      );
      if (!versionResult || !versionResult.stable || !versionResult.beta) {
        throw new Error(
          "La recertificación exige GET estable y beta include=modules.",
        );
      }
      const versionObservedAtUtc = nowImpl().toISOString();
      const attestation = parseD72CanaryVersionGetAttestation({
        uploadPlan,
        uploadReceipt,
        artifactManifest,
        getSet: {
          [uploadPlan.releaseMode === "OPEN_UPDATE"
            ? "sourceState"
            : "closedState"]: {
            method: "GET",
            observedAtUtc: closedObservedAtUtc,
            snapshot: closedSnapshot,
          },
          version: {
            body: versionResult.stable.body,
            endpoint: versionResult.stable.endpoint,
            method: "GET",
            observedAtUtc: versionObservedAtUtc,
            status: versionResult.stable.status,
          },
        },
        now: nowImpl(),
      });
      const remoteArtifactProof = await verifyRemoteArtifactImpl({
        expectedUploadManifest: executed.expectedUploadManifest,
        candidateVersionId: uploadReceipt.candidateVersionId,
        stableScriptEtag: attestation.versionScriptEtag,
        betaGet: versionResult.beta,
        assetUploadObservation: executed.assetUploadObservation,
        ...(testOnly ? { allowTestOnlyUploadEvidence: true } : {}),
      });
      if (
        !remoteArtifactProof ||
        !/^[0-9a-f]{64}$/.test(remoteArtifactProof.proofHash ?? "") ||
        remoteArtifactProof.uploadPayloadHash !== executed.uploadPayloadHash ||
        remoteArtifactProof.remoteScriptEtag !==
          attestation.versionScriptEtag ||
        typeof remoteArtifactProof.staticAssetsVerified !== "boolean"
      ) {
        throw new Error(
          "La prueba remota no liga payload sellado y Hashed script content exactos.",
        );
      }
      if (!testOnly) {
        assertD72RemoteArtifactProof(remoteArtifactProof, {
          expectedUploadManifest: executed.expectedUploadManifest,
          candidateVersionId: uploadReceipt.candidateVersionId,
          stableScriptEtag: attestation.versionScriptEtag,
        });
      }
      const certification = createD72CanaryVersionCertification({
        uploadPlan,
        versionGetAttestation: attestation,
        now: nowImpl(),
      });
      certifiedVersions.set(
        certification,
        Object.freeze({
          artifactHash: uploadPlan.artifactHash,
          ...d72CanaryUploadArtifactBindings(uploadPlan),
          remoteArtifactProofHash: remoteArtifactProof.proofHash,
          remoteScriptEtag: remoteArtifactProof.remoteScriptEtag,
          staticAssetsBlocker: remoteArtifactProof.staticAssetsBlocker ?? null,
          staticAssetsVerified: remoteArtifactProof.staticAssetsVerified,
          uploadPayloadHash: remoteArtifactProof.uploadPayloadHash,
          uploadPlanHash: uploadPlan.planSha256,
          expectedUploadManifest: executed.expectedUploadManifest,
          remoteArtifactProof,
          uploadedAtUtc: uploadReceipt.uploadedAtUtc,
          tag: `d72-canary-${uploadPlan.head}`,
          message: uploadPlan.upload.arguments.at(-1),
        }),
      );
      return certification;
    } finally {
      assertArtifact("Artifact post-GET inválido", {
        uploadPlan,
        artifactManifest,
        repositoryRoot: uploadPlanOptions.repositoryRoot,
        validateArtifactImpl,
      });
    }
  }

  async function issueCapability(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("La emisión de capability exige opciones cerradas.");
    }
    const allowedKeys = testOnly
      ? ["expiresAtUtc", "testOnlyNonce", "versionCertification"]
      : ["expiresAtUtc", "versionCertification"];
    if (
      JSON.stringify(Object.keys(options).sort()) !==
      JSON.stringify(allowedKeys)
    ) {
      throw new Error(
        testOnly
          ? "La fixture capability exige exactamente expiresAtUtc, testOnlyNonce y versionCertification."
          : "La capability productiva fija issuedAt y nonce dentro del executor.",
      );
    }
    const { versionCertification, expiresAtUtc, testOnlyNonce } = options;
    if (versionCertification?.artifactPurpose === "recovery") {
      throw new Error("Una versión recovery no autoriza capability canary.");
    }
    const certified = certifiedVersions.get(versionCertification);
    if (
      !certified ||
      !/^[0-9a-f]{64}$/.test(certified.remoteArtifactProofHash ?? "") ||
      !/^[0-9a-f]{64}$/.test(certified.uploadPayloadHash ?? "") ||
      certified.staticAssetsVerified !== true
    ) {
      throw new Error(
        certified?.staticAssetsBlocker
          ? `Capability bloqueada: ${certified.staticAssetsBlocker}.`
          : "Capability bloqueada: falta certificación GET opaca con prueba remota de bytes/config.",
      );
    }
    let secretBuffer;
    try {
      secretBuffer = await cronSecretReader();
      if (
        !Buffer.isBuffer(secretBuffer) ||
        secretBuffer.byteLength < 32 ||
        secretBuffer.byteLength > MAX_CRON_SECRET_BYTES ||
        secretBuffer.includes(0x00) ||
        secretBuffer.includes(0x0d)
      ) {
        throw new Error("El lector no devolvió un Buffer CRON_SECRET válido.");
      }
      const grant = createD72CanaryCapabilityGrant({
        artifactHash: versionCertification.artifactHash,
        existingSecret: secretBuffer,
        expiresAtUtc,
        head: versionCertification.head,
        issuedAtUtc: nowImpl().toISOString(),
        nonce: testOnly ? testOnlyNonce : randomBytes(32).toString("hex"),
        now: nowImpl(),
        policyHash: versionCertification.policyHash,
        requestHash: versionCertification.requestHash,
        versionCertification,
      });
      issuedCapabilityGrants.set(grant, {
        consumed: false,
        remoteArtifactProofHash: certified.remoteArtifactProofHash,
        versionCertification,
      });
      return grant;
    } finally {
      if (Buffer.isBuffer(secretBuffer)) secretBuffer.fill(0);
      secretBuffer = undefined;
    }
  }

  function inspectCapabilityReadiness(versionCertification) {
    if (versionCertification?.artifactPurpose === "recovery") {
      throw new Error(
        "Una certificación recovery no habilita capability canary.",
      );
    }
    const certified = certifiedVersions.get(versionCertification);
    if (
      !certified ||
      !/^[0-9a-f]{64}$/.test(certified.remoteArtifactProofHash ?? "") ||
      !/^[0-9a-f]{64}$/.test(certified.uploadPayloadHash ?? "")
    ) {
      throw new Error(
        "La readiness exige la certificación GET opaca emitida por este executor.",
      );
    }
    const ready = certified.staticAssetsVerified === true;
    return Object.freeze({
      status: ready ? "READY" : "BLOCKED",
      ready,
      staticAssetsVerified: ready,
      blocker: ready
        ? null
        : certified.staticAssetsBlocker ===
            "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE"
          ? "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE"
          : "BLOCKED_REMOTE_ARTIFACT_PROOF_NOT_VERIFIED",
      remoteArtifactProofHash: certified.remoteArtifactProofHash,
    });
  }

  function exportRecoveryUploadEvidence(versionCertification) {
    const certified = certifiedVersions.get(versionCertification);
    if (
      !certified ||
      versionCertification.artifactPurpose !== "recovery" ||
      certified.artifactPurpose !== "recovery" ||
      certified.uploadArtifactHash !== versionCertification.uploadArtifactHash
    ) {
      throw new Error(
        "La evidencia fallback exige la certificación recovery opaca de este executor.",
      );
    }
    if (certified.staticAssetsVerified !== true) {
      throw new Error(
        certified.staticAssetsBlocker ??
          "BLOCKED_REMOTE_ARTIFACT_PROOF_NOT_VERIFIED",
      );
    }
    const expected = certified.expectedUploadManifest;
    if (
      !Array.isArray(expected?.modules) ||
      !expected?.metadata ||
      !expected?.assets ||
      expected.expectedArtifactHash !== versionCertification.uploadArtifactHash
    ) {
      throw new Error(
        "La evidencia fallback requiere módulos, configuración y assets del mismo payload verificado.",
      );
    }
    if (!testOnly)
      assertD72RemoteArtifactProof(certified.remoteArtifactProof, {
        expectedUploadManifest: expected,
        candidateVersionId: versionCertification.candidateVersionId,
        stableScriptEtag: versionCertification.versionScriptEtag,
      });
    const proofBinding = {
      remoteArtifactProofHash: certified.remoteArtifactProofHash,
      uploadPayloadHash: certified.uploadPayloadHash,
      recoveryArtifactHash: versionCertification.uploadArtifactHash,
      recoveryVersionId: versionCertification.candidateVersionId,
    };
    const evidence = immutableCopy({
      schemaVersion: EXCEPTIONAL_OPEN_RECOVERY_UPLOAD_SCHEMA_VERSION,
      head: versionCertification.head,
      recoveryArtifactHash: versionCertification.uploadArtifactHash,
      recoveryVersionId: versionCertification.candidateVersionId,
      uploadPayloadHash: certified.uploadPayloadHash,
      modulesProofSha256: exceptionalOpenRecoveryEvidenceHash({
        ...proofBinding,
        kind: "modules",
        modules: expected.modules,
      }),
      staticAssetsProofSha256: exceptionalOpenRecoveryEvidenceHash({
        ...proofBinding,
        kind: "static-assets",
        assets: expected.assets,
        verified: true,
      }),
      configurationProofSha256: exceptionalOpenRecoveryEvidenceHash({
        ...proofBinding,
        kind: "configuration",
        metadata: expected.metadata,
        configurationDigest: versionCertification.configurationDigest,
      }),
      versionScriptEtag: versionCertification.versionScriptEtag,
      tag: certified.tag,
      message: certified.message,
      uploadedAtUtc: certified.uploadedAtUtc,
      verifiedAtUtc: versionCertification.observedAtUtc,
    });
    ISSUED_RECOVERY_UPLOAD_EVIDENCE.set(evidence, {
      testOnly,
      bindings: {
        candidateIdentityHash: versionCertification.candidateIdentityHash,
        head: versionCertification.head,
        requestHash: versionCertification.requestHash,
        artifactHash: versionCertification.artifactHash,
        recoveryArtifactHash: evidence.recoveryArtifactHash,
        recoveryVersionId: evidence.recoveryVersionId,
        openSourceBaselineSha256: versionCertification.openSourceBaselineSha256,
      },
    });
    return evidence;
  }

  function assertOpenRecovery(plan, planOptions) {
    const { recoveryCapsuleManifest, recoveryExpectedBindings, recoveryRoot } =
      planOptions;
    if (
      typeof recoveryRoot !== "string" ||
      !path.isAbsolute(recoveryRoot) ||
      path.resolve(recoveryRoot) !== recoveryRoot
    ) {
      throw new Error("Recovery canary exige un directorio absoluto canónico.");
    }
    // O_NOFOLLOW protects the files; also reject symlinked parent directories.
    let ancestor = recoveryRoot;
    while (true) {
      const stat = lstatSync(ancestor);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("Recovery canary no admite directorios enlazados.");
      if (
        ancestor === recoveryRoot &&
        ((stat.mode & 0o7777) !== 0o700 ||
          (typeof process.getuid === "function" &&
            stat.uid !== process.getuid()))
      ) {
        throw new Error("Recovery canary requiere directorio propio 0700.");
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const sources = Object.fromEntries(
      ["exceptional-release-empty.env", "wrangler.traffic.jsonc"].map(
        (name) => [name, readSecureOutput(path.join(recoveryRoot, name))],
      ),
    );
    const capsule = assertExceptionalOpenRecoveryFiles({
      capsuleManifest: recoveryCapsuleManifest,
      expectedBindings: recoveryExpectedBindings,
      sources,
    });
    if (
      capsule.recoveryScope !== "CANARY_ONLY" ||
      capsule.head !== planOptions.head ||
      capsule.requestHash !== planOptions.requestHash ||
      capsule.artifactHash !== planOptions.artifactHash ||
      capsule.sourceVersionId !== planOptions.sourceVersionId ||
      capsule.sourceDeploymentId !== planOptions.sourceDeploymentId ||
      capsule.openSourceBaselineSha256 !==
        planOptions.openSourceBaselineSha256 ||
      capsule.candidateIdentityHash !==
        planOptions.versionCertification.candidateIdentityHash ||
      capsule.infraAuthorizationHash !==
        plan.zeroPercentDeploymentAuthorizationHash
    ) {
      throw new Error(
        "La cápsula CANARY_ONLY no conserva los vínculos del plan 100/0.",
      );
    }
    const [detach] = createExceptionalOpenRecoveryPlan({
      repositoryRoot: planOptions.repositoryRoot,
      capsuleRoot: recoveryRoot,
      stateRoot: recoveryRoot,
      nodeExecutable: plan.attach.command,
      capsuleManifest: capsule,
      expectedBindings: recoveryExpectedBindings,
    });
    if (JSON.stringify(detach) !== JSON.stringify(plan.recovery)) {
      throw new Error(
        "El detach OPEN no coincide con la recuperación fallback sellada.",
      );
    }
    return capsule;
  }

  async function assertOpenRecoveryCurrent(plan, planOptions) {
    const capsule = assertOpenRecovery(plan, planOptions);
    const response = await getVersionImpl(capsule.recoveryVersionId);
    if (!response?.stable)
      throw new Error(
        "La recuperación requiere GET actual de su versión fallback.",
      );
    assertD72OpenRecoveryVersionGet(
      {
        ...response.stable,
        method: "GET",
        observedAtUtc: nowImpl().toISOString(),
      },
      {
        ...capsule.recoveryUploadEvidence,
        now: nowImpl(),
      },
    );
    assertOpenRecovery(plan, planOptions);
    return capsule;
  }

  async function cleanup({
    plan,
    planOptions,
    uploadPlan,
    uploadPlanOptions,
    artifactManifest,
    getClosedStateImpl,
    normalOpenCleanup = false,
    attachedDeploymentId,
  }) {
    if (planOptions.releaseMode === "OPEN_UPDATE" && !normalOpenCleanup) {
      // Recovery remains independent of the mutable candidate directory and
      // the promotion window. The sealed fallback files and runtime are rechecked.
      const capsule = await assertOpenRecoveryCurrent(plan, planOptions);
      let mutationFailed = false;
      try {
        await runMutationStep(plan.recovery, {
          artifactRoot: planOptions.recoveryRoot,
          repositoryRoot: planOptions.repositoryRoot,
        });
      } catch {
        mutationFailed = true;
      }
      assertOpenRecovery(plan, planOptions);
      const recovered = assertExceptionalOpenRecoveredState({
        capsuleManifest: capsule,
        expectedBindings: planOptions.recoveryExpectedBindings,
        snapshot: await getClosedStateImpl(),
        observedAtUtc: nowImpl().toISOString(),
      });
      // An ambiguous CLI exit is resolved only by the exact fallback GET.
      return Object.freeze({
        ...recovered,
        mutationReportedFailure: mutationFailed,
        activeDeploymentId: recovered.deploymentId,
        activeVersionId: recovered.recoveryVersionId,
      });
    }
    assertArtifact("Artifact pre-detach inválido", {
      uploadPlan,
      artifactManifest,
      repositoryRoot: uploadPlanOptions.repositoryRoot,
      validateArtifactImpl,
    });
    if (planOptions.releaseMode === "OPEN_UPDATE") {
      const attached = validateExactAttachedAtZeroSnapshot(
        await getClosedStateImpl(),
        {
          ...planOptions,
          candidateVersionId:
            planOptions.versionCertification.candidateVersionId,
          now: nowImpl(),
        },
      );
      if (attached.activeDeploymentId !== attachedDeploymentId)
        throw new Error(
          "El cleanup OPEN no conserva el deployment canario observado.",
        );
    }
    try {
      await runMutationStep(plan.detach, {
        artifactRoot: planOptions.artifactRoot,
        repositoryRoot: planOptions.repositoryRoot,
      });
    } finally {
      assertArtifact("Artifact post-detach inválido", {
        uploadPlan,
        artifactManifest,
        repositoryRoot: uploadPlanOptions.repositoryRoot,
        validateArtifactImpl,
      });
    }
    const detachedSnapshot = await getClosedStateImpl();
    if (planOptions.releaseMode === "OPEN_UPDATE") {
      const active = detachedSnapshot?.deployments?.result?.deployments?.[0];
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          active?.id ?? "",
        ) ||
        [planOptions.sourceDeploymentId, attachedDeploymentId].includes(
          active.id,
        )
      ) {
        throw new Error("El cleanup OPEN no creó un deployment nuevo válido.");
      }
      const projection = structuredClone(detachedSnapshot);
      projection.deployments.result.deployments[0].id =
        planOptions.sourceDeploymentId;
      validateExactSourceSnapshot(projection, planOptions, nowImpl());
      return Object.freeze({
        activeDeploymentId: active.id,
        activeVersionId: planOptions.sourceVersionId,
      });
    }
    return validateExactClosedSnapshot(detachedSnapshot, {
      closedDeploymentId: planOptions.closedDeploymentId,
      closedVersionId: planOptions.closedVersionId,
      // A successful detach creates a new CLOSED-only deployment.
      requireDeploymentId: false,
    });
  }

  async function attachAtZero({
    plan,
    planOptions,
    uploadPlan,
    uploadPlanOptions,
    artifactManifest,
    capabilityGrant,
    authorizationToken,
  } = {}) {
    // Keep opaque capabilities by identity, but seal all JSON/command inputs
    // before the first await so later caller edits cannot change cleanup traffic.
    plan = immutableCopy(plan);
    planOptions = snapshotPlanOptions(planOptions);
    uploadPlanOptions = snapshotPlanOptions(uploadPlanOptions);
    artifactManifest = immutableCopy(artifactManifest);
    const errors = validateD72CanaryPlan(plan, {
      ...planOptions,
      now: nowImpl(),
    });
    if (errors.length > 0) {
      throw new Error(`Plan 100/0 inválido:\n${errors.join("\n")}`);
    }
    const certified = certifiedVersions.get(planOptions.versionCertification);
    if (
      !certified ||
      certified.uploadPlanHash !== uploadPlan?.planSha256 ||
      certified.artifactHash !== uploadPlan?.artifactHash
    ) {
      throw new Error(
        "El attach exige la certificación emitida por este executor y sus GET actuales.",
      );
    }
    const capabilityData = issuedCapabilityGrants.get(capabilityGrant);
    if (
      !capabilityData ||
      capabilityData.consumed !== false ||
      capabilityData.versionCertification !==
        planOptions.versionCertification ||
      planOptions.canaryCapabilityGrant !== capabilityGrant ||
      capabilityData.remoteArtifactProofHash !==
        certified.remoteArtifactProofHash
    ) {
      throw new Error(
        "El attach exige el grant HMAC opaco, vigente y no consumido emitido después de la prueba remota exacta.",
      );
    }
    const uploadErrors = validateD72CanaryVersionUploadPlan(
      uploadPlan,
      uploadPlanOptions,
    );
    if (uploadErrors.length > 0) {
      throw new Error(`Upload plan inválido:\n${uploadErrors.join("\n")}`);
    }
    if (
      uploadPlan.artifactHash !== planOptions.artifactHash ||
      JSON.stringify(d72CanarySourceBindings(uploadPlan)) !==
        JSON.stringify(d72CanarySourceBindings(planOptions)) ||
      uploadPlanOptions.artifactRoot !== planOptions.artifactRoot ||
      uploadPlanOptions.repositoryRoot !== planOptions.repositoryRoot
    ) {
      throw new Error(
        "Upload, artifact y plan 100/0 no tienen bindings exactos.",
      );
    }
    if (planOptions.releaseMode === "OPEN_UPDATE")
      await assertOpenRecoveryCurrent(plan, planOptions);
    consumeD72CanaryAuthorizationToken(authorizationToken, {
      kind: "zero-percent-deployment",
      bindings: zeroPercentAuthorizationBindings({ ...planOptions, plan }),
      ...(testOnly ? { allowTestToken: true, now: nowImpl() } : {}),
    });
    // El grant autoriza un solo intento de attach dentro de este proceso. Se
    // consume antes de toda lectura/operación remota posterior; un error deja el
    // grant retirado y exige recertificar/reautorizar desde una sesión nueva.
    issuedCapabilityGrants.set(capabilityGrant, {
      ...capabilityData,
      consumed: true,
    });
    validateExactSourceSnapshot(
      await getClosedStateImpl(),
      planOptions,
      nowImpl(),
    );
    assertArtifact("Artifact pre-attach inválido", {
      uploadPlan,
      artifactManifest,
      repositoryRoot: uploadPlanOptions.repositoryRoot,
      validateArtifactImpl,
    });
    try {
      try {
        await runMutationStep(plan.attach, {
          artifactRoot: planOptions.artifactRoot,
          repositoryRoot: planOptions.repositoryRoot,
        });
      } finally {
        assertArtifact("Artifact post-attach inválido", {
          uploadPlan,
          artifactManifest,
          repositoryRoot: uploadPlanOptions.repositoryRoot,
          validateArtifactImpl,
        });
      }
      const attached = validateExactAttachedAtZeroSnapshot(
        await getClosedStateImpl(),
        {
          ...planOptions,
          now: nowImpl(),
          candidateVersionId:
            planOptions.versionCertification.candidateVersionId,
        },
      );
      const session = Object.freeze({
        attachedAtZero: true,
        attachedDeploymentId: attached.activeDeploymentId,
        candidateVersionId: planOptions.versionCertification.candidateVersionId,
        ...(planOptions.releaseMode === "OPEN_UPDATE"
          ? {
              releaseMode: "OPEN_UPDATE",
              sourceVersionId: planOptions.sourceVersionId,
              openSourceBaselineSha256: planOptions.openSourceBaselineSha256,
              ordinaryTrafficExpectedOpen: true,
              recoveryCapsuleHash:
                planOptions.recoveryExpectedBindings.expectedCapsuleHash,
            }
          : {
              closedVersionId: planOptions.closedVersionId,
              ordinaryTrafficExpectedClosed: true,
            }),
      });
      canarySessions.set(session, {
        artifactManifest,
        getClosedStateImpl,
        plan,
        planOptions,
        uploadPlan,
        uploadPlanOptions,
        attachedDeploymentId: attached.activeDeploymentId,
        cleaned: false,
      });
      if (planOptions.releaseMode === "OPEN_UPDATE") {
        const expiresAtUtc = capabilityGrant.expiresAtUtc;
        const allowedHeaders = plan.probes.find(
          (probe) => probe.id === "canary-root-open",
        )?.headers;
        if (!allowedHeaders || Object.keys(allowedHeaders).length !== 2)
          throw new Error("El plan no contiene los headers canarios sellados.");
        ISSUED_CANARY_BROWSER_SESSIONS.set(session, {
          testOnly,
          bindings: Object.freeze({
            candidateIdentityHash:
              planOptions.versionCertification.candidateIdentityHash,
            head: planOptions.head,
            requestHash: planOptions.requestHash,
            artifactHash: planOptions.artifactHash,
            canaryVersionId:
              planOptions.versionCertification.candidateVersionId,
            openSourceBaselineSha256: planOptions.openSourceBaselineSha256,
          }),
          assertAttached: () => assertCanarySessionStillAttached(session),
          controller: Object.freeze({
            expiresAtUtc,
            attachedDeploymentId: attached.activeDeploymentId,
            canaryVersionId:
              planOptions.versionCertification.candidateVersionId,
            openSourceBaselineSha256: planOptions.openSourceBaselineSha256,
            headersFor(url) {
              const state = canarySessions.get(session);
              if (
                !state ||
                state.cleaned ||
                nowImpl().getTime() >= Date.parse(expiresAtUtc)
              )
                throw new Error("La sesión canaria venció o terminó.");
              const parsed = new URL(url);
              if (
                parsed.protocol !== "https:" ||
                parsed.username ||
                parsed.password ||
                parsed.port ||
                !["agorbis.com", "www.agorbis.com"].includes(parsed.hostname)
              )
                return Object.freeze({});
              return Object.freeze({ ...allowedHeaders });
            },
          }),
        });
      }
      return session;
    } catch {
      // If attach is ambiguous or its immediate GET is not exact, make one
      // fail-closed attempt with the already sealed detach plan.
      try {
        await cleanup({
          plan,
          planOptions,
          uploadPlan,
          uploadPlanOptions,
          artifactManifest,
          getClosedStateImpl,
        });
      } catch {
        throw new Error(
          planOptions.releaseMode === "OPEN_UPDATE"
            ? "Attach 0% falló o fue ambiguo y el fallback OPEN no pudo verificarse."
            : "Attach 0% falló o fue ambiguo y el cleanup CLOSED no pudo verificarse.",
        );
      }
      throw new Error(
        planOptions.releaseMode === "OPEN_UPDATE"
          ? "Attach 0% falló o fue ambiguo; cleanup restauró fallback OPEN verificado."
          : "Attach 0% falló o fue ambiguo; cleanup restauró CLOSED verificado.",
      );
    }
  }

  async function cleanupCanarySession(canarySession, options = {}) {
    const state = canarySessions.get(canarySession);
    if (!state || state.cleaned) {
      throw new Error(
        "Cleanup exige la sesión canaria opaca activa emitida por este executor.",
      );
    }
    const openUpdate = state.planOptions.releaseMode === "OPEN_UPDATE";
    if (
      !options ||
      Object.getPrototypeOf(options) !== Object.prototype ||
      Object.keys(options).sort().join(",") !==
        (openUpdate ? "consentCleanupEvidence" : "")
    ) {
      throw new Error(
        "El cleanup OPEN exige exclusivamente evidencia de retiro y cierre de sesiones.",
      );
    }
    if (openUpdate) {
      assertD72OpenCanaryConsentCleanupEvidence(
        options.consentCleanupEvidence,
        {
          candidateIdentityHash:
            state.planOptions.versionCertification.candidateIdentityHash,
          head: state.planOptions.head,
          requestHash: state.planOptions.requestHash,
          artifactHash: state.planOptions.artifactHash,
          canaryVersionId:
            state.planOptions.versionCertification.candidateVersionId,
          openSourceBaselineSha256: state.planOptions.openSourceBaselineSha256,
          attachedDeploymentId: state.attachedDeploymentId,
        },
        { allowTestOnly: testOnly },
      );
    }
    const closed = await cleanup({ ...state, normalOpenCleanup: openUpdate });
    canarySessions.set(canarySession, {
      ...state,
      cleaned: true,
    });
    if (openUpdate) {
      const capsule = state.planOptions.recoveryCapsuleManifest;
      const receipt = Object.freeze({
        cleanupVerified: true,
        releaseMode: "OPEN_UPDATE",
        sourceDeploymentId: state.planOptions.sourceDeploymentId,
        sourceVersionId: closed.activeVersionId,
        cleanupDeploymentId: closed.activeDeploymentId,
        recoveryVersionId: capsule.recoveryVersionId,
        recoveryArtifactHash: capsule.recoveryArtifactHash,
        recoveryCapsuleHash: capsule.contentSha256,
        openSourceBaselineSha256: capsule.openSourceBaselineSha256,
        candidateAttached: false,
        cronCount: capsule.openSourceBaseline.crons.length,
        deploymentChain: Object.freeze([
          Object.freeze({
            phase: "attach",
            previousDeploymentId: state.planOptions.sourceDeploymentId,
            deploymentId: state.attachedDeploymentId,
          }),
          Object.freeze({
            phase: "cleanup",
            previousDeploymentId: state.attachedDeploymentId,
            deploymentId: closed.activeDeploymentId,
          }),
        ]),
      });
      ISSUED_OPEN_CANARY_CLEANUPS.set(receipt, {
        testOnly,
        bindings: Object.freeze({
          candidateIdentityHash:
            state.planOptions.versionCertification.candidateIdentityHash,
          head: state.planOptions.head,
          requestHash: state.planOptions.requestHash,
          artifactHash: state.planOptions.artifactHash,
          canaryVersionId:
            state.planOptions.versionCertification.candidateVersionId,
          openSourceBaselineSha256: state.planOptions.openSourceBaselineSha256,
        }),
      });
      return receipt;
    }
    return Object.freeze({
      cleanupVerified: true,
      closedDeploymentId: closed.activeDeploymentId,
      closedVersionId: closed.activeVersionId,
      candidateAttached: false,
      cronCount: 0,
    });
  }

  async function recoverOpenCanarySession(canarySession) {
    const state = canarySessions.get(canarySession);
    if (
      !state ||
      state.cleaned ||
      state.planOptions.releaseMode !== "OPEN_UPDATE"
    ) {
      throw new Error(
        "Recovery OPEN exige una sesión opaca activa del mismo executor.",
      );
    }
    const recovered = await cleanup(state);
    canarySessions.set(canarySession, { ...state, cleaned: true });
    const receipt = Object.freeze({
      recoveryVerified: true,
      releaseMode: "OPEN_UPDATE",
      canarySucceeded: false,
      recoveryVersionId: recovered.activeVersionId,
      recoveryDeploymentId: recovered.activeDeploymentId,
      observedAtUtc: recovered.observedAtUtc,
      recoveryCapsuleHash:
        state.planOptions.recoveryCapsuleManifest.contentSha256,
      candidateAttached: false,
    });
    ISSUED_OPEN_CANARY_EMERGENCY_RECOVERIES.set(receipt, {
      testOnly,
      bindings: Object.freeze({
        candidateIdentityHash:
          state.planOptions.versionCertification.candidateIdentityHash,
        head: state.planOptions.head,
        requestHash: state.planOptions.requestHash,
        artifactHash: state.planOptions.artifactHash,
        canaryVersionId:
          state.planOptions.versionCertification.candidateVersionId,
        openSourceBaselineSha256: state.planOptions.openSourceBaselineSha256,
      }),
    });
    return receipt;
  }

  async function assertCanarySessionStillAttached(canarySession) {
    const state = canarySessions.get(canarySession);
    if (!state || state.cleaned) {
      throw new Error("La sesión canaria no está activa en este executor.");
    }
    assertArtifact("Artifact de sesión canaria inválido", {
      uploadPlan: state.uploadPlan,
      artifactManifest: state.artifactManifest,
      repositoryRoot: state.uploadPlanOptions.repositoryRoot,
      validateArtifactImpl,
    });
    const attached = validateExactAttachedAtZeroSnapshot(
      await state.getClosedStateImpl(),
      {
        ...state.planOptions,
        now: nowImpl(),
        candidateVersionId:
          state.planOptions.versionCertification.candidateVersionId,
      },
    );
    if (attached.activeDeploymentId !== canarySession.attachedDeploymentId) {
      throw new Error("La sesión canaria cambió de deployment activo.");
    }
    return Object.freeze({
      attachedAtZero: true,
      ...(state.planOptions.releaseMode === "OPEN_UPDATE"
        ? { ordinaryTrafficExpectedOpen: true }
        : { ordinaryTrafficExpectedClosed: true }),
    });
  }

  return Object.freeze({
    mode: "plan-only",
    remoteMutationDefault: false,
    readAuthorization,
    uploadVersion,
    certifyVersion,
    exportRecoveryUploadEvidence,
    inspectCapabilityReadiness,
    issueCapability,
    attachAtZero,
    assertCanarySessionStillAttached,
    cleanupCanarySession,
    recoverOpenCanarySession,
  });
}

export function parseD72CanaryRunnerArgs(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    throw new Error("argv D72 inválido.");
  }
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--plan-only")) {
    return Object.freeze({ mode: "plan-only" });
  }
  throw new Error(
    "El CLI D72 es plan-only por defecto; las etapas mutantes requieren el executor interactivo en el mismo proceso.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  parseD72CanaryRunnerArgs(process.argv.slice(2));
  process.stdout.write(
    `${JSON.stringify({ deploymentAuthorized: false, deploymentExecuted: false, mode: "plan-only" })}\n`,
  );
}
