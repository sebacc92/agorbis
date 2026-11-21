import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { LegalDocument } from "~/components/legal/LegalDocument";
import { Alert } from "~/components/ui";
import { readGoogleAuthNotice } from "~/lib/google-auth-consent";
import { createServerSupabase } from "~/lib/supabase";
import { translate, useLocale } from "~/lib/i18n";
import { APP_NAME } from "~/lib/constants";
import { useLocaleLoader } from "../layout";

export const useNotice = routeLoader$(async (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
  // An approved public notice remains readable when sign-in is switched off.
  const notice = await readGoogleAuthNotice(createServerSupabase(ev));
  const version = ev.url.searchParams.get("version");
  const hash = ev.url.searchParams.get("hash");
  if (
    notice &&
    ((version && version !== notice.version) ||
      (hash && hash !== notice.content_hash))
  )
    return { notice: null, changed: true };
  return { notice, changed: false };
});

export default component$(() => {
  const result = useNotice();
  const locale = useLocale();
  if (result.value.notice)
    return (
      <LegalDocument
        content={result.value.notice.content_snapshot[locale]}
        version={result.value.notice.version}
        effectiveAt={result.value.notice.effective_at}
      />
    );
  return (
    <div class="container-reading py-10">
      <h1 class="text-3xl font-semibold">
        {translate(locale, "Acceso opcional con Google")}
      </h1>
      <Alert class="mt-6">
        {translate(
          locale,
          result.value.changed
            ? "Este enlace corresponde a otra versión del aviso de Google. Leé el aviso vigente y recargá el formulario de acceso antes de continuar."
            : "El acceso con Google todavía no está disponible. Podés continuar por correo.",
        )}
      </Alert>
      {result.value.changed && (
        <Link
          href="/acceso-google"
          class="mt-5 mr-5 inline-flex min-h-11 items-center font-medium text-brand hover:underline"
        >
          {translate(locale, "Ver aviso vigente")}
        </Link>
      )}
      <Link
        href="/ingresar"
        class="mt-5 inline-flex min-h-11 items-center font-medium text-brand hover:underline"
      >
        {translate(locale, "Ingresar por correo")}
      </Link>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Acceso opcional con Google")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
