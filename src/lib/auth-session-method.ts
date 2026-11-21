export type ExchangedSessionMethod = "oauth" | "email" | "unknown";

const EMAIL_METHODS = new Set([
  "password",
  "otp",
  "recovery",
  "invite",
  "magiclink",
  "email/signup",
  "email_change",
]);

// Additional factors and refreshes do not replace the primary sign-in method.
const SUPPLEMENTARY_METHODS = new Set([
  "totp",
  "mfa/totp",
  "mfa/phone",
  "mfa/webauthn",
  "mfa/recovery_code",
  "token_refresh",
]);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeJson(segment: string): unknown {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/**
 * Classifies ONLY the access token returned directly by the trusted Supabase
 * HTTPS code exchange. This decoder does not authenticate arbitrary JWTs and
 * must never receive a token from request parameters, headers or cookies.
 *
 * AMR proves the primary method, not which social provider was used. Keep the
 * provider bound to the PKCE ceremony. Neither linked account metadata nor the
 * optional provider tokens prove the method of this particular sign-in.
 *
 * Sources checked 2026-09-08:
 * https://supabase.com/docs/guides/auth/jwt-fields#authentication-methods-amrmethod
 * https://github.com/supabase/auth/blob/master/internal/models/factor.go
 * https://github.com/supabase/auth/blob/master/internal/models/sessions.go
 * https://github.com/supabase/auth/blob/master/internal/api/token.go
 */
export function classifyExchangedSessionMethod(
  accessToken: string,
): ExchangedSessionMethod {
  try {
    if (typeof accessToken !== "string") return "unknown";
    const segments = accessToken.split(".");
    if (
      segments.length !== 3 ||
      segments.some(
        (segment) =>
          !/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1,
      )
    ) {
      return "unknown";
    }
    const header = decodeJson(segments[0]);
    const claims = decodeJson(segments[1]);
    if (
      !record(header) ||
      typeof header.alg !== "string" ||
      !header.alg ||
      header.alg === "none" ||
      !record(claims) ||
      !Array.isArray(claims.amr) ||
      !claims.amr.length
    ) {
      return "unknown";
    }

    let latestTimestamp = -1;
    let latestMethod: ExchangedSessionMethod = "unknown";
    let latestHasPhoneAlternative = false;
    for (const entry of claims.amr) {
      if (
        !record(entry) ||
        typeof entry.method !== "string" ||
        typeof entry.timestamp !== "number" ||
        !Number.isSafeInteger(entry.timestamp) ||
        entry.timestamp <= 0
      ) {
        return "unknown";
      }
      if (SUPPLEMENTARY_METHODS.has(entry.method)) continue;

      let method: ExchangedSessionMethod;
      if (entry.method === "oauth") {
        method = "oauth";
      } else if (EMAIL_METHODS.has(entry.method)) {
        method = "email";
      } else {
        // New/custom primary methods require an explicit compatibility review.
        return "unknown";
      }

      if (entry.timestamp > latestTimestamp) {
        latestTimestamp = entry.timestamp;
        latestMethod = method;
        latestHasPhoneAlternative =
          entry.method === "password" || entry.method === "otp";
      } else if (entry.timestamp === latestTimestamp) {
        if (method !== latestMethod) {
          // GoTrue stores seconds and does not guarantee the order of ties.
          latestMethod = "unknown";
        }
        latestHasPhoneAlternative ||=
          entry.method === "password" || entry.method === "otp";
      }
    }
    if (latestMethod === "email") {
      if (typeof claims.email !== "string" || !claims.email.trim()) {
        return "unknown";
      }
      // Supabase also uses password/otp for phone authentication. With both
      // contact methods present AMR alone cannot prove email was used.
      if (
        latestHasPhoneAlternative &&
        claims.phone !== undefined &&
        claims.phone !== ""
      ) {
        return "unknown";
      }
    }
    return latestMethod;
  } catch {
    // Never propagate decode errors: they may contain token payload fragments.
    return "unknown";
  }
}
