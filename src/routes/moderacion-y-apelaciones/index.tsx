import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { LegalDocument } from "~/components/legal/LegalDocument";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import { COMMUNITY_RULES_VERSION } from "~/lib/legal";
import { moderationContent } from "~/lib/legal-content";

export default component$(() => {
  const locale = useLocale();
  return (
    <LegalDocument
      showAaip={false}
      content={moderationContent[locale]}
      version={COMMUNITY_RULES_VERSION}
    />
  );
});

export const head: DocumentHead = {
  title: `Moderación y apelaciones · ${APP_NAME}`,
  meta: [
    {
      name: "description",
      content: "Proceso de moderación y apelaciones de Agorbis.",
    },
  ],
};
