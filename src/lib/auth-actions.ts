import {
  globalAction$,
  z,
  zod$,
  type RequestEventAction,
} from "@qwik.dev/router";
import { authCallbackUrl, safeInternalPath } from "./http";
import {
  googleAuthEnabled,
  facebookAuthEnabled,
  OAUTH_CONSENT_COOKIE,
  OAUTH_CONSENT_MAX_AGE_SECONDS,
  oauthConsentMarker,
} from "./auth-security";
import { logFailure } from "./log";
import {
  COMMUNITY_RULES_VERSION,
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  MINIMUM_ACCOUNT_AGE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "./legal";
import { createServerSupabase } from "./supabase";
import { startSocialOAuthWithServerSecret } from "./protected-auth";
import { normalizeHttpUrl } from "./url";
import { resolveLocale } from "./i18n";
import {
  readGoogleAuthNotice,
  type GoogleAuthDecision,
} from "./google-auth-consent";
import { createOAuthContext, OAUTH_CONTEXT_COOKIE } from "./oauth-context";

/**
 * Inicio al que vuelve el cierre de sesión. La marca hace que el inicio monte
 * `LocalDataCleanup`: el `onSubmit$` del header limpia el navegador sólo si
 * JavaScript llegó a correr, y sin esta segunda pasada los borradores, las
 * búsquedas y los guardados quedaban en un dispositivo compartido (D67).
 */
export const SIGNED_OUT_HOME = "/?sesion=cerrada";

/** Action global del header; cerrar sesión también invalida las cookies SSR. */
export const useSignOut = globalAction$(async (_data, ev) => {
  const db = createServerSupabase(ev);
  await db.auth.signOut();
  throw ev.redirect(302, SIGNED_OUT_HOME);
});

// Los esquemas van en IIFEs `@__PURE__` (igual que en `url.ts`): este módulo
// también llega al cliente por `SocialAuth`, y una llamada suelta de nivel
// superior a zod no se puede descartar por tree-shaking aunque el navegador
// nunca la use. En el servidor el valor es exactamente el mismo.
const oauthConsentFields = /* @__PURE__ */ (() => ({
  next: z.string().optional(),
  intent: z.enum(["login", "register"]).default("login"),
  age_confirmed: z.string().optional(),
  terms_accepted: z.string().optional(),
  privacy_acknowledged: z.string().optional(),
  community_rules_accepted: z.string().optional(),
  international_transfers_consented: z.string().optional(),
  google_auth_consented: z.string().optional(),
  google_notice_version: z.string().max(40).optional(),
  google_notice_hash: z.string().max(64).optional(),
}))();

export const socialSignInSchema = /* @__PURE__ */ (() =>
  z.object({
    provider: z.enum(["google", "facebook"]),
    ...oauthConsentFields,
  }))();

/** Todo proveedor pasa por el mismo consentimiento y endpoint Auth de Supabase. */
export async function startSocialSignIn(
  data: z.infer<typeof socialSignInSchema>,
  ev: RequestEventAction,
) {
  const provider = data.provider;
  const providerName = provider === "facebook" ? "Facebook" : "Google";
  const enabled =
    provider === "facebook"
      ? facebookAuthEnabled(ev.env.get("PUBLIC_FACEBOOK_AUTH_ENABLED"))
      : googleAuthEnabled(ev.env.get("PUBLIC_GOOGLE_AUTH_ENABLED"));
  if (!enabled) {
    return ev.fail(400, {
      message: `El acceso con ${providerName} todavía no está disponible.`,
    });
  }

  const registering = data.intent === "register";
  if (
    data.age_confirmed !== "si" ||
    data.privacy_acknowledged !== "si" ||
    data.international_transfers_consented !== "si"
  ) {
    return ev.fail(400, {
      message: `Antes de continuar con ${providerName}, confirmá la edad, el aviso de privacidad y el consentimiento para las transferencias internacionales.`,
    });
  }
  if (
    registering &&
    (data.terms_accepted !== "si" || data.community_rules_accepted !== "si")
  ) {
    return ev.fail(400, {
      message:
        "Confirmá la edad mínima y aceptá los documentos para continuar.",
    });
  }

  const next = safeInternalPath(data.next);
  let googleDecision: GoogleAuthDecision | undefined;
  if (provider === "google") {
    if (data.google_auth_consented !== "si") {
      return ev.fail(400, {
        message:
          "Para usar Google, aceptá su aviso opcional. También podés ingresar por correo.",
      });
    }
    // Re-read at POST time: stale forms cannot authorize a different notice,
    // and the DB timestamp prevents a callback from undoing a later withdrawal.
    const notice = await readGoogleAuthNotice(createServerSupabase(ev));
    if (!notice) {
      return ev.fail(503, {
        message:
          "El acceso con Google todavía no está disponible. Podés continuar por correo.",
      });
    }
    if (
      data.google_notice_version !== notice.version ||
      data.google_notice_hash !== notice.content_hash
    ) {
      return ev.fail(400, {
        message:
          "El aviso de Google cambió. Recargá la página y revisalo antes de continuar.",
      });
    }
    googleDecision = {
      version: notice.version,
      contentHash: notice.content_hash,
      startedAt: notice.issued_at,
      locale: resolveLocale(ev.locale()),
    };
  }
  const callback = new URL(authCallbackUrl(ev, { next }));
  const consentNonce = crypto.randomUUID();
  callback.searchParams.set("consent", consentNonce);
  callback.searchParams.set("intent", data.intent);
  const context = await createOAuthContext({
    nonce: consentNonce,
    provider,
    intent: data.intent,
    next,
    startedAt: googleDecision?.startedAt ?? new Date().toISOString(),
    ...(googleDecision ? { googleDecision } : {}),
  });
  const { data: oauth, error } = await startSocialOAuthWithServerSecret(
    ev,
    provider,
    callback.toString(),
  );

  if (error || !oauth.url) {
    if (error) logFailure({ scope: `auth/${provider}` }, error);
    return ev.fail(400, {
      message: `No pudimos iniciar el acceso con ${providerName}. Probá de nuevo.`,
    });
  }

  const target = normalizeHttpUrl(oauth.url);
  const configured = normalizeHttpUrl(ev.env.get("PUBLIC_SUPABASE_URL"));
  if (
    !target ||
    !configured ||
    new URL(target).origin !== new URL(configured).origin ||
    new URL(target).pathname !== "/auth/v1/authorize" ||
    new URL(target).searchParams.get("provider") !== provider ||
    new URL(target).searchParams.get("redirect_to") !== callback.toString()
  ) {
    logFailure(
      { scope: `auth/${provider}`, reason: "unexpected-redirect" },
      new Error("Supabase devolvió un destino OAuth inesperado."),
    );
    return ev.fail(500, {
      message: `No pudimos iniciar el acceso con ${providerName}. Probá de nuevo.`,
    });
  }

  ev.cookie.set(
    OAUTH_CONSENT_COOKIE,
    oauthConsentMarker(consentNonce, {
      terms: TERMS_VERSION,
      privacy: PRIVACY_VERSION,
      communityRules: COMMUNITY_RULES_VERSION,
      internationalTransfers: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
      minimumAge: MINIMUM_ACCOUNT_AGE,
    }),
    {
      path: "/auth/callback",
      maxAge: OAUTH_CONSENT_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: ev.url.protocol === "https:",
    },
  );

  ev.cookie.set(
    OAUTH_CONTEXT_COOKIE,
    encodeURIComponent(JSON.stringify(context)),
    {
      path: "/auth/callback",
      maxAge: OAUTH_CONSENT_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: ev.url.protocol === "https:",
    },
  );

  throw ev.redirect(302, target);
}

export const useSocialSignIn = globalAction$(
  async (data, ev) => startSocialSignIn(data, ev),
  zod$(socialSignInSchema),
);

/** Conserva los formularios existentes que todavía no envían provider. */
export const useGoogleSignIn = globalAction$(
  async (data, ev) => startSocialSignIn({ ...data, provider: "google" }, ev),
  zod$(oauthConsentFields),
);
