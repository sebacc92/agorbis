import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  readCurrentTransferConsentSnapshot,
  socialAuthConsentBlockers,
  verifyGoogleAuthConsentArtifact,
} from "./social-auth-consent-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = mkdtempSync(path.join(tmpdir(), "agorbis-google-coverage-"));
const migration = "0067_activate_test_google_notice.sql";
const migrationDirectory = path.join(fixture, "supabase/migrations");
const migrationPath = path.join(migrationDirectory, migration);
const googleOn = { PUBLIC_GOOGLE_AUTH_ENABLED: "true" };
const bothOn = { ...googleOn, PUBLIC_FACEBOOK_AUTH_ENABLED: "true" };
const hashBytes = (source) =>
  createHash("sha256").update(source, "utf8").digest("hex");

// Sólo datos sintéticos. Este hash representa un digest ya revisado en PG;
// ninguna prueba presenta JSON.stringify como equivalente a jsonb::text.
const manifestBase = {
  provider: "google",
  version: "test-2000.1",
  contentHash: "1".repeat(64),
  contentHashAlgorithm: "sha256-postgres-jsonb-v1",
  migration,
  effectiveAt: "2000-01-02T00:00:00.000Z",
  approvedAt: "2000-01-01T00:00:00.000Z",
  approvalReference: "Synthetic test owner's decision only",
};
const snapshot = {
  es: {
    title: "Google de prueba",
    summary: "Texto sintético, sin aprobación real.",
    sections: [{ title: "Decisión", paragraphs: ["Sólo una prueba local."] }],
  },
  en: {
    title: "Test Google",
    summary: "Synthetic content, not an actual approval.",
    sections: [{ title: "Decision", bullets: ["A local test only."] }],
  },
};
function activation(content = snapshot, fields = manifestBase) {
  return `begin;
insert into public.google_auth_notice_versions
(provider, version, content_hash, content_hash_algorithm, content_snapshot,
 effective_at, approved_at, approval_reference, is_current)
values ('google', '${fields.version}', '${fields.contentHash}',
 'sha256-postgres-jsonb-v1',
 $google_auth_notice$${JSON.stringify(content)}$google_auth_notice$::jsonb,
 '${fields.effectiveAt}'::timestamptz, '${fields.approvedAt}'::timestamptz,
 '${fields.approvalReference.replaceAll("'", "''")}', true);
commit;
`;
}
function putArtifact(source = activation(), overrides = {}) {
  writeFileSync(migrationPath, source);
  return Object.freeze({
    ...manifestBase,
    migrationSha256: hashBytes(source),
    ...overrides,
  });
}
function assertBadArtifact(source, message, overrides = {}) {
  assert.throws(
    () =>
      verifyGoogleAuthConsentArtifact(putArtifact(source, overrides), {
        root: fixture,
      }),
    message,
  );
}

try {
  mkdirSync(migrationDirectory, { recursive: true });
  mkdirSync(path.join(fixture, "src/lib"), { recursive: true });
  mkdirSync(path.join(fixture, "scripts"));
  copyFileSync(
    path.join(root, "src/lib/legal.ts"),
    path.join(fixture, "src/lib/legal.ts"),
  );
  const general = readCurrentTransferConsentSnapshot(root);
  copyFileSync(
    path.join(root, "supabase/migrations", general.migration),
    path.join(migrationDirectory, general.migration),
  );

  assert.deepEqual(socialAuthConsentBlockers({}), []);
  assert.deepEqual(socialAuthConsentBlockers(googleOn), []);
  assert.equal(socialAuthConsentBlockers(bothOn).length, 1);
  assert.match(socialAuthConsentBlockers(bothOn)[0], /Facebook/);
  const manifest = putArtifact();
  const result = verifyGoogleAuthConsentArtifact(manifest, { root: fixture });
  assert.equal(result.status, "artifact_matches_manifest");
  assert.equal(result.contentHash, manifestBase.contentHash);
  assert.equal(result.coverageApproved, false);
  assert.equal(result.databaseContentHashVerified, false);
  assert.ok(Object.isFrozen(result));
  assert.notEqual(hashBytes(JSON.stringify(snapshot)), result.contentHash);
  assert.equal(
    socialAuthConsentBlockers(googleOn, { root: fixture }).length,
    1,
    "Un artefacto sintético válido no sustituye la migración real revisada.",
  );
  assert.equal(
    socialAuthConsentBlockers(googleOn, {
      root: fixture,
      reviewedGoogleAuthConsentScopes: [manifest],
    }).length,
    1,
    "Un caller no puede inyectar cobertura mediante opciones.",
  );

  for (const invalid of [
    null,
    {},
    { ...manifest, provider: "facebook" },
    { ...manifest, version: 2000 },
    { ...manifest, contentHash: null },
    { ...manifest, contentHashAlgorithm: "sha256-json-stringify-v1" },
    { ...manifest, migration: "../migration-drafts/google.sql" },
    { ...manifest, migration: "0066_google_auth_consent.sql" },
    { ...manifest, approvalReference: "" },
    { ...manifest, approvalReference: "pending" },
    { ...manifest, approved: true },
  ]) {
    assert.throws(
      () => verifyGoogleAuthConsentArtifact(invalid, { root: fixture }),
      /manifiesto.*inválido/,
    );
  }
  for (const invalid of [
    { ...manifest, approvedAt: "" },
    { ...manifest, effectiveAt: "2000-02-30T00:00:00.000Z" },
    { ...manifest, approvedAt: "9999-01-01T00:00:00.000Z" },
    { ...manifest, effectiveAt: "1999-01-01T00:00:00.000Z" },
  ]) {
    assert.throws(
      () => verifyGoogleAuthConsentArtifact(invalid, { root: fixture }),
      /aprobación|vigencia/,
    );
  }
  writeFileSync(migrationPath, activation().replace("Texto", "Cambio"));
  assert.throws(
    () => verifyGoogleAuthConsentArtifact(manifest, { root: fixture }),
    /SHA-256 completo/,
  );
  assertBadArtifact(activation(), /INSERT no coincide/, {
    contentHash: "2".repeat(64),
  });
  assertBadArtifact(activation(), /INSERT no coincide/, {
    approvalReference: "Different reviewed decision",
  });
  assertBadArtifact(activation({ es: snapshot.es }), /ES\/EN/);
  assertBadArtifact(
    activation({ ...snapshot, en: { ...snapshot.en, summary: " " } }),
    /ES\/EN/,
  );
  assertBadArtifact(
    activation({ ...snapshot, en: { ...snapshot.en, sections: [] } }),
    /ES\/EN/,
  );
  assertBadArtifact(
    activation({ ...snapshot, en: { ...snapshot.en, sections: [{}] } }),
    /ES\/EN/,
  );
  assertBadArtifact(activation().replace(", true)", ", false)"), /INSERT/);
  assertBadArtifact(activation().replace("'google'", "'facebook'"), /INSERT/);
  assertBadArtifact(activation().replace("::jsonb", "::json"), /INSERT/);
  assertBadArtifact(`${activation()}${activation()}`, /único INSERT/);
  assertBadArtifact(`/* ${activation()} */`, /único INSERT/);
  assertBadArtifact(
    `do $body$ begin ${activation()} end; $body$;`,
    /único INSERT/,
  );
  assertBadArtifact("/* unterminated", /SQL incompleto/);
  assertBadArtifact("select 'unterminated", /SQL incompleto/);
  assertBadArtifact("do $body$ unterminated", /SQL incompleto/);
  assertBadArtifact("select 1", /sin terminador/);
  const commentedManifest = putArtifact(
    `-- comentario; sin activación\n/* anidado /* interno */ fin */\n${activation()}`,
  );
  assert.equal(
    verifyGoogleAuthConsentArtifact(commentedManifest, { root: fixture })
      .status,
    "artifact_matches_manifest",
  );

  putArtifact();
  const later = path.join(migrationDirectory, "0068_later_notice.sql");
  writeFileSync(
    later,
    "update public.google_auth_notice_versions set is_current = false;",
  );
  assert.throws(
    () => verifyGoogleAuthConsentArtifact(manifest, { root: fixture }),
    /modificación posterior/,
  );
  rmSync(later);
  const drafts = path.join(fixture, "supabase/migration-drafts");
  mkdirSync(drafts);
  const draft = path.join(drafts, migration);
  writeFileSync(draft, activation());
  rmSync(migrationPath);
  assert.throws(() =>
    verifyGoogleAuthConsentArtifact(manifest, { root: fixture }),
  );
  symlinkSync(draft, migrationPath);
  assert.throws(
    () => verifyGoogleAuthConsentArtifact(manifest, { root: fixture }),
    /archivo regular/,
  );
  rmSync(migrationPath);
  // La cobertura real depende de la migración concreta revisada; el aviso
  // general continúa idéntico y Facebook sigue fuera de esa aprobación.
  const approvedMigration = "0067_activate_google_auth_notice.sql";
  const approvedPath = path.join(migrationDirectory, approvedMigration);
  const approvedSource = readFileSync(
    path.join(root, "supabase/migrations", approvedMigration),
    "utf8",
  );
  writeFileSync(approvedPath, approvedSource);
  assert.deepEqual(socialAuthConsentBlockers(googleOn, { root: fixture }), []);
  assert.equal(socialAuthConsentBlockers(bothOn, { root: fixture }).length, 1);
  assert.deepEqual(readCurrentTransferConsentSnapshot(fixture), general);
  writeFileSync(approvedPath, `${approvedSource}-- drift\n`);
  assert.match(
    socialAuthConsentBlockers(googleOn, { root: fixture }).join("\n"),
    /SHA-256 completo/,
  );
  rmSync(approvedPath);
  writeFileSync(path.join(drafts, approvedMigration), approvedSource);
  assert.equal(
    socialAuthConsentBlockers(googleOn, { root: fixture }).length,
    1,
    "Un snapshot aprobado copiado solamente a drafts no tiene cobertura.",
  );
  writeFileSync(approvedPath, approvedSource);

  // Incluso con el artefacto aprobado disponible, quitar su revisión DEL CÓDIGO
  // en esta copia temporal bloquea Google. No existe aprobación por descubrimiento.
  const originalPolicy = readFileSync(
    path.join(root, "scripts/social-auth-consent-policy.mjs"),
    "utf8",
  );
  const registryDeclaration =
    /const REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES = Object\.freeze\([\s\S]*?\);/;
  assert.match(originalPolicy, registryDeclaration);
  const unreviewedPolicyPath = path.join(
    fixture,
    "scripts/unreviewed-policy.mjs",
  );
  writeFileSync(
    unreviewedPolicyPath,
    originalPolicy.replace(
      registryDeclaration,
      "const REVIEWED_GOOGLE_AUTH_CONSENT_SCOPES = Object.freeze([]);",
    ),
  );
  const unreviewedPolicy = await import(
    pathToFileURL(unreviewedPolicyPath).href
  );
  assert.equal(unreviewedPolicy.socialAuthConsentBlockers(googleOn).length, 1);
  assert.match(
    unreviewedPolicy.socialAuthConsentBlockers(googleOn)[0],
    /consentimiento OAuth bloqueado para Google/,
  );
  assert.equal(unreviewedPolicy.socialAuthConsentBlockers(bothOn).length, 2);
  assert.deepEqual(socialAuthConsentBlockers(googleOn), []);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log(
  "PASS: cobertura Google separada, fijada por código y sin aprobar borradores.",
);
