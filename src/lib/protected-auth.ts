import type { RequestEventBase } from "@qwik.dev/router";
import {
  createServerClient as createSsrServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { authEmailConfirmUrl } from "./http";
import { hasCurrentLegalAcceptance } from "./legal";
import { logEvent, logFailure } from "./log";
import { hardenedSupabaseCookieOptions } from "./supabase";
import {
  TURNSTILE_ACTIONS,
  type TurnstileAction,
  verifyTurnstileToken,
} from "./turnstile";
import { getTrustedClientIp } from "./client-ip";
import type { SocialAuthProvider } from "./auth-security";

function publicValue(
  ev: RequestEventBase,
  key: "PUBLIC_SUPABASE_URL" | "PUBLIC_SUPABASE_ANON_KEY",
): string {
  const value = ev.env.get(key)?.trim();
  if (!value) throw new Error(`Falta ${key} en el entorno del servidor.`);
  return value;
}

function secretKey(ev: RequestEventBase): string {
  if (!import.meta.env.SSR) {
    throw new Error("El cliente Auth protegido sólo puede usarse en servidor.");
  }
  const value = ev.env.get("SUPABASE_SECRET_KEY")?.trim();
  if (!value) {
    throw new Error("Falta SUPABASE_SECRET_KEY en el entorno del servidor.");
  }
  return value;
}

function authStorageKey(ev: RequestEventBase): string {
  const hostname = new URL(publicValue(ev, "PUBLIC_SUPABASE_URL")).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}

function isPkceCookieName(name: string, storageKey: string): boolean {
  // @supabase/ssr puede fragmentar una cookie como `.0`, `.1`, etc. Se valida
  // el nombre lógico antes del sufijo para admitir esos fragmentos sin abrir
  // acceso a la cookie de sesión vecina.
  const logicalName = name.replace(/\.\d+$/, "");
  if (
    logicalName === `${storageKey}-code-verifier` ||
    logicalName === `${storageKey}-flows-code-verifier`
  ) {
    return true;
  }
  const prefix = `${storageKey}-flow-`;
  const suffix = "-code-verifier";
  if (!logicalName.startsWith(prefix) || !logicalName.endsWith(suffix)) {
    return false;
  }
  const flowId = logicalName.slice(prefix.length, -suffix.length);
  return /^[A-Za-z0-9_-]{8,64}$/.test(flowId);
}

function isSessionCookieName(name: string, storageKey: string): boolean {
  return (
    name === storageKey ||
    (name.startsWith(`${storageKey}.`) &&
      /^\d+$/.test(name.slice(storageKey.length + 1)))
  );
}

function clearAuthCookies(ev: RequestEventBase, names: string[]) {
  for (const name of names) {
    ev.cookie.set(
      name,
      "",
      hardenedSupabaseCookieOptions(
        { path: "/", maxAge: 0, sameSite: "lax" },
        ev.url.protocol === "https:",
      ),
    );
  }
}

function authCookieWriter(
  ev: RequestEventBase,
  options: { readPkceVerifier?: boolean } = {},
) {
  return {
    // Por defecto la request no aporta cookies: ningún JWT del usuario puede
    // reemplazar la credencial secreta y desactivar accidentalmente el bypass
    // de CAPTCHA B. El callback habilita sólo las cookies PKCE estrictamente
    // necesarias para canjear el código, nunca la cookie de sesión.
    getAll: () => {
      if (!options.readPkceVerifier) return [];
      const storageKey = authStorageKey(ev);
      return Object.entries(ev.cookie.getAll())
        .filter(
          ([name, cookie]) =>
            cookie?.value && isPkceCookieName(name, storageKey),
        )
        .map(([name, cookie]) => ({ name, value: cookie.value }));
    },
    setAll(
      cookies: { name: string; value: string; options?: CookieOptions }[],
    ) {
      const storageKey = authStorageKey(ev);
      const sessionWrites = cookies.filter(
        ({ name, value, options }) =>
          isSessionCookieName(name, storageKey) &&
          value &&
          options?.maxAge !== 0,
      );
      if (sessionWrites.length > 0) {
        const currentNames = new Set(sessionWrites.map(({ name }) => name));
        // El SDK no ve cookies de sesión por diseño. Qwik sí incluye en
        // getAll() los Set-Cookie previos: borrar sus fragmentos sobrantes
        // evita conservar provider_tokens al reducir la sesión saneada.
        clearAuthCookies(
          ev,
          Object.keys(ev.cookie.getAll()).filter(
            (name) =>
              isSessionCookieName(name, storageKey) && !currentNames.has(name),
          ),
        );
      }
      for (const { name, value, options } of cookies) {
        ev.cookie.set(
          name,
          encodeURIComponent(value),
          hardenedSupabaseCookieOptions(options, ev.url.protocol === "https:"),
        );
      }
    },
  };
}

function isolatedProtectedAuth(
  ev: RequestEventBase,
  options: { readPkceVerifier?: boolean } = {},
) {
  const clientIp = getTrustedClientIp(ev);
  return createSsrServerClient<Database>(
    publicValue(ev, "PUBLIC_SUPABASE_URL"),
    secretKey(ev),
    {
      cookies: authCookieWriter(ev, options),
      global: {
        headers: clientIp ? { "Sb-Forwarded-For": clientIp } : {},
      },
    },
  ).auth;
}

/**
 * Inicia OAuth con PKCE usando exclusivamente la credencial server-only.
 * Widget A se valida en Agorbis cuando corresponda; el token del widget B de
 * Supabase no se genera ni se transmite desde este handler.
 */
export function startSocialOAuthWithServerSecret(
  ev: RequestEventBase,
  provider: SocialAuthProvider,
  redirectTo: string,
) {
  return isolatedProtectedAuth(ev).signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...(provider === "facebook" ? { scopes: "email" } : {}),
    },
  });
}

/** Compatibilidad con los consumidores previos del inicio con Google. */
export function startGoogleOAuthWithServerSecret(
  ev: RequestEventBase,
  redirectTo: string,
) {
  return startSocialOAuthWithServerSecret(ev, "google", redirectTo);
}

/**
 * Canjea el código PKCE con la secret. El lector de cookies admite únicamente
 * los verificadores de este proyecto; un JWT entrante nunca se convierte en
 * Authorization. También elimina los tokens del proveedor antes de dejar la sesión
 * definitiva en las cookies de Agorbis.
 */
export async function exchangeOAuthCodeWithServerSecret(
  ev: RequestEventBase,
  code: string,
) {
  const auth = isolatedProtectedAuth(ev, { readPkceVerifier: true });
  const exchanged = await auth.exchangeCodeForSession(code);
  const session = exchanged.data.session;
  if (
    exchanged.error ||
    !session ||
    (!session.provider_token && !session.provider_refresh_token)
  ) {
    return {
      ...exchanged,
      oauthProviderTokensSeen: false as const,
      providerTokenCleanupFailed: false as const,
    };
  }

  const sanitized = await auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  const clean =
    !sanitized.error &&
    !!sanitized.data.session &&
    !sanitized.data.session.provider_token &&
    !sanitized.data.session.provider_refresh_token;
  if (!clean) {
    // El primer canje ya pudo escribir la sesión con credenciales del
    // proveedor. La limpieza local la invalida en la respuesta antes de fallar.
    await revokeAndClearProtectedAuthSession(ev, session.access_token);
    return {
      data: { user: null, session: null },
      error:
        sanitized.error ??
        new Error("No se pudieron retirar los tokens del proveedor OAuth."),
      oauthProviderTokensSeen: true as const,
      providerTokenCleanupFailed: true as const,
    };
  }
  return {
    ...sanitized,
    oauthProviderTokensSeen: true as const,
    providerTokenCleanupFailed: false as const,
  };
}

/**
 * Revoca sólo el refresh token de la ceremonia fallida y siempre elimina sus
 * cookies de la respuesta. `global` permitiría cerrar por DoS otras sesiones
 * legítimas de una cuenta existente, por eso el alcance es deliberadamente
 * `local`.
 */
export async function revokeAndClearProtectedAuthSession(
  ev: RequestEventBase,
  accessToken: string,
) {
  const auth = isolatedProtectedAuth(ev);
  let revocationError: unknown;
  try {
    const result = await auth.admin.signOut(accessToken, "local");
    revocationError = result.error;
  } catch (error) {
    revocationError = error;
  }

  // El SDK no ve la sesión entrante y por eso no conoce sus nombres para
  // borrarla. Limpiamos explícitamente sólo las cookies de este proyecto,
  // incluidas las que el canje escribió en esta misma respuesta.
  let cleanupError: unknown;
  try {
    const result = await auth.signOut({ scope: "local" });
    cleanupError = result.error;
  } catch (error) {
    cleanupError = error;
  } finally {
    const storageKey = authStorageKey(ev);
    clearAuthCookies(
      ev,
      Object.keys(ev.cookie.getAll()).filter(
        (name) =>
          isSessionCookieName(name, storageKey) ||
          isPkceCookieName(name, storageKey),
      ),
    );
  }
  return {
    error: revocationError ?? cleanupError,
    revocationError,
    cleanupError,
  };
}

/**
 * Step-up cerrado para TOTP y baja. Usa la secret sin cookies ni token B,
 * comprueba que Auth devolvió exactamente la cuenta esperada y revoca de
 * inmediato la sesión auxiliar que creó el password grant.
 */
export async function verifyPasswordCredential(
  ev: RequestEventBase,
  input: { email: string; password: string; expectedUserId: string },
): Promise<boolean> {
  const clientIp = getTrustedClientIp(ev);
  const verifier = createClient<Database>(
    publicValue(ev, "PUBLIC_SUPABASE_URL"),
    secretKey(ev),
    {
      global: {
        headers: clientIp ? { "Sb-Forwarded-For": clientIp } : {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data, error } = await verifier.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  const matches = !error && data.user?.id === input.expectedUserId;
  if (!error && data.user && !matches) {
    logFailure(
      { scope: "auth/credential-verification-identity" },
      new Error("El step-up devolvió otra identidad."),
    );
  }
  if (data.session) {
    const { error: signOutError } = await verifier.auth.signOut({
      scope: "local",
    });
    if (signOutError) {
      logFailure(
        { scope: "auth/credential-verification-cleanup" },
        signOutError,
      );
    }
  }
  return matches;
}

type RejectedByTurnstile = { turnstileVerified: false };
type AcceptedByTurnstile<T> = { turnstileVerified: true; result: T };

async function afterTurnstile<T>(
  ev: RequestEventBase,
  token: string,
  action: TurnstileAction,
  operation: (auth: ReturnType<typeof isolatedProtectedAuth>) => Promise<T>,
): Promise<RejectedByTurnstile | AcceptedByTurnstile<T>> {
  const verified = await verifyTurnstileToken(ev, token, action);
  if (!verified.ok) {
    // Sin el motivo, un widget de otra cuenta y un bot se ven iguales: el
    // 01-11-2026 una site key vieja rechazó todas las altas sin dejar rastro.
    logEvent(
      "warn",
      { scope: "auth/turnstile" },
      {
        action,
        reason: verified.reason,
        siteverifyErrors: verified.siteverifyErrors ?? [],
      },
    );
    return { turnstileVerified: false };
  }
  return {
    turnstileVerified: true,
    result: await operation(isolatedProtectedAuth(ev)),
  };
}

export function signUpWithTurnstile(
  ev: RequestEventBase,
  input: {
    email: string;
    password: string;
    turnstileToken: string;
    next?: string;
  },
) {
  return afterTurnstile(
    ev,
    input.turnstileToken,
    TURNSTILE_ACTIONS.signup,
    (auth) =>
      auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: authEmailConfirmUrl(ev, {
            next: input.next ?? "/onboarding",
          }),
        },
      }),
  );
}

export async function signInWithTurnstile(
  ev: RequestEventBase,
  input: { email: string; password: string; turnstileToken: string },
) {
  const attempt = await afterTurnstile(
    ev,
    input.turnstileToken,
    TURNSTILE_ACTIONS.passwordLogin,
    (auth) =>
      auth.signInWithPassword({
        email: input.email,
        password: input.password,
      }),
  );
  if (!attempt.turnstileVerified) return attempt;

  const { data, error } = attempt.result;
  if (error || !data.session) {
    return { turnstileVerified: true as const, error, legalAccepted: false };
  }

  // La credencial secreta sólo hizo Auth. Esta RPC usa explícitamente el JWT
  // recién emitido y la publishable key, por lo que vuelve a estar bajo RLS.
  const userDb = createClient<Database>(
    publicValue(ev, "PUBLIC_SUPABASE_URL"),
    publicValue(ev, "PUBLIC_SUPABASE_ANON_KEY"),
    { accessToken: async () => data.session.access_token },
  );
  return {
    turnstileVerified: true as const,
    error: null,
    legalAccepted: await hasCurrentLegalAcceptance(userDb),
  };
}

export function sendMagicLinkWithTurnstile(
  ev: RequestEventBase,
  input: { email: string; next: string; turnstileToken: string },
) {
  return afterTurnstile(
    ev,
    input.turnstileToken,
    TURNSTILE_ACTIONS.magicLink,
    (auth) =>
      auth.signInWithOtp({
        email: input.email,
        options: {
          emailRedirectTo: authEmailConfirmUrl(ev, { next: input.next }),
          shouldCreateUser: false,
        },
      }),
  );
}

export function requestPasswordResetWithTurnstile(
  ev: RequestEventBase,
  input: { email: string; turnstileToken: string },
) {
  return afterTurnstile(
    ev,
    input.turnstileToken,
    TURNSTILE_ACTIONS.passwordReset,
    (auth) =>
      auth.resetPasswordForEmail(input.email, {
        redirectTo: authEmailConfirmUrl(ev, {
          next: "/perfil/contrasena?recovery=1",
        }),
      }),
  );
}

export function resendConfirmationWithTurnstile(
  ev: RequestEventBase,
  input: { email: string; turnstileToken: string; next?: string },
) {
  return afterTurnstile(
    ev,
    input.turnstileToken,
    TURNSTILE_ACTIONS.resendConfirmation,
    (auth) =>
      auth.resend({
        type: "signup",
        email: input.email,
        options: {
          emailRedirectTo: authEmailConfirmUrl(ev, {
            next: input.next ?? "/onboarding",
          }),
        },
      }),
  );
}
