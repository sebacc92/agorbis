import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseJsonc,
  readWranglerConfiguration,
  validateClosedCutoverConfiguration,
  validateOpenRecoveryConfiguration,
  validateWranglerConfiguration,
} from "./cloudflare-worker-policy.mjs";
import { validateExceptionalCutoverConfigurations } from "./exceptional-cutover-config-policy.mjs";
import { findKnownSecrets } from "./secret-patterns.mjs";
import { AAIP_DATABASE_REGISTRATION_STATUS } from "./aaip-registration-policy.mjs";
import { GOOGLE_PROCESSING_DISCLOSURE } from "./google-processing-disclosure.mjs";

export const RECOVERY_CONFIGURATION_FORMAT =
  "agorbis-recovery-configuration/v1";
export const RECOVERY_CONFIGURATION_PATH =
  "recovery/configuration-inventory.v1.json";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const templateSpecifications = Object.freeze([
  {
    dashboardTemplate: "Confirm signup / Confirmación",
    file: "confirmation.html",
    section: "auth.email.template.confirmation",
    subject: "Agorbis · Confirmá tu correo / Confirm your email",
    variables: ["RedirectTo", "TokenHash"],
  },
  {
    dashboardTemplate: "Change Email Address / Cambio de correo",
    file: "email_change.html",
    section: "auth.email.template.email_change",
    subject: "Agorbis · Confirmá tu nuevo correo / Confirm your new email",
    variables: ["NewEmail", "SiteURL", "TokenHash"],
  },
  {
    dashboardTemplate: "Email changed / Correo actualizado",
    file: "email_changed.html",
    section: "auth.email.notification.email_changed",
    subject: "Agorbis · Correo actualizado / Email changed",
    variables: ["Email", "OldEmail", "SiteURL"],
  },
  {
    dashboardTemplate: "Identity linked / Método vinculado",
    file: "identity_linked.html",
    section: "auth.email.notification.identity_linked",
    subject: "Agorbis · Método de acceso vinculado / Sign-in method linked",
    variables: ["Provider", "SiteURL"],
  },
  {
    dashboardTemplate: "Identity unlinked / Método eliminado",
    file: "identity_unlinked.html",
    section: "auth.email.notification.identity_unlinked",
    subject: "Agorbis · Método de acceso eliminado / Sign-in method removed",
    variables: ["Provider", "SiteURL"],
  },
  {
    dashboardTemplate: "Magic Link",
    file: "magic_link.html",
    section: "auth.email.template.magic_link",
    subject: "Agorbis · Enlace de acceso / Sign-in link",
    variables: ["RedirectTo", "TokenHash"],
  },
  {
    dashboardTemplate: "MFA factor enrolled / Segundo factor agregado",
    file: "mfa_factor_enrolled.html",
    section: "auth.email.notification.mfa_factor_enrolled",
    subject: "Agorbis · Segundo factor agregado / Verification method added",
    variables: [],
  },
  {
    dashboardTemplate: "MFA factor unenrolled / Segundo factor eliminado",
    file: "mfa_factor_unenrolled.html",
    section: "auth.email.notification.mfa_factor_unenrolled",
    subject: "Agorbis · Segundo factor eliminado / Verification method removed",
    variables: [],
  },
  {
    dashboardTemplate: "Password changed / Contraseña actualizada",
    file: "password_changed.html",
    section: "auth.email.notification.password_changed",
    subject: "Agorbis · Contraseña actualizada / Password changed",
    variables: [],
  },
  {
    dashboardTemplate: "Reauthentication / Reautenticación",
    file: "reauthentication.html",
    section: "auth.email.template.reauthentication",
    subject: "Agorbis · Código de seguridad / Security code",
    variables: ["Token"],
  },
  {
    dashboardTemplate: "Reset password / Recuperación",
    file: "recovery.html",
    section: "auth.email.template.recovery",
    subject: "Agorbis · Recuperá tu acceso / Recover your account",
    variables: ["RedirectTo", "TokenHash"],
  },
]);

const environmentVariableCategories = Object.freeze({
  authAttestations: Object.freeze([
    "SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED",
    "SUPABASE_AUTH_CAPTCHA_ENABLED",
    "SUPABASE_AUTH_CAPTCHA_PROVIDER",
    "SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED",
    "SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED",
    "SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR",
    "SUPABASE_AUTH_IP_FORWARDING_ENABLED",
    "SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED",
    "SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS",
    "SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED",
    "SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED",
    "SUPABASE_AUTH_MIN_PASSWORD_LENGTH",
    "SUPABASE_AUTH_PASSWORD_REQUIREMENTS",
    "SUPABASE_AUTH_PHONE_AUTH_ENABLED",
    "SUPABASE_AUTH_REDIRECT_URLS",
    "SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED",
    "SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED",
    "SUPABASE_AUTH_SIGNUPS_ENABLED",
    "SUPABASE_AUTH_SITE_URL",
    "SUPABASE_LEGACY_SERVICE_ROLE_DISABLED",
  ]),
  core: Object.freeze([
    "CLOUDFLARE_WORKERS_PLAN",
    "CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED",
    "CRON_SECRET",
    "PUBLIC_FACEBOOK_AUTH_ENABLED",
    "PUBLIC_GOOGLE_AUTH_ENABLED",
    "PUBLIC_SITE_URL",
    "PUBLIC_SUPABASE_ANON_KEY",
    "PUBLIC_SUPABASE_URL",
    "SUPABASE_PLAN",
    "SUPABASE_SECRET_KEY",
  ]),
  identityAndTransfers: Object.freeze([
    "AAIP_DATABASE_REGISTRATION_STATUS",
    "PUBLIC_AAIP_CONTROLLER_ID",
    "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
    "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
    "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
    "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
    "PUBLIC_GOOGLE_PROCESSING_LOCATION",
    "PUBLIC_GOOGLE_PROCESSING_LOCATION_EN",
    "PUBLIC_LEGAL_CONTACT_EMAIL",
    "PUBLIC_LEGAL_CONTROLLER_NAME",
    "PUBLIC_PROVIDER_RETENTION_SUMMARY",
    "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
    "PUBLIC_RESEND_PROCESSING_LOCATION",
    "PUBLIC_RESEND_PROCESSING_LOCATION_EN",
    "PUBLIC_SUPABASE_PROCESSING_LOCATION",
    "PUBLIC_SUPABASE_PROCESSING_LOCATION_EN",
    "PUBLIC_TRANSFER_SAFEGUARDS",
    "PUBLIC_TRANSFER_SAFEGUARDS_EN",
    "RETENTION_RECONCILIATION_STATUS",
    "PRODUCTION_BACKUP_STATUS",
    "GOOGLE_DRIVE_BACKUP_STATUS",
    "SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS",
  ]),
  turnstile: Object.freeze([
    "PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_HOSTNAMES",
    "TURNSTILE_SECRET",
    "TURNSTILE_SUPABASE_GUARD_HOSTNAMES",
  ]),
});

export const KNOWN_NON_SECRET_ENVIRONMENT_VALUES = Object.freeze({
  AAIP_DATABASE_REGISTRATION_STATUS,
  CLOUDFLARE_WORKERS_PLAN: "paid",
  CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED: "true",
  PUBLIC_AAIP_CONTROLLER_ID: "RL-2026-81658385-APN-DNPDP#AAIP",
  PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS: AAIP_DATABASE_REGISTRATION_STATUS,
  PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
  PUBLIC_GOOGLE_AUTH_ENABLED: "true",
  PUBLIC_GOOGLE_PROCESSING_LOCATION: GOOGLE_PROCESSING_DISCLOSURE.es,
  PUBLIC_GOOGLE_PROCESSING_LOCATION_EN: GOOGLE_PROCESSING_DISCLOSURE.en,
  PUBLIC_LEGAL_CONTACT_EMAIL: "sebastiancardoso92@gmail.com",
  PUBLIC_LEGAL_CONTROLLER_NAME: "Sebastian Cardoso Castillo",
  PUBLIC_SITE_URL: "https://agorbis.com",
  PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
  SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED: "false",
  SUPABASE_AUTH_CAPTCHA_ENABLED: "true",
  SUPABASE_AUTH_CAPTCHA_PROVIDER: "turnstile",
  SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED: "true",
  SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED: "true",
  SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR: "6",
  SUPABASE_AUTH_IP_FORWARDING_ENABLED: "true",
  SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED: "false",
  SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS: "2",
  SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED: "true",
  SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED: "true",
  SUPABASE_AUTH_MIN_PASSWORD_LENGTH: "12",
  SUPABASE_AUTH_PASSWORD_REQUIREMENTS: "letters_digits",
  SUPABASE_AUTH_PHONE_AUTH_ENABLED: "false",
  SUPABASE_AUTH_REDIRECT_URLS:
    "https://agorbis.com/auth/callback,https://agorbis.com/auth/confirm",
  SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED: "true",
  SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED:
    "password_changed,email_changed,identity_linked,identity_unlinked,mfa_factor_enrolled,mfa_factor_unenrolled",
  SUPABASE_AUTH_SIGNUPS_ENABLED: "true",
  SUPABASE_AUTH_SITE_URL: "https://agorbis.com",
  SUPABASE_LEGACY_SERVICE_ROLE_DISABLED: "true",
  SUPABASE_PLAN: "free",
  TURNSTILE_HOSTNAMES: "agorbis.com",
  TURNSTILE_SUPABASE_GUARD_HOSTNAMES: "agorbis.com",
  RETENTION_RECONCILIATION_STATUS: "unreconciled",
  PRODUCTION_BACKUP_STATUS: "not_verified",
  GOOGLE_DRIVE_BACKUP_STATUS: "inactive",
  SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS: "draft_not_applied",
});

// Compatibilidad interna: los inventarios históricos siguen usando el mismo
// objeto, mientras que el runner de release importa exclusivamente el export
// público anterior. Ninguno de los dos consulta el entorno del proceso.
const knownNonSecretEnvironmentValues = KNOWN_NON_SECRET_ENVIRONMENT_VALUES;

const environmentValueRecovery = Object.freeze({
  externalSecretRegister: Object.freeze([
    "CRON_SECRET",
    "SUPABASE_SECRET_KEY",
    "TURNSTILE_SECRET",
  ]),
  humanCaptureRequired: Object.freeze([
    "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
    "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
    "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
    "PUBLIC_PROVIDER_RETENTION_SUMMARY",
    "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
    "PUBLIC_RESEND_PROCESSING_LOCATION",
    "PUBLIC_RESEND_PROCESSING_LOCATION_EN",
    "PUBLIC_SUPABASE_PROCESSING_LOCATION",
    "PUBLIC_SUPABASE_PROCESSING_LOCATION_EN",
    "PUBLIC_TRANSFER_SAFEGUARDS",
    "PUBLIC_TRANSFER_SAFEGUARDS_EN",
    "PUBLIC_TURNSTILE_SITE_KEY",
  ]),
  reissueFromProvider: Object.freeze(["PUBLIC_SUPABASE_ANON_KEY"]),
});

const legacyPendingAaipRegistrationInput = Object.freeze({
  id: "aaip_registration_rl",
  reason:
    "El registro público no puede reconstruirse ni inventarse antes de que AAIP emita el RL válido.",
  requiredEvidence: [
    "Código RL-...-APN-DNPDP#AAIP emitido por AAIP y constancia del trámite",
  ],
  sensitivity: "public-after-issuance",
});

const legacyControllerAaipRegistrationInput = Object.freeze({
  id: "aaip_registration_rl",
  reason:
    "El código público ya fue emitido; la constancia descargable todavía debe preservarse fuera del repositorio.",
  requiredEvidence: [
    "Constancia del registro del responsable RL-2026-81658385-APN-DNPDP#AAIP",
  ],
  sensitivity: "public-after-issuance",
});

const currentAaipRegistrationInput = Object.freeze({
  id: "aaip_database_registration",
  reason:
    "El Paso 2 fue presentado, pero el expediente EX no es aprobación ni número de registro de la base.",
  requiredEvidence: [
    "Constancia aprobada del Paso 2 y número de registro asignado a la base por AAIP",
  ],
  sensitivity: "public-after-issuance",
});

// Exact historical snapshots remain accepted only to verify already-created
// backup artifacts. They are not current launch requirements.
const legacyBackupKeyAndMediaInput = Object.freeze({
  id: "backup_key_and_media_custody",
  reason:
    "La clave privada, el vault y las dos copias físicas todavía requieren preparación y prueba humana.",
  requiredEvidence: [
    "Fingerprint de la clave OpenPGP, ubicación de escrow y prueba de descifrado desde la segunda copia",
  ],
  sensitivity: "secret-external-only",
});

const preGoogleDriveBackupKeyAndMediaInput = Object.freeze({
  id: "backup_key_and_media_custody",
  reason:
    "El primer paquete productivo debe descifrarse y verificarse; su credencial debe custodiarse separada y debe existir una copia cifrada fuera de la máquina que genera el backup.",
  requiredEvidence: [
    "Método de cifrado, ubicación de custodia independiente, destino off-host y prueba de descifrado con manifiesto y checksums válidos",
  ],
  sensitivity: "secret-external-only",
});

const currentBackupKeyAndMediaInput = Object.freeze({
  id: "backup_key_and_media_custody",
  reason:
    "Google Drive fue elegido como destino manual del primer paquete productivo cifrado, pero todavía no fue configurado, subido, descargado ni verificado; la credencial de descifrado debe permanecer en custodia independiente.",
  requiredEvidence: [
    "Paquete cifrado y checksum SHA-256 subidos manualmente a Google Drive, sin manifiesto detallado ni credencial de descifrado fuera del ciphertext",
    "Descarga posterior a un directorio local distinto, checksum coincidente, descifrado válido y restore completo acreditado",
  ],
  sensitivity: "secret-external-only",
});

const preGoogleDriveProviderContractualTransferInput = Object.freeze({
  id: "provider_contractual_transfer_evidence",
  reason:
    "Destinos, retenciones y salvaguardas no pueden recuperarse de textos provisionales ni inferirse de un DPA genérico.",
  requiredEvidence: [
    "Instrumentos y respuestas finales de Supabase, Resend y Cloudflare",
    "Textos ES/EN aprobados para destinos, retención y salvaguardas",
  ],
  sensitivity: "legal-restricted",
});

const currentProviderContractualTransferInput = Object.freeze({
  id: "provider_contractual_transfer_evidence",
  reason:
    "Destinos, retenciones y salvaguardas no pueden recuperarse de textos provisionales ni inferirse de un DPA genérico; Google Drive fue seleccionado para backups cifrados pero todavía no está aprobado ni operativo.",
  requiredEvidence: [
    "Instrumentos y respuestas finales de Supabase, Resend y Cloudflare",
    "Producto, entidad, rol, contrato o DPA, países, subencargados, retención, borrado, versionado, papelera y logs aplicables a Google Drive",
    "Textos ES/EN y tratamiento AAIP aprobados para destinos, retención y salvaguardas",
  ],
  sensitivity: "legal-restricted",
});

const humanInputsRequired = Object.freeze([
  currentAaipRegistrationInput,
  {
    id: "account_mfa_recovery_custody",
    reason:
      "Los códigos de recuperación de las cuentas proveedoras deben existir fuera del repositorio y comprobarse manualmente.",
    requiredEvidence: [
      "Custodia cifrada y fecha de prueba para Supabase, Cloudflare, Resend, GitHub y Google",
    ],
    sensitivity: "secret-external-only",
  },
  currentBackupKeyAndMediaInput,
  {
    id: "cloudflare_dns_exports",
    reason:
      "El repositorio conoce la arquitectura DNS + Workers proyectada, pero no los contenidos, TTL y metadatos actuales de todos los registros.",
    requiredEvidence: [
      "Export BIND de la zona",
      "JSON redacted con type, name, content, TTL y proxied",
    ],
    sensitivity: "operational-redacted",
  },
  currentProviderContractualTransferInput,
  {
    id: "release_commit_and_artifact",
    reason:
      "El commit y el artefacto exactos sólo existen cuando se cierre el release candidate.",
    requiredEvidence: [
      "Commit de release, hash del artefacto Edge y resultado del preflight",
    ],
    sensitivity: "operational-redacted",
  },
  {
    id: "resend_domain_and_smtp_export",
    reason:
      "Los valores conocidos fueron atestados por el operador, pero falta una transcripción/export revisada del estado recuperable.",
    requiredEvidence: [
      "Estado del dominio, SMTP, sender y tracking sin API key",
      "Registros SPF, DKIM, MX y DMARC incluidos en el export DNS",
    ],
    sensitivity: "operational-redacted",
  },
  {
    id: "secret_custody_metadata",
    reason:
      "El repositorio sólo puede conservar nombres, consumidores y acciones; faltan fingerprints, fechas y ubicaciones de escrow.",
    requiredEvidence: [
      "Registro redacted con fingerprint, última rotación/verificación y ubicación cifrada de cada secreto activo",
    ],
    sensitivity: "secret-metadata-restricted",
  },
  {
    id: "supabase_auth_dashboard_export",
    reason:
      "La configuración fue atestada, pero Supabase Dashboard sigue siendo la fuente operativa de Producción.",
    requiredEvidence: [
      "Export o transcripción redacted campo por campo de Auth, CAPTCHA, MFA y límites",
    ],
    sensitivity: "operational-redacted",
  },
  {
    id: "turnstile_widget_a_metadata",
    reason:
      "Faltan el nombre cloud, modo, identificador público/fingerprint y metadatos de rotación del widget visible.",
    requiredEvidence: [
      "Export redacted del widget A y referencia al secret custodiado fuera del repositorio",
    ],
    sensitivity: "secret-metadata-restricted",
  },
  {
    id: "turnstile_widget_b_metadata",
    reason:
      "Faltan el nombre cloud, modo, identificador público/fingerprint y metadatos de rotación del guard de Supabase.",
    requiredEvidence: [
      "Export redacted del widget B y referencia al secret custodiado sólo para Supabase Auth",
    ],
    sensitivity: "secret-metadata-restricted",
  },
  {
    id: "cloudflare_worker_redacted_export",
    reason:
      "La configuración versionada define bindings, routes y triggers, pero falta la captura redacted del estado efectivo del Worker.",
    requiredEvidence: [
      "Export de bindings, custom domains, triggers y nombres de secretos; sólo fingerprints para secretos",
    ],
    sensitivity: "secret-metadata-restricted",
  },
]);

const preGoogleDriveHumanInputsRequired = Object.freeze(
  humanInputsRequired.map((input) => {
    if (input.id === "backup_key_and_media_custody") {
      return preGoogleDriveBackupKeyAndMediaInput;
    }
    if (input.id === "provider_contractual_transfer_evidence") {
      return preGoogleDriveProviderContractualTransferInput;
    }
    return input;
  }),
);

const withHistoricalAaipAndBackup = (aaip, backup) =>
  Object.freeze(
    preGoogleDriveHumanInputsRequired.map((input) => {
      if (input.id === "aaip_database_registration") return aaip;
      if (input.id === "backup_key_and_media_custody") return backup;
      return input;
    }),
  );

const knownHistoricalHumanInputSets = Object.freeze([
  preGoogleDriveHumanInputsRequired,
  withHistoricalAaipAndBackup(
    legacyPendingAaipRegistrationInput,
    preGoogleDriveBackupKeyAndMediaInput,
  ),
  withHistoricalAaipAndBackup(
    legacyControllerAaipRegistrationInput,
    preGoogleDriveBackupKeyAndMediaInput,
  ),
  withHistoricalAaipAndBackup(
    currentAaipRegistrationInput,
    legacyBackupKeyAndMediaInput,
  ),
  withHistoricalAaipAndBackup(
    legacyControllerAaipRegistrationInput,
    legacyBackupKeyAndMediaInput,
  ),
  withHistoricalAaipAndBackup(
    legacyPendingAaipRegistrationInput,
    legacyBackupKeyAndMediaInput,
  ),
]);

const legacyBackupOpenPgpSecretEntry = Object.freeze({
  consumer: "runner offline de cifrado y restore",
  environment: "operator",
  id: "backup_openpgp_private_key",
  issuer: "OpenPGP local",
  metadataCaptureStatus: "human-input-required",
  owner: "Sebastian Cardoso Castillo",
  recoveryAction:
    "recuperar desde el vault cifrado; si se pierde, las copias cifradas no son recuperables",
  requiredMetadata: ["escrowLocation", "fingerprint", "lastVerifiedAt"],
  valuePolicy: "external-encrypted-vault-only",
});

const legacyKeepassSecretEntry = Object.freeze({
  consumer: "apertura del vault KeePassXC",
  environment: "operator",
  id: "keepassxc_master_password",
  issuer: "Sebastian Cardoso Castillo",
  metadataCaptureStatus: "human-input-required",
  owner: "Sebastian Cardoso Castillo",
  recoveryAction:
    "usar el procedimiento de custodia separado; nunca conservarla junto al vault ni calcular un fingerprint versionable",
  requiredMetadata: ["lastVerifiedAt", "separateCustodyProcedure"],
  valuePolicy: "separate-offline-custody-only",
});

const legacyProviderAccountMfaSecretEntry = Object.freeze({
  consumer:
    "acceso de emergencia a Supabase, Vercel, Cloudflare, Resend, GitHub y Google",
  environment: "operator",
  id: "provider_account_mfa_recovery",
  issuer: "proveedores de cuenta",
  metadataCaptureStatus: "human-input-required",
  owner: "Sebastian Cardoso Castillo",
  recoveryAction:
    "recuperar desde el vault, regenerar después de cada uso y reemplazar ambas copias cifradas",
  requiredMetadata: ["escrowLocation", "lastVerifiedAt"],
  valuePolicy: "external-encrypted-vault-only-no-versioned-fingerprint",
});

const secretEntries = Object.freeze([
  {
    consumer: "runner offline de cifrado y restore",
    environment: "operator",
    id: "backup_decryption_credential",
    issuer: "mecanismo de cifrado elegido por el operador",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "recuperar desde custodia independiente y probar descifrado; si se pierde, el paquete cifrado no es recuperable",
    requiredMetadata: ["custodyLocation", "encryptionMethod", "lastVerifiedAt"],
    valuePolicy: "independent-secret-custody-only",
  },
  {
    consumer: "Cloudflare Worker fetch/scheduled",
    environment: "production",
    id: "cron_secret",
    issuer: "Agorbis",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "generar 32 o más bytes, cargar como Worker Secret y probar rechazo 401 y dispatch scheduled interno autorizado",
    requiredMetadata: ["escrowLocation", "fingerprint", "lastRotatedAt"],
    valuePolicy: "external-encrypted-vault-only",
  },
  {
    consumer: "apertura del gestor cifrado elegido",
    environment: "operator",
    id: "secret_store_unlock_credential",
    issuer: "Sebastian Cardoso Castillo",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "usar el procedimiento de custodia independiente; nunca conservarla junto al almacén cifrado ni versionar su valor",
    requiredMetadata: ["lastVerifiedAt", "separateCustodyProcedure"],
    valuePolicy: "separate-custody-only",
  },
  {
    consumer:
      "acceso de emergencia a Supabase, Cloudflare, Resend, GitHub y Google",
    environment: "operator",
    id: "provider_account_mfa_recovery",
    issuer: "proveedores de cuenta",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "recuperar desde el gestor cifrado, regenerar después de cada uso y reemplazar la custodia vigente",
    requiredMetadata: ["escrowLocation", "lastVerifiedAt"],
    valuePolicy: "external-encrypted-vault-only-no-versioned-fingerprint",
  },
  {
    consumer: "Supabase Auth SMTP",
    environment: "production",
    id: "resend_api_key_smtp",
    issuer: "Resend",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "emitir una key nueva, actualizar SMTP, probar entrega y revocar la anterior",
    requiredMetadata: ["escrowLocation", "fingerprint", "lastRotatedAt"],
    valuePolicy: "external-encrypted-vault-only",
  },
  {
    consumer: "conexión administrativa de backup y recuperación",
    environment: "production",
    id: "supabase_db_password",
    issuer: "Supabase",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "resetear en Dashboard y actualizar únicamente el almacén cifrado",
    requiredMetadata: ["escrowLocation", "fingerprint", "lastRotatedAt"],
    valuePolicy: "external-encrypted-vault-only",
  },
  {
    consumer: "Cloudflare Worker server-only",
    environment: "production",
    id: "supabase_secret_key",
    issuer: "Supabase",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "emitir una nueva sb_secret dedicada, cargarla y revocar la anterior después del smoke test",
    requiredMetadata: ["escrowLocation", "fingerprint", "lastRotatedAt"],
    valuePolicy: "external-encrypted-vault-only",
  },
  {
    consumer: "Cloudflare Worker Siteverify",
    environment: "production",
    id: "turnstile_secret_a",
    issuer: "Cloudflare",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction:
      "rotar en Cloudflare y actualizar únicamente TURNSTILE_SECRET",
    requiredMetadata: ["escrowLocation", "fingerprint", "lastRotatedAt"],
    valuePolicy: "external-encrypted-vault-only",
  },
  {
    consumer: "Supabase Auth Bot and Abuse Protection",
    environment: "production",
    id: "turnstile_secret_b",
    issuer: "Cloudflare",
    metadataCaptureStatus: "human-input-required",
    owner: "Sebastian Cardoso Castillo",
    recoveryAction: "rotar en Cloudflare y actualizar únicamente Supabase Auth",
    requiredMetadata: ["escrowLocation", "fingerprint", "lastRotatedAt"],
    valuePolicy: "external-encrypted-vault-only",
  },
]);

const knownHistoricalSecretEntrySets = Object.freeze([
  Object.freeze([
    legacyBackupOpenPgpSecretEntry,
    secretEntries[1],
    legacyKeepassSecretEntry,
    legacyProviderAccountMfaSecretEntry,
    ...secretEntries.slice(4),
  ]),
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function serializeRecoveryInventory(inventory) {
  return `${JSON.stringify(canonicalize(inventory), null, 2)}\n`;
}

function extractTemplateVariables(content) {
  return [
    ...new Set(
      [...content.matchAll(/\{\{\s*\.([A-Za-z][A-Za-z0-9]*)\s*\}\}/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
}

function assertTemplateConfig(config, specification) {
  const escaped = specification.section.replaceAll(".", "\\.");
  const block = config.match(
    new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
  )?.[1];
  if (!block) {
    throw new Error(
      `Falta la sección ${specification.section} en config.toml.`,
    );
  }
  if (!block.includes(`subject = "${specification.subject}"`)) {
    throw new Error(`Subject inesperado para ${specification.file}.`);
  }
  if (
    !block.includes(
      `content_path = "./supabase/templates/${specification.file}"`,
    )
  ) {
    throw new Error(`content_path inesperado para ${specification.file}.`);
  }
}

function expectedEnvironmentNames() {
  return Object.values(environmentVariableCategories).flat().sort();
}

function assertEnvironmentExample(envExamplePath) {
  if (!envExamplePath) return;
  const names = new Set(
    readFileSync(envExamplePath, "utf8")
      .split("\n")
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean),
  );
  for (const name of expectedEnvironmentNames()) {
    if (!names.has(name)) {
      throw new Error(`.env.example no declara ${name}.`);
    }
  }
}

function normalizePaths(input = {}) {
  const root = path.resolve(input.root ?? repositoryRoot);
  return {
    envExamplePath:
      input.envExamplePath === false
        ? null
        : path.resolve(input.envExamplePath ?? path.join(root, ".env.example")),
    supabaseConfigPath: path.resolve(
      input.supabaseConfigPath ?? path.join(root, "supabase", "config.toml"),
    ),
    templateRoot: path.resolve(
      input.templateRoot ?? path.join(root, "supabase", "templates"),
    ),
    wranglerPath: path.resolve(
      input.wranglerPath ?? path.join(root, "wrangler.jsonc"),
    ),
    wranglerClosedPath: path.resolve(
      input.wranglerClosedPath ?? path.join(root, "wrangler.closed.jsonc"),
    ),
    wranglerOpenRecoveryPath: path.resolve(
      input.wranglerOpenRecoveryPath ??
        path.join(root, "wrangler.open-recovery.jsonc"),
    ),
    wranglerCronsClosedPath: path.resolve(
      input.wranglerCronsClosedPath ??
        path.join(root, "wrangler.crons-closed.jsonc"),
    ),
    wranglerCronsOpenPath: path.resolve(
      input.wranglerCronsOpenPath ??
        path.join(root, "wrangler.crons-open.jsonc"),
    ),
    wranglerTrafficPath: path.resolve(
      input.wranglerTrafficPath ?? path.join(root, "wrangler.traffic.jsonc"),
    ),
  };
}

export function buildRecoveryInventory(input = {}) {
  const paths = normalizePaths(input);
  const supabaseConfig = readFileSync(paths.supabaseConfigPath, "utf8");
  assertEnvironmentExample(paths.envExamplePath);
  const templates = templateSpecifications.map((specification) => {
    assertTemplateConfig(supabaseConfig, specification);
    const templatePath = path.join(paths.templateRoot, specification.file);
    const content = readFileSync(templatePath, "utf8");
    const variables = extractTemplateVariables(content);
    if (!isDeepStrictEqual(variables, [...specification.variables].sort())) {
      throw new Error(
        `Variables inesperadas en ${specification.file}: ${variables.join(", ")}.`,
      );
    }
    return {
      bytes: statSync(templatePath).size,
      dashboardTemplate: specification.dashboardTemplate,
      file: specification.file,
      sha256: sha256(content),
      subject: specification.subject,
      variables,
    };
  });
  const wrangler = readWranglerConfiguration(paths.wranglerPath);
  const wranglerErrors = validateWranglerConfiguration(wrangler);
  if (wranglerErrors.length > 0) {
    throw new Error(wranglerErrors.join(" "));
  }
  const wranglerClosed = readWranglerConfiguration(paths.wranglerClosedPath);
  const wranglerClosedErrors = validateClosedCutoverConfiguration(
    wranglerClosed,
    wrangler,
  );
  if (wranglerClosedErrors.length > 0) {
    throw new Error(wranglerClosedErrors.join(" "));
  }
  const openRecoveryErrors = validateOpenRecoveryConfiguration(
    readWranglerConfiguration(paths.wranglerOpenRecoveryPath),
    wrangler,
  );
  if (openRecoveryErrors.length) throw new Error(openRecoveryErrors.join(" "));
  const exceptionalConfigurationErrors =
    validateExceptionalCutoverConfigurations({
      closed: parseJsonc(
        readFileSync(paths.wranglerCronsClosedPath, "utf8"),
        "wrangler.crons-closed.jsonc",
      ),
      open: parseJsonc(
        readFileSync(paths.wranglerCronsOpenPath, "utf8"),
        "wrangler.crons-open.jsonc",
      ),
      traffic: parseJsonc(
        readFileSync(paths.wranglerTrafficPath, "utf8"),
        "wrangler.traffic.jsonc",
      ),
    });
  if (exceptionalConfigurationErrors.length > 0) {
    throw new Error(exceptionalConfigurationErrors.join(" "));
  }
  const allEnvironmentNames = expectedEnvironmentNames();
  if (new Set(allEnvironmentNames).size !== 56) {
    throw new Error(
      "El inventario Cloudflare debe contener exactamente 56 nombres únicos.",
    );
  }
  const classifiedNames = [
    ...Object.keys(knownNonSecretEnvironmentValues),
    ...Object.values(environmentValueRecovery).flat(),
  ].sort();
  if (!isDeepStrictEqual(classifiedNames, allEnvironmentNames)) {
    throw new Error(
      "Cada variable de Agorbis/Cloudflare debe tener exactamente una estrategia de recuperación.",
    );
  }
  return {
    authEmailTemplates: {
      captureStatus: "repository-source-and-operator-reported-dashboard-copy",
      dashboardRestoreMethod: "manual-exact-copy-and-reopen-compare",
      format: "agorbis-auth-email-template-inventory/v1",
      templates,
    },
    cloudflareDns: {
      captureStatus: "human-export-required",
      knownArchitecture: {
        applicationHttpProxyEnabled: true,
        mode: "authoritative-dns-and-workers-custom-domains",
        webRecordsProxied: true,
        zone: "agorbis.com",
      },
      requiredExports: [
        {
          fields: ["zone-file"],
          format: "bind",
          path: "cloudflare-dns-zone.txt",
        },
        {
          fields: ["content", "name", "proxied", "ttl", "type"],
          format: "redacted-json",
          path: "cloudflare-dns-records.redacted.json",
        },
      ],
      requiredRecordPurposes: [
        "resend-dkim",
        "resend-dmarc",
        "resend-mx",
        "resend-spf",
        "cloudflare-worker-apex",
        "cloudflare-worker-www",
      ],
    },
    format: RECOVERY_CONFIGURATION_FORMAT,
    humanInputsRequired,
    policy: {
      cloudStateQueried: false,
      containsCredentialFingerprints: false,
      containsSecretValues: false,
      readiness: "incomplete-human-capture-required",
      scope: "production-configuration-redacted",
    },
    secretRegister: {
      entries: secretEntries,
      format: "agorbis-secret-register-redacted/v1",
      externalProviderCredentials: [
        {
          id: "google_oauth_client_secret",
          metadataCaptureStatus: "human-input-required",
          recoveryAction:
            "recuperar credenciales sólo en Supabase tras verificar custodia y callbacks; reconciliar el proveedor observado activo con el bloqueo de apertura de la aplicación por destinos, consentimiento y pruebas",
          status: "provider-observed-enabled-credential-custody-unverified",
          valuePolicy:
            "supabase-only-external-encrypted-vault-no-worker-secret",
        },
      ],
      inactiveOrRevoked: [
        {
          id: "legacy_anon_key",
          recoveryAction:
            "no restaurar; emitir o recuperar únicamente una publishable key moderna",
          status: "disabled",
        },
        {
          id: "legacy_jwt_secret",
          recoveryAction: "no restaurar ni reutilizar",
          status: "revoked",
        },
        {
          id: "legacy_service_role_key",
          recoveryAction:
            "no restaurar; emitir una secret key moderna dedicada server-only",
          status: "disabled",
        },
        {
          id: "openai_api_key",
          recoveryAction:
            "no restaurar; crear sólo si el proveedor y la función se aprueban y documentan",
          status: "not-configured-feature-disabled",
        },
      ],
      valuePolicy:
        "values-and-recovery-codes-excluded-use-independent-encrypted-secret-store",
    },
    sourceArtifacts: {
      supabaseConfig: {
        path: "supabase/config.toml",
        sha256: sha256File(paths.supabaseConfigPath),
      },
      wranglerConfiguration: {
        path: "wrangler.jsonc",
        sha256: sha256File(paths.wranglerPath),
      },
      wranglerClosedConfiguration: {
        path: "wrangler.closed.jsonc",
        sha256: sha256File(paths.wranglerClosedPath),
      },
      wranglerOpenRecoveryConfiguration: {
        path: "wrangler.open-recovery.jsonc",
        sha256: sha256File(paths.wranglerOpenRecoveryPath),
      },
      wranglerCronsClosedConfiguration: {
        path: "wrangler.crons-closed.jsonc",
        sha256: sha256File(paths.wranglerCronsClosedPath),
      },
      wranglerCronsOpenConfiguration: {
        path: "wrangler.crons-open.jsonc",
        sha256: sha256File(paths.wranglerCronsOpenPath),
      },
      wranglerTrafficConfiguration: {
        path: "wrangler.traffic.jsonc",
        sha256: sha256File(paths.wranglerTrafficPath),
      },
    },
    supabaseAuth: {
      // D92: observación de sólo lectura del proyecto nuevo el 25-10-2026. Google
      // todavía no está configurado; la decisión de abrir con Google o sólo con
      // email sigue pendiente del responsable.
      oauthObservation: {
        agentActivatedProviders: false,
        date: "2026-10-25",
        initialReportedState: { google: false, facebook: false },
        observedPublicSettings: {
          google: false,
          facebook: false,
          email: true,
          disableSignup: false,
        },
        scope: "provider-switches-only-not-credential-or-consent-validation",
        source: "read-only-get-supabase-auth-v1-settings",
        reconciliationStatus: "email-only-launch-google-deferred-d97",
        operatorConfirmedState: { google: false, facebook: false },
      },
      captureStatus: "operator-reported-not-dashboard-exported",
      project: {
        environment: "production",
        projectRef: "ibtvlvpxwourrxwcrfkf",
        region: "us-east-2",
      },
      settings: {
        anonymousSignInsEnabled: false,
        captcha: {
          credentialReference: "turnstile_secret_b",
          enabled: true,
          provider: "turnstile",
        },
        emailConfirmationsEnabled: true,
        emailRateLimitPerHour: 6,
        emailSignupsEnabled: true,
        ipAddressForwardingEnabled: true,
        // D91: en Supabase Free la protección no existe; el inventario registra
        // el estado real del Dashboard, no el deseado.
        leakedPasswordProtectionEnabled: false,
        legacyApiKeysEnabled: false,
        legacyJwtSecretRevoked: true,
        mfa: {
          maxEnrolledFactors: 2,
          totpEnrollmentEnabled: true,
          totpVerificationEnabled: true,
        },
        password: {
          minimumLength: 12,
          requirements: ["digits", "lowercase", "symbols", "uppercase"],
        },
        phoneAuthEnabled: false,
        redirectUrls: [
          "https://agorbis.com/auth/callback",
          "https://agorbis.com/auth/confirm",
        ],
        requireCurrentPasswordWhenUpdating: true,
        secureEmailChangeDoubleConfirmationEnabled: true,
        securityNotifications: [
          "email_changed",
          "identity_linked",
          "identity_unlinked",
          "mfa_factor_enrolled",
          "mfa_factor_unenrolled",
          "password_changed",
        ],
        signupsEnabled: true,
        siteUrl: "https://agorbis.com",
      },
    },
    supabaseSmtp: {
      captureStatus: "operator-reported-not-dashboard-exported",
      credentialReference: "resend_api_key_smtp",
      domain: {
        name: "agorbis.com",
        verificationStatus: "operator-reported-verified",
      },
      host: "smtp.resend.com",
      port: 465,
      provider: "Resend",
      senderEmail: "no-reply@agorbis.com",
      senderName: "Agorbis",
      tracking: {
        clickEnabled: false,
        openEnabled: false,
      },
      username: "resend",
    },
    turnstile: {
      architecture: {
        legitimateFlow:
          "Agorbis validates A through Siteverify then calls Auth with SUPABASE_SECRET_KEY; it never generates or forwards a B token",
        widgetBPurpose:
          "reject direct public Supabase Auth calls that omit captchaToken",
      },
      captureStatus: "partial-human-export-required",
      widgets: [
        {
          cloudMetadataStatus: "human-input-required",
          credentialReference: "turnstile_secret_a",
          hostnames: ["agorbis.com"],
          id: "A",
          publicSiteKeyEnvironmentName: "PUBLIC_TURNSTILE_SITE_KEY",
          secretConsumer: "Cloudflare Worker Siteverify",
          visibleToUser: true,
        },
        {
          cloudMetadataStatus: "human-input-required",
          credentialReference: "turnstile_secret_b",
          hostnames: ["agorbis.com"],
          id: "B",
          publicSiteKeyDistribution:
            "excluded-from-repository-app-and-cloudflare-worker",
          secretConsumer: "Supabase Auth Bot and Abuse Protection",
          visibleToUser: false,
        },
      ],
    },
    cloudflareWorker: {
      accountId: wrangler.account_id,
      assets: wrangler.assets,
      captureStatus: "repository-source-and-human-cloud-export-required",
      closedRecoveryVars: wranglerClosed.vars,
      compatibilityDate: wrangler.compatibility_date,
      compatibilityFlags: wrangler.compatibility_flags,
      crons: wrangler.triggers.crons,
      domains: wrangler.routes.map(({ pattern }) => pattern),
      environment: {
        categories: environmentVariableCategories,
        expectedNameCount: 56,
        forbiddenNamesWhileFeaturesDisabledOrOutOfScope: [
          "OPENAI_API_KEY",
          "OPENAI_SUMMARY_MODEL",
          "PUBLIC_FACEBOOK_PROCESSING_LOCATION",
          "PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN",
          "RESEND_API_KEY",
          "SUPABASE_DB_PASSWORD",
          "SUPABASE_SERVICE_ROLE_KEY",
          "TURNSTILE_TESTING",
        ],
        knownNonSecretValues: knownNonSecretEnvironmentValues,
        scope: "production-open-target-not-cloud-attestation",
        valueRecovery: environmentValueRecovery,
      },
      logs: wrangler.observability.logs,
      main: wrangler.main,
      name: wrangler.name,
      nodeVersion: "22.x",
      previewUrls: wrangler.preview_urls,
      routes: wrangler.routes,
      secretsRequired: wrangler.secrets.required,
      traces: wrangler.observability.traces,
      vars: wrangler.vars,
      workersDev: wrangler.workers_dev,
    },
  };
}

function walk(value, visitor, pathParts = []) {
  visitor(value, pathParts);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walk(entry, visitor, [...pathParts, index]),
    );
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, visitor, [...pathParts, key]);
    }
  }
}

function assertRedacted(inventory) {
  const forbiddenKeys = new Set([
    "actualValue",
    "apiKey",
    "passwordValue",
    "privateKey",
    "recoveryCode",
    "secretValue",
    "tokenValue",
  ]);
  const turnstileCredential = /\b0x[A-Za-z0-9_-]{20,}\b/;
  const misleadingPlaceholder =
    /<[^>\n]+>|(?:^|[\s=:])(?:changeme|placeholder|tbd|todo)(?:$|[\s,;])/i;
  walk(inventory, (value, pathParts) => {
    const key = pathParts.at(-1);
    if (typeof key === "string" && forbiddenKeys.has(key)) {
      throw new Error(`Campo de credencial prohibido: ${pathParts.join(".")}.`);
    }
    if (value === null || value === undefined) {
      throw new Error(`Valor vacío prohibido: ${pathParts.join(".")}.`);
    }
    if (typeof value === "string") {
      if (!value || value !== value.trim()) {
        throw new Error(
          `String vacío o no normalizado: ${pathParts.join(".")}.`,
        );
      }
      if (
        findKnownSecrets(value).length > 0 ||
        turnstileCredential.test(value)
      ) {
        throw new Error(
          `Posible credencial incluida en ${pathParts.join(".")}.`,
        );
      }
      if (misleadingPlaceholder.test(value)) {
        throw new Error(
          `Placeholder engañoso incluido en ${pathParts.join(".")}.`,
        );
      }
    }
  });
}

function firstDifference(actual, expected, pathParts = []) {
  if (Object.is(actual, expected)) return null;
  if (
    !actual ||
    !expected ||
    typeof actual !== "object" ||
    typeof expected !== "object" ||
    Array.isArray(actual) !== Array.isArray(expected)
  ) {
    return pathParts.join(".") || "root";
  }
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  if (!isDeepStrictEqual(actualKeys.sort(), expectedKeys.sort())) {
    return `${pathParts.join(".") || "root"} keys`;
  }
  for (const key of expectedKeys) {
    const difference = firstDifference(actual[key], expected[key], [
      ...pathParts,
      key,
    ]);
    if (difference) return difference;
  }
  return pathParts.join(".") || "root";
}

function validateKnownHistoricalVercelInventory(inventory, input) {
  const vercelPath = path.resolve(input.vercelPath);
  const supabaseConfigPath = path.resolve(input.supabaseConfigPath);
  const templateRoot = path.resolve(input.templateRoot);
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
  const expectedCrons = [
    ["/internal/process-account-deletions", "10 * * * *"],
    ["/internal/sync-notifications", "5 0 * * *"],
    ["/internal/escalate-claims", "25 0 * * *"],
    ["/internal/cleanup-claim-uploads", "20 3 * * *"],
    ["/internal/purge-retained-data", "40 3 * * *"],
  ];
  const checks = [
    inventory.format === RECOVERY_CONFIGURATION_FORMAT,
    inventory.cloudflareWorker === undefined,
    inventory.sourceArtifacts?.vercelConfiguration?.path === "vercel.json",
    inventory.sourceArtifacts?.vercelConfiguration?.sha256 ===
      sha256File(vercelPath),
    inventory.sourceArtifacts?.supabaseConfig?.sha256 ===
      sha256File(supabaseConfigPath),
    inventory.vercel?.artifact?.runtime === "edge",
    inventory.vercel?.artifact?.regionsPinned === false,
    inventory.vercel?.buildCommand === "pnpm build.vercel",
    inventory.vercel?.environment?.expectedNameCount === 53,
    inventory.vercel?.nodeVersion === "22.x",
    inventory.vercel?.plan === "pro",
    inventory.vercel?.projectName === "agorbis",
    inventory.vercel?.teamSlug === "seba-ar",
    isDeepStrictEqual(inventory.vercel?.crons, vercel.crons),
    isDeepStrictEqual(inventory.vercel?.redirects, vercel.redirects),
    isDeepStrictEqual(
      inventory.vercel?.crons?.map(({ path, schedule }) => [path, schedule]),
      expectedCrons,
    ),
    isDeepStrictEqual(inventory.vercel?.domains, [
      "agorbis.com",
      "agorbis.vercel.app",
      "www.agorbis.com",
    ]),
    inventory.authEmailTemplates?.templates?.length === 11,
    inventory.humanInputsRequired?.length === 12,
    inventory.secretRegister?.entries?.length === 9,
  ];
  if (checks.includes(false)) {
    throw new Error(
      "El inventario histórico Vercel no coincide con la topología legacy exacta permitida.",
    );
  }
  for (const template of inventory.authEmailTemplates.templates) {
    const templatePath = path.join(templateRoot, template.file);
    if (
      template.sha256 !== sha256File(templatePath) ||
      template.bytes !== statSync(templatePath).size
    ) {
      throw new Error(
        `El inventario histórico no coincide con ${template.file}.`,
      );
    }
  }
  return {
    environmentVariableCount: 53,
    format: inventory.format,
    humanInputCount: 12,
    readiness: inventory.policy?.readiness,
    secretEntryCount: 9,
    templateCount: 11,
  };
}

export function validateRecoveryInventory(
  inventory,
  {
    allowKnownHistoricalHumanInputs = false,
    allowKnownHistoricalTopology = false,
    requireReady = false,
    ...input
  } = {},
) {
  assertRedacted(inventory);
  if (
    allowKnownHistoricalTopology &&
    inventory.vercel &&
    !inventory.cloudflareWorker
  ) {
    const summary = validateKnownHistoricalVercelInventory(inventory, input);
    if (requireReady && summary.readiness !== "ready") {
      throw new Error(
        `Inventario incompleto: faltan ${summary.humanInputCount} capturas humanas.`,
      );
    }
    return summary;
  }
  const expected = buildRecoveryInventory(input);
  let expectedSnapshot = expected;
  if (
    allowKnownHistoricalHumanInputs &&
    knownHistoricalHumanInputSets.some((historical) =>
      isDeepStrictEqual(inventory.humanInputsRequired, historical),
    )
  ) {
    expectedSnapshot = structuredClone(expected);
    expectedSnapshot.humanInputsRequired = inventory.humanInputsRequired;
  }
  if (
    allowKnownHistoricalHumanInputs &&
    knownHistoricalSecretEntrySets.some((historical) =>
      isDeepStrictEqual(inventory.secretRegister?.entries, historical),
    ) &&
    inventory.secretRegister?.valuePolicy ===
      "values-and-recovery-codes-excluded-use-separate-encrypted-vault"
  ) {
    if (expectedSnapshot === expected)
      expectedSnapshot = structuredClone(expected);
    expectedSnapshot.secretRegister.entries = inventory.secretRegister.entries;
    expectedSnapshot.secretRegister.valuePolicy =
      inventory.secretRegister.valuePolicy;
  }
  if (!isDeepStrictEqual(inventory, expectedSnapshot)) {
    throw new Error(
      `El inventario recuperable difiere del esquema/fuentes v1 en ${firstDifference(inventory, expectedSnapshot)}.`,
    );
  }
  if (requireReady && inventory.policy.readiness !== "ready") {
    throw new Error(
      `Inventario incompleto: faltan ${inventory.humanInputsRequired.length} capturas humanas.`,
    );
  }
  return {
    environmentVariableCount: expectedEnvironmentNames().length,
    format: inventory.format,
    humanInputCount: inventory.humanInputsRequired.length,
    readiness: inventory.policy.readiness,
    secretEntryCount: inventory.secretRegister.entries.length,
    templateCount: inventory.authEmailTemplates.templates.length,
  };
}

export function assertRecoveryInventoryFile(filePath, options = {}) {
  const raw = readFileSync(filePath, "utf8");
  let inventory;
  try {
    inventory = JSON.parse(raw);
  } catch {
    throw new Error("El inventario recuperable no es JSON válido.");
  }
  if (raw !== serializeRecoveryInventory(inventory)) {
    throw new Error(
      "El inventario recuperable no usa la serialización canónica v1.",
    );
  }
  return validateRecoveryInventory(inventory, options);
}

export function writeRecoveryInventory(filePath, options = {}) {
  const inventory = buildRecoveryInventory(options);
  validateRecoveryInventory(inventory, options);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, serializeRecoveryInventory(inventory), {
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
  return validateRecoveryInventory(inventory, options);
}

function parseCli(argv) {
  const options = { mode: "check", requireReady: false };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--print") options.mode = "print";
    else if (current === "--write") {
      options.mode = "write";
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        options.file = argv[++index];
      }
    } else if (current === "--check") {
      options.mode = "check";
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        options.file = argv[++index];
      }
    } else if (current === "--require-ready") options.requireReady = true;
    else throw new Error(`Argumento desconocido: ${current}`);
  }
  if (["print", "write"].includes(options.mode) && options.requireReady) {
    throw new Error(`--${options.mode} no admite --require-ready.`);
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.mode === "print") {
    process.stdout.write(serializeRecoveryInventory(buildRecoveryInventory()));
    return;
  }
  const filePath = path.resolve(
    options.file ?? path.join(repositoryRoot, RECOVERY_CONFIGURATION_PATH),
  );
  if (options.mode === "write") {
    const summary = writeRecoveryInventory(filePath);
    console.log(JSON.stringify({ ok: true, path: filePath, ...summary }));
    return;
  }
  const summary = assertRecoveryInventoryFile(filePath, {
    requireReady: options.requireReady,
  });
  console.log(JSON.stringify({ ok: true, path: filePath, ...summary }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`Inventario recuperable: BLOQUEADO — ${error.message}`);
    process.exitCode = 1;
  });
}
