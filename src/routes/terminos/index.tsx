import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { LegalDocument } from "~/components/legal/LegalDocument";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import { TERMS_VERSION } from "~/lib/legal";
import { termsContent } from "~/lib/legal-content";

export default component$(() => {
  const locale = useLocale();
  return (
    <LegalDocument content={termsContent[locale]} version={TERMS_VERSION} />
  );
});

export const head: DocumentHead = {
  title: `Términos de uso · ${APP_NAME}`,
  meta: [{ name: "description", content: "Términos de uso de Agorbis." }],
};
