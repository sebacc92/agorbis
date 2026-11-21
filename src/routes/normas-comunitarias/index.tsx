import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { LegalDocument } from "~/components/legal/LegalDocument";
import { APP_NAME } from "~/lib/constants";
import { useLocale } from "~/lib/i18n";
import { COMMUNITY_RULES_VERSION } from "~/lib/legal";
import { communityRulesContent } from "~/lib/legal-content";

export default component$(() => {
  const locale = useLocale();
  return (
    <LegalDocument
      content={communityRulesContent[locale]}
      version={COMMUNITY_RULES_VERSION}
    />
  );
});

export const head: DocumentHead = {
  title: `Normas comunitarias · ${APP_NAME}`,
  meta: [{ name: "description", content: "Normas comunitarias de Agorbis." }],
};
