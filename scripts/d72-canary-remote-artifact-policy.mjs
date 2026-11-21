import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readSync,
} from "node:fs";
import path from "node:path";
import blake3 from "../node_modules/.pnpm/blake3-wasm@2.1.5/node_modules/blake3-wasm/dist/index.js";
import {
  parseJsonc,
  validateOpenRecoveryConfiguration,
  validateWranglerConfiguration,
} from "./cloudflare-worker-policy.mjs";

export const D72_EXPECTED_UPLOAD_MANIFEST_SCHEMA_VERSION =
  "agorbis-d72-expected-upload-manifest/v1";
export const D72_REMOTE_ARTIFACT_PROOF_SCHEMA_VERSION =
  "agorbis-d72-remote-artifact-proof/v1";
export const D72_STATIC_ASSET_PROOF_BLOCKER =
  "BLOCKED_REMOTE_STATIC_ASSET_BYTES_UNVERIFIABLE";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULE_NAME_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@+-]{1,512}$/;
const CONTENT_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:; charset=utf-8)?$/;
const BOUNDARY_PATTERN = /^----formdata-undici-[0-9]{12}$/;
const MAX_MULTIPART_BYTES = 64 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 2_048;
const MAX_BINDINGS = 128;
const EXPECTED_ASSETS_IGNORE = Object.freeze([
  "_worker.js",
  "_routes.json",
  "_headers",
  "_redirects",
  "sitemap.xml",
  "404.html",
  "q-manifest.json",
]);
const REQUIRED_SECRET_NAMES = Object.freeze([
  "CRON_SECRET",
  "SUPABASE_SECRET_KEY",
  "TURNSTILE_SECRET",
]);
const READ_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_CLOEXEC ?? 0) | fsConstants.O_NOFOLLOW;
const EXPECTED_UPLOAD_MANIFESTS = new WeakMap();
const REMOTE_ARTIFACT_PROOFS = new WeakMap();
const ASSET_UPLOAD_OBSERVATIONS = new WeakMap();
const cloudflareAssetUploadFetch = globalThis.fetch.bind(globalThis);
const ASSET_API_ROOT =
  "https://api.cloudflare.com/client/v4/accounts/4d78fb10c1ae65281ec851479d5045dc/workers";

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (
    !isPlainObject(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} contiene campos faltantes o desconocidos.`);
  }
}

function allowedKeys(value, required, optional, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} debe ser un objeto.`);
  }
  const actual = Object.keys(value);
  const approved = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    actual.some((key) => !approved.has(key))
  ) {
    throw new Error(`${label} contiene campos faltantes o desconocidos.`);
  }
}

function normalizedPackageDependencies(value, label) {
  if (!Array.isArray(value) || value.length > 128) {
    throw new Error(`${label} debe ser un array acotado.`);
  }
  const normalized = value.map((dependency, index) => {
    exactKeys(
      dependency,
      ["installedVersion", "name", "packageJsonVersion"],
      `${label}[${index}]`,
    );
    for (const field of ["installedVersion", "name", "packageJsonVersion"]) {
      if (
        typeof dependency[field] !== "string" ||
        dependency[field].length === 0 ||
        dependency[field].length > 256
      ) {
        throw new Error(`${label}[${index}].${field} no es canónico.`);
      }
    }
    return { ...dependency };
  });
  normalized.sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (new Set(normalized.map(({ name }) => name)).size !== normalized.length) {
    throw new Error(`${label} contiene nombres duplicados.`);
  }
  return normalized;
}

function readRegularFile(filePath, expected) {
  let descriptor = null;
  try {
    descriptor = openSync(filePath, READ_FLAGS);
    const before = fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.size !== expected.size ||
      before.size > MAX_MULTIPART_BYTES
    ) {
      throw new Error(`Asset local ${expected.path} no es regular/esperado.`);
    }
    const content = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < content.length) {
      const count = readSync(
        descriptor,
        content,
        offset,
        content.length - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor);
    if (
      offset !== content.length ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      sha256(content) !== expected.sha256
    ) {
      content.fill(0);
      throw new Error(`Asset local ${expected.path} cambió al leerse.`);
    }
    return content;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function parseMultipart(source, { assetsOnly = false } = {}) {
  if (!Buffer.isBuffer(source) || source.length > MAX_MULTIPART_BYTES) {
    throw new Error("El multipart dry-run debe ser un Buffer acotado.");
  }
  const firstLineEnd = source.indexOf("\r\n", 0, "latin1");
  if (firstLineEnd < 4) throw new Error("Multipart dry-run truncado.");
  const opening = source.subarray(0, firstLineEnd).toString("ascii");
  if (!opening.startsWith("--")) throw new Error("Boundary multipart ausente.");
  const boundary = opening.slice(2);
  if (!BOUNDARY_PATTERN.test(boundary)) {
    throw new Error(
      "Boundary multipart no corresponde a Node 22/Undici fijado.",
    );
  }
  const delimiter = Buffer.from(`\r\n--${boundary}`, "ascii");
  const parts = [];
  const partNames = new Set();
  let cursor = firstLineEnd + 2;
  for (;;) {
    if (parts.length >= MAX_MULTIPART_PARTS) {
      throw new Error("Multipart dry-run contiene demasiadas partes.");
    }
    const next = source.indexOf(delimiter, cursor);
    if (next < 0) throw new Error("Multipart dry-run truncado.");
    const rawPart = source.subarray(cursor, next);
    const headerEnd = rawPart.indexOf("\r\n\r\n", 0, "latin1");
    if (headerEnd < 0) throw new Error("Parte multipart sin headers cerrados.");
    const headerLines = rawPart
      .subarray(0, headerEnd)
      .toString("ascii")
      .split("\r\n");
    if (headerLines.length < 1 || headerLines.length > 2) {
      throw new Error("Parte multipart contiene headers desconocidos.");
    }
    const disposition = headerLines.find((line) =>
      line.startsWith("Content-Disposition: "),
    );
    const contentTypeLine = headerLines.find((line) =>
      line.startsWith("Content-Type: "),
    );
    if (!disposition || headerLines[0] !== disposition) {
      throw new Error("Parte multipart no usa Content-Disposition canónico.");
    }
    const match = disposition.match(
      /^Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?$/,
    );
    if (!match || (match[2] !== undefined && match[2] !== match[1])) {
      throw new Error("Nombre/filename multipart no es canónico.");
    }
    const name = match[1];
    const contentType = contentTypeLine?.slice("Content-Type: ".length) ?? null;
    const canonicalMetadataHeaders =
      name === "metadata" &&
      match[2] === undefined &&
      headerLines.length === 1 &&
      contentType === null;
    const canonicalModuleHeaders =
      name !== "metadata" &&
      match[2] !== undefined &&
      headerLines.length === 2 &&
      headerLines[1] === contentTypeLine &&
      typeof contentType === "string" &&
      CONTENT_TYPE_PATTERN.test(contentType);
    if (
      (!canonicalMetadataHeaders && !canonicalModuleHeaders) ||
      partNames.has(name)
    ) {
      throw new Error("Parte multipart metadata/módulo inválida o duplicada.");
    }
    partNames.add(name);
    parts.push({
      name,
      contentType,
      content: Buffer.from(rawPart.subarray(headerEnd + 4)),
    });
    const suffixStart = next + delimiter.length;
    if (
      source.subarray(suffixStart, suffixStart + 4).toString("ascii") ===
      "--\r\n"
    ) {
      if (suffixStart + 4 !== source.length) {
        throw new Error("Multipart contiene bytes posteriores al cierre.");
      }
      break;
    }
    if (
      source.subarray(suffixStart, suffixStart + 2).toString("ascii") !== "\r\n"
    ) {
      throw new Error("Separador multipart inválido.");
    }
    cursor = suffixStart + 2;
  }
  if (!assetsOnly && parts[0]?.name !== "metadata") {
    throw new Error("Metadata debe ser la primera parte multipart.");
  }
  return parts;
}

function parseUploadMetadata(part, candidateConfiguration) {
  if (!part) throw new Error("Multipart no contiene metadata.");
  let metadata;
  try {
    const text = part.content.toString("utf8");
    if (Buffer.from(text, "utf8").compare(part.content) !== 0) {
      throw new Error("utf8");
    }
    metadata = JSON.parse(text);
  } catch {
    throw new Error("Metadata multipart no es JSON UTF-8 válido.");
  }
  allowedKeys(
    metadata,
    [
      "annotations",
      "bindings",
      "compatibility_date",
      "compatibility_flags",
      "keep_bindings",
      "limits",
      "main_module",
    ],
    ["package_dependencies"],
    "Metadata dry-run",
  );
  exactKeys(
    metadata.annotations,
    ["workers/message", "workers/tag"],
    "Metadata dry-run annotations",
  );
  if (
    typeof metadata.main_module !== "string" ||
    !MODULE_NAME_PATTERN.test(metadata.main_module) ||
    Object.values(metadata.annotations).some(
      (value) =>
        typeof value !== "string" || value.length === 0 || value.length > 2_048,
    ) ||
    canonicalJson(metadata.keep_bindings) !==
      canonicalJson(["secret_text", "secret_key"]) ||
    metadata.compatibility_date !== candidateConfiguration.compatibility_date ||
    canonicalJson(metadata.compatibility_flags) !==
      canonicalJson(candidateConfiguration.compatibility_flags) ||
    canonicalJson(metadata.limits) !==
      canonicalJson(candidateConfiguration.limits)
  ) {
    throw new Error("Metadata dry-run contiene configuración desconocida.");
  }
  normalizedBindingSet(metadata.bindings, { local: true });
  if (Object.hasOwn(metadata, "package_dependencies")) {
    normalizedPackageDependencies(
      metadata.package_dependencies,
      "Metadata dry-run package_dependencies",
    );
  }
  return metadata;
}

function readCandidateConfiguration({ artifactRoot, artifactManifest }) {
  const configurationEntries = artifactManifest.files.filter(
    (entry) => entry.path === "wrangler.jsonc",
  );
  if (configurationEntries.length !== 1) {
    throw new Error(
      "Artifact debe contener un único wrangler.jsonc candidato sellado.",
    );
  }
  const source = readRegularFile(
    path.join(artifactRoot, "wrangler.jsonc"),
    configurationEntries[0],
  );
  let configuration;
  try {
    configuration = parseJsonc(
      source.toString("utf8"),
      "wrangler.jsonc candidato sellado",
    );
  } finally {
    source.fill(0);
  }
  const expectedPrimary = structuredClone(configuration);
  if (
    artifactManifest.artifactPurpose === "recovery" &&
    isPlainObject(expectedPrimary.vars)
  ) {
    expectedPrimary.vars.PUBLIC_GOOGLE_AUTH_ENABLED = "true";
  }
  const errors =
    artifactManifest.artifactPurpose === "recovery"
      ? validateOpenRecoveryConfiguration(configuration, expectedPrimary)
      : validateWranglerConfiguration(configuration);
  if (errors.length > 0) {
    throw new Error(
      `wrangler.jsonc candidato no coincide con la policy fijada: ${errors.join(
        " | ",
      )}`,
    );
  }
  return configuration;
}

function expectedRemoteAssetsConfig(configuration) {
  const expected = {};
  for (const field of [
    "html_handling",
    "not_found_handling",
    "run_worker_first",
  ]) {
    if (Object.hasOwn(configuration.assets, field)) {
      expected[field] = configuration.assets[field];
    }
  }
  return canonicalize(expected);
}

function createAssetInventory({
  artifactRoot,
  artifactManifest,
  assetContentByHash,
}) {
  const ignoreEntry = artifactManifest.files.find(
    (entry) => entry.path === "dist/.assetsignore",
  );
  if (!ignoreEntry) throw new Error("Artifact no contiene dist/.assetsignore.");
  const ignoreSource = readRegularFile(
    path.join(artifactRoot, ignoreEntry.path),
    ignoreEntry,
  ).toString("utf8");
  const expectedIgnoreSource = `${EXPECTED_ASSETS_IGNORE.join("\n")}\n`;
  if (ignoreSource !== expectedIgnoreSource) {
    throw new Error(".assetsignore no coincide con la policy D72 fijada.");
  }
  const basenamePatterns = new Set(EXPECTED_ASSETS_IGNORE);
  const manifest = {};
  for (const entry of artifactManifest.files) {
    if (!entry.path.startsWith("dist/")) continue;
    const relative = entry.path.slice("dist/".length);
    const segments = relative.split("/");
    const ignoredByWrangler =
      relative === ".assetsignore" ||
      relative === "_headers" ||
      relative === "_redirects" ||
      segments.some((segment) => basenamePatterns.has(segment));
    if (ignoredByWrangler) continue;
    const content = readRegularFile(path.join(artifactRoot, entry.path), entry);
    const extension = path.posix.extname(relative).slice(1);
    const hash = blake3
      .hash(`${content.toString("base64")}${extension}`)
      .toString("hex")
      .slice(0, 32);
    const previous = assetContentByHash?.get(hash);
    if (
      previous &&
      (previous.sha256 !== entry.sha256 || previous.size !== entry.size)
    ) {
      content.fill(0);
      throw new Error(
        "Dos assets locales comparten un hash corto con bytes distintos.",
      );
    }
    manifest[`/${relative}`] = { hash, size: entry.size };
    assetContentByHash?.set(hash, { size: entry.size, sha256: entry.sha256 });
    content.fill(0);
  }
  const headersEntry = artifactManifest.files.find(
    (entry) => entry.path === "dist/_headers",
  );
  const redirectsEntry = artifactManifest.files.find(
    (entry) => entry.path === "dist/_redirects",
  );
  return {
    manifest: canonicalize(manifest),
    manifestSha256: sha256(Buffer.from(canonicalJson(manifest), "utf8")),
    headersSha256: headersEntry?.sha256 ?? null,
    redirectsSha256: redirectsEntry?.sha256 ?? null,
  };
}

export function createD72ExpectedUploadManifest({
  uploadPlan,
  multipartSource,
  artifactRoot,
  artifactManifest,
} = {}) {
  const expectedArtifactHash =
    uploadPlan?.uploadArtifactHash ?? uploadPlan?.artifactHash;
  if (
    !uploadPlan ||
    !SHA256_PATTERN.test(uploadPlan.planSha256 ?? "") ||
    !SHA256_PATTERN.test(uploadPlan.artifactHash ?? "") ||
    !SHA256_PATTERN.test(expectedArtifactHash ?? "") ||
    ((Object.hasOwn(uploadPlan, "artifactPurpose") ||
      Object.hasOwn(uploadPlan, "uploadArtifactHash")) &&
      (uploadPlan.releaseMode !== "OPEN_UPDATE" ||
        uploadPlan.artifactPurpose !== "recovery" ||
        !SHA256_PATTERN.test(uploadPlan.uploadArtifactHash ?? "") ||
        uploadPlan.uploadArtifactHash === uploadPlan.artifactHash ||
        artifactManifest?.artifactPurpose !== "recovery")) ||
    !isPlainObject(artifactManifest) ||
    !Array.isArray(artifactManifest.files) ||
    artifactManifest.contentSha256 !== expectedArtifactHash ||
    typeof artifactRoot !== "string" ||
    !path.isAbsolute(artifactRoot)
  ) {
    throw new Error("Bindings del expected upload manifest son inválidos.");
  }
  const candidateConfiguration = readCandidateConfiguration({
    artifactRoot,
    artifactManifest,
  });
  const parts = parseMultipart(multipartSource);
  const metadataPart = parts.find((part) => part.name === "metadata");
  const metadata = parseUploadMetadata(metadataPart, candidateConfiguration);
  const moduleParts = parts.filter((part) => part.name !== "metadata");
  if (
    moduleParts.length === 0 ||
    !moduleParts.some((part) => part.name === metadata.main_module) ||
    moduleParts.some((part) => !MODULE_NAME_PATTERN.test(part.name))
  ) {
    throw new Error(
      "Multipart no contiene el conjunto de módulos/main exacto.",
    );
  }
  const modules = moduleParts
    .map((part) => ({
      name: part.name,
      contentType: part.contentType,
      size: part.content.length,
      sha256: sha256(part.content),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  const assetContentByHash = new Map();
  const assets = {
    ...createAssetInventory({
      artifactRoot,
      artifactManifest,
      assetContentByHash,
    }),
    config: expectedRemoteAssetsConfig(candidateConfiguration),
  };
  const payload = {
    schemaVersion: D72_EXPECTED_UPLOAD_MANIFEST_SCHEMA_VERSION,
    uploadPlanHash: uploadPlan.planSha256,
    expectedArtifactHash,
    mainModule: metadata.main_module,
    metadata: canonicalize(metadata),
    modules,
    assets,
  };
  const manifest = deepFreeze({
    ...payload,
    uploadPayloadHash: sha256(Buffer.from(canonicalJson(payload), "utf8")),
  });
  EXPECTED_UPLOAD_MANIFESTS.set(manifest, {
    assetContentByHash,
    moduleContent: new Map(
      moduleParts.map((part) => [part.name, Buffer.from(part.content)]),
    ),
  });
  return manifest;
}

function canonicalBase64(value, label) {
  if (typeof value !== "string" || value.length > MAX_MULTIPART_BYTES * 2) {
    throw new Error(`${label} no es base64 acotado.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    decoded.fill(0);
    throw new Error(`${label} no usa base64 canónico.`);
  }
  return decoded;
}

class D72AssetUploadValidationError extends Error {}

async function boundedUploadBytes(body, limit) {
  const chunks = [];
  let length = 0;
  const source =
    typeof body === "string" ||
    Buffer.isBuffer(body) ||
    body instanceof Uint8Array
      ? [Buffer.from(body)]
      : body;
  if (
    !source ||
    (typeof source[Symbol.asyncIterator] !== "function" &&
      typeof source[Symbol.iterator] !== "function")
  )
    throw new D72AssetUploadValidationError(
      "Upload body no es un stream acotado.",
    );
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array))
      throw new D72AssetUploadValidationError("Upload chunk inválido.");
    length += chunk.byteLength;
    if (length > limit)
      throw new D72AssetUploadValidationError("Upload body excede el límite.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function assetApiResult(response, body) {
  if (
    ![200, 201].includes(response.status) ||
    !isPlainObject(body) ||
    body.success !== true ||
    !(
      body.errors === null ||
      (Array.isArray(body.errors) && body.errors.length === 0)
    ) ||
    !isPlainObject(body.result)
  ) {
    throw new D72AssetUploadValidationError(
      "Cloudflare no confirmó la operación de assets.",
    );
  }
  return body.result;
}

function assetJwt(value) {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 16 * 1024 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new D72AssetUploadValidationError(
      "Cloudflare devolvió un JWT de assets no canónico.",
    );
  }
  return value;
}

/** Correlates the existing upload over the actual HTTPS transport. Raw JWTs
 * remain private in memory; no caller-supplied transcript can issue evidence.
 * https://developers.cloudflare.com/workers/static-assets/direct-upload/
 */
export function createD72AssetUploadFetchObserver({
  expectedUploadManifest,
  fetchImpl = cloudflareAssetUploadFetch,
  testOnly = false,
  ...unknown
} = {}) {
  const expectedData = EXPECTED_UPLOAD_MANIFESTS.get(expectedUploadManifest);
  if (
    !expectedData ||
    typeof testOnly !== "boolean" ||
    typeof fetchImpl !== "function" ||
    Object.keys(unknown).length ||
    (!testOnly && fetchImpl !== cloudflareAssetUploadFetch) ||
    (testOnly && fetchImpl === cloudflareAssetUploadFetch)
  ) {
    throw new D72AssetUploadValidationError(
      "La observación de assets exige manifest opaco y transporte autorizado.",
    );
  }
  const requested = new Set();
  const acknowledged = new Set();
  const uploading = new Set();
  let buckets = [];
  let phase = "new";
  let sessionJwt = "";
  let completionJwt = "";
  let versionId;
  let versionRequestSha256;
  let completionTokenSha256;
  let failed = false;
  let issued;
  const fail = () => {
    failed = true;
    sessionJwt = "";
    completionJwt = "";
  };
  function validateAsset(hash, bytes) {
    const entry = expectedData.assetContentByHash.get(hash);
    if (
      !entry ||
      !requested.has(hash) ||
      acknowledged.has(hash) ||
      uploading.has(hash) ||
      entry.size !== bytes.length ||
      entry.sha256 !== sha256(bytes)
    )
      throw new D72AssetUploadValidationError(
        "Parte de assets omitida, repetida o distinta de los bytes sellados.",
      );
  }
  async function observedFetch(url, init = {}) {
    if (failed || issued)
      throw new D72AssetUploadValidationError(
        "La observación de upload está cerrada.",
      );
    const method = init.method?.toUpperCase();
    if (
      method === "GET" &&
      typeof url === "string" &&
      url.startsWith("https://api.cloudflare.com/client/v4/")
    )
      return fetchImpl(url, init);
    if (typeof url !== "string" || !url.startsWith(`${ASSET_API_ROOT}/`)) {
      fail();
      throw new D72AssetUploadValidationError(
        "Origen/account de upload incorrectos.",
      );
    }
    const session =
      url === `${ASSET_API_ROOT}/scripts/agorbis/assets-upload-session`;
    const bulk = url === `${ASSET_API_ROOT}/assets/upload?base64=true`;
    const single = new RegExp(
      `^${ASSET_API_ROOT}/assets/upload/([0-9a-f]{32})$`,
    ).exec(url);
    const version =
      url ===
      `${ASSET_API_ROOT}/scripts/agorbis/versions?bindings_inherit=strict`;
    let bytes;
    let parts = [];
    let sentHashes = [];
    try {
      if (method !== "POST" || (!session && !bulk && !single && !version))
        throw new D72AssetUploadValidationError(
          "Método/URI de upload no aprobado.",
        );
      bytes = await boundedUploadBytes(init.body, 128 * 1024 * 1024);
      const headers = new Headers(init.headers);
      if (session && headers.get("content-type") !== "application/json")
        throw new D72AssetUploadValidationError(
          "Content-Type de manifest inválido.",
        );
      if (bulk || version) {
        const boundary = headers
          .get("content-type")
          ?.match(
            /^multipart\/form-data; boundary=(----formdata-undici-[0-9]{12})$/,
          )?.[1];
        if (
          !boundary ||
          !bytes
            .subarray(0, boundary.length + 4)
            .equals(Buffer.from(`--${boundary}\r\n`))
        )
          throw new D72AssetUploadValidationError(
            "Content-Type y boundary del multipart no coinciden.",
          );
      }
      if (session) {
        if (phase !== "new")
          throw new D72AssetUploadValidationError(
            "Sesión de assets duplicada o fuera de orden.",
          );
        const text = bytes.toString("utf8");
        const payload = JSON.parse(text);
        exactKeys(payload, ["manifest"], "Assets session");
        if (
          JSON.stringify(payload) !== text ||
          canonicalJson(payload.manifest) !==
            canonicalJson(expectedUploadManifest.assets.manifest)
        )
          throw new D72AssetUploadValidationError(
            "El manifest enviado está incompleto o difiere del artefacto sellado.",
          );
        phase = "session-pending";
      } else if (bulk || single) {
        if (
          phase !== "uploading" ||
          headers.get("authorization") !== `Bearer ${sessionJwt}`
        )
          throw new D72AssetUploadValidationError(
            "Upload fuera de orden o JWT de otra sesión.",
          );
        if (bulk) {
          parts = parseMultipart(bytes, { assetsOnly: true });
          for (const part of parts) {
            if (!/^[0-9a-f]{32}$/.test(part.name))
              throw new D72AssetUploadValidationError(
                "Hash de parte de assets inválido.",
              );
            const decoded = canonicalBase64(
              part.content.toString("ascii"),
              "Asset upload",
            );
            try {
              validateAsset(part.name, decoded);
            } finally {
              decoded.fill(0);
            }
          }
          sentHashes = parts.map((part) => part.name);
          if (
            !buckets.some(
              (bucket) =>
                canonicalJson([...bucket].sort()) ===
                canonicalJson([...sentHashes].sort()),
            )
          )
            throw new D72AssetUploadValidationError(
              "El multipart no contiene el bucket completo solicitado.",
            );
        } else {
          sentHashes = [single[1]];
          validateAsset(single[1], bytes);
        }
        for (const hash of sentHashes) uploading.add(hash);
      } else {
        if (
          phase !== "uploading" ||
          !completionJwt ||
          uploading.size !== 0 ||
          acknowledged.size !== requested.size
        )
          throw new D72AssetUploadValidationError(
            "Version antes de completar todos los assets.",
          );
        parts = parseMultipart(bytes);
        const metadata = JSON.parse(parts[0].content.toString("utf8"));
        const { assets, ...withoutAssets } = metadata;
        exactKeys(assets, ["config", "jwt"], "Version assets");
        if (
          assets.jwt !== completionJwt ||
          canonicalJson(assets.config) !==
            canonicalJson(expectedUploadManifest.assets.config) ||
          canonicalJson(withoutAssets) !==
            canonicalJson(expectedUploadManifest.metadata)
        )
          throw new D72AssetUploadValidationError(
            "Version usa JWT/configuración de otro upload.",
          );
        const moduleParts = parts.slice(1);
        if (
          moduleParts.length !== expectedData.moduleContent.size ||
          moduleParts.some((part) => {
            const expected = expectedUploadManifest.modules.find(
              (module) => module.name === part.name,
            );
            return (
              !expected ||
              expected.contentType !== part.contentType ||
              !expectedData.moduleContent.get(part.name)?.equals(part.content)
            );
          })
        )
          throw new D72AssetUploadValidationError(
            "El POST Version no conserva todos los módulos sellados.",
          );
        versionRequestSha256 = sha256(bytes);
        phase = "version-pending";
      }
      const response = await fetchImpl(url, { ...init, body: bytes });
      if (!(response instanceof Response) || response.body === null)
        throw new D72AssetUploadValidationError(
          "Respuesta de upload inválida.",
        );
      const responseBytes = await boundedUploadBytes(
        response.clone().body,
        2 * 1024 * 1024,
      );
      let result;
      try {
        result = assetApiResult(
          response,
          JSON.parse(responseBytes.toString("utf8")),
        );
      } finally {
        responseBytes.fill(0);
      }
      if (session) {
        exactKeys(result, ["buckets", "jwt"], "Assets session response");
        if (
          !Array.isArray(result.buckets) ||
          result.buckets.some(
            (bucket) => !Array.isArray(bucket) || bucket.length === 0,
          )
        )
          throw new D72AssetUploadValidationError(
            "Buckets de assets inválidos.",
          );
        buckets = result.buckets;
        for (const hash of buckets.flat()) {
          if (
            !/^[0-9a-f]{32}$/.test(hash) ||
            requested.has(hash) ||
            !expectedData.assetContentByHash.has(hash)
          )
            throw new D72AssetUploadValidationError(
              "Cloudflare pidió un hash repetido o ajeno al manifest.",
            );
          requested.add(hash);
        }
        sessionJwt = assetJwt(result.jwt);
        if (requested.size === 0) completionJwt = sessionJwt;
        phase = "uploading";
      } else if (bulk || single) {
        for (const hash of sentHashes) {
          uploading.delete(hash);
          acknowledged.add(hash);
        }
        if (
          result.jwt !== undefined &&
          result.jwt !== null &&
          result.jwt !== ""
        ) {
          if (response.status !== 201)
            throw new D72AssetUploadValidationError(
              "El JWT final requiere confirmación HTTP 201.",
            );
          const token = assetJwt(result.jwt);
          if (completionJwt && completionJwt !== token)
            throw new D72AssetUploadValidationError(
              "JWT final mezclado entre uploads.",
            );
          completionJwt = token;
        }
      } else {
        if (!VERSION_ID_PATTERN.test(result.id ?? ""))
          throw new D72AssetUploadValidationError(
            "El POST no confirmó una Version válida.",
          );
        versionId = result.id;
        completionTokenSha256 = sha256(Buffer.from(completionJwt));
        sessionJwt = "";
        completionJwt = "";
        phase = "complete";
      }
      return response;
    } catch (error) {
      fail();
      throw new D72AssetUploadValidationError(
        error instanceof D72AssetUploadValidationError &&
          !/JWT|token/i.test(error.message)
          ? error.message
          : "Cadena de assets inválida (JWT saneado).",
      );
    } finally {
      bytes?.fill(0);
      for (const part of parts) part.content.fill(0);
    }
  }
  function receipt() {
    if (issued) return issued;
    if (failed || phase !== "complete" || acknowledged.size !== requested.size)
      throw new D72AssetUploadValidationError(
        "La cadena de upload de assets está incompleta.",
      );
    const payload = {
      schemaVersion: "agorbis-d72-assets-upload-observation/v1",
      candidateVersionId: versionId,
      uploadPayloadHash: expectedUploadManifest.uploadPayloadHash,
      assetManifestSha256: expectedUploadManifest.assets.manifestSha256,
      completionTokenSha256,
      versionRequestSha256,
      assetCount: Object.keys(expectedUploadManifest.assets.manifest).length,
      requestedHashCount: requested.size,
      uploadedHashCount: acknowledged.size,
    };
    issued = deepFreeze({
      ...payload,
      contentSha256: sha256(Buffer.from(canonicalJson(payload))),
    });
    ASSET_UPLOAD_OBSERVATIONS.set(issued, { expectedUploadManifest, testOnly });
    return issued;
  }
  return Object.freeze({ fetch: observedFetch, receipt });
}

function normalizedBindingSet(bindings, { local = false } = {}) {
  if (!Array.isArray(bindings) || bindings.length > MAX_BINDINGS) {
    throw new Error("Bindings beta/locales deben ser un array acotado.");
  }
  const names = new Set();
  const normalized = bindings.map((binding, index) => {
    if (!isPlainObject(binding) || typeof binding.name !== "string") {
      throw new Error(`Binding[${index}] no es canónico.`);
    }
    if (
      !/^[A-Z][A-Z0-9_]{0,127}$/.test(binding.name) ||
      names.has(binding.name)
    ) {
      throw new Error(`Binding[${index}] usa nombre inválido/duplicado.`);
    }
    names.add(binding.name);
    if (binding.type === "plain_text") {
      exactKeys(binding, ["name", "text", "type"], `Binding[${index}]`);
      if (typeof binding.text !== "string" || binding.text.length > 8_192) {
        throw new Error(`Binding[${index}] plaintext inválido.`);
      }
      return { name: binding.name, text: binding.text, type: "plain_text" };
    }
    if (binding.type === "assets") {
      exactKeys(binding, ["name", "type"], `Binding[${index}]`);
      return { name: binding.name, type: "assets" };
    }
    if (
      (local && binding.type === "inherit") ||
      (!local && binding.type === "secret_text")
    ) {
      exactKeys(binding, ["name", "type"], `Binding[${index}]`);
      if (!REQUIRED_SECRET_NAMES.includes(binding.name)) {
        throw new Error(
          `Binding secret/inherit ${binding.name} no está aprobado.`,
        );
      }
      return { name: binding.name, type: "secret_text" };
    }
    throw new Error(`Binding[${index}] usa tipo desconocido.`);
  });
  normalized.sort((left, right) => left.name.localeCompare(right.name, "en"));
  return normalized;
}

function validateDescriptiveUrls(urls) {
  const values = Array.isArray(urls)
    ? urls
    : isPlainObject(urls)
      ? Object.values(urls)
      : null;
  if (
    !values ||
    values.length > 16 ||
    values.some(
      (value) =>
        value !== null &&
        (typeof value !== "string" ||
          value.length > 2_048 ||
          !value.startsWith("https://")),
    )
  ) {
    throw new Error("GET beta urls descriptivas no son canónicas.");
  }
}

function isCanonicalEmpty(value) {
  return (
    value === null ||
    (Array.isArray(value) && value.length === 0) ||
    (isPlainObject(value) && Object.keys(value).length === 0)
  );
}

function validatePackageDependencies(remote, expected) {
  if (Object.hasOwn(expected, "package_dependencies")) {
    if (
      !Object.hasOwn(remote, "package_dependencies") ||
      canonicalJson(
        normalizedPackageDependencies(
          remote.package_dependencies,
          "GET beta package_dependencies",
        ),
      ) !==
        canonicalJson(
          normalizedPackageDependencies(
            expected.package_dependencies,
            "Metadata dry-run package_dependencies",
          ),
        )
    ) {
      throw new Error(
        "GET beta package_dependencies no coincide exactamente con metadata local.",
      );
    }
    return;
  }
  if (Object.hasOwn(remote, "package_dependencies")) {
    const dependencies = normalizedPackageDependencies(
      remote.package_dependencies,
      "GET beta package_dependencies",
    );
    if (dependencies.length !== 0) {
      throw new Error(
        "GET beta agregó package_dependencies no presentes en metadata local.",
      );
    }
  }
}

export function verifyD72RemoteVersionArtifact({
  expectedUploadManifest,
  candidateVersionId,
  stableScriptEtag,
  betaGet,
  assetUploadObservation,
  allowTestOnlyUploadEvidence = false,
} = {}) {
  const expectedData = EXPECTED_UPLOAD_MANIFESTS.get(expectedUploadManifest);
  if (!expectedData) {
    throw new Error(
      "Expected upload manifest debe ser opaco y local al proceso.",
    );
  }
  if (
    !VERSION_ID_PATTERN.test(candidateVersionId ?? "") ||
    !SHA256_PATTERN.test(stableScriptEtag ?? "")
  ) {
    throw new Error("Version ID/ETag estable inválidos.");
  }
  exactKeys(betaGet, ["body", "endpoint", "method", "status"], "GET beta");
  const expectedEndpoint = `/accounts/4d78fb10c1ae65281ec851479d5045dc/workers/workers/agorbis/versions/${candidateVersionId}?include=modules`;
  if (
    betaGet.method !== "GET" ||
    betaGet.status !== 200 ||
    betaGet.endpoint !== expectedEndpoint
  ) {
    throw new Error("GET beta no usa Version/include=modules exactos.");
  }
  exactKeys(
    betaGet.body,
    ["errors", "messages", "result", "success"],
    "GET beta envelope",
  );
  if (
    betaGet.body.success !== true ||
    !Array.isArray(betaGet.body.errors) ||
    betaGet.body.errors.length !== 0 ||
    !Array.isArray(betaGet.body.messages) ||
    betaGet.body.messages.length !== 0
  ) {
    throw new Error("GET beta no fue exitoso/limpio.");
  }
  const result = betaGet.body.result;
  allowedKeys(
    result,
    [
      "annotations",
      "assets",
      "bindings",
      "compatibility_date",
      "compatibility_flags",
      "created_on",
      "id",
      "main_module",
      "modules",
      "number",
      "urls",
    ],
    [
      "cache_options",
      "containers",
      "exports",
      "exports_reconciliation",
      "limits",
      "logpush",
      "migration_tag",
      "migrations",
      "observability",
      "package_dependencies",
      "placement",
      "source",
      "startup_time_ms",
      "tail_consumers",
      "usage_model",
    ],
    "GET beta result",
  );
  if (
    result.id !== candidateVersionId ||
    result.main_module !== expectedUploadManifest.mainModule ||
    canonicalJson(normalizedBindingSet(result.bindings)) !==
      canonicalJson(
        normalizedBindingSet(expectedUploadManifest.metadata.bindings, {
          local: true,
        }),
      )
  ) {
    throw new Error("GET beta no conserva Version/main/bindings sellados.");
  }
  if (
    result.compatibility_date !==
      expectedUploadManifest.metadata.compatibility_date ||
    canonicalJson(result.compatibility_flags) !==
      canonicalJson(expectedUploadManifest.metadata.compatibility_flags) ||
    (Object.hasOwn(expectedUploadManifest.metadata, "limits") &&
      canonicalJson(result.limits) !==
        canonicalJson(expectedUploadManifest.metadata.limits)) ||
    !isPlainObject(result.annotations) ||
    result.annotations["workers/message"] !==
      expectedUploadManifest.metadata.annotations?.["workers/message"] ||
    result.annotations["workers/tag"] !==
      expectedUploadManifest.metadata.annotations?.["workers/tag"] ||
    Object.keys(result.annotations).some(
      (key) =>
        !["workers/message", "workers/tag", "workers/triggered_by"].includes(
          key,
        ),
    ) ||
    (Object.hasOwn(result.annotations, "workers/triggered_by") &&
      !["upload", "wrangler"].includes(
        result.annotations["workers/triggered_by"],
      ))
  ) {
    throw new Error("GET beta config no coincide con metadata local sellada.");
  }
  validatePackageDependencies(result, expectedUploadManifest.metadata);
  if (
    (Object.hasOwn(result, "source") &&
      !["upload", "wrangler"].includes(result.source)) ||
    (Object.hasOwn(result, "startup_time_ms") &&
      (typeof result.startup_time_ms !== "number" ||
        !Number.isFinite(result.startup_time_ms) ||
        result.startup_time_ms < 0)) ||
    (Object.hasOwn(result, "cache_options") &&
      !isCanonicalEmpty(result.cache_options)) ||
    (Object.hasOwn(result, "containers") &&
      !isCanonicalEmpty(result.containers)) ||
    (Object.hasOwn(result, "exports") && !isCanonicalEmpty(result.exports)) ||
    (Object.hasOwn(result, "exports_reconciliation") &&
      !isCanonicalEmpty(result.exports_reconciliation)) ||
    (Object.hasOwn(result, "migration_tag") &&
      result.migration_tag !== null &&
      result.migration_tag !== "") ||
    (Object.hasOwn(result, "logpush") && result.logpush !== false) ||
    (Object.hasOwn(result, "migrations") &&
      result.migrations !== null &&
      (!Array.isArray(result.migrations) || result.migrations.length !== 0)) ||
    (Object.hasOwn(result, "placement") &&
      (!isPlainObject(result.placement) ||
        Object.keys(result.placement).length !== 0)) ||
    (Object.hasOwn(result, "tail_consumers") &&
      result.tail_consumers !== null &&
      (!Array.isArray(result.tail_consumers) ||
        result.tail_consumers.length !== 0)) ||
    (Object.hasOwn(result, "usage_model") &&
      result.usage_model !== "standard") ||
    (Object.hasOwn(result, "observability") &&
      result.observability !== null &&
      (!isPlainObject(result.observability) ||
        Object.keys(result.observability).length !== 0))
  ) {
    throw new Error("GET beta contiene configuración opcional no aprobada.");
  }
  if (
    typeof result.created_on !== "string" ||
    !Number.isFinite(new Date(result.created_on).getTime()) ||
    !Number.isSafeInteger(result.number) ||
    result.number < 1
  ) {
    throw new Error("GET beta contiene campos descriptivos inválidos.");
  }
  validateDescriptiveUrls(result.urls);
  if (
    !Array.isArray(result.modules) ||
    result.modules.length === 0 ||
    result.modules.length >= MAX_MULTIPART_PARTS
  ) {
    throw new Error("GET beta no devolvió modules.");
  }
  const remoteModules = [];
  const remoteModuleNames = new Set();
  for (const remote of result.modules) {
    exactKeys(
      remote,
      ["content_base64", "content_type", "name"],
      "GET beta module",
    );
    if (
      !MODULE_NAME_PATTERN.test(remote.name ?? "") ||
      !CONTENT_TYPE_PATTERN.test(remote.content_type ?? "") ||
      remoteModuleNames.has(remote.name)
    ) {
      throw new Error("GET beta contiene módulo inválido/duplicado.");
    }
    remoteModuleNames.add(remote.name);
    const content = canonicalBase64(
      remote.content_base64,
      `GET beta module ${remote.name}`,
    );
    remoteModules.push({
      name: remote.name,
      contentType: remote.content_type,
      size: content.length,
      sha256: sha256(content),
    });
    const expectedContent = expectedData.moduleContent.get(remote.name);
    const equal =
      expectedContent !== undefined && expectedContent.compare(content) === 0;
    content.fill(0);
    if (!equal)
      throw new Error(`Módulo remoto ${remote.name} no coincide byte a byte.`);
  }
  remoteModules.sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  );
  if (
    canonicalJson(remoteModules) !==
    canonicalJson(expectedUploadManifest.modules)
  ) {
    throw new Error("Inventario remoto de módulos no coincide exactamente.");
  }
  exactKeys(result.assets, ["config", "jwt"], "GET beta assets");
  if (
    !isPlainObject(result.assets.config) ||
    canonicalJson(result.assets.config) !==
      canonicalJson(expectedUploadManifest.assets.config) ||
    typeof result.assets.jwt !== "string" ||
    result.assets.jwt.length < 16 ||
    result.assets.jwt.length > 16 * 1024 ||
    result.assets.jwt.split(".").length !== 3
  ) {
    throw new Error(
      "GET beta assets.config no coincide exactamente con wrangler.jsonc candidato o JWT no es canónico.",
    );
  }
  let assetObservationHash;
  if (assetUploadObservation !== undefined) {
    const observed = ASSET_UPLOAD_OBSERVATIONS.get(assetUploadObservation);
    if (
      !observed ||
      observed.expectedUploadManifest !== expectedUploadManifest ||
      typeof allowTestOnlyUploadEvidence !== "boolean" ||
      (observed.testOnly && !allowTestOnlyUploadEvidence) ||
      assetUploadObservation.candidateVersionId !== candidateVersionId ||
      assetUploadObservation.completionTokenSha256 !==
        sha256(Buffer.from(result.assets.jwt)) ||
      assetUploadObservation.assetManifestSha256 !==
        expectedUploadManifest.assets.manifestSha256
    ) {
      throw new Error(
        "El GET no corresponde a la observación opaca del manifest/JWT/Version del upload.",
      );
    }
    assetObservationHash = assetUploadObservation.contentSha256;
  }
  const staticAssetsVerified = assetObservationHash !== undefined;
  const proofPayload = {
    schemaVersion: D72_REMOTE_ARTIFACT_PROOF_SCHEMA_VERSION,
    candidateVersionId,
    uploadPayloadHash: expectedUploadManifest.uploadPayloadHash,
    remoteScriptEtag: stableScriptEtag,
    expectedAssetManifestSha256: expectedUploadManifest.assets.manifestSha256,
    staticAssetsVerified,
    staticAssetsBlocker: staticAssetsVerified
      ? null
      : D72_STATIC_ASSET_PROOF_BLOCKER,
    ...(staticAssetsVerified
      ? { assetUploadObservationSha256: assetObservationHash }
      : {}),
  };
  const proof = deepFreeze({
    ...proofPayload,
    proofHash: sha256(Buffer.from(canonicalJson(proofPayload), "utf8")),
  });
  REMOTE_ARTIFACT_PROOFS.set(proof, {
    expectedUploadManifest,
    testOnly:
      ASSET_UPLOAD_OBSERVATIONS.get(assetUploadObservation)?.testOnly ?? false,
  });
  return proof;
}

export function assertD72RemoteArtifactProof(
  proof,
  {
    expectedUploadManifest,
    candidateVersionId,
    stableScriptEtag,
    allowTestOnly = false,
  } = {},
) {
  const data = REMOTE_ARTIFACT_PROOFS.get(proof);
  if (
    !data ||
    (data.testOnly && !allowTestOnly) ||
    data.expectedUploadManifest !== expectedUploadManifest ||
    proof.candidateVersionId !== candidateVersionId ||
    proof.remoteScriptEtag !== stableScriptEtag ||
    proof.uploadPayloadHash !== expectedUploadManifest?.uploadPayloadHash
  ) {
    throw new Error(
      "La prueba remota debe ser opaca y corresponder al payload exacto.",
    );
  }
  return proof;
}
