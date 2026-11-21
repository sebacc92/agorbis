import { component$, useComputed$, useStore } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { AuthShell } from "~/components/layout/AuthShell";
import {
  TurnstileGate,
  type TurnstileGateHandle,
} from "~/components/auth/TurnstileGate";
import {
  Alert,
  ButtonLink,
  Card,
  ExternalLinkHint,
  Field,
  Input,
  SubmitButton,
} from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { useLocale, translate } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { requestPasswordResetWithTurnstile } from "~/lib/protected-auth";
import { TURNSTILE_ACTIONS, TURNSTILE_FAILURE_MESSAGE } from "~/lib/turnstile";
import { webmailFor } from "~/lib/webmail";
import { useLocaleLoader } from "../layout";

export const useRequestPasswordReset = routeAction$(
  async (data, ev) => {
    const attempt = await requestPasswordResetWithTurnstile(ev, {
      email: data.email,
      turnstileToken: data.turnstile_token,
    });
    if (!attempt.turnstileVerified) {
      return ev.fail(403, { message: TURNSTILE_FAILURE_MESSAGE });
    }
    const { error } = attempt.result;
    // La respuesta pública es idéntica aunque no exista la cuenta. Los fallos
    // operativos sí quedan en logs para no confundir privacidad con silencio.
    if (error) logFailure({ scope: "auth/recuperacion" }, error);
    return { sent: true as const, email: data.email };
  },
  zod$({
    email: z.string().trim().toLowerCase().email("Escribí un mail válido."),
    turnstile_token: z
      .string()
      .optional()
      .transform((value) => value ?? ""),
  }),
);

export default component$(() => {
  const reset = useRequestPasswordReset();
  const locale = useLocale();
  // El botón espera el token de Turnstile, como en ingresar (D119-9, D121).
  const resetGate = useStore<TurnstileGateHandle>({ status: "ssr" });
  const sent = useComputed$(() => !!reset.value?.sent);
  const sentEmail = useComputed$(() =>
    reset.value?.sent ? reset.value.email : "",
  );

  return (
    <AuthShell
      title={sent.value ? "Revisá tu correo" : "Restablecer contraseña"}
      subtitle={
        sent.value
          ? "Revisá también la carpeta de spam si el mensaje no aparece."
          : "Te enviamos un enlace de un solo uso para elegir una nueva."
      }
    >
      <Card class="p-6 sm:p-8">
        {sent.value ? (
          <div class="space-y-4">
            <Alert tone="success">
              {translate(
                locale,
                "Si existe una cuenta con ese correo, vas a recibir un enlace en unos minutos.",
              )}
            </Alert>
            <p class="break-words text-sm text-ink-muted">
              {translate(locale, "Correo ingresado")}:{" "}
              <bdi class="font-medium text-ink-strong">{sentEmail.value}</bdi>
            </p>
            {webmailFor(sentEmail.value) && (
              <ButtonLink
                href={webmailFor(sentEmail.value)!.href}
                target="_blank"
                rel="noopener noreferrer"
                class="w-full"
              >
                {translate(locale, "Abrir {{provider}}", {
                  provider: webmailFor(sentEmail.value)!.name,
                })}
                <ExternalLinkHint />
              </ButtonLink>
            )}
            <a
              href="/recuperar/"
              class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
            >
              {translate(locale, "Probar con otro correo")}
            </a>
          </div>
        ) : (
          <Form action={reset} class="space-y-5">
            {reset.value?.message && (
              <Alert>{translate(locale, reset.value.message)}</Alert>
            )}
            <Field
              name="email"
              label="Correo electrónico"
              required
              error={reset.value?.fieldErrors?.email}
            >
              <Input
                name="email"
                type="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck={false}
                inputMode="email"
                enterKeyHint="done"
                placeholder={translate(locale, "vos@ejemplo.com")}
                required
                autoFocus
                invalid={!!reset.value?.fieldErrors?.email}
              />
            </Field>
            <TurnstileGate
              action={TURNSTILE_ACTIONS.passwordReset}
              submitting={reset.isRunning}
              state={resetGate}
            />
            <SubmitButton
              size="lg"
              class="w-full"
              pending={reset.isRunning}
              disabled={resetGate.status === "waiting"}
            >
              {translate(locale, "Enviar enlace")}
            </SubmitButton>
          </Form>
        )}
        <p class="mt-6 border-t border-subtle pt-4 text-center text-sm">
          <Link
            href="/ingresar"
            class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
          >
            {translate(locale, "Volver a ingresar")}
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Restablecer contraseña")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
