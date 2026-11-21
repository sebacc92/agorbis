/**
 * GoTrue emite el nonce de reautenticación con la longitud configurada para
 * los OTP. Aceptamos el rango que admite Supabase, pero nunca texto libre: el
 * valor termina en el endpoint sensible que cambia la contraseña.
 */
export const MIN_REAUTHENTICATION_NONCE_LENGTH = 6;
export const MAX_REAUTHENTICATION_NONCE_LENGTH = 10;

export function isPlausibleReauthenticationNonce(value: string): boolean {
  return new RegExp(
    `^[0-9]{${MIN_REAUTHENTICATION_NONCE_LENGTH},${MAX_REAUTHENTICATION_NONCE_LENGTH}}$`,
  ).test(value);
}

export type PasswordReauthenticationError = "required" | "invalid" | null;

/**
 * Clasifica por el código estable de Auth y no por el mensaje traducible.
 * Sólo se usa sobre errores devueltos por `updateUser({ password, nonce })`.
 */
export function passwordReauthenticationError(
  error: unknown,
): PasswordReauthenticationError {
  if (!error || typeof error !== "object") return null;
  const code = Reflect.get(error, "code");
  if (code === "reauthentication_needed" || code === "reauth_nonce_missing") {
    return "required";
  }
  if (code === "reauthentication_not_valid" || code === "otp_expired") {
    return "invalid";
  }
  return null;
}

export function isAuthEmailRateLimit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = Reflect.get(error, "code");
  return (
    code === "over_email_send_rate_limit" || code === "over_request_rate_limit"
  );
}
