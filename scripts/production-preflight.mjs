import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseJsonc,
  readWranglerConfiguration,
  validateClosedCutoverConfiguration,
  validateClosedCutoverPlan,
  validateProductionNodeVersion,
  validateWranglerConfiguration,
  validateOpenRecoveryConfiguration,
} from "./cloudflare-worker-policy.mjs";
import {
  loadProductionBuildEnvironment,
  validateCloudflareWorkerArtifact,
} from "./cloudflare-worker-artifact.mjs";
import { socialAuthConsentBlockers } from "./social-auth-consent-policy.mjs";
import { CLOUDFLARE_PUBLIC_BUILD_LOCK } from "./cloudflare-public-build-environment.mjs";
import { queryRemoteCloudflareSecretInventory } from "./cloudflare-secret-inventory.mjs";
import { validateAaipDatabaseRegistration } from "./aaip-registration-policy.mjs";
import {
  areBilingualExternalEvidenceValuesEquivalent,
  isExternalEvidencePlaceholder,
} from "../src/lib/legal-evidence-policy.js";
import {
  normalFactualStateBlockers,
  validateD72CandidatePreflightState,
  validateExceptionalPreflightState,
} from "./exceptional-release-preflight-policy.mjs";
import { readExceptionalReleaseRequestFile } from "./exceptional-release-act.mjs";
import {
  validateMigrationDraftFiles,
  validateProductionMigrationFiles,
} from "./production-preflight-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOSED_CUTOVER_FLAG = "--closed-cutover";
const EXCEPTIONAL_REQUEST_FLAG = "--exceptional-request";
const D72_CANDIDATE_REQUEST_FLAG = "--d72-candidate-request";
const preflightArguments = process.argv.slice(2);
const openRecovery =
  preflightArguments.length === 2 &&
  preflightArguments[0] === "--open-recovery-request";
const closedCutover =
  preflightArguments.length === 1 &&
  preflightArguments[0] === CLOSED_CUTOVER_FLAG;
const exceptionalRequestPath =
  preflightArguments.length === 2 &&
  preflightArguments[0] === EXCEPTIONAL_REQUEST_FLAG
    ? preflightArguments[1]
    : null;
const d72CandidateRequestPath =
  preflightArguments.length === 2 &&
  (preflightArguments[0] === D72_CANDIDATE_REQUEST_FLAG || openRecovery)
    ? preflightArguments[1]
    : null;
const releaseRequestPath =
  exceptionalRequestPath ?? d72CandidateRequestPath ?? null;

if (preflightArguments.length > 0 && !closedCutover && !releaseRequestPath) {
  console.error(
    `Preflight de producción: argumento no permitido. Sólo se admite ${CLOSED_CUTOVER_FLAG}, ${EXCEPTIONAL_REQUEST_FLAG} <ruta> o ${D72_CANDIDATE_REQUEST_FLAG} <ruta> o --open-recovery-request <ruta>.`,
  );
  process.exit(1);
}

let releaseRequest;
if (releaseRequestPath) {
  try {
    const gitExecutable = d72CandidateRequestPath ? "/usr/bin/git" : "git";
    const headResult = spawnSync(gitExecutable, ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    if (headResult.error || headResult.signal || headResult.status !== 0) {
      throw new Error("No se pudo resolver el HEAD actual.");
    }
    releaseRequest = readExceptionalReleaseRequestFile({
      requestPath: releaseRequestPath,
      worktreeRoot: root,
      currentHead: headResult.stdout.trim(),
    });
    if (openRecovery && releaseRequest.releaseMode !== "OPEN_UPDATE") {
      throw new Error(
        "La recuperación abierta requiere un request OPEN_UPDATE v2.",
      );
    }
  } catch (error) {
    console.error(
      `Preflight D72: request inválido — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const releaseRiskGateIds =
  releaseRequest?.risks.map(({ gateId }) => gateId) ?? [];
const releaseRequestIncludes = (gateId) => releaseRiskGateIds.includes(gateId);

const errors = [];
const warnings = [];
errors.push(...validateProductionNodeVersion());
// El preflight consume únicamente el entorno explícito del proceso. El runner
// de apertura lo construye desde fuentes versionadas y nunca carga .env.local.
const productionBuildEnvironment =
  process.env[CLOUDFLARE_PUBLIC_BUILD_LOCK] === "1"
    ? process.env
    : loadProductionBuildEnvironment(root);

let wranglerConfiguration;
let closedWranglerConfiguration;
try {
  wranglerConfiguration = readWranglerConfiguration(
    path.join(root, "wrangler.jsonc"),
  );
  errors.push(...validateWranglerConfiguration(wranglerConfiguration));
} catch (error) {
  errors.push(
    error instanceof Error
      ? error.message
      : "wrangler.jsonc falta o no contiene JSONC válido.",
  );
}
try {
  closedWranglerConfiguration = parseJsonc(
    readFileSync(path.join(root, "wrangler.closed.jsonc"), "utf8"),
    "wrangler.closed.jsonc",
  );
  if (wranglerConfiguration) {
    errors.push(
      ...validateClosedCutoverConfiguration(
        closedWranglerConfiguration,
        wranglerConfiguration,
      ),
    );
  }
} catch (error) {
  errors.push(
    error instanceof Error
      ? error.message
      : "wrangler.closed.jsonc falta o no contiene JSONC válido.",
  );
}
{
  try {
    const recoveryConfiguration = readWranglerConfiguration(
      path.join(root, "wrangler.open-recovery.jsonc"),
    );
    errors.push(
      ...validateOpenRecoveryConfiguration(
        recoveryConfiguration,
        wranglerConfiguration,
      ),
    );
    if (openRecovery) wranglerConfiguration = recoveryConfiguration;
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : "Perfil OPEN de recuperación inválido.",
    );
  }
}
if (existsSync(path.join(root, "vercel.json"))) {
  errors.push(
    "vercel.json debe eliminarse: Cloudflare Workers es el único runtime y scheduler de Producción.",
  );
}
try {
  const packageConfiguration = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const vercelScripts = Object.entries(
    packageConfiguration.scripts ?? {},
  ).filter(([name, command]) => /vercel/i.test(`${name} ${command}`));
  if (vercelScripts.length > 0) {
    errors.push(
      `package.json todavía contiene scripts Vercel: ${vercelScripts
        .map(([name]) => name)
        .join(", ")}.`,
    );
  }
  if (
    Object.hasOwn(packageConfiguration.dependencies ?? {}, "vercel") ||
    Object.hasOwn(packageConfiguration.devDependencies ?? {}, "vercel")
  ) {
    errors.push("package.json todavía declara la dependencia vercel.");
  }
  if (packageConfiguration.engines?.node !== "22.x") {
    errors.push("package.json debe fijar Node 22.x para build y Producción.");
  }
  if (packageConfiguration.devDependencies?.wrangler !== "4.160.1") {
    errors.push("package.json debe fijar Wrangler exactamente en 4.160.1.");
  }
  if (
    packageConfiguration.scripts?.["cf-typegen"] !==
    "wrangler types --include-runtime=false --strict-vars=true"
  ) {
    errors.push(
      "cf-typegen debe generar únicamente Env estricto, sin duplicar los tipos globales del runtime.",
    );
  }
  if (
    packageConfiguration.scripts?.["build.cloudflare:closed"] !==
    "node scripts/cloudflare-build.mjs --closed-cutover"
  ) {
    errors.push(
      "build.cloudflare:closed debe usar exclusivamente el build fail-closed del cutover cerrado.",
    );
  }
  if (Object.hasOwn(packageConfiguration.scripts ?? {}, "deploy")) {
    errors.push(
      "package.json no puede conservar un deploy open genérico fuera del cutover excepcional versionado.",
    );
  }
  if (
    packageConfiguration.scripts?.["deploy:dry-run"] !==
    "pnpm build.cloudflare && wrangler deploy --dry-run --no-autoconfig"
  ) {
    errors.push(
      "deploy:dry-run debe usar el build fail-closed y autoconfiguración deshabilitada.",
    );
  }
  if (
    packageConfiguration.scripts?.["deploy:closed"] !==
    "pnpm build.cloudflare:closed && wrangler deploy --config wrangler.closed.jsonc --strict --no-autoconfig"
  ) {
    errors.push(
      "deploy:closed debe usar el build y config de cutover cerrados, Wrangler strict y sin autoconfiguración.",
    );
  }
  if (
    packageConfiguration.scripts?.["deploy:closed:dry-run"] !==
    "pnpm build.cloudflare:closed && wrangler deploy --config wrangler.closed.jsonc --dry-run --no-autoconfig"
  ) {
    errors.push(
      "deploy:closed:dry-run debe validar el mismo perfil cerrado sin subirlo ni permitir autoconfiguración.",
    );
  }
  if (
    packageConfiguration.scripts?.["release:open:exceptional:dry-run"] !==
    "node scripts/run-exceptional-open-release.mjs"
  ) {
    errors.push(
      "release:open:exceptional:dry-run debe usar exclusivamente el runner excepcional dry-run-only.",
    );
  }
  if (
    packageConfiguration.scripts?.["release:open:exceptional:cutover"] !==
    "node scripts/run-exceptional-open-cutover.mjs"
  ) {
    errors.push(
      "release:open:exceptional:cutover debe usar exclusivamente el consumidor versionado de acta/artifact.",
    );
  }
  if (
    packageConfiguration.scripts?.[
      "release:open:exceptional:recover-closed"
    ] !== "node scripts/run-exceptional-closed-recovery.mjs"
  ) {
    errors.push(
      "release:open:exceptional:recover-closed debe usar exclusivamente el recovery CLOSED versionado.",
    );
  }
  for (const [scriptName, command] of Object.entries(
    packageConfiguration.scripts ?? {},
  )) {
    if (
      /exceptional/i.test(scriptName) &&
      /deploy/i.test(`${scriptName} ${command}`)
    ) {
      errors.push("package.json no puede definir ningún deploy excepcional.");
    }
  }
} catch {
  errors.push("package.json falta o no contiene JSON válido.");
}

const value = (name) => process.env[name]?.trim() ?? "";
const isReservedHostname = (hostname) =>
  ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
  /\.(?:localhost|local|test|example|invalid)$/i.test(hostname);
function requireValue(name, minimum = 1) {
  const current = value(name);
  if (current.length < minimum || isExternalEvidencePlaceholder(current)) {
    errors.push(`${name} falta o todavía contiene un placeholder.`);
  }
  return current;
}

function requireHttps(name) {
  const current = requireValue(name);
  try {
    const url = new URL(current);
    if (url.protocol !== "https:") errors.push(`${name} debe usar https://.`);
    if (isReservedHostname(url.hostname)) {
      errors.push(`${name} no puede apuntar al entorno local.`);
    }
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      errors.push(
        `${name} debe contener sólo el origen, sin ruta ni credenciales.`,
      );
    }
  } catch {
    errors.push(`${name} no es una URL válida.`);
  }
}

if (closedCutover) {
  const cloudflareWorkersPlan = requireValue("CLOUDFLARE_WORKERS_PLAN");
  if (cloudflareWorkersPlan) {
    errors.push(...validateClosedCutoverPlan(cloudflareWorkersPlan));
  }

  const migrationDirectoryEntries = readdirSync(
    path.join(root, "supabase", "migrations"),
  );
  const migrationDraftEntries = readdirSync(
    path.join(root, "supabase", "migration-drafts"),
  );
  const migrations = migrationDirectoryEntries.filter((name) =>
    /^\d{4}_.+\.sql$/.test(name),
  );
  errors.push(...validateProductionMigrationFiles(migrationDirectoryEntries));
  errors.push(...validateMigrationDraftFiles(migrationDraftEntries));

  if (closedWranglerConfiguration) {
    errors.push(
      ...validateCloudflareWorkerArtifact(
        path.join(root, "dist"),
        closedWranglerConfiguration,
        { runtimeSecrets: productionBuildEnvironment },
      ),
    );
  }

  // Esta consulta remota devuelve únicamente nombres/tipos. Se ejecuta recién
  // después de todos los gates locales para no tocar Cloudflare ante un perfil
  // inválido. El cutover nunca acepta los estados transitorios 1/3 o 2/3.
  if (errors.length === 0) {
    errors.push(
      ...queryRemoteCloudflareSecretInventory({
        root,
        configPath: "wrangler.closed.jsonc",
        stage: "complete",
      }),
    );
  }

  if (errors.length) {
    console.error("Preflight de cutover cerrado: BLOQUEADO");
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }

  console.log(
    `Preflight de cutover cerrado: configuración Paid válida (${migrations.length} migraciones, dos custom domains, cero crons y 3/3 Worker Secrets remotos).`,
  );
  process.exit(0);
}

requireHttps("PUBLIC_SITE_URL");
requireHttps("PUBLIC_SUPABASE_URL");
const supabasePublicKey = requireValue("PUBLIC_SUPABASE_ANON_KEY", 20);
const supabaseSecretKey = releaseRequest
  ? value("SUPABASE_SECRET_KEY")
  : requireValue("SUPABASE_SECRET_KEY", 20);

if (releaseRequest) {
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SECRET",
    "CRON_SECRET",
  ]) {
    if (value(name)) {
      errors.push(
        `${name} no debe ser leído ni heredado por el runner excepcional; el inventario remoto valida sólo nombres 3/3.`,
      );
    }
  }
}

if (value("SUPABASE_SERVICE_ROLE_KEY")) {
  errors.push(
    "Retirá SUPABASE_SERVICE_ROLE_KEY: Agorbis acepta la credencial moderna únicamente como SUPABASE_SECRET_KEY.",
  );
}

if (supabasePublicKey) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(supabasePublicKey)) {
    errors.push(
      "PUBLIC_SUPABASE_ANON_KEY debe ser una clave sb_publishable_ válida; una clave secreta o JWT legado nunca puede entrar al bundle público.",
    );
  }
}
if (!releaseRequest && supabaseSecretKey) {
  if (supabasePublicKey === supabaseSecretKey) {
    errors.push(
      "Las claves pública y secreta de Supabase deben ser distintas.",
    );
  }
  if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(supabaseSecretKey)) {
    errors.push(
      "SUPABASE_SECRET_KEY debe ser una clave sb_secret_ válida; producción no acepta la service_role JWT legacy.",
    );
  }
}
if (!releaseRequest) requireValue("CRON_SECRET", 32);
const cloudflareWorkersPlan = requireValue("CLOUDFLARE_WORKERS_PLAN");
if (cloudflareWorkersPlan && cloudflareWorkersPlan !== "paid") {
  errors.push(
    "CLOUDFLARE_WORKERS_PLAN debe ser exactamente paid: Free agotaría los 5/5 Cron Triggers y limita el CPU a 10 ms.",
  );
}
requireValue("PUBLIC_LEGAL_CONTROLLER_NAME", 2);

const authEmailRateLimit = requireValue(
  "SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR",
);
if (authEmailRateLimit && authEmailRateLimit !== "6") {
  errors.push(
    "SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR debe ser 6 y coincidir con Auth > Rate Limits de Supabase Cloud.",
  );
}

function requireAttestation(name, expected) {
  const current = requireValue(name);
  if (current && current !== expected) {
    errors.push(`${name} debe ser exactamente ${JSON.stringify(expected)}.`);
  }
}

requireAttestation("CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED", "true");
requireAttestation("SUPABASE_AUTH_CAPTCHA_ENABLED", "true");
requireAttestation("SUPABASE_AUTH_CAPTCHA_PROVIDER", "turnstile");
requireAttestation("SUPABASE_AUTH_IP_FORWARDING_ENABLED", "true");
requireAttestation("SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED", "true");
requireAttestation("SUPABASE_AUTH_SIGNUPS_ENABLED", "true");
requireAttestation("SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED", "true");
requireAttestation(
  "SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED",
  "true",
);
requireAttestation("SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED", "false");
requireAttestation("SUPABASE_AUTH_PHONE_AUTH_ENABLED", "false");
requireAttestation("SUPABASE_AUTH_MIN_PASSWORD_LENGTH", "12");
// D101: el Dashboard de Producción exige letras y números ("Letters and
// digits"), sin mayúsculas ni símbolos obligatorios. En el vocabulario del CLI
// de Supabase eso es `letters_digits`; cualquier otro valor, incluido el
// anterior con símbolos o el rótulo del Dashboard, no es una atestación
// honesta y bloquea.
requireAttestation("SUPABASE_AUTH_PASSWORD_REQUIREMENTS", "letters_digits");
// D91: el arranque corre en Supabase Free, donde la protección contra
// contraseñas filtradas no existe. El plan declarado decide qué atestación es
// honesta: con "free" sólo se acepta "false" (no se atesta algo que el plan no
// ofrece) y desde "pro" se exige "true". Sin plan, el preflight falla cerrado.
const SUPABASE_PLANS_WITH_LEAKED_PASSWORD_PROTECTION = [
  "pro",
  "team",
  "enterprise",
];
const supabasePlan = requireValue("SUPABASE_PLAN");
if (supabasePlan === "free") {
  requireAttestation(
    "SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED",
    "false",
  );
  warnings.push(
    "SUPABASE_PLAN=free: sin protección contra contraseñas filtradas, sin backups administrados y con pausa tras una semana sin actividad (D91). Compensan en parte la contraseña de 12 caracteres con letras y números (D101), TOTP, Turnstile y la reautenticación; una contraseña reutilizada y ya filtrada no se detecta.",
  );
} else if (
  SUPABASE_PLANS_WITH_LEAKED_PASSWORD_PROTECTION.includes(supabasePlan)
) {
  requireAttestation(
    "SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED",
    "true",
  );
} else if (supabasePlan) {
  errors.push('SUPABASE_PLAN debe ser "free", "pro", "team" o "enterprise".');
}
requireAttestation("SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED", "true");
requireAttestation("SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED", "true");
requireAttestation("SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS", "2");
requireAttestation("SUPABASE_LEGACY_SERVICE_ROLE_DISABLED", "true");

const authSiteUrl = requireValue("SUPABASE_AUTH_SITE_URL");
const publicSiteOrigin = (() => {
  try {
    return new URL(value("PUBLIC_SITE_URL")).origin;
  } catch {
    return value("PUBLIC_SITE_URL");
  }
})();
if (publicSiteOrigin !== "https://agorbis.com") {
  errors.push(
    "PUBLIC_SITE_URL debe ser exactamente el origen canónico https://agorbis.com para este proyecto de producción.",
  );
}
if (authSiteUrl) {
  try {
    const parsedAuthSiteUrl = new URL(authSiteUrl);
    if (
      parsedAuthSiteUrl.origin !== publicSiteOrigin ||
      parsedAuthSiteUrl.pathname !== "/" ||
      parsedAuthSiteUrl.search ||
      parsedAuthSiteUrl.hash ||
      parsedAuthSiteUrl.username ||
      parsedAuthSiteUrl.password
    ) {
      throw new Error("URL Configuration no coincide");
    }
  } catch {
    errors.push(
      "SUPABASE_AUTH_SITE_URL debe ser únicamente el mismo origen de PUBLIC_SITE_URL.",
    );
  }
}

const expectedAuthRedirectUrls = [
  `${publicSiteOrigin}/auth/callback`,
  `${publicSiteOrigin}/auth/confirm`,
];
const authRedirectUrls = requireValue("SUPABASE_AUTH_REDIRECT_URLS")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
if (
  authRedirectUrls.length !== expectedAuthRedirectUrls.length ||
  expectedAuthRedirectUrls.some((url) => !authRedirectUrls.includes(url)) ||
  authRedirectUrls.some((url) => !expectedAuthRedirectUrls.includes(url))
) {
  errors.push(
    `SUPABASE_AUTH_REDIRECT_URLS debe contener únicamente ${expectedAuthRedirectUrls.join(
      ", ",
    )}, sin comodines ni URLs de preview/local.`,
  );
}

const expectedSecurityNotifications = [
  "email_changed",
  "identity_linked",
  "identity_unlinked",
  "mfa_factor_enrolled",
  "mfa_factor_unenrolled",
  "password_changed",
];
const securityNotificationEntries = requireValue(
  "SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED",
)
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const securityNotifications = [...new Set(securityNotificationEntries)].sort();
if (
  securityNotificationEntries.length !== expectedSecurityNotifications.length ||
  securityNotifications.length !== expectedSecurityNotifications.length ||
  expectedSecurityNotifications.some(
    (notification) => !securityNotifications.includes(notification),
  )
) {
  errors.push(
    `SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED debe enumerar exactamente ${expectedSecurityNotifications.join(
      ",",
    )}. La notificación de teléfono queda fuera mientras Phone Auth esté deshabilitado.`,
  );
}

const legalEmail = requireValue("PUBLIC_LEGAL_CONTACT_EMAIL", 6);
if (legalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legalEmail)) {
  errors.push("PUBLIC_LEGAL_CONTACT_EMAIL no es un correo válido.");
} else if (legalEmail && isReservedHostname(legalEmail.split("@").at(-1))) {
  errors.push("PUBLIC_LEGAL_CONTACT_EMAIL no puede usar un dominio reservado.");
}

const aaipControllerId = requireValue("PUBLIC_AAIP_CONTROLLER_ID", 20);
if (
  aaipControllerId &&
  !/^RL-\d{4}-\d{8,}-APN-DNPDP#AAIP$/i.test(aaipControllerId)
) {
  errors.push(
    "PUBLIC_AAIP_CONTROLLER_ID debe ser el código público RL-AAAA-NNNNNNNN…-APN-DNPDP#AAIP emitido por AAIP para el responsable; no uses el expediente EX-, la transacción TAD, el CUIL/CUIT ni texto como 'en trámite'.",
  );
}

const aaipRegistrationStatus = value("AAIP_DATABASE_REGISTRATION_STATUS");
const publicAaipRegistrationStatus = value(
  "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
);
if (!aaipRegistrationStatus) {
  errors.push("AAIP_DATABASE_REGISTRATION_STATUS falta.");
}
if (!publicAaipRegistrationStatus) {
  errors.push("PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS falta.");
}
const aaipDatabaseRegistrationId = value(
  "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
);
if (publicAaipRegistrationStatus !== aaipRegistrationStatus) {
  errors.push(
    "El estado AAIP canónico y su proyección pública deben coincidir exactamente.",
  );
}
errors.push(
  ...validateAaipDatabaseRegistration({
    status: aaipRegistrationStatus,
    registrationId: aaipDatabaseRegistrationId,
    controllerId: aaipControllerId,
  }),
);
if (!releaseRequest && aaipRegistrationStatus !== "approved") {
  errors.push(
    "El release normal exige AAIP_DATABASE_REGISTRATION_STATUS=approved; pending permanece BLOCKED_EXTERNAL.",
  );
}

if (exceptionalRequestPath) {
  const exceptionalState = validateExceptionalPreflightState({
    environment: process.env,
    acceptedRiskGateIds: releaseRiskGateIds,
  });
  errors.push(...exceptionalState.errors);
  warnings.push(...exceptionalState.warnings);
} else if (d72CandidateRequestPath) {
  for (const [name, expected] of [
    ["AGORBIS_D72_CANDIDATE_BUILD", "true"],
    ["AGORBIS_D72_DEPLOYMENT_AUTHORIZED", "false"],
    ["AGORBIS_D72_DEPLOYMENT_EXECUTED", "false"],
    ["AGORBIS_D72_RISK_ACCEPTANCE_RECORDED", "false"],
  ]) {
    if (value(name) !== expected) {
      errors.push(`${name} debe ser exactamente ${expected}.`);
    }
  }
  const candidateState = validateD72CandidatePreflightState({
    environment: process.env,
    requestedRiskGateIds: releaseRiskGateIds,
  });
  errors.push(...candidateState.errors);
  warnings.push(...candidateState.warnings);
  if (
    candidateState.deploymentAuthorized !== false ||
    candidateState.deploymentExecuted !== false ||
    candidateState.riskAcceptanceRecorded !== false
  ) {
    errors.push("El preflight candidato intentó autorizar una operación.");
  }
} else {
  errors.push(...normalFactualStateBlockers(process.env));
}

for (const name of [
  "PUBLIC_SUPABASE_PROCESSING_LOCATION",
  "PUBLIC_RESEND_PROCESSING_LOCATION",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
]) {
  if (!releaseRequestIncludes("privacy.provider-locations-unverified")) {
    requireValue(name, 12);
    requireValue(`${name}_EN`, 12);
  }
}

const normalizeDisclosure = (current) =>
  current
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

for (const name of [
  "VERCEL_PLAN",
  "PUBLIC_VERCEL_PROCESSING_LOCATION",
  "PUBLIC_VERCEL_PROCESSING_LOCATION_EN",
]) {
  if (value(name)) {
    errors.push(
      `${name} debe retirarse: Agorbis ya no usa Vercel en Producción.`,
    );
  }
}

for (const name of [
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
]) {
  const disclosure = normalizeDisclosure(value(name));
  const describesDnsOnly =
    /\bdns[ -]?only\b/.test(disclosure) ||
    /\b(?:solo|solamente)\s+dns\b/.test(disclosure) ||
    /\bdns\s+(?:solo|solamente)\b/.test(disclosure);
  const describesTurnstilePair =
    /\bturnstile\b/.test(disclosure) && /\ba\s*\/\s*b\b/.test(disclosure);
  if (
    disclosure &&
    (!/\bglobal\b/.test(disclosure) ||
      !/\bworker(?:s)?\b/.test(disclosure) ||
      !/\bdns\b/.test(disclosure) ||
      !/\b(?:autoritativ\w*|authoritative)\b/.test(disclosure) ||
      !/\b(?:http|https|solicitud\w*|requests?|trafico|traffic)\b/.test(
        disclosure,
      ) ||
      !describesTurnstilePair ||
      describesDnsOnly)
  ) {
    errors.push(
      `${name} debe describir Cloudflare Workers en su red global como runtime HTTP, DNS autoritativo y las dos configuraciones Turnstile A/B; no puede seguir diciendo DNS only.`,
    );
  }
}

function identifiesPreConsentArgentineTransferMechanism(current) {
  const normalized = current
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const applicationVerbSource =
    "(?:aplic\\w*|incorpor\\w*|suscri\\w*|celebr\\w*|respald\\w*|utiliz\\w*|ejecut\\w*|adopt\\w*|implement\\w*|rely|relies|relied|executed|signed|uses?|used)";
  const applicationVerb = new RegExp(`\\b${applicationVerbSource}\\b`);
  const applicationIsDenied = new RegExp(
    `(?:\\bno\\s+(?:(?:se|han|fueron|estan|esta|quedaron|fue|ha)\\s+){0,3}${applicationVerbSource}\\b|\\b(?:not|never)\\s+(?:(?:yet|been|being|are|is|was|were)\\s+){0,3}${applicationVerbSource}\\b|\\b(?:sin|without)\\s+(?:(?:haber|being)\\s+)?${applicationVerbSource}\\b)`,
  ).test(normalized);
  const mechanismIsActuallyApplied =
    applicationVerb.test(normalized) && !applicationIsDenied;
  const aaipModelClauses =
    normalized.includes("aaip") &&
    /claus/.test(normalized) &&
    /model/.test(normalized) &&
    mechanismIsActuallyApplied;
  const concreteArticleTwelveCase = [
    /(?:cooperacion|colaboracion|collaboration).{0,30}(?:judicial|court)/,
    /(?:tratamiento|treatment).{0,25}medic/,
    /(?:investigacion|research).{0,25}epidemiolog/,
    /(?:transferencia|transfer).{0,30}(?:bancari|bank|bursatil|stock exchange)/,
    /(?:tratado|treaty|acuerdo internacional|international agreement)/,
    /(?:cooperacion|cooperation).{0,40}(?:inteligencia|intelligence)/,
    /(?:crimen organizado|organized crime|terroris|narcotraf|drug trafficking)/,
  ].some((pattern) => pattern.test(normalized));
  const articleTwelveException =
    /(?:articulo|article)\s*12/.test(normalized) &&
    /excep|exception/.test(normalized) &&
    concreteArticleTwelveCase;
  const aaipApproval =
    normalized.includes("aaip") &&
    /autoriza|aprob|approv|authoriz/.test(normalized) &&
    /(?:acto administrativo|resolucion|disposicion|expediente|administrative act|resolution|decision|file)/.test(
      normalized,
    );
  return aaipModelClauses || articleTwelveException || aaipApproval;
}

for (const name of [
  "PUBLIC_TRANSFER_SAFEGUARDS",
  "PUBLIC_TRANSFER_SAFEGUARDS_EN",
]) {
  const transferSafeguards = releaseRequestIncludes(
    "legal.transfer-safeguards-unverified",
  )
    ? value(name)
    : requireValue(name, 80);
  if (
    transferSafeguards &&
    (!/argentin/i.test(transferSafeguards) ||
      !identifiesPreConsentArgentineTransferMechanism(transferSafeguards))
  ) {
    errors.push(
      `${name} debe identificar el mecanismo argentino real que cubre el primer request y todo flujo que llegue a Cloudflare Workers sin una decisión afirmativa previa y acreditable para ese tratamiento, incluida la lectura pública y, cuando corresponda, ingreso, recuperación, seguridad y ejercicio de derechos: cláusulas modelo AAIP efectivamente incorporadas, aprobación documentada de AAIP o una excepción concreta del artículo 12. El consentimiento del alta no los cubre retroactivamente; tampoco alcanza un DPA genérico.`,
    );
  }
}

for (const name of [
  "PUBLIC_PROVIDER_RETENTION_SUMMARY",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
]) {
  const providerRetention = releaseRequestIncludes(
    "privacy.provider-retention-unverified",
  )
    ? value(name)
    : requireValue(name, 30);
  if (
    providerRetention &&
    !/(?:d[ií]as?|days?|mes(?:es)?|months?|a[nñ]os?|years?|rotaci[oó]n|rotation|eliminaci[oó]n|delet)/i.test(
      providerRetention,
    )
  ) {
    errors.push(
      `${name} debe indicar plazos o ciclos de eliminación/rotación.`,
    );
  }
}

for (const name of [
  "PUBLIC_SUPABASE_PROCESSING_LOCATION",
  "PUBLIC_RESEND_PROCESSING_LOCATION",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY",
  "PUBLIC_TRANSFER_SAFEGUARDS",
]) {
  if (
    areBilingualExternalEvidenceValuesEquivalent(
      value(name),
      value(`${name}_EN`),
    )
  ) {
    errors.push(
      `${name} y ${name}_EN deben contener textos ES/EN distintos; repetir el mismo valor no acredita una traducción.`,
    );
  }
}

for (const [provider, label] of [
  ["GOOGLE", "Google"],
  ["FACEBOOK", "Facebook"],
]) {
  const flag = `PUBLIC_${provider}_AUTH_ENABLED`;
  const enabled = requireValue(flag);
  if (!["true", "false"].includes(enabled)) {
    errors.push(`${flag} debe ser "true" o "false".`);
  } else if (enabled === "false") {
    warnings.push(`${label} OAuth está deshabilitado en la aplicación.`);
  } else {
    requireValue(`PUBLIC_${provider}_PROCESSING_LOCATION`, 12);
    requireValue(`PUBLIC_${provider}_PROCESSING_LOCATION_EN`, 12);
    if (
      areBilingualExternalEvidenceValuesEquivalent(
        value(`PUBLIC_${provider}_PROCESSING_LOCATION`),
        value(`PUBLIC_${provider}_PROCESSING_LOCATION_EN`),
      )
    ) {
      errors.push(
        `PUBLIC_${provider}_PROCESSING_LOCATION y PUBLIC_${provider}_PROCESSING_LOCATION_EN deben contener textos ES/EN distintos.`,
      );
    }
  }
}

errors.push(
  ...socialAuthConsentBlockers(
    {
      PUBLIC_GOOGLE_AUTH_ENABLED: value("PUBLIC_GOOGLE_AUTH_ENABLED"),
      PUBLIC_FACEBOOK_AUTH_ENABLED: value("PUBLIC_FACEBOOK_AUTH_ENABLED"),
    },
    { root },
  ),
);

const openAiKey = value("OPENAI_API_KEY");
const summaryModel = value("OPENAI_SUMMARY_MODEL");
if (openAiKey || summaryModel) {
  errors.push(
    "Los resúmenes de IA deben permanecer deshabilitados hasta publicar proveedor, destino, DPA, retención y una versión de privacidad actualizada.",
  );
} else {
  warnings.push("Los resúmenes de IA están deshabilitados.");
}

function productionHostnames(name) {
  const hostnames = requireValue(name, 1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const hostname of hostnames) {
    try {
      const parsed = new URL(`https://${hostname}`);
      if (
        parsed.hostname !== hostname.toLowerCase() ||
        parsed.pathname !== "/" ||
        parsed.port ||
        parsed.username ||
        parsed.password ||
        isReservedHostname(parsed.hostname) ||
        hostname.includes("*")
      ) {
        throw new Error("hostname inválido");
      }
    } catch {
      errors.push(
        `${name} contiene un hostname inválido: ${hostname || "(vacío)"}.`,
      );
    }
  }
  return hostnames;
}

const turnstileSiteKey = requireValue("PUBLIC_TURNSTILE_SITE_KEY", 20);
const turnstileSecret = releaseRequest
  ? value("TURNSTILE_SECRET")
  : requireValue("TURNSTILE_SECRET", 20);
if (value("TURNSTILE_TESTING")) {
  errors.push(
    "TURNSTILE_TESTING es exclusivo del E2E local y no puede existir en producción.",
  );
}
const turnstileHostnames = productionHostnames("TURNSTILE_HOSTNAMES");
const guardHostnames = productionHostnames(
  "TURNSTILE_SUPABASE_GUARD_HOSTNAMES",
);
const dummyTurnstileValues = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);
if (dummyTurnstileValues.has(turnstileSiteKey)) {
  errors.push(
    "PUBLIC_TURNSTILE_SITE_KEY no puede usar una clave dummy en producción.",
  );
}
if (dummyTurnstileValues.has(turnstileSecret)) {
  errors.push("TURNSTILE_SECRET no puede usar una clave dummy en producción.");
}

const siteHostname = (() => {
  try {
    return new URL(value("PUBLIC_SITE_URL")).hostname.toLowerCase();
  } catch {
    return "";
  }
})();
for (const [name, hostnames] of [
  ["TURNSTILE_HOSTNAMES", turnstileHostnames],
  ["TURNSTILE_SUPABASE_GUARD_HOSTNAMES", guardHostnames],
]) {
  if (
    siteHostname &&
    (hostnames.length !== 1 || hostnames[0] !== siteHostname)
  ) {
    errors.push(
      `${name} debe contener únicamente el hostname de PUBLIC_SITE_URL.`,
    );
  }
}

if (wranglerConfiguration?.vars) {
  for (const name of [
    "PUBLIC_SITE_URL",
    "PUBLIC_GOOGLE_AUTH_ENABLED",
    "PUBLIC_FACEBOOK_AUTH_ENABLED",
    "PUBLIC_SUPABASE_URL",
    "PUBLIC_SUPABASE_ANON_KEY",
    "TURNSTILE_HOSTNAMES",
  ]) {
    if (value(name) !== wranglerConfiguration.vars[name]) {
      errors.push(
        `${name} del entorno de build debe coincidir exactamente con wrangler.jsonc para impedir que el bundle cliente y el Worker apunten a configuraciones distintas.`,
      );
    }
  }
}

const migrationDirectoryEntries = readdirSync(
  path.join(root, "supabase", "migrations"),
);
const migrationDraftEntries = readdirSync(
  path.join(root, "supabase", "migration-drafts"),
);
const migrations = migrationDirectoryEntries.filter((name) =>
  /^\d{4}_.+\.sql$/.test(name),
);
errors.push(...validateProductionMigrationFiles(migrationDirectoryEntries));
errors.push(...validateMigrationDraftFiles(migrationDraftEntries));

if (wranglerConfiguration) {
  errors.push(
    ...validateCloudflareWorkerArtifact(
      path.join(root, "dist"),
      wranglerConfiguration,
      { runtimeSecrets: productionBuildEnvironment },
    ),
  );
}

if (errors.length) {
  console.error("Preflight de producción: BLOQUEADO");
  for (const error of errors) console.error(`  ✗ ${error}`);
  for (const warning of warnings) console.error(`  ! ${warning}`);
  process.exit(1);
}

console.log(
  d72CandidateRequestPath
    ? `Preflight candidato D72: controles técnicos válidos (${migrations.length} migraciones); riesgos sólo solicitados, sin aceptación, PASS ni autorización de deploy.`
    : exceptionalRequestPath
      ? `Preflight excepcional: controles técnicos válidos (${migrations.length} migraciones); riesgos aceptados conservan FAIL/BLOCKED_EXTERNAL/NOT_VERIFIED. ESTO NO ES PASS.`
      : `Preflight de producción: configuración válida (${migrations.length} migraciones).`,
);
for (const warning of warnings) console.warn(`  ! ${warning}`);
