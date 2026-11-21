import { createHash } from "node:crypto";
import path from "node:path";
import {
  CANDIDATE_MIGRATION_FILES,
  CANDIDATE_MIGRATION_IDS,
  EXPECTED_D72_MIGRATION_FILE,
  validateProductionMigrationFiles,
} from "./production-preflight-policy.mjs";
import {
  assertApprovedProductionQuery,
  buildProductionPsqlContainerInvocation,
  buildProductionPsqlEnvironment,
  parseProductionPsqlJson,
  PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
  PRODUCTION_QUERY_PROJECT_REF,
} from "./production-backup-query-policy.mjs";
import {
  parseMigrationListOutput,
  READ_ONLY_PREVIEW_MIGRATION_STATE,
  removeKnownSupabaseUpdateNotice,
} from "./cloudflare-readonly-preview-remote-policy.mjs";

export const D72_SUPABASE_READONLY_SCHEMA_VERSION =
  "agorbis-d72-supabase-readonly/v4";
export const D72_SUPABASE_CATALOG_SCHEMA_VERSION =
  "agorbis-d72-supabase-catalog/v1";
export const D72_SUPABASE_CHECKS_SCHEMA_VERSION =
  "agorbis-d72-supabase-checks/v1";
export const D72_SUPABASE_PROJECT_REF = PRODUCTION_QUERY_PROJECT_REF;
export const D72_SUPABASE_CLI_VERSION = "2.115.0";
export const D72_SUPABASE_DOCKER_HOST = "unix:///var/run/docker.sock";
export const D72_SUPABASE_PSQL_STDIN_ENTRYPOINT =
  'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql "$@"';
export const D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH = path.join(
  "scripts",
  "assets",
  "d72-docker-config",
);

export const D72_SUPABASE_MIGRATION_LIST_ARGS = Object.freeze([
  "migration",
  "list",
  "--project-ref",
  D72_SUPABASE_PROJECT_REF,
  "--output-format",
  "json",
  "--agent",
  "no",
]);

export const D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS = Object.freeze([
  "db",
  "push",
  "--project-ref",
  D72_SUPABASE_PROJECT_REF,
  "--dry-run",
  "--skip-vault",
  "--output-format",
  "json",
  "--agent",
  "no",
]);

export const D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX = Object.freeze([
  "Initialising login role...",
  "DRY RUN: migrations will *not* be pushed to the database.",
  "Connecting to remote database...",
  'Skipping migration 0016_world_subdivisions.sql.audit.json... (file name must match pattern "<timestamp>_name.sql")',
]);
export const D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX = Object.freeze([
  "Initialising login role...",
  "Connecting to remote database...",
  'Skipping migration 0016_world_subdivisions.sql.audit.json... (file name must match pattern "<timestamp>_name.sql")',
]);
export const D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER =
  "Would push these migrations:";
export const D72_SUPABASE_DB_PUSH_DRY_RUN_STATE =
  "agorbis-d72-candidate-0062-0076/v1";
export const D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS =
  CANDIDATE_MIGRATION_FILES;
export const D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE =
  "A new version of Supabase CLI is available: v2.116.0 (currently installed v2.115.0)\n" +
  "We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli\n";

export const D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS = CANDIDATE_MIGRATION_IDS;
export const D72_SUPABASE_BASELINE_MIGRATION_VERSIONS = Object.freeze(
  CANDIDATE_MIGRATION_IDS.slice(0, -CANDIDATE_MIGRATION_FILES.length),
);

export const D72_SUPABASE_GATE_IDS = Object.freeze([
  "database.expected-migrations-only",
  "data.integrity-no-corruption",
  "security.rls-enforced",
  "authorization.residency-write-boundary",
  "privacy.no-individual-ballots",
  "security.anti-abuse-limits",
]);

export const D72_SUPABASE_GATE_STATUS = Object.freeze({
  FAIL: "FAIL",
  NOT_VERIFIED: "NOT_VERIFIED",
  PASS: "PASS",
});

export const D72_SUPABASE_LOCAL_DB_TEST_SHA256 = Object.freeze({
  "account_deletion_checks.sql":
    "6b6acc4113783afa06f455935a308c5531fcdcce99592b76d1f780ffc4320fda",
  "agreements_checks.sql":
    "d5fb0ae53796bde869c9039dab29498005063f96e9f6ee6f38e101ad78278503",
  "child_visibility_checks.sql":
    "0a206d99ac5c70b5d072370757c8b63c58d79576f15533914cef6c777de27f7a",
  "claim_response_clock_checks.sql":
    "0c67b64442d4f01e56d35cddee366e4d2c5a9f9d93721d7f02db1971fdf04d28",
  "claim_storage_checks.sql":
    "0910b5776ba06aea1fab7605ea8451b83df199af99d1243f4c56391b23543f67",
  "data_deletion_request_checks.sql":
    "44c56433ebcd2959dd7208b75086b82d748fbf9b33d5682b77c6d89ea62775f7",
  "geography_baseline_checks.sql":
    "cbaeb86e20277b8c31ec68547b7e816a9003b950dc5f9927f897db017adc6f9b",
  "geolocation_privacy_checks.sql":
    "5915e6ceeff0e1e11d4b940459a76b0a7b299179566aa1e377eff9e874a902bd",
  "google_auth_consent_checks.sql":
    "0127007ea9d4f64787377d79f5068e1062c39791f1bf01acd41687e30501445a",
  "notification_checks.sql":
    "6c3ab00248706646ad718af182f61c23b9bc03d3971f4e435fcdc82539c976e2",
  "notification_preferences_checks.sql":
    "b218473fe9c777e9988a1921158b093648c3aa5ea0a3d02902e9ecbc58469bd7",
  "oauth_retention_checks.sql":
    "243c606c32eaa02b99930f147010a89e8ca00191b02df2ef958aa4a8d5c0a08f",
  "personalized_feed_checks.sql":
    "8ff4594300f364ce4c0d44c84790edf87fc04cdbfc0f8335dbc2d854a8cad94b",
  "project_privacy_checks.sql":
    "2969bf48201c75ba0c840f0747c05b41992abd7f299592c5f32af4a6beec880e",
  "public_member_search_checks.sql":
    "c4333a4860728fa54f122af9b5158b53199e41ee4bbf10aa5ad404a0fcc5d048",
  "public_profile_handles_checks.sql":
    "323cf369012ab9fd0175a7709bd6dc9b5522763bb0aacd91d6d6e19a87889996",
  "rls_checks.sql":
    "c6d3a3a901d742a1fe0c9c85d9db04b5ca57130b83ea4c254633efb1f17d1f56",
  "search_ordering_checks.sql":
    "21d91498dc177a498a7e5ec1abb82cb47193f1f335180ed2f5689471990d867e",
});

export const D72_SUPABASE_LOCAL_GATE_TEST_FILES = Object.freeze({
  "authorization.residency-write-boundary": Object.freeze([
    "account_deletion_checks.sql",
    "child_visibility_checks.sql",
    "claim_response_clock_checks.sql",
    "claim_storage_checks.sql",
    "geolocation_privacy_checks.sql",
    "notification_checks.sql",
    "project_privacy_checks.sql",
    "rls_checks.sql",
  ]),
  "data.integrity-no-corruption": Object.freeze(
    Object.keys(D72_SUPABASE_LOCAL_DB_TEST_SHA256),
  ),
  "privacy.no-individual-ballots": Object.freeze([
    "account_deletion_checks.sql",
    "agreements_checks.sql",
    "child_visibility_checks.sql",
    "oauth_retention_checks.sql",
    "rls_checks.sql",
  ]),
  "security.anti-abuse-limits": Object.freeze([
    "rls_checks.sql",
    "agreements_checks.sql",
    "data_deletion_request_checks.sql",
    "google_auth_consent_checks.sql",
  ]),
  "security.rls-enforced": Object.freeze([
    "agreements_checks.sql",
    "claim_response_clock_checks.sql",
    "personalized_feed_checks.sql",
    "public_member_search_checks.sql",
    "google_auth_consent_checks.sql",
    "notification_preferences_checks.sql",
    "search_ordering_checks.sql",
    "data_deletion_request_checks.sql",
    "public_profile_handles_checks.sql",
    "child_visibility_checks.sql",
    "claim_storage_checks.sql",
    "notification_checks.sql",
    "project_privacy_checks.sql",
    "rls_checks.sql",
  ]),
});

export const D72_SUPABASE_MINIMUM_CATALOG_CONTRACT = Object.freeze({
  antiAbuseFunction: Object.freeze({
    name: "consume_window_limit",
    schema: "private",
  }),
  coreRelation: Object.freeze({ name: "profiles", schema: "public" }),
  residencyFunction: Object.freeze({
    name: "raw_is_member",
    schema: "private",
  }),
  candidateRlsRelations: Object.freeze([
    "private.data_deletion_lookup_windows",
    "private.data_deletion_requests",
    "private.public_profile_handles",
    "private.google_auth_consent_barriers",
    "public.google_auth_notice_versions",
    "public.user_google_auth_consent_events",
    "public.notification_preferences",
  ]),
  candidateDefinerFunctions: Object.freeze([
    "private.guard_google_auth_notice",
    "public.current_google_auth_notice",
    "public.my_google_auth_consent",
    "public.grant_google_auth_consent",
    "public.withdraw_google_auth_consent",
  ]),
  candidateInvokerFunctions: Object.freeze([
    "notification_communities",
    "notification_inbox",
    "mark_notifications_read",
  ]),
  candidateTriggers: Object.freeze([
    "public.google_auth_notice_versions.google_auth_notice_guard",
    "public.notifications.notifications_apply_preferences",
    "public.profiles.profiles_reserve_public_handle",
  ]),
  schemaVersion: "agorbis-d72-supabase-minimum-catalog/v3",
});

export const D72_SUPABASE_CATALOG_SECTIONS = Object.freeze([
  "schemas",
  "relations",
  "columns",
  "constraints",
  "indexes",
  "policies",
  "grants",
  "functions",
  "triggers",
  "types",
]);

const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,127}$/;
const SAFE_VERSION_PATTERN = /^\d{4}$/;
const MAX_CATALOG_ARRAY_LENGTH = 100_000;
const MAX_CATALOG_TEXT_LENGTH = 2 * 1024 * 1024;
const MAX_CLI_JSON_BYTES = 4 * 1024 * 1024;

const CATALOG_KEYS = Object.freeze([
  ...D72_SUPABASE_CATALOG_SECTIONS,
  "schemaVersion",
]);
const CHECK_PAYLOAD_KEYS = Object.freeze(["checks", "schemaVersion"]);
const CHECK_KEYS = Object.freeze(["id", "invalidRowCount"]);

const CATALOG_ENTRY_KEYS = Object.freeze({
  columns: Object.freeze([
    "collation",
    "default",
    "generated",
    "identity",
    "name",
    "notNull",
    "ordinal",
    "schema",
    "table",
    "type",
  ]),
  constraints: Object.freeze([
    "deferred",
    "deferrable",
    "definition",
    "name",
    "schema",
    "table",
    "type",
    "validated",
  ]),
  functions: Object.freeze([
    "arguments",
    "config",
    "definition",
    "leakproof",
    "name",
    "owner",
    "parallel",
    "result",
    "schema",
    "securityDefiner",
    "volatility",
  ]),
  grants: Object.freeze([
    "detail",
    "grantable",
    "grantee",
    "grantor",
    "identity",
    "objectKind",
    "privilege",
    "schema",
  ]),
  indexes: Object.freeze([
    "definition",
    "name",
    "primary",
    "ready",
    "schema",
    "table",
    "unique",
    "valid",
  ]),
  policies: Object.freeze([
    "check",
    "command",
    "name",
    "permissive",
    "roles",
    "schema",
    "table",
    "using",
  ]),
  relations: Object.freeze([
    "forceRls",
    "kind",
    "name",
    "owner",
    "persistence",
    "replicaIdentity",
    "rls",
    "schema",
    "viewDefinition",
  ]),
  triggers: Object.freeze(["definition", "enabled", "name", "schema", "table"]),
  types: Object.freeze([
    "baseType",
    "category",
    "enumLabels",
    "kind",
    "name",
    "owner",
    "schema",
  ]),
});

const ENTRY_SORT_KEYS = Object.freeze({
  columns: (entry) =>
    `${entry.schema}\0${entry.table}\0${String(entry.ordinal).padStart(8, "0")}`,
  constraints: (entry) => `${entry.schema}\0${entry.table}\0${entry.name}`,
  functions: (entry) => `${entry.schema}\0${entry.name}\0${entry.arguments}`,
  grants: (entry) =>
    [
      entry.objectKind,
      entry.schema,
      entry.identity,
      entry.detail,
      entry.grantee,
      entry.privilege,
      entry.grantor,
      String(entry.grantable),
    ].join("\0"),
  indexes: (entry) => `${entry.schema}\0${entry.table}\0${entry.name}`,
  policies: (entry) => `${entry.schema}\0${entry.table}\0${entry.name}`,
  relations: (entry) => `${entry.schema}\0${entry.name}\0${entry.kind}`,
  triggers: (entry) => `${entry.schema}\0${entry.table}\0${entry.name}`,
  types: (entry) => `${entry.schema}\0${entry.name}`,
});

const INTEGRITY_CHECK_IDS = Object.freeze([
  "integrity.budget-tally-shape-mismatch",
  "integrity.claim-support-count-mismatch",
  "integrity.comment-score-mismatch",
  "integrity.invalid-indexes",
  "integrity.poll-tally-shape-mismatch",
  "integrity.unvalidated-constraints",
]);

const D68_CHECK_IDS = Object.freeze([
  "d68.budget-tally-transaction-divergence",
  "d68.individual-ballot-columns",
  "d68.individual-ballot-relations",
  "d68.poll-tally-transaction-divergence",
  "d68.reidentifying-functions",
]);

export const D72_SUPABASE_AGGREGATE_CHECK_IDS = Object.freeze(
  [...INTEGRITY_CHECK_IDS, ...D68_CHECK_IDS].sort(),
);

const RESIDENCY_FUNCTION_NAMES = new Set([
  "approve_community_request",
  "can_correct_residence",
  "can_vote_budget",
  "enforce_residence_cooldown",
  "is_member",
  "raw_is_member",
  "set_home_community",
]);
const ANTI_ABUSE_RELATION_KEYS = new Set([
  "private.data_deletion_lookup_windows",
  "private.google_auth_consent_barriers",
]);
const ANTI_ABUSE_FUNCTION_NAMES = new Set([
  "grant_google_auth_consent",
  "withdraw_google_auth_consent",
  "create_data_deletion_request",
  "update_data_deletion_request",
  "reissue_data_deletion_receipt",
  "read_data_deletion_receipt",
  "assert_can_participate",
  "consume_cooldown",
  "consume_window_limit",
  "enforce_content_quota",
  "guard_civic_extension_limits",
  "guard_project_contribution_write",
  "quota_remaining",
  "quota_summary",
]);

export const D72_SUPABASE_CATALOG_DOMAIN_SCHEMA_VERSION =
  "agorbis-d72-supabase-catalog-domains/v3";
export const D72_SUPABASE_CATALOG_DOMAIN_IDS = Object.freeze([
  "app-controlled-rls",
  "residency-write-boundary",
  "anti-abuse-limits",
  "integrity-structures",
]);

const APP_CONTROLLED_SCHEMAS = new Set(["private", "public"]);
const APP_CONTROLLED_STORAGE_POLICY_NAMES = new Set([
  "geounity_avatar_delete",
  "geounity_avatar_insert",
  "geounity_avatar_update",
  "geounity_claim_delete_pending",
  "geounity_claim_insert",
  "geounity_own_folder_delete",
  "geounity_own_folder_insert",
  "geounity_own_folder_update",
  "geounity_public_read",
]);
const INTEGRITY_RELATION_KEYS = new Set([
  "private.google_auth_consent_barriers",
  "public.google_auth_notice_versions",
  "public.user_google_auth_consent_events",
  "private.data_deletion_lookup_windows",
  "private.data_deletion_requests",
  "private.public_profile_handles",
  "public.notification_preferences",
  "public.notifications",
  "private.budget_proposal_tallies",
  "private.poll_option_tallies",
  "public.budget_participation_receipts",
  "public.budget_proposals",
  "public.claim_supports",
  "public.claims",
  "public.comment_votes",
  "public.debate_comments",
  "public.poll_options",
  "public.poll_participation_receipts",
]);
const RESIDENCY_CATALOG_PATTERN =
  /(?:community_id|is_member|residen|home_community)/i;
const ANTI_ABUSE_CATALOG_PATTERN =
  /(?:abuse|cooldown|limit|quota|consume_window_limit|assert_can_participate|suspension)/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected, label) {
  invariant(isPlainObject(value), `${label} no es un objeto JSON plano.`);
  invariant(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort()),
    `${label} contiene campos faltantes o no aprobados.`,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
  return sha256(canonicalJson(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeText(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  invariant(
    typeof value === "string" &&
      value.length <= MAX_CATALOG_TEXT_LENGTH &&
      !/[\0\r]/.test(value),
    `${label} no es texto de catálogo seguro.`,
  );
  return value;
}

function safeIdentifier(value, label) {
  invariant(
    typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value),
    `${label} no es un identificador PostgreSQL permitido.`,
  );
  return value;
}

function safeSchema(value, label) {
  invariant(
    ["private", "public", "storage"].includes(value),
    `${label} no pertenece al alcance read-only aprobado.`,
  );
  return value;
}

function safeBoolean(value, label) {
  invariant(typeof value === "boolean", `${label} debe ser booleano.`);
  return value;
}

function safeInteger(value, label, { minimum = 0 } = {}) {
  invariant(
    Number.isSafeInteger(value) && value >= minimum,
    `${label} debe ser un entero seguro.`,
  );
  return value;
}

function safeTextArray(value, label) {
  invariant(
    Array.isArray(value) && value.length <= MAX_CATALOG_ARRAY_LENGTH,
    `${label} no es una lista acotada.`,
  );
  return value.map((entry, index) => safeText(entry, `${label}[${index}]`));
}

function assertSortedUnique(entries, keyOf, label) {
  const keys = entries.map(keyOf);
  const sorted = [...keys].sort();
  invariant(
    JSON.stringify(keys) === JSON.stringify(sorted),
    `${label} no está ordenado canónicamente.`,
  );
  invariant(
    new Set(keys).size === keys.length,
    `${label} contiene identidades duplicadas.`,
  );
}

function safeUtcInstant(value, label) {
  invariant(typeof value === "string", `${label} debe ser un timestamp UTC.`);
  const parsed = new Date(value);
  invariant(
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === value,
    `${label} debe ser un timestamp UTC canónico.`,
  );
  return value;
}

function safeHead(value) {
  invariant(
    typeof value === "string" && FULL_HEAD_PATTERN.test(value),
    "head debe ser un SHA-1 Git completo en minúsculas.",
  );
  return value;
}

function safeHash(value, label) {
  invariant(
    typeof value === "string" && SHA256_PATTERN.test(value),
    `${label} debe ser un SHA-256 completo en minúsculas.`,
  );
  return value;
}

// La primera rama de `acl_entries` fija el tipo de cada columna del union.
// Con `n.nspname` (tipo `name`) toda `object_identity` quedaba truncada a 63
// bytes, y dos sobrecargas de firma larga colapsaban en el mismo grant (D103).
export const D72_SUPABASE_CATALOG_SQL = `with selected_schemas(schema_name) as (
  values ('private'::name), ('public'::name), ('storage'::name)
), acl_entries as (
  select 'schema'::text as object_kind, n.nspname as schema_name,
    n.nspname::text as object_identity, ''::text as detail,
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  from pg_namespace n
  join selected_schemas s on s.schema_name = n.nspname
  cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
  union all
  select 'relation:' || c.relkind::text, n.nspname, c.relname, '',
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join selected_schemas s on s.schema_name = n.nspname
  cross join lateral aclexplode(coalesce(c.relacl,
    acldefault(case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end, c.relowner))) acl
  where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  union all
  select 'column:' || c.relkind::text, n.nspname, c.relname, a.attname,
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join selected_schemas s on s.schema_name = n.nspname
  cross join lateral aclexplode(a.attacl) acl
  where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    and a.attnum > 0 and not a.attisdropped
  union all
  select 'function', n.nspname,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '',
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join selected_schemas s on s.schema_name = n.nspname
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  union all
  select 'type', n.nspname, t.typname, '',
    acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join selected_schemas s on s.schema_name = n.nspname
  cross join lateral aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) acl
  where t.typtype <> 'p'
)
select jsonb_build_object(
  'schemaVersion', '${D72_SUPABASE_CATALOG_SCHEMA_VERSION}',
  'schemas', coalesce((
    select jsonb_agg(n.nspname order by n.nspname collate "C")
    from pg_namespace n
    join selected_schemas s on s.schema_name = n.nspname
  ), '[]'::jsonb),
  'relations', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', c.relkind::text,
      'owner', pg_get_userbyid(c.relowner),
      'persistence', c.relpersistence::text,
      'replicaIdentity', c.relreplident::text,
      'rls', c.relrowsecurity,
      'forceRls', c.relforcerowsecurity,
      'viewDefinition', case when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid, false) else null end
    ) order by n.nspname collate "C", c.relname collate "C", c.relkind::text collate "C")
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join selected_schemas s on s.schema_name = n.nspname
    where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  ), '[]'::jsonb),
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'ordinal', a.attnum,
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull,
      'identity', a.attidentity::text,
      'generated', a.attgenerated::text,
      'collation', case when a.attcollation = 0 then null else quote_ident(cn.nspname) || '.' || quote_ident(coll.collname) end,
      'default', pg_get_expr(ad.adbin, ad.adrelid)
    ) order by n.nspname collate "C", c.relname collate "C", a.attnum)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join selected_schemas s on s.schema_name = n.nspname
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    left join pg_collation coll on coll.oid = a.attcollation
    left join pg_namespace cn on cn.oid = coll.collnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
      and a.attnum > 0 and not a.attisdropped
  ), '[]'::jsonb),
  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', con.conname,
      'type', con.contype::text,
      'definition', pg_get_constraintdef(con.oid, false),
      'validated', con.convalidated,
      'deferrable', con.condeferrable,
      'deferred', con.condeferred
    ) order by n.nspname collate "C", c.relname collate "C", con.conname collate "C")
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join selected_schemas s on s.schema_name = n.nspname
  ), '[]'::jsonb),
  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', irel.relname,
      'definition', pg_get_indexdef(i.indexrelid),
      'unique', i.indisunique,
      'primary', i.indisprimary,
      'valid', i.indisvalid,
      'ready', i.indisready
    ) order by n.nspname collate "C", c.relname collate "C", irel.relname collate "C")
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_class irel on irel.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    join selected_schemas s on s.schema_name = n.nspname
  ), '[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', p.schemaname,
      'table', p.tablename,
      'name', p.policyname,
      'permissive', p.permissive,
      'roles', p.roles,
      'command', p.cmd,
      'using', p.qual,
      'check', p.with_check
    ) order by p.schemaname collate "C", p.tablename collate "C", p.policyname collate "C")
    from pg_policies p
    join selected_schemas s on s.schema_name = p.schemaname
  ), '[]'::jsonb),
  'grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'objectKind', object_kind,
      'schema', schema_name,
      'identity', object_identity,
      'detail', detail,
      'grantor', pg_get_userbyid(grantor),
      'grantee', case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee) end,
      'privilege', privilege_type,
      'grantable', is_grantable
    ) order by object_kind collate "C", schema_name collate "C",
      object_identity collate "C", detail collate "C",
      (case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee) end) collate "C",
      privilege_type collate "C", pg_get_userbyid(grantor) collate "C", is_grantable)
    from acl_entries
  ), '[]'::jsonb),
  'functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'owner', pg_get_userbyid(p.proowner),
      'securityDefiner', p.prosecdef,
      'leakproof', p.proleakproof,
      'volatility', p.provolatile::text,
      'parallel', p.proparallel::text,
      'config', coalesce(to_jsonb(p.proconfig), '[]'::jsonb),
      'definition', pg_get_functiondef(p.oid)
    ) order by n.nspname collate "C", p.proname collate "C",
      pg_get_function_identity_arguments(p.oid) collate "C")
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join selected_schemas s on s.schema_name = n.nspname
  ), '[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', t.tgname,
      'enabled', t.tgenabled::text,
      'definition', pg_get_triggerdef(t.oid, false)
    ) order by n.nspname collate "C", c.relname collate "C", t.tgname collate "C")
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join selected_schemas s on s.schema_name = n.nspname
    where not t.tgisinternal
  ), '[]'::jsonb),
  'types', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', t.typname,
      'kind', t.typtype::text,
      'category', t.typcategory::text,
      'owner', pg_get_userbyid(t.typowner),
      'baseType', case when t.typbasetype = 0 then null else format_type(t.typbasetype, t.typtypmod) end,
      'enumLabels', coalesce((
        select jsonb_agg(e.enumlabel order by e.enumsortorder)
        from pg_enum e where e.enumtypid = t.oid
      ), '[]'::jsonb)
    ) order by n.nspname collate "C", t.typname collate "C")
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join selected_schemas s on s.schema_name = n.nspname
    where t.typtype <> 'p' and not exists (
      select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'
    )
  ), '[]'::jsonb)
)::text`;

export const D72_SUPABASE_AGGREGATE_CHECKS_SQL = `with checks(id, invalid_row_count) as (
  select 'integrity.unvalidated-constraints', count(*)
  from pg_constraint con
  join pg_namespace n on n.oid = con.connamespace
  where n.nspname in ('private', 'public', 'storage') and not con.convalidated
  union all
  select 'integrity.invalid-indexes', count(*)
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('private', 'public', 'storage')
    and (not i.indisvalid or not i.indisready)
  union all
  select 'integrity.poll-tally-shape-mismatch',
    (select count(*) from private.poll_option_tallies t
      where t.participants <> (
        select count(*) from public.poll_participation_receipts r where r.poll_id = t.poll_id
      )) +
    (select count(*) from public.poll_options o
      where exists (
        select 1 from public.poll_participation_receipts r where r.poll_id = o.poll_id
      ) and not exists (
        select 1 from private.poll_option_tallies t
        where t.poll_id = o.poll_id and t.option_id = o.id
      ))
  union all
  select 'integrity.budget-tally-shape-mismatch',
    (select count(*) from private.budget_proposal_tallies t
      where t.participants <> (
        select count(*) from public.budget_participation_receipts r where r.budget_id = t.budget_id
      ) or t.voters > t.participants) +
    (select count(*) from public.budget_proposals p
      where exists (
        select 1 from public.budget_participation_receipts r where r.budget_id = p.budget_id
      ) and not exists (
        select 1 from private.budget_proposal_tallies t
        where t.budget_id = p.budget_id and t.proposal_id = p.id
      ))
  union all
  select 'integrity.claim-support-count-mismatch', count(*)
  from public.claims c
  where c.support_count <> (
    select count(*) from public.claim_supports s where s.claim_id = c.id
  )
  union all
  select 'integrity.comment-score-mismatch', count(*)
  from public.debate_comments c
  where c.score <> coalesce((
    select sum(v.value) from public.comment_votes v where v.comment_id = c.id
  ), 0)
  union all
  select 'd68.individual-ballot-relations', count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('private', 'public', 'storage')
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and c.relname in ('poll_votes', 'budget_votes', 'poll_ballots', 'budget_ballots')
  union all
  select 'd68.individual-ballot-columns', count(*)
  from (
    select n.nspname, c.relname
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('private', 'public', 'storage')
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and a.attnum > 0 and not a.attisdropped
    group by n.nspname, c.relname
    having bool_or(a.attname in ('user_id', 'account_id', 'profile_id'))
      and bool_or(a.attname in ('option_id', 'proposal_id', 'choice_id', 'tokens', 'allocation'))
  ) reidentifiable_relations
  union all
  select 'd68.reidentifying-functions', count(*)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('private', 'public', 'storage')
    and p.proname in (
      'poll_option_voters', 'poll_option_anonymous_counts',
      'poll_results_by_child', 'sibling_poll_contrast',
      'prepare_poll_vote', 'guard_budget_vote', 'replace_budget_vote'
    )
  union all
  select 'd68.poll-tally-transaction-divergence', coalesce(sum(rows_in_group), 0)::bigint
  from (
    select count(*)::bigint as rows_in_group
    from private.poll_option_tallies
    group by poll_id
    having count(distinct xmin::text) > 1
  ) divergent_poll_groups
  union all
  select 'd68.budget-tally-transaction-divergence', coalesce(sum(rows_in_group), 0)::bigint
  from (
    select count(*)::bigint as rows_in_group
    from private.budget_proposal_tallies
    group by budget_id
    having count(distinct xmin::text) > 1
  ) divergent_budget_groups
)
select jsonb_build_object(
  'schemaVersion', '${D72_SUPABASE_CHECKS_SCHEMA_VERSION}',
  'checks', coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'invalidRowCount', invalid_row_count::text
  ) order by id collate "C"), '[]'::jsonb)
)::text
from checks`;

export const D72_SUPABASE_READONLY_QUERY_IDS = Object.freeze([
  "aggregate-checks",
  "catalog",
]);

const QUERY_SQL_BY_ID = Object.freeze({
  "aggregate-checks": D72_SUPABASE_AGGREGATE_CHECKS_SQL,
  catalog: D72_SUPABASE_CATALOG_SQL,
});
const APPROVED_QUERY_HASHES = new Set(
  Object.values(QUERY_SQL_BY_ID).map((sql) => sha256(sql)),
);

export const D72_SUPABASE_READONLY_QUERY_SHA256 = deepFreeze(
  Object.fromEntries(
    Object.entries(QUERY_SQL_BY_ID).map(([queryId, sql]) => [
      queryId,
      sha256(sql),
    ]),
  ),
);

export function d72SupabaseCliArgs(kind) {
  if (kind === "migration-list") return D72_SUPABASE_MIGRATION_LIST_ARGS;
  if (kind === "db-push-dry-run") {
    return D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS;
  }
  throw new Error("Comando Supabase D72 desconocido.");
}

export function assertD72SupabaseCliArgs(kind, args) {
  const expected = d72SupabaseCliArgs(kind);
  invariant(
    Array.isArray(args) &&
      JSON.stringify(args) === JSON.stringify(expected) &&
      !args.includes("--linked") &&
      !args.includes("--include-all") &&
      !args.includes("--include-roles") &&
      !args.includes("--include-seed") &&
      !args.includes("--password") &&
      !args.includes("--db-url"),
    "argv Supabase no coincide exactamente con la política D72 read-only.",
  );
  return true;
}

export function d72SupabaseReadonlyQuery(queryId) {
  invariant(
    Object.hasOwn(QUERY_SQL_BY_ID, queryId),
    "Consulta Supabase D72 desconocida.",
  );
  const sql = QUERY_SQL_BY_ID[queryId];
  assertApprovedProductionQuery(sql, APPROVED_QUERY_HASHES);
  invariant(
    sha256(sql) === D72_SUPABASE_READONLY_QUERY_SHA256[queryId],
    "La consulta Supabase D72 no coincide con su digest fijado.",
  );
  return sql;
}

export function buildD72ProductionReadonlyInvocation({
  queryId,
  connection,
  imageId = PRODUCTION_QUERY_POSTGRES_IMAGE_ID,
  assets,
}) {
  const invocation = buildProductionPsqlContainerInvocation({
    connection,
    imageId,
    sql: d72SupabaseReadonlyQuery(queryId),
    assets,
  });
  const args = [...invocation.args];
  const passwordEnvironmentIndex = args.findIndex(
    (entry, index) => entry === "-e" && args[index + 1] === "PGPASSWORD",
  );
  const runIndex = args.indexOf("run");
  const entrypointIndex = args.indexOf("--entrypoint");
  const imageIndex = args.indexOf(imageId);
  invariant(
    invocation.command === "docker" &&
      passwordEnvironmentIndex > runIndex &&
      entrypointIndex > passwordEnvironmentIndex &&
      args[entrypointIndex + 1] === "psql" &&
      imageIndex === entrypointIndex + 2,
    "La invocación psql base no coincide con la forma fijada.",
  );
  args.splice(passwordEnvironmentIndex, 2);
  args.splice(runIndex + 1, 0, "--interactive");
  const adjustedEntrypointIndex = args.indexOf("--entrypoint");
  args[adjustedEntrypointIndex + 1] = "/bin/sh";
  const adjustedImageIndex = args.indexOf(imageId);
  args.splice(
    adjustedImageIndex + 1,
    0,
    "-ceu",
    D72_SUPABASE_PSQL_STDIN_ENTRYPOINT,
    "agorbis-d72-psql",
  );
  return Object.freeze({
    args: Object.freeze([
      "--config",
      path.join(
        assets.repositoryRoot,
        D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
      ),
      "--host",
      D72_SUPABASE_DOCKER_HOST,
      ...args,
    ]),
    command: invocation.command,
  });
}

export function buildD72ProductionReadonlyEnvironment({
  baseEnvironment,
  connection,
  password,
  assets,
}) {
  const environment = buildProductionPsqlEnvironment(
    baseEnvironment,
    connection,
    password,
    assets,
  );
  delete environment.PGPASSWORD;
  delete environment.DOCKER_HOST;
  delete environment.DOCKER_CONTEXT;
  environment.DOCKER_CONFIG = path.join(
    assets.repositoryRoot,
    D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
  );
  return environment;
}

function validateCatalogEntry(section, entry, index) {
  const label = `catalog.${section}[${index}]`;
  exactKeys(entry, CATALOG_ENTRY_KEYS[section], label);
  safeSchema(entry.schema, `${label}.schema`);

  if (section === "relations") {
    safeIdentifier(entry.name, `${label}.name`);
    invariant(
      ["r", "p", "v", "m", "S", "f"].includes(entry.kind),
      `${label}.kind no está permitido.`,
    );
    safeIdentifier(entry.owner, `${label}.owner`);
    invariant(
      ["p", "u", "t"].includes(entry.persistence),
      `${label}.persistence no está permitido.`,
    );
    invariant(
      ["d", "n", "f", "i"].includes(entry.replicaIdentity),
      `${label}.replicaIdentity no está permitido.`,
    );
    safeBoolean(entry.rls, `${label}.rls`);
    safeBoolean(entry.forceRls, `${label}.forceRls`);
    safeText(entry.viewDefinition, `${label}.viewDefinition`, {
      nullable: true,
    });
  } else if (section === "columns") {
    safeIdentifier(entry.table, `${label}.table`);
    safeInteger(entry.ordinal, `${label}.ordinal`, { minimum: 1 });
    safeIdentifier(entry.name, `${label}.name`);
    safeText(entry.type, `${label}.type`);
    safeBoolean(entry.notNull, `${label}.notNull`);
    invariant(
      ["", "a", "d"].includes(entry.identity),
      `${label}.identity no está permitido.`,
    );
    invariant(
      ["", "s"].includes(entry.generated),
      `${label}.generated no está permitido.`,
    );
    safeText(entry.collation, `${label}.collation`, { nullable: true });
    safeText(entry.default, `${label}.default`, { nullable: true });
  } else if (section === "constraints") {
    safeIdentifier(entry.table, `${label}.table`);
    safeIdentifier(entry.name, `${label}.name`);
    invariant(
      ["c", "f", "p", "u", "t", "x"].includes(entry.type),
      `${label}.type no está permitido.`,
    );
    safeText(entry.definition, `${label}.definition`);
    safeBoolean(entry.validated, `${label}.validated`);
    safeBoolean(entry.deferrable, `${label}.deferrable`);
    safeBoolean(entry.deferred, `${label}.deferred`);
  } else if (section === "indexes") {
    safeIdentifier(entry.table, `${label}.table`);
    safeIdentifier(entry.name, `${label}.name`);
    safeText(entry.definition, `${label}.definition`);
    for (const key of ["unique", "primary", "valid", "ready"]) {
      safeBoolean(entry[key], `${label}.${key}`);
    }
  } else if (section === "policies") {
    safeIdentifier(entry.table, `${label}.table`);
    safeIdentifier(entry.name, `${label}.name`);
    invariant(
      ["PERMISSIVE", "RESTRICTIVE"].includes(entry.permissive),
      `${label}.permissive no está permitido.`,
    );
    safeTextArray(entry.roles, `${label}.roles`);
    invariant(
      ["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"].includes(entry.command),
      `${label}.command no está permitido.`,
    );
    safeText(entry.using, `${label}.using`, { nullable: true });
    safeText(entry.check, `${label}.check`, { nullable: true });
  } else if (section === "grants") {
    safeText(entry.objectKind, `${label}.objectKind`);
    safeText(entry.identity, `${label}.identity`);
    safeText(entry.detail, `${label}.detail`);
    safeIdentifier(entry.grantor, `${label}.grantor`);
    safeIdentifier(entry.grantee, `${label}.grantee`);
    safeText(entry.privilege, `${label}.privilege`);
    safeBoolean(entry.grantable, `${label}.grantable`);
  } else if (section === "functions") {
    safeIdentifier(entry.name, `${label}.name`);
    safeText(entry.arguments, `${label}.arguments`);
    safeText(entry.result, `${label}.result`);
    safeIdentifier(entry.owner, `${label}.owner`);
    safeBoolean(entry.securityDefiner, `${label}.securityDefiner`);
    safeBoolean(entry.leakproof, `${label}.leakproof`);
    invariant(
      ["i", "s", "v"].includes(entry.volatility),
      `${label}.volatility no está permitido.`,
    );
    invariant(
      ["s", "r", "u"].includes(entry.parallel),
      `${label}.parallel no está permitido.`,
    );
    safeTextArray(entry.config, `${label}.config`);
    safeText(entry.definition, `${label}.definition`);
  } else if (section === "triggers") {
    safeIdentifier(entry.table, `${label}.table`);
    safeIdentifier(entry.name, `${label}.name`);
    invariant(
      ["O", "D", "R", "A"].includes(entry.enabled),
      `${label}.enabled no está permitido.`,
    );
    safeText(entry.definition, `${label}.definition`);
  } else if (section === "types") {
    safeIdentifier(entry.name, `${label}.name`);
    invariant(
      ["b", "c", "d", "e", "m", "r"].includes(entry.kind),
      `${label}.kind no está permitido.`,
    );
    safeText(entry.category, `${label}.category`);
    safeIdentifier(entry.owner, `${label}.owner`);
    safeText(entry.baseType, `${label}.baseType`, { nullable: true });
    safeTextArray(entry.enumLabels, `${label}.enumLabels`);
  }
  return entry;
}

export function validateD72SupabaseCatalogSnapshot(snapshot) {
  exactKeys(snapshot, CATALOG_KEYS, "catalog");
  invariant(
    snapshot.schemaVersion === D72_SUPABASE_CATALOG_SCHEMA_VERSION,
    "Versión de schema del catálogo Supabase D72 inesperada.",
  );
  invariant(
    JSON.stringify(snapshot.schemas) ===
      JSON.stringify(["private", "public", "storage"]),
    "El catálogo no contiene exactamente private/public/storage.",
  );

  for (const section of D72_SUPABASE_CATALOG_SECTIONS.slice(1)) {
    invariant(
      Array.isArray(snapshot[section]) &&
        snapshot[section].length <= MAX_CATALOG_ARRAY_LENGTH,
      `catalog.${section} no es una lista acotada.`,
    );
    snapshot[section].forEach((entry, index) =>
      validateCatalogEntry(section, entry, index),
    );
    assertSortedUnique(
      snapshot[section],
      ENTRY_SORT_KEYS[section],
      `catalog.${section}`,
    );
  }
  return deepFreeze(snapshot);
}

export function validateD72SupabaseAggregateChecks(payload) {
  exactKeys(payload, CHECK_PAYLOAD_KEYS, "aggregateChecks");
  invariant(
    payload.schemaVersion === D72_SUPABASE_CHECKS_SCHEMA_VERSION,
    "Versión de schema de checks Supabase D72 inesperada.",
  );
  invariant(
    Array.isArray(payload.checks) &&
      payload.checks.length === D72_SUPABASE_AGGREGATE_CHECK_IDS.length,
    "El conjunto de checks agregados Supabase D72 no es exacto.",
  );
  const ids = [];
  for (const [index, check] of payload.checks.entries()) {
    exactKeys(check, CHECK_KEYS, `aggregateChecks.checks[${index}]`);
    invariant(
      D72_SUPABASE_AGGREGATE_CHECK_IDS.includes(check.id),
      "El payload contiene un check agregado desconocido.",
    );
    invariant(
      typeof check.invalidRowCount === "string" &&
        /^(?:0|[1-9]\d{0,29})$/.test(check.invalidRowCount),
      `${check.id} no tiene un conteo decimal canónico.`,
    );
    ids.push(check.id);
  }
  invariant(
    JSON.stringify(ids) === JSON.stringify(D72_SUPABASE_AGGREGATE_CHECK_IDS),
    "Los checks agregados no están completos y ordenados.",
  );
  return deepFreeze(payload);
}

export function parseD72ProductionQueryOutput(queryId, output) {
  const parsed = parseProductionPsqlJson(output);
  if (queryId === "catalog") {
    return validateD72SupabaseCatalogSnapshot(parsed);
  }
  if (queryId === "aggregate-checks") {
    return validateD72SupabaseAggregateChecks(parsed);
  }
  throw new Error("Consulta Supabase D72 desconocida.");
}

function safeCliJson(stdout, label) {
  invariant(
    typeof stdout === "string" &&
      Buffer.byteLength(stdout, "utf8") <= MAX_CLI_JSON_BYTES &&
      !/[\0\r]/.test(stdout),
    `${label} no devolvió JSON seguro.`,
  );
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${label} no devolvió un único JSON válido.`);
  }
}

function assertSuccessfulCliResult(result, label) {
  invariant(
    isPlainObject(result) &&
      !result.error &&
      result.status === 0 &&
      result.signal === null &&
      typeof result.stdout === "string" &&
      typeof result.stderr === "string",
    `${label} no terminó exitosamente.`,
  );
}

function ledgerDigest(versions) {
  return sha256Canonical(versions);
}

function classifyD72MigrationRows(rows) {
  const appliedBeforeCandidate = D72_SUPABASE_BASELINE_MIGRATION_VERSIONS;
  const expectedPrepared = D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.map(
    (version) => ({
      local: version,
      remote: appliedBeforeCandidate.includes(version) ? version : null,
      time: version,
    }),
  );
  const expectedApplied = D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS.map(
    (version) => ({ local: version, remote: version, time: version }),
  );
  if (canonicalJson(rows) === canonicalJson(expectedPrepared)) {
    return {
      errors: [],
      state: READ_ONLY_PREVIEW_MIGRATION_STATE.PREPARED_NOT_APPLIED,
    };
  }
  if (canonicalJson(rows) === canonicalJson(expectedApplied)) {
    return {
      errors: [],
      state: READ_ONLY_PREVIEW_MIGRATION_STATE.APPLIED_EXACT,
    };
  }
  const local = rows
    .filter((row) => row.local !== null)
    .map((row) => row.local);
  const remote = rows
    .filter((row) => row.remote !== null)
    .map((row) => row.remote);
  const errors = [];
  if (
    canonicalJson(local) !==
    canonicalJson(D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS)
  ) {
    errors.push("El ledger local D72 no coincide con 0001–0058 + 0060–0067.");
  }
  if (
    canonicalJson(remote) !== canonicalJson(appliedBeforeCandidate) &&
    canonicalJson(remote) !==
      canonicalJson(D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS)
  ) {
    errors.push(
      "El ledger productivo D72 no coincide con el estado base 0061 o candidato completo 0067.",
    );
  }
  if (rows.some((row) => row.time !== (row.local ?? row.remote))) {
    errors.push(
      "La columna Time de migration list no coincide con Local/Remote.",
    );
  }
  if (errors.length === 0) {
    errors.push("migration list no coincide con una secuencia D72 aprobada.");
  }
  return { errors, state: READ_ONLY_PREVIEW_MIGRATION_STATE.INVALID };
}

export function parseD72MigrationListResult(result) {
  assertSuccessfulCliResult(result, "migration list");
  const updateNoticeIsFinal = result.stderr.endsWith(
    D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE,
  );
  const cleanedStderr = removeKnownSupabaseUpdateNotice(result.stderr);
  invariant(
    typeof cleanedStderr === "string" &&
      (updateNoticeIsFinal
        ? cleanedStderr ===
          result.stderr.slice(
            0,
            -D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE.length,
          )
        : cleanedStderr === result.stderr) &&
      cleanedStderr ===
        `${D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX.join("\n")}\n`,
    "migration list no acreditó el preámbulo remoto exacto.",
  );
  const parsedStdout = safeCliJson(result.stdout, "migration list");
  const canonicalStdout =
    isPlainObject(parsedStdout) &&
    Array.isArray(parsedStdout.migrations) &&
    parsedStdout.migrations.every(isPlainObject)
      ? `${JSON.stringify({
          migrations: parsedStdout.migrations.map((row) => ({
            local: row.local,
            remote: row.remote,
            time: row.time,
          })),
          message: parsedStdout.message,
        })}\n`
      : null;
  invariant(
    result.stdout === canonicalStdout,
    "migration list no devolvió JSON canónico exacto.",
  );
  const rows = parseMigrationListOutput(result.stdout, result.stderr);
  const classification = classifyD72MigrationRows(rows);
  const localVersions = rows
    .filter(({ local }) => local !== null)
    .map(({ local }) => local);
  const remoteVersions = rows
    .filter(({ remote }) => remote !== null)
    .map(({ remote }) => remote);
  const summary = {
    errors: [...classification.errors],
    executable0059Present: localVersions.includes("0059"),
    localLedgerDigest: ledgerDigest(localVersions),
    localMaximumVersion: localVersions.at(-1) ?? null,
    localVersions,
    production0059Present: remoteVersions.includes("0059"),
    production0060Present: remoteVersions.includes("0060"),
    remoteLedgerDigest: ledgerDigest(remoteVersions),
    remoteMaximumVersion: remoteVersions.at(-1) ?? null,
    remoteVersions,
    rows,
    state: classification.state,
  };
  return deepFreeze(summary);
}

export function parseD72DbPushDryRunResult(result) {
  assertSuccessfulCliResult(result, "db push --dry-run --skip-vault");
  const parsed = safeCliJson(result.stdout, "db push --dry-run --skip-vault");
  exactKeys(
    parsed,
    ["dryRun", "message", "migrations", "roles", "seeds", "upToDate"],
    "dbPushDryRun",
  );
  safeBoolean(parsed.dryRun, "dbPushDryRun.dryRun");
  safeBoolean(parsed.upToDate, "dbPushDryRun.upToDate");
  invariant(parsed.dryRun, "Supabase no confirmó dryRun=true.");
  invariant(
    Array.isArray(parsed.migrations) && parsed.migrations.length <= 1_000,
    "dbPushDryRun.migrations no es una lista acotada.",
  );
  invariant(
    parsed.migrations.every(
      (entry) =>
        typeof entry === "string" && MIGRATION_FILE_PATTERN.test(entry),
    ),
    "dbPushDryRun.migrations contiene nombres no canónicos.",
  );
  invariant(
    new Set(parsed.migrations).size === parsed.migrations.length,
    "dbPushDryRun.migrations contiene duplicados.",
  );
  invariant(
    parsed.migrations.length === 0 ||
      JSON.stringify(parsed.migrations) ===
        JSON.stringify(D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS),
    `db push propone una migración no aprobada por ${D72_SUPABASE_DB_PUSH_DRY_RUN_STATE}.`,
  );
  invariant(
    Array.isArray(parsed.roles) &&
      parsed.roles.every((entry) => entry === "supabase/roles.sql"),
    "dbPushDryRun.roles contiene rutas no aprobadas.",
  );
  invariant(
    Array.isArray(parsed.seeds) &&
      parsed.seeds.every(
        (entry) =>
          typeof entry === "string" &&
          /^(?:supabase\/)?[A-Za-z0-9_.\/-]+\.sql$/.test(entry) &&
          !entry.includes(".."),
      ),
    "dbPushDryRun.seeds contiene rutas no aprobadas.",
  );
  const expectedMessage = parsed.upToDate
    ? "Remote database is up to date."
    : "Finished supabase db push.";
  invariant(
    parsed.message === expectedMessage,
    "db push devolvió un mensaje estructurado inesperado.",
  );
  invariant(
    parsed.upToDate ===
      (parsed.migrations.length === 0 &&
        parsed.roles.length === 0 &&
        parsed.seeds.length === 0),
    "db push contradice upToDate con su inventario de cambios.",
  );

  const updateNoticeIsFinal = result.stderr.endsWith(
    D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE,
  );
  const cleanedStderr = removeKnownSupabaseUpdateNotice(result.stderr);
  invariant(
    typeof cleanedStderr === "string" &&
      (updateNoticeIsFinal
        ? cleanedStderr ===
          result.stderr.slice(
            0,
            -D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE.length,
          )
        : cleanedStderr === result.stderr) &&
      cleanedStderr.endsWith("\n") &&
      !cleanedStderr.includes("\r") &&
      !cleanedStderr.endsWith("\n\n"),
    "db push devolvió stderr inválido.",
  );
  const lines = cleanedStderr.slice(0, -1).split("\n");
  invariant(
    lines.every((line) => line.length > 0),
    "db push devolvió líneas vacías no aprobadas.",
  );
  invariant(
    lines.length >= D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.length &&
      D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.every(
        (line, index) => lines[index] === line,
      ),
    "db push no acreditó el preámbulo dry-run remoto exacto.",
  );
  const changeLines = lines.slice(
    D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX.length,
  );
  if (parsed.upToDate) {
    invariant(
      changeLines.length === 0,
      "db push up-to-date devolvió stderr adicional no aprobado.",
    );
  } else {
    const expectedChangeLines = [
      D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
      ...parsed.migrations.map((migration) => ` • ${migration}`),
    ];
    invariant(
      parsed.migrations.length > 0 &&
        parsed.roles.length === 0 &&
        parsed.seeds.length === 0 &&
        JSON.stringify(changeLines) === JSON.stringify(expectedChangeLines),
      "db push devolvió una descripción de cambios distinta del único preámbulo pendiente aprobado.",
    );
  }

  return deepFreeze({
    changeCounts: {
      migrations: parsed.migrations.length,
      roles: parsed.roles.length,
      seeds: parsed.seeds.length,
      vault: 0,
    },
    changeInventoryDigest: sha256Canonical({
      migrations: parsed.migrations,
      roles: parsed.roles,
      seeds: parsed.seeds,
    }),
    dryRun: true,
    migrations: [...parsed.migrations],
    roles: [...parsed.roles],
    seeds: [...parsed.seeds],
    upToDate: parsed.upToDate,
  });
}

function parseMigrationFiles(files, label) {
  invariant(
    Array.isArray(files) && files.length <= 1_000,
    `${label} no es un inventario acotado.`,
  );
  const parsed = files.map((fileName) => {
    invariant(
      typeof fileName === "string" && MIGRATION_FILE_PATTERN.test(fileName),
      `${label} contiene un archivo no canónico.`,
    );
    const [, version] = MIGRATION_FILE_PATTERN.exec(fileName);
    return { fileName, version };
  });
  invariant(
    new Set(parsed.map(({ fileName }) => fileName)).size === parsed.length &&
      new Set(parsed.map(({ version }) => version)).size === parsed.length,
    `${label} contiene nombres o versiones duplicadas.`,
  );
  invariant(
    JSON.stringify(parsed.map(({ fileName }) => fileName)) ===
      JSON.stringify(parsed.map(({ fileName }) => fileName).sort()),
    `${label} no está ordenado canónicamente.`,
  );
  return parsed;
}

export function buildD72RepositoryMigrationInventory({
  draftFileNames,
  executableFileNames,
}) {
  const executable = parseMigrationFiles(
    executableFileNames,
    "migrations ejecutables",
  );
  const drafts = parseMigrationFiles(draftFileNames, "migration-drafts");
  const executableVersions = executable.map(({ version }) => version);
  const draftVersions = drafts.map(({ version }) => version);
  return deepFreeze({
    digest: sha256Canonical({ draftFileNames, executableFileNames }),
    draft0059Present: draftVersions.includes("0059"),
    draftFileNames: [...draftFileNames],
    draftVersions,
    exactExecutableLedger:
      validateProductionMigrationFiles(executableFileNames).length === 0,
    executable0059Present: executableVersions.includes("0059"),
    executable0060Present: executableVersions.includes("0060"),
    executableFileNames: [...executableFileNames],
    executableVersions,
  });
}

export function compareD72SupabaseCatalogSnapshots(local, production) {
  validateD72SupabaseCatalogSnapshot(local);
  validateD72SupabaseCatalogSnapshot(production);
  const sectionMatches = Object.fromEntries(
    D72_SUPABASE_CATALOG_SECTIONS.map((section) => [
      section,
      canonicalJson(local[section]) === canonicalJson(production[section]),
    ]),
  );
  return deepFreeze({
    localDigest: sha256Canonical(local),
    matches: Object.values(sectionMatches).every(Boolean),
    productionDigest: sha256Canonical(production),
    sectionMatches,
  });
}

function catalogRelationKey(schema, name) {
  return `${schema}.${name}`;
}

function catalogEntryRelationKey(entry) {
  return catalogRelationKey(entry.schema, entry.table ?? entry.name);
}

function catalogGrantFunctionName(entry) {
  if (entry.objectKind !== "function") return null;
  const separator = entry.identity.indexOf("(");
  return separator === -1 ? entry.identity : entry.identity.slice(0, separator);
}

function grantTargetsRelationsOrFunctions(entry, relationKeys, functionNames) {
  if (
    (entry.objectKind.startsWith("relation:") ||
      entry.objectKind.startsWith("column:")) &&
    relationKeys.has(catalogRelationKey(entry.schema, entry.identity))
  ) {
    return true;
  }
  const functionName = catalogGrantFunctionName(entry);
  return functionName !== null && functionNames.has(functionName);
}

function appControlledRlsDomain(catalog) {
  return {
    triggers: catalog.triggers.filter((entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema),
    ),
    functions: catalog.functions.filter((entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema),
    ),
    grants: catalog.grants.filter((entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema),
    ),
    policies: catalog.policies.filter(
      (entry) =>
        APP_CONTROLLED_SCHEMAS.has(entry.schema) ||
        (entry.schema === "storage" &&
          entry.table === "objects" &&
          APP_CONTROLLED_STORAGE_POLICY_NAMES.has(entry.name)),
    ),
    relations: catalog.relations
      .filter(
        (entry) =>
          APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
          ["r", "p"].includes(entry.kind),
      )
      .map(({ forceRls, kind, name, owner, rls, schema }) => ({
        forceRls,
        kind,
        name,
        owner,
        rls,
        schema,
      })),
  };
}

function residencyDomain(catalog) {
  const functions = catalog.functions.filter(
    (entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
      RESIDENCY_FUNCTION_NAMES.has(entry.name),
  );
  const policies = catalog.policies.filter(
    (entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
      RESIDENCY_CATALOG_PATTERN.test(
        `${entry.name} ${entry.using ?? ""} ${entry.check ?? ""}`,
      ),
  );
  const triggers = catalog.triggers.filter(
    (entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
      RESIDENCY_CATALOG_PATTERN.test(`${entry.name} ${entry.definition}`),
  );
  const relationKeys = new Set([
    "public.profiles",
    ...policies.map(catalogEntryRelationKey),
    ...triggers.map(catalogEntryRelationKey),
  ]);
  return {
    functions,
    grants: catalog.grants.filter(
      (entry) =>
        APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
        grantTargetsRelationsOrFunctions(
          entry,
          relationKeys,
          RESIDENCY_FUNCTION_NAMES,
        ),
    ),
    policies,
    relations: catalog.relations.filter(
      (entry) =>
        ["r", "p"].includes(entry.kind) &&
        relationKeys.has(catalogEntryRelationKey(entry)),
    ),
    triggers,
  };
}

function antiAbuseDomain(catalog) {
  const functions = catalog.functions.filter(
    (entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
      ANTI_ABUSE_FUNCTION_NAMES.has(entry.name),
  );
  const policies = catalog.policies.filter(
    (entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
      ANTI_ABUSE_CATALOG_PATTERN.test(
        `${entry.name} ${entry.using ?? ""} ${entry.check ?? ""}`,
      ),
  );
  const triggers = catalog.triggers.filter(
    (entry) =>
      APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
      ANTI_ABUSE_CATALOG_PATTERN.test(`${entry.name} ${entry.definition}`),
  );
  const relationKeys = new Set([
    ...ANTI_ABUSE_RELATION_KEYS,
    ...policies.map(catalogEntryRelationKey),
    ...triggers.map(catalogEntryRelationKey),
  ]);
  return {
    functions,
    grants: catalog.grants.filter(
      (entry) =>
        APP_CONTROLLED_SCHEMAS.has(entry.schema) &&
        grantTargetsRelationsOrFunctions(
          entry,
          relationKeys,
          ANTI_ABUSE_FUNCTION_NAMES,
        ),
    ),
    indexes: catalog.indexes.filter((entry) =>
      relationKeys.has(catalogEntryRelationKey(entry)),
    ),
    policies,
    relations: catalog.relations.filter(
      (entry) =>
        ["r", "p"].includes(entry.kind) &&
        relationKeys.has(catalogEntryRelationKey(entry)),
    ),
    triggers,
  };
}

function integrityStructuresDomain(catalog) {
  const relationEntry = (entry) =>
    INTEGRITY_RELATION_KEYS.has(catalogEntryRelationKey(entry));
  return {
    columns: catalog.columns.filter(relationEntry),
    constraints: catalog.constraints.filter(relationEntry),
    indexes: catalog.indexes.filter(relationEntry),
    relations: catalog.relations.filter(
      (entry) => ["r", "p"].includes(entry.kind) && relationEntry(entry),
    ),
    triggers: catalog.triggers.filter(relationEntry),
    types: catalog.types.filter(
      (entry) =>
        INTEGRITY_RELATION_KEYS.has(
          catalogRelationKey(entry.schema, entry.name),
        ) ||
        (entry.name.startsWith("_") &&
          INTEGRITY_RELATION_KEYS.has(
            catalogRelationKey(entry.schema, entry.name.slice(1)),
          )),
    ),
  };
}

function d72SupabaseCatalogDomainSnapshot(catalog, domainId) {
  validateD72SupabaseCatalogSnapshot(catalog);
  let contents;
  if (domainId === "app-controlled-rls") {
    contents = appControlledRlsDomain(catalog);
  } else if (domainId === "residency-write-boundary") {
    contents = residencyDomain(catalog);
  } else if (domainId === "anti-abuse-limits") {
    contents = antiAbuseDomain(catalog);
  } else if (domainId === "integrity-structures") {
    contents = integrityStructuresDomain(catalog);
  } else {
    throw new Error("Dominio de catálogo Supabase D72 desconocido.");
  }
  return {
    domainId,
    schemaVersion: D72_SUPABASE_CATALOG_DOMAIN_SCHEMA_VERSION,
    ...contents,
  };
}

export function d72SupabaseCatalogDomainDigests(catalog) {
  validateD72SupabaseCatalogSnapshot(catalog);
  return deepFreeze(
    Object.fromEntries(
      D72_SUPABASE_CATALOG_DOMAIN_IDS.map((domainId) => [
        domainId,
        sha256Canonical(d72SupabaseCatalogDomainSnapshot(catalog, domainId)),
      ]),
    ),
  );
}

export function d72SupabaseAppControlledRlsMetrics(catalog) {
  validateD72SupabaseCatalogSnapshot(catalog);
  const domain = appControlledRlsDomain(catalog);
  return deepFreeze({
    forcedRlsTableCount: domain.relations.filter((entry) => entry.forceRls)
      .length,
    grantInventoryDigest: sha256Canonical(domain.grants),
    policyInventoryDigest: sha256Canonical(domain.policies),
    rlsTableCount: domain.relations.filter((entry) => entry.rls).length,
  });
}

export function compareD72SupabaseCatalogDomains(local, production) {
  const localDigests = d72SupabaseCatalogDomainDigests(local);
  const productionDigests = d72SupabaseCatalogDomainDigests(production);
  return deepFreeze(
    Object.fromEntries(
      D72_SUPABASE_CATALOG_DOMAIN_IDS.map((domainId) => [
        domainId,
        {
          localDigest: localDigests[domainId],
          matches: localDigests[domainId] === productionDigests[domainId],
          productionDigest: productionDigests[domainId],
        },
      ]),
    ),
  );
}

function validateLocalContracts(contracts, expectedHead) {
  exactKeys(
    contracts,
    [
      "antiAbusePassed",
      "d68Passed",
      "dataIntegrityPassed",
      "head",
      "residencyPassed",
      "rlsPassed",
    ],
    "localContracts",
  );
  invariant(
    safeHead(contracts.head) === expectedHead,
    "Contrato local de otro HEAD.",
  );
  for (const key of [
    "antiAbusePassed",
    "d68Passed",
    "dataIntegrityPassed",
    "residencyPassed",
    "rlsPassed",
  ]) {
    safeBoolean(contracts[key], `localContracts.${key}`);
  }
  return contracts;
}

function checkMap(payload) {
  return new Map(
    payload.checks.map((check) => [check.id, check.invalidRowCount]),
  );
}

function failedChecks(payload, checkIds) {
  const counts = checkMap(payload);
  return checkIds.filter((checkId) => BigInt(counts.get(checkId)) !== 0n);
}

function checkCountObject(payload, checkIds) {
  const counts = checkMap(payload);
  return Object.fromEntries(
    checkIds.map((checkId) => [checkId, counts.get(checkId)]),
  );
}

function gateResult(gateId, status, evidence) {
  invariant(
    D72_SUPABASE_GATE_IDS.includes(gateId),
    "Gate Supabase D72 desconocido.",
  );
  invariant(
    Object.values(D72_SUPABASE_GATE_STATUS).includes(status),
    "Estado de gate Supabase D72 desconocido.",
  );
  return deepFreeze({ evidence, gateId, status });
}

function statusForCompleteEvidence(complete, passes) {
  if (!complete) return D72_SUPABASE_GATE_STATUS.NOT_VERIFIED;
  return passes ? D72_SUPABASE_GATE_STATUS.PASS : D72_SUPABASE_GATE_STATUS.FAIL;
}

function emptyDatabaseEvidence(observedAt) {
  return {
    draft0059Present: null,
    dryRunChangeCounts: null,
    executable0059Present: null,
    localLedgerDigest: null,
    localMaximumVersion: null,
    observedAt,
    pendingMigrationCount: null,
    production0059Present: null,
    production0060Present: null,
    projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
    remoteLedgerDigest: null,
    remoteMaximumVersion: null,
  };
}

function emptyCatalogEvidence(gateId, observedAt) {
  const common = {
    observedAt,
    projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
  };
  if (gateId === "data.integrity-no-corruption") {
    return {
      ...common,
      checkCount: null,
      failedCheckIds: null,
      integrityPolicyDigest: D72_SUPABASE_READONLY_POLICY_SHA256,
      invalidRowCounts: null,
      localContractPassed: null,
      minimumCatalogContractPassed: null,
      transactionReadOnly: true,
    };
  }
  if (gateId === "security.rls-enforced") {
    return {
      ...common,
      catalogContractDigest: null,
      forcedRlsTableCount: null,
      grantInventoryDigest: null,
      localContractPassed: null,
      minimumCatalogContractPassed: null,
      policyInventoryDigest: null,
      rlsTableCount: null,
    };
  }
  if (gateId === "authorization.residency-write-boundary") {
    return {
      ...common,
      boundaryContractDigest: null,
      guardedFunctionCount: null,
      guardedPolicyCount: null,
      localContractPassed: null,
      minimumCatalogContractPassed: null,
    };
  }
  if (gateId === "privacy.no-individual-ballots") {
    return {
      ...common,
      ballotContractDigest: null,
      individualBallotSurfaceCount: null,
      localD68ContractPassed: null,
      reidentifiableRowCount: null,
    };
  }
  return {
    ...common,
    antiAbuseContractDigest: null,
    guardedSurfaceCount: null,
    localContractPassed: null,
    minimumCatalogContractPassed: null,
    unknownBypassCount: null,
  };
}

export const D72_SUPABASE_READONLY_POLICY_SHA256 = sha256Canonical({
  aggregateCheckIds: D72_SUPABASE_AGGREGATE_CHECK_IDS,
  candidateMigrationVersions: D72_SUPABASE_EXPECTED_MIGRATION_VERSIONS,
  exactMigrationFileNames: [
    EXPECTED_D72_MIGRATION_FILE,
    ...CANDIDATE_MIGRATION_FILES,
  ],
  baselineMigrationVersions: D72_SUPABASE_BASELINE_MIGRATION_VERSIONS,
  catalogDomains: {
    antiAbuseFunctionNames: [...ANTI_ABUSE_FUNCTION_NAMES].sort(),
    antiAbuseRelationKeys: [...ANTI_ABUSE_RELATION_KEYS].sort(),
    appControlledFunctions: "all-invoker-and-definer",
    appControlledTriggers: "all",
    antiAbusePattern: ANTI_ABUSE_CATALOG_PATTERN.source,
    appControlledSchemas: [...APP_CONTROLLED_SCHEMAS].sort(),
    appControlledStoragePolicyNames: [
      ...APP_CONTROLLED_STORAGE_POLICY_NAMES,
    ].sort(),
    domainIds: D72_SUPABASE_CATALOG_DOMAIN_IDS,
    integrityRelationKeys: [...INTEGRITY_RELATION_KEYS].sort(),
    residencyFunctionNames: [...RESIDENCY_FUNCTION_NAMES].sort(),
    residencyPattern: RESIDENCY_CATALOG_PATTERN.source,
    schemaVersion: D72_SUPABASE_CATALOG_DOMAIN_SCHEMA_VERSION,
  },
  catalogSchema: D72_SUPABASE_CATALOG_SCHEMA_VERSION,
  catalogSections: D72_SUPABASE_CATALOG_SECTIONS,
  cli: {
    dbPushDryRunAllowedPendingMigrations:
      D72_SUPABASE_DB_PUSH_DRY_RUN_ALLOWED_PENDING_MIGRATIONS,
    dbPushDryRun: D72_SUPABASE_DB_PUSH_DRY_RUN_ARGS,
    dbPushDryRunStderrPrefix: D72_SUPABASE_DB_PUSH_DRY_RUN_STDERR_PREFIX,
    dbPushDryRunMigrationHeader: D72_SUPABASE_DB_PUSH_DRY_RUN_MIGRATION_HEADER,
    dbPushDryRunKnownUpdateNotice: D72_SUPABASE_DB_PUSH_KNOWN_UPDATE_NOTICE,
    dbPushDryRunState: D72_SUPABASE_DB_PUSH_DRY_RUN_STATE,
    migrationList: D72_SUPABASE_MIGRATION_LIST_ARGS,
    migrationListStderrPrefix: D72_SUPABASE_MIGRATION_LIST_STDERR_PREFIX,
  },
  docker: {
    configRelativePath: D72_SUPABASE_DOCKER_CONFIG_RELATIVE_PATH,
    host: D72_SUPABASE_DOCKER_HOST,
  },
  gates: D72_SUPABASE_GATE_IDS,
  localGateTestFiles: D72_SUPABASE_LOCAL_GATE_TEST_FILES,
  localTestSha256: D72_SUPABASE_LOCAL_DB_TEST_SHA256,
  minimumCatalogContract: D72_SUPABASE_MINIMUM_CATALOG_CONTRACT,
  psqlStdinEntrypoint: D72_SUPABASE_PSQL_STDIN_ENTRYPOINT,
  projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
  querySha256: D72_SUPABASE_READONLY_QUERY_SHA256,
  schemaVersion: D72_SUPABASE_READONLY_SCHEMA_VERSION,
});

function relationMatches(entry, expected) {
  return (
    entry.schema === expected.schema &&
    entry.name === expected.name &&
    ["r", "p"].includes(entry.kind)
  );
}

function functionMatches(entry, expected) {
  return entry.schema === expected.schema && entry.name === expected.name;
}

function minimumCatalogContracts(catalog) {
  const coreRelation = catalog.relations.find((entry) =>
    relationMatches(entry, D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.coreRelation),
  );
  const corePolicies = catalog.policies.filter(
    (entry) =>
      entry.schema ===
        D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.coreRelation.schema &&
      entry.table === D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.coreRelation.name,
  );
  const coreGrants = catalog.grants.filter(
    (entry) =>
      entry.schema ===
        D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.coreRelation.schema &&
      entry.identity ===
        D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.coreRelation.name,
  );
  const residencyFunctions = catalog.functions.filter((entry) =>
    functionMatches(
      entry,
      D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.residencyFunction,
    ),
  );
  const residencyPolicies = catalog.policies.filter((entry) =>
    /(?:community_id|is_member|residen)/i.test(
      `${entry.using ?? ""} ${entry.check ?? ""}`,
    ),
  );
  const antiAbuseFunctions = catalog.functions.filter((entry) =>
    functionMatches(
      entry,
      D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.antiAbuseFunction,
    ),
  );
  const antiAbuseTriggers = catalog.triggers.filter((entry) =>
    /(?:abuse|cooldown|limit|quota|consume_window_limit)/i.test(
      `${entry.name} ${entry.definition}`,
    ),
  );
  const integrityRelations = new Set(
    catalog.relations
      .filter((entry) => ["r", "p"].includes(entry.kind))
      .map(catalogEntryRelationKey),
  );
  return {
    antiAbuse: antiAbuseFunctions.length > 0 && antiAbuseTriggers.length > 0,
    antiAbuseFunctions,
    antiAbuseTriggers,
    d68: Boolean(coreRelation) && residencyFunctions.length > 0,
    integrity: [...INTEGRITY_RELATION_KEYS].every((key) =>
      integrityRelations.has(key),
    ),
    residency: residencyFunctions.length > 0 && residencyPolicies.length > 0,
    residencyFunctions,
    residencyPolicies,
    rls:
      coreRelation?.rls === true &&
      D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.candidateRlsRelations.every(
        (qualified) =>
          catalog.relations.some(
            (entry) =>
              catalogEntryRelationKey(entry) === qualified &&
              ["r", "p"].includes(entry.kind) &&
              entry.rls === true,
          ),
      ) &&
      D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.candidateInvokerFunctions.every(
        (name) =>
          catalog.functions.some(
            (entry) =>
              entry.schema === "public" &&
              entry.name === name &&
              !entry.securityDefiner,
          ),
      ) &&
      D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.candidateDefinerFunctions.every(
        (qualified) =>
          catalog.functions.some(
            (entry) =>
              `${entry.schema}.${entry.name}` === qualified &&
              entry.securityDefiner,
          ),
      ) &&
      D72_SUPABASE_MINIMUM_CATALOG_CONTRACT.candidateTriggers.every(
        (qualified) =>
          catalog.triggers.some(
            (entry) =>
              `${entry.schema}.${entry.table}.${entry.name}` === qualified &&
              entry.enabled === "O",
          ),
      ) &&
      corePolicies.length > 0 &&
      coreGrants.length > 0,
    coreGrants,
    corePolicies,
    coreRelation,
  };
}

export function evaluateD72SupabaseReadonlyGates({
  aggregateChecks = null,
  dbPushDryRun = null,
  head,
  localCatalog = null,
  localContracts = null,
  migrationList = null,
  observedAt,
  productionCatalog = null,
  repositoryMigrations = null,
}) {
  safeHead(head);
  safeUtcInstant(observedAt, "observedAt");

  const results = [];
  const databaseComplete = Boolean(
    migrationList && dbPushDryRun && repositoryMigrations,
  );
  let databaseEvidence = emptyDatabaseEvidence(observedAt);
  let databasePasses = false;
  if (databaseComplete) {
    databaseEvidence = {
      draft0059Present: repositoryMigrations.draft0059Present,
      dryRunChangeCounts: { ...dbPushDryRun.changeCounts },
      executable0059Present:
        repositoryMigrations.executable0059Present ||
        migrationList.executable0059Present,
      localLedgerDigest: migrationList.localLedgerDigest,
      localMaximumVersion: migrationList.localMaximumVersion,
      observedAt,
      pendingMigrationCount:
        dbPushDryRun.migrations.length +
        dbPushDryRun.roles.length +
        dbPushDryRun.seeds.length,
      production0059Present: migrationList.production0059Present,
      production0060Present: migrationList.production0060Present,
      projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
      remoteLedgerDigest: migrationList.remoteLedgerDigest,
      remoteMaximumVersion: migrationList.remoteMaximumVersion,
    };
    databasePasses =
      repositoryMigrations.exactExecutableLedger === true &&
      repositoryMigrations.draft0059Present === true &&
      repositoryMigrations.executable0059Present === false &&
      repositoryMigrations.executable0060Present === true &&
      migrationList.state === READ_ONLY_PREVIEW_MIGRATION_STATE.APPLIED_EXACT &&
      migrationList.executable0059Present === false &&
      migrationList.production0059Present === false &&
      migrationList.production0060Present === true &&
      dbPushDryRun.upToDate === true &&
      Object.values(dbPushDryRun.changeCounts).every((count) => count === 0);
  }
  results.push(
    gateResult(
      "database.expected-migrations-only",
      statusForCompleteEvidence(databaseComplete, databasePasses),
      databaseEvidence,
    ),
  );

  const catalogComplete = Boolean(
    localCatalog && productionCatalog && aggregateChecks && localContracts,
  );
  if (!catalogComplete) {
    for (const gateId of D72_SUPABASE_GATE_IDS.slice(1)) {
      results.push(
        gateResult(
          gateId,
          D72_SUPABASE_GATE_STATUS.NOT_VERIFIED,
          emptyCatalogEvidence(gateId, observedAt),
        ),
      );
    }
    return assertD72SupabaseSanitizedGateResults(results);
  }

  validateD72SupabaseCatalogSnapshot(localCatalog);
  validateD72SupabaseCatalogSnapshot(productionCatalog);
  validateD72SupabaseAggregateChecks(aggregateChecks);
  validateLocalContracts(localContracts, head);
  const domainComparisons = compareD72SupabaseCatalogDomains(
    localCatalog,
    productionCatalog,
  );
  const minimums = minimumCatalogContracts(productionCatalog);
  const integrityFailed = failedChecks(aggregateChecks, INTEGRITY_CHECK_IDS);
  const d68Failed = failedChecks(aggregateChecks, D68_CHECK_IDS);

  results.push(
    gateResult(
      "data.integrity-no-corruption",
      statusForCompleteEvidence(
        true,
        domainComparisons["integrity-structures"].matches &&
          minimums.integrity &&
          localContracts.dataIntegrityPassed &&
          integrityFailed.length === 0,
      ),
      {
        checkCount: INTEGRITY_CHECK_IDS.length,
        failedCheckIds: integrityFailed,
        integrityPolicyDigest: D72_SUPABASE_READONLY_POLICY_SHA256,
        invalidRowCounts: checkCountObject(
          aggregateChecks,
          INTEGRITY_CHECK_IDS,
        ),
        localContractPassed: localContracts.dataIntegrityPassed,
        minimumCatalogContractPassed: minimums.integrity,
        observedAt,
        projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
        transactionReadOnly: true,
      },
    ),
  );

  const appControlledRls =
    d72SupabaseAppControlledRlsMetrics(productionCatalog);
  results.push(
    gateResult(
      "security.rls-enforced",
      statusForCompleteEvidence(
        true,
        domainComparisons["app-controlled-rls"].matches &&
          minimums.rls &&
          localContracts.rlsPassed,
      ),
      {
        catalogContractDigest:
          domainComparisons["app-controlled-rls"].localDigest,
        forcedRlsTableCount: appControlledRls.forcedRlsTableCount,
        grantInventoryDigest: appControlledRls.grantInventoryDigest,
        localContractPassed: localContracts.rlsPassed,
        minimumCatalogContractPassed: minimums.rls,
        observedAt,
        policyInventoryDigest: appControlledRls.policyInventoryDigest,
        projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
        rlsTableCount: appControlledRls.rlsTableCount,
      },
    ),
  );

  const residency = residencyDomain(productionCatalog);
  results.push(
    gateResult(
      "authorization.residency-write-boundary",
      statusForCompleteEvidence(
        true,
        domainComparisons["residency-write-boundary"].matches &&
          minimums.residency &&
          localContracts.residencyPassed,
      ),
      {
        boundaryContractDigest:
          domainComparisons["residency-write-boundary"].localDigest,
        guardedFunctionCount: residency.functions.length,
        guardedPolicyCount: residency.policies.length,
        localContractPassed: localContracts.residencyPassed,
        minimumCatalogContractPassed: minimums.residency,
        observedAt,
        projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
      },
    ),
  );

  const d68Counts = checkCountObject(aggregateChecks, D68_CHECK_IDS);
  const individualBallotSurfaceCount =
    BigInt(d68Counts["d68.individual-ballot-columns"]) +
    BigInt(d68Counts["d68.individual-ballot-relations"]) +
    BigInt(d68Counts["d68.reidentifying-functions"]);
  const reidentifiableRowCount =
    BigInt(d68Counts["d68.poll-tally-transaction-divergence"]) +
    BigInt(d68Counts["d68.budget-tally-transaction-divergence"]);
  results.push(
    gateResult(
      "privacy.no-individual-ballots",
      statusForCompleteEvidence(
        true,
        localContracts.d68Passed && d68Failed.length === 0,
      ),
      {
        ballotContractDigest: sha256Canonical({
          checkIds: D68_CHECK_IDS,
          schemaVersion: D72_SUPABASE_CHECKS_SCHEMA_VERSION,
        }),
        individualBallotSurfaceCount: individualBallotSurfaceCount.toString(),
        localD68ContractPassed: localContracts.d68Passed,
        observedAt,
        projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
        reidentifiableRowCount: reidentifiableRowCount.toString(),
      },
    ),
  );

  const antiAbuse = antiAbuseDomain(productionCatalog);
  results.push(
    gateResult(
      "security.anti-abuse-limits",
      statusForCompleteEvidence(
        true,
        domainComparisons["anti-abuse-limits"].matches &&
          minimums.antiAbuse &&
          localContracts.antiAbusePassed,
      ),
      {
        antiAbuseContractDigest:
          domainComparisons["anti-abuse-limits"].localDigest,
        guardedSurfaceCount:
          antiAbuse.functions.length + antiAbuse.triggers.length,
        localContractPassed: localContracts.antiAbusePassed,
        minimumCatalogContractPassed: minimums.antiAbuse,
        observedAt,
        projectRefDigest: sha256(D72_SUPABASE_PROJECT_REF),
        unknownBypassCount: domainComparisons["anti-abuse-limits"].matches
          ? 0
          : 1,
      },
    ),
  );

  return assertD72SupabaseSanitizedGateResults(results);
}

const FORBIDDEN_EVIDENCE_KEY_PATTERN =
  /(?:sql|stdout|stderr|password|secret|token|e-?mail|connection|hostname|raw|snapshot|definition|rows|versions|fileNames)/i;

export function assertD72SupabaseSanitizedGateResults(results) {
  invariant(
    Array.isArray(results) && results.length === D72_SUPABASE_GATE_IDS.length,
    "La evidencia Supabase D72 no contiene los seis gates exactos.",
  );
  invariant(
    JSON.stringify(results.map(({ gateId }) => gateId)) ===
      JSON.stringify(D72_SUPABASE_GATE_IDS),
    "La evidencia Supabase D72 no respeta el orden exacto de gates.",
  );
  const visit = (value, path = "evidence") => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(value)) {
      if (typeof value === "string") {
        invariant(
          !value.includes(D72_SUPABASE_PROJECT_REF) &&
            !/\b(?:select|insert|update|delete|create|alter|drop)\b/i.test(
              value,
            ),
          `${path} contiene texto remoto o SQL no saneado.`,
        );
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      invariant(
        !FORBIDDEN_EVIDENCE_KEY_PATTERN.test(key),
        `${path}.${key} no es un campo de evidencia saneada.`,
      );
      visit(child, `${path}.${key}`);
    }
  };
  for (const result of results) {
    exactKeys(result, ["evidence", "gateId", "status"], "gateResult");
    invariant(
      D72_SUPABASE_GATE_IDS.includes(result.gateId) &&
        Object.values(D72_SUPABASE_GATE_STATUS).includes(result.status),
      "Gate Supabase D72 inválido.",
    );
    visit(result.evidence);
  }
  invariant(
    Buffer.byteLength(canonicalJson(results), "utf8") <= 256 * 1024,
    "La evidencia Supabase D72 saneada excede el tamaño permitido.",
  );
  return deepFreeze(results);
}

export function d72SupabaseSanitizedEvidenceDigest(results) {
  assertD72SupabaseSanitizedGateResults(results);
  return safeHash(sha256Canonical(results), "evidenceDigest");
}
