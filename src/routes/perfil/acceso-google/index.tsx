import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { Alert, ButtonLink, Card, SubmitButton } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { formatInstant } from "~/lib/format";
import { GOOGLE_AUTH_NOTICE_ROUTE } from "~/lib/google-auth-consent";
import {
  GOOGLE_CONSENT_CONFIRM_REQUIRED,
  GOOGLE_CONSENT_READ_FAILED,
  GOOGLE_CONSENT_STATUS_LABELS,
  loadGoogleConsentAccount,
  withdrawGoogleConsentForAccount,
} from "~/lib/google-consent-account";
import { translate, useLocale } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { useLocaleLoader } from "../../layout";

export const useGoogleConsentAccount = routeLoader$((ev) =>
  loadGoogleConsentAccount(ev),
);
export const useWithdrawGoogleConsent = routeAction$(
  (data, ev) => withdrawGoogleConsentForAccount(data, ev),
  zod$({
    confirm_withdrawal: z
      .string()
      .max(2, GOOGLE_CONSENT_CONFIRM_REQUIRED)
      .optional(),
  }),
);

export default component$(() => {
  const context = useGoogleConsentAccount();
  const withdraw = useWithdrawGoogleConsent();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const consent = withdraw.value?.consent ?? context.value;
  const saved = withdraw.value?.saved === true;
  const withdrawn = consent?.status === "withdrawn";
  const failureMessage =
    withdraw.value?.message ?? withdraw.value?.fieldErrors?.confirm_withdrawal;

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
          {translate(locale, "Tu acceso con Google")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Revisá o retirá tu consentimiento para usar Google en Agorbis. Podés seguir usando tu cuenta por correo.",
          )}
        </p>
      </header>

      <div class="space-y-5">
        {saved && (
          <Alert tone="success">
            {translate(
              locale,
              "Retiraste tu consentimiento para acceder con Google. Tu cuenta y esta sesión siguen abiertas; podés ingresar por correo.",
            )}
          </Alert>
        )}
        {failureMessage && <Alert>{translate(locale, failureMessage)}</Alert>}
        {!consent && (
          <Alert>{translate(locale, GOOGLE_CONSENT_READ_FAILED)}</Alert>
        )}

        {consent && (
          <Card class="p-6 sm:p-8">
            <h2 class="text-lg font-semibold">
              {translate(locale, "Tu decisión sobre Google")}
            </h2>
            <p class="mt-2 font-medium text-ink">
              {translate(locale, GOOGLE_CONSENT_STATUS_LABELS[consent.status])}
            </p>
            <dl class="mt-4 space-y-3 text-sm">
              {consent.notice_version && (
                <div>
                  <dt class="text-ink-muted">
                    {translate(locale, "Versión de tu última decisión")}
                  </dt>
                  <dd class="mt-1 break-words font-medium">
                    {consent.notice_version}
                  </dd>
                </div>
              )}
              {consent.accepted_at && (
                <div>
                  <dt class="text-ink-muted">
                    {translate(locale, "Última aceptación registrada")}
                  </dt>
                  <dd class="mt-1">
                    <time dateTime={consent.accepted_at}>
                      {formatInstant(consent.accepted_at, locale, timeZone)}
                    </time>
                  </dd>
                </div>
              )}
              {consent.last_withdrawn_at && (
                <div>
                  <dt class="text-ink-muted">
                    {translate(locale, "Último retiro registrado")}
                  </dt>
                  <dd class="mt-1">
                    <time dateTime={consent.last_withdrawn_at}>
                      {formatInstant(
                        consent.last_withdrawn_at,
                        locale,
                        timeZone,
                      )}
                    </time>
                  </dd>
                </div>
              )}
            </dl>
            {consent.current_version && (
              <Link
                href={GOOGLE_AUTH_NOTICE_ROUTE}
                class="mt-4 inline-flex min-h-11 items-center font-medium text-brand hover:underline"
              >
                {translate(
                  locale,
                  "Leer el aviso vigente de acceso con Google",
                )}
              </Link>
            )}
          </Card>
        )}

        <Card class="p-6 sm:p-8">
          <h2 class="text-lg font-semibold">
            {translate(locale, "Qué cambia al retirar el consentimiento")}
          </h2>
          <p
            id="google-withdrawal-help"
            class="mt-2 text-sm leading-relaxed text-ink-muted"
          >
            {translate(
              locale,
              "Agorbis dejará de usar esta decisión para nuevos accesos con Google. El retiro no borra tu cuenta ni cierra esta sesión, y no deshace los tratamientos ya realizados.",
            )}
          </p>
          <p class="mt-3 text-sm leading-relaxed text-ink-muted">
            {translate(
              locale,
              "Para volver a usar Google tenés que iniciar un nuevo acceso y dar otra decisión expresa. Un regreso de Google iniciado antes del retiro no lo revierte.",
            )}
          </p>

          {!withdrawn && !saved && (
            <Form action={withdraw} class="mt-5 space-y-4">
              <label class="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-subtle p-3 text-sm leading-relaxed text-ink">
                <input
                  type="checkbox"
                  name="confirm_withdrawal"
                  value="si"
                  required
                  aria-describedby="google-withdrawal-help"
                  class="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                />
                <span>
                  {translate(
                    locale,
                    "Confirmo que quiero retirar mi consentimiento para acceder con Google.",
                  )}
                </span>
              </label>
              <SubmitButton
                pending={withdraw.isRunning}
                variant="secondary"
                size="lg"
              >
                {translate(locale, "Retirar consentimiento para Google")}
              </SubmitButton>
            </Form>
          )}
        </Card>

        <Card class="p-6 sm:p-8">
          <h2 class="text-lg font-semibold">
            {translate(locale, "Seguir usando tu cuenta por correo")}
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">
            {translate(
              locale,
              "Podés ingresar con tu correo y contraseña. Si no tenés contraseña, en Ingresar elegí «Con un enlace» para recibir un acceso de un solo uso.",
            )}
          </p>
          <div class="mt-4 flex flex-wrap gap-3">
            <ButtonLink
              href="/ingresar?next=%2Fperfil%2Facceso-google"
              variant="secondary"
            >
              {translate(locale, "Ingresar por correo")}
            </ButtonLink>
            <ButtonLink href="/perfil" variant="ghost">
              {translate(locale, "Volver a mi perfil")}
            </ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Tu acceso con Google")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
