import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Card } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import {
  AAIP_CONTROLLER_ID,
  AAIP_DATABASE_REGISTRATION_ID,
  AAIP_DATABASE_REGISTRATION_STATUS,
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER_NAME,
  LEGAL_ROUTES,
} from "~/lib/legal";
import {
  aaipDatabaseRegistrationStatusContent,
  type LegalDocumentContent,
} from "~/lib/legal-content";

export const LegalDocument = component$<{
  content: LegalDocumentContent;
  version: string;
  effectiveAt?: string;
  /** Moderación no trata datos personales: no muestra el registro AAIP. */
  showAaip?: boolean;
}>(({ content, version, effectiveAt, showAaip = true }) => {
  const locale = useLocale();
  const english = locale === "en";
  const aaipRegistration = aaipDatabaseRegistrationStatusContent[locale];
  const effectiveDate = (() => {
    const datePart = /^\d{4}-\d{2}-\d{2}/.exec(version)?.[0] ?? version;
    const parsed = new Date(effectiveAt ?? `${datePart}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return version;
    return new Intl.DateTimeFormat(english ? "en" : "es-AR", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(parsed);
  })();

  return (
    <article class="container-reading py-10 [overflow-wrap:anywhere]">
      <header class="mb-8">
        <p class="text-sm font-semibold text-brand">{APP_NAME}</p>
        <h1 class="mt-1 text-4xl font-semibold tracking-tight">
          {content.title}
        </h1>
        <p class="mt-3 text-lg text-ink-muted">{content.summary}</p>
        <p class="mt-3 text-xs text-ink-faint">
          {english ? "Version" : "Versión"} {version} ·{" "}
          {english ? "Effective" : "Vigente desde el"} {effectiveDate}
        </p>
      </header>

      <div class="space-y-5">
        {content.sections.map((section) => (
          <Card key={section.title} class="p-6">
            <h2 class="text-xl font-semibold tracking-tight">
              {section.title}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} class="mt-3 leading-7 text-ink-muted">
                {paragraph}
              </p>
            ))}
            {section.bullets && (
              <ul class="mt-3 list-disc space-y-2 pl-5 leading-7 text-ink-muted">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Card class="mt-6 p-6">
        <h2 class="text-lg font-semibold">
          {english ? "Controller contact" : "Contacto responsable"}
        </h2>
        <p class="mt-2 text-sm text-ink-muted">{LEGAL_CONTROLLER_NAME}</p>
        {/* El domicilio del responsable es su casa: no se publica (pedido del
            responsable, 21-11-2026). El contacto es el correo de abajo. */}
        {showAaip && (
          <p class="mt-1 text-sm text-ink-muted">
            {english ? "AAIP controller code" : "Código de responsable AAIP"}:{" "}
            {AAIP_CONTROLLER_ID}
          </p>
        )}
        {!showAaip ? null : AAIP_DATABASE_REGISTRATION_STATUS === "approved" ? (
          <p class="mt-1 text-sm text-ink-muted">
            {aaipRegistration.approvedLabel}: {AAIP_DATABASE_REGISTRATION_ID}
          </p>
        ) : (
          <p class="mt-1 text-sm leading-6 text-ink-muted">
            {aaipRegistration.pendingMessage}
          </p>
        )}
        <a
          class="mt-1 inline-flex min-h-11 items-center font-medium text-brand hover:underline"
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
      </Card>

      <nav
        class="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm"
        aria-label={english ? "Legal documents" : "Documentos legales"}
      >
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.dataDeletion}
        >
          {english ? "Delete account and data" : "Eliminar cuenta y datos"}
        </Link>
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.privacy}
        >
          {english ? "Privacy" : "Privacidad"}
        </Link>
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.terms}
        >
          {english ? "Terms" : "Términos"}
        </Link>
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.communityRules}
        >
          {english ? "Community rules" : "Normas comunitarias"}
        </Link>
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.moderation}
        >
          {english ? "Moderation and appeals" : "Moderación y apelaciones"}
        </Link>
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.subprocessors}
        >
          {english ? "Subprocessors" : "Subencargados"}
        </Link>
        <Link
          class="min-h-11 py-3 text-brand hover:underline"
          href={LEGAL_ROUTES.internationalTransfers}
        >
          {english
            ? "International transfers"
            : "Transferencias internacionales"}
        </Link>
      </nav>
    </article>
  );
});
