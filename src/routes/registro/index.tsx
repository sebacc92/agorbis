import {
  $,
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
  useStore,
  useComputed$,
} from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  zod$,
  z,
  type DocumentHead,
} from "@qwik.dev/router";
import { AuthShell } from "~/components/layout/AuthShell";
import { LegalConsentFields } from "~/components/auth/LegalConsentFields";
import { SocialAuth } from "~/components/auth/SocialAuth";
import {
  TurnstileGate,
  type TurnstileGateHandle,
} from "~/components/auth/TurnstileGate";
import {
  Icon,
  Alert,
  ButtonLink,
  ExternalLinkHint,
  Card,
  cx,
  Field,
  Input,
  PasswordInput,
  SubmitButton,
} from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { withAuthNext } from "~/lib/auth-navigation";
import { safeInternalPath } from "~/lib/http";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  strongPasswordSchema,
} from "~/lib/auth-security";
import { useLocale, translate } from "~/lib/i18n";
import { isAuthEmailRateLimit } from "~/lib/auth-reauthentication";
import { logFailure } from "~/lib/log";
import { signUpWithTurnstile } from "~/lib/protected-auth";
import { FACEBOOK_AUTH_ENABLED } from "~/lib/auth-security";
import { suggestEmailDomain } from "~/lib/email-typos";
import { webmailFor } from "~/lib/webmail";
import { TURNSTILE_ACTIONS, TURNSTILE_FAILURE_MESSAGE } from "~/lib/turnstile";
import { useLocaleLoader } from "../layout";
import { loadGoogleAuthNotice } from "~/lib/google-auth-consent";

export const useGoogleNotice = routeLoader$((ev) => loadGoogleAuthNotice(ev));

export const useSignUp = routeAction$(
  async (data, ev) => {
    const attempt = await signUpWithTurnstile(ev, {
      email: data.email,
      password: data.password,
      next: safeInternalPath(data.next, "/onboarding"),
      turnstileToken: data.turnstile_token,
    });
    if (!attempt.turnstileVerified) {
      return ev.fail(403, { message: TURNSTILE_FAILURE_MESSAGE });
    }
    const { data: result, error } = attempt.result;

    if (error) {
      logFailure({ scope: "auth/registro" }, error);
      // Una cuenta existente recibe la misma pantalla que una nueva: no se
      // puede usar el formulario para averiguar qué correos están registrados.
      // El límite de envío de correos aparece al repetir el alta de una cuenta
      // sin confirmar: contestarlo distinto que a una cuenta confirmada (que
      // GoTrue ofusca como éxito) permitía distinguirlas con dos envíos.
      if (
        isAuthEmailRateLimit(error) ||
        /already registered|already exists|user_already_exists/i.test(
          error.message,
        )
      ) {
        return { pendingConfirmation: true as const, email: data.email };
      }
      return ev.fail(400, {
        message: /password/i.test(error.message)
          ? "La contraseña no cumple los requisitos mínimos."
          : "No pudimos crear la cuenta. Probá de nuevo en un momento.",
      });
    }

    if (!result.session) {
      return { pendingConfirmation: true as const, email: data.email };
    }

    // La aceptación final sólo se registra con una identidad ya autenticada.
    // Persistirla antes de verificar el correo permitiría que un tercero
    // pre-registrara una dirección ajena y que una identidad OAuth enlazada
    // después heredara esa constancia. Incluso en entornos con autoconfirm se
    // completa mediante el gate autenticado.
    throw ev.redirect(
      302,
      withAuthNext(
        "/consentimiento",
        safeInternalPath(data.next, "/onboarding"),
      ),
    );
  },
  zod$(
    z
      .object({
        email: z.string().trim().toLowerCase().email("Escribí un mail válido."),
        password: strongPasswordSchema,
        next: z.string().max(2048).optional(),
        turnstile_token: z
          .string()
          .optional()
          .transform((value) => value ?? ""),
        legal_consent: z.string().optional(),
        international_transfers_consented: z
          .string()
          .optional()
          .refine((value) => value === "si", {
            message:
              "Para crear la cuenta, aceptá expresamente las transferencias internacionales necesarias.",
          }),
        age_confirmed: z.string().optional(),
        terms_accepted: z.string().optional(),
        privacy_acknowledged: z.string().optional(),
        community_rules_accepted: z.string().optional(),
      })
      .superRefine((data, ctx) => {
        const hasUnified = data.legal_consent === "si";
        const hasIndividual =
          data.age_confirmed === "si" &&
          data.terms_accepted === "si" &&
          data.privacy_acknowledged === "si" &&
          data.community_rules_accepted === "si";
        if (!hasUnified && !hasIndividual) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            // LegalConsentFields completa `{{count}}` con MINIMUM_ACCOUNT_AGE.
            message:
              "Confirmá que tenés {{count}} años o más y aceptá los Términos, Normas y Política de privacidad.",
            path: ["legal_consent"],
          });
        }
      }),
  ),
);

export default component$(() => {
  const googleNotice = useGoogleNotice();
  const signUp = useSignUp();
  const location = useLocation();
  const next = safeInternalPath(
    location.url.searchParams.get("next"),
    "/onboarding",
  );
  const locale = useLocale();
  const email = useSignal(signUp.formData?.get("email")?.toString() ?? "");
  // "gmial.com" crea una cuenta cuya confirmación no llega nunca (D121).
  const emailSuggestion = useComputed$(() => suggestEmailDomain(email.value));
  const password = useSignal("");
  const emailTransferConsent = useSignal(false);
  const socialSelected = useSignal(false);
  const focusTarget = useSignal<string>();
  // Tras un rechazo de Turnstile el widget se renueva solo y muestra
  // "¡Operación exitosa!": el aviso pasa a pedir otro intento en vez de
  // contradecirlo (02-11-2026, D108).
  const turnstileRenewed = useSignal(false);
  const signupGate = useStore<TurnstileGateHandle>({ status: "ssr" });
  const hasSocialOptions = googleNotice.value.enabled || FACEBOOK_AUTH_ENABLED;
  const turnstileRejected = signUp.value?.message === TURNSTILE_FAILURE_MESSAGE;
  // Espejo de `letters_digits` en GoTrue (D101): largo mínimo, una letra ASCII
  // y un dígito. Son los únicos requisitos. Largo extra, mayúsculas o símbolos
  // se recomiendan sin exigirse, y ninguna contraseña se califica de
  // "excelente": la UI sólo dice si cumple y si además es más fuerte.
  const hasMinLength = password.value.length >= MIN_PASSWORD_LENGTH;
  const hasLetter = /[A-Za-z]/.test(password.value);
  const hasNumber = /[0-9]/.test(password.value);
  const requirementsMet = [hasMinLength, hasLetter, hasNumber].filter(
    Boolean,
  ).length;
  const meetsRequirements = requirementsMet === 3;
  const isStronger =
    meetsRequirements &&
    (password.value.length >= 16 ||
      (/[a-z]/.test(password.value) && /[A-Z]/.test(password.value)) ||
      /[^A-Za-z0-9\s]/.test(password.value));

  const requirementsStatus = !meetsRequirements
    ? {
        label: "Todavía no cumple los requisitos",
        color: requirementsMet <= 1 ? "bg-rose-500" : "bg-amber-500",
        text:
          requirementsMet <= 1
            ? "text-rose-700 dark:text-rose-400"
            : "text-amber-700 dark:text-amber-400",
      }
    : isStronger
      ? {
          label: "Cumple los requisitos y es más fuerte",
          color: "bg-success-500",
          text: "text-success-700 dark:text-success-400",
        }
      : {
          label: "Cumple los requisitos",
          color: "bg-success-500",
          text: "text-success-700 dark:text-success-400",
        };
  const oauthError = location.url.searchParams.get("oauth_error");
  const oauthErrorMessage =
    oauthError === "consent"
      ? "No pudimos registrar tu decisión de Google. Revisá el aviso y volvé a intentarlo, o ingresá por correo."
      : oauthError === "cancelled"
        ? "Cancelaste el acceso. Podés elegir otra forma de continuar."
        : oauthError === "session"
          ? "No pudimos guardar una sesión segura. Probá de nuevo."
          : oauthError
            ? "No pudimos completar el acceso con ese proveedor. Probá de nuevo."
            : null;

  useTask$(({ track }) => {
    const result = track(() => signUp.value);
    turnstileRenewed.value = false;
    if (result?.fieldErrors?.email) {
      focusTarget.value = "email";
    } else if (result?.fieldErrors?.password) {
      focusTarget.value = "password";
    }
  });

  // El foco depende de que Qwik ya haya renderizado el campo correspondiente.
  // eslint-disable-next-line qwik/no-use-visible-task -- el foco va a un campo que recién se renderizó después de la acción
  useVisibleTask$(({ track }) => {
    const target = track(() => focusTarget.value);
    if (target) {
      document.getElementById(target)?.focus();
      focusTarget.value = undefined;
    }
  });

  return (
    <AuthShell
      welcome={!signUp.value?.pendingConfirmation}
      progress={signUp.value?.pendingConfirmation ? 1 : 0}
      title={
        signUp.value?.pendingConfirmation
          ? "Revisá tu correo"
          : "Creá tu cuenta"
      }
      subtitle={
        signUp.value?.pendingConfirmation
          ? "Un paso más para empezar a participar."
          : hasSocialOptions
            ? "Elegí cómo querés sumarte a Agorbis."
            : "Cinco pasos cortos: cuenta, correo, acuerdos, nombre y comunidad."
      }
    >
      {signUp.value?.pendingConfirmation ? (
        <Card class="p-6 text-center sm:p-8">
          <div
            class="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand dark:bg-brand-950/40"
            aria-hidden="true"
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 6 9 7 9-7" />
            </svg>
          </div>
          <p class="text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "Si el correo está disponible, te mandamos un enlace a",
            )}{" "}
            <strong class="break-words text-ink-strong">
              {signUp.value.email}
            </strong>{" "}
            {translate(
              locale,
              "para confirmar la cuenta. Podés abrirlo en cualquier dispositivo y seguir desde ahí.",
            )}
          </p>
          <div class="mt-6 flex flex-col gap-3">
            {/* Con un proveedor conocido, lo primero es abrir la bandeja. */}
            {webmailFor(signUp.value.email) && (
              <ButtonLink
                href={webmailFor(signUp.value.email)!.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate(locale, "Abrir {{provider}}", {
                  provider: webmailFor(signUp.value.email)!.name,
                })}
                <ExternalLinkHint />
              </ButtonLink>
            )}
            <ButtonLink
              href={withAuthNext("/ingresar", next)}
              variant={webmailFor(signUp.value.email) ? "secondary" : undefined}
            >
              {translate(locale, "Ya confirmé: ingresar")}
            </ButtonLink>
            <ButtonLink
              href={withAuthNext("/reenviar-confirmacion", next)}
              variant="secondary"
            >
              {translate(locale, "Reenviar confirmación")}
            </ButtonLink>
            <Link
              href={withAuthNext("/registro", next)}
              class="inline-flex min-h-11 items-center justify-center text-sm font-medium text-brand hover:underline"
            >
              {translate(locale, "Usar otro correo")}
            </Link>
          </div>
          <p class="mt-4 text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "Si no te llega en unos minutos, revisá la carpeta de correo no deseado.",
            )}
          </p>
          {/* La pantalla es la misma para una cuenta nueva y una que ya
              existía (no se enumeran correos): quien ya tenía cuenta esperaba
              un correo que no iba a llegar. Se le dice qué hacer (D121). */}
          <p class="mt-3 text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "¿Ya tenías una cuenta con este correo? Entonces no va a llegar nada nuevo:",
            )}{" "}
            <Link
              href={withAuthNext("/ingresar", next)}
              class="font-medium text-brand hover:underline"
            >
              {translate(locale, "ingresá")}
            </Link>{" "}
            {translate(locale, "o")}{" "}
            <Link
              href="/recuperar"
              class="font-medium text-brand hover:underline"
            >
              {translate(locale, "recuperá tu contraseña")}
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card class="p-6 sm:p-8">
          {oauthErrorMessage && (
            <Alert class="mb-5">{translate(locale, oauthErrorMessage)}</Alert>
          )}
          {location.url.searchParams.get("auth_error") === "1" && (
            <Alert class="mb-5">
              {translate(
                locale,
                "No pudimos completar el acceso con ese proveedor. Probá de nuevo.",
              )}
            </Alert>
          )}
          <div>
            <SocialAuth
              googleEnabled={googleNotice.value.enabled}
              googleNotice={googleNotice.value.notice}
              intent="register"
              next={next}
              onSelection$={(selected) => {
                socialSelected.value = selected;
              }}
            />
          </div>
          <div hidden={socialSelected.value}>
            <Form action={signUp} class="space-y-5">
              <input type="hidden" name="next" value={next} />
              {signUp.value?.message &&
                (turnstileRejected && turnstileRenewed.value ? (
                  <Alert tone="warn">
                    {translate(
                      locale,
                      "La verificación antiabuso no se pudo validar y ya se renovó. Tocá «Crear cuenta» de nuevo.",
                    )}
                  </Alert>
                ) : (
                  <Alert>{translate(locale, signUp.value.message)}</Alert>
                ))}
              <Field
                label="Correo electrónico"
                name="email"
                required
                error={signUp.value?.fieldErrors?.email}
              >
                <Input
                  name="email"
                  type="email"
                  autocomplete="email"
                  autocapitalize="none"
                  spellcheck={false}
                  inputMode="email"
                  enterKeyHint="next"
                  required
                  placeholder={translate(locale, "vos@ejemplo.com")}
                  invalid={!!signUp.value?.fieldErrors?.email}
                  value={email.value}
                  autoFocus
                  onInput$={(_, element) => {
                    email.value = element.value;
                  }}
                />
                {emailSuggestion.value && (
                  <p class="mt-2 text-sm text-ink-muted" role="status">
                    {translate(locale, "¿Quisiste decir")}{" "}
                    <button
                      type="button"
                      class="font-semibold text-brand hover:underline"
                      onClick$={() => {
                        if (emailSuggestion.value)
                          email.value = emailSuggestion.value;
                      }}
                    >
                      {emailSuggestion.value}
                    </button>
                    ?
                  </p>
                )}
              </Field>
              <Field
                label="Contraseña"
                name="password"
                required
                // Con la contraseña escrita, la lista de chequeo ya dice lo
                // mismo: la pista sólo guía el campo vacío.
                hint={
                  password.value.length === 0
                    ? "Usá al menos 12 caracteres, con letras y números."
                    : undefined
                }
                error={signUp.value?.fieldErrors?.password}
              >
                <PasswordInput
                  name="password"
                  autocomplete="new-password"
                  enterKeyHint="done"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  value={password.value}
                  onInput$={(_, element) => {
                    password.value = element.value;
                  }}
                />
                {password.value.length > 0 && (
                  <div class="mt-2.5 space-y-2">
                    {/* Barra de 3 segmentos: un requisito real por segmento */}
                    <div class="flex items-center gap-1.5">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          class={cx(
                            "h-1.5 flex-1 rounded-full transition-all duration-300",
                            step <= requirementsMet
                              ? requirementsStatus.color
                              : "bg-subtle",
                          )}
                        />
                      ))}
                      <span
                        class={cx(
                          "ml-2 text-xs font-semibold",
                          requirementsStatus.text,
                        )}
                      >
                        {translate(locale, requirementsStatus.label)}
                      </span>
                    </div>

                    {/* Checklist en tiempo real de los requisitos reales */}
                    <div class="grid grid-cols-1 gap-1.5 pt-1 text-xs sm:grid-cols-3">
                      <span
                        class={cx(
                          "flex items-center gap-1 transition-colors",
                          hasMinLength
                            ? "font-medium text-success-600 dark:text-success-400"
                            : "text-ink-faint",
                        )}
                      >
                        <span aria-hidden="true">
                          {hasMinLength ? (
                            <Icon name="check" />
                          ) : (
                            <span
                              class="inline-block size-3 rounded-full border-2 border-current"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        {translate(locale, "12+ caracteres")}
                        <span class="sr-only">
                          {translate(
                            locale,
                            hasMinLength ? ": cumplido" : ": pendiente",
                          )}
                        </span>
                      </span>
                      <span
                        class={cx(
                          "flex items-center gap-1 transition-colors",
                          hasLetter
                            ? "font-medium text-success-600 dark:text-success-400"
                            : "text-ink-faint",
                        )}
                      >
                        <span aria-hidden="true">
                          {hasLetter ? (
                            <Icon name="check" />
                          ) : (
                            <span
                              class="inline-block size-3 rounded-full border-2 border-current"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        {translate(locale, "Una letra")}
                        <span class="sr-only">
                          {translate(
                            locale,
                            hasLetter ? ": cumplido" : ": pendiente",
                          )}
                        </span>
                      </span>
                      <span
                        class={cx(
                          "flex items-center gap-1 transition-colors",
                          hasNumber
                            ? "font-medium text-success-600 dark:text-success-400"
                            : "text-ink-faint",
                        )}
                      >
                        <span aria-hidden="true">
                          {hasNumber ? (
                            <Icon name="check" />
                          ) : (
                            <span
                              class="inline-block size-3 rounded-full border-2 border-current"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        {translate(locale, "Un número")}
                        <span class="sr-only">
                          {translate(
                            locale,
                            hasNumber ? ": cumplido" : ": pendiente",
                          )}
                        </span>
                      </span>
                    </div>
                    <p class="text-xs text-ink-faint">
                      {translate(
                        locale,
                        "Para hacerla más fuerte podés sumar largo, mayúsculas o símbolos. No es obligatorio.",
                      )}
                    </p>
                  </div>
                )}
              </Field>

              <LegalConsentFields
                prefix="registro"
                transferConsent={emailTransferConsent}
                errors={signUp.value?.fieldErrors}
              />

              <TurnstileGate
                action={TURNSTILE_ACTIONS.signup}
                submitting={signUp.isRunning}
                state={signupGate}
                onVerified$={$(() => {
                  if (turnstileRejected) turnstileRenewed.value = true;
                })}
              />

              <SubmitButton
                size="lg"
                class="w-full"
                pending={signUp.isRunning}
                disabled={signupGate.status === "waiting"}
              >
                {translate(locale, "Crear cuenta")}
              </SubmitButton>
            </Form>
          </div>
          <p class="mt-6 border-t border-subtle pt-5 text-center text-sm text-ink-muted">
            {translate(locale, "¿Ya tenés cuenta?")}{" "}
            <Link
              href={withAuthNext("/ingresar", next)}
              class="inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
            >
              {translate(locale, "Ingresá")}
            </Link>
          </p>
        </Card>
      )}
    </AuthShell>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Crear cuenta")} · ${APP_NAME}`,
  meta: [
    {
      name: "description",
      content: translate(
        resolveValue(useLocaleLoader),
        "Creá tu cuenta en Agorbis y sumate a las comunidades donde vivís.",
      ),
    },
    { name: "robots", content: "noindex" },
  ],
});
