import type { DB } from "./supabase";
import {
  areBilingualExternalEvidenceValuesEquivalent,
  isExternalEvidencePlaceholder,
  isForbiddenAaipDatabaseRegistrationIdValue,
} from "./legal-evidence-policy.js";

export interface ParticipationStatus {
  canParticipate: boolean;
  isSuspended: boolean;
}

/** Versiones persistidas junto con la aceptación durante el alta. */
export const TERMS_VERSION = "2026-08-23";
export const PRIVACY_VERSION = "2026-11-02.1";
export const COMMUNITY_RULES_VERSION = "2026-08-23";
export const INTERNATIONAL_TRANSFER_NOTICE_VERSION = "2026-08-29.1";

/** El lanzamiento inicial no admite cuentas de menores. */
export const MINIMUM_ACCOUNT_AGE = 18;

export const LEGAL_CONTROLLER_NAME =
  (
    import.meta.env.PUBLIC_LEGAL_CONTROLLER_NAME as string | undefined
  )?.trim() || "Agorbis";

export const LEGAL_CONTACT_EMAIL =
  (import.meta.env.PUBLIC_LEGAL_CONTACT_EMAIL as string | undefined)?.trim() ||
  "privacidad@agorbis.invalid";

/** Código público del responsable emitido por AAIP; no sustituye el alta de cada base. */
export const AAIP_CONTROLLER_ID =
  (import.meta.env.PUBLIC_AAIP_CONTROLLER_ID as string | undefined)?.trim() ||
  "Código de responsable AAIP pendiente";

export type AaipDatabaseRegistrationStatus = "pending" | "approved";

/**
 * Este filtro sólo evita valores que sabemos que no son una constancia aprobada.
 * No inventa un formato positivo: la evidencia externa sigue siendo obligatoria.
 */
export function isDisplayableAaipDatabaseRegistrationId(
  registrationId: string | undefined,
): boolean {
  const current = registrationId?.trim() ?? "";
  return !isForbiddenAaipDatabaseRegistrationIdValue(current);
}

/**
 * La UI falla cerrada. Un ID aislado no convierte el trámite en aprobado y un
 * estado `approved` sin un ID utilizable se sigue mostrando como pendiente.
 */
export function resolveAaipDatabaseRegistrationStatus(
  status: string | undefined,
  registrationId: string | undefined,
): AaipDatabaseRegistrationStatus {
  return status === "approved" &&
    isDisplayableAaipDatabaseRegistrationId(registrationId)
    ? "approved"
    : "pending";
}

const configuredAaipDatabaseRegistrationId = (
  import.meta.env.PUBLIC_AAIP_DATABASE_REGISTRATION_ID as string | undefined
)?.trim();

/**
 * Proyección pública del estado de release. El valor canónico debe ser validado
 * por el preflight; si no se inyecta, la representación segura es `pending`.
 */
export const AAIP_DATABASE_REGISTRATION_STATUS =
  resolveAaipDatabaseRegistrationStatus(
    import.meta.env.PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS as
      string | undefined,
    configuredAaipDatabaseRegistrationId,
  );

/** Número emitido para la base; permanece vacío salvo en estado `approved`. */
export const AAIP_DATABASE_REGISTRATION_ID =
  AAIP_DATABASE_REGISTRATION_STATUS === "approved"
    ? (configuredAaipDatabaseRegistrationId ?? "")
    : "";

export type ExternalDisclosureStatus = "pending" | "confirmed";

export interface BilingualExternalDisclosure {
  status: ExternalDisclosureStatus;
  es: string;
  en: string;
}

/**
 * Los pares legales son atómicos: nunca se publica una mitad ni se sustituye la
 * faltante con una traducción inventada. El copy de pendiente pertenece a la UI.
 */
export function resolveBilingualExternalDisclosure(
  spanish: string | undefined,
  english: string | undefined,
): BilingualExternalDisclosure {
  const es = spanish?.trim() ?? "";
  const en = english?.trim() ?? "";
  const confirmed =
    es.length > 0 &&
    en.length > 0 &&
    !isExternalEvidencePlaceholder(es) &&
    !isExternalEvidencePlaceholder(en) &&
    !areBilingualExternalEvidenceValuesEquivalent(es, en);

  return confirmed
    ? { status: "confirmed", es, en }
    : { status: "pending", es: "", en: "" };
}

export interface ProcessorDisclosure {
  name: string;
  purposeEs: string;
  purposeEn: string;
  processingLocationStatus: ExternalDisclosureStatus;
  processingLocationEs: string;
  processingLocationEn: string;
}

/**
 * Los destinos reales se inyectan como configuración pública porque dependen
 * del proyecto y contrato elegidos, no de una suposición del repositorio. El
 * preflight de producción rechaza cada placeholder.
 */
const supabaseProcessingLocation = resolveBilingualExternalDisclosure(
  import.meta.env.PUBLIC_SUPABASE_PROCESSING_LOCATION as string | undefined,
  import.meta.env.PUBLIC_SUPABASE_PROCESSING_LOCATION_EN as string | undefined,
);
const resendProcessingLocation = resolveBilingualExternalDisclosure(
  import.meta.env.PUBLIC_RESEND_PROCESSING_LOCATION as string | undefined,
  import.meta.env.PUBLIC_RESEND_PROCESSING_LOCATION_EN as string | undefined,
);
const cloudflareProcessingLocation = resolveBilingualExternalDisclosure(
  import.meta.env.PUBLIC_CLOUDFLARE_PROCESSING_LOCATION as string | undefined,
  import.meta.env.PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN as
    string | undefined,
);
const googleProcessingLocation = resolveBilingualExternalDisclosure(
  import.meta.env.PUBLIC_GOOGLE_PROCESSING_LOCATION as string | undefined,
  import.meta.env.PUBLIC_GOOGLE_PROCESSING_LOCATION_EN as string | undefined,
);

const facebookProcessingLocation = resolveBilingualExternalDisclosure(
  import.meta.env.PUBLIC_FACEBOOK_PROCESSING_LOCATION as string | undefined,
  import.meta.env.PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN as string | undefined,
);

export const PROCESSOR_DISCLOSURES: ProcessorDisclosure[] = [
  {
    name: "Supabase",
    purposeEs: "Base de datos, autenticación y almacenamiento de archivos",
    purposeEn: "Database, authentication, and file storage",
    processingLocationStatus: supabaseProcessingLocation.status,
    processingLocationEs: supabaseProcessingLocation.es,
    processingLocationEn: supabaseProcessingLocation.en,
  },
  {
    name: "Resend",
    purposeEs: "Entrega de correos transaccionales de autenticación",
    purposeEn: "Delivery of transactional authentication email",
    processingLocationStatus: resendProcessingLocation.status,
    processingLocationEs: resendProcessingLocation.es,
    processingLocationEn: resendProcessingLocation.en,
  },
  {
    name: "Cloudflare DNS + Turnstile + Edge Compute",
    purposeEs:
      "DNS autoritativo, alojamiento y ejecución de la aplicación mediante Workers Edge Compute como reverse proxy HTTP, y prevención de automatización abusiva mediante Turnstile A/B",
    purposeEn:
      "Authoritative DNS, application hosting and execution through Workers Edge Compute as an HTTP reverse proxy, and abusive-automation prevention through Turnstile A/B",
    processingLocationStatus: cloudflareProcessingLocation.status,
    processingLocationEs: cloudflareProcessingLocation.es,
    processingLocationEn: cloudflareProcessingLocation.en,
  },
  ...((import.meta.env.PUBLIC_GOOGLE_AUTH_ENABLED as string | undefined) ===
  "true"
    ? [
        {
          name: "Google",
          purposeEs:
            "Autenticación opcional con correo verificado y perfil básico",
          purposeEn:
            "Optional authentication with verified email and basic profile",
          processingLocationStatus: googleProcessingLocation.status,
          processingLocationEs: googleProcessingLocation.es,
          processingLocationEn: googleProcessingLocation.en,
        },
      ]
    : []),
  ...((import.meta.env.PUBLIC_FACEBOOK_AUTH_ENABLED as string | undefined) ===
  "true"
    ? [
        {
          name: "Meta / Facebook",
          purposeEs:
            "Autenticación opcional con correo y perfil básico de Facebook",
          purposeEn:
            "Optional authentication with Facebook email and basic profile",
          processingLocationStatus: facebookProcessingLocation.status,
          processingLocationEs: facebookProcessingLocation.es,
          processingLocationEn: facebookProcessingLocation.en,
        },
      ]
    : []),
];

export const INTERNATIONAL_TRANSFER_SAFEGUARDS =
  resolveBilingualExternalDisclosure(
    import.meta.env.PUBLIC_TRANSFER_SAFEGUARDS as string | undefined,
    import.meta.env.PUBLIC_TRANSFER_SAFEGUARDS_EN as string | undefined,
  );

export const PROVIDER_RETENTION_SUMMARY = resolveBilingualExternalDisclosure(
  import.meta.env.PUBLIC_PROVIDER_RETENTION_SUMMARY as string | undefined,
  import.meta.env.PUBLIC_PROVIDER_RETENTION_SUMMARY_EN as string | undefined,
);

export const LEGAL_ROUTES = {
  privacy: "/privacidad",
  dataDeletion: "/eliminar-datos",
  terms: "/terminos",
  communityRules: "/normas-comunitarias",
  moderation: "/moderacion-y-apelaciones",
  subprocessors: "/subencargados",
  internationalTransfers: "/transferencias-internacionales",
} as const;

/** Persiste la aceptación con hora de base; todo error falla cerrado. */
export async function persistCurrentLegalAcceptance(
  db: DB,
  locale: "es" | "en" = "es",
): Promise<boolean> {
  const legal = await db.rpc("accept_current_legal", {
    p_minimum_age_attested: true,
  });
  if (legal.error) return false;

  const transfer = await db.rpc(
    "grant_current_international_transfer_consent",
    {
      p_expressly_accepted: true,
      p_locale: locale,
      p_version: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
    },
  );
  return !transfer.error;
}

/**
 * Consulta la fuente de verdad de la base. Nunca se confía en
 * `user_metadata`: esa metadata la propia cuenta puede cambiarla.
 */
export async function hasCurrentLegalAcceptance(db: DB): Promise<boolean> {
  const { data, error } = await db.rpc("my_legal_status");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }

  const documents = Array.isArray((data as Record<string, unknown>).documents)
    ? ((data as Record<string, unknown>).documents as unknown[])
    : [];
  const expected = new Map([
    ["terms", TERMS_VERSION],
    ["privacy", PRIVACY_VERSION],
    ["community_rules", COMMUNITY_RULES_VERSION],
  ]);
  const transfer = (data as Record<string, unknown>)
    .international_transfer_consent;

  return (
    documents.length === expected.size &&
    documents.every((document) => {
      if (
        !document ||
        typeof document !== "object" ||
        Array.isArray(document)
      ) {
        return false;
      }
      const row = document as Record<string, unknown>;
      return (
        typeof row.type === "string" &&
        expected.get(row.type) === row.version &&
        row.accepted === true
      );
    }) &&
    !!transfer &&
    typeof transfer === "object" &&
    !Array.isArray(transfer) &&
    (transfer as Record<string, unknown>).version ===
      INTERNATIONAL_TRANSFER_NOTICE_VERSION &&
    (transfer as Record<string, unknown>).status === "accepted"
  );
}

/** Estado mínimo del gate legal/moderación. */
export async function readParticipationStatus(
  db: DB,
): Promise<ParticipationStatus | null> {
  const { data, error } = await db.rpc("my_legal_status");
  if (error || !data || typeof data !== "object") return null;

  const status = data as Record<string, unknown>;
  if (
    typeof status.can_participate !== "boolean" ||
    typeof status.is_suspended !== "boolean"
  ) {
    return null;
  }
  return {
    canParticipate: status.can_participate,
    isSuspended: status.is_suspended,
  };
}
