import { z } from "@qwik.dev/router";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;

/**
 * Une el consentimiento del formulario de registro con el callback OAuth.
 * La cookie es HttpOnly y dura sólo lo suficiente para completar OAuth; el
 * nonce evita que un callback iniciado por fuera de la aplicación reutilice
 * una marca vieja.
 */
export const OAUTH_CONSENT_COOKIE = "agorbis-oauth-consent";
export const OAUTH_CONSENT_MAX_AGE_SECONDS = 10 * 60;

export function oauthConsentMarker(
  nonce: string,
  versions: {
    terms: string;
    privacy: string;
    communityRules: string;
    internationalTransfers: string;
    minimumAge: number;
  },
): string {
  return [
    nonce,
    versions.terms,
    versions.privacy,
    versions.communityRules,
    versions.internationalTransfers,
    String(versions.minimumAge),
  ].join(":");
}

export function validOauthConsentMarker(
  marker: string | null | undefined,
  nonce: string | null | undefined,
  versions: {
    terms: string;
    privacy: string;
    communityRules: string;
    internationalTransfers: string;
    minimumAge: number;
  },
): boolean {
  if (!marker || !nonce) return false;
  return marker === oauthConsentMarker(nonce, versions);
}

/** Google se ofrece sólo cuando el proveedor fue habilitado explícitamente. */
export function googleAuthEnabled(value: string | undefined): boolean {
  return value === "true";
}

/** Facebook tiene su propia habilitación; activar Google no lo habilita. */
export function facebookAuthEnabled(value: string | undefined): boolean {
  return value === "true";
}

export type SocialAuthProvider = "google" | "facebook";

export const GOOGLE_AUTH_ENABLED = googleAuthEnabled(
  import.meta.env.PUBLIC_GOOGLE_AUTH_ENABLED as string | undefined,
);

export const FACEBOOK_AUTH_ENABLED = facebookAuthEnabled(
  import.meta.env.PUBLIC_FACEBOOK_AUTH_ENABLED as string | undefined,
);

/**
 * Espejo UX de la policy de GoTrue; el servidor Auth sigue siendo la verdad.
 * Producción exige `letters_digits` (D101): largo mínimo, al menos una letra
 * ASCII y al menos un dígito. GoTrue no cuenta una "ñ" sola como letra, así
 * que acá tampoco.
 *
 * La IIFE `@__PURE__` deja que el bundler descarte el esquema (y zod) en el
 * navegador, que de este módulo sólo usa las constantes y las banderas de
 * proveedores. Ver `url.ts`.
 */
export const strongPasswordSchema = /* @__PURE__ */ (() =>
  z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Usá al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
    .max(MAX_PASSWORD_LENGTH, "La contraseña es demasiado larga.")
    .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
      message: "Incluí al menos una letra y un número.",
    }))();
