import { component$ } from "@qwik.dev/core";
import { Link, type DocumentHead } from "@qwik.dev/router";
import { Card } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import {
  INTERNATIONAL_TRANSFER_SAFEGUARDS,
  LEGAL_ROUTES,
  PROCESSOR_DISCLOSURES,
  PROVIDER_RETENTION_SUMMARY,
} from "~/lib/legal";
import { externalEvidenceStatusContent } from "~/lib/legal-content";

export default component$(() => {
  const locale = useLocale();
  const english = locale === "en";
  const evidenceCopy = externalEvidenceStatusContent[locale];
  const hasPendingEvidence =
    PROCESSOR_DISCLOSURES.some(
      ({ processingLocationStatus }) => processingLocationStatus === "pending",
    ) ||
    INTERNATIONAL_TRANSFER_SAFEGUARDS.status === "pending" ||
    PROVIDER_RETENTION_SUMMARY.status === "pending";

  return (
    <main class="container-reading py-10">
      <p class="text-sm font-semibold text-brand">{APP_NAME}</p>
      <h1 class="mt-1 text-4xl font-semibold tracking-tight">
        {english
          ? "Subprocessors and transfers"
          : "Subencargados y transferencias"}
      </h1>
      <p class="mt-3 text-lg leading-7 text-ink-muted">
        {hasPendingEvidence
          ? evidenceCopy.registerSummaryPending
          : english
            ? "This register identifies the providers that process personal data to operate Agorbis, their role, and the configured processing destinations."
            : "Este registro identifica a los proveedores que tratan datos personales para operar Agorbis, su función y los destinos de tratamiento configurados."}
      </p>

      {hasPendingEvidence && (
        <p class="mt-4 rounded-2xl border border-warn-500/40 bg-warn-100 p-4 text-sm leading-6 text-warn-700 dark:bg-warn-950/30 dark:text-warn-400">
          {evidenceCopy.registerWarning}
        </p>
      )}

      <div class="mt-8 space-y-4">
        {PROCESSOR_DISCLOSURES.map((processor) => (
          <Card key={processor.name} class="p-6">
            <h2 class="text-xl font-semibold">{processor.name}</h2>
            <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt class="font-medium text-ink-strong">
                {english ? "Purpose" : "Función"}
              </dt>
              <dd class="text-ink-muted">
                {english ? processor.purposeEn : processor.purposeEs}
              </dd>
              <dt class="font-medium text-ink-strong">
                {english ? "Processing location" : "Lugar de tratamiento"}
              </dt>
              <dd class="text-ink-muted">
                {processor.processingLocationStatus === "confirmed"
                  ? english
                    ? processor.processingLocationEn
                    : processor.processingLocationEs
                  : evidenceCopy.processingLocationPending}
                {processor.processingLocationStatus === "pending" && (
                  <span class="mt-1 block text-xs font-semibold text-warn-700 dark:text-warn-400">
                    {evidenceCopy.pendingLabel}
                  </span>
                )}
              </dd>
            </dl>
          </Card>
        ))}
      </div>

      <Card class="mt-5 p-6">
        <h2 class="text-xl font-semibold">
          {english ? "Transfer safeguards" : "Salvaguardas de transferencia"}
        </h2>
        <p class="mt-3 leading-7 text-ink-muted">
          {INTERNATIONAL_TRANSFER_SAFEGUARDS.status === "confirmed"
            ? english
              ? INTERNATIONAL_TRANSFER_SAFEGUARDS.en
              : INTERNATIONAL_TRANSFER_SAFEGUARDS.es
            : evidenceCopy.transferSafeguardsPending}
        </p>
        {INTERNATIONAL_TRANSFER_SAFEGUARDS.status === "pending" && (
          <p class="mt-1 text-xs font-semibold text-warn-700 dark:text-warn-400">
            {evidenceCopy.pendingLabel}
          </p>
        )}
      </Card>

      <Card class="mt-5 p-6">
        <h2 class="text-xl font-semibold">
          {english ? "Provider retention" : "Retención de proveedores"}
        </h2>
        <p class="mt-3 leading-7 text-ink-muted">
          {PROVIDER_RETENTION_SUMMARY.status === "confirmed"
            ? english
              ? PROVIDER_RETENTION_SUMMARY.en
              : PROVIDER_RETENTION_SUMMARY.es
            : evidenceCopy.providerRetentionPending}
        </p>
        {PROVIDER_RETENTION_SUMMARY.status === "pending" && (
          <p class="mt-1 text-xs font-semibold text-warn-700 dark:text-warn-400">
            {evidenceCopy.pendingLabel}
          </p>
        )}
      </Card>

      <p class="mt-7 text-sm leading-6 text-ink-muted">
        {english
          ? "No advertising or analytics providers are enabled. A new provider that materially changes processing is documented here and reflected in the privacy version when required."
          : "No hay proveedores de publicidad ni analítica habilitados. Todo proveedor nuevo que cambie materialmente el tratamiento se documenta acá y se refleja en la versión de privacidad cuando corresponda."}
      </p>

      <Link
        href={LEGAL_ROUTES.privacy}
        class="mt-5 inline-flex min-h-11 items-center font-medium text-brand hover:underline"
      >
        {english
          ? "Back to the privacy policy"
          : "Volver a la política de privacidad"}
      </Link>
    </main>
  );
});

export const head: DocumentHead = {
  title: `Subencargados y transferencias · ${APP_NAME}`,
  meta: [
    {
      name: "description",
      content:
        "Proveedores, destinos y salvaguardas de transferencias internacionales de Agorbis.",
    },
  ],
};
