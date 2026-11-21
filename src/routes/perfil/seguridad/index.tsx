import { component$, useComputed$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import {
  Alert,
  Badge,
  ButtonLink,
  buttonClass,
  Card,
  Field,
  Input,
  PasswordInput,
  Select,
  SubmitButton,
} from "~/components/ui";
import { postedText } from "~/components/forms/posted-fields";
import { pendingTotpForRetry } from "~/lib/pending-totp";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { MAX_PASSWORD_LENGTH } from "~/lib/auth-security";
import { APP_NAME } from "~/lib/constants";
import { isUuid } from "~/lib/http";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import {
  isCurrentAal2,
  isSafeTotpEnrollment,
  MAX_TOTP_FACTORS,
  mfaDestination,
  verifiedTotpFactors,
} from "~/lib/mfa";
import { requireUser, supabase } from "~/lib/session";
import { createAdminSupabase } from "~/lib/supabase";
import { verifyPasswordCredential } from "~/lib/protected-auth";
import { useLocaleLoader } from "../../layout";

const MFA_UNAVAILABLE =
  "No pudimos verificar la seguridad de tu cuenta. Probá de nuevo.";

export const onRequest: RequestHandler = (ev) => {
  // Esta ruta puede contener el secreto TOTP durante el alta. Ni navegadores
  // compartidos ni CDNs deben conservar una copia de la respuesta.
  ev.headers.set("Cache-Control", "private, no-store");
  ev.headers.set("Pragma", "no-cache");
};

export const useSecurity = routeLoader$(async (ev) => {
  const viewer = await requireUser(ev);
  const db = supabase(ev);

  const factorsResult = await db.auth.mfa.listFactors();
  const assuranceResult = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (factorsResult.error || assuranceResult.error) {
    logFailure(
      { scope: "perfil/seguridad-estado", userId: viewer.userId },
      factorsResult.error ?? assuranceResult.error,
    );
    throw ev.error(503, translate(resolveLocale(ev.locale()), MFA_UNAVAILABLE));
  }

  const allFactors = factorsResult.data.all;
  const verifiedTotp = verifiedTotpFactors(allFactors);
  return {
    roleRequiresMfa: viewer.isModerator,
    currentLevel: assuranceResult.data.currentLevel,
    nextLevel: assuranceResult.data.nextLevel,
    factors: allFactors.map((factor) => ({
      id: factor.id,
      type: factor.factor_type,
      status: factor.status,
      friendlyName: factor.friendly_name ?? null,
      createdAt: factor.created_at,
    })),
    verifiedTotp: verifiedTotp.map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
    })),
    canEnroll:
      verifiedTotp.length < MAX_TOTP_FACTORS &&
      (verifiedTotp.length === 0 ||
        isCurrentAal2(assuranceResult.data.currentLevel)),
  };
});

export const useStartTotpEnrollment = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);
    const factorsResult = await db.auth.mfa.listFactors();
    if (factorsResult.error) {
      logFailure(
        { scope: "perfil/seguridad-enrollment-lista", userId: viewer.userId },
        factorsResult.error,
      );
      return ev.fail(400, { message: MFA_UNAVAILABLE });
    }

    const verified = verifiedTotpFactors(factorsResult.data.all);
    if (verified.length >= MAX_TOTP_FACTORS) {
      return ev.fail(400, {
        message: "Ya alcanzaste el máximo de factores permitidos.",
      });
    }

    if (!data.current_password) {
      return ev.fail(400, {
        message: "Escribí tu contraseña actual para registrar el factor.",
        field: "current_password" as const,
      });
    }

    // La contraseña se comprueba en un cliente aislado: no reemplaza la cookie
    // de la sesión real (que puede estar en AAL2 para agregar un respaldo).
    const { data: currentUserResult, error: currentUserError } =
      await db.auth.getUser();
    const currentUser = currentUserResult.user;
    if (currentUserError || !currentUser?.email) {
      if (currentUserError) {
        logFailure(
          { scope: "perfil/seguridad-step-up-usuario", userId: viewer.userId },
          currentUserError,
        );
      }
      return ev.fail(400, { message: "No pudimos confirmar tu identidad." });
    }

    const sameUser = await verifyPasswordCredential(ev, {
      email: currentUser.email,
      password: data.current_password,
      expectedUserId: viewer.userId,
    });
    if (!sameUser) {
      return ev.fail(400, {
        message: "No pudimos confirmar tu identidad.",
        field: "current_password" as const,
      });
    }

    // Una sesión AAL1 que ya tiene un factor no puede agregar otro para
    // apropiarse de la cuenta: primero debe demostrar acceso al existente.
    if (verified.length > 0) {
      const assuranceResult =
        await db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (
        assuranceResult.error ||
        !isCurrentAal2(assuranceResult.data.currentLevel)
      ) {
        if (assuranceResult.error) {
          logFailure(
            {
              scope: "perfil/seguridad-enrollment-nivel",
              userId: viewer.userId,
            },
            assuranceResult.error,
          );
        }
        return ev.fail(400, {
          message:
            "Verificá primero uno de tus factores registrados antes de agregar otro.",
        });
      }
    }

    // Comenzar de nuevo requiere otro secreto: Supabase no lo vuelve a entregar.
    // Sólo retiramos factores TOTP propios y *no verificados*;
    // nunca ofrecemos ni ejecutamos aquí el borrado de un factor verificado.
    const pending = factorsResult.data.all.filter(
      (factor) =>
        factor.factor_type === "totp" && factor.status === "unverified",
    );
    for (const factor of pending) {
      const { error } = await db.auth.mfa.unenroll({ factorId: factor.id });
      if (error) {
        logFailure(
          {
            scope: "perfil/seguridad-enrollment-limpiar",
            userId: viewer.userId,
          },
          error,
        );
        return ev.fail(400, { message: MFA_UNAVAILABLE });
      }
    }

    const { data: enrolled, error } = await db.auth.mfa.enroll({
      factorType: "totp",
      issuer: APP_NAME,
      friendlyName:
        verified.length === 0
          ? APP_NAME + " · principal"
          : APP_NAME + " · respaldo",
    });
    if (error || !enrolled || !isSafeTotpEnrollment(enrolled)) {
      if (error) {
        logFailure(
          { scope: "perfil/seguridad-enrollment", userId: viewer.userId },
          error,
        );
      } else {
        logFailure(
          {
            scope: "perfil/seguridad-enrollment-respuesta",
            userId: viewer.userId,
          },
          new Error("Supabase devolvió un enrollment TOTP inválido."),
        );
      }
      if (enrolled?.id && isUuid(enrolled.id)) {
        // Es el factor no verificado que acabamos de crear; limpiarlo evita
        // consumir el cupo sin haber mostrado un secreto utilizable.
        await db.auth.mfa.unenroll({ factorId: enrolled.id });
      }
      return ev.fail(400, { message: MFA_UNAVAILABLE });
    }

    const { data: authorized, error: authorizationError } =
      await createAdminSupabase(ev).rpc("authorize_mfa_enrollment", {
        p_user: viewer.userId,
        p_factor: enrolled.id,
      });
    if (authorizationError || authorized !== true) {
      if (authorizationError) {
        logFailure(
          {
            scope: "perfil/seguridad-enrollment-ticket",
            userId: viewer.userId,
          },
          authorizationError,
        );
      }
      await db.auth.mfa.unenroll({ factorId: enrolled.id });
      return ev.fail(400, { message: MFA_UNAVAILABLE });
    }

    return {
      enrollment: {
        factorId: enrolled.id,
        qrCode: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      },
      next: mfaDestination(data.next),
    };
  },
  zod$({
    current_password: z
      .string()
      .max(MAX_PASSWORD_LENGTH, "La contraseña es demasiado larga.")
      .optional(),
    next: z.string().max(2048).optional(),
  }),
);

export const useVerifyTotp = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);
    const factorsResult = await db.auth.mfa.listFactors();
    if (factorsResult.error) {
      logFailure(
        { scope: "perfil/seguridad-verificar-lista", userId: viewer.userId },
        factorsResult.error,
      );
      return ev.fail(400, { message: MFA_UNAVAILABLE });
    }

    // El ID oculto no es autoridad. Antes de desafiarlo comprobamos del lado
    // servidor que pertenece a la sesión y que es exactamente un factor TOTP.
    const factor = factorsResult.data.all.find(
      (candidate) =>
        candidate.id === data.factor_id && candidate.factor_type === "totp",
    );
    if (!factor) {
      return ev.fail(400, { message: "El código no pudo verificarse." });
    }
    const wasUnverified = factor.status === "unverified";

    const { error } = await db.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: data.code,
    });
    if (error) {
      // No distinguimos código erróneo, challenge vencido ni rate limit: la
      // respuesta no debe ayudar a automatizar intentos contra el TOTP.
      logFailure(
        { scope: "perfil/seguridad-verificar", userId: viewer.userId },
        error,
      );
      return ev.fail(400, { message: "El código no pudo verificarse." });
    }

    if (wasUnverified) {
      const { data: approved, error: approvalError } =
        await createAdminSupabase(ev).rpc("approve_mfa_enrollment", {
          p_user: viewer.userId,
          p_factor: factor.id,
        });
      if (approvalError || approved !== true) {
        if (approvalError) {
          logFailure(
            {
              scope: "perfil/seguridad-enrollment-aprobar",
              userId: viewer.userId,
            },
            approvalError,
          );
        }
        return ev.fail(400, { message: MFA_UNAVAILABLE });
      }
    }

    const assuranceResult = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      assuranceResult.error ||
      !isCurrentAal2(assuranceResult.data.currentLevel)
    ) {
      if (assuranceResult.error) {
        logFailure(
          { scope: "perfil/seguridad-verificar-nivel", userId: viewer.userId },
          assuranceResult.error,
        );
      }
      return ev.fail(400, { message: MFA_UNAVAILABLE });
    }

    if (viewer.isModerator) {
      const { data: privileged, error: privilegeError } = await db.rpc(
        "is_moderator",
        { p_user: viewer.userId },
      );
      if (privilegeError || privileged !== true) {
        if (privilegeError) {
          logFailure(
            {
              scope: "perfil/seguridad-factor-privilegiado",
              userId: viewer.userId,
            },
            privilegeError,
          );
        }
        return ev.fail(400, {
          message:
            "Este factor no está autorizado para moderación. Usá el procedimiento de recuperación del equipo.",
        });
      }
    }

    throw ev.redirect(303, mfaDestination(data.next));
  },
  zod$({
    factor_id: z.string().uuid(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Escribí los 6 números de tu aplicación."),
    next: z.string().max(2048).optional(),
  }),
);

export default component$(() => {
  const security = useSecurity();
  const start = useStartTotpEnrollment();
  const verify = useVerifyTotp();
  const location = useLocation();
  const locale = useLocale();
  const next = useComputed$(() =>
    mfaDestination(
      postedText(
        verify.formData,
        "next",
        location.url.searchParams.get("next") ?? "",
      ),
    ),
  );
  const pendingRetry = useComputed$(() =>
    pendingTotpForRetry(
      security.value.factors,
      verify.formData?.get("factor_id"),
    ),
  );
  const currentAal2 = isCurrentAal2(security.value.currentLevel);
  const verifiedNow =
    location.url.searchParams.get("verified") === "1" && currentAal2;
  const approvalRequired =
    location.url.searchParams.get("approval") === "required";
  const codeError = verify.value?.fieldErrors?.code;
  const startField =
    start.value && "field" in start.value ? start.value.field : null;
  const currentPasswordError =
    startField === "current_password"
      ? start.value?.message
      : start.value?.fieldErrors?.current_password;

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
          {translate(locale, "Seguridad en dos pasos")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Usá una aplicación autenticadora para proteger las acciones sensibles de tu cuenta.",
          )}
        </p>
      </header>

      {verifiedNow && (
        <Alert tone="success" class="mb-4">
          {translate(locale, "La sesión quedó verificada en dos pasos.")}
        </Alert>
      )}
      {approvalRequired && (
        <Alert tone="warn" class="mb-4">
          {translate(
            locale,
            "El factor usado no está autorizado para moderación. Usá el procedimiento de recuperación del equipo.",
          )}
        </Alert>
      )}
      {security.value.roleRequiresMfa && !currentAal2 && (
        <Alert tone="warn" class="mb-4">
          {translate(
            locale,
            "Tu rol de moderación exige verificar esta sesión en dos pasos antes de continuar.",
          )}
        </Alert>
      )}
      {!security.value.roleRequiresMfa && (
        <Alert tone="brand" class="mb-4">
          {translate(
            locale,
            "Para tu cuenta es opcional. Si lo activás, vas a poder verificar sesiones sensibles con un código temporal.",
          )}
        </Alert>
      )}

      <Card class="p-6 sm:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">{translate(locale, "Sesión actual")}</h2>
            <p class="mt-1 text-sm text-ink-muted">
              {translate(
                locale,
                currentAal2
                  ? "Ya presentaste un segundo factor en esta sesión."
                  : "Esta sesión todavía tiene un solo factor verificado.",
              )}
            </p>
          </div>
          <Badge tone={currentAal2 ? "success" : "warn"}>
            {translate(
              locale,
              // Sin la sigla del estándar (AAL1, AAL2): no le dice nada a
              // quien no lo conoce y el texto de al lado ya lo explica.
              currentAal2 ? "Dos pasos" : "Un paso",
            )}
          </Badge>
        </div>
      </Card>

      <Card class="mt-4 p-6 sm:p-8">
        <h2 class="font-semibold">{translate(locale, "Tus factores")}</h2>
        {security.value.factors.length === 0 ? (
          <p class="mt-2 text-sm text-ink-muted">
            {translate(locale, "Todavía no registraste un autenticador.")}
          </p>
        ) : (
          <ul class="mt-3 divide-y divide-subtle">
            {security.value.factors.map((factor) => (
              <li
                key={factor.id}
                class="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div class="min-w-0">
                  <p class="font-medium">
                    <bdi dir="auto">
                      {factor.friendlyName ??
                        translate(locale, "Aplicación autenticadora")}
                    </bdi>
                  </p>
                  <p class="mt-1 text-xs text-ink-muted">
                    {translate(locale, "Registrado")}{" "}
                    <RelativeTime value={factor.createdAt} /> ·{" "}
                    {factor.type.toUpperCase()}
                  </p>
                </div>
                <Badge tone={factor.status === "verified" ? "success" : "warn"}>
                  {translate(
                    locale,
                    factor.status === "verified" ? "Verificado" : "Pendiente",
                  )}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {verify.value?.message && (
        <Alert class="mt-4">{translate(locale, verify.value.message)}</Alert>
      )}
      {start.value?.message && startField !== "current_password" && (
        <Alert class="mt-4">{translate(locale, start.value.message)}</Alert>
      )}

      {!currentAal2 && security.value.verifiedTotp.length > 0 && (
        <Card class="mt-4 p-6 sm:p-8">
          <h2 class="font-semibold">
            {translate(locale, "Verificá esta sesión")}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Abrí tu aplicación autenticadora y escribí el código actual.",
            )}
          </p>
          {/* Verificar un factor cambia el JWT de AAL1 a AAL2. La navegación
              completa evita mezclar loaders iniciados con claims distintos. */}
          <Form action={verify} reloadDocument class="mt-4 space-y-4">
            <Field label="Factor" name="factor_id" required>
              <Select name="factor_id" required>
                {security.value.verifiedTotp.map((factor, index) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendlyName ??
                      translate(locale, "Autenticador") + " " + (index + 1)}
                  </option>
                ))}
              </Select>
            </Field>
            <TotpCodeField error={codeError} />
            <input type="hidden" name="next" value={next.value} />
            <SubmitButton pending={verify.isRunning}>
              {translate(locale, "Verificar y continuar")}
            </SubmitButton>
          </Form>
        </Card>
      )}

      {start.value?.enrollment ? (
        <Card class="mt-4 p-6 sm:p-8">
          <h2 class="font-semibold">
            {translate(locale, "Configurá el autenticador")}
          </h2>
          <ol class="mt-3 list-decimal space-y-3 pl-5 text-sm text-ink-muted">
            <li>
              {translate(
                locale,
                "Escaneá este QR con tu aplicación autenticadora.",
              )}
            </li>
            <li>
              {translate(
                locale,
                "Guardá el secreto en un lugar seguro por si necesitás configurarlo manualmente.",
              )}
            </li>
            <li>
              {translate(
                locale,
                "Escribí el código de 6 números para terminar el alta.",
              )}
            </li>
          </ol>
          <div class="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <img
              src={start.value.enrollment.qrCode}
              width={224}
              height={224}
              alt={translate(locale, "Código QR del autenticador")}
              class="size-56 shrink-0 rounded-xl bg-white p-3"
            />
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {translate(locale, "Secreto manual")}
              </p>
              <code
                dir="ltr"
                class="mt-2 block break-all rounded-xl bg-inset p-3 font-mono text-sm text-ink-strong"
              >
                {start.value.enrollment.secret}
              </code>
              <p class="mt-2 text-xs text-ink-muted">
                {translate(
                  locale,
                  "No lo compartas: permite generar tus códigos temporales.",
                )}
              </p>
            </div>
          </div>
          <Form action={verify} reloadDocument class="mt-5 space-y-4">
            <input
              type="hidden"
              name="factor_id"
              value={start.value.enrollment.factorId}
            />
            <input type="hidden" name="next" value={start.value.next} />
            <TotpCodeField error={codeError} />
            <SubmitButton pending={verify.isRunning}>
              {translate(locale, "Activar segundo factor")}
            </SubmitButton>
          </Form>
        </Card>
      ) : pendingRetry.value ? (
        <Card class="mt-4 p-6 sm:p-8">
          <h2 class="font-semibold">
            {translate(locale, "Terminá de activar tu autenticador")}
          </h2>
          <p class="mt-2 text-sm text-ink-muted">
            {translate(
              locale,
              "Usá el código actual de la aplicación que configuraste. El secreto no vuelve a mostrarse.",
            )}
          </p>
          <Form action={verify} reloadDocument class="mt-5 space-y-4">
            <input type="hidden" name="factor_id" value={pendingRetry.value} />
            <input type="hidden" name="next" value={next.value} />
            <TotpCodeField error={codeError} />
            <SubmitButton pending={verify.isRunning}>
              {translate(locale, "Activar segundo factor")}
            </SubmitButton>
          </Form>
        </Card>
      ) : (
        security.value.canEnroll && (
          <Card class="mt-4 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8">
            <div class="min-w-0">
              <h2 class="font-semibold">
                {translate(
                  locale,
                  security.value.verifiedTotp.length === 0
                    ? "Activá un segundo factor"
                    : "Agregá un factor de respaldo",
                )}
              </h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Necesitás una aplicación compatible con códigos TOTP, como Google Authenticator, 1Password o Aegis.",
                )}
              </p>
            </div>
            <Form action={start} class="w-full space-y-4 sm:w-auto">
              <Field
                label="Contraseña actual"
                name="current_password"
                hint="La comprobamos otra vez antes de mostrar el secreto TOTP."
                error={currentPasswordError}
                required
              >
                <PasswordInput
                  name="current_password"
                  autocomplete="current-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                  enterKeyHint="done"
                  required
                />
              </Field>
              <input type="hidden" name="next" value={next.value} />
              <SubmitButton
                variant="secondary"
                pending={start.isRunning}
                class="shrink-0"
              >
                {translate(locale, "Empezar configuración")}
              </SubmitButton>
              <p class="text-xs text-ink-muted">
                {translate(
                  locale,
                  "Si tu cuenta todavía no tiene contraseña, definí una primero desde el perfil y volvé acá.",
                )}{" "}
                <Link
                  href="/perfil/contrasena"
                  class="font-medium text-brand hover:underline"
                >
                  {translate(locale, "Definir contraseña")}
                </Link>
              </p>
            </Form>
          </Card>
        )
      )}

      <Card class="mt-4 p-6 sm:p-8">
        <h2 class="font-semibold">
          {translate(locale, "Recuperación y cambios")}
        </h2>
        <p class="mt-2 text-sm text-ink-muted">
          {translate(
            locale,
            "Por seguridad, Agorbis no permite eliminar desde acá un factor verificado. Si perdés todos tus autenticadores, el soporte debe validar tu identidad y hacer la recuperación desde Supabase.",
          )}
        </p>
        {currentAal2 && next.value !== "/perfil/seguridad/?verified=1" && (
          <ButtonLink href={next.value} class="mt-4" size="sm">
            {translate(locale, "Continuar")}
          </ButtonLink>
        )}
      </Card>

      {/* La "bóveda" anterior descargaba un JSON fijo como si fueran tus datos
          y afirmaba garantías de cifrado y disociación que no son ciertas
          (D68). La exportación real es /perfil/datos. */}
      <Card class="mt-4 p-6 sm:p-8">
        <h2 class="font-semibold">{translate(locale, "Tus datos")}</h2>
        <p class="mt-4">
          {/* Sin `download`: el servidor ya manda `Content-Disposition` y, si
          pide volver a identificarse o responde un límite, la persona tiene
          que ver esa página, no guardarla como archivo. */}
          <a href="/perfil/datos" class={buttonClass("secondary", "sm")}>
            {translate(locale, "Descargar mis datos")}
          </a>
        </p>
      </Card>
    </div>
  );
});

const TotpCodeField = component$<{ error?: string | string[] }>(({ error }) => (
  <Field
    label="Código temporal"
    name="code"
    hint="Son los 6 números que cambian cada 30 segundos."
    error={error}
    required
  >
    <Input
      name="code"
      type="text"
      inputMode="numeric"
      autocomplete="one-time-code"
      pattern="[0-9]{6}"
      minLength={6}
      maxLength={6}
      enterKeyHint="done"
      dir="ltr"
      required
    />
  </Field>
));

export const head: DocumentHead = ({ resolveValue }) => ({
  title:
    translate(resolveValue(useLocaleLoader), "Seguridad en dos pasos") +
    " · " +
    APP_NAME,
  meta: [{ name: "robots", content: "noindex" }],
});
