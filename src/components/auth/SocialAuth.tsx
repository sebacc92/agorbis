import {
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
  type QRL,
} from "@qwik.dev/core";
import { Form, Link } from "@qwik.dev/router";
import { FacebookMark } from "~/components/auth/FacebookMark";
import { GoogleMark } from "~/components/auth/GoogleMark";
import { LegalConsentFields } from "~/components/auth/LegalConsentFields";
import { Alert, Button, SubmitButton } from "~/components/ui";
import { useSocialSignIn } from "~/lib/auth-actions";
import { FACEBOOK_AUTH_ENABLED } from "~/lib/auth-security";
import { translate, useLocale } from "~/lib/i18n";
import {
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  LEGAL_ROUTES,
  MINIMUM_ACCOUNT_AGE,
} from "~/lib/legal";
import {
  GOOGLE_AUTH_NOTICE_ROUTE,
  type GoogleAuthNotice,
} from "~/lib/google-auth-consent";

type SocialProvider = "google" | "facebook";

export interface SocialAuthProps {
  intent: "login" | "register";
  next: string;
  googleNotice?: GoogleAuthNotice | null;
  googleEnabled?: boolean;
  onSelection$?: QRL<(selected: boolean) => void>;
}

/** El proveedor se elige antes de mostrar un único formulario de acuerdos. */
export const SocialAuth = component$<SocialAuthProps>(
  ({ intent, next, googleNotice = null, googleEnabled, onSelection$ }) => {
    const isGoogleEnabled = googleEnabled ?? googleNotice !== null;
    const hasVisibleProviders =
      (isGoogleEnabled && !!googleNotice) || FACEBOOK_AUTH_ENABLED;

    if (!isGoogleEnabled && !FACEBOOK_AUTH_ENABLED) return null;

    const social = useSocialSignIn();
    const locale = useLocale();
    const submittedProvider = social.formData?.get("provider");
    const provider = useSignal<SocialProvider | null>(
      social.formData?.get("intent") === intent &&
        ((submittedProvider === "google" && isGoogleEnabled && googleNotice) ||
          (submittedProvider === "facebook" && FACEBOOK_AUTH_ENABLED))
        ? submittedProvider
        : null,
    );
    const transferConsent = useSignal(false);
    const focusTarget = useSignal<string>();
    useTask$(async ({ track }) => {
      const selected = track(() => provider.value !== null);
      await onSelection$?.(selected);
    });
    // Buscar después del render evita retener controles reemplazados al cambiar
    // de panel. El foco pedido no depende de que el panel entre en el viewport.
    // eslint-disable-next-line qwik/no-use-visible-task -- enfoca controles recién montados después de una acción explícita
    useVisibleTask$(
      ({ track, cleanup }) => {
        const target = track(() => focusTarget.value);
        if (!target) return;
        const section = document.getElementById(`${intent}-social-auth`);
        if (!section) return;
        let frame = 0;
        const focusMountedTarget = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const element = document.getElementById(target);
            if (!element || !section.contains(element)) return;
            element.focus();
            observer.disconnect();
          });
        };
        const observer = new MutationObserver(focusMountedTarget);
        observer.observe(section, { childList: true, subtree: true });
        focusMountedTarget();
        cleanup(() => {
          cancelAnimationFrame(frame);
          observer.disconnect();
        });
      },
      { strategy: "document-ready" },
    );

    const providerName = provider.value === "facebook" ? "Facebook" : "Google";
    const panelId = `${intent}-social-consent`;

    return (
      <section
        id={`${intent}-social-auth`}
        class="mb-6"
        aria-label={translate(locale, "Otras formas de ingresar")}
      >
        {provider.value ? (
          <Form action={social} reloadDocument class="space-y-4" id={panelId}>
            <input type="hidden" name="provider" value={provider.value} />
            <input type="hidden" name="intent" value={intent} />
            <input type="hidden" name="next" value={next} />

            <div class="rounded-2xl border border-subtle bg-inset p-4">
              <h3
                id={`${panelId}-title`}
                tabIndex={-1}
                class="flex items-center gap-2 font-semibold text-ink-strong"
              >
                {provider.value === "google" ? (
                  <GoogleMark />
                ) : (
                  <FacebookMark />
                )}
                {translate(locale, "Continuar con {{provider}}", {
                  provider: providerName,
                })}
              </h3>
              <p class="mt-2 text-sm leading-6 text-ink">
                {translate(
                  locale,
                  intent === "register"
                    ? "Revisá los acuerdos antes de continuar. Después vas a confirmar tu identidad con {{provider}}."
                    : "Si tu correo todavía no tiene cuenta, {{provider}} puede crear una. Los acuerdos de la comunidad se registran después de identificarte.",
                  { provider: providerName },
                )}
              </p>
            </div>

            {social.value?.message && (
              <Alert>{translate(locale, social.value.message)}</Alert>
            )}

            {intent === "register" ? (
              <LegalConsentFields
                prefix={`${intent}-social`}
                transferConsent={transferConsent}
              />
            ) : (
              <fieldset class="space-y-4 rounded-2xl border border-subtle p-4">
                <legend class="px-1 text-sm font-semibold text-ink-strong">
                  {translate(locale, "Antes de continuar")}
                </legend>
                <label class="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
                  <input
                    type="checkbox"
                    name="age_confirmed"
                    value="si"
                    required
                    class="mt-1 size-4 shrink-0 accent-[var(--color-brand-600)]"
                  />
                  <span>
                    {translate(
                      locale,
                      "Confirmo que tengo {{count}} años o más.",
                      {
                        count: MINIMUM_ACCOUNT_AGE,
                      },
                    )}
                  </span>
                </label>
                <label class="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
                  <input
                    type="checkbox"
                    name="privacy_acknowledged"
                    value="si"
                    required
                    class="mt-1 size-4 shrink-0 accent-[var(--color-brand-600)]"
                  />
                  <span>
                    {translate(locale, "Leí la")}{" "}
                    <Link
                      href={LEGAL_ROUTES.privacy}
                      target="_blank"
                      rel="noopener"
                      class="font-medium text-brand hover:underline"
                    >
                      {translate(locale, "Política de privacidad")}
                    </Link>{" "}
                    {translate(locale, "y los")}{" "}
                    <Link
                      href={LEGAL_ROUTES.terms}
                      target="_blank"
                      rel="noopener"
                      class="font-medium text-brand hover:underline"
                    >
                      {translate(locale, "Términos")}
                    </Link>
                    .
                  </span>
                </label>
                <div class="border-t border-subtle pt-4">
                  <label class="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
                    <input
                      type="checkbox"
                      name="international_transfers_consented"
                      value="si"
                      required
                      class="mt-1 size-4 shrink-0 accent-[var(--color-brand-600)]"
                    />
                    <span>
                      {translate(
                        locale,
                        "Consiento expresamente las transferencias internacionales necesarias para mi cuenta, descriptas en el",
                      )}{" "}
                      <Link
                        href={LEGAL_ROUTES.internationalTransfers}
                        target="_blank"
                        rel="noopener"
                        class="font-medium text-brand hover:underline"
                      >
                        {translate(locale, "Aviso versión {{version}}", {
                          version: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
                        })}
                      </Link>
                      .
                    </span>
                  </label>
                  <p class="mt-2 pl-7 text-xs leading-5 text-ink-muted">
                    {translate(
                      locale,
                      "Entiendo sus destinatarios, destinos, riesgos, salvaguardas y retiro. Sin este consentimiento no se puede crear ni mantener una cuenta; el contenido público sigue disponible.",
                    )}
                  </p>
                </div>
              </fieldset>
            )}

            {provider.value === "google" && googleNotice && (
              <fieldset class="space-y-3 rounded-2xl border border-subtle p-4">
                <legend class="px-1 text-sm font-semibold text-ink-strong">
                  {translate(locale, "Usar Google es opcional")}
                </legend>
                <p class="text-sm leading-6 text-ink-muted">
                  {googleNotice.content_snapshot[locale].summary}
                </p>
                <input
                  type="hidden"
                  name="google_notice_version"
                  value={googleNotice.version}
                />
                <input
                  type="hidden"
                  name="google_notice_hash"
                  value={googleNotice.content_hash}
                />
                <label class="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
                  <input
                    type="checkbox"
                    name="google_auth_consented"
                    value="si"
                    required
                    class="mt-1 size-4 shrink-0 accent-[var(--color-brand-600)]"
                  />
                  <span>
                    {translate(
                      locale,
                      "Consiento expresamente el tratamiento de mis datos para acceder con Google y las transferencias internacionales descriptas en este aviso.",
                    )}{" "}
                    <Link
                      href={`${GOOGLE_AUTH_NOTICE_ROUTE}?version=${encodeURIComponent(googleNotice.version)}&hash=${googleNotice.content_hash}`}
                      target="_blank"
                      rel="noopener"
                      class="font-medium text-brand hover:underline"
                    >
                      {translate(locale, "Aviso versión {{version}}", {
                        version: googleNotice.version,
                      })}
                    </Link>
                    .
                  </span>
                </label>
                <p class="text-xs leading-5 text-ink-muted">
                  {translate(
                    locale,
                    "Podés ingresar por correo sin aceptar Google y retirar esta decisión desde tu perfil.",
                  )}
                </p>
              </fieldset>
            )}

            <SubmitButton
              variant="secondary"
              size="lg"
              class="w-full"
              pending={social.isRunning}
            >
              {provider.value === "google" ? <GoogleMark /> : <FacebookMark />}
              {translate(locale, "Continuar con {{provider}}", {
                provider: providerName,
              })}
            </SubmitButton>
            <Button
              variant="ghost"
              class="w-full"
              disabled={social.isRunning}
              onClick$={() => {
                const previousProvider = provider.value;
                provider.value = null;
                transferConsent.value = false;
                focusTarget.value = `${intent}-provider-${previousProvider}`;
              }}
            >
              {translate(locale, "Volver a las opciones")}
            </Button>
          </Form>
        ) : hasVisibleProviders ? (
          <div class="space-y-3">
            {(
              [
                {
                  key: "google",
                  enabled: isGoogleEnabled && !!googleNotice,
                  name: "Google",
                },
                {
                  key: "facebook",
                  enabled: FACEBOOK_AUTH_ENABLED,
                  name: "Facebook",
                },
              ] as const
            ).map(
              (option) =>
                option.enabled && (
                  <Button
                    key={option.key}
                    id={`${intent}-provider-${option.key}`}
                    variant="secondary"
                    size="lg"
                    class="w-full"
                    onClick$={() => {
                      provider.value = option.key;
                      focusTarget.value = `${panelId}-title`;
                    }}
                  >
                    {option.key === "google" ? (
                      <GoogleMark />
                    ) : (
                      <FacebookMark />
                    )}
                    {translate(locale, "Continuar con {{provider}}", {
                      provider: option.name,
                    })}
                  </Button>
                ),
            )}
          </div>
        ) : null}

        {isGoogleEnabled && !googleNotice && (
          <p class="text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "El acceso con Google todavía no está disponible. Podés continuar por correo.",
            )}
          </p>
        )}

        {!provider.value && hasVisibleProviders && (
          <div class="mt-6 flex items-center gap-3" aria-hidden="true">
            <span class="h-px flex-1 bg-[var(--border-subtle)]" />
            <span class="text-xs text-ink-muted">
              {translate(locale, "o con tu correo")}
            </span>
            <span class="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>
        )}
      </section>
    );
  },
);
