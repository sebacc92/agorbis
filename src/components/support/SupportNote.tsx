import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Icon } from "~/components/ui";
import { translate, useLocale } from "~/lib/i18n";

/**
 * Aviso de cómo se sostiene Agorbis, para la portada.
 *
 * "Apoyar" sólo estaba en el pie, donde casi nadie llega. Va junto a las
 * reglas porque es una de ellas: sin publicidad ni venta de datos. Recibe el
 * destino ya resuelto por `supportPageHref`; con `null` no muestra nada, igual
 * que el pie (D128).
 */
export const SupportNote = component$<{ href: string | null }>(({ href }) => {
  const locale = useLocale();
  if (!href) return null;

  return (
    <p class="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-relaxed text-ink-muted">
      <span>
        {translate(
          locale,
          "Agorbis no tiene publicidad ni vende datos. Se sostiene con el aporte voluntario de quienes lo usan.",
        )}
      </span>
      <Link
        href={href}
        class="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-medium text-brand hover:bg-muted hover:underline"
      >
        {translate(locale, "Apoyar a Agorbis")}
        <Icon name="arrow-right" />
      </Link>
    </p>
  );
});
