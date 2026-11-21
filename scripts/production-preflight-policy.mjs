const firstProductionMigration = 1;
const lastContiguousProductionMigration = 58;

export const EXPECTED_MIGRATION_DRAFT_FILE =
  "0059_versioned_sensitive_participation_consent.sql";

export const EXPECTED_PRODUCTION_MIGRATION_IDS = Object.freeze([
  ...Array.from(
    {
      length: lastContiguousProductionMigration - firstProductionMigration + 1,
    },
    (_, index) => String(firstProductionMigration + index).padStart(4, "0"),
  ),
  "0060",
]);

export const EXPECTED_D72_MIGRATION_FILE =
  "0061_reconcile_sequence_acl_drift.sql";
const EXPECTED_D72_MIGRATION_IDS = Object.freeze([
  ...EXPECTED_PRODUCTION_MIGRATION_IDS,
  "0061",
]);

// El candidato nuevo no altera los inventarios históricos usados por D72.
export const ACCOUNT_IMPROVEMENTS_MIGRATION_FILES = Object.freeze([
  "0062_search_ordered_pagination.sql",
  "0063_data_deletion_requests.sql",
  "0064_notification_preferences.sql",
  "0065_public_profile_handles.sql",
]);
export const GOOGLE_AUTH_CONSENT_MIGRATION_FILES = Object.freeze([
  ...ACCOUNT_IMPROVEMENTS_MIGRATION_FILES,
  "0066_google_auth_consent.sql",
]);
export const GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES = Object.freeze([
  ...GOOGLE_AUTH_CONSENT_MIGRATION_FILES,
  "0067_activate_google_auth_notice.sql",
]);
// D92: Producción nace vacía y recibe también las migraciones de octubre
// (filtros de Inicio, búsqueda de miembros y acuse institucional), aprobadas
// por el responsable el 25-10-2026.
export const FEED_AND_INSTITUTIONAL_MIGRATION_FILES = Object.freeze([
  "0070_personalized_feed_filters.sql",
  "0071_public_member_search.sql",
  "0072_claim_institutional_response_clock.sql",
]);
// D109: Privacidad cita el anexo de Turnstile para el modo invisible.
export const TURNSTILE_INVISIBLE_MIGRATION_FILES = Object.freeze([
  "0073_turnstile_invisible_privacy_addendum.sql",
]);
// D118: acuerdos que cada comunidad vota por separado.
export const AGREEMENTS_MIGRATION_FILES = Object.freeze([
  "0074_agreements.sql",
]);
// D120: moderación de acuerdos (reporte, ocultar y restaurar con sus rondas).
export const AGREEMENT_MODERATION_MIGRATION_FILES = Object.freeze([
  "0075_agreement_moderation.sql",
]);
// D127: gobiernos locales de Argentina en el nivel 4 y localidades al 5.
export const ARGENTINA_LOCAL_GOVERNMENTS_MIGRATION_FILES = Object.freeze([
  "0076_argentina_local_governments.sql",
]);
export const CANDIDATE_MIGRATION_FILES = Object.freeze([
  ...GOOGLE_AUTH_ACTIVATION_MIGRATION_FILES,
  ...FEED_AND_INSTITUTIONAL_MIGRATION_FILES,
  ...TURNSTILE_INVISIBLE_MIGRATION_FILES,
  ...AGREEMENTS_MIGRATION_FILES,
  ...AGREEMENT_MODERATION_MIGRATION_FILES,
  ...ARGENTINA_LOCAL_GOVERNMENTS_MIGRATION_FILES,
]);
export const CANDIDATE_MIGRATION_IDS = Object.freeze([
  ...EXPECTED_D72_MIGRATION_IDS,
  ...CANDIDATE_MIGRATION_FILES.map((file) => file.slice(0, 4)),
]);
const exactMigrationFiles = [
  EXPECTED_D72_MIGRATION_FILE,
  ...CANDIDATE_MIGRATION_FILES,
];

export function validateProductionMigrationFiles(entries) {
  const migrationFiles = entries
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const actualIds = migrationFiles.map((name) => name.slice(0, 4));

  if (
    actualIds.length === CANDIDATE_MIGRATION_IDS.length &&
    actualIds.every(
      (migrationId, index) => migrationId === CANDIDATE_MIGRATION_IDS[index],
    ) &&
    exactMigrationFiles.every((file) => migrationFiles.includes(file))
  ) {
    return [];
  }

  const actualCounts = new Map();
  for (const migrationId of actualIds) {
    actualCounts.set(migrationId, (actualCounts.get(migrationId) ?? 0) + 1);
  }
  const missing = CANDIDATE_MIGRATION_IDS.filter(
    (migrationId) => !actualCounts.has(migrationId),
  );
  const duplicated = [...actualCounts]
    .filter(([, count]) => count > 1)
    .map(([migrationId]) => migrationId);
  const unexpected = [...actualCounts.keys()].filter(
    (migrationId) => !CANDIDATE_MIGRATION_IDS.includes(migrationId),
  );
  const details = [
    missing.length ? `faltan ${missing.join(",")}` : "",
    duplicated.length ? `duplicadas ${duplicated.join(",")}` : "",
    unexpected.length ? `inesperadas ${unexpected.join(",")}` : "",
    ...exactMigrationFiles
      .filter(
        (file) =>
          actualIds.includes(file.slice(0, 4)) &&
          !migrationFiles.includes(file),
      )
      .map((file) => `${file.slice(0, 4)} debe llamarse ${file}`),
  ].filter(Boolean);

  return [
    `El candidato de Producción debe contener exactamente una migración por ID 0001–0058, 0060–0067 y 0070–0076, con los nombres aprobados de 0061–0076; 0059 debe permanecer únicamente en migration-drafts. Se encontraron ${migrationFiles.length}${details.length ? ` (${details.join("; ")})` : ""}.`,
  ];
}

export function validateMigrationDraftFiles(entries) {
  const draftFiles = entries.filter((name) => name.endsWith(".sql")).sort();

  if (
    draftFiles.length === 1 &&
    draftFiles[0] === EXPECTED_MIGRATION_DRAFT_FILE
  ) {
    return [];
  }

  return [
    `supabase/migration-drafts debe contener únicamente ${EXPECTED_MIGRATION_DRAFT_FILE}; se encontraron ${draftFiles.length ? draftFiles.join(", ") : "cero archivos SQL"}.`,
  ];
}
