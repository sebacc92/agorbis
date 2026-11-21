import { component$, useSignal, type Signal } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { useLocale, translate } from "~/lib/i18n";
import {
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  LEGAL_ROUTES,
  MINIMUM_ACCOUNT_AGE,
} from "~/lib/legal";

type LegalConsentErrors = Partial<
  Record<
    | "legal_consent"
    | "age_confirmed"
    | "terms_accepted"
    | "privacy_acknowledged"
    | "community_rules_accepted"
    | "international_transfers_consented",
    string
  >
>;

export const LegalConsentFields = component$<{
  prefix: string;
  transferConsent: Signal<boolean>;
  errors?: LegalConsentErrors;
}>((props) => {
  const locale = useLocale();
  const legalAccepted = useSignal(false);
  const legalError =
    props.errors?.legal_consent ||
    props.errors?.terms_accepted ||
    props.errors?.privacy_acknowledged ||
    props.errors?.community_rules_accepted ||
    props.errors?.age_confirmed;

  return (
    <div>
      <fieldset class="space-y-3 rounded-2xl border border-subtle bg-surface p-4">
        <legend class="px-1 text-sm font-semibold text-ink-strong">
          {translate(locale, "Antes de continuar")}
        </legend>
        <label class="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
          <input
            id={`${props.prefix}-legal`}
            type="checkbox"
            name="legal_consent"
            value="si"
            required
            checked={legalAccepted.value}
            aria-describedby={
              legalError ? `${props.prefix}-legal-error` : undefined
            }
            class="mt-0.5 size-4 accent-[var(--color-brand-600)]"
            onInput$={(_, element) => {
              legalAccepted.value = element.checked;
            }}
          />
          <span>
            {translate(
              locale,
              "Confirmo que tengo {{count}} años o más, acepto los",
              { count: MINIMUM_ACCOUNT_AGE },
            )}{" "}
            <Link
              class="font-medium text-brand hover:underline"
              href={LEGAL_ROUTES.terms}
              target="_blank"
              rel="noopener"
            >
              {translate(locale, "Términos")}
            </Link>{" "}
            {translate(locale, "y las")}{" "}
            <Link
              class="font-medium text-brand hover:underline"
              href={LEGAL_ROUTES.communityRules}
              target="_blank"
              rel="noopener"
            >
              {translate(locale, "Normas comunitarias")}
            </Link>
            {translate(locale, ", y confirmo haber leído la")}{" "}
            <Link
              class="font-medium text-brand hover:underline"
              href={LEGAL_ROUTES.privacy}
              target="_blank"
              rel="noopener"
            >
              {translate(locale, "Política de privacidad")}
            </Link>
            .
          </span>
        </label>
        <input
          type="hidden"
          name="age_confirmed"
          value={legalAccepted.value ? "si" : ""}
        />
        <input
          type="hidden"
          name="terms_accepted"
          value={legalAccepted.value ? "si" : ""}
        />
        <input
          type="hidden"
          name="privacy_acknowledged"
          value={legalAccepted.value ? "si" : ""}
        />
        <input
          type="hidden"
          name="community_rules_accepted"
          value={legalAccepted.value ? "si" : ""}
        />
        {legalError && (
          <p
            id={`${props.prefix}-legal-error`}
            role="alert"
            class="text-xs text-danger"
          >
            {translate(locale, legalError, { count: MINIMUM_ACCOUNT_AGE })}
          </p>
        )}

        {/* Las dos decisiones van en un mismo bloque; la de transferencias
            sigue siendo una casilla separada (D70, D73). */}
        <label class="flex cursor-pointer items-start gap-3 border-t border-subtle pt-3 text-sm leading-6 text-ink">
          <input
            id={`${props.prefix}-international-transfers`}
            type="checkbox"
            name="international_transfers_consented"
            value="si"
            required
            checked={props.transferConsent.value}
            aria-describedby={
              props.errors?.international_transfers_consented
                ? `${props.prefix}-international-transfers-error`
                : `${props.prefix}-international-transfers-help`
            }
            class="mt-0.5 size-4 accent-[var(--color-brand-600)]"
            onInput$={(_, element) => {
              props.transferConsent.value = element.checked;
            }}
          />
          <span>
            {translate(
              locale,
              "Consiento expresamente las transferencias internacionales descriptas en el",
            )}{" "}
            <Link
              class="font-semibold text-brand hover:underline"
              href={LEGAL_ROUTES.internationalTransfers}
              target="_blank"
              rel="noopener"
            >
              {translate(
                locale,
                "Aviso de transferencias versión {{version}}",
                { version: INTERNATIONAL_TRANSFER_NOTICE_VERSION },
              )}
            </Link>
            .
          </span>
        </label>
        <p
          id={`${props.prefix}-international-transfers-help`}
          class="pl-7 text-xs leading-5 text-ink-muted"
        >
          {translate(
            locale,
            "Entiendo sus destinatarios, destinos, riesgos, salvaguardas y retiro. Sin este consentimiento no se puede crear ni mantener una cuenta; el contenido público sigue disponible.",
          )}
        </p>
        {props.errors?.international_transfers_consented && (
          <p
            id={`${props.prefix}-international-transfers-error`}
            role="alert"
            class="pl-7 text-xs text-danger"
          >
            {translate(locale, props.errors.international_transfers_consented)}
          </p>
        )}
      </fieldset>
    </div>
  );
});
