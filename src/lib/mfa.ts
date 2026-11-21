import type {
  AuthenticatorAssuranceLevels,
  Factor,
} from "@supabase/supabase-js";
import { isUuid, safeInternalPath } from "./http";

// Usamos la URL canónica con slash final. Cuando una navegación SPA recibía
// primero el redirect de moderación y después el de canonicalización, Qwik
// podía intentar aplicar ambas transiciones sobre el mismo DOM.
export const MFA_SECURITY_PATH = "/perfil/seguridad/";
export const MAX_TOTP_FACTORS = 2;

/**
 * `next` y `approval` pertenecen al paso de autenticación, no al destino.
 * Quitarlos impide bucles y destinos autoanidados si el router todavía termina
 * una carga anterior mientras procesa el redirect hacia la pantalla de MFA.
 */
function cleanMfaDestination(requestedPath: string, fallback: string): string {
  const safe = safeInternalPath(requestedPath, fallback);
  const parsed = new URL(safe, "https://agorbis.invalid");
  parsed.searchParams.delete("next");
  parsed.searchParams.delete("approval");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * El segundo factor es una propiedad de la sesión actual, no de la cuenta.
 * Tener un TOTP registrado (`nextLevel=aal2`) no alcanza: el JWT que intenta
 * moderar tiene que haberlo verificado y llevar `aal2` como nivel actual.
 */
export function isCurrentAal2(
  level: AuthenticatorAssuranceLevels | null | undefined,
): boolean {
  return level === "aal2";
}

/** Conserva sólo destinos internos al mandar una sesión a completar MFA. */
export function moderatorMfaUrl(requestedPath: string): string {
  const next = cleanMfaDestination(requestedPath, "/moderacion");
  return `${MFA_SECURITY_PATH}?next=${encodeURIComponent(next)}`;
}

/** Destino posterior a la verificación, nuevamente cerrado al mismo origen. */
export function mfaDestination(
  requestedPath: string | null | undefined,
): string {
  return cleanMfaDestination(
    requestedPath ?? "",
    `${MFA_SECURITY_PATH}?verified=1`,
  );
}

export function verifiedTotpFactors(factors: readonly Factor[]): Factor[] {
  return factors.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
}

export function isSafeTotpEnrollment(data: {
  id: string;
  type: string;
  totp?: { qr_code?: string; secret?: string };
}): data is {
  id: string;
  type: "totp";
  totp: { qr_code: string; secret: string };
} {
  return (
    data.type === "totp" &&
    isUuid(data.id) &&
    !!data.totp?.qr_code?.startsWith("data:image/svg+xml;utf-8,") &&
    !!data.totp.secret &&
    data.totp.secret.length >= 16 &&
    data.totp.secret.length <= 128 &&
    /^[A-Z2-7]+=*$/i.test(data.totp.secret)
  );
}
