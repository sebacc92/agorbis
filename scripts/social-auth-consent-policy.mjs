import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Cobertura revisada del snapshot que registra el consentimiento actual.
// Agregar una versión o cambiar un hash no aprueba por sí solo un proveedor:
// una futura cobertura debe revisarse junto con su flujo, texto y migración.
const REVIEWED_TRANSFER_CONSENT_SCOPES = Object.freeze([
  Object.freeze({
    version: "2026-08-29.1",
    contentHash:
      "052a72a73375da6930313cbc9f2736f8b63f0ad321342b9fdd66f727a34a1baa",
    migration: "0060_activate_pending_external_evidence_legal_notices.sql",
    providers: Object.freeze([]),
    reasons: Object.freeze({
      GOOGLE:
        "El aviso general excluye Google; la cobertura requiere verificar el aviso específico aprobado mediante 0067 y su migración exacta.",
      FACEBOOK:
        "El aviso no incluye Facebook; falta una decisión separada o una nueva versión con cobertura revisada.",
    }),
  }),
]);

// Aprobación específica del responsable, registrada con su texto y alcance.
// No se carga este registro desde archivos/env vars ni se aprueba por un caller.
// La migración exacta y el hash PostgreSQL deben coincidir con la revisión.
const REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES = Object.freeze([
  Object.freeze({
    provider: "google",
    version: "2026-09-09.1",
    contentHash:
      "b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3",
    contentHashAlgorithm: "sha256-postgres-jsonb-v1",
    migration: "0067_activate_google_auth_notice.sql",
    migrationSha256:
      "53366220f1cdc50d41ea6854c62c5f1519973b23d0b36d19fe74c1546763db44",
    effectiveAt: "2026-09-09T03:54:54.000Z",
    approvedAt: "2026-09-09T03:54:54.000Z",
    approvalReference: "docs/google-notice-owner-approval-2026-09-09.md",
  }),
]);

const GOOGLE_MANIFEST_KEYS = Object.freeze([
  "provider",
  "version",
  "contentHash",
  "contentHashAlgorithm",
  "migration",
  "migrationSha256",
  "effectiveAt",
  "approvedAt",
  "approvalReference",
]);

function googleArtifactError(reason) {
  throw new Error(`Aviso Google separado no verificable: ${reason}.`);
}

function nonemptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function bilingualGoogleSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return false;
  if (Object.keys(snapshot).sort().join(",") !== "en,es") return false;
  return [snapshot.es, snapshot.en].every(
    (document) =>
      document &&
      typeof document === "object" &&
      !Array.isArray(document) &&
      nonemptyText(document.title) &&
      nonemptyText(document.summary) &&
      Array.isArray(document.sections) &&
      document.sections.length > 0 &&
      document.sections.every(
        (section) =>
          section &&
          typeof section === "object" &&
          !Array.isArray(section) &&
          nonemptyText(section.title) &&
          [section.paragraphs, section.bullets].some(
            (items) => Array.isArray(items) && items.length > 0,
          ) &&
          [section.paragraphs, section.bullets].every(
            (items) =>
              items === undefined ||
              (Array.isArray(items) && items.every(nonemptyText)),
          ),
      ),
  );
}

// Separa sentencias sin interpretar SQL ni ejecutar nada. Un INSERT mencionado
// en un comentario, literal o cuerpo DO/función no es una activación top-level.
function sqlStatements(source) {
  const statements = [];
  let statement = "";
  for (let index = 0; index < source.length;) {
    if (source.startsWith("--", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end + 1;
      statement += " ";
    } else if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth) {
        if (source.startsWith("/*", index)) {
          depth++;
          index += 2;
        } else if (source.startsWith("*/", index)) {
          depth--;
          index += 2;
        } else index++;
      }
      if (depth) googleArtifactError("comentario SQL incompleto");
      statement += " ";
    } else if (source[index] === "'" || source[index] === '"') {
      const quote = source[index];
      const start = index++;
      let closed = false;
      while (index < source.length) {
        if (source[index++] !== quote) continue;
        if (source[index] === quote) index++;
        else {
          closed = true;
          break;
        }
      }
      if (!closed) googleArtifactError("literal SQL incompleto");
      statement += source.slice(start, index);
    } else if (source[index] === "$") {
      const delimiter = source
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (!delimiter) {
        statement += source[index++];
        continue;
      }
      const end = source.indexOf(delimiter, index + delimiter.length);
      if (end < 0) googleArtifactError("bloque SQL incompleto");
      statement += source.slice(index, end + delimiter.length);
      index = end + delimiter.length;
    } else if (source[index] === ";") {
      if (statement.trim()) statements.push(statement.trim());
      statement = "";
      index++;
    } else statement += source[index++];
  }
  if (statement.trim()) googleArtifactError("sentencia SQL sin terminador");
  return statements;
}

/**
 * Comprueba un artefacto frente a un manifiesto; NO concede cobertura OAuth.
 * La única autoridad de cobertura es REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES.
 *
 * Formato de futura activación admitido (orden y literales obligatorios):
 * INSERT INTO public.google_auth_notice_versions
 *   (provider, version, content_hash, content_hash_algorithm, content_snapshot,
 *    effective_at, approved_at, approval_reference, is_current)
 * VALUES ('google', '<version>', '<hash obtenido de PostgreSQL>',
 *   'sha256-postgres-jsonb-v1', $google_auth_notice$<JSON es/en>$google_auth_notice$::jsonb,
 *   '<ISO UTC>'::timestamptz, '<ISO UTC>'::timestamptz, '<referencia>', true);
 *
 * El SHA-256 de TODOS los bytes SQL fija snapshot, instrucciones y aprobación.
 * contentHash es el digest revisado de content_snapshot::text en PostgreSQL:
 * aquí sólo se compara el literal fijado; nunca se recalcula mediante JSON JS.
 * El constraint de 0066 debe verificar su correspondencia al aplicar en DB.
 */
export function verifyGoogleAuthConsentArtifact(
  manifest,
  { root = repositoryRoot } = {},
) {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    Object.keys(manifest).sort().join(",") !==
      [...GOOGLE_MANIFEST_KEYS].sort().join(",") ||
    !GOOGLE_MANIFEST_KEYS.every((key) => typeof manifest[key] === "string") ||
    manifest.provider !== "google" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(manifest.version ?? "") ||
    !/^[a-f0-9]{64}$/.test(manifest.contentHash ?? "") ||
    manifest.contentHashAlgorithm !== "sha256-postgres-jsonb-v1" ||
    !/^\d{4}_[A-Za-z0-9_-]+\.sql$/.test(manifest.migration ?? "") ||
    Number(manifest.migration.slice(0, 4)) <= 66 ||
    !/^[a-f0-9]{64}$/.test(manifest.migrationSha256 ?? "") ||
    !nonemptyText(manifest.approvalReference) ||
    manifest.approvalReference.trim().length < 10 ||
    manifest.approvalReference.length > 500
  )
    googleArtifactError("manifiesto de revisión incompleto o inválido");
  for (const field of ["approvedAt", "effectiveAt"]) {
    const value = manifest[field];
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value ||
      Date.parse(value) > Date.now()
    )
      googleArtifactError("aprobación o vigencia ausente, inválida o futura");
  }
  if (Date.parse(manifest.approvedAt) > Date.parse(manifest.effectiveAt))
    googleArtifactError("la aprobación es posterior a la vigencia");

  const supabaseDirectory = path.join(root, "supabase");
  const directory = path.join(supabaseDirectory, "migrations");
  const migrationPath = path.join(directory, manifest.migration);
  for (const directoryPath of [root, supabaseDirectory, directory]) {
    if (!lstatSync(directoryPath).isDirectory())
      googleArtifactError("directorio de migraciones no regular");
  }
  if (!lstatSync(migrationPath).isFile())
    googleArtifactError("la migración no es un archivo regular");
  const sourceBytes = readFileSync(migrationPath);
  const migrationSha256 = createHash("sha256")
    .update(sourceBytes)
    .digest("hex");
  if (migrationSha256 !== manifest.migrationSha256)
    googleArtifactError("el SHA-256 completo de la migración no coincide");
  const statements = sqlStatements(sourceBytes.toString("utf8"));
  const insertPattern =
    /^insert\s+into\s+public\.google_auth_notice_versions\s*\(\s*provider\s*,\s*version\s*,\s*content_hash\s*,\s*content_hash_algorithm\s*,\s*content_snapshot\s*,\s*effective_at\s*,\s*approved_at\s*,\s*approval_reference\s*,\s*is_current\s*\)\s*values\s*\(\s*'google'\s*,\s*'([^']+)'\s*,\s*'([a-f0-9]{64})'\s*,\s*'sha256-postgres-jsonb-v1'\s*,\s*\$google_auth_notice\$([\s\S]*?)\$google_auth_notice\$::jsonb\s*,\s*'([^']+)'::timestamptz\s*,\s*'([^']+)'::timestamptz\s*,\s*'((?:[^']|'')*)'\s*,\s*true\s*\)$/i;
  const inserts = statements.filter((statement) =>
    /^insert\s+into\s+(?:"?public"?\s*\.\s*)?"?google_auth_notice_versions"?\b/i.test(
      statement,
    ),
  );
  const insert = inserts.length === 1 ? inserts[0].match(insertPattern) : null;
  if (!insert)
    googleArtifactError(
      "se requiere un único INSERT aprobado en formato estricto",
    );
  const [, version, contentHash, json, effectiveAt, approvedAt, rawReference] =
    insert;
  if (
    version !== manifest.version ||
    contentHash !== manifest.contentHash ||
    effectiveAt !== manifest.effectiveAt ||
    approvedAt !== manifest.approvedAt ||
    rawReference.replaceAll("''", "'") !== manifest.approvalReference
  )
    googleArtifactError("el INSERT no coincide con la revisión fijada");
  let snapshot;
  try {
    snapshot = JSON.parse(json);
  } catch {
    googleArtifactError("snapshot JSON inválido");
  }
  if (!bilingualGoogleSnapshot(snapshot))
    googleArtifactError("snapshot ES/EN incompleto o inválido");
  // Una migración posterior que toque este objeto requiere otra revisión;
  // jamás presumir que la fila sigue vigente después de SQL no revisado.
  for (const later of readdirSync(directory).filter(
    (name) =>
      /^\d{4}_.+\.sql$/.test(name) &&
      Number(name.slice(0, 4)) >= Number(manifest.migration.slice(0, 4)) &&
      name !== manifest.migration,
  )) {
    const laterPath = path.join(directory, later);
    if (!lstatSync(laterPath).isFile())
      googleArtifactError("migración posterior no regular");
    if (/google_auth_notice_versions/i.test(readFileSync(laterPath, "utf8")))
      googleArtifactError(
        "existe una modificación posterior sin revisión fijada",
      );
  }
  return Object.freeze({
    status: "artifact_matches_manifest",
    provider: "google",
    version,
    contentHash,
    migration: manifest.migration,
    migrationSha256,
    coverageApproved: false,
    databaseContentHashVerified: false,
  });
}

function reviewedGoogleAuthCoverage(root) {
  if (REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES.length === 0) return false;
  if (!REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES.every(Object.isFrozen))
    googleArtifactError("el registro revisado debe ser inmutable");
  const records = [...REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES].sort((a, b) =>
    b.migration.localeCompare(a.migration),
  );
  verifyGoogleAuthConsentArtifact(records[0], { root });
  return true;
}

export function readCurrentTransferConsentSnapshot(root = repositoryRoot) {
  const versions = readFileSync(path.join(root, "src/lib/legal.ts"), "utf8");
  const version = versions.match(
    /export\s+const\s+INTERNATIONAL_TRANSFER_NOTICE_VERSION\s*=\s*["']([^"']+)["']/,
  )?.[1];
  if (!version)
    throw new Error("No se encontró la versión del consentimiento vigente.");
  const snapshots = [];
  const directory = path.join(root, "supabase/migrations");
  for (const migration of readdirSync(directory).filter((name) =>
    /^\d{4}_.+\.sql$/.test(name),
  )) {
    const source = readFileSync(path.join(directory, migration), "utf8");
    const pattern =
      /insert\s+into\s+public\.international_transfer_notice_versions\s*\([^;]+?\)\s*values\s*\(\s*'([^']+)'\s*,\s*'([a-f0-9]{64})'\s*,\s*\$([A-Za-z_][A-Za-z0-9_]*)\$([\s\S]*?)\$\3\$::jsonb\s*,\s*'sha256-json-stringify-v1'/gi;
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== version) continue;
      const snapshot = JSON.parse(match[4]);
      const contentHash = createHash("sha256")
        .update(JSON.stringify(snapshot), "utf8")
        .digest("hex");
      if (contentHash !== match[2])
        throw new Error(
          "El snapshot del consentimiento no coincide con su SHA-256.",
        );
      snapshots.push({ version, contentHash, migration });
    }
  }
  if (snapshots.length !== 1)
    throw new Error(
      "El consentimiento vigente requiere un único snapshot SQL verificable.",
    );
  return snapshots[0];
}

export function socialAuthConsentBlockers(
  environment,
  { root = repositoryRoot } = {},
) {
  const enabledProviders = ["GOOGLE", "FACEBOOK"].filter(
    (provider) => environment[`PUBLIC_${provider}_AUTH_ENABLED`] === "true",
  );
  if (enabledProviders.length === 0) return [];
  let snapshot;
  try {
    snapshot = readCurrentTransferConsentSnapshot(root);
  } catch (error) {
    return [
      `Consentimiento OAuth bloqueado: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const coverage = REVIEWED_TRANSFER_CONSENT_SCOPES.find(
    (record) =>
      record.version === snapshot.version &&
      record.contentHash === snapshot.contentHash &&
      record.migration === snapshot.migration,
  );
  let googleCoverage = false;
  let googleArtifactFailure = "";
  if (enabledProviders.includes("GOOGLE") && coverage) {
    try {
      googleCoverage = reviewedGoogleAuthCoverage(root);
    } catch (error) {
      googleArtifactFailure = ` ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return enabledProviders
    .filter((provider) =>
      provider === "GOOGLE"
        ? !googleCoverage
        : !coverage?.providers.includes(provider),
    )
    .map(
      (provider) =>
        `PUBLIC_${provider}_AUTH_ENABLED: consentimiento OAuth bloqueado para ${provider === "GOOGLE" ? "Google" : "Facebook"}; aviso ${snapshot.version}, SHA-256 ${snapshot.contentHash}. ${coverage?.reasons[provider] ?? "Este snapshot no tiene cobertura de proveedores revisada; cambiar sólo la versión no habilita OAuth."}${provider === "GOOGLE" ? googleArtifactFailure : ""}`,
    );
}
