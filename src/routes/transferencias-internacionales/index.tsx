import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { LegalDocument } from "~/components/legal/LegalDocument";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import { INTERNATIONAL_TRANSFER_NOTICE_VERSION } from "~/lib/legal";
import { internationalTransferNoticeContent } from "~/lib/legal-content";

export default component$(() => {
  const locale = useLocale();
  return (
    <LegalDocument
      content={internationalTransferNoticeContent[locale]}
      version={INTERNATIONAL_TRANSFER_NOTICE_VERSION}
    />
  );
});

export const head: DocumentHead = {
  title: `Transferencias internacionales · ${APP_NAME}`,
  meta: [
    {
      name: "description",
      content:
        "Destinatarios, riesgos y consentimiento para transferencias internacionales de Agorbis.",
    },
  ],
};
