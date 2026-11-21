import crypto from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentPath = path.join(root, "src/lib/legal-content.ts");
const versionsPath = path.join(root, "src/lib/legal.ts");
const migrationsDirectory = path.join(root, "supabase/migrations");

const source = fs.readFileSync(contentPath, "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: contentPath,
}).outputText;

// `legal-content.ts` only has type-only imports. A data URL lets this check use
// the exact objects rendered by the pages without adding another TS runner.
const legalContent = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);
const versionsSource = fs.readFileSync(versionsPath, "utf8");
const migrations = fs
  .readdirSync(migrationsDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationsDirectory, name), "utf8"))
  .join("\n");

const documents = [
  {
    documentType: "privacy",
    versionConstant: "PRIVACY_VERSION",
    contentExport: "privacyContent",
    table: "legal_document_versions",
  },
  {
    documentType: "terms",
    versionConstant: "TERMS_VERSION",
    contentExport: "termsContent",
    table: "legal_document_versions",
  },
  {
    documentType: "community_rules",
    versionConstant: "COMMUNITY_RULES_VERSION",
    contentExport: "communityRulesContent",
    table: "legal_document_versions",
  },
  {
    documentType: "international_transfer_notice",
    versionConstant: "INTERNATIONAL_TRANSFER_NOTICE_VERSION",
    contentExport: "internationalTransferNoticeContent",
    table: "international_transfer_notice_versions",
  },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const {
  documentType,
  versionConstant,
  contentExport,
  table,
} of documents) {
  const versionMatch = versionsSource.match(
    new RegExp(
      `export\\s+const\\s+${versionConstant}\\s*=\\s*["']([^"']+)["']`,
    ),
  );
  if (!versionMatch) throw new Error(`No se encontró ${versionConstant}.`);

  const content = legalContent[contentExport];
  if (!content) throw new Error(`No se encontró ${contentExport}.`);
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex");

  const versionedInsert =
    table === "legal_document_versions"
      ? new RegExp(
          `\\(\\s*'${escapeRegex(documentType)}'\\s*,\\s*'${escapeRegex(versionMatch[1])}'\\s*,\\s*'${hash}'`,
          "m",
        )
      : new RegExp(
          `insert\\s+into\\s+public\\.${escapeRegex(table)}\\s*\\([^;]+?\\)\\s*values\\s*\\(\\s*'${escapeRegex(versionMatch[1])}'\\s*,\\s*'${hash}'`,
          "is",
        );
  if (!versionedInsert.test(migrations)) {
    throw new Error(
      `${documentType} ${versionMatch[1]} cambió sin actualizar su versión/hash en una migración. SHA-256 actual: ${hash}`,
    );
  }

  if (table === "international_transfer_notice_versions") {
    const snapshotInsert = migrations.match(
      new RegExp(
        `insert\\s+into\\s+public\\.${escapeRegex(table)}\\s*\\([^;]+?\\)\\s*values\\s*\\(\\s*'${escapeRegex(versionMatch[1])}'\\s*,\\s*'${hash}'\\s*,\\s*\\$([A-Za-z_][A-Za-z0-9_]*)\\$([\\s\\S]*?)\\$\\1\\$::jsonb\\s*,\\s*'sha256-json-stringify-v1'`,
        "i",
      ),
    );
    if (!snapshotInsert) {
      throw new Error(
        `${documentType} ${versionMatch[1]} no conserva el snapshot JSON exacto ni declara sha256-json-stringify-v1.`,
      );
    }
    let snapshot;
    try {
      snapshot = JSON.parse(snapshotInsert[2]);
    } catch (error) {
      throw new Error(
        `${documentType} ${versionMatch[1]} contiene un snapshot JSON inválido.`,
        { cause: error },
      );
    }
    assert.deepStrictEqual(
      snapshot,
      content,
      `${documentType} ${versionMatch[1]}: el snapshot SQL difiere del contenido publicado.`,
    );
  }
}

console.log("Legal: versiones y hashes coinciden con el contenido publicado.");
