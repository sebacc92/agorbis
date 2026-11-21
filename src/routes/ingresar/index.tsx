import { $, component$, useSignal, useStore } from "@qwik.dev/core";
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
import { withAuthNext } from "~/lib/auth-navigation";
import { AuthShell } from "~/components/layout/AuthShell";
import { SocialAuth } from "~/components/auth/SocialAuth";
import {
  TurnstileGate,
  type TurnstileGateHandle,
} from "~/components/auth/TurnstileGate";
import {
  Alert,
  ButtonLink,
  Card,
  Field,
  Input,
  PasswordInput,
  SubmitButton,
  cx,
  ExternalLinkHint,
} from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { MAX_PASSWORD_LENGTH } from "~/lib/auth-security";
import { safeInternalPath } from "~/lib/http";
import { useLocale, translate } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import {
  sendMagicLinkWithTurnstile,
  signInWithTurnstile,
} from "~/lib/protected-auth";
import { TURNSTILE_ACTIONS, TURNSTILE_FAILURE_MESSAGE } from "~/lib/turnstile";
import { webmailFor } from "~/lib/webmail";
import { useLocaleLoader } from "../layout";
import { loadGoogleAuthNotice } from "~/lib/google-auth-consent";

export const useGoogleNotice = routeLoader$((ev) => loadGoogleAuthNotice(ev));

/** Sólo aceptamos redirecciones internas: `?next=https://otro-sitio` no. */
function safeNext(next: string | undefined): string {
  return safeInternalPath(next);
}

export const useSignIn = routeAction$(
  async (data, ev) => {
    const attempt = await signInWithTurnstile(ev, {
      email: data.email,
      password: data.password,
      turnstileToken: data.turnstile_token,
    });
    if (!attempt.turnstileVerified) {
      return ev.fail(403, { message: TURNSTILE_FAILURE_MESSAGE });
    }
    const { error } = attempt;

    if (error) {
      const code = Reflect.get(error, "code");
      const status = Reflect.get(error, "status");
      // GoTrue sólo devuelve este código con la contraseña correcta: quien ya
      // demostró conocerla no tiene que ir a cambiarla, sino a confirmar el
      // correo. No enumera cuentas: sin la contraseña es "incorrectos".
      if (code === "email_not_confirmed") {
        return ev.fail(403, {
          message:
            "Tu correo todavía no está confirmado. Abrí el enlace que te mandamos o pedí uno nuevo.",
          resendConfirmation: true as const,
        });
      }
      // Una caída de red o un 5xx de Supabase no dice nada sobre la
      // credencial: afirmar "incorrectos" sería inventarlo (D74).
      if (typeof status !== "number" || status >= 500) {
        logFailure({ scope: "auth/ingresar" }, error);
        return ev.fail(503, {
          message:
            "No pudimos verificar el ingreso. Probá de nuevo en un momento.",
        });
      }
      return ev.fail(401, {
        message: "Mail o contraseña incorrectos. Revisalos y probá de nuevo.",
      });
    }

    const next = safeNext(data.next);
    if (!attempt.legalAccepted) {
      const consent = new URL("/consentimiento", ev.url.origin);
      consent.searchParams.set("next", next);
      throw ev.redirect(303, `${consent.pathname}${consent.search}`);
    }

    throw ev.redirect(303, next);
  },
  zod$({
    email: z.string().trim().toLowerCase().email("Escribí un mail válido."),
    password: z
      .string()
      .min(1, "Escribí tu contraseña.")
      .max(MAX_PASSWORD_LENGTH, "La contraseña es demasiado larga."),
    next: z.string().optional(),
    turnstile_token: z
      .string()
      .optional()
      .transform((value) => value ?? ""),
  }),
);

export const useMagicLink = routeAction$(
  async (data, ev) => {
    // El correo lleva un TokenHash a una pantalla propia. Verificarlo mediante
    // POST permite abrirlo en otro dispositivo y evita que un scanner lo gaste.
    const attempt = await sendMagicLinkWithTurnstile(ev, {
      email: data.email,
      next: safeNext(data.next),
      turnstileToken: data.turnstile_token,
    });
    if (!attempt.turnstileVerified) {
      return ev.fail(403, { message: TURNSTILE_FAILURE_MESSAGE });
    }
    const { error } = attempt.result;

    // La respuesta es idéntica para una cuenta inexistente, un límite de
    // correo y un envío exitoso. El fallo queda en observabilidad, pero el
    // formulario no se convierte en un buscador de correos registrados.
    if (error) logFailure({ scope: "auth/magic-link" }, error);

    return { sent: true as const, email: data.email };
  },
  zod$({
    email: z.string().trim().toLowerCase().email("Escribí un mail válido."),
    next: z.string().optional(),
    turnstile_token: z
      .string()
      .optional()
      .transform((value) => value ?? ""),
  }),
);

const MODES = [
  { key: "password", label: "Con contraseña" },
  { key: "magic", label: "Con un enlace" },
] as const;

type Mode = (typeof MODES)[number]["key"];

export default component$(() => {
  const googleNotice = useGoogleNotice();
  const signIn = useSignIn();
  const magicLink = useMagicLink();
  const socialSelected = useSignal(false);
  const loc = useLocation();
  const mode = useSignal<Mode>(magicLink.formData ? "magic" : "password");
  // Estado de la verificación antiabuso de cada formulario (mejora 9).
  const passwordGate = useStore<TurnstileGateHandle>({ status: "ssr" });
  const magicGate = useStore<TurnstileGateHandle>({ status: "ssr" });
  const email = useSignal(
    signIn.formData?.get("email")?.toString() ??
      magicLink.formData?.get("email")?.toString() ??
      "",
  );
  const locale = useLocale();

  const next = safeNext(loc.url.searchParams.get("next") ?? undefined);
  const callbackFailed = loc.url.searchParams.get("auth_error") === "1";
  const oauthError = loc.url.searchParams.get("oauth_error");
  const oauthErrorMessage =
    oauthError === "consent"
      ? "No pudimos registrar tu decisión de Google. Revisá el aviso y volvé a intentarlo, o ingresá por correo."
      : oauthError === "cancelled"
        ? "Cancelaste el acceso. No se creó una sesión."
        : oauthError === "provider"
          ? "El proveedor no pudo completar el acceso. Probá de nuevo en un momento."
          : oauthError === "session"
            ? "No pudimos guardar una sesión segura. Probá de nuevo."
            : oauthError
              ? "No pudimos validar el acceso. Iniciá el proceso de nuevo."
              : null;
  const passwordChanged = loc.url.searchParams.get("password_changed") === "1";
  const resendConfirmation =
    !!signIn.value &&
    "resendConfirmation" in signIn.value &&
    signIn.value.resendConfirmation === true;
  // `/perfil/datos` manda acá cuando la sesión no es reciente.
  const reauthRequested = loc.url.searchParams.get("reauth") === "1";
  const revocationPending =
    passwordChanged && loc.url.searchParams.get("revocation") === "pending";

  /**
   * Las flechas mueven entre pestañas y activan la que reciben, que es lo que
   * espera cualquiera que use un `tablist`. Antes eran dos botones con
   * `role="tab"` y nada más: había que tabular a cada uno y el lector de
   * pantalla anunciaba pestañas que no controlaban ningún panel.
   *
   * Sólo izquierda y derecha: los handlers de Qwik son asíncronos y no pueden
   * cancelar el evento, así que Home/End —que además de mover el foco harían
   * saltar el scroll— quedan fuera en vez de comportarse a medias.
   */
  const onTabKey = $((event: KeyboardEvent, el: HTMLElement) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = MODES.findIndex((item) => item.key === mode.value);
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % MODES.length
        : (index - 1 + MODES.length) % MODES.length;
    mode.value = MODES[target].key;
    el.parentElement
      ?.querySelector<HTMLButtonElement>(`#tab-${MODES[target].key}`)
      ?.focus();
  });

  return (
    <AuthShell
      welcome
      title="Ingresá a Agorbis"
      subtitle="Volvé a las conversaciones y decisiones de tu comunidad."
    >
      {magicLink.value?.sent ? (
        <Card class="p-6 text-center sm:p-8">
          <div class="mb-3 text-4xl" aria-hidden="true">
            ✉️
          </div>
          {/* El título anterior afirmaba un envío que, para no delatar qué
              correos están registrados, no siempre ocurre. */}
          <h2 class="text-lg font-semibold">
            {translate(locale, "Revisá tu correo")}
          </h2>
          <p class="mt-2 text-sm text-ink-muted">
            {translate(locale, "Si hay una cuenta con el correo")}{" "}
            <strong class="break-words text-ink-strong">
              {magicLink.value.email}
            </strong>
            , {translate(locale, "vas a recibir un enlace de acceso.")}{" "}
            {translate(
              locale,
              "Abrilo y confirmá el acceso. Podés hacerlo desde cualquier dispositivo.",
            )}
          </p>
          {/* El enlace es también el camino de recuperación: quien llegó acá
              porque olvidó su contraseña necesita saber dónde fijar una nueva
              una vez adentro. */}
          <p class="mt-2 text-sm text-ink-muted">
            {translate(
              locale,
              "Si estabas recuperando el acceso, apenas entres podés definir una contraseña nueva desde tu perfil.",
            )}
          </p>
          {/* Sin salida, quien tipeó mal el mail quedaba mirando esta tarjeta:
              el formulario ya no estaba y volver atrás reenviaba el envío. */}
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            {/* Con un proveedor conocido, lo primero es abrir la bandeja,
                como ya hacía el registro (D121). */}
            {webmailFor(magicLink.value.email) && (
              <ButtonLink
                href={webmailFor(magicLink.value.email)!.href}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
              >
                {translate(locale, "Abrir {{provider}}", {
                  provider: webmailFor(magicLink.value.email)!.name,
                })}
                <ExternalLinkHint />
              </ButtonLink>
            )}
            <ButtonLink
              href={`/ingresar?next=${encodeURIComponent(next)}`}
              variant="secondary"
              size="sm"
            >
              {translate(locale, "Probar con otro correo")}
            </ButtonLink>
          </div>
          <p class="mt-3 text-xs text-ink-faint">
            {translate(
              locale,
              "Si no te llega en unos minutos, revisá la carpeta de correo no deseado.",
            )}
          </p>
        </Card>
      ) : (
        <Card class="p-6 sm:p-8">
          {passwordChanged && (
            <Alert tone={revocationPending ? "warn" : "success"} class="mb-4">
              {translate(
                locale,
                revocationPending
                  ? "Tu contraseña cambió, pero no pudimos confirmar el cierre de las otras sesiones. Ingresá de nuevo, cerrá sesión desde el menú y contactanos si vuelve a pasar."
                  : "Tu contraseña cambió y cerramos todas las sesiones. Ingresá de nuevo.",
              )}
            </Alert>
          )}
          {reauthRequested && (
            <Alert tone="brand" class="mb-4">
              {translate(
                locale,
                "Para descargar tus datos, volvé a identificarte: es una acción sensible y tu sesión no es reciente.",
              )}
            </Alert>
          )}
          {(callbackFailed || oauthErrorMessage) && (
            <Alert class="mb-4">
              {translate(
                locale,
                oauthErrorMessage ??
                  "El enlace no es válido o ya venció. Pedí uno nuevo.",
              )}
            </Alert>
          )}

          <SocialAuth
            googleEnabled={googleNotice.value.enabled}
            googleNotice={googleNotice.value.notice}
            intent="login"
            next={next}
            onSelection$={(selected) => (socialSelected.value = selected)}
          />

          <div hidden={socialSelected.value}>
            <div
              class="mb-5 flex rounded-2xl bg-inset p-1"
              role="tablist"
              aria-label={translate(locale, "Forma de ingreso")}
            >
              {MODES.map(({ key, label }) => (
                <button
                  key={key}
                  id={`tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={mode.value === key}
                  aria-controls={
                    mode.value === key ? `panel-${key}` : undefined
                  }
                  /* Roving tabindex: el `tablist` entero es una sola parada de
                   tabulación y las flechas mueven adentro. */
                  tabIndex={mode.value === key ? 0 : -1}
                  class={cx(
                    "min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    mode.value === key
                      ? "bg-surface text-ink-strong shadow-soft"
                      : "text-ink-muted hover:text-ink-strong",
                  )}
                  onClick$={() => (mode.value = key)}
                  onKeyDown$={onTabKey}
                >
                  {translate(locale, label)}
                </button>
              ))}
            </div>

            {mode.value === "password" ? (
              <div
                role="tabpanel"
                id="panel-password"
                aria-labelledby="tab-password"
              >
                {/* El destino puede exigir MFA y responder con otro redirect.
                  Una navegación de documento deja que el navegador encadene
                  esos saltos de autorización de forma atómica. */}
                <Form action={signIn} reloadDocument class="space-y-4">
                  <input type="hidden" name="next" value={next} />
                  {signIn.value?.message && (
                    <Alert>
                      {translate(locale, signIn.value.message)}
                      {resendConfirmation && (
                        <>
                          {" "}
                          <Link
                            href="/reenviar-confirmacion"
                            class="font-semibold underline"
                          >
                            {translate(locale, "Reenviar la confirmación")}
                          </Link>
                        </>
                      )}
                    </Alert>
                  )}

                  <Field
                    label="Correo electrónico"
                    name="email"
                    required
                    error={signIn.value?.fieldErrors?.email}
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
                      invalid={!!signIn.value?.fieldErrors?.email}
                      value={email.value}
                      autoFocus
                      onInput$={(_, element) => (email.value = element.value)}
                    />
                  </Field>

                  <Field
                    label="Contraseña"
                    name="password"
                    required
                    error={signIn.value?.fieldErrors?.password}
                  >
                    <PasswordInput
                      name="password"
                      autocomplete="current-password"
                      maxLength={MAX_PASSWORD_LENGTH}
                      enterKeyHint="go"
                      required
                      invalid={!!signIn.value?.fieldErrors?.password}
                    />
                  </Field>

                  <TurnstileGate
                    action={TURNSTILE_ACTIONS.passwordLogin}
                    submitting={signIn.isRunning}
                    state={passwordGate}
                  />

                  {/* Hasta que llega el token el botón espera: mandar antes
                      devolvía un 403 y la recarga borraba la contraseña. */}
                  <SubmitButton
                    size="lg"
                    class="w-full"
                    pending={signIn.isRunning}
                    disabled={passwordGate.status === "waiting"}
                  >
                    {translate(locale, "Ingresar")}
                  </SubmitButton>

                  <div class="border-t border-subtle pt-3 text-center">
                    <Link
                      href="/recuperar"
                      class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
                    >
                      {translate(locale, "¿Olvidaste tu contraseña?")}
                    </Link>
                  </div>
                </Form>
              </div>
            ) : (
              <div role="tabpanel" id="panel-magic" aria-labelledby="tab-magic">
                <Form action={magicLink} class="space-y-4">
                  <input type="hidden" name="next" value={next} />

                  {magicLink.value?.message && (
                    <Alert>{translate(locale, magicLink.value.message)}</Alert>
                  )}

                  <Field
                    label="Correo electrónico"
                    name="magic-email"
                    required
                    hint="Te mandamos un enlace de un solo uso. No hace falta contraseña."
                    error={magicLink.value?.fieldErrors?.email}
                  >
                    <Input
                      id="magic-email"
                      name="email"
                      type="email"
                      autocomplete="email"
                      autocapitalize="none"
                      spellcheck={false}
                      inputMode="email"
                      enterKeyHint="send"
                      required
                      placeholder={translate(locale, "vos@ejemplo.com")}
                      invalid={!!magicLink.value?.fieldErrors?.email}
                      value={email.value}
                      onInput$={(_, element) => (email.value = element.value)}
                    />
                  </Field>

                  <TurnstileGate
                    action={TURNSTILE_ACTIONS.magicLink}
                    submitting={magicLink.isRunning}
                    state={magicGate}
                  />

                  <SubmitButton
                    size="lg"
                    class="w-full"
                    pending={magicLink.isRunning}
                    disabled={magicGate.status === "waiting"}
                  >
                    {translate(locale, "Enviarme el enlace")}
                  </SubmitButton>
                </Form>
              </div>
            )}
          </div>

          <p class="mt-6 border-t border-subtle pt-5 text-center text-sm text-ink">
            {translate(locale, "¿Todavía no tenés cuenta?")}{" "}
            <Link
              href={`/registro?next=${encodeURIComponent(next)}`}
              class="font-semibold text-brand hover:underline"
            >
              {translate(locale, "Creá una")}
            </Link>
          </p>
          <details class="mt-3 text-center text-sm text-ink-muted">
            <summary class="min-h-11 cursor-pointer list-inside rounded-xl px-2 py-3 font-medium hover:text-ink-strong">
              {translate(locale, "¿No recibiste la confirmación?")}
            </summary>
            <p class="mt-1 leading-6">
              {translate(
                locale,
                "Revisá el correo no deseado o pedí un nuevo enlace.",
              )}
            </p>
            <Link
              href={withAuthNext("/reenviar-confirmacion", next)}
              class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
            >
              {translate(locale, "Reenviar confirmación de cuenta")}
            </Link>
          </details>
        </Card>
      )}
    </AuthShell>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Ingresar")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
