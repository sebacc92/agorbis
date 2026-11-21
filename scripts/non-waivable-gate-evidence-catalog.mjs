import { NON_WAIVABLE_SECURITY_GATE_IDS } from "./release-gate-policy.mjs";

export const NON_WAIVABLE_EVIDENCE_SCOPE = Object.freeze({
  LOCAL: "local",
  REMOTE: "remote",
  MIXED: "mixed",
});

export const NON_WAIVABLE_EVIDENCE_EFFECT = Object.freeze({
  READ_ONLY: "read_only",
  STATEFUL_CANARY: "stateful_canary",
});

export const NON_WAIVABLE_EVIDENCE_EXPECTED_RESULT = "PASS";

export const NON_WAIVABLE_GATE_EVIDENCE_ENTRY_KEYS = Object.freeze(
  [
    "FAIL",
    "NOT_VERIFIED",
    "PASS",
    "canaryRequired",
    "commandLabel",
    "effect",
    "expectedResult",
    "gateId",
    "harness",
    "prerequisites",
    "sanitizedEvidence",
    "scope",
    "sourceIds",
  ].sort(),
);

export const STATEFUL_CANARY_REQUIRED_GATE_IDS = Object.freeze([
  "security.auth-functional",
  "operations.smtp-functional",
  "security.turnstile-a",
  "security.turnstile-b",
  "security.private-storage",
  "security.csp",
  "security.cookies",
]);

export const NON_STATEFUL_GATE_IDS = Object.freeze(
  NON_WAIVABLE_SECURITY_GATE_IDS.filter(
    (gateId) => !STATEFUL_CANARY_REQUIRED_GATE_IDS.includes(gateId),
  ),
);

export const D72_CANDIDATE_IDENTITY_PREREQUISITES = Object.freeze([
  "d72.candidate-identity-created-before-evidence",
  "d72.request-bound-to-current-head",
  "d72.candidate-artifact-bound-to-current-head",
  "d72.candidate-identity-deployment-flags-false",
]);

const CURRENT_REQUEST_PREREQUISITES = Object.freeze([
  ...D72_CANDIDATE_IDENTITY_PREREQUISITES,
  "d72.evidence-collected-in-current-run",
]);

const CURRENT_ARTIFACT_PREREQUISITES = Object.freeze([
  ...CURRENT_REQUEST_PREREQUISITES,
]);

const CURRENT_REMOTE_PREREQUISITES = Object.freeze([
  ...CURRENT_REQUEST_PREREQUISITES,
  "remote.explicit-production-target",
  "remote.observed-at-recorded",
]);

const CANARY_PREREQUISITES = Object.freeze([
  ...CURRENT_ARTIFACT_PREREQUISITES,
  "authorization.remote-canary-explicit",
  "canary.isolated-surface-current-run",
  "canary.controlled-account-current-run",
  "canary.cleanup-plan-ready",
]);

const definitions = [
  {
    gateId: "source.git-head-clean-and-recoverable",
    sourceIds: [
      "git.current-state",
      "git.origin-main",
      "git.recovery-audit",
      "git.remote-object-read",
    ],
    harness: "scripts/d72-git-current-state.mjs",
    commandLabel: "d72-git-current-head-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REQUEST_PREREQUISITES,
      "git.origin-main-object-fetched-in-isolated-store-current-run",
    ],
    expectedResult: "PASS",
    PASS: "El HEAD completo coincide con origin/main, la divergencia es 0/0, el worktree y diff-check están limpios, el objeto es recuperable del remoto y el audit de recuperación corresponde al mismo HEAD actual.",
    FAIL: "Alguna comprobación actual detecta HEAD distinto, divergencia, cambios locales, diff inválido, objeto remoto ausente o recuperación inválida.",
    NOT_VERIFIED:
      "No se ejecutó en esta corrida alguna lectura Git requerida o no pudo vincularse inequívocamente al HEAD del request.",
    sanitizedEvidence: [
      "headSha256",
      "originMainSha256",
      "leftCount",
      "rightCount",
      "worktreeClean",
      "diffCheckClean",
      "remoteObjectReachable",
      "recoveryAuditPassed",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "security.auth-functional",
    sourceIds: [
      "canary.auth-signup",
      "canary.auth-confirmation",
      "canary.auth-login",
      "canary.auth-recovery",
      "canary.auth-pkce",
      "canary.auth-mfa-totp",
    ],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-auth-lifecycle",
    scope: "remote",
    effect: "stateful_canary",
    prerequisites: [...CANARY_PREREQUISITES, "auth.canary-mailbox-ready"],
    expectedResult: "PASS",
    PASS: "En la canaria autorizada de esta corrida funcionan signup, confirmación, login, recuperación y callback PKCE; MFA/TOTP está disponible y no persisten tokens de proveedor.",
    FAIL: "Una operación Auth actual produce un resultado inseguro o distinto del contrato, un redirect no permitido, PKCE inválido, MFA/TOTP ausente o persistencia de tokens de proveedor.",
    NOT_VERIFIED:
      "La canaria Auth completa no fue autorizada o ejecutada en esta corrida, no terminó su cleanup, o su evidencia no corresponde al artefacto actual.",
    sanitizedEvidence: [
      "scenarioIds",
      "outcomeClasses",
      "redirectOrigins",
      "pkceVerified",
      "mfaTotpAvailable",
      "providerCredentialsPersisted",
      "cleanupCompleted",
      "evidenceDigest",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "operations.smtp-functional",
    sourceIds: [
      "canary.smtp-signup-confirmation",
      "canary.smtp-recovery",
      "canary.smtp-delivery-receipt",
    ],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-smtp-delivery",
    scope: "remote",
    effect: "stateful_canary",
    prerequisites: [...CANARY_PREREQUISITES, "smtp.canary-mailbox-ready"],
    expectedResult: "PASS",
    PASS: "La casilla canaria recibe en esta corrida los mensajes de confirmación y recuperación, y ambos enlaces completan sólo el flujo esperado del artefacto actual.",
    FAIL: "Un mensaje requerido no llega, llega fuera del flujo autorizado, contiene un destino inválido o su enlace no completa la operación esperada.",
    NOT_VERIFIED:
      "No se autorizó o completó en esta corrida el envío real a la única casilla canaria, o faltan recibos vinculables al escenario actual.",
    sanitizedEvidence: [
      "scenarioIds",
      "deliveryOutcomes",
      "latencyBuckets",
      "linkOutcomeClasses",
      "messageBodiesStored",
      "recipientIdentifiersStored",
      "cleanupCompleted",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "security.turnstile-a",
    sourceIds: ["canary.turnstile-a-handler", "canary.turnstile-a-siteverify"],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-turnstile-a",
    scope: "remote",
    effect: "stateful_canary",
    prerequisites: [
      ...CANARY_PREREQUISITES,
      "turnstile.fresh-a-response-current-scenario",
    ],
    expectedResult: "PASS",
    PASS: "Un registro legítimo atraviesa el handler Agorbis y Siteverify devuelve success con action y hostname exactos para la superficie canaria actual.",
    FAIL: "El handler acepta una respuesta inválida, Siteverify no acredita success, action o hostname difieren, o la respuesta se reutiliza.",
    NOT_VERIFIED:
      "No se obtuvo y consumió una respuesta A nueva en la canaria autorizada de esta corrida o falta alguna comprobación de Siteverify.",
    sanitizedEvidence: [
      "handlerOutcomeClass",
      "siteverifySucceeded",
      "actionMatched",
      "hostnameMatched",
      "responseReused",
      "sensitiveResponsesStored",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "security.turnstile-b",
    sourceIds: [
      "canary.turnstile-b-direct-auth",
      "canary.turnstile-b-rejection",
    ],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-turnstile-b",
    scope: "remote",
    effect: "stateful_canary",
    prerequisites: [
      ...CANARY_PREREQUISITES,
      "turnstile.a-response-not-reused-for-b",
    ],
    expectedResult: "PASS",
    PASS: "La llamada directa actual a Supabase Auth con publishable key y sin CAPTCHA es rechazada como captcha_failed o la clase canónica equivalente, sin reutilizar la respuesta A.",
    FAIL: "La llamada directa sin CAPTCHA crea o inicia una sesión, evita la barrera B o devuelve una clase no segura.",
    NOT_VERIFIED:
      "La prueba directa B no fue autorizada o ejecutada en esta corrida, o no puede acreditarse que omitió CAPTCHA y no reutilizó la respuesta A.",
    sanitizedEvidence: [
      "directAuthOutcomeClass",
      "captchaRejected",
      "sessionCreated",
      "aResponseReused",
      "sensitiveResponsesStored",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "security.rls-enforced",
    sourceIds: [
      "supabase.production-rls-catalog",
      "supabase.production-grants-catalog",
      "database.local-rls-contract",
    ],
    harness: "supabase-production-readonly-auditor",
    commandLabel: "d72-supabase-rls-grants-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "supabase.read-only-transaction-enforced",
      "database.local-contract-current-head",
    ],
    expectedResult: "PASS",
    PASS: "La lectura actual de catálogos productivos coincide con el contrato del HEAD actual: RLS está habilitada y forzada donde corresponde, las políticas y grants son exactamente los permitidos y las pruebas locales autoritativas pasan.",
    FAIL: "La base actual contiene RLS deshabilitada, políticas o grants faltantes/desconocidos, privilegios públicos indebidos o una contradicción con el contrato local.",
    NOT_VERIFIED:
      "No se obtuvo una lectura productiva completa, transaccional y read-only en esta corrida o no pudo compararse con el contrato del HEAD actual.",
    sanitizedEvidence: [
      "projectRefDigest",
      "catalogContractDigest",
      "rlsTableCount",
      "forcedRlsTableCount",
      "policyInventoryDigest",
      "grantInventoryDigest",
      "localContractPassed",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "security.private-storage",
    sourceIds: [
      "supabase.production-storage-config",
      "canary.storage-authorized-upload",
      "canary.storage-anonymous-denial",
      "canary.storage-cross-user-denial",
      "canary.storage-proxy-read",
      "canary.storage-cleanup",
    ],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-private-storage",
    scope: "mixed",
    effect: "stateful_canary",
    prerequisites: [
      ...CANARY_PREREQUISITES,
      "storage.nonsensitive-canary-object-ready",
      "storage.second-isolated-principal-ready",
    ],
    expectedResult: "PASS",
    PASS: "El objeto canario no sensible se sube a path privado, el proxy autorizado lo sirve, acceso anónimo y de otro usuario se rechazan, y el objeto y metadatos se eliminan en la misma corrida.",
    FAIL: "Algún acceso no autorizado funciona, el proxy autorizado falla, el path no es privado o queda cualquier objeto o metadato canario residual.",
    NOT_VERIFIED:
      "No se autorizó o completó el ciclo Storage actual, no se comprobó una de las identidades, o el cleanup no puede acreditarse como cero residual.",
    sanitizedEvidence: [
      "bucketPolicyDigest",
      "scenarioIds",
      "outcomeClasses",
      "objectContentDigest",
      "anonymousDenied",
      "crossPrincipalDenied",
      "proxyAuthorized",
      "residualObjectCount",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "authorization.residency-write-boundary",
    sourceIds: [
      "supabase.production-residency-contract",
      "supabase.production-write-functions",
      "database.local-residency-contract",
    ],
    harness: "supabase-production-readonly-auditor",
    commandLabel: "d72-supabase-residency-boundary-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "supabase.read-only-transaction-enforced",
      "database.local-contract-current-head",
    ],
    expectedResult: "PASS",
    PASS: "Funciones, políticas y grants productivos actuales que gobiernan residencia y escritura coinciden con el contrato del HEAD actual y la suite local prueba rechazo fuera de la comunidad habilitada.",
    FAIL: "El catálogo productivo diverge del contrato, existe un camino de escritura sin boundary de residencia o falla una prueba local autoritativa.",
    NOT_VERIFIED:
      "Falta en esta corrida la lectura productiva read-only, el contrato local actual o la comparación completa de todos los caminos de escritura.",
    sanitizedEvidence: [
      "projectRefDigest",
      "boundaryContractDigest",
      "guardedFunctionCount",
      "guardedPolicyCount",
      "localContractPassed",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "privacy.no-individual-ballots",
    sourceIds: [
      "supabase.production-ballot-schema",
      "supabase.production-ballot-integrity",
      "database.local-d68-contract",
    ],
    harness: "supabase-production-readonly-auditor",
    commandLabel: "d72-supabase-d68-ballot-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "supabase.read-only-transaction-enforced",
      "database.local-contract-current-head",
    ],
    expectedResult: "PASS",
    PASS: "El esquema, funciones, políticas e invariantes productivos actuales no conservan ni permiten reconstruir votos individuales, y el contrato D68 del HEAD actual pasa localmente.",
    FAIL: "Existe una columna, tabla, vista, función, policy, grant o dato agregado que persiste o permite volver a vincular una elección individual con una cuenta.",
    NOT_VERIFIED:
      "La auditoría productiva read-only o el contrato D68 local no cubrieron en esta corrida todas las superficies de voto previstas.",
    sanitizedEvidence: [
      "projectRefDigest",
      "ballotContractDigest",
      "individualBallotSurfaceCount",
      "reidentifiableRowCount",
      "localD68ContractPassed",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "security.anti-abuse-limits",
    sourceIds: [
      "supabase.production-abuse-functions",
      "supabase.production-abuse-policies",
      "database.local-abuse-contract",
    ],
    harness: "supabase-production-readonly-auditor",
    commandLabel: "d72-supabase-anti-abuse-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "supabase.read-only-transaction-enforced",
      "database.local-contract-current-head",
    ],
    expectedResult: "PASS",
    PASS: "Las funciones, policies, grants e índices productivos actuales implementan exactamente los límites antiabuso versionados y las pruebas locales del HEAD actual pasan.",
    FAIL: "Falta un límite, existe un bypass o divergencia productiva, un privilegio permite eludirlo, o falla el contrato local.",
    NOT_VERIFIED:
      "No se leyó y comparó en esta corrida la totalidad de superficies antiabuso productivas y locales.",
    sanitizedEvidence: [
      "projectRefDigest",
      "antiAbuseContractDigest",
      "guardedSurfaceCount",
      "unknownBypassCount",
      "localContractPassed",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "security.csp",
    sourceIds: [
      "artifact.csp-contract",
      "canary.http-response-headers",
      "canary.browser-csp-observation",
    ],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-csp",
    scope: "mixed",
    effect: "stateful_canary",
    prerequisites: [...CANARY_PREREQUISITES, "browser.clean-context-ready"],
    expectedResult: "PASS",
    PASS: "La respuesta y navegación canarias del artefacto actual entregan la CSP exacta, sin destinos, frames, scripts o estilos no autorizados ni violaciones observadas en el flujo controlado.",
    FAIL: "Falta la CSP, contiene directivas más permisivas que el contrato, aparece un destino desconocido o el navegador registra una violación relevante.",
    NOT_VERIFIED:
      "La CSP sólo fue inferida localmente o no se observó en la superficie canaria del mismo artefacto durante esta corrida.",
    sanitizedEvidence: [
      "headerContractDigest",
      "effectiveDirectiveDigest",
      "unknownDestinationCount",
      "relevantViolationCount",
      "pageScenarioIds",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "security.cookies",
    sourceIds: [
      "canary.auth-cookie-headers",
      "canary.browser-cookie-jar",
      "artifact.session-cookie-contract",
    ],
    harness: "isolated-production-canary",
    commandLabel: "d72-canary-session-cookies",
    scope: "mixed",
    effect: "stateful_canary",
    prerequisites: [...CANARY_PREREQUISITES, "browser.clean-context-ready"],
    expectedResult: "PASS",
    PASS: "Las cookies de sesión emitidas por el artefacto canario actual tienen Secure, HttpOnly y SameSite exactos, scope mínimo y no exponen valores en evidencia, logs ni actas.",
    FAIL: "Una cookie de sesión carece de un atributo requerido, tiene scope excesivo, se expone al cliente o algún valor sensible aparece en evidencia o logs.",
    NOT_VERIFIED:
      "No se completó una sesión canaria actual en navegador limpio o los headers y atributos no pudieron observarse sin conservar valores.",
    sanitizedEvidence: [
      "cookieNameDigest",
      "cookieCount",
      "secureAttributePassed",
      "httpOnlyAttributePassed",
      "sameSiteAttributePassed",
      "scopeContractPassed",
      "valuesStored",
      "observedAt",
    ],
    canaryRequired: true,
  },
  {
    gateId: "security.secret-scan",
    sourceIds: [
      "repository.secret-scan",
      "artifact.secret-scan",
      "evidence.redaction-scan",
    ],
    harness: "scripts/scan-secrets.mjs",
    commandLabel: "d72-current-source-artifact-secret-scan",
    scope: "local",
    effect: "read_only",
    prerequisites: [...CURRENT_ARTIFACT_PREREQUISITES],
    expectedResult: "PASS",
    PASS: "El repositorio del HEAD actual, el artefacto candidato exacto y la evidencia saneada de esta corrida no contienen patrones de credenciales ni archivos secretos prohibidos.",
    FAIL: "Algún escaneo actual encuentra una credencial, material secreto, archivo prohibido o dato sin sanear.",
    NOT_VERIFIED:
      "No se escanearon en esta corrida las tres superficies exactas o el artefacto no está ligado al HEAD del request.",
    sanitizedEvidence: [
      "repositoryFileCount",
      "artifactFileCount",
      "evidenceFileCount",
      "findingCount",
      "scannerPolicyDigest",
      "artifactDigest",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "security.worker-secrets-confidential",
    sourceIds: [
      "repository.secret-scan",
      "artifact.secret-scan",
      "cloudflare.worker-secret-metadata",
      "runner.output-redaction",
    ],
    harness: "d72-composite-readonly-auditor",
    commandLabel: "d72-worker-secret-confidentiality-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
    ],
    expectedResult: "PASS",
    PASS: "Repositorio, artefacto, procesos, logs y actas actuales no contienen valores de Worker Secrets; la consulta GET conserva sólo nombres y tipos permitidos.",
    FAIL: "Aparece un valor secreto o credencial en cualquier superficie, se consulta por una interfaz interna no soportada o se persiste material sensible.",
    NOT_VERIFIED:
      "No se inspeccionaron en esta corrida todas las superficies o no se pudo demostrar que la credencial usada por Wrangler permaneció sólo en memoria.",
    sanitizedEvidence: [
      "secretNameSetDigest",
      "secretTypeSetDigest",
      "repositoryFindingCount",
      "artifactFindingCount",
      "outputFindingCount",
      "supportedAuthInterfaceUsed",
      "credentialPersisted",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "cloudflare.secret-inventory-exact",
    sourceIds: ["cloudflare.worker-secret-metadata"],
    harness: "scripts/cloudflare-closed-state.mjs",
    commandLabel: "d72-cloudflare-secret-inventory-get",
    scope: "remote",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
    ],
    expectedResult: "PASS",
    PASS: "La API GET actual informa exactamente los tres Worker Secrets canónicos por nombre y tipo, sin faltantes, duplicados ni nombres desconocidos.",
    FAIL: "La consulta actual encuentra una cantidad, nombre o tipo distinto del inventario canónico.",
    NOT_VERIFIED:
      "La consulta GET no se ejecutó o no pudo completarse en esta corrida sobre la cuenta y Worker explícitos.",
    sanitizedEvidence: [
      "accountIdDigest",
      "workerName",
      "secretCount",
      "secretNameSetDigest",
      "secretTypeSetDigest",
      "unknownNameCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "database.expected-migrations-only",
    sourceIds: [
      "supabase.production-migration-ledger",
      "repository.executable-migrations",
      "repository.migration-drafts",
      "supabase.production-push-dry-run",
    ],
    harness: "supabase-production-readonly-auditor",
    commandLabel: "d72-supabase-ledger-read-and-dry-run",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "supabase.explicit-project-ref",
      // D105: el enlace local puede existir sólo si es al proyecto de
      // Producción; sin IPv6 es lo que le da a la CLI el pooler IPv4.
      "supabase.linked-project-absent-or-production",
      "supabase.push-dry-run-skip-vault",
    ],
    expectedResult: "PASS",
    PASS: "En esta corrida el ledger productivo y las migraciones ejecutables del HEAD actual son exactamente 0001–0058 + 0060 + 0061, 0059 existe sólo en migration-drafts y el push dry-run no propone migraciones, seed, roles ni Vault.",
    FAIL: "Hay una versión inesperada o faltante, 0059 aparece ejecutable o aplicada, 0060 o 0061 faltan, o el dry-run propone cualquier cambio.",
    NOT_VERIFIED:
      "No se completaron en esta corrida migration list y push dry-run con project-ref explícito, o su salida no pudo sanearse y vincularse al HEAD actual.",
    sanitizedEvidence: [
      "projectRefDigest",
      "localLedgerDigest",
      "remoteLedgerDigest",
      "localMaximumVersion",
      "remoteMaximumVersion",
      "pendingMigrationCount",
      "draft0059Present",
      "executable0059Present",
      "production0059Present",
      "production0060Present",
      "dryRunChangeCounts",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "data.integrity-no-corruption",
    sourceIds: [
      "supabase.production-integrity-read",
      "database.local-integrity-contract",
    ],
    harness: "supabase-production-readonly-auditor",
    commandLabel: "d72-supabase-integrity-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "supabase.read-only-transaction-enforced",
      "database.local-contract-current-head",
    ],
    expectedResult: "PASS",
    PASS: "Todas las invariantes productivas versionadas devuelven cero corrupción en una transacción read-only actual y las pruebas locales de integridad pasan para el mismo HEAD.",
    FAIL: "Alguna invariante actual devuelve filas inválidas, referencias rotas, duplicados prohibidos, estados imposibles o diverge del contrato local.",
    NOT_VERIFIED:
      "No se ejecutó en esta corrida el conjunto completo y versionado de consultas de integridad productiva o su alcance no puede demostrarse.",
    sanitizedEvidence: [
      "projectRefDigest",
      "integrityPolicyDigest",
      "checkCount",
      "failedCheckIds",
      "invalidRowCounts",
      "localContractPassed",
      "transactionReadOnly",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "quality.build-and-test-suite",
    sourceIds: [
      "local.lint",
      "local.build-types",
      "local.dependency-audit",
      "local.database-tests",
      "local.civic-tests",
      "local.component-tests",
      "local.e2e-tests",
      "local.preflight-tests",
      "local.release-open-tests",
      "local.secret-tests",
      "artifact.open-build",
    ],
    harness: "scripts/run-exceptional-release-local-gates.mjs",
    commandLabel: "d72-current-head-full-local-suite",
    scope: "local",
    effect: "read_only",
    prerequisites: [...CURRENT_ARTIFACT_PREREQUISITES, "runtime.node-22.22.0"],
    expectedResult: "PASS",
    PASS: "Cada comando obligatorio y el build open del artefacto actual finalizan con exit 0 sobre un worktree limpio y el mismo HEAD del request.",
    FAIL: "Algún comando obligatorio falla, se omite, cambia el worktree o produce un artefacto no vinculado al HEAD actual.",
    NOT_VERIFIED:
      "La suite no se ejecutó completa y en la misma corrida, o no se conservaron resultados saneados por comando.",
    sanitizedEvidence: [
      "runtimeVersion",
      "commandLabels",
      "exitCodes",
      "suiteCounts",
      "artifactDigest",
      "worktreeCleanAfterSuite",
      "startedAt",
      "finishedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "cloudflare.known-bindings-only",
    sourceIds: [
      "cloudflare.worker-version-bindings",
      "artifact.wrangler-bindings",
    ],
    harness: "scripts/cloudflare-closed-state.mjs",
    commandLabel: "d72-cloudflare-bindings-get",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
    ],
    expectedResult: "PASS",
    PASS: "Los bindings de la versión productiva actual y del artefacto candidato coinciden exactamente con el inventario canónico; no hay tipos, nombres ni capacidades desconocidos.",
    FAIL: "Falta un binding conocido, aparece uno desconocido o el estado remoto y el artefacto actual difieren del inventario aprobado.",
    NOT_VERIFIED:
      "No se leyeron y compararon en esta corrida ambos inventarios exactos para la cuenta, Worker, HEAD y artefacto actuales.",
    sanitizedEvidence: [
      "accountIdDigest",
      "workerName",
      "productionVersionId",
      "bindingInventoryDigest",
      "artifactBindingDigest",
      "unknownBindingCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "cloudflare.domain-config-exact",
    sourceIds: [
      "cloudflare.worker-domains",
      "cloudflare.worker-subdomain-settings",
      "cloudflare.worker-routes",
      "artifact.wrangler-domains",
    ],
    harness: "scripts/cloudflare-closed-state.mjs",
    commandLabel: "d72-cloudflare-domain-config-get",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
    ],
    expectedResult: "PASS",
    PASS: "La cuenta y Worker explícitos tienen sólo agorbis.com y www.agorbis.com como Custom Domains, routes vacías, workers.dev=false y preview_urls=false; el artefacto actual propone lo mismo.",
    FAIL: "La cuenta o Worker difieren, falta o sobra un dominio/ruta, workers.dev o preview URLs están activos, o el artefacto propone otra topología.",
    NOT_VERIFIED:
      "Algún endpoint GET o la comparación con el artefacto actual no se completó en esta corrida.",
    sanitizedEvidence: [
      "accountIdDigest",
      "workerName",
      "customDomainSetDigest",
      "routeCount",
      "workersDevEnabled",
      "previewUrlsEnabled",
      "artifactDomainConfigDigest",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "cloudflare.known-crons-only",
    sourceIds: [
      "cloudflare.worker-cron-triggers",
      "artifact.closed-cron-config",
      "artifact.open-cron-config",
      "wrangler.open-cron-dry-run",
    ],
    harness: "d72-cloudflare-readonly-and-dry-run-auditor",
    commandLabel: "d72-cloudflare-crons-read-and-dry-run",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
      "wrangler.cron-command-dry-run-enforced",
    ],
    expectedResult: "PASS",
    PASS: "La API actual informa cero Cron Triggers en CLOSED, el perfil cerrado contiene cero y el perfil open del artefacto actual propone exactamente los cinco crons canónicos mediante dry-run, sin extras.",
    FAIL: "Producción CLOSED contiene un cron, el artefacto cerrado propone alguno, o el perfil open no propone exactamente los cinco crons aprobados.",
    NOT_VERIFIED:
      "No se completaron en esta corrida la lectura GET, ambas inspecciones de artefacto y el dry-run no mutante de los cinco crons.",
    sanitizedEvidence: [
      "workerName",
      "productionCronCount",
      "closedCronSetDigest",
      "openCronSetDigest",
      "openCronCount",
      "dryRunExitCode",
      "unknownCronCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "network.production-dns-integrity",
    sourceIds: [
      "cloudflare.dns-records-get",
      "public-doh.cloudflare",
      "public-doh.google",
      "repository.dns-mail-policy",
    ],
    harness: "scripts/cloudflare-dns-audit.mjs",
    commandLabel: "d72-production-dns-readonly-audit",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "cloudflare.dns-read-token-file-interface",
      "cloudflare.dns-get-only-session",
      "dns.expected-policy-current-head",
    ],
    expectedResult: "PASS",
    PASS: "La lectura GET actual coincide con el inventario DNS y correo versionado del HEAD actual, los resolvers públicos concuerdan con la topología Custom Domains aprobada y no hay registros desconocidos.",
    FAIL: "Un registro web o de correo falta, sobra o difiere del inventario actual, los resolvers discrepan o la topología observada no es la aprobada.",
    NOT_VERIFIED:
      "La auditoría GET, ambos resolvers o la comparación con la política versionada actual no se completaron en esta corrida; una coincidencia con snapshots históricos no basta.",
    sanitizedEvidence: [
      "zoneIdDigest",
      "recordInventoryDigest",
      "webRecordDigest",
      "mailRecordDigest",
      "expectedPolicyDigest",
      "resolverAgreement",
      "unknownRecordCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "quality.production-smoke",
    sourceIds: [
      "production.closed-http-get",
      "production.closed-http-head",
      "production.closed-http-post-denial",
      "production.closed-post-no-write",
    ],
    harness: "scripts/run-d72-non-stateful-certification.mjs",
    commandLabel: "d72-production-closed-smoke-read",
    scope: "remote",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_REMOTE_PREREQUISITES,
      "production.expected-profile-closed",
      "production.http-guard-probe-contract",
      "production.post-no-write-evidence",
    ],
    expectedResult: "PASS",
    PASS: "En esta corrida apex permanece fail-closed 503 para GET/HEAD/POST, www conserva el redirect 308 con path/query y evidencia DB/artefacto separada acredita que el POST no produjo escrituras para la Version CLOSED vigente.",
    FAIL: "Apex sirve tráfico interactivo o una respuesta distinta del contrato CLOSED, www altera el redirect o la evidencia adicional detecta una escritura del POST.",
    NOT_VERIFIED:
      "No se ejecutaron todos los probes externos, no pudo acreditarse el perfil CLOSED vigente o el HTTP 503 carece de evidencia DB/artefacto separada que demuestre ausencia de escritura.",
    sanitizedEvidence: [
      "profile",
      "scenarioIds",
      "statusCodes",
      "redirectPreserved",
      "postAttemptCount",
      "postDeniedCount",
      "postWriteStatus",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "configuration.no-unknown-release-config",
    sourceIds: [
      "artifact.release-config",
      "cloudflare.worker-settings",
      "cloudflare.worker-version-bindings",
      "wrangler.version-upload-dry-run",
      "wrangler.open-cron-dry-run",
    ],
    harness: "d72-cloudflare-readonly-and-dry-run-auditor",
    commandLabel: "d72-release-config-read-and-dry-run",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
      "wrangler.all-mutation-commands-dry-run-enforced",
    ],
    expectedResult: "PASS",
    PASS: "Configuración versionada, artefacto, estado remoto GET y ambos dry-runs actuales contienen sólo variables, bindings, dominios, rutas, compatibilidad y crons canónicos, sin configuración desconocida.",
    FAIL: "Alguna fuente actual contiene configuración faltante, divergente o desconocida, o un dry-run propone una capacidad no aprobada.",
    NOT_VERIFIED:
      "No se completó en esta corrida la comparación cerrada de todas las fuentes o algún comando dejó de estar inequívocamente en dry-run.",
    sanitizedEvidence: [
      "releaseConfigDigest",
      "artifactConfigDigest",
      "remoteConfigDigest",
      "versionDryRunExitCode",
      "cronDryRunExitCode",
      "unknownConfigCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "configuration.auth-providers-aligned",
    sourceIds: [
      "supabase.production-auth-provider-config",
      "artifact.public-auth-config",
      "repository.auth-provider-policy",
      "repository.social-auth-consent-snapshot",
      "repository.social-auth-processing-evidence",
    ],
    harness: "d72-auth-config-readonly-auditor",
    commandLabel: "d72-auth-providers-alignment-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "supabase.explicit-project-ref",
      "supabase.auth-config-read-only",
      "auth.active-providers-match-versioned-target",
      "auth.active-provider-processing-es-en-confirmed",
      "auth.current-consent-snapshot-covers-active-providers",
    ],
    expectedResult: "PASS",
    PASS: "Supabase Auth, el inventario público versionado y las vars del candidato coinciden en Google activo, Facebook apagado y correo disponible, sin otros proveedores. Los destinos ES/EN del proveedor activo están confirmados y el consentimiento tiene cobertura revisada de su snapshot vigente; los gates funcionales verifican el flujo del artefacto.",
    FAIL: "Algún proveedor diverge del objetivo, aparece uno no aprobado, faltan destinos ES/EN confirmados o el snapshot vigente no cubre el proveedor activo. Ningún waiver de otros proveedores o infraestructura subsana este gate.",
    NOT_VERIFIED:
      "No se obtuvo en esta corrida la configuración Auth productiva soportada o no se verificaron contra el HEAD y candidato actuales el inventario, sus destinos y el snapshot de consentimiento.",
    sanitizedEvidence: [
      "projectRefDigest",
      "enabledProviderNames",
      "candidateProviderFlags",
      "providerPolicyDigest",
      "consentSnapshotDigest",
      "processingEvidenceDigest",
      "unknownProviderCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "configuration.ai-disabled",
    sourceIds: [
      "artifact.public-ai-config",
      "cloudflare.worker-settings",
      "repository.ai-feature-policy",
    ],
    harness: "d72-cloudflare-readonly-and-dry-run-auditor",
    commandLabel: "d72-ai-disabled-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "cloudflare.explicit-account-and-worker",
      "cloudflare.get-only-session",
    ],
    expectedResult: "PASS",
    PASS: "Política, artefacto y configuración remota actual coinciden en que IA y resúmenes están deshabilitados y no existe binding, variable o endpoint habilitante.",
    FAIL: "Una función de IA o resúmenes está activa, o aparece cualquier binding, variable, ruta o configuración habilitante desconocida.",
    NOT_VERIFIED:
      "No se inspeccionaron y compararon en esta corrida la política, el artefacto y el estado remoto vinculados al HEAD actual.",
    sanitizedEvidence: [
      "featurePolicyDigest",
      "artifactFeatureDigest",
      "remoteFeatureDigest",
      "aiEnabled",
      "summaryEnabled",
      "enablingConfigCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
  {
    gateId: "legal.pending-external-copy-honest",
    sourceIds: [
      "repository.legal-snapshot-hashes",
      "repository.legal-activation-0060",
      "supabase.production-migration-ledger",
      "artifact.legal-copy",
    ],
    harness: "d72-legal-activation-readonly-auditor",
    commandLabel: "d72-current-legal-copy-read",
    scope: "mixed",
    effect: "read_only",
    prerequisites: [
      ...CURRENT_ARTIFACT_PREREQUISITES,
      "supabase.explicit-project-ref",
      "supabase.production-ledger-current-run",
    ],
    expectedResult: "PASS",
    PASS: "Los hashes ES/EN del artefacto actual coinciden con snapshots revisados, 0060 es la activación exacta presente en Producción y el copy conserva honestamente toda evidencia externa pendiente sin alterar históricos ni aceptaciones.",
    FAIL: "Un hash o texto difiere, 0060 falta o no es exacta, el copy sobreafirma evidencia, o hay cambios en snapshots históricos, aceptaciones, 0059, votos, Storage, Auth o RLS.",
    NOT_VERIFIED:
      "No se compararon en esta corrida snapshots, SQL 0060, ledger productivo y artefacto exacto, o alguno no está ligado al HEAD actual.",
    sanitizedEvidence: [
      "spanishSnapshotDigest",
      "englishSnapshotDigest",
      "activationMigrationDigest",
      "artifactLegalDigest",
      "production0060Present",
      "production0059Present",
      "historicalSnapshotMutationCount",
      "observedAt",
    ],
    canaryRequired: false,
  },
];

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sameOrderedValues(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function arrayErrors(value, label) {
  const errors = [];
  if (!Array.isArray(value) || value.length === 0) {
    return [`${label} debe ser un array no vacío.`];
  }
  if (
    value.some(
      (entry) => typeof entry !== "string" || entry.trim() !== entry || !entry,
    )
  ) {
    errors.push(`${label} sólo admite strings no vacíos y sin padding.`);
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${label} no admite duplicados.`);
  }
  return errors;
}

export function validateNonWaivableGateEvidenceCatalog(catalog) {
  const errors = [];
  if (!Array.isArray(catalog)) {
    return ["El catálogo de evidencia debe ser un array."];
  }

  if (catalog.length !== NON_WAIVABLE_SECURITY_GATE_IDS.length) {
    errors.push(
      `El catálogo debe contener exactamente ${NON_WAIVABLE_SECURITY_GATE_IDS.length} gates no renunciables.`,
    );
  }

  const actualIds = [];
  const commandLabels = [];
  for (const [index, entry] of catalog.entries()) {
    const label = `catalog[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${label} debe ser un objeto plano.`);
      continue;
    }

    const keys = Object.keys(entry).sort();
    if (!sameOrderedValues(keys, NON_WAIVABLE_GATE_EVIDENCE_ENTRY_KEYS)) {
      errors.push(`${label} no respeta el esquema cerrado de evidencia.`);
    }

    if (typeof entry.gateId !== "string") {
      errors.push(`${label}.gateId debe ser string.`);
    } else {
      actualIds.push(entry.gateId);
      if (entry.gateId !== NON_WAIVABLE_SECURITY_GATE_IDS[index]) {
        errors.push(`${label}.gateId no coincide con el orden canónico 27/27.`);
      }
    }

    errors.push(...arrayErrors(entry.sourceIds, `${label}.sourceIds`));
    errors.push(...arrayErrors(entry.prerequisites, `${label}.prerequisites`));
    errors.push(
      ...arrayErrors(entry.sanitizedEvidence, `${label}.sanitizedEvidence`),
    );

    for (const stringKey of [
      "harness",
      "commandLabel",
      "PASS",
      "FAIL",
      "NOT_VERIFIED",
    ]) {
      if (
        typeof entry[stringKey] !== "string" ||
        entry[stringKey].trim() !== entry[stringKey] ||
        !entry[stringKey]
      ) {
        errors.push(
          `${label}.${stringKey} debe ser string no vacío sin padding.`,
        );
      }
    }

    if (typeof entry.commandLabel === "string") {
      commandLabels.push(entry.commandLabel);
    }
    if (!Object.values(NON_WAIVABLE_EVIDENCE_SCOPE).includes(entry.scope)) {
      errors.push(`${label}.scope debe ser local, remote o mixed.`);
    }
    if (!Object.values(NON_WAIVABLE_EVIDENCE_EFFECT).includes(entry.effect)) {
      errors.push(`${label}.effect debe ser read_only o stateful_canary.`);
    }
    if (entry.expectedResult !== NON_WAIVABLE_EVIDENCE_EXPECTED_RESULT) {
      errors.push(`${label}.expectedResult debe ser PASS.`);
    }
    if (typeof entry.canaryRequired !== "boolean") {
      errors.push(`${label}.canaryRequired debe ser boolean.`);
    }

    const expectedCanary = STATEFUL_CANARY_REQUIRED_GATE_IDS.includes(
      entry.gateId,
    );
    if (entry.canaryRequired !== expectedCanary) {
      errors.push(`${label}.canaryRequired contradice el mapa canónico.`);
    }
    if (
      (entry.effect === NON_WAIVABLE_EVIDENCE_EFFECT.STATEFUL_CANARY) !==
      expectedCanary
    ) {
      errors.push(`${label}.effect contradice el mapa canónico de canaria.`);
    }
    if (
      Array.isArray(entry.prerequisites) &&
      (!entry.prerequisites.includes(
        "d72.candidate-identity-created-before-evidence",
      ) ||
        !entry.prerequisites.includes("d72.request-bound-to-current-head") ||
        !entry.prerequisites.includes(
          "d72.candidate-artifact-bound-to-current-head",
        ) ||
        !entry.prerequisites.includes(
          "d72.candidate-identity-deployment-flags-false",
        ) ||
        !entry.prerequisites.includes("d72.evidence-collected-in-current-run"))
    ) {
      errors.push(
        `${label}.prerequisites debe exigir candidate identity previa e impedir reutilizar evidencia histórica o de otro HEAD.`,
      );
    }
    if (
      [entry.PASS, entry.FAIL, entry.NOT_VERIFIED].every(
        (value) => typeof value === "string",
      ) &&
      new Set([entry.PASS, entry.FAIL, entry.NOT_VERIFIED]).size !== 3
    ) {
      errors.push(`${label} debe distinguir PASS, FAIL y NOT_VERIFIED.`);
    }
  }

  if (new Set(actualIds).size !== actualIds.length) {
    errors.push("El catálogo no admite gateId duplicados.");
  }
  if (!sameOrderedValues(actualIds, NON_WAIVABLE_SECURITY_GATE_IDS)) {
    errors.push("El catálogo debe cubrir exactamente los 27 gateId canónicos.");
  }
  if (new Set(commandLabels).size !== commandLabels.length) {
    errors.push("Cada gate requiere un commandLabel único.");
  }

  return errors;
}

export function assertNonWaivableGateEvidenceCatalog(catalog) {
  const errors = validateNonWaivableGateEvidenceCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(
      `Catálogo NON_WAIVABLE inválido:\n- ${errors.join("\n- ")}`,
    );
  }
  return catalog;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

assertNonWaivableGateEvidenceCatalog(definitions);

export const NON_WAIVABLE_GATE_EVIDENCE_CATALOG = deepFreeze(definitions);

export function getNonWaivableGateEvidenceDefinition(gateId) {
  return (
    NON_WAIVABLE_GATE_EVIDENCE_CATALOG.find(
      (entry) => entry.gateId === gateId,
    ) ?? null
  );
}

// Ausencia de campos preserva exactamente el contrato histórico CLOSED.
// El perfil nuevo siempre vincula un baseline concreto; no acepta aliases.
export function d72ReleaseEvidenceProfile(value = {}) {
  const hasMode = Object.hasOwn(value, "releaseMode");
  const hasBaseline = Object.hasOwn(value, "openSourceBaselineSha256");
  if (!hasMode && !hasBaseline) return Object.freeze({});
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !hasMode ||
    !hasBaseline ||
    !Object.hasOwn(descriptors.releaseMode, "value") ||
    !Object.hasOwn(descriptors.openSourceBaselineSha256, "value") ||
    value.releaseMode !== "OPEN_UPDATE" ||
    !/^[a-f0-9]{64}$/.test(value.openSourceBaselineSha256 ?? "")
  )
    throw new Error("Perfil D72 OPEN_UPDATE o hash de baseline inválido.");
  return Object.freeze({
    releaseMode: "OPEN_UPDATE",
    openSourceBaselineSha256: value.openSourceBaselineSha256,
  });
}

const OPEN_SOURCE_SMOKE_DEFINITION = deepFreeze({
  ...getNonWaivableGateEvidenceDefinition("quality.production-smoke"),
  sourceIds: [
    "production.open-source-http-get",
    "production.open-source-http-head",
    "production.open-source-baseline",
  ],
  harness: "scripts/cloudflare-open-source-smoke-policy.mjs",
  commandLabel: "d72-production-open-source-smoke-read",
  prerequisites: [
    ...CURRENT_REMOTE_PREREQUISITES,
    "production.expected-profile-open-source",
    "production.open-source-baseline-current-run",
    "production.get-head-only-probe-contract",
  ],
  PASS: "GET/HEAD verifican el origen OPEN y su baseline exacto en esta corrida. No acredita OAuth, sesión autenticada ni ausencia de escrituras de DB.",
  FAIL: "El HTTP observado o la identidad/configuración OPEN difiere del baseline revisado.",
  NOT_VERIFIED:
    "No se obtuvo el receipt OPEN opaco, vigente y vinculado a este candidato.",
  sanitizedEvidence: [
    "baselineSha256",
    "activeDeploymentId",
    "activeVersionId",
    "completed",
    "startedAtUtc",
    "completedAtUtc",
  ],
});

export function getNonWaivableGateEvidenceDefinitionForRelease(
  gateId,
  profile = {},
) {
  const release = d72ReleaseEvidenceProfile(profile);
  return release.releaseMode === "OPEN_UPDATE" &&
    gateId === "quality.production-smoke"
    ? OPEN_SOURCE_SMOKE_DEFINITION
    : getNonWaivableGateEvidenceDefinition(gateId);
}
