import { component$, useComputed$, useStore } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import { postedText } from "~/components/forms/posted-fields";
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
import { withAuthNext } from "~/lib/auth-navigation";
import { safeInternalPath } from "~/lib/http";
import { translate, useLocale } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { resendConfirmationWithTurnstile } from "~/lib/protected-auth";
import { TURNSTILE_ACTIONS, TURNSTILE_FAILURE_MESSAGE } from "~/lib/turnstile";
import { webmailFor } from "~/lib/webmail";
import { useLocaleLoader } from "../layout";

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "no-store");
  // Conserva Origin en el POST propio y no envía Referer a otros sitios.
  ev.headers.set("Referrer-Policy", "same-origin");
  ev.headers.set("X-Robots-Tag", "noindex, nofollow");
};

export const useResendConfirmation = routeAction$(
  async (data, ev) => {
    const attempt = await resendConfirmationWithTurnstile(ev, {
      email: data.email,
      next: safeInternalPath(data.next, "/onboarding"),
      turnstileToken: data.turnstile_token,
    });
    if (!attempt.turnstileVerified) {
      return ev.fail(403, { message: TURNSTILE_FAILURE_MESSAGE });
    }
    const { error } = attempt.result;

    // Una cuenta confirmada, una inexistente, un rate limit y un reenvío real
    // muestran exactamente la misma respuesta para no enumerar direcciones.
    if (error) logFailure({ scope: "auth/reenviar-confirmacion" }, error);
    return { sent: true as const };
  },
  zod$({
    email: z.string().trim().toLowerCase().email("Escribí un mail válido."),
    next: z.string().max(2048).optional(),
    turnstile_token: z
      .string()
      .optional()
      .transform((value) => value ?? ""),
  }),
);

export default component$(() => {
  const resend = useResendConfirmation();
  const locale = useLocale();
  // El botón espera el token de Turnstile, como en ingresar (D119-9, D121).
  const resendGate = useStore<TurnstileGateHandle>({ status: "ssr" });
  // El correo enviado viene del formulario: la respuesta no lo repite.
  const sentWebmail = useComputed$(() =>
    webmailFor(resend.formData?.get("email")?.toString() ?? ""),
  );
  const location = useLocation();
  const next = useComputed$(() =>
    safeInternalPath(
      postedText(
        resend.formData,
        "next",
        location.url.searchParams.get("next") ?? "",
      ),
      "/onboarding",
    ),
  );

  return (
    <AuthShell
      title={resend.value?.sent ? "Revisá tu correo" : "Reenviar confirmación"}
      subtitle={
        resend.value?.sent
          ? "Revisá también la carpeta de spam si el mensaje no aparece."
          : "Pedí otro enlace si el anterior no llegó o ya venció."
      }
    >
      <Card class="p-6 sm:p-8">
        {resend.value?.sent ? (
          <div class="space-y-4">
            <Alert tone="success">
              {translate(
                locale,
                "Si existe una cuenta pendiente con ese correo, vas a recibir un enlace en unos minutos.",
              )}
            </Alert>
            {sentWebmail.value && (
              <ButtonLink
                href={sentWebmail.value.href}
                target="_blank"
                rel="noopener noreferrer"
                class="w-full"
              >
                {translate(locale, "Abrir {{provider}}", {
                  provider: sentWebmail.value.name,
                })}
                <ExternalLinkHint />
              </ButtonLink>
            )}
          </div>
        ) : (
          <Form action={resend} class="space-y-5">
            <input type="hidden" name="next" value={next.value} />
            {resend.value?.message && (
              <Alert>{translate(locale, resend.value.message)}</Alert>
            )}
            <Field
              name="email"
              label="Correo electrónico"
              required
              error={resend.value?.fieldErrors?.email}
            >
              <Input
                name="email"
                type="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck={false}
                inputMode="email"
                enterKeyHint="done"
                required
                autoFocus
                invalid={!!resend.value?.fieldErrors?.email}
                placeholder={translate(locale, "vos@ejemplo.com")}
              />
            </Field>
            <TurnstileGate
              action={TURNSTILE_ACTIONS.resendConfirmation}
              submitting={resend.isRunning}
              state={resendGate}
            />
            <SubmitButton
              size="lg"
              class="w-full"
              pending={resend.isRunning}
              disabled={resendGate.status === "waiting"}
            >
              {translate(locale, "Reenviar confirmación")}
            </SubmitButton>
          </Form>
        )}
        <p class="mt-6 border-t border-subtle pt-4 text-center text-sm">
          <Link
            href={withAuthNext("/ingresar", next.value)}
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
  title: `${translate(resolveValue(useLocaleLoader), "Reenviar confirmación")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
