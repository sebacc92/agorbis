import { createHash } from "node:crypto";

export const RELEASE_GATE_POLICY_VERSION = "D72/2026-11-01/v6";
export const RELEASE_GATE_POLICY_FORMAT = "agorbis-release-gate-policy/v1";
export const AUTHORIZED_RISK_OWNER = "Sebastian Cardoso Castillo";

export const EVIDENCE_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  BLOCKED_EXTERNAL: "BLOCKED_EXTERNAL",
  NOT_VERIFIED: "NOT_VERIFIED",
});
export const RAW_RESULT = Object.freeze({ PASS: "PASS", FAIL: "FAIL" });
export const GATE_POLICY = Object.freeze({
  GATE_REQUIRED: "GATE_REQUIRED",
  NON_WAIVABLE_SECURITY_GATE: "NON_WAIVABLE_SECURITY_GATE",
});
export const RELEASE_DISPOSITION = Object.freeze({
  PASS: "PASS",
  STOP: "STOP",
  RISK_ACCEPTED_BY_OWNER: "RISK_ACCEPTED_BY_OWNER",
});
export const WAIVER_POLICY = Object.freeze({
  OWNER_EXPLICIT: "OWNER_EXPLICIT",
  NEVER: "NEVER",
});
export const SEVERITY = Object.freeze({ HIGH: "HIGH", CRITICAL: "CRITICAL" });
export const RISK_TYPE = Object.freeze({
  LEGAL_REGULATORY: "legal/regulatorio",
  CONTRACTUAL: "contractual",
  PRIVACY: "privacidad",
  SECURITY: "seguridad",
  DATA_LOSS: "pérdida de datos",
  AVAILABILITY: "disponibilidad",
  FUNCTIONALITY: "funcionalidad",
  OPERATION: "operación",
});

export const OWNER_WAIVER_CANDIDATE_GATE_IDS = Object.freeze([
  "legal.aaip-registration-pending",
  "privacy.retention-unreconciled",
  "privacy.provider-locations-unverified",
  "privacy.provider-retention-unverified",
  "legal.transfer-safeguards-unverified",
  "recovery.production-backup-not-verified",
  "legal.sensitive-consent-0059-omitted",
]);

export const NON_WAIVABLE_SECURITY_GATE_IDS = Object.freeze([
  "source.git-head-clean-and-recoverable",
  "security.auth-functional",
  "operations.smtp-functional",
  "security.turnstile-a",
  "security.turnstile-b",
  "security.rls-enforced",
  "security.private-storage",
  "authorization.residency-write-boundary",
  "privacy.no-individual-ballots",
  "security.anti-abuse-limits",
  "security.csp",
  "security.cookies",
  "security.secret-scan",
  "security.worker-secrets-confidential",
  "cloudflare.secret-inventory-exact",
  "database.expected-migrations-only",
  "data.integrity-no-corruption",
  "quality.build-and-test-suite",
  "cloudflare.known-bindings-only",
  "cloudflare.domain-config-exact",
  "cloudflare.known-crons-only",
  "network.production-dns-integrity",
  "quality.production-smoke",
  "configuration.no-unknown-release-config",
  "configuration.auth-providers-aligned",
  "configuration.ai-disabled",
  "legal.pending-external-copy-honest",
]);

export const SENSITIVE_CONSENT_0059_AFFECTED_SURFACES = Object.freeze([
  "publicaciones cívicas",
  "opiniones y debate",
  "apoyos y compromisos",
  "reclamos y evidencia",
  "votos de encuestas y presupuestos participativos",
  "visibilidad de membresía",
  "reportes y solicitudes",
]);

const NON_WAIVABLE_EXTERNAL_EVIDENCE_IDS = new Set([
  "source.git-head-clean-and-recoverable",
  "security.auth-functional",
  "operations.smtp-functional",
  "security.turnstile-a",
  "security.turnstile-b",
  "security.rls-enforced",
  "security.private-storage",
  "authorization.residency-write-boundary",
  "privacy.no-individual-ballots",
  "security.anti-abuse-limits",
  "security.csp",
  "security.cookies",
  "security.worker-secrets-confidential",
  "cloudflare.secret-inventory-exact",
  "database.expected-migrations-only",
  "data.integrity-no-corruption",
  "cloudflare.known-bindings-only",
  "cloudflare.domain-config-exact",
  "cloudflare.known-crons-only",
  "network.production-dns-integrity",
  "quality.production-smoke",
  "configuration.no-unknown-release-config",
  "configuration.auth-providers-aligned",
  "configuration.ai-disabled",
]);

const REVIEW_REQUIRED_BY = "2026-11-30";
const source = Object.freeze({
  aaip: ["docs/AAIP_REGISTRATION.md", "scripts/aaip-registration-policy.mjs"],
  retention: ["docs/RETENTION_POLICY.md", "docs/GO_LIVE_CHECKLIST.md"],
  providers: [
    "scripts/cloudflare-public-build-environment.mjs",
    "docs/TRANSFER_SAFEGUARDS_REQUESTS.md",
  ],
  backup: ["docs/BACKUP_AND_RESTORE.md", "docs/RECOVERY_INVENTORY.md"],
  consent: [
    "docs/0059-sensitive-participation-consent-review.md",
    "supabase/migration-drafts/0059_versioned_sensitive_participation_consent.sql",
  ],
  preflight: ["scripts/production-preflight.mjs"],
  db: ["scripts/test-db.sh"],
  worker: ["wrangler.jsonc", "scripts/cloudflare-worker-policy.mjs"],
});

const freezeGate = (definition) =>
  Object.freeze({
    ...definition,
    riskTypes: Object.freeze([...definition.riskTypes]),
    sources: Object.freeze([...definition.sources]),
    ...(definition.affectedSurfaces
      ? {
          affectedSurfaces: Object.freeze([...definition.affectedSurfaces]),
        }
      : {}),
  });

const candidateRiskMetadata = Object.freeze({
  "legal.aaip-registration-pending": Object.freeze({
    riskTypes: [RISK_TYPE.LEGAL_REGULATORY, RISK_TYPE.PRIVACY],
    dependsOnExternalEvidence: true,
  }),
  "privacy.retention-unreconciled": Object.freeze({
    riskTypes: [
      RISK_TYPE.LEGAL_REGULATORY,
      RISK_TYPE.PRIVACY,
      RISK_TYPE.DATA_LOSS,
    ],
    dependsOnExternalEvidence: true,
  }),
  "privacy.provider-locations-unverified": Object.freeze({
    riskTypes: [RISK_TYPE.CONTRACTUAL, RISK_TYPE.PRIVACY],
    dependsOnExternalEvidence: true,
  }),
  "privacy.provider-retention-unverified": Object.freeze({
    riskTypes: [RISK_TYPE.CONTRACTUAL, RISK_TYPE.PRIVACY],
    dependsOnExternalEvidence: true,
  }),
  "legal.transfer-safeguards-unverified": Object.freeze({
    riskTypes: [
      RISK_TYPE.LEGAL_REGULATORY,
      RISK_TYPE.CONTRACTUAL,
      RISK_TYPE.PRIVACY,
    ],
    dependsOnExternalEvidence: true,
  }),
  "recovery.production-backup-not-verified": Object.freeze({
    riskTypes: [
      RISK_TYPE.DATA_LOSS,
      RISK_TYPE.AVAILABILITY,
      RISK_TYPE.OPERATION,
    ],
    dependsOnExternalEvidence: true,
  }),
  "legal.sensitive-consent-0059-omitted": Object.freeze({
    riskTypes: [
      RISK_TYPE.LEGAL_REGULATORY,
      RISK_TYPE.PRIVACY,
      RISK_TYPE.FUNCTIONALITY,
    ],
    dependsOnExternalEvidence: false,
  }),
});

function candidate([
  id,
  evidenceStatus,
  severity,
  description,
  consequence,
  sources,
]) {
  const metadata = candidateRiskMetadata[id];
  return freezeGate({
    id,
    name: description,
    evidenceStatus,
    rawResult: RAW_RESULT.FAIL,
    gatePolicy: GATE_POLICY.GATE_REQUIRED,
    severity,
    riskTypes: metadata.riskTypes,
    dependsOnExternalEvidence: metadata.dependsOnExternalEvidence,
    technicallyOmittable: true,
    description,
    consequence,
    waiverPolicy: WAIVER_POLICY.OWNER_EXPLICIT,
    reviewRequiredBy: REVIEW_REQUIRED_BY,
    sources,
    ...(id === "legal.sensitive-consent-0059-omitted"
      ? { affectedSurfaces: SENSITIVE_CONSENT_0059_AFFECTED_SURFACES }
      : {}),
  });
}

function nonWaivable([id, severity, description, consequence, sources]) {
  const dependsOnExternalEvidence = NON_WAIVABLE_EXTERNAL_EVIDENCE_IDS.has(id);
  const privacyOrData =
    id.startsWith("privacy.") ||
    id.startsWith("security.rls") ||
    id.startsWith("security.private-storage") ||
    id.startsWith("authorization.") ||
    id.startsWith("data.") ||
    id.startsWith("database.");
  const legalOrContractual = id.startsWith("legal.");
  return freezeGate({
    id,
    name: description,
    evidenceStatus: EVIDENCE_STATUS.NOT_VERIFIED,
    rawResult: RAW_RESULT.FAIL,
    gatePolicy: GATE_POLICY.NON_WAIVABLE_SECURITY_GATE,
    severity,
    riskTypes: legalOrContractual
      ? [RISK_TYPE.LEGAL_REGULATORY, RISK_TYPE.CONTRACTUAL, RISK_TYPE.PRIVACY]
      : privacyOrData
        ? [RISK_TYPE.SECURITY, RISK_TYPE.PRIVACY, RISK_TYPE.DATA_LOSS]
        : [RISK_TYPE.SECURITY, RISK_TYPE.AVAILABILITY, RISK_TYPE.OPERATION],
    dependsOnExternalEvidence,
    technicallyOmittable: true,
    description,
    consequence,
    waiverPolicy: WAIVER_POLICY.NEVER,
    reviewRequiredBy: null,
    sources,
  });
}

const candidateDefinitions = [
  [
    "legal.aaip-registration-pending",
    EVIDENCE_STATUS.BLOCKED_EXTERNAL,
    SEVERITY.HIGH,
    "Inscripción de la base ante AAIP pendiente de aprobación e ID.",
    "Agorbis se abriría sin constancia aprobada ni número de registro de la base acreditado; el RL y las referencias del trámite no los sustituyen.",
    source.aaip,
  ],
  [
    "privacy.retention-unreconciled",
    EVIDENCE_STATUS.BLOCKED_EXTERNAL,
    SEVERITY.HIGH,
    "Retención declarada y tratamiento real sin reconciliar.",
    "Los plazos declarados y los mecanismos efectivos de borrado, anonimización o conservación podrían divergir.",
    source.retention,
  ],
  [
    "privacy.provider-locations-unverified",
    EVIDENCE_STATUS.BLOCKED_EXTERNAL,
    SEVERITY.HIGH,
    "Ubicaciones de tratamiento de proveedores no verificadas.",
    "Las divulgaciones públicas no pueden identificar de forma completa y acreditada los lugares de tratamiento y acceso.",
    source.providers,
  ],
  [
    "privacy.provider-retention-unverified",
    EVIDENCE_STATUS.BLOCKED_EXTERNAL,
    SEVERITY.HIGH,
    "Retención de proveedores no verificada.",
    "Agorbis no puede acreditar plazos ni ciclos de eliminación para logs, correo, backups, cachés y otros datos de proveedores.",
    [
      "docs/RETENTION_POLICY.md",
      "docs/TRANSFER_SAFEGUARDS_REQUESTS.md",
      "scripts/cloudflare-public-build-environment.mjs",
    ],
  ],
  [
    "legal.transfer-safeguards-unverified",
    EVIDENCE_STATUS.BLOCKED_EXTERNAL,
    SEVERITY.CRITICAL,
    "Salvaguardas argentinas de transferencias no acreditadas.",
    "El primer request y otros flujos sin decisión previa acreditable quedarían sin un mecanismo argentino demostrado.",
    [
      "docs/TRANSFER_SAFEGUARDS_REQUESTS.md",
      "scripts/production-preflight.mjs",
    ],
  ],
  [
    "recovery.production-backup-not-verified",
    EVIDENCE_STATUS.NOT_VERIFIED,
    SEVERITY.CRITICAL,
    "Backup productivo y restore real no verificados.",
    "No existe un backup productivo verificado; un rollback del Worker no recupera datos perdidos o corruptos y puede ocurrir pérdida irreversible.",
    source.backup,
  ],
  [
    "legal.sensitive-consent-0059-omitted",
    EVIDENCE_STATUS.FAIL,
    SEVERITY.HIGH,
    "0059 permanece omitida y sin aplicar.",
    `La omisión alcanza ${SENSITIVE_CONSENT_0059_AFFECTED_SURFACES.join(", ")}; esas superficies carecen del consentimiento específico, versionado y acreditable diseñado en 0059, y Agorbis no debe describirse como jurídicamente conforme.`,
    source.consent,
  ],
];

const nonWaivableDefinitions = [
  [
    "source.git-head-clean-and-recoverable",
    SEVERITY.CRITICAL,
    "HEAD completo, worktree limpio y fuente recuperable.",
    "El acta podría no corresponder al código evaluado o ese código podría no ser recuperable.",
    ["scripts/run-exceptional-open-release.mjs", "docs/GIT_RECOVERY.md"],
  ],
  [
    "security.auth-functional",
    SEVERITY.CRITICAL,
    "Auth, claves modernas, redirects, MFA y recuperación.",
    "Las cuentas o sesiones podrían fallar o quedar expuestas.",
    source.preflight,
  ],
  [
    "operations.smtp-functional",
    SEVERITY.CRITICAL,
    "SMTP crítico de Auth.",
    "Confirmación, acceso y recuperación por correo podrían no funcionar.",
    ["docs/PRODUCTION_RUNBOOK.md"],
  ],
  [
    "security.turnstile-a",
    SEVERITY.CRITICAL,
    "Turnstile A en formularios públicos.",
    "Los formularios públicos perderían su barrera anti-bot.",
    source.preflight,
  ],
  [
    "security.turnstile-b",
    SEVERITY.CRITICAL,
    "Turnstile B en Supabase Auth.",
    "El acceso directo a Auth perdería la segunda barrera anti-bot.",
    source.preflight,
  ],
  [
    "security.rls-enforced",
    SEVERITY.CRITICAL,
    "RLS y grants autoritativos.",
    "Lecturas o escrituras podrían eludir autorización en base de datos.",
    source.db,
  ],
  [
    "security.private-storage",
    SEVERITY.CRITICAL,
    "Storage privado y acceso mediado.",
    "Objetos privados podrían quedar expuestos o modificados sin autorización.",
    source.db,
  ],
  [
    "authorization.residency-write-boundary",
    SEVERITY.CRITICAL,
    "Residencia y permisos de participación.",
    "Una cuenta podría escribir fuera de las comunidades habilitadas por residencia.",
    source.db,
  ],
  [
    "privacy.no-individual-ballots",
    SEVERITY.CRITICAL,
    "D68 y privacidad de votos.",
    "Una elección individual podría persistir o volver a vincularse con una cuenta.",
    ["DECISIONS.md", "scripts/test-db.sh"],
  ],
  [
    "security.anti-abuse-limits",
    SEVERITY.CRITICAL,
    "Límites antiabuso autoritativos.",
    "Acciones sensibles quedarían expuestas a automatización y agotamiento de recursos.",
    ["scripts/test-db.sh", "scripts/production-preflight.mjs"],
  ],
  [
    "security.csp",
    SEVERITY.CRITICAL,
    "Content Security Policy defensiva.",
    "El cliente quedaría expuesto a inyección, frames o destinos no autorizados.",
    ["scripts/production-smoke-policy.mjs"],
  ],
  [
    "security.cookies",
    SEVERITY.CRITICAL,
    "Cookies de sesión seguras.",
    "Tokens de sesión podrían quedar expuestos o enviarse en contextos inseguros.",
    ["src/lib/session.ts"],
  ],
  [
    "security.secret-scan",
    SEVERITY.CRITICAL,
    "Secret scan de repositorio y artefacto.",
    "Credenciales podrían publicarse en código, assets o bundles.",
    ["scripts/scan-secrets.mjs", "scripts/cloudflare-worker-artifact.mjs"],
  ],
  [
    "security.worker-secrets-confidential",
    SEVERITY.CRITICAL,
    "Worker Secrets fuera de logs y actas.",
    "Credenciales de Supabase, Turnstile o crons podrían revelarse.",
    ["scripts/open-release-runner-policy.mjs"],
  ],
  [
    "cloudflare.secret-inventory-exact",
    SEVERITY.CRITICAL,
    "Inventario remoto exacto de Worker Secrets.",
    "Un secret faltante o desconocido cambiaría capacidades y funcionamiento del Worker.",
    ["scripts/cloudflare-secret-inventory.mjs"],
  ],
  [
    "database.expected-migrations-only",
    SEVERITY.CRITICAL,
    "Ledger exacto 0001–0058 + 0060 + 0061 y 0059 aislada.",
    "Migraciones inesperadas o faltantes podrían alterar permisos, esquema o datos.",
    ["scripts/production-preflight-policy.mjs"],
  ],
  [
    "data.integrity-no-corruption",
    SEVERITY.CRITICAL,
    "Integridad de datos sin corrupción.",
    "El release podría producir estados inválidos o pérdida de información.",
    source.db,
  ],
  [
    "quality.build-and-test-suite",
    SEVERITY.CRITICAL,
    "Build, tipos y suites obligatorias.",
    "Código roto o controles regresionados podrían entrar al artefacto.",
    ["package.json"],
  ],
  [
    "cloudflare.known-bindings-only",
    SEVERITY.CRITICAL,
    "Bindings exactos.",
    "El Worker podría obtener capacidades o accesos no revisados.",
    source.worker,
  ],
  [
    "cloudflare.domain-config-exact",
    SEVERITY.CRITICAL,
    "Cuenta, dominios y DNS exactos.",
    "El tráfico podría dirigirse a un runtime o dominio no autorizado.",
    ["wrangler.jsonc", "scripts/cloudflare-closed-state.mjs"],
  ],
  [
    "cloudflare.known-crons-only",
    SEVERITY.CRITICAL,
    "Crons exactos para cada perfil.",
    "Jobs desconocidos podrían ejecutar escrituras o tareas inesperadas.",
    ["wrangler.jsonc", "wrangler.closed.jsonc"],
  ],
  [
    "network.production-dns-integrity",
    SEVERITY.CRITICAL,
    "DNS y correo sin cambios inesperados.",
    "El tráfico o el correo podrían resolverse hacia destinos distintos de los auditados.",
    [
      "docs/CLOUD_CONFIGURATION.md",
      "scripts/cloudflare-closed-state.mjs",
      "scripts/cloudflare-dns-audit.mjs",
    ],
  ],
  [
    "quality.production-smoke",
    SEVERITY.CRITICAL,
    "Smoke del perfil productivo vigente.",
    "El estado productivo podría no coincidir con el perfil cerrado exigido en esta fase.",
    ["scripts/cloudflare-closed-smoke.mjs"],
  ],
  [
    "configuration.no-unknown-release-config",
    SEVERITY.CRITICAL,
    "Ausencia de configuración desconocida.",
    "Bindings, variables, rutas o proveedores no revisados podrían alterar el alcance.",
    [
      "scripts/cloudflare-worker-policy.mjs",
      "scripts/cloudflare-closed-state.mjs",
    ],
  ],
  [
    "configuration.auth-providers-aligned",
    SEVERITY.CRITICAL,
    "Proveedores Auth alineados con el objetivo aprobado y su consentimiento.",
    "Un proveedor podría tratar datos con flags divergentes, destinos sin evidencia o fuera del consentimiento versionado vigente.",
    [
      "scripts/cloudflare-public-build-environment.mjs",
      "scripts/social-auth-consent-policy.mjs",
      "scripts/cloudflare-worker-policy.mjs",
      "scripts/d72-non-stateful-composite-collector.mjs",
    ],
  ],
  [
    "configuration.ai-disabled",
    SEVERITY.CRITICAL,
    "Funciones de IA deshabilitadas.",
    "Datos podrían enviarse a un proveedor de IA no aprobado ni divulgado.",
    source.preflight,
  ],
  [
    "legal.pending-external-copy-honest",
    SEVERITY.CRITICAL,
    "Copy legal pendiente, versionado y honesto en ES/EN.",
    "El bundle podría afirmar ubicaciones, contratos, retención o salvaguardas que la evidencia disponible no acredita.",
    [
      "src/lib/legal-content.ts",
      "docs/legal-drafts/2026-08-29-pending-external-evidence.json",
    ],
  ],
];

export const RELEASE_GATE_POLICY = Object.freeze({
  format: RELEASE_GATE_POLICY_FORMAT,
  version: RELEASE_GATE_POLICY_VERSION,
  authorizedRiskOwner: AUTHORIZED_RISK_OWNER,
  gates: Object.freeze([
    ...candidateDefinitions.map(candidate),
    ...nonWaivableDefinitions.map(nonWaivable),
  ]),
});

const gateIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const placeholderPattern =
  /(?:placeholder|example|fixture|change-me|pending|pendiente|\btbd\b|[<>])/i;
const allowedEvidenceStatuses = new Set(Object.values(EVIDENCE_STATUS));
const allowedRawResults = new Set(Object.values(RAW_RESULT));

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

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

export function getReleaseGateDefinition(id) {
  return RELEASE_GATE_POLICY.gates.find((current) => current.id === id) ?? null;
}

export function validateReleaseGatePolicy(policy = RELEASE_GATE_POLICY) {
  const errors = [];
  if (!isPlainObject(policy)) return ["La política debe ser un objeto."];
  if (policy.format !== RELEASE_GATE_POLICY_FORMAT)
    errors.push("La política tiene format desconocido.");
  if (policy.version !== RELEASE_GATE_POLICY_VERSION)
    errors.push("La política tiene versión desconocida.");
  if (policy.authorizedRiskOwner !== AUTHORIZED_RISK_OWNER)
    errors.push("La política tiene un responsable de riesgo desconocido.");
  if (!Array.isArray(policy.gates))
    return [...errors, "La política no contiene gates."];
  const ids = [];
  for (const current of policy.gates) {
    if (!isPlainObject(current) || !gateIdPattern.test(current.id ?? "")) {
      errors.push("La política contiene un gate inválido.");
      continue;
    }
    ids.push(current.id);
    const expectedRaw =
      current.evidenceStatus === EVIDENCE_STATUS.PASS
        ? RAW_RESULT.PASS
        : RAW_RESULT.FAIL;
    if (!allowedEvidenceStatuses.has(current.evidenceStatus))
      errors.push(`${current.id} tiene evidenceStatus inválido.`);
    if (current.rawResult !== expectedRaw)
      errors.push(`${current.id} contradice evidenceStatus y rawResult.`);
    if (!Object.values(GATE_POLICY).includes(current.gatePolicy))
      errors.push(`${current.id} tiene gatePolicy inválido.`);
    if (!Object.values(SEVERITY).includes(current.severity))
      errors.push(`${current.id} tiene severity inválida.`);
    if (
      typeof current.description !== "string" ||
      current.description.length < 10
    )
      errors.push(`${current.id} carece de descripción.`);
    if (
      typeof current.consequence !== "string" ||
      current.consequence.length < 20
    )
      errors.push(`${current.id} carece de consecuencia.`);
    if (!Array.isArray(current.sources) || current.sources.length === 0)
      errors.push(`${current.id} carece de fuentes.`);
    if (current.name !== current.description)
      errors.push(`${current.id} tiene name no canónico.`);
    if (
      !Array.isArray(current.riskTypes) ||
      current.riskTypes.length === 0 ||
      current.riskTypes.some(
        (riskType) => !Object.values(RISK_TYPE).includes(riskType),
      )
    )
      errors.push(`${current.id} carece de tipos de riesgo válidos.`);
    if (typeof current.dependsOnExternalEvidence !== "boolean")
      errors.push(`${current.id} no declara dependencia externa.`);
    if (typeof current.technicallyOmittable !== "boolean")
      errors.push(`${current.id} no declara omisibilidad técnica.`);
    if (current.gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE) {
      if (current.waiverPolicy !== WAIVER_POLICY.NEVER)
        errors.push(`${current.id} non-waivable debe usar NEVER.`);
      if (current.reviewRequiredBy !== null)
        errors.push(`${current.id} non-waivable no usa fecha de waiver.`);
      if (current.technicallyOmittable !== true)
        errors.push(`${current.id} debe declarar su omisibilidad técnica.`);
    } else if (
      current.waiverPolicy !== WAIVER_POLICY.OWNER_EXPLICIT ||
      !/^\d{4}-\d{2}-\d{2}$/.test(current.reviewRequiredBy ?? "")
    ) {
      errors.push(`${current.id} candidato carece de waiver/revisión válida.`);
    }
    if (
      Object.hasOwn(current, "affectedSurfaces") &&
      (!Array.isArray(current.affectedSurfaces) ||
        current.affectedSurfaces.length === 0 ||
        current.affectedSurfaces.some(
          (surface) => typeof surface !== "string" || surface.length < 3,
        ))
    ) {
      errors.push(`${current.id} tiene affectedSurfaces inválidas.`);
    }
  }
  if (ids.length !== new Set(ids).size)
    errors.push("La política contiene gate IDs duplicados.");
  const candidates = policy.gates
    .filter(({ waiverPolicy }) => waiverPolicy === WAIVER_POLICY.OWNER_EXPLICIT)
    .map(({ id }) => id);
  const never = policy.gates
    .filter(
      ({ gatePolicy }) => gatePolicy === GATE_POLICY.NON_WAIVABLE_SECURITY_GATE,
    )
    .map(({ id }) => id);
  if (!sameMembers(candidates, OWNER_WAIVER_CANDIDATE_GATE_IDS))
    errors.push(
      "La política no contiene exactamente los siete candidatos aprobados.",
    );
  if (!sameMembers(never, NON_WAIVABLE_SECURITY_GATE_IDS))
    errors.push(
      "La política no contiene exactamente los gates no renunciables.",
    );
  return errors;
}

export function releaseGatePolicyHash(policy = RELEASE_GATE_POLICY) {
  const errors = validateReleaseGatePolicy(policy);
  if (errors.length)
    throw new Error(`Política de gates inválida:\n${errors.join("\n")}`);
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(policy)), "utf8")
    .digest("hex");
}

const computedReleaseGatePolicySha256 = releaseGatePolicyHash();
const PINNED_RELEASE_GATE_POLICY_SHA256 =
  "59f6283b36a2805ee73710d6f1223d3c98385cf732d72e3eba31dcab4053c03e";
if (computedReleaseGatePolicySha256 !== PINNED_RELEASE_GATE_POLICY_SHA256) {
  throw new Error(
    "La política de gates cambió sin actualizar su versión y hash pineado.",
  );
}
export const RELEASE_GATE_POLICY_SHA256 = PINNED_RELEASE_GATE_POLICY_SHA256;

function validateGateResults(gateResults) {
  const errors = [];
  if (!Array.isArray(gateResults))
    return ["Los resultados de gates deben ser un array."];
  const ids = [];
  for (const result of gateResults) {
    if (!isPlainObject(result) || typeof result.gateId !== "string") {
      errors.push("Resultado de gate inválido.");
      continue;
    }
    ids.push(result.gateId);
    if (!getReleaseGateDefinition(result.gateId))
      errors.push(`Resultado para gate desconocido: ${result.gateId}.`);
    if (!allowedEvidenceStatuses.has(result.evidenceStatus))
      errors.push(`${result.gateId} tiene evidenceStatus inválido.`);
    if (!allowedRawResults.has(result.rawResult))
      errors.push(`${result.gateId} tiene rawResult inválido.`);
    const expectedRaw =
      result.evidenceStatus === EVIDENCE_STATUS.PASS
        ? RAW_RESULT.PASS
        : RAW_RESULT.FAIL;
    if (result.rawResult !== expectedRaw)
      errors.push(`${result.gateId} contradice evidenceStatus y rawResult.`);
  }
  if (ids.length !== new Set(ids).size)
    errors.push("Los resultados contienen gate IDs duplicados.");
  return errors;
}

function validateWaiverRequests(waiverRequests, gateResults) {
  const errors = [];
  if (!Array.isArray(waiverRequests))
    return ["Los waivers deben ser un array."];
  const resultById = new Map(
    gateResults.map((result) => [result.gateId, result]),
  );
  const ids = [];
  for (const waiver of waiverRequests) {
    if (!isPlainObject(waiver) || typeof waiver.gateId !== "string") {
      errors.push("Waiver inválido.");
      continue;
    }
    if (
      ["*", "all", "global"].includes(waiver.gateId.toLowerCase()) ||
      /[*?{}[\]]/.test(waiver.gateId)
    ) {
      errors.push("No existe waiver global ni se admiten wildcards.");
      continue;
    }
    ids.push(waiver.gateId);
    const definition = getReleaseGateDefinition(waiver.gateId);
    if (!definition) {
      errors.push(`Waiver para gate desconocido: ${waiver.gateId}.`);
      continue;
    }
    if (definition.waiverPolicy === WAIVER_POLICY.NEVER)
      errors.push(`${waiver.gateId} es NON_WAIVABLE_SECURITY_GATE.`);
    const result = resultById.get(waiver.gateId);
    if (!result) errors.push(`${waiver.gateId} no tiene resultado evaluado.`);
    if (result?.rawResult === RAW_RESULT.PASS)
      errors.push(`${waiver.gateId} ya es PASS y no admite waiver.`);
    if (waiver.riskAcceptedByOwner !== true)
      errors.push(`${waiver.gateId} requiere riskAcceptedByOwner=true.`);
    if (waiver.owner !== AUTHORIZED_RISK_OWNER)
      errors.push(
        `${waiver.gateId} requiere el owner autorizado exacto: ${AUTHORIZED_RISK_OWNER}.`,
      );
    if (
      typeof waiver.rationale !== "string" ||
      waiver.rationale.trim().length < 20 ||
      placeholderPattern.test(waiver.rationale)
    )
      errors.push(`${waiver.gateId} requiere rationale real.`);
  }
  if (ids.length !== new Set(ids).size)
    errors.push("Los waivers contienen gate IDs duplicados.");
  return errors;
}

export function validateReleaseGateDecisionInput({
  gateResults,
  waiverRequests = [],
} = {}) {
  const policyErrors = validateReleaseGatePolicy();
  if (policyErrors.length) return policyErrors;
  const resultErrors = validateGateResults(gateResults);
  return resultErrors.length
    ? resultErrors
    : validateWaiverRequests(waiverRequests, gateResults);
}

export function applyReleaseGateWaivers({
  gateResults,
  waiverRequests = [],
} = {}) {
  const errors = validateReleaseGateDecisionInput({
    gateResults,
    waiverRequests,
  });
  if (errors.length)
    throw new Error(`Decisión de gates inválida:\n${errors.join("\n")}`);
  const waiverById = new Map(
    waiverRequests.map((waiver) => [waiver.gateId, waiver]),
  );
  return Object.freeze(
    gateResults.map((result) => {
      const definition = getReleaseGateDefinition(result.gateId);
      const waiver = waiverById.get(result.gateId);
      return Object.freeze({
        ...result,
        gatePolicy: definition.gatePolicy,
        releaseDisposition:
          result.rawResult === RAW_RESULT.PASS
            ? RELEASE_DISPOSITION.PASS
            : waiver
              ? RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER
              : RELEASE_DISPOSITION.STOP,
        ownerAcceptance: waiver
          ? Object.freeze({
              owner: waiver.owner.trim(),
              rationale: waiver.rationale.trim(),
            })
          : null,
      });
    }),
  );
}
