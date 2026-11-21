import { component$ } from "@qwik.dev/core";
import type { DocumentHead } from "@qwik.dev/router";
import { SupportContent } from "~/components/support/SupportContent";
import { APP_NAME } from "~/lib/constants";
import { translate } from "~/lib/i18n";
import { donationLink } from "~/lib/support";
import { useLocaleLoader } from "../layout";

/** Donaciones por enlace externo (D128). La página no lee ni guarda nada. */
export default component$(() => (
  <SupportContent donationHref={donationLink()} />
));

export const head: DocumentHead = ({ resolveValue }) => {
  const locale = resolveValue(useLocaleLoader);
  return {
    title: `${translate(locale, "Apoyar a Agorbis")} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Cómo se sostiene Agorbis y cómo hacer un aporte voluntario, que no da ningún beneficio dentro de la plataforma.",
        ),
      },
    ],
  };
};
