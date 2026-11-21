import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { LegalDocument } from "~/components/legal/LegalDocument";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import { PRIVACY_VERSION } from "~/lib/legal";
import { privacyContent } from "~/lib/legal-content";

export default component$(() => {
  const locale = useLocale();
  return (
    <LegalDocument content={privacyContent[locale]} version={PRIVACY_VERSION} />
  );
});

export const head: DocumentHead = {
  title: `Política de privacidad · ${APP_NAME}`,
  meta: [
    { name: "description", content: "Política de privacidad de Agorbis." },
  ],
};
