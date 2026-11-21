import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const historicalActivationPolicyVersion = "D72/2026-08-29/v2";
const historicalActivationPolicySha256 =
  "c5116a8f4450b2340f5fd30d4c74ce4badb8ee5782c5cb9b1bc2b87ffe937ebd";
const manifestPath = path.join(
  root,
  "docs/legal-drafts/2026-08-29-pending-external-evidence.json",
);
const activationPath = path.join(
  root,
  "docs/legal-activations/2026-08-29-pending-external-evidence.json",
);
const contentPath = path.join(root, "src/lib/legal-content.ts");
const versionsPath = path.join(root, "src/lib/legal.ts");
const migrationsDirectory = path.join(root, "supabase/migrations");
const preparedMigrationPath = path.join(
  migrationsDirectory,
  "0060_activate_pending_external_evidence_legal_notices.sql",
);
const e2eSmokePath = path.join(root, "e2e/smoke.spec.ts");

const sha256 = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");
const contentHash = (value) => sha256(JSON.stringify(value));

const readLegalContent = async () => {
  const source = fs.readFileSync(contentPath, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: contentPath,
  }).outputText;

  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
};

const decodePointerSegment = (segment) =>
  segment.replaceAll("~1", "/").replaceAll("~0", "~");

const validatePatchOperation = (operation) => {
  assert.equal(typeof operation.path, "string");
  assert.match(operation.path, /^\/(?:es|en)\//);
  assert.equal(typeof operation.value, "string");
  assert.equal(operation.value, operation.value.trim());
  assert.ok(operation.value.length >= 20);
  assert.doesNotMatch(
    operation.value,
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/,
  );
};

const pointerValue = (document, pointer) => {
  const segments = pointer.slice(1).split("/").map(decodePointerSegment);
  let target = document;
  for (const segment of segments) {
    assert.ok(target !== null && typeof target === "object");
    assert.ok(Object.hasOwn(target, segment), `Ruta desconocida: ${pointer}`);
    target = target[segment];
  }
  return target;
};

const sourceVersion = (versionsSource, constantName) => {
  const match = versionsSource.match(
    new RegExp(`export\\s+const\\s+${constantName}\\s*=\\s*["']([^"']+)["']`),
  );
  assert.ok(match, `No se encontró ${constantName}.`);
  return match[1];
};

const expectedDocuments = new Map([
  [
    "privacy",
    {
      contentExport: "privacyContent",
      versionConstant: "PRIVACY_VERSION",
      minimumPatches: 18,
    },
  ],
  [
    "international_transfer_notice",
    {
      contentExport: "internationalTransferNoticeContent",
      versionConstant: "INTERNATIONAL_TRANSFER_NOTICE_VERSION",
      minimumPatches: 20,
    },
  ],
]);

// Versiones posteriores al acta del 29-08 que la reemplazan para un solo
// documento. Cada una exige su migración, que retire exactamente la versión y
// el hash preparados, y conserva los parches honestos del acta (D109).
const SUPERSEDING_VERSIONS = new Map([
  [
    "privacy",
    {
      version: "2026-11-02.1",
      migration: "0073_turnstile_invisible_privacy_addendum.sql",
    },
  ],
]);

const expectedRiskGateIds = [
  "privacy.retention-unreconciled",
  "privacy.provider-locations-unverified",
  "privacy.provider-retention-unverified",
  "legal.transfer-safeguards-unverified",
  "legal.sensitive-consent-0059-omitted",
];
const expectedEmptyPublicVariables = [
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
  "PUBLIC_SUPABASE_PROCESSING_LOCATION",
  "PUBLIC_SUPABASE_PROCESSING_LOCATION_EN",
  "PUBLIC_RESEND_PROCESSING_LOCATION",
  "PUBLIC_RESEND_PROCESSING_LOCATION_EN",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
  "PUBLIC_TRANSFER_SAFEGUARDS",
  "PUBLIC_TRANSFER_SAFEGUARDS_EN",
];

const manifestSource = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestSource);
assert.equal(manifest.schemaVersion, "agorbis.legal-draft.v1");
assert.equal(manifest.status, "draft_not_active");
assert.equal(manifest.createdAt, "2026-08-29");
assert.equal(manifest.legalConclusion, "none");
assert.equal(manifest.deploymentAuthorized, false);
assert.equal(manifest.hashAlgorithm, "sha256-json-stringify-v1");
assert.deepEqual(manifest.relatedRiskGateIds, expectedRiskGateIds);
assert.ok(Array.isArray(manifest.activationRequirements));
assert.equal(manifest.activationRequirements.length, 4);
assert.ok(
  manifest.activationRequirements.some((requirement) =>
    requirement.includes("not a legal-compliance conclusion"),
  ),
);

const activation = JSON.parse(fs.readFileSync(activationPath, "utf8"));
assert.equal(activation.schemaVersion, "agorbis.legal-activation.v1");
assert.equal(activation.status, "applied_verified");
assert.match(activation.preparedFromHead, /^[0-9a-f]{40}$/);
assert.equal(
  activation.preparedFromHeadRole,
  "base_head_before_this_activation_commit",
);
assert.equal(activation.decision, "D72");
assert.equal(activation.policyVersion, historicalActivationPolicyVersion);
assert.equal(activation.policyHash, historicalActivationPolicySha256);
assert.equal(activation.legalConclusion, "none");
assert.equal(activation.deploymentAuthorized, false);
assert.equal(activation.repositoryContentActivated, true);
assert.equal(activation.productionMigrationApplied, true);
assert.equal(
  activation.sourceDraft.path,
  "docs/legal-drafts/2026-08-29-pending-external-evidence.json",
);
assert.equal(activation.sourceDraft.sha256, sha256(manifestSource));
assert.equal(activation.sourceDraft.status, "draft_not_active");
assert.equal(activation.preparedMigration.id, "0060");
assert.equal(
  activation.preparedMigration.path,
  "supabase/migrations/0060_activate_pending_external_evidence_legal_notices.sql",
);
assert.equal(
  activation.preparedMigration.sha256,
  sha256(fs.readFileSync(preparedMigrationPath, "utf8")),
);
assert.equal(activation.preparedMigration.applied, true);
assert.equal(activation.preparedMigration.containsAcceptanceBackfill, false);
assert.equal(activation.preparedMigration.appliesSensitiveConsent0059, false);
assert.deepEqual(activation.aaipDatabaseRegistration, {
  status: "pending",
  registrationId: "",
  evidenceStatus: "BLOCKED_EXTERNAL",
});
assert.ok(
  Object.values(activation.externalEvidence).every((value) => value === false),
);
assert.deepEqual(
  activation.requiredEmptyPublicVariables,
  expectedEmptyPublicVariables,
);
assert.ok(
  activation.warnings.some((warning) =>
    warning.includes("must not be described as legally compliant"),
  ),
);

const versionsSource = fs.readFileSync(versionsPath, "utf8");
const e2eSmokeSource = fs.readFileSync(e2eSmokePath, "utf8");
const migrations = fs
  .readdirSync(migrationsDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationsDirectory, name), "utf8"))
  .join("\n");
const preparedMigration = fs.readFileSync(preparedMigrationPath, "utf8");
assert.match(
  e2eSmokeSource,
  /p_version:\s*["']2026-08-29\.1["']/,
  "El fixture E2E debe aceptar la versión de transferencias activada.",
);
assert.doesNotMatch(
  e2eSmokeSource,
  /p_version:\s*["']2026-08-25\.1["']/,
  "El fixture E2E no puede aceptar la versión histórica reemplazada.",
);
const migrationGuard = preparedMigration.match(
  /do \$migration_guard\$([\s\S]*?)\$migration_guard\$;/,
);
assert.ok(
  migrationGuard,
  "0060 debe conservar un guard transaccional explícito.",
);
assert.match(
  preparedMigration,
  /AGORBIS_0060_LEGAL_HISTORY_PRECONDITION_FAILED/,
);
assert.match(
  preparedMigration,
  /lock table public\.legal_document_versions,\s*public\.international_transfer_notice_versions\s*in share row exclusive mode;/,
);
for (const baselineEvidence of [
  "'2026-08-23'",
  "timestamptz '2026-08-23 00:00:00+00'",
  "'6221c945577bdf3ea485dc254ed657e596a2e8e8cbd2b1e8a2ec8a0fee38cd2f'",
  "'225563ba3a5d2429448dd2a99e35a5f472fc00bcc5fe44ac6fd7172517285541'",
  "'2026-08-25.1'",
  "timestamptz '2026-08-25 00:00:00+00'",
  "'19826446051822fc347faaf114f1dc6f153b642c4e4706860e63bfb8373791af'",
  "'64bf705727ca0003f76f3d422402f42bff97dc433f138dc432f9678fae1c505a'",
  "'sha256-json-stringify-v1'",
]) {
  assert.ok(
    migrationGuard[1].includes(baselineEvidence),
    `0060: el guard no fija el baseline ${baselineEvidence}.`,
  );
}
assert.match(
  migrationGuard[1],
  /count\(\*\) from public\.legal_document_versions where is_current\) <> 3/,
);
assert.match(
  migrationGuard[1],
  /count\(\*\) from public\.international_transfer_notice_versions where is_current\) <> 1/,
);
for (const rowCountGuard of [
  "AGORBIS_0060_PRIVACY_RETIRE_ROWCOUNT_FAILED",
  "AGORBIS_0060_TRANSFER_RETIRE_ROWCOUNT_FAILED",
]) {
  assert.match(preparedMigration, new RegExp(rowCountGuard));
}
assert.equal(
  [...preparedMigration.matchAll(/get diagnostics affected_rows = row_count;/g)]
    .length,
  2,
);
assert.match(
  preparedMigration,
  /to_regclass\('public\.sensitive_participation_notice_versions'\) is not null/,
);
assert.match(
  preparedMigration,
  /to_regclass\('public\.user_sensitive_participation_consents'\) is not null/,
);
assert.doesNotMatch(
  preparedMigration,
  /(?:insert\s+into|update|delete\s+from)\s+public\.user_(?:legal_acceptances|international_transfer_consents)/i,
);
assert.doesNotMatch(
  preparedMigration,
  /create\s+table\s+public\.(?:sensitive_participation_notice_versions|user_sensitive_participation_consents)/i,
);
const legalContent = await readLegalContent();

assert.equal(manifest.documents.length, expectedDocuments.size);
assert.equal(activation.documents.length, expectedDocuments.size);
const activationDocuments = new Map(
  activation.documents.map((document) => [document.documentType, document]),
);
const seenDocumentTypes = new Set();
const calculatedHashes = {};

for (const documentDraft of manifest.documents) {
  const expected = expectedDocuments.get(documentDraft.documentType);
  assert.ok(
    expected,
    `Documento draft desconocido: ${documentDraft.documentType}`,
  );
  assert.ok(!seenDocumentTypes.has(documentDraft.documentType));
  seenDocumentTypes.add(documentDraft.documentType);
  assert.equal(documentDraft.contentExport, expected.contentExport);

  const activeVersion = sourceVersion(versionsSource, expected.versionConstant);
  assert.equal(documentDraft.proposed.version, "2026-08-29.1");
  const superseding = SUPERSEDING_VERSIONS.get(documentDraft.documentType);
  const superseded = superseding?.version === activeVersion;
  if (superseded) {
    const supersedingMigration = fs.readFileSync(
      path.join(migrationsDirectory, superseding.migration),
      "utf8",
    );
    for (const required of [
      `'${documentDraft.proposed.version}'`,
      `'${documentDraft.proposed.contentSha256}'`,
      `'${superseding.version}'`,
    ]) {
      assert.ok(
        supersedingMigration.includes(required),
        `${documentDraft.documentType}: ${superseding.migration} no retira ${required}.`,
      );
    }
  } else {
    assert.equal(documentDraft.proposed.version, activeVersion);
  }

  const activationDocument = activationDocuments.get(
    documentDraft.documentType,
  );
  assert.ok(
    activationDocument,
    `${documentDraft.documentType}: falta en el acta de activación.`,
  );
  assert.equal(
    activationDocument.previousVersion,
    documentDraft.source.version,
  );
  assert.equal(
    activationDocument.previousContentSha256,
    documentDraft.source.contentSha256,
  );
  assert.equal(
    activationDocument.preparedVersion,
    documentDraft.proposed.version,
  );
  assert.equal(
    activationDocument.preparedContentSha256,
    documentDraft.proposed.contentSha256,
  );
  assert.ok(
    migrations.includes(`'${documentDraft.source.version}'`),
    `${documentDraft.documentType}: falta la versión histórica de origen.`,
  );
  assert.ok(
    migrations.includes(`'${documentDraft.source.contentSha256}'`),
    `${documentDraft.documentType}: falta el hash histórico de origen.`,
  );
  assert.ok(
    preparedMigration.includes(`'${documentDraft.proposed.version}'`),
    `${documentDraft.documentType}: 0060 no contiene la versión preparada.`,
  );
  assert.ok(
    preparedMigration.includes(`'${documentDraft.proposed.contentSha256}'`),
    `${documentDraft.documentType}: 0060 no contiene el hash preparado.`,
  );

  const activeContent = legalContent[documentDraft.contentExport];
  assert.ok(activeContent);
  if (!superseded) {
    assert.equal(
      contentHash(activeContent),
      documentDraft.proposed.contentSha256,
    );
  }

  assert.ok(Array.isArray(documentDraft.patches));
  assert.ok(documentDraft.patches.length >= expected.minimumPatches);
  const patchPaths = documentDraft.patches.map((operation) => operation.path);
  assert.equal(new Set(patchPaths).size, patchPaths.length);
  assert.ok(patchPaths.some((pointer) => pointer.startsWith("/es/")));
  assert.ok(patchPaths.some((pointer) => pointer.startsWith("/en/")));
  const normalizedPathsByLocale = Object.fromEntries(
    ["es", "en"].map((locale) => [
      locale,
      patchPaths
        .filter((pointer) => pointer.startsWith(`/${locale}/`))
        .map((pointer) => pointer.slice(locale.length + 1))
        .sort(),
    ]),
  );
  assert.deepEqual(
    normalizedPathsByLocale.es,
    normalizedPathsByLocale.en,
    `${documentDraft.documentType}: cada ruta ES debe tener exactamente la misma ruta EN.`,
  );

  for (const operation of documentDraft.patches) {
    validatePatchOperation(operation);
    assert.equal(
      pointerValue(activeContent, operation.path),
      operation.value,
      `${documentDraft.documentType}: el contenido activo difiere del patch ${operation.path}.`,
    );
  }

  const wholeDocumentHash = contentHash(activeContent);
  const localeHashes = {
    es: contentHash(activeContent.es),
    en: contentHash(activeContent.en),
  };
  calculatedHashes[documentDraft.documentType] = {
    contentSha256: wholeDocumentHash,
    localeContentSha256: localeHashes,
  };

  // Una versión posterior tiene otro hash; check-legal la ata a su migración.
  if (!superseded) {
    assert.equal(documentDraft.proposed.contentSha256, wholeDocumentHash);
    assert.deepEqual(documentDraft.proposed.localeContentSha256, localeHashes);
  }
  assert.notEqual(wholeDocumentHash, documentDraft.source.contentSha256);
  assert.notEqual(localeHashes.es, localeHashes.en);

  const serialized = JSON.stringify(activeContent);
  const removedUnsupportedAssertions = [
    "AWS us-east-2",
    "Ohio, Estados Unidos",
    "Ohio, United States",
    "Su tratamiento principal se realiza en Estados Unidos",
    "Its primary processing takes place in the United States",
    "Los DPA incorporados a los contratos obligan",
    "The DPAs incorporated into each contract require",
    "Los DPA, la minimización, los controles de acceso",
    "DPAs, minimization, access controls",
    "La telemetría cruda de activación se elimina a los 90 días",
    "Raw activation telemetry is deleted after 90 days",
    "Las copias de respaldo vencen por rotación",
    "Backups expire through rotation",
    "mediante datos mínimos y con retención limitada",
    "using minimal data with limited retention",
  ];
  for (const assertion of removedUnsupportedAssertions) {
    assert.ok(
      !serialized.includes(assertion),
      `${documentDraft.documentType}: persiste la afirmación no acreditada: ${assertion}`,
    );
  }

  if (documentDraft.documentType === "international_transfer_notice") {
    assert.ok(
      serialized.includes("no debe describirse como jurídicamente conforme"),
    );
    assert.ok(
      serialized.includes("must not be described as legally compliant"),
    );
    assert.ok(serialized.includes("revisión 0059"));
    assert.ok(serialized.includes("review 0059"));
  }
}

assert.deepEqual(seenDocumentTypes, new Set(expectedDocuments.keys()));
console.log(
  `Legal activation: ${activation.status}; draft histórico preservado y 0060 aplicada/verificada por autorización separada.`,
);
console.log(JSON.stringify(calculatedHashes));
