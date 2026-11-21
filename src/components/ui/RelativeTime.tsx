import { component$ } from "@qwik.dev/core";
import { formatInstant, timeAgo } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";

/**
 * "hace 3 días", pero recuperable.
 *
 * El texto relativo se lee rápido y por eso está en todas las tarjetas, pero
 * solo no alcanza: no dice de cuándo estamos hablando y envejece mal en una
 * página cacheada. El `<time datetime>` deja la fecha exacta legible por
 * máquinas, el `title` la muestra al pasar el mouse y el `sr-only` se la da a
 * quien no puede pasar el mouse.
 */
export const RelativeTime = component$<{
  value: string;
  class?: string;
}>(({ value, class: cls }) => {
  const locale = useLocale();
  // `created_at` es un instante, no un día: se muestra en la zona de quien
  // mira, con hora. "hace 3 días" es igual en todo el mundo; "el 4 de abril a
  // las 21:00" no.
  const exact = formatInstant(value, locale, useTimeZone());
  return (
    <time dateTime={value} title={exact} class={cls}>
      {timeAgo(value, locale)}
      <span class="sr-only">
        {" "}
        ({translate(locale, "el {{date}}", { date: exact })})
      </span>
    </time>
  );
});
