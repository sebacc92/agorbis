import type { RequestHandler } from "@qwik.dev/router";
import { createClient } from "@supabase/supabase-js";
import {
  OAUTH_CONSENT_COOKIE,
  googleAuthEnabled,
  facebookAuthEnabled,
  validOauthConsentMarker,
} from "~/lib/auth-security";
import { safeInternalPath } from "~/lib/http";
import { onboardingPath, withAuthNext } from "~/lib/auth-navigation";
import {
  COMMUNITY_RULES_VERSION,
  hasCurrentLegalAcceptance,
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  MINIMUM_ACCOUNT_AGE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "~/lib/legal";
import { logEvent, logFailure } from "~/lib/log";
import type { Database } from "~/lib/database.types";
import {
  exchangeOAuthCodeWithServerSecret,
  revokeAndClearProtectedAuthSession,
} from "~/lib/protected-auth";
import { requestIdOf } from "~/lib/request-id";
import { OAUTH_CONTEXT_COOKIE, readOAuthContext } from "~/lib/oauth-context";
import { persistGoogleAuthConsent } from "~/lib/google-auth-consent";
import { classifyExchangedSessionMethod } from "~/lib/auth-session-method";

type OAuthIntent = "login" | "register";

function oauthIntent(value: string | null): OAuthIntent {
  return value === "register" ? "register" : "login";
}

function oauthFailurePath(
  intent: OAuthIntent,
  reason: string,
  next?: string | null,
): string {
  const base = intent === "register" ? "/registro" : "/ingresar";
  return withAuthNext(
    `${base}?oauth_error=${encodeURIComponent(reason)}`,
    next,
  );
}

/**
 * Aterrizaje de OAuth con Google/Facebook y compatibilidad de enlaces Auth.
 *
 * Supabase redirige acá con `?code=...` (flujo PKCE). Canjeamos el código por
 * una sesión, lo que deja las cookies puestas, y mandamos al usuario a donde
 * quería ir — o al onboarding si todavía no eligió dónde vive.
 */
export const onGet: RequestHandler = async (ev) => {
  ev.headers.set("Cache-Control", "no-store");
  ev.headers.set("Referrer-Policy", "no-referrer");
  const code = ev.url.searchParams.get("code");
  const next = ev.url.searchParams.get("next");
  const recovery = ev.url.searchParams.get("recovery") === "1";
  const hasOAuthIntent = ev.url.searchParams.has("intent");
  const intent = oauthIntent(ev.url.searchParams.get("intent"));
  const consentNonce = ev.url.searchParams.get("consent");
  const consentMarker = ev.cookie.get(OAUTH_CONSENT_COOKIE)?.value;
  const contextMarker = ev.cookie.get(OAUTH_CONTEXT_COOKIE)?.value;
  ev.cookie.delete(OAUTH_CONSENT_COOKIE, {
    path: "/auth/callback",
    sameSite: "lax",
  });
  ev.cookie.delete(OAUTH_CONTEXT_COOKIE, {
    path: "/auth/callback",
    sameSite: "lax",
  });
  const ceremonyValid = validOauthConsentMarker(consentMarker, consentNonce, {
    terms: TERMS_VERSION,
    privacy: PRIVACY_VERSION,
    communityRules: COMMUNITY_RULES_VERSION,
    internationalTransfers: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
    minimumAge: MINIMUM_ACCOUNT_AGE,
  });
  const safeNext = safeInternalPath(next, "") || null;
  const context = await readOAuthContext(
    contextMarker,
    consentNonce,
    intent,
    safeNext ?? "/",
  );
  const providerEnabled =
    context?.provider === "google"
      ? googleAuthEnabled(ev.env.get("PUBLIC_GOOGLE_AUTH_ENABLED"))
      : context?.provider === "facebook" &&
        facebookAuthEnabled(ev.env.get("PUBLIC_FACEBOOK_AUTH_ENABLED"));
  const providerError = ev.url.searchParams.get("error");

  if (providerError) {
    const reason = providerError === "access_denied" ? "cancelled" : "provider";
    logEvent(providerError === "access_denied" ? "info" : "warn", {
      scope: "auth/oauth-callback",
      requestId: requestIdOf(ev),
      intent,
      reason,
    });
    throw ev.redirect(302, oauthFailurePath(intent, reason, safeNext));
  }

  if (!code) {
    logEvent("warn", {
      scope: "auth/oauth-callback",
      requestId: requestIdOf(ev),
      intent,
      reason: "missing_code",
    });
    throw ev.redirect(
      302,
      consentNonce || hasOAuthIntent
        ? oauthFailurePath(intent, "invalid", safeNext)
        : withAuthNext("/ingresar?auth_error=1", safeNext),
    );
  }

  const exchange = await exchangeOAuthCodeWithServerSecret(ev, code);
  const { data, error } = exchange;

  if (exchange.providerTokenCleanupFailed) {
    logFailure(
      {
        scope: "auth/oauth-callback",
        requestId: requestIdOf(ev),
        intent,
        reason: "provider_token_persisted",
      },
      error,
    );
    throw ev.redirect(302, oauthFailurePath(intent, "session", safeNext));
  }

  if (error || !data.user || !data.session) {
    logFailure(
      {
        scope: "auth/oauth-callback",
        requestId: requestIdOf(ev),
        intent,
        reason: "exchange_failed",
      },
      error,
    );
    throw ev.redirect(
      302,
      consentNonce || hasOAuthIntent
        ? oauthFailurePath(intent, "invalid", safeNext)
        : withAuthNext("/ingresar?auth_error=1", safeNext),
    );
  }

  // Only inspect the JWT received directly from Supabase's successful exchange,
  // never a query, browser-supplied token or the account's original provider.
  const sessionMethod = classifyExchangedSessionMethod(
    data.session.access_token,
  );
  const oauthSession =
    exchange.oauthProviderTokensSeen || sessionMethod === "oauth";
  const oauthCeremony = oauthSession || hasOAuthIntent || !!consentNonce;
  if (
    sessionMethod === "unknown" ||
    (oauthCeremony &&
      (sessionMethod !== "oauth" ||
        !ceremonyValid ||
        !context ||
        !providerEnabled ||
        recovery))
  ) {
    const cleanup = await revokeAndClearProtectedAuthSession(
      ev,
      data.session.access_token,
    );
    if (cleanup.revocationError) {
      logFailure(
        {
          scope: "auth/oauth-callback",
          requestId: requestIdOf(ev),
          intent,
          reason: "invalid_preflight_revocation_failed",
        },
        cleanup.revocationError,
      );
    }
    if (cleanup.cleanupError) {
      logFailure(
        {
          scope: "auth/oauth-callback",
          requestId: requestIdOf(ev),
          intent,
          reason: "invalid_preflight_cookie_cleanup_failed",
        },
        cleanup.cleanupError,
      );
    }
    logEvent("warn", {
      scope: "auth/oauth-callback",
      requestId: requestIdOf(ev),
      intent,
      reason: "missing_or_expired_preflight",
    });
    throw ev.redirect(302, oauthFailurePath(intent, "invalid", safeNext));
  }

  const supabaseUrl = ev.env.get("PUBLIC_SUPABASE_URL")?.trim();
  const publishableKey = ev.env.get("PUBLIC_SUPABASE_ANON_KEY")?.trim();
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Falta la configuración pública de Supabase.");
  }
  const accessToken = data.session.access_token;
  // El canje Auth usó la secret; desde acá las lecturas de aplicación vuelven
  // deliberadamente a publishable + JWT de la persona para respetar RLS.
  const db = createClient<Database>(supabaseUrl, publishableKey, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // An approved Google decision is independent from the agreements needed by
  // every account. Never backfill it from the general transfer checkbox.
  if (
    oauthCeremony &&
    context?.provider === "google" &&
    (!context.googleDecision ||
      !(await persistGoogleAuthConsent(db, context.googleDecision)))
  ) {
    const cleanup = await revokeAndClearProtectedAuthSession(ev, accessToken);
    logEvent("warn", {
      scope: "auth/oauth-callback",
      requestId: requestIdOf(ev),
      intent,
      reason: "google_consent_not_recorded",
    });
    if (cleanup.revocationError || cleanup.cleanupError) {
      logFailure(
        {
          scope: "auth/oauth-callback",
          reason: "google_consent_cleanup_failed",
        },
        cleanup.revocationError ?? cleanup.cleanupError,
      );
    }
    throw ev.redirect(302, oauthFailurePath(intent, "consent", safeNext));
  }

  // Recuperar acceso es un derecho de cuenta y no depende de aceptar la
  // versión legal actual. El gate de participación seguirá cerrado después.
  if (recovery) {
    throw ev.redirect(302, "/perfil/contrasena?recovery=1");
  }

  // La marca previa autoriza la transferencia de la ceremonia, pero los
  // acuerdos durables sólo existen en PostgreSQL después de identificar a la
  // persona. Una cuenta nueva termina por eso en el gate autenticado.
  if (!(await hasCurrentLegalAcceptance(db))) {
    const consent = new URL("/consentimiento", ev.url.origin);
    if (safeNext) consent.searchParams.set("next", safeNext);
    throw ev.redirect(302, `${consent.pathname}${consent.search}`);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("home_community_id")
    .eq("id", data.user.id)
    .maybeSingle();

  throw ev.redirect(
    302,
    profile?.home_community_id ? (safeNext ?? "/") : onboardingPath(safeNext),
  );
};
