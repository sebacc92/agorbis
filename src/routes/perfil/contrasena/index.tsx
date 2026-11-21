import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Alert,
  ButtonLink,
  Card,
  Field,
  Input,
  PasswordInput,
  SubmitButton,
} from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import {
  isAuthEmailRateLimit,
  isPlausibleReauthenticationNonce,
  MAX_REAUTHENTICATION_NONCE_LENGTH,
  MIN_REAUTHENTICATION_NONCE_LENGTH,
  passwordReauthenticationError,
} from "~/lib/auth-reauthentication";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  strongPasswordSchema,
} from "~/lib/auth-security";
import { useLocale, translate } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { verifyPasswordCredential } from "~/lib/protected-auth";
import { isCurrentAal2, moderatorMfaUrl, verifiedTotpFactors } from "~/lib/mfa";
import {
  currentSessionRecentlyAuthenticated,
  requireUser,
  supabase,
} from "~/lib/session";
import { useLocaleLoader } from "../../layout";

/**
 * Ventana de "recién te identificaste".
 *
 * Sin esto habría que elegir entre dos males: pedir siempre la contraseña
 * actual —y dejar afuera para siempre a quien entra por enlace de acceso y
 * nunca tuvo una— o no pedir nada, y que cualquiera con una sesión abierta
 * ajena se apropie de la cuenta cambiándola. La tercera opción es la que usa
 * todo el mundo: si te identificaste hace un momento, ya demostraste ser vos.
 */
export const usePasswordContext = routeLoader$(async (ev) => {
  await requireUser(ev);
  const db = supabase(ev);
  const { data } = await db.auth.getUser();
  return {
    email: data.user?.email ?? "",
    recentlySignedIn: await currentSessionRecentlyAuthenticated(db),
  };
});

export const useChangePassword = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);

    const { data: userData } = await db.auth.getUser();
    const user = userData.user;
    if (!user?.email) {
      return ev.fail(400, { message: "No pudimos identificar tu cuenta." });
    }

    if (data.password !== data.confirm) {
      return ev.fail(400, {
        message: "Las dos contraseñas nuevas no coinciden.",
        field: "confirm" as const,
      });
    }

    // Una contraseña es opaca: espacios iniciales/finales pueden formar parte
    // de ella y no se deben normalizar al verificarla.
    const current = data.current;
    if (!current) {
      const recent = await currentSessionRecentlyAuthenticated(db);
      if (!recent) {
        return ev.fail(400, {
          message:
            "Escribí tu contraseña actual. Si nunca definiste una, pedí un enlace de acceso desde Ingresar y volvé acá apenas entres.",
          field: "current" as const,
        });
      }
    } else {
      // Se comprueba acá, en un cliente sin cookies, como en la baja de la
      // cuenta: GoTrue sólo mira `current_password` si el proyecto tiene
      // activado "Require current password", y eso es una atestación manual
      // del preflight, no algo que el código pueda dar por hecho.
      const sameUser = await verifyPasswordCredential(ev, {
        email: user.email,
        password: current,
        expectedUserId: viewer.userId,
      });
      if (!sameUser) {
        return ev.fail(400, {
          message: "La contraseña actual no coincide.",
          field: "current" as const,
        });
      }
    }

    // Si la cuenta eligió MFA, cambiar su credencial primaria también exige
    // el segundo factor aprobado de esta sesión. Esto cubre tanto el cambio
    // ordinario como una recuperación iniciada desde el correo.
    const [factorsResult, assuranceResult] = await Promise.all([
      db.auth.mfa.listFactors(),
      db.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsResult.error || assuranceResult.error) {
      logFailure(
        { scope: "perfil/contrasena-mfa", userId: user.id },
        factorsResult.error ?? assuranceResult.error,
      );
      return ev.fail(503, {
        message:
          "No pudimos verificar la seguridad de tu sesión. La contraseña no cambió.",
      });
    }
    if (verifiedTotpFactors(factorsResult.data.all).length > 0) {
      const next =
        ev.url.searchParams.get("recovery") === "1"
          ? "/perfil/contrasena?recovery=1"
          : "/perfil/contrasena";
      if (!isCurrentAal2(assuranceResult.data.currentLevel)) {
        throw ev.redirect(303, moderatorMfaUrl(next));
      }
      const { data: approved, error: approvalError } = await db.rpc(
        "current_session_uses_approved_factor",
      );
      if (approvalError || approved !== true) {
        if (approvalError) {
          logFailure(
            { scope: "perfil/contrasena-factor-aprobado", userId: user.id },
            approvalError,
          );
        }
        throw ev.redirect(303, `${moderatorMfaUrl(next)}&approval=required`);
      }
    }

    const nonce = data.nonce?.trim() || undefined;
    const { error } = await db.auth.updateUser({
      password: data.password,
      // Supabase compara la credencial en el mismo endpoint que aplica el
      // cambio. Evita crear otra sesión y respeta `Require current password`.
      ...(current ? { current_password: current } : {}),
      ...(nonce ? { nonce } : {}),
    });
    if (error) {
      const reauthentication = passwordReauthenticationError(error);
      if (reauthentication === "required") {
        const { error: sendError } = await db.auth.reauthenticate();
        if (sendError && !isAuthEmailRateLimit(sendError)) {
          logFailure(
            { scope: "perfil/contrasena-reauth", userId: user.id },
            sendError,
          );
          return ev.fail(503, {
            message:
              "No pudimos enviar el código de seguridad. La contraseña no cambió; probá de nuevo en un momento.",
          });
        }

        return ev.fail(sendError ? 429 : 409, {
          message: sendError
            ? "Todavía no podemos enviar otro código. Usá el más reciente o esperá un momento y volvé a intentar."
            : "Como esta sesión tiene más de 24 horas, te enviamos un código de seguridad. Escribilo para completar el cambio.",
          reauthenticationRequired: true as const,
        });
      }
      if (reauthentication === "invalid") {
        const { error: resendError } = await db.auth.reauthenticate();
        if (resendError && !isAuthEmailRateLimit(resendError)) {
          logFailure(
            { scope: "perfil/contrasena-reauth-reenvio", userId: user.id },
            resendError,
          );
        }
        return ev.fail(resendError ? 400 : 409, {
          message: !resendError
            ? "El código no era válido o venció. Te enviamos uno nuevo; usá siempre el más reciente."
            : isAuthEmailRateLimit(resendError)
              ? "El código no es válido o venció y todavía no podemos enviar otro. Esperá un momento y volvé a intentar."
              : "El código no es válido o venció y no pudimos enviar otro. Probá de nuevo en un momento.",
          field: "nonce" as const,
          reauthenticationRequired: true as const,
        });
      }
      if (
        current &&
        (Reflect.get(error, "code") === "invalid_credentials" ||
          /current password|contrase(?:ñ|n)a actual/i.test(error.message))
      ) {
        return ev.fail(400, {
          message: "La contraseña actual no coincide.",
          field: "current" as const,
        });
      }
      // Con "Require current password" activo en Supabase, GoTrue la exige a
      // toda cuenta con contraseña, también en una sesión reciente. Antes caía
      // en "no cumple los requisitos mínimos" sobre el campo equivocado.
      if (
        Reflect.get(error, "code") === "current_password_required" ||
        /current password required/i.test(error.message)
      ) {
        return ev.fail(400, {
          message: "Escribí tu contraseña actual para poder cambiarla.",
          field: "current" as const,
        });
      }
      return ev.fail(400, {
        message: /weak|short|password/i.test(error.message)
          ? "La contraseña no cumple los requisitos mínimos."
          : "No pudimos guardar la contraseña. Probá de nuevo.",
        field: "password" as const,
      });
    }

    let { error: revokeError } = await db.auth.signOut({ scope: "others" });
    if (revokeError) {
      logFailure(
        { scope: "perfil/contrasena-revocar-primer-intento", userId: user.id },
        revokeError,
      );
      // Un fallo transitorio no deja sesiones viejas vivas por un solo intento.
      ({ error: revokeError } = await db.auth.signOut({ scope: "others" }));
    }
    if (revokeError) {
      logFailure(
        { scope: "perfil/contrasena-revocar-reintento", userId: user.id },
        revokeError,
      );
      // Si ni el reintento selectivo funciona, cerramos globalmente. El SDK
      // elimina además la cookie local aunque Auth devuelva un error; por eso
      // la persona vuelve al login y el incidente queda visible en logs.
      const { error: globalRevokeError } = await db.auth.signOut({
        scope: "global",
      });
      if (globalRevokeError) {
        logFailure(
          { scope: "perfil/contrasena-revocar-global", userId: user.id },
          globalRevokeError,
        );
      }
      throw ev.redirect(
        303,
        `/ingresar?password_changed=1&revocation=${globalRevokeError ? "pending" : "complete"}`,
      );
    }

    return { saved: true as const };
  },
  zod$({
    current: z.string().max(MAX_PASSWORD_LENGTH).optional(),
    nonce: z
      .string()
      .trim()
      .max(MAX_REAUTHENTICATION_NONCE_LENGTH)
      .refine(
        (value) => value === "" || isPlausibleReauthenticationNonce(value),
        "Escribí el código numérico completo.",
      )
      .optional(),
    password: strongPasswordSchema,
    confirm: z
      .string()
      .min(1, "Repetí la contraseña nueva.")
      .max(MAX_PASSWORD_LENGTH),
  }),
);

export default component$(() => {
  const context = usePasswordContext();
  const change = useChangePassword();
  const locale = useLocale();
  const location = useLocation();
  const actionField =
    change.value && "field" in change.value ? change.value.field : null;
  const currentError =
    actionField === "current"
      ? change.value?.message
      : change.value?.fieldErrors?.current;
  const passwordError =
    actionField === "password"
      ? change.value?.message
      : change.value?.fieldErrors?.password;
  const confirmError =
    actionField === "confirm"
      ? change.value?.message
      : change.value?.fieldErrors?.confirm;
  const nonceError =
    actionField === "nonce"
      ? change.value?.message
      : change.value?.fieldErrors?.nonce;
  const reauthenticationRequired =
    !!change.value &&
    "reauthenticationRequired" in change.value &&
    change.value.reauthenticationRequired === true;

  return (
    <div class="container-reading py-8 sm:py-12">
      <header class="mb-6">
        <Link
          href="/perfil"
          class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          ← {translate(locale, "Volver a mi perfil")}
        </Link>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight">
          {translate(locale, "Tu contraseña")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Agregá una contraseña como otra forma de ingresar, o cambiá la que ya usás.",
          )}
        </p>
      </header>

      <Card class="p-6 sm:p-8">
        {location.url.searchParams.get("recovery") === "1" &&
          !change.value?.saved && (
            <Alert tone="success" class="mb-4">
              {translate(
                locale,
                "El enlace fue validado. Elegí ahora una contraseña nueva.",
              )}
            </Alert>
          )}
        {change.value?.saved ? (
          <div class="space-y-5">
            <Alert tone="success">
              {translate(
                locale,
                "Listo: tu contraseña quedó guardada. Ya podés usarla para ingresar.",
              )}
            </Alert>
            <ButtonLink href="/perfil" size="lg" class="w-full">
              {translate(locale, "Volver a mi perfil")}
            </ButtonLink>
          </div>
        ) : (
          <Form action={change} class="space-y-5">
            {change.value?.message && (
              <Alert
                tone={
                  reauthenticationRequired && actionField !== "nonce"
                    ? "brand"
                    : "danger"
                }
              >
                {translate(locale, change.value.message)}
              </Alert>
            )}

            <Field
              label="Contraseña actual"
              name="current"
              hint={
                context.value.recentlySignedIn
                  ? "Si tu cuenta tiene contraseña, escribila. Si entraste por enlace y nunca definiste una, dejala vacía."
                  : "Necesaria para confirmar que sos vos."
              }
              error={currentError}
            >
              <PasswordInput
                name="current"
                autocomplete="current-password"
                enterKeyHint="next"
                invalid={!!currentError}
              />
            </Field>

            {reauthenticationRequired && (
              <Field
                label="Código de seguridad"
                name="nonce"
                hint="Es el código numérico de un solo uso que Agorbis envió a tu correo."
                error={nonceError}
                required
              >
                <Input
                  name="nonce"
                  type="text"
                  inputMode="numeric"
                  autocomplete="one-time-code"
                  pattern={`[0-9]{${MIN_REAUTHENTICATION_NONCE_LENGTH},${MAX_REAUTHENTICATION_NONCE_LENGTH}}`}
                  minLength={MIN_REAUTHENTICATION_NONCE_LENGTH}
                  maxLength={MAX_REAUTHENTICATION_NONCE_LENGTH}
                  enterKeyHint="next"
                  dir="ltr"
                  required
                  invalid={!!nonceError}
                />
              </Field>
            )}

            <Field
              label="Contraseña nueva"
              name="password"
              required
              hint="Al menos 12 caracteres, con letras y números."
              error={passwordError}
            >
              <PasswordInput
                name="password"
                autocomplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
                enterKeyHint="next"
                invalid={!!passwordError}
              />
            </Field>

            <Field
              label="Repetí la contraseña nueva"
              name="confirm"
              required
              error={confirmError}
            >
              <PasswordInput
                name="confirm"
                autocomplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
                enterKeyHint="done"
                invalid={!!confirmError}
              />
            </Field>

            <SubmitButton size="lg" class="w-full" pending={change.isRunning}>
              {translate(locale, "Guardar contraseña")}
            </SubmitButton>
          </Form>
        )}
      </Card>

      <p class="mt-5 text-sm leading-relaxed text-ink-muted">
        {translate(
          locale,
          "Al cambiar la contraseña, Agorbis revoca las demás sesiones abiertas.",
        )}
      </p>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Tu contraseña")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
